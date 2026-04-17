import { Component, ElementRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import type { AtlasItem, DocumentItem, WikiArticleItem } from '../atlas.models';
import { AuthService } from '../auth.service';
import { AtlasService } from '../atlas.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { AtlasSwitcherComponent } from '../atlas-switcher/atlas-switcher';
import { AtlasBadgeComponent } from '../atlas-badge/atlas-badge';
import { WikiService } from '../wiki.service';

@Component({
  selector: 'app-wiki',
  imports: [RouterLink, ThemeToggleComponent, MobileMenuComponent, FormsModule, AtlasSwitcherComponent, AtlasBadgeComponent],
  templateUrl: './wiki.html',
})
export class WikiComponent {
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly wikiService = inject(WikiService);
  private readonly route = inject(ActivatedRoute);

  readonly atlasHomeLink = this.atlasService.activeAtlasHomeLink;
  readonly internalAtlasWikiLink = this.atlasService.activeAtlasWikiLink;
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  private readonly routeSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug'))),
    { initialValue: this.route.snapshot.paramMap.get('slug') },
  );

  readonly isPublicView = computed(() => !!this.routeSlug());
  readonly publicAtlas = signal<AtlasItem | null>(null);
  readonly publicLookupDone = signal(false);
  readonly publicAtlasNotFound = computed(
    () => this.isPublicView() && this.publicLookupDone() && !this.publicAtlas(),
  );
  readonly pageTitle = computed(() => (this.isPublicView() ? 'Public Wiki' : 'Wiki'));
  readonly pageSubtitle = computed(() => {
    if (this.isPublicView()) {
      return this.publicAtlas()?.description ?? 'Browse this atlas without signing in.';
    }
    return 'Compiled knowledge from your uploaded documents';
  });
  readonly activeAtlasLabel = computed(() => {
    const atlas = this.isPublicView() ? this.publicAtlas() : this.atlasService.activeAtlas();
    return this.atlasService.displayName(atlas);
  });
  readonly publicWikiLink = computed(() => {
    const atlas = this.publicAtlas();
    if (!atlas) return null;
    return `/wiki/${atlas.slug || atlas.id}`;
  });
  readonly atlasWikiLink = computed(() => this.publicWikiLink() ?? this.internalAtlasWikiLink());

  readonly isSigningOut = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly searchQuery = signal('');
  readonly openingSourceDocumentId = signal<string | null>(null);
  readonly sourceDocumentError = signal<string | null>(null);

  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly isSignedIn = computed(() => !!this.authService.uid());

  readonly hasArticles = this.wikiService.hasArticles;
  readonly articles = this.wikiService.articles;
  readonly selectedArticle = this.wikiService.selectedArticle;
  readonly isLoadingArticles = this.wikiService.isLoadingArticles;

  readonly filteredArticles = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const all = this.articles();
    if (!q) return all;
    return all.filter(
      (a) => a.title.toLowerCase().includes(q) || (a.summary ?? '').toLowerCase().includes(q),
    );
  });

  readonly topics = this.wikiService.topics;
  readonly filteredTopics = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const all = this.topics();
    if (!q) return all;
    return all.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.summary ?? '').toLowerCase().includes(q),
    );
  });
  readonly selectedTopic = this.wikiService.selectedTopic;
  readonly topicEntries = this.wikiService.topicEntries;
  readonly sourceDocuments = this.wikiService.sourceDocuments;
  readonly isLoadingTopics = this.wikiService.isLoadingTopics;
  readonly isLoadingEntries = this.wikiService.isLoadingEntries;
  readonly entriesError = this.wikiService.entriesError;

  constructor() {
    effect(() => {
      const slug = this.routeSlug();
      if (!slug) {
        this.publicAtlas.set(null);
        this.publicLookupDone.set(true);
        this.wikiService.setPublicAtlasId(null);
        return;
      }

      this.publicLookupDone.set(false);
      this.sourceDocumentError.set(null);

      void this.atlasService
        .getPublicAtlasBySlug(slug)
        .then((atlas) => {
          this.publicAtlas.set(atlas);
          this.wikiService.setPublicAtlasId(atlas?.id ?? null);
        })
        .catch(() => {
          this.publicAtlas.set(null);
          this.wikiService.setPublicAtlasId(null);
        })
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

  selectArticle(articleId: string): void {
    this.wikiService.selectArticle(articleId);
  }

  selectTopic(topicId: string): void {
    this.wikiService.selectTopic(topicId);
  }

  formatArticleContent(content: string): string {
    return content
      .replace(
        /^## (.+)$/gm,
        '<h2 class="mt-6 mb-3 text-xl font-black tracking-[-0.04em] text-[var(--text)]">$1</h2>',
      )
      .replace(
        /^### (.+)$/gm,
        '<h3 class="mt-4 mb-2 text-lg font-bold text-[var(--text)]">$1</h3>',
      )
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-[var(--text)]">$1</strong>')
      .replace(
        /\[Source:\s*[^,\]]+,\s*p\.\s*(\d+)\]/g,
        '<sup class="wiki-cite" title="Page $1">p.$1</sup>',
      )
      .replace(/\[Source:\s*[^\]]+\]/g, '')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-[var(--muted)] leading-7">$1</li>')
      .replace(/\n\n/g, '</p><p class="mt-3 text-base leading-8 text-[var(--muted)]">')
      .replace(/\n/g, '<br/>');
  }

  formatDate(value: { toDate(): Date } | Date | string | number | null | undefined): string {
    const date =
      value instanceof Date
        ? value
        : typeof value === 'string' || typeof value === 'number'
          ? new Date(value)
          : typeof value?.toDate === 'function'
            ? value.toDate()
            : null;
    if (!date || Number.isNaN(date.getTime())) {
      return 'Just now';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  documentLabel(document: DocumentItem): string {
    return document.title || document.filename;
  }

  toggleAvatarMenu(): void {
    this.avatarMenuOpen.update((open) => !open);
  }

  articleSourceId(article: WikiArticleItem, documentId: string): string {
    return `${article.id}:${documentId}`;
  }

  async openArticleSourceDocument(source: { document_id: string; pages: number[] }): Promise<void> {
    await this.openSourceDocument(source.document_id, source.pages[0]);
  }

  async openTopicSourceDocument(document: DocumentItem): Promise<void> {
    await this.openSourceDocument(document.id);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (
      !this.elementRef.nativeElement.querySelector('.avatar-menu-wrapper')?.contains(event.target as Node)
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

  private async openSourceDocument(documentId: string, page?: number): Promise<void> {
    this.openingSourceDocumentId.set(documentId);
    this.sourceDocumentError.set(null);

    try {
      const url = await this.wikiService.getSourceDocumentLink(documentId);
      if (!url) {
        this.sourceDocumentError.set('Source document unavailable.');
        return;
      }

      window.open(this.withPdfPageAnchor(url, page), '_blank', 'noopener,noreferrer');
    } catch (error) {
      this.sourceDocumentError.set(
        error instanceof Error ? error.message : 'Failed to open source document.',
      );
    } finally {
      this.openingSourceDocumentId.set(null);
    }
  }

  private withPdfPageAnchor(url: string, page?: number): string {
    if (!page || !/\.pdf([?#]|$)/i.test(url)) {
      return url;
    }
    const withoutHash = url.split('#')[0];
    return `${withoutHash}#page=${page}`;
  }
}
