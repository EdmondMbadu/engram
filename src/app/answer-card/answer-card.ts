import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { AnswerCardItem } from '../atlas.models';
import { AnswerCardService } from '../answer-card.service';
import { ChatLocationMapComponent } from '../chat-location-map/chat-location-map';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-answer-card',
  imports: [RouterLink, ThemeToggleComponent, ChatLocationMapComponent],
  templateUrl: './answer-card.html',
  styleUrl: './answer-card.css',
})
export class AnswerCardComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly answerCardService = inject(AnswerCardService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly card = signal<AnswerCardItem | null>(null);
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly copied = signal(false);
  readonly shared = signal(false);
  readonly liking = signal(false);
  readonly liked = signal(false);

  readonly shareUrl = computed(() => {
    const card = this.card();
    if (!card) {
      return '';
    }
    if (this.isBrowser) {
      return `${window.location.origin}/answer-card/${card.id}`;
    }
    return `/answer-card/${card.id}`;
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

    await navigator.clipboard.writeText(url);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1400);
  }

  async shareCard(): Promise<void> {
    const card = this.card();
    const url = this.shareUrl();
    if (!card || !url || !this.isBrowser) {
      return;
    }

    if (typeof navigator.share === 'function') {
      await navigator.share({
        title: card.title,
        text: card.subtitle,
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
    }
    this.shared.set(true);
    setTimeout(() => this.shared.set(false), 1400);
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
    } finally {
      this.liking.set(false);
    }
  }

  mapLink(searchQuery: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
  }

  private async loadCard(cardId: string): Promise<void> {
    if (!cardId) {
      this.errorMessage.set('Answer card not found.');
      this.isLoading.set(false);
      return;
    }

    try {
      const card = await this.answerCardService.getAnswerCard(cardId);
      this.card.set(card);
      this.liked.set(this.hasLiked(card.id));
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Answer card not found.');
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
}
