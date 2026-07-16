export type BusinessBadgeIcon = {
  code: string;
  emoji: string;
  label: string;
};

export const BUSINESS_BADGE_ICONS: BusinessBadgeIcon[] = [
  { code: 'hat', emoji: '🎩', label: $localize`Heritage` },
  { code: 'pretzel', emoji: '🥨', label: $localize`Pretzel` },
  { code: 'beer', emoji: '🍺', label: $localize`Beer` },
  { code: 'coffee', emoji: '☕', label: $localize`Coffee` },
  { code: 'restaurant', emoji: '🍽️', label: $localize`Restaurant` },
  { code: 'bread', emoji: '🥐', label: $localize`Bakery` },
  { code: 'pizza', emoji: '🍕', label: $localize`Pizza` },
  { code: 'taco', emoji: '🌮', label: $localize`Taco` },
  { code: 'sushi', emoji: '🍣', label: $localize`Sushi` },
  { code: 'burger', emoji: '🍔', label: $localize`Burger` },
  { code: 'wine', emoji: '🍷', label: $localize`Wine` },
  { code: 'music', emoji: '🎵', label: $localize`Live music` },
  { code: 'cocktail', emoji: '🍸', label: $localize`Cocktail` },
  { code: 'market', emoji: '🧺', label: $localize`Market` },
  { code: 'shop', emoji: '🛍️', label: $localize`Shopping` },
  { code: 'gallery', emoji: '🎨', label: $localize`Art` },
  { code: 'books', emoji: '📚', label: $localize`Books` },
  { code: 'hotel', emoji: '🏨', label: $localize`Hotel` },
  { code: 'landmark', emoji: '🏛️', label: $localize`Landmark` },
  { code: 'theater', emoji: '🎭', label: $localize`Theater` },
  { code: 'events', emoji: '🎟️', label: $localize`Events` },
  { code: 'icecream', emoji: '🍦', label: $localize`Dessert` },
  { code: 'noodles', emoji: '🍜', label: $localize`Noodles` },
  { code: 'florist', emoji: '💐', label: $localize`Flowers` },
  { code: 'wellness', emoji: '💆', label: $localize`Wellness` },
  { code: 'fitness', emoji: '🏋️', label: $localize`Fitness` },
  { code: 'beauty', emoji: '✂️', label: $localize`Beauty` },
  { code: 'pets', emoji: '🐾', label: $localize`Pets` },
  { code: 'auto', emoji: '🔧', label: $localize`Auto` },
  { code: 'service', emoji: '🧰', label: $localize`Service` },
  { code: 'medical', emoji: '🏥', label: $localize`Medical` },
  { code: 'education', emoji: '🎓', label: $localize`Education` },
  { code: 'family', emoji: '🧸', label: $localize`Family` },
  { code: 'outdoors', emoji: '🌿', label: $localize`Outdoors` },
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
