import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomPublicUrlService } from '../custom-public-url';
import { CustomPublicUrlDialogComponent } from './custom-public-url-dialog';

describe('CustomPublicUrlDialogComponent', () => {
  const customUrls = {
    isAvailable: jasmine.createSpy('isAvailable').and.resolveTo(true),
    set: jasmine.createSpy('set').and.callFake(async (_type: string, resourceId: string, slug: string) => ({
      resourceType: 'board' as const,
      resourceId,
      slug,
      path: `/boards/${slug}`,
    })),
  };

  beforeEach(async () => {
    customUrls.isAvailable.calls.reset();
    customUrls.set.calls.reset();
    await TestBed.configureTestingModule({
      imports: [CustomPublicUrlDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CustomPublicUrlService, useValue: customUrls },
      ],
    }).compileComponents();
  });

  it('prefills a normalized suggestion from the resource title', () => {
    const fixture = TestBed.createComponent(CustomPublicUrlDialogComponent);
    fixture.componentRef.setInput('resourceType', 'board');
    fixture.componentRef.setInput('resourceId', 'board-1');
    fixture.componentRef.setInput('resourceTitle', 'Cape May Gems!');
    fixture.componentRef.setInput('eligible', true);
    fixture.componentRef.setInput('publicResource', true);
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('cape-may-gems');
    expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).value).toBe('cape-may-gems');
  });

  it('shows the upgrade state without exposing a save button', () => {
    const fixture = TestBed.createComponent(CustomPublicUrlDialogComponent);
    fixture.componentRef.setInput('resourceType', 'board');
    fixture.componentRef.setInput('resourceId', 'board-1');
    fixture.componentRef.setInput('resourceTitle', 'Cape May Gems');
    fixture.componentRef.setInput('eligible', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Custom URLs are a paid feature.');
    expect(fixture.nativeElement.querySelector('.custom-url-dialog__save')).toBeNull();
  });

  it('keeps natural typing intact while previewing and saving the normalized URL', async () => {
    const fixture = TestBed.createComponent(CustomPublicUrlDialogComponent);
    fixture.componentRef.setInput('resourceType', 'board');
    fixture.componentRef.setInput('resourceId', 'board-1');
    fixture.componentRef.setInput('resourceTitle', 'Original board');
    fixture.componentRef.setInput('eligible', true);
    fixture.componentRef.setInput('publicResource', true);
    fixture.detectChanges();

    fixture.componentInstance.updateValue('Cape May Gems');
    expect(fixture.componentInstance.value()).toBe('Cape May Gems');
    expect(fixture.componentInstance.normalizedSlug()).toBe('cape-may-gems');
    // Saving stays responsive while the non-authoritative availability hint is running.
    expect(fixture.componentInstance.canSave()).toBeTrue();

    await fixture.componentInstance.save();
    expect(customUrls.set).toHaveBeenCalledWith('board', 'board-1', 'cape-may-gems');
  });

  it('always exposes a copy action when a custom URL already exists', () => {
    const fixture = TestBed.createComponent(CustomPublicUrlDialogComponent);
    fixture.componentRef.setInput('resourceType', 'board');
    fixture.componentRef.setInput('resourceId', 'board-1');
    fixture.componentRef.setInput('resourceTitle', 'Cape May Gems');
    fixture.componentRef.setInput('currentSlug', 'cape-may-gems');
    fixture.componentRef.setInput('eligible', true);
    fixture.componentRef.setInput('publicResource', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Current custom link');
    expect(fixture.nativeElement.textContent).toContain('livingwiki.com/boards/cape-may-gems');
    expect(fixture.nativeElement.querySelector('.custom-url-dialog__current button')).not.toBeNull();
  });
});
