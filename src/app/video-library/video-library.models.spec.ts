import {
  boardVideoLibraryId,
  canonicalPublicVideoUrl,
  videoLibraryItemFromRecord,
  videoLibraryItemIsCurrent,
} from './video-library.models';

describe('video library models', () => {
  it('uses one stable library id for each board', () => {
    expect(boardVideoLibraryId('board-123')).toBe('board_board-123');
    expect(boardVideoLibraryId('board/123')).toBe('board_board123');
    expect(boardVideoLibraryId('board-123', 'trailer')).toBe('board_board-123_trailer');
  });

  it('repairs local share links to the canonical public host', () => {
    expect(canonicalPublicVideoUrl('http://localhost:4200/share/board/9742b50a-112f-4e21-afb0-d468555bcf7f/video?v=latest'))
      .toBe('https://www.livingwiki.com/share/board/9742b50a-112f-4e21-afb0-d468555bcf7f/video?v=latest');
    expect(canonicalPublicVideoUrl('https://example.com/not-a-board-video')).toBe('https://example.com/not-a-board-video');
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
    expect(item?.videoKind).toBe('full');
  });

  it('keeps a Board Trailer separate from the full board video', () => {
    const item = videoLibraryItemFromRecord('board_board-123_trailer', {
      owner_user_id: 'user-1',
      source_id: 'board-123',
      source_title: 'Odysseus',
      video_kind: 'trailer',
      video_url: 'https://example.com/trailer.mp4',
    });
    expect(item?.videoKind).toBe('trailer');
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
