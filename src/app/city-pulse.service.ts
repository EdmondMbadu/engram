import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, LOCALE_ID, PLATFORM_ID } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import type { CityPulseMetric, CityPulseSnapshot } from './atlas.models';
import { getFirebaseFunctions } from './firebase.client';

const CACHE_PREFIX = 'living-wiki:city-pulse:';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const LANDING_METRIC_ORDER = [
  'population-now',
  'population-change-annual',
  'median-household-income',
  'median-gross-rent',
  'median-home-value',
  'green-jobs-open',
] as const;

@Injectable({ providedIn: 'root' })
export class CityPulseService {
  private readonly localeId = inject(LOCALE_ID);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;

  readCachedSnapshot(atlasId: string): CityPulseSnapshot | null {
    if (!this.isBrowser) {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(this.cacheKey(atlasId));
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as { expiresAt?: number; snapshot?: CityPulseSnapshot };
      if (!parsed?.snapshot || typeof parsed.expiresAt !== 'number') {
        return null;
      }

      if (Date.now() > parsed.expiresAt) {
        window.localStorage.removeItem(this.cacheKey(atlasId));
        return null;
      }

      return this.normalizeSnapshot(parsed.snapshot);
    } catch {
      return null;
    }
  }

  async getStoredSnapshot(atlasId: string): Promise<CityPulseSnapshot> {
    if (!this.functions) {
      throw new Error('Functions unavailable.');
    }

    const getCityPulseSnapshot = httpsCallable<{ atlasId: string }, CityPulseSnapshot>(
      this.functions,
      'getCityPulseSnapshot',
    );
    const { data } = await getCityPulseSnapshot({ atlasId });
    const snapshot = this.normalizeSnapshot(data);
    this.writeCache(atlasId, snapshot);
    return snapshot;
  }

  async refreshStoredSnapshot(atlasId: string): Promise<CityPulseSnapshot> {
    if (!this.functions) {
      throw new Error('Functions unavailable.');
    }

    const refreshCityPulseSnapshot = httpsCallable<{ atlasId: string }, CityPulseSnapshot>(
      this.functions,
      'refreshCityPulseSnapshot',
    );
    const { data } = await refreshCityPulseSnapshot({ atlasId });
    const snapshot = this.normalizeSnapshot(data);
    this.writeCache(atlasId, snapshot);
    return snapshot;
  }

  metricValue(metric: CityPulseMetric, nowMs = Date.now()): number {
    if (!metric.realtime) {
      return metric.value;
    }

    const anchorMs = Date.parse(metric.realtime.anchor_iso);
    if (Number.isNaN(anchorMs)) {
      return metric.value;
    }

    const elapsedSeconds = Math.max(0, (nowMs - anchorMs) / 1000);
    const nextValue = metric.realtime.baseline_value + metric.realtime.rate_per_second * elapsedSeconds;
    const floor = typeof metric.realtime.min_value === 'number' ? metric.realtime.min_value : null;
    return floor === null ? nextValue : Math.max(floor, nextValue);
  }

  modeledMetricValue(metric: CityPulseMetric, nowMs = Date.now()): number {
    if (metric.realtime) {
      return this.metricValue(metric, nowMs);
    }

    return metric.value + this.syntheticDrift(metric, nowMs);
  }

  formatMetric(metric: CityPulseMetric, nowMs = Date.now()): string {
    const value = this.metricValue(metric, nowMs);
    const decimals = typeof metric.decimals === 'number' ? metric.decimals : metric.format === 'percent' ? 1 : 0;

    if (metric.format === 'percent') {
      return `${value.toFixed(decimals)}%`;
    }

    const formatter = new Intl.NumberFormat(this.localeId, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
      style: metric.format === 'currency' ? 'currency' : 'decimal',
      currency: metric.format === 'currency' ? 'USD' : undefined,
    });

