import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

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

@Component({
  selector: 'app-business',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './business.html',
})
export class BusinessComponent {
  readonly billingCycle = signal<BillingCycle>('monthly');
  readonly isBusinessVideoOpen = signal(false);
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
    return `mylivingwiki.com/philly${name ? `?business=${name}` : ''}`;
  });

  readonly businessQrImageUrl = computed(() =>
    `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=18&data=${encodeURIComponent(`https://${this.businessChatUrl()}`)}`,
  );

  readonly selectedDecalLanguages = computed(() => {
    const selected = new Set(this.selectedLanguageCodes());
    return this.decalLanguages.filter((language) => selected.has(language.code)).slice(0, 6);
  });

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
      <text x="676" y="65" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="900" fill="#092616">Living Wiki · <tspan fill="#1e8f45">Philly</tspan></text>
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
}
