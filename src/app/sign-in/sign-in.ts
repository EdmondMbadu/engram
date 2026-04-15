import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-sign-in',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggleComponent],
  templateUrl: './sign-in.html',
})
export class SignInComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly isSubmitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly infoMessage = signal(this.getInitialInfoMessage());

  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    rememberMe: [true],
  });

  async signInWithEmail(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitError.set(null);
    this.infoMessage.set(null);
    this.isSubmitting.set(true);

    try {
      const { email, password, rememberMe } = this.form.getRawValue();
      const result = await this.authService.signInWithEmail({
        email,
        password,
        remember: rememberMe,
      });

      if (result.needsEmailVerification) {
        await this.router.navigate(['/verify-email'], {
          queryParams: {
            redirectTo: this.getRedirectUrl(),
            email: email.trim().toLowerCase(),
          },
        });
        return;
      }

      await this.router.navigateByUrl(this.getRedirectUrl());
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async signInWithGoogle(): Promise<void> {
    this.submitError.set(null);
    this.infoMessage.set(null);
    this.isSubmitting.set(true);

    try {
      const result = await this.authService.signInWithGoogle(
        this.form.controls.rememberMe.getRawValue(),
      );

      if (result.needsEmailVerification) {
        await this.router.navigate(['/verify-email'], {
          queryParams: { redirectTo: this.getRedirectUrl() },
        });
        return;
      }

      await this.router.navigateByUrl(this.getRedirectUrl());
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private getInitialInfoMessage(): string | null {
    if (this.route.snapshot.queryParamMap.has('redirectTo')) {
      return 'Sign in to continue to your workspace.';
    }

    if (this.route.snapshot.queryParamMap.get('reset') === 'sent') {
      return 'Password reset email sent if an account exists for that address.';
    }

    if (this.route.snapshot.queryParamMap.get('reset') === 'complete') {
      return 'Your password has been updated. Sign in with your new password.';
    }

    return null;
  }

  private getRedirectUrl(): string {
    const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
    return this.isSafeRedirect(redirectTo) ? redirectTo : '/upload';
  }

  private isSafeRedirect(value: string | null): value is string {
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
  }
}
