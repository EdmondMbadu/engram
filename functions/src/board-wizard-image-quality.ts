const IMAGE_QUERY_DESCRIPTORS = new Set([
  'the', 'and', 'for', 'official', 'portrait', 'photo', 'image', 'picture',
  'cover', 'poster', 'film', 'movie', 'song', 'album', 'book', 'novel',
  'person', 'people', 'biography', 'president', 'presidential',
]);

const PLACE_ENTITY_DESCRIPTORS = new Set([
  'the', 'and', 'for', 'of', 'at', 'in', 'on', 'distillery', 'distilleries',
  'estate', 'visitor', 'visitors', 'centre', 'center', 'experience', 'official',
  'building', 'exterior', 'photo', 'image', 'picture',
]);

const PLACE_CONTEXT_DESCRIPTORS = new Set([
  ...PLACE_ENTITY_DESCRIPTORS,
  'place', 'location', 'venue', 'attraction', 'shop', 'store', 'restaurant',
]);

export type BoardWizardImageCardLike = {
  title: string;
  subtitle?: string;
  type?: string;
  scope?: string;
  tags?: string[];
  image_query?: string;
  place_query?: string;
  entity_name?: string;
  entity_type?: string;
  image_intent?: string;
  image_context?: string;
  media_kind?: string;
};

export type BoardWizardPlaceCandidateLike = {
  name?: string;
  formatted_address?: string;
  types?: string[];
  photos?: unknown[];
  rating?: number;
  user_ratings_total?: number;
};

export function normalizeWikipediaEntityTitle(value: string): string {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function meaningfulWikipediaEntityTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !IMAGE_QUERY_DESCRIPTORS.has(token));
}

export function wikipediaPageTitleMatchScore(
  query: string,
  pageTitle: string,
  titleCandidates: string[],
): number {
  const normalizedFullPage = normalizeWikipediaEntityTitle(pageTitle);
  const normalizedPage = normalizedFullPage.replace(/\s*\([^)]*\)\s*$/, '');
  if (!normalizedPage) return 0;
  const normalizedCandidates = titleCandidates.map(normalizeWikipediaEntityTitle);
  if (normalizedCandidates.some((title) => title === normalizedFullPage)) {
    return 140;
  }
  if (normalizedCandidates.some((title) => title.replace(/\s*\([^)]*\)\s*$/, '') === normalizedPage)) {
    return 120;
  }

  const entityTokens = requestedEntityTokens(query, titleCandidates);
  const pageTokens = new Set(meaningfulWikipediaEntityTokens(pageTitle));
  if (!entityTokens.length) return 0;
  const matches = entityTokens.filter((token) => pageTokens.has(token)).length;
  // A single-token entity is too ambiguous for a fuzzy match. Exact and
  // parenthetical-title matches have already returned above.
  if (entityTokens.length === 1 && pageTokens.size > 1) return 0;
  const required = entityTokens.length <= 2
    ? entityTokens.length
    : Math.max(2, Math.ceil(entityTokens.length * 0.67));
  if (matches < required) return 0;
  return 80 + matches * 8 - Math.max(0, pageTokens.size - entityTokens.length) * 2;
}

/**
 * Decide whether the depicted entity is a real-world place. Board scope is
 * deliberately ignored: a distillery in a Scotland board remains a physical
 * place even when the model describes the card scope as region or country.
 */
export function shouldResolveBoardWizardCardAsPlace(card: BoardWizardImageCardLike): boolean {
  if (card.media_kind && card.media_kind !== 'none') return false;
  if (card.image_intent === 'place') return true;
  if (card.entity_type === 'place') return true;
  if (card.image_intent && ['portrait', 'event', 'cover', 'product', 'food', 'logo'].includes(card.image_intent)) {
    return false;
  }
  if (card.entity_type && ['person', 'event', 'work', 'product', 'food', 'organization'].includes(card.entity_type)) {
    return false;
  }
  return card.type === 'place' || card.type === 'shop';
}

