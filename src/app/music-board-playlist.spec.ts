import {
  hasSongCardSignal,
  isMusicBoard,
  orderedSpotifyQueue,
  type MusicBoardCardSignal,
} from './music-board-playlist';

function card(overrides: Partial<MusicBoardCardSignal> = {}): MusicBoardCardSignal {
  return {
    tags: [],
    ...overrides,
  };
}

describe('music board classification', () => {
  it('does not classify an empty board from music words in its title or description', () => {
    expect(isMusicBoard({
      title: 'Music in the Face of War',
      description: 'Videos about songs, musicians, and conflict.',
      cards: [],
    })).toBeFalse();
  });

  it('does not classify video and editorial cards from prose alone', () => {
    expect(isMusicBoard({
      title: 'Music in the Face of War',
      cards: [card({ tags: ['music', 'history'] }), card({ tags: ['video'] })],
    })).toBeFalse();
  });

  it('recognizes structured song metadata and supports a one-song board', () => {
    expect(hasSongCardSignal(card({ spotifyTrackId: 'spotify-track-id' }))).toBeTrue();
    expect(hasSongCardSignal(card({ audioPreviewUrl: 'https://example.com/preview.mp3' }))).toBeTrue();
    expect(hasSongCardSignal(card({ mediaKind: 'song' }))).toBeTrue();
    expect(hasSongCardSignal(card({ entityType: 'work', tags: ['song'] }))).toBeTrue();
    expect(isMusicBoard({ cards: [card({ mediaKind: 'song' })] })).toBeTrue();
  });

  it('does not turn a larger mixed board into a music board because of one song', () => {
    const cards = Array.from({ length: 10 }, (_, index) =>
      card(index === 0 ? { mediaKind: 'song' } : { tags: ['history'] }),
    );

    expect(isMusicBoard({ cards })).toBeFalse();
    expect(isMusicBoard({
      cards: cards.map((item, index) => index < 4 ? card({ mediaKind: 'song' }) : item),
    })).toBeTrue();
  });
});

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
