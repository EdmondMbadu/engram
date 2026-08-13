#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const scoreThreshold = 70;
const clean = (value, max = 2_000) => typeof value === 'string'
  ? value.replace(/\s+/g, ' ').trim().slice(0, max)
  : '';

admin.initializeApp({ projectId });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

function qualityProblems(board) {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const validation = board.validation_summary && typeof board.validation_summary === 'object'
    ? board.validation_summary
    : {};
  const fingerprints = new Set(cards.map((card) => clean(card?.imageFingerprint)).filter(Boolean));
  const limitedReuse = clean(validation.image_validation_mode)
    === 'exact_or_related_university_location_with_limited_reuse_and_provenance';
  const problems = [];
  if (cards.length !== 10) problems.push(`cards=${cards.length}`);
  if (!cards.every((card) => card?.under21Safe === true)) problems.push('under21');
  if (!cards.every((card) => /^https:\/\//i.test(clean(card?.sourceUrl)))) problems.push('sources');
  if (!cards.every((card) => clean(card?.imageUrl).includes('firebasestorage.googleapis.com')
    && /^https:\/\//i.test(clean(card?.imageSourceUrl)) && clean(card?.imageFingerprint))) problems.push('images');
  if (fingerprints.size !== cards.length && !(limitedReuse && fingerprints.size >= 7)) problems.push(`image-diversity=${fingerprints.size}`);
  if (validation.all_have_images !== true || Number(validation.image_count) !== cards.length) problems.push('image-summary');
  if (Number(validation.unique_image_count) !== fingerprints.size) problems.push('image-summary-diversity');
  if (!Number.isFinite(Number(board.generation_score)) || Number(board.generation_score) < scoreThreshold) problems.push(`score=${board.generation_score}`);
  const reviewable = clean(board.editorial_status) === 'needs_review' && clean(board.visibility) === 'private';
  const published = clean(board.editorial_status) === 'published' && clean(board.visibility) === 'public';
  if (!reviewable && !published) problems.push('workflow-state');
  return problems;
}

const recoveredSnapshot = await db.collection('boards').where('paid_artifact_recovery', '==', true).get();
const recoveredStateCounts = {};
for (const document of recoveredSnapshot.docs) {
  const board = document.data();
  const state = `${clean(board.visibility) || '(blank)'} / ${clean(board.editorial_status) || '(blank)'} / ${clean(board.quality_status) || '(blank)'}`;
  recoveredStateCounts[state] = (recoveredStateCounts[state] || 0) + 1;
}
const canonicalSnapshot = await db.collection('boards').where('target_kind', '==', 'university').get();
const canonicalOwners = new Map();
for (const document of canonicalSnapshot.docs) {
  const board = document.data();
  const key = clean(board.generation_key);
  if (key && key === clean(board.canonical_generation_key || key) && !board.deleted_at) canonicalOwners.set(key, document.id);
}

const promotable = [];
const rejected = [];
const conflicts = [];
for (const document of recoveredSnapshot.docs) {
  const board = document.data();
  const canonicalKey = clean(board.canonical_generation_key);
  const problems = qualityProblems(board);
  if (!canonicalKey) problems.push('canonical-key');
  const owner = canonicalOwners.get(canonicalKey);
  if (owner && owner !== document.id) conflicts.push({ boardId: document.id, canonicalKey, owner });
  else if (problems.length) rejected.push({ boardId: document.id, canonicalKey, problems });
  else promotable.push({ document, board, canonicalKey });
}

if (apply && conflicts.length) throw new Error(`Refusing promotion: ${conflicts.length} canonical generation-key conflict(s).`);

if (apply) {
  for (let offset = 0; offset < promotable.length; offset += 240) {
    const batch = db.batch();
    for (const { document, board, canonicalKey } of promotable.slice(offset, offset + 240)) {
      const archivalKey = clean(board.generation_key);
      batch.update(document.ref, {
        generation_key: canonicalKey,
        archival_generation_key: archivalKey,
        canonical_slot_promoted: true,
        canonical_slot_promoted_at: FieldValue.serverTimestamp(),
        updated_at_iso: new Date().toISOString(),
        server_updated_at: FieldValue.serverTimestamp(),
      });
      batch.set(db.collection('board_generation_audit').doc(), {
        action: 'promote_recovered_university_board_to_canonical_slot',
        board_id: document.id,
        atlas_id: clean(board.atlas_id),
        template_id: clean(board.template_id),
        generation_key: canonicalKey,
        archival_generation_key: archivalKey,
        generation_score: Number(board.generation_score),
        image_count: Number(board.validation_summary?.image_count),
        unique_image_count: Number(board.validation_summary?.unique_image_count),
        actor_user_id: 'livingwiki-system',
        created_at: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

process.stdout.write(`${JSON.stringify({
  ok: conflicts.length === 0,
  apply,
  recovered: recoveredSnapshot.size,
  promotable: promotable.length,
  rejected: rejected.length,
  conflicts: conflicts.length,
  promotedUniversities: new Set(promotable.map(({ board }) => clean(board.atlas_id))).size,
  recoveredStateCounts,
  rejectedSample: rejected.slice(0, 10),
  conflictSample: conflicts.slice(0, 10),
}, null, 2)}\n`);

await admin.app().delete();
