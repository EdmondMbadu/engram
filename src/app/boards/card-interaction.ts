export function canReorderCardSurface(
  canEdit: boolean,
  cardCount: number,
  isExpanded: boolean,
  isFlipped: boolean,
): boolean {
  return canEdit && cardCount > 1 && !isExpanded && !isFlipped;
}
