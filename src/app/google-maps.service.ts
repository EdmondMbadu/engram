import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import type { MappableLocation } from './atlas.models';
import { getGoogleMapsConfig } from './firebase.config';

type LatLngLiteral = { lat: number; lng: number };

type GoogleMapsNamespace = {
  maps: {
    importLibrary: (name: string) => Promise<Record<string, unknown>>;
    Map: new (element: HTMLElement, options: Record<string, unknown>) => unknown;
    LatLngBounds: new () => {
      extend: (position: LatLngLiteral) => void;
    };
    Geocoder: new () => {
      geocode: (request: { address: string }) => Promise<{
        results: Array<{
          formatted_address?: string;
          geometry?: {
            location?: {
              lat: () => number;
              lng: () => number;
            };
          };
        }>;
      }>;
    };
    marker?: {
      AdvancedMarkerElement: new (options: Record<string, unknown>) => unknown;
    };
  };
};

export type ResolvedMappableLocation = MappableLocation & {
  position: LatLngLiteral;
  formatted_address: string | null;
};

@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private loadPromise: Promise<GoogleMapsNamespace> | null = null;
  private readonly geocodeCache = new Map<string, ResolvedMappableLocation | null>();

  isConfigured(): boolean {
    if (!this.isBrowser) {
      return false;
    }
    return !!getGoogleMapsConfig().apiKey;
  }

  mapId(): string {
    if (!this.isBrowser) {
      return 'DEMO_MAP_ID';
    }
    return getGoogleMapsConfig().mapId || 'DEMO_MAP_ID';
  }

  async load(): Promise<GoogleMapsNamespace> {
    if (!this.isBrowser) {
      throw new Error('Google Maps is only available in the browser.');
    }

    const loadedGoogle = this.googleMapsWindow();
    if (loadedGoogle?.maps?.importLibrary) {
      return loadedGoogle;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    const { apiKey } = getGoogleMapsConfig();
    if (!apiKey) {
      throw new Error('Google Maps API key is not configured.');
    }

    this.loadPromise = new Promise<GoogleMapsNamespace>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-living-wiki-google-maps]');
      if (existing) {
        existing.addEventListener('load', () => resolve(this.requireGoogleMaps()), { once: true });
        existing.addEventListener('error', () => reject(new Error('Google Maps failed to load.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.dataset['livingWikiGoogleMaps'] = 'true';
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`;
      script.onload = () => resolve(this.requireGoogleMaps());
      script.onerror = () => reject(new Error('Google Maps failed to load.'));
      document.head.appendChild(script);
    });

    return this.loadPromise;
  }

  async resolveLocations(locations: MappableLocation[]): Promise<ResolvedMappableLocation[]> {
    if (locations.length === 0) {
      return [];
    }

    const google = await this.load();
    await google.maps.importLibrary('geocoding');
    const geocoder = new google.maps.Geocoder();
    const resolved = await Promise.all(
      locations.slice(0, 6).map(async (location) => {
        const key = location.search_query.trim().toLowerCase();
        if (this.geocodeCache.has(key)) {
          return this.geocodeCache.get(key);
        }

        try {
          const response = await geocoder.geocode({ address: location.search_query });
          const result = response.results[0];
          const point = result?.geometry?.location;
          if (!point) {
            this.geocodeCache.set(key, null);
            return null;
          }
          const resolvedLocation: ResolvedMappableLocation = {
            ...location,
            position: { lat: point.lat(), lng: point.lng() },
            formatted_address: result.formatted_address ?? location.address_hint ?? null,
          };
          this.geocodeCache.set(key, resolvedLocation);
          return resolvedLocation;
        } catch {
          this.geocodeCache.set(key, null);
          return null;
        }
      }),
    );

    return resolved.filter((location): location is ResolvedMappableLocation => !!location);
  }

  private requireGoogleMaps(): GoogleMapsNamespace {
    const google = this.googleMapsWindow();
    if (!google?.maps?.importLibrary) {
      throw new Error('Google Maps did not initialize.');
    }
    return google;
  }

  private googleMapsWindow(): GoogleMapsNamespace | null {
    const value = window.google;
    if (!value || typeof value !== 'object') {
      return null;
    }
    const candidate = value as Partial<GoogleMapsNamespace>;
    return candidate.maps?.importLibrary ? candidate as GoogleMapsNamespace : null;
  }
}
