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

  it('accepts text input without leaking keystrokes to the page behind the dialog', async () => {
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

    const pageKeydown = jasmine.createSpy('pageKeydown');
    document.addEventListener('keydown', pageKeydown);
    try {
      const host = fixture.nativeElement as HTMLElement;
      const nameInput = host.querySelector<HTMLInputElement>('input[type="text"]')!;
      const descriptionInput = host.querySelector<HTMLTextAreaElement>('textarea')!;
      const searchInput = host.querySelector<HTMLInputElement>('input[type="search"]')!;

      nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', bubbles: true }));
      nameInput.value = 'Philadelphia favorites';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      descriptionInput.value = 'The best boards around the city';
      descriptionInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.value = 'restaurant';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();

      expect(pageKeydown).not.toHaveBeenCalled();
      expect(fixture.componentInstance.title()).toBe('Philadelphia favorites');
      expect(fixture.componentInstance.description()).toBe('The best boards around the city');
      expect(fixture.componentInstance.search()).toBe('restaurant');
      expect(fixture.componentInstance.filteredChoices().map((choice) => choice.id)).toEqual(['board-two']);
    } finally {
      document.removeEventListener('keydown', pageKeydown);
    }
  });
});
