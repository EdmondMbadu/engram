import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-chat',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './chat.html',
})
export class ChatComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isSigningOut = signal(false);
  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;

  readonly quickPrompts = [
    'What have I saved about transformer architecture?',
    'Find tensions between my product notes and research docs.',
    'Give me a concise brief from the latest imported sources.',
  ];

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
