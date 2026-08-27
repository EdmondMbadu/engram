export type TourHandoffMode = 'walking' | 'driving';

export type TourHandoffLegLike = {
  durationText?: string | null;
  distanceText?: string | null;
  instruction?: string | null;
  navScript?: string | null;
  toCardId?: string | null;
};

export type TourHandoffCardLike = {
  id: string;
  title: string;
  subtitle?: string | null;
  notes?: string | null;
  shortSummary?: string | null;
  tour?: {
    sequence?: number | null;
    legToNext?: TourHandoffLegLike | null;
  } | null;
};

const genericHandoffPattern = /\b(?:a short distance|roughly nearby|continue to (?:the )?next stop|head to (?:the )?next stop)\b/i;

function cleanHandoffText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_#>~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

function withTerminalPunctuation(value: string): string {
  return value && !/[.!?]$/.test(value) ? `${value}.` : value;
}

function normalizedRouteText(value: unknown): string {
  return cleanHandoffText(value, 1_000)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tourHandoffLegTargetsCard(
  leg: TourHandoffLegLike | null | undefined,
  nextCard: TourHandoffCardLike,
): boolean {
  if (!leg) return false;
  const toCardId = cleanHandoffText(leg.toCardId, 160);
  if (toCardId) return toCardId === nextCard.id;
  const nextTitle = normalizedRouteText(nextCard.title);
  const legText = normalizedRouteText(`${leg.instruction ?? ''} ${leg.navScript ?? ''}`);
  return nextTitle.length >= 4 && legText.includes(nextTitle);
}

export function tourHandoffDestinationTeaser(card: TourHandoffCardLike): string {
  const candidates = [card.shortSummary, card.notes, card.subtitle];
  for (const candidate of candidates) {
    const cleaned = cleanHandoffText(candidate, 420);
    if (!cleaned || normalizedRouteText(cleaned) === normalizedRouteText(card.title)) continue;
    const completeSentence = cleaned.match(/^(.{1,190}?[.!?])(?:\s|$)/)?.[1];
    const teaser = cleanHandoffText(completeSentence || cleaned, 190);
    if (teaser) return withTerminalPunctuation(teaser);
  }
  return '';
}

export function isGenericTourHandoffScript(value: unknown): boolean {
  const script = cleanHandoffText(value, 700);
  return !script || genericHandoffPattern.test(script);
}

export function buildTourHandoffFallback(
  fromCard: TourHandoffCardLike,
  nextCard: TourHandoffCardLike,
  mode: TourHandoffMode,
): string {
  const leg = fromCard.tour?.legToNext;
  const title = cleanHandoffText(nextCard.title, 180) || 'the next stop';
  const teaser = tourHandoffDestinationTeaser(nextCard);
  const duration = cleanHandoffText(leg?.durationText, 32);
  const distance = cleanHandoffText(leg?.distanceText, 32);
  const sentences = [`Next stop: ${withTerminalPunctuation(title)}`];
  if (teaser) sentences.push(teaser);
  if (duration) {
    const travelMode = mode === 'driving' ? 'by car' : 'on foot';
    sentences.push(`You should reach it in about ${duration} ${travelMode}${distance ? `, around ${distance}` : ''}.`);
  } else if (distance) {
    sentences.push(`It is about ${distance} away.`);
  }
  sentences.push("I'll meet you there.");
  return sentences.join(' ').replace(/\s+/g, ' ').trim().slice(0, 700);
}

export function effectiveTourHandoffText(
  fromCard: TourHandoffCardLike,
  nextCard: TourHandoffCardLike,
  mode: TourHandoffMode,
): string {
  const leg = fromCard.tour?.legToNext;
  const curated = cleanHandoffText(leg?.navScript, 700);
  if (
    curated
    && tourHandoffLegTargetsCard(leg, nextCard)
    && !isGenericTourHandoffScript(curated)
  ) {
    return curated;
  }
  return buildTourHandoffFallback(fromCard, nextCard, mode);
}
