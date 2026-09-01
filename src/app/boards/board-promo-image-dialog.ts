import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  input,
  signal,
} from '@angular/core';
import { BackdropDismissDirective } from '../backdrop-dismiss.directive';
import {
  boardPromoFileName,
  renderBoardPromoImage,
  type BoardPromoImageSpec,
} from './board-promo-image';

@Component({
  selector: 'app-board-promo-image-dialog',
  imports: [BackdropDismissDirective],
  templateUrl: './board-promo-image-dialog.html',
  styleUrl: './board-promo-image-dialog.css',
})
export class BoardPromoImageDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;
  @ViewChild('closeButton') private closeButton?: ElementRef<HTMLButtonElement>;

  readonly title = input.required<string>();
  readonly description = input('');
  readonly ownerName = input('');
  readonly updatedLabel = input('');
  readonly cardCount = input(0);
  readonly coverImageUrl = input('');
  readonly boardUrl = input.required<string>();
  readonly boardTypeLabel = input('Board');
  readonly icon = input('dashboard_customize');

  @Output() closed = new EventEmitter<void>();
  @Output() downloaded = new EventEmitter<void>();

  readonly showQrCode = signal(true);
  readonly showDescription = signal(true);
  readonly rendering = signal(true);
  readonly previewUrl = signal('');
  readonly error = signal<string | null>(null);
  readonly statusMessage = signal('Preparing your promo image…');

  private renderRun = 0;
  private promoBlob: Blob | null = null;
  private focusFrame: number | null = null;

  ngOnInit(): void {
    void this.renderPreview();
  }

  ngAfterViewInit(): void {
    this.focusFrame = requestAnimationFrame(() => {
      this.focusFrame = null;
      this.closeButton?.nativeElement.focus();
    });
  }

  ngOnDestroy(): void {
    this.renderRun += 1;
    if (this.focusFrame !== null) cancelAnimationFrame(this.focusFrame);
    this.revokePreviewUrl();
  }

  close(): void {
    this.closed.emit();
  }

  setShowQrCode(checked: boolean): void {
    if (this.showQrCode() === checked) return;
    this.showQrCode.set(checked);
    void this.renderPreview();
  }

  setShowDescription(checked: boolean): void {
    if (this.showDescription() === checked) return;
    this.showDescription.set(checked);
    void this.renderPreview();
  }

  retry(): void {
    void this.renderPreview();
  }

  download(): void {
    if (!this.promoBlob || this.rendering()) return;
    const url = URL.createObjectURL(this.promoBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = boardPromoFileName(this.boardUrl(), this.title());
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Keep the object URL alive long enough for slower browsers to begin saving it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    this.statusMessage.set(`Downloaded ${anchor.download}`);
    this.downloaded.emit();
  }

  onDialogKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = this.focusableElements();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private async renderPreview(): Promise<void> {
    const run = ++this.renderRun;
    this.rendering.set(true);
    this.error.set(null);
    this.statusMessage.set('Preparing your promo image…');
    try {
      const blob = await renderBoardPromoImage(this.promoSpec());
      if (run !== this.renderRun) return;
      this.promoBlob = blob;
      this.revokePreviewUrl();
      this.previewUrl.set(URL.createObjectURL(blob));
      this.statusMessage.set('Preview ready · 2400 × 1260 PNG');
    } catch (error) {
      if (run !== this.renderRun) return;
      this.promoBlob = null;
      this.revokePreviewUrl();
      this.error.set(this.errorMessage(error));
      this.statusMessage.set('Promo image unavailable.');
    } finally {
      if (run === this.renderRun) this.rendering.set(false);
    }
  }

  private promoSpec(): BoardPromoImageSpec {
    return {
      title: this.title(),
      description: this.description(),
      ownerName: this.ownerName(),
      updatedLabel: this.updatedLabel(),
      cardCount: this.cardCount(),
      coverImageUrl: this.coverImageUrl(),
      boardUrl: this.boardUrl(),
      boardTypeLabel: this.boardTypeLabel(),
      icon: this.icon(),
      showQrCode: this.showQrCode(),
      showDescription: this.showDescription(),
    };
  }

  private revokePreviewUrl(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set('');
  }

  private focusableElements(): HTMLElement[] {
    const root = this.dialog?.nativeElement;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute('hidden') && element.offsetParent !== null);
  }

  private errorMessage(error: unknown): string {
    const message = error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
    return message || 'The promo image could not be prepared. Check the cover image and try again.';
  }
}
