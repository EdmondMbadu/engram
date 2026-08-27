const assert = require('node:assert/strict');
const {
  BOARD_WIZARD_SOURCE_GALLERY_LIMIT,
  buildBoardWizardListingBatch,
  extractBoardWizardListing,
  extractBoardWizardListingFromMarkdown,
  isBoardWizardListingPageUrl,
  isBoardWizardZillowListingPageUrl,
} = require('../lib/board-wizard-listing.js');

assert.equal(isBoardWizardListingPageUrl('https://www.airbnb.com/rooms/1684310791539108474'), true);
assert.equal(isBoardWizardListingPageUrl('https://www.airbnb.com/s/homes'), false);
assert.equal(isBoardWizardListingPageUrl('https://www.zillow.com/apartments/philadelphia-pa/the-porter/CgKQWS/'), true);
assert.equal(isBoardWizardListingPageUrl('https://www.zillow.com/philadelphia-pa/apartments/'), false);
assert.equal(isBoardWizardZillowListingPageUrl('https://www.zillow.com/homedetails/example/141490995_zpid/'), true);
assert.equal(isBoardWizardZillowListingPageUrl('https://www.airbnb.com/rooms/1684310791539108474'), false);

const zillowReaderMarkdown = `Title: 27 Cranberry Cove Ct, Las Vegas, NV 89135 | MLS #2809912 | Zillow

URL Source: https://www.zillow.com/homedetails/27-Cranberry-Cove-Ct-Las-Vegas-NV-89135/141490995_zpid/

$3,999,000  4 beds  5 baths  4,618 sqft

![thumbnail](https://photos.zillowstatic.com/fp/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-sc_192_128.jpg)
![cover](https://photos.zillowstatic.com/fp/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-sc_1152_768.jpg)
![kitchen](https://photos.zillowstatic.com/fp/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-sc_1152_768.jpg)
![Agent avatar](https://photos.zillowstatic.com/fp/cccccccccccccccccccccccccccccccc-h_l.jpg)

## What's special
Resort-style pool, updated kitchen, and a bright open layout.

See all media

## Nearby homes
![nearby](https://photos.zillowstatic.com/fp/dddddddddddddddddddddddddddddddd-p_e.webp)`;
const readerListing = extractBoardWizardListingFromMarkdown(
  'https://www.zillow.com/homedetails/27-Cranberry-Cove-Ct-Las-Vegas-NV-89135/141490995_zpid/',
  zillowReaderMarkdown,
);
assert.ok(readerListing, 'a blocked Zillow detail page should recover as a listing from Reader markdown');
assert.equal(readerListing.listingName, '27 Cranberry Cove Ct, Las Vegas, NV 89135');
assert.equal(readerListing.images.length, 2, 'responsive duplicates should collapse to the highest-resolution gallery image');
assert.match(readerListing.images[0].url, /sc_1152_768/);
assert.equal(readerListing.images.some((image) => /h_l|p_e/.test(image.url)), false, 'agent and nearby-home images must be rejected');
assert.equal(buildBoardWizardListingBatch({ extraction: readerListing, targetBoardTitle: '', count: 1 }).cards[0].imageUrls.length, 2);
const readerFourCardBatch = buildBoardWizardListingBatch({ extraction: readerListing, targetBoardTitle: '', count: 4 });
assert.equal(readerFourCardBatch.cards.length, 4);
assert.ok(readerFourCardBatch.board.description.length <= 240);
assert.ok(readerFourCardBatch.cards.every((card) => !!card.imageUrl));
assert.ok(readerFourCardBatch.cards.every((card) => readerListing.images.some((image) => image.url === card.imageUrl)));

