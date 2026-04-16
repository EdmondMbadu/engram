import { GoogleGenAI } from '@google/genai';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import type { ExtractBlock, KnowledgeEntryDraft, ModelUsage } from './types';
import {
  normalizeRelatedTopics,
  normalizeTopicName,
  parseJsonResponse,
} from './utils';

export const geminiApiKey = defineSecret('GEMINI_API_KEY');

const model = 'gemini-3-flash-preview';

const knowledgeEntrySchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      claim: { type: 'string' },
      topic: { type: 'string' },
      related_topics: {
        type: 'array',
        items: { type: 'string' },
      },
      source: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          line_start: { type: 'integer' },
          line_end: { type: 'integer' },
        },
        required: ['page', 'line_start', 'line_end'],
      },
    },
    required: ['claim', 'topic', 'related_topics', 'source'],
  },
} as const;

const answerSchema = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    cited_entry_ids: {
      type: 'array',
      items: { type: 'string' },
    },
    knowledge_gap: { type: 'boolean' },
  },
  required: ['answer', 'cited_entry_ids', 'knowledge_gap'],
} as const;

const lineArraySchema = {
  type: 'array',
  items: { type: 'string' },
} as const;

const maxAttempts = 3;

function createClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: geminiApiKey.value(),
  });
}

async function generateContentWithRetry(
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
) {
  const ai = createClient();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await ai.models.generateContent(params);
    } catch (error) {
      const normalized = normalizeGeminiError(error);
      if (!normalized.retryable || attempt === maxAttempts) {
        throw new Error(normalized.message);
      }

      await sleep(400 * attempt * attempt);
    }
  }

  throw new Error('Gemini request failed after repeated attempts.');
}

function normalizeGeminiError(error: unknown): { message: string; retryable: boolean } {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('prepayment credits are depleted')) {
    return {
      message:
        'Gemini credits are depleted for this project. Add billing or wait for quota recovery, then re-upload or re-index the document.',
      retryable: false,
    };
  }

  if (
    normalizedMessage.includes('resource_exhausted') ||
    normalizedMessage.includes('"code":429') ||
    normalizedMessage.includes('rate limit')
  ) {
    return {
      message: 'Gemini rate limit reached while processing this document. Please retry shortly.',
      retryable: true,
    };
  }

  if (
    normalizedMessage.includes('"code":500') ||
    normalizedMessage.includes('"code":503') ||
    normalizedMessage.includes('unavailable') ||
    normalizedMessage.includes('deadline')
  ) {
    return {
      message: 'Gemini was temporarily unavailable while processing this document.',
      retryable: true,
    };
  }

  return {
    message,
    retryable: false,
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function usageFromResponse(response: {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}): ModelUsage {
  const promptTokens = Number(response.usageMetadata?.promptTokenCount ?? 0);
  const outputTokens = Number(response.usageMetadata?.candidatesTokenCount ?? 0);
  const totalTokens = Number(response.usageMetadata?.totalTokenCount ?? promptTokens + outputTokens);

  return {
    model,
    prompt_tokens: promptTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    call_count: 1,
  };
}

function emptyUsage(): ModelUsage {
  return {
    model,
    prompt_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    call_count: 0,
  };
}

export async function compileKnowledgeEntries(
  blocks: ExtractBlock[],
): Promise<{ entries: KnowledgeEntryDraft[]; usage: ModelUsage }> {
  if (blocks.length === 0) {
    return { entries: [], usage: emptyUsage() };
  }

  const serializedBlocks = JSON.stringify(
    blocks.map((block) => [block.page, block.lineStart, block.lineEnd, block.text] as const),
  );
  const prompt = [
    'Compile durable retrieval-worthy knowledge from the provided excerpt blocks.',
    'Input block format: [page, line_start, line_end, text].',
    'Keep only stable facts, definitions, mechanisms, decisions, constraints, and non-obvious relationships.',
    'Ignore boilerplate, navigation text, rhetorical setup, repeated restatements, and examples without lasting value.',
    'Prefer 0-2 dense entries per block. Merge nearby overlaps instead of producing variants.',
    'Each claim must be a compact rewrite in at most 2 sentences.',
    'Keep topic names short and canonical. Keep related_topics sparse.',
    'Copy source page/line_start/line_end exactly from one input block.',
    'Return only valid JSON matching the schema.',
    '',
    serializedBlocks,
  ].join('\n');

  const response = await generateContentWithRetry({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: knowledgeEntrySchema,
      temperature: 0,
      maxOutputTokens: Math.min(3072, Math.max(768, blocks.length * 36)),
    },
  });

  let parsed: KnowledgeEntryDraft[];
  try {
    parsed = parseJsonResponse<KnowledgeEntryDraft[]>(response.text ?? '[]');
  } catch (error) {
    logger.warn('compileKnowledgeEntries: JSON parse failed, skipping chunk', {
      error: error instanceof Error ? error.message : String(error),
      responsePreview: (response.text ?? '').slice(0, 200),
    });
    return { entries: [], usage: usageFromResponse(response) };
  }

  if (!Array.isArray(parsed)) {
    logger.warn('compileKnowledgeEntries: response was not an array, skipping chunk');
    return { entries: [], usage: usageFromResponse(response) };
  }

  return {
    entries: parsed
      .filter(
        (entry): entry is KnowledgeEntryDraft =>
          entry != null && typeof entry === 'object' && typeof entry.claim === 'string',
      )
      .map((entry) => ({
        claim: entry.claim.trim(),
        topic: normalizeTopicName(entry.topic),
        related_topics: normalizeRelatedTopics(entry.related_topics ?? []),
        source: {
          page: Number(entry.source?.page ?? 0),
          line_start: Number(entry.source?.line_start ?? 0),
          line_end: Number(entry.source?.line_end ?? 0),
        },
      }))
      .filter(
        (entry) =>
          entry.claim.length > 0 &&
          entry.topic.length > 0 &&
          Number.isFinite(entry.source.page) &&
          Number.isFinite(entry.source.line_start) &&
          Number.isFinite(entry.source.line_end),
      ),
    usage: usageFromResponse(response),
  };
}

