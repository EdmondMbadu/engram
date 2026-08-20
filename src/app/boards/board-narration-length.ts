export const BOARD_NARRATION_WORDS_PER_SECOND = 2.35;
export const DEFAULT_BOARD_NARRATION_SECONDS_PER_CARD = 30;
export const MIN_BOARD_NARRATION_SECONDS_PER_CARD = 5;
export const MAX_BOARD_NARRATION_SECONDS_PER_CARD = 180;

export type BoardNarrationLengthPreset = {
  seconds: number;
  label: string;
  description: string;
};

export const BOARD_NARRATION_LENGTH_PRESETS: readonly BoardNarrationLengthPreset[] = [
  { seconds: 5, label: 'Quick', description: 'One crisp sentence' },
  { seconds: DEFAULT_BOARD_NARRATION_SECONDS_PER_CARD, label: 'Standard', description: 'A useful short story' },
  { seconds: MAX_BOARD_NARRATION_SECONDS_PER_CARD, label: 'Deep dive', description: 'Rich detail and context' },
] as const;

export function normalizeBoardNarrationSeconds(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_BOARD_NARRATION_SECONDS_PER_CARD;
  return Math.max(
    MIN_BOARD_NARRATION_SECONDS_PER_CARD,
    Math.min(MAX_BOARD_NARRATION_SECONDS_PER_CARD, Math.round(numeric / 5) * 5),
  );
}

export function boardNarrationTargetWords(seconds: unknown): number {
  return Math.max(1, Math.round(normalizeBoardNarrationSeconds(seconds) * BOARD_NARRATION_WORDS_PER_SECOND));
}

export function boardNarrationEstimatedTotalSeconds(cardCount: unknown, secondsPerCard: unknown): number {
  const count = typeof cardCount === 'number' && Number.isFinite(cardCount)
    ? Math.max(0, Math.trunc(cardCount))
    : 0;
  return count * normalizeBoardNarrationSeconds(secondsPerCard);
}

export function boardNarrationDurationLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `~${remainder}s`;
  if (!remainder) return `~${minutes} min`;
  return `~${minutes}:${String(remainder).padStart(2, '0')}`;
}
