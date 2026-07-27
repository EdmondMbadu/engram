import { normalizeWhat3WordsAddress } from './off-grid-location';

export type What3WordsSourceItem = {
  name: string;
  words: string;
  sourceLine: number;
};

export type What3WordsSourceIssue = {
  sourceLine: number;
  text: string;
  message: string;
};

export type What3WordsBoardSource = {
  title: string;
  items: What3WordsSourceItem[];
  issues: What3WordsSourceIssue[];
};

const WHAT3WORDS_URL =
  /https?:\/\/(?:www\.)?(?:what3words\.com|w3w\.co)\/[^\s<>()\]]+/giu;
const SLASHED_ADDRESS = /\/\/\/[^\s<>()\]}\u2014\u2013,;|]+/gu;
const MARKDOWN_LINK = /\[([^\]]*)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/giu;
const LIST_MARKER = /^\s*(?:[-*+•]\s+|\d{1,3}[.)]\s+)/u;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u;

/**
 * Parses copied tables and ordinary lists without asking a model to infer which
 * place belongs to which three-word address. Exact pairings are source data.
 */
export function parseWhat3WordsBoardSource(value: string): What3WordsBoardSource | null {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const items: What3WordsSourceItem[] = [];
  const issues: What3WordsSourceIssue[] = [];
  const seenWords = new Set<string>();
  let pendingName = '';
  let title = '';

  lines.forEach((rawLine, index) => {
    const sourceLine = index + 1;
    const line = rawLine.trim();
    if (!line || TABLE_DIVIDER.test(line)) {
      return;
    }
    if (isHeaderLine(line)) {
      return;
    }

    const words = extractWhat3WordsAddress(line);
    if (!words) {
      if (looksLikeBrokenWhat3WordsRow(line)) {
        issues.push({
          sourceLine,
          text: line,
          message: $localize`Use exactly three words separated by periods.`,
        });
        return;
      }
      const possibleName = cleanName(line);
      if (possibleName && possibleName.length <= 120) {
        pendingName = possibleName;
      }
      return;
    }

    const inlineName = nameWithoutWhat3Words(line, words);
    if (inlineName && pendingName && !items.length && !title) {
      title = pendingName;
    }
    const name = inlineName || pendingName;
    pendingName = '';
    if (seenWords.has(words)) {
      issues.push({
        sourceLine,
        text: line,
        message: `Duplicate address ///${words} was skipped.`,
      });
      return;
    }
    seenWords.add(words);
    items.push({
      name: name.slice(0, 80),
      words,
      sourceLine,
    });
  });

  if (!items.length) {
    return null;
  }
  return {
    title: isUsefulTitle(title) ? title : '',
    items,
    issues,
  };
}

export function extractWhat3WordsAddress(value: string): string {
  const exact = normalizeWhat3WordsAddress(value);
  if (exact) {
    return exact;
  }

  for (const markdownMatch of value.matchAll(MARKDOWN_LINK)) {
    const words = normalizeWhat3WordsAddress(markdownMatch[2]);
    if (words) {
      return words;
    }
    const labelWords = normalizeWhat3WordsAddress(markdownMatch[1]);
    if (labelWords) {
      return labelWords;
    }
  }
  for (const urlMatch of value.matchAll(WHAT3WORDS_URL)) {
    const words = normalizeWhat3WordsAddress(trimTrailingPunctuation(urlMatch[0]));
    if (words) {
      return words;
    }
  }
  for (const addressMatch of value.matchAll(SLASHED_ADDRESS)) {
    const words = normalizeWhat3WordsAddress(trimTrailingPunctuation(addressMatch[0]));
    if (words) {
      return words;
    }
  }

  const columns = value
    .replace(/^\s*\||\|\s*$/g, '')
    .split(/\t+|\s+\|\s+|\s+(?:—|–)\s+|\s{2,}/u)
    .map((column) => cleanName(column))
    .filter(Boolean);
  for (const column of columns) {
    const words = normalizeWhat3WordsAddress(column);
    if (words) {
      return words;
    }
  }
  return '';
}

function nameWithoutWhat3Words(value: string, words: string): string {
  let candidate = value
    .replace(MARKDOWN_LINK, (match, label: string, href: string) => {
      return normalizeWhat3WordsAddress(href) === words || normalizeWhat3WordsAddress(label) === words
        ? ''
        : match;
    })
    .replace(WHAT3WORDS_URL, (match) => normalizeWhat3WordsAddress(trimTrailingPunctuation(match)) === words ? '' : match)
    .replace(SLASHED_ADDRESS, (match) => normalizeWhat3WordsAddress(trimTrailingPunctuation(match)) === words ? '' : match);

  const columns = candidate
    .replace(/^\s*\||\|\s*$/g, '')
    .split(/\t+|\s+\|\s+|\s+(?:—|–)\s+|\s{2,}/u)
    .map((column) => {
      const cleaned = cleanName(column);
      return normalizeWhat3WordsAddress(cleaned) === words ? '' : cleaned;
    })
    .filter(Boolean);
  if (columns.length) {
    return columns[0];
  }

  candidate = candidate
    .replace(new RegExp(`\\/?\\/?\\/?${escapeRegExp(words)}`, 'iu'), '')
    .replace(/^[\s|:;,—–-]+|[\s|:;,—–-]+$/gu, '');
  return cleanName(candidate);
}

function cleanName(value: string): string {
  return value
    .replace(LIST_MARKER, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^[#>*_`~\s|:;,—–-]+|[*_`~\s|:;,—–-]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHeaderLine(value: string): boolean {
  const clean = cleanName(value.replace(/\*\*/g, '')).toLocaleLowerCase();
  return /\blocation\b/u.test(clean)
    && (/\bthree[\s-]*word(?:\s+address)?\b/u.test(clean) || /\bwhat3words\b/u.test(clean));
}

function isUsefulTitle(value: string): boolean {
  const lower = value.toLocaleLowerCase();
  return !!value
    && !(/\blocation\b/u.test(lower) && /\b(?:three[\s-]*word|what3words)\b/u.test(lower));
}

function looksLikeBrokenWhat3WordsRow(value: string): boolean {
  return /(?:\/\/\/|what3words\.com\/|w3w\.co\/)/iu.test(value);
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:!?'")\]}]+$/u, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
