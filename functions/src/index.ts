import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions';
import { randomUUID } from 'node:crypto';
import { db, storage } from './firebase';
import { geminiApiKey } from './gemini';
import {
  clientTimestamp,
  deleteChatEntityForUser,
  deleteDocumentForUser,
  getWikiTopicDetailsForUser,
  loadDocumentRecord,
  newDocumentRecord,
  processWikiTopicSummaryJob,
  processStoredDocument,
  processUrlDocument,
  runAtlasQuery,
} from './pipeline';
import { buildStoragePath, detectFileType, extractDocumentIdFromPath } from './utils';

const callableRegion = 'us-central1';
const storageTriggerRegion = 'us-west1';

async function countPublicAtlasCollection(collectionName: string, userId: string, atlasId: string): Promise<number> {
  const snapshot = await db
    .collection(collectionName)
    .where('user_id', '==', userId)
    .where('atlas_id', '==', atlasId)
    .count()
    .get();
  return snapshot.data().count;
}

function normalizeTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

type PublicDocumentCandidate = Record<string, unknown> & { id: string };

function serializePublicAtlas(
  atlasId: string,
  atlas: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: atlasId,
    ...atlas,
    created_at: normalizeTimestamp(atlas.created_at),
    updated_at: normalizeTimestamp(atlas.updated_at),
  };
}

async function buildDocumentDownloadUrl(storagePath: string): Promise<string> {
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  const [metadata] = await file.getMetadata();
  const existingTokens = String(metadata.metadata?.firebaseStorageDownloadTokens ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const token = existingTokens[0] ?? randomUUID();

  if (existingTokens.length === 0) {
    await file.setMetadata({
      metadata: {
        ...(metadata.metadata ?? {}),
        firebaseStorageDownloadTokens: token,
      },
    });
  }

  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

async function loadPublicAtlasById(atlasId: string) {
  const atlasSnapshot = await db.collection('atlases').doc(atlasId).get();
  if (!atlasSnapshot.exists) {
    throw new HttpsError('not-found', 'Atlas not found.');
  }

  const atlas = atlasSnapshot.data() as Record<string, unknown> | undefined;
  if (!atlas?.is_public || !atlas.user_id) {
    throw new HttpsError('permission-denied', 'Atlas is not public.');
  }

  return {
    id: atlasSnapshot.id,
    user_id: String(atlas.user_id),
    is_public: atlas.is_public === true,
    ...atlas,
  };
}

async function loadPublicAtlasBySlug(slug: string) {
  const trimmedSlug = slug.trim();
  if (!trimmedSlug) {
    throw new HttpsError('invalid-argument', 'slug is required.');
  }

  const snapshot = await db
    .collection('atlases')
    .where('slug', '==', trimmedSlug)
    .where('is_public', '==', true)
    .limit(1)
    .get();

  const atlasSnapshot = snapshot.docs[0];
  if (!atlasSnapshot) {
    throw new HttpsError('not-found', 'Atlas not found.');
  }

  const atlas = atlasSnapshot.data() as Record<string, unknown>;
  return {
    id: atlasSnapshot.id,
    user_id: String(atlas.user_id ?? ''),
    is_public: atlas.is_public === true,
    ...atlas,
  };
}

async function documentAccessAllowed(requestUid: string | undefined, documentId: string) {
  const document = await loadDocumentRecord(documentId);
  if (requestUid && document.user_id === requestUid) {
    return document;
  }

  if (!document.atlas_id) {
    throw new HttpsError('permission-denied', 'You do not have access to this document.');
  }

  const atlas = await loadPublicAtlasById(document.atlas_id);
  if (atlas.user_id !== document.user_id) {
    throw new HttpsError('permission-denied', 'You do not have access to this document.');
  }
  if (document.visible === false) {
    throw new HttpsError('permission-denied', 'You do not have access to this document.');
  }

  return document;
}

async function findPublicDocumentByFilename(atlasId: string, filename: string) {
  const atlas = await loadPublicAtlasById(atlasId);
  const trimmedFilename = filename.trim();
  if (!trimmedFilename) {
    throw new HttpsError('invalid-argument', 'filename is required.');
  }

  const snapshot = await db
    .collection('documents')
    .where('user_id', '==', atlas.user_id)
    .where('atlas_id', '==', atlas.id)
    .where('filename', '==', trimmedFilename)
    .limit(10)
    .get();

  const candidates: PublicDocumentCandidate[] = snapshot.docs
    .map<PublicDocumentCandidate>((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }))
    .filter((document) => document.visible !== false);

  const exactTitleMatch = candidates.find((document) => String(document.title ?? '').trim() === trimmedFilename);
  if (exactTitleMatch) {
    return exactTitleMatch;
  }

  const indexedCandidate = candidates.find((document) => document.status === 'indexed');
  if (indexedCandidate) {
    return indexedCandidate;
  }

  const firstCandidate = candidates[0];
  if (firstCandidate) {
    return firstCandidate;
  }

  throw new HttpsError('not-found', 'Document file is unavailable.');
}

function normalizeAtlasId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const prepareDocumentUpload = onCall({ region: callableRegion, cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const filename = String(request.data?.filename ?? '').trim();
  const mimeType = String(request.data?.mimeType ?? '').trim() || null;
  const fileSize = Number(request.data?.fileSize ?? 0);
  const atlasId = normalizeAtlasId(request.data?.atlasId);

  if (!filename) {
    throw new HttpsError('invalid-argument', 'filename is required.');
  }

  let fileType;
  try {
    fileType = detectFileType(filename, mimeType);
  } catch (error) {
    throw new HttpsError(
      'invalid-argument',
      error instanceof Error ? error.message : 'Unsupported file type.',
    );
  }

  const documentRef = db.collection('documents').doc();
  const storagePath = buildStoragePath(request.auth.uid, documentRef.id, filename);

  await documentRef.set(
    newDocumentRecord({
      userId: request.auth.uid,
      filename,
      fileType,
      storagePath,
      sourceType: 'file',
      mimeType,
      fileSize: Number.isFinite(fileSize) ? fileSize : null,
      atlasId,
    }),
  );

  return {
    documentId: documentRef.id,
    storagePath,
    fileType,
    createdAt: clientTimestamp().toMillis(),
  };
});

export const getPublicAtlasBySlug = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const slug = String(request.data?.slug ?? '').trim();
    if (!slug) {
      throw new HttpsError('invalid-argument', 'slug is required.');
    }

    const atlas = await loadPublicAtlasBySlug(slug);
    return {
      atlas: serializePublicAtlas(atlas.id, atlas),
    };
  },
);

