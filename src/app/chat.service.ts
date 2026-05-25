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
  MappableLocation,
  QueryHistoryItem,
  TravelGuideCard,
  TravelGuideStructuredResponse,
} from './atlas.models';
import { AtlasService } from './atlas.service';
import { AuthService } from './auth.service';
import { getFirebaseConfig } from './firebase.config';
import { getFirebaseFirestore, getFirebaseFunctions } from './firebase.client';

type AskAtlasResponse = {
  answer: string;
  citedEntryIds: string[];
  citedPassages: CitationPassage[];
  mappableLocations?: MappableLocation[];
  travelGuide?: TravelGuideStructuredResponse | null;
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
  mappableLocations?: MappableLocation[];
  travelGuide?: TravelGuideStructuredResponse | null;
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

type ChatAnswerSpeechResponse = {
  audioUrl?: string;
  audioBase64?: string;
  contentType: string;
  voiceId: string;
  speechText?: string;
  durationHintSeconds?: number | null;
  cached?: boolean;
};

type StreamingAnswerCallbacks = {
  onDelta: (delta: string) => void;
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
        {
          question: string;
          topicIds?: string[];
          threadId?: string | null;
          atlasId: string | null;
          answerMode?: 'wiki' | 'internet';
        },
        AskAtlasResponse
      >(this.functions, 'askAtlas');
      const { data } = await askAtlas({
        question,
        topicIds,
        threadId: threadId ?? null,
        atlasId: this.atlasService.activeAtlasId(),
        answerMode: 'wiki',
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

  async askInternet(question: string, threadId?: string | null): Promise<AskAtlasResponse | null> {
    if (!this.functions) {
      return null;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    try {
      const askAtlas = httpsCallable<
        {
          question: string;
          threadId?: string | null;
          atlasId: string | null;
          answerMode?: 'wiki' | 'internet';
        },
        AskAtlasResponse
      >(this.functions, 'askAtlas');
      const { data } = await askAtlas({
        question,
        threadId: threadId ?? null,
        atlasId: this.atlasService.activeAtlasId(),
        answerMode: 'internet',
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

  async askInternetStream(
    question: string,
    threadId: string | null | undefined,
    callbacks: StreamingAnswerCallbacks,
  ): Promise<AskAtlasResponse | null> {
    if (!this.isBrowser) {
      return this.askInternet(question, threadId);
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    try {
      const projectId = getFirebaseConfig().projectId;
      if (!projectId) {
        throw new Error('Firebase project is not configured.');
      }

      const token = await this.authService.getIdToken();
      const response = await fetch(`https://us-central1-${projectId}.cloudfunctions.net/askAtlasStream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          threadId: threadId ?? null,
          atlasId: this.atlasService.activeAtlasId(),
        }),
      });

      if (!response.ok || !response.body) {
        const message = await response.text().catch(() => '');
        throw new Error(message || `Streaming request failed with status ${response.status}.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const finalResponseRef: { value: AskAtlasResponse | null } = { value: null };

      const processEvent = (rawEvent: string) => {
        const lines = rawEvent.split('\n');
        const event = lines
          .find((line) => line.startsWith('event:'))
          ?.slice('event:'.length)
          .trim();
        const dataText = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice('data:'.length).trimStart())
          .join('\n');
        if (!event || !dataText) {
          return;
        }

        const data = JSON.parse(dataText) as Record<string, unknown>;
        if (event === 'delta') {
          const delta = typeof data['delta'] === 'string' ? data['delta'] : '';
          if (delta) {
            callbacks.onDelta(delta);
          }
          return;
        }

        if (event === 'final') {
          finalResponseRef.value = data as AskAtlasResponse;
          return;
        }

        if (event === 'error') {
          throw new Error(typeof data['message'] === 'string' ? data['message'] : 'Streaming answer failed.');
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const event of events) {
          processEvent(event);
        }
        if (done) {
          break;
        }
      }

      if (buffer.trim()) {
        processEvent(buffer);
      }

      const finalResponse = finalResponseRef.value;
      if (!finalResponse) {
        throw new Error('Streaming answer ended before the final response arrived.');
      }

      this.latestAnswer.set(finalResponse.answer);
      this.latestCitations.set(finalResponse.citedPassages);
      this.knowledgeGap.set(finalResponse.knowledgeGap);
      this.latestThreadId.set(finalResponse.threadId);
      return finalResponse;
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
      answerMode?: 'wiki' | 'internet';
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
          answerMode?: 'wiki' | 'internet';
        },
        AskPublicAtlasResponse
      >(this.functions, 'askPublicAtlas');

      const { data } = await askPublicAtlas({
        question,
        atlasId,
        threadId: options?.threadId ?? null,
        anonymousVisitorId: options?.anonymousVisitorId ?? null,
        topicIds: options?.topicIds,
        answerMode: options?.answerMode === 'internet' ? 'internet' : 'wiki',
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

  async synthesizeAnswerSpeech(
    text: string,
    question?: string | null,
    anonymousVisitorId?: string | null,
  ): Promise<ChatAnswerSpeechResponse | null> {
    if (!this.functions) {
      return null;
    }

    const synthesizeChatAnswerSpeech = httpsCallable<
      { text: string; question?: string | null; anonymousVisitorId?: string | null; mode?: 'recap' | 'full' },
      ChatAnswerSpeechResponse
    >(this.functions, 'synthesizeChatAnswerSpeech');

    const { data } = await synthesizeChatAnswerSpeech({
      text,
      question: question ?? null,
      anonymousVisitorId: anonymousVisitorId ?? null,
      mode: 'recap',
    });
    return data;
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
      answer_mode: message['answer_mode'] === 'internet' ? 'internet' : 'wiki',
      role: message['role'] === 'assistant' ? 'assistant' : 'user',
      text: String(message['text'] ?? ''),
      cited_passages: Array.isArray(message['cited_passages'])
        ? (message['cited_passages'] as CitationPassage[])
        : [],
      mappable_locations: this.hydrateMappableLocations(message['mappable_locations']),
      travel_guide: this.hydrateTravelGuide(message['travel_guide']),
      knowledge_gap: message['knowledge_gap'] === true,
      answer_card_id: typeof message['answer_card_id'] === 'string' ? message['answer_card_id'] : null,
      answer_quiz_id: typeof message['answer_quiz_id'] === 'string' ? message['answer_quiz_id'] : null,
      created_at: this.hydrateTimestamp(message['created_at']),
    };
  }

  private hydrateMappableLocations(value: unknown): MappableLocation[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item): MappableLocation | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const data = item as Record<string, unknown>;
        const name = typeof data['name'] === 'string' ? data['name'].trim() : '';
        const searchQuery = typeof data['search_query'] === 'string' ? data['search_query'].trim() : '';
        if (!name || !searchQuery) {
          return null;
        }
        return {
          name,
          search_query: searchQuery,
          address_hint: typeof data['address_hint'] === 'string' ? data['address_hint'] : null,
        };
      })
      .filter((location): location is MappableLocation => !!location);
  }

  private hydrateTravelGuide(value: unknown): TravelGuideStructuredResponse | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    const cards = Array.isArray(data['cards'])
      ? data['cards']
          .map((item, index): TravelGuideCard | null => {
            if (!item || typeof item !== 'object') {
              return null;
            }
            const card = item as Record<string, unknown>;
            const title = this.cleanCardText(typeof card['title'] === 'string' ? card['title'] : '');
            const description = this.cleanCardText(typeof card['description'] === 'string' ? card['description'] : '');
            if (!title || !description) {
              return null;
            }
            return {
              id: typeof card['id'] === 'string' && card['id'].trim() ? card['id'].trim() : `guide-card-${index + 1}`,
              title,
              subtitle: typeof card['subtitle'] === 'string' ? this.cleanCardText(card['subtitle']) || null : null,
              description,
              neighborhood: typeof card['neighborhood'] === 'string' ? this.cleanCardText(card['neighborhood']) || null : null,
              best_for: typeof card['best_for'] === 'string' ? this.cleanCardText(card['best_for']) || null : null,
              vibe: typeof card['vibe'] === 'string' ? this.cleanCardText(card['vibe']) || null : null,
              local_tip: typeof card['local_tip'] === 'string' ? this.cleanCardText(card['local_tip']) || null : null,
              cost: typeof card['cost'] === 'string' ? this.cleanCardText(card['cost']) || null : null,
              time_hint: typeof card['time_hint'] === 'string' ? this.cleanCardText(card['time_hint']) || null : null,
              image_url: typeof card['image_url'] === 'string' ? card['image_url'].trim() || null : null,
              map_query: typeof card['map_query'] === 'string' ? card['map_query'].trim() || null : null,
              source_url: typeof card['source_url'] === 'string' ? card['source_url'].trim() || null : null,
            };
          })
          .filter((card): card is TravelGuideCard => !!card)
      : [];

    if (cards.length === 0) {
      return null;
    }

    return {
      title: typeof data['title'] === 'string' ? data['title'].trim() || null : null,
      summary: typeof data['summary'] === 'string' ? data['summary'].trim() || null : null,
      cards,
      route: typeof data['route'] === 'string' ? data['route'].trim() || null : null,
      next_actions: Array.isArray(data['next_actions'])
        ? data['next_actions']
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean)
            .slice(0, 4)
        : [],
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

  private cleanCardText(value: string): string {
    return value
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*#{1,6}\s*[^*#]+(?=\s+[-*+]\s+\*\*)/g, ' ')
      .replace(/(^|\s)#{1,6}\s*/g, '$1')
      .replace(/(^|\s)[*_]{1,3}([^*_]+)[*_]{1,3}(?=\s|$|[.,;:!?])/g, '$1$2')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/(^|\s)[-*+]\s+(?=\S)/g, '$1')
      .replace(/[*_]{1,3}/g, '')
      .replace(/\s+\*\s+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
