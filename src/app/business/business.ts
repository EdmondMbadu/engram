import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { BusinessClaimService, type BusinessClaimWorkspaceRecord } from '../business-claim/business-claim.service';
import { businessBadgeEmoji } from '../business-badge-icons';
import { generateQrSvgDataUrl } from '../qr-code';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';
import { AccountMenuComponent } from '../account-menu/account-menu';

type BillingCycle = 'monthly' | 'annual';

type DecalLanguage = {
  code: string;
  flag: string;
  label: string;
  greeting: string;
};

type DecalSize = {
  id: string;
  label: string;
  detail: string;
};

type BadgeIcon = {
  code: string;
  emoji: string;
  label: string;
};

type BusinessFeature = {
  icon: string;
  title: string;
  description: string;
};

type BusinessPlan = {
  name: string;
  description: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  featured?: boolean;
  cta: string;
  features: string[];
};

const BUSINESS_WORKSPACE_PALETTES = [
  'from-[#dffcf7] to-[#fff0b8] text-[#007f7a] border-[#9bd8cf]',
  'from-[#ffe2d7] to-[#dff7ff] text-[#d94d2b] border-[#f2b8a5]',
  'from-[#ddeeff] to-[#daf8c8] text-[#1f62c8] border-[#b7d0f7]',
  'from-[#fff0b8] to-[#f0e4ff] text-[#9a6500] border-[#ebd173]',
  'from-[#daf8c8] to-[#dffcf7] text-[#28853c] border-[#a7dda0]',
  'from-[#f0e4ff] to-[#ddeeff] text-[#7c3ec8] border-[#d4b8f7]',
];

const BUSINESS_CATEGORY_ICON_BY_NAME: Record<string, string> = {
  attraction: 'landmark',
  bakery: 'bread',
  bar: 'cocktail',
  cafe: 'coffee',
  gallery: 'gallery',
  hotel: 'hotel',
  market: 'market',
  restaurant: 'restaurant',
  shop: 'shop',
  store: 'shop',
  venue: 'events',
};

@Component({
  selector: 'app-business',
  imports: [RouterLink, ThemeToggleComponent, WorkspaceSidebarComponent, AccountMenuComponent],
  templateUrl: './business.html',
})
export class BusinessComponent {
  private readonly authService = inject(AuthService);
  private readonly businessClaimService = inject(BusinessClaimService);

  readonly billingCycle = signal<BillingCycle>('monthly');
  readonly isBusinessVideoOpen = signal(false);
  readonly ownedBusinesses = signal<BusinessClaimWorkspaceRecord[]>([]);
  readonly ownedBusinessesLoading = signal(false);
  readonly ownedBusinessesError = signal<string | null>(null);
  readonly deletingBusinessKey = signal<string | null>(null);
  readonly businessName = signal('Brauhaus Schmitz');
  readonly businessNeighborhood = signal('South Street');
  readonly businessCategory = signal('German bierhall');
  readonly businessDescription = signal('Authentic German beer hall, 40+ taps, WC watch parties, private events, and a South Street crowd that wants the real thing.');
  readonly selectedLanguageCodes = signal(['en', 'es', 'de', 'pt', 'fr']);
  readonly selectedDecalSize = signal('window');
  readonly copiedBusinessLink = signal(false);
  readonly businessVideoUrl =
    'https://firebasestorage.googleapis.com/v0/b/living-atlas-7622a.firebasestorage.app/o/videos%2FBusiness%20Welcome%202.mp4?alt=media&token=47615cb9-00b7-4531-bbcd-e2188c6572c2';

  readonly citySignals = ['Philadelphia', 'Austin', 'London', 'Tokyo', 'Nairobi', 'Sao Paulo'];

  readonly decalLanguages: DecalLanguage[] = [
    { code: 'en', flag: '🇺🇸', label: 'English', greeting: 'Hello' },
    { code: 'es', flag: '🇪🇸', label: 'Español', greeting: '¡Hola!' },
    { code: 'de', flag: '🇩🇪', label: 'Deutsch', greeting: 'Guten Tag' },
    { code: 'pt', flag: '🇧🇷', label: 'Português', greeting: 'Olá' },
    { code: 'fr', flag: '🇫🇷', label: 'Français', greeting: 'Bonjour' },
    { code: 'zh', flag: '🇨🇳', label: '中文', greeting: '你好' },
    { code: 'ar', flag: '🇸🇦', label: 'العربية', greeting: 'مرحبا' },
    { code: 'ko', flag: '🇰🇷', label: '한국어', greeting: '안녕' },
  ];

