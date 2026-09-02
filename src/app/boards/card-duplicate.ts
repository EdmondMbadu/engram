export type DuplicableCard = {
  [key: string]: unknown;
  id: string;
  title: string;
  imageUrls: readonly string[];
  tags: readonly string[];
  stickers: ReadonlyArray<{ id: string; [key: string]: unknown }>;
  tour: { legToNext?: unknown; [key: string]: unknown } | null;
  childBoardId?: string;
  relatedCards?: readonly DuplicableCard[];
  conversation?: object | null;
  listingPresentation?: {
    presentationImageUrls?: readonly string[];
    [key: string]: unknown;
  } | null;
  nearby?: object;
  createdAt: string;
  updatedAt: string;
};

export function duplicateCardRecord<T extends DuplicableCard>(
  card: T,
  createId: () => string,
  now: string,
  appendCopySuffix = true,
): T {
  const copySuffix = ' (copy)';
  const maxTitleLength = 160;
  const title = appendCopySuffix
    ? `${card.title.trim().slice(0, maxTitleLength - copySuffix.length).trimEnd()}${copySuffix}`
    : card.title;
  const relatedCards = (card.relatedCards ?? []).map((relatedCard, index) => ({
    ...duplicateCardRecord(relatedCard, createId, now, false),
    rank: index + 1,
  }));
  const conversation = card.conversation ? { ...card.conversation } as Record<string, unknown> : null;
  if (conversation && Array.isArray(conversation['actions'])) {
    conversation['actions'] = conversation['actions'].map((action) =>
      action && typeof action === 'object' ? { ...action } : action);
  }

  return {
    ...card,
    id: createId(),
    title,
    imageUrls: [...card.imageUrls],
    tags: [...card.tags],
    nearby: card.nearby ? { ...card.nearby } : undefined,
    stickers: card.stickers.map((sticker) => ({ ...sticker, id: createId() })),
    tour: card.tour ? { ...card.tour, legToNext: null } : null,
    childBoardId: '',
    relatedCards,
    conversation,
    listingPresentation: card.listingPresentation ? {
      ...card.listingPresentation,
      presentationImageUrls: [...(card.listingPresentation.presentationImageUrls ?? [])],
    } : card.listingPresentation,
    createdAt: now,
    updatedAt: now,
  } as T;
}
