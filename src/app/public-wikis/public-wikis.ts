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
import { AccountMenuComponent } from '../account-menu/account-menu';

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
type MobileCitySortMode = Extract<PublicWikiVisibleSortMode, 'population' | 'temp' | 'region' | 'az'>;

interface MobileHomeCard {
  title: string;
  chip: string;
  icon: string;
  accent: string;
  link: string;
}

interface MobileHomeSection {
  id: string;
  label: string;
  icon: string;
  addLabel: string;
  addLink: string;
  cards: MobileHomeCard[];
}

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

const MOBILE_CITY_SORTS: Array<{ value: MobileCitySortMode; label: string }> = [
  { value: 'population', label: 'Pop' },
  { value: 'temp', label: 'Temp' },
  { value: 'region', label: 'Region' },
  { value: 'az', label: 'A-Z' },
];

const MOBILE_HOME_SECTIONS: MobileHomeSection[] = [
  {
    id: 'boards',
    label: 'My Boards',
    icon: 'dashboard_customize',
    addLabel: 'Add board',
    addLink: '/boards',
    cards: [
      { title: 'Cape May: Unique Stays & Local Gems', chip: '7 cards', icon: 'cottage', accent: '#1f6fd6', link: '/boards' },
      { title: 'Inverness Pub Crawl: Top Taverns & Hidden Gems', chip: '11 cards', icon: 'local_bar', accent: '#7a5c3e', link: '/boards' },
      { title: 'Best Sushi in Philly', chip: '3 cards', icon: 'restaurant', accent: '#c96b6b', link: '/boards' },
    ],
  },
  {
    id: 'songs',
    label: 'My Songs',
    icon: 'music_note',
    addLabel: 'Add song',
    addLink: '/chat/philly',
    cards: [
      { title: "Don't Go Breaking My Heart", chip: 'favorite', icon: 'piano', accent: '#3a3a4d', link: '/chat/philly' },
      { title: 'You Should Be Dancing', chip: 'preview', icon: 'graphic_eq', accent: '#4d3a5e', link: '/chat/philly' },
      { title: 'The Boys Are Back in Town', chip: 'favorite', icon: 'album', accent: '#5e3a3a', link: '/chat/philly' },
    ],
  },
  {
    id: 'friends',
    label: 'My Friends',
    icon: 'group',
    addLabel: 'Add friend',
    addLink: '/friends',
    cards: [
      { title: "Sam's Fishtown Taco Trail", chip: '9 cards', icon: 'diversity_3', accent: '#d98f4e', link: '/friends' },
      { title: "Maria's Lisbon Miradouros", chip: '12 cards', icon: 'sailing', accent: '#5ea3c9', link: '/friends' },
      { title: "Ken's Quiet Kyoto Temples", chip: '8 cards', icon: 'temple_buddhist', accent: '#c96b8a', link: '/friends' },
    ],
  },
  {
    id: 'trips',
    label: 'My Trips',
    icon: 'map',
    addLabel: 'Add trip',
    addLink: '/chat/philly',
    cards: [
      { title: 'World Cup Week: Philadelphia', chip: 'dealt daily', icon: 'sports_soccer', accent: '#3f8f5a', link: '/chat/philly' },
      { title: 'Gettysburg Driving Tour', chip: '6 stops', icon: 'directions_car', accent: '#8a8f5a', link: '/chat/philly' },
      { title: 'Old City Philly Walking Tour', chip: '8 stops', icon: 'hiking', accent: '#b0743f', link: '/chat/philly' },
    ],
  },
];

