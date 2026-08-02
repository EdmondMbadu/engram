import {
  DEFAULT_STACK_NARRATOR_VOICE_ID,
  STACK_NARRATOR_VOICES,
  normalizeStackNarratorVoiceId,
  stackNarratorVoiceById,
} from './stack-voice';

describe('Stack narrator voice catalog', () => {
  it('offers five distinct narrator choices', () => {
    expect(STACK_NARRATOR_VOICES.length).toBe(5);
    expect(new Set(STACK_NARRATOR_VOICES.map((voice) => voice.id)).size).toBe(5);
  });

  it('includes female, male, and neutral presentations', () => {
    expect(new Set(STACK_NARRATOR_VOICES.map((voice) => voice.presentation)))
      .toEqual(new Set(['Female', 'Male', 'Neutral']));
  });

  it('provides a useful preview script for every voice', () => {
    expect(STACK_NARRATOR_VOICES.every((voice) => voice.sampleText.length >= 50)).toBeTrue();
  });

  it('normalizes missing and unknown values to the warm storyteller', () => {
    expect(normalizeStackNarratorVoiceId(undefined)).toBe(DEFAULT_STACK_NARRATOR_VOICE_ID);
    expect(normalizeStackNarratorVoiceId('unknown')).toBe(DEFAULT_STACK_NARRATOR_VOICE_ID);
    expect(stackNarratorVoiceById(DEFAULT_STACK_NARRATOR_VOICE_ID)?.name).toBe('Warm Storyteller');
  });
});
