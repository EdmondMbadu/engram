import type { SpotifyTrack } from './spotify-playback.service';

const spotifyTrackIdPattern = /^[A-Za-z0-9]{12,32}$/;
const spotifyTrackReferencePattern =
  /(?:open\.spotify\.com\/(?:intl-[A-Za-z-]+\/)?track\/|spotify:track:)([A-Za-z0-9]{12,32})/i;

export function spotifyTrackIdFromReference(reference: string): string {
  const value = reference.trim();
  if (spotifyTrackIdPattern.test(value)) {
    return value;
  }
  return value.match(spotifyTrackReferencePattern)?.[1] ?? '';
}

export function spotifyTrackIdFromTrack(track: Pick<SpotifyTrack, 'uri' | 'spotifyUrl'>): string {
  return spotifyTrackIdFromReference(`${track.uri} ${track.spotifyUrl}`);
}

export function spotifyTrackEmbedUrl(trackId: string): string {
  const safeTrackId = spotifyTrackIdFromReference(trackId);
  return safeTrackId
    ? `https://open.spotify.com/embed/track/${encodeURIComponent(safeTrackId)}?utm_source=generator&theme=0`
    : '';
}
