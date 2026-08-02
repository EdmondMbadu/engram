export function appendBoardCards<T>(existingCards: readonly T[], newCards: readonly T[]): T[] {
  return [...existingCards, ...newCards];
}
