import { DatePipe, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountMenuComponent } from '../account-menu/account-menu';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import {
  BulkBoardAdminService,
  type BulkBoardAdminAction,
  type BulkBoardAdminBoard,
  type BulkBoardCity,
  type BulkBoardDashboard,
  type BulkBoardJob,
  type BulkBoardJobItem,
  type BulkBoardPreflight,
  type BulkBoardTemplateInput,
  type GlobalCityBoardCatalogStatus,
} from './bulk-board-admin.service';

type GlobalBucketPreset = BulkBoardTemplateInput & {
  label: string;
  promise: string;
  icon: string;
};

const GLOBAL_BUCKET_PRESETS: GlobalBucketPreset[] = [
  {
    id: 'global-dishes-explain',
    version: '1.0',
    label: '10 Dishes That Explain [City]',
    promise: 'Food as a way to understand the place—not a ranking.',
    icon: 'restaurant',
    titlePattern: '{count} Dishes That Explain {city}',
    searchQuery: 'local food restaurant signature dishes regional cuisine',
    editorialBrief: 'Dish first. Each card must name one distinct, verifiable dish and explain one specific thing it reveals about the city. Tie it to an exact verified venue. Do not repeat the same dish. No “best,” rankings, generic food praise, or unsupported origin stories. If the dish-to-venue connection cannot be verified, do not claim it.',
    count: 10,
    cardTitleMode: 'subject',
  },
  {
    id: 'global-guidebooks-miss',
    version: '1.0',
    label: 'What the Guidebooks Miss: 10 Places Locals Deal Each Other',
    promise: '10 places locals deal each other, without “hidden gem” language.',
    icon: 'style',
    titlePattern: 'What the Guidebooks Miss: {count} Places Locals Deal Each Other',
    searchQuery: 'locally loved independent places community favorites',
    editorialBrief: 'Expectation-subversion, not obscurity theater. Explain the concrete local use, ritual, or reason someone would pass each place to a friend. Never say hidden gem, off the beaten path, locals-only, must-visit, or tourist-free. Do not invent local habits.',
    count: 10,
    cardTitleMode: 'place',
  },
  {
    id: 'global-zero-dollars',
    version: '1.0',
    label: 'Zero Dollars: 10 Things Locals Do for Free',
    promise: '10 things locals genuinely do for free.',
    icon: 'money_off',
    titlePattern: 'Zero Dollars: {count} Things Locals Do for Free',
    searchQuery: 'free attractions parks public spaces activities',
    editorialBrief: 'Lead with the free behavior, not an adjective. Verify that no required admission or purchase is needed. Explain what people actually do there and why the setting matters. Avoid “fun for everyone,” vague affordability claims, and temporary offers.',
    count: 10,
    cardTitleMode: 'subject',
  },
  {
    id: 'global-where-locals-linger',
    version: '1.0',
    label: 'Where Locals Linger: 10 Places to Sit for Hours',
    promise: '10 places to sit for hours, framed through observed behavior.',
    icon: 'weekend',
    titlePattern: 'Where Locals Linger: {count} Places to Sit for Hours',
    searchQuery: 'cafes libraries parks plazas third places',
    editorialBrief: 'Treat this as a third-places board. Explain the observable setup that makes lingering possible: seating, pace, shade, tables, public access, or a steady room. Do not assert that staff tolerate hours-long stays unless a source supports it. No cozy, charming, or perfect-for filler.',
    count: 10,
    cardTitleMode: 'place',
  },
  {
    id: 'global-neighborhoods-one-reason',
    version: '1.0',
    label: '10 Neighborhoods, One Reason Each',
    promise: 'One neighborhood, one clean reason to care.',
    icon: 'location_city',
    titlePattern: '{count} Neighborhoods, One Reason Each',
    searchQuery: 'neighborhoods districts local areas',
    editorialBrief: 'Exactly one defensible reason per neighborhood. Use the neighborhood’s real name and a concrete distinction that helps a reader understand the city. Do not flatten communities into stereotypes, safety claims, demographic shorthand, or “vibrant culture.”',
    count: 10,
    cardTitleMode: 'place',
  },
  {
    id: 'global-only-happens-here',
    version: '1.0',
    label: 'Only Happens Here: 10 Things That Make No Sense Anywhere Else',
    promise: '10 city-specific things that make little sense anywhere else.',
    icon: 'fingerprint',
    titlePattern: 'Only Happens Here: {count} Things That Make No Sense Anywhere Else',
    searchQuery: 'unique local landmarks traditions institutions',
    editorialBrief: 'Playful confidence, rigorously local. Lead with the strange or city-specific thing, then explain the context that makes it make sense here. “Only” must be supportable as a local category claim, never an unsupported uniqueness superlative. Reject interchangeable attractions.',
    count: 10,
    cardTitleMode: 'subject',
  },
  {
    id: 'global-first-24-hours',
    version: '1.0',
    label: 'Your First 24 Hours in [City], Dealt as Cards',
    promise: 'A first-day sequence, dealt as ten useful cards.',
    icon: 'schedule',
    titlePattern: 'Your First 24 Hours in {city}, Dealt as Cards',
    searchQuery: 'essential local food culture landmarks first visit',
    editorialBrief: 'Build a plausible first-day sequence, not a top-ten list. Give each card a role in the day and one clear reason it belongs there. Keep travel time and opening-hour claims conservative unless verified. Avoid bucket-list language and exhausting itinerary compression.',
    count: 10,
    cardTitleMode: 'place',
  },
];

