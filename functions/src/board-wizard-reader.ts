export type BoardWizardReaderMenuItem = {
  title: string;
  description: string;
  price: string;
  category: string;
  imageUrl: string;
};

export type BoardWizardReaderOutcome = {
  markdown: string;
  status: number;
  durationMs: number;
  errorMessage: string;
  blocked: boolean;
};

export type BoardWizardReaderProduct = {
  title: string;
  description: string;
  price: string;
  category: string;
  productUrl: string;
  imageUrl: string;
  sku: string;
};

const readerCache = new Map<string, {
  expiresAt: number;
  outcome: BoardWizardReaderOutcome;
}>();

export async function fetchBoardWizardReaderPage(
  value: string,
  options?: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<BoardWizardReaderOutcome> {
  const startedAt = Date.now();
  const targetUrl = safePublicReaderTarget(value);
  if (!targetUrl) {
    return {
      markdown: '',
      status: 0,
      durationMs: Date.now() - startedAt,
      errorMessage: 'Reader target must be a public HTTP or HTTPS URL.',
      blocked: false,
    };
  }
  const cached = readerCache.get(targetUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.outcome,
      durationMs: Date.now() - startedAt,
    };
  }
  const fetchImpl = options?.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`https://r.jina.ai/${targetUrl}`, {
      headers: {
        'Accept': 'text/plain; charset=utf-8',
        'X-Return-Format': 'markdown',
        'User-Agent': 'LivingWiki/1.0 URL board importer (https://livingwiki.com)',
      },
      signal: AbortSignal.timeout(Math.max(3_000, Math.min(options?.timeoutMs ?? 18_000, 25_000))),
    });
    const markdown = (await response.text()).slice(0, 1_500_000);
    const blocked = response.ok && looksLikeBlockedBoardWizardReaderPage(markdown);
    const outcome: BoardWizardReaderOutcome = {
      markdown: response.ok && !blocked ? markdown : '',
      status: response.status,
      durationMs: Date.now() - startedAt,
      errorMessage: blocked
        ? 'Reader recovered only an access-denied or challenge page from the publisher.'
        : response.ok
          ? ''
          : readerErrorMessage(markdown, response.status),
      blocked,
    };
    if (response.ok && !blocked && markdown.length >= 100) {
      readerCache.set(targetUrl, {
        expiresAt: Date.now() + 10 * 60 * 1000,
        outcome,
      });
      while (readerCache.size > 20) {
        const oldestKey = readerCache.keys().next().value;
        if (typeof oldestKey !== 'string') break;
        readerCache.delete(oldestKey);
      }
    }
    return outcome;
  } catch (error) {
    return {
      markdown: '',
      status: 0,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      blocked: false,
    };
  }
}

export function looksLikeBlockedBoardWizardReaderPage(markdown: string): boolean {
  const normalized = markdown.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return false;

  const absoluteMarkers = [
    'warning: target url returned error 401',
    'warning: target url returned error 403',
    'warning: target url returned error 429',
    'warning: target url returned error 500',
    'warning: target url returned error 502',
    'warning: target url returned error 503',
    'warning: target url returned error 504',
    'sorry, you have been blocked',
    'attention required! | cloudflare',
    'maintenance-page-desktop.jpg',
    'class="lv-waiting"',
  ];
  if (absoluteMarkers.some((marker) => normalized.includes(marker))) {
    return true;
  }

  const shortChallenge = normalized.length < 5_000;
  const challengeEvidence = [
    'access denied',
    'access forbidden',
    'request forbidden',
    'enable javascript and cookies to continue',
    'checking if the site connection is secure',
    'checking your browser before accessing',
    'return at a later time to complete your purchase',
  ].some((marker) => normalized.includes(marker));
  const referenceEvidence =
    /\bref(?:erence)?\s*#\s*[a-z0-9.-]{4,}/i.test(markdown)
    || /blob:http:\/\/localhost\//i.test(markdown)
    || /\bray id\s*:/i.test(markdown);
  return shortChallenge && challengeEvidence && referenceEvidence;
}

