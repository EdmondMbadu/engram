#!/usr/bin/env node

import { createRequire } from 'node:module';

const boardIds = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);
if (!boardIds.length) throw new Error('Pass one or more board IDs.');
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a' });
const db = admin.firestore();
const snapshots = await db.getAll(...boardIds.map((boardId) => db.collection('boards').doc(boardId)));
console.log(JSON.stringify(snapshots.map((snapshot) => {
  if (!snapshot.exists) return { id: snapshot.id, missing: true };
  const board = snapshot.data();
  return {
    id: snapshot.id,
    title: board.title || '',
    description: board.description || '',
    atlasId: board.atlas_id || '',
    generatedForAtlasId: board.generated_for_atlas_id || '',
    templateId: board.template_id || '',
    state: `${board.editorial_status || ''}/${board.city_listing_status || ''}/${board.visibility || ''}`,
    validationSummary: board.validation_summary || null,
    qualityWarnings: board.quality_warnings || [],
    cards: Array.isArray(board.cards) ? board.cards.map((card) => ({
      title: card.title || '',
      entityName: card.entityName || '',
      subtitle: card.subtitle || '',
      notes: card.notes || '',
      placeId: card.placeId || '',
      googleMapsUrl: card.googleMapsUrl || '',
      locationLat: card.locationLat,
      locationLng: card.locationLng,
    })) : [],
  };
}), null, 2));
process.exit(0);
