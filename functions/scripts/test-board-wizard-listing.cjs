const assert = require('node:assert/strict');
const {
  BOARD_WIZARD_SOURCE_GALLERY_LIMIT,
  boardWizardListingFurnishingsIncluded,
  buildBoardWizardListingBatch,
  extractBoardWizardListing,
  extractBoardWizardListingFromMarkdown,
  isBoardWizardListingPageUrl,
  isBoardWizardZillowListingPageUrl,
} = require('../lib/board-wizard-listing.js');
const {
  boardWizardListingPreview,
  buildBoardWizardListingMarketingBatchFromAnalyses,
  isLikelyBoardWizardRealEstateUrl,
  normalizeBoardWizardListingMarketingOptions,
} = require('../lib/board-wizard-listing-marketing.js');

assert.equal(isBoardWizardListingPageUrl('https://www.airbnb.com/rooms/1684310791539108474'), true);
assert.equal(isBoardWizardListingPageUrl('https://www.airbnb.com/s/homes'), false);
assert.equal(isBoardWizardListingPageUrl('https://www.zillow.com/apartments/philadelphia-pa/the-porter/CgKQWS/'), true);
assert.equal(isBoardWizardListingPageUrl('https://www.zillow.com/philadelphia-pa/apartments/'), false);
assert.equal(isBoardWizardZillowListingPageUrl('https://www.zillow.com/homedetails/example/141490995_zpid/'), true);
assert.equal(isBoardWizardZillowListingPageUrl('https://www.airbnb.com/rooms/1684310791539108474'), false);
assert.equal(isLikelyBoardWizardRealEstateUrl('https://cmc.exprealty.com/property/26-261262-example'), true);
assert.equal(isLikelyBoardWizardRealEstateUrl('https://www.airbnb.com/rooms/1684310791539108474'), false);
const loftyListingUrl = 'https://findcapemayhomes.com/listing-detail/1188241439/8-Galloping-Way-Cape-May-Court-House-NJ?source=feature_listing&page=1';
assert.equal(isBoardWizardListingPageUrl(loftyListingUrl), true, 'white-label /listing-detail routes should be protected as property pages');
assert.equal(isLikelyBoardWizardRealEstateUrl(loftyListingUrl), true, 'white-label listing-detail routes should enter real-estate recovery');
assert.equal(isBoardWizardListingPageUrl('https://findcapemayhomes.com/NJ/Cape-May-Court-House'), false, 'custom-domain search pages must remain generic');
const loftyPhotos = Array.from({ length: 50 }, (_, index) =>
  `https://img.chime.me/imageemb/mls-listing/276/262374/photo-${index + 1}.jpg`,
);
const loftyHtml = `<!doctype html><html><head>
  <title>Homes for sale - 8 Galloping Way, Cape May Court House, NJ 08210</title>
  <meta property="og:site_name" content="Jersey Shore Real Estate Experts">
  <script type="application/ld+json">${JSON.stringify([{
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: '8 Galloping Way, Cape May Court House, NJ 08210',
    description: 'Metadata summary.',
    image: loftyPhotos,
    address: {
      '@type': 'PostalAddress',
      streetAddress: '8 Galloping Way',
      addressLocality: 'Cape May Court House',
      addressRegion: 'NJ',
      postalCode: '08210',
    },
    offers: { price: '799900', priceCurrency: 'USD' },
    numberOfBedrooms: 4,
    numberOfBathroomsTotal: 2.1,
    yearBuilt: 2004,
    additionalProperty: [{ '@type': 'PropertyValue', name: 'Property Type', value: 'Single Family Home' }],
  }])}</script>
</head><body>
  <p class="detail-title">Property Description</p><div class="info-des">Full Galloping Way property description.</div>
  <p class="info-content"><span class="info-title">MLS Listing ID</span><span class="info-data">262374</span></p>
  <p class="info-content"><span class="info-title">Listing Status</span><span class="info-data">Under Contract</span></p>
  <p class="info-content"><span class="info-title">Annual Tax Amount</span><span class="info-data">$8,673</span></p>
  <section class="similar-gallery"><img alt="47 Fishing Creek Road property photo" src="https://img.chime.me/unrelated-similar-home.jpg"></section>
</body></html>`;
const loftyListing = extractBoardWizardListing(loftyListingUrl, loftyListingUrl, loftyHtml);
assert.ok(loftyListing, 'Lofty/Chime custom-domain detail pages should extract as real estate');
assert.equal(loftyListing.listingName, '8 Galloping Way, Cape May Court House, NJ 08210');
assert.equal(loftyListing.images.length, 50, 'the complete structured listing gallery should be retained');
assert.ok(loftyListing.images.every((image) => image.url.includes('/mls-listing/276/262374/')), 'similar and hot-listing photos must not enter the target gallery');
assert.equal(loftyListing.description, 'Full Galloping Way property description.');
assert.equal(loftyListing.realEstate.mlsId, '262374');
assert.equal(loftyListing.realEstate.listingStatus, 'Under Contract');
assert.equal(loftyListing.realEstate.propertyType, 'Single Family Home');
assert.equal(loftyListing.realEstate.yearBuilt, '2004');
assert.equal(loftyListing.realEstate.taxes, '$8,673');

