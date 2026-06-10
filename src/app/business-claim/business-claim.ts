import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { PlaceReviewsService, type CityPlaceCandidate } from '../place-reviews.service';
import { generateQrSvgDataUrl } from '../qr-code';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import {
  BusinessClaimService,
  type BusinessClaimRegistryRecord,
} from './business-claim.service';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';
import { AccountMenuComponent } from '../account-menu/account-menu';

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

type BadgeIcon = {
  code: string;
  emoji: string;
  label: string;
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
  adminName: string;
  adminEmail: string;
  selectedLanguageCodes: string[];
  selectedIconCodes: string[];
  savedAt: string;
};

@Component({
  selector: 'app-business-claim',
  imports: [RouterLink, ThemeToggleComponent, WorkspaceSidebarComponent, AccountMenuComponent],
  templateUrl: './business-claim.html',
})
export class BusinessClaimComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly atlasService = inject(AtlasService);
  readonly authService = inject(AuthService);
  private readonly placeReviewsService = inject(PlaceReviewsService);
  private readonly businessClaimService = inject(BusinessClaimService);
  private readonly localDraftsKey = 'living-wiki:business-claim-drafts';
  private readonly pendingDraftKey = 'living-wiki:business-claim-pending';
  private businessSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private claimCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPlaceSearchKey = '';
  private lastClaimCheckKey = '';

  readonly publicCities = signal<AtlasItem[]>([]);
  readonly citiesLoading = signal(true);
  readonly citySearch = signal('');
  readonly citySuggestionsOpen = signal(false);
  readonly selectedCityId = signal<string | null>(null);
  readonly businessQuery = signal('');
  readonly businessSuggestionsOpen = signal(false);
  readonly neighborhood = signal('South Street');
  readonly category = signal('German bierhall');
  readonly guidePrompt = signal(
    'Authentic German beer hall on South Street with a deep beer list, food, events, private parties, watch parties, and staff who can point visitors to the right local experience.',
  );
  readonly selectedLanguageCodes = signal(['en', 'fr', 'pt', 'zh', 'de']);
  readonly selectedIconCodes = signal(['hat', 'pretzel', 'beer']);
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
  readonly adminName = signal('');
  readonly adminEmail = signal('');
  readonly accountRedirectParams = computed(() => ({ redirectTo: '/business/claim' }));

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

  readonly badgeIcons: BadgeIcon[] = [
    { code: 'hat', emoji: '🎩', label: 'Heritage' },
    { code: 'pretzel', emoji: '🥨', label: 'Pretzel' },
    { code: 'beer', emoji: '🍺', label: 'Beer' },
    { code: 'coffee', emoji: '☕', label: 'Coffee' },
    { code: 'pizza', emoji: '🍕', label: 'Pizza' },
    { code: 'taco', emoji: '🌮', label: 'Taco' },
    { code: 'sushi', emoji: '🍣', label: 'Sushi' },
    { code: 'burger', emoji: '🍔', label: 'Burger' },
    { code: 'bread', emoji: '🥐', label: 'Bakery' },
    { code: 'wine', emoji: '🍷', label: 'Wine' },
    { code: 'cocktail', emoji: '🍸', label: 'Cocktail' },
    { code: 'music', emoji: '🎵', label: 'Live music' },
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
      return city.name.replace(/^Living Wiki:\s*/i, '').trim();
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
        name: atlas.city_config?.city_name || atlas.name.replace(/^Living Wiki:\s*/i, ''),
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
  readonly selectedBadgeIcons = computed(() => {
    const selected = new Set(this.selectedIconCodes());
    return this.badgeIcons.filter((icon) => selected.has(icon.code)).slice(0, 3);
  });
  readonly businessSlug = computed(() => this.slugify(this.businessName()));
  readonly claimKey = computed(() => `${this.selectedCitySlug()}__${this.businessSlug() || 'business'}`);
  readonly businessDetailPath = computed(() => `/business/${this.selectedCitySlug()}/${this.businessSlug() || 'business'}`);
  readonly businessDetailUrl = computed(() => `https://livingwiki.com${this.businessDetailPath()}`);
  readonly previewPath = computed(() => {
    const slug = this.selectedCitySlug();
    const business = this.businessSlug();
    return `/chat/${slug}${business ? `?business=${business}` : ''}`;
  });
  readonly previewUrl = computed(() => `https://livingwiki.com${this.previewPath()}`);
  readonly qrImageUrl = computed(() => generateQrSvgDataUrl(this.previewUrl()));
  readonly decalDownloadHref = computed(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.buildDecalSvg())}`);
  readonly decalFilename = computed(() => `${this.businessSlug() || 'my-living-wiki'}-${this.selectedCitySlug()}-local-insider-badge.svg`);
  readonly decalPngFilename = computed(() => `${this.businessSlug() || 'my-living-wiki'}-${this.selectedCitySlug()}-local-insider-badge.png`);
  readonly localDuplicateClaim = computed(() => this.localClaimKeys().includes(this.claimKey()));
  readonly hasDuplicateClaim = computed(() => !!this.existingClaim() || this.localDuplicateClaim());
  readonly reviewedPlaceMatch = computed(() => {
    const businessSlug = this.businessSlug();
    return this.placeResults().find((place) => place.source === 'reviewed' && this.slugify(place.name) === businessSlug) ?? null;
  });
  readonly canSaveClaim = computed(() =>
    !!this.businessSlug()
    && this.authService.isAuthenticated()
    && this.adminName().trim().length >= 2
    && this.isValidEmail(this.adminEmail())
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
    this.restorePendingDraft();

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
      const email = this.authService.email().trim();
      if (email) {
        this.adminEmail.set(email);
      }

      const displayName = this.authService.displayName().trim();
      if (this.authService.isAuthenticated() && !this.adminName().trim() && displayName && displayName !== 'Living Wiki') {
        this.adminName.set(displayName);
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

  onAdminNameInput(event: Event): void {
    this.adminName.set((event.target as HTMLInputElement).value);
    this.claimStatus.set(null);
  }

  onAdminEmailInput(event: Event): void {
    this.adminEmail.set((event.target as HTMLInputElement).value);
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

  toggleBadgeIcon(code: string): void {
    this.selectedIconCodes.update((codes) => {
      if (codes.includes(code)) {
        return codes.length > 1 ? codes.filter((item) => item !== code) : codes;
      }
      if (codes.length >= 3) {
        return codes;
      }
      return [...codes, code];
    });
  }

  selectSize(sizeId: string): void {
    this.selectedSizeId.set(sizeId);
  }

  saveCurrentDraftForAccount(): void {
    this.savePendingDraft();
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
      owner_user_id: this.authService.uid(),
      status: 'pending' as const,
    };

    try {
      const existing = await this.businessClaimService.findByClaimKey(claimKey);
      if (existing) {
        this.existingClaim.set(existing);
        this.claimError.set('This business already has a pending page draft. Use the existing claim instead of creating a duplicate.');
        return;
      }
      const saved = await this.businessClaimService.create(record, {
        admin_name: this.adminName().trim(),
        admin_email: this.adminEmail().trim(),
        guide_prompt: this.guidePrompt().trim(),
        badge_icons: this.selectedIconCodes(),
      });
      this.existingClaim.set(saved);
      this.saveLocalDraft({
        claimKey,
        businessName: this.businessName(),
        cityName: this.selectedCityName(),
        previewUrl: this.previewUrl(),
        guidePrompt: this.guidePrompt(),
        adminName: this.adminName().trim(),
        adminEmail: this.adminEmail().trim(),
        selectedLanguageCodes: this.selectedLanguageCodes(),
        selectedIconCodes: this.selectedIconCodes(),
        savedAt: new Date().toISOString(),
      });
      this.clearPendingDraft();
      this.localClaimKeys.update((keys) => [...new Set([...keys, claimKey])]);
      this.claimStatus.set('Business page created and marked pending review.');
      await this.router.navigateByUrl(this.businessDetailPath());
    } catch {
      this.saveLocalDraft({
        claimKey,
        businessName: this.businessName(),
        cityName: this.selectedCityName(),
        previewUrl: this.previewUrl(),
        guidePrompt: this.guidePrompt(),
        adminName: this.adminName().trim(),
        adminEmail: this.adminEmail().trim(),
        selectedLanguageCodes: this.selectedLanguageCodes(),
        selectedIconCodes: this.selectedIconCodes(),
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

  async downloadDecalPng(): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const svg = this.buildDecalSvg();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await this.loadImage(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = 1800;
      canvas.height = 1800;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }
      context.fillStyle = '#f4f4f1';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!pngBlob) {
        return;
      }
      const pngUrl = URL.createObjectURL(pngBlob);
      const anchor = document.createElement('a');
      anchor.href = pngUrl;
      anchor.download = this.decalPngFilename();
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(pngUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  svgOrbitTransform(index: number, total: number, _radius = 190): string {
    const positionsByCount: Record<number, number[][]> = {
      1: [[450, 640]],
      2: [[320, 316], [580, 316]],
      3: [[300, 316], [600, 316], [450, 602]],
      4: [[300, 316], [600, 316], [335, 608], [565, 608]],
      5: [[300, 316], [600, 316], [250, 552], [450, 602], [650, 552]],
      6: [[300, 316], [600, 316], [250, 552], [650, 552], [385, 612], [515, 612]],
    };
    const positions = positionsByCount[Math.min(Math.max(total, 1), 6)] ?? positionsByCount[6];
    const [x, y] = positions[index] ?? positions[0];
    return `translate(${x} ${y})`;
  }

  badgeIconTransform(index: number, total: number): string {
    const positions = total <= 1
      ? [[450, 238]]
      : total === 2
        ? [[252, 450], [648, 450]]
        : [[450, 238], [252, 450], [648, 450]];
    const [x, y] = positions[index] ?? positions[0];
    return `translate(${x} ${y})`;
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

  private currentDraft(): StoredClaimDraft {
    return {
      claimKey: this.claimKey(),
      businessName: this.businessName(),
      cityName: this.selectedCityName(),
      previewUrl: this.previewUrl(),
      guidePrompt: this.guidePrompt(),
      adminName: this.adminName().trim(),
      adminEmail: this.adminEmail().trim(),
      selectedLanguageCodes: this.selectedLanguageCodes(),
      selectedIconCodes: this.selectedIconCodes(),
      savedAt: new Date().toISOString(),
    };
  }

  private savePendingDraft(): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(this.pendingDraftKey, JSON.stringify(this.currentDraft()));
  }

  private restorePendingDraft(): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem(this.pendingDraftKey) ?? 'null') as Partial<StoredClaimDraft> | null;
      if (!parsed) {
        return;
      }
      if (parsed.businessName) {
        this.businessQuery.set(parsed.businessName);
      }
      if (parsed.guidePrompt) {
        this.guidePrompt.set(parsed.guidePrompt);
      }
      if (parsed.adminName) {
        this.adminName.set(parsed.adminName);
      }
      if (parsed.adminEmail) {
        this.adminEmail.set(parsed.adminEmail);
      }
      if (Array.isArray(parsed.selectedLanguageCodes) && parsed.selectedLanguageCodes.length > 0) {
        this.selectedLanguageCodes.set(parsed.selectedLanguageCodes.slice(0, 6));
      }
      if (Array.isArray(parsed.selectedIconCodes) && parsed.selectedIconCodes.length > 0) {
        this.selectedIconCodes.set(parsed.selectedIconCodes.slice(0, 3));
      }
    } catch {
      window.localStorage.removeItem(this.pendingDraftKey);
    }
  }

  private clearPendingDraft(): void {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(this.pendingDraftKey);
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

  private fitBadgeText(value: string): string {
    const clean = value.trim() || 'Your business';
    return clean.length > 26 ? `${clean.slice(0, 23).trim()}...` : clean;
  }

  private isValidEmail(value: string): boolean {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
  }

  private escapeSvg(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Badge image could not be rendered for PNG download.'));
      image.src = src;
    });
  }

  private buildDecalSvg(): string {
    const business = this.escapeSvg(this.decalBusinessTitle());
    const qr = this.escapeSvg(this.qrImageUrl());
    const icons = this.selectedBadgeIcons().map((icon, index, all) => {
      const transform = this.badgeIconTransform(index, all.length);
      return `<g transform="${transform}"><circle r="43" fill="#fff8ea" stroke="#b98834" stroke-width="4"/><text y="18" text-anchor="middle" font-size="54">${icon.emoji}</text></g>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
      <defs>
        <radialGradient id="paper" cx="50%" cy="42%" r="62%">
          <stop offset="0" stop-color="#f5e4c5"/>
          <stop offset="0.68" stop-color="#dfc28d"/>
          <stop offset="1" stop-color="#c79d56"/>
        </radialGradient>
        <linearGradient id="tealRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#2f6f46"/>
          <stop offset="1" stop-color="#12372b"/>
        </linearGradient>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#12323a" flood-opacity="0.28"/>
        </filter>
        <path id="topArc" d="M 112 472 A 338 338 0 0 1 788 472"/>
        <path id="bottomArc" d="M 186 606 A 310 310 0 0 0 714 606"/>
      </defs>
      <rect width="900" height="900" fill="#111211"/>
      <image href="/assets/image/ring-countries.png" x="0" y="0" width="900" height="900" preserveAspectRatio="xMidYMid meet"/>
      <circle cx="450" cy="450" r="335" fill="none" stroke="url(#tealRing)" stroke-width="46" opacity="0.96"/>
      <circle cx="450" cy="450" r="300" fill="url(#paper)" stroke="#b8842f" stroke-width="5" filter="url(#softShadow)"/>
      <circle cx="450" cy="450" r="210" fill="none" stroke="#a47729" stroke-width="4" stroke-dasharray="24 28"/>
      <text font-family="Inter, Arial, sans-serif" font-size="32" font-weight="900" fill="#ffffff" dy="12">
        <textPath href="#topArc" startOffset="50%" text-anchor="middle" textLength="610" lengthAdjust="spacingAndGlyphs">${business} • LivingWiki Chat</textPath>
      </text>
      <text font-family="Inter, Arial, sans-serif" font-size="40" font-weight="900" fill="#ffffff" letter-spacing="1" dy="20">
        <textPath href="#bottomArc" startOffset="50%" text-anchor="middle" textLength="410" lengthAdjust="spacingAndGlyphs">60+ Languages</textPath>
      </text>
      <rect x="318" y="318" width="264" height="264" rx="20" fill="#fff8ea" stroke="#b8842f" stroke-width="5"/>
      <image href="${qr}" x="340" y="340" width="220" height="220" preserveAspectRatio="xMidYMid meet"/>
      <circle cx="450" cy="450" r="24" fill="#f3dfb9"/>
      <path d="M450 434c7 0 13 6 13 13v13c0 7-6 13-13 13s-13-6-13-13v-13c0-7 6-13 13-13z" fill="#0f596d"/>
      <path d="M429 458c0 13 9 24 21 24s21-11 21-24" fill="none" stroke="#0f596d" stroke-width="5" stroke-linecap="round"/>
      <path d="M450 482v18M437 500h26" fill="none" stroke="#0f596d" stroke-width="5" stroke-linecap="round"/>
      ${icons}
      <text x="450" y="646" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="900" fill="#0f596d">Powered by LivingWiki.com</text>
    </svg>`;
  }
}
