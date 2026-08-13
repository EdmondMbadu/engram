#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const requestedJobId = valueAfter('--job');

admin.initializeApp({ projectId });
const db = admin.firestore();
let jobId = requestedJobId;
if (!jobId) {
  const snapshot = await db.collection('board_generation_jobs').orderBy('created_at', 'desc').limit(100).get();
  jobId = snapshot.docs.find((document) => {
    const job = document.data();
    return job.target_kind === 'university' && job.catalog_mode === true
      && job.status === 'running' && job.cancel_requested !== true;
  })?.id || '';
}
await admin.app().delete();
if (!jobId) throw new Error('No active university catalog job found. Pass --job JOB_ID.');

const childArgs = [
  'scripts/run-university-board-set-worker.mjs',
  '--job', jobId,
  '--school-limit', valueAfter('--school-limit') || '500',
  '--university-concurrency', valueAfter('--university-concurrency') || '12',
  '--template-concurrency', valueAfter('--template-concurrency') || '7',
  '--board-concurrency', valueAfter('--board-concurrency') || '84',
  '--generation-timeout-minutes', valueAfter('--generation-timeout-minutes') || '4',
  '--codex-model', valueAfter('--codex-model') || 'gpt-5.6-terra',
  '--codex-reasoning-effort', valueAfter('--codex-reasoning-effort') || 'low',
  '--retry-failed',
  '--apply',
];
const child = spawn(process.execPath, childArgs, {
  cwd: process.cwd(), stdio: 'inherit',
  env: { ...process.env, OPENAI_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '' },
});
child.on('error', (error) => {
  throw error;
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code || 0;
});
