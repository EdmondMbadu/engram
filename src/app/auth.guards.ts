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

  return authService.isAuthenticated()
    ? true
    : router.createUrlTree(['/sign-in'], { queryParams: { redirectTo: state.url } });
};

export const guestOnlyGuard: CanActivateFn = async () => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitForReady();

  return authService.isAuthenticated() ? router.createUrlTree(['/home']) : true;
};
