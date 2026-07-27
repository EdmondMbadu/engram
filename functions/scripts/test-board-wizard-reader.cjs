const assert = require('node:assert/strict');
const {
  boardWizardReaderPageTitle,
  extractBoardWizardReaderMenuItems,
  extractBoardWizardReaderProducts,
  fetchBoardWizardReaderPage,
  looksLikeBlockedBoardWizardReaderPage,
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

const louisVuittonMarkdown = `
Title: LOUIS VUITTON Official USA Website | LOUIS VUITTON ®

## Iconic Bags for Her

[High Rise](https://us.louisvuitton.com/eng-us/products/high-rise-monogram-nvprod4690067v/M46784)

![High Rise](https://us.louisvuitton.com/images/is/image/lv/1/PP_VP_L/louis-vuitton-high-rise--M46784_PM2_Front%20view.jpg)

$2,020

[Neverfull MM](https://us.louisvuitton.com/eng-us/products/neverfull-mm-monogram-nvprod5350101v/M46975)

![Neverfull MM](https://us.louisvuitton.com/images/is/image/lv/1/PP_VP_L/louis-vuitton-neverfull-mm--M46975_PM2_Front%20view.jpg)

$2,100

## Beauty

[![Attrape-Rêves](https://us.louisvuitton.com/images/is/image/lv/1/PP_VP_L/louis-vuitton-attrape-reves---LP0479_PM2_Front%20view.jpg)](https://us.louisvuitton.com/eng-us/products/attrape-reves-nvprod7330061v/LP0479)

$360

[Shop Perfumes](https://us.louisvuitton.com/eng-us/women/beauty/perfumes/_/N-t1tf9z7a)
`;

assert.deepEqual(
  extractBoardWizardReaderProducts(
    louisVuittonMarkdown,
    'https://us.louisvuitton.com/eng-us/homepage',
  ),
  [
    {
      title: 'High Rise',
      description: '',
      price: '$2,020',
      category: 'Iconic Bags for Her',
      productUrl: 'https://us.louisvuitton.com/eng-us/products/high-rise-monogram-nvprod4690067v/M46784',
      imageUrl: 'https://us.louisvuitton.com/images/is/image/lv/1/PP_VP_L/louis-vuitton-high-rise--M46784_PM2_Front%20view.jpg',
      sku: 'M46784',
    },
    {
      title: 'Neverfull MM',
      description: '',
      price: '$2,100',
      category: 'Iconic Bags for Her',
      productUrl: 'https://us.louisvuitton.com/eng-us/products/neverfull-mm-monogram-nvprod5350101v/M46975',
      imageUrl: 'https://us.louisvuitton.com/images/is/image/lv/1/PP_VP_L/louis-vuitton-neverfull-mm--M46975_PM2_Front%20view.jpg',
      sku: 'M46975',
    },
    {
      title: 'Attrape-Rêves',
      description: '',
      price: '$360',
      category: 'Beauty',
      productUrl: 'https://us.louisvuitton.com/eng-us/products/attrape-reves-nvprod7330061v/LP0479',
      imageUrl: 'https://us.louisvuitton.com/images/is/image/lv/1/PP_VP_L/louis-vuitton-attrape-reves---LP0479_PM2_Front%20view.jpg',
      sku: 'LP0479',
    },
  ],
  'keeps exact same-page product links bound to their adjacent official images',
);

const louisVuittonBlockedMarkdown = `
Title: LOUIS VUITTON
URL Source: https://us.louisvuitton.com/eng-us/homepage
Warning: Target URL returned error 403: Forbidden
## REF #0.91f23517.1785182726.35c99e83
![Image 1](blob:http://localhost/aef335eb562a1da6957ce25a574b4aa1)
# Access denied. We invite you to return at a later time to complete your purchase.
`;
assert.equal(looksLikeBlockedBoardWizardReaderPage(louisVuittonBlockedMarkdown), true);
assert.deepEqual(
  extractBoardWizardReaderProducts(
    louisVuittonBlockedMarkdown,
    'https://us.louisvuitton.com/eng-us/homepage',
  ),
  [],
);
assert.deepEqual(
  extractBoardWizardReaderProducts(
    '[Wrong merchant](https://attacker.co.uk/products/not-from-shop)\\n![Wrong](https://attacker.co.uk/not-from-shop.jpg)',
    'https://merchant.co.uk/collections/home',
  ),
  [],
  'does not confuse unrelated merchants that share a country-code public suffix',
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
  assert.equal(success.blocked, false);

  const privateTarget = await fetchBoardWizardReaderPage('http://127.0.0.1/private', {
    fetchImpl: async () => {
      throw new Error('private targets must not reach the Reader service');
    },
  });
  assert.equal(privateTarget.status, 0);
  assert.match(privateTarget.errorMessage, /must be a public HTTP or HTTPS URL/);
  assert.equal(privateTarget.blocked, false);

  const denied = await fetchBoardWizardReaderPage('https://restaurant.example/limited', {
    fetchImpl: async () => new Response('Rate limit exceeded', { status: 429 }),
  });
  assert.equal(denied.status, 429);
  assert.equal(denied.markdown, '');
  assert.equal(denied.errorMessage, 'Rate limit exceeded');
  assert.equal(denied.blocked, false);

  const blocked = await fetchBoardWizardReaderPage('https://fashion.example/blocked-homepage', {
    fetchImpl: async () => new Response(louisVuittonBlockedMarkdown, { status: 200 }),
  });
  assert.equal(blocked.status, 200);
  assert.equal(blocked.markdown, '');
  assert.equal(blocked.blocked, true);
  assert.match(blocked.errorMessage, /access-denied or challenge page/);

  console.log('board wizard no-key Reader tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
