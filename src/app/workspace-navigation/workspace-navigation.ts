import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { filter, map, of, startWith } from 'rxjs';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';

export type WorkspaceNavigationKey =
  | 'discover'
  | 'city'
  | 'saved'
  | 'boards'
  | 'songs'
  | 'videos'
  | 'friends'
  | 'trips'
  | 'trove'
  | 'business'
  | 'wikis'
  | 'chat'
  | 'dymaxion'
  | 'upload'
  | 'library'
  | 'scrapper'
  | 'wiki'
  | 'profile'
  | 'settings';

export interface WorkspaceNavigationItem {
  key: WorkspaceNavigationKey;
  label: string;
  route: string;
  icon?: string;
  iconImageUrl?: string;
  fragment?: string;
}

export interface WorkspaceBusinessContext {
  name: string;
  city: string | null;
  status: string | null;
  pagePath: string;
  editPath: string | null;
  badgePath: string | null;
  voicePath: string | null;
  chatPath: string | null;
  chatGuidePath: string | null;
  chatGuideQueryParams: Record<string, string> | null;
}

export interface WorkspaceBusinessNavigationItem {
  key: string;
  label: string;
  icon: string;
  route: string;
  queryParams?: Record<string, string> | null;
}

const HOME_ICON_ROOT = '/assets/image/home-icons';
const HOME_BOARD_ACTIONS_STORAGE_PREFIX = 'lw-board-actions';
const BOARD_ACTIONS_STORAGE_PREFIX = 'livingwiki-board-actions-v1';

