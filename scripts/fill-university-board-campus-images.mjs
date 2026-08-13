#!/usr/bin/env node

import { createRequire } from 'node:module';
import {
  fetchBitmap, officialUniversitySiteCandidates, relatedPageImageCandidates,
  universityCampusFallbackCandidates, uploadBitmap,
} from './lib/university-board-images.mjs';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const onlyAtlas = valueAfter('--atlas');
const universityLimit = Math.max(1, Number.parseInt(valueAfter('--university-limit') || '10000', 10));
const universityOffset = Math.max(0, Number.parseInt(valueAfter('--university-offset') || '0', 10));
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
admin.initializeApp({ projectId, storageBucket: bucketName });
const db = admin.firestore();
const { FieldValue } = admin.firestore;
const relatedPageCache = new Map();
const bitmapCache = new Map();

const relatedCandidatesFor = (url, label) => {
  const key = String(url || '').trim();
  if (!key) return Promise.resolve([]);
  if (!relatedPageCache.has(key)) relatedPageCache.set(key, relatedPageImageCandidates(key, label));
  return relatedPageCache.get(key);
};

const bitmapFor = (url) => {
  if (!bitmapCache.has(url)) bitmapCache.set(url, fetchBitmap(url).catch(() => null));
  return bitmapCache.get(url);
};

const boardsSnapshot = await db.collection('boards').where('paid_artifact_recovery', '==', true).get();
const groups = new Map();
for (const document of boardsSnapshot.docs) {
  const board = document.data();
  if (board.deleted_at || board.target_kind !== 'university') continue;
  const atlasId = String(board.atlas_id || board.generated_for_atlas_id || '').trim();
  if (onlyAtlas && atlasId !== onlyAtlas) continue;
  if (!groups.has(atlasId)) groups.set(atlasId, []);
  groups.get(atlasId).push({ document, board });
}

const selectedGroups = [...groups].sort(([left], [right]) => left.localeCompare(right))
  .slice(universityOffset, universityOffset + universityLimit);
