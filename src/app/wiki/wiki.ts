import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { DocumentItem } from '../atlas.models';
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

  readonly atlasHomeLink = this.atlasService.activeAtlasHomeLink;
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  readonly isSigningOut = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly searchQuery = signal('');

  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;

  readonly hasArticles = this.wikiService.hasArticles;
  readonly articles = this.wikiService.articles;
  readonly selectedArticle = this.wikiService.selectedArticle;
  readonly isLoadingArticles = this.wikiService.isLoadingArticles;

  readonly filteredArticles = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const all = this.articles();
    if (!q) return all;
    return all.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.summary ?? '').toLowerCase().includes(q),
    );
  });

  readonly topics = this.wikiService.topics;
  readonly filteredTopics = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const all = this.topics();
    if (!q) return all;
    return all.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.summary ?? '').toLowerCase().includes(q),
    );
  });
  readonly selectedTopic = this.wikiService.selectedTopic;
  readonly topicEntries = this.wikiService.topicEntries;
  readonly sourceDocuments = this.wikiService.sourceDocuments;
  readonly isLoadingTopics = this.wikiService.isLoadingTopics;
  readonly isLoadingEntries = this.wikiService.isLoadingEntries;
  readonly entriesError = this.wikiService.entriesError;

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
      .replace(/^## (.+)$/gm, '<h2 class="mt-6 mb-3 text-xl font-black tracking-[-0.04em] text-[var(--text)]">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 class="mt-4 mb-2 text-lg font-bold text-[var(--text)]">$1</h3>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-[var(--text)]">$1</strong>')
      .replace(/\[Source:\s*([^\]]+)\]/g, '<span class="citation-badge inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]">[Source: $1]</span>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-[var(--muted)] leading-7">$1</li>')
      .replace(/\n\n/g, '</p><p class="mt-3 text-base leading-8 text-[var(--muted)]">')
      .replace(/\n/g, '<br/>');
  }

  formatDate(value: { toDate(): Date } | Date | null | undefined): string {
    const date = value instanceof Date ? value : typeof value?.toDate === 'function' ? value.toDate() : null;
    if (!date) {
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
