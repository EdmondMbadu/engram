import { Component, computed, effect, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AtlasItem, AtlasResponsePerspective, AtlasSpeechVoiceConfig, AtlasSpeechVoicePreview, WikiType } from '../atlas.models';
import { AtlasService, type AtlasSpeechAudioResponse } from '../atlas.service';
import { STACK_NARRATOR_VOICES, type StackNarratorVoice } from '../boards/stack-voice';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { AccountMenuComponent } from '../account-menu/account-menu';

const PERSONA_STORAGE_LIMIT = 40000;
const PERSONA_RUNTIME_LIMIT = 8000;
const VOICE_DESCRIPTION_LIMIT = 1000;
const PREVIEW_SCRIPT_LIMIT = 1000;
const DEFAULT_VOICE_DESCRIPTION = 'A late-middle-aged historical statesman with a low, resonant voice. Formal, measured, restrained, and quietly authoritative. Crisp articulation with warm, dignified delivery.';
const PREVIEW_NAMES = ['The Statesman', 'Mount Vernon', 'The General'];
const PREVIEW_DESCRIPTORS = ['Low · measured · dignified', 'Warm · reflective · steady', 'Firm · resonant · commanding'];

type IdentityStudioStep = 'personality' | 'spoken';
type SpokenVoiceMode = 'default' | 'catalog' | 'design';
type IdentityMenu = 'wiki_type' | 'perspective';