export function extractBoardWizardReaderMenuItems(
  markdown: string,
): BoardWizardReaderMenuItem[] {
  const lines = markdown.split(/\r?\n/);
  const items: BoardWizardReaderMenuItem[] = [];
  let category = '';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const heading = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (heading) {
      category = cleanReaderText(heading[1]).slice(0, 90);
      continue;
    }
    const image = line.match(/!\[([^\]]{1,240})\]\((https?:\/\/[^\s)]+)\)/i);
    if (!image) continue;
    const title = cleanReaderText(image[1].replace(/^Image\s+\d+\s*:\s*/i, '')).slice(0, 180);
    const imageUrl = safeReaderImageUrl(image[2]);
    if (!isLikelyReaderMenuPhoto(title, imageUrl, category)) continue;

    const blockLines: string[] = [];
    for (let offset = index + 1; offset < lines.length && offset <= index + 12; offset += 1) {
      const next = lines[offset].trim();
      if (/^#{1,4}\s+/.test(next) || /!\[[^\]]+\]\(https?:\/\//i.test(next)) break;
      if (next) blockLines.push(next);
    }
    const blockText = cleanReaderText(blockLines.join(' '));
    const price = blockText.match(/\$[\d,.]+(?:\+)?/)?.[0] ?? '';
    const description = cleanReaderDescription(blockText, title, price);
    items.push({
      title,
      description,
      price,
      category,
      imageUrl,
    });
  }

  const deduped = new Map<string, BoardWizardReaderMenuItem>();
  for (const item of items) {
    const key = normalizeReaderTitle(item.title);
    const existing = deduped.get(key);
    if (
      !existing
      || item.description.length > existing.description.length
      || (!existing.imageUrl && !!item.imageUrl)
    ) {
      deduped.set(key, item);
    }
  }
  return Array.from(deduped.values()).slice(0, 100);
}

export function extractBoardWizardReaderProducts(
  markdown: string,
  sourceUrl: string,
): BoardWizardReaderProduct[] {
  if (!markdown.trim() || looksLikeBlockedBoardWizardReaderPage(markdown)) {
    return [];
  }
  const lines = markdown.split(/\r?\n/);
  const headings = new Map<number, string>();
  let category = '';
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index]?.trim().match(/^#{1,4}\s+(.+?)\s*$/);
    if (heading) {
      category = cleanReaderText(heading[1]).slice(0, 100);
    }
    headings.set(index, category);
  }

  const productLines = new Set<number>();
  const linkCandidates: Array<{
    index: number;
    title: string;
    productUrl: string;
    linkedImageUrl: string;
    linkedImageAlt: string;
  }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const linkedImage = line.match(
      /\[!\[([^\]]{0,240})\]\(((?:https?:\/\/|\/)[^\s)]+)\)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/i,
    );
    if (linkedImage) {
      const productUrl = safeReaderProductUrl(linkedImage[3], sourceUrl);
      if (productUrl) {
        linkCandidates.push({
          index,
          title: cleanReaderProductTitle(linkedImage[1]),
          productUrl,
          linkedImageUrl: safeReaderImageUrl(resolveReaderUrl(linkedImage[2], sourceUrl)),
          linkedImageAlt: cleanReaderProductTitle(linkedImage[1]),
        });
        productLines.add(index);
        continue;
      }
    }

    const linkPattern = /(^|[^!])\[([^\]]{1,240})\]\(((?:https?:\/\/|\/)[^\s)]+)\)/gi;
    let match: RegExpExecArray | null;
    while ((match = linkPattern.exec(line))) {
      const productUrl = safeReaderProductUrl(match[3], sourceUrl);
      if (!productUrl) continue;
      linkCandidates.push({
        index,
        title: cleanReaderProductTitle(match[2]),
        productUrl,
        linkedImageUrl: '',
        linkedImageAlt: '',
      });
      productLines.add(index);
    }
  }

  const images = lines.flatMap((line, index) =>
    Array.from(line.matchAll(/!\[([^\]]{0,240})\]\(((?:https?:\/\/|\/)[^\s)]+)\)/gi))
      .map((match) => ({
        index,
        alt: cleanReaderProductTitle(match[1]),
        imageUrl: safeReaderImageUrl(resolveReaderUrl(match[2], sourceUrl)),
      }))
      .filter((image) => !!image.imageUrl && !isReaderNoiseImage(image.alt, image.imageUrl)),
  );

  const products: BoardWizardReaderProduct[] = [];
  for (const candidate of linkCandidates) {
    const nearbyImages = images
      .filter((image) => Math.abs(image.index - candidate.index) <= 4)
      .filter((image) => !hasReaderProductBoundary(productLines, candidate.index, image.index))
      .sort((left, right) => {
        const leftNameMatch = readerTitleSimilarity(candidate.title, left.alt);
        const rightNameMatch = readerTitleSimilarity(candidate.title, right.alt);
        return rightNameMatch - leftNameMatch
          || Math.abs(left.index - candidate.index) - Math.abs(right.index - candidate.index);
      });
    const image = candidate.linkedImageUrl
      ? { imageUrl: candidate.linkedImageUrl, alt: candidate.linkedImageAlt }
      : nearbyImages[0];
    const title = candidate.title || image?.alt || readerProductTitleFromUrl(candidate.productUrl);
    if (!isValidReaderProductTitle(title)) continue;
    const block = readerProductBlock(lines, productLines, candidate.index);
    const blockText = cleanReaderText(block.join(' '));
    const price = blockText.match(
      /(?:US\$|CA\$|AU\$|NZ\$|HK\$|S\$|£|€|¥|\$)\s?\d[\d,.]*(?:\+)?(?:\s?(?:USD|CAD|AUD|EUR|GBP|JPY))?/i,
    )?.[0] ?? '';
    const description = cleanReaderDescription(blockText, title, price);
    products.push({
      title: title.slice(0, 180),
      description,
      price,
      category: headings.get(candidate.index) ?? '',
      productUrl: candidate.productUrl,
      imageUrl: image?.imageUrl ?? '',
      sku: readerSkuFromProductUrl(candidate.productUrl),
    });
  }

  const deduped = new Map<string, BoardWizardReaderProduct>();
  for (const product of products) {
    const key = canonicalReaderUrl(product.productUrl);
    const existing = deduped.get(key);
    if (!existing || (!existing.imageUrl && !!product.imageUrl) || product.description.length > existing.description.length) {
      deduped.set(key, product);
    }
  }
  return Array.from(deduped.values()).slice(0, 100);
}

