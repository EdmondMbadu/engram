import { Component, computed, effect, inject, LOCALE_ID, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../auth.service';
import { AtlasService } from '../atlas.service';
import type { AtlasItem, AtlasUsage, CityPulseMetric, CityPulseSnapshot } from '../atlas.models';
import { CityPulseService } from '../city-pulse.service';
import { getGoogleAdSenseConfig } from '../firebase.config';
import { GoogleAdSenseService } from '../google-adsense.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';
import { AccountMenuComponent } from '../account-menu/account-menu';

interface CityDetailSticker {
  id: string;
  label: string;
  value: string;
  caption: string;
  captionIcon?: string;
  icon: string;
  palette: string;
}

interface CityMoodSticker {
  label: string;
  icon: string;
  palette: string;
}

@Component({
  selector: 'app-atlas-landing',
  imports: [FormsModule, RouterLink, ThemeToggleComponent, WorkspaceSidebarComponent, AccountMenuComponent],
  templateUrl: './atlas-landing.html',
  styleUrl: './atlas-landing.css',
})
export class AtlasLandingComponent {
  private readonly localeId = inject(LOCALE_ID);
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly cityPulseService = inject(CityPulseService);
  private readonly googleAdSenseService = inject(GoogleAdSenseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly routeSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug'))),
    { initialValue: this.route.snapshot.paramMap.get('slug') },
  );

  readonly isSignedIn = computed(() => !!this.authService.uid());
  readonly ownedAtlasesLoading = this.atlasService.isLoading;

  private readonly publicAtlas = signal<AtlasItem | null>(null);
  private readonly publicLookupDone = signal(false);

  readonly atlas = computed<AtlasItem | null>(() => {
    const slug = this.routeSlug();
    if (!slug) return null;
    const atlases = this.atlasService.atlases();
    const owned =
      atlases.find((a) => a.slug === slug) ??
      atlases.find((a) => this.atlasService.slugify(a.name ?? '') === slug) ??
      atlases.find((a) => a.id === slug) ??
      null;
    if (owned) return owned;
    return this.publicAtlas();
  });

  readonly isLoading = computed(() => {
    if (this.atlas()) return false;
    if (this.isSignedIn() && this.ownedAtlasesLoading()) return true;
    return !this.publicLookupDone();
  });

  readonly notFound = computed(() => !this.isLoading() && !!this.routeSlug() && !this.atlas());

  readonly isOwner = computed(() => {
    const atlas = this.atlas();
    const uid = this.authService.uid();
    return !!atlas && !!uid && atlas.user_id === uid;
  });
  readonly canAdminAtlas = computed(() => this.atlasService.canAdminAtlas(this.atlas()));
  readonly canViewSpaces = computed(() => {
    const atlas = this.atlas();
    return !!atlas && (this.isOwner() || atlas.is_public);
  });
  readonly isPublicVisitor = computed(() => {
    const atlas = this.atlas();
    return !!atlas && atlas.is_public && !this.isOwner();
  });
  readonly hidePublicSourceFiles = computed(() => this.isPublicVisitor());
  readonly showGreenJobsCard = computed(() => (this.routeSlug() ?? '').trim().toLowerCase() === 'philly');
  readonly showPhillyBottomAd = computed(() => (this.routeSlug() ?? '').trim().toLowerCase() === 'philly');
  readonly phillyBottomAdSense = computed(() => {
    if (!this.showPhillyBottomAd()) {
      return null;
    }
    if (typeof window === 'undefined') {
      return null;
    }

    const { clientId, phillyBottomSlotId } = getGoogleAdSenseConfig();
    return clientId && phillyBottomSlotId ? { clientId, slotId: phillyBottomSlotId } : null;
  });
  readonly hidePublicKnowledgeSurfaces = computed(() =>
    this.atlasService.isPublicCityVisitorAtlas(this.atlas(), this.authService.uid()),
  );

  readonly currentUserEmail = this.authService.email;

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly editError = signal<string | null>(null);

  readonly descriptionDraft = signal('');
  readonly landingSummaryDraft = signal('');
  readonly logoUrlDraft = signal('');
  readonly heroUrlDraft = signal('');
  readonly publicDraft = signal(false);

  readonly togglingPublic = signal(false);
  readonly uploadingLogo = signal(false);
  readonly uploadingHero = signal(false);
  readonly uploadingVideo = signal(false);
  readonly removingVideo = signal(false);
  readonly subscribeModalOpen = signal(false);
  readonly subscribeEmail = signal('');
  readonly isSubscribing = signal(false);
  readonly subscribeError = signal<string | null>(null);
  readonly subscribeSuccess = signal<string | null>(null);
  readonly anonymousVisitorId = signal<string | null>(this.loadAnonymousVisitorId());
  private renderedAdSenseSlotKey: string | null = null;

  readonly usage = signal<AtlasUsage | null>(null);
  readonly usageLoading = signal(false);
  private usageAtlasId: string | null = null;
  readonly cityPulseSnapshot = signal<CityPulseSnapshot | null>(null);
  readonly cityPulseLoading = signal(false);
  readonly cityPulseError = signal<string | null>(null);
  readonly cityPulseNowMs = signal(Date.now());
  readonly aboutTypedLine = signal('');
  readonly animatedAboutDocuments = signal(0);
  readonly animatedAboutWikiPages = signal(0);
  readonly animatedAboutChats = signal(0);
  readonly displayUsage = computed<AtlasUsage | null>(() => {
    const usage = this.usage();
    if (usage) return usage;
    const atlas = this.atlas();
    if (!atlas) return null;
    if (atlas.stats) {
      return {
        documents: atlas.stats.documents,
        wiki_articles: atlas.stats.wiki_articles,
        knowledge_entries: atlas.stats.knowledge_entries,
        wiki_topics: atlas.stats.wiki_topics,
        queries: 0,
        chat_threads: atlas.stats.chat_threads,
        total:
          atlas.stats.documents +
          atlas.stats.wiki_articles +
          atlas.stats.knowledge_entries +
          atlas.stats.wiki_topics +
          atlas.stats.chat_threads,
      };
    }
    return null;
  });
  readonly isCityAtlas = computed(() => this.atlas()?.city_config?.enabled === true);
  readonly cityPulseMetrics = computed(() => this.cityPulseSnapshot()?.metrics ?? []);
  readonly cityPulsePrimaryMetric = computed(
    () => this.cityPulseMetrics().find((metric) => metric.id === 'population-now') ?? this.cityPulseMetrics()[0] ?? null,
  );
  readonly cityPulseSecondaryMetrics = computed(() => {
    const primary = this.cityPulsePrimaryMetric();
    return this.cityPulseMetrics().filter((metric) => metric.id !== primary?.id);
  });
  readonly aboutDocumentsCount = computed(() => this.displayUsage()?.documents ?? 0);
  readonly aboutWikiPagesCount = computed(() => this.displayUsage()?.wiki_articles ?? 0);
  readonly aboutChatsCount = computed(() => (this.displayUsage()?.queries ?? 0) + (this.displayUsage()?.chat_threads ?? 0));
  readonly currentWikiName = computed(() => {
    const atlas = this.atlas();
    if (!atlas) {
      return '';
    }
    const name = this.atlasService.displayName(atlas);
    return name && name !== 'Select atlas' ? name : '';
  });
  readonly cityPulseName = computed(() => {
    const atlas = this.atlas();
    return (
      this.cityPulseSnapshot()?.city_name?.trim() ||
      atlas?.city_config?.city_name?.trim() ||
      this.displayName()
    );
  });
  readonly cityDetailStickers = computed<CityDetailSticker[]>(() => {
    const atlas = this.atlas();
    const config = atlas?.city_config;
    const metadata = config?.metadata;
    const stickers: CityDetailSticker[] = [];

    const addSticker = (sticker: CityDetailSticker) => {
      if (!stickers.some((existing) => existing.id === sticker.id)) {
        stickers.push(sticker);
      }
    };

    const cityName = config?.city_name?.trim() || this.cityPulseSnapshot()?.city_name?.trim() || '';
    if (cityName) {
      addSticker({
        id: 'city-name',
        label: $localize`City`,
        value: cityName,
        caption: config?.region_name?.trim() || config?.country_code?.trim() || 'City profile',
        icon: 'location_city',
        palette: 'teal',
      });
    }

    const regionParts = [config?.region_name?.trim(), config?.country_code?.trim()].filter(Boolean);
    if (regionParts.length) {
      addSticker({
        id: 'region',
        label: $localize`Region`,
        value: regionParts.join(', '),
        caption: metadata?.global_region || 'Mapped location',
        icon: 'public',
        palette: 'sky',
      });
    }

    if (metadata?.population && !this.cityPulseMetrics().some((metric) => metric.id === 'population-now')) {
      addSticker({
        id: 'population',
        label: $localize`Population`,
        value: this.compactNumber(metadata.population),
        caption: metadata.population_year ? `Estimate year ${metadata.population_year}` : 'Latest attached estimate',
        icon: 'groups',
        palette: 'coral',
      });
    }

    if (metadata?.population_density_per_km2) {
      addSticker({
        id: 'density',
        label: $localize`Density`,
        value: this.compactNumber(metadata.population_density_per_km2),
        caption: $localize`/km²`,
        captionIcon: 'groups',
        icon: 'groups',
        palette: 'yellow',
      });
    }

    if (metadata?.area_km2) {
      addSticker({
        id: 'area',
        label: $localize`Area`,
        value: `${this.compactNumber(metadata.area_km2)} km²`,
        caption: metadata.population_scope ? this.titleize(metadata.population_scope.replaceAll('_', ' ')) : 'Mapped area',
        icon: 'map',
        palette: 'green',
      });
    }

    if (config?.timezone) {
      addSticker({
        id: 'timezone',
        label: $localize`Time`,
        value: this.shortTimezone(config.timezone),
        caption: config.timezone,
        icon: 'schedule',
        palette: 'purple',
      });
    }

    if (typeof config?.latitude === 'number' && typeof config.longitude === 'number') {
      addSticker({
        id: 'coordinates',
        label: $localize`Coordinates`,
        value: `${config.latitude.toFixed(2)}, ${config.longitude.toFixed(2)}`,
        caption: $localize`Map position`,
        icon: 'explore',
        palette: 'blue',
      });
    }

    return stickers.slice(0, 8);
  });
  readonly cityMoodStickers = computed<CityMoodSticker[]>(() => {
    const options: CityMoodSticker[] = [
      { label: $localize`Food streets`, icon: 'restaurant', palette: 'coral' },
      { label: $localize`Parks`, icon: 'park', palette: 'green' },
      { label: $localize`Transit pulse`, icon: 'directions_transit', palette: 'blue' },
      { label: $localize`Local markets`, icon: 'storefront', palette: 'yellow' },
      { label: $localize`Night lights`, icon: 'nightlife', palette: 'purple' },
      { label: $localize`Public art`, icon: 'palette', palette: 'teal' },
      { label: $localize`Waterfront`, icon: 'waves', palette: 'sky' },
      { label: $localize`Neighborhoods`, icon: 'home_work', palette: 'coral' },
      { label: $localize`Campuses`, icon: 'school', palette: 'blue' },
      { label: $localize`Green jobs`, icon: 'eco', palette: 'green' },
    ];
    const seedSource = `${this.cityPulseName()}-${this.atlas()?.city_config?.country_code ?? ''}`;
    let seed = 0;
    for (let i = 0; i < seedSource.length; i++) {
      seed = (seed * 31 + seedSource.charCodeAt(i)) % 9973;
    }
    return [...options]
      .sort((left, right) => ((seed + left.label.length * 17) % 101) - ((seed + right.label.length * 17) % 101))
      .slice(0, 5);
  });
  readonly canSubscribeToAtlasUpdates = computed(() => {
    const atlas = this.atlas();
    return !!atlas?.id && atlas.is_public === true && !this.canAdminAtlas();
  });
  readonly aboutSummaryLine = computed(() => {
    const customSummary = this.atlas()?.landing_summary?.trim();
    if (customSummary) {
      return customSummary;
    }

    if (this.hidePublicKnowledgeSurfaces()) {
      return 'Searchable knowledge with receipts, ready to explore.';
    }

    if (this.usageLoading()) {
      return 'Loading indexed knowledge…';
    }

    const docs = this.aboutDocumentsCount();
    const wikiPages = this.aboutWikiPagesCount();
    const chats = this.aboutChatsCount();

    if (docs === 0 && wikiPages === 0 && chats === 0) {
      return 'Searchable knowledge with receipts, ready to grow.';
    }

    return `${docs} document${docs === 1 ? '' : 's'} • ${wikiPages} wiki page${wikiPages === 1 ? '' : 's'} • ${chats} chat thread${chats === 1 ? '' : 's'}`;
  });

  constructor() {
    effect(() => {
      const slug = this.routeSlug();
      if (!slug) return;
      const atlases = this.atlasService.atlases();
      const inOwned = atlases.some(
        (a) => a.slug === slug || this.atlasService.slugify(a.name ?? '') === slug || a.id === slug,
      );
      if (inOwned) {
        this.publicLookupDone.set(true);
        return;
      }
      if (this.isSignedIn() && this.ownedAtlasesLoading()) return;
      this.publicLookupDone.set(false);
      void this.atlasService
        .getPublicAtlasBySlug(slug)
        .then((found) => this.publicAtlas.set(found))
        .catch(() => this.publicAtlas.set(null))
        .finally(() => this.publicLookupDone.set(true));
    });

    effect(() => {
      const atlas = this.atlas();
      if (!atlas) {
        this.usage.set(null);
        this.usageAtlasId = null;
        this.usageLoading.set(false);
        return;
      }
      const usageKey = `${this.isOwner() ? 'owner' : 'public'}:${atlas.id}`;
      if (this.usageAtlasId === usageKey) return;
      this.usageAtlasId = usageKey;
      this.usageLoading.set(true);
      this.usage.set(null);

      if (this.isOwner()) {
        this.usageLoading.set(true);
        void this.atlasService
          .getAtlasUsage(atlas.id)
          .then((u) => this.usage.set(u))
          .catch(() => this.usage.set(null))
          .finally(() => this.usageLoading.set(false));
      } else {
        void this.atlasService
          .getPublicAtlasUsage(atlas.id)
          .then((u) => this.usage.set(u))
          .catch(() => this.usage.set(null))
          .finally(() => this.usageLoading.set(false));
      }
    });

    effect((onCleanup) => {
      const atlas = this.atlas();
      if (!atlas?.city_config?.enabled) {
        this.cityPulseSnapshot.set(null);
        this.cityPulseLoading.set(false);
        this.cityPulseError.set(null);
        return;
      }

      const cached = this.cityPulseService.readCachedSnapshot(atlas.id);
      if (cached) {
        this.cityPulseSnapshot.set(cached);
      }

      this.cityPulseLoading.set(true);
      this.cityPulseError.set(null);
      let cancelled = false;

      void this.cityPulseService
        .getStoredSnapshot(atlas.id)
        .then((snapshot) => {
          if (!cancelled) {
            this.cityPulseSnapshot.set(snapshot);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            this.cityPulseError.set(error instanceof Error ? error.message : $localize`Failed to load city pulse.`);
          }
        })
        .finally(() => {
          if (!cancelled) {
            this.cityPulseLoading.set(false);
          }
        });

      onCleanup(() => {
        cancelled = true;
      });
    });

    effect((onCleanup) => {
      if (!this.isCityAtlas() || !this.cityPulseSnapshot()) {
        return;
      }

      const interval = setInterval(() => this.cityPulseNowMs.set(Date.now()), 1000);
      onCleanup(() => clearInterval(interval));
    });

    effect((onCleanup) => {
      const text = this.aboutSummaryLine();
      if (!text) {
        this.aboutTypedLine.set('');
        return;
      }

      this.aboutTypedLine.set('');
      let index = 0;
      const interval = setInterval(() => {
        index = Math.min(index + 1, text.length);
        this.aboutTypedLine.set(text.slice(0, index));
        if (index >= text.length) {
          clearInterval(interval);
        }
      }, 18);

      onCleanup(() => clearInterval(interval));
    });

    effect((onCleanup) => {
      const docs = this.aboutDocumentsCount();
      const wikiPages = this.aboutWikiPagesCount();
      const chats = this.aboutChatsCount();

      if (this.usageLoading()) {
        this.animatedAboutDocuments.set(0);
        this.animatedAboutWikiPages.set(0);
        this.animatedAboutChats.set(0);
        return;
      }

      const startedAt = Date.now();
      const durationMs = 750;
      const interval = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);

        this.animatedAboutDocuments.set(Math.round(docs * eased));
        this.animatedAboutWikiPages.set(Math.round(wikiPages * eased));
        this.animatedAboutChats.set(Math.round(chats * eased));

        if (progress >= 1) {
          clearInterval(interval);
        }
      }, 32);

      onCleanup(() => clearInterval(interval));
    });

    effect((onCleanup) => {
      const adSense = this.phillyBottomAdSense();
      if (!adSense || typeof window === 'undefined') {
        this.renderedAdSenseSlotKey = null;
        return;
      }

      const slotKey = `${adSense.clientId}:${adSense.slotId}`;
      if (this.renderedAdSenseSlotKey === slotKey) {
        return;
      }

      const timeout = window.setTimeout(() => {
        this.renderedAdSenseSlotKey = slotKey;
        void this.googleAdSenseService.requestAd(adSense.clientId).catch(() => {
          this.renderedAdSenseSlotKey = null;
        });
      });

      onCleanup(() => window.clearTimeout(timeout));
    });
  }

  readonly formattedCreatedAt = computed(() => {
    const a = this.atlas();
    const raw = a?.created_at;
    if (!raw) return null;
    const date = raw instanceof Date ? raw : raw.toDate?.();
    if (!date) return null;
    return date.toLocaleDateString(this.localeId, { month: 'short', year: 'numeric' });
  });

  readonly displayName = computed(() => this.atlasService.displayName(this.atlas()));

  private activateThisAtlas(): void {
    const id = this.atlas()?.id;
    if (id) this.atlasService.setActive(id);
  }

  private publicAtlasSlug(): string | null {
    const atlas = this.atlas();
    if (!atlas?.is_public) return null;
    return atlas.slug?.trim() || this.atlasService.slugify(atlas.name ?? '') || atlas.id;
  }

  private publicRoute(segment: 'chat' | 'library' | 'upload' | 'wiki'): string | null {
    const slug = this.publicAtlasSlug();
    return slug ? `/${segment}/${slug}` : null;
  }

  openChat(): void {
    const publicRoute = this.publicRoute('chat');
    if (publicRoute && this.isPublicVisitor()) {
      void this.router.navigateByUrl(publicRoute);
      return;
    }
    this.activateThisAtlas();
    void this.router.navigateByUrl('/chat');
  }

  signInQueryParams(): { redirectTo: string } {
    return { redirectTo: this.publicRoute('chat') ?? this.router.url ?? '/chat' };
  }

  openSubscribeModal(): void {
    const atlas = this.atlas();
    if (!atlas || !this.canSubscribeToAtlasUpdates()) {
      return;
    }

    const currentEmail = this.currentUserEmail()?.trim() ?? '';
    this.subscribeEmail.set(currentEmail);
    this.subscribeError.set(null);
    this.subscribeSuccess.set(null);
    this.subscribeModalOpen.set(true);
  }

  closeSubscribeModal(): void {
    if (this.isSubscribing()) {
      return;
    }
    this.subscribeModalOpen.set(false);
    this.subscribeError.set(null);
    this.subscribeSuccess.set(null);
  }

  onSubscribeEmailInput(event: Event): void {
    this.subscribeEmail.set((event.target as HTMLInputElement).value);
    this.subscribeError.set(null);
  }

  async subscribeToUpdates(event: Event): Promise<void> {
    event.preventDefault();
    const atlas = this.atlas();
    const email = this.subscribeEmail().trim().toLowerCase();
    if (!atlas?.id || this.isSubscribing()) {
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.subscribeError.set($localize`Enter a valid email address.`);
      return;
    }

    this.isSubscribing.set(true);
    this.subscribeError.set(null);
    this.subscribeSuccess.set(null);
    try {
      const result = await this.atlasService.subscribeToAtlasUpdates({
        atlasId: atlas.id,
        email,
        anonymousVisitorId: this.ensureAnonymousVisitorId(),
      });
      this.subscribeSuccess.set(
        result.alreadySubscribed
          ? 'You are already subscribed to weekly updates for this wiki.'
          : 'You are subscribed. A confirmation email is on the way.',
      );
    } catch (error) {
      this.subscribeError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isSubscribing.set(false);
    }
  }

  openUpload(): void {
    const publicRoute = this.publicRoute('upload');
    if (publicRoute && this.isPublicVisitor()) {
      void this.router.navigateByUrl(publicRoute);
      return;
    }
    this.activateThisAtlas();
    void this.router.navigateByUrl('/upload');
  }

  openManage(): void {
    this.activateThisAtlas();
    void this.router.navigateByUrl('/atlases');
  }

  openPersona(): void {
    const atlas = this.atlas();
    if (!atlas || !this.canAdminAtlas()) {
      return;
    }
    void this.router.navigate(['/atlases', atlas.id, 'persona']);
  }

  openLibrary(): void {
    const publicRoute = this.publicRoute('library');
    if (publicRoute && this.isPublicVisitor()) {
      void this.router.navigateByUrl(publicRoute);
      return;
    }
    this.activateThisAtlas();
    void this.router.navigateByUrl('/library');
  }

  openWiki(): void {
    const publicRoute = this.publicRoute('wiki');
    if (publicRoute && this.isPublicVisitor()) {
      void this.router.navigateByUrl(publicRoute);
      return;
    }
    this.activateThisAtlas();
    void this.router.navigateByUrl(publicRoute ?? '/wiki');
  }

  openGreenJobs(): void {
    const slug = (this.routeSlug() ?? this.publicAtlasSlug() ?? '').trim();
    if (!slug) {
      return;
    }
    void this.router.navigateByUrl(`/atlas/${slug}/green-jobs`);
  }

  openWorldometers(): void {
    const slug = (this.routeSlug() ?? this.publicAtlasSlug() ?? '').trim();
    if (!slug) {
      return;
    }
    void this.router.navigateByUrl(`/atlas/${slug}/worldometers`);
  }

  formatCityPulseMetric(metric: CityPulseMetric): string {
    return this.cityPulseService.formatMetric(metric, this.cityPulseNowMs());
  }

  cityPulseWorldometerValue(metric: CityPulseMetric): string {
    return metric.realtime
      ? this.cityPulseService.formatModeledMetric(metric, this.cityPulseNowMs())
      : this.cityPulseService.formatMetric(metric, this.cityPulseNowMs());
  }

  cityPulseLiveEstimate(metric: CityPulseMetric): string | null {
    if (!metric.realtime) {
      return null;
    }
    return this.cityPulseService.formatModeledMetric(metric, this.cityPulseNowMs());
  }

  cityPulseLiveCaption(metric: CityPulseMetric): string {
    return metric.realtime ? 'Modeled live estimate' : 'Latest verified value';
  }

  cityPulseMetricStatus(metric: CityPulseMetric): string {
    return metric.realtime ? 'Live model' : 'Latest verified';
  }

  cityPulseMetricFrequency(metric: CityPulseMetric): string {
    switch (metric.cadence) {
      case 'realtime':
        return 'Updates every second';
      case 'daily':
        return 'Daily refresh';
      case 'weekly':
        return 'Weekly refresh';
      case 'monthly':
        return 'Monthly refresh';
      case 'yearly':
        return 'Annual source';
      default:
        return 'Manual source';
    }
  }

  cityPulseSnapshotRefreshedAt(): string {
    const refreshedAt = this.cityPulseSnapshot()?.refreshed_at;
    if (!refreshedAt) {
      return 'Snapshot pending';
    }

    const date = new Date(refreshedAt);
    if (Number.isNaN(date.getTime())) {
      return 'Snapshot pending';
    }

    return new Intl.DateTimeFormat(this.localeId, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  cityPulseMetricIcon(metric: CityPulseMetric): string {
    const haystack = `${metric.id} ${metric.label} ${metric.short_label} ${metric.description}`.toLowerCase();
    switch (metric.id) {
      case 'population-now':
      case 'population-change-annual':
        return 'groups';
      case 'median-household-income':
        return 'payments';
      case 'median-gross-rent':
        return 'apartment';
      case 'median-home-value':
        return 'home_work';
      case 'green-jobs-open':
        return 'eco';
      default:
        if (haystack.includes('density')) return 'grid_view';
        if (haystack.includes('rent') || haystack.includes('home') || haystack.includes('housing')) return 'apartment';
        if (haystack.includes('income') || haystack.includes('cost') || haystack.includes('price')) return 'payments';
        if (haystack.includes('job') || haystack.includes('employment')) return 'work';
        if (haystack.includes('school') || haystack.includes('education')) return 'school';
        if (haystack.includes('transit') || haystack.includes('commute')) return 'directions_transit';
        if (haystack.includes('park') || haystack.includes('green')) return 'park';
        if (haystack.includes('safety') || haystack.includes('crime')) return 'shield';
        if (haystack.includes('health')) return 'local_hospital';
        if (haystack.includes('weather') || haystack.includes('temperature')) return 'partly_cloudy_day';
        if (haystack.includes('air')) return 'air';
        return metric.format === 'currency'
          ? 'attach_money'
          : metric.format === 'percent'
            ? 'percent'
            : 'monitoring';
    }
  }

  cityPulseMetricPalette(metric: CityPulseMetric): string {
    const haystack = `${metric.id} ${metric.label} ${metric.short_label} ${metric.description}`.toLowerCase();
    if (metric.id === 'population-now' || metric.id === 'population-change-annual') return 'teal';
    if (metric.id === 'median-household-income' || haystack.includes('income')) return 'yellow';
    if (metric.id === 'median-gross-rent' || haystack.includes('rent')) return 'purple';
    if (metric.id === 'median-home-value' || haystack.includes('home')) return 'blue';
    if (metric.id === 'green-jobs-open' || haystack.includes('green') || haystack.includes('park')) return 'green';
    if (haystack.includes('density')) return 'coral';
    if (haystack.includes('transit') || haystack.includes('commute')) return 'sky';
    if (haystack.includes('safety') || haystack.includes('crime')) return 'blue';
    if (metric.format === 'currency') return 'yellow';
    if (metric.format === 'percent') return 'coral';
    return 'teal';
  }

  private compactNumber(value: number): string {
    return new Intl.NumberFormat(this.localeId, {
      notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(value) >= 10_000 ? 1 : 0,
    }).format(value);
  }

  private shortTimezone(timezone: string): string {
    const parts = timezone.split('/');
    return this.titleize((parts.at(-1) ?? timezone).replaceAll('_', ' '));
  }

  private titleize(value: string): string {
    return value.replace(/\w\S*/g, (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  }

  cityPulseMetricAccent(metric: CityPulseMetric): string {
    switch (metric.id) {
      case 'population-now':
      case 'population-change-annual':
        return 'from-[#34d399] to-[#0ea5e9]';
      case 'median-household-income':
        return 'from-[#facc15] to-[#f97316]';
      case 'median-gross-rent':
        return 'from-[#f472b6] to-[#a855f7]';
      case 'median-home-value':
        return 'from-[#22d3ee] to-[#3b82f6]';
      case 'green-jobs-open':
        return 'from-[#bef264] to-[#16a34a]';
      default:
        return 'from-[#86efac] to-[#10b981]';
    }
  }

  cityPulseSparkPath(metric: CityPulseMetric): string {
    let seed = 0;
    for (let i = 0; i < metric.id.length; i++) {
      seed = (seed * 31 + metric.id.charCodeAt(i)) % 9973;
    }
    const points: number[] = [];
    for (let i = 0; i < 12; i++) {
      seed = (seed * 1103515245 + 12345) % 0x7fffffff;
      const t = i / 11;
      const trend = 30 - t * 18;
      const noise = ((seed % 1000) / 1000 - 0.5) * 14;
      points.push(Math.max(4, Math.min(36, trend + noise)));
    }
    const stepX = 100 / (points.length - 1);
    return points
      .map((y, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)} ${y.toFixed(2)}`)
      .join(' ');
  }

  cityPulseIsLive(metric: CityPulseMetric): boolean {
    return !!metric.realtime || metric.cadence === 'realtime';
  }

  cityPulseMetricAsOf(metric: CityPulseMetric): string {
    if (!metric.as_of) {
      return 'No timestamp';
    }

    const date = new Date(metric.as_of);
    if (Number.isNaN(date.getTime())) {
      return 'No timestamp';
    }

    return new Intl.DateTimeFormat(this.localeId, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  startEdit(): void {
    const a = this.atlas();
    if (!a) return;
    this.descriptionDraft.set(a.description ?? '');
    this.landingSummaryDraft.set(a.landing_summary ?? '');
    this.logoUrlDraft.set(a.logo_url ?? '');
    this.heroUrlDraft.set(a.hero_url ?? '');
    this.publicDraft.set(!!a.is_public);
    this.editError.set(null);
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.editError.set(null);
  }

  async saveEdit(): Promise<void> {
    const a = this.atlas();
    if (!a) return;
    this.saving.set(true);
    this.editError.set(null);
    try {
      await this.atlasService.updateAtlas(a.id, {
        description: this.descriptionDraft().trim() || null,
        landing_summary: this.landingSummaryDraft().trim() || null,
        logo_url: this.logoUrlDraft().trim() || null,
        hero_url: this.heroUrlDraft().trim() || null,
        is_public: this.publicDraft(),
      });
      this.editing.set(false);
    } catch (error) {
      this.editError.set(error instanceof Error ? error.message : $localize`Failed to save changes.`);
    } finally {
      this.saving.set(false);
    }
  }

  async onImageSelected(kind: 'logo' | 'hero', event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const a = this.atlas();
    if (!a || !this.isOwner()) return;

    this.editError.set(null);
    const busy = kind === 'logo' ? this.uploadingLogo : this.uploadingHero;
    busy.set(true);
    try {
      const url = await this.atlasService.uploadAtlasImage(a.id, kind, file);
      if (kind === 'logo') {
        this.logoUrlDraft.set(url);
      } else {
        this.heroUrlDraft.set(url);
      }
      await this.atlasService.updateAtlas(a.id, kind === 'logo' ? { logo_url: url } : { hero_url: url });
    } catch (error) {
      this.editError.set(error instanceof Error ? error.message : $localize`Upload failed.`);
    } finally {
      busy.set(false);
    }
  }

  async togglePublic(): Promise<void> {
    const a = this.atlas();
    if (!a || !this.isOwner()) return;
    this.togglingPublic.set(true);
    try {
      await this.atlasService.updateAtlas(a.id, { is_public: !a.is_public });
    } finally {
      this.togglingPublic.set(false);
    }
  }

  async onVideoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const a = this.atlas();
    if (!a || !this.isOwner()) return;

    this.editError.set(null);
    this.uploadingVideo.set(true);
    try {
      const url = await this.atlasService.uploadAtlasVideo(a.id, file);
      await this.atlasService.updateAtlas(a.id, { video_url: url });
    } catch (error) {
      this.editError.set(error instanceof Error ? error.message : $localize`Video upload failed.`);
    } finally {
      this.uploadingVideo.set(false);
    }
  }

  async removeVideo(): Promise<void> {
    const a = this.atlas();
    if (!a || !this.isOwner() || !a.video_url) return;
    this.removingVideo.set(true);
    try {
      await this.atlasService.removeAtlasVideo(a.id, a.video_url);
    } catch (error) {
      this.editError.set(error instanceof Error ? error.message : $localize`Failed to remove video.`);
    } finally {
      this.removingVideo.set(false);
    }
  }

  private loadAnonymousVisitorId(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage.getItem('living-wiki:publicVisitorId');
  }

  private ensureAnonymousVisitorId(): string | null {
    const existing = this.anonymousVisitorId();
    if (existing) {
      return existing;
    }
    if (typeof window === 'undefined' || typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
      return null;
    }

    const next = crypto.randomUUID();
    window.localStorage.setItem('living-wiki:publicVisitorId', next);
    this.anonymousVisitorId.set(next);
    return next;
  }
}
