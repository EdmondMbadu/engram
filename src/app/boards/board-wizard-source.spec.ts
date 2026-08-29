import {
  BOARD_WIZARD_PASTE_MAX_LENGTH,
  detectBoardWizardSourceUrl,
  parseNumberedBoardSource,
} from './board-wizard-source';

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

  it('parses bare Scene headings as an exact ordered source', () => {
    const parsed = parseNumberedBoardSource([
      'BioFarming Initiative',
      'Scene 1',
      'Healthy soil begins with a living community of microorganisms.',
      'Scene 2',
      'Farmers learn to make biologically active compost.',
      'Scene 3',
      'Side-by-side trials make the results visible.',
    ].join('\n\n'));

    expect(parsed?.title).toBe('BioFarming Initiative');
    expect(parsed?.items).toEqual([
      jasmine.objectContaining({ rank: 1, title: 'Scene 1', body: 'Healthy soil begins with a living community of microorganisms.' }),
      jasmine.objectContaining({ rank: 2, title: 'Scene 2', body: 'Farmers learn to make biologically active compost.' }),
      jasmine.objectContaining({ rank: 3, title: 'Scene 3', body: 'Side-by-side trials make the results visible.' }),
    ]);
  });

  it('uses an explicit Scene title while preserving its sequence', () => {
    const parsed = parseNumberedBoardSource([
      '# Scene 1: The challenge',
      'Depleted soil makes farming harder.',
      'Scene 2 — A biological response',
      'Compost restores the soil food web.',
      'Scene 3 - Proof in the field',
      'Comparison plots demonstrate the difference.',
    ].join('\n'));

    expect(parsed?.items.map((item) => item.title)).toEqual([
      'The challenge',
      'A biological response',
      'Proof in the field',
    ]);
  });

  it('preserves all 100 sequential Scene headings', () => {
    const source = Array.from({ length: 100 }, (_item, index) => [
      `Scene ${index + 1}`,
      `Narration for scene ${index + 1}.`,
    ].join('\n')).join('\n\n');

    const parsed = parseNumberedBoardSource(source);
    expect(parsed?.items.length).toBe(100);
    expect(parsed?.items[99]).toEqual(jasmine.objectContaining({
      rank: 100,
      title: 'Scene 100',
      body: 'Narration for scene 100.',
    }));
  });

  it('does not narrate a trailing runtime note as part of the final scene', () => {
    const parsed = parseNumberedBoardSource([
      'Scene 1',
      'Opening narration.',
      'Scene 2',
      'Middle narration.',
      'Scene 3',
      'Closing narration.',
      '',
      'This version should run approximately six to seven minutes at a measured narration pace.',
    ].join('\n'));

    expect(parsed?.items[2].body).toBe('Closing narration.');
  });

  it('detects a source URL pasted inside a Describe it prompt', () => {
    expect(detectBoardWizardSourceUrl(
      'describe',
      'Use the 15 destinations and pictures from https://www.newsweek.com/most-underrated-us-travel-destinations-revealed-12230311.',
      '',
    )).toBe('https://www.newsweek.com/most-underrated-us-travel-destinations-revealed-12230311');
  });

  it('uses the dedicated URL field in URL mode', () => {
    expect(detectBoardWizardSourceUrl(
      'url',
      'Ignore this prompt link https://example.com/wrong',
      'https://example.com/right',
    )).toBe('https://example.com/right');
  });

  it('returns no source URL for an ordinary description', () => {
    expect(detectBoardWizardSourceUrl('describe', 'A board about quiet coastal towns', '')).toBe('');
  });

  it('leaves tour links on the established tour ingestion path', () => {
    expect(detectBoardWizardSourceUrl(
      'walking-tour',
      'Follow https://maps.app.goo.gl/example in order',
      '',
    )).toBe('');
  });

  it('handles Markdown links and keeps balanced URL parentheses', () => {
    expect(detectBoardWizardSourceUrl(
      'describe',
      'Use [this source](https://example.com/article).',
      '',
    )).toBe('https://example.com/article');
    expect(detectBoardWizardSourceUrl(
      'describe',
      'Use https://en.wikipedia.org/wiki/Travel_(magazine).',
      '',
    )).toBe('https://en.wikipedia.org/wiki/Travel_(magazine)');
  });
});