export const submitUrlDocument = onCall(
  { region: callableRegion, cors: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const url = String(request.data?.url ?? '').trim();
    const atlasId = normalizeAtlasId(request.data?.atlasId);
    if (!url) {
      throw new HttpsError('invalid-argument', 'url is required.');
    }

    try {
      new URL(url);
    } catch {
      throw new HttpsError('invalid-argument', 'Enter a valid URL.');
    }

    const documentRef = db.collection('documents').doc();
    await documentRef.set(
      newDocumentRecord({
        userId: request.auth.uid,
        filename: url,
        fileType: 'url',
        storagePath: null,
        sourceType: 'url',
        sourceUrl: url,
        title: url,
        atlasId,
      }),
    );

    return { documentId: documentRef.id };
  },
);

export const askAtlas = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 180,
    memory: '1GiB',
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const question = String(request.data?.question ?? '').trim();
    const threadId = String(request.data?.threadId ?? '').trim() || null;
    const atlasId = normalizeAtlasId(request.data?.atlasId);
    const topicIds = Array.isArray(request.data?.topicIds)
      ? request.data.topicIds.map((value: unknown) => String(value)).filter(Boolean)
      : undefined;

    if (!question) {
      throw new HttpsError('invalid-argument', 'question is required.');
    }

    try {
      return await runAtlasQuery({
        userId: request.auth.uid,
        atlasId,
        question,
        topicIds,
        threadId,
      });
    } catch (error) {
      logger.error('askAtlas failed', { errorMessage: error instanceof Error ? error.message : String(error) });
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to answer question.',
      );
    }
  },
);

export const deleteDocument = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 300,
    memory: '1GiB',
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const documentId = String(request.data?.documentId ?? '').trim();
    if (!documentId) {
      throw new HttpsError('invalid-argument', 'documentId is required.');
    }

    try {
      return await deleteDocumentForUser({
        documentId,
        userId: request.auth.uid,
      });
    } catch (error) {
      logger.error('deleteDocument failed', { documentId, errorMessage: error instanceof Error ? error.message : String(error) });
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to delete document.',
      );
    }
  },
);

