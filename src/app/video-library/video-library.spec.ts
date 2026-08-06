import { Component, input, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import type { VideoLibraryItem } from './video-library.models';
import { VideoLibraryService } from './video-library.service';
import { VideoLibraryComponent } from './video-library';

@Component({ selector: 'app-workspace-sidebar', template: '' })
class WorkspaceSidebarStubComponent {
  readonly active = input('');
  readonly rail = input(false);
}

@Component({ selector: 'app-mobile-menu', template: '' })
class MobileMenuStubComponent {
  readonly activePage = input('');
}

@Component({ selector: 'app-theme-toggle', template: '' })
class ThemeToggleStubComponent {}

@Component({ selector: 'app-account-menu', template: '' })
class AccountMenuStubComponent {}

describe('VideoLibraryComponent', () => {
  let fixture: ComponentFixture<VideoLibraryComponent>;
  let loadItems: jasmine.Spy;

  const item: VideoLibraryItem = {
    id: 'board_board-1',
    ownerUserId: 'user-1',
    sourceType: 'board',
    sourceId: 'board-1',
    sourceTitle: 'Odysseus',
    sourceRoute: '/boards/board-1',
    sourceAvailable: true,
    sourceUpdatedAt: '2026-08-06T02:00:00.000Z',
    currentSourceUpdatedAt: '2026-08-06T02:00:00.000Z',
    posterUrl: 'https://example.com/poster.jpg',
    videoUrl: 'https://example.com/video.mp4',
    storagePath: 'users/user-1/video-library/boards/board-1/latest.mp4',
    publicStoragePath: '',
    publicShareUrl: 'https://www.livingwiki.com/share/board/board-1/video?v=latest',
    mimeType: 'video/mp4',
    ratio: 'vertical',
    durationSeconds: 42,
    renderVersion: 'stack-video-v9',
    narrationEnabled: true,
    generatedAt: '2026-08-06T02:00:00.000Z',
  };

  beforeEach(async () => {
    loadItems = jasmine.createSpy('loadItems').and.resolveTo([item]);
    await TestBed.configureTestingModule({
      imports: [VideoLibraryComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: VideoLibraryService,
          useValue: {
            loadItems,
            deleteItem: jasmine.createSpy('deleteItem').and.resolveTo(),
          },
        },
      ],
    })
      .overrideComponent(VideoLibraryComponent, {
        set: {
          imports: [
            RouterLink,
            WorkspaceSidebarStubComponent,
            MobileMenuStubComponent,
            ThemeToggleStubComponent,
            AccountMenuStubComponent,
          ],
        },
      })
      .compileComponents();
  });

  async function createComponent(): Promise<void> {
    fixture = TestBed.createComponent(VideoLibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('renders the latest board video and opens its player', async () => {
    await createComponent();

    expect(fixture.nativeElement.querySelector('h3')?.textContent).toContain('Odysseus');
    expect(fixture.nativeElement.textContent).toContain('Current version');
    expect(fixture.nativeElement.textContent).toContain('0:42');
    expect(fixture.nativeElement.querySelector('.video-library-link input')?.value)
      .toBe('https://www.livingwiki.com/share/board/board-1/video?v=latest');
    expect(fixture.nativeElement.textContent).toContain('Copy link');

    fixture.nativeElement.querySelector('.video-library-poster').click();
    fixture.detectChanges();
    const player = fixture.nativeElement.querySelector('.video-library-player video') as HTMLVideoElement | null;
    expect(player?.getAttribute('src')).toBe('https://example.com/video.mp4');
  });

  it('shows the automatic-save empty state', async () => {
    loadItems.and.resolveTo([]);
    await createComponent();

    expect(fixture.nativeElement.textContent).toContain('Your generated videos will appear here automatically.');
    expect(fixture.nativeElement.querySelector('a[href="/boards"]')).not.toBeNull();
  });
});
