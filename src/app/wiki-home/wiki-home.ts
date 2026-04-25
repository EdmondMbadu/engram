import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { AtlasItem, AtlasUsage } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { AtlasBadgeComponent } from '../atlas-badge/atlas-badge';
import { AtlasSwitcherComponent } from '../atlas-switcher/atlas-switcher';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-wiki-home',
  imports: [RouterLink, ThemeToggleComponent, MobileMenuComponent, AtlasSwitcherComponent, AtlasBadgeComponent],
  templateUrl: './wiki-home.html',
})
export class WikiHomeComponent {
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly atlases = this.atlasService.atlases;
  readonly activeAtlasId = this.atlasService.activeAtlasId;
  readonly isLoading = this.atlasService.isLoading;
  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly atlasHomeLink = this.atlasService.activeAtlasHomeLink;
  readonly atlasWikiLink = this.atlasService.activeAtlasWikiLink;

  readonly createOpen = signal(false);
  readonly createName = signal('');
  readonly isCreating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly isSigningOut = signal(false);
  readonly usageById = signal<Record<string, AtlasUsage>>({});
  readonly loadingUsageById = signal<Record<string, boolean>>({});

  readonly sortedWikis = computed(() =>
    [...this.atlases()].sort((a, b) => this.asMillis(b.updated_at ?? b.created_at) - this.asMillis(a.updated_at ?? a.created_at)),
  );

  readonly totalDocuments = computed(() =>
    this.atlases().reduce((sum, atlas) => sum + (atlas.stats?.documents ?? this.usage(atlas.id)?.documents ?? 0), 0),
  );
  readonly activeWikiName = computed(() =>
    this.displayName(this.atlases().find((atlas) => atlas.id === this.activeAtlasId())),
  );

  constructor() {
    effect(() => {
      const atlases = this.atlases();
      void this.syncUsage(atlases);
    });
  }

  displayName(atlas: AtlasItem | null | undefined): string {
    const name = this.atlasService.displayName(atlas);
    if (name === 'My Atlas') return 'My Wiki';
    if (name === 'Untitled Atlas') return 'Untitled Wiki';
    if (/^Atlas [a-z0-9]{6}$/i.test(name)) return name.replace(/^Atlas/i, 'Wiki');
    return name;
  }

  wikiSlug(atlas: AtlasItem): string {
    return atlas.slug?.trim() || this.atlasService.slugify(atlas.name ?? '') || atlas.id;
  }

  usage(atlasId: string): AtlasUsage | null {
    return this.usageById()[atlasId] ?? null;
  }

  documentCount(atlas: AtlasItem): number {
    return atlas.stats?.documents ?? this.usage(atlas.id)?.documents ?? 0;
  }

  articleCount(atlas: AtlasItem): number {
    return atlas.stats?.wiki_articles ?? this.usage(atlas.id)?.wiki_topics ?? 0;
  }

  chatCount(atlas: AtlasItem): number {
    const usage = this.usage(atlas.id);
    return atlas.stats?.chat_threads ?? ((usage?.queries ?? 0) + (usage?.chat_threads ?? 0));
  }

  updatedLabel(atlas: AtlasItem): string {
    const date = this.asDate(atlas.updated_at ?? atlas.created_at);
    if (!date) {
      return 'Recently created';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  openCreate(): void {
    this.createOpen.set(true);
    this.createError.set(null);
    this.createName.set('');
  }

  closeCreate(): void {
    if (this.isCreating()) {
      return;
    }
    this.createOpen.set(false);
    this.createError.set(null);
    this.createName.set('');
  }

  onCreateNameInput(event: Event): void {
    this.createName.set((event.target as HTMLInputElement).value);
  }

  async createWiki(event: Event): Promise<void> {
    event.preventDefault();
    const name = this.createName().trim();
    if (!name || this.isCreating()) {
      return;
    }

    this.isCreating.set(true);
    this.createError.set(null);
    try {
      const atlasId = await this.atlasService.createAtlas({ name });
      if (atlasId) {
        this.atlasService.setActive(atlasId);
      }
      this.createOpen.set(false);
      this.createName.set('');
    } catch (error) {
      this.createError.set(error instanceof Error ? error.message : 'Failed to create Wiki.');
    } finally {
      this.isCreating.set(false);
    }
  }

  selectWiki(atlasId: string): void {
    this.atlasService.setActive(atlasId);
  }

  async openWiki(atlas: AtlasItem, destination: 'library' | 'chat' | 'wiki' | 'settings'): Promise<void> {
    this.selectWiki(atlas.id);
    if (destination === 'wiki') {
      await this.router.navigate(['/wiki']);
      return;
    }
    if (destination === 'settings') {
      await this.router.navigate(['/atlases']);
      return;
    }
    await this.router.navigate([`/${destination}`]);
  }

  userInitials(): string {
    const name = this.currentUserName();
    if (!name) return '?';
    return name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  async signOut(): Promise<void> {
    this.isSigningOut.set(true);
    try {
      await this.authService.signOut();
      await this.router.navigateByUrl('/');
    } finally {
      this.isSigningOut.set(false);
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

    await Promise.all(
      atlases.map(async (atlas) => {
        if (this.usage(atlas.id) || this.loadingUsageById()[atlas.id]) {
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

  private asDate(value: { toDate(): Date } | Date | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
      return (value as { toDate(): Date }).toDate();
    }
    return null;
  }

  private asMillis(value: { toDate(): Date } | Date | null | undefined): number {
    return this.asDate(value)?.getTime() ?? 0;
  }
}
