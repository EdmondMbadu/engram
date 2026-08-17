import { createHash } from 'node:crypto';

export const SPOTIFY_PLAYLIST_SCOPE = 'playlist-modify-private';

export function spotifyCanExportPlaylist(scopes: readonly string[] | undefined): boolean {
  return Array.isArray(scopes) && scopes.includes(SPOTIFY_PLAYLIST_SCOPE);
}

export function spotifyPlaylistContentHash(boardId: string, uris: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify([boardId, ...uris])).digest('hex');
}

export function spotifyPlaylistName(title: unknown): string {
  const normalized = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : '';
  return (normalized || 'LivingWiki music board').slice(0, 100);
}

export function spotifyPlaylistDescription(boardId: string): string {
  return `Created from a LivingWiki music board · livingwiki.com/boards/${encodeURIComponent(boardId)}`.slice(0, 300);
}
