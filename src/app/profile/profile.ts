import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { AtlasBadgeComponent } from '../atlas-badge/atlas-badge';
import {
  BusinessClaimService,
  type BusinessClaimWorkspaceRecord,
} from '../business-claim/business-claim.service';
import { AccountMenuComponent } from '../account-menu/account-menu';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import {
  PROFILE_ICON_PRESETS,
  profileIconByCode,
  profileIconForSeed,
  type ProfileIconPreset,
} from './profile-icons';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';

type ProfileTab = 'account' | 'wikis' | 'business' | 'links';

@Component({
  selector: 'app-profile',
  imports: [
    RouterLink,
    AtlasBadgeComponent,
    AccountMenuComponent,
    MobileMenuComponent,
    ThemeToggleComponent,
    WorkspaceSidebarComponent,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class ProfileComponent {
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly businessClaimService = inject(BusinessClaimService);

  readonly user = this.authService.user;
  readonly profile = this.authService.profile;
  readonly userName = this.authService.displayName;
  readonly userEmail = this.authService.email;
  readonly atlases = this.atlasService.atlases;
  readonly isLoadingWikis = this.atlasService.isLoading;
  readonly businessClaims = signal<BusinessClaimWorkspaceRecord[]>([]);
  readonly loadingBusinesses = signal(false);
  readonly businessError = signal<string | null>(null);
  readonly profilePictureSaving = signal(false);
  readonly profilePictureError = signal<string | null>(null);
  readonly profilePictureMessage = signal<string | null>(null);
  readonly iconChooserOpen = signal(false);
  readonly activeProfileTab = signal<ProfileTab>('account');
  readonly profileIconOptions = PROFILE_ICON_PRESETS;
  readonly profileTabs: Array<{ key: ProfileTab; label: string; icon: string }> = [
    { key: 'account', label: 'Account', icon: 'badge' },
    { key: 'wikis', label: 'Wikis', icon: 'dashboard' },
    { key: 'business', label: 'Business', icon: 'storefront' },
    { key: 'links', label: 'Links', icon: 'link' },
  ];

  readonly uploadedPhotoUrl = computed(() => this.profile()?.profilePictureType === 'image' ? this.profile()?.photoURL ?? '' : '');
  readonly activeIconPreset = computed(() => {
    const explicitIcon = profileIconByCode(this.profile()?.profileIcon);
    if (explicitIcon) {
      return explicitIcon;
    }
    return profileIconForSeed(this.user()?.uid || this.userEmail() || this.userName());
  });
  readonly userInitials = computed(() => {
    const source = this.userName().trim() || this.userEmail().trim() || 'Living Wiki';
    const parts = source.includes('@') ? [source[0] ?? 'U'] : source.split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0] ?? '').join('').toUpperCase() || 'U';
  });
  readonly profileHandle = computed(() => {
    const email = this.userEmail().trim();
    const name = this.userName().trim();
    const base = email.includes('@') ? email.split('@')[0] : name || 'living-wiki-user';
    return base.toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '') || 'living-wiki-user';
  });
  readonly providerLabels = computed(() => {
    const providers = this.profile()?.providers?.length
      ? this.profile()?.providers ?? []
      : this.user()?.providerData.map((provider) => provider.providerId).filter(Boolean) ?? [];
    return [...new Set(providers)].map((provider) => this.providerLabel(provider));
  });
  readonly ownedWikis = computed(() => this.atlases().filter((atlas) => this.atlasService.isAtlasOwner(atlas)));
  readonly adminWikis = computed(() =>
    this.atlases().filter((atlas) => this.atlasService.isAtlasAdmin(atlas) && !this.atlasService.isAtlasOwner(atlas)),
  );
  readonly publicWikis = computed(() => this.atlases().filter((atlas) => atlas.is_public));
  readonly totalDocuments = computed(() =>
    this.atlases().reduce((sum, atlas) => sum + (atlas.stats?.documents ?? 0), 0),
  );
  readonly linkedCount = computed(() =>
    this.atlases().length + this.businessClaims().length + this.providerLabels().length,
  );
  readonly recentWikis = computed(() =>
    [...this.atlases()]
      .sort((left, right) => this.asMillis(right.updated_at ?? right.created_at) - this.asMillis(left.updated_at ?? left.created_at))
      .slice(0, 6),
  );
  readonly accountCreatedLabel = computed(() => this.formatDate(this.profile()?.creationTime ?? null));
  readonly lastSignInLabel = computed(() => this.formatDate(this.profile()?.lastSignInTime ?? null));

  constructor() {
    effect(() => {
      const uid = this.authService.uid();
      if (!uid) {
        this.businessClaims.set([]);
        this.loadingBusinesses.set(false);
        return;
      }
      void this.loadOwnedBusinesses(uid);
    });
  }

  displayName(atlas: AtlasItem | null | undefined): string {
    return this.atlasService.displayName(atlas);
  }

  cityCountryLabel(atlas: AtlasItem | null | undefined): string | null {
    return this.atlasService.cityCountryLabel(atlas);
  }

  wikiPath(atlas: AtlasItem): string {
    const slug = atlas.slug?.trim() || this.slugify(atlas.name) || atlas.id;
    return atlas.is_public ? `/wiki/${slug}` : '/wiki';
  }

  libraryPath(atlas: AtlasItem): string {
    const slug = atlas.slug?.trim() || this.slugify(atlas.name) || atlas.id;
    return atlas.is_public ? `/library/${slug}` : '/library';
  }

  businessPath(business: BusinessClaimWorkspaceRecord): string {
    return `/business/${business.city_slug}/${business.business_slug}`;
  }

  businessStatusLabel(status: string | null | undefined): string {
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'rejected':
        return 'Needs review';
      default:
        return 'Pending';
    }
  }

  businessImageUrl(business: BusinessClaimWorkspaceRecord): string {
    return business.profile_image_url?.trim() || business.logo_url?.trim() || '';
  }

  iconSelected(icon: ProfileIconPreset): boolean {
    return !this.uploadedPhotoUrl() && this.activeIconPreset().code === icon.code;
  }

  openIconChooser(): void {
    this.profilePictureError.set(null);
    this.profilePictureMessage.set(null);
    this.iconChooserOpen.set(true);
  }

  closeIconChooser(): void {
    this.iconChooserOpen.set(false);
  }

  setProfileTab(tab: ProfileTab): void {
    this.activeProfileTab.set(tab);
  }

  async chooseIcon(icon: ProfileIconPreset): Promise<void> {
    if (this.profilePictureSaving()) {
      return;
    }
    this.profilePictureSaving.set(true);
    this.profilePictureError.set(null);
    this.profilePictureMessage.set(null);
    try {
      await this.authService.chooseProfileIcon(icon.code);
      this.profilePictureMessage.set(`${icon.label} is now your profile picture.`);
      this.closeIconChooser();
    } catch (error) {
      this.profilePictureError.set(error instanceof Error ? error.message : 'Could not save that icon.');
    } finally {
      this.profilePictureSaving.set(false);
    }
  }

  async uploadPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.profilePictureSaving()) {
      return;
    }

    this.profilePictureSaving.set(true);
    this.profilePictureError.set(null);
    this.profilePictureMessage.set(null);
    try {
      await this.authService.uploadProfilePhoto(file);
      this.profilePictureMessage.set('Profile photo uploaded.');
    } catch (error) {
      this.profilePictureError.set(error instanceof Error ? error.message : 'Could not upload that image.');
    } finally {
      this.profilePictureSaving.set(false);
      input.value = '';
    }
  }

  async removeProfilePicture(): Promise<void> {
    if (this.profilePictureSaving()) {
      return;
    }
    this.profilePictureSaving.set(true);
    this.profilePictureError.set(null);
    this.profilePictureMessage.set(null);
    try {
      await this.authService.removeProfilePicture();
      this.profilePictureMessage.set('Profile picture reset to your premade icon.');
    } catch (error) {
      this.profilePictureError.set(error instanceof Error ? error.message : 'Could not remove your profile picture.');
    } finally {
      this.profilePictureSaving.set(false);
    }
  }

  initialsFor(text: string | null | undefined): string {
    const source = text?.trim() || 'LW';
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase() || 'LW';
  }

  private async loadOwnedBusinesses(uid: string): Promise<void> {
    this.loadingBusinesses.set(true);
    this.businessError.set(null);
    try {
      const businesses = await this.businessClaimService.listByOwner(uid);
      if (this.authService.uid() !== uid) {
        return;
      }
      this.businessClaims.set(businesses);
    } catch (error) {
      this.businessError.set(error instanceof Error ? error.message : 'Failed to load connected businesses.');
    } finally {
      if (this.authService.uid() === uid) {
        this.loadingBusinesses.set(false);
      }
    }
  }

  private providerLabel(provider: string): string {
    switch (provider) {
      case 'google.com':
        return 'Google';
      case 'password':
        return 'Email and password';
      default:
        return provider.replace(/\.com$/i, '');
    }
  }

  private slugify(value: string | null | undefined): string {
    return (value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private formatDate(value: string | null): string {
    if (!value) {
      return 'Not available';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Not available';
    }
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  private asMillis(value: { toDate(): Date } | Date | string | null | undefined): number {
    if (!value) {
      return 0;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value === 'string') {
      return new Date(value).getTime() || 0;
    }
    return value.toDate().getTime();
  }
}
