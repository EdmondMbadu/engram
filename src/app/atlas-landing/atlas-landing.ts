import { Component, computed, effect, ElementRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../auth.service';
import { AtlasService } from '../atlas.service';
import type { AtlasItem, AtlasUsage, CityPulseMetric, CityPulseSnapshot } from '../atlas.models';
import { CityPulseService } from '../city-pulse.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-atlas-landing',
  imports: [FormsModule, RouterLink, ThemeToggleComponent],
  templateUrl: './atlas-landing.html',
})
export class AtlasLandingComponent {
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly cityPulseService = inject(CityPulseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

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
  readonly canViewSpaces = computed(() => {
    const atlas = this.atlas();
    return !!atlas && (this.isOwner() || atlas.is_public);
  });
  readonly isPublicVisitor = computed(() => {
    const atlas = this.atlas();
    return !!atlas && atlas.is_public && !this.isOwner();
  });
  readonly showGreenJobsCard = computed(() => (this.routeSlug() ?? '').trim().toLowerCase() === 'philly');

  readonly isSigningOut = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly editError = signal<string | null>(null);

  readonly descriptionDraft = signal('');
  readonly logoUrlDraft = signal('');
  readonly heroUrlDraft = signal('');
  readonly publicDraft = signal(false);

  readonly togglingPublic = signal(false);
  readonly uploadingLogo = signal(false);
  readonly uploadingHero = signal(false);
  readonly uploadingVideo = signal(false);
  readonly removingVideo = signal(false);

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
  readonly cityPulseMetrics = computed(() => this.cityPulseSnapshot()?.metrics.slice(0, 6) ?? []);
  readonly aboutDocumentsCount = computed(() => this.displayUsage()?.documents ?? 0);
  readonly aboutWikiPagesCount = computed(() => this.displayUsage()?.wiki_articles ?? 0);
  readonly aboutChatsCount = computed(() => (this.displayUsage()?.queries ?? 0) + (this.displayUsage()?.chat_threads ?? 0));
  readonly aboutSummaryLine = computed(() => {
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
            this.cityPulseError.set(error instanceof Error ? error.message : 'Failed to load city pulse.');
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
  }

  readonly formattedCreatedAt = computed(() => {
    const a = this.atlas();
    const raw = a?.created_at;
    if (!raw) return null;
    const date = raw instanceof Date ? raw : raw.toDate?.();
    if (!date) return null;
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  });

  readonly userInitials = () => {
    const name = this.currentUserName();
    if (!name) return '?';
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  };

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

  cityPulseLiveEstimate(metric: CityPulseMetric): string | null {
    if (!metric.realtime) {
      return null;
    }

    const value = this.cityPulseService.metricValue(metric, this.cityPulseNowMs());
    const decimals = metric.id === 'population-now' ? 3 : 2;
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  cityPulseLiveCaption(metric: CityPulseMetric): string | null {
    if (!metric.realtime) {
      return null;
    }

    if (metric.id === 'population-now') {
      return 'Modeled live estimate';
    }

    return 'Live interpolation';
  }

  cityPulseMetricIcon(metric: CityPulseMetric): string {
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
        return metric.format === 'currency'
          ? 'attach_money'
          : metric.format === 'percent'
            ? 'percent'
            : 'monitoring';
    }
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

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  startEdit(): void {
    const a = this.atlas();
    if (!a) return;
    this.descriptionDraft.set(a.description ?? '');
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
        logo_url: this.logoUrlDraft().trim() || null,
        hero_url: this.heroUrlDraft().trim() || null,
        is_public: this.publicDraft(),
      });
      this.editing.set(false);
    } catch (error) {
      this.editError.set(error instanceof Error ? error.message : 'Failed to save changes.');
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
      this.editError.set(error instanceof Error ? error.message : 'Upload failed.');
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

  toggleAvatarMenu(): void {
    this.avatarMenuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.querySelector('.avatar-menu-wrapper')?.contains(event.target as Node)) {
      this.avatarMenuOpen.set(false);
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
      this.editError.set(error instanceof Error ? error.message : 'Video upload failed.');
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
      this.editError.set(error instanceof Error ? error.message : 'Failed to remove video.');
    } finally {
      this.removingVideo.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.isSigningOut.set(true);
    this.avatarMenuOpen.set(false);
    try {
      await this.authService.signOut();
      await this.router.navigateByUrl('/');
    } finally {
      this.isSigningOut.set(false);
    }
  }
}
