export type BusinessBadgeIcon = {
  code: string;
  emoji: string;
  label: string;
};

export const BUSINESS_BADGE_ICONS: BusinessBadgeIcon[] = [
  { code: 'hat', emoji: '🎩', label: 'Heritage' },
  { code: 'pretzel', emoji: '🥨', label: 'Pretzel' },
  { code: 'beer', emoji: '🍺', label: 'Beer' },
  { code: 'coffee', emoji: '☕', label: 'Coffee' },
  { code: 'restaurant', emoji: '🍽️', label: 'Restaurant' },
  { code: 'bread', emoji: '🥐', label: 'Bakery' },
  { code: 'pizza', emoji: '🍕', label: 'Pizza' },
  { code: 'taco', emoji: '🌮', label: 'Taco' },
  { code: 'sushi', emoji: '🍣', label: 'Sushi' },
  { code: 'burger', emoji: '🍔', label: 'Burger' },
  { code: 'wine', emoji: '🍷', label: 'Wine' },
  { code: 'music', emoji: '🎵', label: 'Live music' },
  { code: 'cocktail', emoji: '🍸', label: 'Cocktail' },
  { code: 'market', emoji: '🧺', label: 'Market' },
  { code: 'shop', emoji: '🛍️', label: 'Shopping' },
  { code: 'gallery', emoji: '🎨', label: 'Art' },
  { code: 'books', emoji: '📚', label: 'Books' },
  { code: 'hotel', emoji: '🏨', label: 'Hotel' },
  { code: 'landmark', emoji: '🏛️', label: 'Landmark' },
  { code: 'theater', emoji: '🎭', label: 'Theater' },
  { code: 'events', emoji: '🎟️', label: 'Events' },
  { code: 'icecream', emoji: '🍦', label: 'Dessert' },
  { code: 'noodles', emoji: '🍜', label: 'Noodles' },
  { code: 'florist', emoji: '💐', label: 'Flowers' },
  { code: 'wellness', emoji: '💆', label: 'Wellness' },
  { code: 'fitness', emoji: '🏋️', label: 'Fitness' },
  { code: 'beauty', emoji: '✂️', label: 'Beauty' },
  { code: 'pets', emoji: '🐾', label: 'Pets' },
  { code: 'auto', emoji: '🔧', label: 'Auto' },
  { code: 'service', emoji: '🧰', label: 'Service' },
  { code: 'medical', emoji: '🏥', label: 'Medical' },
  { code: 'education', emoji: '🎓', label: 'Education' },
  { code: 'family', emoji: '🧸', label: 'Family' },
  { code: 'outdoors', emoji: '🌿', label: 'Outdoors' },
];

const BUSINESS_BADGE_EMOJI_BY_CODE = new Map(BUSINESS_BADGE_ICONS.map((icon) => [icon.code, icon.emoji]));

export function businessBadgeEmoji(code: string): string {
  if (code === 'bakery') {
    return '🥐';
  }
  if (code === 'local') {
    return '📍';
  }
  return BUSINESS_BADGE_EMOJI_BY_CODE.get(code) ?? '⭐';
}
