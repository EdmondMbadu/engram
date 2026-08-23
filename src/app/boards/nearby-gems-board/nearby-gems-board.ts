import { AfterViewInit, Component, ElementRef, ViewChild, computed, effect, inject, input, output, signal } from '@angular/core';
import { GoogleMapsService } from '../../google-maps.service';

export type NearbyGemsSortMode = 'travel-time' | 'distance';
type ViewerLocationState = 'idle' | 'locating' | 'available' | 'unavailable';

export type NearbyGemsBoardCardView = {
  id: string;
  title: string;
  category: string;
  imageUrl: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  measurement: 'route' | 'estimated';
  lat: number | null;
  lng: number | null;
  googleMapsUrl: string;
  originalRank: number;
};

type MapsRuntime = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => {
      fitBounds: (bounds: unknown, padding?: number | Record<string, number>) => void;
      setCenter: (position: { lat: number; lng: number }) => void;
      setZoom: (zoom: number) => void;
      panTo: (position: { lat: number; lng: number }) => void;
    };
    LatLngBounds: new () => {
      extend: (position: { lat: number; lng: number }) => void;
    };
    marker?: {
      AdvancedMarkerElement: new (options: Record<string, unknown>) => {
        map: unknown | null;
        addListener?: (eventName: string, listener: () => void) => void;
      };
    };
  };
};

@Component({
  selector: 'app-nearby-gems-board',
  standalone: true,
  templateUrl: './nearby-gems-board.html',
  styleUrl: './nearby-gems-board.css',
})
export class NearbyGemsBoardComponent implements AfterViewInit {
  private readonly googleMaps = inject(GoogleMapsService);
  private map: InstanceType<MapsRuntime['maps']['Map']> | null = null;
  private markers: Array<InstanceType<NonNullable<MapsRuntime['maps']['marker']>['AdvancedMarkerElement']>> = [];
  private readonly markerElements = new Map<string, HTMLElement>();
  private viewReady = false;

  readonly title = input.required<string>();
  readonly description = input('');
  readonly locationLabel = input('your area');
  readonly visibility = input.required<'public' | 'private'>();
  readonly canEdit = input(false);
  readonly cards = input.required<NearbyGemsBoardCardView[]>();
  readonly travelMode = input<'walking' | 'driving'>('driving');
  readonly defaultSort = input<NearbyGemsSortMode>('travel-time');
  readonly visibilitySaving = input(false);
  readonly statusMessage = input('');

  readonly backRequested = output<void>();
  readonly settingsRequested = output<void>();
  readonly addRequested = output<void>();
  readonly visibilityRequested = output<void>();
  readonly shareRequested = output<void>();
  readonly customUrlRequested = output<void>();

  readonly sortMode = signal<NearbyGemsSortMode>('travel-time');
  readonly activeCardId = signal('');
  readonly mapLoading = signal(true);
  readonly mapUnavailable = signal(false);
  readonly expanded = signal(false);
  readonly viewerLocation = signal<{ lat: number; lng: number } | null>(null);
  readonly viewerLocationState = signal<ViewerLocationState>('idle');

  readonly orderedCards = computed(() => {
    const mode = this.sortMode();
    return [...this.cards()].sort((left, right) => {
      const primaryLeft = mode === 'travel-time' ? left.durationSeconds : left.distanceMeters;
      const primaryRight = mode === 'travel-time' ? right.durationSeconds : right.distanceMeters;
      const primary = this.nullLastNumber(primaryLeft) - this.nullLastNumber(primaryRight);
      if (primary) return primary;
      const secondaryLeft = mode === 'travel-time' ? left.distanceMeters : left.durationSeconds;
      const secondaryRight = mode === 'travel-time' ? right.distanceMeters : right.durationSeconds;
      const secondary = this.nullLastNumber(secondaryLeft) - this.nullLastNumber(secondaryRight);
      if (secondary) return secondary;
      if (left.measurement !== right.measurement) return left.measurement === 'route' ? -1 : 1;
      return left.originalRank - right.originalRank || left.title.localeCompare(right.title);
    });
  });

  readonly visibleCards = computed(() => this.expanded() ? this.orderedCards() : this.orderedCards().slice(0, 4));
  readonly firstCard = computed(() => this.orderedCards()[0] ?? null);
  readonly selectedStartCard = computed(() => {
    const activeId = this.activeCardId();
    return this.orderedCards().find((card) => card.id === activeId) ?? this.firstCard();
  });

  @ViewChild('mapCanvas') private mapCanvas?: ElementRef<HTMLElement>;

  constructor() {
    effect(() => {
      const nextDefault = this.defaultSort();
      this.sortMode.set(nextDefault);
    }, { allowSignalWrites: true });
    effect(() => {
      this.orderedCards();
      this.viewerLocation();
      this.visibility();
      this.canEdit();
      if (this.viewReady) queueMicrotask(() => void this.renderMap());
    });
    effect(() => {
      const mayShowLocation = this.visibility() === 'private' && this.canEdit();
      if (!mayShowLocation) {
        this.viewerLocation.set(null);
        this.viewerLocationState.set('idle');
        return;
      }
      if (this.viewReady && this.viewerLocationState() === 'idle') {
        queueMicrotask(() => this.requestViewerLocation());
      }
    }, { allowSignalWrites: true });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    void this.renderMap();
    if (this.visibility() === 'private' && this.canEdit()) this.requestViewerLocation();
  }

