#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const jobId = valueAfter('--job');
if (!jobId) throw new Error('Pass --job JOB_ID.');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const clean = (value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

admin.initializeApp({ projectId });
const db = admin.firestore();
const snapshot = await db.collection('boards').where('generation_job_id', '==', jobId).get();
const boards = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
const failures = [];
for (const board of boards) {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const summary = board.validation_summary || {};
  const fingerprints = new Set(cards.map((card) => clean(card?.imageFingerprint)).filter(Boolean));
  const limitedReuse = clean(summary.image_validation_mode)
    === 'exact_or_related_university_location_with_limited_reuse_and_provenance';
  const problems = [];
  if (cards.length !== 10) problems.push(`cards=${cards.length}`);
  if (!cards.every((card) => card?.under21Safe === true)) problems.push('under21');
  if (!cards.every((card) => /^https:\/\//i.test(clean(card?.sourceUrl)))) problems.push('sources');
  if (!cards.every((card) => clean(card?.imageUrl) && clean(card?.imageSourceUrl) && clean(card?.imageFingerprint))) problems.push('images');
  if (fingerprints.size !== cards.length && !(limitedReuse && fingerprints.size >= 7)) problems.push(`diversity=${fingerprints.size}`);
  if (summary.all_have_images !== true || Number(summary.image_count) !== 10) problems.push('image-summary');
  if (!Number.isFinite(Number(board.generation_score)) || Number(board.generation_score) < 70) problems.push(`score=${board.generation_score}`);
  if (problems.length) failures.push({ boardId: board.id, atlasId: clean(board.atlas_id), templateId: clean(board.template_id), problems });
}
const scores = boards.map((board) => Number(board.generation_score)).filter(Number.isFinite);
process.stdout.write(`${JSON.stringify({
  ok: failures.length === 0,
  jobId,
  boardCount: boards.length,
  universityCount: new Set(boards.map((board) => clean(board.atlas_id))).size,
  cardCount: boards.reduce((sum, board) => sum + (Array.isArray(board.cards) ? board.cards.length : 0), 0),
  score: scores.length ? {
    minimum: Math.min(...scores), maximum: Math.max(...scores),
    average: Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10,
  } : null,
  allHaveTenImages: boards.every((board) => board.validation_summary?.all_have_images === true
    && Number(board.validation_summary?.image_count) === 10),
  allUnder21Safe: boards.every((board) => board.cards?.every((card) => card.under21Safe === true)),
  failures: failures.slice(0, 30),
}, null, 2)}\n`);
await admin.app().delete();
