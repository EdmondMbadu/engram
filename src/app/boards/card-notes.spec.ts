import { cardNotesForPersistence, cardNotesSummary } from './card-notes';

describe('card notes', () => {
  it('preserves notes beyond the former 260-character editor limit', () => {
    const jimNotes = "The Solution Framework is the secret sauce. It's a structured journey where we identify a problem, research it from multiple perspectives,  and then use design science to uncover powerful new preferred states.. We look at what the world needs and what we have,";
    const chapter = `  ${Array.from({ length: 500 }, (_, index) => `Paragraph ${index + 1}\ncontinues here.`).join('\n\n')}  `;

    expect(jimNotes.length).toBe(260);
    expect(cardNotesForPersistence(jimNotes)).toBe(jimNotes);
    expect(cardNotesForPersistence(chapter)).toBe(chapter.trim());
    expect(cardNotesForPersistence(chapter).length).toBeGreaterThan(10_000);
  });

  it('keeps preview summaries compact without shortening the full notes', () => {
    const notes = `First paragraph.\n\n${'Long-form chapter text. '.repeat(100)}`;

    expect(cardNotesForPersistence(notes)).toBe(notes.trim());
    expect(cardNotesSummary(notes).length).toBeLessThanOrEqual(160);
    expect(cardNotesSummary(notes)).not.toContain('\n');
  });
});
