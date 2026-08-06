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
} from './bulk-board-admin.service';

const DEFAULT_TEMPLATE: BulkBoardTemplateInput = {
  id: 'places-worth-knowing',
  version: '1.0',
  titlePattern: '{count} places worth knowing in {city}',
  searchQuery: 'places to visit',
  editorialBrief: 'Write like a generous local insider. Give each card one clear reason to care. Avoid tour-guide filler, superlative marketing, and unsupported factual claims.',
  count: 10,
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
  readonly selectedBoardCity = signal('all');
  readonly selectedBoardStatus = signal('active');
  readonly template = signal<BulkBoardTemplateInput>({ ...DEFAULT_TEMPLATE });
  readonly preflight = signal<BulkBoardPreflight | null>(null);
  readonly preflightAccepted = signal(false);
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
  readonly cityById = computed(() => new Map(this.cities().map((city) => [city.id, city])));
  readonly filteredCities = computed(() => {
    const query = this.citySearch().trim().toLowerCase();
    return this.cities().filter((city) => !query || `${city.name} ${city.region} ${city.countryCode}`.toLowerCase().includes(query));
  });
  readonly activeJob = computed(() => this.jobs().find((job) => job.status === 'running') ?? null);
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
    this.preflight.set(null);
    this.preflightAccepted.set(false);
  }

  onCountInput(value: string): void {
    this.updateTemplate('count', Math.max(3, Math.min(20, Math.trunc(Number(value) || 10))));
  }

  toggleCity(cityId: string): void {
    this.selectedCityIds.update((selected) => {
      const next = new Set(selected);
      if (next.has(cityId)) next.delete(cityId);
      else next.add(cityId);
      return next;
    });
    this.preflight.set(null);
    this.preflightAccepted.set(false);
  }

  selectFilteredCities(): void {
    this.selectedCityIds.update((selected) => new Set([...selected, ...this.filteredCities().map((city) => city.id)]));
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
