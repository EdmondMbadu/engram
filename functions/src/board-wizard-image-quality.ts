const IMAGE_QUERY_DESCRIPTORS = new Set([
  'the', 'and', 'for', 'official', 'portrait', 'photo', 'image', 'picture',
  'cover', 'poster', 'film', 'movie', 'song', 'album', 'book', 'novel',
  'person', 'people', 'biography', 'president', 'presidential',
]);

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
