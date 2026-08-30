import { Component, computed, HostListener, inject, input, OnDestroy, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AtlasItem, AtlasSpeechVoiceConfig } from '../atlas.models';
import { AtlasService, type AtlasSpeechAudioResponse } from '../atlas.service';
import { DocumentsService } from '../documents.service';
import {
  RECOMMENDED_STACK_NARRATOR_VOICES,
  STACK_NARRATOR_VOICES,
  stackNarratorVoiceById,
  type StackNarratorVoice,
} from '../boards/stack-voice';
import type { TalkingCardEditorResult } from '../boards/talking-card';

type EditorMode = 'existing' | 'new';
type VoiceChoice = 'default' | 'catalog' | 'saved';

@Component({
  selector: 'app-talking-card-editor',
  imports: [FormsModule],
  templateUrl: './talking-card-editor.html',
  styleUrl: './talking-card-editor.css',
})
export class TalkingCardEditorComponent implements OnDestroy {
  private readonly atlasService = inject(AtlasService);
  private readonly documentsService = inject(DocumentsService);
  private createdAtlasId = '';
  private previewAudio: HTMLAudioElement | null = null;
  private previewRun = 0;
  private readonly previewUrlCache = new Map<string, string>();

  readonly boardTitle = input('Board');
  readonly boardVisibility = input<'private' | 'public' | 'unlisted'>('private');
  readonly closed = output<void>();
  readonly saved = output<TalkingCardEditorResult>();

