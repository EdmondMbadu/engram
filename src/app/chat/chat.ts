import { AfterViewChecked, Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { AtlasItem, ChatHistoryItem, ChatStoredMessage, ChatThreadItem, CitationPassage, MappableLocation, TravelGuideCard, TravelGuideStructuredResponse } from '../atlas.models';
import { AuthService } from '../auth.service';
import { AtlasService } from '../atlas.service';
import { AnswerCardService } from '../answer-card.service';
import { AnswerQuizService } from '../answer-quiz.service';
import { ChatService } from '../chat.service';
import { DocumentsService } from '../documents.service';
import { WikiService } from '../wiki.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { AtlasBadgeComponent } from '../atlas-badge/atlas-badge';
import { ChatLocationMapComponent } from '../chat-location-map/chat-location-map';
import { getPublicAppUrl } from '../firebase.config';
import {
  buildPublicWikiLiveItem,
  COMING_SOON_PUBLIC_WIKIS,
  removeCreatedPublicWikiPreviews,
  type PublicWikiCatalogItem,
  sortPublicAtlases,
} from '../public-wiki-catalog';
import { formatAssistantMessageHtml } from './message-format.util';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  html?: string;
  answerMode?: 'wiki' | 'internet';
  citations?: CitationPassage[];
  mappableLocations?: MappableLocation[];
  travelGuide?: TravelGuideStructuredResponse | null;
  answerCardId?: string | null;
  answerQuizId?: string | null;
  pending?: boolean;
  knowledgeGap?: boolean;
  createdAt?: { toDate(): Date } | Date | null;
  updatedAt?: { toDate(): Date } | Date | null;
}

interface PromptSuggestion {
  prompt: string;
  title: string;
  detail: string;
  icon: string;
}

const THINKING_STAGES = [
  'Searching knowledge base',
  'Reading relevant entries',
  'Synthesizing answer',
];

const CITY_WIKI_CATEGORY = 'Cities & Regions';

