import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

type Theme = 'light' | 'dark';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('engram core');
  protected readonly currentTheme = signal<Theme>('dark');

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
        window.localStorage.setItem('engram-theme', theme);
      }
    });
  }

  protected toggleTheme(): void {
    this.currentTheme.update((theme) => (theme === 'dark' ? 'light' : 'dark'));
  }

  protected themeActionLabel(): string {
    return this.currentTheme() === 'dark' ? 'Light mode' : 'Dark mode';
  }

  protected themeIcon(): string {
    return this.currentTheme() === 'dark' ? 'light_mode' : 'dark_mode';
  }

  private getInitialTheme(): Theme {
    if (!this.isBrowser) {
      return 'dark';
    }

    const savedTheme = window.localStorage.getItem('engram-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
}