export const getWikiTopicDetails = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const topicId = String(request.data?.topicId ?? '').trim();
    if (!topicId) {
      throw new HttpsError('invalid-argument', 'topicId is required.');
    }

    try {
      return await getWikiTopicDetailsForUser({
        userId: request.auth.uid,
        topicId,
      });
    } catch (error) {
      logger.error('getWikiTopicDetails failed', { topicId, errorMessage: error instanceof Error ? error.message : String(error) });
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to load topic details.',
      );
    }
  },
);

export const getPublicAtlasUsage = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const atlasId = String(request.data?.atlasId ?? '').trim();
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    const atlas = await loadPublicAtlasById(atlasId);

    const [documents, knowledgeEntries, wikiTopics, chatThreads] = await Promise.all([
      countPublicAtlasCollection('documents', atlas.user_id, atlasId),
      countPublicAtlasCollection('knowledge_entries', atlas.user_id, atlasId),
      countPublicAtlasCollection('wiki_topics', atlas.user_id, atlasId),
      countPublicAtlasCollection('chat_threads', atlas.user_id, atlasId),
    ]);

    return {
      documents,
      knowledge_entries: knowledgeEntries,
      wiki_topics: wikiTopics,
      queries: 0,
      chat_threads: chatThreads,
      total: documents + knowledgeEntries + wikiTopics + chatThreads,
    };
  },
);

export const getPublicAtlasDocuments = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const atlasId = String(request.data?.atlasId ?? '').trim();
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    const atlas = await loadPublicAtlasById(atlasId);
    const snapshot = await db
      .collection('documents')
      .where('user_id', '==', atlas.user_id)
      .where('atlas_id', '==', atlas.id)
      .where('visible', '==', true)
      .orderBy('uploaded_at', 'desc')
      .limit(250)
      .get();

    return {
      documents: snapshot.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          ...data,
          uploaded_at: normalizeTimestamp(data.uploaded_at),
          indexed_at: normalizeTimestamp(data.indexed_at),
          last_heartbeat_at: normalizeTimestamp(data.last_heartbeat_at),
        };
      }),
    };
  },
);

export const getPublicWikiContent = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const atlasId = String(request.data?.atlasId ?? '').trim();
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    const atlas = await loadPublicAtlasById(atlasId);

    const [articleSnapshot, topicSnapshot] = await Promise.all([
      db
        .collection('wiki_articles')
        .where('user_id', '==', atlas.user_id)
        .where('atlas_id', '==', atlasId)
        .orderBy('last_updated', 'desc')
        .limit(250)
        .get(),
      db
        .collection('wiki_topics')
        .where('user_id', '==', atlas.user_id)
        .where('atlas_id', '==', atlasId)
        .orderBy('last_updated', 'desc')
        .limit(250)
        .get(),
    ]);

    return {
      articles: articleSnapshot.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          ...data,
          created_at: normalizeTimestamp(data.created_at),
          last_updated: normalizeTimestamp(data.last_updated),
        };
      }),
      topics: topicSnapshot.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          ...data,
          last_updated: normalizeTimestamp(data.last_updated),
        };
      }),
    };
  },
);

export const getPublicWikiTopicDetails = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const topicId = String(request.data?.topicId ?? '').trim();
    if (!topicId) {
      throw new HttpsError('invalid-argument', 'topicId is required.');
    }

    const topicSnapshot = await db.collection('wiki_topics').doc(topicId).get();
    if (!topicSnapshot.exists) {
      throw new HttpsError('not-found', 'Topic not found.');
    }

    const topic = topicSnapshot.data() as Record<string, unknown> | undefined;
    if (!topic?.atlas_id || !topic.user_id) {
      throw new HttpsError('permission-denied', 'Topic is not public.');
    }

    const atlas = await loadPublicAtlasById(String(topic.atlas_id));
    if (atlas.user_id !== String(topic.user_id)) {
      throw new HttpsError('permission-denied', 'Topic is not public.');
    }

    const entryIds = ((topic.entry_ids as string[] | undefined) ?? []).slice(0, 250);
    if (entryIds.length === 0) {
      return { entries: [], sourceDocuments: [] };
    }

    const entrySnapshots = await Promise.all(
      entryIds.map((entryId) => db.collection('knowledge_entries').doc(entryId).get()),
    );

    const entryRecords = entrySnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() as Record<string, unknown>) })) as Array<
        Record<string, unknown> & { id: string }
      >;

    const entries = entryRecords.filter(
        (entry) =>
          String(entry.user_id ?? '') === atlas.user_id &&
          String(entry.atlas_id ?? '') === atlas.id &&
          entry.orphaned !== true,
      );

    const documentIds = Array.from(
      new Set(entries.map((entry) => String(entry.document_id ?? '')).filter(Boolean)),
    ).slice(0, 30);
    const documentSnapshots = await Promise.all(
      documentIds.map((documentId) => db.collection('documents').doc(documentId).get()),
    );

    const sourceDocumentRecords = documentSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() as Record<string, unknown>) })) as Array<
        Record<string, unknown> & { id: string }
      >;

    const sourceDocuments = sourceDocumentRecords
      .filter(
        (document) =>
          String(document.user_id ?? '') === atlas.user_id &&
          String(document.atlas_id ?? '') === atlas.id &&
          document.visible !== false,
      )
      .map((document) => ({
        ...document,
        uploaded_at: normalizeTimestamp(document.uploaded_at),
        indexed_at: normalizeTimestamp(document.indexed_at),
        last_heartbeat_at: normalizeTimestamp(document.last_heartbeat_at),
      }));

    return { entries, sourceDocuments };
  },
);

