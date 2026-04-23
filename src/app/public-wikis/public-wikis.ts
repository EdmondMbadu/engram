import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AtlasService } from '../atlas.service';
import {
  buildPublicWikiLiveItem,
  COMING_SOON_PUBLIC_WIKIS,
  type PublicWikiCatalogItem,
  sortPublicAtlases,
} from '../public-wiki-catalog';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

const ALL_CATEGORIES = 'All';

@Component({
  selector: 'app-public-wikis',
  imports: [RouterLink, ThemeToggleComponent, FormsModule],
  templateUrl: './public-wikis.html',
})
export class PublicWikisComponent implements OnInit {
  private readonly atlasService = inject(AtlasService);

  readonly liveWikis = signal<PublicWikiCatalogItem[]>([]);
  readonly isLoadingLiveWikis = signal(true);
  readonly searchTerm = signal('');
  readonly activeCategory = signal<string>(ALL_CATEGORIES);

  readonly comingSoonWikis = COMING_SOON_PUBLIC_WIKIS;

  readonly publicWikis = computed(() => [
    ...this.liveWikis(),
    ...this.comingSoonWikis,
  ]);

  readonly liveCount = computed(() => this.liveWikis().length);
  readonly comingSoonCount = this.comingSoonWikis.length;

  readonly categories = computed(() => [
    ALL_CATEGORIES,
    ...Array.from(
      new Set(this.publicWikis().map((wiki) => wiki.category).filter((cat): cat is string => !!cat)),
    ).sort(),
  ]);

  readonly categoryCounts = computed(() =>
    this.categories().reduce<Record<string, number>>((acc, cat) => {
      acc[cat] =
        cat === ALL_CATEGORIES
          ? this.publicWikis().length
          : this.publicWikis().filter((wiki) => wiki.category === cat).length;
      return acc;
    }, {}),
  );

  readonly hasFilters = computed(
    () => this.activeCategory() !== ALL_CATEGORIES || this.searchTerm().trim().length > 0,
  );

  readonly filteredWikis = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const cat = this.activeCategory();

    return this.publicWikis().filter((wiki) => {
      const catMatch = cat === ALL_CATEGORIES || wiki.category === cat;
      if (!catMatch) return false;
      if (!term) return true;

      const haystack = [
        wiki.title,
        wiki.subtitle,
        wiki.description,
        wiki.category ?? '',
        wiki.sources ?? '',
        ...(wiki.badges ?? []),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  });

  async ngOnInit(): Promise<void> {
    this.isLoadingLiveWikis.set(true);

    try {
      const atlases = await this.atlasService.listPublicAtlases();
      const liveWikis = sortPublicAtlases(atlases).map((atlas) => buildPublicWikiLiveItem(atlas));
      this.liveWikis.set(liveWikis);
    } catch {
      this.liveWikis.set([]);
    } finally {
      this.isLoadingLiveWikis.set(false);
    }
  }

  setCategory(cat: string): void {
    this.activeCategory.set(cat);
  }

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }

  clearFilters(): void {
    this.activeCategory.set(ALL_CATEGORIES);
    this.searchTerm.set('');
  }

  initialsFor(title: string): string {
    return title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
}
