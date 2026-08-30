import { createHash } from 'node:crypto';

export type BoardTranslationLanguage = 'en' | 'fr' | 'ja';

export interface BoardTranslationSegment {
  key: string;
  text: string;
}

export interface BoardTranslationSource {
  segments: BoardTranslationSegment[];
  fingerprint: string;
  sourceLanguage: BoardTranslationLanguage;
  sourceCharacters: number;
}

const maximumBoardTranslationCharacters = 100_000;
const maximumBoardTranslationCards = 250;
const maximumFieldCharacters = 8_000;

export function isBoardTranslationLanguage(value: unknown): value is BoardTranslationLanguage {
  return value === 'en' || value === 'fr' || value === 'ja';
}

export function extractBoardTranslationSource(value: unknown): BoardTranslationSource {
  const board = recordOrEmpty(value);
  const segments: BoardTranslationSegment[] = [];

  addSegment(segments, 'board.title', board['title']);
  addSegment(segments, 'board.description', board['description']);
  addSegment(segments, 'board.backNote', board['backNote']);
  addSegment(segments, 'board.stackCtaLabel', board['stackCtaLabel']);

  const tourMeta = recordOrEmpty(board['tourMeta']);
  addSegment(segments, 'board.tourMeta.paceOrRouteStyle', tourMeta['paceOrRouteStyle']);
  arrayOrEmpty(tourMeta['extras']).forEach((extra, index) => {
    addSegment(segments, `board.tourMeta.extras.${index}`, extra);
  });

  arrayOrEmpty(board['cards']).slice(0, maximumBoardTranslationCards).forEach((value, index) => {
    const card = recordOrEmpty(value);
    const prefix = `cards.${index}`;
    addSegment(segments, `${prefix}.title`, card['title']);
    addSegment(segments, `${prefix}.subtitle`, card['subtitle']);
    addSegment(segments, `${prefix}.notes`, card['notes']);
    addSegment(segments, `${prefix}.shortSummary`, card['shortSummary']);
    addSegment(segments, `${prefix}.availability`, card['availability']);
    addSegment(segments, `${prefix}.productCategory`, card['productCategory']);
    addSegment(segments, `${prefix}.conversation.openingMessage`, recordOrEmpty(card['conversation'])['openingMessage']);
    arrayOrEmpty(card['tags']).forEach((tag, tagIndex) => {
      addSegment(segments, `${prefix}.tags.${tagIndex}`, tag);
    });

    const tour = recordOrEmpty(card['tour']);
    addSegment(segments, `${prefix}.tour.guideScript`, tour['guideScript']);
    const leg = recordOrEmpty(tour['legToNext']);
    addSegment(segments, `${prefix}.tour.legToNext.instruction`, leg['instruction']);
    addSegment(segments, `${prefix}.tour.legToNext.navScript`, leg['navScript']);
  });

  const quiz = recordOrEmpty(board['learningQuiz']);
  addSegment(segments, 'board.learningQuiz.title', quiz['title']);
  addSegment(segments, 'board.learningQuiz.description', quiz['description']);
  arrayOrEmpty(quiz['questions']).forEach((value, questionIndex) => {
    const question = recordOrEmpty(value);
    const prefix = `board.learningQuiz.questions.${questionIndex}`;
    addSegment(segments, `${prefix}.sourceCardTitle`, question['sourceCardTitle']);
    addSegment(segments, `${prefix}.prompt`, question['prompt']);
    addSegment(segments, `${prefix}.explanation`, question['explanation']);
    arrayOrEmpty(question['options']).forEach((optionValue, optionIndex) => {
      addSegment(
        segments,
        `${prefix}.options.${optionIndex}.text`,
        recordOrEmpty(optionValue)['text'],
      );
    });
  });

  const sourceCharacters = segments.reduce((total, segment) => total + segment.text.length, 0);
  if (sourceCharacters > maximumBoardTranslationCharacters) {
    throw new Error('This board has too much text to translate in one request.');
  }

  const fingerprint = createHash('sha256')
    .update(JSON.stringify(segments))
    .digest('hex');

  return {
    segments,
    fingerprint,
    sourceLanguage: detectBoardSourceLanguage(segments.map((segment) => segment.text).join('\n')),
    sourceCharacters,
  };
}

export function normalizeTranslatedBoardSegments(
  source: readonly BoardTranslationSegment[],
  translated: readonly BoardTranslationSegment[],
): BoardTranslationSegment[] {
  const sourceKeys = new Set(source.map((segment) => segment.key));
  const translations = new Map<string, string>();
  for (const segment of translated) {
    const key = typeof segment?.key === 'string' ? segment.key : '';
    const text = typeof segment?.text === 'string' ? segment.text.trim() : '';
    if (sourceKeys.has(key) && text) {
      translations.set(key, text.slice(0, maximumFieldCharacters * 2));
    }
  }
  return source.map((segment) => ({
    key: segment.key,
    text: translations.get(segment.key) ?? segment.text,
  }));
}

export function detectBoardSourceLanguage(text: string): BoardTranslationLanguage {
  if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(text)) {
    return 'ja';
  }

  const normalized = ` ${text.toLocaleLowerCase()} `;
  const frenchSignals = normalized.match(
    /(?:[àâçéèêëîïôùûüÿœæ]|\b(?:le|la|les|des|une|avec|pour|dans|sur|est|sont|et|du|au|aux|ce|cette|ces|vous|nous)\b)/gu,
  )?.length ?? 0;
  const wordCount = Math.max(1, normalized.split(/\s+/u).filter(Boolean).length);
  return frenchSignals >= 3 && frenchSignals / wordCount >= 0.025 ? 'fr' : 'en';
}

function addSegment(segments: BoardTranslationSegment[], key: string, value: unknown): void {
  if (typeof value !== 'string') {
    return;
  }
  const text = value.trim();
  if (!text) {
    return;
  }
  segments.push({ key, text: text.slice(0, maximumFieldCharacters) });
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
