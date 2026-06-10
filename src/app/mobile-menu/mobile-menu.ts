import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AtlasService } from '../atlas.service';

@Component({
  selector: 'app-mobile-menu',
  imports: [RouterLink],
  templateUrl: './mobile-menu.html',
  host: { class: 'md:hidden' },
})
export class MobileMenuComponent {
  /** Which nav item is currently active */
  readonly activePage = input<string>('home');
  readonly publicSlug = input<string | null>(null);
  readonly hidePublicKnowledgeSurfaces = input<boolean>(false);
  readonly adminNavigation = input<boolean>(true);
  readonly showJoinAction = input<boolean>(false);
  readonly joinLabel = input<string>('Join for Free');
  readonly showSignInAction = input<boolean>(false);
  readonly signInQueryParams = input<{ redirectTo: string } | null>(null);
  readonly join = output<void>();

  readonly menuOpen = signal(false);
  readonly moreOpen = signal(false);

  private readonly atlasService = inject(AtlasService);
  readonly atlasWikiLink = this.atlasService.activeAtlasWikiLink;

  readonly primaryNavItems = [
    { route: '/wikis', icon: 'dashboard', label: 'Wikis', key: 'wikis', workspaceOnly: true },
    { route: '/chat', icon: 'chat', label: 'Chat', key: 'chat' },
    { route: '/business', icon: 'storefront', label: 'Business', key: 'business', workspaceOnly: true },
  ];

  readonly moreNavItems = [
    { route: '/dymaxion', icon: 'public', label: 'World Map', key: 'dymaxion', workspaceOnly: true },
    { route: '/upload', icon: 'neurology', label: 'Upload', key: 'upload' },
    { route: '/library', icon: 'library_books', label: 'Source Files', key: 'library' },
    { route: '/scrapper', icon: 'travel_explore', label: 'Scraper', key: 'scrapper', workspaceOnly: true },
    { route: '/wiki', icon: 'menu_book', label: 'Wiki', key: 'wiki' },
    { route: '/atlases', icon: 'settings', label: 'Settings', key: 'settings', workspaceOnly: true },
  ];

  readonly moreActive = computed(() =>
    this.moreNavItems.some(
      (item) => this.activePage() === item.key && this.shouldShowItem(item.key, item.workspaceOnly),
    ),
  );
  readonly showMoreItems = computed(() => this.moreOpen() || this.moreActive());
  readonly hasVisibleMoreItems = computed(() =>
    this.moreNavItems.some((item) => this.shouldShowItem(item.key, item.workspaceOnly)),
  );

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  toggleMore(): void {
    this.moreOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  openJoin(): void {
    this.closeMenu();
    this.join.emit();
  }

  shouldShowItem(key: string, workspaceOnly?: boolean): boolean {
    if (!this.adminNavigation()) {
      return key === 'chat';
    }

    if (this.publicSlug() && workspaceOnly) {
      return false;
    }

    if (this.hidePublicKnowledgeSurfaces() && key === 'library') {
      return false;
    }

    return true;
  }

  routeFor(key: string, fallbackRoute: string): string {
    const slug = this.publicSlug()?.trim();
    if (slug) {
      if (key === 'wiki') return `/wiki/${slug}`;
      return `/${key}/${slug}`;
    }
    return key === 'wiki' ? this.atlasWikiLink() : fallbackRoute;
  }

  homeLink(): string {
    return '/';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }
}
