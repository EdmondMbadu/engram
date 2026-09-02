import { Component, computed, HostListener, inject, input, OnDestroy, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DisconnectionDetails } from '@elevenlabs/client';
import { BackdropDismissDirective } from '../backdrop-dismiss.directive';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { ChatService, type VoiceSummaryTranscriptItem } from '../chat.service';
import { VoiceFluidVisualComponent } from '../chat/voice-fluid-visual';

type ConversationMessage = { id: string; role: 'user' | 'agent'; text: string };
type VoiceConversation = Awaited<ReturnType<typeof import('@elevenlabs/client').Conversation.startSession>>;
type ConversationMode = 'voice' | 'text';
type VoiceMode = 'speaking' | 'listening' | null;
type ConversationCompletionReason = 'ended' | 'closed' | 'interrupted';
type ConversationStage = 'conversation' | 'recap' | 'sent';

const TALKING_CARD_RECAP_MIN_LENGTH = 40;
const TALKING_CARD_RECAP_MAX_MESSAGES = 40;

export function meaningfulTalkingCardTranscript(
  transcript: VoiceSummaryTranscriptItem[],
): VoiceSummaryTranscriptItem[] {
  const normalized = transcript
    .map((item) => ({
      role: item.role,
      text: item.text.replace(/\s+/g, ' ').trim().slice(0, 1000),
    }))
    .filter((item) => item.text && !/^voice session ended:/i.test(item.text))
    .slice(-TALKING_CARD_RECAP_MAX_MESSAGES);
  const firstUserIndex = normalized.findIndex((item) => item.role === 'user');
  return firstUserIndex >= 0 ? normalized.slice(firstUserIndex) : [];
}

export function shouldOfferTalkingCardRecap(
  transcript: VoiceSummaryTranscriptItem[],
): boolean {
  const meaningful = meaningfulTalkingCardTranscript(transcript);
  return meaningful.some((item) => item.role === 'user')
    && meaningful.some((item) => item.role === 'agent')
    && meaningful.reduce((length, item) => length + item.text.length, 0) >= TALKING_CARD_RECAP_MIN_LENGTH;
}

export function buildTalkingCardVoiceContext(
  atlas: Pick<AtlasItem, 'name' | 'wiki_type' | 'response_perspective'>,
  sessionDynamicVariables: Record<string, unknown> = {},
): {
  subjectType: string;
  responsePerspective: 'first_person' | 'third_person';
  instruction: string;
} {
  const subjectType = String(
    atlas.wiki_type ?? sessionDynamicVariables['atlas_subject_type'] ?? 'person',
  ).trim() || 'person';
  const configuredPerspective = String(
    atlas.response_perspective ?? sessionDynamicVariables['atlas_response_perspective'] ?? 'auto',
  ).trim();
  const responsePerspective = configuredPerspective === 'first_person'
    || (configuredPerspective === 'auto' && subjectType === 'person')
    ? 'first_person'
    : 'third_person';
  const personaInstruction = String(sessionDynamicVariables['atlas_persona_instruction'] ?? '').trim();
  const identityInstruction = String(sessionDynamicVariables['atlas_identity_instruction'] ?? '').trim();
  const subjectContextInstruction = responsePerspective === 'first_person'
    ? [
        `This voice conversation is for the ${subjectType} Wiki about ${atlas.name}.`,
        `Speak as ${atlas.name} in the first person and stay grounded in the historical or supplied record.`,
        `${atlas.name} is a person, not a city. Never describe the subject as a city or say you are here to help with the city.`,
      ].join(' ')
    : [
        `This voice conversation is for the ${subjectType} Wiki about ${atlas.name}.`,
        `Speak as a knowledgeable guide about ${atlas.name} in the third person.`,
        subjectType !== 'city' ? `${atlas.name} is not a city. Never describe the subject as a city.` : '',
      ].filter(Boolean).join(' ');
  return {
    subjectType,
    responsePerspective,
    instruction: [
      subjectContextInstruction,
      personaInstruction || identityInstruction,
      `Invite questions about ${atlas.name}, while still answering broader questions when asked.`,
    ].filter(Boolean).join(' ').trim(),
  };
}

