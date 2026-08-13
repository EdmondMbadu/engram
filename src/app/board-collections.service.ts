import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import type { CityBoardListing } from './city-board-listings.service';
import { getFirebaseFirestore } from './firebase.client';

export const BOARD_COLLECTION_MAX_BOARDS = 50;

export type BoardCollectionChoice = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  icon: string;
  tone: string;
  kind: string;
  cardCount: number;
};

export type BoardCollection = {
  id: string;
  slug: string;
  ownerUserId: string;
  ownerPublicSlug: string;
  ownerDisplayName: string;
  ownerPhotoUrl: string;
  ownerProfileIcon: string;
  ownerProfilePictureType: 'icon' | 'image' | null;
  visibility: 'public';
  title: string;
  description: string;
  boardIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateBoardCollectionInput = {
  title: string;
  description: string;
  choices: BoardCollectionChoice[];
  ownerPublicSlug: string;
  ownerDisplayName: string;
  ownerPhotoUrl: string;
  ownerProfileIcon: string;
  ownerProfilePictureType: 'icon' | 'image' | null;
};

export type LoadedBoardCollection = {
  collection: BoardCollection;
  boards: CityBoardListing[];
};

export function boardCollectionSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'collection';
}

export function boardCollectionOwnerParts(ownerKey: string): { uid: string; slug: string } {
  let decoded = ownerKey.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the original route value when it is not URI encoded.
  }
  const separator = decoded.lastIndexOf('~');
  const uid = separator >= 0 ? decoded.slice(separator + 1).trim() : '';
  const handle = (separator >= 0 ? decoded.slice(0, separator) : decoded).trim();
  return { uid, slug: boardCollectionSlug(handle) };
}

function stringValue(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => stringValue(item, maxLength))
    .filter(Boolean))]
    .slice(0, maxItems);
}

function dateValue(value: unknown): string {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return (value.toDate as () => Date)().toISOString();
  }
  return '';
}

export function boardCollectionFromData(id: string, value: unknown): BoardCollection | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const ownerUserId = stringValue(data['owner_user_id'], 180);
  const ownerPublicSlug = stringValue(data['owner_public_slug'], 80);
  const slug = stringValue(data['slug'], 80);
  const title = stringValue(data['title'], 100);
  const boardIds = stringList(data['board_ids'], BOARD_COLLECTION_MAX_BOARDS, 180);
  if (!id || !ownerUserId || !ownerPublicSlug || !slug || !title || !boardIds.length) return null;
  if (data['visibility'] !== 'public') return null;
  return {
    id,
    slug,
    ownerUserId,
    ownerPublicSlug,
    ownerDisplayName: stringValue(data['owner_display_name'], 120) || 'LivingWiki curator',
    ownerPhotoUrl: stringValue(data['owner_photo_url'], 2_000),
    ownerProfileIcon: stringValue(data['owner_profile_icon'], 64),
    ownerProfilePictureType: data['owner_profile_picture_type'] === 'image' || data['owner_profile_picture_type'] === 'icon'
      ? data['owner_profile_picture_type']
      : null,
    visibility: 'public',
    title,
    description: stringValue(data['description'], 280),
    boardIds,
    createdAt: dateValue(data['created_at_iso']) || dateValue(data['server_updated_at']),
    updatedAt: dateValue(data['updated_at_iso']) || dateValue(data['server_updated_at']),
  };
}

@Injectable({ providedIn: 'root' })
export class BoardCollectionsService {
  private readonly authService = inject(AuthService);
  private readonly firestore: Firestore | null = isPlatformBrowser(inject(PLATFORM_ID))
    ? getFirebaseFirestore()
    : null;

  async create(input: CreateBoardCollectionInput): Promise<BoardCollection> {
    const uid = this.authService.uid();
    if (!uid || !this.firestore) throw new Error('Sign in to create a collection.');
    const choices = input.choices.slice(0, BOARD_COLLECTION_MAX_BOARDS);
    if (!choices.length) throw new Error('Choose at least one board.');
    const title = stringValue(input.title, 100);
    if (!title) throw new Error('Give your collection a name.');
    const ownerPublicSlug = boardCollectionSlug(input.ownerPublicSlug);
    const slug = await this.availableSlug(uid, boardCollectionSlug(title));
    const reference = doc(collection(this.firestore, 'board_collections'));
    const now = new Date().toISOString();
    const data = {
      id: reference.id,
      slug,
      owner_user_id: uid,
      owner_public_slug: ownerPublicSlug,
      owner_display_name: stringValue(input.ownerDisplayName, 120) || 'LivingWiki curator',
      owner_photo_url: stringValue(input.ownerPhotoUrl, 2_000),
      owner_profile_icon: stringValue(input.ownerProfileIcon, 64),
      owner_profile_picture_type: input.ownerProfilePictureType,
      visibility: 'public' as const,
      title,
      description: stringValue(input.description, 280),
      board_ids: [...new Set(choices.map((choice) => choice.id.trim()).filter(Boolean))],
      created_at_iso: now,
      updated_at_iso: now,
      server_updated_at: serverTimestamp(),
    };
    await setDoc(reference, data);
    const created = boardCollectionFromData(reference.id, data);
    if (!created) throw new Error('The collection could not be saved.');
    return created;
  }

