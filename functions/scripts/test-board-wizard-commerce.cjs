const assert = require('node:assert/strict');
const {
  extractCommercePage,
  mergeCommerceProductDetail,
} = require('../lib/board-wizard-commerce.js');
const { looksLikeAntiBotChallenge } = require('../lib/html-fetch.js');

function extract(html, url = 'https://shop.example.com/collections/summer') {
  return extractCommercePage(url, url, html);
}

function testStructuredItemList() {
  const result = extract(`
    <html><head>
      <title>Summer Edit</title>
      <meta property="og:site_name" content="Example House">
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "item": {
                "@type": "Product",
                "name": "Azure Carryall",
                "url": "/products/azure-carryall?utm_source=home",
                "image": ["/media/azure-large.jpg", "/media/azure-side.jpg"],
                "sku": "AZ-100",
                "brand": {"@type": "Brand", "name": "Example House"},
                "offers": {"@type": "Offer", "price": "2450", "priceCurrency": "USD", "availability": "https://schema.org/InStock"}
              }
            },
            {
              "@type": "ListItem",
              "position": 2,
              "item": {
                "@type": "Product",
                "name": "Saffron Mini",
                "url": "/products/saffron-mini",
                "image": {"url": "/media/saffron.jpg"},
                "offers": {"price": "1,900", "priceCurrency": "USD"}
              }
            }
          ]
        }
      </script>
    </head><body></body></html>
  `);

  assert.equal(result.isCommerce, true);
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].name, 'Azure Carryall');
  assert.equal(result.products[0].imageUrl, 'https://shop.example.com/media/azure-large.jpg');
  assert.equal(result.products[0].productUrl, 'https://shop.example.com/products/azure-carryall?utm_source=home');
  assert.equal(result.products[0].sku, 'AZ-100');
  assert.equal(result.products[0].currency, 'USD');
  assert.equal(result.products[0].availability, 'In Stock');
  assert.equal(result.products[0].sourceKind, 'structured-data');
  assert.ok(result.confidence >= 0.9);
}

function testRenderedTilesKeepLocalImageBinding() {
  const result = extract(`
    <html><head><title>Example House Homepage</title></head><body>
      <nav>
        <a href="/women/bags"><img src="/media/category-bags.jpg" alt="Women's Bags">Women's Bags</a>
      </nav>
      <section aria-label="Iconic bags">
        <h2>Iconic Bags</h2>
        <ul>
          <li class="product-tile">
            <a href="/products/high-rise-nvprod100v"><span class="product-title">High Rise</span></a>
            <picture>
              <source srcset="/media/high-rise-400.webp 400w, /media/high-rise-1600.webp 1600w">
              <img src="/media/high-rise-placeholder.jpg" data-lw-current-src="https://cdn.example.com/high-rise-rendered.jpg" alt="High Rise">
            </picture>
          </li>
          <li class="product-tile">
            <a href="/products/neverfull-mm-nvprod200v"><span class="product-title">Neverfull MM</span></a>
            <img src="/media/neverfull.jpg" alt="Neverfull MM">
          </li>
          <li class="product-tile">
            <a href="/products/nano-frivole-nvprod300v"><span class="product-title">Nano Frivole</span></a>
            <img src="/media/nano-frivole.jpg" alt="Nano Frivole">
          </li>
        </ul>
      </section>
      <img src="/media/unrelated-campaign.jpg" alt="Campaign model">
    </body></html>
  `);

  assert.equal(result.isCommerce, true);
  assert.deepEqual(result.products.map((product) => product.name), [
    'High Rise',
    'Neverfull MM',
    'Nano Frivole',
  ]);
  assert.equal(result.products[0].imageUrl, 'https://cdn.example.com/high-rise-rendered.jpg');
  assert.equal(result.products[1].imageUrl, 'https://shop.example.com/media/neverfull.jpg');
  assert.equal(result.products[2].imageUrl, 'https://shop.example.com/media/nano-frivole.jpg');
  assert.equal(result.products.some((product) => product.imageUrl.includes('unrelated-campaign')), false);
  assert.equal(result.products.some((product) => product.name === "Women's Bags"), false);
}

function testLargestSrcsetCandidateWinsWithoutCurrentSrc() {
  const result = extract(`
    <html><body>
      <article data-product-id="BAG-1">
        <a href="/products/cobalt-weekender"><h3>Cobalt Weekender</h3></a>
        <img srcset="/img/cobalt-320.jpg 320w, /img/cobalt-1280.jpg 1280w" alt="Cobalt Weekender">
        <span class="price">$1,250</span>
      </article>
    </body></html>
  `);

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].imageUrl, 'https://shop.example.com/img/cobalt-1280.jpg');
  assert.equal(result.products[0].price, '$1,250');
  assert.equal(result.products[0].currency, 'USD');
}

