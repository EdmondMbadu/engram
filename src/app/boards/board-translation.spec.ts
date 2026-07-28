import {
  applyBoardTranslation,
  normalizeBoardTranslationResult,
} from './board-translation';

describe('board translation overlay', () => {
  it('changes only approved text fields and preserves links and exact locations', () => {
    const board = {
      title: 'Places',
      description: 'A guide',
      stackCtaLabel: 'Go there',
      stackCtaUrl: 'https://example.com/go',
      cards: [{
        title: 'Steinbeck Plaza',
        notes: 'Meet here.',
        googleMapsUrl: 'https://maps.google.com/example',
        what3wordsAddress: '///candy.sage.sticks',
        price: '$10',
        tags: ['historic'],
      }],
    };

    const translated = applyBoardTranslation(board, [
      { key: 'board.title', text: 'Lieux' },
      { key: 'cards.0.notes', text: 'Rendez-vous ici.' },
      { key: 'cards.0.googleMapsUrl', text: 'https://malicious.example' },
      { key: 'cards.0.what3wordsAddress', text: '///wrong.words.here' },
    ]);

    expect(translated.title).toBe('Lieux');
    expect(translated.cards[0].notes).toBe('Rendez-vous ici.');
    expect(translated.cards[0].googleMapsUrl).toBe(board.cards[0].googleMapsUrl);
    expect(translated.cards[0].what3wordsAddress).toBe(board.cards[0].what3wordsAddress);
    expect(translated.cards[0].price).toBe('$10');
    expect(board.title).toBe('Places');
    expect(board.cards[0].notes).toBe('Meet here.');
  });

  it('rejects malformed callable responses and unsafe segment paths', () => {
    expect(normalizeBoardTranslationResult({ boardId: 'board-1' })).toBeNull();

    const result = normalizeBoardTranslationResult({
      boardId: 'board-1',
      targetLanguage: 'ja',
      sourceLanguage: 'en',
      fingerprint: 'fingerprint',
      cached: true,
      changed: true,
      segments: [
        { key: 'board.title', text: '場所' },
        { key: '__proto__.polluted', text: 'yes' },
        { key: 'cards.0.productUrl', text: 'https://wrong.example' },
      ],
    });

    expect(result?.segments).toEqual([{ key: 'board.title', text: '場所' }]);
  });
});
