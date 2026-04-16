import { randomUUID } from 'node:crypto';
import { SUPPORTED_FILE_TYPES, type ExtractBlock, type SupportedFileType } from './types';

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'how',
  'if',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'there',
  'these',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'your',
]);

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function topicDocumentId(userId: string, topicName: string): string {
  return `${userId}__${slugify(topicName) || 'untitled-topic'}`;
}

export function extractDocumentIdFromPath(storagePath: string): string | null {
  const match = storagePath.match(/^users\/[^/]+\/documents\/([^/]+)\//);
  return match?.[1] ?? null;
}

export function normalizeTopicName(topic: string): string {
  return topic
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function normalizeRelatedTopics(topics: string[]): string[] {
  return Array.from(
    new Set(
      topics
        .map((topic) => normalizeTopicName(topic))
        .filter((topic) => topic.length > 0),
    ),
  );
}

export function detectFileType(filename: string, mimeType?: string | null): SupportedFileType {
  const lower = filename.toLowerCase();
  const extension = lower.split('.').pop()?.trim() ?? '';

  if (SUPPORTED_FILE_TYPES.includes(extension as SupportedFileType)) {
    return extension as SupportedFileType;
  }

  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (mimeType?.startsWith('text/')) {
    return 'txt';
  }

  throw new Error(`Unsupported file type for "${filename}".`);
}

export function buildStoragePath(
  userId: string,
  documentId: string,
  filename: string,
): string {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `users/${userId}/documents/${documentId}/${safeFilename}`;
}

export function makeExtractId(
  documentId: string,
  page: number,
  lineStart: number,
  lineEnd: number,
): string {
  return `${documentId}__${page}_${lineStart}_${lineEnd}`;
}

export function chunkExtractBlocks(
  blocks: ExtractBlock[],
  maxBlocks = 80,
  maxCharacters = 48000,
): ExtractBlock[][] {
  const chunks: ExtractBlock[][] = [];
  let current: ExtractBlock[] = [];
  let currentCharacters = 0;

  for (const block of blocks) {
    const blockSize = block.text.length;
    const wouldOverflow =
      current.length >= maxBlocks || currentCharacters + blockSize > maxCharacters;

    if (wouldOverflow && current.length > 0) {
      chunks.push(current);
      current = [];
      currentCharacters = 0;
    }

    current.push(block);
    currentCharacters += blockSize;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export function filterRedundantExtractBlocks(
  blocks: ExtractBlock[],
  repeatedThreshold = 3,
): ExtractBlock[] {
  const counts = new Map<string, number>();

  for (const block of blocks) {
    const fingerprint = fingerprintPotentialBoilerplate(block.text);
    if (!fingerprint) {
      continue;
    }
    counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
  }

  return blocks.filter((block) => {
    const fingerprint = fingerprintPotentialBoilerplate(block.text);
    if (!fingerprint) {
      return true;
    }
    return (counts.get(fingerprint) ?? 0) < repeatedThreshold;
  });
}

export function groupLinesIntoBlocks(
  lines: string[],
  page: number,
  maxLinesPerBlock = 8,
  maxCharsPerBlock = 1200,
): ExtractBlock[] {
  const filteredLines = lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const blocks: ExtractBlock[] = [];
  let blockLines: string[] = [];
  let blockStart = 1;
  let cursor = 1;

  for (const line of filteredLines) {
    const projectedText = [...blockLines, line].join('\n');
    const shouldFlush =
      blockLines.length >= maxLinesPerBlock || projectedText.length > maxCharsPerBlock;

    if (shouldFlush && blockLines.length > 0) {
      blocks.push({
        page,
        lineStart: blockStart,
        lineEnd: cursor - 1,
        text: blockLines.join('\n'),
      });
      blockLines = [];
      blockStart = cursor;
    }

    blockLines.push(line);
    cursor += 1;
  }

  if (blockLines.length > 0) {
    blocks.push({
      page,
      lineStart: blockStart,
      lineEnd: cursor - 1,
      text: blockLines.join('\n'),
    });
  }

  if (blocks.length === 0) {
    blocks.push({
      page,
      lineStart: 1,
      lineEnd: 1,
      text: 'No extractable text found.',
    });
  }

  return blocks;
}

export function parseJsonResponse<T>(value: string): T {
  const normalized = normalizeJsonCandidate(value);

  try {
    return JSON.parse(normalized) as T;
  } catch {
    const repaired = repairCommonJsonIssues(normalized);
    return JSON.parse(repaired) as T;
  }
}

function normalizeJsonCandidate(value: string): string {
  const trimmed = value.trim();
  const withoutCodeFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');

  const firstObject = withoutCodeFence.indexOf('{');
  const firstArray = withoutCodeFence.indexOf('[');
  const start =
    firstObject === -1
      ? firstArray
      : firstArray === -1
        ? firstObject
        : Math.min(firstObject, firstArray);

  if (start === -1) {
    return withoutCodeFence;
  }

  const lastObject = withoutCodeFence.lastIndexOf('}');
  const lastArray = withoutCodeFence.lastIndexOf(']');
  const end = Math.max(lastObject, lastArray);

  return end >= start ? withoutCodeFence.slice(start, end + 1) : withoutCodeFence.slice(start);
}

function repairCommonJsonIssues(value: string): string {
  // Replace single-quoted strings with double-quoted strings (outside existing double-quoted strings)
  let repaired = '';
  let inString = false;
  let stringChar = '';
  let escaped = false;
  let objectDepth = 0;
  let arrayDepth = 0;

  for (let i = 0; i < value.length; i++) {
    const character = value[i];

    if (escaped) {
      repaired += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      repaired += character;
      escaped = true;
      continue;
    }

    if (!inString) {
      if (character === '"' || character === "'") {
        inString = true;
        stringChar = character;
        repaired += '"';
        continue;
      }

      if (character === '{') {
        objectDepth += 1;
      } else if (character === '}') {
        objectDepth = Math.max(0, objectDepth - 1);
      } else if (character === '[') {
        arrayDepth += 1;
      } else if (character === ']') {
        arrayDepth = Math.max(0, arrayDepth - 1);
      }

      repaired += character;
      continue;
    }

    // Inside a string
    if (character === stringChar) {
      inString = false;
      stringChar = '';
      repaired += '"';
      continue;
    }

    if (character === '\n') {
      repaired += '\\n';
      continue;
    }
    if (character === '\r') {
      continue;
    }
    if (character === '\t') {
      repaired += '\\t';
      continue;
    }
    // Escape unescaped double quotes inside single-quoted strings
    if (character === '"' && stringChar === "'") {
      repaired += '\\"';
      continue;
    }
    repaired += character;
  }

  if (inString) {
    repaired += '"';
  }

  repaired += ']'.repeat(arrayDepth);
  repaired += '}'.repeat(objectDepth);

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,\s*([\]}])/g, '$1');

  return repaired;
}

export function textFromClaudeContent(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();
}

export function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function tokenizeText(value: string): string[] {
  return dedupeStrings(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token)),
  );
}