const loftyLegacyInfo = {
  id: 1188241439,
  address: '8 Galloping Way, Cape May Court House, NJ 08210',
  detailsDescribe: 'Exact public Lofty listing description.',
  price: 799900,
  bedrooms: 4,
  bathrooms: 2.1,
  fullBaths: 2,
  sqft: 2780,
  builtYear: 2004,
  listingStatus: 'Under Contract',
  propertyType: 'Single Family Home',
  mlsListingId: '262374',
  pictureList: loftyPhotos,
  taxAmount: 8673,
  hoaFee: -1,
  latitude: '39.081292',
  longitude: '-74.843555',
  agentOrganizationName: 'eXp REALTY',
  heating: 'Gas Natural, Forced Air',
  cooling: 'Attic Fan, Multi Zoned',
  link: 'https://vimeo.com/1221031356',
};
const loftyLegacyHtml = `<!doctype html><html><head>
  <title>Homes for sale - 8 Galloping Way, Cape May Court House, NJ 08210</title>
  <meta name="description" content="Homes for sale: 8 Galloping Way with 4 beds and 2.1 baths, listed for $799900.">
  <meta property="og:image" content="${loftyPhotos[0]}">
</head><body>
  <script>window.sitePageJSON=${JSON.stringify({
    modules: [
      { name: 'md-detail-info', data: { listingDetail: { info: loftyLegacyInfo } } },
      { name: 'md-house-listing', data: { listingDetail: { info: { ...loftyLegacyInfo, id: 999999999, address: 'A related home', price: 287000 } } } },
    ],
  })}</script>
</body></html>`;
const loftyLegacyListing = extractBoardWizardListing(loftyListingUrl, loftyListingUrl, loftyLegacyHtml);
assert.ok(loftyLegacyListing, 'Lofty link-preview state should extract as the exact requested property');
assert.equal(loftyLegacyListing.listingName, '8 Galloping Way, Cape May Court House, NJ 08210');
assert.equal(loftyLegacyListing.price, 'USD 799900', 'price per square foot and related-home prices must not replace the listing price');
assert.equal(loftyLegacyListing.realEstate.bedrooms, '4');
assert.equal(loftyLegacyListing.realEstate.bathrooms, '2.1');
assert.equal(loftyLegacyListing.realEstate.mlsId, '262374');
assert.equal(loftyLegacyListing.realEstate.listingStatus, 'Under Contract');
assert.equal(loftyLegacyListing.realEstate.propertyType, 'Single Family Home');
assert.equal(loftyLegacyListing.realEstate.yearBuilt, '2004');
assert.equal(loftyLegacyListing.realEstate.taxes, '$8673');
assert.equal(loftyLegacyListing.realEstate.hoaFee, '', 'negative provider sentinels must not become listing facts');
assert.deepEqual(loftyLegacyListing.realEstate.virtualTours, ['https://vimeo.com/1221031356']);
assert.equal(loftyLegacyListing.images.length, 50);
assert.ok(loftyLegacyListing.images.every((image) => image.url.includes('/mls-listing/276/262374/')));
assert.equal(loftyLegacyListing.description, 'Exact public Lofty listing description.');
assert.deepEqual(normalizeBoardWizardListingMarketingOptions({ style: 'luxury', direction: '  Lead with the deck.  ' }), {
  enabled: true,
  style: 'luxury',
  direction: 'Lead with the deck.',
});

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
const rentalAirbnbBatch = buildBoardWizardListingBatch({
  extraction: fullAirbnb,
  targetBoardTitle: '',
  count: 8,
  listingIntent: 'rental',
});
assert.equal(rentalAirbnbBatch.cards.at(-1).title, 'Check availability & book');
assert.match(rentalAirbnbBatch.cards.at(-1).notes, /cancellation terms.*house rules.*booking details/i);

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