function testOrdinaryMenuIsNotMisclassified() {
  const result = extract(`
    <html><head><title>Neighborhood Cafe Menu</title></head><body>
      <h1>Dinner</h1>
      <h2>Roast Chicken</h2><p>$28</p>
      <h2>Mushroom Risotto</h2><p>$24</p>
      <h2>Lemon Tart</h2><p>$12</p>
    </body></html>
  `, 'https://cafe.example.com/menu');

  assert.equal(result.isCommerce, false);
  assert.equal(result.products.length, 0);
}

function testSingleProductMetadata() {
  const result = extract(`
    <html><head>
      <title>Rose No. 7</title>
      <meta property="og:type" content="product">
      <meta property="og:title" content="Rose No. 7 Eau de Parfum">
      <meta property="og:url" content="/products/rose-no-7">
      <meta property="og:image" content="/images/rose-no-7.jpg">
      <meta property="product:price:amount" content="320">
      <meta property="product:price:currency" content="USD">
      <meta property="product:brand" content="Parfumerie Example">
    </head><body></body></html>
  `);

  assert.equal(result.isCommerce, true);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].sourceKind, 'product-meta');
  assert.equal(result.products[0].name, 'Rose No. 7 Eau de Parfum');
  assert.equal(result.products[0].imageUrl, 'https://shop.example.com/images/rose-no-7.jpg');
}

function testDetailPageEnrichmentDoesNotReplaceAnExactTileImage() {
  const listing = extract(`
    <html><body>
      <article data-product-id="A">
        <a href="/products/azure"><h3>Azure</h3></a>
        <img src="/images/azure-tile.jpg" alt="Azure">
      </article>
    </body></html>
  `);
  const detail = extract(`
    <html><head>
      <meta property="og:type" content="product">
      <meta property="og:title" content="Azure">
      <meta property="og:url" content="/products/azure">
      <meta property="og:image" content="/images/azure-detail.jpg">
      <meta property="product:price:amount" content="$2,450">
    </head></html>
  `, 'https://shop.example.com/products/azure');
  const merged = mergeCommerceProductDetail(listing.products[0], detail);

  assert.equal(merged.imageUrl, 'https://shop.example.com/images/azure-tile.jpg');
  assert.equal(merged.imageSource, 'source-page');
  assert.equal(merged.price, '$2,450');
}

function testDetailPageFillsOnlyMissingImage() {
  const listing = extract(`
    <html><body>
      <article data-product-id="A">
        <a href="/products/azure"><h3>Azure</h3></a>
        <span class="price">$2,450</span>
      </article>
    </body></html>
  `);
  const detail = extract(`
    <html><head>
      <meta property="og:type" content="product">
      <meta property="og:title" content="Azure">
      <meta property="og:url" content="/products/azure">
      <meta property="og:image" content="/images/azure-detail.jpg">
    </head></html>
  `, 'https://shop.example.com/products/azure');
  const merged = mergeCommerceProductDetail(listing.products[0], detail);

  assert.equal(merged.imageUrl, 'https://shop.example.com/images/azure-detail.jpg');
  assert.equal(merged.imageSource, 'product-page');
}

function testDuplicateStructuredAndDomRecordsMerge() {
  const result = extract(`
    <html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"Cedar Tote","url":"/products/cedar-tote","sku":"CEDAR-1"}
      </script>
    </head><body>
      <article class="product-card">
        <a href="/products/cedar-tote?utm_campaign=hero"><h3>Cedar Tote</h3></a>
        <img src="/images/cedar.jpg" alt="Cedar Tote">
      </article>
    </body></html>
  `);

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].sku, 'CEDAR-1');
  assert.equal(result.products[0].imageUrl, 'https://shop.example.com/images/cedar.jpg');
}

function testMerchantMaintenancePageIsRecognizedAsBlocked() {
  const html = `
    <html><head><title>LOUIS VUITTON</title></head>
    <body class="lv-waiting">
      <h2>REF #0.1234</h2>
      <img src="https://example.com/maintenance-page-desktop.jpg">
    </body></html>
  `;
  assert.equal(looksLikeAntiBotChallenge(html), true);
  assert.equal(extract(html).isCommerce, false);
}

const tests = [
  testStructuredItemList,
  testRenderedTilesKeepLocalImageBinding,
  testLargestSrcsetCandidateWinsWithoutCurrentSrc,
  testOrdinaryMenuIsNotMisclassified,
  testSingleProductMetadata,
  testDetailPageEnrichmentDoesNotReplaceAnExactTileImage,
  testDetailPageFillsOnlyMissingImage,
  testDuplicateStructuredAndDomRecordsMerge,
  testMerchantMaintenancePageIsRecognizedAsBlocked,
];

for (const test of tests) {
  test();
  process.stdout.write(`✓ ${test.name}\n`);
}

process.stdout.write(`\n${tests.length} commerce extraction tests passed.\n`);
