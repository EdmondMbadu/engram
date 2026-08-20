export const BOARD_NARRATION_WORDS_PER_SECOND = 2.35;
export const DEFAULT_BOARD_NARRATION_SECONDS_PER_CARD = 30;
export const MIN_BOARD_NARRATION_SECONDS_PER_CARD = 5;
export const MAX_BOARD_NARRATION_SECONDS_PER_CARD = 180;

export function normalizeBoardNarrationSeconds(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_BOARD_NARRATION_SECONDS_PER_CARD;
  return Math.max(
    MIN_BOARD_NARRATION_SECONDS_PER_CARD,
    Math.min(MAX_BOARD_NARRATION_SECONDS_PER_CARD, Math.round(numeric / 5) * 5),
  );
}

export function boardNarrationTargetWords(value: unknown): number {
  return Math.max(1, Math.round(normalizeBoardNarrationSeconds(value) * BOARD_NARRATION_WORDS_PER_SECOND));
}

export function boardNarrationLengthPromptInstructions(value: unknown): string {
  const seconds = normalizeBoardNarrationSeconds(value);
  const words = boardNarrationTargetWords(seconds);
  const lower = Math.max(6, Math.round(words * 0.85));
  const upper = Math.max(lower, Math.round(words * 1.15));
  return [
    `Narration length target: about ${seconds} seconds per card, approximately ${words} spoken words.`,
    `For newly written card narration, aim for ${lower}-${upper} words and finish complete sentences.`,
    seconds <= 10 ? 'Use one crisp, self-contained sentence.' : '',
    'This is a writing target, not permission to truncate quoted, pasted, or source-authoritative material.',
    'Keep short_summary compact and keep route directions or wayfinders concise regardless of narration length.',
  ].filter(Boolean).join(' ');
}
