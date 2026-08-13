#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { GLOBAL_UNIVERSITY_BOARD_TEMPLATES } = require('../functions/lib/global-university-board-templates.js');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const resumeJobId = valueAfter('--resume-job');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const clean = (value) => typeof value === 'string' ? value.trim() : '';
const generationKey = (atlasId, template) => `${atlasId}__${template.id}__${template.version}`;
const hash = (value, length = 28) => createHash('sha256').update(String(value)).digest('hex').slice(0, length);
const templateInput = (template) => ({
  id: template.id, version: template.version, titlePattern: template.titlePattern,
  searchQuery: template.researchQueries.join(' '), editorialBrief: template.editorialBrief,
  count: template.count, cardTitleMode: 'subject', icon: template.icon,
  primarySubjectType: template.primarySubjectType, allowedSubjectTypes: [...template.allowedSubjectTypes],
  freshnessDays: template.freshnessDays,
});

function targetFrom(document) {
  const atlas = document.data();
  const config = atlas.university_config && typeof atlas.university_config === 'object' ? atlas.university_config : {};
  if (atlas.is_public !== true || config.enabled !== true || atlas.wiki_type !== 'university') return null;
  const name = clean(config.official_name) || clean(atlas.name);
  const townName = clean(config.city);
  const state = clean(config.state).toUpperCase();
  if (!name || !townName || !state) return null;
  const shortName = name.replace(/-Main Campus$/i, '').replace(/ in the City of [A-Z][\w .'-]+$/i, '').trim() || name;
  const latitude = Number(config.latitude);
  const longitude = Number(config.longitude);
  return {
    id: document.id, name, shortName, townName, state,
    countryCode: clean(config.country_code).toUpperCase() || 'US', slug: clean(atlas.slug),
    unitId: clean(config.unit_id), website: clean(config.website),
    latitude: Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? latitude : null,
    longitude: Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? longitude : null,
  };
}

admin.initializeApp({ projectId });
const db = admin.firestore();
const { FieldValue } = admin.firestore;
const [atlasSnapshot, boardSnapshot, suppressionSnapshot] = await Promise.all([
  db.collection('atlases').where('is_public', '==', true).get(),
  db.collection('boards').where('origin', '==', 'bulk_generator').get(),
  db.collection('board_generation_suppressions').get(),
]);
const targets = atlasSnapshot.docs.map(targetFrom).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
const targetIds = new Set(targets.map((target) => target.id));
const existingKeys = new Set(boardSnapshot.docs.flatMap((document) => {
  const board = document.data();
  const key = clean(board.generation_key);
  return key && !board.deleted_at && (board.target_kind === 'university' || targetIds.has(clean(board.atlas_id))) ? [key] : [];
}));
const expectedKeys = new Set(targets.flatMap((target) => GLOBAL_UNIVERSITY_BOARD_TEMPLATES.map((template) => generationKey(target.id, template))));
const suppressedKeys = new Set(suppressionSnapshot.docs.flatMap((document) => {
  const suppression = document.data();
  const key = clean(suppression.generation_key);
  return key && expectedKeys.has(key) && suppression.active !== false ? [key] : [];
}));
const items = targets.flatMap((target) => GLOBAL_UNIVERSITY_BOARD_TEMPLATES.flatMap((template) => {
  const key = generationKey(target.id, template);
  return existingKeys.has(key) || suppressedKeys.has(key) ? [] : [{ target, template, key }];
}));
const preview = {
  targetCount: targets.length, bucketCount: GLOBAL_UNIVERSITY_BOARD_TEMPLATES.length,
  expectedCount: expectedKeys.size, existingCount: expectedKeys.size - items.length - suppressedKeys.size,
  suppressedCount: suppressedKeys.size, readyCount: items.length,
};
if (!apply || !items.length) {
  process.stdout.write(`${JSON.stringify({ ok: true, applied: false, ...preview }, null, 2)}\n`);
  await admin.app().delete();
  process.exit(0);
}

const jobRef = resumeJobId
  ? db.collection('board_generation_jobs').doc(resumeJobId)
  : db.collection('board_generation_jobs').doc();
const lockId = 'university_codex_local';
if (resumeJobId) {
  const [jobSnapshot, lockSnapshot] = await Promise.all([
    jobRef.get(), db.collection('board_generation_locks').doc(lockId).get(),
  ]);
  const job = jobSnapshot.data();
  if (!jobSnapshot.exists || job?.target_kind !== 'university' || job?.catalog_mode !== true
    || job?.status !== 'running' || clean(lockSnapshot.data()?.job_id) !== resumeJobId) {
    throw new Error('The requested university catalog job is not an active resumable setup.');
  }
} else await db.runTransaction(async (transaction) => {
  const lockRef = db.collection('board_generation_locks').doc(lockId);
  const lockSnapshot = await transaction.get(lockRef);
  const lockedJobId = clean(lockSnapshot.data()?.job_id);
  if (lockedJobId) {
    const lockedJob = await transaction.get(db.collection('board_generation_jobs').doc(lockedJobId));
    if (lockedJob.data()?.status === 'running' && lockedJob.data()?.cancel_requested !== true) {
      throw new Error(`University generation job ${lockedJobId} is already running.`);
    }
  }
  transaction.set(jobRef, {
    requested_by_user_id: 'livingwiki-system', target_kind: 'university', generation_engine: 'codex_local',
    lock_id: lockId, catalog_mode: true,
    catalog_bucket_ids: GLOBAL_UNIVERSITY_BOARD_TEMPLATES.map((template) => template.id),
    template: { id: 'global-university-board-catalog', version: '1.0', titlePattern: 'Seven global buckets × all universities' },
    rubric_version: 'university-1.0', score_rubric_version: '1.0', generator_version: 'codex-university-1.0.0',
    status: 'running', worker_status: 'waiting_for_codex', cancel_requested: false,
    total_count: items.length, completed_count: 0, success_count: 0, failed_count: 0,
    skipped_count: 0, cancelled_count: 0, atlas_ids: targets.map((target) => target.id),
    created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(),
  });
  transaction.set(lockRef, {
    job_id: jobRef.id, target_kind: 'university', generation_engine: 'codex_local',
    acquired_by_user_id: 'livingwiki-system', acquired_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(),
  });
});

try {
  const existingItemSnapshot = resumeJobId
    ? await db.collection('board_generation_items').where('job_id', '==', resumeJobId).get()
    : { docs: [] };
  const existingItemIds = new Set(existingItemSnapshot.docs.map((document) => document.id));
  const queueItems = items.filter((item) => !existingItemIds.has(`${jobRef.id}__${hash(item.key)}`));
  for (let offset = 0; offset < queueItems.length; offset += 450) {
    const batch = db.batch();
    for (const item of queueItems.slice(offset, offset + 450)) {
      const itemId = `${jobRef.id}__${hash(item.key)}`;
      batch.set(db.collection('board_generation_items').doc(itemId), {
        job_id: jobRef.id, atlas_id: item.target.id, target_kind: 'university', generation_engine: 'codex_local',
        target_name: item.target.shortName, city_name: item.target.shortName, school_name: item.target.name,
        short_school_name: item.target.shortName, town_name: item.target.townName,
        region_name: `${item.target.townName}, ${item.target.state}`, state: item.target.state,
        country_code: item.target.countryCode, unit_id: item.target.unitId, website: item.target.website,
        latitude: item.target.latitude, longitude: item.target.longitude,
        template_id: item.template.id, template_version: item.template.version, template: templateInput(item.template),
        generation_key: item.key, status: 'queued', attempt_count: 0, board_id: '', error_code: '', error_message: '',
        created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  await jobRef.set({
    total_count: items.length,
    queue_setup_complete: true,
    queued_item_count: items.length,
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection('board_generation_audit').add({
    action: 'global_university_catalog_reconciliation_started', job_id: jobRef.id,
    actor_user_id: 'livingwiki-system', target_kind: 'university', generation_engine: 'codex_local',
    university_count: targets.length, bucket_count: GLOBAL_UNIVERSITY_BOARD_TEMPLATES.length,
    queued_count: items.length, queued_now_count: queueItems.length,
    existing_count: preview.existingCount, suppressed_count: suppressedKeys.size,
    image_gate: '10_distinct_validated_images_required', created_at: FieldValue.serverTimestamp(),
  });
} catch (error) {
  await jobRef.set({ status: 'cancelled', cancel_requested: true, worker_status: 'setup_failed',
    setup_error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
    completed_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() }, { merge: true });
  throw error;
}

process.stdout.write(`${JSON.stringify({ ok: true, applied: true, resumed: !!resumeJobId, jobId: jobRef.id, ...preview }, null, 2)}\n`);
await admin.app().delete();