const airbnbImages = Array.from({ length: 8 }, (_, index) =>
  `https://a0.muscache.com/im/pictures/hosting/aaaaaaaa-bbbb-cccc-dddd-${String(index).padStart(12, '0')}/original.jpg?im_w=1200`,
);
const airbnbHtml = `<!doctype html><html><head>
  <title>Cozy Retreat Near Everything - Airbnb</title>
  <meta property="og:site_name" content="Airbnb">
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VacationRental',
    name: 'Cozy Retreat Near Everything',
    description: 'Spacious house with a pool, ideal for families and groups.',
    image: airbnbImages,
    occupancy: { '@type': 'QuantitativeValue', value: 10 },
    numberOfBedrooms: 5,
    numberOfBathroomsTotal: 2.5,
    address: { addressLocality: 'North Las Vegas', addressRegion: 'NV' },
    amenityFeature: [{ name: 'Pool', value: true }, { name: 'Wifi', value: true }],
    aggregateRating: { ratingValue: 4.91 },
  })}</script>
  <script type="application/ld+json">${JSON.stringify({
    '@type': 'Product', name: 'Cozy Retreat Near Everything', image: airbnbImages,
    offers: { price: 275, priceCurrency: 'USD' },
  })}</script>
</head><body>
  <img alt="Airbnb logo" src="https://a0.muscache.com/airbnb-platform-assets/logo.png">
  <img alt="Host avatar" src="https://a0.muscache.com/im/pictures/user/avatar.jpg">
  <p>10 guests · 5 bedrooms · 6 beds · 2.5 baths · Kitchen · Free parking</p>
</body></html>`;

const airbnb = extractBoardWizardListing(
  'https://www.airbnb.com/rooms/1684310791539108474?adults=1',
  'https://www.airbnb.com/rooms/1684310791539108474?adults=1',
  airbnbHtml,
);
assert.ok(airbnb, 'Airbnb listing should be detected');
assert.equal(airbnb.kind, 'vacation-rental');
assert.equal(airbnb.listingName, 'Cozy Retreat Near Everything');
assert.equal(airbnb.images.length, 8, 'all exact listing photos should be retained');
assert.equal(airbnb.images.some((image) => /logo|avatar/i.test(image.url)), false, 'platform and avatar images must be rejected');
assert.ok(airbnb.facts.includes('10 guests'));
assert.ok(airbnb.amenities.includes('Pool'));

const singleCard = buildBoardWizardListingBatch({ extraction: airbnb, targetBoardTitle: '', count: 1 });
assert.equal(singleCard.cards.length, 1);
assert.equal(singleCard.cards[0].imageUrls.length, 8, 'one-card boards must preserve the full gallery');
assert.equal(singleCard.cards[0].imageUrl, airbnbImages[0]);
assert.equal(singleCard.cards[0].productUrl, undefined, 'a lodging listing must not be presented as a shopping product');

