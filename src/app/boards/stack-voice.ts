import stackNarratorVoiceCatalog from '../../../functions/src/stack-narrator-voices.json';

export const DEFAULT_STACK_NARRATOR_VOICE_ID = 'warm-storyteller';
export const PERSONAL_STACK_NARRATOR_VOICE_ID = 'personal-voice';
const PERSONAL_STACK_NARRATOR_VOICE_PREFIX = `${PERSONAL_STACK_NARRATOR_VOICE_ID}:`;

export type StackVoicePresentation = 'Female' | 'Male' | 'Neutral';
export type StackVoiceLibraryFilter = 'All' | StackVoicePresentation;

export type StackNarratorVoice = {
  id: string;
  name: string;
  presentation: StackVoicePresentation;
  accent: string;
  style: string;
  description: string;
  icon: string;
  recommended: boolean;
  sampleText: string;
};

type StackNarratorVoiceCatalogEntry = StackNarratorVoice & {
  providerVoiceId: string;
};

const catalog = stackNarratorVoiceCatalog as readonly StackNarratorVoiceCatalogEntry[];

export const STACK_NARRATOR_VOICES: readonly StackNarratorVoice[] = catalog.map((entry) => ({
  id: entry.id,
  name: entry.name,
  presentation: entry.presentation,
  accent: entry.accent,
  style: entry.style,
  description: entry.description,
  icon: entry.icon,
  recommended: entry.recommended,
  sampleText: entry.sampleText,
}));

export const RECOMMENDED_STACK_NARRATOR_VOICES: readonly StackNarratorVoice[] =
  STACK_NARRATOR_VOICES.filter((voice) => voice.recommended);

export const STACK_NARRATOR_VOICE_PRESENTATIONS: readonly StackVoicePresentation[] = [
  'Female',
  'Male',
  'Neutral',
];

export function stackNarratorVoiceById(voiceId: string): StackNarratorVoice | null {
  return STACK_NARRATOR_VOICES.find((voice) => voice.id === voiceId) ?? null;
}

export function filterStackNarratorVoices(
  voices: readonly StackNarratorVoice[],
  query: string,
  filter: StackVoiceLibraryFilter,
): StackNarratorVoice[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return voices.filter((voice) => {
    if (filter !== 'All' && voice.presentation !== filter) return false;
    if (!normalizedQuery) return true;
    return [voice.name, voice.presentation, voice.accent, voice.style, voice.description]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
}

export function normalizeStackNarratorVoiceId(value: unknown): string {
  if (isPersonalStackNarratorVoiceId(value)) {
    return String(value);
  }
  return typeof value === 'string' && stackNarratorVoiceById(value)
    ? value
    : DEFAULT_STACK_NARRATOR_VOICE_ID;
}

export function stackNarratorVoiceRequiresPaidPlan(value: unknown): boolean {
  // Every signed-in account receives one personal voice. Membership controls
  // how many voices can be created, not whether an existing voice can be used.
  return false;
}

export function personalStackNarratorVoiceId(voiceId: string): string {
  return `${PERSONAL_STACK_NARRATOR_VOICE_PREFIX}${voiceId}`;
}

export function personalVoiceIdFromStackNarrator(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(PERSONAL_STACK_NARRATOR_VOICE_PREFIX)) {
    return null;
  }
  const voiceId = value.slice(PERSONAL_STACK_NARRATOR_VOICE_PREFIX.length);
  return /^[A-Za-z0-9_-]{1,64}$/.test(voiceId) ? voiceId : null;
}

export function isPersonalStackNarratorVoiceId(value: unknown): boolean {
  return value === PERSONAL_STACK_NARRATOR_VOICE_ID
    || personalVoiceIdFromStackNarrator(value) !== null;
}

export function stackNarrationErrorIsPermanent(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string'
    ? error.code.toLowerCase()
    : '';
  return [
    'permission-denied',
    'unauthenticated',
    'invalid-argument',
    'failed-precondition',
    'not-found',
    'resource-exhausted',
  ].some((suffix) => code === suffix || code.endsWith(`/${suffix}`));
}
