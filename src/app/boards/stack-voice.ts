export const DEFAULT_STACK_NARRATOR_VOICE_ID = 'warm-storyteller';

export type StackNarratorVoice = {
  id: string;
  name: string;
  presentation: 'Female' | 'Male' | 'Neutral';
  style: string;
  description: string;
  icon: string;
  sampleText: string;
};

export const STACK_NARRATOR_VOICES: readonly StackNarratorVoice[] = [
  {
    id: DEFAULT_STACK_NARRATOR_VOICE_ID,
    name: 'Warm Storyteller',
    presentation: 'Female',
    style: 'Warm & conversational',
    description: 'Friendly, expressive narration that suits most boards.',
    icon: 'favorite',
    sampleText: 'Every place has a story. Let\'s step inside this LivingWiki and discover what makes it memorable.',
  },
  {
    id: 'inspiring-guide',
    name: 'Inspiring Guide',
    presentation: 'Female',
    style: 'Bright & uplifting',
    description: 'An optimistic voice for ideas, milestones, and discovery.',
    icon: 'auto_awesome',
    sampleText: 'A great idea can change the way we see the world. Here are the people, places, and moments behind it.',
  },
  {
    id: 'confident-narrator',
    name: 'Confident Narrator',
    presentation: 'Male',
    style: 'Grounded & authoritative',
    description: 'A steady documentary voice for history and expertise.',
    icon: 'record_voice_over',
    sampleText: 'Behind every landmark is a deeper history. This story connects the details that matter most.',
  },
  {
    id: 'energetic-host',
    name: 'Energetic Host',
    presentation: 'Male',
    style: 'Bold & upbeat',
    description: 'A lively host for rankings, culture, food, and adventure.',
    icon: 'bolt',
    sampleText: 'Ready to explore? These are the standout experiences, surprising details, and local favorites worth knowing.',
  },
  {
    id: 'calm-documentary',
    name: 'Calm Documentary',
    presentation: 'Neutral',
    style: 'Calm & reflective',
    description: 'Measured narration for art, nature, and thoughtful stories.',
    icon: 'spa',
    sampleText: 'Take a moment to look more closely. Small details reveal how this story came to life.',
  },
] as const;

export function stackNarratorVoiceById(voiceId: string): StackNarratorVoice | null {
  return STACK_NARRATOR_VOICES.find((voice) => voice.id === voiceId) ?? null;
}

export function normalizeStackNarratorVoiceId(value: unknown): string {
  return typeof value === 'string' && stackNarratorVoiceById(value)
    ? value
    : DEFAULT_STACK_NARRATOR_VOICE_ID;
}
