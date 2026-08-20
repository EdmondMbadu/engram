import { isPlatformBrowser } from '@angular/common';
import { Component, HostListener, LOCALE_ID, OnDestroy, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { BoardCollectionsService, type BoardCollection } from '../board-collections.service';
import { CustomPublicUrlDialogComponent } from '../custom-public-url-dialog/custom-public-url-dialog';
import type { SetCustomPublicUrlResult } from '../custom-public-url';
import {
  CITY_BOARD_CATEGORIES,
  cityBoardCategory,
  cityBoardReelIndex,
  cityBoardReelSegmentProgress,
  selectFeaturedCityBoards,
  type CityBoardCategory,
  type CityBoardCategoryId,
} from '../city-board-collection.util';
import {
  CityBoardListingsService,
  type CityBoardListing,
} from '../city-board-listings.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { StackNarrationSessionService } from '../stack-narration-session.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';

type CollectionFilter = 'all' | CityBoardCategoryId;
type RailState = { back: boolean; forward: boolean };
const SPOTLIGHT_ROTATION_MS = 5_000;

@Component({
  selector: 'app-city-board-collection',
  imports: [RouterLink, ThemeToggleComponent, MobileMenuComponent, WorkspaceSidebarComponent, CustomPublicUrlDialogComponent],
  templateUrl: './city-board-collection.html',
  styleUrl: './city-board-collection.css',
})
export class CityBoardCollectionComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);
  private readonly boardCollectionsService = inject(BoardCollectionsService);
  private readonly listingsService = inject(CityBoardListingsService);
  private readonly titleService = inject(Title);
  private readonly stackNarrationSession = inject(StackNarrationSessionService);
  private readonly localeId = inject(LOCALE_ID);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private loadSequence = 0;
  private spotlightRotationFrame: number | null = null;
  private spotlightCycleStartedAt = 0;
  private spotlightCycleElapsedMs = 0;
  private spotlightPointerInside = false;
  private spotlightFocusWithin = false;

  readonly routeSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug')?.trim() || '')),
    { initialValue: this.route.snapshot.paramMap.get('slug')?.trim() || '' },
  );
  readonly ownerKey = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('ownerKey')?.trim() || '')),
    { initialValue: this.route.snapshot.paramMap.get('ownerKey')?.trim() || '' },
  );
  readonly isUserCollection = this.route.snapshot.data['userCollection'] === true;
  readonly isCustomCollection = this.route.snapshot.data['customCollection'] === true;
  readonly atlas = signal<AtlasItem | null>(null);
  readonly userCollection = signal<BoardCollection | null>(null);
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
  readonly customUrlDialogOpen = signal(false);
  readonly spotlightProgress = signal(0);
  readonly isSignedIn = computed(() => !!this.authService.uid());
  readonly canManageCollection = computed(() => {
    const collection = this.userCollection();
    return !!collection
      && (collection.ownerUserId === this.authService.uid() || this.authService.isAdmin());
  });
  readonly customUrlEligible = computed(() =>
    this.canManageCollection()
    && (this.authService.isAdmin() || this.authService.hasActivePersonalWikiPlan()),
  );
  readonly isUniversity = computed(() => {
    const atlas = this.atlas();
    return atlas?.wiki_type === 'university' || atlas?.university_config?.enabled === true;
  });

  readonly cityName = computed(() => {
    const atlas = this.atlas();
    if (!atlas) return this.titleizeSlug(this.routeSlug());
    return this.atlasService.displayName(atlas)
      .replace(/^Living\s*Wiki:\s*/i, '')
      .replace(/\s*\(flagship\)\s*$/i, '')
      .trim();
  });
  readonly parentName = computed(() =>
    this.userCollection()?.ownerDisplayName || this.cityName(),
  );
  readonly country = computed(() => {
    const atlas = this.atlas();
    const cityCountry = this.atlasService.cityCountryLabel(atlas);
    if (cityCountry) return cityCountry;
    const countryCode = atlas?.university_config?.country_code?.trim().toUpperCase();
    return countryCode === 'US' ? 'United States' : countryCode ?? '';
  });
  readonly cityLink = computed(() => ['/chat', this.atlas()?.slug || this.routeSlug()]);
  readonly parentLink = computed(() => this.isUserCollection
    ? ['/boards/u', this.userCollection()?.ownerPublicSlug || this.ownerKey()]
    : this.cityLink());
  readonly pageHeading = computed(() =>
    this.userCollection()?.title || `Boards for ${this.cityName()}`,
  );
  readonly breadcrumbCurrent = computed(() =>
    this.userCollection()?.title || 'Boards',
  );
  readonly collectionDescription = computed(() => {
    const personal = this.userCollection();
    if (personal) {
      return personal.description
        || `A curated set of LivingWiki boards selected by ${personal.ownerDisplayName}.`;
    }
    const description = this.atlas()?.landing_summary?.trim() || this.atlas()?.description?.trim();
    return description
      ? this.clampText(description, 170)
      : this.isUniversity()
        ? `Source-backed collections for campus traditions, shared spaces, study rituals, food, and life around ${this.cityName()}.`
        : `Curated collections that reveal how ${this.cityName()} eats, gathers, moves, and makes sense of itself.`;
  });
  readonly collectionKindLabel = computed(() => this.isUserCollection
    ? 'Board collection'
    : this.isUniversity() ? 'University board library' : 'City board library');
  readonly collectionIcon = computed(() => this.isUserCollection
    ? 'collections_bookmark'
    : this.isUniversity() ? 'school' : 'location_city');
  readonly collectionUnavailableLabel = computed(() => this.isUserCollection
    ? 'Collection unavailable'
    : this.isUniversity() ? 'University collection unavailable' : 'City collection unavailable');
  readonly collectionUnavailableCopy = computed(() => this.isUserCollection
    ? 'This collection may have moved, or it is no longer public.'
    : this.isUniversity()
      ? 'Return to LivingWiki and choose another public university.'
      : 'Return to LivingWiki and choose another public city.');
  readonly collectionAvailable = computed(() => !!this.atlas() || !!this.userCollection());
  readonly identityImageUrl = computed(() =>
    this.userCollection()?.ownerPhotoUrl || this.atlas()?.logo_url || '',
  );
  readonly identitySecondary = computed(() =>
    this.userCollection() ? `By ${this.userCollection()!.ownerDisplayName}` : this.country(),
  );
  readonly backLabel = computed(() => `Back to ${this.parentName()}`);
  readonly featuredAriaLabel = computed(() => this.isUserCollection
    ? 'Featured collection boards'
    : this.isUniversity() ? 'Featured university boards' : 'Featured city boards');
  readonly featuredContextLabel = computed(() =>
    this.userCollection()?.title || this.cityName(),
  );
  readonly searchPlaceholder = computed(() => this.isUserCollection
    ? 'Search this collection'
    : `Search ${this.cityName()} boards`);
  readonly searchAriaLabel = computed(() => this.isUserCollection
    ? 'Search collection boards'
    : this.isUniversity() ? 'Search university boards' : 'Search city boards');
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
    return category
      ? category.label
      : this.isUserCollection ? 'All boards in this collection' : `All ${this.cityName()} boards`;
  });

  constructor() {
    effect(() => {
      void this.loadCollection(this.routeSlug());
    });
  }

  ngOnDestroy(): void {
    this.stopSpotlightRotation();
  }

  @HostListener('document:visibilitychange')
  onDocumentVisibilityChange(): void {
    if (!this.isBrowser) return;
    if (document.visibilityState === 'visible' && !this.spotlightPaused()) {
      this.resumeSpotlightRotation();
    } else {
      this.pauseSpotlightRotation();
    }
  }

  selectFeatured(board: CityBoardListing): void {
    this.selectedFeaturedId.set(board.id);
    this.restartSpotlightRotation();
  }

  async openLiveView(board: CityBoardListing, event: MouseEvent): Promise<void> {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    await this.stackNarrationSession.unlock();
    await this.router.navigate(['/boards', board.id], { queryParams: { view: 'stack', autoplay: '1' } });
  }

  moveFeatured(direction: -1 | 1): void {
    this.rotateFeatured(direction);
    this.restartSpotlightRotation();
  }

  spotlightBoardProgress(board: CityBoardListing): number {
    const boards = this.featuredBoards();
    const boardIndex = boards.findIndex((candidate) => candidate.id === board.id);
    const activeIndex = boards.findIndex((candidate) => candidate.id === this.activeFeatured()?.id);
    return cityBoardReelSegmentProgress(boardIndex, activeIndex, this.spotlightProgress());
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
    this.selectedFeaturedId.set(boards[cityBoardReelIndex(activeIndex, boards.length, direction)].id);
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
    return board.description || (this.isUserCollection
      ? 'Open this board and explore every card in the collection.'
      : `Open this curated ${this.cityName()} collection and explore every card.`);
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

  openCustomUrlDialog(): void {
    if (this.canManageCollection()) this.customUrlDialogOpen.set(true);
  }

  closeCustomUrlDialog(): void {
    this.customUrlDialogOpen.set(false);
  }

  handleCustomUrlSaved(result: SetCustomPublicUrlResult): void {
    const collection = this.userCollection();
    if (!collection || result.resourceType !== 'collection' || result.resourceId !== collection.id) return;
    this.userCollection.set({ ...collection, customSlug: result.slug });
    void this.router.navigate(['/collections', result.slug], {
      replaceUrl: true,
      queryParamsHandling: 'preserve',
      preserveFragment: true,
    });
  }

  private async loadCollection(slug: string): Promise<void> {
    const sequence = ++this.loadSequence;
    this.atlas.set(null);
    this.userCollection.set(null);
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
      this.atlasError.set('This board collection could not be found.');
      return;
    }

    try {
      if (this.isUserCollection) {
        this.boardsLoading.set(true);
        const loaded = this.isCustomCollection
          ? await this.boardCollectionsService.getPublicByCustomSlug(slug)
          : await this.boardCollectionsService.getPublic(this.ownerKey(), slug);
        if (sequence !== this.loadSequence) return;
        if (!loaded) {
          this.atlasError.set('This public board collection could not be found.');
          return;
        }
        this.userCollection.set(loaded.collection);
        this.canonicalizeCollectionPublicUrl(loaded.collection, slug);
        this.boards.set(loaded.boards);
        this.selectedFeaturedId.set(selectFeaturedCityBoards(loaded.boards, 5)[0]?.id ?? '');
        this.titleService.setTitle(`${loaded.collection.title} | LivingWiki`);
        this.restartSpotlightRotation();
        if (this.isBrowser) window.setTimeout(() => this.syncAllRails(), 80);
        return;
      }
      const atlas = await this.atlasService.getPublicAtlasBySlug(slug);
      if (sequence !== this.loadSequence) return;
      const collectionEligible = atlas?.city_config?.enabled === true
        || atlas?.wiki_type === 'university'
        || atlas?.university_config?.enabled === true;
      if (!atlas || !collectionEligible) {
        this.atlasError.set('This public board collection could not be found.');
        return;
      }
      this.atlas.set(atlas);
      this.titleService.setTitle(`Boards for ${this.cityName()} | LivingWiki`);
      this.boardsLoading.set(true);
      try {
        const boards = await this.listingsService.list(atlas.id, {
          targetKind: atlas.wiki_type === 'university' || atlas.university_config?.enabled === true
            ? 'university'
            : 'city',
        });
        if (sequence !== this.loadSequence) return;
        this.boards.set(boards);
        this.selectedFeaturedId.set(selectFeaturedCityBoards(boards, 5)[0]?.id ?? '');
        this.restartSpotlightRotation();
        if (this.isBrowser) window.setTimeout(() => this.syncAllRails(), 80);
      } catch {
        if (sequence === this.loadSequence) {
          this.boardsError.set('The board library is temporarily unavailable.');
        }
      } finally {
        if (sequence === this.loadSequence) this.boardsLoading.set(false);
      }
    } catch {
      if (sequence === this.loadSequence) {
        this.atlasError.set('This board collection is temporarily unavailable.');
      }
    } finally {
      if (sequence === this.loadSequence) {
        this.atlasLoading.set(false);
        if (this.isUserCollection) this.boardsLoading.set(false);
      }
    }
  }

  private canonicalizeCollectionPublicUrl(collection: BoardCollection, requestedSlug: string): void {
    const customSlug = collection.customSlug.trim().toLowerCase();
    if (!this.isBrowser || !customSlug) return;
    const requestedCustomSlug = requestedSlug.trim().toLowerCase();
    if (this.isCustomCollection && requestedCustomSlug === customSlug) return;
    void this.router.navigate(['/collections', customSlug], {
      replaceUrl: true,
      queryParamsHandling: 'preserve',
      preserveFragment: true,
    });
  }

  private syncAllRails(): void {
    document.querySelectorAll<HTMLElement>('[data-city-board-rail]').forEach((rail) => {
      const id = rail.dataset['cityBoardRail'];
      if (id) this.updateRailState(id, rail);
    });
  }

  private restartSpotlightRotation(): void {
    this.stopSpotlightRotation();
    this.spotlightCycleElapsedMs = 0;
    this.spotlightProgress.set(0);
    this.resumeSpotlightRotation();
  }

  private resumeSpotlightRotation(): void {
    if (!this.isBrowser || this.spotlightPaused() || this.featuredBoards().length < 2) return;
    if (this.spotlightRotationFrame !== null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.spotlightProgress.set(100);
      return;
    }

    this.spotlightCycleStartedAt = performance.now() - this.spotlightCycleElapsedMs;
    const tick = (now: number) => {
      if (document.visibilityState !== 'visible' || this.spotlightPaused()) {
        this.pauseSpotlightRotation();
        return;
      }

      this.spotlightCycleElapsedMs = Math.min(
        SPOTLIGHT_ROTATION_MS,
        Math.max(0, now - this.spotlightCycleStartedAt),
      );
      this.spotlightProgress.set((this.spotlightCycleElapsedMs / SPOTLIGHT_ROTATION_MS) * 100);

      if (this.spotlightCycleElapsedMs >= SPOTLIGHT_ROTATION_MS) {
        this.rotateFeatured(1);
        this.spotlightCycleElapsedMs = 0;
        this.spotlightCycleStartedAt = now;
        this.spotlightProgress.set(0);
      }
      this.spotlightRotationFrame = window.requestAnimationFrame(tick);
    };
    this.spotlightRotationFrame = window.requestAnimationFrame(tick);
  }

  private stopSpotlightRotation(): void {
    if (this.isBrowser && this.spotlightRotationFrame !== null) {
      window.cancelAnimationFrame(this.spotlightRotationFrame);
      this.spotlightRotationFrame = null;
    }
  }

  private pauseSpotlightRotation(): void {
    if (!this.isBrowser || this.spotlightRotationFrame === null) return;
    this.spotlightCycleElapsedMs = Math.min(
      SPOTLIGHT_ROTATION_MS,
      Math.max(0, performance.now() - this.spotlightCycleStartedAt),
    );
    this.spotlightProgress.set((this.spotlightCycleElapsedMs / SPOTLIGHT_ROTATION_MS) * 100);
    this.stopSpotlightRotation();
  }

  private syncSpotlightPause(): void {
    const paused = this.spotlightPointerInside || this.spotlightFocusWithin;
    this.spotlightPaused.set(paused);
    if (paused) {
      this.pauseSpotlightRotation();
    } else {
      this.resumeSpotlightRotation();
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
