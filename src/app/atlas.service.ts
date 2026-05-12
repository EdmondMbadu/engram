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
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import type { AtlasAdminProfile, AtlasItem, AtlasNewsletterConfig, AtlasNewsletterTestResult, AtlasSubscriptionItem, AtlasUsage, CityAtlasConfig, CityPulseMetric } from './atlas.models';
import { AuthService } from './auth.service';
import { getFirebaseFirestore, getFirebaseFunctions, getFirebaseStorage } from './firebase.client';

const ACTIVE_ATLAS_STORAGE_KEY = 'living-atlas:activeAtlasId';

type PublicAtlasBySlugResponse = {
  atlas: Record<string, unknown> | null;
};

type AtlasAdminResponse = {
  admin: AtlasAdminProfile;
};

type AtlasSubscribeResponse = {
  ok: boolean;
  alreadySubscribed?: boolean;
};

type AtlasSubscriptionsResponse = {
  subscriptions: AtlasSubscriptionItem[];
};

type AtlasNewsletterConfigResponse = {
  config: AtlasNewsletterConfig;
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
    if (!id) return '/wikis';
    const atlas = this.atlases().find((a) => a.id === id);
    if (!atlas) return '/wikis';
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

  isPublicCityVisitorAtlas(
    atlas: AtlasItem | null | undefined,
    viewerUid?: string | null,
  ): boolean {
    if (!atlas?.is_public || atlas.city_config?.enabled !== true) {
      return false;
    }

    const uid = viewerUid?.trim() ?? '';
    return !uid || atlas.user_id !== uid;
  }

  constructor() {
    effect((onCleanup) => {
      const uid = this.authService.uid();
      if (!this.firestore || !uid) {
        this.atlases.set([]);
        this.isLoading.set(false);
        return;
      }

      this.isLoading.set(true);
      const ownedAtlasesQuery = query(
        collection(this.firestore, 'atlases'),
        where('user_id', '==', uid),
      );
      const adminAtlasesQuery = query(
        collection(this.firestore, 'atlases'),
        where('admin_user_ids', 'array-contains', uid),
      );

      let ownedItems: AtlasItem[] | null = null;
      let adminItems: AtlasItem[] | null = null;

      const publish = async () => {
        if (!ownedItems || !adminItems) {
          return;
        }

        const byId = new Map<string, AtlasItem>();
        for (const atlas of [...ownedItems, ...adminItems]) {
          byId.set(atlas.id, atlas);
        }

        const items = [...byId.values()].sort((a, b) => {
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
          void this.selfHealAtlases(items.filter((atlas) => atlas.user_id === uid));
          const current = this.activeAtlasId();
          if (!current || !items.some((a) => a.id === current)) {
            this.setActive(items[0].id);
          }
        }
        this.isLoading.set(false);
      };

      const hydrateSnapshot = (snapshot: QuerySnapshot<DocumentData>) =>
        snapshot.docs.map((d) =>
          this.hydrateAtlas({
            id: d.id,
            ...(d.data() as Record<string, unknown>),
          }),
        );

      const ownedUnsubscribe: Unsubscribe = onSnapshot(
        ownedAtlasesQuery,
        (snapshot) => {
          ownedItems = hydrateSnapshot(snapshot);
          void publish();
        },
        () => {
          ownedItems = [];
          void publish();
        },
      );
      const adminUnsubscribe: Unsubscribe = onSnapshot(
        adminAtlasesQuery,
        (snapshot) => {
          adminItems = hydrateSnapshot(snapshot);
          void publish();
        },
        () => {
          adminItems = [];
          void publish();
        },
      );

      onCleanup(() => {
        ownedUnsubscribe();
        adminUnsubscribe();
      });
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

    const name = input.name.trim() || 'Untitled Wiki';
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
      default_answer_mode: 'wiki',
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

  async listPublicAtlases(): Promise<AtlasItem[]> {
    if (!this.firestore) {
      return [];
    }

    const snap = await getDocs(
      query(
        collection(this.firestore, 'atlases'),
        where('is_public', '==', true),
      ),
    );

    return snap.docs.map((atlasDoc) =>
      this.hydrateAtlas({
        id: atlasDoc.id,
        ...(atlasDoc.data() as Record<string, unknown>),
      }),
    );
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
    patch: Partial<Pick<AtlasItem, 'description' | 'landing_summary' | 'logo_url' | 'hero_url' | 'video_url' | 'is_public'>>,
  ): Promise<void> {
    if (!this.firestore) return;
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      ...patch,
      updated_at: serverTimestamp(),
    });
  }

  async updateCityConfig(atlasId: string, config: CityAtlasConfig | null): Promise<void> {
    if (!this.firestore) return;
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      city_config: config,
      updated_at: serverTimestamp(),
    });
  }

  async updatePersonaPrompt(atlasId: string, value: string | null): Promise<void> {
    if (!this.firestore) return;
    const trimmed = value === null ? null : value.trim();
    const persona = trimmed && trimmed.length > 0 ? trimmed.slice(0, 8000) : null;
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      persona_prompt: persona,
      updated_at: serverTimestamp(),
    });
  }

  async updateDefaultAnswerMode(atlasId: string, mode: 'wiki' | 'internet'): Promise<void> {
    if (!this.firestore) return;
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      default_answer_mode: mode === 'internet' ? 'internet' : 'wiki',
      updated_at: serverTimestamp(),
    });
  }

  async addAtlasAdmin(atlasId: string, email: string): Promise<AtlasAdminProfile> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const addAtlasAdmin = httpsCallable<
      { atlasId: string; email: string },
      AtlasAdminResponse
    >(this.functions, 'addAtlasAdmin');
    const { data } = await addAtlasAdmin({ atlasId, email });
    return data.admin;
  }

  async removeAtlasAdmin(atlasId: string, userId: string): Promise<void> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const removeAtlasAdmin = httpsCallable<
      { atlasId: string; userId: string },
      { ok: boolean }
    >(this.functions, 'removeAtlasAdmin');
    await removeAtlasAdmin({ atlasId, userId });
  }

  async subscribeToAtlasUpdates(input: {
    atlasId: string;
    email: string;
    anonymousVisitorId?: string | null;
  }): Promise<AtlasSubscribeResponse> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const subscribeToAtlasUpdates = httpsCallable<
      { atlasId: string; email: string; anonymousVisitorId?: string | null },
      AtlasSubscribeResponse
    >(this.functions, 'subscribeToAtlasUpdates');
    const { data } = await subscribeToAtlasUpdates(input);
    return data;
  }

  async listAtlasSubscriptions(atlasId: string): Promise<AtlasSubscriptionItem[]> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const listAtlasSubscriptions = httpsCallable<
      { atlasId: string },
      AtlasSubscriptionsResponse
    >(this.functions, 'listAtlasSubscriptions');
    const { data } = await listAtlasSubscriptions({ atlasId });
    return data.subscriptions ?? [];
  }

  async removeAtlasSubscription(atlasId: string, subscriptionId: string): Promise<void> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const removeAtlasSubscription = httpsCallable<
      { atlasId: string; subscriptionId: string },
      { ok: boolean }
    >(this.functions, 'removeAtlasSubscription');
    await removeAtlasSubscription({ atlasId, subscriptionId });
  }

  async updateAtlasNewsletterConfig(atlasId: string, config: AtlasNewsletterConfig): Promise<AtlasNewsletterConfig> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const updateAtlasNewsletterConfig = httpsCallable<
      { atlasId: string; config: AtlasNewsletterConfig },
      AtlasNewsletterConfigResponse
    >(this.functions, 'updateAtlasNewsletterConfig');
    const { data } = await updateAtlasNewsletterConfig({ atlasId, config });
    return data.config;
  }

  async sendAtlasNewsletterTest(atlasId: string, config: AtlasNewsletterConfig): Promise<AtlasNewsletterTestResult> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const sendAtlasNewsletterTest = httpsCallable<
      { atlasId: string; config: AtlasNewsletterConfig },
      AtlasNewsletterTestResult
    >(this.functions, 'sendAtlasNewsletterTest');
    const { data } = await sendAtlasNewsletterTest({ atlasId, config });
    return data;
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
        wiki_articles: 0,
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
        wiki_articles: 0,
        knowledge_entries: 0,
        wiki_topics: 0,
        queries: 0,
        chat_threads: 0,
        total: 0,
      };
    }

    const [documents, wikiArticles, knowledgeEntries, wikiTopics, queriesCount, chatThreads] = await Promise.all([
      this.countAtlasCollection('documents', uid, atlasId),
      this.countAtlasCollection('wiki_articles', uid, atlasId),
      this.countAtlasCollection('knowledge_entries', uid, atlasId),
      this.countAtlasCollection('wiki_topics', uid, atlasId),
      this.countAtlasCollection('queries', uid, atlasId),
      this.countAtlasCollection('chat_threads', uid, atlasId),
    ]);

    return {
      documents,
      wiki_articles: wikiArticles,
      knowledge_entries: knowledgeEntries,
      wiki_topics: wikiTopics,
      queries: queriesCount,
      chat_threads: chatThreads,
      total: documents + wikiArticles + knowledgeEntries + wikiTopics + queriesCount + chatThreads,
    };
  }

  async getPublicAtlasUsage(atlasId: string): Promise<AtlasUsage> {
    if (!this.functions) {
      return {
        documents: 0,
        wiki_articles: 0,
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
      throw new Error('You must keep at least one Wiki.');
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
    if (!atlas) return 'Select Wiki';
    const trimmed = atlas.name?.trim();
    if (trimmed) return trimmed;
    return `Wiki ${atlas.id.slice(0, 6)}`;
  }

  isAtlasOwner(atlas: AtlasItem | null | undefined): boolean {
    const uid = this.authService.uid();
    return !!atlas && !!uid && atlas.user_id === uid;
  }

  isAtlasAdmin(atlas: AtlasItem | null | undefined): boolean {
    const uid = this.authService.uid();
    return !!atlas && !!uid && !!atlas.admin_user_ids?.includes(uid);
  }

  canAdminAtlas(atlas: AtlasItem | null | undefined): boolean {
    return this.isAtlasOwner(atlas) || this.isAtlasAdmin(atlas);
  }

  private async selfHealAtlases(items: AtlasItem[]): Promise<void> {
    if (!this.firestore) return;
    for (const atlas of items) {
      const patch: Record<string, unknown> = {};
      if (!atlas.name || !atlas.name.trim()) {
        patch['name'] = `Wiki ${atlas.id.slice(0, 6)}`;
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
      name: 'My Wiki',
      slug: 'my-wiki',
      description: null,
      landing_summary: null,
      is_public: false,
      logo_url: null,
      hero_url: null,
      video_url: null,
      cover_color: null,
      default_answer_mode: 'wiki',
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
      .slice(0, 48) || 'wiki';
  }

  private hydrateAtlas(data: Record<string, unknown>): AtlasItem {
    return {
      ...(data as Omit<AtlasItem, 'created_at' | 'updated_at'>),
      id: String(data['id'] ?? ''),
      user_id: String(data['user_id'] ?? ''),
      name: String(data['name'] ?? ''),
      slug: String(data['slug'] ?? ''),
      description: typeof data['description'] === 'string' ? data['description'] : null,
      landing_summary: typeof data['landing_summary'] === 'string' ? data['landing_summary'] : null,
      is_public: data['is_public'] === true,
      logo_url: typeof data['logo_url'] === 'string' ? data['logo_url'] : null,
      hero_url: typeof data['hero_url'] === 'string' ? data['hero_url'] : null,
      video_url: typeof data['video_url'] === 'string' ? data['video_url'] : null,
      cover_color: typeof data['cover_color'] === 'string' ? data['cover_color'] : null,
      city_config: this.hydrateCityConfig(data['city_config']),
      persona_prompt: typeof data['persona_prompt'] === 'string' ? data['persona_prompt'] : null,
      admin_user_ids: Array.isArray(data['admin_user_ids'])
        ? data['admin_user_ids'].filter((value): value is string => typeof value === 'string')
        : [],
      admin_profiles: this.hydrateAdminProfiles(data['admin_profiles']),
      default_answer_mode: data['default_answer_mode'] === 'internet' ? 'internet' : 'wiki',
      newsletter_config: this.hydrateNewsletterConfig(data['newsletter_config'], data['city_config']),
      created_at: this.hydrateDateValue(data['created_at']),
      updated_at: this.hydrateDateValue(data['updated_at']),
    };
  }

  private hydrateNewsletterConfig(value: unknown, cityConfigValue?: unknown): AtlasNewsletterConfig | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    const cityConfig = this.hydrateCityConfig(cityConfigValue);
    const day = Number(data['day_of_week']);
    const sendTime = typeof data['send_time'] === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(data['send_time'])
      ? data['send_time']
      : '09:00';
    const timezone = typeof data['timezone'] === 'string' && data['timezone'].trim()
      ? data['timezone'].trim()
      : cityConfig?.timezone || 'America/New_York';
    const prompt = typeof data['prompt'] === 'string' && data['prompt'].trim()
      ? data['prompt'].trim()
      : this.defaultNewsletterPrompt();
    return {
      enabled: data['enabled'] === true,
      day_of_week: Number.isInteger(day) && day >= 0 && day <= 6 ? day : 1,
      send_time: sendTime,
      timezone,
      prompt,
      last_sent_key: typeof data['last_sent_key'] === 'string' ? data['last_sent_key'] : null,
      last_sent_at: this.hydrateDateValue(data['last_sent_at']),
      last_recipient_count: typeof data['last_recipient_count'] === 'number' ? data['last_recipient_count'] : null,
      last_subject: typeof data['last_subject'] === 'string' ? data['last_subject'] : null,
    };
  }

  private hydrateAdminProfiles(value: unknown): AtlasAdminProfile[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item): AtlasAdminProfile | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const data = item as Record<string, unknown>;
        const userId = typeof data['user_id'] === 'string' ? data['user_id'] : '';
        if (!userId) {
          return null;
        }
        return {
          user_id: userId,
          email: typeof data['email'] === 'string' ? data['email'] : null,
          display_name: typeof data['display_name'] === 'string' ? data['display_name'] : null,
          added_at: this.hydrateDateValue(data['added_at']),
        };
      })
      .filter((profile): profile is AtlasAdminProfile => !!profile);
  }

  private hydrateCityConfig(value: unknown): CityAtlasConfig | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    return {
      enabled: data['enabled'] === true,
      city_name: typeof data['city_name'] === 'string' ? data['city_name'] : null,
      region_name: typeof data['region_name'] === 'string' ? data['region_name'] : null,
      country_code: typeof data['country_code'] === 'string' ? data['country_code'] : null,
      timezone: typeof data['timezone'] === 'string' ? data['timezone'] : null,
      census_state_code: typeof data['census_state_code'] === 'string' ? data['census_state_code'] : null,
      census_place_code: typeof data['census_place_code'] === 'string' ? data['census_place_code'] : null,
      airnow_zip_code: typeof data['airnow_zip_code'] === 'string' ? data['airnow_zip_code'] : null,
      manual_metrics: Array.isArray(data['manual_metrics'])
        ? data['manual_metrics'].map((metric) => this.hydrateCityPulseMetric(metric)).filter(Boolean) as CityPulseMetric[]
        : null,
    };
  }

  private hydrateCityPulseMetric(value: unknown): CityPulseMetric | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    const id = String(data['id'] ?? '').trim();
    const label = String(data['label'] ?? '').trim();
    if (!id || !label) {
      return null;
    }

    const numericValue = Number(data['value']);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return {
      id,
      label,
      short_label: String(data['short_label'] ?? label).trim() || label,
      description: String(data['description'] ?? '').trim(),
      format: data['format'] === 'currency' || data['format'] === 'percent' ? data['format'] : 'number',
      value: numericValue,
      decimals: typeof data['decimals'] === 'number' ? data['decimals'] : undefined,
      unit_prefix: typeof data['unit_prefix'] === 'string' ? data['unit_prefix'] : null,
      unit_suffix: typeof data['unit_suffix'] === 'string' ? data['unit_suffix'] : null,
      source_label: String(data['source_label'] ?? 'Manual').trim() || 'Manual',
      source_detail: typeof data['source_detail'] === 'string' ? data['source_detail'] : null,
      source_url: typeof data['source_url'] === 'string' ? data['source_url'] : null,
      methodology: typeof data['methodology'] === 'string' ? data['methodology'] : null,
      cadence:
        data['cadence'] === 'realtime' ||
        data['cadence'] === 'daily' ||
        data['cadence'] === 'weekly' ||
        data['cadence'] === 'monthly' ||
        data['cadence'] === 'yearly'
          ? data['cadence']
          : 'manual',
      as_of: typeof data['as_of'] === 'string' ? data['as_of'] : null,
      realtime: this.hydrateRealtimeConfig(data['realtime']),
    };
  }

  private hydrateRealtimeConfig(value: unknown) {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    const anchorIso = String(data['anchor_iso'] ?? '').trim();
    const baselineValue = Number(data['baseline_value']);
    const ratePerSecond = Number(data['rate_per_second']);
    if (!anchorIso || !Number.isFinite(baselineValue) || !Number.isFinite(ratePerSecond)) {
      return null;
    }

    return {
      anchor_iso: anchorIso,
      baseline_value: baselineValue,
      rate_per_second: ratePerSecond,
      min_value: typeof data['min_value'] === 'number' ? data['min_value'] : null,
    };
  }

  defaultNewsletterPrompt(): string {
    return [
      'Create a premium weekly Living Wiki email briefing with exactly five of the biggest headlines for this specific wiki.',
      'Focus on the latest verified public information, news, civic updates, development, culture, public safety, transportation, economy, and community signals that matter most to readers.',
      'For Philadelphia wikis, prioritize Philadelphia and the surrounding region.',
      'Use fresh web search, include dates when available, avoid rumors, and keep every item concise.',
      'Write like a top-tier professional local intelligence briefing: sharp, useful, polished, and skimmable.',
    ].join(' ');
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
    collectionName: 'documents' | 'wiki_articles' | 'knowledge_entries' | 'wiki_topics' | 'queries' | 'chat_threads',
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
      usage.wiki_articles ? `${usage.wiki_articles} wiki page${usage.wiki_articles === 1 ? '' : 's'}` : null,
      usage.knowledge_entries ? `${usage.knowledge_entries} knowledge entr${usage.knowledge_entries === 1 ? 'y' : 'ies'}` : null,
      usage.wiki_topics ? `${usage.wiki_topics} wiki topic${usage.wiki_topics === 1 ? '' : 's'}` : null,
      usage.queries ? `${usage.queries} legacy chat${usage.queries === 1 ? '' : 's'}` : null,
      usage.chat_threads ? `${usage.chat_threads} thread${usage.chat_threads === 1 ? '' : 's'}` : null,
    ].filter(Boolean);

    return `This atlas still has content: ${parts.join(', ')}.`;
  }
}
