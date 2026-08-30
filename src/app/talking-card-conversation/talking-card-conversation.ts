import { Component, computed, HostListener, inject, input, OnDestroy, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { ChatService } from '../chat.service';

type ConversationMessage = { id: string; role: 'user' | 'agent'; text: string };
type VoiceConversation = Awaited<ReturnType<typeof import('@elevenlabs/client').Conversation.startSession>>;

@Component({
  selector: 'app-talking-card-conversation',
  imports: [FormsModule],
  templateUrl: './talking-card-conversation.html',
  styleUrl: './talking-card-conversation.css',
})
export class TalkingCardConversationComponent implements OnInit, OnDestroy {
  private readonly atlasService = inject(AtlasService);
  private readonly chatService = inject(ChatService);
  private voiceConversation: VoiceConversation | null = null;
  private threadId: string | null = null;

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
  readonly voiceMuted = signal(false);
  readonly avatarName = computed(() => this.atlas()?.chat_guide?.name?.trim() || this.cardTitle());
  readonly avatarImage = computed(() => this.atlas()?.chat_guide?.image_url?.trim() || this.imageUrl());

  async ngOnInit(): Promise<void> {
    const opening = this.openingMessage().trim();
    if (opening) this.messages.set([{ id: this.id(), role: 'agent', text: opening }]);
    const atlas = await this.atlasService.getAccessibleAtlasById(this.atlasId());
    this.atlas.set(atlas);
    this.unavailable.set(!atlas);
    this.loadingAtlas.set(false);
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

  async startVoice(): Promise<void> {
    const atlas = this.atlas();
    if (!atlas || this.voiceStatus() === 'connecting' || this.voiceStatus() === 'connected') return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.voiceStatus.set('error');
      this.errorMessage.set('This browser does not support microphone conversations. You can still type below.');
      return;
    }
    this.voiceStatus.set('connecting');
    this.errorMessage.set(null);
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
      this.voiceConversation = await client.Conversation.startSession({
        ...connection,
        userId: session.userId,
        dynamicVariables: {
          ...(session.dynamicVariables ?? {}),
          requested_intro_greeting: this.openingMessage().trim(),
          current_wiki_subject: atlas.name,
          current_wiki_subject_type: 'person',
          current_wiki_response_perspective: 'first_person',
        },
        ...(Object.keys(overrides).length ? { overrides } : {}),
        onConnect: () => {
          this.voiceStatus.set('connected');
          this.activity.emit('voice_start');
        },
        onDisconnect: () => {
          this.voiceConversation = null;
          this.voiceStatus.set('idle');
          this.voiceMuted.set(false);
        },
        onMessage: ({ role, message }) => {
          const text = String(message ?? '').trim();
          if (!text) return;
          this.messages.update((messages) => [...messages, {
            id: this.id(),
            role: role === 'agent' ? 'agent' : 'user',
            text,
          }]);
        },
        onError: (message) => {
          this.voiceStatus.set('error');
          this.errorMessage.set(String(message || 'The voice conversation was interrupted.'));
        },
      });
    } catch (error) {
      this.voiceConversation = null;
      this.voiceStatus.set('error');
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
    const conversation = this.voiceConversation;
    this.voiceConversation = null;
    this.voiceStatus.set('idle');
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
