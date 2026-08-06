const CARD_SEQUENCE_PREFIX = /^(?:(?:tour\s+stop|chapter|part|card|item|entry|rank|book|episode|stop|number|no\.)\s*#?\s*\d{1,3}|#\s*\d{1,3}|\d{1,3}\s*[.):\-–—])\s*(?:[.):\-–—]\s*)?/i;

export function cardPresentationSubtitle(value: string, showCardNumbers: boolean): string {
  const subtitle = value.trim();
  if (showCardNumbers || !subtitle) {
    return subtitle;
  }
  return subtitle.replace(CARD_SEQUENCE_PREFIX, '').trim();
}
