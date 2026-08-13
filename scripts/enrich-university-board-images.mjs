#!/usr/bin/env node

import { createRequire } from 'node:module';
import { enrichUniversityBoardImages } from './lib/university-board-images.mjs';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const apply = args.includes('--apply');
const freeOnly = args.includes('--free-only');
const wikidataOnly = args.includes('--wikidata-only');
const wikimediaGeo = args.includes('--wikimedia-geo');
const recoveredOnly = args.includes('--recovered-only');
const allowPartial = args.includes('--allow-partial');
const atlasId = valueAfter('--atlas');
const boardId = valueAfter('--board');
const limit = Math.max(1, Math.min(10_000, Number.parseInt(valueAfter('--limit') || '10000', 10)));
const concurrency = Math.max(1, Math.min(24, Number.parseInt(valueAfter('--concurrency') || '4', 10)));
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
const functionsBaseUrl = `https://us-central1-${projectId}.cloudfunctions.net`;

if (!atlasId && !boardId && !recoveredOnly) throw new Error('Pass --atlas ATLAS_ID, --board BOARD_ID, or --recovered-only.');

admin.initializeApp({ projectId, storageBucket: bucketName });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

async function placesKey() {
  if (process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY;
  const { spawn } = await import('node:child_process');
  return await new Promise((resolve) => {
    const child = spawn('gcloud', ['secrets', 'versions', 'access', 'latest', '--secret', 'GOOGLE_PLACES_API_KEY', '--project', projectId], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    child.on('error', () => resolve(''));
    child.on('exit', (code) => resolve(code === 0 ? Buffer.concat(chunks).toString('utf8').trim() : ''));
  });
}

async function secret(name) {
  if (process.env[name]) return process.env[name];
  const { spawn } = await import('node:child_process');
  return await new Promise((resolve) => {
    const child = spawn('gcloud', ['secrets', 'versions', 'access', 'latest', '--secret', name, '--project', projectId], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    child.on('error', () => resolve(''));
    child.on('exit', (code) => resolve(code === 0 ? Buffer.concat(chunks).toString('utf8').trim() : ''));
  });
}

async function targetFor(board) {
  const targetId = String(board.atlas_id || board.generated_for_atlas_id || '').trim();
  const snapshot = await db.collection('atlases').doc(targetId).get();
  if (!snapshot.exists) throw new Error(`University atlas not found: ${targetId}`);
  const atlas = snapshot.data();
  const config = atlas.university_config || {};
  return {
    atlasId: targetId,
    schoolName: String(config.official_name || board.school_name || '').trim(),
    townName: String(config.city || board.town_name || '').trim(),
    state: String(config.state || board.state || '').trim(),
    latitude: Number.isFinite(Number(config.latitude)) ? Number(config.latitude) : null,
    longitude: Number.isFinite(Number(config.longitude)) ? Number(config.longitude) : null,
  };
}

const snapshot = boardId
  ? { docs: [await db.collection('boards').doc(boardId).get()] }
  : recoveredOnly
    ? await db.collection('boards').where('paid_artifact_recovery', '==', true).get()
  : await db.collection('boards').where('atlas_id', '==', atlasId).get();
const documents = snapshot.docs
  .filter((document) => document.exists && document.data()?.target_kind === 'university' && !document.data()?.deleted_at)
  .sort((left, right) => `${left.data()?.school_name || ''}\0${left.data()?.template_id || ''}`.localeCompare(`${right.data()?.school_name || ''}\0${right.data()?.template_id || ''}`))
  .slice(0, limit);
const googlePlacesApiKey = freeOnly ? '' : await placesKey();
const googleCustomSearchApiKey = freeOnly ? '' : await secret('GOOGLE_CUSTOM_SEARCH_API_KEY');
const googleCustomSearchCx = process.env.GOOGLE_CUSTOM_SEARCH_CX || 'f5a12e50537f14b83';
const summary = { requested: documents.length, enriched: 0, complete: 0, partial: 0, failed: 0, imageCount: 0, results: [] };

async function processDocument(document) {
  const board = document.data();
  const target = await targetFor(board);
  process.stdout.write(`[University images] ${target.schoolName} · ${board.template_id}\n`);
  const result = await enrichUniversityBoardImages({ ...board, id: document.id }, target, {
    admin, bucketName, functionsBaseUrl, googlePlacesApiKey, googleCustomSearchApiKey, googleCustomSearchCx,
    freeOnly, wikidataOnly, wikimediaGeo, allowPartial,
  });
  if (!result.ok) {
    summary.failed += 1;
    summary.results.push({ boardId: document.id, template: board.template_id, status: 'failed', missing: result.failures });
    return;
  }
  if (apply) {
    const imageCount = Number(result.board.validation_summary?.image_count) || 0;
    const complete = result.board.validation_summary?.all_have_images === true;
    await document.ref.set({
      cards: result.board.cards,
      imageUrl: result.board.imageUrl,
      validation_summary: result.board.validation_summary,
      quality_status: complete ? 'passed' : 'awaiting_images',
      quality_warnings: complete
        ? []
        : [`Free image enrichment found ${imageCount}/${result.board.cards.length} exact images; ${result.failures.length} still need a defensible image.`],
      image_enriched_at: FieldValue.serverTimestamp(),
      updated_at_iso: new Date().toISOString(),
      server_updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.collection('board_generation_audit').add({
      action: 'university_board_images_enriched', board_id: document.id, atlas_id: target.atlasId,
      image_count: result.board.cards.length, target_kind: 'university', actor_user_id: 'livingwiki-system',
      created_at: FieldValue.serverTimestamp(),
    });
  }
  summary.enriched += 1;
  summary.imageCount += result.cards.length;
  if (result.complete) summary.complete += 1;
  else summary.partial += 1;
  summary.results.push({
    boardId: document.id, template: board.template_id,
    status: apply ? (result.complete ? 'enriched' : 'partial') : (result.complete ? 'dry_run_complete' : 'dry_run_partial'),
    imageCount: Number(result.board.validation_summary?.image_count) || 0, newlyResolved: result.cards.length,
    missing: result.failures,
    providers: result.board.cards.filter((card) => card.imageUrl).reduce((counts, card) => ({ ...counts, [card.imageSource]: (counts[card.imageSource] || 0) + 1 }), {}),
  });
}

let nextIndex = 0;
async function worker() {
  while (nextIndex < documents.length) {
    const index = nextIndex;
    nextIndex += 1;
    try { await processDocument(documents[index]); }
    catch (error) {
      summary.failed += 1;
      summary.results.push({ boardId: documents[index].id, status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, documents.length) }, worker));

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
await admin.app().delete();
