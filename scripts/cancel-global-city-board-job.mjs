#!/usr/bin/env node

import { createRequire } from 'node:module';

const [jobId, flag] = process.argv.slice(2);
if (!jobId) throw new Error('Usage: node scripts/cancel-global-city-board-job.mjs <job-id> [--apply]');
const apply = flag === '--apply';
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a' });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const jobRef = db.collection('board_generation_jobs').doc(jobId);
const snapshot = await jobRef.get();
if (!snapshot.exists) throw new Error(`Job not found: ${jobId}`);
const job = snapshot.data();
if (job.catalog_mode !== true) throw new Error('Refusing to cancel a non-catalog job.');
if (job.status !== 'running') throw new Error(`Job is not running; current status is ${job.status}.`);

const itemSnapshot = await db.collection('board_generation_items').where('job_id', '==', jobId).get();
const counts = itemSnapshot.docs.reduce((result, document) => {
  const status = String(document.data().status || 'unknown');
  result[status] = (result[status] || 0) + 1;
  return result;
}, {});
const output = { jobId, apply, currentStatus: job.status, counts };

if (apply) {
  const batch = db.batch();
  batch.update(jobRef, {
    cancel_requested: true,
    cancellation_reason: 'Gemini prepaid credits depleted during catalog reconciliation.',
    updated_at: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection('board_generation_audit').doc(), {
    action: 'global_catalog_cancel_requested',
    job_id: jobId,
    reason: 'Gemini prepaid credits depleted; stopped remaining work to avoid unnecessary provider calls.',
    actor_user_id: 'livingwiki-system',
    queued_count: Number(counts.queued) || 0,
    running_count: Number(counts.running) || 0,
    created_at: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
