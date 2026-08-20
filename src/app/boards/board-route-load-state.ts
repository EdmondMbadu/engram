export type BoardRouteLoadState = {
  requestId: number;
  routeKey: string | null;
  complete: boolean;
};

export function beginBoardRouteLoad(
  requestId: number,
  routeKey: string | null,
): BoardRouteLoadState {
  return {
    requestId,
    routeKey,
    complete: routeKey === null,
  };
}

export function completeBoardRouteLoad(
  state: BoardRouteLoadState,
  requestId: number,
): BoardRouteLoadState {
  if (state.requestId !== requestId || state.complete) {
    return state;
  }
  return { ...state, complete: true };
}
