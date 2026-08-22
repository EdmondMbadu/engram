import { lookup } from 'node:dns/promises';
import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import sharp from 'sharp';
import { db, storage } from './firebase';

type ExportCard = {
  id: string;
  position: number;
  title: string;
  narration: string;
  imageUrls: string[];
  sourceUrl: string;
  wordCount: number;
  estimatedSeconds: number;
};

type ExportSnapshot = {
  requestId: string;
  boardId: string;
  documentTitle: string;
  sourceUrl: string;
  ownerName: string;
  exportedAt: string;
  opening: { title: string; description: string; coverImageUrl: string };
  cards: ExportCard[];
  closing: { included: boolean; headline: string; message: string; imageUrl: string; qrImageUrl: string };
  productionNotes: { included: boolean; narrator: string; music: string; format: string; ratio: string; socialCaption: string };
};

type PreparedImage = { url: string; label: string; widthPt: number };
type DocumentMarker =
  | { kind: 'page-break'; startIndex: number; endIndex: number }
  | { kind: 'image'; startIndex: number; endIndex: number; image: PreparedImage };
type StyleRange = { startIndex: number; endIndex: number; namedStyleType: 'TITLE' | 'HEADING_1' | 'HEADING_2' };

const docsApiBaseUrl = 'https://docs.googleapis.com/v1/documents';
const maxCards = 200;
const maxImages = 300;
const maxImageBytes = 20 * 1024 * 1024;

export const exportBoardToGoogleDocs = onCall(
  { region: 'us-central1', timeoutSeconds: 540, memory: '1GiB', cors: true },
  async (request) => {
    const userId = request.auth?.uid ?? '';
    if (!userId) throw new HttpsError('unauthenticated', 'Sign in before exporting to Google Docs.');
    const accessToken = safeText(request.data?.accessToken, 4096);
    if (!accessToken) throw new HttpsError('invalid-argument', 'Google Docs authorization is required.');
    const snapshot = normalizeSnapshot(request.data?.snapshot);

    const boardSnapshot = await db.collection('boards').doc(snapshot.boardId).get();
    if (!boardSnapshot.exists) throw new HttpsError('not-found', 'Board not found.');
    const board = boardSnapshot.data() ?? {};
    if (String(board['owner_user_id'] ?? '') !== userId) {
      throw new HttpsError('permission-denied', 'Only the board owner can export this Stack.');
    }
    const boardCardIds = new Set(
      (Array.isArray(board['cards']) ? board['cards'] : [])
        .map((card) => card && typeof card === 'object' ? String((card as Record<string, unknown>)['id'] ?? '') : '')
        .filter(Boolean),
    );
    if (snapshot.cards.some((card) => !boardCardIds.has(card.id))) {
      throw new HttpsError('permission-denied', 'The export contains a card that is not part of this board.');
    }

    const exportRecordId = createHash('sha256').update(`${userId}:${snapshot.requestId}`).digest('hex');
    const exportRef = db.collection('board_doc_exports').doc(exportRecordId);
    const existing = await exportRef.get();
    if (existing.data()?.['status'] === 'completed') {
      return existing.data()?.['result'];
    }
    const existingUpdatedAt = Date.parse(String(existing.data()?.['updated_at'] ?? ''));
    if (existing.data()?.['status'] === 'processing'
      && Number.isFinite(existingUpdatedAt)
      && Date.now() - existingUpdatedAt < 10 * 60 * 1000) {
      throw new HttpsError('aborted', 'This Google Docs export is already in progress.');
    }
    await exportRef.set({
      user_id: userId,
      board_id: snapshot.boardId,
      request_id: snapshot.requestId,
      status: 'processing',
      updated_at: new Date().toISOString(),
    }, { merge: true });

    const stagedPaths: string[] = [];
    const warnings: string[] = [];
    let documentId = '';
    try {
      const prepared = await prepareSnapshotImages(snapshot, userId, stagedPaths, warnings);
      documentId = await createGoogleDocument(accessToken, snapshot.documentTitle);
      const plan = buildDocumentPlan(snapshot, prepared);
      await populateGoogleDocument(accessToken, documentId, plan, warnings);
      const result = {
        requestId: snapshot.requestId,
        documentId,
        documentUrl: `https://docs.google.com/document/d/${encodeURIComponent(documentId)}/edit`,
        exportedCardCount: snapshot.cards.length,
        exportedImageCount: plan.markers.filter((marker) => marker.kind === 'image').length,
        warnings,
      };
      await exportRef.set({ status: 'completed', result, updated_at: new Date().toISOString() }, { merge: true });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Docs export failed.';
      logger.error('Board Google Docs export failed.', { userId, boardId: snapshot.boardId, requestId: snapshot.requestId, documentId, message });
      await exportRef.set({ status: 'failed', document_id: documentId || null, error_message: message.slice(0, 500), updated_at: new Date().toISOString() }, { merge: true });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('unavailable', message);
    } finally {
      await Promise.allSettled(stagedPaths.map((path) => storage.bucket().file(path).delete({ ignoreNotFound: true })));
    }
  },
);

