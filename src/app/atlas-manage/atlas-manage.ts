import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AtlasItem, AtlasUsage } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-atlas-manage',
  imports: [FormsModule, RouterLink, ThemeToggleComponent],
  templateUrl: './atlas-manage.html',
})
export class AtlasManageComponent {
  private readonly atlasService = inject(AtlasService);

  readonly atlases = this.atlasService.atlases;
  readonly activeAtlasId = this.atlasService.activeAtlasId;

  readonly usageById = signal<Record<string, AtlasUsage>>({});
  readonly loadingUsageById = signal<Record<string, boolean>>({});
  readonly renamingId = signal<string | null>(null);
  readonly renameDraft = signal('');
  readonly renaming = signal(false);
  readonly deletingId = signal<string | null>(null);
  readonly pageError = signal<string | null>(null);

  readonly hasMultipleAtlases = computed(() => this.atlases().length > 1);

  constructor() {
    effect(() => {
      const atlases = this.atlases();
      void this.syncUsage(atlases);
    });
  }

  displayName(atlas: AtlasItem | null | undefined): string {
    return this.atlasService.displayName(atlas);
  }

  atlasMeta(atlas: AtlasItem): string {
    return atlas.id.slice(0, 6);
  }

  usage(atlasId: string): AtlasUsage | null {
    return this.usageById()[atlasId] ?? null;
  }

  isUsageLoading(atlasId: string): boolean {
    return this.loadingUsageById()[atlasId] ?? false;
  }

  chatCount(usage: AtlasUsage): number {
    return usage.queries + usage.chat_threads;
  }

  usageLabel(usage: AtlasUsage | null): string {
    if (!usage) {
      return 'Checking atlas contents...';
    }

    if (usage.total === 0) {
      return 'Empty atlas';
    }

    const parts = [
      usage.documents ? `${usage.documents} doc${usage.documents === 1 ? '' : 's'}` : null,
      usage.knowledge_entries ? `${usage.knowledge_entries} knowledge entr${usage.knowledge_entries === 1 ? 'y' : 'ies'}` : null,
      usage.wiki_topics ? `${usage.wiki_topics} topic${usage.wiki_topics === 1 ? '' : 's'}` : null,
      this.chatCount(usage) ? `${this.chatCount(usage)} chat${this.chatCount(usage) === 1 ? '' : 's'}` : null,
    ].filter(Boolean);

    return parts.join(' • ');
  }

  selectAtlas(atlasId: string): void {
    this.atlasService.setActive(atlasId);
  }

  startRename(atlas: AtlasItem): void {
    this.pageError.set(null);
    this.renamingId.set(atlas.id);
    this.renameDraft.set(this.displayName(atlas));
  }

  cancelRename(): void {
    this.renamingId.set(null);
    this.renameDraft.set('');
  }

  onRenameInput(event: Event): void {
    this.renameDraft.set((event.target as HTMLInputElement).value);
  }

  async saveRename(event: Event): Promise<void> {
    event.preventDefault();
    const atlasId = this.renamingId();
    const name = this.renameDraft().trim();
    if (!atlasId || !name) {
      this.cancelRename();
      return;
    }

    this.renaming.set(true);
    this.pageError.set(null);
    try {
      await this.atlasService.renameAtlas(atlasId, name);
      this.cancelRename();
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to rename atlas.');
    } finally {
      this.renaming.set(false);
    }
  }

  canDelete(atlasId: string): boolean {
    if (!this.hasMultipleAtlases()) {
      return false;
    }

    const usage = this.usage(atlasId);
    return !!usage && usage.total === 0;
  }

  async deleteAtlas(atlas: AtlasItem): Promise<void> {
    const usage = this.usage(atlas.id);
    if (!usage || usage.total > 0 || !this.hasMultipleAtlases()) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${this.displayName(atlas)}"?\n\nThis atlas is empty and will be removed permanently.`,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId.set(atlas.id);
    this.pageError.set(null);
    try {
      await this.atlasService.deleteAtlas(atlas.id);
      this.renamingId.update((current) => (current === atlas.id ? null : current));
      this.renameDraft.set('');

      this.usageById.update((current) => {
        const next = { ...current };
        delete next[atlas.id];
        return next;
      });
      this.loadingUsageById.update((current) => {
        const next = { ...current };
        delete next[atlas.id];
        return next;
      });
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to delete atlas.');
    } finally {
      this.deletingId.set(null);
    }
  }

  private async syncUsage(atlases: AtlasItem[]): Promise<void> {
    const atlasIds = new Set(atlases.map((atlas) => atlas.id));

    this.usageById.update((current) => {
      const next: Record<string, AtlasUsage> = {};
      for (const [atlasId, usage] of Object.entries(current)) {
        if (atlasIds.has(atlasId)) {
          next[atlasId] = usage;
        }
      }
      return next;
    });

    this.loadingUsageById.update((current) => {
      const next: Record<string, boolean> = {};
      for (const [atlasId, loading] of Object.entries(current)) {
        if (atlasIds.has(atlasId)) {
          next[atlasId] = loading;
        }
      }
      return next;
    });

    await Promise.all(
      atlases.map(async (atlas) => {
        if (this.usage(atlas.id) || this.isUsageLoading(atlas.id)) {
          return;
        }

        this.loadingUsageById.update((current) => ({ ...current, [atlas.id]: true }));
        try {
          const usage = await this.atlasService.getAtlasUsage(atlas.id);
          this.usageById.update((current) => ({ ...current, [atlas.id]: usage }));
        } finally {
          this.loadingUsageById.update((current) => ({ ...current, [atlas.id]: false }));
        }
      }),
    );
  }
}
