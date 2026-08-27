const assert = require('node:assert/strict');
const {
  allowedStoredTourHandoffTexts,
  buildStoredTourHandoffFallback,
  effectiveStoredTourHandoffText,
  orderedStoredTourHandoffCards,
} = require('../lib/tour-handoff.js');

const board = {
  kind: 'walking-tour',
  cards: [
    {
      id: 'town-house',
      title: 'Inverness Town House',
      shortSummary: 'The Victorian civic landmark at the heart of the High Street.',
      subtitle: '',
      notes: '',
      tour: { sequence: 2, legToNext: null },
    },
    {
      id: 'flora',
      title: 'Flora MacDonald Statue',
      subtitle: '',
      notes: '',
      tour: {
        sequence: 1,
        legToNext: {
          durationText: '3 min',
          distanceText: '0.2 mi',
          instruction: 'Walk to Inverness Town House.',
          navScript: 'From Flora MacDonald Statue, walk about a short distance, roughly nearby, to your next stop: Inverness Town House.',
          toCardId: 'town-house',
        },
      },
    },
  ],
};

const cards = orderedStoredTourHandoffCards(board.cards);
assert.deepEqual(cards.map((card) => card.id), ['flora', 'town-house']);
const expected = "Next stop: Inverness Town House. The Victorian civic landmark at the heart of the High Street. You should reach it in about 3 min on foot, around 0.2 mi. I'll meet you there.";
assert.equal(buildStoredTourHandoffFallback(cards[0], cards[1], 'walking'), expected);
assert.equal(effectiveStoredTourHandoffText(cards[0], cards[1], 'walking'), expected);
assert.ok(allowedStoredTourHandoffTexts(board).has(expected));
assert.ok(!allowedStoredTourHandoffTexts(board).has('Read an unrelated arbitrary message.'));

console.log('Tour handoff checks passed.');
