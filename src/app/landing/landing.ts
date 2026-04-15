import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { AtlasService } from '../atlas.service';
import { DocumentsService } from '../documents.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { AtlasSwitcherComponent } from '../atlas-switcher/atlas-switcher';
import { AtlasBadgeComponent } from '../atlas-badge/atlas-badge';

@Component({
  selector: 'app-landing',
  imports: [RouterLink, ThemeToggleComponent, MobileMenuComponent, AtlasSwitcherComponent, AtlasBadgeComponent],
  templateUrl: './landing.html',
})
export class LandingComponent {
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly documentsService = inject(DocumentsService);

  readonly atlasHomeLink = this.atlasService.activeAtlasHomeLink;
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  readonly isSigningOut = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly isUploading = this.documentsService.isUploading;
  readonly uploadError = this.documentsService.uploadError;
  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly userAvatar = '/assets/living-atlas-logo.png';

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

  toggleAvatarMenu(): void {
    this.avatarMenuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.querySelector('.avatar-menu-wrapper')?.contains(event.target as Node)) {
      this.avatarMenuOpen.set(false);
    }
  }

  openFilePicker(): void {
    const input = this.elementRef.nativeElement.querySelector('#landingFileInput') as HTMLInputElement;
    input?.click();
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      return;
    }

    await this.documentsService.uploadFiles(input.files);
    input.value = '';

    if (!this.uploadError()) {
      await this.router.navigateByUrl('/library');
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
