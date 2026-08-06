import { cardPresentationSubtitle } from './card-numbering';

describe('Board card numbering presentation', () => {
  it('preserves subtitles while numbering is enabled', () => {
    expect(cardPresentationSubtitle('Chapter 3', true)).toBe('Chapter 3');
  });

  it('removes generated sequence labels while numbering is disabled', () => {
    expect(cardPresentationSubtitle('Chapter 3', false)).toBe('');
    expect(cardPresentationSubtitle('#7', false)).toBe('');
    expect(cardPresentationSubtitle('3. The Journey Begins', false)).toBe('The Journey Begins');
    expect(cardPresentationSubtitle('Part 4 — Homecoming', false)).toBe('Homecoming');
  });

  it('does not remove meaningful non-sequence numbers', () => {
    expect(cardPresentationSubtitle('Apollo 11 and the Moon', false)).toBe('Apollo 11 and the Moon');
    expect(cardPresentationSubtitle('The year 2026', false)).toBe('The year 2026');
  });
});
