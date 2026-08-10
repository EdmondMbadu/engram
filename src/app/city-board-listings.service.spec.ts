import {
  cityBoardListingFromData,
  sortCityBoardListings,
  type CityBoardListing,
} from './city-board-listings.service';

describe('city board listings', () => {
  it('accepts only public, published, listed projections', () => {
    const listing = cityBoardListingFromData('listing-1', {
      board_id: 'board-1',
      atlas_id: 'atlas-1',
      title: 'City essentials',
      visibility: 'public',
      editorial_status: 'published',
      city_listing_status: 'listed',
      card_count: 10,
    });
    expect(listing?.id).toBe('board-1');
    expect(listing?.cardCount).toBe(10);
    expect(cityBoardListingFromData('listing-2', {
      board_id: 'board-2',
      atlas_id: 'atlas-1',
      title: 'Pending board',
      visibility: 'private',
      editorial_status: 'needs_review',
      city_listing_status: 'pending',
    })).toBeNull();
  });

  it('sorts featured boards before recent fallback boards', () => {
    const base: CityBoardListing = {
      id: '', atlasId: 'atlas-1', title: '', description: '', icon: 'dashboard', tone: 'teal',
      imageUrl: '', kind: 'standard', cardCount: 0, publisherName: 'LivingWiki',
      featuredRank: 9_999, approvedAt: null, updatedAt: null,
    };
    const sorted = sortCityBoardListings([
      { ...base, id: 'recent', title: 'Recent', approvedAt: '2026-08-10T00:00:00.000Z' },
      { ...base, id: 'featured', title: 'Featured', featuredRank: 1, approvedAt: '2020-01-01T00:00:00.000Z' },
      { ...base, id: 'older', title: 'Older', approvedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    expect(sorted.map((board) => board.id)).toEqual(['featured', 'recent', 'older']);
  });
});
