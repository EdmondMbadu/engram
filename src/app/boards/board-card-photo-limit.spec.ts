import {
  cardPhotoLimit,
  isVerifiedUrlListingGallery,
  MANUAL_CARD_PHOTO_LIMIT,
  VERIFIED_URL_LISTING_GALLERY_LIMIT,
} from './board-card-photo-limit';

describe('URL listing gallery photo limits', () => {
  it('allows complete verified Airbnb and Zillow listing galleries', () => {
    const input = {
      imageSource: 'source-page',
      sourceUrl: 'https://www.airbnb.com/rooms/776364752068549104',
      tags: ['listing', 'lodging', 'source-image'],
    };
    expect(isVerifiedUrlListingGallery(input)).toBeTrue();
    expect(cardPhotoLimit(input)).toBe(VERIFIED_URL_LISTING_GALLERY_LIMIT);
  });

  it('keeps generic source pages and manual cards at the existing limit', () => {
    expect(cardPhotoLimit({
      imageSource: 'source-page',
      sourceUrl: 'https://shop.example/products/chair',
      tags: ['product', 'shopping', 'source-image'],
    })).toBe(MANUAL_CARD_PHOTO_LIMIT);
    expect(cardPhotoLimit({
      imageSource: 'missing',
      sourceUrl: 'https://www.zillow.com/homedetails/example/123_zpid/',
      tags: ['listing', 'real-estate', 'source-image'],
    })).toBe(MANUAL_CARD_PHOTO_LIMIT);
  });
});
