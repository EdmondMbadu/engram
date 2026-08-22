const assert = require('node:assert/strict');
const { boardDocExportTestHelpers } = require('../lib/board-doc-export.js');

const snapshot = {
  requestId: 'request-test',
  boardId: 'board-test',
  documentTitle: 'The Framers — Script & Images',
  sourceUrl: 'https://livingwiki.com/boards/board-test',
  ownerName: 'LivingWiki',
  exportedAt: '2026-08-21T12:00:00.000Z',
  opening: { title: 'The Framers', description: 'The complete board opening.', coverImageUrl: 'cover' },
  cards: [
    { id: 'washington', position: 1, title: 'George Washington', narration: 'The full first script, without truncation.', imageUrls: ['washington'], sourceUrl: '', wordCount: 6, estimatedSeconds: 3 },
    { id: 'franklin', position: 2, title: 'Benjamin Franklin', narration: '', imageUrls: [], sourceUrl: 'https://example.com/franklin', wordCount: 0, estimatedSeconds: 0 },
  ],
  closing: { included: true, headline: 'Keep exploring', message: 'Open the complete board.', imageUrl: 'closing', qrImageUrl: 'qr' },
  productionNotes: { included: true, narrator: 'Warm Storyteller', music: 'No music', format: 'Reel', ratio: 'Vertical', socialCaption: 'Share this Stack.' },
};
const preparedImages = new Map([
  ['cover', { url: 'https://storage.example/cover.jpg', label: 'Cover image', widthPt: 450 }],
  ['washington', { url: 'https://storage.example/washington.jpg', label: 'Washington image', widthPt: 430 }],
  ['closing', { url: 'https://storage.example/closing.jpg', label: 'Closing image', widthPt: 430 }],
  ['qr', { url: 'https://storage.example/qr.png', label: 'QR', widthPt: 120 }],
]);

const plan = boardDocExportTestHelpers.buildDocumentPlan(snapshot, preparedImages);
assert.match(plan.text, /The complete board opening\./);
assert.match(plan.text, /The full first script, without truncation\./);
assert.match(plan.text, /Narration not provided\./);
assert.match(plan.text, /Production Notes/);
assert.equal(plan.markers.filter((marker) => marker.kind === 'image').length, 4);
assert.equal(plan.markers.filter((marker) => marker.kind === 'page-break').length, 4);
assert.ok(plan.styles.some((style) => style.namedStyleType === 'TITLE'));
assert.ok(plan.styles.some((style) => style.namedStyleType === 'HEADING_1'));

assert.equal(boardDocExportTestHelpers.privateIp('127.0.0.1'), true);
assert.equal(boardDocExportTestHelpers.privateIp('10.1.2.3'), true);
assert.equal(boardDocExportTestHelpers.privateIp('192.168.1.1'), true);
assert.equal(boardDocExportTestHelpers.privateIp('8.8.8.8'), false);
assert.equal(boardDocExportTestHelpers.privateIp('::1'), true);

console.log('Board Google Docs export tests passed.');
