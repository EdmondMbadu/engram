import {
  DEFAULT_STACK_NARRATOR_VOICE_ID,
  PERSONAL_STACK_NARRATOR_VOICE_ID,
  STACK_NARRATOR_VOICES,
  RECOMMENDED_STACK_NARRATOR_VOICES,
  normalizeStackNarratorVoiceId,
  isPersonalStackNarratorVoiceId,
  personalStackNarratorVoiceId,
  personalVoiceIdFromStackNarrator,
  filterStackNarratorVoices,
  stackNarrationErrorIsPermanent,
  stackNarratorVoiceRequiresPaidPlan,
  stackNarratorVoiceById,
} from './stack-voice';
import stackNarratorVoiceCatalog from '../../../functions/src/stack-narrator-voices.json';

describe('Stack narrator voice catalog', () => {
  it('offers forty-one distinct narrator choices', () => {
    expect(STACK_NARRATOR_VOICES.length).toBe(41);
    expect(new Set(STACK_NARRATOR_VOICES.map((voice) => voice.id)).size).toBe(41);
    expect(new Set(stackNarratorVoiceCatalog.map((voice) => voice.providerVoiceId)).size).toBe(41);
    expect(stackNarratorVoiceById('teenage-girl')).toEqual(jasmine.objectContaining({
      name: 'Teenage Girl',
      presentation: 'Female',
    }));
  });

  it('keeps the initial decision set focused', () => {
    expect(RECOMMENDED_STACK_NARRATOR_VOICES.length).toBe(6);
    expect(RECOMMENDED_STACK_NARRATOR_VOICES.every((voice) => voice.recommended)).toBeTrue();
    expect(RECOMMENDED_STACK_NARRATOR_VOICES.map((voice) => voice.id)).toContain(
      DEFAULT_STACK_NARRATOR_VOICE_ID,
    );
  });

  it('includes female, male, and neutral presentations', () => {
    expect(new Set(STACK_NARRATOR_VOICES.map((voice) => voice.presentation)))
      .toEqual(new Set(['Female', 'Male', 'Neutral']));
  });

  it('provides a useful preview script for every voice', () => {
    expect(STACK_NARRATOR_VOICES.every((voice) => voice.sampleText.length >= 50)).toBeTrue();
    expect(STACK_NARRATOR_VOICES.every((voice) => voice.accent.length >= 3)).toBeTrue();
  });

  it('searches across voice name, accent, style, and description', () => {
    expect(filterStackNarratorVoices(STACK_NARRATOR_VOICES, 'southern', 'All').map((voice) => voice.id))
      .toEqual(['ms-walker-southern']);
    expect(filterStackNarratorVoices(STACK_NARRATOR_VOICES, 'calm', 'All').length).toBeGreaterThan(1);
    expect(filterStackNarratorVoices(STACK_NARRATOR_VOICES, 'storyteller', 'All').length).toBeGreaterThan(1);
  });

  it('combines presentation filters with search without hiding the full catalog', () => {
    const femaleVoices = filterStackNarratorVoices(STACK_NARRATOR_VOICES, '', 'Female');
    expect(femaleVoices.length).toBeGreaterThan(10);
    expect(femaleVoices.every((voice) => voice.presentation === 'Female')).toBeTrue();
    expect(filterStackNarratorVoices(STACK_NARRATOR_VOICES, '', 'All')).toEqual(
      [...STACK_NARRATOR_VOICES],
    );
  });

  it('normalizes missing and unknown values to the warm storyteller', () => {
    expect(normalizeStackNarratorVoiceId(undefined)).toBe(DEFAULT_STACK_NARRATOR_VOICE_ID);
    expect(normalizeStackNarratorVoiceId('unknown')).toBe(DEFAULT_STACK_NARRATOR_VOICE_ID);
    expect(stackNarratorVoiceById(DEFAULT_STACK_NARRATOR_VOICE_ID)?.name).toBe('Warm Storyteller');
  });

  it('preserves the server-resolved personal narrator choice', () => {
    expect(normalizeStackNarratorVoiceId(PERSONAL_STACK_NARRATOR_VOICE_ID))
      .toBe(PERSONAL_STACK_NARRATOR_VOICE_ID);
    const reusableVoiceId = personalStackNarratorVoiceId('voice_123');
    expect(normalizeStackNarratorVoiceId(reusableVoiceId)).toBe(reusableVoiceId);
    expect(isPersonalStackNarratorVoiceId(reusableVoiceId)).toBeTrue();
    expect(personalVoiceIdFromStackNarrator(reusableVoiceId)).toBe('voice_123');
    expect(normalizeStackNarratorVoiceId('personal-voice:invalid/id'))
      .toBe(DEFAULT_STACK_NARRATOR_VOICE_ID);
  });

  it('allows every existing narrator for free while membership controls additional voice creation', () => {
    expect(STACK_NARRATOR_VOICES.every((voice) => !stackNarratorVoiceRequiresPaidPlan(voice.id)))
      .toBeTrue();
    expect(stackNarratorVoiceRequiresPaidPlan(PERSONAL_STACK_NARRATOR_VOICE_ID)).toBeFalse();
    expect(stackNarratorVoiceRequiresPaidPlan(personalStackNarratorVoiceId('voice_123'))).toBeFalse();
  });

  it('does not retry permanent narration authorization failures', () => {
    expect(stackNarrationErrorIsPermanent({ code: 'functions/permission-denied' })).toBeTrue();
    expect(stackNarrationErrorIsPermanent({ code: 'unauthenticated' })).toBeTrue();
    expect(stackNarrationErrorIsPermanent({ code: 'functions/invalid-argument' })).toBeTrue();
    expect(stackNarrationErrorIsPermanent({ code: 'functions/resource-exhausted' })).toBeTrue();
    expect(stackNarrationErrorIsPermanent({ code: 'functions/internal' })).toBeFalse();
    expect(stackNarrationErrorIsPermanent(new Error('Temporary network failure'))).toBeFalse();
  });
});
