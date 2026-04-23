import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { PUBLIC_WIKI_CATALOG } from '../public-wiki-catalog';

const ALL_CATEGORIES = 'All';

@Component({
  selector: 'app-public-wikis',
  imports: [RouterLink, ThemeToggleComponent, FormsModule],
  templateUrl: './public-wikis.html',
})
export class PublicWikisComponent {
  readonly publicWikis = PUBLIC_WIKI_CATALOG;
  readonly featuredWikis = this.publicWikis.filter((wiki) => wiki.status === 'live').slice(0, 3);
  readonly liveCount = this.publicWikis.filter((wiki) => wiki.status === 'live').length;
  readonly comingSoonCount = this.publicWikis.filter((wiki) => wiki.status === 'coming-soon').length;

  readonly categories = [
    ALL_CATEGORIES,
    ...Array.from(
      new Set(this.publicWikis.map((wiki) => wiki.category).filter((cat): cat is string => !!cat)),
    ).sort(),
  ];

  readonly activeCategory = signal<string>(ALL_CATEGORIES);
  readonly searchTerm = signal<string>('');

  readonly categoryCounts = this.categories.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = cat === ALL_CATEGORIES
      ? this.publicWikis.length
      : this.publicWikis.filter((wiki) => wiki.category === cat).length;
    return acc;
  }, {});

  readonly filteredWikis = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const cat = this.activeCategory();
    return this.publicWikis.filter((wiki) => {
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
}
