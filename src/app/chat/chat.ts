import { AfterViewChecked, Component, ElementRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { AtlasItem, ChatHistoryItem, ChatStoredMessage, ChatThreadItem, CitationPassage } from '../atlas.models';
import { AuthService } from '../auth.service';
import { AtlasService } from '../atlas.service';
import { ChatService } from '../chat.service';
import { DocumentsService } from '../documents.service';
import { WikiService } from '../wiki.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { AtlasSwitcherComponent } from '../atlas-switcher/atlas-switcher';
import { AtlasBadgeComponent } from '../atlas-badge/atlas-badge';
import { getPublicAppUrl } from '../firebase.config';
import { formatAssistantMessageHtml } from './message-format.util';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  html?: string;
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
  imports: [FormsModule, RouterLink, ThemeToggleComponent, MobileMenuComponent, AtlasSwitcherComponent, AtlasBadgeComponent],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class ChatComponent implements AfterViewChecked {
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly chatService = inject(ChatService);
  private readonly documentsService = inject(DocumentsService);
  private readonly wikiService = inject(WikiService);
  private readonly route = inject(ActivatedRoute);

  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);
  readonly routeSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug'))),
    { initialValue: this.route.snapshot.paramMap.get('slug') },
  );

  private shouldScrollToEnd = false;
  private thinkingInterval: ReturnType<typeof setInterval> | null = null;
  private copyFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly isSigningOut = signal(false);
  readonly isDeletingHistory = signal(false);
  readonly isSharingThread = signal(false);
  readonly shareModalOpen = signal(false);
  readonly shareModalError = signal<string | null>(null);
  readonly generatedShareLink = signal<string | null>(null);
  readonly avatarMenuOpen = signal(false);
  readonly question = signal('');
  readonly selectedCitation = signal<CitationPassage | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly thinkingStage = signal(0);
  readonly historyExpanded = signal(false);
  readonly activeHistoryId = signal<string | null>(null);
  readonly activeThreadId = signal<string | null>(null);
  readonly messageActionMenuId = signal<string | null>(null);
  readonly pendingDeleteHistoryItem = signal<ChatHistoryItem | null>(null);
  readonly copiedTarget = signal<string | null>(null);
  readonly publicAtlas = signal<AtlasItem | null>(null);
  readonly publicLookupDone = signal(false);
  readonly publicChatLoading = signal(false);
  readonly publicLoadError = signal<string | null>(null);
  readonly publicQuestionLimit = signal<number | null>(null);
  readonly publicRemainingQuestions = signal<number | null>(null);
  readonly publicRequiresSignIn = signal(false);
  readonly anonymousVisitorId = signal<string | null>(this.loadAnonymousVisitorId());
  readonly heroTypedPrompt = signal('');
  readonly animatedDocumentCount = signal(0);
  readonly animatedArticleCount = signal(0);
  readonly animatedSourceCount = signal(0);
  readonly isPublicView = computed(() => !!this.routeSlug());
  readonly publicNotFound = computed(
    () => this.isPublicView() && this.publicLookupDone() && !this.publicAtlas(),
  );
  readonly authInitialized = this.authService.initialized;
  readonly isSignedIn = computed(() => !!this.authService.uid());
  readonly isPublicOwner = computed(
    () => this.isPublicView() && !!this.publicAtlas() && this.publicAtlas()!.user_id === this.authService.uid(),
  );
  readonly isWorkspaceMode = computed(() => !this.isPublicView() || this.isPublicOwner());
  readonly isPublicVisitorMode = computed(() => this.isPublicView() && !this.isPublicOwner());
  readonly isAnonymousPublicVisitor = computed(() => this.isPublicVisitorMode() && !this.isSignedIn());
  readonly isSignedInPublicVisitor = computed(() => this.isPublicVisitorMode() && this.isSignedIn());
  readonly isPublicPageLoading = computed(() => {
    if (!this.isPublicView()) {
      return false;
    }
    if (!this.publicLookupDone()) {
      return true;
    }
    if (this.publicNotFound()) {
      return false;
    }
    if (!this.authInitialized()) {
      return true;
    }
    return this.isPublicVisitorMode() && this.publicChatLoading();
  });

  @ViewChild('transcriptEnd') transcriptEnd?: ElementRef<HTMLElement>;

  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly atlasHomeLink = computed(() => this.publicRoute('atlas') ?? this.atlasService.activeAtlasHomeLink());
  readonly atlasWikiLink = computed(() => this.publicRoute('wiki') ?? this.atlasService.activeAtlasWikiLink());
  readonly chatLink = computed(() => this.publicRoute('chat') ?? '/chat');
  readonly uploadLink = computed(() => this.publicRoute('upload') ?? '/upload');
  readonly libraryLink = computed(() => this.publicRoute('library') ?? '/library');
  readonly queryHistory = this.chatService.queryHistory;
  readonly isSubmitting = this.chatService.isSubmitting;
  readonly submitError = this.chatService.submitError;

  readonly visibleHistory = computed(() => {
    const all = this.queryHistory();
    return this.historyExpanded() ? all : all.slice(0, 6);
  });
  readonly activeThreadHistoryItem = computed<ChatThreadItem | null>(() => {
    const activeThreadId = this.activeThreadId();
    if (!activeThreadId) {
      return null;
    }

    const item = this.queryHistory().find(
      (entry): entry is ChatThreadItem => entry.kind === 'thread' && entry.id === activeThreadId,
    );
    return item ?? null;
  });
  readonly canShareActiveThread = computed(() => this.isWorkspaceMode() && !!this.activeThreadId() && this.hasMessages());
  readonly activeThreadIsShared = computed(() => this.activeThreadHistoryItem()?.is_shared === true);

  readonly hasMessages = computed(() => this.messages().length > 0);
  readonly currentThinkingLabel = computed(() => THINKING_STAGES[this.thinkingStage()] ?? THINKING_STAGES[0]);
  readonly pageTitle = computed(() =>
    this.isPublicView() ? `${this.atlasService.displayName(this.publicAtlas())} Chat` : 'Chat',
  );
  readonly pageSubtitle = computed(() => {
    if (this.isWorkspaceMode()) {
      return 'Query pre-compiled knowledge with citations';
    }
    if (this.showSignInCta()) {
      return 'Public question limit reached';
    }
    if (this.isAnonymousPublicVisitor()) {
      return 'Ask up to 5 questions without signing in';
    }
    if (this.isSignedInPublicVisitor()) {
      return 'Signed-in visitors can chat freely with this atlas';
    }
    return 'Ask questions about this public atlas';
  });
  readonly composerPlaceholder = computed(() =>
    this.isWorkspaceMode()
      ? 'Message Living Wiki...'
      : this.showSignInCta()
        ? 'Sign in to continue asking questions...'
        : 'Ask about this living wiki...',
  );
  readonly canSubmit = computed(() => {
    if (this.isSubmitting() || !this.question().trim() || this.publicNotFound()) {
      return false;
    }
    if (this.isWorkspaceMode()) {
      return true;
    }
    return this.authInitialized() && !this.isPublicPageLoading() && !this.publicRequiresSignIn();
  });
  readonly showSignInCta = computed(() => this.isAnonymousPublicVisitor() && this.publicRequiresSignIn());
  readonly primaryActionDisabled = computed(() => (this.showSignInCta() ? false : !this.canSubmit()));
  readonly publicSidebarNotice = computed(() => {
    if (!this.isPublicVisitorMode()) {
      return '';
    }
    if (this.showSignInCta()) {
      return 'You have reached the 5-question public limit. Sign in to continue this conversation.';
    }
    if (this.isAnonymousPublicVisitor()) {
      const remaining = this.publicRemainingQuestions();
      return remaining === null
        ? 'Ask up to 5 questions without signing in.'
        : `Ask up to 5 questions without signing in. ${remaining} remaining.`;
    }
    return 'Signed-in visitors can ask unlimited questions. The atlas owner can see your name, email, and questions.';
  });
  readonly currentWikiAtlas = computed(() =>
    this.isPublicView() ? this.publicAtlas() : this.atlasService.activeAtlas(),
  );
  readonly currentWikiName = computed(() => {
    const atlas = this.currentWikiAtlas();
    if (!atlas) {
      return '';
    }
    const name = this.atlasService.displayName(atlas);
    return name && name !== 'Select atlas' ? name : '';
  });
  readonly currentWikiDocumentCount = computed(() => this.currentWikiAtlas()?.stats?.documents ?? 0);
  readonly currentWikiArticleCount = computed(() => this.currentWikiAtlas()?.stats?.wiki_articles ?? 0);
  readonly currentWikiSourceCount = computed(() => this.currentWikiDocumentCount() + this.currentWikiArticleCount());
  readonly currentWikiSummary = computed(() => {
    const atlas = this.currentWikiAtlas();
    const description = atlas?.description?.trim();
    if (description) {
      return description;
    }
    const name = this.currentWikiName();
    return name ? `Ask ${name} anything from your sources.` : 'Ask anything from your sources.';
  });
  readonly emptyStateEyebrow = computed(() => (this.isWorkspaceMode() ? 'Living Wiki' : 'Living Wiki · Public chat'));
  readonly emptyStateTitle = computed(() => {
    const name = this.currentWikiName();
    if (this.isWorkspaceMode()) {
      return name ? `Ask ${name}` : 'Ask your Wiki';
    }
    if (this.showSignInCta()) {
      return 'Sign in to keep chatting';
    }
    return name ? `Ask ${name}` : 'Ask this Wiki';
  });
  readonly emptyStateDescription = computed(() => {
    if (this.isWorkspaceMode()) {
      return this.currentWikiSummary();
    }
    if (this.showSignInCta()) {
      return 'You have used all 5 anonymous public questions for this atlas. Sign in to continue.';
    }
    if (this.isAnonymousPublicVisitor()) {
      const remaining = this.publicRemainingQuestions();
      const base = this.currentWikiSummary();
      const limitNote = remaining === null
        ? '5 anonymous questions allowed.'
        : `${remaining} anonymous question${remaining === 1 ? '' : 's'} left.`;
      return `${base} ${limitNote}`;
    }
    return this.currentWikiSummary();
  });
  readonly heroPromptText = computed(() => {
    if (this.showSignInCta()) {
      return 'Sign in to continue asking grounded questions.';
    }

    const name = this.currentWikiName();
    if (name) {
      return `Ask ${name} anything from your sources.`;
    }

    return 'Ask your living wiki anything from your sources.';
  });
  readonly heroSupportingText = computed(() => {
    if (this.showSignInCta()) {
      return 'You have used the anonymous question limit for this atlas. Sign in to keep the conversation going.';
    }

    const name = this.currentWikiName();
    if (name) {
      return `${name} is indexed into documents and wiki pages so every answer can stay grounded in the material you uploaded.`;
    }

    return 'Your documents and wiki pages are indexed so every answer can stay grounded in the material you uploaded.';
  });
  readonly heroStatusLabel = computed(() => (this.isPublicVisitorMode() ? 'Public atlas live' : 'Living Wiki live'));
  readonly heroMetaLabel = computed(() => {
    if (this.showSignInCta()) {
      return 'Anonymous session paused';
    }

    const total = this.currentWikiSourceCount();
    return total === 1 ? '1 indexed source ready' : `${total} indexed sources ready`;
  });
  readonly composerHelperText = computed(() => {
    if (this.isWorkspaceMode()) {
      return 'shortcut';
    }
    if (this.showSignInCta()) {
      return 'You have used all 5 anonymous questions. Sign in to continue.';
    }
    if (this.isAnonymousPublicVisitor()) {
      const remaining = this.publicRemainingQuestions();
      return remaining === null
        ? 'Ask up to 5 questions without signing in.'
        : `${remaining} of 5 anonymous questions remaining.`;
    }
    return 'Your questions are saved with your name and email for the atlas owner.';
  });

  private cachedPromptsKey: string | null = null;
  private cachedPrompts: { label: string; prompt: string }[] = [];

  readonly quickPrompts = computed<{ label: string; prompt: string }[]>(() => {
    if (!this.isWorkspaceMode()) {
      return [];
    }

    const topics = this.wikiService.topics();
    const articles = this.wikiService.articles();
    const atlasId = this.atlasService.activeAtlasId() ?? '';
    const cacheKey = `${atlasId}::${topics.length}::${articles.length}`;
    if (this.cachedPromptsKey === cacheKey && this.cachedPrompts.length > 0) {
      return this.cachedPrompts;
    }

    const candidates: string[] = [];
    for (const topic of topics) {
      const name = topic.name?.trim();
      if (name) candidates.push(name);
    }
    for (const article of articles) {
      const title = article.title?.trim();
      if (title) candidates.push(title);
    }

    if (candidates.length === 0) {
      return [];
    }

    const picks: string[] = [];
    const pool = [...candidates];
    while (picks.length < 2 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      const [chosen] = pool.splice(idx, 1);
      if (chosen && !picks.includes(chosen)) {
        picks.push(chosen);
      }
    }

    const shortenLabel = (label: string, max = 36) => {
      const clean = label.replace(/\s+/g, ' ').trim();
      return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
    };

    const templates = [
      (label: string) => `What is ${label}?`,
      (label: string) => `Why does ${label} matter?`,
    ];

    const built = picks.map((label, i) => ({
      label: shortenLabel(label),
      prompt: templates[i % templates.length](label),
    }));
    this.cachedPromptsKey = cacheKey;
    this.cachedPrompts = built;
    return built;
  });

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

  constructor() {
    effect(() => {
      const slug = this.routeSlug();
      if (!slug) {
        this.publicAtlas.set(null);
        this.publicLookupDone.set(true);
        this.publicChatLoading.set(false);
        this.publicLoadError.set(null);
        return;
      }

      this.publicLookupDone.set(false);
      this.publicLoadError.set(null);
      void this.atlasService
        .getPublicAtlasBySlug(slug)
        .then((atlas) => this.publicAtlas.set(atlas))
        .catch(() => this.publicAtlas.set(null))
        .finally(() => this.publicLookupDone.set(true));
    });

    effect(() => {
      if (!this.isPublicOwner()) {
        return;
      }

      const atlas = this.publicAtlas();
      if (atlas?.id) {
        this.atlasService.setActive(atlas.id);
      }
    });

    effect((onCleanup) => {
      if (!this.isPublicView()) {
        this.resetPublicChatState();
        return;
      }

      if (!this.publicLookupDone()) {
        this.publicChatLoading.set(true);
        this.publicLoadError.set(null);
        return;
      }

      if (this.publicNotFound()) {
        this.resetPublicChatState();
        this.messages.set([]);
        this.activeThreadId.set(null);
        return;
      }

      if (!this.authInitialized()) {
        this.publicChatLoading.set(true);
        this.publicLoadError.set(null);
        return;
      }

      if (this.isWorkspaceMode()) {
        this.resetPublicChatState();
        this.messages.set([]);
        this.activeThreadId.set(null);
        this.activeHistoryId.set(null);
        return;
      }

      const atlas = this.publicAtlas();
      if (!atlas?.id) {
        this.resetPublicChatState();
        return;
      }

      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      this.publicChatLoading.set(true);
      this.publicLoadError.set(null);
      this.messages.set([]);
      this.activeThreadId.set(null);
      this.activeHistoryId.set(null);

      void this.chatService
        .loadPublicChatState(
          atlas.id,
          this.isAnonymousPublicVisitor() ? this.ensureAnonymousVisitorId() : null,
        )
        .then((state) => {
          if (cancelled) {
            return;
          }
          this.messages.set(state.messages.map((message) => this.mapStoredMessage(message)));
          this.activeThreadId.set(state.threadId ?? null);
          this.publicQuestionLimit.set(state.questionLimit);
          this.publicRemainingQuestions.set(state.remainingQuestions);
          this.publicRequiresSignIn.set(state.requiresSignIn);
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          const message = this.authService.toFriendlyError(error);
          this.publicLoadError.set(message);
          this.messages.set([]);
          this.activeThreadId.set(null);
        })
        .finally(() => {
          if (!cancelled) {
            this.publicChatLoading.set(false);
          }
        });
    });

    effect((onCleanup) => {
      const text = this.heroPromptText();
      const shouldAnimate = !this.hasMessages() && !this.isPublicPageLoading() && !this.publicNotFound();

      if (!text) {
        this.heroTypedPrompt.set('');
        return;
      }

      if (!shouldAnimate) {
        this.heroTypedPrompt.set(text);
        return;
      }

      this.heroTypedPrompt.set('');
      let index = 0;
      const interval = setInterval(() => {
        index = Math.min(index + 1, text.length);
        this.heroTypedPrompt.set(text.slice(0, index));
        if (index >= text.length) {
          clearInterval(interval);
        }
      }, text.length > 54 ? 24 : 34);

      onCleanup(() => clearInterval(interval));
    });

    effect((onCleanup) => {
      const shouldAnimate = !this.hasMessages() && !this.isPublicPageLoading() && !this.publicNotFound();
      const docs = this.currentWikiDocumentCount();
      const articles = this.currentWikiArticleCount();
      const sources = this.currentWikiSourceCount();

      if (!shouldAnimate) {
        this.animatedDocumentCount.set(docs);
        this.animatedArticleCount.set(articles);
        this.animatedSourceCount.set(sources);
        return;
      }

      const startedAt = Date.now();
      const durationMs = 900;
      const interval = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);

        this.animatedDocumentCount.set(Math.round(docs * eased));
        this.animatedArticleCount.set(Math.round(articles * eased));
        this.animatedSourceCount.set(Math.round(sources * eased));

        if (progress >= 1) {
          clearInterval(interval);
        }
      }, 32);

      onCleanup(() => clearInterval(interval));
    });
  }

  async submitQuestion(): Promise<void> {
    const question = this.question().trim();
    if (!question || this.isSubmitting() || this.publicNotFound()) {
      return;
    }

    const submittedThreadId = this.activeThreadId();
    if (!submittedThreadId && this.isWorkspaceMode()) {
      this.activeHistoryId.set(null);
    }
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

    const response = this.isWorkspaceMode()
      ? await this.chatService.ask(question, undefined, submittedThreadId)
      : await this.chatService.askPublic(question, this.publicAtlas()!.id, {
          threadId: submittedThreadId,
          anonymousVisitorId: this.isAnonymousPublicVisitor() ? this.ensureAnonymousVisitorId() : null,
        });

    this.stopThinkingRotation();

    const err = this.submitError();
    if (err) {
      this.messages.update((msgs) =>
        msgs.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                pending: false,
                text: err,
                html: formatAssistantMessageHtml(err),
                updatedAt: new Date(),
              }
            : message,
        ),
      );
    } else {
      const publicResponse =
        !this.isWorkspaceMode() && response && 'blocked' in response ? response : null;
      const blocked = publicResponse?.blocked === true;
      const answer = blocked
        ? 'You have reached the 5-question public limit for this atlas. Sign in to continue this conversation.'
        : response?.answer ?? this.chatService.latestAnswer() ?? '';
      const citations = this.normalizeCitations(response?.citedPassages ?? this.chatService.latestCitations());
      const gap = response?.knowledgeGap ?? this.chatService.knowledgeGap();
      const returnedThreadId = response?.threadId ?? submittedThreadId;

      if (returnedThreadId && submittedThreadId && returnedThreadId !== submittedThreadId) {
        this.messages.set([
          { id: userId, role: 'user', text: question, createdAt: now, updatedAt: now },
          {
            id: pendingId,
            role: 'assistant',
            text: answer,
            html: formatAssistantMessageHtml(answer),
            citations,
            knowledgeGap: gap,
            pending: false,
            createdAt: now,
            updatedAt: new Date(),
          },
        ]);
      } else {
        this.messages.update((msgs) =>
          msgs.map((message) =>
            message.id === pendingId
              ? {
                  ...message,
                  pending: false,
                  text: answer,
                  html: formatAssistantMessageHtml(answer),
                  citations,
                  knowledgeGap: gap,
                  updatedAt: new Date(),
                }
              : message,
          ),
        );
      }

      this.activeThreadId.set(returnedThreadId ?? null);
      if (this.isWorkspaceMode()) {
        this.activeHistoryId.set(returnedThreadId ?? null);
      }
      if (publicResponse) {
        this.publicQuestionLimit.set(publicResponse.questionLimit ?? null);
        this.publicRemainingQuestions.set(publicResponse.remainingQuestions ?? null);
        this.publicRequiresSignIn.set(publicResponse.requiresSignIn === true);
      }
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

  formatCitationText(text: string): string {
    return text
      .replace(/\[Source:\s*[^\]]*\]/g, '')
      .replace(/\[Source:[^\]]*$/gm, '')
      .replace(/^#{2,3}\s+(.+)$/gm, '<strong class="block mt-3 mb-1 font-bold text-[var(--text)]">$1</strong>')
      .replace(/^\* /gm, '- ')
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-[var(--text)]">$1</strong>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc leading-7">$1</li>')
      .replace(/\n\n/g, '</p><p class="mt-2">')
      .replace(/\n/g, '<br/>')
      .replace(/(<br\/>)+\s*$/g, '');
  }

  async openDocumentFile(citation: CitationPassage): Promise<void> {
    const filename = citation.filename;
    if (!filename || this.isFallbackCitationFilename(filename)) {
      return;
    }

    if (this.isPublicVisitorMode()) {
      const atlasId = this.publicAtlas()?.id;
      if (!atlasId) {
        return;
      }

      const downloadUrl = await this.documentsService.getPublicDocumentLink(atlasId, filename);
      if (downloadUrl) {
        window.open(this.withCitationAnchor(downloadUrl, citation), '_blank', 'noopener,noreferrer');
      }
      return;
    }

    const documents = this.documentsService.documents();
    const match = documents.find(
      (doc) => doc.filename === filename || doc.title === filename,
    );

    if (!match) {
      return;
    }

    const downloadUrl = await this.documentsService.getAccessibleDownloadUrl(match);
    if (downloadUrl) {
      window.open(this.withCitationAnchor(downloadUrl, citation), '_blank', 'noopener,noreferrer');
    }
  }

  newChat(): void {
    this.messages.set([]);
    this.question.set('');
    this.selectedCitation.set(null);
    this.activeHistoryId.set(null);
    this.activeThreadId.set(null);
    this.messageActionMenuId.set(null);
    this.pendingDeleteHistoryItem.set(null);
  }

  async loadHistoryItem(item: ChatHistoryItem): Promise<void> {
    this.activeHistoryId.set(item.id);
    this.selectedCitation.set(null);
    this.messageActionMenuId.set(null);
    this.activeThreadId.set(item.kind === 'thread' ? item.id : null);
    const storedMessages = await this.chatService.loadHistoryMessages(item);
    this.messages.set(storedMessages.map((message) => this.mapStoredMessage(message)));
    this.shouldScrollToEnd = true;
  }

  toggleHistoryExpanded(): void {
    this.historyExpanded.update((value) => !value);
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (this.canSubmit()) {
        void this.submitQuestion();
      }
    }
  }

  handlePrimaryAction(): void {
    if (this.showSignInCta()) {
      void this.goToSignIn();
      return;
    }

    if (this.canSubmit()) {
      void this.submitQuestion();
    }
  }

  truncate(text: string, max = 48): string {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max).trim()}...` : text;
  }

  messageLabel(message: ChatMessage): string {
    return message.role === 'user' ? 'You' : 'Living Wiki';
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

  toggleMessageActions(messageId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.messageActionMenuId.update((current) => (current === messageId ? null : messageId));
  }

  confirmDeleteHistoryItem(item: ChatHistoryItem, event?: MouseEvent): void {
    event?.stopPropagation();
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

  openShareModal(): void {
    const threadId = this.activeThreadId();
    if (!threadId) {
      return;
    }

    this.shareModalError.set(null);
    this.generatedShareLink.set(this.activeThreadIsShared() ? this.buildShareUrl(threadId) : null);
    this.shareModalOpen.set(true);
  }

  closeShareModal(): void {
    this.shareModalOpen.set(false);
    this.shareModalError.set(null);
  }

  async createShareLink(): Promise<void> {
    const threadId = this.activeThreadId();
    if (!threadId || this.isSharingThread()) {
      return;
    }

    this.isSharingThread.set(true);
    try {
      const result = await this.chatService.shareThread(threadId);
      if (!result) {
        return;
      }

      this.shareModalError.set(null);
      this.generatedShareLink.set(this.buildShareUrl(result.threadId));
    } catch (error) {
      this.shareModalError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isSharingThread.set(false);
    }
  }

  async copyShareLink(): Promise<void> {
    const shareLink = this.generatedShareLink();
    if (!shareLink) {
      return;
    }

    await this.copyText('chat-share-link', shareLink);
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

  signInQueryParams(): { redirectTo: string } {
    return { redirectTo: this.publicRoute('chat') ?? this.router.url ?? '/chat' };
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

  historyTitle(item: ChatHistoryItem): string {
    return item.kind === 'thread' ? item.title : item.question;
  }

  historyUpdatedAt(item: ChatHistoryItem): { toDate(): Date } | Date | null | undefined {
    return item.updated_at ?? item.created_at;
  }

  historyTurnsLabel(item: ChatHistoryItem): string {
    if (item.kind === 'thread') {
      const turns = Math.max(1, item.user_turn_count || Math.ceil((item.message_count || 0) / 2));
      return `${turns} turn${turns === 1 ? '' : 's'}`;
    }
    return '1 turn';
  }

  private normalizeCitations(citations: CitationPassage[]): CitationPassage[] {
    const deduped = new Map<string, CitationPassage>();

    for (const citation of citations) {
      const normalized = {
        ...citation,
        filename: this.normalizeCitationFilename(citation.filename),
      };

      const key = [
        normalized.page,
        normalized.line_start,
        normalized.line_end,
        normalized.text.trim().toLowerCase(),
      ].join('::');

      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, normalized);
        continue;
      }

      const existingIsFallback = this.isFallbackCitationFilename(existing.filename);
      const candidateIsFallback = this.isFallbackCitationFilename(normalized.filename);

      if (existingIsFallback && !candidateIsFallback) {
        deduped.set(key, normalized);
      }
    }

    return Array.from(deduped.values());
  }

  private normalizeCitationFilename(filename: string | null | undefined): string {
    const value = String(filename ?? '').trim();
    if (!value || this.isFallbackCitationFilename(value)) {
      return 'Source document';
    }
    return value;
  }

  private isFallbackCitationFilename(filename: string): boolean {
    const normalized = filename.trim().toLowerCase();
    return normalized === 'unknown document' || normalized === 'source document' || normalized.startsWith('document ');
  }

  private withPdfPageAnchor(url: string, page?: number): string {
    if (!page || !/\.pdf([?#]|$)/i.test(url)) {
      return url;
    }

    const withoutHash = url.split('#')[0];
    return `${withoutHash}#page=${page}`;
  }

  private withCitationAnchor(url: string, citation: CitationPassage): string {
    if (/\.pdf([?#]|$)/i.test(url)) {
      return this.withPdfPageAnchor(url, citation.page);
    }

    return this.withTextFragment(url, citation.text);
  }

  private withTextFragment(url: string, text: string): string {
    const fragmentText = text
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .slice(0, 7)
      .join(' ');

    if (!fragmentText) {
      return url;
    }

    try {
      const parsed = new URL(url);
      parsed.hash = `:~:text=${encodeURIComponent(fragmentText)}`;
      return parsed.toString();
    } catch {
      return url;
    }
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

  private buildShareUrl(threadId: string): string {
    const path = `/chat/shared/${encodeURIComponent(threadId)}`;
    const configuredBaseUrl = typeof window !== 'undefined' ? getPublicAppUrl() : null;
    const baseUrl = configuredBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${baseUrl}${path}`;
  }

  private mapStoredMessage(message: ChatStoredMessage): ChatMessage {
    return {
      id: message.id,
      role: message.role,
      text: message.text,
      html: message.role === 'assistant' ? formatAssistantMessageHtml(message.text) : undefined,
      citations: this.normalizeCitations(message.cited_passages ?? []),
      knowledgeGap: !!message.knowledge_gap,
      createdAt: message.created_at,
      updatedAt: message.created_at,
    };
  }

  private resetPublicChatState(): void {
    this.publicChatLoading.set(false);
    this.publicLoadError.set(null);
    this.publicQuestionLimit.set(null);
    this.publicRemainingQuestions.set(null);
    this.publicRequiresSignIn.set(false);
  }

  private loadAnonymousVisitorId(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage.getItem('living-wiki:publicVisitorId');
  }

  private ensureAnonymousVisitorId(): string | null {
    const existing = this.anonymousVisitorId();
    if (existing) {
      return existing;
    }
    if (typeof window === 'undefined' || typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
      return null;
    }

    const next = crypto.randomUUID();
    window.localStorage.setItem('living-wiki:publicVisitorId', next);
    this.anonymousVisitorId.set(next);
    return next;
  }

  private async goToSignIn(): Promise<void> {
    await this.router.navigate(['/sign-in'], { queryParams: this.signInQueryParams() });
  }
}
