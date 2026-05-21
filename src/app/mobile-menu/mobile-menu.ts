import { Component, HostListener, inject, input, output, signal } from '@angular/core';
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

  private readonly atlasService = inject(AtlasService);
  readonly atlasHomeLink = this.atlasService.activeAtlasHomeLink;
  readonly atlasWikiLink = this.atlasService.activeAtlasWikiLink;

  readonly navItems = [
    { route: '/wikis', icon: 'dashboard', label: 'Wikis', key: 'wikis', workspaceOnly: true },
    { route: '/chat', icon: 'chat', label: 'Chat', key: 'chat' },
    { route: '/upload', icon: 'neurology', label: 'Upload', key: 'upload' },
    { route: '/library', icon: 'library_books', label: 'Source Files', key: 'library' },
    { route: '/scrapper', icon: 'travel_explore', label: 'Scrapper', key: 'scrapper', workspaceOnly: true },
    { route: '/wiki', icon: 'menu_book', label: 'Wiki', key: 'wiki' },
  ];

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
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
    const slug = this.publicSlug()?.trim();
    return slug ? `/atlas/${slug}` : this.atlasHomeLink();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }
}
