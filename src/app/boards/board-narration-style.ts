import {
  DEFAULT_STACK_NARRATOR_VOICE_ID,
  stackNarratorVoiceById,
} from './stack-voice';

export type BoardNarrationStyleId =
  | 'storyteller'
  | 'personal-story'
  | 'teen-perspective'
  | 'guided-tour'
  | 'documentary';

export type BoardNarrationStyle = {
  id: BoardNarrationStyleId;
  label: string;
  perspective: string;
  description: string;
  icon: string;
  defaultVoiceId: string;
};

export const DEFAULT_BOARD_NARRATION_STYLE_ID: BoardNarrationStyleId = 'storyteller';

export const BOARD_NARRATION_STYLES: readonly BoardNarrationStyle[] = [
  {
    id: DEFAULT_BOARD_NARRATION_STYLE_ID,
    label: $localize`Storyteller`,
    perspective: $localize`Third person`,
    description: $localize`Describes the people, places, and events from the outside.`,
    icon: 'auto_stories',
    defaultVoiceId: DEFAULT_STACK_NARRATOR_VOICE_ID,
  },
  {
    id: 'personal-story',
    label: $localize`Personal story`,
    perspective: $localize`First person`,
    description: $localize`Tells the story using “I” and “we,” as someone who experienced it.`,
    icon: 'person',
    defaultVoiceId: 'inspiring-guide',
  },
  {
    id: 'teen-perspective',
    label: $localize`Teen perspective`,
    perspective: $localize`First person`,
    description: $localize`Uses an energetic, youthful point of view without forced slang.`,
    icon: 'kid_star',
    defaultVoiceId: 'teenage-girl',
  },
  {
    id: 'guided-tour',
    label: $localize`Guided tour`,
    perspective: $localize`Second person`,
    description: $localize`Speaks directly to the viewer and leads them through the board.`,
    icon: 'explore',
    defaultVoiceId: 'friendly-explainer',
  },
  {
    id: 'documentary',
    label: $localize`Documentary`,
    perspective: $localize`Objective`,
    description: $localize`Presents the subject with clear facts, context, and significance.`,
    icon: 'description',
    defaultVoiceId: 'confident-narrator',
  },
] as const;

export function boardNarrationStyleById(value: unknown): BoardNarrationStyle | null {
  return typeof value === 'string'
    ? BOARD_NARRATION_STYLES.find((style) => style.id === value) ?? null
    : null;
}

export function normalizeBoardNarrationStyleId(value: unknown): BoardNarrationStyleId {
  return boardNarrationStyleById(value)?.id ?? DEFAULT_BOARD_NARRATION_STYLE_ID;
}

export function defaultNarratorVoiceIdForStyle(value: unknown): string {
  const style = boardNarrationStyleById(value)
    ?? boardNarrationStyleById(DEFAULT_BOARD_NARRATION_STYLE_ID);
  return style?.defaultVoiceId ?? DEFAULT_STACK_NARRATOR_VOICE_ID;
}

export function defaultNarratorVoiceNameForStyle(value: unknown): string {
  return stackNarratorVoiceById(defaultNarratorVoiceIdForStyle(value))?.name
    ?? stackNarratorVoiceById(DEFAULT_STACK_NARRATOR_VOICE_ID)?.name
    ?? 'Narrator';
}