@Component({
  selector: 'app-atlas-persona',
  imports: [FormsModule, RouterLink, ThemeToggleComponent, AccountMenuComponent],
  templateUrl: './atlas-persona.html',
})
export class AtlasPersonaComponent {
  private readonly atlasService = inject(AtlasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private loadedVoiceAtlasId: string | null = null;
  private previewAudio: HTMLAudioElement | null = null;
  private readonly previewUrlCache = new Map<string, string>();

  readonly atlasId = signal<string | null>(null);
  readonly draft = signal('');
  readonly initialValue = signal('');
  readonly wikiTypeDraft = signal<WikiType>('topic');
  readonly initialWikiType = signal<WikiType>('topic');
  readonly perspectiveDraft = signal<AtlasResponsePerspective>('auto');
  readonly initialPerspective = signal<AtlasResponsePerspective>('auto');
  readonly saving = signal(false);
  readonly justSaved = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hasInitialized = signal(false);
  readonly activeStep = signal<IdentityStudioStep>('personality');
  readonly openIdentityMenu = signal<IdentityMenu | null>(null);

  readonly speechVoiceConfig = signal<AtlasSpeechVoiceConfig | null>(null);
  readonly voiceConfigLoading = signal(false);
  readonly voiceMode = signal<SpokenVoiceMode>('design');
  readonly voiceDescription = signal(DEFAULT_VOICE_DESCRIPTION);
  readonly previewScript = signal('');
  readonly designSessionId = signal<string | null>(null);
  readonly designPreviews = signal<AtlasSpeechVoicePreview[]>([]);
  readonly selectedDesignPreviewId = signal<string | null>(null);
  readonly selectedCatalogVoiceId = signal<string | null>(null);
  readonly librarySearch = signal('');
  readonly voiceGenerating = signal(false);
  readonly voiceSaving = signal(false);
  readonly voicePreviewLoadingKey = signal<string | null>(null);
  readonly voicePlayingKey = signal<string | null>(null);
  readonly voiceErrorMessage = signal<string | null>(null);
  readonly spokenSavedMessage = signal<string | null>(null);

  readonly atlas = computed<AtlasItem | null>(() => {
    const id = this.atlasId();
    return id ? this.atlasService.atlases().find((atlas) => atlas.id === id) ?? null : null;
  });
  readonly canAdminAtlas = computed(() => this.atlasService.canAdminAtlas(this.atlas()));
  readonly characterCount = computed(() => this.draft().length);
  readonly remaining = computed(() => Math.max(0, PERSONA_STORAGE_LIMIT - this.characterCount()));
  readonly overStorageLimit = computed(() => this.characterCount() > PERSONA_STORAGE_LIMIT);
  readonly overRuntimeLimit = computed(() => this.characterCount() > PERSONA_RUNTIME_LIMIT);
  readonly hasPersonaChanges = computed(() => this.draft().trim() !== this.initialValue().trim());
  readonly hasIdentityChanges = computed(() =>
    this.wikiTypeDraft() !== this.initialWikiType()
    || this.perspectiveDraft() !== this.initialPerspective(),
  );
  readonly hasChanges = computed(() => this.hasPersonaChanges() || this.hasIdentityChanges());
  readonly hasCustomPrompt = computed(() => this.initialValue().trim().length > 0);
  readonly personalityReady = computed(() => this.initialValue().trim().length > 0);
  readonly descriptionCount = computed(() => this.voiceDescription().length);
  readonly previewScriptCount = computed(() => this.previewScript().length);
  readonly canGenerateVoices = computed(() => {
    const length = this.voiceDescription().trim().length;
    return length >= 20 && length <= VOICE_DESCRIPTION_LIMIT && !this.voiceGenerating();
  });
  readonly filteredCatalogVoices = computed(() => {
    const query = this.librarySearch().trim().toLowerCase();
    if (!query) return STACK_NARRATOR_VOICES;
    return STACK_NARRATOR_VOICES.filter((voice) => [voice.name, voice.presentation, voice.accent, voice.style, voice.description]
      .some((value) => value.toLowerCase().includes(query)));
  });
  readonly guideImageUrl = computed(() => {
    const atlas = this.atlas();
    return atlas?.chat_guide?.image_url?.trim() || '';
  });
  readonly guideName = computed(() => this.atlas()?.chat_guide?.name?.trim() || this.displayName());
  readonly spokenVoiceReady = computed(() => this.speechVoiceConfig()?.source !== 'default');
  readonly spokenVoiceLabel = computed(() => {
    const config = this.speechVoiceConfig();
    return !config || config.source === 'default' ? 'Default conversation voice' : config.name || 'ElevenLabs voice';
  });
  readonly canSaveSpokenVoice = computed(() => {
    if (this.voiceSaving() || this.voiceConfigLoading()) return false;
    if (this.voiceMode() === 'default') return this.speechVoiceConfig()?.source !== 'default';
    if (this.voiceMode() === 'catalog') return !!this.selectedCatalogVoiceId();
    return !!this.designSessionId() && !!this.selectedDesignPreviewId();
  });

  readonly storageLimit = PERSONA_STORAGE_LIMIT;
  readonly runtimeLimit = PERSONA_RUNTIME_LIMIT;
  readonly voiceDescriptionLimit = VOICE_DESCRIPTION_LIMIT;
  readonly previewScriptLimit = PREVIEW_SCRIPT_LIMIT;
  readonly effectivePerspective = computed<'first_person' | 'third_person'>(() => {
    const configured = this.perspectiveDraft();
    if (configured === 'first_person' || configured === 'third_person') return configured;
    return this.wikiTypeDraft() === 'person' ? 'first_person' : 'third_person';
  });
  readonly wikiTypeLabel = computed(() => {
    switch (this.wikiTypeDraft()) {
      case 'person': return $localize`Person`;
      case 'city': return $localize`City`;
      case 'university': return $localize`University`;
      case 'organization': return $localize`Organization`;
      default: return $localize`Topic`;
    }
  });
  readonly perspectiveLabel = computed(() => {
    switch (this.perspectiveDraft()) {
      case 'first_person': return $localize`First person`;
      case 'third_person': return $localize`Third person`;
      default: return $localize`Automatic (recommended)`;
    }
  });
  readonly perspectivePreview = computed(() => {
    const name = this.guideName() || this.displayName();
    return this.effectivePerspective() === 'first_person'
      ? `“I am ${name}. I will answer from my documented perspective while being candid about uncertainty.”`
      : `“${name} is the subject of this wiki. Answers will describe ${name} from a knowledgeable guide’s perspective.”`;
  });

  constructor() {
    effect(() => this.atlasId.set(this.route.snapshot.paramMap.get('atlasId')));
    effect(() => {
      const atlas = this.atlas();
      if (!atlas || this.hasInitialized()) return;
      const value = String(atlas.persona_prompt ?? '');
      const wikiType = atlas.wiki_type ?? 'topic';
      const perspective = atlas.response_perspective ?? 'auto';
      this.draft.set(value);
      this.initialValue.set(value);
      this.wikiTypeDraft.set(wikiType);
      this.initialWikiType.set(wikiType);
      this.perspectiveDraft.set(perspective);
      this.initialPerspective.set(perspective);
      this.previewScript.set(this.defaultPreviewScript());
      this.hasInitialized.set(true);
    });
    effect(() => {
      const id = this.atlasId();
      if (!id || !this.canAdminAtlas() || this.loadedVoiceAtlasId === id) return;
      this.loadedVoiceAtlasId = id;
      void this.loadSpeechVoiceConfig(id);
    });
  }

  displayName(): string {
    const atlas = this.atlas();
    return atlas ? this.atlasService.displayName(atlas) : 'Wiki';
  }

  setActiveStep(step: IdentityStudioStep): void {
    this.activeStep.set(step);
    this.voiceErrorMessage.set(null);
    this.spokenSavedMessage.set(null);
    this.stopVoicePreview();
  }

  setVoiceMode(mode: SpokenVoiceMode): void {
    this.voiceMode.set(mode);
    this.voiceErrorMessage.set(null);
    this.spokenSavedMessage.set(null);
    this.stopVoicePreview();
  }

  onTextareaInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
    this.justSaved.set(false);
    this.errorMessage.set(null);
  }

