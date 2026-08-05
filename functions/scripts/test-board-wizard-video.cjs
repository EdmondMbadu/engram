const assert = require('node:assert/strict');
const {
  boardWizardCardWantsVideo,
  buildBoardWizardYouTubeApiQuery,
  buildBoardWizardRelatedVideoSearchQuery,
  buildBoardWizardVideoSearchQuery,
  parseIso8601DurationSeconds,
  scoreBoardWizardVideoCandidate,
  youtubeVideoIdFromReference,
} = require('../lib/board-wizard-video.js');
const { youtubeEmbedBodyIsPlayable } = require('../lib/youtube-embed-verifier.js');

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
assert.equal(
  buildBoardWizardRelatedVideoSearchQuery(card),
  'Prince Prince — Super Bowl XLI interview performance analysis',
);
assert.equal(
  buildBoardWizardYouTubeApiQuery('Katy Perry Super Bowl XLIX halftime show official NFL'),
  'Katy Perry Super Bowl XLIX halftime show official NFL full performance',
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

const fullPerformanceScore = scoreBoardWizardVideoCandidate(card, 'Top 10 Super Bowl halftime shows', {
  videoId: 'fullshow123',
  title: 'Prince Super Bowl XLI Halftime Show Full Performance',
  channelTitle: 'Performance Archive',
  thumbnailUrl: '',
  durationSeconds: 740,
  embeddable: true,
});
const commentaryScore = scoreBoardWizardVideoCandidate(card, 'Top 10 Super Bowl halftime shows', {
  videoId: 'behind12345',
  title: 'The Facts Behind Prince and the Super Bowl XLI Halftime Show',
  channelTitle: 'NFL Network',
  thumbnailUrl: '',
  durationSeconds: 210,
  embeddable: true,
});
assert.ok(fullPerformanceScore > commentaryScore + 50);

const wrongSingleNameScore = scoreBoardWizardVideoCandidate({
  ...card,
  title: 'Beyoncé: Super Bowl XLVII',
  entityName: 'Beyoncé',
  videoSearchQuery: 'Beyoncé Super Bowl XLVII halftime show official NFL',
}, 'Top 10 Super Bowl halftime shows', {
  videoId: 'rihanna1234',
  title: "Rihanna's Full Super Bowl LVII Halftime Show",
  channelTitle: 'NFL',
  thumbnailUrl: '',
  durationSeconds: 780,
  embeddable: true,
});
assert.equal(wrongSingleNameScore, -1);
assert.equal(youtubeEmbedBodyIsPlayable('Video unavailable. Watch on YouTube', true, true), false);
assert.equal(youtubeEmbedBodyIsPlayable('Prince performance channel controls', true, false), true);

console.log('Board wizard video quality checks passed.');
