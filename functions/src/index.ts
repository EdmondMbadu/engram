import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions';
import { createHash, randomUUID } from 'node:crypto';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { db, storage } from './firebase';
import { geminiApiKey, generateAnswerCard, generateAnswerQuiz } from './gemini';
import {
  getStoredCityPulseSnapshot,
  listEnabledCityAtlasIds,
  refreshStoredCityPulseSnapshot,
} from './city-pulse';
import {
  getStoredPhillyGreenJobsSnapshot,
  refreshStoredPhillyGreenJobsSnapshot,
} from './green-jobs';
import { fetchHtmlWithFallback, looksLikeAntiBotChallenge } from './html-fetch';
import {
  clientTimestamp,
  deleteChatEntityForUser,
  deleteDocumentForUser,
  getPublicChatState as loadPublicChatState,
  getWikiTopicDetailsForUser,
  loadDocumentRecord,
  newDocumentRecord,
  processWikiTopicSummaryJob,
  processStoredDocument,
  processUrlDocument,
  runAtlasQuery,
  runPublicAtlasQuery,
} from './pipeline';
import { buildStoragePath, detectFileType, extractDocumentIdFromPath } from './utils';
import type { AnswerCardRecord, AnswerQuizQuestionRecord, AnswerQuizRecord, MappableLocation, SupportedFileType } from './types';

const callableRegion = 'us-central1';
const storageTriggerRegion = 'us-west1';
const staleIngestionThresholdMinutes = 10;
const defaultRetryLimit = 50;
const staleRetryBatchLimit = 200;
const maxGoogleDriveImportFiles = 10;
const urlIngestionTriggerOptions = {
  region: callableRegion,
  timeoutSeconds: 540,
  memory: '2GiB' as const,
  cpu: 2,
  concurrency: 1,
  maxInstances: 16,
  secrets: [geminiApiKey],
};

type GoogleDriveImportSelection = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
};

type GoogleDriveFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
};

type GoogleDriveImportPlan = {
  fileType: SupportedFileType;
  filename: string;
  title: string;
  requestMimeType: string;
  uploadMimeType: string;
  mode: 'download' | 'export';
};

export const fetchProxy = onRequest(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '1GiB',
  },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).send('Method not allowed.');
      return;
    }

    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl) {
      res.status(400).send('Missing url param.');
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(rawUrl);
    } catch {
      res.status(400).send('Invalid url param.');
      return;
    }

    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      res.status(400).send('Only http and https URLs are allowed.');
      return;
    }

    try {
      const fetched = await fetchHtmlWithFallback(targetUrl.toString(), {
        timeoutMs: 90_000,
      });
      const blockedByAntiBot = looksLikeAntiBotChallenge(fetched.html);

      if (fetched.status >= 400 || blockedByAntiBot) {
        const upstreamStatus = fetched.status || 0;
        const message = blockedByAntiBot
          ? `The source site blocked server-side scraping with an anti-bot challenge. Try a less-protected source such as an RSS feed, a public archive page, or an individual article URL.`
          : `The source site responded with ${upstreamStatus}.`;

        logger.warn('fetchProxy upstream blocked or failed', {
          url: targetUrl.toString(),
          upstreamStatus,
          blockedByAntiBot,
        });

        res.status(blockedByAntiBot ? 422 : upstreamStatus);
        res.set('Content-Type', 'application/json; charset=utf-8');
        res.send({
          code: blockedByAntiBot ? 'site-blocked-bot-challenge' : 'upstream-fetch-failed',
          message,
          upstreamStatus,
          targetHost: targetUrl.hostname,
        });
        return;
      }

      res.status(200);
      res.set(
        'Content-Type',
        fetched.contentType && fetched.contentType.includes('text/html')
          ? fetched.contentType
          : 'text/html; charset=utf-8',
      );
      res.send(fetched.html);
    } catch (error) {
      logger.error('fetchProxy failed', {
        url: targetUrl.toString(),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      res.status(500).send('Fetch failed.');
    }
  },
);

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

function timestampToMillis(value: unknown): number | null {
  if (!value) {
    return null;
  }
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate().getTime();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  return null;
}

function normalizeGoogleDriveSelections(value: unknown): GoogleDriveImportSelection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = typeof entry === 'object' && entry ? (entry as Record<string, unknown>) : null;
      if (!record) {
        return null;
      }

      const id = String(record['id'] ?? '').trim();
      const name = String(record['name'] ?? '').trim();
      const mimeType = String(record['mimeType'] ?? '').trim();
      const sizeValue = Number(record['size']);
      const size = Number.isFinite(sizeValue) ? sizeValue : null;

      if (!id || !name || !mimeType) {
        return null;
      }

      return { id, name, mimeType, size };
    })
    .filter((entry): entry is GoogleDriveImportSelection => entry !== null)
    .slice(0, maxGoogleDriveImportFiles);
}

function deriveGoogleDriveFilename(name: string, extension: string): string {
  const trimmed = name.trim();
  const suffix = `.${extension}`;
  if (trimmed.toLowerCase().endsWith(suffix.toLowerCase())) {
    return trimmed;
  }

  return `${trimmed}${suffix}`;
}

function deriveGoogleDriveUploadName(metadata: GoogleDriveFileMetadata): string {
  const lowerName = metadata.name.trim().toLowerCase();

  if (metadata.mimeType === 'application/pdf') {
    return deriveGoogleDriveFilename(metadata.name, 'pdf');
  }
  if (metadata.mimeType === 'application/msword') {
    return deriveGoogleDriveFilename(metadata.name, 'doc');
  }
  if (metadata.mimeType === 'application/vnd.ms-powerpoint') {
    return deriveGoogleDriveFilename(metadata.name, 'ppt');
  }
  if (metadata.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return deriveGoogleDriveFilename(metadata.name, 'docx');
  }
  if (metadata.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return deriveGoogleDriveFilename(metadata.name, 'pptx');
  }
  if (metadata.mimeType === 'text/plain') {
    return lowerName.endsWith('.md')
      ? deriveGoogleDriveFilename(metadata.name, 'md')
      : deriveGoogleDriveFilename(metadata.name, 'txt');
  }
  if (metadata.mimeType === 'text/markdown') {
    return deriveGoogleDriveFilename(metadata.name, 'md');
  }
  if (metadata.mimeType === 'image/png') {
    return deriveGoogleDriveFilename(metadata.name, 'png');
  }
  if (metadata.mimeType === 'image/jpeg') {
    return deriveGoogleDriveFilename(metadata.name, lowerName.endsWith('.jpeg') ? 'jpeg' : 'jpg');
  }

  return metadata.name.trim();
}

