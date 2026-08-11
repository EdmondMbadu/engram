import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';
import { AuthService } from '../auth.service';
import { getFirebaseFirestore, getFirebaseStorage } from '../firebase.client';
import {
  boardVideoLibraryId,
  canonicalPublicVideoUrl,
  LIVINGWIKI_PUBLIC_APP_URL,
  videoLibraryItemFromRecord,
  type SaveLatestBoardVideoInput,
  type VideoLibraryItem,
  type VideoLibraryRecord,
} from './video-library.models';

type BoardVideoSummary = {
  id: string;
  title: string;
  route: string;
  updatedAt: string;
  posterUrl: string;
  visibility: 'public' | 'private';
  socialVideoUrl: string;
  socialVideoMimeType: string;
  socialVideoUpdatedAt: string;
  socialVideoRenderVersion: string;
  socialVideoRatio: 'vertical' | 'square' | 'landscape';
  socialVideoNarrationEnabled: boolean;
  trailerVideoUrl: string;
  trailerVideoMimeType: string;
  trailerVideoUpdatedAt: string;
  trailerVideoRenderVersion: string;
  trailerVideoRatio: 'vertical' | 'square' | 'landscape';
  trailerVideoNarrationEnabled: boolean;
};

@Injectable({ providedIn: 'root' })
export class VideoLibraryService {
  private readonly authService = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly firestore: Firestore | null = this.isBrowser ? getFirebaseFirestore() : null;
  private readonly storage: FirebaseStorage | null = this.isBrowser ? getFirebaseStorage() : null;

  async loadItems(): Promise<VideoLibraryItem[]> {
    await this.authService.waitForReady();
    const uid = this.authService.uid();
    if (!uid || !this.firestore) {
      return [];
    }

    const [videoSnapshot, boardSnapshot] = await Promise.all([
      getDocs(collection(this.firestore, 'users', uid, 'videos')),
      getDocs(query(collection(this.firestore, 'boards'), where('owner_user_id', '==', uid))),
    ]);
    const boards = boardSnapshot.docs
      .map((boardDoc) => this.boardSummary(boardDoc.id, boardDoc.data()))
      .filter((board): board is BoardVideoSummary => !!board);
    const boardsById = new Map(boards.map((board) => [board.id, board]));
    const items = videoSnapshot.docs
      .map((videoDoc) => videoLibraryItemFromRecord(videoDoc.id, videoDoc.data()))
      .filter((item): item is VideoLibraryItem => !!item);
    const itemIds = new Set(items.map((item) => item.id));

    const legacyItems = await Promise.all(boards
      .filter((board) => !!board.socialVideoUrl && !itemIds.has(boardVideoLibraryId(board.id)))
      .map((board) => this.backfillPublishedBoard(uid, board)));
    items.push(...legacyItems.filter((item): item is VideoLibraryItem => !!item));
    const legacyTrailers = await Promise.all(boards
      .filter((board) => !!board.trailerVideoUrl && !itemIds.has(boardVideoLibraryId(board.id, 'trailer')))
      .map((board) => this.backfillPublishedBoardTrailer(uid, board)));
    items.push(...legacyTrailers.filter((item): item is VideoLibraryItem => !!item));

    const normalizedItems = items
      .map((item) => {
        const board = boardsById.get(item.sourceId);
        const publicShareUrl = canonicalPublicVideoUrl(item.publicShareUrl);
        if (publicShareUrl !== item.publicShareUrl) {
          void this.repairPublicShareUrl(uid, item.id, publicShareUrl);
        }
        return {
          ...item,
          publicShareUrl,
          sourceAvailable: !!board,
          currentSourceUpdatedAt: board?.updatedAt ?? '',
          sourceRoute: board?.route ?? item.sourceRoute,
          sourceTitle: board?.title ?? item.sourceTitle,
          posterUrl: board?.posterUrl || item.posterUrl,
        };
      })
      .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
    return normalizedItems;
  }

