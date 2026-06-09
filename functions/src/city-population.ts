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

interface WikidataSearchCandidate {
  id: string;
  label: string;
  description: string;
}

interface WikidataPopulationClaim {
  value: number;
  year: number | null;
  rank: string;
}

const CENSUS_CITY_POPULATION_VINTAGE = 2024;
const ATLASES_COLLECTION = db.collection('atlases');
const COUNTRY_ITEM_BY_CODE: Record<string, string> = {
  AE: 'Q878',
  AR: 'Q414',
  AT: 'Q40',
  AU: 'Q408',
  BE: 'Q31',
  BR: 'Q155',
  CA: 'Q16',
  CH: 'Q39',
  CL: 'Q298',
  CN: 'Q148',
  CO: 'Q739',
  CD: 'Q974',
  CZ: 'Q213',
  DE: 'Q183',
  DK: 'Q35',
  EG: 'Q79',
  ES: 'Q29',
  FI: 'Q33',
  FR: 'Q142',
  GB: 'Q145',
  GH: 'Q117',
  GR: 'Q41',
  HU: 'Q28',
  IE: 'Q27',
  IL: 'Q801',
  IN: 'Q668',
  IT: 'Q38',
  JP: 'Q17',
  KE: 'Q114',
  KR: 'Q884',
  MA: 'Q1028',
  MX: 'Q96',
  NL: 'Q55',
  NO: 'Q20',
  NG: 'Q1033',
  NZ: 'Q664',
  PE: 'Q419',
  PL: 'Q36',
  PR: 'Q1183',
  PT: 'Q45',
  QA: 'Q846',
  SG: 'Q334',
  SE: 'Q34',
  TH: 'Q869',
  TR: 'Q43',
  TW: 'Q865',
  US: 'Q30',
  ZA: 'Q258',
};
const COUNTRY_CODE_BY_REGION_KEY: Record<string, string> = {
  argentina: 'AR',
  austria: 'AT',
  australia: 'AU',
  belgium: 'BE',
  brazil: 'BR',
  canada: 'CA',
  chile: 'CL',
  china: 'CN',
  colombia: 'CO',
  'czech-republic': 'CZ',
  denmark: 'DK',
  'democratic-republic-of-the-congo': 'CD',
  drc: 'CD',
  egypt: 'EG',
  finland: 'FI',
  france: 'FR',
  germany: 'DE',
  ghana: 'GH',
  greece: 'GR',
  hungary: 'HU',
  india: 'IN',
  ireland: 'IE',
  israel: 'IL',
  italy: 'IT',
  japan: 'JP',
  kenya: 'KE',
  mexico: 'MX',
  morocco: 'MA',
  netherlands: 'NL',
  'new-zealand': 'NZ',
  nigeria: 'NG',
  norway: 'NO',
  peru: 'PE',
  poland: 'PL',
  'puerto-rico': 'PR',
  portugal: 'PT',
  qatar: 'QA',
  singapore: 'SG',
  'south-africa': 'ZA',
  'south-korea': 'KR',
  spain: 'ES',
  sweden: 'SE',
  switzerland: 'CH',
  taiwan: 'TW',
  thailand: 'TH',
  turkey: 'TR',
  'turks-and-caicos': 'TC',
  'turks-caicos': 'TC',
  'united-arab-emirates': 'AE',
  'united-kingdom': 'GB',
  'united-states': 'US',
  uk: 'GB',
  usa: 'US',
};
const COUNTRY_CODE_BY_TIMEZONE: Record<string, string> = {
  'Africa/Accra': 'GH',
  'Africa/Cairo': 'EG',
  'Africa/Casablanca': 'MA',
  'Africa/Johannesburg': 'ZA',
  'Africa/Kinshasa': 'CD',
  'Africa/Lagos': 'NG',
  'Africa/Nairobi': 'KE',
  'America/Argentina/Buenos_Aires': 'AR',
  'America/Bogota': 'CO',
  'America/Grand_Turk': 'TC',
  'America/Lima': 'PE',
  'America/Mexico_City': 'MX',
  'America/Puerto_Rico': 'PR',
  'America/Santiago': 'CL',
  'America/Sao_Paulo': 'BR',
  'Asia/Bangkok': 'TH',
  'Asia/Dubai': 'AE',
  'Asia/Hong_Kong': 'CN',
  'Asia/Jerusalem': 'IL',
  'Asia/Kolkata': 'IN',
  'Asia/Qatar': 'QA',
  'Asia/Shanghai': 'CN',
  'Asia/Seoul': 'KR',
  'Asia/Singapore': 'SG',
  'Asia/Taipei': 'TW',
  'Asia/Tokyo': 'JP',
  'Australia/Sydney': 'AU',
  'Europe/Amsterdam': 'NL',
  'Europe/Athens': 'GR',
  'Europe/Berlin': 'DE',
  'Europe/Brussels': 'BE',
  'Europe/Budapest': 'HU',
  'Europe/Copenhagen': 'DK',
  'Europe/Dublin': 'IE',
  'Europe/Helsinki': 'FI',
  'Europe/Istanbul': 'TR',
  'Europe/Lisbon': 'PT',
  'Europe/London': 'GB',
  'Europe/Madrid': 'ES',
  'Europe/Oslo': 'NO',
  'Europe/Paris': 'FR',
  'Europe/Prague': 'CZ',
  'Europe/Rome': 'IT',
  'Europe/Stockholm': 'SE',
  'Europe/Vienna': 'AT',
  'Europe/Warsaw': 'PL',
  'Europe/Zurich': 'CH',
  'Pacific/Auckland': 'NZ',
};
const SEEDED_POPULATIONS: Record<string, Omit<PopulationCandidate, 'sourceUrl' | 'sourceRecordId'>> = {
  'abu-dhabi-ae': seededPopulation(1650000, 2023, 'Abu Dhabi Statistics Centre estimate'),
  'accra-gh': seededPopulation(2841000, 2021, 'Ghana 2021 census metropolitan district estimate'),
  'amsterdam-nl': seededPopulation(933680, 2024, 'Municipality of Amsterdam estimate'),
  'auckland-nz': seededPopulation(1695100, 2024, 'Stats NZ Auckland region estimate'),
  'bangkok-th': seededPopulation(5475000, 2024, 'Bangkok registered population estimate'),
  'beijing-cn': seededPopulation(21858000, 2023, 'Beijing municipal statistical estimate'),
  'budapest-hu': seededPopulation(1686851, 2024, 'Hungarian Central Statistical Office estimate'),
  'buenos-aires-ar': seededPopulation(3121707, 2022, 'INDEC city estimate'),
  'dubai-ae': seededPopulation(3825000, 2025, 'Dubai Statistics Center population clock estimate'),
  'doha-qa': seededPopulation(1186000, 2024, 'Qatar Planning and Statistics Authority municipality estimate'),
  'helsinki-fi': seededPopulation(684018, 2024, 'Statistics Finland municipal estimate'),
  'hong-kong-cn': seededPopulation(7531800, 2024, 'Hong Kong Census and Statistics Department estimate'),
  'istanbul-tr': seededPopulation(15655924, 2023, 'Turkish Statistical Institute province estimate'),
  'jerusalem-il': seededPopulation(989000, 2022, 'Jerusalem Institute statistical yearbook estimate'),
  'kinshasa-cd': seededPopulation(17032000, 2024, 'UN urban agglomeration estimate'),
  'lima-pe': seededPopulation(10092000, 2024, 'INEI Lima metropolitan estimate'),
  'marrakech-ma': seededPopulation(966987, 2024, 'Morocco population estimate'),
  'mumbai-in': seededPopulation(12442373, 2011, 'India Census municipal corporation count'),
  'nairobi-ke': seededPopulation(5545000, 2024, 'UN urban agglomeration estimate'),
  'oslo-no': seededPopulation(717710, 2024, 'Statistics Norway municipal estimate'),
  'santiago-cl': seededPopulation(6257516, 2017, 'Chile census metropolitan estimate'),
  'seoul-kr': seededPopulation(9367000, 2024, 'Seoul resident registration estimate'),
  'shanghai-cn': seededPopulation(24870000, 2023, 'Shanghai municipal statistical estimate'),
  'singapore-sg': seededPopulation(6040000, 2024, 'Singapore Department of Statistics estimate'),
  'stockholm-se': seededPopulation(984748, 2024, 'Statistics Sweden municipal estimate'),
  'taipei-tw': seededPopulation(2494000, 2024, 'Taipei household registration estimate'),
  'tel-aviv-il': seededPopulation(482500, 2023, 'Tel Aviv municipal estimate'),
  'the-hamptons-us': seededPopulation(97421, 2020, 'Southampton and East Hampton town census total'),
  'tokyo-jp': seededPopulation(14180000, 2024, 'Tokyo Metropolitan Government estimate'),
  'turks-caicos-tc': seededPopulation(46535, 2024, 'Turks and Caicos Islands population estimate'),
  'zurich-ch': seededPopulation(443037, 2024, 'City of Zurich statistical estimate'),
};

