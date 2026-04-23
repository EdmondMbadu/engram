import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AtlasService } from '../atlas.service';
import { buildPublicWikiLiveItem, type PublicWikiCatalogItem, sortPublicAtlases } from '../public-wiki-catalog';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { AtlasAnimationComponent } from './atlas-animation/atlas-animation';
import { GraphAnimationComponent } from './atlas-animation/graph-animation';

@Component({
  selector: 'app-marketing',
  imports: [RouterLink, ThemeToggleComponent, AtlasAnimationComponent, GraphAnimationComponent],
  templateUrl: './marketing.html',
})
export class MarketingComponent implements OnInit {
  private readonly atlasService = inject(AtlasService);

  navItems = [
    { label: 'Public Wikis', href: '#public-wikis' },
    { label: 'Features', href: '#features' },
    { label: 'Security', href: '#security' },
    { label: 'Pricing', href: '#pricing' },
  ];

  readonly publicWikis = signal<PublicWikiCatalogItem[]>([]);
  readonly isLoadingPublicWikis = signal(true);
  readonly featuredPublicWikis = computed(() => this.publicWikis().slice(0, 3));

  workflowSteps = [
    {
      title: 'Reading document',
      description: 'PDFs, Whitepapers, and Code repositories analyzed.',
      icon: 'upload_file',
    },
    {
      title: 'Extracting knowledge',
      description: 'Semantic entities and logic chains mapped in real-time.',
      icon: 'psychology',
    },
    {
      title: 'Updating wiki',
      description: 'Your private encyclopedia evolves with every page read.',
      icon: 'account_tree',
    },
    {
      title: 'Done',
      description: 'Instantly queryable, forever stored in your Living Wiki.',
      icon: 'check_circle',
    },
  ];

  trustMarks = ['PHAROS_GENOMICS', 'QUANTUM_SYS', 'NEURO_LABS', 'VANTAGE_TECH'];

  securityPoints = [
    'Private context isolation by default.',
    'Explicit provenance for every generated insight.',
    'SOC2 Type II compliance ready architecture.',
    'Encrypted at rest and in transit.',
  ];

  async ngOnInit(): Promise<void> {
    this.isLoadingPublicWikis.set(true);

    try {
      const atlases = await this.atlasService.listPublicAtlases();
      this.publicWikis.set(sortPublicAtlases(atlases).map((atlas) => buildPublicWikiLiveItem(atlas)));
    } catch {
      this.publicWikis.set([]);
    } finally {
      this.isLoadingPublicWikis.set(false);
    }
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
