import { Component, computed, ElementRef, HostListener, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../auth.service';
import { AtlasService } from '../atlas.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { AtlasBadgeComponent } from '../atlas-badge/atlas-badge';

@Component({
  selector: 'app-atlas-landing',
  imports: [RouterLink, ThemeToggleComponent, MobileMenuComponent, AtlasBadgeComponent],
  templateUrl: './atlas-landing.html',
})
export class AtlasLandingComponent {
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  private readonly routeSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug'))),
    { initialValue: this.route.snapshot.paramMap.get('slug') },
  );

  readonly atlas = computed(() => {
    const slug = this.routeSlug();
    if (!slug) return null;
    const atlases = this.atlasService.atlases();
    return (
      atlases.find((a) => a.slug === slug) ??
      atlases.find((a) => this.atlasService.slugify(a.name ?? '') === slug) ??
      atlases.find((a) => a.id === slug) ??
      null
    );
  });

  readonly isLoading = this.atlasService.isLoading;
  readonly notFound = computed(() => !this.isLoading() && !!this.routeSlug() && !this.atlas());

  readonly isOwner = computed(() => {
    const atlas = this.atlas();
    const uid = this.authService.uid();
    return !!atlas && !!uid && atlas.user_id === uid;
  });

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

  readonly displayName = computed(() => this.atlasService.displayName(this.atlas()));

  openChat(): void {
    const id = this.atlas()?.id;
    if (id) this.atlasService.setActive(id);
    void this.router.navigateByUrl('/chat');
  }

  openUpload(): void {
    const id = this.atlas()?.id;
    if (id) this.atlasService.setActive(id);
    void this.router.navigateByUrl('/home');
  }

  openManage(): void {
    const id = this.atlas()?.id;
    if (id) this.atlasService.setActive(id);
    void this.router.navigateByUrl('/atlases');
  }

  openLibrary(): void {
    const id = this.atlas()?.id;
    if (id) this.atlasService.setActive(id);
    void this.router.navigateByUrl('/library');
  }

  openWiki(): void {
    const id = this.atlas()?.id;
    if (id) this.atlasService.setActive(id);
    void this.router.navigateByUrl('/wiki');
  }

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