export function boardWizardImageEntityName(card: BoardWizardImageCardLike): string {
  const authoritative = cleanImageSearchText(card.entity_name ?? '');
  if (authoritative) return authoritative;
  const title = cleanImageSearchText(card.title);
  const prefix = title.split(/\s*[:|]\s*/, 1)[0]?.trim() ?? '';
  return prefix.length >= 2 ? prefix : title;
}

export function buildBoardWizardPlaceSearchQueries(
  card: BoardWizardImageCardLike,
  searchContext: string,
): string[] {
  const entity = boardWizardImageEntityName(card);
  const placeQuery = cleanPlaceQuery(card.place_query ?? '');
  const imageContext = cleanPlaceContext(card.image_context ?? '');
  const subtitleContext = cleanPlaceContext((card.subtitle ?? '').split(/\s*(?:\||·)\s*/, 1)[0] ?? '');
  const boardContext = cleanPlaceContext(searchContext);
  const broadEntity = entity
    .replace(/^the\s+/i, '')
    .replace(/\s+(?:distillery|estate|visitor (?:centre|center))$/i, '')
    .trim();

  return uniqueImageQueries([
    joinPlaceQuery(entity, imageContext || subtitleContext, boardContext),
    placeQuery,
    joinPlaceQuery(entity, subtitleContext, boardContext),
    joinPlaceQuery(entity, boardContext),
    entity,
    broadEntity,
  ], 6, 220);
}

export function buildBoardWizardCommonsSearchQueries(
  card: BoardWizardImageCardLike,
  searchContext: string,
): string[] {
  const entity = boardWizardImageEntityName(card);
  const imageQuery = cleanImageSearchText(card.image_query ?? '');
  const imageContext = cleanPlaceContext(card.image_context ?? '');
  const boardContext = cleanPlaceContext(searchContext);
  const titleEntity = cleanImageSearchText(card.title).split(/\s*[:|]\s*/, 1)[0]?.trim() ?? '';
  const broadEntity = entity
    .replace(/^the\s+/i, '')
    .replace(/\s+(?:distillery|estate|visitor (?:centre|center))$/i, '')
    .trim();
  const isPlace = shouldResolveBoardWizardCardAsPlace(card);

  return uniqueImageQueries(isPlace ? [
    joinPlaceQuery(entity, imageContext || boardContext),
    entity,
    joinPlaceQuery(titleEntity, boardContext),
    titleEntity,
    broadEntity,
    imageQuery,
  ] : [
    imageQuery,
    joinPlaceQuery(entity, imageContext || boardContext),
    entity,
    titleEntity,
  ], 6, 180);
}

export function scoreBoardWizardPlaceCandidate(
  card: BoardWizardImageCardLike,
  candidate: BoardWizardPlaceCandidateLike,
  searchContext: string,
  resultIndex = 0,
): number {
  const entity = boardWizardImageEntityName(card);
  const entityTokens = meaningfulPlaceTokens(entity, PLACE_ENTITY_DESCRIPTORS);
  const candidateName = cleanImageSearchText(candidate.name ?? '');
  const candidateTokens = meaningfulPlaceTokens(candidateName, PLACE_ENTITY_DESCRIPTORS);
  if (!entityTokens.length || !candidateTokens.length) return 0;

  const candidateSet = new Set(candidateTokens);
  const matches = entityTokens.filter((token) => candidateSet.has(token)).length;
  const coverage = matches / entityTokens.length;
  if (matches === 0 || (entityTokens.length >= 2 && coverage < 0.5)) return 0;

  const normalizedEntity = normalizePlaceName(entity);
  const normalizedCandidate = normalizePlaceName(candidateName);
  let score = Math.round(coverage * 90);
  if (normalizedEntity === normalizedCandidate) score += 120;
  else if (normalizedEntity.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedEntity)) score += 75;

  const subtitleContext = (card.subtitle ?? '').split(/\s*(?:\||·)\s*/, 1)[0] ?? '';
  const contextTokens = meaningfulPlaceTokens(
    `${cleanPlaceContext(card.image_context ?? '')} ${cleanPlaceContext(subtitleContext)} ${cleanPlaceContext(searchContext)}`,
    PLACE_CONTEXT_DESCRIPTORS,
  );
  const addressTokens = new Set(meaningfulPlaceTokens(candidate.formatted_address ?? '', PLACE_CONTEXT_DESCRIPTORS));
  const contextMatches = contextTokens.filter((token) => addressTokens.has(token)).length;
  score += Math.min(36, contextMatches * 12);
  if (contextTokens.length && !contextMatches) score -= 55;
  if ((candidate.photos?.length ?? 0) > 0) score += 35;
  if ((candidate.user_ratings_total ?? 0) > 25) score += 8;
  if ((candidate.rating ?? 0) >= 4) score += 4;
  score += Math.max(0, 8 - Math.max(0, resultIndex));

  const types = new Set(candidate.types ?? []);
  if (!candidate.photos?.length && (types.has('locality') || types.has('political') || types.has('postal_code'))) {
    score -= 60;
  }
  return score;
}