export async function summarizeTopic(
  topicName: string,
  claims: string[],
): Promise<{ summary: string; usage: ModelUsage }> {
  if (claims.length === 0) {
    return { summary: '', usage: emptyUsage() };
  }

  const prompt = [
    `Summarize the topic "${topicName}" for a personal wiki.`,
    'Use only the supplied claims.',
    'Write exactly 2 short dense paragraphs.',
    'Merge overlaps, preserve nuance, and mention meaningful tensions if the claims disagree.',
    'Do not include bullets or markdown.',
    '',
    JSON.stringify(claims),
  ].join('\n');

  const response = await generateContentWithRetry({
    model,
    contents: prompt,
    config: {
      temperature: 0.1,
      maxOutputTokens: 384,
    },
  });

  return {
    summary: (response.text ?? '').trim(),
    usage: usageFromResponse(response),
  };
}

export async function answerQuestion(params: {
  question: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  entries: Array<{
    id: string;
    claim: string;
    topic: string;
    source: { page: number; line_start: number; line_end: number };
  }>;
}): Promise<{ answer: string; cited_entry_ids: string[]; knowledge_gap: boolean }> {
  const hasHistory = (params.history ?? []).length > 0;
  const broadQuestion = isBroadSynthesisQuestion(params.question) || hasHistory;
  const serializedHistory = JSON.stringify(
    (params.history ?? []).slice(-6).map((message) => [message.role, message.text.slice(0, 4000)] as const),
  );
  const serializedEntries = JSON.stringify(
    params.entries.map((entry) => [
      entry.id,
      entry.topic,
      entry.claim,
      entry.source.page,
      entry.source.line_start,
      entry.source.line_end,
    ] as const),
  );
  const baseInstructions = [
    'You are answering a question against a curated personal knowledge base.',
    'Use only the provided knowledge entries.',
    'Entry format: [id, topic, claim, page, line_start, line_end].',
    'Treat the recent conversation history as real context: resolve references (it, that, they), understand follow-ups, and avoid repeating themes, topics, or points already given in prior assistant turns unless the user asks for them again.',
    'When the user asks for "other", "more", "additional", or "any else" items, introduce genuinely new themes/topics not already covered in prior assistant turns.',
    'Do not invent context that is not supported by the provided history and entries.',
    'Give a useful, concrete answer with enough detail to be meaningful.',
    'If the evidence is incomplete or weak, say so clearly and set knowledge_gap to true.',
    'Prefer citing multiple strong supporting entry ids when the evidence allows it.',
    'Only cite entry ids that are present in the provided entries.',
    'Return only valid JSON matching the schema.',
  ];
  const styleInstructions = broadQuestion
    ? [
        'This is a synthesis or exploration question.',
        'Give a substantive answer: either 2-4 solid paragraphs or a list of 4-8 concrete themes/topics when a list improves clarity.',
        'For each theme or topic, explain it briefly instead of naming it only.',
      ]
    : [
        'For direct questions, answer in 1-3 compact paragraphs unless a short list is clearly better.',
      ];
  const prompt = [
    ...baseInstructions,
    ...styleInstructions,
    '',
    JSON.stringify({ question: params.question, history: params.history?.length ? 'provided' : 'empty' }),
    serializedHistory,
    serializedEntries,
  ].join('\n');

  try {
    const response = await generateContentWithRetry({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: answerSchema,
        temperature: 0.1,
        maxOutputTokens: broadQuestion ? 4096 : 2048,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const parsed = normalizeAnswerResponse(parseJsonResponse<unknown>(response.text ?? '{}'), response.text ?? '');
    if (!answerLooksTooThin(parsed.answer, params.question, params.entries.length)) {
      return parsed;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const looksLikeJsonParseFailure =
      message.includes('JSON') ||
      message.includes('Unexpected token') ||
      message.includes('Unterminated string');

    if (!looksLikeJsonParseFailure) {
      const parsedMessage = message.trim();
      if (!parsedMessage) {
        throw error;
      }
    }
  }

  const retryPrompt = [
    ...baseInstructions,
    ...styleInstructions,
    'Important: the answer field must be a complete plain-text answer, not a fragment.',
    'If the question asks for themes, topics, patterns, or areas to explore, include several distinct items with explanation.',
    'Escape internal quotes. Use \\n for line breaks.',
    'Do not output markdown fences. Do not output any prose outside the JSON object.',
    '',
    JSON.stringify({ question: params.question, history: params.history?.length ? 'provided' : 'empty' }),
    serializedHistory,
    serializedEntries,
  ].join('\n');

  const retryResponse = await generateContentWithRetry({
    model,
    contents: retryPrompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: answerSchema,
      temperature: 0,
      maxOutputTokens: broadQuestion ? 4096 : 2048,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  return normalizeAnswerResponse(parseJsonResponse<unknown>(retryResponse.text ?? '{}'), retryResponse.text ?? '');
}

export async function transcribeImageToLines(params: {
  mediaType: 'image/png' | 'image/jpeg';
  base64: string;
}): Promise<string[]> {
  const response = await generateContentWithRetry({
    model,
    contents: [
      {
        inlineData: {
          mimeType: params.mediaType,
          data: params.base64,
        },
      },
      {
        text: 'Transcribe all legible text from this image in reading order. Return a JSON array of plain text lines only. Do not summarize.',
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: lineArraySchema,
      temperature: 0,
    },
  });

  let parsed: string[];
  try {
    parsed = parseJsonResponse<string[]>(response.text ?? '[]');
  } catch (error) {
    logger.warn('transcribeImageToLines: JSON parse failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((line): line is string => typeof line === 'string')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeAnswerResponse(
  parsed: unknown,
  fallbackText: string,
): { answer: string; cited_entry_ids: string[]; knowledge_gap: boolean } {
  const value = (parsed && typeof parsed === 'object' ? parsed : {}) as {
    answer?: unknown;
    cited_entry_ids?: unknown;
    knowledge_gap?: unknown;
  };

  const answer =
    typeof value.answer === 'string' && value.answer.trim().length > 0
      ? value.answer.trim()
      : extractFallbackAnswerText(fallbackText);

  return {
    answer,
    cited_entry_ids: Array.isArray(value.cited_entry_ids)
      ? value.cited_entry_ids.map((entryId) => String(entryId).trim()).filter(Boolean)
      : [],
    knowledge_gap:
      typeof value.knowledge_gap === 'boolean'
        ? value.knowledge_gap
        : answer.length === 0,
  };
}

function extractFallbackAnswerText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'I could not safely parse the model response for this question.';
  }

  const withoutCodeFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const firstBrace = withoutCodeFence.indexOf('{');
  if (firstBrace === -1) {
    return withoutCodeFence.slice(0, 4000);
  }

  return withoutCodeFence
    .slice(0, firstBrace)
    .trim() || 'I could not safely parse the model response for this question.';
}

function isBroadSynthesisQuestion(question: string): boolean {
  const value = question.toLowerCase();
  return [
    'summarize',
    'summary',
    'themes',
    'theme',
    'patterns',
    'strongest',
    'overview',
    'interesting',
    'explore',
    'what are they',
    'what else',
    'topics',
    'across my sources',
  ].some((pattern) => value.includes(pattern));
}

function answerLooksTooThin(answer: string, question: string, entryCount: number): boolean {
  const trimmed = answer.trim();
  if (!trimmed) {
    return true;
  }

  const broadQuestion = isBroadSynthesisQuestion(question);
  const lineCount = trimmed.split(/\n+/).filter(Boolean).length;
  const sentenceCount = trimmed.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length;

  if (broadQuestion) {
    return trimmed.length < 220 || sentenceCount < 3 || (lineCount < 3 && entryCount >= 10);
  }

  return trimmed.length < 90 && entryCount >= 8;
}
