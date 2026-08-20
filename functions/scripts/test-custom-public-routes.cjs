const assert = require('node:assert/strict');
const {
  customPublicRouteSlugError,
  normalizeCustomPublicRouteSlug,
  publicBoardRouteKey,
} = require('../lib/custom-public-routes');

assert.equal(normalizeCustomPublicRouteSlug(' Cape May Gems! '), 'cape-may-gems');
assert.equal(normalizeCustomPublicRouteSlug('Montréal___Cafés'), 'montreal-cafes');
assert.match(customPublicRouteSlugError('admin'), /reserved/i);
assert.match(customPublicRouteSlugError('ab'), /at least/i);
assert.match(customPublicRouteSlugError('750dfe0a-d492-4965-86dd-b8dcc2d98aca'), /system-style/i);
assert.equal(customPublicRouteSlugError('cape-may-gems'), null);
assert.equal(publicBoardRouteKey('board-123', ' Watkins Glen Gems '), 'watkins-glen-gems');
assert.equal(publicBoardRouteKey('board-123', 'admin'), 'board-123');
assert.equal(publicBoardRouteKey('board-123', ''), 'board-123');

console.log('Custom public route tests passed.');
