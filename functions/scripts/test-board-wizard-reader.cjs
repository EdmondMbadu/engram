const assert = require('node:assert/strict');
const {
  boardWizardReaderPageTitle,
  extractBoardWizardReaderMenuItems,
  fetchBoardWizardReaderPage,
} = require('../lib/board-wizard-reader.js');

const markdown = `
Title: Capriotti's Nellis Blvd | Best Subs in Las Vegas

## Offers & Rewards

![Image 1: Join Rewards](https://img.cdn4dd.com/media/photosV2/reward-retina-large.jpg)

## Most Ordered

![Image 2: Chicken Cheesesteak](https://img.cdn4dd.com/p/fit=cover,width=1200/media/photosV2/chicken-retina-large.jpg)

Chicken Cheesesteak Thinly sliced grilled chicken, provolone, mushrooms, and onions.

$7.99+ •95% (21)

![Image 3: Classic Italian](https://img.cdn4dd.com/p/fit=cover,width=1200/media/photosV2/italian-retina-large.jpg)

Classic Italian Genoa salami, capicola, prosciuttini, provolone, onions, lettuce, and tomato.

$7.49+

## Cold Subs

![Image 4: Classic Italian](https://img.cdn4dd.com/p/fit=cover,width=1200/media/photosV2/italian-retina-large.jpg)

Classic Italian Genoa salami and provolone.

$7.49+
`;

assert.equal(
  boardWizardReaderPageTitle(markdown),
  "Capriotti's Nellis Blvd | Best Subs in Las Vegas",
);
assert.deepEqual(
  extractBoardWizardReaderMenuItems(markdown),
  [
    {
      title: 'Chicken Cheesesteak',
      description: 'Thinly sliced grilled chicken, provolone, mushrooms, and onions.',
      price: '$7.99+',
      category: 'Most Ordered',
      imageUrl: 'https://img.cdn4dd.com/p/fit=contain,width=1200,height=1200,format=auto,quality=75/media/photosV2/chicken-retina-large.jpg',
    },
    {
      title: 'Classic Italian',
      description: 'Genoa salami, capicola, prosciuttini, provolone, onions, lettuce, and tomato.',
      price: '$7.49+',
      category: 'Most Ordered',
      imageUrl: 'https://img.cdn4dd.com/p/fit=contain,width=1200,height=1200,format=auto,quality=75/media/photosV2/italian-retina-large.jpg',
    },
  ],
  'extracts official menu photos, descriptions, prices, and categories while rejecting promotions',
);

async function main() {
  let requestedUrl = '';
  const success = await fetchBoardWizardReaderPage('https://restaurant.example/menu', {
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(markdown, {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    },
  });
  assert.equal(requestedUrl, 'https://r.jina.ai/https://restaurant.example/menu');
  assert.equal(success.status, 200);
  assert.equal(success.markdown, markdown);
  assert.equal(success.errorMessage, '');

  const privateTarget = await fetchBoardWizardReaderPage('http://127.0.0.1/private', {
    fetchImpl: async () => {
      throw new Error('private targets must not reach the Reader service');
    },
  });
  assert.equal(privateTarget.status, 0);
  assert.match(privateTarget.errorMessage, /must be a public HTTP or HTTPS URL/);

  const denied = await fetchBoardWizardReaderPage('https://restaurant.example/limited', {
    fetchImpl: async () => new Response('Rate limit exceeded', { status: 429 }),
  });
  assert.equal(denied.status, 429);
  assert.equal(denied.markdown, '');
  assert.equal(denied.errorMessage, 'Rate limit exceeded');

  console.log('board wizard no-key Reader tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
