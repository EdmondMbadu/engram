import {
  DEFAULT_STACK_AUDIO_TRACK_ID,
  DEFAULT_STACK_AUDIO_VOLUME,
  MAX_STACK_AUDIO_VOLUME,
  MIN_STACK_AUDIO_VOLUME,
  NO_STACK_AUDIO_TRACK_ID,
  STACK_AUDIO_TRACKS,
  normalizeStackAudioTrackId,
  normalizeStackAudioVolume,
  stackAudioTrackById,
} from './stack-audio';

describe('Stack background music catalog', () => {
  it('contains ten uniquely identified cloud tracks', () => {
    expect(STACK_AUDIO_TRACKS.length).toBe(10);
    expect(new Set(STACK_AUDIO_TRACKS.map((track) => track.id)).size).toBe(10);
    expect(STACK_AUDIO_TRACKS.every((track) =>
      track.storagePath.startsWith('app-assets/stack-audio/')
      && track.storagePath.endsWith('.mp3'),
    )).toBeTrue();
  });

  it('uses Golden Hour Square as the visible default', () => {
    expect(stackAudioTrackById(DEFAULT_STACK_AUDIO_TRACK_ID)?.title).toBe('Golden Hour Square');
    expect(normalizeStackAudioTrackId('unknown')).toBe(DEFAULT_STACK_AUDIO_TRACK_ID);
  });

  it('keeps the explicit no-music choice', () => {
    expect(normalizeStackAudioTrackId(NO_STACK_AUDIO_TRACK_ID)).toBe(NO_STACK_AUDIO_TRACK_ID);
  });

  it('keeps the background mix in a safe range', () => {
    expect(normalizeStackAudioVolume(undefined)).toBe(DEFAULT_STACK_AUDIO_VOLUME);
    expect(normalizeStackAudioVolume(0)).toBe(MIN_STACK_AUDIO_VOLUME);
    expect(normalizeStackAudioVolume(1)).toBe(MAX_STACK_AUDIO_VOLUME);
  });
});
