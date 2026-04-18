import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from 'firebase/storage';
import type { DocumentItem } from './atlas.models';
import { AtlasService } from './atlas.service';
import { AuthService } from './auth.service';
import {
  getFirebaseFirestore,
  getFirebaseFunctions,
  getFirebaseStorage,
} from './firebase.client';

type PrepareDocumentUploadResponse = {
  documentId: string;
  storagePath: string;
  fileType: string;
};

type DeleteDocumentResponse = {
  deletedTopicIds: string[];
  updatedTopicIds: string[];
};

type PublicAtlasDocumentsResponse = {
  documents: Array<Record<string, unknown>>;
};

type WikiSourceDocumentLinkResponse = {
  url: string;
};

@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore = this.isBrowser ? getFirebaseFirestore() : null;
  private readonly storage = this.isBrowser ? getFirebaseStorage() : null;
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;

  readonly documents = signal<DocumentItem[]>([]);
  readonly isLoading = signal(true);
  readonly isUploading = signal(false);
  readonly uploadError = signal<string | null>(null);
  readonly uploadProgress = signal<Record<string, number>>({});
  readonly knowledgeGapsCount = signal(0);
  readonly deleteError = signal<string | null>(null);
  readonly deletingDocumentIds = signal<Record<string, boolean>>({});

  readonly stats = computed(() => {
    const documents = this.documents();
    return {
      totalDocuments: documents.length,
      wikiPagesGenerated: documents.reduce(
        (sum, document) => sum + (document.wiki_pages_generated ?? 0),
        0,
      ),
      totalCitations: documents.reduce(
        (sum, document) => sum + (document.citation_count ?? 0),
        0,
      ),
      knowledgeGaps: this.knowledgeGapsCount(),
    };
  });

  constructor() {
    effect((onCleanup) => {
      const uid = this.authService.uid();
      const atlasId = this.atlasService.activeAtlasId();

      if (!this.firestore || !uid) {
        this.documents.set([]);
        this.isLoading.set(false);
        return;
      }

      this.isLoading.set(true);
      const documentsQuery = atlasId
        ? query(
            collection(this.firestore, 'documents'),
            where('user_id', '==', uid),
            where('atlas_id', '==', atlasId),
            where('visible', '==', true),
            orderBy('uploaded_at', 'desc'),
          )
        : query(
            collection(this.firestore, 'documents'),
            where('user_id', '==', uid),
            where('visible', '==', true),
            orderBy('uploaded_at', 'desc'),
          );

      const unsubscribe: Unsubscribe = onSnapshot(
        documentsQuery,
        (snapshot) => {
          this.documents.set(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              ...(doc.data() as Omit<DocumentItem, 'id'>),
            })),
          );
          this.isLoading.set(false);
        },
        (error) => {
          console.error('[DocumentsService] onSnapshot error:', error);
          this.isLoading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });

    effect((onCleanup) => {
      const uid = this.authService.uid();

      if (!this.firestore || !uid) {
        this.knowledgeGapsCount.set(0);
        return;
      }

      const gapsQuery = query(
        collection(this.firestore, 'queries'),
        where('user_id', '==', uid),
        where('knowledge_gap', '==', true),
      );

      const unsubscribe = onSnapshot(
        gapsQuery,
        (snapshot) => this.knowledgeGapsCount.set(snapshot.size),
        () => this.knowledgeGapsCount.set(0),
      );

      onCleanup(() => unsubscribe());
    });
  }

  async uploadFiles(fileList: FileList | File[]): Promise<void> {
    if (!this.functions || !this.storage) {
      return;
    }

    const files = Array.from(fileList).slice(0, 10);
    if (files.length === 0) {
      return;
    }

    this.isUploading.set(true);
    this.uploadError.set(null);

    try {
      for (const file of files) {
        await this.uploadSingleFile(file);
      }
    } catch (error) {
      this.uploadError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isUploading.set(false);
    }
  }

  async submitUrl(url: string): Promise<void> {
    if (!this.functions) {
      return;
    }

    this.isUploading.set(true);
    this.uploadError.set(null);

    try {
      const submitUrlDocument = httpsCallable<
        { url: string; atlasId: string | null },
        { documentId: string }
      >(this.functions, 'submitUrlDocument');
      await submitUrlDocument({ url, atlasId: this.atlasService.activeAtlasId() });
    } catch (error) {
      this.uploadError.set(this.authService.toFriendlyError(error));
      throw error;
    } finally {
      this.isUploading.set(false);
    }
  }

  async getDownloadUrl(document: DocumentItem): Promise<string | null> {
    if (!this.storage || !document.storage_path) {
      return null;
    }

    return getDownloadURL(ref(this.storage, document.storage_path));
  }

  async getAccessibleDownloadUrl(
    document: DocumentItem,
    options?: { atlasId?: string | null },
  ): Promise<string | null> {
    if (options?.atlasId) {
      if (!this.functions) {
        return null;
      }

      const getWikiSourceDocumentLink = httpsCallable<
        { documentId: string; atlasId?: string | null; filename?: string | null },
        WikiSourceDocumentLinkResponse
      >(this.functions, 'getWikiSourceDocumentLink');

      const { data } = await getWikiSourceDocumentLink({
        documentId: document.id,
        atlasId: options.atlasId,
        filename: document.title || document.filename,
      });

      return data?.url ?? null;
    }

    return this.getDownloadUrl(document);
  }

  async getPublicAtlasDocuments(atlasId: string): Promise<DocumentItem[]> {
    if (!this.functions) {
      return [];
    }

    const getPublicAtlasDocuments = httpsCallable<
      { atlasId: string },
      PublicAtlasDocumentsResponse
    >(this.functions, 'getPublicAtlasDocuments');

    const { data } = await getPublicAtlasDocuments({ atlasId });
    return (data.documents ?? []).map((document) => this.hydrateDocument(document));
  }

  async deleteDocument(documentId: string): Promise<void> {
    if (!this.functions) {
      return;
    }

    this.deleteError.set(null);
    this.deletingDocumentIds.update((value) => ({ ...value, [documentId]: true }));

    try {
      const deleteDocument = httpsCallable<
        { documentId: string },
        DeleteDocumentResponse
      >(this.functions, 'deleteDocument');
      await deleteDocument({ documentId });
    } catch (error) {
      this.deleteError.set(this.authService.toFriendlyError(error));
      throw error;
    } finally {
      this.deletingDocumentIds.update((value) => {
        const next = { ...value };
        delete next[documentId];
        return next;
      });
    }
  }

  private async uploadSingleFile(file: File): Promise<void> {
    if (!this.functions || !this.storage) {
      return;
    }

    const prepareUpload = httpsCallable<
      { filename: string; mimeType: string; fileSize: number; atlasId: string | null },
      PrepareDocumentUploadResponse
    >(this.functions, 'prepareDocumentUpload');

    const { data } = await prepareUpload({
      filename: file.name,
      mimeType: file.type,
      fileSize: file.size,
      atlasId: this.atlasService.activeAtlasId(),
    });

    const storageRef = ref(this.storage, data.storagePath);
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'application/octet-stream',
      customMetadata: {
        documentId: data.documentId,
        originalFilename: file.name,
      },
    });

    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => this.updateUploadProgress(data.documentId, snapshot),
        (error) => reject(error),
        () => resolve(),
      );
    });

    this.uploadProgress.update((progress) => {
      const next = { ...progress };
      delete next[data.documentId];
      return next;
    });
  }

  private updateUploadProgress(
    documentId: string,
    snapshot: UploadTaskSnapshot,
  ): void {
    const percentage =
      snapshot.totalBytes > 0
        ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
        : 0;

    this.uploadProgress.update((progress) => ({
      ...progress,
      [documentId]: percentage,
    }));
  }

  private hydrateDocument(document: Record<string, unknown>): DocumentItem {
    return {
      ...(document as Omit<DocumentItem, 'id'>),
      id: String(document['id'] ?? ''),
      uploaded_at: this.hydrateTimestamp(document['uploaded_at']),
      indexed_at: this.hydrateTimestamp(document['indexed_at']),
      last_heartbeat_at: this.hydrateTimestamp(document['last_heartbeat_at']),
    };
  }

  private hydrateTimestamp(value: unknown): { toDate(): Date } | Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
      return value as { toDate(): Date };
    }
    return null;
  }
}
