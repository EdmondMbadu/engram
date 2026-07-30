import { isGenericTourStopFallback, tourStopDestinationQuery } from './tour-stop';

describe('Tour stop preparation', () => {
  it('uses a plain place name as the destination query', () => {
    expect(tourStopDestinationQuery('Flora MacDonald Statue')).toBe('Flora MacDonald Statue');
  });

  it('extracts the human label from a pasted Markdown link', () => {
    expect(tourStopDestinationQuery(
      '[Flora MacDonald Statue](https://www.encirclephotos.com/image/flora-macdonald-statue-in-inverness-scotland/)',
    )).toBe('Flora MacDonald Statue');
  });

  it('removes emphasis markers from the exact rich Markdown link pasted by a user', () => {
    expect(tourStopDestinationQuery(
      '[**Flora MacDonald Statue**](https://www.encirclephotos.com/image/flora-macdonald-statue-in-inverness-scotland/)',
    )).toBe('Flora MacDonald Statue');
  });

  it('derives a useful place query from a pasted URL', () => {
    expect(tourStopDestinationQuery(
      'https://www.encirclephotos.com/image/flora-macdonald-statue-in-inverness-scotland/',
    )).toBe('flora macdonald statue in inverness scotland');
  });

  it('rejects the generic full-tour fallback as a prepared stop', () => {
    expect(isGenericTourStopFallback({
      title: 'Create exactly one new stop for the existing walking tour',
      subtitle: 'Stop 1',
      notes: 'Draft tour stop for Historic Inverness: High Street & Beyond.',
      tour: {
        address: '',
        guideScript: 'This is a generated starting point for the tour.',
        lat: null,
        lng: null,
      },
    })).toBeTrue();
  });

  it('keeps a resolved real place', () => {
    expect(isGenericTourStopFallback({
      title: 'Flora MacDonald Statue',
      subtitle: 'A landmark above Inverness Castle',
      notes: 'A real tour stop.',
      tour: {
        address: 'Inverness IV2 3EG, United Kingdom',
        guideScript: 'Welcome to the Flora MacDonald Statue.',
        lat: 57.476,
        lng: -4.226,
      },
    })).toBeFalse();
  });
});
