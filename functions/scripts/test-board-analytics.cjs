const assert = require('node:assert/strict');
const {
  analyticsDateKeys,
  classifyBoardAnalyticsSource,
  normalizeAnalyticsCampaign,
} = require('../lib/board-analytics');

assert.deepEqual(
  analyticsDateKeys(7, new Date('2026-08-19T23:00:00.000Z')),
  ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19'],
);
assert.equal(classifyBoardAnalyticsSource('facebook', 'social', ''), 'facebook');
assert.equal(classifyBoardAnalyticsSource('instagram', 'social', ''), 'instagram');
assert.equal(classifyBoardAnalyticsSource('linkedin', 'social', ''), 'linkedin');
assert.equal(classifyBoardAnalyticsSource('x-twitter', 'social', ''), 'x-twitter');
assert.equal(classifyBoardAnalyticsSource('whatsapp', 'messaging', ''), 'whatsapp');
assert.equal(classifyBoardAnalyticsSource('qr-code', 'qr', ''), 'qr-code');
assert.equal(classifyBoardAnalyticsSource('partner-website', 'referral', ''), 'partner-website');
assert.equal(classifyBoardAnalyticsSource('', '', 'https://www.facebook.com/groups/capemay'), 'facebook');
assert.equal(classifyBoardAnalyticsSource('', '', 'https://x.com/livingwiki'), 'x-twitter');
assert.equal(classifyBoardAnalyticsSource('', '', 'https://www.google.com/search?q=cape+may'), 'google');
assert.equal(classifyBoardAnalyticsSource('', '', ''), 'direct');
assert.equal(normalizeAnalyticsCampaign(' Cape May 40,000 Group! '), 'cape-may-40-000-group');

console.log('Board analytics tests passed.');
