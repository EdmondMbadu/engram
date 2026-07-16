import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

type FenceLineCategory = 'waste' | 'water' | 'petrochemical' | 'legacy';
type FenceLineStatus = 'Active Fight' | 'Ongoing Crisis' | 'Ongoing Recovery' | 'Victory Won' | 'Cautionary Tale' | 'Movement Anchor' | 'Settlement Won';

const FENCE_LINE_SHARE_URL = 'https://livingwiki.com/fence-line';

interface FenceLineCommunity {
  id: string;
  name: string;
  place: string;
  state: string;
  category: FenceLineCategory;
  status: FenceLineStatus;
  issue: string;
  summary: string;
  keyStat: string;
  indicators: Array<{ label: string; value: number }>;
  x: number;
  y: number;
}

const CATEGORY_LABELS: Record<FenceLineCategory, string> = {
  waste: 'Incinerator & waste kin',
  water: 'Water crisis',
  petrochemical: 'Petrochemical fencelines',
  legacy: 'Legacy contamination',
};

const CATEGORY_SHORT_LABELS: Record<FenceLineCategory, string> = {
  waste: 'Waste',
  water: 'Water',
  petrochemical: 'Petrochemical',
  legacy: 'Legacy',
};

const CATEGORY_ICONS: Record<FenceLineCategory, string> = {
  waste: 'local_fire_department',
  water: 'water_drop',
  petrochemical: 'factory',
  legacy: 'warning',
};

