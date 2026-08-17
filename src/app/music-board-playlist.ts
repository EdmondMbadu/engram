import type { SpotifyTrack } from './spotify-playback.service';

export type MusicBoardTrackSource = {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  spotifyUri?: string;
  spotifyUrl?: string;
  lookupContext?: string;
};

/**
 * Builds a provider queue without sorting or de-duplicating it. Repeated songs
 * can be intentional, and a filtered board view must never change the playlist.
 */
export function orderedSpotifyQueue(
  tracks: readonly MusicBoardTrackSource[],
): SpotifyTrack[] {
  return tracks
    .filter((track) => track.title.trim())
    .slice(0, 100)
    .map((track) => ({
      uri: track.spotifyUri?.trim() ?? '',
      title: track.title.trim(),
      artist: track.artist.trim(),
      album: track.album?.trim() ?? '',
      artworkUrl: track.artworkUrl?.trim() ?? '',
      spotifyUrl: track.spotifyUrl?.trim() ?? '',
      lookupTitle: track.title.trim(),
      lookupArtist: track.artist.trim(),
      lookupContext: track.lookupContext?.trim() ?? '',
    }));
}
