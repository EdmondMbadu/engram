import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { PlaceReviewsService, type CityPlaceCandidate } from '../place-reviews.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import {
  BusinessClaimService,
  type BusinessClaimRegistryRecord,
} from './business-claim.service';

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

type ClaimCityOption = ClaimCityFallback & {
  live: boolean;
};

type StoredClaimDraft = {
  claimKey: string;
  businessName: string;
  cityName: string;
  previewUrl: string;
  guidePrompt: string;
  savedAt: string;
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
  private readonly businessClaimService = inject(BusinessClaimService);
  private readonly localDraftsKey = 'living-wiki:business-claim-drafts';
  private businessSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private claimCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPlaceSearchKey = '';
  private lastClaimCheckKey = '';

  readonly publicCities = signal<AtlasItem[]>([]);
  readonly citiesLoading = signal(true);
  readonly citySearch = signal('');
  readonly citySuggestionsOpen = signal(false);
  readonly selectedCityId = signal<string | null>(null);
  readonly businessQuery = signal('Brauhaus Schmitz');
  readonly businessSuggestionsOpen = signal(false);
  readonly neighborhood = signal('South Street');
  readonly category = signal('German bierhall');
  readonly guidePrompt = signal(
    'Authentic German beer hall on South Street with a deep beer list, food, events, private parties, watch parties, and staff who can point visitors to the right local experience.',
  );
  readonly selectedLanguageCodes = signal(['en', 'fr', 'pt', 'zh', 'de']);
  readonly selectedSizeId = signal('window');
  readonly placeResults = signal<CityPlaceCandidate[]>([]);
  readonly selectedPlace = signal<CityPlaceCandidate | null>(null);
  readonly placeSearchLoading = signal(false);
  readonly placeSearchError = signal<string | null>(null);
  readonly existingClaim = signal<BusinessClaimRegistryRecord | null>(null);
  readonly localClaimKeys = signal<string[]>([]);
  readonly claimCheckLoading = signal(false);
  readonly claimSaving = signal(false);
  readonly claimStatus = signal<string | null>(null);
  readonly claimError = signal<string | null>(null);
  readonly copiedLink = signal(false);

  readonly fallbackCities: ClaimCityFallback[] = [
    { id: 'fallback-philly', name: 'Philadelphia', region: 'Pennsylvania', slug: 'philly' },
    { id: 'fallback-boston', name: 'Boston', region: 'Massachusetts', slug: 'my-living-wiki-boston' },
    { id: 'fallback-portland', name: 'Portland', region: 'Oregon', slug: 'my-living-wiki-portland' },
    { id: 'fallback-sao-paulo', name: 'Sao Paulo', region: 'Brazil', slug: 'my-living-wiki-sao-paulo' },
    { id: 'fallback-austin', name: 'Austin', region: 'Texas', slug: 'my-living-wiki-austin' },
    { id: 'fallback-london', name: 'London', region: 'United Kingdom', slug: 'my-living-wiki-london' },
  ];

  readonly languages: DecalLanguage[] = [
    { code: 'en', flag: '🇺🇸', label: 'English', greeting: 'Hello' },
    { code: 'fr', flag: '🇫🇷', label: 'Francais', greeting: 'Bonjour' },
    { code: 'pt', flag: '🇧🇷', label: 'Portugues', greeting: 'Ola' },
    { code: 'zh', flag: '🇨🇳', label: 'Chinese', greeting: 'Ni hao' },
    { code: 'de', flag: '🇩🇪', label: 'Deutsch', greeting: 'Guten Tag' },
    { code: 'es', flag: '🇪🇸', label: 'Espanol', greeting: 'Hola' },
    { code: 'ar', flag: '🇸🇦', label: 'Arabic', greeting: 'Marhaba' },
    { code: 'ko', flag: '🇰🇷', label: 'Korean', greeting: 'Annyeong' },
  ];

  readonly sizes: DecalSize[] = [
    { id: 'window', label: 'Window cling 8x10"', detail: 'Best for glass storefronts' },
    { id: 'door', label: 'Door decal 5x7"', detail: 'Compact entrance sticker' },
    { id: 'tent', label: 'Table tent 4x6"', detail: 'Host stand or counter' },
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

  readonly allCityOptions = computed<ClaimCityOption[]>(() => {
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
    const seenNames = new Set(live.map((city) => city.name.trim().toLowerCase()));
    const fallback = this.fallbackCities
      .filter((city) => !seenSlugs.has(city.slug) && !seenNames.has(city.name.trim().toLowerCase()))
      .map((city) => ({ ...city, live: false }));
    return [...live, ...fallback];
  });

  readonly cityOptions = computed(() => {
    const query = this.citySearch().trim().toLowerCase();
    if (!query) {
      return [];
    }
    return this.allCityOptions()
      .filter((city) => `${city.name} ${city.region}`.toLowerCase().includes(query))
      .sort((left, right) => {
        const leftName = left.name.toLowerCase();
        const rightName = right.name.toLowerCase();
        const leftStarts = leftName.startsWith(query) ? 0 : 1;
        const rightStarts = rightName.startsWith(query) ? 0 : 1;
        return leftStarts - rightStarts || leftName.localeCompare(rightName);
      })
      .slice(0, 7);
  });

  readonly businessName = computed(() => this.selectedPlace()?.name || this.businessQuery().trim() || 'Your business');
  readonly businessAddress = computed(() => this.selectedPlace()?.address || this.neighborhood().trim());
  readonly selectedLanguages = computed(() => {
    const selected = new Set(this.selectedLanguageCodes());
    return this.languages.filter((language) => selected.has(language.code)).slice(0, 6);
  });
  readonly businessSlug = computed(() => this.slugify(this.businessName()));
  readonly claimKey = computed(() => `${this.selectedCitySlug()}__${this.businessSlug() || 'business'}`);
  readonly previewPath = computed(() => {
    const slug = this.selectedCitySlug();
    const business = this.businessSlug();
    return `/chat/${slug}${business ? `?business=${business}` : ''}`;
  });
  readonly previewUrl = computed(() => `https://mylivingwiki.com${this.previewPath()}`);
  readonly qrImageUrl = computed(() =>
    `https://api.qrserver.com/v1/create-qr-code/?size=520x520&margin=18&data=${encodeURIComponent(this.previewUrl())}`,
  );
  readonly decalDownloadHref = computed(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.buildDecalSvg())}`);
  readonly decalFilename = computed(() => `${this.businessSlug() || 'my-living-wiki'}-${this.selectedCitySlug()}-local-insider-badge.svg`);
  readonly localDuplicateClaim = computed(() => this.localClaimKeys().includes(this.claimKey()));
  readonly hasDuplicateClaim = computed(() => !!this.existingClaim() || this.localDuplicateClaim());
  readonly reviewedPlaceMatch = computed(() => {
    const businessSlug = this.businessSlug();
    return this.placeResults().find((place) => place.source === 'reviewed' && this.slugify(place.name) === businessSlug) ?? null;
  });
  readonly canSaveClaim = computed(() =>
    !!this.businessSlug()
    && !this.hasDuplicateClaim()
    && !this.claimCheckLoading()
    && !this.claimSaving(),
  );
  readonly guideSummary = computed(() => {
    const prompt = this.guidePrompt().trim();
    if (!prompt) {
      return 'A local guide that answers customer questions in their language.';
    }
    return prompt.length > 150 ? `${prompt.slice(0, 147).trim()}...` : prompt;
  });
  readonly decalBusinessTitle = computed(() => this.fitBadgeText(this.businessName()).toUpperCase());

  constructor() {
    this.localClaimKeys.set(this.loadLocalDrafts().map((claim) => claim.claimKey));

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

    effect(() => {
      const atlasId = this.selectedAtlasId();
      const query = this.businessQuery().trim();
      const selectedPlaceName = this.selectedPlace()?.name.trim() ?? '';
      if (this.businessSearchTimer) {
        clearTimeout(this.businessSearchTimer);
      }
      if (!atlasId || query.length < 2 || selectedPlaceName === query) {
        if (query.length < 2) {
          this.placeResults.set([]);
        }
        return;
      }
      this.businessSearchTimer = setTimeout(() => void this.searchBusiness(), 420);
    });

    effect(() => {
      const claimKey = this.claimKey();
      const businessSlug = this.businessSlug();
      if (this.claimCheckTimer) {
        clearTimeout(this.claimCheckTimer);
      }
      this.existingClaim.set(null);
      this.claimError.set(null);
      if (!businessSlug || businessSlug === 'your-business') {
        return;
      }
      this.claimCheckTimer = setTimeout(() => void this.checkExistingClaim(claimKey), 360);
    });
  }

  onCitySearchInput(event: Event): void {
    this.citySearch.set((event.target as HTMLInputElement).value);
    this.citySuggestionsOpen.set(true);
  }

  openCitySuggestions(): void {
    if (this.citySearch().trim()) {
      this.citySuggestionsOpen.set(true);
    }
  }

  selectCity(city: ClaimCityOption): void {
    this.selectedCityId.set(city.id);
    this.citySearch.set(city.name);
    this.citySuggestionsOpen.set(false);
    this.placeResults.set([]);
    this.selectedPlace.set(null);
    this.placeSearchError.set(null);
  }

  onBusinessQueryInput(event: Event): void {
    this.businessQuery.set((event.target as HTMLInputElement).value);
    this.selectedPlace.set(null);
    this.businessSuggestionsOpen.set(true);
    this.claimStatus.set(null);
  }

  openBusinessSuggestions(): void {
    if (this.placeResults().length > 0) {
      this.businessSuggestionsOpen.set(true);
    }
  }

  onNeighborhoodInput(event: Event): void {
    this.neighborhood.set((event.target as HTMLInputElement).value);
  }

  onCategoryInput(event: Event): void {
    this.category.set((event.target as HTMLSelectElement).value);
  }

  onGuidePromptInput(event: Event): void {
    this.guidePrompt.set((event.target as HTMLTextAreaElement).value);
    this.claimStatus.set(null);
  }

  async searchBusiness(): Promise<void> {
    const atlasId = this.selectedAtlasId();
    const query = this.businessQuery().trim();
    if (!atlasId || query.length < 2) {
      return;
    }

    const searchKey = `${atlasId}:${query}`;
    this.lastPlaceSearchKey = searchKey;
    this.placeSearchLoading.set(true);
    this.placeSearchError.set(null);
    try {
      const places = await this.placeReviewsService.searchCityPlaces(atlasId, query);
      if (this.lastPlaceSearchKey !== searchKey) {
        return;
      }
      this.placeResults.set(places);
      this.businessSuggestionsOpen.set(true);
    } catch {
      if (this.lastPlaceSearchKey === searchKey) {
        this.placeSearchError.set('Place search is unavailable right now. You can still type the business manually.');
        this.placeResults.set([]);
      }
    } finally {
      if (this.lastPlaceSearchKey === searchKey) {
        this.placeSearchLoading.set(false);
      }
    }
  }

  selectPlace(place: CityPlaceCandidate): void {
    this.selectedPlace.set(place);
    this.businessQuery.set(place.name);
    this.businessSuggestionsOpen.set(false);
    this.claimStatus.set(null);
  }

  useManualBusiness(): void {
    this.selectedPlace.set(null);
    this.placeResults.set([]);
    this.businessSuggestionsOpen.set(false);
  }

  refineGuidePrompt(): void {
    const name = this.businessName();
    const city = this.selectedCityName();
    const category = this.category();
    const base = this.guidePrompt().trim();
    const address = this.businessAddress();
    const refined = [
      `Act as ${name}'s local insider for ${city}.`,
      `Explain the business as a real ${category.toLowerCase()} with practical, customer-ready answers.`,
      address ? `Use this location context: ${address}.` : '',
      base ? `Business notes: ${base}` : '',
      'Help visitors with hours, menu or service highlights, reservations, events, accessibility, nearby recommendations, and language-friendly answers.',
      'Keep answers warm, specific, concise, and honest when details are missing.',
    ].filter(Boolean).join('\n\n');
    this.guidePrompt.set(refined);
    this.claimStatus.set('Guide prompt refined. Review it, then reserve the page draft.');
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

  async saveClaimDraft(): Promise<void> {
    if (!this.canSaveClaim()) {
      return;
    }

    this.claimSaving.set(true);
    this.claimError.set(null);
    this.claimStatus.set(null);
    const claimKey = this.claimKey();
    const record = {
      claim_key: claimKey,
      atlas_id: this.selectedAtlasId(),
      city_name: this.selectedCityName(),
      city_slug: this.selectedCitySlug(),
      business_name: this.businessName(),
      business_slug: this.businessSlug(),
      business_address: this.businessAddress(),
      category: this.category(),
      place_id: this.selectedPlace()?.placeId ?? null,
      preview_url: this.previewUrl(),
      status: 'pending' as const,
    };

    try {
      const existing = await this.businessClaimService.findByClaimKey(claimKey);
      if (existing) {
        this.existingClaim.set(existing);
        this.claimError.set('This business already has a pending page draft. Use the existing claim instead of creating a duplicate.');
        return;
      }
      const saved = await this.businessClaimService.create(record);
      this.existingClaim.set(saved);
      this.saveLocalDraft({
        claimKey,
        businessName: this.businessName(),
        cityName: this.selectedCityName(),
        previewUrl: this.previewUrl(),
        guidePrompt: this.guidePrompt(),
        savedAt: new Date().toISOString(),
      });
      this.localClaimKeys.update((keys) => [...new Set([...keys, claimKey])]);
      this.claimStatus.set('Business page draft reserved. The duplicate check will now catch this business before another draft is created.');
    } catch {
      this.saveLocalDraft({
        claimKey,
        businessName: this.businessName(),
        cityName: this.selectedCityName(),
        previewUrl: this.previewUrl(),
        guidePrompt: this.guidePrompt(),
        savedAt: new Date().toISOString(),
      });
      this.localClaimKeys.update((keys) => [...new Set([...keys, claimKey])]);
      this.claimStatus.set('Saved locally. Once the claim registry is available, this same key will be used to prevent duplicates.');
    } finally {
      this.claimSaving.set(false);
    }
  }

  async copyLink(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(this.previewUrl());
    this.copiedLink.set(true);
    setTimeout(() => this.copiedLink.set(false), 1600);
  }

  svgOrbitTransform(index: number, total: number, radius = 190): string {
    const angle = (-120 + (360 / Math.max(total, 1)) * index) * (Math.PI / 180);
    const x = 450 + Math.cos(angle) * radius;
    const y = 450 + Math.sin(angle) * radius;
    return `translate(${x.toFixed(1)} ${y.toFixed(1)})`;
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

  private async checkExistingClaim(claimKey: string): Promise<void> {
    if (this.localClaimKeys().includes(claimKey)) {
      return;
    }

    this.lastClaimCheckKey = claimKey;
    this.claimCheckLoading.set(true);
    try {
      const existing = await this.businessClaimService.findByClaimKey(claimKey);
      if (this.lastClaimCheckKey === claimKey) {
        this.existingClaim.set(existing);
      }
    } catch {
      if (this.lastClaimCheckKey === claimKey) {
        this.existingClaim.set(null);
      }
    } finally {
      if (this.lastClaimCheckKey === claimKey) {
        this.claimCheckLoading.set(false);
      }
    }
  }

  private loadLocalDrafts(): StoredClaimDraft[] {
    if (typeof window === 'undefined') {
      return [];
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem(this.localDraftsKey) ?? '[]') as StoredClaimDraft[];
      return Array.isArray(parsed) ? parsed.filter((draft) => !!draft.claimKey) : [];
    } catch {
      return [];
    }
  }

  private saveLocalDraft(draft: StoredClaimDraft): void {
    if (typeof window === 'undefined') {
      return;
    }
    const existing = this.loadLocalDrafts().filter((item) => item.claimKey !== draft.claimKey);
    window.localStorage.setItem(this.localDraftsKey, JSON.stringify([draft, ...existing].slice(0, 20)));
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

  private fitBadgeText(value: string): string {
    const clean = value.trim() || 'Your business';
    return clean.length > 28 ? `${clean.slice(0, 25).trim()}...` : clean;
  }

  private escapeSvg(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildDecalSvg(): string {
    const business = this.escapeSvg(this.decalBusinessTitle());
    const qr = this.escapeSvg(this.qrImageUrl());
    const flags = this.selectedLanguages().map((language, index, all) => {
      const transform = this.svgOrbitTransform(index, all.length, 190);
      return `<g transform="${transform}"><circle r="36" fill="#f7efe0" stroke="#b98834" stroke-width="4"/><text y="10" text-anchor="middle" font-size="28">${language.flag}</text></g>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
      <defs>
        <radialGradient id="paper" cx="50%" cy="42%" r="62%">
          <stop offset="0" stop-color="#f5e4c5"/>
          <stop offset="0.68" stop-color="#dfc28d"/>
          <stop offset="1" stop-color="#c79d56"/>
        </radialGradient>
        <linearGradient id="tealRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#2f8294"/>
          <stop offset="1" stop-color="#0f596d"/>
        </linearGradient>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#12323a" flood-opacity="0.28"/>
        </filter>
        <path id="topArc" d="M 138 466 A 312 312 0 0 1 762 466"/>
        <path id="bottomArc" d="M 154 642 A 315 315 0 0 0 746 642"/>
      </defs>
      <rect width="900" height="900" fill="#f4f4f1"/>
      <circle cx="450" cy="450" r="400" fill="url(#paper)" filter="url(#softShadow)"/>
      <circle cx="450" cy="450" r="342" fill="none" stroke="url(#tealRing)" stroke-width="76"/>
      <circle cx="450" cy="450" r="286" fill="#ead2a5" stroke="#b8842f" stroke-width="5"/>
      <circle cx="450" cy="450" r="214" fill="none" stroke="#a47729" stroke-width="4" stroke-dasharray="28 30"/>
      <text font-family="Inter, Arial, sans-serif" font-size="46" font-weight="900" fill="#ffffff" letter-spacing="4">
        <textPath href="#topArc" startOffset="50%" text-anchor="middle">${business} • LivingWiki Chat</textPath>
      </text>
      <text font-family="Inter, Arial, sans-serif" font-size="52" font-weight="900" fill="#ffffff" letter-spacing="6">
        <textPath href="#bottomArc" startOffset="50%" text-anchor="middle">60+ Languages</textPath>
      </text>
      <text x="450" y="710" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="27" font-weight="900" fill="#0f596d">Powered by MyLivingWiki.com</text>
      <text x="450" y="118" text-anchor="middle" font-size="68">🎩</text>
      <text x="238" y="464" text-anchor="middle" font-size="70">🥨</text>
      <text x="676" y="466" text-anchor="middle" font-size="70">🍺</text>
      <rect x="304" y="294" width="292" height="292" rx="18" fill="#fff8ea" stroke="#b8842f" stroke-width="5"/>
      <image href="${qr}" x="326" y="316" width="248" height="248" preserveAspectRatio="xMidYMid meet"/>
      <g transform="translate(450 446)">
        <circle r="28" fill="#f3dfb9"/>
        <path d="M0 -18c9 0 16 7 16 16v16c0 9-7 16-16 16s-16-7-16-16V-2c0-9 7-16 16-16z" fill="#0f596d"/>
        <path d="M-26 9c0 16 11 30 26 30s26-14 26-30" fill="none" stroke="#0f596d" stroke-width="7" stroke-linecap="round"/>
        <path d="M0 39v23M-18 62h36" fill="none" stroke="#0f596d" stroke-width="7" stroke-linecap="round"/>
      </g>
      ${flags}
    </svg>`;
  }
}