function normalizeSnapshot(value: unknown): ExportSnapshot {
  const source = record(value);
  const opening = record(source['opening']);
  const closing = record(source['closing']);
  const productionNotes = record(source['productionNotes']);
  const cards = (Array.isArray(source['cards']) ? source['cards'] : []).map((entry, index): ExportCard => {
    const card = record(entry);
    const narration = safeMultilineText(card['narration'], 20_000);
    return {
      id: safeIdentifier(card['id'], 'card id'),
      position: index + 1,
      title: safeText(card['title'], 300) || `Card ${index + 1}`,
      narration,
      imageUrls: uniqueStrings(card['imageUrls'], maxImages + 1).map((url) => safeImageUrl(url)).filter(Boolean),
      sourceUrl: safeOptionalHttpsUrl(card['sourceUrl']),
      wordCount: narration.split(/\s+/).filter(Boolean).length,
      estimatedSeconds: narration ? Math.max(1, Math.ceil(narration.split(/\s+/).filter(Boolean).length / 2.35)) : 0,
    };
  });
  if (!cards.length) throw new HttpsError('invalid-argument', 'Select at least one card before exporting.');
  if (cards.length > maxCards) throw new HttpsError('invalid-argument', `Google Docs export supports up to ${maxCards} selected cards at a time.`);
  const totalImages = cards.reduce((total, card) => total + card.imageUrls.length, 0)
    + (opening['coverImageUrl'] ? 1 : 0) + (closing['imageUrl'] ? 1 : 0) + (closing['qrImageUrl'] ? 1 : 0);
  if (totalImages > maxImages) throw new HttpsError('invalid-argument', `This export has ${totalImages} images; the current limit is ${maxImages}.`);
  return {
    requestId: safeIdentifier(source['requestId'], 'request id'),
    boardId: safeIdentifier(source['boardId'], 'board id'),
    documentTitle: safeText(source['documentTitle'], 240) || 'LivingWiki Script & Images',
    sourceUrl: safeOptionalHttpsUrl(source['sourceUrl']),
    ownerName: safeText(source['ownerName'], 200),
    exportedAt: safeText(source['exportedAt'], 80) || new Date().toISOString(),
    opening: {
      title: safeText(opening['title'], 300) || 'Untitled LivingWiki Stack',
      description: safeMultilineText(opening['description'], 20_000),
      coverImageUrl: safeImageUrl(opening['coverImageUrl']),
    },
    cards,
    closing: {
      included: closing['included'] === true,
      headline: safeText(closing['headline'], 300) || 'Keep exploring',
      message: safeMultilineText(closing['message'], 4_000),
      imageUrl: safeImageUrl(closing['imageUrl']),
      qrImageUrl: safeImageUrl(closing['qrImageUrl']),
    },
    productionNotes: {
      included: productionNotes['included'] === true,
      narrator: safeText(productionNotes['narrator'], 300),
      music: safeText(productionNotes['music'], 300),
      format: safeText(productionNotes['format'], 120),
      ratio: safeText(productionNotes['ratio'], 120),
      socialCaption: safeMultilineText(productionNotes['socialCaption'], 4_000),
    },
  };
}

