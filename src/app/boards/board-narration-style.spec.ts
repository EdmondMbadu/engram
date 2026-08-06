import {
  BOARD_NARRATION_STYLES,
  DEFAULT_BOARD_NARRATION_STYLE_ID,
  defaultNarratorVoiceIdForStyle,
  normalizeBoardNarrationStyleId,
} from './board-narration-style';
import { stackNarratorVoiceById } from './stack-voice';

describe('Board narration styles', () => {
  it('offers five distinct perspectives with working default voices', () => {
    expect(BOARD_NARRATION_STYLES.length).toBe(5);
    expect(new Set(BOARD_NARRATION_STYLES.map((style) => style.id)).size).toBe(5);
    for (const style of BOARD_NARRATION_STYLES) {
      expect(stackNarratorVoiceById(style.defaultVoiceId))
        .withContext(`${style.label} should map to an available narrator`)
        .not.toBeNull();
    }
  });

  it('keeps Storyteller as the safe default', () => {
    expect(normalizeBoardNarrationStyleId(undefined)).toBe(DEFAULT_BOARD_NARRATION_STYLE_ID);
    expect(normalizeBoardNarrationStyleId('unknown')).toBe(DEFAULT_BOARD_NARRATION_STYLE_ID);
    expect(defaultNarratorVoiceIdForStyle(DEFAULT_BOARD_NARRATION_STYLE_ID)).toBe('warm-storyteller');
  });

  it('uses the teenage voice for Teen perspective', () => {
    expect(defaultNarratorVoiceIdForStyle('teen-perspective')).toBe('teenage-girl');
  });
});
