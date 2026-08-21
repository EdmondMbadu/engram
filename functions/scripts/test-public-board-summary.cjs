const assert = require('node:assert/strict');
const { publicBoardSummaryFromBoard } = require('../lib/public-board-summary.js');

const board = {
  owner_user_id: 'owner-1',
  owner_public_slug: 'jim-walker',
  owner_display_name: 'Jim Walker',
  visibility: 'public',
  title: 'Fast boards',
  description: 'A compact public shelf.',
  imageUrl: 'https://images.example/original.jpg',
  cards: [
    { id: 'one', title: 'Keep', status: 'saved', notes: 'large private-to-the-detail payload' },
    { id: 'two', title: 'Skip', status: 'favorite', notes: 'another large payload' },
  ],
  created_at_iso: '2026-08-21T00:00:00.000Z',
  updated_at_iso: '2026-08-21T01:00:00.000Z',
};

const summary = publicBoardSummaryFromBoard('board-1', board, {
  sourceImageUrl: board.imageUrl,
  imageUrl: 'https://storage.example/cover.jpg',
  webpSrcset: 'https://storage.example/cover-320.webp 320w, https://storage.example/cover-640.webp 640w',
  width: 960,
  height: 540,
});

assert.equal(summary.id, 'board-1');
assert.equal(summary.visibility, 'public');
assert.equal(summary.is_root, true);
assert.equal(summary.card_count, 2);
assert.equal(summary.favorite_card_count, 1);
assert.equal(summary.search_text, 'Keep Skip');
assert.equal(summary.imageUrl, 'https://storage.example/cover.jpg');
assert.equal(summary.source_image_url, board.imageUrl);
assert.equal('cards' in summary, false);
assert.equal(JSON.stringify(summary).includes('large private-to-the-detail payload'), false);

const nested = publicBoardSummaryFromBoard('board-2', {
  ...board,
  parentCardId: 'parent-card',
  visibility: 'private',
}, null);
assert.equal(nested.is_root, false);
assert.equal(nested.visibility, 'private');
assert.equal(nested.imageUrl, board.imageUrl);

console.log('public board summary tests passed');
