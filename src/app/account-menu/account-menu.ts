import { Component, ElementRef, HostListener, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { profileIconByCode, profileIconForSeed } from '../profile/profile-icons';

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
  readonly profile = this.authService.profile;
  readonly userName = this.authService.displayName;
  readonly userEmail = this.authService.email;
  readonly userPhotoUrl = computed(() => this.profile()?.profilePictureType === 'image' ? this.profile()?.photoURL ?? '' : '');
  readonly userIcon = computed(() =>
    profileIconByCode(this.profile()?.profileIcon) ?? profileIconForSeed(this.authService.uid() || this.userEmail() || this.userName()),
  );
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