export function boardWizardReaderPageTitle(markdown: string): string {
  return cleanReaderText(markdown.match(/^Title:\s*(.+)$/mi)?.[1] ?? '').slice(0, 300);
}

function cleanReaderDescription(value: string, title: string, price: string): string {
  let description = value
    .replace(/#\d+\s+Most liked/gi, ' ')
    .replace(/•\s*\d+%\s*\(\d+\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  description = description.replace(new RegExp(`^${normalizedTitle}\\s*`, 'i'), '');
  if (price) {
    description = description.replace(price, ' ');
  }
  return description.replace(/\s+/g, ' ').trim().slice(0, 260);
}

function isLikelyReaderMenuPhoto(title: string, imageUrl: string, category: string): boolean {
  if (!title || !imageUrl || !category) return false;
  if (!/\/media\/photosV2\//i.test(imageUrl)) return false;
  if (
    /(?:offers?\s*&?\s*rewards?|about|locations?|store info|contact|franchis|loyalty)/i.test(category)
    || /(?:logo|reward|order catering|free .*purchase|restaurant|sandwich shop)$/i.test(title)
  ) {
    return false;
  }
  return true;
}

function cleanReaderText(value: string): string {
  return value
    .replace(/<!--.*?-->/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeReaderTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanReaderProductTitle(value: string): string {
  return cleanReaderText(value)
    .replace(/^Image\s+\d+\s*:\s*/i, '')
    .replace(/^Image:\s*/i, '')
    .replace(/\s*[|–—]\s*(?:Louis Vuitton|Official.*)$/i, '')
    .trim()
    .slice(0, 180);
}

function isValidReaderProductTitle(value: string): boolean {
  const normalized = normalizeReaderTitle(value);
  return normalized.length >= 2
    && normalized.length <= 150
    && !/^(?:image|shop now|view|learn more|discover|explore|buy now|add to bag|quick view|women|men|beauty|home)$/.test(normalized);
}

function safeReaderProductUrl(value: string, sourceUrl: string): string {
  const resolved = resolveReaderUrl(value, sourceUrl);
  if (!resolved) return '';
  try {
    const url = new URL(resolved);
    const source = new URL(sourceUrl);
    if (!sameReaderMerchant(url.hostname, source.hostname)) return '';
    if (!/\/(?:products?|p|dp|item|sku)\/|\/[^/?#]*-nvprod\d+|[?&](?:product|sku|pid|item)=/i.test(url.toString())) {
      return '';
    }
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function resolveReaderUrl(value: string, baseUrl: string): string {
  try {
    const url = new URL(value, baseUrl);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function sameReaderMerchant(left: string, right: string): boolean {
  const merchantRoot = (hostname: string) => {
    const labels = hostname.toLowerCase().replace(/^www\./, '').split('.');
    const countryCodeSecondLevel =
      labels.length >= 3
      && labels[labels.length - 1]?.length === 2
      && /^(?:ac|co|com|gov|net|org)$/.test(labels[labels.length - 2] ?? '');
    return labels.slice(countryCodeSecondLevel ? -3 : -2).join('.');
  };
  return merchantRoot(left) === merchantRoot(right);
}

function hasReaderProductBoundary(productLines: Set<number>, start: number, end: number): boolean {
  const minimum = Math.min(start, end);
  const maximum = Math.max(start, end);
  for (let index = minimum + 1; index < maximum; index += 1) {
    if (productLines.has(index)) return true;
  }
  return false;
}

function readerProductBlock(lines: string[], productLines: Set<number>, index: number): string[] {
  const block: string[] = [];
  for (let offset = index + 1; offset < lines.length && offset <= index + 9; offset += 1) {
    const line = lines[offset]?.trim() ?? '';
    if (productLines.has(offset) || /^#{1,4}\s+/.test(line)) break;
    if (/^\[[^\]]+\]\((?:https?:\/\/|\/)[^)]+\)\s*$/.test(line)) break;
    if (line && !/^!\[/.test(line)) block.push(line);
  }
  return block;
}

function readerTitleSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeReaderTitle(left).split(/\s+/).filter(Boolean));
  const rightTokens = normalizeReaderTitle(right).split(/\s+/).filter(Boolean);
  return rightTokens.reduce((score, token) => score + (leftTokens.has(token) ? 1 : 0), 0);
}

function readerProductTitleFromUrl(value: string): string {
  try {
    const url = new URL(value);
    const segment = url.pathname.split('/').filter(Boolean).reverse().find((part) => /[a-z]/i.test(part)) ?? '';
    return cleanReaderProductTitle(
      decodeURIComponent(segment)
        .replace(/-nvprod\d+v?$/i, '')
        .replace(/[-_]+/g, ' '),
    );
  } catch {
    return '';
  }
}

function readerSkuFromProductUrl(value: string): string {
  try {
    const segments = new URL(value).pathname.split('/').filter(Boolean).reverse();
    return segments.find((segment) => /^[A-Z]{1,5}\d{3,}$/i.test(segment))?.toUpperCase() ?? '';
  } catch {
    return '';
  }
}

function canonicalReaderUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(?:utm_|gclid|fbclid)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function isReaderNoiseImage(alt: string, imageUrl: string): boolean {
  return /(?:logo|icon|sprite|avatar|spacer|tracking|pixel|loader|placeholder|payment|flag|favicon|maintenance)/i.test(
    `${alt} ${imageUrl}`,
  );
}

function safeReaderImageUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    // DoorDash storefront markdown commonly exposes a very short 1200×228 banner crop.
    // Request a contained rendition of the same publisher-owned photo so the complete dish
    // remains visible in both cards and the full-image viewer.
    const photoMarker = '/media/photosV2/';
    const photoIndex = url.pathname.indexOf(photoMarker);
    if (url.hostname === 'img.cdn4dd.com' && photoIndex >= 0) {
      return new URL(
        `/p/fit=contain,width=1200,height=1200,format=auto,quality=75${url.pathname.slice(photoIndex)}`,
        url.origin,
      ).toString();
    }
    return url.toString();
  } catch {
    return '';
  }
}

function safePublicReaderTarget(value: string): string {
  try {
    const url = new URL(value);
    if (
      !['https:', 'http:'].includes(url.protocol)
      || url.username
      || url.password
      || isPrivateReaderHostname(url.hostname)
    ) {
      return '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

function isPrivateReaderHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost'
    || hostname === '::1'
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || /^127\./.test(hostname)
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^169\.254\./.test(hostname)
  ) {
    return true;
  }
  const private172 = hostname.match(/^172\.(\d{1,3})\./);
  return !!private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31;
}

function readerErrorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown; detail?: unknown };
    const message = parsed.message || parsed.detail;
    if (typeof message === 'string') return message.slice(0, 300);
  } catch {
    // The service can also return a plain-text error.
  }
  return body.replace(/\s+/g, ' ').trim().slice(0, 300) || `Reader request failed with ${status}.`;
}
