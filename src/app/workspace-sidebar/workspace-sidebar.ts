import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { AtlasSwitcherComponent } from '../atlas-switcher/atlas-switcher';

export type WorkspaceSidebarActive =
  | 'wikis'
  | 'home'
  | 'chat'
  | 'upload'
  | 'library'
  | 'scrapper'
  | 'wiki'
  | 'settings'
  | 'business'
  | 'business-edit'
  | 'business-badge'
  | 'business-voice'
  | 'business-chat';

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
  readonly atlasHomeLink = this.atlasService.activeAtlasHomeLink;
  readonly atlasWikiLink = this.atlasService.activeAtlasWikiLink;
  readonly userEmail = this.authService.email;
  readonly userName = this.authService.displayName;
  readonly userInitial = computed(() => (this.userName().trim()[0] || this.userEmail().trim()[0] || 'U').toUpperCase());
  readonly showBusinessSection = computed(() => !!this.businessName()?.trim() && !!this.businessPath()?.trim());

  readonly workspaceItems = computed(() => [
    { key: 'wikis', label: 'Wikis', icon: 'dashboard', route: '/wikis' },
    { key: 'home', label: 'Home', icon: 'home', route: this.atlasHomeLink() },
    { key: 'chat', label: 'Chat', icon: 'chat', route: '/chat' },
    { key: 'upload', label: 'Upload', icon: 'neurology', route: '/upload' },
    { key: 'library', label: 'Source Files', icon: 'library_books', route: '/library' },
    { key: 'scrapper', label: 'Scrapper', icon: 'travel_explore', route: '/scrapper' },
    { key: 'wiki', label: 'Wiki', icon: 'menu_book', route: this.atlasWikiLink() },
    { key: 'settings', label: 'Settings', icon: 'settings', route: '/atlases' },
  ]);

  readonly businessItems = computed(() => [
    { key: 'business', label: 'Business Page', icon: 'business_center', route: this.businessPath() },
    { key: 'business-edit', label: 'Edit Page', icon: 'edit', route: this.businessEditPath() },
    { key: 'business-badge', label: 'Badge', icon: 'qr_code_2', route: this.businessBadgePath() || this.businessEditPath() },
    { key: 'business-voice', label: 'Voice Assistant', icon: 'mic', route: this.businessVoicePath() },
    { key: 'business-chat', label: 'Direct Chat', icon: 'forum', route: this.businessChatPath() },
  ].filter((item): item is { key: WorkspaceSidebarActive; label: string; icon: string; route: string } => !!item.route));

  isActive(key: string): boolean {
    return this.active() === key;
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
