import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { passwordsMatchValidator } from '../auth-form-validators';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-create-account',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggleComponent],
  templateUrl: './create-account.html',
})
export class CreateAccountComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly isSubmitting = signal(false);
  readonly submitError = signal<string | null>(null);

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

  async createAccount(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitError.set(null);
    this.isSubmitting.set(true);

    try {
      const { fullName, email, password, rememberMe } = this.form.getRawValue();
      const result = await this.authService.createAccount({
        fullName,
        email,
        password,
        remember: rememberMe,
        redirectTo: this.getRedirectUrl(),
      });
      await this.router.navigate(['/verify-email'], {
        queryParams: {
          redirectTo: this.getRedirectUrl(),
          sent: result.verificationEmailSent ? '1' : '0',
        },
      });
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async continueWithGoogle(): Promise<void> {
    this.submitError.set(null);
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

  private getRedirectUrl(): string {
    const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
    return this.isSafeRedirect(redirectTo) ? redirectTo : '/upload';
  }

  private isSafeRedirect(value: string | null): value is string {
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
  }
}
