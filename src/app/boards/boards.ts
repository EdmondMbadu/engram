import { isPlatformBrowser } from '@angular/common';
import { Component, computed, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, type Firestore } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { AccountMenuComponent } from '../account-menu/account-menu';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { getFirebaseFirestore, getFirebaseStorage } from '../firebase.client';
import { GoogleMapsService, type PlaceSearchResult } from '../google-maps.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import type { AtlasItem } from '../atlas.models';
import { PlaceReviewsService, type CityPlaceCandidate } from '../place-reviews.service';
import { profileIconByCode, profileIconForSeed } from '../profile/profile-icons';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';

type BoardTone = 'teal' | 'coral' | 'yellow' | 'green' | 'blue' | 'sky' | 'purple';
type BoardCardType = 'place' | 'food' | 'memory' | 'idea' | 'shop' | 'note';
type BoardCardStatus = 'planned' | 'saved' | 'visited' | 'favorite';
type BoardGalleryTab = 'boards' | 'cards' | 'favorites';
type ShareTarget = 'facebook' | 'x' | 'linkedin' | 'whatsapp' | 'reddit' | 'email';
type StickerSurface = 'board' | 'card';

type BoardSticker = {
  id: string;
  icon: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  colorIndex: number;
};

type StickerDragState = {
  boardId: string;
  cardId: string | null;
  stickerId: string;
  surface: StickerSurface;
  rect: DOMRect;
  pointerId: number;
  target: HTMLElement;
  moved: boolean;
};

type BoardCard = {
  id: string;
  title: string;
  subtitle: string;
  notes: string;
  type: BoardCardType;
  status: BoardCardStatus;
  rating: number;
  imageUrl: string;
  placeId: string;
  googleMapsUrl: string;
  tags: string[];
  stickers: BoardSticker[];
  createdAt: string;
  updatedAt: string;
};

type Board = {
  id: string;
  title: string;
  description: string;
  icon: string;
  tone: BoardTone;
  imageUrl: string;
  stickers: BoardSticker[];
  cards: BoardCard[];
  createdAt: string;
  updatedAt: string;
};

type BoardDraft = {
  title: string;
  description: string;
  icon: string;
  tone: BoardTone;
  imageUrl: string;
  stickers: BoardSticker[];
};

type CardDraft = {
  title: string;
  subtitle: string;
  notes: string;
  type: BoardCardType;
  status: BoardCardStatus;
  rating: string;
  imageUrl: string;
  placeQuery: string;
  placeCity: string;
  placeId: string;
  googleMapsUrl: string;
  tags: string;
  stickers: BoardSticker[];
};

type GalleryCard = {
  card: BoardCard;
  board: Board;
};

type BoardCityOption = {
  id: string;
  name: string;
  region: string;
  slug: string;
};

type BoardRecord = Omit<Board, 'createdAt' | 'updatedAt'> & {
  owner_user_id: string;
  visibility: 'public';
  created_at_iso: string;
  updated_at_iso: string;
};

const STORAGE_KEY = 'livingwiki-boards-v1';
const DEMO_BOARD_IDS = new Set(['board-summer-places', 'board-eats', 'board-weekend']);

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

const CARD_STICKER_ICONS = [
  'location_on',
  'restaurant',
  'local_cafe',
  'ramen_dining',
  'bakery_dining',
  'icecream',
  'local_bar',
  'sports_bar',
  'park',
  'beach_access',
  'hiking',
  'directions_bike',
  'directions_walk',
  'train',
  'flight',
  'museum',
  'theater_comedy',
  'stadium',
  'music_note',
  'festival',
  'photo_camera',
  'palette',
  'auto_stories',
  'school',
  'apartment',
  'storefront',
  'shopping_bag',
  'local_florist',
  'pets',
  'sports_basketball',
  'sports_soccer',
  'fitness_center',
  'favorite',
  'kid_star',
  'bolt',
  'auto_awesome',
  'psychology',
  'emoji_objects',
  'rocket_launch',
  'public',
  'map',
  'explore',
  'wb_sunny',
  'dark_mode',
  'water_drop',
  'local_fire_department',
  'skull',
  'sentiment_very_satisfied',
  'celebration',
  'workspace_premium',
  'computer',
  'videogame_asset',
  'headphones',
  'smartphone',
  'code',
  'memory',
  'terminal',
  'bug_report',
  'construction',
  'warning',
];

const STICKER_COLORS = [
  { bg: '#ffef3d', bg2: '#ff4d8d', ink: '#321200', shadow: '#00a7ff' },
  { bg: '#00e0ff', bg2: '#6c5cff', ink: '#ffffff', shadow: '#ffef3d' },
  { bg: '#ff6b00', bg2: '#ffdd00', ink: '#2d1300', shadow: '#00d084' },
  { bg: '#7cff00', bg2: '#00c853', ink: '#073b16', shadow: '#ff4d8d' },
  { bg: '#ff3df2', bg2: '#7c3cff', ink: '#ffffff', shadow: '#00e0ff' },
  { bg: '#ff3b30', bg2: '#ff9f0a', ink: '#fff7d6', shadow: '#7cff00' },
  { bg: '#00d084', bg2: '#00b2ff', ink: '#031f2d', shadow: '#ff3df2' },
  { bg: '#ffe600', bg2: '#00d1ff', ink: '#102018', shadow: '#ff3b30' },
  { bg: '#b45cff', bg2: '#ff5ca8', ink: '#ffffff', shadow: '#ffe600' },
  { bg: '#111827', bg2: '#3b82f6', ink: '#dbeafe', shadow: '#f97316' },
  { bg: '#f97316', bg2: '#ef4444', ink: '#ffffff', shadow: '#22c55e' },
  { bg: '#22c55e', bg2: '#bef264', ink: '#052e16', shadow: '#a855f7' },
];

