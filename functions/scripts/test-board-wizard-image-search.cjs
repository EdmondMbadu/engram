const assert = require('node:assert/strict');
const {
  rankBoardWizardImageSearchResults,
  searchBraveImages,
} = require('../lib/board-wizard-image-search.js');

async function main() {
  const response = {
    results: [
      {
        title: "Chicken Cheesesteak | Capriotti's Sandwich Shop",
        url: 'https://capriottis.com/menu/chicken-cheesesteak',
        source: 'capriottis.com',
        confidence: 'high',
        thumbnail: { src: 'https://imgs.search.brave.com/chicken-thumb.jpg' },
        properties: { url: 'https://img.cdn4dd.com/chicken-cheesesteak.jpg' },
      },
      {
        title: 'Chicken Cheesesteak menu on a retro game console',
        url: 'https://example.com/retro-console',
        source: 'example.com',
        confidence: 'high',
        thumbnail: { src: 'https://example.com/console.jpg' },
        properties: { url: 'https://example.com/console-full.jpg' },
      },
      {
        title: 'Turkey club sandwich restaurant menu',
        url: 'https://example.com/turkey-club',
        source: 'example.com',
        confidence: 'high',
        thumbnail: { src: 'https://example.com/turkey-club-thumb.jpg' },
        properties: { url: 'https://example.com/turkey-club.jpg' },
      },
    ],
  };
  const outcome = await searchBraveImages(
    "Chicken Cheesesteak Capriotti's menu item",
    'test-key',
    {
      fetchImpl: async () => new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    },
  );
  assert.equal(outcome.status, 200);
  assert.equal(outcome.results.length, 3);
  assert.equal(
    outcome.results[0].imageUrl,
    'https://img.cdn4dd.com/chicken-cheesesteak.jpg',
    'prefers the full-resolution Brave properties URL',
  );

  const ranked = rankBoardWizardImageSearchResults(
    outcome.results,
    'Chicken Cheesesteak',
    'food',
  );
  assert.equal(
    ranked.length,
    1,
    'rejects both unrelated devices and unrelated food even though the original query has matching terms',
  );
  assert.equal(ranked[0].sourceDomain, 'capriottis.com');

  const denied = await searchBraveImages('Cole Turkey Capriotti’s', 'test-key', {
    fetchImpl: async () => new Response(JSON.stringify({ message: 'Access denied' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }),
  });
  assert.deepEqual(denied, {
    results: [],
    status: 403,
    errorMessage: 'Access denied',
  });

  console.log('board wizard image-search tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
