#!/usr/bin/env node

import { createRequire } from 'node:module';

const jobId = String(process.argv[2] || '').trim();
if (!jobId) throw new Error('Usage: node scripts/enable-global-catalog-autopublish.mjs <job-id> [priority city names...]');
const priorityNames = new Set(process.argv.slice(3).map((value) => value.trim().toLowerCase()).filter(Boolean));
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { GLOBAL_CITY_BOARD_TEMPLATE_IDS } = require('../functions/lib/global-city-board-templates.js');
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a' });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const jobRef = db.collection('board_generation_jobs').doc(jobId);
const jobSnapshot = await jobRef.get();
if (!jobSnapshot.exists || jobSnapshot.data()?.catalog_mode !== true) {
  throw new Error('The requested job is not a global catalog reconciliation.');
}
await jobRef.set({ auto_publish: true, updated_at: FieldValue.serverTimestamp() }, { merge: true });

const boardSnapshot = await db.collection('boards').where('origin', '==', 'bulk_generator').get();
const publishable = boardSnapshot.docs.filter((document) => {
  const board = document.data();
  if (!GLOBAL_CITY_BOARD_TEMPLATE_IDS.includes(board.template_id) || board.deleted_at) return false;
  if (board.visibility === 'public' && board.editorial_status === 'published' && board.city_listing_status === 'listed') return false;
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const validation = board.validation_summary || {};
  return cards.length === 10
    && Number(validation.requested_count) === 10
    && Number(validation.verified_count) === 10
    && Number(validation.unique_place_ids) === 10
    && validation.all_have_coordinates === true
    && board.atlas_id
    && board.atlas_id === board.generated_for_atlas_id;
});
for (let offset = 0; offset < publishable.length; offset += 350) {
  const batch = db.batch();
  for (const document of publishable.slice(offset, offset + 350)) {
    batch.update(document.ref, {
      visibility: 'public',
      editorial_status: 'published',
      city_listing_status: 'listed',
      approved_by_user_id: 'livingwiki-system',
      approved_at: FieldValue.serverTimestamp(),
      updated_at_iso: new Date().toISOString(),
      server_updated_at: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

let prioritized = [];
if (priorityNames.size) {
  const itemSnapshot = await db.collection('board_generation_items').where('job_id', '==', jobId).get();
  prioritized = itemSnapshot.docs.filter((document) => {
    const item = document.data();
    return item.status === 'queued' && priorityNames.has(String(item.city_name || '').toLowerCase());
  });
  if (prioritized.length) {
    const pendingBatch = db.batch();
    prioritized.forEach((document) => pendingBatch.update(document.ref, {
      status: 'priority_pending',
      updated_at: FieldValue.serverTimestamp(),
    }));
    await pendingBatch.commit();
    const queuedBatch = db.batch();
    prioritized.forEach((document) => queuedBatch.update(document.ref, {
      status: 'queued',
      updated_at: FieldValue.serverTimestamp(),
    }));
    await queuedBatch.commit();
  }
}

await db.collection('board_generation_audit').add({
  action: 'global_catalog_auto_publish_enabled',
  job_id: jobId,
  published_existing_count: publishable.length,
  prioritized_item_count: prioritized.length,
  priority_cities: [...priorityNames],
  actor_user_id: 'livingwiki-system',
  created_at: FieldValue.serverTimestamp(),
});
console.log(JSON.stringify({
  jobId,
  autoPublish: true,
  publishedExistingCount: publishable.length,
  prioritizedItemCount: prioritized.length,
  priorityCities: [...priorityNames],
}, null, 2));
process.exit(0);
