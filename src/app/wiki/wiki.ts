import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { DocumentItem } from '../atlas.models';
import { AuthService } from '../auth.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WikiService } from '../wiki.service';

@Component({
  selector: 'app-wiki',
  imports: [RouterLink, ThemeToggleComponent, MobileMenuComponent],
  templateUrl: './wiki.html',
})
export class WikiComponent {
  private readonly authService = inject(AuthService);
  private readonly wikiService = inject(WikiService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  readonly isSigningOut = signal(false);
  readonly avatarMenuOpen = signal(false);

  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly topics = this.wikiService.topics;
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

  selectTopic(topicId: string): void {
    this.wikiService.selectTopic(topicId);
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
