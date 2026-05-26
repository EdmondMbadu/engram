import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { answerFromArticles, answerQuestion, answerWithGoogleSearch, compileKnowledgeEntries, compileWikiArticles, mergeWikiArticle, planArticleMerge, streamAnswerWithGoogleSearch, summarizeTopic } from './gemini';
import { db, storage } from './firebase';
import { extractBlocksFromBuffer, extractBlocksFromUrl } from './extractors';
import {
  buildTopicSearchText,
  chunkExtractBlocks,
  compact,
  dedupeStrings,
  filterRedundantExtractBlocks,
  generateId,
  makeExtractId,
  normalizeRelatedTopics,
  normalizeTopicName,
  normalizeTextFingerprint,
  selectDiverseStrings,
  tokenizeText,
  topicDocumentId,
} from './utils';
import type {
  ChatMessageRecord,
  ChatThreadRecord,
  DocumentRecord,
  DocumentAiUsage,
  ExtractBlock,
  KnowledgeEntryDraft,
  KnowledgeEntryRecord,
  MappableLocation,
  ModelUsage,
  QueryCitationSnapshot,
  TopicEntryPreview,
  TravelGuideStructuredResponse,
  PublicChatMessageRecord,
  PublicChatThreadRecord,
  WikiArticleDraft,
  WikiArticleRecord,
  WikiArticleSource,
  WikiIndexEntry,
  WikiTopicJobRecord,
} from './types';

const documentsCollection = db.collection('documents');
const rawExtractsCollection = db.collection('raw_extracts');
const knowledgeEntriesCollection = db.collection('knowledge_entries');
const wikiTopicsCollection = db.collection('wiki_topics');
const queriesCollection = db.collection('queries');
const chatThreadsCollection = db.collection('chat_threads');
const chatMessagesCollection = db.collection('chat_messages');
const publicChatThreadsCollection = db.collection('public_chat_threads');
const publicChatMessagesCollection = db.collection('public_chat_messages');
const wikiTopicJobsCollection = db.collection('wiki_topic_jobs');
const wikiArticlesCollection = db.collection('wiki_articles');
const wikiIndexCollection = db.collection('wiki_index');
const atlasesCollection = db.collection('atlases');

const compileChunkConcurrency = 6;
const maxTopicPreviewEntries = 12;
const minAnswerEntries = 18;
const maxAnswerEntries = 48;
const broadQuestionMinAnswerEntries = 30;
const broadQuestionMaxAnswerEntries = 72;
const maxUserTurnsPerThread = 8;
const maxAnonymousPublicQuestions = 5;
const maxHistoryMessagesForAnswer = 6;

type ChatQueryTimer = {
  mark(stage: string): void;
  totalMs(): number;
  snapshot(): Record<string, number>;
};

function createChatQueryTimer(): ChatQueryTimer {
  const startedAt = Date.now();
  let previousMarkAt = startedAt;
  const timings: Record<string, number> = {};

  return {
    mark(stage: string): void {
      const now = Date.now();
      timings[stage] = now - previousMarkAt;
      previousMarkAt = now;
    },
    totalMs(): number {
      return Date.now() - startedAt;
    },
    snapshot(): Record<string, number> {
      return { ...timings };
    },
  };
}

export async function loadDocumentRecord(documentId: string): Promise<DocumentRecord & { id: string }> {
  const snapshot = await documentsCollection.doc(documentId).get();
  if (!snapshot.exists) {
    throw new Error(`Document ${documentId} does not exist.`);
  }

  return { id: snapshot.id, ...(snapshot.data() as DocumentRecord) };
}

export async function processStoredDocument(documentId: string): Promise<void> {
  const document = await loadDocumentRecord(documentId);
  if (!document.storage_path) {
    throw new Error(`Document ${documentId} is missing a storage path.`);
  }

  const [buffer] = await storage.bucket().file(document.storage_path).download();
  await processDocument({
    document,
    extraction: extractBlocksFromBuffer(document.file_type, buffer),
  });
}

export async function processUrlDocument(documentId: string): Promise<void> {
  const document = await loadDocumentRecord(documentId);
  if (!document.source_url) {
    throw new Error(`Document ${documentId} is missing source_url.`);
  }

  await processDocument({
    document,
    extraction: extractBlocksFromUrl(document.source_url),
  });
}

