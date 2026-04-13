import { randomUUID } from 'node:crypto';
import { SUPPORTED_FILE_TYPES, type ExtractBlock, type SupportedFileType } from './types';

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
  const trimmed = value.trim();
  const withoutCodeFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');

  return JSON.parse(withoutCodeFence) as T;
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

export function compact<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => value != null);
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}
