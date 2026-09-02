import {
  adjustStackScriptNarration,
  normalizeStackScriptShortenResults,
  shortenStackScriptNarration,
  stackScriptSentenceCount,
  stackScriptShortenEstimateSeconds,
} from './stack-script-shortening';

describe('Stack script shortening', () => {
  it('shortens narration to the requested sentence limit', () => {
    const text = 'Welcome home. The entry opens to the living room. The kitchen sits beyond it.';
    expect(shortenStackScriptNarration(text, 2)).toBe('Welcome home. The entry opens to the living room.');
    expect(stackScriptSentenceCount(shortenStackScriptNarration(text, 2))).toBe(2);
  });

  it('does not pad narration that is already concise', () => {
    expect(shortenStackScriptNarration('Already concise.', 3)).toBe('Already concise.');
  });

  it('can restore fuller approved source material after shortening', () => {
    expect(adjustStackScriptNarration({
      cardId: 'one',
      narration: 'A welcoming home with a connected layout.',
      sourceNarration: 'A welcoming home opens the tour. The living spaces connect naturally. The kitchen anchors the main level.',
    }, 3)).toBe('A welcoming home opens the tour. The living spaces connect naturally. The kitchen anchors the main level.');
  });

  it('falls back per card when a server response is missing', () => {
    const cards = [
      { cardId: 'one', narration: 'First fact. Second fact. Third fact.' },
      { cardId: 'two', narration: 'Keep this one.' },
    ];
    const normalized = normalizeStackScriptShortenResults(
      cards,
      [{ cardId: 'one', narration: 'A shorter first fact. A shorter second fact.' }],
      2,
    );
    expect(normalized).toEqual([
      { cardId: 'one', narration: 'A shorter first fact. A shorter second fact.' },
      { cardId: 'two', narration: 'Keep this one.' },
    ]);
  });

  it('prefers a semantic server rewrite over slicing the original opening', () => {
    const cards = [{
      cardId: 'one',
      narration: 'Welcome inside. The kitchen opens to the dining room. Morning light fills both spaces.',
    }];
    expect(normalizeStackScriptShortenResults(cards, [{
      cardId: 'one',
      narration: 'Morning light connects the open kitchen and dining room.',
    }], 1)).toEqual([{
      cardId: 'one',
      narration: 'Morning light connects the open kitchen and dining room.',
    }]);
  });

  it('estimates the current board rather than using a fixed duration', () => {
    const shortBoard = [{ cardId: 'one', narration: 'A short line.' }];
    const longBoard = Array.from({ length: 10 }, (_, index) => ({
      cardId: String(index),
      narration: 'A short line.',
    }));
    expect(stackScriptShortenEstimateSeconds(longBoard, 1)).toBeGreaterThan(
      stackScriptShortenEstimateSeconds(shortBoard, 1),
    );
  });
});
