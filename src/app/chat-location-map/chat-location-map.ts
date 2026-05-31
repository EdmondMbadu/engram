import { Component, ElementRef, inject, Input, OnChanges, signal, SimpleChanges, ViewChild } from '@angular/core';
import type { MappableLocation } from '../atlas.models';
import { GoogleMapsService, type ResolvedMappableLocation } from '../google-maps.service';

type MapController = {
  fitBounds?: (bounds: unknown, padding?: number) => void;
  panTo?: (position: ResolvedMappableLocation['position']) => void;
  setZoom?: (zoom: number) => void;
};

@Component({
  selector: 'app-chat-location-map',
  templateUrl: './chat-location-map.html',
  styleUrl: './chat-location-map.css',
})
export class ChatLocationMapComponent implements OnChanges {
  private readonly googleMapsService = inject(GoogleMapsService);
  private renderId = 0;
  private renderScheduled = false;

  @Input() locations: MappableLocation[] = [];
  @ViewChild('mapCanvas') set mapCanvasRef(ref: ElementRef<HTMLElement> | undefined) {
    this.mapCanvas = ref;
    if (ref) {
      this.scheduleRenderMap();
    }
  }

  private mapCanvas?: ElementRef<HTMLElement>;

  readonly mapTitle = 'Places mentioned';
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly resolvedLocations = signal<ResolvedMappableLocation[]>([]);
  readonly selectedLocationKey = signal<string | null>(null);
  private currentMap: MapController | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['locations']) {
      this.scheduleRenderMap();
    }
  }

  mapLink(location: MappableLocation): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.search_query)}`;
  }

  displayLocations(): MappableLocation[] {
    const resolved = this.resolvedLocations();
    if (resolved.length > 0) {
      return resolved;
    }
    return this.validLocations();
  }

  locationKey(location: MappableLocation): string {
    return `${location.name.trim().toLowerCase()}::${location.search_query.trim().toLowerCase()}`;
  }

  locationDetail(location: MappableLocation): string {
    const resolved = this.resolvedLocations().find((item) => this.locationKey(item) === this.locationKey(location));
    return resolved?.formatted_address || location.address_hint || location.search_query;
  }

  isSelectedLocation(location: MappableLocation): boolean {
    return this.selectedLocationKey() === this.locationKey(location);
  }

  selectLocation(location: MappableLocation): void {
    const key = this.locationKey(location);
    this.selectedLocationKey.set(key);
    const resolved = this.resolvedLocations().find((item) => this.locationKey(item) === key);
    if (!resolved) {
      return;
    }
    this.currentMap?.panTo?.(resolved.position);
    this.currentMap?.setZoom?.(15);
  }

  private scheduleRenderMap(): void {
    if (this.renderScheduled) {
      return;
    }

    this.renderScheduled = true;
    queueMicrotask(() => {
      this.renderScheduled = false;
      void this.renderMap();
    });
  }

  private async renderMap(): Promise<void> {
    const canvas = this.mapCanvas?.nativeElement;
    const locations = this.validLocations();
    if (!canvas || locations.length === 0) {
      this.resolvedLocations.set([]);
      this.selectedLocationKey.set(null);
      this.currentMap = null;
      return;
    }

    const currentRender = ++this.renderId;
    this.isLoading.set(true);
    this.error.set(null);
    if (!this.selectedLocationKey() || !locations.some((location) => this.isSelectedLocation(location))) {
      this.selectedLocationKey.set(this.locationKey(locations[0]));
    }

    try {
      if (!this.googleMapsService.isConfigured()) {
        throw new Error('Google Maps is not configured.');
      }

      const google = await this.googleMapsService.loadMapLibraries();
      const resolved = await this.googleMapsService.resolveLocations(locations);
      if (currentRender !== this.renderId) {
        return;
      }

      this.resolvedLocations.set(resolved);
      if (resolved.length === 0) {
        throw new Error('No map locations could be resolved.');
      }
      if (!resolved.some((location) => this.isSelectedLocation(location))) {
        this.selectedLocationKey.set(this.locationKey(resolved[0]));
      }

      const map = new google.maps.Map(canvas, {
        center: resolved[0].position,
        zoom: resolved.length === 1 ? 14 : 12,
        mapId: this.googleMapsService.mapId(),
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: true,
      });
      this.currentMap = map as MapController;
      const bounds = new google.maps.LatLngBounds();
      const Marker = google.maps.marker?.AdvancedMarkerElement;

      for (const location of resolved) {
        bounds.extend(location.position);
        if (Marker) {
          new Marker({
            map,
            position: location.position,
            title: location.name,
          });
        }
      }

      if (resolved.length > 1 && typeof this.currentMap.fitBounds === 'function') {
        this.currentMap.fitBounds(bounds, 54);
      }
    } catch (error) {
      if (currentRender === this.renderId) {
        this.error.set(error instanceof Error ? error.message : 'Map could not be loaded.');
        this.resolvedLocations.set([]);
        this.currentMap = null;
      }
    } finally {
      if (currentRender === this.renderId) {
        this.isLoading.set(false);
      }
    }
  }

  private validLocations(): MappableLocation[] {
    return this.locations.filter((location) => location.name?.trim() && location.search_query?.trim());
  }
}
