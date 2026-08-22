import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { AuthService } from './auth.service';
import { getFirebaseFunctions, getFirebaseStorage } from './firebase.client';
import { getGoogleDriveConfig } from './firebase.config';
import type { StackDocsExportSnapshot } from './boards/stack-doc-export';

const GOOGLE_GSI_SCRIPT = 'https://accounts.google.com/gsi/client';
const GOOGLE_DOCS_EXPORT_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export type GoogleDocsExportPhase = 'authorizing' | 'preparing-images' | 'creating-document';

export type GoogleDocsExportResult = {
  requestId: string;
  documentId: string;
  documentUrl: string;
  exportedCardCount: number;
  exportedImageCount: number;
  warnings: string[];
};

@Injectable()
export class GoogleDocsExportService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;
  private readonly storage = this.isBrowser ? getFirebaseStorage() : null;
  private readonly loadedScripts = new Map<string, Promise<void>>();

  readonly hasAuthorizedSession = signal(false);

  isConfigured(): boolean {
    return this.isBrowser && !!getGoogleDriveConfig().clientId;
  }

  async export(
    snapshot: StackDocsExportSnapshot,
    onPhase: (phase: GoogleDocsExportPhase) => void,
  ): Promise<GoogleDocsExportResult> {
    if (!this.isBrowser || !this.functions || !this.storage) {
      throw new Error('Google Docs export is only available in the browser.');
    }
    if (!this.authService.uid()) {
      throw new Error('Sign in before exporting to Google Docs.');
    }
    if (!snapshot.cards.length) {
      throw new Error('Select at least one card before exporting.');
    }

    onPhase('authorizing');
    const accessToken = await this.requestAccessToken();
    const stagedPaths: string[] = [];
    try {
      onPhase('preparing-images');
      const preparedSnapshot = await this.stageBrowserImages(snapshot, stagedPaths);
      onPhase('creating-document');
      const callable = httpsCallable<
        { accessToken: string; snapshot: StackDocsExportSnapshot },
        GoogleDocsExportResult
      >(this.functions, 'exportBoardToGoogleDocs');
      const { data } = await callable({ accessToken, snapshot: preparedSnapshot });
      if (!data?.documentId || !data?.documentUrl) {
        throw new Error('Google Docs did not return the created document.');
      }
      return {
        ...data,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      };
    } finally {
      await Promise.allSettled(stagedPaths.map((path) => deleteObject(storageRef(this.storage!, path))));
    }
  }

  private async requestAccessToken(): Promise<string> {
    const clientId = getGoogleDriveConfig().clientId;
    if (!clientId) {
      throw new Error('Google Docs export is not configured yet.');
    }
    await this.loadScript(GOOGLE_GSI_SCRIPT);
    const googleApi = (window as unknown as { google?: Record<string, any> }).google;
    const oauth = googleApi?.['accounts']?.['oauth2'];
    if (!oauth?.initTokenClient) {
      throw new Error('Google authorization did not initialize.');
    }

    return await new Promise<string>((resolve, reject) => {
      const tokenClient = oauth.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_DOCS_EXPORT_SCOPE,
        callback: (response: Record<string, unknown>) => {
          const error = typeof response['error'] === 'string' ? response['error'] : '';
          const accessToken = typeof response['access_token'] === 'string' ? response['access_token'] : '';
          if (error || !accessToken) {
            reject(new Error(
              typeof response['error_description'] === 'string'
                ? response['error_description']
                : 'Google Docs authorization was cancelled or denied.',
            ));
            return;
          }
          this.hasAuthorizedSession.set(true);
          resolve(accessToken);
        },
        error_callback: (error: Record<string, unknown>) => reject(new Error(
          typeof error['message'] === 'string'
            ? error['message']
            : 'Google Docs authorization was interrupted.',
        )),
      });
      tokenClient.requestAccessToken({ prompt: this.hasAuthorizedSession() ? '' : 'consent' });
    });
  }

  private async stageBrowserImages(
    snapshot: StackDocsExportSnapshot,
    stagedPaths: string[],
  ): Promise<StackDocsExportSnapshot> {
    const prepared = structuredClone(snapshot);
    let imageIndex = 0;
    const stage = async (value: string): Promise<string> => {
      if (!value.startsWith('data:') && !value.startsWith('blob:')) return value;
      const response = await fetch(value);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('A draft export image is not a supported image file.');
      if (blob.size > 10 * 1024 * 1024) throw new Error('A draft export image is larger than 10 MB.');
      const extension = this.imageExtension(blob.type);
      const path = `users/${this.authService.uid()}/board-doc-exports/${snapshot.boardId}/${snapshot.requestId}/draft-${imageIndex++}.${extension}`;
      await uploadBytes(storageRef(this.storage!, path), blob, { contentType: blob.type });
      stagedPaths.push(path);
      return await getDownloadURL(storageRef(this.storage!, path));
    };

    prepared.opening.coverImageUrl = await stage(prepared.opening.coverImageUrl);
    for (const card of prepared.cards) {
      card.imageUrls = await Promise.all(card.imageUrls.map(stage));
    }
    prepared.closing.imageUrl = await stage(prepared.closing.imageUrl);
    prepared.closing.qrImageUrl = await stage(prepared.closing.qrImageUrl);
    return prepared;
  }

  private imageExtension(contentType: string): string {
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('gif')) return 'gif';
    return 'jpg';
  }

  private loadScript(src: string): Promise<void> {
    const existing = this.loadedScripts.get(src);
    if (existing) return existing;
    const pending = new Promise<void>((resolve, reject) => {
      const loaded = this.document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      if (loaded) {
        if ((window as unknown as { google?: unknown }).google) resolve();
        else loaded.addEventListener('load', () => resolve(), { once: true });
        loaded.addEventListener('error', () => reject(new Error('Google authorization could not be loaded.')), { once: true });
        return;
      }
      const script = this.document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Google authorization could not be loaded.'));
      this.document.head.appendChild(script);
    });
    this.loadedScripts.set(src, pending);
    return pending;
  }
}
