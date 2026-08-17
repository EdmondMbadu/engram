import { orderedSpotifyQueue } from './music-board-playlist';

describe('orderedSpotifyQueue', () => {
  it('preserves the board order and intentional duplicates', () => {
    const queue = orderedSpotifyQueue([
      { title: 'Second', artist: 'Artist B', spotifyUri: 'spotify:track:BBBBBBBBBBBB' },
      { title: 'First', artist: 'Artist A', spotifyUri: 'spotify:track:AAAAAAAAAAAA' },
      { title: 'Second', artist: 'Artist B', spotifyUri: 'spotify:track:BBBBBBBBBBBB' },
    ]);

    expect(queue.map((track) => track.title)).toEqual(['Second', 'First', 'Second']);
  });

  it('keeps unresolved tracks so Spotify can resolve them after connection', () => {
    const queue = orderedSpotifyQueue([
      { title: 'A song to find', artist: 'An artist', lookupContext: 'A board' },
    ]);

    expect(queue[0].uri).toBe('');
    expect(queue[0].lookupContext).toBe('A board');
  });

  it('rejects blank entries and caps a provider request at 100 tracks', () => {
    const tracks = [
      { title: ' ', artist: '' },
      ...Array.from({ length: 105 }, (_, index) => ({
        title: `Song ${index + 1}`,
        artist: 'Artist',
      })),
    ];

    const queue = orderedSpotifyQueue(tracks);
    expect(queue.length).toBe(100);
    expect(queue[0].title).toBe('Song 1');
    expect(queue[99].title).toBe('Song 100');
  });
});
