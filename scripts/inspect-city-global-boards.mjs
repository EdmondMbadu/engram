#!/usr/bin/env node

import { createRequire } from 'node:module';

const cityNames = process.argv.slice(2).map((value) => value.trim().toLowerCase()).filter(Boolean);
if (!cityNames.length) throw new Error('Pass one or more city names.');
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { GLOBAL_CITY_BOARD_TEMPLATES } = require('../functions/lib/global-city-board-templates.js');
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a' });
const db = admin.firestore();

const atlasSnapshot = await db.collection('atlases').where('is_public', '==', true).get();
const cities = atlasSnapshot.docs.flatMap((snapshot) => {
  const atlas = snapshot.data();
  const config = atlas.city_config || {};
  const cityName = String(config.city_name || atlas.name || '').replace(/^Living Wiki:\s*/i, '');
  return config.enabled === true && cityNames.includes(cityName.toLowerCase())
    ? [{ id: snapshot.id, name: cityName }]
    : [];
});
const output = [];
for (const city of cities) {
  const [boards, items, listings] = await Promise.all([
    db.collection('boards').where('atlas_id', '==', city.id).get(),
    db.collection('board_generation_items').where('atlas_id', '==', city.id).get(),
    db.collection('city_board_listings').where('atlas_id', '==', city.id).get(),
  ]);
  const listedBoardIds = new Set(listings.docs.map((document) => String(document.data().board_id || '')));
  const boardByTemplate = new Map(boards.docs.flatMap((document) => {
    const board = document.data();
    return board.origin === 'bulk_generator' ? [[board.template_id, { id: document.id, ...board }]] : [];
  }));
  const latestItemByTemplate = new Map();
  for (const document of items.docs) {
    const item = { id: document.id, ...document.data() };
    const current = latestItemByTemplate.get(item.template_id);
    if (!current || (item.updated_at?.toMillis?.() || 0) > (current.updated_at?.toMillis?.() || 0)) {
      latestItemByTemplate.set(item.template_id, item);
    }
  }
  output.push({
    city: city.name,
    atlasId: city.id,
    buckets: GLOBAL_CITY_BOARD_TEMPLATES.map((template) => {
      const board = boardByTemplate.get(template.id);
      const item = latestItemByTemplate.get(template.id);
      return {
        id: template.id,
        boardId: board?.id || '',
        boardState: board
          ? `${board.editorial_status || 'unknown'}/${board.city_listing_status || 'unknown'}/${board.visibility || 'unknown'}`
          : 'missing',
        listingProjection: board ? listedBoardIds.has(board.id) : false,
        generationState: item?.status || '',
        error: item?.error_message || '',
      };
    }),
  });
}
console.log(JSON.stringify(output, null, 2));
process.exit(0);
