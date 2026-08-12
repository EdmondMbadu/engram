export type BoardGenerationScoreBreakdown = {
  completeness: number;
  evidence: number;
  identity: number;
  specificity: number;
  freshness: number;
  safety: number;
};

export type BoardGenerationScore = {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: BoardGenerationScoreBreakdown;
  reasons: string[];
  scoredAt: string;
  rubricVersion: '1.0';
};

type ScoreCard = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function finiteCoordinate(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function sourceUrl(card: ScoreCard): string {
  return text(card.sourceUrl || card.source_url);
}

function sourceTitle(card: ScoreCard): string {
  return text(card.sourceTitle || card.source_title);
}

function cardTitle(card: ScoreCard): string {
  return text(card.title);
}

function cardNotes(card: ScoreCard): string {
  return text(card.notes);
}

function cardSummary(card: ScoreCard): string {
  return text(card.shortSummary || card.short_summary);
}

function dateValue(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

function grade(score: number): BoardGenerationScore['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function scoreGeneratedBoard(
  board: Record<string, unknown>,
  options: { expectedCount?: number; freshnessDays?: number | null; now?: Date } = {},
): BoardGenerationScore {
  const cards = Array.isArray(board.cards)
    ? board.cards.filter((card): card is ScoreCard => !!card && typeof card === 'object')
    : [];
  const expectedCount = Math.max(1, Math.trunc(options.expectedCount || Number(
    (board.validation_summary as Record<string, unknown> | undefined)?.requested_count,
  ) || cards.length || 10));
  const now = options.now ?? new Date();
  const reasons: string[] = [];

  const completeCards = cards.filter((card) => cardTitle(card) && cardNotes(card) && cardSummary(card)).length;
  const uniqueTitles = new Set(cards.map((card) => cardTitle(card).toLocaleLowerCase()).filter(Boolean)).size;
  const completeness = clamp(
    15 * Math.min(1, cards.length / expectedCount)
      + 6 * Math.min(1, completeCards / expectedCount)
      + 4 * Math.min(1, uniqueTitles / expectedCount),
    25,
  );
  if (cards.length !== expectedCount) reasons.push(`Expected ${expectedCount} cards; found ${cards.length}.`);
  if (completeCards !== cards.length) reasons.push(`${cards.length - completeCards} card(s) are missing required copy.`);
  if (uniqueTitles !== cards.length) reasons.push('Duplicate card titles reduced the completeness score.');

  const sourcedCards = cards.filter((card) => /^https:\/\//i.test(sourceUrl(card)) && sourceTitle(card)).length;
  const directSources = new Set(cards.map(sourceUrl).filter(Boolean)).size;
  const evidence = clamp(
    20 * Math.min(1, sourcedCards / expectedCount)
      + 5 * Math.min(1, directSources / expectedCount),
    25,
  );
  if (sourcedCards !== cards.length) reasons.push(`${cards.length - sourcedCards} card(s) lack a complete HTTPS citation.`);
  if (directSources < Math.min(cards.length, expectedCount)) reasons.push('Repeated source URLs reduced evidence diversity.');

  const entityCards = cards.filter((card) => text(card.entityName || card.entity_name)).length;
  const coordinates = cards.filter((card) => {
    const lat = card.locationLat ?? card.latitude;
    const lng = card.locationLng ?? card.longitude;
    return finiteCoordinate(lat, -90, 90) && finiteCoordinate(lng, -180, 180);
  }).length;
  const placeCards = cards.filter((card) => ['place', 'study_space', 'street_or_district', 'sequence_stop']
    .includes(text(card.subjectType || card.subject_type || card.type))).length;
  const coordinatePoints = placeCards === 0
    ? 5
    : 5 * Math.min(1, coordinates / placeCards);
  const identity = clamp(
    10 * Math.min(1, entityCards / expectedCount)
      + coordinatePoints,
    15,
  );
  if (entityCards !== cards.length) reasons.push(`${cards.length - entityCards} card(s) lack a stable entity identity.`);

  const generic = /\b(?:hidden gem|must[- ]visit|must see|something for everyone|vibrant|bustling|nestled|look no further|perfect for)\b/i;
  const ranking = /\b(?:best|top[- ]rated|number one|locals[- ]only|tourist[- ]free)\b/i;
  const specificCards = cards.filter((card) => {
    const combined = `${cardTitle(card)} ${text(card.subtitle)} ${cardNotes(card)} ${cardSummary(card)}`;
    return cardNotes(card).length >= 80 && !generic.test(combined) && !ranking.test(combined);
  }).length;
  const specificity = clamp(15 * Math.min(1, specificCards / expectedCount), 15);
  if (specificCards !== cards.length) reasons.push(`${cards.length - specificCards} card(s) are generic, too thin, or use prohibited ranking language.`);

  const freshnessDays = options.freshnessDays ?? null;
  const sourceDates = cards.map((card) => dateValue(card.sourceFetchedAt || card.source_fetched_at || card.extractedAt)).filter(
    (value): value is number => value !== null,
  );
  const freshDates = freshnessDays === null
    ? sourceDates.length
    : sourceDates.filter((value) => now.getTime() - value <= freshnessDays * 86_400_000).length;
  const freshness = freshnessDays === null
    ? 10
    : clamp(10 * Math.min(1, freshDates / expectedCount), 10);
  if (freshnessDays !== null && freshDates !== cards.length) {
    reasons.push(`${cards.length - freshDates} card(s) need fresher evidence for this template.`);
  }

  const unsafe = /\b(?:21\+|twenty-one plus|bar crawl|drink special|happy hour|fake id|trespass|sneak into)\b/i;
  const unsafeCards = cards.filter((card) => unsafe.test(`${cardTitle(card)} ${text(card.subtitle)} ${cardNotes(card)}`)).length;
  const warnings = Array.isArray(board.quality_warnings) ? board.quality_warnings.map(text).filter(Boolean) : [];
  const safety = clamp(10 - unsafeCards * 5 - Math.min(4, warnings.length), 10);
  if (unsafeCards) reasons.push(`${unsafeCards} card(s) contain under-21 or unsafe-content risks.`);
  if (warnings.length) reasons.push(`${warnings.length} quality warning(s) remain.`);

  const breakdown = { completeness, evidence, identity, specificity, freshness, safety };
  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return {
    score,
    grade: grade(score),
    breakdown,
    reasons: reasons.slice(0, 12),
    scoredAt: now.toISOString(),
    rubricVersion: '1.0',
  };
}
