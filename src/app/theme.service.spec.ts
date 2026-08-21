import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const storageKey = 'living-atlast-theme';

  beforeEach(() => {
    window.localStorage.removeItem(storageKey);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    window.localStorage.removeItem(storageKey);
  });

  it('uses light mode when no preference has been saved', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.currentTheme()).toBe('light');
  });

  it('restores a saved theme and continues to toggle it', () => {
    window.localStorage.setItem(storageKey, 'dark');
    const service = TestBed.inject(ThemeService);

    expect(service.currentTheme()).toBe('dark');

    service.toggleTheme();
    expect(service.currentTheme()).toBe('light');
  });
});