  async saveLatestBoardVideo(input: SaveLatestBoardVideoInput): Promise<VideoLibraryItem> {
    await this.authService.waitForReady();
    const uid = this.authService.uid();
    if (!uid || !this.firestore || !this.storage) {
      throw new Error('Sign in to save videos to My Videos.');
    }

    const itemId = boardVideoLibraryId(input.boardId, input.videoKind);
    const itemRef = doc(this.firestore, 'users', uid, 'videos', itemId);
    const previousSnapshot = await getDoc(itemRef);
    const previous = previousSnapshot.exists()
      ? videoLibraryItemFromRecord(previousSnapshot.id, previousSnapshot.data())
      : null;
    const previousPublicStoragePath = previous?.publicStoragePath
      || (previous?.publicShareUrl && !previous.storagePath
        ? this.storagePathFromReference(previous.videoUrl)
        : '');
    const generatedAt = new Date().toISOString();
    const version = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const storagePath = `users/${uid}/video-library/boards/${input.boardId}/${input.videoKind}/${version}.${input.extension}`;
    const videoRef = storageRef(this.storage, storagePath);
    const safeTitle = this.safeFileName(input.boardTitle);

    await uploadBytes(videoRef, input.blob, {
      contentType: this.normalizedMimeType(input.mimeType),
      cacheControl: 'private,max-age=3600',
      contentDisposition: `inline; filename="${safeTitle}.${input.extension}"`,
      customMetadata: {
        sourceType: 'board',
        sourceId: input.boardId,
        videoKind: input.videoKind,
        generatedAt,
      },
    });

    try {
      const videoUrl = await getDownloadURL(videoRef);
      const record: VideoLibraryRecord = {
        id: itemId,
        owner_user_id: uid,
        source_type: 'board',
        video_kind: input.videoKind,
        source_id: input.boardId,
        source_title: input.boardTitle.trim().slice(0, 120) || 'Untitled video',
        source_route: input.boardRoute.slice(0, 240),
        source_updated_at_iso: input.boardUpdatedAt.slice(0, 80),
        poster_url: input.posterUrl.slice(0, 2500),
        video_url: videoUrl.slice(0, 2500),
        storage_path: storagePath,
        public_storage_path: (input.publicStoragePath ?? previousPublicStoragePath).slice(0, 500),
        // A newly generated private-library copy is not the same file as an older
        // published version. Only advertise a public link when this render was
        // explicitly published as part of the same operation.
        public_share_url: canonicalPublicVideoUrl(input.publicShareUrl ?? '').slice(0, 2500),
        mime_type: this.normalizedMimeType(input.mimeType),
        ratio: input.ratio,
        duration_seconds: Math.max(0, input.durationSeconds),
        render_version: input.renderVersion.slice(0, 64),
        narration_enabled: input.narrationEnabled,
        generated_at_iso: generatedAt,
        updated_at_iso: generatedAt,
        server_updated_at: serverTimestamp(),
      };
      await setDoc(itemRef, record);
      if (previous?.storagePath && previous.storagePath !== storagePath) {
        await this.deleteStoragePath(previous.storagePath).catch(() => undefined);
      }
      return {
        ...videoLibraryItemFromRecord(itemId, record)!,
        sourceAvailable: true,
        currentSourceUpdatedAt: input.boardUpdatedAt,
      };
    } catch (error) {
      await deleteObject(videoRef).catch(() => undefined);
      throw error;
    }
  }

