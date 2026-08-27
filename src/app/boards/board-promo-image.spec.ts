import {
  boardPromoDisplayUrl,
  boardPromoFileName,
  boardPromoLinkPanelWidth,
  boardPromoTextLines,
  boardPromoTitleFontSize,
} from './board-promo-image';

describe('board promo image helpers', () => {
  it('uses the final board path segment for a stable download filename', () => {
    expect(boardPromoFileName(
      'https://livingwiki.com/boards/the-wealthiest-democrats-in-american-politics',
      'Ignored title',
    )).toBe('the-wealthiest-democrats-in-american-politics-promo.png');
  });

  it('falls back to a normalized title when the URL has no board slug', () => {
    expect(boardPromoFileName('not a valid URL', 'Café & City Stories')).toBe('cafe-city-stories-promo.png');
  });

  it('shows a readable host and path without protocol or query tracking', () => {
    expect(boardPromoDisplayUrl(
      'https://www.livingwiki.com/boards/cape-may?v=123&utm_source=qr-code',
    )).toBe('livingwiki.com/boards/cape-may');
  });

  it('reduces title size as titles grow', () => {
    expect(boardPromoTitleFontSize('A short board')).toBeGreaterThan(
      boardPromoTitleFontSize('A deliberately much longer board title that needs more room to remain readable'),
    );
  });

  it('keeps the no-QR link border balanced around its content', () => {
    expect(boardPromoLinkPanelWidth(800)).toBe(920);
    expect(boardPromoLinkPanelWidth(200)).toBe(720);
    expect(boardPromoLinkPanelWidth(1400)).toBe(1240);
  });

  it('wraps and ellipsizes text to the requested line count', () => {
    const lines = boardPromoTextLines(
      'one two three four',
      80,
      (value) => value.length * 10,
      2,
    );
    expect(lines).toEqual(['one two', 'three…']);
  });

  it('returns no lines for empty copy', () => {
    expect(boardPromoTextLines('   ', 100, (value) => value.length, 3)).toEqual([]);
  });

  it('never lets one unbroken link overflow its available width', () => {
    const lines = boardPromoTextLines(
      'localhost:64957/boards/a-very-long-board-link',
      120,
      (value) => value.length * 10,
      2,
    );
    expect(lines).toEqual(['localhost:6…']);
  });
});
