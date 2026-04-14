import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { answerQuestion, compileKnowledgeEntries, summarizeTopic } from './gemini';
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
  DocumentRecord,
  DocumentAiUsage,
  ExtractBlock,
  KnowledgeEntryDraft,
  KnowledgeEntryRecord,
  ModelUsage,
  QueryCitationSnapshot,
  TopicEntryPreview,
  WikiTopicJobRecord,
} from './types';

const documentsCollection = db.collection('documents');
const rawExtractsCollection = db.collection('raw_extracts');
const knowledgeEntriesCollection = db.collection('knowledge_entries');
const wikiTopicsCollection = db.collection('wiki_topics');
const queriesCollection = db.collection('queries');
const wikiTopicJobsCollection = db.collection('wiki_topic_jobs');

const compileChunkConcurrency = 6;
const maxTopicPreviewEntries = 12;
const minAnswerEntries = 18;
const maxAnswerEntries = 48;

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

  await enqueueWikiTopicSummaryJobs(params.userId, topicsToRefresh, params.documentId);

  await documentsCollection.doc(params.documentId).delete();

  return {
    deletedTopicIds,
    updatedTopicIds,
  };
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

    await writeRawExtracts(document.id, document.user_id, blocks);

    await setDocumentProcessingState(documentRef, {
      processing_stage: 'compiling_knowledge',
    });

    const compilation = await buildKnowledgeEntries(document.id, document.user_id, blocks, chunks, async (completed) => {
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

    const topicNames = await upsertWikiTopics(document.user_id, document.id, entries);
    await enqueueWikiTopicSummaryJobs(document.user_id, topicNames, document.id);

    await documentRef.set(
      {
        status: 'indexed',
        processing_stage: 'indexed',
        processed_chunks: chunks.length,
        total_chunks: chunks.length,
        page_count: Math.max(...blocks.map((block) => block.page)),
        wiki_pages_generated: new Set(entries.map((entry) => entry.topic)).size,
        citation_count: entries.length,
        indexed_at: FieldValue.serverTimestamp(),
        last_heartbeat_at: FieldValue.serverTimestamp(),
        error_message: null,
        failure_code: null,
        title: extraction.title ?? document.title ?? null,
      },
      { merge: true },
    );
  } catch (error) {
    logger.error('Document ingestion failed', { documentId: document.id, error });
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
  blocks: ExtractBlock[],
): Promise<void> {
  const writeOperations = blocks.map((block) => ({
    ref: rawExtractsCollection.doc(
      makeExtractId(documentId, block.page, block.lineStart, block.lineEnd),
    ),
    data: {
      document_id: documentId,
      user_id: userId,
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
          last_updated: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }),
  );

  return topicNames;
}

export async function runAtlasQuery(params: {
  userId: string;
  question: string;
  topicIds?: string[];
  scopeTopicName?: string | null;
}): Promise<{
  answer: string;
  citedEntryIds: string[];
  citedPassages: QueryCitationSnapshot[];
  scopedTopicIds: string[];
  knowledgeGap: boolean;
}> {
  const trimmedQuestion = params.question.trim();
  if (!trimmedQuestion) {
    throw new Error('Question is required.');
  }

  const topics = await loadCandidateTopics(params.userId, trimmedQuestion, params.topicIds);
  const tokens = tokenize(trimmedQuestion);
  const previewEntries = dedupeById(
    topics.flatMap((topic) => topic.retrieval_entries ?? []),
  );
  const previewRankedEntries = rankEntriesForQuestion(previewEntries, tokens).slice(0, maxAnswerEntries);

  let uniqueEntries = previewRankedEntries;

  if (uniqueEntries.length < minAnswerEntries || shouldFetchAdditionalEntries(uniqueEntries, tokens)) {
    const fallbackEntryIds = topics.flatMap((topic) => topic.entry_ids)
      .filter((entryId) => !uniqueEntries.some((entry) => entry.id === entryId))
      .slice(0, 36);

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
      ).slice(0, maxAnswerEntries);
    }
  }

  if (uniqueEntries.length === 0) {
    return {
      answer:
        "This topic isn't in your knowledge base yet. Upload source material so Living Atlas can answer it with citations.",
      citedEntryIds: [],
      citedPassages: [],
      scopedTopicIds: topics.map((topic) => topic.id),
      knowledgeGap: true,
    };
  }

  logger.info('Atlas query candidates selected', {
    userId: params.userId,
    topicCount: topics.length,
    previewEntryCount: previewEntries.length,
    answerEntryCount: uniqueEntries.length,
  });

  const response = await answerQuestion({
    question: trimmedQuestion,
    entries: uniqueEntries.map((entry) => ({
      id: entry.id,
      claim: entry.claim,
      topic: entry.topic,
      source: entry.source,
    })),
  });

  const citedEntryIds = response.cited_entry_ids.filter((entryId) =>
    uniqueEntries.some((entry) => entry.id === entryId),
  );
  const citedPassages = await hydrateCitationSnapshots(params.userId, uniqueEntries, citedEntryIds);

  await queriesCollection.add({
    user_id: params.userId,
    question: trimmedQuestion,
    answer: response.answer,
    cited_entry_ids: citedEntryIds,
    cited_passages: citedPassages,
    knowledge_gap: response.knowledge_gap,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return {
    answer: response.answer,
    citedEntryIds,
    citedPassages,
    scopedTopicIds: topics.map((topic) => topic.id),
    knowledgeGap: response.knowledge_gap,
  };
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

async function loadCandidateTopics(
  userId: string,
  question: string,
  forcedTopicIds?: string[],
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

    const selectedFromCache = cachedScored.filter((topic) => topic.score > 0).slice(0, 6);
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

  const selected = scored.filter((topic) => topic.score > 0).slice(0, 6);
  return (selected.length > 0 ? selected : scored.slice(0, 6)).map((topic) => ({
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
