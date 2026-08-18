import { cardsForStackView } from './stack-card-selection';

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
});
