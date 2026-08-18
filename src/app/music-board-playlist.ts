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

export type MusicBoardCardSignal = {
  tags: readonly string[];
  audioPreviewUrl?: string;
  spotifyTrackId?: string;
  spotifyTrackUrl?: string;
  mediaKind?: string;
  entityType?: string;
};

export type MusicBoardCandidate = {
  title?: string;
  description?: string;
  cards: readonly MusicBoardCardSignal[];
};

/**
 * A card must carry structured song metadata to count as a song. Board and
 * card prose are deliberately ignored so words such as "music" cannot switch
 * a normal board into the SuprrrJuke presentation.
 */
export function hasSongCardSignal(card: MusicBoardCardSignal): boolean {
  if (card.spotifyTrackId || card.spotifyTrackUrl || card.audioPreviewUrl) {
    return true;
  }
  if (card.mediaKind) return card.mediaKind === 'song';
  if (card.entityType && card.entityType !== 'work') return false;
  return card.tags.some((tag) =>
    ['song', 'songs', 'music-track', 'spotify-track'].includes(tag.toLowerCase()),
  );
}

/**
 * Uses only structured card evidence to decide whether a board should use the
 * music presentation. One genuine song is enough for a one- or two-card
 * board; larger mixed boards still need a meaningful share of song cards.
 */
export function isMusicBoard(board: MusicBoardCandidate): boolean {
  const sample = board.cards.slice(0, 24);
  if (!sample.length) {
    return false;
  }
  const songSignals = sample.filter(hasSongCardSignal).length;
  return songSignals >= Math.max(1, Math.ceil(sample.length * 0.35));
}

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