function resolveGoogleDriveImportPlan(metadata: GoogleDriveFileMetadata): GoogleDriveImportPlan {
  const normalizedName = metadata.name.trim();
  const title = normalizedName || 'Untitled document';

  switch (metadata.mimeType) {
    case 'application/vnd.google-apps.document':
      return {
        fileType: 'docx',
        filename: deriveGoogleDriveFilename(title, 'docx'),
        title,
        requestMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploadMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        mode: 'export',
      };
    case 'application/vnd.google-apps.presentation':
      return {
        fileType: 'pptx',
        filename: deriveGoogleDriveFilename(title, 'pptx'),
        title,
        requestMimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        uploadMimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        mode: 'export',
      };
    case 'application/vnd.google-apps.spreadsheet':
      return {
        fileType: 'pdf',
        filename: deriveGoogleDriveFilename(title, 'pdf'),
        title,
        requestMimeType: 'application/pdf',
        uploadMimeType: 'application/pdf',
        mode: 'export',
      };
    default: {
      const filename = deriveGoogleDriveUploadName(metadata);
      const fileType = detectFileType(filename, metadata.mimeType);
      return {
        fileType,
        filename,
        title,
        requestMimeType: metadata.mimeType,
        uploadMimeType: metadata.mimeType,
        mode: 'download',
      };
    }
  }
}

async function fetchGoogleDriveMetadata(
  accessToken: string,
  fileId: string,
): Promise<GoogleDriveFileMetadata> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size&supportsAllDrives=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to read Google Drive metadata (${response.status}): ${body.slice(0, 240)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const name = String(data['name'] ?? '').trim();
  const mimeType = String(data['mimeType'] ?? '').trim();
  const id = String(data['id'] ?? fileId).trim();
  const sizeValue = Number(data['size']);

  if (!id || !name || !mimeType) {
    throw new Error('Google Drive file metadata was incomplete.');
  }

  return {
    id,
    name,
    mimeType,
    size: Number.isFinite(sizeValue) ? sizeValue : null,
  };
}

async function fetchGoogleDriveFileBuffer(params: {
  accessToken: string;
  fileId: string;
  plan: GoogleDriveImportPlan;
}): Promise<Buffer> {
  const endpoint =
    params.plan.mode === 'export'
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.fileId)}/export?mimeType=${encodeURIComponent(params.plan.requestMimeType)}`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.fileId)}?alt=media&supportsAllDrives=true`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to download Google Drive file (${response.status}): ${body.slice(0, 240)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

type StaleUrlDocumentCandidate = FirebaseFirestore.QueryDocumentSnapshot;

async function collectStaleUrlDocuments(params: {
  userId: string | null;
  atlasId: string | null;
  staleMinutes: number;
  limit: number;
}): Promise<StaleUrlDocumentCandidate[]> {
  const cutoffMs = Date.now() - params.staleMinutes * 60_000;
  const staleDocs = new Map<string, StaleUrlDocumentCandidate>();

  for (const status of ['processing', 'pending'] as const) {
    let query = db.collection('documents').where('status', '==', status).limit(1000);
    if (params.userId) {
      query = query.where('user_id', '==', params.userId);
    }
    if (params.atlasId) {
      query = query.where('atlas_id', '==', params.atlasId);
    }

    const snapshot = await query.get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.source_type !== 'url') {
        continue;
      }

      const heartbeatMs = timestampToMillis(data.last_heartbeat_at);
      if (heartbeatMs === null || heartbeatMs >= cutoffMs) {
        continue;
      }

      staleDocs.set(doc.id, doc);
      if (staleDocs.size >= params.limit) {
        return Array.from(staleDocs.values());
      }
    }
  }

  return Array.from(staleDocs.values());
}

async function requeueStaleUrlDocuments(
  staleDocuments: StaleUrlDocumentCandidate[],
): Promise<void> {
  for (const doc of staleDocuments) {
    await doc.ref.set(
      {
        status: 'failed',
        processing_stage: 'failed',
        error_message: 'Retrying stale ingestion request.',
        failure_code: 'retrying_stale_ingestion',
        last_heartbeat_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await doc.ref.set(
      {
        status: 'pending',
        processing_stage: 'queued',
        processed_chunks: 0,
        total_chunks: 0,
        error_message: null,
        failure_code: null,
        last_heartbeat_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
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

async function assertAtlasOwner(atlasId: string | null, userId: string): Promise<void> {
  if (!atlasId) {
    return;
  }

  const atlasSnapshot = await db.collection('atlases').doc(atlasId).get();
  if (!atlasSnapshot.exists) {
    throw new HttpsError('not-found', 'Atlas not found.');
  }

  const atlas = atlasSnapshot.data() as Record<string, unknown> | undefined;
  if (!atlas?.user_id || String(atlas.user_id) !== userId) {
    throw new HttpsError('permission-denied', 'You do not have access to upload to this atlas.');
  }
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

function normalizeAnonymousVisitorId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) {
    return null;
  }

  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

function normalizeAnswerCardId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'cardId is required.');
  }

  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(trimmed)) {
    throw new HttpsError('invalid-argument', 'cardId is invalid.');
  }

  return trimmed;
}

function normalizeAnswerQuizId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'quizId is required.');
  }

  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(trimmed)) {
    throw new HttpsError('invalid-argument', 'quizId is invalid.');
  }

  return trimmed;
}

function normalizeOptionalSourceMessageId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{4,160}$/.test(trimmed) ? trimmed : null;
}

function normalizeSourceMessageKind(value: unknown): 'workspace' | 'public' | null {
  return value === 'workspace' || value === 'public' ? value : null;
}

function normalizeAnswerCardLocations(value: unknown): MappableLocation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const locations: MappableLocation[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const data = item as Record<string, unknown>;
    const name = typeof data.name === 'string' ? data.name.replace(/\s+/g, ' ').trim() : '';
    const searchQuery =
      typeof data.search_query === 'string' ? data.search_query.replace(/\s+/g, ' ').trim() : '';
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
        typeof data.address_hint === 'string' && data.address_hint.trim()
          ? data.address_hint.replace(/\s+/g, ' ').trim().slice(0, 240)
          : null,
    });

    if (locations.length >= 6) {
      break;
    }
  }

  return locations;
}

