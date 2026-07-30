export type BoardTranslationLanguage = 'en' | 'fr' | 'ja';

export interface BoardTranslationSegment {
  key: string;
  text: string;
}

export interface BoardTranslationResult {
  boardId: string;
  targetLanguage: BoardTranslationLanguage;
  sourceLanguage: BoardTranslationLanguage;
  fingerprint: string;
  segments: BoardTranslationSegment[];
  cached: boolean;
  changed: boolean;
}

export const BOARD_TRANSLATION_LANGUAGES: ReadonlyArray<{
  id: BoardTranslationLanguage;
  label: string;
  shortLabel: string;
}> = [
  { id: 'en', label: $localize`English`, shortLabel: 'EN' },
  { id: 'fr', label: $localize`Français`, shortLabel: 'FR' },
  { id: 'ja', label: $localize`日本語`, shortLabel: '日本語' },
];

export function isBoardTranslationLanguage(value: unknown): value is BoardTranslationLanguage {
  return value === 'en' || value === 'fr' || value === 'ja';
}

export function normalizeBoardTranslationResult(value: unknown): BoardTranslationResult | null {
  const record = objectRecord(value);
  const boardId = stringValue(record['boardId']).slice(0, 128);
  const targetLanguage = record['targetLanguage'];
  const sourceLanguage = record['sourceLanguage'];
  const fingerprint = stringValue(record['fingerprint']).slice(0, 128);
  if (!boardId
    || !isBoardTranslationLanguage(targetLanguage)
    || !isBoardTranslationLanguage(sourceLanguage)
    || !fingerprint) {
    return null;
  }

  const segments = Array.isArray(record['segments'])
    ? record['segments'].flatMap((value) => {
        const segment = objectRecord(value);
        const key = stringValue(segment['key']).slice(0, 180);
        const text = stringValue(segment['text']).slice(0, 16_000);
        return validTranslationPath(key) && text ? [{ key, text }] : [];
      })
    : [];

  return {
    boardId,
    targetLanguage,
    sourceLanguage,
    fingerprint,
    segments,
    cached: record['cached'] === true,
    changed: record['changed'] === true,
  };
}

export function applyBoardTranslation<T>(board: T, segments: readonly BoardTranslationSegment[]): T {
  const translated = cloneValue(board) as T;
  for (const segment of segments) {
    if (!validTranslationPath(segment.key) || !segment.text) {
      continue;
    }
    setExistingStringPath(translated, segment.key.split('.'), segment.text);
  }
  return translated;
}

export function boardTranslationLanguageName(language: BoardTranslationLanguage): string {
  return BOARD_TRANSLATION_LANGUAGES.find((option) => option.id === language)?.label ?? 'English';
}

function validTranslationPath(path: string): boolean {
  return /^(?:board\.(?:title|description|backNote|stackCtaLabel|tourMeta\.(?:paceOrRouteStyle|extras\.\d+)|learningQuiz\.(?:title|description|questions\.\d+\.(?:sourceCardTitle|prompt|explanation|options\.\d+\.text)))|cards\.\d+\.(?:title|subtitle|notes|shortSummary|availability|productCategory|tags\.\d+|tour\.(?:guideScript|legToNext\.(?:instruction|navScript))))$/u.test(path);
}

function setExistingStringPath(value: unknown, rawPath: string[], text: string): void {
  const path = rawPath[0] === 'board' ? rawPath.slice(1) : rawPath;
  let target: unknown = value;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (Array.isArray(target)) {
      const arrayIndex = Number(key);
      if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex >= target.length) {
        return;
      }
      target = target[arrayIndex];
    } else if (target && typeof target === 'object' && Object.hasOwn(target, key)) {
      target = (target as Record<string, unknown>)[key];
    } else {
      return;
    }
  }

  const finalKey = path[path.length - 1];
  if (Array.isArray(target)) {
    const arrayIndex = Number(finalKey);
    if (Number.isInteger(arrayIndex)
      && arrayIndex >= 0
      && arrayIndex < target.length
      && typeof target[arrayIndex] === 'string') {
      target[arrayIndex] = text;
    }
  } else if (target && typeof target === 'object') {
    const record = target as Record<string, unknown>;
    if (typeof record[finalKey] === 'string') {
      record[finalKey] = text;
    }
  }
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
    ) as T;
  }
  return value;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