  readonly businessBadgeIcons: BadgeIcon[] = [
    { code: 'hat', emoji: '🎩', label: 'Heritage' },
    { code: 'pretzel', emoji: '🥨', label: 'Pretzel' },
    { code: 'beer', emoji: '🍺', label: 'Beer' },
    { code: 'music', emoji: '🎵', label: 'Live music' },
  ];

  readonly decalSizes: DecalSize[] = [
    { id: 'window', label: 'Window cling 8×10"', detail: 'Best for storefront glass' },
    { id: 'door', label: 'Door decal 5×7"', detail: 'Compact entrance sticker' },
    { id: 'tent', label: 'Table tent 4×6"', detail: 'Countertop or host stand' },
    { id: 'card', label: 'Counter card', detail: 'Small checkout display' },
  ];

  readonly businessCategories = [
    'German bierhall',
    'Restaurant',
    'Cafe',
    'Bar',
    'Bakery',
    'Shop',
    'Gallery',
    'Hotel',
    'Venue',
  ];

  readonly businessChatUrl = computed(() => {
    const name = this.slugify(this.businessName());
    return `livingwiki.com/chat/philly${name ? `?business=${name}` : ''}`;
  });

  readonly businessQrImageUrl = computed(() => generateQrSvgDataUrl(`https://${this.businessChatUrl()}`));

  readonly selectedDecalLanguages = computed(() => {
    const selected = new Set(this.selectedLanguageCodes());
    return this.decalLanguages.filter((language) => selected.has(language.code)).slice(0, 6);
  });

  readonly decalBusinessTitle = computed(() => this.fitBadgeText(this.businessName()).toUpperCase());

  readonly decalDownloadName = computed(() => `${this.slugify(this.businessName()) || 'my-living-wiki'}-decal.svg`);

