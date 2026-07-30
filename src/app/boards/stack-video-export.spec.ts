import {
  combineStackVideoMediaStream,
  preferredRecorderMimeType,
  stackVideoCardImageCandidates,
} from './stack-video-export';
import { reorderRelativeToTarget } from './reorder';

describe('Stack video card images', () => {
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
