import { appendBoardCards } from './board-batch';

describe('Board batch additions', () => {
  it('appends every generated card without replacing or reordering existing cards', () => {
    const existing = [{ id: 'first' }, { id: 'second' }];
    const additions = [{ id: 'third' }, { id: 'fourth' }];

    expect(appendBoardCards(existing, additions).map((card) => card.id)).toEqual([
      'first',
      'second',
      'third',
      'fourth',
    ]);
    expect(existing.map((card) => card.id)).toEqual(['first', 'second']);
  });
});
