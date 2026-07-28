const assert = require('node:assert/strict');
const {
  detectBoardSourceLanguage,
  extractBoardTranslationSource,
  normalizeTranslatedBoardSegments,
} = require('../lib/board-translation.js');

const board = {
  title: 'Cannery Row places',
  description: 'A short guide to waterfront landmarks.',
  stackCtaLabel: 'Book a tour',
  stackCtaUrl: 'https://example.com/book',
  cards: [
    {
      id: 'card-1',
      title: 'Steinbeck Plaza',
      subtitle: 'Historic waterfront plaza',
      notes: 'Meet beside the monument.',
      googleMapsUrl: 'https://maps.google.com/?q=Steinbeck+Plaza',
      what3wordsAddress: '///candy.sage.sticks',
      price: '$12.50',
      tags: ['history', 'waterfront'],
      tour: {
        address: 'Cannery Row, Monterey, CA',
        guideScript: 'Pause here to hear the story.',
        legToNext: {
          instruction: 'Walk toward the aquarium.',
          navScript: 'Continue west for two blocks.',
          encodedPolyline: 'exact-polyline',
        },
      },
    },
  ],
  learningQuiz: {
    title: 'Quick challenge',
    description: 'Test what you learned.',
    questions: [
      {
        sourceCardTitle: 'Steinbeck Plaza',
        prompt: 'Where should you meet?',
        explanation: 'The monument is the meeting point.',
        options: [{ id: 'a', text: 'Beside the monument' }],
      },
    ],
  },
};

const source = extractBoardTranslationSource(board);
assert.ok(source.segments.some((segment) => segment.key === 'board.title'));
assert.ok(source.segments.some((segment) => segment.key === 'cards.0.tour.legToNext.navScript'));
assert.ok(source.segments.some((segment) => segment.key === 'board.learningQuiz.questions.0.options.0.text'));
assert.ok(!source.segments.some((segment) => segment.text.includes('maps.google.com')));
assert.ok(!source.segments.some((segment) => segment.text.includes('///candy.sage.sticks')));
assert.ok(!source.segments.some((segment) => segment.text.includes('$12.50')));

const sameSource = extractBoardTranslationSource(structuredClone(board));
assert.equal(source.fingerprint, sameSource.fingerprint);
const changedBoard = structuredClone(board);
changedBoard.cards[0].notes = 'Meet at the fountain.';
assert.notEqual(source.fingerprint, extractBoardTranslationSource(changedBoard).fingerprint);

const translated = normalizeTranslatedBoardSegments(source.segments, [
  { key: 'board.title', text: 'Lieux de Cannery Row' },
  { key: 'cards.0.title', text: 'Place Steinbeck' },
  { key: 'not.allowed', text: 'ignored' },
]);
assert.equal(translated.find((segment) => segment.key === 'board.title').text, 'Lieux de Cannery Row');
assert.equal(
  translated.find((segment) => segment.key === 'cards.0.subtitle').text,
  'Historic waterfront plaza',
);
assert.equal(translated.length, source.segments.length);

assert.equal(detectBoardSourceLanguage('これは日本語のボードです。'), 'ja');
assert.equal(
  detectBoardSourceLanguage('Une promenade dans la ville avec les meilleurs lieux et des histoires locales.'),
  'fr',
);
assert.equal(detectBoardSourceLanguage('A walk through the city with local stories.'), 'en');

console.log('Board translation extraction and validation tests passed.');
