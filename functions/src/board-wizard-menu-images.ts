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
    // Candidate separators conventionally include whitespace. Image CDNs frequently use
    // unescaped commas inside transformation paths (for example `fit=cover,width=800`);
    // splitting every comma corrupts those otherwise-valid URLs.
    .split(/,\s+/)
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

export function extractBoardWizardPictureImages(
  html: string,
  baseUrl: string,
): BoardWizardMenuImageCandidate[] {
  const images: BoardWizardMenuImageCandidate[] = [];
  for (const pictureMatch of html.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi)) {
    if (images.length >= 600) break;
    const picture = pictureMatch[1];
    const imageMatch = picture.match(/<img\b([^>]*)>/i);
    if (!imageMatch) continue;
    const imageAttrs = imageMatch[1];
    const pictureEnd = (pictureMatch.index ?? 0) + pictureMatch[0].length;
    const trailingMarkup = html
      .slice(pictureEnd, pictureEnd + 2_600)
      .split(/<picture\b/i, 1)[0];
    const alt = (
      menuImageHtmlAttribute(imageAttrs, 'alt')
      || firstMenuImageFollowingLabel(trailingMarkup)
    ).slice(0, 90);
    const responsiveSets = Array.from(picture.matchAll(/<source\b([^>]*)>/gi))
      .flatMap((sourceMatch) => [
        menuImageHtmlAttribute(sourceMatch[1], 'srcset'),
        menuImageHtmlAttribute(sourceMatch[1], 'data-srcset'),
      ])
      .filter(Boolean);
    const imageSrcset = menuImageHtmlAttribute(imageAttrs, 'srcset')
      || menuImageHtmlAttribute(imageAttrs, 'data-srcset');
    if (imageSrcset) responsiveSets.push(imageSrcset);
    const candidate = bestBoardWizardSrcsetUrl(responsiveSets.join(', '))
      || menuImageHtmlAttribute(imageAttrs, 'data-lw-current-src')
      || menuImageHtmlAttribute(imageAttrs, 'data-src')
      || menuImageHtmlAttribute(imageAttrs, 'data-original')
      || menuImageHtmlAttribute(imageAttrs, 'src');
    const src = safeMenuImageUrl(candidate, baseUrl);
    if (
      !src
      || /\.(?:svg|tiff?)(?:\?|$)/i.test(src)
      || /(logo|icon|avatar|spacer|tracking|pixel)/i.test(`${alt} ${src}`)
    ) {
      continue;
    }
    images.push({ alt, src });
  }

  const seen = new Set<string>();
  return images.filter((image) => {
    const key = `${normalizeMenuImageText(image.alt)}\n${image.src}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function menuImageHtmlAttribute(attrs: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = attrs.match(new RegExp(
    `(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  ));
  return (match?.[1] || match?.[2] || match?.[3] || '')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

function safeMenuImageUrl(value: string, baseUrl: string): string {
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function firstMenuImageFollowingLabel(markup: string): string {
  for (const match of markup.matchAll(
    /<(?:h[1-6]|span|p)\b[^>]*>([\s\S]{0,600}?)<\/(?:h[1-6]|span|p)\s*>/gi,
  )) {
    const label = match[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;|&#39;/gi, "'")
      .replace(/&amp;/gi, '&')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      label.length >= 2
      && label.length <= 180
      && !/^(?:image|photo|loading|add|select|customize|\$[\d,.]+)$/i.test(label)
    ) {
      return label;
    }
  }
  return '';
}
