import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import type { AnswerCardItem, MappableLocation, TravelGuideCard } from './atlas.models';
import { getFirebaseFunctions } from './firebase.client';

export interface CreateAnswerCardInput {
  question: string;
  answer: string;
  atlasId?: string | null;
  threadId?: string | null;
  sourceMessageId?: string | null;
  sourceMessageKind?: 'workspace' | 'public' | null;
  answerMode?: 'wiki' | 'internet' | null;
  mappableLocations?: MappableLocation[];
  anonymousVisitorId?: string | null;
}

export interface CreateTravelCardShareInput {
  card: TravelGuideCard;
  atlasId?: string | null;
  atlasName?: string | null;
  guideTitle?: string | null;
  guideSummary?: string | null;
  question?: string | null;
  threadId?: string | null;
  sourceMessageId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AnswerCardService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;

  async createAnswerCard(input: CreateAnswerCardInput): Promise<AnswerCardItem> {
    const callable = httpsCallable(this.requireFunctions(), 'createAnswerCard');
    const result = await callable({
      question: input.question,
      answer: input.answer,
      atlasId: input.atlasId ?? null,
      threadId: input.threadId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
      sourceMessageKind: input.sourceMessageKind ?? null,
      answerMode: input.answerMode ?? null,
      mappableLocations: input.mappableLocations ?? [],
      anonymousVisitorId: input.anonymousVisitorId ?? null,
    });
    return this.hydrateCard((result.data as { card?: unknown }).card);
  }

  async getAnswerCard(cardId: string): Promise<AnswerCardItem> {
    const callable = httpsCallable(this.requireFunctions(), 'getAnswerCard');
    const result = await callable({ cardId });
    return this.hydrateCard((result.data as { card?: unknown }).card);
  }

  async likeAnswerCard(cardId: string, visitorId: string): Promise<{ liked: boolean; likeCount: number }> {
    const callable = httpsCallable(this.requireFunctions(), 'likeAnswerCard');
    const result = await callable({ cardId, visitorId });
    const data = result.data as Record<string, unknown>;
    return {
      liked: data['liked'] === true,
      likeCount: Number(data['likeCount'] ?? 0) || 0,
    };
  }

  async createTravelCardShare(input: CreateTravelCardShareInput): Promise<{ id: string; url: string }> {
    const callable = httpsCallable(this.requireFunctions(), 'createTravelCardShare');
    const result = await callable({
      card: input.card,
      atlasId: input.atlasId ?? null,
      atlasName: input.atlasName ?? null,
      guideTitle: input.guideTitle ?? null,
      guideSummary: input.guideSummary ?? null,
      question: input.question ?? null,
      threadId: input.threadId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
    });
    const share = (result.data as { share?: unknown }).share;
    if (!share || typeof share !== 'object') {
      throw new Error('Travel card share response was invalid.');
    }
    const data = share as Record<string, unknown>;
    const id = typeof data['id'] === 'string' ? data['id'] : '';
    const url = typeof data['url'] === 'string' ? data['url'] : '';
    if (!id || !url) {
      throw new Error('Travel card share response was invalid.');
    }
    return { id, url };
  }

  private hydrateCard(value: unknown): AnswerCardItem {
    if (!value || typeof value !== 'object') {
      throw new Error('Answer card response was invalid.');
    }

    const data = value as Record<string, unknown>;
    return {
      id: String(data['id'] ?? ''),
      atlasId: typeof data['atlasId'] === 'string' ? data['atlasId'] : null,
      atlasName: typeof data['atlasName'] === 'string' ? data['atlasName'] : null,
      question: String(data['question'] ?? ''),
      answerPreview: String(data['answerPreview'] ?? ''),
      title: String(data['title'] ?? 'A Philly Answer Worth Sharing'),
      subtitle: String(data['subtitle'] ?? 'A fast, shareable summary from LivingWiki Philly.'),
      keyFacts: this.hydrateStringList(data['keyFacts'], 5),
      didYouKnow: this.hydrateStringList(data['didYouKnow'], 3),
      mappableLocations: this.hydrateLocations(data['mappableLocations']),
      likeCount: Number(data['likeCount'] ?? 0) || 0,
      sourceThreadId: typeof data['sourceThreadId'] === 'string' ? data['sourceThreadId'] : null,
      sourceAnswerMode:
        data['sourceAnswerMode'] === 'wiki' || data['sourceAnswerMode'] === 'internet'
          ? data['sourceAnswerMode']
          : null,
      createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : null,
      updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] : null,
    };
  }

  private hydrateStringList(value: unknown, limit: number): string[] {
    return Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, limit)
      : [];
  }

  private hydrateLocations(value: unknown): MappableLocation[] {
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
          address_hint: typeof data['address_hint'] === 'string' ? data['address_hint'].trim() : null,
        };
      })
      .filter((location): location is MappableLocation => !!location);
  }

  private requireFunctions() {
    if (!this.functions) {
      throw new Error('Firebase Functions is unavailable in this environment.');
    }
    return this.functions;
  }
}
