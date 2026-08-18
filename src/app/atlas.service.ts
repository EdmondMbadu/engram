import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import type { AtlasAdminProfile, AtlasChatGuideConfig, AtlasItem, AtlasNewsletterConfig, AtlasNewsletterTestResult, AtlasSubscriptionItem, AtlasTextMessagingConfig, AtlasUsage, AtlasVoiceAgentConfig, CityAtlasConfig, CityAtlasMetadata, CityPulseMetric, UniversityAtlasConfig } from './atlas.models';
import { AuthService } from './auth.service';
import type { CityAtlasTemplate } from './city-atlas-templates';
import { getFirebaseFirestore, getFirebaseFunctions, getFirebaseStorage } from './firebase.client';

const ACTIVE_ATLAS_STORAGE_KEY = 'living-atlas:activeAtlasId';
const DEFAULT_CITY_LOGO_URL = '/assets/image/lucky-paper-crane.png';
const COUNTRY_LABEL_BY_CODE: Record<string, string> = {
  AE: 'United Arab Emirates',
  AO: 'Angola',
  AR: 'Argentina',
  AT: 'Austria',
  AU: 'Australia',
  BE: 'Belgium',
  BR: 'Brazil',
  CA: 'Canada',
  CH: 'Switzerland',
  CI: "Cote d'Ivoire",
  CL: 'Chile',
  CN: 'China',
  CO: 'Colombia',
  CZ: 'Czech Republic',
  CD: 'Democratic Republic of the Congo',
  BD: 'Bangladesh',
  DE: 'Germany',
  DK: 'Denmark',
  EC: 'Ecuador',
  HR: 'Croatia',
  EG: 'Egypt',
  ES: 'Spain',
  ET: 'Ethiopia',
  FI: 'Finland',
  FR: 'France',
  GB: 'United Kingdom',
  GH: 'Ghana',
  GR: 'Greece',
  HU: 'Hungary',
  ID: 'Indonesia',
  IE: 'Ireland',
  IL: 'Israel',
  IN: 'India',
  IQ: 'Iraq',
  IR: 'Iran',
  IT: 'Italy',
  JP: 'Japan',
  KE: 'Kenya',
  KW: 'Kuwait',
  KR: 'South Korea',
  MA: 'Morocco',
  MM: 'Myanmar',
  MY: 'Malaysia',
  MX: 'Mexico',
  NL: 'Netherlands',
  NO: 'Norway',
  NG: 'Nigeria',
  NZ: 'New Zealand',
  OM: 'Oman',
  PH: 'Philippines',
  PK: 'Pakistan',
  PE: 'Peru',
  PL: 'Poland',
  PR: 'Puerto Rico',
  PT: 'Portugal',
  QA: 'Qatar',
  RS: 'Serbia',
  RU: 'Russia',
  SA: 'Saudi Arabia',
  SG: 'Singapore',
  SI: 'Slovenia',
  SD: 'Sudan',
  SE: 'Sweden',
  TC: 'Turks and Caicos Islands',
  TH: 'Thailand',
  TR: 'Turkey',
  TW: 'Taiwan',
  TZ: 'Tanzania',
  US: 'United States',
  VE: 'Venezuela',
  VN: 'Vietnam',
  ZA: 'South Africa',
};
const COUNTRY_BY_REGION_KEY: Record<string, string> = {
  argentina: 'Argentina',
  austria: 'Austria',
  australia: 'Australia',
  belgium: 'Belgium',
  brazil: 'Brazil',
  canada: 'Canada',
  chile: 'Chile',
  china: 'China',
  colombia: 'Colombia',
  'czech-republic': 'Czech Republic',
  denmark: 'Denmark',
  'democratic-republic-of-the-congo': 'Democratic Republic of the Congo',
  drc: 'Democratic Republic of the Congo',
  egypt: 'Egypt',
  finland: 'Finland',
  france: 'France',
  germany: 'Germany',
  ghana: 'Ghana',
  greece: 'Greece',
  hungary: 'Hungary',
  india: 'India',
  ireland: 'Ireland',
  israel: 'Israel',
  italy: 'Italy',
  japan: 'Japan',
  kenya: 'Kenya',
  mexico: 'Mexico',
  morocco: 'Morocco',
  netherlands: 'Netherlands',
  'new-zealand': 'New Zealand',
  nigeria: 'Nigeria',
  norway: 'Norway',
  peru: 'Peru',
  poland: 'Poland',
  'puerto-rico': 'Puerto Rico',
  qatar: 'Qatar',
  portugal: 'Portugal',
  singapore: 'Singapore',
  'south-africa': 'South Africa',
  'south-korea': 'South Korea',
  spain: 'Spain',
  sweden: 'Sweden',
  switzerland: 'Switzerland',
  taiwan: 'Taiwan',
  thailand: 'Thailand',
  turkey: 'Turkey',
  'turks-and-caicos': 'Turks and Caicos Islands',
  'turks-caicos': 'Turks and Caicos Islands',
  'united-arab-emirates': 'United Arab Emirates',
  'united-kingdom': 'United Kingdom',
  'united-states': 'United States',
  uk: 'United Kingdom',
  usa: 'United States',
};
const COUNTRY_BY_TIMEZONE: Record<string, string> = {
  'Africa/Accra': 'Ghana',
  'Africa/Cairo': 'Egypt',
  'Africa/Casablanca': 'Morocco',
  'Africa/Abidjan': "Cote d'Ivoire",
  'Africa/Addis_Ababa': 'Ethiopia',
  'Africa/Dar_es_Salaam': 'Tanzania',
  'Africa/Johannesburg': 'South Africa',
  'Africa/Kinshasa': 'Democratic Republic of the Congo',
  'Africa/Lagos': 'Nigeria',
  'Africa/Luanda': 'Angola',
  'Africa/Nairobi': 'Kenya',
  'America/Argentina/Buenos_Aires': 'Argentina',
  'America/Bogota': 'Colombia',
  'America/Caracas': 'Venezuela',
  'America/Edmonton': 'Canada',
  'America/Grand_Turk': 'Turks and Caicos Islands',
  'America/Guayaquil': 'Ecuador',
  'America/Lima': 'Peru',
  'America/Mexico_City': 'Mexico',
  'America/Puerto_Rico': 'Puerto Rico',
  'America/Santiago': 'Chile',
  'America/Sao_Paulo': 'Brazil',
  'Asia/Bangkok': 'Thailand',
  'Asia/Dhaka': 'Bangladesh',
  'Asia/Dubai': 'United Arab Emirates',
  'Asia/Hong_Kong': 'China',
  'Asia/Ho_Chi_Minh': 'Vietnam',
  'Asia/Jakarta': 'Indonesia',
  'Asia/Jerusalem': 'Israel',
  'Asia/Karachi': 'Pakistan',
  'Asia/Kolkata': 'India',
  'Asia/Kuala_Lumpur': 'Malaysia',
  'Asia/Kuwait': 'Kuwait',
  'Asia/Manila': 'Philippines',
  'Asia/Muscat': 'Oman',
  'Asia/Qatar': 'Qatar',
  'Asia/Riyadh': 'Saudi Arabia',
  'Asia/Shanghai': 'China',
  'Asia/Seoul': 'South Korea',
  'Asia/Singapore': 'Singapore',
  'Asia/Taipei': 'Taiwan',
  'Asia/Tehran': 'Iran',
  'Asia/Tokyo': 'Japan',
  'Asia/Yangon': 'Myanmar',
  'Australia/Melbourne': 'Australia',
  'Australia/Sydney': 'Australia',
  'Europe/Belgrade': 'Serbia',
  'Europe/Amsterdam': 'Netherlands',
  'Europe/Athens': 'Greece',
  'Europe/Berlin': 'Germany',
  'Europe/Brussels': 'Belgium',
  'Europe/Budapest': 'Hungary',
  'Europe/Copenhagen': 'Denmark',
  'Europe/Dublin': 'Ireland',
  'Europe/Helsinki': 'Finland',
  'Europe/Istanbul': 'Turkey',
  'Europe/Lisbon': 'Portugal',
  'Europe/Ljubljana': 'Slovenia',
  'Europe/London': 'United Kingdom',
  'Europe/Madrid': 'Spain',
  'Europe/Oslo': 'Norway',
  'Europe/Paris': 'France',
  'Europe/Prague': 'Czech Republic',
  'Europe/Rome': 'Italy',
  'Europe/Stockholm': 'Sweden',
  'Europe/Vienna': 'Austria',
  'Europe/Warsaw': 'Poland',
  'Europe/Zurich': 'Switzerland',
  'Europe/Moscow': 'Russia',
  'Pacific/Auckland': 'New Zealand',
};

