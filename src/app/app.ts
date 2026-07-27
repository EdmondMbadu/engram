import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SpotifyPlayerComponent } from './spotify-player/spotify-player';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SpotifyPlayerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = $localize`LivingWiki`;
  private readonly themeService = inject(ThemeService);
}
