import { Component, computed, HostListener, inject, input, OnDestroy, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { DocumentsService } from '../documents.service';
import { STACK_NARRATOR_VOICES } from '../boards/stack-voice';
import type { TalkingCardEditorResult } from '../boards/talking-card';

type EditorMode = 'existing' | 'new';

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

  readonly boardTitle = input('Board');
  readonly boardVisibility = input<'private' | 'public' | 'unlisted'>('private');
  readonly closed = output<void>();
  readonly saved = output<TalkingCardEditorResult>();

  readonly mode = signal<EditorMode>('existing');
  readonly selectedAtlasId = signal('');
  readonly name = signal('');
  readonly role = signal('');
  readonly personaPrompt = signal('');
  readonly openingMessage = signal('Hi! I’m here to help. What would you like to know?');
  readonly ctaLabel = signal('Talk to me');
  readonly placement = signal<'start' | 'end'>('end');
  readonly catalogVoiceId = signal('');
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
  readonly publicBoard = computed(() => this.boardVisibility() === 'public');
  readonly needsPublication = computed(() => this.publicBoard() && this.selectedAtlas()?.is_public !== true);
  readonly voices = STACK_NARRATOR_VOICES;
  readonly canSave = computed(() => {
    if (this.saving()) return false;
    if (!this.openingMessage().trim()) return false;
    if (this.mode() === 'existing') {
      return !!this.selectedAtlas() && (!this.needsPublication() || this.publishAvatar());
    }
    return !!this.name().trim() && !!this.personaPrompt().trim();
  });

  setMode(mode: EditorMode): void {
    this.mode.set(mode);
    this.errorMessage.set(null);
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
    this.selectedAtlasId.set(atlasId);
    const atlas = this.availableAtlases().find((candidate) => candidate.id === atlasId);
    if (!atlas) return;
    this.name.set(atlas.chat_guide?.name?.trim() || atlas.name);
    this.role.set(atlas.chat_guide?.label?.trim() || atlas.description || 'Conversational guide');
    this.imagePreviewUrl.set(atlas.chat_guide?.image_url?.trim() || atlas.logo_url?.trim() || atlas.hero_url?.trim() || '');
    this.publishAvatar.set(false);
  }

  close(): void {
    if (!this.saving()) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  ngOnDestroy(): void {
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
        if (this.catalogVoiceId()) {
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
}
