import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

const PERSONA_SOFT_LIMIT = 4000;

@Component({
  selector: 'app-atlas-persona',
  imports: [FormsModule, RouterLink, ThemeToggleComponent],
  templateUrl: './atlas-persona.html',
})
export class AtlasPersonaComponent {
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);
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

  readonly isOwner = computed(() => {
    const atlas = this.atlas();
    const uid = this.authService.uid();
    return !!atlas && !!uid && atlas.user_id === uid;
  });

  readonly characterCount = computed(() => this.draft().length);
  readonly remaining = computed(() => Math.max(0, PERSONA_SOFT_LIMIT - this.characterCount()));
  readonly overSoftLimit = computed(() => this.characterCount() > PERSONA_SOFT_LIMIT);
  readonly hasChanges = computed(() => this.draft().trim() !== this.initialValue().trim());
  readonly hasCustomPrompt = computed(() => this.initialValue().trim().length > 0);

  readonly softLimit = PERSONA_SOFT_LIMIT;

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
    if (!id || !this.isOwner()) return;
    if (this.saving()) return;

    const value = this.draft().trim();
    if (value.length > PERSONA_SOFT_LIMIT) {
      this.errorMessage.set(`Keep the persona under ${PERSONA_SOFT_LIMIT} characters for predictable latency.`);
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
        error instanceof Error ? error.message : 'Failed to save the persona prompt.',
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
    if (!id || !this.isOwner()) return;
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
        error instanceof Error ? error.message : 'Failed to clear the persona prompt.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  goBack(): void {
    void this.router.navigate(['/atlases']);
  }
}
