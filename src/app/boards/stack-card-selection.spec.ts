import {
  cardsForStackView,
  nextFiniteStackFrameIndex,
  previousFiniteStackFrameIndex,
} from './stack-card-selection';

describe('Stack card selection', () => {
  const cards = [
    { id: 'first', title: 'First card' },
    { id: 'second', title: 'Second card' },
    { id: 'last', title: 'Last card' },
  ];

  it('uses every hydrated board card in direct Live View', () => {
    const stalePreviewSelection = new Set(['last']);

    expect(cardsForStackView(cards, stalePreviewSelection, true)).toEqual(cards);
  });

  it('preserves intentional card selection inside Stack Studio', () => {
    expect(cardsForStackView(cards, new Set(['second']), false)).toEqual([cards[1]]);
  });

  it('stops on the closing frame instead of looping to the cover', () => {
    expect(nextFiniteStackFrameIndex(10, 12)).toBe(11);
    expect(nextFiniteStackFrameIndex(11, 12)).toBe(11);
  });

  it('stops on the cover when navigating backward', () => {
    expect(previousFiniteStackFrameIndex(1)).toBe(0);
    expect(previousFiniteStackFrameIndex(0)).toBe(0);
  });
});