const COMMUNITIES: FenceLineCommunity[] = [
  {
    id: 'chester',
    name: 'Chester',
    place: 'Delaware River',
    state: 'Pennsylvania',
    category: 'waste',
    status: 'Active Fight',
    issue: $localize`Largest U.S. trash incinerator`,
    summary:
      $localize`A majority-Black city of roughly 33,000 hosts Reworld Delaware Valley, burning regional waste shipped from Philadelphia, New Jersey, and New York City.`,
    keyStat: $localize`Up to 3,500 tons per day, with Philadelphia waste contracts expiring June 30, 2026.`,
    indicators: [
      { label: $localize`PM2.5 percentile`, value: 89 },
      { label: $localize`Low income percentile`, value: 86 },
    ],
    x: 72,
    y: 32,
  },
  {
    id: 'camden',
    name: 'Camden',
    place: 'Waterfront South',
    state: 'New Jersey',
    category: 'waste',
    status: 'Active Fight',
    issue: $localize`Incinerator and sewage burden`,
    summary:
      $localize`A Covanta/Reworld incinerator, regional sewage plant, and scrap-metal operations stack into one poor, majority-minority neighborhood.`,
    keyStat: $localize`Same operator as Chester's incinerator: one company, two fencelines.`,
    indicators: [
      { label: $localize`PM2.5 percentile`, value: 88 },
      { label: $localize`Low income percentile`, value: 92 },
    ],
    x: 73,
    y: 33,
  },
  {
    id: 'newark',
    name: 'Newark',
    place: 'Ironbound',
    state: 'New Jersey',
    category: 'waste',
    status: 'Active Fight',
    issue: $localize`Imported waste and port pollution`,
    summary:
      $localize`The Essex County incinerator burns much of New York City's trash in a dense immigrant neighborhood ringed by airport, port, and chemical plants.`,
    keyStat: $localize`New Jersey cumulative-impact law grew from fights like this one.`,
    indicators: [
      { label: $localize`PM2.5 percentile`, value: 90 },
      { label: $localize`Low income percentile`, value: 85 },
    ],
    x: 75,
    y: 30,
  },
  {
    id: 'baltimore',
    name: 'Baltimore',
    place: 'Curtis Bay',
    state: 'Maryland',
    category: 'waste',
    status: 'Active Fight',
    issue: $localize`Incinerator and coal export`,
    summary:
      $localize`Home to the WIN Waste incinerator and an open-air coal export terminal; student organizers defeated a proposed second incinerator.`,
    keyStat: $localize`Community air monitoring documented coal dust on homes and playgrounds.`,
    indicators: [
      { label: $localize`PM2.5 percentile`, value: 86 },
      { label: $localize`Low income percentile`, value: 83 },
    ],
    x: 70,
    y: 36,
  },
  {
    id: 'detroit',
    name: 'Detroit',
    place: '48217 / Boynton',
    state: 'Michigan',
    category: 'waste',
    status: 'Victory Won',
    issue: $localize`Closed municipal incinerator`,
    summary:
      $localize`Michigan residents fought a giant incinerator for decades until it closed in 2019, proving fenceline organizing can win.`,
    keyStat: $localize`Incinerator closed in 2019 after more than 30 years of community pressure.`,
    indicators: [
      { label: $localize`PM2.5 percentile`, value: 84 },
      { label: $localize`Low income percentile`, value: 88 },
    ],
    x: 61,
    y: 29,
  },
  {
    id: 'harrisburg',
    name: 'Harrisburg',
    place: 'Capital city',
    state: 'Pennsylvania',
    category: 'waste',
    status: 'Cautionary Tale',
    issue: $localize`Incinerator debt`,
    summary:
      $localize`Pennsylvania's capital was driven into municipal bankruptcy by incinerator debt: the economic-justice chapter of the same story.`,
    keyStat: $localize`Roughly $300M in incinerator debt pushed the city into state receivership.`,
    indicators: [
      { label: $localize`PM2.5 percentile`, value: 74 },
      { label: $localize`Low income percentile`, value: 81 },
    ],
    x: 70,
    y: 32,
  },
  {
    id: 'south-bronx',
    name: 'South Bronx',
    place: 'Mott Haven-Hunts Point',
    state: 'New York',
    category: 'waste',
    status: 'Active Fight',
    issue: $localize`Waste, diesel, and peaker plants`,
    summary:
      $localize`Asthma Alley concentrates waste transfer stations, peaker power plants, and relentless truck traffic in one of the poorest congressional districts.`,
    keyStat: $localize`Asthma hospitalization rates are among the highest in the U.S.`,
    indicators: [
      { label: $localize`PM2.5 percentile`, value: 91 },
      { label: $localize`Low income percentile`, value: 94 },
    ],
    x: 76,
    y: 28,
  },
  {
    id: 'flint',
    name: 'Flint',
    place: 'Municipal water system',
    state: 'Michigan',
    category: 'water',
    status: 'Ongoing Recovery',
    issue: $localize`Lead in drinking water`,
    summary:
      $localize`The lead-in-water crisis became a national symbol of environmental injustice and of how long recovery takes for a poor, majority-Black city.`,
    keyStat: $localize`The 2014 water switch exposed roughly 100,000 residents to lead.`,
    indicators: [
      { label: $localize`PM2.5 percentile`, value: 62 },
      { label: $localize`Low income percentile`, value: 93 },
    ],
    x: 60,
    y: 27,
  },
  {
    id: 'jackson',
    name: 'Jackson',
    place: 'State capital',
    state: 'Mississippi',
    category: 'water',
    status: 'Ongoing Crisis',
    issue: $localize`System-wide water failure`,
    summary:
      $localize`A majority-Black state capital experienced boil-water notices, pressure losses, and a federally appointed manager to rebuild the system.`,
    keyStat: $localize`The 2022 collapse left roughly 150,000 people without reliable water.`,
    indicators: [
      { label: $localize`PM2.5 percentile`, value: 58 },
      { label: $localize`Low income percentile`, value: 90 },
    ],
    x: 55,
    y: 65,
  },
  {
    id: 'benton-harbor',
    name: 'Benton Harbor',
    place: 'Lake Michigan',
    state: 'Michigan',
    category: 'water',
    status: 'Ongoing Recovery',
    issue: $localize`Lead service lines`,
    summary:
      $localize`Years of elevated lead and delayed official response made the small, poor, majority-Black city Flint's quieter echo.`,
    keyStat: $localize`Lead service lines were replaced city-wide after resident petitions to EPA.`,
    indicators: [
      { label: $localize`PM2.5 percentile`, value: 55 },
      { label: $localize`Low income percentile`, value: 95 },
    ],
    x: 56,
    y: 34,
  },
  {
    id: 'lowndes',
    name: 'Lowndes County',
    place: 'Black Belt',
    state: 'Alabama',
    category: 'water',
    status: 'Settlement Won',
    issue: $localize`Wastewater and sanitation`,
    summary:
      $localize`Raw sewage pooled in yards from failing septic systems, leading to a landmark environmental-justice civil rights settlement.`,
    keyStat: $localize`First DOJ environmental-justice settlement under the Civil Rights Act in 2023.`,
    indicators: [
      { label: $localize`PM2.5 percentile`, value: 48 },
      { label: $localize`Low income percentile`, value: 96 },
    ],
    x: 58,
    y: 70,
  },
  {
    id: 'st-james',
    name: 'St. James Parish',
    place: 'Cancer Alley',
    state: 'Louisiana',
    category: 'petrochemical',
    status: 'Active Fight',
    issue: $localize`Petrochemical corridor`,
    summary:
      $localize`The Mississippi River corridor between Baton Rouge and New Orleans carries some of the highest air-toxics cancer risk in America.`,
    keyStat: $localize`Some census tracts rank at the extreme top of U.S. cancer-risk estimates.`,
    indicators: [
      { label: $localize`Air toxics percentile`, value: 99 },
      { label: $localize`Low income percentile`, value: 87 },
    ],
    x: 51,
    y: 74,
  },
  {
    id: 'port-arthur',
    name: 'Port Arthur',
    place: 'Refinery row',
    state: 'Texas',
    category: 'petrochemical',
    status: 'Active Fight',
    issue: $localize`Refineries and LNG expansion`,
    summary:
      $localize`Historically Black neighborhoods sit beside some of the largest oil refineries in the Western Hemisphere, with LNG expansion on the horizon.`,
    keyStat: $localize`Refinery row sits directly across the street from public housing.`,
    indicators: [
      { label: $localize`Air toxics percentile`, value: 93 },
      { label: $localize`Low income percentile`, value: 89 },
    ],
    x: 43,
    y: 76,
  },
  {
    id: 'houston',
    name: 'Houston',
    place: 'Manchester',
    state: 'Texas',
    category: 'petrochemical',
    status: 'Active Fight',
    issue: $localize`Ship Channel pollution`,
    summary:
      $localize`A small Latino neighborhood is boxed in by refineries, the Ship Channel, and freight rail: a textbook fenceline geography.`,
    keyStat: $localize`Bounded by a refinery, freeway, and the busiest petrochemical port in the U.S.`,
    indicators: [
      { label: $localize`Air toxics percentile`, value: 95 },
      { label: $localize`Low income percentile`, value: 84 },
    ],
    x: 42,
    y: 74,
  },
  {
    id: 'wilmington',
    name: 'Wilmington',
    place: 'Los Angeles Harbor',
    state: 'California',
    category: 'petrochemical',
    status: 'Active Fight',
    issue: $localize`Refineries, port diesel, oil wells`,
    summary:
      $localize`The densest refinery concentration in the Los Angeles region is layered with port diesel pollution and active oil drilling between homes.`,
    keyStat: $localize`Part of the LA/Long Beach port corridor often described as a diesel death zone.`,
    indicators: [
      { label: $localize`Air toxics percentile`, value: 92 },
      { label: $localize`Low income percentile`, value: 86 },
    ],
    x: 11,
    y: 58,
  },
  {
    id: 'institute',
    name: 'Institute',
    place: 'Chemical Valley',
    state: 'West Virginia',
    category: 'petrochemical',
    status: 'Active Fight',
    issue: $localize`Chemical plants and incidents`,
    summary:
      $localize`A historically Black community beside major Kanawha Valley chemical plants with a long record of leaks, explosions, and shelter-in-place orders.`,
    keyStat: $localize`Decades of chemical incidents at the plant next door.`,
    indicators: [
      { label: $localize`Air toxics percentile`, value: 90 },
      { label: $localize`Low income percentile`, value: 72 },
    ],
    x: 65,
    y: 45,
  },
  {
    id: 'north-birmingham',
    name: 'North Birmingham',
    place: '35th Avenue',
    state: 'Alabama',
    category: 'petrochemical',
    status: 'Active Fight',
    issue: $localize`Coke plants and Superfund`,
    summary:
      $localize`Coke plants and the 35th Avenue Superfund site were joined by a bribery scandal aimed at suppressing the cleanup residents demanded.`,
    keyStat: $localize`Executives were convicted for bribing a legislator to fight EPA listing.`,
    indicators: [
      { label: $localize`Air toxics percentile`, value: 88 },
      { label: $localize`Low income percentile`, value: 91 },
    ],
    x: 59,
    y: 66,
  },
  {
    id: 'east-chicago',
    name: 'East Chicago',
    place: 'West Calumet',
    state: 'Indiana',
    category: 'legacy',
    status: 'Ongoing Recovery',
    issue: $localize`Lead and arsenic Superfund site`,
    summary:
      $localize`Residents discovered they were living on top of the USS Lead Superfund site and were then displaced from their homes.`,
    keyStat: $localize`Roughly 1,000 residents relocated after lead and arsenic were found in yards.`,
    indicators: [
      { label: $localize`Lead risk percentile`, value: 94 },
      { label: $localize`Low income percentile`, value: 90 },
    ],
    x: 55,
    y: 37,
  },
  {
    id: 'gary',
    name: 'Gary',
    place: 'Steel corridor',
    state: 'Indiana',
    category: 'legacy',
    status: 'Active Fight',
    issue: $localize`Steel legacy pollution`,
    summary:
      $localize`A century of steel industry pollution and decades of disinvestment burden a majority-Black city built by heavy industry.`,
    keyStat: $localize`Steel legacy pollution layered over deep economic decline.`,
    indicators: [
      { label: $localize`PM2.5 percentile`, value: 82 },
      { label: $localize`Low income percentile`, value: 92 },
    ],
    x: 55,
    y: 36,
  },
  {
    id: 'uniontown',
    name: 'Uniontown',
    place: 'Black Belt',
    state: 'Alabama',
    category: 'legacy',
    status: 'Active Fight',
    issue: $localize`Coal ash dumping`,
    summary:
      $localize`A small Black Belt town received millions of tons of coal ash from the TVA Kingston spill, shipped from a wealthier county into a poorer one.`,
    keyStat: $localize`Roughly 4 million tons of coal ash landfilled beside the community.`,
    indicators: [
      { label: $localize`Waste proximity percentile`, value: 97 },
      { label: $localize`Low income percentile`, value: 95 },
    ],
    x: 58,
    y: 69,
  },
  {
    id: 'kettleman-city',
    name: 'Kettleman City',
    place: 'San Joaquin Valley',
    state: 'California',
    category: 'legacy',
    status: 'Active Fight',
    issue: $localize`Hazardous waste landfill`,
    summary:
      $localize`A farmworker town beside one of the West's largest hazardous waste landfills also faces pesticide drift and unsafe drinking water.`,
    keyStat: $localize`Hazardous waste landfill, pesticides, and water insecurity in one town.`,
    indicators: [
      { label: $localize`Waste proximity percentile`, value: 96 },
      { label: $localize`Low income percentile`, value: 93 },
    ],
    x: 13,
    y: 47,
  },
  {
    id: 'chicago-altgeld',
    name: 'Chicago',
    place: 'Altgeld Gardens',
    state: 'Illinois',
    category: 'legacy',
    status: 'Movement Anchor',
    issue: $localize`Toxic doughnut`,
    summary:
      $localize`Hazel Johnson named the ring of landfills and factories around this public housing community and helped found the environmental justice movement here.`,
    keyStat: $localize`Widely recognized as a birthplace of environmental justice organizing.`,
    indicators: [
      { label: $localize`Waste proximity percentile`, value: 89 },
      { label: $localize`Low income percentile`, value: 94 },
    ],
    x: 55,
    y: 36,
  },
  {
    id: 'africatown',
    name: 'Africatown',
    place: 'Mobile',
    state: 'Alabama',
    category: 'legacy',
    status: 'Active Fight',
    issue: $localize`Industrial legacy and heritage`,
    summary:
      $localize`Founded by survivors of the last known slave ship, the Clotilda, and later encircled by paper mills and heavy industry.`,
    keyStat: $localize`A national heritage site living inside an industrial zone.`,
    indicators: [
      { label: $localize`Air toxics percentile`, value: 85 },
      { label: $localize`Low income percentile`, value: 91 },
    ],
    x: 58,
    y: 74,
  },
];

