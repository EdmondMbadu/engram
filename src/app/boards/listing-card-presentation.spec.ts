import {
  isListingGroupCard,
  listingCardPresentationImages,
  normalizeListingCardPresentation,
} from './listing-card-presentation';

describe('listing card presentation', () => {
  it('keeps ordinary multi-photo cards on their cover image', () => {
    expect(listingCardPresentationImages({
      imageUrl: 'cover.jpg',
      imageUrls: ['cover.jpg', 'second.jpg'],
    })).toEqual(['cover.jpg']);
  });

  it('uses only the explicit, card-owned listing presentation subset', () => {
    const listingPresentation = normalizeListingCardPresentation({
      kind: 'listing-group',
      groupKey: 'kitchen',
      label: 'Kitchen',
      confidence: 0.93,
      reviewStatus: 'verified',
      sourcePhotoCount: 6,
      presentationImageUrls: ['second.jpg', 'third.jpg', 'outside-card.jpg'],
    });
    expect(listingCardPresentationImages({
      imageUrl: 'cover.jpg',
      imageUrls: ['cover.jpg', 'second.jpg', 'third.jpg'],
      listingPresentation,
    })).toEqual(['cover.jpg', 'second.jpg', 'third.jpg']);
    expect(isListingGroupCard({ listingPresentation })).toBeTrue();
  });

  it('caps and sanitizes persisted metadata', () => {
    expect(normalizeListingCardPresentation({
      kind: 'listing-group',
      groupKey: ' bedrooms ',
      label: ' Bedrooms ',
      confidence: 8,
      reviewStatus: 'needs-review',
      sourcePhotoCount: 500,
      presentationImageUrls: ['a', 'a', 'b', 'c', 'd', 'e'],
    })).toEqual({
      kind: 'listing-group',
      groupKey: 'bedrooms',
      label: 'Bedrooms',
      confidence: 1,
      reviewStatus: 'needs-review',
      sourcePhotoCount: 100,
      presentationImageUrls: ['a', 'b', 'c', 'd'],
    });
  });
});
