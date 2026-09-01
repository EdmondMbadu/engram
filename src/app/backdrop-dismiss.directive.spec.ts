import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BackdropDismissDirective } from './backdrop-dismiss.directive';

@Component({
  imports: [BackdropDismissDirective],
  template: `
    <div class="backdrop" appBackdropDismiss (backdropDismiss)="dismissals = dismissals + 1">
      <section class="dialog"><p class="copy">Selectable dialog text</p></section>
    </div>
  `,
})
class BackdropDismissHostComponent {
  dismissals = 0;
}

describe('BackdropDismissDirective', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BackdropDismissHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('dismisses after a complete press and release on the backdrop', () => {
    const fixture = TestBed.createComponent(BackdropDismissHostComponent);
    fixture.detectChanges();
    const backdrop = fixture.nativeElement.querySelector('.backdrop') as HTMLElement;

    dispatchPointer(backdrop, 'pointerdown', 1);
    dispatchPointer(backdrop, 'pointerup', 1);

    expect(fixture.componentInstance.dismissals).toBe(1);
  });

  it('does not dismiss when a text-selection drag begins in the dialog and ends on the backdrop', () => {
    const fixture = TestBed.createComponent(BackdropDismissHostComponent);
    fixture.detectChanges();
    const backdrop = fixture.nativeElement.querySelector('.backdrop') as HTMLElement;
    const copy = fixture.nativeElement.querySelector('.copy') as HTMLElement;

    dispatchPointer(copy, 'pointerdown', 2);
    dispatchPointer(backdrop, 'pointerup', 2);

    expect(fixture.componentInstance.dismissals).toBe(0);
  });

  it('does not dismiss when a drag begins on the backdrop and ends in the dialog', () => {
    const fixture = TestBed.createComponent(BackdropDismissHostComponent);
    fixture.detectChanges();
    const backdrop = fixture.nativeElement.querySelector('.backdrop') as HTMLElement;
    const dialog = fixture.nativeElement.querySelector('.dialog') as HTMLElement;

    dispatchPointer(backdrop, 'pointerdown', 3);
    dispatchPointer(dialog, 'pointerup', 3);

    expect(fixture.componentInstance.dismissals).toBe(0);
  });

  it('does not dismiss a cancelled pointer gesture', () => {
    const fixture = TestBed.createComponent(BackdropDismissHostComponent);
    fixture.detectChanges();
    const backdrop = fixture.nativeElement.querySelector('.backdrop') as HTMLElement;

    dispatchPointer(backdrop, 'pointerdown', 4);
    dispatchPointer(backdrop, 'pointercancel', 4);
    dispatchPointer(backdrop, 'pointerup', 4);

    expect(fixture.componentInstance.dismissals).toBe(0);
  });
});

function dispatchPointer(target: HTMLElement, type: string, pointerId: number): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId }));
}
