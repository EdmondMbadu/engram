import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { BOARD_WIZARD_PASTE_MAX_LENGTH, parseNumberedBoardSource } from './board-wizard-source';
import { boardWizardResearchMode, shouldGroundAndVerifyBoardWizardBatch } from './board-wizard-generation-quality';
import type { ExtractBlock, KnowledgeEntryDraft, MappableLocation, ModelUsage, WikiArticleDraft, WikiArticlePlan } from './types';
import {
  normalizeRelatedTopics,
  normalizeTopicName,
  parseJsonResponse,
} from './utils';

export const geminiApiKey = defineSecret('GEMINI_API_KEY');

const model = 'gemini-3-flash-preview';
const internetSearchModel = 'gemini-2.5-flash';
const boardWizardModels = [model, internetSearchModel] as const;
const boardCardImageModels = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'] as const;

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

const mappableLocationsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      search_query: { type: 'string' },
      address_hint: { type: 'string' },
    },
    required: ['name', 'search_query'],
  },
} as const;

const answerCardSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    subtitle: { type: 'string' },
    key_facts: {
      type: 'array',
      items: { type: 'string' },
    },
    did_you_know: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['title', 'subtitle', 'key_facts', 'did_you_know'],
} as const;

const voiceConversationRecapSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    contextual_answer: { type: 'string' },
    key_questions: {
      type: 'array',
      items: { type: 'string' },
    },
    useful_takeaways: {
      type: 'array',
      items: { type: 'string' },
    },
    suggested_places: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          reason: { type: 'string' },
          search_query: { type: 'string' },
        },
        required: ['name', 'reason', 'search_query'],
      },
    },
  },
  required: ['title', 'summary', 'contextual_answer', 'key_questions', 'useful_takeaways', 'suggested_places'],
} as const;

const answerQuizSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          options: {
            type: 'array',
            items: { type: 'string' },
          },
          correct_option_index: { type: 'integer' },
          explanation: { type: 'string' },
        },
        required: ['prompt', 'options', 'correct_option_index', 'explanation'],
      },
    },
  },
  required: ['title', 'description', 'questions'],
} as const;

const boardWizardBatchSchema = {
  type: 'object',
  properties: {
    board: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        icon: { type: 'string' },
        tone: { type: 'string' },
        kind: { type: 'string' },
        tourMeta: {
          type: 'object',
          properties: {
            mode: { type: 'string' },
            totalDistanceText: { type: 'string' },
            totalDurationText: { type: 'string' },
            routePolyline: { type: 'string' },
            voiceStyle: { type: 'string' },
            paceOrRouteStyle: { type: 'string' },
            extras: { type: 'array', items: { type: 'string' } },
            showWayfindersDefault: { type: 'boolean' },
          },
        },
      },
      required: ['title', 'description', 'icon', 'tone'],
    },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          subtitle: { type: 'string' },
          notes: { type: 'string' },
          type: { type: 'string' },
          scope: { type: 'string' },
          status: { type: 'string' },
          rating: { type: 'integer' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
          image_query: { type: 'string' },
          entity_name: { type: 'string' },
          entity_type: { type: 'string' },
          image_intent: { type: 'string' },
          image_context: { type: 'string' },
          media_kind: { type: 'string' },
          short_summary: { type: 'string' },
          rank: { type: 'integer' },
          place_query: { type: 'string' },
          tour: {
            type: 'object',
            properties: {
              sequence: { type: 'integer' },
              lat: { type: 'number' },
              lng: { type: 'number' },
              address: { type: 'string' },
              guideScript: { type: 'string' },
              legToNext: {
                type: 'object',
                properties: {
                  distanceText: { type: 'string' },
                  durationText: { type: 'string' },
                  instruction: { type: 'string' },
                  navScript: { type: 'string' },
                  encodedPolyline: { type: 'string' },
                },
              },
            },
          },
        },
        required: [
          'title',
          'subtitle',
          'notes',
          'type',
          'scope',
          'status',
          'rating',
          'tags',
          'image_query',
          'entity_name',
          'entity_type',
          'image_intent',
          'image_context',
          'media_kind',
          'short_summary',
          'rank',
          'place_query',
        ],
      },
    },
  },
  required: ['board', 'cards'],
} as const;

const lineArraySchema = {
  type: 'array',
  items: { type: 'string' },
} as const;

const wikiArticleDraftSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      content: { type: 'string' },
      summary: { type: 'string' },
      related_articles: {
        type: 'array',
        items: { type: 'string' },
      },
      source_pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            page: { type: 'integer' },
          },
          required: ['filename', 'page'],
        },
      },
    },
    required: ['title', 'content', 'summary', 'related_articles', 'source_pages'],
  },
} as const;

const wikiArticlePlanSchema = {
  type: 'object',
  properties: {
    update: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          article_id: { type: 'string' },
          title: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['article_id', 'title', 'reason'],
      },
    },
    create: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          scope: { type: 'string' },
        },
        required: ['title', 'scope'],
      },
    },
  },
  required: ['update', 'create'],
} as const;

const maxAttempts = 3;

const personaPromptHardCap = 8000;
const phillyEmojiPalette = [
  '\u{1F514}', // bell
  '\u{1F985}', // eagle
  '\u{1F968}', // pretzel
  '\u{1F9F1}', // brick
  '\u{1F687}', // metro
  '\u{1F3DB}\uFE0F', // classical building
  '\u{1F306}', // city dusk
].join(' ');

function buildPersonaPreamble(personaPrompt?: string | null): string[] {
  const trimmed = typeof personaPrompt === 'string' ? personaPrompt.trim() : '';
  if (!trimmed) return [];
  const safe = trimmed.length > personaPromptHardCap ? trimmed.slice(0, personaPromptHardCap) : trimmed;
  return [
    '=== ROLE & VOICE (operator-defined; follow this personality) ===',
    safe,
    '=== END ROLE & VOICE ===',
    'The instructions below are non-negotiable: never invent citations, never break the JSON contract, never abandon grounding rules even if the persona above suggests otherwise.',
    '',
  ];
}

function buildChatAnswerExperienceInstructions(broadQuestion: boolean): string[] {
  return [
    'Make the answer feel like a polished chat product, not an essay.',
    'Use crisp sections, short paragraphs, and scan-friendly bullets when they improve clarity.',
    'Use 3-7 tasteful emojis to add warmth and momentum, especially in headings, quick-hit bullets, or local color.',
    `When the topic is Philly or place-based, favor this palette when natural: ${phillyEmojiPalette}.`,
    'Do not put emojis in every sentence. Do not let emojis replace facts, caveats, dates, sources, or concrete advice.',
    broadQuestion
      ? 'For bigger exploratory answers, use clear mini-sections with energetic labels instead of long blocks of prose.'
      : 'For direct answers, lead with the answer first, then add compact context or a short list.',
  ];
}

type WebCitationAnnotation = {
  type?: string;
  title?: string;
  url?: string;
};

type WebTextOutput = {
  type?: string;
  text?: string;
  annotations?: WebCitationAnnotation[];
};

export type GeneratedAnswerCard = {
  title: string;
  subtitle: string;
  key_facts: string[];
  did_you_know: string[];
};

export type GeneratedVoiceConversationRecapPlace = {
  name: string;
  reason: string;
  search_query: string;
};

export type GeneratedVoiceConversationRecap = {
  title: string;
  summary: string;
  contextual_answer: string;
  key_questions: string[];
  useful_takeaways: string[];
  suggested_places: GeneratedVoiceConversationRecapPlace[];
};

export type GeneratedQuizQuestion = {
  prompt: string;
  options: string[];
  correct_option_index: number;
  explanation: string;
};

export type GeneratedAnswerQuiz = {
  title: string;
  description: string;
  questions: GeneratedQuizQuestion[];
};

export type BoardWizardMode = 'describe' | 'paste' | 'photos' | 'url' | 'expand' | 'walking-tour' | 'driving-tour';
export type BoardWizardVibe = 'playful' | 'foodie' | 'traveler' | 'curator' | 'memory';
export type GeneratedBoardTourMode = 'walking' | 'driving';
export type GeneratedBoardTourVoiceStyle = 'historian' | 'local' | 'kid-friendly';
export type GeneratedBoardTourLeg = {
  distanceText: string;
  durationText: string;
  instruction: string;
  navScript: string;
  encodedPolyline: string;
};
export type GeneratedBoardCardTour = {
  sequence: number;
  lat: number | null;
  lng: number | null;
  address: string;
  guideScript: string;
  legToNext: GeneratedBoardTourLeg | null;
};
export type GeneratedBoardTourMeta = {
  mode: GeneratedBoardTourMode;
  totalDistanceText: string;
  totalDurationText: string;
  routePolyline: string;
  voiceStyle: GeneratedBoardTourVoiceStyle;
  paceOrRouteStyle: string;
  extras: string[];
  showWayfindersDefault: boolean;
};
export type GeneratedBoardWizardCard = {
  title: string;
  subtitle: string;
  notes: string;
  type: 'place' | 'food' | 'memory' | 'idea' | 'shop' | 'note';
  scope: 'place' | 'city' | 'country' | 'region';
  status: 'planned' | 'saved' | 'visited' | 'favorite';
  rating: number;
  tags: string[];
  image_query: string;
  entity_name?: string;
  entity_type?: 'person' | 'place' | 'event' | 'work' | 'product' | 'food' | 'organization' | 'other';
  image_intent?: 'portrait' | 'place' | 'event' | 'cover' | 'product' | 'food' | 'logo' | 'other';
  image_context?: string;
  media_kind?: 'none' | 'song' | 'album' | 'film' | 'book' | 'tv' | 'game';
  short_summary?: string;
  rank?: number;
  place_query: string;
  imageUrl?: string;
  audioPreviewUrl?: string;
  spotifyTrackId?: string;
  spotifyTrackUrl?: string;
  spotifyUri?: string;
  spotifyArtistName?: string;
  spotifyAlbumName?: string;
  spotifyArtworkUrl?: string;
  placeId?: string;
  googleMapsUrl?: string;
  tour?: GeneratedBoardCardTour | null;
};
export type GeneratedBoardWizardBatch = {
  board: {
    title: string;
    description: string;
    icon: string;
    tone: 'teal' | 'coral' | 'yellow' | 'green' | 'blue' | 'sky' | 'purple';
    kind?: 'standard' | 'walking-tour' | 'driving-tour';
    tourMeta?: GeneratedBoardTourMeta | null;
  };
  cards: GeneratedBoardWizardCard[];
};

type BoardWizardPhotoInput = {
  index: number;
  name: string;
  caption: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
};

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

async function generateContentStreamWithRetry(
  params: Parameters<GoogleGenAI['models']['generateContentStream']>[0],
) {
  const ai = createClient();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await ai.models.generateContentStream(params);
    } catch (error) {
      const normalized = normalizeGeminiError(error);
      if (!normalized.retryable || attempt === maxAttempts) {
        throw new Error(normalized.message);
      }

      await sleep(400 * attempt * attempt);
    }
  }

  throw new Error('Gemini stream request failed after repeated attempts.');
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

