import {
  boardNarrationDurationLabel,
  boardNarrationEstimatedTotalSeconds,
  boardNarrationTargetWords,
  normalizeBoardNarrationSeconds,
} from './board-narration-length';

describe('board narration length', () => {
  it('defaults and clamps to the supported five-second increments', () => {
    expect(normalizeBoardNarrationSeconds(undefined)).toBe(30);
    expect(normalizeBoardNarrationSeconds(2)).toBe(5);
    expect(normalizeBoardNarrationSeconds(43)).toBe(45);
    expect(normalizeBoardNarrationSeconds(240)).toBe(180);
  });

  it('uses the same 2.35 words-per-second estimate as Stack Studio', () => {
    expect(boardNarrationTargetWords(5)).toBe(12);
    expect(boardNarrationTargetWords(30)).toBe(71);
    expect(boardNarrationTargetWords(180)).toBe(423);
  });

  it('shows a useful total duration', () => {
    expect(boardNarrationEstimatedTotalSeconds(12, 30)).toBe(360);
    expect(boardNarrationDurationLabel(360)).toBe('~6 min');
    expect(boardNarrationDurationLabel(75)).toBe('~1:15');
  });
});
