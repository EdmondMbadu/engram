export type StackVideoNarrationCard = Record<string, unknown>;

export function stackVideoNarrationCardFromBoard(
  board: Record<string, unknown>,
  cardId: string,
): StackVideoNarrationCard | null {
  if (!cardId || !Array.isArray(board['cards'])) return null;
  const match = board['cards'].find((value) => {
    const card = value && typeof value === 'object' ? value as StackVideoNarrationCard : {};
    return String(card['id'] ?? '').trim() === cardId;
  });
  return match && typeof match === 'object' ? match as StackVideoNarrationCard : null;
}

export function stackVideoNarrationTextFromCard(
  value: unknown,
  normalize: (value: unknown) => string = (candidate) => String(candidate ?? '').replace(/\s+/g, ' ').trim(),
): string {
  const card = value && typeof value === 'object' ? value as StackVideoNarrationCard : {};
  const tour = card['tour'] && typeof card['tour'] === 'object'
    ? card['tour'] as Record<string, unknown>
    : {};
  const title = String(card['title'] ?? '').trim();
  return normalize(
    tour['guideScript']
      || card['notes']
      || card['shortSummary']
      || card['subtitle']
      || (title ? `${title}.` : ''),
  );
}