  async deleteItem(item: VideoLibraryItem): Promise<void> {
    await this.authService.waitForReady();
    const uid = this.authService.uid();
    if (!uid || !this.firestore || !this.storage || item.ownerUserId !== uid) {
      throw new Error('Only the video owner can delete this video.');
    }

    if (item.publicShareUrl || item.publicStoragePath || (!item.storagePath && item.videoUrl)) {
      const boardRef = doc(this.firestore, 'boards', item.sourceId);
      const boardSnapshot = await getDoc(boardRef);
      if (boardSnapshot.exists() && boardSnapshot.data()['owner_user_id'] === uid) {
        const now = new Date().toISOString();
        await updateDoc(boardRef, item.videoKind === 'trailer' ? {
          trailerVideoUrl: '',
          trailerVideoMimeType: '',
          trailerVideoUpdatedAt: '',
          trailerVideoRenderVersion: '',
          updated_at_iso: now,
          server_updated_at: serverTimestamp(),
        } : {
          socialVideoUrl: '',
          socialVideoMimeType: '',
          socialVideoUpdatedAt: '',
          socialVideoRenderVersion: '',
          updated_at_iso: now,
          server_updated_at: serverTimestamp(),
        });
      }
    }

    const paths = new Set([item.storagePath, item.publicStoragePath].filter(Boolean));
    if (!item.storagePath && item.videoUrl) {
      await this.deleteStorageReference(item.videoUrl);
    }
    await Promise.all(Array.from(paths, (path) => this.deleteStoragePath(path)));
    await deleteDoc(doc(this.firestore, 'users', uid, 'videos', item.id));
  }

  private async backfillPublishedBoard(uid: string, board: BoardVideoSummary): Promise<VideoLibraryItem | null> {
    if (!this.firestore || !board.socialVideoUrl) return null;
    const itemId = boardVideoLibraryId(board.id);
    const generatedAt = board.socialVideoUpdatedAt || board.updatedAt || new Date().toISOString();
    const record: VideoLibraryRecord = {
      id: itemId,
      owner_user_id: uid,
      source_type: 'board',
      video_kind: 'full',
      source_id: board.id,
      source_title: board.title,
      source_route: board.route,
      source_updated_at_iso: generatedAt,
      poster_url: board.posterUrl,
      video_url: board.socialVideoUrl,
      storage_path: '',
      public_storage_path: '',
      public_share_url: board.visibility === 'public' ? this.publicShareUrl(board.id, generatedAt) : '',
      mime_type: board.socialVideoMimeType || 'video/mp4',
      ratio: board.socialVideoRatio,
      duration_seconds: 0,
      render_version: board.socialVideoRenderVersion,
      narration_enabled: board.socialVideoNarrationEnabled,
      generated_at_iso: generatedAt,
      updated_at_iso: new Date().toISOString(),
      server_updated_at: serverTimestamp(),
    };
    try {
      await setDoc(doc(this.firestore, 'users', uid, 'videos', itemId), record);
      return videoLibraryItemFromRecord(itemId, record);
    } catch {
      return null;
    }
  }

  private async backfillPublishedBoardTrailer(uid: string, board: BoardVideoSummary): Promise<VideoLibraryItem | null> {
    if (!this.firestore || !board.trailerVideoUrl) return null;
    const itemId = boardVideoLibraryId(board.id, 'trailer');
    const generatedAt = board.trailerVideoUpdatedAt || board.updatedAt || new Date().toISOString();
    const record: VideoLibraryRecord = {
      id: itemId,
      owner_user_id: uid,
      source_type: 'board',
      video_kind: 'trailer',
      source_id: board.id,
      source_title: board.title,
      source_route: board.route,
      source_updated_at_iso: generatedAt,
      poster_url: board.posterUrl,
      video_url: board.trailerVideoUrl,
      storage_path: '',
      public_storage_path: '',
      public_share_url: board.visibility === 'public' ? this.publicShareUrl(board.id, generatedAt, 'trailer') : '',
      mime_type: board.trailerVideoMimeType || 'video/mp4',
      ratio: board.trailerVideoRatio,
      duration_seconds: 0,
      render_version: board.trailerVideoRenderVersion,
      narration_enabled: board.trailerVideoNarrationEnabled,
      generated_at_iso: generatedAt,
      updated_at_iso: new Date().toISOString(),
      server_updated_at: serverTimestamp(),
    };
    try {
      await setDoc(doc(this.firestore, 'users', uid, 'videos', itemId), record);
      return videoLibraryItemFromRecord(itemId, record);
    } catch {
      return null;
    }
  }

