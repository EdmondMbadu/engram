#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const apply = process.argv.includes('--apply');
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
admin.initializeApp({ projectId });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const TOKYO_BOARD_ID = 'bulk_fee598e6202dcda03e8e7afa1631';
const PHILADELPHIA_BOARD_ID = 'bulk_8dee1751593adc7c6b3ef7278461';
const TOKYO_PAID_PLACE_ID = 'ChIJPyOTG8KMGGARh_IXobWxHmo';
const TOKYO_FREE_PLACE_ID = 'ChIJZ4dcAFOLGGARflIh1jzcgIo';
const FUNCTIONS_BASE_URL = `https://us-central1-${projectId}.cloudfunctions.net`;

const philadelphiaTitles = new Map([
  ['Independence Hall', 'The room where the country began — Independence Hall'],
  ['Arch Street Meeting House', 'Quaker simplicity still in use — Arch Street Meeting House'],
  ['Wyck Historic House And Garden', 'Nine generations under one roof — Wyck Historic House & Garden'],
  ['Wyck Historic House & Garden', 'Nine generations under one roof — Wyck Historic House & Garden'],
  ['Fragments of Franklin Court', 'A missing house drawn in steel — Franklin Court'],
  ['Mason-Dixon Survey Pennsylvania Historical Marker', 'The Mason-Dixon line starts here — Mason-Dixon survey marker'],
  ['Woodford Mansion', 'A Loyalist’s retreat in Fairmount Park — Woodford Mansion'],
  ['Historic RittenhouseTown', 'North America’s first paper mill — Historic RittenhouseTown'],
  ['Hill-Physick House', 'The father of American surgery at home — Hill-Physick House'],
  ['Athenaeum of Philadelphia', 'The city’s architecture kept on paper — Athenaeum of Philadelphia'],
  ['Grumblethorpe', 'A bloodstain with a ridiculous name — Grumblethorpe'],
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function candidateCacheId(generationKey) {
  return createHash('sha256').update(generationKey).digest('hex');
}

function validateReviewBoard(boardId, board, expected) {
  assert(board, `${boardId}: board not found.`);
  assert(board.origin === 'bulk_generator', `${boardId}: not factory-generated.`);
  assert(board.atlas_id === expected.atlasId, `${boardId}: atlas association changed.`);
  assert(board.generated_for_atlas_id === expected.atlasId, `${boardId}: generated city association changed.`);
  assert(board.template_id === expected.templateId, `${boardId}: template changed.`);
  assert(board.editorial_status === 'needs_review', `${boardId}: expected needs_review, found ${board.editorial_status}.`);
  assert(board.city_listing_status === 'pending', `${boardId}: expected pending, found ${board.city_listing_status}.`);
  assert(board.visibility === 'private', `${boardId}: expected private, found ${board.visibility}.`);
  assert(Array.isArray(board.cards) && board.cards.length === 10, `${boardId}: expected exactly 10 cards.`);
  assert(Number(board.validation_summary?.verified_count) === 10, `${boardId}: verification count is not 10.`);
  assert(Number(board.validation_summary?.unique_place_ids) === 10, `${boardId}: place identities are not unique.`);
  assert(board.validation_summary?.all_have_coordinates === true, `${boardId}: a card lacks coordinates.`);
}

function replacementTokyoCard(original, candidate, now) {
  const types = Array.isArray(candidate.types)
    ? candidate.types.map((type) => text(type).replaceAll('_', ' ')).filter(Boolean).slice(0, 5)
    : [];
  const photoUrl = candidate.photoReference
    ? `${FUNCTIONS_BASE_URL}/boardPlacePhoto?ref=${encodeURIComponent(candidate.photoReference)}`
    : '';
  const title = 'Watch the skyline from the hill — Saigōyama Park';
  const notes = 'Walk the sloping paths, sit beneath the trees, and take in views toward the city from this small public hilltop park. It gives the Daikanyama area an easy, no-ticket pause without requiring a purchase.';
  return {
    ...original,
    id: `card_${createHash('sha256').update(candidate.placeId).digest('hex').slice(0, 20)}`,
    title,
    subtitle: 'Meguro City · Hilltop neighborhood park',
    notes,
    entityName: candidate.name,
    imageContext: [candidate.address, ...types].filter(Boolean).join(' · ').slice(0, 120),
    shortSummary: 'A free hilltop park near Daikanyama with trees, paths, and broad city views.',
    imageUrl: photoUrl,
    imageUrls: photoUrl ? [photoUrl] : [],
    imageSource: photoUrl ? 'search' : 'missing',
    placeId: candidate.placeId,
    googleMapsUrl: candidate.googleMapsUrl,
    sourceUrl: candidate.googleMapsUrl,
    locationLat: candidate.lat,
    locationLng: candidate.lng,
    tags: [...types, `rank-${original.rank || 1}`, 'verified-place'].slice(0, 6),
    extractedAt: now,
    updatedAt: now,
  };
}

function publishFields(now) {
  return {
    visibility: 'public',
    editorial_status: 'published',
    city_listing_status: 'listed',
    approved_by_user_id: 'livingwiki-system',
    approved_at: FieldValue.serverTimestamp(),
    backNote: 'Generated from verified place identities for the approved global city-board catalog.',
    updated_at_iso: now,
    server_updated_at: FieldValue.serverTimestamp(),
  };
}

const [tokyoSnapshot, philadelphiaSnapshot] = await Promise.all([
  db.collection('boards').doc(TOKYO_BOARD_ID).get(),
  db.collection('boards').doc(PHILADELPHIA_BOARD_ID).get(),
]);
const tokyo = tokyoSnapshot.data();
const philadelphia = philadelphiaSnapshot.data();

validateReviewBoard(TOKYO_BOARD_ID, tokyo, {
  atlasId: 'I0Xy5xCfORZXvzH55yc6',
  templateId: 'global-zero-dollars',
});
validateReviewBoard(PHILADELPHIA_BOARD_ID, philadelphia, {
  atlasId: 'r4e6eOCCztxdkr4bjHRX',
  templateId: 'global-only-happens-here',
});

const cacheSnapshot = await db.collection('bulk_board_candidate_sets')
  .doc(candidateCacheId(tokyo.generation_key)).get();
assert(cacheSnapshot.exists, 'Tokyo candidate cache is missing.');
const replacement = (cacheSnapshot.data()?.candidates || [])
  .find((candidate) => candidate?.placeId === TOKYO_FREE_PLACE_ID);
assert(replacement, 'Verified Saigōyama Park candidate is missing from the Tokyo cache.');
assert(Number.isFinite(replacement.lat) && Number.isFinite(replacement.lng), 'Replacement park lacks coordinates.');
assert(text(replacement.googleMapsUrl), 'Replacement park lacks a Google Maps identity URL.');

const tokyoPaidIndex = tokyo.cards.findIndex((card) => card?.placeId === TOKYO_PAID_PLACE_ID);
assert(tokyoPaidIndex >= 0, 'The known paid Tokyo card was not found; refusing an ambiguous edit.');
assert(!tokyo.cards.some((card) => card?.placeId === TOKYO_FREE_PLACE_ID), 'Replacement park is already on the Tokyo board.');

const unmappedPhiladelphia = philadelphia.cards
  .map((card) => text(card?.entityName))
  .filter((name) => !philadelphiaTitles.has(name));
assert(!unmappedPhiladelphia.length, `Philadelphia title mapping is incomplete: ${unmappedPhiladelphia.join(', ')}`);

const preview = {
  projectId,
  apply,
  tokyo: {
    boardId: TOKYO_BOARD_ID,
    replaces: tokyo.cards[tokyoPaidIndex].entityName,
    replacement: replacement.name,
    placeId: replacement.placeId,
  },
  philadelphia: {
    boardId: PHILADELPHIA_BOARD_ID,
    rewrittenTitleCount: philadelphia.cards.length,
  },
  publicationScope: [TOKYO_BOARD_ID, PHILADELPHIA_BOARD_ID],
};

if (!apply) {
  process.stdout.write(`${JSON.stringify(preview, null, 2)}\nDry run only. Pass --apply to repair and publish these two exact boards.\n`);
} else {
  const now = new Date().toISOString();
  const tokyoCards = tokyo.cards.map((card, index) => index === tokyoPaidIndex
    ? replacementTokyoCard(card, replacement, now)
    : card);
  const philadelphiaCards = philadelphia.cards.map((card) => ({
    ...card,
    title: philadelphiaTitles.get(text(card.entityName)),
    updatedAt: now,
  }));

  const tokyoPlaceIds = new Set(tokyoCards.map((card) => text(card.placeId)).filter(Boolean));
  assert(tokyoPlaceIds.size === 10, 'Tokyo repair did not preserve 10 unique place identities.');
  assert(tokyoCards.every((card) => Number.isFinite(card.locationLat) && Number.isFinite(card.locationLng)), 'Tokyo repair left missing coordinates.');

  const batch = db.batch();
  batch.update(tokyoSnapshot.ref, {
    cards: tokyoCards,
    imageUrl: tokyoCards.find((card) => text(card.imageUrl))?.imageUrl || '',
    quality_warnings: (tokyo.quality_warnings || []).filter((warning) => !/subject-first title/i.test(text(warning))),
    quality_status: (tokyo.quality_warnings || []).length ? 'warnings' : 'not_scored',
    validation_summary: {
      ...tokyo.validation_summary,
      verified_count: 10,
      unique_place_ids: 10,
      all_have_coordinates: true,
      validated_at: now,
      editorial_repair: 'Replaced a paid attraction with verified free Saigōyama Park.',
    },
    ...publishFields(now),
  });
  batch.update(philadelphiaSnapshot.ref, {
    cards: philadelphiaCards,
    quality_warnings: (philadelphia.quality_warnings || []).filter((warning) => !/subject-first title/i.test(text(warning))),
    quality_status: (philadelphia.quality_warnings || []).filter((warning) => !/subject-first title/i.test(text(warning))).length
      ? 'warnings'
      : 'not_scored',
    validation_summary: {
      ...philadelphia.validation_summary,
      validated_at: now,
      editorial_repair: 'Rewrote all card titles into the approved subject-first voice.',
    },
    ...publishFields(now),
  });
  for (const [boardId, board, action] of [
    [TOKYO_BOARD_ID, tokyo, 'repair_paid_entry_and_publish'],
    [PHILADELPHIA_BOARD_ID, philadelphia, 'repair_subject_titles_and_publish'],
  ]) {
    batch.set(db.collection('board_generation_audit').doc(), {
      action,
      board_id: boardId,
      atlas_id: board.atlas_id,
      template_id: board.template_id,
      actor_user_id: 'livingwiki-system',
      previous_state: {
        visibility: board.visibility,
        editorial_status: board.editorial_status,
        city_listing_status: board.city_listing_status,
      },
      created_at: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  process.stdout.write(`${JSON.stringify({ ...preview, appliedAt: now }, null, 2)}\n`);
}
