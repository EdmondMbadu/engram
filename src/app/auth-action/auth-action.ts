import { isPlatformBrowser } from '@angular/common';
import { Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { passwordsMatchValidator } from '../auth-form-validators';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

type AuthActionState = 'processing' | 'ready' | 'success' | 'error';

@Component({
  selector: 'app-auth-action',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggleComponent],
  templateUrl: './auth-action.html',
})
export class AuthActionComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly state = signal<AuthActionState>('processing');
  readonly isSubmitting = signal(false);
  readonly title = signal('Checking link');
  readonly description = signal('Please wait while we validate this email action.');
  readonly submitError = signal<string | null>(null);

  readonly form = this.formBuilder.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  private resetCode: string | null = null;

  constructor() {
    if (this.isBrowser) {
      void this.handleAction();
    }
  }

  async saveNewPassword(): Promise<void> {
    if (!this.resetCode) {
      this.state.set('error');
      this.title.set('Password reset unavailable');
      this.description.set('Request a new password reset email and try again.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitError.set(null);
    this.isSubmitting.set(true);

    try {
      await this.authService.completePasswordReset(
        this.resetCode,
        this.form.controls.password.getRawValue(),
      );
      this.state.set('success');
      this.title.set('Password updated');
      this.description.set('Your password has been reset. Sign in with your new password.');
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async continue(): Promise<void> {
    const flow = this.route.snapshot.queryParamMap.get('flow');
    const redirectTo = this.getRedirectUrl();

    if (flow === 'verifyEmailComplete' || this.authService.isAuthenticated()) {
      await this.authService.refreshUser().catch(() => null);
    }

    if (this.authService.isAuthenticated() && !this.authService.needsEmailVerification()) {
      await this.router.navigateByUrl(redirectTo);
      return;
    }

    await this.router.navigate(['/sign-in'], {
      queryParams: {
        redirectTo,
        ...(flow === 'resetPasswordComplete' ? { reset: 'complete' } : {}),
      },
    });
  }

  private async handleAction(): Promise<void> {
    const query = this.route.snapshot.queryParamMap;
    const flow = query.get('flow');
    const mode = query.get('mode');
    const oobCode = query.get('oobCode');

    if (flow === 'verifyEmailComplete') {
      await this.authService.refreshUser().catch(() => null);
      this.state.set('success');
      this.title.set('Email verified');
      this.description.set('Your email has been verified. You can continue to your workspace.');
      return;
    }

    if (flow === 'resetPasswordComplete') {
      this.state.set('success');
      this.title.set('Password reset complete');
      this.description.set('Your password has been updated. Sign in with your new password.');
      return;
    }

    if (!mode || !oobCode) {
      this.state.set('error');
      this.title.set('Invalid link');
      this.description.set('This email action link is missing required information.');
      return;
    }

    try {
      switch (mode) {
        case 'verifyEmail':
          await this.authService.applyEmailVerificationCode(oobCode);
          this.state.set('success');
          this.title.set('Email verified');
          this.description.set('Your email has been verified. You can continue now.');
          return;
        case 'resetPassword':
          await this.authService.validatePasswordResetCode(oobCode);
          this.resetCode = oobCode;
          this.state.set('ready');
          this.title.set('Choose a new password');
          this.description.set('Set a new password for your Living Atlas account.');
          return;
        case 'recoverEmail': {
          const restoredEmail = await this.authService.restoreEmailFromCode(oobCode);
          this.state.set('success');
          this.title.set('Email restored');
          this.description.set(
            restoredEmail
              ? `${restoredEmail} has been restored for this account.`
              : 'Your email address has been restored for this account.',
          );
          return;
        }
        default:
          this.state.set('error');
          this.title.set('Unsupported action');
          this.description.set('This email action is not supported in the app.');
      }
    } catch (error) {
      this.state.set('error');
      this.submitError.set(this.authService.toFriendlyError(error));
      this.title.set('Link unavailable');
      this.description.set('Request a fresh email and try again.');
    }
  }

  private getRedirectUrl(): string {
    const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
    if (this.isSafeRedirect(redirectTo)) {
      return redirectTo;
    }

    const continueUrl = this.route.snapshot.queryParamMap.get('continueUrl');
    if (continueUrl && this.isBrowser) {
      try {
        const url = new URL(continueUrl, window.location.origin);
        const nestedRedirect = url.searchParams.get('redirectTo');
        if (this.isSafeRedirect(nestedRedirect)) {
          return nestedRedirect;
        }
      } catch {
        return '/home';
      }
    }

    return '/home';
  }

  private isSafeRedirect(value: string | null): value is string {
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
  }
}
