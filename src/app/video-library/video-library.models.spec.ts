import {
  boardVideoLibraryId,
  videoLibraryItemFromRecord,
  videoLibraryItemIsCurrent,
} from './video-library.models';

describe('video library models', () => {
  it('uses one stable library id for each board', () => {
    expect(boardVideoLibraryId('board-123')).toBe('board_board-123');
    expect(boardVideoLibraryId('board/123')).toBe('board_board123');
  });

  it('normalizes a stored record', () => {
    const item = videoLibraryItemFromRecord('board_board-123', {
      owner_user_id: 'user-1',
      source_id: 'board-123',
      source_title: 'Odysseus',
      video_url: 'https://example.com/video.mp4',
      ratio: 'square',
      duration_seconds: 12.5,
      narration_enabled: false,
      generated_at_iso: '2026-08-06T00:00:00.000Z',
    });

    expect(item?.sourceRoute).toBe('/boards/board-123');
    expect(item?.ratio).toBe('square');
    expect(item?.durationSeconds).toBe(12.5);
    expect(item?.narrationEnabled).toBeFalse();
  });

  it('rejects records without a usable video', () => {
    expect(videoLibraryItemFromRecord('missing', {
      source_id: 'board-123',
      source_title: 'Odysseus',
    })).toBeNull();
  });

  it('detects when a source changed after rendering', () => {
    expect(videoLibraryItemIsCurrent({
      sourceAvailable: true,
      sourceUpdatedAt: '2026-08-06T01:00:00.000Z',
      currentSourceUpdatedAt: '2026-08-06T02:00:00.000Z',
    })).toBeFalse();
    expect(videoLibraryItemIsCurrent({
      sourceAvailable: true,
      sourceUpdatedAt: '2026-08-06T03:00:00.000Z',
      currentSourceUpdatedAt: '2026-08-06T02:00:00.000Z',
    })).toBeTrue();
  });
});
