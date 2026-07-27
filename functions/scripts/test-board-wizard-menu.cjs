const assert = require('node:assert/strict');
const {
  bestBoardWizardSrcsetUrl,
  isPlausibleBoardWizardFoodImageContext,
  matchBoardWizardMenuImage,
} = require('../lib/board-wizard-menu-images.js');
const {
  extractStructuredBoardWizardMenuItems,
} = require('../lib/board-wizard-menu.js');

const classicImage = 'https://img.cdn4dd.com/classic-cheesesteak.jpg';
const chickenImage = 'https://img.cdn4dd.com/chicken-cheesesteak.jpg';
const images = [
  { alt: 'Classic Cheesesteak', src: classicImage },
  { alt: 'Chicken Cheesesteak', src: chickenImage },
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
          "hasMenuItem": [{
            "@type": "MenuItem",
            "name": "Chicken Cheesesteak",
            "description": "Chicken, provolone &amp; onions."
          }]
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
  }],
  'extracts current JSON-LD menu membership, category, description, and page-bound photo',
);

console.log('board wizard menu extraction tests passed');