const fullAirbnbRoomId = '776364752068549104';
const fullAirbnbImages = Array.from({ length: 26 }, (_, index) =>
  `https://a0.muscache.com/im/pictures/miso/Hosting-${fullAirbnbRoomId}/original/${String(index).padStart(8, '0')}-1111-4222-8333-444444444444.jpeg?im_w=720`,
);
const fullAirbnbSections = [
  ['Living room', 3], ['Full kitchen', 4], ['Bedroom 1', 3], ['Bedroom 2', 3],
  ['Backyard', 4], ['Exterior', 3], ['Additional photos', 6],
];
let fullAirbnbIndex = 0;
const fullAirbnbDeferredState = {
  niobeClientData: [[
    `StaysPdpSections:{"id":"${fullAirbnbRoomId}"}`,
    {
      data: {
        photoTour: fullAirbnbSections.map(([title, count]) => ({
          title,
          mediaItems: Array.from({ length: count }, () => ({
            caption: title,
            baseUrl: fullAirbnbImages[fullAirbnbIndex++],
          })),
        })),
        nearbyStays: [{
          title: 'Unrelated nearby stay',
          baseUrl: 'https://a0.muscache.com/im/pictures/miso/Hosting-999999999999999999/original/ffffffff-1111-4222-8333-444444444444.jpeg?im_w=720',
        }],
      },
    },
  ]],
};
const fullAirbnbHtml = `<!doctype html><html><head>
  <title>Eclectic! Clean! 4 BD 2 BATH. - Airbnb</title>
  <meta property="og:site_name" content="Airbnb">
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VacationRental',
    name: 'Eclectic! Clean! 4 BD 2 BATH.',
    description: 'A complete Anaheim stay.',
    image: fullAirbnbImages.slice(0, 8),
  })}</script>
  <script id="data-deferred-state-0" type="application/json">${JSON.stringify(fullAirbnbDeferredState)}</script>
</head><body><p>10 guests · 4 bedrooms · 2 baths</p></body></html>`;
const fullAirbnb = extractBoardWizardListing(
  `https://www.airbnb.com/rooms/${fullAirbnbRoomId}?check_in=2026-08-28&check_out=2026-08-30`,
  `https://www.airbnb.com/rooms/${fullAirbnbRoomId}`,
  fullAirbnbHtml,
);
assert.ok(fullAirbnb, 'Airbnb deferred state should remain a valid vacation-rental listing');
assert.equal(fullAirbnb.images.length, 26, 'all exact Airbnb deferred-state photos should be retained');
assert.ok(fullAirbnb.images.every((image) => image.url.includes(`Hosting-${fullAirbnbRoomId}`)));
assert.ok(fullAirbnb.images.every((image) => image.url.endsWith('?im_w=1440')), 'Airbnb photos should use a bounded high-quality rendition');
assert.equal(fullAirbnb.images.some((image) => image.url.includes('999999999999999999')), false, 'nearby stays must be rejected by room id');
assert.equal(fullAirbnb.images[0].alt, 'Living room', 'room context should remain bound to the image');
const fullAirbnbBatch = buildBoardWizardListingBatch({ extraction: fullAirbnb, targetBoardTitle: '', count: 1 });
assert.equal(fullAirbnbBatch.cards[0].imageUrls.length, 26, 'the overview card should preserve the complete Airbnb gallery');

const fourteenPhotoAirbnb = { ...fullAirbnb, images: fullAirbnb.images.slice(0, 14) };
const twelveCardAirbnbBatch = buildBoardWizardListingBatch({
  extraction: fourteenPhotoAirbnb,
  targetBoardTitle: '',
  count: 12,
});
assert.equal(twelveCardAirbnbBatch.cards.length, 12, 'a 12-card request should be filled with exact gallery cards');
assert.equal(new Set(twelveCardAirbnbBatch.cards.map((card) => card.imageUrl)).size, 12, 'expanded cards should use distinct primary photos');
assert.ok(twelveCardAirbnbBatch.cards.every((card) => card.imageSource === 'source-page'));
assert.ok(twelveCardAirbnbBatch.cards.every((card) => fourteenPhotoAirbnb.images.some((image) => image.url === card.imageUrl)));
assert.ok(twelveCardAirbnbBatch.cards.some((card) => card.tags.includes('gallery')), 'unused source photos should become gallery cards');
assert.ok(twelveCardAirbnbBatch.cards.at(-1).tags.includes('action'), 'the booking action should remain the final card');

const fourteenCardAirbnbBatch = buildBoardWizardListingBatch({
  extraction: fourteenPhotoAirbnb,
  targetBoardTitle: '',
  count: 14,
});
assert.equal(fourteenCardAirbnbBatch.cards.length, 14, 'all 14 verified photos should support 14 cards');
assert.equal(new Set(fourteenCardAirbnbBatch.cards.map((card) => card.imageUrl)).size, 14);
assert.equal(fourteenCardAirbnbBatch.cards[0].imageUrls.length, 14, 'the overview should still own the complete gallery');
assert.ok(fourteenCardAirbnbBatch.cards.at(-1).tags.includes('action'));

const sixteenCardAirbnbBatch = buildBoardWizardListingBatch({
  extraction: fourteenPhotoAirbnb,
  targetBoardTitle: '',
  count: 16,
});
assert.equal(sixteenCardAirbnbBatch.cards.length, 14, 'card expansion must stop rather than inventing or repeating beyond 14 exact photos');
assert.equal(new Set(sixteenCardAirbnbBatch.cards.map((card) => card.imageUrl)).size, 14);
assert.ok(sixteenCardAirbnbBatch.cards.at(-1).tags.includes('action'));