const DEFAULT_TEMPLATE: BulkBoardTemplateInput = {
  id: 'global-dishes-explain',
  version: '1.0',
  titlePattern: '{count} Dishes That Explain {city}',
  searchQuery: 'local food restaurant signature dishes regional cuisine',
  editorialBrief: 'Dish first. Each card must name one distinct, verifiable dish and explain one specific thing it reveals about the city. Tie it to an exact verified venue. Do not repeat the same dish. No “best,” rankings, generic food praise, or unsupported origin stories. If the dish-to-venue connection cannot be verified, do not claim it.',
  count: 10,
  cardTitleMode: 'subject',
};

@Component({
  selector: 'app-bulk-board-admin',
  imports: [RouterLink, FormsModule, DatePipe, ThemeToggleComponent, AccountMenuComponent],
  templateUrl: './bulk-board-admin.html',
  styleUrl: './bulk-board-admin.css',
})
export class BulkBoardAdminComponent implements OnInit, OnDestroy {
  private readonly service = inject(BulkBoardAdminService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly dashboard = signal<BulkBoardDashboard | null>(null);
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly running = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly citySearch = signal('');
  readonly boardSearch = signal('');
  readonly selectedCityIds = signal<Set<string>>(new Set());
  readonly runMode = signal<'test' | 'production'>('test');
  readonly selectedBucketId = signal(DEFAULT_TEMPLATE.id);
  readonly selectedBoardCity = signal('all');
  readonly selectedBoardStatus = signal('active');
  readonly template = signal<BulkBoardTemplateInput>({ ...DEFAULT_TEMPLATE });
  readonly preflight = signal<BulkBoardPreflight | null>(null);
  readonly preflightAccepted = signal(false);
  readonly publishingAll = signal(false);
  readonly reconcilingCatalog = signal(false);
  readonly catalogPlan = signal<GlobalCityBoardCatalogStatus | null>(null);
  readonly catalogAccepted = signal(false);
  readonly busyBoardId = signal<string | null>(null);
  readonly busyItemId = signal<string | null>(null);
  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;

  readonly cities = computed(() => this.dashboard()?.cities ?? []);
  readonly jobs = computed(() => this.dashboard()?.jobs ?? []);
  readonly items = computed(() => this.dashboard()?.items ?? []);
  readonly boards = computed(() => this.dashboard()?.boards ?? []);
  readonly needsReviewCount = computed(() => this.boards().filter(
    (board) => !board.deleted_at && board.editorial_status === 'needs_review',
  ).length);
  readonly selectedCount = computed(() => this.selectedCityIds().size);
  readonly bucketPresets = GLOBAL_BUCKET_PRESETS;
  readonly cityById = computed(() => new Map(this.cities().map((city) => [city.id, city])));
  readonly selectedCities = computed(() => [...this.selectedCityIds()]
    .map((id) => this.cityById().get(id))
    .filter((city): city is BulkBoardCity => !!city));
  readonly citySelectionSummary = computed(() => this.runMode() === 'test'
    ? `${this.selectedCount()} of 5 selected`
    : `${this.selectedCount()} selected`);
  readonly selectShownLabel = computed(() => this.runMode() === 'test' ? 'Select up to 5' : 'Select shown');
  readonly startGenerationLabel = computed(() => this.runMode() === 'test'
    ? `Start ${this.selectedCount()}-city test drive`
    : `Start ${this.selectedCount()}-city production run`);
  readonly boardTitlePreview = computed(() => {
    const city = this.selectedCities()[0]?.name || '[City]';
    return this.template().titlePattern
      .replace(/\{city\}|\[city\]/gi, city)
      .replace(/\{count\}|\[count\]/gi, String(this.template().count));
  });
  readonly filteredCities = computed(() => {
    const query = this.citySearch().trim().toLowerCase();
    return this.cities().filter((city) => !query || `${city.name} ${city.region} ${city.countryCode}`.toLowerCase().includes(query));
  });
  readonly activeJob = computed(() => this.jobs().find((job) => job.status === 'running') ?? null);
  readonly catalog = computed(() => this.dashboard()?.catalog ?? null);
  readonly catalogProgress = computed(() => {
    const catalog = this.catalog();
    if (!catalog?.expectedCount) return 0;
    return Math.round((catalog.publishedCount + catalog.reviewCount) / catalog.expectedCount * 100);
  });
  readonly filteredBoards = computed(() => {
    const query = this.boardSearch().trim().toLowerCase();
    const cityId = this.selectedBoardCity();
    const status = this.selectedBoardStatus();
    return this.boards().filter((board) => {
      const city = this.cityById().get(board.atlas_id || board.generated_for_atlas_id);
      const matchesQuery = !query || `${board.id} ${board.title} ${city?.name ?? ''} ${board.template_id}`.toLowerCase().includes(query);
      const matchesCity = cityId === 'all' || board.atlas_id === cityId || board.generated_for_atlas_id === cityId;
      const matchesStatus = status === 'all'
        || (status === 'trash' ? !!board.deleted_at : status === 'active' ? !board.deleted_at : board.editorial_status === status);
      return matchesQuery && matchesCity && matchesStatus;
    });
  });
  readonly publishableBoards = computed(() => this.filteredBoards().filter(
    (board) => !board.deleted_at && board.editorial_status !== 'published',
  ));

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) {
      this.loading.set(false);
      return;
    }
    const requestedBoardId = this.route.snapshot.queryParamMap.get('board')?.trim() ?? '';
    if (requestedBoardId) {
      this.boardSearch.set(requestedBoardId);
      this.selectedBoardStatus.set('all');
    }
    await this.load(false);
    this.refreshTimer = setInterval(() => {
      if (this.activeJob()) void this.load(true);
    }, 7000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async load(silent: boolean): Promise<void> {
    if (silent) this.refreshing.set(true);
    else this.loading.set(true);
    if (!silent) this.error.set(null);
    try {
      const dashboard = await this.service.dashboard();
      this.dashboard.set(dashboard);
      const eligibleIds = new Set(dashboard.cities.map((city) => city.id));
      this.selectedCityIds.update((selected) => new Set([...selected].filter((id) => eligibleIds.has(id))));
    } catch (error) {
      this.error.set(this.authService.toFriendlyError(error));
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  updateTemplate<K extends keyof BulkBoardTemplateInput>(key: K, value: BulkBoardTemplateInput[K]): void {
    this.template.update((template) => ({ ...template, [key]: value }));
    this.selectedBucketId.set('custom');
    this.preflight.set(null);
    this.preflightAccepted.set(false);
  }

  applyBucket(bucket: GlobalBucketPreset): void {
    const { label: _label, promise: _promise, icon: _icon, ...template } = bucket;
    this.selectedBucketId.set(bucket.id);
    this.template.set({ ...template });
    this.preflight.set(null);
    this.preflightAccepted.set(false);
    this.notice.set(null);
  }

  setRunMode(mode: 'test' | 'production'): void {
    if (mode === this.runMode()) return;
    if (mode === 'test' && this.selectedCount() > 5) {
      this.selectedCityIds.set(new Set([...this.selectedCityIds()].slice(0, 5)));
      this.notice.set('Test drive keeps the first five selected cities.');
    }
    this.runMode.set(mode);
    this.preflight.set(null);
    this.preflightAccepted.set(false);
  }

  onCountInput(value: string): void {
    this.updateTemplate('count', Math.max(3, Math.min(20, Math.trunc(Number(value) || 10))));
  }

  toggleCity(cityId: string): void {
    const next = new Set(this.selectedCityIds());
    if (next.has(cityId)) {
      next.delete(cityId);
    } else if (this.runMode() === 'test' && next.size >= 5) {
      this.notice.set('Five cities selected. Remove one before choosing another.');
      return;
    } else {
      next.add(cityId);
    }
    this.selectedCityIds.set(next);
    this.preflight.set(null);
    this.preflightAccepted.set(false);
  }

  selectFilteredCities(): void {
    const limit = this.runMode() === 'test' ? 5 : Number.POSITIVE_INFINITY;
    const next = new Set(this.selectedCityIds());
    for (const city of this.filteredCities()) {
      if (next.size >= limit) break;
      next.add(city.id);
    }
    if (this.runMode() === 'test' && this.filteredCities().some((city) => !next.has(city.id))) {
      this.notice.set('Selected the first five matching cities for this test drive.');
    }
    this.selectedCityIds.set(next);
    this.preflight.set(null);
    this.preflightAccepted.set(false);
  }

  clearCities(): void {
    this.selectedCityIds.set(new Set());
    this.preflight.set(null);
    this.preflightAccepted.set(false);
  }

  isCitySelected(cityId: string): boolean {
    return this.selectedCityIds().has(cityId);
  }

  async runPreflight(): Promise<void> {
    if (!this.selectedCount()) {
      this.error.set('Select at least one city.');
      return;
    }
    this.running.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      this.preflight.set(await this.service.preflight([...this.selectedCityIds()], this.template()));
      this.preflightAccepted.set(false);
    } catch (error) {
      this.error.set(this.authService.toFriendlyError(error));
    } finally {
      this.running.set(false);
    }
  }

  async startGeneration(): Promise<void> {
    const preflight = this.preflight();
    if (!preflight || !this.preflightAccepted()) return;
    if (this.activeJob()) {
      this.error.set('Wait for or cancel the active generation job before starting another.');
      return;
    }
    this.running.set(true);
    this.error.set(null);
    try {
      const result = await this.service.start([...this.selectedCityIds()], this.template());
      this.notice.set(`Started ${result.cityCount} city board tasks. You can leave this page; work continues in the background.`);
      this.preflight.set(null);
      this.preflightAccepted.set(false);
      await this.load(true);
    } catch (error) {
      this.error.set(this.authService.toFriendlyError(error));
    } finally {
      this.running.set(false);
    }
  }

  async prepareCatalogReconciliation(): Promise<void> {
    this.reconcilingCatalog.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const plan = await this.service.reconcileCatalog(true);
      this.catalogPlan.set(plan);
      this.catalogAccepted.set(false);
      if (!plan.readyCount) {
        this.notice.set('The seven-bucket city catalog has no unsuppressed missing boards to queue.');
      }
    } catch (error) {
      this.error.set(this.authService.toFriendlyError(error));
    } finally {
      this.reconcilingCatalog.set(false);
    }
  }

  async startCatalogReconciliation(): Promise<void> {
    const plan = this.catalogPlan();
    if (!plan?.readyCount || !this.catalogAccepted() || this.activeJob()) return;
    this.reconcilingCatalog.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const result = await this.service.reconcileCatalog(false);
      this.notice.set(
        `Queued ${result.readyCount ?? 0} missing city boards in one resumable catalog job. Existing boards will not be regenerated.`,
      );
      this.catalogPlan.set(null);
      this.catalogAccepted.set(false);
      await this.load(true);
    } catch (error) {
      this.error.set(this.authService.toFriendlyError(error));
    } finally {
      this.reconcilingCatalog.set(false);
    }
  }