async function loadSourceAssistantMessage(params: {
  uid: string;
  sourceMessageKind: 'workspace' | 'public' | null;
  sourceMessageId: string | null;
  threadId: string | null;
  answer: string;
}): Promise<{
  ref: DocumentReference;
  data: Record<string, unknown>;
  kind: 'workspace' | 'public';
} | null> {
  const sourceKind = params.sourceMessageKind;
  if (!sourceKind) {
    return null;
  }

  const collection = sourceKind === 'public' ? db.collection('public_chat_messages') : db.collection('chat_messages');
  const allowed = (data: Record<string, unknown>) => {
    if (data.role !== 'assistant') {
      return false;
    }
    if (sourceKind === 'public') {
      return data.visitor_uid === params.uid;
    }
    return data.user_id === params.uid;
  };

  if (params.sourceMessageId) {
    const snapshot = await collection.doc(params.sourceMessageId).get();
    if (snapshot.exists) {
      const data = snapshot.data() ?? {};
      if (allowed(data) && (!params.threadId || data.thread_id === params.threadId)) {
        return { ref: snapshot.ref, data, kind: sourceKind };
      }
    }
  }

  if (!params.threadId || !params.answer.trim()) {
    return null;
  }

  const snapshot = await collection
    .where('thread_id', '==', params.threadId)
    .limit(80)
    .get();
  const match = snapshot.docs.find((doc) => {
    const data = doc.data();
    return allowed(data) && String(data.text ?? '') === params.answer;
  });

  return match ? { ref: match.ref, data: match.data(), kind: sourceKind } : null;
}

async function loadExistingAnswerCardForSource(params: {
  uid: string;
  threadId: string | null;
  answer: string;
}): Promise<{ id: string; data: Record<string, unknown> } | null> {
  if (!params.threadId || !params.answer.trim()) {
    return null;
  }

  const preview = params.answer.slice(0, 900);
  const snapshot = await db.collection('answer_cards')
    .where('source_thread_id', '==', params.threadId)
    .limit(50)
    .get();
  const match = snapshot.docs.find((doc) => {
    const data = doc.data();
    return data.owner_user_id === params.uid && String(data.answer_preview ?? '') === preview;
  });

  return match ? { id: match.id, data: match.data() } : null;
}

function serializeTimestamp(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate(): Date }).toDate()).toISOString();
  }
  return null;
}

function serializeAnswerCard(id: string, data: Record<string, unknown>) {
  return {
    id,
    atlasId: typeof data.atlas_id === 'string' ? data.atlas_id : null,
    atlasName: typeof data.atlas_name === 'string' ? data.atlas_name : null,
    question: String(data.question ?? ''),
    answerPreview: String(data.answer_preview ?? ''),
    title: String(data.title ?? 'A Philly Answer Worth Sharing'),
    subtitle: String(data.subtitle ?? 'A fast, shareable summary from Living Wiki Philly.'),
    keyFacts: Array.isArray(data.key_facts) ? data.key_facts.map(String).filter(Boolean).slice(0, 5) : [],
    didYouKnow: Array.isArray(data.did_you_know) ? data.did_you_know.map(String).filter(Boolean).slice(0, 3) : [],
    mappableLocations: normalizeAnswerCardLocations(data.mappable_locations),
    likeCount: Number(data.like_count ?? 0) || 0,
    sourceThreadId: typeof data.source_thread_id === 'string' ? data.source_thread_id : null,
    sourceAnswerMode: data.source_answer_mode === 'internet' ? 'internet' : data.source_answer_mode === 'wiki' ? 'wiki' : null,
    createdAt: serializeTimestamp(data.created_at),
    updatedAt: serializeTimestamp(data.updated_at),
  };
}

function serializeAnswerQuiz(id: string, data: Record<string, unknown>, leaderboard: unknown[] = []) {
  const questions = normalizeQuizQuestions(data.questions, false);
  return {
    id,
    answerCardId: typeof data.answer_card_id === 'string' ? data.answer_card_id : '',
    atlasId: typeof data.atlas_id === 'string' ? data.atlas_id : null,
    atlasName: typeof data.atlas_name === 'string' ? data.atlas_name : null,
    title: String(data.title ?? 'Philly Knowledge Challenge'),
    description: String(data.description ?? 'Test what you picked up from this Living Wiki Philly answer.'),
    sourceQuestion: String(data.source_question ?? ''),
    questionCount: questions.length,
    questions: questions.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      options: item.options,
    })),
    leaderboard,
    createdAt: serializeTimestamp(data.created_at),
    updatedAt: serializeTimestamp(data.updated_at),
  };
}

function normalizeQuizQuestions(value: unknown, includeCorrect: true): AnswerQuizQuestionRecord[];
function normalizeQuizQuestions(value: unknown, includeCorrect?: false): Array<Omit<AnswerQuizQuestionRecord, 'correct_option_id'> & { correct_option_id?: string }>;
function normalizeQuizQuestions(value: unknown, includeCorrect = false) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item): AnswerQuizQuestionRecord | null => {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const data = item as Record<string, unknown>;
    const id = typeof data.id === 'string' ? data.id.trim() : '';
    const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
    const correctOptionId = typeof data.correct_option_id === 'string' ? data.correct_option_id.trim() : '';
    const explanation = typeof data.explanation === 'string' ? data.explanation.trim() : '';
    const options = Array.isArray(data.options)
      ? data.options.map((option): { id: string; text: string } | null => {
          if (!option || typeof option !== 'object') {
            return null;
          }
          const optionData = option as Record<string, unknown>;
          const optionId = typeof optionData.id === 'string' ? optionData.id.trim() : '';
          const text = typeof optionData.text === 'string' ? optionData.text.trim() : '';
          return optionId && text ? { id: optionId, text } : null;
        }).filter((option): option is { id: string; text: string } => !!option)
      : [];

    if (!id || !prompt || options.length < 2 || !correctOptionId) {
      return null;
    }

    return {
      id,
      prompt,
      options,
      correct_option_id: includeCorrect ? correctOptionId : '',
      explanation,
    };
  }).filter((item): item is AnswerQuizQuestionRecord => !!item);
}

function buildQuizQuestionRecords(questions: Array<{ prompt: string; options: string[]; correct_option_index: number; explanation: string }>): AnswerQuizQuestionRecord[] {
  return questions.slice(0, 8).map((question, questionIndex) => {
    const options = question.options.slice(0, 4).map((text, optionIndex) => ({
      id: String.fromCharCode(97 + optionIndex),
      text: text.slice(0, 140),
    }));
    const correctOption = options[Math.max(0, Math.min(options.length - 1, question.correct_option_index))] ?? options[0];
    return {
      id: `q${questionIndex + 1}`,
      prompt: question.prompt.slice(0, 220),
      options,
      correct_option_id: correctOption?.id ?? 'a',
      explanation: question.explanation.slice(0, 220),
    };
  }).filter((question) => question.options.length === 4);
}

