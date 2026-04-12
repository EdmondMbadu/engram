import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitForReady();

  if (authService.isAuthenticated() && authService.needsEmailVerification()) {
    await authService.refreshUser().catch(() => null);
  }

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/sign-in'], { queryParams: { redirectTo: state.url } });
  }

  return authService.needsEmailVerification()
    ? router.createUrlTree(['/verify-email'], { queryParams: { redirectTo: state.url } })
    : true;
};

export const guestOnlyGuard: CanActivateFn = async () => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitForReady();

  if (!authService.isAuthenticated()) {
    return true;
  }

  return authService.needsEmailVerification()
    ? router.createUrlTree(['/verify-email'])
    : router.createUrlTree(['/home']);
};
