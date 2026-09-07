export type AuthorScopedCard = {
  authorOnly?: unknown;
};

/**
 * Author-only cards are persisted with the board so their owner can return to
 * the reminder, but they must never enter another viewer's board experience.
 */
export function cardsVisibleToBoardViewer<T extends AuthorScopedCard>(
  cards: readonly T[],
  boardOwnerUserId: string,
  viewerUserId: string,
): T[] {
  if (boardOwnerUserId && boardOwnerUserId === viewerUserId) return [...cards];
  return cards.filter((card) => card.authorOnly !== true);
}

/** Cards safe to use in Live View and any generated or exported experience. */
export function cardsForPublishedExperience<T extends AuthorScopedCard>(cards: readonly T[]): T[] {
  return cards.filter((card) => card.authorOnly !== true);
}
