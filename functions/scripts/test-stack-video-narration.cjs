const assert = require('node:assert/strict');
const {
  sharedStackNarrationCacheMode,
  stackVideoNarrationCardFromBoard,
  stackVideoNarrationRevisionCacheKey,
  stackVideoNarrationRevisionFromCard,
  stackVideoNarrationTextFromCard,
  boardTrailerFallbackScript,
  normalizeBoardTrailerScript,
} = require('../lib/stack-video-narration.js');

assert.equal(sharedStackNarrationCacheMode('tour'), 'tour');
assert.equal(sharedStackNarrationCacheMode('stack-video'), 'tour');
assert.equal(sharedStackNarrationCacheMode('stack-trailer'), 'stack-trailer');

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
assert.equal(stackVideoNarrationRevisionFromCard({ videoNarrationRevision: 4.8 }), 4);
assert.equal(stackVideoNarrationRevisionFromCard({ videoNarrationRevision: -10 }), 0);
assert.equal(stackVideoNarrationRevisionFromCard({ videoNarrationRevision: 'not-a-number' }), 0);
assert.equal(stackVideoNarrationRevisionCacheKey({ videoNarrationRevision: 0 }), '');
assert.equal(stackVideoNarrationRevisionCacheKey({ videoNarrationRevision: 5 }), ':r5');

const fallback = boardTrailerFallbackScript({
  title: 'Ten Dishes That Explain Philadelphia',
  cardTitles: ['Cheesesteak', 'Water ice', 'Tomato pie'],
});
assert.match(fallback, /Ten Dishes That Explain Philadelphia/);
assert.match(fallback, /3 carefully chosen cards/);
assert.equal(normalizeBoardTrailerScript('Too short.', fallback), fallback);
assert.equal(
  normalizeBoardTrailerScript('Embark on an iconic and breathtaking journey through this vibrant board, with enough generic words to pass an ordinary length check but not the LivingWiki voice rules.', fallback),
  fallback,
);
assert.equal(
  normalizeBoardTrailerScript('A polished trailer script with enough grounded words to pass the safety length check and remain suitable for one continuous, curious, inviting board voiceover today.', fallback),
  'A polished trailer script with enough grounded words to pass the safety length check and remain suitable for one continuous, curious, inviting board voiceover today.',
);

console.log('Stack video narration checks passed.');
