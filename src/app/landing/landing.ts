import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { DocumentItem } from '../atlas.models';
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
  readonly atlasWikiLink = this.atlasService.activeAtlasWikiLink;
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  readonly isSigningOut = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly isUploading = this.documentsService.isUploading;
  readonly uploadError = this.documentsService.uploadError;
  readonly uploadProgress = this.documentsService.uploadProgress;
  readonly documents = this.documentsService.documents;
  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly userAvatar = '/assets/living-atlas-logo.png';

  readonly activeUploads = computed(() => {
    const progress = this.uploadProgress();
    return Object.entries(progress).map(([id, pct]) => ({ id, percentage: pct }));
  });

  readonly processingDocuments = computed(() =>
    this.documents().filter((d) => d.status === 'processing'),
  );

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
}
