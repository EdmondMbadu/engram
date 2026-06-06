import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase';
import type { AtlasRecord } from './types';

export type CityPopulationStatus = 'updated' | 'skipped' | 'failed';
type CityPopulationSource = 'us_census_pep' | 'geonames' | 'wikidata' | 'manual';
type CityPopulationConfidence = 'high' | 'medium' | 'low';
type CityPopulationMatchMethod = 'exact_id' | 'census_codes' | 'name_country_region' | 'name_coords' | 'manual';

export interface CityPopulationRefreshResult {
  atlasId: string;
  status: CityPopulationStatus;
  cityName: string;
  population: number | null;
  populationYear: number | null;
  source: CityPopulationSource | null;
  sourceLabel: string | null;
  confidence: CityPopulationConfidence | null;
  message: string;
}

interface PopulationCandidate {
  value: number;
  year: number | null;
  scope: 'city_proper' | 'urban_agglomeration' | 'metro' | 'unknown';
  source: CityPopulationSource;
  sourceLabel: string;
  sourceUrl: string;
  sourceRecordId: string | null;
  confidence: CityPopulationConfidence;
  matchMethod: CityPopulationMatchMethod;
}

const CENSUS_CITY_POPULATION_VINTAGE = 2024;
const ATLASES_COLLECTION = db.collection('atlases');

export async function refreshCityPopulationMetadata(
  atlasId: string,
  options: { force: boolean },
): Promise<CityPopulationRefreshResult> {
  const snapshot = await ATLASES_COLLECTION.doc(atlasId).get();
  if (!snapshot.exists) {
    return failedResult(atlasId, 'Unknown city', 'Atlas not found.');
  }

  const atlas = { id: snapshot.id, ...(snapshot.data() as AtlasRecord) };
  const cityConfig = atlas.city_config ?? null;
  const cityName = cleanCityName(String(cityConfig?.city_name ?? atlas.name ?? '').trim());
  const existingPopulation = numberOrNull(cityConfig?.metadata?.population);
  const existingPopulationYear = numberOrNull(cityConfig?.metadata?.population_year);
  const existingSource = typeof cityConfig?.metadata?.population_source === 'string'
    ? cityConfig.metadata.population_source as CityPopulationSource
    : null;

  if (!cityConfig?.enabled || !cityName) {
    return failedResult(atlasId, cityName || atlas.name || 'Unknown city', 'This wiki is not configured as a city.');
  }

  if (!options.force && existingPopulation) {
    return {
      atlasId,
      status: 'skipped',
      cityName,
      population: existingPopulation,
      populationYear: existingPopulationYear,
      source: existingSource,
      sourceLabel: sourceLabelFor(existingSource),
      confidence: normalizeConfidence(cityConfig.metadata?.population_confidence),
      message: 'Population already exists.',
    };
  }

  const candidate = await resolvePopulation(atlas, cityName);
  if (!candidate) {
    return {
      atlasId,
      status: 'failed',
      cityName,
      population: existingPopulation,
      populationYear: existingPopulationYear,
      source: existingSource,
      sourceLabel: sourceLabelFor(existingSource),
      confidence: normalizeConfidence(cityConfig.metadata?.population_confidence),
      message: existingPopulation
        ? 'No fresh source matched; existing population was kept.'
        : 'No population source returned a confident match.',
    };
  }

  await ATLASES_COLLECTION.doc(atlasId).update({
    city_config: {
      ...cityConfig,
      metadata: {
        ...(cityConfig.metadata ?? {}),
        population: candidate.value,
        population_year: candidate.year,
        population_scope: candidate.scope,
        population_source: candidate.source,
        population_source_url: candidate.sourceUrl,
        population_source_record_id: candidate.sourceRecordId,
        population_fetched_at: new Date().toISOString(),
        population_confidence: candidate.confidence,
        population_match_method: candidate.matchMethod,
      },
    },
    updated_at: FieldValue.serverTimestamp(),
  });

  return {
    atlasId,
    status: 'updated',
    cityName,
    population: candidate.value,
    populationYear: candidate.year,
    source: candidate.source,
    sourceLabel: candidate.sourceLabel,
    confidence: candidate.confidence,
    message: `Updated from ${candidate.sourceLabel}.`,
  };
}

async function resolvePopulation(atlas: AtlasRecord & { id: string }, cityName: string): Promise<PopulationCandidate | null> {
  const cityConfig = atlas.city_config ?? {};
  const countryCode = typeof cityConfig.country_code === 'string' ? cityConfig.country_code.trim().toUpperCase() : '';
  const regionName = typeof cityConfig.region_name === 'string' ? cityConfig.region_name.trim() : '';

  if (countryCode === 'US' && cityConfig.census_state_code && cityConfig.census_place_code) {
    const census = await fetchCensusPopulation(
      String(cityConfig.census_state_code),
      String(cityConfig.census_place_code),
    );
    if (census) {
      return census;
    }
  }

  const geonames = await fetchGeoNamesPopulation(cityName, countryCode);
  if (geonames) {
    return geonames;
  }

  const wikidata = await fetchWikidataPopulation(cityName, countryCode, regionName);
  if (wikidata) {
    return wikidata;
  }

  return null;
}

