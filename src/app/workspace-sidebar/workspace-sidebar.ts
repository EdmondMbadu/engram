import { Component, OnDestroy, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  WorkspaceNavigationOverlayService,
  WorkspaceNavigationService,
  type WorkspaceNavigationKey,
} from '../workspace-navigation/workspace-navigation';

export type WorkspaceSidebarActive =
  | WorkspaceNavigationKey
  | 'business-edit'
  | 'business-badge'
  | 'business-voice'
  | 'business-chat';

@Component({
  selector: 'app-workspace-sidebar',
  imports: [RouterLink],
  templateUrl: './workspace-sidebar.html',
  styleUrl: './workspace-sidebar.css',
})
export class WorkspaceSidebarComponent implements OnDestroy {
  readonly active = input<WorkspaceSidebarActive>('home');
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

  readonly navigation = inject(WorkspaceNavigationService);
  readonly overlay = inject(WorkspaceNavigationOverlayService);

  constructor() {
    effect(() => {
      const name = this.businessName()?.trim();
      const pagePath = this.businessPath()?.trim();
      if (!name || !pagePath) {
        this.navigation.setBusinessContext(null);
        return;
      }

      this.navigation.setBusinessContext({
        name,
        city: this.businessCity()?.trim() || null,
        status: this.businessStatus()?.trim() || null,
        pagePath,
        editPath: this.businessEditPath()?.trim() || null,
        badgePath: this.businessBadgePath()?.trim() || null,
        voicePath: this.businessVoicePath()?.trim() || null,
        chatPath: this.businessChatPath()?.trim() || null,
        chatGuidePath: this.businessChatGuidePath()?.trim() || null,
        chatGuideQueryParams: this.businessChatGuideQueryParams(),
      });
    });
  }

  ngOnDestroy(): void {
    this.navigation.setBusinessContext(null);
  }

  openMore(event: MouseEvent): void {
    this.overlay.openMore(event.currentTarget);
  }

  openAbout(event: MouseEvent): void {
    this.overlay.openAbout(event.currentTarget);
  }

  toggleSidebar(): void {
    this.navigation.toggleSidebar();
  }
}