const sixteenOfTwentySixAirbnbBatch = buildBoardWizardListingBatch({
  extraction: fullAirbnb,
  targetBoardTitle: '',
  count: 16,
});
assert.equal(sixteenOfTwentySixAirbnbBatch.cards.length, 16, 'larger verified galleries should honor a 16-card request');
assert.equal(new Set(sixteenOfTwentySixAirbnbBatch.cards.map((card) => card.imageUrl)).size, 16);
assert.ok(sixteenOfTwentySixAirbnbBatch.cards.at(-1).tags.includes('action'));

const zillowHtml = `<!doctype html><html><head>
  <title>The Porter Apartments - Philadelphia, PA | Zillow</title>
  <meta property="og:site_name" content="Zillow">
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': ['RealEstateListing', 'Product'],
    name: 'The Porter',
    description: 'Apartment community with modern amenities.',
    about: {
      '@type': 'ApartmentComplex',
      name: 'The Porter',
      address: {
        streetAddress: '2940 W Thompson St', addressLocality: 'Philadelphia',
        addressRegion: 'PA', postalCode: '19121', addressCountry: 'US',
      },
      image: 'https://photos.zillowstatic.com/fp/porter-cover-cc_ft_768.webp',
    },
    offers: { lowPrice: 1475, priceCurrency: 'USD' },
  })}</script>
</head><body>
  <section data-testid="photo-gallery">
    <img alt="Building Photo" src="https://photos.zillowstatic.com/fp/porter-cover-cc_ft_384.webp" srcset="https://photos.zillowstatic.com/fp/porter-cover-cc_ft_384.webp 384w, https://photos.zillowstatic.com/fp/porter-cover-cc_ft_768.webp 768w">
    <img alt="Building Photo" src="https://photos.zillowstatic.com/fp/porter-lobby-cc_ft_768.webp">
    <img alt="Building Photo" src="https://photos.zillowstatic.com/fp/porter-kitchen-cc_ft_768.webp">
  </section>
  <img alt="Property management logo" src="https://photos.zillowstatic.com/fp/management-logo.png">
  <img alt="Nearby apartment" src="https://photos.zillowstatic.com/fp/nearby-building-cc_ft_768.webp">
  <table><tr><td>Unit 402</td><td>1 bd</td><td>1 ba</td><td>700 sq ft</td><td>Oct 1</td><td>$1,475/mo</td></tr></table>
  <p>Pet friendly · Gym · Elevator · Dishwasher</p>
</body></html>`;

const zillow = extractBoardWizardListing(
  'https://www.zillow.com/apartments/philadelphia-pa/the-porter/CgKQWS/',
  'https://www.zillow.com/apartments/philadelphia-pa/the-porter/CgKQWS/',
  zillowHtml,
);
assert.ok(zillow, 'Zillow listing should be detected');
assert.equal(zillow.kind, 'real-estate');
assert.equal(zillow.listingName, 'The Porter');
assert.match(zillow.address, /2940 W Thompson St/);
assert.equal(zillow.images.some((image) => /management-logo|nearby-building/i.test(image.url)), false);
assert.equal(zillow.images.length, 3, 'responsive variants should dedupe while listing gallery images remain');
assert.equal(zillow.units.length, 1);
assert.equal(zillow.units[0].name, 'Unit 402');
assert.equal(zillow.units[0].price, '$1,475/mo');

const zillowBatch = buildBoardWizardListingBatch({ extraction: zillow, targetBoardTitle: '', count: 4 });
assert.equal(zillowBatch.cards[0].imageUrls.length, 3);
assert.equal(zillowBatch.cards[1].title, 'Unit 402');
assert.ok(zillowBatch.cards.every((card) => card.sourceUrl.includes('zillow.com')));
assert.ok(zillowBatch.cards.every((card) => !!card.imageUrl), 'every listing-derived card should use an exact gallery image');
assert.ok(zillowBatch.cards.every((card) => card.imageSource === 'source-page'));
assert.ok(zillowBatch.cards.every((card) => zillow.images.some((image) => image.url === card.imageUrl)));

