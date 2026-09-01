import { Directive, ElementRef, HostListener, inject, output } from '@angular/core';

/**
 * Dismisses an overlay only when the same pointer presses and releases directly
 * on its backdrop. This prevents a text-selection drag that ends outside a
 * dialog from being interpreted as a backdrop click.
 */
@Directive({
  selector: '[appBackdropDismiss]',
})
export class BackdropDismissDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private pointerStartedOnBackdrop: number | null = null;

  readonly backdropDismiss = output<void>();

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    this.pointerStartedOnBackdrop = event.target === this.host.nativeElement
      ? event.pointerId
      : null;
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(event: PointerEvent): void {
    const shouldDismiss = this.pointerStartedOnBackdrop === event.pointerId
      && event.target === this.host.nativeElement;
    this.pointerStartedOnBackdrop = null;
    if (shouldDismiss) {
      this.backdropDismiss.emit();
    }
  }

  @HostListener('pointercancel', ['$event'])
  onPointerCancel(event: PointerEvent): void {
    if (this.pointerStartedOnBackdrop === event.pointerId) {
      this.pointerStartedOnBackdrop = null;
    }
  }
}
