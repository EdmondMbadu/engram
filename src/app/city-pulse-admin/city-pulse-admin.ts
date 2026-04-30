import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import type { AtlasItem, CityPulseSnapshot } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { CityPulseService } from '../city-pulse.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-city-pulse-admin',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './city-pulse-admin.html',
})
export class CityPulseAdminComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);
  private readonly cityPulseService = inject(CityPulseService);

  readonly routeSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug'))),
    { initialValue: this.route.snapshot.paramMap.get('slug') },
  );

  readonly publicAtlas = signal<AtlasItem | null>(null);
  readonly publicLookupDone = signal(false);
  readonly snapshot = signal<CityPulseSnapshot | null>(null);
  readonly isLoading = signal(false);
  readonly isRefreshing = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly nowMs = signal(Date.now());

  readonly atlas = computed<AtlasItem | null>(() => {
    const slug = this.routeSlug();
    if (!slug) {
      return null;
    }

    const owned = this.atlasService.atlases().find(
      (item) =>
        item.slug === slug ||
        this.atlasService.slugify(item.name ?? '') === slug ||
        item.id === slug,
    );
    return owned ?? this.publicAtlas();
  });
  readonly isOwner = computed(() => this.atlas()?.user_id === this.authService.uid());
  readonly hasCityPulse = computed(() => this.atlas()?.city_config?.enabled === true);
  readonly missingCensusConfig = computed(() => {
    const config = this.atlas()?.city_config;
    if (!config?.enabled) {
      return false;
    }

    return !config.census_state_code?.trim() || !config.census_place_code?.trim();
  });
  readonly metrics = computed(() => this.snapshot()?.metrics ?? []);
  readonly notes = computed(() => this.snapshot()?.notes ?? []);

  constructor() {
    effect(() => {
      const slug = this.routeSlug();
      if (!slug) {
        this.publicAtlas.set(null);
        this.publicLookupDone.set(true);
        return;
      }

      const owned = this.atlasService.atlases().some(
        (item) =>
          item.slug === slug ||
          this.atlasService.slugify(item.name ?? '') === slug ||
          item.id === slug,
      );
      if (owned) {
        this.publicLookupDone.set(true);
        return;
      }

      this.publicLookupDone.set(false);
      void this.atlasService
        .getPublicAtlasBySlug(slug)
        .then((atlas) => this.publicAtlas.set(atlas))
        .catch(() => this.publicAtlas.set(null))
        .finally(() => this.publicLookupDone.set(true));
    });

    effect((onCleanup) => {
      const atlasId = this.atlas()?.id;
      if (!atlasId || !this.hasCityPulse()) {
        this.snapshot.set(null);
        return;
      }

      const cached = this.cityPulseService.readCachedSnapshot(atlasId);
      if (cached) {
        this.snapshot.set(cached);
      }

      this.isLoading.set(true);
      this.loadError.set(null);
      let cancelled = false;

      void this.cityPulseService
        .getStoredSnapshot(atlasId)
        .then((snapshot) => {
          if (!cancelled) {
            this.snapshot.set(snapshot);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            this.loadError.set(error instanceof Error ? error.message : 'Could not load city pulse snapshot.');
          }
        })
        .finally(() => {
          if (!cancelled) {
            this.isLoading.set(false);
          }
        });

      onCleanup(() => {
        cancelled = true;
      });
    });

    effect((onCleanup) => {
      if (!this.snapshot()) {
        return;
      }

      const interval = setInterval(() => this.nowMs.set(Date.now()), 1000);
      onCleanup(() => clearInterval(interval));
    });
  }

  async refresh(): Promise<void> {
    const atlasId = this.atlas()?.id;
    if (!atlasId || !this.isOwner()) {
      return;
    }

    this.isRefreshing.set(true);
    this.loadError.set(null);
    try {
      const snapshot = await this.cityPulseService.refreshStoredSnapshot(atlasId);
      this.snapshot.set(snapshot);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Could not refresh city pulse snapshot.');
    } finally {
      this.isRefreshing.set(false);
    }
  }

  formatMetricValue(metricId: string): string {
    const metric = this.metrics().find((item) => item.id === metricId);
    return metric ? this.cityPulseService.formatMetric(metric, this.nowMs()) : '—';
  }

  liveEstimate(metricId: string): string | null {
    const metric = this.metrics().find((item) => item.id === metricId);
    if (!metric?.realtime) {
      return null;
    }

    const value = this.cityPulseService.metricValue(metric, this.nowMs());
    const decimals = metric.id === 'population-now' ? 3 : 2;
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  metricAsOf(metricId: string): string {
    const metric = this.metrics().find((item) => item.id === metricId);
    if (!metric?.as_of) {
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

  refreshedLabel(): string {
    const value = this.snapshot()?.refreshed_at;
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
