import { Component, computed, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../auth.service';
import { buildBusinessBadgeSvg } from '../business-badge';
import { BusinessClaimService, type BusinessClaimWorkspaceRecord, type BusinessClaimWorkspaceUpdate, type BusinessImageKind } from '../business-claim/business-claim.service';
import { generateQrSvg } from '../qr-code';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';
import { AccountMenuComponent } from '../account-menu/account-menu';

const BADGE_RING_IMAGE_URL = '/assets/image/ring-countries.png';

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
  imports: [RouterLink, ThemeToggleComponent, WorkspaceSidebarComponent, AccountMenuComponent],
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
  readonly editPath = computed(() => `${this.detailPath()}/edit`);
  readonly voiceAdminPath = computed(() => `${this.detailPath()}/voice`);
  readonly chatAdminPath = computed(() => `${this.detailPath()}/chat`);
  readonly chatPath = computed(() => `/chat/${this.routeParams().citySlug}`);
  readonly chatQueryParams = computed(() => ({ business: this.routeParams().businessSlug }));
  readonly businessName = computed(() => this.business()?.business_name || this.titleizeSlug(this.routeParams().businessSlug || 'business'));
  readonly cityName = computed(() => this.business()?.city_name || this.titleizeSlug(this.routeParams().citySlug || 'city'));
  readonly businessInitial = computed(() => (this.businessName().trim()[0] || 'B').toUpperCase());
  readonly ownerCanEdit = computed(() => !!this.authService.uid() && this.business()?.owner_user_id === this.authService.uid());
  readonly chatUrl = computed(() => `https://livingwiki.com${this.chatPath()}?business=${encodeURIComponent(this.routeParams().businessSlug)}`);
  readonly qrOnlySvg = computed(() => generateQrSvg(this.chatUrl()));
  readonly qrOnlySvgHref = computed(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.qrOnlySvg())}`);
  readonly badgeSvg = computed(() => this.buildBadgeSvg());
  readonly badgeSvgHref = computed(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.badgeSvg())}`);
  readonly qrOnlyPngFilename = computed(() => `${this.routeParams().businessSlug || 'business'}-${this.routeParams().citySlug || 'city'}-qr.png`);
  readonly badgeSvgFilename = computed(() => `${this.routeParams().businessSlug || 'business'}-${this.routeParams().citySlug || 'city'}-badge.svg`);
  readonly badgePngFilename = computed(() => `${this.routeParams().businessSlug || 'business'}-${this.routeParams().citySlug || 'city'}-badge.png`);
  readonly selectedIconCodes = computed(() => this.draft().badge_icons.split(',').map((icon) => icon.trim()).filter(Boolean).slice(0, 4));

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
      this.title.setTitle(`Edit ${this.businessName()} | Living Wiki`);
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
      : [...current, code].slice(0, 4);
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
    await this.downloadSvgAsPng(this.badgeSvgHref(), this.badgePngFilename(), 900, BADGE_RING_IMAGE_URL);
  }

  async downloadQrOnlyPng(): Promise<void> {
    await this.downloadSvgAsPng(this.qrOnlySvgHref(), this.qrOnlyPngFilename(), 1024);
  }

  private async downloadSvgAsPng(svgUrl: string, filename: string, size: number, backgroundImageUrl?: string): Promise<void> {
    if (typeof document === 'undefined') {
      return;
    }
    const [backgroundImage, image] = await Promise.all([
      backgroundImageUrl ? this.loadImage(backgroundImageUrl) : Promise.resolve(null),
      this.loadImage(svgUrl),
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not render QR PNG.');
    }
    context.fillStyle = backgroundImage ? '#111211' : '#ffffff';
    context.fillRect(0, 0, size, size);
    if (backgroundImage) {
      context.drawImage(backgroundImage, 0, 0, size, size);
    }
    context.drawImage(image, 0, 0, size, size);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = filename;
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
    return buildBusinessBadgeSvg({
      businessName: this.businessName(),
      chatUrl: this.chatUrl(),
      iconCodes: this.selectedIconCodes(),
    });
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

  private titleizeSlug(value: string): string {
    return value.split('-').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || 'Business';
  }
}
