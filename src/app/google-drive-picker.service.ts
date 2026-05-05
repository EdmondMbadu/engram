import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { getGoogleDriveConfig } from './firebase.config';

const GOOGLE_GSI_SCRIPT = 'https://accounts.google.com/gsi/client';
const GOOGLE_API_SCRIPT = 'https://apis.google.com/js/api.js';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GOOGLE_PICKER_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.spreadsheet',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
].join(',');

export interface GoogleDrivePickerFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
}

export interface GoogleDrivePickerSelection {
  accessToken: string;
  files: GoogleDrivePickerFile[];
}

declare global {
  interface Window {
    gapi?: {
      load(api: string, callback: () => void): void;
    };
    google?: unknown;
  }
}

@Injectable({ providedIn: 'root' })
export class GoogleDrivePickerService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly loadedScripts = new Map<string, Promise<void>>();

  readonly isBusy = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasAuthorizedSession = signal(false);
  readonly isConfigured = computed(() => {
    if (!this.isBrowser) {
      return false;
    }

    const config = getGoogleDriveConfig();
    return !!config.apiKey && !!config.clientId;
  });
  readonly isConnected = computed(() => this.hasAuthorizedSession());

  clearError(): void {
    this.error.set(null);
  }

  async pickFiles(): Promise<GoogleDrivePickerSelection | null> {
    if (!this.isBrowser) {
      throw new Error('Google Drive import is only available in the browser.');
    }

    const config = getGoogleDriveConfig();
    if (!config.apiKey || !config.clientId) {
      throw new Error('Google Drive import is not configured yet.');
    }

    this.isBusy.set(true);
    this.error.set(null);

    try {
      await this.ensurePickerApisLoaded();
      const accessToken = await this.requestAccessToken(config.clientId);
      const files = await this.openPicker({
        accessToken,
        apiKey: config.apiKey,
        appId: config.appId,
      });

      if (files.length === 0) {
        return null;
      }

      return { accessToken, files };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect to Google Drive.';
      this.error.set(message);
      throw error;
    } finally {
      this.isBusy.set(false);
    }
  }

  private async ensurePickerApisLoaded(): Promise<void> {
    await this.loadScript(GOOGLE_GSI_SCRIPT);
    await this.loadScript(GOOGLE_API_SCRIPT);

    if (typeof window.gapi?.load !== 'function') {
      throw new Error('Google API loader did not initialize.');
    }

    await new Promise<void>((resolve) => {
      window.gapi!.load('picker', resolve);
    });

    const googleApi = this.getGoogleApi();
    if (!googleApi['picker'] || !googleApi['accounts']?.['oauth2']) {
      throw new Error('Google Picker did not initialize.');
    }
  }

  private async requestAccessToken(clientId: string): Promise<string> {
    const googleApi = this.getGoogleApi();
    const accountsApi = googleApi['accounts'];

    return await new Promise<string>((resolve, reject) => {
      const tokenClient = accountsApi['oauth2'].initTokenClient({
        client_id: clientId,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: (response: Record<string, unknown>) => {
          const accessToken =
            typeof response['access_token'] === 'string' ? response['access_token'] : '';
          const errorCode =
            typeof response['error'] === 'string' ? response['error'] : '';

          if (errorCode) {
            reject(
              new Error(
                typeof response['error_description'] === 'string'
                  ? response['error_description']
                  : 'Google Drive authorization failed.',
              ),
            );
            return;
          }

          if (!accessToken) {
            reject(new Error('Google Drive authorization did not return an access token.'));
            return;
          }

          this.hasAuthorizedSession.set(true);
          resolve(accessToken);
        },
        error_callback: (error: Record<string, unknown>) => {
          reject(
            new Error(
              typeof error['message'] === 'string'
                ? error['message']
                : 'Google Drive authorization was interrupted.',
            ),
          );
        },
      });

      tokenClient.requestAccessToken({
        prompt: this.hasAuthorizedSession() ? '' : 'consent',
      });
    });
  }

  private async openPicker(params: {
    accessToken: string;
    apiKey: string;
    appId: string | null;
  }): Promise<GoogleDrivePickerFile[]> {
    const googleApi = this.getGoogleApi();
    const pickerApi = googleApi['picker'];

    return await new Promise<GoogleDrivePickerFile[]>((resolve) => {
      const pickerView = new pickerApi.DocsView(pickerApi.ViewId.DOCS)
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false)
        .setMimeTypes(GOOGLE_PICKER_MIME_TYPES);

      let pickerBuilder = new pickerApi.PickerBuilder()
        .setTitle('Import documents from Google Drive')
        .setDeveloperKey(params.apiKey)
        .setOAuthToken(params.accessToken)
        .addView(pickerView)
        .enableFeature(pickerApi.Feature.MULTISELECT_ENABLED)
        .setCallback((data: Record<string, unknown>) => {
          const responseKeys = pickerApi.Response as Record<string, string>;
          const action = data[responseKeys['ACTION'] ?? 'action'];

          if (action === pickerApi.Action.CANCEL) {
            resolve([]);
            return;
          }

          if (action !== pickerApi.Action.PICKED) {
            return;
          }

          const rawDocuments = data[responseKeys['DOCUMENTS'] ?? 'docs'];
          const pickerDocuments = Array.isArray(rawDocuments) ? rawDocuments : [];

          resolve(
            pickerDocuments
              .map((value) => this.normalizePickerFile(value))
              .filter((value): value is GoogleDrivePickerFile => value !== null),
          );
        });

      if (params.appId) {
        pickerBuilder = pickerBuilder.setAppId(params.appId);
      }

      pickerBuilder.build().setVisible(true);
    });
  }

  private normalizePickerFile(value: unknown): GoogleDrivePickerFile | null {
    const googleApi = this.getGoogleApi();
    const pickerDocument = googleApi['picker']['Document'] as Record<string, string>;
    const document = typeof value === 'object' && value ? (value as Record<string, unknown>) : null;
    if (!document) {
      return null;
    }

    const id = typeof document[pickerDocument['ID'] ?? 'id'] === 'string'
      ? String(document[pickerDocument['ID'] ?? 'id']).trim()
      : '';
    const name = typeof document[pickerDocument['NAME'] ?? 'name'] === 'string'
      ? String(document[pickerDocument['NAME'] ?? 'name']).trim()
      : '';
    const mimeType = typeof document[pickerDocument['MIME_TYPE'] ?? 'mimeType'] === 'string'
      ? String(document[pickerDocument['MIME_TYPE'] ?? 'mimeType']).trim()
      : '';
    const sizeValue = Number(document[pickerDocument['SIZE_BYTES'] ?? 'sizeBytes']);
    const size = Number.isFinite(sizeValue) ? sizeValue : null;

    if (!id || !name || !mimeType) {
      return null;
    }

    return { id, name, mimeType, size };
  }

  private async loadScript(src: string): Promise<void> {
    const existing = this.loadedScripts.get(src);
    if (existing) {
      return existing;
    }

    const promise = new Promise<void>((resolve, reject) => {
      const found = this.document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
      if (found) {
        if (found.dataset['loaded'] === 'true') {
          resolve();
          return;
        }

        found.addEventListener('load', () => {
          found.dataset['loaded'] = 'true';
          resolve();
        }, { once: true });
        found.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
          once: true,
        });
        return;
      }

      const script = this.document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.addEventListener(
        'load',
        () => {
          script.dataset['loaded'] = 'true';
          resolve();
        },
        { once: true },
      );
      script.addEventListener(
        'error',
        () => reject(new Error(`Failed to load ${src}`)),
        { once: true },
      );
      this.document.head.appendChild(script);
    });

    this.loadedScripts.set(src, promise);
    return promise;
  }

  private getGoogleApi(): Record<string, any> {
    const googleApi = window.google;
    if (!googleApi || typeof googleApi !== 'object') {
      throw new Error('Google APIs are unavailable.');
    }

    return googleApi as Record<string, any>;
  }
}