const expPreview = boardWizardListingPreview(expListing);
assert.equal(expPreview.kind, 'real-estate');
assert.equal(expPreview.imageCount, 43);
assert.equal(expPreview.price, '$729,000');
assert.equal(expPreview.contactRole, 'Site contact');
assert.equal(boardWizardListingPreview(expListing, 'rental').kind, 'rental');

const expStoryAnalyses = [
  ['exterior', 'Building exterior', ['corner setting', 'covered entry'], 0.95, 0.96],
  ['living', 'Living area', ['open layout', 'natural light'], 0.93, 0.82],
  ['kitchen', 'Kitchen', ['center island', 'cabinetry'], 0.94, 0.78],
  ['dining', 'Dining area', ['connected layout'], 0.88, 0.68],
  ['bedroom', 'Bedroom', ['windows'], 0.86, 0.52],
  ['bedroom', 'Bedroom', ['closet'], 0.82, 0.48],
  ['bathroom', 'Bathroom', ['double vanity'], 0.9, 0.55],
  ['balcony', 'Deck', ['outdoor seating'], 0.92, 0.84],
  ['garage', 'Garage and parking', ['covered parking'], 0.8, 0.42],
  ['unknown', 'Interior view', [], 0.72, 0.35],
  ['agent', 'Agent portrait', [], 0.9, 0.1],
  ['logo', 'Brokerage logo', [], 0.9, 0.1],
].map(([sceneType, roomType, features, qualityScore, heroScore], index) => ({
  index,
  sceneType,
  roomType,
  features,
  qualityScore,
  heroScore,
  confidence: sceneType === 'unknown' ? 0.3 : 0.92,
}));
const expStory = buildBoardWizardListingMarketingBatchFromAnalyses({
  extraction: expListing,
  targetBoardTitle: '',
  count: 10,
  narrationSecondsPerCard: 15,
  style: 'warm',
  analyses: expStoryAnalyses,
});
assert.equal(expStory.cards.length, 11, 'the specialist should preserve every identified space group plus overview and next step');
assert.equal(expStory.cards[0].imageUrls.length, 43, 'the story opener must retain the entire source gallery');
assert.match(expStory.cards[0].tags.join(' '), /listing-story listing-group group-overview/);
assert.equal(expStory.cards[0].title, expListing.listingName);
assert.equal(expStory.cards[0].listingPresentation.presentationImageUrls.length, 3, 'the overview Live View must not replay the complete gallery');
assert.ok(expStory.cards.some((card) => card.tags.includes('group-kitchen')), 'the story should include an identified kitchen group');
assert.ok(expStory.cards.some((card) => card.tags.includes('group-outdoor')), 'the story should combine available outdoor living into one group');
const bedroomGroup = expStory.cards.find((card) => card.tags.includes('group-bedrooms'));
assert.equal(bedroomGroup.imageUrls.length, 2, 'multiple bedroom photographs should become one chapter');
assert.equal(bedroomGroup.listingPresentation.presentationImageUrls.length, 2);
const additionalGroup = expStory.cards.find((card) => card.tags.includes('group-additional'));
assert.equal(additionalGroup.listingPresentation.reviewStatus, 'needs-review');
assert.match(additionalGroup.subtitle, /Needs review/);
assert.equal(expStory.cards.some((card) => /profiles|agent portrait|brokerage logo/i.test(`${card.imageUrl} ${card.title}`)), false, 'agent and logo images must never enter the property story');
assert.ok(expStory.cards.at(-1).tags.includes('group-next-step'));
assert.match(expStory.cards.at(-1).title, /\$729,000/);
assert.match(expStory.cards.at(-1).notes, /current price, status, disclosures, fees, showing availability/i);
assert.match(expStory.cards.at(-1).notes, /Site contact/i);