export const getWikiSourceDocumentLink = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const documentId = String(request.data?.documentId ?? '').trim();
    const atlasId = String(request.data?.atlasId ?? '').trim();
    const filename = String(request.data?.filename ?? '').trim();
    if (!documentId) {
      throw new HttpsError('invalid-argument', 'documentId is required.');
    }

    let document:
      | {
          id: string;
          source_type?: unknown;
          source_url?: unknown;
          storage_path?: unknown;
        }
      | (Record<string, unknown> & { id: string });

    try {
      document = await documentAccessAllowed(request.auth?.uid, documentId);
    } catch (error) {
      if (!atlasId || !filename) {
        throw error;
      }
      document = await findPublicDocumentByFilename(atlasId, filename);
    }

    if (document.source_type === 'url' && typeof document.source_url === 'string' && document.source_url) {
      return { url: document.source_url };
    }

    if (typeof document.storage_path !== 'string' || !document.storage_path) {
      throw new HttpsError('not-found', 'Document file is unavailable.');
    }

    return { url: await buildDocumentDownloadUrl(document.storage_path) };
  },
);

export const deleteQuery = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const queryId = String(request.data?.queryId ?? '').trim();
    if (!queryId) {
      throw new HttpsError('invalid-argument', 'queryId is required.');
    }

    try {
      return await deleteChatEntityForUser({
        chatId: queryId,
        userId: request.auth.uid,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete chat.';
      if (message === 'Chat not found.') {
        throw new HttpsError('not-found', message);
      }
      if (message === 'You do not have access to this chat.') {
        throw new HttpsError('permission-denied', message);
      }
      throw new HttpsError('internal', message);
    }
  },
);

export const ingestUploadedDocument = onObjectFinalized(
  {
    region: storageTriggerRegion,
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [geminiApiKey],
  },
  async (event) => {
    const storagePath = event.data.name;
    if (!storagePath || !storagePath.startsWith('users/')) {
      return;
    }

    const documentId = extractDocumentIdFromPath(storagePath);
    if (!documentId) {
      logger.warn('Ignoring storage object without a Living Wiki document path', { storagePath });
      return;
    }

    try {
      const document = await loadDocumentRecord(documentId);
      if (document.storage_path !== storagePath || document.status === 'indexed') {
        return;
      }

      await processStoredDocument(documentId);
    } catch (error) {
      logger.error('ingestUploadedDocument failed', {
        storagePath,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  },
);

export const ingestSubmittedUrl = onDocumentCreated(
  {
    region: callableRegion,
    document: 'documents/{documentId}',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [geminiApiKey],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      return;
    }

    const data = snapshot.data();
    if (!data || data.source_type !== 'url' || data.status !== 'pending') {
      return;
    }

    try {
      await processUrlDocument(snapshot.id);
    } catch (error) {
      logger.error('ingestSubmittedUrl failed', { documentId: snapshot.id, errorMessage: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
);

export const refreshWikiTopicSummary = onDocumentCreated(
  {
    region: callableRegion,
    document: 'wiki_topic_jobs/{jobId}',
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: [geminiApiKey],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      return;
    }

    try {
      await processWikiTopicSummaryJob(snapshot.id);
    } catch (error) {
      logger.error('refreshWikiTopicSummary failed', { jobId: snapshot.id, errorMessage: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
);