async function prepareSnapshotImages(
  snapshot: ExportSnapshot,
  userId: string,
  stagedPaths: string[],
  warnings: string[],
): Promise<Map<string, PreparedImage>> {
  const requestedByUrl = new Map<string, { url: string; label: string; widthPt: number }>();
  const requestImage = (url: string, label: string, widthPt: number) => {
    if (!url) return;
    const existing = requestedByUrl.get(url);
    if (!existing || existing.widthPt < widthPt) requestedByUrl.set(url, { url, label, widthPt });
  };
  requestImage(snapshot.opening.coverImageUrl, 'Cover image', 450);
  for (const card of snapshot.cards) {
    card.imageUrls.forEach((url, index) => requestImage(url, `${card.position}. ${card.title}${index ? ` image ${index + 1}` : ' image'}`, index ? 300 : 430));
  }
  if (snapshot.closing.included) requestImage(snapshot.closing.imageUrl, 'Final card image', 430);
  if (snapshot.closing.included) requestImage(snapshot.closing.qrImageUrl, 'Board QR code', 120);
  const requested = [...requestedByUrl.values()];

  const prepared = new Map<string, PreparedImage>();
  for (let offset = 0; offset < requested.length; offset += 4) {
    const batch = requested.slice(offset, offset + 4);
    const results = await Promise.all(batch.map(async (image, batchIndex) => {
      try {
        const normalized = await normalizeImage(image.url);
        const storagePath = `board-doc-exports/${userId}/${snapshot.requestId}/${offset + batchIndex}.${normalized.extension}`;
        const token = randomUUID();
        await storage.bucket().file(storagePath).save(normalized.buffer, {
          resumable: false,
          metadata: { contentType: normalized.contentType, metadata: { firebaseStorageDownloadTokens: token } },
        });
        stagedPaths.push(storagePath);
        const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storage.bucket().name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
        return { sourceUrl: image.url, prepared: { url, label: image.label, widthPt: image.widthPt } };
      } catch (error) {
        warnings.push(`${image.label} was skipped: ${error instanceof Error ? error.message : 'image preparation failed'}`);
        return null;
      }
    }));
    for (const result of results) if (result) prepared.set(result.sourceUrl, result.prepared);
  }
  return prepared;
}

async function normalizeImage(url: string): Promise<{ buffer: Buffer; contentType: string; extension: 'jpg' | 'png' }> {
  const input = url.startsWith('data:') ? dataUrlBuffer(url) : await fetchPublicImage(url);
  if (input.byteLength > maxImageBytes) throw new Error('image is larger than 20 MB');
  const pipeline = sharp(input, { failOn: 'error', limitInputPixels: 25_000_000 }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true });
  const metadata = await pipeline.metadata();
  if (metadata.hasAlpha) return { buffer: await pipeline.png({ compressionLevel: 8 }).toBuffer(), contentType: 'image/png', extension: 'png' };
  return { buffer: await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer(), contentType: 'image/jpeg', extension: 'jpg' };
}

async function fetchPublicImage(initialUrl: string): Promise<Buffer> {
  let url = new URL(initialUrl);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertPublicHttpsUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let response: Response;
    try {
      response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'LivingWiki Google Docs Export/1.0' } });
    } finally {
      clearTimeout(timeout);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('image redirect was incomplete');
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`image server returned ${response.status}`);
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > maxImageBytes) throw new Error('image is larger than 20 MB');
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error('image redirected too many times');
}

async function assertPublicHttpsUrl(url: URL): Promise<void> {
  if (url.protocol !== 'https:') throw new Error('image URL must use HTTPS');
  if (url.username || url.password) throw new Error('image URL credentials are not allowed');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) throw new Error('private image hosts are not allowed');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateIp(address))) throw new Error('private image hosts are not allowed');
}

