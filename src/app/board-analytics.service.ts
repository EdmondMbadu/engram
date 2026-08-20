import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { logEvent } from 'firebase/analytics';
import { httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseAnalytics, getFirebaseFunctions } from './firebase.client';

export type BoardAnalyticsEventType =
  | 'board_view'
  | 'board_engaged'
  | 'card_open'
  | 'outbound_click'
  | 'board_share'
  | 'custom_link_copy';

export type BoardInsightsRange = 7 | 30 | 90;

export type BoardInsights = {
  board: {
    id: string;
    title: string;
    customSlug: string;
    visibility: 'public' | 'private';
  };
  range: { days: number; from: string; to: string };
  totals: {
    views: number;
    uniqueVisitors: number;
    engagedVisits: number;
    cardOpens: number;
    outboundClicks: number;
    shares: number;
    customLinkCopies: number;
  };
  daily: Array<{
    day: string;
    views: number;
    uniqueVisitors: number;
    engagedVisits: number;
    cardOpens: number;
    outboundClicks: number;
    shares: number;
    customLinkCopies: number;
  }>;
  sources: Array<{ source: string; views: number }>;
  campaigns: Array<{ campaign: string; views: number }>;
  cards: Array<{ cardId: string; title: string; opens: number; outboundClicks: number }>;
  lastUpdatedAt: string;
  definitions: { uniqueVisitors: string; engagedVisits: string };
};

type BoardAnalyticsContext = {
  boardId: string;
  boardTitle: string;
  customSlug: string;
  ownerUserId: string;
  currentUserId: string;
  entryRoute: 'custom' | 'system' | 'previous-alias';
  visitorId: string;
  sessionId: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  referrer: string;
};

function normalizedCampaignPart(value: string, fallback: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || fallback;
}

function trackingMediumForSource(source: string): string {
  const normalized = normalizedCampaignPart(source, 'shared');
  if (normalized === 'email') return 'newsletter';
  if (normalized === 'whatsapp' || normalized === 'text-message') return 'messaging';
  if (normalized === 'qr-code') return 'qr';
  if (normalized === 'partner-website') return 'referral';
  if (['facebook', 'instagram', 'linkedin', 'x-twitter'].includes(normalized)) return 'social';
  return 'shared';
}

export function buildTrackedBoardUrl(
  baseUrl: string,
  source: string,
  campaign: string,
): string {
  const url = new URL(baseUrl);
  const normalizedSource = normalizedCampaignPart(source, 'shared');
  url.searchParams.set('utm_source', normalizedSource);
  url.searchParams.set('utm_medium', trackingMediumForSource(normalizedSource));
  url.searchParams.set('utm_campaign', normalizedCampaignPart(campaign, 'board-share'));
  return url.toString();
}