const offPropertyStory = buildBoardWizardListingMarketingBatchFromAnalyses({
  extraction: expListing,
  targetBoardTitle: '',
  count: 3,
  narrationSecondsPerCard: 15,
  style: 'warm',
  analyses: expStoryAnalyses,
  aiScenes: [{
    photoIndex: 0,
    role: 'nearby-attraction',
    title: 'Cape May County Park & Zoo',
    subtitle: 'Minutes away',
    narration: 'The Cape May County Park and Zoo is nearby.',
    durationSeconds: 15,
    factKeys: [],
  }],
});
assert.equal(offPropertyStory.cards.some((card) => /Park & Zoo/i.test(card.title)), false, 'a property TalkThru must reject destination and neighborhood detours');
assert.ok(offPropertyStory.cards.every((card) => card.tags.includes('listing-story')), 'rejected off-property scenes should be replaced with listing-photo scenes');

const stagedSaleAnalyses = [
  {
    index: 0,
    sceneType: 'exterior',
    roomType: 'Property exterior',
    features: ['covered entry'],
    movableFurnishings: [],
    qualityScore: 0.9,
    heroScore: 0.95,
    confidence: 0.9,
  },
  {
    index: 1,
    sceneType: 'bedroom',
    roomType: 'Secondary bedroom',
    features: ['green and white walls', 'natural light'],
    movableFurnishings: ['bunk bed', 'desk and office chair', 'colorful rug'],
    qualityScore: 0.86,
    heroScore: 0.55,
    confidence: 0.92,
  },
  {
    index: 2,
    sceneType: 'bathroom',
    roomType: 'Bathroom',
    features: ['attached vanity'],
    movableFurnishings: [],
    qualityScore: 0.82,
    heroScore: 0.45,
    confidence: 0.9,
  },
];
const unsafeFurnishedBedroomScene = {
  photoIndex: 1,
  role: 'bedroom',
  title: 'Bunk-bed bedroom',
  subtitle: 'Bunk bed · desk · colorful rug',
  narration: 'Another versatile bedroom features a bunk bed. A desk and office chair offer a dedicated workspace, while a colorful rug adds vibrancy to the room.',
  durationSeconds: 15,
  factKeys: [],
};
const stagedSaleStory = buildBoardWizardListingMarketingBatchFromAnalyses({
  extraction: expListing,
  targetBoardTitle: '',
  count: 3,
  narrationSecondsPerCard: 30,
  style: 'warm',
  listingIntent: 'sale',
  analyses: stagedSaleAnalyses,
  aiScenes: [unsafeFurnishedBedroomScene],
});
const stagedBedroomCard = stagedSaleStory.cards.find((card) => card.imageUrl === expListing.images[1].url);
assert.ok(stagedBedroomCard, 'a rejected furniture-as-feature scene should be replaced by a grounded fallback');
assert.match(stagedBedroomCard.notes, /shown staged with bunk bed, desk and office chair, and colorful rug/i);
assert.match(stagedBedroomCard.notes, /one possible arrangement/i);
assert.doesNotMatch(stagedBedroomCard.subtitle, /bunk bed|desk|rug/i, 'sale subtitles should describe the property rather than staged furniture');
assert.match(stagedSaleStory.cards.at(-1).notes, /furnishings and decor.*may be staging.*may not be included in the sale/i);
assert.equal(boardWizardListingFurnishingsIncluded(expListing), false);

const safeStagedBedroomScene = {
  ...unsafeFurnishedBedroomScene,
  title: 'A flexible secondary bedroom',
  subtitle: 'Natural light · flexible layout',
  narration: 'Shown staged with a bunk bed, desk, and colorful rug, this room demonstrates one possible sleeping and study arrangement. The permanent green and white walls frame the space.',
};
const safeStagedSaleStory = buildBoardWizardListingMarketingBatchFromAnalyses({
  extraction: expListing,
  targetBoardTitle: '',
  count: 3,
  narrationSecondsPerCard: 30,
  style: 'warm',
  listingIntent: 'sale',
  analyses: stagedSaleAnalyses,
  aiScenes: [safeStagedBedroomScene],
});
const safeStagedBedroomCard = safeStagedSaleStory.cards.find((card) => card.imageUrl === expListing.images[1].url);
assert.equal(safeStagedBedroomCard?.notes, safeStagedBedroomScene.narration, 'properly qualified staging narration should survive validation unchanged');

