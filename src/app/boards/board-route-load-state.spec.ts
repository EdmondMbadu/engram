import { beginBoardRouteLoad, completeBoardRouteLoad } from './board-route-load-state';

describe('board route load state', () => {
  it('keeps a board route pending until its own lookup completes', () => {
    const loading = beginBoardRouteLoad(4, 'watkins-glen');

    expect(loading.complete).toBeFalse();
    expect(completeBoardRouteLoad(loading, 4)).toEqual({
      requestId: 4,
      routeKey: 'watkins-glen',
      complete: true,
    });
  });

  it('ignores completion from an older request, including the same route key', () => {
    const current = beginBoardRouteLoad(8, 'watkins-glen');

    expect(completeBoardRouteLoad(current, 7)).toBe(current);
    expect(current.complete).toBeFalse();
  });

  it('marks the board gallery route complete immediately', () => {
    expect(beginBoardRouteLoad(2, null).complete).toBeTrue();
  });
});
