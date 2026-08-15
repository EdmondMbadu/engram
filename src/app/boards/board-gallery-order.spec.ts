import { compareBoardsByCreatedDate } from './board-gallery-order';

describe('board gallery creation order', () => {
  it('shows the newest-created board first', () => {
    const boards = [
      { id: 'older', createdAt: '2026-01-10T12:00:00.000Z' },
      { id: 'newest', createdAt: '2026-03-10T12:00:00.000Z' },
      { id: 'middle', createdAt: '2026-02-10T12:00:00.000Z' },
    ];

    expect(boards.sort(compareBoardsByCreatedDate).map((board) => board.id))
      .toEqual(['newest', 'middle', 'older']);
  });

  it('uses the board id as a deterministic tie-breaker', () => {
    const createdAt = '2026-03-10T12:00:00.000Z';
    const boards = [
      { id: 'board-b', createdAt },
      { id: 'board-a', createdAt },
    ];

    expect(boards.sort(compareBoardsByCreatedDate).map((board) => board.id))
      .toEqual(['board-b', 'board-a']);
  });

  it('places malformed legacy dates after valid creation dates', () => {
    const boards = [
      { id: 'legacy', createdAt: '' },
      { id: 'valid', createdAt: '2026-03-10T12:00:00.000Z' },
    ];

    expect(boards.sort(compareBoardsByCreatedDate).map((board) => board.id))
      .toEqual(['valid', 'legacy']);
  });
});
