import { Component, HostListener, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-mobile-menu',
  imports: [RouterLink],
  templateUrl: './mobile-menu.html',
})
export class MobileMenuComponent {
  /** Which nav item is currently active */
  readonly activePage = input<string>('home');

  readonly menuOpen = signal(false);

  readonly navItems = [
    { route: '/chat', icon: 'chat', label: 'New Chat', key: 'chat' },
    { route: '/home', icon: 'neurology', label: 'Knowledge Base', key: 'home' },
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