export interface CustomCityAtlasInput {
  name?: string;
  cityName: string;
  regionName?: string;
  countryCode?: string | null;
  timezone?: string;
  description?: string;
  globalRegion?: string | null;
  population?: number | null;
  populationYear?: number | null;
  areaKm2?: number | null;
  populationDensityPerKm2?: number | null;
  /** Optional coordinates so the city appears on the /dymaxion map. */
  latitude?: number | null;
  longitude?: number | null;
  skipGlobalDuplicateScan?: boolean;
}

export interface BulkCityAtlasInput extends Omit<CustomCityAtlasInput, 'skipGlobalDuplicateScan'> {
  rowNumber: number;
}

export interface BulkCityAtlasResult {
  rowNumber: number;
  cityName: string;
  slug: string;
  status: 'created' | 'skipped' | 'failed';
  atlasId: string | null;
  error: string | null;
}

export interface BulkCityAtlasCreateResponse {
  created: number;
  skipped: number;
  failed: number;
  results: BulkCityAtlasResult[];
}

export interface UniversityAtlasInput {
  rowNumber?: number;
  unitId: string;
  opeId?: string | null;
  officialName: string;
  city: string;
  state: string;
  website?: string | null;
  accreditationAgency?: string | null;
  control?: UniversityAtlasConfig['control'];
  highestDegree?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  undergraduateEnrollment?: number | null;
  admissionRate?: number | null;
  completionRate?: number | null;
  retentionRate?: number | null;
  averageNetPrice?: number | null;
  medianEarnings10Year?: number | null;
  dataYear?: number | null;
  cohortRank?: number | null;
  cohortScore?: number | null;
  cohortVersion?: string | null;
  sourceUrl?: string | null;
  sourceFetchedAt?: string | null;
  heroUrl?: string | null;
  logoUrl?: string | null;
  heroSourcePage?: string | null;
  logoSourcePage?: string | null;
  description?: string | null;
}

export interface UniversityAtlasResult {
  rowNumber: number;
  unitId: string;
  officialName: string;
  slug: string;
  status: 'created' | 'skipped' | 'failed';
  atlasId: string | null;
  error: string | null;
}

export interface UniversityAtlasCreateResponse {
  created: number;
  skipped: number;
  failed: number;
  results: UniversityAtlasResult[];
}