const unchangedRentalStory = buildBoardWizardListingMarketingBatchFromAnalyses({
  extraction: expListing,
  targetBoardTitle: '',
  count: 3,
  narrationSecondsPerCard: 30,
  style: 'warm',
  listingIntent: 'rental',
  analyses: stagedSaleAnalyses,
  aiScenes: [unsafeFurnishedBedroomScene],
});
const rentalBedroomCard = unchangedRentalStory.cards.find((card) => card.imageUrl === expListing.images[1].url);
assert.ok(rentalBedroomCard);
assert.match(rentalBedroomCard.notes, /features a bunk bed.*desk and office chair.*colorful rug/i, 'rental narration should retain its established direct treatment of provided furnishings');
assert.doesNotMatch(unchangedRentalStory.cards.at(-1).notes, /may be staging.*may not be included in the sale/i);

const explicitlyFurnishedSale = {
  ...expListing,
  description: `${expListing.description} Offered fully furnished with furniture included in the sale.`,
};
assert.equal(boardWizardListingFurnishingsIncluded(explicitlyFurnishedSale), true);
assert.equal(boardWizardListingFurnishingsIncluded({
  ...explicitlyFurnishedSale,
  description: 'Virtually staged; furniture is not included.',
}), false, 'negative furnishing evidence must override furnished wording');
const furnishedSaleStory = buildBoardWizardListingMarketingBatchFromAnalyses({
  extraction: explicitlyFurnishedSale,
  targetBoardTitle: '',
  count: 3,
  narrationSecondsPerCard: 30,
  style: 'warm',
  listingIntent: 'sale',
  analyses: stagedSaleAnalyses,
  aiScenes: [unsafeFurnishedBedroomScene],
});
const furnishedSaleBedroomCard = furnishedSaleStory.cards.find((card) => card.imageUrl === expListing.images[1].url);
assert.ok(furnishedSaleBedroomCard);
assert.match(furnishedSaleBedroomCard.notes, /features a bunk bed.*desk and office chair.*colorful rug/i, 'verified furnished sales may describe included furniture directly');
assert.match(furnishedSaleStory.cards.at(-1).notes, /source describes the property as furnished.*confirm the exact furniture inventory/i);

const longTermRentalStory = buildBoardWizardListingMarketingBatchFromAnalyses({
  extraction: expListing,
  targetBoardTitle: '',
  count: 6,
  narrationSecondsPerCard: 15,
  style: 'guided',
  listingIntent: 'rental',
  analyses: expStoryAnalyses,
});
assert.equal(longTermRentalStory.cards.at(-1).title, 'Check availability & apply');
assert.match(longTermRentalStory.cards.at(-1).notes, /lease terms.*deposits.*application requirements/i);
assert.ok(longTermRentalStory.cards.every((card) => card.tags.includes('rental')));
assert.match(longTermRentalStory.board.description, /rental TalkThru/);

const vacationRentalStory = buildBoardWizardListingMarketingBatchFromAnalyses({
  extraction: airbnb,
  targetBoardTitle: '',
  count: 6,
  narrationSecondsPerCard: 15,
  style: 'warm',
  listingIntent: 'rental',
  analyses: airbnb.images.map((image, index) => ({
    index,
    sceneType: index === 0 ? 'living' : index === 1 ? 'kitchen' : 'bedroom',
    roomType: image.alt || 'Rental space',
    features: [],
    qualityScore: 0.8,
    heroScore: index === 0 ? 0.9 : 0.5,
    confidence: 0.8,
  })),
});
assert.equal(vacationRentalStory.cards.at(-1).title, 'Check availability & book');
assert.match(vacationRentalStory.cards.at(-1).notes, /cancellation terms.*house rules.*booking details/i);

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
