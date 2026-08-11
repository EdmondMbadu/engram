#!/usr/bin/env node

import { createRequire } from 'node:module';

const jobId = String(process.argv[2] || '').trim();
const cityNames = new Set(process.argv.slice(3).map((value) => value.trim().toLowerCase()).filter(Boolean));
if (!jobId || !cityNames.size) {
  throw new Error('Usage: node scripts/prioritize-global-city-board-items.mjs <job-id> <city names...>');
}
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a' });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const itemSnapshot = await db.collection('board_generation_items').where('job_id', '==', jobId).get();
const items = itemSnapshot.docs.filter((document) => {
  const item = document.data();
  return item.status === 'queued' && cityNames.has(String(item.city_name || '').toLowerCase());
});
if (items.length) {
  const pendingBatch = db.batch();
  items.forEach((document) => pendingBatch.update(document.ref, {
    status: 'priority_pending',
    updated_at: FieldValue.serverTimestamp(),
  }));
  await pendingBatch.commit();
  const queuedBatch = db.batch();
  items.forEach((document) => queuedBatch.update(document.ref, {
    status: 'queued',
    updated_at: FieldValue.serverTimestamp(),
  }));
  await queuedBatch.commit();
}
console.log(JSON.stringify({
  jobId,
  prioritizedCount: items.length,
  items: items.map((document) => {
    const item = document.data();
    return { id: document.id, city: item.city_name || '', bucket: item.template_id || '' };
  }),
}, null, 2));
process.exit(0);
