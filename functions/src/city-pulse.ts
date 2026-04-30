import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { db } from './firebase';
import { getStoredPhillyGreenJobsSnapshot } from './green-jobs';
import type { AtlasRecord } from './types';

export type CityPulseMetricFormat = 'number' | 'currency' | 'percent';

export interface CityPulseMetricRealtimeConfig {
  anchor_iso: string;
  baseline_value: number;
  rate_per_second: number;
  min_value?: number | null;
}

export interface CityPulseMetric {
  id: string;
  label: string;
  short_label: string;
  description: string;
  format: CityPulseMetricFormat;
  value: number;
  decimals?: number;
  unit_prefix?: string | null;
  unit_suffix?: string | null;
  source_label: string;
  source_detail?: string | null;
  source_url?: string | null;
  methodology?: string | null;
  cadence: 'realtime' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'manual';
  as_of?: string | null;
  realtime?: CityPulseMetricRealtimeConfig | null;
}

export interface CityPulseSnapshot {
  atlas_id: string;
  city_name: string;
  region_name: string | null;
  refreshed_at: string;
  metrics: CityPulseMetric[];
  notes?: string[];
}

const cityPulseCollection = db.collection('city_pulse_snapshots');
const ATLASES_COLLECTION = db.collection('atlases');
const ACS_YEARS = [2024, 2023, 2022];
const CENSUS_CITY_POPULATION_VINTAGE = 2024;
const LANDING_METRIC_ORDER = [
  'population-now',
  'population-change-annual',
  'median-household-income',
  'median-gross-rent',
  'median-home-value',
  'green-jobs-open',
] as const;

export async function getStoredCityPulseSnapshot(atlasId: string): Promise<CityPulseSnapshot | null> {
  const snapshot = await cityPulseCollection.doc(atlasId).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as Partial<CityPulseSnapshot> | undefined;
  if (!data?.refreshed_at || !data.city_name || !Array.isArray(data.metrics)) {
    return null;
  }

  return {
    atlas_id: String(data.atlas_id ?? atlasId),
    city_name: String(data.city_name),
    region_name: typeof data.region_name === 'string' ? data.region_name : null,
    refreshed_at: String(data.refreshed_at),
    metrics: sortMetricsForLanding(filterSupportedLandingMetrics(sanitizeMetrics(data.metrics))),
    notes: Array.isArray(data.notes) ? data.notes.map((note) => String(note)) : [],
  };
}

export async function refreshStoredCityPulseSnapshot(
  atlasId: string,
  triggeredBy: 'schedule' | 'admin' | 'bootstrap',
): Promise<CityPulseSnapshot> {
  const atlas = await loadCityAtlas(atlasId);
  const cityConfig = atlas.city_config ?? {};
  const cityName = String(cityConfig.city_name ?? '').trim() || atlas.name;
  const regionName = typeof cityConfig.region_name === 'string' ? cityConfig.region_name : null;
  const stateCode = String(cityConfig.census_state_code ?? '').trim();
  const placeCode = String(cityConfig.census_place_code ?? '').trim();
  const refreshedAt = new Date().toISOString();

  const notes: string[] = [];
  const metrics: CityPulseMetric[] = [];

  if (stateCode && placeCode) {
    const [populationData, acsData] = await Promise.all([
      fetchPopulationMetrics(stateCode, placeCode),
      fetchAcsMetrics(stateCode, placeCode),
    ]);

    if (populationData) {
      metrics.push(populationData.populationMetric);
      metrics.push(populationData.changeMetric);
    } else {
      notes.push('Population estimate is missing because the official Census city population dataset did not return a usable record.');
    }

    if (acsData) {
      metrics.push(...acsData);
    } else {
      notes.push('ACS profile metrics are missing because Census ACS endpoints did not return a usable record.');
    }
  } else {
    notes.push('Set Census state and place codes in city settings to enable official city demographics.');
  }

  if ((atlas.slug ?? '').trim().toLowerCase() === 'philly') {
    const greenJobsSnapshot = await getStoredPhillyGreenJobsSnapshot();
    if (greenJobsSnapshot) {
      const openJobs = greenJobsSnapshot.listings.filter((listing) => listing.bucket === 'jobs').length;
      metrics.push({
        id: 'green-jobs-open',
        label: 'Open green jobs',
        short_label: 'green jobs',
        description: 'Open roles currently aggregated across Philly clean-energy and workforce sources.',
        format: 'number',
        value: openJobs,
        source_label: 'Philly institutional jobs snapshot',
        source_detail: 'Philadelphia Energy Authority, Energy Coordinating Agency, and Philadelphia Water Department apprenticeship pages.',
        source_url: 'https://philaenergy.org/',
        methodology: 'Curated institutional source pages are refreshed into a stored snapshot. This is a local aggregation, not an official citywide labor-force statistic.',
        cadence: 'daily',
        as_of: greenJobsSnapshot.refreshedAt,
      });
    } else {
      notes.push('Philly green jobs metrics will appear after the green jobs snapshot has been generated.');
    }
  }

  const mergedMetrics = sortMetricsForLanding(mergeManualMetrics(metrics, cityConfig.manual_metrics));
  const snapshot: CityPulseSnapshot = {
    atlas_id: atlasId,
    city_name: cityName,
    region_name: regionName,
    refreshed_at: refreshedAt,
    metrics: mergedMetrics,
    notes,
  };

  await cityPulseCollection.doc(atlasId).set({
    ...snapshot,
    updated_at: FieldValue.serverTimestamp(),
    trigger: triggeredBy,
  });

  return snapshot;
}

