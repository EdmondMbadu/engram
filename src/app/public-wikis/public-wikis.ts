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
const PUBLIC_WIKI_SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'az', label: 'A-Z' },
  { value: 'population', label: 'Population' },
  { value: 'region', label: 'Region' },
] as const;
type PublicWikiSortMode = (typeof PUBLIC_WIKI_SORTS)[number]['value'];

const GLOBAL_REGION_ORDER = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania', 'Other'];

const COUNTRY_REGION_HINTS: Array<{ region: string; countries: string[] }> = [
  {
    region: 'Africa',
    countries: ['Algeria', 'Democratic Republic of the Congo', 'Egypt', 'Ghana', 'Kenya', 'Morocco', 'Nigeria', 'South Africa'],
  },
  {
    region: 'Americas',
    countries: ['Argentina', 'Brazil', 'Canada', 'Chile', 'Colombia', 'Mexico', 'Peru', 'Puerto Rico', 'Turks and Caicos Islands', 'United States'],
  },
  {
    region: 'Asia',
    countries: ['China', 'India', 'Israel', 'Japan', 'Qatar', 'Singapore', 'South Korea', 'Taiwan', 'Thailand', 'Turkey'],
  },
  {
    region: 'Europe',
    countries: ['Austria', 'Belgium', 'Czech Republic', 'Denmark', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland', 'Italy', 'Netherlands', 'Norway', 'Poland', 'Portugal', 'Spain', 'Sweden', 'United Kingdom'],
  },
  {
    region: 'Oceania',
    countries: ['Australia', 'New Zealand'],
  },
];

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
  readonly activeSort = signal<PublicWikiSortMode>('featured');
  readonly isProductVideoOpen = signal(false);
  readonly productVideoUrl =
    'https://firebasestorage.googleapis.com/v0/b/living-atlas-7622a.firebasestorage.app/o/videos%2FAvatar%20IV%20Video.mp4?alt=media&token=77103de1-4ce4-4be4-8aa2-68f92d94076d';

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
  readonly sortOptions = computed(() => [...PUBLIC_WIKI_SORTS]);

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

    const filtered = this.publicWikis().filter((wiki) => {
      const catMatch = this.categoryForWiki(wiki) === cat;
      if (!catMatch) return false;
      if (!term) return true;

      const haystack = [
        wiki.title,
        wiki.subtitle,
	        wiki.description,
	        wiki.category ?? '',
	        wiki.sources ?? '',
	        wiki.countryLabel ?? '',
	        ...(wiki.badges ?? []),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
    return this.sortWikis(filtered);
  });

  async ngOnInit(): Promise<void> {
    this.isLoadingLiveWikis.set(true);

	    try {
	      const atlases = await this.atlasService.listPublicAtlases();
	      const liveWikis = sortPublicAtlases(atlases).map((atlas) => ({
	        ...buildPublicWikiLiveItem(atlas),
	        countryLabel: this.atlasService.cityCountryLabel(atlas),
	      }));
	      this.liveWikis.set(liveWikis);
    } catch {
      this.liveWikis.set([]);
    } finally {
      this.isLoadingLiveWikis.set(false);
    }
  }

  setCategory(cat: PublicWikiCategory): void {
    this.activeCategory.set(cat);
    if (cat !== CITIES_CATEGORY) {
      this.activeSort.set('featured');
    }
  }

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }

  clearFilters(): void {
    this.activeCategory.set(CITIES_CATEGORY);
    this.searchTerm.set('');
    this.activeSort.set('featured');
  }

  setSort(mode: PublicWikiSortMode): void {
    this.activeSort.set(mode);
  }

  openProductVideo(): void {
    this.isProductVideoOpen.set(true);
  }

  closeProductVideo(): void {
    this.isProductVideoOpen.set(false);
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

  populationLabel(wiki: PublicWikiCatalogItem): string | null {
    if (!wiki.population) {
      return null;
    }
    const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(wiki.population);
    return wiki.populationYear ? `${formatted} (${wiki.populationYear})` : formatted;
  }

  private categoryForWiki(wiki: PublicWikiCatalogItem): PublicWikiCategory {
    return wiki.category === 'Cities & Regions' ? CITIES_CATEGORY : OTHERS_CATEGORY;
  }

  private sortWikis(wikis: PublicWikiCatalogItem[]): PublicWikiCatalogItem[] {
    const sorted = [...wikis];
    switch (this.activeSort()) {
      case 'az':
        return sorted.sort((a, b) => this.titleKey(a).localeCompare(this.titleKey(b)));
      case 'population':
        return sorted.sort((a, b) => {
          const aPopulation = a.population ?? -1;
          const bPopulation = b.population ?? -1;
          if (aPopulation !== bPopulation) return bPopulation - aPopulation;
          return this.titleKey(a).localeCompare(this.titleKey(b));
        });
      case 'region':
        return sorted.sort((a, b) => {
          const aRegion = this.globalRegionForWiki(a);
          const bRegion = this.globalRegionForWiki(b);
          const aIndex = GLOBAL_REGION_ORDER.indexOf(aRegion);
          const bIndex = GLOBAL_REGION_ORDER.indexOf(bRegion);
          if (aIndex !== bIndex) return aIndex - bIndex;
          if (aRegion !== bRegion) return aRegion.localeCompare(bRegion);
          return this.titleKey(a).localeCompare(this.titleKey(b));
        });
      case 'featured':
      default:
        return sorted;
    }
  }

  private titleKey(wiki: PublicWikiCatalogItem): string {
    return wiki.title.replace(/^my living wiki:\s*/i, '').trim().toLowerCase();
  }

  private globalRegionForWiki(wiki: PublicWikiCatalogItem): string {
    const explicit = wiki.globalRegion?.trim();
    if (explicit) {
      return explicit;
    }

    const country = wiki.countryLabel?.trim();
    const match = COUNTRY_REGION_HINTS.find((hint) => country && hint.countries.includes(country));
    return match?.region ?? 'Other';
  }
}