  readonly decalDownloadHref = computed(() => {
    const svg = this.buildDecalSvg();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  readonly features: BusinessFeature[] = [
    {
      icon: 'storefront',
      title: 'A living business profile',
      description:
        'Tell the story behind the place, keep hours and links current, and give people a richer page than a static directory listing.',
    },
    {
      icon: 'location_on',
      title: 'A pin on the city map',
      description:
        'Show up in the neighborhood context where visitors are already exploring food, culture, jobs, events, and local guides.',
    },
    {
      icon: 'explore',
      title: 'Featured guide placement',
      description:
        'Surface in curated local paths like hidden coffee, founder-friendly blocks, weekend plans, or places locals actually recommend.',
    },
    {
      icon: 'verified',
      title: 'Local Favorite trust badge',
      description:
        'Add a visible signal that this is a real, community-relevant business worth checking before the usual generic results.',
    },
    {
      icon: 'monitoring',
      title: 'Local search insights',
      description:
        'Learn what people are asking around your city so promotions, events, staffing, and inventory can follow actual demand.',
    },
    {
      icon: 'new_releases',
      title: 'Founding-business status',
      description:
        'Plant your flag early in a launch city with launch placement, a founding badge, and a stronger voice in how the wiki grows.',
    },
  ];

  readonly plans: BusinessPlan[] = [
    {
      name: 'Local',
      description: 'Get on the map and start being found around your neighborhood.',
      monthlyPrice: 25,
      annualMonthlyPrice: 20,
      cta: 'Get started',
      features: [
        'Living business profile with story, photos, hours, and links',
        'Neighborhood map placement',
        'Connections to nearby places, guides, and events',
        'Standard setup support',
      ],
    },
    {
      name: 'Local Favorite',
      description: 'Stand out, build trust, and understand what nearby people want.',
      monthlyPrice: 65,
      annualMonthlyPrice: 54,
      featured: true,
      cta: 'Claim your spot',
      features: [
        'Everything in Local',
        'Verified Local Favorite badge',
        'Featured placement in a neighborhood guide',
        'Monthly local-search insight summary',
        'Events and promotions on your profile',
        'Priority support',
      ],
    },
    {
      name: 'City Sponsor',
      description: 'Anchor a city wiki with maximum visibility and deeper insight.',
      monthlyPrice: 180,
      annualMonthlyPrice: 150,
      cta: 'Start a conversation',
      features: [
        'Everything in Local Favorite',
        'Citywide sponsor placement',
        'Discovery and analytics dashboard',
        'Sponsor a neighborhood guide or topic hub',
        'Founding-business launch badge',
        'Dedicated local partner support',
      ],
    },
  ];

  readonly activePlans = computed(() => {
    const annual = this.billingCycle() === 'annual';
    return this.plans.map((plan) => ({
      ...plan,
      price: annual ? plan.annualMonthlyPrice : plan.monthlyPrice,
      cadence: annual ? 'per month, billed annually' : 'per month',
      showStrike: annual && plan.annualMonthlyPrice < plan.monthlyPrice,
    }));
  });
  readonly isSignedIn = this.authService.isAuthenticated;
  readonly ownerEmail = this.authService.email;
  readonly ownedVerifiedCount = computed(
    () => this.ownedBusinesses().filter((business) => business.status === 'verified').length,
  );
  readonly ownedPendingCount = computed(
    () => this.ownedBusinesses().filter((business) => business.status === 'pending').length,
  );

  constructor() {
    effect(() => {
      const uid = this.authService.uid();
      if (!uid) {
        this.ownedBusinesses.set([]);
        this.ownedBusinessesLoading.set(false);
        this.ownedBusinessesError.set(null);
        return;
      }

      void this.loadOwnedBusinesses(uid);
    });
  }

  businessDetailPath(business: BusinessClaimWorkspaceRecord): string {
    return `/business/${business.city_slug}/${business.business_slug}`;
  }

  businessEditPath(business: BusinessClaimWorkspaceRecord): string {
    return `${this.businessDetailPath(business)}/edit`;
  }

  businessStatusLabel(business: BusinessClaimWorkspaceRecord): string {
    switch (business.status) {
      case 'verified':
        return 'Verified';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Pending';
    }
  }

  businessStatusIcon(business: BusinessClaimWorkspaceRecord): string {
    switch (business.status) {
      case 'verified':
        return 'verified';
      case 'rejected':
        return 'warning';
      default:
        return 'pending';
    }
  }

  businessWorkspacePalette(index: number): string {
    return BUSINESS_WORKSPACE_PALETTES[index % BUSINESS_WORKSPACE_PALETTES.length] ?? BUSINESS_WORKSPACE_PALETTES[0];
  }

  businessWorkspaceEmoji(business: BusinessClaimWorkspaceRecord): string {
    const selectedIcon = business.badge_icons?.[0]?.trim();
    if (selectedIcon) {
      return businessBadgeEmoji(selectedIcon);
    }
    const categoryIcon = BUSINESS_CATEGORY_ICON_BY_NAME[this.slugify(business.category || '')];
    return categoryIcon ? businessBadgeEmoji(categoryIcon) : businessBadgeEmoji('local');
  }

  businessLocationLabel(business: BusinessClaimWorkspaceRecord): string {
    return business.business_address || business.preview_url || business.city_name;
  }

  isDeletingBusiness(business: BusinessClaimWorkspaceRecord): boolean {
    return this.deletingBusinessKey() === business.claim_key;
  }

  async deleteBusiness(business: BusinessClaimWorkspaceRecord): Promise<void> {
    if (this.isDeletingBusiness(business)) {
      return;
    }

    const firstConfirmed = window.confirm(
      `Delete "${business.business_name}"?\n\nThis removes the business claim and the business admin request. This cannot be undone.`,
    );
    if (!firstConfirmed) {
      return;
    }

    const typed = window.prompt(
      `To confirm you are really sure, type DELETE ${business.business_name}`,
    );
    if (typed !== `DELETE ${business.business_name}`) {
      this.ownedBusinessesError.set('Business deletion cancelled. The confirmation text did not match.');
      return;
    }

    this.deletingBusinessKey.set(business.claim_key);
    this.ownedBusinessesError.set(null);
    try {
      await this.businessClaimService.deleteBusiness(business.claim_key);
      this.ownedBusinesses.update((items) => items.filter((item) => item.claim_key !== business.claim_key));
    } catch (error) {
      this.ownedBusinessesError.set(error instanceof Error ? error.message : 'Failed to delete this business.');
    } finally {
      this.deletingBusinessKey.set(null);
    }
  }

  setBillingCycle(cycle: BillingCycle): void {
    this.billingCycle.set(cycle);
  }

  onBusinessNameInput(event: Event): void {
    this.businessName.set((event.target as HTMLInputElement).value);
  }

  onBusinessNeighborhoodInput(event: Event): void {
    this.businessNeighborhood.set((event.target as HTMLInputElement).value);
  }

  onBusinessCategoryInput(event: Event): void {
    this.businessCategory.set((event.target as HTMLSelectElement).value);
  }

  onBusinessDescriptionInput(event: Event): void {
    this.businessDescription.set((event.target as HTMLInputElement).value);
  }

  toggleDecalLanguage(code: string): void {
    this.selectedLanguageCodes.update((codes) => {
      if (codes.includes(code)) {
        return codes.length > 1 ? codes.filter((item) => item !== code) : codes;
      }
      return [...codes, code].slice(0, 6);
    });
  }

  selectDecalSize(sizeId: string): void {
    this.selectedDecalSize.set(sizeId);
  }

  orbitTransform(index: number, total: number): string {
    const angle = -90 + (360 / Math.max(total, 1)) * index;
    return `rotate(${angle}deg) translate(6.8rem) rotate(${-angle}deg)`;
  }

  svgOrbitTransform(index: number, total: number, _radius = 176): string {
    const positionsByCount: Record<number, number[][]> = {
      1: [[450, 640]],
      2: [[320, 316], [580, 316]],
      3: [[300, 316], [600, 316], [450, 602]],
      4: [[300, 316], [600, 316], [335, 608], [565, 608]],
      5: [[300, 316], [600, 316], [250, 552], [450, 602], [650, 552]],
      6: [[300, 316], [600, 316], [250, 552], [650, 552], [385, 612], [515, 612]],
    };
    const positions = positionsByCount[Math.min(Math.max(total, 1), 6)] ?? positionsByCount[6];
    const [x, y] = positions[index] ?? positions[0];
    return `translate(${x} ${y})`;
  }

  badgeIconTransform(index: number, total: number): string {
    const positions = total <= 1
      ? [[450, 260]]
      : total === 2
        ? [[224, 450], [676, 450]]
        : total === 3
          ? [[224, 388], [676, 388], [224, 512]]
          : [[224, 382], [676, 382], [224, 518], [676, 518]];
    const [x, y] = positions[index] ?? positions[0];
    return `translate(${x} ${y})`;
  }

  async copyBusinessLink(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(`https://${this.businessChatUrl()}`);
    this.copiedBusinessLink.set(true);
    setTimeout(() => this.copiedBusinessLink.set(false), 1600);
  }

  openBusinessVideo(): void {
    this.isBusinessVideoOpen.set(true);
  }

  closeBusinessVideo(): void {
    this.isBusinessVideoOpen.set(false);
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  private escapeSvg(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private fitBadgeText(value: string): string {
    const clean = value.trim() || 'Your business';
    return clean.length > 26 ? `${clean.slice(0, 23).trim()}...` : clean;
  }

  private buildDecalSvg(): string {
    const business = this.escapeSvg(this.businessName() || 'Your business');
    const category = this.escapeSvg(this.businessCategory());
    const url = this.escapeSvg(this.businessChatUrl());
    const qrUrl = this.escapeSvg(this.businessQrImageUrl());
    const languages = this.selectedDecalLanguages();
    const greetings = languages.map((language, index) => {
      const x = index % 2 === 0 ? 55 : 310;
      const y = 140 + Math.floor(index / 2) * 62;
      return `<text x="${x}" y="${y}" font-size="30" font-weight="800" fill="${index % 3 === 0 ? '#176a3a' : index % 3 === 1 ? '#1f66b1' : '#9f3a2c'}">${this.escapeSvg(language.greeting)}</text>`;
    }).join('');
    const flags = languages.map((language, index) => {
      const positions = [[760, 92], [930, 180], [930, 312], [760, 398], [590, 312], [590, 180]];
      const [x, y] = positions[index] ?? [760, 108];
      return `<circle cx="${x}" cy="${y}" r="38" fill="#fff" stroke="#cfe3d2" stroke-width="3"/><text x="${x}" y="${y + 10}" text-anchor="middle" font-size="28">${language.flag}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="640" viewBox="0 0 1000 640">
      <rect width="1000" height="640" rx="26" fill="#f2faf5"/>
      <rect x="18" y="18" width="964" height="70" rx="10" fill="#dfeee3"/>
      <rect x="36" y="34" width="42" height="42" rx="10" fill="#1e8f45"/>
      <text x="98" y="65" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="900" fill="#092616">${business}</text>
      <rect x="618" y="34" width="42" height="42" rx="10" fill="#1e8f45"/>
      <text x="676" y="65" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="900" fill="#092616">LivingWiki · <tspan fill="#1e8f45">Philly</tspan></text>
      ${greetings}
      <g transform="translate(210 192)">
        <rect x="0" y="0" width="118" height="184" rx="32" fill="#071b10"/>
        <rect x="15" y="18" width="88" height="148" rx="24" fill="#ffffff"/>
        <rect x="42" y="9" width="34" height="6" rx="3" fill="#ffffff" opacity="0.24"/>
        <circle cx="59" cy="84" r="36" fill="#e7f6ec"/>
        <path d="M59 56c10 0 18 8 18 18v10c0 10-8 18-18 18s-18-8-18-18V74c0-10 8-18 18-18z" fill="#1e8f45"/>
        <path d="M36 84c0 13 10 24 23 24s23-11 23-24" fill="none" stroke="#1e8f45" stroke-width="8" stroke-linecap="round"/>
        <path d="M59 108v16M44 124h30" fill="none" stroke="#1e8f45" stroke-width="8" stroke-linecap="round"/>
        <rect x="34" y="137" width="50" height="8" rx="4" fill="#cfe3d2"/>
      </g>
      <rect x="126" y="184" width="118" height="42" rx="21" fill="#ffffff" stroke="#cfe3d2" stroke-width="2"/>
      <text x="185" y="214" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="900" fill="#176a3a">Hello</text>
      <rect x="320" y="248" width="112" height="42" rx="21" fill="#ffffff" stroke="#d9e4ff" stroke-width="2"/>
      <text x="376" y="278" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="900" fill="#1f66b1">Hola</text>
      <rect x="120" y="330" width="122" height="42" rx="21" fill="#ffffff" stroke="#ffe0d5" stroke-width="2"/>
      <text x="181" y="360" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="900" fill="#9f3a2c">Hallo</text>
      <circle cx="760" cy="245" r="214" fill="none" stroke="#b9d9c0" stroke-width="3" stroke-dasharray="6 7"/>
      <rect x="645" y="130" width="230" height="230" rx="16" fill="#ffffff" stroke="#d8eadc" stroke-width="2"/>
      <image href="${qrUrl}" x="672" y="157" width="176" height="176" preserveAspectRatio="xMidYMid meet"/>
      ${flags}
      <line x1="32" y1="500" x2="968" y2="500" stroke="#cfe3d2" stroke-width="2"/>
      <rect x="344" y="526" width="312" height="56" rx="28" fill="#ffffff" stroke="#cfe3d2" stroke-width="2"/>
      <text x="500" y="563" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="900" fill="#1e8f45">phone → mic → chat</text>
      <text x="500" y="618" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="900" fill="#1e8f45">${url}</text>
      <text x="36" y="610" font-family="Inter, Arial, sans-serif" font-size="18" fill="#456252">${category}</text>
    </svg>`;
  }

  private async loadOwnedBusinesses(uid: string): Promise<void> {
    this.ownedBusinessesLoading.set(true);
    this.ownedBusinessesError.set(null);
    try {
      this.ownedBusinesses.set(await this.businessClaimService.listByOwner(uid));
    } catch (error) {
      this.ownedBusinesses.set([]);
      this.ownedBusinessesError.set(
        error instanceof Error ? error.message : 'Failed to load your businesses.',
      );
    } finally {
      this.ownedBusinessesLoading.set(false);
    }
  }
}