const CITY_DENSITY_PER_KM2_BY_KEY: Record<string, number> = {
  'abu dhabi': 110,
  abidjan: 14900,
  accra: 6800,
  'addis ababa': 6100,
  ahmedabad: 12000,
  alexandria: 6000,
  amherst: 550,
  amsterdam: 5200,
  ankara: 2200,
  asheville: 790,
  athens: 7500,
  atlanta: 1418,
  auckland: 2400,
  austin: 1250,
  avalon: 480,
  baghdad: 13500,
  baltimore: 2900,
  bandung: 14700,
  bangkok: 5300,
  barcelona: 16000,
  beijing: 1300,
  belgrade: 3400,
  berlin: 4127,
  'belo horizonte': 7600,
  bengaluru: 11900,
  birmingham: 560,
  'birmingham uk': 4300,
  bogota: 4400,
  boise: 1146,
  bordeaux: 5200,
  boston: 5532,
  brasília: 530,
  brussels: 7500,
  budapest: 3300,
  'buenos aires': 15100,
  buffalo: 2400,
  busan: 4300,
  cairo: 19376,
  calgary: 1600,
  'cape may': 550,
  'cape town': 1944,
  caracas: 4400,
  casablanca: 14500,
  charleston: 530,
  charlotte: 1120,
  chengdu: 1800,
  chennai: 17000,
  chester: 4200,
  chicago: 4600,
  chongqing: 390,
  'cocoa beach': 940,
  columbus: 1600,
  copenhagen: 7000,
  dalian: 1200,
  dallas: 1500,
  dammam: 2100,
  'dar es salaam': 3300,
  delhi: 12100,
  denver: 1830,
  detroit: 1830,
  dhaka: 29069,
  doha: 4610,
  dongguan: 1800,
  dubai: 860,
  dublin: 4900,
  durban: 2400,
  edinburgh: 1900,
  edmonton: 1360,
  florence: 3700,
  fortaleza: 8300,
  foshan: 1900,
  fukuoka: 4700,
  gainesville: 897,
  geneva: 12500,
  glasgow: 3600,
  guadalajara: 8900,
  guangzhou: 2000,
  guayaquil: 7400,
  hamburg: 2500,
  hangzhou: 1600,
  harbin: 700,
  hartford: 2700,
  helsinki: 3100,
  hiroshima: 1300,
  'ho chi minh city': 4500,
  'hong kong': 6800,
  honolulu: 2200,
  houston: 1400,
  hyderabad: 10500,
  incheon: 2900,
  indianapolis: 950,
  istanbul: 3000,
  jacksonville: 480,
  jakarta: 16000,
  jeddah: 5400,
  jerusalem: 7400,
  jinan: 1300,
  johannesburg: 3200,
  kanazawa: 990,
  kano: 10000,
  karachi: 24000,
  'key west': 1700,
  khartoum: 4300,
  kinshasa: 1709,
  kolkata: 24000,
  'kuala lumpur': 7700,
  'kuwait city': 6200,
  kyoto: 1800,
  lagos: 14000,
  lahore: 6300,
  'las vegas': 1781,
  lima: 3700,
  lisbon: 6500,
  ljubljana: 1100,
  london: 5711,
  'los angeles': 3124,
  luanda: 6500,
  lyon: 10800,
  madrid: 5400,
  manchester: 4700,
  manila: 43000,
  marrakech: 688,
  marseille: 3600,
  medellín: 6500,
  media: 2900,
  medina: 2400,
  melbourne: 500,
  memphis: 800,
  'mexico city': 6200,
  miami: 4866,
  milan: 7600,
  minneapolis: 3100,
  monterrey: 3800,
  montreal: 4700,
  moscow: 4950,
  mumbai: 21665,
  muscat: 1800,
  nagoya: 7000,
  nairobi: 7967,
  nanjing: 1400,
  nantucket: 90,
  naples: 8200,
  nara: 1300,
  nashville: 580,
  'new orleans': 900,
  'new york city': 11232,
  northampton: 770,
  'ocean city nj': 1150,
  'oklahoma city': 430,
  orlando: 1100,
  osaka: 12100,
  oslo: 1800,
  ottawa: 365,
  palermo: 4100,
  paris: 20360,
  philadelphia: 4500,
  phoenix: 1200,
  pittsburgh: 2100,
  portland: 1900,
  porto: 5600,
  prague: 2700,
  pune: 5600,
  qingdao: 1200,
  'quebec city': 1200,
  raleigh: 1300,
  recife: 7400,
  richmond: 1500,
  'rio de janeiro': 5300,
  riyadh: 2500,
  rochester: 2200,
  rome: 2200,
  'saint petersburg': 3900,
  'salt lake city': 720,
  salvador: 3900,
  'san diego': 1700,
  'san francisco': 7300,
  'san jose': 2300,
  'san juan': 3100,
  'santa fe': 650,
  santiago: 9000,
  'são paulo': 7400,
  sapporo: 1700,
  savannah: 534,
  seattle: 3479,
  sedona: 240,
  seoul: 15900,
  seville: 4900,
  shanghai: 3900,
  shenyang: 1100,
  shenzhen: 7100,
  singapore: 8210,
  'st augustine': 610,
  stockholm: 5200,
  surabaya: 8700,
  surat: 13700,
  suzhou: 1700,
  sydney: 430,
  taipei: 9600,
  tampa: 1313,
  tehran: 11800,
  'tel aviv': 8300,
  'the hamptons': 230,
  tianjin: 1300,
  tokyo: 6463,
  toronto: 4427,
  tucson: 890,
  turin: 6800,
  'turks caicos': 40,
  valencia: 5900,
  vancouver: 5749,
  venice: 620,
  vienna: 4600,
  'virginia beach': 720,
  warsaw: 3600,
  'washington dc': 4300,
  wuhan: 1300,
  'xi an': 1300,
  yangon: 8700,
  zagreb: 1200,
  zurich: 4700,
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

interface CityTemperatureCoordinates {
  latitude: number;
  longitude: number;
}

interface OpenMeteoLocationResponse {
  current?: {
    temperature_2m?: number | null;
    time?: string | null;
  } | null;
}

interface OpenMeteoGeocodingResult {
  name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  country?: string | null;
  admin1?: string | null;
}

interface OpenMeteoGeocodingResponse {
  results?: OpenMeteoGeocodingResult[] | null;
}

interface PublicWikiStickerAttribute {
  id: string;
  label: string;
  value: string;
  caption: string;
  captionIcon?: string;
  icon: string;
  palette: string;
}

interface PublicWikiFeelingSticker {
  label: string;
  icon: string;
  palette: string;
}

@Component({
  selector: 'app-public-wikis',
  imports: [
    RouterLink,
    ThemeToggleComponent,
    FormsModule,
    WorkspaceSidebarComponent,
    AccountMenuComponent,
  ],
  templateUrl: './public-wikis.html',
  styleUrl: './public-wikis.css',
})
export class PublicWikisComponent implements OnInit {
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);

  readonly isSignedIn = this.authService.isAuthenticated;
  readonly liveWikis = signal<PublicWikiCatalogItem[]>([]);
  readonly isLoadingLiveWikis = signal(true);
  readonly searchTerm = signal('');
  readonly activeCategory = signal<PublicWikiCategory>(CITIES_CATEGORY);
  readonly activeSort = signal<PublicWikiSortMode>('population');
  readonly mobileDrawerOpen = signal(false);
  readonly mobileAllCitiesOpen = signal(false);
  readonly mobileSelectedCitySlug = signal<string | null>('philly');
  readonly cityTemperatures = signal<Record<string, CityTemperatureReading>>({});
  readonly cityTemperatureCoordinates = signal<Record<string, CityTemperatureCoordinates>>({});
  readonly isLoadingTemperatures = signal(false);
  readonly temperatureError = signal<string | null>(null);
  readonly isProductVideoOpen = signal(false);
  readonly productVideoUrl =
    'https://firebasestorage.googleapis.com/v0/b/living-atlas-7622a.firebasestorage.app/o/videos%2FAvatar%20Video.mp4?alt=media&token=6898fe99-71fe-49dc-af66-0467e816de87';
  private readonly localTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
  private readonly localTimePartsFormatterCache = new Map<string, Intl.DateTimeFormat>();
  private readonly localTimeHeroFormatterCache = new Map<string, Intl.DateTimeFormat>();
  private readonly timezoneFormatterCache = new Map<string, Intl.DateTimeFormat>();
  private readonly pendingTemperatureCoordinateLookups = new Map<string, Promise<CityTemperatureCoordinates | null>>();

  readonly publicWikis = computed(() => this.liveWikis());

  readonly liveCount = computed(() => this.liveWikis().length);
  readonly mobileSections = MOBILE_HOME_SECTIONS;
  readonly mobileCitySortOptions = MOBILE_CITY_SORTS;

  readonly categories = computed(() => [...PUBLIC_WIKI_CATEGORIES]);
  readonly sortOptions = computed(() => [...PUBLIC_WIKI_SORTS]);
  readonly isTemperatureSort = computed(() => this.activeCategory() === CITIES_CATEGORY && this.activeSort() === 'temp');
  readonly isTimeSort = computed(() => this.activeCategory() === CITIES_CATEGORY && this.activeSort() === 'time');
  readonly isPopulationSort = computed(() => this.activeCategory() === CITIES_CATEGORY && this.activeSort() === 'population');
  readonly isDensitySort = computed(() => this.activeCategory() === CITIES_CATEGORY && this.activeSort() === 'density');
  readonly isOthersCategory = computed(() => this.activeCategory() === OTHERS_CATEGORY);
  readonly mobileCityWikis = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const cityWikis = this.publicWikis().filter((wiki) => {
      if (this.categoryForWiki(wiki) !== CITIES_CATEGORY) {
        return false;
      }
      if (!term) {
        return true;
      }
      return [
        wiki.title,
        wiki.subtitle,
        wiki.description,
        wiki.countryLabel ?? '',
        this.globalRegionForWiki(wiki),
      ].join(' ').toLowerCase().includes(term);
    });
    return this.sortWikis(cityWikis);
  });
  readonly mobileFeaturedCities = computed(() => this.mobileCityWikis().slice(0, 8));
  readonly mobileSelectedCity = computed(() => {
    const cityWikis = this.publicWikis().filter((wiki) => this.categoryForWiki(wiki) === CITIES_CATEGORY);
    const selectedSlug = this.mobileSelectedCitySlug();
    return (
      cityWikis.find((wiki) => wiki.slug === selectedSlug) ??
      cityWikis.find((wiki) => this.cityNameKey(wiki) === 'philadelphia' || wiki.slug === 'philly') ??
      cityWikis[0] ??
      null
    );
  });
  readonly mobileSelectedCityLink = computed(() => this.mobileSelectedCity()?.link ?? '/chat/philly');
  readonly mobileSelectedCityName = computed(() => {
    const city = this.mobileSelectedCity();
    return city ? this.cityDisplayName(city) : 'Pick your city';
  });

  readonly hasPaidPricingPlan = computed(() => {
    const profile = this.authService.profile();
    const plan = (profile?.pricingPlan || profile?.businessPlan || '').trim().toLowerCase();
    const status = (profile?.subscriptionStatus || '').trim().toLowerCase();
    const hasSubscriptionId = Boolean(profile?.stripeSubscriptionId?.trim());
    const hasPaidPlanName = Boolean(plan) && !['free', 'none', 'reader', 'trial'].includes(plan);
    const activeStatus = !status || ['active', 'trialing', 'paid'].includes(status);
    return (hasPaidPlanName || hasSubscriptionId) && activeStatus;
  });

  readonly showUpgradePrompt = computed(() => !this.hasPaidPricingPlan());

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

  cityDisplayName(wiki: PublicWikiCatalogItem): string {
    return this.displayWikiTitle(wiki)
      .replace(/^Living\s*Wiki:\s*/i, '')
      .replace(/^My\s+Living\s*Wiki:\s*/i, '')
      .trim();
  }

  cityTitleKicker(wiki: PublicWikiCatalogItem): string {
    return this.categoryForWiki(wiki) === CITIES_CATEGORY ? 'LivingWiki city' : wiki.subtitle;
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
    this.activeSort.set('population');
  }

  setSort(mode: PublicWikiVisibleSortMode): void {
    this.activeSort.set(mode);
    if (mode === 'temp') {
      void this.ensureTemperatures();
    }
  }

  setMobileSort(mode: MobileCitySortMode): void {
    this.activeCategory.set(CITIES_CATEGORY);
    this.setSort(mode);
  }

  toggleMobileDrawer(): void {
    this.mobileDrawerOpen.update((open) => !open);
  }

  closeMobileDrawer(): void {
    this.mobileDrawerOpen.set(false);
  }

  toggleMobileAllCities(): void {
    this.mobileAllCitiesOpen.update((open) => !open);
  }

  selectMobileCity(wiki: PublicWikiCatalogItem): void {
    this.mobileSelectedCitySlug.set(wiki.slug ?? null);
    this.mobileAllCitiesOpen.set(false);
  }

  mobileSectionAddLink(section: MobileHomeSection): string {
    return section.addLink === '/chat/philly' ? this.mobileSelectedCityLink() : section.addLink;
  }

  mobileCardLink(card: MobileHomeCard): string {
    return card.link === '/chat/philly' ? this.mobileSelectedCityLink() : card.link;
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

    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(density);
  }

  densityHeroLabel(wiki: PublicWikiCatalogItem): string {
    return this.densityLabel(wiki) ?? 'Density needed';
  }

  cityStickerAttributes(wiki: PublicWikiCatalogItem): PublicWikiStickerAttribute[] {
    const stickers: PublicWikiStickerAttribute[] = [];
    const addSticker = (sticker: PublicWikiStickerAttribute) => {
      if (!stickers.some((existing) => existing.id === sticker.id)) {
        stickers.push(sticker);
      }
    };

    const region = this.globalRegionForWiki(wiki);
    const country = wiki.countryLabel?.trim();
    if (country || region !== 'Other') {
      addSticker({
        id: 'region',
        label: region === 'Other' ? 'Place' : region,
        value: country || region,
        caption: 'Region',
        icon: 'public',
        palette: 'sky',
      });
    }

    if (wiki.population) {
      addSticker({
        id: 'population',
        label: 'Population',
        value: this.formatCompactNumber(wiki.population),
        caption: wiki.populationYear ? `${wiki.populationYear} estimate` : 'Latest estimate',
        icon: 'groups',
        palette: 'coral',
      });
    }

    const density = this.populationDensityForWiki(wiki);
    if (density !== null) {
      addSticker({
        id: 'density',
        label: 'Density',
        value: this.formatCompactNumber(density),
        caption: '/km²',
        captionIcon: 'groups',
        icon: 'groups',
        palette: 'yellow',
      });
    }

    const localTime = this.localTimeLabel(wiki);
    if (localTime) {
      addSticker({
        id: 'time',
        label: 'Local time',
        value: localTime,
        caption: wiki.timezone ? this.shortTimezone(wiki.timezone) : 'Timezone',
        icon: this.timeIcon(wiki),
        palette: 'purple',
      });
    }

    const temp = this.temperatureLabel(wiki);
    if (temp) {
      addSticker({
        id: 'temperature',
        label: 'Weather',
        value: temp,
        caption: this.temperatureAssistiveLabel(wiki),
        icon: 'partly_cloudy_day',
        palette: 'blue',
      });
    }

    if (wiki.areaKm2) {
      addSticker({
        id: 'area',
        label: 'Area',
        value: `${this.formatCompactNumber(wiki.areaKm2)} km²`,
        caption: 'Mapped area',
        icon: 'map',
        palette: 'green',
      });
    }

    if (this.coordinatePair(wiki)) {
      addSticker({
        id: 'map',
        label: 'Map',
        value: 'Located',
        caption: 'Coordinates attached',
        icon: 'explore',
        palette: 'teal',
      });
    }

    const priority =
      this.activeSort() === 'temp'
        ? ['region', 'temperature', 'time', 'population', 'density', 'area', 'map']
        : this.activeSort() === 'density'
          ? ['region', 'density', 'population', 'time', 'area', 'map']
          : this.activeSort() === 'time'
            ? ['region', 'time', 'population', 'density', 'map']
            : ['region', 'population', 'density', 'time', 'temperature', 'area', 'map'];

    return stickers
      .sort((left, right) => priority.indexOf(left.id) - priority.indexOf(right.id))
      .slice(0, 4);
  }

  cityFeelingStickers(wiki: PublicWikiCatalogItem): PublicWikiFeelingSticker[] {
    const options: PublicWikiFeelingSticker[] = [
      { label: 'Food', icon: 'restaurant', palette: 'coral' },
      { label: 'Parks', icon: 'park', palette: 'green' },
      { label: 'Transit', icon: 'directions_transit', palette: 'blue' },
      { label: 'Markets', icon: 'storefront', palette: 'yellow' },
      { label: 'Music', icon: 'music_note', palette: 'purple' },
      { label: 'Art', icon: 'palette', palette: 'teal' },
      { label: 'Water', icon: 'waves', palette: 'sky' },
      { label: 'Homes', icon: 'home_work', palette: 'coral' },
      { label: 'Schools', icon: 'school', palette: 'blue' },
      { label: 'Jobs', icon: 'work', palette: 'green' },
    ];
    let seed = 0;
    const source = `${this.cityNameKey(wiki)}-${wiki.countryLabel ?? ''}`;
    for (let i = 0; i < source.length; i++) {
      seed = (seed * 33 + source.charCodeAt(i)) % 7919;
    }
    return [...options]
      .sort((left, right) => ((seed + left.label.charCodeAt(0) * 13) % 97) - ((seed + right.label.charCodeAt(0) * 13) % 97))
      .slice(0, 2);
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
    const totalCount = this.cityTemperatureTotalCount();
    if (loadedCount > 0 && totalCount > 0) {
      return loadedCount >= totalCount ? 'All city temps loaded' : `${loadedCount}/${totalCount} temps loaded`;
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
    return this.normalizeVisibleWikiTitle(wiki.title).replace(/^living\s*wiki:\s*/i, '').trim().toLowerCase();
  }

  private cityNameKey(wiki: PublicWikiCatalogItem): string {
    return this.normalizeVisibleWikiTitle(wiki.title)
      .replace(/^living\s*wiki:\s*/i, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLowerCase();
  }

  private normalizeVisibleWikiTitle(title: string): string {
    return title.replace(/^my\s+living\s*wiki:/i, 'LivingWiki:').trim();
  }

  globalRegionForWiki(wiki: PublicWikiCatalogItem): string {
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
    const candidates = this.liveWikis().filter((wiki) => this.categoryForWiki(wiki) === CITIES_CATEGORY && !existing[this.wikiKey(wiki)]);
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
    const locatedWikis = (
      await Promise.all(
        wikis.map(async (wiki) => ({
          wiki,
          coordinates: await this.ensureTemperatureCoordinates(wiki),
        })),
      )
    ).filter((item): item is { wiki: PublicWikiCatalogItem; coordinates: CityTemperatureCoordinates } => item.coordinates !== null);

    if (locatedWikis.length === 0) {
      return {};
    }

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

  private async ensureTemperatureCoordinates(wiki: PublicWikiCatalogItem): Promise<CityTemperatureCoordinates | null> {
    const existing = this.coordinatePair(wiki);
    if (existing) {
      return existing;
    }

    const key = this.wikiKey(wiki);
    const pending = this.pendingTemperatureCoordinateLookups.get(key);
    if (pending) {
      return pending;
    }

    const lookup = this.fetchTemperatureCoordinates(wiki).finally(() => {
      this.pendingTemperatureCoordinateLookups.delete(key);
    });
    this.pendingTemperatureCoordinateLookups.set(key, lookup);
    return lookup;
  }

  private async fetchTemperatureCoordinates(wiki: PublicWikiCatalogItem): Promise<CityTemperatureCoordinates | null> {
    const query = this.temperatureGeocodeQuery(wiki);
    if (!query) {
      return null;
    }

    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', query);
    url.searchParams.set('count', '10');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');

    const response = await fetch(url.toString());
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as OpenMeteoGeocodingResponse;
    const results = payload.results ?? [];
    const result = this.bestTemperatureGeocodingResult(wiki, results);
    const latitude = result?.latitude;
    const longitude = result?.longitude;
    const coordinates = this.asCoordinatePair(latitude, longitude);
    if (!coordinates) {
      return null;
    }

    this.cityTemperatureCoordinates.update((current) => ({
      ...current,
      [this.wikiKey(wiki)]: coordinates,
    }));
    return coordinates;
  }

  private bestTemperatureGeocodingResult(
    wiki: PublicWikiCatalogItem,
    results: OpenMeteoGeocodingResult[],
  ): OpenMeteoGeocodingResult | null {
    if (results.length === 0) {
      return null;
    }

    const country = wiki.countryLabel?.trim().toLowerCase();
    const title = this.cityNameKey(wiki);
    return (
      results.find((result) => country && result.country?.trim().toLowerCase() === country) ??
      results.find((result) => result.name?.trim().toLowerCase() === title) ??
      results[0] ??
      null
    );
  }

  private temperatureGeocodeQuery(wiki: PublicWikiCatalogItem): string {
    const key = this.cityNameKey(wiki);
    const aliases: Record<string, string> = {
      philly: 'Philadelphia',
      'birmingham uk': 'Birmingham',
      'hong kong': 'Hong Kong',
      'ho chi minh city': 'Ho Chi Minh City',
      'new york city': 'New York',
      'san francisco': 'San Francisco',
      'abu dhabi': 'Abu Dhabi',
      'buenos aires': 'Buenos Aires',
      'dar es salaam': 'Dar es Salaam',
      'kuala lumpur': 'Kuala Lumpur',
      'kuwait city': 'Kuwait City',
      'las vegas': 'Las Vegas',
      'los angeles': 'Los Angeles',
      'mexico city': 'Mexico City',
    };
    return aliases[key] ?? this.cityDisplayName(wiki);
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
    const stored = this.asCoordinatePair(wiki.latitude, wiki.longitude);
    if (stored) return stored;

    return this.cityTemperatureCoordinates()[this.wikiKey(wiki)] ?? null;
  }

  private asCoordinatePair(latitude: unknown, longitude: unknown): CityTemperatureCoordinates | null {
    if (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      return { latitude, longitude };
    }

    return null;
  }

  private cityTemperatureTotalCount(): number {
    return this.liveWikis().filter((wiki) => this.categoryForWiki(wiki) === CITIES_CATEGORY).length;
  }

  private wikiKey(wiki: PublicWikiCatalogItem): string {
    return wiki.slug?.trim().toLowerCase() || this.titleKey(wiki);
  }

  private formatCompactNumber(value: number): string {
    return new Intl.NumberFormat('en-US', {
      notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(value) >= 10_000 ? 1 : 0,
    }).format(value);
  }

  private shortTimezone(timezone: string): string {
    const parts = timezone.split('/');
    const label = parts.length > 0 ? parts[parts.length - 1] : timezone;
    return label.replaceAll('_', ' ');
  }
}
