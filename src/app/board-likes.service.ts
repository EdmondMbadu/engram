import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from './firebase.client';

export type BoardLikeTarget = {
  boardId: string;
  cardId?: string;
};

export type BoardLikeMetric = BoardLikeTarget & {
  liked: boolean;
  likeCount: number;
};

const VISITOR_ID_STORAGE_KEY = 'living-wiki:content-like-visitor-id';

export function boardLikeTargetKey(target: BoardLikeTarget): string {
  return target.cardId
    ? `card:${target.boardId}:${target.cardId}`
    : `board:${target.boardId}`;
}

@Injectable({ providedIn: 'root' })
export class BoardLikesService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;

  async getMetrics(targets: BoardLikeTarget[]): Promise<BoardLikeMetric[]> {
    if (!this.functions || !targets.length) return [];

    const uniqueTargets = [...new Map(
      targets.map((target) => [boardLikeTargetKey(target), target]),
    ).values()];
    const metrics: BoardLikeMetric[] = [];
    for (let index = 0; index < uniqueTargets.length; index += 100) {
      const callable = httpsCallable(this.functions, 'getBoardLikeMetrics');
      const result = await callable({
        targets: uniqueTargets.slice(index, index + 100),
        visitorId: this.visitorId(),
      });
      const data = result.data as { metrics?: unknown };
      if (!Array.isArray(data.metrics)) continue;
      data.metrics.forEach((value) => {
        const metric = this.metricFromUnknown(value);
        if (metric) metrics.push(metric);
      });
    }
    return metrics;
  }

  async toggle(target: BoardLikeTarget): Promise<BoardLikeMetric> {
    if (!this.functions) throw new Error('Likes are unavailable outside the browser.');
    const callable = httpsCallable(this.functions, 'toggleBoardLike');
    const result = await callable({ ...target, visitorId: this.visitorId() });
    const metric = this.metricFromUnknown(result.data);
    if (!metric) throw new Error('The like response was invalid.');
    return metric;
  }

  private metricFromUnknown(value: unknown): BoardLikeMetric | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    const boardId = typeof data['boardId'] === 'string' ? data['boardId'] : '';
    const cardId = typeof data['cardId'] === 'string' && data['cardId'] ? data['cardId'] : undefined;
    if (!boardId) return null;
    return {
      boardId,
      ...(cardId ? { cardId } : {}),
      liked: data['liked'] === true,
      likeCount: Math.max(0, Math.trunc(Number(data['likeCount'] ?? 0) || 0)),
    };
  }

  private visitorId(): string {
    if (!this.isBrowser) return 'server-render';
    const existing = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY)?.trim();
    if (existing) return existing;
    const created = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, created);
    return created;
  }
}
