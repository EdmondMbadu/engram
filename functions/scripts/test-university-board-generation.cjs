const assert = require('node:assert/strict');
const {
  GLOBAL_UNIVERSITY_BOARD_TEMPLATES,
  renderUniversityBoardTitle,
} = require('../lib/global-university-board-templates.js');
const { scoreGeneratedBoard } = require('../lib/board-generation-score.js');

assert.equal(GLOBAL_UNIVERSITY_BOARD_TEMPLATES.length, 7);
assert.equal(new Set(GLOBAL_UNIVERSITY_BOARD_TEMPLATES.map((template) => template.id)).size, 7);
assert.ok(GLOBAL_UNIVERSITY_BOARD_TEMPLATES.every((template) => template.count === 10));
assert.ok(GLOBAL_UNIVERSITY_BOARD_TEMPLATES.every((template) => template.editorialBrief.length > 120));
assert.equal(
  renderUniversityBoardTitle(GLOBAL_UNIVERSITY_BOARD_TEMPLATES[0], 'Penn State', 'State College'),
  '10 Late-Night Runs That Explain Penn State',
);

const now = new Date('2026-08-12T12:00:00.000Z');
const cards = Array.from({ length: 10 }, (_, index) => ({
  id: `card-${index}`,
  title: `Specific card ${index + 1}`,
  subtitle: `A concrete role for card ${index + 1}`,
  notes: `This is a deliberately specific evidence-backed explanation for card ${index + 1}. It contains enough detail to clear the thin-copy check without promotional filler.`,
  shortSummary: `A sourced summary for card ${index + 1}.`,
  entityName: `Entity ${index + 1}`,
  subjectType: 'place',
  sourceUrl: `https://example.edu/source-${index + 1}`,
  sourceTitle: `Official source ${index + 1}`,
  sourceFetchedAt: '2026-08-11T12:00:00.000Z',
  locationLat: 40 + index / 100,
  locationLng: -75 - index / 100,
}));
const strong = scoreGeneratedBoard({ cards, quality_warnings: [] }, { expectedCount: 10, freshnessDays: 120, now });
assert.equal(strong.score, 100);
assert.equal(strong.grade, 'A');

const strongTraditions = scoreGeneratedBoard({
  cards: cards.map((card) => ({
    ...card,
    subjectType: 'tradition',
    type: 'memory',
    locationLat: null,
    locationLng: null,
  })),
  quality_warnings: [],
}, { expectedCount: 10, freshnessDays: 120, now });
assert.equal(strongTraditions.score, 100, 'Non-geographic boards should not lose coordinate points.');

const weak = scoreGeneratedBoard({
  cards: cards.slice(0, 5).map((card) => ({
    ...card,
    title: 'Best hidden gem',
    notes: 'Thin.',
    sourceUrl: '',
    sourceTitle: '',
    sourceFetchedAt: '2024-01-01T00:00:00.000Z',
  })),
  quality_warnings: ['Needs review'],
}, { expectedCount: 10, freshnessDays: 120, now });
assert.ok(weak.score < 50);
assert.equal(weak.grade, 'F');
assert.ok(weak.reasons.length >= 4);

console.log('university board generation tests passed');
