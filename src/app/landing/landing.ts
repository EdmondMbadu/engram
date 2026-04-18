import { Component, ElementRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { AtlasItem, DocumentItem } from '../atlas.models';
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
  private readonly route = inject(ActivatedRoute);

  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);
  readonly routeSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug'))),
    { initialValue: this.route.snapshot.paramMap.get('slug') },
  );

  readonly isSigningOut = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly publicAtlas = signal<AtlasItem | null>(null);
  readonly publicLookupDone = signal(false);
  readonly isPublicView = computed(() => !!this.routeSlug());
  readonly publicNotFound = computed(
    () => this.isPublicView() && this.publicLookupDone() && !this.publicAtlas(),
  );
  readonly isUploading = this.documentsService.isUploading;
  readonly uploadError = this.documentsService.uploadError;
  readonly uploadProgress = this.documentsService.uploadProgress;
  readonly documents = this.documentsService.documents;
  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly userAvatar = '/assets/living-atlas-logo.png';
  readonly atlasHomeLink = computed(() => this.publicRoute('atlas') ?? this.atlasService.activeAtlasHomeLink());
  readonly atlasWikiLink = computed(() => this.publicRoute('wiki') ?? this.atlasService.activeAtlasWikiLink());
  readonly chatLink = computed(() => this.publicRoute('chat') ?? '/chat');
  readonly uploadLink = computed(() => this.publicRoute('upload') ?? '/upload');
  readonly libraryLink = computed(() => this.publicRoute('library') ?? '/library');
  readonly pageTitle = computed(() =>
    this.isPublicView()
      ? `Expand ${this.atlasService.displayName(this.publicAtlas())}`
      : 'Welcome.',
  );

  readonly activeUploads = computed(() => {
    const progress = this.uploadProgress();
    return Object.entries(progress).map(([id, pct]) => ({ id, percentage: pct }));
  });

  readonly processingDocuments = computed(() =>
    this.documents().filter((d) => d.status === 'processing'),
  );

  constructor() {
    effect(() => {
      const slug = this.routeSlug();
      if (!slug) {
        this.publicAtlas.set(null);
        this.publicLookupDone.set(true);
        return;
      }

      this.publicLookupDone.set(false);
      void this.atlasService
        .getPublicAtlasBySlug(slug)
        .then((atlas) => this.publicAtlas.set(atlas))
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
    if (this.isPublicView()) {
      return;
    }
    const input = this.elementRef.nativeElement.querySelector('#landingFileInput') as HTMLInputElement;
    input?.click();
  }

  async onFilesSelected(event: Event): Promise<void> {
    if (this.isPublicView()) {
      return;
    }
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

  processingLabel(document: DocumentItem): string {
    switch (document.processing_stage) {
      case 'extracting':
        return 'Extracting text';
      case 'writing_extracts':
        return 'Saving source extracts';
      case 'compiling_knowledge':
        return 'Compiling knowledge';
      case 'writing_entries':
        return 'Writing knowledge entries';
      case 'queuing_topics':
        return 'Queueing wiki updates';
      case 'compiling_articles':
        return 'Compiling wiki articles';
      default:
        return 'Processing';
    }
  }

  ingestionProgress(document: DocumentItem): number {
    const stageWeights: Record<string, number> = {
      queued: 2,
      extracting: 10,
      writing_extracts: 25,
      compiling_knowledge: 45,
      writing_entries: 65,
      queuing_topics: 75,
      compiling_articles: 88,
    };

    const stage = document.processing_stage ?? 'queued';
    const base = stageWeights[stage] ?? 5;

    if (stage === 'compiling_knowledge' && document.total_chunks && document.total_chunks > 0) {
      const chunkProgress = (document.processed_chunks ?? 0) / document.total_chunks;
      return Math.round(base + chunkProgress * 20);
    }

    return base;
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

  private publicRoute(segment: 'atlas' | 'chat' | 'upload' | 'library' | 'wiki'): string | null {
    if (!this.isPublicView()) {
      return null;
    }

    const atlas = this.publicAtlas();
    const slug = atlas?.slug?.trim() || this.routeSlug()?.trim() || atlas?.id;
    if (!slug) {
      return null;
    }

    return segment === 'atlas' ? `/atlas/${slug}` : `/${segment}/${slug}`;
  }
}
