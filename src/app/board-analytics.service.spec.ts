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

  it('uses a channel-appropriate medium for non-social links', () => {
    const email = new URL(buildTrackedBoardUrl(
      'https://www.livingwiki.com/boards/cape-may-gems',
      'email',
      'August update',
    ));
    const qr = new URL(buildTrackedBoardUrl(
      'https://www.livingwiki.com/boards/cape-may-gems',
      'qr-code',
      'Visitor center',
    ));
    const partner = new URL(buildTrackedBoardUrl(
      'https://www.livingwiki.com/boards/cape-may-gems',
      'partner-website',
      'Tourism office',
    ));
    expect(email.searchParams.get('utm_medium')).toBe('newsletter');
    expect(qr.searchParams.get('utm_medium')).toBe('qr');
    expect(partner.searchParams.get('utm_medium')).toBe('referral');
  });
});
