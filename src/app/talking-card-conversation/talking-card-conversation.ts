import { Component, computed, HostListener, inject, input, OnDestroy, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { ChatService } from '../chat.service';
import { VoiceFluidVisualComponent } from '../chat/voice-fluid-visual';

type ConversationMessage = { id: string; role: 'user' | 'agent'; text: string };
type VoiceConversation = Awaited<ReturnType<typeof import('@elevenlabs/client').Conversation.startSession>>;
type ConversationMode = 'voice' | 'text';
type VoiceMode = 'speaking' | 'listening' | null;

@Component({
  selector: 'app-talking-card-conversation',
  imports: [FormsModule, VoiceFluidVisualComponent],
  templateUrl: './talking-card-conversation.html',
  styleUrl: './talking-card-conversation.css',
})
export class TalkingCardConversationComponent implements OnInit, OnDestroy {
  private readonly atlasService = inject(AtlasService);
  private readonly chatService = inject(ChatService);
  private voiceConversation: VoiceConversation | null = null;
  private threadId: string | null = null;
  private voiceMeterFrame: number | null = null;
  private voiceAttempt = 0;

  readonly atlasId = input.required<string>();
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
    void this.endVoice();
  }

  async send(): Promise<void> {
    const question = this.draft().trim();
    const atlas = this.atlas();
    if (!question || !atlas || this.submitting()) return;
    this.draft.set('');
    this.errorMessage.set(null);
    this.messages.update((messages) => [...messages, { id: this.id(), role: 'user', text: question }]);
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
      this.messages.update((messages) => [...messages, { id: this.id(), role: 'agent', text: response.answer }]);
      this.activity.emit('message');
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'The avatar could not answer right now.');
    } finally {
      this.submitting.set(false);
    }
  }

  async setConversationMode(mode: ConversationMode): Promise<void> {
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
    if (!atlas || this.voiceStatus() === 'connecting' || this.voiceStatus() === 'connected') return;
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
      const subjectType = String(
        session.dynamicVariables?.['atlas_subject_type'] ?? atlas.wiki_type ?? 'person',
      ).trim() || 'person';
      const configuredPerspective = String(
        session.dynamicVariables?.['atlas_response_perspective'] ?? atlas.response_perspective ?? 'auto',
      ).trim();
      const responsePerspective = configuredPerspective === 'first_person'
        || (configuredPerspective === 'auto' && subjectType === 'person')
        ? 'first_person'
        : 'third_person';
      const conversation = await client.Conversation.startSession({
        ...connection,
        userId: session.userId,
        dynamicVariables: {
          ...(session.dynamicVariables ?? {}),
          requested_intro_greeting: this.openingMessage().trim(),
          current_wiki_subject: atlas.name,
          current_wiki_subject_type: subjectType,
          current_wiki_response_perspective: responsePerspective,
        },
        ...(Object.keys(overrides).length ? { overrides } : {}),
        onConnect: () => {
          if (attempt !== this.voiceAttempt || this.conversationMode() !== 'voice') return;
          this.voiceStatus.set('connected');
          this.activity.emit('voice_start');
        },
        onDisconnect: () => {
          if (attempt !== this.voiceAttempt) return;
          this.voiceConversation = null;
          this.stopVoiceMeter();
          this.voiceStatus.set('idle');
          this.voiceMode.set(null);
          this.voiceMuted.set(false);
        },
        onStatusChange: ({ status }) => {
          if (attempt !== this.voiceAttempt) return;
          if (status === 'connecting' || status === 'connected') this.voiceStatus.set(status);
        },
        onModeChange: ({ mode }) => {
          if (attempt !== this.voiceAttempt) return;
          this.voiceMode.set(mode);
        },
        onVadScore: ({ vadScore }) => {
          if (attempt !== this.voiceAttempt || this.voiceMuted()) return;
          this.voiceInputLevel.set(Math.max(this.voiceInputLevel(), this.clampVoiceLevel(vadScore)));
        },
        onAudio: () => {
          if (attempt !== this.voiceAttempt) return;
          this.voiceOutputLevel.set(Math.max(this.voiceOutputLevel(), 0.42));
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
          if (attempt !== this.voiceAttempt) return;
          this.stopVoiceMeter();
          this.voiceStatus.set('error');
          this.voiceMode.set(null);
          this.errorMessage.set(String(message || 'The voice conversation was interrupted.'));
        },
      });
      if (attempt !== this.voiceAttempt || this.conversationMode() !== 'voice') {
        try { await conversation.endSession(); } catch { /* cancelled while connecting */ }
        return;
      }
      this.voiceConversation = conversation;
      this.startVoiceMeter(conversation);
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
      this.activity.emit('voice_end');
    }
  }

  close(): void {
    void this.endVoice();
    this.closed.emit();
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

  private appendMessage(role: ConversationMessage['role'], text: string): boolean {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return false;
    let appended = false;
    this.messages.update((messages) => {
      const last = messages[messages.length - 1];
      if (last?.role === role && last.text.replace(/\s+/g, ' ').trim() === normalized) return messages;
      appended = true;
      return [...messages.slice(-19), { id: this.id(), role, text: normalized }];
    });
    return appended;
  }

  private startVoiceMeter(conversation: VoiceConversation): void {
    this.stopVoiceMeter();
    if (typeof window === 'undefined') return;
    const tick = () => {
      if (this.voiceConversation !== conversation || this.voiceStatus() === 'idle') {
        this.stopVoiceMeter();
        return;
      }
      const rawInput = this.voiceMuted() ? 0 : this.safeVoiceVolume(() => conversation.getInputVolume());
      const rawOutput = this.safeVoiceVolume(() => conversation.getOutputVolume());
      const input = this.smoothVoiceLevel(this.voiceInputLevel(), rawInput, .28);
      const output = this.smoothVoiceLevel(this.voiceOutputLevel(), rawOutput, .24);
      const active = this.voiceMode() === 'speaking' ? output : Math.max(input, output * .36);
      this.voiceInputLevel.set(input);
      this.voiceOutputLevel.set(output);
      this.voiceEnergyLevel.set(this.smoothVoiceLevel(this.voiceEnergyLevel(), active, .34));
      this.voiceMeterFrame = window.requestAnimationFrame(tick);
    };
    this.voiceMeterFrame = window.requestAnimationFrame(tick);
  }

  private stopVoiceMeter(): void {
    if (this.voiceMeterFrame !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.voiceMeterFrame);
    }
    this.voiceMeterFrame = null;
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
