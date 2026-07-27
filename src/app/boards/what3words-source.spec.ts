import {
  extractWhat3WordsAddress,
  parseWhat3WordsBoardSource,
  what3WordsAddressFromCard,
} from './what3words-source';

describe('what3words pasted sources', () => {
  const canneryRowSource = [
    '**Location**\t**Three Word Address**',
    'Steinbeck Plaza\t[///candy.sage.sticks](https://w3w.co/candy.sage.sticks)',
    'Monterey Canning Co. Building 700\t[///cool.hurry.orbit](https://w3w.co/cool.hurry.orbit)',
    'Monterey Canning Co. Building 711\t[///budget.like.echo](https://w3w.co/budget.like.echo)',
    'McAbee Beach\t[///bunch.maker.words](https://w3w.co/bunch.maker.words)',
    'Pacific Biological Laboratories (Doc Rickett’s Lab)\t[///orange.mime.locker](https://w3w.co/orange.mime.locker)',
    'InterContinental the Clement Hotel\t[///storms.planet.even](https://w3w.co/storms.planet.even)',
    'Monterey Plaza Hotel & Spa\t[///line.spoke.safety](https://w3w.co/line.spoke.safety)',
    'City of Monterey Parking Garage\t[///birds.shiny.cages](https://w3w.co/birds.shiny.cages)',
    'Monterey Bay Aquarium\t[///sank.ticket.speeds](https://w3w.co/sank.ticket.speeds)',
    'San Carlos Beach\t[///ships.valid.lowest](https://w3w.co/ships.valid.lowest)',
  ].join('\n');

  it('parses Jim’s copied Cannery Row table without changing any pairing', () => {
    const parsed = parseWhat3WordsBoardSource(canneryRowSource);

    expect(parsed?.items.length).toBe(10);
    expect(parsed?.issues).toEqual([]);
    expect(parsed?.items[0]).toEqual(jasmine.objectContaining({
      name: 'Steinbeck Plaza',
      words: 'candy.sage.sticks',
    }));
    expect(parsed?.items[9]).toEqual(jasmine.objectContaining({
      name: 'San Carlos Beach',
      words: 'ships.valid.lowest',
    }));
  });

  it('supports short links, canonical links, bare addresses, and markdown links', () => {
    expect(extractWhat3WordsAddress('https://w3w.co/candy.sage.sticks')).toBe('candy.sage.sticks');
    expect(extractWhat3WordsAddress('https://what3words.com/cool.hurry.orbit?maptype=satellite')).toBe('cool.hurry.orbit');
    expect(extractWhat3WordsAddress('///budget.like.echo')).toBe('budget.like.echo');
    expect(extractWhat3WordsAddress('[///bunch.maker.words](https://w3w.co/bunch.maker.words)')).toBe('bunch.maker.words');
  });

  it('supports em-dash, numbered, markdown-table, and two-line formats', () => {
    const parsed = parseWhat3WordsBoardSource([
      '1. Steinbeck Plaza — ///candy.sage.sticks',
      '2. Monterey Bay Aquarium — https://w3w.co/sank.ticket.speeds',
      '| McAbee Beach | ///bunch.maker.words |',
      'San Carlos Beach',
      '///ships.valid.lowest',
    ].join('\n'));

    expect(parsed?.items.map((item) => item.name)).toEqual([
      'Steinbeck Plaza',
      'Monterey Bay Aquarium',
      'McAbee Beach',
      'San Carlos Beach',
    ]);
  });

  it('uses a standalone heading as the board title without stealing a place name', () => {
    const parsed = parseWhat3WordsBoardSource([
      'Cannery Row Magic Moments',
      'Location\tThree Word Address',
      'Steinbeck Plaza\t///candy.sage.sticks',
      'Monterey Bay Aquarium\t///sank.ticket.speeds',
    ].join('\n'));

    expect(parsed?.title).toBe('Cannery Row Magic Moments');
    expect(parsed?.items.map((item) => item.name)).toEqual([
      'Steinbeck Plaza',
      'Monterey Bay Aquarium',
    ]);
  });

  it('deduplicates exact addresses and reports malformed what3words rows', () => {
    const parsed = parseWhat3WordsBoardSource([
      'First place\t///candy.sage.sticks',
      'Duplicate place\thttps://w3w.co/candy.sage.sticks',
      'Broken place\t///only.two',
    ].join('\n'));

    expect(parsed?.items.length).toBe(1);
    expect(parsed?.issues.length).toBe(2);
    expect(parsed?.issues[0].message).toContain('Duplicate');
    expect(parsed?.issues[1].message).toContain('exactly three words');
  });

  it('does not classify ordinary dotted prose as a what3words list', () => {
    expect(parseWhat3WordsBoardSource('Read example.com first.\nThen upload photo.jpg.')).toBeNull();
  });

  it('recovers a what3words address from an affected saved card subtitle', () => {
    expect(what3WordsAddressFromCard({
      what3wordsAddress: '',
      title: 'Steinbeck Plaza',
      subtitle: '///candy.sage.sticks',
      notes: 'A scenic stop on Cannery Row.',
      sourceUrl: '',
    })).toBe('candy.sage.sticks');
  });

  it('recovers a what3words address from notes or a source link', () => {
    expect(what3WordsAddressFromCard({
      notes: 'Navigate with https://w3w.co/cool.hurry.orbit',
    })).toBe('cool.hurry.orbit');
    expect(what3WordsAddressFromCard({
      sourceUrl: 'https://what3words.com/budget.like.echo?maptype=satellite',
    })).toBe('budget.like.echo');
  });

  it('prefers the explicit address and ignores cards without what3words data', () => {
    expect(what3WordsAddressFromCard({
      what3wordsAddress: 'ships.valid.lowest',
      subtitle: '///candy.sage.sticks',
    })).toBe('ships.valid.lowest');
    expect(what3WordsAddressFromCard({
      title: 'Monterey Bay Aquarium',
      subtitle: 'A waterfront attraction',
    })).toBe('');
  });
});
