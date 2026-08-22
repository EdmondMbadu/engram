import {
  buildStackDocsExportSnapshot,
  stackDocsExportImageCount,
  stackDocsExportMissingNarrationCount,
} from './stack-doc-export';

describe('Stack Docs export snapshot', () => {
  it('preserves selected order and the complete narration text', () => {
    const narration = 'First paragraph.\n\nSecond paragraph with every word intact.';
    const snapshot = buildStackDocsExportSnapshot({
      requestId: 'request-1',
      boardId: 'board-1',
      documentTitle: 'The Framers — Script & Images',
      sourceUrl: 'https://livingwiki.com/boards/board-1',
      ownerName: 'LivingWiki',
      exportedAt: '2026-08-21T12:00:00.000Z',
      opening: { title: 'The Framers', description: 'An introduction.', coverImageUrl: 'https://images.example/cover.jpg' },
      cards: [
        { id: 'b', title: 'Second in the board', narration, imageUrls: ['https://images.example/b.jpg'] },
        { id: 'a', title: 'First in the board', narration: 'Another complete script.', imageUrls: [] },
      ],
      closing: { included: true, headline: 'Keep exploring', message: 'Open the complete board.', imageUrl: '', qrImageUrl: '' },
      productionNotes: { included: false, narrator: 'Warm Storyteller', music: 'No music', format: 'Reel', ratio: 'Vertical', socialCaption: '' },
      includeCover: true,
      includeAllCardImages: true,
    });

    expect(snapshot.cards.map((card) => card.id)).toEqual(['b', 'a']);
    expect(snapshot.cards[0].narration).toBe(narration);
    expect(snapshot.cards[0].position).toBe(1);
    expect(snapshot.cards[1].position).toBe(2);
  });

  it('deduplicates images and can limit each card to its primary image', () => {
    const base = {
      requestId: 'request-2', boardId: 'board-2', documentTitle: 'Board', sourceUrl: '', ownerName: '',
      opening: { title: 'Board', description: '', coverImageUrl: '' },
      cards: [{ id: 'card', title: 'Card', narration: '', imageUrls: [' one ', 'two', 'one'] }],
      closing: { included: false, headline: '', message: '', imageUrl: '', qrImageUrl: '' },
      productionNotes: { included: false, narrator: '', music: '', format: '', ratio: '', socialCaption: '' },
      includeCover: false,
    };

    expect(buildStackDocsExportSnapshot({ ...base, includeAllCardImages: true }).cards[0].imageUrls).toEqual(['one', 'two']);
    expect(buildStackDocsExportSnapshot({ ...base, includeAllCardImages: false }).cards[0].imageUrls).toEqual(['one']);
  });

  it('reports missing narration and every requested image without blocking export', () => {
    const snapshot = buildStackDocsExportSnapshot({
      requestId: 'request-3', boardId: 'board-3', documentTitle: 'Board', sourceUrl: '', ownerName: '',
      opening: { title: 'Board', description: '', coverImageUrl: 'cover' },
      cards: [
        { id: 'one', title: 'One', narration: '', imageUrls: ['one-a', 'one-b'] },
        { id: 'two', title: 'Two', narration: 'Ready.', imageUrls: [] },
      ],
      closing: { included: true, headline: 'End', message: 'Done', imageUrl: 'closing', qrImageUrl: 'qr' },
      productionNotes: { included: false, narrator: '', music: '', format: '', ratio: '', socialCaption: '' },
      includeCover: true,
      includeAllCardImages: true,
    });

    expect(stackDocsExportMissingNarrationCount(snapshot)).toBe(1);
    expect(stackDocsExportImageCount(snapshot)).toBe(5);
  });
});
