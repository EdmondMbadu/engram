import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { DocumentItem, KnowledgeEntryItem, WikiTopicItem } from './atlas.models';
import { AuthService } from './auth.service';
import { getFirebaseFirestore } from './firebase.client';

@Injectable({ providedIn: 'root' })
export class WikiService {
  private readonly authService = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore = this.isBrowser ? getFirebaseFirestore() : null;

  readonly topics = signal<WikiTopicItem[]>([]);
  readonly selectedTopicId = signal<string | null>(null);
  readonly selectedTopic = computed(
    () => this.topics().find((topic) => topic.id === this.selectedTopicId()) ?? null,
  );
  readonly topicEntries = signal<KnowledgeEntryItem[]>([]);
  readonly sourceDocuments = signal<DocumentItem[]>([]);
  readonly isLoadingTopics = signal(true);
  readonly isLoadingEntries = signal(false);
  readonly entriesError = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const uid = this.authService.uid();
      if (!this.firestore || !uid) {
        this.topics.set([]);
        this.selectedTopicId.set(null);
        this.isLoadingTopics.set(false);
        return;
      }

      this.isLoadingTopics.set(true);
      const topicsQuery = query(
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

    effect((onCleanup) => {
      const uid = this.authService.uid();
      const topic = this.selectedTopic();

      if (!this.firestore || !uid || !topic) {
        this.topicEntries.set([]);
        this.sourceDocuments.set([]);
        this.entriesError.set(null);
        return;
      }

      this.isLoadingEntries.set(true);
      this.entriesError.set(null);
      const entriesQuery = query(
        collection(this.firestore, 'knowledge_entries'),
        where('user_id', '==', uid),
        where('topic', '==', topic.name),
        orderBy('created_at', 'desc'),
      );

      const unsubscribe: Unsubscribe = onSnapshot(
        entriesQuery,
        async (snapshot) => {
          try {
            const entries = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...(doc.data() as Omit<KnowledgeEntryItem, 'id'>),
            }));
            this.topicEntries.set(entries);
            this.sourceDocuments.set(await this.loadDocuments(entries.map((entry) => entry.document_id)));
            this.entriesError.set(null);
          } catch (error) {
            this.sourceDocuments.set([]);
            this.entriesError.set(
              error instanceof Error ? error.message : 'Failed to load topic details.',
            );
          } finally {
            this.isLoadingEntries.set(false);
          }
        },
        (error) => {
          this.entriesError.set(error.message || 'Failed to load topic entries.');
          this.isLoadingEntries.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  selectTopic(topicId: string): void {
    this.selectedTopicId.set(topicId);
  }

  private async loadDocuments(documentIds: string[]): Promise<DocumentItem[]> {
    if (!this.firestore || documentIds.length === 0) {
      return [];
    }

    const uniqueIds = Array.from(new Set(documentIds)).slice(0, 30);
    const snapshots = await Promise.all(
      uniqueIds.map((documentId) => getDoc(doc(this.firestore!, 'documents', documentId))),
    );

    return snapshots
      .filter((snapshot) => snapshot.exists())
      .map((snapshot) => ({
        id: snapshot.id,
        ...(snapshot.data() as Omit<DocumentItem, 'id'>),
      }));
  }
}