    let text = formatter.format(value);
    if (metric.unit_prefix) {
      text = `${metric.unit_prefix}${text}`;
    }
    if (metric.unit_suffix) {
      text = `${text}${metric.unit_suffix}`;
    }
    return text;
  }

  formatModeledMetric(metric: CityPulseMetric, nowMs = Date.now()): string {
    const value = this.modeledMetricValue(metric, nowMs);
    const decimals = this.modeledMetricDecimals(metric);

    if (metric.format === 'percent') {
      return `${value.toFixed(decimals)}%`;
    }

    const formatter = new Intl.NumberFormat(this.localeId, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
      style: metric.format === 'currency' ? 'currency' : 'decimal',
      currency: metric.format === 'currency' ? 'USD' : undefined,
    });

    let text = formatter.format(value);
    if (metric.unit_prefix) {
      text = `${metric.unit_prefix}${text}`;
    }
    if (metric.unit_suffix) {
      text = `${text}${metric.unit_suffix}`;
    }
    return text;
  }

  private writeCache(atlasId: string, snapshot: CityPulseSnapshot): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      window.localStorage.setItem(
        this.cacheKey(atlasId),
        JSON.stringify({
          snapshot,
          expiresAt: Date.now() + CACHE_TTL_MS,
        }),
      );
    } catch {
      // Ignore storage failures.
    }
  }

  private cacheKey(atlasId: string): string {
    return `${CACHE_PREFIX}${atlasId}`;
  }

  private modeledMetricDecimals(metric: CityPulseMetric): number {
    if (metric.id === 'population-now') {
      return 3;
    }
    if (metric.format === 'currency') {
      return 2;
    }
    if (metric.format === 'percent') {
      return 2;
    }
    return metric.value >= 1000 ? 2 : 3;
  }

  private syntheticDrift(metric: CityPulseMetric, nowMs: number): number {
    const amplitude = this.syntheticAmplitude(metric);
    if (amplitude <= 0) {
      return 0;
    }

    const seed = this.metricSeed(metric.id);
    const periodMs = this.syntheticPeriodMs(metric, seed);
    const secondaryPeriodMs = Math.max(45_000, Math.round(periodMs * 0.618));
    const primaryPhase = (((nowMs + seed * 997) % periodMs) / periodMs) * Math.PI * 2;
    const secondaryPhase = (((nowMs + seed * 1597) % secondaryPeriodMs) / secondaryPeriodMs) * Math.PI * 2;
    const drift = amplitude * (Math.sin(primaryPhase) * 0.72 + Math.cos(secondaryPhase) * 0.28);

    if (metric.format === 'number') {
      return Math.max(-metric.value, drift);
    }
    return drift;
  }

  private syntheticAmplitude(metric: CityPulseMetric): number {
    if (metric.format === 'currency') {
      if (metric.value >= 100_000) {
        return Math.max(12, metric.value * 0.00012);
      }
      if (metric.value >= 1_000) {
        return Math.max(0.35, metric.value * 0.0002);
      }
      return 0.2;
    }

    if (metric.format === 'percent') {
      return 0.08;
    }

    if (metric.value >= 1_000_000) {
      return 0.42;
    }
    if (metric.value >= 1_000) {
      return Math.max(0.35, metric.value * 0.0004);
    }
    return Math.max(0.08, Math.min(0.75, metric.value * 0.14));
  }

  private syntheticPeriodMs(metric: CityPulseMetric, seed: number): number {
    const baseMs =
      metric.cadence === 'daily'
        ? 150_000
        : metric.cadence === 'weekly'
          ? 180_000
          : metric.cadence === 'monthly'
            ? 210_000
            : metric.cadence === 'manual'
              ? 240_000
              : 165_000;
    return baseMs + (seed % 5) * 18_000;
  }

  private metricSeed(metricId: string): number {
    let seed = 0;
    for (let index = 0; index < metricId.length; index += 1) {
      seed = (seed * 33 + metricId.charCodeAt(index)) % 9973;
    }
    return seed;
  }

  private normalizeSnapshot(snapshot: CityPulseSnapshot): CityPulseSnapshot {
    const allowed = new Set<string>(LANDING_METRIC_ORDER);
    const rank = new Map<string, number>(LANDING_METRIC_ORDER.map((id, index) => [id, index]));
    const metrics = [...(snapshot.metrics ?? [])]
      .filter((metric): metric is CityPulseMetric => !!metric && allowed.has(metric.id))
      .sort((left, right) => {
        const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        return left.label.localeCompare(right.label);
      });

    return {
      ...snapshot,
      metrics,
    };
  }
}
