export type BoardWizardMenuImageCandidate = {
  alt: string;
  src: string;
};

const ignoredTitleTokens = new Set([
  'and',
  'classic',
  'food',
  'from',
  'menu',
  'photo',
  'sandwich',
  'the',
  'with',
]);

export function bestBoardWizardSrcsetUrl(value: string): string {
  const candidates = value
    .split(',')
    .map((part, index) => {
      const [url = '', descriptor = ''] = part.trim().split(/\s+/, 2);
      const match = descriptor.match(/^([\d.]+)(w|x)$/i);
      const weight = match
        ? Number(match[1]) * (match[2].toLowerCase() === 'w' ? 1 : 1000)
        : index;
      return { url, weight, index };
    })
    .filter((candidate) => !!candidate.url);

  return candidates.sort((left, right) =>
    right.weight - left.weight || right.index - left.index,
  )[0]?.url ?? '';
}

export function matchBoardWizardMenuImage(
  title: string,
  images: BoardWizardMenuImageCandidate[],
): string {
  const normalizedTitle = normalizeMenuImageText(title);
  const titleTokens = meaningfulMenuImageTokens(title);
  if (!normalizedTitle || !titleTokens.length) {
    return '';
  }

  const exactAlt = images.find((image) =>
    normalizeMenuImageText(image.alt) === normalizedTitle,
  );
  if (exactAlt) {
    return exactAlt.src;
  }

  const requiredMatches = titleTokens.length === 1
    ? 1
    : Math.max(2, Math.ceil(titleTokens.length * 0.67));
  const scored = images
    .map((image, index) => {
      const normalizedAlt = normalizeMenuImageText(image.alt);
      const normalizedUrl = normalizeMenuImageText(decodeURIComponentSafely(image.src));
      const altMatches = titleTokens.filter((token) => normalizedAlt.split(' ').includes(token)).length;
      const urlMatches = titleTokens.filter((token) => normalizedUrl.includes(token)).length;
      const matches = Math.max(altMatches, urlMatches);
      const completePhrase = normalizedAlt.includes(normalizedTitle) || normalizedUrl.includes(normalizedTitle);
      return {
        image,
        matches,
        score: matches * 40 + (completePhrase ? 30 : 0) + altMatches * 10 - index / 1000,
      };
    })
    .filter((candidate) => candidate.matches >= requiredMatches)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.image.src ?? '';
}

export function meaningfulMenuImageTokens(value: string): string[] {
  return normalizeMenuImageText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !ignoredTitleTokens.has(token))
    .slice(0, 8);
}

export function isPlausibleBoardWizardFoodImageContext(value: string): boolean {
  const context = value.toLowerCase();
  const foodEvidence = /\b(?:food|menu|restaurant|sandwich|sub|cheese\s*steak|cheesesteak|turkey|chicken|beef|wagyu|salad|soup|dessert|drink|catering|doordash|ubereats|grubhub|toasttab)\b/.test(context);
  const unrelatedDevice = /\b(?:console|camera|trail\s*cam|gameboy|gaming|electronics|controller|hardware|device)\b/.test(context);
  return foodEvidence && !unrelatedDevice;
}

function normalizeMenuImageText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeURIComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
