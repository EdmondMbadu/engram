import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { AtlasService } from '../atlas.service';
import type { AtlasItem } from '../atlas.models';

@Component({
  selector: 'app-atlas-switcher',
  imports: [],
  templateUrl: './atlas-switcher.html',
})
export class AtlasSwitcherComponent {
  private readonly atlasService = inject(AtlasService);
  private readonly elementRef = inject(ElementRef);

  readonly atlases = this.atlasService.atlases;
  readonly activeAtlas = this.atlasService.activeAtlas;
  readonly menuOpen = signal(false);
  readonly creating = signal(false);
  readonly renaming = signal(false);
  readonly newName = signal('');
  readonly showCreate = signal(false);
  readonly renamingId = signal<string | null>(null);
  readonly renameDraft = signal('');

  displayName(atlas: AtlasItem | null | undefined): string {
    return this.atlasService.displayName(atlas);
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  select(atlasId: string): void {
    if (this.renamingId()) return;
    this.atlasService.setActive(atlasId);
    this.menuOpen.set(false);
  }

  openCreate(): void {
    this.showCreate.set(true);
    this.menuOpen.set(false);
    this.newName.set('');
  }

  cancelCreate(): void {
    this.showCreate.set(false);
    this.newName.set('');
  }

  async submitCreate(event: Event): Promise<void> {
    event.preventDefault();
    const name = this.newName().trim();
    if (!name) return;
    this.creating.set(true);
    try {
      await this.atlasService.createAtlas({ name });
      this.showCreate.set(false);
      this.newName.set('');
    } finally {
      this.creating.set(false);
    }
  }

  onNameInput(event: Event): void {
    this.newName.set((event.target as HTMLInputElement).value);
  }

  startRename(event: Event, atlas: AtlasItem): void {
    event.stopPropagation();
    this.renamingId.set(atlas.id);
    this.renameDraft.set(this.displayName(atlas));
  }

  onRenameInput(event: Event): void {
    this.renameDraft.set((event.target as HTMLInputElement).value);
  }

  cancelRename(event: Event): void {
    event.stopPropagation();
    this.renamingId.set(null);
    this.renameDraft.set('');
  }

  async submitRename(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const id = this.renamingId();
    const name = this.renameDraft().trim();
    if (!id || !name) {
      this.renamingId.set(null);
      return;
    }
    this.renaming.set(true);
    try {
      await this.atlasService.renameAtlas(id, name);
      this.renamingId.set(null);
      this.renameDraft.set('');
    } finally {
      this.renaming.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
      this.renamingId.set(null);
    }
  }
}