export function rankBoardWizardPlaceCandidates<T extends BoardWizardPlaceCandidateLike>(
  card: BoardWizardImageCardLike,
  candidates: T[],
  searchContext: string,
): Array<{ candidate: T; score: number; index: number }> {
  return candidates
    .map((candidate, index) => ({
      candidate,
      score: scoreBoardWizardPlaceCandidate(card, candidate, searchContext, index),
      index,
    }))
    .filter((item) => item.score >= 80)
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

function requestedEntityTokens(query: string, titleCandidates: string[]): string[] {
  const candidates = titleCandidates.length ? titleCandidates : [query];
  const best = candidates
    .map((title) => title
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b(18\d{2}|19\d{2}|20\d{2})\b/g, ' ')
      .replace(/\b(official|movie|film|poster|song|single|album|book|novel|tv|television|series|video game|game|cover|art|portrait|photo|image|picture)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((title) => title.length >= 2)
    .sort((left, right) => meaningfulWikipediaEntityTokens(left).length - meaningfulWikipediaEntityTokens(right).length)[0] ?? query;
  return meaningfulWikipediaEntityTokens(best).slice(0, 5);
}

function cleanImageSearchText(value: string): string {
  return value
    .replace(/^\s*(?:[#№]?\d{1,3}(?:st|nd|rd|th)?\s*[.):\]-]?\s*|[-*•]\s+)/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,;|\s]+|[,;|\s]+$/g, '')
    .trim();
}

function cleanPlaceQuery(value: string): string {
  return cleanImageSearchText(value)
    .replace(/\b(?:high quality|editorial|beautiful|authentic|specific|actual|real|showing|photo|picture|image)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPlaceContext(value: string): string {
  const cleaned = cleanImageSearchText(value)
    .replace(/\b(?:portrait|cover|poster|photo|picture|image|official)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\b(?:top|best|ranked|list|guide|collection|favorites?|favourites?|greatest|ultimate)\b/i.test(cleaned)) {
    return '';
  }
  return cleaned.length >= 2 && cleaned.length <= 100 ? cleaned : '';
}

function joinPlaceQuery(...parts: string[]): string {
  const uniqueParts = parts
    .map(cleanImageSearchText)
    .filter(Boolean)
    .reduce<string[]>((result, part) => {
      const normalized = part.toLowerCase();
      if (!result.some((candidate) => candidate.toLowerCase() === normalized || candidate.toLowerCase().includes(normalized))) {
        result.push(part);
      }
      return result;
    }, []);
  return uniqueParts.join(', ');
}

function uniqueImageQueries(values: string[], limit: number, maxLength: number): string[] {
  return values
    .map((value) => cleanImageSearchText(value).slice(0, maxLength))
    .filter((value) => value.length >= 2)
    .filter((value, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, limit);
}

function meaningfulPlaceTokens(value: string, descriptors: Set<string>): string[] {
  const tokens = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !descriptors.has(token));
  return Array.from(new Set(tokens));
}

function normalizePlaceName(value: string): string {
  return meaningfulPlaceTokens(value, PLACE_ENTITY_DESCRIPTORS).join(' ');
}