const fullZillowZpid = '141490995';
const fullZillowPhotos = Array.from({ length: 41 }, (_, index) => {
  const assetId = index.toString(16).padStart(32, '0');
  return {
    caption: index === 0 ? 'Front exterior' : `Property photo ${index + 1}`,
    mixedSources: {
      jpeg: [
        { url: `https://photos.zillowstatic.com/fp/${assetId}-cc_ft_384.webp`, width: 384 },
        { url: `https://photos.zillowstatic.com/fp/${assetId}-cc_ft_1536.webp`, width: 1536 },
      ],
    },
  };
});
const unrelatedZillowAsset = 'ffffffffffffffffffffffffffffffff';
const fullZillowCacheKey = `ViewShowcasePriorityQuery{"zpid":"${fullZillowZpid}","zillowPlatform":"DESKTOP"}`;
const fullZillowNextData = {
  props: {
    pageProps: {
      componentProps: {
        gdpClientCache: JSON.stringify({
          [fullZillowCacheKey]: {
            property: {
              zpid: fullZillowZpid,
              responsivePhotos: fullZillowPhotos,
              photos: fullZillowPhotos,
            },
            showcase: {
              photos: [{ url: `https://photos.zillowstatic.com/fp/${unrelatedZillowAsset}-cc_ft_1536.webp` }],
            },
          },
          'ViewShowcasePriorityQuery{"zpid":"999999999","zillowPlatform":"DESKTOP"}': {
            property: {
              zpid: '999999999',
              photos: [{ url: `https://photos.zillowstatic.com/fp/${unrelatedZillowAsset}-cc_ft_1536.webp` }],
            },
          },
        }),
      },
    },
  },
};
const fullZillowHtml = `<!doctype html><html><head>
  <title>27 Cranberry Cove Ct, Las Vegas, NV 89135 | Zillow</title>
  <meta property="og:site_name" content="Zillow">
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: '27 Cranberry Cove Ct, Las Vegas, NV 89135',
    image: fullZillowPhotos[0].mixedSources.jpeg[0].url,
  })}</script>
  <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(fullZillowNextData)}</script>
</head><body><p>4 beds · 5 baths · 4,618 sqft</p></body></html>`;
const fullZillow = extractBoardWizardListing(
  `https://www.zillow.com/homedetails/27-Cranberry-Cove-Ct-Las-Vegas-NV-89135/${fullZillowZpid}_zpid/`,
  `https://www.zillow.com/homedetails/27-Cranberry-Cove-Ct-Las-Vegas-NV-89135/${fullZillowZpid}_zpid/`,
  fullZillowHtml,
);
assert.ok(fullZillow, 'Zillow Next data should remain a valid real-estate listing');
assert.equal(fullZillow.images.length, 41, 'only the canonical property photo array should be retained');
assert.ok(fullZillow.images.every((image) => image.evidence === 'embedded-gallery'));
assert.ok(fullZillow.images.every((image) => /cc_ft_1536/.test(image.url)), 'the best practical responsive rendition should be selected');
assert.equal(fullZillow.images.some((image) => image.url.includes(unrelatedZillowAsset)), false, 'showcase and mismatched-zpid media must be rejected');
assert.equal(buildBoardWizardListingBatch({ extraction: fullZillow, targetBoardTitle: '', count: 1 }).cards[0].imageUrls.length, 41);
assert.ok(BOARD_WIZARD_SOURCE_GALLERY_LIMIT >= 41);

