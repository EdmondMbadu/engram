import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { ChatStoredMessage, CitationPassage, MappableLocation } from '../atlas.models';
import { AnswerCardService } from '../answer-card.service';
import { AuthService } from '../auth.service';
import { ChatService } from '../chat.service';
import { ChatLocationMapComponent } from '../chat-location-map/chat-location-map';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { formatAssistantMessageHtml } from '../chat/message-format.util';

interface SharedChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  html?: string;
  citations?: CitationPassage[];
  mappableLocations?: MappableLocation[];
  answerMode?: 'wiki' | 'internet';
  answerCardId?: string | null;
  answerQuizId?: string | null;
  knowledgeGap?: boolean;
  createdAt?: { toDate(): Date } | Date | null;
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
        question: this.questionBeforeMessage(message.id) || 'Shared Living Wiki question',
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
    const lines = [message.role === 'user' ? 'User:' : 'Living Wiki:', message.text.trim() || '(empty)'];

    if (message.citations?.length) {
      lines.push('');
      lines.push('Citations:');
      for (const citation of message.citations) {
        lines.push(`- ${citation.filename} p.${citation.page} (L${citation.line_start}-${citation.line_end})`);
      }
    }

    return lines.join('\n');
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

  private asDate(value: { toDate(): Date } | Date | null | undefined): Date | null {
    return value instanceof Date ? value : typeof value?.toDate === 'function' ? value.toDate() : null;
  }
}
