import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { WorkspaceNavigationOverlayService } from '../workspace-navigation/workspace-navigation';
import { WorkspaceSidebarComponent } from './workspace-sidebar';

describe('WorkspaceSidebarComponent', () => {
  let fixture: ComponentFixture<WorkspaceSidebarComponent>;

  beforeEach(async () => {
    window.localStorage.removeItem('lw-board-actions:sidebar-test-user');
    window.localStorage.removeItem('livingwiki-board-actions-v1:sidebar-test-user');
    window.localStorage.removeItem('lw-sidebar-collapsed');

    await TestBed.configureTestingModule({
      imports: [WorkspaceSidebarComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            uid: signal('sidebar-test-user'),
            profile: signal({ preferredCitySlug: 'my-living-wiki-las-vegas' }),
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

    fixture = TestBed.createComponent(WorkspaceSidebarComponent);
    fixture.componentRef.setInput('rail', true);
    fixture.detectChanges();
  });

  it('renders the canonical signed-in navigation in the desktop rail', () => {
    const host = fixture.nativeElement as HTMLElement;
    const labels = Array.from(
      host.querySelectorAll<HTMLElement>('.workspace-sidebar__item > span:nth-child(2)'),
    ).map((element) => element.textContent?.trim());

    expect(labels).toEqual([
      'Home',
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

  it('opens the shared More dialog from the rail', () => {
    const overlay = TestBed.inject(WorkspaceNavigationOverlayService);
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('.workspace-sidebar__more')?.click();

    expect(overlay.moreOpen()).toBeTrue();
    expect(overlay.aboutOpen()).toBeFalse();
  });

  it('collapses and reopens from the shared desktop toggle', () => {
    const host = fixture.nativeElement as HTMLElement;
    const toggle = host.querySelector<HTMLButtonElement>('.workspace-sidebar__toggle');
    const sidebar = host.querySelector<HTMLElement>('.workspace-sidebar');

    toggle?.click();
    fixture.detectChanges();
    expect(sidebar?.classList.contains('workspace-sidebar--collapsed')).toBeTrue();
    expect(toggle?.getAttribute('aria-label')).toBe('Open sidebar');
    expect(window.localStorage.getItem('lw-sidebar-collapsed')).toBe('true');

    toggle?.click();
    fixture.detectChanges();
    expect(sidebar?.classList.contains('workspace-sidebar--collapsed')).toBeFalse();
    expect(toggle?.getAttribute('aria-label')).toBe('Close sidebar');
    expect(window.localStorage.getItem('lw-sidebar-collapsed')).toBe('false');
  });
});
