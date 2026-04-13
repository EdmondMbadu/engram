import { Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { DocumentItem } from '../atlas.models';
import { AuthService } from '../auth.service';
import { DocumentsService } from '../documents.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-library',
  imports: [FormsModule, RouterLink, ThemeToggleComponent, MobileMenuComponent],
  templateUrl: './library.html',
})
export class LibraryComponent {
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  private readonly authService = inject(AuthService);
  private readonly documentsService = inject(DocumentsService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  readonly isSigningOut = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly urlToImport = signal('');

  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly documents = this.documentsService.documents;
  readonly isLoading = this.documentsService.isLoading;
  readonly isUploading = this.documentsService.isUploading;
  readonly uploadError = this.documentsService.uploadError;
  readonly deleteError = this.documentsService.deleteError;
  readonly stats = this.documentsService.stats;
  readonly uploadProgress = this.documentsService.uploadProgress;
  readonly deletingDocumentIds = this.documentsService.deletingDocumentIds;

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

  openFilePicker(): void {
    this.fileInput?.nativeElement.click();
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      return;
    }

    await this.documentsService.uploadFiles(input.files);
    input.value = '';
  }

  async submitUrl(): Promise<void> {
    const url = this.urlToImport().trim();
    if (!url) {
      return;
    }

    await this.documentsService.submitUrl(url);
    this.urlToImport.set('');
  }

  async downloadDocument(document: DocumentItem): Promise<void> {
    const downloadUrl = await this.documentsService.getDownloadUrl(document);
    if (downloadUrl) {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    }
  }

  async deleteDocument(document: DocumentItem): Promise<void> {
    const label = document.title || document.filename;
    const confirmed = window.confirm(
      `Delete "${label}"?\n\nThis will remove the file, its extracts, its knowledge entries, and update affected wiki topics.`,
    );

    if (!confirmed) {
      return;
    }

    await this.documentsService.deleteDocument(document.id);
  }

  iconForDocument(document: DocumentItem): string {
    switch (document.file_type) {
      case 'pdf':
        return 'picture_as_pdf';
      case 'doc':
      case 'docx':
        return 'description';
      case 'ppt':
      case 'pptx':
        return 'slideshow';
      case 'png':
      case 'jpg':
      case 'jpeg':
        return 'image';
      case 'url':
        return 'link';
      case 'md':
        return 'article';
      default:
        return 'text_snippet';
    }
  }

  iconClasses(document: DocumentItem): string {
    switch (document.file_type) {
      case 'pdf':
        return 'bg-[rgba(59,175,98,0.12)] text-[#8fd9a8]';
      case 'doc':
      case 'docx':
        return 'bg-sky-500/10 text-sky-400';
      case 'ppt':
      case 'pptx':
        return 'bg-amber-500/10 text-amber-400';
      case 'png':
      case 'jpg':
      case 'jpeg':
        return 'bg-violet-500/10 text-violet-300';
      case 'url':
        return 'bg-cyan-500/10 text-cyan-300';
      case 'md':
        return 'bg-teal-400/10 text-teal-300';
      default:
        return 'bg-stone-400/10 text-stone-400';
    }
  }

  statusClasses(document: DocumentItem): string {
    switch (document.status) {
      case 'indexed':
        return 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
      case 'processing':
        return 'border border-amber-500/20 bg-amber-500/10 text-amber-400';
      case 'failed':
        return 'border border-rose-500/20 bg-rose-500/10 text-rose-300';
      default:
        return 'border border-white/10 bg-white/5 text-[var(--muted)]';
    }
  }

  formatStatus(status: DocumentItem['status']): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  processingLabel(document: DocumentItem): string | null {
    if (document.status !== 'processing') {
      return null;
    }

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
      default:
        return 'Processing';
    }
  }

  chunkProgressLabel(document: DocumentItem): string | null {
    if (
      document.status !== 'processing' ||
      document.processing_stage !== 'compiling_knowledge' ||
      !document.total_chunks ||
      document.total_chunks <= 0
    ) {
      return null;
    }

    return `${document.processed_chunks ?? 0} of ${document.total_chunks} chunks`;
  }

  formatDocumentDate(document: DocumentItem): string {
    const value = document.uploaded_at;
    const date =
      value instanceof Date ? value : typeof value?.toDate === 'function' ? value.toDate() : null;

    if (!date) {
      return 'Just now';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  progressForDocument(documentId: string): number | null {
    return this.uploadProgress()[documentId] ?? null;
  }

  isDeletingDocument(documentId: string): boolean {
    return this.deletingDocumentIds()[documentId] ?? false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (
      !this.elementRef.nativeElement
        .querySelector('.avatar-menu-wrapper')
        ?.contains(event.target as Node)
    ) {
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
