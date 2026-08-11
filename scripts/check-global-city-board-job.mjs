#!/usr/bin/env node

import { createRequire } from 'node:module';

const jobId = String(process.argv[2] || '').trim();
if (!jobId) throw new Error('Usage: node scripts/check-global-city-board-job.mjs <job-id>');
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
admin.initializeApp({ projectId });
const db = admin.firestore();

const [jobSnapshot, itemSnapshot, boardSnapshot, candidateSnapshot] = await Promise.all([
  db.collection('board_generation_jobs').doc(jobId).get(),
  db.collection('board_generation_items').where('job_id', '==', jobId).get(),
  db.collection('boards').where('generation_job_id', '==', jobId).get(),
  db.collection('bulk_board_candidate_sets').get(),
]);
if (!jobSnapshot.exists) throw new Error(`Job not found: ${jobId}`);
const job = jobSnapshot.data();
const items = itemSnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
const statuses = items.reduce((counts, item) => {
  const status = item.status || 'unknown';
  counts[status] = (counts[status] || 0) + 1;
  return counts;
}, {});
const failures = items.filter((item) => item.status === 'failed');
const failureGroups = failures.reduce((groups, item) => {
  const message = String(item.error_message || 'Unknown failure')
    .replace(/\b[0-9a-f]{20,}\b/gi, '<id>')
    .replace(/\d+/g, '#');
  const key = `${item.error_code || 'unknown'}|${message}`;
  const group = groups.get(key) || { errorCode: item.error_code || 'unknown', message, count: 0, examples: [] };
  group.count += 1;
  if (group.examples.length < 5) group.examples.push(`${item.city_name || ''} · ${item.template_id || ''}`);
  groups.set(key, group);
  return groups;
}, new Map());
const createdMs = job.created_at?.toMillis?.() || Date.now();
const elapsedMinutes = Math.max(0.01, (Date.now() - createdMs) / 60_000);
const completed = Number(job.completed_count) || 0;
const total = Number(job.total_count) || items.length;
const ratePerMinute = completed / elapsedMinutes;
const remainingMinutes = ratePerMinute > 0 ? Math.round((total - completed) / ratePerMinute) : null;
console.log(JSON.stringify({
  projectId,
  jobId,
  status: job.status,
  autoPublish: job.auto_publish === true,
  catalogMode: job.catalog_mode === true,
  progress: `${completed}/${total}`,
  progressPercent: total ? Number((completed / total * 100).toFixed(1)) : 0,
  successCount: Number(job.success_count) || 0,
  failedCount: Number(job.failed_count) || 0,
  skippedCount: Number(job.skipped_count) || 0,
  statuses,
  generatedBoardDocuments: boardSnapshot.size,
  cachedCandidateSets: candidateSnapshot.size,
  elapsedMinutes: Number(elapsedMinutes.toFixed(1)),
  estimatedRemainingMinutes: remainingMinutes,
  failureGroups: [...failureGroups.values()].sort((left, right) => right.count - left.count),
}, null, 2));
process.exit(0);
