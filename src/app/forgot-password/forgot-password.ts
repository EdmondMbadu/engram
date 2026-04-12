import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggleComponent],
  templateUrl: './forgot-password.html',
})
export class ForgotPasswordComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isSubmitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async sendResetLink(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitError.set(null);
    this.successMessage.set(null);
    this.isSubmitting.set(true);

    try {
      await this.authService.sendPasswordReset(this.form.controls.email.getRawValue());
      this.successMessage.set(
        'If an account exists for that address, a reset email has been sent.',
      );
      this.form.reset({ email: '' });
    } catch (error) {
      this.submitError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async returnToSignIn(): Promise<void> {
    await this.router.navigate(['/sign-in']);
  }
}
