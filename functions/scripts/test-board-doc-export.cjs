const assert = require('node:assert/strict');
const JSZip = require('jszip');
const mammoth = require('mammoth');
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
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZBxQAAAAASUVORK5CYII=',
  'base64',
);
const preparedImage = (label, widthPt) => ({
  buffer: pixel,
  extension: 'png',
  contentType: 'image/png',
  width: 1,
  height: 1,
  label,
  widthPt,
});
const preparedImages = new Map([
  ['cover', preparedImage('Cover image', 450)],
  ['washington', preparedImage('Washington image', 430)],
  ['closing', preparedImage('Closing image', 430)],
  ['qr', preparedImage('QR', 120)],
]);

(async () => {
  const buffer = await boardDocExportTestHelpers.createDocxBuffer(snapshot, preparedImages);
  assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK');

  const archive = await JSZip.loadAsync(buffer);
  const requiredFiles = [
    '[Content_Types].xml',
    '_rels/.rels',
    'word/document.xml',
    'word/styles.xml',
    'word/_rels/document.xml.rels',
    'docProps/core.xml',
    'docProps/app.xml',
  ];
  requiredFiles.forEach((path) => assert.ok(archive.file(path), `${path} should be in the DOCX package`));

  const documentXml = await archive.file('word/document.xml').async('string');
  assert.match(documentXml, /The complete board opening\./);
  assert.match(documentXml, /The full first script, without truncation\./);
  assert.match(documentXml, /Narration not provided\./);
  assert.match(documentXml, /Production Notes/);
  assert.match(documentXml, /Share this Stack\./);
  assert.equal((documentXml.match(/<w:br w:type="page"\/>/g) ?? []).length, 4);
  assert.equal((documentXml.match(/<w:drawing>/g) ?? []).length, 4);

  const relationships = await archive.file('word/_rels/document.xml.rels').async('string');
  for (let index = 1; index <= 4; index += 1) {
    assert.ok(archive.file(`word/media/image${index}.png`), `image${index}.png should be embedded`);
    assert.match(relationships, new RegExp(`Target="media/image${index}\\.png"`));
  }

  const parsed = await mammoth.extractRawText({ buffer });
  assert.match(parsed.value, /The full first script, without truncation\./);
  assert.match(parsed.value, /Benjamin Franklin/);
  assert.equal(parsed.messages.filter((message) => message.type === 'error').length, 0);

  assert.equal(boardDocExportTestHelpers.privateIp('127.0.0.1'), true);
  assert.equal(boardDocExportTestHelpers.privateIp('10.1.2.3'), true);
  assert.equal(boardDocExportTestHelpers.privateIp('192.168.1.1'), true);
  assert.equal(boardDocExportTestHelpers.privateIp('8.8.8.8'), false);
  assert.equal(boardDocExportTestHelpers.privateIp('::1'), true);

  assert.equal(boardDocExportTestHelpers.isRetryableImageStatus(429), true);
  assert.equal(boardDocExportTestHelpers.isRetryableImageStatus(503), true);
  assert.equal(boardDocExportTestHelpers.isRetryableImageStatus(404), false);
  assert.equal(boardDocExportTestHelpers.imageRetryDelayMs(null, 0), 1_000);
  assert.equal(boardDocExportTestHelpers.imageRetryDelayMs('3', 0), 3_000);
  assert.equal(boardDocExportTestHelpers.imageRetryDelayMs('120', 4), 15_000);

  let fetchAttempts = 0;
  const retryDelays = [];
  const response = await boardDocExportTestHelpers.fetchImageResponse(
    new URL('https://images.example/photo.jpg'),
    async () => {
      fetchAttempts += 1;
      return fetchAttempts < 3
        ? new Response('', { status: fetchAttempts === 1 ? 429 : 503 })
        : new Response(pixel, { status: 200, headers: { 'content-type': 'image/png' } });
    },
    async (milliseconds) => { retryDelays.push(milliseconds); },
  );
  assert.equal(response.status, 200);
  assert.equal(fetchAttempts, 3);
  assert.deepEqual(retryDelays, [1_000, 2_000]);

  console.log('Board DOCX export tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
