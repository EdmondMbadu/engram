#!/usr/bin/env node

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const inputPath = process.argv.find((argument) => argument.startsWith('--input='))?.slice('--input='.length)
  || 'data/universities/us-universities-500.json';
const apply = process.argv.includes('--apply');
const requestedUnitId = process.argv.find((argument) => argument.startsWith('--unit-id='))?.slice('--unit-id='.length) || '';
const markPattern = /(?:logo|seal|crest|wordmark|coat[_ -]?of[_ -]?arms|favicon|emblem|mark[_-]?fallback)/i;

function isMark(value) {
  try {
    return markPattern.test(decodeURIComponent(String(value || '')));
  } catch {
    return markPattern.test(String(value || ''));
  }
}

const rows = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!Array.isArray(rows) || rows.length !== 500) {
  throw new Error(`Expected exactly 500 university records; found ${rows?.length ?? 0}.`);
}

const unsafe = rows.filter((row) => !row.hero_url || isMark(row.hero_url));
if (unsafe.length) {
  console.error(JSON.stringify({
    error: 'Catalog still contains non-photographic university heroes.',
    unsafe: unsafe.length,
    examples: unsafe.slice(0, 20).map((row) => ({ unit_id: row.unit_id, official_name: row.official_name })),
  }, null, 2));
  process.exit(2);
}

admin.initializeApp({ projectId });
const db = admin.firestore();
const byUnitId = new Map(rows.map((row) => [String(row.unit_id), row]));
const snapshot = await db.collection('atlases').where('is_public', '==', true).get();
const updates = [];
const missingCatalogAtlases = [];

for (const document of snapshot.docs) {
  const atlas = document.data();
  const university = atlas.university_config;
  if (atlas.wiki_type !== 'university' && university?.enabled !== true) continue;
  const row = byUnitId.get(String(university?.unit_id || ''));
  if (!row) {
    missingCatalogAtlases.push({ id: document.id, name: atlas.name, unit_id: university?.unit_id || null });
    continue;
  }
  if (requestedUnitId && String(row.unit_id) !== requestedUnitId) continue;
  const heroSource = {
    url: row.hero_url,
    page_url: row.hero_source_page || row.website || null,
    provider: row.hero_provider || row.hero_match || 'verified-campus-photo',
    title: row.hero_source_title || row.official_name,
    license: row.hero_license || null,
    fetched_at: row.hero_verified_at || row.source_fetched_at || new Date().toISOString(),
  };
  updates.push({
    ref: document.ref,
    patch: {
      hero_url: row.hero_url,
      logo_url: atlas.logo_url || row.logo_url || null,
      'chat_guide.banner_url': row.hero_url,
      'chat_guide.image_url': atlas.chat_guide?.image_url || row.logo_url || null,
      'university_config.hero_source': heroSource,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
  });
}

console.log(JSON.stringify({
  projectId,
  catalogRecords: rows.length,
  publicUniversityAtlases: updates.length,
  missingCatalogAtlases: missingCatalogAtlases.length,
  requestedUnitId: requestedUnitId || null,
  mode: apply ? 'apply' : 'dry-run',
}, null, 2));

if (missingCatalogAtlases.length) {
  console.warn(JSON.stringify({ missingCatalogAtlases: missingCatalogAtlases.slice(0, 25) }, null, 2));
}

if (apply) {
  for (let offset = 0; offset < updates.length; offset += 250) {
    const batch = db.batch();
    for (const update of updates.slice(offset, offset + 250)) batch.update(update.ref, update.patch);
    await batch.commit();
    console.log(`Committed ${Math.min(offset + 250, updates.length)} of ${updates.length} university hero updates.`);
  }
}
