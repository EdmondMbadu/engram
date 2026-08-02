import {
  combineStackVideoMediaStream,
  preferredRecorderMimeType,
  stackVideoCardKicker,
  stackVideoCardImageCandidates,
  stackVideoNarrationFrameDurationMs,
  stackVideoRenderIsCurrent,
} from './stack-video-export';
import { reorderRelativeToTarget } from './reorder';

describe('Stack video card images', () => {
  it('requires legacy videos to be regenerated after a renderer change', () => {
    expect(stackVideoRenderIsCurrent(undefined)).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v1')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v2')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v3')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v4')).toBeFalse();
    expect(stackVideoRenderIsCurrent('stack-video-v5')).toBeTrue();
  });

  it('uses only a rank label for ranked cards', () => {
    expect(stackVideoCardKicker({ rank: 3 }, 2, 10)).toBe('RANK #3');
  });

  it('uses only the tour stop when a card is part of a tour', () => {
    expect(stackVideoCardKicker({ rank: 3, tourSequence: 2 }, 1, 5)).toBe('TOUR STOP 2');
  });

  it('does not repeat card position when no rank or tour stop exists', () => {
    expect(stackVideoCardKicker({}, 0, 4)).toBe('');
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

  it('keeps each narrated card visible until its voice clip finishes', () => {
    expect(stackVideoNarrationFrameDurationMs(0)).toBe(1900);
    expect(stackVideoNarrationFrameDurationMs(3.25)).toBe(3750);
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
