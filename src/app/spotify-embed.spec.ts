import {
  spotifyTrackEmbedUrl,
  spotifyTrackIdFromReference,
  spotifyTrackIdFromTrack,
} from './spotify-embed';

describe('Spotify embeds', () => {
  const trackId = '3n3Ppam7vgaVa1iaRUc9Lp';

  it('extracts a track id from Spotify URLs and URIs', () => {
    expect(spotifyTrackIdFromReference(`https://open.spotify.com/track/${trackId}?si=test`))
      .toBe(trackId);
    expect(spotifyTrackIdFromReference(`spotify:track:${trackId}`)).toBe(trackId);
    expect(spotifyTrackIdFromReference(trackId)).toBe(trackId);
  });

  it('supports Spotify locale-prefixed track URLs', () => {
    expect(spotifyTrackIdFromReference(`https://open.spotify.com/intl-ja/track/${trackId}`))
      .toBe(trackId);
  });

  it('rejects search URLs and malformed identifiers', () => {
    expect(spotifyTrackIdFromReference('https://open.spotify.com/search/Billie%20Jean')).toBe('');
    expect(spotifyTrackIdFromReference('not-a-track')).toBe('');
  });

  it('builds the official Spotify embed URL for a resolved track', () => {
    const track = {
      uri: `spotify:track:${trackId}`,
      spotifyUrl: `https://open.spotify.com/track/${trackId}`,
    };

    expect(spotifyTrackIdFromTrack(track)).toBe(trackId);
    expect(spotifyTrackEmbedUrl(trackId)).toBe(
      `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`,
    );
  });
});
