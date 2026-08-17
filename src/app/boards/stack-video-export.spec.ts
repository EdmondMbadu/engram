import {
  STACK_TRAILER_RENDER_VERSION,
  STACK_VIDEO_BRAND_URL,
  combineStackVideoMediaStream,
  generateStackTrailer,
  generateStackVideo,
  normalizeStackVideoClosingScreen,
  preferredRecorderMimeType,
  publishedStackVideoStoragePath,
  stackVideoCardVisibleText,
  stackVideoCardImageCandidates,
  stackVideoClosingDurationMs,
  stackVideoFrameAtElapsed,
  stackVideoNarrationFrameDurationMs,
  stackVideoNarrationIsComplete,
  stackVideoRenderIsCurrent,
  stackTrailerCaptionChunks,
  stackTrailerPlan,
} from './stack-video-export';
import { reorderRelativeToTarget } from './reorder';

describe('Stack video card images', () => {
  it('uses permanent LivingWiki branding on every final screen', () => {
    expect(STACK_VIDEO_BRAND_URL).toBe('LivingWiki.com');
  });

  it('marks the corrected closing-card layout as a new trailer render', () => {
    expect(STACK_TRAILER_RENDER_VERSION).toBe('board-trailer-v2');
  });

  it('publishes each video do-over at a distinct cache-safe URL', () => {
    const first = publishedStackVideoStoragePath('user-1', 'board-1', 'full', 'mp4', 'render-1');
    const second = publishedStackVideoStoragePath('user-1', 'board-1', 'full', 'mp4', 'render-2');

    expect(first).toBe('users/user-1/boards/board-1/social/full/render-1.mp4');
    expect(second).toBe('users/user-1/boards/board-1/social/full/render-2.mp4');
    expect(second).not.toBe(first);
  });

  it('keeps Board Trailers inside the 15–30 second promise', () => {
    expect(stackTrailerPlan(1).durationMs).toBe(15_000);
    expect(stackTrailerPlan(10).durationMs).toBe(18_850);
    expect(stackTrailerPlan(30).durationMs).toBe(30_000);
  });

  it('shows every trailer card while preserving intro, montage, and closing beats', () => {
    const plan = stackTrailerPlan(10);
    expect(plan.frameDurationsMs.length).toBe(13);
    expect(plan.frameDurationsMs.reduce((sum, value) => sum + value, 0)).toBe(plan.durationMs);
    expect(plan.cardDurationMs).toBeGreaterThanOrEqual(1_200);
  });

  it('adapts a trailer to a voiceover without exceeding 30 seconds', () => {
    expect(stackTrailerPlan(8, 23).durationMs).toBeGreaterThanOrEqual(24_950);
    expect(stackTrailerPlan(8, 40).durationMs).toBe(30_000);
  });

  it('creates short silent-autoplay caption phrases without dropping words', () => {
    const script = 'Philadelphia rewards the curious. Ten cards move from iconic flavors to the corners locals keep returning to.';
    const chunks = stackTrailerCaptionChunks(script, 7);
    expect(chunks.every((chunk) => chunk.split(/\s+/).length <= 7)).toBeTrue();
    expect(chunks.join(' ')).toBe(script);
  });

  it('records a complete browser-native Board Trailer file', async () => {
    const result = await generateStackTrailer({
      title: 'A Board Worth Opening',
      subtitle: 'A compact trailer renderer check.',
      ownerName: 'LivingWiki',
      coverImageUrl: '',
      liveUrl: 'https://www.livingwiki.com/boards/trailer-test',
      qrImageUrl: '',
      showCardNumbers: true,
      cards: [{
        title: 'The first card',
        subtitle: 'One visual beat.',
        notes: '',
        imageUrl: '',
        imageUrls: [],
      }],
    }, 'vertical');

    expect(result.durationSeconds).toBe(15);
    expect(result.blob.size).toBeGreaterThan(1_000);
    expect(['mp4', 'webm']).toContain(result.extension);
  }, 30_000);

  it('requires legacy videos to be regenerated after a renderer change', () => {
    expect(stackVideoRenderIsCurrent(undefined)).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v1')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v2')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v3')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v4')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v5')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v6')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v7')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v8')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v9')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v10')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v11')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v12')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v13')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v14')).toBeTrue();
  });

  it('normalizes safe final-screen defaults and duration bounds', () => {
    expect(normalizeStackVideoClosingScreen(null, 'A Board')).toEqual({
      headline: 'Keep exploring',
      message: 'A Board',
      showQrCode: true,
      image: 'cover',
      customImageUrl: '',
      durationSeconds: 3,
    });
    expect(normalizeStackVideoClosingScreen({
      headline: '  See you there  ',
      message: '  Open the full guide  ',
      showQrCode: false,
      image: 'final-card',
      durationSeconds: 8.2,
    })).toEqual({
      headline: 'See you there',
      message: 'Open the full guide',
      showQrCode: false,
      image: 'final-card',
      customImageUrl: '',
      durationSeconds: 6,
    });
    expect(normalizeStackVideoClosingScreen({
      image: 'custom',
      customImageUrl: '  https://example.com/custom.jpg  ',
    })).toEqual(jasmine.objectContaining({
      image: 'custom',
      customImageUrl: 'https://example.com/custom.jpg',
    }));
    expect(normalizeStackVideoClosingScreen({ image: 'custom', customImageUrl: '' }).image).toBe('cover');
    expect(stackVideoClosingDurationMs({ durationSeconds: 2.24 })).toBe(2_000);
    expect(stackVideoClosingDurationMs({ durationSeconds: 4.26 })).toBe(4_500);
  });

  it('shows only the title on full-video card frames', () => {
    expect(stackVideoCardVisibleText({
      title: 'Cumberland Island, Georgia',
      subtitle: 'A subtitle that should not be drawn',
      notes: 'Narration that should be heard but not drawn',
      rank: 1,
      tourSequence: 2,
    })).toEqual(['Cumberland Island, Georgia']);
  });

  it('keeps gallery images available when the primary image is empty after reordering', () => {
    expect(stackVideoCardImageCandidates({
      imageUrl: '',
      imageUrls: ['https://images.example/second.jpg', 'https://images.example/third.jpg'],
    })).toEqual([
      'https://images.example/second.jpg',
      'https://images.example/third.jpg',
    ]);
  });

  it('tries the primary image first and removes duplicate candidates', () => {
    expect(stackVideoCardImageCandidates({
      imageUrl: 'https://images.example/primary.jpg',
      imageUrls: [
        'https://images.example/primary.jpg',
        ' https://images.example/fallback.jpg ',
      ],
    })).toEqual([
      'https://images.example/primary.jpg',
      'https://images.example/fallback.jpg',
    ]);
  });

  it('keeps each card image attached after the cards are reordered', () => {
    const cards = [
      { id: 'A', imageUrl: '', imageUrls: ['https://images.example/a.jpg'] },
      { id: 'B', imageUrl: '', imageUrls: ['https://images.example/b.jpg'] },
    ];
    const reordered = reorderRelativeToTarget(cards, 'B', 'A', 'before', (card) => card.id);

    expect(reordered.map((card) => [
      card.id,
      stackVideoCardImageCandidates(card)[0],
    ])).toEqual([
      ['B', 'https://images.example/b.jpg'],
      ['A', 'https://images.example/a.jpg'],
    ]);
  });

  it('prefers a recorder format with an explicit audio codec when music is selected', () => {
    spyOn(MediaRecorder, 'isTypeSupported').and.callFake((mimeType) =>
      mimeType === 'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    );

    expect(preferredRecorderMimeType(true))
      .toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
  });

  it('keeps each actor visible until its complete narration finishes', () => {
    expect(stackVideoNarrationFrameDurationMs(0)).toBe(2200);
    expect(stackVideoNarrationFrameDurationMs(3.25)).toBe(3700);
    expect(stackVideoNarrationFrameDurationMs(30)).toBe(30_450);
  });

  it('requires narration audio for every selected card', () => {
    expect(stackVideoNarrationIsComplete(3, {
      cardAudioUrls: ['https://audio.example/1.mp3', 'https://audio.example/2.mp3', 'https://audio.example/3.mp3'],
      volume: 1,
    })).toBeTrue();
    expect(stackVideoNarrationIsComplete(3, {
      cardAudioUrls: ['https://audio.example/1.mp3', null, 'https://audio.example/3.mp3'],
      volume: 1,
    })).toBeFalse();
    expect(stackVideoNarrationIsComplete(3, {
      cardAudioUrls: ['https://audio.example/1.mp3', 'https://audio.example/2.mp3'],
      volume: 1,
    })).toBeFalse();
  });

  it('refuses to render a full-narration video with a missing card clip', async () => {
    const cards = ['One', 'Two'].map((title) => ({
      title,
      subtitle: '',
      notes: `${title} narration.`,
      imageUrl: '',
      imageUrls: [],
    }));
    await expectAsync(generateStackVideo({
      title: 'Complete narration',
      subtitle: '',
      ownerName: 'LivingWiki',
      coverImageUrl: '',
      liveUrl: 'https://www.livingwiki.com/boards/test',
      qrImageUrl: '',
      showCardNumbers: true,
      cards,
    }, 'square', undefined, null, {
      cardAudioUrls: ['https://audio.example/one.mp3', null],
      volume: 1,
    })).toBeRejectedWithError(/Full narration is incomplete/);
  });

  it('uses one master timeline so a delayed render advances to the correct card', () => {
    expect(stackVideoFrameAtElapsed([2200, 3000, 4000], 0)).toEqual({ index: 0, progress: 0 });
    expect(stackVideoFrameAtElapsed([2200, 3000, 4000], 3700)).toEqual({ index: 1, progress: 0.5 });
    expect(stackVideoFrameAtElapsed([2200, 3000, 4000], 7200)).toEqual({ index: 2, progress: 0.5 });
    expect(stackVideoFrameAtElapsed([2200, 3000, 4000], 20_000)).toEqual({ index: 2, progress: 1 });
  });

  it('adds the decoded background music track to the recorded canvas stream', async () => {
    const canvas = document.createElement('canvas');
    const canvasStream = canvas.captureStream(1);
    const audioContext = new AudioContext();
    const audioDestination = audioContext.createMediaStreamDestination();

    try {
      const combined = combineStackVideoMediaStream(
        canvasStream,
        audioDestination.stream.getAudioTracks(),
      );

      expect(combined.getVideoTracks().length).toBe(1);
      expect(combined.getAudioTracks().length).toBe(1);
      combined.getTracks().forEach((track) => track.stop());
    } finally {
      canvasStream.getTracks().forEach((track) => track.stop());
      await audioContext.close();
    }
  });
});
