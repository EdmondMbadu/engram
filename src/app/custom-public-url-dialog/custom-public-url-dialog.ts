import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CustomPublicUrlService,
  customPublicUrlPath,
  customPublicUrlSlugError,
  normalizeCustomPublicUrlSlug,
  type CustomPublicUrlResourceType,
  type SetCustomPublicUrlResult,
} from '../custom-public-url';

@Component({
  selector: 'app-custom-public-url-dialog',
  imports: [RouterLink],
  templateUrl: './custom-public-url-dialog.html',
  styleUrl: './custom-public-url-dialog.css',
})
export class CustomPublicUrlDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly customUrls = inject(CustomPublicUrlService);
  private availabilityTimer: ReturnType<typeof setTimeout> | null = null;
  private availabilityRun = 0;
  private focusFrame: number | null = null;

  @ViewChild('slugInput') private slugInput?: ElementRef<HTMLInputElement>;

  readonly resourceType = input.required<CustomPublicUrlResourceType>();
  readonly resourceId = input.required<string>();
  readonly resourceTitle = input.required<string>();
  readonly currentSlug = input('');
  readonly eligible = input(false);
  readonly publicResource = input(true);
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<SetCustomPublicUrlResult>();

  readonly value = signal('');
  readonly availability = signal<'idle' | 'checking' | 'available' | 'taken'>('idle');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedResult = signal<SetCustomPublicUrlResult | null>(null);
  readonly normalizedSlug = computed(() => normalizeCustomPublicUrlSlug(this.value()));
  readonly validationError = computed(() => customPublicUrlSlugError(this.normalizedSlug()));
  readonly resourceLabel = computed(() => this.resourceType() === 'board' ? 'board' : 'collection');
  readonly prefix = computed(() => this.resourceType() === 'board' ? 'livingwiki.com/boards/' : 'livingwiki.com/collections/');
  readonly previewPath = computed(() => customPublicUrlPath(this.resourceType(), this.normalizedSlug()));
  readonly canSave = computed(() =>
    this.eligible()
    && this.publicResource()
    && !this.validationError()
    && this.availability() === 'available'
    && !this.saving(),
  );

  ngOnInit(): void {
    this.value.set(this.currentSlug() || normalizeCustomPublicUrlSlug(this.resourceTitle()));
  }

  ngAfterViewInit(): void {
    this.focusFrame = requestAnimationFrame(() => {
      this.focusFrame = null;
      this.slugInput?.nativeElement.focus();
      this.slugInput?.nativeElement.select();
      this.scheduleAvailabilityCheck();
    });
  }

  ngOnDestroy(): void {
    if (this.focusFrame !== null) cancelAnimationFrame(this.focusFrame);
    if (this.availabilityTimer) clearTimeout(this.availabilityTimer);
    this.availabilityRun += 1;
  }

  onDialogKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape' && !this.saving()) this.closed.emit();
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      void this.save();
    }
  }

  updateValue(value: string): void {
    this.value.set(normalizeCustomPublicUrlSlug(value));
    this.error.set(null);
    this.savedResult.set(null);
    this.scheduleAvailabilityCheck();
  }

  close(): void {
    if (!this.saving()) this.closed.emit();
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.customUrls.set(this.resourceType(), this.resourceId(), this.normalizedSlug());
      this.value.set(result.slug);
      this.savedResult.set(result);
      this.availability.set('available');
      this.saved.emit(result);
    } catch (error) {
      this.error.set(this.errorMessage(error));
      this.scheduleAvailabilityCheck();
    } finally {
      this.saving.set(false);
    }
  }

  async copy(): Promise<void> {
    const result = this.savedResult();
    if (!result || typeof navigator === 'undefined') return;
    const url = `${window.location.origin}${result.path}`;
    try {
      await navigator.clipboard.writeText(url);
      this.error.set('Custom link copied.');
    } catch {
      this.error.set('Copy was blocked. Select the link from your address bar.');
    }
  }

  private scheduleAvailabilityCheck(): void {
    if (this.availabilityTimer) clearTimeout(this.availabilityTimer);
    const run = ++this.availabilityRun;
    if (this.validationError()) {
      this.availability.set('idle');
      return;
    }
    this.availability.set('checking');
    this.availabilityTimer = setTimeout(() => {
      void this.customUrls.isAvailable(this.resourceType(), this.normalizedSlug(), this.resourceId())
        .then((available) => {
          if (run === this.availabilityRun) this.availability.set(available ? 'available' : 'taken');
        })
        .catch(() => {
          if (run === this.availabilityRun) {
            this.availability.set('idle');
            this.error.set('Availability could not be checked. Try again.');
          }
        });
    }, 350);
  }

  private errorMessage(error: unknown): string {
    const message = error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
    if (/already|taken/i.test(message)) return 'That custom URL is already taken.';
    if (/membership|upgrade|permission/i.test(message)) return 'An active paid membership is required to set a custom URL.';
    if (/public/i.test(message)) return `Make this ${this.resourceLabel()} public before setting a custom URL.`;
    return message.replace(/^FirebaseError:\s*/i, '') || 'The custom URL could not be saved.';
  }
}