  async listPublicForOwner(ownerKey: string): Promise<BoardCollection[]> {
    if (!this.firestore) return [];
    const { uid, slug } = boardCollectionOwnerParts(ownerKey);
    if (!uid && !slug) return [];
    const snapshot = await getDocs(query(
      collection(this.firestore, 'board_collections'),
      where(uid ? 'owner_user_id' : 'owner_public_slug', '==', uid || slug),
      where('visibility', '==', 'public'),
      limit(100),
    ));
    return snapshot.docs
      .map((item) => boardCollectionFromData(item.id, item.data()))
      .filter((item): item is BoardCollection => !!item)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title));
  }

  async getPublic(ownerKey: string, collectionSlug: string): Promise<LoadedBoardCollection | null> {
    if (!this.firestore) return null;
    const { uid, slug: ownerSlug } = boardCollectionOwnerParts(ownerKey);
    const slug = boardCollectionSlug(collectionSlug);
    if ((!uid && !ownerSlug) || !slug) return null;
    const snapshot = await getDocs(query(
      collection(this.firestore, 'board_collections'),
      where(uid ? 'owner_user_id' : 'owner_public_slug', '==', uid || ownerSlug),
      where('slug', '==', slug),
      where('visibility', '==', 'public'),
      limit(1),
    ));
    const document = snapshot.docs[0];
    const result = document ? boardCollectionFromData(document.id, document.data()) : null;
    if (!result) return null;
    const boards = (await Promise.all(result.boardIds.map(async (boardId, index) => {
      try {
        const boardSnapshot = await getDoc(doc(this.firestore!, 'boards', boardId));
        if (!boardSnapshot.exists()) return null;
        return this.boardListing(boardSnapshot.id, boardSnapshot.data(), result, index);
      } catch {
        return null;
      }
    }))).filter((board): board is CityBoardListing => !!board);
    return { collection: result, boards };
  }

  private async availableSlug(uid: string, base: string): Promise<string> {
    if (!this.firestore) return base;
    for (let suffix = 1; suffix <= 100; suffix += 1) {
      const candidate = suffix === 1 ? base : `${base.slice(0, Math.max(1, 78 - String(suffix).length))}-${suffix}`;
      const existing = await getDocs(query(
        collection(this.firestore, 'board_collections'),
        where('owner_user_id', '==', uid),
        where('slug', '==', candidate),
        limit(1),
      ));
      if (existing.empty) return candidate;
    }
    return `${base.slice(0, 65)}-${Date.now().toString(36)}`;
  }

  private boardListing(
    id: string,
    value: Record<string, unknown>,
    boardCollection: BoardCollection,
    index: number,
  ): CityBoardListing | null {
    if (value['visibility'] !== 'public' || value['owner_user_id'] !== boardCollection.ownerUserId) return null;
    const title = stringValue(value['title'], 100);
    if (!title) return null;
    const cards = Array.isArray(value['cards']) ? value['cards'] : [];
    const topicIds = [...new Set(cards.flatMap((card) => {
      if (!card || typeof card !== 'object') return [];
      return stringList((card as Record<string, unknown>)['tags'], 6, 64);
    }))].slice(0, 12);
    return {
      id,
      atlasId: '',
      title,
      description: stringValue(value['description'], 280),
      icon: stringValue(value['icon'], 64) || 'dashboard_customize',
      tone: stringValue(value['tone'], 24) || 'teal',
      imageUrl: stringValue(value['imageUrl'], 2_000),
      kind: stringValue(value['kind'], 40) || 'standard',
      cardCount: cards.length,
      publisherName: stringValue(value['owner_display_name'], 100) || boardCollection.ownerDisplayName,
      templateId: '',
      categoryId: '',
      topicIds,
      featuredRank: index,
      approvedAt: null,
      updatedAt: dateValue(value['updated_at_iso']) || null,
    };
  }
}
