import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { PlaceReviewsService, type CityPlaceCandidate } from '../place-reviews.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

type DecalLanguage = {
  code: string;
  flag: string;
  label: string;
  greeting: string;
};

type DecalSize = {
  id: string;
  label: string;
  detail: string;
};

type ClaimCityFallback = {
  id: string;
  name: string;
  region: string;
  slug: string;
};

@Component({
  selector: 'app-business-claim',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './business-claim.html',
})
export class BusinessClaimComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly atlasService = inject(AtlasService);
  private readonly placeReviewsService = inject(PlaceReviewsService);

  readonly publicCities = signal<AtlasItem[]>([]);
  readonly citiesLoading = signal(true);
  readonly citySearch = signal('');
  readonly selectedCityId = signal<string | null>(null);
  readonly businessQuery = signal('Delasandrois');
  readonly neighborhood = signal('South Street');
  readonly category = signal('German bierhall');
  readonly description = signal('Authentic local favorite with a strong neighborhood following, events, specials, and a city guide customers can ask by voice.');
  readonly selectedLanguageCodes = signal(['en', 'es', 'de', 'pt', 'fr', 'ko']);
  readonly selectedSizeId = signal('window');
  readonly placeResults = signal<CityPlaceCandidate[]>([]);
  readonly selectedPlace = signal<CityPlaceCandidate | null>(null);
  readonly placeSearchLoading = signal(false);
  readonly placeSearchError = signal<string | null>(null);
  readonly copiedLink = signal(false);

  readonly fallbackCities: ClaimCityFallback[] = [
    { id: 'fallback-philly', name: 'Philadelphia', region: 'Pennsylvania', slug: 'philly' },
    { id: 'fallback-boston', name: 'Boston', region: 'Massachusetts', slug: 'my-living-wiki-boston' },
    { id: 'fallback-portland', name: 'Portland', region: 'Oregon', slug: 'my-living-wiki-portland' },
    { id: 'fallback-sao-paulo', name: 'São Paulo', region: 'Brazil', slug: 'my-living-wiki-s-o-paulo' },
    { id: 'fallback-austin', name: 'Austin', region: 'Texas', slug: 'my-living-wiki-austin' },
    { id: 'fallback-london', name: 'London', region: 'United Kingdom', slug: 'my-living-wiki-london' },
  ];

  readonly languages: DecalLanguage[] = [
    { code: 'en', flag: '🇺🇸', label: 'English', greeting: 'Hello' },
    { code: 'es', flag: '🇪🇸', label: 'Español', greeting: '¡Hola!' },
    { code: 'fr', flag: '🇫🇷', label: 'Français', greeting: 'Bonjour' },
    { code: 'de', flag: '🇩🇪', label: 'Deutsch', greeting: 'Guten Tag' },
    { code: 'pt', flag: '🇧🇷', label: 'Português', greeting: 'Olá' },
    { code: 'zh', flag: '🇨🇳', label: '中文', greeting: '你好' },
    { code: 'ar', flag: '🇸🇦', label: 'العربية', greeting: 'مرحبا' },
    { code: 'ko', flag: '🇰🇷', label: '한국어', greeting: '안녕' },
  ];

  readonly sizes: DecalSize[] = [
    { id: 'window', label: 'Window cling 8×10"', detail: 'Best for glass storefronts' },
    { id: 'door', label: 'Door decal 5×7"', detail: 'Compact entrance sticker' },
    { id: 'tent', label: 'Table tent 4×6"', detail: 'Host stand or counter' },
    { id: 'card', label: 'Counter card', detail: 'Checkout display' },
  ];

  readonly categories = [
    'Restaurant',
    'German bierhall',
    'Cafe',
    'Bar',
    'Bakery',
    'Shop',
    'Gallery',
    'Hotel',
    'Venue',
    'Local service',
  ];

  readonly selectedCity = computed(() => {
    const id = this.selectedCityId();
    return this.publicCities().find((city) => city.id === id) ?? null;
  });

  readonly selectedFallbackCity = computed(() => {
    const id = this.selectedCityId();
    return this.fallbackCities.find((city) => city.id === id) ?? null;
  });

  readonly selectedCityName = computed(() => {
    const city = this.selectedCity();
    if (city?.city_config?.city_name) {
      return city.city_config.city_name;
    }
    if (city?.name) {
      return city.name.replace(/^My living wiki:\s*/i, '').trim();
    }
    return this.selectedFallbackCity()?.name ?? 'Philadelphia';
  });

  readonly selectedCityRegion = computed(() =>
    this.selectedCity()?.city_config?.region_name
      ?? this.selectedFallbackCity()?.region
      ?? '',
  );

  readonly selectedCitySlug = computed(() =>
    this.selectedCity()?.slug
      ?? this.selectedFallbackCity()?.slug
      ?? 'philly',
  );

  readonly selectedAtlasId = computed(() => this.selectedCity()?.id ?? null);

  readonly cityOptions = computed(() => {
    const live = this.publicCities()
      .filter((atlas) => atlas.city_config?.enabled === true)
      .map((atlas) => ({
        id: atlas.id,
        name: atlas.city_config?.city_name || atlas.name.replace(/^My living wiki:\s*/i, ''),
        region: atlas.city_config?.region_name || atlas.city_config?.country_code || '',
        slug: atlas.slug,
        live: true,
      }));
    const seenSlugs = new Set(live.map((city) => city.slug));
    const fallback = this.fallbackCities
      .filter((city) => !seenSlugs.has(city.slug))
      .map((city) => ({ ...city, live: false }));
    const query = this.citySearch().trim().toLowerCase();
    return [...live, ...fallback]
      .filter((city) => !query || `${city.name} ${city.region}`.toLowerCase().includes(query))
      .slice(0, 10);
  });

  readonly businessName = computed(() => this.selectedPlace()?.name || this.businessQuery().trim() || 'Your business');
  readonly businessAddress = computed(() => this.selectedPlace()?.address || this.neighborhood().trim());
  readonly selectedLanguages = computed(() => {
    const selected = new Set(this.selectedLanguageCodes());
    return this.languages.filter((language) => selected.has(language.code)).slice(0, 6);
  });
  readonly businessSlug = computed(() => this.slugify(this.businessName()));
  readonly previewPath = computed(() => {
    const slug = this.selectedCitySlug();
    const business = this.businessSlug();
    return `/chat/${slug}${business ? `?business=${business}` : ''}`;
  });
  readonly previewUrl = computed(() => `https://mylivingwiki.com${this.previewPath()}`);
  readonly qrImageUrl = computed(() =>
    `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=18&data=${encodeURIComponent(this.previewUrl())}`,
  );
  readonly decalDownloadHref = computed(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.buildDecalSvg())}`);
  readonly decalFilename = computed(() => `${this.businessSlug() || 'my-living-wiki'}-${this.selectedCitySlug()}-decal.svg`);
  readonly canSearchBusiness = computed(() => !!this.selectedAtlasId() && this.businessQuery().trim().length >= 2 && !this.placeSearchLoading());

  constructor() {
    const requestedCity = this.route.snapshot.queryParamMap.get('city')?.trim().toLowerCase() ?? '';
    if (requestedCity) {
      const fallback = this.fallbackCities.find((city) => city.slug === requestedCity || city.name.toLowerCase() === requestedCity);
      this.selectedCityId.set(fallback?.id ?? null);
    } else {
      this.selectedCityId.set('fallback-philly');
    }

    void this.loadCities(requestedCity);

    effect(() => {
      const place = this.selectedPlace();
      if (!place) {
        return;
      }
      if (place.category) {
        this.category.set(place.category);
      }
      if (place.address) {
        const firstPart = place.address.split(',')[0]?.trim();
        if (firstPart) {
          this.neighborhood.set(firstPart);
        }
      }
    });
  }

  onCitySearchInput(event: Event): void {
    this.citySearch.set((event.target as HTMLInputElement).value);
  }

  selectCity(cityId: string): void {
    this.selectedCityId.set(cityId);
    this.placeResults.set([]);
    this.selectedPlace.set(null);
    this.placeSearchError.set(null);
  }

  onBusinessQueryInput(event: Event): void {
    this.businessQuery.set((event.target as HTMLInputElement).value);
    this.selectedPlace.set(null);
  }

  onNeighborhoodInput(event: Event): void {
    this.neighborhood.set((event.target as HTMLInputElement).value);
  }

  onCategoryInput(event: Event): void {
    this.category.set((event.target as HTMLSelectElement).value);
  }

  onDescriptionInput(event: Event): void {
    this.description.set((event.target as HTMLInputElement).value);
  }

  async searchBusiness(): Promise<void> {
    const atlasId = this.selectedAtlasId();
    const query = this.businessQuery().trim();
    if (!atlasId || query.length < 2 || this.placeSearchLoading()) {
      return;
    }

    this.placeSearchLoading.set(true);
    this.placeSearchError.set(null);
    this.selectedPlace.set(null);
    try {
      const places = await this.placeReviewsService.searchCityPlaces(atlasId, query);
      this.placeResults.set(places);
      if (places.length > 0) {
        this.selectedPlace.set(places[0]);
      }
    } catch {
      this.placeSearchError.set('Place search is unavailable right now. You can still add the business manually.');
      this.placeResults.set([]);
    } finally {
      this.placeSearchLoading.set(false);
    }
  }

  selectPlace(place: CityPlaceCandidate): void {
    this.selectedPlace.set(place);
    this.businessQuery.set(place.name);
  }

  useManualBusiness(): void {
    this.selectedPlace.set(null);
    this.placeResults.set([]);
  }

  toggleLanguage(code: string): void {
    this.selectedLanguageCodes.update((codes) => {
      if (codes.includes(code)) {
        return codes.length > 1 ? codes.filter((item) => item !== code) : codes;
      }
      return [...codes, code].slice(0, 6);
    });
  }

  selectSize(sizeId: string): void {
    this.selectedSizeId.set(sizeId);
  }

  async copyLink(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(this.previewUrl());
    this.copiedLink.set(true);
    setTimeout(() => this.copiedLink.set(false), 1600);
  }

  flagTransform(index: number, total: number): string {
    const angle = -90 + (360 / Math.max(total, 1)) * index;
    return `rotate(${angle}deg) translate(8.2rem) rotate(${-angle}deg)`;
  }

  private async loadCities(requestedCity: string): Promise<void> {
    this.citiesLoading.set(true);
    try {
      const cities = (await this.atlasService.listPublicAtlases())
        .filter((atlas) => atlas.city_config?.enabled === true)
        .sort((left, right) => {
          const leftName = left.city_config?.city_name || left.name;
          const rightName = right.city_config?.city_name || right.name;
          return leftName.localeCompare(rightName);
        });
      this.publicCities.set(cities);
      const match = requestedCity
        ? cities.find((city) => city.slug === requestedCity || city.city_config?.city_name?.toLowerCase() === requestedCity)
        : cities.find((city) => city.slug === 'philly');
      if (match) {
        this.selectedCityId.set(match.id);
      } else if (!this.selectedCityId()) {
        this.selectedCityId.set(cities[0]?.id ?? 'fallback-philly');
      }
    } catch {
      this.publicCities.set([]);
    } finally {
      this.citiesLoading.set(false);
    }
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90);
  }

  private escapeSvg(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildDecalSvg(): string {
    const business = this.escapeSvg(this.businessName());
    const city = this.escapeSvg(this.selectedCityName());
    const url = this.escapeSvg(this.previewUrl().replace(/^https:\/\//, ''));
    const qr = this.escapeSvg(this.qrImageUrl());
    const languages = this.selectedLanguages();
    const greetings = languages.map((language, index) => {
      const x = index % 2 === 0 ? 58 : 318;
      const y = 144 + Math.floor(index / 2) * 62;
      const color = ['#176a3a', '#1f66b1', '#9f3a2c', '#6b46c1'][index % 4];
      return `<text x="${x}" y="${y}" font-size="30" font-weight="900" fill="${color}">${this.escapeSvg(language.greeting)}</text>`;
    }).join('');
    const flags = languages.map((language, index) => {
      const positions = [[760, 110], [886, 178], [882, 316], [760, 388], [634, 316], [634, 178]];
      const [x, y] = positions[index] ?? [760, 110];
      return `<circle cx="${x}" cy="${y}" r="38" fill="#fff" stroke="#cfe3d2" stroke-width="3"/><text x="${x}" y="${y + 10}" text-anchor="middle" font-size="28">${language.flag}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="640" viewBox="0 0 1000 640">
      <rect width="1000" height="640" rx="28" fill="#f2faf5"/>
      <rect x="18" y="18" width="964" height="72" rx="12" fill="#dfeee3"/>
      <rect x="36" y="34" width="42" height="42" rx="10" fill="#1e8f45"/>
      <text x="57" y="64" text-anchor="middle" font-size="26" fill="#fff">⌂</text>
      <text x="100" y="66" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="900" fill="#092616">${business}</text>
      <rect x="620" y="34" width="42" height="42" rx="10" fill="#1e8f45"/>
      <text x="641" y="64" text-anchor="middle" font-size="24" fill="#fff">◒</text>
      <text x="678" y="66" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="900" fill="#092616">Living Wiki · <tspan fill="#1e8f45">${city}</tspan></text>
      ${greetings}
      <rect x="226" y="208" width="88" height="154" rx="24" fill="#071b10"/>
      <rect x="239" y="220" width="62" height="130" rx="18" fill="#ffffff"/>
      <text x="270" y="296" text-anchor="middle" font-size="34" fill="#1e8f45">▢</text>
      <circle cx="760" cy="250" r="220" fill="none" stroke="#b9d9c0" stroke-width="3" stroke-dasharray="6 7"/>
      <rect x="642" y="130" width="236" height="236" rx="18" fill="#fff" stroke="#d8eadc" stroke-width="2"/>
      <image href="${qr}" x="670" y="158" width="180" height="180" preserveAspectRatio="xMidYMid meet"/>
      ${flags}
      <line x1="32" y1="500" x2="968" y2="500" stroke="#cfe3d2" stroke-width="2"/>
      <rect x="344" y="526" width="312" height="56" rx="28" fill="#fff" stroke="#cfe3d2" stroke-width="2"/>
      <text x="500" y="563" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="900" fill="#1e8f45">phone → mic → chat</text>
      <text x="500" y="618" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="900" fill="#1e8f45">${url}</text>
    </svg>`;
  }
}
