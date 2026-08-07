const assert = require('node:assert/strict');
const {
  alignBoardWizardSourceCards,
  boardWizardSourceManifestIsExact,
  extractBoardWizardArticleManifest,
  extractBoardWizardArticleManifestFromMarkdown,
  normalizeBoardWizardSourceManifest,
} = require('../lib/board-wizard-article.js');

const html = `<!doctype html><html><head>
  <title>15 Most Underrated US Travel Destinations Revealed</title>
  <meta property="og:site_name" content="Example News">
  <script>window.noisyNavigation = ${JSON.stringify('x'.repeat(10_000))}</script>
</head><body>
  <nav>Politics Sports Subscribe Sign In Advertisement</nav>
  <article>
    <p>Experts shared destinations that deserve more attention.</p>
    ${[
      ['Cumberland Island, Georgia', 'Wild horses and quiet beaches make this remote island memorable.'],
      ['Bosque del Apache, New Mexico', 'Winter bird migrations create a remarkable wildlife experience.'],
      ['Santa Fe and Taos in New Mexico', 'These two towns combine art, heritage, food, and desert scenery.'],
      ['Murrells Inlet, South Carolina', 'The MarshWalk and nearby preserves offer a slower coastal visit.'],
      ['Culpeper, Virginia', 'History, vineyards, restaurants, and small-town character reward a visit.'],
      ['Cedar Rapids, Iowa', 'Museums, historic districts, and public art make the city inviting.'],
      ['Cape May, New Jersey', 'Victorian architecture and a scenic shoreline distinguish this town.'],
      ['San Luis Obispo, California', 'Markets, wine country, food, and outdoor recreation fill a weekend.'],
      ['Kodiak Island, Alaska', 'A dramatic coastline and brown bears create a rugged escape.'],
      ['Assateague Island in Maryland and Virginia', 'Wild ponies and undeveloped beaches welcome campers and kayakers.'],
      ['Mackinac Island, Michigan', 'A car-free pace, bicycles, and horse-drawn carriages define the island.'],
      ['Jacksonville, Florida', 'Distinctive beaches and walkable neighborhoods retain a local feel.'],
      ['Oregon Beyond the Usual Hotspots', 'High desert and wilderness areas offer wildlife and solitude.'],
      ['Big Bend, Texas', 'Hiking and night skies reward travelers in this remote national park.'],
    ].map(([title, text], index) => `<h2>${title}</h2><p>${text}</p><figure><img src="/photos/${index + 1}.jpg"></figure>`).join('')}
  </article>
  <footer>Terms Privacy Related Stories Newsletter</footer>
</body></html>`;

const manifest = extractBoardWizardArticleManifest(
  'https://news.example/travel/underrated',
  'https://news.example/travel/underrated',
  html,
);
assert.ok(manifest);
assert.equal(manifest.pageTitle, '15 Most Underrated US Travel Destinations Revealed');
assert.equal(manifest.siteName, 'Example News');
assert.equal(manifest.expectedCount, 15);
assert.equal(manifest.items.length, 15);
assert.deepEqual(manifest.items.slice(2, 4).map((item) => item.title), [
  'Santa Fe, New Mexico',
  'Taos, New Mexico',
]);
assert.equal(manifest.items[0].imageUrl, 'https://news.example/photos/1.jpg');
assert.equal(manifest.items.at(-1).title, 'Big Bend, Texas');
assert.equal(boardWizardSourceManifestIsExact(manifest), true);

const aligned = alignBoardWizardSourceCards(manifest.items.slice(0, 3), [
  { title: manifest.items[2].title, marker: 'third' },
  { title: manifest.items[0].title, marker: 'first' },
  { title: manifest.items[1].title, marker: 'second' },
]);
assert.deepEqual(aligned.map(({ card }) => card.marker), ['first', 'second', 'third']);

const normalized = normalizeBoardWizardSourceManifest(JSON.parse(JSON.stringify(manifest)), manifest.sourceUrl);
assert.deepEqual(normalized, manifest);
assert.equal(normalizeBoardWizardSourceManifest(manifest, 'https://different.example/article'), null);

const reader = extractBoardWizardArticleManifestFromMarkdown('https://news.example/list', `
Title: 3 Quiet Coastal Destinations
## Cape One
![Cape One](https://news.example/one.jpg)
The first cape has walking trails and a quiet harbor.
## Island Two
The second island is known for wildlife and empty beaches.
## Bay Three
The third bay combines historic streets with a working waterfront.
`);
assert.ok(reader);
assert.equal(reader.method, 'reader');
assert.equal(reader.items.length, 3);
assert.equal(reader.items[0].imageUrl, 'https://news.example/one.jpg');

assert.equal(extractBoardWizardArticleManifest(
  'https://news.example/story',
  'https://news.example/story',
  '<html><body><article><h2>Only one section</h2><p>Not a list.</p></article></body></html>',
), null);

console.log('board wizard article source tests passed');
