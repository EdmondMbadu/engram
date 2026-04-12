import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-landing',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './landing.html',
})
export class LandingComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isSigningOut = signal(false);
  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly userAvatar = '/assets/living-atlas-logo.png';

  async signOut(): Promise<void> {
    this.isSigningOut.set(true);

    try {
      await this.authService.signOut();
      await this.router.navigateByUrl('/');
    } finally {
      this.isSigningOut.set(false);
    }
  }
}
