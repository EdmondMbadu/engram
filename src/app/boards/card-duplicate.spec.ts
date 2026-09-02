import { duplicateCardRecord, type DuplicableCard } from './card-duplicate';

describe('duplicateCardRecord', () => {
  it('copies a Talking Card with independent IDs and preserves its persona configuration', () => {
    let id = 0;
    const source = {
      id: 'talking-card-1',
      title: 'Wynton Marsalis',
      imageUrls: ['avatar.jpg', 'stage.jpg'],
      tags: ['talking-card', 'jazz'],
      stickers: [{ id: 'sticker-1', icon: 'music_note' }],
      tour: null,
      childBoardId: 'child-board-1',
      conversation: {
        version: 1,
        provider: 'atlas',
        atlasId: 'atlas-wynton',
        openingMessage: 'Welcome to the conversation.',
      },
      listingPresentation: {
        kind: 'listing-group',
        groupKey: 'living',
        label: 'Living Areas',
        sourcePhotoCount: 2,
        presentationImageUrls: ['avatar.jpg', 'stage.jpg'],
      },
      relatedCards: [{
        id: 'related-1',
        title: 'Early years',
        imageUrls: ['young.jpg'],
        tags: ['history'],
        stickers: [],
        tour: null,
        childBoardId: 'nested-child-board',
        relatedCards: [],
        conversation: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        rank: 8,
      }],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    } satisfies DuplicableCard;
    const now = '2026-09-02T03:00:00.000Z';

    const copy = duplicateCardRecord(source, () => `copy-${++id}`, now);

    expect(copy.id).not.toBe(source.id);
    expect(copy.title).toBe('Wynton Marsalis (copy)');
    expect(copy.conversation).toEqual(source.conversation);
    expect(copy.conversation).not.toBe(source.conversation);
    expect(copy.listingPresentation).toEqual(source.listingPresentation);
    expect(copy.listingPresentation).not.toBe(source.listingPresentation);
    expect(copy.listingPresentation?.presentationImageUrls).not.toBe(source.listingPresentation?.presentationImageUrls);
    expect(copy.imageUrls).toEqual(source.imageUrls);
    expect(copy.imageUrls).not.toBe(source.imageUrls);
    expect(copy.tags).not.toBe(source.tags);
    expect(copy.stickers[0].id).not.toBe(source.stickers[0].id);
    expect(copy.childBoardId).toBe('');
    expect(copy.relatedCards[0].id).not.toBe(source.relatedCards[0].id);
    expect(copy.relatedCards[0].title).toBe('Early years');
    expect(copy.relatedCards[0].childBoardId).toBe('');
    expect(copy.relatedCards?.[0]?.['rank']).toBe(1);
    expect(copy.createdAt).toBe(now);
    expect(copy.updatedAt).toBe(now);
    expect(source.title).toBe('Wynton Marsalis');
  });

  it('clears stale route legs while retaining the duplicated tour stop location', () => {
    const source: DuplicableCard = {
      id: 'stop-1',
      title: 'Museum',
      imageUrls: [],
      tags: ['tour'],
      stickers: [],
      tour: { sequence: 2, lat: 39.9, lng: -74.9, legToNext: { toCardId: 'stop-2' } },
      relatedCards: [],
      createdAt: 'old',
      updatedAt: 'old',
    };

    const copy = duplicateCardRecord(source, () => 'stop-copy', 'now');

    expect(copy.tour).toEqual({ sequence: 2, lat: 39.9, lng: -74.9, legToNext: null });
    expect(copy.tour).not.toBe(source.tour);
  });
});