export async function deleteDocumentForUser(params: {
  documentId: string;
  userId: string;
}): Promise<{ deletedTopicIds: string[]; updatedTopicIds: string[] }> {
  const document = await loadDocumentRecord(params.documentId);
  if (document.user_id !== params.userId) {
    throw new Error('You do not have access to delete this document.');
  }

  const topicNames = new Set<string>();

  const knowledgeEntriesSnapshot = await knowledgeEntriesCollection
    .where('user_id', '==', params.userId)
    .where('document_id', '==', params.documentId)
    .get();

  const knowledgeEntries = knowledgeEntriesSnapshot.docs.map((snapshot) => ({
    id: snapshot.id,
    ...(snapshot.data() as Omit<KnowledgeEntryRecord, 'created_at' | 'last_updated'>),
  }));

  for (const entry of knowledgeEntries) {
    topicNames.add(entry.topic);
  }

  const rawExtractsSnapshot = await rawExtractsCollection
    .where('user_id', '==', params.userId)
    .where('document_id', '==', params.documentId)
    .get();

  await deleteSnapshotDocs(rawExtractsSnapshot.docs);
  await deleteSnapshotDocs(knowledgeEntriesSnapshot.docs);

  if (document.storage_path) {
    try {
      await storage.bucket().file(document.storage_path).delete({ ignoreNotFound: true });
    } catch (error) {
      logger.warn('Storage delete skipped or failed', {
        documentId: params.documentId,
        storagePath: document.storage_path,
        error,
      });
    }
  }

  const updatedTopicIds: string[] = [];
  const deletedTopicIds: string[] = [];
  const topicsToRefresh: string[] = [];

  for (const topicName of topicNames) {
    const topicId = topicDocumentId(params.userId, topicName);
    const remainingEntriesSnapshot = await knowledgeEntriesCollection
      .where('user_id', '==', params.userId)
      .where('topic', '==', topicName)
      .where('orphaned', '==', false)
      .get();

    if (remainingEntriesSnapshot.empty) {
      await wikiTopicsCollection.doc(topicId).delete();
      deletedTopicIds.push(topicId);
      continue;
    }

    const remainingEntries = remainingEntriesSnapshot.docs.map((snapshot) => ({
      id: snapshot.id,
      ...(snapshot.data() as Omit<KnowledgeEntryRecord, 'created_at' | 'last_updated'>),
    }));

    await wikiTopicsCollection.doc(topicId).set(
      {
        name: topicName,
        summary_status: 'pending',
        summary_error: null,
        entry_ids: remainingEntries.map((entry) => entry.id),
        document_ids: dedupeStrings(remainingEntries.map((entry) => entry.document_id)),
        user_id: params.userId,
        last_updated: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    updatedTopicIds.push(topicId);
    topicsToRefresh.push(topicName);
  }

  await enqueueWikiTopicSummaryJobs(params.userId, document.atlas_id ?? null, topicsToRefresh, params.documentId);

  await documentsCollection.doc(params.documentId).delete();

  return {
    deletedTopicIds,
    updatedTopicIds,
  };
}

export async function deleteChatEntityForUser(params: {
  chatId: string;
  userId: string;
}): Promise<{ deleted: boolean; chatId: string }> {
  const legacyQueryRef = queriesCollection.doc(params.chatId);
  const legacyQuerySnapshot = await legacyQueryRef.get();

  if (legacyQuerySnapshot.exists) {
    if (legacyQuerySnapshot.data()?.user_id !== params.userId) {
      throw new Error('You do not have access to this chat.');
    }
    await legacyQueryRef.delete();
    return { deleted: true, chatId: params.chatId };
  }

  const threadRef = chatThreadsCollection.doc(params.chatId);
  const threadSnapshot = await threadRef.get();
  if (!threadSnapshot.exists) {
    throw new Error('Chat not found.');
  }

  const thread = threadSnapshot.data() as ChatThreadRecord;
  if (thread.user_id !== params.userId) {
    throw new Error('You do not have access to this chat.');
  }

  const messagesSnapshot = await chatMessagesCollection
    .where('thread_id', '==', params.chatId)
    .get();
  await deleteSnapshotDocs(messagesSnapshot.docs);
  await threadRef.delete();
  return { deleted: true, chatId: params.chatId };
}

async function processDocument(params: {
  document: DocumentRecord & { id: string };
  extraction: Promise<{ blocks: ExtractBlock[]; title?: string | null }>;
}): Promise<void> {
  const { document } = params;
  const documentRef = documentsCollection.doc(document.id);
  const startedAt = Date.now();

  await setDocumentProcessingState(documentRef, {
    status: 'processing',
    processing_stage: 'extracting',
    processed_chunks: 0,
    total_chunks: 0,
    error_message: null,
    failure_code: null,
  });

  try {
    const extraction = await params.extraction;
    const extractedBlocks = extraction.blocks.filter((block) => block.text.trim().length > 0);
    const blocks = filterRedundantExtractBlocks(extractedBlocks);

    if (blocks.length === 0) {
      throw new Error('No extractable text found in the document.');
    }

    const chunks = chunkExtractBlocks(blocks);
    const pageCount = Math.max(...blocks.map((block) => block.page));

    logger.info('Document extraction completed', {
      documentId: document.id,
      blockCount: blocks.length,
      removedBoilerplateBlocks: extractedBlocks.length - blocks.length,
      chunkCount: chunks.length,
      pageCount,
      durationMs: Date.now() - startedAt,
    });

    await setDocumentProcessingState(documentRef, {
      processing_stage: 'writing_extracts',
      total_chunks: chunks.length,
      processed_chunks: 0,
      page_count: pageCount,
    });

    const atlasId = document.atlas_id ?? null;
    await writeRawExtracts(document.id, document.user_id, atlasId, blocks);

    await setDocumentProcessingState(documentRef, {
      processing_stage: 'compiling_knowledge',
    });

    const compilation = await buildKnowledgeEntries(document.id, document.user_id, atlasId, blocks, chunks, async (completed) => {
      await setDocumentProcessingState(documentRef, {
        processing_stage: 'compiling_knowledge',
        processed_chunks: completed,
        total_chunks: chunks.length,
      });
    });
    const entries = compilation.entries;

    await addDocumentAiUsage(documentRef, compilation.usage, 'compile');

    logger.info('Knowledge compilation completed', {
      documentId: document.id,
      entryCount: entries.length,
      chunkCount: chunks.length,
      promptTokens: compilation.usage.prompt_tokens,
      outputTokens: compilation.usage.output_tokens,
      durationMs: Date.now() - startedAt,
    });

    await setDocumentProcessingState(documentRef, {
      processing_stage: 'writing_entries',
      processed_chunks: chunks.length,
      total_chunks: chunks.length,
    });

    await writeKnowledgeEntries(entries);
    await setDocumentProcessingState(documentRef, {
      processing_stage: 'queuing_topics',
    });

    const topicNames = await upsertWikiTopics(document.user_id, atlasId, document.id, entries);
    await enqueueWikiTopicSummaryJobs(document.user_id, atlasId, topicNames, document.id);

    await setDocumentProcessingState(documentRef, {
      processing_stage: 'compiling_articles',
    });

    let articleCount = 0;
    try {
      const articleTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Article compilation timed out after 400s')), 400_000),
      );
      const articleCompilation = await Promise.race([
        compileAndStoreWikiArticles({
          userId: document.user_id,
          atlasId,
          documentId: document.id,
          filename: extraction.title ?? document.filename ?? 'Untitled',
          blocks,
        }),
        articleTimeout,
      ]);
      await addDocumentAiUsage(documentRef, articleCompilation.usage, 'compile');
      articleCount = articleCompilation.articleIds.length;
    } catch (articleError) {
      logger.error('Wiki article compilation failed, continuing with knowledge entries only', {
        documentId: document.id,
        error: articleError instanceof Error ? articleError.message : String(articleError),
        stack: articleError instanceof Error ? articleError.stack : undefined,
      });
    }

    await documentRef.set(
      {
        status: 'indexed',
        processing_stage: 'indexed',
        processed_chunks: chunks.length,
        total_chunks: chunks.length,
        page_count: Math.max(...blocks.map((block) => block.page)),
        wiki_pages_generated: articleCount || new Set(entries.map((entry) => entry.topic)).size,
        citation_count: entries.length,
        indexed_at: FieldValue.serverTimestamp(),
        last_heartbeat_at: FieldValue.serverTimestamp(),
        error_message: null,
        failure_code: null,
        title: extraction.title ?? document.title ?? null,
      },
      { merge: true },
    );

    // Update atlas stats (best-effort, don't block on failure)
    if (atlasId) {
      void updateAtlasStats(document.user_id, atlasId).catch((err) =>
        logger.warn('Failed to update atlas stats', { atlasId, error: String(err) }),
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Document ingestion failed', { documentId: document.id, errorMessage, errorStack });
    await documentRef.set(
      {
        status: 'failed',
        processing_stage: 'failed',
        last_heartbeat_at: FieldValue.serverTimestamp(),
        error_message: error instanceof Error ? error.message : 'Unknown ingestion failure.',
        failure_code: classifyProcessingFailure(error),
      },
      { merge: true },
    );
    throw error;
  }
}

async function writeRawExtracts(
  documentId: string,
  userId: string,
  atlasId: string | null,
  blocks: ExtractBlock[],
): Promise<void> {
  const writeOperations = blocks.map((block) => ({
    ref: rawExtractsCollection.doc(
      makeExtractId(documentId, block.page, block.lineStart, block.lineEnd),
    ),
    data: {
      document_id: documentId,
      user_id: userId,
      atlas_id: atlasId,
      page: block.page,
      line_start: block.lineStart,
      line_end: block.lineEnd,
      text: block.text,
      created_at: FieldValue.serverTimestamp(),
    },
  }));

  await commitSetOperations(writeOperations);
}

async function buildKnowledgeEntries(
  documentId: string,
  userId: string,
  atlasId: string | null,
  blocks: ExtractBlock[],
  chunks: ExtractBlock[][],
  onChunkComplete?: (completed: number) => Promise<void> | void,
): Promise<{
  entries: Array<KnowledgeEntryRecord & { id: string }>;
  usage: ModelUsage;
}> {
  const blockMap = new Map(
    blocks.map((block) => [
      `${block.page}:${block.lineStart}:${block.lineEnd}`,
      block,
    ]),
  );
  let completed = 0;
  const compiledChunks = await parallelMapLimit(chunks, compileChunkConcurrency, async (chunk) => {
    const compiled = await compileKnowledgeEntries(chunk);
    completed += 1;
    await onChunkComplete?.(completed);
    return compiled;
  });
  const drafts = compiledChunks.flatMap((compiled) => compiled.entries);
  const usage = compiledChunks
    .map((compiled) => compiled.usage)
    .reduce((total, next) => mergeUsage(total, next), emptyModelUsage());

  const validated = drafts
    .map((draft) => {
      const key = `${draft.source.page}:${draft.source.line_start}:${draft.source.line_end}`;
      return blockMap.has(key) ? draft : null;
    });
  const dedupedDrafts = dedupeKnowledgeDrafts(compact(validated));

  return {
    entries: dedupedDrafts.map((draft) => ({
      id: generateId('entry'),
      claim: draft.claim,
      topic: normalizeTopicName(draft.topic),
      related_topics: normalizeRelatedTopics(draft.related_topics),
      document_id: documentId,
      user_id: userId,
      atlas_id: atlasId,
      source: draft.source,
      orphaned: false,
      created_at: FieldValue.serverTimestamp(),
      last_updated: FieldValue.serverTimestamp(),
    })),
    usage,
  };
}

async function writeKnowledgeEntries(
  entries: Array<KnowledgeEntryRecord & { id: string }>,
): Promise<void> {
  await commitSetOperations(
    entries.map((entry) => ({
      ref: knowledgeEntriesCollection.doc(entry.id),
      data: entry,
    })),
  );
}

async function upsertWikiTopics(
  userId: string,
  atlasId: string | null,
  documentId: string,
  entries: Array<KnowledgeEntryRecord & { id: string }>,
): Promise<string[]> {
  const topicMap = new Map<string, Array<KnowledgeEntryRecord & { id: string }>>();

  for (const entry of entries) {
    const existing = topicMap.get(entry.topic) ?? [];
    existing.push(entry);
    topicMap.set(entry.topic, existing);
  }

  const topicNames = Array.from(topicMap.keys());
  await Promise.all(
    topicNames.map(async (topicName) => {
      const topicEntries = topicMap.get(topicName) ?? [];
      const topicId = topicDocumentId(userId, topicName);
      const existingSnapshot = await wikiTopicsCollection.doc(topicId).get();
      const existing = existingSnapshot.exists ? existingSnapshot.data() : null;
      const existingPreviewEntries = normalizeTopicPreviewEntries(existing?.retrieval_entries, topicName);
      const retrievalEntries = selectRepresentativeEntries(
        [
          ...existingPreviewEntries,
          ...topicEntries.map((entry) => toTopicEntryPreview(entry)),
        ],
        maxTopicPreviewEntries,
      );

      await wikiTopicsCollection.doc(topicId).set(
        {
          name: topicName,
          summary:
            (typeof existing?.summary === 'string' && existing.summary.trim().length > 0
              ? existing.summary
              : ''),
          search_text: buildTopicSearchText({
            topicName,
            summary:
              (typeof existing?.summary === 'string' && existing.summary.trim().length > 0
                ? existing.summary
                : ''),
            claims: retrievalEntries.map((entry) => entry.claim),
            relatedTopics: retrievalEntries.flatMap((entry) => entry.related_topics ?? []),
          }),
          retrieval_entries: retrievalEntries,
          summary_status: 'pending',
          summary_error: null,
          entry_ids: dedupeStrings([
            ...(existing?.entry_ids ?? []),
            ...topicEntries.map((entry) => entry.id),
          ]),
          document_ids: dedupeStrings([...(existing?.document_ids ?? []), documentId]),
          user_id: userId,
          atlas_id: atlasId,
          last_updated: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }),
  );

  return topicNames;
}

export async function compileAndStoreWikiArticles(params: {
  userId: string;
  atlasId: string | null;
  documentId: string;
  filename: string;
  blocks: ExtractBlock[];
}): Promise<{ articleIds: string[]; usage: ModelUsage }> {
  const { userId, atlasId, documentId, filename, blocks } = params;

  let totalUsage = emptyModelUsage();
  const writtenArticleIds: string[] = [];

  // Always compile fresh articles from document chunks
  const articleChunks = chunkBlocksForArticles(blocks);
  logger.info('Compiling wiki articles from chunks', {
    documentId,
    totalBlocks: blocks.length,
    chunkCount: articleChunks.length,
    chunkSizes: articleChunks.map((c) => c.length),
  });

  // Process chunks in parallel batches of 4 to stay within the 540s function timeout
  const BATCH_SIZE = 4;
  for (let i = 0; i < articleChunks.length; i += BATCH_SIZE) {
    const batch = articleChunks.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((chunk) => compileWikiArticles({ blocks: chunk, filename })),
    );

    for (const result of batchResults) {
      if (result.status === 'rejected') {
        logger.warn('Chunk compilation failed, skipping', {
          documentId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
        continue;
      }

      const compileResult = result.value;
      totalUsage = mergeUsage(totalUsage, compileResult.usage);

      logger.info('Chunk compilation result', {
        documentId,
        articlesFromChunk: compileResult.articles.length,
        titles: compileResult.articles.map((a) => a.title),
      });

      for (const article of compileResult.articles) {
        const articleId = await writeWikiArticle(userId, atlasId, documentId, filename, article);
        writtenArticleIds.push(articleId);
      }
    }
  }

  // Skip cross-document merge for now — each document gets its own articles.
  // Merge is too expensive with many existing articles and risks timeouts.

  await rebuildWikiIndex(userId, atlasId);

  logger.info('Wiki article compilation completed', {
    userId,
    documentId,
    articlesWritten: writtenArticleIds.length,
  });

  return { articleIds: writtenArticleIds, usage: totalUsage };
}

async function writeWikiArticle(
  userId: string,
  atlasId: string | null,
  documentId: string,
  filename: string,
  article: WikiArticleDraft,
): Promise<string> {
  const articleId = generateId('article');
  const sourceDoc: WikiArticleSource = {
    document_id: documentId,
    filename,
    pages: article.source_pages
      .filter((sp) => sp.filename === filename)
      .map((sp) => sp.page),
  };

  await wikiArticlesCollection.doc(articleId).set({
    user_id: userId,
    atlas_id: atlasId,
    title: article.title,
    content: article.content,
    summary: article.summary,
    source_documents: [sourceDoc],
    related_articles: article.related_articles,
    word_count: countWords(article.content),
    created_at: FieldValue.serverTimestamp(),
    last_updated: FieldValue.serverTimestamp(),
  } satisfies WikiArticleRecord);

  return articleId;
}

async function loadWikiIndex(
  userId: string,
  atlasId: string | null,
): Promise<{ entries: WikiIndexEntry[] } | null> {
  const indexId = wikiIndexDocumentId(userId, atlasId);
  const snapshot = await wikiIndexCollection.doc(indexId).get();
  if (!snapshot.exists) {
    return null;
  }
  const data = snapshot.data();
  return {
    entries: Array.isArray(data?.entries) ? data.entries : [],
  };
}

function chunkBlocksForArticles(blocks: ExtractBlock[]): ExtractBlock[][] {
  const maxBlocksPerChunk = 80;
  const maxCharsPerChunk = 32000;
  const chunks: ExtractBlock[][] = [];
  let current: ExtractBlock[] = [];
  let currentChars = 0;

  for (const block of blocks) {
    if (current.length >= maxBlocksPerChunk || currentChars + block.text.length > maxCharsPerChunk) {
      if (current.length > 0) {
        chunks.push(current);
      }
      current = [];
      currentChars = 0;
    }
    current.push(block);
    currentChars += block.text.length;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

async function rebuildWikiIndex(userId: string, atlasId: string | null): Promise<void> {
  let snapshot;
  try {
    snapshot = await wikiArticlesCollection
      .where('user_id', '==', userId)
      .orderBy('last_updated', 'desc')
      .limit(200)
      .get();
  } catch (error) {
    logger.warn('rebuildWikiIndex: query failed, attempting without orderBy', {
      error: error instanceof Error ? error.message : String(error),
    });
    snapshot = await wikiArticlesCollection
      .where('user_id', '==', userId)
      .limit(200)
      .get();
  }

  const entries: WikiIndexEntry[] = snapshot.docs.map((doc) => {
    const data = doc.data() as WikiArticleRecord;
    return {
      article_id: doc.id,
      title: data.title,
      summary: data.summary,
      document_ids: (data.source_documents ?? []).map((sd) => sd.document_id),
    };
  });

  const indexId = wikiIndexDocumentId(userId, atlasId);
  await wikiIndexCollection.doc(indexId).set({
    user_id: userId,
    atlas_id: atlasId,
    entries,
    last_updated: FieldValue.serverTimestamp(),
  });
}

function wikiIndexDocumentId(userId: string, atlasId: string | null): string {
  return atlasId ? `${userId}__${atlasId}` : `${userId}__personal`;
}

function dedupeArticleSources(sources: WikiArticleSource[]): WikiArticleSource[] {
  const byDocId = new Map<string, WikiArticleSource>();
  for (const source of sources) {
    const existing = byDocId.get(source.document_id);
    if (existing) {
      existing.pages = [...new Set([...existing.pages, ...source.pages])].sort((a, b) => a - b);
      existing.filename = source.filename || existing.filename;
    } else {
      byDocId.set(source.document_id, { ...source, pages: [...source.pages] });
    }
  }
  return Array.from(byDocId.values());
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

async function countCollectionForAtlas(
  collectionName: string,
  userId: string,
  atlasId: string,
): Promise<number> {
  const snapshot = await db
    .collection(collectionName)
    .where('user_id', '==', userId)
    .where('atlas_id', '==', atlasId)
    .count()
    .get();
  return snapshot.data().count;
}

const maxPersonaPromptChars = 8000;

async function loadAtlasChatContext(atlasId: string | null): Promise<{
  personaPrompt: string | null;
  atlasName: string | null;
  cityHint: string | null;
}> {
  if (!atlasId) {
    return { personaPrompt: null, atlasName: null, cityHint: null };
  }

  try {
    const snapshot = await atlasesCollection.doc(atlasId).get();
    if (!snapshot.exists) {
      return { personaPrompt: null, atlasName: null, cityHint: null };
    }

    const data = snapshot.data() as {
      name?: unknown;
      persona_prompt?: unknown;
      chat_guide?: unknown;
      city_config?: {
        city_name?: unknown;
        region_name?: unknown;
        country_code?: unknown;
      } | null;
    } | undefined;
    const raw = typeof data?.persona_prompt === 'string' ? data.persona_prompt.trim() : '';
    const guide = data?.chat_guide && typeof data.chat_guide === 'object'
      ? data.chat_guide as Record<string, unknown>
      : null;
    const guideName = typeof guide?.name === 'string' ? guide.name.trim() : '';
    const guideLabel = typeof guide?.label === 'string' ? guide.label.trim() : '';
    const guidePrompt = guideName
      ? [
        `You are responding as ${guideName}, ${guideLabel || 'the My living wiki guide'} for this wiki.`,
        'Let that guide identity shape the voice, warmth, framing, and local color of every answer.',
        'Stay accurate, grounded, and modern; do not fabricate personal memories, citations, dates, or facts.',
      ].join(' ')
      : '';
    const combined = [guidePrompt, raw].filter(Boolean).join('\n\n');
    const personaPrompt = combined
      ? combined.length > maxPersonaPromptChars
        ? combined.slice(0, maxPersonaPromptChars)
        : combined
      : null;
    const cityConfig = data?.city_config;
    const cityParts = [
      typeof cityConfig?.city_name === 'string' ? cityConfig.city_name.trim() : '',
      typeof cityConfig?.region_name === 'string' ? cityConfig.region_name.trim() : '',
      typeof cityConfig?.country_code === 'string' ? cityConfig.country_code.trim() : '',
    ].filter(Boolean);

    return {
      personaPrompt,
      atlasName: typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : null,
      cityHint: cityParts.length > 0 ? cityParts.join(', ') : null,
    };
  } catch (error) {
    logger.warn('Failed to load atlas chat context.', {
      atlasId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { personaPrompt: null, atlasName: null, cityHint: null };
  }
}

function buildTravelGuideResponse(params: {
  question: string;
  answer: string;
  atlasName: string | null;
  cityHint: string | null;
  mappableLocations: MappableLocation[];
}): TravelGuideStructuredResponse | null {
  const locations = dedupeMappableLocations([
    ...params.mappableLocations,
    ...extractTravelLocationCandidates(params.answer, params.cityHint || params.atlasName),
  ]).slice(0, 5);
  const travelIntent = hasTravelGuideIntent(params.question) || hasPlaceRecommendationAnswer(params.answer, locations.length);
  if (locations.length === 0 || !travelIntent) {
    return null;
  }

  const cityLabel = params.cityHint || params.atlasName || 'this wiki';
  const cards = locations.map((location, index) => {
    const sentence = findSentenceMentioning(params.answer, location.name);
    const description = cleanTravelCardText(sentence || `A useful stop to consider for this ${cityLabel} answer.`);
    const bestFor = inferBestFor(params.question, description);
    const localTip = buildLocalTip(params.question);

    return {
      id: `guide-${index + 1}-${slugifyForId(location.name)}`,
      title: location.name,
      subtitle: location.address_hint || inferNeighborhood(description) || cityLabel,
      description: compactSentence(description, 220),
      neighborhood: inferNeighborhood(description),
      best_for: bestFor,
      vibe: inferVibe(params.question, description),
      local_tip: localTip,
      cost: inferCost(params.question, description),
      time_hint: inferTimeHint(params.question, description),
      image_url: null,
      map_query: location.search_query || [location.name, params.cityHint].filter(Boolean).join(' '),
      source_url: null,
    };
  });

  return {
    title: params.atlasName ? `${params.atlasName} guide picks` : 'Guide picks',
    summary: buildTravelSummary(params.question, params.answer, cityLabel),
    cards,
    route: buildRouteHint(cards.map((card) => card.title)),
    next_actions: [
      'Open the map before you go',
      'Ask for a two-hour version',
      'Ask for food stops nearby',
    ],
  };
}

function buildFastAnswerPresentation(params: {
  question: string;
  answer: string;
  atlasName: string | null;
  cityHint: string | null;
}): {
  mappableLocations: MappableLocation[];
  travelGuide: TravelGuideStructuredResponse | null;
} {
  const localLocations = dedupeMappableLocations(
    extractTravelLocationCandidates(params.answer, params.cityHint || params.atlasName),
  ).slice(0, 6);

  const travelGuide = buildTravelGuideResponse({
    question: params.question,
    answer: params.answer,
    atlasName: params.atlasName,
    cityHint: params.cityHint,
    mappableLocations: localLocations,
  });

  if (!travelGuide) {
    return {
      mappableLocations: [],
      travelGuide: null,
    };
  }

  const cardLocations = travelGuide.cards.map((card) => ({
    name: card.title,
    search_query: card.map_query || [card.title, params.cityHint].filter(Boolean).join(' '),
    address_hint: card.neighborhood || card.subtitle || null,
  }));

  return {
    mappableLocations: dedupeMappableLocations([...localLocations, ...cardLocations]).slice(0, 6),
    travelGuide,
  };
}

function dedupeMappableLocations(locations: MappableLocation[]): MappableLocation[] {
  const deduped = new Map<string, MappableLocation>();
  for (const location of locations) {
    const name = location.name?.trim();
    const searchQuery = location.search_query?.trim();
    if (!name || !searchQuery) {
      continue;
    }
    const key = `${name.toLowerCase()}::${searchQuery.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, {
        name,
        search_query: searchQuery,
        address_hint: location.address_hint?.trim() || null,
      });
    }
  }
  return Array.from(deduped.values());
}

function extractTravelLocationCandidates(answer: string, cityHint: string | null): MappableLocation[] {
  const candidates: string[] = [];
  const boldPattern = /\*\*([^*]{3,90})\*\*/g;
  let boldMatch: RegExpExecArray | null;

  while ((boldMatch = boldPattern.exec(answer)) !== null) {
    const cleaned = normalizeCandidatePlaceName(boldMatch[1]);
    if (cleaned && looksLikePlaceName(cleaned)) {
      candidates.push(cleaned);
    }
  }

  const headingPattern = /^\s*(?:\d+\.\s+|[-*]\s+)?(?:#+\s*)?(.{4,110})$/gm;
  let headingMatch: RegExpExecArray | null;

  while ((headingMatch = headingPattern.exec(answer)) !== null) {
    const rawLine = headingMatch[1].trim();
    if (!/^\*\*.+\*\*/.test(rawLine) && !/^\d+\./.test(headingMatch[0])) {
      continue;
    }
    const cleaned = normalizeCandidatePlaceName(rawLine.replace(/\*\*/g, ''));
    if (cleaned && looksLikePlaceName(cleaned)) {
      candidates.push(cleaned);
    }
  }

  return dedupeStrings(candidates)
    .slice(0, 8)
    .map((name) => ({
      name,
      search_query: [name, cityHint].filter(Boolean).join(' '),
      address_hint: null,
    }));
}

function normalizeCandidatePlaceName(value: string): string | null {
  let cleaned = value
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^[\d.)\s-]+/, '')
    .replace(/^(kick-?off at|start at|stop at|head to|visit|the sight|the spot|the taste)\s+/i, '')
    .replace(/^(the flag's first home|a true philly bite|my humble abode)\s*[–-]\s*/i, '')
    .replace(/\s+[–-]\s+.*$/, '')
    .replace(/:\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.includes(' & ')) {
    cleaned = cleaned.split(' & ')[0].trim();
  }
  if (cleaned.includes(' and ') && cleaned.length > 42) {
    cleaned = cleaned.split(/\s+and\s+/i)[0].trim();
  }

  if (!cleaned || cleaned.length < 3 || cleaned.length > 80 || isGuideLabel(cleaned)) {
    return null;
  }
  return cleaned;
}

function looksLikePlaceName(value: string): boolean {
  if (isGuideLabel(value)) {
    return false;
  }
  const lower = value.toLowerCase();
  if (/\b(approx|minutes|hours|why it matters|local angle|good first move|best for|cost|vibe|nearby|the big picture)\b/.test(lower)) {
    return false;
  }
  if (/\b(hall|bell|house|museum|market|park|ground|grounds|church|restaurant|cafe|coffee|bar|bourse|square|street|avenue|terminal|center|centre|garden|trail|bridge|station|library|theater|theatre|hotel|pier|waterfront|zoo)\b/i.test(value)) {
    return true;
  }
  return /^[A-Z][A-Za-z0-9'&. ]{2,}$/.test(value) && value.split(/\s+/).length <= 6;
}

function isGuideLabel(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return [
    'the big picture',
    'why it matters',
    'local angle',
    'good first move',
    'the sight',
    'the spot',
    'the taste',
    'cost/vibe',
    'nearby',
    'your next move',
  ].includes(normalized);
}

function hasTravelGuideIntent(question: string): boolean {
  return /\b(visit|trip|travel|tour|tourist|guide|itinerary|walk|walking|weekend|things to do|where should|where to|place|places|spot|spots|recommend|recommendation|recommendations|best places|best spots|eat|food|drink|restaurant|bar|cafe|coffee|brunch|lunch|dinner|breakfast|bakery|deli|market|cheesesteak|cheesesteaks|cheesestake|cheesestakes|hoagie|hoagies|pizza|taco|tacos|ramen|sushi|sandwich|sandwiches|museum|park|neighborhood|nearby|route|hotel|stay|date|family|kids|history|historic|venue|venues|landmark|landmarks|attraction|attractions)\b/i.test(question);
}

function hasPlaceRecommendationAnswer(answer: string, locationCount: number): boolean {
  if (locationCount < 2) {
    return false;
  }
  return /\b(best for|local tip|vibe|what to know|where to go|prime spots|top contenders|places to|spots to|restaurant|bar|cafe|market|museum|park|hotel|venue|landmark|attraction|steaks|cheesesteak|hoagie|pizza)\b/i.test(answer);
}

function findSentenceMentioning(answer: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namePattern = new RegExp(escapedName, 'i');
  const markdownBlocks = answer
    .replace(/\r\n/g, '\n')
    .replace(/\s+(\d+\.\s+\*\*)/g, '\n$1')
    .replace(/\s+([-*+]\s+\*\*)/g, '\n$1')
    .replace(/\s+(\*\*[^*]{3,90}\*\*\s*(?:\([^)]*\))?:)/g, '\n$1')
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  const blockMatch = markdownBlocks.find((block) => namePattern.test(block) && !/^#{1,6}\s/i.test(block));
  if (blockMatch) {
    return blockMatch;
  }

  const sentences = answer
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const match = sentences.find((sentence) => namePattern.test(sentence));
  return match ?? null;
}

function compactSentence(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 1).trim()}...`;
}

function cleanTravelCardText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*#{1,6}\s*[^*#]+(?=\s+[-*+]\s+\*\*)/g, ' ')
    .replace(/(^|\s)#{1,6}\s*/g, '$1')
    .replace(/(^|\s)[*_]{1,3}([^*_]+)[*_]{1,3}(?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/(^|\s)[-*+]\s+(?=\S)/g, '$1')
    .replace(/[*_]{1,3}/g, '')
    .replace(/\s+\*\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferBestFor(question: string, description: string): string | null {
  const source = `${question} ${description}`.toLowerCase();
  if (/\b(kid|kids|family|families)\b/.test(source)) return 'Families';
  if (/\b(date|romantic|couple)\b/.test(source)) return 'Date plans';
  if (/\b(food|eat|restaurant|lunch|dinner|breakfast|brunch|cheesesteak|cheesestake|hoagie|pizza|taco|sandwich|bakery|deli)\b/.test(source)) return 'Food stops';
  if (/\b(history|historic|museum|founding|old city)\b/.test(source)) return 'History lovers';
  if (/\b(walk|walking|route|itinerary)\b/.test(source)) return 'Easy routing';
  if (/\b(photo|view|scenic)\b/.test(source)) return 'Photos and views';
  return 'A focused local stop';
}

function inferVibe(question: string, description: string): string | null {
  const source = `${question} ${description}`.toLowerCase();
  if (/\b(chill|relax|quiet|calm)\b/.test(source)) return 'Relaxed';
  if (/\b(lively|nightlife|bar|music|busy)\b/.test(source)) return 'Lively';
  if (/\b(classic|historic|old|heritage)\b/.test(source)) return 'Classic';
  if (/\b(fancy|upscale|special)\b/.test(source)) return 'Polished';
  if (/\b(kid|family|park)\b/.test(source)) return 'Easygoing';
  return null;
}

function inferCost(question: string, description: string): string | null {
  const source = `${question} ${description}`.toLowerCase();
  if (/\b(free|no cost)\b/.test(source)) return 'Often free';
  if (/\b(cheap|budget|affordable)\b/.test(source)) return 'Budget-friendly';
  if (/\b(fancy|upscale|splurge|expensive)\b/.test(source)) return 'Splurge';
  return null;
}

function inferTimeHint(question: string, description: string): string | null {
  const source = `${question} ${description}`.toLowerCase();
  if (/\b(morning|breakfast|coffee)\b/.test(source)) return 'Good earlier in the day';
  if (/\b(lunch|afternoon)\b/.test(source)) return 'Good midday';
  if (/\b(dinner|evening|night|bar)\b/.test(source)) return 'Best later in the day';
  if (/\b(two-hour|2-hour|quick|short)\b/.test(source)) return 'Works for a short stop';
  return null;
}

function inferNeighborhood(description: string): string | null {
  const neighborhoods = [
    'Center City',
    'Old City',
    'Rittenhouse',
    'Fishtown',
    'Northern Liberties',
    'University City',
    'South Philly',
    'Passyunk',
    'Fairmount',
    'Manayunk',
    'Chestnut Hill',
    'Queen Village',
    'Society Hill',
    'Kensington',
    'West Philly',
  ];
  const lower = description.toLowerCase();
  return neighborhoods.find((neighborhood) => lower.includes(neighborhood.toLowerCase())) ?? null;
}

function buildLocalTip(question: string): string {
  if (/\b(food|eat|restaurant|bar|cafe|coffee|brunch|lunch|dinner|breakfast|cheesesteak|cheesestake|hoagie|pizza|taco|sandwich|bakery|deli)\b/i.test(question)) {
    return 'Check hours and reservation rules before you head over.';
  }
  if (/\b(walk|route|itinerary)\b/i.test(question)) {
    return 'Use the map link to group nearby stops before committing to the route.';
  }
  return 'Confirm hours and transit timing before you go.';
}

function buildTravelSummary(question: string, answer: string, cityLabel: string): string {
  const firstSentence = answer
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .find(Boolean);
  if (firstSentence) {
    return compactSentence(firstSentence, 180);
  }
  return `A focused ${cityLabel} guide view based on your question: ${compactSentence(question, 120)}`;
}

function buildRouteHint(titles: string[]): string | null {
  if (titles.length < 2) {
    return null;
  }
  const visible = titles.slice(0, 3);
  return `Start with ${visible[0]}, then compare ${visible.slice(1).join(' and ')} on the map so the day does not turn into a scenic detour disguised as planning.`;
}

function slugifyForId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'stop';
}

async function updateAtlasStats(userId: string, atlasId: string): Promise<void> {
  const [documents, knowledgeEntries, wikiTopics, wikiArticles, chatThreads] = await Promise.all([
    countCollectionForAtlas('documents', userId, atlasId),
    countCollectionForAtlas('knowledge_entries', userId, atlasId),
    countCollectionForAtlas('wiki_topics', userId, atlasId),
    countCollectionForAtlas('wiki_articles', userId, atlasId),
    countCollectionForAtlas('chat_threads', userId, atlasId),
  ]);

  await atlasesCollection.doc(atlasId).set(
    {
      stats: {
        documents,
        knowledge_entries: knowledgeEntries,
        wiki_topics: wikiTopics,
        wiki_articles: wikiArticles,
        chat_threads: chatThreads,
      },
    },
    { merge: true },
  );
}

export async function runAtlasQuery(params: {
  userId: string;
  atlasId: string | null;
  question: string;
  answerMode?: 'wiki' | 'internet';
  topicIds?: string[];
  threadId?: string | null;
  scopeTopicName?: string | null;
}): Promise<{
  answer: string;
  citedEntryIds: string[];
  citedPassages: QueryCitationSnapshot[];
  mappableLocations: MappableLocation[];
  travelGuide: TravelGuideStructuredResponse | null;
  scopedTopicIds: string[];
  knowledgeGap: boolean;
  threadId: string;
}> {
  const timer = createChatQueryTimer();
  const trimmedQuestion = params.question.trim();
  if (!trimmedQuestion) {
    throw new Error('Question is required.');
  }

  const broadQuestion = isBroadSynthesisQuestion(trimmedQuestion);
  const [thread, atlasChatContext] = await Promise.all([
    ensureActiveChatThread(params.userId, params.atlasId, params.threadId ?? null, trimmedQuestion),
    loadAtlasChatContext(params.atlasId),
  ]);
  timer.mark('thread_and_context_ms');
  const threadHistory = thread.reusedExisting
    ? await loadRecentChatThreadMessages(thread.id, maxHistoryMessagesForAnswer)
    : [];
  timer.mark('history_ms');

  if (params.answerMode === 'internet') {
    const response = await answerWithGoogleSearch({
      question: trimmedQuestion,
      history: threadHistory.map((message) => ({ role: message.role, text: message.text })),
      personaPrompt: atlasChatContext.personaPrompt,
    });
    timer.mark('internet_model_ms');
    const { mappableLocations, travelGuide } = buildFastAnswerPresentation({
      question: trimmedQuestion,
      answer: response.answer,
      atlasName: atlasChatContext.atlasName,
      cityHint: atlasChatContext.cityHint,
    });
    timer.mark('presentation_ms');

    await recordChatThreadExchange({
      threadId: thread.id,
      userId: params.userId,
      atlasId: params.atlasId,
      answerMode: 'internet',
      question: trimmedQuestion,
      answer: response.answer,
      citedPassages: [],
      mappableLocations,
      travelGuide,
      knowledgeGap: false,
      questionCountIncrement: 1,
    });
    timer.mark('record_ms');
    logger.info('Atlas query timing', {
      answerMode: 'internet',
      source: 'internet',
      totalMs: timer.totalMs(),
      ...timer.snapshot(),
    });

    return {
      answer: response.answer,
      citedEntryIds: [],
      citedPassages: [],
      mappableLocations,
      travelGuide,
      scopedTopicIds: [],
      knowledgeGap: false,
      threadId: thread.id,
    };
  }

  const articleResult = await tryAnswerFromArticles({
    userId: params.userId,
    atlasId: params.atlasId,
    question: trimmedQuestion,
    broadQuestion,
    history: threadHistory.map((message) => ({ role: message.role, text: message.text })),
    personaPrompt: atlasChatContext.personaPrompt,
  });
  timer.mark('article_attempt_ms');

  if (articleResult) {
    const { mappableLocations, travelGuide } = buildFastAnswerPresentation({
      question: trimmedQuestion,
      answer: articleResult.answer,
      atlasName: atlasChatContext.atlasName,
      cityHint: atlasChatContext.cityHint,
    });
    timer.mark('presentation_ms');

    logger.info('Atlas query answered from wiki articles', {
      userId: params.userId,
      articleCount: articleResult.articleIds.length,
    });

    await recordChatThreadExchange({
      threadId: thread.id,
      userId: params.userId,
      atlasId: params.atlasId,
      answerMode: 'wiki',
      question: trimmedQuestion,
      answer: articleResult.answer,
      citedPassages: articleResult.citedPassages,
      mappableLocations,
      travelGuide,
      knowledgeGap: articleResult.knowledgeGap,
      questionCountIncrement: 1,
    });
    timer.mark('record_ms');
    logger.info('Atlas query timing', {
      answerMode: 'wiki',
      source: 'articles',
      totalMs: timer.totalMs(),
      ...timer.snapshot(),
    });

    return {
      answer: articleResult.answer,
      citedEntryIds: articleResult.articleIds,
      citedPassages: articleResult.citedPassages,
      mappableLocations,
      travelGuide,
      scopedTopicIds: [],
      knowledgeGap: articleResult.knowledgeGap,
      threadId: thread.id,
    };
  }

  const topics = await loadCandidateTopics(params.userId, trimmedQuestion, params.topicIds, broadQuestion);
  timer.mark('topic_retrieval_ms');
  const tokens = tokenize(trimmedQuestion);
  const entryLimit = broadQuestion ? broadQuestionMaxAnswerEntries : maxAnswerEntries;
  const minEntries = broadQuestion ? broadQuestionMinAnswerEntries : minAnswerEntries;
  const previewEntries = dedupeById(
    topics.flatMap((topic) => topic.retrieval_entries ?? []),
  );
  const previewRankedEntries = rankEntriesForQuestion(previewEntries, tokens).slice(0, entryLimit);

  let uniqueEntries = previewRankedEntries;

  if (uniqueEntries.length < minEntries || shouldFetchAdditionalEntries(uniqueEntries, tokens, broadQuestion)) {
    const fallbackEntryIds = topics.flatMap((topic) => topic.entry_ids)
      .filter((entryId) => !uniqueEntries.some((entry) => entry.id === entryId))
      .slice(0, broadQuestion ? 72 : 36);

    if (fallbackEntryIds.length > 0) {
      const entrySnapshots = await Promise.all(
        fallbackEntryIds.map((entryId) => knowledgeEntriesCollection.doc(entryId).get()),
      );

      const fetchedEntries = compact(
        entrySnapshots.map((snapshot) =>
          snapshot.exists
            ? {
                id: snapshot.id,
                ...(snapshot.data() as Omit<KnowledgeEntryRecord, 'created_at' | 'last_updated'>),
              }
            : null,
        ),
      );

      uniqueEntries = rankEntriesForQuestion(
        dedupeById([...uniqueEntries, ...fetchedEntries]),
        tokens,
      ).slice(0, entryLimit);
    }
  }
  timer.mark('entry_retrieval_ms');

  if (uniqueEntries.length === 0) {
    const response = await answerWithGoogleSearch({
      question: trimmedQuestion,
      history: threadHistory.map((message) => ({ role: message.role, text: message.text })),
      personaPrompt: atlasChatContext.personaPrompt,
    });
    timer.mark('internet_fallback_model_ms');
    const { mappableLocations, travelGuide } = buildFastAnswerPresentation({
      question: trimmedQuestion,
      answer: response.answer,
      atlasName: atlasChatContext.atlasName,
      cityHint: atlasChatContext.cityHint,
    });
    timer.mark('presentation_ms');

    await recordChatThreadExchange({
      threadId: thread.id,
      userId: params.userId,
      atlasId: params.atlasId,
      answerMode: 'internet',
      question: trimmedQuestion,
      answer: response.answer,
      citedPassages: [],
      mappableLocations,
      travelGuide,
      knowledgeGap: false,
      questionCountIncrement: 1,
    });
    timer.mark('record_ms');
    logger.info('Atlas query timing', {
      answerMode: 'internet',
      source: 'wiki_gap_internet_fallback',
      totalMs: timer.totalMs(),
      ...timer.snapshot(),
    });

    return {
      answer: response.answer,
      citedEntryIds: [],
      citedPassages: [],
      mappableLocations,
      travelGuide,
      scopedTopicIds: topics.map((topic) => topic.id),
      knowledgeGap: false,
      threadId: thread.id,
    };
  }

  logger.info('Atlas query falling back to knowledge entries', {
    userId: params.userId,
    topicCount: topics.length,
    previewEntryCount: previewEntries.length,
    answerEntryCount: uniqueEntries.length,
  });

  const response = await answerQuestion({
    question: trimmedQuestion,
    history: threadHistory.map((message) => ({ role: message.role, text: message.text })),
    entries: uniqueEntries.map((entry) => ({
      id: entry.id,
      claim: entry.claim,
      topic: entry.topic,
      source: entry.source,
    })),
    personaPrompt: atlasChatContext.personaPrompt,
  });
  timer.mark('knowledge_model_ms');

  const citedEntryIds = (Array.isArray(response.cited_entry_ids) ? response.cited_entry_ids : []).filter((entryId) =>
    uniqueEntries.some((entry) => entry.id === entryId),
  );
  const citedPassages = await hydrateCitationSnapshots(params.userId, uniqueEntries, citedEntryIds);
  timer.mark('citation_hydration_ms');
  const safeAnswer =
    typeof response.answer === 'string' && response.answer.trim().length > 0
      ? response.answer.trim()
      : 'I could not generate a reliable answer for this question from the current knowledge base.';
  const knowledgeGap = typeof response.knowledge_gap === 'boolean' ? response.knowledge_gap : citedEntryIds.length === 0;

  if (knowledgeGap || citedEntryIds.length === 0) {
    const fallbackResponse = await answerWithGoogleSearch({
      question: trimmedQuestion,
      history: threadHistory.map((message) => ({ role: message.role, text: message.text })),
      personaPrompt: atlasChatContext.personaPrompt,
    });
    timer.mark('internet_fallback_model_ms');
    const { mappableLocations, travelGuide } = buildFastAnswerPresentation({
      question: trimmedQuestion,
      answer: fallbackResponse.answer,
      atlasName: atlasChatContext.atlasName,
      cityHint: atlasChatContext.cityHint,
    });
    timer.mark('presentation_ms');

    await recordChatThreadExchange({
      threadId: thread.id,
      userId: params.userId,
      atlasId: params.atlasId,
      answerMode: 'internet',
      question: trimmedQuestion,
      answer: fallbackResponse.answer,
      citedPassages: [],
      mappableLocations,
      travelGuide,
      knowledgeGap: false,
      questionCountIncrement: 1,
    });
    timer.mark('record_ms');
    logger.info('Atlas query timing', {
      answerMode: 'internet',
      source: 'wiki_uncited_internet_fallback',
      totalMs: timer.totalMs(),
      ...timer.snapshot(),
    });

    return {
      answer: fallbackResponse.answer,
      citedEntryIds: [],
      citedPassages: [],
      mappableLocations,
      travelGuide,
      scopedTopicIds: topics.map((topic) => topic.id),
      knowledgeGap: false,
      threadId: thread.id,
    };
  }
  const { mappableLocations, travelGuide } = buildFastAnswerPresentation({
    question: trimmedQuestion,
    answer: safeAnswer,
    atlasName: atlasChatContext.atlasName,
    cityHint: atlasChatContext.cityHint,
  });
  timer.mark('presentation_ms');

  await recordChatThreadExchange({
    threadId: thread.id,
    userId: params.userId,
    atlasId: params.atlasId,
    answerMode: 'wiki',
    question: trimmedQuestion,
    answer: safeAnswer,
    citedPassages,
    mappableLocations,
    travelGuide,
    knowledgeGap,
    questionCountIncrement: 1,
  });
  timer.mark('record_ms');
  logger.info('Atlas query timing', {
    answerMode: 'wiki',
    source: 'knowledge_entries',
    totalMs: timer.totalMs(),
    ...timer.snapshot(),
  });

  return {
    answer: safeAnswer,
    citedEntryIds,
    citedPassages,
    mappableLocations,
    travelGuide,
    scopedTopicIds: topics.map((topic) => topic.id),
    knowledgeGap: knowledgeGap,
    threadId: thread.id,
  };
}

export async function runAtlasInternetStream(params: {
  userId: string;
  atlasId: string | null;
  question: string;
  threadId?: string | null;
  onDelta: (delta: string) => void | Promise<void>;
}): Promise<{
  answer: string;
  citedEntryIds: string[];
  citedPassages: QueryCitationSnapshot[];
  mappableLocations: MappableLocation[];
  travelGuide: TravelGuideStructuredResponse | null;
  scopedTopicIds: string[];
  knowledgeGap: boolean;
  threadId: string;
}> {
  const timer = createChatQueryTimer();
  const trimmedQuestion = params.question.trim();
  if (!trimmedQuestion) {
    throw new Error('Question is required.');
  }

  const [thread, atlasChatContext] = await Promise.all([
    ensureActiveChatThread(params.userId, params.atlasId, params.threadId ?? null, trimmedQuestion),
    loadAtlasChatContext(params.atlasId),
  ]);
  timer.mark('thread_and_context_ms');
  const threadHistory = thread.reusedExisting
    ? await loadRecentChatThreadMessages(thread.id, maxHistoryMessagesForAnswer)
    : [];
  timer.mark('history_ms');

  const response = await streamAnswerWithGoogleSearch({
    question: trimmedQuestion,
    history: threadHistory.map((message) => ({ role: message.role, text: message.text })),
    personaPrompt: atlasChatContext.personaPrompt,
    onDelta: params.onDelta,
  });
  timer.mark('internet_model_stream_ms');

  const { mappableLocations, travelGuide } = buildFastAnswerPresentation({
    question: trimmedQuestion,
    answer: response.answer,
    atlasName: atlasChatContext.atlasName,
    cityHint: atlasChatContext.cityHint,
  });
  timer.mark('presentation_ms');

  await recordChatThreadExchange({
    threadId: thread.id,
    userId: params.userId,
    atlasId: params.atlasId,
    answerMode: 'internet',
    question: trimmedQuestion,
    answer: response.answer,
    citedPassages: [],
    mappableLocations,
    travelGuide,
    knowledgeGap: false,
    questionCountIncrement: 1,
  });
  timer.mark('record_ms');
  logger.info('Atlas query streaming timing', {
    answerMode: 'internet',
    source: 'internet',
    totalMs: timer.totalMs(),
    ...timer.snapshot(),
  });

  return {
    answer: response.answer,
    citedEntryIds: [],
    citedPassages: [],
    mappableLocations,
    travelGuide,
    scopedTopicIds: [],
    knowledgeGap: false,
    threadId: thread.id,
  };
}

export async function runPublicAtlasQuery(params: {
  atlasId: string;
  atlasOwnerUserId: string;
  question: string;
  answerMode?: 'wiki' | 'internet';
  topicIds?: string[];
  threadId?: string | null;
  anonymousQuestionLimit?: number | null;
  visitor: PublicChatVisitorContext;
}): Promise<{
  blocked: boolean;
  answer: string;
  citedEntryIds: string[];
  citedPassages: QueryCitationSnapshot[];
  mappableLocations: MappableLocation[];
  travelGuide: TravelGuideStructuredResponse | null;
  scopedTopicIds: string[];
  knowledgeGap: boolean;
  threadId: string | null;
  questionCount: number;
  questionLimit: number | null;
  remainingQuestions: number | null;
  requiresSignIn: boolean;
}> {
  const timer = createChatQueryTimer();
  const trimmedQuestion = params.question.trim();
  if (!trimmedQuestion) {
    throw new Error('Question is required.');
  }

  const thread = await ensureActivePublicChatThread({
    atlasId: params.atlasId,
    atlasOwnerUserId: params.atlasOwnerUserId,
    threadId: params.threadId ?? null,
    seedQuestion: trimmedQuestion,
    visitor: params.visitor,
  });
  timer.mark('thread_ms');

  const questionLimit =
    typeof params.anonymousQuestionLimit !== 'undefined'
      ? params.anonymousQuestionLimit
      : params.visitor.kind === 'anonymous' ? maxAnonymousPublicQuestions : null;
  const questionCountBeforeAsk = thread.questionCount;

  if (questionLimit !== null && questionCountBeforeAsk >= questionLimit) {
    logger.info('Public atlas query timing', {
      answerMode: params.answerMode === 'internet' ? 'internet' : 'wiki',
      source: 'question_limit',
      totalMs: timer.totalMs(),
      ...timer.snapshot(),
    });
    return {
      blocked: true,
      answer: '',
      citedEntryIds: [],
      citedPassages: [],
      mappableLocations: [],
      travelGuide: null,
      scopedTopicIds: [],
      knowledgeGap: false,
      threadId: thread.id,
      questionCount: questionCountBeforeAsk,
      questionLimit,
      remainingQuestions: 0,
      requiresSignIn: true,
    };
  }

  const broadQuestion = isBroadSynthesisQuestion(trimmedQuestion);
  const [threadHistory, atlasChatContext] = await Promise.all([
    thread.reusedExisting
      ? loadRecentPublicChatThreadMessages(thread.id, maxHistoryMessagesForAnswer)
      : Promise.resolve([] as Awaited<ReturnType<typeof loadRecentPublicChatThreadMessages>>),
    loadAtlasChatContext(params.atlasId),
  ]);
  timer.mark('history_and_context_ms');

  if (params.answerMode === 'internet') {
    const response = await answerWithGoogleSearch({
      question: trimmedQuestion,
      history: threadHistory.map((message) => ({ role: message.role, text: message.text })),
      personaPrompt: atlasChatContext.personaPrompt,
    });
    timer.mark('internet_model_ms');
    const { mappableLocations, travelGuide } = buildFastAnswerPresentation({
      question: trimmedQuestion,
      answer: response.answer,
      atlasName: atlasChatContext.atlasName,
      cityHint: atlasChatContext.cityHint,
    });
    timer.mark('presentation_ms');

    await recordPublicChatThreadExchange({
      threadId: thread.id,
      atlasId: params.atlasId,
      atlasOwnerUserId: params.atlasOwnerUserId,
      visitor: params.visitor,
      answerMode: 'internet',
      question: trimmedQuestion,
      answer: response.answer,
      citedPassages: [],
      mappableLocations,
      travelGuide,
      knowledgeGap: false,
      questionCountIncrement: 1,
    });
    timer.mark('record_ms');

    const questionCount = questionCountBeforeAsk + 1;
    const remainingQuestions =
      questionLimit === null ? null : Math.max(0, questionLimit - questionCount);
    logger.info('Public atlas query timing', {
      answerMode: 'internet',
      source: 'internet',
      totalMs: timer.totalMs(),
      ...timer.snapshot(),
    });

    return {
      blocked: false,
      answer: response.answer,
      citedEntryIds: [],
      citedPassages: [],
      mappableLocations,
      travelGuide,
      scopedTopicIds: [],
      knowledgeGap: false,
      threadId: thread.id,
      questionCount,
      questionLimit,
      remainingQuestions,
      requiresSignIn: questionLimit !== null && remainingQuestions !== null && remainingQuestions <= 0,
    };
  }

  const articleResult = await tryAnswerFromArticles({
    userId: params.atlasOwnerUserId,
    atlasId: params.atlasId,
    question: trimmedQuestion,
    broadQuestion,
    history: threadHistory.map((message) => ({ role: message.role, text: message.text })),
    personaPrompt: atlasChatContext.personaPrompt,
  });
  timer.mark('article_attempt_ms');

  if (articleResult) {
    const { mappableLocations, travelGuide } = buildFastAnswerPresentation({
      question: trimmedQuestion,
      answer: articleResult.answer,
      atlasName: atlasChatContext.atlasName,
      cityHint: atlasChatContext.cityHint,
    });
    timer.mark('presentation_ms');

    await recordPublicChatThreadExchange({
      threadId: thread.id,
      atlasId: params.atlasId,
      atlasOwnerUserId: params.atlasOwnerUserId,
      visitor: params.visitor,
      answerMode: 'wiki',
      question: trimmedQuestion,
      answer: articleResult.answer,
      citedPassages: articleResult.citedPassages,
      mappableLocations,
      travelGuide,
      knowledgeGap: articleResult.knowledgeGap,
      questionCountIncrement: 1,
    });
    timer.mark('record_ms');

    const questionCount = questionCountBeforeAsk + 1;
    const remainingQuestions =
      questionLimit === null ? null : Math.max(0, questionLimit - questionCount);
    logger.info('Public atlas query timing', {
      answerMode: 'wiki',
      source: 'articles',
      totalMs: timer.totalMs(),
      ...timer.snapshot(),
    });

    return {
      blocked: false,
      answer: articleResult.answer,
      citedEntryIds: articleResult.articleIds,
      citedPassages: articleResult.citedPassages,
      mappableLocations,
      travelGuide,
      scopedTopicIds: [],
      knowledgeGap: articleResult.knowledgeGap,
      threadId: thread.id,
      questionCount,
      questionLimit,
      remainingQuestions,
      requiresSignIn: questionLimit !== null && remainingQuestions !== null && remainingQuestions <= 0,
    };
  }

  const topics = await loadCandidateTopics(
    params.atlasOwnerUserId,
    trimmedQuestion,
    params.topicIds,
    broadQuestion,
  );
  timer.mark('topic_retrieval_ms');
  const tokens = tokenize(trimmedQuestion);
  const entryLimit = broadQuestion ? broadQuestionMaxAnswerEntries : maxAnswerEntries;
  const minEntries = broadQuestion ? broadQuestionMinAnswerEntries : minAnswerEntries;
  const previewEntries = dedupeById(
    topics.flatMap((topic) => topic.retrieval_entries ?? []),
  );
  const previewRankedEntries = rankEntriesForQuestion(previewEntries, tokens).slice(0, entryLimit);

  let uniqueEntries = previewRankedEntries;

  if (uniqueEntries.length < minEntries || shouldFetchAdditionalEntries(uniqueEntries, tokens, broadQuestion)) {
    const fallbackEntryIds = topics
      .flatMap((topic) => topic.entry_ids)
      .filter((entryId) => !uniqueEntries.some((entry) => entry.id === entryId))
      .slice(0, broadQuestion ? 72 : 36);

    if (fallbackEntryIds.length > 0) {
      const entrySnapshots = await Promise.all(
        fallbackEntryIds.map((entryId) => knowledgeEntriesCollection.doc(entryId).get()),
      );

      const fetchedEntries = compact(
        entrySnapshots.map((snapshot) =>
          snapshot.exists
            ? {
                id: snapshot.id,
                ...(snapshot.data() as Omit<KnowledgeEntryRecord, 'created_at' | 'last_updated'>),
              }
            : null,
        ),
      );

      uniqueEntries = rankEntriesForQuestion(
        dedupeById([...uniqueEntries, ...fetchedEntries]),
        tokens,
      ).slice(0, entryLimit);
    }
  }
  timer.mark('entry_retrieval_ms');

  if (uniqueEntries.length === 0) {
    const response = await answerWithGoogleSearch({
      question: trimmedQuestion,
      history: threadHistory.map((message) => ({ role: message.role, text: message.text })),
      personaPrompt: atlasChatContext.personaPrompt,
    });
    timer.mark('internet_fallback_model_ms');
    const { mappableLocations, travelGuide } = buildFastAnswerPresentation({
      question: trimmedQuestion,
      answer: response.answer,
      atlasName: atlasChatContext.atlasName,
      cityHint: atlasChatContext.cityHint,
    });
    timer.mark('presentation_ms');

    await recordPublicChatThreadExchange({
      threadId: thread.id,
      atlasId: params.atlasId,
      atlasOwnerUserId: params.atlasOwnerUserId,
      visitor: params.visitor,
      answerMode: 'internet',
      question: trimmedQuestion,
      answer: response.answer,
      citedPassages: [],
      mappableLocations,
      travelGuide,
      knowledgeGap: false,
      questionCountIncrement: 1,
    });
    timer.mark('record_ms');

    const questionCount = questionCountBeforeAsk + 1;
    const remainingQuestions =
      questionLimit === null ? null : Math.max(0, questionLimit - questionCount);
    logger.info('Public atlas query timing', {
      answerMode: 'internet',
      source: 'wiki_gap_internet_fallback',
      totalMs: timer.totalMs(),
      ...timer.snapshot(),
    });

    return {
      blocked: false,
      answer: response.answer,
      citedEntryIds: [],
      citedPassages: [],
      mappableLocations,
      travelGuide,
      scopedTopicIds: topics.map((topic) => topic.id),
      knowledgeGap: false,
      threadId: thread.id,
      questionCount,
      questionLimit,
      remainingQuestions,
      requiresSignIn: questionLimit !== null && remainingQuestions !== null && remainingQuestions <= 0,
    };
  }

  const response = await answerQuestion({
    question: trimmedQuestion,
    history: threadHistory.map((message) => ({ role: message.role, text: message.text })),
    entries: uniqueEntries.map((entry) => ({
      id: entry.id,
      claim: entry.claim,
      topic: entry.topic,
      source: entry.source,
    })),
    personaPrompt: atlasChatContext.personaPrompt,
  });
  timer.mark('knowledge_model_ms');

  const citedEntryIds = (Array.isArray(response.cited_entry_ids) ? response.cited_entry_ids : []).filter((entryId) =>
    uniqueEntries.some((entry) => entry.id === entryId),
  );
  const citedPassages = await hydrateCitationSnapshots(
    params.atlasOwnerUserId,
    uniqueEntries,
    citedEntryIds,
  );
  timer.mark('citation_hydration_ms');
  const answer =
    typeof response.answer === 'string' && response.answer.trim().length > 0
      ? response.answer.trim()
      : 'I could not generate a reliable answer for this question from the current knowledge base.';
  const knowledgeGap =
    typeof response.knowledge_gap === 'boolean'
      ? response.knowledge_gap
      : citedEntryIds.length === 0;

  if (knowledgeGap || citedEntryIds.length === 0) {
    const fallbackResponse = await answerWithGoogleSearch({
      question: trimmedQuestion,
      history: threadHistory.map((message) => ({ role: message.role, text: message.text })),
      personaPrompt: atlasChatContext.personaPrompt,
    });
    timer.mark('internet_fallback_model_ms');
    const { mappableLocations, travelGuide } = buildFastAnswerPresentation({
      question: trimmedQuestion,
      answer: fallbackResponse.answer,
      atlasName: atlasChatContext.atlasName,
      cityHint: atlasChatContext.cityHint,
    });
    timer.mark('presentation_ms');

    await recordPublicChatThreadExchange({
      threadId: thread.id,
      atlasId: params.atlasId,
      atlasOwnerUserId: params.atlasOwnerUserId,
      visitor: params.visitor,
      answerMode: 'internet',
      question: trimmedQuestion,
      answer: fallbackResponse.answer,
      citedPassages: [],
      mappableLocations,
      travelGuide,
      knowledgeGap: false,
      questionCountIncrement: 1,
    });
    timer.mark('record_ms');

    const questionCount = questionCountBeforeAsk + 1;
    const remainingQuestions =
      questionLimit === null ? null : Math.max(0, questionLimit - questionCount);
    logger.info('Public atlas query timing', {
      answerMode: 'internet',
      source: 'wiki_uncited_internet_fallback',
      totalMs: timer.totalMs(),
      ...timer.snapshot(),
    });

    return {
      blocked: false,
      answer: fallbackResponse.answer,
      citedEntryIds: [],
      citedPassages: [],
      mappableLocations,
      travelGuide,
      scopedTopicIds: topics.map((topic) => topic.id),
      knowledgeGap: false,
      threadId: thread.id,
      questionCount,
      questionLimit,
      remainingQuestions,
      requiresSignIn: questionLimit !== null && remainingQuestions !== null && remainingQuestions <= 0,
    };
  }

  const { mappableLocations, travelGuide } = buildFastAnswerPresentation({
    question: trimmedQuestion,
    answer,
    atlasName: atlasChatContext.atlasName,
    cityHint: atlasChatContext.cityHint,
  });
  timer.mark('presentation_ms');

  await recordPublicChatThreadExchange({
    threadId: thread.id,
    atlasId: params.atlasId,
    atlasOwnerUserId: params.atlasOwnerUserId,
    visitor: params.visitor,
    answerMode: 'wiki',
    question: trimmedQuestion,
    answer,
    citedPassages,
    mappableLocations,
    travelGuide,
    knowledgeGap,
    questionCountIncrement: 1,
  });
  timer.mark('record_ms');
  logger.info('Public atlas query timing', {
    answerMode: 'wiki',
    source: uniqueEntries.length === 0 ? 'knowledge_gap' : 'knowledge_entries',
    totalMs: timer.totalMs(),
    ...timer.snapshot(),
  });

  const questionCount = questionCountBeforeAsk + 1;
  const remainingQuestions =
    questionLimit === null ? null : Math.max(0, questionLimit - questionCount);

  return {
    blocked: false,
    answer,
    citedEntryIds,
    citedPassages,
    mappableLocations,
    travelGuide,
    scopedTopicIds: topics.map((topic) => topic.id),
    knowledgeGap,
    threadId: thread.id,
    questionCount,
    questionLimit,
    remainingQuestions,
    requiresSignIn: questionLimit !== null && remainingQuestions !== null && remainingQuestions <= 0,
  };
}

async function tryAnswerFromArticles(params: {
  userId: string;
  atlasId: string | null;
  question: string;
  broadQuestion: boolean;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  personaPrompt?: string | null;
}): Promise<{
  answer: string;
  articleIds: string[];
  citedPassages: QueryCitationSnapshot[];
  knowledgeGap: boolean;
} | null> {
  const index = await loadWikiIndex(params.userId, params.atlasId);
  if (!index || index.entries.length === 0) {
    return null;
  }

  const tokens = tokenize(params.question);
  const maxArticles = params.broadQuestion ? 15 : 10;

  const scoredArticles = index.entries
    .map((entry) => {
      const titleScore = scoreTextForTokens(entry.title.toLowerCase(), tokens) * 6;
      const summaryScore = scoreTextForTokens(entry.summary.toLowerCase(), tokens) * 3;
      const coverage = tokenCoverage(
        `${entry.title} ${entry.summary}`.toLowerCase(),
        tokens,
      ) * 2;
      return { ...entry, score: titleScore + summaryScore + coverage };
    })
    .sort((a, b) => b.score - a.score);

  const selected = scoredArticles.filter((a) => a.score > 0).slice(0, maxArticles);
  if (selected.length === 0) {
    const fallback = scoredArticles.slice(0, Math.min(3, scoredArticles.length));
    if (fallback.length === 0) {
      return null;
    }
    selected.push(...fallback);
  }

  const articleSnapshots = await Promise.all(
    selected.map((entry) => wikiArticlesCollection.doc(entry.article_id).get()),
  );

  const articles = compact(
    articleSnapshots.map((snapshot) => {
      if (!snapshot.exists) return null;
      const data = snapshot.data() as WikiArticleRecord;
      return {
        article_id: snapshot.id,
        title: data.title,
        content: data.content,
        source_documents: data.source_documents ?? [],
      };
    }),
  );

  if (articles.length === 0) {
    return null;
  }

  const response = await answerFromArticles({
    question: params.question,
    history: params.history,
    articles: articles.map((a) => ({
      article_id: a.article_id,
      title: a.title,
      content: a.content,
    })),
    personaPrompt: params.personaPrompt ?? null,
  });

  const safeAnswer =
    typeof response.answer === 'string' && response.answer.trim().length > 0
      ? response.answer.trim()
      : null;

  if (!safeAnswer) {
    return null;
  }

  const citedArticleIds = (response.cited_entry_ids ?? []).filter((id) =>
    articles.some((a) => a.article_id === id),
  );

  const citedPassages = buildArticleCitationPassages(articles, citedArticleIds);

  return {
    answer: safeAnswer,
    articleIds: citedArticleIds,
    citedPassages,
    knowledgeGap: response.knowledge_gap,
  };
}

function cleanArticleText(content: string): string {
  return content
    .replace(/\[Source:\s*[^\]]*\]/g, '')
    .replace(/\[Source:[^\]]*$/gm, '')
    .trim();
}

function buildArticleCitationPassages(
  articles: Array<{
    article_id: string;
    title: string;
    content: string;
    source_documents: WikiArticleSource[];
  }>,
  citedArticleIds: string[],
): QueryCitationSnapshot[] {
  const passages: QueryCitationSnapshot[] = [];

  for (const articleId of citedArticleIds) {
    const article = articles.find((a) => a.article_id === articleId);
    if (!article) continue;

    const sourceRefs = extractSourceRefsFromContent(article.content);
    if (sourceRefs.length > 0) {
      for (const ref of sourceRefs) {
        passages.push({
          entry_id: articleId,
          text: cleanArticleText(ref.context),
          filename: ref.filename,
          page: ref.page,
          line_start: 0,
          line_end: 0,
        });
      }
    } else {
      // No parseable [Source:] refs — use full cleaned article content
      const primaryDoc = article.source_documents[0];
      passages.push({
        entry_id: articleId,
        text: cleanArticleText(article.content),
        filename: primaryDoc?.filename ?? article.title,
        page: primaryDoc?.pages[0] ?? 0,
        line_start: 0,
        line_end: 0,
      });
    }
  }

  const deduped = new Map<string, QueryCitationSnapshot>();
  for (const passage of passages) {
    const key = `${passage.filename}::${passage.page}`;
    if (!deduped.has(key)) {
      deduped.set(key, passage);
    }
  }
  return Array.from(deduped.values());
}

function extractSourceRefsFromContent(
  content: string,
): Array<{ filename: string; page: number; context: string }> {
  const refs: Array<{ filename: string; page: number; context: string }> = [];
  const pattern = /\[Source:\s*([^,\]]+),\s*p\.?\s*(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const filename = match[1].trim();
    const page = parseInt(match[2], 10);

    // Find the paragraph boundaries around this source ref
    let paraStart = content.lastIndexOf('\n\n', match.index);
    paraStart = paraStart === -1 ? 0 : paraStart + 2;
    let paraEnd = content.indexOf('\n\n', match.index + match[0].length);
    paraEnd = paraEnd === -1 ? content.length : paraEnd;
    const context = content.slice(paraStart, paraEnd).trim();

    refs.push({ filename, page, context });
  }

  return refs;
}

export async function getWikiTopicDetailsForUser(params: {
  userId: string;
  topicId: string;
}): Promise<{
  entries: Array<Omit<KnowledgeEntryRecord, 'created_at' | 'last_updated'> & { id: string }>;
  sourceDocuments: Array<DocumentRecord & { id: string }>;
}> {
  const topicSnapshot = await wikiTopicsCollection.doc(params.topicId).get();
  if (!topicSnapshot.exists) {
    throw new Error('Topic not found.');
  }

  const topic = topicSnapshot.data();
  if (!topic || topic.user_id !== params.userId) {
    throw new Error('You do not have access to this topic.');
  }

  const entryIds = ((topic.entry_ids as string[] | undefined) ?? []).slice(0, 250);
  if (entryIds.length === 0) {
    return { entries: [], sourceDocuments: [] };
  }

  const entrySnapshots = await Promise.all(
    entryIds.map((entryId) => knowledgeEntriesCollection.doc(entryId).get()),
  );

  const entries = compact(
    entrySnapshots.map((snapshot) =>
      snapshot.exists
        ? {
            id: snapshot.id,
            ...(snapshot.data() as Omit<KnowledgeEntryRecord, 'created_at' | 'last_updated'>),
          }
        : null,
    ),
  ).filter((entry) => entry.user_id === params.userId && !entry.orphaned);

  const documentIds = dedupeStrings(entries.map((entry) => entry.document_id)).slice(0, 30);
  const documentSnapshots = await Promise.all(
    documentIds.map((documentId) => documentsCollection.doc(documentId).get()),
  );

  const sourceDocuments = compact(
    documentSnapshots.map((snapshot) =>
      snapshot.exists
        ? {
            id: snapshot.id,
            ...(snapshot.data() as DocumentRecord),
          }
        : null,
    ),
  ).filter((document) => document.user_id === params.userId);

  return { entries, sourceDocuments };
}

async function ensureActiveChatThread(
  userId: string,
  atlasId: string | null,
  threadId: string | null,
  seedQuestion: string,
): Promise<{ id: string; reusedExisting: boolean }> {
  if (threadId) {
    const existingSnapshot = await chatThreadsCollection.doc(threadId).get();
    if (existingSnapshot.exists) {
      const existing = existingSnapshot.data() as ChatThreadRecord;
      if (existing.user_id === userId && Number(existing.user_turn_count ?? 0) < maxUserTurnsPerThread) {
        return { id: threadId, reusedExisting: true };
      }
    }
  }

  const threadRef = chatThreadsCollection.doc();
  await threadRef.set({
    user_id: userId,
    atlas_id: atlasId,
    title: threadTitleFromQuestion(seedQuestion),
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    last_question: seedQuestion,
    last_answer_preview: '',
    message_count: 0,
    user_turn_count: 0,
  } satisfies ChatThreadRecord);

  return { id: threadRef.id, reusedExisting: false };
}

async function loadRecentChatThreadMessages(
  threadId: string,
  limitCount: number,
): Promise<Array<ChatMessageRecord & { id: string }>> {
  const snapshot = await chatMessagesCollection
    .where('thread_id', '==', threadId)
    .orderBy('created_at', 'desc')
    .limit(limitCount)
    .get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as ChatMessageRecord),
    }))
    .reverse()
    .sort((left, right) => compareStoredChatMessages(left, right));
}

async function recordChatThreadExchange(params: {
  threadId: string;
  userId: string;
  atlasId: string | null;
  answerMode: 'wiki' | 'internet';
  question: string;
  answer: string;
  citedPassages: QueryCitationSnapshot[];
  mappableLocations: MappableLocation[];
  travelGuide: TravelGuideStructuredResponse | null;
  knowledgeGap: boolean;
  questionCountIncrement: number;
}): Promise<void> {
  const createdAt = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(chatMessagesCollection.doc(generateId('chatmsg')), {
    thread_id: params.threadId,
    user_id: params.userId,
    atlas_id: params.atlasId,
    answer_mode: params.answerMode,
    role: 'user',
    text: params.question,
    created_at: createdAt,
  } satisfies ChatMessageRecord, { merge: true });
  batch.set(chatMessagesCollection.doc(generateId('chatmsg')), {
    thread_id: params.threadId,
    user_id: params.userId,
    atlas_id: params.atlasId,
    answer_mode: params.answerMode,
    role: 'assistant',
    text: params.answer,
    cited_passages: params.citedPassages,
    mappable_locations: params.mappableLocations,
    travel_guide: params.travelGuide,
    knowledge_gap: params.knowledgeGap,
    created_at: createdAt,
  } satisfies ChatMessageRecord, { merge: true });
  batch.set(
    chatThreadsCollection.doc(params.threadId),
    {
      updated_at: FieldValue.serverTimestamp(),
      last_question: params.question,
      last_answer_preview: params.answer.slice(0, 260),
      message_count: FieldValue.increment(2),
      user_turn_count: FieldValue.increment(params.questionCountIncrement),
    },
    { merge: true },
  );
  await batch.commit();
}

type PublicChatVisitorContext = {
  kind: 'anonymous' | 'authenticated';
  visitorUserId: string | null;
  anonymousVisitorId: string | null;
  visitorDisplayName: string | null;
  visitorEmail: string | null;
};

function publicVisitorMatchesThread(
  thread: PublicChatThreadRecord,
  visitor: PublicChatVisitorContext,
): boolean {
  if (thread.visitor_kind !== visitor.kind) {
    return false;
  }
  if (visitor.kind === 'authenticated') {
    return !!visitor.visitorUserId && thread.visitor_uid === visitor.visitorUserId;
  }
  return !!visitor.anonymousVisitorId && thread.anonymous_visitor_id === visitor.anonymousVisitorId;
}

async function loadPublicChatThreadForVisitor(params: {
  atlasId: string;
  visitor: PublicChatVisitorContext;
}): Promise<(PublicChatThreadRecord & { id: string }) | null> {
  const field =
    params.visitor.kind === 'authenticated' ? 'visitor_uid' : 'anonymous_visitor_id';
  const value =
    params.visitor.kind === 'authenticated'
      ? params.visitor.visitorUserId
      : params.visitor.anonymousVisitorId;

  if (!value) {
    return null;
  }

  const snapshot = await publicChatThreadsCollection
    .where('atlas_id', '==', params.atlasId)
    .where('visitor_kind', '==', params.visitor.kind)
    .where(field, '==', value)
    .limit(1)
    .get();

  const doc = snapshot.docs[0];
  if (!doc) {
    return null;
  }

  return {
    id: doc.id,
    ...(doc.data() as PublicChatThreadRecord),
  };
}

async function ensureActivePublicChatThread(params: {
  atlasId: string;
  atlasOwnerUserId: string;
  threadId: string | null;
  seedQuestion: string;
  visitor: PublicChatVisitorContext;
}): Promise<{ id: string; reusedExisting: boolean; questionCount: number }> {
  if (params.threadId) {
    const existingSnapshot = await publicChatThreadsCollection.doc(params.threadId).get();
    if (existingSnapshot.exists) {
      const existing = existingSnapshot.data() as PublicChatThreadRecord;
      if (
        existing.atlas_id === params.atlasId &&
        existing.atlas_owner_user_id === params.atlasOwnerUserId &&
        publicVisitorMatchesThread(existing, params.visitor)
      ) {
        return {
          id: params.threadId,
          reusedExisting: true,
          questionCount: Number(existing.user_turn_count ?? 0),
        };
      }
    }
  }

  const currentThread = await loadPublicChatThreadForVisitor({
    atlasId: params.atlasId,
    visitor: params.visitor,
  });
  if (currentThread) {
    return {
      id: currentThread.id,
      reusedExisting: true,
      questionCount: Number(currentThread.user_turn_count ?? 0),
    };
  }

  const threadRef = publicChatThreadsCollection.doc();
  await threadRef.set({
    atlas_id: params.atlasId,
    atlas_owner_user_id: params.atlasOwnerUserId,
    visitor_kind: params.visitor.kind,
    visitor_uid: params.visitor.visitorUserId,
    anonymous_visitor_id: params.visitor.anonymousVisitorId,
    visitor_display_name: params.visitor.visitorDisplayName,
    visitor_email: params.visitor.visitorEmail,
    title: threadTitleFromQuestion(params.seedQuestion),
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    last_question: params.seedQuestion,
    last_answer_preview: '',
    message_count: 0,
    user_turn_count: 0,
  } satisfies PublicChatThreadRecord);

  return { id: threadRef.id, reusedExisting: false, questionCount: 0 };
}

async function loadRecentPublicChatThreadMessages(
  threadId: string,
  limitCount: number,
): Promise<Array<PublicChatMessageRecord & { id: string }>> {
  const snapshot = await publicChatMessagesCollection
    .where('thread_id', '==', threadId)
    .orderBy('created_at', 'desc')
    .limit(limitCount)
    .get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as PublicChatMessageRecord),
    }))
    .reverse()
    .sort((left, right) => compareStoredChatMessages(left, right));
}

async function recordPublicChatThreadExchange(params: {
  threadId: string;
  atlasId: string;
  atlasOwnerUserId: string;
  visitor: PublicChatVisitorContext;
  answerMode: 'wiki' | 'internet';
  question: string;
  answer: string;
  citedPassages: QueryCitationSnapshot[];
  mappableLocations: MappableLocation[];
  travelGuide: TravelGuideStructuredResponse | null;
  knowledgeGap: boolean;
  questionCountIncrement: number;
}): Promise<void> {
  const createdAt = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(publicChatMessagesCollection.doc(generateId('pubchatmsg')), {
    thread_id: params.threadId,
    atlas_id: params.atlasId,
    atlas_owner_user_id: params.atlasOwnerUserId,
    visitor_kind: params.visitor.kind,
    visitor_uid: params.visitor.visitorUserId,
    anonymous_visitor_id: params.visitor.anonymousVisitorId,
    answer_mode: params.answerMode,
    role: 'user',
    text: params.question,
    created_at: createdAt,
  } satisfies PublicChatMessageRecord, { merge: true });
  batch.set(publicChatMessagesCollection.doc(generateId('pubchatmsg')), {
    thread_id: params.threadId,
    atlas_id: params.atlasId,
    atlas_owner_user_id: params.atlasOwnerUserId,
    visitor_kind: params.visitor.kind,
    visitor_uid: params.visitor.visitorUserId,
    anonymous_visitor_id: params.visitor.anonymousVisitorId,
    answer_mode: params.answerMode,
    role: 'assistant',
    text: params.answer,
    cited_passages: params.citedPassages,
    mappable_locations: params.mappableLocations,
    travel_guide: params.travelGuide,
    knowledge_gap: params.knowledgeGap,
    created_at: createdAt,
  } satisfies PublicChatMessageRecord, { merge: true });
  batch.set(
    publicChatThreadsCollection.doc(params.threadId),
    {
      updated_at: FieldValue.serverTimestamp(),
      last_question: params.question,
      last_answer_preview: params.answer.slice(0, 260),
      message_count: FieldValue.increment(2),
      user_turn_count: FieldValue.increment(params.questionCountIncrement),
      visitor_display_name: params.visitor.visitorDisplayName,
      visitor_email: params.visitor.visitorEmail,
    },
    { merge: true },
  );
  await batch.commit();
}

export async function getPublicChatState(params: {
  atlasId: string;
  visitor: PublicChatVisitorContext;
}): Promise<{
  threadId: string | null;
  messages: Array<PublicChatMessageRecord & { id: string }>;
  questionCount: number;
  questionLimit: number | null;
  remainingQuestions: number | null;
  requiresSignIn: boolean;
}> {
  const thread = await loadPublicChatThreadForVisitor({
    atlasId: params.atlasId,
    visitor: params.visitor,
  });

  const questionCount = Number(thread?.user_turn_count ?? 0);
  const questionLimit = params.visitor.kind === 'anonymous' ? maxAnonymousPublicQuestions : null;
  const remainingQuestions =
    questionLimit === null ? null : Math.max(0, questionLimit - questionCount);

  return {
    threadId: thread?.id ?? null,
    messages: thread ? await loadRecentPublicChatThreadMessages(thread.id, 250) : [],
    questionCount,
    questionLimit,
    remainingQuestions,
    requiresSignIn: questionLimit !== null && remainingQuestions !== null && remainingQuestions <= 0,
  };
}

async function loadCandidateTopics(
  userId: string,
  question: string,
  forcedTopicIds?: string[],
  broadQuestion = false,
): Promise<Array<{ id: string; name: string; entry_ids: string[]; retrieval_entries?: TopicEntryPreview[]; score: number }>> {
  if (forcedTopicIds && forcedTopicIds.length > 0) {
    const snapshots = await Promise.all(forcedTopicIds.map((topicId) => wikiTopicsCollection.doc(topicId).get()));
    return compact(
      snapshots.map((snapshot) =>
        snapshot.exists && snapshot.data()?.user_id === userId
          ? {
              id: snapshot.id,
              name: snapshot.data()?.name as string,
              entry_ids: (snapshot.data()?.entry_ids as string[]) ?? [],
              retrieval_entries: normalizeTopicPreviewEntries(snapshot.data()?.retrieval_entries, snapshot.data()?.name as string),
              score: 1,
            }
          : null,
      ),
    );
  }

  const snapshot = await wikiTopicsCollection
    .where('user_id', '==', userId)
    .orderBy('last_updated', 'desc')
    .limit(40)
    .get();

  const tokens = tokenize(question);
  const hasCachedSearchText = snapshot.docs.some((doc) => {
    const searchText = doc.data()?.search_text;
    return typeof searchText === 'string' && searchText.trim().length > 0;
  });
  const topicMap = new Map<string, {
    id: string;
    name: string;
    entry_ids: string[];
    retrieval_entries?: TopicEntryPreview[];
    topicScore: number;
    entryScore: number;
  }>(
    snapshot.docs.map((doc) => {
      const data = doc.data();
      return [
        doc.id,
        {
          id: doc.id,
          name: data.name as string,
          entry_ids: (data.entry_ids as string[]) ?? [],
          retrieval_entries: normalizeTopicPreviewEntries(data.retrieval_entries, data.name as string),
          topicScore: scoreTopicForQuestion(
            {
              name: String(data.name ?? ''),
              summary: String(data.summary ?? ''),
              searchText: String(data.search_text ?? ''),
            },
            tokens,
          ),
          entryScore: 0,
        },
      ];
    }),
  );

  if (hasCachedSearchText) {
    const cachedScored = Array.from(topicMap.values())
      .map((topic) => ({
        id: topic.id,
        name: topic.name,
        entry_ids: dedupeStrings(topic.entry_ids),
        retrieval_entries: topic.retrieval_entries,
        score: topic.topicScore,
      }))
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

    const selectedFromCache = cachedScored.filter((topic) => topic.score > 0).slice(0, broadQuestion ? 10 : 6);
    if (selectedFromCache.length > 0) {
      return selectedFromCache.map((topic) => ({
        id: topic.id,
        name: topic.name,
        entry_ids: topic.entry_ids,
        retrieval_entries: topic.retrieval_entries,
        score: topic.score,
      }));
    }
  }

  const entrySnapshot = await knowledgeEntriesCollection
    .where('user_id', '==', userId)
    .where('orphaned', '==', false)
    .limit(300)
    .get();

  for (const doc of entrySnapshot.docs) {
    const data = doc.data() as Omit<KnowledgeEntryRecord, 'created_at' | 'last_updated'>;
    if (data.orphaned) {
      continue;
    }

    const haystack = `${data.topic ?? ''} ${(data.related_topics ?? []).join(' ')} ${data.claim ?? ''}`.toLowerCase();
    const score = scoreTextForTokens(haystack, tokens);

    if (score <= 0) {
      continue;
    }

    const topicId = topicDocumentId(userId, data.topic);
    const existing = topicMap.get(topicId);

    if (existing) {
      existing.entryScore += score;
      if (!existing.entry_ids.includes(doc.id)) {
        existing.entry_ids.push(doc.id);
      }
    } else {
      topicMap.set(topicId, {
        id: topicId,
        name: data.topic,
        entry_ids: [doc.id],
        topicScore: 0,
        entryScore: score,
      });
    }
  }

  const scored = Array.from(topicMap.values())
    .map((doc) => {
      return {
        id: doc.id,
        name: doc.name,
        entry_ids: dedupeStrings(doc.entry_ids),
        retrieval_entries: doc.retrieval_entries,
        score: doc.topicScore * 2 + doc.entryScore,
      };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  const selected = scored.filter((topic) => topic.score > 0).slice(0, broadQuestion ? 10 : 6);
  return (selected.length > 0 ? selected : scored.slice(0, broadQuestion ? 10 : 6)).map((topic) => ({
    id: topic.id,
    name: topic.name,
    entry_ids: topic.entry_ids,
    retrieval_entries: topic.retrieval_entries,
    score: topic.score,
  }));
}

async function hydrateCitationSnapshots(
  userId: string,
  entries: Array<{
    id: string;
    claim: string;
    document_id: string;
    source: { page: number; line_start: number; line_end: number };
  }>,
  citedEntryIds: string[],
): Promise<QueryCitationSnapshot[]> {
  const entryMap = new Map(entries.map((entry) => [entry.id, entry] as const));
  const citedEntries = citedEntryIds
    .map((entryId) => ({ entryId, entry: entryMap.get(entryId) }))
    .filter((value): value is { entryId: string; entry: (typeof entries)[number] } => !!value.entry);

  if (citedEntries.length === 0) {
    return [];
  }

  const documentIds = dedupeStrings(citedEntries.map(({ entry }) => entry.document_id));
  const [extractSnapshots, documentSnapshots] = await Promise.all([
    Promise.all(
      citedEntries.map(({ entry }) =>
        rawExtractsCollection
          .doc(makeExtractId(entry.document_id, entry.source.page, entry.source.line_start, entry.source.line_end))
          .get(),
      ),
    ),
    Promise.all(documentIds.map((documentId) => documentsCollection.doc(documentId).get())),
  ]);

  const documentNameById = new Map<string, string>();
  documentSnapshots.forEach((snapshot) => {
    documentNameById.set(snapshot.id, resolveDocumentLabel(snapshot));
  });

  const hydrated = citedEntries
    .map(({ entryId, entry }, index) => {
      const extractSnapshot = extractSnapshots[index];
      const extractText = extractSnapshot.exists ? (extractSnapshot.data()?.text as string) : entry.claim;

      return {
        entry_id: entryId,
        text: extractText,
        filename: documentNameById.get(entry.document_id) ?? `Document ${entry.document_id.slice(0, 8)}`,
        page: entry.source.page,
        line_start: entry.source.line_start,
        line_end: entry.source.line_end,
      };
    })
    .filter((snapshot) => snapshot.text.length > 0);

  const deduped = new Map<string, QueryCitationSnapshot>();
  for (const snapshot of hydrated) {
    const key = [
      snapshot.page,
      snapshot.line_start,
      snapshot.line_end,
      snapshot.text.trim().toLowerCase(),
    ].join('::');
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, snapshot);
      continue;
    }

    const existingIsFallback = isFallbackDocumentLabel(existing.filename);
    const candidateIsFallback = isFallbackDocumentLabel(snapshot.filename);

    if (existingIsFallback && !candidateIsFallback) {
      deduped.set(key, snapshot);
    }
  }

  return Array.from(deduped.values());
}

function resolveDocumentLabel(
  snapshot: FirebaseFirestore.DocumentSnapshot,
): string {
  if (!snapshot.exists) {
    return `Document ${snapshot.id.slice(0, 8)}`;
  }

  const data = snapshot.data();
  const title = String(data?.title ?? '').trim();
  if (title) {
    return title;
  }

  const filename = String(data?.filename ?? '').trim();
  if (filename) {
    return filename;
  }

  const sourceUrl = String(data?.source_url ?? '').trim();
  if (sourceUrl) {
    try {
      return new URL(sourceUrl).hostname || sourceUrl;
    } catch {
      return sourceUrl;
    }
  }

  return `Document ${snapshot.id.slice(0, 8)}`;
}

function isFallbackDocumentLabel(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'unknown document' || normalized.startsWith('document ');
}

export async function processWikiTopicSummaryJob(jobId: string): Promise<void> {
  const jobSnapshot = await wikiTopicJobsCollection.doc(jobId).get();
  if (!jobSnapshot.exists) {
    return;
  }

  const job = jobSnapshot.data() as WikiTopicJobRecord;
  const topicRef = wikiTopicsCollection.doc(job.topic_id);

  try {
    const entriesSnapshot = await knowledgeEntriesCollection
      .where('user_id', '==', job.user_id)
      .where('topic', '==', job.topic_name)
      .where('orphaned', '==', false)
      .get();

    if (entriesSnapshot.empty) {
      await topicRef.delete();
      return;
    }

    const entries = entriesSnapshot.docs.map((snapshot) => ({
      id: snapshot.id,
      ...(snapshot.data() as Omit<KnowledgeEntryRecord, 'created_at' | 'last_updated'>),
    }));
    const retrievalEntries = selectRepresentativeEntries(
      entries.map((entry) => toTopicEntryPreview(entry)),
      maxTopicPreviewEntries,
    );
    const summaryClaims = selectDiverseStrings(
      retrievalEntries.map((entry) => entry.claim),
      { limit: 18, maxChars: 4200 },
    );
    const summaryResult = await summarizeTopic(
      job.topic_name,
      summaryClaims,
    );

    await topicRef.set(
      {
        name: job.topic_name,
        summary: summaryResult.summary,
        search_text: buildTopicSearchText({
          topicName: job.topic_name,
          summary: summaryResult.summary,
          claims: retrievalEntries.map((entry) => entry.claim),
          relatedTopics: retrievalEntries.flatMap((entry) => entry.related_topics ?? []),
        }),
        retrieval_entries: retrievalEntries,
        summary_status: 'ready',
        summary_error: null,
        entry_ids: entries.map((entry) => entry.id),
        document_ids: dedupeStrings(entries.map((entry) => entry.document_id)),
        user_id: job.user_id,
        atlas_id: job.atlas_id ?? null,
        last_updated: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (job.triggered_by_document_id) {
      await addDocumentAiUsage(
        documentsCollection.doc(job.triggered_by_document_id),
        summaryResult.usage,
        'summary',
      );
    }
  } catch (error) {
    await topicRef.set(
      {
        summary_status: 'failed',
        summary_error: error instanceof Error ? error.message : 'Failed to summarize topic.',
        last_updated: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    throw error;
  } finally {
    await wikiTopicJobsCollection.doc(jobId).delete();
  }
}

function scoreEntryForQuestion(
  entry: Pick<KnowledgeEntryRecord, 'claim' | 'topic' | 'related_topics'>,
  tokens: string[],
): number {
  const topicText = entry.topic.toLowerCase();
  const relatedText = (entry.related_topics ?? []).join(' ').toLowerCase();
  const claimText = entry.claim.toLowerCase();

  return (
    scoreTextForTokens(topicText, tokens) * 5 +
    scoreTextForTokens(relatedText, tokens) * 2 +
    scoreTextForTokens(claimText, tokens) * 3 +
    Math.min(tokenCoverage(claimText, tokens), 4)
  );
}

function scoreTopicForQuestion(
  topic: { name: string; summary: string; searchText: string },
  tokens: string[],
): number {
  const name = topic.name.toLowerCase();
  const summary = topic.summary.toLowerCase();
  const searchText = topic.searchText.toLowerCase();

  return (
    scoreTextForTokens(name, tokens) * 6 +
    scoreTextForTokens(summary, tokens) * 2 +
    scoreTextForTokens(searchText, tokens) +
    tokenCoverage(name, tokens) * 2
  );
}

function scoreTextForTokens(value: string, tokens: string[]): number {
  return tokens.reduce((sum, token) => sum + (value.includes(token) ? 1 : 0), 0);
}

function tokenCoverage(value: string, tokens: string[]): number {
  return tokens.filter((token) => value.includes(token)).length;
}

function rankEntriesForQuestion<T extends Pick<KnowledgeEntryRecord, 'claim' | 'topic' | 'related_topics'> & { id: string }>(
  entries: T[],
  tokens: string[],
): T[] {
  return [...entries]
    .sort((left, right) => {
      const leftScore = scoreEntryForQuestion(left, tokens);
      const rightScore = scoreEntryForQuestion(right, tokens);
      return rightScore - leftScore || left.topic.localeCompare(right.topic);
    });
}

function shouldFetchAdditionalEntries(
  entries: Array<Pick<KnowledgeEntryRecord, 'claim' | 'topic' | 'related_topics'>>,
  tokens: string[],
  broadQuestion = false,
): boolean {
  if (entries.length === 0) {
    return true;
  }

  const topScore = scoreEntryForQuestion(entries[0], tokens);
  const coveredClaims = new Set<string>();

  for (const entry of entries.slice(0, 10)) {
    tokenizeText(entry.claim).forEach((token) => coveredClaims.add(token));
  }

  const matchedCoverage = tokens.filter((token) => coveredClaims.has(token)).length;
  if (broadQuestion) {
    return topScore < 10 || matchedCoverage < Math.min(5, tokens.length) || entries.length < broadQuestionMinAnswerEntries;
  }
  return topScore < 8 || matchedCoverage < Math.min(3, tokens.length);
}

function toTopicEntryPreview(
  entry: Pick<KnowledgeEntryRecord, 'claim' | 'topic' | 'related_topics' | 'document_id' | 'source'> & { id: string },
): TopicEntryPreview {
  return {
    id: entry.id,
    claim: entry.claim,
    topic: entry.topic,
    related_topics: normalizeRelatedTopics(entry.related_topics ?? []),
    document_id: entry.document_id,
    source: entry.source,
  };
}

function normalizeTopicPreviewEntries(value: unknown, fallbackTopicName: string): TopicEntryPreview[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return compact(
    value.map((preview) => {
      const source = typeof preview === 'object' && preview ? (preview as TopicEntryPreview).source : null;
      const page = Number(source?.page ?? 0);
      const lineStart = Number(source?.line_start ?? 0);
      const lineEnd = Number(source?.line_end ?? 0);

      const id = String((preview as TopicEntryPreview | undefined)?.id ?? '').trim();
      const claim = String((preview as TopicEntryPreview | undefined)?.claim ?? '').trim();
      const documentId = String((preview as TopicEntryPreview | undefined)?.document_id ?? '').trim();

      if (!id || !claim || !documentId || !Number.isFinite(page) || !Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) {
        return null;
      }

      return {
        id,
        claim,
        topic: normalizeTopicName(String((preview as TopicEntryPreview | undefined)?.topic ?? fallbackTopicName)),
        related_topics: normalizeRelatedTopics((preview as TopicEntryPreview | undefined)?.related_topics ?? []),
        document_id: documentId,
        source: {
          page,
          line_start: lineStart,
          line_end: lineEnd,
        },
      } satisfies TopicEntryPreview;
    }),
  );
}

function selectRepresentativeEntries(entries: TopicEntryPreview[], limit: number): TopicEntryPreview[] {
  const deduped = dedupeById(entries)
    .filter((entry) => entry.claim.trim().length > 0)
    .filter((entry, index, all) =>
      all.findIndex((candidate) =>
        candidate.topic === entry.topic &&
        normalizeTextFingerprint(candidate.claim) === normalizeTextFingerprint(entry.claim),
      ) === index,
    );

  if (deduped.length <= limit) {
    return deduped;
  }

  const selected: TopicEntryPreview[] = [];
  const coveredTokens = new Set<string>();
  const remaining = [...deduped];

  while (remaining.length > 0 && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const entry = remaining[index];
      const claimTokens = tokenizeText(entry.claim);
      const topicTokens = tokenizeText(`${entry.topic} ${(entry.related_topics ?? []).join(' ')}`);
      const novelty = [...claimTokens, ...topicTokens].filter((token) => !coveredTokens.has(token)).length;
      const score =
        novelty * 5 +
        Math.min(claimTokens.length, 14) +
        Math.min(entry.claim.length, 220) / 100 +
        Math.min(topicTokens.length, 8);

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const [best] = remaining.splice(bestIndex, 1);
    selected.push(best);
    tokenizeText(`${best.topic} ${best.claim} ${(best.related_topics ?? []).join(' ')}`)
      .forEach((token) => coveredTokens.add(token));
  }

  return selected;
}

function dedupeKnowledgeDrafts(drafts: KnowledgeEntryDraft[]): KnowledgeEntryDraft[] {
  const deduped = new Map<string, KnowledgeEntryDraft>();

  for (const draft of drafts) {
    const key = `${normalizeTopicName(draft.topic)}::${normalizeTextFingerprint(draft.claim)}`;
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, {
        ...draft,
        topic: normalizeTopicName(draft.topic),
        related_topics: normalizeRelatedTopics(draft.related_topics),
      });
      continue;
    }

    deduped.set(key, {
      ...existing,
      related_topics: normalizeRelatedTopics([
        ...(existing.related_topics ?? []),
        ...(draft.related_topics ?? []),
      ]),
      source: compareSources(existing.source, draft.source) <= 0 ? existing.source : draft.source,
    });
  }

  return Array.from(deduped.values());
}

function compareSources(
  left: KnowledgeEntryDraft['source'],
  right: KnowledgeEntryDraft['source'],
): number {
  if (left.page !== right.page) {
    return left.page - right.page;
  }
  if (left.line_start !== right.line_start) {
    return left.line_start - right.line_start;
  }
  return left.line_end - right.line_end;
}

function isBroadSynthesisQuestion(question: string): boolean {
  const value = question.toLowerCase();
  return [
    'summarize',
    'summary',
    'themes',
    'theme',
    'patterns',
    'interesting',
    'explore',
    'strongest',
    'overview',
    'what are they',
    'what else',
    'topics',
    'across my sources',
  ].some((pattern) => value.includes(pattern));
}

function threadTitleFromQuestion(question: string): string {
  const trimmed = question.trim();
  if (!trimmed) {
    return 'New thread';
  }
  return trimmed.length > 72 ? `${trimmed.slice(0, 72).trim()}...` : trimmed;
}

function compareStoredChatMessages(
  left: Pick<ChatMessageRecord, 'created_at' | 'role'>,
  right: Pick<ChatMessageRecord, 'created_at' | 'role'>,
): number {
  const leftTime = left.created_at instanceof Timestamp
    ? left.created_at.toMillis()
    : left.created_at instanceof Date
      ? left.created_at.getTime()
      : 0;
  const rightTime = right.created_at instanceof Timestamp
    ? right.created_at.toMillis()
    : right.created_at instanceof Date
      ? right.created_at.getTime()
      : 0;

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  if (left.role === right.role) {
    return 0;
  }
  return left.role === 'user' ? -1 : 1;
}

async function commitSetOperations(
  operations: Array<{ ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }>,
): Promise<void> {
  for (let index = 0; index < operations.length; index += 400) {
    const batch = db.batch();
    for (const operation of operations.slice(index, index + 400)) {
      batch.set(operation.ref, operation.data, { merge: true });
    }
    await batch.commit();
  }
}

async function deleteSnapshotDocs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
): Promise<void> {
  for (let index = 0; index < docs.length; index += 400) {
    const batch = db.batch();
    for (const doc of docs.slice(index, index + 400)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

function dedupeById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    if (seen.has(value.id)) {
      continue;
    }
    seen.add(value.id);
    result.push(value);
  }

  return result;
}

function tokenize(value: string): string[] {
  return tokenizeText(value);
}

export function newDocumentRecord(params: {
  userId: string;
  filename: string;
  fileType: DocumentRecord['file_type'];
  storagePath: string | null;
  sourceType: 'file' | 'url';
  sourceUrl?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  title?: string | null;
  atlasId?: string | null;
}): DocumentRecord {
  return {
    user_id: params.userId,
    filename: params.filename,
    file_type: params.fileType,
    storage_path: params.storagePath,
    source_type: params.sourceType,
    source_url: params.sourceUrl ?? null,
    status: 'pending',
    processing_stage: 'queued',
    processed_chunks: 0,
    total_chunks: 0,
    page_count: 0,
    wiki_pages_generated: 0,
    citation_count: 0,
    collection_id: null,
    atlas_id: params.atlasId ?? null,
    uploaded_at: FieldValue.serverTimestamp(),
    indexed_at: null,
    deleted_at: null,
    last_heartbeat_at: FieldValue.serverTimestamp(),
    visible: true,
    mime_type: params.mimeType ?? null,
    file_size: params.fileSize ?? null,
    title: params.title ?? null,
    ai_usage: emptyDocumentAiUsage(),
    error_message: null,
    failure_code: null,
  };
}

export function clientTimestamp(): FirebaseFirestore.Timestamp {
  return Timestamp.now();
}

async function enqueueWikiTopicSummaryJobs(
  userId: string,
  atlasId: string | null,
  topicNames: string[],
  documentId: string,
): Promise<void> {
  if (topicNames.length === 0) {
    return;
  }

  await commitSetOperations(
    dedupeStrings(topicNames).map((topicName) => ({
      ref: wikiTopicJobsCollection.doc(generateId('topicjob')),
      data: {
        user_id: userId,
        atlas_id: atlasId,
        topic_id: topicDocumentId(userId, topicName),
        topic_name: topicName,
        triggered_by_document_id: documentId,
        created_at: FieldValue.serverTimestamp(),
      } satisfies WikiTopicJobRecord,
    })),
  );
}

async function setDocumentProcessingState(
  documentRef: FirebaseFirestore.DocumentReference,
  data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
): Promise<void> {
  await documentRef.set(
    {
      ...data,
      last_heartbeat_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

function classifyProcessingFailure(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes('credits are depleted') || message.includes('resource_exhausted')) {
    return 'ai_quota_exhausted';
  }

  if (message.includes('rate limit')) {
    return 'ai_rate_limited';
  }

  if (message.includes('no extractable text')) {
    return 'no_extractable_text';
  }

  return 'ingestion_failed';
}

async function addDocumentAiUsage(
  documentRef: FirebaseFirestore.DocumentReference,
  usage: ModelUsage,
  phase: 'compile' | 'summary',
): Promise<void> {
  if (usage.call_count <= 0) {
    return;
  }

  await documentRef.set(
    {
      'ai_usage.model': usage.model,
      'ai_usage.prompt_tokens': FieldValue.increment(usage.prompt_tokens),
      'ai_usage.output_tokens': FieldValue.increment(usage.output_tokens),
      'ai_usage.total_tokens': FieldValue.increment(usage.total_tokens),
      'ai_usage.call_count': FieldValue.increment(usage.call_count),
      'ai_usage.compile_call_count': FieldValue.increment(phase === 'compile' ? usage.call_count : 0),
      'ai_usage.summary_call_count': FieldValue.increment(phase === 'summary' ? usage.call_count : 0),
      last_heartbeat_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

function emptyDocumentAiUsage(): DocumentAiUsage {
  return {
    model: 'gemini-3-flash-preview',
    prompt_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    call_count: 0,
    compile_call_count: 0,
    summary_call_count: 0,
  };
}

function emptyModelUsage(): ModelUsage {
  return {
    model: 'gemini-3-flash-preview',
    prompt_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    call_count: 0,
  };
}

function mergeUsage(left: ModelUsage, right: ModelUsage): ModelUsage {
  return {
    model: right.model || left.model,
    prompt_tokens: left.prompt_tokens + right.prompt_tokens,
    output_tokens: left.output_tokens + right.output_tokens,
    total_tokens: left.total_tokens + right.total_tokens,
    call_count: left.call_count + right.call_count,
  };
}

async function parallelMapLimit<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, values.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
