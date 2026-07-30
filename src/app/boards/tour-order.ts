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

export function normalizeTourCardSequences<T extends TourOrderCard>(cards: readonly T[]): T[] {
  const normalizedTourCards = orderedTourCards(cards).map((card, index) => ({
    ...card,
    tour: card.tour ? { ...card.tour, sequence: index + 1 } : null,
  })) as T[];
  let tourIndex = 0;
  return cards.map((card) => card.tour ? normalizedTourCards[tourIndex++] ?? card : card);
}

export function insertTourCardAfter<T extends TourOrderCard>(
  cards: readonly T[],
  card: T,
  afterCardId: string | null,
): T[] {
  if (!card.tour || cards.some((existing) => existing.id === card.id)) {
    return [...cards];
  }
  const tourCards = orderedTourCards(cards);
  const afterIndex = afterCardId
    ? tourCards.findIndex((existing) => existing.id === afterCardId)
    : tourCards.length - 1;
  const insertionIndex = afterIndex >= 0 ? afterIndex + 1 : tourCards.length;
  const insertedTourCards = [...tourCards];
  insertedTourCards.splice(insertionIndex, 0, card);
  const normalizedTourCards = insertedTourCards.map((tourCard, index) => ({
    ...tourCard,
    tour: tourCard.tour ? { ...tourCard.tour, sequence: index + 1 } : null,
  })) as T[];

  const nextCards = [...cards, card];
  let tourIndex = 0;
  return nextCards.map((existing) =>
    existing.tour ? normalizedTourCards[tourIndex++] ?? existing : existing);
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
