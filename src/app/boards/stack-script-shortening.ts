export type StackScriptShortenCard = {
  cardId: string;
  narration: string;
  sourceNarration?: string;
};

export type StackScriptShortenResult = {
  cardId: string;
  narration: string;
};

const SENTENCE_END = /[.!?][”’"']?$/;

export function stackScriptSentences(value: string): string[] {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return [];

  const segmenterConstructor = (Intl as typeof Intl & {
    Segmenter?: new (locale?: string, options?: { granularity: 'sentence' }) => {
      segment(input: string): Iterable<{ segment: string }>;
    };
  }).Segmenter;
  if (segmenterConstructor) {
    const segmenter = new segmenterConstructor('en', { granularity: 'sentence' });
    return Array.from(segmenter.segment(text), (entry) => entry.segment.trim()).filter(Boolean);
  }

  return text
    .split(/(?<=[.!?][”’"']?)\s+(?=[A-Z0-9“"'])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function stackScriptSentenceCount(value: string): number {
  return stackScriptSentences(value).length;
}

export function shortenStackScriptNarration(value: string, targetSentences: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const limit = Math.max(1, Math.min(3, Math.trunc(targetSentences) || 1));
  const sentences = stackScriptSentences(text);
  if (sentences.length <= limit) return text;
  const shortened = sentences.slice(0, limit).join(' ').trim();
  return SENTENCE_END.test(shortened) ? shortened : `${shortened}.`;
}

export function adjustStackScriptNarration(
  card: StackScriptShortenCard,
  targetSentences: number,
): string {
  const current = card.narration.replace(/\s+/g, ' ').trim();
  const source = card.sourceNarration?.replace(/\s+/g, ' ').trim() || current;
  const target = Math.max(1, Math.min(3, Math.trunc(targetSentences) || 1));
  const currentCount = stackScriptSentenceCount(current);
  const sourceCount = stackScriptSentenceCount(source);
  const material = currentCount < target && sourceCount > currentCount ? source : current;
  return shortenStackScriptNarration(material, target);
}

export function stackScriptShortenEstimateSeconds(
  cards: readonly StackScriptShortenCard[],
  targetSentences: number,
): number {
  const words = cards.reduce((total, card) => {
    return total + adjustStackScriptNarration(card, targetSentences)
      .split(/\s+/)
      .filter(Boolean).length;
  }, 0);
  return Math.max(0, Math.ceil(words / 2.35));
}

export function normalizeStackScriptShortenResults(
  cards: readonly StackScriptShortenCard[],
  results: readonly StackScriptShortenResult[],
  targetSentences: number,
): StackScriptShortenResult[] {
  const resultById = new Map(results.map((result) => [result.cardId, result.narration]));
  return cards.map((card) => {
    const candidate = resultById.get(card.cardId)?.trim();
    return {
      cardId: card.cardId,
      narration: candidate
        ? shortenStackScriptNarration(candidate, targetSentences)
        : adjustStackScriptNarration(card, targetSentences),
    };
  });
}