const GLOBAL_AGGLOMERATION_POPULATIONS: Record<string, Omit<PopulationCandidate, 'sourceUrl' | 'sourceRecordId'>> = {
  'jakarta-id': urbanAgglomerationPopulation(41900000, 2025, 'UN World Urbanization Prospects 2025 urban agglomeration estimate'),
  'dhaka-bd': urbanAgglomerationPopulation(36600000, 2025, 'UN World Urbanization Prospects 2025 urban agglomeration estimate'),
  'tokyo-jp': urbanAgglomerationPopulation(33400000, 2025, 'UN World Urbanization Prospects 2025 urban agglomeration estimate'),
  'delhi-in': urbanAgglomerationPopulation(30200000, 2025, 'UN World Urbanization Prospects 2025 urban agglomeration estimate'),
  'new-delhi-in': urbanAgglomerationPopulation(30200000, 2025, 'UN World Urbanization Prospects 2025 urban agglomeration estimate'),
  'shanghai-cn': urbanAgglomerationPopulation(29600000, 2025, 'UN World Urbanization Prospects 2025 urban agglomeration estimate'),
  'guangzhou-cn': urbanAgglomerationPopulation(27600000, 2025, 'UN World Urbanization Prospects 2025 urban agglomeration estimate'),
  'cairo-eg': urbanAgglomerationPopulation(25600000, 2025, 'UN World Urbanization Prospects 2025 urban agglomeration estimate'),
  'manila-ph': urbanAgglomerationPopulation(24700000, 2025, 'UN World Urbanization Prospects 2025 urban agglomeration estimate'),
  'kolkata-in': urbanAgglomerationPopulation(22600000, 2025, 'UN World Urbanization Prospects 2025 urban agglomeration estimate'),
  'seoul-kr': urbanAgglomerationPopulation(22500000, 2025, 'UN World Urbanization Prospects 2025 urban agglomeration estimate'),
  'mumbai-in': urbanAgglomerationPopulation(21000000, 2026, 'Global urban agglomeration planning estimate'),
  'sao-paulo-br': urbanAgglomerationPopulation(22400000, 2026, 'Global urban agglomeration planning estimate'),
  'mexico-city-mx': urbanAgglomerationPopulation(22500000, 2026, 'Global urban agglomeration planning estimate'),
  'beijing-cn': urbanAgglomerationPopulation(22000000, 2026, 'Global urban agglomeration planning estimate'),
  'istanbul-tr': urbanAgglomerationPopulation(16000000, 2026, 'Global urban agglomeration planning estimate'),
  'buenos-aires-ar': urbanAgglomerationPopulation(15700000, 2026, 'Global urban agglomeration planning estimate'),
  'karachi-pk': urbanAgglomerationPopulation(20500000, 2026, 'Global urban agglomeration planning estimate'),
  'lagos-ng': urbanAgglomerationPopulation(16600000, 2026, 'Global urban agglomeration planning estimate'),
  'los-angeles-us': urbanAgglomerationPopulation(12500000, 2026, 'Global urban agglomeration planning estimate'),
  'kinshasa-cd': urbanAgglomerationPopulation(17032000, 2024, 'UN urban agglomeration estimate'),
  'lima-pe': urbanAgglomerationPopulation(10092000, 2024, 'INEI Lima metropolitan estimate'),
  'london-gb': urbanAgglomerationPopulation(11200000, 2026, 'Global urban agglomeration planning estimate'),
  'paris-fr': urbanAgglomerationPopulation(11000000, 2026, 'Global urban agglomeration planning estimate'),
  'new-york-city-us': metroPopulation(19940274, 2024, 'U.S. Census Bureau New York-Newark-Jersey City metropolitan estimate'),
  'new-york-us': metroPopulation(19940274, 2024, 'U.S. Census Bureau New York-Newark-Jersey City metropolitan estimate'),
  'rio-de-janeiro-br': urbanAgglomerationPopulation(13400000, 2026, 'Global urban agglomeration planning estimate'),
  'chicago-us': metroPopulation(9300000, 2026, 'Global metro planning estimate'),
  'hong-kong-cn': urbanAgglomerationPopulation(7500000, 2026, 'Global urban agglomeration planning estimate'),
  'hong-kong-hk': urbanAgglomerationPopulation(7500000, 2026, 'Global urban agglomeration planning estimate'),
  'madrid-es': urbanAgglomerationPopulation(6800000, 2026, 'Global urban agglomeration planning estimate'),
  'washington-dc-us': metroPopulation(6300000, 2026, 'Global metro planning estimate'),
  'toronto-ca': metroPopulation(6200000, 2026, 'Global metro planning estimate'),
  'miami-us': metroPopulation(6200000, 2026, 'Global metro planning estimate'),
  'singapore-sg': urbanAgglomerationPopulation(6040000, 2024, 'Singapore Department of Statistics estimate'),
  'philadelphia-us': metroPopulation(6300000, 2026, 'Global metro planning estimate'),
  'atlanta-us': metroPopulation(6100000, 2026, 'Global metro planning estimate'),
  'barcelona-es': urbanAgglomerationPopulation(5600000, 2026, 'Global urban agglomeration planning estimate'),
  'boston-us': metroPopulation(4900000, 2026, 'Global metro planning estimate'),
  'san-francisco-us': metroPopulation(4700000, 2026, 'Global metro planning estimate'),
  'detroit-us': metroPopulation(4300000, 2026, 'Global metro planning estimate'),
  'phoenix-us': metroPopulation(5000000, 2026, 'Global metro planning estimate'),
  'seattle-us': metroPopulation(4000000, 2026, 'Global metro planning estimate'),
  'montreal-ca': metroPopulation(4300000, 2026, 'Global metro planning estimate'),
  'sydney-au': urbanAgglomerationPopulation(5400000, 2026, 'Global urban agglomeration planning estimate'),
  'berlin-de': urbanAgglomerationPopulation(4700000, 2026, 'Global urban agglomeration planning estimate'),
  'rome-it': urbanAgglomerationPopulation(4300000, 2026, 'Global urban agglomeration planning estimate'),
  'milan-it': urbanAgglomerationPopulation(3200000, 2026, 'Global urban agglomeration planning estimate'),
  'athens-gr': urbanAgglomerationPopulation(3400000, 2026, 'Global urban agglomeration planning estimate'),
  'nairobi-ke': urbanAgglomerationPopulation(5545000, 2024, 'UN urban agglomeration estimate'),
  'cape-town-za': urbanAgglomerationPopulation(4772000, 2024, 'Global urban agglomeration planning estimate'),
  'accra-gh': urbanAgglomerationPopulation(5500000, 2026, 'Global urban agglomeration planning estimate'),
  'taipei-tw': urbanAgglomerationPopulation(7000000, 2026, 'Global urban agglomeration planning estimate'),
  'dubai-ae': urbanAgglomerationPopulation(3825000, 2025, 'Dubai Statistics Center population clock estimate'),
  'san-diego-us': metroPopulation(3300000, 2026, 'Global metro planning estimate'),
  'denver-us': metroPopulation(3000000, 2026, 'Global metro planning estimate'),
  'las-vegas-us': metroPopulation(2900000, 2026, 'Global metro planning estimate'),
  'portland-us': metroPopulation(2500000, 2026, 'Global metro planning estimate'),
  'austin-us': metroPopulation(2500000, 2026, 'Global metro planning estimate'),
  'nashville-us': metroPopulation(2100000, 2026, 'Global metro planning estimate'),
  'new-orleans-us': metroPopulation(1300000, 2026, 'Global metro planning estimate'),
  'vancouver-ca': metroPopulation(2800000, 2026, 'Global metro planning estimate'),
  'lisbon-pt': urbanAgglomerationPopulation(3000000, 2026, 'Global urban agglomeration planning estimate'),
  'prague-cz': urbanAgglomerationPopulation(2200000, 2026, 'Global urban agglomeration planning estimate'),
  'vienna-at': urbanAgglomerationPopulation(2000000, 2026, 'Global urban agglomeration planning estimate'),
  'brussels-be': urbanAgglomerationPopulation(2100000, 2026, 'Global urban agglomeration planning estimate'),
  'stockholm-se': urbanAgglomerationPopulation(1700000, 2026, 'Global urban agglomeration planning estimate'),
  'copenhagen-dk': urbanAgglomerationPopulation(1700000, 2026, 'Global urban agglomeration planning estimate'),
  'dublin-ie': urbanAgglomerationPopulation(1500000, 2026, 'Global urban agglomeration planning estimate'),
  'helsinki-fi': urbanAgglomerationPopulation(1300000, 2026, 'Global urban agglomeration planning estimate'),
  'oslo-no': urbanAgglomerationPopulation(1100000, 2026, 'Global urban agglomeration planning estimate'),
  'warsaw-pl': urbanAgglomerationPopulation(1800000, 2026, 'Global urban agglomeration planning estimate'),
  'budapest-hu': urbanAgglomerationPopulation(2500000, 2026, 'Global urban agglomeration planning estimate'),
  'naples-it': urbanAgglomerationPopulation(3000000, 2026, 'Global urban agglomeration planning estimate'),
  'kyoto-jp': urbanAgglomerationPopulation(1500000, 2026, 'Global urban agglomeration planning estimate'),
  'hiroshima-jp': urbanAgglomerationPopulation(1400000, 2026, 'Global urban agglomeration planning estimate'),
  'doha-qa': urbanAgglomerationPopulation(2400000, 2026, 'Global urban agglomeration planning estimate'),
};

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
  const countryCode = inferCountryCode(cityConfig);
  const regionName = typeof cityConfig.region_name === 'string' ? cityConfig.region_name.trim() : '';

  const globalAgglomeration = globalAgglomerationPopulationFor(cityName, countryCode);
  if (globalAgglomeration) {
    return globalAgglomeration;
  }

  if (countryCode === 'US' && cityConfig.census_state_code && cityConfig.census_place_code) {
    const census = await fetchCensusPopulation(
      String(cityConfig.census_state_code),
      String(cityConfig.census_place_code),
    );
    if (census) {
      return census;
    }
  }

  const seeded = seededPopulationFor(cityName, countryCode);
  if (seeded) {
    return seeded;
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
    const data = await fetchJson(url.toString(), {}, 8_000) as { geonames?: Array<Record<string, unknown>> };
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
  const searchCandidates = await searchWikidataCandidates(cityName);
  if (searchCandidates.length === 0) {
    return null;
  }

  const ids = searchCandidates.map((candidate) => candidate.id);
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
      'User-Agent': 'LivingWiki population backfill/1.0 (https://livingwiki.com)',
    }, 8_000) as {
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
  }

  return await fetchWikidataEntityPopulation(cityName, countryCode, regionName, searchCandidates);
}

