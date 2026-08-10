const assert = require('node:assert/strict');
const {
  stackVideoNarrationCardFromBoard,
  stackVideoNarrationTextFromCard,
} = require('../lib/stack-video-narration.js');

const board = {
  cards: [
    { id: 'card-1', title: 'First card', notes: 'Canonical first narration.' },
    { id: 'card-2', title: 'Second card', notes: 'Notes.', tour: { guideScript: 'Guide narration.' } },
    { id: 'card-3', title: 'Title-only card' },
  ],
};

assert.equal(stackVideoNarrationCardFromBoard(board, 'card-2')?.id, 'card-2');
assert.equal(stackVideoNarrationCardFromBoard(board, 'missing'), null);
assert.equal(stackVideoNarrationTextFromCard(board.cards[0]), 'Canonical first narration.');
assert.equal(stackVideoNarrationTextFromCard(board.cards[1]), 'Guide narration.');
assert.equal(stackVideoNarrationTextFromCard(board.cards[2]), 'Title-only card.');

console.log('Stack video narration checks passed.');
