import { Component, computed, inject } from '@angular/core';
import { AtlasService } from '../atlas.service';

@Component({
  selector: 'app-atlas-badge',
  imports: [],
  template: `
    @if (activeAtlas(); as atlas) {
      <span
        class="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--soft-fill)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
        [title]="'Active atlas: ' + label()"
      >
        <span class="material-symbols-outlined text-[var(--accent)] text-[0.9rem]">public</span>
        <span class="max-w-[12rem] truncate">{{ label() }}</span>
      </span>
    }
  `,
})
export class AtlasBadgeComponent {
  private readonly atlasService = inject(AtlasService);
  readonly activeAtlas = this.atlasService.activeAtlas;
  readonly label = computed(() => this.atlasService.displayName(this.activeAtlas()));
}
