export type ReorderDropPosition = 'before' | 'after';

export function reorderRelativeToTarget<T>(
  items: readonly T[],
  draggedId: string,
  targetId: string,
  position: ReorderDropPosition,
  idFor: (item: T) => string,
): T[] {
  if (!draggedId || !targetId || draggedId === targetId) {
    return [...items];
  }
  const draggedIndex = items.findIndex((item) => idFor(item) === draggedId);
  if (draggedIndex < 0 || !items.some((item) => idFor(item) === targetId)) {
    return [...items];
  }

  const next = [...items];
  const [dragged] = next.splice(draggedIndex, 1);
  const targetIndex = next.findIndex((item) => idFor(item) === targetId);
  next.splice(targetIndex + (position === 'after' ? 1 : 0), 0, dragged);
  return next;
}

export function insertionSortOrder<T>(
  orderedItems: readonly T[],
  insertedId: string,
  idFor: (item: T) => string,
  orderFor: (item: T) => number,
): number | null {
  const index = orderedItems.findIndex((item) => idFor(item) === insertedId);
  if (index < 0) {
    return null;
  }
  const previous = orderedItems[index - 1];
  const next = orderedItems[index + 1];
  if (!previous && !next) {
    return 0;
  }
  if (!previous && next) {
    return orderFor(next) - 1;
  }
  if (previous && !next) {
    return orderFor(previous) + 1;
  }
  const previousOrder = orderFor(previous);
  const nextOrder = orderFor(next);
  return previousOrder < nextOrder && nextOrder - previousOrder > Number.EPSILON
    ? previousOrder + (nextOrder - previousOrder) / 2
    : null;
}
