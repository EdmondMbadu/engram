#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

const [atlasId, templateId, outputPath] = process.argv.slice(2);
if (!atlasId || !templateId || !outputPath) {
  throw new Error('Usage: node scripts/export-open-data-board-pilot.mjs <atlas-id> <template-id> <output-path>');
}

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { GLOBAL_CITY_BOARD_TEMPLATES } = require('../functions/lib/global-city-board-templates.js');
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a' });
const db = admin.firestore();

const template = GLOBAL_CITY_BOARD_TEMPLATES.find((candidate) => candidate.id === templateId);
if (!template) throw new Error(`Unknown template: ${templateId}`);
const generationKey = `${atlasId}__${template.id}__${template.version}`;
const cacheId = createHash('sha256').update(generationKey).digest('hex');
const [atlasSnapshot, cacheSnapshot] = await Promise.all([
  db.collection('atlases').doc(atlasId).get(),
  db.collection('bulk_board_candidate_sets').doc(cacheId).get(),
]);
if (!atlasSnapshot.exists) throw new Error(`Atlas not found: ${atlasId}`);
if (!cacheSnapshot.exists) throw new Error(`Candidate cache not found: ${cacheId}`);
const atlas = atlasSnapshot.data() || {};
const config = atlas.city_config || {};
const candidates = Array.isArray(cacheSnapshot.data()?.candidates) ? cacheSnapshot.data().candidates : [];
const uniqueCandidates = [...new Map(candidates
  .filter((candidate) => candidate?.placeId && candidate?.name)
  .map((candidate) => [candidate.placeId, candidate])).values()];

const payload = {
  city: config.city_name || atlas.name || atlasId,
  region: config.region_name || '',
  country: config.country_name || config.country_code || '',
  atlas_id: atlasId,
  template,
  generation_key: generationKey,
  candidates: uniqueCandidates.map((candidate) => ({
    place_id: candidate.placeId,
    name: candidate.name,
    address: candidate.address || '',
    latitude: candidate.lat,
    longitude: candidate.lng,
    types: Array.isArray(candidate.types) ? candidate.types : [],
    rating: candidate.rating ?? null,
    rating_count: candidate.ratingCount ?? 0,
    maps_url: candidate.googleMapsUrl || '',
  })),
};
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ outputPath, city: payload.city, candidateCount: payload.candidates.length })}\n`);
