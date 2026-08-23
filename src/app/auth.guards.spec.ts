import { PLATFORM_ID, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { boardsRootRedirectGuard } from './auth.guards';

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
