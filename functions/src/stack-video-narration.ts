export type StackVideoNarrationCard = Record<string, unknown>;

const maxNarrationSpeechTextLength = 4000;

export function normalizeNarrationSpeechText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
    .replace(/[`*_#>~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxNarrationSpeechTextLength);
}

export function stackTrailerNarrationMatchesPreparedScript(
  preparedScript: unknown,
  requestedSpeechText: unknown,
): boolean {
  const expectedSpeechText = normalizeNarrationSpeechText(preparedScript);
  return !!expectedSpeechText
    && expectedSpeechText === normalizeNarrationSpeechText(requestedSpeechText);
}

export function sharedStackNarrationCacheMode(mode: string): string {
  return mode === 'stack-video' ? 'tour' : mode;
}

export function shouldUseProviderVoicePreviewUrl(
  mode: string,
  isPersonalNarrator: boolean,
): boolean {
  return mode === 'voice-preview' && !isPersonalNarrator;
}

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

export function stackVideoNarrationRevisionFromCard(value: unknown): number {
  const card = value && typeof value === 'object' ? value as StackVideoNarrationCard : {};
  const revision = Number(card['videoNarrationRevision']);
  return Number.isFinite(revision) ? Math.max(0, Math.min(1_000_000, Math.trunc(revision))) : 0;
}

export function stackVideoNarrationRevisionCacheKey(value: unknown): string {
  const revision = stackVideoNarrationRevisionFromCard(value);
  return revision > 0 ? `:r${revision}` : '';
}

export function boardTrailerFallbackScript(params: {
  title: string;
  cardTitles: string[];
}): string {
  const title = cleanTrailerText(params.title, 100) || 'this LivingWiki board';
  const cards = params.cardTitles.map((value) => cleanTrailerText(value, 90)).filter(Boolean).slice(0, 30);
  const count = cards.length;
  if (!count) {
    return `Open ${title} for a quick glimpse, then step inside the full LivingWiki board to explore every card, connection, and story at your own pace.`;
  }
  const first = cards[0];
  const middle = cards[Math.min(cards.length - 1, Math.floor(cards.length / 2))];
  const last = cards[cards.length - 1];
  const journey = count === 1
    ? `Begin with ${first}`
    : count === 2
      ? `Move from ${first} to ${last}`
      : `Move from ${first}, through ${middle}, to ${last}`;
  return `Open ${title} and follow ${count} carefully chosen card${count === 1 ? '' : 's'}. ${journey}. This is only the quick glimpse; the full collection, context, and connections are waiting inside LivingWiki.`;
}

export function normalizeBoardTrailerScript(value: unknown, fallback: string): string {
  const normalized = cleanTrailerText(value, 620)
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const hardRuleHit = /\b(hidden gems?|must[- ]see|vibrant|nestled|iconic|ultimate|breathtaking|something for everyone|embark)\b/i.test(normalized);
  return wordCount >= 24 && wordCount <= 72 && !hardRuleHit ? normalized : fallback;
}

function cleanTrailerText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
