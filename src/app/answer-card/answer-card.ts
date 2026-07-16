import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AnswerCardItem } from '../atlas.models';
import { AnswerCardService } from '../answer-card.service';
import { AnswerQuizService } from '../answer-quiz.service';
import { AuthService } from '../auth.service';
import { ChatLocationMapComponent } from '../chat-location-map/chat-location-map';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { getPublicAppUrl } from '../firebase.config';

@Component({
  selector: 'app-answer-card',
  imports: [RouterLink, ThemeToggleComponent, ChatLocationMapComponent],
  templateUrl: './answer-card.html',
  styleUrl: './answer-card.css',
})
export class AnswerCardComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly answerCardService = inject(AnswerCardService);
  private readonly answerQuizService = inject(AnswerQuizService);
  private readonly authService = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly card = signal<AnswerCardItem | null>(null);
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly copied = signal(false);
  readonly shared = signal(false);
  readonly shareModalOpen = signal(false);
  readonly shareFeedback = signal<string | null>(null);
  readonly liking = signal(false);
  readonly liked = signal(false);
  readonly creatingQuiz = signal(false);

  readonly shareUrl = computed(() => {
    const card = this.card();
    if (!card) {
      return '';
    }
    if (this.isBrowser) {
      const baseUrl = getPublicAppUrl() || window.location.origin;
      return `${baseUrl}/share/answer-card/${card.id}`;
    }
    return `/share/answer-card/${card.id}`;
  });

  readonly storyImageUrl = computed(() => {
    const url = this.shareUrl();
    return url ? `${url}/story.png` : '';
  });

  constructor() {
    const cardId = this.route.snapshot.paramMap.get('cardId')?.trim() ?? '';
    void this.loadCard(cardId);
  }

  async copyLink(): Promise<void> {
    const url = this.shareUrl();
    if (!url || !this.isBrowser) {
      return;
    }

    await this.copyShareText(url);
    this.copied.set(true);
    this.shareFeedback.set('Link copied');
    setTimeout(() => this.copied.set(false), 1400);
    setTimeout(() => this.shareFeedback.set(null), 1800);
  }

  openSharePage(): void {
    const url = this.shareUrl();
    if (!url || !this.isBrowser) {
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  downloadStoryCard(): void {
    const card = this.card();
    const url = this.storyImageUrl();
    if (!card || !url || !this.isBrowser) {
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `my-living-wiki-${card.id}-story.png`;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    this.shareFeedback.set('Story card downloading');
    setTimeout(() => this.shareFeedback.set(null), 1800);
  }

  openShareModal(): void {
    this.shareModalOpen.set(true);
    this.shareFeedback.set(null);
  }

  closeShareModal(): void {
    this.shareModalOpen.set(false);
    this.shareFeedback.set(null);
  }

  async nativeShareCard(): Promise<void> {
    const card = this.card();
    const url = this.shareUrl();
    if (!card || !url || !this.isBrowser) {
      return;
    }

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: card.title,
          text: card.subtitle,
          url,
        });
      } else {
        await this.copyShareText(url);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      this.shareFeedback.set('Share failed. Link copied instead.');
      await this.copyShareText(url);
      setTimeout(() => this.shareFeedback.set(null), 2200);
      return;
    }
    this.shared.set(true);
    this.shareFeedback.set(typeof navigator.share === 'function' ? 'Share sheet opened' : 'Link copied');
    setTimeout(() => this.shared.set(false), 1400);
    setTimeout(() => this.shareFeedback.set(null), 1800);
  }

  async shareTo(platform: string): Promise<void> {
    const card = this.card();
    const url = this.shareUrl();
    if (!card || !url || !this.isBrowser) {
      return;
    }

    const text = this.shareText(card);
    await this.copyShareText(`${text}\n${url}`);
    this.shareFeedback.set(this.copyPlatformLabel(platform));
    setTimeout(() => this.shareFeedback.set(null), 2200);
  }

  async likeCard(): Promise<void> {
    const card = this.card();
    if (!card || this.liking() || this.liked()) {
      return;
    }

    this.liking.set(true);
    try {
      const visitorId = this.getVisitorId();
      const result = await this.answerCardService.likeAnswerCard(card.id, visitorId);
      this.liked.set(result.liked);
      this.card.set({ ...card, likeCount: result.likeCount });
      this.markLiked(card.id);
      this.shareFeedback.set('Liked');
      setTimeout(() => this.shareFeedback.set(null), 1200);
    } catch {
      this.shareFeedback.set('Could not like this card. Try again.');
      setTimeout(() => this.shareFeedback.set(null), 2200);
    } finally {
      this.liking.set(false);
    }
  }

  async createQuiz(): Promise<void> {
    const card = this.card();
    if (!card || this.creatingQuiz()) {
      return;
    }

    if (!this.authService.isAuthenticated()) {
      await this.router.navigate(['/sign-in'], { queryParams: { redirectTo: `/answer-card/${card.id}` } });
      return;
    }

    this.creatingQuiz.set(true);
    this.shareFeedback.set(null);
    try {
      const quiz = await this.answerQuizService.createQuizFromAnswerCard(card.id);
      await this.router.navigate(['/quiz', quiz.id]);
    } catch (error) {
      this.shareFeedback.set(error instanceof Error ? error.message : 'Could not create a quiz from this card.');
      setTimeout(() => this.shareFeedback.set(null), 2600);
    } finally {
      this.creatingQuiz.set(false);
    }
  }

  mapLink(searchQuery: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
  }

  shareText(card: AnswerCardItem): string {
    return `${card.title} — ${card.subtitle}`;
  }

  shareHref(platform: string): string {
    const card = this.card();
    const url = this.shareUrl();
    if (!card || !url) {
      return '#';
    }

    const text = this.shareText(card);
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(card.title);
    const encodedText = encodeURIComponent(text);
    const encodedTextWithUrl = encodeURIComponent(`${text}\n${url}`);
    const shareTargets: Record<string, string> = {
      x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      whatsapp: `https://wa.me/?text=${encodedTextWithUrl}`,
      email: `mailto:?subject=${encodedTitle}&body=${encodedTextWithUrl}`,
    };
    return shareTargets[platform] ?? '#';
  }

  private async loadCard(cardId: string): Promise<void> {
    if (!cardId) {
      this.errorMessage.set($localize`Answer card not found.`);
      this.isLoading.set(false);
      return;
    }

    try {
      const card = await this.answerCardService.getAnswerCard(cardId);
      this.card.set(card);
      this.liked.set(this.hasLiked(card.id));
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : $localize`Answer card not found.`);
    } finally {
      this.isLoading.set(false);
    }
  }

  private getVisitorId(): string {
    if (!this.isBrowser) {
      return 'server';
    }

    const storageKey = 'living-wiki:answer-card-visitor-id';
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      return existing;
    }

    const created = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(storageKey, created);
    return created;
  }

  private hasLiked(cardId: string): boolean {
    return this.isBrowser && window.localStorage.getItem(`living-wiki:answer-card-liked:${cardId}`) === 'true';
  }

  private markLiked(cardId: string): void {
    if (this.isBrowser) {
      window.localStorage.setItem(`living-wiki:answer-card-liked:${cardId}`, 'true');
    }
  }

  private async copyShareText(text: string): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through for browsers that expose Clipboard API but deny this call.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  private copyPlatformLabel(platform: string): string {
    const labels: Record<string, string> = {
      instagram: 'Copied for Instagram',
      tiktok: 'Copied for TikTok',
      youtube: 'Copied for YouTube',
    };
    return labels[platform] ?? 'Copied';
  }
}
