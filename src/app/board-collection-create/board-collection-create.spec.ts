import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BoardCollectionsService, type BoardCollectionChoice } from '../board-collections.service';
import { BoardCollectionCreateComponent } from './board-collection-create';

const choices: BoardCollectionChoice[] = [
  {
    id: 'board-one',
    title: 'Philadelphia History',
    description: 'Historic places around the city.',
    imageUrl: '',
    icon: 'museum',
    tone: 'teal',
    kind: 'standard',
    cardCount: 12,
  },
  {
    id: 'board-two',
    title: 'Favorite Restaurants',
    description: 'Places to eat.',
    imageUrl: '',
    icon: 'restaurant',
    tone: 'sun',
    kind: 'standard',
    cardCount: 8,
  },
];

describe('BoardCollectionCreateComponent', () => {
  it('requires a title and at least one board', async () => {
    const create = jasmine.createSpy('create');
    await TestBed.configureTestingModule({
      imports: [BoardCollectionCreateComponent],
      providers: [provideZonelessChangeDetection(), { provide: BoardCollectionsService, useValue: { create } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(BoardCollectionCreateComponent);
    fixture.componentRef.setInput('choices', choices);
    fixture.componentRef.setInput('ownerPublicSlug', 'edmond-mbadu');
    fixture.componentRef.setInput('ownerDisplayName', 'Edmond Mbadu');
    fixture.detectChanges();

    expect(fixture.componentInstance.canCreate()).toBeFalse();
    fixture.componentInstance.title.set('Philadelphia Favorites');
    fixture.componentInstance.toggleChoice('board-two');

    expect(fixture.componentInstance.canCreate()).toBeTrue();
    expect(fixture.componentInstance.selectedIds()).toEqual(new Set(['board-two']));
  });

  it('filters the board picker without losing the selection', async () => {
    await TestBed.configureTestingModule({
      imports: [BoardCollectionCreateComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BoardCollectionsService, useValue: { create: jasmine.createSpy('create') } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(BoardCollectionCreateComponent);
    fixture.componentRef.setInput('choices', choices);
    fixture.componentRef.setInput('ownerPublicSlug', 'edmond-mbadu');
    fixture.componentRef.setInput('ownerDisplayName', 'Edmond Mbadu');
    fixture.detectChanges();

    fixture.componentInstance.toggleChoice('board-one');
    fixture.componentInstance.search.set('restaurant');

    expect(fixture.componentInstance.filteredChoices().map((choice) => choice.id)).toEqual(['board-two']);
    expect(fixture.componentInstance.isSelected('board-one')).toBeTrue();
  });
});
