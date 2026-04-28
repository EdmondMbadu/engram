import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { ChatStoredMessage, CitationPassage } from '../atlas.models';
import { AuthService } from '../auth.service';
import { ChatService } from '../chat.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { formatAssistantMessageHtml } from '../chat/message-format.util';

interface SharedChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  html?: string;
  citations?: CitationPassage[];
  knowledgeGap?: boolean;
  createdAt?: { toDate(): Date } | Date | null;
}

@Component({
  selector: 'app-shared-chat',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './shared-chat.html',
})
export class SharedChatComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly chatService = inject(ChatService);
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

  readonly hasMessages = computed(() => this.messages().length > 0);
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
          this.messages.set(thread.messages.map((message) => this.mapStoredMessage(message)));
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
      knowledgeGap: !!message.knowledge_gap,
      createdAt: message.created_at,
    };
  }

  private asDate(value: { toDate(): Date } | Date | null | undefined): Date | null {
    return value instanceof Date ? value : typeof value?.toDate === 'function' ? value.toDate() : null;
  }
}
