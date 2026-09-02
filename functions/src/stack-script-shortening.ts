export type StackScriptShorteningCard = {
  cardId: string;
  title: string;
  narration: string;
  sourceNarration?: string;
};

export type StackScriptShorteningResult = {
  cardId: string;
  narration: string;
};

function sentences(value: string): string[] {
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
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/).map((value) => value.trim()).filter(Boolean);
}

export function stackScriptSentenceCount(value: string): number {
  return sentences(value).length;
}

export function deterministicStackScriptShortening(value: string, targetSentences: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  const limit = Math.max(1, Math.min(3, Math.trunc(targetSentences) || 1));
  const parts = sentences(text);
  if (parts.length <= limit) return text;
  const shortened = parts.slice(0, limit).join(' ').trim();
  return /[.!?][”’"']?$/.test(shortened) ? shortened : `${shortened}.`;
}

export function deterministicStackScriptAdjustment(
  card: Pick<StackScriptShorteningCard, 'narration' | 'sourceNarration'>,
  targetSentences: number,
): string {
  const target = Math.max(1, Math.min(3, Math.trunc(targetSentences) || 1));
  const current = card.narration.replace(/\s+/g, ' ').trim();
  const source = card.sourceNarration?.replace(/\s+/g, ' ').trim() || current;
  const material = stackScriptSentenceCount(current) < target
    && stackScriptSentenceCount(source) > stackScriptSentenceCount(current)
    ? source
    : current;
  return deterministicStackScriptShortening(material, target);
}

function numericTokens(value: string): string[] {
  return value.match(/(?:[$€£]\s*)?\d[\d,.]*(?:%|\s*(?:sq\.?\s*ft|feet|ft|bed(?:room)?s?|bath(?:room)?s?))?/gi)
    ?.map((token) => token.replace(/\s+/g, '').replace(/[.,]+$/, '').toLowerCase()) ?? [];
}

export function normalizeStackScriptShortening(
  cards: readonly StackScriptShorteningCard[],
  candidates: readonly StackScriptShorteningResult[],
  targetSentences: number,
): StackScriptShorteningResult[] {
  const candidateById = new Map(candidates.map((candidate) => [candidate.cardId, candidate.narration]));
  return cards.map((card) => {
    const fallback = deterministicStackScriptAdjustment(card, targetSentences);
    const candidate = candidateById.get(card.cardId)?.replace(/\s+/g, ' ').trim() ?? '';
    const approvedSource = card.sourceNarration?.trim() || card.narration;
    const originalNumbers = new Set(numericTokens(approvedSource));
    const introducesNumber = numericTokens(candidate).some((token) => !originalNumbers.has(token));
    return {
      cardId: card.cardId,
      narration: candidate && !introducesNumber
        ? deterministicStackScriptShortening(candidate, targetSentences)
        : fallback,
    };
  });
}
