export const DEFAULT_INCREMENTAL_PAGE_SIZE = 10;

export function incrementalSlice<T>(items: readonly T[], visibleLimit: number): T[] {
  return items.slice(0, Math.max(0, Math.floor(visibleLimit)));
}

export function nextIncrementalLimit(
  currentLimit: number,
  pageSize = DEFAULT_INCREMENTAL_PAGE_SIZE,
): number {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  return Math.max(0, Math.floor(currentLimit)) + safePageSize;
}

export function incrementalViewportNearEnd(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold = 700,
): boolean {
  return scrollHeight - scrollTop - clientHeight < Math.max(0, threshold);
}
