#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const apply = process.argv.includes('--apply');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
admin.initializeApp({ projectId });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const clean = (value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const normalized = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const generic = new Set(['the', 'and', 'for', 'with', 'from', 'university', 'college', 'school', 'campus', 'student', 'students', 'center', 'centre', 'building', 'hall', 'room', 'lounge', 'space', 'spaces', 'street', 'avenue', 'road', 'library', 'commons', 'main']);
const tokens = (value) => normalized(value).split(' ').filter((token) => token.length >= 3 && !generic.has(token));

function exactOfficialMatch(card) {
  if (!['official-page', 'wikidata-wikimedia', 'wikimedia-geosearch'].includes(card.imageSource)) return false;
  const entity = normalized(card.entityName);
  const title = normalized(card.imageTitle);
  const source = normalized(card.imageSourceUrl);
  const identity = tokens(card.entityName);
  const titleMatches = identity.filter((token) => title.includes(token)).length;
  const sourceMatches = identity.filter((token) => source.includes(token)).length;
  const required = identity.length <= 1 ? 1 : Math.min(2, identity.length);
  return (entity.length >= 6 && title.includes(entity))
    || titleMatches >= required
    || sourceMatches >= required;
}

function clearedCard(card) {
  return {
    ...card, imageUrl: '', imageUrls: [], imageSource: 'missing', imageSourceUrl: '', imageSourceLabel: '',
    imageLicense: '', imageTitle: '', imageFingerprint: '', imageWidth: null, imageHeight: null,
    imageVerificationStatus: 'pending', imageStoragePath: '', imageResolvedAt: '',
  };
}

const snapshot = await db.collection('boards').where('paid_artifact_recovery', '==', true).get();
let kept = 0;
let removed = 0;
let changedBoards = 0;
for (const document of snapshot.docs) {
  const board = document.data();
  const cards = (board.cards || []).map((card) => {
    if (!clean(card.imageUrl)) return card;
    if (exactOfficialMatch(card)) { kept += 1; return card; }
    removed += 1;
    return clearedCard(card);
  });
  const imageCards = cards.filter((card) => clean(card.imageUrl) && clean(card.imageSourceUrl) && clean(card.imageFingerprint));
  const fingerprints = new Set(imageCards.map((card) => clean(card.imageFingerprint)).filter(Boolean));
  const complete = cards.length === 10 && imageCards.length === cards.length && fingerprints.size === cards.length;
  if (imageCards.length !== Number(board.validation_summary?.image_count || 0)) changedBoards += 1;
  if (apply) {
    await document.ref.set({
      cards, imageUrl: imageCards[0]?.imageUrl || '',
      validation_summary: {
        ...(board.validation_summary || {}), image_count: imageCards.length, unique_image_count: fingerprints.size,
        all_have_images: complete, image_validation_mode: 'strict_exact_official_page_provenance',
      },
      quality_status: complete ? 'passed' : 'awaiting_images',
      quality_warnings: complete ? [] : [`Strict free image audit retained ${imageCards.length}/${cards.length} exact official-source images.`],
      image_audited_at: FieldValue.serverTimestamp(), updated_at_iso: new Date().toISOString(),
      server_updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}
console.log(JSON.stringify({ apply, boards: snapshot.size, kept, removed, changedBoards }, null, 2));
await admin.app().delete();
