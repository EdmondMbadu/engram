import { DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import {
  BoardAnalyticsService,
  buildTrackedBoardUrl,
  type BoardInsights,
  type BoardInsightsRange,
} from '../board-analytics.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-board-insights',
  imports: [RouterLink, DatePipe, DecimalPipe, ThemeToggleComponent],
  templateUrl: './board-insights.html',
  styleUrl: './board-insights.css',
})
export class BoardInsightsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly analytics = inject(BoardAnalyticsService);
  private readonly title = inject(Title);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly boardId = signal('');
  readonly range = signal<BoardInsightsRange>(30);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly insights = signal<BoardInsights | null>(null);
  readonly source = signal('facebook');
  readonly campaign = signal('');
  readonly copied = signal(false);
  readonly copyError = signal('');
  readonly rangeOptions: Array<{ days: BoardInsightsRange; label: string }> = [
    { days: 7, label: '7 days' },
    { days: 30, label: '30 days' },
    { days: 90, label: '90 days' },
  ];

  readonly publicPath = computed(() => {
    const board = this.insights()?.board;
    return board ? `/boards/${encodeURIComponent(board.customSlug || board.id)}` : '/boards';
  });
  readonly publicUrl = computed(() => {
    if (!this.isBrowser) return this.publicPath();
    return `${window.location.origin}${this.publicPath()}`;
  });
  readonly trackedUrl = computed(() => {
    const base = this.publicUrl();
    if (!base) return '';
    return buildTrackedBoardUrl(base, this.source(), this.campaign() || this.insights()?.board.title || 'board-share');
  });
  readonly clickThroughRate = computed(() => {
    const totals = this.insights()?.totals;
    return totals?.views ? (totals.outboundClicks / totals.views) * 100 : 0;
  });
  readonly engagementRate = computed(() => {
    const totals = this.insights()?.totals;
    return totals?.views ? (totals.engagedVisits / totals.views) * 100 : 0;
  });
  readonly maxDailyViews = computed(() => Math.max(1, ...((this.insights()?.daily ?? []).map((day) => day.views))));
  readonly maxSourceViews = computed(() => Math.max(1, ...((this.insights()?.sources ?? []).map((source) => source.views))));
  private loadSequence = 0;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const boardId = params.get('boardId')?.trim() ?? '';
      this.boardId.set(boardId);
      void this.load();
    });
  }

  selectRange(days: BoardInsightsRange): void {
    if (this.range() === days) return;
    this.range.set(days);
    void this.load();
  }

  setSource(value: string): void {
    this.source.set(value);
    this.copied.set(false);
    this.copyError.set('');
  }

  setCampaign(value: string): void {
    this.campaign.set(value);
    this.copied.set(false);
    this.copyError.set('');
  }

  async copyTrackedLink(): Promise<void> {
    if (!this.isBrowser || !this.trackedUrl()) return;
    const url = this.trackedUrl();
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) copied = this.copyWithSelection(url);
    this.copied.set(copied);
    this.copyError.set(copied ? '' : 'Copy was blocked. Select the tracked URL and copy it manually.');
  }

  private copyWithSelection(value: string): boolean {
    try {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      return copied;
    } catch {
      return false;
    }
  }

  dailyBarHeight(views: number): number {
    return Math.max(3, Math.round((views / this.maxDailyViews()) * 100));
  }

  sourceBarWidth(views: number): number {
    return Math.max(2, Math.round((views / this.maxSourceViews()) * 100));
  }

  sourceLabel(value: string): string {
    const labels: Record<string, string> = {
      direct: 'Direct',
      facebook: 'Facebook / Instagram',
      google: 'Search',
      livingwiki: 'LivingWiki',
      email: 'Email',
      other: 'Other referrals',
    };
    return labels[value] || value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private async load(): Promise<void> {
    const loadSequence = ++this.loadSequence;
    const boardId = this.boardId();
    if (!boardId) {
      this.loading.set(false);
      this.error.set('Choose a board to view its insights.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.authService.waitForReady();
      const insights = await this.analytics.getInsights(boardId, this.range());
      if (loadSequence !== this.loadSequence) return;
      this.insights.set(insights);
      if (!this.campaign()) this.campaign.set(`${insights.board.title} launch`);
      this.title.setTitle(`${insights.board.title} Insights | LivingWiki`);
    } catch (error) {
      if (loadSequence !== this.loadSequence) return;
      this.insights.set(null);
      this.error.set(this.errorMessage(error));
    } finally {
      if (loadSequence === this.loadSequence) this.loading.set(false);
    }
  }

  private errorMessage(error: unknown): string {
    const message = error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
    if (/permission|owner/i.test(message)) return 'Only this board’s owner can view its insights.';
    if (/not.?found/i.test(message)) return 'This board could not be found.';
    return message.replace(/^FirebaseError:\s*/i, '') || 'Board insights could not be loaded. Try again.';
  }
}
