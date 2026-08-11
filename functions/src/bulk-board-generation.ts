import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { buildCityPlaceTextSearchRequest } from './city-place-search';
import { db } from './firebase';
import {
  generateBoardWizardBatch,
  type GeneratedBoardWizardBatch,
  type GeneratedBoardWizardCard,
} from './gemini';

export const BULK_BOARD_RUBRIC_VERSION = '1.0';
export const BULK_BOARD_GENERATOR_VERSION = '1.0.0';
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
};

const publicFunctionsBaseUrl = 'https://us-central1-living-atlas-7622a.cloudfunctions.net';
const candidateRadiusMeters = 50_000;
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
    const addressNamesCity = candidate.address.toLowerCase().includes(atlas.cityName.toLowerCase());
    return distance <= (addressNamesCity ? candidateRadiusMeters : 25_000);
  }
  const address = candidate.address.toLowerCase();
  const city = atlas.cityName.toLowerCase();
  return !!address && (address.includes(city) || (!!atlas.regionName && address.includes(atlas.regionName.toLowerCase())));
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
  const meaningfulSearchTokens = searchQuery.toLowerCase().split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !['best', 'top', 'places', 'place', 'visit', 'near', 'popular'].includes(token));
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
): Promise<BulkBoardCandidate[]> {
  if (!apiKey) {
    throw new Error('Google Places is not configured.');
  }
  const local = await reviewedCandidates(atlas, template.searchQuery);
  const primary = await googleCandidates(atlas, template.searchQuery, apiKey);
  const combined = [...local, ...primary];
  if (combined.length < template.count) {
    const fallback = await googleCandidates(atlas, `popular ${template.searchQuery}`, apiKey);
    combined.push(...fallback);
  }
  const unique = new Map<string, BulkBoardCandidate>();
  for (const candidate of combined) {
    const existing = unique.get(candidate.placeId);
    if (!existing || candidateRank(candidate) > candidateRank(existing)) {
      unique.set(candidate.placeId, candidate);
    }
  }
  return [...unique.values()]
    .sort((left, right) => candidateRank(right) - candidateRank(left) || left.name.localeCompare(right.name))
    .slice(0, template.count);
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
  return await generateBoardWizardBatch({
    mode: 'paste',
    prompt: [
      `Create a LivingWiki board for ${atlas.cityName}${atlas.regionName ? `, ${atlas.regionName}` : ''}.`,
      template.editorialBrief,
      'The numbered candidate list is authoritative. Use every candidate exactly once and in the supplied order.',
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
  });
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
  const normalize = (value: unknown) => text(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const candidateName = normalize(candidate.name);
  if (!candidateName) return undefined;
  return cards.find((card) => {
    const entityName = normalize(card.entity_name);
    const title = normalize(card.title);
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
  return {
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
    visibility: 'private',
    title: renderBulkBoardTitle(params.template, params.atlas.cityName),
    description: text(params.generated.board.description, 240)
      || `A reviewed collection of places in ${params.atlas.cityName}.`,
    backNote: 'Generated from verified place identities. Editorial review is required before publishing.',
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
    editorial_status: 'needs_review',
    city_listing_status: 'pending',
    source_status: 'excluded',
    quality_status: warnings.length ? 'warnings' : 'not_scored',
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
    approved_by_user_id: '',
    approved_at: null,
    deleted_at: null,
    deleted_by_user_id: '',
    deletion_reason: '',
    created_at_iso: now,
    updated_at_iso: now,
    server_updated_at: FieldValue.serverTimestamp(),
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
    const template = normalizeBulkBoardTemplate(job.template);
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
    const candidates = await findBulkBoardCandidates(atlas, template, googlePlacesApiKey);
    if (candidates.length !== template.count) {
      throw new Error(`Found ${candidates.length} verified places; ${template.count} are required.`);
    }
    if (new Set(candidates.map((candidate) => candidate.placeId)).size !== template.count) {
      throw new Error('The verified candidate list contains duplicate place identities.');
    }
    const generated = await generateBulkBoardCopy(atlas, template, candidates);
    if (generated.cards.length !== template.count) {
      throw new Error(`The writer returned ${generated.cards.length} cards; ${template.count} are required.`);
    }
    if (template.cardTitleMode === 'subject') {
      const unmatched = candidates.filter((candidate) => {
        const card = generatedCardForCandidate(candidate, generated.cards);
        return !card || !text(card.title, 90)
          || text(card.title, 90).toLowerCase() === candidate.name.toLowerCase();
      });
      if (unmatched.length) {
        throw new Error(`The grounded writer did not produce ${unmatched.length} subject-first card title(s).`);
      }
    }

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
