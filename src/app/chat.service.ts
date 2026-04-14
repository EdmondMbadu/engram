import { isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { CitationPassage, QueryHistoryItem } from './atlas.models';
import { AuthService } from './auth.service';
import { getFirebaseFirestore, getFirebaseFunctions } from './firebase.client';

type AskAtlasResponse = {
  answer: string;
  citedEntryIds: string[];
  citedPassages: CitationPassage[];
  scopedTopicIds: string[];
  knowledgeGap: boolean;
};

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly authService = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore = this.isBrowser ? getFirebaseFirestore() : null;
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;

  readonly queryHistory = signal<QueryHistoryItem[]>([]);
  readonly isLoadingHistory = signal(true);
  readonly isSubmitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly latestAnswer = signal<string | null>(null);
  readonly latestCitations = signal<CitationPassage[]>([]);
  readonly knowledgeGap = signal(false);

  constructor() {
    effect((onCleanup) => {
      const uid = this.authService.uid();
      if (!this.firestore || !uid) {
        this.queryHistory.set([]);
        this.isLoadingHistory.set(false);
        return;
      }

      this.isLoadingHistory.set(true);
      const historyQuery = query(
        collection(this.firestore, 'queries'),
        where('user_id', '==', uid),
        orderBy('created_at', 'desc'),
      );

      const unsubscribe: Unsubscribe = onSnapshot(
        historyQuery,
        (snapshot) => {
          this.queryHistory.set(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              ...(doc.data() as Omit<QueryHistoryItem, 'id'>),
            })),
          );
          this.isLoadingHistory.set(false);
        },
        () => this.isLoadingHistory.set(false),
      );

      onCleanup(() => unsubscribe());
    });
  }

  async ask(question: string, topicIds?: string[]): Promise<void> {
    if (!this.functions) {
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    try {
      const askAtlas = httpsCallable<
        { question: string; topicIds?: string[] },
        AskAtlasResponse
      >(this.functions, 'askAtlas');
      const { data } = await askAtlas({
        question,
        topicIds,
      });

      this.latestAnswer.set(data.answer);
      this.latestCitations.set(data.citedPassages);
      this.knowledgeGap.set(data.knowledgeGap);
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async deleteQuery(queryId: string): Promise<void> {
    if (!this.functions) {
      return;
    }

    const deleteQuery = httpsCallable<{ queryId: string }, { deleted: boolean; queryId: string }>(
      this.functions,
      'deleteQuery',
    );

    await deleteQuery({ queryId });
  }
}