  toggleIdentityMenu(menu: IdentityMenu): void {
    this.openIdentityMenu.update((open) => open === menu ? null : menu);
  }

  onWikiTypeChange(value: string): void {
    if (value === 'city' || value === 'person' || value === 'university' || value === 'organization' || value === 'topic') {
      this.wikiTypeDraft.set(value as WikiType);
      this.openIdentityMenu.set(null);
      this.justSaved.set(false);
      this.errorMessage.set(null);
    }
  }

  onPerspectiveChange(value: string): void {
    if (value === 'auto' || value === 'first_person' || value === 'third_person') {
      this.perspectiveDraft.set(value as AtlasResponsePerspective);
      this.openIdentityMenu.set(null);
      this.justSaved.set(false);
      this.errorMessage.set(null);
    }
  }

  @HostListener('document:click')
  closeIdentityMenu(): void {
    this.openIdentityMenu.set(null);
  }

  @HostListener('document:keydown.escape')
  closeIdentityMenuOnEscape(): void {
    this.openIdentityMenu.set(null);
  }

  onVoiceDescriptionInput(event: Event): void {
    this.voiceDescription.set((event.target as HTMLTextAreaElement).value.slice(0, VOICE_DESCRIPTION_LIMIT));
    this.clearGeneratedPreviews();
  }

  onPreviewScriptInput(event: Event): void {
    this.previewScript.set((event.target as HTMLInputElement).value.slice(0, PREVIEW_SCRIPT_LIMIT));
    this.clearGeneratedPreviews();
  }

