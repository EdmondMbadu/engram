import {
  buildTourHandoffFallback,
  effectiveTourHandoffText,
  tourHandoffDestinationTeaser,
  tourHandoffLegTargetsCard,
} from './tour-handoff';

describe('Tour handoffs', () => {
  const nextCard = {
    id: 'town-house',
    title: 'Inverness Town House',
    subtitle: 'Victorian civic landmark',
    notes: 'A richly decorated civic building completed in 1882. Its rooms hosted public life.',
    shortSummary: 'The Victorian civic landmark at the heart of the High Street.',
    tour: { sequence: 2, legToNext: null },
  };

  it('builds a grounded spoken handoff with verified route facts', () => {
    const fromCard = {
      id: 'flora',
      title: 'Flora MacDonald Statue',
      tour: {
        sequence: 1,
        legToNext: {
          durationText: '3 min',
          distanceText: '0.2 mi',
          instruction: 'Walk to Inverness Town House.',
          navScript: '',
          toCardId: nextCard.id,
        },
      },
    };

    expect(buildTourHandoffFallback(fromCard, nextCard, 'walking')).toBe(
      "Next stop: Inverness Town House. The Victorian civic landmark at the heart of the High Street. You should reach it in about 3 min on foot, around 0.2 mi. I'll meet you there.",
    );
  });

  it('uses a curated handoff when it targets the actual next stop', () => {
    const fromCard = {
      id: 'flora',
      title: 'Flora MacDonald Statue',
      tour: {
        sequence: 1,
        legToNext: {
          durationText: '3 min',
          distanceText: '',
          instruction: 'Walk to Inverness Town House.',
          navScript: "Next stop is Inverness Town House. Look for its ornate Victorian stonework before we meet at the entrance.",
          toCardId: nextCard.id,
        },
      },
    };

    expect(effectiveTourHandoffText(fromCard, nextCard, 'walking')).toBe(
      fromCard.tour.legToNext.navScript,
    );
  });

  it('replaces the legacy short-distance placeholder with grounded copy', () => {
    const fromCard = {
      id: 'flora',
      title: 'Flora MacDonald Statue',
      tour: {
        sequence: 1,
        legToNext: {
          durationText: '',
          distanceText: '',
          instruction: 'Walk from Flora MacDonald Statue to Inverness Town House.',
          navScript: 'From Flora MacDonald Statue, walk about a short distance, roughly nearby, to your next stop: Inverness Town House.',
          toCardId: nextCard.id,
        },
      },
    };

    const result = effectiveTourHandoffText(fromCard, nextCard, 'walking');
    expect(result).toContain('The Victorian civic landmark');
    expect(result).not.toContain('roughly nearby');
    expect(result).not.toContain('You should reach it');
  });

  it('does not trust a leg that points at a stale destination', () => {
    const leg = {
      toCardId: 'old-stop',
      navScript: 'Continue to Inverness Town House.',
      instruction: '',
    };
    expect(tourHandoffLegTargetsCard(leg, nextCard)).toBeFalse();
  });

  it('uses the first grounded complete sentence when no short summary exists', () => {
    expect(tourHandoffDestinationTeaser({
      ...nextCard,
      shortSummary: '',
      notes: '**Opened in 1882.** Its rooms hosted public life.',
    })).toBe('Opened in 1882.');
  });
});
