import { Component, ElementRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { AtlasItem, DocumentItem } from '../atlas.models';
import { AuthService } from '../auth.service';
import { AtlasService } from '../atlas.service';
import { DocumentsService } from '../documents.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { AtlasSwitcherComponent } from '../atlas-switcher/atlas-switcher';
import { AtlasBadgeComponent } from '../atlas-badge/atlas-badge';

@Component({
  selector: 'app-library',
  imports: [FormsModule, RouterLink, ThemeToggleComponent, MobileMenuComponent, AtlasSwitcherComponent, AtlasBadgeComponent],
  templateUrl: './library.html',
  styleUrl: './library.css',
})
export class LibraryComponent {
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

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
  readonly isDeletingAllDocuments = signal(false);
  readonly isDeletingFailedDocuments = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly searchQuery = signal('');
  readonly urlToImport = signal('');
  readonly publicAtlas = signal<AtlasItem | null>(null);
  readonly publicLookupDone = signal(false);
  readonly publicDocuments = signal<DocumentItem[]>([]);
  readonly publicLoading = signal(false);
  readonly publicError = signal<string | null>(null);
  readonly isPublicView = computed(() => !!this.routeSlug());
  readonly publicNotFound = computed(
    () => this.isPublicView() && this.publicLookupDone() && !this.publicAtlas(),
  );
  readonly publicPageLoading = computed(
    () => this.isPublicView() && this.isLoading() && !this.publicNotFound(),
  );

  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly atlasLogo = '/assets/living-atlas-logo.png';
  readonly atlasHomeLink = computed(() => this.publicRoute('atlas') ?? this.atlasService.activeAtlasHomeLink());
  readonly atlasWikiLink = computed(() => this.publicRoute('wiki') ?? this.atlasService.activeAtlasWikiLink());
  readonly chatLink = computed(() => this.publicRoute('chat') ?? '/chat');
  readonly uploadLink = computed(() => this.publicRoute('upload') ?? '/upload');
  readonly libraryLink = computed(() => this.publicRoute('library') ?? '/library');
  readonly pageTitle = computed(() =>
    this.isPublicView()
      ? this.publicPageLoading()
        ? 'Loading Source Files...'
        : `${this.atlasService.displayName(this.publicAtlas())} Source Files`
      : 'Source Files',
  );
  readonly documents = computed(() =>
    this.isPublicView() ? this.publicDocuments() : this.documentsService.documents(),
  );
  readonly filteredDocuments = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const documents = this.documents();
    if (!query) {
      return documents;
    }

    return documents.filter((document) => {
      const haystack = [
        document.title,
        document.filename,
        document.file_type,
        document.status,
        document.processing_stage,
        document.ai_usage?.model,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  });
  readonly isLoading = computed(() =>
    this.isPublicView() ? this.publicLoading() || !this.publicLookupDone() : this.documentsService.isLoading(),
  );
  readonly isUploading = computed(() =>
    this.isPublicView() ? false : this.documentsService.isUploading(),
  );
  readonly uploadError = computed(() =>
    this.isPublicView() ? this.publicError() : this.documentsService.uploadError(),
  );
  readonly deleteError = computed(() =>
    this.isPublicView() ? null : this.documentsService.deleteError(),
  );
  readonly stats = computed(() => {
    if (!this.isPublicView()) {
      return this.documentsService.stats();
    }

    const documents = this.publicDocuments();
    return {
      totalDocuments: documents.length,
      wikiPagesGenerated: documents.reduce(
        (sum, document) => sum + (document.wiki_pages_generated ?? 0),
        0,
      ),
      totalCitations: documents.reduce(
        (sum, document) => sum + (document.citation_count ?? 0),
        0,
      ),
      knowledgeGaps: 0,
    };
  });
  readonly uploadProgress = computed(() =>
    this.isPublicView() ? {} : this.documentsService.uploadProgress(),
  );
  readonly deletingDocumentIds = computed(() =>
    this.isPublicView() ? {} : this.documentsService.deletingDocumentIds(),
  );
  readonly canDeleteAllDocuments = computed(
    () =>
      !this.isPublicView() &&
      this.documents().length > 0 &&
      !this.isDeletingAllDocuments() &&
      !this.isDeletingFailedDocuments() &&
      !this.isUploading(),
  );
  readonly failedDocuments = computed(() =>
    this.documents().filter((document) => document.status === 'failed'),
  );
  readonly failedDocumentCount = computed(() => this.failedDocuments().length);
  readonly canDeleteFailedDocuments = computed(
    () =>
      !this.isPublicView() &&
      this.failedDocumentCount() > 0 &&
      !this.isDeletingAllDocuments() &&
      !this.isDeletingFailedDocuments() &&
      !this.isUploading(),
  );

  constructor() {
    effect(() => {
      const slug = this.routeSlug();
      if (!slug) {
        this.publicAtlas.set(null);
        this.publicDocuments.set([]);
        this.publicError.set(null);
        this.publicLoading.set(false);
        this.publicLookupDone.set(true);
        return;
      }

      this.publicLookupDone.set(false);
      this.publicLoading.set(true);
      this.publicError.set(null);

      void this.atlasService
        .getPublicAtlasBySlug(slug)
        .then(async (atlas) => {
          this.publicAtlas.set(atlas);
          if (!atlas) {
            this.publicDocuments.set([]);
            return;
          }

          const documents = await this.documentsService.getPublicAtlasDocuments(atlas.id);
          this.publicDocuments.set(documents);
        })
        .catch((error) => {
          this.publicAtlas.set(null);
          this.publicDocuments.set([]);
          this.publicError.set(
            error instanceof Error ? error.message : 'Failed to load these public source files.',
          );
        })
        .finally(() => {
          this.publicLoading.set(false);
          this.publicLookupDone.set(true);
        });
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

  openFilePicker(): void {
    if (this.isPublicView()) {
      return;
    }
    this.fileInput?.nativeElement.click();
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
  }

  async submitUrl(): Promise<void> {
    if (this.isPublicView()) {
      return;
    }
    const url = this.urlToImport().trim();
    if (!url) {
      return;
    }

    await this.documentsService.submitUrl(url);
    this.urlToImport.set('');
  }

  async downloadDocument(document: DocumentItem): Promise<void> {
    const downloadUrl = await this.documentsService.getAccessibleDownloadUrl(document, {
      atlasId: this.isPublicView() ? this.publicAtlas()?.id ?? null : null,
    });
    if (downloadUrl) {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    }
  }

  async deleteDocument(document: DocumentItem): Promise<void> {
    if (this.isPublicView()) {
      return;
    }
    const label = document.title || document.filename;
    const confirmed = window.confirm(
      `Delete "${label}"?\n\nThis will remove the file, its extracts, its knowledge entries, and update affected wiki topics.`,
    );

    if (!confirmed) {
      return;
    }

    await this.documentsService.deleteDocument(document.id);
  }

  async deleteAllDocuments(): Promise<void> {
    if (this.isPublicView()) {
      return;
    }

    const documents = this.documents().slice();
    if (documents.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Delete all ${documents.length} sources in this atlas?\n\nThis will remove every file and URL source, their extracts, knowledge entries, and affected wiki topics.`,
    );

    if (!confirmed) {
      return;
    }

    this.isDeletingAllDocuments.set(true);

    try {
      await this.documentsService.deleteDocuments(documents.map((document) => document.id));
    } finally {
      this.isDeletingAllDocuments.set(false);
    }
  }

  async deleteFailedDocuments(): Promise<void> {
    if (this.isPublicView()) {
      return;
    }

    const documents = this.failedDocuments().slice();
    if (documents.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Delete all ${documents.length} failed sources in this atlas?\n\nThis will remove only failed ingestions so they no longer appear in Source Files or interfere with cleanup.`,
    );

    if (!confirmed) {
      return;
    }

    this.isDeletingFailedDocuments.set(true);

    try {
      await this.documentsService.deleteDocuments(documents.map((document) => document.id));
    } finally {
      this.isDeletingFailedDocuments.set(false);
    }
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
        return 'border border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-text)]';
      case 'processing':
        return 'border border-amber-500/20 bg-amber-500/10 text-amber-400';
      case 'failed':
        return 'border border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error-text)]';
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
        return 'Fetching and rendering source page';
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

  processingDetail(document: DocumentItem): string | null {
    if (document.status !== 'processing') {
      return null;
    }

    if (document.processing_stage === 'extracting') {
      const heartbeat = this.relativeHeartbeat(document);
      if (heartbeat) {
        return `Last activity ${heartbeat}. Browser-rendered pages can take longer here.`;
      }
      return 'Browser-rendered pages can take longer here.';
    }

    return this.chunkProgressLabel(document);
  }

  isIndeterminateIngestion(document: DocumentItem): boolean {
    return document.status === 'processing' && document.processing_stage === 'extracting';
  }

  ingestionProgress(document: DocumentItem): number | null {
    if (document.status !== 'processing') {
      return null;
    }

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

  ingestionStatusLabel(document: DocumentItem, progress: number | null): string | null {
    if (document.status !== 'processing') {
      return null;
    }

    if (this.isIndeterminateIngestion(document)) {
      return 'Active now';
    }

    return progress === null ? null : `${progress}%`;
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

  aiUsageLabel(document: DocumentItem): string | null {
    const usage = document.ai_usage;
    if (!usage || usage.call_count <= 0) {
      return null;
    }

    return `${this.formatCompactNumber(usage.prompt_tokens)} in · ${this.formatCompactNumber(
      usage.output_tokens,
    )} out · ${usage.call_count} calls`;
  }

  aiModelLabel(document: DocumentItem): string | null {
    const usage = document.ai_usage;
    if (!usage || usage.call_count <= 0) {
      return null;
    }

    return usage.model;
  }

  private formatCompactNumber(value: number | null | undefined): string {
    const numericValue = Number(value ?? 0);
    if (numericValue >= 1_000_000) {
      return `${(numericValue / 1_000_000).toFixed(1)}M`;
    }
    if (numericValue >= 1_000) {
      return `${(numericValue / 1_000).toFixed(1)}k`;
    }
    return `${numericValue}`;
  }

  private relativeHeartbeat(document: DocumentItem): string | null {
    const heartbeat = document.last_heartbeat_at;
    const date =
      heartbeat instanceof Date
        ? heartbeat
        : typeof heartbeat?.toDate === 'function'
          ? heartbeat.toDate()
          : null;

    if (!date) {
      return null;
    }

    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0 || diffMs < 15_000) {
      return 'just now';
    }

    const diffSeconds = Math.floor(diffMs / 1_000);
    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
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
