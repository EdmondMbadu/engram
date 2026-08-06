export type BoardNarrationStyleId =
  | 'storyteller'
  | 'personal-story'
  | 'teen-perspective'
  | 'guided-tour'
  | 'documentary';

export const defaultBoardNarrationStyleId: BoardNarrationStyleId = 'storyteller';

export function normalizeBoardNarrationStyle(value: unknown): BoardNarrationStyleId {
  switch (value) {
    case 'storyteller':
    case 'personal-story':
    case 'teen-perspective':
    case 'guided-tour':
    case 'documentary':
      return value;
    default:
      return defaultBoardNarrationStyleId;
  }
}

export function boardNarrationPromptInstructions(value: unknown): string {
  const style = normalizeBoardNarrationStyle(value);
  const perspectiveInstruction: Record<BoardNarrationStyleId, string> = {
    storyteller: 'Use a warm third-person storyteller who describes the subjects from the outside. Do not use first person as the board creator or featured subject.',
    'personal-story': 'Use a natural first-person perspective with “I” and “we,” speaking as the person or group at the center of the supplied material. Never invent personal memories, feelings, participation, or private facts; when firsthand experience is not supported, speak as the curator who chose the items.',
    'teen-perspective': 'Use a clear, energetic first-person teen perspective. Sound youthful and contemporary without forced slang, caricature, or exaggerated emotion. Never invent personal experiences or private facts; when firsthand experience is not supported, speak as a young curator sharing their take.',
    'guided-tour': 'Use a welcoming second-person guide who speaks directly to the viewer with “you,” leads them through the sequence, and points out what to notice or do next.',
    documentary: 'Use an objective third-person documentary perspective. Lead with verifiable facts and context, distinguish interpretation from fact, and avoid first-person claims and promotional hype.',
  };
  return [
    `Narration style: ${style}.`,
    perspectiveInstruction[style],
    'Apply this perspective consistently to board.description, every card.notes, and short_summary where natural because these fields become spoken narration in Live View and video.',
    'Keep titles, entity metadata, search queries, addresses, and other factual fields neutral and precise.',
    'Source fidelity and explicit user wording always override stylistic rewriting.',
  ].join(' ');
}

function joinNarrationCopy(lead: string, original: string, maxLength: number): string {
  const cleanLead = lead.replace(/\s+/g, ' ').trim();
  const cleanOriginal = original.replace(/\s+/g, ' ').trim();
  return [cleanLead, cleanOriginal].filter(Boolean).join(' ').slice(0, maxLength).trim();
}

export function boardNarrationFallbackDescription(
  value: unknown,
  title: string,
  description: string,
): string {
  const style = normalizeBoardNarrationStyle(value);
  const cleanTitle = title.replace(/\s+/g, ' ').trim() || 'this collection';
  const lead: Record<BoardNarrationStyleId, string> = {
    storyteller: '',
    'personal-story': `I put together ${cleanTitle} to share what makes it worth knowing.`,
    'teen-perspective': `Here’s my take on ${cleanTitle} and what makes it stand out.`,
    'guided-tour': `Explore ${cleanTitle} and discover what matters along the way.`,
    documentary: `${cleanTitle} brings together the key facts and context in this collection.`,
  };
  return joinNarrationCopy(lead[style], description, 500);
}

export function boardNarrationFallbackNotes(
  value: unknown,
  title: string,
  notes: string,
): string {
  const style = normalizeBoardNarrationStyle(value);
  const cleanTitle = title.replace(/\s+/g, ' ').trim() || 'This item';
  const lead: Record<BoardNarrationStyleId, string> = {
    storyteller: '',
    'personal-story': `I included ${cleanTitle} because it belongs in this story.`,
    'teen-perspective': `Here’s why ${cleanTitle} stood out to me.`,
    'guided-tour': `Take a closer look at ${cleanTitle}.`,
    documentary: `${cleanTitle} is presented here with its relevant facts and context.`,
  };
  return joinNarrationCopy(lead[style], notes, 3600);
}
