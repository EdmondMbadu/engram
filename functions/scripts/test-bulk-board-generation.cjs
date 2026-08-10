const assert = require('node:assert/strict');
const {
  bulkBoardAntiSlopWarnings,
  bulkBoardDocumentId,
  bulkBoardGenerationKey,
  bulkBoardSuppressionId,
  normalizeBulkBoardTemplate,
  normalizeBulkBoardIcon,
  renderBulkBoardTitle,
} = require('../lib/bulk-board-generation.js');

const template = normalizeBulkBoardTemplate({
  id: ' Visitor Picks ',
  version: '2.1',
  titlePattern: '{count} places worth knowing in {city}',
  searchQuery: 'cultural attractions',
  editorialBrief: 'Stay specific.',
  count: 10,
  cardTitleMode: 'subject',
});

assert.deepEqual(template, {
  id: 'visitor-picks',
  version: '2.1',
  titlePattern: '{count} places worth knowing in {city}',
  searchQuery: 'cultural attractions',
  editorialBrief: 'Stay specific.',
  count: 10,
  cardTitleMode: 'subject',
});
assert.equal(renderBulkBoardTitle(template, 'Philadelphia'), '10 places worth knowing in Philadelphia');
assert.equal(
  renderBulkBoardTitle(normalizeBulkBoardTemplate({ titlePattern: 'Only Happens Here' }), 'Philadelphia'),
  'Only Happens Here',
);
assert.equal(
  renderBulkBoardTitle(normalizeBulkBoardTemplate({ titlePattern: '10 Dishes That Explain [City]' }), 'Philadelphia'),
  '10 Dishes That Explain Philadelphia',
);
assert.equal(normalizeBulkBoardTemplate({ titlePattern: '{city}', count: 200 }).count, 20);
assert.equal(normalizeBulkBoardTemplate({ titlePattern: '{city}', count: 1 }).count, 3);
assert.equal(normalizeBulkBoardIcon('Handball'), 'sports_handball');
assert.equal(normalizeBulkBoardIcon('eb', 'Best museums in Philadelphia'), 'museum');
assert.equal(normalizeBulkBoardIcon('unknown-model-output'), 'location_city');

const key = bulkBoardGenerationKey('atlas-philly', template);
assert.equal(key, 'atlas-philly__visitor-picks__2.1');
assert.equal(bulkBoardDocumentId(key), bulkBoardDocumentId(key));
assert.match(bulkBoardDocumentId(key), /^bulk_[a-f0-9]{28}$/);
assert.match(bulkBoardSuppressionId(key), /^[a-f0-9]{64}$/);
assert.notEqual(
  bulkBoardDocumentId(key),
  bulkBoardDocumentId(bulkBoardGenerationKey('atlas-vegas', template)),
);

const warnings = bulkBoardAntiSlopWarnings({
  board: { title: 'A vibrant list', description: 'Look no further', icon: '', tone: 'teal' },
  cards: [{ subtitle: 'A hidden gem', notes: 'Something for everyone' }],
});
assert.deepEqual(warnings, [
  'Avoid generic phrase: “hidden gem”.',
  'Avoid generic phrase: “vibrant”.',
  'Avoid generic phrase: “something for everyone”.',
  'Avoid generic phrase: “look no further”.',
]);

console.log('bulk board generation tests passed');