function normalizeQuizAnswers(value: unknown): Map<string, string> {
  const answers = new Map<string, string>();
  if (!Array.isArray(value)) {
    return answers;
  }

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const data = item as Record<string, unknown>;
    const questionId = typeof data.questionId === 'string' ? data.questionId.trim() : '';
    const optionId = typeof data.optionId === 'string' ? data.optionId.trim() : '';
    if (/^q\d{1,2}$/.test(questionId) && /^[a-z]$/.test(optionId)) {
      answers.set(questionId, optionId);
    }
  }
  return answers;
}

function gradeQuiz(questions: AnswerQuizQuestionRecord[], answers: Map<string, string>) {
  const results = questions.map((question) => {
    const selectedOptionId = answers.get(question.id) ?? null;
    const correct = selectedOptionId === question.correct_option_id;
    return {
      questionId: question.id,
      selectedOptionId,
      correctOptionId: question.correct_option_id,
      correct,
      explanation: question.explanation,
    };
  });
  const score = results.filter((result) => result.correct).length;
  return {
    score,
    total: questions.length,
    percent: questions.length > 0 ? Math.round((score / questions.length) * 100) : 0,
    results,
  };
}

function serializeQuizScores(docs: FirebaseFirestore.QueryDocumentSnapshot[]): unknown[] {
  return docs.map((doc, index) => {
    const data = doc.data();
    return {
      rank: index + 1,
      displayName: String(data.display_name ?? 'Living Wiki Player'),
      score: Number(data.score ?? 0) || 0,
      total: Number(data.total ?? 0) || 0,
      percent: Number(data.percent ?? 0) || 0,
      elapsedMs: Number(data.elapsed_ms ?? 0) || 0,
      attempts: Number(data.attempts ?? 1) || 1,
      updatedAt: serializeTimestamp(data.updated_at),
    };
  });
}

async function loadQuizLeaderboard(quizId: string): Promise<unknown[]> {
  const snapshot = await db.collection('answer_quizzes').doc(quizId).collection('scores')
    .orderBy('score', 'desc')
    .limit(25)
    .get();
  return serializeQuizScores(snapshot.docs)
    .sort((a, b) => {
      const left = a as { score: number; elapsedMs: number; updatedAt: string | null };
      const right = b as { score: number; elapsedMs: number; updatedAt: string | null };
      if (right.score !== left.score) return right.score - left.score;
      if (left.elapsedMs !== right.elapsedMs) return left.elapsedMs - right.elapsedMs;
      return String(left.updatedAt ?? '').localeCompare(String(right.updatedAt ?? ''));
    })
    .slice(0, 10)
    .map((item, index) => ({ ...(item as Record<string, unknown>), rank: index + 1 }));
}

async function loadAnswerCardAtlas(atlasId: string | null, uid: string): Promise<Record<string, unknown> | null> {
  if (!atlasId) {
    return null;
  }

  const atlasSnapshot = await db.collection('atlases').doc(atlasId).get();
  if (!atlasSnapshot.exists) {
    throw new HttpsError('not-found', 'Atlas not found.');
  }

  const atlas = atlasSnapshot.data() as Record<string, unknown> | undefined;
  const isOwner = String(atlas?.user_id ?? '') === uid;
  const isPublic = atlas?.is_public === true;
  if (!isOwner && !isPublic) {
    throw new HttpsError('permission-denied', 'You do not have access to this atlas.');
  }

  return {
    id: atlasSnapshot.id,
    ...atlas,
  };
}

function answerCardLikeDocumentId(cardId: string, visitorId: string): string {
  const hash = createHash('sha256').update(`${cardId}:${visitorId}`).digest('hex').slice(0, 40);
  return `${cardId}_${hash}`;
}

function getPublicChatVisitorContext(request: {
  auth?: { uid?: string; token?: unknown } | null;
  data?: Record<string, unknown>;
}) {
  if (request.auth?.uid) {
    const token = (request.auth.token ?? {}) as { name?: unknown; email?: unknown };
    const displayName = typeof token.name === 'string' && token.name.trim() ? token.name.trim() : null;
    const email = typeof token.email === 'string' && token.email.trim() ? token.email.trim().toLowerCase() : null;

    return {
      kind: 'authenticated' as const,
      visitorUserId: request.auth.uid,
      anonymousVisitorId: null,
      visitorDisplayName: displayName,
      visitorEmail: email,
    };
  }

  const anonymousVisitorId = normalizeAnonymousVisitorId(request.data?.anonymousVisitorId);
  if (!anonymousVisitorId) {
    throw new HttpsError('unauthenticated', 'anonymousVisitorId is required.');
  }

  return {
    kind: 'anonymous' as const,
    visitorUserId: null,
    anonymousVisitorId,
    visitorDisplayName: 'Anonymous',
    visitorEmail: null,
  };
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

  await assertAtlasOwner(atlasId, request.auth.uid);

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

    await assertAtlasOwner(atlasId, request.auth.uid);

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

export const importGoogleDriveFiles = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 540,
    memory: '1GiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const accessToken = String(request.data?.accessToken ?? '').trim();
    const atlasId = normalizeAtlasId(request.data?.atlasId);
    const selectedFiles = normalizeGoogleDriveSelections(request.data?.files);

    if (!accessToken) {
      throw new HttpsError('invalid-argument', 'Google Drive accessToken is required.');
    }
    if (selectedFiles.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one Google Drive file is required.');
    }

    await assertAtlasOwner(atlasId, request.auth.uid);

    const imported: Array<{ documentId: string; filename: string; title: string | null }> = [];
    const failed: Array<{ fileId: string; name: string | null; error: string }> = [];

    for (const selectedFile of selectedFiles) {
      let metadata: GoogleDriveFileMetadata | null = null;
      let plan: GoogleDriveImportPlan | null = null;
      let documentId: string | null = null;

      try {
        metadata = await fetchGoogleDriveMetadata(accessToken, selectedFile.id);
        plan = resolveGoogleDriveImportPlan(metadata);
        const buffer = await fetchGoogleDriveFileBuffer({
          accessToken,
          fileId: metadata.id,
          plan,
        });

        const documentRef = db.collection('documents').doc();
        documentId = documentRef.id;
        const storagePath = buildStoragePath(request.auth.uid, documentRef.id, plan.filename);

        await documentRef.set(
          newDocumentRecord({
            userId: request.auth.uid,
            filename: plan.filename,
            fileType: plan.fileType,
            storagePath,
            sourceType: 'file',
            mimeType: plan.uploadMimeType,
            fileSize: buffer.byteLength,
            title: plan.title,
            atlasId,
          }),
        );

        await storage.bucket().file(storagePath).save(buffer, {
          resumable: false,
          metadata: {
            contentType: plan.uploadMimeType,
            metadata: {
              documentId: documentRef.id,
              originalFilename: plan.filename,
              sourceProvider: 'google_drive',
              sourceFileId: metadata.id,
            },
          },
        });

        imported.push({
          documentId: documentRef.id,
          filename: plan.filename,
          title: plan.title,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Google Drive import failed.';

        if (documentId) {
          await db.collection('documents').doc(documentId).set(
            {
              status: 'failed',
              processing_stage: 'failed',
              last_heartbeat_at: FieldValue.serverTimestamp(),
              error_message: message,
              failure_code: 'google_drive_import_failed',
            },
            { merge: true },
          );
        }

        failed.push({
          fileId: selectedFile.id,
          name: metadata?.name ?? selectedFile.name ?? null,
          error: message,
        });
      }
    }

    return { imported, failed };
  },
);

export const retryStaleUrlDocuments = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const atlasId = normalizeAtlasId(request.data?.atlasId);
    await assertAtlasOwner(atlasId, request.auth.uid);

    const staleMinutes = Math.max(
      staleIngestionThresholdMinutes,
      Number(request.data?.staleMinutes ?? staleIngestionThresholdMinutes) || staleIngestionThresholdMinutes,
    );
    const limit = Math.min(
      staleRetryBatchLimit,
      Math.max(1, Number(request.data?.limit ?? defaultRetryLimit) || defaultRetryLimit),
    );
    const staleDocuments = await collectStaleUrlDocuments({
      userId: request.auth.uid,
      atlasId,
      staleMinutes,
      limit,
    });

    if (staleDocuments.length === 0) {
      return { retriedCount: 0, documentIds: [] };
    }

    await requeueStaleUrlDocuments(staleDocuments);

    return {
      retriedCount: staleDocuments.length,
      documentIds: staleDocuments.map((doc) => doc.id),
    };
  },
);

