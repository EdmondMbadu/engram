export type BoardInsideDisplay = 'nested' | 'alongside';

type CardWithChildBoard = {
  id: string;
  childBoardId?: string;
};

type ChildBoard<Card> = {
  id: string;
  parentBoardId?: string;
  parentCardId?: string;
  cards: Card[];
};

export function normalizeBoardInsideDisplay(value: unknown): BoardInsideDisplay {
  return value === 'alongside' ? 'alongside' : 'nested';
}

export function cardsForBoardInsideDisplay<Card extends CardWithChildBoard>(
  parentBoardId: string,
  parentCards: readonly Card[],
  childBoards: readonly ChildBoard<Card>[],
  display: BoardInsideDisplay,
  activeChildBoardIds: ReadonlySet<string> = new Set(),
): Card[] {
  if (display !== 'alongside') {
    return [...parentCards];
  }

  const childBoardById = new Map(childBoards.map((board) => [board.id, board]));
  return parentCards.flatMap((parentCard) => {
    const childBoardId = parentCard.childBoardId?.trim();
    const childBoard = childBoardId && activeChildBoardIds.has(childBoardId)
      ? childBoardById.get(childBoardId)
      : null;
    if (
      !childBoard
      || childBoard.parentBoardId !== parentBoardId
      || childBoard.parentCardId !== parentCard.id
    ) {
      return [parentCard];
    }
    return [parentCard, ...childBoard.cards];
  });
}
