import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { AccountMenuComponent } from '../account-menu/account-menu';

const PERSONA_STORAGE_LIMIT = 40000;
const PERSONA_RUNTIME_LIMIT = 8000;

@Component({
  selector: 'app-atlas-persona',
  imports: [FormsModule, RouterLink, ThemeToggleComponent, AccountMenuComponent],
  templateUrl: './atlas-persona.html',
})
export class AtlasPersonaComponent {
  private readonly atlasService = inject(AtlasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly atlasId = signal<string | null>(null);
  readonly draft = signal('');
  readonly initialValue = signal('');
  readonly saving = signal(false);
  readonly justSaved = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hasInitialized = signal(false);

  readonly atlas = computed<AtlasItem | null>(() => {
    const id = this.atlasId();
    if (!id) return null;
    return this.atlasService.atlases().find((a) => a.id === id) ?? null;
  });

  readonly canAdminAtlas = computed(() => this.atlasService.canAdminAtlas(this.atlas()));

  readonly characterCount = computed(() => this.draft().length);
  readonly remaining = computed(() => Math.max(0, PERSONA_STORAGE_LIMIT - this.characterCount()));
  readonly overStorageLimit = computed(() => this.characterCount() > PERSONA_STORAGE_LIMIT);
  readonly overRuntimeLimit = computed(() => this.characterCount() > PERSONA_RUNTIME_LIMIT);
  readonly hasChanges = computed(() => this.draft().trim() !== this.initialValue().trim());
  readonly hasCustomPrompt = computed(() => this.initialValue().trim().length > 0);

  readonly storageLimit = PERSONA_STORAGE_LIMIT;
  readonly runtimeLimit = PERSONA_RUNTIME_LIMIT;

  constructor() {
    effect(() => {
      const id = this.route.snapshot.paramMap.get('atlasId');
      this.atlasId.set(id);
    });

    effect(() => {
      const atlas = this.atlas();
      if (!atlas || this.hasInitialized()) return;
      const value = (atlas.persona_prompt ?? '').toString();
      this.draft.set(value);
      this.initialValue.set(value);
      this.hasInitialized.set(true);
    });
  }

  displayName(): string {
    const atlas = this.atlas();
    return atlas ? this.atlasService.displayName(atlas) : 'Wiki';
  }

  onTextareaInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.draft.set(target.value);
    this.justSaved.set(false);
    this.errorMessage.set(null);
  }

  async save(): Promise<void> {
    const id = this.atlasId();
    if (!id || !this.canAdminAtlas()) return;
    if (this.saving()) return;

    const value = this.draft().trim();
    if (value.length > PERSONA_STORAGE_LIMIT) {
      this.errorMessage.set(`Keep the persona under ${PERSONA_STORAGE_LIMIT} characters.`);
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      await this.atlasService.updatePersonaPrompt(id, value.length === 0 ? null : value);
      this.initialValue.set(value);
      this.draft.set(value);
      this.justSaved.set(true);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : $localize`Failed to save the persona prompt.`,
      );
    } finally {
      this.saving.set(false);
    }
  }

  revertToSaved(): void {
    this.draft.set(this.initialValue());
    this.justSaved.set(false);
    this.errorMessage.set(null);
  }

  async clearPersona(): Promise<void> {
    const id = this.atlasId();
    if (!id || !this.canAdminAtlas()) return;
    if (this.saving()) return;

    if (this.hasCustomPrompt()) {
      const confirmed = window.confirm(
        'Clear the saved persona and revert this wiki to the default voice?',
      );
      if (!confirmed) return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      await this.atlasService.updatePersonaPrompt(id, null);
      this.initialValue.set('');
      this.draft.set('');
      this.justSaved.set(true);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : $localize`Failed to clear the persona prompt.`,
      );
    } finally {
      this.saving.set(false);
    }
  }

  downloadMarkdown(): void {
    const filenameBase = this.displayName()
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'living-wiki';
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
    if (!file) {
      return;
    }

    const isMarkdown = file.name.toLowerCase().endsWith('.md')
      || file.type === 'text/markdown'
      || file.type === 'text/plain'
      || file.type === '';
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
    void this.router.navigate(['/atlases']);
  }
}
