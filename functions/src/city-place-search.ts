export const cityPlaceSearchRadiusMeters = 50_000;
export const cityPlaceSearchGoogleResultLimit = 15;
export const cityPlaceSearchCandidateLimit = 16;

export type CityPlaceSearchBias = {
  cityName: string;
  regionName: string;
  countryCode: string;
  latitude: unknown;
  longitude: unknown;
};

export type CityPlaceTextSearchRequest = {
  query: string;
  location?: string;
  radius?: number;
  region?: string;
};

function finiteCoordinate(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value.trim())
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function googleRegionCode(countryCode: string): string | undefined {
  const normalized = countryCode.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(normalized)) {
    return undefined;
  }
  return normalized === 'gb' ? 'uk' : normalized;
}

/**
 * Keeps the visitor's words intact and biases Google toward the whole metro area.
 * A coordinate bias can return relevant places outside the circle, unlike adding
 * the city name to the query, which Google may interpret as a hard city constraint.
 */
export function buildCityPlaceTextSearchRequest(
  rawQuery: string,
  bias: CityPlaceSearchBias,
): CityPlaceTextSearchRequest {
  const query = rawQuery.replace(/\s+/g, ' ').trim();
  const latitude = finiteCoordinate(bias.latitude, -90, 90);
  const longitude = finiteCoordinate(bias.longitude, -180, 180);
  const region = googleRegionCode(bias.countryCode);

  if (latitude !== null && longitude !== null) {
    return {
      query,
      location: `${latitude},${longitude}`,
      radius: cityPlaceSearchRadiusMeters,
      ...(region ? { region } : {}),
    };
  }

  const cityContext = [bias.cityName, bias.regionName, bias.countryCode]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(', ');

  return {
    query: cityContext ? `${query} near ${cityContext}` : query,
    ...(region ? { region } : {}),
  };
}
