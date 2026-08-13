const assert = require('node:assert/strict');
const {
  cityBoardAtlasId,
  cityBoardListingId,
  cityBoardListingPayload,
  isPublicCityBoard,
} = require('../lib/city-board-listing.js');

const board = {
  atlas_id: 'atlas-philadelphia',
  visibility: 'public',
  editorial_status: 'published',
  city_listing_status: 'listed',
  title: '  Philadelphia Essentials  ',
  description: 'A precise city board.',
  icon: 'travel_explore',
  tone: 'teal',
  imageUrl: 'https://example.com/cover.jpg',
  cards: [{ id: '1' }, { id: '2' }],
  city_feature_order: 3,
};

assert.equal(cityBoardAtlasId(board), 'atlas-philadelphia');
assert.equal(isPublicCityBoard(board), true);
assert.equal(isPublicCityBoard({ ...board, visibility: 'private' }), false);
assert.equal(isPublicCityBoard({ ...board, editorial_status: 'needs_review' }), false);
assert.equal(isPublicCityBoard({ ...board, city_listing_status: 'removed' }), false);
assert.equal(isPublicCityBoard({ ...board, deleted_at: new Date() }), false);
assert.equal(cityBoardListingId('atlas-philadelphia', 'board-1'), cityBoardListingId('atlas-philadelphia', 'board-1'));
assert.notEqual(cityBoardListingId('atlas-philadelphia', 'board-1'), cityBoardListingId('atlas-chicago', 'board-1'));

assert.deepEqual(cityBoardListingPayload('board-1', board), {
  board_id: 'board-1',
  atlas_id: 'atlas-philadelphia',
  title: 'Philadelphia Essentials',
  description: 'A precise city board.',
  icon: 'travel_explore',
  tone: 'teal',
  image_url: 'https://example.com/cover.jpg',
  kind: 'standard',
  card_count: 2,
  publisher_name: 'LivingWiki',
  publisher_type: '',
  template_id: '',
  category_id: '',
  topic_ids: [],
  featured_rank: 3,
  approved_at: null,
  updated_at_iso: '',
  visibility: 'public',
  editorial_status: 'published',
  city_listing_status: 'listed',
});

assert.throws(() => cityBoardListingPayload('board-2', { ...board, visibility: 'private' }));
console.log('city board listing tests passed');
