import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { AtlasSwitcherComponent } from '../atlas-switcher/atlas-switcher';
import { profileIconByCode, profileIconForSeed } from '../profile/profile-icons';

export type WorkspaceSidebarActive =
  | 'wikis'
  | 'home'
  | 'chat'
  | 'upload'
  | 'library'
  | 'videos'
  | 'scrapper'
  | 'wiki'
  | 'settings'
  | 'business'
  | 'profile'
  | 'dymaxion'
  | 'business-edit'
  | 'business-badge'
  | 'business-voice'
  | 'business-chat';

type WorkspaceNavItem = {
  key: WorkspaceSidebarActive;
  label: string;
  icon: string;
  route: string;
};

@Component({
  selector: 'app-workspace-sidebar',
  imports: [RouterLink, AtlasSwitcherComponent],
  templateUrl: './workspace-sidebar.html',
})
export class WorkspaceSidebarComponent {
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly active = input<WorkspaceSidebarActive>('wikis');
  readonly businessName = input<string | null>(null);
  readonly businessCity = input<string | null>(null);
  readonly businessStatus = input<string | null>(null);
  readonly businessPath = input<string | null>(null);
  readonly businessEditPath = input<string | null>(null);
  readonly businessBadgePath = input<string | null>(null);
  readonly businessVoicePath = input<string | null>(null);
  readonly businessChatPath = input<string | null>(null);
  readonly businessChatGuidePath = input<string | null>(null);
  readonly businessChatGuideQueryParams = input<Record<string, string> | null>(null);
  readonly rail = input(false);

  readonly signingOut = signal(false);
  readonly atlasWikiLink = this.atlasService.activeAtlasWikiLink;
  readonly userProfile = this.authService.profile;
  readonly userEmail = this.authService.email;
  readonly userName = this.authService.displayName;
  readonly userPhotoUrl = computed(() => this.userProfile()?.profilePictureType === 'image' ? this.userProfile()?.photoURL ?? '' : '');
  readonly userIcon = computed(() =>
    profileIconByCode(this.userProfile()?.profileIcon) ?? profileIconForSeed(this.authService.uid() || this.userEmail() || this.userName()),
  );
  readonly showBusinessSection = computed(() => !!this.businessName()?.trim() && !!this.businessPath()?.trim());
  readonly moreOpen = signal(false);

  readonly workspacePrimaryItems = computed<WorkspaceNavItem[]>(() => [
    { key: 'home', label: $localize`Home`, icon: 'home', route: '/' },
    { key: 'wikis', label: $localize`Wikis`, icon: 'dashboard', route: '/wikis' },
    { key: 'chat', label: $localize`Chat`, icon: 'chat', route: '/chat' },
    { key: 'business', label: $localize`Business`, icon: 'storefront', route: '/business' },
  ]);

  readonly workspaceMoreItems = computed<WorkspaceNavItem[]>(() => [
    { key: 'dymaxion', label: $localize`World Map`, icon: 'public', route: '/dymaxion' },
    { key: 'videos', label: $localize`My Videos`, icon: 'video_library', route: '/videos' },
    { key: 'upload', label: $localize`Upload Knowledge`, icon: 'neurology', route: '/upload' },
    { key: 'library', label: $localize`Source Files`, icon: 'library_books', route: '/library' },
    { key: 'scrapper', label: $localize`Scraper`, icon: 'travel_explore', route: '/scrapper' },
    { key: 'wiki', label: $localize`Wiki Reader`, icon: 'menu_book', route: this.atlasWikiLink() },
    { key: 'profile', label: $localize`Profile`, icon: 'account_circle', route: '/profile' },
    { key: 'settings', label: $localize`Settings`, icon: 'settings', route: '/atlases' },
  ]);

  readonly moreActive = computed(() => this.workspaceMoreItems().some((item) => this.isActive(item.key)));
  readonly showMoreItems = computed(() => this.moreOpen() || this.moreActive());

  readonly businessItems = computed(() => [
    { key: 'business', label: $localize`Business Page`, icon: 'business_center', route: this.businessPath() },
    { key: 'business-edit', label: $localize`Edit Page`, icon: 'edit', route: this.businessEditPath() },
    { key: 'business-badge', label: $localize`Badge`, icon: 'qr_code_2', route: this.businessBadgePath() || this.businessEditPath() },
    { key: 'business-voice', label: $localize`Voice Assistant`, icon: 'mic', route: this.businessVoicePath() },
    { key: 'business-chat', label: $localize`Direct Chat`, icon: 'forum', route: this.businessChatPath() },
  ].filter((item): item is { key: WorkspaceSidebarActive; label: string; icon: string; route: string } => !!item.route));

  isActive(key: string): boolean {
    return this.active() === key;
  }

  isPrimaryActive(key: string): boolean {
    if (key === 'business') {
      return this.active() === 'business' || this.active().startsWith('business-');
    }
    return this.isActive(key);
  }

  toggleMore(): void {
    this.moreOpen.update((open) => !open);
  }

  async signOut(): Promise<void> {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    try {
      await this.authService.signOut();
      await this.router.navigate(['/']);
    } finally {
      this.signingOut.set(false);
    }
  }
}
