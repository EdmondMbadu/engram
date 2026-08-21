import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly currentTheme = signal<Theme>('light');

  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  constructor() {
    this.currentTheme.set(this.getInitialTheme());

    effect(() => {
      const theme = this.currentTheme();
      const root = this.document.documentElement;
      root.setAttribute('data-theme', theme);
      root.style.colorScheme = theme;

      if (this.isBrowser) {
        window.localStorage.setItem('living-atlast-theme', theme);
      }
    });
  }

  toggleTheme(): void {
    this.currentTheme.update((theme) => (theme === 'dark' ? 'light' : 'dark'));
  }

  themeActionLabel(): string {
    return this.currentTheme() === 'dark' ? $localize`Light mode` : $localize`Dark mode`;
  }

  private getInitialTheme(): Theme {
    if (!this.isBrowser) {
      return 'light';
    }

    const savedTheme = window.localStorage.getItem('living-atlast-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }

    return 'light';
  }
}
