export function shouldGroundAndVerifyBoardWizardBatch(input: {
  mode: string;
  prompt: string;
  pastedList?: string;
  targetBoardTitle?: string | null;
  count: number;
}): boolean {
  if (input.mode === 'photos' || input.mode === 'url') {
    return false;
  }
  const text = [input.prompt, input.pastedList, input.targetBoardTitle]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return input.count >= 20
    || /\b(all|every|complete|comprehensive|current|currently|latest|today|present|as of|chronological|chronologically|in order|ordered|timeline|full list|entire)\b/.test(text)
    || /\b(winners?|champions?|members?|capitals?|discography|filmography|officeholders?|recipients?|roster|catalog(?:ue)?)\b/.test(text)
    || /\b(list|sequence|history|historical|facts?|biograph(?:y|ies))\b.*\b(pictures?|photos?|images?|people|persons|places|events|works|products)\b/.test(text);
}
