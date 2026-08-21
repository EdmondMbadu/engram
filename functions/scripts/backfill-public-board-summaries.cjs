#!/usr/bin/env node

const admin = require('firebase-admin');
const {
  optimizePublicBoardCover,
  publicBoardSummaryFromBoard,
} = require('../lib/public-board-summary.js');

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'living-atlas-7622a';
const apply = process.argv.includes('--apply');
const skipImages = process.argv.includes('--skip-images');
const measure = process.argv.includes('--measure');
const ownerSlug = String(process.argv.find((arg) => arg.startsWith('--owner=')) || '').slice('--owner='.length).trim();
const parsedLimit = Number(String(process.argv.find((arg) => arg.startsWith('--limit=')) || '').slice('--limit='.length));
const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(10_000, Math.floor(parsedLimit)) : 10_000;

if (!admin.apps.length) admin.initializeApp({
  projectId,
  storageBucket: `${projectId}.firebasestorage.app`,
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

function existingCover(data, sourceImageUrl) {
  if (!sourceImageUrl
    || data?.source_image_url !== sourceImageUrl
    || typeof data?.imageUrl !== 'string'
    || !data.imageUrl
    || typeof data?.image_webp_srcset !== 'string'
    || !data.image_webp_srcset) return null;
  return {
    sourceImageUrl,
    imageUrl: data.imageUrl,
    webpSrcset: data.image_webp_srcset,
    width: Math.max(0, Number(data.image_width) || 0),
    height: Math.max(0, Number(data.image_height) || 0),
  };
}

async function backfill(document) {
  const board = document.data();
  const sourceBoardUpdateMs = document.updateTime?.toMillis() || Date.now();
  const summaryRef = db.collection('public_board_summaries').doc(document.id);
  const existing = (await summaryRef.get()).data();
  const sourceImageUrl = typeof board.imageUrl === 'string' ? board.imageUrl.trim().slice(0, 2_000) : '';
  let cover = existingCover(existing, sourceImageUrl);
  let imageStatus = cover ? 'reused' : sourceImageUrl ? 'pending' : 'none';

  if (apply) {
    await summaryRef.set({
      ...publicBoardSummaryFromBoard(document.id, board, cover),
      source_board_update_ms: sourceBoardUpdateMs,
      server_updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  if (apply && sourceImageUrl && !cover && !skipImages) {
    try {
      cover = await optimizePublicBoardCover(bucket, document.id, sourceImageUrl);
      await summaryRef.set({
        ...publicBoardSummaryFromBoard(document.id, board, cover),
        source_board_update_ms: sourceBoardUpdateMs,
        server_updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      imageStatus = 'optimized';
    } catch (error) {
      imageStatus = `fallback:${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return { id: document.id, imageStatus };
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function backfillSummariesOnly(documents) {
  const results = [];
  for (let index = 0; index < documents.length; index += 400) {
    const chunk = documents.slice(index, index + 400);
    const references = chunk.map((document) =>
      db.collection('public_board_summaries').doc(document.id));
    const existingSnapshots = await db.getAll(...references);
    const batch = db.batch();
    chunk.forEach((document, chunkIndex) => {
      const board = document.data();
      const sourceImageUrl = typeof board.imageUrl === 'string'
        ? board.imageUrl.trim().slice(0, 2_000)
        : '';
      const cover = existingCover(existingSnapshots[chunkIndex]?.data(), sourceImageUrl);
      batch.set(references[chunkIndex], {
        ...publicBoardSummaryFromBoard(document.id, board, cover),
        source_board_update_ms: document.updateTime?.toMillis() || Date.now(),
        server_updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      results.push({ id: document.id, imageStatus: cover ? 'reused' : 'skipped' });
    });
    await batch.commit();
    console.log(`Wrote compact summaries ${Math.min(index + chunk.length, documents.length)}/${documents.length}.`);
  }
  return results;
}

async function main() {
  let query = db.collection('boards').where('visibility', '==', 'public');
  if (ownerSlug) query = query.where('owner_public_slug', '==', ownerSlug);
  query = query.orderBy('created_at_iso', 'desc');
  const snapshot = await query.limit(limit).get();
  const documents = snapshot.docs.filter((document) => {
    const parentCardId = document.data().parentCardId;
    return typeof parentCardId !== 'string' || !parentCardId.trim();
  });
  console.log(`${apply ? 'Applying' : 'Dry run for'} ${documents.length} public board summaries${ownerSlug ? ` owned by ${ownerSlug}` : ''}.`);
  if (measure) {
    const summarySnapshots = await db.getAll(...documents.map((document) =>
      db.collection('public_board_summaries').doc(document.id)));
    const fullPayload = documents.map((document) => document.data());
    const summaryPayload = summarySnapshots.filter((document) => document.exists).map((document) => document.data());
    const fullBytes = Buffer.byteLength(JSON.stringify(fullPayload));
    const summaryBytes = Buffer.byteLength(JSON.stringify(summaryPayload));
    console.log(JSON.stringify({
      boards: documents.length,
      fullBytes,
      summaryBytes,
      reductionPercent: fullBytes ? Math.round((1 - summaryBytes / fullBytes) * 10_000) / 100 : 0,
    }, null, 2));
    return;
  }
  if (!apply) {
    console.log('Pass --apply to write summaries. Images are optimized unless --skip-images is set.');
    return;
  }
  const results = skipImages
    ? await backfillSummariesOnly(documents)
    : await mapWithConcurrency(documents, 3, backfill);
  const counts = results.reduce((summary, result) => {
    const key = String(result.imageStatus).split(':')[0];
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
  let summaryQuery = db.collection('public_board_summaries');
  if (ownerSlug) summaryQuery = summaryQuery.where('owner_public_slug', '==', ownerSlug);
  const summarySnapshot = await summaryQuery.get();
  const summaryIds = new Set(summarySnapshot.docs
    .filter((document) => {
      const summary = document.data();
      return summary.visibility === 'public' && summary.is_root === true;
    })
    .map((document) => document.id));
  const missing = documents.map((document) => document.id).filter((id) => !summaryIds.has(id));
  console.log(JSON.stringify({
    written: results.length,
    verified: results.length - missing.length,
    missing: missing.slice(0, 20),
    imageStatus: counts,
  }, null, 2));
  if (missing.length) throw new Error(`Backfill verification failed for ${missing.length} board summaries.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
