import { Component, input, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterLink } from '@angular/router';
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
  let router: Router;

  const item: VideoLibraryItem = {
    id: 'board_board-1',
    ownerUserId: 'user-1',
    sourceType: 'board',
    videoKind: 'full',
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
    router = TestBed.inject(Router);
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
    expect(fixture.nativeElement.textContent).toContain('Latest');
    expect(fixture.nativeElement.textContent).toContain('0:42');
    expect(fixture.nativeElement.querySelector('.video-library-menu-link-row__open')?.getAttribute('href'))
      .toBe('https://www.livingwiki.com/share/board/board-1/video?v=latest');
    expect(fixture.nativeElement.textContent).toContain('Copy public link');

    const actionsMenu = fixture.nativeElement.querySelector('.video-library-details') as HTMLDetailsElement;
    actionsMenu.querySelector('summary')?.click();
    fixture.detectChanges();
    expect(actionsMenu.open).toBeTrue();
    expect(actionsMenu.textContent).toContain('Open board');
    expect(actionsMenu.textContent).toContain('Regenerate video');
    expect(actionsMenu.textContent).toContain('Delete video');

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

  it('contains long titles and keeps every video action inside the card', async () => {
    const longTitle = "Avengers Franchise: The Earth's Mightiest Heroes and Their Greatest Battles";
    loadItems.and.resolveTo([{ ...item, sourceTitle: longTitle }]);
    await createComponent();

    const title = fixture.nativeElement.querySelector('.video-library-card__heading h3') as HTMLElement;
    const actions = fixture.nativeElement.querySelector('.video-library-actions') as HTMLElement;
    const buttons = actions.querySelectorAll(':scope > button');
    const download = buttons.item(2) as HTMLElement;
    const titleStyle = getComputedStyle(title);

    expect(title.textContent).toContain(longTitle);
    expect(titleStyle.overflow).toBe('hidden');
    expect(titleStyle.getPropertyValue('-webkit-line-clamp')).toBe('2');
    expect(buttons.length).toBe(3);
    expect(download.textContent).toContain('Download');
    expect(download.getBoundingClientRect().right)
      .toBeLessThanOrEqual(actions.getBoundingClientRect().right + 0.5);
  });

  it('opens the source board share panel when updating a video', async () => {
    loadItems.and.resolveTo([{
      ...item,
      sourceId: 'b38db631-9bac-4a07-bd74-4750aefc7355',
      sourceRoute: '/boards/b38db631-9bac-4a07-bd74-4750aefc7355',
      currentSourceUpdatedAt: '2026-08-06T03:00:00.000Z',
    }]);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    await createComponent();

    fixture.nativeElement.querySelector('.video-library-update-note').click();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledOnceWith(
      ['/boards', 'b38db631-9bac-4a07-bd74-4750aefc7355'],
      { queryParams: { share: 'video' } },
    );
  });
});