async function fetchWikidataEntityPopulation(
  cityName: string,
  countryCode: string,
  regionName: string,
  searchCandidates: WikidataSearchCandidate[],
): Promise<PopulationCandidate | null> {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('format', 'json');
  url.searchParams.set('props', 'claims|labels|descriptions');
  url.searchParams.set('languages', 'en');
  url.searchParams.set('ids', searchCandidates.map((candidate) => candidate.id).join('|'));

  try {
    const data = await fetchJson(url.toString(), {
      Accept: 'application/json',
      'User-Agent': 'LivingWiki population backfill/1.0 (https://livingwiki.com)',
    }, 8_000) as { entities?: Record<string, Record<string, unknown>> };
    const entities = data.entities ?? {};
    const expectedCountryItem = countryCode ? COUNTRY_ITEM_BY_CODE[countryCode] ?? null : null;

    const scored = searchCandidates
      .map((candidate, index) => {
        const entity = entities[candidate.id];
        if (!entity || entity['missing'] === '') {
          return null;
        }

        const claims = entity['claims'] as Record<string, unknown[]> | undefined;
        const countryItems = claimEntityIds(claims?.['P17']);
        if (expectedCountryItem && countryItems.length > 0 && !countryItems.includes(expectedCountryItem)) {
          return null;
        }

        const population = latestPopulationClaim(claims?.['P1082']);
        if (!population) {
          return null;
        }

        const label = labelFromEntity(entity) || candidate.label;
        const description = descriptionFromEntity(entity) || candidate.description;
        const labelKey = normalizeForMatch(label);
        const cityKey = normalizeForMatch(cityName);
        const regionKey = normalizeForMatch(regionName);
        const matchedCountry = !!expectedCountryItem && countryItems.includes(expectedCountryItem);
        const score =
          (matchedCountry ? 100 : 0) +
          (labelKey === cityKey ? 35 : 0) +
          (labelKey.includes(cityKey) || cityKey.includes(labelKey) ? 10 : 0) +
          (regionKey && normalizeForMatch(description).includes(regionKey) ? 8 : 0) +
          (descriptionLooksLikePlace(description) ? 6 : 0) +
          Math.max(0, 8 - index) +
          (population.year ?? 0) / 10000;
        return {
          candidate,
          population,
          matchedCountry,
          score,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate)
      .sort((a, b) =>
        b.score - a.score ||
        (b.population.year ?? 0) - (a.population.year ?? 0) ||
        b.population.value - a.population.value,
      );

    const best = scored[0];
    if (!best) {
      return null;
    }

    return {
      value: best.population.value,
      year: best.population.year,
      scope: 'unknown',
      source: 'wikidata',
      sourceLabel: 'Wikidata direct entity claims',
      sourceUrl: `https://www.wikidata.org/wiki/${best.candidate.id}`,
      sourceRecordId: best.candidate.id,
      confidence: best.matchedCountry || normalizeForMatch(best.candidate.label) === normalizeForMatch(cityName)
        ? 'medium'
        : 'low',
      matchMethod: best.matchedCountry ? 'name_country_region' : 'name_coords',
    };
  } catch (error) {
    logger.warn('Wikidata entity population lookup failed', {
      cityName,
      countryCode,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function searchWikidataCandidates(cityName: string): Promise<WikidataSearchCandidate[]> {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbsearchentities');
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'en');
  url.searchParams.set('type', 'item');
  url.searchParams.set('limit', '8');
  url.searchParams.set('search', cityName);

  const data = await fetchJson(url.toString(), {
    Accept: 'application/json',
    'User-Agent': 'LivingWiki population backfill/1.0 (https://livingwiki.com)',
  }, 6_000) as { search?: Array<{ id?: string; label?: string; description?: string }> };

  return (data.search ?? [])
    .map((item) => ({
      id: item.id ?? '',
      label: item.label ?? '',
      description: item.description ?? '',
    }))
    .filter((item) => /^Q\d+$/.test(item.id));
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

async function fetchJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 10_000,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function cleanCityName(value: string): string {
  return value
    .replace(/^living wiki:\s*/i, '')
    .replace(/\s*\(flagship\)\s*$/i, '')
    .trim();
}

function inferCountryCode(cityConfig: NonNullable<AtlasRecord['city_config']>): string {
  const explicit = typeof cityConfig.country_code === 'string' ? cityConfig.country_code.trim().toUpperCase() : '';
  const regionKey = normalizeSeedKey(typeof cityConfig.region_name === 'string' ? cityConfig.region_name : '');
  const timezone = typeof cityConfig.timezone === 'string' ? cityConfig.timezone.trim() : '';
  const regionInferred = regionKey ? COUNTRY_CODE_BY_REGION_KEY[regionKey] ?? '' : '';
  const timezoneInferred = timezone ? COUNTRY_CODE_BY_TIMEZONE[timezone] ?? '' : '';

  if (regionInferred && (!explicit || explicit === 'US' || explicit !== regionInferred)) {
    return regionInferred;
  }

  if (timezoneInferred && (!explicit || explicit === 'US' || explicit !== timezoneInferred)) {
    return timezoneInferred;
  }

  if (explicit) {
    return explicit;
  }

  return '';
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

function latestPopulationClaim(claims: unknown[] | undefined): WikidataPopulationClaim | null {
  const parsed = (claims ?? [])
    .map((claim): WikidataPopulationClaim | null => {
      if (!claim || typeof claim !== 'object') {
        return null;
      }
      const data = claim as Record<string, unknown>;
      if (data['rank'] === 'deprecated') {
        return null;
      }
      const mainsnak = data['mainsnak'] as Record<string, unknown> | undefined;
      const datavalue = mainsnak?.['datavalue'] as Record<string, unknown> | undefined;
      const value = datavalue?.['value'] as Record<string, unknown> | undefined;
      const amount = typeof value?.['amount'] === 'string' ? Number(value['amount']) : NaN;
      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      const qualifiers = data['qualifiers'] as Record<string, unknown[]> | undefined;
      const year = yearFromWikidataTimeClaim(qualifiers?.['P585']?.[0])
        ?? yearFromWikidataTimeClaim(qualifiers?.['P813']?.[0]);

      return {
        value: Math.round(amount),
        year,
        rank: typeof data['rank'] === 'string' ? data['rank'] : 'normal',
      };
    })
    .filter((claim): claim is WikidataPopulationClaim => !!claim)
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        if (a.rank === 'preferred') return -1;
        if (b.rank === 'preferred') return 1;
      }
      return (b.year ?? 0) - (a.year ?? 0) || b.value - a.value;
    });

  return parsed[0] ?? null;
}

function claimEntityIds(claims: unknown[] | undefined): string[] {
  return (claims ?? [])
    .map((claim) => {
      if (!claim || typeof claim !== 'object') {
        return null;
      }
      const mainsnak = (claim as Record<string, unknown>)['mainsnak'] as Record<string, unknown> | undefined;
      const datavalue = mainsnak?.['datavalue'] as Record<string, unknown> | undefined;
      const value = datavalue?.['value'] as Record<string, unknown> | undefined;
      const id = value?.['id'];
      return typeof id === 'string' ? id : null;
    })
    .filter((id): id is string => !!id);
}

function yearFromWikidataTimeClaim(claim: unknown): number | null {
  if (!claim || typeof claim !== 'object') {
    return null;
  }
  const datavalue = ((claim as Record<string, unknown>)['datavalue'] as Record<string, unknown> | undefined);
  const value = datavalue?.['value'] as Record<string, unknown> | undefined;
  const time = typeof value?.['time'] === 'string' ? value['time'] : null;
  if (!time) {
    return null;
  }
  const match = time.match(/[+-](\d{4})-/);
  return match ? Number(match[1]) : null;
}

function labelFromEntity(entity: Record<string, unknown>): string | null {
  const labels = entity['labels'] as Record<string, { value?: string }> | undefined;
  return labels?.['en']?.value ?? null;
}

function descriptionFromEntity(entity: Record<string, unknown>): string | null {
  const descriptions = entity['descriptions'] as Record<string, { value?: string }> | undefined;
  return descriptions?.['en']?.value ?? null;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/^city of\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function descriptionLooksLikePlace(description: string): boolean {
  const normalized = description.toLowerCase();
  return [
    'capital',
    'city',
    'municipality',
    'metropolis',
    'largest city',
    'federal territory',
    'administrative division',
  ].some((fragment) => normalized.includes(fragment));
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

function seededPopulation(value: number, year: number, sourceLabel: string): Omit<PopulationCandidate, 'sourceUrl' | 'sourceRecordId'> {
  return {
    value,
    year,
    scope: 'unknown',
    source: 'manual',
    sourceLabel,
    confidence: 'medium',
    matchMethod: 'manual',
  };
}

function urbanAgglomerationPopulation(
  value: number,
  year: number,
  sourceLabel: string,
): Omit<PopulationCandidate, 'sourceUrl' | 'sourceRecordId'> {
  return {
    value,
    year,
    scope: 'urban_agglomeration',
    source: 'manual',
    sourceLabel,
    confidence: sourceLabel.includes('UN World Urbanization Prospects') ? 'high' : 'medium',
    matchMethod: 'manual',
  };
}

function metroPopulation(
  value: number,
  year: number,
  sourceLabel: string,
): Omit<PopulationCandidate, 'sourceUrl' | 'sourceRecordId'> {
  return {
    value,
    year,
    scope: 'metro',
    source: 'manual',
    sourceLabel,
    confidence: sourceLabel.includes('U.S. Census Bureau') ? 'high' : 'medium',
    matchMethod: 'manual',
  };
}

function globalAgglomerationPopulationFor(cityName: string, countryCode: string): PopulationCandidate | null {
  const country = countryCode.trim().toUpperCase();
  if (!country) {
    return null;
  }
  const key = `${normalizeSeedKey(cityName)}-${country.toLowerCase()}`;
  const preferred = GLOBAL_AGGLOMERATION_POPULATIONS[key];
  if (!preferred) {
    return null;
  }
  return {
    ...preferred,
    sourceUrl: preferred.sourceLabel.includes('UN World Urbanization Prospects')
      ? 'https://population.un.org/wup/'
      : 'manual-seed:global-city-population-tiers',
    sourceRecordId: key,
  };
}

function seededPopulationFor(cityName: string, countryCode: string): PopulationCandidate | null {
  const country = countryCode.trim().toUpperCase();
  if (!country) {
    return null;
  }
  const key = `${normalizeSeedKey(cityName)}-${country.toLowerCase()}`;
  const seeded = SEEDED_POPULATIONS[key];
  if (!seeded) {
    return null;
  }
  return {
    ...seeded,
    sourceUrl: 'manual-seed:city-population',
    sourceRecordId: key,
  };
}

function normalizeSeedKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^city of\s+/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
