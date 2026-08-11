export type GlobalCityBoardTemplate = {
  id: string;
  version: string;
  titlePattern: string;
  searchQuery: string;
  editorialBrief: string;
  count: number;
  cardTitleMode: 'place' | 'subject';
};

export const GLOBAL_CITY_BOARD_TEMPLATES: readonly GlobalCityBoardTemplate[] = [
  {
    id: 'global-dishes-explain',
    version: '1.0',
    titlePattern: '{count} Dishes That Explain {city}',
    searchQuery: 'local food restaurant signature dishes regional cuisine',
    editorialBrief: 'Dish first. Each card must name one distinct, verifiable dish and explain one specific thing it reveals about the city. Tie it to an exact verified venue. Do not repeat the same dish. No “best,” rankings, generic food praise, or unsupported origin stories. If the dish-to-venue connection cannot be verified, do not claim it.',
    count: 10,
    cardTitleMode: 'subject',
  },
  {
    id: 'global-guidebooks-miss',
    version: '1.0',
    titlePattern: 'What the Guidebooks Miss: {count} Places Locals Deal Each Other',
    searchQuery: 'locally loved independent places community favorites',
    editorialBrief: 'Expectation-subversion, not obscurity theater. Explain the concrete local use, ritual, or reason someone would pass each place to a friend. Never say hidden gem, off the beaten path, locals-only, must-visit, or tourist-free. Do not invent local habits.',
    count: 10,
    cardTitleMode: 'place',
  },
  {
    id: 'global-zero-dollars',
    version: '1.0',
    titlePattern: 'Zero Dollars: {count} Things Locals Do for Free',
    searchQuery: 'free attractions parks public spaces activities',
    editorialBrief: 'Lead with the free behavior, not an adjective. Verify that no required admission or purchase is needed. Explain what people actually do there and why the setting matters. Avoid “fun for everyone,” vague affordability claims, and temporary offers.',
    count: 10,
    cardTitleMode: 'subject',
  },
  {
    id: 'global-where-locals-linger',
    version: '1.0',
    titlePattern: 'Where Locals Linger: {count} Places to Sit for Hours',
    searchQuery: 'cafes libraries parks plazas third places',
    editorialBrief: 'Treat this as a third-places board. Explain the observable setup that makes lingering possible: seating, pace, shade, tables, public access, or a steady room. Do not assert that staff tolerate hours-long stays unless a source supports it. No cozy, charming, or perfect-for filler.',
    count: 10,
    cardTitleMode: 'place',
  },
  {
    id: 'global-neighborhoods-one-reason',
    version: '1.0',
    titlePattern: '{count} Neighborhoods, One Reason Each',
    searchQuery: 'neighborhoods districts local areas',
    editorialBrief: 'Exactly one defensible reason per neighborhood. Use the neighborhood’s real name and a concrete distinction that helps a reader understand the city. Do not flatten communities into stereotypes, safety claims, demographic shorthand, or “vibrant culture.”',
    count: 10,
    cardTitleMode: 'place',
  },
  {
    id: 'global-only-happens-here',
    version: '1.0',
    titlePattern: 'Only Happens Here: {count} Things That Make No Sense Anywhere Else',
    searchQuery: 'unique local landmarks traditions institutions',
    editorialBrief: 'Playful confidence, rigorously local. Lead with the strange or city-specific thing, then explain the context that makes it make sense here. “Only” must be supportable as a local category claim, never an unsupported uniqueness superlative. Reject interchangeable attractions.',
    count: 10,
    cardTitleMode: 'subject',
  },
  {
    id: 'global-first-24-hours',
    version: '1.0',
    titlePattern: 'Your First 24 Hours in {city}, Dealt as Cards',
    searchQuery: 'essential local food culture landmarks first visit',
    editorialBrief: 'Build a plausible first-day sequence, not a top-ten list. Give each card a role in the day and one clear reason it belongs there. Keep travel time and opening-hour claims conservative unless verified. Avoid bucket-list language and exhausting itinerary compression.',
    count: 10,
    cardTitleMode: 'place',
  },
] as const;

export const GLOBAL_CITY_BOARD_TEMPLATE_IDS = GLOBAL_CITY_BOARD_TEMPLATES.map((template) => template.id);