async function fetchCensusPopulation(stateCode: string, placeCode: string): Promise<PopulationCandidate | null> {
  const normalizedStateCode = stateCode.padStart(2, '0');
  const normalizedPlaceCode = placeCode.padStart(5, '0');
  const datasetUrl =
    `https://www2.census.gov/programs-surveys/popest/datasets/2020-${CENSUS_CITY_POPULATION_VINTAGE}/cities/totals/` +
    `sub-est${CENSUS_CITY_POPULATION_VINTAGE}_${normalizedStateCode}.csv`;

  const row = await fetchCsvPlacePopulationRow(datasetUrl, normalizedStateCode, normalizedPlaceCode);
  if (!row) {
    return null;
  }

  const latestPopulation = Number(row[`POPESTIMATE${CENSUS_CITY_POPULATION_VINTAGE}`]);
  if (!Number.isFinite(latestPopulation) || latestPopulation <= 0) {
    return null;
  }

  const geographyName = String(row['NAME'] ?? '').trim() || `Place ${normalizedPlaceCode}`;
  return {
    value: Math.round(latestPopulation),
    year: CENSUS_CITY_POPULATION_VINTAGE,
    scope: 'city_proper',
    source: 'us_census_pep',
    sourceLabel: 'U.S. Census Population Estimates Program',
    sourceUrl: datasetUrl,
    sourceRecordId: `${normalizedStateCode}-${normalizedPlaceCode}`,
    confidence: 'high',
    matchMethod: 'census_codes',
  };
}

