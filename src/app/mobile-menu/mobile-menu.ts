import { Component, HostListener, inject, input, signal } from '@angular/core';
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

  readonly menuOpen = signal(false);

  private readonly atlasService = inject(AtlasService);
  readonly atlasHomeLink = this.atlasService.activeAtlasHomeLink;

  readonly navItems = [
    { route: '/chat', icon: 'chat', label: 'New Chat', key: 'chat' },
    { route: '/upload', icon: 'neurology', label: 'Upload', key: 'upload' },
    { route: '/library', icon: 'library_books', label: 'Library', key: 'library' },
    { route: '/wiki', icon: 'menu_book', label: 'Wiki', key: 'wiki' },
  ];

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }
}
