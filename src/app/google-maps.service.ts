import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import type { MappableLocation } from './atlas.models';
import { getGoogleMapsConfig } from './firebase.config';

type LatLngLiteral = { lat: number; lng: number };

type GoogleMapsNamespace = {
  maps: {
    importLibrary?: (name: string) => Promise<Record<string, unknown>>;
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
    places?: {
      PlacesService: new (element: HTMLElement) => {
        textSearch: (
          request: { query: string },
          callback: (
            results: GooglePlaceResult[] | null,
            status: string,
          ) => void,
        ) => void;
        getDetails: (
          request: { placeId: string; fields: string[] },
          callback: (result: GooglePlaceResult | null, status: string) => void,
        ) => void;
      };
      PlacesServiceStatus?: {
        OK: string;
      };
    };
  };
};

type GooglePlaceResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  types?: string[];
  rating?: number;
  url?: string;
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
  photos?: Array<{
    getUrl: (options?: { maxWidth?: number; maxHeight?: number }) => string;
  }>;
};

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  address: string;
  types: string[];
  rating: number | null;
  googleMapsUrl: string;
  photoUrl: string;
  lat: number | null;
  lng: number | null;
};

export type ResolvedMappableLocation = MappableLocation & {
  position: LatLngLiteral;
  formatted_address: string | null;
};

@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly callbackName = '__livingWikiGoogleMapsReady';
  private loadPromise: Promise<GoogleMapsNamespace> | null = null;
  private readonly geocodeCache = new Map<string, ResolvedMappableLocation | null>();
  private readonly placeSearchCache = new Map<string, PlaceSearchResult[]>();
  private placesContainer: HTMLElement | null = null;

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
    if (loadedGoogle) {
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
        const initialized = this.googleMapsWindow();
        if (initialized) {
          resolve(initialized);
          return;
        }
        existing.remove();
      }

      this.setReadyCallback(resolve, reject);
      const script = document.createElement('script');
      script.dataset['livingWikiGoogleMaps'] = 'true';
      script.async = true;
      script.defer = true;
      const params = new URLSearchParams({
        key: apiKey,
        v: 'weekly',
        loading: 'async',
        callback: this.callbackName,
        libraries: 'maps,marker,geocoding,places',
      });
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.onerror = () => reject(new Error('Google Maps failed to load.'));
      document.head.appendChild(script);
    });

    return this.loadPromise;
  }

  async loadMapLibraries(): Promise<GoogleMapsNamespace> {
    const google = await this.load();
    if (google.maps.importLibrary) {
      await Promise.all([
        google.maps.importLibrary('maps'),
        google.maps.importLibrary('marker'),
        google.maps.importLibrary('geocoding'),
      ]);
    }
    return this.requireGoogleMaps();
  }

  async resolveLocations(locations: MappableLocation[], limit = 6): Promise<ResolvedMappableLocation[]> {
    if (locations.length === 0) {
      return [];
    }

    const google = await this.load();
    if (google.maps.importLibrary) {
      await google.maps.importLibrary('geocoding');
    }
    const geocoder = new google.maps.Geocoder();
    const resolved = await Promise.all(
      locations.slice(0, Math.max(0, limit)).map(async (location) => {
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

  async searchPlaces(query: string, cityHint = ''): Promise<PlaceSearchResult[]> {
    const searchText = [query.trim(), cityHint.trim()].filter(Boolean).join(', ');
    if (!searchText || query.trim().length < 2) {
      return [];
    }

    const cacheKey = searchText.toLowerCase();
    if (this.placeSearchCache.has(cacheKey)) {
      return this.placeSearchCache.get(cacheKey) ?? [];
    }

    const google = await this.load();
    if (google.maps.importLibrary) {
      await google.maps.importLibrary('places');
    }

    const places = google.maps.places;
    if (!places?.PlacesService) {
      throw new Error('Google Places is not available.');
    }

    const service = new places.PlacesService(this.ensurePlacesContainer());
    const okStatus = places.PlacesServiceStatus?.OK ?? 'OK';
    const textResults = await new Promise<GooglePlaceResult[]>((resolve, reject) => {
      service.textSearch({ query: searchText }, (results, status) => {
        if (status !== okStatus) {
          reject(new Error('No matching places found.'));
          return;
        }
        resolve((results ?? []).slice(0, 5));
      });
    });

    const enriched = await Promise.all(
      textResults.map((place) => this.fetchPlaceDetails(service, place, okStatus)),
    );
    const results = enriched.filter((place): place is PlaceSearchResult => !!place);
    this.placeSearchCache.set(cacheKey, results);
    return results;
  }

  private requireGoogleMaps(): GoogleMapsNamespace {
    const google = this.googleMapsWindow();
    if (!google) {
      throw new Error('Google Maps did not initialize.');
    }
    return google;
  }

  private setReadyCallback(
    resolve: (value: GoogleMapsNamespace) => void,
    reject: (reason?: unknown) => void,
  ): void {
    (window as unknown as Record<string, unknown>)[this.callbackName] = () => {
      try {
        resolve(this.requireGoogleMaps());
      } catch (error) {
        reject(error);
      } finally {
        delete (window as unknown as Record<string, unknown>)[this.callbackName];
      }
    };
  }

  private googleMapsWindow(): GoogleMapsNamespace | null {
    const value = window.google;
    if (!value || typeof value !== 'object') {
      return null;
    }
    const candidate = value as Partial<GoogleMapsNamespace>;
    const maps = candidate.maps as Partial<GoogleMapsNamespace['maps']> | undefined;
    return maps?.Map && maps.Geocoder ? candidate as GoogleMapsNamespace : null;
  }

  private ensurePlacesContainer(): HTMLElement {
    if (this.placesContainer) {
      return this.placesContainer;
    }

    const element = document.createElement('div');
    element.hidden = true;
    element.setAttribute('aria-hidden', 'true');
    document.body.appendChild(element);
    this.placesContainer = element;
    return element;
  }

  private async fetchPlaceDetails(
    service: GoogleMapsNamespace['maps']['places'] extends infer Places
      ? Places extends { PlacesService: new (element: HTMLElement) => infer Service }
        ? Service
        : never
      : never,
    place: GooglePlaceResult,
    okStatus: string,
  ): Promise<PlaceSearchResult | null> {
    const placeId = place.place_id;
    if (!placeId) {
      return null;
    }

    const detailed = await new Promise<GooglePlaceResult>((resolve) => {
      service.getDetails(
        {
          placeId,
          fields: ['place_id', 'name', 'formatted_address', 'photos', 'types', 'rating', 'url', 'geometry'],
        },
        (result, status) => {
          resolve(status === okStatus && result ? result : place);
        },
      );
    });

    const photos = detailed.photos?.length ? detailed.photos : place.photos ?? [];

    return {
      placeId,
      name: detailed.name ?? place.name ?? 'Untitled place',
      address: detailed.formatted_address ?? place.formatted_address ?? '',
      types: detailed.types ?? place.types ?? [],
      rating: typeof detailed.rating === 'number' ? detailed.rating : null,
      googleMapsUrl: detailed.url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailed.name ?? place.name ?? placeId)}`,
      photoUrl: photos[0]?.getUrl({ maxWidth: 1000, maxHeight: 1000 }) ?? '',
      lat: detailed.geometry?.location?.lat() ?? place.geometry?.location?.lat() ?? null,
      lng: detailed.geometry?.location?.lng() ?? place.geometry?.location?.lng() ?? null,
    };
  }
}