export function normalizeTextFingerprint(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\d+\b/g, '#')
    .replace(/[^a-z0-9#\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function selectDiverseStrings(
  values: string[],
  options: { limit?: number; maxChars?: number } = {},
): string[] {
  const unique = dedupeStrings(values.map((value) => value.trim()).filter(Boolean));
  if (unique.length <= 1) {
    return unique;
  }

  const limit = Math.max(1, options.limit ?? 24);
  const maxChars = Math.max(400, options.maxChars ?? 5000);
  const selected: string[] = [];
  const coveredTokens = new Set<string>();
  const remaining = unique.map((value) => ({
    value,
    tokens: tokenizeText(value),
  }));
  let totalChars = 0;

  while (remaining.length > 0 && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const novelty = candidate.tokens.filter((token) => !coveredTokens.has(token)).length;
      const score = novelty * 4 + Math.min(candidate.value.length, 240) / 80 - candidate.tokens.length * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const [candidate] = remaining.splice(bestIndex, 1);
    if (selected.length > 0 && totalChars + candidate.value.length > maxChars) {
      continue;
    }

    selected.push(candidate.value);
    totalChars += candidate.value.length;
    candidate.tokens.forEach((token) => coveredTokens.add(token));
  }

  return selected.length > 0 ? selected : unique.slice(0, limit);
}

export function buildTopicSearchText(params: {
  topicName: string;
  summary?: string | null;
  claims?: string[];
  relatedTopics?: string[];
  maxChars?: number;
}): string {
  const parts = dedupeStrings([
    params.topicName,
    params.summary ?? '',
    ...(params.relatedTopics ?? []),
    ...selectDiverseStrings(params.claims ?? [], {
      limit: 18,
      maxChars: Math.max(1200, Math.floor((params.maxChars ?? 6000) * 0.7)),
    }),
  ]);

  return parts.join('\n').slice(0, params.maxChars ?? 6000);
}

export function compact<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => value != null);
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function fingerprintPotentialBoilerplate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 6 || trimmed.length > 220) {
    return null;
  }

  const fingerprint = normalizeTextFingerprint(trimmed);
  return fingerprint.length >= 6 ? fingerprint : null;
}