export const sweepStaleUrlDocuments = onSchedule(
  {
    region: callableRegion,
    schedule: 'every 15 minutes',
    timeZone: 'America/Los_Angeles',
    timeoutSeconds: 300,
    memory: '256MiB',
    maxInstances: 1,
  },
  async () => {
    const staleDocuments = await collectStaleUrlDocuments({
      userId: null,
      atlasId: null,
      staleMinutes: staleIngestionThresholdMinutes,
      limit: staleRetryBatchLimit,
    });

    if (staleDocuments.length === 0) {
      logger.info('sweepStaleUrlDocuments found no stale URL documents');
      return;
    }

    await requeueStaleUrlDocuments(staleDocuments);
    logger.warn('sweepStaleUrlDocuments requeued stale URL documents', {
      count: staleDocuments.length,
      documentIds: staleDocuments.slice(0, 25).map((doc) => doc.id),
    });
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
    const answerMode = request.data?.answerMode === 'internet' ? 'internet' : 'wiki';
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
        answerMode,
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

export const createAnswerCard = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 90,
    memory: '512MiB',
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const question = String(request.data?.question ?? '').replace(/\s+/g, ' ').trim();
    const answer = String(request.data?.answer ?? '').trim();
    if (!question) {
      throw new HttpsError('invalid-argument', 'question is required.');
    }
    if (!answer) {
      throw new HttpsError('invalid-argument', 'answer is required.');
    }

    const atlasId = normalizeAtlasId(request.data?.atlasId);
    const atlas = await loadAnswerCardAtlas(atlasId, request.auth.uid);
    const atlasName = typeof atlas?.name === 'string' ? atlas.name : null;
    const cityConfig = atlas?.city_config && typeof atlas.city_config === 'object'
      ? atlas.city_config as Record<string, unknown>
      : null;
    const cityName = typeof cityConfig?.city_name === 'string' ? cityConfig.city_name : null;
    const regionName = typeof cityConfig?.region_name === 'string' ? cityConfig.region_name : null;
    const cityHint = [cityName, regionName].filter(Boolean).join(', ') || null;
    const locations = normalizeAnswerCardLocations(request.data?.mappableLocations);
    const threadId = typeof request.data?.threadId === 'string' && request.data.threadId.trim()
      ? request.data.threadId.trim().slice(0, 160)
      : null;
    const answerMode = request.data?.answerMode === 'internet' ? 'internet' : request.data?.answerMode === 'wiki' ? 'wiki' : null;
    const sourceMessageKind = normalizeSourceMessageKind(request.data?.sourceMessageKind);
    const sourceMessageId = normalizeOptionalSourceMessageId(request.data?.sourceMessageId);
    const sourceMessage = await loadSourceAssistantMessage({
      uid: request.auth.uid,
      sourceMessageKind,
      sourceMessageId,
      threadId,
      answer,
    });

    const existingMessageCardId = typeof sourceMessage?.data.answer_card_id === 'string'
      ? sourceMessage.data.answer_card_id
      : null;
    if (existingMessageCardId) {
      const snapshot = await db.collection('answer_cards').doc(existingMessageCardId).get();
      if (snapshot.exists) {
        return { card: serializeAnswerCard(snapshot.id, snapshot.data() ?? {}) };
      }
    }

    const existingSourceCard = await loadExistingAnswerCardForSource({
      uid: request.auth.uid,
      threadId,
      answer,
    });
    if (existingSourceCard) {
      const sourcePatch = sourceMessage
        ? {
            source_message_id: sourceMessage.ref.id,
            source_message_kind: sourceMessage.kind,
            updated_at: FieldValue.serverTimestamp(),
          }
        : null;
      await Promise.all([
        sourceMessage?.ref.set({ answer_card_id: existingSourceCard.id }, { merge: true }) ?? Promise.resolve(),
        sourcePatch
          ? db.collection('answer_cards').doc(existingSourceCard.id).set(sourcePatch, { merge: true })
          : Promise.resolve(),
      ]);
      return {
        card: serializeAnswerCard(existingSourceCard.id, {
          ...existingSourceCard.data,
          ...(sourcePatch ?? {}),
        }),
      };
    }

    try {
      const generated = await generateAnswerCard({
        question: question.slice(0, 2000),
        answer: answer.slice(0, 8000),
        atlasName,
        cityHint,
        locations,
      });
      const record: AnswerCardRecord = {
        owner_user_id: request.auth.uid,
        atlas_id: atlasId,
        atlas_name: atlasName,
        question: question.slice(0, 2000),
        answer_preview: answer.slice(0, 900),
        title: generated.title,
        subtitle: generated.subtitle,
        key_facts: generated.key_facts,
        did_you_know: generated.did_you_know,
        mappable_locations: locations,
        source_thread_id: threadId,
        source_message_id: sourceMessage?.ref.id ?? null,
        source_message_kind: sourceMessage?.kind ?? sourceMessageKind,
        source_answer_mode: answerMode,
        answer_quiz_id: null,
        like_count: 0,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };

      const docRef = db.collection('answer_cards').doc();
      await docRef.set(record);
      if (sourceMessage) {
        await sourceMessage.ref.set({ answer_card_id: docRef.id }, { merge: true });
      }
      const snapshot = await docRef.get();
      const savedRecord = snapshot.data() ?? (record as unknown as Record<string, unknown>);
      return { card: serializeAnswerCard(docRef.id, savedRecord) };
    } catch (error) {
      logger.error('createAnswerCard failed', { errorMessage: error instanceof Error ? error.message : String(error) });
      throw new HttpsError('internal', error instanceof Error ? error.message : 'Failed to create answer card.');
    }
  },
);