const SHARE_TARGETS: Array<{ id: ShareTarget; label: string; icon: string }> = [
  { id: 'facebook', label: 'Facebook', icon: 'public' },
  { id: 'x', label: 'X', icon: 'alternate_email' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'work' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
  { id: 'reddit', label: 'Reddit', icon: 'forum' },
  { id: 'email', label: 'Email', icon: 'mail' },
];

@Component({
  selector: 'app-boards',
  imports: [WorkspaceSidebarComponent, MobileMenuComponent, ThemeToggleComponent, AccountMenuComponent],
  templateUrl: './boards.html',
  styleUrl: './boards.css',
})
export class BoardsComponent {
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);
  private readonly googleMapsService = inject(GoogleMapsService);
  private readonly placeReviewsService = inject(PlaceReviewsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore: Firestore | null = this.isBrowser ? getFirebaseFirestore() : null;
  private readonly storage: FirebaseStorage | null = this.isBrowser ? getFirebaseStorage() : null;
  private hasLoaded = false;
  private loadedStoredLocalBoards = false;
  private placeSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private placeSearchRun = 0;
  private stickerDragState: StickerDragState | null = null;
  private suppressNextBoardOpen = false;

  readonly tones = BOARD_TONES;
  readonly cardTypes = CARD_TYPES;
  readonly cardStatuses = CARD_STATUSES;
  readonly boardIcons = BOARD_ICONS;
  readonly cardStickerIcons = CARD_STICKER_ICONS;
  readonly ratingOptions = [1, 2, 3, 4, 5];
  readonly shareTargets = SHARE_TARGETS;

  readonly boards = signal<Board[]>([]);
  readonly publicCities = signal<BoardCityOption[]>([]);
  readonly citiesLoading = signal(false);
  readonly selectedBoardId = signal<string | null>(null);
  readonly activeGalleryTab = signal<BoardGalleryTab>('boards');
  readonly boardSearch = signal('');
  readonly cardSearch = signal('');
  readonly boardDialogOpen = signal(false);
  readonly cardDialogOpen = signal(false);
  readonly editingBoardId = signal<string | null>(null);
  readonly editingCardId = signal<string | null>(null);
  readonly imageUploadError = signal<string | null>(null);
  readonly shareMessage = signal<string | null>(null);
  readonly boardsSyncError = signal<string | null>(null);
  readonly sharePanelOpen = signal(false);
  readonly cardImageLocked = signal(false);
  readonly draggedStickerId = signal<string | null>(null);
  readonly placeSuggestions = signal<PlaceSearchResult[]>([]);
  readonly placeSearchLoading = signal(false);
  readonly placeSearchError = signal<string | null>(null);
  readonly placeSearchHint = signal<string | null>(null);

  readonly boardDraft = signal<BoardDraft>({
    title: '',
    description: '',
    icon: 'dashboard',
    tone: 'teal',
    imageUrl: '',
    stickers: [],
  });
  readonly cardDraft = signal<CardDraft>({
    title: '',
    subtitle: '',
    notes: '',
    type: 'place',
    status: 'saved',
    rating: '4',
    imageUrl: '',
    placeQuery: '',
    placeCity: '',
    placeId: '',
    googleMapsUrl: '',
    tags: '',
    stickers: [],
  });

  readonly profile = this.authService.profile;
  readonly userName = this.authService.displayName;
  readonly userEmail = this.authService.email;
  readonly userPhotoUrl = computed(() =>
    this.profile()?.profilePictureType === 'image' ? this.profile()?.photoURL ?? '' : '',
  );
  readonly userIcon = computed(
    () =>
      profileIconByCode(this.profile()?.profileIcon) ??
      profileIconForSeed(this.authService.uid() || this.userEmail() || this.userName()),
  );

  readonly selectedBoard = computed(() => {
    const selectedId = this.selectedBoardId();
    return this.boards().find((board) => board.id === selectedId) ?? null;
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

  readonly allGalleryCards = computed<GalleryCard[]>(() =>
    this.boards().flatMap((board) => board.cards.map((card) => ({ card, board }))),
  );

  readonly visibleGalleryCards = computed<GalleryCard[]>(() => {
    const query = this.boardSearch().trim().toLowerCase();
    const cards = this.allGalleryCards()
      .filter((item) => this.activeGalleryTab() !== 'favorites' || item.card.status === 'favorite')
      .sort((a, b) => Date.parse(b.card.updatedAt) - Date.parse(a.card.updatedAt));

    if (!query) {
      return cards;
    }

    return cards.filter(({ card, board }) =>
      [card.title, card.subtitle, card.notes, card.type, card.status, card.tags.join(' '), board.title]
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
  readonly cityMatchSuggestions = computed(() => {
    const query = this.cardDraft().placeCity.trim().toLowerCase();
    if (query.length < 2) {
      return [];
    }
    return this.publicCities()
      .filter((city) => this.citySearchText(city).includes(query))
      .sort((left, right) => {
        const leftName = left.name.toLowerCase();
        const rightName = right.name.toLowerCase();
        const leftStarts = leftName.startsWith(query) ? 0 : 1;
        const rightStarts = rightName.startsWith(query) ? 0 : 1;
        return leftStarts - rightStarts || leftName.localeCompare(rightName);
      })
      .slice(0, 4);
  });
  readonly selectedPlaceCity = computed(() => this.findCityOption(this.cardDraft().placeCity));

  constructor() {
    this.loadLocalBoards();
    void this.loadCities();
    this.route.paramMap.subscribe((params) => {
      const boardId = params.get('boardId');
      this.selectedBoardId.set(boardId);
      this.cardSearch.set('');
      this.shareMessage.set(null);
      this.sharePanelOpen.set(false);
      void this.loadBoards(boardId);
    });

    effect(() => {
      const boards = this.boards();
      if (!this.isBrowser || !this.hasLoaded) {
        return;
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
    });
  }

  setGalleryTab(tab: BoardGalleryTab): void {
    this.activeGalleryTab.set(tab);
    this.boardSearch.set('');
  }

  selectBoard(boardId: string): void {
    if (this.suppressNextBoardOpen) {
      this.suppressNextBoardOpen = false;
      return;
    }
    void this.router.navigate(['/boards', boardId]);
  }

  closeBoardDetail(): void {
    void this.router.navigate(['/boards']);
  }

  openCreateBoard(): void {
    this.editingBoardId.set(null);
    this.imageUploadError.set(null);
    this.boardDraft.set({
      title: '',
      description: '',
      icon: 'dashboard',
      tone: this.tones[this.boards().length % this.tones.length]?.id ?? 'teal',
      imageUrl: '',
      stickers: [],
    });
    this.boardDialogOpen.set(true);
  }

  openEditBoard(board: Board): void {
    this.editingBoardId.set(board.id);
    this.imageUploadError.set(null);
    this.boardDraft.set({
      title: board.title,
      description: board.description,
      icon: board.icon,
      tone: board.tone,
      imageUrl: board.imageUrl,
      stickers: board.stickers ?? [],
    });
    this.boardDialogOpen.set(true);
  }

  closeBoardDialog(): void {
    this.boardDialogOpen.set(false);
    this.editingBoardId.set(null);
  }

  async saveBoard(event: Event): Promise<void> {
    event.preventDefault();
    const draft = this.boardDraft();
    const title = draft.title.trim();
    if (!title) {
      return;
    }

    const now = new Date().toISOString();
    const editingId = this.editingBoardId();
    let nextBoard: Board | null = null;
    if (editingId) {
      this.boards.update((boards) =>
        boards.map((board) => {
          if (board.id !== editingId) {
            return board;
          }
          nextBoard = {
                ...board,
                title,
                description: draft.description.trim(),
                icon: draft.icon,
                tone: draft.tone,
                imageUrl: draft.imageUrl.trim(),
                stickers: draft.stickers,
                updatedAt: now,
          };
          return nextBoard;
        }),
      );
    } else {
      const board: Board = {
        id: this.createId(),
        title,
        description: draft.description.trim(),
        icon: draft.icon,
        tone: draft.tone,
        imageUrl: draft.imageUrl.trim(),
        stickers: draft.stickers,
        cards: [],
        createdAt: now,
        updatedAt: now,
      };
      nextBoard = board;
      this.boards.update((boards) => [board, ...boards]);
      void this.router.navigate(['/boards', board.id]);
    }

    if (nextBoard) {
      await this.persistAndReplaceBoard(nextBoard);
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
      void this.router.navigate(['/boards']);
    }
    void this.deleteRemoteBoard(board.id);
  }

  openCreateCard(boardId = this.selectedBoard()?.id ?? null): void {
    if (!boardId) {
      return;
    }
    this.selectedBoardId.set(boardId);
    this.imageUploadError.set(null);
    this.cardImageLocked.set(false);
    this.editingCardId.set(null);
    this.cardDraft.set({
      title: '',
      subtitle: '',
      notes: '',
      type: 'place',
      status: 'saved',
      rating: '4',
      imageUrl: '',
      placeQuery: '',
      placeCity: '',
      placeId: '',
      googleMapsUrl: '',
      tags: '',
      stickers: [],
    });
    this.cardDialogOpen.set(true);
  }

  openEditCard(card: BoardCard): void {
    this.editingCardId.set(card.id);
    this.imageUploadError.set(null);
    this.cardImageLocked.set(!!card.imageUrl);
    this.cardDraft.set({
      title: card.title,
      subtitle: card.subtitle,
      notes: card.notes,
      type: card.type,
      status: card.status,
      rating: String(card.rating),
      imageUrl: card.imageUrl,
      placeQuery: card.title,
      placeCity: '',
      placeId: card.placeId,
      googleMapsUrl: card.googleMapsUrl,
      tags: card.tags.join(', '),
      stickers: card.stickers ?? [],
    });
    this.cardDialogOpen.set(true);
  }

  openEditGalleryCard(boardId: string, card: BoardCard): void {
    this.selectedBoardId.set(boardId);
    this.openEditCard(card);
  }

  closeCardDialog(): void {
    this.cardDialogOpen.set(false);
    this.editingCardId.set(null);
    this.cardImageLocked.set(false);
    this.clearPlaceSearch();
  }

  async onBoardImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    try {
      const imageUrl = await this.readImageFile(file);
      this.updateBoardDraft('imageUrl', imageUrl);
      this.imageUploadError.set(null);
    } catch (error) {
      this.imageUploadError.set(
        error instanceof Error ? error.message : 'Could not use that image.',
      );
    }
  }

  async onCardImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    try {
      const imageUrl = await this.readImageFile(file);
      this.cardImageLocked.set(true);
      this.updateCardDraft('imageUrl', imageUrl);
      this.imageUploadError.set(null);
    } catch (error) {
      this.imageUploadError.set(
        error instanceof Error ? error.message : 'Could not use that image.',
      );
    }
  }

  clearBoardImage(): void {
    this.updateBoardDraft('imageUrl', '');
    this.imageUploadError.set(null);
  }

  clearCardImage(): void {
    this.cardImageLocked.set(true);
    this.updateCardDraft('imageUrl', '');
    this.imageUploadError.set(null);
  }

  onCardImageUrlInput(value: string): void {
    this.cardImageLocked.set(true);
    this.updateCardDraft('imageUrl', value);
  }

  toggleBoardSticker(icon: string): void {
    this.boardDraft.update((draft) => ({
      ...draft,
      stickers: this.toggleSticker(draft.stickers, icon),
    }));
  }

  clearBoardStickers(): void {
    this.boardDraft.update((draft) => ({ ...draft, stickers: [] }));
  }

  toggleCardSticker(icon: string): void {
    this.cardDraft.update((draft) => ({
      ...draft,
      stickers: this.toggleSticker(draft.stickers, icon),
    }));
  }

  clearCardStickers(): void {
    this.cardDraft.update((draft) => ({ ...draft, stickers: [] }));
  }

  hasSticker(stickers: BoardSticker[], icon: string): boolean {
    return stickers.some((sticker) => sticker.icon === icon);
  }

  onPlaceQueryInput(value: string): void {
    this.updateCardDraft('placeQuery', value);
    if (!this.cardDraft().title.trim()) {
      this.updateCardDraft('title', value);
    }
    this.schedulePlaceSearch();
  }

  onPlaceCityInput(value: string): void {
    this.updateCardDraft('placeCity', value);
    this.schedulePlaceSearch();
  }

  selectPlaceCity(city: BoardCityOption): void {
    this.updateCardDraft('placeCity', city.name);
    this.schedulePlaceSearch();
  }

  selectPlaceSuggestion(place: PlaceSearchResult): void {
    this.applyPlaceSuggestion(place, true);
  }

  private applyPlaceSuggestion(place: PlaceSearchResult, closeSuggestions: boolean): void {
    const inferredType = this.inferCardType(place);
    this.cardDraft.update((draft) => ({
      ...draft,
      title: place.name,
      subtitle: place.address,
      type: inferredType,
      imageUrl: this.cardImageLocked() ? draft.imageUrl : place.photoUrl || draft.imageUrl,
      placeQuery: place.name,
      placeId: place.placeId,
      googleMapsUrl: place.googleMapsUrl,
      tags: this.placeTags(place).join(', '),
    }));
    if (closeSuggestions) {
      this.placeSuggestions.set([]);
    }
    this.placeSearchError.set(null);
  }

  async saveCard(event: Event): Promise<void> {
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
    let nextBoard: Board | null = null;

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
                    placeId: draft.placeId,
                    googleMapsUrl: draft.googleMapsUrl,
                    tags,
                    stickers: draft.stickers,
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
                placeId: draft.placeId,
                googleMapsUrl: draft.googleMapsUrl,
                tags,
                stickers: draft.stickers,
                createdAt: now,
                updatedAt: now,
              },
              ...item.cards,
            ];

        nextBoard = { ...item, cards: nextCards, updatedAt: now };
        return nextBoard;
      }),
    );

    if (nextBoard) {
      await this.persistAndReplaceBoard(nextBoard);
    }
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

  deleteGalleryCard(boardId: string, card: BoardCard): void {
    this.selectedBoardId.set(boardId);
    this.deleteCard(card);
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

  imageUrlInputValue(value: string): string {
    return value.startsWith('data:') ? '' : value;
  }

  toggleSharePanel(): void {
    this.sharePanelOpen.update((open) => !open);
    this.shareMessage.set(null);
  }

  boardShareUrl(board: Board): string {
    if (!this.isBrowser) {
      return `/boards/${board.id}`;
    }
    return `${window.location.origin}/boards/${board.id}`;
  }

  async copyBoardUrl(board: Board): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    const url = this.boardShareUrl(board);
    try {
      await navigator.clipboard.writeText(url);
      this.shareMessage.set('Board link copied.');
    } catch {
      this.shareMessage.set(url);
    }
  }

  async nativeShareBoard(board: Board): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    const url = this.boardShareUrl(board);
    try {
      if (navigator.share) {
        await navigator.share({
          title: board.title,
          text: board.description || 'LivingWiki board',
          url,
        });
        this.shareMessage.set('Share sheet opened.');
        return;
      }

      await this.copyBoardUrl(board);
    } catch {
      this.shareMessage.set(url);
    }
  }

  shareTargetUrl(target: ShareTarget, board: Board): string {
    const url = this.boardShareUrl(board);
    const encodedUrl = encodeURIComponent(url);
    const title = encodeURIComponent(board.title);
    const text = encodeURIComponent(board.description || board.title);
    switch (target) {
      case 'facebook':
        return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
      case 'x':
        return `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${title}`;
      case 'linkedin':
        return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
      case 'whatsapp':
        return `https://wa.me/?text=${text}%20${encodedUrl}`;
      case 'reddit':
        return `https://www.reddit.com/submit?url=${encodedUrl}&title=${title}`;
      case 'email':
        return `mailto:?subject=${title}&body=${text}%0A%0A${encodedUrl}`;
    }
  }

  private loadLocalBoards(): void {
    if (!this.isBrowser) {
      this.boards.set([]);
      this.hasLoaded = true;
      return;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? this.parseBoards(raw) : null;
    const userBoards = (parsed ?? []).filter((board) => !DEMO_BOARD_IDS.has(board.id));
    this.loadedStoredLocalBoards = userBoards.length > 0;
    const boards = userBoards;
    this.boards.set(boards);
    this.hasLoaded = true;
  }

  private async loadBoards(boardId: string | null): Promise<void> {
    if (!this.isBrowser || !this.firestore) {
      return;
    }

    await this.authService.waitForReady();
    const uid = this.authService.uid();
    this.boardsSyncError.set(null);

    try {
      const loaded: Board[] = [];
      if (uid) {
        loaded.push(...await this.loadUserBoards(uid));
      }

      if (boardId && !loaded.some((board) => board.id === boardId)) {
        const sharedBoard = await this.loadBoardById(boardId);
        if (sharedBoard) {
          loaded.unshift(sharedBoard);
        }
      }

      if (loaded.length) {
        this.boards.set(loaded);
      } else if (uid && this.loadedStoredLocalBoards) {
        await Promise.all(this.boards().map((board) => this.persistBoard(board)));
        const migrated = await this.loadUserBoards(uid);
        if (migrated.length) {
          this.boards.set(migrated);
        }
      }
    } catch {
      this.boardsSyncError.set('Boards are using this browser for now. Firebase sync is unavailable.');
    }
  }

  private async loadUserBoards(uid: string): Promise<Board[]> {
    if (!this.firestore) {
      return [];
    }

    const snapshot = await getDocs(
      query(collection(this.firestore, 'boards'), where('owner_user_id', '==', uid)),
    );
    return snapshot.docs
      .map((boardDoc) => this.boardFromRecord(boardDoc.id, boardDoc.data()))
      .filter((board): board is Board => !!board)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  private async loadBoardById(boardId: string): Promise<Board | null> {
    if (!this.firestore) {
      return null;
    }

    const snapshot = await getDoc(doc(this.firestore, 'boards', boardId));
    if (!snapshot.exists()) {
      return null;
    }
    return this.boardFromRecord(snapshot.id, snapshot.data());
  }

  private async loadCities(): Promise<void> {
    this.citiesLoading.set(true);
    try {
      const cities = (await this.atlasService.listPublicAtlases())
        .filter((atlas) => atlas.city_config?.enabled === true)
        .map((atlas) => this.cityOptionFromAtlas(atlas))
        .sort((left, right) => left.name.localeCompare(right.name));
      this.publicCities.set(cities);
    } catch {
      this.publicCities.set([]);
    } finally {
      this.citiesLoading.set(false);
      if (this.cardDialogOpen()) {
        this.schedulePlaceSearch();
      }
    }
  }

  private parseBoards(raw: string): Board[] | null {
    try {
      const value = JSON.parse(raw) as Board[];
      if (!Array.isArray(value)) {
        return null;
      }
      return value
        .filter((board) => board?.id && board?.title && Array.isArray(board.cards))
        .map((board) => ({
          ...board,
          imageUrl: board.imageUrl ?? '',
          stickers: this.normalizeStickers((board as Board).stickers),
          cards: board.cards.map((card) => ({
            ...card,
            imageUrl: card.imageUrl ?? '',
            placeId: card.placeId ?? '',
            googleMapsUrl: card.googleMapsUrl ?? '',
            stickers: this.normalizeStickers(card.stickers),
          })),
        }));
    } catch {
      return null;
    }
  }

  private async persistAndReplaceBoard(board: Board): Promise<void> {
    try {
      const persisted = await this.persistBoard(board);
      this.boards.update((boards) => boards.map((item) => (item.id === persisted.id ? persisted : item)));
      this.boardsSyncError.set(null);
    } catch {
      this.boardsSyncError.set('Saved on this browser, but Firebase sync failed.');
    }
  }

  private async persistBoard(board: Board): Promise<Board> {
    const uid = this.authService.uid();
    if (!this.firestore || !uid) {
      return board;
    }

    const prepared = await this.prepareBoardImagesForFirebase(board, uid);
    const record: BoardRecord & { server_updated_at: unknown } = {
      ...prepared,
      owner_user_id: uid,
      visibility: 'public',
      created_at_iso: prepared.createdAt,
      updated_at_iso: prepared.updatedAt,
      server_updated_at: serverTimestamp(),
    };
    const { createdAt, updatedAt, ...persistable } = record as BoardRecord & {
      createdAt?: string;
      updatedAt?: string;
      server_updated_at: unknown;
    };
    await setDoc(doc(this.firestore, 'boards', prepared.id), persistable);
    return prepared;
  }

  private async deleteRemoteBoard(boardId: string): Promise<void> {
    const uid = this.authService.uid();
    if (!this.firestore || !uid) {
      return;
    }

    try {
      await deleteDoc(doc(this.firestore, 'boards', boardId));
      this.boardsSyncError.set(null);
    } catch {
      this.boardsSyncError.set('Removed locally, but Firebase delete failed.');
    }
  }

  private boardFromRecord(id: string, data: Record<string, unknown>): Board | null {
    const title = typeof data['title'] === 'string' ? data['title'] : '';
    if (!title) {
      return null;
    }

    const rawCards = Array.isArray(data['cards']) ? data['cards'] : [];
    return {
      id,
      title,
      description: typeof data['description'] === 'string' ? data['description'] : '',
      icon: typeof data['icon'] === 'string' ? data['icon'] : 'dashboard',
      tone: this.isBoardTone(data['tone']) ? data['tone'] : 'teal',
      imageUrl: typeof data['imageUrl'] === 'string' ? data['imageUrl'] : '',
      stickers: this.normalizeStickers(data['stickers']),
      cards: rawCards.map((card) => this.cardFromRecord(card)).filter((card): card is BoardCard => !!card),
      createdAt: typeof data['created_at_iso'] === 'string' ? data['created_at_iso'] : new Date().toISOString(),
      updatedAt: typeof data['updated_at_iso'] === 'string' ? data['updated_at_iso'] : new Date().toISOString(),
    };
  }

  private cardFromRecord(value: unknown): BoardCard | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const data = value as Record<string, unknown>;
    const title = typeof data['title'] === 'string' ? data['title'] : '';
    if (!title) {
      return null;
    }
    return {
      id: typeof data['id'] === 'string' ? data['id'] : this.createId(),
      title,
      subtitle: typeof data['subtitle'] === 'string' ? data['subtitle'] : '',
      notes: typeof data['notes'] === 'string' ? data['notes'] : '',
      type: this.isBoardCardType(data['type']) ? data['type'] : 'place',
      status: this.isBoardCardStatus(data['status']) ? data['status'] : 'saved',
      rating: typeof data['rating'] === 'number' ? Math.max(1, Math.min(5, data['rating'])) : 4,
      imageUrl: typeof data['imageUrl'] === 'string' ? data['imageUrl'] : '',
      placeId: typeof data['placeId'] === 'string' ? data['placeId'] : '',
      googleMapsUrl: typeof data['googleMapsUrl'] === 'string' ? data['googleMapsUrl'] : '',
      tags: Array.isArray(data['tags']) ? data['tags'].filter((tag): tag is string => typeof tag === 'string').slice(0, 6) : [],
      stickers: this.normalizeStickers(data['stickers']),
      createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : new Date().toISOString(),
      updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] : new Date().toISOString(),
    };
  }

  stickerLeft(index: number): number {
    const positions = [8, 72, 38, 16, 84, 55, 28, 66, 10, 48, 78, 34];
    return positions[index % positions.length];
  }

  stickerTop(index: number): number {
    const positions = [12, 8, 24, 43, 38, 58, 72, 76, 86, 6, 63, 31];
    return positions[index % positions.length];
  }

  stickerRotation(index: number): number {
    const rotations = [-18, 14, -7, 22, -25, 9, -12, 18, -5, 26, -20, 11];
    return rotations[index % rotations.length];
  }

  stickerScale(index: number): number {
    const scales = [1, 0.82, 1.18, 0.94, 1.3, 0.76, 1.08, 0.9, 1.22, 0.84, 1.12, 0.98];
    return scales[index % scales.length];
  }

  stickerTransform(sticker: BoardSticker): string {
    return `rotate(${sticker.rotation}deg) scale(${sticker.scale})`;
  }

  stickerBackground(index: number): string {
    return STICKER_COLORS[index % STICKER_COLORS.length].bg;
  }

  stickerBackgroundAlt(index: number): string {
    return STICKER_COLORS[index % STICKER_COLORS.length].bg2;
  }

  stickerInk(index: number): string {
    return STICKER_COLORS[index % STICKER_COLORS.length].ink;
  }

  stickerShadow(index: number): string {
    return STICKER_COLORS[index % STICKER_COLORS.length].shadow;
  }

  stickerColor(sticker: BoardSticker, index: number): number {
    return Number.isFinite(sticker.colorIndex) ? sticker.colorIndex : index;
  }

  beginStickerDrag(
    event: PointerEvent,
    surface: StickerSurface,
    boardId: string,
    stickerId: string,
    cardId: string | null = null,
  ): void {
    if (!(event.currentTarget instanceof HTMLElement)) {
      return;
    }

    const layer = event.currentTarget.parentElement;
    if (!layer) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    this.suppressNextBoardOpen = true;
    this.draggedStickerId.set(stickerId);
    this.stickerDragState = {
      boardId,
      cardId,
      stickerId,
      surface,
      rect: layer.getBoundingClientRect(),
      pointerId: event.pointerId,
      target: event.currentTarget,
      moved: false,
    };
    window.addEventListener('pointermove', this.handleStickerPointerMove);
    window.addEventListener('pointerup', this.handleStickerPointerEnd, { once: true });
    window.addEventListener('pointercancel', this.handleStickerPointerEnd, { once: true });
  }

  beginCardStickerDrag(event: PointerEvent, boardId: string, card: BoardCard): void {
    if (event.button !== 0 || !card.stickers.length || !(event.currentTarget instanceof HTMLElement)) {
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest('a, button, input, textarea, select, label')) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const sticker = this.findStickerAtPoint(card.stickers, x, y);
    if (!sticker) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    this.suppressNextBoardOpen = true;
    this.draggedStickerId.set(sticker.id);
    this.stickerDragState = {
      boardId,
      cardId: card.id,
      stickerId: sticker.id,
      surface: 'card',
      rect,
      pointerId: event.pointerId,
      target: event.currentTarget,
      moved: false,
    };
    window.addEventListener('pointermove', this.handleStickerPointerMove);
    window.addEventListener('pointerup', this.handleStickerPointerEnd, { once: true });
    window.addEventListener('pointercancel', this.handleStickerPointerEnd, { once: true });
  }

  private readonly handleStickerPointerMove = (event: PointerEvent): void => {
    const state = this.stickerDragState;
    if (!state || event.pointerId !== state.pointerId) {
      return;
    }

    const x = this.clamp(((event.clientX - state.rect.left) / state.rect.width) * 100, 4, 92);
    const y = this.clamp(((event.clientY - state.rect.top) / state.rect.height) * 100, 4, 92);
    state.moved = true;
    this.updateStickerPosition(state, x, y);
  };

  private readonly handleStickerPointerEnd = (): void => {
    const state = this.stickerDragState;
    window.removeEventListener('pointermove', this.handleStickerPointerMove);
    window.removeEventListener('pointerup', this.handleStickerPointerEnd);
    window.removeEventListener('pointercancel', this.handleStickerPointerEnd);
    this.draggedStickerId.set(null);
    this.stickerDragState = null;

    if (!state || !state.moved) {
      setTimeout(() => {
        this.suppressNextBoardOpen = false;
      });
      return;
    }

    const board = this.boards().find((item) => item.id === state.boardId);
    if (board) {
      void this.persistAndReplaceBoard({ ...board, updatedAt: new Date().toISOString() });
    }
    setTimeout(() => {
      this.suppressNextBoardOpen = false;
    });
  };

  private updateStickerPosition(state: StickerDragState, x: number, y: number): void {
    const now = new Date().toISOString();
    this.boards.update((boards) =>
      boards.map((board) => {
        if (board.id !== state.boardId) {
          return board;
        }

        if (state.surface === 'board') {
          return {
            ...board,
            stickers: board.stickers.map((sticker) =>
              sticker.id === state.stickerId ? { ...sticker, x, y } : sticker,
            ),
            updatedAt: now,
          };
        }

        return {
          ...board,
          cards: board.cards.map((card) =>
            card.id === state.cardId
              ? {
                  ...card,
                  stickers: card.stickers.map((sticker) =>
                    sticker.id === state.stickerId ? { ...sticker, x, y } : sticker,
                  ),
                  updatedAt: now,
                }
              : card,
          ),
          updatedAt: now,
        };
      }),
    );
  }

  private toggleSticker(stickers: BoardSticker[], icon: string): BoardSticker[] {
    if (stickers.some((sticker) => sticker.icon === icon)) {
      return stickers.filter((sticker) => sticker.icon !== icon);
    }
    return [...stickers, this.createSticker(icon, stickers.length)].slice(0, 48);
  }

  private findStickerAtPoint(stickers: BoardSticker[], x: number, y: number): BoardSticker | null {
    let closest: { sticker: BoardSticker; distance: number } | null = null;
    for (const sticker of stickers) {
      const distance = Math.hypot(sticker.x - x, sticker.y - y);
      if (distance <= 9 && (!closest || distance < closest.distance)) {
        closest = { sticker, distance };
      }
    }
    return closest?.sticker ?? null;
  }

  private normalizeStickers(value: unknown): BoardSticker[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item, index) => this.normalizeSticker(item, index))
      .filter((sticker): sticker is BoardSticker => !!sticker)
      .slice(0, 48);
  }

  private normalizeSticker(value: unknown, index: number): BoardSticker | null {
    if (typeof value === 'string') {
      return this.createSticker(value, index);
    }
    if (!value || typeof value !== 'object') {
      return null;
    }
    const data = value as Record<string, unknown>;
    const icon = typeof data['icon'] === 'string' ? data['icon'] : '';
    if (!icon) {
      return null;
    }

    return {
      id: typeof data['id'] === 'string' ? data['id'] : this.createId(),
      icon,
      x: this.readStickerNumber(data['x'], this.stickerLeft(index), 0, 100),
      y: this.readStickerNumber(data['y'], this.stickerTop(index), 0, 100),
      rotation: this.readStickerNumber(data['rotation'], this.stickerRotation(index), -45, 45),
      scale: this.readStickerNumber(data['scale'], this.stickerScale(index), 0.65, 1.45),
      colorIndex: this.readStickerNumber(data['colorIndex'], index, 0, STICKER_COLORS.length - 1),
    };
  }

  private createSticker(icon: string, index: number): BoardSticker {
    return {
      id: this.createId(),
      icon,
      x: this.stickerLeft(index),
      y: this.stickerTop(index),
      rotation: this.stickerRotation(index),
      scale: this.stickerScale(index),
      colorIndex: index % STICKER_COLORS.length,
    };
  }

  private readStickerNumber(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? this.clamp(value, min, max)
      : fallback;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private async prepareBoardImagesForFirebase(board: Board, uid: string): Promise<Board> {
    const imageUrl = await this.persistImageIfNeeded(board.imageUrl, `users/${uid}/boards/${board.id}/cover.jpg`);
    const cards = await Promise.all(
      board.cards.map(async (card) => ({
        ...card,
        imageUrl: await this.persistImageIfNeeded(
          card.imageUrl,
          `users/${uid}/boards/${board.id}/cards/${card.id}.jpg`,
        ),
      })),
    );
    return { ...board, imageUrl, cards };
  }

  private async persistImageIfNeeded(imageUrl: string, path: string): Promise<string> {
    if (!imageUrl.startsWith('data:') || !this.storage) {
      return imageUrl;
    }

    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const ref = storageRef(this.storage, path);
    await uploadBytes(ref, blob, { contentType: blob.type || 'image/jpeg' });
    return getDownloadURL(ref);
  }

  private isBoardTone(value: unknown): value is BoardTone {
    return typeof value === 'string' && this.tones.some((tone) => tone.id === value);
  }

  private isBoardCardType(value: unknown): value is BoardCardType {
    return typeof value === 'string' && this.cardTypes.some((type) => type.id === value);
  }

  private isBoardCardStatus(value: unknown): value is BoardCardStatus {
    return typeof value === 'string' && this.cardStatuses.some((status) => status.id === value);
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

  private schedulePlaceSearch(): void {
    if (this.placeSearchTimer) {
      clearTimeout(this.placeSearchTimer);
    }

    const query = this.cardDraft().placeQuery.trim();
    const city = this.cardDraft().placeCity.trim();
    const matchedCity = this.findCityOption(city);
    if (query.length < 2) {
      if (matchedCity && this.isExactCityInput(city, matchedCity)) {
        this.placeSearchLoading.set(true);
        this.placeSearchError.set(null);
        this.placeSearchHint.set(`Filling ${matchedCity.name} as the card place and looking for a photo.`);
        this.placeSearchTimer = setTimeout(() => {
          void this.runPlaceSearch();
        }, 260);
        return;
      }
      this.placeSuggestions.set([]);
      this.placeSearchLoading.set(false);
      this.placeSearchError.set(null);
      this.placeSearchHint.set(this.cityOnlyHint(city, matchedCity));
      return;
    }

    this.placeSearchLoading.set(true);
    this.placeSearchError.set(null);
    this.placeSearchHint.set(
      matchedCity
        ? `Searching ${matchedCity.name} with the city place API, then adding photos.`
        : city
          ? `Searching near ${city} and looking for a photo.`
          : 'Searching places and looking for a photo.',
    );
    this.placeSearchTimer = setTimeout(() => {
      void this.runPlaceSearch();
    }, 260);
  }

  private async runPlaceSearch(): Promise<void> {
    const placeQuery = this.cardDraft().placeQuery.trim();
    const city = this.cardDraft().placeCity.trim();
    const matchedCity = this.findCityOption(city);
    const cityAsPlace = !placeQuery && !!matchedCity && this.isExactCityInput(city, matchedCity);
    const query = cityAsPlace ? matchedCity.name : placeQuery;
    const runId = ++this.placeSearchRun;

    if (query.length < 2) {
      this.placeSearchLoading.set(false);
      return;
    }

    let cityResults: PlaceSearchResult[] = [];
    let cityLookupFailed = false;
    if (matchedCity && !cityAsPlace) {
      try {
        const places = await this.placeReviewsService.searchCityPlaces(matchedCity.id, query);
        if (runId !== this.placeSearchRun) {
          return;
        }
        cityResults = places.map((place) => this.cityPlaceToSearchResult(place));
        if (cityResults.length) {
          this.placeSuggestions.set(cityResults);
          this.placeSearchError.set(null);
          this.placeSearchHint.set(`Found matches in ${matchedCity.name}. Adding photos now.`);
        }
      } catch {
        cityLookupFailed = true;
      }
    }

    let googleResults: PlaceSearchResult[] = [];
    let googleLookupError: unknown = null;
    try {
      googleResults = await this.googleMapsService.searchPlaces(
        query,
        cityAsPlace ? matchedCity?.region ?? '' : matchedCity?.name ?? city,
      );
      if (!googleResults.some((result) => result.photoUrl) && cityResults.length) {
        const bestCityResult = cityResults[0];
        const retryResults = await this.googleMapsService.searchPlaces(
          bestCityResult.name,
          bestCityResult.address || matchedCity?.name || city,
        );
        googleResults = this.mergePlaceResults(googleResults, retryResults);
      }
      if (runId !== this.placeSearchRun) {
        return;
      }
    } catch (error) {
      googleLookupError = error;
    }

    if (runId !== this.placeSearchRun) {
      return;
    }

    const results = this.mergePlaceResults(cityResults, googleResults);
    this.placeSuggestions.set(results);
    this.placeSearchHint.set(
      results.some((place) => place.photoUrl)
        ? 'Place details and photo are ready.'
        : results.length
          ? 'Place details are ready. No photo was returned for these matches.'
          : null,
    );
    if (results.length) {
      this.placeSearchError.set(null);
      const draft = this.cardDraft();
      const first = results[0];
      if (first && !draft.placeId && (!draft.imageUrl || !draft.subtitle.trim())) {
        this.applyPlaceSuggestion(first, false);
      }
      this.autoPopulateCardImage(results);
    } else if (googleLookupError instanceof Error) {
      this.placeSearchError.set(googleLookupError.message);
    } else if (cityLookupFailed) {
      this.placeSearchError.set('Place search is unavailable right now. You can still type the card manually.');
    } else {
      this.placeSearchError.set('No matching places found.');
    }

    if (runId === this.placeSearchRun) {
      this.placeSearchLoading.set(false);
    }
  }

  private clearPlaceSearch(): void {
    if (this.placeSearchTimer) {
      clearTimeout(this.placeSearchTimer);
      this.placeSearchTimer = null;
    }
    this.placeSearchRun++;
    this.placeSuggestions.set([]);
    this.placeSearchLoading.set(false);
    this.placeSearchError.set(null);
    this.placeSearchHint.set(null);
  }

  private cityOptionFromAtlas(atlas: AtlasItem): BoardCityOption {
    return {
      id: atlas.id,
      name: atlas.city_config?.city_name || atlas.name.replace(/^Living\s*Wiki:\s*/i, '').trim(),
      region: atlas.city_config?.region_name || atlas.city_config?.country_code || '',
      slug: atlas.slug,
    };
  }

  private findCityOption(value: string): BoardCityOption | null {
    const query = value.trim().toLowerCase();
    if (query.length < 2) {
      return null;
    }
    return this.publicCities().find((city) => {
      const name = city.name.trim().toLowerCase();
      const slug = city.slug.trim().toLowerCase();
      return name === query || slug === query || this.citySearchText(city).includes(query);
    }) ?? null;
  }

  private citySearchText(city: BoardCityOption): string {
    return `${city.name} ${city.region} ${city.slug}`.toLowerCase();
  }

  private isExactCityInput(value: string, city: BoardCityOption): boolean {
    const query = value.trim().toLowerCase();
    return query === city.name.trim().toLowerCase() || query === city.slug.trim().toLowerCase();
  }

  private cityOnlyHint(city: string, matchedCity: BoardCityOption | null): string | null {
    if (!city) {
      return null;
    }
    if (this.citiesLoading()) {
      return 'Checking LivingWiki cities...';
    }
    if (matchedCity) {
      return `${matchedCity.name} selected. Type a place, restaurant, venue, or thing to fill the card.`;
    }
    return `No LivingWiki city match yet for "${city}". Type a place and we will still search with that city as context.`;
  }

  private cityPlaceToSearchResult(place: CityPlaceCandidate): PlaceSearchResult {
    return {
      placeId: place.placeId || place.id || `${place.name}-${place.address}`,
      name: place.name,
      address: place.address,
      types: place.types ?? [],
      rating: typeof place.ratingAvg === 'number' ? place.ratingAvg : null,
      googleMapsUrl: place.googleMapsUrl,
      photoUrl: '',
    };
  }

  private mergePlaceResults(primary: PlaceSearchResult[], photoResults: PlaceSearchResult[]): PlaceSearchResult[] {
    const merged = new Map<string, PlaceSearchResult>();
    for (const result of primary) {
      merged.set(this.placeMergeKey(result), result);
    }
    for (const result of photoResults) {
      const key = this.placeMergeKey(result);
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, {
          ...existing,
          address: existing.address || result.address,
          types: existing.types.length ? existing.types : result.types,
          rating: existing.rating ?? result.rating,
          googleMapsUrl: existing.googleMapsUrl || result.googleMapsUrl,
          photoUrl: existing.photoUrl || result.photoUrl,
        });
      } else {
        merged.set(key, result);
      }
    }
    return [...merged.values()].slice(0, 6);
  }

  private placeMergeKey(place: PlaceSearchResult): string {
    return place.placeId || `${place.name} ${place.address}`.trim().toLowerCase();
  }

  private autoPopulateCardImage(results: PlaceSearchResult[]): void {
    const draft = this.cardDraft();
    if (this.cardImageLocked() || draft.imageUrl) {
      return;
    }

    const photoResult = this.bestPhotoResult(results, draft);
    if (!photoResult?.photoUrl) {
      return;
    }

    this.cardDraft.update((current) => ({
      ...current,
      imageUrl: photoResult.photoUrl,
      placeId: current.placeId || photoResult.placeId,
      googleMapsUrl: current.googleMapsUrl || photoResult.googleMapsUrl,
    }));
    this.placeSearchHint.set('Place details and image are ready.');
  }

  private bestPhotoResult(results: PlaceSearchResult[], draft: CardDraft): PlaceSearchResult | null {
    const withPhotos = results.filter((result) => !!result.photoUrl);
    if (!withPhotos.length) {
      return null;
    }

    const currentPlaceId = draft.placeId.trim();
    if (currentPlaceId) {
      const exact = withPhotos.find((result) => result.placeId === currentPlaceId);
      if (exact) {
        return exact;
      }
    }

    const title = this.normalizePlaceName(draft.title || draft.placeQuery);
    if (title) {
      const nameMatch = withPhotos.find((result) => {
        const name = this.normalizePlaceName(result.name);
        return name === title || name.includes(title) || title.includes(name);
      });
      if (nameMatch) {
        return nameMatch;
      }
    }

    return withPhotos[0];
  }

  private normalizePlaceName(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(the|a|an|at|in|of|and)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private inferCardType(place: PlaceSearchResult): BoardCardType {
    const types = new Set(place.types);
    if (
      types.has('restaurant') ||
      types.has('cafe') ||
      types.has('bakery') ||
      types.has('bar') ||
      types.has('meal_takeaway')
    ) {
      return 'food';
    }
    if (types.has('store') || types.has('shopping_mall')) {
      return 'shop';
    }
    return 'place';
  }

  private placeTags(place: PlaceSearchResult): string[] {
    return place.types
      .map((type) => type.replaceAll('_', ' '))
      .filter((type) => !['point of interest', 'establishment'].includes(type))
      .slice(0, 4);
  }

  private async readImageFile(file: File): Promise<string> {
    if (!this.isBrowser) {
      throw new Error('Image uploads are available in the browser.');
    }
    if (!file.type.startsWith('image/')) {
      throw new Error('Choose an image file.');
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Could not read that image.'));
        }
      };
      reader.onerror = () => reject(new Error('Could not read that image.'));
      reader.readAsDataURL(file);
    });

    return this.resizeImageDataUrl(dataUrl);
  }

  private resizeImageDataUrl(dataUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) {
          resolve(dataUrl);
          return;
        }

        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(dataUrl);
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      image.onerror = () => reject(new Error('Could not load that image.'));
      image.src = dataUrl;
    });
  }
}
