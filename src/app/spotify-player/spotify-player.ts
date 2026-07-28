import { Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { spotifyTrackEmbedUrl, spotifyTrackIdFromTrack } from '../spotify-embed';
import { SpotifyPlaybackService } from '../spotify-playback.service';

@Component({
  selector: 'app-spotify-player',
  templateUrl: './spotify-player.html',
  styleUrl: './spotify-player.css',
})
export class SpotifyPlayerComponent {
  readonly spotify = inject(SpotifyPlaybackService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly officialCompact = signal(false);
  readonly officialEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const track = this.spotify.embeddedTrack();
    const trackId = track ? spotifyTrackIdFromTrack(track) : '';
    const embedUrl = spotifyTrackEmbedUrl(trackId);
    return embedUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl) : null;
  });
}
