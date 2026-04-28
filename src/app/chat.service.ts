import { isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type {
  ChatHistoryItem,
  ChatStoredMessage,
  ChatThreadItem,
  CitationPassage,
  QueryHistoryItem,
} from './atlas.models';
import { AtlasService } from './atlas.service';
import { AuthService } from './auth.service';
import { getFirebaseFirestore, getFirebaseFunctions } from './firebase.client';

type AskAtlasResponse = {
  answer: string;
  citedEntryIds: string[];
  citedPassages: CitationPassage[];
  scopedTopicIds: string[];
  knowledgeGap: boolean;
  threadId: string;
};

type PublicChatStateResponse = {
  threadId: string | null;
  messages: Array<Record<string, unknown>>;
  questionCount: number;
  questionLimit: number | null;
  remainingQuestions: number | null;
  requiresSignIn: boolean;
};

type AskPublicAtlasResponse = {
  blocked: boolean;
  answer: string;
  citedEntryIds: string[];
  citedPassages: CitationPassage[];
  scopedTopicIds: string[];
  knowledgeGap: boolean;
  threadId: string | null;
  questionCount: number;
  questionLimit: number | null;
  remainingQuestions: number | null;
  requiresSignIn: boolean;
};

type ShareChatThreadResponse = {
  threadId: string;
  isShared: boolean;
  sharedAt: string | null;
};

type SharedChatThreadResponse = {
  threadId: string;
  title: string;
  atlasName: string | null;
  sharedAt: string | null;
  messages: Array<Record<string, unknown>>;
};

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore = this.isBrowser ? getFirebaseFirestore() : null;
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;

  private legacyHistoryItems: QueryHistoryItem[] = [];
  private threadHistoryItems: ChatThreadItem[] = [];

  readonly queryHistory = signal<ChatHistoryItem[]>([]);
  readonly isLoadingHistory = signal(true);
  readonly isSubmitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly latestAnswer = signal<string | null>(null);
  readonly latestCitations = signal<CitationPassage[]>([]);
  readonly knowledgeGap = signal(false);
  readonly latestThreadId = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const uid = this.authService.uid();
      const atlasId = this.atlasService.activeAtlasId();
      if (!this.firestore || !uid) {
        this.legacyHistoryItems = [];
        this.threadHistoryItems = [];
        this.queryHistory.set([]);
        this.isLoadingHistory.set(false);
        return;
      }

      this.isLoadingHistory.set(true);

      const threadQuery = atlasId
        ? query(
            collection(this.firestore, 'chat_threads'),
            where('user_id', '==', uid),
            where('atlas_id', '==', atlasId),
            orderBy('updated_at', 'desc'),
          )
        : query(
            collection(this.firestore, 'chat_threads'),
            where('user_id', '==', uid),
            orderBy('updated_at', 'desc'),
          );
      const legacyQuery = atlasId
        ? query(
            collection(this.firestore, 'queries'),
            where('user_id', '==', uid),
            where('atlas_id', '==', atlasId),
            orderBy('created_at', 'desc'),
          )
        : query(
            collection(this.firestore, 'queries'),
            where('user_id', '==', uid),
            orderBy('created_at', 'desc'),
          );

      let threadsLoaded = false;
      let legacyLoaded = false;
      const markLoaded = (kind: 'threads' | 'legacy') => {
        if (kind === 'threads') {
          threadsLoaded = true;
        } else {
          legacyLoaded = true;
        }
        if (threadsLoaded && legacyLoaded) {
          this.isLoadingHistory.set(false);
        }
      };

      const threadUnsubscribe: Unsubscribe = onSnapshot(
        threadQuery,
        (snapshot) => {
          this.threadHistoryItems = snapshot.docs.map((doc) => ({
            id: doc.id,
            kind: 'thread',
            ...(doc.data() as Omit<ChatThreadItem, 'id' | 'kind'>),
          }));
          this.rebuildHistoryItems();
          markLoaded('threads');
        },
        () => markLoaded('threads'),
      );

      const legacyUnsubscribe: Unsubscribe = onSnapshot(
        legacyQuery,
        (snapshot) => {
          this.legacyHistoryItems = snapshot.docs.map((doc) => ({
            id: doc.id,
            kind: 'legacy',
            ...(doc.data() as Omit<QueryHistoryItem, 'id' | 'kind'>),
          }));
          this.rebuildHistoryItems();
          markLoaded('legacy');
        },
        () => markLoaded('legacy'),
      );

      onCleanup(() => {
        threadUnsubscribe();
        legacyUnsubscribe();
      });
    });
  }

  async ask(question: string, topicIds?: string[], threadId?: string | null): Promise<AskAtlasResponse | null> {
    if (!this.functions) {
      return null;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    try {
      const askAtlas = httpsCallable<
        { question: string; topicIds?: string[]; threadId?: string | null; atlasId: string | null },
        AskAtlasResponse
      >(this.functions, 'askAtlas');
      const { data } = await askAtlas({
        question,
        topicIds,
        threadId: threadId ?? null,
        atlasId: this.atlasService.activeAtlasId(),
      });

      this.latestAnswer.set(data.answer);
      this.latestCitations.set(data.citedPassages);
      this.knowledgeGap.set(data.knowledgeGap);
      this.latestThreadId.set(data.threadId);
      return data;
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async shareThread(threadId: string): Promise<ShareChatThreadResponse | null> {
    if (!this.functions) {
      return null;
    }

    const shareChatThread = httpsCallable<{ threadId: string }, ShareChatThreadResponse>(
      this.functions,
      'shareChatThread',
    );

    const { data } = await shareChatThread({ threadId });
    return data;
  }

  async loadSharedThread(threadId: string): Promise<{
    threadId: string;
    title: string;
    atlasName: string | null;
    sharedAt: { toDate(): Date } | Date | null;
    messages: ChatStoredMessage[];
  }> {
    if (!this.functions) {
      return {
        threadId,
        title: 'Shared chat',
        atlasName: null,
        sharedAt: null,
        messages: [],
      };
    }

    const getSharedChatThread = httpsCallable<{ threadId: string }, SharedChatThreadResponse>(
      this.functions,
      'getSharedChatThread',
    );
    const { data } = await getSharedChatThread({ threadId });

    return {
      threadId: data.threadId,
      title: data.title,
      atlasName: data.atlasName ?? null,
      sharedAt: this.hydrateTimestamp(data.sharedAt),
      messages: Array.isArray(data.messages) ? data.messages.map((message) => this.hydrateStoredMessage(message)) : [],
    };
  }

  async loadPublicChatState(
    atlasId: string,
    anonymousVisitorId?: string | null,
  ): Promise<{
    threadId: string | null;
    messages: ChatStoredMessage[];
    questionCount: number;
    questionLimit: number | null;
    remainingQuestions: number | null;
    requiresSignIn: boolean;
  }> {
    if (!this.functions) {
      return {
        threadId: null,
        messages: [],
        questionCount: 0,
        questionLimit: null,
        remainingQuestions: null,
        requiresSignIn: false,
      };
    }

    const getPublicChatState = httpsCallable<
      { atlasId: string; anonymousVisitorId?: string | null },
      PublicChatStateResponse
    >(this.functions, 'getPublicChatState');

    const { data } = await getPublicChatState({
      atlasId,
      anonymousVisitorId: anonymousVisitorId ?? null,
    });

    return {
      threadId: data.threadId ?? null,
      messages: (data.messages ?? []).map((message) => this.hydrateStoredMessage(message)),
      questionCount: Number(data.questionCount ?? 0),
      questionLimit: typeof data.questionLimit === 'number' ? data.questionLimit : null,
      remainingQuestions: typeof data.remainingQuestions === 'number' ? data.remainingQuestions : null,
      requiresSignIn: data.requiresSignIn === true,
    };
  }

  async askPublic(
    question: string,
    atlasId: string,
    options?: {
      threadId?: string | null;
      anonymousVisitorId?: string | null;
      topicIds?: string[];
    },
  ): Promise<AskPublicAtlasResponse | null> {
    if (!this.functions) {
      return null;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    try {
      const askPublicAtlas = httpsCallable<
        {
          question: string;
          atlasId: string;
          threadId?: string | null;
          anonymousVisitorId?: string | null;
          topicIds?: string[];
        },
        AskPublicAtlasResponse
      >(this.functions, 'askPublicAtlas');

      const { data } = await askPublicAtlas({
        question,
        atlasId,
        threadId: options?.threadId ?? null,
        anonymousVisitorId: options?.anonymousVisitorId ?? null,
        topicIds: options?.topicIds,
      });

      this.latestAnswer.set(data.answer);
      this.latestCitations.set(data.citedPassages ?? []);
      this.knowledgeGap.set(data.knowledgeGap === true);
      this.latestThreadId.set(data.threadId ?? null);
      return data;
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async loadHistoryMessages(item: ChatHistoryItem): Promise<ChatStoredMessage[]> {
    if (!this.firestore) {
      return [];
    }

    const uid = this.authService.uid();
    if (!uid) {
      return [];
    }

    if (item.kind === 'thread') {
      const snapshot = await getDocs(
        query(
          collection(this.firestore, 'chat_messages'),
          where('user_id', '==', uid),
          where('thread_id', '==', item.id),
          orderBy('created_at', 'asc'),
        ),
      );

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<ChatStoredMessage, 'id'>),
      })).sort((left, right) => this.compareStoredMessages(left, right));
    }

    return [
      {
        id: `${item.id}-q`,
        thread_id: item.id,
        user_id: '',
        role: 'user',
        text: item.question,
        created_at: item.created_at,
      },
      {
        id: `${item.id}-a`,
        thread_id: item.id,
        user_id: '',
        role: 'assistant',
        text: item.answer,
        cited_passages: item.cited_passages ?? [],
        knowledge_gap: !!item.knowledge_gap,
        created_at: item.updated_at ?? item.created_at,
      },
    ];
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

  private rebuildHistoryItems(): void {
    const merged = [...this.threadHistoryItems, ...this.legacyHistoryItems].sort((left, right) => {
      const leftTime = this.asMillis('updated_at' in left ? left.updated_at : left.created_at)
        || this.asMillis('created_at' in left ? left.created_at : undefined);
      const rightTime = this.asMillis('updated_at' in right ? right.updated_at : right.created_at)
        || this.asMillis('created_at' in right ? right.created_at : undefined);
      return rightTime - leftTime;
    });

    this.queryHistory.set(merged);
  }

  private asMillis(value: { toDate(): Date } | Date | null | undefined): number {
    const date = value instanceof Date ? value : typeof value?.toDate === 'function' ? value.toDate() : null;
    return date?.getTime() ?? 0;
  }

  private compareStoredMessages(left: ChatStoredMessage, right: ChatStoredMessage): number {
    const delta = this.asMillis(left.created_at) - this.asMillis(right.created_at);
    if (delta !== 0) {
      return delta;
    }
    if (left.role === right.role) {
      return 0;
    }
    return left.role === 'user' ? -1 : 1;
  }

  private hydrateStoredMessage(message: Record<string, unknown>): ChatStoredMessage {
    return {
      id: String(message['id'] ?? ''),
      thread_id: String(message['thread_id'] ?? ''),
      user_id: String(message['user_id'] ?? message['visitor_uid'] ?? ''),
      role: message['role'] === 'assistant' ? 'assistant' : 'user',
      text: String(message['text'] ?? ''),
      cited_passages: Array.isArray(message['cited_passages'])
        ? (message['cited_passages'] as CitationPassage[])
        : [],
      knowledge_gap: message['knowledge_gap'] === true,
      created_at: this.hydrateTimestamp(message['created_at']),
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
