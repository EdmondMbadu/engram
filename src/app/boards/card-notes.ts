const CARD_NOTES_SUMMARY_LENGTH = 160;

/**
 * Prepare user-authored card notes for persistence without imposing an
 * application-level character limit. Whitespace inside the notes is preserved
 * so paragraphs and chapter formatting survive a save/load round trip.
 */
export function cardNotesForPersistence(value: string): string {
  return value.trim();
}

/** Keep compact card metadata small even when the full notes contain a chapter. */
export function cardNotesSummary(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, CARD_NOTES_SUMMARY_LENGTH);
}
