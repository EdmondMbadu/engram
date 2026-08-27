export type StoredTourHandoffMode = 'walking' | 'driving';

type TourHandoffLeg = {
  durationText: string;
  distanceText: string;
  instruction: string;
  navScript: string;
  toCardId: string;
};

type TourHandoffCard = {
  id: string;
  title: string;
  subtitle: string;
  notes: string;
  shortSummary: string;
  sequence: number;
  legToNext: TourHandoffLeg | null;
};

const genericHandoffPattern = /\b(?:a short distance|roughly nearby|continue to (?:the )?next stop|head to (?:the )?next stop)\b/i;

export function isGenericStoredTourHandoffScript(value: unknown): boolean {
  const script = cleanText(value, 700);
  return !script || genericHandoffPattern.test(script);
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_#>~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

function positiveNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function punctuation(value: string): string {
  return value && !/[.!?]$/.test(value) ? `${value}.` : value;
}

function normalized(value: unknown): string {
  return cleanText(value, 1_000)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function storedTourHandoffCard(value: unknown): TourHandoffCard | null {
  const card = record(value);
  const tour = record(card['tour']);
  const id = cleanText(card['id'], 160);
  const title = cleanText(card['title'], 180);
  if (!id || !title || !Object.keys(tour).length) return null;
  const legValue = record(tour['legToNext']);
  const hasLeg = Object.keys(legValue).length > 0;
  return {
    id,
    title,
    subtitle: cleanText(card['subtitle'], 180),
    notes: cleanText(card['notes'], 3_600),
    shortSummary: cleanText(card['shortSummary'], 420),
    sequence: positiveNumber(tour['sequence']),
    legToNext: hasLeg
      ? {
          durationText: cleanText(legValue['durationText'], 32),
          distanceText: cleanText(legValue['distanceText'], 32),
          instruction: cleanText(legValue['instruction'], 260),
          navScript: cleanText(legValue['navScript'], 700),
          toCardId: cleanText(legValue['toCardId'], 160),
        }
      : null,
  };
}

export function orderedStoredTourHandoffCards(values: unknown[]): TourHandoffCard[] {
  return values
    .map((value, sourceIndex) => ({ card: storedTourHandoffCard(value), sourceIndex }))
    .filter((item): item is { card: TourHandoffCard; sourceIndex: number } => !!item.card)
    .sort((left, right) => left.card.sequence - right.card.sequence || left.sourceIndex - right.sourceIndex)
    .map(({ card }) => card);
}

export function storedTourHandoffTeaser(card: TourHandoffCard): string {
  for (const candidate of [card.shortSummary, card.notes, card.subtitle]) {
    if (!candidate || normalized(candidate) === normalized(card.title)) continue;
    const completeSentence = candidate.match(/^(.{1,190}?[.!?])(?:\s|$)/)?.[1];
    const teaser = cleanText(completeSentence || candidate, 190);
    if (teaser) return punctuation(teaser);
  }
  return '';
}

function legTargetsCard(leg: TourHandoffLeg | null, nextCard: TourHandoffCard): boolean {
  if (!leg) return false;
  if (leg.toCardId) return leg.toCardId === nextCard.id;
  const title = normalized(nextCard.title);
  return title.length >= 4 && normalized(`${leg.instruction} ${leg.navScript}`).includes(title);
}

export function buildStoredTourHandoffFallback(
  fromCard: TourHandoffCard,
  nextCard: TourHandoffCard,
  mode: StoredTourHandoffMode,
): string {
  const leg = fromCard.legToNext;
  const sentences = [`Next stop: ${punctuation(nextCard.title || 'the next stop')}`];
  const teaser = storedTourHandoffTeaser(nextCard);
  if (teaser) sentences.push(teaser);
  if (leg?.durationText) {
    sentences.push(
      `You should reach it in about ${leg.durationText} ${mode === 'driving' ? 'by car' : 'on foot'}${leg.distanceText ? `, around ${leg.distanceText}` : ''}.`,
    );
  } else if (leg?.distanceText) {
    sentences.push(`It is about ${leg.distanceText} away.`);
  }
  sentences.push("I'll meet you there.");
  return sentences.join(' ').replace(/\s+/g, ' ').trim().slice(0, 700);
}

export function effectiveStoredTourHandoffText(
  fromCard: TourHandoffCard,
  nextCard: TourHandoffCard,
  mode: StoredTourHandoffMode,
): string {
  const leg = fromCard.legToNext;
  if (
    leg?.navScript
    && legTargetsCard(leg, nextCard)
    && !isGenericStoredTourHandoffScript(leg.navScript)
  ) {
    return leg.navScript;
  }
  return buildStoredTourHandoffFallback(fromCard, nextCard, mode);
}

export function allowedStoredTourHandoffTexts(
  board: Record<string, unknown>,
): Set<string> {
  const cards = orderedStoredTourHandoffCards(Array.isArray(board['cards']) ? board['cards'] : []);
  const mode: StoredTourHandoffMode = board['kind'] === 'driving-tour' ? 'driving' : 'walking';
  const allowed = new Set<string>();
  cards.slice(0, -1).forEach((card, index) => {
    const nextCard = cards[index + 1];
    if (nextCard) allowed.add(effectiveStoredTourHandoffText(card, nextCard, mode));
  });
  return allowed;
}
