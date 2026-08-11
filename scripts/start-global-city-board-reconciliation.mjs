#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { GLOBAL_CITY_BOARD_TEMPLATES } = require('../functions/lib/global-city-board-templates.js');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const shouldStart = process.argv.includes('--start');
admin.initializeApp({ projectId });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const [atlasSnapshot, boardSnapshot, suppressionSnapshot] = await Promise.all([
  db.collection('atlases').where('is_public', '==', true).get(),
  db.collection('boards').where('origin', '==', 'bulk_generator').get(),
  db.collection('board_generation_suppressions').get(),
]);
const cities = atlasSnapshot.docs.flatMap((snapshot) => {
  const atlas = snapshot.data();
  const config = atlas.city_config || {};
  return config.enabled === true ? [{ snapshot, atlas, config }] : [];
});
const existingKeys = new Set(boardSnapshot.docs.flatMap((snapshot) => {
  const board = snapshot.data();
  return board.generation_key && !board.deleted_at ? [String(board.generation_key)] : [];
}));
const suppressedKeys = new Set(suppressionSnapshot.docs.flatMap((snapshot) => {
  const suppression = snapshot.data();
  return suppression.generation_key && suppression.active !== false ? [String(suppression.generation_key)] : [];
}));
const items = cities.flatMap(({ snapshot, atlas, config }) => GLOBAL_CITY_BOARD_TEMPLATES.flatMap((template) => {
  const generationKey = `${snapshot.id}__${template.id}__${template.version}`;
  if (existingKeys.has(generationKey) || suppressedKeys.has(generationKey)) return [];
  return [{
    atlasId: snapshot.id,
    cityName: config.city_name || atlas.name || '',
    regionName: config.region_name || '',
    generationKey,
    template,
  }];
}));
const byBucket = Object.fromEntries(GLOBAL_CITY_BOARD_TEMPLATES.map((template) => [
  template.id,
  items.filter((item) => item.template.id === template.id).length,
]));
const preflight = {
  projectId,
  dryRun: !shouldStart,
  cityCount: cities.length,
  bucketCount: GLOBAL_CITY_BOARD_TEMPLATES.length,
  expectedCount: cities.length * GLOBAL_CITY_BOARD_TEMPLATES.length,
  existingCount: existingKeys.size,
  suppressedCount: suppressedKeys.size,
  readyCount: items.length,
  byBucket,
};
if (!shouldStart || items.length === 0) {
  console.log(JSON.stringify(preflight, null, 2));
  process.exit(0);
}

const jobRef = db.collection('board_generation_jobs').doc();
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
    template: {
      id: 'global-city-board-catalog',
      version: '1.0',
      titlePattern: 'Seven global buckets × all cities',
      searchQuery: 'catalog reconciliation',
      editorialBrief: 'Canonical global city-board catalog reconciliation.',
      count: 10,
      cardTitleMode: 'place',
    },
    catalog_mode: true,
    catalog_bucket_ids: GLOBAL_CITY_BOARD_TEMPLATES.map((template) => template.id),
    rubric_version: '1.0',
    generator_version: '1.1.0',
    status: 'running',
    cancel_requested: false,
    total_count: items.length,
    completed_count: 0,
    success_count: 0,
    failed_count: 0,
    skipped_count: 0,
    cancelled_count: 0,
    city_ids: cities.map(({ snapshot }) => snapshot.id),
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  transaction.set(lockRef, {
    job_id: jobRef.id,
    acquired_by_user_id: 'livingwiki-system',
    acquired_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
});

try {
  for (let offset = 0; offset < items.length; offset += 350) {
    const batch = db.batch();
    for (const item of items.slice(offset, offset + 350)) {
      const itemId = `${jobRef.id}__${createHash('sha256').update(item.generationKey).digest('hex').slice(0, 28)}`;
      batch.set(db.collection('board_generation_items').doc(itemId), {
        job_id: jobRef.id,
        atlas_id: item.atlasId,
        city_name: item.cityName,
        region_name: item.regionName,
        template_id: item.template.id,
        template_version: item.template.version,
        template: item.template,
        generation_key: item.generationKey,
        status: 'queued',
        attempt_count: 0,
        board_id: '',
        error_code: '',
        error_message: '',
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
} catch (error) {
  await jobRef.set({
    status: 'cancelled',
    cancel_requested: true,
    setup_error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
    completed_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  throw error;
}

await db.collection('board_generation_audit').add({
  action: 'global_catalog_reconciliation_started',
  job_id: jobRef.id,
  actor_user_id: 'livingwiki-system',
  city_count: cities.length,
  bucket_count: GLOBAL_CITY_BOARD_TEMPLATES.length,
  queued_count: items.length,
  existing_count: existingKeys.size,
  suppressed_count: suppressedKeys.size,
  created_at: FieldValue.serverTimestamp(),
});
console.log(JSON.stringify({ ...preflight, dryRun: false, jobId: jobRef.id }, null, 2));
process.exit(0);
