const IMAGE_QUERY_DESCRIPTORS = new Set([
  'the', 'and', 'for', 'official', 'portrait', 'photo', 'image', 'picture',
  'cover', 'poster', 'film', 'movie', 'song', 'album', 'book', 'novel',
  'person', 'people', 'biography', 'president', 'presidential',
]);

const PLACE_ENTITY_DESCRIPTORS = new Set([
  'the', 'and', 'for', 'of', 'at', 'in', 'on', 'distillery', 'distilleries',
  'estate', 'visitor', 'visitors', 'centre', 'center', 'experience', 'official',
  'building', 'co', 'company', 'exterior', 'photo', 'image', 'picture',
]);

const PLACE_CONTEXT_DESCRIPTORS = new Set([
  ...PLACE_ENTITY_DESCRIPTORS,
  'place', 'location', 'venue', 'attraction', 'shop', 'store', 'restaurant',
]);

const CHARACTER_CONTEXT_DESCRIPTORS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'these', 'those',
  'of', 'to', 'in', 'on', 'at', 'as', 'by',
  'top', 'best', 'ranked', 'list', 'guide', 'collection', 'favorite', 'favourite',
  'greatest', 'ultimate', 'hero', 'heroes', 'character', 'characters', 'fictional',
  'official', 'portrait', 'photo', 'image', 'picture', 'still', 'promotional',
  'movie', 'movies', 'film', 'films', 'cinema', 'comic', 'comics', 'television',
  'show', 'shows', 'series', 'actor', 'actress', 'played', 'portrayed', 'depiction',
]);

const CHARACTER_RESULT_NEGATIVE_TERMS = /\b(?:astronomy|astronomical|celestial|constellation|moon|planet|nebula|statue|sculpture|monument|medieval|knight|figurine|action figure|toy|cosplay|fan[ -]?art|logo|emblem)\b/i;

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
  locationLat?: number;
  locationLng?: number;
};

export type BoardWizardPlaceCandidateLike = {
  name?: string;
  formatted_address?: string;
  types?: string[];
  photos?: unknown[];
  rating?: number;
  user_ratings_total?: number;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
};

