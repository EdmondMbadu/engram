import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { geoPath } from 'd3-geo';
import { geoAirocean } from 'd3-geo-polygon';
import { feature as topojsonFeature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';
import { AccountMenuComponent } from '../account-menu/account-menu';

interface DymaxionCity {
  name: string;
  country: string;
  region: RegionId;
  lat: number;
  lng: number;
  slug: string;
  timezone: string | null;
  population: number | null;
  populationYear: number | null;
  imageUrl: string | null;
  description: string | null;
  x: number; // percent position on the 1000x475 map image
  y: number;
}

type RegionId =
  | 'north-america'
  | 'south-america'
  | 'europe'
  | 'africa'
  | 'asia'
  | 'oceania';

interface Region {
  id: RegionId;
  label: string;
}

interface Focus {
  id: string;
  label: string;
  region?: RegionId;
  box?: [number, number, number, number]; // [x0,y0,x1,y1] in % of the map
}

interface MarkerEntry {
  c: DymaxionCity;
  b: HTMLButtonElement;
}

interface DymaxionCountry {
  id: string;
  name: string;
  key: string;
  d: string;
  box: [number, number, number, number];
  centroid: [number, number];
  cities: DymaxionCity[];
  el: SVGPathElement | null;
}

interface ProjectionFrame {
  path: ReturnType<typeof geoPath>;
  transform: string;
  place(lng: number, lat: number): { x: number; y: number } | null;
  bounds(geometry: Feature<Geometry>): [number, number, number, number] | null;
  centroid(geometry: Feature<Geometry>): [number, number] | null;
}

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  tx: number;
  ty: number;
  moved: boolean;
}

interface CityTemperatureReading {
  fahrenheit: number;
  fetchedAt: string;
}

interface OpenMeteoLocationResponse {
  current?: {
    temperature_2m?: number | null;
    time?: string | null;
  } | null;
}

const REGIONS: Region[] = [
  { id: 'north-america', label: 'N. America' },
  { id: 'south-america', label: 'S. America' },
  { id: 'europe', label: 'Europe' },
  { id: 'africa', label: 'Africa' },
  { id: 'asia', label: 'Asia' },
  { id: 'oceania', label: 'Oceania' },
];

// Sub-zooms use a fixed box (the projected geographic extent of that area, in
// % of the map) — carried over from the prototype's Fuller-projected values.
const SUB_FOCI: Focus[] = [
  { id: 'middle-east', label: 'Middle East', box: [27, 18, 39.5, 40] },
  { id: 'japan', label: 'Japan', box: [36.5, 65, 42, 77.5] },
  { id: 'us-east', label: 'US East Coast', box: [58.9, 39.2, 64.2, 43.2] },
];

const MAX_Z = 4.6; // region buttons
const MAX_DRILL = 80; // cluster drill-down; high enough to separate tight city groups
const MAX_COUNTRY_Z = 8.2; // country boundary drill-down
const PAD = 0.22;
const CLUSTER_TH = 28; // px: world-view cluster radius
const MIN_CLUSTER_TH = 10; // px: deep-zoom cluster radius
const MAP_W = 1000;
const MAP_H = 475;
const SVG_NS = 'http://www.w3.org/2000/svg';
const COUNTRY_TOPOLOGY_URL = '/assets/maps/countries-50m.json';
const COUNTRY_ALIASES: Record<string, string> = {
  'czech-republic': 'czechia',
  'democratic-republic-of-the-congo': 'dem-rep-congo',
  drc: 'dem-rep-congo',
  'south-korea': 'south-korea',
  'turks-and-caicos-islands': 'turks-and-caicos-is',
  'united-states': 'united-states-of-america',
  usa: 'united-states-of-america',
};

