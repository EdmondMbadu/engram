import {
  normalizeWhat3WordsAddress,
  resolveWhat3WordsAddress,
  what3wordsFromCoordinates,
  what3wordsLocation,
} from './off-grid-location';

describe('off-grid what3words locations', () => {
  it('accepts a plain three-word address', () => {
    expect(normalizeWhat3WordsAddress('///Filled.Count.Soap')).toBe('filled.count.soap');
  });

  it('accepts a what3words link and removes query data', () => {
    expect(normalizeWhat3WordsAddress('https://what3words.com/filled.count.soap?maptype=satellite')).toBe(
      'filled.count.soap',
    );
  });

  it('rejects partial and ordinary addresses', () => {
    expect(normalizeWhat3WordsAddress('filled.count')).toBe('');
    expect(normalizeWhat3WordsAddress('Las Vegas, Nevada')).toBe('');
  });

  it('builds the canonical go-there URL', () => {
    expect(what3wordsLocation('///filled.count.soap')).toEqual({
      words: 'filled.count.soap',
      url: 'https://what3words.com/filled.count.soap',
    });
  });

  it('converts browser coordinates through the live API contract', async () => {
    const fetcher = jasmine.createSpy('fetch').and.resolveTo(new Response(JSON.stringify({
      words: 'filled.count.soap',
      nearestPlace: 'Bayswater, London',
      country: 'GB',
      coordinates: { lat: 51.521251, lng: -0.203586 },
    }), { status: 200 }));

    const location = await what3wordsFromCoordinates(51.521251, -0.203586, fetcher);

    expect(location.words).toBe('filled.count.soap');
    expect(location.nearestPlace).toBe('Bayswater, London');
    expect(String(fetcher.calls.mostRecent().args[0])).toContain('convert-to-3wa');
    expect(String(fetcher.calls.mostRecent().args[0])).toContain('coordinates=51.521251%2C-0.203586');
  });

  it('verifies pasted words and exposes API failures', async () => {
    const success = jasmine.createSpy('success').and.resolveTo(new Response(JSON.stringify({
      words: 'filled.count.soap',
      nearestPlace: 'Bayswater, London',
      country: 'GB',
      coordinates: { lat: 51.521251, lng: -0.203586 },
    }), { status: 200 }));
    await expectAsync(resolveWhat3WordsAddress('///filled.count.soap', success)).toBeResolved();

    const failure = jasmine.createSpy('failure').and.resolveTo(new Response(JSON.stringify({
      error: { code: 'BadWords', message: 'Invalid or non-existent 3 word address' },
    }), { status: 400 }));
    await expectAsync(resolveWhat3WordsAddress('///made.up.words', failure))
      .toBeRejectedWithError('Invalid or non-existent 3 word address');
  });
});
