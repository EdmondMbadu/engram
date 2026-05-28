import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { ChatStoredMessage, CitationPassage, MappableLocation, TravelGuideCard, TravelGuideStructuredResponse } from '../atlas.models';
import { AnswerCardService } from '../answer-card.service';
import { AuthService } from '../auth.service';
import { ChatService } from '../chat.service';
import { ChatLocationMapComponent } from '../chat-location-map/chat-location-map';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { getPublicAppUrl } from '../firebase.config';
import { formatAssistantMessageHtml } from '../chat/message-format.util';

interface SharedChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  html?: string;
  citations?: CitationPassage[];
  mappableLocations?: MappableLocation[];
  travelGuide?: TravelGuideStructuredResponse | null;
  answerMode?: 'wiki' | 'internet';
  answerCardId?: string | null;
  answerQuizId?: string | null;
  knowledgeGap?: boolean;
  createdAt?: { toDate(): Date } | Date | null;
}

interface SharePageModal {
  title: string;
  subtitle: string;
  url: string;
}

@Component({
  selector: 'app-shared-chat',
  imports: [RouterLink, ThemeToggleComponent, ChatLocationMapComponent],
  templateUrl: './shared-chat.html',
  styleUrl: '../chat/chat.css',
})
export class SharedChatComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly chatService = inject(ChatService);
  private readonly answerCardService = inject(AnswerCardService);
  private readonly authService = inject(AuthService);

  readonly threadId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('threadId'))),
    { initialValue: this.route.snapshot.paramMap.get('threadId') },
  );
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly title = signal('Shared chat');
  readonly atlasName = signal<string | null>(null);
  readonly sharedAt = signal<{ toDate(): Date } | Date | null>(null);
  readonly messages = signal<SharedChatMessage[]>([]);
  readonly selectedCitation = signal<CitationPassage | null>(null);
  readonly copiedTarget = signal<string | null>(null);
  readonly savedTravelCardIds = signal<Record<string, boolean>>(this.loadSavedTravelCardIds());
  readonly sharingTravelCardId = signal<string | null>(null);
  readonly sharePageModal = signal<SharePageModal | null>(null);
  readonly creatingAnswerCardId = signal<string | null>(null);
  readonly answerCardLinks = signal<Record<string, string>>({});
  readonly answerCardErrorMessageId = signal<string | null>(null);
  readonly answerCardError = signal<string | null>(null);

  readonly hasMessages = computed(() => this.messages().length > 0);
  readonly isSignedIn = computed(() => !!this.authService.uid());
  readonly subtitle = computed(() => {
    const atlasName = this.atlasName();
    if (atlasName) {
      return `Read-only shared conversation from ${atlasName}`;
    }
    return 'Read-only shared conversation';
  });

  constructor() {
    effect((onCleanup) => {
      const threadId = this.threadId()?.trim();
      if (!threadId) {
        this.isLoading.set(false);
        this.error.set('Shared chat link is incomplete.');
        this.messages.set([]);
        return;
      }

      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      this.isLoading.set(true);
      this.error.set(null);
      this.messages.set([]);

      void this.chatService
        .loadSharedThread(threadId)
        .then((thread) => {
          if (cancelled) {
            return;
          }

          this.title.set(thread.title || 'Shared chat');
          this.atlasName.set(thread.atlasName ?? null);
          this.sharedAt.set(thread.sharedAt);
          const messages = thread.messages.map((message) => this.mapStoredMessage(message));
          this.messages.set(messages);
          this.answerCardLinks.set(this.collectAnswerCardLinks(messages));
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          this.error.set(this.authService.toFriendlyError(error));
          this.messages.set([]);
        })
        .finally(() => {
          if (!cancelled) {
            this.isLoading.set(false);
          }
        });
    });
  }

  formatDateTime(value: { toDate(): Date } | Date | null | undefined): string {
    const date = this.asDate(value);
    if (!date) {
      return 'Just now';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  async copyWholeChat(): Promise<void> {
    const transcript = this.messages()
      .map((message) => this.buildMessageCopyText(message))
      .join('\n\n')
      .trim();

    if (!transcript) {
      return;
    }

    await this.copyText('shared-chat-thread', transcript);
  }

  async copyMessage(message: SharedChatMessage): Promise<void> {
    await this.copyText(message.id, this.buildMessageCopyText(message));
  }

  async copyMessageBody(message: SharedChatMessage): Promise<void> {
    await this.copyText(`${message.id}:body`, message.text.trim());
  }

  travelGuideForMessage(message: SharedChatMessage): TravelGuideStructuredResponse | null {
    return message.role === 'assistant' ? message.travelGuide ?? null : null;
  }

  guideIntro(message: SharedChatMessage, guide: TravelGuideStructuredResponse): string {
    const question = (this.questionBeforeMessage(message.id) ?? '').replace(/[?!.]+$/, '').trim();
    const topic = question || guide.title || 'this Philly mission';
    const stopCount = guide.cards.length;
    const firstStop = guide.cards[0]?.title?.trim();
    if (/cheesesteak|steak|sandwich|food|eat|restaurant/i.test(topic)) {
      return `For ${topic.toLowerCase()}, here is the no-nonsense route before hunger starts making policy decisions.`;
    }
    if (/weekend|today|tonight|date|visit|do|itinerary|tour/i.test(topic)) {
      return `For ${topic.toLowerCase()}, here is a tight ${stopCount}-stop plan that keeps the day moving and the detours honest.`;
    }
    if (firstStop) {
      return `For ${topic.toLowerCase()}, start with ${firstStop} and let the rest of the cards keep you out of spreadsheet-mode planning.`;
    }
    return `For ${topic.toLowerCase()}, here is the practical version: useful stops first, overthinking politely escorted out.`;
  }

  travelCardImageUrl(card: TravelGuideCard): string | null {
    return card.image_url?.trim() || null;
  }

  travelCardVisualBackground(card: TravelGuideCard, index: number): string {
    const text = `${card.title} ${card.best_for ?? ''} ${card.vibe ?? ''}`.toLowerCase();
    if (/(food|steak|cheese|restaurant|sandwich|bar|coffee|market|eat|drink)/.test(text)) {
      return 'linear-gradient(135deg, #6f1d1b 0%, #b45309 48%, #d6a94a 100%)';
    }
    if (/(museum|history|historic|hall|art|gallery|library)/.test(text)) {
      return 'linear-gradient(135deg, #1f3b57 0%, #3a6d8c 52%, #c49a4a 100%)';
    }
    if (/(park|trail|river|garden|outdoor|walk)/.test(text)) {
      return 'linear-gradient(135deg, #155e4b 0%, #5f8f55 52%, #d0b15e 100%)';
    }
    if (/(music|show|theater|night|club|venue)/.test(text)) {
      return 'linear-gradient(135deg, #3b1d5f 0%, #7c3f78 52%, #d08a45 100%)';
    }
    if (/(shop|store|boutique)/.test(text)) {
      return 'linear-gradient(135deg, #17405e 0%, #3f7f89 52%, #d1a45f 100%)';
    }
    return index % 2 === 0
      ? 'linear-gradient(135deg, #1f3b57 0%, #5d6f82 52%, #d0a85b 100%)'
      : 'linear-gradient(135deg, #2d4656 0%, #7a6a52 52%, #c69c4a 100%)';
  }

  travelCardVisualIcon(card: TravelGuideCard): string {
    const text = `${card.title} ${card.best_for ?? ''} ${card.vibe ?? ''}`.toLowerCase();
    if (/(food|steak|cheese|restaurant|sandwich|bar|coffee|market|eat|drink)/.test(text)) return 'restaurant';
    if (/(museum|history|historic|hall|art|gallery|library)/.test(text)) return 'museum';
    if (/(park|trail|river|garden|outdoor|walk)/.test(text)) return 'park';
    if (/(music|show|theater|night|club|venue)/.test(text)) return 'local_activity';
    if (/(shop|store|market|boutique)/.test(text)) return 'storefront';
    return 'place';
  }

  travelCardDescription(card: TravelGuideCard): string {
    let description = this.cleanTravelCardText(card.description ?? '');
    const title = this.escapeRegExp(this.cleanTravelCardText(card.title ?? ''));
    if (title) {
      description = description.replace(new RegExp(`^${title}\\s*(?:\\([^)]*\\))?\\s*[:–-]\\s*`, 'i'), '').trim();
    }
    const neighborhood = this.escapeRegExp(this.cleanTravelCardText(card.neighborhood || card.subtitle || ''));
    if (neighborhood) {
      description = description.replace(new RegExp(`^\\(?${neighborhood}\\)?\\s*[:–-]\\s*`, 'i'), '').trim();
    }
    return description || this.cleanTravelCardText(card.description ?? '');
  }

  travelCardMapUrl(card: TravelGuideCard): string {
    const query = card.map_query?.trim() || card.subtitle?.trim() || card.title;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  travelCardSourceUrl(card: TravelGuideCard): string | null {
    const sourceUrl = card.source_url?.trim();
    if (!sourceUrl) return null;
    try {
      const parsed = new URL(sourceUrl);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
      return null;
    }
  }

  travelCardSaved(card: TravelGuideCard): boolean {
    return this.savedTravelCardIds()[this.travelCardStorageId(card)] === true;
  }

  saveTravelCard(card: TravelGuideCard): void {
    const storageId = this.travelCardStorageId(card);
    const next = {
      ...this.savedTravelCardIds(),
      [storageId]: true,
    };
    this.savedTravelCardIds.set(next);
    this.persistSavedTravelCardIds(next);
    this.copiedTarget.set(`save:${storageId}`);
  }

  async shareTravelCard(card: TravelGuideCard, message?: SharedChatMessage, guide?: TravelGuideStructuredResponse | null): Promise<void> {
    const target = `share:${this.travelCardStorageId(card)}`;
    if (this.sharingTravelCardId()) {
      return;
    }

    this.sharingTravelCardId.set(target);
    try {
      const share = await this.answerCardService.createTravelCardShare({
        card,
        atlasName: this.atlasName(),
        guideTitle: guide?.title ?? null,
        guideSummary: guide?.summary ?? null,
        question: message ? this.questionBeforeMessage(message.id) : null,
        threadId: this.threadId(),
        sourceMessageId: message?.id ?? null,
      });
      this.sharePageModal.set({
        title: card.title,
        subtitle: 'This individual card now has its own public share page.',
        url: share.url,
      });
    } catch {
      await this.copyText(target, this.buildTravelCardShareText(card));
    } finally {
      this.sharingTravelCardId.set(null);
    }
  }

  async shareGuideCardForMessage(message: SharedChatMessage): Promise<void> {
    if (!this.canCreateAnswerCard(message) || this.creatingAnswerCardId()) {
      return;
    }

    const existingCardId = message.answerCardId ?? this.cardIdFromLink(this.answerCardLinks()[message.id]);
    if (existingCardId) {
      this.sharePageModal.set({
        title: message.travelGuide?.title || 'Share the full guide card',
        subtitle: 'This opens the full Answer Card share page with social preview metadata.',
        url: this.buildAnswerCardShareUrl(existingCardId),
      });
      return;
    }

    this.creatingAnswerCardId.set(message.id);
    this.answerCardError.set(null);
    this.answerCardErrorMessageId.set(null);
    try {
      const card = await this.answerCardService.createAnswerCard({
        question: this.questionBeforeMessage(message.id) || 'Shared My living wiki question',
        answer: message.text,
        threadId: this.threadId(),
        sourceMessageId: message.id,
        sourceMessageKind: 'workspace',
        answerMode: message.answerMode ?? 'wiki',
        mappableLocations: message.mappableLocations ?? [],
      });
      this.answerCardLinks.update((links) => ({
        ...links,
        [message.id]: `/answer-card/${card.id}`,
      }));
      this.messages.update((messages) =>
        messages.map((item) => item.id === message.id ? { ...item, answerCardId: card.id } : item),
      );
      this.sharePageModal.set({
        title: message.travelGuide?.title || 'Share the full guide card',
        subtitle: 'This opens the full Answer Card share page with social preview metadata.',
        url: this.buildAnswerCardShareUrl(card.id),
      });
    } catch (error) {
      this.answerCardError.set(error instanceof Error ? error.message : 'Failed to create answer card.');
      this.answerCardErrorMessageId.set(message.id);
    } finally {
      this.creatingAnswerCardId.set(null);
    }
  }

  closeSharePageModal(): void {
    this.sharePageModal.set(null);
  }

  async copySharePageModalUrl(): Promise<void> {
    const modal = this.sharePageModal();
    if (!modal) {
      return;
    }
    await this.copyText('share-page-modal', modal.url);
  }

  openSharePageModalUrl(): void {
    const modal = this.sharePageModal();
    if (!modal || typeof window === 'undefined') {
      return;
    }
    window.open(modal.url, '_blank', 'noopener,noreferrer');
  }

  canShowAnswerCardAction(message: SharedChatMessage): boolean {
    return message.role === 'assistant' && !!message.text.trim();
  }

  canCreateAnswerCard(message: SharedChatMessage): boolean {
    return this.canShowAnswerCardAction(message) && this.isSignedIn();
  }

  async createAnswerCardForMessage(message: SharedChatMessage): Promise<void> {
    if (!this.canCreateAnswerCard(message) || this.creatingAnswerCardId()) {
      return;
    }

    const existingCardId = message.answerCardId ?? this.cardIdFromLink(this.answerCardLinks()[message.id]);
    if (existingCardId) {
      await this.router.navigateByUrl(`/answer-card/${existingCardId}`);
      return;
    }

    this.creatingAnswerCardId.set(message.id);
    this.answerCardError.set(null);
    this.answerCardErrorMessageId.set(null);
    try {
      const card = await this.answerCardService.createAnswerCard({
        question: this.questionBeforeMessage(message.id) || 'Shared My living wiki question',
        answer: message.text,
        threadId: this.threadId(),
        sourceMessageId: message.id,
        sourceMessageKind: 'workspace',
        answerMode: message.answerMode ?? 'wiki',
        mappableLocations: message.mappableLocations ?? [],
      });
      this.answerCardLinks.update((links) => ({
        ...links,
        [message.id]: `/answer-card/${card.id}`,
      }));
      this.messages.update((messages) =>
        messages.map((item) => item.id === message.id ? { ...item, answerCardId: card.id } : item),
      );
      await this.router.navigateByUrl(`/answer-card/${card.id}`);
    } catch (error) {
      this.answerCardError.set(error instanceof Error ? error.message : 'Failed to create answer card.');
      this.answerCardErrorMessageId.set(message.id);
    } finally {
      this.creatingAnswerCardId.set(null);
    }
  }

  openCitation(citation: CitationPassage): void {
    this.selectedCitation.set(citation);
  }

  closeCitation(): void {
    this.selectedCitation.set(null);
  }

  private buildMessageCopyText(message: SharedChatMessage): string {
    const lines = [message.role === 'user' ? 'User:' : 'My living wiki:', message.text.trim() || '(empty)'];

    if (message.citations?.length) {
      lines.push('');
      lines.push('Citations:');
      for (const citation of message.citations) {
        lines.push(`- ${citation.filename} p.${citation.page} (L${citation.line_start}-${citation.line_end})`);
      }
    }

    return lines.join('\n');
  }

  private buildTravelCardShareText(card: TravelGuideCard): string {
    const lines = [
      this.cleanTravelCardText(card.title),
      this.cleanTravelCardText(card.neighborhood || card.subtitle || ''),
      this.cleanTravelCardText(card.description),
      card.local_tip ? `Local move: ${this.cleanTravelCardText(card.local_tip)}` : '',
      `Map: ${this.travelCardMapUrl(card)}`,
    ].filter((line) => line.trim());
    return lines.join('\n');
  }

  private buildAnswerCardShareUrl(cardId: string): string {
    const configuredBaseUrl = typeof window !== 'undefined' ? getPublicAppUrl() : null;
    const baseUrl = configuredBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${baseUrl}/share/answer-card/${encodeURIComponent(cardId)}`;
  }

  cleanTravelCardText(value: string | null | undefined): string {
    return (value ?? '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*#{1,6}\s*[^*#]+(?=\s+[-*+]\s+\*\*)/g, ' ')
      .replace(/(^|\s)#{1,6}\s*/g, '$1')
      .replace(/(^|\s)[*_]{1,3}([^*_]+)[*_]{1,3}(?=\s|$|[.,;:!?])/g, '$1$2')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/(^|\s)[-*+]\s+(?=\S)/g, '$1')
      .replace(/[*_]{1,3}/g, '')
      .replace(/\s+\*\s+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async copyText(target: string, text: string): Promise<void> {
    if (!text.trim() || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(text);
    this.copiedTarget.set(target);
    window.setTimeout(() => {
      if (this.copiedTarget() === target) {
        this.copiedTarget.set(null);
      }
    }, 1800);
  }

  private mapStoredMessage(message: ChatStoredMessage): SharedChatMessage {
    return {
      id: message.id,
      role: message.role,
      text: message.text,
      html: message.role === 'assistant' ? formatAssistantMessageHtml(message.text) : undefined,
      citations: Array.isArray(message.cited_passages) ? message.cited_passages : [],
      mappableLocations: Array.isArray(message.mappable_locations) ? message.mappable_locations : [],
      travelGuide: message.travel_guide ?? null,
      answerMode: message.answer_mode === 'internet' ? 'internet' : 'wiki',
      answerCardId: message.answer_card_id ?? null,
      answerQuizId: message.answer_quiz_id ?? null,
      knowledgeGap: !!message.knowledge_gap,
      createdAt: message.created_at,
    };
  }

  private collectAnswerCardLinks(messages: SharedChatMessage[]): Record<string, string> {
    const links: Record<string, string> = {};
    for (const message of messages) {
      if (message.answerCardId) {
        links[message.id] = `/answer-card/${message.answerCardId}`;
      }
    }
    return links;
  }

  private questionBeforeMessage(messageId: string): string | null {
    const messages = this.messages();
    const index = messages.findIndex((message) => message.id === messageId);
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const message = messages[cursor];
      if (message?.role === 'user' && message.text.trim()) {
        return message.text.trim();
      }
    }
    return null;
  }

  private cardIdFromLink(link: string | undefined): string | null {
    if (!link) {
      return null;
    }
    const match = link.match(/\/answer-card\/([^/?#]+)/);
    return match?.[1] ?? null;
  }

  travelCardStorageId(card: TravelGuideCard): string {
    return `${card.id || card.title}:${card.map_query || card.subtitle || ''}`.toLowerCase();
  }

  private loadSavedTravelCardIds(): Record<string, boolean> {
    if (typeof window === 'undefined') {
      return {};
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem('living-wiki:saved-travel-cards') ?? '{}') as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? Object.fromEntries(Object.entries(parsed).filter(([, value]) => value === true))
        : {};
    } catch {
      return {};
    }
  }

  private persistSavedTravelCardIds(value: Record<string, boolean>): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem('living-wiki:saved-travel-cards', JSON.stringify(value));
  }

  private asDate(value: { toDate(): Date } | Date | null | undefined): Date | null {
    return value instanceof Date ? value : typeof value?.toDate === 'function' ? value.toDate() : null;
  }
}
