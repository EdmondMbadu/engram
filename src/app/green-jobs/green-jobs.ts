import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import {
  PhillyGreenJobsService,
  type PhillyGreenJobListing,
  type PhillyGreenJobsSnapshot,
} from './philly-green-jobs.service';

@Component({
  selector: 'app-green-jobs',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './green-jobs.html',
  styleUrl: './green-jobs.css',
})
export class GreenJobsComponent {
  private readonly authService = inject(AuthService);
  private readonly greenJobsService = inject(PhillyGreenJobsService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly routeSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug'))),
    { initialValue: this.route.snapshot.paramMap.get('slug') },
  );

  readonly isSignedIn = computed(() => !!this.authService.uid());
  readonly isSupportedAtlas = computed(() => (this.routeSlug() ?? '').toLowerCase() === 'philly');
  readonly selectedBucket = signal<'all' | 'jobs' | 'pathways'>('all');
  readonly selectedSourceId = signal<'all' | string>('all');
  readonly expandedListingId = signal<string | null>(null);

  readonly snapshot = signal<PhillyGreenJobsSnapshot | null>(this.greenJobsService.readCachedSnapshot());
  readonly isLoading = signal(!this.snapshot());
  readonly isRefreshing = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly listings = computed(() => this.snapshot()?.listings ?? []);
  readonly sourceStatuses = computed(() => this.snapshot()?.sources ?? []);
  readonly totalJobs = computed(() => this.listings().filter((listing) => listing.bucket === 'jobs').length);
  readonly totalPathways = computed(() => this.listings().filter((listing) => listing.bucket === 'pathways').length);
  readonly sourceCount = computed(() => this.sourceStatuses().length);
  readonly filteredListings = computed(() => {
    const bucket = this.selectedBucket();
    const sourceId = this.selectedSourceId();

    return this.listings().filter((listing) => {
      if (bucket !== 'all' && listing.bucket !== bucket) {
        return false;
      }
      if (sourceId !== 'all' && listing.sourceId !== sourceId) {
        return false;
      }
      return true;
    });
  });
  readonly availableTags = computed(() => {
    const tags = new Set<string>();
    for (const listing of this.listings()) {
      for (const tag of listing.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).slice(0, 10);
  });
  readonly refreshedLabel = computed(() => this.formatTimestamp(this.snapshot()?.refreshedAt ?? null));

  constructor() {
    if (this.isBrowser && this.isSupportedAtlas()) {
      void this.refresh(false);
    }
  }

  async refresh(force: boolean): Promise<void> {
    if (!this.isBrowser || !this.isSupportedAtlas()) {
      return;
    }

    if (!force && this.snapshot()) {
      this.isRefreshing.set(true);
    } else {
      this.isLoading.set(true);
    }
    this.loadError.set(null);

    try {
      const snapshot = await this.greenJobsService.fetchLatestSnapshot();
      this.snapshot.set(snapshot);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Could not refresh Philly green jobs.');
    } finally {
      this.isLoading.set(false);
      this.isRefreshing.set(false);
    }
  }

  setBucket(bucket: 'all' | 'jobs' | 'pathways'): void {
    this.selectedBucket.set(bucket);
  }

  setSource(sourceId: 'all' | string): void {
    this.selectedSourceId.set(sourceId);
  }

  toggleExpanded(listingId: string): void {
    this.expandedListingId.update((current) => (current === listingId ? null : listingId));
  }

  isExpanded(listing: PhillyGreenJobListing): boolean {
    return this.expandedListingId() === listing.id;
  }

  fitLabel(listing: PhillyGreenJobListing): string {
    if (listing.fit === 'direct') {
      return 'Direct green role';
    }
    if (listing.fit === 'support') {
      return 'Sector support role';
    }
    return 'Career pathway';
  }

  fitClasses(listing: PhillyGreenJobListing): string {
    if (listing.fit === 'direct') {
      return 'green-jobs-pill green-jobs-pill--direct';
    }
    if (listing.fit === 'support') {
      return 'green-jobs-pill green-jobs-pill--support';
    }
    return 'green-jobs-pill green-jobs-pill--pathway';
  }

  bucketClasses(bucket: 'all' | 'jobs' | 'pathways'): string {
    return this.selectedBucket() === bucket ? 'green-jobs-filter green-jobs-filter--active' : 'green-jobs-filter';
  }

  sourceClasses(sourceId: 'all' | string): string {
    return this.selectedSourceId() === sourceId ? 'green-jobs-source-filter green-jobs-source-filter--active' : 'green-jobs-source-filter';
  }

  sourceLabel(sourceId: string): string {
    return this.sourceStatuses().find((source) => source.id === sourceId)?.label ?? sourceId;
  }

  private formatTimestamp(value: string | null): string {
    if (!value) {
      return 'No refresh yet';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'No refresh yet';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }
}
