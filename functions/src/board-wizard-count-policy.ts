export type BoardWizardCountMode = 'auto' | 'fixed';
export type BoardWizardCountPolicy = 'source-exact' | 'prompt-exact' | 'complete-set' | 'target-count';

export type BoardWizardCountResolution = {
  policy: BoardWizardCountPolicy;
  targetCount: number;
  explicitCount: number | null;
  completeSet: boolean;
};

const completeLanguagePattern = /\b(?:all|every|complete|entire|full)\b/iu;
const completeCollectionPattern = /\b(?:signers?|members?|delegates?|people|persons?|presidents?|governors?|senators?|representatives?|justices?|winners?|champions?|recipients?|countries|states|capitals?|counties|cities|works?|books?|films?|movies?|albums?|songs?|episodes?|seasons?|characters?|players?|teams?|entries|items?|events?|amendments?|articles?|elements?|planets?|moons?)\b/iu;
const openEndedQualifierPattern = /\b(?:best|interesting|nice|great|favorite|favourite|recommended|worth visiting|hidden gems?)\b/iu;

export function inferBoardWizardPromptCount(value: string): number | null {
  const text = value.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!text) return null;
  const patterns = [
    /\b(?:make|create|build|generate|include|with|top|best|exactly)\s+(?:a\s+board\s+(?:with|of)\s+)?(\d{1,3})\b/u,
    /\b(\d{1,3})\s+(?:signers?|members?|delegates?|people|persons?|destinations?|places?|restaurants?|cards?|items?|facts?|rooms?|amenities?|cities|stops?)\b/u,
  ];
  for (const pattern of patterns) {
    const count = Number(text.match(pattern)?.[1] ?? 0);
    if (Number.isInteger(count) && count >= 1 && count <= 100) return count;
  }
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  };
  const match = text.match(/\b(?:top|best|include|with|make|create|build|generate|exactly)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/u);
  return match?.[1] ? words[match[1]] ?? null : null;
}

export function isBoardWizardCompleteSetRequest(value: string): boolean {
  const text = value.replace(/\s+/g, ' ').trim().toLowerCase();
  return completeLanguagePattern.test(text)
    && completeCollectionPattern.test(text)
    && !openEndedQualifierPattern.test(text);
}

export function normalizeBoardWizardCountMode(value: unknown): BoardWizardCountMode {
  return value === 'fixed' ? 'fixed' : 'auto';
}

export function resolveBoardWizardCount(input: {
  text: string;
  submittedCount: unknown;
  countMode: unknown;
  sourceCount?: number;
}): BoardWizardCountResolution {
  const submitted = Number(input.submittedCount);
  const fallbackCount = Number.isFinite(submitted)
    ? Math.max(1, Math.min(100, Math.trunc(submitted)))
    : 12;
  const sourceCount = Math.max(0, Math.min(100, Math.trunc(input.sourceCount ?? 0)));
  if (sourceCount) {
    return { policy: 'source-exact', targetCount: sourceCount, explicitCount: sourceCount, completeSet: false };
  }
  if (normalizeBoardWizardCountMode(input.countMode) === 'fixed') {
    return { policy: 'target-count', targetCount: fallbackCount, explicitCount: fallbackCount, completeSet: false };
  }
  const explicitCount = inferBoardWizardPromptCount(input.text);
  if (explicitCount) {
    return { policy: 'prompt-exact', targetCount: explicitCount, explicitCount, completeSet: false };
  }
  if (isBoardWizardCompleteSetRequest(input.text)) {
    return { policy: 'complete-set', targetCount: fallbackCount, explicitCount: null, completeSet: true };
  }
  return { policy: 'target-count', targetCount: fallbackCount, explicitCount: null, completeSet: false };
}

