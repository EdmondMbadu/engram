import { Component, EventEmitter, Output, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { BoardCollection } from '../board-collections.service';

@Component({
  selector: 'app-board-collection-list',
  imports: [RouterLink],
  templateUrl: './board-collection-list.html',
  styleUrl: './board-collection-list.css',
})
export class BoardCollectionListComponent {
  readonly collections = input.required<BoardCollection[]>();
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly canCreate = input(false);
  readonly searching = input(false);
  @Output() createRequested = new EventEmitter<void>();

  collectionRoute(collectionItem: BoardCollection): string[] {
    if (collectionItem.customSlug) {
      return ['/collections', collectionItem.customSlug];
    }
    return ['/boards/u', collectionItem.ownerPublicSlug, 'collections', collectionItem.slug];
  }
}
