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
    const outcome: BoardWizardReaderOutcome = {
      markdown: response.ok ? markdown : '',
      status: response.status,
      durationMs: Date.now() - startedAt,
      errorMessage: response.ok ? '' : readerErrorMessage(markdown, response.status),
    };
    if (response.ok && markdown.length >= 100) {
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
    };
  }
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

function safeReaderImageUrl(value: string): string {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
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
