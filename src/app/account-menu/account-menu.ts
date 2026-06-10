import { Component, ElementRef, HostListener, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-account-menu',
  imports: [RouterLink],
  templateUrl: './account-menu.html',
})
export class AccountMenuComponent {
  private readonly authService = inject(AuthService);
  private readonly elementRef = inject(ElementRef);
  private readonly router = inject(Router);

  readonly signInClass = input(
    'primary-btn !px-3 !py-2 text-xs sm:!px-5 sm:!py-2.5 sm:!text-sm',
  );
  readonly signInLabel = input('Sign In');
  readonly signInQueryParams = input<Record<string, string> | null>(null);

  readonly menuOpen = signal(false);
  readonly signingOut = signal(false);

  readonly isSignedIn = this.authService.isAuthenticated;
  readonly isAdmin = this.authService.isAdmin;
  readonly userName = this.authService.displayName;
  readonly userEmail = this.authService.email;
  readonly userInitials = computed(() => {
    const name = this.userName().trim();
    const email = this.userEmail().trim();
    const source = name || email || 'U';
    const parts = source.includes('@') ? [source[0] ?? 'U'] : source.split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0] ?? '').join('').toUpperCase() || 'U';
  });

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  async signOut(): Promise<void> {
    if (this.signingOut()) {
      return;
    }

    this.signingOut.set(true);
    try {
      await this.authService.signOut();
      this.closeMenu();
      await this.router.navigate(['/']);
    } finally {
      this.signingOut.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeMenu();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }
}
