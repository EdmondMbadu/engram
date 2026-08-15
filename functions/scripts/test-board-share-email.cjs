const assert = require('node:assert/strict');
const {
  buildDirectBoardShareEmail,
  safeBoardShareImageUrl,
} = require('../lib/board-share-email.js');

const base = {
  recipientName: 'Alex',
  recipientEmail: 'alex@example.com',
  senderName: 'Edmond Mbadu',
  boardTitle: 'Finger Lakes & Beyond',
  boardDescription: 'Waterfalls, museums, and lakeside retreats.',
  boardCoverImageUrl: 'https://firebasestorage.googleapis.com/v0/b/example/o/cover.jpg?alt=media',
  boardUrl: 'https://livingwiki.com/boards/board-123',
};

const withCover = buildDirectBoardShareEmail(base);
assert.match(withCover.subject, /Edmond Mbadu shared/);
assert.match(withCover.html, /A board shared with you/);
assert.match(withCover.html, /<img src="https:\/\/firebasestorage\.googleapis\.com/);
assert.match(withCover.html, /href="https:\/\/livingwiki\.com\/boards\/board-123"/);
assert.match(withCover.text, /Open the board:/);

const withoutCover = buildDirectBoardShareEmail({
  ...base,
  boardCoverImageUrl: 'data:image/png;base64,unsafe',
});
assert.doesNotMatch(withoutCover.html, /<img /);
assert.equal(safeBoardShareImageUrl('http://127.0.0.1/private.png'), '');
assert.equal(safeBoardShareImageUrl('https://example.com/cover.svg'), '');

const escaped = buildDirectBoardShareEmail({
  ...base,
  senderName: '<Edmond>',
  boardTitle: 'A "special" board',
});
assert.doesNotMatch(escaped.html, /<Edmond>/);
assert.match(escaped.html, /&lt;Edmond&gt;/);
assert.match(escaped.html, /A &quot;special&quot; board/);

console.log('Board share email template tests passed.');
