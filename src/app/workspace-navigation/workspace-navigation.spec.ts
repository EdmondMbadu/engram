import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import {
  WorkspaceNavigationOverlayService,
  WorkspaceNavigationService,
} from './workspace-navigation';

@Component({ template: '' })
class NavigationTestPageComponent {}

describe('WorkspaceNavigationService', () => {
  const uid = signal('user-1');
  const profile = signal({ preferredCitySlug: 'my-living-wiki-las-vegas' });

  beforeEach(() => {
    window.localStorage.removeItem('lw-board-actions:user-1');
    window.localStorage.removeItem('livingwiki-board-actions-v1:user-1');
    uid.set('user-1');
    profile.set({ preferredCitySlug: 'my-living-wiki-las-vegas' });

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: NavigationTestPageComponent }]),
        {
          provide: AuthService,
          useValue: {
            uid,
            profile,
          },
        },
        {
          provide: AtlasService,
          useValue: {
            activeAtlasWikiLink: signal('/wiki/philly'),
          },
        },
      ],
    });
  });

  it('keeps the signed-in home navigation in one canonical order', () => {
    const service = TestBed.inject(WorkspaceNavigationService);

    expect(service.primaryItems().map((item) => item.label)).toEqual([
      'Discover',
      'My City Las Vegas',
      'My Boards',
      'My Songs',
      'My Videos',
      'My Friends',
      'My Trips',
      'My Trove · Starfold City',
      'Business',
    ]);
    expect(service.moreItems().map((item) => item.label)).toEqual([
      'Wikis',
      'Chat',
      'World Map',
      'Upload Knowledge',
      'Source Files',
      'Scraper',
      'Wiki Reader',
      'Profile',
      'Settings',
    ]);
    expect(service.primaryItems().find((item) => item.key === 'city')?.route).toBe('/chat/my-living-wiki-las-vegas');
  });

  it('shows Saved Boards from either existing storage format', () => {
    window.localStorage.setItem('livingwiki-board-actions-v1:user-1', JSON.stringify({ savedBoardIds: ['board-1'] }));
    const service = TestBed.inject(WorkspaceNavigationService);

    service.refreshSavedBoards();

    expect(service.primaryItems().some((item) => item.key === 'saved')).toBeTrue();
  });

  it('derives active state from the route instead of host inputs', async () => {
    const service = TestBed.inject(WorkspaceNavigationService);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/songs/featured');

    expect(service.isActive('songs')).toBeTrue();
    expect(service.isActive('boards')).toBeFalse();
  });

  it('keeps business tools contextual and out of the primary list', () => {
    const service = TestBed.inject(WorkspaceNavigationService);
    service.setBusinessContext({
      name: 'Green House',
      city: 'Philadelphia',
      status: 'Published',
      pagePath: '/business/philly/green-house',
      editPath: '/business/philly/green-house/edit',
      badgePath: null,
      voicePath: null,
      chatPath: null,
      chatGuidePath: null,
      chatGuideQueryParams: null,
    });

    expect(service.primaryItems().some((item) => item.label === 'Edit Page')).toBeFalse();
    expect(service.businessItems().map((item) => item.label)).toEqual(['Business Page', 'Edit Page', 'Badge']);
  });
});

describe('WorkspaceNavigationOverlayService', () => {
  it('keeps More and About mutually exclusive', () => {
    const service = new WorkspaceNavigationOverlayService();

    service.openMore();
    expect(service.moreOpen()).toBeTrue();
    expect(service.aboutOpen()).toBeFalse();

    service.openAbout();
    expect(service.moreOpen()).toBeFalse();
    expect(service.aboutOpen()).toBeTrue();

    service.close();
    expect(service.aboutOpen()).toBeFalse();
  });
});