const summary = { universities: selectedGroups.length, boards: 0, ready: 0, filledCards: 0, unresolvedBoards: 0, results: [] };
for (const [atlasId, boardRows] of selectedGroups) {
  const atlasDocument = await db.collection('atlases').doc(atlasId).get();
  if (!atlasDocument.exists) continue;
  const config = atlasDocument.data()?.university_config || {};
  const target = {
    atlasId, schoolName: String(config.official_name || boardRows[0].board.school_name || '').trim(),
    townName: String(config.city || boardRows[0].board.town_name || '').trim(), state: String(config.state || '').trim(),
    latitude: Number(config.latitude), longitude: Number(config.longitude),
  };
  const alreadyReady = boardRows.every(({ board }) => {
    const images = (board.cards || []).filter((card) => card.imageUrl && card.imageSourceUrl && card.imageFingerprint);
    return board.cards?.length === 10 && images.length === 10
      && new Set(images.map((card) => card.imageFingerprint)).size === 10;
  });
  if (alreadyReady) {
    summary.boards += boardRows.length;
    summary.ready += boardRows.length;
    summary.results.push({ atlasId, school: target.schoolName, pool: 0, boards: boardRows.length, ready: boardRows.length, filled: 0, skipped: 'already_ready' });
    continue;
  }
  process.stdout.write(`[Campus fallback] ${target.schoolName}\n`);
  const officialWebsite = String(config.website || '').trim();
  const sourceUrls = [...new Set(boardRows.flatMap(({ board }) => (board.cards || []).map((card) => card.sourceUrl).filter(Boolean)))];
  const [commonsCandidates, officialCandidates] = await Promise.all([
    universityCampusFallbackCandidates(target),
    officialUniversitySiteCandidates(target, officialWebsite, sourceUrls),
  ]);
  const candidates = [...commonsCandidates, ...officialCandidates];
  const pool = [];
  const fingerprints = new Set();
  for (const candidate of candidates) {
    if (pool.length >= 24) break;
    try {
      const bitmap = await bitmapFor(candidate.imageUrl);
      if (!bitmap) continue;
      if (fingerprints.has(bitmap.fingerprint)) continue;
      fingerprints.add(bitmap.fingerprint);
      const storagePath = `university-campus-fallback/${atlasId}/${bitmap.fingerprint.slice(0, 24)}.${bitmap.extension}`;
      const imageUrl = apply
        ? await uploadBitmap(admin, bitmap, storagePath, candidate, bucketName)
        : candidate.imageUrl;
      pool.push({ ...candidate, ...bitmap, imageUrl, storagePath });
    } catch { /* try the next campus image */ }
  }
  let universityFilled = 0;
  let universityReady = 0;
  for (let boardIndex = 0; boardIndex < boardRows.length; boardIndex += 1) {
    const { document, board } = boardRows[boardIndex];
    const used = new Set((board.cards || []).map((card) => card.imageFingerprint).filter(Boolean));
    let cursor = boardIndex % Math.max(1, pool.length);
    const broadByCard = await Promise.all((board.cards || []).map(async (card) => {
      if (card.imageUrl && card.imageSourceUrl && card.imageFingerprint) return null;
      const related = await relatedCandidatesFor(card.sourceUrl, card.sourceTitle || card.entityName || 'Related source page');
      let resolved = null;
      for (const candidate of related.slice(0, 12)) {
        try {
          const bitmap = await bitmapFor(candidate.imageUrl);
          if (!bitmap) continue;
          if (used.has(bitmap.fingerprint)) continue;
          const storagePath = `university-related-source/${atlasId}/${bitmap.fingerprint.slice(0, 24)}.${bitmap.extension}`;
          const imageUrl = apply ? await uploadBitmap(admin, bitmap, storagePath, candidate, bucketName) : candidate.imageUrl;
          resolved = { ...candidate, ...bitmap, imageUrl, storagePath };
          used.add(bitmap.fingerprint);
          break;
        } catch { /* try another image on the cited page */ }
      }
      return resolved;
    }));
    let cardIndex = -1;
    const cards = (board.cards || []).map((card) => {
      cardIndex += 1;
      if (card.imageUrl && card.imageSourceUrl && card.imageFingerprint) return card;
      let selected = broadByCard[cardIndex] || null;
      for (let attempt = 0; attempt < pool.length; attempt += 1) {
        const candidate = pool[(cursor + attempt) % pool.length];
        if (candidate && !used.has(candidate.fingerprint)) { selected = candidate; cursor = (cursor + attempt + 1) % pool.length; break; }
      }
      if (!selected) return card;
      used.add(selected.fingerprint);
      universityFilled += 1;
      return {
        ...card, imageUrl: selected.imageUrl, imageUrls: [selected.imageUrl], imageSource: selected.provider,
        imageSourceUrl: selected.sourceUrl, imageSourceLabel: selected.sourceLabel, imageLicense: selected.license,
        imageTitle: `Related campus/location photo · ${selected.title}`,
        imageFingerprint: selected.fingerprint, imageWidth: selected.dimensions.width, imageHeight: selected.dimensions.height,
        imageVerificationStatus: 'verified_related_location', imageStoragePath: selected.storagePath,
        imageResolvedAt: new Date().toISOString(),
      };
    });
    const imageCards = cards.filter((card) => card.imageUrl && card.imageSourceUrl && card.imageFingerprint);
    const unique = new Set(imageCards.map((card) => card.imageFingerprint));
    const complete = cards.length === 10 && imageCards.length === 10 && unique.size === 10;
    if (complete) universityReady += 1;
    if (apply) {
      await document.ref.set({
        cards, imageUrl: imageCards[0]?.imageUrl || '',
        validation_summary: {
          ...(board.validation_summary || {}), image_count: imageCards.length, unique_image_count: unique.size,
          all_have_images: complete, image_validation_mode: 'exact_or_related_campus_location_with_provenance',
        },
        quality_status: complete ? 'passed' : 'awaiting_images',
        quality_warnings: complete ? [] : [`Campus fallback produced ${imageCards.length}/10 distinct sourced images.`],
        image_enriched_at: FieldValue.serverTimestamp(), updated_at_iso: new Date().toISOString(),
        server_updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
  summary.boards += boardRows.length;
  summary.ready += universityReady;
  summary.filledCards += universityFilled;
  summary.unresolvedBoards += boardRows.length - universityReady;
  summary.results.push({ atlasId, school: target.schoolName, pool: pool.length, boards: boardRows.length, ready: universityReady, filled: universityFilled });
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
await admin.app().delete();
