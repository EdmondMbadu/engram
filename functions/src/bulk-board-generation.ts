import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { buildCityPlaceTextSearchRequest } from './city-place-search';
import { scoreGeneratedBoard } from './board-generation-score';
import { db } from './firebase';
import {
  generateBoardWizardBatch,
  type GeneratedBoardWizardBatch,
  type GeneratedBoardWizardCard,
} from './gemini';

export const BULK_BOARD_RUBRIC_VERSION = '1.0';
export const BULK_BOARD_GENERATOR_VERSION = '1.1.0';
export const BULK_BOARD_SYSTEM_OWNER_ID = 'livingwiki-system';
export const BULK_BOARD_SYSTEM_OWNER_SLUG = 'livingwiki';

export type BulkBoardTemplate = {
  id: string;
  version: string;
  titlePattern: string;
  searchQuery: string;
  editorialBrief: string;
  count: number;
  cardTitleMode: 'place' | 'subject';
};

export type BulkBoardCandidate = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
  rating: number | null;
  ratingCount: number;
  photoReference: string;
  googleMapsUrl: string;
  source: 'google_places' | 'livingwiki_reviews';
};

type BulkBoardAtlas = {
  id: string;
  name: string;
  slug: string;
  cityName: string;
  regionName: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
};

type GooglePlacesTextSearchResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    place_id?: string;
    name?: string;
    formatted_address?: string;
    business_status?: string;
    rating?: number;
    user_ratings_total?: number;
    types?: string[];
    photos?: Array<{
      photo_reference?: string;
      width?: number;
      height?: number;
    }>;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
};

type BulkBoardJobRecord = {
  requested_by_user_id?: unknown;
  template?: unknown;
  status?: unknown;
  cancel_requested?: unknown;
  auto_publish?: unknown;
};

