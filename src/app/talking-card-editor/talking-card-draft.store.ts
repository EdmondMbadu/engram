import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { normalizeTalkingCardActions, type TalkingCardAction } from '../boards/talking-card';

export type TalkingCardDraftMode = 'existing' | 'new';
export type TalkingCardDraftVoiceChoice = 'default' | 'catalog' | 'personal' | 'saved';

export interface TalkingCardDraftRecord {
  key: string;
  version: 1;
  boardId: string;
  cardId?: string;
  mode: TalkingCardDraftMode;
  selectedAtlasId: string;
  createdAtlasId: string;
  name: string;
  role: string;
  personaPrompt: string;
  additionalGuidance?: string;
  openingMessage: string;
  ctaLabel: string;
  placement: 'start' | 'end' | 'keep';
  actions?: TalkingCardAction[];
  catalogVoiceId: string;
  personalVoiceId?: string;
  voiceChoice: TalkingCardDraftVoiceChoice;
  publishAvatar: boolean;
  imageFile: File | null;
  uploadedImageUrl: string;
  documentFiles: File[];
  updatedAt: string;
}

const DATABASE_NAME = 'livingwiki-talking-card-drafts';
const DATABASE_VERSION = 1;
const STORE_NAME = 'drafts';
const FALLBACK_STORAGE_PREFIX = 'livingwiki:talking-card-draft:';

type TextOnlyDraft = Omit<TalkingCardDraftRecord, 'imageFile' | 'documentFiles'>;

@Injectable({ providedIn: 'root' })
export class TalkingCardDraftStore {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly savedAssetFingerprints = new Map<string, string>();

  async load(key: string): Promise<TalkingCardDraftRecord | null> {
    if (!this.isBrowser || !key) return null;
    const fallback = this.loadFallback(key);
    try {
      const database = await this.openDatabase();
      const value = await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Talking Card draft could not be read.'));
      });
      const normalized = this.normalizeRecord(value, key);
      if (normalized) {
        this.savedAssetFingerprints.set(key, this.assetFingerprint(normalized));
        return fallback ? {
          ...normalized,
          ...fallback,
          imageFile: normalized.imageFile,
          documentFiles: normalized.documentFiles,
        } : normalized;
      }
    } catch {
      // Browsers can block IndexedDB in restricted modes. The text-only fallback still restores the form.
    }
    return fallback;
  }

  async save(record: TalkingCardDraftRecord): Promise<void> {
    if (!this.isBrowser || !record.key) return;
    this.saveFallback(record);
    const assetFingerprint = this.assetFingerprint(record);
    if (this.savedAssetFingerprints.get(record.key) === assetFingerprint) return;
    try {
      const database = await this.openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('Talking Card draft could not be saved.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Talking Card draft save was interrupted.'));
        transaction.objectStore(STORE_NAME).put(record);
      });
      this.savedAssetFingerprints.set(record.key, assetFingerprint);
    } catch {
      // The text-only localStorage copy was already written above.
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.isBrowser || !key) return;
    this.savedAssetFingerprints.delete(key);
    try {
      window.localStorage.removeItem(this.fallbackKey(key));
    } catch {
      // Ignore unavailable local storage.
    }
    try {
      const database = await this.openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('Talking Card draft could not be removed.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Talking Card draft removal was interrupted.'));
        transaction.objectStore(STORE_NAME).delete(key);
      });
    } catch {
      // A missing IndexedDB copy does not make draft deletion fail.
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is unavailable.'));
    }
    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.databasePromise = null;
        reject(request.error ?? new Error('Talking Card draft storage is unavailable.'));
      };
      request.onblocked = () => {
        this.databasePromise = null;
        reject(new Error('Talking Card draft storage is blocked.'));
      };
    });
    return this.databasePromise;
  }

  private saveFallback(record: TalkingCardDraftRecord): void {
    const { imageFile: _imageFile, documentFiles: _documentFiles, ...textOnly } = record;
    try {
      window.localStorage.setItem(this.fallbackKey(record.key), JSON.stringify(textOnly));
    } catch {
      // Draft persistence is best-effort when the browser denies local storage.
    }
  }

  private loadFallback(key: string): TalkingCardDraftRecord | null {
    try {
      const raw = window.localStorage.getItem(this.fallbackKey(key));
      if (!raw) return null;
      return this.normalizeRecord(JSON.parse(raw) as TextOnlyDraft, key);
    } catch {
      return null;
    }
  }

  private normalizeRecord(value: unknown, key: string): TalkingCardDraftRecord | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<TalkingCardDraftRecord>;
    if (record.version !== 1 || record.key !== key || typeof record.boardId !== 'string') return null;
    const mode: TalkingCardDraftMode = record.mode === 'new' ? 'new' : 'existing';
    const placement = record.placement === 'start' || record.placement === 'keep' ? record.placement : 'end';
    const voiceChoice: TalkingCardDraftVoiceChoice = record.voiceChoice === 'catalog'
      || record.voiceChoice === 'personal'
      || record.voiceChoice === 'saved'
      ? record.voiceChoice
      : 'default';
    const imageFile = typeof File !== 'undefined' && record.imageFile instanceof File ? record.imageFile : null;
    const documentFiles = typeof File === 'undefined' || !Array.isArray(record.documentFiles)
      ? []
      : record.documentFiles.filter((file): file is File => file instanceof File).slice(0, 10);
    return {
      key,
      version: 1,
      boardId: record.boardId,
      cardId: this.stringValue(record.cardId),
      mode,
      selectedAtlasId: this.stringValue(record.selectedAtlasId),
      createdAtlasId: this.stringValue(record.createdAtlasId),
      name: this.stringValue(record.name),
      role: this.stringValue(record.role),
      personaPrompt: this.stringValue(record.personaPrompt).slice(0, 40000),
      additionalGuidance: this.stringValue(record.additionalGuidance).slice(0, 600),
      openingMessage: this.stringValue(record.openingMessage).slice(0, 500),
      ctaLabel: this.stringValue(record.ctaLabel).slice(0, 48),
      placement,
      actions: normalizeTalkingCardActions(record.actions),
      catalogVoiceId: this.stringValue(record.catalogVoiceId),
      personalVoiceId: this.stringValue(record.personalVoiceId),
      voiceChoice,
      publishAvatar: record.publishAvatar === true,
      imageFile,
      uploadedImageUrl: this.stringValue(record.uploadedImageUrl).slice(0, 2000),
      documentFiles,
      updatedAt: this.stringValue(record.updatedAt),
    };
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private fallbackKey(key: string): string {
    return `${FALLBACK_STORAGE_PREFIX}${key}`;
  }

  private assetFingerprint(record: Pick<TalkingCardDraftRecord, 'imageFile' | 'documentFiles'>): string {
    const describe = (file: File | null) => file
      ? `${file.name}:${file.type}:${file.size}:${file.lastModified}`
      : '';
    return [describe(record.imageFile), ...record.documentFiles.map(describe)].join('|');
  }
}
