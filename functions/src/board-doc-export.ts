import { lookup } from 'node:dns/promises';
import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import JSZip from 'jszip';
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

type PreparedImage = {
  buffer: Buffer;
  extension: 'jpg' | 'png';
  contentType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  label: string;
  widthPt: number;
};

const maxCards = 200;
const maxImages = 300;
const maxImageBytes = 20 * 1024 * 1024;
const maxImageFetchAttempts = 5;
const imageFetchTimeoutMs = 20_000;
const imageFetchBaseRetryMs = 1_000;
const imageFetchMaxRetryMs = 15_000;
const docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const exportBoardToDocx = onCall(
  { region: 'us-central1', timeoutSeconds: 540, memory: '1GiB', cors: true },
  async (request) => {
    const userId = request.auth?.uid ?? '';
    if (!userId) throw new HttpsError('unauthenticated', 'Sign in before downloading this board as a DOCX file.');
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
    if (existing.data()?.['status'] === 'completed' && existing.data()?.['result']) {
      return existing.data()?.['result'];
    }
    const existingUpdatedAt = Date.parse(String(existing.data()?.['updated_at'] ?? ''));
    if (existing.data()?.['status'] === 'processing'
      && Number.isFinite(existingUpdatedAt)
      && Date.now() - existingUpdatedAt < 10 * 60 * 1000) {
      throw new HttpsError('aborted', 'This DOCX export is already in progress.');
    }
    await exportRef.set({
      user_id: userId,
      board_id: snapshot.boardId,
      request_id: snapshot.requestId,
      format: 'docx',
      status: 'processing',
      updated_at: new Date().toISOString(),
    }, { merge: true });

    try {
      const warnings: string[] = [];
      const images = await prepareSnapshotImages(snapshot, warnings);
      const docx = await createDocxBuffer(snapshot, images);
      const fileName = docxFileName(snapshot.documentTitle || snapshot.opening.title);
      const storagePath = `users/${userId}/board-doc-exports/${snapshot.boardId}/${snapshot.requestId}/${fileName}`;
      const downloadToken = randomUUID();
      await storage.bucket().file(storagePath).save(docx, {
        resumable: false,
        metadata: {
          contentType: docxMimeType,
          contentDisposition: `attachment; filename="${fileName.replace(/["\\]/g, '')}"`,
          metadata: { firebaseStorageDownloadTokens: downloadToken },
        },
      });
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storage.bucket().name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(downloadToken)}`;
      const result = {
        requestId: snapshot.requestId,
        fileName,
        storagePath,
        downloadUrl,
        exportedCardCount: snapshot.cards.length,
        exportedImageCount: images.size,
        warnings,
      };
      await exportRef.set({ status: 'completed', result, updated_at: new Date().toISOString() }, { merge: true });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DOCX export failed.';
      logger.error('Board DOCX export failed.', { userId, boardId: snapshot.boardId, requestId: snapshot.requestId, message });
      await exportRef.set({ status: 'failed', error_message: message.slice(0, 500), updated_at: new Date().toISOString() }, { merge: true });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('unavailable', message);
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
      imageUrls: uniqueStrings(card['imageUrls'], maxImages + 1).map(safeImageUrl).filter(Boolean),
      sourceUrl: safeOptionalHttpsUrl(card['sourceUrl']),
      wordCount: narration.split(/\s+/).filter(Boolean).length,
      estimatedSeconds: narration ? Math.max(1, Math.ceil(narration.split(/\s+/).filter(Boolean).length / 2.35)) : 0,
    };
  });
  if (!cards.length) throw new HttpsError('invalid-argument', 'Select at least one card before exporting.');
  if (cards.length > maxCards) throw new HttpsError('invalid-argument', `DOCX export supports up to ${maxCards} selected cards at a time.`);
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

async function prepareSnapshotImages(snapshot: ExportSnapshot, warnings: string[]): Promise<Map<string, PreparedImage>> {
  const requested = new Map<string, { label: string; widthPt: number }>();
  const add = (url: string, label: string, widthPt: number) => {
    if (!url) return;
    const existing = requested.get(url);
    if (!existing || existing.widthPt < widthPt) requested.set(url, { label, widthPt });
  };
  add(snapshot.opening.coverImageUrl, 'Cover image', 450);
  for (const card of snapshot.cards) {
    card.imageUrls.forEach((url, index) => add(url, `${card.position}. ${card.title}${index ? ` image ${index + 1}` : ' image'}`, index ? 300 : 430));
  }
  if (snapshot.closing.included) add(snapshot.closing.imageUrl, 'Final card image', 430);
  if (snapshot.closing.included) add(snapshot.closing.qrImageUrl, 'Board QR code', 120);

  const prepared = new Map<string, PreparedImage>();
  const entries = [...requested.entries()];
  // Many image CDNs (notably Wikimedia) rate-limit short concurrent bursts. Keep
  // downloads sequential so a larger board does not lose every image after the
  // first few, and let fetchPublicImage retry temporary responses below.
  for (const [url, details] of entries) {
    try {
      prepared.set(url, { ...await normalizeImage(url), ...details });
    } catch (error) {
      warnings.push(`${details.label} was skipped: ${error instanceof Error ? error.message : 'image preparation failed'}`);
    }
  }
  return prepared;
}

async function normalizeImage(url: string): Promise<Omit<PreparedImage, 'label' | 'widthPt'>> {
  const input = url.startsWith('data:') ? dataUrlBuffer(url) : await fetchPublicImage(url);
  if (input.byteLength > maxImageBytes) throw new Error('image is larger than 20 MB');
  const pipeline = sharp(input, { failOn: 'error', limitInputPixels: 25_000_000 })
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true });
  const metadata = await pipeline.metadata();
  if (metadata.hasAlpha) {
    const output = await pipeline.png({ compressionLevel: 8 }).toBuffer({ resolveWithObject: true });
    return { buffer: output.data, extension: 'png', contentType: 'image/png', width: output.info.width, height: output.info.height };
  }
  const output = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { buffer: output.data, extension: 'jpg', contentType: 'image/jpeg', width: output.info.width, height: output.info.height };
}

async function createDocxBuffer(snapshot: ExportSnapshot, images: Map<string, PreparedImage>): Promise<Buffer> {
  const packageData = buildDocxPackage(snapshot, images);
  const zip = new JSZip();
  for (const [path, value] of Object.entries(packageData.files)) zip.file(path, value);
  for (const media of packageData.media) zip.file(`word/media/${media.fileName}`, media.image.buffer);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function buildDocxPackage(snapshot: ExportSnapshot, images: Map<string, PreparedImage>): {
  files: Record<string, string>;
  media: Array<{ fileName: string; relationshipId: string; image: PreparedImage }>;
} {
  const media: Array<{ fileName: string; relationshipId: string; image: PreparedImage }> = [];
  const mediaByUrl = new Map<string, { fileName: string; relationshipId: string; image: PreparedImage }>();
  for (const [url, image] of images) {
    const index = media.length + 1;
    const entry = { fileName: `image${index}.${image.extension}`, relationshipId: `rId${index + 1}`, image };
    media.push(entry);
    mediaByUrl.set(url, entry);
  }
  let drawingId = 1;
  const body: string[] = [];
  const paragraph = (text: string, style?: 'Title' | 'Heading1' | 'Heading2' | 'Caption') => body.push(docxParagraph(text, style));
  const image = (url: string) => {
    const entry = mediaByUrl.get(url);
    if (entry) body.push(docxImageParagraph(entry, drawingId++));
  };
  const pageBreak = () => body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');

  paragraph(snapshot.opening.title, 'Title');
  if (snapshot.ownerName) paragraph(`Curated by ${snapshot.ownerName}`, 'Caption');
  paragraph(`${snapshot.cards.length} selected card${snapshot.cards.length === 1 ? '' : 's'} · Exported ${formatExportDate(snapshot.exportedAt)}`, 'Caption');
  if (snapshot.sourceUrl) paragraph(snapshot.sourceUrl, 'Caption');
  image(snapshot.opening.coverImageUrl);
  paragraph('Board Opening', 'Heading1');
  paragraph(snapshot.opening.title, 'Heading2');
  paragraph(snapshot.opening.description || 'No board introduction provided.');

  for (const card of snapshot.cards) {
    pageBreak();
    paragraph(`${String(card.position).padStart(2, '0')} · ${card.title}`, 'Heading1');
    const availableImages = card.imageUrls.filter((url) => mediaByUrl.has(url));
    if (availableImages.length) availableImages.forEach(image);
    else paragraph('No image available.', 'Caption');
    paragraph('Narration Script', 'Heading2');
    paragraph(card.narration || 'Narration not provided.');
    paragraph(`${card.wordCount} words · ${durationLabel(card.estimatedSeconds)} estimated narration`, 'Caption');
    if (card.sourceUrl) paragraph(`Source: ${card.sourceUrl}`, 'Caption');
  }

  if (snapshot.closing.included) {
    pageBreak();
    paragraph('Final Card', 'Heading1');
    image(snapshot.closing.imageUrl);
    paragraph(snapshot.closing.headline, 'Heading2');
    paragraph(snapshot.closing.message || snapshot.opening.title);
    image(snapshot.closing.qrImageUrl);
    if (snapshot.sourceUrl) paragraph(`Open the complete board: ${snapshot.sourceUrl}`, 'Caption');
  }

  if (snapshot.productionNotes.included) {
    pageBreak();
    paragraph('Production Notes', 'Heading1');
    paragraph(`Narrator: ${snapshot.productionNotes.narrator || 'Not selected'}`);
    paragraph(`Music: ${snapshot.productionNotes.music || 'No music'}`);
    paragraph(`Format: ${snapshot.productionNotes.format || 'Not selected'}`);
    paragraph(`Ratio: ${snapshot.productionNotes.ratio || 'Not selected'}`);
    if (snapshot.productionNotes.socialCaption) {
      paragraph('Social Caption', 'Heading2');
      paragraph(snapshot.productionNotes.socialCaption);
    }
  }

  const imageRelationships = media.map((entry) =>
    `<Relationship Id="${entry.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${entry.fileName}"/>`,
  ).join('');
  const createdAt = new Date(snapshot.exportedAt);
  const coreDate = Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString();
  return {
    media,
    files: {
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
      'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
      'word/styles.xml': docxStylesXml(),
      'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imageRelationships}</Relationships>`,
      'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(snapshot.documentTitle)}</dc:title><dc:creator>${xml(snapshot.ownerName || 'LivingWiki')}</dc:creator><cp:lastModifiedBy>LivingWiki</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${coreDate}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified></cp:coreProperties>`,
      'docProps/app.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>LivingWiki</Application><AppVersion>1.0</AppVersion></Properties>',
    },
  };
}

