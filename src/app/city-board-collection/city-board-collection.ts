import { isPlatformBrowser } from '@angular/common';
import { Component, LOCALE_ID, OnDestroy, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import {
  CITY_BOARD_CATEGORIES,
  cityBoardCategory,
  selectFeaturedCityBoards,
  type CityBoardCategory,
  type CityBoardCategoryId,
} from '../city-board-collection.util';
import {
  CityBoardListingsService,
  type CityBoardListing,
} from '../city-board-listings.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';

type CollectionFilter = 'all' | CityBoardCategoryId;
type RailState = { back: boolean; forward: boolean };

@Component({
  selector: 'app-city-board-collection',
  imports: [RouterLink, ThemeToggleComponent, MobileMenuComponent, WorkspaceSidebarComponent],
  templateUrl: './city-board-collection.html',
  styleUrl: './city-board-collection.css',
})
export class CityBoardCollectionComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);
  private readonly listingsService = inject(CityBoardListingsService);
  private readonly titleService = inject(Title);
  private readonly localeId = inject(LOCALE_ID);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private loadSequence = 0;
  private spotlightRotationTimer: number | null = null;
  private spotlightPointerInside = false;
  private spotlightFocusWithin = false;

  readonly routeSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug')?.trim() || '')),
    { initialValue: this.route.snapshot.paramMap.get('slug')?.trim() || '' },
  );
  readonly atlas = signal<AtlasItem | null>(null);
  readonly atlasLoading = signal(true);
  readonly atlasError = signal<string | null>(null);
  readonly boards = signal<CityBoardListing[]>([]);
  readonly boardsLoading = signal(false);
  readonly boardsError = signal<string | null>(null);
  readonly selectedFeaturedId = signal('');
  readonly activeFilter = signal<CollectionFilter>('all');
  readonly searchQuery = signal('');
  readonly railState = signal<Record<string, RailState>>({});
  readonly spotlightPaused = signal(false);
  readonly isSignedIn = computed(() => !!this.authService.uid());

  readonly cityName = computed(() => {
    const atlas = this.atlas();
    if (!atlas) return this.titleizeSlug(this.routeSlug());
    return this.atlasService.displayName(atlas)
      .replace(/^Living\s*Wiki:\s*/i, '')
      .replace(/\s*\(flagship\)\s*$/i, '')
      .trim();
  });
  readonly country = computed(() => this.atlasService.cityCountryLabel(this.atlas()) ?? '');
  readonly cityLink = computed(() => ['/chat', this.atlas()?.slug || this.routeSlug()]);
  readonly collectionDescription = computed(() => {
    const description = this.atlas()?.landing_summary?.trim() || this.atlas()?.description?.trim();
    return description
      ? this.clampText(description, 170)
      : `Curated collections that reveal how ${this.cityName()} eats, gathers, moves, and makes sense of itself.`;
  });
  readonly totalLabel = computed(() => {
    const count = this.boards().length;
    return `${count} ${count === 1 ? 'board' : 'boards'}`;
  });
  readonly featuredBoards = computed(() => selectFeaturedCityBoards(this.boards(), 5));
  readonly activeFeatured = computed(() => {
    const featured = this.featuredBoards();
    return featured.find((board) => board.id === this.selectedFeaturedId()) ?? featured[0] ?? null;
  });
  readonly activeFeaturedCategory = computed(() => {
    const board = this.activeFeatured();
    return board ? cityBoardCategory(board) : null;
  });
  readonly activeHeroImage = computed(() =>
    this.activeFeatured()?.imageUrl || this.atlas()?.hero_url || '',
  );
  readonly availableCategories = computed(() => CITY_BOARD_CATEGORIES
    .map((category) => ({
      ...category,
      count: this.boards().filter((board) => cityBoardCategory(board).id === category.id).length,
    }))
    .filter((category) => category.count > 0));
  readonly filteredBoards = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase(this.localeId);
    const filter = this.activeFilter();
    return this.boards().filter((board) => {
      if (filter !== 'all' && cityBoardCategory(board).id !== filter) return false;
      if (!query) return true;
      const haystack = [
        board.title,
        board.description,
        board.publisherName,
        cityBoardCategory(board).label,
        ...board.topicIds,
      ].join(' ').toLocaleLowerCase(this.localeId);
      return haystack.includes(query);
    });
  });
  readonly topicRows = computed(() => this.availableCategories()
    .map((category) => ({
      category,
      boards: this.boards().filter((board) => cityBoardCategory(board).id === category.id),
    }))
    .filter((row) => row.boards.length >= 2));
  readonly showTopicRows = computed(() =>
    !this.searchQuery().trim() && this.activeFilter() === 'all' && this.topicRows().length > 0,
  );
  readonly resultsHeading = computed(() => {
    const query = this.searchQuery().trim();
    if (query) return `Results for “${this.clampText(query, 44)}”`;
    const category = this.availableCategories().find((item) => item.id === this.activeFilter());
    return category ? category.label : `All ${this.cityName()} boards`;
  });

  constructor() {
    effect(() => {
      void this.loadCollection(this.routeSlug());
    });
  }

  ngOnDestroy(): void {
    this.stopSpotlightRotation();
  }

  selectFeatured(board: CityBoardListing): void {
    this.selectedFeaturedId.set(board.id);
    this.restartSpotlightRotation();
  }

  moveFeatured(direction: -1 | 1): void {
    this.rotateFeatured(direction);
    this.restartSpotlightRotation();
  }

  onSpotlightPointerEnter(): void {
    this.spotlightPointerInside = true;
    this.syncSpotlightPause();
  }

  onSpotlightPointerLeave(): void {
    this.spotlightPointerInside = false;
    this.syncSpotlightPause();
  }

  onSpotlightFocusIn(): void {
    this.spotlightFocusWithin = true;
    this.syncSpotlightPause();
  }

  onSpotlightFocusOut(event: FocusEvent): void {
    const spotlight = event.currentTarget as HTMLElement;
    const nextTarget = event.relatedTarget;
    this.spotlightFocusWithin = nextTarget instanceof Node && spotlight.contains(nextTarget);
    this.syncSpotlightPause();
  }

  private rotateFeatured(direction: -1 | 1): void {
    const boards = this.featuredBoards();
    if (boards.length < 2) return;
    const activeIndex = Math.max(0, boards.findIndex((board) => board.id === this.activeFeatured()?.id));
    this.selectedFeaturedId.set(boards[(activeIndex + direction + boards.length) % boards.length].id);
  }

  selectFilter(filter: CollectionFilter): void {
    this.activeFilter.set(filter);
    this.scrollResultsIntoView();
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    if (this.searchQuery().trim()) this.activeFilter.set('all');
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  boardCategory(board: CityBoardListing): CityBoardCategory {
    return cityBoardCategory(board);
  }

  boardCountLabel(board: CityBoardListing): string {
    return `${board.cardCount} ${board.cardCount === 1 ? 'card' : 'cards'}`;
  }

  boardIcon(board: CityBoardListing): string {
    const requested = board.icon.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
    return /^(?:dashboard|dashboard_customize|travel_explore|location_city|location_on|restaurant|local_cafe|local_bar|nightlife|beach_access|festival|hiking|directions_walk|directions_car|museum|history_edu|shopping_bag|storefront|favorite|auto_awesome|public|sports_handball|sports_basketball|sports_soccer|sports_football|sports_baseball|sports_tennis|sports_volleyball|fitness_center|music_note|palette|photo_camera|park|family_restroom|school|menu_book|theater_comedy|stadium|spa|pets|money_off|route|diversity_3|fingerprint)$/.test(requested)
      ? requested
      : cityBoardCategory(board).icon;
  }

  heroDescription(board: CityBoardListing): string {
    return board.description || `Open this curated ${this.cityName()} collection and explore every card.`;
  }

  railCanGoBack(id: string): boolean {
    return this.railState()[id]?.back ?? false;
  }

  railCanGoForward(id: string): boolean {
    return this.railState()[id]?.forward ?? true;
  }

  onRailScroll(id: string, event: Event): void {
    this.updateRailState(id, event.currentTarget as HTMLElement);
  }

  moveRail(id: string, direction: -1 | 1): void {
    if (!this.isBrowser) return;
    const rail = document.querySelector<HTMLElement>(`[data-city-board-rail="${id}"]`);
    if (!rail) return;
    const card = rail.querySelector<HTMLElement>('.collection-board-card');
    const gap = Number.parseFloat(getComputedStyle(rail).gap || '0') || 0;
    const step = (card?.getBoundingClientRect().width ?? rail.clientWidth * 0.7) + gap;
    const visible = Math.max(1, Math.floor((rail.clientWidth + gap) / step));
    rail.scrollBy({ left: direction * step * visible, behavior: 'smooth' });
    window.setTimeout(() => this.updateRailState(id, rail), 420);
  }

  retry(): void {
    void this.loadCollection(this.routeSlug());
  }

  private async loadCollection(slug: string): Promise<void> {
    const sequence = ++this.loadSequence;
    this.atlas.set(null);
    this.boards.set([]);
    this.atlasError.set(null);
    this.boardsError.set(null);
    this.atlasLoading.set(true);
    this.boardsLoading.set(false);
    this.selectedFeaturedId.set('');
    this.activeFilter.set('all');
    this.searchQuery.set('');
    if (!slug) {
      this.atlasLoading.set(false);
      this.atlasError.set('This city could not be found.');
      return;
    }

    try {
      const atlas = await this.atlasService.getPublicAtlasBySlug(slug);
      if (sequence !== this.loadSequence) return;
      if (!atlas || atlas.city_config?.enabled !== true) {
        this.atlasError.set('This public city collection could not be found.');
        return;
      }
      this.atlas.set(atlas);
      this.titleService.setTitle(`Boards for ${this.cityName()} | LivingWiki`);
      this.boardsLoading.set(true);
      try {
        const boards = await this.listingsService.list(atlas.id);
        if (sequence !== this.loadSequence) return;
        this.boards.set(boards);
        this.selectedFeaturedId.set(selectFeaturedCityBoards(boards, 5)[0]?.id ?? '');
        this.restartSpotlightRotation();
        if (this.isBrowser) window.setTimeout(() => this.syncAllRails(), 80);
      } catch {
        if (sequence === this.loadSequence) {
          this.boardsError.set('The city board library is temporarily unavailable.');
        }
      } finally {
        if (sequence === this.loadSequence) this.boardsLoading.set(false);
      }
    } catch {
      if (sequence === this.loadSequence) {
        this.atlasError.set('This city is temporarily unavailable.');
      }
    } finally {
      if (sequence === this.loadSequence) this.atlasLoading.set(false);
    }
  }

  private syncAllRails(): void {
    document.querySelectorAll<HTMLElement>('[data-city-board-rail]').forEach((rail) => {
      const id = rail.dataset['cityBoardRail'];
      if (id) this.updateRailState(id, rail);
    });
  }

  private restartSpotlightRotation(): void {
    this.stopSpotlightRotation();
    if (!this.isBrowser || this.spotlightPaused() || this.featuredBoards().length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.spotlightRotationTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || this.spotlightPaused()) return;
      this.rotateFeatured(1);
    }, 5_000);
  }

  private stopSpotlightRotation(): void {
    if (this.spotlightRotationTimer !== null) {
      window.clearInterval(this.spotlightRotationTimer);
      this.spotlightRotationTimer = null;
    }
  }

  private syncSpotlightPause(): void {
    const paused = this.spotlightPointerInside || this.spotlightFocusWithin;
    this.spotlightPaused.set(paused);
    if (paused) {
      this.stopSpotlightRotation();
    } else {
      this.restartSpotlightRotation();
    }
  }

  private updateRailState(id: string, rail: HTMLElement): void {
    const next = {
      back: rail.scrollLeft > 8,
      forward: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 8,
    };
    const current = this.railState()[id];
    if (current?.back === next.back && current.forward === next.forward) return;
    this.railState.update((state) => ({ ...state, [id]: next }));
  }

  private scrollResultsIntoView(): void {
    if (!this.isBrowser) return;
    window.setTimeout(() => document.getElementById('city-board-results')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    }));
  }

  private clampText(value: string, max: number): string {
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
  }

  private titleizeSlug(value: string): string {
    return value.split(/[-_]+/g).filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
