export type ListingTalkingCardLike = {
  id?: string | null;
  title?: string | null;
  tags?: readonly string[] | null;
  conversation?: { atlasId?: string | null } | null;
};

export type ListingTalkingBoardLike = {
  title?: string | null;
  description?: string | null;
  cards?: readonly ListingTalkingCardLike[] | null;
};

function normalizedTags(card: ListingTalkingCardLike): Set<string> {
  return new Set((card.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean));
}

export function isListingTalkingCardPlaceholder(card: ListingTalkingCardLike | null | undefined): boolean {
  return !!card && normalizedTags(card).has('listing-talking-card-placeholder');
}

export function isRealEstateTalkThru(board: ListingTalkingBoardLike | null | undefined): boolean {
  if (!board) return false;
  if ((board.cards ?? []).some((card) => {
    const tags = normalizedTags(card);
    return tags.has('real-estate') && (tags.has('listing-story') || tags.has('listing'));
  })) return true;
  return /real estate virtualtalkthru/i.test(`${board.title ?? ''} ${board.description ?? ''}`);
}

export function hasListingTalkingCard(board: ListingTalkingBoardLike | null | undefined): boolean {
  return !!board && (board.cards ?? []).some((card) => {
    return isListingTalkingCardPlaceholder(card)
      || !!card.conversation?.atlasId?.trim();
  });
}

export function shouldOfferListingTalkingCardSetup(board: ListingTalkingBoardLike | null | undefined): boolean {
  return isRealEstateTalkThru(board) && !hasListingTalkingCard(board);
}

export function placeListingTalkingCard<T extends ListingTalkingCardLike>(
  cards: readonly T[],
  talkingCard: T,
  placeholderId = '',
): T[] {
  const cleanPlaceholderId = placeholderId.trim();
  const withoutSetup = cards.filter((card) => {
    if (cleanPlaceholderId && card.id === cleanPlaceholderId) return false;
    return !isListingTalkingCardPlaceholder(card);
  });
  const contactIndex = withoutSetup.findIndex((card) => {
    const tags = normalizedTags(card);
    return tags.has('listing-contact')
      || (tags.has('real-estate') && tags.has('group-next-step') && /^contact\b/i.test(card.title?.trim() || ''));
  });
  if (contactIndex < 0) return [...withoutSetup, talkingCard];
  return [
    ...withoutSetup.slice(0, contactIndex),
    talkingCard,
    ...withoutSetup.slice(contactIndex),
  ];
}
