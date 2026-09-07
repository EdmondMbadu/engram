import { cardsForPublishedExperience, cardsVisibleToBoardViewer } from './board-card-visibility';

describe('board card visibility', () => {
  const cards = [
    { id: 'intro', authorOnly: true },
    { id: 'property' },
    { id: 'contact', authorOnly: false },
  ];

  it('keeps an author-only Intro reminder visible to its owner', () => {
    expect(cardsVisibleToBoardViewer(cards, 'owner-1', 'owner-1').map((card) => card.id))
      .toEqual(['intro', 'property', 'contact']);
  });

  it('removes author-only cards for signed-out and non-owner viewers', () => {
    expect(cardsVisibleToBoardViewer(cards, 'owner-1', '').map((card) => card.id))
      .toEqual(['property', 'contact']);
    expect(cardsVisibleToBoardViewer(cards, 'owner-1', 'viewer-2').map((card) => card.id))
      .toEqual(['property', 'contact']);
  });

  it('never puts author-only reminders into live or exported experiences', () => {
    expect(cardsForPublishedExperience(cards).map((card) => card.id))
      .toEqual(['property', 'contact']);
  });
});