async function fetchGeoNamesPopulation(cityName: string, countryCode: string): Promise<PopulationCandidate | null> {
  const username = process.env.GEONAMES_USERNAME?.trim();
  if (!username) {
    return null;
  }

  const url = new URL('https://secure.geonames.org/searchJSON');
  url.searchParams.set('name_equals', cityName);
  url.searchParams.set('featureClass', 'P');
  url.searchParams.set('maxRows', '10');
  url.searchParams.set('orderby', 'population');
  url.searchParams.set('username', username);
  if (countryCode) {
    url.searchParams.set('country', countryCode);
  }

  try {
    const data = await fetchJson(url.toString()) as { geonames?: Array<Record<string, unknown>> };
    const records = Array.isArray(data.geonames) ? data.geonames : [];
    const best = records
      .map((record) => ({
        geonameId: String(record['geonameId'] ?? ''),
        population: numberOrNull(record['population']),
      }))
      .filter((record) => record.geonameId && record.population && record.population > 0)
      .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
    if (!best?.population) {
      return null;
    }

    url.searchParams.set('username', 'CONFIGURED');
    return {
      value: Math.round(best.population),
      year: null,
      scope: 'unknown',
      source: 'geonames',
      sourceLabel: 'GeoNames',
      sourceUrl: url.toString(),
      sourceRecordId: best.geonameId,
      confidence: countryCode ? 'medium' : 'low',
      matchMethod: countryCode ? 'name_country_region' : 'name_coords',
    };
  } catch (error) {
    logger.warn('GeoNames population lookup failed', {
      cityName,
      countryCode,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function fetchWikidataPopulation(
  cityName: string,
  countryCode: string,
  regionName: string,
): Promise<PopulationCandidate | null> {
  const ids = await searchWikidataIds(cityName);
  if (ids.length === 0) {
    return null;
  }

  const values = ids.map((id) => `wd:${id}`).join(' ');
  const countryFilter = countryCode ? `FILTER(?countryCode = "${escapeSparql(countryCode)}")` : '';
  const query = `
SELECT ?item ?itemLabel ?population ?pointInTime ?countryLabel ?countryCode WHERE {
  VALUES ?item { ${values} }
  ?item p:P1082 ?populationStatement.
  ?populationStatement ps:P1082 ?population.
  OPTIONAL { ?populationStatement pq:P585 ?pointInTime. }
  OPTIONAL { ?item wdt:P17 ?country. }
  OPTIONAL { ?country wdt:P297 ?countryCode. }
  ${countryFilter}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?pointInTime) DESC(?population)
LIMIT 20
`;

  try {
    const url = new URL('https://query.wikidata.org/sparql');
    url.searchParams.set('format', 'json');
    url.searchParams.set('query', query);
    const data = await fetchJson(url.toString(), {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'MyLivingWiki population backfill/1.0 (https://mylivingwiki.com)',
    }) as {
      results?: { bindings?: Array<Record<string, { value?: string }>> };
    };
    const bindings = data.results?.bindings ?? [];
    const candidates = bindings
      .map((binding) => {
        const value = Number(binding.population?.value);
        if (!Number.isFinite(value) || value <= 0) {
          return null;
        }
        const itemUrl = binding.item?.value ?? '';
        const itemId = itemUrl.split('/').pop() ?? null;
        const recordCountryCode = binding.countryCode?.value ?? '';
        const year = yearFromDate(binding.pointInTime?.value);
        const label = binding.itemLabel?.value ?? cityName;
        const countryLabel = binding.countryLabel?.value ?? '';
        const score =
          (recordCountryCode && countryCode && recordCountryCode === countryCode ? 100 : 0) +
          (regionName && countryLabel.toLowerCase().includes(regionName.toLowerCase()) ? 10 : 0) +
          (label.toLowerCase() === cityName.toLowerCase() ? 5 : 0) +
          (year ?? 0) / 10000;
        return { value: Math.round(value), year, itemId, itemUrl, recordCountryCode, score };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate)
      .sort((a, b) => b.score - a.score || (b.year ?? 0) - (a.year ?? 0) || b.value - a.value);

    const best = candidates[0];
    if (!best) {
      return null;
    }

    return {
      value: best.value,
      year: best.year,
      scope: 'unknown',
      source: 'wikidata',
      sourceLabel: 'Wikidata',
      sourceUrl: best.itemUrl,
      sourceRecordId: best.itemId,
      confidence: best.recordCountryCode && countryCode && best.recordCountryCode === countryCode ? 'medium' : 'low',
      matchMethod: best.recordCountryCode && countryCode && best.recordCountryCode === countryCode
        ? 'name_country_region'
        : 'name_coords',
    };
  } catch (error) {
    logger.warn('Wikidata population lookup failed', {
      cityName,
      countryCode,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function searchWikidataIds(cityName: string): Promise<string[]> {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbsearchentities');
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'en');
  url.searchParams.set('type', 'item');
  url.searchParams.set('limit', '8');
  url.searchParams.set('search', cityName);

  const data = await fetchJson(url.toString(), {
    Accept: 'application/json',
    'User-Agent': 'MyLivingWiki population backfill/1.0 (https://mylivingwiki.com)',
  }) as { search?: Array<{ id?: string }> };

  return (data.search ?? [])
    .map((item) => item.id)
    .filter((id): id is string => typeof id === 'string' && /^Q\d+$/.test(id));
}

async function fetchCsvPlacePopulationRow(
  url: string,
  normalizedStateCode: string,
  normalizedPlaceCode: string,
): Promise<Record<string, string> | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
      },
    });
    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const header = parseCsvLine(lines[0] ?? '');
    if (header.length === 0) {
      return null;
    }

    const candidates: Record<string, string>[] = [];
    for (const line of lines.slice(1)) {
      const values = parseCsvLine(line);
      if (values.length !== header.length) {
        continue;
      }
      const row = Object.fromEntries(header.map((key, index) => [key, values[index] ?? '']));
      if (row['STATE'] === normalizedStateCode && row['PLACE'] === normalizedPlaceCode) {
        candidates.push(row);
      }
    }

    return (
      candidates.find((row) => row['SUMLEV'] === '162') ??
      candidates.find((row) => row['SUMLEV'] === '170') ??
      candidates.find((row) => row['SUMLEV'] === '172') ??
      candidates[0] ??
      null
    );
  } catch (error) {
    logger.warn('Census population lookup failed', {
      url,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.json();
}

function cleanCityName(value: string): string {
  return value
    .replace(/^my living wiki:\s*/i, '')
    .replace(/\s*\(flagship\)\s*$/i, '')
    .trim();
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function yearFromDate(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
}

function escapeSparql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function sourceLabelFor(source: CityPopulationSource | null): string | null {
  switch (source) {
    case 'us_census_pep':
      return 'U.S. Census Population Estimates Program';
    case 'geonames':
      return 'GeoNames';
    case 'wikidata':
      return 'Wikidata';
    case 'manual':
      return 'Manual entry';
    default:
      return null;
  }
}

function normalizeConfidence(value: unknown): CityPopulationConfidence | null {
  return value === 'high' || value === 'medium' || value === 'low' ? value : null;
}

function failedResult(atlasId: string, cityName: string, message: string): CityPopulationRefreshResult {
  return {
    atlasId,
    status: 'failed',
    cityName,
    population: null,
    populationYear: null,
    source: null,
    sourceLabel: null,
    confidence: null,
    message,
  };
}