export function normalizeWikipediaEntityTitle(value: string): string {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function stripBoardWizardReferenceTitleDescriptor(value: string): string {
  return value
    .replace(/(?:[,:;|]|\s[-–—]\s).*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (isBoardWizardFictionalCharacter(card)) return false;
  if (card.image_intent === 'place') return true;
  if (card.entity_type === 'place') return true;
  if (card.image_intent && ['portrait', 'character', 'event', 'cover', 'product', 'food', 'logo'].includes(card.image_intent)) {
    return false;
  }
  if (card.entity_type && ['person', 'fictional_character', 'event', 'work', 'product', 'food', 'organization'].includes(card.entity_type)) {
    return false;
  }
  return card.type === 'place' || card.type === 'shop';
}

export function isBoardWizardFictionalCharacter(card: BoardWizardImageCardLike): boolean {
  if (card.entity_type === 'fictional_character' || card.image_intent === 'character') return true;
  if (card.media_kind && card.media_kind !== 'none') return false;
  const localText = `${card.title} ${card.subtitle ?? ''} ${(card.tags ?? []).join(' ')} ${card.image_query ?? ''} ${card.image_context ?? ''}`;
  if (/\b(?:fictional character|superhero|supervillain|alter ego|civilian identity|in-character|character depiction)\b/i.test(localText)) {
    return true;
  }
  return /\bcharacter\b/i.test(`${(card.tags ?? []).join(' ')} ${card.image_query ?? ''}`)
    && /\b(?:cinematic universe|fictional universe|franchise|comic(?:s)?|portrayed by|played by)\b/i.test(localText);
}

/**
 * Build character queries from identity, aliases, and franchise/source context.
 * The generated image_query remains useful evidence, but it cannot discard the
 * structured entity fields or the board's context.
 */
export function buildBoardWizardFictionalCharacterSearchQueries(
  card: BoardWizardImageCardLike,
  searchContext: string,
): string[] {
  const entity = boardWizardImageEntityName(card);
  const aliases = boardWizardFictionalCharacterAliases(card)
    .filter((alias) => normalizeCharacterText(alias) !== normalizeCharacterText(entity));
  const context = boardWizardFictionalCharacterContextTokens(card, searchContext).join(' ');
  const suppliedQuery = cleanImageSearchText(card.image_query ?? '');
  const identity = [entity, ...aliases].filter(Boolean).join(' ');
  return uniqueImageQueries([
    [identity, context, 'fictional character'].filter(Boolean).join(' '),
    [entity, context, 'character'].filter(Boolean).join(' '),
    aliases.length ? [aliases[0], entity, context, 'character'].filter(Boolean).join(' ') : '',
    suppliedQuery && [suppliedQuery, context].filter(Boolean).join(' '),
  ], 4, 220);
}

/**
 * Wikipedia's Action API omits many non-free character thumbnails, while its
 * REST summary exposes the lead image. Try franchise-qualified titles before
 * an ambiguous plain title so Thor resolves to Marvel's character, not the
 * Norse deity.
 */
export function buildBoardWizardFictionalCharacterWikipediaTitles(
  card: BoardWizardImageCardLike,
): string[] {
  const entity = boardWizardImageEntityName(card);
  const identities = [entity, ...boardWizardFictionalCharacterAliases(card)]
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter((value) => value.length >= 2 && value.length <= 80)
    .filter((value, index, all) => all.findIndex((candidate) =>
      normalizeCharacterText(candidate) === normalizeCharacterText(value)) === index)
    .slice(0, 4);
  const context = normalizeCharacterText(`${card.image_context ?? ''} ${card.image_query ?? ''} ${(card.tags ?? []).join(' ')}`);
  const suffixes: string[] = [];
  if (/\bmarvel\b/.test(context)) {
    if (/\b(?:mcu|cinematic universe)\b/.test(context)) suffixes.push('Marvel Cinematic Universe');
    suffixes.push('Marvel Comics');
    if (!suffixes.includes('Marvel Cinematic Universe')) suffixes.push('Marvel Cinematic Universe');
  }
  if (/\b(?:dc|dceu|dc comics|dc universe)\b/.test(context)) {
    if (/\b(?:dceu|extended universe|cinematic universe)\b/.test(context)) suffixes.push('DC Extended Universe');
    suffixes.push('DC Comics');
  }
  if (/\bstar wars\b/.test(context)) suffixes.push('Star Wars');

  return [
    ...suffixes.flatMap((suffix) => identities.map((identity) => `${identity} (${suffix})`)),
    ...identities,
  ]
    .filter((value, index, all) => all.findIndex((candidate) =>
      normalizeCharacterText(candidate) === normalizeCharacterText(value)) === index)
    .slice(0, 12);
}

/**
 * A shared mantle is not a unique image identity. When a generated batch calls
 * both Steve Rogers and Sam Wilson simply "Captain America", recover the
 * distinct proper-name segment from each title before image enrichment.
 */
export function disambiguateBoardWizardFictionalCharacterEntities<T extends BoardWizardImageCardLike>(
  cards: T[],
): T[] {
  const groups = new Map<string, Array<{ card: T; index: number; specificName: string }>>();
  cards.forEach((card, index) => {
    if (!isBoardWizardFictionalCharacter(card)) return;
    const entity = boardWizardImageEntityName(card);
    const specificName = boardWizardFictionalCharacterAliases(card)
      .filter((alias) => normalizeCharacterText(alias) !== normalizeCharacterText(entity))
      .find(isLikelyCharacterProperName) ?? '';
    const key = normalizeCharacterText(entity);
    const group = groups.get(key) ?? [];
    group.push({ card, index, specificName });
    groups.set(key, group);
  });

  const repaired = [...cards];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const normalizedSpecificNames = group.map((item) => normalizeCharacterText(item.specificName)).filter(Boolean);
    if (normalizedSpecificNames.length !== group.length || new Set(normalizedSpecificNames).size !== group.length) continue;
    for (const item of group) {
      const previousEntity = boardWizardImageEntityName(item.card);
      const provisional = {
        ...item.card,
        entity_name: item.specificName,
        entity_type: 'fictional_character',
        image_intent: 'character',
        image_context: [previousEntity, item.card.image_context].filter(Boolean).join(' · ').slice(0, 140),
      };
      repaired[item.index] = {
        ...provisional,
        image_query: buildBoardWizardFictionalCharacterSearchQueries(provisional, '')[0]
          || item.card.image_query,
      } as T;
    }
  }
  return repaired;
}

export function boardWizardFictionalCharacterContextTokens(
  card: BoardWizardImageCardLike,
  searchContext: string,
): string[] {
  const aliases = [boardWizardImageEntityName(card), ...boardWizardFictionalCharacterAliases(card)];
  const identityTokens = new Set(aliases.flatMap(characterTokens));
  const localContext = cleanCharacterContext(card.image_context ?? '');
  const source = localContext || cleanCharacterContext(searchContext);
  return characterTokens(source)
    .filter((token) => !identityTokens.has(token) && !CHARACTER_CONTEXT_DESCRIPTORS.has(token))
    .slice(0, 8);
}

/**
 * Score image-search metadata for a fictional character. A result must match
 * one canonical identity/alias and, when available, the franchise/source
 * context. This intentionally prefers an empty image over an unrelated one.
 */
export function scoreBoardWizardFictionalCharacterImageResult(
  card: BoardWizardImageCardLike,
  searchContext: string,
  resultContext: string,
  resultIndex = 0,
): number {
  const haystack = normalizeCharacterText(resultContext);
  if (!haystack || CHARACTER_RESULT_NEGATIVE_TERMS.test(resultContext)) return 0;

  const identities = [boardWizardImageEntityName(card), ...boardWizardFictionalCharacterAliases(card)]
    .map((value) => ({ value: normalizeCharacterText(value), tokens: characterTokens(value) }))
    .filter((identity) => identity.tokens.length > 0);
  const identityScores = identities.map((identity) => {
    const matches = identity.tokens.filter((token) => haystack.includes(token)).length;
    const required = identity.tokens.length <= 2 ? identity.tokens.length : Math.max(2, Math.ceil(identity.tokens.length * 0.67));
    const exactPhrase = identity.value.length >= 4 && haystack.includes(identity.value);
    return matches >= required ? matches * 35 + (exactPhrase ? 45 : 0) : 0;
  });
  const identityScore = identityScores.length ? Math.max(...identityScores) : 0;
  if (!identityScore) return 0;

  const contextTokens = boardWizardFictionalCharacterContextTokens(card, searchContext);
  const contextMatches = contextTokens.filter((token) => haystack.includes(token)).length;
  if (contextTokens.length && contextMatches === 0) return 0;

  const preferred = /\b(?:character|marvel|dc|disney|pixar|warner|studio|movie|film|television|series|episode|cast|cinematic|universe|franchise)\b/i.test(resultContext);
  return identityScore + contextMatches * 24 + (preferred ? 18 : 0) - resultIndex * 2;
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

  if (isBoardWizardFictionalCharacter(card)) {
    return buildBoardWizardFictionalCharacterSearchQueries(card, searchContext);
  }

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

function boardWizardFictionalCharacterAliases(card: BoardWizardImageCardLike): string[] {
  const title = cleanImageSearchText(card.title);
  const titleParts = title
    .split(/\s*(?::|\||[–—])\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && part.length <= 80);
  return titleParts
    .filter((part, index, all) => all.findIndex((candidate) => normalizeCharacterText(candidate) === normalizeCharacterText(part)) === index)
    .slice(0, 3);
}

function isLikelyCharacterProperName(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  return words.filter((word) => /^[A-Z][A-Za-z'.-]+$/.test(word)).length >= 2;
}

function cleanCharacterContext(value: string): string {
  return cleanImageSearchText(value)
    .replace(/\b(?:top|best|ranked|list|guide|collection|favorite|favourite|greatest|ultimate)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

function normalizeCharacterText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function characterTokens(value: string): string[] {
  return Array.from(new Set(normalizeCharacterText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !/^\d+$/.test(token) && !CHARACTER_CONTEXT_DESCRIPTORS.has(token))));
}

export function scoreBoardWizardPlaceCandidate(
  card: BoardWizardImageCardLike,
  candidate: BoardWizardPlaceCandidateLike,
  searchContext: string,
  resultIndex = 0,
): number {
  const entity = boardWizardImageEntityName(card);
  const distanceMeters = boardWizardPlaceDistanceMeters(card, candidate);
  const hasPreciseLocation = distanceMeters !== null;
  const rawEntityTokens = meaningfulPlaceTokens(entity, PLACE_ENTITY_DESCRIPTORS);
  const entityTokens = hasPreciseLocation
    ? rawEntityTokens.filter((token) => !/^\d+$/.test(token))
    : rawEntityTokens;
  const candidateName = cleanImageSearchText(candidate.name ?? '');
  const candidateTokens = meaningfulPlaceTokens(candidateName, PLACE_ENTITY_DESCRIPTORS);
  if (!entityTokens.length || !candidateTokens.length) return 0;

  const candidateSet = new Set(candidateTokens);
  const matches = entityTokens.filter((token) => candidateSet.has(token)).length;
  const coverage = matches / entityTokens.length;
  const closeParentPlace = distanceMeters !== null && distanceMeters <= 350 && matches >= 1;
  if (matches === 0 || (entityTokens.length >= 2 && coverage < 0.5 && !closeParentPlace)) return 0;

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
  if (contextTokens.length && !contextMatches && !(distanceMeters !== null && distanceMeters <= 10_000)) {
    score -= 55;
  }
  if (distanceMeters !== null) {
    if (distanceMeters <= 150) score += 150;
    else if (distanceMeters <= 500) score += 105;
    else if (distanceMeters <= 2_000) score += 60;
    else if (distanceMeters <= 10_000) score += 20;
    else if (distanceMeters > 25_000) score -= 140;
  }
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
    .filter((token) => token.length >= 2 && !descriptors.has(token))
    .map((token) => /^(?:cannery|canneries|canning)$/.test(token) ? 'canner' : token);
  return Array.from(new Set(tokens));
}

function boardWizardPlaceDistanceMeters(
  card: BoardWizardImageCardLike,
  candidate: BoardWizardPlaceCandidateLike,
): number | null {
  const fromLat = card.locationLat;
  const fromLng = card.locationLng;
  const toLat = candidate.geometry?.location?.lat;
  const toLng = candidate.geometry?.location?.lng;
  if (
    !Number.isFinite(fromLat)
    || !Number.isFinite(fromLng)
    || !Number.isFinite(toLat)
    || !Number.isFinite(toLng)
  ) {
    return null;
  }
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians((toLat as number) - (fromLat as number));
  const longitudeDelta = radians((toLng as number) - (fromLng as number));
  const fromLatitude = radians(fromLat as number);
  const toLatitude = radians(toLat as number);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function normalizePlaceName(value: string): string {
  return meaningfulPlaceTokens(value, PLACE_ENTITY_DESCRIPTORS).join(' ');
}
