export type ListingIntroCardLike = {
  title?: string | null;
  subtitle?: string | null;
  notes?: string | null;
  authorOnly?: boolean;
  tags?: readonly string[] | null;
  updatedAt?: string | null;
};

function clean(value: string | null | undefined, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

export function isListingIntroCardPlaceholder(
  card: ListingIntroCardLike | null | undefined,
): boolean {
  if (!card?.authorOnly) return false;
  const tags = new Set((card.tags ?? []).map((tag) => clean(tag, 48).toLowerCase()));
  return tags.has('real-estate')
    && tags.has('story-intro')
    && tags.has('intro-placeholder');
}

export function completeListingIntroCard<T extends ListingIntroCardLike>(
  card: T,
  options: {
    message: string;
    propertyTitle: string;
    agentName?: string;
    updatedAt: string;
  },
): T {
  const message = clean(options.message, 800);
  if (!isListingIntroCardPlaceholder(card) || !message) return card;
  const agentName = clean(options.agentName, 140);
  const propertyTitle = clean(options.propertyTitle, 140) || 'this property';
  const tags = Array.from(new Set([
    ...(card.tags ?? []).filter((tag) => !['author-only', 'intro-placeholder'].includes(clean(tag, 48).toLowerCase())),
    'agent-intro',
  ])).slice(0, 8);
  return {
    ...card,
    title: agentName ? `Welcome from ${agentName}`.slice(0, 80) : 'Welcome to this property',
    subtitle: `A personal introduction to ${propertyTitle}`.slice(0, 120),
    notes: message,
    authorOnly: false,
    tags,
    updatedAt: options.updatedAt,
  };
}