  setSortMode(mode: NearbyGemsSortMode): void {
    this.sortMode.set(mode);
    this.activeCardId.set('');
  }

  selectCard(card: NearbyGemsBoardCardView): void {
    this.activeCardId.set(card.id);
    this.updateActiveMarkerStyles();
    if (this.map && card.lat != null && card.lng != null) {
      this.map.panTo({ lat: card.lat, lng: card.lng });
    }
  }

  selectedStartRank(): number {
    const selected = this.selectedStartCard();
    return selected ? this.rankFor(selected) : 1;
  }

  requestViewerLocation(): void {
    if (this.visibility() !== 'private' || !this.canEdit()) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.viewerLocationState.set('unavailable');
      return;
    }
    if (this.viewerLocationState() === 'locating') return;
    this.viewerLocationState.set('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (this.visibility() !== 'private' || !this.canEdit()) return;
        this.viewerLocation.set({ lat: position.coords.latitude, lng: position.coords.longitude });
        this.viewerLocationState.set('available');
      },
      () => {
        this.viewerLocation.set(null);
        this.viewerLocationState.set('unavailable');
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }

  directionsUrl(card: NearbyGemsBoardCardView | null): string {
    if (!card) return '';
    if (card.lat != null && card.lng != null) {
      const parameters = new URLSearchParams({
        api: '1',
        destination: `${card.lat},${card.lng}`,
        travelmode: this.travelMode(),
      });
      return `https://www.google.com/maps/dir/?${parameters.toString()}`;
    }
    return card.googleMapsUrl;
  }

  durationLabel(seconds: number | null): string {
    if (seconds == null || !Number.isFinite(seconds)) return 'Time unavailable';
    return `${Math.max(1, Math.round(seconds / 60))} min`;
  }

  distanceLabel(meters: number | null): string {
    if (meters == null || !Number.isFinite(meters)) return 'Distance unavailable';
    const miles = meters / 1609.344;
    return `${miles < 0.1 ? miles.toFixed(2) : miles.toFixed(1)} mi`;
  }

  rankFor(card: NearbyGemsBoardCardView): number {
    return this.orderedCards().findIndex((item) => item.id === card.id) + 1;
  }

  private nullLastNumber(value: number | null): number {
    return value == null || !Number.isFinite(value) ? Number.MAX_SAFE_INTEGER : value;
  }

  private async renderMap(): Promise<void> {
    const canvas = this.mapCanvas?.nativeElement;
    if (!canvas) return;
    const cards = this.orderedCards().filter((card) => card.lat != null && card.lng != null);
    if (!cards.length || !this.googleMaps.isConfigured()) {
      this.mapLoading.set(false);
      this.mapUnavailable.set(true);
      return;
    }

    try {
      const google = await this.googleMaps.loadMapLibraries() as unknown as MapsRuntime;
      if (!this.map) {
        this.map = new google.maps.Map(canvas, {
          mapId: this.googleMaps.mapId(),
          center: { lat: cards[0].lat, lng: cards[0].lng },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'cooperative',
          disableDefaultUI: false,
        });
      }

      this.markers.forEach((marker) => { marker.map = null; });
      this.markers = [];
      this.markerElements.clear();
      const bounds = new google.maps.LatLngBounds();
      const Marker = google.maps.marker?.AdvancedMarkerElement;
      cards.forEach((card, index) => {
        const position = { lat: card.lat as number, lng: card.lng as number };
        bounds.extend(position);
        if (!Marker) return;
        const content = document.createElement('button');
        content.type = 'button';
        content.className = 'nearby-gems-map-marker';
        content.textContent = String(index + 1);
        content.title = `${index + 1}. ${card.title}`;
        content.setAttribute('aria-label', `${index + 1}. ${card.title}, ${this.durationLabel(card.durationSeconds)}, ${this.distanceLabel(card.distanceMeters)}`);
        content.classList.toggle('nearby-gems-map-marker--active', this.activeCardId() === card.id || (!this.activeCardId() && index === 0));
        content.addEventListener('click', () => this.selectCard(card));
        const marker = new Marker({ map: this.map, position, content, title: content.title });
        marker.addListener?.('click', () => this.selectCard(card));
        this.markers.push(marker);
        this.markerElements.set(card.id, content);
      });
      const viewerLocation = this.visibility() === 'private' && this.canEdit() ? this.viewerLocation() : null;
      if (viewerLocation) {
        bounds.extend(viewerLocation);
        if (Marker) {
          const content = document.createElement('span');
          content.className = 'nearby-gems-map-marker-you material-symbols-outlined';
          content.textContent = 'my_location';
          content.title = 'You are here · live location is not saved';
          const marker = new Marker({ map: this.map, position: viewerLocation, content, title: content.title });
          this.markers.push(marker);
        }
      }
      if (cards.length === 1 && !viewerLocation) {
        this.map.setCenter({ lat: cards[0].lat as number, lng: cards[0].lng as number });
        this.map.setZoom(14);
      } else {
        this.map.fitBounds(bounds, { top: 74, right: 64, bottom: 96, left: 64 });
      }
      this.mapUnavailable.set(false);
    } catch {
      this.mapUnavailable.set(true);
    } finally {
      this.mapLoading.set(false);
    }
  }

  private updateActiveMarkerStyles(): void {
    const activeId = this.activeCardId() || this.firstCard()?.id || '';
    this.markerElements.forEach((element, cardId) => {
      element.classList.toggle('nearby-gems-map-marker--active', cardId === activeId);
    });
  }
}
