import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import {
  buildPublicWikiLiveItem,
  COMING_SOON_PUBLIC_WIKIS,
  removeCreatedPublicWikiPreviews,
  type PublicWikiCatalogItem,
  sortPublicAtlases,
} from '../public-wiki-catalog';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

const CITIES_CATEGORY = 'Cities';
const OTHERS_CATEGORY = 'Others';
const PUBLIC_WIKI_CATEGORIES = [CITIES_CATEGORY, OTHERS_CATEGORY] as const;
type PublicWikiCategory = (typeof PUBLIC_WIKI_CATEGORIES)[number];
const PUBLIC_WIKI_SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'az', label: 'A-Z' },
  { value: 'population', label: 'Population' },
  { value: 'region', label: 'Region' },
  { value: 'time', label: 'Time' },
  { value: 'temp', label: 'Temp' },
] as const;
type PublicWikiSortMode = (typeof PUBLIC_WIKI_SORTS)[number]['value'];

const GLOBAL_REGION_ORDER = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania', 'Other'];
const TEMPERATURE_BATCH_SIZE = 25;

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
  imports: [RouterLink, ThemeToggleComponent, FormsModule],
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
  readonly activeSort = signal<PublicWikiSortMode>('featured');
  readonly cityTemperatures = signal<Record<string, CityTemperatureReading>>({});
  readonly isLoadingTemperatures = signal(false);
  readonly temperatureError = signal<string | null>(null);
  readonly isProductVideoOpen = signal(false);
  readonly productVideoUrl =
    'https://firebasestorage.googleapis.com/v0/b/living-atlas-7622a.firebasestorage.app/o/videos%2FAvatar%20IV%20Video.mp4?alt=media&token=77103de1-4ce4-4be4-8aa2-68f92d94076d';
  private readonly localTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
  private readonly localTimePartsFormatterCache = new Map<string, Intl.DateTimeFormat>();

  readonly comingSoonWikis = computed(() =>
    removeCreatedPublicWikiPreviews(this.liveWikis(), COMING_SOON_PUBLIC_WIKIS),
  );

  readonly publicWikis = computed(() => [
    ...this.liveWikis(),
    ...this.comingSoonWikis(),
  ]);

  readonly liveCount = computed(() => this.liveWikis().length);
  readonly comingSoonCount = computed(() => this.comingSoonWikis().length);

  readonly categories = computed(() => [...PUBLIC_WIKI_CATEGORIES]);
  readonly sortOptions = computed(() => [...PUBLIC_WIKI_SORTS]);

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
    this.activeSort.set('featured');
  }

  setSort(mode: PublicWikiSortMode): void {
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
    return wiki.title.replace(/^my living wiki:\s*/i, '').trim().toLowerCase();
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
