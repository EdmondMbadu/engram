const assert = require('node:assert/strict');
const {
  bestBoardWizardSrcsetUrl,
  extractBoardWizardPictureImages,
  isPlausibleBoardWizardFoodImageContext,
  matchBoardWizardMenuImage,
} = require('../lib/board-wizard-menu-images.js');
const {
  extractStructuredBoardWizardMenuItems,
  isBoardWizardMenuActionCard,
} = require('../lib/board-wizard-menu.js');
const {
  buildLoftyProofOfWorkCookie,
  looksLikeAntiBotChallenge,
} = require('../lib/html-fetch.js');

const classicImage = 'https://img.cdn4dd.com/classic-cheesesteak.jpg';
const chickenImage = 'https://img.cdn4dd.com/chicken-cheesesteak.jpg';
const capsCreationImage = 'https://img.cdn4dd.com/caps-creation.jpg';
const images = [
  { alt: 'Classic Cheesesteak', src: classicImage },
  { alt: 'Chicken Cheesesteak', src: chickenImage },
  { alt: "CAP'S Creation", src: capsCreationImage },
  { alt: 'Retro game console', src: 'https://example.com/classic-console.jpg' },
];

assert.equal(
  bestBoardWizardSrcsetUrl('small.jpg 1x, large.jpg 2x'),
  'large.jpg',
  'selects the highest-density srcset candidate',
);
assert.equal(
  bestBoardWizardSrcsetUrl('small.jpg 320w, large.jpg 1200w'),
  'large.jpg',
  'selects the widest srcset candidate',
);
assert.equal(
  bestBoardWizardSrcsetUrl(
    'https://cdn.example/fit=cover,width=400/photo.jpg 1x, https://cdn.example/fit=cover,width=800/photo.jpg 2x',
  ),
  'https://cdn.example/fit=cover,width=800/photo.jpg',
  'does not split CDN transformation commas as srcset candidate boundaries',
);
assert.deepEqual(
  extractBoardWizardPictureImages(`
    <picture>
      <source srcset="/food/chicken-small.jpg 1x, /food/chicken-large.jpg 2x">
      <img src="/shared-lazy-placeholder.jpg" alt="">
    </picture>
    <div><span>Chicken Cheesesteak</span><span>Chicken and provolone.</span></div>
  `, 'https://restaurant.example/menu'),
  [{
    alt: 'Chicken Cheesesteak',
    src: 'https://restaurant.example/food/chicken-large.jpg',
  }],
  'preserves a picture source image instead of its nested lazy placeholder',
);
assert.equal(
  matchBoardWizardMenuImage('Chicken Cheesesteak', images),
  chickenImage,
  'binds an exact dish title to its exact image',
);
assert.equal(
  matchBoardWizardMenuImage('Classic Italian', images),
  '',
  'does not bind a weak shared word to an unrelated image',
);
assert.equal(
  isPlausibleBoardWizardFoodImageContext(
    'Capriotti’s Chicken Cheesesteak menu item sandwich restaurant',
  ),
  true,
  'accepts a restaurant food result',
);
assert.equal(
  isPlausibleBoardWizardFoodImageContext(
    'Classic menu console retro gaming controller device',
  ),
  false,
  'rejects a device result even when its text includes a menu-related word',
);

const structuredHtml = `
  <script type="application/ld+json">
    {
      "@type": "Restaurant",
      "hasMenu": {
        "@type": "Menu",
        "hasMenuSection": [{
          "@type": "MenuSection",
          "name": "Cheesesteaks",
          "hasMenuItem": [
            {
              "@type": "MenuItem",
              "name": "Chicken Cheesesteak",
              "description": "Chicken, provolone &amp; onions."
            },
            {
              "@type": "MenuItem",
              "name": "CAP&apos;S Creation",
              "description": "Build your own sandwich."
            }
          ]
        }]
      }
    }
  </script>
`;
assert.deepEqual(
  extractStructuredBoardWizardMenuItems(structuredHtml, images),
  [{
    title: 'Chicken Cheesesteak',
    description: 'Chicken, provolone & onions.',
    price: '',
    category: 'Cheesesteaks',
    imageUrl: chickenImage,
  }, {
    title: "CAP'S Creation",
    description: 'Build your own sandwich.',
    price: '',
    category: 'Cheesesteaks',
    imageUrl: capsCreationImage,
  }],
  'extracts current JSON-LD menu membership, decodes entities, and binds page photos',
);
assert.equal(
  looksLikeAntiBotChallenge(`
    <html><head><title>Capriotti's Menu</title></head><body>
      <p>Checking if the site connection is secured...</p>
      <script type="application/ld+json">{"@type":"Restaurant","hasMenu":{"@type":"MenuItem"}}</script>
      ${'<img src="food.jpg" alt="Menu item">'.repeat(20)}
      ${'Current restaurant menu content '.repeat(5_000)}
    </body></html>
  `),
  false,
  'does not reject a complete rendered page because it retains challenge-banner text',
);
assert.equal(
  looksLikeAntiBotChallenge('<html><title>Just a moment...</title>Checking if the site connection is secure</html>'),
  true,
  'still rejects a small challenge-only page',
);
assert.equal(
  looksLikeAntiBotChallenge(`<html><body><script>
    var key = 'cf_retry';
    window.crypto.subtle.digest('SHA-1', new TextEncoder().encode('nonce'));
    document.cookie = 'cf_pow=answer; path=/';
  </script><p>Lofty does not support embedding its pages inside iframes or framesets.</p></body></html>`),
  true,
  'Lofty proof-of-work responses must trigger the browser fallback instead of generation',
);
const loftyProofFixture = `<script>
  var nonce = '0123456789abcdef0123456789abcdef';
  var difficulty = 2;
  var _a = '1788311965.998', _b = 'ab621a4f50b31b', _c = '11b46ff069d8011';
  var key = 'cf_retry'; document.cookie = 'cf_pow'; document.cookie = 'cf_pass';
</script>`;
const loftyProofCookie = buildLoftyProofOfWorkCookie(loftyProofFixture, 37);
assert.match(loftyProofCookie, /^cf_pow=\d+; cf_time=37; cf_pass=1788311965\.998ab621a4f50b31b11b46ff069d8011$/);
const loftyProofAnswer = loftyProofCookie.match(/^cf_pow=(\d+)/)?.[1] || '';
assert.ok(loftyProofAnswer, 'the bounded Lofty challenge solver should find a proof');
const { createHash } = require('node:crypto');
assert.match(createHash('sha1').update(`0123456789abcdef0123456789abcdef${loftyProofAnswer}`).digest('hex'), /^77/);
assert.equal(
  isBoardWizardMenuActionCard({
    title: 'Open Menu',
    type: 'note',
    tags: ['action', 'menu'],
  }),
  true,
  'keeps menu action cards out of generic image enrichment',
);
assert.equal(
  isBoardWizardMenuActionCard({
    title: 'Classic Cheesesteak',
    type: 'food',
    tags: ['menu-item', 'food'],
  }),
  false,
  'does not classify a real menu item as an image-less action card',
);

console.log('board wizard menu extraction tests passed');