  async cancelJob(job: BulkBoardJob): Promise<void> {
    if (!confirm('Cancel queued work for this job? A city already being processed will stop before its board is saved.')) return;
    this.running.set(true);
    this.error.set(null);
    try {
      await this.service.cancel(job.id);
      this.notice.set('Cancellation requested.');
      await this.load(true);
    } catch (error) {
      this.error.set(this.authService.toFriendlyError(error));
    } finally {
      this.running.set(false);
    }
  }

  async retryItem(item: BulkBoardJobItem): Promise<void> {
    this.busyItemId.set(item.id);
    this.error.set(null);
    try {
      await this.service.retryItem(item.id);
      this.notice.set(`Retry queued for ${item.city_name}.`);
      await this.load(true);
    } catch (error) {
      this.error.set(this.authService.toFriendlyError(error));
    } finally {
      this.busyItemId.set(null);
    }
  }

  async manage(board: BulkBoardAdminBoard, action: BulkBoardAdminAction): Promise<void> {
    const destructive = action === 'trash' || action === 'permanent_delete' || action === 'remove_from_city';
    let reason = '';
    if (action === 'publish'
      && !confirm('Publish this board publicly and list it in the city? Place identity passed validation, but you are confirming the editorial review.')) {
      return;
    }
    if (action === 'approve_source'
      && !confirm('Approve this published board as a city source? This is separate from making it visible.')) {
      return;
    }
    if (destructive) {
      const label = action === 'trash' ? 'move this board to trash' : action === 'permanent_delete' ? 'permanently delete this board' : 'remove this board from its city';
      if (!confirm(`Are you sure you want to ${label}?`)) return;
      reason = prompt('Reason for the audit log (optional):')?.trim() ?? '';
    }
    this.busyBoardId.set(board.id);
    this.error.set(null);
    try {
      await this.service.manageBoard(board.id, action, reason);
      this.notice.set(this.actionSuccessMessage(action));
      await this.load(true);
    } catch (error) {
      this.error.set(this.authService.toFriendlyError(error));
    } finally {
      this.busyBoardId.set(null);
    }
  }