export const getAnswerCard = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const cardId = normalizeAnswerCardId(request.data?.cardId);
    const snapshot = await db.collection('answer_cards').doc(cardId).get();
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Answer card not found.');
    }

    return { card: serializeAnswerCard(snapshot.id, snapshot.data() ?? {}) };
  },
);

export const likeAnswerCard = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const cardId = normalizeAnswerCardId(request.data?.cardId);
    const visitorId = request.auth?.uid || normalizeAnonymousVisitorId(request.data?.visitorId);
    if (!visitorId) {
      throw new HttpsError('invalid-argument', 'visitorId is required.');
    }

    const cardRef = db.collection('answer_cards').doc(cardId);
    const likeRef = db.collection('answer_card_likes').doc(answerCardLikeDocumentId(cardId, visitorId));

    const result = await db.runTransaction(async (transaction) => {
      const [cardSnapshot, likeSnapshot] = await Promise.all([
        transaction.get(cardRef),
        transaction.get(likeRef),
      ]);
      if (!cardSnapshot.exists) {
        throw new HttpsError('not-found', 'Answer card not found.');
      }

      const currentCount = Number(cardSnapshot.data()?.like_count ?? 0) || 0;
      if (likeSnapshot.exists) {
        return { liked: true, likeCount: currentCount };
      }

      transaction.set(likeRef, {
        card_id: cardId,
        visitor_id_hash: createHash('sha256').update(visitorId).digest('hex'),
        created_at: FieldValue.serverTimestamp(),
      });
      transaction.update(cardRef, {
        like_count: FieldValue.increment(1),
        updated_at: FieldValue.serverTimestamp(),
      });
      return { liked: true, likeCount: currentCount + 1 };
    });

    return result;
  },
);

export const createAnswerQuiz = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 90,
    memory: '512MiB',
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to create a quiz challenge.');
    }

    const cardId = normalizeAnswerCardId(request.data?.cardId);
    const sourceMessageKind = normalizeSourceMessageKind(request.data?.sourceMessageKind);
    const sourceMessageId = normalizeOptionalSourceMessageId(request.data?.sourceMessageId);
    const existing = await db.collection('answer_quizzes')
      .where('answer_card_id', '==', cardId)
      .limit(1)
      .get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      const cardSnapshot = await db.collection('answer_cards').doc(cardId).get();
      const card = cardSnapshot.data() ?? {};
      const messageKind = normalizeSourceMessageKind(card.source_message_kind) ?? sourceMessageKind;
      const messageId = normalizeOptionalSourceMessageId(card.source_message_id) ?? sourceMessageId;
      if (messageKind && messageId) {
        const sourceMessage = await loadSourceAssistantMessage({
          uid: request.auth.uid,
          sourceMessageKind: messageKind,
          sourceMessageId: messageId,
          threadId: typeof card.source_thread_id === 'string' ? card.source_thread_id : null,
          answer: String(card.answer_preview ?? ''),
        });
        await sourceMessage?.ref.set({ answer_card_id: cardId, answer_quiz_id: doc.id }, { merge: true });
      }
      await db.collection('answer_cards').doc(cardId).set(
        {
          answer_quiz_id: doc.id,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { quiz: serializeAnswerQuiz(doc.id, doc.data(), await loadQuizLeaderboard(doc.id)) };
    }

    const cardSnapshot = await db.collection('answer_cards').doc(cardId).get();
    if (!cardSnapshot.exists) {
      throw new HttpsError('not-found', 'Answer card not found.');
    }

    const card = cardSnapshot.data() ?? {};
    const generated = await generateAnswerQuiz({
      title: String(card.title ?? ''),
      question: String(card.question ?? ''),
      answerPreview: String(card.answer_preview ?? ''),
      keyFacts: Array.isArray(card.key_facts) ? card.key_facts.map(String) : [],
      didYouKnow: Array.isArray(card.did_you_know) ? card.did_you_know.map(String) : [],
      atlasName: typeof card.atlas_name === 'string' ? card.atlas_name : null,
    });
    const questions = buildQuizQuestionRecords(generated.questions);
    if (questions.length < 3) {
      throw new HttpsError('internal', 'Could not generate enough quiz questions.');
    }

    const record: AnswerQuizRecord = {
      owner_user_id: request.auth.uid,
      answer_card_id: cardId,
      atlas_id: typeof card.atlas_id === 'string' ? card.atlas_id : null,
      atlas_name: typeof card.atlas_name === 'string' ? card.atlas_name : null,
      title: generated.title,
      description: generated.description,
      source_question: String(card.question ?? '').slice(0, 2000),
      questions,
      play_count: 0,
      submission_count: 0,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };

    const docRef = db.collection('answer_quizzes').doc();
    await docRef.set(record);
    await db.collection('answer_cards').doc(cardId).set(
      {
        answer_quiz_id: docRef.id,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    const messageKind = normalizeSourceMessageKind(card.source_message_kind) ?? sourceMessageKind;
    const messageId = normalizeOptionalSourceMessageId(card.source_message_id) ?? sourceMessageId;
    if (messageKind && messageId) {
      const sourceMessage = await loadSourceAssistantMessage({
        uid: request.auth.uid,
        sourceMessageKind: messageKind,
        sourceMessageId: messageId,
        threadId: typeof card.source_thread_id === 'string' ? card.source_thread_id : null,
        answer: String(card.answer_preview ?? ''),
      });
      await sourceMessage?.ref.set({ answer_card_id: cardId, answer_quiz_id: docRef.id }, { merge: true });
    }
    const snapshot = await docRef.get();
    return { quiz: serializeAnswerQuiz(docRef.id, snapshot.data() ?? record as unknown as Record<string, unknown>, []) };
  },
);

export const getAnswerQuiz = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const quizId = normalizeAnswerQuizId(request.data?.quizId);
    const snapshot = await db.collection('answer_quizzes').doc(quizId).get();
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Quiz not found.');
    }

    await snapshot.ref.update({
      play_count: FieldValue.increment(1),
      updated_at: FieldValue.serverTimestamp(),
    }).catch(() => undefined);

    return {
      quiz: serializeAnswerQuiz(snapshot.id, snapshot.data() ?? {}, await loadQuizLeaderboard(snapshot.id)),
    };
  },
);

