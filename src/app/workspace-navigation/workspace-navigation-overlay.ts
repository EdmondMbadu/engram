import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  PLATFORM_ID,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../auth.service';
import {
  WorkspaceNavigationOverlayService,
  WorkspaceNavigationService,
} from './workspace-navigation';

const PRODUCT_VIDEO_URL =
  'https://firebasestorage.googleapis.com/v0/b/living-atlas-7622a.firebasestorage.app/o/videos%2FAvatar%20Video.mp4?alt=media&token=6898fe99-71fe-49dc-af66-0467e816de87';

@Component({
  selector: 'app-workspace-navigation-overlay',
  imports: [RouterLink],
  templateUrl: './workspace-navigation-overlay.html',
  styleUrl: './workspace-navigation-overlay.css',
})
export class WorkspaceNavigationOverlayComponent implements AfterViewChecked {
  @ViewChild('dialogPanel') private dialogPanel?: ElementRef<HTMLElement>;
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private focusPending = false;

  readonly navigation = inject(WorkspaceNavigationService);
  readonly overlay = inject(WorkspaceNavigationOverlayService);
  readonly signingOut = signal(false);
  readonly productVideoUrl = PRODUCT_VIDEO_URL;

  constructor() {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => this.overlay.close());

    effect(() => {
      const open = this.overlay.moreOpen() || this.overlay.aboutOpen();
      if (this.isBrowser) {
        document.documentElement.classList.toggle('workspace-overlay-open', open);
      }
      if (open) this.focusPending = true;
    });
  }

  ngAfterViewChecked(): void {
    if (!this.focusPending || !this.dialogPanel) return;
    this.focusPending = false;
    this.dialogPanel.nativeElement.focus();
  }

  close(): void {
    this.overlay.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.dialogPanel) return;
    const focusable = Array.from(
      this.dialogPanel.nativeElement.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('disabled'));
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === this.dialogPanel.nativeElement)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    try {
      await this.authService.signOut();
      this.close();
      await this.router.navigate(['/']);
    } finally {
      this.signingOut.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.overlay.moreOpen() || this.overlay.aboutOpen()) this.close();
  }
}