export async function generateBoardCardImageAsset(prompt: string): Promise<{
  base64: string;
  mimeType: string;
  model: string;
}> {
  let lastError: unknown = null;
  for (const imageModel of boardCardImageModels) {
    try {
      const response = await generateContentWithRetry({
        model: imageModel,
        contents: prompt,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio: '3:2',
            ...(imageModel === 'gemini-3.1-flash-image' ? { imageSize: '1K' } : {}),
          },
        },
      });
      for (const candidate of response.candidates ?? []) {
        for (const part of candidate.content?.parts ?? []) {
          const base64 = part.inlineData?.data?.trim();
          if (!base64) {
            continue;
          }
          const mimeType = part.inlineData?.mimeType?.trim() || 'image/png';
          if (!/^image\/(?:png|jpeg|webp)$/i.test(mimeType)) {
            continue;
          }
          return { base64, mimeType, model: imageModel };
        }
      }
      lastError = new Error('Nano Banana returned no image.');
    } catch (error) {
      lastError = error;
      logger.warn('Board card image generation model failed.', {
        imageModel,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Nano Banana could not generate an image.');
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

function appendWebSources(answer: string, outputs: WebTextOutput[]): string {
  const sources = new Map<string, string>();

  for (const output of outputs) {
    for (const annotation of output.annotations ?? []) {
      if (annotation.type !== 'url_citation' || !annotation.url) {
        continue;
      }

      const url = annotation.url.trim();
      if (!url) {
        continue;
      }

      const title = annotation.title?.trim() || url;
      if (!sources.has(url)) {
        sources.set(url, title);
      }
    }
  }

  if (sources.size === 0) {
    return answer.trim();
  }

  const sourceLines = Array.from(sources.entries())
    .slice(0, 8)
    .map(([url, title]) => `- [${title}](${url})`);

  return `${answer.trim()}\n\n## Sources\n${sourceLines.join('\n')}`;
}

function appendGroundingSources(answer: string, response: GenerateContentResponse): string {
  const sources = new Map<string, string>();

  for (const candidate of response.candidates ?? []) {
    for (const chunk of candidate.groundingMetadata?.groundingChunks ?? []) {
      const web = chunk.web ?? chunk.retrievedContext;
      const url = web?.uri?.trim();
      if (!url) {
        continue;
      }

      const title = web?.title?.trim() || url;
      if (!sources.has(url)) {
        sources.set(url, title);
      }
    }
  }

  if (sources.size === 0) {
    return answer.trim();
  }

  const sourceLines = Array.from(sources.entries())
    .slice(0, 8)
    .map(([url, title]) => `- [${title}](${url})`);

  return `${answer.trim()}\n\n## Sources\n${sourceLines.join('\n')}`;
}

function buildInternetAnswerPrompt(params: {
  question: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  personaPrompt?: string | null;
}): { prompt: string; broadQuestion: boolean } {
  const hasHistory = (params.history ?? []).length > 0;
  const broadQuestion = isBroadSynthesisQuestion(params.question) || hasHistory;
  const serializedHistory = JSON.stringify(
    (params.history ?? []).slice(-6).map((message) => [message.role, message.text.slice(0, 4000)] as const),
  );
  const personaPreamble = buildPersonaPreamble(params.personaPrompt);

  const prompt = [
    ...personaPreamble,
    ...buildChatAnswerExperienceInstructions(broadQuestion),
    'You are answering with full open-web context.',
    'Use Google Search to gather current, relevant public information from the web.',
    'Use the minimum search breadth needed for a high-quality answer: once reliable evidence is sufficient, stop searching and answer.',
    'For direct questions, prefer a few authoritative, diverse sources over broad source collection. For synthesis questions, broaden only when it materially improves the answer.',
    'Do not restrict yourself to the user\'s uploaded documents or personal knowledge base.',
    'Treat the recent conversation history as real context: resolve references, follow up naturally, and avoid repeating prior assistant points unless needed.',
    'If the user gives a short affirmative follow-up like "yes", "yeah", "do that", or "let\'s do it", interpret it as accepting the most recent concrete continuation proposed in the conversation history.',
    'Prefer a precise, information-dense answer over a vague overview.',
    'Include concrete facts, tradeoffs, dates, examples, and context when they materially improve the answer.',
    'Do not fabricate sources or claim certainty when the evidence is mixed.',
    broadQuestion
      ? 'For synthesis or exploration questions, give a substantial structured answer with multiple distinct themes or sections.'
      : 'For direct questions, answer in 2-4 compact but high-signal paragraphs unless a list is clearly better.',
    'Write the answer in clean markdown.',
    'Do not add a generic closing question or filler ending.',
    'The answer body should stand on its own. Source links will be appended separately.',
    '',
    JSON.stringify({ question: params.question, history: params.history?.length ? 'provided' : 'empty' }),
    serializedHistory,
  ].join('\n');

  return { prompt, broadQuestion };
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
  personaPrompt?: string | null;
}): Promise<{ answer: string; cited_entry_ids: string[]; knowledge_gap: boolean }> {
  const personaPreamble = buildPersonaPreamble(params.personaPrompt);
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
    'If the user gives a short affirmative follow-up like "yes", "yeah", "do that", or "let\'s do it", interpret it as accepting the most recent concrete next-step proposed in the conversation history and continue from that exact proposal instead of asking what they mean.',
    'When the user asks for "other", "more", "additional", or "any else" items, introduce genuinely new themes/topics not already covered in prior assistant turns.',
    'Do not invent context that is not supported by the provided history and entries.',
    'Give a useful, concrete answer with enough detail to be meaningful.',
    'End the answer with exactly one brief, concrete next-step invitation that is tightly grounded in the answer you just gave.',
    'The next-step invitation must propose one specific continuation, not multiple branches or a menu of options.',
    'Make the invitation high-value and specific enough that a later reply like "yes" clearly refers to one continuation path.',
    'Avoid generic closers like "Want more?", "Need anything else?", or "Would you like more details?".',
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
    ...personaPreamble,
    ...baseInstructions,
    ...buildChatAnswerExperienceInstructions(broadQuestion),
    ...styleInstructions,
    '',
    JSON.stringify({ question: params.question, history: params.history?.length ? 'provided' : 'empty' }),
    serializedHistory,
    serializedEntries,
  ].join('\n');

  const firstAttemptStartedAt = Date.now();
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
    const firstAttemptDurationMs = Date.now() - firstAttemptStartedAt;
    logger.info('answerQuestion model attempt completed', {
      attempt: 1,
      durationMs: firstAttemptDurationMs,
      broadQuestion,
      entryCount: params.entries.length,
      historyCount: params.history?.length ?? 0,
    });

    const parsed = normalizeAnswerResponse(parseJsonResponse<unknown>(response.text ?? '{}'), response.text ?? '');
    parsed.answer = ensureConcreteNextStepInvitation(parsed.answer, params.question, broadQuestion);
    if (!answerLooksTooThin(parsed.answer, params.question, params.entries.length)) {
      return parsed;
    }
    logger.info('answerQuestion retrying thin answer', {
      firstAttemptDurationMs,
      answerLength: parsed.answer.length,
      broadQuestion,
      entryCount: params.entries.length,
    });
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
    logger.warn('answerQuestion retrying after parse failure', {
      firstAttemptDurationMs: Date.now() - firstAttemptStartedAt,
      broadQuestion,
      entryCount: params.entries.length,
      errorMessage: message,
    });
  }

  const retryPrompt = [
    ...personaPreamble,
    ...baseInstructions,
    ...buildChatAnswerExperienceInstructions(broadQuestion),
    ...styleInstructions,
    'Important: the answer field must be a complete plain-text answer, not a fragment.',
    'If the question asks for themes, topics, patterns, or areas to explore, include several distinct items with explanation.',
    'The final sentence should still be a single concrete next-step invitation.',
    'Escape internal quotes. Use \\n for line breaks.',
    'Do not output markdown fences. Do not output any prose outside the JSON object.',
    '',
    JSON.stringify({ question: params.question, history: params.history?.length ? 'provided' : 'empty' }),
    serializedHistory,
    serializedEntries,
  ].join('\n');

  const retryStartedAt = Date.now();
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
  logger.info('answerQuestion model attempt completed', {
    attempt: 2,
    durationMs: Date.now() - retryStartedAt,
    broadQuestion,
    entryCount: params.entries.length,
    historyCount: params.history?.length ?? 0,
  });

  const retried = normalizeAnswerResponse(parseJsonResponse<unknown>(retryResponse.text ?? '{}'), retryResponse.text ?? '');
  retried.answer = ensureConcreteNextStepInvitation(retried.answer, params.question, broadQuestion);
  return retried;
}

