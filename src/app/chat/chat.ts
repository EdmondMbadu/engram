import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';

@Component({
  selector: 'app-chat',
  imports: [RouterLink, ThemeToggleComponent, MobileMenuComponent],
  templateUrl: './chat.html',
})
export class ChatComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  readonly isSigningOut = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;

  readonly userInitials = () => {
    const name = this.currentUserName();
    if (!name) return '?';
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  };

  readonly quickPrompts = [
    'What have I saved about transformer architecture?',
    'Find tensions between my product notes and research docs.',
    'Give me a concise brief from the latest imported sources.',
  ];

  toggleAvatarMenu(): void {
    this.avatarMenuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.querySelector('.avatar-menu-wrapper')?.contains(event.target as Node)) {
      this.avatarMenuOpen.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.isSigningOut.set(true);
    this.avatarMenuOpen.set(false);

    try {
      await this.authService.signOut();
      await this.router.navigateByUrl('/');
    } finally {
      this.isSigningOut.set(false);
    }
  }
}
