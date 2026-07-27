import { Component, HostListener, inject, signal } from '@angular/core';
import { SpotifyPlaybackService } from '../spotify-playback.service';

@Component({
  selector: 'app-spotify-player',
  templateUrl: './spotify-player.html',
  styleUrl: './spotify-player.css',
})
export class SpotifyPlayerComponent {
  readonly spotify = inject(SpotifyPlaybackService);
  readonly compact = signal(false);
  readonly devicesOpen = signal(false);

  @HostListener('document:keydown.escape')
  closeDialogOnEscape(): void {
    if (this.spotify.connectDialogOpen()) {
      this.spotify.closeConnectionDialog();
    }
  }

  onSeek(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    void this.spotify.seek(value);
  }

  onDeviceChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    void this.spotify.selectDevice(value);
  }
}