  readonly mode = signal<EditorMode>('existing');
  readonly selectedAtlasId = signal('');
  readonly avatarSearch = signal('');
  readonly name = signal('');
  readonly role = signal('');
  readonly personaPrompt = signal('');
  readonly openingMessage = signal('Hi! I’m here to help. What would you like to know?');
  readonly ctaLabel = signal('Talk to me');
  readonly placement = signal<'start' | 'end'>('end');
  readonly catalogVoiceId = signal('');
  readonly voiceChoice = signal<VoiceChoice>('default');
  readonly voiceSearch = signal('');
  readonly voiceConfigLoading = signal(false);
  readonly voicePreviewLoadingKey = signal<string | null>(null);
  readonly voicePreviewPlayingKey = signal<string | null>(null);
  readonly voiceErrorMessage = signal<string | null>(null);
  readonly initialVoiceConfig = signal<AtlasSpeechVoiceConfig | null>(null);
  readonly publishAvatar = signal(false);
  readonly imageFile = signal<File | null>(null);
  readonly imagePreviewUrl = signal('');
  readonly documentFiles = signal<File[]>([]);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly availableAtlases = computed(() =>
    this.atlasService.atlases()
      .filter((atlas) => this.atlasService.canAdminAtlas(atlas))
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
  readonly selectedAtlas = computed<AtlasItem | null>(() =>
    this.availableAtlases().find((atlas) => atlas.id === this.selectedAtlasId()) ?? null,
  );
  readonly selectedCatalogVoice = computed(() => stackNarratorVoiceById(this.catalogVoiceId()));
  readonly displayedVoices = computed(() => {
    const query = this.voiceSearch().trim().toLocaleLowerCase();
    if (!query) return RECOMMENDED_STACK_NARRATOR_VOICES;
    const terms = query.split(/\s+/).filter(Boolean);
    return STACK_NARRATOR_VOICES.filter((voice) => {
      const searchable = [voice.name, voice.presentation, voice.accent, voice.style, voice.description]
        .join(' ')
        .toLocaleLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  });
  readonly savedVoiceLabel = computed(() => this.initialVoiceConfig()?.source === 'designed'
    ? this.initialVoiceConfig()?.name || 'Custom designed voice'
    : 'Current saved voice');
  readonly filteredAvailableAtlases = computed(() => {
    const query = this.avatarSearch().trim().toLocaleLowerCase();
    if (!query) return [];
    const terms = query.split(/\s+/).filter(Boolean);
    return this.availableAtlases()
      .filter((atlas) => {
        const searchable = [
          atlas.chat_guide?.name,
          atlas.chat_guide?.label,
          atlas.name,
          atlas.description,
          atlas.slug,
        ].filter(Boolean).join(' ').toLocaleLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
      .slice(0, 12);
  });
  readonly publicBoard = computed(() => this.boardVisibility() === 'public');
  readonly needsPublication = computed(() => this.publicBoard() && this.selectedAtlas()?.is_public !== true);
  readonly canSave = computed(() => {
    if (this.saving() || this.voiceConfigLoading()) return false;
    if (!this.openingMessage().trim()) return false;
    if (this.mode() === 'existing') {
      return !!this.selectedAtlas() && (!this.needsPublication() || this.publishAvatar());
    }
    return !!this.name().trim() && !!this.personaPrompt().trim();
  });

  setMode(mode: EditorMode): void {
    if (this.mode() === mode) return;
    this.stopVoicePreview();
    this.mode.set(mode);
    this.errorMessage.set(null);
    this.voiceErrorMessage.set(null);
    this.voiceSearch.set('');
    if (mode === 'new') {
      this.initialVoiceConfig.set(null);
      this.voiceChoice.set('default');
      this.catalogVoiceId.set('');
    } else if (this.selectedAtlasId()) {
      void this.loadExistingVoiceConfig(this.selectedAtlasId());
    }
  }

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.errorMessage.set('Choose an image file for the avatar.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.errorMessage.set('Avatar images must be under 10 MB.');
      return;
    }
    const previous = this.imagePreviewUrl();
    if (previous.startsWith('blob:')) URL.revokeObjectURL(previous);
    this.imageFile.set(file);
    this.imagePreviewUrl.set(URL.createObjectURL(file));
    this.errorMessage.set(null);
  }

  onDocumentsSelected(event: Event): void {
    const files = Array.from((event.target as HTMLInputElement).files ?? []).slice(0, 10);
    this.documentFiles.set(files);
  }

  selectExistingAtlas(atlasId: string): void {
    this.stopVoicePreview();
    this.selectedAtlasId.set(atlasId);
    const atlas = this.availableAtlases().find((candidate) => candidate.id === atlasId);
    if (!atlas) return;
    this.name.set(atlas.chat_guide?.name?.trim() || atlas.name);
    this.role.set(atlas.chat_guide?.label?.trim() || atlas.description || 'Conversational guide');
    this.imagePreviewUrl.set(atlas.chat_guide?.image_url?.trim() || atlas.logo_url?.trim() || atlas.hero_url?.trim() || '');
    this.publishAvatar.set(false);
    this.avatarSearch.set('');
    void this.loadExistingVoiceConfig(atlasId);
  }

  selectDefaultVoice(): void {
    this.stopVoicePreview();
    this.voiceChoice.set('default');
    this.catalogVoiceId.set('');
    this.voiceErrorMessage.set(null);
  }

  selectCatalogVoice(voice: StackNarratorVoice): void {
    this.stopVoicePreview();
    this.voiceChoice.set('catalog');
    this.catalogVoiceId.set(voice.id);
    this.voiceErrorMessage.set(null);
  }

  keepSavedVoice(): void {
    if (this.initialVoiceConfig()?.source !== 'designed') return;
    this.stopVoicePreview();
    this.voiceChoice.set('saved');
    this.catalogVoiceId.set('');
    this.voiceErrorMessage.set(null);
  }

  async toggleVoicePreview(key: string, voice?: StackNarratorVoice): Promise<void> {
    if (typeof Audio === 'undefined') return;
    if (this.voicePreviewPlayingKey() === key || this.voicePreviewLoadingKey() === key) {
      this.stopVoicePreview();
      return;
    }
    this.stopVoicePreview();
    const run = ++this.previewRun;
    this.voicePreviewLoadingKey.set(key);
    this.voiceErrorMessage.set(null);
    try {
      const cacheKey = key === 'saved' ? `saved:${this.selectedAtlasId()}` : key;
      const cached = this.previewUrlCache.get(cacheKey);
      let url = cached ?? '';
      if (!url) {
        const atlasId = key === 'saved' ? this.selectedAtlasId() : '';
        const result = await this.atlasService.previewAtlasSpeechVoice(
          atlasId,
          voice?.sampleText || this.voicePreviewScript(),
          voice?.id ?? null,
        );
        if (run !== this.previewRun) return;
        url = this.voiceAudioUrl(result) ?? '';
        if (!url) throw new Error('No preview audio was returned.');
        this.previewUrlCache.set(cacheKey, url);
      }
      if (run !== this.previewRun) return;
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.onended = () => {
        if (this.previewAudio === audio) this.stopVoicePreview();
      };
      audio.onerror = () => {
        if (this.previewAudio !== audio) return;
        this.stopVoicePreview();
        this.voiceErrorMessage.set('That voice preview could not be played.');
      };
      this.previewAudio = audio;
      await audio.play();
      if (run === this.previewRun && this.previewAudio === audio) {
        this.voicePreviewPlayingKey.set(key);
      }
    } catch (error) {
      if (run === this.previewRun) {
        this.stopVoicePreview();
        this.voiceErrorMessage.set(error instanceof Error && error.message.trim()
          ? error.message
          : 'That voice preview could not be played.');
      }
    } finally {
      if (run === this.previewRun) this.voicePreviewLoadingKey.set(null);
    }
  }

  close(): void {
    if (!this.saving()) {
      this.stopVoicePreview();
      this.closed.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  ngOnDestroy(): void {
    this.stopVoicePreview();
    const preview = this.imagePreviewUrl();
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      let atlas: AtlasItem | null = this.selectedAtlas();
      let atlasId = atlas?.id ?? '';
      let title = atlas?.chat_guide?.name?.trim() || atlas?.name || this.name().trim();
      let subtitle = atlas?.chat_guide?.label?.trim() || atlas?.description || this.role().trim();
      let imageUrl = atlas?.chat_guide?.image_url?.trim() || atlas?.logo_url?.trim() || atlas?.hero_url?.trim() || '';

      if (this.mode() === 'new') {
        atlasId = this.createdAtlasId || (await this.atlasService.createTalkingCardAtlas({
          name: this.name(),
          role: this.role(),
          personaPrompt: this.personaPrompt(),
          isPublic: false,
        }) ?? '');
        if (!atlasId) throw new Error('The conversational avatar could not be created.');
        this.createdAtlasId = atlasId;
        title = this.name().trim();
        subtitle = this.role().trim() || 'Conversational guide';

        await this.atlasService.updatePersonaSettings(atlasId, {
          wikiType: 'person',
          responsePerspective: 'first_person',
          personaPrompt: this.personaPrompt(),
        });

        const imageFile = this.imageFile();
        if (imageFile) {
          imageUrl = await this.atlasService.uploadAtlasImage(atlasId, 'chat-guide', imageFile);
          await Promise.all([
            this.atlasService.updateAtlas(atlasId, { logo_url: imageUrl }),
            this.atlasService.updateChatGuideConfig(atlasId, {
              name: title,
              label: subtitle,
              image_url: imageUrl,
              banner_url: null,
            }),
          ]);
        }
        if (this.voiceChoice() === 'catalog' && this.catalogVoiceId()) {
          await this.atlasService.selectAtlasCatalogVoice(atlasId, this.catalogVoiceId());
        }
        if (this.documentFiles().length) {
          await this.documentsService.uploadFiles(this.documentFiles(), { atlasId });
          if (this.documentsService.uploadError()) {
            throw new Error(this.documentsService.uploadError() || 'One or more knowledge files could not be uploaded.');
          }
        }
        if (this.publicBoard()) {
          await this.atlasService.updateAtlas(atlasId, { is_public: true });
        }
      } else if (atlas) {
        if (this.needsPublication() && this.publishAvatar()) {
          await this.atlasService.updateAtlas(atlas.id, { is_public: true });
        }
        await this.saveExistingVoiceIfChanged(atlas.id);
      }

      this.saved.emit({
        atlasId,
        title,
        subtitle,
        imageUrl,
        openingMessage: this.openingMessage().trim().slice(0, 500),
        ctaLabel: this.ctaLabel().trim().slice(0, 48) || 'Talk to me',
        placement: this.placement(),
      });
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'The Talking Card could not be saved.');
    } finally {
      this.saving.set(false);
    }
  }

  private async loadExistingVoiceConfig(atlasId: string): Promise<void> {
    this.voiceConfigLoading.set(true);
    this.voiceErrorMessage.set(null);
    try {
      const config = await this.atlasService.getAtlasSpeechVoiceConfig(atlasId);
      if (this.selectedAtlasId() !== atlasId || this.mode() !== 'existing') return;
      this.initialVoiceConfig.set(config);
      if (config.source === 'catalog' && config.catalogVoiceId && stackNarratorVoiceById(config.catalogVoiceId)) {
        this.voiceChoice.set('catalog');
        this.catalogVoiceId.set(config.catalogVoiceId);
      } else if (config.source === 'designed') {
        this.voiceChoice.set('saved');
        this.catalogVoiceId.set('');
      } else {
        this.voiceChoice.set('default');
        this.catalogVoiceId.set('');
      }
    } catch (error) {
      if (this.selectedAtlasId() !== atlasId || this.mode() !== 'existing') return;
      this.initialVoiceConfig.set(null);
      this.voiceChoice.set('default');
      this.catalogVoiceId.set('');
      this.voiceErrorMessage.set(error instanceof Error && error.message.trim()
        ? error.message
        : 'The saved conversation voice could not be loaded.');
    } finally {
      if (this.selectedAtlasId() === atlasId) this.voiceConfigLoading.set(false);
    }
  }

  private async saveExistingVoiceIfChanged(atlasId: string): Promise<void> {
    const initial = this.initialVoiceConfig();
    if (this.voiceChoice() === 'saved') return;
    if (this.voiceChoice() === 'default') {
      if (initial?.source && initial.source !== 'default') {
        await this.atlasService.resetAtlasSpeechVoice(atlasId);
      }
      return;
    }
    const voiceId = this.catalogVoiceId();
    if (!voiceId) return;
    if (initial?.source !== 'catalog' || initial.catalogVoiceId !== voiceId) {
      await this.atlasService.selectAtlasCatalogVoice(atlasId, voiceId);
    }
  }

  private voicePreviewScript(): string {
    const subject = this.name().trim() || this.selectedAtlas()?.name || 'your LivingWiki guide';
    return `Hello, I’m ${subject}. Ask me a question and we’ll explore this story together.`;
  }

  private voiceAudioUrl(response: AtlasSpeechAudioResponse): string | null {
    if (response.audioUrl) return response.audioUrl;
    return response.audioBase64
      ? `data:${response.contentType || 'audio/mpeg'};base64,${response.audioBase64}`
      : null;
  }

  private stopVoicePreview(): void {
    this.previewRun += 1;
    if (this.previewAudio) {
      this.previewAudio.pause();
      this.previewAudio.currentTime = 0;
      this.previewAudio.onended = null;
      this.previewAudio.onerror = null;
      this.previewAudio = null;
    }
    this.voicePreviewLoadingKey.set(null);
    this.voicePreviewPlayingKey.set(null);
  }
}
