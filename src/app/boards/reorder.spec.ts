import { insertionSortOrder, reorderRelativeToTarget } from './reorder';

describe('Board and card insertion reordering', () => {
  const items = ['A', 'B', 'C', 'D', 'E'].map((id, index) => ({ id, order: index }));

  it('shifts the intervening cards instead of swapping two positions', () => {
    expect(reorderRelativeToTarget(items, 'A', 'D', 'after', (item) => item.id).map((item) => item.id))
      .toEqual(['B', 'C', 'D', 'A', 'E']);
    expect(reorderRelativeToTarget(items, 'A', 'D', 'before', (item) => item.id).map((item) => item.id))
      .toEqual(['B', 'C', 'A', 'D', 'E']);
  });

  it('supports moving backward with the same before and after semantics', () => {
    expect(reorderRelativeToTarget(items, 'E', 'B', 'before', (item) => item.id).map((item) => item.id))
      .toEqual(['A', 'E', 'B', 'C', 'D']);
    expect(reorderRelativeToTarget(items, 'E', 'B', 'after', (item) => item.id).map((item) => item.id))
      .toEqual(['A', 'B', 'E', 'C', 'D']);
  });

  it('assigns a stable fractional order between neighboring boards', () => {
    const reordered = reorderRelativeToTarget(items, 'A', 'D', 'after', (item) => item.id);
    expect(insertionSortOrder(reordered, 'A', (item) => item.id, (item) => item.order)).toBe(3.5);
  });
});
