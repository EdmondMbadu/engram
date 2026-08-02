import {
  cardsForBoardInsideDisplay,
  normalizeBoardInsideDisplay,
} from './board-inside-display';

describe('board-inside display', () => {
  const parentCards = [
    { id: 'parent-a', childBoardId: 'inside-a' },
    { id: 'parent-b' },
  ];
  const childBoards = [{
    id: 'inside-a',
    parentBoardId: 'board-1',
    parentCardId: 'parent-a',
    cards: [{ id: 'inside-1' }, { id: 'inside-2' }],
  }];

  it('keeps the current nested presentation as the default', () => {
    expect(normalizeBoardInsideDisplay(undefined)).toBe('nested');
    expect(cardsForBoardInsideDisplay('board-1', parentCards, childBoards, 'nested'))
      .toEqual(parentCards);
  });

  it('places cards from a board inside immediately after their parent', () => {
    expect(cardsForBoardInsideDisplay(
      'board-1',
      parentCards,
      childBoards,
      'alongside',
      new Set(['inside-a']),
    ).map((card) => card.id))
      .toEqual(['parent-a', 'inside-1', 'inside-2', 'parent-b']);
  });

  it('keeps an alongside board collapsed until it is activated', () => {
    expect(cardsForBoardInsideDisplay('board-1', parentCards, childBoards, 'alongside'))
      .toEqual(parentCards);
  });

  it('does not flatten a child board linked to another parent board', () => {
    expect(cardsForBoardInsideDisplay('another-board', parentCards, childBoards, 'alongside'))
      .toEqual(parentCards);
  });
});