export async function listEnabledCityAtlasIds(): Promise<string[]> {
  const snapshot = await ATLASES_COLLECTION.where('city_config.enabled', '==', true).get();
  return snapshot.docs.map((doc) => doc.id);
}

async function loadCityAtlas(atlasId: string): Promise<{ id: string; slug?: string | null } & AtlasRecord> {
  const snapshot = await ATLASES_COLLECTION.doc(atlasId).get();
  if (!snapshot.exists) {
    throw new Error('Atlas not found.');
  }

  const data = snapshot.data() as AtlasRecord | undefined;
  if (!data?.user_id) {
    throw new Error('Atlas is missing an owner.');
  }
  if (data.city_config?.enabled !== true) {
    throw new Error('City pulse is not enabled for this atlas.');
  }

  return {
    id: snapshot.id,
    ...data,
  };
}

async function fetchPopulationMetrics(stateCode: string, placeCode: string): Promise<{
  populationMetric: CityPulseMetric;
  changeMetric: CityPulseMetric;
} | null> {
  const normalizedStateCode = stateCode.padStart(2, '0');
  const normalizedPlaceCode = placeCode.padStart(5, '0');
  const datasetUrl =
    `https://www2.census.gov/programs-surveys/popest/datasets/2020-${CENSUS_CITY_POPULATION_VINTAGE}/cities/totals/` +
    `sub-est${CENSUS_CITY_POPULATION_VINTAGE}_${normalizedStateCode}.csv`;

  const row = await fetchCsvPlacePopulationRow(datasetUrl, normalizedStateCode, normalizedPlaceCode);
  if (!row) {
    return null;
  }

  const latestYear = CENSUS_CITY_POPULATION_VINTAGE;
  const priorYear = latestYear - 1;
  const latestPopulation = Number(row[`POPESTIMATE${latestYear}`]);
  const priorPopulation = Number(row[`POPESTIMATE${priorYear}`]);
  if (!Number.isFinite(latestPopulation) || !Number.isFinite(priorPopulation)) {
    return null;
  }

  const annualDelta = latestPopulation - priorPopulation;
  const ratePerSecond = annualDelta / (365.25 * 24 * 60 * 60);
  const metricAsOf = `${latestYear}-07-01T00:00:00.000Z`;
  const geographyName = String(row['NAME'] ?? '').trim() || `Place ${normalizedPlaceCode}`;

  return {
    populationMetric: {
      id: 'population-now',
      label: 'Estimated population now',
      short_label: 'population',
      description: 'Interpolated from the latest official Census annual population estimate.',
      format: 'number',
      value: latestPopulation,
      source_label: 'U.S. Census Population and Housing Unit Estimates',
      source_detail: `Vintage ${latestYear} subcounty resident population estimates for ${geographyName} (${row['STNAME'] ?? normalizedStateCode}).`,
      source_url: datasetUrl,
      methodology: 'Anchored to the latest official July 1 city population estimate from the Census place totals dataset, then interpolated client-side using the latest year-over-year change expressed per second.',
      cadence: 'realtime',
      as_of: metricAsOf,
      realtime: {
        anchor_iso: metricAsOf,
        baseline_value: latestPopulation,
        rate_per_second: ratePerSecond,
        min_value: latestPopulation,
      },
    },
    changeMetric: {
      id: 'population-change-annual',
      label: 'Population change / year',
      short_label: 'annual change',
      description: 'Year-over-year population change using the latest two official Census annual estimates.',
      format: 'number',
      value: annualDelta,
      source_label: 'U.S. Census Population and Housing Unit Estimates',
      source_detail: `Computed from POPESTIMATE${priorYear} and POPESTIMATE${latestYear} in the official Census city totals dataset.`,
      source_url: datasetUrl,
      methodology: 'Computed as the most recent annual city population estimate minus the prior annual estimate.',
      cadence: 'yearly',
      as_of: metricAsOf,
    },
  };
}

