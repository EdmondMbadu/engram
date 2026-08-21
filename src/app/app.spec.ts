import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { SpotifyPlaybackService } from './spotify-playback.service';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { AtlasService } from './atlas.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            uid: signal(''),
            profile: signal(null),
            isAuthenticated: signal(false),
            signOut: jasmine.createSpy('signOut').and.resolveTo(),
          },
        },
        {
          provide: AtlasService,
          useValue: { activeAtlasWikiLink: signal('/wiki') },
        },
        {
          provide: SpotifyPlaybackService,
          useValue: {
            connectDialogOpen: signal(false),
            embeddedTrack: signal(null),
            currentTrack: signal(null),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should expose the product title', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as { title: string };
    expect(app.title).toBe('LivingWiki');
  });
});
