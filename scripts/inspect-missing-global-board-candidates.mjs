#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { GLOBAL_CITY_BOARD_TEMPLATES } = require('../functions/lib/global-city-board-templates.js');
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a' });
const db = admin.firestore();

const [atlasSnapshot, boardSnapshot] = await Promise.all([
  db.collection('atlases').where('is_public', '==', true).get(),
  db.collection('boards').where('origin', '==', 'bulk_generator').get(),
]);
const cities = atlasSnapshot.docs.flatMap((document) => {
  const atlas = document.data();
  const config = atlas.city_config || {};
  return config.enabled === true ? [{
    id: document.id,
    city: config.city_name || atlas.name || document.id,
  }] : [];
});
const existing = new Set(boardSnapshot.docs.flatMap((document) => {
  const board = document.data();
  return board.deleted_at ? [] : [`${board.atlas_id}|${board.template_id}`];
}));
const missingIdentities = [];
for (const city of cities) {
  for (const template of GLOBAL_CITY_BOARD_TEMPLATES) {
    if (existing.has(`${city.id}|${template.id}`)) continue;
    const generationKey = `${city.id}__${template.id}__${template.version}`;
    const cacheId = createHash('sha256').update(generationKey).digest('hex');
    missingIdentities.push({ city, template, generationKey, cacheId });
  }
}
const cacheDocuments = [];
for (let offset = 0; offset < missingIdentities.length; offset += 100) {
  cacheDocuments.push(...await db.getAll(...missingIdentities.slice(offset, offset + 100)
    .map(({ cacheId }) => db.collection('bulk_board_candidate_sets').doc(cacheId))));
}
const caches = new Map(cacheDocuments.flatMap((document) => document.exists
  ? [[document.id, document.data()]]
  : []));
const missing = [];
for (const { city, template, generationKey, cacheId } of missingIdentities) {
  const cache = caches.get(cacheId);
  const candidates = Array.isArray(cache?.candidates) ? cache.candidates : [];
  missing.push({
    city: city.city,
    atlasId: city.id,
    templateId: template.id,
    candidateCount: new Set(candidates.map((candidate) => candidate?.placeId).filter(Boolean)).size,
    completedQueryCount: Array.isArray(cache?.completed_queries) ? cache.completed_queries.length : 0,
  });
}
const byTemplate = Object.fromEntries(GLOBAL_CITY_BOARD_TEMPLATES.map((template) => {
  const rows = missing.filter((row) => row.templateId === template.id);
  return [template.id, {
    missing: rows.length,
    withAtLeast10Candidates: rows.filter((row) => row.candidateCount >= 10).length,
    withAtLeast20Candidates: rows.filter((row) => row.candidateCount >= 20).length,
    withoutCache: rows.filter((row) => row.candidateCount === 0).length,
  }];
}));
process.stdout.write(`${JSON.stringify({
  cityCount: cities.length,
  expected: cities.length * GLOBAL_CITY_BOARD_TEMPLATES.length,
  present: existing.size,
  missing: missing.length,
  withAtLeast10Candidates: missing.filter((row) => row.candidateCount >= 10).length,
  withAtLeast20Candidates: missing.filter((row) => row.candidateCount >= 20).length,
  withoutCache: missing.filter((row) => row.candidateCount === 0).length,
  byTemplate,
  rows: missing,
}, null, 2)}\n`);
