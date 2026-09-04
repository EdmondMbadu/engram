import { Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { AuthStoryPanelComponent } from '../auth-story-panel/auth-story-panel';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-sign-in',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggleComponent, AuthStoryPanelComponent],
  templateUrl: './sign-in.html',
  styleUrl: '../auth-page.css',
})
export class SignInComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly submissionMethod = signal<'email' | 'google' | null>(null);
  readonly isSubmitting = computed(() => this.submissionMethod() !== null);
  readonly submitError = signal<string | null>(null);
  readonly infoMessage = signal(this.getInitialInfoMessage());
  readonly googleButtonLabel = computed(() =>
    this.submissionMethod() === 'google' ? $localize`Working...` : $localize`Continue with Google`,
  );
  readonly emailButtonLabel = computed(() =>
    this.submissionMethod() === 'email' ? $localize`Signing In...` : $localize`Sign In`,
  );
  readonly showPassword = signal(false);
  readonly redirectUrl = this.getRedirectUrl();

  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    rememberMe: [true],
  });

  constructor() {
    this.form.valueChanges.subscribe(() => this.submitError.set(null));
  }

  async signInWithEmail(): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }

    this.normalizeEmail();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitError.set(null);
    this.infoMessage.set(null);
    this.submissionMethod.set('email');

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
            redirectTo: this.redirectUrl,
            email: email.trim().toLowerCase(),
          },
        });
        return;
      }

      await this.router.navigateByUrl(this.redirectUrl);
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
    } finally {
      this.submissionMethod.set(null);
    }
  }

  async signInWithGoogle(): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }

    this.submitError.set(null);
    this.infoMessage.set(null);
    this.submissionMethod.set('google');

    try {
      const result = await this.authService.signInWithGoogle(
        this.form.controls.rememberMe.getRawValue(),
      );

      if (result.needsEmailVerification) {
        await this.router.navigate(['/verify-email'], {
          queryParams: { redirectTo: this.redirectUrl },
        });
        return;
      }

      await this.router.navigateByUrl(this.redirectUrl);
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
    } finally {
      this.submissionMethod.set(null);
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  normalizeEmail(): void {
    const email = this.form.controls.email.getRawValue().trim().toLowerCase();
    this.form.controls.email.setValue(email, { emitEvent: false });
  }

  private getInitialInfoMessage(): string | null {
    if (this.route.snapshot.queryParamMap.has('redirectTo')) {
      return $localize`Sign in to continue to your workspace.`;
    }

    if (this.route.snapshot.queryParamMap.get('reset') === 'sent') {
      return $localize`Password reset email sent if an account exists for that address.`;
    }

    if (this.route.snapshot.queryParamMap.get('reset') === 'complete') {
      return $localize`Your password has been updated. Sign in with your new password.`;
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
