import { GoogleGenAI } from '@google/genai';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import type { ExtractBlock, KnowledgeEntryDraft, ModelUsage, WikiArticleDraft, WikiArticlePlan } from './types';
import {
  normalizeRelatedTopics,
  normalizeTopicName,
  parseJsonResponse,
} from './utils';

export const geminiApiKey = defineSecret('GEMINI_API_KEY');

const model = 'gemini-3-flash-preview';
const internetSearchModel = 'gemini-2.5-flash';

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
    parsed.answer = ensureConcreteNextStepInvitation(parsed.answer, params.question, broadQuestion);
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
    'The final sentence should still be a single concrete next-step invitation.',
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

  const retried = normalizeAnswerResponse(parseJsonResponse<unknown>(retryResponse.text ?? '{}'), retryResponse.text ?? '');
  retried.answer = ensureConcreteNextStepInvitation(retried.answer, params.question, broadQuestion);
  return retried;
}

export async function answerWithGoogleSearch(params: {
  question: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
}): Promise<{ answer: string; cited_entry_ids: string[]; knowledge_gap: boolean }> {
  const hasHistory = (params.history ?? []).length > 0;
  const broadQuestion = isBroadSynthesisQuestion(params.question) || hasHistory;
  const serializedHistory = JSON.stringify(
    (params.history ?? []).slice(-6).map((message) => [message.role, message.text.slice(0, 4000)] as const),
  );

  const prompt = [
    'You are answering with full open-web context.',
    'Use Google Search to gather current, relevant public information from the web.',
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

  const interaction = await createClient().interactions.create({
    model: internetSearchModel,
    input: prompt,
    tools: [{ type: 'google_search' }],
  });

  if (interaction.status !== 'completed') {
    throw new Error(`Internet answer failed with status: ${interaction.status}`);
  }

  const textOutputs: WebTextOutput[] = [];
  for (const output of interaction.outputs ?? []) {
    if (output.type === 'text' && typeof (output as { text?: unknown }).text === 'string') {
      textOutputs.push(output as WebTextOutput);
    }
  }
  const answerText = textOutputs.map((output) => output.text?.trim() ?? '').filter(Boolean).join('\n\n').trim();

  if (!answerText) {
    throw new Error('Internet answer returned no text.');
  }

  return {
    answer: appendWebSources(answerText, textOutputs),
    cited_entry_ids: [],
    knowledge_gap: false,
  };
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
}): Promise<{ answer: string; cited_entry_ids: string[]; knowledge_gap: boolean }> {
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
    ...baseInstructions,
    ...styleInstructions,
    '',
    JSON.stringify({ question: params.question, history: params.history?.length ? 'provided' : 'empty' }),
    serializedHistory,
    '',
    serializedArticles,
  ].join('\n');

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
