import { Component, computed, effect, HostListener, inject, input, OnDestroy, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BackdropDismissDirective } from '../backdrop-dismiss.directive';
import type { AtlasItem, AtlasSpeechVoiceConfig } from '../atlas.models';
import { AtlasService, type AtlasSpeechAudioResponse } from '../atlas.service';
import { DocumentsService } from '../documents.service';
import {
  STACK_NARRATOR_VOICES,
  stackNarratorVoiceById,
  type StackNarratorVoice,
} from '../boards/stack-voice';
import type { TalkingCardEditorResult } from '../boards/talking-card';
import { TalkingCardDraftStore, type TalkingCardDraftRecord } from './talking-card-draft.store';

type EditorMode = 'existing' | 'new';
type VoiceChoice = 'default' | 'catalog' | 'saved';

@Component({
  selector: 'app-talking-card-editor',
  imports: [FormsModule, BackdropDismissDirective],
  templateUrl: './talking-card-editor.html',
  styleUrl: './talking-card-editor.css',
})
export class TalkingCardEditorComponent implements OnDestroy, OnInit {
  private readonly atlasService = inject(AtlasService);
  private readonly documentsService = inject(DocumentsService);
  private readonly draftStore = inject(TalkingCardDraftStore);
  private readonly createdAtlasId = signal('');
  private previewAudio: HTMLAudioElement | null = null;
  private previewRun = 0;
  private imageProcessingRun = 0;
  private readonly previewUrlCache = new Map<string, string>();
  private draftSaveChain = Promise.resolve();
  private publicAvatarLoadPromise: Promise<void> | null = null;

  readonly boardId = input('');
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
  readonly imageProcessing = signal(false);
  readonly uploadedImageUrl = signal('');
  readonly documentFiles = signal<File[]>([]);
  readonly saving = signal(false);
  readonly saveStage = signal('');
  readonly errorMessage = signal<string | null>(null);
  readonly publicAtlases = signal<AtlasItem[]>([]);
  readonly publicAtlasesLoading = signal(false);
  readonly publicAtlasesLoaded = signal(false);
  readonly draftReady = signal(false);
  readonly draftStatus = signal<'restored' | 'saved' | null>(null);

  readonly ownedAtlases = computed(() => this.atlasService.atlases()
    .filter((atlas) => this.atlasService.canAdminAtlas(atlas)));
  readonly availableAtlases = computed(() => {
    const byId = new Map<string, AtlasItem>();
    for (const atlas of [...this.ownedAtlases(), ...this.publicAtlases()]) byId.set(atlas.id, atlas);
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
  });
  readonly selectedAtlas = computed<AtlasItem | null>(() =>
    this.availableAtlases().find((atlas) => atlas.id === this.selectedAtlasId()) ?? null,
  );
  readonly catalogVoiceCount = STACK_NARRATOR_VOICES.length;
  readonly selectedCatalogVoice = computed(() => stackNarratorVoiceById(this.catalogVoiceId()));
  readonly displayedVoices = computed(() => {
    const query = this.voiceSearch().trim().toLocaleLowerCase();
    if (!query) return STACK_NARRATOR_VOICES;
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
  readonly selectedAtlasEditable = computed(() => {
    const atlas = this.selectedAtlas();
    return !!atlas && this.atlasService.canAdminAtlas(atlas);
  });
  readonly canSave = computed(() => {
    if (this.saving() || this.imageProcessing() || this.voiceConfigLoading()) return false;
    if (!this.openingMessage().trim()) return false;
    if (this.mode() === 'existing') {
      return !!this.selectedAtlas() && (!this.needsPublication() || this.publishAvatar());
    }
    return !!this.name().trim() && !!this.personaPrompt().trim();
  });

  constructor() {
    effect((onCleanup) => {
      if (!this.draftReady()) return;
      const record = this.currentDraftRecord();
      if (!record) return;
      const timeout = setTimeout(() => {
        void this.queueDraftSave(record);
      }, 300);
      onCleanup(() => clearTimeout(timeout));
    });
  }

  async ngOnInit(): Promise<void> {
    await this.restoreDraft();
  }

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
    } else if (this.selectedAtlasId() && this.selectedAtlasEditable()) {
      void this.loadExistingVoiceConfig(this.selectedAtlasId());
    }
  }

