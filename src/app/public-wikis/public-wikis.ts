import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import {
  buildPublicWikiLiveItem,
  type PublicWikiCatalogItem,
  sortPublicAtlases,
} from '../public-wiki-catalog';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';

const CITIES_CATEGORY = 'Cities';
const OTHERS_CATEGORY = 'Others';
const PUBLIC_WIKI_CATEGORIES = [CITIES_CATEGORY, OTHERS_CATEGORY] as const;
type PublicWikiCategory = (typeof PUBLIC_WIKI_CATEGORIES)[number];
const PUBLIC_WIKI_SORTS = [
  { value: 'az', label: 'A-Z' },
  { value: 'population', label: 'Population' },
  { value: 'density', label: 'Density' },
  { value: 'region', label: 'Region' },
  { value: 'time', label: 'Time' },
  { value: 'temp', label: 'Temp' },
] as const;
type PublicWikiVisibleSortMode = (typeof PUBLIC_WIKI_SORTS)[number]['value'];
type PublicWikiSortMode = 'featured' | PublicWikiVisibleSortMode;

const GLOBAL_REGION_ORDER = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania', 'Other'];
const TEMPERATURE_BATCH_SIZE = 25;
const TEMPERATURE_TONES = [
  { min: 100, from: '#9f1239', via: '#e11d48', to: '#fb923c', surface: 'rgba(225,29,72,0.2)', border: 'rgba(225,29,72,0.45)' },
  { min: 94, from: '#c2410c', via: '#f97316', to: '#facc15', surface: 'rgba(249,115,22,0.2)', border: 'rgba(249,115,22,0.45)' },
  { min: 86, from: '#ca8a04', via: '#eab308', to: '#bef264', surface: 'rgba(234,179,8,0.2)', border: 'rgba(234,179,8,0.42)' },
  { min: 78, from: '#0f766e', via: '#14b8a6', to: '#67e8f9', surface: 'rgba(20,184,166,0.18)', border: 'rgba(20,184,166,0.4)' },
  { min: 68, from: '#1d4ed8', via: '#0ea5e9', to: '#7dd3fc', surface: 'rgba(14,165,233,0.18)', border: 'rgba(14,165,233,0.4)' },
  { min: -100, from: '#1e3a8a', via: '#2563eb', to: '#93c5fd', surface: 'rgba(37,99,235,0.18)', border: 'rgba(37,99,235,0.42)' },
] as const;
const TEMPERATURE_NEUTRAL_TONE = {
  from: '#475569',
  via: '#64748b',
  to: '#94a3b8',
  surface: 'rgba(100,116,139,0.14)',
  border: 'rgba(148,163,184,0.3)',
} as const;
const TIME_TONES = [
  { start: 5, end: 7, from: '#075985', via: '#0891b2', to: '#fde68a', surface: 'rgba(14,165,233,0.12)', border: 'rgba(14,165,233,0.34)', icon: 'wb_twilight', iconColor: '#fde68a' },
  { start: 7, end: 12, from: '#1e3a8a', via: '#2563eb', to: '#93c5fd', surface: 'rgba(37,99,235,0.14)', border: 'rgba(37,99,235,0.34)', icon: 'wb_sunny', iconColor: '#facc15' },
  { start: 12, end: 17, from: '#3b82f6', via: '#67e8f9', to: '#b7f7ef', surface: 'rgba(103,232,249,0.16)', border: 'rgba(45,212,191,0.36)', icon: 'wb_sunny', iconColor: '#facc15' },
  { start: 17, end: 20, from: '#7c3aed', via: '#c4b5fd', to: '#fbcfe8', surface: 'rgba(196,181,253,0.18)', border: 'rgba(167,139,250,0.38)', icon: 'wb_twilight', iconColor: '#fb923c' },
  { start: 20, end: 23, from: '#a78bfa', via: '#c4b5fd', to: '#f5d0fe', surface: 'rgba(196,181,253,0.2)', border: 'rgba(167,139,250,0.4)', icon: 'wb_twilight', iconColor: '#f97316' },
  { start: 23, end: 24, from: '#0f172a', via: '#1d4ed8', to: '#2563eb', surface: 'rgba(29,78,216,0.18)', border: 'rgba(37,99,235,0.4)', icon: 'dark_mode', iconColor: '#bfdbfe' },
  { start: 0, end: 5, from: '#020617', via: '#0f172a', to: '#1e3a8a', surface: 'rgba(15,23,42,0.28)', border: 'rgba(30,64,175,0.42)', icon: 'dark_mode', iconColor: '#bfdbfe' },
] as const;
const TIME_NEUTRAL_TONE = {
  from: '#334155',
  via: '#64748b',
  to: '#cbd5e1',
  surface: 'rgba(100,116,139,0.14)',
  border: 'rgba(148,163,184,0.3)',
  icon: 'schedule',
  iconColor: '#e2e8f0',
} as const;
const POPULATION_TONE = {
  from: '#0f172a',
  via: '#334155',
  to: '#64748b',
  surface: 'rgba(51,65,85,0.16)',
  border: 'rgba(100,116,139,0.36)',
} as const;
const DENSITY_TONES = [
  { min: 20_000, from: '#0f172a', via: '#1f2937', to: '#475569', surface: 'rgba(15,23,42,0.22)', border: 'rgba(71,85,105,0.48)' },
  { min: 10_000, from: '#111827', via: '#374151', to: '#6b7280', surface: 'rgba(31,41,55,0.18)', border: 'rgba(75,85,99,0.42)' },
  { min: 3_000, from: '#3730a3', via: '#4f46e5', to: '#a5b4fc', surface: 'rgba(79,70,229,0.16)', border: 'rgba(99,102,241,0.38)' },
  { min: 1_000, from: '#0f766e', via: '#5eead4', to: '#ccfbf1', surface: 'rgba(45,212,191,0.16)', border: 'rgba(20,184,166,0.36)' },
  { min: 0, from: '#c7d2fe', via: '#e9d5ff', to: '#f5d0fe', surface: 'rgba(233,213,255,0.16)', border: 'rgba(216,180,254,0.34)' },
] as const;
const DENSITY_NEUTRAL_TONE = {
  from: '#475569',
  via: '#64748b',
  to: '#94a3b8',
  surface: 'rgba(100,116,139,0.14)',
  border: 'rgba(148,163,184,0.3)',
} as const;

