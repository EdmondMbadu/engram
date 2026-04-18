import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import type { AtlasItem, AtlasUsage } from './atlas.models';
import { AuthService } from './auth.service';
import { getFirebaseFirestore, getFirebaseFunctions, getFirebaseStorage } from './firebase.client';

const ACTIVE_ATLAS_STORAGE_KEY = 'living-atlas:activeAtlasId';

type PublicAtlasBySlugResponse = {
  atlas: Record<string, unknown> | null;
};

@Injectable({ providedIn: 'root' })
export class AtlasService {
  private readonly authService = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore = this.isBrowser ? getFirebaseFirestore() : null;
  private readonly storage = this.isBrowser ? getFirebaseStorage() : null;
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;

  readonly atlases = signal<AtlasItem[]>([]);
  readonly activeAtlasId = signal<string | null>(this.loadActiveId());
  readonly isLoading = signal(true);
  private autoCreateAttempted = false;
  readonly activeAtlasHomeLink = computed(() => {
    const id = this.activeAtlasId();
    if (!id) return '/atlases';
    const atlas = this.atlases().find((a) => a.id === id);
    if (!atlas) return '/atlases';
    const slug = atlas.slug?.trim() || this.slugify(atlas.name ?? '') || atlas.id;
    return `/atlas/${slug}`;
  });
  readonly activeAtlasWikiLink = computed(() => {
    const id = this.activeAtlasId();
    if (!id) return '/wiki';
    const atlas = this.atlases().find((a) => a.id === id);
    if (!atlas) return '/wiki';
    const slug = atlas.slug?.trim() || this.slugify(atlas.name ?? '') || atlas.id;
    return atlas.is_public ? `/wiki/${slug}` : '/wiki';
  });

  readonly activeAtlas = computed(() => {
    const id = this.activeAtlasId();
    if (!id) return null;
    return this.atlases().find((atlas) => atlas.id === id) ?? null;
  });

