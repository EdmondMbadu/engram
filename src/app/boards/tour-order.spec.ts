import { moveTourCard, orderedTourCards, reorderTourCards, tourOrderIds } from './tour-order';

type TestCard = {
  id: string;
  tour: { sequence: number } | null;
};

describe('Tour stop ordering', () => {
  const cards: TestCard[] = [
    { id: 'A', tour: { sequence: 1 } },
    { id: 'B', tour: { sequence: 2 } },
    { id: 'C', tour: { sequence: 4 } },
    { id: 'note', tour: null },
    { id: 'D', tour: { sequence: 8 } },
  ];

  it('uses sequence order and keeps ties stable', () => {
    expect(orderedTourCards(cards).map((card) => card.id)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('inserts a stop and normalizes every sequence without moving non-tour slots', () => {
    const reordered = reorderTourCards(cards, 'D', 'B', 'before');
    expect(tourOrderIds(reordered)).toEqual(['A', 'D', 'B', 'C']);
    expect(reordered.map((card) => card.id)).toEqual(['A', 'D', 'B', 'note', 'C']);
    expect(orderedTourCards(reordered).map((card) => card.tour?.sequence)).toEqual([1, 2, 3, 4]);
  });

  it('supports accessible earlier and later moves', () => {
    expect(tourOrderIds(moveTourCard(cards, 'C', -1))).toEqual(['A', 'C', 'B', 'D']);
    expect(tourOrderIds(moveTourCard(cards, 'B', 1))).toEqual(['A', 'C', 'B', 'D']);
  });
});