@Component({
  selector: 'app-chat',
  imports: [FormsModule, RouterLink, ThemeToggleComponent, MobileMenuComponent, AtlasBadgeComponent, ChatLocationMapComponent],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class ChatComponent implements AfterViewChecked, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly answerCardService = inject(AnswerCardService);
  private readonly answerQuizService = inject(AnswerQuizService);
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
  private answerAudio: HTMLAudioElement | null = null;
  private answerAudioUrls = new Map<string, string>();
  private answerAudioPromises = new Map<string, Promise<string | null>>();
  private voiceClickScrollPosition: ReturnType<ChatComponent['captureScrollPosition']> = null;
  private voiceScrollLockTimer: ReturnType<typeof setInterval> | null = null;

  readonly isSigningOut = signal(false);
  readonly isDeletingHistory = signal(false);
  readonly isSharingThread = signal(false);
  readonly shareModalOpen = signal(false);
  readonly shareModalError = signal<string | null>(null);
  readonly generatedShareLink = signal<string | null>(null);
  readonly subscribeModalOpen = signal(false);
  readonly subscribeEmail = signal('');
  readonly isSubscribing = signal(false);
  readonly subscribeError = signal<string | null>(null);
  readonly subscribeSuccess = signal<string | null>(null);
  readonly avatarMenuOpen = signal(false);
  readonly answerMode = signal<'wiki' | 'internet'>('wiki');
  readonly question = signal('');
  readonly selectedCitation = signal<CitationPassage | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly thinkingStage = signal(0);
  readonly historyExpanded = signal(false);
  readonly activeHistoryId = signal<string | null>(null);
  readonly activeThreadId = signal<string | null>(null);
  readonly messageActionMenuId = signal<string | null>(null);
  readonly creatingAnswerCardId = signal<string | null>(null);
  readonly creatingQuizId = signal<string | null>(null);
  readonly answerCardLinks = signal<Record<string, string>>({});
  readonly quizLinks = signal<Record<string, string>>({});
  readonly answerCardErrorMessageId = signal<string | null>(null);
  readonly answerCardError = signal<string | null>(null);
  readonly loadingSpeechMessageId = signal<string | null>(null);
  readonly playingSpeechMessageId = signal<string | null>(null);
  readonly preparedSpeechMessageIds = signal<Record<string, boolean>>({});
  readonly speechErrorMessageId = signal<string | null>(null);
  readonly speechError = signal<string | null>(null);
  readonly pendingDeleteHistoryItem = signal<ChatHistoryItem | null>(null);
  readonly copiedTarget = signal<string | null>(null);
  readonly savedTravelCardIds = signal<Record<string, boolean>>(this.loadSavedTravelCardIds());
  readonly publicAtlas = signal<AtlasItem | null>(null);
  readonly publicLookupDone = signal(false);
  readonly publicChatLoading = signal(false);
  readonly publicLoadError = signal<string | null>(null);
  readonly publicQuestionLimit = signal<number | null>(null);
  readonly publicRemainingQuestions = signal<number | null>(null);
  readonly publicRequiresSignIn = signal(false);
  readonly publicDocumentCount = signal(0);
  readonly publicCityWikis = signal<PublicWikiCatalogItem[]>(
    COMING_SOON_PUBLIC_WIKIS.filter((wiki) => wiki.category === CITY_WIKI_CATEGORY),
  );
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
  readonly hidePublicSourceFiles = computed(() => this.isPublicView() && !this.isPublicOwner());
  readonly hidePublicKnowledgeSurfaces = computed(() =>
    this.atlasService.isPublicCityVisitorAtlas(this.publicAtlas(), this.authService.uid()),
  );
  readonly isWorkspaceMode = computed(() => !this.isPublicView() || this.isPublicOwner());
  readonly isInternetMode = computed(() => this.answerMode() === 'internet');
  readonly isPublicVisitorMode = computed(() => this.isPublicView() && !this.isPublicOwner());
  readonly canUseAnswerModeToggle = computed(() =>
    (this.isWorkspaceMode() || this.isPublicVisitorMode()) && this.hasWikiDocuments(),
  );
  readonly canStartFreshChat = computed(
    () => !this.publicNotFound() && (this.isWorkspaceMode() || this.isPublicVisitorMode()),
  );
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
  @ViewChild('composerInput') composerInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('chatScrollViewport') chatScrollViewport?: ElementRef<HTMLElement>;

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
  readonly sidebarCityWikis = computed(() => {
    const currentSlug = (this.routeSlug() ?? this.currentWikiAtlas()?.slug ?? '').trim().toLowerCase();
    return this.publicCityWikis()
      .filter((wiki) => (wiki.slug ?? '').trim().toLowerCase() !== currentSlug)
      .slice(0, 1);
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
      return '';
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
    this.canUseAnswerModeToggle()
      ? this.isInternetMode()
        ? 'Ask with internet mode...'
        : 'Message My living wiki...'
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
    return 'Subscribe for weekly updates from this Wiki.';
  });
  readonly currentWikiAtlas = computed(() =>
    this.isPublicView() ? this.publicAtlas() : this.atlasService.activeAtlas(),
  );
  readonly canAdminCurrentWiki = computed(() => this.atlasService.canAdminAtlas(this.currentWikiAtlas()));
  readonly canSubscribeToCurrentWiki = computed(() => {
    const atlas = this.currentWikiAtlas();
    return !!atlas?.id && atlas.is_public === true && !this.canAdminCurrentWiki();
  });
  readonly currentWikiAdminLink = computed(() => {
    const atlas = this.currentWikiAtlas();
    return atlas && this.canAdminCurrentWiki() ? '/atlases' : null;
  });
  readonly currentWikiName = computed(() => {
    const atlas = this.currentWikiAtlas();
    if (!atlas) {
      return '';
    }
    const name = this.atlasService.displayName(atlas);
    if (!name || name === 'Select atlas') {
      return '';
    }
    return name.replace(/^My living wiki:\s*/i, '').replace(/\s*\(flagship\)\s*$/i, '').trim();
  });
  readonly currentWikiVoicePhoneNumber = computed(() => this.currentWikiAtlas()?.public_voice_phone_number?.trim() || '');
  readonly currentWikiVoicePhoneHref = computed(() => {
    const phone = this.currentWikiVoicePhoneNumber();
    const digits = phone.replace(/[^\d+]/g, '');
    return digits ? `tel:${digits}` : '';
  });
  readonly revealJoinPhoneNumber = computed(() => !!this.currentWikiVoicePhoneNumber() && (!!this.subscribeSuccess() || this.isSignedIn()));
  readonly currentWikiGuide = computed(() => {
    const guide = this.currentWikiAtlas()?.chat_guide;
    const hasGuide = !!guide?.name?.trim() || !!guide?.label?.trim() || !!guide?.image_url?.trim() || !!guide?.banner_url?.trim();
    return hasGuide ? guide : null;
  });
  readonly currentWikiDocumentCount = computed(() =>
    this.isPublicView()
      ? this.publicDocumentCount()
      : this.documentsService.stats().totalDocuments,
  );
  readonly hasWikiDocuments = computed(() => this.currentWikiDocumentCount() > 0);
  readonly currentWikiArticleCount = computed(() => this.wikiService.articles().length);
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
  readonly emptyStateEyebrow = computed(() => {
    if (this.canUseAnswerModeToggle()) {
      return this.isInternetMode() ? 'Internet mode' : 'My living wiki';
    }
    return 'Internet mode';
  });
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
    if (this.canUseAnswerModeToggle()) {
      return this.isInternetMode()
        ? 'Internet mode uses general web knowledge and current public sources, not just your uploaded material.'
        : this.currentWikiSummary();
    }
    if (!this.hasWikiDocuments()) {
      return 'No source documents are attached yet, so answers use internet context and current public sources.';
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

    if (!this.hasWikiDocuments() || (this.canUseAnswerModeToggle() && this.isInternetMode())) {
      return 'Ask anything with full internet context and live public sources.';
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

    if (!this.hasWikiDocuments() || (this.canUseAnswerModeToggle() && this.isInternetMode())) {
      return 'Internet mode is not limited to your documents. It uses public web sources and broader general knowledge.';
    }

    const name = this.currentWikiName();
    if (name) {
      return `${name} is indexed into documents and wiki pages so every answer can stay grounded in the material you uploaded.`;
    }

    return 'Your documents and wiki pages are indexed so every answer can stay grounded in the material you uploaded.';
  });
  readonly heroStatusLabel = computed(() => (this.isPublicVisitorMode() ? 'Public atlas live' : 'My living wiki live'));
  readonly heroMetaLabel = computed(() => {
    if (this.hidePublicKnowledgeSurfaces()) {
      return 'Knowledge ready';
    }

    if (this.showSignInCta()) {
      return 'Anonymous session paused';
    }

    if (!this.hasWikiDocuments() || (this.canUseAnswerModeToggle() && this.isInternetMode())) {
      return 'Internet mode enabled';
    }

    const total = this.currentWikiSourceCount();
    return total === 1 ? '1 indexed source ready' : `${total} indexed sources ready`;
  });
  readonly composerHelperText = computed(() => {
    if (!this.hasWikiDocuments()) {
      return 'Internet mode searches the web because this Wiki does not have source documents yet.';
    }

    if (this.canUseAnswerModeToggle()) {
      return this.isInternetMode()
        ? 'Internet mode searches the web and answers beyond your uploaded sources.'
        : 'My living wiki mode stays grounded in your indexed documents and wiki pages.';
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
  private cachedPrompts: PromptSuggestion[] = [];

  readonly quickPrompts = computed<PromptSuggestion[]>(() => {
    if (this.publicNotFound()) {
      return [];
    }

    const atlasName = this.currentWikiName() || 'this atlas';
    if (this.isInternetMode()) {
      return [
        {
          title: 'Latest updates',
          prompt: `What are the latest updates about ${atlasName}?`,
          detail: 'Search the web for what is current right now.',
          icon: 'public',
        },
        {
          title: 'What matters now',
          prompt: `What should I know right now about ${atlasName}?`,
          detail: 'Get a quick current-events briefing.',
          icon: 'bolt',
        },
        {
          title: 'Recent debates',
          prompt: `What are people debating about ${atlasName} right now?`,
          detail: 'Pull in live internet context and discussion themes.',
          icon: 'forum',
        },
        {
          title: 'Background context',
          prompt: `Give me background context on ${atlasName} from public sources.`,
          detail: 'Pull broader context from the open web.',
          icon: 'travel_explore',
        },
      ];
    }

    const topics = this.wikiService.topics();
    const articles = this.wikiService.articles();
    const atlasId = this.isPublicView()
      ? this.publicAtlas()?.id ?? this.routeSlug() ?? ''
      : this.atlasService.activeAtlasId() ?? '';
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

    const uniqueCandidates = Array.from(
      new Set(candidates.map((candidate) => candidate.replace(/\s+/g, ' ').trim()).filter(Boolean)),
    );

    const picks = uniqueCandidates.slice(0, 4);

    const built = picks.length > 0
      ? picks.map((label, i) => ({
          title: label,
          prompt: [
            `What is ${label}?`,
            `Why does ${label} matter?`,
            `Give me the key facts about ${label}.`,
            `How does ${label} connect to ${atlasName}?`,
          ][i % 4],
          detail: i % 2 === 0 ? 'Grounded in the wiki and its sources.' : 'Use the atlas knowledge base for context.',
          icon: i % 2 === 0 ? 'auto_stories' : 'explore',
        }))
      : [
          {
            title: 'Quick overview',
            prompt: `Give me a quick overview of ${atlasName}.`,
            detail: 'Start with the highest-signal summary from the wiki.',
            icon: 'dashboard',
          },
          {
            title: 'Important topics',
            prompt: `What are the most important topics in ${atlasName}?`,
            detail: 'See the main themes already covered in this wiki.',
            icon: 'menu_book',
          },
          {
            title: 'Best starting point',
            prompt: `What should I read first about ${atlasName}?`,
            detail: 'Ask the wiki where a new reader should begin.',
            icon: 'flag',
          },
          {
            title: 'Key questions',
            prompt: `What are the key open questions about ${atlasName}?`,
            detail: 'Surface the unresolved or most-discussed questions.',
            icon: 'help',
          },
        ];

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

  cityWikiRouterLink(wiki: PublicWikiCatalogItem): string | string[] {
    return wiki.status === 'live' && wiki.slug ? ['/chat', wiki.slug] : '/public-wikis';
  }

  cityWikiStatusLabel(wiki: PublicWikiCatalogItem): string {
    return wiki.status === 'live' ? 'Live' : 'Preview';
  }

  cityWikiLocationLabel(wiki: PublicWikiCatalogItem): string {
    return wiki.title.replace(/^My living wiki:\s*/i, '').trim();
  }

  constructor() {
    void this.loadSidebarCityWikis();

    effect((onCleanup) => {
      const slug = this.routeSlug();
      if (!slug) {
        this.publicAtlas.set(null);
        this.publicLookupDone.set(true);
        this.publicChatLoading.set(false);
        this.publicLoadError.set(null);
        this.publicDocumentCount.set(0);
        return;
      }

      this.publicAtlas.set(null);
      this.publicLookupDone.set(false);
      this.publicLoadError.set(null);
      this.messages.set([]);
      this.syncArtifactLinksFromMessages([]);
      this.activeThreadId.set(null);
      this.activeHistoryId.set(null);
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });
      void this.atlasService
        .getPublicAtlasBySlug(slug)
        .then((atlas) => {
          if (!cancelled) {
            this.publicAtlas.set(atlas);
          }
        })
        .catch(() => {
          if (!cancelled) {
            this.publicAtlas.set(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            this.publicLookupDone.set(true);
          }
        });
    });

    effect((onCleanup) => {
      const atlasId = this.isPublicView() ? this.publicAtlas()?.id ?? null : null;
      let cancelled = false;

      this.wikiService.setPublicAtlasId(atlasId);

      if (!atlasId) {
        this.publicDocumentCount.set(0);
        return;
      }

      void this.documentsService
        .getPublicAtlasDocuments(atlasId)
        .then((documents) => {
          if (!cancelled) {
            this.publicDocumentCount.set(documents.length);
          }
        })
        .catch(() => {
          if (!cancelled) {
            this.publicDocumentCount.set(0);
          }
        });

      onCleanup(() => {
        cancelled = true;
      });
    });

    effect(() => {
      if (!this.isPublicView()) {
        return;
      }

      const atlas = this.publicAtlas();
      if (atlas?.id && this.atlasService.canAdminAtlas(atlas)) {
        this.atlasService.setActive(atlas.id);
      }
    });

    effect(() => {
      const atlas = this.currentWikiAtlas();
      const canUseToggle = this.canUseAnswerModeToggle();
      const hasActiveConversation = !!this.activeThreadId() || this.messages().length > 0;
      if (!atlas?.id || hasActiveConversation) {
        return;
      }

      if (!canUseToggle) {
        this.answerMode.set('internet');
        return;
      }

      this.answerMode.set(this.defaultAnswerMode(atlas));
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
        this.syncArtifactLinksFromMessages([]);
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
        this.syncArtifactLinksFromMessages([]);
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
      this.syncArtifactLinksFromMessages([]);
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
          const mappedMessages = state.messages.map((message) => this.mapStoredMessage(message));
          this.messages.set(mappedMessages);
          this.syncArtifactLinksFromMessages(mappedMessages);
          this.syncAnswerModeFromMessages(mappedMessages);
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
          this.syncArtifactLinksFromMessages([]);
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
    queueMicrotask(() => this.autoGrowComposer());
    const selectedAnswerMode = this.canUseAnswerModeToggle() ? this.answerMode() : 'internet';

    const now = new Date();
    const userId = `u-${Date.now()}`;
    const pendingId = `a-${Date.now()}`;
    this.messages.update((msgs) => [
      ...msgs,
      { id: userId, role: 'user', text: question, answerMode: selectedAnswerMode, createdAt: now, updatedAt: now },
      { id: pendingId, role: 'assistant', text: '', answerMode: selectedAnswerMode, pending: true, createdAt: now, updatedAt: now },
    ]);
    this.shouldScrollToEnd = true;
    this.startThinkingRotation();

    let streamStarted = false;
    const response = this.isWorkspaceMode()
      ? selectedAnswerMode === 'internet'
        ? await this.chatService.askInternetStream(question, submittedThreadId, {
            onDelta: (delta) => {
              if (!streamStarted) {
                streamStarted = true;
                this.stopThinkingRotation();
              }
              this.messages.update((msgs) =>
                msgs.map((message) => {
                  if (message.id !== pendingId) {
                    return message;
                  }
                  const text = `${message.text ?? ''}${delta}`;
                  return {
                    ...message,
                    text,
                    html: formatAssistantMessageHtml(text),
                    updatedAt: new Date(),
                  };
                }),
              );
              this.shouldScrollToEnd = true;
            },
          })
        : await this.chatService.ask(question, undefined, submittedThreadId)
      : await this.chatService.askPublic(question, this.publicAtlas()!.id, {
          threadId: submittedThreadId,
          anonymousVisitorId: this.isAnonymousPublicVisitor() ? this.ensureAnonymousVisitorId() : null,
          answerMode: selectedAnswerMode,
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
                answerMode: selectedAnswerMode,
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
      const mappableLocations = this.normalizeMappableLocations(response?.mappableLocations ?? []);
      const travelGuide = this.normalizeTravelGuide(response?.travelGuide ?? null);
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
            answerMode: selectedAnswerMode,
            citations,
            mappableLocations,
            travelGuide,
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
                  answerMode: selectedAnswerMode,
                  citations,
                  mappableLocations,
                  travelGuide,
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
      if (!blocked && answer.trim()) {
        this.prepareAnswerAudioPreview(pendingId);
      }
    }

    this.shouldScrollToEnd = true;
  }

  usePrompt(prompt: string): void {
    this.question.set(prompt);
    queueMicrotask(() => {
      const input = this.composerInput?.nativeElement;
      if (!input) return;
      input.focus();
      input.setSelectionRange(prompt.length, prompt.length);
      this.autoGrowComposer();
    });
  }

  async toggleReadAnswer(message: ChatMessage, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    if (message.pending || !message.text.trim() || typeof Audio === 'undefined') {
      return;
    }
    this.shouldScrollToEnd = false;
    const scrollPosition = this.voiceClickScrollPosition ?? this.captureScrollPosition();
    this.lockScrollPosition(scrollPosition);

    if (this.playingSpeechMessageId() === message.id) {
      this.stopAnswerAudio();
      this.unlockScrollPosition(scrollPosition);
      return;
    }

    this.stopAnswerAudio();
    this.speechError.set(null);
    this.speechErrorMessageId.set(null);

    const audio = new Audio();
    audio.preload = 'auto';
    audio.onended = () => this.stopAnswerAudio();
    audio.onerror = () => {
      this.speechError.set('Audio playback failed.');
      this.speechErrorMessageId.set(message.id);
      this.stopAnswerAudio();
    };
    this.answerAudio = audio;
    void audio.play().catch(() => undefined);

    const audioUrlPromise = this.ensureAnswerAudioUrl(message, true);
    this.restoreScrollPosition(scrollPosition);
    const audioUrl = await audioUrlPromise;
    if (!audioUrl || this.answerAudio !== audio) {
      this.unlockScrollPosition(scrollPosition);
      return;
    }

    audio.src = audioUrl;
    this.playingSpeechMessageId.set(message.id);
    this.restoreScrollPosition(scrollPosition);

    try {
      await audio.play();
      this.unlockScrollPosition(scrollPosition);
    } catch (error) {
      this.speechError.set(this.authService.toFriendlyError(error));
      this.speechErrorMessageId.set(message.id);
      this.stopAnswerAudio();
      this.unlockScrollPosition(scrollPosition);
    }
  }

  prepareReadAnswerClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.shouldScrollToEnd = false;
    this.voiceClickScrollPosition = this.captureScrollPosition();
    this.lockScrollPosition(this.voiceClickScrollPosition);
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.blur();
    }
  }

  setAnswerMode(mode: 'wiki' | 'internet'): void {
    if (!this.canUseAnswerModeToggle()) {
      this.answerMode.set('internet');
      return;
    }
    if (mode === 'wiki' && !this.hasWikiDocuments()) {
      this.answerMode.set('internet');
      return;
    }
    this.answerMode.set(mode);
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
    this.clearSpeechState(true);
    this.messages.set([]);
    this.syncArtifactLinksFromMessages([]);
    this.question.set('');
    this.selectedCitation.set(null);
    this.activeHistoryId.set(null);
    this.activeThreadId.set(null);
    this.messageActionMenuId.set(null);
    this.pendingDeleteHistoryItem.set(null);
    this.answerMode.set(this.defaultAnswerMode(this.currentWikiAtlas()));
    queueMicrotask(() => this.autoGrowComposer());
  }

  async loadHistoryItem(item: ChatHistoryItem): Promise<void> {
    this.clearSpeechState(true);
    this.activeHistoryId.set(item.id);
    this.selectedCitation.set(null);
    this.messageActionMenuId.set(null);
    this.activeThreadId.set(item.kind === 'thread' ? item.id : null);
    const storedMessages = await this.chatService.loadHistoryMessages(item);
    const mappedMessages = storedMessages.map((message) => this.mapStoredMessage(message));
    this.messages.set(mappedMessages);
    this.syncArtifactLinksFromMessages(mappedMessages);
    this.syncAnswerModeFromMessages(mappedMessages);
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

  onComposerInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    if (!target) return;
    this.question.set(target.value);
    this.resizeComposer(target);
  }

  autoGrowComposer(): void {
    const input = this.composerInput?.nativeElement;
    if (!input) return;
    this.resizeComposer(input);
  }

  private resizeComposer(input: HTMLTextAreaElement): void {
    input.style.height = 'auto';
    const maxHeight = Number.parseFloat(window.getComputedStyle(input).maxHeight);
    const nextHeight = Number.isFinite(maxHeight)
      ? Math.min(input.scrollHeight, maxHeight)
      : input.scrollHeight;
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > nextHeight ? 'auto' : 'hidden';
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
    if (message.role === 'user') {
      return 'You';
    }
    return message.answerMode === 'internet' ? 'Internet' : 'My living wiki';
  }

  assistantMessageName(): string {
    return this.currentWikiGuide()?.name?.trim() || 'My living wiki';
  }

  assistantMessageSubtitle(message: ChatMessage): string {
    const guideLabel = this.currentWikiGuide()?.label?.trim();
    return guideLabel || this.messageLabel(message);
  }

  assistantAvatarUrl(): string {
    return this.currentWikiGuide()?.image_url?.trim() || '/assets/image/my-living-wiki.png';
  }

  assistantAvatarAlt(): string {
    const name = this.assistantMessageName();
    return name === 'My living wiki' ? 'My living wiki' : `${name} guide`;
  }

  travelGuideForMessage(message: ChatMessage): TravelGuideStructuredResponse | null {
    return message.role === 'assistant' && !message.pending ? message.travelGuide ?? null : null;
  }

  travelCardImageUrl(card: TravelGuideCard): string | null {
    return card.image_url?.trim() || null;
  }

  travelGuideHeroImage(): string | null {
    return this.currentWikiGuide()?.banner_url?.trim() || this.currentWikiAtlas()?.hero_url?.trim() || null;
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
    const fallback = index % 2 === 0
      ? 'linear-gradient(135deg, #1f3b57 0%, #5d6f82 52%, #d0a85b 100%)'
      : 'linear-gradient(135deg, #2d4656 0%, #7a6a52 52%, #c69c4a 100%)';
    return fallback;
  }

  travelCardVisualIcon(card: TravelGuideCard): string {
    const text = `${card.title} ${card.best_for ?? ''} ${card.vibe ?? ''}`.toLowerCase();
    if (/(food|steak|cheese|restaurant|sandwich|bar|coffee|market|eat|drink)/.test(text)) {
      return 'restaurant';
    }
    if (/(museum|history|historic|hall|art|gallery|library)/.test(text)) {
      return 'museum';
    }
    if (/(park|trail|river|garden|outdoor|walk)/.test(text)) {
      return 'park';
    }
    if (/(music|show|theater|night|club|venue)/.test(text)) {
      return 'local_activity';
    }
    if (/(shop|store|market|boutique)/.test(text)) {
      return 'storefront';
    }
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

  guideIntro(message: ChatMessage, guide: TravelGuideStructuredResponse): string {
    const question = this.questionBeforeMessage(message.id).replace(/[?!.]+$/, '').trim();
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

  travelCardMapUrl(card: TravelGuideCard): string {
    const query = card.map_query?.trim() || card.subtitle?.trim() || card.title;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  travelCardSourceUrl(card: TravelGuideCard): string | null {
    const sourceUrl = card.source_url?.trim();
    if (!sourceUrl) {
      return null;
    }
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

  saveTravelCard(card: TravelGuideCard, event?: MouseEvent): void {
    event?.stopPropagation();
    const storageId = this.travelCardStorageId(card);
    const next = {
      ...this.savedTravelCardIds(),
      [storageId]: true,
    };
    this.savedTravelCardIds.set(next);
    this.persistSavedTravelCardIds(next);
    this.copiedTarget.set(`save:${storageId}`);
  }

  async shareTravelCard(card: TravelGuideCard, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    await this.copyText(`share:${this.travelCardStorageId(card)}`, this.buildTravelCardShareText(card));
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

  openSubscribeModal(): void {
    const atlas = this.currentWikiAtlas();
    if (!atlas || !this.canSubscribeToCurrentWiki()) {
      return;
    }

    const currentEmail = this.currentUserEmail()?.trim() ?? '';
    this.subscribeEmail.set(currentEmail);
    this.subscribeError.set(null);
    this.subscribeSuccess.set(null);
    this.subscribeModalOpen.set(true);
  }

  closeSubscribeModal(): void {
    if (this.isSubscribing()) {
      return;
    }
    this.subscribeModalOpen.set(false);
    this.subscribeError.set(null);
    this.subscribeSuccess.set(null);
  }

  onSubscribeEmailInput(event: Event): void {
    this.subscribeEmail.set((event.target as HTMLInputElement).value);
    this.subscribeError.set(null);
  }

  async subscribeToUpdates(event: Event): Promise<void> {
    event.preventDefault();
    const atlas = this.currentWikiAtlas();
    const email = this.subscribeEmail().trim().toLowerCase();
    if (!atlas?.id || this.isSubscribing()) {
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.subscribeError.set('Enter a valid email address.');
      return;
    }

    this.isSubscribing.set(true);
    this.subscribeError.set(null);
    this.subscribeSuccess.set(null);
    try {
      const result = await this.atlasService.subscribeToAtlasUpdates({
        atlasId: atlas.id,
        email,
        anonymousVisitorId: this.anonymousVisitorId(),
      });
      this.subscribeSuccess.set(
        result.alreadySubscribed
          ? 'You are already subscribed to weekly updates for this wiki.'
          : 'You are subscribed. A confirmation email is on the way.',
      );
    } catch (error) {
      this.subscribeError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isSubscribing.set(false);
    }
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

  async copyMessageBody(message: ChatMessage, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    await this.copyText(`${message.id}:body`, message.text.trim());
  }

  canCreateAnswerCard(message: ChatMessage): boolean {
    return message.role === 'assistant' && !message.pending && !!message.text.trim() && this.isSignedIn();
  }

  canShowAnswerCardAction(message: ChatMessage): boolean {
    return message.role === 'assistant' && !message.pending && !!message.text.trim();
  }

  async createAnswerCardForMessage(message: ChatMessage, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    if (!this.canCreateAnswerCard(message) || this.creatingAnswerCardId()) {
      return;
    }

    const cardId = await this.ensureAnswerCardForMessage(message);
    if (cardId) {
      await this.router.navigateByUrl(`/answer-card/${cardId}`);
    }
  }

  async createQuizForMessage(message: ChatMessage, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    if (!this.canCreateAnswerCard(message) || this.creatingQuizId() || this.creatingAnswerCardId()) {
      return;
    }

    if (message.answerQuizId) {
      await this.router.navigateByUrl(`/quiz/${message.answerQuizId}`);
      return;
    }

    this.answerCardError.set(null);
    this.answerCardErrorMessageId.set(null);
    this.creatingQuizId.set(message.id);
    this.messageActionMenuId.set(null);

    try {
      const cardId = await this.ensureAnswerCardForMessage(message);
      if (!cardId) {
        return;
      }
      const quiz = await this.answerQuizService.createQuizFromAnswerCard(cardId, {
        sourceMessageId: message.id,
        sourceMessageKind: this.sourceMessageKind(),
      });
      const quizLink = `/quiz/${quiz.id}`;
      this.quizLinks.update((links) => ({
        ...links,
        [message.id]: quizLink,
      }));
      this.messages.update((messages) =>
        messages.map((item) => item.id === message.id ? { ...item, answerCardId: cardId, answerQuizId: quiz.id } : item),
      );
      await this.router.navigateByUrl(quizLink);
    } catch (error) {
      this.answerCardError.set(error instanceof Error ? error.message : 'Failed to create quiz.');
      this.answerCardErrorMessageId.set(message.id);
    } finally {
      this.creatingQuizId.set(null);
    }
  }

  private async ensureAnswerCardForMessage(message: ChatMessage): Promise<string | null> {
    const existingCardId = message.answerCardId ?? this.cardIdFromLink(this.answerCardLinks()[message.id]);
    if (existingCardId) {
      this.answerCardLinks.update((links) => ({
        ...links,
        [message.id]: `/answer-card/${existingCardId}`,
      }));
      return existingCardId;
    }

    this.answerCardError.set(null);
    this.answerCardErrorMessageId.set(null);
    this.creatingAnswerCardId.set(message.id);
    this.messageActionMenuId.set(null);

    try {
      const question = this.questionBeforeMessage(message.id);
      const atlas = this.currentWikiAtlas();
      const card = await this.answerCardService.createAnswerCard({
        question: question || 'My living wiki question',
        answer: message.text,
        atlasId: atlas?.id ?? null,
        threadId: this.activeThreadId(),
        sourceMessageId: message.id,
        sourceMessageKind: this.sourceMessageKind(),
        answerMode: message.answerMode ?? this.answerMode(),
        mappableLocations: message.mappableLocations ?? [],
      });
      this.answerCardLinks.update((links) => ({
        ...links,
        [message.id]: `/answer-card/${card.id}`,
      }));
      this.messages.update((messages) =>
        messages.map((item) => item.id === message.id ? { ...item, answerCardId: card.id } : item),
      );
      return card.id;
    } catch (error) {
      this.answerCardError.set(error instanceof Error ? error.message : 'Failed to create answer card.');
      this.answerCardErrorMessageId.set(message.id);
      return null;
    } finally {
      this.creatingAnswerCardId.set(null);
    }
  }

  private cardIdFromLink(link: string | undefined): string | null {
    if (!link) {
      return null;
    }
    const match = link.match(/\/answer-card\/([^/?#]+)/);
    return match?.[1] ?? null;
  }

  private sourceMessageKind(): 'workspace' | 'public' {
    return this.isPublicVisitorMode() ? 'public' : 'workspace';
  }

  ngAfterViewChecked(): void {
    if (this.voiceScrollLockTimer) {
      this.shouldScrollToEnd = false;
      this.restoreScrollPosition(this.voiceClickScrollPosition);
      return;
    }

    if (this.shouldScrollToEnd) {
      this.shouldScrollToEnd = false;
      this.transcriptEnd?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  ngOnDestroy(): void {
    if (this.thinkingInterval) {
      clearInterval(this.thinkingInterval);
      this.thinkingInterval = null;
    }
    if (this.copyFeedbackTimeout) {
      clearTimeout(this.copyFeedbackTimeout);
      this.copyFeedbackTimeout = null;
    }
    this.unlockScrollPosition(this.voiceClickScrollPosition);
    this.clearSpeechState(true);
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

    if (message.travelGuide?.cards.length) {
      lines.push('');
      lines.push('Guide cards:');
      for (const card of message.travelGuide.cards) {
        lines.push(`- ${card.title}: ${card.description}`);
      }
    }

    return lines.join('\n');
  }

  private questionBeforeMessage(messageId: string): string {
    const messages = this.messages();
    const index = messages.findIndex((message) => message.id === messageId);
    if (index <= 0) {
      return '';
    }

    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = messages[i];
      if (candidate?.role === 'user' && candidate.text.trim()) {
        return candidate.text.trim();
      }
    }
    return '';
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

  private normalizeMappableLocations(locations: MappableLocation[]): MappableLocation[] {
    const deduped = new Map<string, MappableLocation>();

    for (const location of locations) {
      const name = location.name?.trim();
      const searchQuery = location.search_query?.trim();
      if (!name || !searchQuery) {
        continue;
      }

      const key = `${name.toLowerCase()}::${searchQuery.toLowerCase()}`;
      if (!deduped.has(key)) {
        deduped.set(key, {
          name,
          search_query: searchQuery,
          address_hint: location.address_hint?.trim() || null,
        });
      }
    }

    return Array.from(deduped.values()).slice(0, 6);
  }

  private normalizeTravelGuide(guide: TravelGuideStructuredResponse | null | undefined): TravelGuideStructuredResponse | null {
    if (!guide || !Array.isArray(guide.cards)) {
      return null;
    }

    const cards = guide.cards
      .map((card, index): TravelGuideCard | null => {
        const title = this.cleanTravelCardText(card.title ?? '');
        const description = this.cleanTravelCardText(card.description ?? '');
        if (!title || !description) {
          return null;
        }

        return {
          id: card.id?.trim() || `guide-card-${index + 1}`,
          title,
          subtitle: card.subtitle ? this.cleanTravelCardText(card.subtitle) || null : null,
          description,
          neighborhood: card.neighborhood ? this.cleanTravelCardText(card.neighborhood) || null : null,
          best_for: card.best_for ? this.cleanTravelCardText(card.best_for) || null : null,
          vibe: card.vibe ? this.cleanTravelCardText(card.vibe) || null : null,
          local_tip: card.local_tip ? this.cleanTravelCardText(card.local_tip) || null : null,
          cost: card.cost ? this.cleanTravelCardText(card.cost) || null : null,
          time_hint: card.time_hint ? this.cleanTravelCardText(card.time_hint) || null : null,
          image_url: card.image_url?.trim() || null,
          map_query: card.map_query?.trim() || null,
          source_url: card.source_url?.trim() || null,
        };
      })
      .filter((card): card is TravelGuideCard => !!card)
      .slice(0, 5);

    if (cards.length === 0) {
      return null;
    }

    return {
      title: guide.title?.trim() || null,
      summary: guide.summary?.trim() || null,
      cards,
      route: guide.route?.trim() || null,
      next_actions: (guide.next_actions ?? []).map((action) => action.trim()).filter(Boolean).slice(0, 4),
    };
  }

  travelCardStorageId(card: TravelGuideCard): string {
    return `${this.currentWikiAtlas()?.id ?? 'wiki'}:${card.id || card.title}`.toLowerCase();
  }

  private buildTravelCardShareText(card: TravelGuideCard): string {
    const lines = [
      card.title,
      card.subtitle,
      card.description,
      card.best_for ? `Best for: ${card.best_for}` : '',
      card.local_tip ? `Tip: ${card.local_tip}` : '',
      `Map: ${this.travelCardMapUrl(card)}`,
    ].filter(Boolean);
    return lines.join('\n');
  }

  private cleanTravelCardText(value: string): string {
    return value
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

  private loadSavedTravelCardIds(): Record<string, boolean> {
    if (typeof window === 'undefined') {
      return {};
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem('living-wiki:saved-travel-cards') ?? '{}') as unknown;
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>)
          .filter(([, value]) => value === true),
      ) as Record<string, boolean>;
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

  private ensureAnswerAudioUrl(message: ChatMessage, showLoading: boolean): Promise<string | null> {
    const cachedUrl = this.answerAudioUrls.get(message.id);
    if (cachedUrl) {
      this.preparedSpeechMessageIds.update((items) => ({ ...items, [message.id]: true }));
      return Promise.resolve(cachedUrl);
    }

    const pending = this.answerAudioPromises.get(message.id);
    if (pending) {
      if (showLoading) {
        this.loadingSpeechMessageId.set(message.id);
        pending.finally(() => {
          if (this.loadingSpeechMessageId() === message.id) {
            this.loadingSpeechMessageId.set(null);
          }
        });
      }
      return pending;
    }

    if (showLoading) {
      this.loadingSpeechMessageId.set(message.id);
    }

    const promise = this.chatService
      .synthesizeAnswerSpeech(
        message.text,
        this.questionBeforeMessage(message.id),
        this.isAnonymousPublicVisitor() ? this.ensureAnonymousVisitorId() : null,
      )
      .then((response) => {
        if (response?.audioUrl) {
          this.answerAudioUrls.set(message.id, response.audioUrl);
          this.preparedSpeechMessageIds.update((items) => ({ ...items, [message.id]: true }));
          return response.audioUrl;
        }
        if (response?.audioBase64) {
          const blob = this.audioBlobFromBase64(response.audioBase64, response.contentType || 'audio/mpeg');
          const audioUrl = URL.createObjectURL(blob);
          this.answerAudioUrls.set(message.id, audioUrl);
          this.preparedSpeechMessageIds.update((items) => ({ ...items, [message.id]: true }));
          return audioUrl;
        }
        throw new Error('No audio was returned for this answer.');
      })
      .catch((error) => {
        if (showLoading) {
          this.speechError.set(this.authService.toFriendlyError(error));
          this.speechErrorMessageId.set(message.id);
        }
        return null;
      })
      .finally(() => {
        this.answerAudioPromises.delete(message.id);
        if (this.loadingSpeechMessageId() === message.id) {
          this.loadingSpeechMessageId.set(null);
        }
      });

    this.answerAudioPromises.set(message.id, promise);
    return promise;
  }

  private prepareAnswerAudioPreview(messageId: string): void {
    const message = this.messages().find((item) => item.id === messageId);
    if (!message || message.pending || message.role !== 'assistant' || !message.text.trim()) {
      return;
    }

    void this.ensureAnswerAudioUrl(message, false);
  }

  private stopAnswerAudio(): void {
    if (this.answerAudio) {
      this.answerAudio.pause();
      this.answerAudio.currentTime = 0;
      this.answerAudio.onended = null;
      this.answerAudio.onerror = null;
      this.answerAudio = null;
    }
    this.playingSpeechMessageId.set(null);
  }

  private clearSpeechState(revokeUrls = false): void {
    this.stopAnswerAudio();
    this.loadingSpeechMessageId.set(null);
    this.speechErrorMessageId.set(null);
    this.speechError.set(null);

    if (!revokeUrls) {
      return;
    }

    this.answerAudioPromises.clear();
    for (const audioUrl of this.answerAudioUrls.values()) {
      if (audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrl);
      }
    }
    this.answerAudioUrls.clear();
  }

  private audioBlobFromBase64(audioBase64: string, contentType: string): Blob {
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: contentType });
  }

  private captureScrollPosition(): {
    windowY: number;
    documentY: number;
    bodyY: number;
    viewportTop: number | null;
  } | null {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return null;
    }

    return {
      windowY: window.scrollY,
      documentY: document.documentElement.scrollTop,
      bodyY: document.body.scrollTop,
      viewportTop: this.chatScrollViewport?.nativeElement.scrollTop ?? null,
    };
  }

  private restoreScrollPosition(position: {
    windowY: number;
    documentY: number;
    bodyY: number;
    viewportTop: number | null;
  } | null): void {
    if (!position || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const restore = () => {
      this.shouldScrollToEnd = false;
      const viewport = this.chatScrollViewport?.nativeElement;
      if (viewport && position.viewportTop !== null) {
        viewport.scrollTop = position.viewportTop;
      }
      window.scrollTo({ top: position.windowY, left: window.scrollX, behavior: 'auto' });
      document.documentElement.scrollTop = position.documentY;
      document.body.scrollTop = position.bodyY;
    };

    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 50);
    setTimeout(restore, 250);
  }

  private lockScrollPosition(position: ReturnType<ChatComponent['captureScrollPosition']>): void {
    if (!position) {
      return;
    }

    this.restoreScrollPosition(position);
    if (this.voiceScrollLockTimer) {
      return;
    }

    this.voiceScrollLockTimer = setInterval(() => {
      this.restoreScrollPosition(position);
    }, 40);
  }

  private unlockScrollPosition(position: ReturnType<ChatComponent['captureScrollPosition']>): void {
    if (this.voiceScrollLockTimer) {
      clearInterval(this.voiceScrollLockTimer);
      this.voiceScrollLockTimer = null;
    }
    this.restoreScrollPosition(position);
    this.voiceClickScrollPosition = null;
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
      answerMode: message.answer_mode === 'internet' ? 'internet' : 'wiki',
      citations: this.normalizeCitations(message.cited_passages ?? []),
      mappableLocations: this.normalizeMappableLocations(message.mappable_locations ?? []),
      travelGuide: this.normalizeTravelGuide(message.travel_guide ?? null),
      answerCardId: message.answer_card_id ?? null,
      answerQuizId: message.answer_quiz_id ?? null,
      knowledgeGap: !!message.knowledge_gap,
      createdAt: message.created_at,
      updatedAt: message.created_at,
    };
  }

  private syncArtifactLinksFromMessages(messages: ChatMessage[]): void {
    const answerCardLinks: Record<string, string> = {};
    const quizLinks: Record<string, string> = {};

    for (const message of messages) {
      if (message.role !== 'assistant') {
        continue;
      }
      if (message.answerCardId) {
        answerCardLinks[message.id] = `/answer-card/${message.answerCardId}`;
      }
      if (message.answerQuizId) {
        quizLinks[message.id] = `/quiz/${message.answerQuizId}`;
      }
    }

    this.answerCardLinks.set(answerCardLinks);
    this.quizLinks.set(quizLinks);
  }

  private syncAnswerModeFromMessages(messages: ChatMessage[]): void {
    if (!this.canUseAnswerModeToggle()) {
      this.answerMode.set('internet');
      return;
    }

    const assistantMessage = [...messages].reverse().find((message) => message.role === 'assistant');
    if (!assistantMessage) {
      this.answerMode.set(this.defaultAnswerMode(this.currentWikiAtlas()));
      return;
    }

    this.answerMode.set(assistantMessage.answerMode === 'internet' ? 'internet' : 'wiki');
  }

  private defaultAnswerMode(atlas: AtlasItem | null | undefined): 'wiki' | 'internet' {
    return atlas?.default_answer_mode === 'internet' ? 'internet' : 'wiki';
  }

  private resetPublicChatState(): void {
    this.publicChatLoading.set(false);
    this.publicLoadError.set(null);
    this.publicQuestionLimit.set(null);
    this.publicRemainingQuestions.set(null);
    this.publicRequiresSignIn.set(false);
  }

  private async loadSidebarCityWikis(): Promise<void> {
    const comingSoon = COMING_SOON_PUBLIC_WIKIS.filter((wiki) => wiki.category === CITY_WIKI_CATEGORY);
    try {
      const liveWikis = sortPublicAtlases(await this.atlasService.listPublicAtlases())
        .map((atlas) => buildPublicWikiLiveItem(atlas))
        .filter((wiki) => wiki.category === CITY_WIKI_CATEGORY);
      this.publicCityWikis.set([
        ...liveWikis,
        ...removeCreatedPublicWikiPreviews(liveWikis, comingSoon),
      ]);
    } catch {
      this.publicCityWikis.set(comingSoon);
    }
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
