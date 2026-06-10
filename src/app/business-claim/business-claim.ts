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
  readonly selectedIconCodes = signal(['hat', 'pretzel', 'beer', 'music']);
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
  readonly selectedBadgeIcons = computed(() => {
    const selected = new Set(this.selectedIconCodes());
    return this.badgeIcons.filter((icon) => selected.has(icon.code)).slice(0, 4);
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

  toggleBadgeIcon(code: string): void {
    this.selectedIconCodes.update((codes) => {
      if (codes.includes(code)) {
        return codes.length > 1 ? codes.filter((item) => item !== code) : codes;
      }
      if (codes.length >= 4) {
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
      ? [[450, 260]]
      : total === 2
        ? [[224, 450], [676, 450]]
        : total === 3
          ? [[224, 388], [676, 388], [224, 512]]
          : [[224, 382], [676, 382], [224, 518], [676, 518]];
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
      if (Array.isArray(parsed.selectedIconCodes) && parsed.selectedIconCodes.length > 0) {
        this.selectedIconCodes.set(parsed.selectedIconCodes.slice(0, 4));
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
      return `<g transform="${transform}" filter="url(#coinShadow)"><circle r="43" fill="url(#coinFace)" stroke="#f4cd76" stroke-width="4"/><circle r="36" fill="#fff8ea" stroke="#b8872f" stroke-width="2"/><text y="14" text-anchor="middle" font-size="36">${icon.emoji}</text></g>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
      <defs>
        <radialGradient id="paper" cx="50%" cy="38%" r="68%">
          <stop offset="0" stop-color="#fff3cf"/>
          <stop offset="0.58" stop-color="#e8be66"/>
          <stop offset="1" stop-color="#a7651e"/>
        </radialGradient>
        <linearGradient id="greenRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#3baf62"/>
          <stop offset="0.52" stop-color="#176b3d"/>
          <stop offset="1" stop-color="#2a9150"/>
        </linearGradient>
        <linearGradient id="goldEdge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff0b8"/>
          <stop offset="0.32" stop-color="#d7992b"/>
          <stop offset="0.64" stop-color="#ffe39a"/>
          <stop offset="1" stop-color="#8d5518"/>
        </linearGradient>
        <linearGradient id="coinFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff8dc"/>
          <stop offset="0.55" stop-color="#f0c66f"/>
          <stop offset="1" stop-color="#b87422"/>
        </linearGradient>
        <filter id="badgeShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="22" stdDeviation="18" flood-color="#050505" flood-opacity="0.38"/></filter>
        <filter id="coinShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#2b1a08" flood-opacity="0.38"/></filter>
        <filter id="textLift" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#001b10" flood-opacity="0.72"/></filter>
        <path id="topArc" d="M 132 464 A 318 318 0 0 1 768 464"/>
        <path id="bottomArc" d="M 176 606 A 300 300 0 0 0 724 606"/>
      </defs>
      <rect width="900" height="900" fill="#111211"/>
      <g filter="url(#badgeShadow)">
        <image href="/assets/image/ring-countries.png" x="0" y="0" width="900" height="900" preserveAspectRatio="xMidYMid meet"/>
        <circle cx="450" cy="450" r="424" fill="none" stroke="url(#goldEdge)" stroke-width="18"/>
        <circle cx="450" cy="450" r="340" fill="none" stroke="url(#greenRing)" stroke-width="76"/>
        <circle cx="450" cy="450" r="379" fill="none" stroke="url(#goldEdge)" stroke-width="8"/>
        <circle cx="450" cy="450" r="300" fill="none" stroke="url(#goldEdge)" stroke-width="9"/>
        <circle cx="450" cy="450" r="292" fill="url(#paper)" stroke="#8f591e" stroke-width="3"/>
        <circle cx="450" cy="450" r="228" fill="none" stroke="#f8d98b" stroke-width="2" opacity="0.72"/>
        <path d="M270 624c52 54 116 82 180 82s128-28 180-82" fill="none" stroke="#9c651f" stroke-width="15" stroke-linecap="round" opacity="0.36"/>
        <path d="M300 620c42 33 91 50 150 50s108-17 150-50" fill="none" stroke="#ffe29a" stroke-width="6" stroke-linecap="round" opacity="0.8"/>
        <circle cx="450" cy="248" r="34" fill="url(#coinFace)" stroke="#7f4d16" stroke-width="4"/>
        <circle cx="450" cy="248" r="25" fill="url(#greenRing)" stroke="#ffe39a" stroke-width="3"/>
        <text x="450" y="258" text-anchor="middle" font-size="28">🌍</text>
      </g>
      <text font-family="Inter, Arial, sans-serif" font-size="42" font-weight="900" fill="#f8f8f2" dy="15" filter="url(#textLift)">
        <textPath href="#topArc" startOffset="50%" text-anchor="middle" textLength="610" lengthAdjust="spacingAndGlyphs">${business} • LivingWiki Chat</textPath>
      </text>
      <text font-family="Inter, Arial, sans-serif" font-size="48" font-weight="900" fill="#f8f8f2" letter-spacing="1" dy="22" filter="url(#textLift)">
        <textPath href="#bottomArc" startOffset="50%" text-anchor="middle" textLength="470" lengthAdjust="spacingAndGlyphs">60+ Languages</textPath>
      </text>
      <rect x="270" y="288" width="360" height="360" rx="28" fill="#fffdf6" stroke="url(#goldEdge)" stroke-width="8" filter="url(#coinShadow)"/>
      <rect x="286" y="304" width="328" height="328" rx="18" fill="#ffffff" stroke="#f1d48b" stroke-width="2"/>
      <image href="${qr}" x="315" y="333" width="270" height="270" preserveAspectRatio="xMidYMid meet"/>
      ${icons}
      <rect x="290" y="664" width="320" height="42" rx="21" fill="url(#goldEdge)" stroke="#8f591e" stroke-width="2"/>
      <text x="450" y="692" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="900" fill="#10391f">Powered by LivingWiki.com</text>
      <text x="450" y="746" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="900" fill="#f5d780" filter="url(#coinShadow)">★ ★ ★ ★ ★</text>
    </svg>`;
  }
}