const CITY_DENSITY_PER_KM2_BY_KEY: Record<string, number> = {
  'abu dhabi': 110,
  atlanta: 1418,
  berlin: 4127,
  boise: 1146,
  boston: 5532,
  burlington: 1032,
  cairo: 19376,
  delhi: 12100,
  dhaka: 29069,
  doha: 4610,
  dubai: 860,
  'las vegas': 1781,
  'los angeles': 3124,
  marrakech: 688,
  miami: 4866,
  mumbai: 21665,
  'new york city': 11232,
  paris: 20360,
  phoenix: 1200,
  savannah: 534,
  tampa: 1313,
  toronto: 4427,
  vancouver: 5749,
};

const COUNTRY_REGION_HINTS: Array<{ region: string; countries: string[] }> = [
  {
    region: 'Africa',
    countries: ['Algeria', 'Democratic Republic of the Congo', 'Egypt', 'Ghana', 'Kenya', 'Morocco', 'Nigeria', 'South Africa'],
  },
  {
    region: 'Americas',
    countries: ['Argentina', 'Brazil', 'Canada', 'Chile', 'Colombia', 'Mexico', 'Peru', 'Puerto Rico', 'Turks and Caicos Islands', 'United States'],
  },
  {
    region: 'Asia',
    countries: ['China', 'India', 'Israel', 'Japan', 'Qatar', 'Singapore', 'South Korea', 'Taiwan', 'Thailand', 'Turkey'],
  },
  {
    region: 'Europe',
    countries: ['Austria', 'Belgium', 'Czech Republic', 'Denmark', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland', 'Italy', 'Netherlands', 'Norway', 'Poland', 'Portugal', 'Spain', 'Sweden', 'United Kingdom'],
  },
  {
    region: 'Oceania',
    countries: ['Australia', 'New Zealand'],
  },
];

interface CityTemperatureReading {
  fahrenheit: number;
  fetchedAt: string;
}

interface OpenMeteoLocationResponse {
  current?: {
    temperature_2m?: number | null;
    time?: string | null;
  } | null;
}

@Component({
  selector: 'app-public-wikis',
  imports: [RouterLink, ThemeToggleComponent, FormsModule, WorkspaceSidebarComponent],
  templateUrl: './public-wikis.html',
})
export class PublicWikisComponent implements OnInit {
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);

  readonly isSignedIn = this.authService.isAuthenticated;
  readonly liveWikis = signal<PublicWikiCatalogItem[]>([]);
  readonly isLoadingLiveWikis = signal(true);
  readonly searchTerm = signal('');
  readonly activeCategory = signal<PublicWikiCategory>(CITIES_CATEGORY);
  readonly activeSort = signal<PublicWikiSortMode>('az');
  readonly cityTemperatures = signal<Record<string, CityTemperatureReading>>({});
  readonly isLoadingTemperatures = signal(false);
  readonly temperatureError = signal<string | null>(null);
  readonly isProductVideoOpen = signal(false);
  readonly productVideoUrl =
    'https://firebasestorage.googleapis.com/v0/b/living-atlas-7622a.firebasestorage.app/o/videos%2FAvatar%20IV%20Video.mp4?alt=media&token=77103de1-4ce4-4be4-8aa2-68f92d94076d';
  private readonly localTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
  private readonly localTimePartsFormatterCache = new Map<string, Intl.DateTimeFormat>();
  private readonly localTimeHeroFormatterCache = new Map<string, Intl.DateTimeFormat>();
  private readonly timezoneFormatterCache = new Map<string, Intl.DateTimeFormat>();

  readonly publicWikis = computed(() => this.liveWikis());

  readonly liveCount = computed(() => this.liveWikis().length);

  readonly categories = computed(() => [...PUBLIC_WIKI_CATEGORIES]);
  readonly sortOptions = computed(() => [...PUBLIC_WIKI_SORTS]);
  readonly isTemperatureSort = computed(() => this.activeCategory() === CITIES_CATEGORY && this.activeSort() === 'temp');
  readonly isTimeSort = computed(() => this.activeCategory() === CITIES_CATEGORY && this.activeSort() === 'time');
  readonly isPopulationSort = computed(() => this.activeCategory() === CITIES_CATEGORY && this.activeSort() === 'population');
  readonly isDensitySort = computed(() => this.activeCategory() === CITIES_CATEGORY && this.activeSort() === 'density');

  readonly categoryCounts = computed(() =>
    this.categories().reduce<Record<string, number>>((acc, cat) => {
      acc[cat] = this.publicWikis().filter((wiki) => this.categoryForWiki(wiki) === cat).length;
      return acc;
    }, {}),
  );

  readonly hasFilters = computed(
    () => this.activeCategory() !== CITIES_CATEGORY || this.searchTerm().trim().length > 0,
  );

  readonly filteredWikis = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const cat = this.activeCategory();

    const filtered = this.publicWikis().filter((wiki) => {
      const catMatch = this.categoryForWiki(wiki) === cat;
      if (!catMatch) return false;
      if (!term) return true;

      const haystack = [
        wiki.title,
        wiki.subtitle,
	        wiki.description,
	        wiki.category ?? '',
	        wiki.sources ?? '',
	        wiki.countryLabel ?? '',
	        ...(wiki.badges ?? []),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
    return this.sortWikis(filtered);
  });

  async ngOnInit(): Promise<void> {
    this.isLoadingLiveWikis.set(true);

	    try {
	      const atlases = await this.atlasService.listPublicAtlases();
	      const liveWikis = sortPublicAtlases(atlases).map((atlas) => ({
	        ...buildPublicWikiLiveItem(atlas),
	        countryLabel: this.atlasService.cityCountryLabel(atlas),
	      }));
	      this.liveWikis.set(liveWikis);
      if (this.activeSort() === 'temp') {
        void this.ensureTemperatures();
      }
    } catch {
      this.liveWikis.set([]);
    } finally {
      this.isLoadingLiveWikis.set(false);
    }
  }

  displayWikiTitle(wiki: PublicWikiCatalogItem): string {
    return this.normalizeVisibleWikiTitle(wiki.title);
  }

  setCategory(cat: PublicWikiCategory): void {
    this.activeCategory.set(cat);
    if (cat !== CITIES_CATEGORY) {
      this.activeSort.set('featured');
    }
  }

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }

  clearFilters(): void {
    this.activeCategory.set(CITIES_CATEGORY);
    this.searchTerm.set('');
    this.activeSort.set('az');
  }

  setSort(mode: PublicWikiVisibleSortMode): void {
    this.activeSort.set(mode);
    if (mode === 'temp') {
      void this.ensureTemperatures();
    }
  }

  openProductVideo(): void {
    this.isProductVideoOpen.set(true);
  }

  closeProductVideo(): void {
    this.isProductVideoOpen.set(false);
  }

  initialsFor(title: string): string {
    return title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  populationLabel(wiki: PublicWikiCatalogItem): string | null {
    if (!wiki.population) {
      return null;
    }
    const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(wiki.population);
    return wiki.populationYear ? `${formatted} (${wiki.populationYear})` : formatted;
  }

  populationHeroLabel(wiki: PublicWikiCatalogItem): string {
    if (!wiki.population) {
      return 'No population';
    }

    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(wiki.population);
  }

  populationBandBackground(): string | null {
    if (!this.isPopulationSort()) {
      return null;
    }

    return `linear-gradient(90deg, ${POPULATION_TONE.from}, ${POPULATION_TONE.via} 52%, ${POPULATION_TONE.to})`;
  }

  populationCardBackground(): string | null {
    if (!this.isPopulationSort()) {
      return null;
    }

    return `linear-gradient(180deg, ${POPULATION_TONE.surface}, rgba(255,255,255,0.025) 48%, var(--surface) 100%)`;
  }

  populationBorderColor(): string | null {
    return this.isPopulationSort() ? POPULATION_TONE.border : null;
  }

  densityLabel(wiki: PublicWikiCatalogItem): string | null {
    const density = this.populationDensityForWiki(wiki);
    if (density === null) {
      return null;
    }

    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(density)} pers/km²`;
  }

  densityHeroLabel(wiki: PublicWikiCatalogItem): string {
    return this.densityLabel(wiki) ?? 'Density needed';
  }

  densityBandBackground(wiki: PublicWikiCatalogItem): string | null {
    if (!this.isDensitySort()) {
      return null;
    }

    const tone = this.densityTone(wiki);
    return `linear-gradient(90deg, ${tone.from}, ${tone.via} 52%, ${tone.to})`;
  }

  densityCardBackground(wiki: PublicWikiCatalogItem): string | null {
    if (!this.isDensitySort()) {
      return null;
    }

    const tone = this.densityTone(wiki);
    return `linear-gradient(180deg, ${tone.surface}, rgba(255,255,255,0.025) 48%, var(--surface) 100%)`;
  }

  densityBorderColor(wiki: PublicWikiCatalogItem): string | null {
    return this.isDensitySort() ? this.densityTone(wiki).border : null;
  }

  showRankBadge(): boolean {
    return this.activeCategory() === CITIES_CATEGORY && ['population', 'density', 'time', 'temp'].includes(this.activeSort());
  }

  localTimeLabel(wiki: PublicWikiCatalogItem): string | null {
    const timezone = wiki.timezone?.trim();
    if (!timezone) {
      return null;
    }

    try {
      return this.localTimeFormatter(timezone).format(new Date());
    } catch {
      return null;
    }
  }

  temperatureLabel(wiki: PublicWikiCatalogItem): string | null {
    const reading = this.temperatureForWiki(wiki);
    if (reading) {
      return `${Math.round(reading.fahrenheit)}°F`;
    }

    if (this.activeSort() !== 'temp') {
      return null;
    }

    if (!this.coordinatePair(wiki)) {
      return 'Unavailable';
    }

    return this.isLoadingTemperatures() ? 'Loading' : null;
  }

  temperatureHeroLabel(wiki: PublicWikiCatalogItem): string {
    return this.temperatureLabel(wiki) ?? 'No temp';
  }

  temperatureAssistiveLabel(wiki: PublicWikiCatalogItem): string {
    const reading = this.temperatureForWiki(wiki);
    if (reading) {
      return 'Current temperature';
    }

    if (!this.coordinatePair(wiki)) {
      return 'Temperature unavailable';
    }

    return this.isLoadingTemperatures() ? 'Loading current temperature' : 'Temperature pending';
  }

  temperatureBandBackground(wiki: PublicWikiCatalogItem): string | null {
    if (!this.isTemperatureSort()) {
      return null;
    }

    const tone = this.temperatureTone(wiki);
    return `linear-gradient(90deg, ${tone.from}, ${tone.via} 52%, ${tone.to})`;
  }

  temperatureCardBackground(wiki: PublicWikiCatalogItem): string | null {
    if (!this.isTemperatureSort()) {
      return null;
    }

    const tone = this.temperatureTone(wiki);
    return `linear-gradient(180deg, ${tone.surface}, rgba(255,255,255,0.025) 48%, var(--surface) 100%)`;
  }

  temperatureBorderColor(wiki: PublicWikiCatalogItem): string | null {
    return this.isTemperatureSort() ? this.temperatureTone(wiki).border : null;
  }

  timeHeroLabel(wiki: PublicWikiCatalogItem): string {
    const timezone = wiki.timezone?.trim();
    if (!timezone) {
      return 'No time';
    }

    try {
      return this.localTimeHeroFormatter(timezone).format(new Date());
    } catch {
      return 'No time';
    }
  }

  timeZoneLabel(wiki: PublicWikiCatalogItem): string {
    const timezone = wiki.timezone?.trim();
    if (!timezone) {
      return '';
    }

    try {
      const parts = this.timezoneFormatter(timezone).formatToParts(new Date());
      return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    } catch {
      return '';
    }
  }

  timeIcon(wiki: PublicWikiCatalogItem): string {
    return this.timeTone(wiki).icon;
  }

  timeIconColor(wiki: PublicWikiCatalogItem): string {
    return this.timeTone(wiki).iconColor;
  }

  timeBandBackground(wiki: PublicWikiCatalogItem): string | null {
    if (!this.isTimeSort()) {
      return null;
    }

    const tone = this.timeTone(wiki);
    return `linear-gradient(90deg, ${tone.from}, ${tone.via} 52%, ${tone.to})`;
  }

  timeCardBackground(wiki: PublicWikiCatalogItem): string | null {
    if (!this.isTimeSort()) {
      return null;
    }

    const tone = this.timeTone(wiki);
    return `linear-gradient(180deg, ${tone.surface}, rgba(255,255,255,0.025) 48%, var(--surface) 100%)`;
  }

  timeBorderColor(wiki: PublicWikiCatalogItem): string | null {
    return this.isTimeSort() ? this.timeTone(wiki).border : null;
  }

  temperatureStatusLabel(): string | null {
    if (this.activeSort() !== 'temp') {
      return null;
    }

    if (this.isLoadingTemperatures()) {
      return 'Fetching current temps';
    }

    const loadedCount = Object.keys(this.cityTemperatures()).length;
    if (loadedCount > 0) {
      return `${loadedCount} temps loaded`;
    }

    return this.temperatureError();
  }

  private categoryForWiki(wiki: PublicWikiCatalogItem): PublicWikiCategory {
    return wiki.category === 'Cities & Regions' ? CITIES_CATEGORY : OTHERS_CATEGORY;
  }

  private sortWikis(wikis: PublicWikiCatalogItem[]): PublicWikiCatalogItem[] {
    const sorted = [...wikis];
    switch (this.activeSort()) {
      case 'az':
        return sorted.sort((a, b) => this.titleKey(a).localeCompare(this.titleKey(b)));
      case 'population':
        return sorted.sort((a, b) => {
          const aPopulation = a.population ?? -1;
          const bPopulation = b.population ?? -1;
          if (aPopulation !== bPopulation) return bPopulation - aPopulation;
          return this.titleKey(a).localeCompare(this.titleKey(b));
        });
      case 'density':
        return sorted.sort((a, b) => {
          const aDensity = this.populationDensityForWiki(a) ?? -1;
          const bDensity = this.populationDensityForWiki(b) ?? -1;
          if (aDensity !== bDensity) return bDensity - aDensity;
          return this.titleKey(a).localeCompare(this.titleKey(b));
        });
      case 'region':
        return sorted.sort((a, b) => {
          const aRegion = this.globalRegionForWiki(a);
          const bRegion = this.globalRegionForWiki(b);
          const aIndex = GLOBAL_REGION_ORDER.indexOf(aRegion);
          const bIndex = GLOBAL_REGION_ORDER.indexOf(bRegion);
          if (aIndex !== bIndex) return aIndex - bIndex;
          if (aRegion !== bRegion) return aRegion.localeCompare(bRegion);
          return this.titleKey(a).localeCompare(this.titleKey(b));
        });
      case 'time':
        return sorted.sort((a, b) => {
          const aMinutes = this.localMinutesForWiki(a);
          const bMinutes = this.localMinutesForWiki(b);
          if (aMinutes !== null && bMinutes !== null && aMinutes !== bMinutes) {
            return aMinutes - bMinutes;
          }
          if (aMinutes !== null && bMinutes === null) return -1;
          if (aMinutes === null && bMinutes !== null) return 1;
          return this.titleKey(a).localeCompare(this.titleKey(b));
        });
      case 'temp':
        return sorted.sort((a, b) => {
          const aTemp = this.temperatureForWiki(a)?.fahrenheit ?? null;
          const bTemp = this.temperatureForWiki(b)?.fahrenheit ?? null;
          if (aTemp !== null && bTemp !== null && aTemp !== bTemp) {
            return bTemp - aTemp;
          }
          if (aTemp !== null && bTemp === null) return -1;
          if (aTemp === null && bTemp !== null) return 1;
          return this.titleKey(a).localeCompare(this.titleKey(b));
        });
      case 'featured':
      default:
        return sorted;
    }
  }

  private titleKey(wiki: PublicWikiCatalogItem): string {
    return this.normalizeVisibleWikiTitle(wiki.title).replace(/^living wiki:\s*/i, '').trim().toLowerCase();
  }

  private cityNameKey(wiki: PublicWikiCatalogItem): string {
    return this.normalizeVisibleWikiTitle(wiki.title)
      .replace(/^living wiki:\s*/i, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLowerCase();
  }

  private normalizeVisibleWikiTitle(title: string): string {
    return title.replace(/^my\s+living\s+wiki:/i, 'Living Wiki:').trim();
  }

  private globalRegionForWiki(wiki: PublicWikiCatalogItem): string {
    const explicit = wiki.globalRegion?.trim();
    if (explicit) {
      return explicit;
    }

    const country = wiki.countryLabel?.trim();
    const match = COUNTRY_REGION_HINTS.find((hint) => country && hint.countries.includes(country));
    return match?.region ?? 'Other';
  }

  private localMinutesForWiki(wiki: PublicWikiCatalogItem): number | null {
    const timezone = wiki.timezone?.trim();
    if (!timezone) {
      return null;
    }

    try {
      const parts = this.localTimePartsFormatter(timezone).formatToParts(new Date());
      const hour = Number(parts.find((part) => part.type === 'hour')?.value);
      const minute = Number(parts.find((part) => part.type === 'minute')?.value);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        return null;
      }
      return (hour % 24) * 60 + minute;
    } catch {
      return null;
    }
  }

  private localTimeFormatter(timezone: string): Intl.DateTimeFormat {
    const cached = this.localTimeFormatterCache.get(timezone);
    if (cached) {
      return cached;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    });
    this.localTimeFormatterCache.set(timezone, formatter);
    return formatter;
  }

  private localTimePartsFormatter(timezone: string): Intl.DateTimeFormat {
    const cached = this.localTimePartsFormatterCache.get(timezone);
    if (cached) {
      return cached;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    this.localTimePartsFormatterCache.set(timezone, formatter);
    return formatter;
  }

  private localTimeHeroFormatter(timezone: string): Intl.DateTimeFormat {
    const cached = this.localTimeHeroFormatterCache.get(timezone);
    if (cached) {
      return cached;
    }

    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    this.localTimeHeroFormatterCache.set(timezone, formatter);
    return formatter;
  }

  private timezoneFormatter(timezone: string): Intl.DateTimeFormat {
    const cached = this.timezoneFormatterCache.get(timezone);
    if (cached) {
      return cached;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    this.timezoneFormatterCache.set(timezone, formatter);
    return formatter;
  }

  private async ensureTemperatures(): Promise<void> {
    if (this.isLoadingTemperatures()) {
      return;
    }

    const existing = this.cityTemperatures();
    const candidates = this.liveWikis().filter(
      (wiki) =>
        this.categoryForWiki(wiki) === CITIES_CATEGORY &&
        this.coordinatePair(wiki) !== null &&
        !existing[this.wikiKey(wiki)],
    );
    if (candidates.length === 0) {
      return;
    }

    this.isLoadingTemperatures.set(true);
    this.temperatureError.set(null);

    let failedBatches = 0;
    try {
      for (let index = 0; index < candidates.length; index += TEMPERATURE_BATCH_SIZE) {
        const batch = candidates.slice(index, index + TEMPERATURE_BATCH_SIZE);
        try {
          const readings = await this.fetchTemperatureBatch(batch);
          this.cityTemperatures.update((current) => ({ ...current, ...readings }));
        } catch {
          failedBatches += 1;
        }
      }
    } finally {
      if (failedBatches > 0) {
        this.temperatureError.set(`${failedBatches} temperature batch${failedBatches === 1 ? '' : 'es'} failed.`);
      }
      this.isLoadingTemperatures.set(false);
    }
  }

  private async fetchTemperatureBatch(wikis: PublicWikiCatalogItem[]): Promise<Record<string, CityTemperatureReading>> {
    const locatedWikis = wikis
      .map((wiki) => ({ wiki, coordinates: this.coordinatePair(wiki) }))
      .filter((item): item is { wiki: PublicWikiCatalogItem; coordinates: { latitude: number; longitude: number } } => item.coordinates !== null);

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', locatedWikis.map((item) => String(item.coordinates.latitude)).join(','));
    url.searchParams.set('longitude', locatedWikis.map((item) => String(item.coordinates.longitude)).join(','));
    url.searchParams.set('current', 'temperature_2m');
    url.searchParams.set('temperature_unit', 'fahrenheit');
    url.searchParams.set('timezone', 'auto');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Open-Meteo returned ${response.status}`);
    }

    const payload = (await response.json()) as OpenMeteoLocationResponse | OpenMeteoLocationResponse[];
    const locations = Array.isArray(payload) ? payload : [payload];
    const fetchedAt = new Date().toISOString();
    const readings: Record<string, CityTemperatureReading> = {};

    locations.forEach((location, index) => {
      const wiki = locatedWikis[index]?.wiki;
      const temperature = location.current?.temperature_2m;
      if (!wiki || typeof temperature !== 'number' || !Number.isFinite(temperature)) {
        return;
      }

      readings[this.wikiKey(wiki)] = {
        fahrenheit: temperature,
        fetchedAt,
      };
    });

    return readings;
  }

  private temperatureForWiki(wiki: PublicWikiCatalogItem): CityTemperatureReading | null {
    return this.cityTemperatures()[this.wikiKey(wiki)] ?? null;
  }

  private temperatureTone(wiki: PublicWikiCatalogItem): (typeof TEMPERATURE_TONES)[number] | typeof TEMPERATURE_NEUTRAL_TONE {
    const fahrenheit = this.temperatureForWiki(wiki)?.fahrenheit ?? null;
    if (fahrenheit === null) {
      return TEMPERATURE_NEUTRAL_TONE;
    }

    return TEMPERATURE_TONES.find((tone) => fahrenheit >= tone.min) ?? TEMPERATURE_NEUTRAL_TONE;
  }

  private populationDensityForWiki(wiki: PublicWikiCatalogItem): number | null {
    if (
      typeof wiki.populationDensityPerKm2 === 'number' &&
      Number.isFinite(wiki.populationDensityPerKm2) &&
      wiki.populationDensityPerKm2 > 0
    ) {
      return Math.round(wiki.populationDensityPerKm2);
    }
    if (
      typeof wiki.areaKm2 === 'number' &&
      Number.isFinite(wiki.areaKm2) &&
      wiki.areaKm2 > 0 &&
      typeof wiki.population === 'number' &&
      Number.isFinite(wiki.population) &&
      wiki.population > 0
    ) {
      return Math.round(wiki.population / wiki.areaKm2);
    }
    const density = CITY_DENSITY_PER_KM2_BY_KEY[this.cityNameKey(wiki)];
    return typeof density === 'number' && Number.isFinite(density) && density > 0 ? density : null;
  }

  private densityTone(wiki: PublicWikiCatalogItem): (typeof DENSITY_TONES)[number] | typeof DENSITY_NEUTRAL_TONE {
    const density = this.populationDensityForWiki(wiki);
    if (density === null) {
      return DENSITY_NEUTRAL_TONE;
    }

    return DENSITY_TONES.find((tone) => density >= tone.min) ?? DENSITY_NEUTRAL_TONE;
  }

  private timeTone(wiki: PublicWikiCatalogItem): (typeof TIME_TONES)[number] | typeof TIME_NEUTRAL_TONE {
    const minutes = this.localMinutesForWiki(wiki);
    if (minutes === null) {
      return TIME_NEUTRAL_TONE;
    }

    const hour = Math.floor(minutes / 60);
    return TIME_TONES.find((tone) => hour >= tone.start && hour < tone.end) ?? TIME_NEUTRAL_TONE;
  }

  private coordinatePair(wiki: PublicWikiCatalogItem): { latitude: number; longitude: number } | null {
    const latitude = wiki.latitude;
    const longitude = wiki.longitude;
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }

    return { latitude, longitude };
  }

  private wikiKey(wiki: PublicWikiCatalogItem): string {
    return wiki.slug?.trim().toLowerCase() || this.titleKey(wiki);
  }
}
