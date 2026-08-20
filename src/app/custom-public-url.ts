import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseFirestore, getFirebaseFunctions } from './firebase.client';

export type CustomPublicUrlResourceType = 'board' | 'collection';

export const CUSTOM_PUBLIC_URL_MIN_LENGTH = 3;
export const CUSTOM_PUBLIC_URL_MAX_LENGTH = 60;

const RESERVED_CUSTOM_PUBLIC_URLS = new Set([
  'admin',
  'api',
  'boards',
  'collections',
  'create',
  'edit',
  'fr',
  'friends',
  'go',
  'ja',
  'new',
  'share',
  'sign-in',
  'songs',
  'trips',
  'u',
  'upload',
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeCustomPublicUrlSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CUSTOM_PUBLIC_URL_MAX_LENGTH);
}

export function customPublicUrlSlugError(value: string): string | null {
  const slug = normalizeCustomPublicUrlSlug(value);
  if (slug.length < CUSTOM_PUBLIC_URL_MIN_LENGTH) {
    return `Use at least ${CUSTOM_PUBLIC_URL_MIN_LENGTH} letters or numbers.`;
  }
  if (slug.length > CUSTOM_PUBLIC_URL_MAX_LENGTH) {
    return `Use no more than ${CUSTOM_PUBLIC_URL_MAX_LENGTH} characters.`;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return 'Use letters, numbers, and single hyphens only.';
  }
  if (UUID_PATTERN.test(slug)) {
    return 'Choose a name instead of a system-style ID.';
  }
  if (RESERVED_CUSTOM_PUBLIC_URLS.has(slug)) {
    return 'That name is reserved by LivingWiki.';
  }
  return null;
}

export function customPublicUrlPath(type: CustomPublicUrlResourceType, slug: string): string {
  return type === 'board'
    ? `/boards/${encodeURIComponent(slug)}`
    : `/collections/${encodeURIComponent(slug)}`;
}

export function customPublicUrlRouteCollection(type: CustomPublicUrlResourceType): string {
  return type === 'board' ? 'public_board_routes' : 'public_collection_routes';
}

export type SetCustomPublicUrlResult = {
  resourceType: CustomPublicUrlResourceType;
  resourceId: string;
  slug: string;
  path: string;
};

@Injectable({ providedIn: 'root' })
export class CustomPublicUrlService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly firestore: Firestore | null = this.isBrowser ? getFirebaseFirestore() : null;
  private readonly functions: Functions | null = this.isBrowser ? getFirebaseFunctions() : null;

  async isAvailable(
    type: CustomPublicUrlResourceType,
    slug: string,
    resourceId: string,
  ): Promise<boolean> {
    const normalized = normalizeCustomPublicUrlSlug(slug);
    if (!this.firestore || customPublicUrlSlugError(normalized)) return false;
    const snapshot = await getDoc(doc(this.firestore, customPublicUrlRouteCollection(type), normalized));
    if (!snapshot.exists()) return true;
    return snapshot.data()['target_id'] === resourceId;
  }

  async set(
    type: CustomPublicUrlResourceType,
    resourceId: string,
    slug: string,
  ): Promise<SetCustomPublicUrlResult> {
    if (!this.functions) throw new Error('Custom URLs are not available on this device.');
    const callable = httpsCallable<
      { resourceType: CustomPublicUrlResourceType; resourceId: string; slug: string },
      SetCustomPublicUrlResult
    >(this.functions, 'setCustomPublicUrl');
    return (await callable({ resourceType: type, resourceId, slug })).data;
  }
}
