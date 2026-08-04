const assert = require('node:assert/strict');
const {
  boardWizardCardWantsVideo,
  buildBoardWizardVideoSearchQuery,
  parseIso8601DurationSeconds,
  scoreBoardWizardVideoCandidate,
  youtubeVideoIdFromReference,
} = require('../lib/board-wizard-video.js');

const card = {
  title: 'Prince — Super Bowl XLI',
  entityName: 'Prince',
  imageContext: 'Super Bowl XLI halftime show · 2007',
  videoIntent: true,
  videoSearchQuery: 'Prince Super Bowl XLI halftime show official NFL',
};

assert.equal(boardWizardCardWantsVideo(card, 'Top 10 Super Bowl halftime shows'), true);
assert.equal(
  buildBoardWizardVideoSearchQuery(card, 'Top 10 Super Bowl halftime shows'),
  'Prince Super Bowl XLI halftime show official NFL',
);
assert.equal(youtubeVideoIdFromReference('https://youtu.be/M7lc1UVf-VE?t=3'), 'M7lc1UVf-VE');
assert.equal(youtubeVideoIdFromReference('https://example.com/M7lc1UVf-VE'), '');
assert.equal(parseIso8601DurationSeconds('PT12M34S'), 754);

const goodScore = scoreBoardWizardVideoCandidate(card, 'Top 10 Super Bowl halftime shows', {
  videoId: 'M7lc1UVf-VE',
  title: 'Prince performs at the Super Bowl XLI Halftime Show',
  channelTitle: 'NFL',
  thumbnailUrl: '',
  durationSeconds: 732,
  embeddable: true,
});
const badScore = scoreBoardWizardVideoCandidate(card, 'Top 10 Super Bowl halftime shows', {
  videoId: 'abcdefghijk',
  title: 'Best astronomy photographs explained',
  channelTitle: 'Space Channel',
  thumbnailUrl: '',
  durationSeconds: 300,
  embeddable: true,
});
assert.ok(goodScore >= 55);
assert.ok(badScore < 55);

console.log('Board wizard video quality checks passed.');
