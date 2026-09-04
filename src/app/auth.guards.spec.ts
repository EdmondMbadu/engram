import { PLATFORM_ID, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { boardsRootRedirectGuard, guestOnlyGuard } from './auth.guards';

describe('boardsRootRedirectGuard', () => {
  const isAuthenticated = signal(true);
  const displayName = signal('Edmond Mbadu');

  beforeEach(() => {
    isAuthenticated.set(true);
    displayName.set('Edmond Mbadu');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: AuthService,
          useValue: { isAuthenticated, displayName },
        },
      ],
    });
  });

  it('redirects a signed-in root visit before the boards component activates', () => {
    const result = runGuard({});
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/boards/u/edmond-mbadu');
  });

  it('keeps the public boards root available to signed-out visitors', () => {
    isAuthenticated.set(false);
    expect(runGuard({})).toBeTrue();
  });

  it('keeps the nearby-gems launch URL on the boards root', () => {
    expect(runGuard({ create: 'gems' })).toBeTrue();
  });

  function runGuard(queryParams: Record<string, string>): unknown {
    const route = { queryParamMap: convertToParamMap(queryParams) } as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => boardsRootRedirectGuard(
      route,
      {} as RouterStateSnapshot,
    ));
  }
});

describe('guestOnlyGuard', () => {
  const isAuthenticated = signal(false);
  const needsEmailVerification = signal(false);

  beforeEach(() => {
    isAuthenticated.set(false);
    needsEmailVerification.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated,
            needsEmailVerification,
            waitForReady: async () => undefined,
          },
        },
      ],
    });
  });

  it('allows signed-out visitors to open account pages', async () => {
    expect(await runGuestGuard('/wikis')).toBeTrue();
  });

  it('preserves a safe destination for an existing signed-in account', async () => {
    isAuthenticated.set(true);

    const result = await runGuestGuard('/pricing?audience=general');

    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/pricing?audience=general');
  });

  it('preserves the destination while an existing account verifies its email', async () => {
    isAuthenticated.set(true);
    needsEmailVerification.set(true);

    const result = await runGuestGuard('/wikis');

    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/verify-email?redirectTo=%2Fwikis');
  });

  it('rejects external redirect attempts', async () => {
    isAuthenticated.set(true);

    const result = await runGuestGuard('//example.com');

    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/home');
  });

  function runGuestGuard(redirectTo: string | null): Promise<unknown> {
    const route = {
      queryParamMap: convertToParamMap(redirectTo ? { redirectTo } : {}),
    } as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => guestOnlyGuard(
      route,
      {} as RouterStateSnapshot,
    )) as Promise<unknown>;
  }
});
