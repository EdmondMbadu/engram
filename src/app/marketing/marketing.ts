import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AtlasService } from '../atlas.service';
import { buildPublicWikiLiveItem, type PublicWikiCatalogItem, sortPublicAtlases } from '../public-wiki-catalog';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { AccountMenuComponent } from '../account-menu/account-menu';
import { AtlasAnimationComponent } from './atlas-animation/atlas-animation';
import { GraphAnimationComponent } from './atlas-animation/graph-animation';

@Component({
  selector: 'app-marketing',
  imports: [
    RouterLink,
    ThemeToggleComponent,
    AccountMenuComponent,
    AtlasAnimationComponent,
    GraphAnimationComponent,
  ],
  templateUrl: './marketing.html',
})
export class MarketingComponent implements OnInit {
  private readonly atlasService = inject(AtlasService);

  navItems = [
    { label: $localize`Public Wikis`, href: '#public-wikis' },
    { label: $localize`Features`, href: '#features' },
    { label: $localize`Security`, href: '#security' },
    { label: $localize`Pricing`, href: '#pricing' },
  ];

  readonly isProductVideoOpen = signal(false);
  readonly productVideoUrl =
    'https://firebasestorage.googleapis.com/v0/b/living-atlas-7622a.firebasestorage.app/o/videos%2FAvatar%20Video.mp4?alt=media&token=6898fe99-71fe-49dc-af66-0467e816de87';

  readonly publicWikis = signal<PublicWikiCatalogItem[]>([]);
  readonly isLoadingPublicWikis = signal(true);
  readonly featuredPublicWikis = computed(() => this.publicWikis().slice(0, 3));

  workflowSteps = [
    {
      title: $localize`Reading document`,
      description: $localize`PDFs, Whitepapers, and Code repositories analyzed.`,
      icon: 'upload_file',
    },
    {
      title: $localize`Extracting knowledge`,
      description: $localize`Semantic entities and logic chains mapped in real-time.`,
      icon: 'psychology',
    },
    {
      title: $localize`Updating wiki`,
      description: $localize`Your private encyclopedia evolves with every page read.`,
      icon: 'account_tree',
    },
    {
      title: $localize`Done`,
      description: $localize`Instantly queryable, forever stored in your LivingWiki.`,
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

  openProductVideo(): void {
    this.isProductVideoOpen.set(true);
  }

  closeProductVideo(): void {
    this.isProductVideoOpen.set(false);
  }
}
