import {
  boardWizardVideoCandidateBatches,
  boardWizardVideoTargetCount,
  normalizeBoardWizardMediaMode,
  orderBoardWizardVideoCandidates,
} from './board-wizard-media-mode';

describe('board wizard media mode', () => {
  const cards = Array.from({ length: 12 }, (_, index) => ({
    id: `card-${index + 1}`,
    suitable: index % 2 === 1,
  }));

  it('defaults missing and unknown values to images only', () => {
    expect(normalizeBoardWizardMediaMode(undefined)).toBe('images');
    expect(normalizeBoardWizardMediaMode('random')).toBe('images');
    expect(normalizeBoardWizardMediaMode('mixed')).toBe('mixed');
    expect(normalizeBoardWizardMediaMode('videos')).toBe('videos');
  });

  it('uses no videos for images, half for mixed, and every card for videos', () => {
    expect(boardWizardVideoTargetCount('images', 12)).toBe(0);
    expect(boardWizardVideoTargetCount('mixed', 12)).toBe(6);
    expect(boardWizardVideoTargetCount('mixed', 1)).toBe(1);
    expect(boardWizardVideoTargetCount('mixed', 21)).toBe(11);
    expect(boardWizardVideoTargetCount('videos', 100)).toBe(100);
  });

  it('prioritizes evenly distributed suitable cards and keeps stable fallbacks', () => {
    const ordered = orderBoardWizardVideoCandidates(cards, 'mixed', (card) => card.suitable);
    expect(ordered.slice(0, 6).map((card) => card.id)).toEqual([
      'card-2', 'card-4', 'card-6', 'card-8', 'card-10', 'card-12',
    ]);
    expect(new Set(ordered.map((card) => card.id)).size).toBe(12);
    expect(orderBoardWizardVideoCandidates(cards, 'images', () => true)).toEqual([]);
    expect(orderBoardWizardVideoCandidates(cards, 'videos', () => false)).toEqual(cards);
  });

  it('falls back to an evenly distributed whole-board selection when suitability is sparse', () => {
    const ordered = orderBoardWizardVideoCandidates(cards, 'mixed', (card) => card.id === 'card-1');
    expect(ordered.slice(0, 6).map((card) => card.id)).toEqual([
      'card-2', 'card-4', 'card-6', 'card-8', 'card-10', 'card-12',
    ]);
  });

  it('batches more than twenty candidates without dropping any cards', () => {
    const manyCards = Array.from({ length: 100 }, (_, index) => index + 1);
    const batches = boardWizardVideoCandidateBatches(manyCards);
    expect(batches.map((batch) => batch.length)).toEqual([20, 20, 20, 20, 20]);
    expect(batches.flat()).toEqual(manyCards);
  });
});