const expListingUrl = 'https://cmc.exprealty.com/property/26-261262-3721-pacific-avenue-wildwood-NJ-08260';
assert.equal(isBoardWizardListingPageUrl(expListingUrl), true, 'eXp property detail URLs should use the listing extractor');
assert.equal(isBoardWizardListingPageUrl('https://cmc.exprealty.com/areas/wildwood'), false, 'eXp area/search pages must remain generic');
const expOriginalImages = Array.from({ length: 43 }, (_, index) =>
  `https://d36xftgacqn2p.cloudfront.net/listingphotos26/261262-${index + 1}.jpg?v=1787333295`,
);
const expGalleryImages = expOriginalImages.map((original, index) => ({
  original,
  transformed: `https://d2na8ywvtbawk2.cloudfront.net/signature-${index}/f:webp/rt:fit/w:1025/${Buffer.from(original).toString('base64url')}`,
}));
const expHtml = `<!doctype html><html><head>
  <title>3721 Pacific Avenue, Wildwood, NJ, 08260 - Photos, Videos & More!</title>
  <meta property="og:title" content="3721 Pacific Avenue, Wildwood, NJ, 08260">
  <meta property="og:site_name" content="eXp Realty in Cape May County">
  <meta property="og:image" content="${expGalleryImages[0].original}">
  <meta property="og:description" content="A shortened metadata description that should lose to the visible description.">
</head><body>
  <div class="gallery">${expGalleryImages.map(({ transformed }, index) => `
    <a class="pic-link" href="${transformed}" title="3721 Pacific Avenue Wildwood, NJ">
      <img class="owl-lazy" alt="Listing Thumbnail Image ${index + 1}" data-src="${transformed}">
    </a>`).join('')}
    <a class="similar-property" href="https://example.com/nearby.jpg"><img alt="Nearby listing" src="https://example.com/nearby.jpg"></a>
  </div>
  <div class="overview">
    <h5 class="key">Property Attributes</h5>
    <ul>
      <li><strong>MLS#</strong><span>261262</span></li>
      <li><strong>Listing Status</strong><span>Active</span></li>
      <li><strong>Style</strong><span>Condo</span></li>
      <li><strong>Year Built</strong><span>2026</span></li>
      <li><strong>Taxes</strong><span>$ 7105</span></li>
      <li><strong>Price</strong><span>$ 729,000</span></li>
      <li><strong>Bedrooms</strong><span>3</span></li>
      <li><strong>Full Bathrooms</strong><span>2</span></li>
      <li><strong>Half Bathrooms</strong><span>0</span></li>
    </ul>
    <h5 class="key">Data Source:</h5><h6>Cape May County MLS (CMCAR)</h6>
  </div>
  <div class="overview"><h5 class="key">Property Description</h5>
    <p>Visible, complete property description with new construction, top-floor privacy, and Shore access.</p>
  </div>
  <h2>General Features</h2><table id="general-features">
    <tr><th>Heating</th><td>Gas Natural, Forced Air</td></tr>
    <tr><th>Cooling</th><td>Central Air, Ceiling Fan</td></tr>
    <tr><th>HOA Fee</th><td>277</td></tr>
    <tr><th>Parking</th><td>Garage, 2 Car</td></tr>
    <tr><th>New Construction Y/N</th><td>Yes</td></tr>
    <tr><th>Features</th><td>Deck/Porch, Outside Shower</td></tr>
    <tr><th>Virtual Tour</th><td><a href="https://vimeo.com/1210127727">Tour one</a></td></tr>
    <tr><th>Virtual Tour</th><td><a href="https://homejab.vr-360-tour.com/e/example">Tour two</a></td></tr>
    <tr><th>Unit Number</th><td>5</td></tr>
  </table>
  <h2>Interior Features</h2><table>
    <tr><th>Beds</th><td>3</td></tr><tr><th>Total Baths</th><td>2</td></tr>
    <tr><th>Unit Features</th><td>Kitchen Island, Hardwood Floors</td></tr>
  </table>
  <h2>Amenities</h2><ul class="amenities">
    <li class="yes">New Construction</li><li class="yes">Pets</li><li class="yes">Air Conditioning</li>
    <li class="yes">Deck</li><li class="yes">Garage</li><li class="no">Pool</li>
  </ul>
  <div class="widget"><h2>Your Agent</h2><div class="listing-small">
    <a class="lazy-img" data-src="https://cdn.example.com/profiles/93256.jpg" href="/agents/93256/Howard+%22Chip%22+Watson" aria-label="Howard &quot;Chip&quot; Watson"></a>
    <h3><a href="/agents/93256/Howard+%22Chip%22+Watson">Howard "Chip" Watson</a></h3>
  </div></div>
  <div class="widget"><span>Listed By</span><br><span id="crmls-listing-info">eXp REALTY</span></div>
</body></html>`;
const expListing = extractBoardWizardListing(expListingUrl, expListingUrl, expHtml);
assert.ok(expListing, 'the rendered eXp/BoldTrail property page should extract deterministically');
assert.equal(expListing.kind, 'real-estate');
assert.equal(expListing.listingName, '3721 Pacific Avenue, Wildwood, NJ, 08260');
assert.equal(expListing.address, '3721 Pacific Avenue, Wildwood, NJ, 08260');
assert.equal(expListing.price, '$729,000');
assert.match(expListing.description, /^Visible, complete property description/);
assert.equal(expListing.images.length, 43, 'all property gallery images should survive and the OG duplicate should collapse');
assert.ok(expListing.images.every((image) => image.evidence === 'embedded-gallery'));
assert.equal(expListing.images.some((image) => /nearby|profiles/i.test(image.url)), false, 'nearby properties and agent portraits must stay out of the property gallery');
assert.deepEqual(expListing.amenities, ['New Construction', 'Pets', 'Air Conditioning', 'Deck', 'Garage']);
assert.equal(expListing.units.length, 0, 'a Unit Number property attribute must not become a fake available unit');
assert.equal(expListing.realEstate.mlsId, '261262');
assert.equal(expListing.realEstate.listingStatus, 'Active');
assert.equal(expListing.realEstate.propertyType, 'Condo');
assert.equal(expListing.realEstate.bedrooms, '3');
assert.equal(expListing.realEstate.bathrooms, '2');
assert.equal(expListing.realEstate.yearBuilt, '2026');
assert.equal(expListing.realEstate.hoaFee, '$277');
assert.equal(expListing.realEstate.taxes, '$7105');
assert.equal(expListing.realEstate.agentName, 'Howard "Chip" Watson');
assert.equal(expListing.realEstate.agentRole, 'Site contact', 'the page contact must not be mislabeled as the MLS listing agent');
assert.match(expListing.realEstate.agentProfileUrl, /\/agents\/93256\//);
assert.match(expListing.realEstate.agentImageUrl, /\/profiles\/93256\.jpg/);
assert.equal(expListing.realEstate.brokerage, 'eXp REALTY');
assert.equal(expListing.realEstate.dataSource, 'Cape May County MLS (CMCAR)');
assert.deepEqual(expListing.realEstate.virtualTours, [
  'https://vimeo.com/1210127727',
  'https://homejab.vr-360-tour.com/e/example',
]);
assert.ok(expListing.realEstate.features.some((feature) => /Heating: Gas Natural/i.test(feature)));

const expBatch = buildBoardWizardListingBatch({ extraction: expListing, targetBoardTitle: '', count: 12 });
assert.equal(expBatch.cards.length, 12);
assert.equal(expBatch.cards[0].imageUrls.length, 43, 'the board overview should own the complete eXp gallery');
assert.match(expBatch.cards[0].subtitle, /\$729,000 · 3 bd · 2 ba/);
assert.ok(expBatch.cards.some((card) => card.title === 'At a glance' && /MLS# 261262/.test(card.notes)));
assert.ok(expBatch.cards.some((card) => card.title === 'Property features'));
const expContactCard = expBatch.cards.find((card) => card.title === 'Contact & brokerage');
assert.ok(expContactCard);
assert.match(expContactCard.notes, /Site contact: Howard "Chip" Watson/);
assert.match(expContactCard.notes, /Listed by: eXp REALTY/);
assert.match(expContactCard.imageUrl, /\/profiles\/93256\.jpg/);
assert.ok(expBatch.cards.some((card) => card.title === 'Virtual tours'));
assert.ok(expBatch.cards.at(-1).tags.includes('action'));
assert.ok(expBatch.cards.filter((card) => card.tags.includes('gallery')).every((card) => expListing.images.some((image) => image.url === card.imageUrl)));

const expReaderMarkdown = `Title: 3721 Pacific Avenue, Wildwood, NJ, 08260

${expGalleryImages.map(({ transformed }, index) => `[![Image ${index + 1}: Listing Thumbnail Image ${index + 1}](${transformed})](${transformed})`).join('\n')}

Address

3721 Pacific Avenue, Wildwood, NJ

Price

$ 729,000

##### Property Attributes
* **MLS#**261262
* **Listing Status** Active
* **Style**Condo
* **Year Built**2026
* **Taxes**$ 7105
* **Price**$ 729,000
* **Bedrooms**3
* **Full Bathrooms**2
* **Half Bathrooms**0

##### Data Source:
###### Cape May County MLS (CMCAR)

##### Property Description
Reader fallback property description.

## General Features
| **HOA Fee** | 277 |
| **Parking** | Garage,2 Car |
| **New Construction Y/N** | Yes |
| **Features** | Deck/Porch,Outside Shower |
| **Virtual Tour** | [https://vimeo.com/1210127727](https://vimeo.com/1210127727) |

## Interior Features
| **Beds** | 3 |
| **Total Baths** | 2 |
| **Unit Features** | Kitchen Island,Hardwood Floors |

Listed By
eXp REALTY`;
const expReaderListing = extractBoardWizardListingFromMarkdown(expListingUrl, expReaderMarkdown);
assert.ok(expReaderListing, 'the free Reader fallback should recover eXp listings when browser rendering is unavailable');
assert.equal(expReaderListing.images.length, 43, 'Reader fallback should retain the full linked eXp gallery');
assert.equal(expReaderListing.price, '$729,000');
assert.equal(expReaderListing.realEstate.mlsId, '261262');
assert.equal(expReaderListing.realEstate.bedrooms, '3');
assert.equal(expReaderListing.realEstate.bathrooms, '2');
assert.equal(expReaderListing.realEstate.brokerage, 'eXp REALTY');
assert.equal(expReaderListing.realEstate.virtualTours[0], 'https://vimeo.com/1210127727');

const commerceOnly = extractBoardWizardListing(
  'https://example-shop.com/products/blue-chair',
  'https://example-shop.com/products/blue-chair',
  `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Product', name: 'Blue Chair', image: 'https://example-shop.com/chair.jpg', offers: { price: 99 },
  })}</script>`,
);
assert.equal(commerceOnly, null, 'generic Product JSON-LD must stay on the commerce path');

const articleOnly = extractBoardWizardListing(
  'https://news.example.com/design/housing-story',
  'https://news.example.com/design/housing-story',
  `<html><head><meta property="og:title" content="A story about housing"><meta property="og:image" content="https://news.example.com/story.jpg">
  <script type="application/ld+json">${JSON.stringify({ '@type': 'House', name: 'A historic house' })}</script>
  </head><body><article>Reporting</article></body></html>`,
);
assert.equal(articleOnly, null, 'generic articles must stay on the article/generic path');

const hotel = extractBoardWizardListing(
  'https://independent.example/stays/grand-hotel',
  'https://independent.example/stays/grand-hotel',
  `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Hotel', name: 'Grand Hotel', image: ['https://independent.example/hotel-room.jpg'],
    address: { addressLocality: 'Chicago', addressRegion: 'IL' },
  })}</script>`,
);
assert.ok(hotel);
assert.equal(hotel.kind, 'hotel', 'schema-backed generic hotel sites should also be supported');

console.log('Board wizard listing extraction tests passed.');
