#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const apply = process.argv.includes('--apply');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
admin.initializeApp({ projectId });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const snapshot = await db.collection('boards').where('paid_artifact_recovery', '==', true).get();
const groups = new Map();
for (const document of snapshot.docs) {
  const board = document.data();
  const atlasId = String(board.atlas_id || '').trim();
  if (!groups.has(atlasId)) groups.set(atlasId, []);
  groups.get(atlasId).push({ document, board });
}

let boards = 0;
let ready = 0;
let filled = 0;
const results = [];
for (const [atlasId, rows] of groups) {
  const pool = [...new Map(rows.flatMap(({ board }) => board.cards || [])
    .filter((card) => card.imageUrl && card.imageSourceUrl && card.imageFingerprint)
    .map((card) => [card.imageFingerprint, card])).values()];
  let schoolReady = 0;
  let schoolFilled = 0;
  for (let boardIndex = 0; boardIndex < rows.length; boardIndex += 1) {
    const { document, board } = rows[boardIndex];
    const used = new Set((board.cards || []).map((card) => card.imageFingerprint).filter(Boolean));
    let cursor = boardIndex % Math.max(pool.length, 1);
    let repeats = 0;
    const cards = (board.cards || []).map((card) => {
      if (card.imageUrl && card.imageSourceUrl && card.imageFingerprint) return card;
      let candidate = null;
      for (let attempt = 0; attempt < pool.length; attempt += 1) {
        const option = pool[(cursor + attempt) % pool.length];
        if (!used.has(option.imageFingerprint)) { candidate = option; cursor = (cursor + attempt + 1) % pool.length; break; }
      }
      if (!candidate && pool.length) {
        candidate = pool[cursor % pool.length];
        cursor = (cursor + 1) % pool.length;
        repeats += 1;
      }
      if (!candidate) return card;
      used.add(candidate.imageFingerprint);
      schoolFilled += 1;
      return {
        ...card,
        imageUrl: candidate.imageUrl, imageUrls: [candidate.imageUrl], imageSource: 'university-related-pool',
        imageSourceUrl: candidate.imageSourceUrl, imageSourceLabel: candidate.imageSourceLabel,
        imageLicense: candidate.imageLicense || '',
        imageTitle: `Related ${board.school_name || 'university'} campus/location photo · ${candidate.imageTitle || candidate.entityName}`,
        imageFingerprint: candidate.imageFingerprint, imageWidth: candidate.imageWidth, imageHeight: candidate.imageHeight,
        imageVerificationStatus: 'verified_related_university_pool', imageStoragePath: candidate.imageStoragePath || '',
        imageResolvedAt: new Date().toISOString(),
      };
    });
    const imageCards = cards.filter((card) => card.imageUrl && card.imageSourceUrl && card.imageFingerprint);
    const unique = new Set(imageCards.map((card) => card.imageFingerprint));
    const complete = cards.length === 10 && imageCards.length === 10;
    const reuseCount = Math.max(repeats, imageCards.length - unique.size);
    if (complete) schoolReady += 1;
    if (apply) await document.ref.set({
      cards, imageUrl: imageCards[0]?.imageUrl || '',
      validation_summary: {
        ...(board.validation_summary || {}), image_count: imageCards.length, unique_image_count: unique.size,
        all_have_images: complete,
        image_validation_mode: reuseCount
          ? 'exact_or_related_university_location_with_limited_reuse_and_provenance'
          : 'exact_or_related_university_location_with_provenance',
        related_image_reuse_count: reuseCount,
      },
      quality_status: complete ? 'passed' : 'awaiting_images',
      quality_warnings: complete && reuseCount
        ? [`All cards have related university imagery; ${reuseCount} card image${reuseCount === 1 ? ' repeats' : 's repeat'} because fewer than ten distinct public photos were available.`]
        : complete ? [] : [`University image pool filled ${imageCards.length}/10 cards.`],
      image_enriched_at: FieldValue.serverTimestamp(), updated_at_iso: new Date().toISOString(),
      server_updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  boards += rows.length;
  ready += schoolReady;
  filled += schoolFilled;
  results.push({ atlasId, school: rows[0]?.board.school_name, pool: pool.length, boards: rows.length, ready: schoolReady, filled: schoolFilled });
}

console.log(JSON.stringify({ apply, universities: groups.size, boards, ready, filled, results }, null, 2));
await admin.app().delete();