export const gradeAnswerQuizAttempt = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const quizId = normalizeAnswerQuizId(request.data?.quizId);
    const snapshot = await db.collection('answer_quizzes').doc(quizId).get();
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Quiz not found.');
    }

    const questions = normalizeQuizQuestions(snapshot.data()?.questions, true);
    const grade = gradeQuiz(questions, normalizeQuizAnswers(request.data?.answers));
    return { grade };
  },
);

export const submitAnswerQuizScore = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to save your leaderboard score.');
    }

    const uid = request.auth.uid;
    const quizId = normalizeAnswerQuizId(request.data?.quizId);
    const quizRef = db.collection('answer_quizzes').doc(quizId);
    const quizSnapshot = await quizRef.get();
    if (!quizSnapshot.exists) {
      throw new HttpsError('not-found', 'Quiz not found.');
    }

    const questions = normalizeQuizQuestions(quizSnapshot.data()?.questions, true);
    const grade = gradeQuiz(questions, normalizeQuizAnswers(request.data?.answers));
    const elapsedMs = Math.max(0, Math.min(Number(request.data?.elapsedMs ?? 0) || 0, 24 * 60 * 60 * 1000));
    const token = (request.auth.token ?? {}) as { name?: unknown; email?: unknown };
    const displayName = typeof token.name === 'string' && token.name.trim()
      ? token.name.trim().slice(0, 80)
      : typeof token.email === 'string' && token.email.includes('@')
        ? token.email.split('@')[0].slice(0, 80)
        : 'Living Wiki Player';
    const scoreRef = quizRef.collection('scores').doc(uid);

    const saveResult = await db.runTransaction(async (transaction) => {
      const scoreSnapshot = await transaction.get(scoreRef);
      const previous = scoreSnapshot.exists ? scoreSnapshot.data() ?? {} : {};
      const previousScore = Number(previous.score ?? -1);
      const previousElapsed = Number(previous.elapsed_ms ?? Number.MAX_SAFE_INTEGER);
      const isBetter = grade.score > previousScore || (grade.score === previousScore && elapsedMs > 0 && elapsedMs < previousElapsed);
      const attempts = (Number(previous.attempts ?? 0) || 0) + 1;

      if (isBetter) {
        transaction.set(scoreRef, {
          quiz_id: quizId,
          user_id: uid,
          display_name: displayName,
          score: grade.score,
          total: grade.total,
          percent: grade.percent,
          elapsed_ms: elapsedMs,
          attempts,
          created_at: scoreSnapshot.exists ? previous.created_at ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        transaction.set(scoreRef, {
          quiz_id: quizId,
          user_id: uid,
          display_name: displayName,
          attempts,
          last_attempt_at: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      transaction.update(quizRef, {
        submission_count: FieldValue.increment(1),
        updated_at: FieldValue.serverTimestamp(),
      });

      return { savedBest: isBetter, attempts };
    });

    return {
      grade,
      savedBest: saveResult.savedBest,
      attempts: saveResult.attempts,
      leaderboard: await loadQuizLeaderboard(quizId),
    };
  },
);

export const shareChatThread = onCall(
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

    const threadId = String(request.data?.threadId ?? '').trim();
    if (!threadId) {
      throw new HttpsError('invalid-argument', 'threadId is required.');
    }

    const threadRef = db.collection('chat_threads').doc(threadId);
    const threadSnapshot = await threadRef.get();
    if (!threadSnapshot.exists) {
      throw new HttpsError('not-found', 'Chat thread not found.');
    }

    const thread = threadSnapshot.data() as {
      user_id?: string;
      is_shared?: boolean;
    };
    if (thread.user_id !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'You do not have access to this chat thread.');
    }

    const sharedAtIso = clientTimestamp().toDate().toISOString();
    if (thread.is_shared !== true) {
      await threadRef.set(
        {
          is_shared: true,
          shared_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    return {
      threadId,
      isShared: true,
      sharedAt: sharedAtIso,
    };
  },
);

export const getSharedChatThread = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const threadId = String(request.data?.threadId ?? '').trim();
    if (!threadId) {
      throw new HttpsError('invalid-argument', 'threadId is required.');
    }

    const threadSnapshot = await db.collection('chat_threads').doc(threadId).get();
    if (!threadSnapshot.exists) {
      throw new HttpsError('not-found', 'Shared chat thread not found.');
    }

    const thread = threadSnapshot.data() as {
      atlas_id?: string | null;
      title?: string;
      is_shared?: boolean;
      shared_at?: unknown;
    };

    if (thread.is_shared !== true) {
      throw new HttpsError('permission-denied', 'This chat thread is not shared.');
    }

    const messagesSnapshot = await db
      .collection('chat_messages')
      .where('thread_id', '==', threadId)
      .orderBy('created_at', 'asc')
      .limit(250)
      .get();

    let atlasName: string | null = null;
    if (typeof thread.atlas_id === 'string' && thread.atlas_id.trim()) {
      const atlasSnapshot = await db.collection('atlases').doc(thread.atlas_id).get();
      if (atlasSnapshot.exists) {
        atlasName = String(atlasSnapshot.data()?.name ?? '').trim() || null;
      }
    }

    return {
      threadId,
      title: String(thread.title ?? '').trim() || 'Shared chat',
      atlasName,
      sharedAt: normalizeTimestamp(thread.shared_at),
      messages: messagesSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          created_at: normalizeTimestamp(data.created_at),
        };
      }),
    };
  },
);

