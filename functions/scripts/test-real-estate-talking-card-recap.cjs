const assert = require('node:assert/strict');
const {
  buildRealEstateTalkingCardRecapContext,
  safeRecapHttpsUrl,
} = require('../lib/real-estate-talking-card-recap.js');

const talkingCard = {
  id: 'talking-card-1',
  title: 'Ask Jenny about this home',
  tags: ['listing-agent-guide'],
};
const board = {
  title: '2837 Billy Casper Dr',
  description: 'A connected Real Estate VirtualTalkThru of 2837 Billy Casper Dr — $1,090,000 · 4 bedrooms · 3 bathrooms · Single Family Residence, arranged from arrival through the living spaces to the next step.',
  imageUrl: 'https://images.example.com/board.jpg',
  cards: [
    {
      id: 'overview',
      title: '2837 Billy Casper Dr, Las Vegas, NV',
      entityName: '2837 Billy Casper Dr, Las Vegas, NV',
      subtitle: '$1,090,000 · 4 beds · 3 baths · 2,176 sqft',
      notes: 'A single-family home in Sun City Summerlin.',
      tags: ['listing', 'real-estate', 'listing-story', 'group-overview'],
      imageUrl: 'https://images.example.com/hero.jpg',
      imageUrls: [
        'https://images.example.com/hero.jpg',
        'https://images.example.com/kitchen.jpg',
        'http://images.example.com/insecure.jpg',
      ],
      listingPresentation: {
        presentationImageUrls: [
          'https://images.example.com/hero.jpg',
          'https://images.example.com/living.jpg',
          'http://localhost/private.jpg',
        ],
      },
      sourceUrl: 'https://www.example.com/listing/2837',
    },
    {
      id: 'contact',
      title: 'Contact Jenny Morgan',
      subtitle: 'Questions about this home? Get in touch with Jenny Morgan.',
      notes: [
        'Interested in this home? Contact Jenny Morgan to arrange a private showing.',
        'Jenny Morgan',
        'Harbor Realty',
        'Phone: (702) 555-0102',
        'Email: Jenny@Example.com',
      ].join('\n'),
      tags: ['listing', 'real-estate', 'listing-contact', 'group-next-step'],
      imageUrl: 'https://images.example.com/contact.jpg',
    },
    talkingCard,
  ],
};

const context = buildRealEstateTalkingCardRecapContext(board, talkingCard);
assert.ok(context, 'real-estate agent Talking Cards should receive recap context');
assert.equal(context.propertyTitle, '2837 Billy Casper Dr, Las Vegas, NV');
assert.deepEqual(context.propertyFacts, ['$1,090,000', '4 beds', '3 baths', '2,176 sqft', 'Single Family Residence']);
assert.deepEqual(context.contact, {
  name: 'Jenny Morgan',
  agency: 'Harbor Realty',
  phone: '(702) 555-0102',
  email: 'jenny@example.com',
});
assert.deepEqual(context.propertyImageUrls, [
  'https://images.example.com/hero.jpg',
  'https://images.example.com/living.jpg',
  'https://images.example.com/kitchen.jpg',
  'https://images.example.com/board.jpg',
]);
assert.equal(context.listingUrl, 'https://www.example.com/listing/2837');

assert.equal(
  buildRealEstateTalkingCardRecapContext({ title: 'Ordinary board', cards: [talkingCard] }, talkingCard),
  null,
  'ordinary Talking Cards must keep the existing recap flow',
);
assert.equal(
  buildRealEstateTalkingCardRecapContext({
    ...board,
    cards: board.cards.map((card) => card.id === 'contact' ? { ...card, authorOnly: true } : card),
  }, talkingCard)?.contact,
  null,
  'author-only contact details must never be included in visitor emails',
);
assert.equal(safeRecapHttpsUrl('https://images.example.com/photo.jpg'), 'https://images.example.com/photo.jpg');
assert.equal(safeRecapHttpsUrl('http://images.example.com/photo.jpg'), null);
assert.equal(safeRecapHttpsUrl('https://127.0.0.1/photo.jpg'), null);
assert.equal(safeRecapHttpsUrl('data:image/png;base64,abc'), null);

console.log('Real-estate Talking Card recap tests passed.');