  onAvatarSearchChange(value: string): void {
    this.avatarSearch.set(value);
    if (value.trim()) void this.loadPublicAvatars();
  }

  async onImageSelected(event: Event): Promise<void> {
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
    const run = ++this.imageProcessingRun;
    this.imageProcessing.set(true);
    this.errorMessage.set(null);
    try {
      const optimized = await this.optimizeAvatarImage(file);
      if (run !== this.imageProcessingRun) return;
      const previous = this.imagePreviewUrl();
      if (previous.startsWith('blob:')) URL.revokeObjectURL(previous);
      this.imageFile.set(optimized);
      this.uploadedImageUrl.set('');
      this.imagePreviewUrl.set(URL.createObjectURL(optimized));
    } catch (error) {
      if (run !== this.imageProcessingRun) return;
      this.errorMessage.set(error instanceof Error && error.message.trim()
        ? error.message
        : 'That avatar image could not be prepared.');
      (event.target as HTMLInputElement).value = '';
    } finally {
      if (run === this.imageProcessingRun) this.imageProcessing.set(false);
    }
  }

  onDocumentsSelected(event: Event): void {
    const files = Array.from((event.target as HTMLInputElement).files ?? []).slice(0, 10);
    this.documentFiles.set(files);
  }

  isEditableAtlas(atlas: AtlasItem): boolean {
    return this.atlasService.canAdminAtlas(atlas);
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
    if (this.atlasService.canAdminAtlas(atlas)) {
      void this.loadExistingVoiceConfig(atlasId);
    } else {
      this.initialVoiceConfig.set(null);
      this.voiceChoice.set('default');
      this.catalogVoiceId.set('');
      this.voiceConfigLoading.set(false);
    }
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

  async close(): Promise<void> {
    if (!this.saving()) {
      this.stopVoicePreview();
      await this.persistDraftNow();
      this.closed.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    void this.close();
  }

  ngOnDestroy(): void {
    this.imageProcessingRun += 1;
    this.stopVoicePreview();
    const preview = this.imagePreviewUrl();
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.saveStage.set('Preparing avatar…');
    this.errorMessage.set(null);
    try {
      let atlas: AtlasItem | null = this.selectedAtlas();
      let atlasId = atlas?.id ?? '';
      let title = atlas?.chat_guide?.name?.trim() || atlas?.name || this.name().trim();
      let subtitle = atlas?.chat_guide?.label?.trim() || atlas?.description || this.role().trim();
      let imageUrl = atlas?.chat_guide?.image_url?.trim() || atlas?.logo_url?.trim() || atlas?.hero_url?.trim() || '';

      if (this.mode() === 'new') {
        const resumedAtlasId = this.createdAtlasId();
        const createdNow = !resumedAtlasId;
        if (createdNow) {
          this.saveStage.set('Creating avatar…');
          atlasId = await this.atlasService.createTalkingCardAtlas({
            name: this.name(),
            role: this.role(),
            personaPrompt: this.personaPrompt(),
            isPublic: false,
          }) ?? '';
        } else {
          atlasId = resumedAtlasId;
        }
        if (!atlasId) throw new Error('The conversational avatar could not be created.');
        this.createdAtlasId.set(atlasId);
        if (createdNow) await this.persistDraftNow();
        title = this.name().trim();
        subtitle = this.role().trim() || 'Conversational guide';

        const imageFile = this.imageFile();
        imageUrl = this.uploadedImageUrl();
        if (imageFile || imageUrl) {
          if (!imageUrl) {
            this.saveStage.set('Uploading optimized portrait…');
            if (!imageFile) throw new Error('Choose the avatar portrait again before continuing.');
            imageUrl = await this.atlasService.uploadTalkingCardAvatarImage(atlasId, imageFile);
            this.uploadedImageUrl.set(imageUrl);
            await this.persistDraftNow();
          }
          this.saveStage.set('Saving portrait…');
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
          this.saveStage.set('Saving conversation voice…');
          await this.atlasService.selectAtlasCatalogVoice(atlasId, this.catalogVoiceId());
        }
        if (this.documentFiles().length) {
          this.saveStage.set('Uploading knowledge documents…');
          await this.documentsService.uploadFiles(this.documentFiles(), { atlasId });
          if (this.documentsService.uploadError()) {
            throw new Error(this.documentsService.uploadError() || 'One or more knowledge files could not be uploaded.');
          }
        }
        if (this.publicBoard()) {
          this.saveStage.set('Publishing avatar…');
          await this.atlasService.updateAtlas(atlasId, { is_public: true });
        }
      } else if (atlas) {
        if (this.needsPublication() && this.publishAvatar()) {
          await this.atlasService.updateAtlas(atlas.id, { is_public: true });
        }
        if (this.atlasService.canAdminAtlas(atlas)) {
          await this.saveExistingVoiceIfChanged(atlas.id);
        }
      }

      this.saveStage.set('Adding Talking Card…');
      this.draftReady.set(false);
      await this.draftStore.delete(this.draftStorageKey());
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
      this.errorMessage.set(this.saveErrorMessage(error));
    } finally {
      this.saveStage.set('');
      this.saving.set(false);
    }
  }

  private async loadPublicAvatars(): Promise<void> {
    if (this.publicAtlasesLoaded()) return;
    if (this.publicAvatarLoadPromise) return this.publicAvatarLoadPromise;
    this.publicAtlasesLoading.set(true);
    this.publicAvatarLoadPromise = (async () => {
      try {
        this.publicAtlases.set(await this.atlasService.listPublicAtlases(true));
      } catch {
        this.publicAtlases.set([]);
      } finally {
        this.publicAtlasesLoaded.set(true);
        this.publicAtlasesLoading.set(false);
        this.publicAvatarLoadPromise = null;
      }
    })();
    return this.publicAvatarLoadPromise;
  }

  private async restoreDraft(): Promise<void> {
    const key = this.draftStorageKey();
    if (!key) {
      this.draftReady.set(true);
      return;
    }
    const record = await this.draftStore.load(key);
    if (record) {
      this.mode.set(record.mode);
      this.selectedAtlasId.set(record.selectedAtlasId);
      this.createdAtlasId.set(record.createdAtlasId);
      this.name.set(record.name);
      this.role.set(record.role);
      this.personaPrompt.set(record.personaPrompt);
      this.openingMessage.set(record.openingMessage);
      this.ctaLabel.set(record.ctaLabel);
      this.placement.set(record.placement);
      this.catalogVoiceId.set(record.catalogVoiceId);
      this.voiceChoice.set(record.voiceChoice);
      this.publishAvatar.set(record.publishAvatar);
      this.imageFile.set(record.imageFile);
      this.uploadedImageUrl.set(record.uploadedImageUrl);
      this.documentFiles.set(record.documentFiles);
      if (record.imageFile) {
        const previous = this.imagePreviewUrl();
        if (previous.startsWith('blob:')) URL.revokeObjectURL(previous);
        this.imagePreviewUrl.set(URL.createObjectURL(record.imageFile));
      }
      const selected = this.ownedAtlases().find((atlas) => atlas.id === record.selectedAtlasId);
      if (record.mode === 'existing' && selected) {
        await this.loadExistingVoiceConfig(selected.id);
        this.voiceChoice.set(record.voiceChoice);
        this.catalogVoiceId.set(record.catalogVoiceId);
      }
      this.draftStatus.set('restored');
    }
    this.draftReady.set(true);
  }

  private currentDraftRecord(): TalkingCardDraftRecord | null {
    const key = this.draftStorageKey();
    if (!key) return null;
    return {
      key,
      version: 1,
      boardId: this.boardId().trim(),
      mode: this.mode(),
      selectedAtlasId: this.selectedAtlasId(),
      createdAtlasId: this.createdAtlasId(),
      name: this.name(),
      role: this.role(),
      personaPrompt: this.personaPrompt(),
      openingMessage: this.openingMessage(),
      ctaLabel: this.ctaLabel(),
      placement: this.placement(),
      catalogVoiceId: this.catalogVoiceId(),
      voiceChoice: this.voiceChoice(),
      publishAvatar: this.publishAvatar(),
      imageFile: this.imageFile(),
      uploadedImageUrl: this.uploadedImageUrl(),
      documentFiles: this.documentFiles(),
      updatedAt: new Date().toISOString(),
    };
  }

  private draftStorageKey(): string {
    const boardId = this.boardId().trim();
    if (boardId) return `board:${boardId}`;
    const title = this.boardTitle().trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-');
    return title ? `board-title:${title}` : '';
  }

  private queueDraftSave(record: TalkingCardDraftRecord): Promise<void> {
    this.draftSaveChain = this.draftSaveChain
      .catch(() => undefined)
      .then(async () => {
        await this.draftStore.save(record);
        if (this.draftReady()) this.draftStatus.set('saved');
      });
    return this.draftSaveChain;
  }

  private async persistDraftNow(): Promise<void> {
    if (!this.draftReady()) return;
    const record = this.currentDraftRecord();
    if (!record) return;
    await this.queueDraftSave(record);
  }

  private saveErrorMessage(error: unknown): string {
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : '';
    if (code === 'storage/unauthorized') {
      return 'Your draft is safe. The avatar image could not be uploaded because Storage denied access. Please try again after refreshing.';
    }
    return error instanceof Error && error.message.trim()
      ? error.message
      : 'The Talking Card could not be saved.';
  }

  private async optimizeAvatarImage(file: File): Promise<File> {
    const maxSide = 1200;
    const dimensions = await this.readRasterDimensions(file);
    if (dimensions && Math.max(dimensions.width, dimensions.height) <= maxSide && file.size <= 2 * 1024 * 1024) {
      return file;
    }
    if (typeof createImageBitmap !== 'function') {
      if (file.size <= 2 * 1024 * 1024) return file;
      throw new Error('This large portrait cannot be optimized in this browser. Choose an image under 2 MB.');
    }

    const target = dimensions
      ? this.scaledImageDimensions(dimensions.width, dimensions.height, maxSide)
      : null;
    let bitmap: ImageBitmap;
    try {
      bitmap = target
        ? await createImageBitmap(file, {
            imageOrientation: 'from-image',
            resizeWidth: target.width,
            resizeHeight: target.height,
            resizeQuality: 'high',
          })
        : await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      throw new Error('That portrait could not be decoded. Try a JPEG, PNG, or WebP image.');
    }

    try {
      const output = target ?? this.scaledImageDimensions(bitmap.width, bitmap.height, maxSide);
      const canvas = document.createElement('canvas');
      canvas.width = output.width;
      canvas.height = output.height;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('This browser could not prepare the portrait.');
      context.drawImage(bitmap, 0, 0, output.width, output.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84));
      if (!blob) throw new Error('This browser could not compress the portrait.');
      const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'avatar';
      return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
    } finally {
      bitmap.close();
    }
  }

  private scaledImageDimensions(width: number, height: number, maxSide: number): { width: number; height: number } {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  private async readRasterDimensions(file: File): Promise<{ width: number; height: number } | null> {
    const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 256 * 1024)).arrayBuffer());
    if (bytes.length >= 24
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = bytes[offset + 1];
        if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2;
          continue;
        }
        const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
        if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) break;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
          return {
            width: (bytes[offset + 7] << 8) | bytes[offset + 8],
            height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          };
        }
        offset += 2 + segmentLength;
      }
    }
    return null;
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
