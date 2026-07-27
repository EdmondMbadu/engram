export type What3WordsLocation = {
  words: string;
  url: string;
};

export type ResolvedWhat3WordsLocation = What3WordsLocation & {
  nearestPlace: string;
  country: string;
  lat: number;
  lng: number;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// Jim supplied this browser key for the shared prototype. Keep it isolated here
// so it can be replaced by a server-side proxy before the feature leaves prototype status.
const WHAT3WORDS_API_KEY = '2BP05REC';
const WHAT3WORDS_API_URL = 'https://api.what3words.com/v3';

const WHAT3WORDS_HOSTS = new Set([
  'what3words.com',
  'www.what3words.com',
  'w3w.co',
  'www.w3w.co',
]);
const THREE_WORD_PART = String.raw`[\p{L}\p{M}]+(?:[ '\-\u2019][\p{L}\p{M}]+)*`;
const THREE_WORD_ADDRESS = new RegExp(
  `^${THREE_WORD_PART}\\.${THREE_WORD_PART}\\.${THREE_WORD_PART}$`,
  'u',
);
const DOT_LIKE_CHARACTERS = /[｡。･・︒։။۔።।]/gu;

export function normalizeWhat3WordsAddress(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  let candidate = value.trim().toLocaleLowerCase();
  const markdownLink = candidate.match(
    /\]\(\s*(https?:\/\/(?:www\.)?(?:what3words\.com|w3w\.co)\/[^)\s]+)\s*\)/i,
  );
  if (markdownLink?.[1]) {
    candidate = markdownLink[1];
  }
  try {
    const parsed = new URL(candidate);
    if (WHAT3WORDS_HOSTS.has(parsed.hostname.toLocaleLowerCase())) {
      candidate = decodeURIComponent(parsed.pathname);
    }
  } catch {
    candidate = candidate.replace(/^https?:\/\/(?:www\.)?(?:what3words\.com|w3w\.co)\//i, '');
  }

  candidate = candidate
    .replace(/^\/+/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(DOT_LIKE_CHARACTERS, '.')
    .replace(/\s+/g, ' ')
    .trim();
  return THREE_WORD_ADDRESS.test(candidate) ? candidate : '';
}

export function what3wordsLocation(value: unknown): What3WordsLocation | null {
  const words = normalizeWhat3WordsAddress(value);
  return words
    ? { words, url: `https://what3words.com/${encodeURIComponent(words)}` }
    : null;
}

export async function what3wordsFromCoordinates(
  lat: number,
  lng: number,
  fetcher: FetchLike = fetch,
): Promise<ResolvedWhat3WordsLocation> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error('The browser returned an invalid location.');
  }
  return requestWhat3Words(
    'convert-to-3wa',
    { coordinates: `${lat},${lng}` },
    fetcher,
  );
}

export async function resolveWhat3WordsAddress(
  value: unknown,
  fetcher: FetchLike = fetch,
): Promise<ResolvedWhat3WordsLocation> {
  const words = normalizeWhat3WordsAddress(value);
  if (!words) {
    throw new Error('Use exactly three words separated by periods.');
  }
  return requestWhat3Words('convert-to-coordinates', { words }, fetcher);
}

async function requestWhat3Words(
  endpoint: 'convert-to-3wa' | 'convert-to-coordinates',
  parameters: Record<string, string>,
  fetcher: FetchLike,
): Promise<ResolvedWhat3WordsLocation> {
  const url = new URL(`${WHAT3WORDS_API_URL}/${endpoint}`);
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('key', WHAT3WORDS_API_KEY);
  const response = await fetcher(url);
  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    // The response status below still gives the user a useful error.
  }
  const apiError = payload['error'] && typeof payload['error'] === 'object'
    ? payload['error'] as Record<string, unknown>
    : null;
  if (!response.ok || apiError) {
    const message = typeof apiError?.['message'] === 'string'
      ? apiError['message']
      : `what3words returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  const words = normalizeWhat3WordsAddress(payload['words']);
  const coordinates = payload['coordinates'] && typeof payload['coordinates'] === 'object'
    ? payload['coordinates'] as Record<string, unknown>
    : {};
  const lat = typeof coordinates['lat'] === 'number' ? coordinates['lat'] : Number.NaN;
  const lng = typeof coordinates['lng'] === 'number' ? coordinates['lng'] : Number.NaN;
  if (!words || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('what3words returned an incomplete location.');
  }
  return {
    words,
    url: `https://what3words.com/${encodeURIComponent(words)}`,
    nearestPlace: typeof payload['nearestPlace'] === 'string' ? payload['nearestPlace'] : '',
    country: typeof payload['country'] === 'string' ? payload['country'] : '',
    lat,
    lng,
  };
}
