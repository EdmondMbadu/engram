import { Component, computed, effect, ElementRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../auth.service';
import { AtlasService } from '../atlas.service';
import type { AtlasItem } from '../atlas.models';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-atlas-landing',
  imports: [FormsModule, RouterLink, ThemeToggleComponent],
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

  readonly isSignedIn = computed(() => !!this.authService.uid());
  readonly ownedAtlasesLoading = this.atlasService.isLoading;

  private readonly publicAtlas = signal<AtlasItem | null>(null);
  private readonly publicLookupDone = signal(false);

  readonly atlas = computed<AtlasItem | null>(() => {
    const slug = this.routeSlug();
    if (!slug) return null;
    const atlases = this.atlasService.atlases();
    const owned =
      atlases.find((a) => a.slug === slug) ??
      atlases.find((a) => this.atlasService.slugify(a.name ?? '') === slug) ??
      atlases.find((a) => a.id === slug) ??
      null;
    if (owned) return owned;
    return this.publicAtlas();
  });

  readonly isLoading = computed(() => {
    if (this.atlas()) return false;
    if (this.isSignedIn() && this.ownedAtlasesLoading()) return true;
    return !this.publicLookupDone();
  });

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

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly editError = signal<string | null>(null);

  readonly descriptionDraft = signal('');
  readonly logoUrlDraft = signal('');
  readonly heroUrlDraft = signal('');
  readonly publicDraft = signal(false);

  readonly togglingPublic = signal(false);
  readonly uploadingLogo = signal(false);
  readonly uploadingHero = signal(false);

  constructor() {
    effect(() => {
      const slug = this.routeSlug();
      if (!slug) return;
      const atlases = this.atlasService.atlases();
      const inOwned = atlases.some(
        (a) => a.slug === slug || this.atlasService.slugify(a.name ?? '') === slug || a.id === slug,
      );
      if (inOwned) {
        this.publicLookupDone.set(true);
        return;
      }
      if (this.isSignedIn() && this.ownedAtlasesLoading()) return;
      this.publicLookupDone.set(false);
      void this.atlasService
        .getPublicAtlasBySlug(slug)
        .then((found) => this.publicAtlas.set(found))
        .catch(() => this.publicAtlas.set(null))
        .finally(() => this.publicLookupDone.set(true));
    });
  }

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

  private activateThisAtlas(): void {
    const id = this.atlas()?.id;
    if (id) this.atlasService.setActive(id);
  }

  openChat(): void {
    this.activateThisAtlas();
    void this.router.navigateByUrl('/chat');
  }

  openUpload(): void {
    this.activateThisAtlas();
    void this.router.navigateByUrl('/home');
  }

  openManage(): void {
    this.activateThisAtlas();
    void this.router.navigateByUrl('/atlases');
  }

  openLibrary(): void {
    this.activateThisAtlas();
    void this.router.navigateByUrl('/library');
  }

  openWiki(): void {
    this.activateThisAtlas();
    void this.router.navigateByUrl('/wiki');
  }

  startEdit(): void {
    const a = this.atlas();
    if (!a) return;
    this.descriptionDraft.set(a.description ?? '');
    this.logoUrlDraft.set(a.logo_url ?? '');
    this.heroUrlDraft.set(a.hero_url ?? '');
    this.publicDraft.set(!!a.is_public);
    this.editError.set(null);
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.editError.set(null);
  }

  async saveEdit(): Promise<void> {
    const a = this.atlas();
    if (!a) return;
    this.saving.set(true);
    this.editError.set(null);
    try {
      await this.atlasService.updateAtlas(a.id, {
        description: this.descriptionDraft().trim() || null,
        logo_url: this.logoUrlDraft().trim() || null,
        hero_url: this.heroUrlDraft().trim() || null,
        is_public: this.publicDraft(),
      });
      this.editing.set(false);
    } catch (error) {
      this.editError.set(error instanceof Error ? error.message : 'Failed to save changes.');
    } finally {
      this.saving.set(false);
    }
  }

  async onImageSelected(kind: 'logo' | 'hero', event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const a = this.atlas();
    if (!a || !this.isOwner()) return;

    this.editError.set(null);
    const busy = kind === 'logo' ? this.uploadingLogo : this.uploadingHero;
    busy.set(true);
    try {
      const url = await this.atlasService.uploadAtlasImage(a.id, kind, file);
      if (kind === 'logo') {
        this.logoUrlDraft.set(url);
      } else {
        this.heroUrlDraft.set(url);
      }
      await this.atlasService.updateAtlas(a.id, kind === 'logo' ? { logo_url: url } : { hero_url: url });
    } catch (error) {
      this.editError.set(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      busy.set(false);
    }
  }

  async togglePublic(): Promise<void> {
    const a = this.atlas();
    if (!a || !this.isOwner()) return;
    this.togglingPublic.set(true);
    try {
      await this.atlasService.updateAtlas(a.id, { is_public: !a.is_public });
    } finally {
      this.togglingPublic.set(false);
    }
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
