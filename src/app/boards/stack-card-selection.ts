export function cardsForStackView<T extends { id: string }>(
  cards: readonly T[],
  selectedIds: ReadonlySet<string>,
  directView: boolean,
): T[] {
  return directView
    ? [...cards]
    : cards.filter((card) => selectedIds.has(card.id));
}

export function nextFiniteStackFrameIndex(index: number, frameCount: number): number {
  return frameCount > 0 ? Math.min(Math.max(0, index) + 1, frameCount - 1) : 0;
}

export function previousFiniteStackFrameIndex(index: number): number {
  return Math.max(0, index - 1);
}
