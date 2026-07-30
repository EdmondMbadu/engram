import { reorderRelativeToTarget, type ReorderDropPosition } from './reorder';

export type TourOrderCard = {
  id: string;
  tour: {
    sequence: number;
  } | null;
};

export function orderedTourCards<T extends TourOrderCard>(cards: readonly T[]): T[] {
  return cards
    .filter((card) => !!card.tour)
    .sort((left, right) =>
      (left.tour?.sequence ?? 0) - (right.tour?.sequence ?? 0)
      || cards.indexOf(left) - cards.indexOf(right));
}

export function reorderTourCards<T extends TourOrderCard>(
  cards: readonly T[],
  draggedId: string,
  targetId: string,
  position: ReorderDropPosition,
): T[] {
  const reorderedTourCards = reorderRelativeToTarget(
    orderedTourCards(cards),
    draggedId,
    targetId,
    position,
    (card) => card.id,
  ).map((card, index) => ({
    ...card,
    tour: card.tour ? { ...card.tour, sequence: index + 1 } : null,
  })) as T[];

  let tourIndex = 0;
  return cards.map((card) => card.tour ? reorderedTourCards[tourIndex++] ?? card : card);
}

export function moveTourCard<T extends TourOrderCard>(
  cards: readonly T[],
  cardId: string,
  direction: -1 | 1,
): T[] {
  const tourCards = orderedTourCards(cards);
  const currentIndex = tourCards.findIndex((card) => card.id === cardId);
  const target = tourCards[currentIndex + direction];
  if (currentIndex < 0 || !target) {
    return [...cards];
  }
  return reorderTourCards(cards, cardId, target.id, direction < 0 ? 'before' : 'after');
}

export function tourOrderIds<T extends TourOrderCard>(cards: readonly T[]): string[] {
  return orderedTourCards(cards).map((card) => card.id);
}
