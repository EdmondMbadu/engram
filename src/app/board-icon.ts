export type BoardIconContext = {
  title?: string;
  description?: string;
  kind?: string;
};

export const BOARD_ICON_OPTIONS = [
  'dashboard_customize',
  'travel_explore',
  'location_city',
  'location_on',
  'restaurant',
  'local_cafe',
  'local_bar',
  'nightlife',
  'beach_access',
  'festival',
  'hiking',
  'directions_walk',
  'directions_car',
  'museum',
  'history_edu',
  'shopping_bag',
  'storefront',
  'favorite',
  'auto_awesome',
  'public',
  'sports_handball',
  'sports_basketball',
  'sports_soccer',
  'sports_football',
  'sports_baseball',
  'sports_tennis',
  'sports_volleyball',
  'fitness_center',
  'music_note',
  'palette',
  'photo_camera',
  'park',
  'family_restroom',
  'school',
  'menu_book',
  'theater_comedy',
  'stadium',
  'spa',
  'pets',
] as const;

const SAFE_BOARD_ICONS = new Set<string>([
  ...BOARD_ICON_OPTIONS,
  'dashboard',
  'map',
  'explore',
  'celebration',
]);

const BOARD_ICON_ALIASES: Record<string, string> = {
  board: 'dashboard_customize',
  boards: 'dashboard_customize',
  city: 'location_city',
  coffee: 'local_cafe',
  food: 'restaurant',
  handball: 'sports_handball',
  sports: 'stadium',
  shopping: 'shopping_bag',
  travel: 'travel_explore',
  walking: 'directions_walk',
  driving: 'directions_car',
};

const THEME_ICONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(handball)\b/i, 'sports_handball'],
  [/\b(basketball|hoops?)\b/i, 'sports_basketball'],
  [/\b(soccer|football club)\b/i, 'sports_soccer'],
  [/\b(american football|nfl)\b/i, 'sports_football'],
  [/\b(baseball|mlb)\b/i, 'sports_baseball'],
  [/\b(tennis)\b/i, 'sports_tennis'],
  [/\b(volleyball)\b/i, 'sports_volleyball'],
  [/\b(sport|game|arena|stadium)\b/i, 'stadium'],
  [/\b(food|eat|restaurant|dining|dish|cuisine|brunch|breakfast|lunch|dinner)\b/i, 'restaurant'],
  [/\b(coffee|cafe|cafés|tea)\b/i, 'local_cafe'],
  [/\b(bar|cocktail|beer|wine|nightlife|club)\b/i, 'local_bar'],
  [/\b(music|song|concert|album|playlist)\b/i, 'music_note'],
  [/\b(museums?|history|historic|heritage)\b/i, 'museum'],
  [/\b(art|gallery|design|creative)\b/i, 'palette'],
  [/\b(theater|theatre|stage|comedy|show)\b/i, 'theater_comedy'],
  [/\b(shop|shopping|store|market|boutique)\b/i, 'shopping_bag'],
  [/\b(beach|coast|ocean|seaside)\b/i, 'beach_access'],
  [/\b(hike|hiking|trail|mountain|outdoor|nature)\b/i, 'hiking'],
  [/\b(park|garden|green space)\b/i, 'park'],
  [/\b(book|read|library|literary)\b/i, 'menu_book'],
  [/\b(school|learn|education|college|university)\b/i, 'school'],
  [/\b(family|families|kid|kids|children)\b/i, 'family_restroom'],
  [/\b(wellness|spa|relax|self-care)\b/i, 'spa'],
  [/\b(pet|pets|dog|dogs|cat|cats)\b/i, 'pets'],
  [/\b(photo|photography|instagram)\b/i, 'photo_camera'],
  [/\b(festival|celebration|event)\b/i, 'festival'],
  [/\b(trip|tour|travel|visit|itinerary|weekend|destination)\b/i, 'travel_explore'],
  [/\b(city|cities|neighborhood|neighbourhood|local|place|places)\b/i, 'location_city'],
];

function normalizedIconName(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')
    : '';
}

/** Always returns a known Material Symbols ligature; never returns user or model text. */
export function resolveBoardIcon(value: unknown, context: BoardIconContext = {}): string {
  const requested = normalizedIconName(value);
  const aliased = BOARD_ICON_ALIASES[requested] ?? requested;
  if (SAFE_BOARD_ICONS.has(aliased)) {
    return aliased;
  }

  if (context.kind === 'walking-tour') {
    return 'directions_walk';
  }
  if (context.kind === 'driving-tour') {
    return 'directions_car';
  }

  const subject = `${context.title ?? ''} ${context.description ?? ''}`.trim();
  for (const [pattern, icon] of THEME_ICONS) {
    if (pattern.test(subject)) {
      return icon;
    }
  }
  return 'dashboard_customize';
}
