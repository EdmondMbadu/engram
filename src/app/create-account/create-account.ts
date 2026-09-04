import { Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { passwordsMatchValidator } from '../auth-form-validators';
import { AuthStoryPanelComponent } from '../auth-story-panel/auth-story-panel';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-create-account',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggleComponent, AuthStoryPanelComponent],
  templateUrl: './create-account.html',
  styleUrl: '../auth-page.css',
})
export class CreateAccountComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly submissionMethod = signal<'email' | 'google' | null>(null);
  readonly isSubmitting = computed(() => this.submissionMethod() !== null);
  readonly submitError = signal<string | null>(null);
  readonly googleButtonLabel = computed(() =>
    this.submissionMethod() === 'google' ? $localize`Working...` : $localize`Continue with Google`,
  );
  readonly createButtonLabel = computed(() =>
    this.submissionMethod() === 'email' ? $localize`Creating Account...` : $localize`Create Account`,
  );
  readonly showPassword = signal(false);
  readonly redirectUrl = this.getRedirectUrl();

  readonly form = this.formBuilder.group(
    {
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      agreeToTerms: [false, [Validators.requiredTrue]],
      rememberMe: [true],
    },
    { validators: passwordsMatchValidator },
  );

  constructor() {
    const name = this.route.snapshot.queryParamMap.get('name')?.trim();
    const email = this.route.snapshot.queryParamMap.get('email')?.trim();
    if (name) {
      this.form.controls.fullName.setValue(name);
    }
    if (email) {
      this.form.controls.email.setValue(email);
    }

    this.form.valueChanges.subscribe(() => this.submitError.set(null));
  }

  async createAccount(): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }

    this.normalizeIdentityFields();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitError.set(null);
    this.submissionMethod.set('email');

    try {
      const { fullName, email, password, rememberMe } = this.form.getRawValue();
      const result = await this.authService.createAccount({
        fullName,
        email,
        password,
        remember: rememberMe,
        redirectTo: this.redirectUrl,
      });
      await this.router.navigate(['/verify-email'], {
        queryParams: {
          redirectTo: this.redirectUrl,
          sent: result.verificationEmailSent ? '1' : '0',
        },
      });
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
    } finally {
      this.submissionMethod.set(null);
    }
  }

  async continueWithGoogle(): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }

    this.submitError.set(null);
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

  normalizeIdentityFields(): void {
    const fullName = this.form.controls.fullName.getRawValue().trim().replace(/\s+/g, ' ');
    const email = this.form.controls.email.getRawValue().trim().toLowerCase();
    this.form.controls.fullName.setValue(fullName, { emitEvent: false });
    this.form.controls.email.setValue(email, { emitEvent: false });
  }

  private getRedirectUrl(): string {
    const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
    return this.isSafeRedirect(redirectTo) ? redirectTo : '/home';
  }

  private isSafeRedirect(value: string | null): value is string {
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
  }
}
