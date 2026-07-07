import { Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-trove',
  imports: [RouterLink],
  templateUrl: './trove.html',
  styleUrl: './trove.css',
})
export class TroveComponent implements OnDestroy {
  @ViewChild('gameFrame') private readonly gameFrame?: ElementRef<HTMLIFrameElement>;

  readonly isFullscreen = signal(false);
  private readonly onFullscreenChange = (): void => {
    this.isFullscreen.set(document.fullscreenElement !== null);
  };

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('fullscreenchange', this.onFullscreenChange);
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    }
  }

  async toggleFullscreen(): Promise<void> {
    if (typeof document === 'undefined') {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }

    const target = this.gameFrame?.nativeElement ?? document.documentElement;
    await target.requestFullscreen?.().catch(() => undefined);
  }
}
