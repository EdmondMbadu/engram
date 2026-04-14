import { GoogleGenAI } from '@google/genai';
import { defineSecret } from 'firebase-functions/params';
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

  const parsed = parseJsonResponse<KnowledgeEntryDraft[]>(response.text ?? '[]');
  return {
    entries: parsed
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
  entries: Array<{
    id: string;
    claim: string;
    topic: string;
    source: { page: number; line_start: number; line_end: number };
  }>;
}): Promise<{ answer: string; cited_entry_ids: string[]; knowledge_gap: boolean }> {
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
  const prompt = [
    'Answer the question using only the provided knowledge entries.',
    'Entry format: [id, topic, claim, page, line_start, line_end].',
    'Keep the answer high-signal and concise.',
    'Use a short list only when it improves clarity; otherwise prefer brief paragraphs.',
    'If the evidence is incomplete or weak, say so clearly and set knowledge_gap to true.',
    'Only cite entry ids that are present in the provided entries.',
    'Return only valid JSON matching the schema.',
    '',
    JSON.stringify({ question: params.question }),
    serializedEntries,
  ].join('\n');

  const response = await generateContentWithRetry({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: answerSchema,
      temperature: 0.1,
      maxOutputTokens: 640,
    },
  });

  return parseJsonResponse<{
    answer: string;
    cited_entry_ids: string[];
    knowledge_gap: boolean;
  }>(response.text ?? '{}');
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

  const parsed = parseJsonResponse<string[]>(response.text ?? '[]');
  return parsed.map((line) => line.trim()).filter((line) => line.length > 0);
}
