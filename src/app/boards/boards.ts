import { isPlatformBrowser } from '@angular/common';
import { Component, computed, effect, ElementRef, HostListener, inject, LOCALE_ID, OnDestroy, PLATFORM_ID, signal, ViewChild, type WritableSignal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { FirebaseError } from 'firebase/app';
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { AccountMenuComponent } from '../account-menu/account-menu';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { getFirebaseFirestore, getFirebaseFunctions, getFirebaseStorage } from '../firebase.client';
import { GoogleMapsService, type PlaceSearchResult } from '../google-maps.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import type { AtlasItem } from '../atlas.models';
import { PlaceReviewsService, type CityPlaceCandidate } from '../place-reviews.service';
import { profileIconByCode, profileIconForSeed } from '../profile/profile-icons';
import { generateQrSvgDataUrl } from '../qr-code';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';
import { SpotifyPlaybackService, type SpotifyTrack } from '../spotify-playback.service';
import {
  spotifyTrackEmbedUrl as buildSpotifyTrackEmbedUrl,
  spotifyTrackIdFromReference,
} from '../spotify-embed';
import {
  localizedPath,
  LOCALE_STORAGE_KEY,
  supportedLocale,
} from '../i18n/locales';
import {
  applyBoardTranslation,
  BOARD_TRANSLATION_LANGUAGES,
  boardTranslationLanguageName,
  isBoardTranslationLanguage,
  normalizeBoardTranslationResult,
  type BoardTranslationLanguage,
  type BoardTranslationResult,
} from './board-translation';
import { BOARD_WIZARD_PASTE_MAX_LENGTH, parseNumberedBoardSource } from './board-wizard-source';
import { canReorderCardSurface } from './card-interaction';
import { omitUndefinedDeep } from './firestore-payload';
import { legacyMemoryImages, relatedCardCollectionLabel } from './related-cards';
import {
  insertionSortOrder,
  reorderRelativeToTarget,
  type ReorderDropPosition,
} from './reorder';
import {
  insertTourCardAfter,
  moveTourCard,
  normalizeTourCardSequences,
  orderedTourCards,
  reorderTourCards,
  tourOrderIds,
} from './tour-order';
import { isGenericTourStopFallback, tourStopDestinationQuery } from './tour-stop';
import {
  boardQuizEligibleCardCount,
  buildBoardLearningQuiz,
  gradeBoardLearningQuiz,
  normalizeBoardLearningQuiz,
  type BoardLearningQuiz,
  type BoardLearningQuizGrade,
  type BoardLearningQuizLeaderboard,
  type BoardLearningQuizLeaderboardEntry,
  type BoardLearningQuizQuestion,
  type BoardLearningQuizStats,
} from './board-learning';
import {
  normalizeWhat3WordsAddress,
  resolveWhat3WordsAddress,
  type ResolvedWhat3WordsLocation,
  what3wordsFromCoordinates,
  what3wordsLocation,
} from './off-grid-location';
import {
  generateStackVideo,
  STACK_VIDEO_RENDER_VERSION,
  stackVideoRenderIsCurrent,
  type StackVideoBackgroundAudio,
  type StackVideoResult,
} from './stack-video-export';
import {
  DEFAULT_STACK_AUDIO_TRACK_ID,
  DEFAULT_STACK_AUDIO_VOLUME,
  MAX_STACK_AUDIO_VOLUME,
  MIN_STACK_AUDIO_VOLUME,
  NO_STACK_AUDIO_TRACK_ID,
  STACK_AUDIO_TRACKS,
  normalizeStackAudioTrackId,
  normalizeStackAudioVolume,
  stackAudioTrackById,
  type StackAudioTrack,
} from './stack-audio';
import {
  browserTimezone,
  canPlanVisit,
  defaultVisitDateTime,
  parseVisitInviteEmails,
  rightNowVisitDateTime,
  tomorrowVisitDateTime,
  visitPlanInvitationTime,
  visitPlanLabel,
  visitStartIso,
  type VisitPlanAttendee,
  type VisitPlanSummary,
} from './go-there';
import {
  extractWhat3WordsAddress,
  parseWhat3WordsBoardSource,
  what3WordsAddressFromCard,
  type What3WordsBoardSource,
  type What3WordsCardLike,
} from './what3words-source';

type BoardTone = 'teal' | 'coral' | 'yellow' | 'green' | 'blue' | 'sky' | 'purple';
type BoardKind = 'standard' | 'off-grid' | 'walking-tour' | 'driving-tour';
type BoardVisibility = 'public' | 'private';
type BoardCardType = 'place' | 'food' | 'memory' | 'idea' | 'shop' | 'note';
type BoardCardScope = 'place' | 'city' | 'country' | 'region';
type BoardCardStatus = 'planned' | 'saved' | 'visited' | 'favorite';
type BoardEntityType = 'person' | 'place' | 'event' | 'work' | 'product' | 'food' | 'organization' | 'other';
type BoardImageIntent = 'portrait' | 'place' | 'event' | 'cover' | 'product' | 'food' | 'logo' | 'other';
type BoardMediaKind = 'none' | 'song' | 'album' | 'film' | 'book' | 'tv' | 'game';
type BoardGalleryTab = 'boards' | 'cards' | 'favorites';
type ShareTarget = 'facebook' | 'x' | 'linkedin' | 'whatsapp' | 'reddit' | 'email';
type StickerSurface = 'board' | 'card';
type CardImageToolMode = 'generate' | 'search' | null;
type WizardCardEditorSection = 'details' | 'image';
type OffGridLocationSource = 'spot' | 'words';
type BoardWizardMode = 'describe' | 'paste' | 'photos' | 'off-grid' | 'url' | 'walking-tour' | 'driving-tour';
type BoardWizardStep = 'choose' | 'configure' | 'loading' | 'preview' | 'done';
type BoardWizardVibe = 'playful' | 'foodie' | 'traveler' | 'curator' | 'memory';
type WizardLoadingTask = {
  message: string;
  progress: number;
};
type BoardTourMode = 'walking' | 'driving';
type BoardTourVoiceStyle = 'historian' | 'local' | 'kid-friendly';
type TourBoardView = 'route' | 'cards';
type TourRouteMutation = {
  addedCard?: BoardCard;
  deletedCardId?: string;
  deletedCardIds?: string[];
};
type StackFormat = 'carousel' | 'reel' | 'both';
type StackRatio = 'vertical' | 'square' | 'landscape';
type StackExportTarget = 'whatsapp' | 'facebook' | 'instagram' | 'tiktok' | 'x' | 'download';
type VisitPlanContext = 'board' | 'stack';
type StackShareMode = 'video' | 'live';
type StackLinkShareTarget = Extract<ShareTarget, 'x' | 'facebook' | 'linkedin' | 'reddit' | 'whatsapp'> | 'more';
type BoardLearnView = 'menu' | 'study' | 'quiz-edit' | 'quiz-welcome' | 'quiz-play' | 'quiz-result';
type BoardQuizShareMode = 'invite' | 'score';
type BoardQuizShareTarget = Extract<ShareTarget, 'whatsapp' | 'facebook' | 'x'>;

const playerCardVersion = 'x-player-v2';

type BoardSticker = {
  id: string;
  icon: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  colorIndex: number;
};

type BoardTourLeg = {
  distanceText: string;
  durationText: string;
  instruction: string;
  navScript: string;
  encodedPolyline: string;
  toCardId: string;
};

type BoardCardTour = {
  sequence: number;
  lat: number | null;
  lng: number | null;
  address: string;
  guideScript: string;
  legToNext: BoardTourLeg | null;
};

type BoardTourMeta = {
  mode: BoardTourMode;
  totalDistanceText: string;
  totalDurationText: string;
  routePolyline: string;
  voiceStyle: BoardTourVoiceStyle;
  paceOrRouteStyle: string;
  extras: string[];
  showWayfindersDefault: boolean;
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
  scope: BoardCardScope;
  status: BoardCardStatus;
  rating: number;
  entityName?: string;
  entityType?: BoardEntityType;
  imageIntent?: BoardImageIntent;
  imageContext?: string;
  mediaKind?: BoardMediaKind;
  shortSummary?: string;
  rank?: number;
  imageUrl: string;
  imageUrls: string[];
  audioPreviewUrl: string;
  spotifyTrackId: string;
  spotifyTrackUrl: string;
  spotifyUri: string;
  spotifyArtistName: string;
  spotifyAlbumName: string;
  spotifyArtworkUrl: string;
  placeId: string;
  googleMapsUrl: string;
  locationLat?: number;
  locationLng?: number;
  sourceUrl?: string;
  productUrl?: string;
  merchant?: string;
  price?: string;
  currency?: string;
  sku?: string;
  availability?: string;
  productCategory?: string;
  imageSource?: 'source-page' | 'product-page' | 'search' | 'generated' | 'missing';
  extractionConfidence?: number;
  extractedAt?: string;
  what3wordsAddress?: string;
  tags: string[];
  stickers: BoardSticker[];
  tour: BoardCardTour | null;
  relatedCards?: BoardCard[];
  createdAt: string;
  updatedAt: string;
};

type Board = {
  id: string;
  kind: BoardKind;
  sortOrder: number;
  ownerUserId: string;
  ownerPublicSlug: string;
  ownerDisplayName: string;
  ownerPhotoUrl: string;
  ownerProfileIcon: string;
  ownerProfilePictureType: 'icon' | 'image' | null;
  forkedFromBoardId: string;
  forkedFromTitle: string;
  forkedFromOwnerUserId: string;
  forkedFromOwnerName: string;
  visibility: BoardVisibility;
  title: string;
  description: string;
  backNote: string;
  icon: string;
  tone: BoardTone;
  imageUrl: string;
  logoUrl: string;
  logoLinkUrl: string;
  stackCtaLabel: string;
  stackCtaUrl: string;
  socialVideoUrl: string;
  socialVideoMimeType: string;
  socialVideoUpdatedAt: string;
  socialVideoRenderVersion?: string;
  socialVideoRatio: StackRatio;
  socialVideoAudioTrackId: string;
  socialVideoAudioVolume: number;
  stickers: BoardSticker[];
  tourMeta: BoardTourMeta | null;
  learningQuiz?: BoardLearningQuiz | null;
  cards: BoardCard[];
  createdAt: string;
  updatedAt: string;
};

type BoardDraft = {
  title: string;
  description: string;
  backNote: string;
  icon: string;
  tone: BoardTone;
  visibility: BoardVisibility;
  imageUrl: string;
  logoUrl: string;
  logoLinkUrl: string;
  stackCtaLabel: string;
  stackCtaUrl: string;
  stickers: BoardSticker[];
};

type CardDraft = {
  title: string;
  subtitle: string;
  notes: string;
  type: BoardCardType;
  scope: BoardCardScope;
  status: BoardCardStatus;
  rating: string;
  imageUrl: string;
  imageUrls: string[];
  audioPreviewUrl: string;
  spotifyTrackId: string;
  spotifyTrackUrl: string;
  spotifyUri: string;
  spotifyArtistName: string;
  spotifyAlbumName: string;
  spotifyArtworkUrl: string;
  placeQuery: string;
  placeCity: string;
  placeId: string;
  googleMapsUrl: string;
  what3wordsAddress: string;
  tags: string;
  stickers: BoardSticker[];
  tourSequence: string;
  tourLat: string;
  tourLng: string;
  tourAddress: string;
  tourGuideScript: string;
  tourLegDistanceText: string;
  tourLegDurationText: string;
  tourLegInstruction: string;
  tourLegNavScript: string;
  tourLegEncodedPolyline: string;
};

type RelatedCardDraft = {
  title: string;
  subtitle: string;
  notes: string;
  type: BoardCardType;
  imageUrl: string;
  imageName: string;
  analysisDataUrl: string;
  tags: string;
  prompt: string;
  generated: BoardWizardGeneratedCard | null;
};

type TourStopDraft = {
  prompt: string;
  visitorNotes: string;
  title: string;
  subtitle: string;
  notes: string;
  address: string;
  guideScript: string;
  imageUrl: string;
  imageName: string;
  analysisDataUrl: string;
  tags: string;
  placeId: string;
  googleMapsUrl: string;
  lat: string;
  lng: string;
  generated: BoardWizardGeneratedCard | null;
};

type GalleryCard = {
  card: BoardCard;
  board: Board;
};

type CardDeleteCandidate = {
  boardId: string;
  boardTitle: string;
  card: BoardCard;
};

type CardBulkDeleteCandidate = {
  boardId: string;
  boardTitle: string;
  cards: BoardCard[];
};

type BoardCityOption = {
  id: string;
  name: string;
  region: string;
  slug: string;
};

type BoardFriendProfile = {
  userId: string;
  email: string;
  displayName: string;
  photoURL: string;
  profileIcon: string;
  profilePictureType: 'icon' | 'image' | null;
};

type BoardFriendCandidate = BoardFriendProfile & {
  relationshipStatus: 'available' | 'pending' | 'friend';
};

type BoardFriendRequestSummary = {
  id: string;
  fromUserId: string;
  fromEmail: string;
  fromDisplayName: string;
  toEmail: string;
  createdAt: string;
};

type BoardFriendsState = {
  friends: BoardFriendProfile[];
  incoming: BoardFriendRequestSummary[];
  outgoing: BoardFriendRequestSummary[];
};
type BoardFriendsSort = 'name' | 'email';

type BoardRecord = Omit<Board, 'createdAt' | 'updatedAt'> & {
  owner_user_id: string;
  owner_public_slug: string;
  owner_display_name: string;
  owner_photo_url: string;
  owner_profile_icon: string;
  owner_profile_picture_type: 'icon' | 'image' | null;
  visibility: BoardVisibility;
  created_at_iso: string;
  updated_at_iso: string;
};

type BoardWizardGeneratedCard = {
  title: string;
  subtitle: string;
  notes: string;
  type: BoardCardType;
  scope: BoardCardScope;
  status: BoardCardStatus;
  rating: number;
  tags: string[];
  image_query: string;
  place_query: string;
  entity_name?: string;
  entity_type?: BoardEntityType;
  image_intent?: BoardImageIntent;
  image_context?: string;
  media_kind?: BoardMediaKind;
  short_summary?: string;
  rank?: number;
  imageUrl?: string;
  audioPreviewUrl?: string;
  spotifyTrackId?: string;
  spotifyTrackUrl?: string;
  spotifyUri?: string;
  spotifyArtistName?: string;
  spotifyAlbumName?: string;
  spotifyArtworkUrl?: string;
  placeId?: string;
  googleMapsUrl?: string;
  locationLat?: number;
  locationLng?: number;
  sourceUrl?: string;
  productUrl?: string;
  merchant?: string;
  price?: string;
  currency?: string;
  sku?: string;
  availability?: string;
  productCategory?: string;
  imageSource?: 'source-page' | 'product-page' | 'search' | 'generated' | 'missing';
  extractionConfidence?: number;
  extractedAt?: string;
  what3wordsAddress?: string;
  tour?: BoardCardTour | null;
};

type BoardWizardPhoto = {
  id: string;
  sourceKey: string;
  name: string;
  caption: string;
  imageUrl: string;
  analysisDataUrl: string;
};

type BoardWizardGeneratedBatch = {
  board: {
    title: string;
    description: string;
    icon: string;
    tone: BoardTone;
    kind?: BoardKind;
    tourMeta?: BoardTourMeta | null;
  };
  cards: BoardWizardGeneratedCard[];
  sourceReport?: BoardWizardSourceReport;
};

type BoardWizardSourceReport = {
  status: 'exact' | 'recovered' | 'partial';
  method: 'page' | 'reader' | 'grounded-search';
  sourceHost: string;
  sourceBlocked: boolean;
  productCount: number;
  exactImageCount: number;
  missingImageCount: number;
  snapshotDate: string;
  message: string;
};

type BoardWizardPreviewCard = BoardWizardGeneratedCard & {
  id: string;
  imageUrl: string;
  placeId: string;
  googleMapsUrl: string;
  editing: boolean;
};

type StackFrame = {
  kind: 'cover' | 'card' | 'closing';
  card?: BoardCard;
  index: number;
  total: number;
};

type StackSwipeState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startedAt: number;
  target: HTMLElement;
};

type TourDeckFrame = {
  kind: 'stop' | 'leg';
  card: BoardCard;
  nextCard: BoardCard | null;
  index: number;
  total: number;
};

type TourSpeechResponse = {
  audioUrl?: string;
  audioBase64?: string;
  contentType?: string;
  provider?: string;
  voiceId?: string;
};

type SpotifyResolvedCard = {
  audioPreviewUrl: string;
  spotifyTrackId: string;
  spotifyTrackUrl: string;
  spotifyUri: string;
  spotifyArtistName: string;
  spotifyAlbumName: string;
  spotifyArtworkUrl: string;
};

type CardWizardRunOptions = {
  promptOverride?: string;
  forceImageLookup?: boolean;
  preserveExistingImageOnMiss?: boolean;
};

type CardImageSearchResult = {
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  sourceLabel: string;
  title: string;
  token: string;
};

type TourMapPoint = {
  card: BoardCard;
  position: { lat: number; lng: number };
};

const STORAGE_KEY = 'livingwiki-boards-v1';
const BOARD_ACTIONS_STORAGE_KEY = 'livingwiki-board-actions-v1';
const DEMO_BOARD_IDS = new Set(['board-summer-places', 'board-eats', 'board-weekend']);
const PUBLIC_APP_URL = 'https://www.livingwiki.com';

const BOARD_TONES: Array<{ id: BoardTone; label: string; accent: string; soft: string }> = [
  { id: 'teal', label: $localize`Teal`, accent: '#007f7a', soft: '#dffcf7' },
  { id: 'coral', label: $localize`Coral`, accent: '#d94d2b', soft: '#ffe2d7' },
  { id: 'yellow', label: $localize`Gold`, accent: '#9a6500', soft: '#fff0b8' },
  { id: 'green', label: $localize`Green`, accent: '#28853c', soft: '#daf8c8' },
  { id: 'blue', label: $localize`Blue`, accent: '#1f62c8', soft: '#ddeeff' },
  { id: 'sky', label: $localize`Sky`, accent: '#087b99', soft: '#dff7ff' },
  { id: 'purple', label: $localize`Purple`, accent: '#7c3ec8', soft: '#f0e4ff' },
];

const CARD_TYPES: Array<{ id: BoardCardType; label: string; icon: string }> = [
  { id: 'place', label: $localize`Place`, icon: 'location_on' },
  { id: 'food', label: $localize`Food`, icon: 'restaurant' },
  { id: 'memory', label: $localize`Memory`, icon: 'auto_stories' },
  { id: 'idea', label: $localize`Idea`, icon: 'lightbulb' },
  { id: 'shop', label: $localize`Shop`, icon: 'storefront' },
  { id: 'note', label: $localize`Note`, icon: 'sticky_note_2' },
];

const CARD_SCOPES: Array<{ id: BoardCardScope; label: string; icon: string }> = [
  { id: 'place', label: $localize`Place`, icon: 'location_on' },
  { id: 'city', label: $localize`City`, icon: 'location_city' },
  { id: 'country', label: $localize`Country`, icon: 'flag' },
  { id: 'region', label: $localize`Region`, icon: 'map' },
];

const CARD_STATUSES: Array<{ id: BoardCardStatus; label: string; icon: string }> = [
  { id: 'planned', label: $localize`Planned`, icon: 'event' },
  { id: 'saved', label: $localize`Saved`, icon: 'bookmark' },
  { id: 'visited', label: $localize`Visited`, icon: 'check_circle' },
  { id: 'favorite', label: $localize`Favorite`, icon: 'kid_star' },
];

const BOARD_WIZARD_MODES: Array<{
  id: BoardWizardMode | 'manual';
  label: string;
  description: string;
  icon: string;
}> = [
  {
    id: 'manual',
    label: $localize`Add board manually`,
    description: $localize`Create an empty board with the current form.`,
    icon: 'edit_square',
  },
  {
    id: 'describe',
    label: $localize`Describe it`,
    description: $localize`Tell the wizard what you want and preview generated cards.`,
    icon: 'auto_awesome',
  },
  {
    id: 'paste',
    label: $localize`Paste text or a list`,
    description: $localize`Turn articles, ranked lists, notes, or bullets into editable cards.`,
    icon: 'format_list_bulleted_add',
  },
  {
    id: 'photos',
    label: $localize`Use photos`,
    description: $localize`Turn your actual photos into a visual memory board.`,
    icon: 'photo_library',
  },
  {
    id: 'off-grid',
    label: $localize`Off-grid places`,
    description: $localize`Pin places without street addresses to an exact what3words square.`,
    icon: 'location_on',
  },
  {
    id: 'walking-tour',
    label: $localize`Walking tour`,
    description: $localize`Generate ordered stops, guide scripts, a route, and wayfinder cards.`,
    icon: 'directions_walk',
  },
  {
    id: 'driving-tour',
    label: $localize`Driving tour`,
    description: $localize`Turn a scenic drive into mapped stops, navigation legs, and narration.`,
    icon: 'directions_car',
  },
  {
    id: 'url',
    label: $localize`Use a URL`,
    description: $localize`Extract a page or guide into a board draft.`,
    icon: 'link',
  },
];

const BOARD_WIZARD_VIBES: Array<{ id: BoardWizardVibe; label: string; icon: string }> = [
  { id: 'playful', label: $localize`Playful`, icon: 'celebration' },
  { id: 'foodie', label: $localize`Foodie`, icon: 'restaurant' },
  { id: 'traveler', label: $localize`Traveler`, icon: 'travel_explore' },
  { id: 'curator', label: $localize`Curator`, icon: 'interests' },
  { id: 'memory', label: $localize`Memory`, icon: 'auto_stories' },
];

const BOARD_WIZARD_STATUS_MESSAGES = [
  'Reading the source',
  'Drafting board structure',
  'Generating editable cards',
  'Searching places and images',
  'Preparing preview',
];

const BOARD_TOUR_STATUS_MESSAGES = [
  'Finding the stops',
  'Ordering the route',
  'Resolving places and photos',
  'Calculating wayfinder legs',
  'Writing guide scripts',
  'Preparing preview',
];

const TOUR_VOICE_STYLES: Array<{ id: BoardTourVoiceStyle; label: string; icon: string }> = [
  { id: 'historian', label: $localize`Historian`, icon: 'school' },
  { id: 'local', label: $localize`Local`, icon: 'record_voice_over' },
  { id: 'kid-friendly', label: $localize`Kid-friendly`, icon: 'family_restroom' },
];

const WALKING_PACE_OPTIONS = ['Leisurely', 'Standard', 'Brisk'];
const DRIVING_ROUTE_OPTIONS = ['Scenic', 'Balanced', 'Direct'];
const WALKING_TOUR_EXTRAS = ['Photo stops', 'Coffee and rest breaks', 'Accessibility notes', 'Night version'];
const DRIVING_TOUR_EXTRAS = ['Photo pull-offs', 'Parking and restrooms', 'Auto-play at each stop', 'Golden-hour timing'];

const COUNTRY_OPTIONS: Array<{ name: string; aliases?: string[] }> = [
  { name: 'Afghanistan' },
  { name: 'Albania' },
  { name: 'Algeria' },
  { name: 'Andorra' },
  { name: 'Angola' },
  { name: 'Antigua and Barbuda' },
  { name: 'Argentina' },
  { name: 'Armenia' },
  { name: 'Australia' },
  { name: 'Austria' },
  { name: 'Azerbaijan' },
  { name: 'Bahamas' },
  { name: 'Bahrain' },
  { name: 'Bangladesh' },
  { name: 'Barbados' },
  { name: 'Belarus' },
  { name: 'Belgium' },
  { name: 'Belize' },
  { name: 'Benin' },
  { name: 'Bhutan' },
  { name: 'Bolivia' },
  { name: 'Bosnia and Herzegovina', aliases: ['Bosnia'] },
  { name: 'Botswana' },
  { name: 'Brazil' },
  { name: 'Brunei' },
  { name: 'Bulgaria' },
  { name: 'Burkina Faso' },
  { name: 'Burundi' },
  { name: 'Cabo Verde', aliases: ['Cape Verde'] },
  { name: 'Cambodia' },
  { name: 'Cameroon' },
  { name: 'Canada' },
  { name: 'Central African Republic' },
  { name: 'Chad' },
  { name: 'Chile' },
  { name: 'China' },
  { name: 'Colombia' },
  { name: 'Comoros' },
  { name: 'Costa Rica' },
  { name: "Cote d'Ivoire", aliases: ['Ivory Coast', "Côte d'Ivoire"] },
  { name: 'Croatia' },
  { name: 'Cuba' },
  { name: 'Cyprus' },
  { name: 'Czechia', aliases: ['Czech Republic'] },
  { name: 'Democratic Republic of the Congo', aliases: ['Congo', 'DRC', 'Congo Kinshasa', 'Democratic Republic Congo'] },
  { name: 'Denmark' },
  { name: 'Djibouti' },
  { name: 'Dominica' },
  { name: 'Dominican Republic' },
  { name: 'Ecuador' },
  { name: 'Egypt' },
  { name: 'El Salvador' },
  { name: 'Equatorial Guinea' },
  { name: 'Eritrea' },
  { name: 'Estonia' },
  { name: 'Eswatini', aliases: ['Swaziland'] },
  { name: 'Ethiopia' },
  { name: 'Fiji' },
  { name: 'Finland' },
  { name: 'France' },
  { name: 'Gabon' },
  { name: 'Gambia', aliases: ['The Gambia'] },
  { name: 'Georgia' },
  { name: 'Germany' },
  { name: 'Ghana' },
  { name: 'Greece' },
  { name: 'Grenada' },
  { name: 'Guatemala' },
  { name: 'Guinea' },
  { name: 'Guinea-Bissau' },
  { name: 'Guyana' },
  { name: 'Haiti' },
  { name: 'Honduras' },
  { name: 'Hungary' },
  { name: 'Iceland' },
  { name: 'India' },
  { name: 'Indonesia' },
  { name: 'Iran' },
  { name: 'Iraq' },
  { name: 'Ireland' },
  { name: 'Israel' },
  { name: 'Italy' },
  { name: 'Jamaica' },
  { name: 'Japan' },
  { name: 'Jordan' },
  { name: 'Kazakhstan' },
  { name: 'Kenya' },
  { name: 'Kiribati' },
  { name: 'Kuwait' },
  { name: 'Kyrgyzstan' },
  { name: 'Laos' },
  { name: 'Latvia' },
  { name: 'Lebanon' },
  { name: 'Lesotho' },
  { name: 'Liberia' },
  { name: 'Libya' },
  { name: 'Liechtenstein' },
  { name: 'Lithuania' },
  { name: 'Luxembourg' },
  { name: 'Madagascar' },
  { name: 'Malawi' },
  { name: 'Malaysia' },
  { name: 'Maldives' },
  { name: 'Mali' },
  { name: 'Malta' },
  { name: 'Marshall Islands' },
  { name: 'Mauritania' },
  { name: 'Mauritius' },
  { name: 'Mexico' },
  { name: 'Micronesia' },
  { name: 'Moldova' },
  { name: 'Monaco' },
  { name: 'Mongolia' },
  { name: 'Montenegro' },
  { name: 'Morocco' },
  { name: 'Mozambique' },
  { name: 'Myanmar', aliases: ['Burma'] },
  { name: 'Namibia' },
  { name: 'Nauru' },
  { name: 'Nepal' },
  { name: 'Netherlands', aliases: ['Holland'] },
  { name: 'New Zealand' },
  { name: 'Nicaragua' },
  { name: 'Niger' },
  { name: 'Nigeria' },
  { name: 'North Korea' },
  { name: 'North Macedonia', aliases: ['Macedonia'] },
  { name: 'Norway' },
  { name: 'Oman' },
  { name: 'Pakistan' },
  { name: 'Palau' },
  { name: 'Palestine', aliases: ['State of Palestine'] },
  { name: 'Panama' },
  { name: 'Papua New Guinea' },
  { name: 'Paraguay' },
  { name: 'Peru' },
  { name: 'Philippines' },
  { name: 'Poland' },
  { name: 'Portugal' },
  { name: 'Qatar' },
  { name: 'Republic of the Congo', aliases: ['Congo', 'Congo Brazzaville', 'Congo Republic'] },
  { name: 'Romania' },
  { name: 'Russia', aliases: ['Russian Federation'] },
  { name: 'Rwanda' },
  { name: 'Saint Kitts and Nevis' },
  { name: 'Saint Lucia' },
  { name: 'Saint Vincent and the Grenadines' },
  { name: 'Samoa' },
  { name: 'San Marino' },
  { name: 'Sao Tome and Principe', aliases: ['São Tomé and Príncipe'] },
  { name: 'Saudi Arabia' },
  { name: 'Senegal' },
  { name: 'Serbia' },
  { name: 'Seychelles' },
  { name: 'Sierra Leone' },
  { name: 'Singapore' },
  { name: 'Slovakia' },
  { name: 'Slovenia' },
  { name: 'Solomon Islands' },
  { name: 'Somalia' },
  { name: 'South Africa' },
  { name: 'South Korea' },
  { name: 'South Sudan' },
  { name: 'Spain' },
  { name: 'Sri Lanka' },
  { name: 'Sudan' },
  { name: 'Suriname' },
  { name: 'Sweden' },
  { name: 'Switzerland' },
  { name: 'Syria' },
  { name: 'Taiwan' },
  { name: 'Tajikistan' },
  { name: 'Tanzania' },
  { name: 'Thailand' },
  { name: 'Timor-Leste', aliases: ['East Timor'] },
  { name: 'Togo' },
  { name: 'Tonga' },
  { name: 'Trinidad and Tobago' },
  { name: 'Tunisia' },
  { name: 'Turkey' },
  { name: 'Turkmenistan' },
  { name: 'Tuvalu' },
  { name: 'Uganda' },
  { name: 'Ukraine' },
  { name: 'United Arab Emirates', aliases: ['UAE'] },
  { name: 'United Kingdom', aliases: ['UK', 'Britain', 'Great Britain', 'England'] },
  { name: 'United States', aliases: ['US', 'USA', 'United States of America', 'America'] },
  { name: 'Uruguay' },
  { name: 'Uzbekistan' },
  { name: 'Vanuatu' },
  { name: 'Vatican City', aliases: ['Holy See', 'Vatican'] },
  { name: 'Venezuela' },
  { name: 'Vietnam' },
  { name: 'Yemen' },
  { name: 'Zambia' },
  { name: 'Zimbabwe' },
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
  { id: 'facebook', label: $localize`Facebook`, icon: 'public' },
  { id: 'x', label: 'X', icon: 'alternate_email' },
  { id: 'linkedin', label: $localize`LinkedIn`, icon: 'work' },
  { id: 'whatsapp', label: $localize`WhatsApp`, icon: 'chat' },
  { id: 'reddit', label: $localize`Reddit`, icon: 'forum' },
  { id: 'email', label: $localize`Email`, icon: 'mail' },
];

const STACK_FORMATS: Array<{ id: StackFormat; label: string; icon: string; hint: string }> = [
  { id: 'carousel', label: $localize`Carousel`, icon: 'view_carousel', hint: $localize`Swipe cards` },
  { id: 'reel', label: $localize`Reel`, icon: 'smart_display', hint: $localize`Story flow` },
  { id: 'both', label: $localize`Both`, icon: 'auto_awesome_motion', hint: $localize`Share pack` },
];

const STACK_RATIOS: Array<{ id: StackRatio; label: string; icon: string }> = [
  { id: 'vertical', label: '9:16', icon: 'stay_current_portrait' },
  { id: 'square', label: '1:1', icon: 'crop_square' },
  { id: 'landscape', label: '16:9', icon: 'crop_16_9' },
];

const STACK_EXPORT_TARGETS: Array<{ id: StackExportTarget; label: string; icon: string }> = [
  { id: 'x', label: $localize`X video`, icon: 'alternate_email' },
  { id: 'whatsapp', label: $localize`WhatsApp`, icon: 'chat' },
  { id: 'facebook', label: $localize`Facebook`, icon: 'public' },
  { id: 'instagram', label: $localize`Instagram`, icon: 'photo_camera' },
  { id: 'tiktok', label: $localize`TikTok`, icon: 'music_note' },
  { id: 'download', label: $localize`Download`, icon: 'download' },
];

const STACK_LINK_SHARE_TARGETS: Array<{ id: StackLinkShareTarget; label: string; mark: string; color: string }> = [
  { id: 'x', label: 'X', mark: '𝕏', color: '#111111' },
  { id: 'facebook', label: $localize`Facebook`, mark: 'f', color: '#1877f2' },
  { id: 'linkedin', label: $localize`LinkedIn`, mark: 'in', color: '#0a66c2' },
  { id: 'reddit', label: $localize`Reddit`, mark: 'r/', color: '#ff4500' },
  { id: 'whatsapp', label: $localize`WhatsApp`, mark: '◉', color: '#25d366' },
  { id: 'more', label: $localize`More`, mark: '•••', color: '#52615a' },
];

const STACK_VIDEO_MAX_CARDS = 30;

@Component({
  selector: 'app-boards',
  imports: [WorkspaceSidebarComponent, MobileMenuComponent, ThemeToggleComponent, AccountMenuComponent, RouterLink],
  templateUrl: './boards.html',
  styleUrls: ['./boards.css', './card-image-tools.css', './wizard-card-editor.css', './board-live-entry.css', './board-learning.css', './tour-order.css', './tour-stop-editor.css', './stack-audio.css'],
})
export class BoardsComponent implements OnDestroy {
  private readonly localeId = inject(LOCALE_ID);
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);
  private readonly googleMapsService = inject(GoogleMapsService);
  private readonly placeReviewsService = inject(PlaceReviewsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  readonly spotify = inject(SpotifyPlaybackService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore: Firestore | null = this.isBrowser ? getFirebaseFirestore() : null;
  private readonly functions: Functions | null = this.isBrowser ? getFirebaseFunctions() : null;
  private readonly storage: FirebaseStorage | null = this.isBrowser ? getFirebaseStorage() : null;
  private hasLoaded = false;
  private loadedStoredLocalBoards = false;
  private placeSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private placeSearchRun = 0;
  private stickerDragState: StickerDragState | null = null;
  private stackSwipeState: StackSwipeState | null = null;
  private suppressNextBoardOpen = false;
  private stackPlaybackTimer: ReturnType<typeof setInterval> | null = null;
  private shareMessageTimer: ReturnType<typeof setTimeout> | null = null;
  private stackShareMessageTimer: ReturnType<typeof setTimeout> | null = null;
  private boardFriendSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private boardFriendSearchRun = 0;
  private tourMapElement: HTMLElement | null = null;
  private tourMap: unknown | null = null;
  private tourMapBoardId: string | null = null;
  private tourMapMarkers: unknown[] = [];
  private tourMapPolylines: unknown[] = [];
  private tourAudio: HTMLAudioElement | null = null;
  private stackNarrationAudio: HTMLAudioElement | null = null;
  private tourSpeechUtterance: SpeechSynthesisUtterance | null = null;
  private songPreviewAudio: HTMLAudioElement | null = null;
  private readonly spotifyEnrichedBoardIds = new Set<string>();
  private readonly spotifyEnrichmentInFlightBoardIds = new Set<string>();
  private readonly spotifyEmbedUrls = new Map<string, SafeResourceUrl>();
  private stackLivePreviewAutoplay = false;
  private stackLivePreviewSwitchToken = 0;
  private stackTourNarrationSwitchToken = 0;
  private stackAudioPreviewRun = 0;
  private wizardPhotoImportRun = 0;
  private wizardOffGridLocationRun = 0;
  private boardLearnStartedAt = 0;
  private boardLearnElapsedMs = 0;
  private boardLearnDirectRequested = false;
  private boardLearnDirectOpenedFor = '';
  private boardTranslationRun = 0;
  private boardTranslationRequestKey = '';
  private selectedBoardUnsubscribe: Unsubscribe | null = null;
  private readonly tourAudioUrls = new Map<string, string>();
  private readonly tourAudioPromises = new Map<string, Promise<string | null>>();
  private readonly publishedStackVideoFiles = new Map<string, File>();
  private readonly stackAudioUrls = new Map<string, string>();
  private stackAudioPreview: HTMLAudioElement | null = null;
  private friendsLoadedForUid = '';
  private visitPlansLoadedFor = '';
  private relatedCardsReturnScrollY = 0;
  private relatedCardsReturnSearch = '';

  @ViewChild('tourMapCanvas')
  set tourMapCanvasRef(value: ElementRef<HTMLElement> | undefined) {
    this.tourMapElement = value?.nativeElement ?? null;
    if (this.tourMapElement && this.isBrowser) {
      window.setTimeout(() => void this.renderTourMap(), 0);
    }
  }

  readonly tones = BOARD_TONES;
  readonly cardTypes = CARD_TYPES;
  readonly cardScopes = CARD_SCOPES;
  readonly cardStatuses = CARD_STATUSES;
  readonly wizardModes = BOARD_WIZARD_MODES;
  readonly wizardVibes = BOARD_WIZARD_VIBES;
  readonly tourVoiceStyles = TOUR_VOICE_STYLES;
  readonly stackFormats = STACK_FORMATS;
  readonly stackRatios = STACK_RATIOS;
  readonly stackExportTargets = STACK_EXPORT_TARGETS;
  readonly stackLinkShareTargets = STACK_LINK_SHARE_TARGETS;
  readonly stackAudioTracks = STACK_AUDIO_TRACKS;
  readonly noStackAudioTrackId = NO_STACK_AUDIO_TRACK_ID;
  readonly defaultStackAudioTrackId = DEFAULT_STACK_AUDIO_TRACK_ID;
  readonly minStackAudioVolume = MIN_STACK_AUDIO_VOLUME;
  readonly maxStackAudioVolume = MAX_STACK_AUDIO_VOLUME;
  readonly songEqBars = Array.from({ length: 24 }, (_item, index) => index);
  readonly boardIcons = BOARD_ICONS;
  readonly cardStickerIcons = CARD_STICKER_ICONS;
  readonly ratingOptions = [1, 2, 3, 4, 5];
  readonly shareTargets = SHARE_TARGETS;

  readonly boards = signal<Board[]>([]);
  readonly publicCities = signal<BoardCityOption[]>([]);
  readonly citiesLoading = signal(false);
  readonly selectedBoardId = signal<string | null>(null);
  readonly publicOwnerKey = signal<string | null>(null);
  readonly publicOwnerUid = signal<string | null>(null);
  readonly publicOwnerSlug = signal<string | null>(null);
  readonly flippedBoardIds = signal<Set<string>>(new Set());
  readonly flippedCardIds = signal<Set<string>>(new Set());
  readonly openCardActionMenuKey = signal<string | null>(null);
  readonly expandedCardIds = signal<Set<string>>(new Set());
  readonly activeGalleryTab = signal<BoardGalleryTab>('boards');
  readonly boardSearch = signal('');
  readonly cardSearch = signal('');
  readonly boardDialogOpen = signal(false);
  readonly cardDialogOpen = signal(false);
  readonly relatedCardEditorOpen = signal(false);
  readonly relatedCardParentId = signal<string | null>(null);
  readonly relatedCardEditingId = signal<string | null>(null);
  readonly relatedCardAiLoading = signal(false);
  readonly relatedCardAiError = signal<string | null>(null);
  readonly relatedCardSaving = signal(false);
  readonly relatedCardDeleteCandidateId = signal<string | null>(null);
  readonly tourStopEditorOpen = signal(false);
  readonly tourStopInsertAfterId = signal<string | null>(null);
  readonly tourStopAiLoading = signal(false);
  readonly tourStopAiError = signal<string | null>(null);
  readonly tourStopSaving = signal(false);
  readonly exploredRelatedCardParentId = signal<string | null>(null);
  readonly boardDeleteCandidate = signal<Board | null>(null);
  readonly draggedBoardId = signal<string | null>(null);
  readonly boardDropTargetId = signal<string | null>(null);
  readonly boardDropPosition = signal<ReorderDropPosition | null>(null);
  readonly cardDeleteCandidate = signal<CardDeleteCandidate | null>(null);
  readonly cardBulkDeleteCandidate = signal<CardBulkDeleteCandidate | null>(null);
  readonly cardManageBoardId = signal<string | null>(null);
  readonly selectedCardIds = signal<Set<string>>(new Set());
  readonly draggedCardId = signal<string | null>(null);
  readonly cardDropTargetId = signal<string | null>(null);
  readonly cardDropPosition = signal<ReorderDropPosition | null>(null);
  readonly editingBoardId = signal<string | null>(null);
  readonly editingCardId = signal<string | null>(null);
  readonly imageUploadError = signal<string | null>(null);
  readonly cardWizardPrompt = signal('');
  readonly cardWizardLoading = signal(false);
  readonly cardWizardError = signal<string | null>(null);
  readonly cardImageToolMode = signal<CardImageToolMode>(null);
  readonly cardImagePrompt = signal('');
  readonly cardImageGenerating = signal(false);
  readonly cardGeneratedImageUrl = signal('');
  readonly cardGeneratedImageModel = signal('');
  readonly cardImageSearchQuery = signal('');
  readonly cardImageSearchLoading = signal(false);
  readonly cardImageSearchResults = signal<CardImageSearchResult[]>([]);
  readonly cardImageSearchIndex = signal(0);
  readonly cardImageApplying = signal(false);
  readonly cardImageToolError = signal<string | null>(null);
  readonly shareMessage = signal<string | null>(null);
  readonly boardTranslationMenuOpen = signal(false);
  readonly boardTranslationTarget = signal<BoardTranslationLanguage | null>(null);
  readonly boardTranslationResult = signal<BoardTranslationResult | null>(null);
  readonly boardTranslationVersion = signal('');
  readonly boardTranslationLoading = signal(false);
  readonly boardTranslationError = signal<string | null>(null);
  readonly boardTranslationLanguages = BOARD_TRANSLATION_LANGUAGES;
  readonly visitPlans = signal<Record<string, VisitPlanSummary>>({});
  readonly visitPlanDialogOpen = signal(false);
  readonly visitPlanBoardId = signal<string | null>(null);
  readonly visitPlanCardId = signal<string | null>(null);
  readonly visitPlanDateTime = signal(defaultVisitDateTime());
  readonly visitPlanTimezone = signal(browserTimezone());
  readonly visitPlanTimeSelected = signal(false);
  readonly visitPlanInviteEmails = signal('');
  readonly visitPlanContext = signal<VisitPlanContext>('board');
  readonly visitPlanShowScheduler = signal(true);
  readonly visitPlanOpenToBoard = signal(true);
  readonly visitPlanOpenPlans = signal<VisitPlanSummary[]>([]);
  readonly visitPlanOpenPlansLoading = signal(false);
  readonly visitPlanSelectedOpenPlanId = signal<string | null>(null);
  readonly visitPlanInterestCount = signal(0);
  readonly visitPlanGuestName = signal('');
  readonly visitPlanGuestEmail = signal('');
  readonly visitPlanSocialSaving = signal(false);
  readonly visitPlanInterestSaved = signal(false);
  readonly visitPlanInvitesExpanded = signal(false);
  readonly visitPlanAttendees = signal<VisitPlanAttendee[]>([]);
  readonly visitPlanAttendeesExpanded = signal(false);
  readonly visitPlanAttendeesLoading = signal(false);
  readonly visitPlanAttendeesError = signal<string | null>(null);
  readonly visitPlanSaving = signal(false);
  readonly visitPlanSharing = signal(false);
  readonly visitPlanError = signal<string | null>(null);
  readonly visitPlanMessage = signal<string | null>(null);
  readonly likedBoardIds = signal<Set<string>>(new Set());
  readonly savedBoardIds = signal<Set<string>>(new Set());
  readonly likedCardIds = signal<Set<string>>(new Set());
  readonly boardsSyncError = signal<string | null>(null);
  readonly privateBoardBlocked = signal(false);
  readonly boardFriends = signal<BoardFriendsState>({ friends: [], incoming: [], outgoing: [] });
  readonly boardFriendEmail = signal('');
  readonly boardFriendsSearch = signal('');
  readonly boardFriendsSort = signal<BoardFriendsSort>('name');
  readonly boardFriendsLoading = signal(false);
  readonly boardFriendSending = signal(false);
  readonly boardFriendsMessage = signal<string | null>(null);
  readonly boardFriendsError = signal<string | null>(null);
  readonly boardFriendsFocusRequested = signal(false);
  readonly friendsPage = signal(false);
  readonly songsPage = signal(false);
  readonly tripsPage = signal(false);
  readonly boardFriendCandidates = signal<BoardFriendCandidate[]>([]);
  readonly boardFriendCandidateLoading = signal(false);
  readonly sharePanelOpen = signal(false);
  readonly cardImageLocked = signal(false);
  readonly draggedStickerId = signal<string | null>(null);
  readonly placeSuggestions = signal<PlaceSearchResult[]>([]);
  readonly placeSearchLoading = signal(false);
  readonly placeSearchError = signal<string | null>(null);
  readonly placeSearchHint = signal<string | null>(null);
  readonly wizardOpen = signal(false);
  readonly wizardStep = signal<BoardWizardStep>('choose');
  readonly wizardMode = signal<BoardWizardMode>('describe');
  readonly wizardTargetBoardId = signal('new');
  readonly wizardContributionBoardId = signal<string | null>(null);
  readonly wizardDefaultType = signal<BoardCardType>('place');
  readonly wizardCount = signal(12);
  readonly wizardVibe = signal<BoardWizardVibe>('playful');
  readonly wizardPrompt = signal('');
  readonly wizardPastedList = signal('');
  readonly wizardPasteMaxLength = BOARD_WIZARD_PASTE_MAX_LENGTH;
  readonly wizardNumberedSource = computed(() => parseNumberedBoardSource(this.wizardPastedList()));
  readonly wizardPastedWhat3WordsSource = computed(() => parseWhat3WordsBoardSource(this.wizardPastedList()));
  readonly wizardDetectedPasteCount = computed(() =>
    this.wizardPastedWhat3WordsSource()?.items.length
      ?? this.wizardNumberedSource()?.items.length
      ?? 0,
  );
  readonly wizardUrl = signal('');
  readonly wizardPhotos = signal<BoardWizardPhoto[]>([]);
  readonly wizardPhotosLoading = signal(false);
  readonly wizardPhotoError = signal<string | null>(null);
  readonly wizardOffGridName = signal('');
  readonly wizardOffGridAddress = signal('');
  readonly wizardOffGridTip = signal('');
  readonly wizardOffGridSource = signal<OffGridLocationSource>('spot');
  readonly wizardOffGridParsedSource = computed(() => parseWhat3WordsBoardSource(this.wizardOffGridAddress()));
  readonly wizardOffGridIsBulk = computed(() => (this.wizardOffGridParsedSource()?.items.length ?? 0) > 1);
  readonly wizardOffGridVerifiedLocations = signal<Record<string, ResolvedWhat3WordsLocation>>({});
  readonly wizardOffGridVerificationFailures = signal<Record<string, string>>({});
  readonly wizardOffGridVerifiedCount = computed(() =>
    Object.keys(this.wizardOffGridVerifiedLocations()).length,
  );
  readonly wizardOffGridPhoto = signal('');
  readonly wizardOffGridResolvedLocation = signal<ResolvedWhat3WordsLocation | null>(null);
  readonly wizardOffGridLocation = computed(() => this.wizardOffGridResolvedLocation() ?? what3wordsLocation(this.wizardOffGridAddress()));
  readonly wizardOffGridLocating = signal(false);
  readonly wizardOffGridVerifying = signal(false);
  readonly wizardOffGridAccuracy = signal<number | null>(null);
  readonly wizardOffGridStatus = signal('');
  readonly wizardOffGridError = signal<string | null>(null);
  readonly wizardRefineText = signal('');
  readonly wizardStackCtaLabel = signal('');
  readonly wizardStackCtaUrl = signal('');
  readonly wizardTourVoiceStyle = signal<BoardTourVoiceStyle>('historian');
  readonly wizardTourPaceOrStyle = signal('Standard');
  readonly wizardTourExtras = signal<Set<string>>(new Set(['Photo stops', 'Accessibility notes']));
  readonly wizardLoadingIndex = signal(0);
  readonly wizardLoadingTask = signal<WizardLoadingTask | null>(null);
  readonly wizardError = signal<string | null>(null);
  readonly wizardResult = signal<BoardWizardGeneratedBatch | null>(null);
  readonly wizardPreviewCards = signal<BoardWizardPreviewCard[]>([]);
  readonly wizardSelectedCardIds = signal<Set<string>>(new Set());
  readonly wizardRedoingCardIds = signal<Set<string>>(new Set());
  readonly wizardImageLoadingCardIds = signal<Set<string>>(new Set());
  readonly wizardEditingCardId = signal<string | null>(null);
  readonly wizardCardEditorSection = signal<WizardCardEditorSection>('details');
  readonly wizardCardImageToolMode = signal<CardImageToolMode>(null);
  readonly wizardCardImagePrompt = signal('');
  readonly wizardCardImageGenerating = signal(false);
  readonly wizardCardGeneratedImageUrl = signal('');
  readonly wizardCardGeneratedImageModel = signal('');
  readonly wizardCardImageSearchQuery = signal('');
  readonly wizardCardImageSearchLoading = signal(false);
  readonly wizardCardImageSearchResults = signal<CardImageSearchResult[]>([]);
  readonly wizardCardImageSearchIndex = signal(0);
  readonly wizardCardImageApplying = signal(false);
  readonly wizardCardEditorError = signal<string | null>(null);
  readonly wizardSaving = signal(false);
  readonly songDeckIndex = signal(0);
  readonly songPreviewPlayingKey = signal<string | null>(null);
  readonly songPreviewError = signal<string | null>(null);
  readonly stackStudioOpen = signal(false);
  readonly stackStudioBoardId = signal<string | null>(null);
  readonly stackSelectedCardIds = signal<Set<string>>(new Set());
  readonly stackCoverTitle = signal('');
  readonly stackCoverSubtitle = signal('');
  readonly stackCaption = signal('');
  readonly stackFormat = signal<StackFormat>('both');
  readonly stackRatio = signal<StackRatio>('vertical');
  readonly stackAudioTrackId = signal(DEFAULT_STACK_AUDIO_TRACK_ID);
  readonly stackAudioVolume = signal(DEFAULT_STACK_AUDIO_VOLUME);
  readonly stackAudioPreviewingId = signal<string | null>(null);
  readonly stackAudioPreviewLoadingId = signal<string | null>(null);
  readonly stackAudioError = signal<string | null>(null);
  readonly stackFrameIndex = signal(0);
  readonly stackPlaying = signal(false);
  readonly stackShareMessage = signal<string | null>(null);
  readonly stackVideoExporting = signal(false);
  readonly stackVideoProgress = signal(0);
  readonly stackPublishedVideoLoading = signal(false);
  readonly stackPublishedVideoReady = signal(false);
  readonly stackShareMode = signal<StackShareMode>('video');
  readonly stackDirectView = signal(false);
  readonly stackExpandedCardId = signal<string | null>(null);
  readonly stackShareDialogOpen = signal(false);
  readonly stackFrameDurationMs = 4200;
  readonly stackActiveFrameDurationMs = signal(this.stackFrameDurationMs);
  readonly tourWayfindersShown = signal(false);
  readonly tourBoardView = signal<TourBoardView>('route');
  readonly tourRouteUpdating = signal(false);
  readonly tourRouteError = signal<string | null>(null);
  readonly tourGuideOpen = signal(false);
  readonly tourDeckIndex = signal(0);
  readonly tourSpeechPlaying = signal(false);
  readonly tourAudioLoadingKey = signal<string | null>(null);
  readonly tourAudioNotice = signal<string | null>(null);
  readonly selectedTourCardId = signal<string | null>(null);
  readonly cardPhotoIndexes = signal<Record<string, number>>({});
  readonly openCardMemoryGalleries = signal<Set<string>>(new Set());
  readonly cardPhotoViewerCardId = signal<string | null>(null);
  readonly cardPhotoViewerIndex = signal(0);
  readonly boardLearnOpen = signal(false);
  readonly boardLearnView = signal<BoardLearnView>('menu');
  readonly boardLearnStudyIndex = signal(0);
  readonly boardLearnStudyRevealed = signal(false);
  readonly boardLearnQuizDraft = signal<BoardLearningQuiz | null>(null);
  readonly boardLearnActiveQuiz = signal<BoardLearningQuiz | null>(null);
  readonly boardLearnQuizIndex = signal(0);
  readonly boardLearnQuizAnswers = signal<Record<string, string>>({});
  readonly boardLearnQuizGrade = signal<BoardLearningQuizGrade | null>(null);
  readonly boardLearnQuizSaving = signal(false);
  readonly boardLearnQuizSubmitting = signal(false);
  readonly boardLearnQuizStatus = signal<string | null>(null);
  readonly boardLearnQuizError = signal<string | null>(null);
  readonly boardLearnQuizStats = signal<BoardLearningQuizStats | null>(null);
  readonly boardLearnQuizStatsLoading = signal(false);
  readonly boardLearnQuizLeaderboard = signal<BoardLearningQuizLeaderboard | null>(null);
  readonly boardLearnQuizLeaderboardLoading = signal(false);
  readonly boardLearnQuizGuestName = signal('');
  readonly boardLearnQuizGuestPosting = signal(false);
  readonly boardLearnQuizGuestSkipped = signal(false);
  readonly boardLearnQuizScoreSaved = signal(false);
  readonly boardLearnQuizShareStatus = signal<string | null>(null);
  readonly boardLearnQuizShareMode = signal<BoardQuizShareMode | null>(null);

  readonly boardDraft = signal<BoardDraft>({
    title: '',
    description: '',
    backNote: '',
    icon: 'dashboard',
    tone: 'teal',
    visibility: 'public',
    imageUrl: '',
    logoUrl: '',
    logoLinkUrl: '',
    stackCtaLabel: '',
    stackCtaUrl: '',
    stickers: [],
  });
  readonly cardDraft = signal<CardDraft>({
    title: '',
    subtitle: '',
    notes: '',
    type: 'place',
    scope: 'place',
    status: 'saved',
    rating: '4',
    imageUrl: '',
    imageUrls: [],
    audioPreviewUrl: '',
    spotifyTrackId: '',
    spotifyTrackUrl: '',
    spotifyUri: '',
    spotifyArtistName: '',
    spotifyAlbumName: '',
    spotifyArtworkUrl: '',
    placeQuery: '',
    placeCity: '',
    placeId: '',
    googleMapsUrl: '',
    what3wordsAddress: '',
    tags: '',
    stickers: [],
    tourSequence: '',
    tourLat: '',
    tourLng: '',
    tourAddress: '',
    tourGuideScript: '',
    tourLegDistanceText: '',
    tourLegDurationText: '',
    tourLegInstruction: '',
    tourLegNavScript: '',
    tourLegEncodedPolyline: '',
  });
  readonly relatedCardDraft = signal<RelatedCardDraft>({
    title: '',
    subtitle: '',
    notes: '',
    type: 'memory',
    imageUrl: '',
    imageName: '',
    analysisDataUrl: '',
    tags: 'memory',
    prompt: '',
    generated: null,
  });
  readonly tourStopDraft = signal<TourStopDraft>({
    prompt: '',
    visitorNotes: '',
    title: '',
    subtitle: '',
    notes: '',
    address: '',
    guideScript: '',
    imageUrl: '',
    imageName: '',
    analysisDataUrl: '',
    tags: 'stop, tour',
    placeId: '',
    googleMapsUrl: '',
    lat: '',
    lng: '',
    generated: null,
  });

  readonly profile = this.authService.profile;
  readonly isSignedIn = this.authService.isAuthenticated;
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

  readonly originalSelectedBoard = computed(() => {
    const selectedId = this.selectedBoardId();
    return this.boards().find((board) => board.id === selectedId) ?? null;
  });
  readonly boardTranslationActive = computed(() => {
    const board = this.originalSelectedBoard();
    const result = this.boardTranslationResult();
    return !!board
      && !!result
      && result.boardId === board.id
      && result.targetLanguage === this.boardTranslationTarget()
      && result.changed
      && this.boardTranslationVersion() === board.updatedAt;
  });
  readonly selectedBoard = computed(() => {
    const board = this.originalSelectedBoard();
    const result = this.boardTranslationResult();
    if (!board
      || !result
      || !this.boardTranslationActive()
      || result.targetLanguage !== this.boardTranslationTarget()) {
      return board;
    }
    return applyBoardTranslation(board, result.segments);
  });
  readonly exploredRelatedCardParent = computed(() => {
    const parentId = this.exploredRelatedCardParentId();
    return parentId
      ? this.selectedBoard()?.cards.find((card) => card.id === parentId) ?? null
      : null;
  });
  readonly relatedCardEditorParent = computed(() => {
    const parentId = this.relatedCardParentId();
    return parentId
      ? this.originalSelectedBoard()?.cards.find((card) => card.id === parentId) ?? null
      : null;
  });
  readonly editingParentCard = computed(() => {
    const cardId = this.editingCardId();
    return cardId
      ? this.originalSelectedBoard()?.cards.find((card) => card.id === cardId) ?? null
      : null;
  });
  readonly tourStopInsertAfterCard = computed(() => {
    const board = this.originalSelectedBoard();
    const cardId = this.tourStopInsertAfterId();
    return board && cardId ? board.cards.find((card) => card.id === cardId) ?? null : null;
  });
  readonly tourStopInsertBeforeCard = computed(() => {
    const board = this.originalSelectedBoard();
    const afterCard = this.tourStopInsertAfterCard();
    if (!board || !afterCard) {
      return null;
    }
    return this.nextTourCard(afterCard, this.tourCards(board));
  });
  readonly visitPlanBoard = computed(() => {
    const boardId = this.visitPlanBoardId();
    return boardId ? this.boards().find((board) => board.id === boardId) ?? null : null;
  });
  readonly visitPlanCard = computed(() => {
    const cardId = this.visitPlanCardId();
    const board = this.visitPlanBoard();
    if (!board || !cardId) {
      return null;
    }
    return board.cards.find((card) => card.id === cardId)
      ?? board.cards.flatMap((card) => this.explicitRelatedCards(card)).find((card) => card.id === cardId)
      ?? null;
  });
  readonly activeVisitPlan = computed(() => {
    const cardId = this.visitPlanCardId();
    return cardId ? this.visitPlans()[cardId] ?? null : null;
  });
  readonly selectedOpenVisitPlan = computed(() => {
    const selectedId = this.visitPlanSelectedOpenPlanId();
    return this.visitPlanOpenPlans().find((plan) => plan.id === selectedId)
      ?? this.visitPlanOpenPlans()[0]
      ?? null;
  });
  readonly boardLearnBoard = computed(() => this.boardLearnOpen() ? this.selectedBoard() : null);
  readonly boardLearnStudyCard = computed(() => {
    const board = this.boardLearnBoard();
    if (!board?.cards.length) {
      return null;
    }
    return board.cards[Math.min(this.boardLearnStudyIndex(), board.cards.length - 1)] ?? null;
  });
  readonly boardLearnCurrentQuestion = computed(() => {
    const quiz = this.boardLearnActiveQuiz();
    return quiz?.questions[Math.min(this.boardLearnQuizIndex(), Math.max(0, quiz.questions.length - 1))] ?? null;
  });
  readonly boardLearnCurrentAnswer = computed(() => {
    const question = this.boardLearnCurrentQuestion();
    return question ? this.boardLearnQuizAnswers()[question.id] ?? null : null;
  });
  readonly boardLearnCanPublishQuiz = computed(() => {
    const draft = normalizeBoardLearningQuiz(this.boardLearnQuizDraft());
    return !!draft
      && draft.questions.length >= 3
      && draft.questions.every((question) =>
        question.prompt.length >= 8
        && question.options.length >= 2
        && question.options.every((option) => option.text.length > 0)
        && question.options.some((option) => option.id === question.correctOptionId));
  });
  readonly boardLearnCurrentLeaderboardEntry = computed<BoardLearningQuizLeaderboardEntry | null>(
    () => this.boardLearnQuizLeaderboard()?.entries.find((entry) => entry.isCurrentPlayer) ?? null,
  );
  readonly cardPhotoViewerCard = computed(() => {
    const cardId = this.cardPhotoViewerCardId();
    const board = this.selectedBoard();
    return board?.cards.find((card) => card.id === cardId)
      ?? board?.cards.flatMap((card) => this.relatedCardsFor(card)).find((card) => card.id === cardId)
      ?? null;
  });
  readonly selectedBoardTitle = computed(() => this.selectedBoard()?.title ?? $localize`Card`);
  readonly isSongCardForm = computed(() => {
    const board = this.selectedBoard();
    return !!board && this.isSongBoard(board);
  });
  readonly canManageBoardFriends = computed(() => this.isOwnBoardsProfile());
  readonly canCreateBoard = computed(() => this.isOwnBoardsProfile());
  readonly boardFriendsCountLabel = computed(() => {
    const count = this.boardFriends().friends.length;
    return `${count} friend${count === 1 ? '' : 's'}`;
  });
  readonly filteredBoardFriends = computed(() => {
    const query = this.boardFriendsSearch().trim().toLowerCase();
    const sort = this.boardFriendsSort();
    return this.boardFriends().friends
      .filter((friend) => {
        if (!query) {
          return true;
        }
        return [
          friend.displayName,
          friend.email,
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => {
        const leftValue = sort === 'email' ? left.email || left.displayName : left.displayName || left.email;
        const rightValue = sort === 'email' ? right.email || right.displayName : right.displayName || right.email;
        return leftValue.localeCompare(rightValue);
      });
  });
  readonly boardsProfileBoard = computed(() => this.boards().find((board) => board.ownerUserId) ?? null);
  readonly boardsProfileName = computed(() => {
    if (this.publicOwnerKey()) {
      const boardOwnerName = this.boardsProfileBoard()?.ownerDisplayName.trim();
      return boardOwnerName || this.publicOwnerHandleLabel();
    }
    return this.userName();
  });
  readonly boardsProfileSubtitle = computed(() => {
    if (this.publicOwnerKey()) {
      return this.boards().length ? $localize`Public LivingWiki boards` : $localize`No public boards found yet`;
    }
    return this.userEmail();
  });
  readonly boardsProfilePhotoUrl = computed(() => {
    const board = this.boardsProfileBoard();
    if (this.publicOwnerKey()) {
      return board?.ownerPhotoUrl.trim() || '';
    }
    return this.userPhotoUrl();
  });
  readonly boardsProfileIcon = computed(() => {
    const board = this.boardsProfileBoard();
    const boardIcon = board ? profileIconByCode(board.ownerProfileIcon) : null;
    if (this.publicOwnerKey()) {
      return boardIcon ?? profileIconForSeed(this.publicOwnerUid() || this.boardsProfileName());
    }
    return this.userIcon();
  });
  readonly canShareBoardsProfile = computed(() => !!this.boardsProfileShareUrl());

  readonly filteredBoards = computed(() => {
    const query = this.boardSearch().trim().toLowerCase();
    const boards = [...this.boards()]
      .filter((board) => !this.songsPage() || this.isSongBoard(board))
      .filter((board) => !this.tripsPage() || this.isTourBoard(board))
      .sort((a, b) => this.compareBoards(a, b));
    if (!query) {
      return boards;
    }

    return boards.filter((board) =>
      [board.title, board.description, board.backNote, board.cards.map((card) => card.title).join(' ')]
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
    const parent = this.exploredRelatedCardParent();
    const cards = parent
      ? this.relatedCardsFor(parent)
      : this.isTourBoard(board)
        ? this.cardsInTourDisplayOrder(board.cards)
        : [...board.cards];
    if (!query) {
      return cards;
    }

    return cards.filter((card) =>
      [card.title, card.subtitle, card.notes, card.type, card.scope, card.status, card.tags.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  });

  readonly selectedSongCards = computed(() => this.songCards(this.selectedBoard()).filter((card) => {
    const query = this.cardSearch().trim().toLowerCase();
    if (!query) {
      return true;
    }
    return [card.title, card.subtitle, card.notes, card.spotifyArtistName, card.spotifyAlbumName, card.tags.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(query);
  }));

  readonly selectedSongCard = computed(() => {
    const cards = this.selectedSongCards();
    if (!cards.length) {
      return null;
    }
    const index = Math.max(0, Math.min(this.songDeckIndex(), cards.length - 1));
    return cards[index] ?? cards[0] ?? null;
  });

  readonly allGalleryCards = computed<GalleryCard[]>(() =>
    this.boards().flatMap((board) => board.cards.map((card) => ({ card, board }))),
  );

  readonly visibleGalleryCards = computed<GalleryCard[]>(() => {
    const query = this.boardSearch().trim().toLowerCase();
    const cards = this.allGalleryCards()
      .filter((item) => this.activeGalleryTab() !== 'favorites' || item.card.status === 'favorite')
      .sort((a, b) => this.compareCards(a.card, b.card) || this.compareBoards(a.board, b.board));

    if (!query) {
      return cards;
    }

    return cards.filter(({ card, board }) =>
      [card.title, card.subtitle, card.notes, card.type, card.scope, card.status, card.tags.join(' '), board.title]
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
    const draft = this.cardDraft();
    const query = (draft.scope === 'city' ? draft.placeQuery : draft.placeCity).trim().toLowerCase();
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
  readonly wizardTargetBoards = computed(() => this.boards().filter((board) => this.canEditBoard(board)));
  readonly wizardContributionBoard = computed(() => {
    const boardId = this.wizardContributionBoardId();
    return boardId ? this.boards().find((board) => board.id === boardId) ?? null : null;
  });
  readonly wizardSelectedCount = computed(() => this.wizardSelectedCardIds().size);
  readonly wizardMissingImageCount = computed(() => this.wizardPreviewCards().filter((card) => !card.imageUrl).length);
  readonly wizardImageCoveragePercent = computed(() => {
    const cards = this.wizardPreviewCards();
    return cards.length ? Math.round((cards.length - this.wizardMissingImageCount()) / cards.length * 100) : 100;
  });
  readonly wizardProductCount = computed(() =>
    this.wizardPreviewCards().filter((card) => !!card.productUrl).length,
  );
  readonly wizardExactProductImageCount = computed(() =>
    this.wizardPreviewCards().filter((card) =>
      !!card.productUrl && (card.imageSource === 'source-page' || card.imageSource === 'product-page'),
    ).length,
  );
  readonly wizardFallbackProductImageCount = computed(() =>
    this.wizardPreviewCards().filter((card) =>
      !!card.productUrl && (card.imageSource === 'search' || card.imageSource === 'generated'),
    ).length,
  );
  readonly wizardMissingProductImageCount = computed(() =>
    this.wizardPreviewCards().filter((card) => !!card.productUrl && !card.imageUrl).length,
  );
  readonly wizardSourceReport = computed(() => this.wizardResult()?.sourceReport ?? null);
  readonly selectedCardCount = computed(() => this.selectedCardIds().size);
  readonly cardWizardCanGenerate = computed(() => {
    const draft = this.cardDraft();
    return !this.cardWizardLoading()
      && !!this.selectedBoard()
      && (
        this.cardWizardPrompt().trim().length >= 3
        || draft.placeQuery.trim().length >= 3
        || draft.title.trim().length >= 3
        || draft.notes.trim().length >= 8
      );
  });
  readonly currentCardImageSearchResult = computed(() =>
    this.cardImageSearchResults()[this.cardImageSearchIndex()] ?? null,
  );
  readonly wizardEditingCard = computed(() =>
    this.wizardPreviewCards().find((card) => card.id === this.wizardEditingCardId()) ?? null,
  );
  readonly currentWizardCardImageSearchResult = computed(() =>
    this.wizardCardImageSearchResults()[this.wizardCardImageSearchIndex()] ?? null,
  );
  readonly stackBoard = computed(() => {
    const boardId = this.stackStudioBoardId();
    return this.boards().find((board) => board.id === boardId) ?? null;
  });
  readonly stackSelectedCards = computed(() => {
    const board = this.stackBoard();
    const selectedIds = this.stackSelectedCardIds();
    return board ? board.cards.filter((card) => selectedIds.has(card.id)) : [];
  });
  readonly stackSelectedAudioTrack = computed(() =>
    stackAudioTrackById(this.stackAudioTrackId()),
  );
  readonly stackAudioVolumePercent = computed(() =>
    Math.round(this.stackAudioVolume() * 100),
  );
  readonly stackHasTourNarration = computed(() => this.stackSelectedCards().some((card) => !!card.tour));
  readonly stackSelectedCount = computed(() => this.stackSelectedCardIds().size);
  readonly stackFrameCount = computed(() => this.stackSelectedCards().length + 2);
  readonly stackProgressFrames = computed(() =>
    Array.from({ length: this.stackFrameCount() }, (_item, index) => index),
  );
  readonly stackCurrentFrame = computed<StackFrame>(() => {
    return this.stackFrameAtIndex(this.stackFrameIndex());
  });
  readonly stackCurrentCard = computed<BoardCard | null>(() => {
    const frame = this.stackCurrentFrame();
    return frame.kind === 'card' ? frame.card ?? null : null;
  });
  readonly stackCurrentTourCard = computed<BoardCard | null>(() => {
    const frame = this.stackCurrentFrame();
    return frame.kind === 'card' && frame.card?.tour ? frame.card : null;
  });
  readonly stackTourNarrationConsent = signal(false);
  readonly selectedBoardTourCards = computed(() => this.tourCards(this.selectedBoard()));
  readonly tourDeckFrames = computed<TourDeckFrame[]>(() => {
    const cards = this.selectedBoardTourCards();
    const frames: TourDeckFrame[] = [];
    cards.forEach((card) => {
      const nextCard = this.nextTourCard(card, cards);
      frames.push({ kind: 'stop', card, nextCard: null, index: 0, total: 0 });
      if (nextCard && this.tourLegToNext(card, nextCard)) {
        frames.push({ kind: 'leg', card, nextCard, index: 0, total: 0 });
      }
    });
    return frames.map((frame, index) => ({ ...frame, index, total: frames.length }));
  });
  readonly tourCurrentFrame = computed<TourDeckFrame | null>(() => {
    const frames = this.tourDeckFrames();
    if (!frames.length) {
      return null;
    }
    const index = Math.max(0, Math.min(this.tourDeckIndex(), frames.length - 1));
    return frames[index] ?? null;
  });
  readonly wizardCanGenerate = computed(() => {
    const mode = this.wizardMode();
    if (mode === 'describe') {
      return this.wizardPrompt().trim().length >= 4;
    }
    if (mode === 'paste') {
      return this.wizardPastedList().trim().length >= 2;
    }
    if (mode === 'url') {
      return /^https?:\/\/\S+/i.test(this.wizardUrl().trim());
    }
    if (mode === 'off-grid') {
      if (this.wizardOffGridSource() === 'spot') {
        return this.wizardOffGridName().trim().length >= 2
          && !!this.wizardOffGridResolvedLocation()
          && !!this.wizardOffGridPhoto();
      }
      const parsedItems = this.wizardOffGridParsedSource()?.items ?? [];
      if (!parsedItems.length || (this.wizardContributionBoard() && parsedItems.length > 1)) {
        return false;
      }
      return parsedItems.every((item, index) =>
        (item.name || (index === 0 ? this.wizardOffGridName().trim() : '')).length >= 2,
      );
    }
    if (this.isTourWizardMode(mode)) {
      return this.wizardPrompt().trim().length >= 4;
    }
    return mode === 'photos'
      ? this.wizardPhotos().length > 0 && !this.wizardPhotosLoading()
      : this.wizardPrompt().trim().length >= 4;
  });
  readonly countryMatchSuggestions = computed(() => {
    const draft = this.cardDraft();
    if (draft.scope !== 'country') {
      return [];
    }
    const query = draft.placeQuery.trim().toLowerCase();
    if (query.length < 2) {
      return [];
    }
    return COUNTRY_OPTIONS
      .filter((country) => this.countrySearchText(country).includes(query))
      .sort((left, right) => {
        const leftStarts = this.countryStartsWith(left, query) ? 0 : 1;
        const rightStarts = this.countryStartsWith(right, query) ? 0 : 1;
        return leftStarts - rightStarts || left.name.localeCompare(right.name);
      })
      .map((country) => country.name)
      .slice(0, 4);
  });

  constructor() {
    this.loadBoardActionState();
    this.loadLocalBoards();
    void this.loadCities();
    this.route.paramMap.subscribe((params) => {
      const routePath = this.route.snapshot.routeConfig?.path ?? '';
      this.friendsPage.set(routePath === 'friends');
      this.songsPage.set(routePath.startsWith('songs'));
      this.tripsPage.set(routePath.startsWith('trips'));
      const boardId = params.get('boardId');
      const ownerKey = params.get('ownerKey');
      const ownerUid = this.publicOwnerUidFromKey(ownerKey);
      const ownerSlug = this.publicOwnerSlugFromKey(ownerKey);
      if (this.selectedBoardId() !== boardId) {
        this.exploredRelatedCardParentId.set(null);
        this.relatedCardEditorOpen.set(false);
        this.relatedCardParentId.set(null);
        this.relatedCardEditingId.set(null);
        this.relatedCardDeleteCandidateId.set(null);
        this.relatedCardsReturnSearch = '';
      }
      this.selectedBoardId.set(boardId);
      if (this.boardTranslationResult()?.boardId !== boardId) {
        this.boardTranslationResult.set(null);
        this.boardTranslationVersion.set('');
        this.boardTranslationError.set(null);
      }
      this.publicOwnerKey.set(ownerKey);
      this.publicOwnerUid.set(ownerUid);
      this.publicOwnerSlug.set(ownerSlug);
      this.cardSearch.set('');
      this.closeCardManageMode();
      this.setShareMessage(null);
      this.sharePanelOpen.set(false);
      this.songDeckIndex.set(0);
      this.closeStackStudio();
      void this.loadBoards(boardId, ownerUid, ownerSlug, ownerKey !== null).then(() => {
        if (this.selectedBoardId() === boardId) {
          this.watchSelectedBoard(boardId);
        }
        this.syncStackDirectView();
        this.syncBoardLearnDirectView();
        void this.syncRequestedBoardTranslation();
        this.canonicalizeBoardsRootRoute(boardId, ownerKey);
        if (this.isBrowser && this.boardFriendsFocusRequested()) {
          window.setTimeout(() => this.scrollToBoardFriends(), 80);
        }
      });
    });

    this.route.queryParamMap.subscribe((params) => {
      const view = params.get('view') ?? params.get('stack');
      const wantsFriends = params.get('friends') === '1';
      const wantsStack = view === 'stack' || view === 'reel';
      this.tourBoardView.set(view === 'cards' ? 'cards' : 'route');
      const contentLanguage = params.get('contentLang');
      this.boardTranslationTarget.set(
        isBoardTranslationLanguage(contentLanguage) ? contentLanguage : null,
      );
      if (!isBoardTranslationLanguage(contentLanguage)) {
        this.boardTranslationResult.set(null);
        this.boardTranslationVersion.set('');
        this.boardTranslationError.set(null);
      }
      this.boardLearnDirectRequested = params.get('learn') === 'quiz';
      if (!this.boardLearnDirectRequested) {
        this.boardLearnDirectOpenedFor = '';
      }
      this.boardFriendsFocusRequested.set(wantsFriends);
      this.stackDirectView.set(wantsStack);
      if (wantsStack) {
        this.syncStackDirectView();
      } else {
        this.stopSongPreview();
        this.stopStackPlayback();
      }
      if (this.isBrowser && wantsFriends) {
        window.setTimeout(() => this.scrollToBoardFriends(), 120);
      }
      if (this.boardLearnDirectRequested) {
        this.syncBoardLearnDirectView();
      }
      void this.syncRequestedBoardTranslation();
    });

    effect(() => {
      const boards = this.boards();
      if (!this.isBrowser || !this.hasLoaded) {
        return;
      }
      const publicOwnerKey = this.publicOwnerKey();
      const publicOwnerUid = this.publicOwnerUid();
      const uid = this.authService.uid();
      if (publicOwnerKey) {
        if (publicOwnerUid) {
          if (publicOwnerUid !== uid) {
            return;
          }
        } else {
          const ownerBoard = this.boardsProfileBoard();
          const isOwnShortShelf = ownerBoard?.ownerUserId
            ? ownerBoard.ownerUserId === uid
            : this.publicOwnerSlug() === this.currentPublicOwnerKey();
          if (!isOwnShortShelf) {
            return;
          }
        }
      }
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(boards.filter((board) => this.canStoreBoardLocally(board))),
      );
    });

    effect(() => {
      const board = this.selectedBoard();
      const tourSignature = this.tourCards(board)
        .map((card) => [
          card.id,
          card.tour?.sequence,
          card.tour?.lat,
          card.tour?.lng,
          card.tour?.legToNext?.toCardId,
          card.tour?.legToNext?.encodedPolyline,
          card.title,
        ].join(':'))
        .join('|');
      if (!this.isBrowser || !this.isTourBoard(board)) {
        this.tourMapBoardId = null;
        return;
      }
      void tourSignature;
      window.setTimeout(() => void this.renderTourMap(), 0);
    });

    effect(() => {
      const board = this.selectedBoard();
      if (!this.isBrowser || !board || !board.cards.some((card) => this.isSongCard(card) && !card.spotifyTrackId)) {
        return;
      }
      void this.enrichBoardSpotify(board);
    });

    effect(() => {
      const uid = this.authService.uid();
      if (!this.isBrowser || !this.functions || !uid) {
        this.friendsLoadedForUid = '';
        this.boardFriends.set({ friends: [], incoming: [], outgoing: [] });
        this.boardFriendsLoading.set(false);
        return;
      }
      if (this.friendsLoadedForUid === uid) {
        return;
      }
      this.friendsLoadedForUid = uid;
      void this.loadBoardFriends();
    });

    effect(() => {
      const uid = this.authService.uid();
      const board = this.selectedBoard();
      if (!this.isBrowser || !this.functions || !uid || !board) {
        this.visitPlansLoadedFor = '';
        this.visitPlans.set({});
        return;
      }
      const visitPlanCardIds = this.visitPlanCardIds(board);
      const loadKey = `${uid}:${board.id}:${visitPlanCardIds.join(',')}`;
      if (this.visitPlansLoadedFor === loadKey) {
        return;
      }
      this.visitPlansLoadedFor = loadKey;
      void this.loadVisitPlans(board);
    });
  }

  ngOnDestroy(): void {
    this.wizardOffGridLocationRun += 1;
    this.selectedBoardUnsubscribe?.();
    this.selectedBoardUnsubscribe = null;
    this.stopSongPreview();
    this.stopStackAudioPreview();
    this.stopTourSpeech();
    this.stopStackPlayback();
    this.disposeStackNarrationAudio();
    if (this.boardFriendSearchTimer) {
      clearTimeout(this.boardFriendSearchTimer);
      this.boardFriendSearchTimer = null;
    }
    if (this.placeSearchTimer) {
      clearTimeout(this.placeSearchTimer);
      this.placeSearchTimer = null;
    }
    if (this.shareMessageTimer) {
      clearTimeout(this.shareMessageTimer);
      this.shareMessageTimer = null;
    }
    if (this.stackShareMessageTimer) {
      clearTimeout(this.stackShareMessageTimer);
      this.stackShareMessageTimer = null;
    }
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
    void this.router.navigate([this.boardRouteRoot(), boardId]);
  }

  closeBoardDetail(): void {
    this.stopSongPreview();
    this.closeTourStopEditor();
    if (this.boardLearnOpen()) {
      this.closeBoardLearn();
    }
    void this.router.navigateByUrl(this.songsPage() || this.tripsPage() ? this.boardRouteRoot() : this.boardsProfileRoutePath());
  }

  async loadBoardFriends(): Promise<void> {
    if (!this.functions || !this.authService.uid()) {
      return;
    }
    this.boardFriendsLoading.set(true);
    this.boardFriendsError.set(null);
    try {
      const callable = httpsCallable<Record<string, never>, unknown>(this.functions, 'listBoardFriends');
      const response = await callable({});
      this.boardFriends.set(this.normalizeBoardFriendsState(response.data));
    } catch (error) {
      this.boardFriendsError.set(this.boardFriendErrorMessage(error, $localize`Could not load friends right now.`));
    } finally {
      this.boardFriendsLoading.set(false);
    }
  }

  async inviteBoardFriend(event?: Event): Promise<void> {
    event?.preventDefault();
    if (!this.functions || !this.authService.uid()) {
      this.boardFriendsError.set($localize`Sign in before inviting friends.`);
      return;
    }
    const email = this.boardFriendEmail().trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.boardFriendsError.set($localize`Enter a valid friend email address.`);
      return;
    }

    this.boardFriendSending.set(true);
    this.boardFriendsError.set(null);
    this.boardFriendsMessage.set(null);
    try {
      const callable = httpsCallable<{ email: string }, unknown>(this.functions, 'inviteBoardFriend');
      const response = await callable({ email });
      const status = this.objectField(
        response.data && typeof response.data === 'object' ? response.data as Record<string, unknown> : null,
        'status',
      );
      this.boardFriendEmail.set('');
      this.boardFriendCandidates.set([]);
      await this.loadBoardFriends();
      this.boardFriendsMessage.set(status === $localize`already_friends`
        ? $localize`You are already friends.`
        : status === $localize`pending`
          ? $localize`That friend request is already waiting.`
          : $localize`Friend request sent.`);
    } catch (error) {
      this.boardFriendsError.set(this.boardFriendErrorMessage(error, $localize`Could not send that friend request.`));
    } finally {
      this.boardFriendSending.set(false);
    }
  }

  onBoardFriendEmailInput(value: string): void {
    this.boardFriendEmail.set(value);
    this.boardFriendsError.set(null);
    this.boardFriendsMessage.set(null);
    if (this.boardFriendSearchTimer) {
      clearTimeout(this.boardFriendSearchTimer);
      this.boardFriendSearchTimer = null;
    }
    const queryText = value.trim();
    if (queryText.length < 2 || !this.functions || !this.authService.uid()) {
      this.boardFriendCandidates.set([]);
      this.boardFriendCandidateLoading.set(false);
      return;
    }
    this.boardFriendCandidateLoading.set(true);
    this.boardFriendSearchTimer = setTimeout(() => {
      this.boardFriendSearchTimer = null;
      void this.searchBoardFriendCandidates(queryText);
    }, 220);
  }

  onBoardFriendsSearchInput(value: string): void {
    this.boardFriendsSearch.set(value);
  }

  setBoardFriendsSort(value: string): void {
    this.boardFriendsSort.set(value === 'email' ? 'email' : 'name');
  }

  chooseBoardFriendCandidate(candidate: BoardFriendCandidate): void {
    this.boardFriendEmail.set(candidate.email);
    this.boardFriendCandidates.set([]);
    this.boardFriendCandidateLoading.set(false);
  }

  boardFriendCandidateStatusLabel(candidate: BoardFriendCandidate): string {
    if (candidate.relationshipStatus === 'friend') {
      return 'Friend';
    }
    if (candidate.relationshipStatus === 'pending') {
      return 'Pending';
    }
    return 'Invite';
  }

  private async searchBoardFriendCandidates(queryText: string): Promise<void> {
    if (!this.functions || !this.authService.uid()) {
      return;
    }
    const run = ++this.boardFriendSearchRun;
    try {
      const callable = httpsCallable<{ query: string }, unknown>(this.functions, 'searchBoardFriendCandidates');
      const response = await callable({ query: queryText });
      if (run !== this.boardFriendSearchRun) {
        return;
      }
      this.boardFriendCandidates.set(this.normalizeBoardFriendCandidates(response.data));
    } catch {
      if (run === this.boardFriendSearchRun) {
        this.boardFriendCandidates.set([]);
      }
    } finally {
      if (run === this.boardFriendSearchRun) {
        this.boardFriendCandidateLoading.set(false);
      }
    }
  }

  async respondBoardFriendRequest(requestId: string, action: 'accept' | 'decline'): Promise<void> {
    if (!this.functions || !this.authService.uid()) {
      this.boardFriendsError.set($localize`Sign in to respond to friend requests.`);
      return;
    }
    this.boardFriendsError.set(null);
    this.boardFriendsMessage.set(null);
    try {
      const callable = httpsCallable<{ requestId: string; action: 'accept' | 'decline' }, unknown>(
        this.functions,
        'respondBoardFriendRequest',
      );
      await callable({ requestId, action });
      await this.loadBoardFriends();
      this.boardFriendsMessage.set(action === $localize`accept` ? $localize`Friend request accepted.` : $localize`Friend request declined.`);
    } catch (error) {
      this.boardFriendsError.set(this.boardFriendErrorMessage(error, $localize`Could not update that friend request.`));
    }
  }

  boardFriendProfileUrl(friend: BoardFriendProfile): string {
    const handle = this.publicHandleFromText(friend.displayName || friend.email || 'livingwiki-friend');
    return `/boards/u/${encodeURIComponent(`${handle}~${friend.userId}`)}`;
  }

  boardFriendMessageUrl(friend: BoardFriendProfile): string {
    return friend.email ? `mailto:${encodeURIComponent(friend.email)}` : this.boardFriendProfileUrl(friend);
  }

  boardFriendSecondary(friend: BoardFriendProfile): string {
    return friend.email || 'Open public boards';
  }

  boardFriendIcon(friend: BoardFriendProfile) {
    return profileIconByCode(friend.profileIcon) ?? profileIconForSeed(friend.userId || friend.email || friend.displayName);
  }

  private scrollToBoardFriends(): void {
    if (!this.isBrowser || !this.canManageBoardFriends()) {
      return;
    }
    window.document.getElementById('board-friends')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  isBoardFlipped(boardId: string): boolean {
    return this.flippedBoardIds().has(boardId);
  }

  toggleBoardFlip(boardId: string, event?: Event): void {
    this.keepScrollPosition(event);
    this.flippedBoardIds.update((flipped) => {
      const next = new Set(flipped);
      if (next.has(boardId)) {
        next.delete(boardId);
      } else {
        next.add(boardId);
      }
      return next;
    });
  }

  isCardFlipped(cardId: string): boolean {
    return this.flippedCardIds().has(cardId);
  }

  toggleCardFlip(cardId: string, event?: Event): void {
    this.keepScrollPosition(event);
    this.flippedCardIds.update((flipped) => {
      const next = new Set(flipped);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }

  isCardActionMenuOpen(key: string): boolean {
    return this.openCardActionMenuKey() === key;
  }

  toggleCardActionMenu(key: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.openCardActionMenuKey.update((openKey) => openKey === key ? null : key);
  }

  closeCardActionMenu(restoreFocus = false): void {
    const key = this.openCardActionMenuKey();
    this.openCardActionMenuKey.set(null);
    if (!restoreFocus || !key || !this.isBrowser) {
      return;
    }
    window.requestAnimationFrame(() => {
      window.document.getElementById(`card-action-trigger-${key}`)?.focus();
    });
  }

  private keepScrollPosition(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.openCardActionMenuKey.set(null);
    if (!this.isBrowser) {
      return;
    }
    const x = window.scrollX;
    const y = window.scrollY;
    window.requestAnimationFrame(() => window.scrollTo(x, y));
  }

  openCreateBoard(): void {
    this.openBoardWizard();
  }

  openBoardWizard(): void {
    if (!this.canCreateBoard()) {
      this.boardsSyncError.set($localize`Sign in to create a board.`);
      return;
    }
    this.resetBoardWizard();
    this.wizardOpen.set(true);
  }

  openOffGridContribution(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (board.kind !== 'off-grid' || board.visibility !== 'public') {
      this.boardsSyncError.set($localize`This board is not open for Off-grid contributions.`);
      return;
    }
    if (!this.authService.isAuthenticated()) {
      void this.router.navigate(['/sign-in'], { queryParams: { redirectTo: this.router.url } });
      return;
    }
    if (!this.functions || !this.firestore) {
      this.boardsSyncError.set($localize`Board sync is not ready. Refresh and try again.`);
      return;
    }
    this.resetBoardWizard();
    this.wizardMode.set('off-grid');
    this.wizardDefaultType.set('place');
    this.wizardVibe.set('traveler');
    this.wizardCount.set(1);
    this.wizardTargetBoardId.set(board.id);
    this.wizardContributionBoardId.set(board.id);
    this.wizardStep.set('configure');
    this.wizardOpen.set(true);
  }

  chooseWizardMode(mode: BoardWizardMode | 'manual'): void {
    if (mode === 'manual') {
      this.closeBoardWizard();
      this.openManualBoard();
      return;
    }
    this.wizardMode.set(mode);
    if (mode === 'off-grid') {
      this.wizardDefaultType.set('place');
      this.wizardVibe.set('traveler');
      this.wizardCount.set(1);
      this.wizardTargetBoardId.set('new');
      this.wizardStep.set('configure');
      return;
    }
    if (this.isTourWizardMode(mode)) {
      this.wizardDefaultType.set('place');
      this.wizardVibe.set('traveler');
      this.wizardCount.set(mode === 'driving-tour' ? 8 : 10);
      this.wizardTourVoiceStyle.set('historian');
      this.wizardTourPaceOrStyle.set(mode === 'driving-tour' ? 'Balanced' : 'Standard');
      this.wizardTourExtras.set(new Set(mode === 'driving-tour' ? ['Photo pull-offs', 'Parking and restrooms'] : ['Photo stops', 'Accessibility notes']));
      this.wizardStep.set('configure');
      return;
    }
    this.wizardDefaultType.set(mode === 'photos' ? 'memory' : mode === 'paste' ? 'place' : this.wizardDefaultType());
    this.wizardVibe.set(mode === 'photos' ? 'memory' : mode === 'url' ? 'curator' : this.wizardVibe());
    this.wizardStep.set('configure');
  }

  openManualBoard(): void {
    if (!this.canCreateBoard()) {
      this.boardsSyncError.set($localize`Sign in to create a board.`);
      return;
    }
    this.editingBoardId.set(null);
    this.imageUploadError.set(null);
    this.boardDraft.set({
      title: '',
      description: '',
      backNote: '',
      icon: 'dashboard',
      tone: this.tones[this.boards().length % this.tones.length]?.id ?? 'teal',
      visibility: 'public',
      imageUrl: '',
      logoUrl: '',
      logoLinkUrl: '',
      stackCtaLabel: '',
      stackCtaUrl: '',
      stickers: [],
    });
    this.boardDialogOpen.set(true);
  }

  closeBoardWizard(): void {
    this.wizardOpen.set(false);
    this.wizardStep.set('choose');
    this.wizardContributionBoardId.set(null);
    this.wizardError.set(null);
    this.wizardSaving.set(false);
  }

  backWizardStep(): void {
    const step = this.wizardStep();
    if (step === 'configure') {
      if (this.wizardContributionBoardId()) {
        this.closeBoardWizard();
        return;
      }
      this.wizardStep.set('choose');
    } else if (step === 'preview') {
      this.wizardStep.set('configure');
    }
  }

  setWizardCount(value: string | number): void {
    const count = typeof value === 'number' ? value : Number.parseInt(value, 10);
    this.wizardCount.set(Math.max(1, Math.min(100, Number.isFinite(count) ? count : 12)));
  }

  updateWizardPastedList(value: string): void {
    const pastedText = value.slice(0, BOARD_WIZARD_PASTE_MAX_LENGTH);
    this.wizardPastedList.set(pastedText);
    const detectedCount = parseWhat3WordsBoardSource(pastedText)?.items.length
      ?? parseNumberedBoardSource(pastedText)?.items.length
      ?? 0;
    if (detectedCount) {
      this.setWizardCount(detectedCount);
    }
  }

  inferWizardRequestedCount(): number | null {
    const structuredCount = this.wizardMode() === 'paste' ? this.wizardDetectedPasteCount() : 0;
    if (structuredCount) {
      return structuredCount;
    }
    const text = [
      this.wizardPrompt(),
      this.wizardMode() === 'paste' ? this.wizardPastedList() : '',
      this.wizardTargetBoardTitle(),
    ].join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!text) {
      return null;
    }

    const numericPatterns = [
      /\b(?:make|create|build|generate|include|with|top|best)\s+(?:a\s+board\s+(?:with|of)\s+)?(\d{1,3})\b/,
      /\b(\d{1,3})\s+(?:signers|people|persons|destinations|places|restaurants|cards|items|facts|rooms|amenities|cities)\b/,
    ];
    for (const pattern of numericPatterns) {
      const match = text.match(pattern);
      const count = match?.[1] ? Number(match[1]) : 0;
      if (Number.isInteger(count) && count >= 1 && count <= 100) {
        return count;
      }
    }

    const wordCounts: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
      fifteen: 15,
      twenty: 20,
    };
    const wordMatch = text.match(/\b(?:top|best|include|with|make|create|build|generate)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\b/);
    return wordMatch?.[1] ? wordCounts[wordMatch[1]] ?? null : null;
  }

  wizardPhotoNamesList(): string[] {
    return this.wizardPhotos()
      .map((photo) => photo.caption.trim() || this.photoTitleFromFileName(photo.name))
      .slice(0, 24);
  }

  async onWizardPhotosSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) {
      return;
    }

    const current = this.wizardPhotos();
    const available = Math.max(0, 24 - current.length);
    if (!available) {
      this.wizardPhotoError.set($localize`A photo board can hold up to 24 photos.`);
      return;
    }

    const existingKeys = new Set(current.map((photo) => photo.sourceKey));
    const candidates = files
      .filter((file) => !existingKeys.has(this.wizardPhotoSourceKey(file)))
      .slice(0, available);
    if (!candidates.length) {
      this.wizardPhotoError.set($localize`Those photos are already in this board.`);
      return;
    }

    const run = ++this.wizardPhotoImportRun;
    this.wizardPhotosLoading.set(true);
    this.wizardPhotoError.set(null);
    const imported: BoardWizardPhoto[] = [];
    const rejected: string[] = [];
    for (const file of candidates) {
      try {
        imported.push(await this.readWizardPhoto(file));
      } catch (error) {
        rejected.push(error instanceof Error ? `${file.name}: ${error.message}` : file.name);
      }
    }
    if (run !== this.wizardPhotoImportRun) {
      return;
    }
    this.wizardPhotos.update((photos) => [...photos, ...imported].slice(0, 24));
    this.wizardCount.set(Math.max(1, this.wizardPhotos().length));
    this.wizardPhotosLoading.set(false);
    if (rejected.length) {
      this.wizardPhotoError.set(
        `${rejected.length} ${rejected.length === 1 ? $localize`photo was` : $localize`photos were`} skipped. ${rejected.slice(0, 2).join(' ')}`,
      );
    } else if (files.length > candidates.length) {
      this.wizardPhotoError.set(`Added ${imported.length} photos. Photo boards can hold up to 24.`);
    }
  }

  removeWizardPhoto(photoId: string): void {
    this.wizardPhotos.update((photos) => photos.filter((photo) => photo.id !== photoId));
    this.wizardCount.set(Math.max(1, this.wizardPhotos().length));
    this.wizardPhotoError.set(null);
  }

  makeWizardPhotoCover(photoId: string): void {
    this.wizardPhotos.update((photos) => {
      const index = photos.findIndex((photo) => photo.id === photoId);
      return index > 0 ? [photos[index], ...photos.slice(0, index), ...photos.slice(index + 1)] : photos;
    });
  }

  setWizardOffGridSource(source: OffGridLocationSource): void {
    if (source === this.wizardOffGridSource()) {
      return;
    }
    this.wizardOffGridLocationRun += 1;
    this.wizardOffGridSource.set(source);
    this.wizardOffGridAddress.set('');
    this.wizardOffGridResolvedLocation.set(null);
    this.wizardOffGridVerifiedLocations.set({});
    this.wizardOffGridVerificationFailures.set({});
    this.wizardOffGridAccuracy.set(null);
    this.wizardOffGridStatus.set('');
    this.wizardOffGridError.set(null);
    this.wizardOffGridLocating.set(false);
    this.wizardOffGridVerifying.set(false);
  }

  updateWizardOffGridAddress(value: string): void {
    this.wizardOffGridLocationRun += 1;
    this.wizardOffGridAddress.set(value);
    this.wizardOffGridResolvedLocation.set(null);
    this.wizardOffGridVerifiedLocations.set({});
    this.wizardOffGridVerificationFailures.set({});
    this.wizardOffGridStatus.set('');
    this.wizardOffGridError.set(null);
    this.wizardOffGridVerifying.set(false);
  }

  async onWizardOffGridPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.wizardOffGridError.set(null);
    try {
      this.wizardOffGridPhoto.set(await this.readImageFile(file));
      this.wizardOffGridStatus.set(
        this.wizardOffGridSource() === 'spot'
          ? $localize`Photo ready. Finding your exact square…`
          : $localize`Photo ready. Verify the square when you are ready.`,
      );
      if (this.wizardOffGridSource() === 'spot') {
        await this.findWizardOffGridCurrentLocation();
      }
    } catch (error) {
      this.wizardOffGridError.set(error instanceof Error ? error.message : $localize`That photo could not be used.`);
    }
  }

  removeWizardOffGridPhoto(): void {
    this.wizardOffGridPhoto.set('');
    if (this.wizardOffGridSource() === 'spot') {
      this.wizardOffGridStatus.set(
        this.wizardOffGridResolvedLocation()
          ? $localize`Square found. Take a photo to finish the card.`
          : '',
      );
    }
  }

  async findWizardOffGridCurrentLocation(): Promise<void> {
    if (!this.isBrowser || !navigator.geolocation || this.wizardOffGridLocating()) {
      if (this.isBrowser && !navigator.geolocation) {
        this.wizardOffGridError.set($localize`This browser cannot access your location.`);
      }
      return;
    }
    const run = ++this.wizardOffGridLocationRun;
    this.wizardOffGridLocating.set(true);
    this.wizardOffGridResolvedLocation.set(null);
    this.wizardOffGridAccuracy.set(null);
    this.wizardOffGridError.set(null);
    this.wizardOffGridStatus.set($localize`Getting a precise GPS fix…`);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 15_000,
        });
      });
      this.wizardOffGridStatus.set($localize`Converting your location to three words…`);
      const location = await what3wordsFromCoordinates(
        position.coords.latitude,
        position.coords.longitude,
      );
      if (run !== this.wizardOffGridLocationRun) {
        return;
      }
      const accuracy = Math.max(1, Math.round(position.coords.accuracy || 1));
      this.wizardOffGridAddress.set(location.words);
      this.wizardOffGridResolvedLocation.set(location);
      this.wizardOffGridAccuracy.set(accuracy);
      this.wizardOffGridStatus.set(
        location.nearestPlace
          ? `Live square found near ${location.nearestPlace} · GPS accuracy ±${accuracy} m`
          : `Live square found · GPS accuracy ±${accuracy} m`,
      );
    } catch (error) {
      if (run !== this.wizardOffGridLocationRun) {
        return;
      }
      this.wizardOffGridError.set(this.wizardOffGridLocationError(error));
      this.wizardOffGridStatus.set('');
    } finally {
      if (run === this.wizardOffGridLocationRun) {
        this.wizardOffGridLocating.set(false);
      }
    }
  }

  async verifyWizardOffGridAddress(): Promise<void> {
    if (this.wizardOffGridVerifying()) {
      return;
    }
    const parsedItems = this.wizardOffGridParsedSource()?.items ?? [];
    if (!parsedItems.length) {
      this.wizardOffGridResolvedLocation.set(null);
      this.wizardOffGridError.set($localize`Paste one or more places with exactly three words separated by periods.`);
      return;
    }
    const run = ++this.wizardOffGridLocationRun;
    this.wizardOffGridVerifying.set(true);
    this.wizardOffGridResolvedLocation.set(null);
    this.wizardOffGridVerifiedLocations.set({});
    this.wizardOffGridVerificationFailures.set({});
    this.wizardOffGridError.set(null);
    this.wizardOffGridStatus.set(
      parsedItems.length === 1
        ? $localize`Checking this square with what3words…`
        : `Checking ${parsedItems.length} squares with what3words…`,
    );

    const verified: Record<string, ResolvedWhat3WordsLocation> = {};
    const failures: Record<string, string> = {};
    let completed = 0;
    let nextIndex = 0;
    let verificationUnavailable = false;
    const worker = async () => {
      while (
        nextIndex < parsedItems.length
        && run === this.wizardOffGridLocationRun
        && !verificationUnavailable
      ) {
        const item = parsedItems[nextIndex++];
        try {
          verified[item.words] = await resolveWhat3WordsAddress(item.words);
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : $localize`This square could not be verified.`;
          failures[item.words] = message;
          if (/\b402\b|payment|billing|plan|quota|not available|invalid key|missing key/iu.test(message)) {
            verificationUnavailable = true;
          }
        }
        completed += 1;
        if (run === this.wizardOffGridLocationRun) {
          this.wizardOffGridVerifiedLocations.set({ ...verified });
          this.wizardOffGridVerificationFailures.set({ ...failures });
          this.wizardOffGridStatus.set(
            parsedItems.length === 1
              ? (verified[item.words]?.nearestPlace
                  ? `Verified real square near ${verified[item.words].nearestPlace}`
                  : verified[item.words]
                    ? $localize`Verified real square`
                    : $localize`The address is recognized and can still be linked.`)
              : `Checked ${completed} of ${parsedItems.length} squares…`,
          );
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(3, parsedItems.length) }, () => worker()),
    );
    if (run !== this.wizardOffGridLocationRun) {
      return;
    }
    const verifiedCount = Object.keys(verified).length;
    if (parsedItems.length === 1 && verified[parsedItems[0].words]) {
      const location = verified[parsedItems[0].words];
      this.wizardOffGridResolvedLocation.set(location);
      this.wizardOffGridAddress.set(location.words);
      this.wizardOffGridStatus.set(
        location.nearestPlace
          ? `Verified real square near ${location.nearestPlace}`
          : $localize`Verified real square`,
      );
    } else if (verifiedCount === parsedItems.length) {
      this.wizardOffGridStatus.set(`All ${verifiedCount} squares verified.`);
    } else if (verifiedCount) {
      this.wizardOffGridStatus.set(
        `${verifiedCount} verified · ${parsedItems.length - verifiedCount} recognized and link-ready.`,
      );
    } else {
      this.wizardOffGridStatus.set(
        `${parsedItems.length} ${parsedItems.length === 1 ? 'address is' : 'addresses are'} recognized and link-ready. Coordinate verification is unavailable right now.`,
      );
    }
    this.wizardOffGridVerifying.set(false);
  }

  removeWizardOffGridItem(words: string): void {
    const parsed = this.wizardOffGridParsedSource();
    if (!parsed) {
      return;
    }
    const remaining = parsed.items.filter((item) => item.words !== words);
    this.updateWizardOffGridAddress(
      remaining.map((item) => `${item.name || 'Off-grid place'}\t///${item.words}`).join('\n'),
    );
  }

  wizardInputPlaceholder(): string {
    switch (this.wizardMode()) {
      case 'paste':
        return 'Top Caribbean islands\n1. Dominica — Wild nature and waterfalls\nA short note about why it belongs on the board.\n\n2. Grenada — Beaches, rainforest, and spice\nAnother source-backed note.';
      case 'photos':
        return 'IMG_2041 beach sunrise.jpg\nbirthday-dinner-kalaya.png\nmuseum-day.jpeg';
      case 'url':
        return 'https://www.nationalmechanics.com/foodmenu-1';
      case 'walking-tour':
        return 'A historical walking tour of Old City Philadelphia tracing where the Declaration of Independence was written, debated, and signed.';
      case 'driving-tour':
        return 'A driving tour of Gettysburg National Military Park following the three days of the battle in order.';
      case 'off-grid':
        return '///filled.count.soap';
      default:
        return 'Make a board with the 56 signers, sorted by state, and include portrait pictures.';
    }
  }

  async generateWizardBatch(refinement = ''): Promise<void> {
    if (!this.wizardCanGenerate() || this.wizardSaving()) {
      return;
    }
    this.wizardError.set(null);
    const pastedWhat3Words = this.wizardMode() === 'paste'
      ? this.wizardPastedWhat3WordsSource()
      : null;
    if (pastedWhat3Words) {
      await this.generateWhat3WordsWizardPreview(pastedWhat3Words);
      return;
    }
    if (this.wizardMode() === 'off-grid') {
      await this.generateWhat3WordsWizardPreview(this.what3WordsSourceFromOffGridWizard(), true);
      return;
    }
    const inferredCount = this.wizardMode() === 'photos' ? this.wizardPhotos().length : this.inferWizardRequestedCount();
    if (inferredCount) {
      this.setWizardCount(inferredCount);
    }
    const previousResult = this.wizardResult();
    const previousPreviewCards = this.wizardPreviewCards();
    const previousSelectedCardIds = new Set(this.wizardSelectedCardIds());
    this.wizardStep.set('loading');
    this.wizardLoadingIndex.set(0);
    this.wizardLoadingTask.set(null);
    const loadingMessages = this.isTourWizardMode() ? BOARD_TOUR_STATUS_MESSAGES : BOARD_WIZARD_STATUS_MESSAGES;
    const interval = this.isBrowser
      ? window.setInterval(() => {
          this.wizardLoadingIndex.update((index) => (index + 1) % loadingMessages.length);
        }, 900)
      : null;

    try {
      const generatedBatch = await this.requestWizardBatch(refinement);
      const batch = this.wizardMode() === 'photos'
        ? this.attachWizardPhotosToBatch(generatedBatch)
        : generatedBatch;
      const placeEnrichedCards = await this.enrichWizardCards(batch.cards);
      const previewCards = await this.enrichWizardMissingPlaceImages(placeEnrichedCards, batch.board.title);
      this.wizardResult.set({ ...batch, cards: previewCards });
      this.wizardPreviewCards.set(previewCards);
      this.wizardSelectedCardIds.set(new Set(previewCards.map((card) => card.id)));
      this.wizardStep.set('preview');
    } catch (error) {
      this.wizardError.set(this.wizardGenerationErrorMessage(error));
      if (previousResult && previousPreviewCards.length) {
        this.wizardResult.set(previousResult);
        this.wizardPreviewCards.set(previousPreviewCards);
        this.wizardSelectedCardIds.set(previousSelectedCardIds);
        this.wizardStep.set('preview');
      } else {
        this.wizardResult.set(null);
        this.wizardPreviewCards.set([]);
        this.wizardSelectedCardIds.set(new Set());
        this.wizardStep.set('choose');
      }
    } finally {
      if (interval) {
        window.clearInterval(interval);
      }
    }
  }

  wizardHasBillingError(): boolean {
    return /gemini api|prepaid|credits? (?:are )?(?:empty|depleted)|billing/iu.test(this.wizardError() ?? '');
  }

  async refineWizardBatch(): Promise<void> {
    const refinement = this.wizardRefineText().trim();
    if (!refinement) {
      return;
    }
    await this.generateWizardBatch(refinement);
    this.wizardRefineText.set('');
  }

  async addMoreWizardCards(): Promise<void> {
    const previousCount = this.wizardCount();
    this.setWizardCount(Math.min(100, previousCount + 5));
    await this.generateWizardBatch('Add five more cards that do not duplicate the current preview.');
    this.setWizardCount(previousCount);
  }

  openWizardCardEditor(cardId: string, section: WizardCardEditorSection = 'details'): void {
    const card = this.wizardPreviewCards().find((item) => item.id === cardId);
    if (!card || this.isWizardCardBusy(cardId)) {
      return;
    }
    this.resetWizardCardImageTools();
    this.wizardEditingCardId.set(cardId);
    this.wizardCardEditorSection.set(section);
    this.wizardCardImagePrompt.set(this.defaultWizardCardImageGenerationPrompt(card));
    this.wizardCardImageSearchQuery.set(this.defaultWizardCardImageSearchQuery(card));
    if (this.isBrowser) {
      window.setTimeout(() => document.querySelector<HTMLElement>('.boards-modal--wizard')?.scrollTo({ top: 0 }), 0);
    }
    if (section === 'image') {
      this.wizardCardImageToolMode.set('search');
      void this.searchWizardCardImages();
    }
  }

  closeWizardCardEditor(): void {
    this.wizardEditingCardId.set(null);
    this.resetWizardCardImageTools();
  }

  setWizardCardEditorSection(section: WizardCardEditorSection): void {
    this.wizardCardEditorSection.set(section);
  }

  openWizardCardImageTool(mode: Exclude<CardImageToolMode, null>): void {
    const card = this.wizardEditingCard();
    if (!card) {
      return;
    }
    this.wizardCardEditorSection.set('image');
    this.wizardCardEditorError.set(null);
    this.wizardCardImageToolMode.set(mode);
    if (mode === 'generate') {
      if (!this.wizardCardImagePrompt().trim()) {
        this.wizardCardImagePrompt.set(this.defaultWizardCardImageGenerationPrompt(card));
      }
      return;
    }
    if (!this.wizardCardImageSearchQuery().trim()) {
      this.wizardCardImageSearchQuery.set(this.defaultWizardCardImageSearchQuery(card));
    }
    if (!this.wizardCardImageSearchResults().length) {
      void this.searchWizardCardImages();
    }
  }

  async generateWizardCardImage(): Promise<void> {
    const card = this.wizardEditingCard();
    const prompt = this.wizardCardImagePrompt().trim();
    if (!card || !this.functions || this.wizardCardImageGenerating()) {
      return;
    }
    if (prompt.length < 3) {
      this.wizardCardEditorError.set($localize`Describe the picture you want.`);
      return;
    }
    this.wizardCardImageGenerating.set(true);
    this.wizardCardEditorError.set(null);
    try {
      const callable = httpsCallable<
        {
          boardId: string;
          prompt: string;
          cardTitle: string;
          cardSubtitle: string;
          cardNotes: string;
          boardTitle: string;
          boardDescription: string;
        },
        { imageDataUrl?: string; model?: string }
      >(this.functions, 'generateBoardCardImage');
      const board = this.wizardResult()?.board;
      const response = await callable({
        boardId: this.wizardImageBoardId(),
        prompt,
        cardTitle: card.title,
        cardSubtitle: card.subtitle,
        cardNotes: card.notes,
        boardTitle: board?.title || this.wizardTargetBoardTitle(),
        boardDescription: board?.description || '',
      });
      const imageDataUrl = response.data.imageDataUrl?.trim() ?? '';
      if (!imageDataUrl.startsWith('data:image/')) {
        throw new Error('Nano Banana returned no usable image.');
      }
      this.wizardCardGeneratedImageUrl.set(imageDataUrl);
      this.wizardCardGeneratedImageModel.set(response.data.model?.trim() ?? 'Nano Banana');
    } catch (error) {
      this.wizardCardEditorError.set(this.cardImageActionErrorMessage(error, $localize`Nano Banana could not generate this picture.`));
    } finally {
      this.wizardCardImageGenerating.set(false);
    }
  }

  useGeneratedWizardCardImage(): void {
    const card = this.wizardEditingCard();
    const imageUrl = this.wizardCardGeneratedImageUrl();
    if (!card || !imageUrl) {
      return;
    }
    this.updateWizardCard(card.id, 'imageUrl', imageUrl);
    if (card.productUrl) {
      this.updateWizardCard(card.id, 'imageSource', 'generated');
    }
    this.wizardSelectedCardIds.update((ids) => new Set(ids).add(card.id));
    this.wizardCardEditorError.set(null);
  }

  async searchWizardCardImages(): Promise<void> {
    const card = this.wizardEditingCard();
    const query = this.wizardCardImageSearchQuery().replace(/\s+/g, ' ').trim();
    if (!card || !this.functions || this.wizardCardImageSearchLoading()) {
      return;
    }
    if (query.length < 2) {
      this.wizardCardEditorError.set($localize`Enter something to search for.`);
      return;
    }
    this.wizardCardImageSearchLoading.set(true);
    this.wizardCardEditorError.set(null);
    this.wizardCardImageSearchResults.set([]);
    this.wizardCardImageSearchIndex.set(0);
    try {
      const callable = httpsCallable<
        { boardId: string; query: string },
        { results?: CardImageSearchResult[] }
      >(this.functions, 'searchBoardCardImages');
      const response = await callable({ boardId: this.wizardImageBoardId(), query });
      const results = Array.isArray(response.data.results)
        ? response.data.results.filter((item) => !!item?.imageUrl && !!item?.thumbnailUrl && !!item?.token).slice(0, 8)
        : [];
      this.wizardCardImageSearchResults.set(results);
      if (!results.length) {
        this.wizardCardEditorError.set($localize`No usable pictures were found. Try the event, year, and subject together.`);
      }
    } catch (error) {
      this.wizardCardEditorError.set(this.cardImageActionErrorMessage(error, $localize`Picture search is unavailable right now.`));
    } finally {
      this.wizardCardImageSearchLoading.set(false);
    }
  }

  selectWizardCardImageSearchResult(index: number): void {
    if (index < 0 || index >= this.wizardCardImageSearchResults().length) {
      return;
    }
    this.wizardCardImageSearchIndex.set(index);
    this.wizardCardEditorError.set(null);
  }

  stepWizardCardImageSearch(direction: -1 | 1): void {
    const count = this.wizardCardImageSearchResults().length;
    if (count < 2) {
      return;
    }
    this.wizardCardImageSearchIndex.update((index) => (index + direction + count) % count);
  }

  wizardCardImageSearchPosition(): string {
    const count = this.wizardCardImageSearchResults().length;
    return count ? `${this.wizardCardImageSearchIndex() + 1} / ${count}` : '';
  }

  async useSearchedWizardCardImage(): Promise<void> {
    const card = this.wizardEditingCard();
    const result = this.currentWizardCardImageSearchResult();
    const query = this.wizardCardImageSearchQuery().replace(/\s+/g, ' ').trim();
    if (!card || !result || !this.functions || this.wizardCardImageApplying()) {
      return;
    }
    this.wizardCardImageApplying.set(true);
    this.wizardCardEditorError.set(null);
    try {
      const callable = httpsCallable<
        { boardId: string; query: string; result: Omit<CardImageSearchResult, 'token'>; token: string },
        { imageDataUrl?: string }
      >(this.functions, 'importBoardCardImage');
      const { token, ...selected } = result;
      const response = await callable({ boardId: this.wizardImageBoardId(), query, result: selected, token });
      const imageDataUrl = response.data.imageDataUrl?.trim() ?? '';
      if (!imageDataUrl.startsWith('data:image/')) {
        throw new Error('That picture could not be imported.');
      }
      this.updateWizardCard(card.id, 'imageUrl', imageDataUrl);
      if (card.productUrl) {
        this.updateWizardCard(card.id, 'imageSource', 'search');
      }
      this.wizardSelectedCardIds.update((ids) => new Set(ids).add(card.id));
    } catch (error) {
      this.wizardCardEditorError.set(this.cardImageActionErrorMessage(error, $localize`That picture could not be used.`));
    } finally {
      this.wizardCardImageApplying.set(false);
    }
  }

  async redoWizardCard(cardId: string): Promise<void> {
    const card = this.wizardPreviewCards().find((item) => item.id === cardId);
    if (!card || this.isWizardCardBusy(cardId)) {
      return;
    }
    this.wizardRedoingCardIds.update((ids) => new Set(ids).add(cardId));
    this.wizardError.set(null);
    const previousCount = this.wizardCount();
    this.setWizardCount(1);
    try {
      const batch = await this.requestWizardBatch(`Replace only this card with a better alternative: ${card.title}.`);
      const placeEnrichedCards = await this.enrichWizardCards(batch.cards.slice(0, 1));
      const [replacement] = await this.enrichWizardMissingPlaceImages(placeEnrichedCards, batch.board.title);
      if (replacement) {
        this.wizardPreviewCards.update((cards) => cards.map((item) => item.id === cardId
          ? {
              ...replacement,
              id: cardId,
              what3wordsAddress: item.what3wordsAddress || replacement.what3wordsAddress,
            }
          : item));
        this.wizardSelectedCardIds.update((ids) => new Set(ids).add(cardId));
      }
    } catch {
      this.wizardPreviewCards.update((cards) =>
        cards.map((item) =>
          item.id === cardId
            ? {
                ...item,
                subtitle: $localize`Regenerated draft`,
                notes: `${item.notes} Add your own detail or rerun the wizard for another option.`.slice(0, 260),
              }
            : item,
        ),
      );
    } finally {
      this.setWizardCount(previousCount);
      this.wizardRedoingCardIds.update((ids) => {
        const next = new Set(ids);
        next.delete(cardId);
        return next;
      });
    }
  }

  async retryWizardCardImage(cardId: string): Promise<void> {
    const card = this.wizardPreviewCards().find((item) => item.id === cardId);
    if (!card || this.isWizardCardBusy(cardId) || !this.functions) {
      return;
    }
    this.wizardImageLoadingCardIds.update((ids) => new Set(ids).add(cardId));
    this.wizardError.set(null);
    try {
      const replacement = await this.requestWizardCardImage(card, this.wizardTargetBoardTitle());
      if (!replacement?.imageUrl) {
        this.wizardError.set(`No better image was found for "${card.title}". You can paste an image URL in Edit or upload one with Picture.`);
        return;
      }
      this.wizardPreviewCards.update((cards) =>
        cards.map((item) =>
          item.id === cardId
            ? {
                ...item,
                imageUrl: replacement.imageUrl ?? item.imageUrl,
                imageSource: item.productUrl ? 'search' : item.imageSource,
                audioPreviewUrl: replacement.audioPreviewUrl || item.audioPreviewUrl,
                spotifyTrackId: replacement.spotifyTrackId || item.spotifyTrackId,
                spotifyTrackUrl: replacement.spotifyTrackUrl || item.spotifyTrackUrl,
                spotifyUri: replacement.spotifyUri || item.spotifyUri,
                spotifyArtistName: replacement.spotifyArtistName || item.spotifyArtistName,
                spotifyAlbumName: replacement.spotifyAlbumName || item.spotifyAlbumName,
                spotifyArtworkUrl: replacement.spotifyArtworkUrl || item.spotifyArtworkUrl,
                image_query: replacement.image_query || item.image_query,
                placeId: replacement.placeId || item.placeId,
                googleMapsUrl: replacement.googleMapsUrl || item.googleMapsUrl,
              }
            : item,
        ),
      );
      this.wizardSelectedCardIds.update((ids) => new Set(ids).add(cardId));
    } catch (error) {
      this.wizardError.set(error instanceof Error ? error.message : `Could not refresh the image for "${card.title}".`);
    } finally {
      this.wizardImageLoadingCardIds.update((ids) => {
        const next = new Set(ids);
        next.delete(cardId);
        return next;
      });
    }
  }

  isWizardCardBusy(cardId: string): boolean {
    return this.wizardRedoingCardIds().has(cardId) || this.wizardImageLoadingCardIds().has(cardId);
  }

  wizardCardBusyLabel(cardId: string): string {
    if (this.wizardImageLoadingCardIds().has(cardId)) {
      return 'Finding image';
    }
    if (this.wizardRedoingCardIds().has(cardId)) {
      return 'Replacing card';
    }
    return '';
  }

  wizardProductImageLabel(card: BoardWizardPreviewCard): string {
    switch (card.imageSource) {
      case 'source-page':
        return 'Exact page image';
      case 'product-page':
        return 'Exact product image';
      case 'search':
        return 'Search fallback';
      case 'generated':
        return 'Generated image';
      default:
        return 'Image missing';
    }
  }

  wizardProductImageIcon(card: BoardWizardPreviewCard): string {
    return card.imageSource === 'source-page' || card.imageSource === 'product-page'
      ? 'verified'
      : card.imageSource === 'missing'
        ? 'hide_image'
        : 'info';
  }

  wizardSourceReportTitle(report: BoardWizardSourceReport): string {
    switch (report.status) {
      case 'exact':
        return 'Source page extracted';
      case 'recovered':
        return 'Source recovered';
      default:
        return 'Partial source recovery';
    }
  }

  wizardSourceReportIcon(report: BoardWizardSourceReport): string {
    return report.status === 'partial' ? 'warning' : report.status === 'recovered' ? 'travel_explore' : 'verified';
  }

  wizardSourceReportMethod(report: BoardWizardSourceReport): string {
    switch (report.method) {
      case 'reader':
        return 'Public page reader';
      case 'grounded-search':
        return 'Verified public index';
      default:
        return 'Direct page extraction';
    }
  }

  handleWizardImageError(cardId: string): void {
    this.wizardPreviewCards.update((cards) =>
      cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              imageUrl: '',
              imageSource: card.productUrl ? 'missing' : card.imageSource,
            }
          : card,
      ),
    );
  }

  productCardCtaLabel(): string {
    return $localize`View product`;
  }

  toggleWizardCard(cardId: string): void {
    this.wizardSelectedCardIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }

  isWizardCardSelected(cardId: string): boolean {
    return this.wizardSelectedCardIds().has(cardId);
  }

  selectAllWizardCards(): void {
    this.wizardSelectedCardIds.set(new Set(this.wizardPreviewCards().map((card) => card.id)));
  }

  clearWizardSelection(): void {
    this.wizardSelectedCardIds.set(new Set());
  }

  removeWizardCard(cardId: string): void {
    if (this.wizardEditingCardId() === cardId) {
      this.closeWizardCardEditor();
    }
    this.wizardPreviewCards.update((cards) => cards.filter((card) => card.id !== cardId));
    this.wizardSelectedCardIds.update((ids) => {
      const next = new Set(ids);
      next.delete(cardId);
      return next;
    });
    this.wizardRedoingCardIds.update((ids) => {
      const next = new Set(ids);
      next.delete(cardId);
      return next;
    });
    this.wizardImageLoadingCardIds.update((ids) => {
      const next = new Set(ids);
      next.delete(cardId);
      return next;
    });
  }

  toggleWizardCardEditing(cardId: string): void {
    this.wizardPreviewCards.update((cards) =>
      cards.map((card) => card.id === cardId ? { ...card, editing: !card.editing } : card),
    );
  }

  updateWizardCard<K extends keyof BoardWizardPreviewCard>(
    cardId: string,
    field: K,
    value: BoardWizardPreviewCard[K],
  ): void {
    this.wizardPreviewCards.update((cards) =>
      cards.map((card) => card.id === cardId ? { ...card, [field]: value } : card),
    );
  }

  updateWizardCardTags(cardId: string, value: string): void {
    this.updateWizardCard(
      cardId,
      'tags',
      value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 6),
    );
  }

  updateWizardCardTour(cardId: string, field: keyof BoardCardTour, value: string | number | null): void {
    this.wizardPreviewCards.update((cards) =>
      cards.map((card) => {
        if (card.id !== cardId || !card.tour) {
          return card;
        }
        const tour = { ...card.tour };
        if (field === 'sequence') {
          tour.sequence = Math.max(1, Math.min(200, Number.parseInt(String(value), 10) || tour.sequence));
        } else if (field === 'lat') {
          tour.lat = this.decimalValue(value, null, -90, 90);
        } else if (field === 'lng') {
          tour.lng = this.decimalValue(value, null, -180, 180);
        } else if (field === 'address') {
          tour.address = String(value ?? '').slice(0, 180);
        } else if (field === 'guideScript') {
          tour.guideScript = String(value ?? '').slice(0, 3600);
        }
        return { ...card, tour };
      }),
    );
  }

  updateWizardCardTourLeg(cardId: string, field: keyof BoardTourLeg, value: string): void {
    this.wizardPreviewCards.update((cards) =>
      cards.map((card) => {
        if (card.id !== cardId || !card.tour?.legToNext) {
          return card;
        }
        const leg = { ...card.tour.legToNext, [field]: value };
        return { ...card, tour: { ...card.tour, legToNext: this.normalizeTourLeg(leg) } };
      }),
    );
  }

  async onWizardCardImageSelected(cardId: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    try {
      const imageUrl = await this.readImageFile(file);
      this.updateWizardCard(cardId, 'imageUrl', imageUrl);
      this.wizardError.set(null);
      this.imageUploadError.set(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not use that image.';
      this.wizardError.set(message);
      this.imageUploadError.set(message);
    }
  }

  clearWizardCardImage(cardId: string): void {
    this.updateWizardCard(cardId, 'imageUrl', '');
    const card = this.wizardPreviewCards().find((item) => item.id === cardId);
    if (card?.productUrl) {
      this.updateWizardCard(cardId, 'imageSource', 'missing');
    }
    this.wizardError.set(null);
    this.imageUploadError.set(null);
  }

  async saveWizardBatch(): Promise<void> {
    const result = this.wizardResult();
    const selectedIds = this.wizardSelectedCardIds();
    const selectedCards = this.wizardPreviewCards().filter((card) => selectedIds.has(card.id));
    if (!result || !selectedCards.length || this.wizardSaving()) {
      return;
    }
    if (selectedCards.some((card) => card.what3wordsAddress && !normalizeWhat3WordsAddress(card.what3wordsAddress))) {
      this.wizardError.set($localize`Fix the what3words address before saving. Use exactly three words separated by periods.`);
      return;
    }
    this.wizardSaving.set(true);
    this.wizardError.set(null);

    const now = new Date().toISOString();
    const cards = selectedCards.map((card): BoardCard => ({
      id: card.id,
      title: card.title.trim(),
      subtitle: card.subtitle.trim(),
      notes: card.notes.trim(),
      type: card.type,
      scope: card.scope,
      status: card.status,
      rating: Math.max(1, Math.min(5, Math.round(card.rating) || 4)),
      entityName: card.entity_name?.trim() || card.title.trim(),
      entityType: card.entity_type ?? (card.type === 'place' || card.type === 'shop' ? 'place' : card.type === 'food' ? 'food' : 'other'),
      imageIntent: card.image_intent ?? (card.type === 'place' || card.type === 'shop' ? 'place' : card.type === 'food' ? 'food' : 'other'),
      imageContext: card.image_context?.trim() ?? '',
      mediaKind: card.media_kind ?? 'none',
      shortSummary: card.short_summary?.trim() || card.subtitle.trim(),
      rank: Math.max(0, Math.min(100, Math.trunc(card.rank ?? 0))),
      imageUrl: card.imageUrl,
      imageUrls: card.imageUrl ? [card.imageUrl] : [],
      audioPreviewUrl: card.audioPreviewUrl ?? '',
      spotifyTrackId: card.spotifyTrackId ?? '',
      spotifyTrackUrl: card.spotifyTrackUrl ?? '',
      spotifyUri: card.spotifyUri ?? '',
      spotifyArtistName: card.spotifyArtistName ?? '',
      spotifyAlbumName: card.spotifyAlbumName ?? '',
      spotifyArtworkUrl: card.spotifyArtworkUrl ?? '',
      placeId: card.placeId,
      googleMapsUrl: card.googleMapsUrl,
      ...(Number.isFinite(card.locationLat) ? { locationLat: card.locationLat } : {}),
      ...(Number.isFinite(card.locationLng) ? { locationLng: card.locationLng } : {}),
      sourceUrl: card.sourceUrl?.trim() || '',
      productUrl: card.productUrl?.trim() || '',
      merchant: card.merchant?.trim() || '',
      price: card.price?.trim() || '',
      currency: card.currency?.trim() || '',
      sku: card.sku?.trim() || '',
      availability: card.availability?.trim() || '',
      productCategory: card.productCategory?.trim() || '',
      ...(card.imageSource ? { imageSource: card.imageSource } : {}),
      extractionConfidence: Math.max(0, Math.min(1, card.extractionConfidence ?? 0)),
      extractedAt: card.extractedAt?.trim() || '',
      what3wordsAddress: what3WordsAddressFromCard(card),
      tags: card.tags.slice(0, 6),
      stickers: [],
      tour: card.tour ? this.normalizeCardTour(card.tour) : null,
      createdAt: now,
      updatedAt: now,
    })).filter((card) => card.title);

    const contributionBoard = this.wizardContributionBoard();
    if (contributionBoard) {
      try {
        await this.saveOffGridContribution(contributionBoard, cards[0]);
        this.wizardSaving.set(false);
        this.wizardStep.set('done');
      } catch (error) {
        const detail = error instanceof Error && error.message ? error.message : $localize`The card could not be added.`;
        this.wizardError.set(detail);
        this.wizardSaving.set(false);
      }
      return;
    }

    if (!this.firestore || !this.authService.uid()) {
      this.wizardError.set($localize`Board sync is not ready. Refresh and try again before saving.`);
      this.wizardSaving.set(false);
      return;
    }

    const targetId = this.wizardTargetBoardId();
    const existingBoard = targetId === 'new' ? null : this.boards().find((board) => board.id === targetId) ?? null;
    if (existingBoard && !this.canEditBoard(existingBoard)) {
      this.wizardError.set($localize`Only the board owner can add cards to this board.`);
      this.wizardSaving.set(false);
      return;
    }

    const nextBoard: Board = existingBoard
      ? {
          ...existingBoard,
          kind: result.board.kind ?? existingBoard.kind,
          tourMeta: result.board.tourMeta ?? existingBoard.tourMeta,
          stackCtaLabel: this.wizardStackCtaLabel().trim() || existingBoard.stackCtaLabel,
          stackCtaUrl: this.wizardStackCtaUrl().trim() || existingBoard.stackCtaUrl,
          cards: [...cards, ...existingBoard.cards],
          updatedAt: now,
        }
      : {
          id: this.createId(),
          ...this.currentOwnerSnapshot(),
          kind: result.board.kind ?? this.wizardGeneratedBoardKind(),
          sortOrder: this.nextBoardSortOrder(),
          title: result.board.title.trim() || 'Wizard board',
          description: result.board.description.trim(),
          backNote: `Started with the LivingWiki Wizard from ${this.wizardMode()} input.`,
          icon: result.board.icon || 'auto_awesome',
          tone: result.board.tone,
          imageUrl: cards.find((card) => card.imageUrl)?.imageUrl ?? '',
          logoUrl: '',
          logoLinkUrl: '',
          stackCtaLabel: this.wizardStackCtaLabel().trim(),
          stackCtaUrl: this.wizardStackCtaUrl().trim(),
          socialVideoUrl: '',
          socialVideoMimeType: '',
          socialVideoUpdatedAt: '',
          socialVideoRatio: 'vertical',
          socialVideoAudioTrackId: DEFAULT_STACK_AUDIO_TRACK_ID,
          socialVideoAudioVolume: DEFAULT_STACK_AUDIO_VOLUME,
          forkedFromBoardId: '',
          forkedFromTitle: '',
          forkedFromOwnerUserId: '',
          forkedFromOwnerName: '',
          visibility: 'public',
          stickers: [],
          tourMeta: result.board.tourMeta ?? this.buildWizardTourMeta(cards),
          cards,
          createdAt: now,
          updatedAt: now,
        };

    try {
      const persisted = await this.persistBoard(nextBoard);
      if (existingBoard) {
        this.boards.update((boards) => boards.map((board) => board.id === existingBoard.id ? persisted : board));
      } else {
        this.boards.update((boards) => [persisted, ...boards]);
      }
      this.boardsSyncError.set(null);
      this.wizardSaving.set(false);
      this.wizardStep.set('done');
      void this.router.navigate(['/boards', persisted.id]);
    } catch (error) {
      console.error('Wizard board save failed', error, {
        boardId: nextBoard.id,
        mode: this.wizardMode(),
        selectedCardCount: cards.length,
      });
      const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
      this.wizardError.set(`Could not save this board to your account. Please try again.${detail}`);
      this.boardsSyncError.set($localize`Board save failed. Please try again.`);
      this.wizardSaving.set(false);
    }
  }

  private async saveOffGridContribution(board: Board, card: BoardCard | undefined): Promise<void> {
    const uid = this.authService.uid();
    if (!card || !uid || !this.functions || !this.firestore) {
      throw new Error($localize`Board sync is not ready. Refresh and try again.`);
    }
    if (board.kind !== 'off-grid' || board.visibility !== 'public') {
      throw new Error($localize`This board is not open for Off-grid contributions.`);
    }
    if (card.imageUrl.startsWith('data:') && !this.storage) {
      throw new Error($localize`Photo upload is not ready. Refresh and try again.`);
    }

    const imageUrl = await this.persistImageIfNeeded(
      card.imageUrl,
      `users/${uid}/boards/contributions/${board.id}/cards/${card.id}/0.jpg`,
    );
    const callable = httpsCallable<{
      boardId: string;
      card: Pick<BoardCard, 'title' | 'notes' | 'imageUrl' | 'what3wordsAddress'>;
    }, unknown>(this.functions, 'addOffGridBoardCard');
    await callable({
      boardId: board.id,
      card: {
        title: card.title,
        notes: card.notes,
        imageUrl,
        what3wordsAddress: card.what3wordsAddress,
      },
    });

    const latestBoard = await this.loadBoardById(board.id);
    if (!latestBoard) {
      throw new Error($localize`The card was added, but the refreshed board could not be loaded.`);
    }
    this.boards.update((boards) => boards.some((item) => item.id === latestBoard.id)
      ? boards.map((item) => item.id === latestBoard.id ? latestBoard : item)
      : [latestBoard, ...boards]);
    this.boardsSyncError.set(null);
  }

  openEditBoard(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can edit this board.`);
      return;
    }
    this.editingBoardId.set(board.id);
    this.imageUploadError.set(null);
    this.boardDraft.set({
      title: board.title,
      description: board.description,
      backNote: board.backNote,
      icon: board.icon,
      tone: board.tone,
      visibility: board.visibility,
      imageUrl: board.imageUrl,
      logoUrl: board.logoUrl,
      logoLinkUrl: board.logoLinkUrl,
      stackCtaLabel: board.stackCtaLabel,
      stackCtaUrl: board.stackCtaUrl,
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
    if (draft.visibility === 'private' && !this.canUsePrivateBoards()) {
      this.redirectToPrivateBoardsPricing();
      return;
    }

    const now = new Date().toISOString();
    const editingId = this.editingBoardId();
    let nextBoard: Board | null = null;
    if (editingId) {
      const editingBoard = this.boards().find((board) => board.id === editingId);
      if (!editingBoard || !this.canEditBoard(editingBoard)) {
        this.boardsSyncError.set($localize`Only the board owner can edit this board.`);
        return;
      }
      this.boards.update((boards) =>
        boards.map((board) => {
          if (board.id !== editingId) {
            return board;
          }
          nextBoard = {
                ...board,
                title,
                description: draft.description.trim(),
                backNote: draft.backNote.trim(),
                icon: draft.icon,
                tone: draft.tone,
                visibility: draft.visibility,
                imageUrl: draft.imageUrl.trim(),
                logoUrl: draft.logoUrl.trim(),
                logoLinkUrl: draft.logoLinkUrl.trim(),
                stackCtaLabel: draft.stackCtaLabel.trim(),
                stackCtaUrl: draft.stackCtaUrl.trim(),
                stickers: draft.stickers,
                updatedAt: now,
          };
          return nextBoard;
        }),
      );
    } else {
      const board: Board = {
        id: this.createId(),
        ...this.currentOwnerSnapshot(),
        sortOrder: this.nextBoardSortOrder(),
        title,
        description: draft.description.trim(),
        backNote: draft.backNote.trim(),
        icon: draft.icon,
        tone: draft.tone,
        visibility: draft.visibility,
        imageUrl: draft.imageUrl.trim(),
        logoUrl: draft.logoUrl.trim(),
        logoLinkUrl: draft.logoLinkUrl.trim(),
        stackCtaLabel: draft.stackCtaLabel.trim(),
        stackCtaUrl: draft.stackCtaUrl.trim(),
        socialVideoUrl: '',
        socialVideoMimeType: '',
        socialVideoUpdatedAt: '',
        socialVideoRatio: 'vertical',
        socialVideoAudioTrackId: DEFAULT_STACK_AUDIO_TRACK_ID,
        socialVideoAudioVolume: DEFAULT_STACK_AUDIO_VOLUME,
        forkedFromBoardId: '',
        forkedFromTitle: '',
        forkedFromOwnerUserId: '',
        forkedFromOwnerName: '',
        stickers: draft.stickers,
      cards: [],
      kind: 'standard',
      tourMeta: null,
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

  deleteBoard(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can delete this board.`);
      return;
    }
    this.boardDeleteCandidate.set(board);
  }

  closeBoardDeleteDialog(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.boardDeleteCandidate.set(null);
  }

  confirmDeleteBoard(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.boardDeleteCandidate();
    if (!board) {
      return;
    }
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can delete this board.`);
      this.boardDeleteCandidate.set(null);
      return;
    }
    this.boardDeleteCandidate.set(null);

    this.boards.update((boards) => boards.filter((item) => item.id !== board.id));
    if (this.selectedBoardId() === board.id) {
      void this.router.navigateByUrl(this.boardsProfileRoutePath());
    }
    void this.deleteRemoteBoard(board.id);
  }

  openCreateCard(boardId = this.selectedBoard()?.id ?? null): void {
    const board = this.boards().find((item) => item.id === boardId);
    if (!board || !this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can add cards.`);
      return;
    }
    const songMode = this.isSongBoard(board);
    this.selectedBoardId.set(boardId);
    this.imageUploadError.set(null);
    this.resetCardWizard();
    this.cardImageLocked.set(false);
    this.editingCardId.set(null);
    this.cardDraft.set({
      title: '',
      subtitle: '',
      notes: '',
      type: songMode ? 'note' : 'place',
      scope: 'place',
      status: 'saved',
      rating: songMode ? '5' : '4',
      imageUrl: '',
      imageUrls: [],
      audioPreviewUrl: '',
      spotifyTrackId: '',
      spotifyTrackUrl: '',
      spotifyUri: '',
      spotifyArtistName: '',
      spotifyAlbumName: '',
      spotifyArtworkUrl: '',
      placeQuery: '',
      placeCity: '',
      placeId: '',
      googleMapsUrl: '',
      what3wordsAddress: '',
      tags: songMode ? 'song, music' : '',
      stickers: [],
      tourSequence: '',
      tourLat: '',
      tourLng: '',
      tourAddress: '',
      tourGuideScript: '',
      tourLegDistanceText: '',
      tourLegDurationText: '',
      tourLegInstruction: '',
      tourLegNavScript: '',
      tourLegEncodedPolyline: '',
    });
    this.cardDialogOpen.set(true);
  }

  openEditCard(card: BoardCard): void {
    const board = this.selectedBoard();
    if (!board || !this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can edit cards.`);
      return;
    }
    this.editingCardId.set(card.id);
    this.imageUploadError.set(null);
    this.resetCardWizard();
    this.cardImageLocked.set(!!card.imageUrl);
    const tour = card.tour;
    this.cardDraft.set({
      title: card.title,
      subtitle: card.subtitle,
      notes: card.notes,
      type: card.type,
      scope: card.scope,
      status: card.status,
      rating: String(card.rating),
      imageUrl: card.imageUrl,
      imageUrls: this.cardImages(card),
      audioPreviewUrl: card.audioPreviewUrl,
      spotifyTrackId: card.spotifyTrackId,
      spotifyTrackUrl: card.spotifyTrackUrl,
      spotifyUri: card.spotifyUri,
      spotifyArtistName: card.spotifyArtistName,
      spotifyAlbumName: card.spotifyAlbumName,
      spotifyArtworkUrl: card.spotifyArtworkUrl,
      placeQuery: card.title,
      placeCity: '',
      placeId: card.placeId,
      googleMapsUrl: card.googleMapsUrl,
      what3wordsAddress: card.what3wordsAddress ?? '',
      tags: card.tags.join(', '),
      stickers: card.stickers ?? [],
      tourSequence: tour ? String(tour.sequence) : '',
      tourLat: tour?.lat === null || tour?.lat === undefined ? '' : String(tour.lat),
      tourLng: tour?.lng === null || tour?.lng === undefined ? '' : String(tour.lng),
      tourAddress: tour?.address ?? '',
      tourGuideScript: tour?.guideScript ?? '',
      tourLegDistanceText: tour?.legToNext?.distanceText ?? '',
      tourLegDurationText: tour?.legToNext?.durationText ?? '',
      tourLegInstruction: tour?.legToNext?.instruction ?? '',
      tourLegNavScript: tour?.legToNext?.navScript ?? '',
      tourLegEncodedPolyline: tour?.legToNext?.encodedPolyline ?? '',
    });
    this.cardDialogOpen.set(true);
  }

  openEditGalleryCard(boardId: string, card: BoardCard): void {
    const board = this.boards().find((item) => item.id === boardId);
    if (!board || !this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can edit cards.`);
      return;
    }
    this.selectedBoardId.set(boardId);
    this.openEditCard(card);
  }

  openEditGalleryCardPhotos(boardId: string, card: BoardCard, event?: Event): void {
    const board = this.boards().find((item) => item.id === boardId);
    if (!board || !this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can edit cards.`);
      return;
    }
    this.selectedBoardId.set(boardId);
    this.openEditCardPhotos(card, event);
  }

  openRelatedCardManagerFromGallery(boardId: string, card: BoardCard, event?: Event): void {
    const board = this.boards().find((item) => item.id === boardId);
    if (!board || !this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can edit cards.`);
      return;
    }
    this.selectedBoardId.set(boardId);
    this.openRelatedCardManager(card, event);
  }

  closeCardDialog(): void {
    this.closeRelatedCardEditor();
    this.cardDialogOpen.set(false);
    this.editingCardId.set(null);
    this.cardImageLocked.set(false);
    this.resetCardWizard();
    this.clearPlaceSearch();
  }

  openCreateRelatedCard(parentId = this.editingCardId(), event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.originalSelectedBoard();
    const parent = board?.cards.find((card) => card.id === parentId);
    if (!board || !parent || !this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Save the parent card before adding related cards.`);
      return;
    }
    this.relatedCardParentId.set(parent.id);
    this.relatedCardEditingId.set(null);
    this.relatedCardDeleteCandidateId.set(null);
    this.relatedCardAiError.set(null);
    this.relatedCardDraft.set(this.emptyRelatedCardDraft());
    this.relatedCardEditorOpen.set(true);
  }

  scrollToRelatedCardManager(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.isBrowser) {
      return;
    }
    document.getElementById('related-card-manager')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  openRelatedCardManager(card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.openEditCard(card);
    if (this.isBrowser) {
      window.setTimeout(() => this.scrollToRelatedCardManager(), 80);
    }
  }

  openEditRelatedCard(parentId: string, card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.originalSelectedBoard();
    const parent = board?.cards.find((item) => item.id === parentId);
    if (
      !board
      || !parent
      || !this.canEditBoard(board)
      || this.isLegacyMemoryRelatedCard(card)
      || !this.explicitRelatedCards(parent).some((item) => item.id === card.id)
    ) {
      return;
    }
    this.relatedCardParentId.set(parent.id);
    this.relatedCardEditingId.set(card.id);
    this.relatedCardDeleteCandidateId.set(null);
    this.relatedCardAiError.set(null);
    this.relatedCardDraft.set({
      title: card.title,
      subtitle: card.subtitle,
      notes: card.notes,
      type: card.type,
      imageUrl: card.imageUrl,
      imageName: '',
      analysisDataUrl: '',
      tags: card.tags.filter((tag) => tag !== 'related-card').join(', '),
      prompt: '',
      generated: null,
    });
    this.relatedCardEditorOpen.set(true);
  }

  closeRelatedCardEditor(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.relatedCardSaving() || this.relatedCardAiLoading()) {
      return;
    }
    this.relatedCardEditorOpen.set(false);
    this.relatedCardParentId.set(null);
    this.relatedCardEditingId.set(null);
    this.relatedCardDeleteCandidateId.set(null);
    this.relatedCardAiError.set(null);
  }

  updateRelatedCardDraft<K extends keyof RelatedCardDraft>(field: K, value: RelatedCardDraft[K]): void {
    this.relatedCardDraft.update((draft) => ({ ...draft, [field]: value }));
    this.relatedCardAiError.set(null);
  }

  async onRelatedCardImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    try {
      const photo = await this.readWizardPhoto(file);
      this.relatedCardDraft.update((draft) => ({
        ...draft,
        imageUrl: photo.imageUrl,
        imageName: photo.name,
        analysisDataUrl: photo.analysisDataUrl,
      }));
      this.relatedCardAiError.set(null);
      await this.prepareRelatedCardWithAi(true);
    } catch (error) {
      this.relatedCardAiError.set(
        error instanceof Error ? error.message : $localize`Could not use that photo.`,
      );
    }
  }

  clearRelatedCardImage(): void {
    this.relatedCardDraft.update((draft) => ({
      ...draft,
      imageUrl: '',
      imageName: '',
      analysisDataUrl: '',
    }));
    this.relatedCardAiError.set(null);
  }

  async prepareRelatedCardWithAi(automatic = false): Promise<void> {
    const board = this.originalSelectedBoard();
    const parent = this.relatedCardEditorParent();
    const draft = this.relatedCardDraft();
    if (
      !board
      || !parent
      || !this.functions
      || !this.canEditBoard(board)
      || this.relatedCardAiLoading()
    ) {
      return;
    }
    if (!draft.analysisDataUrl && draft.prompt.trim().length < 3 && draft.title.trim().length < 3) {
      if (!automatic) {
        this.relatedCardAiError.set($localize`Add a photo or describe the related card first.`);
      }
      return;
    }
    this.relatedCardAiLoading.set(true);
    this.relatedCardAiError.set(null);
    try {
      const callable = httpsCallable<Record<string, unknown>, unknown>(
        this.functions,
        'generateBoardWizardBatch',
        { timeout: 170_000 },
      );
      const response = await callable({
        mode: draft.analysisDataUrl ? 'photos' : 'describe',
        prompt: [
          `Create one related card that belongs inside "${parent.title}".`,
          parent.subtitle ? `Parent context: ${parent.subtitle}` : '',
          parent.notes ? `Parent notes: ${parent.notes}` : '',
          draft.prompt.trim() ? `User description: ${draft.prompt.trim()}` : '',
          'Write a warm, specific title, a concise subtitle, and a useful short description. Do not invent private facts.',
        ].filter(Boolean).join('\n'),
        pastedList: '',
        url: '',
        photoNames: draft.imageName ? [draft.imageName] : [],
        photos: draft.analysisDataUrl
          ? [{
              index: 0,
              name: draft.imageName || 'related-card-photo.jpg',
              caption: draft.prompt.trim(),
              ...this.imageDataUrlPayload(draft.analysisDataUrl),
            }]
          : [],
        targetBoardId: board.id,
        targetBoardTitle: board.title,
        defaultType: draft.type,
        count: 1,
        vibe: draft.type === 'memory' ? 'memory' : 'curator',
        existingCards: this.explicitRelatedCards(parent).slice(0, 40).map((card) => ({
          title: card.title,
          subtitle: card.subtitle,
          tags: card.tags,
        })),
      });
      const generated = this.normalizeWizardBatch(response.data).cards[0];
      if (!generated) {
        throw new Error('The Card Wizard did not return a usable related card.');
      }
      this.relatedCardDraft.update((current) => ({
        ...current,
        title: generated.title || current.title,
        subtitle: generated.subtitle || current.subtitle,
        notes: generated.notes || current.notes,
        type: generated.type || current.type,
        tags: generated.tags.length ? generated.tags.join(', ') : current.tags,
        generated,
      }));
    } catch (error) {
      this.relatedCardAiError.set(
        error instanceof Error
          ? error.message
          : $localize`The Card Wizard could not prepare this related card.`,
      );
    } finally {
      this.relatedCardAiLoading.set(false);
    }
  }

  async saveRelatedCard(event?: Event, addAnother = false): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.originalSelectedBoard();
    const parent = this.relatedCardEditorParent();
    const draft = this.relatedCardDraft();
    const title = draft.title.trim();
    if (!board || !parent || !title || !this.canEditBoard(board)) {
      this.relatedCardAiError.set($localize`Give this related card a title before saving.`);
      return;
    }
    const editingId = this.relatedCardEditingId();
    const existing = editingId
      ? this.explicitRelatedCards(parent).find((card) => card.id === editingId) ?? null
      : null;
    const generated = draft.generated;
    const now = new Date().toISOString();
    const tags = this.mergeWizardTags(
      draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      ['related-card', ...(draft.type === 'memory' ? ['memory'] : [])],
    ).slice(0, 6);
    const relatedCard: BoardCard = {
      ...(existing ?? {}),
      id: existing?.id ?? this.createId(),
      title,
      subtitle: draft.subtitle.trim(),
      notes: draft.notes.trim(),
      type: draft.type,
      scope: generated?.scope ?? existing?.scope ?? 'place',
      status: generated?.status ?? existing?.status ?? 'saved',
      rating: generated?.rating ?? existing?.rating ?? 4,
      entityName: generated?.entity_name || existing?.entityName || title,
      entityType: generated?.entity_type || existing?.entityType || 'other',
      imageIntent: generated?.image_intent || existing?.imageIntent || 'other',
      imageContext: generated?.image_context || existing?.imageContext || parent.title,
      mediaKind: generated?.media_kind || existing?.mediaKind || 'none',
      shortSummary: generated?.short_summary || draft.subtitle.trim() || draft.notes.trim(),
      rank: generated?.rank ?? existing?.rank ?? this.explicitRelatedCards(parent).length + 1,
      imageUrl: draft.imageUrl || generated?.imageUrl || existing?.imageUrl || '',
      imageUrls: this.uniqueImageUrls([
        draft.imageUrl,
        generated?.imageUrl ?? '',
        ...(existing?.imageUrls ?? []),
      ]).slice(0, 12),
      audioPreviewUrl: generated?.audioPreviewUrl || existing?.audioPreviewUrl || '',
      spotifyTrackId: generated?.spotifyTrackId || existing?.spotifyTrackId || '',
      spotifyTrackUrl: generated?.spotifyTrackUrl || existing?.spotifyTrackUrl || '',
      spotifyUri: generated?.spotifyUri || existing?.spotifyUri || '',
      spotifyArtistName: generated?.spotifyArtistName || existing?.spotifyArtistName || '',
      spotifyAlbumName: generated?.spotifyAlbumName || existing?.spotifyAlbumName || '',
      spotifyArtworkUrl: generated?.spotifyArtworkUrl || existing?.spotifyArtworkUrl || '',
      placeId: generated?.placeId || existing?.placeId || '',
      googleMapsUrl: generated?.googleMapsUrl || existing?.googleMapsUrl || '',
      locationLat: generated?.locationLat ?? existing?.locationLat,
      locationLng: generated?.locationLng ?? existing?.locationLng,
      sourceUrl: generated?.sourceUrl || existing?.sourceUrl || '',
      productUrl: generated?.productUrl || existing?.productUrl || '',
      merchant: generated?.merchant || existing?.merchant || '',
      price: generated?.price || existing?.price || '',
      currency: generated?.currency || existing?.currency || '',
      sku: generated?.sku || existing?.sku || '',
      availability: generated?.availability || existing?.availability || '',
      productCategory: generated?.productCategory || existing?.productCategory || '',
      imageSource: generated?.imageSource || existing?.imageSource,
      extractionConfidence: generated?.extractionConfidence ?? existing?.extractionConfidence ?? 0,
      extractedAt: generated?.extractedAt || existing?.extractedAt || '',
      what3wordsAddress: generated?.what3wordsAddress || existing?.what3wordsAddress || '',
      tags,
      stickers: existing?.stickers ?? [],
      tour: existing?.tour ?? null,
      relatedCards: [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const nextRelatedCards = editingId
      ? this.explicitRelatedCards(parent).map((card) => card.id === editingId ? relatedCard : card)
      : [...this.explicitRelatedCards(parent), relatedCard];
    const nextBoard: Board = {
      ...board,
      cards: board.cards.map((card) =>
        card.id === parent.id ? { ...card, relatedCards: nextRelatedCards, updatedAt: now } : card),
      updatedAt: now,
    };
    this.relatedCardSaving.set(true);
    try {
      this.boards.update((boards) => boards.map((item) => item.id === board.id ? nextBoard : item));
      await this.persistAndReplaceBoard(nextBoard);
      this.relatedCardEditingId.set(null);
      this.relatedCardDeleteCandidateId.set(null);
      this.relatedCardAiError.set(null);
      if (addAnother) {
        this.relatedCardDraft.set(this.emptyRelatedCardDraft());
      } else {
        this.relatedCardEditorOpen.set(false);
        this.relatedCardParentId.set(null);
      }
    } finally {
      this.relatedCardSaving.set(false);
    }
  }

  requestDeleteRelatedCard(cardId: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.relatedCardDeleteCandidateId.set(cardId);
  }

  cancelDeleteRelatedCard(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.relatedCardDeleteCandidateId.set(null);
  }

  async confirmDeleteRelatedCard(parentId: string, cardId: string, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.originalSelectedBoard();
    const parent = board?.cards.find((card) => card.id === parentId);
    if (!board || !parent || !this.canEditBoard(board)) {
      return;
    }
    const now = new Date().toISOString();
    const nextBoard: Board = {
      ...board,
      cards: board.cards.map((card) =>
        card.id === parent.id
          ? {
              ...card,
              relatedCards: this.explicitRelatedCards(parent).filter((related) => related.id !== cardId),
              updatedAt: now,
            }
          : card),
      updatedAt: now,
    };
    this.relatedCardDeleteCandidateId.set(null);
    this.boards.update((boards) => boards.map((item) => item.id === board.id ? nextBoard : item));
    await this.persistAndReplaceBoard(nextBoard);
  }

  async moveRelatedCard(parentId: string, cardId: string, direction: -1 | 1, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.originalSelectedBoard();
    const parent = board?.cards.find((card) => card.id === parentId);
    if (!board || !parent || !this.canEditBoard(board)) {
      return;
    }
    const relatedCards = [...this.explicitRelatedCards(parent)];
    const index = relatedCards.findIndex((card) => card.id === cardId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= relatedCards.length) {
      return;
    }
    [relatedCards[index], relatedCards[target]] = [relatedCards[target], relatedCards[index]];
    const now = new Date().toISOString();
    const nextBoard: Board = {
      ...board,
      cards: board.cards.map((card) =>
        card.id === parent.id ? { ...card, relatedCards, updatedAt: now } : card),
      updatedAt: now,
    };
    this.boards.update((boards) => boards.map((item) => item.id === board.id ? nextBoard : item));
    await this.persistAndReplaceBoard(nextBoard);
  }

  openAddTourStop(afterCardId: string | null, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.originalSelectedBoard();
    if (!this.isTourBoard(board) || !this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the tour owner can add stops.`);
      return;
    }
    if (this.tourRouteUpdating()) {
      this.tourRouteError.set($localize`Wait for the current route update to finish.`);
      return;
    }
    const anchor = afterCardId
      ? this.tourCards(board).find((card) => card.id === afterCardId) ?? null
      : null;
    this.closeCardActionMenu();
    this.tourStopInsertAfterId.set(anchor?.id ?? null);
    this.tourStopDraft.set(this.emptyTourStopDraft());
    this.tourStopAiError.set(null);
    this.tourStopEditorOpen.set(true);
  }

  openAppendTourStop(board: Board, event?: Event): void {
    const stops = this.tourCards(board);
    this.openAddTourStop(stops.at(-1)?.id ?? null, event);
  }

  closeTourStopEditor(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.tourStopSaving() || this.tourStopAiLoading()) {
      return;
    }
    this.tourStopEditorOpen.set(false);
    this.tourStopInsertAfterId.set(null);
    this.tourStopAiError.set(null);
  }

  updateTourStopDraft<K extends keyof TourStopDraft>(field: K, value: TourStopDraft[K]): void {
    this.tourStopDraft.update((draft) => ({ ...draft, [field]: value }));
    this.tourStopAiError.set(null);
  }

  async onTourStopImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    try {
      const photo = await this.readWizardPhoto(file);
      this.tourStopDraft.update((draft) => ({
        ...draft,
        imageUrl: photo.imageUrl,
        imageName: photo.name,
        analysisDataUrl: photo.analysisDataUrl,
      }));
      this.tourStopAiError.set(null);
      if (this.tourStopDraft().prompt.trim().length >= 3) {
        await this.prepareTourStopWithAi(true);
      }
    } catch (error) {
      this.tourStopAiError.set(
        error instanceof Error ? error.message : $localize`Could not use that photo.`,
      );
    }
  }

  clearTourStopImage(): void {
    this.tourStopDraft.update((draft) => ({
      ...draft,
      imageUrl: '',
      imageName: '',
      analysisDataUrl: '',
    }));
    this.tourStopAiError.set(null);
  }

  async prepareTourStopWithAi(automatic = false): Promise<void> {
    const board = this.originalSelectedBoard();
    const draft = this.tourStopDraft();
    if (
      !this.isTourBoard(board)
      || !this.functions
      || !this.canEditBoard(board)
      || this.tourStopAiLoading()
      || this.tourStopSaving()
    ) {
      return;
    }
    if (!draft.analysisDataUrl && draft.prompt.trim().length < 3 && draft.title.trim().length < 3) {
      if (!automatic) {
        this.tourStopAiError.set($localize`Describe the destination or add a photo first.`);
      }
      return;
    }

    const afterCard = this.tourStopInsertAfterCard();
    const beforeCard = this.tourStopInsertBeforeCard();
    const destinationQuery = tourStopDestinationQuery(draft.prompt.trim() || draft.title.trim());
    this.tourStopAiLoading.set(true);
    this.tourStopAiError.set(null);
    try {
      let place: PlaceSearchResult | null = null;
      if (destinationQuery && this.googleMapsService.isConfigured()) {
        try {
          const exactResults = await this.googleMapsService.searchPlaces(destinationQuery);
          place = exactResults[0] ?? null;
        } catch {
          // Retry below with the board title when the place name alone is ambiguous.
        }
        if (!place) {
          try {
            const contextualResults = await this.googleMapsService.searchPlaces(destinationQuery, board.title);
            place = contextualResults[0] ?? null;
          } catch {
            // AI may still return an exact location if browser-side place lookup is unavailable.
          }
        }
      }

      const callable = httpsCallable<Record<string, unknown>, unknown>(
        this.functions,
        'generateBoardWizardBatch',
        { timeout: 170_000 },
      );
      let generated: BoardWizardGeneratedCard | null = null;
      let aiUnavailable = false;
      try {
        const response = await callable({
          mode: board.kind,
          singleTourStop: true,
          prompt: [
            destinationQuery ? `Requested destination: ${destinationQuery}` : '',
            draft.prompt.trim() && draft.prompt.trim() !== destinationQuery
              ? `User input or source: ${draft.prompt.trim()}`
              : '',
            `Existing tour: "${board.title}".`,
            afterCard ? `Insert it after "${afterCard.title}".` : 'This is the first stop in the tour.',
            beforeCard ? `The following stop is "${beforeCard.title}".` : 'This stop will be added at the end of the tour.',
            draft.visitorNotes.trim() ? `Visitor context: ${draft.visitorNotes.trim()}` : '',
          ].filter(Boolean).join('\n'),
          pastedList: '',
          url: '',
          photoNames: draft.imageName ? [draft.imageName] : [],
          photos: draft.analysisDataUrl
            ? [{
                index: 0,
                name: draft.imageName || 'tour-stop-photo.jpg',
                caption: draft.prompt.trim(),
                ...this.imageDataUrlPayload(draft.analysisDataUrl),
              }]
            : [],
          targetBoardId: board.id,
          targetBoardTitle: board.title,
          defaultType: 'place',
          count: 1,
          vibe: 'traveler',
          tourOptions: {
            voiceStyle: board.tourMeta?.voiceStyle ?? 'local',
            paceOrRouteStyle: board.tourMeta?.paceOrRouteStyle ?? (board.kind === 'driving-tour' ? 'Balanced' : 'Standard'),
            extras: board.tourMeta?.extras ?? [],
          },
          existingCards: this.tourCards(board).slice(0, 80).map((card) => ({
            title: card.title,
            subtitle: card.subtitle,
            tags: card.tags,
          })),
        });
        const responseData = response.data && typeof response.data === 'object'
          ? response.data as Record<string, unknown>
          : {};
        generated = Array.isArray(responseData['cards'])
          ? this.normalizeWizardGeneratedCard(responseData['cards'][0])
          : null;
        if (isGenericTourStopFallback(generated)) {
          generated = null;
          aiUnavailable = true;
        }
      } catch {
        aiUnavailable = true;
      }

      if (!place && generated && this.googleMapsService.isConfigured()) {
        try {
          const results = await this.googleMapsService.searchPlaces(
            generated.place_query || generated.title,
            [generated.tour?.address, generated.image_context, board.title].filter(Boolean).join(', '),
          );
          place = results[0] ?? null;
        } catch {
          // The generated exact location remains editable if Google place enrichment is unavailable.
        }
      }
      if (!generated && !place) {
        this.tourStopDraft.update((current) => ({
          ...current,
          title: current.title || destinationQuery,
        }));
        throw new Error($localize`We could not find that exact stop. Add the city or a more specific place name and try again.`);
      }

      const lat = place?.lat ?? generated?.locationLat ?? generated?.tour?.lat ?? null;
      const lng = place?.lng ?? generated?.locationLng ?? generated?.tour?.lng ?? null;
      let resolvedAddress = place?.address || generated?.tour?.address || '';
      if (!resolvedAddress && lat !== null && lng !== null && this.googleMapsService.isConfigured()) {
        try {
          resolvedAddress = await this.googleMapsService.reverseGeocode(lat, lng) ?? '';
        } catch {
          // Coordinates are authoritative even if no postal address exists for the landmark.
        }
      }
      this.tourStopDraft.update((current) => ({
        ...current,
        title: place?.name || generated?.title || destinationQuery || current.title,
        subtitle: generated?.subtitle || current.subtitle,
        notes: generated?.notes || current.notes,
        address: resolvedAddress || current.address || place?.name || generated?.title || destinationQuery,
        guideScript: generated?.tour?.guideScript || generated?.notes || current.guideScript,
        imageUrl: current.imageUrl || place?.photoUrl || generated?.imageUrl || '',
        tags: generated?.tags.length ? generated.tags.join(', ') : current.tags,
        placeId: place?.placeId || generated?.placeId || '',
        googleMapsUrl: place?.googleMapsUrl || generated?.googleMapsUrl || '',
        lat: lat === null ? '' : String(lat),
        lng: lng === null ? '' : String(lng),
        generated,
      }));
      if (aiUnavailable && place) {
        this.tourStopAiError.set(
          $localize`Place found. AI description and narration are temporarily unavailable; you can add the stop now or try again.`,
        );
      }
    } catch (error) {
      this.tourStopAiError.set(
        error instanceof Error
          ? error.message
          : $localize`The Card Wizard could not prepare this tour stop.`,
      );
    } finally {
      this.tourStopAiLoading.set(false);
    }
  }

  async saveTourStop(event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.originalSelectedBoard();
    let draft = this.tourStopDraft();
    if (!this.isTourBoard(board) || !this.canEditBoard(board)) {
      return;
    }
    const title = draft.title.trim();
    if (!title) {
      this.tourStopAiError.set($localize`Give this stop a title before adding it.`);
      return;
    }

    let lat = this.decimalValue(draft.lat, null, -90, 90);
    let lng = this.decimalValue(draft.lng, null, -180, 180);
    if ((lat === null || lng === null) && this.googleMapsService.isConfigured()) {
      this.tourStopSaving.set(true);
      try {
        const placeQuery = draft.address.trim() || title;
        let place: PlaceSearchResult | null = null;
        try {
          const exactResults = await this.googleMapsService.searchPlaces(placeQuery);
          place = exactResults[0] ?? null;
        } catch {
          // Retry with tour context below.
        }
        if (!place) {
          try {
            const contextualResults = await this.googleMapsService.searchPlaces(placeQuery, board.title);
            place = contextualResults[0] ?? null;
          } catch {
            // The validation below will explain that an exact place is still required.
          }
        }
        if (place?.lat !== null && place?.lat !== undefined && place.lng !== null && place.lng !== undefined) {
          lat = place.lat;
          lng = place.lng;
          draft = {
            ...draft,
            address: place.address || draft.address,
            placeId: place.placeId || draft.placeId,
            googleMapsUrl: place.googleMapsUrl || draft.googleMapsUrl,
            imageUrl: draft.imageUrl || place.photoUrl,
            lat: String(place.lat),
            lng: String(place.lng),
          };
          this.tourStopDraft.set(draft);
        }
      } catch {
        // The validation below provides one clear, actionable message.
      } finally {
        this.tourStopSaving.set(false);
      }
    }
    if (!draft.address.trim() && lat !== null && lng !== null) {
      let resolvedAddress = '';
      if (this.googleMapsService.isConfigured()) {
        try {
          resolvedAddress = await this.googleMapsService.reverseGeocode(lat, lng) ?? '';
        } catch {
          // Some landmarks have coordinates but no standalone postal address.
        }
      }
      draft = {
        ...draft,
        address: resolvedAddress || title,
      };
      this.tourStopDraft.set(draft);
    }
    if (lat === null || lng === null) {
      this.tourStopAiError.set($localize`Choose an exact place before adding this stop to the route.`);
      return;
    }

    const generated = draft.generated;
    const now = new Date().toISOString();
    const id = this.createId();
    const tags = this.mergeWizardTags(
      draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      ['stop', 'tour', board.kind],
    );
    const stop: BoardCard = {
      id,
      title,
      subtitle: draft.subtitle.trim(),
      notes: draft.notes.trim(),
      type: 'place',
      scope: 'place',
      status: generated?.status ?? 'saved',
      rating: generated?.rating ?? 4,
      entityName: generated?.entity_name || title,
      entityType: 'place',
      imageIntent: 'place',
      imageContext: generated?.image_context || board.title,
      mediaKind: 'none',
      shortSummary: generated?.short_summary || draft.subtitle.trim() || draft.notes.trim(),
      rank: this.tourCards(board).length + 1,
      imageUrl: draft.imageUrl || generated?.imageUrl || '',
      imageUrls: this.uniqueImageUrls([draft.imageUrl, generated?.imageUrl ?? '']).slice(0, 12),
      audioPreviewUrl: '',
      spotifyTrackId: '',
      spotifyTrackUrl: '',
      spotifyUri: '',
      spotifyArtistName: '',
      spotifyAlbumName: '',
      spotifyArtworkUrl: '',
      placeId: draft.placeId || generated?.placeId || '',
      googleMapsUrl: draft.googleMapsUrl
        || generated?.googleMapsUrl
        || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`,
      locationLat: lat,
      locationLng: lng,
      sourceUrl: generated?.sourceUrl || '',
      productUrl: '',
      merchant: '',
      price: '',
      currency: '',
      sku: '',
      availability: '',
      productCategory: '',
      imageSource: generated?.imageSource ?? 'missing',
      extractionConfidence: generated?.extractionConfidence ?? 0,
      extractedAt: generated?.extractedAt || '',
      what3wordsAddress: generated?.what3wordsAddress || '',
      tags,
      stickers: [],
      tour: {
        sequence: this.tourCards(board).length + 1,
        lat,
        lng,
        address: draft.address.trim().slice(0, 180),
        guideScript: (draft.guideScript.trim() || draft.notes.trim()).slice(0, 3600),
        legToNext: null,
      },
      relatedCards: [],
      createdAt: now,
      updatedAt: now,
    };
    this.tourStopSaving.set(true);
    this.tourStopAiError.set(null);
    try {
      const uid = this.authService.uid();
      const preparedStop = uid
        ? await this.prepareBoardCardImagesForFirebase(stop, uid, board.id)
        : stop;
      if (preparedStop.imageUrls.some((url) => url.startsWith('data:'))) {
        throw new Error($localize`The photo could not be uploaded. Remove it or try again.`);
      }
      const nextCards = insertTourCardAfter(
        board.cards,
        preparedStop,
        this.tourStopInsertAfterId(),
      );
      const saved = await this.saveTourCardMutation(board, nextCards, { addedCard: preparedStop });
      if (!saved) {
        this.tourStopAiError.set(
          this.tourRouteError() || $localize`This stop could not be added to the tour.`,
        );
        return;
      }
      this.tourStopEditorOpen.set(false);
      this.tourStopInsertAfterId.set(null);
      if (this.isBrowser) {
        window.setTimeout(() => {
          const savedStop = this.originalSelectedBoard()?.cards.find((card) => card.id === id);
          if (savedStop) {
            void this.focusTourStop(savedStop, false);
          }
        }, 80);
      }
    } catch (error) {
      this.tourStopAiError.set(
        error instanceof Error ? error.message : $localize`This stop could not be added to the tour.`,
      );
    } finally {
      this.tourStopSaving.set(false);
    }
  }

  private emptyRelatedCardDraft(): RelatedCardDraft {
    return {
      title: '',
      subtitle: '',
      notes: '',
      type: 'memory',
      imageUrl: '',
      imageName: '',
      analysisDataUrl: '',
      tags: 'memory',
      prompt: '',
      generated: null,
    };
  }

  private emptyTourStopDraft(): TourStopDraft {
    return {
      prompt: '',
      visitorNotes: '',
      title: '',
      subtitle: '',
      notes: '',
      address: '',
      guideScript: '',
      imageUrl: '',
      imageName: '',
      analysisDataUrl: '',
      tags: 'stop, tour',
      placeId: '',
      googleMapsUrl: '',
      lat: '',
      lng: '',
      generated: null,
    };
  }

  private resetCardWizard(): void {
    this.cardWizardPrompt.set('');
    this.cardWizardLoading.set(false);
    this.cardWizardError.set(null);
    this.resetCardImageTools();
  }

  private resetCardImageTools(): void {
    this.cardImageToolMode.set(null);
    this.cardImagePrompt.set('');
    this.cardImageGenerating.set(false);
    this.cardGeneratedImageUrl.set('');
    this.cardGeneratedImageModel.set('');
    this.cardImageSearchQuery.set('');
    this.cardImageSearchLoading.set(false);
    this.cardImageSearchResults.set([]);
    this.cardImageSearchIndex.set(0);
    this.cardImageApplying.set(false);
    this.cardImageToolError.set(null);
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
        error instanceof Error ? error.message : $localize`Could not use that image.`,
      );
    }
  }

  async onBoardLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    try {
      const logoUrl = await this.readImageFile(file);
      this.updateBoardDraft('logoUrl', logoUrl);
      this.imageUploadError.set(null);
    } catch (error) {
      this.imageUploadError.set(
        error instanceof Error ? error.message : $localize`Could not use that logo.`,
      );
    }
  }

  async onCardImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) {
      return;
    }

    try {
      const existingCount = this.cardDraftImages().length;
      const available = Math.max(0, 12 - existingCount);
      if (!available) {
        throw new Error('Each card can hold up to 12 photos.');
      }
      const imageUrls = await Promise.all(files.slice(0, available).map((file) => this.readImageFile(file)));
      this.cardImageLocked.set(true);
      this.cardDraft.update((draft) => {
        const current = this.uniqueImageUrls([draft.imageUrl, ...draft.imageUrls]);
        const next = this.uniqueImageUrls([...current, ...imageUrls]).slice(0, 12);
        return { ...draft, imageUrl: next[0] ?? '', imageUrls: next };
      });
      this.cardImageToolMode.set(null);
      this.imageUploadError.set(files.length > available ? `Added ${available} photos. Cards can hold up to 12.` : null);
    } catch (error) {
      this.imageUploadError.set(
        error instanceof Error ? error.message : $localize`Could not use those images.`,
      );
    }
  }

  clearBoardImage(): void {
    this.updateBoardDraft('imageUrl', '');
    this.imageUploadError.set(null);
  }

  clearBoardLogo(): void {
    this.updateBoardDraft('logoUrl', '');
    this.imageUploadError.set(null);
  }

  clearCardImage(): void {
    this.cardImageLocked.set(true);
    this.cardDraft.update((draft) => ({ ...draft, imageUrl: '', imageUrls: [] }));
    this.imageUploadError.set(null);
  }

  removeCardDraftImage(index: number): void {
    this.cardImageLocked.set(true);
    this.cardDraft.update((draft) => {
      const next = this.cardDraftImages(draft).filter((_, photoIndex) => photoIndex !== index);
      return { ...draft, imageUrl: next[0] ?? '', imageUrls: next };
    });
    this.imageUploadError.set(null);
  }

  makeCardDraftImageCover(index: number): void {
    this.cardImageLocked.set(true);
    this.cardDraft.update((draft) => {
      const photos = this.cardDraftImages(draft);
      const selected = photos[index];
      if (!selected) {
        return draft;
      }
      const next = [selected, ...photos.filter((_, photoIndex) => photoIndex !== index)];
      return { ...draft, imageUrl: selected, imageUrls: next };
    });
  }

  onCardImageUrlInput(value: string): void {
    this.cardImageLocked.set(true);
    this.cardDraft.update((draft) => {
      const next = this.uniqueImageUrls([value, ...draft.imageUrls.filter((url) => url !== draft.imageUrl)]);
      return { ...draft, imageUrl: value, imageUrls: next };
    });
  }

  onSongArtworkUrlInput(value: string): void {
    this.cardDraft.update((draft) => {
      const previousArtworkUrl = draft.spotifyArtworkUrl.trim();
      const currentImageUrl = draft.imageUrl.trim();
      return {
        ...draft,
        spotifyArtworkUrl: value,
        imageUrl: !currentImageUrl || currentImageUrl === previousArtworkUrl ? value : draft.imageUrl,
      };
    });
  }

  onSongArtistInput(value: string): void {
    this.cardDraft.update((draft) => ({
      ...draft,
      spotifyArtistName: value,
      subtitle: value,
    }));
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

  setCardScope(scope: BoardCardScope): void {
    this.cardDraft.update((draft) => ({
      ...draft,
      scope,
      placeCity: scope === 'place' ? draft.placeCity : '',
    }));
    this.schedulePlaceSearch();
  }

  cardScopeQueryLabel(scope: BoardCardScope): string {
    switch (scope) {
      case 'city':
        return 'City';
      case 'country':
        return 'Country';
      case 'region':
        return 'Region';
      default:
        return 'Place, restaurant, venue, or thing';
    }
  }

  cardScopeQueryPlaceholder(scope: BoardCardScope): string {
    switch (scope) {
      case 'city':
        return 'Atlanta, Philadelphia, Lisbon...';
      case 'country':
        return 'Ghana, Japan, Italy...';
      case 'region':
        return 'Bay Area, New England, Tuscany...';
      default:
        return 'Zahav, Ocean City boardwalk, MoMA...';
    }
  }

  showCardCityContext(): boolean {
    return this.cardDraft().scope === 'place';
  }

  onPlaceQueryInput(value: string): void {
    this.updateCardDraft('placeQuery', value);
    if (!this.cardDraft().title.trim()) {
      this.updateCardDraft('title', value);
    }
    const scope = this.cardDraft().scope;
    const city = scope === 'city' ? this.findExactCityOption(value) : null;
    const country = scope === 'country' ? this.findCountryOption(value) : null;
    if (city) {
      this.applyCitySuggestion(city, false);
    } else if (country) {
      this.applyCountrySuggestion(country, false);
    }
    this.schedulePlaceSearch();
  }

  onPlaceCityInput(value: string): void {
    this.updateCardDraft('placeCity', value);
    this.schedulePlaceSearch();
  }

  selectPlaceCity(city: BoardCityOption): void {
    this.updateCardDraft('placeCity', city.name);
    if (this.cardDraft().scope === 'city' || !this.cardDraft().placeQuery.trim()) {
      this.applyCitySuggestion(city, false);
    }
    this.schedulePlaceSearch();
  }

  selectPlaceSuggestion(place: PlaceSearchResult): void {
    this.applyPlaceSuggestion(place, true);
  }

  selectCountrySuggestion(country: string): void {
    this.applyCountrySuggestion(country, true);
    this.schedulePlaceSearch();
  }

  private applyPlaceSuggestion(place: PlaceSearchResult, closeSuggestions: boolean): void {
    const inferredType = this.inferCardType(place);
    const inferredScope = this.inferCardScope(place);
    this.cardDraft.update((draft) => {
      const scope = inferredScope === 'place' ? draft.scope : inferredScope;
      return {
        ...draft,
        title: place.name,
        subtitle: place.address,
        type: scope === 'place' ? inferredType : draft.type,
        scope,
        imageUrl: this.cardImageLocked() ? draft.imageUrl : place.photoUrl || draft.imageUrl,
        placeQuery: place.name,
        placeId: place.placeId,
        googleMapsUrl: place.googleMapsUrl,
        tags: scope === 'place'
          ? this.placeTags(place).join(', ')
          : this.mergeTagText(draft.tags, [scope, ...this.placeTags(place)]),
      };
    });
    if (closeSuggestions) {
      this.placeSuggestions.set([]);
    }
    this.placeSearchError.set(null);
  }

  private applyCountrySuggestion(country: string, closeSuggestions: boolean): void {
    this.cardDraft.update((draft) => ({
      ...draft,
      title: country,
      subtitle: $localize`Country`,
      type: draft.type === 'place' ? 'memory' : draft.type,
      scope: 'country',
      placeQuery: country,
      tags: this.mergeTagText(draft.tags, ['country', 'travel']),
    }));
    if (closeSuggestions) {
      this.placeSuggestions.set([]);
    }
    this.placeSearchHint.set(`Country card selected. Looking for a map link and photo for ${country}.`);
    this.placeSearchError.set(null);
  }

  private applyCitySuggestion(city: BoardCityOption, closeSuggestions: boolean): void {
    this.cardDraft.update((draft) => ({
      ...draft,
      title: city.name,
      subtitle: city.region || 'City',
      type: draft.type === 'place' ? 'memory' : draft.type,
      scope: 'city',
      placeQuery: city.name,
      placeCity: city.name,
      tags: this.mergeTagText(draft.tags, ['city', 'travel']),
    }));
    if (closeSuggestions) {
      this.placeSuggestions.set([]);
    }
    this.placeSearchHint.set(`City card selected from LivingWiki cities. Looking for a map link and photo for ${city.name}.`);
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
    if (draft.what3wordsAddress.trim() && !normalizeWhat3WordsAddress(draft.what3wordsAddress)) {
      this.imageUploadError.set($localize`Fix the what3words address before saving. Use exactly three words separated by periods.`);
      return;
    }
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can edit cards.`);
      return;
    }

    const now = new Date().toISOString();
    const songMode = this.isSongBoard(board);
    const rawTags = draft.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 6);
    const tags = songMode ? this.mergeWizardTags(rawTags, ['song', 'music']) : rawTags;
    const rating = Math.max(1, Math.min(5, Number.parseInt(draft.rating, 10) || 1));
    const editingId = this.editingCardId();
    const draftTour = songMode ? null : this.cardTourFromDraft(draft);
    const draftImages = this.cardDraftImages(draft);
    const imageUrl = draftImages[0] || (songMode ? draft.spotifyArtworkUrl.trim() : '');
    const imageUrls = this.uniqueImageUrls([imageUrl, ...draftImages]);
    const cardType = songMode ? 'note' : draft.type;
    const cardScope = songMode ? 'place' : draft.scope;
    const placeId = songMode ? '' : draft.placeId;
    const googleMapsUrl = songMode ? '' : draft.googleMapsUrl;
    const what3wordsAddress = songMode ? '' : normalizeWhat3WordsAddress(draft.what3wordsAddress);
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
                    type: cardType,
                    scope: cardScope,
                    status: draft.status,
                    rating,
                    imageUrl,
                    imageUrls,
                    audioPreviewUrl: draft.audioPreviewUrl.trim(),
                    spotifyTrackId: draft.spotifyTrackId.trim(),
                    spotifyTrackUrl: draft.spotifyTrackUrl.trim(),
                    spotifyUri: draft.spotifyUri.trim(),
                    spotifyArtistName: draft.spotifyArtistName.trim(),
                    spotifyAlbumName: draft.spotifyAlbumName.trim(),
                    spotifyArtworkUrl: draft.spotifyArtworkUrl.trim(),
                    placeId,
                    googleMapsUrl,
                    what3wordsAddress,
                    tags,
                    stickers: draft.stickers,
                    tour: songMode ? null : draftTour ?? card.tour ?? null,
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
                type: cardType,
                scope: cardScope,
                status: draft.status,
                rating,
                imageUrl,
                imageUrls,
                audioPreviewUrl: draft.audioPreviewUrl.trim(),
                spotifyTrackId: draft.spotifyTrackId.trim(),
                spotifyTrackUrl: draft.spotifyTrackUrl.trim(),
                spotifyUri: draft.spotifyUri.trim(),
                spotifyArtistName: draft.spotifyArtistName.trim(),
                spotifyAlbumName: draft.spotifyAlbumName.trim(),
                spotifyArtworkUrl: draft.spotifyArtworkUrl.trim(),
                placeId,
                googleMapsUrl,
                what3wordsAddress,
                tags,
                stickers: draft.stickers,
                tour: draftTour,
                relatedCards: [],
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

  deleteCard(card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.selectedBoard();
    if (!board) {
      return;
    }
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can delete cards.`);
      return;
    }
    this.cardDeleteCandidate.set({ boardId: board.id, boardTitle: board.title, card });
  }

  closeCardDeleteDialog(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.cardDeleteCandidate.set(null);
  }

  async confirmDeleteCard(event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const candidate = this.cardDeleteCandidate();
    if (!candidate) {
      return;
    }
    const board = this.boards().find((item) => item.id === candidate.boardId) ?? null;
    if (!board || !this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can delete cards.`);
      this.cardDeleteCandidate.set(null);
      return;
    }
    this.cardDeleteCandidate.set(null);

    if (this.isTourBoard(board) && candidate.card.tour) {
      const nextCards = normalizeTourCardSequences(
        board.cards.filter((card) => card.id !== candidate.card.id),
      );
      this.selectedCardIds.update((ids) => {
        const next = new Set(ids);
        next.delete(candidate.card.id);
        return next;
      });
      await this.saveTourCardMutation(board, nextCards, { deletedCardId: candidate.card.id });
      return;
    }

    const now = new Date().toISOString();
    let nextBoard: Board | null = null;
    this.boards.update((boards) =>
      boards.map((item) => {
        if (item.id !== board.id) {
          return item;
        }
        nextBoard = {
          ...item,
          cards: item.cards.filter((existing) => existing.id !== candidate.card.id),
          updatedAt: now,
        };
        return nextBoard;
      }),
    );
    if (nextBoard) {
      this.selectedCardIds.update((ids) => {
        const next = new Set(ids);
        next.delete(candidate.card.id);
        return next;
      });
      void this.persistAndReplaceBoard(nextBoard);
    }
  }

  isManagingBoard(boardId: string): boolean {
    return this.cardManageBoardId() === boardId;
  }

  toggleCardManageMode(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner or an admin can manage cards.`);
      return;
    }
    if (this.cardManageBoardId() === board.id) {
      this.closeCardManageMode();
      return;
    }
    this.cardManageBoardId.set(board.id);
    this.selectedCardIds.set(new Set());
    this.cardBulkDeleteCandidate.set(null);
    this.draggedCardId.set(null);
    this.cardDropTargetId.set(null);
    this.cardDropPosition.set(null);
  }

  closeCardManageMode(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.cardManageBoardId.set(null);
    this.selectedCardIds.set(new Set());
    this.cardBulkDeleteCandidate.set(null);
    this.draggedCardId.set(null);
    this.cardDropTargetId.set(null);
    this.cardDropPosition.set(null);
  }

  isCardSelected(cardId: string): boolean {
    return this.selectedCardIds().has(cardId);
  }

  isCardExpanded(cardId: string): boolean {
    return this.expandedCardIds().has(cardId);
  }

  canReorderCard(board: Board, cardId: string): boolean {
    return canReorderCardSurface(
      this.canEditBoard(board),
      board.cards.length,
      this.isCardExpanded(cardId),
      this.isCardFlipped(cardId),
    );
  }

  toggleCardExpanded(cardId: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.expandedCardIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }

  isDraggingCard(cardId: string): boolean {
    return this.draggedCardId() === cardId;
  }

  isCardDropTarget(cardId: string): boolean {
    return this.cardDropTargetId() === cardId && this.draggedCardId() !== cardId;
  }

  isCardDropBefore(cardId: string): boolean {
    return this.isCardDropTarget(cardId) && this.cardDropPosition() === 'before';
  }

  isCardDropAfter(cardId: string): boolean {
    return this.isCardDropTarget(cardId) && this.cardDropPosition() === 'after';
  }

  isDraggingBoard(boardId: string): boolean {
    return this.draggedBoardId() === boardId;
  }

  isBoardDropTarget(boardId: string): boolean {
    return this.boardDropTargetId() === boardId && this.draggedBoardId() !== boardId;
  }

  isBoardDropBefore(boardId: string): boolean {
    return this.isBoardDropTarget(boardId) && this.boardDropPosition() === 'before';
  }

  isBoardDropAfter(boardId: string): boolean {
    return this.isBoardDropTarget(boardId) && this.boardDropPosition() === 'after';
  }

  toggleCardSelection(cardId: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.selectedCardIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }

  beginCardReorderDrag(event: DragEvent, board: Board, card: BoardCard): void {
    if (!this.canEditBoard(board) || board.cards.length < 2 || this.tourRouteUpdating()) {
      event.preventDefault();
      return;
    }
    if (this.isBlockedCardReorderDragTarget(event.target)) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    this.draggedCardId.set(card.id);
    this.cardDropTargetId.set(null);
    this.cardDropPosition.set(null);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.id);
    }
  }

  dragCardOver(event: DragEvent, board: Board, card: BoardCard): void {
    if (!this.canEditBoard(board) || !this.draggedCardId() || this.tourRouteUpdating()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.cardDropTargetId.set(card.id);
    this.cardDropPosition.set(
      card.id === this.draggedCardId() ? null : this.reorderDropPosition(event),
    );
  }

  dragCardLeave(event: DragEvent, card: BoardCard): void {
    if (
      event.currentTarget instanceof HTMLElement
      && event.relatedTarget instanceof Node
      && event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    if (this.cardDropTargetId() === card.id) {
      this.cardDropTargetId.set(null);
      this.cardDropPosition.set(null);
    }
  }

  async dropCardOnCard(event: DragEvent, board: Board, targetCard: BoardCard): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (!this.canEditBoard(board)) {
      this.clearCardReorderDrag();
      return;
    }
    const draggedId = this.draggedCardId() || event.dataTransfer?.getData('text/plain') || '';
    if (!draggedId || draggedId === targetCard.id) {
      this.clearCardReorderDrag();
      return;
    }

    const currentBoard = this.boards().find((item) => item.id === board.id);
    if (!currentBoard) {
      this.clearCardReorderDrag();
      return;
    }

    const dropPosition = this.cardDropTargetId() === targetCard.id
      ? this.cardDropPosition() ?? this.reorderDropPosition(event)
      : this.reorderDropPosition(event);
    const draggedCard = currentBoard.cards.find((card) => card.id === draggedId) ?? null;
    if (this.isTourBoard(currentBoard) && draggedCard?.tour && targetCard.tour) {
      const nextCards = reorderTourCards(
        currentBoard.cards,
        draggedId,
        targetCard.id,
        dropPosition,
      );
      this.clearCardReorderDrag();
      await this.saveTourCardOrder(currentBoard, nextCards);
      return;
    }
    const nextCards = reorderRelativeToTarget(
      currentBoard.cards,
      draggedId,
      targetCard.id,
      dropPosition,
      (card) => card.id,
    );
    if (nextCards.every((card, index) => card.id === currentBoard.cards[index]?.id)) {
      this.clearCardReorderDrag();
      return;
    }

    const now = new Date().toISOString();
    const nextBoard: Board = { ...currentBoard, cards: nextCards, updatedAt: now };

    this.boards.update((boards) => boards.map((item) => item.id === nextBoard.id ? nextBoard : item));
    this.clearCardReorderDrag();
    await this.persistAndReplaceBoard(nextBoard);
  }

  async moveTourStop(card: BoardCard, direction: -1 | 1, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.originalSelectedBoard();
    if (!this.isTourBoard(board) || !card.tour || !this.canEditBoard(board) || this.tourRouteUpdating()) {
      return;
    }
    const nextCards = moveTourCard(board.cards, card.id, direction);
    if (tourOrderIds(nextCards).every((id, index) => id === tourOrderIds(board.cards)[index])) {
      return;
    }
    await this.saveTourCardOrder(board, nextCards);
  }

  canMoveTourStop(card: BoardCard, direction: -1 | 1): boolean {
    const board = this.originalSelectedBoard();
    if (!this.isTourBoard(board) || !card.tour || !this.canEditBoard(board) || this.tourRouteUpdating()) {
      return false;
    }
    const cards = this.tourCards(board);
    const index = cards.findIndex((item) => item.id === card.id);
    return index >= 0 && index + direction >= 0 && index + direction < cards.length;
  }

  private async saveTourCardOrder(board: Board, reorderedCards: BoardCard[]): Promise<void> {
    await this.saveTourCardMutation(board, reorderedCards);
  }

  private async saveTourCardMutation(
    board: Board,
    reorderedCards: BoardCard[],
    mutation: TourRouteMutation = {},
  ): Promise<boolean> {
    if (!this.isTourBoard(board) || !this.canEditBoard(board) || this.tourRouteUpdating()) {
      return false;
    }
    const orderedCardIds = tourOrderIds(reorderedCards);

    const previousBoard = board;
    const now = new Date().toISOString();
    const optimisticBoard: Board = {
      ...board,
      cards: reorderedCards,
      tourMeta: board.tourMeta ? {
        ...board.tourMeta,
        totalDistanceText: '',
        totalDurationText: '',
        routePolyline: '',
      } : null,
      updatedAt: now,
    };
    this.tourRouteUpdating.set(true);
    this.tourRouteError.set(null);
    this.boards.update((boards) => boards.map((item) => item.id === board.id ? optimisticBoard : item));

    try {
      if (!this.functions) {
        throw new Error($localize`Route recalculation is unavailable.`);
      }
      const callable = httpsCallable<
        {
          boardId: string;
          orderedCardIds: string[];
          baseUpdatedAt: string;
          addedCard?: BoardCard;
          deletedCardId?: string;
          deletedCardIds?: string[];
        },
        { cards?: unknown[]; tourMeta?: unknown; updatedAt?: string }
      >(this.functions, 'recalculateBoardTourRoute', { timeout: 90_000 });
      const response = await callable({
        boardId: board.id,
        orderedCardIds,
        baseUpdatedAt: board.updatedAt,
        ...(mutation.addedCard ? { addedCard: mutation.addedCard } : {}),
        ...(mutation.deletedCardId ? { deletedCardId: mutation.deletedCardId } : {}),
        ...(mutation.deletedCardIds?.length ? { deletedCardIds: mutation.deletedCardIds } : {}),
      });
      const cards = Array.isArray(response.data?.cards)
        ? response.data.cards
          .map((card) => this.cardFromRecord(card))
          .filter((card): card is BoardCard => !!card)
        : [];
      if (cards.length !== reorderedCards.length || tourOrderIds(cards).join('|') !== orderedCardIds.join('|')) {
        throw new Error($localize`The updated tour route was incomplete.`);
      }
      const tourMeta = this.normalizeTourMeta(response.data?.tourMeta);
      if (!tourMeta) {
        throw new Error($localize`The updated tour summary was incomplete.`);
      }
      const savedBoard: Board = {
        ...board,
        cards,
        tourMeta,
        updatedAt: typeof response.data?.updatedAt === 'string' ? response.data.updatedAt : now,
      };
      this.boards.update((boards) => boards.map((item) => item.id === board.id ? savedBoard : item));
      this.boardsSyncError.set(null);
      return true;
    } catch (error) {
      console.error('Tour route reorder failed', error, { boardId: board.id, orderedCardIds });
      this.boards.update((boards) => boards.map((item) =>
        item.id === board.id && item.updatedAt === optimisticBoard.updatedAt ? previousBoard : item));
      const message = error instanceof FirebaseError && error.code === 'functions/failed-precondition'
        ? $localize`This tour changed elsewhere. Reload it and try again.`
        : error instanceof Error && error.message
          ? error.message
          : $localize`The route could not be updated. Your previous order was restored.`;
      this.tourRouteError.set(message);
      return false;
    } finally {
      this.tourRouteUpdating.set(false);
    }
  }

  clearCardReorderDrag(): void {
    this.draggedCardId.set(null);
    this.cardDropTargetId.set(null);
    this.cardDropPosition.set(null);
  }

  beginBoardReorderDrag(event: DragEvent, board: Board): void {
    if (!this.canEditBoard(board) || this.filteredBoards().length < 2) {
      event.preventDefault();
      return;
    }
    if (this.isBlockedBoardReorderDragTarget(event.target)) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    this.suppressNextBoardOpen = true;
    this.draggedBoardId.set(board.id);
    this.boardDropTargetId.set(null);
    this.boardDropPosition.set(null);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', board.id);
    }
  }

  dragBoardOver(event: DragEvent, board: Board): void {
    if (!this.canEditBoard(board) || !this.draggedBoardId()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.boardDropTargetId.set(board.id);
    this.boardDropPosition.set(
      board.id === this.draggedBoardId() ? null : this.reorderDropPosition(event),
    );
  }

  dragBoardLeave(event: DragEvent, board: Board): void {
    if (
      event.currentTarget instanceof HTMLElement
      && event.relatedTarget instanceof Node
      && event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    if (this.boardDropTargetId() === board.id) {
      this.boardDropTargetId.set(null);
      this.boardDropPosition.set(null);
    }
  }

  async dropBoardOnBoard(event: DragEvent, targetBoard: Board): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (!this.canEditBoard(targetBoard)) {
      this.clearBoardReorderDrag();
      return;
    }
    const draggedId = this.draggedBoardId() || event.dataTransfer?.getData('text/plain') || '';
    if (!draggedId || draggedId === targetBoard.id) {
      this.clearBoardReorderDrag();
      return;
    }

    const orderedBoards = [...this.boards()].sort((left, right) => this.compareBoards(left, right));
    const draggedBoard = orderedBoards.find((board) => board.id === draggedId);
    const currentTargetBoard = orderedBoards.find((board) => board.id === targetBoard.id);
    if (!draggedBoard || !currentTargetBoard || !this.canEditBoard(draggedBoard)) {
      this.clearBoardReorderDrag();
      return;
    }

    const dropPosition = this.boardDropTargetId() === targetBoard.id
      ? this.boardDropPosition() ?? this.reorderDropPosition(event)
      : this.reorderDropPosition(event);
    const reorderedBoards = reorderRelativeToTarget(
      orderedBoards,
      draggedId,
      targetBoard.id,
      dropPosition,
      (board) => board.id,
    );
    const nextSortOrder = insertionSortOrder(
      reorderedBoards,
      draggedId,
      (board) => board.id,
      (board) => this.boardSortOrder(board),
    );
    if (nextSortOrder === null) {
      const now = new Date().toISOString();
      const normalizedBoards = reorderedBoards.map((board, index) => ({
        ...board,
        sortOrder: index,
        updatedAt: board.sortOrder === index ? board.updatedAt : now,
      }));
      const originalBoardsById = new Map(orderedBoards.map((board) => [board.id, board]));
      const replacements = new Map(normalizedBoards.map((board) => [board.id, board]));
      this.boards.update((boards) => boards.map((board) => replacements.get(board.id) ?? board));
      this.clearBoardReorderDrag();
      await Promise.all(
        normalizedBoards
          .filter((board) =>
            this.canEditBoard(board) && originalBoardsById.get(board.id)?.sortOrder !== board.sortOrder)
          .map((board) => this.persistAndReplaceBoard(board)),
      );
      return;
    }

    const nextDraggedBoard = {
      ...draggedBoard,
      sortOrder: nextSortOrder,
      updatedAt: new Date().toISOString(),
    };
    this.boards.update((boards) =>
      boards.map((board) => board.id === nextDraggedBoard.id ? nextDraggedBoard : board));
    this.clearBoardReorderDrag();
    await this.persistAndReplaceBoard(nextDraggedBoard);
  }

  clearBoardReorderDrag(): void {
    this.draggedBoardId.set(null);
    this.boardDropTargetId.set(null);
    this.boardDropPosition.set(null);
    if (this.suppressNextBoardOpen && this.isBrowser) {
      window.setTimeout(() => {
        this.suppressNextBoardOpen = false;
      }, 250);
    }
  }

  private isBlockedCardReorderDragTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return Boolean(target.closest('a, button, input, textarea, select, label, .detail-card__sticker'));
  }

  private isBlockedBoardReorderDragTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return Boolean(target.closest('.board-square__tools, .board-sticker, a, input, textarea, select, label'));
  }

  private reorderDropPosition(event: DragEvent): ReorderDropPosition {
    if (!this.isBrowser || !(event.currentTarget instanceof HTMLElement)) {
      return 'after';
    }
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const parent = target.parentElement;
    const columns = parent
      ? window.getComputedStyle(parent).gridTemplateColumns.split(/\s+/).filter(Boolean).length
      : 1;
    const useVerticalEdge = columns <= 1;
    const pointer = useVerticalEdge ? event.clientY : event.clientX;
    const midpoint = useVerticalEdge
      ? rect.top + rect.height / 2
      : rect.left + rect.width / 2;
    return pointer < midpoint ? 'before' : 'after';
  }

  selectAllVisibleCards(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.selectedCardIds.set(new Set(this.filteredCards().map((card) => card.id)));
  }

  clearCardSelection(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.selectedCardIds.set(new Set());
  }

  openBulkDeleteCards(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner or an admin can delete cards.`);
      return;
    }
    const ids = this.selectedCardIds();
    const cards = board.cards.filter((card) => ids.has(card.id));
    if (!cards.length) {
      return;
    }
    this.cardBulkDeleteCandidate.set({ boardId: board.id, boardTitle: board.title, cards });
  }

  closeBulkCardDeleteDialog(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.cardBulkDeleteCandidate.set(null);
  }

  async confirmBulkDeleteCards(event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const candidate = this.cardBulkDeleteCandidate();
    if (!candidate) {
      return;
    }
    const board = this.boards().find((item) => item.id === candidate.boardId) ?? null;
    if (!board || !this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner or an admin can delete cards.`);
      this.cardBulkDeleteCandidate.set(null);
      return;
    }

    const deleteIds = new Set(candidate.cards.map((card) => card.id));
    if (this.isTourBoard(board) && candidate.cards.some((card) => !!card.tour)) {
      const nextCards = normalizeTourCardSequences(
        board.cards.filter((card) => !deleteIds.has(card.id)),
      );
      this.selectedCardIds.update((ids) => {
        const next = new Set(ids);
        deleteIds.forEach((id) => next.delete(id));
        return next;
      });
      this.cardBulkDeleteCandidate.set(null);
      if (!nextCards.length) {
        this.closeCardManageMode();
      }
      await this.saveTourCardMutation(board, nextCards, {
        deletedCardIds: Array.from(deleteIds),
      });
      return;
    }
    const now = new Date().toISOString();
    const nextBoard = {
      ...board,
      cards: board.cards.filter((card) => !deleteIds.has(card.id)),
      updatedAt: now,
    };
    this.boards.update((boards) => boards.map((item) => item.id === board.id ? nextBoard : item));
    this.selectedCardIds.update((ids) => {
      const next = new Set(ids);
      deleteIds.forEach((id) => next.delete(id));
      return next;
    });
    this.cardBulkDeleteCandidate.set(null);
    if (!nextBoard.cards.length) {
      this.closeCardManageMode();
    }
    void this.persistAndReplaceBoard(nextBoard);
  }

  deleteGalleryCard(boardId: string, card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.boards().find((item) => item.id === boardId);
    if (!board || !this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can delete cards.`);
      return;
    }
    this.cardDeleteCandidate.set({ boardId: board.id, boardTitle: board.title, card });
  }

  updateBoardDraft<K extends keyof BoardDraft>(field: K, value: BoardDraft[K]): void {
    this.boardDraft.update((draft) => ({ ...draft, [field]: value }));
  }

  setBoardDraftVisibility(visibility: BoardVisibility): void {
    if (visibility === 'private' && !this.canUsePrivateBoards()) {
      this.redirectToPrivateBoardsPricing();
      return;
    }
    this.updateBoardDraft('visibility', visibility);
  }

  updateCardDraft<K extends keyof CardDraft>(field: K, value: CardDraft[K]): void {
    this.cardDraft.update((draft) => ({ ...draft, [field]: value }));
  }

  isTourWizardMode(mode = this.wizardMode()): mode is 'walking-tour' | 'driving-tour' {
    return mode === 'walking-tour' || mode === 'driving-tour';
  }

  wizardTourModeLabel(): string {
    return this.wizardMode() === 'driving-tour' ? 'Driving tour' : 'Walking tour';
  }

  wizardTourStyleLabel(): string {
    return this.wizardMode() === 'driving-tour' ? 'Route style' : 'Walking pace';
  }

  wizardTourStyleOptions(): string[] {
    return this.wizardMode() === 'driving-tour' ? DRIVING_ROUTE_OPTIONS : WALKING_PACE_OPTIONS;
  }

  wizardTourExtraOptions(): string[] {
    return this.wizardMode() === 'driving-tour' ? DRIVING_TOUR_EXTRAS : WALKING_TOUR_EXTRAS;
  }

  toggleWizardTourExtra(extra: string): void {
    this.wizardTourExtras.update((extras) => {
      const next = new Set(extras);
      if (next.has(extra)) {
        next.delete(extra);
      } else {
        next.add(extra);
      }
      return next;
    });
  }

  isWizardTourExtraSelected(extra: string): boolean {
    return this.wizardTourExtras().has(extra);
  }

  isTourBoard(board: Board | null): board is Board & { kind: 'walking-tour' | 'driving-tour' } {
    return !!board && (board.kind === 'walking-tour' || board.kind === 'driving-tour');
  }

  tourCards(board: Board | null): BoardCard[] {
    if (!board) {
      return [];
    }
    return orderedTourCards(board.cards);
  }

  private cardsInTourDisplayOrder(cards: readonly BoardCard[]): BoardCard[] {
    const tourCards = orderedTourCards(cards);
    let tourIndex = 0;
    return cards.map((card) => card.tour ? tourCards[tourIndex++] ?? card : card);
  }

  setTourBoardView(view: TourBoardView, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.tourBoardView() === view) {
      return;
    }
    this.tourBoardView.set(view);
    this.tourRouteError.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: view === 'cards' ? 'cards' : null },
      queryParamsHandling: 'merge',
    });
  }

  songCards(board: Board | null): BoardCard[] {
    if (!board) {
      return [];
    }
    return board.cards.filter((card) => this.isSongCard(card));
  }

  selectSongCard(index: number, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.stopSongPreview();
    const lastIndex = Math.max(0, this.selectedSongCards().length - 1);
    this.songDeckIndex.set(Math.max(0, Math.min(index, lastIndex)));
  }

  stepSongCard(direction: number, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const count = this.selectedSongCards().length;
    if (!count) {
      return;
    }
    this.stopSongPreview();
    this.songDeckIndex.update((index) => (index + direction + count) % count);
  }

  songCardPositionLabel(): string {
    const count = this.selectedSongCards().length;
    if (!count) {
      return '0 / 0';
    }
    return `${Math.max(0, Math.min(this.songDeckIndex(), count - 1)) + 1} / ${count}`;
  }

  songArtwork(card: BoardCard, board: Board): string {
    return card.spotifyArtworkUrl || card.imageUrl || board.imageUrl || board.logoUrl || '';
  }

  songArtistLabel(card: BoardCard): string {
    return card.spotifyArtistName || card.subtitle || 'LivingWiki track';
  }

  songAlbumLabel(card: BoardCard): string {
    return card.spotifyAlbumName || card.notes || 'Open your music service for full playback when available.';
  }

  playSongHere(
    card: BoardCard,
    board: Board | null = this.selectedBoard(),
    event?: Event,
  ): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.stopSongPreview();
    this.spotify.openEmbeddedPlayer(this.spotifyTrackForCard(card, board));
  }

  nextTourCard(card: BoardCard, cards = this.selectedBoardTourCards()): BoardCard | null {
    const index = cards.findIndex((item) => item.id === card.id);
    return index >= 0 ? cards[index + 1] ?? null : null;
  }

  tourLegToNext(card: BoardCard, nextCard: BoardCard | null): BoardTourLeg | null {
    const leg = card.tour?.legToNext ?? null;
    if (!leg || !nextCard) {
      return null;
    }
    if (leg.toCardId) {
      return leg.toCardId === nextCard.id ? leg : null;
    }
    const nextTitle = this.normalizedTourRouteText(nextCard.title);
    const legText = this.normalizedTourRouteText(`${leg.instruction} ${leg.navScript}`);
    return nextTitle.length >= 4 && legText.includes(nextTitle) ? leg : null;
  }

  toggleTourWayfinders(): void {
    this.tourWayfindersShown.update((shown) => !shown);
  }

  tourModeIcon(board: Board): string {
    return board.kind === 'driving-tour' ? 'directions_car' : 'directions_walk';
  }

  tourModeText(board: Board): string {
    return board.kind === 'driving-tour' ? 'Driving tour' : 'Walking tour';
  }

  tourRouteUrl(board: Board): string {
    const cards = this.tourCards(board).filter((card) => this.hasTourCoordinates(card));
    if (cards.length < 2) {
      return 'https://www.google.com/maps';
    }
    const origin = this.tourCoordinateQuery(cards[0]);
    const destination = this.tourCoordinateQuery(cards[cards.length - 1]);
    const waypoints = cards.slice(1, -1).map((card) => this.tourCoordinateQuery(card)).join('|');
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('origin', origin);
    url.searchParams.set('destination', destination);
    if (waypoints) {
      url.searchParams.set('waypoints', waypoints);
    }
    url.searchParams.set('travelmode', board.kind === 'driving-tour' ? 'driving' : 'walking');
    return url.toString();
  }

  tourLegDirectionsUrl(board: Board, card: BoardCard): string {
    const next = this.nextTourCard(card, this.tourCards(board));
    if (!next || !this.hasTourCoordinates(card) || !this.hasTourCoordinates(next)) {
      return card.googleMapsUrl || this.tourRouteUrl(board);
    }
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('origin', this.tourCoordinateQuery(card));
    url.searchParams.set('destination', this.tourCoordinateQuery(next));
    url.searchParams.set('travelmode', board.kind === 'driving-tour' ? 'driving' : 'walking');
    return url.toString();
  }

  tourMapEmbedUrl(board: Board): SafeResourceUrl {
    const cards = this.tourCards(board).filter((card) => this.hasTourCoordinates(card));
    if (!cards.length) {
      return this.safeMapSearchUrl(board.title, 12);
    }
    const query = cards.map((card) => this.tourCoordinateQuery(card)).join(' to ');
    return this.safeMapSearchUrl(query, board.kind === 'driving-tour' ? 11 : 14);
  }

  tourLegMapEmbedUrl(card: BoardCard, next: BoardCard | null): SafeResourceUrl {
    const query = next && this.hasTourCoordinates(card) && this.hasTourCoordinates(next)
      ? `${this.tourCoordinateQuery(card)} to ${this.tourCoordinateQuery(next)}`
      : card.tour?.address || card.subtitle || card.title;
    return this.safeMapSearchUrl(query, 15);
  }

  openTourGuide(stopIndex = 0): void {
    const frames = this.tourDeckFrames();
    if (!frames.length) {
      return;
    }
    this.tourDeckIndex.set(Math.max(0, Math.min(stopIndex, frames.length - 1)));
    this.tourGuideOpen.set(true);
    void this.speakTourFrame();
  }

  openTourGuideForCard(card: BoardCard): void {
    const frameIndex = this.tourDeckFrames().findIndex((frame) => frame.kind === 'stop' && frame.card.id === card.id);
    this.openTourGuide(Math.max(0, frameIndex));
  }

  closeTourGuide(): void {
    this.stopTourSpeech();
    this.tourGuideOpen.set(false);
  }

  tourGuideStep(direction: number): void {
    const count = this.tourDeckFrames().length;
    if (!count) {
      return;
    }
    this.tourDeckIndex.update((index) => Math.max(0, Math.min(count - 1, index + direction)));
    void this.speakTourFrame();
  }

  replayTourFrame(): void {
    void this.speakTourFrame();
  }

  async speakTourFrame(frame = this.tourCurrentFrame()): Promise<void> {
    if (!this.isBrowser || !frame) {
      return;
    }
    const text = frame.kind === 'leg'
      ? frame.card.tour?.legToNext?.navScript || frame.card.tour?.legToNext?.instruction || ''
      : frame.card.tour?.guideScript || frame.card.notes || frame.card.subtitle;
    if (!text.trim()) {
      return;
    }
    this.stopTourSpeech();
    this.tourAudioNotice.set(null);
    const audioUrl = await this.ensureTourAudioUrl(this.tourAudioKey(frame), text);
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      this.tourAudio = audio;
      this.tourSpeechPlaying.set(true);
      audio.onended = () => this.stopTourSpeech();
      audio.onerror = () => {
        this.stopTourSpeech();
        this.tourAudioNotice.set('The ElevenLabs narrator could not play this clip. Try Preview voice again.');
      };
      try {
        await audio.play();
        return;
      } catch {
        this.stopTourSpeech();
        this.tourAudioNotice.set('The ElevenLabs narrator was blocked by the browser. Try Preview voice again.');
      }
    }
    this.tourAudioNotice.set('ElevenLabs tour narration is unavailable right now. Check the deployed function and ELEVENLABS_API_KEY.');
  }

  async focusTourStop(card: BoardCard, playPreview = true): Promise<void> {
    this.selectedTourCardId.set(card.id);
    this.updateTourMarkerStates();
    const frameIndex = this.tourDeckFrames().findIndex((frame) => frame.kind === 'stop' && frame.card.id === card.id);
    if (frameIndex >= 0) {
      this.tourDeckIndex.set(frameIndex);
    }
    if (this.isBrowser) {
      window.document.getElementById(`tour-stop-${card.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (playPreview) {
      this.tourGuideOpen.set(true);
      await this.speakTourFrame(this.tourCurrentFrame());
    }
  }

  stopTourSpeech(): void {
    if (this.tourAudio) {
      this.tourAudio.pause();
      this.tourAudio.currentTime = 0;
      this.tourAudio.onended = null;
      this.tourAudio.onerror = null;
      this.tourAudio.onloadedmetadata = null;
      this.tourAudio = null;
    }
    if (this.tourSpeechUtterance) {
      this.tourSpeechUtterance.onend = null;
      this.tourSpeechUtterance.onerror = null;
      this.tourSpeechUtterance = null;
    }
    if (this.isBrowser && typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.cancel();
    }
    this.tourAudioLoadingKey.set(null);
    this.tourSpeechPlaying.set(false);
  }

  isSongPreviewPlaying(card: Pick<BoardCard, 'id'> | BoardWizardPreviewCard, context = 'card'): boolean {
    return this.songPreviewPlayingKey() === this.songPreviewKey(card.id, context);
  }

  async toggleSongPreview(
    card: Pick<BoardCard, 'id' | 'title' | 'audioPreviewUrl'> | BoardWizardPreviewCard,
    event?: Event,
    context = 'card',
  ): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const audioPreviewUrl = (card.audioPreviewUrl ?? '').trim();
    if (!this.isBrowser || !audioPreviewUrl) {
      return;
    }

    const key = this.songPreviewKey(card.id, context);
    if (this.songPreviewPlayingKey() === key) {
      if (context === 'stack-live') {
        this.stackLivePreviewAutoplay = false;
      }
      this.stopSongPreview();
      return;
    }

    this.stopSongPreview({ preserveStackLiveAutoplay: context === 'stack-live' });
    this.songPreviewError.set(null);
    const audio = new Audio(audioPreviewUrl);
    audio.loop = context !== 'stack-live';
    audio.preload = 'auto';
    this.songPreviewAudio = audio;
    this.songPreviewPlayingKey.set(key);
    audio.onended = () => {
      if (this.songPreviewAudio !== audio) {
        return;
      }
      if (context === 'stack-live' && this.stackLivePreviewAutoplay) {
        this.stopSongPreview({ preserveStackLiveAutoplay: true });
        this.advanceStackFrameToNextPlayablePreview();
        return;
      }
      this.stopSongPreview();
    };
    audio.onerror = () => {
      if (this.songPreviewAudio === audio) {
        this.stopSongPreview();
        this.songPreviewError.set(`Could not play the preview for "${card.title}".`);
      }
    };
    try {
      await audio.play();
      if (this.songPreviewAudio === audio && context === 'stack-live') {
        this.stackLivePreviewAutoplay = true;
      }
    } catch {
      if (this.songPreviewAudio === audio) {
        if (context === 'stack-live') {
          this.stackLivePreviewAutoplay = false;
        }
        this.stopSongPreview();
        this.songPreviewError.set(`Preview playback was blocked for "${card.title}". Tap play again.`);
      }
    }
  }

  stopSongPreview(options: { preserveStackLiveAutoplay?: boolean } = {}): void {
    if (!options.preserveStackLiveAutoplay) {
      this.stackLivePreviewAutoplay = false;
    }
    if (this.songPreviewAudio) {
      this.songPreviewAudio.pause();
      this.songPreviewAudio.currentTime = 0;
      this.songPreviewAudio.onended = null;
      this.songPreviewAudio.onerror = null;
      this.songPreviewAudio = null;
    }
    this.songPreviewPlayingKey.set(null);
  }

  private songPreviewKey(cardId: string, context: string): string {
    return `${context}:${cardId}`;
  }

  private syncStackLivePreviewAfterFrameChange(): void {
    if (!this.isBrowser || !this.stackLivePreviewAutoplay || !this.stackDirectView()) {
      return;
    }
    const token = ++this.stackLivePreviewSwitchToken;
    window.setTimeout(() => {
      if (token !== this.stackLivePreviewSwitchToken || !this.stackLivePreviewAutoplay || !this.stackDirectView()) {
        return;
      }
      const frame = this.stackCurrentFrame();
      const card = frame.kind === 'card' ? frame.card : null;
      if (!card?.audioPreviewUrl) {
        this.stopSongPreview({ preserveStackLiveAutoplay: true });
        return;
      }
      const key = this.songPreviewKey(card.id, 'stack-live');
      if (this.songPreviewPlayingKey() === key) {
        return;
      }
      void this.toggleSongPreview(card, undefined, 'stack-live');
    }, 0);
  }

  private advanceStackFrameToNextPlayablePreview(): void {
    const count = this.stackFrameCount();
    if (!count) {
      return;
    }
    const startIndex = this.stackFrameIndex();
    for (let offset = 1; offset <= count; offset += 1) {
      const candidateIndex = (startIndex + offset) % count;
      const frame = this.stackFrameAtIndex(candidateIndex);
      const card = frame.kind === 'card' ? frame.card : null;
      if (card?.audioPreviewUrl) {
        this.stackFrameIndex.set(candidateIndex);
        this.syncStackLivePreviewAfterFrameChange();
        return;
      }
    }
    this.stackLivePreviewAutoplay = false;
  }

  cardDraftPreviewCard(): Pick<BoardCard, 'id' | 'title' | 'audioPreviewUrl'> {
    const draft = this.cardDraft();
    return {
      id: this.editingCardId() ?? 'card-draft',
      title: draft.title || 'Card draft',
      audioPreviewUrl: draft.audioPreviewUrl,
    };
  }

  private async enrichBoardSpotify(board: Board): Promise<void> {
    if (!this.functions || this.spotifyEnrichedBoardIds.has(board.id) || this.spotifyEnrichmentInFlightBoardIds.has(board.id)) {
      return;
    }
    const candidates = board.cards.filter((card) => this.isSongCard(card) && (!card.spotifyTrackId || !card.audioPreviewUrl)).slice(0, 40);
    if (!candidates.length) {
      this.spotifyEnrichedBoardIds.add(board.id);
      return;
    }
    this.spotifyEnrichmentInFlightBoardIds.add(board.id);
    try {
      const callable = httpsCallable<
        { boardTitle: string; cards: Array<Record<string, unknown>> },
        { cards?: unknown[] }
      >(this.functions, 'resolveBoardSongSpotify', { timeout: 60_000 });
      const response = await callable({
        boardTitle: board.title,
        cards: candidates.map((card) => ({
          title: card.title,
          subtitle: card.subtitle,
          notes: card.notes,
          tags: card.tags,
          audioPreviewUrl: card.audioPreviewUrl,
          spotifyTrackId: card.spotifyTrackId,
          spotifyTrackUrl: card.spotifyTrackUrl,
          spotifyUri: card.spotifyUri,
          spotifyArtistName: card.spotifyArtistName,
          spotifyAlbumName: card.spotifyAlbumName,
          spotifyArtworkUrl: card.spotifyArtworkUrl,
        })),
      });
      const resolved = Array.isArray(response.data?.cards)
        ? response.data.cards.map((item) => this.normalizeSpotifyResolvedCard(item))
        : [];
      const resolvedByCardId = new Map<string, SpotifyResolvedCard>();
      candidates.forEach((card, index) => {
        const match = resolved[index];
        if (match?.spotifyTrackId || match?.audioPreviewUrl) {
          resolvedByCardId.set(card.id, match);
        }
      });
      if (!resolvedByCardId.size) {
        return;
      }
      this.spotifyEnrichedBoardIds.add(board.id);
      const now = new Date().toISOString();
      const nextBoard: Board = {
        ...board,
        cards: board.cards.map((card) => {
          const spotify = resolvedByCardId.get(card.id);
          if (!spotify) {
            return card;
          }
          return {
            ...card,
            spotifyTrackId: card.spotifyTrackId || spotify.spotifyTrackId,
            spotifyTrackUrl: card.spotifyTrackUrl || spotify.spotifyTrackUrl,
            spotifyUri: card.spotifyUri || spotify.spotifyUri,
            spotifyArtistName: card.spotifyArtistName || spotify.spotifyArtistName,
            spotifyAlbumName: card.spotifyAlbumName || spotify.spotifyAlbumName,
            spotifyArtworkUrl: card.spotifyArtworkUrl || spotify.spotifyArtworkUrl,
            audioPreviewUrl: card.audioPreviewUrl || spotify.audioPreviewUrl,
            updatedAt: now,
          };
        }),
        updatedAt: now,
      };
      this.boards.update((boards) => boards.map((item) => (item.id === nextBoard.id ? nextBoard : item)));
      if (this.canEditBoard(nextBoard)) {
        await this.persistAndReplaceBoard(nextBoard);
      }
    } catch (error) {
      console.warn('Spotify board enrichment failed', error, { boardId: board.id });
    } finally {
      this.spotifyEnrichmentInFlightBoardIds.delete(board.id);
    }
  }

  private normalizeSpotifyResolvedCard(value: unknown): SpotifyResolvedCard | null {
    const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const spotifyTrackId = this.stringValue(data['spotifyTrackId'], '', 120);
    const audioPreviewUrl = this.stringValue(data['audioPreviewUrl'], '', 2000);
    if (!spotifyTrackId && !audioPreviewUrl) {
      return null;
    }
    return {
      audioPreviewUrl,
      spotifyTrackId,
      spotifyTrackUrl: this.stringValue(data['spotifyTrackUrl'], '', 2000),
      spotifyUri: this.stringValue(data['spotifyUri'], '', 240),
      spotifyArtistName: this.stringValue(data['spotifyArtistName'], '', 180),
      spotifyAlbumName: this.stringValue(data['spotifyAlbumName'], '', 180),
      spotifyArtworkUrl: this.stringValue(data['spotifyArtworkUrl'], '', 2000),
    };
  }

  private async ensureTourAudioUrl(key: string, text: string): Promise<string | null> {
    const cached = this.tourAudioUrls.get(key);
    if (cached) {
      return cached;
    }
    const pending = this.tourAudioPromises.get(key);
    if (pending) {
      this.tourAudioLoadingKey.set(key);
      return pending;
    }
    const functions = this.functions;
    if (!functions) {
      return null;
    }
    this.tourAudioLoadingKey.set(key);
    const promise = (async () => {
      try {
        const callable = httpsCallable<
          { text: string; question?: string | null; anonymousVisitorId?: string | null; mode?: 'recap' | 'full' | 'tour' },
          TourSpeechResponse
        >(functions, 'synthesizeChatAnswerSpeech', { timeout: 120_000 });
        const response = await callable({
          text: text.slice(0, 3600),
          question: $localize`Read this LivingWiki tour preview aloud with a lively human tour-guide voice.`,
          anonymousVisitorId: this.authService.uid() ? null : this.ensureTourAnonymousVisitorId(),
          mode: 'tour',
        });
        const audioUrl = response.data.audioUrl || (response.data.audioBase64 ? this.audioUrlFromBase64(response.data.audioBase64, response.data.contentType || 'audio/mpeg') : '');
        if (audioUrl) {
          this.tourAudioUrls.set(key, audioUrl);
          return audioUrl;
        }
      } catch {
        this.tourAudioNotice.set('ElevenLabs tour narration failed to generate. Check the function logs if this persists.');
      } finally {
        this.tourAudioPromises.delete(key);
        if (this.tourAudioLoadingKey() === key) {
          this.tourAudioLoadingKey.set(null);
        }
      }
      return null;
    })();
    this.tourAudioPromises.set(key, promise);
    return promise;
  }

  private tourAudioKey(frame: TourDeckFrame): string {
    return `${frame.kind}:${frame.card.id}:${frame.kind === 'leg' ? frame.nextCard?.id ?? 'end' : 'stop'}`;
  }

  private ensureTourAnonymousVisitorId(): string {
    const key = 'livingwiki-tour-audio-visitor';
    if (!this.isBrowser) {
      return this.createId();
    }
    const existing = window.localStorage.getItem(key);
    if (existing) {
      return existing;
    }
    const next = this.createId();
    window.localStorage.setItem(key, next);
    return next;
  }

  private audioUrlFromBase64(audioBase64: string, contentType: string): string {
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return URL.createObjectURL(new Blob([bytes], { type: contentType }));
  }

  private async renderTourMap(): Promise<void> {
    const board = this.selectedBoard();
    const element = this.tourMapElement;
    if (!this.isBrowser || !element || !this.isTourBoard(board)) {
      return;
    }
    const tourBoard = board;
    const tourCards = this.tourCards(tourBoard);
    const points = await this.resolveTourMapPoints(tourCards, tourBoard);
    if (!points.length) {
      element.innerHTML = '<div class="tour-board__map-empty">Map pins appear after stops resolve to places.</div>';
      return;
    }

    try {
      const google = await this.googleMapsService.loadMapLibraries();
      const maps = google.maps as typeof google.maps & Record<string, unknown>;
      if (this.tourMapBoardId !== tourBoard.id || !this.tourMap) {
        element.innerHTML = '';
        this.tourMap = new maps.Map(element, {
          mapId: this.googleMapsService.mapId(),
          disableDefaultUI: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
          zoom: tourBoard.kind === 'driving-tour' ? 11 : 14,
          center: points[0].position,
        });
        this.tourMapBoardId = tourBoard.id;
      }

      this.clearTourMapOverlays();
      const bounds = new maps.LatLngBounds();
      points.forEach((point) => {
        bounds.extend(point.position);
      });
      const Polyline = maps['Polyline'] as new (options: Record<string, unknown>) => unknown;
      const decodePath = maps.geometry?.encoding?.decodePath;
      const positionByCardId = new Map(points.map((point) => [point.card.id, point.position]));
      if (Polyline) {
        tourCards.forEach((card, index) => {
          const next = tourCards[index + 1];
          const fromPosition = positionByCardId.get(card.id);
          const toPosition = next ? positionByCardId.get(next.id) : null;
          if (!next || !fromPosition || !toPosition) {
            return;
          }
          const encodedPolyline = card.tour?.legToNext?.toCardId === next.id
            ? card.tour?.legToNext?.encodedPolyline
            : '';
          const decodedPath = encodedPolyline && decodePath ? decodePath(encodedPolyline) : [];
          const polyline = new Polyline({
            path: decodedPath.length > 1 ? decodedPath : [fromPosition, toPosition],
            map: this.tourMap,
            strokeColor: this.toneAccent(tourBoard.tone),
            strokeOpacity: encodedPolyline ? 0.92 : 0.68,
            strokeWeight: tourBoard.kind === 'driving-tour' ? 5 : 4,
          });
          this.tourMapPolylines.push(polyline);
        });
      }

      const AdvancedMarkerElement = maps.marker?.AdvancedMarkerElement;
      const Marker = maps['Marker'] as new (options: Record<string, unknown>) => unknown;
      points.forEach(({ card, position }) => {
        const markerContent = this.createTourMarkerElement(card);
        const marker = AdvancedMarkerElement
          ? new AdvancedMarkerElement({ map: this.tourMap, position, title: card.title, content: markerContent })
          : Marker
            ? new Marker({ map: this.tourMap, position, title: `${card.tour?.sequence}. ${card.title}` })
            : null;
        if (!marker) {
          return;
        }
        const addListener = (marker as { addListener?: (name: string, listener: () => void) => void }).addListener;
        addListener?.call(marker, 'click', () => void this.focusTourStop(card, true));
        this.tourMapMarkers.push(marker);
      });

      (this.tourMap as { fitBounds?: (bounds: unknown, padding?: number) => void }).fitBounds?.(bounds, 48);
    } catch {
      element.innerHTML = '<div class="tour-board__map-empty">Map could not load. Use Open route for Google Maps directions.</div>';
    }
  }

  private async resolveTourMapPoints(cards: BoardCard[], board: Board): Promise<TourMapPoint[]> {
    const directPoints = new Map<string, TourMapPoint>();
    const missingCards: BoardCard[] = [];

    for (const card of cards) {
      if (this.hasTourCoordinates(card)) {
        directPoints.set(card.id, {
          card,
          position: { lat: card.tour?.lat ?? 0, lng: card.tour?.lng ?? 0 },
        });
      } else {
        missingCards.push(card);
      }
    }

    const fallbackPoints = new Map<string, { lat: number; lng: number }>();
    if (missingCards.length) {
      const locations = missingCards.map((card) => {
        const query = [card.tour?.address, card.title, board.title].filter(Boolean).join(', ');
        return {
          name: card.id,
          search_query: query,
          address_hint: card.tour?.address || card.subtitle || null,
        };
      });
      try {
        const resolved = await this.googleMapsService.resolveLocations(locations, locations.length);
        resolved.forEach((location) => fallbackPoints.set(location.name, location.position));
      } catch {
        // If geocoding is unavailable, the map still renders all stored coordinates.
      }
    }

    return cards
      .map((card) => {
        const direct = directPoints.get(card.id);
        if (direct) {
          return direct;
        }
        const fallback = fallbackPoints.get(card.id);
        return fallback ? { card, position: fallback } : null;
      })
      .filter((point): point is TourMapPoint => !!point);
  }

  private clearTourMapOverlays(): void {
    for (const marker of this.tourMapMarkers) {
      const writable = marker as { map?: unknown; setMap?: (map: unknown | null) => void };
      if (typeof writable.setMap === 'function') {
        writable.setMap(null);
      } else {
        writable.map = null;
      }
    }
    this.tourMapMarkers = [];
    for (const polyline of this.tourMapPolylines) {
      (polyline as { setMap?: (map: unknown | null) => void }).setMap?.(null);
    }
    this.tourMapPolylines = [];
  }

  private createTourMarkerElement(card: BoardCard): HTMLElement {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'tour-map-marker';
    marker.dataset['cardId'] = card.id;
    marker.setAttribute('aria-label', `Preview stop ${card.tour?.sequence}: ${card.title}`);
    const label = document.createElement('span');
    label.textContent = String(card.tour?.sequence ?? '');
    marker.appendChild(label);
    if (this.selectedTourCardId() === card.id) {
      marker.classList.add('tour-map-marker--active');
    }
    marker.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.focusTourStop(card, true);
    });
    return marker;
  }

  private updateTourMarkerStates(): void {
    const selectedId = this.selectedTourCardId();
    this.tourMapElement?.querySelectorAll<HTMLElement>('.tour-map-marker').forEach((marker) => {
      marker.classList.toggle('tour-map-marker--active', marker.dataset['cardId'] === selectedId);
    });
  }

  async fixCurrentCard(): Promise<void> {
    const board = this.selectedBoard();
    const draft = this.cardDraft();
    if (!board || !this.editingCardId()) {
      return;
    }
    const likelySong = this.isSongBoard(board) || this.isLikelySongCardDraft(board, draft, '');
    await this.runCardWizard({
      forceImageLookup: true,
      preserveExistingImageOnMiss: true,
      promptOverride: [
        'Fix this saved card using the current title, subtitle, notes, tags, and board context.',
        'Recheck the image and return the most accurate image for this exact card.',
        likelySong
          ? 'This is a music/song board or card. If the song preview or Spotify metadata is missing, find and return the correct song media and preview URL.'
          : 'If this card is actually a song or album, also return any available song preview and Spotify metadata.',
        'Preserve the current card identity. Do not replace it with a different card.',
      ].join('\n'),
    });
  }

  openCardImageTool(mode: Exclude<CardImageToolMode, null>): void {
    if (this.cardImageToolMode() === mode) {
      this.cardImageToolMode.set(null);
      return;
    }
    const draft = this.cardDraft();
    this.cardImageToolMode.set(mode);
    this.cardImageToolError.set(null);
    if (mode === 'generate') {
      if (!this.cardImagePrompt().trim()) {
        this.cardImagePrompt.set(this.defaultCardImageGenerationPrompt(draft));
      }
      return;
    }
    if (!this.cardImageSearchQuery().trim()) {
      this.cardImageSearchQuery.set(this.defaultCardImageSearchQuery(draft));
    }
    if (!this.cardImageSearchResults().length && this.cardImageSearchQuery().trim().length >= 2) {
      void this.searchCardImages();
    }
  }

  async generateCardImage(): Promise<void> {
    const board = this.selectedBoard();
    const prompt = this.cardImagePrompt().trim();
    if (!board || !this.canEditBoard(board) || !this.functions || this.cardImageGenerating()) {
      return;
    }
    if (prompt.length < 3) {
      this.cardImageToolError.set($localize`Describe the picture you want.`);
      return;
    }
    const draft = this.cardDraft();
    this.cardImageGenerating.set(true);
    this.cardImageToolError.set(null);
    try {
      const callable = httpsCallable<
        {
          boardId: string;
          prompt: string;
          cardTitle: string;
          cardSubtitle: string;
          cardNotes: string;
          boardTitle: string;
          boardDescription: string;
        },
        { imageDataUrl?: string; model?: string }
      >(this.functions, 'generateBoardCardImage');
      const response = await callable({
        boardId: board.id,
        prompt,
        cardTitle: draft.title,
        cardSubtitle: draft.spotifyArtistName || draft.subtitle,
        cardNotes: draft.notes,
        boardTitle: board.title,
        boardDescription: board.description,
      });
      const imageDataUrl = response.data.imageDataUrl?.trim() ?? '';
      if (!imageDataUrl.startsWith('data:image/')) {
        throw new Error('Nano Banana returned no usable image.');
      }
      this.cardGeneratedImageUrl.set(imageDataUrl);
      this.cardGeneratedImageModel.set(response.data.model?.trim() ?? 'Nano Banana');
    } catch (error) {
      this.cardImageToolError.set(this.cardImageActionErrorMessage(error, $localize`Nano Banana could not generate this picture.`));
    } finally {
      this.cardImageGenerating.set(false);
    }
  }

  async searchCardImages(): Promise<void> {
    const board = this.selectedBoard();
    const query = this.cardImageSearchQuery().replace(/\s+/g, ' ').trim();
    if (!board || !this.canEditBoard(board) || !this.functions || this.cardImageSearchLoading()) {
      return;
    }
    if (query.length < 2) {
      this.cardImageToolError.set($localize`Enter something to search for.`);
      return;
    }
    this.cardImageSearchLoading.set(true);
    this.cardImageToolError.set(null);
    this.cardImageSearchResults.set([]);
    this.cardImageSearchIndex.set(0);
    try {
      const callable = httpsCallable<
        { boardId: string; query: string },
        { query?: string; results?: CardImageSearchResult[] }
      >(this.functions, 'searchBoardCardImages');
      const response = await callable({ boardId: board.id, query });
      const results = Array.isArray(response.data.results)
        ? response.data.results.filter((item) => !!item?.imageUrl && !!item?.thumbnailUrl && !!item?.token).slice(0, 8)
        : [];
      this.cardImageSearchResults.set(results);
      this.cardImageSearchIndex.set(0);
      if (!results.length) {
        this.cardImageToolError.set($localize`No usable pictures were found. Try a more specific search.`);
      }
    } catch (error) {
      this.cardImageSearchResults.set([]);
      this.cardImageToolError.set(this.cardImageActionErrorMessage(error, $localize`Picture search is unavailable right now.`));
    } finally {
      this.cardImageSearchLoading.set(false);
    }
  }

  selectCardImageSearchResult(index: number): void {
    if (index < 0 || index >= this.cardImageSearchResults().length) {
      return;
    }
    this.cardImageSearchIndex.set(index);
    this.cardImageToolError.set(null);
  }

  stepCardImageSearch(direction: -1 | 1): void {
    const count = this.cardImageSearchResults().length;
    if (count < 2) {
      return;
    }
    this.cardImageSearchIndex.update((index) => (index + direction + count) % count);
  }

  useGeneratedCardImage(): void {
    const imageDataUrl = this.cardGeneratedImageUrl();
    if (!imageDataUrl) {
      return;
    }
    this.applyCardImageSelection(imageDataUrl);
  }

  async useSearchedCardImage(): Promise<void> {
    const board = this.selectedBoard();
    const result = this.currentCardImageSearchResult();
    const query = this.cardImageSearchQuery().replace(/\s+/g, ' ').trim();
    if (!board || !result || !this.functions || this.cardImageApplying()) {
      return;
    }
    this.cardImageApplying.set(true);
    this.cardImageToolError.set(null);
    try {
      const callable = httpsCallable<
        { boardId: string; query: string; result: Omit<CardImageSearchResult, 'token'>; token: string },
        { imageDataUrl?: string }
      >(this.functions, 'importBoardCardImage');
      const { token, ...selected } = result;
      const response = await callable({ boardId: board.id, query, result: selected, token });
      const imageDataUrl = response.data.imageDataUrl?.trim() ?? '';
      if (!imageDataUrl.startsWith('data:image/')) {
        throw new Error('That picture could not be imported.');
      }
      this.applyCardImageSelection(imageDataUrl);
    } catch (error) {
      this.cardImageToolError.set(this.cardImageActionErrorMessage(error, $localize`That picture could not be used.`));
    } finally {
      this.cardImageApplying.set(false);
    }
  }

  cardImageSearchPosition(): string {
    const count = this.cardImageSearchResults().length;
    return count ? `${this.cardImageSearchIndex() + 1} / ${count}` : '';
  }

  private applyCardImageSelection(imageDataUrl: string): void {
    this.cardDraft.update((draft) => {
      const current = this.cardDraftImages(draft);
      const next = this.uniqueImageUrls([...current, imageDataUrl]).slice(0, 12);
      return { ...draft, imageUrl: next[0] ?? imageDataUrl, imageUrls: next };
    });
    this.cardImageLocked.set(true);
    this.cardImageToolMode.set(null);
    this.cardImageToolError.set(null);
    this.imageUploadError.set(null);
  }

  private defaultCardImageGenerationPrompt(draft: CardDraft): string {
    const subject = draft.title.trim() || draft.placeQuery.trim() || 'this card';
    if (this.isSongCardForm()) {
      const artist = draft.spotifyArtistName.trim() || draft.subtitle.trim();
      return `Original, beautiful editorial artwork inspired by ${subject}${artist ? ` by ${artist}` : ''}`;
    }
    return `A beautiful editorial image of ${subject}${draft.subtitle.trim() ? `, ${draft.subtitle.trim()}` : ''}`;
  }

  private defaultCardImageSearchQuery(draft: CardDraft): string {
    const board = this.selectedBoard();
    const title = draft.title.trim() || draft.placeQuery.trim() || board?.title || '';
    if (this.isSongCardForm()) {
      const artist = draft.spotifyArtistName.trim() || draft.subtitle.trim();
      return [title, artist, 'official cover art'].filter(Boolean).join(' ');
    }
    const tags = draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    return this.normalizeWizardImageQuery(title, title, draft.subtitle, draft.notes, tags);
  }

  async runCardWizard(options: CardWizardRunOptions = {}): Promise<void> {
    const board = this.selectedBoard();
    if (!board || !this.canEditBoard(board) || !this.functions || this.cardWizardLoading()) {
      return;
    }
    const draft = this.cardDraft();
    const prompt = this.buildCardWizardPrompt(board, draft, options.promptOverride, options.forceImageLookup === true);
    if (!prompt) {
      this.cardWizardError.set($localize`Describe what this card should become, or start with a title/place first.`);
      return;
    }

    this.cardWizardLoading.set(true);
    this.cardWizardError.set(null);
    try {
      const instruction = options.promptOverride ?? this.cardWizardPrompt();
      const likelyFood = this.isLikelyFoodCardDraft(draft, instruction);
      const likelySong = this.isLikelySongCardDraft(board, draft, instruction);
      const replaceImage = options.forceImageLookup === true || this.shouldReplaceCardImage(draft, instruction);
      const callable = httpsCallable<Record<string, unknown>, unknown>(this.functions, 'generateBoardWizardBatch', {
        timeout: 150_000,
      });
      const response = await callable({
        mode: 'describe',
        prompt,
        pastedList: '',
        url: '',
        photoNames: [],
        imageOnly: replaceImage,
        currentCard: replaceImage ? this.cardDraftToWizardCurrentCard(draft, likelyFood, likelySong) : null,
        targetBoardId: board.id,
        targetBoardTitle: board.title,
        defaultType: likelyFood ? 'food' : draft.type,
        count: 1,
        vibe: this.wizardVibe(),
        existingCards: board.cards.slice(0, 80).map((card) => ({
          title: card.title,
          subtitle: card.subtitle,
          tags: card.tags,
        })),
      });
      const batch = this.normalizeWizardBatch(response.data);
      const [generated] = batch.cards;
      if (!generated) {
        throw new Error('The Wizard did not return a usable card.');
      }
      this.applyGeneratedCardToDraft(generated, replaceImage, options.preserveExistingImageOnMiss === true);
      if (likelySong) {
        await this.resolveCurrentCardDraftSongMedia(board);
      }
    } catch (error) {
      this.cardWizardError.set(error instanceof Error ? error.message : $localize`The Wizard could not update this card.`);
    } finally {
      this.cardWizardLoading.set(false);
    }
  }

  private buildCardWizardPrompt(board: Board, draft: CardDraft, instructionOverride?: string, forceImageLookup = false): string {
    const instruction = (instructionOverride ?? this.cardWizardPrompt()).trim();
    const wantsImageReplacement = forceImageLookup || this.shouldReplaceCardImage(draft, instruction);
    const likelyFood = this.isLikelyFoodCardDraft(draft, instruction);
    const likelySong = this.isLikelySongCardDraft(board, draft, instruction);
    const existing = [
      draft.title.trim() ? `Title: ${draft.title.trim()}` : '',
      draft.subtitle.trim() ? `Subtitle: ${draft.subtitle.trim()}` : '',
      draft.notes.trim() ? `Notes: ${draft.notes.trim()}` : '',
      draft.placeQuery.trim() ? `Place/query: ${draft.placeQuery.trim()}` : '',
      draft.tags.trim() ? `Tags: ${draft.tags.trim()}` : '',
    ].filter(Boolean).join('\n');
    const task = this.editingCardId()
      ? 'Improve this existing card. Return exactly one polished card. Preserve the intent unless the user asks for a change.'
      : 'Create exactly one polished card for this board.';
    return [
      task,
      `Board: ${board.title}`,
      board.description ? `Board description: ${board.description}` : '',
      `Preferred card type: ${draft.type}`,
      likelyFood
        ? 'This card is a food, dish, dessert, or menu item. Return type "food", scope "place", include tags "menu-item" and "food", and make image_query an exact food-photo search phrase for the dish, for example "<dish name> food photo".'
        : '',
      wantsImageReplacement
        ? 'The user wants the image replaced. Do not preserve the current image concept. Return a card whose image_query is specific enough to find the correct replacement image.'
        : '',
      likelySong
        ? 'This is a song, album, music, Spotify, or playlist card. Return exact cover art and include audioPreviewUrl plus Spotify metadata if available.'
        : '',
      instruction ? `User request: ${instruction}` : '',
      existing ? `Current card draft:\n${existing}` : '',
    ].filter(Boolean).join('\n\n').trim();
  }

  private applyGeneratedCardToDraft(card: BoardWizardGeneratedCard, replaceImage: boolean, preserveExistingImageOnMiss = false): void {
    if (replaceImage) {
      this.cardDraft.update((draft) => ({
        ...draft,
        imageUrl: card.imageUrl || (preserveExistingImageOnMiss ? draft.imageUrl : ''),
        audioPreviewUrl: card.audioPreviewUrl || draft.audioPreviewUrl,
        spotifyTrackId: card.spotifyTrackId || draft.spotifyTrackId,
        spotifyTrackUrl: card.spotifyTrackUrl || draft.spotifyTrackUrl,
        spotifyUri: card.spotifyUri || draft.spotifyUri,
        spotifyArtistName: card.spotifyArtistName || draft.spotifyArtistName,
        spotifyAlbumName: card.spotifyAlbumName || draft.spotifyAlbumName,
        spotifyArtworkUrl: card.spotifyArtworkUrl || draft.spotifyArtworkUrl,
      }));
      this.cardImageLocked.set(!!card.imageUrl);
      if (!card.imageUrl) {
        this.cardWizardError.set(
          preserveExistingImageOnMiss
            ? $localize`No better image was found, so the current image was kept.`
            : $localize`No better image was found, so the old image was removed.`,
        );
      }
      return;
    }
    this.cardDraft.update((draft) => ({
      ...draft,
      title: card.title || draft.title,
      subtitle: card.subtitle || draft.subtitle,
      notes: card.notes || draft.notes,
      type: card.type || draft.type,
      scope: card.scope || draft.scope,
      status: card.status || draft.status,
      rating: String(card.rating || draft.rating || 4),
      imageUrl: card.imageUrl || (replaceImage ? '' : draft.imageUrl),
      audioPreviewUrl: card.audioPreviewUrl || draft.audioPreviewUrl,
      spotifyTrackId: card.spotifyTrackId || draft.spotifyTrackId,
      spotifyTrackUrl: card.spotifyTrackUrl || draft.spotifyTrackUrl,
      spotifyUri: card.spotifyUri || draft.spotifyUri,
      spotifyArtistName: card.spotifyArtistName || draft.spotifyArtistName,
      spotifyAlbumName: card.spotifyAlbumName || draft.spotifyAlbumName,
      spotifyArtworkUrl: card.spotifyArtworkUrl || draft.spotifyArtworkUrl,
      placeQuery: card.place_query || card.title || draft.placeQuery,
      placeId: card.placeId || draft.placeId,
      googleMapsUrl: card.googleMapsUrl || draft.googleMapsUrl,
      tags: card.tags.length ? card.tags.join(', ') : draft.tags,
    }));
    if (card.imageUrl) {
      this.cardImageLocked.set(true);
    } else if (replaceImage) {
      this.cardImageLocked.set(false);
    }
  }

  private shouldReplaceCardImage(draft: CardDraft, instruction = this.cardWizardPrompt()): boolean {
    instruction = instruction.toLowerCase();
    return !!draft.imageUrl && /\b(replace|change|swap|fix|correct|appropriate|better|wrong|random|image|photo|picture)\b/i.test(instruction);
  }

  private isLikelyFoodCardDraft(draft: CardDraft, instruction: string): boolean {
    const text = `${draft.title} ${draft.subtitle} ${draft.notes} ${draft.tags} ${instruction}`.toLowerCase();
    return draft.type === 'food'
      || /\b(food|dish|menu|dessert|cake|butter cake|cheesecake|burger|sandwich|steak|salmon|pasta|nachos|spring rolls|breakfast|chicken|coffee|drink|cocktail|pizza|taco|sushi)\b/.test(text);
  }

  private isLikelySongCardDraft(board: Board, draft: CardDraft, instruction: string): boolean {
    if (draft.spotifyTrackId || draft.spotifyTrackUrl || draft.audioPreviewUrl) {
      return true;
    }
    const text = [
      board.title,
      board.description,
      draft.title,
      draft.subtitle,
      draft.notes,
      draft.tags,
      instruction,
    ].join(' ').toLowerCase();
    return /\b(song|songs|music|album|single|track|tracks|hit|hits|singer|artist|spotify|playlist|cover art|audio preview)\b/.test(text);
  }

  isSongBoard(board: Board): boolean {
    if (/\b(song|songs|music|album|single|tracks|hits|spotify|playlist|discography)\b/i.test(`${board.title} ${board.description}`)) {
      return true;
    }
    const sample = board.cards.slice(0, 24);
    if (!sample.length) {
      return false;
    }
    const songSignals = sample.filter((card) => this.isSongCard(card)).length;
    return songSignals >= Math.max(2, Math.ceil(sample.length * 0.35));
  }

  private boardSongArtistContext(board: Board): string {
    const counts = new Map<string, { label: string; count: number }>();
    for (const card of board.cards) {
      const artist = card.spotifyArtistName.trim();
      if (!artist) {
        continue;
      }
      const key = artist.toLowerCase();
      const current = counts.get(key);
      counts.set(key, { label: current?.label ?? artist, count: (current?.count ?? 0) + 1 });
    }
    const dominant = Array.from(counts.values()).sort((left, right) => right.count - left.count)[0];
    if (dominant && dominant.count >= 2) {
      return dominant.label;
    }
    const match = `${board.title} ${board.description}`.match(/\b(?:by|artist|singer|songs? by)\s+([a-z][\w'.-]+(?:\s+[a-z][\w'.-]+){0,4})|\b([a-z][\w'.-]+(?:\s+[a-z][\w'.-]+){0,4})\s+(?:songs?|singles?|albums?|tracks?|discography|hits?)\b/i);
    return (match?.[1] || match?.[2] || '')
      .replace(/\b(?:top|best|biggest|greatest|classic|popular|favorite|favourite|essential)\s+/i, '')
      .trim();
  }

  private async resolveCurrentCardDraftSongMedia(board: Board): Promise<void> {
    if (!this.functions) {
      return;
    }
    const draft = this.cardDraft();
    if (draft.spotifyTrackId && draft.audioPreviewUrl) {
      return;
    }
    const tags = draft.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const artistContext = draft.spotifyArtistName || this.boardSongArtistContext(board);
    try {
      const callable = httpsCallable<
        { boardTitle: string; cards: Array<Record<string, unknown>> },
        { cards?: unknown[] }
      >(this.functions, 'resolveBoardSongSpotify', { timeout: 60_000 });
      const response = await callable({
        boardTitle: [board.title, board.description, artistContext ? `artist ${artistContext}` : '', 'song preview audio'].filter(Boolean).join(' - '),
        cards: [{
          title: draft.title,
          subtitle: [draft.subtitle, artistContext ? `artist ${artistContext}` : ''].filter(Boolean).join(' - '),
          notes: [draft.notes, artistContext ? `Performed by ${artistContext}.` : ''].filter(Boolean).join(' '),
          tags: Array.from(new Set([...tags, 'song', 'music'])),
          image_query: `${draft.title} ${artistContext} song cover art`.trim(),
          audioPreviewUrl: draft.audioPreviewUrl,
          spotifyTrackId: draft.spotifyTrackId,
          spotifyTrackUrl: draft.spotifyTrackUrl,
          spotifyUri: draft.spotifyUri,
          spotifyArtistName: draft.spotifyArtistName,
          spotifyAlbumName: draft.spotifyAlbumName,
          spotifyArtworkUrl: draft.spotifyArtworkUrl,
        }],
      });
      const [resolved] = Array.isArray(response.data?.cards)
        ? response.data.cards.map((item) => this.normalizeSpotifyResolvedCard(item))
        : [];
      if (!resolved?.spotifyTrackId && !resolved?.audioPreviewUrl) {
        this.cardWizardError.set($localize`Card details were refreshed, but no matching song preview was found.`);
        return;
      }
      this.cardDraft.update((current) => ({
        ...current,
        audioPreviewUrl: current.audioPreviewUrl || resolved.audioPreviewUrl,
        spotifyTrackId: current.spotifyTrackId || resolved.spotifyTrackId,
        spotifyTrackUrl: current.spotifyTrackUrl || resolved.spotifyTrackUrl,
        spotifyUri: current.spotifyUri || resolved.spotifyUri,
        spotifyArtistName: current.spotifyArtistName || resolved.spotifyArtistName,
        spotifyAlbumName: current.spotifyAlbumName || resolved.spotifyAlbumName,
        spotifyArtworkUrl: current.spotifyArtworkUrl || resolved.spotifyArtworkUrl,
        imageUrl: current.imageUrl || resolved.spotifyArtworkUrl,
      }));
      if (resolved.audioPreviewUrl) {
        this.cardWizardError.set(null);
      } else {
        this.cardWizardError.set($localize`A Spotify track was found, but no playable preview URL was available for this song.`);
      }
    } catch (error) {
      this.cardWizardError.set(error instanceof Error ? error.message : $localize`Card details were refreshed, but song media could not be resolved.`);
    }
  }

  private cardDraftToWizardCurrentCard(draft: CardDraft, likelyFood: boolean, likelySong = false): Record<string, unknown> {
    const tags = draft.tags
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    const enrichedTags = likelyFood
      ? Array.from(new Set([...tags, 'menu-item', 'food']))
      : likelySong
        ? Array.from(new Set([...tags, 'song', 'music']))
        : tags;
    return {
      title: draft.title,
      subtitle: draft.subtitle,
      notes: draft.notes,
      type: likelyFood ? 'food' : draft.type,
      scope: draft.scope,
      status: draft.status,
      rating: Number.parseInt(draft.rating, 10) || 4,
      tags: enrichedTags,
      image_query: `${draft.title} ${likelyFood ? 'food photo' : likelySong ? 'song cover art' : 'photo'}`.trim(),
      place_query: draft.placeQuery || draft.title,
      audioPreviewUrl: draft.audioPreviewUrl,
      spotifyTrackId: draft.spotifyTrackId,
      spotifyTrackUrl: draft.spotifyTrackUrl,
      spotifyUri: draft.spotifyUri,
      spotifyArtistName: draft.spotifyArtistName,
      spotifyAlbumName: draft.spotifyAlbumName,
      spotifyArtworkUrl: draft.spotifyArtworkUrl,
    };
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

  what3wordsAddressFor(card: What3WordsCardLike): string {
    return what3WordsAddressFromCard(card);
  }

  what3wordsUrlFor(card: What3WordsCardLike): string {
    return what3wordsLocation(this.what3wordsAddressFor(card))?.url ?? '';
  }

  visitDirectionsUrl(card: BoardCard): string {
    const lat = typeof card.locationLat === 'number' ? card.locationLat : card.tour?.lat;
    const lng = typeof card.locationLng === 'number' ? card.locationLng : card.tour?.lng;
    const hasCoordinates = typeof lat === 'number' && Number.isFinite(lat)
      && typeof lng === 'number' && Number.isFinite(lng);
    const destination = hasCoordinates
      ? `${lat},${lng}`
      : [card.title, card.tour?.address || card.subtitle].filter(Boolean).join(', ');
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('destination', destination);

    // Coordinates are the most reliable mobile target, especially for
    // what3words cards whose exact square may differ from the nearby POI.
    // Otherwise use Google's documented destination_place_id parameter
    // instead of the legacy `q=place_id:...` URL that mobile Maps may reject.
    if (!hasCoordinates) {
      const placeId = this.googleMapsPlaceIdForCard(card);
      if (placeId) {
        url.searchParams.set('destination_place_id', placeId);
      }
    }
    return url.toString();
  }

  private googleMapsPlaceIdForCard(card: Pick<BoardCard, 'placeId' | 'googleMapsUrl'>): string {
    const storedPlaceId = card.placeId.trim();
    if (storedPlaceId) {
      return storedPlaceId;
    }
    try {
      const url = new URL(card.googleMapsUrl);
      const explicitPlaceId = url.searchParams.get('destination_place_id')
        || url.searchParams.get('query_place_id');
      if (explicitPlaceId) {
        return explicitPlaceId.trim();
      }
      return url.searchParams.get('q')?.match(/^place_id:(.+)$/i)?.[1]?.trim() ?? '';
    } catch {
      return '';
    }
  }

  canGoThere(card: BoardCard): boolean {
    return canPlanVisit({
      ...card,
      what3wordsAddress: this.what3wordsAddressFor(card),
    });
  }

  visitPlanFor(card: BoardCard): VisitPlanSummary | null {
    return this.visitPlans()[card.id] ?? null;
  }

  visitPlanCardLabel(card: BoardCard): string {
    const plan = this.visitPlanFor(card);
    return plan ? visitPlanLabel(plan) : $localize`Let’s go`;
  }

  openGoThere(
    board: Board,
    card: BoardCard,
    event?: Event,
    context: VisitPlanContext = 'board',
  ): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canGoThere(card)) {
      return;
    }
    if (context === 'board' && !this.authService.isAuthenticated()) {
      void this.router.navigate(['/sign-in'], { queryParams: { redirectTo: this.router.url } });
      return;
    }
    if (context === 'stack') {
      this.stopStackPlayback();
    }
    const existing = this.visitPlanFor(card);
    const isBoardOwner = this.canEditBoard(board);
    this.visitPlanBoardId.set(board.id);
    this.visitPlanCardId.set(card.id);
    this.visitPlanContext.set(context);
    this.visitPlanShowScheduler.set(context === 'board' || isBoardOwner || !!existing);
    this.visitPlanOpenToBoard.set(existing?.openToBoard ?? board.visibility === 'public');
    this.visitPlanOpenPlans.set([]);
    this.visitPlanSelectedOpenPlanId.set(null);
    this.visitPlanInterestCount.set(0);
    this.visitPlanGuestName.set(this.authService.isAuthenticated() ? this.userName() || '' : '');
    this.visitPlanGuestEmail.set(this.authService.isAuthenticated() ? this.userEmail() || '' : '');
    this.visitPlanSocialSaving.set(false);
    this.visitPlanInterestSaved.set(false);
    this.visitPlanDateTime.set(existing
      ? this.localDateTimeFromIso(existing.startsAtIso)
      : '');
    this.visitPlanTimezone.set(existing?.timezone || browserTimezone());
    this.visitPlanTimeSelected.set(!!existing);
    this.visitPlanInviteEmails.set('');
    this.visitPlanInvitesExpanded.set(false);
    this.visitPlanAttendees.set([]);
    this.visitPlanAttendeesExpanded.set(false);
    this.visitPlanAttendeesError.set(null);
    this.visitPlanError.set(null);
    this.visitPlanMessage.set(null);
    this.visitPlanDialogOpen.set(true);
    if (this.authService.isAuthenticated()) {
      void this.loadVisitPlans(board).then(() => {
        const refreshed = this.visitPlans()[card.id];
        if (refreshed && this.visitPlanCardId() === card.id) {
          this.visitPlanDateTime.set(this.localDateTimeFromIso(refreshed.startsAtIso));
          this.visitPlanTimezone.set(refreshed.timezone);
          this.visitPlanOpenToBoard.set(refreshed.openToBoard);
          this.visitPlanTimeSelected.set(true);
          this.visitPlanShowScheduler.set(true);
        }
      });
    }
    if (context === 'stack' && !isBoardOwner && !existing) {
      void this.loadOpenVisitPlans();
    }
  }

  closeGoThere(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.visitPlanSaving() || this.visitPlanSharing()) {
      return;
    }
    this.visitPlanDialogOpen.set(false);
    this.visitPlanBoardId.set(null);
    this.visitPlanCardId.set(null);
    this.visitPlanTimeSelected.set(false);
    this.visitPlanContext.set('board');
    this.visitPlanShowScheduler.set(true);
    this.visitPlanOpenPlans.set([]);
    this.visitPlanSelectedOpenPlanId.set(null);
    this.visitPlanInterestCount.set(0);
    this.visitPlanSocialSaving.set(false);
    this.visitPlanInterestSaved.set(false);
    this.visitPlanAttendees.set([]);
    this.visitPlanAttendeesExpanded.set(false);
    this.visitPlanAttendeesError.set(null);
    this.visitPlanError.set(null);
    this.visitPlanMessage.set(null);
  }

  updateVisitPlanGuestName(value: string): void {
    this.visitPlanGuestName.set(value.slice(0, 80));
    this.visitPlanError.set(null);
  }

  updateVisitPlanGuestEmail(value: string): void {
    this.visitPlanGuestEmail.set(value.slice(0, 254));
    this.visitPlanError.set(null);
  }

  updateVisitPlanOpenToBoard(value: boolean): void {
    this.visitPlanOpenToBoard.set(value);
    this.visitPlanError.set(null);
    this.visitPlanMessage.set(null);
  }

  chooseOwnVisitTime(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.authService.isAuthenticated()) {
      void this.router.navigate(['/sign-in'], { queryParams: { redirectTo: this.router.url } });
      return;
    }
    this.visitPlanShowScheduler.set(true);
    this.visitPlanSelectedOpenPlanId.set(null);
    this.visitPlanAttendees.set([]);
    this.visitPlanAttendeesExpanded.set(false);
    this.visitPlanError.set(null);
    this.visitPlanMessage.set(null);
  }

  selectOpenVisitPlan(plan: VisitPlanSummary, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.visitPlanSelectedOpenPlanId.set(plan.id);
    this.visitPlanAttendeesExpanded.set(false);
    this.visitPlanAttendees.set([]);
    this.visitPlanError.set(null);
    this.visitPlanMessage.set(null);
  }

  async joinSelectedOpenVisitPlan(event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const plan = this.selectedOpenVisitPlan();
    if (!plan || !this.functions) {
      return;
    }
    const email = (this.userEmail() || this.visitPlanGuestEmail()).trim().toLowerCase();
    const guestName = (this.userName() || this.visitPlanGuestName()).trim();
    if (!this.authService.isAuthenticated() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.visitPlanError.set($localize`Enter a valid email address so we can send your plan.`);
      return;
    }
    this.visitPlanSocialSaving.set(true);
    this.visitPlanError.set(null);
    this.visitPlanMessage.set(null);
    try {
      const callable = httpsCallable<{
        planId: string;
        email?: string;
        guestName?: string;
      }, unknown>(this.functions, 'joinOpenVisitPlan');
      const response = await callable({
        planId: plan.id,
        ...(!this.authService.isAuthenticated() ? { email, guestName } : {}),
      });
      const data = response.data && typeof response.data === 'object'
        ? response.data as Record<string, unknown>
        : {};
      const updated = this.normalizeVisitPlan(data['plan']);
      if (updated) {
        this.visitPlanOpenPlans.update((plans) =>
          plans.map((candidate) => candidate.id === updated.id ? updated : candidate));
      }
      this.visitPlanMessage.set(data['alreadyJoined'] === true
        ? $localize`You’re already on this plan.`
        : data['emailSent'] === true
          ? $localize`You’re in. We emailed the plan and calendar invite to you.`
          : $localize`You’re in. The organizer can now see you on the list.`);
      this.visitPlanAttendeesExpanded.set(true);
      await this.loadVisitPlanAttendees(updated ?? plan);
    } catch (error) {
      this.visitPlanError.set(
        this.boardFriendErrorMessage(error, $localize`Could not join this plan. Please try again.`),
      );
    } finally {
      this.visitPlanSocialSaving.set(false);
    }
  }

  async expressVisitInterest(event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.visitPlanBoard();
    const card = this.visitPlanCard();
    if (!board || !card || !this.functions) {
      return;
    }
    const email = (this.userEmail() || this.visitPlanGuestEmail()).trim().toLowerCase();
    const guestName = (this.userName() || this.visitPlanGuestName()).trim();
    if (!this.authService.isAuthenticated() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.visitPlanError.set($localize`Enter a valid email address so we can keep you updated.`);
      return;
    }
    this.visitPlanSocialSaving.set(true);
    this.visitPlanError.set(null);
    this.visitPlanMessage.set(null);
    try {
      const callable = httpsCallable<{
        boardId: string;
        cardId: string;
        email?: string;
        guestName?: string;
      }, unknown>(this.functions, 'expressVisitInterest');
      const response = await callable({
        boardId: board.id,
        cardId: card.id,
        ...(!this.authService.isAuthenticated() ? { email, guestName } : {}),
      });
      const data = response.data && typeof response.data === 'object'
        ? response.data as Record<string, unknown>
        : {};
      this.visitPlanInterestSaved.set(true);
      this.visitPlanMessage.set(data['alreadySaved'] === true
        ? $localize`You’re already on the interest list. We’ll email you when a time is chosen.`
        : $localize`Interest saved. We told the organizer and will email you when a time is chosen.`);
    } catch (error) {
      this.visitPlanError.set(
        this.boardFriendErrorMessage(error, $localize`Could not save your interest. Please try again.`),
      );
    } finally {
      this.visitPlanSocialSaving.set(false);
    }
  }

  private async loadOpenVisitPlans(): Promise<void> {
    const board = this.visitPlanBoard();
    const card = this.visitPlanCard();
    if (!board || !card || !this.functions) {
      return;
    }
    this.visitPlanOpenPlansLoading.set(true);
    this.visitPlanError.set(null);
    try {
      const callable = httpsCallable<{ boardId: string; cardId: string }, unknown>(
        this.functions,
        'getOpenVisitPlans',
      );
      const response = await callable({ boardId: board.id, cardId: card.id });
      const data = response.data && typeof response.data === 'object'
        ? response.data as Record<string, unknown>
        : {};
      const plans = Array.isArray(data['plans'])
        ? data['plans']
          .map((value) => this.normalizeVisitPlan(value))
          .filter((value): value is VisitPlanSummary => !!value)
        : [];
      this.visitPlanOpenPlans.set(plans);
      this.visitPlanSelectedOpenPlanId.set(plans[0]?.id ?? null);
      this.visitPlanInterestCount.set(this.nonNegativeInteger(data['interestCount']));
    } catch (error) {
      this.visitPlanError.set(
        this.boardFriendErrorMessage(error, $localize`Could not load plans for this place.`),
      );
    } finally {
      this.visitPlanOpenPlansLoading.set(false);
    }
  }

  updateVisitPlanDateTime(value: string): void {
    this.visitPlanDateTime.set(value);
    this.visitPlanTimeSelected.set(!!value.trim());
    this.visitPlanError.set(null);
    this.visitPlanMessage.set(null);
  }

  updateVisitPlanInviteEmails(value: string): void {
    this.visitPlanInviteEmails.set(value);
    this.visitPlanError.set(null);
    this.visitPlanMessage.set(null);
  }

  setVisitPlanQuickTime(option: 'now' | 'today' | 'tomorrow'): void {
    const value = option === 'now'
      ? rightNowVisitDateTime()
      : option === 'tomorrow'
        ? tomorrowVisitDateTime()
        : defaultVisitDateTime();
    this.visitPlanDateTime.set(value);
    this.visitPlanTimeSelected.set(true);
    this.visitPlanError.set(null);
    this.visitPlanMessage.set(null);
  }

  toggleVisitPlanInvites(): void {
    this.visitPlanInvitesExpanded.update((value) => !value);
    this.visitPlanError.set(null);
  }

  toggleVisitPlanAttendees(): void {
    const expanded = !this.visitPlanAttendeesExpanded();
    this.visitPlanAttendeesExpanded.set(expanded);
    if (expanded) {
      void this.loadVisitPlanAttendees(
        this.visitPlanShowScheduler() ? this.activeVisitPlan() : this.selectedOpenVisitPlan(),
      );
    }
  }

  async saveVisitPlan(event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const inviteInput = this.visitPlanInviteEmails().trim();
    const inviteEmails = parseVisitInviteEmails(inviteInput);
    if (inviteInput && !inviteEmails.length) {
      this.visitPlanError.set($localize`Enter a valid email address or leave invitations empty.`);
      return;
    }
    await this.persistVisitPlan(inviteEmails, true);
  }

  async shareVisitPlan(channel: 'text' | 'copy', event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.visitPlanBoard();
    const card = this.visitPlanCard();
    if (!board || !card || !this.functions || !this.isBrowser) {
      return;
    }
    this.visitPlanError.set(null);
    this.visitPlanMessage.set(null);
    try {
      const plan = await this.ensureVisitPlanSaved();
      if (!plan) {
        return;
      }
      this.visitPlanSharing.set(true);
      const callable = httpsCallable<{ planId: string; channel: 'text' | 'copy' }, unknown>(
        this.functions,
        'inviteToVisitPlan',
      );
      const response = await callable({ planId: plan.id, channel });
      const data = response.data && typeof response.data === 'object'
        ? response.data as Record<string, unknown>
        : {};
      const shareUrl = this.objectField(data, 'shareUrl');
      if (!shareUrl) {
        throw new Error('The invitation link could not be created.');
      }
      await this.loadVisitPlans(board);
      if (this.visitPlanAttendeesExpanded()) {
        await this.loadVisitPlanAttendees();
      }
      const message = [
        `Want to go to ${card.title} with me?`,
        visitPlanInvitationTime(plan),
        shareUrl,
      ].filter(Boolean).join('\n');
      if (channel === 'copy') {
        const copied = await this.copyTextToClipboard(message);
        this.visitPlanMessage.set(copied
          ? $localize`Invitation copied. Send it anywhere.`
          : $localize`The invitation is ready, but could not be copied automatically.`);
        return;
      }
      const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?';
      window.location.href = `sms:${separator}body=${encodeURIComponent(message)}`;
      this.visitPlanMessage.set($localize`Opening your text-message app with the invitation.`);
    } catch (error) {
      this.visitPlanError.set(this.boardFriendErrorMessage(error, $localize`Could not create an invitation link.`));
    } finally {
      this.visitPlanSharing.set(false);
    }
  }

  async sendVisitPlanEmailInvites(event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.visitPlanBoard();
    if (!board || !this.functions) {
      return;
    }
    const emails = parseVisitInviteEmails(this.visitPlanInviteEmails());
    if (!emails.length) {
      this.visitPlanError.set($localize`Enter at least one valid email address.`);
      return;
    }
    const planNeededSaving = this.visitPlanNeedsSaving();
    this.visitPlanError.set(null);
    this.visitPlanMessage.set(null);
    try {
      const plan = await this.ensureVisitPlanSaved();
      if (!plan) {
        return;
      }
      this.visitPlanSharing.set(true);
      const callable = httpsCallable<{ planId: string; email: string }, unknown>(
        this.functions,
        'inviteToVisitPlan',
      );
      const results = await Promise.allSettled(emails.map((email) => callable({ planId: plan.id, email })));
      const sent = results.filter((result) =>
        result.status === 'fulfilled'
        && result.value.data
        && typeof result.value.data === 'object'
        && (result.value.data as Record<string, unknown>)['emailSent'] === true).length;
      const failed = results.length - sent;
      this.visitPlanInviteEmails.set('');
      await this.loadVisitPlans(board);
      if (this.visitPlanAttendeesExpanded()) {
        await this.loadVisitPlanAttendees();
      }
      this.visitPlanMessage.set([
        planNeededSaving ? $localize`Plan saved.` : '',
        sent ? `${sent} ${sent === 1 ? $localize`invitation` : $localize`invitations`} sent.` : '',
        failed ? `${failed} could not be delivered.` : '',
      ].filter(Boolean).join(' '));
    } catch (error) {
      this.visitPlanError.set(this.boardFriendErrorMessage(error, $localize`Could not send those invitations.`));
    } finally {
      this.visitPlanSharing.set(false);
    }
  }

  private async persistVisitPlan(
    inviteEmails: string[],
    announceResult: boolean,
  ): Promise<VisitPlanSummary | null> {
    const board = this.visitPlanBoard();
    const card = this.visitPlanCard();
    if (!board || !card || !this.functions) {
      this.visitPlanError.set($localize`This plan is not ready. Close it and try again.`);
      return null;
    }
    if (!this.visitPlanTimeSelected()) {
      this.visitPlanError.set($localize`Choose when you’re going first.`);
      return null;
    }
    const startsAtIso = visitStartIso(this.visitPlanDateTime());
    if (!startsAtIso) {
      this.visitPlanError.set($localize`Choose a valid date and time.`);
      return null;
    }
    this.visitPlanSaving.set(true);
    this.visitPlanError.set(null);
    if (announceResult) {
      this.visitPlanMessage.set(null);
    }
    try {
      const callable = httpsCallable<{
        boardId: string;
        cardId: string;
        startsAtIso: string;
        timezone: string;
        inviteEmails: string[];
        openToBoard: boolean;
      }, unknown>(this.functions, 'createVisitPlan');
      const response = await callable({
        boardId: board.id,
        cardId: card.id,
        startsAtIso,
        timezone: this.visitPlanTimezone(),
        inviteEmails,
        openToBoard: board.visibility === 'public' && this.visitPlanOpenToBoard(),
      });
      const data = response.data && typeof response.data === 'object'
        ? response.data as Record<string, unknown>
        : {};
      const plan = this.normalizeVisitPlan(data['plan']);
      if (!plan) {
        throw new Error('The saved plan could not be loaded.');
      }
      this.visitPlans.update((plans) => ({ ...plans, [card.id]: plan }));
      this.visitPlanTimeSelected.set(true);
      if (inviteEmails.length) {
        this.visitPlanInviteEmails.set('');
      }
      const confirmationSent = data['confirmationEmailSent'] === true;
      const invitationsSent = this.nonNegativeInteger(data['invitationsSent']);
      const invitationsFailed = this.nonNegativeInteger(data['invitationsFailed']);
      const interestsNotified = this.nonNegativeInteger(data['interestsNotified']);
      const interestsFailed = this.nonNegativeInteger(data['interestsFailed']);
      if (announceResult) {
        this.visitPlanMessage.set([
          confirmationSent
            ? $localize`Plan saved. Your confirmation and calendar invite are on the way.`
            : $localize`Plan saved. Email confirmation is temporarily unavailable.`,
          invitationsSent
            ? `${invitationsSent} ${invitationsSent === 1 ? $localize`invitation` : $localize`invitations`} sent.`
            : '',
          invitationsFailed
            ? `${invitationsFailed} ${invitationsFailed === 1 ? $localize`invitation could` : $localize`invitations could`} not be delivered.`
            : '',
          interestsNotified
            ? `${interestsNotified} interested ${interestsNotified === 1 ? $localize`person was` : $localize`people were`} invited.`
            : '',
          interestsFailed
            ? `${interestsFailed} interest ${interestsFailed === 1 ? $localize`notification needs` : $localize`notifications need`} another try.`
            : '',
        ].filter(Boolean).join(' '));
      }
      if (this.visitPlanAttendeesExpanded()) {
        await this.loadVisitPlanAttendees(plan);
      }
      return plan;
    } catch (error) {
      this.visitPlanError.set(this.boardFriendErrorMessage(error, $localize`Could not save this plan. Please try again.`));
      return null;
    } finally {
      this.visitPlanSaving.set(false);
    }
  }

  private async ensureVisitPlanSaved(): Promise<VisitPlanSummary | null> {
    const plan = this.activeVisitPlan();
    if (!this.visitPlanNeedsSaving(plan)) {
      return plan;
    }
    return this.persistVisitPlan([], false);
  }

  private visitPlanNeedsSaving(plan = this.activeVisitPlan()): boolean {
    if (!plan || !this.visitPlanTimeSelected()) {
      return true;
    }
    const startsAtIso = visitStartIso(this.visitPlanDateTime());
    return !startsAtIso
      || startsAtIso !== plan.startsAtIso
      || this.visitPlanTimezone() !== plan.timezone
      || this.visitPlanOpenToBoard() !== plan.openToBoard;
  }

  private async loadVisitPlanAttendees(plan = this.activeVisitPlan()): Promise<void> {
    if (!plan || !this.functions) {
      this.visitPlanAttendees.set([]);
      return;
    }
    this.visitPlanAttendeesLoading.set(true);
    this.visitPlanAttendeesError.set(null);
    try {
      const callable = httpsCallable<{ planId: string }, unknown>(
        this.functions,
        'getVisitPlanAttendees',
      );
      const response = await callable({ planId: plan.id });
      const data = response.data && typeof response.data === 'object'
        ? response.data as Record<string, unknown>
        : {};
      const attendees = Array.isArray(data['attendees'])
        ? data['attendees']
          .map((value) => this.normalizeVisitPlanAttendee(value))
          .filter((value): value is VisitPlanAttendee => !!value)
        : [];
      this.visitPlanAttendees.set(attendees);
    } catch (error) {
      this.visitPlanAttendeesError.set(
        this.boardFriendErrorMessage(error, $localize`Could not load the people on this plan.`),
      );
    } finally {
      this.visitPlanAttendeesLoading.set(false);
    }
  }

  private normalizeVisitPlanAttendee(value: unknown): VisitPlanAttendee | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const data = value as Record<string, unknown>;
    const id = this.objectField(data, 'id');
    const name = this.objectField(data, 'name');
    const role = data['role'] === 'organizer' ? 'organizer' : 'guest';
    const status = data['status'] === 'pending' ? 'pending' : 'going';
    return id && name ? { id, name, role, status } : null;
  }

  visitPlanPeopleLabel(plan: VisitPlanSummary): string {
    const going = plan.acceptedCount + 1;
    const goingLabel = `${going} going`;
    return plan.pendingCount > 0
      ? `${goingLabel} · ${plan.pendingCount} pending`
      : goingLabel;
  }

  visitPlanTimeLabel(plan: VisitPlanSummary): string {
    return visitPlanInvitationTime(plan);
  }

  visitPlanAttendeeStatus(attendee: VisitPlanAttendee): string {
    if (attendee.role === 'organizer') {
      return $localize`Organizer`;
    }
    return attendee.status === 'pending' ? $localize`Pending` : $localize`Going`;
  }

  visitPlanAttendeeName(attendee: VisitPlanAttendee): string {
    if (attendee.role !== 'organizer') {
      return attendee.name;
    }
    return this.visitPlanShowScheduler() ? $localize`You` : attendee.name;
  }

  async cancelActiveVisitPlan(): Promise<void> {
    const plan = this.activeVisitPlan();
    const card = this.visitPlanCard();
    if (!plan || !card || !this.functions) {
      return;
    }
    this.visitPlanSaving.set(true);
    this.visitPlanError.set(null);
    try {
      const callable = httpsCallable<{ planId: string }, unknown>(this.functions, 'cancelVisitPlan');
      await callable({ planId: plan.id });
      this.visitPlans.update((plans) => {
        const next = { ...plans };
        delete next[card.id];
        return next;
      });
      this.visitPlanMessage.set($localize`Plan cancelled. Invited guests will be notified.`);
      this.visitPlanDialogOpen.set(false);
      this.visitPlanBoardId.set(null);
      this.visitPlanCardId.set(null);
    } catch (error) {
      this.visitPlanError.set(this.boardFriendErrorMessage(error, $localize`Could not cancel this plan.`));
    } finally {
      this.visitPlanSaving.set(false);
    }
  }

  visitPlanAttendeeLabel(plan: VisitPlanSummary): string {
    if (plan.acceptedCount > 0) {
      return `${plan.acceptedCount} ${plan.acceptedCount === 1 ? 'guest is' : 'guests are'} in`;
    }
    if (plan.pendingCount > 0) {
      return `${plan.pendingCount} ${plan.pendingCount === 1 ? 'invitation' : 'invitations'} pending`;
    }
    return $localize`Just me`;
  }

  private async loadVisitPlans(board: Board): Promise<void> {
    if (!this.functions || !this.authService.uid()) {
      this.visitPlans.set({});
      return;
    }
    try {
      const callable = httpsCallable<{ boardId: string; cardIds: string[] }, unknown>(
        this.functions,
        'getMyVisitPlans',
      );
      const response = await callable({
        boardId: board.id,
        cardIds: this.visitPlanCardIds(board),
      });
      const data = response.data && typeof response.data === 'object'
        ? response.data as Record<string, unknown>
        : {};
      const plans = Array.isArray(data['plans'])
        ? data['plans'].map((value) => this.normalizeVisitPlan(value)).filter((value): value is VisitPlanSummary => !!value)
        : [];
      this.visitPlans.set(Object.fromEntries(plans.map((plan) => [plan.cardId, plan])));
    } catch (error) {
      console.warn('Visit plans could not be loaded.', error, { boardId: board.id });
    }
  }

  private visitPlanCardIds(board: Board): string[] {
    return board.cards.flatMap((card) => [
      card.id,
      ...this.explicitRelatedCards(card).map((related) => related.id),
    ]).slice(0, 200);
  }

  private normalizeVisitPlan(value: unknown): VisitPlanSummary | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const data = value as Record<string, unknown>;
    const id = this.objectField(data, 'id');
    const boardId = this.objectField(data, 'boardId');
    const cardId = this.objectField(data, 'cardId');
    const startsAtIso = this.objectField(data, 'startsAtIso');
    if (!id || !boardId || !cardId || !startsAtIso || !Number.isFinite(new Date(startsAtIso).getTime())) {
      return null;
    }
    return {
      id,
      boardId,
      cardId,
      placeName: this.objectField(data, 'placeName') || $localize`LivingWiki place`,
      organizerName: this.objectField(data, 'organizerName') || $localize`A LivingWiki member`,
      startsAtIso,
      timezone: this.objectField(data, 'timezone') || 'UTC',
      status: data['status'] === 'cancelled' ? 'cancelled' : 'planned',
      openToBoard: data['openToBoard'] === true,
      invitedCount: this.nonNegativeInteger(data['invitedCount']),
      acceptedCount: this.nonNegativeInteger(data['acceptedCount']),
      pendingCount: this.nonNegativeInteger(data['pendingCount']),
    };
  }

  private nonNegativeInteger(value: unknown): number {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
  }

  private localDateTimeFromIso(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return defaultVisitDateTime();
    }
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  isPhotoOnlyCard(card: Pick<BoardCard, 'imageUrl' | 'tags' | 'title'>): boolean {
    if (!card.imageUrl || !card.tags.includes('lodging')) {
      return false;
    }
    const title = card.title.trim().toLowerCase();
    return card.tags.includes('source-image')
      || card.tags.includes('photo')
      || card.tags.includes('details')
      || /^(photo|listing photo \d+|main photo|living space|bedroom|kitchen|bathroom|outdoor space|amenity)$/i.test(title);
  }

  cardImages(card: Pick<BoardCard, 'imageUrl' | 'imageUrls'>): string[] {
    return this.uniqueImageUrls([card.imageUrl, ...(card.imageUrls ?? [])]);
  }

  cardMemoryImages(card: Pick<BoardCard, 'imageUrl' | 'imageUrls'>): string[] {
    return legacyMemoryImages(card.imageUrl, card.imageUrls);
  }

  cardMemoryCount(card: Pick<BoardCard, 'imageUrl' | 'imageUrls'>): number {
    return this.cardMemoryImages(card).length;
  }

  legacyRelatedMemoryCount(card: BoardCard): number {
    return this.legacyRelatedMemoryImages(card).length;
  }

  relatedCardsFor(card: BoardCard): BoardCard[] {
    const explicitCards = Array.isArray(card.relatedCards) ? card.relatedCards : [];
    const legacyMemories = this.legacyRelatedMemoryImages(card).map((imageUrl, index) =>
      this.legacyMemoryCard(card, imageUrl, index));
    return [...explicitCards, ...legacyMemories];
  }

  explicitRelatedCards(card: BoardCard | null | undefined): BoardCard[] {
    return card && Array.isArray(card.relatedCards) ? card.relatedCards : [];
  }

  relatedCardCount(card: BoardCard): number {
    return this.relatedCardsFor(card).length;
  }

  relatedCardExploreLabel(card: BoardCard): string {
    return relatedCardCollectionLabel(
      this.explicitRelatedCards(card).map((related) => related.type),
      this.legacyRelatedMemoryImages(card).length,
    );
  }

  isLegacyMemoryRelatedCard(card: Pick<BoardCard, 'id'>): boolean {
    return card.id.startsWith('legacy-memory:');
  }

  exploreRelatedCards(card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.relatedCardCount(card)) {
      return;
    }
    this.relatedCardsReturnScrollY = this.isBrowser ? window.scrollY : 0;
    this.relatedCardsReturnSearch = this.cardSearch();
    this.cardSearch.set('');
    this.cardManageBoardId.set(null);
    this.selectedCardIds.set(new Set());
    this.exploredRelatedCardParentId.set(card.id);
    this.closeCardActionMenu();
    if (this.isBrowser) {
      window.requestAnimationFrame(() => {
        document.querySelector('.related-cards-context')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  }

  closeRelatedCards(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.exploredRelatedCardParentId()) {
      return;
    }
    const restoreY = this.relatedCardsReturnScrollY;
    this.exploredRelatedCardParentId.set(null);
    this.cardSearch.set(this.relatedCardsReturnSearch);
    this.relatedCardsReturnSearch = '';
    if (this.isBrowser) {
      window.requestAnimationFrame(() => window.scrollTo({ top: restoreY, behavior: 'smooth' }));
    }
  }

  private legacyMemoryCard(parent: BoardCard, imageUrl: string, index: number): BoardCard {
    const position = index + 1;
    return {
      id: `legacy-memory:${parent.id}:${position}`,
      title: `Memory ${position}`,
      subtitle: parent.title,
      notes: parent.notes || `A photo memory from ${parent.title}.`,
      type: 'memory',
      scope: parent.scope,
      status: 'saved',
      rating: parent.rating,
      entityName: `Memory ${position}`,
      entityType: 'other',
      imageIntent: 'other',
      imageContext: parent.title,
      mediaKind: 'none',
      shortSummary: parent.subtitle || `A moment from ${parent.title}`,
      rank: position,
      imageUrl,
      imageUrls: [imageUrl],
      audioPreviewUrl: '',
      spotifyTrackId: '',
      spotifyTrackUrl: '',
      spotifyUri: '',
      spotifyArtistName: '',
      spotifyAlbumName: '',
      spotifyArtworkUrl: '',
      placeId: '',
      googleMapsUrl: '',
      tags: ['memory', 'related-card'],
      stickers: [],
      tour: null,
      relatedCards: [],
      createdAt: parent.createdAt,
      updatedAt: parent.updatedAt,
    };
  }

  private legacyRelatedMemoryImages(card: BoardCard): string[] {
    return legacyMemoryImages(
      card.imageUrl,
      card.imageUrls,
      this.explicitRelatedCards(card).flatMap((related) => this.cardImages(related)),
    );
  }

  openCardPhotoViewer(card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.cardImages(card).length) {
      return;
    }
    const photos = this.cardImages(card);
    const current = Math.min(this.cardPhotoIndexes()[card.id] ?? 0, photos.length - 1);
    this.cardPhotoViewerIndex.set(current);
    this.cardPhotoViewerCardId.set(card.id);
  }

  openCardPhotoViewerAt(card: BoardCard, index: number, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const photos = this.cardImages(card);
    if (index < 0 || index >= photos.length) {
      return;
    }
    this.cardPhotoViewerIndex.set(index);
    this.cardPhotoViewerCardId.set(card.id);
  }

  closeCardPhotoViewer(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.cardPhotoViewerCardId.set(null);
    this.cardPhotoViewerIndex.set(0);
  }

  stepCardPhotoViewer(direction: number, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const card = this.cardPhotoViewerCard();
    if (!card) {
      return;
    }
    const photos = this.cardImages(card);
    if (photos.length < 2) {
      return;
    }
    const current = Math.min(this.cardPhotoViewerIndex(), photos.length - 1);
    const next = (current + direction + photos.length) % photos.length;
    this.cardPhotoViewerIndex.set(next);
  }

  @HostListener('document:keydown', ['$event'])
  handleCardPhotoViewerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.tourStopEditorOpen()) {
      event.preventDefault();
      this.closeTourStopEditor();
      return;
    }
    if (event.key === 'Escape' && this.relatedCardEditorOpen()) {
      event.preventDefault();
      this.closeRelatedCardEditor();
      return;
    }
    if (event.key === 'Escape' && this.visitPlanDialogOpen()) {
      event.preventDefault();
      this.closeGoThere();
      return;
    }
    if (event.key === 'Escape' && this.exploredRelatedCardParentId()) {
      event.preventDefault();
      this.closeRelatedCards();
      return;
    }
    if (event.key === 'Escape' && this.openCardActionMenuKey()) {
      event.preventDefault();
      this.closeCardActionMenu(true);
      return;
    }
    if (this.boardLearnOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeBoardLearn();
      } else if (this.boardLearnView() === 'study' && event.key === 'ArrowLeft') {
        event.preventDefault();
        this.stepBoardStudy(-1);
      } else if (this.boardLearnView() === 'study' && event.key === 'ArrowRight') {
        event.preventDefault();
        this.stepBoardStudy(1);
      }
      return;
    }
    if (!this.cardPhotoViewerCard()) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeCardPhotoViewer();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.stepCardPhotoViewer(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.stepCardPhotoViewer(1);
    }
  }

  @HostListener('document:click')
  closeCardActionMenuOnOutsideClick(): void {
    this.closeCardActionMenu();
    this.closeBoardTranslationMenu();
  }

  cardDraftImages(draft: CardDraft = this.cardDraft()): string[] {
    return this.uniqueImageUrls([draft.imageUrl, ...draft.imageUrls]);
  }

  currentCardImage(card: Pick<BoardCard, 'id' | 'imageUrl' | 'imageUrls'>): string {
    const photos = this.cardImages(card);
    const index = Math.min(this.cardPhotoIndexes()[card.id] ?? 0, Math.max(0, photos.length - 1));
    return photos[index] ?? '';
  }

  currentCardPhotoPosition(card: Pick<BoardCard, 'id' | 'imageUrl' | 'imageUrls'>): number {
    const photos = this.cardImages(card);
    return Math.min(this.cardPhotoIndexes()[card.id] ?? 0, Math.max(0, photos.length - 1)) + 1;
  }

  cardPhotoViewerImage(card: Pick<BoardCard, 'imageUrl' | 'imageUrls'>): string {
    const photos = this.cardImages(card);
    const index = Math.min(this.cardPhotoViewerIndex(), Math.max(0, photos.length - 1));
    return photos[index] ?? '';
  }

  cardPhotoViewerPosition(card: Pick<BoardCard, 'imageUrl' | 'imageUrls'>): number {
    const photos = this.cardImages(card);
    return Math.min(this.cardPhotoViewerIndex(), Math.max(0, photos.length - 1)) + 1;
  }

  selectCardPhotoViewer(
    card: Pick<BoardCard, 'imageUrl' | 'imageUrls'>,
    index: number,
    event: Event,
  ): void {
    event.stopPropagation();
    const photos = this.cardImages(card);
    if (index < 0 || index >= photos.length) {
      return;
    }
    this.cardPhotoViewerIndex.set(index);
  }

  stepCardPhoto(card: Pick<BoardCard, 'id' | 'imageUrl' | 'imageUrls'>, direction: number, event: Event): void {
    event.stopPropagation();
    const photos = this.cardImages(card);
    if (photos.length < 2) {
      return;
    }
    const current = this.cardPhotoIndexes()[card.id] ?? 0;
    const next = (current + direction + photos.length) % photos.length;
    this.cardPhotoIndexes.update((indexes) => ({ ...indexes, [card.id]: next }));
  }

  selectCardPhoto(
    card: Pick<BoardCard, 'id' | 'imageUrl' | 'imageUrls'>,
    index: number,
    event: Event,
  ): void {
    event.stopPropagation();
    const photos = this.cardImages(card);
    if (index < 0 || index >= photos.length) {
      return;
    }
    this.cardPhotoIndexes.update((indexes) => ({ ...indexes, [card.id]: index }));
  }

  isCardMemoryGalleryOpen(cardId: string): boolean {
    return this.openCardMemoryGalleries().has(cardId);
  }

  toggleCardMemoryGallery(cardId: string, event: Event): void {
    event.stopPropagation();
    this.openCardMemoryGalleries.update((open) => {
      const next = new Set(open);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }

  openEditCardPhotos(card: BoardCard, event?: Event): void {
    event?.stopPropagation();
    this.openEditCard(card);
    if (this.isBrowser) {
      window.requestAnimationFrame(() => {
        window.document.getElementById('card-photo-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  private uniqueImageUrls(urls: Array<string | null | undefined>): string[] {
    return [...new Set(urls.map((url) => url?.trim() ?? '').filter(Boolean))];
  }

  cardScopeIcon(scope: BoardCardScope): string {
    return this.cardScopes.find((item) => item.id === scope)?.icon ?? 'location_on';
  }

  cardScopeLabel(scope: BoardCardScope): string {
    return this.cardScopes.find((item) => item.id === scope)?.label ?? 'Place';
  }

  statusLabel(status: BoardCardStatus): string {
    return this.cardStatuses.find((item) => item.id === status)?.label ?? 'Saved';
  }

  statusIcon(status: BoardCardStatus): string {
    return this.cardStatuses.find((item) => item.id === status)?.icon ?? 'bookmark';
  }

  openBoardLearn(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!board.cards.length) {
      return;
    }
    this.boardLearnOpen.set(true);
    this.boardLearnView.set('menu');
    this.boardLearnStudyIndex.set(0);
    this.boardLearnStudyRevealed.set(false);
    this.boardLearnQuizDraft.set(this.cloneBoardLearningQuiz(board.learningQuiz));
    this.boardLearnActiveQuiz.set(null);
    this.boardLearnQuizAnswers.set({});
    this.boardLearnQuizGrade.set(null);
    this.boardLearnQuizStatus.set(null);
    this.boardLearnQuizError.set(null);
    this.boardLearnQuizStats.set(null);
    this.boardLearnQuizLeaderboard.set(null);
    this.boardLearnQuizGuestName.set('');
    this.boardLearnQuizGuestSkipped.set(false);
    this.boardLearnQuizScoreSaved.set(false);
    this.boardLearnQuizShareStatus.set(null);
    this.boardLearnQuizShareMode.set(null);
    if (this.canEditBoard(board) && board.learningQuiz?.published) {
      void this.loadBoardQuizStats(board.id);
    }
    if (board.learningQuiz?.published) {
      void this.loadBoardQuizLeaderboard(board.id);
    }
  }

  closeBoardLearn(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.boardLearnOpen.set(false);
    this.boardLearnView.set('menu');
    this.boardLearnActiveQuiz.set(null);
    this.boardLearnQuizGrade.set(null);
    this.boardLearnQuizStatus.set(null);
    this.boardLearnQuizError.set(null);
    this.boardLearnQuizShareStatus.set(null);
    this.boardLearnQuizShareMode.set(null);
  }

  returnToBoardLearnMenu(): void {
    this.boardLearnView.set('menu');
    this.boardLearnActiveQuiz.set(null);
    this.boardLearnQuizGrade.set(null);
    this.boardLearnQuizStatus.set(null);
    this.boardLearnQuizError.set(null);
    this.boardLearnQuizShareStatus.set(null);
    this.boardLearnQuizShareMode.set(null);
  }

  boardQuizEligibleCount(board: Board): number {
    return boardQuizEligibleCardCount(board.cards);
  }

  startBoardStudy(sourceCardId?: string): void {
    const board = this.boardLearnBoard();
    if (!board?.cards.length) {
      return;
    }
    const index = sourceCardId ? board.cards.findIndex((card) => card.id === sourceCardId) : 0;
    this.boardLearnStudyIndex.set(index >= 0 ? index : 0);
    this.boardLearnStudyRevealed.set(false);
    this.boardLearnView.set('study');
  }

  stepBoardStudy(direction: number): void {
    const board = this.boardLearnBoard();
    if (!board?.cards.length) {
      return;
    }
    const next = (this.boardLearnStudyIndex() + direction + board.cards.length) % board.cards.length;
    this.boardLearnStudyIndex.set(next);
    this.boardLearnStudyRevealed.set(false);
  }

  toggleBoardStudyReveal(): void {
    this.boardLearnStudyRevealed.update((revealed) => !revealed);
  }

  openBoardQuizEditor(regenerate = false): void {
    const board = this.boardLearnBoard();
    if (!board || !this.canEditBoard(board)) {
      return;
    }
    const draft = !regenerate ? this.cloneBoardLearningQuiz(board.learningQuiz) : null;
    const generated = draft ?? buildBoardLearningQuiz(board);
    if (!generated) {
      this.boardLearnQuizError.set($localize`Add at least three cards with a subtitle, summary, notes, or tags before making a quiz.`);
      return;
    }
    this.boardLearnQuizDraft.set({ ...generated, published: false, updatedAt: new Date().toISOString() });
    this.boardLearnQuizStatus.set(null);
    this.boardLearnQuizError.set(null);
    this.boardLearnView.set('quiz-edit');
  }

  updateBoardQuizField(field: 'title' | 'description', value: string): void {
    this.boardLearnQuizDraft.update((draft) => draft ? {
      ...draft,
      [field]: value.slice(0, field === 'title' ? 120 : 300),
      updatedAt: new Date().toISOString(),
    } : null);
  }

  updateBoardQuizSetting(field: 'leaderboardEnabled' | 'allowGuestNames', value: boolean): void {
    this.boardLearnQuizDraft.update((draft) => draft ? {
      ...draft,
      [field]: value,
      allowGuestNames: field === 'leaderboardEnabled' && !value ? false : draft.allowGuestNames,
      updatedAt: new Date().toISOString(),
    } : null);
  }

  updateBoardQuizQuestion(
    questionId: string,
    field: 'prompt' | 'explanation',
    value: string,
  ): void {
    this.boardLearnQuizDraft.update((draft) => draft ? {
      ...draft,
      questions: draft.questions.map((question) => question.id === questionId ? {
        ...question,
        [field]: value.slice(0, field === 'prompt' ? 360 : 500),
      } : question),
      updatedAt: new Date().toISOString(),
    } : null);
  }

  updateBoardQuizOption(questionId: string, optionId: string, value: string): void {
    this.boardLearnQuizDraft.update((draft) => draft ? {
      ...draft,
      questions: draft.questions.map((question) => question.id === questionId ? {
        ...question,
        options: question.options.map((option) => option.id === optionId
          ? { ...option, text: value.slice(0, 160) }
          : option),
      } : question),
      updatedAt: new Date().toISOString(),
    } : null);
  }

  setBoardQuizCorrectOption(questionId: string, optionId: string): void {
    this.boardLearnQuizDraft.update((draft) => draft ? {
      ...draft,
      questions: draft.questions.map((question) => question.id === questionId
        ? { ...question, correctOptionId: optionId }
        : question),
      updatedAt: new Date().toISOString(),
    } : null);
  }

  removeBoardQuizQuestion(questionId: string): void {
    this.boardLearnQuizDraft.update((draft) => draft ? {
      ...draft,
      questions: draft.questions.filter((question) => question.id !== questionId),
      updatedAt: new Date().toISOString(),
    } : null);
  }

  previewBoardQuiz(): void {
    const draft = normalizeBoardLearningQuiz(this.boardLearnQuizDraft());
    if (!draft || draft.questions.length < 3) {
      this.boardLearnQuizError.set($localize`Keep at least three complete questions before previewing.`);
      return;
    }
    this.beginBoardQuiz(draft);
  }

  async publishBoardQuiz(): Promise<void> {
    const board = this.boardLearnBoard();
    const draft = normalizeBoardLearningQuiz(this.boardLearnQuizDraft());
    if (!board || !this.canEditBoard(board) || !draft || !this.boardLearnCanPublishQuiz()) {
      return;
    }
    const now = new Date().toISOString();
    const published: BoardLearningQuiz = {
      ...draft,
      published: true,
      createdAt: board.learningQuiz?.createdAt || draft.createdAt || now,
      updatedAt: now,
    };
    this.boardLearnQuizSaving.set(true);
    this.boardLearnQuizError.set(null);
    try {
      const persisted = await this.persistBoard({ ...board, learningQuiz: published, updatedAt: now });
      this.boards.update((boards) => boards.map((item) => item.id === persisted.id ? persisted : item));
      this.boardLearnQuizDraft.set(this.cloneBoardLearningQuiz(published));
      this.boardLearnQuizStatus.set($localize`Quiz published. Everyone with access to this board can take it.`);
      this.boardLearnView.set('menu');
      void this.loadBoardQuizStats(board.id);
      void this.loadBoardQuizLeaderboard(board.id);
    } catch (error) {
      console.error('Board quiz publish failed', error, { boardId: board.id });
      this.boardLearnQuizError.set($localize`Could not publish this quiz. Please try again.`);
    } finally {
      this.boardLearnQuizSaving.set(false);
    }
  }

  openBoardQuizWelcome(): void {
    const quiz = normalizeBoardLearningQuiz(this.boardLearnBoard()?.learningQuiz);
    if (!quiz?.published || quiz.questions.length < 3) {
      this.boardLearnQuizError.set($localize`This board does not have a published quiz yet.`);
      return;
    }
    this.boardLearnQuizStatus.set(null);
    this.boardLearnQuizError.set(null);
    this.boardLearnQuizShareStatus.set(null);
    this.boardLearnView.set('quiz-welcome');
    const board = this.boardLearnBoard();
    if (board) {
      void this.loadBoardQuizLeaderboard(board.id);
    }
  }

  startPublishedBoardQuiz(): void {
    const quiz = normalizeBoardLearningQuiz(this.boardLearnBoard()?.learningQuiz);
    if (!quiz?.published || quiz.questions.length < 3) {
      this.boardLearnQuizError.set($localize`This board does not have a published quiz yet.`);
      return;
    }
    this.beginBoardQuiz(quiz);
  }

  selectBoardQuizAnswer(optionId: string): void {
    const question = this.boardLearnCurrentQuestion();
    if (!question || this.boardLearnCurrentAnswer()) {
      return;
    }
    this.boardLearnQuizAnswers.update((answers) => ({ ...answers, [question.id]: optionId }));
  }

  boardQuizOptionState(question: BoardLearningQuizQuestion, optionId: string): string {
    const selected = this.boardLearnQuizAnswers()[question.id];
    if (!selected) {
      return '';
    }
    if (optionId === question.correctOptionId) {
      return 'correct';
    }
    return selected === optionId ? 'incorrect' : '';
  }

  async advanceBoardQuiz(): Promise<void> {
    const quiz = this.boardLearnActiveQuiz();
    const question = this.boardLearnCurrentQuestion();
    if (!quiz || !question || !this.boardLearnQuizAnswers()[question.id]) {
      return;
    }
    if (this.boardLearnQuizIndex() < quiz.questions.length - 1) {
      this.boardLearnQuizIndex.update((index) => index + 1);
      return;
    }
    await this.finishBoardQuiz();
  }

  reviewBoardQuizSource(question: BoardLearningQuizQuestion): void {
    this.startBoardStudy(question.sourceCardId);
  }

  boardQuizResultFor(questionId: string) {
    return this.boardLearnQuizGrade()?.results.find((result) => result.questionId === questionId) ?? null;
  }

  async retryBoardQuiz(): Promise<void> {
    const quiz = this.boardLearnActiveQuiz() ?? normalizeBoardLearningQuiz(this.boardLearnBoard()?.learningQuiz);
    if (quiz) {
      this.beginBoardQuiz(quiz);
    }
  }

  private beginBoardQuiz(quiz: BoardLearningQuiz): void {
    this.boardLearnActiveQuiz.set(this.cloneBoardLearningQuiz(quiz));
    this.boardLearnQuizIndex.set(0);
    this.boardLearnQuizAnswers.set({});
    this.boardLearnQuizGrade.set(null);
    this.boardLearnQuizStatus.set(null);
    this.boardLearnQuizError.set(null);
    this.boardLearnQuizGuestSkipped.set(false);
    this.boardLearnQuizScoreSaved.set(false);
    this.boardLearnQuizShareStatus.set(null);
    this.boardLearnStartedAt = Date.now();
    this.boardLearnElapsedMs = 0;
    this.boardLearnView.set('quiz-play');
  }

  private async finishBoardQuiz(): Promise<void> {
    const board = this.boardLearnBoard();
    const quiz = this.boardLearnActiveQuiz();
    if (!board || !quiz) {
      return;
    }
    const answers = Object.entries(this.boardLearnQuizAnswers())
      .map(([questionId, optionId]) => ({ questionId, optionId }));
    const grade = gradeBoardLearningQuiz(quiz, answers);
    this.boardLearnElapsedMs = Math.max(0, Date.now() - this.boardLearnStartedAt);
    this.boardLearnQuizGrade.set(grade);
    this.boardLearnView.set('quiz-result');
    if (!quiz.published) {
      this.boardLearnQuizStatus.set($localize`Preview complete. Publish the quiz to record scores.`);
      return;
    }
    if (!this.authService.uid()) {
      this.boardLearnQuizStatus.set(
        quiz.leaderboardEnabled && quiz.allowGuestNames
          ? $localize`Your score is ready. Add a name to join the leaderboard, or keep it private.`
          : $localize`Score ready. Sign in to save your result.`,
      );
      return;
    }
    await this.submitBoardQuizAttempt();
  }

  private async submitBoardQuizAttempt(guestName = ''): Promise<void> {
    const board = this.boardLearnBoard();
    const quiz = this.boardLearnActiveQuiz();
    if (!board || !quiz || !this.functions) {
      return;
    }
    const answers = Object.entries(this.boardLearnQuizAnswers())
      .map(([questionId, optionId]) => ({ questionId, optionId }));
    this.boardLearnQuizSubmitting.set(true);
    try {
      const callable = httpsCallable<{
        boardId: string;
        quizId: string;
        answers: Array<{ questionId: string; optionId: string }>;
        elapsedMs: number;
        guestName?: string;
        guestSessionId?: string;
      }, { grade?: BoardLearningQuizGrade; leaderboardSaved?: boolean }>(
        this.functions,
        'submitBoardQuizAttempt',
      );
      const response = await callable({
        boardId: board.id,
        quizId: quiz.id,
        answers,
        elapsedMs: this.boardLearnElapsedMs,
        ...(guestName ? {
          guestName,
          guestSessionId: this.boardQuizGuestSessionId(board, quiz),
        } : {}),
      });
      if (response.data.grade) {
        this.boardLearnQuizGrade.set(response.data.grade);
      }
      this.boardLearnQuizScoreSaved.set(true);
      this.boardLearnQuizStatus.set(
        response.data.leaderboardSaved
          ? $localize`Your score is on the leaderboard.`
          : $localize`Your score was saved to this board.`,
      );
      await this.loadBoardQuizLeaderboard(board.id);
    } catch (error) {
      console.error('Board quiz score save failed', error, { boardId: board.id });
      this.boardLearnQuizStatus.set($localize`Your score is ready, but it could not be saved.`);
    } finally {
      this.boardLearnQuizSubmitting.set(false);
    }
  }

  async submitGuestBoardQuizScore(): Promise<void> {
    const name = this.boardLearnQuizGuestName().replace(/\s+/g, ' ').trim();
    if (name.length < 2) {
      this.boardLearnQuizError.set($localize`Enter at least two characters for your leaderboard name.`);
      return;
    }
    this.boardLearnQuizGuestPosting.set(true);
    this.boardLearnQuizError.set(null);
    try {
      await this.submitBoardQuizAttempt(name.slice(0, 40));
    } finally {
      this.boardLearnQuizGuestPosting.set(false);
    }
  }

  keepGuestBoardQuizScorePrivate(): void {
    this.boardLearnQuizGuestSkipped.set(true);
    this.boardLearnQuizStatus.set($localize`Your score stayed private.`);
    this.boardLearnQuizError.set(null);
  }

  boardQuizElapsedLabel(elapsedMs: number): string {
    const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
  }

  boardQuizAvatarInitials(displayName: string): string {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return '•';
    }
    const first = parts[0]?.charAt(0) ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? '' : '';
    return `${first}${last}`.toLocaleUpperCase(this.localeId);
  }

  boardQuizAvatarHue(displayName: string): number {
    const hash = Array.from(displayName).reduce(
      (value, character) => ((value * 31) + (character.codePointAt(0) ?? 0)) >>> 0,
      0,
    );
    return hash % 360;
  }

  boardQuizShareUrl(board: Board): string {
    if (board.visibility === 'public') {
      const version = encodeURIComponent(board.updatedAt || board.id);
      return `${PUBLIC_APP_URL}/share/board/${encodeURIComponent(board.id)}?v=${version}&learn=quiz`;
    }
    const path = `${this.boardPagePath(board)}?learn=quiz`;
    if (!this.isBrowser) {
      return path;
    }
    return `${window.location.origin}${path}`;
  }

  async copyBoardQuizUrl(board: Board): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    if (await this.copyTextToClipboard(this.boardQuizShareUrl(board))) {
      this.boardLearnQuizShareStatus.set($localize`Quiz link copied.`);
    } else {
      this.boardLearnQuizShareStatus.set($localize`Copy was blocked. Try the share button instead.`);
    }
  }

  openBoardQuizShare(includeScore = false): void {
    this.boardLearnQuizShareStatus.set(null);
    this.boardLearnQuizShareMode.set(includeScore ? 'score' : 'invite');
  }

  closeBoardQuizShare(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.boardLearnQuizShareMode.set(null);
    this.boardLearnQuizShareStatus.set(null);
  }

  boardQuizShareTitle(board: Board): string {
    return normalizeBoardLearningQuiz(board.learningQuiz)?.title || board.title;
  }

  boardQuizShareText(board: Board, mode = this.boardLearnQuizShareMode()): string {
    const quizTitle = this.boardQuizShareTitle(board);
    const grade = mode === 'score' ? this.boardLearnQuizGrade() : null;
    return grade
      ? `${$localize`I scored`} ${grade.score}/${grade.total} ${$localize`on`} “${quizTitle}”. ${$localize`Can you beat my score?`}`
      : `${$localize`Take`} “${quizTitle}” ${$localize`and see how well you know this board.`}`;
  }

  shareBoardQuizTo(board: Board, target: BoardQuizShareTarget): void {
    if (!this.isBrowser) {
      return;
    }
    const url = this.boardQuizShareUrl(board);
    const text = this.boardQuizShareText(board);
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(text);
    const destination = target === 'whatsapp'
      ? `https://wa.me/?text=${encodedText}%0A${encodedUrl}`
      : target === 'facebook'
        ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
        : `https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
    const popup = window.open(destination, '_blank', 'noopener,noreferrer');
    this.boardLearnQuizShareStatus.set(
      popup
        ? target === 'whatsapp'
          ? $localize`WhatsApp opened with your challenge.`
          : target === 'facebook'
            ? $localize`Facebook opened with your quiz link.`
            : $localize`X opened with your challenge.`
        : $localize`Your browser blocked the social window. Copy the link instead.`,
    );
  }

  async shareBoardQuizMore(board: Board): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const text = this.boardQuizShareText(board);
    try {
      if (navigator.share) {
        await navigator.share({
          title: this.boardQuizShareTitle(board),
          text,
          url: this.boardQuizShareUrl(board),
        });
        this.boardLearnQuizShareStatus.set($localize`More sharing options opened.`);
        return;
      }
      if (await this.copyTextToClipboard(`${text}\n${this.boardQuizShareUrl(board)}`)) {
        this.boardLearnQuizShareStatus.set($localize`Challenge message copied.`);
      } else {
        this.boardLearnQuizShareStatus.set($localize`Copy was blocked. Try copying the link instead.`);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      this.boardLearnQuizShareStatus.set($localize`More sharing options could not be opened.`);
    }
  }

  private async loadBoardQuizStats(boardId: string): Promise<void> {
    if (!this.functions || !this.authService.uid()) {
      return;
    }
    this.boardLearnQuizStatsLoading.set(true);
    try {
      const callable = httpsCallable<{ boardId: string }, { stats?: BoardLearningQuizStats }>(
        this.functions,
        'getBoardQuizStats',
      );
      const response = await callable({ boardId });
      this.boardLearnQuizStats.set(response.data.stats ?? null);
    } catch {
      this.boardLearnQuizStats.set(null);
    } finally {
      this.boardLearnQuizStatsLoading.set(false);
    }
  }

  private async loadBoardQuizLeaderboard(boardId: string): Promise<void> {
    const board = this.boards().find((item) => item.id === boardId) ?? this.boardLearnBoard();
    const quiz = normalizeBoardLearningQuiz(board?.learningQuiz);
    if (!this.functions || !board || !quiz?.published) {
      this.boardLearnQuizLeaderboard.set(null);
      return;
    }
    this.boardLearnQuizLeaderboardLoading.set(true);
    try {
      const callable = httpsCallable<{
        boardId: string;
        guestSessionId?: string;
      }, { leaderboard?: BoardLearningQuizLeaderboard }>(
        this.functions,
        'getBoardQuizLeaderboard',
      );
      const response = await callable({
        boardId,
        ...(!this.authService.uid()
          ? { guestSessionId: this.boardQuizGuestSessionId(board, quiz) }
          : {}),
      });
      this.boardLearnQuizLeaderboard.set(response.data.leaderboard ?? null);
    } catch {
      this.boardLearnQuizLeaderboard.set(null);
    } finally {
      this.boardLearnQuizLeaderboardLoading.set(false);
    }
  }

  private boardQuizGuestSessionId(board: Board, quiz: BoardLearningQuiz): string {
    if (!this.isBrowser) {
      return '';
    }
    const key = `livingwiki-quiz-guest:${board.id}:${quiz.id}`;
    const existing = window.localStorage.getItem(key);
    if (existing && /^[A-Za-z0-9_-]{16,120}$/.test(existing)) {
      return existing;
    }
    const sessionId = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${this.createId()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, sessionId);
    return sessionId;
  }

  private syncBoardLearnDirectView(): void {
    if (!this.boardLearnDirectRequested) {
      return;
    }
    const board = this.selectedBoard();
    const quiz = normalizeBoardLearningQuiz(board?.learningQuiz);
    if (!board || !quiz?.published) {
      return;
    }
    const directKey = `${board.id}:${quiz.id}:${quiz.updatedAt}`;
    if (this.boardLearnDirectOpenedFor === directKey) {
      return;
    }
    this.boardLearnDirectOpenedFor = directKey;
    this.openBoardLearn(board);
    this.openBoardQuizWelcome();
  }

  private cloneBoardLearningQuiz(value: unknown): BoardLearningQuiz | null {
    const quiz = normalizeBoardLearningQuiz(value);
    return quiz ? {
      ...quiz,
      questions: quiz.questions.map((question) => ({
        ...question,
        options: question.options.map((option) => ({ ...option })),
      })),
    } : null;
  }

  toggleBoardTranslationMenu(): void {
    this.boardTranslationMenuOpen.update((open) => !open);
  }

  closeBoardTranslationMenu(): void {
    this.boardTranslationMenuOpen.set(false);
  }

  boardTranslationControlLabel(): string {
    if (this.boardTranslationLoading()) {
      return $localize`Translating…`;
    }
    const target = this.boardTranslationActive()
      ? this.boardTranslationResult()?.targetLanguage
      : null;
    return target
      ? boardTranslationLanguageName(target)
      : $localize`Translate`;
  }

  boardTranslationSourceLabel(): string {
    const source = this.boardTranslationResult()?.sourceLanguage ?? 'en';
    return boardTranslationLanguageName(source);
  }

  boardTranslationTargetLabel(): string {
    const target = this.boardTranslationResult()?.targetLanguage
      ?? this.boardTranslationTarget()
      ?? 'en';
    return boardTranslationLanguageName(target);
  }

  selectBoardTranslation(language: BoardTranslationLanguage, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.closeBoardTranslationMenu();
    if (!this.isBrowser || !this.originalSelectedBoard()) {
      return;
    }

    const targetLocale = supportedLocale(language);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, targetLocale.id);
    const currentLocale = supportedLocale(this.localeId);
    if (targetLocale.id !== currentLocale.id) {
      const query = new URLSearchParams(window.location.search);
      query.set('contentLang', language);
      const targetPath = localizedPath(window.location.pathname, targetLocale);
      window.location.assign(`${targetPath}?${query.toString()}${window.location.hash}`);
      return;
    }

    if (this.boardTranslationResult()?.targetLanguage !== language) {
      this.boardTranslationResult.set(null);
      this.boardTranslationVersion.set('');
    }
    this.boardTranslationTarget.set(language);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { contentLang: language },
      queryParamsHandling: 'merge',
    });
    void this.syncRequestedBoardTranslation();
  }

  showOriginalBoard(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.closeBoardTranslationMenu();
    this.boardTranslationRun += 1;
    this.boardTranslationRequestKey = '';
    this.boardTranslationTarget.set(null);
    this.boardTranslationResult.set(null);
    this.boardTranslationVersion.set('');
    this.boardTranslationError.set(null);
    this.boardTranslationLoading.set(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { contentLang: null },
      queryParamsHandling: 'merge',
    });
  }

  private async syncRequestedBoardTranslation(): Promise<void> {
    const board = this.originalSelectedBoard();
    const targetLanguage = this.boardTranslationTarget();
    if (!board || !targetLanguage || !this.functions) {
      return;
    }
    const current = this.boardTranslationResult();
    if (current?.boardId === board.id
      && current.targetLanguage === targetLanguage
      && this.boardTranslationVersion() === board.updatedAt) {
      return;
    }
    const requestKey = `${board.id}:${board.updatedAt}:${targetLanguage}`;
    if (this.boardTranslationLoading() && this.boardTranslationRequestKey === requestKey) {
      return;
    }

    const run = ++this.boardTranslationRun;
    this.boardTranslationRequestKey = requestKey;
    this.boardTranslationLoading.set(true);
    this.boardTranslationError.set(null);
    try {
      const callable = httpsCallable<
        { boardId: string; targetLanguage: BoardTranslationLanguage },
        unknown
      >(this.functions, 'translateBoard');
      const response = await callable({ boardId: board.id, targetLanguage });
      const result = normalizeBoardTranslationResult(response.data);
      if (!result || result.boardId !== board.id || result.targetLanguage !== targetLanguage) {
        throw new Error('The translation response was incomplete.');
      }
      if (run !== this.boardTranslationRun
        || this.selectedBoardId() !== board.id
        || this.boardTranslationTarget() !== targetLanguage) {
        return;
      }
      this.boardTranslationResult.set(result);
      this.boardTranslationVersion.set(board.updatedAt);
    } catch (error) {
      if (run !== this.boardTranslationRun) {
        return;
      }
      console.error('Board translation failed', error, {
        boardId: board.id,
        targetLanguage,
      });
      const code = error instanceof FirebaseError ? error.code : '';
      this.boardTranslationError.set(
        code.includes('resource-exhausted')
          ? $localize`Translation is temporarily busy. Please try again in a little while.`
          : code.includes('permission-denied')
            ? $localize`This board cannot be translated from this view.`
            : $localize`We could not translate this board right now. Please try again.`,
      );
    } finally {
      if (run === this.boardTranslationRun) {
        this.boardTranslationLoading.set(false);
        this.boardTranslationRequestKey = '';
      }
    }
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

  canEditBoard(board: Board | null | undefined): boolean {
    if (!board) {
      return false;
    }
    if (this.boardTranslationActive() && board.id === this.selectedBoardId()) {
      return false;
    }
    const uid = this.authService.uid();
    return !!uid && board.ownerUserId === uid;
  }

  canForkBoard(board: Board | null | undefined): boolean {
    const uid = this.authService.uid();
    return !!board && !!uid && !!board.ownerUserId && board.ownerUserId !== uid;
  }

  async forkBoard(board: Board, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canForkBoard(board)) {
      return;
    }
    const now = new Date().toISOString();
    const forked: Board = {
      ...board,
      ...this.currentOwnerSnapshot(),
      id: this.createId(),
      sortOrder: this.nextBoardSortOrder(),
      forkedFromBoardId: board.forkedFromBoardId || board.id,
      forkedFromTitle: board.forkedFromTitle || board.title,
      forkedFromOwnerUserId: board.forkedFromOwnerUserId || board.ownerUserId,
      forkedFromOwnerName: board.forkedFromOwnerName || this.ownerName(board),
      socialVideoUrl: '',
      socialVideoMimeType: '',
      socialVideoUpdatedAt: '',
      socialVideoRatio: 'vertical',
      socialVideoAudioTrackId: DEFAULT_STACK_AUDIO_TRACK_ID,
      socialVideoAudioVolume: DEFAULT_STACK_AUDIO_VOLUME,
      cards: board.cards.map((card) => ({
        ...card,
        id: this.createId(),
        stickers: card.stickers.map((sticker) => ({ ...sticker })),
        tour: card.tour
          ? {
              ...card.tour,
              legToNext: card.tour.legToNext ? { ...card.tour.legToNext } : null,
            }
          : null,
        createdAt: now,
        updatedAt: now,
      })),
      stickers: board.stickers.map((sticker) => ({ ...sticker })),
      tourMeta: board.tourMeta ? { ...board.tourMeta, extras: [...board.tourMeta.extras] } : null,
      learningQuiz: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const persisted = await this.persistBoard(forked);
      this.boards.update((boards) => [persisted, ...boards]);
      this.boardsSyncError.set(null);
      this.setShareMessage('Added a copy to your boards.');
      void this.router.navigate(['/boards', persisted.id]);
    } catch (error) {
      console.error('Board fork failed', error, { boardId: board.id });
      this.boardsSyncError.set($localize`Could not make a copy of this board. Please try again.`);
    }
  }

  toggleBoardLike(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.toggleActionSet(this.likedBoardIds, board.id);
    this.saveBoardActionState();
  }

  toggleBoardSave(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.toggleActionSet(this.savedBoardIds, board.id);
    this.saveBoardActionState();
  }

  toggleCardLike(board: Board, card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.toggleActionSet(this.likedCardIds, this.cardActionId(board, card));
    this.saveBoardActionState();
  }

  isBoardLiked(board: Board | null | undefined): boolean {
    return !!board && this.likedBoardIds().has(board.id);
  }

  isBoardSaved(board: Board | null | undefined): boolean {
    return !!board && this.savedBoardIds().has(board.id);
  }

  isCardLiked(board: Board | null | undefined, card: BoardCard): boolean {
    return !!board && this.likedCardIds().has(this.cardActionId(board, card));
  }

  private toggleActionSet(target: WritableSignal<Set<string>>, id: string): void {
    target.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  private cardActionId(board: Board, card: BoardCard): string {
    return `${board.id}:${card.id}`;
  }

  private loadBoardActionState(): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      const raw = window.localStorage.getItem(this.boardActionStorageKey());
      const data = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      this.likedBoardIds.set(this.stringSet(data['likedBoardIds']));
      this.savedBoardIds.set(this.stringSet(data['savedBoardIds']));
      this.likedCardIds.set(this.stringSet(data['likedCardIds']));
    } catch {
      this.likedBoardIds.set(new Set());
      this.savedBoardIds.set(new Set());
      this.likedCardIds.set(new Set());
    }
  }

  private saveBoardActionState(): void {
    if (!this.isBrowser) {
      return;
    }
    window.localStorage.setItem(this.boardActionStorageKey(), JSON.stringify({
      likedBoardIds: [...this.likedBoardIds()],
      savedBoardIds: [...this.savedBoardIds()],
      likedCardIds: [...this.likedCardIds()],
    }));
  }

  private boardActionStorageKey(): string {
    return `${BOARD_ACTIONS_STORAGE_KEY}:${this.authService.uid() || 'guest'}`;
  }

  private stringSet(value: unknown): Set<string> {
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  }

  isSongDeleteCandidate(candidate: CardDeleteCandidate): boolean {
    const board = this.boards().find((item) => item.id === candidate.boardId) ?? null;
    return this.isSongCard(candidate.card) || (!!board && this.isSongBoard(board));
  }

  canUseStackStudio(board: Board | null | undefined): boolean {
    if (!board) {
      return false;
    }
    if (this.boardTranslationActive() && board.id === this.selectedBoardId()) {
      return false;
    }
    const uid = this.authService.uid();
    return !!uid && board.ownerUserId === uid;
  }

  canUsePrivateBoards(): boolean {
    return this.authService.isAdmin() || this.authService.hasActivePersonalWikiPlan();
  }

  private redirectToPrivateBoardsPricing(): void {
    this.boardsSyncError.set($localize`Private boards are available on paid plans.`);
    void this.router.navigate(['/pricing'], { queryParams: { feature: 'private-boards' } });
  }

  ownerName(board: Board): string {
    const name = board.ownerDisplayName.trim();
    if (name) {
      return name;
    }
    if (this.canEditBoard(board)) {
      return this.userName();
    }
    return 'LivingWiki curator';
  }

  forkAttributionLabel(board: Board): string {
    return board.forkedFromOwnerName ? `Copied from ${board.forkedFromOwnerName}` : '';
  }

  ownerPhotoUrl(board: Board): string {
    return board.ownerProfilePictureType === 'image' ? board.ownerPhotoUrl : '';
  }

  ownerIcon(board: Board): ReturnType<typeof profileIconForSeed> {
    return (
      profileIconByCode(board.ownerProfileIcon) ??
      profileIconForSeed(board.ownerUserId || this.ownerName(board))
    );
  }

  toggleSharePanel(): void {
    this.sharePanelOpen.update((open) => !open);
    this.setShareMessage(null);
  }

  boardRouteRoot(board: Board | null = this.selectedBoard()): string {
    if (this.songsPage() && (!board || this.isSongBoard(board))) {
      return '/songs';
    }
    if (this.tripsPage() && (!board || this.isTourBoard(board))) {
      return '/trips';
    }
    return '/boards';
  }

  boardShareUrl(board: Board): string {
    const publicQuery = new URLSearchParams({
      v: board.updatedAt || board.id,
      ui: supportedLocale(this.localeId).language,
    });
    const translation = this.boardTranslationResult();
    if (this.boardTranslationActive()
      && translation?.boardId === board.id
      && translation.targetLanguage !== translation.sourceLanguage) {
      publicQuery.set('lang', translation.targetLanguage);
    }
    const path = board.visibility === 'public'
      ? `/share/board/${encodeURIComponent(board.id)}?${publicQuery.toString()}`
      : this.boardPagePath(board);
    if (board.visibility === 'public') {
      return `${PUBLIC_APP_URL}${path}`;
    }
    if (!this.isBrowser) {
      return path;
    }
    return `${window.location.origin}${path}`;
  }

  private boardPagePath(board: Board): string {
    const route = this.boardRouteRoot(board).slice(1);
    return `/${route}/${encodeURIComponent(board.id)}`;
  }

  boardPageUrl(board: Board): string {
    const path = this.boardPagePath(board);
    if (!this.isBrowser) {
      return path;
    }
    return `${window.location.origin}${path}`;
  }

  boardsProfileShareUrl(): string {
    const path = this.boardsProfileRoutePath();
    if (path === '/boards') {
      return '';
    }
    if (!this.isBrowser) {
      return path;
    }
    return `${window.location.origin}${path}`;
  }

  stackShareUrl(board: Board): string {
    if (board.visibility !== 'public') {
      return `${this.boardPageUrl(board)}?view=stack`;
    }
    const separator = this.boardShareUrl(board).includes('?') ? '&' : '?';
    return `${this.boardShareUrl(board)}${separator}view=stack`;
  }

  stackSocialShareUrl(board: Board): string {
    return this.stackShareUrl(board);
  }

  async copyBoardsProfileUrl(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    const url = this.boardsProfileShareUrl();
    if (!url) {
      this.setShareMessage('Sign in to get your public boards link.');
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      this.setShareMessage('Boards link copied.');
    } catch {
      this.setShareMessage('Copy blocked. The boards link is visible here.');
    }
  }

  async nativeShareBoardsProfile(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    const url = this.boardsProfileShareUrl();
    if (!url) {
      this.setShareMessage('Sign in to get your public boards link.');
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${this.boardsProfileName()} boards`,
          text: 'Explore these LivingWiki boards.',
          url,
        });
        this.setShareMessage('Share sheet opened.');
        return;
      }

      await this.copyBoardsProfileUrl();
    } catch {
      this.setShareMessage('Share was cancelled or blocked.');
    }
  }

  async copyBoardUrl(board: Board): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    const url = this.boardShareUrl(board);
    if (await this.copyTextToClipboard(url)) {
      this.setShareMessage('Board link copied.');
    } else {
      this.setShareMessage('Copy blocked. The link is visible here.');
    }
  }

  async copyStackUrl(board: Board): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    const url = this.stackShareUrl(board);
    if (await this.copyTextToClipboard(url)) {
      if (this.stackStudioOpen() || this.stackDirectView() || this.stackShareDialogOpen()) {
        this.setStackShareMessage('Live view link copied.');
      } else {
        this.setShareMessage('Live view link copied.');
      }
    } else {
      if (this.stackStudioOpen() || this.stackDirectView() || this.stackShareDialogOpen()) {
        this.setStackShareMessage('Copy blocked. The live view link is visible here.');
      } else {
        this.setShareMessage('Copy blocked. The live view link is visible here.');
      }
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
        this.setShareMessage('Share sheet opened.');
        return;
      }

      await this.copyBoardUrl(board);
    } catch {
      this.setShareMessage('Share was cancelled or blocked.');
    }
  }

  openStackStudio(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canUseStackStudio(board)) {
      this.sharePanelOpen.set(true);
      this.setShareMessage('Only the board owner can open Studio.');
      return;
    }
    this.prepareStackForBoard(board);
    this.sharePanelOpen.set(false);
    this.stackStudioOpen.set(true);
  }

  openStackView(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.prepareStackForBoard(board);
    this.unlockStackNarrationAudio();
    this.stackStudioOpen.set(false);
    this.stackShareDialogOpen.set(false);
    this.sharePanelOpen.set(false);
    this.stackTourNarrationConsent.set(true);
    this.stackDirectView.set(true);
    this.startStackPlayback();
    void this.router.navigate([this.boardRouteRoot(board), board.id], { queryParams: { view: 'stack' } });
  }

  openLiveCardVersion(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.prepareStackForBoard(board);
    this.unlockStackNarrationAudio();
    this.stackStudioOpen.set(false);
    this.stackShareDialogOpen.set(false);
    this.sharePanelOpen.set(false);
    this.stackTourNarrationConsent.set(true);
    this.stackDirectView.set(true);
    this.startStackPlayback();
    void this.router.navigate(['/boards', board.id], { queryParams: { view: 'stack' } });
  }

  closeStackView(board: Board): void {
    this.stopSongPreview();
    this.stopStackPlayback();
    this.stackDirectView.set(false);
    this.stackShareDialogOpen.set(false);
    void this.router.navigate([this.boardRouteRoot(board), board.id]);
  }

  closeStackStudio(): void {
    this.stopSongPreview();
    this.stopStackAudioPreview();
    this.stopStackPlayback();
    this.stackStudioOpen.set(false);
    this.setStackShareMessage(null);
  }

  openStackShareDialog(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.stackStudioBoardId() !== board.id) {
      this.prepareStackForBoard(board);
    }
    this.stackShareMode.set('video');
    this.stackShareDialogOpen.set(true);
    this.stackPublishedVideoReady.set(this.publishedStackVideoFiles.has(board.id));
    if (board.socialVideoUrl && !this.publishedStackVideoFiles.has(board.id)) {
      void this.preloadPublishedStackVideo(board);
    }
    void this.preloadStackAudioUrls();
  }

  closeStackShareDialog(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.stackShareDialogOpen.set(false);
  }

  setStackShareMode(mode: StackShareMode): void {
    this.stackShareMode.set(mode);
    this.setStackShareMessage(null);
  }

  isStackCardSelected(cardId: string): boolean {
    return this.stackSelectedCardIds().has(cardId);
  }

  toggleStackCard(cardId: string): void {
    this.stopStackPlayback();
    this.stackSelectedCardIds.update((selected) => {
      const next = new Set(selected);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
    this.clampStackFrameIndex();
  }

  selectAllStackCards(board: Board): void {
    this.stackSelectedCardIds.set(new Set(board.cards.map((card) => card.id)));
    this.clampStackFrameIndex();
  }

  clearStackCards(): void {
    this.stopStackPlayback();
    this.stackSelectedCardIds.set(new Set());
    this.clampStackFrameIndex();
  }

  setStackFormat(format: StackFormat): void {
    this.stackFormat.set(format);
  }

  setStackRatio(ratio: StackRatio): void {
    this.stackRatio.set(ratio);
  }

  selectStackAudioTrack(board: Board, trackId: string): void {
    const normalizedTrackId = normalizeStackAudioTrackId(trackId);
    if (this.stackAudioTrackId() === normalizedTrackId) return;
    this.stopStackAudioPreview();
    this.stackAudioTrackId.set(normalizedTrackId);
    this.stackAudioError.set(null);
    this.saveStackAudioPreferences(board);
  }

  updateStackAudioVolume(value: string | number): void {
    const volume = normalizeStackAudioVolume(Number(value));
    this.stackAudioVolume.set(volume);
    if (this.stackAudioPreview) {
      this.stackAudioPreview.volume = this.stackAudioPreviewVolume(volume);
    }
  }

  commitStackAudioVolume(board: Board): void {
    this.saveStackAudioPreferences(board);
  }

  isStackAudioPreviewing(trackId: string): boolean {
    return this.stackAudioPreviewingId() === trackId;
  }

  async toggleStackAudioPreview(track: StackAudioTrack, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.isBrowser) return;
    if (this.isStackAudioPreviewing(track.id)) {
      this.stopStackAudioPreview();
      return;
    }

    this.stopSongPreview();
    this.stopStackAudioPreview();
    const run = ++this.stackAudioPreviewRun;
    this.stackAudioPreviewLoadingId.set(track.id);
    this.stackAudioError.set(null);
    try {
      const url = this.stackAudioTrackUrl(track);
      if (run !== this.stackAudioPreviewRun) return;
      const audio = new Audio(url);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = this.stackAudioPreviewVolume(this.stackAudioVolume());
      audio.onended = () => {
        if (this.stackAudioPreview === audio) this.stopStackAudioPreview();
      };
      audio.onerror = () => {
        if (this.stackAudioPreview === audio) {
          this.stopStackAudioPreview();
          this.stackAudioError.set(`"${track.title}" could not be previewed. Try another mood.`);
        }
      };
      this.stackAudioPreview = audio;
      await audio.play();
      if (run === this.stackAudioPreviewRun && this.stackAudioPreview === audio) {
        this.stackAudioPreviewingId.set(track.id);
      }
    } catch {
      if (run === this.stackAudioPreviewRun) {
        this.stopStackAudioPreview();
        this.stackAudioError.set(`Preview playback was blocked for "${track.title}". Tap play again.`);
      }
    } finally {
      if (run === this.stackAudioPreviewRun) {
        this.stackAudioPreviewLoadingId.set(null);
      }
    }
  }

  stopStackAudioPreview(): void {
    this.stackAudioPreviewRun += 1;
    if (this.stackAudioPreview) {
      this.stackAudioPreview.pause();
      this.stackAudioPreview.currentTime = 0;
      this.stackAudioPreview.onended = null;
      this.stackAudioPreview.onerror = null;
      this.stackAudioPreview = null;
    }
    this.stackAudioPreviewingId.set(null);
    this.stackAudioPreviewLoadingId.set(null);
  }

  openStackMusicStudio(): void {
    this.stackShareDialogOpen.set(false);
    this.stackStudioOpen.set(true);
    void this.preloadStackAudioUrls();
  }

  stackCoverImage(board: Board): string {
    return board.imageUrl
      || board.cards.map((card) => this.cardImages(card)[0] ?? '').find(Boolean)
      || '';
  }

  isSongCard(card: Pick<BoardCard, 'title' | 'subtitle' | 'tags' | 'audioPreviewUrl' | 'spotifyTrackId' | 'spotifyTrackUrl' | 'mediaKind' | 'entityType'>): boolean {
    if (card.spotifyTrackId || card.spotifyTrackUrl || card.audioPreviewUrl) {
      return true;
    }
    if (card.mediaKind) return card.mediaKind === 'song';
    if (card.entityType && card.entityType !== 'work') return false;
    return card.tags.some((tag) => ['song', 'songs', 'music-track', 'spotify-track'].includes(tag.toLowerCase()));
  }

  spotifyTrackEmbedUrl(card: BoardCard): SafeResourceUrl | null {
    const trackId = this.spotifyTrackIdForCard(card);
    if (!this.isSongCard(card) || !trackId) {
      return null;
    }
    const cached = this.spotifyEmbedUrls.get(trackId);
    if (cached) {
      return cached;
    }
    const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      buildSpotifyTrackEmbedUrl(trackId),
    );
    this.spotifyEmbedUrls.set(trackId, safeUrl);
    return safeUrl;
  }

  spotifyTrackHref(card: BoardCard): string {
    if (!this.isSongCard(card)) {
      return '';
    }
    if (card.spotifyTrackUrl) {
      return card.spotifyTrackUrl;
    }
    const trackId = this.spotifyTrackIdForCard(card);
    if (trackId) {
      return `https://open.spotify.com/track/${encodeURIComponent(trackId)}`;
    }
    const query = [card.title, card.spotifyArtistName || card.subtitle].filter(Boolean).join(' ');
    return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
  }

  hasSpotifyTrack(card: Pick<BoardCard, 'spotifyTrackId' | 'spotifyTrackUrl' | 'spotifyUri'>): boolean {
    return !!this.spotifyTrackIdForCard(card);
  }

  spotifyTrackUriForCard(card: Pick<BoardCard, 'spotifyTrackId' | 'spotifyTrackUrl' | 'spotifyUri'>): string {
    const trackId = this.spotifyTrackIdForCard(card);
    return trackId ? `spotify:track:${trackId}` : '';
  }

  private spotifyTrackForCard(card: BoardCard, board: Board | null): SpotifyTrack {
    const uri = this.spotifyTrackUriForCard(card);
    const context = board?.title ?? '';
    const inferredArtist = context
      .replace(/[’']s\s+(?:greatest hits|best songs|discography|essentials).*$/i, '')
      .replace(/\b(?:greatest hits|best songs|discography|essentials)\b.*$/i, '')
      .trim();
    return {
      uri,
      title: card.title,
      artist: this.songArtistLabel(card),
      album: card.spotifyAlbumName || '',
      artworkUrl: card.spotifyArtworkUrl || card.imageUrl || board?.imageUrl || '',
      spotifyUrl: this.spotifyTrackHref(card),
      lookupTitle: card.title,
      lookupArtist: card.spotifyArtistName || inferredArtist,
      lookupContext: context,
    };
  }

  private spotifyTrackIdForCard(card: Pick<BoardCard, 'spotifyTrackId' | 'spotifyTrackUrl' | 'spotifyUri'>): string {
    return spotifyTrackIdFromReference(
      `${card.spotifyTrackId} ${card.spotifyTrackUrl} ${card.spotifyUri}`,
    );
  }

  stackFramePosition(frame: StackFrame): string {
    return `${frame.index + 1} / ${frame.total}`;
  }

  stackFrameLabel(frame: StackFrame): string {
    if (frame.kind === 'cover') {
      return 'Cover';
    }
    if (frame.kind === 'closing') {
      return 'Closing';
    }
    return frame.card?.title || 'Card';
  }

  stackFormatLabel(): string {
    return this.stackFormats.find((format) => format.id === this.stackFormat())?.label ?? 'Stack';
  }

  stackClosingUrlLabel(board: Board): string {
    return this.stackShareUrl(board).replace(/^https?:\/\//, '');
  }

  stackQrImageUrl(board: Board): string {
    return generateQrSvgDataUrl(this.stackShareUrl(board), { margin: 3 });
  }

  boardLogoHref(board: Board): string {
    return this.actionHref(board.logoLinkUrl);
  }

  stackCtaHref(board: Board): string {
    return this.actionHref(board.stackCtaUrl);
  }

  private stackFrameAtIndex(frameIndex: number): StackFrame {
    const cards = this.stackSelectedCards();
    const total = cards.length + 2;
    const index = Math.max(0, Math.min(frameIndex, total - 1));
    if (index === 0) {
      return { kind: 'cover', index, total };
    }
    if (index === total - 1) {
      return { kind: 'closing', index, total };
    }
    return { kind: 'card', card: cards[index - 1], index, total };
  }

  previousStackFrame(): void {
    const resumeNarratedPlayback = this.isNarratedStackLiveView() && this.stackPlaying();
    if (resumeNarratedPlayback) {
      this.stackTourNarrationConsent.set(true);
    }
    this.stopStackPlayback();
    this.stackFrameIndex.update((index) => {
      const count = this.stackFrameCount();
      return count ? (index - 1 + count) % count : 0;
    });
    this.syncStackLivePreviewAfterFrameChange();
    if (resumeNarratedPlayback) {
      this.stackPlaying.set(true);
      this.syncStackNarrationAfterFrameChange({ autoAdvance: true, forceNarration: true });
    }
  }

  nextStackFrame(): void {
    const resumeNarratedPlayback = this.isNarratedStackLiveView() && this.stackPlaying();
    if (resumeNarratedPlayback) {
      this.stackTourNarrationConsent.set(true);
    }
    this.stopStackPlayback();
    if (resumeNarratedPlayback) {
      this.stackPlaying.set(true);
    }
    this.advanceStackFrame({ forceNarration: resumeNarratedPlayback });
  }

  toggleStackCardDetails(card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const opening = this.stackExpandedCardId() !== card.id;
    this.stackExpandedCardId.set(opening ? card.id : null);
  }

  stackCardEyebrow(card: BoardCard): string {
    const rank = card.rank || this.rankFromTags(card.tags);
    return [rank ? `#${rank}` : '', card.subtitle].filter(Boolean).join(' · ');
  }

  stackCardSummary(card: BoardCard): string {
    const summary = (card.shortSummary || card.subtitle || '').trim();
    if (summary && summary !== card.subtitle) return summary;
    const sentence = card.notes.match(/^(.{1,155}?[.!?])(?:\s|$)/)?.[1] ?? '';
    return sentence || card.subtitle;
  }

  stackCardHasMore(card: BoardCard): boolean {
    return card.notes.trim().length > 0 && card.notes.trim() !== this.stackCardSummary(card).trim();
  }

  stackTitleClass(title: string): string {
    const normalized = title.replace(/\s+/g, ' ').trim();
    const longestWordLength = normalized
      .split(/\s+/)
      .reduce((length, word) => Math.max(length, word.replace(/[^\p{L}\p{N}'’-]/gu, '').length), 0);
    if (normalized.length >= 52) return 'stack-preview__title--extra-long';
    if (normalized.length >= 30) return 'stack-preview__title--very-long';
    if (longestWordLength >= 12 && normalized.length < 24) return 'stack-preview__title--long-word';
    if (normalized.length >= 16) return 'stack-preview__title--long';
    return '';
  }

  replayStackCardNarration(card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.isBrowser || this.stackCurrentCard()?.id !== card.id) return;
    this.unlockStackNarrationAudio();
    this.stopStackPlayback();
    this.stackPlaying.set(true);
    this.syncStackNarrationAfterFrameChange({ autoAdvance: true, forceNarration: true });
  }

  stackCardNarrationLoading(card: BoardCard): boolean {
    return this.tourAudioLoadingKey() === this.stackCardAudioKey(card);
  }

  stackNarrationLoading(): boolean {
    const card = this.stackCurrentCard();
    return !!card && (card.tour ? this.stackTourNarrationLoading() : this.stackCardNarrationLoading(card));
  }

  private stackCardNarrationText(card: BoardCard): string {
    return (card.notes || card.shortSummary || card.subtitle).trim();
  }

  private stackCardAudioKey(card: BoardCard): string {
    return `stack-card:${card.id}:${this.stackCardNarrationText(card)}`;
  }

  beginStackSwipe(event: PointerEvent): void {
    if (!this.stackDirectView() || this.stackFrameCount() < 2 || event.button !== 0 || this.isInteractiveStackSwipeTarget(event.target)) {
      return;
    }
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (!target) {
      return;
    }
    this.stackSwipeState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: Date.now(),
      target,
    };
    target.setPointerCapture?.(event.pointerId);
  }

  trackStackSwipe(event: PointerEvent): void {
    const state = this.stackSwipeState;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    const deltaX = state.lastX - state.startX;
    const deltaY = state.lastY - state.startY;
    if (Math.abs(deltaX) > 14 && Math.abs(deltaX) > Math.abs(deltaY)) {
      event.preventDefault();
    }
  }

  finishStackSwipe(event: PointerEvent): void {
    const state = this.stackSwipeState;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    this.stackSwipeState = null;
    state.target.releasePointerCapture?.(event.pointerId);
    const deltaX = state.lastX - state.startX;
    const deltaY = state.lastY - state.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const elapsed = Math.max(1, Date.now() - state.startedAt);
    const threshold = Math.min(92, Math.max(44, state.target.clientWidth * 0.14));
    const quickSwipe = elapsed < 320 && absX >= 34;
    if (absX < threshold && !quickSwipe) {
      return;
    }
    if (absX < absY * 1.25) {
      return;
    }
    if (deltaX < 0) {
      this.nextStackFrame();
    } else {
      this.previousStackFrame();
    }
  }

  cancelStackSwipe(event: PointerEvent): void {
    const state = this.stackSwipeState;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    this.stackSwipeState = null;
    state.target.releasePointerCapture?.(event.pointerId);
  }

  toggleStackPlayback(): void {
    if (this.stackPlaying()) {
      this.stopStackPlayback();
      return;
    }
    this.unlockStackNarrationAudio();
    if (this.isNarratedStackLiveView()) {
      this.stackTourNarrationConsent.set(true);
    }
    this.startStackPlayback();
  }

  stopNarratedStack(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.stopStackPlayback();
  }

  startNarratedStack(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.unlockStackNarrationAudio();
    this.stackTourNarrationConsent.set(true);
    this.startStackPlayback();
  }

  stackTourNarrationLoading(): boolean {
    const card = this.stackCurrentTourCard();
    return !!card && this.tourAudioLoadingKey() === `stop:${card.id}:stop`;
  }

  replayStackTourNarration(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.stackCurrentTourCard()) {
      return;
    }
    this.unlockStackNarrationAudio();
    this.stackTourNarrationConsent.set(true);
    this.stopStackPlayback();
    this.stackPlaying.set(true);
    this.syncStackNarrationAfterFrameChange({ autoAdvance: true, forceNarration: true });
  }

  async shareStackTo(target: StackExportTarget): Promise<void> {
    const board = this.stackBoard();
    if (!board || !this.isBrowser || this.stackVideoExporting()) {
      return;
    }
    const url = this.stackShareUrl(board);
    const caption = this.stackCaption().trim() || `LivingWiki Stack: ${board.title}`;
    const text = `${caption}\n${url}`;
    this.setStackShareMessage(null);
    this.stackVideoExporting.set(true);
    this.stackVideoProgress.set(0);
    this.setStackShareMessage('Preparing your social video…', false);

    try {
      const result = await this.createStackVideo(board);
      const file = this.stackVideoFile(board, result);

      if (target !== 'download' && this.canNativeShareFile(file)) {
        try {
          await navigator.share({
            title: board.title,
            text,
            files: [file],
          });
          this.setStackShareMessage('Video shared as native media for inline playback.');
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            this.setStackShareMessage('Share was cancelled.');
            return;
          }
        }
      }

      this.downloadStackVideo(file);
      await this.copyTextToClipboard(text);
      if (target === 'download') {
        this.setStackShareMessage(result.xCompatible
          ? 'MP4 downloaded. It is ready to upload as native social video; the caption is copied.'
          : 'Video downloaded as WebM. The caption is copied; convert to MP4 before posting to X for guaranteed compatibility.', false);
      } else {
        this.setStackShareMessage(result.xCompatible
          ? `Video downloaded. Attach it to ${this.stackTargetLabel(target)} for inline playback; the caption is copied.`
          : `Video downloaded as WebM. Convert it to MP4, then attach it to ${this.stackTargetLabel(target)}; the caption is copied.`, false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Video export failed.';
      this.setStackShareMessage(message, false);
    } finally {
      this.stackVideoExporting.set(false);
      this.stackVideoProgress.set(0);
    }
  }

  socialVideoShareUrl(board: Board): string {
    if (!board.socialVideoUrl) return '';
    const version = encodeURIComponent(
      `${board.socialVideoUpdatedAt || board.updatedAt || board.id}-${playerCardVersion}`,
    );
    const path = `/share/board/${encodeURIComponent(board.id)}/video?v=${version}`;
    if (board.visibility === 'public') {
      return `${PUBLIC_APP_URL}${path}`;
    }
    return this.isBrowser ? `${window.location.origin}${path}` : path;
  }

  socialVideoFileUrl(board: Board): string {
    if (!board.socialVideoUrl) return '';
    const version = encodeURIComponent(board.socialVideoUpdatedAt || board.updatedAt || board.id);
    const path = `/share/board/${encodeURIComponent(board.id)}/video.mp4?v=${version}`;
    if (board.visibility === 'public') {
      return `${PUBLIC_APP_URL}${path}`;
    }
    return this.isBrowser ? `${window.location.origin}${path}` : path;
  }

  stackSelectedShareUrl(board: Board): string {
    return this.stackShareMode() === 'video' ? this.socialVideoShareUrl(board) : this.stackSocialShareUrl(board);
  }

  stackSelectedShareLabel(): string {
    return this.stackShareMode() === 'video' ? 'Permanent video page (optional)' : 'Live-view link';
  }

  async copySelectedStackShareUrl(board: Board): Promise<void> {
    const url = this.stackSelectedShareUrl(board);
    if (!url) {
      this.setStackShareMessage('Create the video first to get its permanent link.', false);
      return;
    }
    if (await this.copyTextToClipboard(url)) {
      this.setStackShareMessage(`${this.stackSelectedShareLabel()} copied.`);
    } else {
      this.setStackShareMessage('Copy was blocked. Try the device share button.', false);
    }
  }

  async shareSelectedStackLinkTo(target: StackLinkShareTarget, board: Board): Promise<void> {
    if (!this.isBrowser) return;
    if (this.stackShareMode() === 'video') {
      await this.sharePublishedStackVideo(board, target);
      return;
    }
    const url = this.stackSelectedShareUrl(board);
    if (!url) {
      this.setStackShareMessage('Create the video first to share its permanent link.', false);
      return;
    }
    const title = board.title;
    const caption = `Explore ${board.title} in LivingWiki's live view.`;

    if (target === 'more') {
      if (navigator.share) {
        try {
          await navigator.share({ title, text: caption, url });
          this.setStackShareMessage('Share sheet opened.');
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            this.setStackShareMessage('Share was cancelled.');
            return;
          }
        }
      }
      await this.copySelectedStackShareUrl(board);
      return;
    }

    this.openStackLinkComposer(target, board, url, caption);
    this.setStackShareMessage(`${this.stackSelectedShareLabel()} opened for sharing.`);
  }

  socialVideoIsCurrent(board: Board): boolean {
    if (!board.socialVideoUrl || !board.socialVideoUpdatedAt) return false;
    if (!stackVideoRenderIsCurrent(board.socialVideoRenderVersion)) return false;
    const videoTime = Date.parse(board.socialVideoUpdatedAt);
    const boardTime = Date.parse(board.updatedAt);
    return Number.isFinite(videoTime) && Number.isFinite(boardTime) && videoTime >= boardTime;
  }

  async copySocialVideoUrl(board: Board): Promise<void> {
    const url = this.socialVideoShareUrl(board);
    if (!url) {
      this.setStackShareMessage('Publish the video first to create its reusable link.', false);
      return;
    }
    if (await this.copyTextToClipboard(url)) {
      this.setStackShareMessage('Hosted video link copied.');
    } else {
      this.setStackShareMessage('Copy was blocked. Try sharing the video instead.', false);
    }
  }

  async copySocialVideoFileUrl(board: Board): Promise<void> {
    if (!board.socialVideoUrl) return;
    if (await this.copyTextToClipboard(this.socialVideoFileUrl(board))) {
      this.setStackShareMessage('Direct video file link copied.');
    } else {
      this.setStackShareMessage('Copy was blocked.', false);
    }
  }

  async publishStackVideo(board: Board): Promise<void> {
    if (!this.isBrowser || this.stackVideoExporting()) return;
    if (!this.canEditBoard(board)) {
      this.setStackShareMessage('Only the board owner can publish a permanent video link.', false);
      return;
    }
    if (board.visibility !== 'public') {
      this.setStackShareMessage('Make this board public before publishing its video link.', false);
      return;
    }
    const uid = this.authService.uid();
    if (!uid || !this.storage) {
      this.setStackShareMessage('Sign in to publish a permanent video link.', false);
      return;
    }

    this.stackVideoExporting.set(true);
    this.stackVideoProgress.set(0);
    this.setStackShareMessage('Creating and publishing your video…', false);
    try {
      const result = await this.createStackVideo(board);
      if (result.blob.size >= 100 * 1024 * 1024) {
        throw new Error('The video is too large to publish. Select fewer cards and try again.');
      }
      const file = this.stackVideoFile(board, result);
      const path = `users/${uid}/boards/${board.id}/social/stack.${result.extension}`;
      const ref = storageRef(this.storage, path);
      await uploadBytes(ref, result.blob, {
        contentType: this.normalizedVideoMimeType(result.mimeType),
        cacheControl: 'public,max-age=3600',
        contentDisposition: `inline; filename="${file.name}"`,
        customMetadata: {
          boardId: board.id,
          generatedAt: new Date().toISOString(),
        },
      });
      const videoUrl = await getDownloadURL(ref);
      this.publishedStackVideoFiles.set(board.id, file);
      this.stackPublishedVideoReady.set(true);
      const nextBoard: Board = {
        ...board,
        socialVideoUrl: videoUrl,
        socialVideoMimeType: this.normalizedVideoMimeType(result.mimeType),
        socialVideoUpdatedAt: new Date().toISOString(),
        socialVideoRenderVersion: STACK_VIDEO_RENDER_VERSION,
        socialVideoRatio: this.stackRatio(),
        socialVideoAudioTrackId: this.stackAudioTrackId(),
        socialVideoAudioVolume: this.stackAudioVolume(),
      };
      const persisted = await this.persistBoard(nextBoard);
      this.boards.update((boards) => boards.map((item) => item.id === persisted.id ? persisted : item));
      this.setStackShareMessage('Permanent video link published. You can copy it or share the MP4 natively.', false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not publish the video.';
      this.setStackShareMessage(message, false);
    } finally {
      this.stackVideoExporting.set(false);
      this.stackVideoProgress.set(0);
    }
  }

  async sharePublishedStackVideo(board: Board, target: StackLinkShareTarget = 'more'): Promise<void> {
    if (!this.isBrowser || !board.socialVideoUrl || this.stackVideoExporting()) return;
    const file = this.publishedStackVideoFiles.get(board.id);
    if (!file) {
      void this.preloadPublishedStackVideo(board);
      this.setStackShareMessage('Preparing the native MP4. Tap the social app again when “Share video file” is ready.', false);
      return;
    }
    const caption = this.stackCaption().trim() || `LivingWiki Stack: ${board.title}`;
    const liveUrl = this.stackSocialShareUrl(board);
    const shareText = `${caption}\n${liveUrl}`;
    try {
      if (target === 'more' && this.canNativeShareFile(file)) {
        await navigator.share({ title: board.title, text: shareText, files: [file] });
        this.setStackShareMessage('MP4 shared as native media for in-feed playback.');
        return;
      }

      this.downloadStackVideo(file);
      if (target !== 'more') {
        this.openStackLinkComposer(target, board, liveUrl, caption);
      }
      await this.copyTextToClipboard(shareText);
      const targetLabel = this.stackLinkShareTargets.find((item) => item.id === target)?.label ?? 'your social app';
      this.setStackShareMessage(target === 'more'
        ? 'MP4 downloaded and caption copied. Attach the file in your social app for native playback.'
        : `MP4 downloaded and ${targetLabel} opened. Attach the downloaded video for native playback; the caption and preview link are copied.`, false);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.setStackShareMessage('Share was cancelled.');
        return;
      }
      const message = error instanceof Error ? error.message : 'Could not share the published video.';
      this.setStackShareMessage(message, false);
    }
  }

  private openStackLinkComposer(target: Exclude<StackLinkShareTarget, 'more'>, board: Board, url: string, caption: string): void {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(board.title);
    const encodedCaption = encodeURIComponent(caption);
    const destination = target === 'x'
      ? `https://twitter.com/intent/tweet?text=${encodedCaption}&url=${encodedUrl}`
      : target === 'facebook'
        ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
        : target === 'linkedin'
          ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
          : target === 'reddit'
            ? `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`
            : `https://wa.me/?text=${encodedCaption}%20${encodedUrl}`;
    window.open(destination, '_blank', 'noopener');
  }

  private async preloadPublishedStackVideo(board: Board): Promise<void> {
    if (!this.isBrowser || !board.socialVideoUrl || this.publishedStackVideoFiles.has(board.id) || this.stackPublishedVideoLoading()) {
      return;
    }
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return;
    }
    this.stackPublishedVideoLoading.set(true);
    this.stackPublishedVideoReady.set(false);
    try {
      const response = await fetch(this.socialVideoFileUrl(board), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('The permanent video could not be prepared.');
      const blob = await response.blob();
      const extension: StackVideoResult['extension'] = (board.socialVideoMimeType || blob.type).includes('mp4') ? 'mp4' : 'webm';
      const result: StackVideoResult = {
        blob,
        mimeType: this.normalizedVideoMimeType(board.socialVideoMimeType || blob.type || `video/${extension}`),
        extension,
        xCompatible: extension === 'mp4',
        durationSeconds: 0,
      };
      this.publishedStackVideoFiles.set(board.id, this.stackVideoFile(board, result));
      this.stackPublishedVideoReady.set(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The permanent video could not be prepared.';
      this.setStackShareMessage(message, false);
    } finally {
      this.stackPublishedVideoLoading.set(false);
    }
  }

  private async createStackVideo(board: Board): Promise<StackVideoResult> {
    const selectedCards = this.stackSelectedCards().slice(0, STACK_VIDEO_MAX_CARDS);
    const backgroundAudio = this.stackVideoBackgroundAudio();
    return generateStackVideo({
      title: board.title,
      subtitle: this.stackCoverSubtitle().trim() || board.description,
      ownerName: this.ownerName(board),
      coverImageUrl: this.stackCoverImage(board),
      liveUrl: this.stackShareUrl(board),
      qrImageUrl: this.stackQrImageUrl(board),
      cards: selectedCards.map((card) => ({
        title: card.title,
        subtitle: card.subtitle,
        notes: card.notes,
        rank: card.rank ?? null,
        imageUrl: this.cardImages(card)[0] ?? '',
        imageUrls: this.cardImages(card),
        tourSequence: card.tour?.sequence ?? null,
      })),
    }, this.stackRatio(), (progress) => this.stackVideoProgress.set(Math.round(progress * 100)), backgroundAudio);
  }

  private stackVideoBackgroundAudio(): StackVideoBackgroundAudio | null {
    const track = this.stackSelectedAudioTrack();
    if (!track || this.stackAudioTrackId() === NO_STACK_AUDIO_TRACK_ID) {
      return null;
    }
    return {
      url: this.stackAudioTrackUrl(track),
      volume: this.stackAudioVolume(),
    };
  }

  private stackAudioTrackUrl(track: StackAudioTrack): string {
    const cached = this.stackAudioUrls.get(track.id);
    if (cached) return cached;
    const bucket = this.storage?.app.options.storageBucket;
    if (!bucket) {
      throw new Error('Background music is unavailable right now.');
    }
    const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(track.storagePath)}?alt=media`;
    this.stackAudioUrls.set(track.id, url);
    return url;
  }

  private async preloadStackAudioUrls(): Promise<void> {
    if (!this.storage) return;
    this.stackAudioTracks.forEach((track) => this.stackAudioTrackUrl(track));
  }

  private stackAudioPreviewVolume(volume: number): number {
    return Math.min(0.8, Math.max(0.24, volume * 2.4));
  }

  private saveStackAudioPreferences(board: Board): void {
    const currentBoard = this.boards().find((item) => item.id === board.id);
    if (!currentBoard || !this.canEditBoard(currentBoard)) return;
    const trackId = normalizeStackAudioTrackId(this.stackAudioTrackId());
    const volume = normalizeStackAudioVolume(this.stackAudioVolume());
    if (
      currentBoard.socialVideoAudioTrackId === trackId
      && currentBoard.socialVideoAudioVolume === volume
    ) {
      return;
    }
    const nextBoard: Board = {
      ...currentBoard,
      socialVideoAudioTrackId: trackId,
      socialVideoAudioVolume: volume,
      updatedAt: new Date().toISOString(),
    };
    this.boards.update((boards) =>
      boards.map((item) => item.id === nextBoard.id ? nextBoard : item),
    );
    this.publishedStackVideoFiles.delete(board.id);
    this.stackPublishedVideoReady.set(false);
    void this.persistAndReplaceBoard(nextBoard);
  }

  private stackVideoFile(board: Board, result: StackVideoResult): File {
    const slug = board.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 54) || 'livingwiki-stack';
    return new File([result.blob], `${slug}.${result.extension}`, { type: this.normalizedVideoMimeType(result.mimeType) });
  }

  private normalizedVideoMimeType(value: string): string {
    return value.split(';')[0]?.trim() || 'video/mp4';
  }

  private canNativeShareFile(file: File): boolean {
    if (!navigator.share) return false;
    try {
      return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  }

  private downloadStackVideo(file: File): void {
    const href = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
  }

  private stackTargetLabel(target: StackExportTarget): string {
    return this.stackExportTargets.find((item) => item.id === target)?.label ?? 'the social app';
  }

  shareTargetUrl(target: ShareTarget, board: Board, stack = false): string {
    const url = stack ? this.stackShareUrl(board) : this.boardShareUrl(board);
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

  private prepareStackForBoard(board: Board): void {
    this.stopStackPlayback();
    this.stopStackAudioPreview();
    const subtitle = board.description.trim() || `${board.cards.length} card${board.cards.length === 1 ? '' : 's'} curated by ${this.ownerName(board)}`;
    this.stackStudioBoardId.set(board.id);
    this.stackSelectedCardIds.set(new Set(board.cards.map((card) => card.id)));
    this.stackCoverTitle.set(board.title);
    this.stackCoverSubtitle.set(subtitle);
    this.stackCaption.set(`I made a LivingWiki Stack: ${board.title}. Explore the full board.`);
    this.stackFormat.set('reel');
    this.stackRatio.set('vertical');
    this.stackAudioTrackId.set(normalizeStackAudioTrackId(board.socialVideoAudioTrackId));
    this.stackAudioVolume.set(normalizeStackAudioVolume(board.socialVideoAudioVolume));
    this.stackAudioError.set(null);
    this.stackFrameIndex.set(0);
    this.stackTourNarrationConsent.set(false);
    this.setStackShareMessage(null);
    void this.preloadStackAudioUrls();
  }

  private syncStackDirectView(): void {
    if (!this.stackDirectView()) {
      return;
    }
    const board = this.selectedBoard();
    if (!board) {
      return;
    }
    if (this.stackStudioBoardId() !== board.id) {
      this.prepareStackForBoard(board);
    }
    this.stackStudioOpen.set(false);
    this.stackTourNarrationConsent.set(true);
    this.startStackPlayback();
  }

  private canonicalizeBoardsRootRoute(boardId: string | null, ownerKey: string | null): void {
    if (!this.isBrowser || this.friendsPage() || this.songsPage() || this.tripsPage() || boardId || ownerKey !== null || !this.authService.uid()) {
      return;
    }

    const path = this.boardsProfileRoutePath();
    const targetPath = this.route.snapshot.queryParamMap.get('friends') === '1' ? `${path}?friends=1` : path;
    if (path !== '/boards') {
      void this.router.navigateByUrl(targetPath, { replaceUrl: true });
    }
  }

  private boardsProfileRoutePath(): string {
    const boardSlug = this.boardsProfileBoard()?.ownerPublicSlug.trim();
    const ownerKey = boardSlug
      || (this.publicOwnerUid() ? this.publicOwnerKey() : this.publicOwnerSlug())
      || this.currentPublicOwnerKey();
    return ownerKey ? `/boards/u/${encodeURIComponent(ownerKey)}` : '/boards';
  }

  private setShareMessage(message: string | null, autoClear = true): void {
    if (this.shareMessageTimer) {
      clearTimeout(this.shareMessageTimer);
      this.shareMessageTimer = null;
    }
    this.shareMessage.set(message);
    if (message && autoClear) {
      this.shareMessageTimer = setTimeout(() => {
        this.shareMessage.set(null);
        this.shareMessageTimer = null;
      }, 2400);
    }
  }

  private setStackShareMessage(message: string | null, autoClear = true): void {
    if (this.stackShareMessageTimer) {
      clearTimeout(this.stackShareMessageTimer);
      this.stackShareMessageTimer = null;
    }
    this.stackShareMessage.set(message);
    if (message && autoClear) {
      this.stackShareMessageTimer = setTimeout(() => {
        this.stackShareMessage.set(null);
        this.stackShareMessageTimer = null;
      }, 2400);
    }
  }

  private normalizeBoardFriendsState(value: unknown): BoardFriendsState {
    const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const friends = Array.isArray(data['friends']) ? data['friends'] : [];
    const incoming = Array.isArray(data['incoming']) ? data['incoming'] : [];
    const outgoing = Array.isArray(data['outgoing']) ? data['outgoing'] : [];
    return {
      friends: friends
        .map((item) => this.normalizeBoardFriendProfile(item))
        .filter((friend): friend is BoardFriendProfile => !!friend),
      incoming: incoming
        .map((item) => this.normalizeBoardFriendRequest(item))
        .filter((request): request is BoardFriendRequestSummary => !!request),
      outgoing: outgoing
        .map((item) => this.normalizeBoardFriendRequest(item))
        .filter((request): request is BoardFriendRequestSummary => !!request),
    };
  }

  private normalizeBoardFriendCandidates(value: unknown): BoardFriendCandidate[] {
    const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const candidates = Array.isArray(data['candidates']) ? data['candidates'] : [];
    return candidates
      .map((item) => this.normalizeBoardFriendCandidate(item))
      .filter((candidate): candidate is BoardFriendCandidate => !!candidate);
  }

  private normalizeBoardFriendCandidate(value: unknown): BoardFriendCandidate | null {
    const profile = this.normalizeBoardFriendProfile(value);
    const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    if (!profile) {
      return null;
    }
    return {
      ...profile,
      relationshipStatus: data['relationshipStatus'] === 'friend' || data['relationshipStatus'] === 'pending'
        ? data['relationshipStatus']
        : 'available',
    };
  }

  private normalizeBoardFriendProfile(value: unknown): BoardFriendProfile | null {
    const data = value && typeof value === 'object' ? value as Record<string, unknown> : null;
    const userId = this.objectField(data, 'userId');
    if (!data || !userId) {
      return null;
    }
    const email = this.objectField(data, 'email');
    return {
      userId,
      email,
      displayName: this.objectField(data, 'displayName') || email || 'LivingWiki friend',
      photoURL: this.objectField(data, 'photoURL'),
      profileIcon: this.objectField(data, 'profileIcon'),
      profilePictureType: data['profilePictureType'] === 'image' || data['profilePictureType'] === 'icon'
        ? data['profilePictureType']
        : null,
    };
  }

  private normalizeBoardFriendRequest(value: unknown): BoardFriendRequestSummary | null {
    const data = value && typeof value === 'object' ? value as Record<string, unknown> : null;
    const id = this.objectField(data, 'id');
    if (!data || !id) {
      return null;
    }
    return {
      id,
      fromUserId: this.objectField(data, 'fromUserId'),
      fromEmail: this.objectField(data, 'fromEmail'),
      fromDisplayName: this.objectField(data, 'fromDisplayName'),
      toEmail: this.objectField(data, 'toEmail'),
      createdAt: this.objectField(data, 'createdAt'),
    };
  }

  private objectField(data: Record<string, unknown> | null | undefined, field: string): string {
    const value = data?.[field];
    return typeof value === 'string' ? value.trim() : '';
  }

  private boardFriendErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof FirebaseError && typeof error.message === 'string') {
      return error.message.replace(/^Firebase: /, '').trim() || fallback;
    }
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }
    return fallback;
  }

  private cardImageActionErrorMessage(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message.replace(/^Firebase: /, '').trim() : '';
    if (!message || /^(?:functions\/)?(?:internal|unknown|unauthenticated)$/i.test(message)) {
      return fallback;
    }
    return message;
  }

  private isInteractiveStackSwipeTarget(target: EventTarget | null): boolean {
    return target instanceof Element
      && !!target.closest('button, a, input, textarea, select, label, [role="button"], [contenteditable="true"]');
  }

  private actionHref(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    if (/^(https?:|mailto:|tel:)/i.test(trimmed)) {
      return trimmed;
    }
    const phone = trimmed.replace(/[^\d+]/g, '');
    if (/^\+?\d{7,15}$/.test(phone)) {
      return `tel:${phone}`;
    }
    if (/^[\w.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }

  private clampStackFrameIndex(): void {
    const lastIndex = Math.max(0, this.stackFrameCount() - 1);
    this.stackFrameIndex.update((index) => Math.max(0, Math.min(index, lastIndex)));
  }

  private advanceStackFrame(options: { forceNarration?: boolean } = {}): void {
    this.stackExpandedCardId.set(null);
    this.stackFrameIndex.update((index) => {
      const count = this.stackFrameCount();
      return count ? (index + 1) % count : 0;
    });
    this.syncStackLivePreviewAfterFrameChange();
    this.syncStackNarrationAfterFrameChange({
      autoAdvance: this.stackPlaying(),
      forceNarration: options.forceNarration ?? false,
    });
  }

  private startStackPlayback(): void {
    if (this.stackPlaying()) {
      return;
    }
    this.stackPlaying.set(true);
    if (this.syncStackNarrationAfterFrameChange({ autoAdvance: true })) {
      return;
    }
    this.stackPlaybackTimer = setInterval(() => this.advanceStackFrame(), this.stackFrameDurationMs);
  }

  private stopStackPlayback(): void {
    this.clearStackPlaybackTimer();
    this.stackTourNarrationSwitchToken += 1;
    this.stopTourSpeech();
    this.stackActiveFrameDurationMs.set(this.stackFrameDurationMs);
    this.stackPlaying.set(false);
  }

  private clearStackPlaybackTimer(): void {
    if (!this.stackPlaybackTimer) {
      return;
    }
    clearInterval(this.stackPlaybackTimer);
    this.stackPlaybackTimer = null;
  }

  private isNarratedStackLiveView(): boolean {
    return this.stackDirectView();
  }

  private syncStackNarrationAfterFrameChange(
    options: { autoAdvance?: boolean; forceNarration?: boolean } = {},
  ): boolean {
    if (!this.isNarratedStackLiveView()) {
      return false;
    }

    this.clearStackPlaybackTimer();
    const token = ++this.stackTourNarrationSwitchToken;
    this.stopTourSpeech();
    this.tourAudioNotice.set(null);
    this.stackActiveFrameDurationMs.set(this.stackFrameDurationMs);

    const autoAdvance = options.autoAdvance ?? this.stackPlaying();
    const frame = this.stackCurrentFrame();
    const card = frame.kind === 'card' ? frame.card ?? null : null;
    if (!card) {
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(this.stackFrameDurationMs, token);
      }
      return true;
    }
    if (!autoAdvance && !options.forceNarration) {
      return true;
    }

    const tourFrame: TourDeckFrame = {
      kind: 'stop',
      card,
      nextCard: null,
      index: frame.index,
      total: frame.total,
    };
    void this.playStackNarration(tourFrame, token, autoAdvance);
    return true;
  }

  private async playStackNarration(
    frame: TourDeckFrame,
    token: number,
    autoAdvance: boolean,
  ): Promise<void> {
    const text = frame.card.tour?.guideScript || this.stackCardNarrationText(frame.card);
    if (!text.trim()) {
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(this.stackFrameDurationMs, token);
      }
      return;
    }

    const startedAt = Date.now();
    this.stackActiveFrameDurationMs.set(120_000);
    const audioKey = frame.card.tour ? this.tourAudioKey(frame) : this.stackCardAudioKey(frame.card);
    const audioUrl = await this.ensureTourAudioUrl(audioKey, text);
    if (!this.isStackNarrationCurrent(token, frame.card.id)) {
      return;
    }
    if (!audioUrl) {
      this.stackActiveFrameDurationMs.set(this.stackFrameDurationMs);
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(this.stackFrameDurationMs, token);
      }
      return;
    }

    const audio = this.stackNarrationAudio ?? new Audio();
    this.stackNarrationAudio = audio;
    audio.src = audioUrl;
    audio.volume = 1;
    audio.preload = 'auto';
    this.tourAudio = audio;
    this.tourSpeechPlaying.set(true);
    const syncProgressDuration = () => {
      if (!this.isStackNarrationCurrent(token, frame.card.id) || !Number.isFinite(audio.duration) || audio.duration <= 0) {
        return;
      }
      const elapsedMs = Date.now() - startedAt;
      this.stackActiveFrameDurationMs.set(Math.max(this.stackFrameDurationMs, Math.ceil(elapsedMs + audio.duration * 1000 + 450)));
    };
    audio.onloadedmetadata = syncProgressDuration;
    audio.onended = () => {
      if (!this.isStackNarrationCurrent(token, frame.card.id) || this.tourAudio !== audio) {
        return;
      }
      this.stopTourSpeech();
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(450, token);
      }
    };
    audio.onerror = () => {
      if (!this.isStackNarrationCurrent(token, frame.card.id) || this.tourAudio !== audio) {
        return;
      }
      this.stopTourSpeech();
      this.tourAudioNotice.set(null);
      if (this.startStackBrowserNarration(frame, text, token, autoAdvance, startedAt)) {
        return;
      }
      this.stackActiveFrameDurationMs.set(this.stackFrameDurationMs);
      this.tourAudioNotice.set('The narration could not play this card. Continuing to the next card.');
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(this.stackFrameDurationMs, token);
      }
    };

    try {
      await audio.play();
      syncProgressDuration();
    } catch {
      if (!this.isStackNarrationCurrent(token, frame.card.id) || this.tourAudio !== audio) {
        return;
      }
      this.stopTourSpeech();
      this.tourAudioNotice.set(null);
      if (this.startStackBrowserNarration(frame, text, token, autoAdvance, startedAt)) {
        return;
      }
      this.clearStackPlaybackTimer();
      this.stackPlaying.set(false);
      this.stackActiveFrameDurationMs.set(this.stackFrameDurationMs);
      this.tourAudioNotice.set('Your browser paused automatic narration. Tap the voice button to start this location.');
    }
  }

  private startStackBrowserNarration(
    frame: TourDeckFrame,
    text: string,
    token: number,
    autoAdvance: boolean,
    startedAt: number,
  ): boolean {
    if (!this.isBrowser
      || typeof window.speechSynthesis === 'undefined'
      || typeof window.SpeechSynthesisUtterance === 'undefined'
      || !this.isStackNarrationCurrent(token, frame.card.id)) {
      return false;
    }

    const utterance = new SpeechSynthesisUtterance(text.slice(0, 3600));
    const language = navigator.language || 'en-US';
    const languageRoot = language.split('-')[0]?.toLowerCase();
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase())
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(`${languageRoot}-`))
      ?? null;
    utterance.lang = utterance.voice?.lang || language;
    utterance.rate = 0.96;
    utterance.pitch = 1;
    this.tourSpeechUtterance = utterance;
    this.tourSpeechPlaying.set(true);
    const estimatedSpeechMs = Math.max(this.stackFrameDurationMs, Math.ceil(utterance.text.trim().split(/\s+/).length / 2.45 * 1000));
    this.stackActiveFrameDurationMs.set(Date.now() - startedAt + estimatedSpeechMs + 450);

    utterance.onend = () => {
      if (this.tourSpeechUtterance !== utterance || !this.isStackNarrationCurrent(token, frame.card.id)) {
        return;
      }
      this.tourSpeechUtterance = null;
      this.tourSpeechPlaying.set(false);
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(450, token);
      }
    };
    utterance.onerror = () => {
      if (this.tourSpeechUtterance !== utterance || !this.isStackNarrationCurrent(token, frame.card.id)) {
        return;
      }
      this.tourSpeechUtterance = null;
      this.tourSpeechPlaying.set(false);
      this.clearStackPlaybackTimer();
      this.stackPlaying.set(false);
      this.stackActiveFrameDurationMs.set(this.stackFrameDurationMs);
      this.tourAudioNotice.set('Narration could not start. Tap the voice button to try this location again.');
    };
    window.speechSynthesis.speak(utterance);
    return true;
  }

  private isStackNarrationCurrent(token: number, cardId: string): boolean {
    return token === this.stackTourNarrationSwitchToken
      && this.isNarratedStackLiveView()
      && this.stackCurrentCard()?.id === cardId;
  }

  private unlockStackNarrationAudio(): void {
    if (!this.isBrowser) {
      return;
    }
    const audio = this.stackNarrationAudio ?? new Audio();
    this.stackNarrationAudio = audio;
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
    audio.onloadedmetadata = null;
    audio.volume = 0;
    audio.preload = 'auto';
    const silenceUrl = this.stackNarrationSilenceUrl();
    audio.src = silenceUrl;
    void audio.play()
      .then(() => {
        if (this.stackNarrationAudio !== audio) {
          return;
        }
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
      })
      .catch(() => {
        if (this.stackNarrationAudio === audio) {
          this.stackNarrationAudio = null;
        }
      })
      .finally(() => URL.revokeObjectURL(silenceUrl));
  }

  private stackNarrationSilenceUrl(): string {
    const sampleRate = 8_000;
    const sampleCount = 800;
    const wav = new Uint8Array(44 + sampleCount);
    const view = new DataView(wav.buffer);
    const writeAscii = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        wav[offset + index] = value.charCodeAt(index);
      }
    };
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + sampleCount, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    writeAscii(36, 'data');
    view.setUint32(40, sampleCount, true);
    wav.fill(128, 44);
    return URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  }

  private disposeStackNarrationAudio(): void {
    const audio = this.stackNarrationAudio;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    this.stackNarrationAudio = null;
  }

  private scheduleStackFrameAdvance(delayMs: number, token: number): void {
    this.clearStackPlaybackTimer();
    this.stackPlaybackTimer = setTimeout(() => {
      if (token !== this.stackTourNarrationSwitchToken || !this.stackPlaying() || !this.isNarratedStackLiveView()) {
        return;
      }
      this.advanceStackFrame();
    }, delayMs);
  }

  private async copyTextToClipboard(text: string): Promise<boolean> {
    if (!this.isBrowser) {
      return false;
    }

    if (navigator.clipboard?.writeText) {
      try {
        const copied = await Promise.race([
          navigator.clipboard.writeText(text).then(() => true),
          new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 700)),
        ]);
        if (copied) {
          return true;
        }
      } catch {
        // Fall through to the selection-based copy method below.
      }
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand('copy');
    textArea.remove();
    return copied;
  }

  wizardModeLabel(): string {
    return this.wizardModes.find((mode) => mode.id === this.wizardMode())?.label ?? 'Wizard';
  }

  wizardLoadingMessage(): string {
    const task = this.wizardLoadingTask();
    if (task) {
      return task.message;
    }
    const messages = this.isTourWizardMode() ? BOARD_TOUR_STATUS_MESSAGES : BOARD_WIZARD_STATUS_MESSAGES;
    return messages[this.wizardLoadingIndex()] ?? messages[0];
  }

  wizardLoadingProgress(): number {
    const task = this.wizardLoadingTask();
    if (task) {
      return Math.max(4, Math.min(100, task.progress));
    }
    const stepCount = this.isTourWizardMode() ? BOARD_TOUR_STATUS_MESSAGES.length : BOARD_WIZARD_STATUS_MESSAGES.length;
    return ((this.wizardLoadingIndex() % stepCount) + 1) * (100 / stepCount);
  }

  wizardTargetBoardTitle(): string {
    const targetId = this.wizardTargetBoardId();
    if (targetId === 'new') {
      return 'New board';
    }
    return this.boards().find((board) => board.id === targetId)?.title ?? 'Selected board';
  }

  private wizardOffGridLocationError(error: unknown): string {
    const code = error && typeof error === 'object' && 'code' in error
      ? Number((error as { code?: unknown }).code)
      : 0;
    if (code === 1) {
      return $localize`Location permission was denied. Allow location access and try again.`;
    }
    if (code === 2) {
      return $localize`Your location is unavailable. Move somewhere with a clearer GPS signal and try again.`;
    }
    if (code === 3) {
      return $localize`The location request timed out. Try again, preferably outdoors.`;
    }
    return error instanceof Error
      ? error.message
      : $localize`Your exact square could not be found. Please try again.`;
  }

  private resetBoardWizard(): void {
    const selectedBoard = this.selectedBoard();
    const editableSelectedBoard = selectedBoard && this.canEditBoard(selectedBoard) ? selectedBoard : null;
    this.wizardStep.set('choose');
    this.wizardMode.set('describe');
    this.wizardTargetBoardId.set(editableSelectedBoard?.id ?? 'new');
    this.wizardContributionBoardId.set(null);
    this.wizardDefaultType.set('place');
    this.wizardCount.set(12);
    this.wizardVibe.set('playful');
    this.wizardPrompt.set('');
    this.wizardPastedList.set('');
    this.wizardUrl.set('');
    this.wizardPhotos.set([]);
    this.wizardPhotoImportRun += 1;
    this.wizardPhotosLoading.set(false);
    this.wizardPhotoError.set(null);
    this.wizardOffGridName.set('');
    this.wizardOffGridAddress.set('');
    this.wizardOffGridTip.set('');
    this.wizardOffGridSource.set('spot');
    this.wizardOffGridPhoto.set('');
    this.wizardOffGridResolvedLocation.set(null);
    this.wizardOffGridVerifiedLocations.set({});
    this.wizardOffGridVerificationFailures.set({});
    this.wizardOffGridLocating.set(false);
    this.wizardOffGridVerifying.set(false);
    this.wizardOffGridAccuracy.set(null);
    this.wizardOffGridStatus.set('');
    this.wizardOffGridError.set(null);
    this.wizardRefineText.set('');
    this.wizardStackCtaLabel.set(editableSelectedBoard?.stackCtaLabel ?? '');
    this.wizardStackCtaUrl.set(editableSelectedBoard?.stackCtaUrl ?? '');
    this.wizardTourVoiceStyle.set('historian');
    this.wizardTourPaceOrStyle.set('Standard');
    this.wizardTourExtras.set(new Set(['Photo stops', 'Accessibility notes']));
    this.wizardLoadingIndex.set(0);
    this.wizardLoadingTask.set(null);
    this.wizardError.set(null);
    this.wizardResult.set(null);
    this.wizardPreviewCards.set([]);
    this.wizardSelectedCardIds.set(new Set());
    this.wizardRedoingCardIds.set(new Set());
    this.wizardImageLoadingCardIds.set(new Set());
    this.wizardEditingCardId.set(null);
    this.resetWizardCardImageTools();
    this.wizardSaving.set(false);
  }

  private resetWizardCardImageTools(): void {
    this.wizardCardEditorSection.set('details');
    this.wizardCardImageToolMode.set(null);
    this.wizardCardImagePrompt.set('');
    this.wizardCardImageGenerating.set(false);
    this.wizardCardGeneratedImageUrl.set('');
    this.wizardCardGeneratedImageModel.set('');
    this.wizardCardImageSearchQuery.set('');
    this.wizardCardImageSearchLoading.set(false);
    this.wizardCardImageSearchResults.set([]);
    this.wizardCardImageSearchIndex.set(0);
    this.wizardCardImageApplying.set(false);
    this.wizardCardEditorError.set(null);
  }

  private wizardImageBoardId(): string {
    return this.wizardTargetBoardId() === 'new' ? '' : this.wizardTargetBoardId();
  }

  private attachWizardPhotosToBatch(batch: BoardWizardGeneratedBatch): BoardWizardGeneratedBatch {
    const photos = this.wizardPhotos();
    const localCards = this.buildLocalWizardBatch().cards;
    return {
      ...batch,
      cards: photos.map((photo, index) => ({
        ...(batch.cards[index] ?? localCards[index] ?? {
          title: this.photoTitleFromFileName(photo.name),
          subtitle: $localize`A photo memory`,
          notes: $localize`Add the story behind this moment before sharing.`,
          type: 'memory' as BoardCardType,
          scope: 'place' as BoardCardScope,
          status: 'saved' as BoardCardStatus,
          rating: 4,
          tags: ['memory'],
          image_query: this.photoTitleFromFileName(photo.name),
          place_query: this.photoTitleFromFileName(photo.name),
        }),
        imageUrl: photo.imageUrl,
      })),
    };
  }

  private imageDataUrlPayload(dataUrl: string): { mimeType: string; base64: string } {
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
    if (!match) {
      return { mimeType: 'image/jpeg', base64: '' };
    }
    return { mimeType: match[1].toLowerCase(), base64: match[2] };
  }

  private defaultWizardCardImageSearchQuery(card: BoardWizardPreviewCard): string {
    const context = `${card.title} ${card.subtitle} ${card.notes} ${card.tags.join(' ')} ${card.image_query} ${this.wizardPrompt()}`;
    const year = context.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/)?.[1] ?? '';
    if (/\b(fifa\s+)?world cup|world cup winner|world cup champion/i.test(context) && year) {
      const country = card.title
        .replace(new RegExp(`\\b${year}\\b`, 'g'), ' ')
        .replace(/\b(fifa|world cup|winner|winners|champion|champions|team)\b/gi, ' ')
        .replace(/[:;|,()\-–—]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return `${year} ${country} FIFA World Cup champions team celebration`.replace(/\s+/g, ' ').trim().slice(0, 180);
    }
    return (card.image_query || `${card.title} ${card.subtitle} photo`).replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  private defaultWizardCardImageGenerationPrompt(card: BoardWizardPreviewCard): string {
    const searchQuery = this.defaultWizardCardImageSearchQuery(card);
    const context = `${card.title} ${card.subtitle} ${card.notes} ${card.tags.join(' ')} ${this.wizardPrompt()}`;
    if (/\b(fifa\s+)?world cup|world cup winner|world cup champion/i.test(context)) {
      return `${searchQuery}. Create a historically grounded editorial team photograph showing the winning squad or celebration from that tournament. No flag, federation crest, badge, logo, typography, or generic country symbol.`.slice(0, 700);
    }
    return `Create a specific, polished editorial image for "${card.title}". Use this context: ${card.subtitle}. ${card.notes} Show the actual subject, event, place, or moment rather than a generic symbol. No text or logos.`.replace(/\s+/g, ' ').trim().slice(0, 700);
  }

  private async requestWizardBatch(refinement = ''): Promise<BoardWizardGeneratedBatch> {
    if (!this.functions) {
      throw new Error('Firebase Functions are not available in this browser session.');
    }
    const targetBoard = this.wizardTargetBoardId() === 'new'
      ? null
      : this.boards().find((board) => board.id === this.wizardTargetBoardId()) ?? null;
    const prompt = [
      this.wizardPrompt().trim(),
      refinement ? `Refinement: ${refinement}` : '',
    ].filter(Boolean).join('\n');
    const callable = httpsCallable<Record<string, unknown>, unknown>(this.functions, 'generateBoardWizardBatch', {
      timeout: 170_000,
    });
    const response = await callable({
      mode: this.wizardMode(),
      prompt,
      pastedList: this.wizardMode() === 'paste' ? this.wizardPastedList().trim() : '',
      url: this.wizardMode() === 'url' ? this.wizardUrl().trim() : '',
      photoNames: this.wizardMode() === 'photos' ? this.wizardPhotoNamesList() : [],
      photos: this.wizardMode() === 'photos'
        ? this.wizardPhotos().map((photo, index) => ({
            index,
            name: photo.name,
            caption: photo.caption.trim(),
            ...this.imageDataUrlPayload(photo.analysisDataUrl),
          }))
        : [],
      targetBoardId: targetBoard?.id ?? '',
      targetBoardTitle: targetBoard?.title ?? '',
      defaultType: this.wizardDefaultType(),
      count: this.wizardCount(),
      vibe: this.wizardVibe(),
      tourOptions: this.isTourWizardMode(this.wizardMode())
        ? {
            voiceStyle: this.wizardTourVoiceStyle(),
            paceOrRouteStyle: this.wizardTourPaceOrStyle(),
            extras: Array.from(this.wizardTourExtras()),
          }
        : null,
      existingCards: targetBoard?.cards.slice(0, 80).map((card) => ({
        title: card.title,
        subtitle: card.subtitle,
        tags: card.tags,
      })) ?? [],
    });
    return this.normalizeWizardBatch(response.data);
  }

  private normalizeWizardBatch(value: unknown): BoardWizardGeneratedBatch {
    const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const boardData = data['board'] && typeof data['board'] === 'object'
      ? data['board'] as Record<string, unknown>
      : {};
    const cards = Array.isArray(data['cards'])
      ? data['cards'].map((card) => this.normalizeWizardGeneratedCard(card)).filter((card): card is BoardWizardGeneratedCard => !!card)
      : [];
    if (!cards.length) {
      throw new Error($localize`AI generation did not return any usable cards. Please try again.`);
    }
    const fallback = this.buildLocalWizardBatch();
    return {
      board: {
        title: this.stringValue(boardData['title'], fallback.board.title, 90),
        description: this.stringValue(boardData['description'], fallback.board.description, 500),
        icon: this.stringValue(boardData['icon'], fallback.board.icon, 64),
        tone: this.isBoardTone(boardData['tone']) ? boardData['tone'] : fallback.board.tone,
        kind: this.isBoardKind(boardData['kind']) ? boardData['kind'] : fallback.board.kind,
        tourMeta: this.normalizeTourMeta(boardData['tourMeta']) ?? fallback.board.tourMeta,
      },
      // The server owns explicit-count and complete-set cardinality decisions.
      // Do not truncate a verified complete set back to the UI's default count.
      cards: cards.slice(0, 100),
      sourceReport: this.normalizeWizardSourceReport(data['sourceReport']),
    };
  }

  private wizardGenerationErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message.replace(/^Firebase:\s*/i, '').trim() : '';
    const code = error instanceof FirebaseError ? error.code : '';
    if (
      code === 'functions/resource-exhausted'
      || /credits are depleted|prepayment|prepaid balance|gemini api prepaid/iu.test(message)
    ) {
      return $localize`AI generation is paused because the Gemini API prepaid balance is empty. Add credits in Google AI Studio Billing, then try again.`;
    }
    if (!message || /^(?:functions\/)?(?:internal|unknown)$/iu.test(message)) {
      return $localize`AI generation is temporarily unavailable. No placeholder cards were created. Please try again shortly.`;
    }
    return message;
  }

  private normalizeWizardSourceReport(value: unknown): BoardWizardSourceReport | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const data = value as Record<string, unknown>;
    const status = data['status'] === 'exact' || data['status'] === 'recovered' || data['status'] === 'partial'
      ? data['status']
      : 'partial';
    const method = data['method'] === 'page' || data['method'] === 'reader' || data['method'] === 'grounded-search'
      ? data['method']
      : 'page';
    return {
      status,
      method,
      sourceHost: this.stringValue(data['sourceHost'], '', 180),
      sourceBlocked: data['sourceBlocked'] === true,
      productCount: Math.round(this.numberValue(data['productCount'], 0, 0, 100)),
      exactImageCount: Math.round(this.numberValue(data['exactImageCount'], 0, 0, 100)),
      missingImageCount: Math.round(this.numberValue(data['missingImageCount'], 0, 0, 100)),
      snapshotDate: this.stringValue(data['snapshotDate'], '', 40),
      message: this.stringValue(data['message'], '', 500),
    };
  }

  private normalizeWizardGeneratedCard(value: unknown): BoardWizardGeneratedCard | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const data = value as Record<string, unknown>;
    const title = this.stringValue(data['title'], '', 80);
    if (!title) {
      return null;
    }
    const type = this.isBoardCardType(data['type']) ? data['type'] : this.wizardDefaultType();
    const subtitle = this.stringValue(data['subtitle'], 'Wizard draft', 120);
    const notes = this.stringValue(data['notes'], 'Review and edit this card before saving.', 3600);
    const sourceUrl = this.stringValue(data['sourceUrl'], '', 2000);
    const what3wordsAddress = what3WordsAddressFromCard({
      what3wordsAddress: data['what3wordsAddress'],
      title,
      subtitle,
      notes,
      sourceUrl,
    });
    const tags = Array.isArray(data['tags'])
      ? data['tags'].map((tag) => this.stringValue(tag, '', 24).toLowerCase()).filter(Boolean).slice(0, 6)
      : [this.wizardVibe(), type].slice(0, 6);
    const imageQuery = this.stringValue(data['image_query'], title, 120);
    return {
      title,
      subtitle,
      notes,
      type,
      scope: this.isBoardCardScope(data['scope']) ? data['scope'] : 'place',
      status: this.isBoardCardStatus(data['status']) ? data['status'] : 'saved',
      rating: this.numberValue(data['rating'], 4, 1, 5),
      tags,
      image_query: this.normalizeWizardImageQuery(title, imageQuery, subtitle, notes, tags),
      place_query: this.stringValue(data['place_query'], title, 140),
      entity_name: this.stringValue(data['entity_name'], title, 100),
      entity_type: this.isBoardEntityType(data['entity_type']) ? data['entity_type'] : (type === 'place' || type === 'shop' ? 'place' : type === 'food' ? 'food' : 'other'),
      image_intent: this.isBoardImageIntent(data['image_intent']) ? data['image_intent'] : (type === 'place' || type === 'shop' ? 'place' : type === 'food' ? 'food' : 'other'),
      image_context: this.stringValue(data['image_context'], '', 120),
      media_kind: this.isBoardMediaKind(data['media_kind']) ? data['media_kind'] : 'none',
      short_summary: this.stringValue(data['short_summary'], subtitle, 160),
      rank: this.numberValue(data['rank'], 0, 0, 100),
      imageUrl: this.stringValue(data['imageUrl'], '', 2000),
      audioPreviewUrl: this.stringValue(data['audioPreviewUrl'], '', 2000),
      spotifyTrackId: this.stringValue(data['spotifyTrackId'], '', 120),
      spotifyTrackUrl: this.stringValue(data['spotifyTrackUrl'], '', 2000),
      spotifyUri: this.stringValue(data['spotifyUri'], '', 240),
      spotifyArtistName: this.stringValue(data['spotifyArtistName'], '', 180),
      spotifyAlbumName: this.stringValue(data['spotifyAlbumName'], '', 180),
      spotifyArtworkUrl: this.stringValue(data['spotifyArtworkUrl'], '', 2000),
      placeId: this.stringValue(data['placeId'], '', 240),
      googleMapsUrl: this.stringValue(data['googleMapsUrl'], '', 2000),
      locationLat: this.optionalCoordinate(data['locationLat'], -90, 90),
      locationLng: this.optionalCoordinate(data['locationLng'], -180, 180),
      sourceUrl,
      productUrl: this.stringValue(data['productUrl'], '', 2000),
      merchant: this.stringValue(data['merchant'], '', 120),
      price: this.stringValue(data['price'], '', 80),
      currency: this.stringValue(data['currency'], '', 12),
      sku: this.stringValue(data['sku'], '', 100),
      availability: this.stringValue(data['availability'], '', 100),
      productCategory: this.stringValue(data['productCategory'], '', 100),
      imageSource: this.isCommerceImageSource(data['imageSource']) ? data['imageSource'] : undefined,
      extractionConfidence: this.numberValue(data['extractionConfidence'], 0, 0, 1),
      extractedAt: this.stringValue(data['extractedAt'], '', 40),
      what3wordsAddress,
      tour: this.normalizeCardTour(data['tour']),
    };
  }

  private wizardCardToCurrentCard(card: BoardWizardPreviewCard): Record<string, unknown> {
    return {
      title: card.title,
      subtitle: card.subtitle,
      notes: card.notes,
      type: card.type,
      scope: card.scope,
      status: card.status,
      rating: card.rating,
      tags: card.tags,
      image_query: this.normalizeWizardImageQuery(card.title, card.image_query || `${card.title} image`, card.subtitle, card.notes, card.tags),
      place_query: card.place_query || card.title,
      entity_name: card.entity_name || card.title,
      entity_type: card.entity_type,
      image_intent: card.image_intent,
      image_context: card.image_context || '',
      media_kind: card.media_kind || 'none',
      short_summary: card.short_summary || card.subtitle,
      rank: card.rank || 0,
      audioPreviewUrl: card.audioPreviewUrl || '',
      spotifyTrackId: card.spotifyTrackId || '',
      spotifyTrackUrl: card.spotifyTrackUrl || '',
      spotifyUri: card.spotifyUri || '',
      spotifyArtistName: card.spotifyArtistName || '',
      spotifyAlbumName: card.spotifyAlbumName || '',
      spotifyArtworkUrl: card.spotifyArtworkUrl || '',
      placeId: card.placeId || '',
      googleMapsUrl: card.googleMapsUrl || '',
      locationLat: card.locationLat ?? card.tour?.lat ?? undefined,
      locationLng: card.locationLng ?? card.tour?.lng ?? undefined,
      sourceUrl: card.sourceUrl || '',
      productUrl: card.productUrl || '',
      merchant: card.merchant || '',
      price: card.price || '',
      currency: card.currency || '',
      sku: card.sku || '',
      availability: card.availability || '',
      productCategory: card.productCategory || '',
      imageSource: card.imageSource || 'missing',
      extractionConfidence: card.extractionConfidence || 0,
      extractedAt: card.extractedAt || '',
      what3wordsAddress: card.what3wordsAddress || '',
    };
  }

  private async enrichWizardCards(
    cards: BoardWizardGeneratedCard[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<BoardWizardPreviewCard[]> {
    const preview: BoardWizardPreviewCard[] = [];
    const candidates = cards.slice(0, 100);
    for (const card of candidates) {
      let enriched: BoardWizardPreviewCard = {
        ...card,
        id: this.createId(),
        what3wordsAddress: what3WordsAddressFromCard(card),
        imageUrl: card.imageUrl ?? '',
        audioPreviewUrl: card.audioPreviewUrl ?? '',
        spotifyTrackId: card.spotifyTrackId ?? '',
        spotifyTrackUrl: card.spotifyTrackUrl ?? '',
        spotifyUri: card.spotifyUri ?? '',
        spotifyArtistName: card.spotifyArtistName ?? '',
        spotifyAlbumName: card.spotifyAlbumName ?? '',
        spotifyArtworkUrl: card.spotifyArtworkUrl ?? '',
        placeId: card.placeId ?? '',
        googleMapsUrl: card.googleMapsUrl ?? '',
        editing: false,
      };

      if (this.shouldEnrichWizardCard(card) && !enriched.imageUrl) {
        try {
          const place = await this.findWizardPlace(card);
          if (place) {
            enriched = {
              ...enriched,
              imageUrl: place.photoUrl || enriched.imageUrl,
              placeId: place.placeId,
              googleMapsUrl: place.googleMapsUrl,
              tags: this.mergeWizardTags(enriched.tags, this.placeTags(place)),
              tour: enriched.tour
                ? {
                    ...enriched.tour,
                    lat: place.lat,
                    lng: place.lng,
                    address: place.address || enriched.tour.address,
                  }
                : enriched.tour,
            };
          }
        } catch {
          // Place enrichment is best-effort; the generated card remains editable.
        }
      }
      preview.push(enriched);
      onProgress?.(preview.length, candidates.length);
    }
    return preview;
  }

  private async requestWizardCardImage(
    card: BoardWizardPreviewCard,
    targetBoardTitle: string,
    promptContext = '',
  ): Promise<BoardWizardGeneratedCard | null> {
    if (!this.functions) {
      return null;
    }
    const locationContext = [
      card.image_context,
      targetBoardTitle,
      promptContext,
    ].filter(Boolean).join(' · ');
    const callable = httpsCallable<Record<string, unknown>, unknown>(this.functions, 'generateBoardWizardBatch', {
      timeout: 150_000,
    });
    const response = await callable({
      mode: this.wizardMode(),
      prompt: [
        this.wizardPrompt().trim(),
        `Find the most accurate real photograph for this exact place only: ${card.title}.`,
        locationContext ? `Location context: ${locationContext}.` : '',
        'Prefer an exact Google Place or authoritative reference photo. Do not use a map, icon, logo, illustration, generic object, or a similarly named place.',
        'Preserve the title, text, what3words address, and all metadata.',
      ].filter(Boolean).join('\n'),
      pastedList: '',
      url: '',
      photoNames: [],
      imageOnly: true,
      currentCard: this.wizardCardToCurrentCard(card),
      targetBoardId: this.wizardTargetBoardId() === 'new' ? '' : this.wizardTargetBoardId(),
      targetBoardTitle,
      defaultType: card.type,
      count: 1,
      vibe: this.wizardVibe(),
    });
    return this.normalizeWizardBatch(response.data).cards[0] ?? null;
  }

  private shouldEnrichWizardCard(card: BoardWizardGeneratedCard): boolean {
    if (card.type === 'food' && card.tags.some((tag) => ['menu-item', 'dish', 'menu', 'food item'].includes(tag.toLowerCase()))) {
      return false;
    }
    if (this.isReferenceEntityWizardCard(card)) {
      return false;
    }
    return card.scope === 'place' && (card.type === 'place' || card.type === 'food' || card.type === 'shop');
  }

  private isReferenceEntityWizardCard(card: BoardWizardGeneratedCard): boolean {
    if (card.entity_type) {
      if (card.media_kind && card.media_kind !== 'none') return true;
      return ['person', 'event', 'work', 'product', 'organization'].includes(card.entity_type);
    }
    const text = `${card.title} ${card.subtitle} ${card.notes} ${card.tags.join(' ')} ${card.image_query}`.toLowerCase();
    return /\b(portrait|person|people|biography|born|died|president|first lady|signer|founding father|politician|leader|governor|senator|representative|justice|inventor|author|artist|scientist|athlete|actor|musician|composer|singer|rapper|pianist|guitarist|drummer|bassist|saxophonist|trumpeter|vocalist|bandleader|poet|philosopher|general|monarch|king|queen|emperor|saint|historical figure|world cup|fifa|national team|football team|soccer team|winner|winners|champion|champions|tournament|award|awards|record|records)\b/.test(text);
  }

  private normalizeWizardImageQuery(title: string, imageQuery: string, subtitle: string, notes: string, tags: string[]): string {
    const subject = this.canonicalWizardImageSubject(title);
    const text = `${title} ${imageQuery} ${subtitle} ${notes} ${tags.join(' ')} ${this.wizardPrompt()} ${this.wizardTargetBoardTitle()}`;
    if (subject && this.isLikelyWizardPersonSubject(subject, text)) {
      return [subject, this.wizardPersonRoleHint(text), 'portrait'].filter(Boolean).join(' ').slice(0, 120);
    }
    return imageQuery.slice(0, 120);
  }

  private canonicalWizardImageSubject(title: string): string {
    const match = title.replace(/\s+/g, ' ').trim().match(/^[^:\u2013\u2014-]{2,36}[:\u2013\u2014-]\s*([^:\u2013\u2014-]{2,80})$/);
    return (match?.[1] ?? '').replace(/^["'`]+|["'`]+$/g, '').trim();
  }

  private isWizardPersonImageContext(text: string): boolean {
    return /\b(portrait|person|people|biography|born|died|artist|musician|composer|singer|rapper|pianist|guitarist|drummer|bassist|saxophonist|trumpeter|vocalist|bandleader|actor|actress|author|writer|poet|scientist|inventor|athlete|president|leader|historical figure)\b/i.test(text);
  }

  private isLikelyWizardPersonSubject(subject: string, text: string): boolean {
    const words = subject.split(/\s+/).filter(Boolean);
    return words.length >= 2
      && words.length <= 5
      && words.some((word) => /^[A-Z][A-Za-z'.-]+$/.test(word))
      && this.isWizardPersonImageContext(text);
  }

  private wizardPersonRoleHint(text: string): string {
    const lower = text.toLowerCase();
    if (/\bjazz\b/.test(lower) && /\bpianist\b/.test(lower)) {
      return 'jazz pianist';
    }
    const roles = ['pianist', 'composer', 'singer', 'rapper', 'guitarist', 'drummer', 'bassist', 'saxophonist', 'trumpeter', 'vocalist', 'bandleader', 'musician', 'artist', 'actor', 'actress', 'author', 'writer', 'poet', 'scientist', 'inventor', 'athlete', 'president', 'leader'];
    return roles.find((role) => new RegExp(`\\b${role}\\b`, 'i').test(text)) ?? '';
  }

  private async findWizardPlace(card: BoardWizardGeneratedCard): Promise<PlaceSearchResult | null> {
    const query = card.place_query || card.title;
    const context = [
      card.image_context,
      this.wizardPrompt().trim(),
      this.wizardTargetBoardTitle(),
    ].filter(Boolean).join(', ');
    const results = await this.googleMapsService.searchPlaces(query, context);
    return results[0] ?? null;
  }

  private buildLocalWizardBatch(refinement = ''): BoardWizardGeneratedBatch {
    const mode = this.wizardMode();
    const source = mode === 'paste'
      ? this.wizardPastedList()
      : mode === 'photos'
        ? this.wizardPhotoNamesList().join('\n')
        : mode === 'url'
          ? this.wizardUrl()
          : this.wizardPrompt();
    if (this.isTourWizardMode(mode)) {
      return this.buildLocalTourWizardBatch(source || refinement || 'Local tour');
    }
    const items = mode === 'photos'
      ? this.wizardPhotos().map((photo, index) => {
          const title = this.photoTitleFromFileName(photo.name);
          return title === 'Photo memory' ? `Photo ${index + 1}` : title;
        })
      : this.localWizardItems(source || refinement || 'Wizard card', mode === 'paste').slice(0, this.wizardCount());
    const title = this.wizardTargetBoardId() === 'new'
      ? mode === 'photos'
        ? this.titleFromWizardInput(this.wizardPrompt().trim() || 'Photo memories')
        : this.titleFromWizardInput(source || refinement || 'Wizard board')
      : this.wizardTargetBoardTitle();
    const defaultType = this.wizardDefaultType();
    return {
      board: {
        title,
        description: mode === 'photos'
          ? 'A visual memory board created from your selected photos.'
          : `${this.wizardVibe()} board draft generated from ${mode} input.`,
        icon: defaultType === 'food' ? 'restaurant' : defaultType === 'shop' ? 'storefront' : 'auto_awesome',
        tone: this.wizardVibe() === 'foodie'
          ? 'coral'
          : this.wizardVibe() === 'traveler'
            ? 'sky'
            : this.wizardVibe() === 'memory'
              ? 'purple'
            : 'teal',
        kind: 'standard',
        tourMeta: null,
      },
      cards: items.map((titleValue, index) => ({
        title: titleValue,
        subtitle: mode === 'photos' ? 'Photo-inspired memory' : 'Wizard draft',
        notes: refinement || 'Generated as a starting point. Edit details, tags, rating, and images before saving.',
        type: defaultType,
        scope: 'place',
        status: index % 5 === 0 ? 'favorite' : 'saved',
        rating: Math.max(3, 5 - (index % 3)),
        tags: [this.wizardVibe(), defaultType].slice(0, 6),
        image_query: `${titleValue} ${title}`,
        place_query: titleValue,
      })),
    };
  }

  private what3WordsSourceFromOffGridWizard(): What3WordsBoardSource {
    const parsed = this.wizardOffGridParsedSource();
    const singleLocation = this.wizardOffGridResolvedLocation();
    const items = parsed?.items.length
      ? parsed.items
      : singleLocation
        ? [{ name: '', words: singleLocation.words, sourceLine: 1 }]
        : [];
    return {
      title: '',
      items,
      issues: parsed?.issues ?? [],
    };
  }

  private buildWhat3WordsWizardBatch(
    source: What3WordsBoardSource,
    fromOffGridWizard = false,
    resolvedLocations: Record<string, ResolvedWhat3WordsLocation> = {},
  ): BoardWizardGeneratedBatch {
    const verifiedLocations = {
      ...(fromOffGridWizard ? this.wizardOffGridVerifiedLocations() : {}),
      ...resolvedLocations,
    };
    const tip = fromOffGridWizard ? this.wizardOffGridTip().trim().slice(0, 3600) : '';
    const title = this.wizardTargetBoardId() === 'new'
      ? source.title || 'Off-grid Places'
      : this.wizardTargetBoardTitle();
    const isSingle = source.items.length === 1;
    return {
      board: {
        title,
        description: $localize`Exact places worth sharing, even when they do not have a street address.`,
        icon: 'location_on',
        tone: 'green',
        kind: this.wizardTargetBoardId() === 'new' ? 'off-grid' : undefined,
        tourMeta: null,
      },
      cards: source.items.slice(0, 100).map((item, index) => {
        const location = verifiedLocations[item.words]
          ?? (isSingle ? this.wizardOffGridResolvedLocation() : null);
        const name = (
          item.name
          || (index === 0 ? this.wizardOffGridName().trim() : '')
          || `Off-grid place ${index + 1}`
        ).slice(0, 80);
        const nearby = location?.nearestPlace ? ` · near ${location.nearestPlace}` : '';
        const locationContext = [location?.nearestPlace, location?.country]
          .filter(Boolean)
          .join(', ');
        return {
          title: name,
          subtitle: `Pinned to ///${item.words}${nearby}`,
          notes: tip || `This card points to a precise 3 m × 3 m what3words square. Use Let’s go to open it for navigation.`,
          type: 'place',
          scope: 'place',
          status: 'saved',
          rating: 4,
          tags: ['off-grid', 'what3words'],
          image_query: `${name}${locationContext ? ` ${locationContext}` : ''} landmark place photo`,
          place_query: [name, locationContext].filter(Boolean).join(', '),
          imageUrl: fromOffGridWizard && isSingle ? this.wizardOffGridPhoto() : '',
          entity_name: name,
          entity_type: 'place',
          image_intent: 'place',
          image_context: locationContext,
          locationLat: location?.lat,
          locationLng: location?.lng,
          short_summary: `Exact location: ///${item.words}`,
          what3wordsAddress: item.words,
          rank: index + 1,
        };
      }),
    };
  }

  private async generateWhat3WordsWizardPreview(
    source: What3WordsBoardSource,
    fromOffGridWizard = false,
  ): Promise<void> {
    const total = source.items.length;
    this.wizardStep.set('loading');
    this.wizardLoadingTask.set({
      message: total === 1 ? 'Locating the exact square' : `Locating ${total} exact squares`,
      progress: 6,
    });

    const seedLocations = fromOffGridWizard ? this.wizardOffGridVerifiedLocations() : {};
    const resolvedLocations = await this.resolveWizardWhat3WordsLocations(
      source,
      seedLocations,
      (completed) => {
        this.wizardLoadingTask.set({
          message: total === 1
            ? 'Locating the exact square'
            : `Located ${completed} of ${total} exact squares`,
          progress: 6 + (completed / Math.max(1, total)) * 24,
        });
      },
    );
    if (fromOffGridWizard) {
      this.wizardOffGridVerifiedLocations.set(resolvedLocations);
    }

    const batch = this.buildWhat3WordsWizardBatch(source, fromOffGridWizard, resolvedLocations);
    this.wizardLoadingTask.set({
      message: total === 1 ? 'Searching for an accurate place photo' : `Searching photos for ${total} places`,
      progress: 32,
    });
    const previewCards = await this.enrichWizardCards(batch.cards, (completed) => {
      this.wizardLoadingTask.set({
        message: total === 1
          ? 'Checking the place photo'
          : `Checked place photos ${completed} of ${total}`,
        progress: 32 + (completed / Math.max(1, total)) * 28,
      });
    });
    const enrichedCards = await this.enrichWizardMissingPlaceImages(
      previewCards,
      batch.board.title,
      (completed, missingTotal) => {
        this.wizardLoadingTask.set({
          message: missingTotal === 1
            ? 'Trying trusted photo sources'
            : `Trying trusted photo sources ${completed} of ${missingTotal}`,
          progress: 62 + (completed / Math.max(1, missingTotal)) * 34,
        });
      },
    );

    this.wizardLoadingTask.set({ message: $localize`Preparing the editable preview`, progress: 100 });
    this.wizardResult.set({ ...batch, cards: enrichedCards });
    this.wizardPreviewCards.set(enrichedCards);
    this.wizardSelectedCardIds.set(new Set(enrichedCards.map((card) => card.id)));
    const missingImages = enrichedCards.filter((card) => !card.imageUrl).length;
    this.wizardError.set(
      missingImages
        ? `${enrichedCards.length - missingImages} of ${enrichedCards.length} place photos were found. The exact what3words links are preserved; missing photos can still be added in Edit.`
        : null,
    );
    this.wizardStep.set('preview');
    this.wizardLoadingTask.set(null);
  }

  private async resolveWizardWhat3WordsLocations(
    source: What3WordsBoardSource,
    seed: Record<string, ResolvedWhat3WordsLocation>,
    onProgress: (completed: number) => void,
  ): Promise<Record<string, ResolvedWhat3WordsLocation>> {
    const resolved = { ...seed };
    let nextIndex = 0;
    let completed = 0;
    const worker = async () => {
      while (nextIndex < source.items.length) {
        const item = source.items[nextIndex++];
        if (!resolved[item.words]) {
          try {
            resolved[item.words] = await resolveWhat3WordsAddress(item.words);
          } catch {
            // The exact link remains useful and title-based photo search still runs.
          }
        }
        completed += 1;
        onProgress(completed);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(3, source.items.length) }, () => worker()),
    );
    return resolved;
  }

  private async enrichWizardMissingPlaceImages(
    cards: BoardWizardPreviewCard[],
    boardTitle: string,
    onProgress: (completed: number, total: number) => void = () => undefined,
  ): Promise<BoardWizardPreviewCard[]> {
    const missingCards = cards.filter((card) => !card.imageUrl && this.shouldEnrichWizardCard(card));
    if (!missingCards.length || !this.functions) {
      onProgress(missingCards.length, missingCards.length);
      return cards;
    }

    const enrichedById = new Map(cards.map((card) => [card.id, card]));
    let nextIndex = 0;
    let completed = 0;
    const worker = async () => {
      while (nextIndex < missingCards.length) {
        const card = missingCards[nextIndex++];
        try {
          const replacement = await this.requestWizardCardImage(
            card,
            boardTitle,
            card.image_context || card.subtitle,
          );
          if (replacement?.imageUrl) {
            enrichedById.set(card.id, {
              ...card,
              imageUrl: replacement.imageUrl,
              imageSource: 'search',
              placeId: replacement.placeId || card.placeId,
              googleMapsUrl: replacement.googleMapsUrl || card.googleMapsUrl,
            });
          }
        } catch {
          // One unavailable image must not discard the other exact place cards.
        }
        completed += 1;
        onProgress(completed, missingCards.length);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(3, missingCards.length) }, () => worker()),
    );
    return cards.map((card) => enrichedById.get(card.id) ?? card);
  }

  private localWizardItems(source: string, preserveSingleItemList = false): string[] {
    const lines = source
      .split(/\n|,|;/)
      .map((line) => line.replace(/^[-*\d.)\s]+/, '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ').trim())
      .filter((line) => line.length > 1);
    if (lines.length > 1 || (preserveSingleItemList && lines.length)) {
      return lines;
    }
    const title = this.titleFromWizardInput(source);
    return this.localWizardSearchSeeds(title);
  }

  private localWizardSearchSeeds(title: string): string[] {
    const count = this.wizardCount();
    const lower = title.toLowerCase();
    if (lower.includes('eat') || lower.includes('food') || lower.includes('restaurant')) {
      const place = this.inferPlaceFromWizardText(title);
      return [
        `best restaurants ${place}`,
        `best casual restaurants ${place}`,
        `best fine dining ${place}`,
        `best lunch spots ${place}`,
        `best dinner spots ${place}`,
        `best cafes ${place}`,
        `best bakeries ${place}`,
        `best pizza ${place}`,
        `best tacos ${place}`,
        `best sushi ${place}`,
        `best brunch ${place}`,
        `best dessert ${place}`,
      ].slice(0, count);
    }
    return Array.from({ length: count }, (_, index) => `${title} option ${index + 1}`);
  }

  private inferPlaceFromWizardText(value: string): string {
    const match = value.match(/\bin\s+([a-zA-Z\s.'-]+)$/i);
    return match?.[1]?.trim() || value;
  }

  private titleFromWizardInput(value: string): string {
    const text = value.replace(/^https?:\/\/\S+/i, 'URL board').replace(/\s+/g, ' ').trim();
    if (!text) {
      return 'Wizard board';
    }
    return text.slice(0, 72);
  }

  private mergeWizardTags(left: string[], right: string[]): string[] {
    return Array.from(new Set([...left, ...right].map((tag) => tag.trim().toLowerCase()).filter(Boolean))).slice(0, 6);
  }

  private isOwnBoardsProfile(): boolean {
    const uid = this.authService.uid();
    const publicOwnerKey = this.publicOwnerKey();
    const publicOwnerUid = this.publicOwnerUid();
    if (!this.authService.isAuthenticated()) {
      return false;
    }
    if (!publicOwnerKey) {
      return true;
    }
    if (publicOwnerUid) {
      return publicOwnerUid === uid;
    }
    const ownerBoard = this.boardsProfileBoard();
    if (ownerBoard?.ownerUserId) {
      return ownerBoard.ownerUserId === uid;
    }
    return this.publicOwnerSlug() === this.currentPublicOwnerKey();
  }

  private currentPublicOwnerKey(): string {
    if (!this.authService.uid()) {
      return '';
    }
    return this.publicHandleFromText(this.userName() || this.userEmail() || 'livingwiki-user');
  }

  private publicOwnerUidFromKey(ownerKey: string | null): string | null {
    const trimmed = this.decodeOwnerKey(ownerKey).trim();
    const separator = trimmed.lastIndexOf('~');
    if (separator < 0 || separator === trimmed.length - 1) {
      return null;
    }
    return trimmed.slice(separator + 1).trim() || null;
  }

  private publicOwnerSlugFromKey(ownerKey: string | null): string | null {
    const trimmed = this.decodeOwnerKey(ownerKey).trim();
    if (!trimmed) {
      return null;
    }
    const separator = trimmed.lastIndexOf('~');
    const handle = (separator >= 0 ? trimmed.slice(0, separator) : trimmed).trim();
    return this.publicHandleFromText(handle);
  }

  private publicOwnerHandleLabel(): string {
    const decoded = this.decodeOwnerKey(this.publicOwnerKey());
    const separator = decoded.lastIndexOf('~');
    const handle = (separator >= 0 ? decoded.slice(0, separator) : decoded).trim();
    return handle
      .split('-')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ') || 'LivingWiki curator';
  }

  private decodeOwnerKey(ownerKey: string | null): string {
    if (!ownerKey) {
      return '';
    }
    try {
      return decodeURIComponent(ownerKey);
    } catch {
      return ownerKey;
    }
  }

  private publicHandleFromText(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/@.*$/, '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'livingwiki-user';
  }

  private stringValue(value: unknown, fallback: string, maxLength: number): string {
    const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    return (text || fallback).slice(0, maxLength);
  }

  private numberValue(value: unknown, fallback: number, min: number, max: number): number {
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : fallback;
    return Math.max(min, Math.min(max, Number.isFinite(number) ? Math.round(number) : fallback));
  }

  private optionalCoordinate(value: unknown, min: number, max: number): number | undefined {
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : Number.NaN;
    return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
  }

  private decimalValue(value: unknown, fallback: number | null, min: number, max: number): number | null {
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : fallback;
    if (typeof number !== 'number' || !Number.isFinite(number)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, number));
  }

  private safeMapSearchUrl(query: string, zoom: number): SafeResourceUrl {
    const url = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  private hasTourCoordinates(card: BoardCard): boolean {
    return typeof card.tour?.lat === 'number' && typeof card.tour?.lng === 'number';
  }

  private tourCoordinateQuery(card: BoardCard): string {
    return this.hasTourCoordinates(card)
      ? `${card.tour?.lat},${card.tour?.lng}`
      : card.tour?.address || card.subtitle || card.title;
  }

  private normalizedTourRouteText(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private normalizeTourMeta(value: unknown): BoardTourMeta | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const data = value as Record<string, unknown>;
    const mode = data['mode'] === 'driving' ? 'driving' : data['mode'] === 'walking' ? 'walking' : null;
    if (!mode) {
      return null;
    }
    const voiceStyle: BoardTourVoiceStyle =
      data['voiceStyle'] === 'local' || data['voiceStyle'] === 'kid-friendly' || data['voiceStyle'] === 'historian'
        ? data['voiceStyle']
        : 'historian';
    return {
      mode,
      totalDistanceText: this.stringValue(data['totalDistanceText'], '', 32),
      totalDurationText: this.stringValue(data['totalDurationText'], '', 32),
      routePolyline: this.stringValue(data['routePolyline'], '', 4000),
      voiceStyle,
      paceOrRouteStyle: this.stringValue(data['paceOrRouteStyle'], mode === 'driving' ? 'Balanced' : 'Standard', 40),
      extras: Array.isArray(data['extras'])
        ? data['extras'].map((extra) => this.stringValue(extra, '', 40)).filter(Boolean).slice(0, 8)
        : [],
      showWayfindersDefault: data['showWayfindersDefault'] === true,
    };
  }

  private normalizeTourLeg(value: unknown): BoardTourLeg | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const data = value as Record<string, unknown>;
    const instruction = this.stringValue(data['instruction'], '', 260);
    const navScript = this.stringValue(data['navScript'], instruction, 700);
    if (!instruction && !navScript) {
      return null;
    }
    return {
      distanceText: this.stringValue(data['distanceText'], '', 32),
      durationText: this.stringValue(data['durationText'], '', 32),
      instruction,
      navScript,
      encodedPolyline: this.stringValue(data['encodedPolyline'], '', 4000),
      toCardId: this.stringValue(data['toCardId'], '', 160),
    };
  }

  private normalizeCardTour(value: unknown): BoardCardTour | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const data = value as Record<string, unknown>;
    const sequence = this.numberValue(data['sequence'], 0, 0, 200);
    const guideScript = this.stringValue(data['guideScript'], '', 3600);
    const address = this.stringValue(data['address'], '', 180);
    if (!sequence && !guideScript && !address) {
      return null;
    }
    return {
      sequence,
      lat: this.decimalValue(data['lat'], null, -90, 90),
      lng: this.decimalValue(data['lng'], null, -180, 180),
      address,
      guideScript,
      legToNext: this.normalizeTourLeg(data['legToNext']),
    };
  }

  private cardTourFromDraft(draft: CardDraft): BoardCardTour | null {
    const sequence = Number.parseInt(draft.tourSequence, 10);
    const hasTourText = [
      draft.tourGuideScript,
      draft.tourAddress,
      draft.tourLegInstruction,
      draft.tourLegNavScript,
    ].some((value) => value.trim());
    if (!Number.isFinite(sequence) && !hasTourText) {
      return null;
    }
    const legToNext = draft.tourLegInstruction.trim() || draft.tourLegNavScript.trim()
      ? {
          distanceText: draft.tourLegDistanceText.trim().slice(0, 32),
          durationText: draft.tourLegDurationText.trim().slice(0, 32),
          instruction: draft.tourLegInstruction.trim().slice(0, 260),
          navScript: draft.tourLegNavScript.trim().slice(0, 700),
          encodedPolyline: draft.tourLegEncodedPolyline.trim().slice(0, 4000),
          toCardId: '',
        }
      : null;
    return {
      sequence: Number.isFinite(sequence) ? Math.max(1, Math.min(200, sequence)) : 1,
      lat: this.decimalValue(draft.tourLat, null, -90, 90),
      lng: this.decimalValue(draft.tourLng, null, -180, 180),
      address: draft.tourAddress.trim().slice(0, 180),
      guideScript: draft.tourGuideScript.trim().slice(0, 3600),
      legToNext,
    };
  }

  private buildWizardTourMeta(cards: BoardCard[]): BoardTourMeta | null {
    if (!this.isTourWizardMode(this.wizardMode())) {
      return null;
    }
    const tourCards = cards.filter((card) => card.tour).sort((left, right) => (left.tour?.sequence ?? 0) - (right.tour?.sequence ?? 0));
    const distance = this.sumTourLegMiles(tourCards);
    const duration = tourCards.reduce((total, card) => total + this.durationMinutes(card.tour?.legToNext?.durationText), 0);
    const mode: BoardTourMode = this.wizardMode() === 'driving-tour' ? 'driving' : 'walking';
    return {
      mode,
      totalDistanceText: distance ? `${distance.toFixed(distance >= 10 ? 0 : 1)} mi` : '',
      totalDurationText: duration ? `${Math.round(duration)} min route` : '',
      routePolyline: '',
      voiceStyle: this.wizardTourVoiceStyle(),
      paceOrRouteStyle: this.wizardTourPaceOrStyle(),
      extras: Array.from(this.wizardTourExtras()).slice(0, 8),
      showWayfindersDefault: false,
    };
  }

  private sumTourLegMiles(cards: BoardCard[]): number {
    return cards.reduce((total, card) => {
      const text = card.tour?.legToNext?.distanceText ?? '';
      const value = Number.parseFloat(text);
      if (!Number.isFinite(value)) {
        return total;
      }
      return total + (/\bft\b/i.test(text) ? value / 5280 : value);
    }, 0);
  }

  private durationMinutes(text = ''): number {
    const value = Number.parseFloat(text);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return /\bhr|hour/i.test(text) ? value * 60 : value;
  }

  private buildLocalTourWizardBatch(source: string): BoardWizardGeneratedBatch {
    const mode: BoardTourMode = this.wizardMode() === 'driving-tour' ? 'driving' : 'walking';
    const stopNames = this.localWizardSearchSeeds(this.titleFromWizardInput(source)).slice(0, Math.max(2, this.wizardCount()));
    const title = this.titleFromWizardInput(source || `${mode} tour`);
    const cards = stopNames.map((name, index): BoardWizardGeneratedCard => {
      const isLast = index === stopNames.length - 1;
      const next = stopNames[index + 1] ?? '';
      const durationText = mode === 'driving' ? `${Math.max(3, 5 + index)} min` : `${Math.max(2, 3 + (index % 4))} min`;
      const distanceText = mode === 'driving' ? `${(0.8 + index * 0.3).toFixed(1)} mi` : `${(0.1 + index * 0.05).toFixed(1)} mi`;
      return {
        title: name,
        subtitle: `Stop ${index + 1}`,
        notes: `Draft stop for ${title}. Edit this text, address, guide script, and wayfinder details before sharing.`,
        type: 'place',
        scope: 'place',
        status: index === 0 ? 'favorite' : 'planned',
        rating: 4,
        tags: [mode === 'driving' ? 'driving-tour' : 'walking-tour', 'stop'],
        image_query: `${name} ${title}`,
        place_query: name,
        tour: {
          sequence: index + 1,
          lat: null,
          lng: null,
          address: '',
          guideScript: `Welcome to stop ${index + 1}: ${name}. This is a generated starting point for the ${title} tour. Edit this narration with the story, sponsor language, or local context you want visitors to hear.`,
          legToNext: isLast
            ? null
            : {
                distanceText,
                durationText,
                instruction: `${mode === 'driving' ? 'Drive' : 'Walk'} from ${name} to ${next}.`,
                navScript: `From ${name}, ${mode === 'driving' ? 'drive' : 'walk'} about ${durationText}, roughly ${distanceText}, to your next stop: ${next}.`,
                encodedPolyline: '',
                toCardId: '',
              },
        },
      };
    });
    return {
      board: {
        title,
        description: `A self-guided ${mode} tour generated from your prompt.`,
        icon: mode === 'driving' ? 'directions_car' : 'directions_walk',
        tone: mode === 'driving' ? 'green' : 'sky',
        kind: mode === 'driving' ? 'driving-tour' : 'walking-tour',
        tourMeta: {
          mode,
          totalDistanceText: '',
          totalDurationText: '',
          routePolyline: '',
          voiceStyle: this.wizardTourVoiceStyle(),
          paceOrRouteStyle: this.wizardTourPaceOrStyle(),
          extras: Array.from(this.wizardTourExtras()),
          showWayfindersDefault: false,
        },
      },
      cards,
    };
  }

  private loadLocalBoards(): void {
    if (!this.isBrowser) {
      this.boards.set([]);
      this.hasLoaded = true;
      return;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? this.parseBoards(raw) : null;
    const uid = this.authService.uid();
    const userBoards = (parsed ?? []).filter(
      (board) => !DEMO_BOARD_IDS.has(board.id) && (!board.ownerUserId || board.ownerUserId === uid),
    );
    this.loadedStoredLocalBoards = userBoards.length > 0;
    const boards = userBoards;
    this.boards.set(boards);
    this.hasLoaded = true;
  }

  private async loadBoards(
    boardId: string | null,
    publicOwnerUid: string | null = null,
    publicOwnerSlug: string | null = null,
    publicOwnerRouteActive = false,
  ): Promise<void> {
    if (!this.isBrowser || !this.firestore) {
      return;
    }

    await this.authService.waitForReady();
    const uid = this.authService.uid();
    this.boardsSyncError.set(null);
    this.privateBoardBlocked.set(false);

    try {
      const loaded: Board[] = [];
      if (publicOwnerRouteActive) {
        if (publicOwnerUid) {
          loaded.push(...await this.loadPublicBoardsForOwner(publicOwnerUid));
        } else if (publicOwnerSlug) {
          loaded.push(...await this.loadPublicBoardsForOwnerSlug(publicOwnerSlug));
        }
      } else if (publicOwnerUid) {
        loaded.push(...await this.loadPublicBoardsForOwner(publicOwnerUid));
      } else if (uid) {
        loaded.push(...await this.loadUserBoards(uid));
      } else if (!boardId) {
        loaded.push(...await this.loadPublicBoards());
      }

      if (boardId && !loaded.some((board) => board.id === boardId)) {
        try {
          const sharedBoard = await this.loadBoardById(boardId);
          if (sharedBoard) {
            loaded.unshift(sharedBoard);
          }
        } catch (error) {
          if (this.isPermissionDeniedError(error)) {
            this.privateBoardBlocked.set(true);
          } else {
            throw error;
          }
        }
      }

      if (publicOwnerRouteActive) {
        this.boards.set(loaded);
        return;
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
      this.boardsSyncError.set($localize`Boards are using this browser for now. Firebase sync is unavailable.`);
    }
  }

  private watchSelectedBoard(boardId: string | null): void {
    this.selectedBoardUnsubscribe?.();
    this.selectedBoardUnsubscribe = null;
    if (!this.isBrowser || !this.firestore || !boardId) {
      return;
    }
    this.selectedBoardUnsubscribe = onSnapshot(
      doc(this.firestore, 'boards', boardId),
      (snapshot) => {
        if (!snapshot.exists() || this.selectedBoardId() !== boardId) {
          return;
        }
        const board = this.boardFromRecord(snapshot.id, snapshot.data());
        if (!board) {
          return;
        }
        this.boards.update((boards) => boards.some((item) => item.id === board.id)
          ? boards.map((item) => item.id === board.id ? board : item)
          : [board, ...boards]);
        if (this.boardTranslationTarget()
          && this.boardTranslationVersion()
          && this.boardTranslationVersion() !== board.updatedAt) {
          this.boardTranslationResult.set(null);
          this.boardTranslationVersion.set('');
          void this.syncRequestedBoardTranslation();
        }
      },
      () => undefined,
    );
  }

  private async loadUserBoards(uid: string): Promise<Board[]> {
    if (!this.firestore) {
      return [];
    }

    const snapshot = await getDocs(
      query(collection(this.firestore, 'boards'), where('owner_user_id', '==', uid)),
    );
    const boards = snapshot.docs
      .map((boardDoc) => this.boardFromRecord(boardDoc.id, boardDoc.data()))
      .filter((board): board is Board => !!board)
      .sort((left, right) => this.compareBoards(left, right));
    void Promise.all(
      boards
        .filter((board) => this.boardNeedsOwnerSnapshot(board))
        .map((board) => this.persistBoard(board)),
    ).catch(() => undefined);
    return boards;
  }

  private async loadPublicBoardsForOwner(uid: string): Promise<Board[]> {
    if (!this.firestore) {
      return [];
    }

    try {
      const snapshot = await getDocs(
        query(
          collection(this.firestore, 'boards'),
          where('owner_user_id', '==', uid),
          where('visibility', '==', 'public'),
        ),
      );
      return snapshot.docs
        .map((boardDoc) => this.boardFromRecord(boardDoc.id, boardDoc.data()))
        .filter((board): board is Board => !!board && board.ownerUserId === uid)
        .sort((left, right) => this.compareBoards(left, right));
    } catch {
      const publicBoards = await this.loadPublicBoards();
      return publicBoards.filter((board) => board.ownerUserId === uid);
    }
  }

  private async loadPublicBoardsForOwnerSlug(slug: string): Promise<Board[]> {
    if (!this.firestore) {
      return [];
    }

    try {
      const snapshot = await getDocs(
        query(
          collection(this.firestore, 'boards'),
          where('owner_public_slug', '==', slug),
          where('visibility', '==', 'public'),
        ),
      );
      const boards = snapshot.docs
        .map((boardDoc) => this.boardFromRecord(boardDoc.id, boardDoc.data()))
        .filter((board): board is Board => !!board && board.ownerPublicSlug === slug)
        .sort((left, right) => this.compareBoards(left, right));
      if (boards.length) {
        return boards;
      }
      const publicBoards = await this.loadPublicBoards();
      return publicBoards.filter((board) => this.boardMatchesPublicOwnerSlug(board, slug));
    } catch {
      const publicBoards = await this.loadPublicBoards();
      return publicBoards.filter((board) => this.boardMatchesPublicOwnerSlug(board, slug));
    }
  }

  private async loadPublicBoards(): Promise<Board[]> {
    if (!this.firestore) {
      return [];
    }

    const snapshot = await getDocs(
      query(collection(this.firestore, 'boards'), where('visibility', '==', 'public')),
    );
    return snapshot.docs
      .map((boardDoc) => this.boardFromRecord(boardDoc.id, boardDoc.data()))
      .filter((board): board is Board => !!board)
      .sort((left, right) => this.compareBoards(left, right));
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
          kind: this.isBoardKind((board as Board).kind) ? (board as Board).kind : 'standard',
          sortOrder: this.normalizeBoardSortOrder((board as Partial<Board>).sortOrder, board.createdAt),
          ownerUserId: typeof board.ownerUserId === 'string' ? board.ownerUserId : '',
          ownerPublicSlug: typeof board.ownerPublicSlug === 'string' ? board.ownerPublicSlug : '',
          ownerDisplayName: typeof board.ownerDisplayName === 'string' ? board.ownerDisplayName : '',
          ownerPhotoUrl: typeof board.ownerPhotoUrl === 'string' ? board.ownerPhotoUrl : '',
          ownerProfileIcon: typeof board.ownerProfileIcon === 'string' ? board.ownerProfileIcon : '',
          ownerProfilePictureType: this.isProfilePictureType(board.ownerProfilePictureType)
            ? board.ownerProfilePictureType
            : null,
          forkedFromBoardId: typeof board.forkedFromBoardId === 'string' ? board.forkedFromBoardId : '',
          forkedFromTitle: typeof board.forkedFromTitle === 'string' ? board.forkedFromTitle : '',
          forkedFromOwnerUserId: typeof board.forkedFromOwnerUserId === 'string' ? board.forkedFromOwnerUserId : '',
          forkedFromOwnerName: typeof board.forkedFromOwnerName === 'string' ? board.forkedFromOwnerName : '',
          visibility: this.isBoardVisibility((board as Partial<Board>).visibility) ? (board as Board).visibility : 'public',
          imageUrl: board.imageUrl ?? '',
          logoUrl: typeof board.logoUrl === 'string' ? board.logoUrl : '',
          logoLinkUrl: typeof board.logoLinkUrl === 'string' ? board.logoLinkUrl : '',
          stackCtaLabel: typeof board.stackCtaLabel === 'string' ? board.stackCtaLabel : '',
          stackCtaUrl: typeof board.stackCtaUrl === 'string' ? board.stackCtaUrl : '',
          socialVideoUrl: typeof board.socialVideoUrl === 'string' ? board.socialVideoUrl : '',
          socialVideoMimeType: typeof board.socialVideoMimeType === 'string' ? board.socialVideoMimeType : '',
          socialVideoUpdatedAt: typeof board.socialVideoUpdatedAt === 'string' ? board.socialVideoUpdatedAt : '',
          socialVideoRenderVersion: typeof board.socialVideoRenderVersion === 'string' ? board.socialVideoRenderVersion : '',
          socialVideoRatio: this.isStackRatio((board as Partial<Board>).socialVideoRatio)
            ? (board as Board).socialVideoRatio
            : 'vertical',
          socialVideoAudioTrackId: normalizeStackAudioTrackId(
            (board as Partial<Board>).socialVideoAudioTrackId,
          ),
          socialVideoAudioVolume: normalizeStackAudioVolume(
            (board as Partial<Board>).socialVideoAudioVolume,
          ),
          backNote: board.backNote ?? '',
          stickers: this.normalizeStickers((board as Board).stickers),
          tourMeta: this.normalizeTourMeta((board as Board).tourMeta),
          learningQuiz: normalizeBoardLearningQuiz((board as Board).learningQuiz),
          cards: board.cards.map((card) => ({
            ...card,
            imageUrl: card.imageUrl ?? '',
            imageUrls: this.uniqueImageUrls([
              card.imageUrl ?? '',
              ...((card as Partial<BoardCard>).imageUrls ?? []),
            ]),
            audioPreviewUrl: (card as Partial<BoardCard>).audioPreviewUrl ?? '',
            spotifyTrackId: (card as Partial<BoardCard>).spotifyTrackId ?? '',
            spotifyTrackUrl: (card as Partial<BoardCard>).spotifyTrackUrl ?? '',
            spotifyUri: (card as Partial<BoardCard>).spotifyUri ?? '',
            spotifyArtistName: (card as Partial<BoardCard>).spotifyArtistName ?? '',
            spotifyAlbumName: (card as Partial<BoardCard>).spotifyAlbumName ?? '',
            spotifyArtworkUrl: (card as Partial<BoardCard>).spotifyArtworkUrl ?? '',
            placeId: card.placeId ?? '',
            googleMapsUrl: card.googleMapsUrl ?? '',
            locationLat: this.optionalCoordinate((card as Partial<BoardCard>).locationLat, -90, 90),
            locationLng: this.optionalCoordinate((card as Partial<BoardCard>).locationLng, -180, 180),
            what3wordsAddress: what3WordsAddressFromCard(card),
            scope: this.isBoardCardScope((card as BoardCard).scope) ? (card as BoardCard).scope : 'place',
            stickers: this.normalizeStickers(card.stickers),
            tour: this.normalizeCardTour((card as BoardCard).tour),
            relatedCards: Array.isArray((card as BoardCard).relatedCards)
              ? ((card as BoardCard).relatedCards ?? [])
                .map((related) => this.cardFromRecord(related, false))
                .filter((related): related is BoardCard => !!related)
                .slice(0, 100)
              : [],
          })),
        }));
    } catch {
      return null;
    }
  }

  private async persistAndReplaceBoard(board: Board): Promise<void> {
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can save changes.`);
      return;
    }
    try {
      const persisted = await this.persistBoard(board);
      this.boards.update((boards) => boards.map((item) => (item.id === persisted.id ? persisted : item)));
      this.boardsSyncError.set(null);
    } catch (error) {
      console.error('Board Firebase sync failed', error, { boardId: board.id });
      this.boardsSyncError.set($localize`Saved on this browser, but Firebase sync failed.`);
    }
  }

  private async persistBoard(board: Board): Promise<Board> {
    const uid = this.authService.uid();
    if (!this.firestore || !uid) {
      return board;
    }
    if (board.ownerUserId !== uid) {
      throw new Error('Only the board owner can save changes.');
    }

    const boardWithOwner = { ...board, ...this.currentOwnerSnapshot() };
    const storageOwnerId = boardWithOwner.ownerUserId || uid;
    const resolvedOwnerPublicSlug = await this.resolveOwnerPublicSlug(boardWithOwner, storageOwnerId);
    const prepared = await this.prepareBoardImagesForFirebase({ ...boardWithOwner, ownerPublicSlug: resolvedOwnerPublicSlug }, storageOwnerId);
    const record: BoardRecord & { server_updated_at: unknown } = {
      ...prepared,
      owner_user_id: prepared.ownerUserId || uid,
      owner_public_slug: prepared.ownerPublicSlug,
      owner_display_name: prepared.ownerDisplayName,
      owner_photo_url: prepared.ownerPhotoUrl,
      owner_profile_icon: prepared.ownerProfileIcon,
      owner_profile_picture_type: prepared.ownerProfilePictureType,
      visibility: prepared.visibility,
      created_at_iso: prepared.createdAt,
      updated_at_iso: prepared.updatedAt,
      server_updated_at: serverTimestamp(),
    };
    const {
      createdAt,
      updatedAt,
      ownerUserId,
      ownerPublicSlug: _ownerPublicSlug,
      ownerDisplayName,
      ownerPhotoUrl,
      ownerProfileIcon,
      ownerProfilePictureType,
      ...persistable
    } = record as BoardRecord & {
      createdAt?: string;
      updatedAt?: string;
      ownerUserId?: string;
      ownerPublicSlug?: string;
      ownerDisplayName?: string;
      ownerPhotoUrl?: string;
      ownerProfileIcon?: string;
      ownerProfilePictureType?: 'icon' | 'image' | null;
      server_updated_at: unknown;
    };
    await setDoc(doc(this.firestore, 'boards', prepared.id), omitUndefinedDeep(persistable));
    return prepared;
  }

  private currentOwnerSnapshot(): Pick<
    Board,
    'ownerUserId' | 'ownerPublicSlug' | 'ownerDisplayName' | 'ownerPhotoUrl' | 'ownerProfileIcon' | 'ownerProfilePictureType'
  > {
    const profile = this.profile();
    const photoUrl = profile?.profilePictureType === 'image' ? profile.photoURL ?? '' : '';
    return {
      ownerUserId: this.authService.uid(),
      ownerPublicSlug: this.currentPublicOwnerKey(),
      ownerDisplayName: this.userName(),
      ownerPhotoUrl: photoUrl,
      ownerProfileIcon: profile?.profilePictureType === 'icon' ? profile.profileIcon ?? '' : '',
      ownerProfilePictureType: profile?.profilePictureType ?? null,
    };
  }

  private canStoreBoardLocally(board: Board): boolean {
    const uid = this.authService.uid();
    return !board.ownerUserId || (!!uid && board.ownerUserId === uid);
  }

  private boardNeedsOwnerSnapshot(board: Board): boolean {
    return this.canEditBoard(board) && (!board.ownerDisplayName.trim() || !board.ownerPublicSlug.trim());
  }

  private boardMatchesPublicOwnerSlug(board: Board, slug: string): boolean {
    if (board.ownerPublicSlug === slug) {
      return true;
    }
    return !board.ownerPublicSlug && this.publicHandleFromText(board.ownerDisplayName) === slug;
  }

  private async resolveOwnerPublicSlug(board: Board, ownerUid: string): Promise<string> {
    const base = this.publicHandleFromText(board.ownerDisplayName || this.userName() || this.userEmail() || 'livingwiki-user');
    const uidSuffix = ownerUid.toLowerCase().replace(/[^a-z0-9]/g, '');
    const existing = board.ownerPublicSlug.trim() ? this.publicHandleFromText(board.ownerPublicSlug) : '';
    const candidates = Array.from(new Set([
      existing,
      base,
      uidSuffix ? `${base}-${uidSuffix.slice(0, 2)}` : '',
      uidSuffix ? `${base}-${uidSuffix.slice(0, 4)}` : '',
      uidSuffix ? `${base}-${uidSuffix.slice(0, 6)}` : '',
    ].filter(Boolean)));

    for (const candidate of candidates) {
      if (await this.canUseOwnerPublicSlug(candidate, ownerUid, board.id)) {
        return candidate;
      }
    }

    return `${base}-${uidSuffix.slice(0, 10) || board.id.slice(0, 6).toLowerCase()}`;
  }

  private async canUseOwnerPublicSlug(slug: string, ownerUid: string, boardId: string): Promise<boolean> {
    if (!this.firestore) {
      return true;
    }

    try {
      const snapshot = await getDocs(
        query(
          collection(this.firestore, 'boards'),
          where('owner_public_slug', '==', slug),
          where('visibility', '==', 'public'),
        ),
      );
      return snapshot.docs.every((boardDoc) => {
        if (boardDoc.id === boardId) {
          return true;
        }
        const data = boardDoc.data();
        return data['owner_user_id'] === ownerUid;
      });
    } catch {
      const publicBoards = await this.loadPublicBoards().catch(() => []);
      return publicBoards.every((item) =>
        item.ownerPublicSlug !== slug || item.ownerUserId === ownerUid || item.id === boardId,
      );
    }
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
      this.boardsSyncError.set($localize`Removed locally, but Firebase delete failed.`);
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
      kind: this.isBoardKind(data['kind']) ? data['kind'] : 'standard',
      sortOrder: this.normalizeBoardSortOrder(data['sortOrder'], typeof data['created_at_iso'] === 'string' ? data['created_at_iso'] : ''),
      ownerUserId: typeof data['owner_user_id'] === 'string' ? data['owner_user_id'] : '',
      ownerPublicSlug: typeof data['owner_public_slug'] === 'string' ? data['owner_public_slug'] : '',
      ownerDisplayName: typeof data['owner_display_name'] === 'string' ? data['owner_display_name'] : '',
      ownerPhotoUrl: typeof data['owner_photo_url'] === 'string' ? data['owner_photo_url'] : '',
      ownerProfileIcon: typeof data['owner_profile_icon'] === 'string' ? data['owner_profile_icon'] : '',
      ownerProfilePictureType: this.isProfilePictureType(data['owner_profile_picture_type'])
        ? data['owner_profile_picture_type']
        : null,
      forkedFromBoardId: typeof data['forkedFromBoardId'] === 'string' ? data['forkedFromBoardId'] : '',
      forkedFromTitle: typeof data['forkedFromTitle'] === 'string' ? data['forkedFromTitle'] : '',
      forkedFromOwnerUserId: typeof data['forkedFromOwnerUserId'] === 'string' ? data['forkedFromOwnerUserId'] : '',
      forkedFromOwnerName: typeof data['forkedFromOwnerName'] === 'string' ? data['forkedFromOwnerName'] : '',
      visibility: this.isBoardVisibility(data['visibility']) ? data['visibility'] : 'public',
      title,
      description: typeof data['description'] === 'string' ? data['description'] : '',
      backNote: typeof data['backNote'] === 'string' ? data['backNote'] : '',
      icon: typeof data['icon'] === 'string' ? data['icon'] : 'dashboard',
      tone: this.isBoardTone(data['tone']) ? data['tone'] : 'teal',
      imageUrl: typeof data['imageUrl'] === 'string' ? data['imageUrl'] : '',
      logoUrl: typeof data['logoUrl'] === 'string' ? data['logoUrl'] : '',
      logoLinkUrl: typeof data['logoLinkUrl'] === 'string' ? data['logoLinkUrl'] : '',
      stackCtaLabel: typeof data['stackCtaLabel'] === 'string' ? data['stackCtaLabel'] : '',
      stackCtaUrl: typeof data['stackCtaUrl'] === 'string' ? data['stackCtaUrl'] : '',
      socialVideoUrl: typeof data['socialVideoUrl'] === 'string' ? data['socialVideoUrl'] : '',
      socialVideoMimeType: typeof data['socialVideoMimeType'] === 'string' ? data['socialVideoMimeType'] : '',
      socialVideoUpdatedAt: typeof data['socialVideoUpdatedAt'] === 'string' ? data['socialVideoUpdatedAt'] : '',
      socialVideoRenderVersion: typeof data['socialVideoRenderVersion'] === 'string' ? data['socialVideoRenderVersion'] : '',
      socialVideoRatio: this.isStackRatio(data['socialVideoRatio']) ? data['socialVideoRatio'] : 'vertical',
      socialVideoAudioTrackId: normalizeStackAudioTrackId(data['socialVideoAudioTrackId']),
      socialVideoAudioVolume: normalizeStackAudioVolume(data['socialVideoAudioVolume']),
      stickers: this.normalizeStickers(data['stickers']),
      tourMeta: this.normalizeTourMeta(data['tourMeta']),
      learningQuiz: normalizeBoardLearningQuiz(data['learningQuiz']),
      cards: rawCards.map((card) => this.cardFromRecord(card)).filter((card): card is BoardCard => !!card),
      createdAt: typeof data['created_at_iso'] === 'string' ? data['created_at_iso'] : new Date().toISOString(),
      updatedAt: typeof data['updated_at_iso'] === 'string' ? data['updated_at_iso'] : new Date().toISOString(),
    };
  }

  private cardFromRecord(value: unknown, includeRelatedCards = true): BoardCard | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const data = value as Record<string, unknown>;
    const title = typeof data['title'] === 'string' ? data['title'] : '';
    if (!title) {
      return null;
    }
    const subtitle = typeof data['subtitle'] === 'string' ? data['subtitle'] : '';
    const notes = typeof data['notes'] === 'string' ? data['notes'] : '';
    const sourceUrl = typeof data['sourceUrl'] === 'string' ? data['sourceUrl'] : '';
    const what3wordsAddress = what3WordsAddressFromCard({
      what3wordsAddress: data['what3wordsAddress'],
      title,
      subtitle,
      notes,
      sourceUrl,
    });
    return {
      id: typeof data['id'] === 'string' ? data['id'] : this.createId(),
      title,
      subtitle,
      notes,
      type: this.isBoardCardType(data['type']) ? data['type'] : 'place',
      scope: this.isBoardCardScope(data['scope']) ? data['scope'] : this.inferLegacyCardScope(data),
      status: this.isBoardCardStatus(data['status']) ? data['status'] : 'saved',
      rating: typeof data['rating'] === 'number' ? Math.max(1, Math.min(5, data['rating'])) : 4,
      entityName: typeof data['entityName'] === 'string' ? data['entityName'] : title,
      entityType: this.isBoardEntityType(data['entityType']) ? data['entityType'] : (this.isBoardCardType(data['type']) && (data['type'] === 'place' || data['type'] === 'shop') ? 'place' : 'other'),
      imageIntent: this.isBoardImageIntent(data['imageIntent']) ? data['imageIntent'] : 'other',
      imageContext: typeof data['imageContext'] === 'string' ? data['imageContext'] : '',
      mediaKind: this.isBoardMediaKind(data['mediaKind']) ? data['mediaKind'] : 'none',
      shortSummary: typeof data['shortSummary'] === 'string' ? data['shortSummary'] : (typeof data['subtitle'] === 'string' ? data['subtitle'] : ''),
      rank: typeof data['rank'] === 'number' ? Math.max(0, Math.min(100, Math.trunc(data['rank']))) : this.rankFromTags(data['tags']),
      imageUrl: typeof data['imageUrl'] === 'string' ? data['imageUrl'] : '',
      imageUrls: this.uniqueImageUrls([
        typeof data['imageUrl'] === 'string' ? data['imageUrl'] : '',
        ...(Array.isArray(data['imageUrls']) ? data['imageUrls'].filter((url): url is string => typeof url === 'string') : []),
      ]).slice(0, 12),
      audioPreviewUrl: typeof data['audioPreviewUrl'] === 'string' ? data['audioPreviewUrl'] : '',
      spotifyTrackId: typeof data['spotifyTrackId'] === 'string' ? data['spotifyTrackId'] : '',
      spotifyTrackUrl: typeof data['spotifyTrackUrl'] === 'string' ? data['spotifyTrackUrl'] : '',
      spotifyUri: typeof data['spotifyUri'] === 'string' ? data['spotifyUri'] : '',
      spotifyArtistName: typeof data['spotifyArtistName'] === 'string' ? data['spotifyArtistName'] : '',
      spotifyAlbumName: typeof data['spotifyAlbumName'] === 'string' ? data['spotifyAlbumName'] : '',
      spotifyArtworkUrl: typeof data['spotifyArtworkUrl'] === 'string' ? data['spotifyArtworkUrl'] : '',
      placeId: typeof data['placeId'] === 'string' ? data['placeId'] : '',
      googleMapsUrl: typeof data['googleMapsUrl'] === 'string' ? data['googleMapsUrl'] : '',
      locationLat: this.optionalCoordinate(data['locationLat'], -90, 90),
      locationLng: this.optionalCoordinate(data['locationLng'], -180, 180),
      sourceUrl,
      productUrl: typeof data['productUrl'] === 'string' ? data['productUrl'] : '',
      merchant: typeof data['merchant'] === 'string' ? data['merchant'] : '',
      price: typeof data['price'] === 'string' ? data['price'] : '',
      currency: typeof data['currency'] === 'string' ? data['currency'] : '',
      sku: typeof data['sku'] === 'string' ? data['sku'] : '',
      availability: typeof data['availability'] === 'string' ? data['availability'] : '',
      productCategory: typeof data['productCategory'] === 'string' ? data['productCategory'] : '',
      imageSource: this.isCommerceImageSource(data['imageSource']) ? data['imageSource'] : undefined,
      extractionConfidence: typeof data['extractionConfidence'] === 'number'
        ? Math.max(0, Math.min(1, data['extractionConfidence']))
        : 0,
      extractedAt: typeof data['extractedAt'] === 'string' ? data['extractedAt'] : '',
      what3wordsAddress,
      tags: Array.isArray(data['tags']) ? data['tags'].filter((tag): tag is string => typeof tag === 'string').slice(0, 6) : [],
      stickers: this.normalizeStickers(data['stickers']),
      tour: this.normalizeCardTour(data['tour']),
      relatedCards: includeRelatedCards && Array.isArray(data['relatedCards'])
        ? data['relatedCards']
          .map((card) => this.cardFromRecord(card, false))
          .filter((card): card is BoardCard => !!card)
          .slice(0, 100)
        : [],
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
    const board = this.boards().find((item) => item.id === boardId);
    if (!this.canEditBoard(board)) {
      return;
    }
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
    const board = this.boards().find((item) => item.id === boardId);
    if (!this.canEditBoard(board)) {
      return;
    }
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
    if (board && this.canEditBoard(board)) {
      void this.persistAndReplaceBoard({ ...board, updatedAt: new Date().toISOString() });
    }
    setTimeout(() => {
      this.suppressNextBoardOpen = false;
    });
  };

  private updateStickerPosition(state: StickerDragState, x: number, y: number): void {
    const targetBoard = this.boards().find((board) => board.id === state.boardId);
    if (!this.canEditBoard(targetBoard)) {
      return;
    }
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
    const logoUrl = await this.persistImageIfNeeded(board.logoUrl, `users/${uid}/boards/${board.id}/logo.jpg`);
    const cards = await Promise.all(
      board.cards.map((card) => this.prepareBoardCardImagesForFirebase(card, uid, board.id)),
    );
    return { ...board, imageUrl, logoUrl, cards };
  }

  private async prepareBoardCardImagesForFirebase(
    card: BoardCard,
    uid: string,
    boardId: string,
    parentId = '',
  ): Promise<BoardCard> {
    const cardPath = parentId
      ? `users/${uid}/boards/${boardId}/cards/${parentId}/related/${card.id}`
      : `users/${uid}/boards/${boardId}/cards/${card.id}`;
    const sourceImages = this.cardImages(card);
    const imageUrls = await Promise.all(
      sourceImages.map((url, index) => this.persistImageIfNeeded(url, `${cardPath}/${index}.jpg`)),
    );
    const relatedCards = parentId
      ? []
      : await Promise.all(
          this.explicitRelatedCards(card).map((related) =>
            this.prepareBoardCardImagesForFirebase(related, uid, boardId, card.id)),
        );
    return {
      ...card,
      imageUrl: imageUrls[0] ?? '',
      imageUrls,
      relatedCards,
    };
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

  private isBoardKind(value: unknown): value is BoardKind {
    return value === 'standard' || value === 'off-grid' || value === 'walking-tour' || value === 'driving-tour';
  }

  private isBoardVisibility(value: unknown): value is BoardVisibility {
    return value === 'public' || value === 'private';
  }

  private isCommerceImageSource(
    value: unknown,
  ): value is 'source-page' | 'product-page' | 'search' | 'generated' | 'missing' {
    return value === 'source-page'
      || value === 'product-page'
      || value === 'search'
      || value === 'generated'
      || value === 'missing';
  }

  private isStackRatio(value: unknown): value is StackRatio {
    return value === 'vertical' || value === 'square' || value === 'landscape';
  }

  private isPermissionDeniedError(error: unknown): boolean {
    return error instanceof FirebaseError && error.code === 'permission-denied';
  }

  private wizardGeneratedBoardKind(): BoardKind {
    const mode = this.wizardMode();
    return mode === 'off-grid' || mode === 'walking-tour' || mode === 'driving-tour' ? mode : 'standard';
  }

  private isBoardCardType(value: unknown): value is BoardCardType {
    return typeof value === 'string' && this.cardTypes.some((type) => type.id === value);
  }

  private isBoardCardScope(value: unknown): value is BoardCardScope {
    return typeof value === 'string' && this.cardScopes.some((scope) => scope.id === value);
  }

  private isBoardCardStatus(value: unknown): value is BoardCardStatus {
    return typeof value === 'string' && this.cardStatuses.some((status) => status.id === value);
  }

  private isBoardEntityType(value: unknown): value is BoardEntityType {
    return value === 'person' || value === 'place' || value === 'event' || value === 'work'
      || value === 'product' || value === 'food' || value === 'organization' || value === 'other';
  }

  private isBoardImageIntent(value: unknown): value is BoardImageIntent {
    return value === 'portrait' || value === 'place' || value === 'event' || value === 'cover'
      || value === 'product' || value === 'food' || value === 'logo' || value === 'other';
  }

  private isBoardMediaKind(value: unknown): value is BoardMediaKind {
    return value === 'none' || value === 'song' || value === 'album' || value === 'film'
      || value === 'book' || value === 'tv' || value === 'game';
  }

  private rankFromTags(value: unknown): number {
    if (!Array.isArray(value)) return 0;
    for (const tag of value) {
      const match = typeof tag === 'string' ? tag.match(/^rank-(\d{1,3})$/i) : null;
      if (match?.[1]) return Math.max(0, Math.min(100, Number.parseInt(match[1], 10)));
    }
    return 0;
  }

  private isProfilePictureType(value: unknown): value is 'icon' | 'image' {
    return value === 'icon' || value === 'image';
  }

  private toneMeta(tone: BoardTone): { id: BoardTone; label: string; accent: string; soft: string } {
    return this.tones.find((item) => item.id === tone) ?? this.tones[0];
  }

  private compareBoards(left: Board, right: Board): number {
    return (
      this.boardSortOrder(left) - this.boardSortOrder(right) ||
      this.compareDatesDesc(left.createdAt, right.createdAt) ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id)
    );
  }

  private nextBoardSortOrder(): number {
    const orders = this.boards().map((board) => this.boardSortOrder(board)).filter((order) => Number.isFinite(order));
    return orders.length ? Math.min(...orders) - 1 : 0;
  }

  private boardSortOrder(board: Pick<Board, 'sortOrder' | 'createdAt'>): number {
    return this.normalizeBoardSortOrder(board.sortOrder, board.createdAt);
  }

  private normalizeBoardSortOrder(value: unknown, createdAt: string | undefined): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const createdTime = createdAt ? Date.parse(createdAt) : NaN;
    return Number.isFinite(createdTime) ? -createdTime : 0;
  }

  private compareCards(left: BoardCard, right: BoardCard): number {
    return (
      this.compareDatesDesc(left.createdAt, right.createdAt) ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id)
    );
  }

  private compareDatesDesc(left: string, right: string): number {
    return this.dateValue(right) - this.dateValue(left);
  }

  private dateValue(value: string): number {
    const time = Date.parse(value);
    return Number.isNaN(time) ? 0 : time;
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Recently';
    }
    return new Intl.DateTimeFormat(this.localeId, {
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
          : $localize`Searching places and looking for a photo.`,
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
        ? $localize`Place details and photo are ready.`
        : results.length
          ? $localize`Place details are ready. No photo was returned for these matches.`
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
      this.placeSearchError.set($localize`Place search is unavailable right now. You can still type the card manually.`);
    } else {
      this.placeSearchError.set($localize`No matching places found.`);
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

  private findExactCityOption(value: string): BoardCityOption | null {
    const query = value.trim().toLowerCase();
    if (query.length < 2) {
      return null;
    }
    return this.publicCities().find((city) => this.isExactCityInput(query, city)) ?? null;
  }

  private findCountryOption(value: string): string | null {
    const query = value.trim().toLowerCase();
    if (query.length < 2) {
      return null;
    }
    return COUNTRY_OPTIONS.find((country) =>
      [country.name, ...(country.aliases ?? [])].some((name) => name.toLowerCase() === query),
    )?.name ?? null;
  }

  private countrySearchText(country: { name: string; aliases?: string[] }): string {
    return [country.name, ...(country.aliases ?? [])].join(' ').toLowerCase();
  }

  private countryStartsWith(country: { name: string; aliases?: string[] }, query: string): boolean {
    return [country.name, ...(country.aliases ?? [])].some((name) =>
      name.toLowerCase().startsWith(query),
    );
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
      lat: typeof place.lat === 'number' ? place.lat : null,
      lng: typeof place.lng === 'number' ? place.lng : null,
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
    this.placeSearchHint.set($localize`Place details and image are ready.`);
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

  private inferCardScope(place: PlaceSearchResult): BoardCardScope {
    const types = new Set(place.types);
    if (types.has('country')) {
      return 'country';
    }
    if (types.has('locality') || types.has('postal_town')) {
      return 'city';
    }
    if (
      types.has('administrative_area_level_1') ||
      types.has('administrative_area_level_2') ||
      types.has('natural_feature')
    ) {
      return 'region';
    }
    return 'place';
  }

  private inferLegacyCardScope(data: Record<string, unknown>): BoardCardScope {
    const tags = Array.isArray(data['tags'])
      ? data['tags'].filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.toLowerCase())
      : [];
    if (tags.includes('country')) {
      return 'country';
    }
    if (tags.includes('city')) {
      return 'city';
    }
    return 'place';
  }

  private placeTags(place: PlaceSearchResult): string[] {
    return place.types
      .map((type) => type.replaceAll('_', ' '))
      .filter((type) => !['point of interest', 'establishment'].includes(type))
      .slice(0, 4);
  }

  private mergeTagText(current: string, tags: string[]): string {
    const merged = new Set(
      current
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    );
    for (const tag of tags) {
      merged.add(tag);
    }
    return [...merged].slice(0, 6).join(', ');
  }

  private wizardPhotoSourceKey(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  private photoTitleFromFileName(fileName: string): string {
    const cleaned = fileName
      .replace(/\.(?:jpe?g|png|webp|gif|avif|heic|heif|bmp)$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || /^(?:img|dsc|dcim|photo|image)\s*\d+$/i.test(cleaned)) {
      return 'Photo memory';
    }
    return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 80);
  }

  private async readWizardPhoto(file: File): Promise<BoardWizardPhoto> {
    if (!this.isBrowser) {
      throw new Error('Photo uploads are available in the browser.');
    }
    if (!this.isSupportedWizardPhoto(file)) {
      throw new Error('Choose a JPEG, PNG, WebP, GIF, AVIF, HEIC, or HEIF photo.');
    }
    if (file.size > 25 * 1024 * 1024) {
      throw new Error('Photos must be 25 MB or smaller.');
    }

    let photoBlob: Blob = file;
    if (this.isHeicPhoto(file)) {
      try {
        const { default: convertHeic } = await import('heic2any');
        const converted = await convertHeic({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.9,
        });
        photoBlob = Array.isArray(converted) ? converted[0] : converted;
      } catch {
        throw new Error('This HEIC photo could not be converted. Try exporting it as JPEG.');
      }
    }

    const sourceDataUrl = await this.readBlobAsDataUrl(photoBlob);
    const imageUrl = await this.resizeImageDataUrl(sourceDataUrl, 1400, 0.84);
    const analysisDataUrl = await this.resizeImageDataUrl(imageUrl, 720, 0.72);
    return {
      id: this.createId(),
      sourceKey: this.wizardPhotoSourceKey(file),
      name: file.name,
      caption: '',
      imageUrl,
      analysisDataUrl,
    };
  }

  private isSupportedWizardPhoto(file: File): boolean {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif', 'bmp'].includes(extension)
      || /^image\/(?:jpeg|png|webp|gif|avif|heic|heif|bmp)$/i.test(file.type);
  }

  private isHeicPhoto(file: File): boolean {
    return /\.(?:heic|heif)$/i.test(file.name) || /^image\/hei[cf]$/i.test(file.type);
  }

  private readBlobAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Could not read that image.'));
        }
      };
      reader.onerror = () => reject(new Error('Could not read that image.'));
      reader.readAsDataURL(blob);
    });
  }

  private async readImageFile(file: File): Promise<string> {
    if (!this.isBrowser) {
      throw new Error('Image uploads are available in the browser.');
    }
    if (!file.type.startsWith('image/')) {
      throw new Error('Choose an image file.');
    }

    const dataUrl = await this.readBlobAsDataUrl(file);
    return this.resizeImageDataUrl(dataUrl);
  }

  private resizeImageDataUrl(dataUrl: string, maxSide = 1400, quality = 0.84): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) {
          resolve(dataUrl);
          return;
        }

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
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.onerror = () => reject(new Error('Could not load that image.'));
      image.src = dataUrl;
    });
  }
}
