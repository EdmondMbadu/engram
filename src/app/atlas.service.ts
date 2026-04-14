import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { AtlasItem, AtlasUsage } from './atlas.models';
import { AuthService } from './auth.service';
import { getFirebaseFirestore } from './firebase.client';

const ACTIVE_ATLAS_STORAGE_KEY = 'living-atlas:activeAtlasId';

@Injectable({ providedIn: 'root' })
export class AtlasService {
  private readonly authService = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore = this.isBrowser ? getFirebaseFirestore() : null;

  readonly atlases = signal<AtlasItem[]>([]);
  readonly activeAtlasId = signal<string | null>(this.loadActiveId());
  readonly isLoading = signal(true);
  private autoCreateAttempted = false;
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
      cover_color: null,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    this.setActive(ref.id);
    return ref.id;
  }

  async renameAtlas(atlasId: string, name: string): Promise<void> {
    if (!this.firestore) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      name: trimmed,
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
      if (!atlas.slug || !atlas.slug.trim()) {
        patch['slug'] = this.slugify(patch['name'] as string ?? `atlas-${atlas.id.slice(0, 6)}`);
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

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'atlas';
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
