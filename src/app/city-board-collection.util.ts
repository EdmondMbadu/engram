import type { CityBoardListing } from './city-board-listings.service';

export type CityBoardCategoryId =
  | 'food'
  | 'places'
  | 'local-life'
  | 'free'
  | 'itineraries'
  | 'culture';

export type CityBoardCategory = {
  id: CityBoardCategoryId;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
};

export const CITY_BOARD_CATEGORIES: readonly CityBoardCategory[] = [
  {
    id: 'food',
    label: 'Food & drink',
    shortLabel: 'Food',
    description: 'The dishes, rooms, and rituals that explain how the city eats.',
    icon: 'restaurant',
  },
  {
    id: 'places',
    label: 'Places & neighborhoods',
    shortLabel: 'Places',
    description: 'Neighborhoods, gathering places, and addresses worth understanding.',
    icon: 'location_city',
  },
  {
    id: 'local-life',
    label: 'Local life',
    shortLabel: 'Local life',
    description: 'The habits and everyday places that reveal how the city really works.',
    icon: 'diversity_3',
  },
  {
    id: 'free',
    label: 'Free things',
    shortLabel: 'Free',
    description: 'Public experiences that do not require a ticket or a purchase.',
    icon: 'money_off',
  },
  {
    id: 'itineraries',
    label: 'Itineraries',
    shortLabel: 'Itineraries',
    description: 'Useful sequences for making your time in the city count.',
    icon: 'route',
  },
  {
    id: 'culture',
    label: 'History & culture',
    shortLabel: 'Culture',
    description: 'The stories, institutions, and peculiarities that belong to this place.',
    icon: 'museum',
  },
] as const;

const CATEGORY_BY_ID = new Map<string, CityBoardCategory>(
  CITY_BOARD_CATEGORIES.map((category) => [category.id, category]),
);

const TEMPLATE_CATEGORY: Record<string, CityBoardCategoryId> = {
  'global-dishes-explain': 'food',
  'global-guidebooks-miss': 'local-life',
  'global-zero-dollars': 'free',
  'global-where-locals-linger': 'local-life',
  'global-neighborhoods-one-reason': 'places',
  'global-only-happens-here': 'culture',
  'global-first-24-hours': 'itineraries',
};

export function cityBoardCategory(board: CityBoardListing): CityBoardCategory {
  const explicit = CATEGORY_BY_ID.get(board.categoryId);
  if (explicit) return explicit;

  const templateCategory = TEMPLATE_CATEGORY[board.templateId];
  if (templateCategory) return CATEGORY_BY_ID.get(templateCategory)!;

  const text = `${board.title} ${board.description} ${board.topicIds.join(' ')}`.toLowerCase();
  const title = board.title.toLowerCase();
  if (/dishes? that explain/.test(title)) return CATEGORY_BY_ID.get('food')!;
  if (/guidebooks? miss/.test(title)) return CATEGORY_BY_ID.get('local-life')!;
  if (/zero dollars|things locals do for free/.test(title)) return CATEGORY_BY_ID.get('free')!;
  if (/where locals linger|places? to sit for hours/.test(title)) return CATEGORY_BY_ID.get('local-life')!;
  if (/neighborhoods?, one reason/.test(title)) return CATEGORY_BY_ID.get('places')!;
  if (/only happens here|make no sense anywhere else/.test(title)) return CATEGORY_BY_ID.get('culture')!;
  if (/first 24 hours|dealt as cards/.test(title)) return CATEGORY_BY_ID.get('itineraries')!;

  if (/\b(dish(?:es)?|food|eat(?:s|ing)?|restaurant|cafe|coffee|drink|bar|cuisine)\b/.test(text)) {
    return CATEGORY_BY_ID.get('food')!;
  }
  if (/\b(free|zero dollars|no cost)\b/.test(text)) {
    return CATEGORY_BY_ID.get('free')!;
  }
  if (/\b(24 hours|itinerar|first day|weekend|day trip|route)\b/.test(text)) {
    return CATEGORY_BY_ID.get('itineraries')!;
  }
  if (/\b(neighborhoods?|places?|guidebooks?|parks?|linger|sit|streets?|districts?)\b/.test(text)) {
    return CATEGORY_BY_ID.get('places')!;
  }
  if (/\b(history|historic|culture|museum|only happens|tradition|art|music)\b/.test(text)) {
    return CATEGORY_BY_ID.get('culture')!;
  }
  return CATEGORY_BY_ID.get('local-life')!;
}

export function selectFeaturedCityBoards(
  boards: readonly CityBoardListing[],
  maximum = 5,
): CityBoardListing[] {
  const ranked = boards.filter((board) => board.featuredRank < 9_999);
  const fallback = boards
    .filter((board) => board.featuredRank >= 9_999)
    .map((board, index) => ({ board, index }))
    .sort((left, right) => {
      const imageDifference = Number(!!right.board.imageUrl) - Number(!!left.board.imageUrl);
      if (imageDifference) return imageDifference;
      const cardDifference = right.board.cardCount - left.board.cardCount;
      return cardDifference || left.index - right.index;
    })
    .map(({ board }) => board);

  const candidates = [...ranked, ...fallback];
  const selected: CityBoardListing[] = [];
  const deferred: CityBoardListing[] = [];
  const usedCategories = new Set<CityBoardCategoryId>();

  for (const board of candidates) {
    const categoryId = cityBoardCategory(board).id;
    if (!usedCategories.has(categoryId)) {
      selected.push(board);
      usedCategories.add(categoryId);
    } else {
      deferred.push(board);
    }
    if (selected.length === maximum) return selected;
  }

  for (const board of deferred) {
    if (selected.length === maximum) break;
    selected.push(board);
  }
  return selected;
}

export function cityBoardReelIndex(currentIndex: number, count: number, direction: -1 | 1): number {
  if (count <= 0) return 0;
  return (Math.max(0, currentIndex) + direction + count) % count;
}

export function cityBoardReelSegmentProgress(
  boardIndex: number,
  activeIndex: number,
  activeProgress: number,
): number {
  if (boardIndex < 0 || activeIndex < 0) return 0;
  if (boardIndex < activeIndex) return 100;
  if (boardIndex > activeIndex) return 0;
  return Math.min(100, Math.max(0, activeProgress));
}
