export function shouldGroundAndVerifyBoardWizardBatch(input: {
  mode: string;
  prompt: string;
  pastedList?: string;
  targetBoardTitle?: string | null;
  count: number;
  sourceManifest?: unknown;
}): boolean {
  if (input.mode === 'photos') {
    return false;
  }
  if (input.mode === 'url') {
    return true;
  }
  const text = [input.prompt, input.pastedList, input.targetBoardTitle]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return input.count >= 20
    || /\b(top|best|ranked|ranking|recommend(?:ed|ation|ations)?|worth visiting|places to visit|insider|curated|must[- ]see|must[- ]visit)\b/.test(text)
    || /\b(all|every|complete|comprehensive|current|currently|latest|today|present|as of|chronological|chronologically|in order|ordered|timeline|full list|entire)\b/.test(text)
    || /\b(winners?|champions?|members?|capitals?|discography|filmography|officeholders?|recipients?|roster|catalog(?:ue)?)\b/.test(text)
    || /\b(list|sequence|history|historical|facts?|biograph(?:y|ies))\b.*\b(pictures?|photos?|images?|people|persons|places|events|works|products)\b/.test(text);
}

export function boardWizardResearchMode(input: {
  mode: string;
  prompt: string;
  pastedList?: string;
  sourceManifest?: unknown;
}): 'source' | 'curated' | 'factual' | 'creative' {
  if ((input.mode === 'paste' && (input.pastedList ?? '').trim()) || input.sourceManifest) return 'source';
  const text = input.prompt.replace(/\s+/g, ' ').toLowerCase();
  if (/\b(top|best|ranked|ranking|recommend(?:ed|ation|ations)?|worth visiting|places to visit|insider|curated|ultimate|must[- ]see|must[- ]visit)\b/.test(text)) return 'curated';
  if (/\b(all|every|complete|current|latest|chronological|in order|timeline|history|facts?|list)\b/.test(text)) return 'factual';
  return 'creative';
}
