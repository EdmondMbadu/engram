import { shouldCanonicalizeBoardsRootRoute } from './board-root-route';

describe('boards root route', () => {
  const context = {
    isBrowser: true,
    isFriendsPage: false,
    isSongsPage: false,
    isTripsPage: false,
    boardId: null,
    ownerKey: null,
    userId: 'user-1',
    createQuery: null,
  };

  it('canonicalizes a signed-in board gallery route', () => {
    expect(shouldCanonicalizeBoardsRootRoute(context)).toBeTrue();
  });

  it('keeps the nearby-gems launch route stable while its modal is open', () => {
    expect(shouldCanonicalizeBoardsRootRoute({
      ...context,
      createQuery: 'gems',
    })).toBeFalse();
  });
});
