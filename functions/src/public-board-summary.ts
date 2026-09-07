import { createHash, randomUUID } from 'node:crypto';
import type { Bucket } from '@google-cloud/storage';
import sharp from 'sharp';

export const PUBLIC_BOARD_SUMMARY_SCHEMA_VERSION = 1;

type BoardData = Record<string, unknown>;

export type OptimizedBoardCover = {
  sourceImageUrl: string;
  imageUrl: string;
  webpSrcset: string;
  width: number;
  height: number;
};

function stringValue(value: unknown, max = 2_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function firebaseDownloadUrl(bucketName: string, path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
}

function safeRemoteImageUrl(value: unknown): string {
  const raw = stringValue(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const blocked = url.username
      || url.password
      || (url.protocol !== 'https:' && url.protocol !== 'http:')
      || host === 'localhost'
      || host === '0.0.0.0'
      || host === '::1'
      || host === 'metadata.google.internal'
      || host.endsWith('.internal')
      || host.endsWith('.local')
      || /^127\./.test(host)
      || /^10\./.test(host)
      || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
      || /^192\.168\./.test(host)
      || /^169\.254\./.test(host)
      || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
      || /^(?:fc|fd)[0-9a-f]{2}:/.test(host)
      || /^fe[89ab][0-9a-f]:/.test(host);
    return blocked ? '' : url.toString();
  } catch {
    return '';
  }
}

async function fetchImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  let currentUrl = safeRemoteImageUrl(url);
  if (!currentUrl) throw new Error('Unsupported public board cover URL.');

  let response: Response | null = null;
  for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
    response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
        'User-Agent': 'LivingWiki/1.0 public-board-cover (https://www.livingwiki.com)',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get('location');
    const nextUrl = location ? safeRemoteImageUrl(new URL(location, currentUrl).toString()) : '';
    if (!nextUrl || redirectCount === 2) throw new Error('Public board cover redirected to an unsupported URL.');
    currentUrl = nextUrl;
  }

  if (!response?.ok) throw new Error(`Public board cover fetch failed (${response?.status ?? 0}).`);
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error('Public board cover response is not an image.');
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  const maxBytes = 8 * 1024 * 1024;
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error('Public board cover is too large.');
  if (!response.body) throw new Error('Public board cover response has no body.');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error('Public board cover is too large.');
    }
    chunks.push(Buffer.from(value));
  }
  const buffer = Buffer.concat(chunks, totalBytes);
  if (buffer.length < 1_024 || buffer.length > maxBytes) throw new Error('Public board cover size is unsupported.');
  return { buffer, contentType };
}

async function saveVariant(
  bucket: Bucket,
  path: string,
  bytes: Buffer,
  contentType: string,
  sourceImageUrl: string,
): Promise<string> {
  const token = randomUUID();
  await bucket.file(path).save(bytes, {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: 'public,max-age=31536000,immutable',
      metadata: {
        firebaseStorageDownloadTokens: token,
        sourceImageUrl: sourceImageUrl.slice(0, 1_000),
      },
    },
  });
  return firebaseDownloadUrl(bucket.name, path, token);
}

export async function optimizePublicBoardCover(
  bucket: Bucket,
  boardId: string,
  sourceImageUrl: string,
): Promise<OptimizedBoardCover> {
  const source = await fetchImage(sourceImageUrl);
  const hash = createHash('sha256').update(source.buffer).digest('hex').slice(0, 24);
  const sharpOptions = { failOn: 'warning' as const, limitInputPixels: 40_000_000 };
  const image = sharp(source.buffer, sharpOptions).rotate();
  const metadata = await image.metadata();
  const originalWidth = metadata.width ?? 960;
  const originalHeight = metadata.height ?? 540;
  const basePath = `public-board-covers/${boardId}/${hash}`;
  const widths = [320, 640, 960].filter((width) => width < originalWidth);
  if (!widths.includes(originalWidth)) widths.push(Math.min(originalWidth, 960));
  const uniqueWidths = Array.from(new Set(widths)).sort((left, right) => left - right);

  const webpVariants = await Promise.all(uniqueWidths.map(async (width) => {
    const bytes = await sharp(source.buffer, sharpOptions)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();
    const path = `${basePath}/cover-${width}.webp`;
    return {
      width,
      url: await saveVariant(bucket, path, bytes, 'image/webp', sourceImageUrl),
    };
  }));

  const fallbackWidth = Math.min(originalWidth, 960);
  const fallbackBytes = await sharp(source.buffer, sharpOptions)
    .rotate()
    .resize({ width: fallbackWidth, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();
  const fallbackUrl = await saveVariant(
    bucket,
    `${basePath}/cover-${fallbackWidth}.jpg`,
    fallbackBytes,
    'image/jpeg',
    sourceImageUrl,
  );
  const outputHeight = Math.max(1, Math.round(originalHeight * fallbackWidth / originalWidth));

  return {
    sourceImageUrl,
    imageUrl: fallbackUrl,
    webpSrcset: webpVariants.map((variant) => `${variant.url} ${variant.width}w`).join(', '),
    width: fallbackWidth,
    height: outputHeight,
  };
}

export function publicBoardSummaryFromBoard(
  boardId: string,
  board: BoardData,
  cover: OptimizedBoardCover | null = null,
): Record<string, unknown> {
  const cards = (Array.isArray(board['cards']) ? board['cards'] : []).filter((card) =>
    !card || typeof card !== 'object' || (card as BoardData)['authorOnly'] !== true);
  const favoriteCardCount = cards.filter((card) =>
    card && typeof card === 'object' && (card as BoardData)['status'] === 'favorite').length;
  const sourceImageUrl = stringValue(board['imageUrl']);

  return {
    schema_version: PUBLIC_BOARD_SUMMARY_SCHEMA_VERSION,
    id: boardId,
    owner_user_id: stringValue(board['owner_user_id'], 160),
    owner_public_slug: stringValue(board['owner_public_slug'], 80),
    owner_display_name: stringValue(board['owner_display_name'], 160),
    owner_photo_url: stringValue(board['owner_photo_url']),
    owner_profile_icon: stringValue(board['owner_profile_icon'], 80),
    owner_profile_picture_type: board['owner_profile_picture_type'] === 'image' || board['owner_profile_picture_type'] === 'icon'
      ? board['owner_profile_picture_type']
      : null,
    custom_slug: stringValue(board['custom_slug'], 80),
    visibility: board['visibility'] === 'public' ? 'public' : 'private',
    is_root: !stringValue(board['parentCardId'], 160),
    kind: stringValue(board['kind'], 40) || 'standard',
    sortOrder: numberValue(board['sortOrder']),
    title: stringValue(board['title'], 240),
    description: stringValue(board['description'], 500),
    backNote: stringValue(board['backNote'], 500),
    icon: stringValue(board['icon'], 80),
    tone: stringValue(board['tone'], 40) || 'teal',
    imageUrl: cover?.imageUrl || sourceImageUrl,
    image_webp_srcset: cover?.webpSrcset || '',
    image_width: cover?.width || 0,
    image_height: cover?.height || 0,
    source_image_url: cover?.sourceImageUrl || sourceImageUrl,
    card_count: cards.length,
    favorite_card_count: favoriteCardCount,
    search_text: cards
      .map((card) => card && typeof card === 'object'
        ? stringValue((card as BoardData)['title'], 240)
        : '')
      .filter(Boolean)
      .join(' ')
      .slice(0, 8_000),
    created_at_iso: stringValue(board['created_at_iso'], 80),
    updated_at_iso: stringValue(board['updated_at_iso'], 80),
  };
}
