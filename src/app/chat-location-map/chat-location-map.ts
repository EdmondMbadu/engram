import { Component, ElementRef, inject, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import type { MappableLocation } from '../atlas.models';
import { GoogleMapsService, type ResolvedMappableLocation } from '../google-maps.service';

@Component({
  selector: 'app-chat-location-map',
  templateUrl: './chat-location-map.html',
})
export class ChatLocationMapComponent implements OnChanges {
  private readonly googleMapsService = inject(GoogleMapsService);
  private renderId = 0;

  @Input() locations: MappableLocation[] = [];
  @ViewChild('mapCanvas') set mapCanvasRef(ref: ElementRef<HTMLElement> | undefined) {
    this.mapCanvas = ref;
    if (ref) {
      void this.renderMap();
    }
  }

  private mapCanvas?: ElementRef<HTMLElement>;

  readonly mapTitle = 'Places mentioned';
  isLoading = false;
  error: string | null = null;
  resolvedLocations: ResolvedMappableLocation[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['locations']) {
      void this.renderMap();
    }
  }

  mapLink(location: MappableLocation): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.search_query)}`;
  }

  private async renderMap(): Promise<void> {
    const canvas = this.mapCanvas?.nativeElement;
    const locations = this.locations.filter((location) => location.name?.trim() && location.search_query?.trim());
    if (!canvas || locations.length === 0) {
      return;
    }

    const currentRender = ++this.renderId;
    this.isLoading = true;
    this.error = null;

    try {
      if (!this.googleMapsService.isConfigured()) {
        throw new Error('Google Maps is not configured.');
      }

      const google = await this.googleMapsService.load();
      await Promise.all([
        google.maps.importLibrary('maps'),
        google.maps.importLibrary('marker'),
      ]);
      const resolved = await this.googleMapsService.resolveLocations(locations);
      if (currentRender !== this.renderId) {
        return;
      }

      this.resolvedLocations = resolved;
      if (resolved.length === 0) {
        throw new Error('No map locations could be resolved.');
      }

      const map = new google.maps.Map(canvas, {
        center: resolved[0].position,
        zoom: resolved.length === 1 ? 14 : 12,
        mapId: this.googleMapsService.mapId(),
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: true,
      });
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

      if (resolved.length > 1 && typeof (map as { fitBounds?: unknown }).fitBounds === 'function') {
        (map as { fitBounds: (bounds: unknown, padding?: number) => void }).fitBounds(bounds, 54);
      }
    } catch (error) {
      if (currentRender === this.renderId) {
        this.error = error instanceof Error ? error.message : 'Map could not be loaded.';
        this.resolvedLocations = [];
      }
    } finally {
      if (currentRender === this.renderId) {
        this.isLoading = false;
      }
    }
  }
}
