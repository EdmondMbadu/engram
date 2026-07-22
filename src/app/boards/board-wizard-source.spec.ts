import { BOARD_WIZARD_PASTE_MAX_LENGTH, parseNumberedBoardSource } from './board-wizard-source';

describe('board wizard pasted sources', () => {
  it('parses a ranked article into ordered source sections', () => {
    const source = [
      'Travel Annual — Top 25 Islands',
      ...Array.from({ length: 25 }, (_item, index) => {
        const rank = index + 1;
        return `${rank}. Island ${rank} — Distinctive reason ${rank}\nSource-backed notes for island ${rank}.`;
      }),
    ].join('\n\n');

    const parsed = parseNumberedBoardSource(source);

    expect(parsed?.title).toBe('Travel Annual — Top 25 Islands');
    expect(parsed?.items.length).toBe(25);
    expect(parsed?.items[0]).toEqual(jasmine.objectContaining({
      rank: 1,
      title: 'Island 1',
      subtitle: 'Distinctive reason 1',
      body: 'Source-backed notes for island 1.',
    }));
    expect(parsed?.items[24].rank).toBe(25);
  });

  it('does not classify non-sequential prose as a ranked source', () => {
    expect(parseNumberedBoardSource('2026. A year in review\n2028. Looking ahead\n2030. Another date')).toBeNull();
  });

  it('supports pasted articles longer than the previous limit', () => {
    const source = `Top 3 places\n1. One\n${'a'.repeat(3000)}\n2. Two\n${'b'.repeat(3000)}\n3. Three\n${'c'.repeat(3000)}`;

    expect(source.length).toBeGreaterThan(8000);
    expect(source.length).toBeLessThan(BOARD_WIZARD_PASTE_MAX_LENGTH);
    expect(parseNumberedBoardSource(source)?.items.length).toBe(3);
  });

  it('removes markdown emphasis from source titles without losing the entity', () => {
    const parsed = parseNumberedBoardSource([
      'Ranked places',
      '1. **The Balvenie** — Dufftown',
      'Book a tour to see traditional whisky craft.',
      '2. **Glenfiddich** — Speyside',
      'Known for single malt and visitor tours.',
      '3. **Springbank** — Campbeltown',
      'An old-school working distillery.',
    ].join('\n'));
    expect(parsed?.items.map((item) => item.title)).toEqual(['The Balvenie', 'Glenfiddich', 'Springbank']);
  });

  it('preserves the source ranking criterion separately from its title', () => {
    const parsed = parseNumberedBoardSource('Top visits\nRanked for memorable experiences, not prestige.\n1. One\nA\n2. Two\nB\n3. Three\nC');
    expect(parsed?.title).toBe('Top visits');
    expect(parsed?.description).toBe('Ranked for memorable experiences, not prestige.');
  });
});
