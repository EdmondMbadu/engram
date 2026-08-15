export type BoardCreationOrderItem = {
  id: string;
  createdAt: string;
};

function createdTime(value: string): number {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

/** Newest-created first, with a stable document-id tie-breaker for pagination. */
export function compareBoardsByCreatedDate(
  left: BoardCreationOrderItem,
  right: BoardCreationOrderItem,
): number {
  return createdTime(right.createdAt) - createdTime(left.createdAt)
    // Firestore implicitly applies the final descending direction to document id.
    // Matching that order keeps equal-timestamp boards stable between pages.
    || right.id.localeCompare(left.id);
}