export const getPublicChatState = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const atlasId = normalizeAtlasId(request.data?.atlasId);
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    const atlas = await loadPublicAtlasById(atlasId);
    const visitor = getPublicChatVisitorContext(request);

    if (visitor.kind === 'authenticated' && visitor.visitorUserId === atlas.user_id) {
      throw new HttpsError('failed-precondition', 'Atlas owners should use the workspace chat.');
    }

    try {
      const state = await loadPublicChatState({
        atlasId: atlas.id,
        visitor: {
          kind: visitor.kind,
          visitorUserId: visitor.visitorUserId,
          anonymousVisitorId: visitor.anonymousVisitorId,
          visitorDisplayName: visitor.visitorDisplayName,
          visitorEmail: visitor.visitorEmail,
        },
      });

      return {
        ...state,
        messages: state.messages.map((message) => ({
          ...message,
          created_at: normalizeTimestamp(message.created_at),
        })),
      };
    } catch (error) {
      logger.error('getPublicChatState failed', {
        atlasId,
        visitorKind: visitor.kind,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to load public chat state.',
      );
    }
  },
);

export const askPublicAtlas = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 180,
    memory: '1GiB',
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request) => {
    const atlasId = normalizeAtlasId(request.data?.atlasId);
    const question = String(request.data?.question ?? '').trim();
    const threadId = String(request.data?.threadId ?? '').trim() || null;
    const answerMode = request.data?.answerMode === 'internet' ? 'internet' : 'wiki';
    const topicIds = Array.isArray(request.data?.topicIds)
      ? request.data.topicIds.map((value: unknown) => String(value)).filter(Boolean)
      : undefined;

    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }
    if (!question) {
      throw new HttpsError('invalid-argument', 'question is required.');
    }

    const atlas = await loadPublicAtlasById(atlasId);
    const visitor = getPublicChatVisitorContext(request);

    if (visitor.kind === 'authenticated' && visitor.visitorUserId === atlas.user_id) {
      throw new HttpsError('failed-precondition', 'Atlas owners should use the workspace chat.');
    }

    try {
      return await runPublicAtlasQuery({
        atlasId: atlas.id,
        atlasOwnerUserId: atlas.user_id,
        question,
        answerMode,
        topicIds,
        threadId,
        visitor: {
          kind: visitor.kind,
          visitorUserId: visitor.visitorUserId,
          anonymousVisitorId: visitor.anonymousVisitorId,
          visitorDisplayName: visitor.visitorDisplayName,
          visitorEmail: visitor.visitorEmail,
        },
      });
    } catch (error) {
      logger.error('askPublicAtlas failed', {
        atlasId,
        visitorKind: visitor.kind,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to answer public question.',
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

    const [documents, wikiArticles, knowledgeEntries, wikiTopics, chatThreads] = await Promise.all([
      countPublicAtlasCollection('documents', atlas.user_id, atlasId),
      countPublicAtlasCollection('wiki_articles', atlas.user_id, atlasId),
      countPublicAtlasCollection('knowledge_entries', atlas.user_id, atlasId),
      countPublicAtlasCollection('wiki_topics', atlas.user_id, atlasId),
      countPublicAtlasCollection('chat_threads', atlas.user_id, atlasId),
    ]);

    return {
      documents,
      wiki_articles: wikiArticles,
      knowledge_entries: knowledgeEntries,
      wiki_topics: wikiTopics,
      queries: 0,
      chat_threads: chatThreads,
      total: documents + wikiArticles + knowledgeEntries + wikiTopics + chatThreads,
    };
  },
);

export const getCityPulseSnapshot = onCall(
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

    if (request.auth?.uid) {
      const atlasSnapshot = await db.collection('atlases').doc(atlasId).get();
      if (!atlasSnapshot.exists) {
        throw new HttpsError('not-found', 'Atlas not found.');
      }
      const atlasData = atlasSnapshot.data() as Record<string, unknown> | undefined;
      const readable =
        atlasData?.is_public === true || String(atlasData?.user_id ?? '') === request.auth.uid;
      if (!readable) {
        throw new HttpsError('permission-denied', 'Atlas is not readable.');
      }
    } else {
      await loadPublicAtlasById(atlasId);
    }

    const existing = await getStoredCityPulseSnapshot(atlasId);
    if (existing) {
      return existing;
    }

    return await refreshStoredCityPulseSnapshot(atlasId, 'bootstrap');
  },
);

export const refreshCityPulseSnapshot = onCall(
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

    const atlasId = String(request.data?.atlasId ?? '').trim();
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    await assertAtlasOwner(atlasId, request.auth.uid);
    return await refreshStoredCityPulseSnapshot(atlasId, 'admin');
  },
);

export const refreshCityPulseDaily = onSchedule(
  {
    region: callableRegion,
    schedule: '0 6 * * *',
    timeZone: 'America/New_York',
    timeoutSeconds: 540,
    memory: '1GiB',
    maxInstances: 1,
  },
  async () => {
    const atlasIds = await listEnabledCityAtlasIds();
    for (const atlasId of atlasIds) {
      try {
        await refreshStoredCityPulseSnapshot(atlasId, 'schedule');
      } catch (error) {
        logger.warn('refreshCityPulseDaily failed for atlas', {
          atlasId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
);

export const getPhillyGreenJobsSnapshot = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async () => {
    const snapshot = await getStoredPhillyGreenJobsSnapshot();
    if (snapshot) {
      return snapshot;
    }

    return await refreshStoredPhillyGreenJobsSnapshot('bootstrap');
  },
);

export const refreshPhillyGreenJobs = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 300,
    memory: '1GiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const atlas = await loadPublicAtlasBySlug('philly');
    if (atlas.user_id !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Only the Philly atlas owner can refresh green jobs.');
    }

    return await refreshStoredPhillyGreenJobsSnapshot('admin');
  },
);

export const refreshPhillyGreenJobsDaily = onSchedule(
  {
    region: callableRegion,
    schedule: '0 5 * * *',
    timeZone: 'America/New_York',
    timeoutSeconds: 300,
    memory: '1GiB',
    maxInstances: 1,
  },
  async () => {
    await refreshStoredPhillyGreenJobsSnapshot('schedule');
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
    if (!documentId && (!atlasId || !filename)) {
      throw new HttpsError('invalid-argument', 'documentId or atlasId + filename is required.');
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
      if (documentId) {
        document = await documentAccessAllowed(request.auth?.uid, documentId);
      } else {
        document = await findPublicDocumentByFilename(atlasId, filename);
      }
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
    ...urlIngestionTriggerOptions,
    document: 'documents/{documentId}',
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

export const retrySubmittedUrl = onDocumentUpdated(
  {
    ...urlIngestionTriggerOptions,
    document: 'documents/{documentId}',
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || after.source_type !== 'url' || after.status !== 'pending') {
      return;
    }

    if (before.status === 'pending') {
      return;
    }

    try {
      await processUrlDocument(event.params.documentId);
    } catch (error) {
      logger.error('retrySubmittedUrl failed', {
        documentId: event.params.documentId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
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