function privateIp(value: string): boolean {
  const ip = value.toLowerCase();
  if (ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return true;
  const mapped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const parts = mapped.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || parts[0] >= 224;
}

function dataUrlBuffer(value: string): Buffer {
  const match = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i.exec(value);
  if (!match) throw new Error('draft image data is invalid');
  return Buffer.from(match[1], 'base64');
}

function buildDocumentPlan(snapshot: ExportSnapshot, images: Map<string, PreparedImage>): {
  text: string; styles: StyleRange[]; markers: DocumentMarker[];
} {
  let text = '';
  const styles: StyleRange[] = [];
  const markers: DocumentMarker[] = [];
  const append = (value: string, style?: StyleRange['namedStyleType']) => {
    const startIndex = text.length + 1;
    text += value;
    if (style) styles.push({ startIndex, endIndex: text.length + 1, namedStyleType: style });
  };
  const marker = (kind: 'page-break' | 'image', image?: PreparedImage) => {
    const token = `[[LW_${kind === 'image' ? 'IMAGE' : 'PAGE'}_${markers.length}]]`;
    const startIndex = text.length + 1;
    text += `${token}\n`;
    markers.push(kind === 'image'
      ? { kind, startIndex, endIndex: startIndex + token.length, image: image! }
      : { kind, startIndex, endIndex: startIndex + token.length });
  };
  const appendImage = (url: string) => { const image = images.get(url); if (image) marker('image', image); };

  append(`${snapshot.opening.title}\n`, 'TITLE');
  if (snapshot.ownerName) append(`Curated by ${snapshot.ownerName}\n`);
  append(`${snapshot.cards.length} selected card${snapshot.cards.length === 1 ? '' : 's'} · Exported ${formatExportDate(snapshot.exportedAt)}\n`);
  if (snapshot.sourceUrl) append(`${snapshot.sourceUrl}\n`);
  append('\n');
  appendImage(snapshot.opening.coverImageUrl);
  append('Board Opening\n', 'HEADING_1');
  append(`${snapshot.opening.title}\n`, 'HEADING_2');
  append(`${snapshot.opening.description || 'No board introduction provided.'}\n`);

  for (const card of snapshot.cards) {
    marker('page-break');
    append(`${String(card.position).padStart(2, '0')} · ${card.title}\n`, 'HEADING_1');
    const preparedCardImages = card.imageUrls.map((url) => images.get(url)).filter((image): image is PreparedImage => !!image);
    if (preparedCardImages.length) preparedCardImages.forEach((image) => marker('image', image));
    else append('No image available.\n');
    append('Narration Script\n', 'HEADING_2');
    append(`${card.narration || 'Narration not provided.'}\n`);
    append(`${card.wordCount} words · ${durationLabel(card.estimatedSeconds)} estimated narration\n`);
    if (card.sourceUrl) append(`Source: ${card.sourceUrl}\n`);
  }

  if (snapshot.closing.included) {
    marker('page-break');
    append('Final Card\n', 'HEADING_1');
    appendImage(snapshot.closing.imageUrl);
    append(`${snapshot.closing.headline}\n`, 'HEADING_2');
    append(`${snapshot.closing.message || snapshot.opening.title}\n`);
    appendImage(snapshot.closing.qrImageUrl);
    if (snapshot.sourceUrl) append(`Open the complete board: ${snapshot.sourceUrl}\n`);
  }

  if (snapshot.productionNotes.included) {
    marker('page-break');
    append('Production Notes\n', 'HEADING_1');
    append(`Narrator: ${snapshot.productionNotes.narrator || 'Not selected'}\n`);
    append(`Music: ${snapshot.productionNotes.music || 'No music'}\n`);
    append(`Format: ${snapshot.productionNotes.format || 'Not selected'}\n`);
    append(`Ratio: ${snapshot.productionNotes.ratio || 'Not selected'}\n`);
    if (snapshot.productionNotes.socialCaption) {
      append('Social Caption\n', 'HEADING_2');
      append(`${snapshot.productionNotes.socialCaption}\n`);
    }
  }
  return { text, styles, markers };
}

async function createGoogleDocument(accessToken: string, title: string): Promise<string> {
  const response = await fetch(docsApiBaseUrl, {
    method: 'POST', headers: googleHeaders(accessToken), body: JSON.stringify({ title }),
  });
  const payload = await googlePayload(response, 'create the Google Doc');
  const documentId = String(payload['documentId'] ?? '');
  if (!documentId) throw new Error('Google Docs did not return a document ID.');
  return documentId;
}

async function populateGoogleDocument(
  accessToken: string,
  documentId: string,
  plan: ReturnType<typeof buildDocumentPlan>,
  warnings: string[],
): Promise<void> {
  await batchUpdate(accessToken, documentId, [{ insertText: { location: { index: 1 }, text: plan.text } }]);
  if (plan.styles.length) {
    await batchUpdate(accessToken, documentId, plan.styles.map((style) => ({
      updateParagraphStyle: {
        range: { startIndex: style.startIndex, endIndex: style.endIndex },
        paragraphStyle: { namedStyleType: style.namedStyleType },
        fields: 'namedStyleType',
      },
    })));
  }
  for (const marker of [...plan.markers].sort((a, b) => b.startIndex - a.startIndex)) {
    const remove = { deleteContentRange: { range: { startIndex: marker.startIndex, endIndex: marker.endIndex } } };
    if (marker.kind === 'page-break') {
      await batchUpdate(accessToken, documentId, [remove, { insertPageBreak: { location: { index: marker.startIndex } } }]);
      continue;
    }
    try {
      await batchUpdate(accessToken, documentId, [remove, {
        insertInlineImage: {
          uri: marker.image.url,
          location: { index: marker.startIndex },
          objectSize: { width: { magnitude: marker.image.widthPt, unit: 'PT' } },
        },
      }]);
    } catch (error) {
      warnings.push(`${marker.image.label} could not be inserted into Google Docs.`);
      await batchUpdate(accessToken, documentId, [remove, { insertText: { location: { index: marker.startIndex }, text: '[Image unavailable]' } }]);
      logger.warn('Prepared Google Docs image insertion failed.', { documentId, label: marker.image.label, message: error instanceof Error ? error.message : String(error) });
    }
  }
}

async function batchUpdate(accessToken: string, documentId: string, requests: unknown[]): Promise<void> {
  const response = await fetch(`${docsApiBaseUrl}/${encodeURIComponent(documentId)}:batchUpdate`, {
    method: 'POST', headers: googleHeaders(accessToken), body: JSON.stringify({ requests }),
  });
  await googlePayload(response, 'write the Google Doc');
}

function googleHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

async function googlePayload(response: Response, action: string): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = record(payload['error']);
    const message = safeText(error['message'], 500) || `Google could not ${action} (${response.status}).`;
    if (response.status === 401 || response.status === 403) throw new HttpsError('permission-denied', message);
    throw new Error(message);
  }
  return payload;
}

function durationLabel(seconds: number): string {
  if (!seconds) return '0 seconds';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${remainder} seconds`;
}

function formatExportDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

function safeMultilineText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength) : '';
}

function safeIdentifier(value: unknown, label: string): string {
  const identifier = safeText(value, 180);
  if (!/^[A-Za-z0-9_-]{4,180}$/.test(identifier)) throw new HttpsError('invalid-argument', `${label} is invalid.`);
  return identifier;
}

function uniqueStrings(value: unknown, limit: number): string[] {
  return Array.from(new Set((Array.isArray(value) ? value : []).filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

function safeOptionalHttpsUrl(value: unknown): string {
  const text = safeText(value, 2_000);
  if (!text) return '';
  try { const url = new URL(text); return url.protocol === 'https:' ? url.toString() : ''; } catch { return ''; }
}

function safeImageUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (text.startsWith('data:image/') && text.length <= 14_000_000) return text;
  return safeOptionalHttpsUrl(text);
}

export const boardDocExportTestHelpers = {
  buildDocumentPlan,
  privateIp,
};