async function fetchAcsMetrics(stateCode: string, placeCode: string): Promise<CityPulseMetric[] | null> {
  for (const year of ACS_YEARS) {
    const row = await fetchCensusRow(
      `https://api.census.gov/data/${year}/acs/acs5?get=NAME,B19013_001E,B25064_001E,B25077_001E&for=place:${placeCode}&in=state:${stateCode}`,
    );
    if (!row) {
      continue;
    }

    const medianIncome = Number(row['B19013_001E']);
    const medianRent = Number(row['B25064_001E']);
    const medianHomeValue = Number(row['B25077_001E']);
    if (![medianIncome, medianRent, medianHomeValue].some((value) => Number.isFinite(value) && value > 0)) {
      continue;
    }

    const asOf = `${year}-12-31T00:00:00.000Z`;
    const metrics: CityPulseMetric[] = [
      {
        id: 'median-household-income',
        label: 'Median household income',
        short_label: 'median income',
        description: 'Median household income from the American Community Survey 5-year profile.',
        format: 'currency',
        value: Number.isFinite(medianIncome) ? medianIncome : 0,
        source_label: 'U.S. Census ACS 5-Year API',
        source_detail: `Variable B19013_001E from ACS 5-year ${year}.`,
        source_url: 'https://www.census.gov/data/developers/data-sets/acs-5year.html',
        methodology: 'Displayed as the published ACS 5-year estimate for the configured city place geography.',
        cadence: 'yearly',
        as_of: asOf,
      },
      {
        id: 'median-gross-rent',
        label: 'Median gross rent',
        short_label: 'median rent',
        description: 'Median gross rent from the American Community Survey 5-year profile.',
        format: 'currency',
        value: Number.isFinite(medianRent) ? medianRent : 0,
        source_label: 'U.S. Census ACS 5-Year API',
        source_detail: `Variable B25064_001E from ACS 5-year ${year}.`,
        source_url: 'https://www.census.gov/data/developers/data-sets/acs-5year.html',
        methodology: 'Displayed as the published ACS 5-year estimate for the configured city place geography.',
        cadence: 'yearly',
        as_of: asOf,
      },
      {
        id: 'median-home-value',
        label: 'Median home value',
        short_label: 'home value',
        description: 'Median owner-occupied home value from the American Community Survey 5-year profile.',
        format: 'currency',
        value: Number.isFinite(medianHomeValue) ? medianHomeValue : 0,
        source_label: 'U.S. Census ACS 5-Year API',
        source_detail: `Variable B25077_001E from ACS 5-year ${year}.`,
        source_url: 'https://www.census.gov/data/developers/data-sets/acs-5year.html',
        methodology: 'Displayed as the published ACS 5-year estimate for the configured city place geography.',
        cadence: 'yearly',
        as_of: asOf,
      },
    ];
    return metrics.filter((metric) => metric.value > 0);
  }

  return null;
}

