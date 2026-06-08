import { Component, computed, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../auth.service';
import { BusinessClaimService, type BusinessClaimWorkspaceRecord, type BusinessClaimWorkspaceUpdate, type BusinessImageKind } from '../business-claim/business-claim.service';
import { generateQrSvgDataUrl } from '../qr-code';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

type BusinessEditDraft = {
  business_address: string;
  category: string;
  admin_name: string;
  admin_email: string;
  guide_prompt: string;
  badge_icons: string;
  logo_url: string;
  profile_image_url: string;
  cover_image_url: string;
};

@Component({
  selector: 'app-business-edit',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './business-edit.html',
})
export class BusinessEditComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  readonly authService = inject(AuthService);
  private readonly businessClaimService = inject(BusinessClaimService);

  private readonly routeParams = toSignal(
    this.route.paramMap.pipe(map((params) => ({
      citySlug: params.get('citySlug')?.trim() || '',
      businessSlug: params.get('businessSlug')?.trim() || '',
    }))),
    { initialValue: { citySlug: '', businessSlug: '' } },
  );

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly savedMessage = signal<string | null>(null);
  readonly uploadingImage = signal<BusinessImageKind | null>(null);
  readonly business = signal<BusinessClaimWorkspaceRecord | null>(null);
  readonly draft = signal<BusinessEditDraft>(this.emptyDraft());

  readonly claimKey = computed(() => {
    const params = this.routeParams();
    return params.citySlug && params.businessSlug ? `${params.citySlug}__${params.businessSlug}` : '';
  });
  readonly detailPath = computed(() => `/business/${this.routeParams().citySlug}/${this.routeParams().businessSlug}`);
  readonly chatPath = computed(() => `/chat/${this.routeParams().citySlug}`);
  readonly businessName = computed(() => this.business()?.business_name || this.titleizeSlug(this.routeParams().businessSlug || 'business'));
  readonly cityName = computed(() => this.business()?.city_name || this.titleizeSlug(this.routeParams().citySlug || 'city'));
  readonly businessInitial = computed(() => (this.businessName().trim()[0] || 'B').toUpperCase());
  readonly ownerCanEdit = computed(() => !!this.authService.uid() && this.business()?.owner_user_id === this.authService.uid());
  readonly detailUrl = computed(() => `${this.origin()}${this.detailPath()}`);
  readonly chatUrl = computed(() => `${this.origin()}${this.chatPath()}?business=${encodeURIComponent(this.routeParams().businessSlug)}`);
  readonly badgeSvg = computed(() => this.buildBadgeSvg());
  readonly badgeSvgHref = computed(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.badgeSvg())}`);
  readonly badgeSvgFilename = computed(() => `${this.routeParams().businessSlug || 'business'}-${this.routeParams().citySlug || 'city'}-badge.svg`);
  readonly badgePngFilename = computed(() => `${this.routeParams().businessSlug || 'business'}-${this.routeParams().citySlug || 'city'}-badge.png`);
  readonly selectedIconCodes = computed(() => this.draft().badge_icons.split(',').map((icon) => icon.trim()).filter(Boolean).slice(0, 3));

  readonly iconOptions = [
    'beer',
    'coffee',
    'restaurant',
    'music',
    'market',
    'shop',
    'hotel',
    'gallery',
    'bakery',
    'cocktail',
    'service',
    'local',
  ];

  constructor() {
    effect(() => {
      const claimKey = this.claimKey();
      if (!claimKey) {
        return;
      }
      void this.loadBusiness(claimKey);
    });
    effect(() => {
      this.title.setTitle(`Edit ${this.businessName()} | My Living Wiki`);
    });
  }

  updateDraft(field: keyof BusinessEditDraft, value: string): void {
    this.draft.update((current) => ({ ...current, [field]: value }));
    this.savedMessage.set(null);
  }

  toggleIcon(code: string): void {
    const current = this.selectedIconCodes();
    const next = current.includes(code)
      ? current.filter((item) => item !== code)
      : [...current, code].slice(0, 3);
    this.updateDraft('badge_icons', next.join(', '));
  }

  iconSelected(code: string): boolean {
    return this.selectedIconCodes().includes(code);
  }

  imageUploading(kind: BusinessImageKind): boolean {
    return this.uploadingImage() === kind;
  }

  async uploadImage(kind: BusinessImageKind, field: 'logo_url' | 'profile_image_url' | 'cover_image_url', event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const business = this.business();
    if (!file || !business || !this.ownerCanEdit()) {
      return;
    }

    this.uploadingImage.set(kind);
    this.loadError.set(null);
    this.savedMessage.set(null);
    try {
      const url = await this.businessClaimService.uploadBusinessImage(business.claim_key, business.owner_user_id, kind, file);
      this.draft.update((current) => ({ ...current, [field]: url }));
      const saved = await this.save();
      if (saved) {
        this.savedMessage.set(`${this.imageLabel(kind)} uploaded and saved.`);
      }
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : `Could not upload ${this.imageLabel(kind).toLowerCase()}.`);
    } finally {
      this.uploadingImage.set(null);
      input.value = '';
    }
  }

  async save(): Promise<boolean> {
    const business = this.business();
    if (!business || !this.ownerCanEdit()) {
      return false;
    }
    const draft = this.draft();
    const update: BusinessClaimWorkspaceUpdate = {
      business_address: draft.business_address.trim(),
      category: draft.category.trim(),
      admin_name: draft.admin_name.trim(),
      admin_email: draft.admin_email.trim(),
      guide_prompt: draft.guide_prompt.trim(),
      badge_icons: this.selectedIconCodes(),
      logo_url: draft.logo_url.trim(),
      profile_image_url: draft.profile_image_url.trim(),
      cover_image_url: draft.cover_image_url.trim(),
    };
    this.saving.set(true);
    this.loadError.set(null);
    this.savedMessage.set(null);
    try {
      await this.businessClaimService.updateWorkspaceRecord(business.claim_key, update);
      this.business.set({ ...business, ...update });
      this.savedMessage.set('Business page changes saved.');
      return true;
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Could not save business changes.');
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async downloadBadgePng(): Promise<void> {
    if (typeof document === 'undefined') {
      return;
    }
    const svgUrl = this.badgeSvgHref();
    const image = await this.loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 900;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not render badge PNG.');
    }
    context.drawImage(image, 0, 0, 900, 900);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = this.badgePngFilename();
    link.click();
  }

  private async loadBusiness(claimKey: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const business = await this.businessClaimService.findWorkspaceByClaimKey(claimKey);
      this.business.set(business);
      if (!business) {
        this.loadError.set('This business page has not been created yet.');
      } else {
        this.draft.set(this.toDraft(business));
      }
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Could not load this business page.');
    } finally {
      this.loading.set(false);
    }
  }

  private toDraft(business: BusinessClaimWorkspaceRecord): BusinessEditDraft {
    return {
      business_address: business.business_address ?? '',
      category: business.category ?? '',
      admin_name: business.admin_name ?? '',
      admin_email: business.admin_email ?? '',
      guide_prompt: business.guide_prompt ?? '',
      badge_icons: business.badge_icons?.join(', ') ?? '',
      logo_url: business.logo_url ?? '',
      profile_image_url: business.profile_image_url ?? '',
      cover_image_url: business.cover_image_url ?? '',
    };
  }

  private emptyDraft(): BusinessEditDraft {
    return {
      business_address: '',
      category: '',
      admin_name: '',
      admin_email: '',
      guide_prompt: '',
      badge_icons: '',
      logo_url: '',
      profile_image_url: '',
      cover_image_url: '',
    };
  }

  private buildBadgeSvg(): string {
    const business = this.escapeSvg(this.fitBadgeText(this.businessName()).toUpperCase());
    const qr = this.escapeSvg(generateQrSvgDataUrl(this.detailUrl()));
    const icons = this.selectedIconCodes().map((icon, index, all) => {
      const angle = -155 + (all.length <= 1 ? 0 : (310 / Math.max(1, all.length - 1)) * index);
      const radians = angle * Math.PI / 180;
      const x = 450 + Math.cos(radians) * 220;
      const y = 450 + Math.sin(radians) * 220;
      return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="38" fill="#fff8ea" stroke="#b98834" stroke-width="4"/><text y="12" text-anchor="middle" font-size="36">${this.iconEmoji(icon)}</text></g>`;
    }).join('');
    const flags = [
      ['🇺🇸', 300, 305],
      ['🇫🇷', 600, 305],
      ['🇧🇷', 600, 575],
      ['🇩🇪', 450, 642],
      ['🇨🇳', 300, 575],
    ].map(([flag, x, y]) => `<g transform="translate(${x} ${y})"><circle r="29" fill="#fff8ea" stroke="#b98834" stroke-width="4"/><text y="8" text-anchor="middle" font-size="24">${flag}</text></g>`).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
      <defs>
        <radialGradient id="paper" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="#f5e4c5"/><stop offset="0.68" stop-color="#dfc28d"/><stop offset="1" stop-color="#c79d56"/></radialGradient>
        <linearGradient id="tealRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f8294"/><stop offset="1" stop-color="#0f596d"/></linearGradient>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#12323a" flood-opacity="0.28"/></filter>
        <path id="topArc" d="M 112 472 A 338 338 0 0 1 788 472"/>
        <path id="bottomArc" d="M 186 606 A 310 310 0 0 0 714 606"/>
      </defs>
      <rect width="900" height="900" fill="#f4f4f1"/>
      <circle cx="450" cy="450" r="400" fill="url(#paper)" filter="url(#softShadow)"/>
      <circle cx="450" cy="450" r="340" fill="none" stroke="url(#tealRing)" stroke-width="74"/>
      <circle cx="450" cy="450" r="284" fill="#ead2a5" stroke="#b8842f" stroke-width="5"/>
      <circle cx="450" cy="450" r="210" fill="none" stroke="#a47729" stroke-width="4" stroke-dasharray="24 28"/>
      <text font-family="Inter, Arial, sans-serif" font-size="32" font-weight="900" fill="#ffffff" dy="12"><textPath href="#topArc" startOffset="50%" text-anchor="middle" textLength="610" lengthAdjust="spacingAndGlyphs">${business} • LivingWiki Chat</textPath></text>
      <text font-family="Inter, Arial, sans-serif" font-size="40" font-weight="900" fill="#ffffff" dy="20"><textPath href="#bottomArc" startOffset="50%" text-anchor="middle" textLength="410" lengthAdjust="spacingAndGlyphs">60+ Languages</textPath></text>
      <rect x="318" y="318" width="264" height="264" rx="20" fill="#fff8ea" stroke="#b8842f" stroke-width="5"/>
      <image href="${qr}" x="340" y="340" width="220" height="220" preserveAspectRatio="xMidYMid meet"/>
      <circle cx="450" cy="450" r="24" fill="#f3dfb9"/>
      <path d="M450 434c7 0 13 6 13 13v13c0 7-6 13-13 13s-13-6-13-13v-13c0-7 6-13 13-13z" fill="#0f596d"/>
      <path d="M429 458c0 13 9 24 21 24s21-11 21-24" fill="none" stroke="#0f596d" stroke-width="5" stroke-linecap="round"/>
      <path d="M450 482v18M437 500h26" fill="none" stroke="#0f596d" stroke-width="5" stroke-linecap="round"/>
      ${flags}${icons}
      <text x="450" y="646" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="900" fill="#0f596d">Powered by MyLivingWiki.com</text>
    </svg>`;
  }

  private iconEmoji(code: string): string {
    const icons: Record<string, string> = {
      bakery: '🥐',
      beer: '🍺',
      cocktail: '🍸',
      coffee: '☕',
      gallery: '🎨',
      hotel: '🏨',
      local: '📍',
      market: '🛍️',
      music: '🎵',
      restaurant: '🍽️',
      service: '🧰',
      shop: '🛍️',
    };
    return icons[code] ?? '⭐';
  }

  private imageLabel(kind: BusinessImageKind): string {
    switch (kind) {
      case 'logo':
        return 'Logo';
      case 'profile':
        return 'Profile picture';
      case 'cover':
        return 'Cover image';
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Badge image could not be rendered for PNG download.'));
      image.src = src;
    });
  }

  private escapeSvg(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private fitBadgeText(value: string): string {
    const clean = value.trim() || 'Your business';
    return clean.length > 26 ? `${clean.slice(0, 23).trim()}...` : clean;
  }

  private origin(): string {
    return typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://mylivingwiki.com';
  }

  private titleizeSlug(value: string): string {
    return value.split('-').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || 'Business';
  }
}