@Component({
  selector: 'app-talking-card-conversation',
  imports: [FormsModule, VoiceFluidVisualComponent, BackdropDismissDirective],
  templateUrl: './talking-card-conversation.html',
  styleUrl: './talking-card-conversation.css',
})
export class TalkingCardConversationComponent implements OnInit, OnDestroy {
  private readonly atlasService = inject(AtlasService);
  private readonly chatService = inject(ChatService);
  private readonly authService = inject(AuthService);
  private voiceConversation: VoiceConversation | null = null;
  private threadId: string | null = null;
  private voiceMeterFrame: number | null = null;
  private voiceMeterLastSampleAt = 0;
  private voiceAttempt = 0;
  private voiceActivityActive = false;
  private finishingConversation = false;
  private recapOffered = false;
  private destroyed = false;

  readonly atlasId = input.required<string>();
  readonly boardId = input('');
  readonly boardTitle = input('');
  readonly cardId = input('');
  readonly cardTitle = input('Conversational guide');
  readonly cardSubtitle = input('');
  readonly imageUrl = input('');
  readonly openingMessage = input('Hi! What would you like to know?');
  readonly surface = input<'board' | 'live'>('board');
  readonly closed = output<void>();
  readonly activity = output<'message' | 'voice_start' | 'voice_end'>();

  readonly atlas = signal<AtlasItem | null>(null);
  readonly loadingAtlas = signal(true);
  readonly unavailable = signal(false);
  readonly messages = signal<ConversationMessage[]>([]);
  readonly recapTranscript = signal<VoiceSummaryTranscriptItem[]>([]);
  readonly draft = signal('');
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly voiceStatus = signal<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  readonly conversationMode = signal<ConversationMode>('voice');
  readonly voiceMode = signal<VoiceMode>(null);
  readonly voiceMuted = signal(false);
  readonly voiceInputLevel = signal(0);
  readonly voiceOutputLevel = signal(0);
  readonly voiceEnergyLevel = signal(0);
  readonly conversationStage = signal<ConversationStage>('conversation');
  readonly completionReason = signal<ConversationCompletionReason>('ended');
  readonly recapEmail = signal('');
  readonly recapSending = signal(false);
  readonly recapError = signal<string | null>(null);
  readonly recapSentTo = signal('');
  readonly recapAnswerCardUrl = signal<string | null>(null);
  readonly recapBoardUrl = signal<string | null>(null);
  readonly voiceConversationId = signal<string | null>(null);
  readonly isSignedIn = this.authService.isAuthenticated;
  readonly avatarName = computed(() => this.atlas()?.chat_guide?.name?.trim() || this.cardTitle());
  readonly avatarImage = computed(() => this.atlas()?.chat_guide?.image_url?.trim() || this.imageUrl());
  readonly voiceVisualGlow = computed(() => `${18 + this.voiceEnergyLevel() * 30}px`);
  readonly voiceStateLabel = computed(() => {
    if (this.voiceStatus() === 'connecting') return 'Connecting…';
    if (this.voiceStatus() === 'error') return 'Voice needs attention';
    if (this.voiceStatus() !== 'connected') return 'Voice conversation';
    return this.voiceMode() === 'speaking' ? `${this.avatarName()} is speaking` : 'Listening';
  });
  readonly voiceStateSubtitle = computed(() => {
    if (this.voiceStatus() === 'connecting') return 'Preparing the microphone and voice';
    if (this.voiceStatus() === 'error') return 'Try again or switch to text';
    if (this.voiceStatus() !== 'connected') return 'Start a live conversation';
    if (this.voiceMuted()) return 'Your microphone is muted';
    return this.voiceMode() === 'speaking' ? 'The avatar is answering you' : 'Go ahead—ask your question';
  });
  readonly recapPreview = computed(() => {
    const firstQuestion = meaningfulTalkingCardTranscript(this.recapTranscript())
      .find((item) => item.role === 'user')?.text;
    if (!firstQuestion) {
      return `A concise summary and transcript from your conversation with ${this.avatarName()}.`;
    }
    const compact = firstQuestion.length > 132
      ? `${firstQuestion.slice(0, 129).trim()}…`
      : firstQuestion;
    return `Your recap will include the conversation that began with “${compact}”`;
  });

