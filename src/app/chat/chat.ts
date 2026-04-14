import { AfterViewChecked, Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { CitationPassage, QueryHistoryItem } from '../atlas.models';
import { AuthService } from '../auth.service';
import { ChatService } from '../chat.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: CitationPassage[];
  pending?: boolean;
  knowledgeGap?: boolean;
  createdAt?: { toDate(): Date } | Date | null;
  updatedAt?: { toDate(): Date } | Date | null;
}

const THINKING_STAGES = [
  'Searching knowledge base',
  'Reading relevant entries',
  'Synthesizing answer',
];

@Component({
  selector: 'app-chat',
  imports: [FormsModule, RouterLink, ThemeToggleComponent, MobileMenuComponent],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class ChatComponent implements AfterViewChecked {
  private readonly authService = inject(AuthService);
  private readonly chatService = inject(ChatService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  private shouldScrollToEnd = false;
  private thinkingInterval: ReturnType<typeof setInterval> | null = null;
  private copyFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly isSigningOut = signal(false);
  readonly isDeletingHistory = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly question = signal('');
  readonly selectedCitation = signal<CitationPassage | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly thinkingStage = signal(0);
  readonly historyExpanded = signal(false);
  readonly activeHistoryId = signal<string | null>(null);
  readonly historyActionMenuId = signal<string | null>(null);
  readonly messageActionMenuId = signal<string | null>(null);
  readonly pendingDeleteHistoryItem = signal<QueryHistoryItem | null>(null);
  readonly copiedTarget = signal<string | null>(null);

  @ViewChild('transcriptEnd') transcriptEnd?: ElementRef<HTMLElement>;

  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly queryHistory = this.chatService.queryHistory;
  readonly isSubmitting = this.chatService.isSubmitting;
  readonly submitError = this.chatService.submitError;

  readonly visibleHistory = computed(() => {
    const all = this.queryHistory();
    return this.historyExpanded() ? all : all.slice(0, 6);
  });

  readonly hasMessages = computed(() => this.messages().length > 0);
  readonly currentThinkingLabel = computed(() => THINKING_STAGES[this.thinkingStage()] ?? THINKING_STAGES[0]);

  readonly quickPrompts = [
    'What does my knowledge base say about transformer architecture?',
    'Summarize the strongest themes in my uploaded sources.',
    'What contradictions exist across my notes and documents?',
  ];

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

  async submitQuestion(): Promise<void> {
    const question = this.question().trim();
    if (!question || this.isSubmitting()) {
      return;
    }

    this.activeHistoryId.set(null);
    this.question.set('');

    const now = new Date();
    const userId = `u-${Date.now()}`;
    const pendingId = `a-${Date.now()}`;
    this.messages.update((msgs) => [
      ...msgs,
      { id: userId, role: 'user', text: question, createdAt: now, updatedAt: now },
      { id: pendingId, role: 'assistant', text: '', pending: true, createdAt: now, updatedAt: now },
    ]);
    this.shouldScrollToEnd = true;
    this.startThinkingRotation();

    await this.chatService.ask(question);

    this.stopThinkingRotation();

    const err = this.submitError();
    if (err) {
      this.messages.update((msgs) =>
        msgs.map((message) =>
          message.id === pendingId
            ? { ...message, pending: false, text: err, updatedAt: new Date() }
            : message,
        ),
      );
    } else {
      const answer = this.chatService.latestAnswer() ?? '';
      const citations = this.chatService.latestCitations();
      const gap = this.chatService.knowledgeGap();
      this.messages.update((msgs) =>
        msgs.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                pending: false,
                text: answer,
                citations,
                knowledgeGap: gap,
                updatedAt: new Date(),
              }
            : message,
        ),
      );
    }

    this.shouldScrollToEnd = true;
  }

  usePrompt(prompt: string): void {
    this.question.set(prompt);
  }

  openCitation(citation: CitationPassage): void {
    this.selectedCitation.set(citation);
  }

  closeCitation(): void {
    this.selectedCitation.set(null);
  }

  newChat(): void {
    this.messages.set([]);
    this.question.set('');
    this.selectedCitation.set(null);
    this.activeHistoryId.set(null);
    this.historyActionMenuId.set(null);
    this.messageActionMenuId.set(null);
  }

  loadHistoryItem(item: QueryHistoryItem): void {
    this.activeHistoryId.set(item.id);
    this.selectedCitation.set(null);
    this.historyActionMenuId.set(null);
    this.messageActionMenuId.set(null);
    this.messages.set([
      {
        id: `${item.id}-q`,
        role: 'user',
        text: item.question,
        createdAt: item.created_at,
        updatedAt: item.updated_at ?? item.created_at,
      },
      {
        id: `${item.id}-a`,
        role: 'assistant',
        text: item.answer,
        citations: item.cited_passages ?? [],
        knowledgeGap: !!item.knowledge_gap,
        createdAt: item.created_at,
        updatedAt: item.updated_at ?? item.created_at,
      },
    ]);
    this.shouldScrollToEnd = true;
  }

  toggleHistoryExpanded(): void {
    this.historyExpanded.update((value) => !value);
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.submitQuestion();
    }
  }

  truncate(text: string, max = 48): string {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max).trim()}...` : text;
  }

  messageLabel(message: ChatMessage): string {
    return message.role === 'user' ? 'You' : 'Living Atlas';
  }

  formatRelativeDateShort(value: { toDate(): Date } | Date | null | undefined): string {
    const date = this.asDate(value);
    if (!date) {
      return 'now';
    }

    const deltaMs = Math.max(0, Date.now() - date.getTime());
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    if (deltaMs < hour) {
      return `${Math.max(1, Math.floor(deltaMs / minute) || 1)}m`;
    }
    if (deltaMs < day) {
      return `${Math.floor(deltaMs / hour)}h`;
    }
    if (deltaMs < week) {
      return `${Math.floor(deltaMs / day)}d`;
    }
    if (deltaMs < month) {
      return `${Math.floor(deltaMs / week)}w`;
    }
    if (deltaMs < year) {
      return `${Math.floor(deltaMs / month)}mo`;
    }
    return `${Math.floor(deltaMs / year)}y`;
  }

  formatDate(value: { toDate(): Date } | Date | null | undefined): string {
    const date = this.asDate(value);
    if (!date) {
      return 'Just now';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
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

  toggleHistoryActions(historyId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.messageActionMenuId.set(null);
    this.historyActionMenuId.update((current) => (current === historyId ? null : historyId));
  }

  toggleMessageActions(messageId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.historyActionMenuId.set(null);
    this.messageActionMenuId.update((current) => (current === messageId ? null : messageId));
  }

  confirmDeleteHistoryItem(item: QueryHistoryItem, event?: MouseEvent): void {
    event?.stopPropagation();
    this.historyActionMenuId.set(null);
    this.pendingDeleteHistoryItem.set(item);
  }

  cancelDeleteHistoryItem(): void {
    this.pendingDeleteHistoryItem.set(null);
  }

  async deleteHistoryItem(): Promise<void> {
    const item = this.pendingDeleteHistoryItem();
    if (!item || this.isDeletingHistory()) {
      return;
    }

    this.isDeletingHistory.set(true);
    try {
      await this.chatService.deleteQuery(item.id);
      if (this.activeHistoryId() === item.id) {
        this.newChat();
      }
      this.pendingDeleteHistoryItem.set(null);
    } finally {
      this.isDeletingHistory.set(false);
    }
  }

  async copyWholeChat(): Promise<void> {
    const transcript = this.messages()
      .map((message) => this.buildMessageCopyText(message))
      .join('\n\n')
      .trim();

    if (!transcript) {
      return;
    }

    await this.copyText('chat-thread', transcript);
  }

  async copyMessage(message: ChatMessage, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    await this.copyText(message.id, this.buildMessageCopyText(message));
    this.messageActionMenuId.set(null);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToEnd) {
      this.shouldScrollToEnd = false;
      this.transcriptEnd?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  toggleAvatarMenu(): void {
    this.avatarMenuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;

    if (!target?.closest('.avatar-menu-wrapper')) {
      this.avatarMenuOpen.set(false);
    }

    if (!target?.closest('.chat-history-actions')) {
      this.historyActionMenuId.set(null);
    }

    if (!target?.closest('.chat-message-actions')) {
      this.messageActionMenuId.set(null);
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

  private startThinkingRotation(): void {
    this.thinkingStage.set(0);
    this.thinkingInterval = setInterval(() => {
      this.thinkingStage.update((stage) => Math.min(stage + 1, THINKING_STAGES.length - 1));
    }, 1400);
  }

  private stopThinkingRotation(): void {
    if (this.thinkingInterval) {
      clearInterval(this.thinkingInterval);
      this.thinkingInterval = null;
    }
  }

  private asDate(value: { toDate(): Date } | Date | null | undefined): Date | null {
    return value instanceof Date ? value : typeof value?.toDate === 'function' ? value.toDate() : null;
  }

  private buildMessageCopyText(message: ChatMessage): string {
    const lines = [`${this.messageLabel(message)}:`, message.text.trim() || '(empty)'];

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

    if (this.copyFeedbackTimeout) {
      clearTimeout(this.copyFeedbackTimeout);
    }

    this.copyFeedbackTimeout = setTimeout(() => {
      this.copiedTarget.set(null);
    }, 1800);
  }
}