  async publishAll(): Promise<void> {
    const boards = this.publishableBoards();
    if (!boards.length || this.publishingAll()) return;
    const cityCount = new Set(boards.map(
      (board) => board.atlas_id || board.generated_for_atlas_id,
    ).filter(Boolean)).size;
    const boardLabel = `${boards.length} board${boards.length === 1 ? '' : 's'}`;
    const cityLabel = `${cityCount} cit${cityCount === 1 ? 'y' : 'ies'}`;
    if (!confirm(
      `Publish all ${boardLabel} currently shown across ${cityLabel}?\n\n`
      + 'Each board will become public and appear in its city. Source approval remains separate. This confirms that you reviewed their editorial quality.',
    )) return;

    this.publishingAll.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const result = await this.service.publishBoards(boards.map((board) => board.id));
      const skippedCopy = result.skippedCount
        ? ` ${result.skippedCount} already-published board${result.skippedCount === 1 ? ' was' : 's were'} skipped.`
        : '';
      this.notice.set(
        `Published ${result.publishedCount} board${result.publishedCount === 1 ? '' : 's'} and listed them in their cities.${skippedCopy}`,
      );
      if (result.failedCount) {
        const examples = result.failures.slice(0, 3)
          .map((failure) => `${failure.title || failure.boardId}: ${failure.message}`)
          .join(' · ');
        this.error.set(
          `${result.failedCount} board${result.failedCount === 1 ? '' : 's'} could not be published.${examples ? ` ${examples}` : ''}`,
        );
      }
      await this.load(true);
    } catch (error) {
      this.error.set(this.authService.toFriendlyError(error));
    } finally {
      this.publishingAll.set(false);
    }
  }

  cityLabel(board: BulkBoardAdminBoard): string {
    const city = this.cityById().get(board.atlas_id || board.generated_for_atlas_id);
    return city ? [city.name, city.region].filter(Boolean).join(', ') : 'Unknown city';
  }

  jobProgress(job: BulkBoardJob): number {
    return job.total_count > 0 ? Math.min(100, Math.round(job.completed_count / job.total_count * 100)) : 0;
  }

  jobStatusLabel(status: string): string {
    return status.replaceAll('_', ' ');
  }

  bucketLabel(bucketId: string): string {
    return this.bucketPresets.find((bucket) => bucket.id === bucketId)?.label ?? bucketId;
  }

  itemStatusClass(status: string): string {
    if (status === 'failed') return 'status status--danger';
    if (status === 'needs_review') return 'status status--success';
    if (status === 'running' || status === 'queued') return 'status status--working';
    return 'status';
  }

  isRetryableItem(item: BulkBoardJobItem): boolean {
    if (item.status === 'failed') return true;
    if (item.status !== 'running' || !item.updated_at) return false;
    const updatedAt = Date.parse(item.updated_at);
    return Number.isFinite(updatedAt) && updatedAt <= Date.now() - 12 * 60 * 1000;
  }

  boardStatusClass(board: BulkBoardAdminBoard): string {
    if (board.deleted_at) return 'status status--danger';
    if (board.editorial_status === 'published') return 'status status--success';
    return 'status status--working';
  }

  trackCity(_index: number, city: BulkBoardCity): string { return city.id; }
  trackJob(_index: number, job: BulkBoardJob): string { return job.id; }
  trackItem(_index: number, item: BulkBoardJobItem): string { return item.id; }
  trackBoard(_index: number, board: BulkBoardAdminBoard): string { return board.id; }

  private actionSuccessMessage(action: BulkBoardAdminAction): string {
    switch (action) {
      case 'publish': return 'Board published and listed in its city.';
      case 'remove_from_city': return 'Board removed from the city and excluded as a source.';
      case 'exclude_source': return 'Board excluded as a city source.';
      case 'approve_source': return 'Board approved as a city source.';
      case 'trash': return 'Board moved to trash and suppressed from regeneration.';
      case 'restore': return 'Board restored as a private review draft.';
      case 'permanent_delete': return 'Board permanently deleted.';
    }
  }
}
