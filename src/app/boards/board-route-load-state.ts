export type BoardRouteLoadState = {
  requestId: number;
  routeKey: string | null;
  complete: boolean;
};

type BoardRouteCandidate = {
  id: string;
  isSummary?: boolean;
};

export function findResolvedBoardRoute<T extends BoardRouteCandidate>(
  boards: readonly T[],
  selectedId: string | null,
): T | null {
  if (!selectedId) return null;
  const board = boards.find((candidate) => candidate.id === selectedId) ?? null;
  return board?.isSummary ? null : board;
}

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