@Injectable({ providedIn: 'root' })
export class WorkspaceNavigationService {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly savedBoardCount = signal(0);
  readonly businessContext = signal<WorkspaceBusinessContext | null>(null);
  readonly currentUrl = toSignal(
    (this.router.events ?? of()).pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url || '/'),
      takeUntilDestroyed(this.destroyRef),
    ),
    { initialValue: this.router.url || '/' },
  );

  readonly preferredCitySlug = computed(() => this.authService.profile()?.preferredCitySlug?.trim() || 'philly');
  readonly preferredCityName = computed(() => this.humanizeSlug(this.preferredCitySlug()));

  readonly primaryItems = computed<WorkspaceNavigationItem[]>(() => {
    const items: WorkspaceNavigationItem[] = [
      { key: 'discover', label: $localize`Discover`, route: '/discover', icon: 'travel_explore' },
      {
        key: 'city',
        label: `${$localize`My City`} ${this.preferredCityName()}`,
        route: `/chat/${encodeURIComponent(this.preferredCitySlug())}`,
        iconImageUrl: `${HOME_ICON_ROOT}/my-cities.png`,
      },
    ];

    if (this.savedBoardCount() > 0) {
      items.push({
        key: 'saved',
        label: $localize`Saved Boards`,
        route: '/home',
        fragment: 'mobile-saved',
        icon: 'bookmark',
      });
    }

    items.push(
      { key: 'boards', label: $localize`My Boards`, route: '/boards', iconImageUrl: `${HOME_ICON_ROOT}/my-boards.png` },
      { key: 'songs', label: $localize`My Songs`, route: '/songs', iconImageUrl: `${HOME_ICON_ROOT}/my-songs.png` },
      { key: 'videos', label: $localize`My Videos`, route: '/videos', icon: 'video_library' },
      { key: 'friends', label: $localize`My Friends`, route: '/friends', icon: 'group' },
      { key: 'trips', label: $localize`My Trips`, route: '/trips', iconImageUrl: `${HOME_ICON_ROOT}/my-trips.png` },
      { key: 'trove', label: $localize`My Trove · Starfold City`, route: '/trove', iconImageUrl: `${HOME_ICON_ROOT}/my-trove.png` },
      { key: 'business', label: $localize`Business`, route: '/business', icon: 'storefront' },
    );

    return items;
  });

  readonly moreItems = computed<WorkspaceNavigationItem[]>(() => [
    { key: 'wikis', label: $localize`Wikis`, icon: 'dashboard', route: '/wikis' },
    { key: 'chat', label: $localize`Chat`, icon: 'chat', route: '/chat' },
    { key: 'dymaxion', label: $localize`World Map`, icon: 'public', route: '/dymaxion' },
    { key: 'upload', label: $localize`Upload Knowledge`, icon: 'neurology', route: '/upload' },
    { key: 'library', label: $localize`Source Files`, icon: 'library_books', route: '/library' },
    { key: 'scrapper', label: $localize`Scraper`, icon: 'travel_explore', route: '/scrapper' },
    { key: 'wiki', label: $localize`Wiki Reader`, icon: 'menu_book', route: this.atlasService.activeAtlasWikiLink() },
    { key: 'profile', label: $localize`Profile`, icon: 'account_circle', route: '/profile' },
    { key: 'settings', label: $localize`Settings`, icon: 'settings', route: '/atlases' },
  ]);

  readonly businessItems = computed<WorkspaceBusinessNavigationItem[]>(() => {
    const context = this.businessContext();
    if (!context) return [];

    return [
      { key: 'business-page', label: $localize`Business Page`, icon: 'business_center', route: context.pagePath },
      context.editPath ? { key: 'business-edit', label: $localize`Edit Page`, icon: 'edit', route: context.editPath } : null,
      context.badgePath || context.editPath
        ? { key: 'business-badge', label: $localize`Badge`, icon: 'qr_code_2', route: context.badgePath || context.editPath! }
        : null,
      context.voicePath ? { key: 'business-voice', label: $localize`Voice Assistant`, icon: 'mic', route: context.voicePath } : null,
      context.chatPath ? { key: 'business-chat', label: $localize`Direct Chat`, icon: 'forum', route: context.chatPath } : null,
      context.chatGuidePath
        ? {
            key: 'business-guide',
            label: $localize`Test live guide`,
            icon: 'graphic_eq',
            route: context.chatGuidePath,
            queryParams: context.chatGuideQueryParams,
          }
        : null,
    ].filter((item): item is WorkspaceBusinessNavigationItem => item !== null);
  });

  readonly moreActive = computed(() => this.moreItems().some((item) => this.isActive(item.key)));

  constructor() {
    effect(() => {
      this.authService.uid();
      this.refreshSavedBoards();
    });

    if (this.isBrowser) {
      const refresh = () => this.refreshSavedBoards();
      window.addEventListener('livingwiki:saved-boards-changed', refresh);
      this.destroyRef.onDestroy(() => window.removeEventListener('livingwiki:saved-boards-changed', refresh));
    }
  }

  isActive(key: WorkspaceNavigationKey): boolean {
    const url = this.currentUrl();
    const [path] = url.split(/[?#]/, 1);

    switch (key) {
      case 'discover':
        return path === '/discover';
      case 'city':
        return path === `/chat/${encodeURIComponent(this.preferredCitySlug())}`;
      case 'saved':
        return path === '/home' && url.includes('#mobile-saved');
      case 'boards':
        return path === '/boards' || path.startsWith('/boards/u/') || /^\/boards\/[^/]+$/.test(path);
      case 'songs':
        return path === '/songs' || path.startsWith('/songs/');
      case 'videos':
        return path === '/videos';
      case 'friends':
        return path === '/friends';
      case 'trips':
        return path === '/trips' || path.startsWith('/trips/');
      case 'trove':
        return path === '/trove';
      case 'business':
        return path === '/business' || path.startsWith('/business/');
      case 'wikis':
        return path === '/wikis';
      case 'chat':
        return path === '/chat';
      case 'dymaxion':
        return path === '/dymaxion';
      case 'upload':
        return path === '/upload';
      case 'library':
        return path === '/library';
      case 'scrapper':
        return path === '/scrapper';
      case 'wiki':
        return path === '/wiki';
      case 'profile':
        return path === '/profile';
      case 'settings':
        return path === '/atlases';
    }
  }

  setBusinessContext(context: WorkspaceBusinessContext | null): void {
    this.businessContext.set(context);
  }

  refreshSavedBoards(): void {
    if (!this.isBrowser) return;

    const uid = this.authService.uid() || 'guest';
    const ids = new Set<string>();
    this.readStringArray(`${HOME_BOARD_ACTIONS_STORAGE_PREFIX}:${uid}`, 's').forEach((id) => ids.add(id));
    this.readStringArray(`${BOARD_ACTIONS_STORAGE_PREFIX}:${uid}`, 'savedBoardIds').forEach((id) => ids.add(id));
    this.savedBoardCount.set(ids.size);
  }

  private readStringArray(storageKey: string, property: string): string[] {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return [];
      const value = (JSON.parse(raw) as Record<string, unknown>)[property];
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private humanizeSlug(slug: string): string {
    const citySlug = slug.replace(/^(?:my[-_]+)?living[-_]+wiki[-_]+/i, '');
    return citySlug
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || $localize`Choose a city`;
  }
}

@Injectable({ providedIn: 'root' })
export class WorkspaceNavigationOverlayService {
  readonly moreOpen = signal(false);
  readonly aboutOpen = signal(false);
  private returnFocusElement: HTMLElement | null = null;

  openMore(origin?: EventTarget | null): void {
    this.captureOrigin(origin);
    this.aboutOpen.set(false);
    this.moreOpen.set(true);
  }

  openAbout(origin?: EventTarget | null): void {
    this.captureOrigin(origin);
    this.moreOpen.set(false);
    this.aboutOpen.set(true);
  }

  close(): void {
    const shouldRestoreFocus = this.moreOpen() || this.aboutOpen();
    this.moreOpen.set(false);
    this.aboutOpen.set(false);
    if (shouldRestoreFocus && this.returnFocusElement) {
      const target = this.returnFocusElement;
      this.returnFocusElement = null;
      queueMicrotask(() => target.focus());
    }
  }

  private captureOrigin(origin?: EventTarget | null): void {
    this.returnFocusElement = origin instanceof HTMLElement ? origin : null;
  }
}