@Component({
  selector: 'app-fence-line',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './fence-line.html',
  styleUrl: './fence-line.css',
})
export class FenceLineComponent {
  readonly communities = COMMUNITIES;
  readonly categories = Object.keys(CATEGORY_LABELS) as FenceLineCategory[];
  readonly statuses = [
    'All',
    'Active Fight',
    'Ongoing Crisis',
    'Ongoing Recovery',
    'Victory Won',
    'Cautionary Tale',
    'Movement Anchor',
    'Settlement Won',
  ] as const;

  readonly searchTerm = signal('');
  readonly activeCategory = signal<'all' | FenceLineCategory>('all');
  readonly activeStatus = signal<'All' | FenceLineStatus>('All');
  readonly selectedId = signal('chester');
  readonly copied = signal(false);
  readonly phillyChatUrl = 'https://livingwiki.com/chat/philadelphia';

  readonly filteredCommunities = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const category = this.activeCategory();
    const status = this.activeStatus();

    return this.communities.filter((community) => {
      const matchesCategory = category === 'all' || community.category === category;
      const matchesStatus = status === 'All' || community.status === status;
      const haystack = [
        community.name,
        community.place,
        community.state,
        community.issue,
        community.status,
        this.categoryLabel(community.category),
      ]
        .join(' ')
        .toLowerCase();

      return matchesCategory && matchesStatus && (!query || haystack.includes(query));
    });
  });

  readonly selectedCommunity = computed(() => {
    const selected = this.communities.find((community) => community.id === this.selectedId());
    return selected ?? this.filteredCommunities()[0] ?? this.communities[0];
  });

  readonly filteredAverageBurden = computed(() => {
    const values = this.filteredCommunities().flatMap((community) =>
      community.indicators.map((indicator) => indicator.value),
    );

    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  });

  readonly activeFightCount = computed(
    () => this.filteredCommunities().filter((community) => community.status === 'Active Fight').length,
  );

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
    this.ensureSelectedVisible();
  }

  setCategory(category: 'all' | FenceLineCategory): void {
    this.activeCategory.set(category);
    this.ensureSelectedVisible();
  }

  setStatus(status: 'All' | FenceLineStatus): void {
    this.activeStatus.set(status);
    this.ensureSelectedVisible();
  }

  resetFilters(): void {
    this.searchTerm.set('');
    this.activeCategory.set('all');
    this.activeStatus.set('All');
    this.selectedId.set('chester');
  }

  selectCommunity(id: string): void {
    this.selectedId.set(id);
  }

  categoryLabel(category: FenceLineCategory): string {
    return CATEGORY_LABELS[category];
  }

  categoryShortLabel(category: FenceLineCategory): string {
    return CATEGORY_SHORT_LABELS[category];
  }

  categoryIcon(category: FenceLineCategory): string {
    return CATEGORY_ICONS[category];
  }

  categoryCount(category: FenceLineCategory): number {
    return this.communities.filter((community) => community.category === category).length;
  }

  async copyShareLink(): Promise<void> {
    await this.writeShareText(FENCE_LINE_SHARE_URL);
    this.copied.set(true);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => this.copied.set(false), 1800);
    }
  }

  private async writeShareText(url: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        return;
      } catch {
        // Fall back to the selection-based copy path below.
      }
    }

    if (typeof document === 'undefined') return;

    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  private ensureSelectedVisible(): void {
    const visible = this.filteredCommunities();
    if (!visible.some((community) => community.id === this.selectedId()) && visible[0]) {
      this.selectedId.set(visible[0].id);
    }
  }
}
