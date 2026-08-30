import { createHash } from 'node:crypto';
import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './firebase';

export const BOARD_ANALYTICS_SHARD_COUNT = 8;
export const BOARD_ANALYTICS_EVENT_TYPES = [
  'board_view',
  'board_engaged',
  'card_open',
  'outbound_click',
  'board_share',
  'custom_link_copy',
  'talking_card_open',
  'talking_card_message',
  'talking_card_voice_start',
  'talking_card_voice_end',
] as const;

export type BoardAnalyticsEventType = typeof BOARD_ANALYTICS_EVENT_TYPES[number];
export type BoardAnalyticsSource =
  | 'direct'
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'x-twitter'
  | 'whatsapp'
  | 'qr-code'
  | 'partner-website'
  | 'google'
  | 'livingwiki'
  | 'email'
  | 'other';

type NumericMap = Record<string, number>;

const VALID_RANGES = new Set([7, 30, 90]);
const BOT_PATTERN = /(?:bot|crawler|spider|slurp|headless|preview|facebookexternalhit|whatsapp|telegrambot|discordbot|linkedinbot)/i;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,180}$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{12,100}$/;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function safeUrl(value: unknown, maxLength = 700): URL | null {
  const text = cleanText(value, maxLength);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function analyticsDay(value: Date = new Date()): string {
  return value.toISOString().slice(0, 10);
}

export function analyticsDateKeys(days: number, end: Date = new Date()): string[] {
  const count = VALID_RANGES.has(days) ? days : 30;
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Array.from({ length: count }, (_, index) =>
    new Date(endUtc - (count - index - 1) * 86_400_000).toISOString().slice(0, 10));
}

export function normalizeAnalyticsCampaign(value: unknown): string {
  return cleanText(value, 80)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function classifyBoardAnalyticsSource(
  utmSourceValue: unknown,
  utmMediumValue: unknown,
  referrerValue: unknown,
): BoardAnalyticsSource {
  const utmSource = cleanText(utmSourceValue, 80).toLowerCase();
  const utmMedium = cleanText(utmMediumValue, 80).toLowerCase();
  const referrer = safeUrl(referrerValue)?.hostname.toLowerCase() ?? '';
  const signal = `${utmSource} ${utmMedium} ${referrer}`;
  if (/instagram/.test(signal)) return 'instagram';
  if (/facebook|fb\.com|threads/.test(signal)) return 'facebook';
  if (/linkedin/.test(signal)) return 'linkedin';
  if (/(?:^|\s)(?:x-twitter|twitter|x\.com)(?:\s|$)/.test(signal)) return 'x-twitter';
  if (/whatsapp|text-message|messaging/.test(signal)) return 'whatsapp';
  if (/qr-code|\sqr\s/.test(` ${signal} `)) return 'qr-code';
  if (/partner-website/.test(signal)) return 'partner-website';
  if (/google|bing|duckduckgo|yahoo|search/.test(signal)) return 'google';
  if (/email|newsletter|mail/.test(signal)) return 'email';
  if (/livingwiki|living-wiki|localhost|127\.0\.0\.1/.test(signal)) return 'livingwiki';
  if (!utmSource && !referrer) return 'direct';
  return 'other';
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function mergeNumericMap(target: NumericMap, value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    target[key] = (target[key] ?? 0) + numeric(raw);
  }
}

function eventType(value: unknown): BoardAnalyticsEventType | null {
  return BOARD_ANALYTICS_EVENT_TYPES.includes(value as BoardAnalyticsEventType)
    ? value as BoardAnalyticsEventType
    : null;
}

function eventCounter(type: BoardAnalyticsEventType): string {
  switch (type) {
    case 'board_view': return 'views';
    case 'board_engaged': return 'engaged_visits';
    case 'card_open': return 'card_opens';
    case 'outbound_click': return 'outbound_clicks';
    case 'board_share': return 'shares';
    case 'custom_link_copy': return 'custom_link_copies';
    case 'talking_card_open': return 'talking_card_opens';
    case 'talking_card_message': return 'talking_card_messages';
    case 'talking_card_voice_start': return 'talking_card_voice_starts';
    case 'talking_card_voice_end': return 'talking_card_voice_ends';
  }
}

function mapIncrement(key: string): Record<string, unknown> {
  return { [key]: FieldValue.increment(1) };
}

function cardMapIncrement(cardKey: string, counter: string): Record<string, unknown> {
  return { [cardKey]: { [counter]: FieldValue.increment(1) } };
}

async function readReferences(references: DocumentReference[]): Promise<Awaited<ReturnType<typeof db.getAll>>> {
  const batches: DocumentReference[][] = [];
  for (let index = 0; index < references.length; index += 200) {
    batches.push(references.slice(index, index + 200));
  }
  const snapshots = await Promise.all(batches.map((batch) => db.getAll(...batch)));
  return snapshots.flat() as Awaited<ReturnType<typeof db.getAll>>;
}

export const recordBoardAnalyticsEvent = onCall(
  { region: 'us-central1', timeoutSeconds: 15, memory: '256MiB', cors: true },
  async (request) => {
    const boardId = cleanText(request.data?.boardId, 180);
    const eventId = cleanText(request.data?.eventId, 100);
    const visitorId = cleanText(request.data?.visitorId, 100);
    const sessionId = cleanText(request.data?.sessionId, 100);
    const type = eventType(request.data?.eventType);
    if (!RESOURCE_ID_PATTERN.test(boardId)
      || !CLIENT_ID_PATTERN.test(eventId)
      || !CLIENT_ID_PATTERN.test(visitorId)
      || !CLIENT_ID_PATTERN.test(sessionId)
      || !type) {
      throw new HttpsError('invalid-argument', 'The analytics event is invalid.');
    }

    const userAgent = cleanText(request.rawRequest.headers['user-agent'], 500);
    if (!userAgent || BOT_PATTERN.test(userAgent)) return { accepted: false, reason: 'automated' };

    const boardSnapshot = await db.collection('boards').doc(boardId).get();
    if (!boardSnapshot.exists) throw new HttpsError('not-found', 'The board could not be found.');
    const board = boardSnapshot.data() as Record<string, unknown>;
    if (board['visibility'] !== 'public') return { accepted: false, reason: 'private' };
    if (request.auth?.uid && request.auth.uid === board['owner_user_id']) {
      return { accepted: false, reason: 'owner' };
    }

    const day = analyticsDay();
    const source = classifyBoardAnalyticsSource(
      request.data?.utmSource,
      request.data?.utmMedium,
      request.data?.referrer,
    );
    const campaign = normalizeAnalyticsCampaign(request.data?.utmCampaign);
    const cardId = cleanText(request.data?.cardId, 180);
    const cardKey = cardId && RESOURCE_ID_PATTERN.test(cardId) ? cardId : '';
    const counter = eventCounter(type);
    const eventReceiptId = sha256(`${boardId}:${eventId}`);
    const uniqueReceiptId = sha256(`${boardId}:${day}:${visitorId}`);
    const rateIdentity = cleanText(request.rawRequest.ip, 120) || visitorId;
    const rateId = sha256(`${boardId}:${day}:${rateIdentity}`);
    const shard = Number.parseInt(sha256(`${visitorId}:${eventId}`).slice(0, 8), 16) % BOARD_ANALYTICS_SHARD_COUNT;
    const receiptReference = db.collection('board_analytics_event_receipts').doc(eventReceiptId);
    const uniqueReference = db.collection('board_analytics_unique_receipts').doc(uniqueReceiptId);
    const rateReference = db.collection('board_analytics_rate_limits').doc(rateId);
    const shardReference = db.collection('board_analytics_daily_shards').doc(`${boardId}__${day}__${shard}`);
    const now = Timestamp.now();

    const transactionResult = await db.runTransaction(async (transaction) => {
      const receiptSnapshot = await transaction.get(receiptReference);
      if (receiptSnapshot.exists) return 'duplicate';

      const [rateSnapshot, uniqueSnapshot] = await Promise.all([
        transaction.get(rateReference),
        type === 'board_view' ? transaction.get(uniqueReference) : Promise.resolve(null),
      ]);
      if (numeric(rateSnapshot.data()?.['count']) >= 500) return 'rate_limited';

      transaction.set(rateReference, {
        board_id: boardId,
        day,
        count: FieldValue.increment(1),
        expires_at: Timestamp.fromMillis(now.toMillis() + 3 * 86_400_000),
      }, { merge: true });
      transaction.create(receiptReference, {
        board_id: boardId,
        event_type: type,
        created_at: now,
        expires_at: Timestamp.fromMillis(now.toMillis() + 3 * 86_400_000),
      });

      const isNewVisitor = type === 'board_view' && uniqueSnapshot !== null && !uniqueSnapshot.exists;
      if (isNewVisitor) {
        transaction.create(uniqueReference, {
          board_id: boardId,
          day,
          created_at: now,
          expires_at: Timestamp.fromMillis(now.toMillis() + 400 * 86_400_000),
        });
      }

      const shardUpdate: Record<string, unknown> = {
        board_id: boardId,
        day,
        shard,
        counts: {
          [counter]: FieldValue.increment(1),
          ...(isNewVisitor ? { unique_visitors: FieldValue.increment(1) } : {}),
        },
        sources: type === 'board_view' ? mapIncrement(source) : {},
        campaigns: type === 'board_view' && campaign ? mapIncrement(campaign) : {},
        campaign_labels: type === 'board_view' && campaign ? { [campaign]: campaign } : {},
        cards: cardKey && (type === 'card_open' || type === 'outbound_click' || type.startsWith('talking_card_'))
          ? cardMapIncrement(cardKey, counter)
          : {},
        updated_at: now,
      };
      transaction.set(shardReference, shardUpdate, { merge: true });
      return 'accepted';
    });

    return { accepted: transactionResult === 'accepted', reason: transactionResult };
  },
);

export const getBoardInsights = onCall(
  { region: 'us-central1', timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError('unauthenticated', 'Sign in to view board insights.');
    const boardId = cleanText(request.data?.boardId, 180);
    if (!RESOURCE_ID_PATTERN.test(boardId)) throw new HttpsError('invalid-argument', 'Choose a valid board.');
    const requestedDays = Number(request.data?.days);
    const days = VALID_RANGES.has(requestedDays) ? requestedDays : 30;

    const [boardSnapshot, profileSnapshot] = await Promise.all([
      db.collection('boards').doc(boardId).get(),
      db.collection('users').doc(userId).get(),
    ]);
    if (!boardSnapshot.exists) throw new HttpsError('not-found', 'The board could not be found.');
    const board = boardSnapshot.data() as Record<string, unknown>;
    const isAdmin = profileSnapshot.data()?.['role'] === 'admin';
    if (!isAdmin && board['owner_user_id'] !== userId) {
      throw new HttpsError('permission-denied', 'Only the board owner can view these insights.');
    }

    const dateKeys = analyticsDateKeys(days);
    const references = dateKeys.flatMap((day) =>
      Array.from({ length: BOARD_ANALYTICS_SHARD_COUNT }, (_, shard) =>
        db.collection('board_analytics_daily_shards').doc(`${boardId}__${day}__${shard}`)));
    const snapshots = await readReferences(references);
    const daily = new Map(dateKeys.map((day) => [day, {
      day,
      views: 0,
      uniqueVisitors: 0,
      engagedVisits: 0,
      cardOpens: 0,
      outboundClicks: 0,
      shares: 0,
      customLinkCopies: 0,
      talkingCardOpens: 0,
      talkingCardMessages: 0,
      talkingCardVoiceStarts: 0,
      talkingCardVoiceEnds: 0,
    }]));
    const sources: NumericMap = {};
    const campaigns: NumericMap = {};
    const cards = new Map<string, {
      opens: number;
      outboundClicks: number;
      talkingCardOpens: number;
      talkingCardMessages: number;
      talkingCardVoiceStarts: number;
      talkingCardVoiceEnds: number;
    }>();
    let lastUpdatedAt = '';

    for (const snapshot of snapshots) {
      if (!snapshot.exists) continue;
      const value = snapshot.data() as Record<string, unknown>;
      const day = cleanText(value['day'], 10);
      const row = daily.get(day);
      if (!row) continue;
      const counts = value['counts'] && typeof value['counts'] === 'object'
        ? value['counts'] as Record<string, unknown>
        : {};
      row.views += numeric(counts['views']);
      row.uniqueVisitors += numeric(counts['unique_visitors']);
      row.engagedVisits += numeric(counts['engaged_visits']);
      row.cardOpens += numeric(counts['card_opens']);
      row.outboundClicks += numeric(counts['outbound_clicks']);
      row.shares += numeric(counts['shares']);
      row.customLinkCopies += numeric(counts['custom_link_copies']);
      row.talkingCardOpens += numeric(counts['talking_card_opens']);
      row.talkingCardMessages += numeric(counts['talking_card_messages']);
      row.talkingCardVoiceStarts += numeric(counts['talking_card_voice_starts']);
      row.talkingCardVoiceEnds += numeric(counts['talking_card_voice_ends']);
      mergeNumericMap(sources, value['sources']);
      mergeNumericMap(campaigns, value['campaigns']);
      if (value['cards'] && typeof value['cards'] === 'object') {
        for (const [cardId, rawCard] of Object.entries(value['cards'] as Record<string, unknown>)) {
          const cardCounts = rawCard && typeof rawCard === 'object'
            ? rawCard as Record<string, unknown>
            : {};
          const existing = cards.get(cardId) ?? {
            opens: 0,
            outboundClicks: 0,
            talkingCardOpens: 0,
            talkingCardMessages: 0,
            talkingCardVoiceStarts: 0,
            talkingCardVoiceEnds: 0,
          };
          existing.opens += numeric(cardCounts['card_opens']);
          existing.outboundClicks += numeric(cardCounts['outbound_clicks']);
          existing.talkingCardOpens += numeric(cardCounts['talking_card_opens']);
          existing.talkingCardMessages += numeric(cardCounts['talking_card_messages']);
          existing.talkingCardVoiceStarts += numeric(cardCounts['talking_card_voice_starts']);
          existing.talkingCardVoiceEnds += numeric(cardCounts['talking_card_voice_ends']);
          cards.set(cardId, existing);
        }
      }
      const updatedAt = value['updated_at'];
      if (updatedAt instanceof Timestamp) {
        const iso = updatedAt.toDate().toISOString();
        if (iso > lastUpdatedAt) lastUpdatedAt = iso;
      }
    }

    const totals = [...daily.values()].reduce((total, row) => ({
      views: total.views + row.views,
      uniqueVisitors: total.uniqueVisitors + row.uniqueVisitors,
      engagedVisits: total.engagedVisits + row.engagedVisits,
      cardOpens: total.cardOpens + row.cardOpens,
      outboundClicks: total.outboundClicks + row.outboundClicks,
      shares: total.shares + row.shares,
      customLinkCopies: total.customLinkCopies + row.customLinkCopies,
      talkingCardOpens: total.talkingCardOpens + row.talkingCardOpens,
      talkingCardMessages: total.talkingCardMessages + row.talkingCardMessages,
      talkingCardVoiceStarts: total.talkingCardVoiceStarts + row.talkingCardVoiceStarts,
      talkingCardVoiceEnds: total.talkingCardVoiceEnds + row.talkingCardVoiceEnds,
    }), {
      views: 0,
      uniqueVisitors: 0,
      engagedVisits: 0,
      cardOpens: 0,
      outboundClicks: 0,
      shares: 0,
      customLinkCopies: 0,
      talkingCardOpens: 0,
      talkingCardMessages: 0,
      talkingCardVoiceStarts: 0,
      talkingCardVoiceEnds: 0,
    });
    const boardCards = Array.isArray(board['cards']) ? board['cards'] as Array<Record<string, unknown>> : [];
    const cardTitles = new Map(boardCards.map((card) => [cleanText(card['id'], 180), cleanText(card['title'], 120)]));

    return {
      board: {
        id: boardId,
        title: cleanText(board['title'], 120) || 'Untitled board',
        customSlug: cleanText(board['custom_slug'], 60),
        visibility: board['visibility'] === 'public' ? 'public' : 'private',
      },
      range: { days, from: dateKeys[0], to: dateKeys.at(-1) },
      totals,
      daily: [...daily.values()],
      sources: Object.entries(sources)
        .map(([source, views]) => ({ source, views }))
        .sort((left, right) => right.views - left.views),
      campaigns: Object.entries(campaigns)
        .map(([campaign, views]) => ({ campaign, views }))
        .sort((left, right) => right.views - left.views)
        .slice(0, 20),
      cards: [...cards.entries()]
        .map(([cardId, activity]) => ({ cardId, title: cardTitles.get(cardId) || 'Board card', ...activity }))
        .sort((left, right) =>
          (right.outboundClicks + right.opens + right.talkingCardOpens + right.talkingCardMessages + right.talkingCardVoiceStarts)
          - (left.outboundClicks + left.opens + left.talkingCardOpens + left.talkingCardMessages + left.talkingCardVoiceStarts))
        .slice(0, 50),
      lastUpdatedAt,
      definitions: {
        uniqueVisitors: 'Daily unique browsers summed across the selected period.',
        engagedVisits: 'Visits with at least ten seconds of attention or a board interaction.',
      },
    };
  },
);
