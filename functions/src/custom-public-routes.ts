import { FieldValue } from 'firebase-admin/firestore';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './firebase';

export type CustomPublicRouteResourceType = 'board' | 'collection';

const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'boards', 'collections', 'create', 'edit', 'fr', 'friends', 'go',
  'ja', 'new', 'share', 'sign-in', 'songs', 'trips', 'u', 'upload',
]);

export function normalizeCustomPublicRouteSlug(value: unknown): string {
  return typeof value === 'string'
    ? value
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLUG_LENGTH)
    : '';
}

export function customPublicRouteSlugError(value: unknown): string | null {
  const slug = normalizeCustomPublicRouteSlug(value);
  if (slug.length < MIN_SLUG_LENGTH) return `Use at least ${MIN_SLUG_LENGTH} letters or numbers.`;
  if (slug.length > MAX_SLUG_LENGTH) return `Use no more than ${MAX_SLUG_LENGTH} characters.`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'Use letters, numbers, and single hyphens only.';
  if (UUID_PATTERN.test(slug)) return 'Choose a name instead of a system-style ID.';
  if (RESERVED_SLUGS.has(slug)) return 'That name is reserved by LivingWiki.';
  return null;
}

export function publicBoardRouteKey(boardIdValue: unknown, customSlugValue: unknown): string {
  const boardId = typeof boardIdValue === 'string' ? boardIdValue.trim().slice(0, 180) : '';
  const customSlug = normalizeCustomPublicRouteSlug(customSlugValue);
  return customSlug && customPublicRouteSlugError(customSlug) === null ? customSlug : boardId;
}

function hasActivePaidPlan(profile: Record<string, unknown> | undefined): boolean {
  const plan = String(profile?.['pricingPlan'] ?? profile?.['pricing_plan'] ?? '').trim().toLowerCase();
  const status = String(profile?.['subscriptionStatus'] ?? profile?.['subscription_status'] ?? '').trim().toLowerCase();
  return ['personal_plus', 'creator', 'explorer', 'lifetime'].includes(plan)
    && ['active', 'trialing', 'paid'].includes(status);
}

function resourceConfiguration(type: CustomPublicRouteResourceType): {
  resourceCollection: 'boards' | 'board_collections';
  routeCollection: 'public_board_routes' | 'public_collection_routes';
  pathPrefix: '/boards/' | '/collections/';
} {
  return type === 'board'
    ? { resourceCollection: 'boards', routeCollection: 'public_board_routes', pathPrefix: '/boards/' }
    : { resourceCollection: 'board_collections', routeCollection: 'public_collection_routes', pathPrefix: '/collections/' };
}

function resourceType(value: unknown): CustomPublicRouteResourceType | null {
  return value === 'board' || value === 'collection' ? value : null;
}

export const setCustomPublicUrl = onCall(
  { region: 'us-central1', timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError('unauthenticated', 'Sign in to set a custom URL.');

    const type = resourceType(request.data?.resourceType);
    const resourceId = typeof request.data?.resourceId === 'string'
      ? request.data.resourceId.trim().slice(0, 180)
      : '';
    const slug = normalizeCustomPublicRouteSlug(request.data?.slug);
    if (!type || !resourceId) throw new HttpsError('invalid-argument', 'Choose a board or collection.');
    const validationError = customPublicRouteSlugError(slug);
    if (validationError) throw new HttpsError('invalid-argument', validationError);

    const profileSnapshot = await db.collection('users').doc(userId).get();
    const profile = profileSnapshot.data() as Record<string, unknown> | undefined;
    if (profile?.['role'] !== 'admin' && !hasActivePaidPlan(profile)) {
      throw new HttpsError('permission-denied', 'An active paid membership is required to set a custom URL.');
    }

    const configuration = resourceConfiguration(type);
    const resourceReference = db.collection(configuration.resourceCollection).doc(resourceId);
    const routeReference = db.collection(configuration.routeCollection).doc(slug);
    const collidingResourceReference = db.collection(configuration.resourceCollection).doc(slug);

    await db.runTransaction(async (transaction) => {
      const [resourceSnapshot, routeSnapshot, collidingResourceSnapshot] = await Promise.all([
        transaction.get(resourceReference),
        transaction.get(routeReference),
        transaction.get(collidingResourceReference),
      ]);
      if (!resourceSnapshot.exists) throw new HttpsError('not-found', `This ${type} could not be found.`);
      const resource = resourceSnapshot.data() as Record<string, unknown>;
      if (profile?.['role'] !== 'admin' && resource['owner_user_id'] !== userId) {
        throw new HttpsError('permission-denied', `Only the ${type} owner can set its custom URL.`);
      }
      if (resource['visibility'] !== 'public') {
        throw new HttpsError('failed-precondition', `Make this ${type} public before setting a custom URL.`);
      }
      if (collidingResourceSnapshot.exists && collidingResourceSnapshot.id !== resourceId) {
        throw new HttpsError('already-exists', 'That custom URL is already taken.');
      }
      if (routeSnapshot.exists && routeSnapshot.data()?.['target_id'] !== resourceId) {
        throw new HttpsError('already-exists', 'That custom URL is already taken.');
      }

      const previousSlug = normalizeCustomPublicRouteSlug(resource['custom_slug']);
      if (previousSlug && previousSlug !== slug) {
        const previousReference = db.collection(configuration.routeCollection).doc(previousSlug);
        transaction.set(previousReference, {
          slug: previousSlug,
          resource_type: type,
          target_id: resourceId,
          owner_user_id: String(resource['owner_user_id'] ?? userId),
          primary: false,
          updated_at: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      transaction.set(routeReference, {
        slug,
        resource_type: type,
        target_id: resourceId,
        owner_user_id: String(resource['owner_user_id'] ?? userId),
        primary: true,
        created_at: routeSnapshot.exists
          ? routeSnapshot.data()?.['created_at'] ?? FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.update(resourceReference, {
        custom_slug: slug,
        updated_at_iso: new Date().toISOString(),
        server_updated_at: FieldValue.serverTimestamp(),
      });
    });

    return {
      resourceType: type,
      resourceId,
      slug,
      path: `${configuration.pathPrefix}${encodeURIComponent(slug)}`,
    };
  },
);

async function deleteRoutesForTarget(
  routeCollection: 'public_board_routes' | 'public_collection_routes',
  targetId: string,
): Promise<void> {
  const snapshot = await db.collection(routeCollection).where('target_id', '==', targetId).get();
  if (snapshot.empty) return;
  const batch = db.batch();
  snapshot.docs.forEach((route) => batch.delete(route.ref));
  await batch.commit();
}

export const cleanupDeletedBoardPublicRoutes = onDocumentDeleted(
  { document: 'boards/{resourceId}', region: 'us-central1' },
  async (event) => deleteRoutesForTarget('public_board_routes', event.params.resourceId),
);

export const cleanupDeletedCollectionPublicRoutes = onDocumentDeleted(
  { document: 'board_collections/{resourceId}', region: 'us-central1' },
  async (event) => deleteRoutesForTarget('public_collection_routes', event.params.resourceId),
);
