export function cardsForStackView<T extends { id: string }>(
  cards: readonly T[],
  selectedIds: ReadonlySet<string>,
  directView: boolean,
): T[] {
  return directView
    ? [...cards]
    : cards.filter((card) => selectedIds.has(card.id));
}
