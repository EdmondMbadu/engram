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
import type { DocumentItem, KnowledgeEntryItem, WikiArticleItem, WikiTopicItem } from './atlas.models';
import { AtlasService } from './atlas.service';
import { AuthService } from './auth.service';
import { getFirebaseFirestore, getFirebaseFunctions } from './firebase.client';

@Injectable({ providedIn: 'root' })
export class WikiService {
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore = this.isBrowser ? getFirebaseFirestore() : null;
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;

  readonly topics = signal<WikiTopicItem[]>([]);
  readonly articles = signal<WikiArticleItem[]>([]);
  readonly hasArticles = computed(() => this.articles().length > 0);

  readonly selectedArticleId = signal<string | null>(null);
  readonly selectedArticle = computed(
    () => this.articles().find((a) => a.id === this.selectedArticleId()) ?? null,
  );

  readonly selectedTopicId = signal<string | null>(null);
  readonly selectedTopic = computed(
    () => this.topics().find((topic) => topic.id === this.selectedTopicId()) ?? null,
  );
  readonly topicEntries = signal<KnowledgeEntryItem[]>([]);
  readonly sourceDocuments = signal<DocumentItem[]>([]);
  readonly isLoadingTopics = signal(true);
  readonly isLoadingArticles = signal(true);
  readonly isLoadingEntries = signal(false);
  readonly entriesError = signal<string | null>(null);

  constructor() {
    // Load wiki articles (new system)
    effect((onCleanup) => {
      const uid = this.authService.uid();
      const atlasId = this.atlasService.activeAtlasId();
      if (!this.firestore || !uid) {
        this.articles.set([]);
        this.selectedArticleId.set(null);
        this.isLoadingArticles.set(false);
        return;
      }

      this.isLoadingArticles.set(true);
      const articlesQuery = atlasId
        ? query(
            collection(this.firestore, 'wiki_articles'),
            where('user_id', '==', uid),
            where('atlas_id', '==', atlasId),
            orderBy('last_updated', 'desc'),
          )
        : query(
            collection(this.firestore, 'wiki_articles'),
            where('user_id', '==', uid),
            orderBy('last_updated', 'desc'),
          );

      const unsubscribe: Unsubscribe = onSnapshot(
        articlesQuery,
        (snapshot) => {
          const items = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<WikiArticleItem, 'id'>),
          }));
          this.articles.set(items);
          const current = this.selectedArticleId();
          if (!current || !items.some((a) => a.id === current)) {
            this.selectedArticleId.set(items[0]?.id ?? null);
          }
          this.isLoadingArticles.set(false);
        },
        () => this.isLoadingArticles.set(false),
      );

      onCleanup(() => unsubscribe());
    });

    // Load wiki topics (old system, used as fallback)
    effect((onCleanup) => {
      const uid = this.authService.uid();
      const atlasId = this.atlasService.activeAtlasId();
      if (!this.firestore || !uid) {
        this.topics.set([]);
        this.selectedTopicId.set(null);
        this.isLoadingTopics.set(false);
        return;
      }

      this.isLoadingTopics.set(true);
      const topicsQuery = atlasId
        ? query(
            collection(this.firestore, 'wiki_topics'),
            where('user_id', '==', uid),
            where('atlas_id', '==', atlasId),
            orderBy('last_updated', 'desc'),
          )
        : query(
            collection(this.firestore, 'wiki_topics'),
            where('user_id', '==', uid),
            orderBy('last_updated', 'desc'),
          );

      const unsubscribe: Unsubscribe = onSnapshot(
        topicsQuery,
        (snapshot) => {
          const topics = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<WikiTopicItem, 'id'>),
          }));
          this.topics.set(topics);
          const currentSelection = this.selectedTopicId();
          if (!currentSelection || !topics.some((topic) => topic.id === currentSelection)) {
            this.selectedTopicId.set(topics[0]?.id ?? null);
          }
          this.isLoadingTopics.set(false);
        },
        () => this.isLoadingTopics.set(false),
      );

      onCleanup(() => unsubscribe());
    });

    // Load topic details when a topic is selected (old system fallback)
    effect((onCleanup) => {
      const uid = this.authService.uid();
      const topic = this.selectedTopic();
      let cancelled = false;

      if (!this.firestore || !this.functions || !uid || !topic) {
        this.topicEntries.set([]);
        this.sourceDocuments.set([]);
        this.entriesError.set(null);
        this.isLoadingEntries.set(false);
        return;
      }

      this.isLoadingEntries.set(true);
      this.entriesError.set(null);

      void (async () => {
        try {
          const getWikiTopicDetails = httpsCallable<
            { topicId: string },
            { entries: KnowledgeEntryItem[]; sourceDocuments: DocumentItem[] }
          >(this.functions!, 'getWikiTopicDetails');
          const { data } = await getWikiTopicDetails({ topicId: topic.id });

          if (cancelled) {
            return;
          }

          this.topicEntries.set(
            (data.entries ?? []).filter((entry) => entry.user_id === uid && !entry.orphaned),
          );
          this.sourceDocuments.set(
            (data.sourceDocuments ?? []).filter((document) => document.user_id === uid),
          );
          this.entriesError.set(null);
        } catch (error) {
          if (cancelled) {
            return;
          }
          this.topicEntries.set([]);
          this.sourceDocuments.set([]);
          this.entriesError.set(
            error instanceof Error ? error.message : 'Failed to load topic details.',
          );
        } finally {
          if (!cancelled) {
            this.isLoadingEntries.set(false);
          }
        }
      })();

      onCleanup(() => {
        cancelled = true;
      });
    });
  }

  selectArticle(articleId: string): void {
    this.selectedArticleId.set(articleId);
  }

  selectTopic(topicId: string): void {
    this.selectedTopicId.set(topicId);
  }
}
