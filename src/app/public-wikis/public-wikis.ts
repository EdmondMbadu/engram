import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import {
  buildPublicWikiLiveItem,
  COMING_SOON_PUBLIC_WIKIS,
  removeCreatedPublicWikiPreviews,
  type PublicWikiCatalogItem,
  sortPublicAtlases,
} from '../public-wiki-catalog';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

const CITIES_CATEGORY = 'Cities';
const OTHERS_CATEGORY = 'Others';
const PUBLIC_WIKI_CATEGORIES = [CITIES_CATEGORY, OTHERS_CATEGORY] as const;
type PublicWikiCategory = (typeof PUBLIC_WIKI_CATEGORIES)[number];

@Component({
  selector: 'app-public-wikis',
  imports: [RouterLink, ThemeToggleComponent, FormsModule],
  templateUrl: './public-wikis.html',
})
export class PublicWikisComponent implements OnInit {
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);

  readonly isSignedIn = this.authService.isAuthenticated;
  readonly liveWikis = signal<PublicWikiCatalogItem[]>([]);
  readonly isLoadingLiveWikis = signal(true);
  readonly searchTerm = signal('');
  readonly activeCategory = signal<PublicWikiCategory>(CITIES_CATEGORY);

  readonly comingSoonWikis = computed(() =>
    removeCreatedPublicWikiPreviews(this.liveWikis(), COMING_SOON_PUBLIC_WIKIS),
  );

  readonly publicWikis = computed(() => [
    ...this.liveWikis(),
    ...this.comingSoonWikis(),
  ]);

  readonly liveCount = computed(() => this.liveWikis().length);
  readonly comingSoonCount = computed(() => this.comingSoonWikis().length);

  readonly categories = computed(() => [...PUBLIC_WIKI_CATEGORIES]);

  readonly categoryCounts = computed(() =>
    this.categories().reduce<Record<string, number>>((acc, cat) => {
      acc[cat] = this.publicWikis().filter((wiki) => this.categoryForWiki(wiki) === cat).length;
      return acc;
    }, {}),
  );

  readonly hasFilters = computed(
    () => this.activeCategory() !== CITIES_CATEGORY || this.searchTerm().trim().length > 0,
  );

  readonly filteredWikis = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const cat = this.activeCategory();

    return this.publicWikis().filter((wiki) => {
      const catMatch = this.categoryForWiki(wiki) === cat;
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

  setCategory(cat: PublicWikiCategory): void {
    this.activeCategory.set(cat);
  }

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }

  clearFilters(): void {
    this.activeCategory.set(CITIES_CATEGORY);
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

  private categoryForWiki(wiki: PublicWikiCatalogItem): PublicWikiCategory {
    return wiki.category === 'Cities & Regions' ? CITIES_CATEGORY : OTHERS_CATEGORY;
  }
}
