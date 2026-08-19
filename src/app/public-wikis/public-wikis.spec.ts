import { PLATFORM_ID, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import {
  appendDiscoverBoardPage,
  PublicWikisComponent,
  shouldAutoLoadDiscoverBoards,
  shouldAutoLoadPublicWikis,
  shouldFallbackDiscoverNewestFirstQuery,
  sortDiscoverBoardsNewestFirst,
} from './public-wikis';

describe('PublicWikisComponent home pagination', () => {
  function createComponent(discoverPage = false): PublicWikisComponent {
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
            updateHomePreferences: async () => undefined,
          },
        },
        { provide: AtlasService, useValue: {} },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: discoverPage ? { discoverPage: true } : { signedInHome: true },
              routeConfig: { path: discoverPage ? 'discover' : 'home' },
            },
          },
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

  it('automatically reveals the next discover batch when its sentinel enters view', async () => {
    const component = createComponent(true);
    component.mobileDiscoverBoards.set(Array.from({ length: 25 }, (_, index) => board(index)));

    await component.onDiscoverLoadSentinelIntersection(false);
    expect(component.mobileDiscoverPreviewBoards().length).toBe(10);

    await component.onDiscoverLoadSentinelIntersection(true);
    expect(component.mobileDiscoverPreviewBoards().length).toBe(20);
  });

  it('only auto-loads on Discover when more boards are available and no request is active', () => {
    expect(shouldAutoLoadDiscoverBoards({
      isDiscoverRoute: true,
      isIntersecting: true,
      hasMore: true,
      loading: false,
    })).toBeTrue();
    expect(shouldAutoLoadDiscoverBoards({
      isDiscoverRoute: false,
      isIntersecting: true,
      hasMore: true,
      loading: false,
    })).toBeFalse();
    expect(shouldAutoLoadDiscoverBoards({
      isDiscoverRoute: true,
      isIntersecting: true,
      hasMore: true,
      loading: true,
    })).toBeFalse();
  });

  it('reveals public directory pages 10 at a time when the landing sentinel enters view', async () => {
    const component = createComponent();
    component.liveWikis.set(Array.from({ length: 25 }, (_, index) => ({
      title: `LivingWiki: City ${index}`,
      subtitle: 'Cities & Regions',
      description: `City ${index}`,
      category: 'Cities & Regions',
      status: 'live',
      population: 25 - index,
    } as any)));

    expect(component.visibleWikis().length).toBe(10);
    await component.onPublicWikiLoadSentinelIntersection(false);
    expect(component.visibleWikis().length).toBe(10);
    await component.onPublicWikiLoadSentinelIntersection(true);
    expect(component.visibleWikis().length).toBe(20);
  });

  it('only auto-loads the public directory when more results are available and no reveal is active', () => {
    expect(shouldAutoLoadPublicWikis({ isIntersecting: true, hasMore: true, loading: false })).toBeTrue();
    expect(shouldAutoLoadPublicWikis({ isIntersecting: false, hasMore: true, loading: false })).toBeFalse();
    expect(shouldAutoLoadPublicWikis({ isIntersecting: true, hasMore: false, loading: false })).toBeFalse();
    expect(shouldAutoLoadPublicWikis({ isIntersecting: true, hasMore: true, loading: true })).toBeFalse();
  });

  it('ranks discover boards by newest creation date with deterministic ties', () => {
    const boards = [
      { id: 'older', title: 'Older', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'newer-b', title: 'Bravo', createdAt: '2026-03-01T00:00:00.000Z' },
      { id: 'newer-a', title: 'Alpha', createdAt: '2026-03-01T00:00:00.000Z' },
      { id: 'undated', title: 'Undated', createdAt: '' },
    ];

    expect(sortDiscoverBoardsNewestFirst(boards).map((item) => item.id)).toEqual([
      'newer-a',
      'newer-b',
      'older',
      'undated',
    ]);
  });

  it('falls back on the first page while the newest-first Firestore index is unavailable', () => {
    expect(shouldFallbackDiscoverNewestFirstQuery({ code: 'failed-precondition' }, true)).toBeTrue();
    expect(shouldFallbackDiscoverNewestFirstQuery({ code: 'firestore/failed-precondition' }, true)).toBeTrue();
    expect(shouldFallbackDiscoverNewestFirstQuery({ code: 'permission-denied' }, true)).toBeFalse();
    expect(shouldFallbackDiscoverNewestFirstQuery({ code: 'failed-precondition' }, false)).toBeFalse();
  });

  it('appends later discover pages without moving cards that are already visible', () => {
    const existing = [
      { id: 'first', title: 'First', createdAt: '2026-03-03T00:00:00.000Z', version: 1 },
      { id: 'second', title: 'Second', createdAt: '2026-03-02T00:00:00.000Z', version: 1 },
    ];
    const incoming = [
      { id: 'fourth', title: 'Fourth', createdAt: '2026-02-28T00:00:00.000Z', version: 1 },
      { id: 'second', title: 'Second updated', createdAt: '2026-03-02T00:00:00.000Z', version: 2 },
      { id: 'third', title: 'Third', createdAt: '2026-03-01T00:00:00.000Z', version: 1 },
    ];

    const merged = appendDiscoverBoardPage(existing, incoming);

    expect(merged.map((item) => item.id)).toEqual(['first', 'second', 'third', 'fourth']);
    expect(merged[1].version).toBe(2);
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

  it('keeps university empty until the user selects one', () => {
    const component = createComponent();
    component.setHomeDirectoryCategory('Universities');

    expect(component.mobileSelectedUniversity()).toBeNull();
    expect(component.mobileDirectoryPreferenceName()).toBe('Choose a university');
  });

  it('returns only the two best city suggestions and supports acronym matches', () => {
    const component = createComponent();
    component.liveWikis.set([
      {
        title: 'LivingWiki: Philadelphia', subtitle: 'Philadelphia', description: '', category: 'Cities & Regions',
        status: 'live', link: '/chat/philly', slug: 'philly', countryLabel: 'United States',
      } as any,
      {
        title: 'LivingWiki: Phoenix', subtitle: 'Phoenix', description: '', category: 'Cities & Regions',
        status: 'live', link: '/chat/phoenix', slug: 'phoenix', countryLabel: 'United States',
      } as any,
      {
        title: 'LivingWiki: Phnom Penh', subtitle: 'Phnom Penh', description: '', category: 'Cities & Regions',
        status: 'live', link: '/chat/phnom-penh', slug: 'phnom-penh', countryLabel: 'Cambodia',
      } as any,
    ]);
    component.onSearchInput('Ph');

    expect(component.directorySuggestions().length).toBe(2);
    expect(component.directorySuggestions()[0].slug).toBe('philly');
  });

  it('selects and clears a university preference independently from the city', async () => {
    const component = createComponent();
    const university = {
      title: 'LivingWiki: Massachusetts Institute of Technology',
      subtitle: 'Massachusetts Institute of Technology',
      description: '',
      category: 'Universities',
      status: 'live',
      link: '/chat/mit',
      slug: 'massachusetts-institute-of-technology',
      universityCity: 'Cambridge',
      universityState: 'Massachusetts',
    } as any;
    component.liveWikis.set([university]);
    component.setHomeDirectoryCategory('Universities');
    component.onSearchInput('MIT');

    expect(component.directorySuggestions()[0]).toBe(university);
    await component.selectHomeDirectoryPreference(university);
    expect(component.mobileSelectedUniversitySlug()).toBe('massachusetts-institute-of-technology');
    expect(component.mobileSelectedCitySlug()).toBe('philly');

    await component.clearHomeDirectoryPreference();
    expect(component.mobileSelectedUniversitySlug()).toBeNull();
    expect(component.mobileSelectedCitySlug()).toBe('philly');
  });
});
