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
});
