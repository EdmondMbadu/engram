import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { WorkspaceNavigationOverlayService } from '../workspace-navigation/workspace-navigation';
import { MobileMenuComponent } from './mobile-menu';

describe('MobileMenuComponent', () => {
  let fixture: ComponentFixture<MobileMenuComponent>;

  beforeEach(async () => {
    window.localStorage.removeItem('lw-board-actions:mobile-menu-test-user');
    window.localStorage.removeItem('livingwiki-board-actions-v1:mobile-menu-test-user');

    await TestBed.configureTestingModule({
      imports: [MobileMenuComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            uid: signal('mobile-menu-test-user'),
            profile: signal({ preferredCitySlug: 'my-living-wiki-las-vegas' }),
            isAuthenticated: signal(true),
          },
        },
        {
          provide: AtlasService,
          useValue: {
            activeAtlasWikiLink: signal('/wiki/philly'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MobileMenuComponent);
    fixture.detectChanges();
  });

  it('uses the canonical navigation in the authenticated mobile drawer', () => {
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.workspace-menu-trigger')?.click();
    fixture.detectChanges();

    const labels = Array.from(
      host.querySelectorAll<HTMLElement>('.workspace-mobile-item > span:nth-child(2)'),
    ).map((element) => element.textContent?.trim());

    expect(labels).toEqual([
      'Discover',
      'My City Las Vegas',
      'My Boards',
      'My Songs',
      'My Videos',
      'My Friends',
      'My Trips',
      'My Trove · Starfold City',
      'Business',
      'About',
      'More',
    ]);
  });

  it('closes the drawer and opens the shared More dialog', () => {
    const overlay = TestBed.inject(WorkspaceNavigationOverlayService);
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.workspace-menu-trigger')?.click();
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('.workspace-mobile-item--more')?.click();

    expect(fixture.componentInstance.menuOpen()).toBeFalse();
    expect(overlay.moreOpen()).toBeTrue();
  });
});
