import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AtlasService } from '../atlas.service';

@Component({
  selector: 'app-atlas-home-redirect',
  template: `<div class="flex min-h-screen items-center justify-center text-[var(--muted)]">Loading your atlas…</div>`,
})
export class AtlasHomeRedirectComponent {
  private readonly atlasService = inject(AtlasService);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      if (this.atlasService.isLoading()) return;
      const link = this.atlasService.activeAtlasHomeLink();
      void this.router.navigateByUrl(link);
    });
  }
}
