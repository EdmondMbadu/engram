import { normalizePersonalVoiceLibrary } from './personal-voice.service';

describe('normalizePersonalVoiceLibrary', () => {
  it('preserves a legacy personal voice and its one-voice entitlement', () => {
    const library = normalizePersonalVoiceLibrary({
      eligible: true,
      paid: false,
      voice: {
        id: '',
        narratorVoiceId: '',
        name: 'My voice',
        status: 'ready',
        createdAt: '',
        updatedAt: '',
        sampleDurationSeconds: 60,
        voiceRevision: 0,
      },
    });

    expect(library.libraryVersion).toBe(1);
    expect(library.voices[0].id).toBe('legacy');
    expect(library.voices[0].narratorVoiceId).toBe('personal-voice');
    expect(library.voiceLimit).toBe(1);
    expect(library.canAddVoice).toBeFalse();
  });

  it('uses the server entitlement for paid and admin libraries', () => {
    const paid = normalizePersonalVoiceLibrary({
      libraryVersion: 2,
      eligible: true,
      paid: true,
      voiceLimit: 5,
      canAddVoice: true,
      voices: [],
    });
    const admin = normalizePersonalVoiceLibrary({
      libraryVersion: 2,
      eligible: true,
      paid: true,
      admin: true,
      voiceLimit: null,
      canAddVoice: true,
      voices: [],
    });

    expect(paid.voiceLimit).toBe(5);
    expect(paid.canAddVoice).toBeTrue();
    expect(admin.voiceLimit).toBeNull();
    expect(admin.canAddVoice).toBeTrue();
  });

  it('keeps the newly returned voice selected when it is not the library default', () => {
    const voice = (id: string) => ({
      id,
      narratorVoiceId: `personal-voice:${id}`,
      name: id,
      status: 'ready' as const,
      createdAt: '',
      updatedAt: '',
      sampleDurationSeconds: 60,
      voiceRevision: 1,
    });
    const library = normalizePersonalVoiceLibrary({
      libraryVersion: 2,
      eligible: true,
      paid: true,
      defaultVoiceId: 'first',
      voice: voice('second'),
      voices: [voice('first'), voice('second')],
    });

    expect(library.defaultVoiceId).toBe('first');
    expect(library.voice?.id).toBe('second');
  });
});
