export const DEFAULT_STACK_NARRATOR_VOICE_ID = 'warm-storyteller';
export const PERSONAL_STACK_NARRATOR_VOICE_ID = 'personal-voice';

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
  {
    id: 'vibrant-presenter',
    name: 'Vibrant Presenter',
    presentation: 'Female',
    style: 'Modern & expressive',
    description: 'A polished, engaging voice for culture, trends, and ideas.',
    icon: 'campaign',
    sampleText: 'Fresh ideas deserve an expressive voice. Let\'s meet the people, places, and moments shaping what comes next.',
  },
  {
    id: 'teenage-girl',
    name: 'Teenage Girl',
    presentation: 'Female',
    style: 'Playful & bright',
    description: 'A youthful, upbeat voice for trends, culture, and lively stories.',
    icon: 'kid_star',
    sampleText: 'There is so much to discover here. Let\'s explore the people, places, and ideas everyone will be talking about next.',
  },
  {
    id: 'elegant-guide',
    name: 'Elegant Guide',
    presentation: 'Female',
    style: 'Poised & British',
    description: 'Refined delivery for heritage, design, travel, and the arts.',
    icon: 'diamond',
    sampleText: 'There is something remarkable waiting just beyond the familiar. Let\'s uncover the history, craft, and character within.',
  },
  {
    id: 'british-storyteller',
    name: 'British Storyteller',
    presentation: 'Male',
    style: 'Warm & characterful',
    description: 'A personable British voice for journeys and local stories.',
    icon: 'travel_explore',
    sampleText: 'The best journeys are shaped by the stories we find along the way. Here is what makes this place truly distinctive.',
  },
  {
    id: 'cinematic-narrator',
    name: 'Cinematic Narrator',
    presentation: 'Male',
    style: 'Rich & dramatic',
    description: 'A resonant voice for history, biographies, and big moments.',
    icon: 'movie',
    sampleText: 'Some moments change everything that follows. This story reveals the choices, conflicts, and people behind the turning point.',
  },
  {
    id: 'friendly-explainer',
    name: 'Friendly Explainer',
    presentation: 'Male',
    style: 'Clear & approachable',
    description: 'Easygoing clarity for learning, guides, and practical boards.',
    icon: 'lightbulb',
    sampleText: 'Let\'s make this simple. These are the essential details, useful connections, and ideas worth remembering.',
  },
] as const;

export function stackNarratorVoiceById(voiceId: string): StackNarratorVoice | null {
  return STACK_NARRATOR_VOICES.find((voice) => voice.id === voiceId) ?? null;
}

export function normalizeStackNarratorVoiceId(value: unknown): string {
  if (value === PERSONAL_STACK_NARRATOR_VOICE_ID) {
    return PERSONAL_STACK_NARRATOR_VOICE_ID;
  }
  return typeof value === 'string' && stackNarratorVoiceById(value)
    ? value
    : DEFAULT_STACK_NARRATOR_VOICE_ID;
}

export function stackNarratorVoiceRequiresPaidPlan(value: unknown): boolean {
  return normalizeStackNarratorVoiceId(value) === PERSONAL_STACK_NARRATOR_VOICE_ID;
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
  ].some((suffix) => code === suffix || code.endsWith(`/${suffix}`));
}
