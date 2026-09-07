import { completeListingIntroCard, isListingIntroCardPlaceholder } from './listing-intro-card';

describe('listing intro card', () => {
  const placeholder = {
    id: 'intro-1',
    title: 'Intro card',
    subtitle: 'Only you can see this reminder until you add your introduction.',
    notes: 'Add a short welcome message about the property and invite buyers to look around.',
    authorOnly: true,
    tags: ['listing', 'real-estate', 'listing-story', 'story-intro', 'intro-placeholder', 'author-only'],
    updatedAt: 'old',
  };

  it('recognizes only the author-only real-estate intro reminder', () => {
    expect(isListingIntroCardPlaceholder(placeholder)).toBeTrue();
    expect(isListingIntroCardPlaceholder({ ...placeholder, authorOnly: false })).toBeFalse();
    expect(isListingIntroCardPlaceholder({ ...placeholder, tags: ['intro-placeholder'] })).toBeFalse();
  });

  it('publishes a concise agent introduction and removes setup-only state', () => {
    const result = completeListingIntroCard(placeholder, {
      message: '  Hi, I’m Jenny. Take a look around, and contact me if you would like a private showing.  ',
      propertyTitle: '2837 Billy Casper Dr',
      agentName: 'Jenny Morgan',
      updatedAt: 'now',
    });

    expect(result.title).toBe('Welcome from Jenny Morgan');
    expect(result.subtitle).toBe('A personal introduction to 2837 Billy Casper Dr');
    expect(result.notes).toBe('Hi, I’m Jenny. Take a look around, and contact me if you would like a private showing.');
    expect(result.authorOnly).toBeFalse();
    expect(result.tags).toContain('agent-intro');
    expect(result.tags).not.toContain('intro-placeholder');
    expect(result.tags).not.toContain('author-only');
  });

  it('does not publish an empty introduction', () => {
    expect(completeListingIntroCard(placeholder, {
      message: '   ',
      propertyTitle: '2837 Billy Casper Dr',
      updatedAt: 'now',
    })).toBe(placeholder);
  });
});
