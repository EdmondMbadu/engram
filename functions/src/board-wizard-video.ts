export type BoardWizardVideoCandidate = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number;
  embeddable: boolean;
};

export type BoardWizardVideoCardInput = {
  title: string;
  subtitle?: string;
  notes?: string;
  entityName?: string;
  entityType?: string;
  imageContext?: string;
  tags?: string[];
  videoIntent?: boolean;
  videoSearchQuery?: string;
};

const VIDEO_INTENT_PATTERN = /\b(?:you\s*tube(?:\s+(?:link|video))?|best\s+song|signature\s+song|half[\s-]?time\s+show|live\s+performance|performance|concert|music\s+video|trailer|highlight(?:s|\s+reel)?|speech|keynote|interview|tutorial|demonstration|demo\s+video|dance|recital|awards?\s+show|opening\s+ceremony|closing\s+ceremony)\b/i;

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'best', 'by', 'for', 'from', 'full', 'in', 'live', 'of', 'official',
  'on', 'show', 'the', 'to', 'top', 'video', 'with', 'performance', 'highlights', 'halftime',
]);

export function boardWizardCardWantsVideo(
  card: BoardWizardVideoCardInput,
  boardContext: string,
): boolean {
  if (card.videoIntent === true) return true;
  const text = [
    boardContext,
    card.title,
    card.subtitle,
    card.notes,
    card.entityName,
    card.imageContext,
    ...(card.tags ?? []),
  ].filter(Boolean).join(' ');
  return VIDEO_INTENT_PATTERN.test(text);
}

export function buildBoardWizardVideoSearchQuery(
  card: BoardWizardVideoCardInput,
  boardContext: string,
): string {
  const supplied = cleanSearchText(card.videoSearchQuery ?? '');
  if (supplied) return supplied.slice(0, 180);
  const context = cleanSearchText(card.imageContext ?? '');
  const boardHint = cleanSearchText(boardContext).slice(0, 90);
  return [card.entityName || card.title, context, boardHint, 'official video']
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export function buildBoardWizardYouTubeApiQuery(query: string): string {
  const cleaned = cleanSearchText(query);
  if (/\bhalf[\s-]?time\s+show\b/i.test(cleaned) && !/\bfull\b/i.test(cleaned)) {
    return `${cleaned} full performance`.slice(0, 180);
  }
  return cleaned.slice(0, 180);
}

export function buildBoardWizardRelatedVideoSearchQuery(card: BoardWizardVideoCardInput): string {
  const subject = cleanSearchText(card.entityName || card.title);
  const context = cleanSearchText(card.imageContext || card.videoSearchQuery || card.title);
  const combined = `${subject} ${context}`;
  const formatHint = /\b(?:world cup|final|goal|match|tournament|championship|sports?)\b/i.test(combined)
    ? 'match goal highlights'
    : /\bhalf[\s-]?time\s+show\b/i.test(combined)
      ? 'full live performance'
      : /\b(?:song|music|concert|performance|artist|band|singer)\b/i.test(combined)
        ? 'official live performance'
        : 'highlights clip';
  return [subject, context, formatHint]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export function youtubeVideoIdFromReference(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  if (VIDEO_ID_PATTERN.test(raw)) return raw;
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
      return VIDEO_ID_PATTERN.test(id) ? id : '';
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const pathParts = url.pathname.split('/').filter(Boolean);
      const id = url.pathname === '/watch'
        ? url.searchParams.get('v') ?? ''
        : ['embed', 'shorts', 'live'].includes(pathParts[0] ?? '')
          ? pathParts[1] ?? ''
          : '';
      return VIDEO_ID_PATTERN.test(id) ? id : '';
    }
  } catch {
    return '';
  }
  return '';
}

export function scoreBoardWizardVideoCandidate(
  card: BoardWizardVideoCardInput,
  boardContext: string,
  candidate: BoardWizardVideoCandidate,
  options: { allowRelated?: boolean } = {},
): number {
  if (!candidate.embeddable || !youtubeVideoIdFromReference(candidate.videoId)) return -1;
  const expected = tokens([
    card.title,
    card.entityName,
    card.imageContext,
    card.videoSearchQuery,
  ].filter(Boolean).join(' '));
  const candidateTokens = tokens(`${candidate.title} ${candidate.channelTitle}`);
  if (!expected.length || !candidateTokens.length) return -1;
  const overlap = expected.filter((token) => candidateTokens.includes(token)).length;
  const titleTokens = tokens(card.entityName || card.title);
  const titleOverlap = titleTokens.filter((token) => candidateTokens.includes(token)).length;
  if (titleTokens.length && titleOverlap < Math.min(2, titleTokens.length)) return -1;
  const normalizedCandidate = normalizeText(`${candidate.title} ${candidate.channelTitle}`);
  const normalizedTitle = normalizeText(card.entityName || card.title);
  if (/\b(?:studio version|live studio version|hq audio|audio only)\b/i.test(candidate.title)) {
    return -1;
  }
  if (!options.allowRelated && /\b(?:facts? behind|behind the scenes|documentary)\b/i.test(candidate.title)) {
    return -1;
  }
  const normalizedExpectedContext = normalizeText([
    card.title,
    card.imageContext,
    card.videoSearchQuery,
    boardContext,
  ].filter(Boolean).join(' '));
  const contextTokens = tokens(boardContext);
  const contextOverlap = contextTokens.filter((token) => candidateTokens.includes(token)).length;
  let score = overlap * 12 + titleOverlap * 18 + Math.min(24, contextOverlap * 4);
  if (normalizedTitle.length >= 4 && normalizedCandidate.includes(normalizedTitle)) score += 32;
  if (/\b(?:official|nfl|nba|olympics|vevo|records|studios?|network|broadcast)\b/i.test(candidate.channelTitle)) score += 12;
  if (/^(?:nfl|nba|olympics)$/i.test(candidate.channelTitle.trim())) score += 35;
  if (/\b(?:reaction|reacts?|review|commentary|explained|parody|cover by|fan made|shorts?)\b/i.test(candidate.title)) score -= 35;
  if (/\bhalf[\s-]?time show\b/.test(normalizedExpectedContext)) {
    if (/\b(?:full|complete|entire)\b/i.test(candidate.title)) score += 28;
    if (candidate.durationSeconds >= 8 * 60) score += 22;
    if (candidate.durationSeconds > 0 && candidate.durationSeconds < 5 * 60) score -= 28;
  }
  if (candidate.durationSeconds > 0 && candidate.durationSeconds < 45) score -= 18;
  return score;
}

export function rankBoardWizardVideoCandidates(
  card: BoardWizardVideoCardInput,
  boardContext: string,
  candidates: BoardWizardVideoCandidate[],
  options: { allowRelated?: boolean; limit?: number } = {},
): Array<{ candidate: BoardWizardVideoCandidate; score: number }> {
  const limit = Math.max(1, Math.min(20, Math.trunc(options.limit ?? 8)));
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreBoardWizardVideoCandidate(card, boardContext, candidate, {
        allowRelated: options.allowRelated,
      }),
    }))
    .filter((entry) => entry.score >= 55)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function parseIso8601DurationSeconds(value: unknown): number {
  const match = typeof value === 'string'
    ? value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
    : null;
  if (!match) return 0;
  return Number(match[1] ?? 0) * 86_400
    + Number(match[2] ?? 0) * 3_600
    + Number(match[3] ?? 0) * 60
    + Number(match[4] ?? 0);
}

function cleanSearchText(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return Array.from(new Set(normalizeText(value).split(' ')
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))));
}
