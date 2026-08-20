export type BoardsRootCanonicalizationContext = {
  isBrowser: boolean;
  isFriendsPage: boolean;
  isSongsPage: boolean;
  isTripsPage: boolean;
  boardId: string | null;
  ownerKey: string | null;
  userId: string | null;
  createQuery: string | null;
};

export function shouldCanonicalizeBoardsRootRoute(
  context: BoardsRootCanonicalizationContext,
): boolean {
  return context.isBrowser
    && !context.isFriendsPage
    && !context.isSongsPage
    && !context.isTripsPage
    && !context.boardId
    && context.ownerKey === null
    && !!context.userId
    && context.createQuery !== 'gems';
}
