import { cardsForNewBoardInside, legacyMemoryImages, relatedCardCollectionLabel, upsertNestedCard } from './related-cards';

describe('Related card collections', () => {
  it('turns additional card photos into unique legacy memories', () => {
    expect(legacyMemoryImages('cover.jpg', [
      'cover.jpg',
      'first-memory.jpg',
      'first-memory.jpg',
      'second-memory.jpg',
    ])).toEqual(['first-memory.jpg', 'second-memory.jpg']);
  });

  it('does not repeat a photo already represented by an explicit related card', () => {
    expect(legacyMemoryImages(
      'cover.jpg',
      ['cover.jpg', 'first-memory.jpg', 'second-memory.jpg'],
      ['first-memory.jpg'],
    )).toEqual(['second-memory.jpg']);
  });

  it('keeps a memory-first label for legacy and explicit memories', () => {
    expect(relatedCardCollectionLabel([], 2)).toBe('Explore 2 memories');
    expect(relatedCardCollectionLabel(['memory'], 0)).toBe('Explore 1 memory');
    expect(relatedCardCollectionLabel(['memory'], 2)).toBe('Explore 3 memories');
  });

  it('uses a general related-card label when the collection has another card type', () => {
    expect(relatedCardCollectionLabel(['memory', 'place'], 1)).toBe('Explore 3 cards');
    expect(relatedCardCollectionLabel(['idea'], 0)).toBe('Explore 1 card');
  });

  it('adds a nested card without removing the existing collection', () => {
    expect(upsertNestedCard(
      [{ id: 'legacy-one', title: 'First' }, { id: 'legacy-two', title: 'Second' }],
      { id: 'new-card', title: 'New' },
      null,
    ).map((card) => card.id)).toEqual(['legacy-one', 'legacy-two', 'new-card']);
  });

  it('updates one nested card while preserving its siblings and order', () => {
    expect(upsertNestedCard(
      [{ id: 'first', title: 'First' }, { id: 'second', title: 'Second' }],
      { id: 'first', title: 'Updated' },
      'first',
    )).toEqual([
      { id: 'first', title: 'Updated' },
      { id: 'second', title: 'Second' },
    ]);
  });

  it('copies every legacy nested card into a new board without sharing card objects', () => {
    const legacyCards = [{ id: 'first' }, { id: 'second' }];
    const migrated = cardsForNewBoardInside(legacyCards);

    expect(migrated.map((card) => card.id)).toEqual(['first', 'second']);
    expect(migrated[0]).not.toBe(legacyCards[0]);
    expect(migrated[1]).not.toBe(legacyCards[1]);
  });
});
