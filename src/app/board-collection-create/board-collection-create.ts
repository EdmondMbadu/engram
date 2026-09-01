import { AfterViewInit, Component, ElementRef, EventEmitter, Output, ViewChild, computed, inject, input, signal } from '@angular/core';
import { BackdropDismissDirective } from '../backdrop-dismiss.directive';
import {
  BOARD_COLLECTION_MAX_BOARDS,
  BoardCollectionsService,
  type BoardCollection,
  type BoardCollectionChoice,
  type CreateBoardCollectionInput,
} from '../board-collections.service';

@Component({
  selector: 'app-board-collection-create',
  imports: [BackdropDismissDirective],
  templateUrl: './board-collection-create.html',
  styleUrl: './board-collection-create.css',
})
export class BoardCollectionCreateComponent implements AfterViewInit {
  private readonly collectionsService = inject(BoardCollectionsService);
  @ViewChild('titleInput') private titleInput?: ElementRef<HTMLInputElement>;

  readonly choices = input.required<BoardCollectionChoice[]>();
  readonly loadingChoices = input(false);
  readonly ownerPublicSlug = input.required<string>();
  readonly ownerDisplayName = input.required<string>();
  readonly ownerPhotoUrl = input('');
  readonly ownerProfileIcon = input('');
  readonly ownerProfilePictureType = input<'icon' | 'image' | null>(null);
  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<BoardCollection>();

  readonly title = signal('');
  readonly description = signal('');
  readonly search = signal('');
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly maxBoards = BOARD_COLLECTION_MAX_BOARDS;
  readonly filteredChoices = computed(() => {
    const query = this.search().trim().toLowerCase();
    if (!query) return this.choices();
    return this.choices().filter((choice) => [choice.title, choice.description]
      .join(' ')
      .toLowerCase()
      .includes(query));
  });
  readonly canCreate = computed(() =>
    !!this.title().trim()
    && this.selectedIds().size > 0
    && !this.saving()
    && !this.loadingChoices(),
  );

  ngAfterViewInit(): void {
    requestAnimationFrame(() => this.titleInput?.nativeElement.focus());
  }

  onDialogKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') this.close();
  }

  close(): void {
    if (!this.saving()) this.closed.emit();
  }

  toggleChoice(id: string): void {
    if (this.saving()) return;
    this.error.set(null);
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < BOARD_COLLECTION_MAX_BOARDS) {
        next.add(id);
      }
      return next;
    });
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  selectAllVisible(): void {
    const next = new Set(this.selectedIds());
    for (const choice of this.filteredChoices()) {
      if (next.size >= BOARD_COLLECTION_MAX_BOARDS) break;
      next.add(choice.id);
    }
    this.selectedIds.set(next);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  async createCollection(): Promise<void> {
    if (!this.canCreate()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const selected = this.selectedIds();
      const input: CreateBoardCollectionInput = {
        title: this.title(),
        description: this.description(),
        choices: this.choices().filter((choice) => selected.has(choice.id)),
        ownerPublicSlug: this.ownerPublicSlug(),
        ownerDisplayName: this.ownerDisplayName(),
        ownerPhotoUrl: this.ownerPhotoUrl(),
        ownerProfileIcon: this.ownerProfileIcon(),
        ownerProfilePictureType: this.ownerProfilePictureType(),
      };
      this.created.emit(await this.collectionsService.create(input));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The collection could not be created.');
    } finally {
      this.saving.set(false);
    }
  }
}
