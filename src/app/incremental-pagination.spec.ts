import {
  DEFAULT_INCREMENTAL_PAGE_SIZE,
  incrementalSlice,
  incrementalViewportNearEnd,
  nextIncrementalLimit,
} from './incremental-pagination';

describe('incremental pagination', () => {
  it('shows the first 10 items by default', () => {
    const items = Array.from({ length: 24 }, (_item, index) => index + 1);

    expect(incrementalSlice(items, DEFAULT_INCREMENTAL_PAGE_SIZE)).toEqual(items.slice(0, 10));
  });

  it('adds one 10-item page at a time', () => {
    expect(nextIncrementalLimit(10)).toBe(20);
    expect(nextIncrementalLimit(20)).toBe(30);
  });

  it('detects when the viewport is close enough to preload the next page', () => {
    expect(incrementalViewportNearEnd(3_000, 1_700, 700)).toBeTrue();
    expect(incrementalViewportNearEnd(3_000, 1_000, 700)).toBeFalse();
  });

  it('handles invalid limits without returning extra items', () => {
    expect(incrementalSlice([1, 2, 3], -5)).toEqual([]);
    expect(nextIncrementalLimit(-5)).toBe(10);
  });
});
