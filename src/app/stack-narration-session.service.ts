import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StackNarrationSessionService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  audio: HTMLAudioElement | null = null;
  private unlocked = false;

  isUnlocked(): boolean {
    return this.unlocked && !!this.audio;
  }

  async unlock(): Promise<boolean> {
    if (!this.isBrowser) return false;

    const audio = this.audio ?? new Audio();
    this.audio = audio;
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
    audio.onloadedmetadata = null;
    audio.volume = 0;
    audio.preload = 'auto';
    const silenceUrl = this.silenceUrl();
    audio.src = silenceUrl;

    try {
      await audio.play();
      if (this.audio === audio && audio.src === silenceUrl) {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
        this.unlocked = true;
      }
    } catch {
      if (this.audio === audio && audio.src === silenceUrl) {
        this.audio = null;
        this.unlocked = false;
      }
    } finally {
      URL.revokeObjectURL(silenceUrl);
    }

    return this.isUnlocked();
  }

  dispose(): void {
    const audio = this.audio;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    this.audio = null;
    this.unlocked = false;
  }

  private silenceUrl(): string {
    const sampleRate = 8_000;
    const sampleCount = 800;
    const wav = new Uint8Array(44 + sampleCount);
    const view = new DataView(wav.buffer);
    const writeAscii = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        wav[offset + index] = value.charCodeAt(index);
      }
    };
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + sampleCount, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    writeAscii(36, 'data');
    view.setUint32(40, sampleCount, true);
    wav.fill(128, 44);
    return URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  }
}