  async ngOnInit(): Promise<void> {
    const opening = this.openingMessage().trim();
    if (opening) this.messages.set([{ id: this.id(), role: 'agent', text: opening }]);
    const atlas = await this.atlasService.getAccessibleAtlasById(this.atlasId());
    this.atlas.set(atlas);
    this.unavailable.set(!atlas);
    this.loadingAtlas.set(false);
    if (atlas && typeof window !== 'undefined' && this.conversationMode() === 'voice') {
      await this.startVoice();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    void this.endVoice();
  }

  async send(): Promise<void> {
    const question = this.draft().trim();
    const atlas = this.atlas();
    if (!question || !atlas || this.submitting()) return;
    this.draft.set('');
    this.errorMessage.set(null);
    this.appendMessage('user', question, false, false);
    this.submitting.set(true);
    try {
      const response = this.atlasService.canAdminAtlas(atlas)
        ? await this.chatService.askScoped(question, atlas.id, this.threadId)
        : await this.chatService.askPublic(question, atlas.id, {
            threadId: this.threadId,
            anonymousVisitorId: this.anonymousVisitorId(),
            answerMode: 'wiki',
          });
      if (!response?.answer) {
        throw new Error(this.chatService.submitError() || 'The avatar could not answer right now.');
      }
      this.threadId = response.threadId ?? this.threadId;
      this.appendMessage('agent', response.answer, true, false);
      this.activity.emit('message');
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'The avatar could not answer right now.');
    } finally {
      this.submitting.set(false);
    }
  }

  async setConversationMode(mode: ConversationMode): Promise<void> {
    if (this.conversationStage() !== 'conversation') return;
    if (this.conversationMode() === mode) {
      if (mode === 'voice' && this.voiceStatus() !== 'connected' && this.voiceStatus() !== 'connecting') {
        await this.startVoice();
      }
      return;
    }
    this.conversationMode.set(mode);
    this.errorMessage.set(null);
    if (mode === 'text') {
      await this.endVoice();
    } else {
      await this.startVoice();
    }
  }

  submitVoiceText(): void {
    const question = this.draft().trim();
    const conversation = this.voiceConversation;
    if (!question || !conversation || this.voiceStatus() !== 'connected') return;
    this.draft.set('');
    this.appendMessage('user', question);
    conversation.sendUserMessage(question);
    this.activity.emit('message');
  }

