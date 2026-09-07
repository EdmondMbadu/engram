import {
  hasListingTalkingCard,
  isListingTalkingCardPlaceholder,
  placeListingTalkingCard,
  shouldOfferListingTalkingCardSetup,
} from './listing-talking-card';

describe('real-estate Talking Card setup', () => {
  const tour = { id: 'tour', title: 'Kitchen', tags: ['listing-story', 'real-estate'] };
  const contact = { id: 'contact', title: 'Contact Jenny Morgan', tags: ['listing-contact', 'group-next-step', 'real-estate'] };
  const placeholder = { id: 'setup', title: 'Your Talking Card', tags: ['listing-talking-card-placeholder', 'author-only'] };

  it('offers one private setup step only on real-estate TalkThrus without a Talking Card', () => {
    expect(shouldOfferListingTalkingCardSetup({ title: 'A home', cards: [tour, contact] })).toBeTrue();
    expect(shouldOfferListingTalkingCardSetup({ title: 'A home', cards: [tour, placeholder, contact] })).toBeFalse();
    expect(shouldOfferListingTalkingCardSetup({ title: 'A home', cards: [tour, { id: 'guide', conversation: { atlasId: 'agent-wiki' } }] })).toBeFalse();
    expect(shouldOfferListingTalkingCardSetup({ title: 'Recipe ideas', cards: [] })).toBeFalse();
  });

  it('recognizes placeholders without treating them as public Talking Cards', () => {
    expect(isListingTalkingCardPlaceholder(placeholder)).toBeTrue();
    expect(hasListingTalkingCard({ cards: [placeholder] })).toBeTrue();
    expect(placeholder).not.toEqual(jasmine.objectContaining({ conversation: jasmine.anything() }));
  });

  it('replaces a placeholder and keeps the completed guide immediately before contact', () => {
    const guide = { id: 'guide', title: 'Ask Jenny', tags: ['talking-card'], conversation: { atlasId: 'agent-wiki' } };
    expect(placeListingTalkingCard([tour, placeholder, contact], guide, placeholder.id).map((card) => card.id))
      .toEqual(['tour', 'guide', 'contact']);
    expect(placeListingTalkingCard([tour, contact], guide).map((card) => card.id))
      .toEqual(['tour', 'guide', 'contact']);
  });

  it('puts the completed guide at the end when an older board has no contact card', () => {
    const guide = { id: 'guide', title: 'Ask Jenny', tags: ['talking-card'], conversation: { atlasId: 'agent-wiki' } };
    expect(placeListingTalkingCard([tour], guide).map((card) => card.id)).toEqual(['tour', 'guide']);
  });
});