async function fetchCensusRow(url: string): Promise<Record<string, string> | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      logger.warn('city pulse census request failed', { url, status: response.status });
      return null;
    }

    const rows = (await response.json()) as string[][];
    if (!Array.isArray(rows) || rows.length < 2) {
      return null;
    }

    const [header, data] = rows;
    if (!Array.isArray(header) || !Array.isArray(data) || header.length !== data.length) {
      return null;
    }

    return Object.fromEntries(header.map((key, index) => [String(key), String(data[index] ?? '')]));
  } catch (error) {
    logger.warn('city pulse census request threw', { url, errorMessage: error instanceof Error ? error.message : String(error) });
    return null;
  }
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
      logger.warn('city pulse population csv request failed', { url, status: response.status });
      return null;
    }

    const text = await response.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length < 2) {
      return null;
    }

    const header = parseCsvLine(lines[0]);
    const candidates: Record<string, string>[] = [];

    for (const line of lines.slice(1)) {
      const values = parseCsvLine(line);
      if (values.length !== header.length) {
        continue;
      }

      const row = Object.fromEntries(header.map((key, index) => [key, values[index] ?? '']));
      if (row['STATE'] !== normalizedStateCode || row['PLACE'] !== normalizedPlaceCode) {
        continue;
      }

      candidates.push(row);
    }

    return (
      candidates.find((row) => row['SUMLEV'] === '162') ??
      candidates.find((row) => row['SUMLEV'] === '170') ??
      candidates.find((row) => row['SUMLEV'] === '172') ??
      candidates[0] ??
      null
    );
  } catch (error) {
    logger.warn('city pulse population csv request threw', {
      url,
      errorMessage: error instanceof Error ? error.message : String(error),
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

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
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

function sanitizeMetrics(metrics: unknown[]): CityPulseMetric[] {
  return metrics
    .map((metric) => sanitizeMetric(metric))
    .filter((metric): metric is CityPulseMetric => !!metric);
}

function sanitizeMetric(metric: unknown): CityPulseMetric | null {
  if (!metric || typeof metric !== 'object') {
    return null;
  }

  const data = metric as Record<string, unknown>;
  const id = String(data.id ?? '').trim();
  const label = String(data.label ?? '').trim();
  if (!id || !label) {
    return null;
  }

  const value = Number(data.value);
  if (!Number.isFinite(value)) {
    return null;
  }

  return {
    id,
    label,
    short_label: String(data.short_label ?? label).trim() || label,
    description: String(data.description ?? '').trim(),
    format: data.format === 'currency' || data.format === 'percent' ? data.format : 'number',
    value,
    decimals: typeof data.decimals === 'number' ? data.decimals : undefined,
    unit_prefix: typeof data.unit_prefix === 'string' ? data.unit_prefix : null,
    unit_suffix: typeof data.unit_suffix === 'string' ? data.unit_suffix : null,
    source_label: String(data.source_label ?? 'Manual').trim() || 'Manual',
    source_detail: typeof data.source_detail === 'string' ? data.source_detail : null,
    source_url: typeof data.source_url === 'string' ? data.source_url : null,
    methodology: typeof data.methodology === 'string' ? data.methodology : null,
    cadence:
      data.cadence === 'realtime' ||
      data.cadence === 'daily' ||
      data.cadence === 'weekly' ||
      data.cadence === 'monthly' ||
      data.cadence === 'yearly'
        ? data.cadence
        : 'manual',
    as_of: typeof data.as_of === 'string' ? data.as_of : null,
    realtime: sanitizeRealtime(data.realtime),
  };
}

function sanitizeRealtime(value: unknown): CityPulseMetricRealtimeConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const data = value as Record<string, unknown>;
  const anchorIso = String(data.anchor_iso ?? '').trim();
  const baselineValue = Number(data.baseline_value);
  const ratePerSecond = Number(data.rate_per_second);
  if (!anchorIso || !Number.isFinite(baselineValue) || !Number.isFinite(ratePerSecond)) {
    return null;
  }

  return {
    anchor_iso: anchorIso,
    baseline_value: baselineValue,
    rate_per_second: ratePerSecond,
    min_value: typeof data.min_value === 'number' ? data.min_value : null,
  };
}

function mergeManualMetrics(metrics: CityPulseMetric[], manualMetrics: unknown): CityPulseMetric[] {
  const merged = new Map(metrics.map((metric) => [metric.id, metric]));
  if (!Array.isArray(manualMetrics)) {
    return Array.from(merged.values());
  }

  for (const metric of sanitizeMetrics(manualMetrics)) {
    merged.set(metric.id, {
      ...metric,
      cadence: metric.cadence === 'manual' ? 'manual' : metric.cadence,
    });
  }

  return Array.from(merged.values());
}

function filterSupportedLandingMetrics(metrics: CityPulseMetric[]): CityPulseMetric[] {
  const allowed = new Set<string>(LANDING_METRIC_ORDER);
  return metrics.filter((metric) => allowed.has(metric.id));
}

function sortMetricsForLanding(metrics: CityPulseMetric[]): CityPulseMetric[] {
  const rank = new Map<string, number>(LANDING_METRIC_ORDER.map((id, index) => [id, index]));
  return [...metrics].sort((left, right) => {
    const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.label.localeCompare(right.label);
  });
}