  constructor() {
    effect((onCleanup) => {
      const uid = this.authService.uid();
      if (!this.firestore || !uid) {
        this.atlases.set([]);
        this.isLoading.set(false);
        return;
      }

      this.isLoading.set(true);
      const atlasesQuery = query(
        collection(this.firestore, 'atlases'),
        where('user_id', '==', uid),
      );

      const unsubscribe: Unsubscribe = onSnapshot(
        atlasesQuery,
        async (snapshot) => {
          const items: AtlasItem[] = snapshot.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<AtlasItem, 'id'>),
            }))
            .sort((a, b) => {
              const aMs = this.asMillis(a.created_at);
              const bMs = this.asMillis(b.created_at);
              if (aMs !== bMs) return aMs - bMs;
              return a.id.localeCompare(b.id);
            });
          this.atlases.set(items);

          if (items.length === 0) {
            if (!this.autoCreateAttempted) {
              this.autoCreateAttempted = true;
              const created = await this.createDefaultAtlas(uid);
              if (created) {
                this.setActive(created);
              }
            }
          } else {
            void this.selfHealAtlases(items);
            const current = this.activeAtlasId();
            if (!current || !items.some((a) => a.id === current)) {
              this.setActive(items[0].id);
            }
          }
          this.isLoading.set(false);
        },
        () => this.isLoading.set(false),
      );

      onCleanup(() => unsubscribe());
    });
  }

  setActive(atlasId: string | null): void {
    this.activeAtlasId.set(atlasId);
    if (this.isBrowser) {
      if (atlasId) {
        window.localStorage.setItem(ACTIVE_ATLAS_STORAGE_KEY, atlasId);
      } else {
        window.localStorage.removeItem(ACTIVE_ATLAS_STORAGE_KEY);
      }
    }
  }

  async createAtlas(input: { name: string; description?: string }): Promise<string | null> {
    if (!this.firestore) return null;
    const uid = this.authService.uid();
    if (!uid) return null;

    const name = input.name.trim() || 'Untitled Atlas';
    const slug = this.slugify(name);
    const ref = await addDoc(collection(this.firestore, 'atlases'), {
      user_id: uid,
      name,
      slug,
      description: input.description?.trim() || null,
      is_public: false,
      logo_url: null,
      hero_url: null,
      video_url: null,
      cover_color: null,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    this.setActive(ref.id);
    return ref.id;
  }

  async getPublicAtlasBySlug(slug: string): Promise<AtlasItem | null> {
    if (this.functions) {
      try {
        const getPublicAtlasBySlug = httpsCallable<
          { slug: string },
          PublicAtlasBySlugResponse
        >(
          this.functions,
          'getPublicAtlasBySlug',
        );

        const { data } = await getPublicAtlasBySlug({ slug });
        if (data?.atlas) {
          return this.hydrateAtlas(data.atlas);
        }
      } catch (error) {
        console.warn('[AtlasService] getPublicAtlasBySlug callable failed; falling back to Firestore query.', error);
      }
    }

    if (!this.firestore) {
      return null;
    }

    const snap = await getDocs(
      query(
        collection(this.firestore, 'atlases'),
        where('slug', '==', slug),
        where('is_public', '==', true),
        limit(1),
      ),
    );
    const atlasDoc = snap.docs[0];
    if (!atlasDoc) {
      return null;
    }

    return this.hydrateAtlas({
      id: atlasDoc.id,
      ...(atlasDoc.data() as Record<string, unknown>),
    });
  }

  async uploadAtlasImage(
    atlasId: string,
    kind: 'logo' | 'hero',
    file: File,
  ): Promise<string> {
    if (!this.storage) throw new Error('Storage unavailable.');
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files are supported.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Image must be under 10 MB.');
    }
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `atlases/${atlasId}/${kind}-${Date.now()}.${ext}`;
    const ref = storageRef(this.storage, path);
    await uploadBytes(ref, file, { contentType: file.type });
    return await getDownloadURL(ref);
  }

  async uploadAtlasVideo(
    atlasId: string,
    file: File,
  ): Promise<string> {
    if (!this.storage) throw new Error('Storage unavailable.');
    if (!file.type.startsWith('video/')) {
      throw new Error('Only video files are supported.');
    }
    if (file.size > 100 * 1024 * 1024) {
      throw new Error('Video must be under 100 MB.');
    }
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    const path = `atlases/${atlasId}/video-${Date.now()}.${ext}`;
    const ref = storageRef(this.storage, path);
    await uploadBytes(ref, file, { contentType: file.type });
    return await getDownloadURL(ref);
  }

  async removeAtlasVideo(atlasId: string, videoUrl: string): Promise<void> {
    if (this.storage && videoUrl) {
      try {
        const ref = storageRef(this.storage, videoUrl);
        await deleteObject(ref);
      } catch {
        // ignore — file may already be deleted
      }
    }
    await this.updateAtlas(atlasId, { video_url: null });
  }

  async updateAtlas(
    atlasId: string,
    patch: Partial<Pick<AtlasItem, 'description' | 'logo_url' | 'hero_url' | 'video_url' | 'is_public'>>,
  ): Promise<void> {
    if (!this.firestore) return;
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      ...patch,
      updated_at: serverTimestamp(),
    });
  }

  async renameAtlas(atlasId: string, name: string): Promise<void> {
    if (!this.firestore) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      name: trimmed,
      slug: this.slugify(trimmed),
      updated_at: serverTimestamp(),
    });
  }

  async getAtlasUsage(atlasId: string): Promise<AtlasUsage> {
    if (!this.firestore) {
      return {
        documents: 0,
        knowledge_entries: 0,
        wiki_topics: 0,
        queries: 0,
        chat_threads: 0,
        total: 0,
      };
    }

    const uid = this.authService.uid();
    if (!uid) {
      return {
        documents: 0,
        knowledge_entries: 0,
        wiki_topics: 0,
        queries: 0,
        chat_threads: 0,
        total: 0,
      };
    }

    const [documents, knowledgeEntries, wikiTopics, queriesCount, chatThreads] = await Promise.all([
      this.countAtlasCollection('documents', uid, atlasId),
      this.countAtlasCollection('knowledge_entries', uid, atlasId),
      this.countAtlasCollection('wiki_topics', uid, atlasId),
      this.countAtlasCollection('queries', uid, atlasId),
      this.countAtlasCollection('chat_threads', uid, atlasId),
    ]);

    return {
      documents,
      knowledge_entries: knowledgeEntries,
      wiki_topics: wikiTopics,
      queries: queriesCount,
      chat_threads: chatThreads,
      total: documents + knowledgeEntries + wikiTopics + queriesCount + chatThreads,
    };
  }

  async getPublicAtlasUsage(atlasId: string): Promise<AtlasUsage> {
    if (!this.functions) {
      return {
        documents: 0,
        knowledge_entries: 0,
        wiki_topics: 0,
        queries: 0,
        chat_threads: 0,
        total: 0,
      };
    }

    const getPublicAtlasUsage = httpsCallable<{ atlasId: string }, AtlasUsage>(
      this.functions,
      'getPublicAtlasUsage',
    );
    const { data } = await getPublicAtlasUsage({ atlasId });
    return data;
  }

  async deleteAtlas(atlasId: string): Promise<void> {
    if (!this.firestore) return;

    const currentAtlases = this.atlases();
    if (currentAtlases.length <= 1) {
      throw new Error('You must keep at least one atlas.');
    }

    const usage = await this.getAtlasUsage(atlasId);
    if (usage.total > 0) {
      throw new Error(this.formatAtlasUsageError(usage));
    }

    const nextAtlas = currentAtlases.find((atlas) => atlas.id !== atlasId)?.id ?? null;
    await deleteDoc(doc(this.firestore, 'atlases', atlasId));

    if (this.activeAtlasId() === atlasId) {
      this.setActive(nextAtlas);
    }
  }

  displayName(atlas: AtlasItem | null | undefined): string {
    if (!atlas) return 'Select atlas';
    const trimmed = atlas.name?.trim();
    if (trimmed) return trimmed;
    return `Atlas ${atlas.id.slice(0, 6)}`;
  }

  private async selfHealAtlases(items: AtlasItem[]): Promise<void> {
    if (!this.firestore) return;
    for (const atlas of items) {
      const patch: Record<string, unknown> = {};
      if (!atlas.name || !atlas.name.trim()) {
        patch['name'] = `Atlas ${atlas.id.slice(0, 6)}`;
      }
      const effectiveName = (patch['name'] as string | undefined) ?? atlas.name;
      const expectedSlug = this.slugify(effectiveName || `atlas-${atlas.id.slice(0, 6)}`);
      if (!atlas.slug || !atlas.slug.trim() || atlas.slug !== expectedSlug) {
        patch['slug'] = expectedSlug;
      }
      if (!atlas.created_at) {
        patch['created_at'] = serverTimestamp();
      }
      if (Object.keys(patch).length === 0) continue;
      try {
        await updateDoc(doc(this.firestore, 'atlases', atlas.id), patch);
      } catch {
        // ignore self-heal errors
      }
    }
  }

  private asMillis(value: { toDate(): Date } | Date | null | undefined): number {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
      return (value as { toDate(): Date }).toDate().getTime();
    }
    return 0;
  }

  private async createDefaultAtlas(uid: string): Promise<string | null> {
    if (!this.firestore) return null;
    const ref = await addDoc(collection(this.firestore, 'atlases'), {
      user_id: uid,
      name: 'My Atlas',
      slug: 'my-atlas',
      description: null,
      is_public: false,
      logo_url: null,
      hero_url: null,
      video_url: null,
      cover_color: null,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    return ref.id;
  }

  private loadActiveId(): string | null {
    if (!this.isBrowser) return null;
    return window.localStorage.getItem(ACTIVE_ATLAS_STORAGE_KEY);
  }

  slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'atlas';
  }

  private hydrateAtlas(data: Record<string, unknown>): AtlasItem {
    return {
      ...(data as Omit<AtlasItem, 'created_at' | 'updated_at'>),
      id: String(data['id'] ?? ''),
      user_id: String(data['user_id'] ?? ''),
      name: String(data['name'] ?? ''),
      slug: String(data['slug'] ?? ''),
      description: typeof data['description'] === 'string' ? data['description'] : null,
      is_public: data['is_public'] === true,
      logo_url: typeof data['logo_url'] === 'string' ? data['logo_url'] : null,
      hero_url: typeof data['hero_url'] === 'string' ? data['hero_url'] : null,
      video_url: typeof data['video_url'] === 'string' ? data['video_url'] : null,
      cover_color: typeof data['cover_color'] === 'string' ? data['cover_color'] : null,
      created_at: this.hydrateDateValue(data['created_at']),
      updated_at: this.hydrateDateValue(data['updated_at']),
    };
  }

  private hydrateDateValue(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
      return (value as { toDate(): Date }).toDate();
    }
    return null;
  }

  private async countAtlasCollection(
    collectionName: 'documents' | 'knowledge_entries' | 'wiki_topics' | 'queries' | 'chat_threads',
    userId: string,
    atlasId: string,
  ): Promise<number> {
    if (!this.firestore) return 0;
    const count = await getCountFromServer(
      query(
        collection(this.firestore, collectionName),
        where('user_id', '==', userId),
        where('atlas_id', '==', atlasId),
      ),
    );
    return count.data().count;
  }

  private formatAtlasUsageError(usage: AtlasUsage): string {
    const parts = [
      usage.documents ? `${usage.documents} document${usage.documents === 1 ? '' : 's'}` : null,
      usage.knowledge_entries ? `${usage.knowledge_entries} knowledge entr${usage.knowledge_entries === 1 ? 'y' : 'ies'}` : null,
      usage.wiki_topics ? `${usage.wiki_topics} wiki topic${usage.wiki_topics === 1 ? '' : 's'}` : null,
      usage.queries ? `${usage.queries} legacy chat${usage.queries === 1 ? '' : 's'}` : null,
      usage.chat_threads ? `${usage.chat_threads} thread${usage.chat_threads === 1 ? '' : 's'}` : null,
    ].filter(Boolean);

    return `This atlas still has content: ${parts.join(', ')}.`;
  }
}
