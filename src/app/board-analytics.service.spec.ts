import { buildTrackedBoardUrl } from './board-analytics.service';

describe('board analytics helpers', () => {
  it('builds a stable tracked board URL without removing existing parameters', () => {
    const result = new URL(buildTrackedBoardUrl(
      'https://www.livingwiki.com/boards/cape-may-gems?view=stack',
      'Facebook',
      'Cape May 40,000 Group',
    ));
    expect(result.searchParams.get('view')).toBe('stack');
    expect(result.searchParams.get('utm_source')).toBe('facebook');
    expect(result.searchParams.get('utm_medium')).toBe('social');
    expect(result.searchParams.get('utm_campaign')).toBe('cape-may-40-000-group');
  });
});