export async function answerWithGoogleSearch(params: {
  question: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  personaPrompt?: string | null;
}): Promise<{ answer: string; cited_entry_ids: string[]; knowledge_gap: boolean }> {
  const { prompt, broadQuestion } = buildInternetAnswerPrompt(params);

  const startedAt = Date.now();
  const response = await generateContentWithRetry({
    model: internetSearchModel,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  logger.info('answerWithGoogleSearch model completed', {
    durationMs: Date.now() - startedAt,
    historyCount: params.history?.length ?? 0,
    broadQuestion,
    answerLength: response.text?.length ?? 0,
    webSearchQueryCount: response.candidates?.reduce(
      (count, candidate) => count + (candidate.groundingMetadata?.webSearchQueries?.length ?? 0),
      0,
    ) ?? 0,
    groundedSourceCount: response.candidates?.reduce(
      (count, candidate) => count + (candidate.groundingMetadata?.groundingChunks?.length ?? 0),
      0,
    ) ?? 0,
  });

  const answerText = response.text?.trim() ?? '';

  if (!answerText) {
    throw new Error('Internet answer returned no text.');
  }

  return {
    answer: appendGroundingSources(answerText, response),
    cited_entry_ids: [],
    knowledge_gap: false,
  };
}

export async function streamAnswerWithGoogleSearch(params: {
  question: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  personaPrompt?: string | null;
  onDelta: (delta: string) => void | Promise<void>;
}): Promise<{ answer: string; cited_entry_ids: string[]; knowledge_gap: boolean }> {
  const { prompt, broadQuestion } = buildInternetAnswerPrompt(params);
  const startedAt = Date.now();
  const stream = await generateContentStreamWithRetry({
    model: internetSearchModel,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  let answerText = '';
  let webSearchQueryCount = 0;
  let groundedSourceCount = 0;
  const groundingSources = new Map<string, string>();

  for await (const chunk of stream) {
    const delta = chunk.text ?? '';
    if (delta) {
      answerText += delta;
      await params.onDelta(delta);
    }

    for (const candidate of chunk.candidates ?? []) {
      webSearchQueryCount += candidate.groundingMetadata?.webSearchQueries?.length ?? 0;
      for (const groundingChunk of candidate.groundingMetadata?.groundingChunks ?? []) {
        groundedSourceCount += 1;
        const web = groundingChunk.web ?? groundingChunk.retrievedContext;
        const url = web?.uri?.trim();
        if (!url) {
          continue;
        }
        const title = web?.title?.trim() || url;
        if (!groundingSources.has(url)) {
          groundingSources.set(url, title);
        }
      }
    }
  }

  const trimmedAnswer = answerText.trim();
  if (!trimmedAnswer) {
    throw new Error('Internet answer returned no text.');
  }

  const sourceLines = Array.from(groundingSources.entries())
    .slice(0, 8)
    .map(([url, title]) => `- [${title}](${url})`);
  const answer = sourceLines.length > 0
    ? `${trimmedAnswer}\n\n## Sources\n${sourceLines.join('\n')}`
    : trimmedAnswer;

  logger.info('streamAnswerWithGoogleSearch model completed', {
    durationMs: Date.now() - startedAt,
    historyCount: params.history?.length ?? 0,
    broadQuestion,
    answerLength: answer.length,
    webSearchQueryCount,
    groundedSourceCount,
  });

  return {
    answer,
    cited_entry_ids: [],
    knowledge_gap: false,
  };
}

export async function extractMappableLocations(params: {
  question: string;
  answer: string;
  atlasName?: string | null;
  cityHint?: string | null;
}): Promise<MappableLocation[]> {
  const question = params.question.trim();
  const answer = params.answer.trim();
  if (!shouldTryMappableLocationExtraction(question, answer)) {
    return [];
  }

  const context = [
    params.atlasName ? `Atlas/wiki name: ${params.atlasName}` : null,
    params.cityHint ? `City or region hint: ${params.cityHint}` : null,
  ].filter(Boolean).join('\n');

  const prompt = [
    'Extract specific real-world physical locations from this Q&A that would be useful to show as pins on a map.',
    'Return only places explicitly recommended, compared, visited, listed, or discussed as destinations.',
    'Include restaurants, bars, venues, stores, landmarks, agencies, parks, schools, hospitals, neighborhoods, and addresses when they are the actual subject of the answer.',
    'Exclude broad regions used only as context, such as the city/state/country in the question, unless the answer compares multiple cities or neighborhoods directly.',
    'For each place, create a search_query that Google Maps Geocoding can resolve. Add the city/region hint when helpful.',
    'Return at most 6 locations. Return [] when there are no useful map pins.',
    '',
    context,
    JSON.stringify({
      question: question.slice(0, 2000),
      answer: answer.slice(0, 6000),
    }),
  ].join('\n');

  try {
    const response = await generateContentWithRetry({
      model: internetSearchModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: mappableLocationsSchema,
        temperature: 0,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    return normalizeMappableLocations(parseJsonResponse<unknown>(response.text ?? '[]'));
  } catch (error) {
    logger.warn('Failed to extract mappable locations from answer.', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function generateAnswerCard(params: {
  question: string;
  answer: string;
  atlasName?: string | null;
  cityHint?: string | null;
  locations?: MappableLocation[];
}): Promise<GeneratedAnswerCard> {
  const question = params.question.trim();
  const answer = params.answer.trim();
  if (!question || !answer) {
    return buildFallbackAnswerCard(question, answer);
  }

  const locations = normalizeMappableLocations(params.locations ?? []);
  const context = [
    params.atlasName ? `Wiki: ${params.atlasName}` : null,
    params.cityHint ? `City/region: ${params.cityHint}` : 'City/region: Philadelphia',
    locations.length
      ? `Mapped places: ${locations.map((location) => location.name).join(', ')}`
      : null,
  ].filter(Boolean).join('\n');

  const prompt = [
    'Create a shareable Living Wiki Philly Answer Card from this Q&A.',
    'Use a Philly-aware, useful, lightly entertaining voice, but keep every line fast to scan.',
    'Only use facts supported by the provided answer. Do not invent new restaurants, claims, prices, rankings, dates, or addresses.',
    'Return concise card copy:',
    '- title: 4 to 9 words, specific and lively.',
    '- subtitle: one sentence, max 130 characters.',
    '- key_facts: 3 to 5 bullets, max 120 characters each.',
    '- did_you_know: 2 to 3 bullets, max 120 characters each.',
    'If mapped places are provided, naturally include the most useful ones in key_facts when relevant.',
    '',
    context,
    '',
    JSON.stringify({
      question: question.slice(0, 2000),
      answer: answer.slice(0, 7000),
    }),
  ].join('\n');

  try {
    const response = await generateContentWithRetry({
      model: internetSearchModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: answerCardSchema,
        temperature: 0.25,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    return normalizeAnswerCard(parseJsonResponse<unknown>(response.text ?? '{}'), question, answer);
  } catch (error) {
    logger.warn('Failed to generate answer card with Gemini.', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return buildFallbackAnswerCard(question, answer);
  }
}

export async function generateBoardWizardBatch(params: {
  mode: BoardWizardMode;
  prompt: string;
  pastedList?: string;
  url?: string;
  photoNames?: string[];
  photos?: BoardWizardPhotoInput[];
  targetBoardTitle?: string | null;
  defaultType: GeneratedBoardWizardCard['type'];
  count: number;
  countIsExplicit?: boolean;
  vibe: BoardWizardVibe;
  tourOptions?: {
    voiceStyle?: GeneratedBoardTourVoiceStyle;
    paceOrRouteStyle?: string;
    extras?: string[];
  } | null;
  existingCards?: Array<{ title: string; subtitle?: string; tags?: string[] }>;
}): Promise<GeneratedBoardWizardBatch> {
  const count = Math.max(1, Math.min(100, Math.trunc(params.count || 12)));
  const verificationRequired = shouldVerifyBoardWizardBatch(params, count);
  const researchMode = boardWizardResearchMode(params);
  const cardLimit = params.countIsExplicit ? count : verificationRequired ? 100 : count;
  const prompt = buildBoardWizardPrompt({ ...params, count, verificationRequired });
  const contents = params.photos?.length
    ? [
        { text: prompt },
        ...params.photos.flatMap((photo, index) => [
          {
            text: `Photo ${index + 1} metadata: ${JSON.stringify({
              filename: photo.name,
              caption: photo.caption,
            })}`,
          },
          {
            inlineData: {
              mimeType: photo.mimeType,
              data: photo.base64,
            },
          },
        ]),
      ]
    : prompt;

  for (const wizardModel of boardWizardModels) {
    try {
      const response = await generateContentWithRetry({
        model: wizardModel,
        contents,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: boardWizardBatchSchema,
          temperature: 0.28,
          maxOutputTokens: verificationRequired ? 16384 : Math.min(16384, 1100 + count * 420),
          tools: verificationRequired && researchMode !== 'source' ? [{ googleSearch: {} }] : undefined,
          thinkingConfig: { thinkingBudget: wizardModel === model ? (researchMode === 'curated' ? 1536 : 768) : 0 },
        },
      });
      const draft = normalizeBoardWizardBatch(parseJsonResponse<unknown>(response.text ?? '{}'), params, cardLimit);
      if (!verificationRequired || wizardModel !== model) {
        return draft;
      }
      try {
        return await verifyBoardWizardBatch(params, draft, count, cardLimit);
      } catch (error) {
        logger.warn('Board wizard verification pass failed; returning the generated draft.', {
          mode: params.mode,
          count,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        return draft;
      }
    } catch (error) {
      logger.warn('Failed to generate board wizard batch with Gemini model.', {
        model: wizardModel,
        mode: params.mode,
        count,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return buildFallbackBoardWizardBatch(params, count);
}

function shouldVerifyBoardWizardBatch(
  params: {
    mode: BoardWizardMode;
    prompt: string;
    pastedList?: string;
    targetBoardTitle?: string | null;
  },
  count: number,
): boolean {
  return shouldGroundAndVerifyBoardWizardBatch({ ...params, count });
}

async function verifyBoardWizardBatch(
  params: {
    mode: BoardWizardMode;
    prompt: string;
    pastedList?: string;
    targetBoardTitle?: string | null;
    defaultType: GeneratedBoardWizardCard['type'];
    vibe: BoardWizardVibe;
    countIsExplicit?: boolean;
  },
  draft: GeneratedBoardWizardBatch,
  targetCount: number,
  cardLimit: number,
): Promise<GeneratedBoardWizardBatch> {
  const researchMode = boardWizardResearchMode(params);
  const verificationPrompt = [
    'You are the factual verification editor for a LivingWiki board.',
    'Use Google Search to verify the requested scope, membership, ordering, dates, current status, and entity identities.',
    'Return only corrected JSON matching the schema.',
    'Do not merely critique the draft; repair it.',
    'Remove duplicates unless the same entity legitimately appears more than once for distinct terms, years, editions, works, or events.',
    'Remove adjacent filler: a complete-set request may contain only actual members of that set, never related buildings, institutions, resources, generic facts, or action cards.',
    researchMode === 'curated'
      ? 'This is a curated recommendation or ranking. Research a broad candidate pool, infer the requested ranking criterion, compare candidates against that criterion, and return a defensible ordered selection rather than a fame list.'
      : '',
    researchMode === 'curated'
      ? 'Every description must contain concrete, entity-specific reasons for its position and maintain the requested editorial voice. Reject interchangeable promotional filler.'
      : '',
    researchMode === 'source'
      ? 'The pasted source is authoritative for membership, order, titles, viewpoint, and notes. Do not replace its selections or rewrite away its voice; only repair metadata and clearly unsupported factual errors.'
      : '',
    'For a closed or complete real-world set, completeness and the evidence-backed cardinality override the UI target count unless the user explicitly supplied a numeric count.',
    params.countIsExplicit
      ? `The user explicitly requested ${targetCount} cards. Return exactly that many in the requested scope.`
      : `The UI target is ${targetCount} cards, but it is not an explicit user constraint. Use the real set size when the request asks for a complete set.`,
    `Treat ${new Date().toISOString().slice(0, 10)} as the current date. Replace stale "Present" labels and include current entities when the request requires them.`,
    'Each card must identify its canonical subject independently from its prose:',
    '- entity_name: canonical real subject name without numbering, slogans, or decorative prefixes.',
    '- entity_type: person, place, event, work, product, food, organization, or other.',
    '- image_intent: portrait, place, event, cover, product, food, logo, or other.',
    '- image_context: short disambiguation such as role, creator, location, year, edition, term, or event.',
    '- media_kind: none, song, album, film, book, tv, or game. Use none for people, places, events, products, food, and organizations even if their prose mentions media words.',
    '- short_summary: a vivid standalone hook of at most 160 characters for compact and Live View presentation.',
    '- rank: the requested one-based rank, sequence, or source position; otherwise 0.',
    'image_query must target entity_name plus image_context and image_intent. Never let incidental words in notes change the depicted subject.',
    '',
    'Original user request:',
    JSON.stringify({
      mode: params.mode,
      prompt: params.prompt.slice(0, 4000),
      pastedList: params.pastedList?.slice(0, BOARD_WIZARD_PASTE_MAX_LENGTH) ?? '',
      targetBoardTitle: params.targetBoardTitle ?? '',
    }),
    '',
    'Draft to verify and repair:',
    JSON.stringify(draft),
  ].join('\n');
  const response = await generateContentWithRetry({
    model,
    contents: verificationPrompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseJsonSchema: boardWizardBatchSchema,
      temperature: 0,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingBudget: 1024 },
    },
  });
  const verified = normalizeBoardWizardBatch(
    parseJsonResponse<unknown>(response.text ?? '{}'),
    params,
    cardLimit,
  );
  logger.info('Board wizard verification pass completed.', {
    targetCount,
    draftCount: draft.cards.length,
    verifiedCount: verified.cards.length,
    webSearchQueryCount: response.candidates?.reduce(
      (total, candidate) => total + (candidate.groundingMetadata?.webSearchQueries?.length ?? 0),
      0,
    ) ?? 0,
  });
  return verified;
}

function buildBoardWizardPrompt(params: {
  mode: BoardWizardMode;
  prompt: string;
  pastedList?: string;
  url?: string;
  photoNames?: string[];
  photos?: BoardWizardPhotoInput[];
  targetBoardTitle?: string | null;
  defaultType: GeneratedBoardWizardCard['type'];
  count: number;
  countIsExplicit?: boolean;
  verificationRequired?: boolean;
  vibe: BoardWizardVibe;
  tourOptions?: {
    voiceStyle?: GeneratedBoardTourVoiceStyle;
    paceOrRouteStyle?: string;
    extras?: string[];
  } | null;
  existingCards?: Array<{ title: string; subtitle?: string; tags?: string[] }>;
}): string {
  const numberedSource = params.mode === 'paste' ? parseNumberedBoardSource(params.pastedList ?? '') : null;
  const vibeInstructions: Record<BoardWizardVibe, string> = {
    playful: 'bright, surprising, fun, but still useful and specific',
    foodie: 'food-aware, sensory, practical about taste, price, neighborhoods, and mood',
    traveler: 'curious, place-aware, useful for planning and discovery',
    curator: 'selective, polished, opinionated, gallery-like, and concise',
    memory: 'warm, story-forward, personal, and emotionally specific',
  };
  return [
    'You are the LivingWiki Wizard. Create an editable board batch for a user.',
    'Return only valid JSON matching the schema.',
    'Every card must be concrete and useful, not filler.',
    'Do not include duplicates. Prefer diversity across neighborhoods, styles, categories, or angles.',
    'Follow explicit user constraints before applying defaults: exact counts, named entities, sorting/grouping, required images, location, language, and source URL details.',
    'If the user asks for a known complete set (for example "56 signers"), create cards for the actual set members, not generic examples or related places, institutions, and resources.',
    'If the user asks for sorting or grouping, order the cards in that requested order. For "sort by state", put the state at the start of subtitle and include a state tag.',
    'Do not prefix card titles or image_query values with list numbers or ordinals. The card order already communicates sequence.',
    'If the user asks for pictures, make image_query a specific image-search phrase for each card, such as a person portrait, menu item, hotel room, landmark, product, movie poster, song cover art, album cover, book cover, TV poster, or game cover.',
    'For entertainment/reference boards, image_query must match the card entity itself, not the creator/person in the prompt. Movies should use "<movie title> official movie poster" or "<movie title> film poster"; songs should use "<song title> <artist if known> cover art"; albums should use "<album title> album cover"; books should use "<book title> book cover". Do not use actor/artist portraits unless the card is actually about that person.',
    'For people, image_query must use the canonical person name plus role/context and "portrait", not a poetic nickname or title prefix. Example: title "The God: Art Tatum" should use image_query "Art Tatum jazz pianist portrait".',
    'For any person entity, always request a portrait of that exact person even when the notes mention books, writings, buildings, relatives, organizations, or events.',
    'If a display title has a prefix before a colon or dash, use the real subject after the separator for image_query when that subject is the card entity.',
    'For dated history, sports, award, election, launch, opening, or championship cards, image_query must describe the specific event and year, not merely the country, organization, or person. Prefer an event photograph, winning team, celebration, ceremony, or action from that moment.',
    'For FIFA World Cup winner cards, use "<year> <country> FIFA World Cup champions team celebration photo". Do not use a flag, federation crest, badge, kit graphic, logo, or generic national-team identity image.',
    'When one entity appears in multiple cards, make every image_query distinct to that card\'s year, event, or achievement so the same image is not repeated.',
    'For URL mode, treat the URL as primary evidence. Extract concrete items from the page text, metadata, links, and image candidates before inventing outside examples.',
    'For restaurant/menu URLs: build one board for that restaurant, not a generic list. For a 12-card default, prefer 1 overview card, 1 location/hours card, 8-9 concrete menu/signature item cards, and 1 final action card such as "Reserve", "Order", "Menu", or "Book".',
    'Restaurant menu item cards must use type "food", scope "place", status "saved", and include the tag "menu-item". Their title should be the dish/item name, subtitle should include category or why to try it, place_query should be the restaurant name plus city, and image_query should be "<dish name> <restaurant name> food".',
    'Restaurant location/action cards should use type "place" or "note". For action cards, put the exact reservation/order/menu URL in place_query when it appears in URL context.',
    'When URL context includes image candidates, prefer image_query phrases that match those concrete images, dishes, rooms, amenities, or page sections.',
    'For hotel/Airbnb/lodging URLs: build a board for that listing. Include room/amenity/fact cards, location/neighborhood, house rules/guest notes if present, booking link, and a final action card such as "Book Now".',
    numberedSource
      ? [
          'SOURCE-FIDELITY MODE: The pasted text is a structured numbered source.',
          `It contains exactly ${numberedSource.items.length} ordered items. Return exactly one card for every item in the same order.`,
          'Use each source item title as the card title. Do not omit, merge, replace, reorder, or invent items.',
          'Preserve the complete source item body in notes without truncating or moving text between items. Create short_summary separately for compact display.',
          'Facts in the source override general knowledge. Do not add unsupported claims.',
        ].join('\n')
      : '',
    params.mode === 'photos' && params.photos?.length
      ? [
          'PHOTO MODE: Inspect the actual attached images. The pixels are the primary source; filenames and user context are only supporting clues.',
          `Return exactly ${params.photos.length} cards, one for each photo, in the exact attachment order.`,
          'Create a specific, natural title, subtitle, and useful description for every image. Describe what is visibly supported and use the user context when it helps.',
          'Never invent a person’s identity, an exact place, a private relationship, or an event that cannot be established from the image or supplied context. Express uncertainty honestly.',
          'Name the new board and write its description from the collection as a whole. Use card type "memory" unless another type is clearly more useful.',
          'The selected photo will be attached to its matching card by the client, so image_query should briefly describe that same visible image and must not request a replacement image.',
        ].join('\n')
      : '',
    params.mode === 'walking-tour' || params.mode === 'driving-tour'
      ? [
          'TOUR MODE: Create a self-guided tour, not a generic board.',
          `Tour kind: ${params.mode === 'driving-tour' ? 'driving' : 'walking'}.`,
          `Guide voice: ${params.tourOptions?.voiceStyle ?? 'historian'}.`,
          `Pace/route style: ${params.tourOptions?.paceOrRouteStyle ?? (params.mode === 'driving-tour' ? 'Balanced' : 'Standard')}.`,
          `Extras requested: ${(params.tourOptions?.extras ?? []).join(', ') || 'none'}.`,
          'Order stops in the sequence a visitor should experience them. Each card must be one real stop.',
          'When the input contains a resolved Google Maps route, use only its authoritative ordered stops. Never replace the route with another city or add unrelated stops. The country and full addresses in that route override every guess or prior assumption.',
          'Set board.kind to "walking-tour" or "driving-tour". Set board.tourMeta with mode, voiceStyle, paceOrRouteStyle, extras, and showWayfindersDefault false.',
          'Every tour card must include tour.sequence, tour.address if known, tour.guideScript, and tour.legToNext for every card except the final stop.',
          'guideScript should be polished spoken narration, roughly 90-160 words, with concrete details and no markdown.',
          'legToNext.instruction should be a concise direction summary. legToNext.navScript should be a spoken bridge from this stop to the next.',
          'Use type "place", scope "place", status "planned" or "saved", and tags including "tour-stop".',
        ].join('\n')
      : '',
    'Each title should be max 70 characters. Each subtitle max 120 characters. Notes may be up to 3600 characters when the source or requested voice warrants detail; never cut a sentence in half.',
    'Card type must be one of: place, food, memory, idea, shop, note.',
    'Scope must be one of: place, city, country, region.',
    'Status must be one of: planned, saved, visited, favorite.',
    'Rating must be an integer from 1 to 5.',
    'Tags should be lowercase, 1-6 items, short and useful.',
    'image_query should be a short search phrase for the most accurate image for that exact card entity.',
    'For every card, set entity_name to the canonical depicted subject; set entity_type to person, place, event, work, product, food, organization, or other; set image_intent to portrait, place, event, cover, product, food, logo, or other; and set image_context to the minimum role, creator, location, year, edition, term, or event needed to disambiguate it.',
    'Set media_kind to none unless the card entity itself is a song, album, film, book, TV work, or video game. Words in notes such as "single malt", "book a tour", "track record", or "artist-designed" never make a card media.',
    'Set short_summary to a specific, vivid hook of at most 160 characters. Set rank to the requested one-based position or 0 when the board is not ordered.',
    'The entity fields are authoritative for image selection. Incidental nouns in notes must never replace the entity being depicted.',
    'place_query should be a Google Places-style lookup query when the item is a real place; otherwise use the title.',
    params.countIsExplicit
      ? `Generate exactly ${params.count} cards because the user explicitly supplied that count.`
      : `Use ${params.count} cards as the UI target. If the user requests a complete real-world set, return the evidence-backed complete set instead and never pad or truncate it to this target.`,
    params.verificationRequired ? 'This factual/list request will be verified after generation. Favor canonical names, explicit dates, and zero filler.' : '',
    `Default card type: ${params.defaultType}.`,
    `Vibe: ${params.vibe} (${vibeInstructions[params.vibe]}).`,
    params.targetBoardTitle ? `Target board title: ${params.targetBoardTitle}` : 'Create a clear board title.',
    params.existingCards?.length ? 'Avoid duplicating these existing cards:' : '',
    params.existingCards?.length ? JSON.stringify(params.existingCards.slice(0, 40)) : '',
    '',
    'Quality bar:',
    '- Titles should be distinct, human-readable, and specific.',
    '- Notes should explain why the card matters or what action to take.',
    '- For cards representing links/actions, use type "note", status "planned", rating 4, and place_query equal to the URL or action text.',
    '- Do not alphabetize unless asked. Preserve requested order when the user gives one.',
    '',
    'User input:',
    JSON.stringify({
      mode: params.mode,
      prompt: params.prompt.slice(0, 4000),
      pastedList: numberedSource ? '' : params.pastedList?.slice(0, BOARD_WIZARD_PASTE_MAX_LENGTH) ?? '',
      numberedSource,
      url: params.url?.slice(0, 1000) ?? '',
      photoNames: params.photoNames?.slice(0, 100) ?? [],
      photos: params.photos?.map((photo, index) => ({
        index,
        filename: photo.name,
        caption: photo.caption,
      })) ?? [],
      tourOptions: params.tourOptions ?? null,
    }),
  ].filter(Boolean).join('\n');
}

function normalizeBoardWizardBatch(
  value: unknown,
  params: {
    prompt: string;
    targetBoardTitle?: string | null;
    defaultType: GeneratedBoardWizardCard['type'];
    vibe: BoardWizardVibe;
  },
  count: number,
): GeneratedBoardWizardBatch {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const boardData = data.board && typeof data.board === 'object' ? data.board as Record<string, unknown> : {};
  const cards = Array.isArray(data.cards)
    ? data.cards.map((item) => normalizeBoardWizardCard(item, params.defaultType)).filter((card): card is GeneratedBoardWizardCard => !!card)
    : [];
  const fallback = buildFallbackBoardWizardBatch({ ...params, mode: 'describe', count }, count);
  return {
    board: {
      title: cleanLine(boardData.title, fallback.board.title, 90),
      description: cleanLine(boardData.description, fallback.board.description, 220),
      icon: cleanLine(boardData.icon, fallback.board.icon, 64),
      tone: normalizeBoardWizardTone(boardData.tone, fallback.board.tone),
      kind: normalizeBoardWizardKind(boardData.kind, fallback.board.kind),
      tourMeta: normalizeBoardTourMeta(boardData.tourMeta, fallback.board.tourMeta),
    },
    cards: (cards.length ? cards : fallback.cards).slice(0, count),
  };
}

function normalizeBoardWizardCard(value: unknown, fallbackType: GeneratedBoardWizardCard['type']): GeneratedBoardWizardCard | null {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const title = cleanLine(data.title, '', 80);
  if (!title) {
    return null;
  }
  const type = normalizeBoardWizardCardType(data.type, fallbackType);
  const subtitle = cleanLine(data.subtitle, type === 'food' ? 'Worth saving for later' : 'Generated by the LivingWiki Wizard', 120);
  const notes = cleanLine(data.notes, 'Review and edit this generated card before sharing the board.', 3600);
  const tags = Array.isArray(data.tags)
    ? data.tags.map((tag) => cleanLine(tag, '', 24).toLowerCase()).filter(Boolean).slice(0, 6)
    : [];
  return {
    title,
    subtitle,
    notes,
    type,
    scope: normalizeBoardWizardScope(data.scope),
    status: normalizeBoardWizardStatus(data.status),
    rating: normalizeRating(data.rating),
    tags,
    image_query: normalizeGeneratedBoardWizardImageQuery(title, cleanLine(data.image_query, title, 120), subtitle, notes, tags),
    entity_name: cleanLine(data.entity_name, canonicalBoardWizardEntityName(title), 100),
    entity_type: normalizeBoardWizardEntityType(data.entity_type, type),
    image_intent: normalizeBoardWizardImageIntent(data.image_intent, title, subtitle, notes, tags),
    image_context: cleanLine(data.image_context, boardWizardImageContext(subtitle, notes), 120),
    media_kind: normalizeBoardWizardMediaKind(data.media_kind),
    short_summary: cleanLine(data.short_summary, subtitle || firstBoardWizardSentence(notes), 160),
    rank: normalizeBoardWizardRank(data.rank),
    place_query: cleanLine(data.place_query, title, 140),
    tour: normalizeBoardCardTour(data.tour),
  };
}

function normalizeBoardWizardMediaKind(value: unknown): NonNullable<GeneratedBoardWizardCard['media_kind']> {
  return value === 'song' || value === 'album' || value === 'film' || value === 'book'
    || value === 'tv' || value === 'game' ? value : 'none';
}

function normalizeBoardWizardRank(value: unknown): number {
  const rank = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(rank) && rank > 0 && rank <= 100 ? rank : 0;
}

function firstBoardWizardSentence(value: string): string {
  const sentence = value.match(/^(.{1,155}?[.!?])(?:\s|$)/)?.[1] ?? value.slice(0, 160);
  return sentence.trim();
}

function canonicalBoardWizardEntityName(title: string): string {
  return title
    .replace(/^\s*(?:[#№]?\d{1,3}(?:st|nd|rd|th)?\s*[.):\]-]?\s*|[-*•]\s+)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBoardWizardEntityType(
  value: unknown,
  cardType: GeneratedBoardWizardCard['type'],
): NonNullable<GeneratedBoardWizardCard['entity_type']> {
  if (value === 'person' || value === 'place' || value === 'event' || value === 'work'
    || value === 'product' || value === 'food' || value === 'organization' || value === 'other') {
    return value;
  }
  if (cardType === 'place' || cardType === 'shop') return 'place';
  if (cardType === 'food') return 'food';
  return 'other';
}

function normalizeBoardWizardImageIntent(
  value: unknown,
  title: string,
  subtitle: string,
  notes: string,
  tags: string[],
): NonNullable<GeneratedBoardWizardCard['image_intent']> {
  if (value === 'portrait' || value === 'place' || value === 'event' || value === 'cover'
    || value === 'product' || value === 'food' || value === 'logo' || value === 'other') {
    return value;
  }
  const text = `${title} ${subtitle} ${notes} ${tags.join(' ')}`.toLowerCase();
  if (/\b(portrait|person|born|president|politician|artist|author|athlete|actor|singer|leader)\b/.test(text)) return 'portrait';
  if (/\b(movie|film|album|song|book|novel|game|poster|cover)\b/.test(text)) return 'cover';
  if (/\b(event|final|championship|ceremony|election|launch|opening|year)\b/.test(text)) return 'event';
  if (/\b(food|dish|meal|dessert|menu)\b/.test(text)) return 'food';
  return 'other';
}

function boardWizardImageContext(subtitle: string, notes: string): string {
  const year = `${subtitle} ${notes}`.match(/\b(18\d{2}|19\d{2}|20\d{2})(?:\s*[–—-]\s*(?:18\d{2}|19\d{2}|20\d{2}|present))?/i)?.[0] ?? '';
  return year.replace(/\s+/g, ' ').trim();
}

function normalizeGeneratedBoardWizardImageQuery(
  title: string,
  imageQuery: string,
  subtitle: string,
  notes: string,
  tags: string[],
): string {
  const subject = canonicalBoardWizardImageSubject(title);
  const text = `${title} ${imageQuery} ${subtitle} ${notes} ${tags.join(' ')}`;
  if (subject && isLikelyBoardWizardPersonSubject(subject, text)) {
    return [subject, boardWizardPersonRoleHint(text), 'portrait'].filter(Boolean).join(' ').slice(0, 120);
  }
  return imageQuery.slice(0, 120);
}

function canonicalBoardWizardImageSubject(title: string): string {
  const normalized = title.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^[^:\u2013\u2014-]{2,36}[:\u2013\u2014-]\s*([^:\u2013\u2014-]{2,80})$/);
  return (match?.[1] ?? '').replace(/^["'`]+|["'`]+$/g, '').trim();
}

function isBoardWizardPersonImageContext(text: string): boolean {
  return /\b(portrait|person|people|biography|born|died|artist|musician|composer|singer|rapper|pianist|guitarist|drummer|bassist|saxophonist|trumpeter|vocalist|bandleader|actor|actress|author|writer|poet|scientist|inventor|athlete|president|leader|historical figure)\b/i.test(text);
}

function isLikelyBoardWizardPersonSubject(subject: string, text: string): boolean {
  const words = subject.split(/\s+/).filter(Boolean);
  return words.length >= 2
    && words.length <= 5
    && words.some((word) => /^[A-Z][A-Za-z'.-]+$/.test(word))
    && isBoardWizardPersonImageContext(text);
}

function boardWizardPersonRoleHint(text: string): string {
  const lower = text.toLowerCase();
  if (/\bjazz\b/.test(lower) && /\bpianist\b/.test(lower)) {
    return 'jazz pianist';
  }
  const roles = ['pianist', 'composer', 'singer', 'rapper', 'guitarist', 'drummer', 'bassist', 'saxophonist', 'trumpeter', 'vocalist', 'bandleader', 'musician', 'artist', 'actor', 'actress', 'author', 'writer', 'poet', 'scientist', 'inventor', 'athlete', 'president', 'leader'];
  return roles.find((role) => new RegExp(`\\b${role}\\b`, 'i').test(text)) ?? '';
}

function normalizeBoardWizardKind(value: unknown, fallback?: 'standard' | 'walking-tour' | 'driving-tour'): 'standard' | 'walking-tour' | 'driving-tour' {
  return value === 'walking-tour' || value === 'driving-tour' || value === 'standard' ? value : fallback ?? 'standard';
}

function normalizeBoardTourMeta(value: unknown, fallback?: GeneratedBoardTourMeta | null): GeneratedBoardTourMeta | null {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const mode = data.mode === 'driving' ? 'driving' : data.mode === 'walking' ? 'walking' : fallback?.mode;
  if (!mode) {
    return fallback ?? null;
  }
  const voiceStyle: GeneratedBoardTourVoiceStyle =
    data.voiceStyle === 'local' || data.voiceStyle === 'kid-friendly' || data.voiceStyle === 'historian'
      ? data.voiceStyle
      : fallback?.voiceStyle ?? 'historian';
  return {
    mode,
    totalDistanceText: cleanLine(data.totalDistanceText, fallback?.totalDistanceText ?? '', 32),
    totalDurationText: cleanLine(data.totalDurationText, fallback?.totalDurationText ?? '', 32),
    routePolyline: cleanLine(data.routePolyline, fallback?.routePolyline ?? '', 4000),
    voiceStyle,
    paceOrRouteStyle: cleanLine(data.paceOrRouteStyle, fallback?.paceOrRouteStyle ?? (mode === 'driving' ? 'Balanced' : 'Standard'), 40),
    extras: Array.isArray(data.extras)
      ? data.extras.map((extra) => cleanLine(extra, '', 40)).filter(Boolean).slice(0, 8)
      : fallback?.extras ?? [],
    showWayfindersDefault: data.showWayfindersDefault === true || fallback?.showWayfindersDefault === true,
  };
}

function normalizeBoardCardTour(value: unknown): GeneratedBoardCardTour | null {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const sequence = normalizeInteger(data.sequence, 0, 0, 200);
  const guideScript = cleanLine(data.guideScript, '', 3600);
  const address = cleanLine(data.address, '', 180);
  if (!sequence && !guideScript && !address) {
    return null;
  }
  return {
    sequence,
    lat: normalizeDecimal(data.lat, -90, 90),
    lng: normalizeDecimal(data.lng, -180, 180),
    address,
    guideScript,
    legToNext: normalizeBoardTourLeg(data.legToNext),
  };
}

function normalizeBoardTourLeg(value: unknown): GeneratedBoardTourLeg | null {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const instruction = cleanLine(data.instruction, '', 260);
  const navScript = cleanLine(data.navScript, instruction, 700);
  if (!instruction && !navScript) {
    return null;
  }
  return {
    distanceText: cleanLine(data.distanceText, '', 32),
    durationText: cleanLine(data.durationText, '', 32),
    instruction,
    navScript,
    encodedPolyline: cleanLine(data.encodedPolyline, '', 4000),
  };
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : fallback;
  return Math.max(min, Math.min(max, Number.isFinite(number) ? Math.round(number) : fallback));
}

function normalizeDecimal(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : null;
  return typeof number === 'number' && Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : null;
}

function buildFallbackBoardWizardBatch(
  params: {
    prompt: string;
    pastedList?: string;
    url?: string;
    photoNames?: string[];
    targetBoardTitle?: string | null;
    defaultType: GeneratedBoardWizardCard['type'];
    vibe: BoardWizardVibe;
    count?: number;
    mode?: BoardWizardMode;
    tourOptions?: {
      voiceStyle?: GeneratedBoardTourVoiceStyle;
      paceOrRouteStyle?: string;
      extras?: string[];
    } | null;
  },
  count: number,
): GeneratedBoardWizardBatch {
  if (params.mode === 'walking-tour' || params.mode === 'driving-tour') {
    return buildFallbackTourWizardBatch(params, count);
  }
  const sourceItems = fallbackWizardItems(params).slice(0, count);
  const baseTitle = params.targetBoardTitle?.trim() || titleFromPrompt(params.prompt || params.pastedList || params.url || 'Wizard board');
  const cards = sourceItems.map((title, index): GeneratedBoardWizardCard => ({
    title,
    subtitle: params.vibe === 'memory' ? 'A memory worth keeping' : 'A wizard-generated starting point',
    notes: 'Generated as a draft. Edit the details, tags, image, and rating before sharing.',
    type: params.defaultType,
    scope: params.defaultType === 'place' || params.defaultType === 'food' || params.defaultType === 'shop' ? 'place' : 'place',
    status: index % 5 === 0 ? 'favorite' : 'saved',
    rating: Math.max(3, 5 - (index % 3)),
    tags: [params.vibe, params.defaultType].filter(Boolean).slice(0, 6),
    image_query: `${title} ${baseTitle}`,
    place_query: title,
  }));
  return {
    board: {
      title: baseTitle,
      description: `A ${params.vibe} batch generated from your ${params.mode ?? 'wizard'} input.`,
      icon: params.defaultType === 'food' ? 'restaurant' : params.defaultType === 'shop' ? 'storefront' : 'auto_awesome',
      tone: params.vibe === 'foodie' ? 'coral' : params.vibe === 'traveler' ? 'sky' : params.vibe === 'memory' ? 'purple' : 'teal',
      kind: 'standard',
      tourMeta: null,
    },
    cards,
  };
}

function buildFallbackTourWizardBatch(
  params: {
    prompt: string;
    targetBoardTitle?: string | null;
    mode?: BoardWizardMode;
    tourOptions?: {
      voiceStyle?: GeneratedBoardTourVoiceStyle;
      paceOrRouteStyle?: string;
      extras?: string[];
    } | null;
  },
  count: number,
): GeneratedBoardWizardBatch {
  const mode: GeneratedBoardTourMode = params.mode === 'driving-tour' ? 'driving' : 'walking';
  const baseTitle = params.targetBoardTitle?.trim() || titleFromPrompt(params.prompt || `${mode} tour`);
  const stops = fallbackWizardItems({ prompt: params.prompt || baseTitle }).slice(0, Math.max(2, count));
  const cards = stops.map((title, index): GeneratedBoardWizardCard => {
    const next = stops[index + 1] ?? '';
    const finalStop = index === stops.length - 1;
    const durationText = mode === 'driving' ? `${Math.max(4, 6 + index)} min` : `${Math.max(2, 3 + (index % 4))} min`;
    const distanceText = mode === 'driving' ? `${(1 + index * 0.4).toFixed(1)} mi` : `${(0.1 + index * 0.06).toFixed(1)} mi`;
    return {
      title,
      subtitle: `Stop ${index + 1}`,
      notes: `Draft tour stop for ${baseTitle}.`,
      type: 'place',
      scope: 'place',
      status: index === 0 ? 'favorite' : 'planned',
      rating: 4,
      tags: ['tour-stop', mode === 'driving' ? 'driving-tour' : 'walking-tour'],
      image_query: `${title} ${baseTitle}`,
      place_query: title,
      tour: {
        sequence: index + 1,
        lat: null,
        lng: null,
        address: '',
        guideScript: `Welcome to stop ${index + 1}: ${title}. This is a generated starting point for ${baseTitle}. Edit this script to add the exact story, sponsor language, and visitor guidance you want people to hear.`,
        legToNext: finalStop
          ? null
          : {
              distanceText,
              durationText,
              instruction: `${mode === 'driving' ? 'Drive' : 'Walk'} from ${title} to ${next}.`,
              navScript: `From ${title}, ${mode === 'driving' ? 'drive' : 'walk'} about ${durationText}, roughly ${distanceText}, to your next stop: ${next}.`,
              encodedPolyline: '',
            },
      },
    };
  });
  return {
    board: {
      title: baseTitle,
      description: `A self-guided ${mode} tour generated by the LivingWiki Wizard.`,
      icon: mode === 'driving' ? 'directions_car' : 'directions_walk',
      tone: mode === 'driving' ? 'green' : 'sky',
      kind: mode === 'driving' ? 'driving-tour' : 'walking-tour',
      tourMeta: {
        mode,
        totalDistanceText: '',
        totalDurationText: '',
        routePolyline: '',
        voiceStyle: params.tourOptions?.voiceStyle ?? 'historian',
        paceOrRouteStyle: params.tourOptions?.paceOrRouteStyle ?? (mode === 'driving' ? 'Balanced' : 'Standard'),
        extras: params.tourOptions?.extras ?? [],
        showWayfindersDefault: false,
      },
    },
    cards,
  };
}

function fallbackWizardItems(params: {
  prompt: string;
  pastedList?: string;
  url?: string;
  photoNames?: string[];
}): string[] {
  const pasted = (params.pastedList ?? '')
    .split(/\n|,|;/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((line) => line.length > 1);
  if (pasted.length) {
    return pasted;
  }
  if (params.photoNames?.length) {
    return params.photoNames.map((name) => name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim()).filter(Boolean);
  }
  const prompt = params.prompt || params.url || 'Wizard card';
  return Array.from({ length: 100 }, (_, index) => `${titleFromPrompt(prompt)} ${index + 1}`);
}

function titleFromPrompt(value: string): string {
  const cleaned = value
    .replace(/^https?:\/\/\S+/i, 'Article-inspired board')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return 'Wizard board';
  }
  const withoutCount = cleaned.replace(/\b(the\s+)?\d+\s+(best|top|favorite|greatest)\b/i, 'Best').trim();
  return withoutCount.slice(0, 72);
}

function cleanLine(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return (text || fallback).slice(0, maxLength);
}

function normalizeBoardWizardTone(value: unknown, fallback: GeneratedBoardWizardBatch['board']['tone']): GeneratedBoardWizardBatch['board']['tone'] {
  return value === 'teal' || value === 'coral' || value === 'yellow' || value === 'green' || value === 'blue' || value === 'sky' || value === 'purple'
    ? value
    : fallback;
}

function normalizeBoardWizardCardType(value: unknown, fallback: GeneratedBoardWizardCard['type']): GeneratedBoardWizardCard['type'] {
  return value === 'place' || value === 'food' || value === 'memory' || value === 'idea' || value === 'shop' || value === 'note'
    ? value
    : fallback;
}

function normalizeBoardWizardScope(value: unknown): GeneratedBoardWizardCard['scope'] {
  return value === 'city' || value === 'country' || value === 'region' ? value : 'place';
}

function normalizeBoardWizardStatus(value: unknown): GeneratedBoardWizardCard['status'] {
  return value === 'planned' || value === 'visited' || value === 'favorite' ? value : 'saved';
}

function normalizeRating(value: unknown): number {
  return Math.max(1, Math.min(5, typeof value === 'number' ? Math.round(value) : 4));
}

function normalizeRecapLines(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
    .slice(0, limit)
    .map((item) => item.slice(0, maxLength));
}

function normalizeVoiceConversationRecap(
  value: unknown,
  fallback: {
    title: string;
    summary: string;
    contextualAnswer: string;
  },
): GeneratedVoiceConversationRecap {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const suggestedPlaces = Array.isArray(data.suggested_places)
    ? data.suggested_places
        .map((item): GeneratedVoiceConversationRecapPlace | null => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const place = item as Record<string, unknown>;
          const name = typeof place.name === 'string' ? place.name.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
          const reason = typeof place.reason === 'string' ? place.reason.replace(/\s+/g, ' ').trim().slice(0, 180) : '';
          const searchQuery = typeof place.search_query === 'string'
            ? place.search_query.replace(/\s+/g, ' ').trim().slice(0, 180)
            : '';
          if (!name || !searchQuery) {
            return null;
          }
          return {
            name,
            reason: reason || 'Mentioned in your voice conversation.',
            search_query: searchQuery,
          };
        })
        .filter((item): item is GeneratedVoiceConversationRecapPlace => !!item)
        .slice(0, 6)
    : [];

  const title = typeof data.title === 'string' && data.title.trim()
    ? data.title.replace(/\s+/g, ' ').trim().slice(0, 90)
    : fallback.title;
  const summary = typeof data.summary === 'string' && data.summary.trim()
    ? data.summary.replace(/\s+/g, ' ').trim().slice(0, 650)
    : fallback.summary;
  const contextualAnswer = typeof data.contextual_answer === 'string' && data.contextual_answer.trim()
    ? data.contextual_answer.trim().slice(0, 3500)
    : fallback.contextualAnswer;

  return {
    title,
    summary,
    contextual_answer: contextualAnswer,
    key_questions: normalizeRecapLines(data.key_questions, 5, 180),
    useful_takeaways: normalizeRecapLines(data.useful_takeaways, 6, 220),
    suggested_places: suggestedPlaces,
  };
}

export async function generateVoiceConversationRecap(params: {
  atlasName?: string | null;
  cityHint?: string | null;
  transcript: Array<{ role: 'user' | 'agent'; text: string }>;
}): Promise<GeneratedVoiceConversationRecap> {
  const transcript = params.transcript
    .map((item) => `${item.role === 'user' ? 'User' : 'Living Wiki'}: ${item.text}`)
    .join('\n')
    .trim();
  const placeName = params.cityHint || params.atlasName || 'this wiki';
  const fallback = {
    title: `${placeName} voice chat recap`,
    summary: `A recap of the voice conversation about ${placeName}.`,
    contextualAnswer: transcript.slice(0, 3500),
  };
  if (!transcript) {
    return {
      ...fallback,
      contextual_answer: fallback.contextualAnswer,
      key_questions: [],
      useful_takeaways: [],
      suggested_places: [],
    };
  }

  const context = [
    params.atlasName ? `Wiki: ${params.atlasName}` : null,
    params.cityHint ? `City/region: ${params.cityHint}` : null,
  ].filter(Boolean).join('\n');
  const prompt = [
    'You are the post-call cleanup editor for Living Wiki.',
    'Turn this voice transcript into a polished, useful email recap and answer-card source.',
    'Be contextual: preserve the city/wiki context, the user intent, and the most useful recommendations.',
    'Do not invent places, claims, addresses, prices, rankings, or facts not supported by the transcript.',
    'For suggested_places, include only real physical locations that were explicitly mentioned, recommended, compared, or clearly requested in the conversation.',
    'For each suggested place, write a Google Maps-friendly search_query with the city/region when helpful. If no specific locations were mentioned, return [].',
    'Return JSON only.',
    '',
    context,
    '',
    transcript.slice(0, 9000),
  ].join('\n');

  try {
    const response = await generateContentWithRetry({
      model: internetSearchModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: voiceConversationRecapSchema,
        temperature: 0.18,
        maxOutputTokens: 2400,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    return normalizeVoiceConversationRecap(parseJsonResponse<unknown>(response.text ?? '{}'), fallback);
  } catch (error) {
    logger.warn('Failed to generate voice conversation recap with Gemini.', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      ...fallback,
      contextual_answer: fallback.contextualAnswer,
      key_questions: [],
      useful_takeaways: [],
      suggested_places: [],
    };
  }
}

export async function generateAnswerQuiz(params: {
  title: string;
  question: string;
  answerPreview: string;
  keyFacts: string[];
  didYouKnow: string[];
  atlasName?: string | null;
}): Promise<GeneratedAnswerQuiz> {
  const title = cleanCardLine(params.title, 90);
  const question = params.question.trim();
  const answerPreview = params.answerPreview.trim();
  const sourceLines = [
    ...params.keyFacts.map((line) => cleanCardLine(line, 160)).filter(Boolean),
    ...params.didYouKnow.map((line) => cleanCardLine(line, 160)).filter(Boolean),
  ];

  if (!question || (!answerPreview && sourceLines.length < 3)) {
    return buildFallbackAnswerQuiz(title, question, sourceLines);
  }

  const prompt = [
    'Create a public Living Wiki Philly challenge quiz from this answer card.',
    'The quiz should feel fast, useful, and Philly-aware, not like a school worksheet.',
    'Only use facts supported by the provided answer/card text. Do not invent places, dates, stats, or claims.',
    'Return:',
    '- title: 4 to 10 words.',
    '- description: one inviting sentence, max 150 characters.',
    '- questions: 5 to 8 multiple-choice questions.',
    '- each question has exactly 4 options.',
    '- exactly one correct option per question.',
    '- explanations are short and explain the answer in one sentence.',
    'Avoid trick questions and avoid options like "all of the above".',
    '',
    params.atlasName ? `Wiki: ${params.atlasName}` : 'Wiki: Living Wiki Philly',
    '',
    JSON.stringify({
      card_title: title,
      user_question: question.slice(0, 1200),
      answer_preview: answerPreview.slice(0, 2200),
      key_facts: sourceLines.slice(0, 8),
    }),
  ].join('\n');

  try {
    const response = await generateContentWithRetry({
      model: internetSearchModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: answerQuizSchema,
        temperature: 0.28,
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    return normalizeAnswerQuiz(parseJsonResponse<unknown>(response.text ?? '{}'), title, question, sourceLines);
  } catch (error) {
    logger.warn('Failed to generate answer quiz with Gemini.', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return buildFallbackAnswerQuiz(title, question, sourceLines);
  }
}

export async function compileWikiArticles(params: {
  blocks: ExtractBlock[];
  filename: string;
}): Promise<{ articles: WikiArticleDraft[]; usage: ModelUsage }> {
  if (params.blocks.length === 0) {
    return { articles: [], usage: emptyUsage() };
  }

  const serializedBlocks = JSON.stringify(
    params.blocks.map((block) => [block.page, block.lineStart, block.lineEnd, block.text] as const),
  );

  const prompt = [
    `You are compiling a personal wiki from a source document titled "${params.filename}".`,
    'Input format: [page, line_start, line_end, text] arrays.',
    '',
    'Write comprehensive wiki articles that capture ALL important knowledge from this document.',
    'Each article should cover a coherent topic or section of the source material.',
    '',
    'RULES:',
    '- Write 3-10 articles depending on document length and topic diversity.',
    '- Each article should be 200-800 words of dense, structured content.',
    '- Use markdown formatting: headers (##), bold, lists where they improve clarity.',
    '- Embed inline source citations as [Source: FILENAME, p.PAGE] after key facts.',
    '- Capture specific numbers, thresholds, percentages, dates, names, and requirements — these are the facts users will query.',
    '- Do NOT summarize generically. Preserve concrete details: "$100,000 minimum" not "there is a minimum amount".',
    '- Each article gets a clear, searchable title (e.g. "C-PACE Fee Structure" not "Fees").',
    '- The summary field should be 1-2 sentences describing what the article covers, written to help a search function decide if this article is relevant to a question.',
    '- related_articles: list titles of other articles from this batch that are topically connected.',
    '- source_pages: list every page number referenced in the article content.',
    '',
    'Return valid JSON matching the schema.',
    '',
    serializedBlocks,
  ].join('\n');

  const response = await generateContentWithRetry({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: wikiArticleDraftSchema,
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  });

  let parsed: WikiArticleDraft[];
  try {
    parsed = parseJsonResponse<WikiArticleDraft[]>(response.text ?? '[]');
  } catch (error) {
    logger.warn('compileWikiArticles: JSON parse failed', {
      error: error instanceof Error ? error.message : String(error),
      responsePreview: (response.text ?? '').slice(0, 200),
    });
    return { articles: [], usage: usageFromResponse(response) };
  }

  if (!Array.isArray(parsed)) {
    logger.warn('compileWikiArticles: response was not an array');
    return { articles: [], usage: usageFromResponse(response) };
  }

  return {
    articles: parsed
      .filter(
        (article): article is WikiArticleDraft =>
          article != null &&
          typeof article === 'object' &&
          typeof article.title === 'string' &&
          typeof article.content === 'string' &&
          article.title.trim().length > 0 &&
          article.content.trim().length > 0,
      )
      .map((article) => ({
        title: article.title.trim(),
        content: article.content.trim(),
        summary: (typeof article.summary === 'string' ? article.summary : '').trim(),
        related_articles: Array.isArray(article.related_articles)
          ? article.related_articles.filter((value): value is string => typeof value === 'string')
          : [],
        source_pages: Array.isArray(article.source_pages)
          ? article.source_pages.filter(
              (sp): sp is { filename: string; page: number } =>
                sp != null && typeof sp === 'object' && typeof sp.page === 'number',
            )
          : [],
      })),
    usage: usageFromResponse(response),
  };
}

export async function planArticleMerge(params: {
  existingArticles: Array<{ article_id: string; title: string; summary: string }>;
  newSourceText: string;
  filename: string;
}): Promise<{ plan: WikiArticlePlan; usage: ModelUsage }> {
  const serializedArticles = JSON.stringify(
    params.existingArticles.map((article) => ({
      id: article.article_id,
      title: article.title,
      summary: article.summary,
    })),
  );

  const prompt = [
    'You are planning how to integrate new source material into an existing wiki.',
    '',
    'EXISTING WIKI ARTICLES:',
    serializedArticles,
    '',
    `NEW SOURCE DOCUMENT: "${params.filename}"`,
    'Preview of new content (first 3000 chars):',
    params.newSourceText.slice(0, 3000),
    '',
    'Decide which existing articles need updating with new information, and which new articles should be created.',
    'Only mark an article for update if the new source genuinely adds information to that topic.',
    'Only create new articles for topics not already covered by existing articles.',
    'Return valid JSON matching the schema.',
  ].join('\n');

  const response = await generateContentWithRetry({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: wikiArticlePlanSchema,
      temperature: 0,
      maxOutputTokens: 1024,
    },
  });

  let parsed: WikiArticlePlan;
  try {
    parsed = parseJsonResponse<WikiArticlePlan>(response.text ?? '{"update":[],"create":[]}');
  } catch {
    return { plan: { update: [], create: [] }, usage: usageFromResponse(response) };
  }

  return {
    plan: {
      update: Array.isArray(parsed.update) ? parsed.update : [],
      create: Array.isArray(parsed.create) ? parsed.create : [],
    },
    usage: usageFromResponse(response),
  };
}

export async function mergeWikiArticle(params: {
  existingArticle: { title: string; content: string };
  newBlocks: ExtractBlock[];
  filename: string;
}): Promise<{ article: WikiArticleDraft; usage: ModelUsage }> {
  const serializedBlocks = JSON.stringify(
    params.newBlocks.map((block) => [block.page, block.lineStart, block.lineEnd, block.text] as const),
  );

  const prompt = [
    `You are updating the wiki article "${params.existingArticle.title}" with new source material from "${params.filename}".`,
    '',
    'RULES:',
    '1. Every fact currently in the article MUST remain. Do not drop, shorten, or rephrase existing content unless the new source explicitly contradicts it.',
    '2. Integrate new facts into the appropriate sections. Add new sections if needed.',
    '3. When new content contradicts existing content, keep BOTH and note the tension: "According to [Source: doc1, p.12]... however [Source: doc2, p.5] states..."',
    '4. Maintain inline source citations: [Source: FILENAME, p.PAGE]',
    '5. The article should read as a coherent whole, not "old part" then "new part appended."',
    '6. Preserve specific numbers, thresholds, dates, names, and requirements from BOTH sources.',
    '7. The summary should be updated to reflect the expanded scope.',
    '8. Update source_pages to include pages from both the existing content and new material.',
    '',
    'EXISTING ARTICLE:',
    params.existingArticle.content,
    '',
    'NEW SOURCE MATERIAL:',
    serializedBlocks,
    '',
    'Return the updated article as valid JSON matching the schema. Return a single-element array.',
  ].join('\n');

  const response = await generateContentWithRetry({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: wikiArticleDraftSchema,
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  });

  let parsed: WikiArticleDraft[];
  try {
    parsed = parseJsonResponse<WikiArticleDraft[]>(response.text ?? '[]');
  } catch (error) {
    logger.warn('mergeWikiArticle: JSON parse failed, returning existing article unchanged', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      article: {
        title: params.existingArticle.title,
        content: params.existingArticle.content,
        summary: '',
        related_articles: [],
        source_pages: [],
      },
      usage: usageFromResponse(response),
    };
  }

  const merged = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
  if (!merged || typeof merged.content !== 'string' || merged.content.trim().length === 0) {
    return {
      article: {
        title: params.existingArticle.title,
        content: params.existingArticle.content,
        summary: '',
        related_articles: [],
        source_pages: [],
      },
      usage: usageFromResponse(response),
    };
  }

  return {
    article: {
      title: (typeof merged.title === 'string' ? merged.title : params.existingArticle.title).trim(),
      content: merged.content.trim(),
      summary: (typeof merged.summary === 'string' ? merged.summary : '').trim(),
      related_articles: Array.isArray(merged.related_articles)
        ? merged.related_articles.filter((value): value is string => typeof value === 'string')
        : [],
      source_pages: Array.isArray(merged.source_pages)
        ? merged.source_pages.filter(
            (sp): sp is { filename: string; page: number } =>
              sp != null && typeof sp === 'object' && typeof sp.page === 'number',
          )
        : [],
    },
    usage: usageFromResponse(response),
  };
}

export async function answerFromArticles(params: {
  question: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  articles: Array<{ article_id: string; title: string; content: string }>;
  personaPrompt?: string | null;
}): Promise<{ answer: string; cited_entry_ids: string[]; knowledge_gap: boolean }> {
  const personaPreamble = buildPersonaPreamble(params.personaPrompt);
  const hasHistory = (params.history ?? []).length > 0;
  const broadQuestion = isBroadSynthesisQuestion(params.question) || hasHistory;
  const serializedHistory = JSON.stringify(
    (params.history ?? []).slice(-6).map((message) => [message.role, message.text.slice(0, 4000)] as const),
  );
  const serializedArticles = params.articles
    .map(
      (article) =>
        `--- ARTICLE [${article.article_id}]: ${article.title} ---\n${article.content}\n--- END ARTICLE ---`,
    )
    .join('\n\n');

  const baseInstructions = [
    'You are answering a question using wiki articles from a personal knowledge base.',
    'Use only the information in the provided articles.',
    'Articles contain inline citations like [Source: filename, p.PAGE] — preserve and reference these in your answer.',
    'When citing facts, include the source reference from the article (e.g. "According to [Source: C-PACE Guide, p.29]...").',
    'Treat the recent conversation history as real context: resolve references (it, that, they), understand follow-ups.',
    'If the user gives a short affirmative follow-up like "yes", "yeah", "do that", or "let\'s do it", interpret it as accepting the most recent concrete next-step proposed in the conversation history and continue from that exact proposal instead of asking what they mean.',
    'When the user asks for "other", "more", "additional" items, introduce genuinely new themes not already covered.',
    'Do not invent information not present in the articles.',
    'Give a useful, concrete answer with enough detail to be meaningful.',
    'End the answer with exactly one brief, concrete next-step invitation that is tightly grounded in the answer you just gave.',
    'The next-step invitation must propose one specific continuation, not multiple branches or a menu of options.',
    'Make the invitation high-value and specific enough that a later reply like "yes" clearly refers to one continuation path.',
    'Avoid generic closers like "Want more?", "Need anything else?", or "Would you like more details?".',
    'Include specific numbers, dates, thresholds, and requirements when the articles contain them.',
    'If the evidence is incomplete or weak, say so clearly and set knowledge_gap to true.',
    'For cited_entry_ids, return the article_id values of articles you drew information from.',
    'Return only valid JSON matching the schema.',
  ];
  const styleInstructions = broadQuestion
    ? [
        'This is a synthesis or exploration question.',
        'Give a substantive answer: 2-4 solid paragraphs or a list of 4-8 concrete themes.',
        'For each theme, explain it briefly instead of naming it only.',
      ]
    : [
        'For direct questions, answer in 1-3 compact paragraphs unless a short list is clearly better.',
      ];

  const prompt = [
    ...personaPreamble,
    ...baseInstructions,
    ...buildChatAnswerExperienceInstructions(broadQuestion),
    ...styleInstructions,
    '',
    JSON.stringify({ question: params.question, history: params.history?.length ? 'provided' : 'empty' }),
    serializedHistory,
    '',
    serializedArticles,
  ].join('\n');

  const startedAt = Date.now();
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
  logger.info('answerFromArticles model completed', {
    durationMs: Date.now() - startedAt,
    broadQuestion,
    articleCount: params.articles.length,
    historyCount: params.history?.length ?? 0,
  });

  const parsed = normalizeAnswerResponse(parseJsonResponse<unknown>(response.text ?? '{}'), response.text ?? '');
  parsed.answer = ensureConcreteNextStepInvitation(parsed.answer, params.question, broadQuestion);
  return parsed;
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

function normalizeMappableLocations(parsed: unknown): MappableLocation[] {
  if (!Array.isArray(parsed)) {
    return [];
  }

  const seen = new Set<string>();
  const locations: MappableLocation[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const data = item as Record<string, unknown>;
    const name = typeof data['name'] === 'string' ? data['name'].replace(/\s+/g, ' ').trim() : '';
    const searchQuery =
      typeof data['search_query'] === 'string' ? data['search_query'].replace(/\s+/g, ' ').trim() : '';
    if (!name || !searchQuery) {
      continue;
    }
    const key = `${name.toLowerCase()}::${searchQuery.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    locations.push({
      name: name.slice(0, 120),
      search_query: searchQuery.slice(0, 240),
      address_hint:
        typeof data['address_hint'] === 'string' && data['address_hint'].trim()
          ? data['address_hint'].replace(/\s+/g, ' ').trim().slice(0, 240)
          : null,
    });
    if (locations.length >= 6) {
      break;
    }
  }

  return locations;
}

function normalizeAnswerCard(parsed: unknown, question: string, answer: string): GeneratedAnswerCard {
  if (!parsed || typeof parsed !== 'object') {
    return buildFallbackAnswerCard(question, answer);
  }

  const value = parsed as Record<string, unknown>;
  const fallback = buildFallbackAnswerCard(question, answer);
  const title = cleanCardLine(value['title'], 90) || fallback.title;
  const subtitle = cleanCardLine(value['subtitle'], 140) || fallback.subtitle;
  const keyFacts = cleanCardLines(value['key_facts'], 5, 125);
  const didYouKnow = cleanCardLines(value['did_you_know'], 3, 125);

  return {
    title,
    subtitle,
    key_facts: keyFacts.length >= 3 ? keyFacts : fallback.key_facts,
    did_you_know: didYouKnow.length >= 2 ? didYouKnow : fallback.did_you_know,
  };
}

function normalizeAnswerQuiz(
  parsed: unknown,
  title: string,
  question: string,
  sourceLines: string[],
): GeneratedAnswerQuiz {
  if (!parsed || typeof parsed !== 'object') {
    return buildFallbackAnswerQuiz(title, question, sourceLines);
  }

  const value = parsed as Record<string, unknown>;
  const fallback = buildFallbackAnswerQuiz(title, question, sourceLines);
  const questions = Array.isArray(value['questions'])
    ? value['questions'].map(normalizeQuizQuestion).filter((item): item is GeneratedQuizQuestion => !!item).slice(0, 8)
    : [];

  return {
    title: cleanCardLine(value['title'], 90) || fallback.title,
    description: cleanCardLine(value['description'], 160) || fallback.description,
    questions: questions.length >= 5 ? questions : fallback.questions,
  };
}

function normalizeQuizQuestion(value: unknown): GeneratedQuizQuestion | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const data = value as Record<string, unknown>;
  const prompt = cleanCardLine(data['prompt'], 180);
  const options = cleanCardLines(data['options'], 4, 110);
  const correctIndex = Number(data['correct_option_index']);
  const explanation = cleanCardLine(data['explanation'], 180);
  if (!prompt || options.length !== 4 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return null;
  }

  return {
    prompt,
    options,
    correct_option_index: correctIndex,
    explanation: explanation || 'The answer follows directly from the Living Wiki card.',
  };
}

function cleanCardLines(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of value) {
    const line = cleanCardLine(item, maxLength);
    const key = line.toLowerCase();
    if (!line || seen.has(key)) {
      continue;
    }
    seen.add(key);
    lines.push(line);
    if (lines.length >= maxItems) {
      break;
    }
  }
  return lines;
}

function cleanCardLine(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }
  const cleaned = value
    .replace(/^[\s\-*•]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, Math.max(0, maxLength - 1)).trim()}…` : cleaned;
}

function buildFallbackAnswerQuiz(title: string, question: string, sourceLines: string[]): GeneratedAnswerQuiz {
  const cleanTitle = title || cleanCardLine(question.replace(/[?!.]+$/g, ''), 80) || 'Philly Knowledge Challenge';
  const facts = sourceLines.map((line) => cleanCardLine(line, 130)).filter(Boolean);
  while (facts.length < 5) {
    facts.push('Living Wiki Philly turns local answers into quick, shareable knowledge.');
  }

  const questions = facts.slice(0, 5).map((fact, index) => {
    const options = [
      fact,
      'A detail not supported by this answer card.',
      'A generic Philly guess without card evidence.',
      'A different topic from the original question.',
    ];
    const rotation = index % options.length;
    const rotated = [...options.slice(rotation), ...options.slice(0, rotation)];
    return {
      prompt: `Which detail is supported by this Living Wiki answer?`,
      options: rotated,
      correct_option_index: rotated.indexOf(fact),
      explanation: fact,
    };
  });

  return {
    title: `${cleanTitle} Quiz`,
    description: 'Test what you picked up from this Living Wiki Philly answer.',
    questions,
  };
}

function buildFallbackAnswerCard(question: string, answer: string): GeneratedAnswerCard {
  const titleBase = question
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = answer
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => cleanCardLine(sentence, 125))
    .filter((sentence) => sentence.length > 20);

  const keyFacts = sentences.slice(0, 5);
  while (keyFacts.length < 3) {
    keyFacts.push('A quick Living Wiki summary pulled from the answer.');
  }

  const didYouKnow = sentences.slice(5, 8);
  while (didYouKnow.length < 2) {
    didYouKnow.push('Philly rewards the curious: the best answer usually has a neighborhood angle.');
  }

  return {
    title: titleBase ? cleanCardLine(titleBase, 80) : 'A Philly Answer Worth Sharing',
    subtitle: 'A fast, shareable summary from Living Wiki Philly.',
    key_facts: keyFacts.slice(0, 5),
    did_you_know: didYouKnow.slice(0, 3),
  };
}

function shouldTryMappableLocationExtraction(question: string, answer: string): boolean {
  const combined = `${question}\n${answer}`.toLowerCase();
  return [
    'where',
    'near',
    'address',
    'location',
    'restaurant',
    'bar',
    'cafe',
    'coffee',
    'shop',
    'store',
    'venue',
    'hotel',
    'museum',
    'park',
    'school',
    'hospital',
    'office',
    'neighborhood',
    'center city',
    'south philly',
    'north philly',
    'west philly',
    'philadelphia',
    'philly',
  ].some((term) => combined.includes(term));
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

function ensureConcreteNextStepInvitation(
  answer: string,
  question: string,
  broadQuestion: boolean,
): string {
  const trimmed = answer.trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalized = trimmed.toLowerCase();
  if (
    normalized.includes('want me to ') ||
    normalized.includes('would you like me to ') ||
    normalized.includes('if useful, i can ') ||
    normalized.includes('i can next ') ||
    /(?:\n|^).*\?\s*$/.test(trimmed)
  ) {
    return trimmed;
  }

  return `${trimmed}\n\n${buildNextStepInvitation(question, broadQuestion)}`;
}

function buildNextStepInvitation(question: string, broadQuestion: boolean): string {
  const normalized = question.toLowerCase();

  if (
    normalized.includes('name') ||
    normalized.includes('naming') ||
    normalized.includes('brand') ||
    normalized.includes('title')
  ) {
    return 'If useful, I can turn this into 10 stronger naming options in the same direction, each with a short rationale so you can pick one cleanly.';
  }

  if (
    normalized.includes('compare') ||
    normalized.includes('best') ||
    normalized.includes('which') ||
    normalized.includes('versus') ||
    normalized.includes('vs')
  ) {
    return 'If useful, I can compare the strongest 2-3 options directly and recommend one based on the tradeoffs.';
  }

  if (
    normalized.includes('approach') ||
    normalized.includes('solve') ||
    normalized.includes('solution') ||
    normalized.includes('strategy') ||
    normalized.includes('electrify') ||
    normalized.includes('electrifying') ||
    normalized.includes('plan')
  ) {
    return 'If useful, I can turn this into a concrete phased strategy with priorities, actors, financing, and the first moves to make.';
  }

  if (broadQuestion) {
    return 'If useful, I can turn this into a concrete next-step plan with the highest-leverage actions to pursue first.';
  }

  return 'If useful, I can take this one step further and turn it into a concrete recommendation or action plan.';
}