function docxParagraph(text: string, style?: 'Title' | 'Heading1' | 'Heading2' | 'Caption'): string {
  const paragraphProperties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  const lines = String(text ?? '').split('\n');
  const runs = lines.map((line, index) => `${index ? '<w:r><w:br/></w:r>' : ''}<w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r>`).join('');
  return `<w:p>${paragraphProperties}${runs}</w:p>`;
}

function docxImageParagraph(entry: { relationshipId: string; image: PreparedImage }, drawingId: number): string {
  const widthPt = Math.min(468, Math.max(72, entry.image.widthPt));
  const heightPt = Math.min(620, widthPt * entry.image.height / Math.max(1, entry.image.width));
  const cx = Math.round(widthPt * 12_700);
  const cy = Math.round(heightPt * 12_700);
  const label = xml(entry.image.label);
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${drawingId}" name="LivingWiki image ${drawingId}" descr="${label}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${drawingId}" name="${label}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${entry.relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function docxStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/><w:color w:val="24372E"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="280"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:color w:val="143F32"/><w:sz w:val="48"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="140"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="143F32"/><w:sz w:val="34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="2D6B54"/><w:sz w:val="27"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="100"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:color w:val="617168"/><w:sz w:val="18"/></w:rPr></w:style></w:styles>`;
}

async function fetchPublicImage(initialUrl: string): Promise<Buffer> {
  let url = new URL(initialUrl);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertPublicHttpsUrl(url);
    const response = await fetchImageResponse(url);
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

async function fetchImageResponse(
  url: URL,
  fetcher: typeof fetch = fetch,
  pause: (milliseconds: number) => Promise<void> = sleep,
): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < maxImageFetchAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), imageFetchTimeoutMs);
    try {
      lastResponse = await fetcher(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'LivingWiki DOCX Export/1.1 (https://livingwiki.com)' },
      });
    } catch (error) {
      if (attempt >= maxImageFetchAttempts - 1 || !isRetryableImageError(error)) throw error;
      await pause(imageRetryDelayMs(null, attempt));
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!isRetryableImageStatus(lastResponse.status) || attempt >= maxImageFetchAttempts - 1) {
      return lastResponse;
    }
    await lastResponse.body?.cancel();
    await pause(imageRetryDelayMs(lastResponse.headers.get('retry-after'), attempt));
  }
  return lastResponse!;
}

function isRetryableImageStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 500
    || status === 502 || status === 503 || status === 504;
}

function isRetryableImageError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
}

function imageRetryDelayMs(retryAfter: string | null, attempt: number): number {
  const exponentialDelay = imageFetchBaseRetryMs * (2 ** attempt);
  let requestedDelay = 0;
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) requestedDelay = seconds * 1_000;
    else {
      const retryAt = Date.parse(retryAfter);
      if (Number.isFinite(retryAt)) requestedDelay = Math.max(0, retryAt - Date.now());
    }
  }
  return Math.min(imageFetchMaxRetryMs, Math.max(exponentialDelay, requestedDelay));
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

function docxFileName(value: string): string {
  const stem = value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.docx$/i, '')
    .replace(/[^A-Za-z0-9 _.-]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120);
  return `${stem || 'LivingWiki Script and Images'}.docx`;
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

function xml(value: string): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
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
  buildDocxPackage,
  createDocxBuffer,
  fetchImageResponse,
  imageRetryDelayMs,
  isRetryableImageStatus,
  privateIp,
};