function normalizeCityIdentity(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/^living\s*wiki:\s*/i, '')
    .replace(/\s*\(flagship\)\s*$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function countryLabelFromCityConfig(config: CityAtlasConfig | null | undefined): string | null {
  if (!config?.enabled) {
    return null;
  }

  const regionKey = normalizeCityIdentity(config.region_name);
  if (regionKey && COUNTRY_BY_REGION_KEY[regionKey]) {
    return COUNTRY_BY_REGION_KEY[regionKey];
  }

  const timezone = config.timezone?.trim() ?? '';
  if (timezone && COUNTRY_BY_TIMEZONE[timezone]) {
    return COUNTRY_BY_TIMEZONE[timezone];
  }

  const countryCode = config.country_code?.trim().toUpperCase() ?? '';
  if (countryCode && COUNTRY_LABEL_BY_CODE[countryCode]) {
    return COUNTRY_LABEL_BY_CODE[countryCode];
  }
  if (countryCode) {
    return countryCode;
  }

  return null;
}

function countryCodeFromCityConfig(config: Pick<CityAtlasConfig, 'enabled' | 'region_name' | 'timezone'>): string | null {
  const label = countryLabelFromCityConfig({ ...config, country_code: null } as CityAtlasConfig);
  if (!label) {
    return null;
  }
  return Object.entries(COUNTRY_LABEL_BY_CODE).find(([, countryLabel]) => countryLabel === label)?.[0] ?? null;
}

type PublicAtlasBySlugResponse = {
  atlas: Record<string, unknown> | null;
};

type AtlasAdminResponse = {
  admin: AtlasAdminProfile;
};

type AtlasSubscribeResponse = {
  ok: boolean;
  alreadySubscribed?: boolean;
};

type AtlasSubscriptionsResponse = {
  subscriptions: AtlasSubscriptionItem[];
};

export type AutomatedCoverImageResult = {
  atlasId: string;
  heroUrl: string;
  sourceUrl: string;
  pageTitle: string;
  contentType: string;
  bytes: number;
};

export type CityPopulationStatus = 'updated' | 'skipped' | 'failed';

export type CityPopulationSource = 'us_census_pep' | 'geonames' | 'wikidata' | 'manual';

export interface CityPopulationRefreshResult {
  atlasId: string;
  status: CityPopulationStatus;
  cityName: string;
  population: number | null;
  populationYear: number | null;
  source: CityPopulationSource | null;
  sourceLabel: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  message: string;
}

type AtlasNewsletterConfigResponse = {
  config: AtlasNewsletterConfig;
};

type AtlasTextMessagingConfigResponse = {
  config: AtlasTextMessagingConfig;
};

type AtlasVoiceAgentConfigResponse = {
  config: AtlasVoiceAgentConfig;
};

@Injectable({ providedIn: 'root' })
export class AtlasService {
  private readonly authService = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore = this.isBrowser ? getFirebaseFirestore() : null;
  private readonly storage = this.isBrowser ? getFirebaseStorage() : null;
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;

  readonly atlases = signal<AtlasItem[]>([]);
  readonly activeAtlasId = signal<string | null>(this.loadActiveId());
  readonly isLoading = signal(true);
  private autoCreateAttempted = false;
  readonly activeAtlasHomeLink = computed(() => {
    const id = this.activeAtlasId();
    if (!id) return '/wikis';
    const atlas = this.atlases().find((a) => a.id === id);
    if (!atlas) return '/wikis';
    const slug = atlas.slug?.trim() || this.slugify(atlas.name ?? '') || atlas.id;
    return `/atlas/${slug}`;
  });
  readonly activeAtlasWikiLink = computed(() => {
    const id = this.activeAtlasId();
    if (!id) return '/wiki';
    const atlas = this.atlases().find((a) => a.id === id);
    if (!atlas) return '/wiki';
    const slug = atlas.slug?.trim() || this.slugify(atlas.name ?? '') || atlas.id;
    return atlas.is_public ? `/wiki/${slug}` : '/wiki';
  });

  readonly activeAtlas = computed(() => {
    const id = this.activeAtlasId();
    if (!id) return null;
    return this.atlases().find((atlas) => atlas.id === id) ?? null;
  });

  isPublicCityVisitorAtlas(
    atlas: AtlasItem | null | undefined,
    viewerUid?: string | null,
  ): boolean {
    if (!atlas?.is_public || atlas.city_config?.enabled !== true) {
      return false;
    }

    const uid = viewerUid?.trim() ?? '';
    return !uid || atlas.user_id !== uid;
  }

  constructor() {
    effect((onCleanup) => {
      const uid = this.authService.uid();
      if (!this.firestore || !uid) {
        this.atlases.set([]);
        this.isLoading.set(false);
        return;
      }

      this.isLoading.set(true);
      const ownedAtlasesQuery = query(
        collection(this.firestore, 'atlases'),
        where('user_id', '==', uid),
      );
      const adminAtlasesQuery = query(
        collection(this.firestore, 'atlases'),
        where('admin_user_ids', 'array-contains', uid),
      );

      let ownedItems: AtlasItem[] | null = null;
      let adminItems: AtlasItem[] | null = null;

      const publish = async () => {
        if (!ownedItems || !adminItems) {
          return;
        }

        const byId = new Map<string, AtlasItem>();
        for (const atlas of [...ownedItems, ...adminItems]) {
          byId.set(atlas.id, atlas);
        }

        const items = [...byId.values()].sort((a, b) => {
          const aMs = this.asMillis(a.created_at);
          const bMs = this.asMillis(b.created_at);
          if (aMs !== bMs) return aMs - bMs;
          return a.id.localeCompare(b.id);
        });
        this.atlases.set(items);

        if (items.length === 0) {
          if (this.authService.canCreateWikis() && !this.autoCreateAttempted) {
            this.autoCreateAttempted = true;
            const created = await this.createDefaultAtlas(uid);
            if (created) {
              this.setActive(created);
            }
          }
        } else {
          void this.selfHealAtlases(items.filter((atlas) => atlas.user_id === uid));
          const current = this.activeAtlasId();
          if (!current || !items.some((a) => a.id === current)) {
            this.setActive(items[0].id);
          }
        }
        this.isLoading.set(false);
      };

      const hydrateSnapshot = (snapshot: QuerySnapshot<DocumentData>) =>
        snapshot.docs.map((d) =>
          this.hydrateAtlas({
            id: d.id,
            ...(d.data() as Record<string, unknown>),
          }),
        );

      const ownedUnsubscribe: Unsubscribe = onSnapshot(
        ownedAtlasesQuery,
        (snapshot) => {
          ownedItems = hydrateSnapshot(snapshot);
          void publish();
        },
        () => {
          ownedItems = [];
          void publish();
        },
      );
      const adminUnsubscribe: Unsubscribe = onSnapshot(
        adminAtlasesQuery,
        (snapshot) => {
          adminItems = hydrateSnapshot(snapshot);
          void publish();
        },
        () => {
          adminItems = [];
          void publish();
        },
      );

      onCleanup(() => {
        ownedUnsubscribe();
        adminUnsubscribe();
      });
    });
  }

  setActive(atlasId: string | null): void {
    this.activeAtlasId.set(atlasId);
    if (this.isBrowser) {
      if (atlasId) {
        window.localStorage.setItem(ACTIVE_ATLAS_STORAGE_KEY, atlasId);
      } else {
        window.localStorage.removeItem(ACTIVE_ATLAS_STORAGE_KEY);
      }
    }
  }

  async createAtlas(input: { name: string; description?: string }): Promise<string | null> {
    if (!this.firestore) return null;
    const uid = this.authService.uid();
    if (!uid) return null;
    this.assertCanCreateWiki();

    const name = input.name.trim() || 'Untitled Wiki';
    const slug = this.slugify(name);
    const ref = await addDoc(collection(this.firestore, 'atlases'), {
      user_id: uid,
      wiki_type: 'city',
      name,
      slug,
      description: input.description?.trim() || null,
      is_public: false,
      logo_url: null,
      hero_url: null,
      video_url: null,
      cover_color: null,
      default_answer_mode: 'wiki',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    this.setActive(ref.id);
    return ref.id;
  }

  async createCityAtlasFromTemplate(template: CityAtlasTemplate): Promise<string | null> {
    if (!this.firestore) return null;
    const uid = this.authService.uid();
    if (!uid) return null;
    this.assertCanCreateWiki();

    const slug = template.slug.trim().toLowerCase();
    if (!slug) {
      throw new Error('City template is missing a slug.');
    }

    const cityName = template.cityConfig.city_name?.trim() || template.name;
    const cityKey = normalizeCityIdentity(cityName);
    const existingLocal = this.atlases().find((atlas) =>
      atlas.slug?.trim().toLowerCase() === slug
      || normalizeCityIdentity(atlas.city_config?.city_name) === cityKey
      || normalizeCityIdentity(atlas.name) === cityKey
      || normalizeCityIdentity(atlas.name) === slug,
    );
    if (existingLocal) {
      this.setActive(existingLocal.id);
      throw new Error(`${template.name} already exists in this workspace.`);
    }

    const existingPublic = await this.findAnyPublicCityAtlas(slug, cityKey);
    if (existingPublic) {
      throw new Error(`${template.name} is already live in the public directory.`);
    }

    const ref = await addDoc(collection(this.firestore, 'atlases'), {
      user_id: uid,
      wiki_type: 'city',
      name: template.name,
      slug,
      description: template.description,
      landing_summary: template.landingSummary,
      is_public: true,
      logo_url: template.logoUrl,
      hero_url: template.heroUrl,
      video_url: null,
      cover_color: template.coverColor,
      default_answer_mode: 'internet',
      city_config: template.cityConfig,
      chat_guide: template.chatGuide,
      persona_prompt: template.personaPrompt,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    this.setActive(ref.id);
    return ref.id;
  }

  async createCustomCityAtlas(input: CustomCityAtlasInput): Promise<string | null> {
    if (!this.firestore) return null;
    const uid = this.authService.uid();
    if (!uid) return null;
    this.assertCanCreateWiki();

    const cityName = input.cityName.trim();
    if (!cityName) {
      throw new Error('City name is required.');
    }

    const regionName = input.regionName?.trim() || null;
    const name = input.name?.trim() || `LivingWiki: ${cityName}`;
    const slug = this.slugify(name);
	    const description = input.description?.trim()
	      || `${cityName}'s practical local knowledge, civic updates, transit, culture, climate, jobs, food, neighborhoods, and public information.`;
	    const timezone = input.timezone?.trim() || 'America/New_York';
	    const inferredCountryCode = countryCodeFromCityConfig({
	      enabled: true,
	      region_name: regionName,
	      timezone,
	    });
    const explicitCountryCode = input.countryCode?.trim().toUpperCase();
    const globalRegion = input.globalRegion?.trim() || null;
    const population = typeof input.population === 'number' && Number.isFinite(input.population) && input.population > 0
      ? Math.round(input.population)
      : null;
    const populationYear = typeof input.populationYear === 'number' && Number.isFinite(input.populationYear) && input.populationYear > 0
      ? Math.round(input.populationYear)
      : null;
    const areaKm2 = typeof input.areaKm2 === 'number' && Number.isFinite(input.areaKm2) && input.areaKm2 > 0
      ? input.areaKm2
      : null;
    const populationDensityPerKm2 = typeof input.populationDensityPerKm2 === 'number' && Number.isFinite(input.populationDensityPerKm2) && input.populationDensityPerKm2 > 0
      ? Math.round(input.populationDensityPerKm2)
      : areaKm2 && population
        ? Math.round(population / areaKm2)
        : null;

    const cityKey = normalizeCityIdentity(cityName);
    const existingLocal = this.atlases().find((atlas) =>
      atlas.slug?.trim().toLowerCase() === slug
      || normalizeCityIdentity(atlas.city_config?.city_name) === cityKey
      || normalizeCityIdentity(atlas.name) === cityKey
      || normalizeCityIdentity(atlas.name) === slug,
    );
    if (existingLocal) {
      this.setActive(existingLocal.id);
      throw new Error(`${name} already exists in this workspace.`);
    }

    const existingPublic = input.skipGlobalDuplicateScan
      ? await this.findAnyPublicAtlasBySlug(slug)
      : await this.findAnyPublicCityAtlas(slug, cityKey);
    if (existingPublic) {
      throw new Error(`${name} is already live in the public directory.`);
    }

    const regionPhrase = regionName ? `${cityName}, ${regionName}` : cityName;
    const ref = await addDoc(collection(this.firestore, 'atlases'), {
      user_id: uid,
      wiki_type: 'city',
      name,
      slug,
      description,
      landing_summary: `A city-first guide for ${regionPhrase}, focused on practical local knowledge, neighborhoods, transit, civic life, culture, climate, jobs, food, and local updates.`,
      is_public: true,
      logo_url: DEFAULT_CITY_LOGO_URL,
      hero_url: null,
      video_url: null,
      cover_color: '#255a61',
      default_answer_mode: 'internet',
      city_config: {
	        enabled: true,
	        city_name: cityName,
	        region_name: regionName,
	        country_code: explicitCountryCode && /^[A-Z]{2}$/.test(explicitCountryCode)
          ? explicitCountryCode
          : inferredCountryCode ?? 'US',
	        timezone,
        census_state_code: null,
        census_place_code: null,
        airnow_zip_code: null,
        latitude: Number.isFinite(input.latitude) ? (input.latitude as number) : null,
        longitude: Number.isFinite(input.longitude) ? (input.longitude as number) : null,
        metadata: {
          global_region: globalRegion,
          population,
          population_year: populationYear,
          area_km2: areaKm2,
          population_density_per_km2: populationDensityPerKm2,
          population_scope: population ? 'unknown' : null,
          population_source: population ? 'manual' : null,
          population_source_url: null,
          population_source_record_id: null,
          population_fetched_at: population ? new Date().toISOString() : null,
          population_confidence: population ? 'medium' : null,
          population_match_method: population ? 'manual' : null,
        },
        manual_metrics: null,
      } satisfies CityAtlasConfig,
      chat_guide: {
        name: `${cityName} Guide`,
        label: `Ask about ${cityName} civic life, transit, culture, climate, jobs, food, neighborhoods, and local updates.`,
        image_url: DEFAULT_CITY_LOGO_URL,
        banner_url: null,
      } satisfies AtlasChatGuideConfig,
      persona_prompt: [
        `You are the LivingWiki guide for ${regionPhrase}.`,
        `Speak with practical local confidence about ${cityName}, while staying source-aware and clear about uncertainty.`,
        'Use live internet grounding by default because this city was created before source ingestion.',
        'Keep answers concise, readable, energetic, and useful for residents, visitors, builders, researchers, and local operators.',
        'Include tasteful local emojis when they make the answer feel more alive, but keep the facts precise.',
      ].join(' '),
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    this.setActive(ref.id);
    return ref.id;
  }

	  async getPublicAtlasBySlug(slug: string): Promise<AtlasItem | null> {
	    if (this.firestore) {
	      const snap = await getDocs(
	        query(
	          collection(this.firestore, 'atlases'),
	          where('slug', '==', slug),
	          where('is_public', '==', true),
	          limit(1),
	        ),
	      );
	      const atlasDoc = snap.docs[0];
	      if (atlasDoc) {
	        return this.hydrateAtlas({
	          id: atlasDoc.id,
	          ...(atlasDoc.data() as Record<string, unknown>),
	        });
	      }
	    }

	    if (this.functions) {
	      try {
	        const getPublicAtlasBySlug = httpsCallable<
          { slug: string },
          PublicAtlasBySlugResponse
        >(
          this.functions,
          'getPublicAtlasBySlug',
        );

        const { data } = await getPublicAtlasBySlug({ slug });
        if (data?.atlas) {
          return this.hydrateAtlas(data.atlas);
        }
      } catch (error) {
        console.warn('[AtlasService] getPublicAtlasBySlug callable failed; falling back to Firestore query.', error);
	      }
	    }
	    return null;
	  }

  async listPublicAtlases(): Promise<AtlasItem[]> {
    if (!this.firestore) {
      return [];
    }

    const snap = await getDocs(
      query(
        collection(this.firestore, 'atlases'),
        where('is_public', '==', true),
      ),
    );

    return snap.docs.map((atlasDoc) =>
      this.hydrateAtlas({
        id: atlasDoc.id,
        ...(atlasDoc.data() as Record<string, unknown>),
      }),
    );
  }

  async autoUploadAtlasCoverImage(atlasId: string): Promise<AutomatedCoverImageResult> {
    if (!this.functions) {
      throw new Error('Functions unavailable.');
    }
    const autoUploadAtlasCoverImage = httpsCallable<
      { atlasId: string },
      AutomatedCoverImageResult
    >(this.functions, 'autoUploadAtlasCoverImage');
    const { data } = await autoUploadAtlasCoverImage({ atlasId });
    return data;
  }

  async refreshCityPopulation(atlasId: string, force = false): Promise<CityPopulationRefreshResult> {
    if (!this.functions) {
      throw new Error('Functions unavailable.');
    }
    const refreshCityPopulation = httpsCallable<
      { atlasId: string; force?: boolean },
      CityPopulationRefreshResult
    >(this.functions, 'refreshCityPopulation');
    const { data } = await refreshCityPopulation({ atlasId, force });
    return data;
  }

  async createBulkCityAtlases(rows: BulkCityAtlasInput[]): Promise<BulkCityAtlasCreateResponse> {
    this.assertCanCreateWiki();
    if (!this.functions) {
      throw new Error('Functions unavailable.');
    }
    const createBulkCityAtlases = httpsCallable<
      { rows: BulkCityAtlasInput[] },
      BulkCityAtlasCreateResponse
    >(this.functions, 'createBulkCityAtlases');
    const { data } = await createBulkCityAtlases({ rows });
    return data;
  }

  async createUniversityAtlases(rows: UniversityAtlasInput[]): Promise<UniversityAtlasCreateResponse> {
    this.assertCanCreateWiki();
    if (!this.functions) {
      throw new Error('Functions unavailable.');
    }
    const createUniversityAtlases = httpsCallable<
      { rows: UniversityAtlasInput[] },
      UniversityAtlasCreateResponse
    >(this.functions, 'createUniversityAtlases');
    const { data } = await createUniversityAtlases({ rows });
    return data;
  }

  private async findAnyPublicAtlasBySlug(slug: string): Promise<AtlasItem | null> {
    if (!this.firestore) {
      return null;
    }

    const snap = await getDocs(
      query(
        collection(this.firestore, 'atlases'),
        where('slug', '==', slug),
        where('is_public', '==', true),
        limit(1),
      ),
    );
    const atlasDoc = snap.docs[0];
    if (!atlasDoc) {
      return null;
    }

    return this.hydrateAtlas({
      id: atlasDoc.id,
      ...(atlasDoc.data() as Record<string, unknown>),
    });
  }

  private async findAnyPublicCityAtlas(slug: string, cityKey: string): Promise<AtlasItem | null> {
    if (!this.firestore) {
      return null;
    }

    const snap = await getDocs(
      query(
        collection(this.firestore, 'atlases'),
        where('is_public', '==', true),
      ),
    );

    for (const atlasDoc of snap.docs) {
      const atlas = this.hydrateAtlas({
        id: atlasDoc.id,
        ...(atlasDoc.data() as Record<string, unknown>),
      });
      if (
        atlas.slug?.trim().toLowerCase() === slug
        || normalizeCityIdentity(atlas.city_config?.city_name) === cityKey
        || normalizeCityIdentity(atlas.name) === cityKey
        || normalizeCityIdentity(atlas.name) === slug
      ) {
        return atlas;
      }
    }

    return null;
  }

  async uploadAtlasImage(
    atlasId: string,
    kind: 'logo' | 'hero' | 'chat-guide',
    file: File,
  ): Promise<string> {
    if (!this.storage) throw new Error('Storage unavailable.');
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files are supported.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Image must be under 10 MB.');
    }
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `atlases/${atlasId}/${kind}-${Date.now()}.${ext}`;
    const ref = storageRef(this.storage, path);
    await uploadBytes(ref, file, { contentType: file.type });
    return await getDownloadURL(ref);
  }

  async uploadAtlasVideo(
    atlasId: string,
    file: File,
  ): Promise<string> {
    if (!this.storage) throw new Error('Storage unavailable.');
    if (!file.type.startsWith('video/')) {
      throw new Error('Only video files are supported.');
    }
    if (file.size > 100 * 1024 * 1024) {
      throw new Error('Video must be under 100 MB.');
    }
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    const path = `atlases/${atlasId}/video-${Date.now()}.${ext}`;
    const ref = storageRef(this.storage, path);
    await uploadBytes(ref, file, { contentType: file.type });
    return await getDownloadURL(ref);
  }

  async removeAtlasVideo(atlasId: string, videoUrl: string): Promise<void> {
    if (this.storage && videoUrl) {
      try {
        const ref = storageRef(this.storage, videoUrl);
        await deleteObject(ref);
      } catch {
        // ignore — file may already be deleted
      }
    }
    await this.updateAtlas(atlasId, { video_url: null });
  }

  async updateAtlas(
    atlasId: string,
    patch: Partial<Pick<AtlasItem, 'description' | 'landing_summary' | 'logo_url' | 'hero_url' | 'video_url' | 'is_public'>>,
  ): Promise<void> {
    if (!this.firestore) return;
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      ...patch,
      updated_at: serverTimestamp(),
    });
  }

  async updateCityConfig(atlasId: string, config: CityAtlasConfig | null): Promise<void> {
    if (!this.firestore) return;
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      city_config: config,
      updated_at: serverTimestamp(),
    });
  }

  async updateChatGuideConfig(atlasId: string, config: AtlasChatGuideConfig | null): Promise<void> {
    if (!this.firestore) return;
    const normalized = this.normalizeChatGuideConfig(config);
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      chat_guide: normalized,
      updated_at: serverTimestamp(),
    });
    this.patchAtlas(atlasId, {
      chat_guide: normalized,
      updated_at: new Date(),
    });
  }

  async updatePersonaPrompt(atlasId: string, value: string | null): Promise<void> {
    if (!this.firestore) return;
    const trimmed = value === null ? null : value.trim();
    const persona = trimmed && trimmed.length > 0 ? trimmed.slice(0, 40000) : null;
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      persona_prompt: persona,
      updated_at: serverTimestamp(),
    });
  }

  async updateDefaultAnswerMode(atlasId: string, mode: 'wiki' | 'internet'): Promise<void> {
    if (!this.firestore) return;
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      default_answer_mode: mode === 'internet' ? 'internet' : 'wiki',
      updated_at: serverTimestamp(),
    });
  }

  async addAtlasAdmin(atlasId: string, email: string): Promise<AtlasAdminProfile> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const addAtlasAdmin = httpsCallable<
      { atlasId: string; email: string },
      AtlasAdminResponse
    >(this.functions, 'addAtlasAdmin');
    const { data } = await addAtlasAdmin({ atlasId, email });
    return data.admin;
  }

  async removeAtlasAdmin(atlasId: string, userId: string): Promise<void> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const removeAtlasAdmin = httpsCallable<
      { atlasId: string; userId: string },
      { ok: boolean }
    >(this.functions, 'removeAtlasAdmin');
    await removeAtlasAdmin({ atlasId, userId });
  }

  async subscribeToAtlasUpdates(input: {
    atlasId: string;
    email: string;
    anonymousVisitorId?: string | null;
  }): Promise<AtlasSubscribeResponse> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const subscribeToAtlasUpdates = httpsCallable<
      { atlasId: string; email: string; anonymousVisitorId?: string | null },
      AtlasSubscribeResponse
    >(this.functions, 'subscribeToAtlasUpdates');
    const { data } = await subscribeToAtlasUpdates(input);
    return data;
  }

  async listAtlasSubscriptions(atlasId: string): Promise<AtlasSubscriptionItem[]> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const listAtlasSubscriptions = httpsCallable<
      { atlasId: string },
      AtlasSubscriptionsResponse
    >(this.functions, 'listAtlasSubscriptions');
    const { data } = await listAtlasSubscriptions({ atlasId });
    return data.subscriptions ?? [];
  }

  async removeAtlasSubscription(atlasId: string, subscriptionId: string): Promise<void> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const removeAtlasSubscription = httpsCallable<
      { atlasId: string; subscriptionId: string },
      { ok: boolean }
    >(this.functions, 'removeAtlasSubscription');
    await removeAtlasSubscription({ atlasId, subscriptionId });
  }

  async updateAtlasNewsletterConfig(atlasId: string, config: AtlasNewsletterConfig): Promise<AtlasNewsletterConfig> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const updateAtlasNewsletterConfig = httpsCallable<
      { atlasId: string; config: AtlasNewsletterConfig },
      AtlasNewsletterConfigResponse
    >(this.functions, 'updateAtlasNewsletterConfig');
    const { data } = await updateAtlasNewsletterConfig({ atlasId, config });
    this.patchAtlas(atlasId, {
      newsletter_config: this.hydrateNewsletterConfig(data.config) ?? data.config,
      updated_at: new Date(),
    });
    return data.config;
  }

  async refreshAtlas(atlasId: string): Promise<AtlasItem | null> {
    if (!this.firestore) {
      return null;
    }

    const atlasDoc = await getDoc(doc(this.firestore, 'atlases', atlasId));
    if (!atlasDoc.exists()) {
      return null;
    }

    const atlas = this.hydrateAtlas({
      id: atlasDoc.id,
      ...(atlasDoc.data() as Record<string, unknown>),
    });
    this.replaceAtlas(atlas);
    return atlas;
  }

  async sendAtlasNewsletterTest(atlasId: string, config: AtlasNewsletterConfig, recipientEmail?: string): Promise<AtlasNewsletterTestResult> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const sendAtlasNewsletterTest = httpsCallable<
      { atlasId: string; config: AtlasNewsletterConfig; recipientEmail?: string },
      AtlasNewsletterTestResult
    >(this.functions, 'sendAtlasNewsletterTest');
    const { data } = await sendAtlasNewsletterTest({ atlasId, config, recipientEmail });
    return data;
  }

  async getAtlasTextMessagingConfig(atlasId: string): Promise<AtlasTextMessagingConfig> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const getAtlasTextMessagingConfig = httpsCallable<
      { atlasId: string },
      AtlasTextMessagingConfigResponse
    >(this.functions, 'getAtlasTextMessagingConfig');
    const { data } = await getAtlasTextMessagingConfig({ atlasId });
    return this.hydrateTextMessagingConfig(data.config);
  }

  async updateAtlasTextMessagingConfig(
    atlasId: string,
    config: Pick<AtlasTextMessagingConfig, 'enabled' | 'provider' | 'phone_number' | 'vapi_phone_number_id'>,
    rotateToken = false,
  ): Promise<AtlasTextMessagingConfig> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const updateAtlasTextMessagingConfig = httpsCallable<
      {
        atlasId: string;
        config: Pick<AtlasTextMessagingConfig, 'enabled' | 'provider' | 'phone_number' | 'vapi_phone_number_id'>;
        rotateToken?: boolean;
      },
      AtlasTextMessagingConfigResponse
    >(this.functions, 'updateAtlasTextMessagingConfig');
    const { data } = await updateAtlasTextMessagingConfig({ atlasId, config, rotateToken });
    return this.hydrateTextMessagingConfig(data.config);
  }

  async getAtlasVoiceAgentConfig(atlasId: string): Promise<AtlasVoiceAgentConfig> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const getAtlasVoiceAgentConfig = httpsCallable<
      { atlasId: string },
      AtlasVoiceAgentConfigResponse
    >(this.functions, 'getAtlasVoiceAgentConfig');
    const { data } = await getAtlasVoiceAgentConfig({ atlasId });
    return this.hydrateVoiceAgentConfig(data.config);
  }

  async updateAtlasVoiceAgentConfig(
    atlasId: string,
    config: Pick<AtlasVoiceAgentConfig, 'enabled' | 'phone_number' | 'vapi_phone_number_id' | 'vapi_assistant_id'>,
    rotateToken = false,
  ): Promise<AtlasVoiceAgentConfig> {
    if (!this.functions) throw new Error('Functions unavailable.');
    const updateAtlasVoiceAgentConfig = httpsCallable<
      {
        atlasId: string;
        config: Pick<AtlasVoiceAgentConfig, 'enabled' | 'phone_number' | 'vapi_phone_number_id' | 'vapi_assistant_id'>;
        rotateToken?: boolean;
      },
      AtlasVoiceAgentConfigResponse
    >(this.functions, 'updateAtlasVoiceAgentConfig');
    const { data } = await updateAtlasVoiceAgentConfig({ atlasId, config, rotateToken });
    return this.hydrateVoiceAgentConfig(data.config);
  }

  private patchAtlas(atlasId: string, patch: Partial<AtlasItem>): void {
    this.atlases.update((items) =>
      items.map((atlas) => (atlas.id === atlasId ? { ...atlas, ...patch } : atlas)),
    );
  }

  private replaceAtlas(nextAtlas: AtlasItem): void {
    this.atlases.update((items) =>
      items.map((atlas) => (atlas.id === nextAtlas.id ? nextAtlas : atlas)),
    );
  }

  async renameAtlas(atlasId: string, name: string): Promise<void> {
    if (!this.firestore) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    await updateDoc(doc(this.firestore, 'atlases', atlasId), {
      name: trimmed,
      slug: this.slugify(trimmed),
      updated_at: serverTimestamp(),
    });
  }

  async getAtlasUsage(atlasId: string): Promise<AtlasUsage> {
    if (!this.firestore) {
      return {
        documents: 0,
        wiki_articles: 0,
        knowledge_entries: 0,
        wiki_topics: 0,
        queries: 0,
        chat_threads: 0,
        total: 0,
      };
    }

    const uid = this.authService.uid();
    if (!uid) {
      return {
        documents: 0,
        wiki_articles: 0,
        knowledge_entries: 0,
        wiki_topics: 0,
        queries: 0,
        chat_threads: 0,
        total: 0,
      };
    }

    const [documents, wikiArticles, knowledgeEntries, wikiTopics, queriesCount, chatThreads] = await Promise.all([
      this.countAtlasCollection('documents', uid, atlasId),
      this.countAtlasCollection('wiki_articles', uid, atlasId),
      this.countAtlasCollection('knowledge_entries', uid, atlasId),
      this.countAtlasCollection('wiki_topics', uid, atlasId),
      this.countAtlasCollection('queries', uid, atlasId),
      this.countAtlasCollection('chat_threads', uid, atlasId),
    ]);

    return {
      documents,
      wiki_articles: wikiArticles,
      knowledge_entries: knowledgeEntries,
      wiki_topics: wikiTopics,
      queries: queriesCount,
      chat_threads: chatThreads,
      total: documents + wikiArticles + knowledgeEntries + wikiTopics + queriesCount + chatThreads,
    };
  }

  async getPublicAtlasUsage(atlasId: string): Promise<AtlasUsage> {
    if (!this.functions) {
      return {
        documents: 0,
        wiki_articles: 0,
        knowledge_entries: 0,
        wiki_topics: 0,
        queries: 0,
        chat_threads: 0,
        total: 0,
      };
    }

    const getPublicAtlasUsage = httpsCallable<{ atlasId: string }, AtlasUsage>(
      this.functions,
      'getPublicAtlasUsage',
    );
    const { data } = await getPublicAtlasUsage({ atlasId });
    return data;
  }

  async deleteAtlas(atlasId: string): Promise<void> {
    if (!this.firestore) return;

    const currentAtlases = this.atlases();
    if (currentAtlases.length <= 1) {
      throw new Error('You must keep at least one Wiki.');
    }

    const usage = await this.getAtlasUsage(atlasId);
    if (usage.total > 0) {
      throw new Error(this.formatAtlasUsageError(usage));
    }

    const nextAtlas = currentAtlases.find((atlas) => atlas.id !== atlasId)?.id ?? null;
    await deleteDoc(doc(this.firestore, 'atlases', atlasId));

    if (this.activeAtlasId() === atlasId) {
      this.setActive(nextAtlas);
    }
  }

	  displayName(atlas: AtlasItem | null | undefined): string {
	    if (!atlas) return 'Select Wiki';
	    const trimmed = atlas.name?.trim();
	    if (trimmed) return trimmed.replace(/^my\s+living\s*wiki:/i, 'LivingWiki:');
	    return `Wiki ${atlas.id.slice(0, 6)}`;
	  }

	  cityCountryLabel(atlas: AtlasItem | null | undefined): string | null {
	    return countryLabelFromCityConfig(atlas?.city_config);
	  }

	  isAtlasOwner(atlas: AtlasItem | null | undefined): boolean {
    const uid = this.authService.uid();
    return !!atlas && !!uid && atlas.user_id === uid;
  }

  isAtlasAdmin(atlas: AtlasItem | null | undefined): boolean {
    const uid = this.authService.uid();
    return !!atlas && !!uid && !!atlas.admin_user_ids?.includes(uid);
  }

  canAdminAtlas(atlas: AtlasItem | null | undefined): boolean {
    return this.isAtlasOwner(atlas) || this.isAtlasAdmin(atlas);
  }

  private async selfHealAtlases(items: AtlasItem[]): Promise<void> {
    if (!this.firestore) return;
    for (const atlas of items) {
      const patch: Record<string, unknown> = {};
      if (!atlas.name || !atlas.name.trim()) {
        patch['name'] = `Wiki ${atlas.id.slice(0, 6)}`;
      }
      const effectiveName = (patch['name'] as string | undefined) ?? atlas.name;
      const expectedSlug = this.slugify(effectiveName || `atlas-${atlas.id.slice(0, 6)}`);
      if (!atlas.slug || !atlas.slug.trim() || atlas.slug !== expectedSlug) {
        patch['slug'] = expectedSlug;
      }
      if (!atlas.created_at) {
        patch['created_at'] = serverTimestamp();
      }
      if (Object.keys(patch).length === 0) continue;
      try {
        await updateDoc(doc(this.firestore, 'atlases', atlas.id), patch);
      } catch {
        // ignore self-heal errors
      }
    }
  }

  private asMillis(value: { toDate(): Date } | Date | null | undefined): number {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
      return (value as { toDate(): Date }).toDate().getTime();
    }
    return 0;
  }

  private async createDefaultAtlas(uid: string): Promise<string | null> {
    if (!this.firestore) return null;
    this.assertCanCreateWiki();
    const ref = await addDoc(collection(this.firestore, 'atlases'), {
      user_id: uid,
      name: 'My Wiki',
      slug: 'my-wiki',
      description: null,
      landing_summary: null,
      is_public: false,
      logo_url: null,
      hero_url: null,
      video_url: null,
      cover_color: null,
      default_answer_mode: 'wiki',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    return ref.id;
  }

  private assertCanCreateWiki(): void {
    if (!this.authService.canCreateWikis()) {
      throw new Error('Upgrade to Personal Plus or Creator to create Wikis.');
    }
  }

  private loadActiveId(): string | null {
    if (!this.isBrowser) return null;
    return window.localStorage.getItem(ACTIVE_ATLAS_STORAGE_KEY);
  }

  slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'wiki';
  }

  private hydrateAtlas(data: Record<string, unknown>): AtlasItem {
    return {
      ...(data as Omit<AtlasItem, 'created_at' | 'updated_at'>),
      id: String(data['id'] ?? ''),
      user_id: String(data['user_id'] ?? ''),
      name: String(data['name'] ?? ''),
      slug: String(data['slug'] ?? ''),
      description: typeof data['description'] === 'string' ? data['description'] : null,
      landing_summary: typeof data['landing_summary'] === 'string' ? data['landing_summary'] : null,
      is_public: data['is_public'] === true,
      logo_url: typeof data['logo_url'] === 'string' ? data['logo_url'] : null,
      hero_url: typeof data['hero_url'] === 'string' ? data['hero_url'] : null,
      video_url: typeof data['video_url'] === 'string' ? data['video_url'] : null,
      cover_color: typeof data['cover_color'] === 'string' ? data['cover_color'] : null,
      wiki_type: data['wiki_type'] === 'city' || data['wiki_type'] === 'university' || data['wiki_type'] === 'topic'
        ? data['wiki_type']
        : data['city_config'] && typeof data['city_config'] === 'object'
          ? 'city'
          : 'topic',
      city_config: this.hydrateCityConfig(data['city_config']),
      university_config: data['university_config'] && typeof data['university_config'] === 'object'
        ? data['university_config'] as UniversityAtlasConfig
        : null,
      chat_guide: this.hydrateChatGuideConfig(data['chat_guide']),
      persona_prompt: typeof data['persona_prompt'] === 'string' ? data['persona_prompt'] : null,
      admin_user_ids: Array.isArray(data['admin_user_ids'])
        ? data['admin_user_ids'].filter((value): value is string => typeof value === 'string')
        : [],
      admin_profiles: this.hydrateAdminProfiles(data['admin_profiles']),
      default_answer_mode: data['default_answer_mode'] === 'internet' ? 'internet' : 'wiki',
      newsletter_config: this.hydrateNewsletterConfig(data['newsletter_config'], data['city_config']),
      public_voice_phone_number: typeof data['public_voice_phone_number'] === 'string' && data['public_voice_phone_number'].trim()
        ? data['public_voice_phone_number'].trim()
        : null,
      created_at: this.hydrateDateValue(data['created_at']),
      updated_at: this.hydrateDateValue(data['updated_at']),
    };
  }

  private hydrateNewsletterConfig(value: unknown, cityConfigValue?: unknown): AtlasNewsletterConfig | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    const cityConfig = this.hydrateCityConfig(cityConfigValue);
    const day = Number(data['day_of_week']);
    const sendTime = typeof data['send_time'] === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(data['send_time'])
      ? data['send_time']
      : '09:00';
    const timezone = typeof data['timezone'] === 'string' && data['timezone'].trim()
      ? data['timezone'].trim()
      : cityConfig?.timezone || 'America/New_York';
    const prompt = typeof data['prompt'] === 'string' && data['prompt'].trim()
      ? data['prompt'].trim()
      : this.defaultNewsletterPrompt();
    return {
      enabled: data['enabled'] === true,
      day_of_week: Number.isInteger(day) && day >= 0 && day <= 6 ? day : 1,
      send_time: sendTime,
      timezone,
      prompt,
      last_sent_key: typeof data['last_sent_key'] === 'string' ? data['last_sent_key'] : null,
      last_sent_at: this.hydrateDateValue(data['last_sent_at']),
      last_recipient_count: typeof data['last_recipient_count'] === 'number' ? data['last_recipient_count'] : null,
      last_subject: typeof data['last_subject'] === 'string' ? data['last_subject'] : null,
    };
  }

  private hydrateChatGuideConfig(value: unknown): AtlasChatGuideConfig | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    return this.normalizeChatGuideConfig(value as Partial<Record<keyof AtlasChatGuideConfig, unknown>>);
  }

  private hydrateTextMessagingConfig(value: unknown): AtlasTextMessagingConfig {
    const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return {
      enabled: data['enabled'] === true,
      provider: data['provider'] === 'vapi' ? 'vapi' : 'twilio',
      phone_number: typeof data['phone_number'] === 'string' && data['phone_number'].trim()
        ? data['phone_number'].trim()
        : null,
      vapi_phone_number_id: typeof data['vapi_phone_number_id'] === 'string' && data['vapi_phone_number_id'].trim()
        ? data['vapi_phone_number_id'].trim()
        : null,
      webhook_token: typeof data['webhook_token'] === 'string' ? data['webhook_token'] : '',
      webhook_url: typeof data['webhook_url'] === 'string' ? data['webhook_url'] : '',
      updated_at: this.hydrateDateValue(data['updated_at']),
    };
  }

  private hydrateVoiceAgentConfig(value: unknown): AtlasVoiceAgentConfig {
    const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return {
      enabled: data['enabled'] === true,
      phone_number: typeof data['phone_number'] === 'string' && data['phone_number'].trim()
        ? data['phone_number'].trim()
        : null,
      vapi_phone_number_id: typeof data['vapi_phone_number_id'] === 'string' && data['vapi_phone_number_id'].trim()
        ? data['vapi_phone_number_id'].trim()
        : null,
      vapi_assistant_id: typeof data['vapi_assistant_id'] === 'string' && data['vapi_assistant_id'].trim()
        ? data['vapi_assistant_id'].trim()
        : null,
      webhook_token: typeof data['webhook_token'] === 'string' ? data['webhook_token'] : '',
      tool_url: typeof data['tool_url'] === 'string' ? data['tool_url'] : '',
      updated_at: this.hydrateDateValue(data['updated_at']),
    };
  }

  private normalizeChatGuideConfig(value: Partial<Record<keyof AtlasChatGuideConfig, unknown>> | null): AtlasChatGuideConfig | null {
    if (!value) {
      return null;
    }

    const name = typeof value.name === 'string' ? value.name.trim().slice(0, 80) || null : null;
    const label = typeof value.label === 'string' ? value.label.trim().slice(0, 120) || null : null;
    const imageUrl = typeof value.image_url === 'string' ? value.image_url.trim().slice(0, 1000) || null : null;
    const bannerUrl = typeof value.banner_url === 'string' ? value.banner_url.trim().slice(0, 1000) || null : null;
    if (!name && !label && !imageUrl && !bannerUrl) {
      return null;
    }

    return {
      name,
      label,
      image_url: imageUrl,
      banner_url: bannerUrl,
    };
  }

  private hydrateAdminProfiles(value: unknown): AtlasAdminProfile[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item): AtlasAdminProfile | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const data = item as Record<string, unknown>;
        const userId = typeof data['user_id'] === 'string' ? data['user_id'] : '';
        if (!userId) {
          return null;
        }
        return {
          user_id: userId,
          email: typeof data['email'] === 'string' ? data['email'] : null,
          display_name: typeof data['display_name'] === 'string' ? data['display_name'] : null,
          added_at: this.hydrateDateValue(data['added_at']),
        };
      })
      .filter((profile): profile is AtlasAdminProfile => !!profile);
  }

  private hydrateCityConfig(value: unknown): CityAtlasConfig | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    return {
      enabled: data['enabled'] === true,
      city_name: typeof data['city_name'] === 'string' ? data['city_name'] : null,
      region_name: typeof data['region_name'] === 'string' ? data['region_name'] : null,
      country_code: typeof data['country_code'] === 'string' ? data['country_code'] : null,
      timezone: typeof data['timezone'] === 'string' ? data['timezone'] : null,
      census_state_code: typeof data['census_state_code'] === 'string' ? data['census_state_code'] : null,
      census_place_code: typeof data['census_place_code'] === 'string' ? data['census_place_code'] : null,
      airnow_zip_code: typeof data['airnow_zip_code'] === 'string' ? data['airnow_zip_code'] : null,
      latitude: typeof data['latitude'] === 'number' && Number.isFinite(data['latitude']) ? data['latitude'] : null,
      longitude: typeof data['longitude'] === 'number' && Number.isFinite(data['longitude']) ? data['longitude'] : null,
      metadata: this.hydrateCityMetadata(data['metadata']),
      manual_metrics: Array.isArray(data['manual_metrics'])
        ? data['manual_metrics'].map((metric) => this.hydrateCityPulseMetric(metric)).filter(Boolean) as CityPulseMetric[]
        : null,
    };
  }

  private hydrateCityMetadata(value: unknown): CityAtlasConfig['metadata'] {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    return {
      global_region: typeof data['global_region'] === 'string' ? data['global_region'] : null,
      population: typeof data['population'] === 'number' && Number.isFinite(data['population'])
        ? data['population']
        : null,
      population_year: typeof data['population_year'] === 'number' && Number.isFinite(data['population_year'])
        ? data['population_year']
        : null,
      area_km2: typeof data['area_km2'] === 'number' && Number.isFinite(data['area_km2'])
        ? data['area_km2']
        : null,
      area_source_url: typeof data['area_source_url'] === 'string' ? data['area_source_url'] : null,
      population_density_per_km2: typeof data['population_density_per_km2'] === 'number' && Number.isFinite(data['population_density_per_km2'])
        ? data['population_density_per_km2']
        : null,
      population_density_source: typeof data['population_density_source'] === 'string' ? data['population_density_source'] : null,
      population_scope: this.hydratePopulationScope(data['population_scope']),
      population_source: this.hydratePopulationSource(data['population_source']),
      population_source_url: typeof data['population_source_url'] === 'string' ? data['population_source_url'] : null,
      population_source_record_id: typeof data['population_source_record_id'] === 'string' ? data['population_source_record_id'] : null,
      population_fetched_at: typeof data['population_fetched_at'] === 'string' ? data['population_fetched_at'] : null,
      population_confidence: this.hydratePopulationConfidence(data['population_confidence']),
      population_match_method: this.hydratePopulationMatchMethod(data['population_match_method']),
    };
  }

  private hydratePopulationScope(value: unknown): CityAtlasMetadata['population_scope'] {
    return value === 'city_proper' || value === 'urban_agglomeration' || value === 'metro' || value === 'unknown'
      ? value
      : null;
  }

  private hydratePopulationSource(value: unknown): CityAtlasMetadata['population_source'] {
    return value === 'us_census_pep' || value === 'geonames' || value === 'wikidata' || value === 'manual'
      ? value
      : null;
  }

  private hydratePopulationConfidence(value: unknown): CityAtlasMetadata['population_confidence'] {
    return value === 'high' || value === 'medium' || value === 'low' ? value : null;
  }

  private hydratePopulationMatchMethod(value: unknown): CityAtlasMetadata['population_match_method'] {
    return value === 'exact_id' || value === 'census_codes' || value === 'name_country_region' || value === 'name_coords' || value === 'manual'
      ? value
      : null;
  }

  private hydrateCityPulseMetric(value: unknown): CityPulseMetric | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    const id = String(data['id'] ?? '').trim();
    const label = String(data['label'] ?? '').trim();
    if (!id || !label) {
      return null;
    }

    const numericValue = Number(data['value']);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return {
      id,
      label,
      short_label: String(data['short_label'] ?? label).trim() || label,
      description: String(data['description'] ?? '').trim(),
      format: data['format'] === 'currency' || data['format'] === 'percent' ? data['format'] : 'number',
      value: numericValue,
      decimals: typeof data['decimals'] === 'number' ? data['decimals'] : undefined,
      unit_prefix: typeof data['unit_prefix'] === 'string' ? data['unit_prefix'] : null,
      unit_suffix: typeof data['unit_suffix'] === 'string' ? data['unit_suffix'] : null,
      source_label: String(data['source_label'] ?? 'Manual').trim() || 'Manual',
      source_detail: typeof data['source_detail'] === 'string' ? data['source_detail'] : null,
      source_url: typeof data['source_url'] === 'string' ? data['source_url'] : null,
      methodology: typeof data['methodology'] === 'string' ? data['methodology'] : null,
      cadence:
        data['cadence'] === 'realtime' ||
        data['cadence'] === 'daily' ||
        data['cadence'] === 'weekly' ||
        data['cadence'] === 'monthly' ||
        data['cadence'] === 'yearly'
          ? data['cadence']
          : 'manual',
      as_of: typeof data['as_of'] === 'string' ? data['as_of'] : null,
      realtime: this.hydrateRealtimeConfig(data['realtime']),
    };
  }

  private hydrateRealtimeConfig(value: unknown) {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    const anchorIso = String(data['anchor_iso'] ?? '').trim();
    const baselineValue = Number(data['baseline_value']);
    const ratePerSecond = Number(data['rate_per_second']);
    if (!anchorIso || !Number.isFinite(baselineValue) || !Number.isFinite(ratePerSecond)) {
      return null;
    }

    return {
      anchor_iso: anchorIso,
      baseline_value: baselineValue,
      rate_per_second: ratePerSecond,
      min_value: typeof data['min_value'] === 'number' ? data['min_value'] : null,
    };
  }

  defaultNewsletterPrompt(): string {
    return [
      'Create a premium weekly LivingWiki email briefing with exactly five of the biggest headlines for this specific wiki.',
      'Focus on the latest verified public information, news, civic updates, development, culture, public safety, transportation, economy, and community signals that matter most to readers.',
      'For Philadelphia wikis, prioritize Philadelphia and the surrounding region.',
      'Use fresh web search, include dates when available, avoid rumors, and keep every item concise.',
      'Write like a top-tier professional local intelligence briefing: sharp, useful, polished, and skimmable.',
    ].join(' ');
  }

  private hydrateDateValue(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
      return (value as { toDate(): Date }).toDate();
    }
    return null;
  }

  private async countAtlasCollection(
    collectionName: 'documents' | 'wiki_articles' | 'knowledge_entries' | 'wiki_topics' | 'queries' | 'chat_threads',
    userId: string,
    atlasId: string,
  ): Promise<number> {
    if (!this.firestore) return 0;
    const count = await getCountFromServer(
      query(
        collection(this.firestore, collectionName),
        where('user_id', '==', userId),
        where('atlas_id', '==', atlasId),
      ),
    );
    return count.data().count;
  }

  private formatAtlasUsageError(usage: AtlasUsage): string {
    const parts = [
      usage.documents ? `${usage.documents} document${usage.documents === 1 ? '' : 's'}` : null,
      usage.wiki_articles ? `${usage.wiki_articles} wiki page${usage.wiki_articles === 1 ? '' : 's'}` : null,
      usage.knowledge_entries ? `${usage.knowledge_entries} knowledge entr${usage.knowledge_entries === 1 ? 'y' : 'ies'}` : null,
      usage.wiki_topics ? `${usage.wiki_topics} wiki topic${usage.wiki_topics === 1 ? '' : 's'}` : null,
      usage.queries ? `${usage.queries} legacy chat${usage.queries === 1 ? '' : 's'}` : null,
      usage.chat_threads ? `${usage.chat_threads} thread${usage.chat_threads === 1 ? '' : 's'}` : null,
    ].filter(Boolean);

    return `This atlas still has content: ${parts.join(', ')}.`;
  }
}
