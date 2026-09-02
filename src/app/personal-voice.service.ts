import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { AuthService } from './auth.service';
import { getFirebaseFunctions, getFirebaseStorage } from './firebase.client';
import { personalStackNarratorVoiceId } from './boards/stack-voice';

export interface PersonalVoice {
  id: string;
  narratorVoiceId: string;
  name: string;
  status: 'ready';
  createdAt: string;
  updatedAt: string;
  sampleDurationSeconds: number | null;
  voiceRevision: number;
}

export interface PersonalVoiceLibrary {
  libraryVersion: number;
  voice: PersonalVoice | null;
  voices: PersonalVoice[];
  eligible: boolean;
  paid: boolean;
  admin: boolean;
  voiceLimit: number | null;
  voiceCount: number;
  canAddVoice: boolean;
  defaultVoiceId: string | null;
}

type PersonalVoiceLibraryWireResponse = Partial<PersonalVoiceLibrary> & {
  voice?: PersonalVoice | null;
  voices?: PersonalVoice[];
};

export interface CreatePersonalVoiceInput {
  file: File;
  durationSeconds: number;
  name: string;
  replacingVoiceId?: string | null;
}

export function normalizePersonalVoiceLibrary(
  response: PersonalVoiceLibraryWireResponse,
): PersonalVoiceLibrary {
  const libraryVersion = Math.max(1, Math.trunc(response.libraryVersion ?? 1));
  const voices = (response.voices ?? (response.voice ? [response.voice] : []))
    .filter((voice): voice is PersonalVoice => !!voice)
    .map((voice, index) => {
      const id = voice.id || (libraryVersion < 2 && index === 0 ? 'legacy' : `voice-${index + 1}`);
      return {
        ...voice,
        id,
        narratorVoiceId: voice.narratorVoiceId
          || (libraryVersion < 2 ? 'personal-voice' : personalStackNarratorVoiceId(id)),
        sampleDurationSeconds: typeof voice.sampleDurationSeconds === 'number'
          ? voice.sampleDurationSeconds
          : null,
        voiceRevision: Math.max(1, Math.trunc(voice.voiceRevision ?? 1)),
      };
    });
  const admin = response.admin === true;
  const fallbackLimit = response.paid ? 5 : 1;
  const voiceLimit = admin
    ? null
    : Math.max(1, typeof response.voiceLimit === 'number' ? response.voiceLimit : fallbackLimit);
  const defaultVoiceId = response.defaultVoiceId && voices.some((voice) => voice.id === response.defaultVoiceId)
    ? response.defaultVoiceId
    : voices[0]?.id ?? null;
  const responseVoiceId = response.voice?.id;
  return {
    libraryVersion,
    voices,
    voice: voices.find((voice) => voice.id === responseVoiceId)
      ?? voices.find((voice) => voice.id === defaultVoiceId)
      ?? voices[0]
      ?? null,
    eligible: response.eligible !== false,
    paid: admin || response.paid === true,
    admin,
    voiceLimit,
    voiceCount: voices.length,
    canAddVoice: libraryVersion >= 2
      && (admin || (response.canAddVoice ?? (voiceLimit !== null && voices.length < voiceLimit))),
    defaultVoiceId,
  };
}

@Injectable({ providedIn: 'root' })
export class PersonalVoiceService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;
  private readonly storage = this.isBrowser ? getFirebaseStorage() : null;

  async loadLibrary(): Promise<PersonalVoiceLibrary> {
    const callable = httpsCallable<Record<string, never>, PersonalVoiceLibraryWireResponse>(
      this.requireFunctions(),
      'getPersonalNarratorVoice',
    );
    const { data } = await callable({});
    return normalizePersonalVoiceLibrary(data);
  }

  async createVoice(input: CreatePersonalVoiceInput): Promise<PersonalVoiceLibrary> {
    const uid = this.authService.uid();
    if (!uid) throw new Error('Sign in to create a personal voice.');
    const replacingVoiceId = input.replacingVoiceId?.trim() || null;
    const safeName = input.file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-90)
      || 'voice.webm';
    const path = `users/${uid}/voice-samples/${replacingVoiceId || 'new'}/${Date.now()}-${safeName}`;
    await uploadBytes(storageRef(this.requireStorage(), path), input.file, {
      contentType: input.file.type || 'audio/webm',
      customMetadata: { durationSeconds: String(Math.round(input.durationSeconds)) },
    });
    const callable = httpsCallable<{
      name: string;
      sampleStoragePath: string;
      sampleDurationSeconds: number;
      ownVoiceConfirmed: true;
      consentConfirmed: true;
      operation: 'create' | 'replace';
      voiceId?: string;
    }, PersonalVoiceLibraryWireResponse>(
      this.requireFunctions(),
      'createPersonalNarratorVoice',
      { timeout: 120_000 },
    );
    const { data } = await callable({
      name: input.name.replace(/\s+/g, ' ').trim().slice(0, 48) || 'My voice',
      sampleStoragePath: path,
      sampleDurationSeconds: input.durationSeconds,
      ownVoiceConfirmed: true,
      consentConfirmed: true,
      operation: replacingVoiceId ? 'replace' : 'create',
      ...(replacingVoiceId ? { voiceId: replacingVoiceId } : {}),
    });
    return normalizePersonalVoiceLibrary(data);
  }

  async deleteVoice(voiceId: string): Promise<PersonalVoiceLibrary> {
    const callable = httpsCallable<
      { voiceId: string },
      PersonalVoiceLibraryWireResponse & { deleted: boolean }
    >(this.requireFunctions(), 'deletePersonalNarratorVoice', { timeout: 120_000 });
    const { data } = await callable({ voiceId });
    return normalizePersonalVoiceLibrary(data);
  }

  async renameVoice(voiceId: string, name: string): Promise<PersonalVoiceLibrary> {
    const callable = httpsCallable<
      { voiceId: string; name: string },
      PersonalVoiceLibraryWireResponse
    >(this.requireFunctions(), 'renamePersonalNarratorVoice');
    const { data } = await callable({ voiceId, name });
    return normalizePersonalVoiceLibrary(data);
  }

  private requireFunctions() {
    if (!this.functions) throw new Error('Personal voices are unavailable in this environment.');
    return this.functions;
  }

  private requireStorage() {
    if (!this.storage) throw new Error('Voice sample uploads are unavailable in this environment.');
    return this.storage;
  }
}