@Injectable({ providedIn: 'root' })
export class BoardAnalyticsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly functions: Functions | null = this.isBrowser ? getFirebaseFunctions() : null;
  private current: BoardAnalyticsContext | null = null;
  private engagementTimer: ReturnType<typeof setTimeout> | null = null;
  private engagementRecorded = false;
  private lastViewBoardId = '';
  private lastViewAt = 0;

  startBoardSession(input: {
    boardId: string;
    boardTitle: string;
    customSlug: string;
    visibility: 'public' | 'private';
    ownerUserId: string;
    currentUserId: string;
    requestedRouteKey: string;
  }): void {
    if (!this.isBrowser || !this.functions || !input.boardId || input.visibility !== 'public') {
      this.stopBoardSession();
      return;
    }
    if (input.currentUserId && input.currentUserId === input.ownerUserId) {
      this.stopBoardSession();
      return;
    }
    if (this.current?.boardId === input.boardId) return;
    this.stopBoardSession();

    const visitorId = this.clientId('localStorage', 'lw_board_analytics_visitor');
    const sessionId = this.clientId('sessionStorage', 'lw_board_analytics_session');
    const query = new URL(window.location.href).searchParams;
    const requested = input.requestedRouteKey.trim().toLowerCase();
    const currentSlug = input.customSlug.trim().toLowerCase();
    const entryRoute = requested === currentSlug && !!currentSlug
      ? 'custom'
      : /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requested)
        ? 'system'
        : 'previous-alias';
    this.current = {
      ...input,
      entryRoute,
      visitorId,
      sessionId,
      utmSource: query.get('utm_source')?.slice(0, 80) ?? '',
      utmMedium: query.get('utm_medium')?.slice(0, 80) ?? '',
      utmCampaign: query.get('utm_campaign')?.slice(0, 80) ?? '',
      referrer: document.referrer.slice(0, 700),
    };
    this.engagementRecorded = false;

    const now = Date.now();
    if (this.lastViewBoardId !== input.boardId || now - this.lastViewAt > 4_000) {
      this.lastViewBoardId = input.boardId;
      this.lastViewAt = now;
      this.record('board_view');
    }
    this.engagementTimer = setTimeout(() => this.recordEngagementOnce(), 10_000);
  }

  stopBoardSession(): void {
    if (this.engagementTimer) clearTimeout(this.engagementTimer);
    this.engagementTimer = null;
    this.current = null;
    this.engagementRecorded = false;
  }

  trackCardOpen(cardId: string): void {
    this.recordEngagementOnce();
    this.record('card_open', { cardId });
  }

  trackOutboundClick(cardId: string, destinationUrl: string): void {
    this.recordEngagementOnce();
    let destinationHost = '';
    try {
      destinationHost = new URL(destinationUrl, window.location.origin).hostname.slice(0, 120);
    } catch {
      destinationHost = '';
    }
    this.record('outbound_click', { cardId, destinationHost });
  }

  trackShare(kind: 'board_share' | 'custom_link_copy' = 'board_share'): void {
    this.recordEngagementOnce();
    this.record(kind);
  }

  async getInsights(boardId: string, days: BoardInsightsRange): Promise<BoardInsights> {
    if (!this.functions) throw new Error('Board insights are not available on this device.');
    const callable = httpsCallable<{ boardId: string; days: number }, BoardInsights>(
      this.functions,
      'getBoardInsights',
    );
    return (await callable({ boardId, days })).data;
  }

  private recordEngagementOnce(): void {
    if (!this.current || this.engagementRecorded) return;
    this.engagementRecorded = true;
    if (this.engagementTimer) clearTimeout(this.engagementTimer);
    this.engagementTimer = null;
    this.record('board_engaged');
  }

  private record(
    eventType: BoardAnalyticsEventType,
    extra: { cardId?: string; destinationHost?: string } = {},
    mirror = true,
  ): void {
    const context = this.current;
    if (!context || !this.functions) return;
    const eventId = this.randomId();
    const payload = {
      boardId: context.boardId,
      eventId,
      visitorId: context.visitorId,
      sessionId: context.sessionId,
      eventType,
      entryRoute: context.entryRoute,
      utmSource: context.utmSource,
      utmMedium: context.utmMedium,
      utmCampaign: context.utmCampaign,
      referrer: context.referrer,
      ...extra,
    };
    const callable = httpsCallable<typeof payload, { accepted?: boolean }>(
      this.functions,
      'recordBoardAnalyticsEvent',
    );
    void callable(payload).catch(() => undefined);
    if (mirror) {
      void getFirebaseAnalytics().then((analytics) => {
        if (!analytics) return;
        logEvent(analytics, eventType, {
          board_id: context.boardId,
          board_slug: context.customSlug,
          entry_route: context.entryRoute,
          card_id: extra.cardId ?? '',
          traffic_source: context.utmSource || 'referral',
          campaign: context.utmCampaign,
        });
      }).catch(() => undefined);
    }
  }

  private clientId(storageName: 'localStorage' | 'sessionStorage', key: string): string {
    try {
      const storage = window[storageName];
      const existing = storage.getItem(key);
      if (existing && /^[A-Za-z0-9_-]{12,100}$/.test(existing)) return existing;
      const created = this.randomId();
      storage.setItem(key, created);
      return created;
    } catch {
      return this.randomId();
    }
  }

  private randomId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '');
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }
}
