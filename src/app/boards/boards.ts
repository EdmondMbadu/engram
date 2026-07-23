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
import { BOARD_WIZARD_PASTE_MAX_LENGTH, parseNumberedBoardSource } from './board-wizard-source';
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
import { generateStackVideo, type StackVideoResult } from './stack-video-export';

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
type BoardTourMode = 'walking' | 'driving';
type BoardTourVoiceStyle = 'historian' | 'local' | 'kid-friendly';
type StackFormat = 'carousel' | 'reel' | 'both';
type StackRatio = 'vertical' | 'square' | 'landscape';
type StackExportTarget = 'whatsapp' | 'facebook' | 'instagram' | 'tiktok' | 'x' | 'download';
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
  what3wordsAddress?: string;
  tags: string[];
  stickers: BoardSticker[];
  tour: BoardCardTour | null;
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
  socialVideoRatio: StackRatio;
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
  what3wordsAddress?: string;
  tour?: BoardCardTour | null;
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
    description: $localize`Start from image filenames and captions for a memory board.`,
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
  styleUrls: ['./boards.css', './card-image-tools.css', './wizard-card-editor.css', './board-live-entry.css', './board-learning.css'],
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
  private tourMapPolyline: unknown | null = null;
  private tourAudio: HTMLAudioElement | null = null;
  private tourSpeechUtterance: SpeechSynthesisUtterance | null = null;
  private songPreviewAudio: HTMLAudioElement | null = null;
  private readonly spotifyEnrichedBoardIds = new Set<string>();
  private readonly spotifyEnrichmentInFlightBoardIds = new Set<string>();
  private readonly spotifyEmbedUrls = new Map<string, SafeResourceUrl>();
  private stackLivePreviewAutoplay = false;
  private stackLivePreviewSwitchToken = 0;
  private stackTourNarrationSwitchToken = 0;
  private wizardOffGridLocationRun = 0;
  private boardLearnStartedAt = 0;
  private boardLearnElapsedMs = 0;
  private boardLearnDirectRequested = false;
  private boardLearnDirectOpenedFor = '';
  private selectedBoardUnsubscribe: Unsubscribe | null = null;
  private readonly tourAudioUrls = new Map<string, string>();
  private readonly tourAudioPromises = new Map<string, Promise<string | null>>();
  private readonly publishedStackVideoFiles = new Map<string, File>();
  private friendsLoadedForUid = '';

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
  readonly expandedCardIds = signal<Set<string>>(new Set());
  readonly activeGalleryTab = signal<BoardGalleryTab>('boards');
  readonly boardSearch = signal('');
  readonly cardSearch = signal('');
  readonly boardDialogOpen = signal(false);
  readonly cardDialogOpen = signal(false);
  readonly boardDeleteCandidate = signal<Board | null>(null);
  readonly draggedBoardId = signal<string | null>(null);
  readonly boardDropTargetId = signal<string | null>(null);
  readonly cardDeleteCandidate = signal<CardDeleteCandidate | null>(null);
  readonly cardBulkDeleteCandidate = signal<CardBulkDeleteCandidate | null>(null);
  readonly cardManageBoardId = signal<string | null>(null);
  readonly selectedCardIds = signal<Set<string>>(new Set());
  readonly draggedCardId = signal<string | null>(null);
  readonly cardDropTargetId = signal<string | null>(null);
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
  readonly wizardDetectedPasteCount = computed(() => this.wizardNumberedSource()?.items.length ?? 0);
  readonly wizardUrl = signal('');
  readonly wizardPhotoNames = signal('');
  readonly wizardOffGridName = signal('');
  readonly wizardOffGridAddress = signal('');
  readonly wizardOffGridTip = signal('');
  readonly wizardOffGridSource = signal<OffGridLocationSource>('spot');
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

  readonly selectedBoard = computed(() => {
    const selectedId = this.selectedBoardId();
    return this.boards().find((board) => board.id === selectedId) ?? null;
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
    return this.selectedBoard()?.cards.find((card) => card.id === cardId) ?? null;
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
    const cards = [...board.cards];
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
      frames.push({ kind: 'stop', card, nextCard: null, index: 0, total: 0 });
      if (card.tour?.legToNext) {
        frames.push({ kind: 'leg', card, nextCard: this.nextTourCard(card, cards), index: 0, total: 0 });
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
      return this.wizardOffGridName().trim().length >= 2
        && !!this.wizardOffGridResolvedLocation()
        && (this.wizardOffGridSource() === 'words' || !!this.wizardOffGridPhoto());
    }
    if (this.isTourWizardMode(mode)) {
      return this.wizardPrompt().trim().length >= 4;
    }
    return this.wizardPhotoNamesList().length > 0 || this.wizardPrompt().trim().length >= 4;
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
      this.selectedBoardId.set(boardId);
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
        .map((card) => `${card.id}:${card.tour?.sequence}:${card.tour?.lat}:${card.tour?.lng}:${card.title}`)
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
  }

  ngOnDestroy(): void {
    this.wizardOffGridLocationRun += 1;
    this.selectedBoardUnsubscribe?.();
    this.selectedBoardUnsubscribe = null;
    this.stopSongPreview();
    this.stopTourSpeech();
    this.stopStackPlayback();
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

  private keepScrollPosition(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
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
    const detectedCount = parseNumberedBoardSource(pastedText)?.items.length ?? 0;
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
    return this.wizardPhotoNames()
      .split(/\n|,|;/)
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, 100);
  }

  onWizardPhotosSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) {
      return;
    }
    const names = files.map((file) => file.name).filter(Boolean);
    this.wizardPhotoNames.set([...this.wizardPhotoNamesList(), ...names].slice(0, 100).join('\n'));
  }

  setWizardOffGridSource(source: OffGridLocationSource): void {
    if (source === this.wizardOffGridSource()) {
      return;
    }
    this.wizardOffGridLocationRun += 1;
    this.wizardOffGridSource.set(source);
    this.wizardOffGridAddress.set('');
    this.wizardOffGridResolvedLocation.set(null);
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
    const words = normalizeWhat3WordsAddress(this.wizardOffGridAddress());
    if (!words) {
      this.wizardOffGridResolvedLocation.set(null);
      this.wizardOffGridError.set($localize`Use exactly three words separated by periods.`);
      return;
    }
    const run = ++this.wizardOffGridLocationRun;
    this.wizardOffGridVerifying.set(true);
    this.wizardOffGridResolvedLocation.set(null);
    this.wizardOffGridError.set(null);
    this.wizardOffGridStatus.set($localize`Checking this square with what3words…`);
    try {
      const location = await resolveWhat3WordsAddress(words);
      if (run !== this.wizardOffGridLocationRun) {
        return;
      }
      this.wizardOffGridAddress.set(location.words);
      this.wizardOffGridResolvedLocation.set(location);
      this.wizardOffGridStatus.set(
        location.nearestPlace
          ? `Verified real square near ${location.nearestPlace}`
          : $localize`Verified real square`,
      );
    } catch (error) {
      if (run !== this.wizardOffGridLocationRun) {
        return;
      }
      this.wizardOffGridError.set(error instanceof Error ? error.message : $localize`This square could not be verified.`);
      this.wizardOffGridStatus.set('');
    } finally {
      if (run === this.wizardOffGridLocationRun) {
        this.wizardOffGridVerifying.set(false);
      }
    }
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
    if (this.wizardMode() === 'off-grid') {
      const batch = this.buildOffGridWizardBatch();
      const previewCards = await this.enrichWizardCards(batch.cards);
      this.wizardResult.set({ ...batch, cards: previewCards });
      this.wizardPreviewCards.set(previewCards);
      this.wizardSelectedCardIds.set(new Set(previewCards.map((card) => card.id)));
      this.wizardStep.set('preview');
      return;
    }
    const inferredCount = this.inferWizardRequestedCount();
    if (inferredCount) {
      this.setWizardCount(inferredCount);
    }
    this.wizardStep.set('loading');
    this.wizardLoadingIndex.set(0);
    const loadingMessages = this.isTourWizardMode() ? BOARD_TOUR_STATUS_MESSAGES : BOARD_WIZARD_STATUS_MESSAGES;
    const interval = this.isBrowser
      ? window.setInterval(() => {
          this.wizardLoadingIndex.update((index) => (index + 1) % loadingMessages.length);
        }, 900)
      : null;

    try {
      const batch = await this.requestWizardBatch(refinement);
      const previewCards = await this.enrichWizardCards(batch.cards);
      this.wizardResult.set({ ...batch, cards: previewCards });
      this.wizardPreviewCards.set(previewCards);
      this.wizardSelectedCardIds.set(new Set(previewCards.map((card) => card.id)));
      this.wizardStep.set('preview');
    } catch (error) {
      if (this.isTourWizardMode()) {
        this.wizardError.set(error instanceof Error ? error.message : $localize`The tour could not be generated. Please try again.`);
        this.wizardStep.set('choose');
        return;
      }
      const fallback = this.buildLocalWizardBatch(refinement);
      const previewCards = await this.enrichWizardCards(fallback.cards);
      this.wizardResult.set({ ...fallback, cards: previewCards });
      this.wizardPreviewCards.set(previewCards);
      this.wizardSelectedCardIds.set(new Set(previewCards.map((card) => card.id)));
      this.wizardError.set(error instanceof Error ? `${error.message} Using a local draft instead.` : $localize`Using a local draft because AI generation failed.`);
      this.wizardStep.set('preview');
    } finally {
      if (interval) {
        window.clearInterval(interval);
      }
    }
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
      const [replacement] = await this.enrichWizardCards(batch.cards.slice(0, 1));
      if (replacement) {
        this.wizardPreviewCards.update((cards) => cards.map((item) => item.id === cardId ? { ...replacement, id: cardId } : item));
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
      const callable = httpsCallable<Record<string, unknown>, unknown>(this.functions, 'generateBoardWizardBatch', {
        timeout: 75_000,
      });
      const response = await callable({
        mode: this.wizardMode(),
        prompt: [
          this.wizardPrompt().trim(),
          `Find the most accurate image for this exact card only: ${card.title}. Preserve the title, text, and metadata.`,
        ].filter(Boolean).join('\n'),
        pastedList: '',
        url: '',
        photoNames: [],
        imageOnly: true,
        currentCard: this.wizardCardToCurrentCard(card),
        targetBoardId: this.wizardTargetBoardId() === 'new' ? '' : this.wizardTargetBoardId(),
        targetBoardTitle: this.wizardTargetBoardTitle(),
        defaultType: card.type,
        count: 1,
        vibe: this.wizardVibe(),
      });
      const batch = this.normalizeWizardBatch(response.data);
      const replacement = batch.cards[0];
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
      what3wordsAddress: normalizeWhat3WordsAddress(card.what3wordsAddress),
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

  closeCardDialog(): void {
    this.cardDialogOpen.set(false);
    this.editingCardId.set(null);
    this.cardImageLocked.set(false);
    this.resetCardWizard();
    this.clearPlaceSearch();
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

  confirmDeleteCard(event?: Event): void {
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
  }

  closeCardManageMode(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.cardManageBoardId.set(null);
    this.selectedCardIds.set(new Set());
    this.cardBulkDeleteCandidate.set(null);
    this.draggedCardId.set(null);
    this.cardDropTargetId.set(null);
  }

  isCardSelected(cardId: string): boolean {
    return this.selectedCardIds().has(cardId);
  }

  isCardExpanded(cardId: string): boolean {
    return this.expandedCardIds().has(cardId);
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

  isDraggingBoard(boardId: string): boolean {
    return this.draggedBoardId() === boardId;
  }

  isBoardDropTarget(boardId: string): boolean {
    return this.boardDropTargetId() === boardId && this.draggedBoardId() !== boardId;
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
    if (!this.canEditBoard(board) || board.cards.length < 2) {
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
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.id);
    }
  }

  dragCardOver(event: DragEvent, board: Board, card: BoardCard): void {
    if (!this.canEditBoard(board) || !this.draggedCardId()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.cardDropTargetId.set(card.id);
  }

  dragCardLeave(card: BoardCard): void {
    if (this.cardDropTargetId() === card.id) {
      this.cardDropTargetId.set(null);
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

    const draggedIndex = currentBoard.cards.findIndex((card) => card.id === draggedId);
    const targetIndex = currentBoard.cards.findIndex((card) => card.id === targetCard.id);
    if (draggedIndex < 0 || targetIndex < 0) {
      this.clearCardReorderDrag();
      return;
    }

    const nextCards = [...currentBoard.cards];
    [nextCards[draggedIndex], nextCards[targetIndex]] = [nextCards[targetIndex], nextCards[draggedIndex]];
    const now = new Date().toISOString();
    const nextBoard: Board = { ...currentBoard, cards: nextCards, updatedAt: now };

    this.boards.update((boards) => boards.map((item) => item.id === nextBoard.id ? nextBoard : item));
    this.clearCardReorderDrag();
    await this.persistAndReplaceBoard(nextBoard);
  }

  clearCardReorderDrag(): void {
    this.draggedCardId.set(null);
    this.cardDropTargetId.set(null);
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
  }

  dragBoardLeave(board: Board): void {
    if (this.boardDropTargetId() === board.id) {
      this.boardDropTargetId.set(null);
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

    const draggedBoard = this.boards().find((board) => board.id === draggedId);
    const currentTargetBoard = this.boards().find((board) => board.id === targetBoard.id);
    if (!draggedBoard || !currentTargetBoard || !this.canEditBoard(draggedBoard)) {
      this.clearBoardReorderDrag();
      return;
    }

    const draggedOrder = this.boardSortOrder(draggedBoard);
    const targetOrder = this.boardSortOrder(currentTargetBoard);
    const nextDraggedBoard = { ...draggedBoard, sortOrder: targetOrder };
    const nextTargetBoard = { ...currentTargetBoard, sortOrder: draggedOrder };
    const replacements = new Map([
      [nextDraggedBoard.id, nextDraggedBoard],
      [nextTargetBoard.id, nextTargetBoard],
    ]);

    this.boards.update((boards) => boards.map((board) => replacements.get(board.id) ?? board));
    this.clearBoardReorderDrag();
    await Promise.all([this.persistAndReplaceBoard(nextDraggedBoard), this.persistAndReplaceBoard(nextTargetBoard)]);
  }

  clearBoardReorderDrag(): void {
    this.draggedBoardId.set(null);
    this.boardDropTargetId.set(null);
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

  confirmBulkDeleteCards(event?: Event): void {
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
    return board.cards
      .filter((card) => !!card.tour)
      .sort((left, right) => (left.tour?.sequence ?? 0) - (right.tour?.sequence ?? 0));
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

  nextTourCard(card: BoardCard, cards = this.selectedBoardTourCards()): BoardCard | null {
    const sequence = card.tour?.sequence ?? 0;
    return cards.find((item) => (item.tour?.sequence ?? 0) === sequence + 1) ?? null;
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
      const path = points.map((point) => {
        bounds.extend(point.position);
        return point.position;
      });
      const Polyline = maps['Polyline'] as new (options: Record<string, unknown>) => unknown;
      if (Polyline && path.length > 1) {
        this.tourMapPolyline = new Polyline({
          path,
          map: this.tourMap,
          strokeColor: this.toneAccent(tourBoard.tone),
          strokeOpacity: 0.86,
          strokeWeight: tourBoard.kind === 'driving-tour' ? 5 : 4,
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
    const polyline = this.tourMapPolyline as { setMap?: (map: unknown | null) => void } | null;
    polyline?.setMap?.(null);
    this.tourMapPolyline = null;
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
        timeout: 75_000,
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

  what3wordsUrlFor(card: { what3wordsAddress?: string }): string {
    return what3wordsLocation(card.what3wordsAddress)?.url ?? '';
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
    return this.cardImages(card).slice(1);
  }

  cardMemoryCount(card: Pick<BoardCard, 'imageUrl' | 'imageUrls'>): number {
    return this.cardMemoryImages(card).length;
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

  openEditCardPhotos(card: BoardCard, event: Event): void {
    event.stopPropagation();
    this.openEditCard(card);
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
    const path = board.visibility === 'public'
      ? `/share/board/${encodeURIComponent(board.id)}?v=${encodeURIComponent(board.updatedAt || board.id)}`
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

  stackCoverImage(board: Board): string {
    return board.imageUrl || board.cards.find((card) => card.imageUrl)?.imageUrl || '';
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
      `https://open.spotify.com/embed/track/${encodeURIComponent(trackId)}?utm_source=generator&theme=0`,
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

  private spotifyTrackIdForCard(card: Pick<BoardCard, 'spotifyTrackId' | 'spotifyTrackUrl' | 'spotifyUri'>): string {
    const direct = card.spotifyTrackId.trim();
    if (direct) {
      return direct;
    }
    const match = `${card.spotifyTrackUrl} ${card.spotifyUri}`.match(/(?:open\.spotify\.com\/track\/|spotify:track:)([A-Za-z0-9]{12,32})/i);
    return match?.[1] ?? '';
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
    const resumeTourPlayback = this.isTourStackLiveView();
    if (resumeTourPlayback) {
      this.stackTourNarrationConsent.set(true);
    }
    this.stopStackPlayback();
    this.stackFrameIndex.update((index) => {
      const count = this.stackFrameCount();
      return count ? (index - 1 + count) % count : 0;
    });
    this.syncStackLivePreviewAfterFrameChange();
    if (resumeTourPlayback) {
      this.stackPlaying.set(true);
      this.syncStackTourNarrationAfterFrameChange({ autoAdvance: true, forceNarration: true });
    }
  }

  nextStackFrame(): void {
    const resumeTourPlayback = this.isTourStackLiveView();
    if (resumeTourPlayback) {
      this.stackTourNarrationConsent.set(true);
    }
    this.stopStackPlayback();
    if (resumeTourPlayback) {
      this.stackPlaying.set(true);
    }
    this.advanceStackFrame({ forceTourNarration: resumeTourPlayback });
  }

  toggleStackCardDetails(card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const opening = this.stackExpandedCardId() !== card.id;
    if (opening) this.stopStackPlayback();
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
    const text = (card.notes || card.shortSummary || card.subtitle).trim();
    if (!text || !this.isBrowser || typeof window.speechSynthesis === 'undefined') return;
    this.stopStackPlayback();
    this.stopTourSpeech();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 3600));
    const language = navigator.language || 'en-US';
    const root = language.split('-')[0]?.toLowerCase();
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase())
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(`${root}-`))
      ?? null;
    utterance.lang = utterance.voice?.lang || language;
    utterance.rate = 0.96;
    this.tourSpeechUtterance = utterance;
    this.tourSpeechPlaying.set(true);
    utterance.onend = utterance.onerror = () => {
      if (this.tourSpeechUtterance === utterance) {
        this.tourSpeechUtterance = null;
        this.tourSpeechPlaying.set(false);
      }
    };
    window.speechSynthesis.speak(utterance);
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
    if (this.isTourStackLiveView()) {
      this.stackTourNarrationConsent.set(true);
    }
    this.startStackPlayback();
  }

  startNarratedStack(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
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
    this.stackTourNarrationConsent.set(true);
    this.stopStackPlayback();
    this.stackPlaying.set(true);
    this.syncStackTourNarrationAfterFrameChange({ autoAdvance: true, forceNarration: true });
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
        socialVideoRatio: this.stackRatio(),
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

  private createStackVideo(board: Board): Promise<StackVideoResult> {
    const selectedCards = this.stackSelectedCards().slice(0, STACK_VIDEO_MAX_CARDS);
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
        status: card.status,
        rating: card.rating,
        imageUrl: card.imageUrl,
        imageUrls: card.imageUrls,
        tourSequence: card.tour?.sequence ?? null,
      })),
    }, this.stackRatio(), (progress) => this.stackVideoProgress.set(Math.round(progress * 100)));
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
    const subtitle = board.description.trim() || `${board.cards.length} card${board.cards.length === 1 ? '' : 's'} curated by ${this.ownerName(board)}`;
    this.stackStudioBoardId.set(board.id);
    this.stackSelectedCardIds.set(new Set(board.cards.map((card) => card.id)));
    this.stackCoverTitle.set(board.title);
    this.stackCoverSubtitle.set(subtitle);
    this.stackCaption.set(`I made a LivingWiki Stack: ${board.title}. Explore the full board.`);
    this.stackFormat.set('reel');
    this.stackRatio.set('vertical');
    this.stackFrameIndex.set(0);
    this.stackTourNarrationConsent.set(false);
    this.setStackShareMessage(null);
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
    if (this.stackHasTourNarration() && !this.stackTourNarrationConsent()) {
      this.stopStackPlayback();
      return;
    }
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

  private advanceStackFrame(options: { forceTourNarration?: boolean } = {}): void {
    this.stackExpandedCardId.set(null);
    this.stackFrameIndex.update((index) => {
      const count = this.stackFrameCount();
      return count ? (index + 1) % count : 0;
    });
    this.syncStackLivePreviewAfterFrameChange();
    this.syncStackTourNarrationAfterFrameChange({
      autoAdvance: this.stackPlaying(),
      forceNarration: options.forceTourNarration ?? false,
    });
  }

  private startStackPlayback(): void {
    if (this.stackPlaying()) {
      return;
    }
    this.stackPlaying.set(true);
    if (this.syncStackTourNarrationAfterFrameChange({ autoAdvance: true })) {
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

  private isTourStackLiveView(): boolean {
    return this.stackDirectView() && this.stackHasTourNarration();
  }

  private syncStackTourNarrationAfterFrameChange(
    options: { autoAdvance?: boolean; forceNarration?: boolean } = {},
  ): boolean {
    if (!this.isTourStackLiveView()) {
      return false;
    }

    this.clearStackPlaybackTimer();
    const token = ++this.stackTourNarrationSwitchToken;
    this.stopTourSpeech();
    this.tourAudioNotice.set(null);
    this.stackActiveFrameDurationMs.set(this.stackFrameDurationMs);

    const autoAdvance = options.autoAdvance ?? this.stackPlaying();
    const frame = this.stackCurrentFrame();
    const card = frame.kind === 'card' && frame.card?.tour ? frame.card : null;
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
    void this.playStackTourNarration(tourFrame, token, autoAdvance);
    return true;
  }

  private async playStackTourNarration(
    frame: TourDeckFrame,
    token: number,
    autoAdvance: boolean,
  ): Promise<void> {
    const text = frame.card.tour?.guideScript || frame.card.notes || frame.card.subtitle;
    if (!text.trim()) {
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(this.stackFrameDurationMs, token);
      }
      return;
    }

    const startedAt = Date.now();
    this.stackActiveFrameDurationMs.set(120_000);
    const audioUrl = await this.ensureTourAudioUrl(this.tourAudioKey(frame), text);
    if (!this.isStackTourNarrationCurrent(token, frame.card.id)) {
      return;
    }
    if (!audioUrl) {
      this.stackActiveFrameDurationMs.set(this.stackFrameDurationMs);
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(this.stackFrameDurationMs, token);
      }
      return;
    }

    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    this.tourAudio = audio;
    this.tourSpeechPlaying.set(true);
    const syncProgressDuration = () => {
      if (!this.isStackTourNarrationCurrent(token, frame.card.id) || !Number.isFinite(audio.duration) || audio.duration <= 0) {
        return;
      }
      const elapsedMs = Date.now() - startedAt;
      this.stackActiveFrameDurationMs.set(Math.max(this.stackFrameDurationMs, Math.ceil(elapsedMs + audio.duration * 1000 + 450)));
    };
    audio.onloadedmetadata = syncProgressDuration;
    audio.onended = () => {
      if (!this.isStackTourNarrationCurrent(token, frame.card.id) || this.tourAudio !== audio) {
        return;
      }
      this.stopTourSpeech();
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(450, token);
      }
    };
    audio.onerror = () => {
      if (!this.isStackTourNarrationCurrent(token, frame.card.id) || this.tourAudio !== audio) {
        return;
      }
      this.stopTourSpeech();
      this.tourAudioNotice.set(null);
      if (this.startStackBrowserNarration(frame, text, token, autoAdvance, startedAt)) {
        return;
      }
      this.stackActiveFrameDurationMs.set(this.stackFrameDurationMs);
      this.tourAudioNotice.set('The tour narration could not play this location. Continuing to the next stop.');
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(this.stackFrameDurationMs, token);
      }
    };

    try {
      await audio.play();
      syncProgressDuration();
    } catch {
      if (!this.isStackTourNarrationCurrent(token, frame.card.id) || this.tourAudio !== audio) {
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
      || !this.isStackTourNarrationCurrent(token, frame.card.id)) {
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
      if (this.tourSpeechUtterance !== utterance || !this.isStackTourNarrationCurrent(token, frame.card.id)) {
        return;
      }
      this.tourSpeechUtterance = null;
      this.tourSpeechPlaying.set(false);
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(450, token);
      }
    };
    utterance.onerror = () => {
      if (this.tourSpeechUtterance !== utterance || !this.isStackTourNarrationCurrent(token, frame.card.id)) {
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

  private isStackTourNarrationCurrent(token: number, cardId: string): boolean {
    return token === this.stackTourNarrationSwitchToken
      && this.isTourStackLiveView()
      && this.stackCurrentTourCard()?.id === cardId;
  }

  private scheduleStackFrameAdvance(delayMs: number, token: number): void {
    this.clearStackPlaybackTimer();
    this.stackPlaybackTimer = setTimeout(() => {
      if (token !== this.stackTourNarrationSwitchToken || !this.stackPlaying() || !this.isTourStackLiveView()) {
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
    const messages = this.isTourWizardMode() ? BOARD_TOUR_STATUS_MESSAGES : BOARD_WIZARD_STATUS_MESSAGES;
    return messages[this.wizardLoadingIndex()] ?? messages[0];
  }

  wizardLoadingProgress(): number {
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
    this.wizardPhotoNames.set('');
    this.wizardOffGridName.set('');
    this.wizardOffGridAddress.set('');
    this.wizardOffGridTip.set('');
    this.wizardOffGridSource.set('spot');
    this.wizardOffGridPhoto.set('');
    this.wizardOffGridResolvedLocation.set(null);
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
      timeout: 75_000,
    });
    const response = await callable({
      mode: this.wizardMode(),
      prompt,
      pastedList: this.wizardMode() === 'paste' ? this.wizardPastedList().trim() : '',
      url: this.wizardMode() === 'url' ? this.wizardUrl().trim() : '',
      photoNames: this.wizardMode() === 'photos' ? this.wizardPhotoNamesList() : [],
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
      cards: (cards.length ? cards : fallback.cards).slice(0, 100),
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
      what3wordsAddress: normalizeWhat3WordsAddress(data['what3wordsAddress']),
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
    };
  }

  private async enrichWizardCards(cards: BoardWizardGeneratedCard[]): Promise<BoardWizardPreviewCard[]> {
    const preview: BoardWizardPreviewCard[] = [];
    for (const card of cards.slice(0, 100)) {
      let enriched: BoardWizardPreviewCard = {
        ...card,
        id: this.createId(),
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
    }
    return preview;
  }

  private shouldEnrichWizardCard(card: BoardWizardGeneratedCard): boolean {
    if (card.what3wordsAddress) {
      return false;
    }
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
    const context = this.wizardPrompt().trim() || this.wizardTargetBoardTitle();
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
    if (mode === 'url') {
      const restaurantFallback = this.buildLocalRestaurantUrlWizardBatch(source || refinement);
      if (restaurantFallback) {
        return restaurantFallback;
      }
    }
    if (this.isTourWizardMode(mode)) {
      return this.buildLocalTourWizardBatch(source || refinement || 'Local tour');
    }
    const items = this.localWizardItems(source || refinement || 'Wizard card', mode === 'paste' || mode === 'photos').slice(0, this.wizardCount());
    const title = this.wizardTargetBoardId() === 'new'
      ? this.titleFromWizardInput(source || refinement || 'Wizard board')
      : this.wizardTargetBoardTitle();
    const defaultType = this.wizardDefaultType();
    return {
      board: {
        title,
        description: `${this.wizardVibe()} board draft generated from ${mode} input.`,
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

  private buildOffGridWizardBatch(): BoardWizardGeneratedBatch {
    const location = this.wizardOffGridResolvedLocation();
    const name = this.wizardOffGridName().trim().slice(0, 80) || 'Off-grid place';
    const words = location?.words ?? '';
    const nearby = location?.nearestPlace ? ` · near ${location.nearestPlace}` : '';
    const tip = this.wizardOffGridTip().trim().slice(0, 3600);
    const title = this.wizardTargetBoardId() === 'new'
      ? 'Off-grid Places'
      : this.wizardTargetBoardTitle();
    return {
      board: {
        title,
        description: 'Exact places worth sharing, even when they do not have a street address.',
        icon: 'location_on',
        tone: 'green',
        kind: 'off-grid',
        tourMeta: null,
      },
      cards: [{
        title: name,
        subtitle: `Pinned to ///${words}${nearby}`,
        notes: tip || `This card points to a precise 3 m × 3 m what3words square. Use Go there to open it for navigation.`,
        type: 'place',
        scope: 'place',
        status: 'saved',
        rating: 4,
        tags: ['off-grid', 'what3words'],
        image_query: `${name} place photo`,
        place_query: name,
        imageUrl: this.wizardOffGridPhoto(),
        entity_name: name,
        entity_type: 'place',
        image_intent: 'place',
        image_context: location?.nearestPlace ?? '',
        short_summary: `Exact location: ///${words}`,
        what3wordsAddress: words,
      }],
    };
  }

  private buildLocalRestaurantUrlWizardBatch(source: string): BoardWizardGeneratedBatch | null {
    const lower = source.toLowerCase();
    const knownItems = lower.includes('capriottis.com')
      ? ['The Bobbie', 'Classic Cheesesteak', 'Capastrami', 'Homemade Turkey', 'Italian Sub', 'Wagyu Roast Beef', 'Chicken Cheesesteak', 'Impossible Cheese Steak', 'Cole Turkey', 'American Wagyu Slaw Be Jo']
      : null;
    if (!knownItems) {
      return null;
    }
    const count = this.wizardCount();
    const restaurant = lower.includes('capriottis.com') ? "Capriotti's Sandwich Shop" : this.titleFromWizardInput(source);
    const cards = knownItems.slice(0, Math.max(1, count - 1)).map((item, index): BoardWizardGeneratedCard => ({
      title: item,
      subtitle: $localize`Menu item`,
      notes: `Food item from ${restaurant}. Review the details and image before saving.`,
      type: 'food',
      scope: 'place',
      status: index < 3 ? 'favorite' : 'saved',
      rating: index < 3 ? 5 : 4,
      tags: ['menu-item', 'food'],
      image_query: `${item} ${restaurant} food`,
      place_query: restaurant,
    }));
    cards.push({
      title: $localize`Open Menu`,
      subtitle: $localize`Original URL`,
      notes: $localize`Open the source menu and edit this action card if needed.`,
      type: 'note',
      scope: 'place',
      status: 'planned',
      rating: 4,
      tags: ['action', 'menu'],
      image_query: `${restaurant} menu`,
      place_query: source,
    });
    return {
      board: {
        title: `${restaurant} Menu`,
        description: $localize`Food-item board generated from a restaurant URL.`,
        icon: 'restaurant',
        tone: 'coral',
        kind: 'standard',
        tourMeta: null,
      },
      cards: cards.slice(0, count),
    };
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
          socialVideoRatio: this.isStackRatio((board as Partial<Board>).socialVideoRatio)
            ? (board as Board).socialVideoRatio
            : 'vertical',
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
            what3wordsAddress: normalizeWhat3WordsAddress((card as Partial<BoardCard>).what3wordsAddress),
            scope: this.isBoardCardScope((card as BoardCard).scope) ? (card as BoardCard).scope : 'place',
            stickers: this.normalizeStickers(card.stickers),
            tour: this.normalizeCardTour((card as BoardCard).tour),
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
    await setDoc(doc(this.firestore, 'boards', prepared.id), persistable);
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
      socialVideoRatio: this.isStackRatio(data['socialVideoRatio']) ? data['socialVideoRatio'] : 'vertical',
      stickers: this.normalizeStickers(data['stickers']),
      tourMeta: this.normalizeTourMeta(data['tourMeta']),
      learningQuiz: normalizeBoardLearningQuiz(data['learningQuiz']),
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
      what3wordsAddress: normalizeWhat3WordsAddress(data['what3wordsAddress']),
      tags: Array.isArray(data['tags']) ? data['tags'].filter((tag): tag is string => typeof tag === 'string').slice(0, 6) : [],
      stickers: this.normalizeStickers(data['stickers']),
      tour: this.normalizeCardTour(data['tour']),
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
      board.cards.map(async (card) => {
        const sourceImages = this.cardImages(card);
        const imageUrls = await Promise.all(
          sourceImages.map((url, index) =>
            this.persistImageIfNeeded(url, `users/${uid}/boards/${board.id}/cards/${card.id}/${index}.jpg`),
          ),
        );
        return { ...card, imageUrl: imageUrls[0] ?? '', imageUrls };
      }),
    );
    return { ...board, imageUrl, logoUrl, cards };
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