  private boardSummary(id: string, data: Record<string, unknown>): BoardVideoSummary | null {
    const title = this.stringValue(data['title']);
    if (!title) return null;
    const cards = Array.isArray(data['cards']) ? data['cards'] : [];
    const posterUrl = this.stringValue(data['imageUrl'])
      || this.stringValue(data['logoUrl'])
      || cards.map((card) => card && typeof card === 'object'
        ? this.stringValue((card as Record<string, unknown>)['imageUrl'])
        : '').find(Boolean)
      || '';
    return {
      id,
      title,
      route: `/boards/${encodeURIComponent(id)}`,
      updatedAt: this.stringValue(data['updated_at_iso']),
      posterUrl,
      visibility: data['visibility'] === 'private' ? 'private' : 'public',
      socialVideoUrl: this.stringValue(data['socialVideoUrl']),
      socialVideoMimeType: this.stringValue(data['socialVideoMimeType']),
      socialVideoUpdatedAt: this.stringValue(data['socialVideoUpdatedAt']),
      socialVideoRenderVersion: this.stringValue(data['socialVideoRenderVersion']),
      socialVideoRatio: data['socialVideoRatio'] === 'square' || data['socialVideoRatio'] === 'landscape'
        ? data['socialVideoRatio']
        : 'vertical',
      socialVideoNarrationEnabled: data['socialVideoNarrationEnabled'] !== false,
      trailerVideoUrl: this.stringValue(data['trailerVideoUrl']),
      trailerVideoMimeType: this.stringValue(data['trailerVideoMimeType']),
      trailerVideoUpdatedAt: this.stringValue(data['trailerVideoUpdatedAt']),
      trailerVideoRenderVersion: this.stringValue(data['trailerVideoRenderVersion']),
      trailerVideoRatio: data['trailerVideoRatio'] === 'square' || data['trailerVideoRatio'] === 'landscape'
        ? data['trailerVideoRatio']
        : 'vertical',
      trailerVideoNarrationEnabled: data['trailerVideoNarrationEnabled'] !== false,
    };
  }

  private publicShareUrl(boardId: string, version: string, kind: 'video' | 'trailer' = 'video'): string {
    const path = `/share/board/${encodeURIComponent(boardId)}/${kind}?v=${encodeURIComponent(version)}`;
    return `${LIVINGWIKI_PUBLIC_APP_URL}${path}`;
  }

  private async repairPublicShareUrl(uid: string, itemId: string, publicShareUrl: string): Promise<void> {
    if (!this.firestore) return;
    try {
      await updateDoc(doc(this.firestore, 'users', uid, 'videos', itemId), {
        public_share_url: publicShareUrl,
        updated_at_iso: new Date().toISOString(),
        server_updated_at: serverTimestamp(),
      });
    } catch (error) {
      console.warn('Could not repair a legacy video share URL.', error, { itemId });
    }
  }

  private async deleteStoragePath(path: string): Promise<void> {
    if (!this.storage || !path) return;
    await this.deleteStorageReference(path);
  }

  private async deleteStorageReference(pathOrUrl: string): Promise<void> {
    if (!this.storage || !pathOrUrl) return;
    try {
      await deleteObject(storageRef(this.storage, pathOrUrl));
    } catch (error) {
      if (!(error instanceof FirebaseError) || error.code !== 'storage/object-not-found') {
        throw error;
      }
    }
  }

  private storagePathFromReference(pathOrUrl: string): string {
    if (!this.storage || !pathOrUrl) return '';
    try {
      return storageRef(this.storage, pathOrUrl).fullPath;
    } catch {
      return '';
    }
  }

  private normalizedMimeType(value: string): string {
    return value.split(';')[0]?.trim().slice(0, 120) || 'video/mp4';
  }

  private safeFileName(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
      || 'livingwiki-video';
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