@Component({
  selector: 'app-dymaxion',
  imports: [RouterLink, ThemeToggleComponent, FormsModule, WorkspaceSidebarComponent, AccountMenuComponent],
  templateUrl: './dymaxion.html',
  styleUrl: './dymaxion.css',
  // Markers/clusters are created imperatively via document.createElement, so they
  // never receive Angular's _ngcontent scoping attribute. Disable encapsulation
  // so the map-chrome CSS reaches them. All selectors are scoped under .dym-* to
  // avoid leaking globally.
  encapsulation: ViewEncapsulation.None,
})
export class DymaxionComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  @ViewChild('frame') frameRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLDivElement>;
  @ViewChild('countryLayer') countryLayerRef!: ElementRef<SVGSVGElement>;
  @ViewChild('clusterLayer') clusterLayerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('picker') pickerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('zoomout') zoomoutRef!: ElementRef<HTMLButtonElement>;
  @ViewChild('hint') hintRef!: ElementRef<HTMLDivElement>;

  readonly isLoading = signal(true);
  readonly cityDataLoading = signal(true);
  readonly cityCount = signal(0);
  readonly shownCount = signal(0);
  readonly foci = signal<Focus[]>([]);
  readonly activeFocus = signal<string>('all');
  readonly searchValue = signal('');
  readonly selected = signal<DymaxionCity | null>(null);
  readonly selectedCountry = signal<DymaxionCountry | null>(null);
  readonly cityTemperatures = signal<Record<string, CityTemperatureReading>>({});
  readonly temperatureLoadingSlug = signal<string | null>(null);
  readonly now = signal(new Date());
  readonly isSignedIn = this.authService.isAuthenticated;

  private cities: DymaxionCity[] = [];
  private countries: DymaxionCountry[] = [];
  private countriesByKey = new Map<string, DymaxionCountry>();
  private countryLayerTransform = '';
  private projectionFrame: ProjectionFrame | null = null;
  private markerEls: MarkerEntry[] = [];
  private view = { z: 1, tx: 0, ty: 0 };
  private panState: PanState | null = null;
  private suppressMapClick = false;
  private query = '';
  private viewReady = false;
  private viewInited = false;
  private dataReady = false;
  private clockTimer: number | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onResize = () => {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.applyFilter(), 150);
  };
  private readonly onDocClick = (e: MouseEvent) => {
    const picker = this.pickerRef?.nativeElement;
    const target = e.target as HTMLElement;
    if (picker && !picker.contains(target) && !target.closest('.cluster')) {
      this.closePicker();
    }
  };
  private readonly onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.closePicker();
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.panState || !this.viewReady || event.pointerId !== this.panState.pointerId) {
      return;
    }
    const frame = this.frameRef.nativeElement;
    if (Math.hypot(event.clientX - this.panState.startX, event.clientY - this.panState.startY) > 3) {
      this.panState.moved = true;
      event.preventDefault();
    }
    const dx = (event.clientX - this.panState.startX) / frame.clientWidth;
    const dy = (event.clientY - this.panState.startY) / frame.clientHeight;
    this.setView(this.view.z, this.panState.tx + dx, this.panState.ty + dy);
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    if (!this.panState || event.pointerId !== this.panState.pointerId) return;
    const moved = this.panState.moved;
    this.panState = null;
    if (moved) {
      this.suppressMapClick = true;
      window.setTimeout(() => {
        this.suppressMapClick = false;
      }, 250);
    }
    this.applyView();
  };

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) {
      this.isLoading.set(false);
      this.cityDataLoading.set(false);
      return;
    }
    void this.loadCountries();
    this.refreshFoci();
    this.isLoading.set(false);
    this.dataReady = true;
    this.tryInitMap();
    this.clockTimer = window.setInterval(() => this.now.set(new Date()), 60000);
    void this.loadCities();
  }

  private async loadCities(): Promise<void> {
    this.cityDataLoading.set(true);
    try {
      const atlases = await this.atlasService.listPublicAtlases();
      this.cities = this.buildCities(atlases);
    } catch {
      this.cities = [];
    }

    this.cityCount.set(this.cities.length);
    this.refreshFoci();
    this.attachCitiesToCountries();
    this.renderCountryLayer();
    if (this.viewReady) {
      this.rebuildMarkers();
    }
    this.cityDataLoading.set(false);
  }

  private refreshFoci(): void {
    const regionsWithCities = REGIONS.filter((r) =>
      this.cities.some((c) => c.region === r.id),
    );
    this.foci.set([
      { id: 'all', label: 'World' },
      ...regionsWithCities.map((r) => ({ id: r.id, label: r.label, region: r.id })),
      ...SUB_FOCI,
    ]);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.viewInited = true;
    this.tryInitMap();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    document.addEventListener('click', this.onDocClick);
    document.addEventListener('keydown', this.onKeydown);
  }

  // Inject markers only once BOTH the view (@ViewChild refs) and the async city
  // data are ready — whichever lifecycle hook finishes last triggers it.
  private tryInitMap(): void {
    if (this.viewReady || !this.viewInited || !this.dataReady) return;
    this.initMap();
  }

  ngOnDestroy(): void {
    if (!this.isBrowser) return;
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    document.removeEventListener('click', this.onDocClick);
    document.removeEventListener('keydown', this.onKeydown);
  }

  /* ===================== DATA ===================== */

  private buildCities(atlases: AtlasItem[]): DymaxionCity[] {
    const frame = this.createProjectionFrame();

    const cities: DymaxionCity[] = [];
    for (const atlas of atlases) {
      const cfg = atlas.city_config;
      const lat = cfg?.latitude;
      const lng = cfg?.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      const pos = frame.place(lng, lat);
      if (!pos) continue;

      const name = (cfg?.city_name?.trim() || atlas.name || '')
        .replace(/^Living\s*Wiki:\s*/i, '')
        .trim();
      if (!name) continue;

      cities.push({
        name,
        country: this.atlasService.cityCountryLabel(atlas) ?? cfg?.region_name ?? '',
        region: this.bucketRegion(cfg?.region_name, this.atlasService.cityCountryLabel(atlas)),
        lat,
        lng,
        slug: atlas.slug,
        timezone: cfg?.timezone ?? null,
        population: cfg?.metadata?.population ?? null,
        populationYear: cfg?.metadata?.population_year ?? null,
        imageUrl: atlas.hero_url || atlas.chat_guide?.banner_url || atlas.chat_guide?.image_url || atlas.logo_url || null,
        description: atlas.description || null,
        x: pos.x,
        y: pos.y,
      });
    }
    cities.sort((a, b) => a.name.localeCompare(b.name));
    return cities;
  }

  private async loadCountries(): Promise<void> {
    try {
      const response = await fetch(COUNTRY_TOPOLOGY_URL);
      if (!response.ok) {
        throw new Error(`Country topology request failed: ${response.status}`);
      }
      const topology = await response.json() as { objects?: Record<string, unknown> };
      const countriesObject = topology.objects?.['countries'];
      if (!countriesObject) {
        throw new Error('Country topology is missing countries object.');
      }

      const converted = topojsonFeature<Geometry, { name?: string }>(topology, countriesObject);
      if (converted.type !== 'FeatureCollection') {
        return;
      }

      const collection = converted as FeatureCollection<Geometry, { name?: string }>;
      const frame = this.createProjectionFrame();
      this.countryLayerTransform = frame.transform;
      this.countries = collection.features
        .map((country, index): DymaxionCountry | null => {
          const name = country.properties?.name?.trim();
          if (!name) return null;
          const d = frame.path(country) ?? '';
          const box = frame.bounds(country);
          const centroid = frame.centroid(country);
          if (!d || !box || !centroid) return null;
          return {
            id: `${country.id ?? index}`,
            name,
            key: countryKey(name),
            d,
            box,
            centroid,
            cities: [],
            el: null,
          };
        })
        .filter((country): country is DymaxionCountry => !!country);
      this.countriesByKey = new Map(this.countries.map((country) => [country.key, country]));
      this.attachCitiesToCountries();
      this.renderCountryLayer();
      this.applyFilter();
    } catch {
      // The city marker map is still usable if the optional country topology is
      // unavailable; the UI simply falls back to city-only clusters.
      this.countries = [];
      this.countriesByKey.clear();
    }
  }

  private createProjectionFrame(): ProjectionFrame {
    if (this.projectionFrame) return this.projectionFrame;

    const projection = geoAirocean();
    const path = geoPath(projection);
    const [[bx0, by0], [bx1, by1]] = path.bounds({ type: 'Sphere' });
    const sx = MAP_W / (bx1 - bx0);
    const sy = MAP_H / (by1 - by0);
    const toPercent = ([px, py]: [number, number]) => ({
      x: ((px - bx0) * sx) / MAP_W * 100,
      y: ((py - by0) * sy) / MAP_H * 100,
    });

    this.projectionFrame = {
      path,
      transform: `matrix(${sx} 0 0 ${sy} ${-bx0 * sx} ${-by0 * sy})`,
      place: (lng: number, lat: number) => {
        const projected = projection([lng, lat]);
        if (!projected) return null;
        return toPercent(projected as [number, number]);
      },
      bounds: (geometry: Feature<Geometry>) => {
        const [[x0, y0], [x1, y1]] = path.bounds(geometry);
        if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
        const p0 = toPercent([x0, y0]);
        const p1 = toPercent([x1, y1]);
        return [p0.x, p0.y, p1.x, p1.y];
      },
      centroid: (geometry: Feature<Geometry>) => {
        const [x, y] = path.centroid(geometry);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const p = toPercent([x, y]);
        return [p.x, p.y];
      },
    };
    return this.projectionFrame;
  }

  private attachCitiesToCountries(): void {
    this.countries.forEach((country) => {
      country.cities = [];
    });

    for (const city of this.cities) {
      const country = this.countriesByKey.get(countryKey(city.country));
      if (country) {
        country.cities.push(city);
      }
    }

    this.countries.forEach((country) => {
      country.cities.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  // Bucket a city into one of the six map regions, used only for the zoom chips.
  // region_name/country_code data is noisy, so derive from lat/lng-free hints
  // and fall back to longitude/latitude bands via the city's known region label.
  private bucketRegion(regionName?: string | null, countryLabel?: string | null): RegionId {
    const hay = `${regionName ?? ''} ${countryLabel ?? ''}`.toLowerCase();
    const has = (...needles: string[]) => needles.some((n) => hay.includes(n));

    if (
      has(
        'canada', 'united states', 'usa', 'mexico', 'puerto rico', 'turks',
      ) || this.isUsStateOrProvince(regionName)
    ) {
      return 'north-america';
    }
    if (has('brazil', 'argentina', 'chile', 'peru', 'colombia', 'bolivia', 'uruguay', 'ecuador', 'paraguay', 'venezuela')) {
      return 'south-america';
    }
    if (
      has(
        'united kingdom', 'ireland', 'france', 'spain', 'portugal', 'italy', 'germany',
        'netherlands', 'belgium', 'austria', 'switzerland', 'czech', 'hungary', 'poland',
        'greece', 'denmark', 'norway', 'sweden', 'finland',
      )
    ) {
      return 'europe';
    }
    if (
      has(
        'egypt', 'morocco', 'ghana', 'nigeria', 'kenya', 'congo', 'south africa',
      )
    ) {
      return 'africa';
    }
    if (
      has(
        'australia', 'new zealand',
      )
    ) {
      return 'oceania';
    }
    // Israel, UAE, Qatar, Turkey, India, Thailand, Singapore, China, Japan,
    // Korea, Taiwan, etc.
    return 'asia';
  }

  private isUsStateOrProvince(regionName?: string | null): boolean {
    const r = (regionName ?? '').toLowerCase();
    const states = [
      'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
      'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
      'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine',
      'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
      'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
      'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
      'oklahoma', 'oregon', 'pennsylvania', 'pa', 'rhode island', 'south carolina',
      'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia',
      'washington', 'west virginia', 'wisconsin', 'wyoming',
    ];
    return states.includes(r);
  }

  /* ===================== MAP INIT ===================== */

  private initMap(): void {
    if (!this.frameRef || !this.canvasRef) return;
    this.renderCountryLayer();
    this.viewReady = true;
    this.rebuildMarkers();
  }

  private rebuildMarkers(): void {
    if (!this.canvasRef || !this.clusterLayerRef) return;
    const canvas = this.canvasRef.nativeElement;
    this.markerEls.forEach(({ b }) => b.remove());
    this.clusterLayerRef.nativeElement.innerHTML = '';

    this.markerEls = this.cities.map((c, i) => {
      const b = document.createElement('button');
      b.className = 'marker';
      b.type = 'button';
      b.style.left = c.x + '%';
      b.style.top = c.y + '%';
      b.style.animationDelay = i * 18 + 'ms';
      b.setAttribute('aria-label', `${c.name}, ${c.country}`);
      b.innerHTML =
        `<span class="ring"></span><span class="dot"></span>` +
        `<span class="label"><b>${escapeHtml(c.name)}</b>` +
        `<span class="lc">${escapeHtml(c.country)}</span></span>`;
      b.addEventListener('click', () => this.selectCity(c, b));
      canvas.appendChild(b);
      return { c, b };
    });

    this.applyFilter();
  }

  /* ===================== ZOOM ENGINE ===================== */

  private regionBBox(region: RegionId): [number, number, number, number] {
    const p = this.cities.filter((c) => c.region === region);
    return [
      Math.min(...p.map((c) => c.x)),
      Math.min(...p.map((c) => c.y)),
      Math.max(...p.map((c) => c.x)),
      Math.max(...p.map((c) => c.y)),
    ];
  }

  private applyZoom(box: [number, number, number, number], cap = MAX_Z): void {
    let [x0, y0, x1, y1] = box.map((v) => v / 100) as [number, number, number, number];
    let bw = x1 - x0;
    let bh = y1 - y0;
    x0 -= bw * PAD;
    x1 += bw * PAD;
    y0 -= bh * PAD;
    y1 += bh * PAD;
    bw = x1 - x0;
    bh = y1 - y0;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    let z = Math.min(1 / bw, 1 / bh);
    z = Math.max(1, Math.min(cap, z));
    let tx = 0.5 - cx * z;
    let ty = 0.5 - cy * z;
    this.setView(z, tx, ty);
  }

  private resetZoom(): void {
    this.setView(1, 0, 0);
  }

  zoomBy(factor: number): void {
    if (!this.viewReady) return;
    this.zoomAt(0.5, 0.5, factor);
  }

  onMapWheel(event: WheelEvent): void {
    if (!this.viewReady) return;
    event.preventDefault();
    if (
      this.view.z > 1.01 &&
      Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.15
    ) {
      const frame = this.frameRef.nativeElement;
      this.setView(
        this.view.z,
        this.view.tx - event.deltaX / frame.clientWidth,
        this.view.ty - event.deltaY / frame.clientHeight,
      );
      this.closePicker();
      return;
    }
    const rect = this.frameRef.nativeElement.getBoundingClientRect();
    const sx = this.clamp01((event.clientX - rect.left) / rect.width);
    const sy = this.clamp01((event.clientY - rect.top) / rect.height);
    const factor = Math.exp(-event.deltaY * 0.0014);
    this.zoomAt(sx, sy, factor);
  }

  onMapPointerDown(event: PointerEvent): void {
    if (!this.viewReady || this.view.z <= 1.01 || event.button !== 0) return;
    const target = event.target as Element | null;
    if (
      target?.closest(
        'button, a, input, .marker, .cluster, .dym-picker, .dym-zoom-controls',
      )
    ) {
      return;
    }
    this.closePicker();
    this.panState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      tx: this.view.tx,
      ty: this.view.ty,
      moved: false,
    };
    this.frameRef.nativeElement.setPointerCapture?.(event.pointerId);
    if (target?.closest('.country-shape')) {
      event.preventDefault();
    }
    this.applyView();
  }

  private zoomAt(sx: number, sy: number, factor: number): void {
    const z = Math.max(1, Math.min(MAX_DRILL, this.view.z * factor));
    const wx = (sx - this.view.tx) / this.view.z;
    const wy = (sy - this.view.ty) / this.view.z;
    this.setView(z, sx - wx * z, sy - wy * z);
    this.closePicker();
    if (this.hintRef) this.hintRef.nativeElement.style.opacity = '0';
    this.applyFilter();
  }

  private setView(z: number, tx: number, ty: number): void {
    const clampedZ = Math.max(1, Math.min(MAX_DRILL, z));
    const [clampedTx, clampedTy] = this.clampPan(clampedZ, tx, ty);
    this.view = { z: clampedZ, tx: clampedTx, ty: clampedTy };
    this.applyView();
  }

  private applyView(): void {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    canvas.style.setProperty('--z', String(this.view.z));
    canvas.style.transform = `translate(${this.view.tx * 100}%, ${this.view.ty * 100}%) scale(${this.view.z})`;

    const frame = this.frameRef?.nativeElement;
    if (frame) {
      frame.classList.toggle('is-zoomed', this.view.z > 1.01);
      frame.classList.toggle('detail-mid', this.view.z >= 3);
      frame.classList.toggle('detail-deep', this.view.z >= 8);
      frame.classList.toggle('detail-labels', this.view.z >= 12);
      frame.classList.toggle('dragging', !!this.panState);
    }
    this.zoomoutRef?.nativeElement.classList.toggle('show', this.view.z > 1.01);
    this.scheduleAutoLabels();
  }

  private clampPan(z: number, tx: number, ty: number): [number, number] {
    if (z <= 1.01) return [0, 0];
    return [
      Math.min(0, Math.max(1 - z, tx)),
      Math.min(0, Math.max(1 - z, ty)),
    ];
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private scheduleAutoLabels(): void {
    if (!this.isBrowser || !this.viewReady) return;
    window.requestAnimationFrame(() => this.updateAutoLabels());
  }

  private updateAutoLabels(): void {
    if (!this.frameRef || !this.markerEls.length) return;
    this.markerEls.forEach((m) => m.b.classList.remove('auto-label'));
    if (this.view.z < 12) return;

    const frameRect = this.frameRef.nativeElement.getBoundingClientRect();
    const placed: DOMRect[] = [];
    const candidates = this.markerEls
      .filter((m) => {
        if (!this.inFocus(m.c)) return false;
        if (m.b.classList.contains('clustered') || m.b.classList.contains('dim')) return false;
        const markerRect = m.b.getBoundingClientRect();
        return (
          markerRect.right >= frameRect.left &&
          markerRect.left <= frameRect.right &&
          markerRect.bottom >= frameRect.top &&
          markerRect.top <= frameRect.bottom
        );
      })
      .sort((a, b) => {
        const aPinned = a.b.classList.contains('pinned') || a.b.classList.contains('sel');
        const bPinned = b.b.classList.contains('pinned') || b.b.classList.contains('sel');
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        return a.c.name.localeCompare(b.c.name);
      });

    for (const candidate of candidates) {
      const label = candidate.b.querySelector<HTMLElement>('.label');
      if (!label) continue;
      const rect = label.getBoundingClientRect();
      const padded = new DOMRect(rect.x - 5, rect.y - 4, rect.width + 10, rect.height + 8);
      if (
        padded.left < frameRect.left + 6 ||
        padded.right > frameRect.right - 6 ||
        padded.top < frameRect.top + 6 ||
        padded.bottom > frameRect.bottom - 6
      ) {
        continue;
      }
      if (placed.some((r) => this.rectsOverlap(r, padded))) continue;
      candidate.b.classList.add('auto-label');
      placed.push(padded);
    }
  }

  private rectsOverlap(a: DOMRect, b: DOMRect): boolean {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  setFocus(f: Focus): void {
    // Toggle back to world when clicking the active non-world chip.
    if (this.activeFocus() === f.id && f.id !== 'all') {
      f = { id: 'all', label: 'World' };
    }
    this.activeFocus.set(f.id);
    this.selectedCountry.set(null);
    if (this.hintRef) this.hintRef.nativeElement.style.opacity = '0';
    if (!this.viewReady) return;
    if (f.id === 'all') this.resetZoom();
    else if (f.box) this.applyZoom(f.box);
    else if (f.region) this.applyZoom(this.regionBBox(f.region));
    this.applyFilter();
  }

  resetToWorld(): void {
    this.setFocus({ id: 'all', label: 'World' });
  }

  private inFocus(c: DymaxionCity): boolean {
    const selectedCountry = this.selectedCountry();
    if (selectedCountry && countryKey(c.country) !== selectedCountry.key) {
      return false;
    }

    const id = this.activeFocus();
    if (id === 'all') return true;
    const f = this.foci().find((x) => x.id === id);
    if (!f) return true;
    if (f.region) return c.region === f.region;
    if (f.box) {
      const [x0, y0, x1, y1] = f.box;
      return c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1;
    }
    return true;
  }

  /* ===================== CLUSTERING + RENDER ===================== */

  private screenPos(c: DymaxionCity): { fx: number; fy: number } {
    return {
      fx: this.view.tx + (c.x / 100) * this.view.z,
      fy: this.view.ty + (c.y / 100) * this.view.z,
    };
  }

  private computeClusters(): { m: MarkerEntry; sx: number; sy: number }[][] {
    const frame = this.frameRef.nativeElement;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const clusterThreshold = Math.max(
      MIN_CLUSTER_TH,
      CLUSTER_TH / Math.sqrt(Math.max(1, this.view.z)),
    );
    const items = this.markerEls
      .filter((m) => this.inFocus(m.c))
      .map((m) => {
        const { fx, fy } = this.screenPos(m.c);
        return { m, sx: fx * fw, sy: fy * fh };
      });
    const used = new Set<number>();
    const clusters: { m: MarkerEntry; sx: number; sy: number }[][] = [];

    // While searching, any matched city stays its own standalone point — never
    // swallowed into a cluster pip — so you can see exactly which dot it is.
    if (this.query) {
      for (let i = 0; i < items.length; i++) {
        if (this.match(items[i].m.c)) {
          used.add(i);
          clusters.push([items[i]]);
        }
      }
    }

    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      used.add(i);
      const g = [items[i]];
      let cx = items[i].sx;
      let cy = items[i].sy;
      for (let j = 0; j < items.length; j++) {
        if (used.has(j)) continue;
        if (Math.hypot(items[j].sx - cx, items[j].sy - cy) < clusterThreshold) {
          used.add(j);
          g.push(items[j]);
          cx = g.reduce((s, k) => s + k.sx, 0) / g.length;
          cy = g.reduce((s, k) => s + k.sy, 0) / g.length;
        }
      }
      clusters.push(g);
    }
    return clusters;
  }

  private applyFilter(): void {
    if (!this.viewReady) return;
    this.closePicker();
    this.syncCountryLayerState();
    const clusterLayer = this.clusterLayerRef.nativeElement;
    clusterLayer.innerHTML = '';
    this.markerEls.forEach((m) => {
      // Dim anything out of the active region focus, and — when searching —
      // anything that doesn't match the query, so the hits stand out.
      const dim = !this.inFocus(m.c) || (!!this.query && !this.match(m.c));
      m.b.classList.toggle('dim', dim);
      m.b.classList.remove('clustered');
    });
    this.computeClusters().forEach((g) => {
      if (g.length > 1) {
        g.forEach((k) => k.m.b.classList.add('clustered'));
        const members = g.map((k) => k.m.c);
        const cx = members.reduce((s, c) => s + c.x, 0) / members.length;
        const cy = members.reduce((s, c) => s + c.y, 0) / members.length;
        const pip = document.createElement('button');
        pip.className = 'cluster';
        pip.type = 'button';
        pip.style.left = cx + '%';
        pip.style.top = cy + '%';
        if (this.query && members.some((c) => this.match(c))) pip.classList.add('hl');
        pip.innerHTML = `<span class="cnum">${g.length}</span>`;
        pip.title = members.map((c) => c.name).join(' · ');
        pip.setAttribute(
          'aria-label',
          `${g.length} cities here: ${members.map((c) => c.name).join(', ')}. Activate to zoom in or choose one.`,
        );
        pip.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.clusterClick(members, pip);
        });
        clusterLayer.appendChild(pip);
      }
    });
    this.markerEls.forEach((m) => {
      const isMatch =
        !!this.query &&
        this.match(m.c) &&
        !m.b.classList.contains('clustered') &&
        this.inFocus(m.c);
      // Matched markers pulse (.hl) AND show their name label pinned to the
      // point (.pinned) so you can read which dot it is without hovering.
      m.b.classList.toggle('hl', isMatch);
      m.b.classList.toggle('pinned', isMatch);
    });
    this.shownCount.set(this.markerEls.filter((m) => this.inFocus(m.c)).length);
    this.scheduleAutoLabels();
  }

  private match(c: DymaxionCity): boolean {
    return !this.query || (c.name + ' ' + c.country).toLowerCase().includes(this.query);
  }

  private clusterClick(members: DymaxionCity[], pip: HTMLButtonElement): void {
    const frame = this.frameRef.nativeElement;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    let minFrac = 1e9;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const dx = ((members[i].x - members[j].x) / 100) * fw;
        const dy = ((members[i].y - members[j].y) / 100) * fh;
        minFrac = Math.min(minFrac, Math.hypot(dx, dy));
      }
    }
    const xs = members.map((c) => c.x);
    const ys = members.map((c) => c.y);
    const box: [number, number, number, number] = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];
    if (minFrac > 0 && this.view.z < MAX_DRILL - 0.1) {
      this.applyZoom(box, MAX_DRILL);
      this.applyFilter();
      return;
    }

    // Last resort for identical or still-overlapping coordinates: keep the
    // choice on top of the map instead of sending users to a country list.
    this.openPicker(members);
  }

  private renderCountryLayer(): void {
    if (!this.countryLayerRef || this.countries.length === 0 || !this.countryLayerTransform) {
      return;
    }

    const layer = this.countryLayerRef.nativeElement;
    layer.innerHTML = '';
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('transform', this.countryLayerTransform);

    for (const country of this.countries) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', country.d);
      path.setAttribute('class', 'country-shape');
      path.setAttribute('role', 'button');
      path.setAttribute('tabindex', '0');
      path.setAttribute(
        'aria-label',
        country.cities.length > 0
          ? `${country.name}, ${country.cities.length} city wikis`
          : `${country.name}, no city wikis yet`,
      );
      path.addEventListener('click', (event) => {
        event.stopPropagation();
        if (this.suppressMapClick) return;
        this.selectCountry(country);
      });
      path.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.selectCountry(country);
        }
      });
      country.el = path;
      group.appendChild(path);
    }

    layer.appendChild(group);
    this.syncCountryLayerState();
  }

  private syncCountryLayerState(): void {
    const selectedCountry = this.selectedCountry();
    for (const country of this.countries) {
      if (!country.el) continue;
      const active = selectedCountry?.key === country.key;
      const populated = country.cities.length > 0;
      country.el.classList.toggle('active', active);
      country.el.classList.toggle('has-cities', populated);
      country.el.classList.toggle('muted', !!selectedCountry && !active);
    }
  }

  /* ===================== PICKER POPOVER ===================== */

  private openPicker(members: DymaxionCity[]): void {
    const picker = this.pickerRef.nativeElement;
    const frame = this.frameRef.nativeElement;
    picker.innerHTML =
      `<div class="phead"><span>${members.length} cities here</span>` +
      `<button class="pclose" type="button" aria-label="Close">×</button></div>` +
      members
        .map(
          (c, i) =>
            `<button class="pitem" type="button" data-i="${i}">${escapeHtml(c.name)}` +
            `<span class="pc">${escapeHtml(c.country)}</span></button>`,
        )
        .join('');
    const fr = frame.getBoundingClientRect();
    const st = (frame.parentElement as HTMLElement).getBoundingClientRect();
    const cx = members.reduce((s, c) => s + c.x, 0) / members.length;
    const cy = members.reduce((s, c) => s + c.y, 0) / members.length;
    const sxFrac = this.view.tx + (cx / 100) * this.view.z;
    const syFrac = this.view.ty + (cy / 100) * this.view.z;
    let left = fr.left - st.left + sxFrac * fr.width;
    const top = fr.top - st.top + syFrac * fr.height + 16;
    left = Math.max(120, Math.min(st.width - 120, left));
    picker.style.left = left + 'px';
    picker.style.top = top + 'px';
    picker.classList.add('show');
    picker.querySelector('.pclose')?.addEventListener('click', () => this.closePicker());
    picker.querySelectorAll<HTMLButtonElement>('.pitem').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = members[Number(btn.dataset['i'])];
        const me = this.markerEls.find((m) => m.c === c);
        this.closePicker();
        this.selectCity(c, me ? me.b : null);
      });
    });
  }

  private closePicker(): void {
    this.pickerRef?.nativeElement.classList.remove('show');
  }

  /* ===================== SEARCH ===================== */

  onSearch(value: string): void {
    this.searchValue.set(value);
    this.query = value.trim().toLowerCase();
    this.selectedCountry.set(null);

    // Clearing the box: drop any region focus, zoom back to the world.
    if (!this.query) {
      this.activeFocus.set('all');
      if (this.viewReady) this.resetZoom();
      this.applyFilter();
      return;
    }

    // Leaving a region focus while searching so every match can show.
    if (this.activeFocus() !== 'all') {
      this.activeFocus.set('all');
    }

    // Pinpoint the FIRST match (cities are sorted alphabetically) so there is
    // always one clear target. Zoom tight on that single point — its dot pops
    // out of any cluster and shows its label (see applyFilter/.pinned).
    const matches = this.cities.filter((c) => this.match(c));
    if (this.viewReady && matches.length > 0) {
      const target = matches[0];
      // A tiny box around the point → applyZoom centers on it at the cap.
      this.applyZoom([target.x, target.y, target.x, target.y], 3.4);
    } else if (this.viewReady) {
      this.resetZoom();
    }
    if (this.hintRef) this.hintRef.nativeElement.style.opacity = '0';
    this.applyFilter();
  }

  /* ===================== SELECT A CITY ===================== */

  private selectCity(c: DymaxionCity, b: HTMLButtonElement | null): void {
    this.selected.set(c);
    this.selectedCountry.set(null);
    void this.ensureTemperature(c);
    this.markerEls.forEach((m) => m.b.classList.toggle('sel', m.b === b));
    if (this.hintRef) this.hintRef.nativeElement.style.opacity = '0';
    // Let the panel render, then bring it into view.
    setTimeout(() => {
      document.getElementById('dymaxion-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 0);
  }

  private selectCountry(country: DymaxionCountry): void {
    this.selected.set(null);
    this.markerEls.forEach((m) => m.b.classList.remove('sel'));
    this.selectedCountry.set(country);
    this.activeFocus.set('all');
    this.applyZoom(country.box, MAX_COUNTRY_Z);
    if (this.hintRef) this.hintRef.nativeElement.style.opacity = '0';
    this.applyFilter();
  }

  openSelected(): void {
    const c = this.selected();
    if (c) this.router.navigate(['/chat', c.slug]);
  }

  /* ===================== TEMPLATE HELPERS ===================== */

  fmtLat(v: number): string {
    return `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}`;
  }
  fmtLng(v: number): string {
    return `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'W'}`;
  }
  fmtPopulation(c: DymaxionCity): string {
    if (!c.population) {
      return 'Not available';
    }
    const value = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(c.population);
    return c.populationYear ? `${value} (${c.populationYear})` : value;
  }
  regionLabel(id: RegionId): string {
    return REGIONS.find((r) => r.id === id)?.label ?? id;
  }

  cityTitle(c: DymaxionCity): string {
    return `${c.name}, ${c.country}`;
  }

  cityImageAlt(c: DymaxionCity): string {
    return `${c.name} city profile image`;
  }

  identityLine(c: DymaxionCity): string {
    const description = c.description?.trim();
    if (description && !this.isProductDescription(description)) {
      return description;
    }
    return `A practical snapshot of ${c.name}: local knowledge, civic updates, transit, culture, climate, jobs, food, and neighborhood context.`;
  }

  cityTags(c: DymaxionCity): string[] {
    const tags = ['Local knowledge', 'Transit', 'Culture', 'Jobs', 'Food', 'Neighborhoods'];
    if (c.population && c.population >= 5_000_000) {
      return ['Major metro', ...tags.slice(0, 5)];
    }
    if (c.population && c.population < 500_000) {
      return ['Local scale', ...tags.slice(0, 5)];
    }
    return tags;
  }

  localTimeLabel(c: DymaxionCity): string {
    const timezone = c.timezone?.trim();
    if (!timezone) {
      return 'Not available';
    }

    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
      }).format(this.now());
    } catch {
      return 'Not available';
    }
  }

  temperatureLabel(c: DymaxionCity): string {
    const reading = this.cityTemperatures()[c.slug];
    if (reading) {
      return `${Math.round(reading.fahrenheit)}°F`;
    }
    if (this.temperatureLoadingSlug() === c.slug) {
      return 'Loading';
    }
    return 'Not available';
  }

  urbanSummary(c: DymaxionCity): string {
    const scale = c.population && c.population >= 5_000_000
      ? 'large metropolitan region'
      : c.population && c.population < 500_000
        ? 'smaller urban community'
        : 'city-scale LivingWiki page';
    return `A ${scale} snapshot centered on neighborhoods, movement, public life, work, and everyday local decisions.`;
  }

  climateSummary(c: DymaxionCity): string {
    const region = this.regionLabel(c.region);
    return `Current weather and local context for ${region}, with deeper seasonal and climate notes available in the chat.`;
  }

  private async ensureTemperature(c: DymaxionCity): Promise<void> {
    if (!this.isBrowser || this.cityTemperatures()[c.slug] || this.temperatureLoadingSlug() === c.slug) {
      return;
    }

    this.temperatureLoadingSlug.set(c.slug);
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', String(c.lat));
      url.searchParams.set('longitude', String(c.lng));
      url.searchParams.set('current', 'temperature_2m');
      url.searchParams.set('temperature_unit', 'fahrenheit');
      url.searchParams.set('timezone', 'auto');

      const response = await fetch(url.toString());
      if (!response.ok) return;
      const payload = (await response.json()) as OpenMeteoLocationResponse;
      const temperature = payload.current?.temperature_2m;
      if (typeof temperature !== 'number' || !Number.isFinite(temperature)) {
        return;
      }
      this.cityTemperatures.update((current) => ({
        ...current,
        [c.slug]: {
          fahrenheit: temperature,
          fetchedAt: new Date().toISOString(),
        },
      }));
    } catch {
      // Weather is useful context, but the card still works without it.
    } finally {
      if (this.temperatureLoadingSlug() === c.slug) {
        this.temperatureLoadingSlug.set(null);
      }
    }
  }

  private isProductDescription(value: string): boolean {
    const normalized = value.toLowerCase();
    return (
      normalized.includes('living wiki:') ||
      normalized.includes('livingwiki:') ||
      normalized.includes('intelligence platform') ||
      normalized.includes('consolidates') ||
      normalized.includes('database')
    );
  }
}

function countryKey(value: string): string {
  const key = value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bis\.\b/g, 'islands')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return COUNTRY_ALIASES[key] ?? key;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
