import type { CityBoardListing } from './city-board-listings.service';
import { cityBoardCategory, selectFeaturedCityBoards } from './city-board-collection.util';

function board(overrides: Partial<CityBoardListing>): CityBoardListing {
  return {
    id: 'board', atlasId: 'atlas', title: 'Board', description: '', icon: 'dashboard_customize',
    tone: 'teal', imageUrl: '', kind: 'standard', cardCount: 10, publisherName: 'LivingWiki',
    templateId: '', categoryId: '', topicIds: [], featuredRank: 9_999, approvedAt: null,
    updatedAt: null, ...overrides,
  };
}

describe('city board collection', () => {
  it('classifies the seven global templates without relying on titles', () => {
    expect(cityBoardCategory(board({ templateId: 'global-dishes-explain' })).id).toBe('food');
    expect(cityBoardCategory(board({ templateId: 'global-guidebooks-miss' })).id).toBe('local-life');
    expect(cityBoardCategory(board({ templateId: 'global-zero-dollars' })).id).toBe('free');
    expect(cityBoardCategory(board({ templateId: 'global-first-24-hours' })).id).toBe('itineraries');
  });

  it('uses stable title fallbacks for projections created before category metadata', () => {
    expect(cityBoardCategory(board({ title: '10 Dishes That Explain Philadelphia' })).id).toBe('food');
    expect(cityBoardCategory(board({ title: '10 Neighborhoods, One Reason Each' })).id).toBe('places');
    expect(cityBoardCategory(board({ title: 'Only Happens Here' })).id).toBe('culture');
    expect(cityBoardCategory(board({
      title: 'Only Happens Here: 10 Things That Make No Sense Anywhere Else',
      description: 'Ten places, gardens, streets, and neighborhoods across the city.',
    })).id).toBe('culture');
    expect(cityBoardCategory(board({ title: 'Where Locals Linger: 10 Places to Sit for Hours' })).id).toBe('local-life');
  });

  it('honors editorial ranks and then diversifies the spotlight', () => {
    const selected = selectFeaturedCityBoards([
      board({ id: 'ranked', title: 'Only Happens Here', featuredRank: 1 }),
      board({ id: 'food', title: '10 Dishes That Explain Philadelphia', imageUrl: 'food.jpg' }),
      board({ id: 'places', title: '10 Neighborhoods, One Reason Each', imageUrl: 'places.jpg' }),
      board({ id: 'more-food', title: 'Where Philadelphia Eats', imageUrl: 'more-food.jpg' }),
    ], 3);
    expect(selected.map((item) => item.id)).toEqual(['ranked', 'food', 'places']);
  });
});
