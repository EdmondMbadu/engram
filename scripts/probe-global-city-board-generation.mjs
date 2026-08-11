#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
admin.initializeApp({ projectId });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const template = {
  id: 'global-where-locals-linger',
  version: '1.0',
  titlePattern: 'Where Locals Linger: {count} Places to Sit for Hours',
  searchQuery: 'cafes libraries parks plazas third places',
  editorialBrief: 'Treat this as a third-places board. Explain the observable setup that makes lingering possible: seating, pace, shade, tables, public access, or a steady room. Do not assert that staff tolerate hours-long stays unless a source supports it. No cozy, charming, or perfect-for filler.',
  count: 10,
  cardTitleMode: 'place',
};

const atlasSnapshot = await db.collection('atlases').where('is_public', '==', true).get();
const cities = atlasSnapshot.docs.flatMap((snapshot) => {
  const atlas = snapshot.data();
  const config = atlas.city_config || {};
  return config.enabled === true ? [{ snapshot, atlas, config }] : [];
});
const preferred = cities.find(({ config }) => String(config.city_name || '').toLowerCase() === 'philadelphia');
const ordered = preferred ? [preferred, ...cities.filter(({ snapshot }) => snapshot.id !== preferred.snapshot.id)] : cities;
let target = null;
for (const city of ordered) {
  const generationKey = `${city.snapshot.id}__${template.id}__${template.version}`;
  const boardId = `bulk_${createHash('sha256').update(generationKey).digest('hex').slice(0, 28)}`;
  const board = await db.collection('boards').doc(boardId).get();
  if (!board.exists || board.data()?.deleted_at) {
    target = { ...city, generationKey, boardId };
    break;
  }
}
if (!target) {
  console.log(JSON.stringify({ ok: true, skipped: true, message: 'No missing probe target.' }));
  process.exit(0);
}

const jobRef = db.collection('board_generation_jobs').doc();
const itemId = `${jobRef.id}__${createHash('sha256').update(target.generationKey).digest('hex').slice(0, 28)}`;
await db.runTransaction(async (transaction) => {
  const lockRef = db.collection('board_generation_locks').doc('active');
  const lock = await transaction.get(lockRef);
  const lockedJobId = String(lock.data()?.job_id || '');
  if (lockedJobId) {
    const lockedJob = await transaction.get(db.collection('board_generation_jobs').doc(lockedJobId));
    if (lockedJob.data()?.status === 'running') throw new Error(`A generation job is already active: ${lockedJobId}`);
  }
  transaction.set(jobRef, {
    requested_by_user_id: 'livingwiki-system',
    template,
    probe_mode: true,
    rubric_version: '1.0',
    generator_version: '1.1.0',
    status: 'running',
    cancel_requested: false,
    total_count: 1,
    completed_count: 0,
    success_count: 0,
    failed_count: 0,
    skipped_count: 0,
    cancelled_count: 0,
    city_ids: [target.snapshot.id],
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  transaction.set(lockRef, {
    job_id: jobRef.id,
    acquired_by_user_id: 'livingwiki-system',
    acquired_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  transaction.set(db.collection('board_generation_items').doc(itemId), {
    job_id: jobRef.id,
    atlas_id: target.snapshot.id,
    city_name: target.config.city_name || target.atlas.name || '',
    region_name: target.config.region_name || '',
    template_id: template.id,
    template_version: template.version,
    template,
    generation_key: target.generationKey,
    status: 'queued',
    attempt_count: 0,
    board_id: '',
    error_code: '',
    error_message: '',
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
});

console.log(JSON.stringify({
  ok: true,
  projectId,
  jobId: jobRef.id,
  itemId,
  city: target.config.city_name || target.atlas.name || '',
  atlasId: target.snapshot.id,
  bucket: template.id,
  expectedBoardId: target.boardId,
}));
process.exit(0);
