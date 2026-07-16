import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  inject,
  LOCALE_ID,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import {
  localizedPath,
  LOCALE_STORAGE_KEY,
  supportedLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '../i18n/locales';

@Component({
  selector: 'app-language-switcher',
  templateUrl: './language-switcher.html',
  styleUrl: './language-switcher.css',
})
export class LanguageSwitcherComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly localeId = inject(LOCALE_ID);

  readonly locales = SUPPORTED_LOCALES;
  readonly currentLocale = supportedLocale(this.localeId);
  readonly openLabel = $localize`Change language`;
  readonly menuOpen = signal(false);

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  selectLocale(locale: SupportedLocale): void {
    this.closeMenu();
    if (!isPlatformBrowser(this.platformId) || locale.id === this.currentLocale.id) return;

    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale.id);
    const targetPath = localizedPath(window.location.pathname, locale);
    window.location.assign(`${targetPath}${window.location.search}${window.location.hash}`);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) this.closeMenu();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }
}
