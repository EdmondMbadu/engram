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
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

interface DymaxionCity {
  name: string;
  country: string;
  region: RegionId;
  lat: number;
  lng: number;
  slug: string;
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
const MAX_DRILL = 5.5; // cluster drill-down
const PAD = 0.22;
const CLUSTER_TH = 28; // px: markers closer than this on screen get grouped
const SEP_TH = 30; // px: target separation when drilling into a cluster

@Component({
  selector: 'app-dymaxion',
  imports: [RouterLink, ThemeToggleComponent, FormsModule],
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
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  @ViewChild('frame') frameRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLDivElement>;
  @ViewChild('clusterLayer') clusterLayerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('picker') pickerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('zoomout') zoomoutRef!: ElementRef<HTMLButtonElement>;
  @ViewChild('hint') hintRef!: ElementRef<HTMLDivElement>;

  readonly isLoading = signal(true);
  readonly cityCount = signal(0);
  readonly shownCount = signal(0);
  readonly foci = signal<Focus[]>([]);
  readonly activeFocus = signal<string>('all');
  readonly searchValue = signal('');
  readonly selected = signal<DymaxionCity | null>(null);

  private cities: DymaxionCity[] = [];
  private markerEls: MarkerEntry[] = [];
  private view = { z: 1, tx: 0, ty: 0 };
  private query = '';
  private viewReady = false;
  private viewInited = false;
  private dataReady = false;
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

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) {
      this.isLoading.set(false);
      return;
    }
    try {
      const atlases = await this.atlasService.listPublicAtlases();
      this.cities = this.buildCities(atlases);
    } catch {
      this.cities = [];
    } finally {
      this.cityCount.set(this.cities.length);
      this.isLoading.set(false);
    }

    // Region chips: only show continents that actually have cities, plus the
    // fixed sub-zooms.
    const regionsWithCities = REGIONS.filter((r) =>
      this.cities.some((c) => c.region === r.id),
    );
    this.foci.set([
      { id: 'all', label: 'World' },
      ...regionsWithCities.map((r) => ({ id: r.id, label: r.label, region: r.id })),
      ...SUB_FOCI,
    ]);

    this.dataReady = true;
    this.tryInitMap();
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.viewInited = true;
    this.tryInitMap();
    window.addEventListener('resize', this.onResize);
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
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('click', this.onDocClick);
    document.removeEventListener('keydown', this.onKeydown);
  }

  /* ===================== DATA ===================== */

  private buildCities(atlases: AtlasItem[]): DymaxionCity[] {
    const W = 1000;
    const H = 475;
    const proj = geoAirocean();
    const [[bx0, by0], [bx1, by1]] = geoPath(proj).bounds({ type: 'Sphere' });
    const sx = W / (bx1 - bx0);
    const sy = H / (by1 - by0);
    const place = (lng: number, lat: number) => {
      const projected = proj([lng, lat]);
      if (!projected) return null;
      const [px, py] = projected;
      return {
        x: ((px - bx0) * sx) / W * 100,
        y: ((py - by0) * sy) / H * 100,
      };
    };

    const cities: DymaxionCity[] = [];
    for (const atlas of atlases) {
      const cfg = atlas.city_config;
      const lat = cfg?.latitude;
      const lng = cfg?.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      const pos = place(lng, lat);
      if (!pos) continue;

      const name = (cfg?.city_name?.trim() || atlas.name || '')
        .replace(/^My living wiki:\s*/i, '')
        .trim();
      if (!name) continue;

      cities.push({
        name,
        country: this.atlasService.cityCountryLabel(atlas) ?? cfg?.region_name ?? '',
        region: this.bucketRegion(cfg?.region_name, this.atlasService.cityCountryLabel(atlas)),
        lat,
        lng,
        slug: atlas.slug,
        x: pos.x,
        y: pos.y,
      });
    }
    cities.sort((a, b) => a.name.localeCompare(b.name));
    return cities;
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
    const canvas = this.canvasRef.nativeElement;

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

    this.viewReady = true;
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
    tx = Math.min(0, Math.max(1 - z, tx));
    ty = Math.min(0, Math.max(1 - z, ty));
    this.view = { z, tx, ty };
    const canvas = this.canvasRef.nativeElement;
    canvas.style.setProperty('--z', String(z));
    canvas.style.transform = `translate(${tx * 100}%, ${ty * 100}%) scale(${z})`;
    this.zoomoutRef?.nativeElement.classList.toggle('show', z > 1.01);
  }

  private resetZoom(): void {
    this.view = { z: 1, tx: 0, ty: 0 };
    const canvas = this.canvasRef.nativeElement;
    canvas.style.setProperty('--z', '1');
    canvas.style.transform = 'translate(0,0) scale(1)';
    this.zoomoutRef?.nativeElement.classList.remove('show');
  }

  setFocus(f: Focus): void {
    // Toggle back to world when clicking the active non-world chip.
    if (this.activeFocus() === f.id && f.id !== 'all') {
      f = { id: 'all', label: 'World' };
    }
    this.activeFocus.set(f.id);
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
    const items = this.markerEls
      .filter((m) => this.inFocus(m.c))
      .map((m) => {
        const { fx, fy } = this.screenPos(m.c);
        return { m, sx: fx * fw, sy: fy * fh };
      });
    const used = new Set<number>();
    const clusters: { m: MarkerEntry; sx: number; sy: number }[][] = [];
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      used.add(i);
      const g = [items[i]];
      let cx = items[i].sx;
      let cy = items[i].sy;
      for (let j = 0; j < items.length; j++) {
        if (used.has(j)) continue;
        if (Math.hypot(items[j].sx - cx, items[j].sy - cy) < CLUSTER_TH) {
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
    const clusterLayer = this.clusterLayerRef.nativeElement;
    clusterLayer.innerHTML = '';
    this.markerEls.forEach((m) => {
      m.b.classList.toggle('dim', !this.inFocus(m.c));
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
      m.b.classList.toggle(
        'hl',
        !!this.query &&
          this.match(m.c) &&
          !m.b.classList.contains('clustered') &&
          this.inFocus(m.c),
      );
    });
    this.shownCount.set(this.markerEls.filter((m) => this.inFocus(m.c)).length);
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
    const zNeed = SEP_TH / minFrac;
    if (zNeed <= MAX_DRILL && zNeed > this.view.z + 0.1) {
      const xs = members.map((c) => c.x);
      const ys = members.map((c) => c.y);
      this.applyZoom(
        [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        MAX_DRILL,
      );
      this.applyFilter();
    } else {
      this.openPicker(members);
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
    if (this.query && this.activeFocus() !== 'all') {
      this.setFocus({ id: 'all', label: 'World' });
    } else {
      this.applyFilter();
    }
  }

  /* ===================== SELECT A CITY ===================== */

  private selectCity(c: DymaxionCity, b: HTMLButtonElement | null): void {
    this.selected.set(c);
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

  openSelected(): void {
    const c = this.selected();
    if (c) this.router.navigate(['/atlas', c.slug]);
  }

  /* ===================== TEMPLATE HELPERS ===================== */

  fmtLat(v: number): string {
    return `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}`;
  }
  fmtLng(v: number): string {
    return `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'W'}`;
  }
  regionLabel(id: RegionId): string {
    return REGIONS.find((r) => r.id === id)?.label ?? id;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
