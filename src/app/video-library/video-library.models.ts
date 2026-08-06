export type VideoLibrarySourceType = 'board';
export type VideoLibraryRatio = 'vertical' | 'square' | 'landscape';

export const LIVINGWIKI_PUBLIC_APP_URL = 'https://www.livingwiki.com';

export interface VideoLibraryItem {
  id: string;
  ownerUserId: string;
  sourceType: VideoLibrarySourceType;
  sourceId: string;
  sourceTitle: string;
  sourceRoute: string;
  sourceAvailable: boolean;
  sourceUpdatedAt: string;
  currentSourceUpdatedAt: string;
  posterUrl: string;
  videoUrl: string;
  storagePath: string;
  publicStoragePath: string;
  publicShareUrl: string;
  mimeType: string;
  ratio: VideoLibraryRatio;
  durationSeconds: number;
  renderVersion: string;
  narrationEnabled: boolean;
  generatedAt: string;
}

export interface SaveLatestBoardVideoInput {
  boardId: string;
  boardTitle: string;
  boardRoute: string;
  boardUpdatedAt: string;
  posterUrl: string;
  blob: Blob;
  extension: 'mp4' | 'webm';
  mimeType: string;
  ratio: VideoLibraryRatio;
  durationSeconds: number;
  renderVersion: string;
  narrationEnabled: boolean;
  publicStoragePath?: string;
  publicShareUrl?: string;
}

export type VideoLibraryRecord = {
  id: string;
  owner_user_id: string;
  source_type: VideoLibrarySourceType;
  source_id: string;
  source_title: string;
  source_route: string;
  source_updated_at_iso: string;
  poster_url: string;
  video_url: string;
  storage_path: string;
  public_storage_path: string;
  public_share_url: string;
  mime_type: string;
  ratio: VideoLibraryRatio;
  duration_seconds: number;
  render_version: string;
  narration_enabled: boolean;
  generated_at_iso: string;
  updated_at_iso: string;
  server_updated_at?: unknown;
};

export function boardVideoLibraryId(boardId: string): string {
  return `board_${boardId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128)}`;
}

export function normalizeVideoLibraryRatio(value: unknown): VideoLibraryRatio {
  return value === 'square' || value === 'landscape' ? value : 'vertical';
}

export function canonicalPublicVideoUrl(value: string): string {
  if (!value) return '';
  try {
    const url = new URL(value, LIVINGWIKI_PUBLIC_APP_URL);
    if (!/^\/share\/board\/[A-Za-z0-9_-]{8,128}\/video\/?$/.test(url.pathname)) {
      return value;
    }
    return `${LIVINGWIKI_PUBLIC_APP_URL}${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

export function videoLibraryItemFromRecord(
  id: string,
  value: Record<string, unknown>,
): VideoLibraryItem | null {
  const sourceId = stringValue(value['source_id'], 128);
  const sourceTitle = stringValue(value['source_title'], 120);
  const videoUrl = stringValue(value['video_url'], 2500);
  if (!sourceId || !sourceTitle || !videoUrl) {
    return null;
  }
  return {
    id,
    ownerUserId: stringValue(value['owner_user_id'], 128),
    sourceType: 'board',
    sourceId,
    sourceTitle,
    sourceRoute: stringValue(value['source_route'], 240) || `/boards/${encodeURIComponent(sourceId)}`,
    sourceAvailable: true,
    sourceUpdatedAt: stringValue(value['source_updated_at_iso'], 80),
    currentSourceUpdatedAt: '',
    posterUrl: stringValue(value['poster_url'], 2500),
    videoUrl,
    storagePath: stringValue(value['storage_path'], 500),
    publicStoragePath: stringValue(value['public_storage_path'], 500),
    publicShareUrl: stringValue(value['public_share_url'], 2500),
    mimeType: stringValue(value['mime_type'], 120) || 'video/mp4',
    ratio: normalizeVideoLibraryRatio(value['ratio']),
    durationSeconds: finiteNumber(value['duration_seconds']),
    renderVersion: stringValue(value['render_version'], 64),
    narrationEnabled: value['narration_enabled'] !== false,
    generatedAt: stringValue(value['generated_at_iso'], 80),
  };
}

export function videoLibraryItemIsCurrent(item: Pick<VideoLibraryItem, 'sourceAvailable' | 'sourceUpdatedAt' | 'currentSourceUpdatedAt'>): boolean {
  if (!item.sourceAvailable || !item.currentSourceUpdatedAt || !item.sourceUpdatedAt) {
    return item.sourceAvailable;
  }
  const renderedSourceTime = Date.parse(item.sourceUpdatedAt);
  const currentSourceTime = Date.parse(item.currentSourceUpdatedAt);
  return Number.isFinite(renderedSourceTime)
    && Number.isFinite(currentSourceTime)
    && renderedSourceTime >= currentSourceTime;
}

function stringValue(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}
