import {
  canPlanVisit,
  defaultVisitDateTime,
  parseVisitInviteEmails,
  rightNowVisitDateTime,
  tomorrowVisitDateTime,
  visitPlanInvitationTime,
  visitPlanLabel,
  visitStartIso,
} from './go-there';

describe('Go there planning', () => {
  it('allows mapped and exact off-grid place cards', () => {
    expect(canPlanVisit({
      type: 'place',
      entityType: 'place',
      googleMapsUrl: 'https://maps.google.com/?q=Steinbeck+Plaza',
    })).toBeTrue();
    expect(canPlanVisit({
      type: 'place',
      entityType: 'place',
      what3wordsAddress: 'candy.sage.sticks',
    })).toBeTrue();
  });

  it('does not offer Go there to music, products, or unlocated notes', () => {
    expect(canPlanVisit({
      type: 'place',
      entityType: 'place',
      mediaKind: 'song',
      googleMapsUrl: 'https://maps.google.com/',
    })).toBeFalse();
    expect(canPlanVisit({
      type: 'shop',
      entityType: 'product',
      googleMapsUrl: 'https://maps.google.com/',
    })).toBeFalse();
    expect(canPlanVisit({ type: 'note', entityType: 'other' })).toBeFalse();
  });

  it('deduplicates and validates optional invitation emails', () => {
    expect(parseVisitInviteEmails('SAM@example.com, sam@example.com; maya@example.org bad')).toEqual([
      'sam@example.com',
      'maya@example.org',
    ]);
  });

  it('builds reliable local quick-date values and UTC submission values', () => {
    const now = new Date(2026, 6, 27, 14, 12, 45);
    expect(rightNowVisitDateTime(now)).toBe('2026-07-27T14:12');
    expect(defaultVisitDateTime(now)).toBe('2026-07-27T14:30');
    expect(tomorrowVisitDateTime(now)).toBe('2026-07-28T10:00');
    expect(visitStartIso('not-a-date')).toBe('');
    expect(visitStartIso('2026-07-27T14:30')).toBe(new Date(2026, 6, 27, 14, 30).toISOString());
  });

  it('labels immediate and scheduled plans clearly', () => {
    const now = new Date('2026-07-27T21:00:00.000Z');
    expect(visitPlanLabel({
      startsAtIso: '2026-07-27T21:05:00.000Z',
      timezone: 'UTC',
    }, now)).toBe('Going now');
    expect(visitPlanLabel({
      startsAtIso: '2026-07-28T17:00:00.000Z',
      timezone: 'UTC',
    }, now)).toContain('Going ·');
  });

  it('formats invitation times with the complete date, time, and timezone', () => {
    const label = visitPlanInvitationTime({
      startsAtIso: '2026-07-30T17:00:00.000Z',
      timezone: 'America/Los_Angeles',
    });
    expect(label).toContain('2026');
    expect(label).toContain('10:00');
    expect(label).toMatch(/PDT|GMT-7/);
  });
});