  async startVoice(): Promise<void> {
    const atlas = this.atlas();
    if (!atlas || this.conversationStage() !== 'conversation'
      || this.voiceStatus() === 'connecting' || this.voiceStatus() === 'connected') return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.voiceStatus.set('error');
      this.errorMessage.set('This browser does not support microphone conversations. You can still type below.');
      return;
    }
    this.voiceStatus.set('connecting');
    this.voiceMode.set(null);
    this.errorMessage.set(null);
    const attempt = ++this.voiceAttempt;
    try {
      const [session, client] = await Promise.all([
        this.chatService.createElevenLabsVoiceSession({
          atlasId: atlas.id,
          atlasName: atlas.name,
          anonymousVisitorId: this.anonymousVisitorId(),
          connectionType: 'websocket',
        }),
        import('@elevenlabs/client'),
      ]);
      if (!session) throw new Error('Voice service is unavailable.');
      const connection = session.signedUrl
        ? { signedUrl: session.signedUrl, connectionType: 'websocket' as const }
        : session.conversationToken
          ? { conversationToken: session.conversationToken, connectionType: 'webrtc' as const }
          : null;
      if (!connection) throw new Error('Voice service did not return a conversation credential.');

      const overrides = {
        ...(session.firstMessageOverrideEnabled
          ? { agent: { firstMessage: this.openingMessage().trim() } }
          : {}),
        ...(session.voiceOverrideEnabled && session.voiceId
          ? { tts: { voiceId: session.voiceId } }
          : {}),
      };
      const voiceContext = buildTalkingCardVoiceContext(atlas, session.dynamicVariables ?? {});
      const conversation = await client.Conversation.startSession({
        ...connection,
        userId: session.userId,
        dynamicVariables: {
          ...(session.dynamicVariables ?? {}),
          requested_intro_greeting: this.openingMessage().trim(),
          current_city: voiceContext.subjectType === 'city' ? atlas.name : '',
          current_city_country: '',
          current_wiki_subject: atlas.name,
          current_wiki_subject_type: voiceContext.subjectType,
          current_wiki_response_perspective: voiceContext.responsePerspective,
          current_living_wiki: `LivingWiki, ${atlas.name}`,
          wiki_context_instruction: voiceContext.instruction,
          // The shared agent historically read this variable. Keep it aligned
          // with the subject-aware Wiki instruction during the migration.
          city_context_instruction: voiceContext.instruction,
        },
        ...(Object.keys(overrides).length ? { overrides } : {}),
        onConnect: ({ conversationId }) => {
          if (attempt !== this.voiceAttempt || this.conversationMode() !== 'voice') return;
          this.voiceConversationId.set(conversationId || null);
          this.voiceActivityActive = true;
          this.voiceStatus.set('connected');
          this.activity.emit('voice_start');
        },
        onDisconnect: (details) => {
          this.handleVoiceDisconnect(attempt, details);
        },
        onStatusChange: ({ status }) => {
          if (attempt !== this.voiceAttempt) return;
          if (status === 'connecting' || status === 'connected') this.voiceStatus.set(status);
        },
        onModeChange: ({ mode }) => {
          if (attempt !== this.voiceAttempt) return;
          this.voiceMode.set(mode);
        },
        onMessage: ({ role, message }) => {
          if (attempt !== this.voiceAttempt) return;
          const text = String(message ?? '').trim();
          if (!text) return;
          const messageRole = role === 'agent' ? 'agent' : 'user';
          const appended = this.appendMessage(messageRole, text);
          if (messageRole === 'user' && appended) this.activity.emit('message');
        },
        onError: (message) => {
          this.handleVoiceError(attempt, String(message || 'The voice conversation was interrupted.'));
        },
      });
      if (attempt !== this.voiceAttempt || this.conversationMode() !== 'voice') {
        try { await conversation.endSession(); } catch { /* cancelled while connecting */ }
        return;
      }
      this.voiceConversation = conversation;
      this.startVoiceMeter(conversation);
      try {
        conversation.sendContextualUpdate(voiceContext.instruction, { contextId: `talking-card-identity-${atlas.id}` });
      } catch {
        // Dynamic variables already carry the same instruction. Contextual
        // update is an additional guard for older shared-agent prompts.
      }
    } catch (error) {
      if (attempt !== this.voiceAttempt) return;
      this.voiceConversation = null;
      this.stopVoiceMeter();
      this.voiceStatus.set('error');
      this.voiceMode.set(null);
      this.errorMessage.set(error instanceof Error ? error.message : 'Voice mode could not start.');
    }
  }

  toggleMute(): void {
    if (!this.voiceConversation || this.voiceStatus() !== 'connected') return;
    const muted = !this.voiceMuted();
    this.voiceConversation.setMicMuted(muted);
    this.voiceMuted.set(muted);
  }

  async endVoice(): Promise<void> {
    this.voiceAttempt += 1;
    const conversation = this.voiceConversation;
    this.voiceConversation = null;
    this.stopVoiceMeter();
    this.voiceStatus.set('idle');
    this.voiceMode.set(null);
    this.voiceMuted.set(false);
    if (conversation) {
      try { await conversation.endSession(); } catch { /* already disconnected */ }
    }
    this.emitVoiceEndIfActive();
  }

  close(): void {
    if (this.recapSending()) return;
    if (this.conversationStage() !== 'conversation') {
      this.dismissRecap();
      return;
    }
    void this.finishConversation('closed');
  }

  async finishConversation(reason: ConversationCompletionReason = 'ended'): Promise<void> {
    if (this.conversationStage() !== 'conversation' || this.finishingConversation) return;
    this.finishingConversation = true;
    try {
      await this.endVoice();
      if (!this.offerRecap(reason) && !this.destroyed) {
        this.closed.emit();
      }
    } finally {
      this.finishingConversation = false;
    }
  }

  dismissRecap(): void {
    if (this.recapSending()) return;
    this.closed.emit();
  }

  onRecapEmailInput(event: Event): void {
    this.recapEmail.set((event.target as HTMLInputElement).value);
    this.recapError.set(null);
  }

  async sendRecap(event: Event): Promise<void> {
    event.preventDefault();
    if (this.recapSending() || this.conversationStage() !== 'recap') return;
    const email = this.recapEmail().trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.recapError.set('Enter a valid email address.');
      return;
    }
    const transcript = meaningfulTalkingCardTranscript(this.recapTranscript());
    if (!shouldOfferTalkingCardRecap(transcript)) {
      this.recapError.set('There is not enough conversation to create a recap yet.');
      return;
    }

    this.recapSending.set(true);
    this.recapError.set(null);
    try {
      const atlas = this.atlas();
      const result = await this.chatService.sendVoiceConversationSummary({
        atlasId: atlas?.id ?? this.atlasId(),
        atlasName: atlas?.name ?? this.avatarName(),
        atlasSlug: atlas?.slug ?? null,
        anonymousVisitorId: this.isSignedIn() ? null : this.anonymousVisitorId(),
        recipientEmail: email,
        recipientName: this.authService.displayName() || null,
        transcript,
        conversationId: this.voiceConversationId(),
        createAnswerCard: true,
        source: 'talking_card',
        boardId: this.boardId(),
        cardId: this.cardId(),
        completionReason: this.completionReason(),
      });
      if (!result?.sent) throw new Error('The recap could not be sent.');
      this.recapSentTo.set(result.recipientEmail);
      this.recapAnswerCardUrl.set(result.answerCardUrl ?? null);
      this.recapBoardUrl.set(result.continueChatUrl ?? null);
      this.conversationStage.set('sent');
    } catch (error) {
      this.recapError.set(this.authService.toFriendlyError(error));
    } finally {
      this.recapSending.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  private id(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `talk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private appendMessage(
    role: ConversationMessage['role'],
    text: string,
    preserveFormatting = false,
    capVisible = true,
  ): boolean {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return false;
    const displayText = preserveFormatting ? text.trim() : normalized;
    let appended = false;
    this.messages.update((messages) => {
      const last = messages[messages.length - 1];
      if (last?.role === role && last.text.replace(/\s+/g, ' ').trim() === normalized) return messages;
      appended = true;
      const retained = capVisible ? messages.slice(-19) : messages;
      return [...retained, { id: this.id(), role, text: displayText }];
    });
    if (appended) {
      this.recapTranscript.update((transcript) => [
        ...transcript.slice(-(TALKING_CARD_RECAP_MAX_MESSAGES - 1)),
        { role, text: normalized.slice(0, 1000) },
      ]);
    }
    return appended;
  }

  private offerRecap(reason: ConversationCompletionReason): boolean {
    if (this.destroyed || this.recapOffered || !shouldOfferTalkingCardRecap(this.recapTranscript())) {
      return false;
    }
    this.recapOffered = true;
    this.completionReason.set(reason);
    this.recapEmail.set(this.authService.email().trim());
    this.recapError.set(null);
    this.conversationStage.set('recap');
    if (typeof document !== 'undefined') {
      queueMicrotask(() => document.getElementById('talking-card-recap-email')?.focus());
    }
    return true;
  }

  private emitVoiceEndIfActive(): void {
    if (!this.voiceActivityActive) return;
    this.voiceActivityActive = false;
    this.activity.emit('voice_end');
  }

  private startVoiceMeter(conversation: VoiceConversation): void {
    this.stopVoiceMeter();
    if (typeof window === 'undefined') return;
    const tick = (timestamp: number) => {
      if (this.voiceConversation !== conversation || this.voiceStatus() === 'idle') {
        this.stopVoiceMeter();
        return;
      }
      // Volume analysis is visual feedback, not audio processing. Sampling it at
      // 12.5fps avoids driving the entire board view through Angular change
      // detection for every browser animation frame and every SDK audio packet.
      if (timestamp - this.voiceMeterLastSampleAt >= 80) {
        const rawInput = this.voiceMuted() ? 0 : this.safeVoiceVolume(() => conversation.getInputVolume());
        const rawOutput = this.safeVoiceVolume(() => conversation.getOutputVolume());
        const input = this.smoothVoiceLevel(this.voiceInputLevel(), rawInput, .42);
        const output = this.smoothVoiceLevel(this.voiceOutputLevel(), rawOutput, .38);
        const active = this.voiceMode() === 'speaking' ? output : Math.max(input, output * .36);
        this.setVoiceLevel(this.voiceInputLevel, input);
        this.setVoiceLevel(this.voiceOutputLevel, output);
        this.setVoiceLevel(this.voiceEnergyLevel, this.smoothVoiceLevel(this.voiceEnergyLevel(), active, .46));
        this.voiceMeterLastSampleAt = timestamp;
      }
      this.voiceMeterFrame = window.requestAnimationFrame(tick);
    };
    this.voiceMeterFrame = window.requestAnimationFrame(tick);
  }

  private stopVoiceMeter(): void {
    if (this.voiceMeterFrame !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.voiceMeterFrame);
    }
    this.voiceMeterFrame = null;
    this.voiceMeterLastSampleAt = 0;
    this.voiceInputLevel.set(0);
    this.voiceOutputLevel.set(0);
    this.voiceEnergyLevel.set(0);
  }

  private safeVoiceVolume(read: () => number): number {
    try { return this.clampVoiceLevel(read()); } catch { return 0; }
  }

  private clampVoiceLevel(value: number): number {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }

  private smoothVoiceLevel(current: number, next: number, amount: number): number {
    return current + (next - current) * amount;
  }

  private setVoiceLevel(target: { set(value: number): void; (): number }, value: number): void {
    if (Math.abs(target() - value) >= .01) target.set(value);
  }

  private handleVoiceError(attempt: number, message: string): void {
    if (attempt !== this.voiceAttempt) return;
    const conversation = this.voiceConversation;
    this.voiceConversation = null;
    // Invalidate every callback owned by this session before teardown. The SDK
    // error callback does not itself guarantee that the microphone, WebSocket,
    // AudioContext, worklet, and hidden audio element are released.
    this.voiceAttempt += 1;
    this.stopVoiceMeter();
    this.voiceStatus.set('error');
    this.voiceMode.set(null);
    this.voiceMuted.set(false);
    this.errorMessage.set(message);
    this.emitVoiceEndIfActive();
    this.offerRecap('interrupted');
    if (conversation) void conversation.endSession().catch(() => undefined);
  }

  private handleVoiceDisconnect(attempt: number, details: DisconnectionDetails): void {
    if (attempt !== this.voiceAttempt) return;
    this.voiceAttempt += 1;
    this.voiceConversation = null;
    this.stopVoiceMeter();
    this.voiceStatus.set(details.reason === 'error' ? 'error' : 'idle');
    this.voiceMode.set(null);
    this.voiceMuted.set(false);
    this.emitVoiceEndIfActive();
    if (details.reason === 'error') {
      this.errorMessage.set(details.message || details.closeReason || 'The voice conversation was interrupted.');
    }
    if (details.reason !== 'user') {
      this.offerRecap(details.reason === 'error' ? 'interrupted' : 'ended');
    }
  }

  private anonymousVisitorId(): string | null {
    if (typeof window === 'undefined') return null;
    const key = 'livingwiki:talking-card-visitor';
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const value = this.id();
    window.localStorage.setItem(key, value);
    return value;
  }
}
