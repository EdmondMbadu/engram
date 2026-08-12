import { PLATFORM_ID, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { PublicWikisComponent } from './public-wikis';

describe('PublicWikisComponent home pagination', () => {
  function createComponent(): PublicWikisComponent {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: PLATFORM_ID, useValue: 'server' },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(true),
            profile: signal(null),
            uid: () => 'user-1',
            waitForReady: async () => undefined,
          },
        },
        { provide: AtlasService, useValue: {} },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { signedInHome: true }, routeConfig: { path: 'home' } } },
        },
        { provide: Router, useValue: { navigate: async () => true } },
      ],
    });
    return TestBed.runInInjectionContext(() => new PublicWikisComponent());
  }

  function board(index: number): any {
    return {
      id: `board-${index}`,
      kind: 'standard',
      sortOrder: index,
      ownerUserId: 'user-1',
      ownerPublicSlug: 'owner',
      ownerDisplayName: 'Owner',
      ownerPhotoUrl: '',
      ownerProfileIcon: '',
      ownerProfilePictureType: null,
      visibility: 'private',
      title: `Board ${index}`,
      description: '',
      icon: 'dashboard_customize',
      tone: 'blue',
      imageUrl: '',
      logoUrl: '',
      cards: [],
      createdAt: '',
      updatedAt: '',
    };
  }

  it('reveals board cards 10 at a time until every loaded board is visible', async () => {
    const component = createComponent();
    component.mobileBoards.set(Array.from({ length: 25 }, (_, index) => board(index)));

    let section = component.mobileSections().find((item) => item.id === 'boards')!;
    expect(section.cards.length).toBe(10);

    await component.showMoreMobileSection(section);
    section = component.mobileSections().find((item) => item.id === 'boards')!;
    expect(section.cards.length).toBe(20);

    await component.showMoreMobileSection(section);
    section = component.mobileSections().find((item) => item.id === 'boards')!;
    expect(section.cards.length).toBe(25);
    expect(component.hasMoreMobileSection(section)).toBeFalse();
  });

  it('uses the same 10-item reveal behavior for discover boards', async () => {
    const component = createComponent();
    component.mobileDiscoverBoards.set(Array.from({ length: 25 }, (_, index) => board(index)));

    expect(component.mobileDiscoverPreviewBoards().length).toBe(10);
    await component.showMoreMobileDiscoverBoards();
    expect(component.mobileDiscoverPreviewBoards().length).toBe(20);
    await component.showMoreMobileDiscoverBoards();
    expect(component.mobileDiscoverPreviewBoards().length).toBe(25);
    expect(component.hasMoreMobileDiscoverBoards()).toBeFalse();
  });

  it('switches the home directory between cities and universities', () => {
    const component = createComponent();
    component.liveWikis.set([
      {
        title: 'LivingWiki: Philadelphia',
        subtitle: 'Philadelphia',
        description: 'A city wiki',
        category: 'Cities & Regions',
        status: 'live',
        link: '/chat/philly',
      } as any,
      {
        title: 'LivingWiki: University of Pennsylvania',
        subtitle: 'University of Pennsylvania',
        description: 'A university wiki',
        category: 'Universities',
        status: 'live',
        link: '/chat/university-of-pennsylvania',
        universityCity: 'Philadelphia',
        universityState: 'Pennsylvania',
        cohortRank: 1,
      } as any,
    ]);

    expect(component.mobileFeaturedWikis().map((wiki) => wiki.title)).toEqual(['LivingWiki: Philadelphia']);
    expect(component.mobileDirectorySearchPlaceholder()).toContain('cities');

    component.setHomeDirectoryCategory('Universities');

    expect(component.mobileFeaturedWikis().map((wiki) => wiki.title)).toEqual(['LivingWiki: University of Pennsylvania']);
    expect(component.mobileDirectorySearchPlaceholder()).toContain('universities');
  });

  it('filters universities by campus city or state', () => {
    const component = createComponent();
    component.liveWikis.set([
      {
        title: 'LivingWiki: University of Pennsylvania',
        subtitle: 'University of Pennsylvania',
        description: 'A university wiki',
        category: 'Universities',
        status: 'live',
        link: '/chat/university-of-pennsylvania',
        universityCity: 'Philadelphia',
        universityState: 'Pennsylvania',
      } as any,
      {
        title: 'LivingWiki: Northwestern University',
        subtitle: 'Northwestern University',
        description: 'A university wiki',
        category: 'Universities',
        status: 'live',
        link: '/chat/northwestern-university',
        universityCity: 'Evanston',
        universityState: 'Illinois',
      } as any,
    ]);
    component.setHomeDirectoryCategory('Universities');
    component.onSearchInput('Philadelphia');

    expect(component.mobileDirectoryWikis().map((wiki) => wiki.title)).toEqual(['LivingWiki: University of Pennsylvania']);
  });
});
