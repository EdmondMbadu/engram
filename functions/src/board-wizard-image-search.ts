import {
  isPlausibleBoardWizardFoodImageContext,
  meaningfulMenuImageTokens,
} from './board-wizard-menu-images';

export type BoardWizardImageSearchIntent = 'food' | 'any';

export interface BoardWizardImageSearchResult {
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  sourceDomain: string;
  title: string;
  confidence: string;
}

type BraveImageSearchResponse = {
  results?: Array<{
    title?: unknown;
    url?: unknown;
    source?: unknown;
    confidence?: unknown;
    thumbnail?: { src?: unknown };
    properties?: { url?: unknown };
  }>;
};

export interface BraveImageSearchOutcome {
  results: BoardWizardImageSearchResult[];
  status: number;
  errorMessage: string;
}

export async function searchBraveImages(
  query: string,
  apiKey: string,
  options?: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<BraveImageSearchOutcome> {
  if (!apiKey.trim() || query.trim().length < 2) {
    return { results: [], status: 0, errorMessage: '' };
  }
  const url = new URL('https://api.search.brave.com/res/v1/images/search');
  url.searchParams.set('q', query.replace(/\s+/g, ' ').trim().slice(0, 180));
  url.searchParams.set('count', '12');
  url.searchParams.set('country', 'us');
  url.searchParams.set('search_lang', 'en');
  url.searchParams.set('safesearch', 'strict');
  url.searchParams.set('spellcheck', '1');
  const fetchImpl = options?.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(Math.max(1_000, Math.min(options?.timeoutMs ?? 4_000, 8_000))),
    });
    const data = await response.json() as BraveImageSearchResponse & {
      message?: unknown;
      detail?: unknown;
    };
    if (!response.ok) {
      return {
        results: [],
        status: response.status,
        errorMessage: stringValue(data.message || data.detail).slice(0, 240),
      };
    }
    return {
      results: normalizeBraveImageResults(data),
      status: response.status,
      errorMessage: '',
    };
  } catch (error) {
    return {
      results: [],
      status: 0,
      errorMessage: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
    };
  }
}

export function rankBoardWizardImageSearchResults(
  results: BoardWizardImageSearchResult[],
  entityName: string,
  intent: BoardWizardImageSearchIntent,
  queryContext = '',
): BoardWizardImageSearchResult[] {
  const entityTokens = meaningfulMenuImageTokens(entityName)
    .filter((token) => !['official', 'picture', 'image'].includes(token))
    .slice(0, 6);
  if (!entityTokens.length) return [];
  const requiredMatches = entityTokens.length <= 2
    ? entityTokens.length
    : Math.max(2, Math.ceil(entityTokens.length * 0.67));
  return results
    .map((result, index) => {
      const resultContext = [
        result.title,
        result.sourceDomain,
        result.sourceUrl,
        result.imageUrl,
      ].join(' ').toLowerCase();
      const matches = entityTokens.filter((token) => resultContext.includes(token)).length;
      const foodValid = intent !== 'food' || isPlausibleBoardWizardFoodImageContext(
        `${queryContext} ${resultContext}`,
      );
      const unsafeAsset = /\.(?:svg|gif)(?:\?|$)/i.test(result.imageUrl)
        || /\b(?:sprite|placeholder|avatar|favicon|loading)\b/i.test(result.imageUrl);
      const confidenceBoost = result.confidence.toLowerCase() === 'high' ? 10 : 0;
      const directImageBoost = result.imageUrl && result.imageUrl !== result.thumbnailUrl ? 8 : 0;
      return {
        result,
        matches,
        foodValid,
        score: matches * 40 + confidenceBoost + directImageBoost - index * 2 - (unsafeAsset ? 200 : 0),
      };
    })
    .filter((candidate) =>
      candidate.matches >= requiredMatches
      && candidate.foodValid
      && candidate.score > 0,
    )
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.result);
}

function normalizeBraveImageResults(data: BraveImageSearchResponse): BoardWizardImageSearchResult[] {
  const seen = new Set<string>();
  return (data.results ?? [])
    .map((result): BoardWizardImageSearchResult | null => {
      const imageUrl = safeHttpUrl(stringValue(result.properties?.url));
      const thumbnailUrl = safeHttpUrl(stringValue(result.thumbnail?.src));
      const finalImageUrl = imageUrl || thumbnailUrl;
      if (!finalImageUrl || seen.has(finalImageUrl)) return null;
      seen.add(finalImageUrl);
      return {
        imageUrl: finalImageUrl,
        thumbnailUrl,
        sourceUrl: safeHttpUrl(stringValue(result.url)),
        sourceDomain: stringValue(result.source).slice(0, 160),
        title: stringValue(result.title).slice(0, 240),
        confidence: stringValue(result.confidence).slice(0, 40),
      };
    })
    .filter((result): result is BoardWizardImageSearchResult => !!result);
}

function safeHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}
