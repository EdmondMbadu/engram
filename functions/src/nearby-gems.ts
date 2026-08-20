export type NearbyGemRange = 'walk' | 'quick-drive' | 'adventure';

export type NearbyGemPreset = {
  id: NearbyGemRange;
  label: string;
  travelMode: 'WALK' | 'DRIVE';
  maxDurationSeconds: number;
  radiusMeters: number;
  description: string;
};

export type NearbyGemCandidate = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
  primaryType: string;
  rating: number;
  ratingCount: number;
  googleMapsUrl: string;
  photoName: string;
  photoReference?: string;
  editorialSummary: string;
  straightLineMeters?: number;
  routeDistanceMeters?: number;
  routeDurationSeconds?: number;
};

export const NEARBY_GEM_PRESETS: Record<NearbyGemRange, NearbyGemPreset> = {
  walk: {
    id: 'walk',
    label: 'On foot',
    travelMode: 'WALK',
    maxDurationSeconds: 30 * 60,
    radiusMeters: 2 * 1609.344,
    description: 'Up to a 30-minute walk',
  },
  'quick-drive': {
    id: 'quick-drive',
    label: 'Quick drive',
    travelMode: 'DRIVE',
    maxDurationSeconds: 10 * 60,
    radiusMeters: 10 * 1609.344,
    description: 'Up to a 10-minute drive',
  },
  adventure: {
    id: 'adventure',
    label: '20-minute adventure',
    travelMode: 'DRIVE',
    maxDurationSeconds: 20 * 60,
    radiusMeters: 20 * 1609.344,
    description: 'Up to a 20-minute drive',
  },
};

const radians = (degrees: number): number => degrees * Math.PI / 180;

export function nearbyGemPreset(value: unknown): NearbyGemPreset | null {
  return typeof value === 'string' && value in NEARBY_GEM_PRESETS
    ? NEARBY_GEM_PRESETS[value as NearbyGemRange]
    : null;
}

export function haversineMeters(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(destination.lat - origin.lat);
  const longitudeDelta = radians(destination.lng - origin.lng);
  const firstLatitude = radians(origin.lat);
  const secondLatitude = radians(destination.lat);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function googleDurationSeconds(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : null;
}

export function nearbyGemCategory(candidate: Pick<NearbyGemCandidate, 'types' | 'primaryType'>): string {
  const types = new Set([candidate.primaryType, ...candidate.types]);
  if (types.has('museum') || types.has('art_gallery')) return 'Arts & culture';
  if (types.has('historical_landmark') || types.has('historical_place') || types.has('cultural_landmark') || types.has('monument')) return 'Local history';
  if (types.has('park') || types.has('city_park') || types.has('state_park') || types.has('nature_preserve') || types.has('scenic_spot') || types.has('beach') || types.has('hiking_area') || types.has('botanical_garden') || types.has('garden')) return 'Outdoors';
  if (types.has('book_store') || types.has('library')) return 'Curious corner';
  if (types.has('bakery') || types.has('cafe') || types.has('coffee_shop') || types.has('restaurant')) return 'Food & drink';
  return 'Local discovery';
}

function normalizedTerms(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3)
    .slice(0, 12);
}

export function rankNearbyGemCandidates(
  candidates: NearbyGemCandidate[],
  preset: NearbyGemPreset,
  details = '',
  limit = 8,
): NearbyGemCandidate[] {
  const terms = normalizedTerms(details);
  const unique = new Map<string, NearbyGemCandidate>();
  for (const candidate of candidates) {
    if (!candidate.id || !candidate.name || !Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) continue;
    const current = unique.get(candidate.id);
    if (!current || candidate.ratingCount > current.ratingCount) unique.set(candidate.id, candidate);
  }

  const eligible = Array.from(unique.values()).filter((candidate) => {
    if ((candidate.straightLineMeters ?? Infinity) > preset.radiusMeters) return false;
    const duration = candidate.routeDurationSeconds;
    return duration == null || duration <= preset.maxDurationSeconds;
  });

  const scored = eligible.map((candidate) => {
    const rating = Math.max(0, Math.min(5, candidate.rating || 0));
    const confidence = Math.min(1, Math.log10(Math.max(1, candidate.ratingCount)) / 3);
    const quality = (rating * confidence) + (3.7 * (1 - confidence));
    const popularity = Math.min(1.5, Math.log10(Math.max(1, candidate.ratingCount)) / 2.5);
    const duration = candidate.routeDurationSeconds ?? preset.maxDurationSeconds;
    const proximity = Math.max(0, 1 - duration / preset.maxDurationSeconds);
    const searchable = `${candidate.name} ${candidate.address} ${candidate.primaryType} ${candidate.types.join(' ')} ${candidate.editorialSummary}`.toLocaleLowerCase();
    const detailMatch = terms.reduce((score, term) => score + (searchable.includes(term) ? 0.9 : 0), 0);
    const categoryBonus = nearbyGemCategory(candidate) === 'Local discovery' ? 0 : 0.3;
    return { candidate, score: quality + popularity + proximity + detailMatch + categoryBonus };
  }).sort((left, right) => right.score - left.score);

  const selected: NearbyGemCandidate[] = [];
  const categoryCounts = new Map<string, number>();
  for (const item of scored) {
    const category = nearbyGemCategory(item.candidate);
    if ((categoryCounts.get(category) ?? 0) >= 3 && selected.length < Math.min(limit, 6)) continue;
    selected.push(item.candidate);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    if (selected.length >= limit) break;
  }
  if (selected.length < limit) {
    for (const item of scored) {
      if (!selected.some((candidate) => candidate.id === item.candidate.id)) selected.push(item.candidate);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

export function formatNearbyGemDuration(seconds: number | undefined): string {
  if (!Number.isFinite(seconds)) return 'Nearby';
  const minutes = Math.max(1, Math.round((seconds ?? 0) / 60));
  return `${minutes} min`;
}

export function broadLocationLabel(addressComponents: Array<{ longText?: string; types?: string[] }>): string {
  const read = (...types: string[]): string => addressComponents.find((component) =>
    component.types?.some((type) => types.includes(type)))?.longText?.trim() ?? '';
  const locality = read('locality', 'postal_town', 'sublocality', 'administrative_area_level_3');
  const region = read('administrative_area_level_1');
  const country = read('country');
  return [locality, region].filter((value, index, values) => value && values.indexOf(value) === index).join(', ')
    || region
    || country
    || 'your area';
}