const publicFunctionsBaseUrl = 'https://us-central1-living-atlas-7622a.cloudfunctions.net';
const candidateRadiusMeters = 50_000;
const bulkBoardCandidateCacheVersion = 3;
const antiSlopPhrases = [
  'hidden gem',
  'nestled',
  'vibrant',
  'bustling',
  'must-visit',
  'must visit',
  'must-see',
  'must see',
  'foodie paradise',
  'something for everyone',
  'quaint',
  'immerse yourself',
  'look no further',
];
const safeBulkBoardIcons = new Set([
  'dashboard_customize', 'travel_explore', 'location_city', 'location_on', 'restaurant',
  'local_cafe', 'local_bar', 'nightlife', 'beach_access', 'festival', 'hiking',
  'directions_walk', 'directions_car', 'museum', 'history_edu', 'shopping_bag',
  'storefront', 'favorite', 'auto_awesome', 'public', 'sports_handball',
  'sports_basketball', 'sports_soccer', 'sports_football', 'sports_baseball',
  'sports_tennis', 'sports_volleyball', 'fitness_center', 'music_note', 'palette',
  'photo_camera', 'park', 'family_restroom', 'school', 'menu_book', 'theater_comedy',
  'stadium', 'spa', 'pets',
]);

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function finiteNumber(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function slug(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return normalized || fallback;
}

function normalizedCandidateName(value: unknown): string {
  return text(value, 180)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function normalizeBulkBoardIcon(value: unknown, subject = ''): string {
  const requested = text(value, 64)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  const aliased = requested === 'handball'
    ? 'sports_handball'
    : requested === 'food'
      ? 'restaurant'
      : requested === 'coffee'
        ? 'local_cafe'
        : requested === 'travel'
          ? 'travel_explore'
          : requested;
  if (safeBulkBoardIcons.has(aliased)) return aliased;

  const normalizedSubject = subject.toLowerCase();
  if (/\b(handball)\b/.test(normalizedSubject)) return 'sports_handball';
  if (/\b(sport|game|arena|stadium)\b/.test(normalizedSubject)) return 'stadium';
  if (/\b(food|eat|restaurant|dining|cuisine)\b/.test(normalizedSubject)) return 'restaurant';
  if (/\b(coffee|cafe|tea)\b/.test(normalizedSubject)) return 'local_cafe';
  if (/\b(museums?|history|historic|heritage)\b/.test(normalizedSubject)) return 'museum';
  if (/\b(music|song|concert|playlist)\b/.test(normalizedSubject)) return 'music_note';
  if (/\b(shop|shopping|market|boutique)\b/.test(normalizedSubject)) return 'shopping_bag';
  if (/\b(beach|coast|ocean)\b/.test(normalizedSubject)) return 'beach_access';
  if (/\b(hike|hiking|trail|outdoor|nature)\b/.test(normalizedSubject)) return 'hiking';
  if (/\b(trip|tour|travel|visit|itinerary|destination)\b/.test(normalizedSubject)) return 'travel_explore';
  return 'location_city';
}

export function normalizeBulkBoardTemplate(value: unknown): BulkBoardTemplate {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const count = Math.max(3, Math.min(20, Math.trunc(Number(data.count) || 10)));
  const titlePattern = (text(data.titlePattern, 90) || '{count} places worth knowing in {city}')
    .replace(/\[city\]/gi, '{city}')
    .replace(/\[count\]/gi, '{count}');
  const searchQuery = text(data.searchQuery, 120) || 'places to visit';
  if (searchQuery.length < 2) {
    throw new Error('The place search query must contain at least two characters.');
  }
  return {
    id: slug(text(data.id, 64) || 'places-worth-knowing', 'places-worth-knowing'),
    version: text(data.version, 24) || '1.0',
    titlePattern,
    searchQuery,
    editorialBrief: text(data.editorialBrief, 1200)
      || 'Write like a generous local insider. Give each card one specific reason to care. Avoid tour-guide filler and unsupported factual claims.',
    count,
    cardTitleMode: data.cardTitleMode === 'subject' ? 'subject' : 'place',
  };
}

export function bulkBoardGenerationKey(atlasId: string, template: BulkBoardTemplate): string {
  return `${atlasId}__${template.id}__${template.version}`;
}

export function bulkBoardDocumentId(generationKey: string): string {
  return `bulk_${createHash('sha256').update(generationKey).digest('hex').slice(0, 28)}`;
}

export function bulkBoardSuppressionId(generationKey: string): string {
  return createHash('sha256').update(generationKey).digest('hex');
}

export function renderBulkBoardTitle(template: BulkBoardTemplate, cityName: string): string {
  return template.titlePattern
    .replaceAll('{city}', cityName)
    .replaceAll('{count}', String(template.count))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

export function bulkBoardAntiSlopWarnings(batch: GeneratedBoardWizardBatch): string[] {
  const combined = [batch.board.title, batch.board.description, ...batch.cards.flatMap((card) => [card.subtitle, card.notes])]
    .join(' ')
    .toLowerCase();
  return antiSlopPhrases
    .filter((phrase) => combined.includes(phrase))
    .map((phrase) => `Avoid generic phrase: “${phrase}”.`);
}

function atlasFromSnapshot(id: string, raw: Record<string, unknown>): BulkBoardAtlas {
  const config = raw.city_config && typeof raw.city_config === 'object'
    ? raw.city_config as Record<string, unknown>
    : {};
  if (raw.is_public !== true || config.enabled !== true) {
    throw new Error('The selected wiki is not an enabled public city.');
  }
  const cityName = text(config.city_name, 100) || text(raw.name, 100).replace(/^Living Wiki:\s*/i, '');
  if (!cityName) {
    throw new Error('The selected city has no configured city name.');
  }
  return {
    id,
    name: text(raw.name, 120) || cityName,
    slug: text(raw.slug, 100) || slug(cityName, id.toLowerCase()),
    cityName,
    regionName: text(config.region_name, 100),
    countryCode: text(config.country_code, 8).toUpperCase(),
    latitude: finiteNumber(config.latitude ?? raw.latitude, -90, 90),
    longitude: finiteNumber(config.longitude ?? raw.longitude, -180, 180),
  };
}

function radians(value: number): number {
  return value * Math.PI / 180;
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const earthRadius = 6_371_000;
  const latDelta = radians(bLat - aLat);
  const lngDelta = radians(bLng - aLng);
  const haversine = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function candidateBelongsToCity(candidate: BulkBoardCandidate, atlas: BulkBoardAtlas): boolean {
  if (atlas.latitude !== null && atlas.longitude !== null) {
    const distance = distanceMeters(atlas.latitude, atlas.longitude, candidate.lat, candidate.lng);
    // City Wikis represent the practical metro area. The former 25 km fallback
    // rejected valid global results whenever Google's localized address spelling
    // differed from our English city label.
    return distance <= candidateRadiusMeters;
  }
  const address = candidate.address.toLowerCase();
  const city = atlas.cityName.toLowerCase();
  // Google Text Search receives an explicit "near City, Region, Country"
  // constraint when coordinates are unavailable. Localized addresses may not
  // repeat our English city label (for example Москва vs Moscow), so an address
  // returned from that scoped provider request is acceptable.
  return !!address && (address.includes(city)
    || (!!atlas.regionName && address.includes(atlas.regionName.toLowerCase()))
    || !!atlas.countryCode);
}

export function bulkBoardCandidateQueries(template: Pick<BulkBoardTemplate, 'id' | 'searchQuery'>): string[] {
  const fallbacks: Record<string, string[]> = {
    'global-dishes-explain': [
      'traditional regional cuisine restaurants',
      'local specialty food restaurants',
      'regional dishes local restaurants',
      'restaurants',
      'food markets',
    ],
    'global-guidebooks-miss': [
      'independent cafes bookstores markets',
      'community markets local institutions',
      'popular local places',
      'cafes bookstores markets',
      'community centers independent shops',
    ],
    'global-zero-dollars': [
      'public parks plazas waterfront',
      'free museums monuments landmarks',
      'public libraries gardens',
      'parks',
      'public squares beaches waterfront',
    ],
    'global-where-locals-linger': [
      'cafes coffee shops with seating',
      'public libraries reading rooms',
      'parks plazas public gardens',
      'coffee shops',
      'public parks libraries',
    ],
    'global-neighborhoods-one-reason': [
      'neighborhood districts',
      'historic districts local areas',
      'boroughs quarters neighborhoods',
      'neighborhood',
      'historic neighborhood city quarter suburb',
    ],
    'global-only-happens-here': [
      'distinctive local landmarks institutions',
      'local traditions cultural sites',
      'unusual museums monuments attractions',
      'landmarks museums historic sites',
      'cultural institutions attractions',
    ],
    'global-first-24-hours': [
      'essential landmarks attractions',
      'local food markets museums',
      'parks culture first visit',
      'tourist attractions museums',
      'restaurants parks landmarks',
    ],
  };
  return Array.from(new Set([
    template.searchQuery,
    ...(fallbacks[template.id] ?? [`popular ${template.searchQuery}`]),
  ].map((query) => query.replace(/\s+/g, ' ').trim()).filter(Boolean)));
}

function uniqueRankedCandidates(candidates: BulkBoardCandidate[]): BulkBoardCandidate[] {
  const unique = new Map<string, BulkBoardCandidate>();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.placeId);
    if (!existing || candidateRank(candidate) > candidateRank(existing)) {
      unique.set(candidate.placeId, candidate);
    }
  }
  return [...unique.values()]
    .sort((left, right) => candidateRank(right) - candidateRank(left) || left.name.localeCompare(right.name));
}

function cachedCandidate(value: unknown): BulkBoardCandidate | null {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const placeId = text(data.placeId, 240);
  const name = text(data.name, 160);
  const lat = finiteNumber(data.lat, -90, 90);
  const lng = finiteNumber(data.lng, -180, 180);
  if (!placeId || !name || lat === null || lng === null) return null;
  return {
    placeId,
    name,
    address: text(data.address, 260),
    lat,
    lng,
    types: Array.isArray(data.types) ? data.types.map((type) => text(type, 60)).filter(Boolean).slice(0, 16) : [],
    rating: finiteNumber(data.rating, 0, 5),
    ratingCount: Math.max(0, Math.trunc(Number(data.ratingCount) || 0)),
    photoReference: text(data.photoReference, 1200),
    googleMapsUrl: text(data.googleMapsUrl, 2000)
      || `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`,
    source: data.source === 'livingwiki_reviews' ? 'livingwiki_reviews' : 'google_places',
  };
}

async function readCandidateCache(
  atlas: BulkBoardAtlas,
  template: BulkBoardTemplate,
): Promise<{ candidates: BulkBoardCandidate[]; completedQueries: string[] }> {
  const generationKey = bulkBoardGenerationKey(atlas.id, template);
  const snapshot = await db.collection('bulk_board_candidate_sets')
    .doc(bulkBoardSuppressionId(generationKey)).get();
  const raw = snapshot.data()?.candidates;
  const completedQueries = snapshot.data()?.cache_version === bulkBoardCandidateCacheVersion
    && Array.isArray(snapshot.data()?.completed_queries)
    ? snapshot.data()!.completed_queries.map((query: unknown) => text(query, 160)).filter(Boolean)
    : [];
  if (!Array.isArray(raw)) return { candidates: [], completedQueries };
  const candidates = uniqueRankedCandidates(raw
    .map(cachedCandidate)
    .filter((candidate): candidate is BulkBoardCandidate => !!candidate)
    .filter((candidate) => candidateBelongsToCity(candidate, atlas)));
  return { candidates, completedQueries };
}

async function persistCandidateCache(params: {
  atlas: BulkBoardAtlas;
  template: BulkBoardTemplate;
  candidates: BulkBoardCandidate[];
  completedQueries: string[];
}): Promise<void> {
  const generationKey = bulkBoardGenerationKey(params.atlas.id, params.template);
  await db.collection('bulk_board_candidate_sets').doc(bulkBoardSuppressionId(generationKey)).set({
    atlas_id: params.atlas.id,
    template_id: params.template.id,
    template_version: params.template.version,
    generation_key: generationKey,
    cache_version: bulkBoardCandidateCacheVersion,
    candidates: uniqueRankedCandidates(params.candidates).slice(0, 60),
    candidate_count: new Set(params.candidates.map((candidate) => candidate.placeId)).size,
    completed_queries: Array.from(new Set(params.completedQueries)),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
}

function bestPhotoReference(
  photos: NonNullable<NonNullable<GooglePlacesTextSearchResponse['results']>[number]['photos']>,
): string {
  return photos
    .map((photo, index) => {
      const reference = text(photo.photo_reference, 1200);
      const width = typeof photo.width === 'number' ? photo.width : 0;
      const height = typeof photo.height === 'number' ? photo.height : 0;
      const ratio = height > 0 ? width / height : 0;
      const shape = ratio >= 1.05 && ratio <= 2.4 ? 40 : 0;
      return { reference, score: shape + Math.min(30, Math.max(width, height) / 100) - index };
    })
    .filter((photo) => !!photo.reference)
    .sort((left, right) => right.score - left.score)[0]?.reference ?? '';
}

function candidateFromGoogle(
  value: NonNullable<GooglePlacesTextSearchResponse['results']>[number],
): BulkBoardCandidate | null {
  const placeId = text(value.place_id, 240);
  const name = text(value.name, 160);
  const lat = finiteNumber(value.geometry?.location?.lat, -90, 90);
  const lng = finiteNumber(value.geometry?.location?.lng, -180, 180);
  if (!placeId || !name || lat === null || lng === null || value.business_status === 'CLOSED_PERMANENTLY') {
    return null;
  }
  return {
    placeId,
    name,
    address: text(value.formatted_address, 260),
    lat,
    lng,
    types: Array.isArray(value.types) ? value.types.map((type) => text(type, 60)).filter(Boolean).slice(0, 16) : [],
    rating: finiteNumber(value.rating, 0, 5),
    ratingCount: Math.max(0, Math.trunc(Number(value.user_ratings_total) || 0)),
    photoReference: bestPhotoReference(value.photos ?? []),
    googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`,
    source: 'google_places',
  };
}

function candidateRank(candidate: BulkBoardCandidate): number {
  const rating = candidate.rating ?? 0;
  const reviewedBonus = candidate.source === 'livingwiki_reviews' ? 15 : 0;
  return rating * 18 + Math.log10(candidate.ratingCount + 1) * 12 + reviewedBonus + (candidate.photoReference ? 3 : 0);
}

async function reviewedCandidates(atlas: BulkBoardAtlas, searchQuery: string): Promise<BulkBoardCandidate[]> {
  const snapshot = await db.collection('city_places').where('atlas_id', '==', atlas.id).limit(80).get();
  const meaningfulSearchTokens = candidateSearchTokens(searchQuery);
  return snapshot.docs.flatMap((document) => {
    const data = document.data() as Record<string, unknown>;
    const placeId = text(data.google_place_id ?? data.place_id, 240);
    const name = text(data.name, 160);
    const lat = finiteNumber(data.lat, -90, 90);
    const lng = finiteNumber(data.lng, -180, 180);
    const searchable = `${name} ${text(data.category, 100)} ${Array.isArray(data.types) ? data.types.join(' ') : ''}`.toLowerCase();
    if (!placeId || !name || lat === null || lng === null
      || (meaningfulSearchTokens.length > 0 && !meaningfulSearchTokens.some((token) => searchable.includes(token)))) {
      return [];
    }
    return [{
      placeId,
      name,
      address: text(data.address, 260),
      lat,
      lng,
      types: Array.isArray(data.types) ? data.types.map((type) => text(type, 60)).filter(Boolean).slice(0, 16) : [],
      rating: finiteNumber(data.rating_avg, 0, 5),
      ratingCount: Math.max(0, Math.trunc(Number(data.rating_count ?? data.review_count) || 0)),
      photoReference: '',
      googleMapsUrl: text(data.google_maps_url, 2000)
        || `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`,
      source: 'livingwiki_reviews' as const,
    }];
  }).filter((candidate) => candidateBelongsToCity(candidate, atlas));
}

function candidateSearchTokens(searchQuery: string): string[] {
  return searchQuery.toLowerCase().split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && ![
      'best', 'top', 'places', 'place', 'visit', 'near', 'popular', 'local', 'city',
      'things', 'first', 'areas', 'regional', 'essential', 'unique',
    ].includes(token));
}

async function existingBoardCandidates(
  atlas: BulkBoardAtlas,
  searchQuery: string,
): Promise<BulkBoardCandidate[]> {
  const snapshot = await db.collection('boards').where('atlas_id', '==', atlas.id).limit(40).get();
  const searchTokens = candidateSearchTokens(searchQuery);
  const candidates = snapshot.docs.flatMap((document) => {
    const board = document.data() as Record<string, unknown>;
    if (board.deleted_at || !Array.isArray(board.cards)) return [];
    return board.cards.flatMap((value: unknown) => {
      const card = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      const placeId = text(card.placeId ?? card.place_id, 240);
      const name = text(card.entityName ?? card.entity_name ?? card.title, 160);
      const lat = finiteNumber(card.locationLat ?? card.location_lat, -90, 90);
      const lng = finiteNumber(card.locationLng ?? card.location_lng, -180, 180);
      const types = Array.isArray(card.tags)
        ? card.tags.map((type) => text(type, 60).replace(/\s+/g, '_')).filter(Boolean).slice(0, 16)
        : [];
      const searchable = `${name} ${text(card.subtitle, 160)} ${types.join(' ')}`.toLowerCase();
      if (!placeId || !name || lat === null || lng === null
        || (searchTokens.length > 0 && !searchTokens.some((token) => searchable.includes(token)))) {
        return [];
      }
      const imageUrl = text(card.imageUrl, 2000);
      const photoMatch = imageUrl.match(/[?&]ref=([^&]+)/);
      return [{
        placeId,
        name,
        address: text(card.subtitle, 260),
        lat,
        lng,
        types,
        rating: null,
        ratingCount: 0,
        photoReference: photoMatch ? decodeURIComponent(photoMatch[1]) : '',
        googleMapsUrl: text(card.googleMapsUrl ?? card.google_maps_url, 2000)
          || `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`,
        source: 'google_places' as const,
      }];
    });
  });
  return uniqueRankedCandidates(candidates.filter((candidate) => candidateBelongsToCity(candidate, atlas)));
}

async function googleCandidates(
  atlas: BulkBoardAtlas,
  rawQuery: string,
  apiKey: string,
): Promise<BulkBoardCandidate[]> {
  const request = buildCityPlaceTextSearchRequest(rawQuery, {
    cityName: atlas.cityName,
    regionName: atlas.regionName,
    countryCode: atlas.countryCode,
    latitude: atlas.latitude,
    longitude: atlas.longitude,
  });
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', request.query);
  if (request.location) url.searchParams.set('location', request.location);
  if (request.radius) url.searchParams.set('radius', String(request.radius));
  if (request.region) url.searchParams.set('region', request.region);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    throw new Error(`Google Places returned HTTP ${response.status}.`);
  }
  const data = await response.json() as GooglePlacesTextSearchResponse;
  if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message || `Google Places returned ${data.status}.`);
  }
  return (data.results ?? [])
    .map(candidateFromGoogle)
    .filter((candidate): candidate is BulkBoardCandidate => !!candidate)
    .filter((candidate) => candidateBelongsToCity(candidate, atlas));
}

export async function findBulkBoardCandidates(
  atlas: BulkBoardAtlas,
  template: BulkBoardTemplate,
  apiKey: string,
  requestedPoolSize = template.count,
): Promise<BulkBoardCandidate[]> {
  const poolSize = Math.max(template.count, Math.min(40, Math.trunc(requestedPoolSize)));
  const [cache, local, existing] = await Promise.all([
    readCandidateCache(atlas, template),
    reviewedCandidates(atlas, template.searchQuery),
    existingBoardCandidates(atlas, template.searchQuery),
  ]);
  let combined = uniqueRankedCandidates([...cache.candidates, ...local, ...existing]);
  if (combined.length >= poolSize) return combined.slice(0, poolSize);
  if (!apiKey) throw new Error('Google Places is not configured and the verified candidate cache is incomplete.');

  const completedQueries = [...cache.completedQueries];
  for (const query of bulkBoardCandidateQueries(template)) {
    if (completedQueries.includes(query)) continue;
    const discovered = await googleCandidates(atlas, query, apiKey);
    completedQueries.push(query);
    combined = uniqueRankedCandidates([...combined, ...discovered]);
    await persistCandidateCache({ atlas, template, candidates: combined, completedQueries });
    if (combined.length >= poolSize) break;
  }
  return combined.slice(0, poolSize);
}

function numberedCandidateSource(title: string, candidates: BulkBoardCandidate[]): string {
  return [
    title,
    ...candidates.map((candidate, index) => `${index + 1}. ${candidate.name} — ${candidate.address}`),
  ].join('\n');
}

async function generateBulkBoardCopy(
  atlas: BulkBoardAtlas,
  template: BulkBoardTemplate,
  candidates: BulkBoardCandidate[],
): Promise<GeneratedBoardWizardBatch> {
  const title = renderBulkBoardTitle(template, atlas.cityName);
  const candidateFacts = candidates.map((candidate, index) => ({
    rank: index + 1,
    name: candidate.name,
    address: candidate.address,
    types: candidate.types,
    rating: candidate.rating,
    ratingCount: candidate.ratingCount,
  }));
  const selectionRule = template.id === 'global-zero-dollars'
    ? 'Select exactly ten candidates that require no admission, ticket, membership, reservation fee, or purchase for the behavior you describe. A real venue is not enough: independently verify that the specific activity is currently free. Reject paid museums, zoos, gardens, observation decks, tours, and attractions.'
    : template.id === 'global-dishes-explain'
      ? 'Select exactly ten candidates only when a distinct local dish can be independently verified at that exact venue. Reject generic restaurant recommendations and never infer a dish from cuisine type alone.'
      : template.id === 'global-neighborhoods-one-reason'
        ? 'Select exactly ten candidates that are actual named neighborhoods, districts, quarters, or boroughs. Reject landmarks, museums, monuments, streets, and attractions standing in for a neighborhood.'
        : template.id === 'global-only-happens-here'
          ? 'Select exactly ten candidates with a concrete city-specific reason. Reject generic museums, statues, parks, markers, houses, and attractions that could be swapped into another city without changing the claim.'
          : `Select the strongest ${template.count} candidates for the requested bucket; reject weak, duplicate, closed, or out-of-scope candidates.`;
  return await generateBoardWizardBatch({
    mode: 'paste',
    prompt: [
      `Create a LivingWiki board for ${atlas.cityName}${atlas.regionName ? `, ${atlas.regionName}` : ''}.`,
      template.editorialBrief,
      `The numbered list is a provider-verified candidate pool, not the final board. ${selectionRule}`,
      `Return exactly ${template.count} cards. Use each selected candidate once, keep entity_name exactly equal to its candidate name, and do not introduce a place outside the pool. Order the final selection for the clearest story rather than preserving candidate-pool order.`,
      'Write in warm second person, as a well-informed local insider—not a tour guide or search result.',
      'One card must reveal one reason to care. Never invent history, prices, hours, dates, rankings, local habits, or operational details.',
      'Use only facts contained in the verified candidate data below. If detail is thin, stay concise instead of guessing.',
      template.cardTitleMode === 'subject'
        ? 'Card-title grammar: lead with the concrete subject promised by this board (such as the dish or free activity), then name the verified venue after an em dash when useful. Keep entity_name exactly equal to the verified candidate venue. Use Google Search in verification and never assert a subject-to-venue connection that cannot be verified.'
        : 'Card-title grammar: keep each verified place name recognizable and exact. Put the reveal or reason in the subtitle and notes.',
      `Verified candidate data: ${JSON.stringify(candidateFacts)}`,
    ].join('\n'),
    pastedList: numberedCandidateSource(title, candidates),
    targetBoardTitle: title,
    defaultType: 'place',
    count: template.count,
    countIsExplicit: true,
    vibe: 'curator',
    narrationStyle: 'storyteller',
    verificationFailureMode: 'error',
    verificationPass: false,
    researchGrounding: true,
  });
}

function candidateForGeneratedCard(
  card: GeneratedBoardWizardCard,
  candidates: BulkBoardCandidate[],
): BulkBoardCandidate | null {
  const entityName = normalizedCandidateName(card.entity_name);
  const title = normalizedCandidateName(card.title);
  const exact = candidates.filter((candidate) => {
    const name = normalizedCandidateName(candidate.name);
    return !!name && (name === entityName || name === title);
  });
  if (exact.length === 1) return exact[0];
  const contained = candidates.filter((candidate) => {
    const name = normalizedCandidateName(candidate.name);
    return name.length >= 8 && (entityName.includes(name) || title.includes(name));
  });
  return contained.length === 1 ? contained[0] : null;
}

function selectedCandidatesFromGeneratedCards(
  generated: GeneratedBoardWizardBatch,
  candidatePool: BulkBoardCandidate[],
  count: number,
): BulkBoardCandidate[] {
  const selected: BulkBoardCandidate[] = [];
  const seen = new Set<string>();
  for (const card of generated.cards) {
    const candidate = candidateForGeneratedCard(card, candidatePool);
    if (!candidate || seen.has(candidate.placeId)) continue;
    selected.push(candidate);
    seen.add(candidate.placeId);
  }
  if (selected.length !== count) {
    throw new Error(`The grounded writer selected ${selected.length} unambiguous verified places; ${count} are required.`);
  }
  return selected;
}

function cardPayload(
  generated: GeneratedBoardWizardCard | undefined,
  candidate: BulkBoardCandidate,
  index: number,
  now: string,
  cardTitleMode: BulkBoardTemplate['cardTitleMode'],
): Record<string, unknown> {
  const photoUrl = candidate.photoReference
    ? `${publicFunctionsBaseUrl}/boardPlacePhoto?ref=${encodeURIComponent(candidate.photoReference)}`
    : '';
  const types = candidate.types.map((type) => type.replaceAll('_', ' ')).slice(0, 5);
  return {
    id: `card_${createHash('sha256').update(candidate.placeId).digest('hex').slice(0, 20)}`,
    title: cardTitleMode === 'subject'
      ? text(generated?.title, 90) || candidate.name.slice(0, 90)
      : candidate.name.slice(0, 90),
    subtitle: text(generated?.subtitle, 120) || candidate.address.slice(0, 120),
    notes: text(generated?.notes, 3600),
    type: 'place',
    scope: 'place',
    status: 'saved',
    rating: 4,
    entityName: candidate.name.slice(0, 100),
    entityType: 'place',
    imageIntent: 'place',
    imageContext: [candidate.address, ...types].filter(Boolean).join(' · ').slice(0, 120),
    mediaKind: 'none',
    shortSummary: text(generated?.short_summary, 160) || text(generated?.subtitle, 160),
    rank: index + 1,
    videoIntent: false,
    videoSearchQuery: '',
    youtubeVideoId: '',
    youtubeVideoTitle: '',
    youtubeChannelTitle: '',
    youtubeThumbnailUrl: '',
    youtubeDurationSeconds: 0,
    youtubeMatchConfidence: 0,
    youtubeVerifiedAt: '',
    imageUrl: photoUrl,
    imageUrls: photoUrl ? [photoUrl] : [],
    audioPreviewUrl: '',
    spotifyTrackId: '',
    spotifyTrackUrl: '',
    spotifyUri: '',
    spotifyArtistName: '',
    spotifyAlbumName: '',
    spotifyArtworkUrl: '',
    placeId: candidate.placeId,
    googleMapsUrl: candidate.googleMapsUrl,
    locationLat: candidate.lat,
    locationLng: candidate.lng,
    sourceUrl: candidate.googleMapsUrl,
    productUrl: '',
    merchant: '',
    price: '',
    currency: '',
    sku: '',
    availability: '',
    productCategory: '',
    imageSource: photoUrl ? 'search' : 'missing',
    extractionConfidence: 1,
    extractedAt: now,
    what3wordsAddress: '',
    tags: [...types, `rank-${index + 1}`, 'verified-place'].slice(0, 6),
    stickers: [],
    tour: null,
    childBoardId: '',
    relatedCards: [],
    createdAt: now,
    updatedAt: now,
  };
}

function generatedCardForCandidate(
  candidate: BulkBoardCandidate,
  cards: GeneratedBoardWizardCard[],
): GeneratedBoardWizardCard | undefined {
  const candidateName = normalizedCandidateName(candidate.name);
  if (!candidateName) return undefined;
  return cards.find((card) => {
    const entityName = normalizedCandidateName(card.entity_name);
    const title = normalizedCandidateName(card.title);
    return entityName === candidateName
      || title === candidateName
      || (candidateName.length >= 8 && (entityName.includes(candidateName) || title.includes(candidateName)));
  });
}

function boardPayload(params: {
  boardId: string;
  jobId: string;
  itemId: string;
  requestedBy: string;
  atlas: BulkBoardAtlas;
  template: BulkBoardTemplate;
  generationKey: string;
  generated: GeneratedBoardWizardBatch;
  candidates: BulkBoardCandidate[];
  autoPublish: boolean;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  const matchedCopyCount = params.candidates.filter((candidate) => !!generatedCardForCandidate(candidate, params.generated.cards)).length;
  const cards = params.candidates.map((candidate, index) => cardPayload(
    generatedCardForCandidate(candidate, params.generated.cards),
    candidate,
    index,
    now,
    params.template.cardTitleMode,
  ));
  const imageUrl = String(cards.find((card) => card.imageUrl)?.imageUrl ?? '');
  const warnings = bulkBoardAntiSlopWarnings(params.generated);
  if (matchedCopyCount !== params.candidates.length) {
    warnings.push(`${params.candidates.length - matchedCopyCount} card(s) use factual fallback copy because writer output could not be matched safely.`);
  }
  if (params.template.cardTitleMode === 'subject') {
    const venueFirstCount = params.candidates.filter((candidate) => {
      const generated = generatedCardForCandidate(candidate, params.generated.cards);
      return !generated || !text(generated.title, 90)
        || text(generated.title, 90).toLowerCase() === candidate.name.toLowerCase();
    }).length;
    if (venueFirstCount) {
      warnings.push(`${venueFirstCount} card(s) need a subject-first title during editorial review.`);
    }
  }
  const payload: Record<string, unknown> = {
    id: params.boardId,
    kind: 'standard',
    sortOrder: Date.now(),
    owner_user_id: BULK_BOARD_SYSTEM_OWNER_ID,
    owner_public_slug: BULK_BOARD_SYSTEM_OWNER_SLUG,
    owner_display_name: 'LivingWiki',
    owner_photo_url: '',
    owner_profile_icon: 'public',
    owner_profile_picture_type: 'icon',
    forkedFromBoardId: '',
    forkedFromTitle: '',
    forkedFromOwnerUserId: '',
    forkedFromOwnerName: '',
    visibility: params.autoPublish ? 'public' : 'private',
    title: renderBulkBoardTitle(params.template, params.atlas.cityName),
    description: text(params.generated.board.description, 240)
      || `A reviewed collection of places in ${params.atlas.cityName}.`,
    backNote: params.autoPublish
      ? 'Generated from verified place identities for the approved global city-board catalog.'
      : 'Generated from verified place identities. Editorial review is required before publishing.',
    icon: normalizeBulkBoardIcon(
      params.generated.board.icon,
      `${params.template.searchQuery} ${params.template.titlePattern} ${params.generated.board.title}`,
    ),
    tone: params.generated.board.tone || 'teal',
    imageUrl,
    logoUrl: '',
    logoLinkUrl: '',
    stackCtaLabel: '',
    stackCtaUrl: '',
    socialVideoUrl: '',
    socialVideoMimeType: '',
    socialVideoUpdatedAt: '',
    socialVideoRenderVersion: '',
    socialVideoRatio: 'vertical',
    socialVideoAudioTrackId: '',
    socialVideoAudioVolume: 0.18,
    socialVideoNarrationEnabled: true,
    trailerVideoUrl: '',
    trailerVideoMimeType: '',
    trailerVideoUpdatedAt: '',
    trailerVideoRenderVersion: '',
    trailerVideoRatio: 'vertical',
    trailerVideoAudioTrackId: '',
    trailerVideoAudioVolume: 0.18,
    trailerVideoNarrationEnabled: true,
    trailerVideoScript: '',
    trailerVideoSourceFingerprint: '',
    trailerVideoCardIds: [],
    trailerVideoDurationSeconds: 0,
    narrationStyle: 'storyteller',
    stackNarratorVoiceId: 'warm-storyteller',
    stickers: [],
    tourMeta: null,
    learningQuiz: null,
    parentBoardId: '',
    parentCardId: '',
    parentBoardTitle: '',
    parentCardTitle: '',
    insideCardsDisplay: 'nested',
    showCardNumbers: true,
    cards,
    atlas_id: params.atlas.id,
    generated_for_atlas_id: params.atlas.id,
    origin: 'bulk_generator',
    publisher_type: 'livingwiki',
    generation_job_id: params.jobId,
    generation_item_id: params.itemId,
    generation_key: params.generationKey,
    generator_version: BULK_BOARD_GENERATOR_VERSION,
    template_id: params.template.id,
    template_version: params.template.version,
    rubric_version: BULK_BOARD_RUBRIC_VERSION,
    editorial_status: params.autoPublish ? 'published' : 'needs_review',
    city_listing_status: params.autoPublish ? 'listed' : 'pending',
    source_status: 'excluded',
    quality_status: warnings.length ? 'warnings' : 'passed',
    quality_warnings: warnings,
    validation_summary: {
      requested_count: params.template.count,
      verified_count: cards.length,
      unique_place_ids: new Set(params.candidates.map((candidate) => candidate.placeId)).size,
      all_have_coordinates: params.candidates.every((candidate) => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng)),
      candidate_sources: [...new Set(params.candidates.map((candidate) => candidate.source))],
      matched_copy_count: matchedCopyCount,
      validated_at: now,
    },
    created_by_user_id: params.requestedBy,
    approved_by_user_id: params.autoPublish ? BULK_BOARD_SYSTEM_OWNER_ID : '',
    approved_at: params.autoPublish ? FieldValue.serverTimestamp() : null,
    deleted_at: null,
    deleted_by_user_id: '',
    deletion_reason: '',
    created_at_iso: now,
    updated_at_iso: now,
    server_updated_at: FieldValue.serverTimestamp(),
  };
  const scoring = scoreGeneratedBoard(payload, { expectedCount: params.template.count });
  return {
    ...payload,
    generation_score: scoring.score,
    generation_grade: scoring.grade,
    generation_score_breakdown: scoring.breakdown,
    generation_score_reasons: scoring.reasons,
    generation_scored_at: scoring.scoredAt,
    generation_score_rubric_version: scoring.rubricVersion,
  };
}

async function finishItem(
  itemId: string,
  jobId: string,
  status: 'needs_review' | 'skipped_existing' | 'suppressed' | 'failed' | 'cancelled',
  fields: Record<string, unknown> = {},
): Promise<void> {
  if (!jobId) {
    await db.collection('board_generation_items').doc(itemId).set({
      status,
      ...fields,
      completed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    return;
  }
  await db.runTransaction(async (transaction) => {
    const itemRef = db.collection('board_generation_items').doc(itemId);
    const jobRef = db.collection('board_generation_jobs').doc(jobId);
    const [itemSnapshot, jobSnapshot] = await Promise.all([transaction.get(itemRef), transaction.get(jobRef)]);
    const currentStatus = text(itemSnapshot.data()?.status, 40);
    if (!itemSnapshot.exists || !['running', 'queued'].includes(currentStatus)) {
      return;
    }
    const job = (jobSnapshot.data() ?? {}) as Record<string, unknown>;
    const completed = Math.max(0, Number(job.completed_count) || 0) + 1;
    const total = Math.max(0, Number(job.total_count) || 0);
    const successIncrement = status === 'needs_review' ? 1 : 0;
    const failureIncrement = status === 'failed' ? 1 : 0;
    const skippedIncrement = status === 'skipped_existing' || status === 'suppressed' ? 1 : 0;
    const cancelledIncrement = status === 'cancelled' ? 1 : 0;
    transaction.update(itemRef, {
      status,
      ...fields,
      completed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    if (jobSnapshot.exists) {
      transaction.update(jobRef, {
        completed_count: completed,
        success_count: Math.max(0, Number(job.success_count) || 0) + successIncrement,
        failed_count: Math.max(0, Number(job.failed_count) || 0) + failureIncrement,
        skipped_count: Math.max(0, Number(job.skipped_count) || 0) + skippedIncrement,
        cancelled_count: Math.max(0, Number(job.cancelled_count) || 0) + cancelledIncrement,
        status: completed >= total ? (job.cancel_requested === true ? 'cancelled' : 'completed') : 'running',
        ...(completed >= total ? { completed_at: FieldValue.serverTimestamp() } : {}),
        updated_at: FieldValue.serverTimestamp(),
      });
    }
  });
}

export async function processBulkBoardGenerationItem(
  itemId: string,
  googlePlacesApiKey: string,
): Promise<void> {
  const itemRef = db.collection('board_generation_items').doc(itemId);
  const claim = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(itemRef);
    if (!snapshot.exists || snapshot.data()?.status !== 'queued') {
      return null;
    }
    transaction.update(itemRef, {
      status: 'running',
      attempt_count: FieldValue.increment(1),
      started_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      error_code: '',
      error_message: '',
    });
    return snapshot.data() as Record<string, unknown>;
  });
  if (!claim) {
    return;
  }

  const jobId = text(claim.job_id, 160);
  const atlasId = text(claim.atlas_id, 160);
  if (!jobId || !atlasId) {
    await finishItem(itemId, jobId, 'failed', {
      error_code: 'invalid-item',
      error_message: 'The generation item is missing its job or city.',
    });
    return;
  }

  try {
    const [jobSnapshot, atlasSnapshot] = await Promise.all([
      db.collection('board_generation_jobs').doc(jobId).get(),
      db.collection('atlases').doc(atlasId).get(),
    ]);
    if (!jobSnapshot.exists) throw new Error('Generation job not found.');
    if (!atlasSnapshot.exists) throw new Error('City not found.');
    const job = jobSnapshot.data() as BulkBoardJobRecord;
    if (job.cancel_requested === true || job.status === 'cancelled') {
      await finishItem(itemId, jobId, 'cancelled');
      return;
    }
    const template = normalizeBulkBoardTemplate(claim.template ?? job.template);
    const generationKey = bulkBoardGenerationKey(atlasId, template);
    const suppression = await db.collection('board_generation_suppressions')
      .doc(bulkBoardSuppressionId(generationKey)).get();
    if (suppression.exists && suppression.data()?.active !== false) {
      await finishItem(itemId, jobId, 'suppressed', { generation_key: generationKey });
      return;
    }
    const boardId = bulkBoardDocumentId(generationKey);
    const existingBoard = await db.collection('boards').doc(boardId).get();
    if (existingBoard.exists && !existingBoard.data()?.deleted_at) {
      await finishItem(itemId, jobId, 'skipped_existing', {
        board_id: boardId,
        generation_key: generationKey,
      });
      return;
    }

    const atlas = atlasFromSnapshot(atlasSnapshot.id, atlasSnapshot.data() as Record<string, unknown>);
    const candidatePool = await findBulkBoardCandidates(
      atlas,
      template,
      googlePlacesApiKey,
      template.count * 2,
    );
    if (candidatePool.length < template.count) {
      throw new Error(`Found ${candidatePool.length} verified places; ${template.count} are required.`);
    }
    if (new Set(candidatePool.map((candidate) => candidate.placeId)).size !== candidatePool.length) {
      throw new Error('The verified candidate list contains duplicate place identities.');
    }
    const generated = await generateBulkBoardCopy(atlas, template, candidatePool);
    if (generated.cards.length !== template.count) {
      throw new Error(`The writer returned ${generated.cards.length} cards; ${template.count} are required.`);
    }
    const candidates = selectedCandidatesFromGeneratedCards(generated, candidatePool, template.count);
    const latestJob = await db.collection('board_generation_jobs').doc(jobId).get();
    const latestSuppression = await db.collection('board_generation_suppressions')
      .doc(bulkBoardSuppressionId(generationKey)).get();
    if (latestJob.data()?.cancel_requested === true) {
      await finishItem(itemId, jobId, 'cancelled');
      return;
    }
    if (latestSuppression.exists && latestSuppression.data()?.active !== false) {
      await finishItem(itemId, jobId, 'suppressed', { generation_key: generationKey });
      return;
    }

    const payload = boardPayload({
      boardId,
      jobId,
      itemId,
      requestedBy: text(job.requested_by_user_id, 160),
      atlas,
      template,
      generationKey,
      generated,
      candidates,
      autoPublish: job.auto_publish === true,
    });
    const writeResult = await db.runTransaction(async (transaction) => {
      const jobRef = db.collection('board_generation_jobs').doc(jobId);
      const suppressionRef = db.collection('board_generation_suppressions').doc(bulkBoardSuppressionId(generationKey));
      const boardRef = db.collection('boards').doc(boardId);
      const [jobCheck, suppressionCheck, boardSnapshot] = await Promise.all([
        transaction.get(jobRef),
        transaction.get(suppressionRef),
        transaction.get(boardRef),
      ]);
      if (jobCheck.data()?.cancel_requested === true) {
        return 'cancelled' as const;
      }
      if (suppressionCheck.exists && suppressionCheck.data()?.active !== false) {
        return 'suppressed' as const;
      }
      if (boardSnapshot.exists && !boardSnapshot.data()?.deleted_at) {
        return 'existing' as const;
      }
      transaction.set(boardRef, payload);
      transaction.set(db.collection('board_generation_audit').doc(), {
        action: 'generated',
        board_id: boardId,
        atlas_id: atlasId,
        job_id: jobId,
        item_id: itemId,
        actor_user_id: text(job.requested_by_user_id, 160),
        generation_key: generationKey,
        generation_score: Number(payload.generation_score),
        generation_grade: text(payload.generation_grade, 4),
        created_at: FieldValue.serverTimestamp(),
      });
      return 'created' as const;
    });
    if (writeResult === 'cancelled') {
      await finishItem(itemId, jobId, 'cancelled');
      return;
    }
    if (writeResult === 'suppressed') {
      await finishItem(itemId, jobId, 'suppressed', { generation_key: generationKey });
      return;
    }
    if (writeResult === 'existing') {
      await finishItem(itemId, jobId, 'skipped_existing', { board_id: boardId, generation_key: generationKey });
      return;
    }
    await finishItem(itemId, jobId, 'needs_review', {
      board_id: boardId,
      generation_key: generationKey,
      verified_place_count: candidates.length,
      quality_warning_count: Array.isArray(payload.quality_warnings) ? payload.quality_warnings.length : 0,
      generation_score: Number(payload.generation_score),
      generation_grade: text(payload.generation_grade, 4),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Bulk board generation item failed.', { itemId, jobId, atlasId, errorMessage: message });
    await finishItem(itemId, jobId, 'failed', {
      error_code: /Google Places/i.test(message) ? 'places-unavailable' : /writer|Gemini|AI/i.test(message) ? 'writer-unavailable' : 'generation-failed',
      error_message: message.slice(0, 1000),
    });
  }
}
