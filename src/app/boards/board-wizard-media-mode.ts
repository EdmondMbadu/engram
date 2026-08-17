export type BoardWizardMediaMode = 'images' | 'mixed' | 'videos';

export const DEFAULT_BOARD_WIZARD_MEDIA_MODE: BoardWizardMediaMode = 'images';

export function normalizeBoardWizardMediaMode(value: unknown): BoardWizardMediaMode {
  return value === 'mixed' || value === 'videos' ? value : DEFAULT_BOARD_WIZARD_MEDIA_MODE;
}

export function boardWizardVideoTargetCount(mode: BoardWizardMediaMode, cardCount: number): number {
  const count = Math.max(0, Math.trunc(cardCount));
  if (mode === 'images' || count === 0) return 0;
  if (mode === 'videos') return count;
  return Math.max(1, Math.round(count / 2));
}

function evenlyDistributedIndices(total: number, count: number): number[] {
  if (total <= 0 || count <= 0) return [];
  if (count >= total) return Array.from({ length: total }, (_, index) => index);
  return Array.from({ length: count }, (_, index) => (
    Math.min(total - 1, Math.floor(((index + 0.5) * total) / count))
  ));
}

/**
 * Places the preferred mixed-media cards first while keeping them spread across
 * the board. Remaining cards follow as deterministic fallbacks when a preferred
 * card has no confident, embeddable video match.
 */
export function orderBoardWizardVideoCandidates<T>(
  cards: readonly T[],
  mode: BoardWizardMediaMode,
  isVideoSuitable: (card: T) => boolean,
): T[] {
  if (mode === 'images' || !cards.length) return [];
  if (mode === 'videos') return [...cards];

  const target = boardWizardVideoTargetCount(mode, cards.length);
  const suitableIndices = cards
    .map((card, index) => isVideoSuitable(card) ? index : -1)
    .filter((index) => index >= 0);
  const pool = suitableIndices.length >= target
    ? suitableIndices
    : Array.from({ length: cards.length }, (_, index) => index);
  const preferredPositions = evenlyDistributedIndices(pool.length, Math.min(target, pool.length));
  const preferredIndices = preferredPositions.map((position) => pool[position]);
  const preferred = new Set(preferredIndices);

  return [
    ...preferredIndices.map((index) => cards[index]),
    ...cards.filter((_, index) => !preferred.has(index)),
  ];
}

export function boardWizardVideoCandidateBatches<T>(cards: readonly T[], batchSize = 20): T[][] {
  const safeBatchSize = Math.max(1, Math.trunc(batchSize));
  const batches: T[][] = [];
  for (let index = 0; index < cards.length; index += safeBatchSize) {
    batches.push(cards.slice(index, index + safeBatchSize));
  }
  return batches;
}
