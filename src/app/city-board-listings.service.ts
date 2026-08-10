import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { collection, getDocs, limit, query, where, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseFirestore, getFirebaseFunctions } from './firebase.client';

export type CityBoardListing = {
  id: string;
  atlasId: string;
  title: string;
  description: string;
  icon: string;
  tone: string;
  imageUrl: string;
  kind: string;
  cardCount: number;
  publisherName: string;
  featuredRank: number;
  approvedAt: string | null;
  updatedAt: string | null;
};

function stringValue(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function dateValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return (value.toDate as () => Date)().toISOString();
  }
  return null;
}

export function cityBoardListingFromData(id: string, value: unknown): CityBoardListing | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    data['visibility'] !== 'public'
    || data['editorial_status'] !== 'published'
    || data['city_listing_status'] !== 'listed'
  ) {
    return null;
  }
  const boardId = stringValue(data['board_id'], 180);
  const atlasId = stringValue(data['atlas_id'], 180);
  const title = stringValue(data['title'], 100);
  if (!boardId || !atlasId || !title) return null;
  const rank = typeof data['featured_rank'] === 'number' ? Math.trunc(data['featured_rank']) : 9_999;
  return {
    id: boardId || id,
    atlasId,
    title,
    description: stringValue(data['description'], 280),
    icon: stringValue(data['icon'], 64) || 'dashboard_customize',
    tone: stringValue(data['tone'], 24) || 'teal',
    imageUrl: stringValue(data['image_url'], 2_000),
    kind: stringValue(data['kind'], 40) || 'standard',
    cardCount: Math.max(0, Math.trunc(Number(data['card_count']) || 0)),
    publisherName: stringValue(data['publisher_name'], 100) || 'LivingWiki',
    featuredRank: Number.isFinite(rank) && rank >= 0 ? Math.min(rank, 9_999) : 9_999,
    approvedAt: dateValue(data['approved_at']),
    updatedAt: dateValue(data['updated_at_iso']) || dateValue(data['server_updated_at']),
  };
}

export function sortCityBoardListings(boards: CityBoardListing[]): CityBoardListing[] {
  return [...boards].sort((left, right) => {
    if (left.featuredRank !== right.featuredRank) return left.featuredRank - right.featuredRank;
    const leftDate = Date.parse(left.approvedAt || left.updatedAt || '') || 0;
    const rightDate = Date.parse(right.approvedAt || right.updatedAt || '') || 0;
    if (leftDate !== rightDate) return rightDate - leftDate;
    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
  });
}

@Injectable({ providedIn: 'root' })
export class CityBoardListingsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly firestore: Firestore | null = isPlatformBrowser(this.platformId)
    ? getFirebaseFirestore()
    : null;
  private readonly functions: Functions | null = isPlatformBrowser(this.platformId)
    ? getFirebaseFunctions()
    : null;

  async list(atlasId: string): Promise<CityBoardListing[]> {
    const normalizedAtlasId = atlasId.trim();
    if (!normalizedAtlasId || !this.firestore || !this.functions) return [];
    try {
      const snapshot = await getDocs(query(
        collection(this.firestore, 'city_board_listings'),
        where('atlas_id', '==', normalizedAtlasId),
        limit(100),
      ));
      const projected = this.fromRecords(snapshot.docs.map((document) => ({
        id: document.id,
        data: document.data(),
      })));
      if (projected.length) return projected;
    } catch {
      // Fall through to the callable migration bridge. This also keeps the city
      // page useful during the short rules/functions rollout window.
    }

    const callable = httpsCallable<
      { atlasId: string },
      { boards?: Array<Record<string, unknown>> }
    >(this.functions, 'listPublicCityBoards');
    const result = await callable({ atlasId: normalizedAtlasId });
    return this.fromRecords((result.data.boards ?? []).map((data, index) => ({
      id: String(data['board_id'] ?? index),
      data,
    })));
  }

  private fromRecords(records: Array<{ id: string; data: unknown }>): CityBoardListing[] {
    return sortCityBoardListings(records
      .map((record) => cityBoardListingFromData(record.id, record.data))
      .filter((board): board is CityBoardListing => !!board));
  }
}
