const assert = require('node:assert/strict');
const {
  NEARBY_GEM_PRESETS,
  broadLocationLabel,
  googleDurationSeconds,
  haversineMeters,
  nearbyGemCategory,
  nearbyGemPreset,
  rankNearbyGemCandidates,
} = require('../lib/nearby-gems.js');

assert.equal(nearbyGemPreset('walk').maxDurationSeconds, 1800);
assert.equal(nearbyGemPreset('quick-drive').maxDurationSeconds, 600);
assert.equal(nearbyGemPreset('adventure').radiusMeters, 32186.88);
assert.equal(nearbyGemPreset('anything-else'), null);

assert.ok(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) > 111_000);
assert.ok(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) < 112_000);
assert.equal(googleDurationSeconds('615s'), 615);
assert.equal(googleDurationSeconds('12.4s'), 12);
assert.equal(googleDurationSeconds('12 minutes'), null);

assert.equal(
  broadLocationLabel([
    { longText: 'Cape May', types: ['locality'] },
    { longText: 'New Jersey', types: ['administrative_area_level_1'] },
  ]),
  'Cape May, New Jersey',
);

const candidate = (id, primaryType, duration, rating = 4.6, ratingCount = 250) => ({
  id,
  name: `Gem ${id}`,
  address: '1 Main Street',
  lat: 38.9,
  lng: -74.9,
  types: [primaryType],
  primaryType,
  rating,
  ratingCount,
  googleMapsUrl: `https://maps.example/${id}`,
  photoName: '',
  editorialSummary: '',
  straightLineMeters: 800,
  routeDurationSeconds: duration,
});

assert.equal(nearbyGemCategory(candidate('m', 'museum', 400)), 'Arts & culture');
assert.equal(nearbyGemCategory(candidate('p', 'park', 400)), 'Outdoors');
assert.equal(nearbyGemCategory(candidate('c', 'cafe', 400)), 'Food & drink');

const ranked = rankNearbyGemCandidates([
  candidate('museum-1', 'museum', 500),
  candidate('museum-1', 'museum', 500, 4.9, 10),
  candidate('park-1', 'park', 600),
  candidate('cafe-1', 'cafe', 700),
  candidate('book-1', 'book_store', 750),
  candidate('too-slow', 'museum', 1900),
  { ...candidate('too-far', 'park', 500), straightLineMeters: 4000 },
], NEARBY_GEM_PRESETS.walk, '', 8);

assert.deepEqual(new Set(ranked.map((item) => item.id)), new Set(['museum-1', 'park-1', 'cafe-1', 'book-1']));
assert.equal(ranked.filter((item) => item.id === 'museum-1').length, 1);

const preferenceRanked = rankNearbyGemCandidates([
  { ...candidate('history', 'historical_landmark', 500, 4.2, 25), editorialSummary: 'A quiet local history monument' },
  candidate('popular', 'cafe', 500, 4.8, 1000),
], NEARBY_GEM_PRESETS.walk, 'quiet history', 2);
assert.equal(preferenceRanked[0].id, 'history');

console.log('Nearby gems helpers passed.');
