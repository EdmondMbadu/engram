import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { AuthService } from './auth.service';
import { getFirebaseFunctions, getFirebaseStorage } from './firebase.client';
import type { StackDocsExportSnapshot } from './boards/stack-doc-export';

export type DocxExportPhase = 'preparing-images' | 'building-document' | 'downloading';

type DocxCallableResult = {
  requestId: string;
  fileName: string;
  storagePath: string;
  downloadUrl: string;
  exportedCardCount: number;
  exportedImageCount: number;
  warnings: string[];
};

export type DocxExportResult = Omit<DocxCallableResult, 'downloadUrl' | 'storagePath'> & {
  localDownloadUrl: string;
};

@Injectable()
export class DocxExportService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;
  private readonly storage = this.isBrowser ? getFirebaseStorage() : null;

  async export(
    snapshot: StackDocsExportSnapshot,
    onPhase: (phase: DocxExportPhase) => void,
  ): Promise<DocxExportResult> {
    if (!this.isBrowser || !this.functions || !this.storage) {
      throw new Error('DOCX export is only available in the browser.');
    }
    if (!this.authService.uid()) {
      throw new Error('Sign in before downloading this board as a DOCX file.');
    }
    if (!snapshot.cards.length) {
      throw new Error('Select at least one card before exporting.');
    }

    const stagedPaths: string[] = [];
    let generatedPath = '';
    try {
      onPhase('preparing-images');
      const preparedSnapshot = await this.stageBrowserImages(snapshot, stagedPaths);
      onPhase('building-document');
      const callable = httpsCallable<
        { snapshot: StackDocsExportSnapshot },
        DocxCallableResult
      >(this.functions, 'exportBoardToDocx');
      const { data } = await callable({ snapshot: preparedSnapshot });
      if (!data?.downloadUrl || !data?.storagePath || !data?.fileName) {
        throw new Error('The DOCX exporter did not return a downloadable file.');
      }
      generatedPath = data.storagePath;
      onPhase('downloading');
      const response = await fetch(data.downloadUrl);
      if (!response.ok) throw new Error(`The DOCX download returned ${response.status}.`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('The downloaded DOCX file was empty.');
      const localDownloadUrl = URL.createObjectURL(blob);
      this.download(localDownloadUrl, data.fileName);
      return {
        requestId: data.requestId,
        fileName: data.fileName,
        localDownloadUrl,
        exportedCardCount: data.exportedCardCount,
        exportedImageCount: data.exportedImageCount,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      };
    } finally {
      const cleanupPaths = [...stagedPaths, ...(generatedPath ? [generatedPath] : [])];
      await Promise.allSettled(cleanupPaths.map((path) => deleteObject(storageRef(this.storage!, path))));
    }
  }

  downloadAgain(result: DocxExportResult): void {
    this.download(result.localDownloadUrl, result.fileName);
  }

  release(result: DocxExportResult | null): void {
    if (result?.localDownloadUrl.startsWith('blob:')) URL.revokeObjectURL(result.localDownloadUrl);
  }

  private download(url: string, fileName: string): void {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
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
    for (const card of prepared.cards) card.imageUrls = await Promise.all(card.imageUrls.map(stage));
    prepared.closing.imageUrl = await stage(prepared.closing.imageUrl);
    prepared.closing.qrImageUrl = await stage(prepared.closing.qrImageUrl);
    return prepared;
  }

  private imageExtension(contentType: string): string {
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('gif')) return 'gif';
    if (contentType.includes('svg')) return 'svg';
    return 'jpg';
  }
}