  async save(): Promise<void> {
    const id = this.atlasId();
    if (!id || !this.canAdminAtlas() || this.saving()) return;
    const value = this.draft().trim();
    if (value.length > PERSONA_STORAGE_LIMIT) {
      this.errorMessage.set(`Keep the persona under ${PERSONA_STORAGE_LIMIT} characters.`);
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      await this.atlasService.updatePersonaSettings(id, {
        wikiType: this.wikiTypeDraft(),
        responsePerspective: this.perspectiveDraft(),
        personaPrompt: value || null,
      });
      this.initialValue.set(value);
      this.initialWikiType.set(this.wikiTypeDraft());
      this.initialPerspective.set(this.perspectiveDraft());
      this.draft.set(value);
      this.justSaved.set(true);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : $localize`Failed to save the persona prompt.`);
    } finally {
      this.saving.set(false);
    }
  }

  revertToSaved(): void {
    this.draft.set(this.initialValue());
    this.wikiTypeDraft.set(this.initialWikiType());
    this.perspectiveDraft.set(this.initialPerspective());
    this.justSaved.set(false);
    this.errorMessage.set(null);
  }

  async clearPersona(): Promise<void> {
    const id = this.atlasId();
    if (!id || !this.canAdminAtlas() || this.saving()) return;
    if (this.hasCustomPrompt() && !window.confirm('Clear the saved persona and revert this wiki to the default personality?')) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      await this.atlasService.updatePersonaPrompt(id, null);
      this.initialValue.set('');
      this.draft.set('');
      this.justSaved.set(true);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : $localize`Failed to clear the persona prompt.`);
    } finally {
      this.saving.set(false);
    }
  }

  async generateVoicePreviews(): Promise<void> {
    const atlasId = this.atlasId();
    if (!atlasId || !this.canGenerateVoices()) return;
    this.stopVoicePreview();
    this.voiceGenerating.set(true);
    this.voiceErrorMessage.set(null);
    this.spokenSavedMessage.set(null);
    this.clearGeneratedPreviews();
    try {
      const result = await this.atlasService.designAtlasSpeechVoice(atlasId, this.voiceDescription().trim(), this.previewScript().trim());
      this.designSessionId.set(result.sessionId);
      this.designPreviews.set(result.previews);
      this.selectedDesignPreviewId.set(result.previews[0]?.id ?? null);
      this.previewScript.set(result.previewText);
    } catch (error) {
      this.voiceErrorMessage.set(this.errorText(error, 'Voice previews could not be generated.'));
    } finally {
      this.voiceGenerating.set(false);
    }
  }

  selectDesignPreview(preview: AtlasSpeechVoicePreview): void {
    this.selectedDesignPreviewId.set(preview.id);
    this.spokenSavedMessage.set(null);
  }

  selectCatalogVoice(voice: StackNarratorVoice): void {
    this.selectedCatalogVoiceId.set(voice.id);
    this.spokenSavedMessage.set(null);
  }

  async saveSpokenVoice(): Promise<void> {
    const atlasId = this.atlasId();
    if (!atlasId || !this.canSaveSpokenVoice()) return;
    this.stopVoicePreview();
    this.voiceSaving.set(true);
    this.voiceErrorMessage.set(null);
    this.spokenSavedMessage.set(null);
    try {
      let saved: AtlasSpeechVoiceConfig;
      if (this.voiceMode() === 'default') {
        saved = await this.atlasService.resetAtlasSpeechVoice(atlasId);
      } else if (this.voiceMode() === 'catalog') {
        saved = await this.atlasService.selectAtlasCatalogVoice(atlasId, this.selectedCatalogVoiceId()!);
      } else {
        saved = await this.atlasService.saveAtlasDesignedVoice(atlasId, this.designSessionId()!, this.selectedDesignPreviewId()!);
      }
      this.speechVoiceConfig.set(saved);
      this.applyConfigToDraft(saved);
      this.spokenSavedMessage.set('Saved. New voice conversations and spoken answers will use this voice.');
    } catch (error) {
      this.voiceErrorMessage.set(this.errorText(error, 'The conversation voice could not be saved.'));
    } finally {
      this.voiceSaving.set(false);
    }
  }

  cancelSpokenChanges(): void {
    const config = this.speechVoiceConfig();
    if (config) this.applyConfigToDraft(config);
    this.voiceErrorMessage.set(null);
    this.spokenSavedMessage.set(null);
    this.stopVoicePreview();
  }

  async previewDesignVoice(preview: AtlasSpeechVoicePreview): Promise<void> {
    this.selectDesignPreview(preview);
    await this.playVoiceUrl(`design:${preview.id}`, `data:${preview.contentType || 'audio/mpeg'};base64,${preview.audioBase64}`);
  }

  async previewCatalogVoice(voice: StackNarratorVoice): Promise<void> {
    this.selectCatalogVoice(voice);
    await this.loadAndPlayVoice(`catalog:${voice.id}`, voice.sampleText, voice.id);
  }

  async previewSavedVoice(): Promise<void> {
    await this.loadAndPlayVoice('saved', this.previewScript().trim() || this.defaultPreviewScript());
  }

  async previewDefaultVoice(): Promise<void> {
    await this.loadAndPlayVoice('default', this.defaultPreviewScript());
  }

  previewName(index: number): string {
    return PREVIEW_NAMES[index] ?? `Voice ${index + 1}`;
  }

  previewDescriptor(index: number): string {
    return PREVIEW_DESCRIPTORS[index] ?? 'Designed ElevenLabs voice';
  }

  downloadMarkdown(): void {
    const filenameBase = this.displayName().toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'living-wiki';
    const blob = new Blob([this.draft()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${filenameBase}-persona.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async uploadMarkdown(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    const isMarkdown = file.name.toLowerCase().endsWith('.md') || file.type === 'text/markdown' || file.type === 'text/plain' || file.type === '';
    if (!isMarkdown) {
      this.errorMessage.set($localize`Upload a Markdown or plain text persona file.`);
      return;
    }
    try {
      const text = await file.text();
      if (text.length > PERSONA_STORAGE_LIMIT) {
        this.errorMessage.set(`That file is ${text.length} characters. Keep persona Markdown under ${PERSONA_STORAGE_LIMIT} characters.`);
        return;
      }
      this.draft.set(text);
      this.justSaved.set(false);
      this.errorMessage.set(null);
    } catch {
      this.errorMessage.set($localize`Failed to read the persona file.`);
    }
  }

  goBack(): void {
    this.stopVoicePreview();
    void this.router.navigate(['/atlases']);
  }

  private async loadSpeechVoiceConfig(atlasId: string): Promise<void> {
    this.voiceConfigLoading.set(true);
    this.voiceErrorMessage.set(null);
    try {
      const config = await this.atlasService.getAtlasSpeechVoiceConfig(atlasId);
      this.speechVoiceConfig.set(config);
      this.applyConfigToDraft(config);
    } catch (error) {
      this.loadedVoiceAtlasId = null;
      this.voiceErrorMessage.set(this.errorText(error, 'The conversation voice settings could not be loaded.'));
    } finally {
      this.voiceConfigLoading.set(false);
    }
  }

  private applyConfigToDraft(config: AtlasSpeechVoiceConfig): void {
    this.voiceMode.set(config.source === 'catalog' ? 'catalog' : config.source === 'designed' ? 'design' : 'default');
    this.selectedCatalogVoiceId.set(config.catalogVoiceId);
    if (config.source === 'designed' && config.description) this.voiceDescription.set(config.description);
    this.clearGeneratedPreviews();
  }

  private clearGeneratedPreviews(): void {
    this.designSessionId.set(null);
    this.designPreviews.set([]);
    this.selectedDesignPreviewId.set(null);
    this.spokenSavedMessage.set(null);
    this.stopVoicePreview();
  }

  private defaultPreviewScript(): string {
    const name = this.guideName() || this.displayName();
    return `Welcome to ${this.displayName()}. I am ${name}, your LivingWiki guide. Ask me about the people, places, choices, and ideas that shaped this story, and we will examine the evidence together.`;
  }

  private async loadAndPlayVoice(key: string, text: string, narratorVoiceId?: string): Promise<void> {
    if (this.voicePlayingKey() === key) {
      this.stopVoicePreview();
      return;
    }
    const cached = this.previewUrlCache.get(key);
    if (cached) {
      await this.playVoiceUrl(key, cached);
      return;
    }
    const atlasId = this.atlasId();
    if (!atlasId || this.voicePreviewLoadingKey()) return;
    this.voicePreviewLoadingKey.set(key);
    this.voiceErrorMessage.set(null);
    try {
      const response = await this.atlasService.previewAtlasSpeechVoice(atlasId, text, narratorVoiceId ?? null);
      const url = this.audioUrl(response);
      if (!url) throw new Error('No preview audio was returned.');
      this.previewUrlCache.set(key, url);
      await this.playVoiceUrl(key, url);
    } catch (error) {
      this.voiceErrorMessage.set(this.errorText(error, 'That voice preview could not be played.'));
    } finally {
      this.voicePreviewLoadingKey.set(null);
    }
  }

  private audioUrl(response: AtlasSpeechAudioResponse): string | null {
    if (response.audioUrl) return response.audioUrl;
    return response.audioBase64 ? `data:${response.contentType || 'audio/mpeg'};base64,${response.audioBase64}` : null;
  }

  private async playVoiceUrl(key: string, url: string): Promise<void> {
    if (this.voicePlayingKey() === key) {
      this.stopVoicePreview();
      return;
    }
    this.stopVoicePreview();
    const audio = new Audio(url);
    this.previewAudio = audio;
    this.voicePlayingKey.set(key);
    audio.onended = () => this.stopVoicePreview();
    audio.onerror = () => {
      this.stopVoicePreview();
      this.voiceErrorMessage.set('That voice preview could not be played.');
    };
    try {
      await audio.play();
    } catch (error) {
      this.stopVoicePreview();
      this.voiceErrorMessage.set(this.errorText(error, 'Your browser blocked the voice preview. Try again.'));
    }
  }

  private stopVoicePreview(): void {
    if (this.previewAudio) {
      this.previewAudio.pause();
      this.previewAudio.currentTime = 0;
      this.previewAudio.onended = null;
      this.previewAudio.onerror = null;
      this.previewAudio = null;
    }
    this.voicePlayingKey.set(null);
  }

  private errorText(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
  }
}
