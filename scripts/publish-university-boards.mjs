#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const atlasId = valueAfter('--atlas');
const apply = args.includes('--apply');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
if (!atlasId) throw new Error('Pass --atlas ATLAS_ID.');

admin.initializeApp({ projectId });
const db = admin.firestore();
const { FieldValue } = admin.firestore;
const snapshot = await db.collection('boards').where('atlas_id', '==', atlasId).get();
const boards = snapshot.docs
  .map((document) => ({ document, board: document.data() }))
  .filter(({ board }) => board.target_kind === 'university' && board.origin === 'bulk_generator' && !board.deleted_at);
const failures = [];

for (const { document, board } of boards) {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const summary = board.validation_summary && typeof board.validation_summary === 'object' ? board.validation_summary : {};
  const fingerprints = new Set(cards.map((card) => String(card.imageFingerprint || '').trim()).filter(Boolean));
  const fail = (message) => failures.push({ boardId: document.id, title: board.title, message });
  if (cards.length !== 10) fail('University boards must contain exactly 10 cards.');
  else if (Number(summary.verified_count) !== cards.length) fail('Place validation is incomplete.');
  else if (Number(board.generation_score) < 70) fail('Generation score is below 70.');
  else if (cards.some((card) => card.under21Safe !== true)) fail('Under-21 safety is incomplete.');
  else if (cards.some((card) => !String(card.imageUrl || '').includes('firebasestorage.googleapis.com')
    || !String(card.imageSourceUrl || '').trim() || !String(card.imageFingerprint || '').trim())) {
    fail('Every card needs an app-owned image with source provenance.');
  } else if (fingerprints.size !== cards.length) fail('Images must be unique within the board.');
  else if (summary.all_have_images !== true || Number(summary.image_count) !== cards.length
    || Number(summary.unique_image_count) !== cards.length) fail('Image validation summary is incomplete.');
}

if (boards.length !== 7) failures.push({ boardId: '', title: '', message: `Expected exactly 7 boards; found ${boards.length}.` });
if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, boardCount: boards.length, failures }, null, 2)}\n`);
  await admin.app().delete();
  process.exit(1);
}

if (apply) {
  const operationId = db.collection('board_generation_audit').doc().id;
  const batch = db.batch();
  const nowIso = new Date().toISOString();
  for (const { document, board } of boards) {
    batch.update(document.ref, {
      visibility: 'public', editorial_status: 'published', city_listing_status: 'listed',
      approved_by_user_id: 'livingwiki-system', approved_at: FieldValue.serverTimestamp(),
      updated_at_iso: nowIso, server_updated_at: FieldValue.serverTimestamp(),
    });
    batch.set(db.collection('board_generation_audit').doc(), {
      action: 'publish', bulk_operation_id: operationId, board_id: document.id, atlas_id: atlasId,
      actor_user_id: 'livingwiki-system', target_kind: 'university',
      previous_state: {
        visibility: board.visibility || '', editorial_status: board.editorial_status || '',
        city_listing_status: board.city_listing_status || '', source_status: board.source_status || '',
      },
      image_gate: { required: 10, validated: 10, unique: 10 },
      created_at: FieldValue.serverTimestamp(),
    });
  }
  batch.set(db.collection('board_generation_audit').doc(), {
    action: 'university_publish_completed', bulk_operation_id: operationId, atlas_id: atlasId,
    actor_user_id: 'livingwiki-system', published_count: boards.length,
    image_count: boards.reduce((total, { board }) => total + board.cards.length, 0),
    created_at: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

process.stdout.write(`${JSON.stringify({ ok: true, applied: apply, atlasId, boardCount: boards.length,
  imageCount: boards.reduce((total, { board }) => total + board.cards.length, 0),
  scores: boards.map(({ document, board }) => ({ boardId: document.id, template: board.template_id, score: board.generation_score })),
}, null, 2)}\n`);
await admin.app().delete();
