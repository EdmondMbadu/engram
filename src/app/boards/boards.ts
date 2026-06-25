import { isPlatformBrowser } from '@angular/common';
import { Component, computed, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import { AccountMenuComponent } from '../account-menu/account-menu';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';

type BoardTone = 'teal' | 'coral' | 'yellow' | 'green' | 'blue' | 'sky' | 'purple';
type BoardCardType = 'place' | 'food' | 'memory' | 'idea' | 'shop' | 'note';
type BoardCardStatus = 'planned' | 'saved' | 'visited' | 'favorite';

type BoardCard = {
  id: string;
  title: string;
  subtitle: string;
  notes: string;
  type: BoardCardType;
  status: BoardCardStatus;
  rating: number;
  imageUrl: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type Board = {
  id: string;
  title: string;
  description: string;
  icon: string;
  tone: BoardTone;
  cards: BoardCard[];
  createdAt: string;
  updatedAt: string;
};

type BoardDraft = {
  title: string;
  description: string;
  icon: string;
  tone: BoardTone;
};

type CardDraft = {
  title: string;
  subtitle: string;
  notes: string;
  type: BoardCardType;
  status: BoardCardStatus;
  rating: string;
  imageUrl: string;
  tags: string;
};

const STORAGE_KEY = 'livingwiki-boards-v1';

const BOARD_TONES: Array<{ id: BoardTone; label: string; accent: string; soft: string }> = [
  { id: 'teal', label: 'Teal', accent: '#007f7a', soft: '#dffcf7' },
  { id: 'coral', label: 'Coral', accent: '#d94d2b', soft: '#ffe2d7' },
  { id: 'yellow', label: 'Gold', accent: '#9a6500', soft: '#fff0b8' },
  { id: 'green', label: 'Green', accent: '#28853c', soft: '#daf8c8' },
  { id: 'blue', label: 'Blue', accent: '#1f62c8', soft: '#ddeeff' },
  { id: 'sky', label: 'Sky', accent: '#087b99', soft: '#dff7ff' },
  { id: 'purple', label: 'Purple', accent: '#7c3ec8', soft: '#f0e4ff' },
];

const CARD_TYPES: Array<{ id: BoardCardType; label: string; icon: string }> = [
  { id: 'place', label: 'Place', icon: 'location_on' },
  { id: 'food', label: 'Food', icon: 'restaurant' },
  { id: 'memory', label: 'Memory', icon: 'auto_stories' },
  { id: 'idea', label: 'Idea', icon: 'lightbulb' },
  { id: 'shop', label: 'Shop', icon: 'storefront' },
  { id: 'note', label: 'Note', icon: 'sticky_note_2' },
];

const CARD_STATUSES: Array<{ id: BoardCardStatus; label: string; icon: string }> = [
  { id: 'planned', label: 'Planned', icon: 'event' },
  { id: 'saved', label: 'Saved', icon: 'bookmark' },
  { id: 'visited', label: 'Visited', icon: 'check_circle' },
  { id: 'favorite', label: 'Favorite', icon: 'kid_star' },
];

const BOARD_ICONS = [
  'dashboard',
  'travel_explore',
  'restaurant',
  'local_cafe',
  'beach_access',
  'festival',
  'hiking',
  'museum',
  'shopping_bag',
  'favorite',
  'auto_awesome',
  'public',
];

@Component({
  selector: 'app-boards',
  imports: [
    WorkspaceSidebarComponent,
    MobileMenuComponent,
    ThemeToggleComponent,
    AccountMenuComponent,
  ],
  templateUrl: './boards.html',
  styleUrl: './boards.css',
})
export class BoardsComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private hasLoaded = false;

  readonly tones = BOARD_TONES;
  readonly cardTypes = CARD_TYPES;
  readonly cardStatuses = CARD_STATUSES;
  readonly boardIcons = BOARD_ICONS;

  readonly boards = signal<Board[]>([]);
  readonly selectedBoardId = signal<string | null>(null);
  readonly boardSearch = signal('');
  readonly cardSearch = signal('');
  readonly boardDialogOpen = signal(false);
  readonly cardDialogOpen = signal(false);
  readonly editingBoardId = signal<string | null>(null);
  readonly editingCardId = signal<string | null>(null);

  readonly boardDraft = signal<BoardDraft>({
    title: '',
    description: '',
    icon: 'dashboard',
    tone: 'teal',
  });
  readonly cardDraft = signal<CardDraft>({
    title: '',
    subtitle: '',
    notes: '',
    type: 'place',
    status: 'saved',
    rating: '4',
    imageUrl: '',
    tags: '',
  });

  readonly selectedBoard = computed(() => {
    const selectedId = this.selectedBoardId();
    return this.boards().find((board) => board.id === selectedId) ?? this.boards()[0] ?? null;
  });
  readonly selectedBoardTitle = computed(() => this.selectedBoard()?.title ?? 'Card');

  readonly filteredBoards = computed(() => {
    const query = this.boardSearch().trim().toLowerCase();
    const boards = [...this.boards()].sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
    if (!query) {
      return boards;
    }

    return boards.filter((board) =>
      [board.title, board.description, board.cards.map((card) => card.title).join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  });

  readonly filteredCards = computed(() => {
    const board = this.selectedBoard();
    const query = this.cardSearch().trim().toLowerCase();
    if (!board) {
      return [];
    }
    const cards = [...board.cards].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    if (!query) {
      return cards;
    }

    return cards.filter((card) =>
      [card.title, card.subtitle, card.notes, card.type, card.status, card.tags.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  });

  readonly totalCards = computed(() =>
    this.boards().reduce((total, board) => total + board.cards.length, 0),
  );
  readonly favoriteCards = computed(() =>
    this.boards().reduce(
      (total, board) => total + board.cards.filter((card) => card.status === 'favorite').length,
      0,
    ),
  );

  constructor() {
    this.loadBoards();

    effect(() => {
      const boards = this.boards();
      if (!this.isBrowser || !this.hasLoaded) {
        return;
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
    });
  }

  selectBoard(boardId: string): void {
    this.selectedBoardId.set(boardId);
    this.cardSearch.set('');
  }

  openCreateBoard(): void {
    this.editingBoardId.set(null);
    this.boardDraft.set({
      title: '',
      description: '',
      icon: 'dashboard',
      tone: this.tones[this.boards().length % this.tones.length]?.id ?? 'teal',
    });
    this.boardDialogOpen.set(true);
  }

  openEditBoard(board: Board): void {
    this.editingBoardId.set(board.id);
    this.boardDraft.set({
      title: board.title,
      description: board.description,
      icon: board.icon,
      tone: board.tone,
    });
    this.boardDialogOpen.set(true);
  }

  closeBoardDialog(): void {
    this.boardDialogOpen.set(false);
    this.editingBoardId.set(null);
  }

  saveBoard(event: Event): void {
    event.preventDefault();
    const draft = this.boardDraft();
    const title = draft.title.trim();
    if (!title) {
      return;
    }

    const now = new Date().toISOString();
    const editingId = this.editingBoardId();
    if (editingId) {
      this.boards.update((boards) =>
        boards.map((board) =>
          board.id === editingId
            ? {
                ...board,
                title,
                description: draft.description.trim(),
                icon: draft.icon,
                tone: draft.tone,
                updatedAt: now,
              }
            : board,
        ),
      );
    } else {
      const board: Board = {
        id: this.createId(),
        title,
        description: draft.description.trim(),
        icon: draft.icon,
        tone: draft.tone,
        cards: [],
        createdAt: now,
        updatedAt: now,
      };
      this.boards.update((boards) => [board, ...boards]);
      this.selectedBoardId.set(board.id);
    }

    this.closeBoardDialog();
  }

  deleteBoard(board: Board): void {
    const message = `Delete "${board.title}" and its ${board.cards.length} card${board.cards.length === 1 ? '' : 's'}?`;
    if (this.isBrowser && !window.confirm(message)) {
      return;
    }

    this.boards.update((boards) => boards.filter((item) => item.id !== board.id));
    if (this.selectedBoardId() === board.id) {
      this.selectedBoardId.set(this.boards()[0]?.id ?? null);
    }
  }

  openCreateCard(boardId = this.selectedBoard()?.id ?? null): void {
    if (!boardId) {
      return;
    }
    this.selectedBoardId.set(boardId);
    this.editingCardId.set(null);
    this.cardDraft.set({
      title: '',
      subtitle: '',
      notes: '',
      type: 'place',
      status: 'saved',
      rating: '4',
      imageUrl: '',
      tags: '',
    });
    this.cardDialogOpen.set(true);
  }

  openEditCard(card: BoardCard): void {
    this.editingCardId.set(card.id);
    this.cardDraft.set({
      title: card.title,
      subtitle: card.subtitle,
      notes: card.notes,
      type: card.type,
      status: card.status,
      rating: String(card.rating),
      imageUrl: card.imageUrl,
      tags: card.tags.join(', '),
    });
    this.cardDialogOpen.set(true);
  }

  closeCardDialog(): void {
    this.cardDialogOpen.set(false);
    this.editingCardId.set(null);
  }

  saveCard(event: Event): void {
    event.preventDefault();
    const board = this.selectedBoard();
    const draft = this.cardDraft();
    const title = draft.title.trim();
    if (!board || !title) {
      return;
    }

    const now = new Date().toISOString();
    const tags = draft.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 6);
    const rating = Math.max(1, Math.min(5, Number.parseInt(draft.rating, 10) || 1));
    const editingId = this.editingCardId();

    this.boards.update((boards) =>
      boards.map((item) => {
        if (item.id !== board.id) {
          return item;
        }

        const nextCards = editingId
          ? item.cards.map((card) =>
              card.id === editingId
                ? {
                    ...card,
                    title,
                    subtitle: draft.subtitle.trim(),
                    notes: draft.notes.trim(),
                    type: draft.type,
                    status: draft.status,
                    rating,
                    imageUrl: draft.imageUrl.trim(),
                    tags,
                    updatedAt: now,
                  }
                : card,
            )
          : [
              {
                id: this.createId(),
                title,
                subtitle: draft.subtitle.trim(),
                notes: draft.notes.trim(),
                type: draft.type,
                status: draft.status,
                rating,
                imageUrl: draft.imageUrl.trim(),
                tags,
                createdAt: now,
                updatedAt: now,
              },
              ...item.cards,
            ];

        return { ...item, cards: nextCards, updatedAt: now };
      }),
    );

    this.closeCardDialog();
  }

  deleteCard(card: BoardCard): void {
    const board = this.selectedBoard();
    if (!board) {
      return;
    }
    if (this.isBrowser && !window.confirm(`Delete "${card.title}"?`)) {
      return;
    }

    const now = new Date().toISOString();
    this.boards.update((boards) =>
      boards.map((item) =>
        item.id === board.id
          ? { ...item, cards: item.cards.filter((existing) => existing.id !== card.id), updatedAt: now }
          : item,
      ),
    );
  }

  updateBoardDraft<K extends keyof BoardDraft>(field: K, value: BoardDraft[K]): void {
    this.boardDraft.update((draft) => ({ ...draft, [field]: value }));
  }

  updateCardDraft<K extends keyof CardDraft>(field: K, value: CardDraft[K]): void {
    this.cardDraft.update((draft) => ({ ...draft, [field]: value }));
  }

  toneAccent(tone: BoardTone): string {
    return this.toneMeta(tone).accent;
  }

  toneSoft(tone: BoardTone): string {
    return this.toneMeta(tone).soft;
  }

  cardTypeIcon(type: BoardCardType): string {
    return this.cardTypes.find((item) => item.id === type)?.icon ?? 'sticky_note_2';
  }

  cardTypeLabel(type: BoardCardType): string {
    return this.cardTypes.find((item) => item.id === type)?.label ?? 'Note';
  }

  statusLabel(status: BoardCardStatus): string {
    return this.cardStatuses.find((item) => item.id === status)?.label ?? 'Saved';
  }

  statusIcon(status: BoardCardStatus): string {
    return this.cardStatuses.find((item) => item.id === status)?.icon ?? 'bookmark';
  }

  boardUpdatedLabel(board: Board): string {
    return this.formatDate(board.updatedAt);
  }

  cardUpdatedLabel(card: BoardCard): string {
    return this.formatDate(card.updatedAt);
  }

  ratingStars(rating: number): string {
    return '★★★★★'.slice(0, Math.max(1, Math.min(5, rating)));
  }

  private loadBoards(): void {
    if (!this.isBrowser) {
      this.boards.set(this.seedBoards());
      this.selectedBoardId.set(this.boards()[0]?.id ?? null);
      this.hasLoaded = true;
      return;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? this.parseBoards(raw) : null;
    const boards = parsed?.length ? parsed : this.seedBoards();
    this.boards.set(boards);
    this.selectedBoardId.set(boards[0]?.id ?? null);
    this.hasLoaded = true;
  }

  private parseBoards(raw: string): Board[] | null {
    try {
      const value = JSON.parse(raw) as Board[];
      if (!Array.isArray(value)) {
        return null;
      }
      return value.filter((board) => board?.id && board?.title && Array.isArray(board.cards));
    } catch {
      return null;
    }
  }

  private seedBoards(): Board[] {
    const now = new Date().toISOString();
    return [
      {
        id: 'board-summer-places',
        title: 'Places visited this summer',
        description: 'A bright trail of beaches, cafes, parks, and long walks worth remembering.',
        icon: 'beach_access',
        tone: 'teal',
        createdAt: now,
        updatedAt: now,
        cards: [
          {
            id: 'card-ocean-city',
            title: 'Ocean City boardwalk',
            subtitle: 'Salt air, arcade lights, late fries',
            notes: 'Best at golden hour. Add photos from the pier and the little dessert stop near 9th.',
            type: 'place',
            status: 'favorite',
            rating: 5,
            imageUrl: '',
            tags: ['shore', 'walks', 'summer'],
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'card-fairmount',
            title: 'Fairmount picnic hill',
            subtitle: 'Quiet view over the city',
            notes: 'Bring a blanket and something citrusy. Good spot for a low-key Sunday.',
            type: 'memory',
            status: 'visited',
            rating: 4,
            imageUrl: '',
            tags: ['park', 'picnic'],
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      {
        id: 'board-eats',
        title: 'Places I like to eat',
        description: 'The reliable hits: cozy counters, special occasion rooms, and quick cravings.',
        icon: 'restaurant',
        tone: 'coral',
        createdAt: now,
        updatedAt: now,
        cards: [
          {
            id: 'card-noodle-bar',
            title: 'Late-night noodle bar',
            subtitle: 'Warm broth, fast service',
            notes: 'Order the spicy miso and split dumplings. Better for two than a group.',
            type: 'food',
            status: 'saved',
            rating: 5,
            imageUrl: '',
            tags: ['noodles', 'comfort'],
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      {
        id: 'board-weekend',
        title: 'Next free Saturday',
        description: 'Small adventures queued up for the next open day.',
        icon: 'auto_awesome',
        tone: 'yellow',
        createdAt: now,
        updatedAt: now,
        cards: [],
      },
    ];
  }

  private toneMeta(tone: BoardTone): { id: BoardTone; label: string; accent: string; soft: string } {
    return this.tones.find((item) => item.id === tone) ?? this.tones[0];
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Recently';
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  }

  private createId(): string {
    if (this.isBrowser && 'crypto' in window && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `board-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
