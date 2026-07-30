export const NO_STACK_AUDIO_TRACK_ID = 'none';
export const DEFAULT_STACK_AUDIO_TRACK_ID = 'golden-hour-square';
export const DEFAULT_STACK_AUDIO_VOLUME = 0.18;
export const MIN_STACK_AUDIO_VOLUME = 0.08;
export const MAX_STACK_AUDIO_VOLUME = 0.32;

export type StackAudioTrack = {
  id: string;
  title: string;
  mood: string;
  description: string;
  icon: string;
  storagePath: string;
  durationSeconds: number;
};

export const STACK_AUDIO_TRACKS: readonly StackAudioTrack[] = [
  {
    id: 'sunlit-souk',
    title: 'Sunlit Souk',
    mood: 'Warm & adventurous',
    description: 'A colorful, curious pulse for discovery and travel.',
    icon: 'explore',
    storagePath: 'app-assets/stack-audio/sunlit-souk.mp3',
    durationSeconds: 210,
  },
  {
    id: 'caribbean-sun',
    title: 'Caribbean Sun',
    mood: 'Tropical & carefree',
    description: 'Easy sunshine for beaches, escapes, and good days.',
    icon: 'wb_sunny',
    storagePath: 'app-assets/stack-audio/caribbean-sun.mp3',
    durationSeconds: 180,
  },
  {
    id: 'festival-of-colors',
    title: 'Festival of Colors',
    mood: 'Bright & celebratory',
    description: 'A lively lift for festivals, gatherings, and big moments.',
    icon: 'celebration',
    storagePath: 'app-assets/stack-audio/festival-of-colors.mp3',
    durationSeconds: 180,
  },
  {
    id: 'mountain-air-motif',
    title: 'Mountain Air Motif',
    mood: 'Calm & expansive',
    description: 'Open, peaceful motion for nature and reflective stories.',
    icon: 'landscape',
    storagePath: 'app-assets/stack-audio/mountain-air-motif.mp3',
    durationSeconds: 210,
  },
  {
    id: 'samba-do-sol-nascente',
    title: 'Samba do Sol Nascente',
    mood: 'Energetic & joyful',
    description: 'Sunny rhythm for food, movement, and shared adventures.',
    icon: 'sunny',
    storagePath: 'app-assets/stack-audio/samba-do-sol-nascente.mp3',
    durationSeconds: 180,
  },
  {
    id: 'evening-motion',
    title: 'Evening Motion',
    mood: 'Smooth & modern',
    description: 'A polished city-night feel for culture and design.',
    icon: 'nightlife',
    storagePath: 'app-assets/stack-audio/evening-motion.mp3',
    durationSeconds: 210,
  },
  {
    id: 'city-pulse',
    title: 'City Pulse',
    mood: 'Bold & upbeat',
    description: 'Confident momentum for places, people, and new ideas.',
    icon: 'equalizer',
    storagePath: 'app-assets/stack-audio/city-pulse.mp3',
    durationSeconds: 180,
  },
  {
    id: 'cobblestone-daybreak',
    title: 'Cobblestone Daybreak',
    mood: 'Charming & curious',
    description: 'A light-footed soundtrack for history and wandering.',
    icon: 'footprint',
    storagePath: 'app-assets/stack-audio/cobblestone-daybreak.mp3',
    durationSeconds: 180,
  },
  {
    id: 'windswept-jig',
    title: 'Windswept Jig',
    mood: 'Playful & spirited',
    description: 'Quick, friendly energy for memorable local discoveries.',
    icon: 'air',
    storagePath: 'app-assets/stack-audio/windswept-jig.mp3',
    durationSeconds: 150,
  },
  {
    id: DEFAULT_STACK_AUDIO_TRACK_ID,
    title: 'Golden Hour Square',
    mood: 'Warm & reflective',
    description: 'A versatile glow that works beautifully with most boards.',
    icon: 'auto_awesome',
    storagePath: 'app-assets/stack-audio/golden-hour-square.mp3',
    durationSeconds: 180,
  },
] as const;

export function stackAudioTrackById(trackId: string): StackAudioTrack | null {
  return STACK_AUDIO_TRACKS.find((track) => track.id === trackId) ?? null;
}

export function normalizeStackAudioTrackId(value: unknown): string {
  if (value === NO_STACK_AUDIO_TRACK_ID) return NO_STACK_AUDIO_TRACK_ID;
  return typeof value === 'string' && stackAudioTrackById(value)
    ? value
    : DEFAULT_STACK_AUDIO_TRACK_ID;
}

export function normalizeStackAudioVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_STACK_AUDIO_VOLUME;
  }
  return Math.min(MAX_STACK_AUDIO_VOLUME, Math.max(MIN_STACK_AUDIO_VOLUME, value));
}
