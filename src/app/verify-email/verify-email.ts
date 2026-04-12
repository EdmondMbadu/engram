import { isPlatformBrowser } from '@angular/common';
import { Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-verify-email',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './verify-email.html',
})
export class VerifyEmailComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly isRefreshing = signal(false);
  readonly isResending = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(this.getInitialInfoMessage());

  readonly currentUser = this.authService.user;
  readonly currentEmail = this.authService.email;

  constructor() {
    if (this.isBrowser) {
      void this.redirectVerifiedUsers();
    }
  }

  async refreshStatus(): Promise<void> {
    this.submitError.set(null);
    this.infoMessage.set(null);
    this.isRefreshing.set(true);

    try {
      const user = await this.authService.refreshUser();
      if (user && !this.authService.needsEmailVerification()) {
        await this.router.navigateByUrl(this.getRedirectUrl());
        return;
      }

      this.infoMessage.set(
        'Your account is still waiting for verification. Open the latest email and click the verification link.',
      );
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isRefreshing.set(false);
    }
  }

  async resendEmail(): Promise<void> {
    this.submitError.set(null);
    this.infoMessage.set(null);
    this.isResending.set(true);

    try {
      const sent = await this.authService.resendEmailVerification(this.getRedirectUrl());
      this.infoMessage.set(
        sent
          ? 'Verification email sent. Check your inbox and spam folder.'
          : 'Your email is already verified. You can continue now.',
      );

      if (!this.authService.needsEmailVerification()) {
        await this.router.navigateByUrl(this.getRedirectUrl());
      }
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isResending.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigate(['/sign-in'], {
      queryParams: { redirectTo: this.getRedirectUrl() },
    });
  }

  private async redirectVerifiedUsers(): Promise<void> {
    await this.authService.waitForReady();

    if (this.authService.isAuthenticated() && this.authService.needsEmailVerification()) {
      await this.authService.refreshUser().catch(() => null);
    }

    if (this.authService.isAuthenticated() && !this.authService.needsEmailVerification()) {
      await this.router.navigateByUrl(this.getRedirectUrl());
    }
  }

  private getInitialInfoMessage(): string | null {
    if (this.route.snapshot.queryParamMap.get('sent') === '1') {
      return 'We sent a verification email. Open it to activate your account.';
    }

    if (this.route.snapshot.queryParamMap.get('sent') === '0') {
      return 'Your account was created, but we could not confirm email delivery. Use resend verification below.';
    }

    return null;
  }

  private getRedirectUrl(): string {
    const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
    return this.isSafeRedirect(redirectTo) ? redirectTo : '/home';
  }

  private isSafeRedirect(value: string | null): value is string {
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
  }
}
