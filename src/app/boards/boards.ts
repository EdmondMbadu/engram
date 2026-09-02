import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, computed, effect, ElementRef, HostListener, inject, LOCALE_ID, OnDestroy, PLATFORM_ID, signal, ViewChild, type WritableSignal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { FirebaseError } from 'firebase/app';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, updateDoc, where, writeBatch, type DocumentData, type Firestore, type QueryConstraint, type QueryDocumentSnapshot, type QuerySnapshot, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { AccountMenuComponent } from '../account-menu/account-menu';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
import { BoardCollectionCreateComponent } from '../board-collection-create/board-collection-create';
import { BoardCollectionListComponent } from '../board-collection-list/board-collection-list';
import { BoardAnalyticsService } from '../board-analytics.service';
import { BoardLikesService, boardLikeTargetKey, type BoardLikeMetric, type BoardLikeTarget } from '../board-likes.service';
import { CustomPublicUrlDialogComponent } from '../custom-public-url-dialog/custom-public-url-dialog';
import {
  customPublicUrlRouteMatches,
  normalizeCustomPublicUrlSlug,
  type SetCustomPublicUrlResult,
} from '../custom-public-url';
import {
  BoardCollectionsService,
  type BoardCollection,
  type BoardCollectionChoice,
} from '../board-collections.service';
import { BOARD_ICON_OPTIONS, resolveBoardIcon } from '../board-icon';
import { getFirebaseFirestore, getFirebaseFunctions, getFirebaseStorage } from '../firebase.client';
import { GoogleMapsService, type PlaceSearchResult } from '../google-maps.service';
import {
  DocxExportService,
  type DocxExportPhase,
  type DocxExportResult,
} from '../docx-export.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import type { AtlasItem } from '../atlas.models';
import { PlaceReviewsService, type CityPlaceCandidate } from '../place-reviews.service';
import {
  PersonalVoiceService,
  type PersonalVoice as PersonalNarratorVoice,
  type PersonalVoiceLibrary as PersonalNarratorVoiceResponse,
} from '../personal-voice.service';
import { profileIconByCode, profileIconForSeed } from '../profile/profile-icons';
import { generateQrSvgDataUrl } from '../qr-code';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { WorkspaceSidebarComponent } from '../workspace-sidebar/workspace-sidebar';
import {
  NearbyGemsBoardComponent,
  type NearbyGemsBoardCardView,
} from './nearby-gems-board/nearby-gems-board';
import { VideoLibraryService } from '../video-library/video-library.service';
import { BoardPromoImageDialogComponent } from './board-promo-image-dialog';
import { BackdropDismissDirective } from '../backdrop-dismiss.directive';
import { TalkingCardEditorComponent } from '../talking-card-editor/talking-card-editor';
import { TalkingCardConversationComponent } from '../talking-card-conversation/talking-card-conversation';
import { SpotifyPlaybackService, type SpotifyTrack } from '../spotify-playback.service';
import { StackNarrationSessionService } from '../stack-narration-session.service';
import {
  hasSongCardSignal,
  isMusicBoard,
  orderedSpotifyQueue,
} from '../music-board-playlist';
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
  DEFAULT_INCREMENTAL_PAGE_SIZE,
  incrementalSlice,
  incrementalViewportNearEnd,
  nextIncrementalLimit,
} from '../incremental-pagination';
import {
  applyBoardTranslation,
  BOARD_TRANSLATION_LANGUAGES,
  boardTranslationLanguageName,
  isBoardTranslationLanguage,
  normalizeBoardTranslationResult,
  type BoardTranslationLanguage,
  type BoardTranslationResult,
} from './board-translation';
import {
  BOARD_WIZARD_PASTE_MAX_LENGTH,
  detectBoardWizardSourceUrl,
  parseNumberedBoardSource,
} from './board-wizard-source';
import {
  boardWizardDoorwayOffset,
  boardWizardModeForDoorway,
  wrapBoardWizardDoorwayIndex,
  type BoardWizardDoorwayId,
} from './board-wizard-doorway';
import { duplicateCardRecord } from './card-duplicate';
import {
  boardWizardImageProgressLabel,
  boardWizardStepAfterGenerationFailure,
  isBoardWizardImageEnrichmentActive,
  isBoardWizardImagePreparationActive,
  shouldAutosaveBoardWizardDraft,
  shouldFlushBoardWizardDraftOnClose,
  shouldRetryBoardWizardDraftAutosave,
} from './board-wizard-draft-lifecycle';
import {
  boardWizardVideoCandidateBatches,
  boardWizardVideoTargetCount,
  DEFAULT_BOARD_WIZARD_MEDIA_MODE,
  orderBoardWizardVideoCandidates,
  type BoardWizardMediaMode,
} from './board-wizard-media-mode';
import {
  boardWizardDraftCardWithPersistedImages,
  boardWizardDraftCountMode,
  boardWizardDraftListingIntent,
  boardWizardDraftListingMarketing,
  boardWizardDraftMediaMode,
  boardWizardDraftNarrationSeconds,
  boardWizardDraftPayloadWithPreferences,
} from './board-wizard-draft-persistence';
import {
  resolveBoardWizardCountIntent,
  type BoardWizardCountMode,
  type BoardWizardCountPolicy,
} from './board-wizard-count-policy';
import { appendBoardCards } from './board-batch';
import {
  buildBoardPhotoStoryDrafts,
  isBoardPhotoStory,
  isBoardPhotoStudioDraft,
  shouldOpenBoardPhotoStoryStudio,
  type BoardPhotoStoryMode,
} from './board-photo-story';
import { compareBoardsByCreatedDate } from './board-gallery-order';
import { beginBoardRouteLoad, completeBoardRouteLoad, findResolvedBoardRoute } from './board-route-load-state';
import { shouldCanonicalizeBoardsRootRoute } from './board-root-route';
import { resetBoardRouteViewport } from './board-route-scroll';
import {
  BOARD_NARRATION_STYLES,
  DEFAULT_BOARD_NARRATION_STYLE_ID,
  defaultNarratorVoiceIdForStyle,
  defaultNarratorVoiceNameForStyle,
  normalizeBoardNarrationStyleId,
  type BoardNarrationStyleId,
} from './board-narration-style';
import {
  BOARD_NARRATION_LENGTH_PRESETS,
  DEFAULT_BOARD_NARRATION_SECONDS_PER_CARD,
  MAX_BOARD_NARRATION_SECONDS_PER_CARD,
  MIN_BOARD_NARRATION_SECONDS_PER_CARD,
  boardNarrationDurationLabel,
  boardNarrationBudgetedSecondsPerCard,
  boardNarrationEstimatedTotalSeconds,
  boardNarrationTargetWords,
  normalizeBoardNarrationSeconds,
} from './board-narration-length';
import {
  cardsForBoardInsideDisplay,
  normalizeBoardInsideDisplay,
  type BoardInsideDisplay,
} from './board-inside-display';
import { canReorderCardSurface } from './card-interaction';
import {
  normalizeBoardCardConversation,
  talkingCardCtaLabel,
  type BoardCardConversation,
  type TalkingCardEditorResult,
} from './talking-card';
import { cardPresentationSubtitle } from './card-numbering';
import { cardNotesForPersistence, cardNotesSummary } from './card-notes';
import { cardPhotoLimit } from './board-card-photo-limit';
import {
  isListingGroupCard,
  listingCardPresentationImages,
  normalizeListingCardPresentation,
  type ListingCardPresentation,
} from './listing-card-presentation';
import {
  boardCityMetadataForFirestore,
  boardDescriptionForFirestore,
  omitUndefinedDeep,
} from './firestore-payload';
import { cardsForNewBoardInside, legacyMemoryImages, relatedCardCollectionLabel, upsertNestedCard } from './related-cards';
import {
  cardsForStackView,
  nextFiniteStackFrameIndex,
  previousFiniteStackFrameIndex,
} from './stack-card-selection';
import {
  buildStackStoryFrames,
  stackStoryFrameKey,
  type StackStoryFrame,
} from './stack-story-frames';
import {
  adjustStackScriptNarration,
  normalizeStackScriptShortenResults,
  stackScriptSentenceCount,
  stackScriptShortenEstimateSeconds,
  type StackScriptShortenResult,
} from './stack-script-shortening';
import {
  buildStackDocsExportSnapshot,
  stackDocsExportImageCount,
  stackDocsExportMissingNarrationCount,
  type StackDocsExportSnapshot,
} from './stack-doc-export';
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
import {
  effectiveTourHandoffText,
  tourHandoffDestinationTeaser,
} from './tour-handoff';
import { isGenericTourStopFallback, tourStopDestinationQuery } from './tour-stop';
import {
  youtubePrivacyEmbedUrl,
  youtubeVideoIdFromReference,
  youtubeWatchUrl,
} from './youtube-video';
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
  generateStackTrailer,
  generateStackVideo,
  normalizeStackVideoBranding,
  normalizeStackVideoClosingScreen,
  publishedStackVideoStoragePath,
  STACK_TRAILER_RENDER_VERSION,
  STACK_VIDEO_RENDER_VERSION,
  stackVideoRenderIsCurrent,
  type StackVideoBackgroundAudio,
  type StackVideoBrandingMode,
  type StackVideoNarration,
  type StackVideoResult,
  type StackTrailerNarration,
  type StackVideoClosingImage,
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
  DEFAULT_STACK_NARRATOR_VOICE_ID,
  PERSONAL_STACK_NARRATOR_VOICE_ID,
  RECOMMENDED_STACK_NARRATOR_VOICES,
  STACK_NARRATOR_VOICES,
  STACK_NARRATOR_VOICE_PRESENTATIONS,
  filterStackNarratorVoices,
  isPersonalStackNarratorVoiceId,
  normalizeStackNarratorVoiceId,
  personalStackNarratorVoiceId,
  personalVoiceIdFromStackNarrator,
  stackNarratorVoiceRequiresPaidPlan,
  stackNarratorVoiceById,
  type StackNarratorVoice,
  type StackVoiceLibraryFilter,
} from './stack-voice';
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
type BoardKind = 'standard' | 'nearby-gems' | 'off-grid' | 'walking-tour' | 'driving-tour';
type BoardVisibility = 'public' | 'private';
type BoardCardType = 'place' | 'food' | 'memory' | 'idea' | 'shop' | 'note';
type BoardCardScope = 'place' | 'city' | 'country' | 'region';
type BoardCardStatus = 'planned' | 'saved' | 'visited' | 'favorite';
type BoardEntityType = 'person' | 'fictional_character' | 'place' | 'event' | 'work' | 'product' | 'food' | 'organization' | 'other';
type BoardImageIntent = 'portrait' | 'character' | 'place' | 'event' | 'cover' | 'product' | 'food' | 'logo' | 'other';
type BoardMediaKind = 'none' | 'song' | 'album' | 'film' | 'book' | 'tv' | 'game';
type BoardGalleryTab = 'boards' | 'cards' | 'favorites' | 'collections' | 'private';
type BoardGallerySort = 'custom' | 'recent' | 'title';
type ShareTarget = 'facebook' | 'x' | 'linkedin' | 'whatsapp' | 'reddit' | 'email';
type StickerSurface = 'board' | 'card';
type CardImageToolMode = 'generate' | 'search' | null;
type WizardCardEditorSection = 'details' | 'image';
type OffGridLocationSource = 'spot' | 'words';
type BoardWizardMode = 'describe' | 'paste' | 'photos' | 'off-grid' | 'nearby-gems' | 'url' | 'walking-tour' | 'driving-tour';
type BoardWizardStep = 'choose' | 'configure' | 'loading' | 'source-review' | 'listing-setup' | 'preview' | 'done';
type BoardWizardEntryIntent = 'default' | 'real-estate' | 'rental';
type BoardWizardVibe = 'playful' | 'foodie' | 'traveler' | 'curator' | 'memory';
type BoardWizardListingMarketingStyle = 'warm' | 'guided' | 'luxury' | 'brisk' | 'investor';
type BoardWizardListingPreview = {
  listingName: string;
  address: string;
  price: string;
  status: string;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  mlsId: string;
  imageCount: number;
  contactName: string;
  contactRole: string;
  brokerage: string;
  siteName: string;
  confidence: number;
};
type NearbyGemRange = 'walk' | 'quick-drive' | 'adventure';
type NearbyGemLocation = { latitude: number; longitude: number; accuracy: number };
type NearbyGemCardMetrics = {
  durationSeconds: number;
  distanceMeters: number;
  measurement: 'route' | 'estimated';
  category: string;
};
type NearbyGemsBoardMeta = {
  locationLabel: string;
  range: NearbyGemRange;
  travelMode: 'walking' | 'driving';
  defaultSort: 'travel-time' | 'distance';
  generatedAt: string;
  originStored: false;
  generationGrantId: string;
};
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
type StackShareMode = 'trailer' | 'video' | 'live';
type StackDeliveryRatio = 'vertical' | 'landscape';
type StackSoundTab = 'script' | 'voice' | 'music';

type StackScriptCardDraft = {
  title: string;
  subtitle: string;
  narration: string;
};
type StackLinkShareTarget = Extract<ShareTarget, 'x' | 'facebook' | 'linkedin' | 'reddit' | 'whatsapp'> | 'more';
type StackVideoPair = Record<StackDeliveryRatio, StackVideoResult>;
type PublishedStackVideoVariant = {
  url: string;
  mimeType: string;
  updatedAt: string;
  renderVersion: string;
  durationSeconds: number;
  ratio: StackDeliveryRatio;
};
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
  nearby?: NearbyGemCardMetrics;
  videoNarrationRevision?: number;
  stackNarrationSource?: string;
  videoIntent?: boolean;
  videoSearchQuery?: string;
  youtubeVideoId?: string;
  youtubeVideoTitle?: string;
  youtubeChannelTitle?: string;
  youtubeThumbnailUrl?: string;
  youtubeDurationSeconds?: number;
  youtubeMatchConfidence?: number;
  youtubeVerifiedAt?: string;
  imageUrl: string;
  imageUrls: string[];
  listingPresentation?: ListingCardPresentation | null;
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
  childBoardId?: string;
  relatedCards?: BoardCard[];
  conversation?: BoardCardConversation | null;
  createdAt: string;
  updatedAt: string;
};

type Board = {
  id: string;
  likeCount?: number;
  customSlug?: string;
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
  photoStoryBoard?: boolean;
  photoStudioDraft?: boolean;
  title: string;
  description: string;
  backNote: string;
  icon: string;
  tone: BoardTone;
  imageUrl: string;
  imageWebpSrcset?: string;
  imageWidth?: number;
  imageHeight?: number;
  summaryCardCount?: number;
  summaryFavoriteCardCount?: number;
  summarySearchText?: string;
  isSummary?: boolean;
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
  socialVideoNarrationEnabled?: boolean;
  socialLandscapeVideoUrl: string;
  socialLandscapeVideoMimeType: string;
  socialLandscapeVideoUpdatedAt: string;
  socialLandscapeVideoRenderVersion?: string;
  socialLandscapeVideoDurationSeconds: number;
  socialVideoClosingHeadline: string;
  socialVideoClosingMessage: string;
  socialVideoClosingShowQrCode: boolean;
  socialVideoClosingImage: StackVideoClosingImage;
  socialVideoClosingCustomImageUrl: string;
  socialVideoClosingDurationSeconds: number;
  trailerVideoUrl: string;
  trailerVideoMimeType: string;
  trailerVideoUpdatedAt: string;
  trailerVideoRenderVersion?: string;
  trailerVideoRatio: StackRatio;
  trailerVideoAudioTrackId: string;
  trailerVideoAudioVolume: number;
  trailerVideoNarrationEnabled?: boolean;
  trailerVideoScript: string;
  trailerVideoSourceFingerprint: string;
  trailerVideoCardIds: string[];
  trailerVideoDurationSeconds: number;
  trailerLandscapeVideoUrl: string;
  trailerLandscapeVideoMimeType: string;
  trailerLandscapeVideoUpdatedAt: string;
  trailerLandscapeVideoRenderVersion?: string;
  trailerLandscapeVideoDurationSeconds: number;
  narrationStyle: BoardNarrationStyleId;
  narrationSecondsPerCard?: number;
  stackNarratorVoiceId: string;
  stickers: BoardSticker[];
  tourMeta: BoardTourMeta | null;
  nearbyGems?: NearbyGemsBoardMeta | null;
  learningQuiz?: BoardLearningQuiz | null;
  parentBoardId?: string;
  parentCardId?: string;
  parentBoardTitle?: string;
  parentCardTitle?: string;
  atlasId: string;
  generatedForAtlasId: string;
  insideCardsDisplay: BoardInsideDisplay;
  showCardNumbers: boolean;
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

type BoardSettingsDraft = {
  title: string;
  description: string;
  visibility: BoardVisibility;
  showCardNumbers: boolean;
  insideCardsDisplay: BoardInsideDisplay;
};

type BoardInsideContext = {
  parentBoardId: string;
  parentCardId: string;
  parentBoardTitle: string;
  parentCardTitle: string;
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
  youtubeReference: string;
  youtubeVideoId: string;
  youtubeVideoTitle: string;
  youtubeChannelTitle: string;
  youtubeThumbnailUrl: string;
  youtubeDurationSeconds: number;
  youtubeMatchConfidence: number;
  youtubeVerifiedAt: string;
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
  parentCardId?: string | null;
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
type BoardFriendsView = 'friends' | 'requests' | 'sent';

type BoardRecord = Omit<Board, 'createdAt' | 'updatedAt' | 'customSlug' | 'likeCount'> & {
  like_count: number;
  custom_slug?: string;
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
  nearby?: NearbyGemCardMetrics;
  video_intent?: boolean;
  video_search_query?: string;
  youtubeVideoId?: string;
  youtubeVideoTitle?: string;
  youtubeChannelTitle?: string;
  youtubeThumbnailUrl?: string;
  youtubeDurationSeconds?: number;
  youtubeMatchConfidence?: number;
  youtubeVerifiedAt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  listingPresentation?: ListingCardPresentation | null;
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
    nearbyGems?: NearbyGemsBoardMeta | null;
  };
  cards: BoardWizardGeneratedCard[];
  sourceReport?: BoardWizardSourceReport;
  generation?: BoardWizardGenerationSummary;
};

type BoardWizardGenerationSummary = {
  countPolicy: BoardWizardCountPolicy;
  targetCount: number;
  resolvedCount: number;
  completeSet: boolean;
  message: string;
  narrationSecondsPerCard: number;
  targetWordsPerCard: number;
};

type BoardWizardSourceReport = {
  status: 'exact' | 'recovered' | 'partial';
  method: 'page' | 'reader' | 'grounded-search';
  sourceHost: string;
  sourceBlocked: boolean;
  productCount: number;
  exactImageCount: number;
  missingImageCount: number;
  extractedItemCount: number;
  matchedCardCount: number;
  sourceImageCount: number;
  confidence: number;
  snapshotDate: string;
  message: string;
};

type BoardWizardSourceManifestItem = {
  id: string;
  title: string;
  excerpt: string;
  imageUrl: string;
  sourceIndex: number;
};

type BoardWizardSourceManifest = {
  kind: 'article-list';
  sourceUrl: string;
  finalUrl: string;
  pageTitle: string;
  siteName: string;
  expectedCount: number | null;
  confidence: number;
  method: 'page' | 'reader';
  sourceBlocked: boolean;
  items: BoardWizardSourceManifestItem[];
};

type BoardWizardPreviewCard = BoardWizardGeneratedCard & {
  id: string;
  imageUrl: string;
  placeId: string;
  googleMapsUrl: string;
  editing: boolean;
};

type BoardWizardDraftSaveState = 'idle' | 'saving' | 'saved' | 'error';

type BoardWizardDraft = {
  id: string;
  ownerUserId: string;
  mode: BoardWizardMode;
  entryIntent: BoardWizardEntryIntent;
  targetBoardId: string;
  lockedTargetBoardId: string;
  contributionBoardId: string;
  defaultType: BoardCardType;
  count: number;
  countMode: BoardWizardCountMode;
  vibe: BoardWizardVibe;
  mediaMode: BoardWizardMediaMode;
  narrationStyle: BoardNarrationStyleId;
  narrationSecondsPerCard: number;
  listingMarketingStyle: BoardWizardListingMarketingStyle;
  listingMarketingDirection: string;
  prompt: string;
  pastedList: string;
  sourceUrl: string;
  offGridName: string;
  offGridAddress: string;
  offGridTip: string;
  stackCtaLabel: string;
  stackCtaUrl: string;
  tourVoiceStyle: BoardTourVoiceStyle;
  tourPaceOrStyle: string;
  tourExtras: string[];
  result: BoardWizardGeneratedBatch;
  selectedCardIds: string[];
  createdAt: string;
  updatedAt: string;
};

type StackFrame = StackStoryFrame<BoardCard> & {
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

type BoardTrailerPreparationResponse = {
  script: string;
  fingerprint: string;
  cached: boolean;
  cardIds: string[];
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
const BOARD_ACTIONS_STORAGE_KEY = 'lw-board-actions';
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
    id: 'nearby-gems',
    label: 'Find gems near me',
    description: 'Use your location to build an editable board of interesting places within reach.',
    icon: 'explore_nearby',
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

type BoardWizardDoorwayOption = {
  id: BoardWizardDoorwayId;
  mode: BoardWizardMode | 'manual';
  label: string;
  description: string;
  icon: string;
  imageUrl: string;
  imagePosition?: string;
  collageUrls?: readonly string[];
  eyebrow?: string;
  actionLabel?: string;
  talkThru?: boolean;
};

const BOARD_WIZARD_DOORWAY_ORDER: readonly BoardWizardDoorwayId[] = [
  'describe',
  'manual',
  'paste',
  'url',
  'off-grid',
  'nearby-gems',
  'driving-tour',
  'photos',
  'real-estate',
  'rental-properties',
  'walking-tour',
];

const BOARD_WIZARD_DOORWAY_VISUALS: Record<
  BoardWizardDoorwayId,
  Pick<BoardWizardDoorwayOption, 'imageUrl' | 'imagePosition' | 'collageUrls'>
> = {
  describe: { imageUrl: '/assets/hero_neural.png', imagePosition: 'center' },
  manual: { imageUrl: '/assets/atlas-landing/wiki-bg.png', imagePosition: 'center' },
  paste: { imageUrl: '/assets/knowledge_graph.png', imagePosition: 'center' },
  url: { imageUrl: '/assets/public-wikis/boston-hero.jpg', imagePosition: 'center' },
  'off-grid': { imageUrl: '/assets/membership/canyon.jpg', imagePosition: 'center' },
  'nearby-gems': { imageUrl: '/assets/public-wikis/portland-hero.jpg', imagePosition: 'center' },
  'driving-tour': { imageUrl: '/assets/membership/hero.jpg', imagePosition: 'center 66%' },
  photos: {
    imageUrl: '/assets/membership/waterfall.jpg',
    imagePosition: 'center',
    collageUrls: [
      '/assets/membership/waterfall.jpg',
      '/assets/membership/sushi.jpg',
      '/assets/membership/coffee.jpg',
      '/assets/public-wikis/san-francisco-hero.jpg',
    ],
  },
  'real-estate': { imageUrl: '/assets/board-wizard/real-estate-hero.jpg', imagePosition: 'center 58%' },
  'rental-properties': { imageUrl: '/assets/board-wizard/rental-property-talkthru.jpg', imagePosition: 'center 54%' },
  'walking-tour': { imageUrl: '/assets/board-wizard/walking-tour.jpg', imagePosition: 'center 58%' },
};

const BOARD_WIZARD_VIBES: Array<{ id: BoardWizardVibe; label: string; icon: string }> = [
  { id: 'playful', label: $localize`Playful`, icon: 'celebration' },
  { id: 'foodie', label: $localize`Foodie`, icon: 'restaurant' },
  { id: 'traveler', label: $localize`Traveler`, icon: 'travel_explore' },
  { id: 'curator', label: $localize`Curator`, icon: 'interests' },
  { id: 'memory', label: $localize`Memory`, icon: 'auto_stories' },
];

const NEARBY_GEM_RANGES: Array<{
  id: NearbyGemRange;
  label: string;
  description: string;
  detail: string;
  icon: string;
}> = [
  {
    id: 'walk',
    label: 'Walk nearby',
    description: 'Best for a spontaneous stroll',
    detail: '30 min · up to 2 mi',
    icon: 'directions_walk',
  },
  {
    id: 'quick-drive',
    label: 'Quick drive',
    description: 'Close, easy, worthwhile',
    detail: '10 min · up to 10 mi',
    icon: 'directions_car',
  },
  {
    id: 'adventure',
    label: 'Explore farther',
    description: 'A small adventure',
    detail: '20 min · up to 20 mi',
    icon: 'explore',
  },
];

const BOARD_WIZARD_MEDIA_MODES: Array<{
  id: BoardWizardMediaMode;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    id: 'images',
    label: $localize`Images only`,
    description: $localize`Use a strong image on every card. No videos are added automatically.`,
    icon: 'photo_library',
  },
  {
    id: 'mixed',
    label: $localize`Images + videos`,
    description: $localize`Create an even mix, with images kept as reliable fallbacks.`,
    icon: 'auto_awesome_motion',
  },
  {
    id: 'videos',
    label: $localize`Videos`,
    description: $localize`Find a verified playable video for every card when one is available.`,
    icon: 'smart_display',
  },
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
const BOARD_GALLERY_PAGE_SIZE = DEFAULT_INCREMENTAL_PAGE_SIZE;
const BOARD_ROUTE_UNAVAILABLE_GRACE_MS = 1500;

type BoardLoadContext = {
  uid: string;
  publicOwnerUid: string | null;
  publicOwnerSlug: string | null;
  publicOwnerRouteActive: boolean;
};

@Component({
  selector: 'app-boards',
  imports: [WorkspaceSidebarComponent, MobileMenuComponent, ThemeToggleComponent, AccountMenuComponent, RouterLink, BoardCollectionCreateComponent, BoardCollectionListComponent, CustomPublicUrlDialogComponent, BoardPromoImageDialogComponent, NearbyGemsBoardComponent, TalkingCardEditorComponent, TalkingCardConversationComponent, BackdropDismissDirective],
  providers: [DocxExportService],
  templateUrl: './boards.html',
  styleUrls: ['./boards.css', './boards-mobile-create.css', './tour-experience.css', './board-wizard-drafts.css', './board-wizard-media-mode.css', './board-narration-style.css', './board-wizard-redesign.css', './card-image-tools.css', './wizard-card-editor.css', './youtube-video.css', './board-live-entry.css', './board-learning.css', './tour-order.css', './tour-stop-editor.css', './stack-audio.css', './stack-voice.css', './stack-script.css', './stack-listing-groups.css', './stack-cover-final.css', './stack-doc-export.css', './stack-studio-redesign.css', './board-city-tag.css', './board-custom-link.css', './nearby-gems-gallery.css', './talking-card.css', './board-settings.css'],
})
export class BoardsComponent implements AfterViewInit, OnDestroy {
  private readonly localeId = inject(LOCALE_ID);
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);
  private readonly boardCollectionsService = inject(BoardCollectionsService);
  private readonly boardAnalytics = inject(BoardAnalyticsService);
  private readonly boardLikes = inject(BoardLikesService);
  private readonly googleMapsService = inject(GoogleMapsService);
  private readonly docxExportService = inject(DocxExportService);
  private readonly placeReviewsService = inject(PlaceReviewsService);
  private readonly personalVoiceService = inject(PersonalVoiceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly videoLibrary = inject(VideoLibraryService);
  private readonly stackNarrationSession = inject(StackNarrationSessionService);
  readonly spotify = inject(SpotifyPlaybackService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore: Firestore | null = this.isBrowser ? getFirebaseFirestore() : null;
  private readonly functions: Functions | null = this.isBrowser ? getFirebaseFunctions() : null;
  private readonly storage: FirebaseStorage | null = this.isBrowser ? getFirebaseStorage() : null;
  readonly isPlatformAdmin = this.authService.isAdmin;
  private hasLoaded = false;
  private loadedStoredLocalBoards = false;
  private placeSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private placeSearchRun = 0;
  private stickerDragState: StickerDragState | null = null;
  private stackSwipeState: StackSwipeState | null = null;
  private suppressNextBoardOpen = false;
  private stackPlaybackTimer: ReturnType<typeof setInterval> | null = null;
  private stackCardPhotoTimer: ReturnType<typeof setTimeout> | null = null;
  private shareMessageTimer: ReturnType<typeof setTimeout> | null = null;
  private customUrlCopiedTimer: ReturnType<typeof setTimeout> | null = null;
  private stackShareMessageTimer: ReturnType<typeof setTimeout> | null = null;
  private boardFriendSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private boardSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private likeMetricsSignature = '';
  private boardFriendSearchRun = 0;
  private tourMapElement: HTMLElement | null = null;
  private tourMap: unknown | null = null;
  private tourMapBoardId: string | null = null;
  private tourMapMarkers: unknown[] = [];
  private tourMapPolylines: unknown[] = [];
  private tourAudio: HTMLAudioElement | null = null;
  private get stackNarrationAudio(): HTMLAudioElement | null {
    return this.stackNarrationSession.audio;
  }
  private set stackNarrationAudio(audio: HTMLAudioElement | null) {
    this.stackNarrationSession.audio = audio;
  }
  private tourSpeechUtterance: SpeechSynthesisUtterance | null = null;
  private songPreviewAudio: HTMLAudioElement | null = null;
  private readonly spotifyEnrichedBoardIds = new Set<string>();
  private readonly spotifyEnrichmentInFlightBoardIds = new Set<string>();
  private readonly spotifyEmbedUrls = new Map<string, SafeResourceUrl>();
  private readonly youtubeEmbedUrls = new Map<string, SafeResourceUrl>();
  private wizardImageEnrichmentRun = 0;
  private wizardVideoEnrichmentRun = 0;
  private wizardDraftAutosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private wizardDraftSaveInFlight = false;
  private wizardDraftSavePromise: Promise<void> | null = null;
  private wizardDraftSavePending = false;
  private wizardDraftRestoreInProgress = false;
  private wizardDraftsLoadedForUid = '';
  private readonly wizardDraftFailedSnapshotKey = signal('');
  private stackLivePreviewAutoplay = false;
  private pendingPhotoStudioNotice: { boardId: string; message: string } | null = null;
  private stackStudioDirectRequested = false;
  private stackStudioDirectOpenedFor = '';
  private readonly stackAutoplayRequested = signal(false);
  private stackShareDirectRequested = false;
  private stackShareDirectOpenedFor = '';
  private stackLivePreviewSwitchToken = 0;
  private stackTourNarrationSwitchToken = 0;
  private stackAudioPreviewRun = 0;
  private stackVoicePreviewRun = 0;
  private personalVoiceRecorder: MediaRecorder | null = null;
  private personalVoiceRecordingStream: MediaStream | null = null;
  private personalVoiceRecordingChunks: Blob[] = [];
  private personalVoiceRecordingStartedAt = 0;
  private personalVoiceRecordingTimer: ReturnType<typeof setInterval> | null = null;
  private discardPersonalVoiceRecording = false;
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
  private readonly publishedStackTrailerFiles = new Map<string, File>();
  private readonly stackAudioUrls = new Map<string, string>();
  private stackAudioPreview: HTMLAudioElement | null = null;
  private stackVoicePreview: HTMLAudioElement | null = null;
  private stackVoiceLibraryReturnFocus: HTMLElement | null = null;
  private friendsLoadedForUid = '';
  private visitPlansLoadedFor = '';
  private relatedCardsReturnScrollY = 0;
  private relatedCardsReturnSearch = '';
  private boardPageCursor: QueryDocumentSnapshot<DocumentData> | null = null;
  private boardLoadContext: BoardLoadContext | null = null;
  private boardLoadSequence = 0;
  private boardRouteLoadSequence = 0;
  private boardRouteUnavailableTimer: ReturnType<typeof setTimeout> | null = null;
  private publicOwnerRouteEmptyTimer: ReturnType<typeof setTimeout> | null = null;
  private nearbyGemsQueryConsumed = false;
  private wizardDoorwayPointerStartX: number | null = null;
  private wizardDoorwaySuppressActivation = false;
  private collectionLoadSequence = 0;
  private citiesLoadPromise: Promise<void> | null = null;

  @ViewChild('boardsScrollViewport')
  private boardsScrollViewport?: ElementRef<HTMLElement>;

  @ViewChild('stackVoiceLibrarySearch')
  private stackVoiceLibrarySearch?: ElementRef<HTMLInputElement>;

  @ViewChild('stackVoiceLibrary')
  private stackVoiceLibrary?: ElementRef<HTMLElement>;

  @ViewChild('tourMapCanvas')
  set tourMapCanvasRef(value: ElementRef<HTMLElement> | undefined) {
    const nextElement = value?.nativeElement ?? null;
    if (nextElement !== this.tourMapElement) {
      this.clearTourMapOverlays();
      this.tourMap = null;
      this.tourMapBoardId = null;
    }
    this.tourMapElement = nextElement;
    if (this.tourMapElement && this.isBrowser) {
      window.setTimeout(() => void this.renderTourMap(), 0);
    }
  }

  readonly tones = BOARD_TONES;
  readonly cardTypes = CARD_TYPES;
  readonly cardScopes = CARD_SCOPES;
  readonly cardStatuses = CARD_STATUSES;
  readonly wizardModes = BOARD_WIZARD_MODES;
  readonly nearbyGemRanges = NEARBY_GEM_RANGES;
  readonly nearbyGemMinCards = 4;
  readonly nearbyGemMaxCards = 16;
  readonly wizardVibes = BOARD_WIZARD_VIBES;
  readonly wizardMediaModes = BOARD_WIZARD_MEDIA_MODES;
  readonly wizardNarrationStyles = BOARD_NARRATION_STYLES;
  readonly wizardNarrationLengthPresets = BOARD_NARRATION_LENGTH_PRESETS;
  readonly wizardNarrationMinSeconds = MIN_BOARD_NARRATION_SECONDS_PER_CARD;
  readonly wizardNarrationMaxSeconds = MAX_BOARD_NARRATION_SECONDS_PER_CARD;
  readonly wizardNarrationVoiceName = defaultNarratorVoiceNameForStyle;
  readonly tourVoiceStyles = TOUR_VOICE_STYLES;
  readonly stackFormats = STACK_FORMATS;
  readonly stackRatios = STACK_RATIOS;
  readonly stackExportTargets = STACK_EXPORT_TARGETS;
  readonly stackLinkShareTargets = STACK_LINK_SHARE_TARGETS;
  readonly stackAudioTracks = STACK_AUDIO_TRACKS;
  readonly stackNarratorVoices = STACK_NARRATOR_VOICES;
  readonly recommendedStackNarratorVoices = RECOMMENDED_STACK_NARRATOR_VOICES;
  readonly stackVoiceLibraryFilters: readonly StackVoiceLibraryFilter[] = [
    'All',
    ...STACK_NARRATOR_VOICE_PRESENTATIONS,
  ];
  readonly personalStackNarratorVoiceId = PERSONAL_STACK_NARRATOR_VOICE_ID;
  readonly noStackAudioTrackId = NO_STACK_AUDIO_TRACK_ID;
  readonly defaultStackAudioTrackId = DEFAULT_STACK_AUDIO_TRACK_ID;
  readonly minStackAudioVolume = MIN_STACK_AUDIO_VOLUME;
  readonly maxStackAudioVolume = MAX_STACK_AUDIO_VOLUME;
  readonly songEqBars = Array.from({ length: 24 }, (_item, index) => index);
  readonly boardIcons = BOARD_ICON_OPTIONS;
  readonly cardStickerIcons = CARD_STICKER_ICONS;
  readonly ratingOptions = [1, 2, 3, 4, 5];
  readonly shareTargets = SHARE_TARGETS;

  readonly boards = signal<Board[]>([]);
  readonly boardCollections = signal<BoardCollection[]>([]);
  readonly boardCollectionsLoading = signal(false);
  readonly boardCollectionsError = signal<string | null>(null);
  readonly collectionCreateOpen = signal(false);
  readonly collectionChoicesLoading = signal(false);
  readonly boardsLoading = signal(false);
  readonly boardsLoadingMore = signal(false);
  readonly boardsHasMore = signal(false);
  readonly galleryVisibleLimit = signal(BOARD_GALLERY_PAGE_SIZE);
  readonly publicCities = signal<BoardCityOption[]>([]);
  readonly citiesLoading = signal(false);
  readonly selectedBoardId = signal<string | null>(null);
  readonly publicOwnerKey = signal<string | null>(null);
  readonly publicOwnerUid = signal<string | null>(null);
  readonly publicOwnerSlug = signal<string | null>(null);
  readonly flippedBoardIds = signal<Set<string>>(new Set());
  readonly failedBoardCoverIds = signal<Set<string>>(new Set());
  readonly flippedCardIds = signal<Set<string>>(new Set());
  readonly openCardActionMenuKey = signal<string | null>(null);
  readonly expandedCardIds = signal<Set<string>>(new Set());
  readonly activeAlongsideBoardIds = signal<Set<string>>(new Set());
  readonly boardInsideDisplaySavingId = signal<string | null>(null);
  readonly boardCardNumbersSavingId = signal<string | null>(null);
  readonly boardSettingsBoardId = signal<string | null>(null);
  readonly boardSettingsSaving = signal(false);
  readonly boardSettingsError = signal<string | null>(null);
  readonly boardSettingsDraft = signal<BoardSettingsDraft>({
    title: '',
    description: '',
    visibility: 'public',
    showCardNumbers: true,
    insideCardsDisplay: 'nested',
  });
  readonly boardSettingsBoard = computed(() => {
    const boardId = this.boardSettingsBoardId();
    return boardId ? this.boards().find((board) => board.id === boardId) ?? null : null;
  });
  readonly nearbyGemsVisibilitySavingId = signal<string | null>(null);
  readonly nearbyGemsVisibilityMessage = signal('');
  readonly activeGalleryTab = signal<BoardGalleryTab>('boards');
  readonly boardGallerySort = signal<BoardGallerySort>('custom');
  readonly boardSearch = signal('');
  readonly cardSearch = signal('');
  readonly boardDialogOpen = signal(false);
  readonly creatingBoardInside = signal<BoardInsideContext | null>(null);
  readonly cardDialogOpen = signal(false);
  readonly talkingCardEditorBoardId = signal<string | null>(null);
  readonly talkingConversationCardId = signal<string | null>(null);
  readonly talkingConversationSurface = signal<'board' | 'live'>('board');
  readonly talkingCardEditorBoard = computed(() => {
    const boardId = this.talkingCardEditorBoardId();
    return boardId ? this.boards().find((board) => board.id === boardId) ?? null : null;
  });
  readonly talkingConversationCard = computed(() => {
    const cardId = this.talkingConversationCardId();
    if (!cardId) return null;
    return this.boards().flatMap((board) => board.cards).find((card) => card.id === cardId) ?? null;
  });
  readonly talkingConversationBoard = computed(() => {
    const cardId = this.talkingConversationCardId();
    if (!cardId) return null;
    return this.boards().find((board) => board.cards.some((card) => card.id === cardId)) ?? null;
  });
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
  readonly customUrlBoard = signal<Board | null>(null);
  readonly boardPromoImageBoard = signal<Board | null>(null);
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
  readonly editingCardBoardId = signal<string | null>(null);
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
  readonly customUrlCopiedBoardId = signal<string | null>(null);
  readonly boardEmailShareOpenId = signal<string | null>(null);
  readonly boardEmailShareRecipient = signal('');
  readonly boardEmailShareSending = signal(false);
  readonly boardEmailShareError = signal<string | null>(null);
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
  readonly likeCounts = signal<Record<string, number>>({});
  readonly pendingLikeIds = signal<Set<string>>(new Set());
  readonly boardsSyncError = signal<string | null>(null);
  readonly privateBoardBlocked = signal(false);
  readonly boardFriends = signal<BoardFriendsState>({ friends: [], incoming: [], outgoing: [] });
  readonly boardFriendEmail = signal('');
  readonly boardFriendsSearch = signal('');
  readonly boardFriendsSort = signal<BoardFriendsSort>('name');
  readonly boardFriendsView = signal<BoardFriendsView>('friends');
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
  readonly musicServicesOpen = signal(false);
  readonly cardImageLocked = signal(false);
  readonly draggedStickerId = signal<string | null>(null);
  readonly placeSuggestions = signal<PlaceSearchResult[]>([]);
  readonly placeSearchLoading = signal(false);
  readonly placeSearchError = signal<string | null>(null);
  readonly placeSearchHint = signal<string | null>(null);
  readonly wizardOpen = signal(false);
  readonly wizardStep = signal<BoardWizardStep>('choose');
  readonly wizardMode = signal<BoardWizardMode>('describe');
  readonly wizardEntryIntent = signal<BoardWizardEntryIntent>('default');
  readonly wizardDoorwayId = signal<BoardWizardDoorwayId>('real-estate');
  readonly wizardTargetBoardId = signal('new');
  readonly wizardLockedTargetBoardId = signal<string | null>(null);
  readonly wizardContributionBoardId = signal<string | null>(null);
  readonly wizardDefaultType = signal<BoardCardType>('place');
  readonly wizardCount = signal(12);
  readonly wizardCountMode = signal<BoardWizardCountMode>('auto');
  readonly wizardVibe = signal<BoardWizardVibe>('playful');
  readonly wizardMediaMode = signal<BoardWizardMediaMode>(DEFAULT_BOARD_WIZARD_MEDIA_MODE);
  readonly wizardNarrationStyle = signal<BoardNarrationStyleId>(DEFAULT_BOARD_NARRATION_STYLE_ID);
  readonly wizardNarrationSecondsPerCard = signal(DEFAULT_BOARD_NARRATION_SECONDS_PER_CARD);
  readonly wizardNarrationLengthCustomized = signal(false);
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
  readonly wizardDetectedSourceUrl = computed(() => detectBoardWizardSourceUrl(
    this.wizardMode(),
    this.wizardPrompt(),
    this.wizardUrl(),
  ));
  readonly wizardSourceManifest = signal<BoardWizardSourceManifest | null>(null);
  readonly wizardSourceImageCount = computed(() => this.wizardSourceManifest()?.items.filter((item) => !!item.imageUrl).length ?? 0);
  readonly wizardCountIntent = computed(() => resolveBoardWizardCountIntent({
    prompt: [this.wizardPrompt(), this.wizardMode() === 'paste' ? this.wizardPastedList() : '']
      .filter(Boolean)
      .join(' '),
    targetBoardTitle: this.wizardTargetBoardTitle(),
    sourceCount: this.wizardDetectedPasteCount() || this.wizardSourceManifest()?.items.length || 0,
    countMode: this.wizardCountMode(),
    targetCount: this.wizardCount(),
  }));
  readonly wizardCountIsPromptControlled = computed(() => {
    const policy = this.wizardCountIntent().policy;
    return policy === 'prompt-exact' || policy === 'complete-set';
  });
  readonly wizardEffectiveCount = computed(() => this.wizardCountIntent().count ?? this.wizardCount());
  readonly wizardNarrationWordsPerCard = computed(() =>
    boardNarrationTargetWords(this.wizardNarrationSecondsPerCard()),
  );
  readonly wizardNarrationTotalSeconds = computed(() =>
    boardNarrationEstimatedTotalSeconds(
      this.wizardCountIntent().count ?? 0,
      this.wizardNarrationSecondsPerCard(),
    ),
  );
  readonly wizardSourceReviewUrl = signal('');
  readonly wizardSourceReviewExact = signal(false);
  readonly wizardSourceReviewWarning = signal('');
  readonly wizardSourceConfirmedUrl = signal('');
  readonly wizardListingPreview = signal<BoardWizardListingPreview | null>(null);
  readonly wizardListingMarketingStyle = signal<BoardWizardListingMarketingStyle>('warm');
  readonly wizardListingMarketingDirection = signal('');
  readonly wizardListingSceneMin = 5;
  readonly wizardListingSceneMax = 16;
  readonly wizardListingMarketingStyles: ReadonlyArray<{
    id: BoardWizardListingMarketingStyle;
    label: string;
    description: string;
    icon: string;
  }> = [
    { id: 'warm', label: 'Warm storyteller', description: 'An inviting, connected walk-through without sales hype.', icon: 'auto_stories' },
    { id: 'guided', label: 'Guided tour', description: 'Lead the viewer naturally from one space to the next.', icon: 'explore' },
    { id: 'luxury', label: 'Luxury editorial', description: 'Polished and restrained, grounded in visible details.', icon: 'diamond' },
    { id: 'brisk', label: 'Brisk agent reel', description: 'Concise, energetic copy for a quick social story.', icon: 'bolt' },
    { id: 'investor', label: 'Fact-forward', description: 'Emphasize verified practical property information.', icon: 'analytics' },
  ];
  readonly wizardPhotos = signal<BoardWizardPhoto[]>([]);
  readonly wizardPhotosLoading = signal(false);
  readonly wizardPhotoError = signal<string | null>(null);
  readonly wizardPhotoStoryMode = signal<BoardPhotoStoryMode | null>(null);
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
  readonly nearbyGemRange = signal<NearbyGemRange>('walk');
  readonly nearbyGemLocation = signal<NearbyGemLocation | null>(null);
  readonly nearbyGemManualLocation = signal('');
  readonly nearbyGemDetails = signal('');
  readonly nearbyGemUseManualLocation = signal(false);
  readonly nearbyGemLocating = signal(false);
  readonly nearbyGemLocationError = signal<string | null>(null);
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
  readonly wizardImageProgress = signal<{ completed: number; total: number } | null>(null);
  readonly wizardImageNotice = signal<string | null>(null);
  readonly wizardVideoLoadingCardIds = signal<Set<string>>(new Set());
  readonly wizardVideoNotice = signal<string | null>(null);
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
  readonly wizardSaveDestination = signal<'board' | 'studio'>('board');
  readonly wizardPhotoStudioNotice = signal('');
  readonly wizardDrafts = signal<BoardWizardDraft[]>([]);
  readonly wizardActiveDraftId = signal<string | null>(null);
  readonly wizardDraftSaveState = signal<BoardWizardDraftSaveState>('idle');
  readonly wizardDraftSavedAt = signal('');
  readonly wizardDraftDiscardCandidateId = signal<string | null>(null);
  readonly wizardDraftDiscarding = signal(false);
  readonly songDeckIndex = signal(0);
  readonly songPreviewPlayingKey = signal<string | null>(null);
  readonly songPreviewError = signal<string | null>(null);
  readonly stackStudioOpen = signal(false);
  readonly stackStudioBoardId = signal<string | null>(null);
  readonly stackSelectedCardIds = signal<Set<string>>(new Set());
  readonly stackCoverTitle = signal('');
  readonly stackCoverSubtitle = signal('');
  readonly stackCoverImageDraft = signal('');
  readonly stackCoverOriginalSnapshot = signal('');
  readonly stackCoverSaving = signal(false);
  readonly stackCoverImageUploading = signal(false);
  readonly stackCoverSavedAt = signal('');
  readonly stackCoverError = signal<string | null>(null);
  readonly stackCaption = signal('');
  readonly stackFormat = signal<StackFormat>('both');
  readonly stackRatio = signal<StackRatio>('vertical');
  readonly stackAudioTrackId = signal(DEFAULT_STACK_AUDIO_TRACK_ID);
  readonly stackAudioVolume = signal(DEFAULT_STACK_AUDIO_VOLUME);
  readonly stackAudioPreviewingId = signal<string | null>(null);
  readonly stackAudioPreviewLoadingId = signal<string | null>(null);
  readonly stackAudioError = signal<string | null>(null);
  readonly stackVideoNarrationEnabled = signal(true);
  readonly stackTrailerNarrationEnabled = signal(true);
  readonly stackNarratorVoiceId = signal(DEFAULT_STACK_NARRATOR_VOICE_ID);
  readonly stackVoicePreviewingId = signal<string | null>(null);
  readonly stackVoicePreviewLoadingId = signal<string | null>(null);
  readonly stackVoiceError = signal<string | null>(null);
  readonly stackVoiceLibraryOpen = signal(false);
  readonly stackVoiceLibrarySearchQuery = signal('');
  readonly stackVoiceLibraryFilter = signal<StackVoiceLibraryFilter>('All');
  readonly stackSoundTab = signal<StackSoundTab>('voice');
  readonly stackScriptBoardTitle = signal('');
  readonly stackScriptBoardDescription = signal('');
  readonly stackScriptCardDrafts = signal<Record<string, StackScriptCardDraft>>({});
  readonly stackScriptOriginalSnapshot = signal('');
  readonly stackScriptExpandedCardIds = signal<Set<string>>(new Set());
  readonly stackScriptSaving = signal(false);
  readonly stackPhotoDraftPublishing = signal(false);
  readonly stackScriptSavedAt = signal('');
  readonly stackScriptError = signal<string | null>(null);
  readonly stackScriptPreviewLoadingCardId = signal<string | null>(null);
  readonly stackScriptRegeneratingCardId = signal<string | null>(null);
  readonly stackScriptShortenMenuOpen = signal(false);
  readonly stackScriptShortening = signal(false);
  readonly stackScriptShortenUndoNarrations = signal<Record<string, string> | null>(null);
  readonly stackScriptLengthSourceNarrations = signal<Record<string, string>>({});
  readonly stackScriptShortenNotice = signal<string | null>(null);
  readonly stackScriptDiscardConfirmOpen = signal(false);
  readonly stackDocsExportDialogOpen = signal(false);
  readonly stackDocsExportDocumentTitle = signal('');
  readonly stackDocsExportIncludeCover = signal(true);
  readonly stackDocsExportIncludeAllImages = signal(true);
  readonly stackDocsExportIncludeFinalCard = signal(true);
  readonly stackDocsExportIncludeProductionNotes = signal(true);
  readonly stackDocsExporting = signal(false);
  readonly stackDocsExportPhase = signal<DocxExportPhase | null>(null);
  readonly stackDocsExportError = signal<string | null>(null);
  readonly stackDocsExportResult = signal<DocxExportResult | null>(null);
  readonly stackFinalScreenHeadline = signal('Keep exploring');
  readonly stackFinalScreenMessage = signal('');
  readonly stackFinalScreenShowQrCode = signal(true);
  readonly stackFinalScreenImage = signal<StackVideoClosingImage>('cover');
  readonly stackFinalScreenCustomImageUrl = signal('');
  readonly stackFinalScreenImageUploading = signal(false);
  readonly stackFinalScreenDurationSeconds = signal(3);
  readonly stackFinalScreenOriginalSnapshot = signal('');
  readonly stackFinalScreenSaving = signal(false);
  readonly stackFinalScreenError = signal<string | null>(null);
  readonly stackVideoBrandingMode = signal<StackVideoBrandingMode>('livingwiki');
  readonly stackVideoBrandingLogoUrl = signal('');
  readonly stackVideoBrandingSaving = signal(false);
  readonly stackVideoBrandingUploading = signal(false);
  readonly stackVideoBrandingLoading = signal(false);
  readonly stackVideoBrandingUpdatedAt = signal('');
  readonly stackVideoBrandingError = signal<string | null>(null);
  readonly stackVideoBrandingUpgradeOpen = signal(false);
  readonly personalNarratorVoice = signal<PersonalNarratorVoice | null>(null);
  readonly personalNarratorVoices = signal<PersonalNarratorVoice[]>([]);
  readonly personalVoiceDefaultId = signal<string | null>(null);
  readonly personalVoiceLibraryVersion = signal(1);
  readonly personalVoiceLimit = signal<number | null>(1);
  readonly personalVoiceServerCanAdd = signal(true);
  readonly personalVoiceCanAdd = computed(() =>
    (this.personalNarratorVoices().length === 0 || this.personalVoiceLibraryVersion() >= 2)
      && (this.authService.isAdmin() || this.personalVoiceServerCanAdd()),
  );
  readonly personalVoicePaid = signal(false);
  readonly personalVoiceLoading = signal(false);
  readonly personalVoiceServerEligible = signal<boolean | null>(null);
  readonly personalVoiceSetupOpen = signal(false);
  readonly personalVoiceSetupVoiceId = signal<string | null>(null);
  readonly personalVoiceName = signal('My voice');
  readonly personalVoiceFile = signal<File | null>(null);
  readonly personalVoiceDurationSeconds = signal(0);
  readonly personalVoiceRecording = signal(false);
  readonly personalVoiceRecordingSeconds = signal(0);
  readonly personalVoiceOwnVoiceConfirmed = signal(false);
  readonly personalVoiceConsentConfirmed = signal(false);
  readonly personalVoiceCreating = signal(false);
  readonly personalVoiceDeleting = signal(false);
  readonly personalVoiceDeletingId = signal<string | null>(null);
  readonly personalVoiceError = signal<string | null>(null);
  readonly stackFrameIndex = signal(0);
  readonly stackCardPhotoIndex = signal(0);
  readonly stackPlaying = signal(false);
  readonly stackShareMessage = signal<string | null>(null);
  readonly stackVideoExporting = signal(false);
  readonly stackVideoProgress = signal(0);
  readonly stackVideoVerticalProgress = signal(0);
  readonly stackVideoLandscapeProgress = signal(0);
  readonly stackVideoRenderingRatio = signal<StackDeliveryRatio | null>(null);
  readonly stackSharePreviewRatio = signal<StackDeliveryRatio>('vertical');
  readonly stackPublishedVideoLoading = signal(false);
  readonly stackPublishedVideoReady = signal(false);
  readonly stackPublishedTrailerLoading = signal(false);
  readonly stackPublishedTrailerReady = signal(false);
  readonly stackShareMode = signal<StackShareMode>('trailer');
  readonly stackDirectView = signal(false);
  readonly stackExpandedCardId = signal<string | null>(null);
  readonly stackShareDialogOpen = signal(false);
  readonly boardForkingId = signal<string | null>(null);
  readonly stackFrameDurationMs = 4200;
  readonly stackActiveFrameDurationMs = signal(this.stackFrameDurationMs);
  readonly tourWayfindersShown = signal(false);
  readonly tourBoardView = signal<TourBoardView>('route');
  readonly tourPublicPreview = signal(false);
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
  readonly cardVideoViewerCardId = signal<string | null>(null);
  readonly cardVideoRepairing = signal(false);
  readonly cardVideoRepairNotice = signal<string | null>(null);
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
    youtubeReference: '',
    youtubeVideoId: '',
    youtubeVideoTitle: '',
    youtubeChannelTitle: '',
    youtubeThumbnailUrl: '',
    youtubeDurationSeconds: 0,
    youtubeMatchConfidence: 0,
    youtubeVerifiedAt: '',
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
    return findResolvedBoardRoute(this.boards(), this.selectedBoardId());
  });
  private readonly boardRouteLoadState = signal(beginBoardRouteLoad(0, null));
  private readonly boardRouteUnavailableReady = signal(false);
  readonly boardRouteLoading = computed(() =>
    !!this.selectedBoardId()
    && !this.originalSelectedBoard()
    && (!this.boardRouteLoadState().complete || !this.boardRouteUnavailableReady())
    && !this.privateBoardBlocked(),
  );
  readonly boardRouteUnavailable = computed(() =>
    !!this.selectedBoardId()
    && !this.originalSelectedBoard()
    && this.boardRouteLoadState().complete
    && this.boardRouteUnavailableReady()
    && !this.privateBoardBlocked(),
  );
  private readonly publicOwnerRouteResolving = signal(false);
  private readonly publicOwnerRouteEmptyReady = signal(false);
  readonly publicOwnerRouteLoading = computed(() =>
    !!this.publicOwnerKey()
    && (
      this.publicOwnerRouteResolving()
      || this.boardsLoading()
      || (!this.boards().length && !this.publicOwnerRouteEmptyReady())
    ),
  );
  readonly selectedBoardParent = computed(() => {
    const board = this.originalSelectedBoard();
    return board?.parentBoardId
      ? this.boards().find((candidate) => candidate.id === board.parentBoardId) ?? null
      : null;
  });
  readonly boardDialogInsideContext = computed<BoardInsideContext | null>(() => {
    const creating = this.creatingBoardInside();
    if (creating) {
      return creating;
    }
    const editingId = this.editingBoardId();
    const board = editingId ? this.boards().find((candidate) => candidate.id === editingId) : null;
    if (!board?.parentBoardId || !board.parentCardId) {
      return null;
    }
    return {
      parentBoardId: board.parentBoardId,
      parentCardId: board.parentCardId,
      parentBoardTitle: board.parentBoardTitle || 'Parent board',
      parentCardTitle: board.parentCardTitle || 'Parent card',
    };
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
  readonly selectedNearbyGemsCardViews = computed(() => {
    const board = this.selectedBoard();
    return board && this.isNearbyGemsBoard(board) ? this.nearbyGemsCardViews(board) : [];
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
    const editingBoardId = this.editingCardBoardId();
    return cardId
      ? this.boards().find((board) => board.id === editingBoardId)?.cards.find((card) => card.id === cardId) ?? null
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
  readonly boardLearnCards = computed(() => this.boardLearnBoard()?.cards.filter((card) => !this.isTalkingCard(card)) ?? []);
  readonly boardLearnStudyCard = computed(() => {
    const cards = this.boardLearnCards();
    if (!cards.length) {
      return null;
    }
    return cards[Math.min(this.boardLearnStudyIndex(), cards.length - 1)] ?? null;
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
  readonly cardVideoViewerCard = computed(() => {
    const cardId = this.cardVideoViewerCardId();
    const board = this.selectedBoard();
    return board?.cards.find((card) => card.id === cardId)
      ?? board?.cards.flatMap((card) => this.relatedCardsFor(card)).find((card) => card.id === cardId)
      ?? this.wizardPreviewCards().find((card) => card.id === cardId)
      ?? null;
  });
  readonly selectedBoardTitle = computed(() => this.selectedBoard()?.title ?? $localize`Card`);
  readonly isSongCardForm = computed(() => {
    const board = this.selectedBoard();
    return !!board && this.isSongBoard(board);
  });
  readonly canManageBoardFriends = computed(() => this.isOwnBoardsProfile());
  readonly canCreateBoard = computed(() => this.isOwnBoardsProfile());
  readonly canCreateCollection = computed(() => this.isOwnBoardsProfile());
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
  readonly boardsProfileBoard = computed(() =>
    this.boards().find((board) => !board.parentCardId && board.ownerUserId)
      ?? this.boards().find((board) => board.ownerUserId)
      ?? null,
  );
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

  readonly collectionOwnerPublicSlug = computed(() =>
    this.boardsProfileBoard()?.ownerPublicSlug
      || this.publicOwnerSlug()
      || this.currentPublicOwnerKey(),
  );
  readonly collectionOwnerProfileIcon = computed(() =>
    this.boardsProfileBoard()?.ownerProfileIcon
      || this.profile()?.profileIcon
      || '',
  );
  readonly collectionOwnerProfilePictureType = computed(() =>
    this.publicOwnerKey()
      ? this.boardsProfileBoard()?.ownerProfilePictureType ?? null
      : this.profile()?.profilePictureType ?? null,
  );
  readonly collectionBoardChoices = computed<BoardCollectionChoice[]>(() => {
    const uid = this.authService.uid();
    return this.boards()
      .filter((board) => !board.parentCardId && board.visibility === 'public' && board.ownerUserId === uid)
      .sort((left, right) => this.compareBoards(left, right))
      .map((board) => ({
        id: board.id,
        title: board.title,
        description: board.description,
        imageUrl: board.imageUrl,
        icon: this.boardDisplayIcon(board),
        tone: board.tone,
        kind: board.kind,
        cardCount: board.cards.length,
      }));
  });
  readonly filteredBoardCollections = computed(() => {
    const search = this.boardSearch().trim().toLowerCase();
    if (!search) return this.boardCollections();
    return this.boardCollections().filter((collectionItem) =>
      [collectionItem.title, collectionItem.description, collectionItem.ownerDisplayName]
        .join(' ')
        .toLowerCase()
        .includes(search),
    );
  });

  readonly filteredBoards = computed(() => {
    const query = this.boardSearch().trim().toLowerCase();
    const boards = [...this.boards()]
      .filter((board) => !board.parentCardId)
      .filter((board) => board.visibility === 'public' || this.canEditBoard(board))
      .filter((board) => !this.songsPage() || this.isSongBoard(board))
      .filter((board) => !this.tripsPage() || this.isTourBoard(board))
      .filter((board) => this.activeGalleryTab() === 'private'
        ? board.visibility === 'private'
        : !this.publicOwnerKey() || board.visibility === 'public')
      .sort((a, b) => this.compareBoardGallerySelection(a, b));
    if (!query) {
      return boards;
    }

    return boards.filter((board) =>
      [
        board.title,
        board.description,
        board.backNote,
        board.summarySearchText,
        board.cards.map((card) => card.title).join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  });

  readonly displayedBoards = computed(() =>
    incrementalSlice(this.filteredBoards(), this.galleryVisibleLimit()),
  );

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
        : cardsForBoardInsideDisplay(
            board.id,
            board.cards,
            this.boards(),
            board.insideCardsDisplay,
            this.activeAlongsideBoardIds(),
          );
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
    this.boards()
      .filter((board) => !board.parentCardId)
      .flatMap((board) => board.cards.map((card) => ({ card, board }))),
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

  readonly displayedGalleryCards = computed(() =>
    incrementalSlice(this.visibleGalleryCards(), this.galleryVisibleLimit()),
  );
  readonly galleryHasMore = computed(() => {
    if (this.activeGalleryTab() === 'collections' || this.activeGalleryTab() === 'private') return false;
    const visibleCount = this.activeGalleryTab() === 'boards' || this.activeGalleryTab() === 'private'
      ? this.displayedBoards().length
      : this.displayedGalleryCards().length;
    const availableCount = this.activeGalleryTab() === 'boards' || this.activeGalleryTab() === 'private'
      ? this.filteredBoards().length
      : this.visibleGalleryCards().length;
    return visibleCount < availableCount || this.boardsHasMore();
  });

  readonly totalCards = computed(() =>
    this.boards()
      .filter((board) => !board.parentCardId)
      .reduce((total, board) => total + this.boardCardCount(board), 0),
  );
  readonly favoriteCards = computed(() =>
    this.boards().filter((board) => !board.parentCardId).reduce(
      (total, board) => total + this.boardFavoriteCardCount(board),
      0,
    ),
  );
  readonly boardsCountLabel = computed(() =>
    `${this.boards().length}${this.boardsHasMore() ? '+' : ''}`,
  );
  readonly cardsCountLabel = computed(() =>
    `${this.totalCards()}${this.boardsHasMore() ? '+' : ''}`,
  );
  readonly favoritesCountLabel = computed(() =>
    `${this.favoriteCards()}${this.boardsHasMore() ? '+' : ''}`,
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
  readonly wizardLockedTargetBoard = computed(() => {
    const boardId = this.wizardLockedTargetBoardId();
    return boardId ? this.boards().find((board) => board.id === boardId) ?? null : null;
  });
  readonly wizardAvailableModes = computed(() => {
    const board = this.wizardLockedTargetBoard();
    return board ? this.boardBuildModes(board) : this.wizardModes;
  });
  readonly wizardDoorwayModes = computed<BoardWizardDoorwayOption[]>(() => {
    const availableModes = new Map(this.wizardAvailableModes().map((mode) => [mode.id, mode]));
    return BOARD_WIZARD_DOORWAY_ORDER.flatMap((id): BoardWizardDoorwayOption[] => {
      if (id === 'real-estate' || id === 'rental-properties') {
        if (this.wizardLockedTargetBoard() || !availableModes.has('url')) return [];
        const isRental = id === 'rental-properties';
        return [{
          id,
          mode: 'url',
          label: isRental ? 'Rental Property TalkThru Wizard' : 'Real Estate TalkThru Wizard',
          description: isRental
            ? 'Easily launch a unique rental listing as a personal, engaging TalkThru.'
            : 'Create a personal, engaging TalkThru—not a static photo-by-photo walkthrough.',
          icon: isRental ? 'key' : 'home_work',
          eyebrow: 'TalkThru Wizard',
          actionLabel: isRental ? 'Launch a rental' : 'Launch a listing',
          talkThru: true,
          ...BOARD_WIZARD_DOORWAY_VISUALS[id],
        }];
      }
      const mode = availableModes.get(id);
      if (!mode) return [];
      return [{
        ...mode,
        id,
        mode: mode.id,
        ...BOARD_WIZARD_DOORWAY_VISUALS[id],
      }];
    });
  });
  readonly wizardActiveDoorwayIndex = computed(() => {
    const modes = this.wizardDoorwayModes();
    const selectedIndex = modes.findIndex((mode) => mode.id === this.wizardDoorwayId());
    return selectedIndex >= 0 ? selectedIndex : 0;
  });
  readonly wizardActiveDoorway = computed(() =>
    this.wizardDoorwayModes()[this.wizardActiveDoorwayIndex()] ?? null,
  );
  readonly wizardDoorwaySlides = computed(() => {
    const modes = this.wizardDoorwayModes();
    const activeIndex = this.wizardActiveDoorwayIndex();
    return modes
      .map((option, index) => ({
        option,
        offset: boardWizardDoorwayOffset(index, activeIndex, modes.length),
      }))
      .filter((slide) => Math.abs(slide.offset) <= 1)
      .sort((left, right) => left.offset - right.offset);
  });
  readonly wizardMediaModeLabel = computed(() => this.wizardMediaModes
    .find((mode) => mode.id === this.wizardMediaMode())?.label ?? 'Images only');
  readonly wizardDefaultTypeLabel = computed(() => this.cardTypes
    .find((type) => type.id === this.wizardDefaultType())?.label ?? 'Place');
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
  readonly wizardImageEnrichmentActive = computed(() => {
    return isBoardWizardImageEnrichmentActive(this.wizardImageProgress());
  });
  readonly wizardImagesPreparing = computed(() =>
    isBoardWizardImagePreparationActive(
      this.wizardImageProgress(),
      this.wizardImageLoadingCardIds().size,
    ),
  );
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
  readonly visibleManageCardCount = computed(() => {
    const board = this.originalSelectedBoard();
    if (!board) {
      return 0;
    }
    const primaryCardIds = new Set(board.cards.map((card) => card.id));
    return this.filteredCards().filter((card) => primaryCardIds.has(card.id)).length;
  });
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
    const directView = this.stackDirectView();
    const board = directView ? this.selectedBoard() : this.stackBoard();
    if (!board) {
      return [];
    }
    // Live View is the complete board experience. A board can first arrive as
    // a one-card collection preview and then be replaced by its full record;
    // never let that temporary selection limit the public Stack.
    if (directView) {
      return cardsForStackView(board.cards, this.stackSelectedCardIds(), true);
    }
    return cardsForStackView(board.cards, this.stackSelectedCardIds(), false);
  });
  readonly selectedBoardCity = computed(() => {
    const board = this.selectedBoard();
    return board ? this.cityForBoard(board) : null;
  });
  readonly stackScriptDirty = computed(() => this.stackScriptSnapshot() !== this.stackScriptOriginalSnapshot());
  readonly stackCoverDirty = computed(() => this.stackCoverSnapshot() !== this.stackCoverOriginalSnapshot());
  readonly stackScriptWordCount = computed(() => this.stackSelectedCards().reduce((total, card) => {
    return total + this.stackScriptNarration(card).split(/\s+/).filter(Boolean).length;
  }, 0));
  readonly stackScriptEstimatedSeconds = computed(() => Math.max(0, Math.ceil(this.stackScriptWordCount() / 2.35)));
  readonly stackScriptMissingCount = computed(() => this.stackSelectedCards().filter((card) => !this.stackScriptNarration(card).trim()).length);
  readonly stackScriptCanSave = computed(() => {
    const board = this.stackBoard();
    return (this.stackScriptDirty() || this.stackCoverDirty())
      && !this.stackScriptSaving()
      && !this.stackCoverSaving()
      && !!this.stackScriptBoardTitle().trim()
      && (this.stackScriptMissingCount() === 0 || (!!board && this.isPhotoStudioDraft(board)));
  });
  readonly stackFinalScreenDirty = computed(() =>
    this.stackFinalScreenSnapshot() !== this.stackFinalScreenOriginalSnapshot(),
  );
  readonly stackStudioDirty = computed(() =>
    this.stackScriptDirty() || this.stackCoverDirty() || this.stackFinalScreenDirty(),
  );
  readonly stackSelectedAudioTrack = computed(() =>
    stackAudioTrackById(this.stackAudioTrackId()),
  );
  readonly stackAudioVolumePercent = computed(() =>
    Math.round(this.stackAudioVolume() * 100),
  );
  readonly stackSelectedNarratorVoice = computed(() =>
    stackNarratorVoiceById(this.stackNarratorVoiceId()),
  );
  readonly stackFilteredNarratorVoices = computed(() => {
    return filterStackNarratorVoices(
      this.stackNarratorVoices,
      this.stackVoiceLibrarySearchQuery(),
      this.stackVoiceLibraryFilter(),
    );
  });
  readonly stackVisibleNarratorVoices = computed(() => this.stackFilteredNarratorVoices());
  readonly stackSelectedNarratorName = computed(() =>
    !this.stackVideoNarrationEnabled()
      ? $localize`No narration`
      : isPersonalStackNarratorVoiceId(this.stackNarratorVoiceId())
      ? this.personalVoiceForNarratorId(this.stackNarratorVoiceId())?.name || $localize`Your voice`
      : this.stackSelectedNarratorVoice()?.name || $localize`Warm Storyteller`,
  );
  readonly personalVoiceEligible = computed(() =>
    this.personalVoiceServerEligible()
      ?? !!this.authService.uid(),
  );
  readonly videoBrandingEligible = computed(() =>
    this.authService.isAdmin() || this.authService.hasActivePersonalWikiPlan(),
  );
  readonly stackVideoBrandingSummary = computed(() => {
    const mode = this.stackVideoBrandingMode();
    if (!this.videoBrandingEligible() && mode !== 'livingwiki') return 'LivingWiki logo · membership required to change';
    if (mode === 'none') return 'No corner logo';
    if (mode === 'custom') return 'Your logo';
    return 'LivingWiki logo';
  });
  readonly personalVoiceReady = computed(() => this.personalNarratorVoices().length > 0);
  readonly personalVoiceUsageLabel = computed(() => {
    const count = this.personalNarratorVoices().length;
    const limit = this.personalVoiceLimit();
    if (count > 0 && this.personalVoiceLibraryVersion() < 2) return `${count} voice · update required`;
    return this.authService.isAdmin() || limit === null
      ? `${count} · Admin unlimited`
      : `${count} of ${limit}`;
  });
  readonly personalVoiceFileLabel = computed(() => {
    const file = this.personalVoiceFile();
    if (!file) return $localize`No recording selected`;
    const duration = this.personalVoiceDurationSeconds();
    return duration > 0 ? `${file.name} · ${Math.round(duration)}s` : file.name;
  });
  readonly stackHasTourNarration = computed(() => this.stackSelectedCards().some((card) => !!card.tour));
  readonly stackSelectedCount = computed(() => this.stackSelectedCards().length);
  readonly stackFrames = computed<StackFrame[]>(() => {
    const board = this.stackDirectView() ? this.selectedBoard() : this.stackBoard();
    const baseFrames = buildStackStoryFrames(this.stackSelectedCards(), this.isTourBoard(board));
    return baseFrames.map((frame, index) => ({
      ...frame,
      index,
      total: baseFrames.length,
    })) as StackFrame[];
  });
  readonly stackFrameCount = computed(() => this.stackFrames().length);
  readonly stackProgressFrames = computed(() =>
    Array.from({ length: this.stackFrameCount() }, (_item, index) => index),
  );
  readonly stackCurrentFrame = computed<StackFrame>(() => {
    return this.stackFrameAtIndex(this.stackFrameIndex());
  });
  readonly stackCurrentCard = computed<BoardCard | null>(() => {
    const frame = this.stackCurrentFrame();
    return frame.kind === 'card' ? frame.card : null;
  });
  readonly stackCurrentCardPresentationImages = computed(() => {
    const card = this.stackCurrentCard();
    return card ? listingCardPresentationImages(card) : [];
  });
  readonly stackCurrentCardImage = computed(() => {
    const images = this.stackCurrentCardPresentationImages();
    const index = Math.max(0, Math.min(this.stackCardPhotoIndex(), images.length - 1));
    return images[index] || '';
  });
  readonly stackCurrentNarrationFrame = computed<StackFrame | null>(() => {
    const frame = this.stackCurrentFrame();
    if (frame.kind === 'card' && this.isTalkingCard(frame.card)) return null;
    return frame.kind === 'card' || frame.kind === 'handoff' ? frame : null;
  });
  readonly stackTourNarrationConsent = signal(false);
  readonly selectedBoardTourCards = computed(() => this.tourCards(this.selectedBoard()));
  readonly selectedTourCard = computed(() => {
    const cards = this.selectedBoardTourCards();
    const selectedId = this.selectedTourCardId();
    return cards.find((card) => card.id === selectedId) ?? cards[0] ?? null;
  });
  readonly selectedTourCardIndex = computed(() => {
    const selected = this.selectedTourCard();
    return selected
      ? Math.max(0, this.selectedBoardTourCards().findIndex((card) => card.id === selected.id))
      : -1;
  });
  readonly tourStudioActive = computed(() => {
    const board = this.selectedBoard();
    return this.isTourBoard(board) && this.canEditBoard(board) && !this.tourPublicPreview();
  });
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
    if (mode === 'nearby-gems') {
      return this.nearbyGemManualLocation().trim().length >= 2 && !this.nearbyGemLocating();
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
    effect(() => {
      const count = this.wizardCountIntent().count ?? this.wizardCount();
      if (this.wizardNarrationLengthCustomized()) return;
      const budgeted = boardNarrationBudgetedSecondsPerCard(
        count,
        DEFAULT_BOARD_NARRATION_SECONDS_PER_CARD,
      );
      if (this.wizardNarrationSecondsPerCard() !== budgeted) {
        this.wizardNarrationSecondsPerCard.set(budgeted);
      }
    });
    effect(() => {
      const targets = this.boards().flatMap((board) => [
        { boardId: board.id },
        ...board.cards.map((card) => ({ boardId: board.id, cardId: card.id })),
      ] satisfies BoardLikeTarget[]);
      const signature = targets.map(boardLikeTargetKey).sort().join('|');
      if (!signature || signature === this.likeMetricsSignature) return;
      this.likeMetricsSignature = signature;
      void this.syncLikeMetrics(targets);
    });
    effect(() => {
      const card = this.stackCurrentCard();
      if (this.stackDirectView() && this.stackPlaying() && this.isTalkingCard(card)) {
        this.stopStackPlayback();
      }
    });
    this.route.paramMap.subscribe((params) => {
      const routePath = this.route.snapshot.routeConfig?.path ?? '';
      this.friendsPage.set(routePath === 'friends');
      this.songsPage.set(routePath.startsWith('songs'));
      this.tripsPage.set(routePath.startsWith('trips'));
      const boardId = params.get('boardId');
      const boardRouteLoadId = ++this.boardRouteLoadSequence;
      this.tourPublicPreview.set(false);
      this.cancelBoardRouteUnavailableReveal();
      this.boardRouteLoadState.set(beginBoardRouteLoad(boardRouteLoadId, boardId));
      if (!boardId) this.boardAnalytics.stopBoardSession();
      const loadedRouteBoard = boardId
        ? this.boards().find((board) => customPublicUrlRouteMatches(
          boardId,
          board.id,
          board.customSlug ?? '',
        )) ?? null
        : null;
      const selectedBoardId = loadedRouteBoard?.id ?? boardId;
      const ownerKey = params.get('ownerKey');
      const ownerUid = this.publicOwnerUidFromKey(ownerKey);
      const ownerSlug = this.publicOwnerSlugFromKey(ownerKey);
      this.cancelPublicOwnerRouteEmptyReveal();
      this.publicOwnerRouteResolving.set(ownerKey !== null);
      this.publicOwnerRouteEmptyReady.set(ownerKey === null);
      if (this.selectedBoardId() !== selectedBoardId) {
        this.activeAlongsideBoardIds.set(new Set());
        this.exploredRelatedCardParentId.set(null);
        this.relatedCardEditorOpen.set(false);
        this.relatedCardParentId.set(null);
        this.relatedCardEditingId.set(null);
        this.relatedCardDeleteCandidateId.set(null);
        this.relatedCardsReturnSearch = '';
      }
      this.selectedBoardId.set(selectedBoardId);
      if (boardId) {
        this.resetBoardRouteScroll();
      }
      if (this.boardTranslationResult()?.boardId !== selectedBoardId) {
        this.boardTranslationResult.set(null);
        this.boardTranslationVersion.set('');
        this.boardTranslationError.set(null);
      }
      this.publicOwnerKey.set(ownerKey);
      this.publicOwnerUid.set(ownerUid);
      this.publicOwnerSlug.set(ownerSlug);
      this.boardCollections.set([]);
      this.boardCollectionsError.set(null);
      this.cardSearch.set('');
      this.galleryVisibleLimit.set(BOARD_GALLERY_PAGE_SIZE);
      this.closeCardManageMode();
      this.setShareMessage(null);
      this.sharePanelOpen.set(false);
      this.songDeckIndex.set(0);
      // Route changes are not an in-Studio close action. Always clear Studio state
      // silently so its unsaved-draft safeguard cannot leak onto another page.
      this.closeStackStudioImmediately();
      void this.loadBoards(boardId, ownerUid, ownerSlug, ownerKey !== null).then(() => {
        // Server rendering cannot resolve Firestore-backed board routes. Keep the
        // neutral loading shell in SSR output so hydration never flashes a false
        // "Board unavailable" message before the browser lookup begins.
        if (!this.isBrowser || boardRouteLoadId !== this.boardRouteLoadSequence) {
          return;
        }
        if (ownerKey !== null) {
          this.publicOwnerRouteResolving.set(false);
          this.schedulePublicOwnerRouteEmptyReveal(boardRouteLoadId);
        } else {
          this.publicOwnerRouteResolving.set(false);
          this.publicOwnerRouteEmptyReady.set(true);
        }
        this.boardRouteLoadState.update((state) => completeBoardRouteLoad(state, boardRouteLoadId));
        if (!boardId && !this.friendsPage()) {
          void this.loadBoardCollections(ownerKey || ownerSlug || this.currentPublicOwnerKey());
        }
        const resolvedBoard = boardId ? this.originalSelectedBoard() : null;
        if (boardId && !resolvedBoard && !this.privateBoardBlocked()) {
          this.scheduleBoardRouteUnavailableReveal(boardRouteLoadId);
        }
        if (!boardId || resolvedBoard) {
          this.watchSelectedBoard(resolvedBoard?.id ?? null);
        }
        this.syncStackDirectView();
        this.syncRequestedStackStudio();
        this.syncRequestedStackShare();
        this.syncBoardLearnDirectView();
        void this.syncRequestedBoardTranslation();
        this.canonicalizeBoardsRootRoute(boardId, ownerKey);
        if (boardId) {
          this.resetBoardRouteScroll();
        }
        if (this.isBrowser && this.boardFriendsFocusRequested()) {
          window.setTimeout(() => this.scrollToBoardFriends(), 80);
        }
      });
    });

    this.route.queryParamMap.subscribe((params) => {
      const view = params.get('view') ?? params.get('stack');
      const wantsFriends = params.get('friends') === '1';
      const wantsStack = view === 'stack' || view === 'reel';
      if (params.get('create') === 'gems' && !this.nearbyGemsQueryConsumed) {
        this.nearbyGemsQueryConsumed = true;
        if (this.isBrowser) void this.openNearbyGemsWizard();
      }
      this.stackAutoplayRequested.set(params.get('autoplay') === '1');
      this.stackStudioDirectRequested = params.get('studio') === 'video';
      if (!this.stackStudioDirectRequested) {
        this.stackStudioDirectOpenedFor = '';
      }
      this.stackShareDirectRequested = params.get('share') === 'video';
      if (!this.stackShareDirectRequested) {
        this.stackShareDirectOpenedFor = '';
      }
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
      this.syncRequestedStackStudio();
      this.syncRequestedStackShare();
      if (this.isBrowser && wantsFriends) {
        window.setTimeout(() => this.scrollToBoardFriends(), 120);
      }
      if (this.boardLearnDirectRequested) {
        this.syncBoardLearnDirectView();
      }
      void this.syncRequestedBoardTranslation();
    });

    effect(() => {
      if (!this.stackAutoplayRequested() || !this.stackDirectView() || !this.selectedBoard()) {
        return;
      }
      // Consume the request once so a visitor can still pause the Stack later.
      this.stackAutoplayRequested.set(false);
      this.stackTourNarrationConsent.set(true);
      this.startStackPlayback();
    });

    effect(() => {
      const boards = this.boards();
      if (!this.isBrowser || !this.hasLoaded || this.boardsLoading() || this.boardsHasMore()) {
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
      const cards = this.tourCards(board);
      const selectedId = this.selectedTourCardId();
      if (!this.isTourBoard(board)) {
        if (selectedId) this.selectedTourCardId.set(null);
        return;
      }
      if (!cards.some((card) => card.id === selectedId)) {
        this.selectedTourCardId.set(cards[0]?.id ?? null);
      }
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
      if (!this.isBrowser || !this.firestore || !uid) {
        this.wizardDraftsLoadedForUid = '';
        this.wizardDrafts.set([]);
        return;
      }
      if (this.wizardDraftsLoadedForUid === uid) {
        return;
      }
      this.wizardDraftsLoadedForUid = uid;
      void this.loadWizardDrafts(uid);
    });

    effect(() => {
      const snapshotKey = this.wizardDraftSnapshotKey();
      if (
        !snapshotKey
        || !shouldRetryBoardWizardDraftAutosave(snapshotKey, this.wizardDraftFailedSnapshotKey())
        || !shouldAutosaveBoardWizardDraft({
          step: this.wizardStep(),
          hasResult: !!this.wizardResult(),
          cardCount: this.wizardPreviewCards().length,
          saving: this.wizardSaving(),
          restoring: this.wizardDraftRestoreInProgress,
        })
      ) {
        return;
      }
      this.scheduleWizardDraftAutosave();
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

  ngAfterViewInit(): void {
    // On an initial page load the route subscription can run before the desktop
    // scroll viewport exists. Reset again once ViewChild is guaranteed to exist.
    if (this.selectedBoardId()) {
      this.resetBoardRouteScroll();
    }
  }

  @HostListener('window:pageshow')
  onBoardRoutePageShow(): void {
    // Browsers can restore an element's saved scroll position after Angular's
    // first render, especially when opening an email link or restoring from BFCache.
    if (this.selectedBoardId()) {
      this.resetBoardRouteScroll();
    }
  }

  ngOnDestroy(): void {
    this.docxExportService.release(this.stackDocsExportResult());
    this.wizardOffGridLocationRun += 1;
    this.boardLoadSequence += 1;
    this.boardRouteLoadSequence += 1;
    this.collectionLoadSequence += 1;
    this.cancelBoardRouteUnavailableReveal();
    this.cancelPublicOwnerRouteEmptyReveal();
    this.selectedBoardUnsubscribe?.();
    this.selectedBoardUnsubscribe = null;
    this.stopSongPreview();
    this.stopStackAudioPreview();
    this.stopStackVoicePreview();
    this.stopPersonalVoiceRecording(true);
    this.stopTourSpeech();
    this.stopStackPlayback();
    this.boardAnalytics.stopBoardSession();
    this.disposeStackNarrationAudio();
    if (this.boardFriendSearchTimer) {
      clearTimeout(this.boardFriendSearchTimer);
      this.boardFriendSearchTimer = null;
    }
    if (this.boardSearchTimer) {
      clearTimeout(this.boardSearchTimer);
      this.boardSearchTimer = null;
    }
    if (this.wizardDraftAutosaveTimer) {
      clearTimeout(this.wizardDraftAutosaveTimer);
      this.wizardDraftAutosaveTimer = null;
    }
    if (this.placeSearchTimer) {
      clearTimeout(this.placeSearchTimer);
      this.placeSearchTimer = null;
    }
    if (this.shareMessageTimer) {
      clearTimeout(this.shareMessageTimer);
      this.shareMessageTimer = null;
    }
    if (this.customUrlCopiedTimer) {
      clearTimeout(this.customUrlCopiedTimer);
      this.customUrlCopiedTimer = null;
    }
    if (this.stackShareMessageTimer) {
      clearTimeout(this.stackShareMessageTimer);
      this.stackShareMessageTimer = null;
    }
  }

  setGalleryTab(tab: BoardGalleryTab): void {
    if (tab === 'private' && this.publicOwnerKey() && !this.canCreateBoard()) return;
    this.activeGalleryTab.set(tab);
    this.boardSearch.set('');
    this.galleryVisibleLimit.set(BOARD_GALLERY_PAGE_SIZE);
    if (tab === 'cards' || tab === 'favorites') {
      void this.hydratePublicSummaryBoards();
    } else if (tab === 'private') {
      void this.hydratePrivateBoards();
    }
    this.scheduleGalleryViewportCheck();
  }

  private async hydratePrivateBoards(): Promise<void> {
    if (!this.firestore) return;
    await this.authService.waitForReady();
    const uid = this.authService.uid();
    if (!uid || this.activeGalleryTab() !== 'private') return;
    this.boardsLoading.set(true);
    try {
      const snapshot = await getDocs(query(
        collection(this.firestore, 'boards'),
        where('owner_user_id', '==', uid),
        where('visibility', '==', 'private'),
      ));
      if (this.activeGalleryTab() !== 'private') return;
      const privateBoards = snapshot.docs
        .map((boardDoc) => this.boardFromRecord(boardDoc.id, boardDoc.data()))
        .filter((board): board is Board => !!board);
      this.boards.update((boards) => {
        const boardsById = new Map(boards.map((board) => [board.id, board]));
        privateBoards.forEach((board) => boardsById.set(board.id, board));
        return [...boardsById.values()].sort((left, right) => this.compareGalleryBoards(left, right));
      });
      this.boardsSyncError.set(null);
    } catch (error) {
      console.error('Private boards load failed', error);
      this.boardsSyncError.set('Private boards could not be loaded. Refresh and try again.');
    } finally {
      this.boardsLoading.set(false);
      this.scheduleGalleryViewportCheck();
    }
  }

  private async hydratePublicSummaryBoards(): Promise<void> {
    if (!this.boards().some((board) => board.isSummary)) return;
    this.boardsLoading.set(true);
    try {
      while (this.boardsHasMore()) {
        const loaded = await this.loadNextBoardPage();
        if (!loaded) break;
      }
      const summaries = this.boards().filter((board) => board.isSummary);
      for (let index = 0; index < summaries.length; index += 4) {
        const batch = summaries.slice(index, index + 4);
        const hydrated = (await Promise.all(batch.map((board) => this.loadBoardById(board.id).catch(() => null))))
          .filter((board): board is Board => !!board);
        if (!hydrated.length) continue;
        const hydratedById = new Map(hydrated.map((board) => [board.id, board]));
        this.boards.update((boards) => boards.map((board) => hydratedById.get(board.id) ?? board));
      }
    } finally {
      this.boardsLoading.set(false);
      this.scheduleGalleryViewportCheck();
    }
  }

  setBoardGallerySort(value: string): void {
    if (value !== 'custom' && value !== 'recent' && value !== 'title') {
      return;
    }
    this.boardGallerySort.set(value);
    this.galleryVisibleLimit.set(BOARD_GALLERY_PAGE_SIZE);
    this.scheduleGalleryViewportCheck();
  }

  onBoardSearchInput(value: string): void {
    this.boardSearch.set(value);
    this.galleryVisibleLimit.set(BOARD_GALLERY_PAGE_SIZE);
    if (this.boardSearchTimer) {
      clearTimeout(this.boardSearchTimer);
      this.boardSearchTimer = null;
    }
    if (value.trim() && this.activeGalleryTab() !== 'collections') {
      this.boardSearchTimer = setTimeout(() => {
        this.boardSearchTimer = null;
        void this.loadRemainingBoardPagesForSearch();
      }, 250);
    } else {
      this.scheduleGalleryViewportCheck();
    }
  }

  onBoardsViewportScroll(event: Event): void {
    this.maybeLoadMoreForElement(event.currentTarget as HTMLElement);
  }

  @HostListener('window:scroll')
  onBoardsWindowScroll(): void {
    if (!this.isBrowser || this.selectedBoard() || this.friendsPage()) {
      return;
    }
    const documentElement = window.document.documentElement;
    if (incrementalViewportNearEnd(
      documentElement.scrollHeight,
      window.scrollY,
      window.innerHeight,
    )) {
      void this.loadMoreGalleryItems();
    }
  }

  async loadMoreGalleryItems(): Promise<void> {
    if (this.activeGalleryTab() === 'collections'
      || this.activeGalleryTab() === 'private'
      || this.boardsLoadingMore()
      || !this.galleryHasMore()) {
      return;
    }

    const requestedLimit = nextIncrementalLimit(this.galleryVisibleLimit(), BOARD_GALLERY_PAGE_SIZE);
    this.galleryVisibleLimit.set(requestedLimit);
    try {
      while (this.visibleGalleryItemCount() < requestedLimit && this.boardsHasMore()) {
        const loaded = await this.loadNextBoardPage();
        if (!loaded) {
          break;
        }
      }
    } catch {
      this.boardsHasMore.set(false);
      this.boardsSyncError.set('More boards could not be loaded. Check your connection and try again.');
    }
    this.scheduleGalleryViewportCheck();
  }

  private visibleGalleryItemCount(): number {
    if (this.activeGalleryTab() === 'collections') return this.filteredBoardCollections().length;
    return this.activeGalleryTab() === 'boards' || this.activeGalleryTab() === 'private'
      ? this.filteredBoards().length
      : this.visibleGalleryCards().length;
  }

  private maybeLoadMoreForElement(element: HTMLElement): void {
    if (this.selectedBoard() || this.friendsPage()) {
      return;
    }
    if (incrementalViewportNearEnd(element.scrollHeight, element.scrollTop, element.clientHeight)) {
      void this.loadMoreGalleryItems();
    }
  }

  private scheduleGalleryViewportCheck(): void {
    if (!this.isBrowser) {
      return;
    }
    window.requestAnimationFrame(() => {
      const viewport = this.boardsScrollViewport?.nativeElement;
      if (viewport && viewport.scrollHeight > viewport.clientHeight + 1) {
        this.maybeLoadMoreForElement(viewport);
        return;
      }
      this.onBoardsWindowScroll();
    });
  }

  async openCreateCollection(): Promise<void> {
    if (!this.canCreateCollection()) return;
    this.collectionCreateOpen.set(true);
    this.collectionChoicesLoading.set(true);
    try {
      while (this.boardsHasMore()) {
        const loaded = await this.loadNextBoardPage();
        if (!loaded) break;
      }
    } catch {
      this.boardsHasMore.set(false);
    } finally {
      this.collectionChoicesLoading.set(false);
    }
  }

  closeCreateCollection(): void {
    this.collectionCreateOpen.set(false);
  }

  onCollectionCreated(collectionItem: BoardCollection): void {
    this.boardCollections.update((items) => [collectionItem, ...items.filter((item) => item.id !== collectionItem.id)]);
    this.collectionCreateOpen.set(false);
    this.activeGalleryTab.set('collections');
    void this.router.navigate([
      '/boards/u',
      collectionItem.ownerPublicSlug,
      'collections',
      collectionItem.slug,
    ]);
  }

  private async loadRemainingBoardPagesForSearch(): Promise<void> {
    try {
      while (this.boardSearch().trim() && this.boardsHasMore()) {
        const loaded = await this.loadNextBoardPage();
        if (!loaded) {
          break;
        }
      }
    } catch {
      this.boardsHasMore.set(false);
      this.boardsSyncError.set('Search could not load the rest of the boards. Check your connection and try again.');
    } finally {
      this.scheduleGalleryViewportCheck();
    }
  }

  async openWizardDrafts(): Promise<void> {
    if (!this.isBrowser || !this.authService.isAuthenticated() || !this.wizardDrafts().length) {
      return;
    }
    this.activeGalleryTab.set('boards');
    this.boardSearch.set('');
    const viewingSomeoneElsesProfile = !!this.publicOwnerKey() && !this.canCreateBoard();
    if (viewingSomeoneElsesProfile || this.selectedBoardId() || this.friendsPage() || this.songsPage() || this.tripsPage()) {
      await this.router.navigate(['/boards']);
    }
    window.setTimeout(() => {
      const drafts = window.document.getElementById('board-drafts');
      drafts?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      drafts?.focus({ preventScroll: true });
    }, 80);
  }

  selectBoard(boardId: string): void {
    if (this.suppressNextBoardOpen) {
      this.suppressNextBoardOpen = false;
      return;
    }
    this.nearbyGemsVisibilityMessage.set('');
    this.resetBoardRouteScroll();
    void this.router.navigate([this.boardRouteRoot(), boardId]);
  }

  private resetBoardRouteScroll(): void {
    if (!this.isBrowser) {
      return;
    }
    resetBoardRouteViewport(
      () => this.boardsScrollViewport?.nativeElement ?? null,
      window,
    );
  }

  private cancelBoardRouteUnavailableReveal(): void {
    if (this.boardRouteUnavailableTimer) {
      clearTimeout(this.boardRouteUnavailableTimer);
      this.boardRouteUnavailableTimer = null;
    }
    this.boardRouteUnavailableReady.set(false);
  }

  private scheduleBoardRouteUnavailableReveal(boardRouteLoadId: number): void {
    this.cancelBoardRouteUnavailableReveal();
    this.boardRouteUnavailableTimer = setTimeout(() => {
      this.boardRouteUnavailableTimer = null;
      if (
        boardRouteLoadId === this.boardRouteLoadSequence
        && this.boardRouteLoadState().complete
        && !!this.selectedBoardId()
        && !this.originalSelectedBoard()
        && !this.privateBoardBlocked()
      ) {
        this.boardRouteUnavailableReady.set(true);
      }
    }, BOARD_ROUTE_UNAVAILABLE_GRACE_MS);
  }

  private cancelPublicOwnerRouteEmptyReveal(): void {
    if (this.publicOwnerRouteEmptyTimer) {
      clearTimeout(this.publicOwnerRouteEmptyTimer);
      this.publicOwnerRouteEmptyTimer = null;
    }
  }

  private schedulePublicOwnerRouteEmptyReveal(boardRouteLoadId: number): void {
    this.cancelPublicOwnerRouteEmptyReveal();
    this.publicOwnerRouteEmptyTimer = setTimeout(() => {
      this.publicOwnerRouteEmptyTimer = null;
      if (boardRouteLoadId === this.boardRouteLoadSequence && !!this.publicOwnerKey()) {
        this.publicOwnerRouteEmptyReady.set(true);
      }
    }, BOARD_ROUTE_UNAVAILABLE_GRACE_MS);
  }

  closeBoardDetail(): void {
    this.nearbyGemsVisibilityMessage.set('');
    this.stopSongPreview();
    this.closeTourStopEditor();
    if (this.boardLearnOpen()) {
      this.closeBoardLearn();
    }
    const board = this.originalSelectedBoard();
    if (board?.parentBoardId) {
      void this.router.navigate(['/boards', board.parentBoardId]);
      return;
    }
    void this.router.navigateByUrl(this.songsPage() || this.tripsPage() ? this.boardRouteRoot() : this.boardsProfileRoutePath());
  }

  openParentBoard(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!board.parentBoardId) {
      return;
    }
    void this.router.navigate(['/boards', board.parentBoardId]);
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

  setBoardFriendsView(value: BoardFriendsView): void {
    this.boardFriendsView.set(value);
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
    if (!this.flippedCardIds().has(cardId)) {
      this.boardAnalytics.trackCardOpen(cardId);
    }
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
    void this.ensureCitiesLoaded();
    this.resetBoardWizard();
    this.wizardOpen.set(true);
  }

  async openNearbyGemsWizard(): Promise<void> {
    await this.authService.waitForReady();
    if (this.route.snapshot.queryParamMap.get('create') !== 'gems' && this.nearbyGemsQueryConsumed) {
      return;
    }
    if (!this.canCreateBoard()) {
      this.boardsSyncError.set('Sign in to create a nearby gems board.');
      return;
    }
    this.resetBoardWizard();
    this.wizardOpen.set(true);
    this.chooseWizardMode('nearby-gems');
    if (this.isBrowser) {
      window.setTimeout(() => {
        window.document.querySelector<HTMLElement>('.nearby-gems-wizard__range')?.focus();
      }, 0);
    }
  }

  openBoardBuilder(
    board: Board,
    event?: Event,
    mode?: BoardWizardMode | 'manual',
  ): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can add cards to this board.`);
      return;
    }
    this.resetBoardWizard();
    this.wizardTargetBoardId.set(board.id);
    this.wizardLockedTargetBoardId.set(board.id);
    this.wizardOpen.set(true);
    if (mode) {
      this.chooseWizardMode(mode);
    }
  }

  boardBuildModes(board: Board): typeof BOARD_WIZARD_MODES {
    if (!board.cards.length) {
      return this.wizardModes;
    }
    return this.wizardModes.filter((mode) =>
      mode.id !== 'off-grid'
      && mode.id !== 'nearby-gems'
      && mode.id !== 'walking-tour'
      && mode.id !== 'driving-tour');
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

  selectWizardDoorway(id: BoardWizardDoorwayId): void {
    if (this.wizardDoorwayModes().some((mode) => mode.id === id)) {
      this.wizardDoorwayId.set(id);
    }
  }

  stepWizardDoorway(direction: -1 | 1): void {
    const modes = this.wizardDoorwayModes();
    if (modes.length < 2) return;
    const index = wrapBoardWizardDoorwayIndex(
      this.wizardActiveDoorwayIndex(),
      direction,
      modes.length,
    );
    this.wizardDoorwayId.set(modes[index]?.id ?? modes[0].id);
  }

  activateWizardDoorway(id: BoardWizardDoorwayId): void {
    if (this.wizardDoorwaySuppressActivation) {
      this.wizardDoorwaySuppressActivation = false;
      return;
    }
    if (this.wizardActiveDoorway()?.id !== id) {
      this.selectWizardDoorway(id);
      return;
    }
    const doorway = this.wizardActiveDoorway();
    if (!doorway) return;
    this.chooseWizardMode(
      boardWizardModeForDoorway(doorway.id),
      doorway.id === 'real-estate'
        ? 'real-estate'
        : doorway.id === 'rental-properties' ? 'rental' : 'default',
    );
  }

  handleWizardDoorwayKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    this.stepWizardDoorway(event.key === 'ArrowLeft' ? -1 : 1);
  }

  startWizardDoorwayGesture(event: PointerEvent): void {
    if (!event.isPrimary || event.pointerType === 'mouse') return;
    this.wizardDoorwayPointerStartX = event.clientX;
  }

  finishWizardDoorwayGesture(event: PointerEvent): void {
    const startX = this.wizardDoorwayPointerStartX;
    this.wizardDoorwayPointerStartX = null;
    if (startX === null || !event.isPrimary || event.pointerType === 'mouse') return;
    const delta = event.clientX - startX;
    if (Math.abs(delta) < 48) return;
    this.wizardDoorwaySuppressActivation = true;
    window.setTimeout(() => {
      this.wizardDoorwaySuppressActivation = false;
    }, 0);
    this.stepWizardDoorway(delta > 0 ? -1 : 1);
  }

  cancelWizardDoorwayGesture(): void {
    this.wizardDoorwayPointerStartX = null;
  }

  chooseWizardMode(
    mode: BoardWizardMode | 'manual',
    entryIntent: BoardWizardEntryIntent = 'default',
  ): void {
    this.wizardEntryIntent.set(entryIntent);
    this.wizardSaveDestination.set('board');
    this.wizardPhotoStudioNotice.set('');
    if (mode === 'manual') {
      const targetBoardId = this.wizardLockedTargetBoardId();
      this.closeBoardWizard();
      if (targetBoardId) {
        this.openCreateCard(targetBoardId);
      } else {
        this.openManualBoard();
      }
      return;
    }
    this.wizardMode.set(mode);
    if (mode === 'nearby-gems') {
      this.wizardTargetBoardId.set('new');
      this.wizardDefaultType.set('place');
      this.wizardVibe.set('traveler');
      this.wizardMediaMode.set('images');
      this.wizardCount.set(8);
      this.wizardStep.set('configure');
      return;
    }
    if (mode === 'off-grid') {
      this.wizardMediaMode.set(DEFAULT_BOARD_WIZARD_MEDIA_MODE);
      this.wizardDefaultType.set('place');
      this.wizardVibe.set('traveler');
      this.wizardCount.set(1);
      if (!this.wizardLockedTargetBoardId()) {
        this.wizardTargetBoardId.set('new');
      }
      this.wizardStep.set('configure');
      return;
    }
    if (mode === 'photos') {
      this.wizardMediaMode.set(DEFAULT_BOARD_WIZARD_MEDIA_MODE);
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

  async findNearbyGems(range: NearbyGemRange): Promise<void> {
    if (this.nearbyGemLocating()) return;
    this.nearbyGemRange.set(range);
    this.nearbyGemLocationError.set(null);
    this.wizardError.set(null);
    this.nearbyGemLocating.set(true);
    try {
      const location = await this.currentNearbyGemLocation();
      this.nearbyGemLocation.set(location);
      await this.requestNearbyGems({
        range,
        latitude: location.latitude,
        longitude: location.longitude,
      });
    } catch (error) {
      this.nearbyGemUseManualLocation.set(true);
      this.nearbyGemLocationError.set(this.nearbyGemErrorMessage(error));
      this.wizardStep.set('configure');
    } finally {
      this.nearbyGemLocating.set(false);
    }
  }

  async findNearbyGemsFromManualLocation(): Promise<void> {
    const manualLocation = this.nearbyGemManualLocation().trim();
    if (manualLocation.length < 2 || this.nearbyGemLocating()) return;
    this.nearbyGemLocationError.set(null);
    this.wizardError.set(null);
    this.nearbyGemLocating.set(true);
    try {
      await this.requestNearbyGems({
        range: this.nearbyGemRange(),
        manualLocation,
      });
    } catch (error) {
      this.nearbyGemLocationError.set(this.nearbyGemErrorMessage(error));
      this.wizardStep.set('configure');
    } finally {
      this.nearbyGemLocating.set(false);
    }
  }

  toggleNearbyGemManualLocation(): void {
    this.nearbyGemUseManualLocation.update((value) => !value);
    this.nearbyGemLocationError.set(null);
  }

  submitWizardConfigure(event: Event): void {
    event.preventDefault();
    if (this.wizardMode() === 'photos') {
      return;
    }
    if (this.wizardMode() === 'nearby-gems') {
      void this.findNearbyGemsFromManualLocation();
      return;
    }
    void this.generateWizardBatch();
  }

  private currentNearbyGemLocation(): Promise<NearbyGemLocation> {
    if (!this.isBrowser || !navigator.geolocation) {
      return Promise.reject(new Error('Location is not available in this browser. Enter a starting place instead.'));
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.max(0, position.coords.accuracy || 0),
        }),
        reject,
        { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 },
      );
    });
  }

  private async requestNearbyGems(origin: {
    range: NearbyGemRange;
    latitude?: number;
    longitude?: number;
    manualLocation?: string;
  }): Promise<void> {
    if (!this.functions) throw new Error('Nearby search is not ready. Refresh and try again.');
    this.wizardStep.set('loading');
    this.wizardLoadingTask.set({ message: 'Finding genuinely interesting places within reach', progress: 24 });
    const boardId = this.wizardActiveDraftId() ?? this.createId();
    this.wizardActiveDraftId.set(boardId);
    const callable = httpsCallable<Record<string, unknown>, unknown>(this.functions, 'discoverNearbyGems', {
      timeout: 55_000,
    });
    const response = await callable({
      ...origin,
      boardId,
      details: this.nearbyGemDetails().trim(),
      count: this.wizardCount(),
    });
    this.wizardLoadingTask.set({ message: 'Preparing your editable gem cards', progress: 82 });
    const batch = this.normalizeWizardBatch(response.data);
    if (batch.board.kind !== 'nearby-gems'
      || !batch.board.nearbyGems
      || batch.board.nearbyGems.generationGrantId !== boardId) {
      console.error('Nearby Gems discovery returned an outdated board payload.', {
        returnedKind: batch.board.kind,
        hasNearbyMetadata: !!batch.board.nearbyGems,
        grantMatchesDraft: batch.board.nearbyGems?.generationGrantId === boardId,
      });
      throw new Error(
        'Nearby Gems is being updated and cannot save the specialized board yet. Refresh and try again shortly.',
      );
    }
    const previewCards = await this.enrichWizardCards(batch.cards);
    this.wizardResult.set({ ...batch, cards: previewCards });
    this.wizardPreviewCards.set(previewCards);
    this.wizardSelectedCardIds.set(new Set(previewCards.map((card) => card.id)));
    this.wizardLoadingTask.set(null);
    this.wizardStep.set('preview');
  }

  private nearbyGemErrorMessage(error: unknown): string {
    const geolocationError = error as Partial<GeolocationPositionError> | null;
    if (geolocationError?.code === 1) {
      return 'Location access was not allowed. Enter a city, neighborhood, or address instead.';
    }
    if (geolocationError?.code === 2) {
      return 'Your location could not be determined. Enter a starting place instead.';
    }
    if (geolocationError?.code === 3) {
      return 'Location took too long. Try again or enter a starting place.';
    }
    const message = error instanceof Error ? error.message.replace(/^Firebase:\s*/i, '').trim() : '';
    return message || 'Nearby gems could not be loaded. Try again or enter another starting place.';
  }

  setNearbyGemCount(value: unknown): void {
    const count = typeof value === 'number' ? value : Number(value);
    this.wizardCount.set(Math.max(
      this.nearbyGemMinCards,
      Math.min(this.nearbyGemMaxCards, Number.isFinite(count) ? Math.round(count) : 8),
    ));
  }

  openManualBoard(): void {
    if (!this.canCreateBoard()) {
      this.boardsSyncError.set($localize`Sign in to create a board.`);
      return;
    }
    this.creatingBoardInside.set(null);
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

  async closeBoardWizard(): Promise<void> {
    if (this.wizardPhotoStoryMode()) {
      return;
    }
    if (this.wizardStep() === 'preview' && this.wizardImagesPreparing()) {
      this.showWizardImageWaitNotice();
      return;
    }
    this.cancelWizardVideoEnrichment();
    if (shouldFlushBoardWizardDraftOnClose({
      step: this.wizardStep(),
      hasResult: !!this.wizardResult(),
      cardCount: this.wizardPreviewCards().length,
    })) {
      const saved = await this.flushWizardDraftAutosave();
      if (!saved) {
        this.wizardError.set('This draft could not be saved yet. Check your connection and try closing again.');
        return;
      }
    }
    this.wizardOpen.set(false);
    this.wizardStep.set('choose');
    this.wizardLockedTargetBoardId.set(null);
    this.wizardContributionBoardId.set(null);
    this.wizardError.set(null);
    this.wizardSaving.set(false);
    if (this.route.snapshot.queryParamMap.get('create') === 'gems') {
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { create: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  resumeWizardDraft(draft: BoardWizardDraft): void {
    if (draft.ownerUserId !== this.authService.uid()) {
      return;
    }
    this.wizardDraftRestoreInProgress = true;
    this.resetBoardWizard();
    this.wizardActiveDraftId.set(draft.id);
    this.wizardMode.set(draft.mode);
    this.wizardEntryIntent.set(draft.entryIntent);
    this.wizardTargetBoardId.set(draft.targetBoardId);
    this.wizardLockedTargetBoardId.set(draft.lockedTargetBoardId || null);
    this.wizardContributionBoardId.set(draft.contributionBoardId || null);
    this.wizardDefaultType.set(draft.defaultType);
    this.wizardCount.set(draft.count);
    this.wizardCountMode.set(draft.countMode);
    this.wizardVibe.set(draft.vibe);
    this.wizardMediaMode.set(draft.mediaMode);
    this.wizardNarrationStyle.set(draft.narrationStyle);
    this.wizardNarrationSecondsPerCard.set(draft.narrationSecondsPerCard);
    this.wizardNarrationLengthCustomized.set(true);
    this.wizardListingMarketingStyle.set(draft.listingMarketingStyle);
    this.wizardListingMarketingDirection.set(draft.listingMarketingDirection);
    this.wizardPrompt.set(draft.prompt);
    this.wizardPastedList.set(draft.pastedList);
    this.wizardUrl.set(draft.sourceUrl);
    this.wizardOffGridName.set(draft.offGridName);
    this.wizardOffGridAddress.set(draft.offGridAddress);
    this.wizardOffGridTip.set(draft.offGridTip);
    this.wizardStackCtaLabel.set(draft.stackCtaLabel);
    this.wizardStackCtaUrl.set(draft.stackCtaUrl);
    this.wizardTourVoiceStyle.set(draft.tourVoiceStyle);
    this.wizardTourPaceOrStyle.set(draft.tourPaceOrStyle);
    this.wizardTourExtras.set(new Set(draft.tourExtras));
    const cards = draft.result.cards.map((card) => ({ ...card, editing: false })) as BoardWizardPreviewCard[];
    this.wizardResult.set({ ...draft.result, cards });
    this.wizardPreviewCards.set(cards);
    this.wizardSelectedCardIds.set(new Set(
      draft.selectedCardIds.filter((id) => cards.some((card) => card.id === id)),
    ));
    this.wizardDraftSaveState.set('saved');
    this.wizardDraftSavedAt.set(draft.updatedAt);
    this.wizardDraftDiscardCandidateId.set(null);
    this.wizardStep.set('preview');
    this.wizardOpen.set(true);
    this.wizardSaveDestination.set(this.isNewPhotoWizardBoard() ? 'studio' : 'board');
    if (this.isBrowser) {
      window.setTimeout(() => {
        this.wizardDraftRestoreInProgress = false;
        if (this.isNewPhotoWizardBoard()) {
          void this.continuePhotoPreviewToStudio();
        }
      }, 0);
    } else {
      this.wizardDraftRestoreInProgress = false;
    }
  }

  requestWizardDraftDiscard(draftId: string): void {
    this.wizardDraftDiscardCandidateId.set(draftId);
  }

  cancelWizardDraftDiscard(): void {
    this.wizardDraftDiscardCandidateId.set(null);
  }

  async confirmWizardDraftDiscard(draftId: string): Promise<void> {
    const uid = this.authService.uid();
    if (!uid || !this.firestore || this.wizardDraftDiscarding()) {
      return;
    }
    const discardingActiveDraft = this.wizardActiveDraftId() === draftId;
    if (discardingActiveDraft) {
      this.wizardDraftRestoreInProgress = true;
      if (this.wizardDraftAutosaveTimer) {
        clearTimeout(this.wizardDraftAutosaveTimer);
        this.wizardDraftAutosaveTimer = null;
      }
      while (this.wizardDraftSavePromise) {
        await this.wizardDraftSavePromise;
      }
    }
    this.wizardDraftDiscarding.set(true);
    try {
      await deleteDoc(doc(this.firestore, 'users', uid, 'board_wizard_drafts', draftId));
      this.wizardDrafts.update((drafts) => drafts.filter((draft) => draft.id !== draftId));
      this.wizardDraftDiscardCandidateId.set(null);
      if (discardingActiveDraft) {
        this.resetBoardWizard();
        this.wizardOpen.set(false);
      }
    } catch (error) {
      this.wizardError.set(this.boardFriendErrorMessage(error, 'Could not discard this draft. Please try again.'));
    } finally {
      this.wizardDraftDiscarding.set(false);
      this.wizardDraftRestoreInProgress = false;
    }
  }

  wizardDraftUpdatedLabel(draft: BoardWizardDraft): string {
    const updated = new Date(draft.updatedAt);
    if (!Number.isFinite(updated.getTime())) {
      return 'Draft saved';
    }
    return `Draft · ${new Intl.DateTimeFormat(this.localeId, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(updated)}`;
  }

  wizardDraftStatusLabel(): string {
    switch (this.wizardDraftSaveState()) {
      case 'saving':
        return 'Saving draft…';
      case 'saved':
        return 'Draft saved';
      case 'error':
        return 'Draft not saved';
      default:
        return 'Draft saves automatically';
    }
  }

  backWizardStep(): void {
    const step = this.wizardStep();
    if (step === 'preview' && this.wizardImagesPreparing()) {
      this.showWizardImageWaitNotice();
      return;
    }
    if (step === 'configure') {
      if (this.wizardMode() === 'nearby-gems' && this.route.snapshot.queryParamMap.get('create') === 'gems') {
        void this.closeBoardWizard();
        return;
      }
      if (this.wizardContributionBoardId()) {
        this.closeBoardWizard();
        return;
      }
      this.wizardStep.set('choose');
    } else if (step === 'preview' || step === 'source-review' || step === 'listing-setup') {
      this.cancelWizardVideoEnrichment();
      this.wizardStep.set('configure');
    }
  }

  setWizardCount(value: string | number, userInitiated = true): void {
    const count = typeof value === 'number' ? value : Number.parseInt(value, 10);
    const normalizedCount = Math.max(1, Math.min(100, Number.isFinite(count) ? count : 12));
    this.wizardCount.set(normalizedCount);
    if (!this.wizardNarrationLengthCustomized()) {
      this.wizardNarrationSecondsPerCard.set(boardNarrationBudgetedSecondsPerCard(
        normalizedCount,
        DEFAULT_BOARD_NARRATION_SECONDS_PER_CARD,
      ));
    }
    if (userInitiated) this.wizardCountMode.set('fixed');
  }

  useWizardAutomaticCount(): void {
    this.wizardCountMode.set('auto');
  }

  useWizardCountLimit(): void {
    this.wizardCountMode.set('fixed');
  }

  wizardCountStatusTitle(): string {
    const intent = this.wizardCountIntent();
    if (intent.policy === 'complete-set') return 'Complete set detected';
    if (intent.policy === 'prompt-exact') return 'The request sets the count';
    if (intent.policy === 'source-exact') return 'The source sets the count';
    return 'Target number of cards';
  }

  wizardCountStatusDetail(): string {
    const intent = this.wizardCountIntent();
    if (intent.policy === 'complete-set') {
      return 'We’ll verify the real membership and use the complete count.';
    }
    if (intent.policy === 'prompt-exact') return `${intent.count} cards requested in your description.`;
    if (intent.policy === 'source-exact') return `${intent.count} source items will become cards.`;
    return 'Used when your description does not specify a count.';
  }

  setWizardNarrationSeconds(value: string | number): void {
    this.wizardNarrationLengthCustomized.set(true);
    this.wizardNarrationSecondsPerCard.set(normalizeBoardNarrationSeconds(value));
  }

  wizardNarrationDurationSummary(): string {
    const intent = this.wizardCountIntent();
    if (intent.policy === 'complete-set' && intent.count === null) {
      return 'Total updates after the complete set is verified.';
    }
    const count = intent.count ?? this.wizardCount();
    const itemLabel = this.isTourWizardMode()
      ? count === 1 ? 'stop' : 'stops'
      : count === 1 ? 'card' : 'cards';
    return `${count} ${itemLabel} · ${boardNarrationDurationLabel(this.wizardNarrationTotalSeconds())} · ~${this.wizardNarrationWordsPerCard() * count} words`;
  }

  updateWizardPastedList(value: string): void {
    const pastedText = value.slice(0, BOARD_WIZARD_PASTE_MAX_LENGTH);
    this.wizardPastedList.set(pastedText);
    const detectedCount = parseWhat3WordsBoardSource(pastedText)?.items.length
      ?? parseNumberedBoardSource(pastedText)?.items.length
      ?? 0;
    if (detectedCount) {
      this.setWizardCount(detectedCount, false);
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

    return resolveBoardWizardCountIntent({ prompt: text, targetCount: this.wizardCount() }).count;
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

  async createPhotoBoardForStudio(mode: BoardPhotoStoryMode): Promise<void> {
    if (
      this.wizardMode() !== 'photos'
      || !this.wizardCanGenerate()
      || this.wizardPhotoStoryMode()
      || this.wizardSaving()
    ) {
      return;
    }

    const opensStudioDraft = this.isNewPhotoWizardBoard();
    this.wizardPhotoStoryMode.set(mode);
    this.wizardSaveDestination.set(opensStudioDraft ? 'studio' : 'board');
    this.wizardError.set(null);
    this.setWizardCount(this.wizardPhotos().length, false);
    this.wizardPhotoStudioNotice.set('');
    this.wizardResult.set(null);
    this.wizardPreviewCards.set([]);
    this.wizardSelectedCardIds.set(new Set());

    try {
      if (mode === 'generate') {
        await this.generateWizardBatch();
        if (this.wizardStep() !== 'preview' || !this.wizardResult() || !this.wizardPreviewCards().length) {
          this.wizardPhotoStudioNotice.set(
            'AI could not finish every story, so your photos were preserved as blank, editable cards.',
          );
          await this.prepareBlankPhotoStoryBatch();
        }
      } else {
        await this.prepareBlankPhotoStoryBatch();
      }

      if (this.wizardStep() === 'preview' && this.wizardResult() && this.wizardPreviewCards().length) {
        if (!opensStudioDraft) {
          return;
        }
        await this.continuePhotoPreviewToStudio();
      }
    } catch (error) {
      this.wizardError.set(
        error instanceof Error ? error.message : 'This photo board could not be created. Please try again.',
      );
      this.wizardStep.set(this.wizardResult() ? 'preview' : 'configure');
    } finally {
      this.wizardPhotoStoryMode.set(null);
      this.wizardLoadingTask.set(null);
    }
  }

  isNewPhotoWizardBoard(): boolean {
    return shouldOpenBoardPhotoStoryStudio({
      mode: this.wizardMode(),
      targetBoardId: this.wizardTargetBoardId(),
      lockedTargetBoardId: this.wizardLockedTargetBoardId(),
      contributionBoardId: this.wizardContributionBoardId(),
    });
  }

  async continuePhotoPreviewToStudio(): Promise<void> {
    if (this.wizardImagesPreparing()) {
      this.showWizardImageWaitNotice();
      return;
    }
    if (
      !this.isNewPhotoWizardBoard()
      || this.wizardStep() !== 'preview'
      || !this.wizardResult()
      || !this.wizardPreviewCards().length
      || !this.wizardSelectedCount()
      || this.wizardSaving()
    ) {
      return;
    }
    this.wizardSaveDestination.set('studio');
    this.wizardError.set(null);
    this.wizardStep.set('loading');
    this.wizardLoadingTask.set({ message: 'Saving your private draft and opening Studio', progress: 92 });
    try {
      await this.saveWizardBatch();
    } finally {
      if (this.wizardOpen() && this.wizardError()) {
        this.wizardStep.set('preview');
      }
      this.wizardLoadingTask.set(null);
    }
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
        if (this.wizardEntryIntent() === 'real-estate') return 'https://example.com/property-for-sale';
        if (this.wizardEntryIntent() === 'rental') return 'https://example.com/rental-listing';
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

  private async prepareWizardSourceReview(sourceUrl: string, force = false): Promise<boolean> {
    if (!this.functions || !sourceUrl) return false;
    if (
      !force
      && this.canonicalWizardSourceUrl(this.wizardSourceManifest()?.sourceUrl ?? '') === this.canonicalWizardSourceUrl(sourceUrl)
      && this.canonicalWizardSourceUrl(this.wizardSourceConfirmedUrl()) !== this.canonicalWizardSourceUrl(sourceUrl)
    ) {
      this.wizardStep.set('source-review');
      return true;
    }
    if (
      !force
      && this.canonicalWizardSourceUrl(this.wizardSourceManifest()?.sourceUrl ?? '') === this.canonicalWizardSourceUrl(sourceUrl)
      && this.canonicalWizardSourceUrl(this.wizardSourceConfirmedUrl()) === this.canonicalWizardSourceUrl(sourceUrl)
    ) {
      return false;
    }
    this.wizardStep.set('loading');
    this.wizardLoadingTask.set({ message: 'Reading the source page', progress: 18 });
    this.wizardError.set(null);
    try {
      const callable = httpsCallable<Record<string, unknown>, unknown>(
        this.functions,
        'previewBoardWizardSource',
        { timeout: 90_000 },
      );
      const response = await callable({
        url: sourceUrl,
        prompt: this.wizardPrompt().trim(),
        listingIntent: this.wizardListingIntentForApi(),
      });
      const data = response.data && typeof response.data === 'object'
        ? response.data as Record<string, unknown>
        : {};
      const manifest = this.normalizeWizardSourceManifest(data['manifest'], sourceUrl);
      this.wizardSourceReviewUrl.set(sourceUrl);
      this.wizardSourceReviewExact.set(data['exact'] === true);
      this.wizardSourceReviewWarning.set(this.stringValue(data['warning'], '', 500));
      if (data['specializedKind'] === 'real-estate' || data['specializedKind'] === 'rental') {
        this.wizardListingPreview.set(this.normalizeWizardListingPreview(data['listingPreview'], sourceUrl));
        this.wizardSourceManifest.set(null);
        this.wizardSourceConfirmedUrl.set('');
        if (this.wizardCountMode() === 'auto') {
          this.setWizardListingSceneCount(10, false);
        } else {
          this.setWizardListingSceneCount(this.wizardCount(), false);
        }
        this.wizardStep.set('listing-setup');
        this.wizardLoadingTask.set(null);
        return true;
      }
      this.wizardListingPreview.set(null);
      if (data['requiresReview'] === true && manifest) {
        this.wizardSourceManifest.set(manifest);
        this.wizardSourceConfirmedUrl.set('');
        this.setWizardCount(manifest.items.length, false);
        this.wizardStep.set('source-review');
        this.wizardLoadingTask.set(null);
        return true;
      }
      // Menus, shops, and lodging pages keep their established specialized paths.
      this.wizardSourceManifest.set(null);
      this.wizardSourceConfirmedUrl.set(sourceUrl);
      return false;
    } catch {
      this.wizardStep.set('configure');
      this.wizardLoadingTask.set(null);
      this.wizardSourceManifest.set(null);
      this.wizardSourceConfirmedUrl.set(sourceUrl);
      this.wizardSourceReviewWarning.set(
        'The quick source review was unavailable. LivingWiki will continue with the full source reader and mark anything uncertain in the final preview.',
      );
      // Source review is a quality guard, not a new single point of failure. The
      // established generation pipeline still has direct, Reader, and search fallbacks.
      return false;
    }
  }

  async confirmWizardSourceReview(): Promise<void> {
    const manifest = this.wizardSourceManifest();
    if (!manifest?.items.length) return;
    this.wizardSourceConfirmedUrl.set(manifest.sourceUrl);
    await this.generateWizardBatch('', true);
  }

  async confirmWizardListingStory(): Promise<void> {
    const sourceUrl = this.wizardSourceReviewUrl() || this.wizardDetectedSourceUrl();
    if (!sourceUrl || !this.wizardListingPreview()) return;
    this.wizardSourceConfirmedUrl.set(sourceUrl);
    await this.generateWizardBatch('', true);
  }

  setWizardListingSceneCount(value: string | number, userInitiated = true): void {
    const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
    const fallback = Math.min(this.wizardListingSceneMax, Math.max(this.wizardListingSceneMin, this.wizardCount()));
    const bounded = Math.min(
      this.wizardListingSceneMax,
      Math.max(this.wizardListingSceneMin, Number.isFinite(parsed) ? parsed : fallback),
    );
    this.setWizardCount(bounded, userInitiated);
  }

  async rereadWizardSource(): Promise<void> {
    const sourceUrl = this.wizardSourceReviewUrl() || this.wizardDetectedSourceUrl();
    this.wizardSourceManifest.set(null);
    this.wizardSourceConfirmedUrl.set('');
    if (sourceUrl && !(await this.prepareWizardSourceReview(sourceUrl, true))) {
      await this.generateWizardBatch('', true);
    }
  }

  async generateWizardBatch(refinement = '', sourceConfirmed = false): Promise<void> {
    if (!this.wizardCanGenerate() || this.wizardSaving()) {
      return;
    }
    this.wizardError.set(null);
    const sourceUrl = this.wizardDetectedSourceUrl();
    if (!sourceUrl) {
      this.wizardSourceManifest.set(null);
      this.wizardListingPreview.set(null);
      this.wizardSourceReviewUrl.set('');
      this.wizardSourceReviewExact.set(false);
      this.wizardSourceReviewWarning.set('');
      this.wizardSourceConfirmedUrl.set('');
    } else if (
      this.canonicalWizardSourceUrl(this.wizardSourceManifest()?.sourceUrl ?? '')
      !== this.canonicalWizardSourceUrl(sourceUrl)
      && this.canonicalWizardSourceUrl(this.wizardSourceReviewUrl())
      !== this.canonicalWizardSourceUrl(sourceUrl)
    ) {
      this.wizardSourceManifest.set(null);
      this.wizardListingPreview.set(null);
      this.wizardSourceConfirmedUrl.set('');
    }
    if (
      !refinement
      && sourceUrl
      && !sourceConfirmed
      && this.canonicalWizardSourceUrl(this.wizardSourceConfirmedUrl()) !== this.canonicalWizardSourceUrl(sourceUrl)
    ) {
      const awaitingReview = await this.prepareWizardSourceReview(sourceUrl);
      if (awaitingReview) return;
    }
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
    const inferredCount = this.wizardMode() === 'photos'
      ? this.wizardPhotos().length
      : this.wizardCountMode() === 'auto' ? this.inferWizardRequestedCount() : null;
    if (inferredCount) {
      this.setWizardCount(inferredCount, false);
    }
    const previousResult = this.wizardResult();
    const previousPreviewCards = this.wizardPreviewCards();
    const previousSelectedCardIds = new Set(this.wizardSelectedCardIds());
    this.wizardImageEnrichmentRun += 1;
    this.wizardImageLoadingCardIds.set(new Set());
    this.wizardImageProgress.set(null);
    this.wizardImageNotice.set(null);
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
      const generatedBatch = this.applyWizardMediaModeToGeneratedBatch(
        await this.requestWizardBatch(refinement),
      );
      if (this.wizardMode() === 'photos' && generatedBatch.cards.length < this.wizardPhotos().length) {
        this.wizardPhotoStudioNotice.set(
          'Some photos did not receive AI copy, so those cards were kept with blank, editable stories.',
        );
      }
      const batch = this.wizardMode() === 'photos'
        ? this.attachWizardPhotosToBatch(generatedBatch)
        : generatedBatch;
      if (!this.wizardNarrationLengthCustomized() && batch.generation?.narrationSecondsPerCard) {
        this.wizardNarrationSecondsPerCard.set(batch.generation.narrationSecondsPerCard);
      }
      const progressiveImages = batch.cards.length > 16;
      const placeEnrichedCards = await this.enrichWizardCards(batch.cards, undefined, !progressiveImages);
      const previewCards = progressiveImages
        ? placeEnrichedCards
        : await this.enrichWizardMissingPlaceImages(placeEnrichedCards, batch.board.title);
      this.wizardResult.set({ ...batch, cards: previewCards });
      this.wizardPreviewCards.set(previewCards);
      this.wizardSelectedCardIds.set(new Set(previewCards.map((card) => card.id)));
      this.wizardStep.set('preview');
      if (progressiveImages) void this.enrichWizardImagesAfterPreview(previewCards, batch.board.title);
      void this.enrichWizardVideos(previewCards, batch);
    } catch (error) {
      this.wizardError.set(this.wizardGenerationErrorMessage(error));
      if (previousResult && previousPreviewCards.length) {
        this.wizardResult.set(previousResult);
        this.wizardPreviewCards.set(previousPreviewCards);
        this.wizardSelectedCardIds.set(previousSelectedCardIds);
        this.wizardStep.set(boardWizardStepAfterGenerationFailure(true));
      } else {
        this.wizardResult.set(null);
        this.wizardPreviewCards.set([]);
        this.wizardSelectedCardIds.set(new Set());
        this.wizardStep.set(boardWizardStepAfterGenerationFailure(false));
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
    if (this.wizardMode() === 'nearby-gems') {
      this.nearbyGemDetails.set(refinement);
      this.wizardRefineText.set('');
      this.nearbyGemLocating.set(true);
      try {
        const manualLocation = this.nearbyGemManualLocation().trim();
        const location = this.nearbyGemLocation();
        if (manualLocation && this.nearbyGemUseManualLocation()) {
          await this.requestNearbyGems({ range: this.nearbyGemRange(), manualLocation });
        } else if (location) {
          await this.requestNearbyGems({
            range: this.nearbyGemRange(),
            latitude: location.latitude,
            longitude: location.longitude,
          });
        } else {
          throw new Error('Choose a travel range again so we can use your location.');
        }
      } catch (error) {
        this.wizardError.set(this.nearbyGemErrorMessage(error));
        this.wizardStep.set('preview');
      } finally {
        this.nearbyGemLocating.set(false);
      }
      return;
    }
    await this.generateWizardBatch(refinement);
    this.wizardRefineText.set('');
  }

  async addMoreWizardCards(): Promise<void> {
    const previousCount = this.wizardCount();
    this.setWizardCount(Math.min(100, previousCount + 5), false);
    await this.generateWizardBatch('Add five more cards that do not duplicate the current preview.');
    this.setWizardCount(previousCount, false);
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
    this.setWizardCount(1, false);
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
        if (this.wizardCardWantsVideo(replacement)) {
          await this.refreshWizardCardVideo(cardId);
        }
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
      this.setWizardCount(previousCount, false);
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
      const replacement = await this.requestWizardCardImage(
        card,
        this.wizardTargetBoardTitle(),
        '',
        true,
      );
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
                imageSource: replacement.imageSource || (item.productUrl ? 'search' : item.imageSource),
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
    return this.wizardRedoingCardIds().has(cardId)
      || this.wizardImageLoadingCardIds().has(cardId)
      || this.wizardVideoLoadingCardIds().has(cardId);
  }

  wizardCardBusyLabel(cardId: string): string {
    if (this.wizardImageLoadingCardIds().has(cardId)) {
      return 'Finding or creating image';
    }
    if (this.wizardVideoLoadingCardIds().has(cardId)) {
      return 'Finding video';
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
    this.wizardPreviewCards.update((cards) => cards.map((card) => {
      if (card.id !== cardId) return card;
      const remainingImages = this.uniqueImageUrls(card.imageUrls ?? []).filter((url) => url !== card.imageUrl);
      return {
        ...card,
        imageUrl: remainingImages[0] ?? '',
        imageUrls: remainingImages,
        imageSource: remainingImages.length ? card.imageSource : (card.productUrl ? 'missing' : card.imageSource),
      };
    }));
    const currentResult = this.wizardResult();
    if (currentResult) this.wizardResult.set({ ...currentResult, cards: this.wizardPreviewCards() });
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

  wizardListingStoryRole(card: BoardWizardGeneratedCard): string {
    if (card.listingPresentation) {
      return card.listingPresentation.reviewStatus === 'needs-review'
        ? `${card.listingPresentation.label} · Needs review`
        : card.listingPresentation.label;
    }
    const role = card.tags.find((tag) => tag.startsWith('story-'))?.slice('story-'.length) || '';
    return role.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  moveWizardCard(cardId: string, direction: -1 | 1): void {
    this.wizardPreviewCards.update((cards) => {
      const index = cards.findIndex((card) => card.id === cardId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= cards.length) return cards;
      const reordered = [...cards];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
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
    if (this.wizardImagesPreparing()) {
      this.showWizardImageWaitNotice();
      return;
    }
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

    const draftSaved = await this.flushWizardDraftAutosave();
    if (!draftSaved) {
      this.wizardError.set(this.wizardMode() === 'nearby-gems'
        ? 'Saving is paused because the latest private draft could not be synced. Check your connection and try again.'
        : 'Save and publish is paused because the latest draft could not be synced. Check your connection and try again.');
      this.wizardSaving.set(false);
      return;
    }

    const now = new Date().toISOString();
    const cards = selectedCards.map((card): BoardCard => ({
      id: card.id,
      title: card.title.trim(),
      subtitle: card.subtitle.trim(),
      notes: cardNotesForPersistence(card.notes),
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
      nearby: card.nearby ? this.normalizeNearbyGemMetrics(card.nearby) ?? undefined : undefined,
      videoIntent: card.video_intent === true,
      videoSearchQuery: card.video_search_query?.trim() || '',
      youtubeVideoId: card.youtubeVideoId?.trim() || '',
      youtubeVideoTitle: card.youtubeVideoTitle?.trim() || '',
      youtubeChannelTitle: card.youtubeChannelTitle?.trim() || '',
      youtubeThumbnailUrl: card.youtubeThumbnailUrl?.trim() || '',
      youtubeDurationSeconds: Math.max(0, Math.min(86_400, Math.trunc(card.youtubeDurationSeconds ?? 0))),
      youtubeMatchConfidence: Math.max(0, Math.min(1, card.youtubeMatchConfidence ?? 0)),
      youtubeVerifiedAt: card.youtubeVerifiedAt?.trim() || '',
      imageUrl: card.imageUrl,
      imageUrls: this.uniqueImageUrls([card.imageUrl, ...(card.imageUrls ?? [])]).slice(0, cardPhotoLimit(card)),
      ...(card.listingPresentation ? { listingPresentation: card.listingPresentation } : {}),
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
        await this.deletePublishedWizardDraft();
        this.wizardStep.set('done');
        this.wizardSaving.set(false);
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
    const activeDraftId = this.wizardActiveDraftId() ?? this.createId();
    this.wizardActiveDraftId.set(activeDraftId);
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
          cards: appendBoardCards(existingBoard.cards, cards),
          updatedAt: now,
        }
      : {
          id: activeDraftId,
          ...this.currentOwnerSnapshot(),
          kind: result.board.kind ?? this.wizardGeneratedBoardKind(),
          sortOrder: this.nextBoardSortOrder(),
          title: result.board.title.trim() || 'Wizard board',
          description: boardDescriptionForFirestore(result.board.description),
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
          socialVideoNarrationEnabled: true,
          socialLandscapeVideoUrl: '',
          socialLandscapeVideoMimeType: '',
          socialLandscapeVideoUpdatedAt: '',
          socialLandscapeVideoRenderVersion: '',
          socialLandscapeVideoDurationSeconds: 0,
          socialVideoClosingHeadline: 'Keep exploring',
          socialVideoClosingMessage: '',
          socialVideoClosingShowQrCode: true,
          socialVideoClosingImage: 'cover',
          socialVideoClosingCustomImageUrl: '',
          socialVideoClosingDurationSeconds: 3,
          trailerVideoUrl: '',
          trailerVideoMimeType: '',
          trailerVideoUpdatedAt: '',
          trailerVideoRatio: 'vertical',
          trailerVideoAudioTrackId: DEFAULT_STACK_AUDIO_TRACK_ID,
          trailerVideoAudioVolume: DEFAULT_STACK_AUDIO_VOLUME,
          trailerVideoNarrationEnabled: true,
          trailerVideoScript: '',
          trailerVideoSourceFingerprint: '',
          trailerVideoCardIds: [],
          trailerVideoDurationSeconds: 0,
          trailerLandscapeVideoUrl: '',
          trailerLandscapeVideoMimeType: '',
          trailerLandscapeVideoUpdatedAt: '',
          trailerLandscapeVideoRenderVersion: '',
          trailerLandscapeVideoDurationSeconds: 0,
          narrationStyle: this.wizardNarrationStyle(),
          narrationSecondsPerCard: this.wizardNarrationSecondsPerCard(),
          stackNarratorVoiceId: defaultNarratorVoiceIdForStyle(this.wizardNarrationStyle()),
          forkedFromBoardId: '',
          forkedFromTitle: '',
          forkedFromOwnerUserId: '',
          forkedFromOwnerName: '',
          visibility: this.wizardMode() === 'nearby-gems' || this.wizardSaveDestination() === 'studio'
            ? 'private'
            : 'public',
          photoStoryBoard: this.wizardMode() === 'photos',
          photoStudioDraft: this.wizardSaveDestination() === 'studio',
          stickers: [],
          tourMeta: result.board.tourMeta ?? this.buildWizardTourMeta(cards),
          nearbyGems: result.board.nearbyGems ?? null,
          atlasId: '',
          generatedForAtlasId: '',
          insideCardsDisplay: 'nested',
          showCardNumbers: true,
          cards,
          createdAt: now,
          updatedAt: now,
        };

    try {
      const persisted = await this.publishWizardBoard(nextBoard, activeDraftId);
      if (existingBoard) {
        this.boards.update((boards) => boards.map((board) => board.id === existingBoard.id ? persisted : board));
      } else {
        this.boards.update((boards) => [persisted, ...boards]);
      }
      this.wizardDrafts.update((drafts) => drafts.filter((draft) => draft.id !== activeDraftId));
      this.wizardActiveDraftId.set(null);
      this.wizardDraftSaveState.set('idle');
      this.boardsSyncError.set(null);
      this.wizardStep.set('done');
      this.wizardSaving.set(false);
      if (this.wizardSaveDestination() === 'studio') {
        const notice = this.wizardPhotoStudioNotice().trim();
        this.pendingPhotoStudioNotice = notice ? { boardId: persisted.id, message: notice } : null;
        this.wizardOpen.set(false);
        void this.router.navigate(['/boards', persisted.id], {
          queryParams: { studio: 'video' },
        });
      } else {
        void this.router.navigate(['/boards', persisted.id]);
      }
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

  openBoardSettings(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can edit this board.`);
      return;
    }
    this.boardSettingsDraft.set({
      title: board.title,
      description: board.description,
      visibility: board.visibility,
      showCardNumbers: this.boardShowsCardNumbers(board),
      insideCardsDisplay: this.boardInsideDisplay(board),
    });
    this.boardSettingsError.set(null);
    this.boardSettingsBoardId.set(board.id);
  }

  closeBoardSettings(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const boardId = this.boardSettingsBoardId();
    this.boardSettingsBoardId.set(null);
    this.boardSettingsError.set(null);
    if (!this.isBrowser || !boardId) return;
    requestAnimationFrame(() => {
      document.getElementById(`board-settings-trigger-${boardId}`)?.focus();
    });
  }

  updateBoardSettingsDraft<K extends keyof BoardSettingsDraft>(
    field: K,
    value: BoardSettingsDraft[K],
  ): void {
    this.boardSettingsDraft.update((draft) => ({ ...draft, [field]: value }));
    this.boardSettingsError.set(null);
  }

  setBoardSettingsVisibility(visibility: BoardVisibility): void {
    const board = this.boardSettingsBoard();
    if (!board || board.parentCardId) return;
    if (visibility === 'private' && !this.canUsePrivateBoards() && !this.isNearbyGemsBoard(board)) {
      this.redirectToPrivateBoardsPricing();
      return;
    }
    this.updateBoardSettingsDraft('visibility', visibility);
  }

  async saveBoardSettings(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const current = this.boardSettingsBoard();
    const draft = this.boardSettingsDraft();
    const title = draft.title.trim();
    if (!current || !this.canEditBoard(current)) {
      this.boardSettingsError.set($localize`Only the board owner can save changes.`);
      return;
    }
    if (!title) {
      this.boardSettingsError.set('Give this board a title before saving.');
      return;
    }

    const visibility = current.parentCardId ? current.visibility : draft.visibility;
    if (visibility === 'private'
      && !this.canUsePrivateBoards()
      && !this.isNearbyGemsBoard(current)) {
      this.redirectToPrivateBoardsPricing();
      return;
    }
    if (visibility === 'public' && current.visibility !== 'public') {
      const talkingCards = current.cards.filter((card) => this.isTalkingCard(card));
      const avatars = await Promise.all(talkingCards.map((card) =>
        this.atlasService.getAccessibleAtlasById(card.conversation?.atlasId ?? '')));
      if (avatars.some((atlas) => !atlas?.is_public)) {
        this.boardSettingsError.set('This board contains a private or unavailable Talking Card. Publish its avatar in Wiki settings, or remove that card, before making the board public.');
        return;
      }
    }

    const showCardNumbersChanged = this.boardShowsCardNumbers(current) !== draft.showCardNumbers;
    const insideCardsDisplayChanged = this.boardInsideDisplay(current) !== draft.insideCardsDisplay;
    const now = new Date().toISOString();
    const nextBoard: Board = {
      ...current,
      title,
      description: draft.description.trim(),
      visibility,
      showCardNumbers: draft.showCardNumbers,
      insideCardsDisplay: draft.insideCardsDisplay,
      ...(showCardNumbersChanged ? {
        socialVideoUrl: '',
        socialVideoMimeType: '',
        socialVideoUpdatedAt: '',
        socialVideoRenderVersion: '',
      } : {}),
      updatedAt: now,
    };

    this.boards.update((boards) => boards.map((board) => board.id === nextBoard.id ? nextBoard : board));
    if (insideCardsDisplayChanged) {
      this.activeAlongsideBoardIds.set(new Set());
    }
    if (showCardNumbersChanged) {
      this.publishedStackVideoFiles.delete(this.stackPublishedFileKey(current.id, 'vertical'));
      this.publishedStackVideoFiles.delete(this.stackPublishedFileKey(current.id, 'landscape'));
      this.stackPublishedVideoReady.set(false);
    }

    this.boardSettingsSaving.set(true);
    this.boardSettingsError.set(null);
    try {
      const visibilityOnlyEdit = !showCardNumbersChanged
        && !insideCardsDisplayChanged
        && this.isVisibilityOnlyBoardEdit(current, nextBoard);
      const saved = visibilityOnlyEdit
        ? await this.persistVisibilityAndReplaceBoard(nextBoard)
        : await this.persistAndReplaceBoard(nextBoard);
      if (!saved) {
        this.boardSettingsError.set('These changes could not be saved. Please try again.');
        return;
      }

      const linkedChildren = this.nestedBoardsUnder(current.id)
        .filter((board) => board.visibility !== visibility
          || (board.parentBoardId === current.id && board.parentBoardTitle !== title))
        .map((board) => ({
          ...board,
          parentBoardTitle: board.parentBoardId === current.id ? title : board.parentBoardTitle,
          visibility,
          updatedAt: now,
        }));
      if (linkedChildren.length) {
        const linkedById = new Map(linkedChildren.map((board) => [board.id, board]));
        this.boards.update((boards) => boards.map((board) => linkedById.get(board.id) ?? board));
        const childSaveResults = await Promise.all(linkedChildren.map((board) => visibilityOnlyEdit
          ? this.persistVisibilityAndReplaceBoard(board)
          : this.persistAndReplaceBoard(board)));
        if (childSaveResults.some((result) => !result)) {
          this.boardSettingsError.set('The board was updated, but one of its boards inside could not be synced.');
          return;
        }
      }
      this.closeBoardSettings();
    } finally {
      this.boardSettingsSaving.set(false);
    }
  }

  openEditBoard(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can edit this board.`);
      return;
    }
    this.creatingBoardInside.set(null);
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
    this.creatingBoardInside.set(null);
  }

  async saveBoard(event: Event): Promise<void> {
    event.preventDefault();
    const draft = this.boardDraft();
    const title = draft.title.trim();
    if (!title) {
      return;
    }
    const editingId = this.editingBoardId();
    const editingBoardForVisibility = editingId
      ? this.boards().find((board) => board.id === editingId) ?? null
      : null;
    if (draft.visibility === 'private'
      && !this.canUsePrivateBoards()
      && !this.isNearbyGemsBoard(editingBoardForVisibility)) {
      this.redirectToPrivateBoardsPricing();
      return;
    }

    const now = new Date().toISOString();
    const insideContext = this.creatingBoardInside();
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
                icon: resolveBoardIcon(draft.icon, {
                  title,
                  description: draft.description,
                  kind: board.kind,
                }),
                tone: draft.tone,
                visibility: board.parentCardId ? board.visibility : draft.visibility,
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
      const parentBoard = insideContext
        ? this.boards().find((board) => board.id === insideContext.parentBoardId) ?? null
        : null;
      const parentCard = parentBoard?.cards.find((card) => card.id === insideContext?.parentCardId) ?? null;
      if (insideContext && (!parentBoard || !parentCard || !this.canEditBoard(parentBoard))) {
        this.boardsSyncError.set('The parent card could not be found.');
        return;
      }
      const board: Board = {
        id: this.createId(),
        ...this.currentOwnerSnapshot(),
        sortOrder: this.nextBoardSortOrder(),
        title,
        description: draft.description.trim(),
        backNote: draft.backNote.trim(),
        icon: resolveBoardIcon(draft.icon, { title, description: draft.description, kind: 'standard' }),
        tone: draft.tone,
        visibility: parentBoard?.visibility ?? draft.visibility,
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
        socialVideoNarrationEnabled: true,
        socialLandscapeVideoUrl: '',
        socialLandscapeVideoMimeType: '',
        socialLandscapeVideoUpdatedAt: '',
        socialLandscapeVideoRenderVersion: '',
        socialLandscapeVideoDurationSeconds: 0,
        socialVideoClosingHeadline: 'Keep exploring',
        socialVideoClosingMessage: '',
        socialVideoClosingShowQrCode: true,
        socialVideoClosingImage: 'cover',
        socialVideoClosingCustomImageUrl: '',
        socialVideoClosingDurationSeconds: 3,
        trailerVideoUrl: '',
        trailerVideoMimeType: '',
        trailerVideoUpdatedAt: '',
        trailerVideoRatio: 'vertical',
        trailerVideoAudioTrackId: DEFAULT_STACK_AUDIO_TRACK_ID,
        trailerVideoAudioVolume: DEFAULT_STACK_AUDIO_VOLUME,
        trailerVideoNarrationEnabled: true,
        trailerVideoScript: '',
        trailerVideoSourceFingerprint: '',
        trailerVideoCardIds: [],
        trailerVideoDurationSeconds: 0,
        trailerLandscapeVideoUrl: '',
        trailerLandscapeVideoMimeType: '',
        trailerLandscapeVideoUpdatedAt: '',
        trailerLandscapeVideoRenderVersion: '',
        trailerLandscapeVideoDurationSeconds: 0,
        narrationStyle: DEFAULT_BOARD_NARRATION_STYLE_ID,
        stackNarratorVoiceId: DEFAULT_STACK_NARRATOR_VOICE_ID,
        forkedFromBoardId: '',
        forkedFromTitle: '',
        forkedFromOwnerUserId: '',
        forkedFromOwnerName: '',
        stickers: draft.stickers,
        parentBoardId: insideContext?.parentBoardId ?? '',
        parentCardId: insideContext?.parentCardId ?? '',
        parentBoardTitle: insideContext?.parentBoardTitle ?? '',
        parentCardTitle: insideContext?.parentCardTitle ?? '',
        atlasId: '',
        generatedForAtlasId: '',
        insideCardsDisplay: 'nested',
        showCardNumbers: true,
        cards: parentCard ? cardsForNewBoardInside(this.relatedCardsFor(parentCard)) : [],
        kind: 'standard',
        tourMeta: null,
        createdAt: now,
        updatedAt: now,
      };
      nextBoard = board;
      if (parentBoard && parentCard) {
        const linkedParent: Board = {
          ...parentBoard,
          cards: parentBoard.cards.map((card) => card.id === parentCard.id
            ? { ...card, childBoardId: board.id, updatedAt: now }
            : card),
          updatedAt: now,
        };
        this.boards.update((boards) => [
          board,
          ...boards.map((candidate) => candidate.id === linkedParent.id ? linkedParent : candidate),
        ]);
        await this.persistAndReplaceBoard(board);
        await this.persistAndReplaceBoard(linkedParent);
      } else {
        this.boards.update((boards) => [board, ...boards]);
      }
      void this.router.navigate(['/boards', board.id]);
    }

    if (nextBoard && (editingId || !insideContext)) {
      const visibilityOnlyEdit = !!editingBoardForVisibility
        && this.isVisibilityOnlyBoardEdit(editingBoardForVisibility, nextBoard);
      const saved = visibilityOnlyEdit
        ? await this.persistVisibilityAndReplaceBoard(nextBoard)
        : await this.persistAndReplaceBoard(nextBoard);
      if (!saved) {
        return;
      }
      if (editingId) {
        const linkedChildren = this.nestedBoardsUnder(editingId)
          .filter((board) => board.visibility !== draft.visibility
            || (board.parentBoardId === editingId && board.parentBoardTitle !== title))
          .map((board) => ({
            ...board,
            parentBoardTitle: board.parentBoardId === editingId ? title : board.parentBoardTitle,
            visibility: draft.visibility,
            updatedAt: now,
          }));
        if (linkedChildren.length) {
          const linkedById = new Map(linkedChildren.map((board) => [board.id, board]));
          this.boards.update((boards) => boards.map((board) => linkedById.get(board.id) ?? board));
          await Promise.all(linkedChildren.map((board) => visibilityOnlyEdit
            ? this.persistVisibilityAndReplaceBoard(board)
            : this.persistAndReplaceBoard(board)));
        }
      }
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

  openCustomUrlDialog(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set('Only the board owner can set its custom URL.');
      return;
    }
    this.customUrlBoard.set(board);
  }

  openBoardPromoImage(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (board.visibility !== 'public') {
      this.boardsSyncError.set('Make this board public before creating a promo image.');
      return;
    }
    this.boardPromoImageBoard.set(board);
  }

  closeBoardPromoImage(): void {
    const boardId = this.boardPromoImageBoard()?.id ?? '';
    this.boardPromoImageBoard.set(null);
    if (!this.isBrowser || !boardId) return;
    requestAnimationFrame(() => {
      document.getElementById(`board-promo-trigger-${boardId}`)?.focus();
    });
  }

  boardPromoImageDownloaded(): void {
    this.boardAnalytics.trackShare('board_share');
  }

  boardPromoTypeLabel(board: Board): string {
    if (board.parentCardId) return 'Board inside';
    if (this.isTourBoard(board)) return board.kind === 'driving-tour' ? 'Driving tour' : 'Walking tour';
    if (this.isSongBoard(board)) return 'Music board';
    return 'Board';
  }

  openBoardInsights(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canEditBoard(board) && !this.isPlatformAdmin()) return;
    void this.router.navigate(['/manage/boards', board.id, 'insights']);
  }

  closeCustomUrlDialog(): void {
    this.customUrlBoard.set(null);
  }

  customUrlEligible(board: Board): boolean {
    return this.canEditBoard(board)
      && (this.isPlatformAdmin() || this.authService.hasActivePersonalWikiPlan());
  }

  handleCustomUrlSaved(result: SetCustomPublicUrlResult): void {
    const board = this.customUrlBoard();
    if (!board || result.resourceType !== 'board' || result.resourceId !== board.id) return;
    this.boards.update((boards) => boards.map((item) => item.id === board.id
      ? { ...item, customSlug: result.slug }
      : item));
    this.customUrlBoard.set({ ...board, customSlug: result.slug });
    void this.router.navigate(['/boards', result.slug], {
      replaceUrl: true,
      queryParamsHandling: 'preserve',
      preserveFragment: true,
    });
  }

  openBoardAdmin(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    void this.router.navigate(['/admin/city-board-factory'], { queryParams: { board: board.id } });
  }

  closeBoardDeleteDialog(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.boardDeleteCandidate.set(null);
  }

  async confirmDeleteBoard(event?: Event): Promise<void> {
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
    const descendantBoards = this.nestedBoardsUnder(board.id);
    const boardIdsToDelete = new Set([board.id, ...descendantBoards.map((candidate) => candidate.id)]);

    const parentBoard = board.parentBoardId
      ? this.boards().find((candidate) => candidate.id === board.parentBoardId) ?? null
      : null;
    if (parentBoard && board.parentCardId && this.canEditBoard(parentBoard)) {
      const now = new Date().toISOString();
      const unlinkedParent: Board = {
        ...parentBoard,
        cards: parentBoard.cards.map((card) => card.id === board.parentCardId
          ? { ...card, childBoardId: '', updatedAt: now }
          : card),
        updatedAt: now,
      };
      this.boards.update((boards) => boards.map((candidate) => candidate.id === unlinkedParent.id ? unlinkedParent : candidate));
      await this.persistAndReplaceBoard(unlinkedParent);
    }

    this.boards.update((boards) => boards.filter((item) => !boardIdsToDelete.has(item.id)));
    if (this.selectedBoardId() === board.id) {
      if (board.parentBoardId) {
        void this.router.navigate(['/boards', board.parentBoardId]);
      } else {
        void this.router.navigateByUrl(this.boardsProfileRoutePath());
      }
    }
    await Promise.all(Array.from(boardIdsToDelete, (boardId) => this.deleteRemoteBoard(boardId)));
  }

  nestedBoardCount(board: Board): number {
    return this.nestedBoardsUnder(board.id).length;
  }

  boardHasCardsInside(board: Board): boolean {
    return board.cards.some((card) => !!card.childBoardId?.trim());
  }

  boardDisplayCardCount(board: Board): number {
    return cardsForBoardInsideDisplay(
      board.id,
      board.cards,
      this.boards(),
      board.insideCardsDisplay,
      this.activeAlongsideBoardIds(),
    ).length;
  }

  boardInsideDisplay(board: Board): BoardInsideDisplay {
    return normalizeBoardInsideDisplay(board.insideCardsDisplay);
  }

  boardShowsCardNumbers(board: Board | null | undefined): boolean {
    return board?.showCardNumbers !== false;
  }

  cardDisplaySubtitle(board: Board | null | undefined, card: Pick<BoardCard, 'subtitle'>): string {
    return cardPresentationSubtitle(card.subtitle, this.boardShowsCardNumbers(board));
  }

  async setBoardShowCardNumbers(board: Board, showCardNumbers: boolean, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const current = this.boards().find((candidate) => candidate.id === board.id) ?? null;
    if (!current || !this.canEditBoard(current) || this.boardShowsCardNumbers(current) === showCardNumbers) {
      return;
    }
    const nextBoard: Board = {
      ...current,
      showCardNumbers,
      // A previously rendered video contains the old presentation choice.
      // Clear it so the next video is generated with the new board setting.
      socialVideoUrl: '',
      socialVideoMimeType: '',
      socialVideoUpdatedAt: '',
      socialVideoRenderVersion: '',
      updatedAt: new Date().toISOString(),
    };
    this.boards.update((boards) => boards.map((candidate) => candidate.id === nextBoard.id ? nextBoard : candidate));
    this.publishedStackVideoFiles.delete(this.stackPublishedFileKey(board.id, 'vertical'));
    this.publishedStackVideoFiles.delete(this.stackPublishedFileKey(board.id, 'landscape'));
    this.stackPublishedVideoReady.set(false);
    this.boardCardNumbersSavingId.set(board.id);
    try {
      await this.persistAndReplaceBoard(nextBoard);
    } finally {
      if (this.boardCardNumbersSavingId() === board.id) {
        this.boardCardNumbersSavingId.set(null);
      }
    }
  }

  isAlongsideBoardInsideActive(board: Board, card: BoardCard): boolean {
    const childBoardId = card.childBoardId?.trim();
    return this.canUseAlongsideBoardInside(board)
      && !!childBoardId
      && this.activeAlongsideBoardIds().has(childBoardId);
  }

  async setBoardInsideDisplay(board: Board, display: BoardInsideDisplay, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const current = this.boards().find((candidate) => candidate.id === board.id) ?? null;
    if (!current || !this.canEditBoard(current) || current.insideCardsDisplay === display) {
      return;
    }
    const nextBoard: Board = {
      ...current,
      insideCardsDisplay: display,
      updatedAt: new Date().toISOString(),
    };
    this.activeAlongsideBoardIds.set(new Set());
    this.boards.update((boards) => boards.map((candidate) => candidate.id === nextBoard.id ? nextBoard : candidate));
    this.boardInsideDisplaySavingId.set(board.id);
    try {
      await this.persistAndReplaceBoard(nextBoard);
    } finally {
      if (this.boardInsideDisplaySavingId() === board.id) {
        this.boardInsideDisplaySavingId.set(null);
      }
    }
  }

  isAlongsideInnerCard(board: Board, card: BoardCard): boolean {
    return board.insideCardsDisplay === 'alongside' && !!this.alongsideCardContext(board, card);
  }

  alongsideInnerCardParentTitle(board: Board, card: BoardCard): string {
    return this.alongsideCardContext(board, card)?.parentCard.title ?? 'Parent card';
  }

  cardHostBoard(board: Board, card: BoardCard): Board {
    return this.alongsideCardContext(board, card)?.childBoard ?? board;
  }

  openAlongsideInnerBoard(board: Board, card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const childBoard = this.alongsideCardContext(board, card)?.childBoard;
    if (childBoard) {
      void this.router.navigate(['/boards', childBoard.id]);
    }
  }

  collapseAlongsideInnerBoard(board: Board, card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const childBoardId = this.alongsideCardContext(board, card)?.childBoard.id;
    if (!childBoardId) {
      return;
    }
    this.activeAlongsideBoardIds.update((activeIds) => {
      const next = new Set(activeIds);
      next.delete(childBoardId);
      return next;
    });
  }

  private alongsideCardContext(board: Board, card: BoardCard): { parentCard: BoardCard; childBoard: Board } | null {
    if (board.insideCardsDisplay !== 'alongside') {
      return null;
    }
    for (const parentCard of board.cards) {
      const childBoardId = parentCard.childBoardId?.trim();
      if (!childBoardId || !this.activeAlongsideBoardIds().has(childBoardId)) {
        continue;
      }
      const childBoard = this.boards().find((candidate) =>
        candidate.id === childBoardId
        && candidate.parentBoardId === board.id
        && candidate.parentCardId === parentCard.id);
      if (childBoard?.cards.some((candidate) => candidate.id === card.id)) {
        return { parentCard, childBoard };
      }
    }
    return null;
  }

  private nestedBoardsUnder(parentBoardId: string): Board[] {
    const descendants: Board[] = [];
    const pending = [parentBoardId];
    const visited = new Set<string>();
    while (pending.length) {
      const currentParentId = pending.shift()!;
      if (visited.has(currentParentId)) {
        continue;
      }
      visited.add(currentParentId);
      const children = this.boards().filter((board) => board.parentBoardId === currentParentId);
      descendants.push(...children);
      pending.push(...children.map((board) => board.id));
    }
    return descendants;
  }

  openTalkingCardEditor(boardId = this.selectedBoard()?.id ?? null, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.boards().find((item) => item.id === boardId);
    if (!board || !this.canEditBoard(board)) {
      this.boardsSyncError.set('Only the board owner can add Talking Cards.');
      return;
    }
    this.talkingCardEditorBoardId.set(board.id);
  }

  openTalkingCardEditorFromSettings(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canEditBoard(board)) {
      this.boardSettingsError.set('Only the board owner can add Talking Cards.');
      return;
    }
    this.boardSettingsBoardId.set(null);
    this.boardSettingsError.set(null);
    this.talkingCardEditorBoardId.set(board.id);
  }

  closeTalkingCardEditor(): void {
    this.talkingCardEditorBoardId.set(null);
  }

  async addTalkingCard(result: TalkingCardEditorResult): Promise<void> {
    const board = this.talkingCardEditorBoard();
    if (!board || !this.canEditBoard(board)) return;
    const now = new Date().toISOString();
    const card = this.cardFromRecord({
      id: this.createId(),
      title: result.title,
      subtitle: result.subtitle,
      notes: result.openingMessage,
      type: 'note',
      scope: 'place',
      status: 'saved',
      rating: 5,
      imageUrl: result.imageUrl,
      imageUrls: result.imageUrl ? [result.imageUrl] : [],
      tags: ['talking-card', 'conversational-guide'],
      tour: null,
      conversation: {
        version: 1,
        provider: 'atlas',
        atlasId: result.atlasId,
        openingMessage: result.openingMessage,
        ctaLabel: result.ctaLabel,
      },
      createdAt: now,
      updatedAt: now,
    });
    if (!card) return;
    const cards = result.placement === 'start' ? [card, ...board.cards] : [...board.cards, card];
    const nextBoard = { ...board, cards, updatedAt: now };
    this.boards.update((boards) => boards.map((item) => item.id === board.id ? nextBoard : item));
    this.closeTalkingCardEditor();
    await this.persistAndReplaceBoard(nextBoard);
  }

  isTalkingCard(card: Pick<BoardCard, 'conversation'> | null | undefined): boolean {
    return !!card?.conversation?.atlasId;
  }

  talkingCardButtonLabel(card: Pick<BoardCard, 'conversation'>): string {
    return talkingCardCtaLabel(card.conversation);
  }

  openTalkingCardConversation(card: BoardCard, event?: Event, surface: 'board' | 'live' = 'board'): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!card.conversation?.atlasId) return;
    this.stopStackPlayback();
    this.stopTourSpeech();
    this.stopSongPreview();
    this.stopStackAudioPreview();
    this.stopStackVoicePreview();
    this.spotify.closeEmbeddedPlayer();
    if (this.spotify.playing()) void this.spotify.togglePlayback();
    this.talkingConversationSurface.set(surface);
    this.talkingConversationCardId.set(card.id);
    this.boardAnalytics.trackTalkingCard('talking_card_open', card.id);
  }

  trackTalkingCardActivity(card: BoardCard, activity: 'message' | 'voice_start' | 'voice_end'): void {
    this.boardAnalytics.trackTalkingCard(
      activity === 'message'
        ? 'talking_card_message'
        : activity === 'voice_start'
          ? 'talking_card_voice_start'
          : 'talking_card_voice_end',
      card.id,
    );
  }

  closeTalkingCardConversation(): void {
    this.talkingConversationCardId.set(null);
    // Deliberately remain paused in Live view. The visitor explicitly resumes the flow.
  }

  openCreateCard(boardId = this.selectedBoard()?.id ?? null): void {
    const board = this.boards().find((item) => item.id === boardId);
    if (!board || !this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can add cards.`);
      return;
    }
    void this.ensureCitiesLoaded();
    const songMode = this.isSongBoard(board);
    this.selectedBoardId.set(boardId);
    this.imageUploadError.set(null);
    this.resetCardWizard();
    this.cardImageLocked.set(false);
    this.editingCardId.set(null);
    this.editingCardBoardId.set(board.id);
    this.relatedCardParentId.set(null);
    this.relatedCardEditingId.set(null);
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
      youtubeReference: '',
      youtubeVideoId: '',
      youtubeVideoTitle: '',
      youtubeChannelTitle: '',
      youtubeThumbnailUrl: '',
      youtubeDurationSeconds: 0,
      youtubeMatchConfidence: 0,
      youtubeVerifiedAt: '',
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

  openEditCard(card: BoardCard, boardOverride?: Board): void {
    const board = boardOverride ?? this.selectedBoard();
    if (!board || !this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can edit cards.`);
      return;
    }
    void this.ensureCitiesLoaded();
    this.relatedCardParentId.set(null);
    this.relatedCardEditingId.set(null);
    this.editingCardId.set(card.id);
    this.editingCardBoardId.set(board.id);
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
      youtubeReference: youtubeWatchUrl(card.youtubeVideoId ?? ''),
      youtubeVideoId: card.youtubeVideoId ?? '',
      youtubeVideoTitle: card.youtubeVideoTitle ?? '',
      youtubeChannelTitle: card.youtubeChannelTitle ?? '',
      youtubeThumbnailUrl: card.youtubeThumbnailUrl ?? '',
      youtubeDurationSeconds: card.youtubeDurationSeconds ?? 0,
      youtubeMatchConfidence: card.youtubeMatchConfidence ?? 0,
      youtubeVerifiedAt: card.youtubeVerifiedAt ?? '',
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
    this.editingCardBoardId.set(null);
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
    this.openCreateCard(board.id);
    this.relatedCardParentId.set(parent.id);
    this.relatedCardEditingId.set(null);
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

  scrollToBoardContent(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.isBrowser) {
      return;
    }

    const contentSelector = this.isSongBoard(board)
      ? '.board-detail--song .music-services, .board-detail--song .song-deck'
      : this.isTourBoard(board)
        ? '.tour-view-bar, .tour-board'
        : '.board-editorial-section-heading, .detail-cards-grid';
    const target = window.document.querySelector<HTMLElement>(contentSelector)
      ?? window.document.getElementById('board-content');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  openRelatedCardManager(card: BoardCard, event?: Event): void {
    void this.openBoardInside(card, event);
  }

  async openBoardInside(card: BoardCard, event?: Event, parentBoardOverride?: Board): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    this.boardAnalytics.trackCardOpen(card.id);
    const parentBoard = parentBoardOverride ?? this.originalSelectedBoard();
    if (!parentBoard) {
      return;
    }
    const childBoardId = card.childBoardId?.trim() ?? '';
    if (childBoardId) {
      if (this.isAlongsideBoardInsideActive(parentBoard, card)) {
        this.activeAlongsideBoardIds.update((activeIds) => {
          const next = new Set(activeIds);
          next.delete(childBoardId);
          return next;
        });
        this.closeCardActionMenu();
        return;
      }
      let childBoard = this.boards().find((board) => board.id === childBoardId) ?? null;
      if (!childBoard) {
        childBoard = await this.loadBoardById(childBoardId);
        if (childBoard) {
          this.boards.update((boards) => boards.some((board) => board.id === childBoard!.id)
            ? boards
            : [childBoard!, ...boards]);
        }
      }
      if (!childBoard) {
        this.boardsSyncError.set('The board inside this card could not be loaded.');
        return;
      }
      if (this.canUseAlongsideBoardInside(parentBoard)) {
        this.activeAlongsideBoardIds.set(new Set([childBoard.id]));
        this.cardDialogOpen.set(false);
        this.editingCardId.set(null);
        this.closeCardActionMenu();
        return;
      }
      this.cardDialogOpen.set(false);
      this.editingCardId.set(null);
      this.closeCardActionMenu();
      void this.router.navigate(['/boards', childBoard.id]);
      return;
    }
    if (!this.canEditBoard(parentBoard)) {
      if (this.relatedCardCount(card)) {
        this.exploreRelatedCards(card, undefined, true);
      }
      return;
    }

    this.cardDialogOpen.set(false);
    this.editingCardId.set(null);
    this.relatedCardParentId.set(null);
    this.relatedCardEditingId.set(null);
    this.creatingBoardInside.set({
      parentBoardId: parentBoard.id,
      parentCardId: card.id,
      parentBoardTitle: parentBoard.title,
      parentCardTitle: card.title,
    });
    this.imageUploadError.set(null);
    this.boardDraft.set({
      title: card.title,
      description: '',
      backNote: '',
      icon: 'dashboard_customize',
      tone: parentBoard.tone,
      visibility: parentBoard.visibility,
      imageUrl: card.imageUrl,
      logoUrl: '',
      logoLinkUrl: '',
      stackCtaLabel: '',
      stackCtaUrl: '',
      stickers: [],
    });
    this.boardDialogOpen.set(true);
  }

  private canUseAlongsideBoardInside(board: Board): boolean {
    return board.kind === 'standard'
      && !this.isSongBoard(board)
      && this.originalSelectedBoard()?.id === board.id
      && board.insideCardsDisplay === 'alongside';
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
    this.openEditCard(card);
    this.relatedCardParentId.set(parent.id);
    this.relatedCardEditingId.set(card.id);
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
        countMode: 'fixed',
        vibe: draft.type === 'memory' ? 'memory' : 'curator',
        narrationStyle: board.narrationStyle,
        narrationSecondsPerCard: normalizeBoardNarrationSeconds(board.narrationSecondsPerCard),
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
      notes: cardNotesForPersistence(draft.notes),
      type: draft.type,
      scope: generated?.scope ?? existing?.scope ?? 'place',
      status: generated?.status ?? existing?.status ?? 'saved',
      rating: generated?.rating ?? existing?.rating ?? 4,
      entityName: generated?.entity_name || existing?.entityName || title,
      entityType: generated?.entity_type || existing?.entityType || 'other',
      imageIntent: generated?.image_intent || existing?.imageIntent || 'other',
      imageContext: generated?.image_context || existing?.imageContext || parent.title,
      mediaKind: generated?.media_kind || existing?.mediaKind || 'none',
      shortSummary: generated?.short_summary || draft.subtitle.trim() || cardNotesSummary(draft.notes),
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

  canMoveRelatedCard(parent: BoardCard, cardId: string, direction: -1 | 1): boolean {
    const relatedCards = this.explicitRelatedCards(parent);
    const index = relatedCards.findIndex((card) => card.id === cardId);
    const target = index + direction;
    return index >= 0 && target >= 0 && target < relatedCards.length;
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
          countMode: 'fixed',
          vibe: 'traveler',
          narrationStyle: board.narrationStyle,
          narrationSecondsPerCard: normalizeBoardNarrationSeconds(board.narrationSecondsPerCard),
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
      notes: cardNotesForPersistence(draft.notes),
      type: 'place',
      scope: 'place',
      status: generated?.status ?? 'saved',
      rating: generated?.rating ?? 4,
      entityName: generated?.entity_name || title,
      entityType: 'place',
      imageIntent: 'place',
      imageContext: generated?.image_context || board.title,
      mediaKind: 'none',
      shortSummary: generated?.short_summary || draft.subtitle.trim() || cardNotesSummary(draft.notes),
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
    const editingBoardId = this.editingCardBoardId();
    const board = editingBoardId
      ? this.boards().find((candidate) => candidate.id === editingBoardId) ?? null
      : this.selectedBoard();
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
    const relatedParentId = this.relatedCardParentId();
    const relatedEditingId = this.relatedCardEditingId();
    const effectiveTags = relatedParentId
      ? this.mergeWizardTags(tags, ['related-card']).slice(0, 6)
      : tags;
    const cardFromDraft = (existing: BoardCard | null = null): BoardCard => ({
      ...(existing ?? {}),
      id: existing?.id ?? this.createId(),
      title,
      subtitle: draft.subtitle.trim(),
      notes: cardNotesForPersistence(draft.notes),
      type: cardType,
      entityType: existing?.type === cardType
        ? existing.entityType
        : cardType === 'place' || cardType === 'shop'
          ? 'place'
          : cardType === 'food'
            ? 'food'
            : 'other',
      scope: cardScope,
      status: draft.status,
      rating,
      imageUrl,
      imageUrls,
      ...(existing?.listingPresentation ? {
        listingPresentation: {
          ...existing.listingPresentation,
          sourcePhotoCount: imageUrls.length,
          presentationImageUrls: this.uniqueImageUrls([
            imageUrl,
            ...existing.listingPresentation.presentationImageUrls,
          ]).filter((url) => imageUrls.includes(url)).slice(0, 4),
        },
      } : {}),
      audioPreviewUrl: draft.audioPreviewUrl.trim(),
      spotifyTrackId: draft.spotifyTrackId.trim(),
      spotifyTrackUrl: draft.spotifyTrackUrl.trim(),
      spotifyUri: draft.spotifyUri.trim(),
      spotifyArtistName: draft.spotifyArtistName.trim(),
      spotifyAlbumName: draft.spotifyAlbumName.trim(),
      spotifyArtworkUrl: draft.spotifyArtworkUrl.trim(),
      videoIntent: !!draft.youtubeVideoId,
      videoSearchQuery: existing?.videoSearchQuery ?? '',
      youtubeVideoId: youtubeVideoIdFromReference(draft.youtubeVideoId || draft.youtubeReference),
      youtubeVideoTitle: draft.youtubeVideoTitle.trim(),
      youtubeChannelTitle: draft.youtubeChannelTitle.trim(),
      youtubeThumbnailUrl: draft.youtubeThumbnailUrl.trim(),
      youtubeDurationSeconds: Math.max(0, Math.min(86_400, Math.trunc(draft.youtubeDurationSeconds || 0))),
      youtubeMatchConfidence: Math.max(0, Math.min(1, draft.youtubeMatchConfidence || 0)),
      youtubeVerifiedAt: draft.youtubeVerifiedAt.trim(),
      placeId,
      googleMapsUrl,
      what3wordsAddress,
      tags: effectiveTags,
      stickers: draft.stickers,
      tour: songMode ? null : draftTour ?? existing?.tour ?? null,
      relatedCards: existing?.relatedCards ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    let nextBoard: Board | null = null;

    this.boards.update((boards) =>
      boards.map((item) => {
        if (item.id !== board.id) {
          return item;
        }

        let nextCards: BoardCard[];
        if (relatedParentId) {
          const parent = item.cards.find((card) => card.id === relatedParentId);
          if (!parent) {
            return item;
          }
          const currentNestedCards = this.explicitRelatedCards(parent);
          const existingNestedCard = relatedEditingId
            ? currentNestedCards.find((card) => card.id === relatedEditingId) ?? null
            : null;
          const nestedCard = {
            ...cardFromDraft(existingNestedCard),
            rank: existingNestedCard?.rank ?? currentNestedCards.length + 1,
          };
          const nextNestedCards = upsertNestedCard(currentNestedCards, nestedCard, relatedEditingId);
          nextCards = item.cards.map((card) => card.id === parent.id
            ? { ...card, relatedCards: nextNestedCards, updatedAt: now }
            : card);
        } else if (editingId) {
          nextCards = item.cards.map((card) => card.id === editingId ? cardFromDraft(card) : card);
        } else {
          nextCards = [cardFromDraft(), ...item.cards];
        }

        nextBoard = { ...item, cards: nextCards, updatedAt: now };
        return nextBoard;
      }),
    );

    if (nextBoard) {
      await this.persistAndReplaceBoard(nextBoard);
      if (!relatedParentId && editingId) {
        const updatedParentCard = this.boards()
          .find((candidate) => candidate.id === board.id)
          ?.cards.find((card) => card.id === editingId);
        const childBoard = updatedParentCard?.childBoardId
          ? this.boards().find((candidate) => candidate.id === updatedParentCard.childBoardId) ?? null
          : null;
        if (childBoard && childBoard.parentCardTitle !== title) {
          const renamedChild = { ...childBoard, parentCardTitle: title, updatedAt: now };
          this.boards.update((boards) => boards.map((candidate) => candidate.id === renamedChild.id ? renamedChild : candidate));
          await this.persistAndReplaceBoard(renamedChild);
        }
      }
    }
    this.closeCardDialog();
  }

  deleteCard(card: BoardCard, event?: Event, boardOverride?: Board): void {
    event?.preventDefault();
    event?.stopPropagation();
    const board = boardOverride ?? this.selectedBoard();
    if (!board) {
      return;
    }
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can delete cards.`);
      return;
    }
    this.cardDeleteCandidate.set({
      boardId: board.id,
      boardTitle: board.title,
      card,
      parentCardId: this.exploredRelatedCardParentId(),
    });
  }

  async duplicateCard(
    card: BoardCard,
    event?: Event,
    boardOverride?: Board,
    parentCardId?: string,
  ): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const requestedBoard = boardOverride ?? this.selectedBoard();
    const board = requestedBoard
      ? this.boards().find((candidate) => candidate.id === requestedBoard.id) ?? requestedBoard
      : null;
    if (!board || !this.canEditBoard(board)) {
      this.boardsSyncError.set('Only the board owner can duplicate cards.');
      return;
    }

    const now = new Date().toISOString();
    const duplicate = this.duplicateCardWithBoardInside(card, now);

    if (parentCardId) {
      const parent = board.cards.find((candidate) => candidate.id === parentCardId);
      const relatedCards = this.explicitRelatedCards(parent);
      const sourceIndex = relatedCards.findIndex((candidate) => candidate.id === card.id);
      if (!parent || sourceIndex < 0) {
        this.boardsSyncError.set('The card to duplicate could not be found.');
        return;
      }
      const nextRelatedCards = [...relatedCards];
      nextRelatedCards.splice(sourceIndex + 1, 0, duplicate);
      const rankedRelatedCards = nextRelatedCards.map((relatedCard, index) => ({
        ...relatedCard,
        rank: index + 1,
      }));
      const nextBoard: Board = {
        ...board,
        cards: board.cards.map((candidate) => candidate.id === parent.id
          ? { ...candidate, relatedCards: rankedRelatedCards, updatedAt: now }
          : candidate),
        updatedAt: now,
      };
      this.boards.update((boards) => boards.map((candidate) => candidate.id === board.id ? nextBoard : candidate));
      await this.persistAndReplaceBoard(nextBoard);
      return;
    }

    const sourceIndex = board.cards.findIndex((candidate) => candidate.id === card.id);
    if (sourceIndex < 0) {
      this.boardsSyncError.set('The card to duplicate could not be found.');
      return;
    }

    if (this.isTourBoard(board) && duplicate.tour) {
      const nextCards = insertTourCardAfter(board.cards, duplicate, card.id);
      const addedCard = nextCards.find((candidate) => candidate.id === duplicate.id) ?? duplicate;
      await this.saveTourCardMutation(board, nextCards, { addedCard });
      return;
    }

    const nextCards = [...board.cards];
    nextCards.splice(sourceIndex + 1, 0, duplicate);
    const nextBoard: Board = { ...board, cards: nextCards, updatedAt: now };
    this.boards.update((boards) => boards.map((candidate) => candidate.id === board.id ? nextBoard : candidate));
    await this.persistAndReplaceBoard(nextBoard);
  }

  private duplicateCardWithBoardInside(card: BoardCard, now: string): BoardCard {
    const duplicate = duplicateCardRecord(card, () => this.createId(), now);
    const childBoardId = card.childBoardId?.trim();
    const childBoard = childBoardId
      ? this.boards().find((candidate) => candidate.id === childBoardId) ?? null
      : null;
    if (!childBoard) {
      return duplicate;
    }
    return {
      ...duplicate,
      childBoardId: '',
      relatedCards: childBoard.cards.map((childCard, index) => ({
        ...duplicateCardRecord(childCard, () => this.createId(), now, false),
        rank: index + 1,
      })),
    };
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

    if (candidate.parentCardId) {
      const now = new Date().toISOString();
      const nextBoard: Board = {
        ...board,
        cards: board.cards.map((parent) => parent.id === candidate.parentCardId
          ? {
              ...parent,
              relatedCards: this.explicitRelatedCards(parent).filter((card) => card.id !== candidate.card.id),
              updatedAt: now,
            }
          : parent),
        updatedAt: now,
      };
      this.boards.update((boards) => boards.map((item) => item.id === board.id ? nextBoard : item));
      void this.persistAndReplaceBoard(nextBoard);
      return;
    }

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
      await this.deleteBoardInsideForCard(candidate.card);
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
      await this.persistAndReplaceBoard(nextBoard);
      await this.deleteBoardInsideForCard(candidate.card);
    }
  }

  private async deleteBoardInsideForCard(card: BoardCard): Promise<void> {
    const childBoardId = card.childBoardId?.trim();
    if (!childBoardId) {
      return;
    }
    const boardIds = new Set([
      childBoardId,
      ...this.nestedBoardsUnder(childBoardId).map((board) => board.id),
    ]);
    this.boards.update((boards) => boards.filter((board) => !boardIds.has(board.id)));
    await Promise.all(Array.from(boardIds, (boardId) => this.deleteRemoteBoard(boardId)));
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
    const board = this.originalSelectedBoard();
    const primaryCardIds = new Set(board?.cards.map((card) => card.id) ?? []);
    this.selectedCardIds.set(new Set(
      this.filteredCards().filter((card) => primaryCardIds.has(card.id)).map((card) => card.id),
    ));
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
    const editingBoard = this.editingBoardId()
      ? this.boards().find((board) => board.id === this.editingBoardId()) ?? null
      : null;
    if (visibility === 'private' && !this.canUsePrivateBoards() && !this.isNearbyGemsBoard(editingBoard)) {
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
    if (view === 'cards') {
      this.tourPublicPreview.set(false);
    }
    this.tourRouteError.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: view === 'cards' ? 'cards' : null },
      queryParamsHandling: 'merge',
    });
  }

  previewTourExperience(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.tourPublicPreview.set(true);
    this.tourBoardView.set('route');
    this.tourRouteError.set(null);
    if (this.isBrowser) {
      window.setTimeout(() => void this.renderTourMap(), 0);
    }
  }

  returnToTourStudio(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.tourPublicPreview.set(false);
    this.tourBoardView.set('route');
    this.tourRouteError.set(null);
    if (this.isBrowser) {
      window.setTimeout(() => void this.renderTourMap(), 0);
    }
  }

  selectTourStopOffset(direction: -1 | 1, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const cards = this.selectedBoardTourCards();
    if (!cards.length) return;
    const currentIndex = this.selectedTourCardIndex();
    const nextIndex = Math.max(0, Math.min(cards.length - 1, currentIndex + direction));
    const card = cards[nextIndex];
    if (card) void this.focusTourStop(card, false);
  }

  canSelectTourStopOffset(direction: -1 | 1): boolean {
    const index = this.selectedTourCardIndex();
    const count = this.selectedBoardTourCards().length;
    return index >= 0 && index + direction >= 0 && index + direction < count;
  }

  tourStopPositionLabel(): string {
    const index = this.selectedTourCardIndex();
    const count = this.selectedBoardTourCards().length;
    return count && index >= 0 ? `${index + 1} of ${count}` : `0 of ${count}`;
  }

  tourStopTravelLabel(card: BoardCard): string {
    const next = this.nextTourCard(card);
    if (!next) return 'End of tour';
    return card.tour?.legToNext?.durationText
      ? `${card.tour.legToNext.durationText} to next stop`
      : 'Next stop ready';
  }

  tourStopReadyItems(card: BoardCard): Array<{ label: string; ready: boolean }> {
    return [
      {
        label: 'Location',
        ready: this.hasTourCoordinates(card) || !!card.tour?.address?.trim() || !!card.subtitle.trim(),
      },
      { label: 'Photo', ready: !!this.cardMediaPoster(card) },
      { label: 'Story', ready: !!card.notes.trim() },
      { label: 'Audio', ready: !!card.tour?.guideScript?.trim() },
    ];
  }

  tourStopReadyPercent(card: BoardCard): number {
    const items = this.tourStopReadyItems(card);
    return Math.round(items.filter((item) => item.ready).length / items.length * 100);
  }

  songCards(board: Board | null): BoardCard[] {
    if (!board) {
      return [];
    }
    return board.cards.filter((card) => this.isSongCard(card));
  }

  talkingCards(board: Board | null): BoardCard[] {
    if (!board) return [];
    const query = this.cardSearch().trim().toLowerCase();
    return board.cards.filter((card) => this.isTalkingCard(card) && (!query || [card.title, card.subtitle, card.notes]
      .join(' ')
      .toLowerCase()
      .includes(query)));
  }

  selectSongCard(index: number, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.stopSongPreview();
    const lastIndex = Math.max(0, this.selectedSongCards().length - 1);
    const selectedIndex = Math.max(0, Math.min(index, lastIndex));
    this.songDeckIndex.set(selectedIndex);
    const card = this.selectedSongCards()[selectedIndex];
    if (card) this.boardAnalytics.trackCardOpen(card.id);
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

  playAllSongsHere(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.stopSongPreview();
    const queue = orderedSpotifyQueue(this.songCards(board).map((card) => {
      const track = this.spotifyTrackForCard(card, board);
      return {
        title: track.title,
        artist: track.artist,
        album: track.album,
        artworkUrl: track.artworkUrl,
        spotifyUri: track.uri,
        spotifyUrl: track.spotifyUrl,
        lookupContext: track.lookupContext,
      };
    }));
    if (!queue.length) return;
    this.musicServicesOpen.set(false);
    this.spotify.openEmbeddedQueue(queue);
  }

  musicProviderHref(
    provider: 'spotify' | 'apple' | 'youtube' | 'amazon',
    board: Board,
  ): string {
    const query = board.title.trim() || this.songCards(board)[0]?.title.trim() || 'music';
    const encodedQuery = encodeURIComponent(query);
    switch (provider) {
      case 'spotify':
        return `https://open.spotify.com/search/${encodedQuery}`;
      case 'apple':
        return `https://music.apple.com/us/search?term=${encodedQuery}`;
      case 'youtube':
        return `https://music.youtube.com/search?q=${encodedQuery}`;
      case 'amazon':
        return `https://music.amazon.com/search/${encodedQuery}`;
    }
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

  tourFrameNarration(frame: TourDeckFrame): string {
    if (frame.kind === 'leg' && frame.nextCard) {
      return effectiveTourHandoffText(
        frame.card,
        frame.nextCard,
        this.selectedBoard()?.kind === 'driving-tour' ? 'driving' : 'walking',
      );
    }
    return frame.card.tour?.guideScript || frame.card.notes || frame.card.subtitle;
  }

  tourFrameMeta(frame: TourDeckFrame): string {
    return frame.kind === 'leg'
      ? [frame.card.tour?.legToNext?.durationText, frame.card.tour?.legToNext?.distanceText]
          .map((value) => value?.trim() || '')
          .filter(Boolean)
          .join(' · ')
      : frame.card.tour?.address || frame.card.subtitle;
  }

  async speakTourFrame(frame = this.tourCurrentFrame()): Promise<void> {
    if (!this.isBrowser || !frame) {
      return;
    }
    const text = this.tourFrameNarration(frame);
    if (!text.trim()) {
      return;
    }
    this.stopTourSpeech();
    this.tourAudioNotice.set(null);
    const audioUrl = await this.ensureTourAudioUrl(
      this.tourAudioKey(frame),
      text,
      this.selectedBoard()?.stackNarratorVoiceId,
      this.selectedBoard()?.id,
    );
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

  private async ensureTourAudioUrl(
    key: string,
    text: string,
    narratorVoiceId?: string,
    boardId?: string,
    mode: 'tour' | 'stack-video' | 'stack-trailer' | 'voice-preview' = 'tour',
    cardId?: string,
    required = false,
    silent = false,
  ): Promise<string | null> {
    const normalizedNarratorVoiceId = narratorVoiceId
      ? normalizeStackNarratorVoiceId(narratorVoiceId)
      : '';
    const requestKey = this.narrationAudioRequestKey(key, normalizedNarratorVoiceId);
    const cached = this.tourAudioUrls.get(requestKey);
    if (cached) {
      return cached;
    }
    const pending = this.tourAudioPromises.get(requestKey);
    if (pending) {
      this.tourAudioLoadingKey.set(requestKey);
      return pending;
    }
    const functions = this.functions;
    if (!functions) {
      return null;
    }
    this.tourAudioLoadingKey.set(requestKey);
    const promise = (async () => {
      try {
        const callable = httpsCallable<
          { text: string; question?: string | null; anonymousVisitorId?: string | null; mode?: 'recap' | 'full' | 'tour' | 'stack-video' | 'stack-trailer' | 'voice-preview'; narratorVoiceId?: string | null; boardId?: string | null; cardId?: string | null },
          TourSpeechResponse
        >(functions, 'synthesizeChatAnswerSpeech', { timeout: 120_000 });
        const response = await callable({
          text: text.slice(0, 4000),
          question: $localize`Read this LivingWiki tour preview aloud with a lively human tour-guide voice.`,
          anonymousVisitorId: this.authService.uid() ? null : this.ensureTourAnonymousVisitorId(),
          mode,
          narratorVoiceId: normalizedNarratorVoiceId || null,
          boardId: boardId || null,
          cardId: cardId || null,
        });
        const audioUrl = response.data.audioUrl || (response.data.audioBase64 ? this.audioUrlFromBase64(response.data.audioBase64, response.data.contentType || 'audio/mpeg') : '');
        if (audioUrl) {
          this.tourAudioUrls.set(requestKey, audioUrl);
          return audioUrl;
        }
      } catch (error) {
        if (!silent) {
          this.tourAudioNotice.set(mode === 'stack-video'
            ? 'A video narration clip could not be created. The video will not be generated with missing narration.'
            : mode === 'voice-preview'
              ? 'The selected voice sample could not be loaded. Try again in a moment.'
              : 'ElevenLabs tour narration failed to generate. Check the function logs if this persists.');
        }
        if (!silent) {
          console.error('Narration audio generation failed.', error, { boardId, cardId, mode });
        }
        if (required) throw error;
      } finally {
        this.tourAudioPromises.delete(requestKey);
        if (this.tourAudioLoadingKey() === requestKey) {
          this.tourAudioLoadingKey.set(null);
        }
      }
      return null;
    })();
    this.tourAudioPromises.set(requestKey, promise);
    return promise;
  }

  private narrationAudioRequestKey(key: string, narratorVoiceId?: string): string {
    return `${narratorVoiceId || 'default'}:${key}`;
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
        const showCardNumbers = this.boardShowsCardNumbers(tourBoard);
        const markerContent = this.createTourMarkerElement(card, showCardNumbers);
        const marker = AdvancedMarkerElement
          ? new AdvancedMarkerElement({ map: this.tourMap, position, title: card.title, content: markerContent })
          : Marker
            ? new Marker({
                map: this.tourMap,
                position,
                title: showCardNumbers ? `${card.tour?.sequence}. ${card.title}` : card.title,
              })
            : null;
        if (!marker) {
          return;
        }
        const addListener = (marker as { addListener?: (name: string, listener: () => void) => void }).addListener;
        addListener?.call(marker, 'click', () => void this.focusTourStop(card, false));
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

  private createTourMarkerElement(card: BoardCard, showCardNumbers: boolean): HTMLElement {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'tour-map-marker';
    marker.dataset['cardId'] = card.id;
    marker.setAttribute(
      'aria-label',
      showCardNumbers ? `Preview stop ${card.tour?.sequence}: ${card.title}` : `Preview stop: ${card.title}`,
    );
    const label = document.createElement('span');
    label.textContent = showCardNumbers ? String(card.tour?.sequence ?? '') : '•';
    marker.appendChild(label);
    if (this.selectedTourCardId() === card.id) {
      marker.classList.add('tour-map-marker--active');
    }
    marker.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.focusTourStop(card, false);
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
    const collectionParent = this.relatedCardEditorParent();
    const contextCards = collectionParent ? this.explicitRelatedCards(collectionParent) : board.cards;
    const contextTitle = collectionParent ? `Inside ${collectionParent.title}` : board.title;
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
        targetBoardTitle: contextTitle,
        defaultType: likelyFood ? 'food' : draft.type,
        count: 1,
        countMode: 'fixed',
        vibe: this.wizardVibe(),
        narrationStyle: board.narrationStyle,
        narrationSecondsPerCard: normalizeBoardNarrationSeconds(board.narrationSecondsPerCard),
        existingCards: contextCards.slice(0, 80).map((card) => ({
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
    const collectionParent = this.relatedCardEditorParent();
    return [
      task,
      collectionParent ? `Collection inside card: ${collectionParent.title}` : `Board: ${board.title}`,
      collectionParent?.subtitle ? `Parent card context: ${collectionParent.subtitle}` : '',
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
    return isMusicBoard(board);
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

  boardDisplayIcon(board: Pick<Board, 'icon' | 'title' | 'description' | 'kind'>): string {
    return resolveBoardIcon(board.icon, board);
  }

  isNearbyGemsBoard(board: Board | null): boolean {
    if (!board) return false;
    if (board.kind === 'nearby-gems') return true;
    // Boards created by the original Nearby Gems callable were persisted as
    // `standard`, and icon normalization could replace `explore_nearby`.
    // The wizard provenance plus its server-authored card tag is the stable
    // legacy signature and cannot classify an ordinary hand-made board alone.
    return /\bnearby-gems\b/i.test(board.backNote)
      && board.cards.some((card) => card.tags.some((tag) => tag.toLocaleLowerCase() === 'nearby gem'));
  }

  nearbyGemsCardViews(board: Board): NearbyGemsBoardCardView[] {
    return board.cards.map((card, index) => {
      const legacyDuration = card.tags.map((tag) => tag.match(/^(\d+)\s*min away$/i)?.[1])
        .find((value): value is string => !!value);
      const subtitleCategory = card.subtitle.split('·').at(-1)?.trim() || 'Local discovery';
      return {
        id: card.id,
        title: card.title,
        category: card.nearby?.category || subtitleCategory,
        imageUrl: card.imageUrl,
        durationSeconds: card.nearby ? card.nearby.durationSeconds : legacyDuration ? Number(legacyDuration) * 60 : null,
        distanceMeters: card.nearby ? card.nearby.distanceMeters : null,
        measurement: card.nearby?.measurement ?? 'estimated',
        lat: Number.isFinite(card.locationLat) ? card.locationLat as number : null,
        lng: Number.isFinite(card.locationLng) ? card.locationLng as number : null,
        googleMapsUrl: card.googleMapsUrl,
        originalRank: card.rank && card.rank > 0 ? card.rank : index + 1,
      };
    });
  }

  nearbyGemsLocationLabel(board: Board): string {
    return board.nearbyGems?.locationLabel || board.title.replace(/^Gems near\s+/i, '').trim() || 'your area';
  }

  async toggleNearbyGemsVisibility(board: Board, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canEditBoard(board) || this.nearbyGemsVisibilitySavingId()) return;
    const nextVisibility: BoardVisibility = board.visibility === 'private' ? 'public' : 'private';
    if (nextVisibility === 'public' && this.isBrowser) {
      const confirmed = window.confirm(
        'Make this Gems board public? Anyone with the link will see the saved places and broad area label. Your precise starting point was never stored.',
      );
      if (!confirmed) return;
    }
    this.nearbyGemsVisibilitySavingId.set(board.id);
    this.nearbyGemsVisibilityMessage.set('');
    const saved = await this.persistVisibilityAndReplaceBoard({
      ...board,
      visibility: nextVisibility,
      updatedAt: new Date().toISOString(),
    });
    this.nearbyGemsVisibilitySavingId.set(null);
    this.nearbyGemsVisibilityMessage.set(saved
      ? nextVisibility === 'public'
        ? 'This board is now public. Your starting point remains private.'
        : 'This board is private again. Only you can open it.'
      : 'Visibility could not be changed. Please try again.');
  }

  boardCategoryLabel(board: Board): string {
    if (this.isSongBoard(board)) return 'Music';
    if (this.isNearbyGemsBoard(board)) return 'Nearby gems';
    if (board.kind === 'walking-tour' || board.kind === 'driving-tour') return 'Tour';
    if (board.kind === 'off-grid') return 'Off-grid';
    return 'Board';
  }

  cardTypeLabel(type: BoardCardType): string {
    return this.cardTypes.find((item) => item.id === type)?.label ?? 'Note';
  }

  isLocationCardType(type: BoardCardType): boolean {
    return type === 'place' || type === 'food' || type === 'shop';
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
    this.boardAnalytics.trackCardOpen(card.id);
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

  boardInsideFor(card: BoardCard): Board | null {
    const childBoardId = card.childBoardId?.trim();
    return childBoardId
      ? this.boards().find((board) => board.id === childBoardId) ?? null
      : null;
  }

  boardInsideCards(card: BoardCard): BoardCard[] {
    return this.boardInsideFor(card)?.cards ?? this.relatedCardsFor(card);
  }

  boardInsideCardCount(card: BoardCard): number {
    return this.boardInsideCards(card).length;
  }

  hasBoardInside(card: BoardCard): boolean {
    return !!card.childBoardId?.trim();
  }

  boardInsideTitle(card: BoardCard): string {
    return this.boardInsideFor(card)?.title
      ?? (this.hasBoardInside(card) ? 'Board inside' : `Create board from ${this.relatedCardCount(card)} existing card${this.relatedCardCount(card) === 1 ? '' : 's'}`);
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

  exploreRelatedCards(card: BoardCard, event?: Event, allowEmpty = false): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!allowEmpty && !this.relatedCardCount(card)) {
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

  hasYoutubeVideo(card: Pick<BoardCard, 'youtubeVideoId'> | BoardWizardPreviewCard): boolean {
    return !!youtubeVideoIdFromReference(card.youtubeVideoId);
  }

  cardMediaPoster(card: Pick<BoardCard, 'imageUrl' | 'imageUrls' | 'youtubeVideoId' | 'youtubeThumbnailUrl'>): string {
    return this.hasYoutubeVideo(card) && card.youtubeThumbnailUrl
      ? card.youtubeThumbnailUrl
      : this.currentCardImage(card as BoardCard);
  }

  youtubeVideoHref(card: Pick<BoardCard, 'youtubeVideoId'> | BoardWizardPreviewCard): string {
    return youtubeWatchUrl(card.youtubeVideoId ?? '');
  }

  youtubeVideoEmbedUrl(card: Pick<BoardCard, 'youtubeVideoId'>): SafeResourceUrl | null {
    const videoId = youtubeVideoIdFromReference(card.youtubeVideoId);
    if (!videoId) return null;
    const cached = this.youtubeEmbedUrls.get(videoId);
    if (cached) return cached;
    const embedUrl = youtubePrivacyEmbedUrl(videoId);
    if (!embedUrl) return null;
    const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
    this.youtubeEmbedUrls.set(videoId, safeUrl);
    return safeUrl;
  }

  youtubeDurationLabel(seconds: number | undefined): string {
    const duration = Math.max(0, Math.trunc(seconds ?? 0));
    if (!duration) return '';
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const remainingSeconds = duration % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
      : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  openCardVideoViewer(card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.hasYoutubeVideo(card)) return;
    this.boardAnalytics.trackCardOpen(card.id);
    this.closeCardPhotoViewer();
    this.cardVideoRepairNotice.set(null);
    this.cardVideoViewerCardId.set(card.id);
  }

  openWizardCardVideoViewer(card: BoardWizardPreviewCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.hasYoutubeVideo(card)) return;
    this.cardVideoViewerCardId.set(card.id);
  }

  closeCardVideoViewer(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.cardVideoViewerCardId.set(null);
    this.cardVideoRepairNotice.set(null);
  }

  canRepairCardVideo(card: Pick<BoardCard, 'id'>): boolean {
    const board = this.originalSelectedBoard();
    return !!board && this.canEditBoard(board) && board.cards.some((candidate) => candidate.id === card.id);
  }

  async repairCardVideo(card: Pick<BoardCard, 'id'>, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.originalSelectedBoard();
    const sourceCard = board?.cards.find((candidate) => candidate.id === card.id) ?? null;
    const failedVideoId = youtubeVideoIdFromReference(sourceCard?.youtubeVideoId);
    if (!board || !sourceCard || !failedVideoId || !this.functions || !this.canEditBoard(board) || this.cardVideoRepairing()) {
      return;
    }
    this.cardVideoRepairing.set(true);
    this.cardVideoRepairNotice.set('Finding another verified player…');
    try {
      const callable = httpsCallable<Record<string, unknown>, unknown>(this.functions, 'resolveBoardCardVideos', {
        timeout: 55_000,
      });
      const response = await callable({
        boardTitle: board.title,
        boardDescription: board.description,
        prompt: `${board.title} · ${board.description}`,
        cards: [{
          cardId: sourceCard.id,
          title: sourceCard.title,
          subtitle: sourceCard.subtitle,
          notes: sourceCard.notes,
          entityName: sourceCard.entityName || sourceCard.title,
          entityType: sourceCard.entityType || '',
          imageContext: sourceCard.imageContext || '',
          tags: sourceCard.tags,
          videoIntent: true,
          videoSearchQuery: sourceCard.videoSearchQuery || '',
          youtubeReference: '',
          excludeVideoIds: [failedVideoId],
        }],
      });
      const data = response.data && typeof response.data === 'object'
        ? response.data as Record<string, unknown>
        : {};
      const matchValue = Array.isArray(data['matches']) ? data['matches'][0] : null;
      const match = matchValue && typeof matchValue === 'object'
        ? matchValue as Record<string, unknown>
        : null;
      const replacementId = youtubeVideoIdFromReference(match?.['youtubeVideoId']);
      if (!match || !replacementId || replacementId === failedVideoId) {
        this.cardVideoRepairNotice.set('No equally relevant playable replacement was found. You can still watch this video on YouTube.');
        return;
      }
      const now = new Date().toISOString();
      const replacementCard: BoardCard = {
        ...sourceCard,
        videoIntent: true,
        youtubeVideoId: replacementId,
        youtubeVideoTitle: this.stringValue(match['youtubeVideoTitle'], sourceCard.title, 300),
        youtubeChannelTitle: this.stringValue(match['youtubeChannelTitle'], '', 200),
        youtubeThumbnailUrl: this.stringValue(match['youtubeThumbnailUrl'], sourceCard.youtubeThumbnailUrl || '', 2000),
        youtubeDurationSeconds: this.numberValue(match['youtubeDurationSeconds'], 0, 0, 86_400),
        youtubeMatchConfidence: this.numberValue(match['youtubeMatchConfidence'], 0, 0, 1),
        youtubeVerifiedAt: this.stringValue(match['youtubeVerifiedAt'], now, 80),
        updatedAt: now,
      };
      const saved = await this.persistAndReplaceBoard({
        ...board,
        cards: board.cards.map((candidate) => candidate.id === sourceCard.id ? replacementCard : candidate),
        updatedAt: now,
      });
      this.cardVideoRepairNotice.set(saved
        ? 'A verified playable replacement is ready.'
        : 'A replacement was found, but it could not be saved. Please try again.');
    } catch (error) {
      console.error('Card video replacement failed.', error, { boardId: board.id, cardId: sourceCard.id });
      this.cardVideoRepairNotice.set('Another playable video could not be found right now. Please try again.');
    } finally {
      this.cardVideoRepairing.set(false);
    }
  }

  onCardYoutubeReferenceInput(value: string): void {
    const videoId = youtubeVideoIdFromReference(value);
    this.cardDraft.update((draft) => {
      const changed = videoId !== draft.youtubeVideoId;
      return {
        ...draft,
        youtubeReference: value,
        youtubeVideoId: videoId,
        youtubeVideoTitle: changed ? '' : draft.youtubeVideoTitle,
        youtubeChannelTitle: changed ? '' : draft.youtubeChannelTitle,
        youtubeThumbnailUrl: changed ? '' : draft.youtubeThumbnailUrl,
        youtubeDurationSeconds: changed ? 0 : draft.youtubeDurationSeconds,
        youtubeMatchConfidence: changed ? 0 : draft.youtubeMatchConfidence,
        youtubeVerifiedAt: changed ? '' : draft.youtubeVerifiedAt,
      };
    });
    this.imageUploadError.set(value.trim() && !videoId
      ? $localize`Enter a valid YouTube watch, share, Shorts, Live, or embed URL.`
      : null);
  }

  async applyWizardCardYoutubeReference(cardId: string, value: string): Promise<void> {
    const videoId = youtubeVideoIdFromReference(value);
    if (!videoId) {
      this.wizardCardEditorError.set($localize`Enter a valid YouTube watch, share, Shorts, Live, or embed URL.`);
      return;
    }
    this.wizardCardEditorError.set(null);
    // Keep a currently verified video in place until its replacement has also
    // been verified. A typo, removed video, or transient lookup failure should
    // never downgrade a good card.
    await this.refreshWizardCardVideo(cardId, videoId);
  }

  openCardPhotoViewer(card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.cardImages(card).length) {
      return;
    }
    this.boardAnalytics.trackCardOpen(card.id);
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
    if (this.collectionCreateOpen()) {
      return;
    }
    if (this.stackDocsExportDialogOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeStackDocsExportDialog();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(document.querySelectorAll<HTMLElement>(
          '.stack-doc-export-dialog button:not([disabled]), .stack-doc-export-dialog input:not([disabled]), .stack-doc-export-dialog summary, .stack-doc-export-dialog [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.offsetParent !== null);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (first && last && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    }
    if (event.key === 'Escape' && this.wizardOpen()) {
      event.preventDefault();
      void this.closeBoardWizard();
      return;
    }
    if (event.key === 'Escape' && this.stackVoiceLibraryOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.closeStackVoiceLibrary();
      return;
    }
    if (event.key === 'Tab' && this.stackVoiceLibraryOpen()) {
      const focusable = Array.from(this.stackVoiceLibrary?.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first && last && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
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
    if (event.key === 'Escape' && this.cardVideoViewerCard()) {
      event.preventDefault();
      this.closeCardVideoViewer();
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

  @HostListener('document:click', ['$event'])
  closeCardActionMenuOnOutsideClick(event?: MouseEvent): void {
    this.closeCardActionMenu();
    this.closeBoardTranslationMenu();
    const target = event?.target;
    if (!(target instanceof Element)) return;
    window.document.querySelectorAll<HTMLDetailsElement>('.board-editorial-hero__more[open]')
      .forEach((menu) => {
        if (!menu.contains(target)) {
          menu.open = false;
        }
      });
    const anchor = target.closest<HTMLAnchorElement>('app-boards a[href]');
    if (!anchor) return;
    try {
      const destination = new URL(anchor.href, window.location.origin);
      if (destination.origin === window.location.origin) return;
      const cardId = anchor.closest<HTMLElement>('[data-analytics-card-id]')?.dataset['analyticsCardId'] ?? '';
      this.boardAnalytics.trackOutboundClick(cardId, destination.toString());
    } catch {
      // Analytics must never interfere with navigation.
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

  openEditCardPhotos(card: BoardCard, event?: Event, boardOverride?: Board): void {
    event?.stopPropagation();
    this.openEditCard(card, boardOverride);
    if (this.isBrowser) {
      window.requestAnimationFrame(() => {
        window.document.getElementById('card-photo-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  openEditRelatedCardPhotos(parentId: string, card: BoardCard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.openEditRelatedCard(parentId, card);
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
    if (!board.cards.some((card) => !this.isTalkingCard(card))) {
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
    return boardQuizEligibleCardCount(board.cards.filter((card) => !this.isTalkingCard(card)));
  }

  startBoardStudy(sourceCardId?: string): void {
    const board = this.boardLearnBoard();
    const cards = this.boardLearnCards();
    if (!board || !cards.length) {
      return;
    }
    const index = sourceCardId ? cards.findIndex((card) => card.id === sourceCardId) : 0;
    this.boardLearnStudyIndex.set(index >= 0 ? index : 0);
    this.boardLearnStudyRevealed.set(false);
    this.boardLearnView.set('study');
  }

  stepBoardStudy(direction: number): void {
    const cards = this.boardLearnCards();
    if (!cards.length) {
      return;
    }
    const next = (this.boardLearnStudyIndex() + direction + cards.length) % cards.length;
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
    const generated = draft ?? buildBoardLearningQuiz({ ...board, cards: board.cards.filter((card) => !this.isTalkingCard(card)) });
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

  boardCardCount(board: Board): number {
    return board.isSummary ? board.summaryCardCount ?? 0 : board.cards.length;
  }

  boardFavoriteCardCount(board: Board): number {
    return board.isSummary
      ? board.summaryFavoriteCardCount ?? 0
      : board.cards.filter((card) => card.status === 'favorite').length;
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
    return !!board
      && board.visibility === 'public'
      && !!uid
      && !!board.ownerUserId
      && board.ownerUserId !== uid;
  }

  async forkBoard(board: Board, event?: Event, navigateToCopy = true): Promise<Board | null> {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canForkBoard(board) || this.boardForkingId()) {
      return null;
    }
    this.boardForkingId.set(board.id);
    const now = new Date().toISOString();
    const forked: Board = {
      ...board,
      ...this.currentOwnerSnapshot(),
      id: this.createId(),
      sortOrder: this.nextBoardSortOrder(),
      forkedFromBoardId: board.id,
      forkedFromTitle: board.title,
      forkedFromOwnerUserId: board.ownerUserId,
      forkedFromOwnerName: this.ownerName(board),
      socialVideoUrl: '',
      socialVideoMimeType: '',
      socialVideoUpdatedAt: '',
      socialVideoRatio: 'vertical',
      socialVideoAudioTrackId: DEFAULT_STACK_AUDIO_TRACK_ID,
      socialVideoAudioVolume: DEFAULT_STACK_AUDIO_VOLUME,
      socialVideoNarrationEnabled: true,
      socialLandscapeVideoUrl: '',
      socialLandscapeVideoMimeType: '',
      socialLandscapeVideoUpdatedAt: '',
      socialLandscapeVideoRenderVersion: '',
      socialLandscapeVideoDurationSeconds: 0,
      socialVideoClosingHeadline: 'Keep exploring',
      socialVideoClosingMessage: '',
      socialVideoClosingShowQrCode: true,
      socialVideoClosingImage: 'cover',
      socialVideoClosingCustomImageUrl: '',
      socialVideoClosingDurationSeconds: 3,
      trailerVideoUrl: '',
      trailerVideoMimeType: '',
      trailerVideoUpdatedAt: '',
      trailerVideoRatio: 'vertical',
      trailerVideoAudioTrackId: DEFAULT_STACK_AUDIO_TRACK_ID,
      trailerVideoAudioVolume: DEFAULT_STACK_AUDIO_VOLUME,
      trailerVideoNarrationEnabled: true,
      trailerVideoScript: '',
      trailerVideoSourceFingerprint: '',
      trailerVideoCardIds: [],
      trailerVideoDurationSeconds: 0,
      trailerLandscapeVideoUrl: '',
      trailerLandscapeVideoMimeType: '',
      trailerLandscapeVideoUpdatedAt: '',
      trailerLandscapeVideoRenderVersion: '',
      trailerLandscapeVideoDurationSeconds: 0,
      stackNarratorVoiceId: DEFAULT_STACK_NARRATOR_VOICE_ID,
      parentBoardId: '',
      parentCardId: '',
      parentBoardTitle: '',
      parentCardTitle: '',
      cards: board.cards.map((card) => ({
        ...card,
        id: this.createId(),
        childBoardId: '',
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
      if (navigateToCopy) {
        await this.router.navigate(['/boards', persisted.id]);
      }
      return persisted;
    } catch (error) {
      console.error('Board fork failed', error, { boardId: board.id });
      this.boardsSyncError.set($localize`Could not make a copy of this board. Please try again.`);
      return null;
    } finally {
      this.boardForkingId.set(null);
    }
  }

  async makeStackCopyAndContinue(board: Board, mode: 'trailer' | 'video'): Promise<void> {
    const forked = await this.forkBoard(board, undefined, false);
    if (!forked) return;
    await this.router.navigate(['/boards', forked.id]);
    this.prepareStackForBoard(forked);
    this.sharePanelOpen.set(false);
    this.stackStudioOpen.set(false);
    this.stackDirectView.set(false);
    this.stackShareMode.set(mode);
    this.stackShareDialogOpen.set(true);
    this.stackPublishedVideoReady.set(false);
    this.stackPublishedTrailerReady.set(false);
    this.setStackShareMessage('Your copy is ready. You can now create and share its video.', false);
  }

  signInToCopyBoard(board: Board): void {
    const redirectTo = `${this.boardPagePath(board)}?share=1`;
    void this.router.navigate(['/sign-in'], { queryParams: { redirectTo } });
  }

  toggleBoardLike(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    void this.toggleLikeTarget({ boardId: board.id });
  }

  boardCoverFailed(boardId: string): boolean {
    return this.failedBoardCoverIds().has(boardId);
  }

  handleBoardCoverError(boardId: string): void {
    this.failedBoardCoverIds.update((failed) => new Set(failed).add(boardId));
  }

  handleBoardCoverLoad(boardId: string): void {
    if (!this.failedBoardCoverIds().has(boardId)) return;
    this.failedBoardCoverIds.update((failed) => {
      const next = new Set(failed);
      next.delete(boardId);
      return next;
    });
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
    void this.toggleLikeTarget({ boardId: board.id, cardId: card.id });
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

  boardLikeCount(board: Board | null | undefined): number {
    return board ? this.likeCounts()[boardLikeTargetKey({ boardId: board.id })] ?? 0 : 0;
  }

  cardLikeCount(board: Board | null | undefined, card: BoardCard): number {
    return board
      ? this.likeCounts()[boardLikeTargetKey({ boardId: board.id, cardId: card.id })] ?? 0
      : 0;
  }

  isLikePending(board: Board, card?: BoardCard): boolean {
    return this.pendingLikeIds().has(boardLikeTargetKey({ boardId: board.id, cardId: card?.id }));
  }

  private async syncLikeMetrics(targets: BoardLikeTarget[]): Promise<void> {
    try {
      this.applyLikeMetrics(await this.boardLikes.getMetrics(targets));
    } catch {
      // The existing local state remains usable when the network is unavailable.
    }
  }

  private async toggleLikeTarget(target: BoardLikeTarget): Promise<void> {
    const targetKey = boardLikeTargetKey(target);
    if (this.pendingLikeIds().has(targetKey)) return;

    const localId = target.cardId ? `${target.boardId}:${target.cardId}` : target.boardId;
    const likedSignal = target.cardId ? this.likedCardIds : this.likedBoardIds;
    const wasLiked = likedSignal().has(localId);
    const previousCount = this.likeCounts()[targetKey] ?? 0;
    this.setLikeState(target, !wasLiked, Math.max(0, previousCount + (wasLiked ? -1 : 1)));
    this.pendingLikeIds.update((ids) => new Set(ids).add(targetKey));
    this.saveBoardActionState();

    try {
      this.applyLikeMetrics([await this.boardLikes.toggle(target)]);
    } catch {
      this.setLikeState(target, wasLiked, previousCount);
    } finally {
      this.pendingLikeIds.update((ids) => {
        const next = new Set(ids);
        next.delete(targetKey);
        return next;
      });
      this.saveBoardActionState();
    }
  }

  private applyLikeMetrics(metrics: BoardLikeMetric[]): void {
    metrics.forEach((metric) => this.setLikeState(metric, metric.liked, metric.likeCount));
    this.saveBoardActionState();
  }

  private setLikeState(target: BoardLikeTarget, liked: boolean, likeCount: number): void {
    const localId = target.cardId ? `${target.boardId}:${target.cardId}` : target.boardId;
    const likedSignal = target.cardId ? this.likedCardIds : this.likedBoardIds;
    likedSignal.update((ids) => {
      const next = new Set(ids);
      if (liked) next.add(localId);
      else next.delete(localId);
      return next;
    });
    this.likeCounts.update((counts) => ({
      ...counts,
      [boardLikeTargetKey(target)]: Math.max(0, Math.trunc(likeCount)),
    }));
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
      this.likedBoardIds.set(this.stringSet(data['l'] ?? data['likedBoardIds']));
      this.savedBoardIds.set(this.stringSet(data['s'] ?? data['savedBoardIds']));
      this.likedCardIds.set(this.stringSet(data['c'] ?? data['likedCardIds']));
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
      l: [...this.likedBoardIds()],
      s: [...this.savedBoardIds()],
      c: [...this.likedCardIds()],
    }));
    window.dispatchEvent(new Event('livingwiki:saved-boards-changed'));
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
    const opening = !this.sharePanelOpen();
    this.sharePanelOpen.set(opening);
    if (!opening) {
      this.closeBoardEmailShare();
    }
    this.setShareMessage(null);
  }

  toggleBoardEmailShare(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (board.visibility !== 'public') {
      this.setShareMessage('Only public boards can be emailed.');
      return;
    }
    const opening = this.boardEmailShareOpenId() !== board.id;
    this.boardEmailShareOpenId.set(opening ? board.id : null);
    this.boardEmailShareRecipient.set('');
    this.boardEmailShareError.set(null);
  }

  closeBoardEmailShare(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.boardEmailShareSending()) return;
    this.boardEmailShareOpenId.set(null);
    this.boardEmailShareRecipient.set('');
    this.boardEmailShareError.set(null);
  }

  updateBoardEmailShareRecipient(value: string): void {
    this.boardEmailShareRecipient.set(value.slice(0, 320));
    this.boardEmailShareError.set(null);
  }

  signInToEmailBoard(): void {
    void this.router.navigate(['/sign-in'], { queryParams: { redirectTo: this.router.url } });
  }

  async sendBoardByEmail(board: Board, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.boardEmailShareSending()) return;
    if (!this.authService.isAuthenticated()) {
      this.signInToEmailBoard();
      return;
    }
    if (!this.functions || board.visibility !== 'public') {
      this.boardEmailShareError.set('Only public boards can be emailed.');
      return;
    }
    const email = this.boardEmailShareRecipient().trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.boardEmailShareError.set('Enter a valid email address.');
      return;
    }

    this.boardEmailShareSending.set(true);
    this.boardEmailShareError.set(null);
    try {
      const callable = httpsCallable<{ boardId: string; email: string }, { sent?: boolean }>(
        this.functions,
        'shareBoardByEmail',
      );
      await callable({ boardId: board.id, email });
      this.boardEmailShareOpenId.set(null);
      this.boardEmailShareRecipient.set('');
      this.setShareMessage(`Board emailed to ${email}.`, false);
    } catch (error) {
      this.boardEmailShareError.set(this.boardEmailShareErrorMessage(error));
    } finally {
      this.boardEmailShareSending.set(false);
    }
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
    if (board.visibility === 'public' && board.customSlug) {
      return `/boards/${encodeURIComponent(board.customSlug)}`;
    }
    return `${this.boardRouteRoot(board)}/${encodeURIComponent(board.id)}`;
  }

  boardPageUrl(board: Board): string {
    const path = this.boardPagePath(board);
    if (!this.isBrowser) {
      return path;
    }
    return `${window.location.origin}${path}`;
  }

  boardCustomUrl(board: Board): string {
    if (board.visibility !== 'public' || !board.customSlug?.trim()) {
      return '';
    }
    return this.boardPageUrl(board);
  }

  boardCustomUrlDisplay(board: Board): string {
    return this.boardCustomUrl(board).replace(/^https?:\/\//i, '');
  }

  async copyCustomBoardUrl(board: Board, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const url = this.boardCustomUrl(board);
    if (!url) return;

    if (await this.copyTextToClipboard(url)) {
      this.boardAnalytics.trackShare('custom_link_copy');
      this.customUrlCopiedBoardId.set(board.id);
      if (this.customUrlCopiedTimer) clearTimeout(this.customUrlCopiedTimer);
      this.customUrlCopiedTimer = setTimeout(() => {
        this.customUrlCopiedBoardId.set(null);
        this.customUrlCopiedTimer = null;
      }, 2200);
      return;
    }
    this.setShareMessage('Copy blocked. Select the custom board link instead.');
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
      this.boardAnalytics.trackShare('custom_link_copy');
      this.setShareMessage('Board link copied.');
    } else {
      this.setShareMessage('Copy blocked. The link is visible here.');
    }
  }

  async copyStackUrl(board: Board): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    if (this.isPhotoStudioDraft(board)) {
      this.setStackShareMessage('Publish the board before copying its Stack link.');
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

  showOriginalStackShareOptions(): void {
    this.setStackShareMode('live');
    this.setStackShareMessage('Choose where to share, or copy the live-view link.', false);
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
        this.boardAnalytics.trackShare('board_share');
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
    if (this.pendingPhotoStudioNotice?.boardId === board.id) {
      this.stackScriptError.set(this.pendingPhotoStudioNotice.message);
      this.pendingPhotoStudioNotice = null;
    }
    this.stackVoiceLibraryOpen.set(false);
    this.sharePanelOpen.set(false);
    this.stackStudioOpen.set(true);
    void this.loadPersonalNarratorVoice();
  }

  isPhotoStudioDraft(board: Board): boolean {
    return isBoardPhotoStudioDraft(board);
  }

  isPhotoStoryBoard(board: Board | null | undefined): boolean {
    return !!board && isBoardPhotoStory(board);
  }

  isEditingPhotoStoryCard(): boolean {
    const boardId = this.editingCardBoardId();
    return this.isPhotoStoryBoard(this.boards().find((board) => board.id === boardId));
  }

  stackPhotoDraftMissingCount(board: Board): number {
    return board.cards.filter((card) => !this.stackScriptNarration(card).trim()).length;
  }

  async publishPhotoStudioDraft(board: Board): Promise<void> {
    if (
      !this.isPhotoStudioDraft(board)
      || !this.canEditBoard(board)
      || this.stackPhotoDraftPublishing()
      || this.stackScriptSaving()
      || this.stackCoverSaving()
      || this.stackCoverImageUploading()
    ) {
      return;
    }
    if (!this.stackScriptBoardTitle().trim()) {
      this.stackScriptError.set('Add a board title before publishing.');
      return;
    }
    const missingCount = this.stackPhotoDraftMissingCount(board);
    if (missingCount) {
      this.stackScriptError.set(
        `Add narration for ${missingCount} photo${missingCount === 1 ? '' : 's'} before publishing.`,
      );
      return;
    }

    this.stackPhotoDraftPublishing.set(true);
    this.stackScriptError.set(null);
    try {
      if ((this.stackScriptDirty() || this.stackCoverDirty()) && !await this.saveStackScript(board)) {
        return;
      }
      const current = this.boards().find((candidate) => candidate.id === board.id) ?? null;
      if (!current || !this.isPhotoStudioDraft(current)) {
        throw new Error('This photo draft is no longer available.');
      }
      const published: Board = {
        ...current,
        visibility: 'public',
        photoStudioDraft: false,
        updatedAt: new Date().toISOString(),
      };
      if (!await this.persistAndReplaceBoard(published)) {
        throw new Error('The board could not be published. It is still private.');
      }
      this.setStackShareMessage('Board published. Its link and Stack are now ready to share.', false);
    } catch (error) {
      this.stackScriptError.set(error instanceof Error ? error.message : 'The board could not be published. It is still private.');
    } finally {
      this.stackPhotoDraftPublishing.set(false);
    }
  }

  openStackDocsExportDialog(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canUseStackStudio(board)) return;
    this.stackDocsExportDocumentTitle.set(`${this.stackScriptBoardTitle().trim() || board.title} — Script & Images`);
    this.stackDocsExportIncludeCover.set(true);
    this.stackDocsExportIncludeAllImages.set(true);
    this.stackDocsExportIncludeFinalCard.set(true);
    this.stackDocsExportIncludeProductionNotes.set(true);
    this.stackDocsExportError.set(null);
    this.docxExportService.release(this.stackDocsExportResult());
    this.stackDocsExportResult.set(null);
    this.stackDocsExportPhase.set(null);
    this.stackDocsExportDialogOpen.set(true);
    if (this.isBrowser) {
      window.setTimeout(() => document.querySelector<HTMLInputElement>('.stack-doc-export-title-field input')?.focus(), 0);
    }
  }

  closeStackDocsExportDialog(): void {
    if (this.stackDocsExporting()) return;
    this.stackDocsExportDialogOpen.set(false);
    this.stackDocsExportError.set(null);
    this.docxExportService.release(this.stackDocsExportResult());
    this.stackDocsExportResult.set(null);
    this.stackDocsExportPhase.set(null);
    if (this.isBrowser) {
      window.setTimeout(() => document.querySelector<HTMLButtonElement>('.stack-doc-export-trigger')?.focus(), 0);
    }
  }

  stackDocsExportPreviewSnapshot(): StackDocsExportSnapshot | null {
    const board = this.stackBoard();
    return board ? this.buildCurrentStackDocsSnapshot(board, 'preview-export') : null;
  }

  stackDocsExportPreviewImageCount(): number {
    const snapshot = this.stackDocsExportPreviewSnapshot();
    return snapshot ? stackDocsExportImageCount(snapshot) : 0;
  }

  stackDocsExportPreviewMissingCount(): number {
    const snapshot = this.stackDocsExportPreviewSnapshot();
    return snapshot ? stackDocsExportMissingNarrationCount(snapshot) : 0;
  }

  stackDocsExportPhaseLabel(): string {
    switch (this.stackDocsExportPhase()) {
      case 'preparing-images': return 'Preparing draft images…';
      case 'building-document': return 'Building and formatting your DOCX…';
      case 'downloading': return 'Starting your download…';
      default: return 'Download DOCX';
    }
  }

  async exportStackToDocx(board: Board): Promise<void> {
    if (this.stackDocsExporting() || !this.stackSelectedCount()) return;
    const requestId = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `docs-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const snapshot = this.buildCurrentStackDocsSnapshot(board, requestId);
    this.stackDocsExporting.set(true);
    this.stackDocsExportError.set(null);
    this.stackDocsExportResult.set(null);
    try {
      const result = await this.docxExportService.export(
        snapshot,
        (phase) => this.stackDocsExportPhase.set(phase),
      );
      this.stackDocsExportResult.set(result);
      this.stackDocsExportPhase.set(null);
    } catch (error) {
      this.stackDocsExportError.set(
        error instanceof Error ? error.message : 'The DOCX file could not be created.',
      );
      this.stackDocsExportPhase.set(null);
    } finally {
      this.stackDocsExporting.set(false);
    }
  }

  downloadStackDocxAgain(): void {
    const result = this.stackDocsExportResult();
    if (result) this.docxExportService.downloadAgain(result);
  }

  private buildCurrentStackDocsSnapshot(board: Board, requestId: string): StackDocsExportSnapshot {
    const audioTrack = this.stackSelectedAudioTrack();
    const ratio = this.stackRatios.find((item) => item.id === this.stackRatio());
    return buildStackDocsExportSnapshot({
      requestId,
      boardId: board.id,
      documentTitle: this.stackDocsExportDocumentTitle().trim() || `${this.stackScriptBoardTitle().trim() || board.title} — Script & Images`,
      sourceUrl: this.stackShareUrl(board),
      ownerName: this.ownerName(board),
      opening: {
        title: this.stackScriptBoardTitle().trim() || board.title,
        description: this.stackScriptBoardDescription(),
        coverImageUrl: this.stackStudioCoverImage(board),
      },
      cards: this.stackSelectedCards().map((card) => ({
        id: card.id,
        title: this.stackScriptTitle(card),
        narration: this.stackScriptNarration(card),
        imageUrls: this.cardImages(card),
        sourceUrl: card.sourceUrl || card.productUrl || card.googleMapsUrl,
      })),
      closing: {
        included: this.stackDocsExportIncludeFinalCard(),
        headline: this.stackFinalScreenHeadline(),
        message: this.stackFinalScreenMessage() || this.stackScriptBoardTitle() || board.title,
        imageUrl: this.stackFinalScreenPreviewImage(board),
        qrImageUrl: this.stackFinalScreenShowQrCode() ? this.stackFinalScreenQrImage(board) : '',
      },
      productionNotes: {
        included: this.stackDocsExportIncludeProductionNotes(),
        narrator: this.stackSelectedNarratorName(),
        music: audioTrack ? `${audioTrack.mood} · ${audioTrack.title}` : 'No music',
        format: this.stackFormatLabel(),
        ratio: ratio?.label || this.stackRatio(),
        socialCaption: this.stackCaption(),
      },
      includeCover: this.stackDocsExportIncludeCover(),
      includeAllCardImages: this.stackDocsExportIncludeAllImages(),
    });
  }

  async openStackView(board: Board, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.stackStudioOpen() && this.stackStudioDirty()) {
      this.stackScriptDiscardConfirmOpen.set(true);
      return;
    }
    this.prepareStackForBoard(board);
    this.stackStudioOpen.set(false);
    this.stackShareDialogOpen.set(false);
    this.sharePanelOpen.set(false);
    await this.unlockStackNarrationAudio();
    this.stackTourNarrationConsent.set(true);
    this.stackDirectView.set(true);
    this.startStackPlayback();
    void this.router.navigate([this.boardRouteRoot(board), board.id], { queryParams: { view: 'stack', autoplay: '1' } });
  }

  async openLiveCardVersion(board: Board, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    this.prepareStackForBoard(board);
    this.stackStudioOpen.set(false);
    this.stackShareDialogOpen.set(false);
    this.sharePanelOpen.set(false);
    await this.unlockStackNarrationAudio();
    this.stackTourNarrationConsent.set(true);
    this.stackDirectView.set(true);
    this.startStackPlayback();
    void this.router.navigate(['/boards', board.id], { queryParams: { view: 'stack', autoplay: '1' } });
  }

  closeStackView(board: Board): void {
    this.stopSongPreview();
    this.stopStackPlayback();
    this.stackDirectView.set(false);
    this.stackShareDialogOpen.set(false);
    void this.router.navigate([this.boardRouteRoot(board), board.id]);
  }

  closeStackStudio(): void {
    if (!this.stackStudioOpen()) {
      this.stackScriptDiscardConfirmOpen.set(false);
      return;
    }
    if (this.stackStudioDirty()) {
      this.stackScriptDiscardConfirmOpen.set(true);
      return;
    }
    this.closeStackStudioImmediately();
  }

  keepEditingStackScript(): void {
    this.stackScriptDiscardConfirmOpen.set(false);
  }

  discardStackScriptAndClose(): void {
    this.stackScriptDiscardConfirmOpen.set(false);
    this.closeStackStudioImmediately();
  }

  private closeStackStudioImmediately(): void {
    this.stopSongPreview();
    this.stopStackAudioPreview();
    this.stopStackVoicePreview();
    this.stopPersonalVoiceRecording(true);
    this.stopStackPlayback();
    this.stackVoiceLibraryOpen.set(false);
    this.stackScriptShortenMenuOpen.set(false);
    this.stackScriptShortening.set(false);
    this.clearStackScriptShortenUndo();
    this.stackScriptLengthSourceNarrations.set({});
    this.stackStudioOpen.set(false);
    this.stackDocsExportDialogOpen.set(false);
    this.docxExportService.release(this.stackDocsExportResult());
    this.stackDocsExportResult.set(null);
    this.stackScriptDiscardConfirmOpen.set(false);
    this.setStackShareMessage(null);
  }

  openStackShareDialog(board: Board, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.stackStudioBoardId() !== board.id) {
      this.prepareStackForBoard(board);
    }
    this.stackShareMode.set('trailer');
    this.stackSharePreviewRatio.set('vertical');
    this.stackShareDialogOpen.set(true);
    const verticalKey = this.stackPublishedFileKey(board.id, 'vertical');
    this.stackPublishedVideoReady.set(this.publishedStackVideoFiles.has(verticalKey));
    this.stackPublishedTrailerReady.set(this.publishedStackTrailerFiles.has(verticalKey));
    if (board.socialVideoUrl && !this.publishedStackVideoFiles.has(verticalKey)) {
      void this.preloadPublishedStackVideo(board);
    }
    if (board.trailerVideoUrl && !this.publishedStackTrailerFiles.has(verticalKey)) {
      void this.preloadPublishedStackTrailer(board);
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
    this.clearStackScriptShortenUndo();
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
    this.clearStackScriptShortenUndo();
    this.stackSelectedCardIds.set(new Set(board.cards.map((card) => card.id)));
    this.clampStackFrameIndex();
  }

  clearStackCards(): void {
    this.stopStackPlayback();
    this.clearStackScriptShortenUndo();
    this.stackSelectedCardIds.set(new Set());
    this.clampStackFrameIndex();
  }

  setStackFormat(format: StackFormat): void {
    this.stackFormat.set(format);
  }

  setStackRatio(ratio: StackRatio): void {
    this.stackRatio.set(ratio);
  }

  showStackStudioFrame(kind: 'cover' | 'closing'): void {
    this.stopStackPlayback();
    this.stackFrameIndex.set(kind === 'cover' ? 0 : Math.max(0, this.stackFrameCount() - 1));
  }

  showStackStudioScene(): void {
    this.stopStackPlayback();
    const sceneIndex = this.stackFrames().findIndex((frame) => frame.kind === 'card');
    this.stackFrameIndex.set(sceneIndex >= 0 ? sceneIndex : 0);
  }

  setStackSoundTab(tab: StackSoundTab): void {
    this.stopStackAudioPreview();
    this.stopStackVoicePreview();
    this.stackScriptShortenMenuOpen.set(false);
    this.stackSoundTab.set(tab);
  }

  updateStackScriptBoardTitle(value: string): void {
    this.stackScriptBoardTitle.set(value);
    this.stackCoverTitle.set(value);
    this.stackScriptError.set(null);
    this.stackCoverError.set(null);
  }

  updateStackScriptBoardDescription(value: string): void {
    this.stackScriptBoardDescription.set(value);
    this.stackCoverSubtitle.set(value);
    this.stackScriptError.set(null);
    this.stackCoverError.set(null);
  }

  updateStackScriptCard(cardId: string, field: keyof StackScriptCardDraft, value: string): void {
    if (field === 'narration') {
      this.clearStackScriptShortenUndo();
      this.stackScriptLengthSourceNarrations.update((sources) => ({ ...sources, [cardId]: value }));
    }
    this.stackScriptCardDrafts.update((drafts) => ({
      ...drafts,
      [cardId]: {
        title: drafts[cardId]?.title ?? '',
        subtitle: drafts[cardId]?.subtitle ?? '',
        narration: drafts[cardId]?.narration ?? '',
        [field]: value,
      },
    }));
    this.stackScriptError.set(null);
  }

  stackScriptTitle(card: BoardCard): string {
    return this.stackScriptCardDrafts()[card.id]?.title ?? card.title;
  }

  stackScriptSubtitle(card: BoardCard): string {
    return this.stackScriptCardDrafts()[card.id]?.subtitle ?? card.subtitle;
  }

  stackScriptNarration(card: BoardCard): string {
    return this.stackScriptCardDrafts()[card.id]?.narration
      ?? (card.tour?.guideScript || this.stackCardNarrationText(card) || '');
  }

  stackScriptCardIsExpanded(cardId: string): boolean {
    return this.stackScriptExpandedCardIds().has(cardId);
  }

  toggleStackScriptCard(cardId: string): void {
    this.stackScriptExpandedCardIds.update((expanded) => {
      const next = new Set(expanded);
      next.has(cardId) ? next.delete(cardId) : next.add(cardId);
      return next;
    });
  }

  setAllStackScriptCardsExpanded(expanded: boolean): void {
    this.stackScriptExpandedCardIds.set(expanded ? new Set(this.stackSelectedCards().map((card) => card.id)) : new Set());
  }

  resetStackScriptCard(card: BoardCard): void {
    this.updateStackScriptCard(card.id, 'title', card.title);
    this.updateStackScriptCard(card.id, 'subtitle', card.subtitle);
    this.updateStackScriptCard(card.id, 'narration', card.tour?.guideScript || this.persistedStackCardNarrationText(card) || '');
  }

  stackScriptCardEstimatedSeconds(card: BoardCard): number {
    const words = this.stackScriptCardWordCount(card);
    return Math.max(1, Math.ceil(words / 2.35));
  }

  stackScriptCardWordCount(card: BoardCard): number {
    return this.stackScriptNarration(card).trim().split(/\s+/).filter(Boolean).length;
  }

  stackScriptCardSentenceCount(card: BoardCard): number {
    return stackScriptSentenceCount(this.stackScriptNarration(card));
  }

  stackScriptIndexLabel(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  stackScriptDurationLabel(): string {
    const seconds = this.stackScriptEstimatedSeconds();
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes ? `~${minutes}:${String(remainder).padStart(2, '0')}` : `~${remainder}s`;
  }

  stackScriptShortenEstimateLabel(targetSentences: number): string {
    const seconds = stackScriptShortenEstimateSeconds(
      this.stackSelectedCards().map((card) => ({
        cardId: card.id,
        narration: this.stackScriptNarration(card),
        sourceNarration: this.stackScriptLengthSourceNarrations()[card.id],
      })),
      targetSentences,
    );
    return this.stackDurationLabel(seconds);
  }

  toggleStackScriptShortenMenu(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.stackScriptShortening()) return;
    this.stackScriptShortenMenuOpen.update((open) => !open);
  }

  async shortenEntireStackScript(targetSentences: number, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.stackBoard();
    const sentenceLimit = Math.max(1, Math.min(3, Math.trunc(targetSentences) || 2));
    if (!board || this.stackScriptShortening()) return;
    const previousUndo = this.stackScriptShortenUndoNarrations();
    const sourceNarrations = this.stackScriptLengthSourceNarrations();
    const cards = this.stackSelectedCards()
      .map((card) => ({
        cardId: card.id,
        title: this.stackScriptTitle(card),
        narration: this.stackScriptNarration(card).trim(),
        sourceNarration: this.stackScriptRicherNarration(
          sourceNarrations[card.id],
          previousUndo?.[card.id],
          this.stackScriptNarration(card),
        ),
      }))
      .filter((card) => !!card.narration);
    if (!cards.length) {
      this.stackScriptShortenNotice.set('Add narration before adjusting the script.');
      this.stackScriptShortenMenuOpen.set(false);
      return;
    }

    this.stackScriptLengthSourceNarrations.update((sources) => ({
      ...sources,
      ...Object.fromEntries(cards.map((card) => [card.cardId, card.sourceNarration])),
    }));

    this.stackScriptShortening.set(true);
    this.stackScriptShortenMenuOpen.set(false);
    this.stackScriptError.set(null);
    this.stackScriptShortenNotice.set(null);
    const undoNarrations = Object.fromEntries(cards.map((card) => [card.cardId, card.narration]));
    let results: StackScriptShortenResult[] = [];
    let usedLocalFallback = false;
    try {
      if (!this.functions) throw new Error('Script rewriting is unavailable.');
      const callable = httpsCallable<{
        boardId: string;
        targetSentences: number;
        cards: typeof cards;
      }, { cards?: StackScriptShortenResult[] }>(this.functions, 'shortenStackScript', { timeout: 120_000 });
      const response = await callable({ boardId: board.id, targetSentences: sentenceLimit, cards });
      results = Array.isArray(response.data?.cards) ? response.data.cards : [];
    } catch {
      usedLocalFallback = true;
      results = cards.map((card) => ({
        cardId: card.cardId,
        narration: adjustStackScriptNarration(card, sentenceLimit),
      }));
    }

    const normalized = normalizeStackScriptShortenResults(cards, results, sentenceLimit);
    const changed = normalized.filter((result) => {
      const currentCard = this.stackSelectedCards().find((card) => card.id === result.cardId);
      return result.narration !== undoNarrations[result.cardId]
        && !!currentCard
        && this.stackScriptNarration(currentCard).trim() === undoNarrations[result.cardId];
    });
    if (changed.length) {
      this.stackScriptCardDrafts.update((drafts) => {
        const next = { ...drafts };
        for (const result of changed) {
          const current = next[result.cardId];
          if (!current) continue;
          next[result.cardId] = { ...current, narration: result.narration };
        }
        return next;
      });
      this.stackScriptShortenUndoNarrations.set(undoNarrations);
      this.stackScriptShortenNotice.set(
        usedLocalFallback
          ? `Adjusted ${changed.length} card${changed.length === 1 ? '' : 's'} from the fullest available script to about ${sentenceLimit} ${sentenceLimit === 1 ? 'sentence' : 'sentences'} each. Review before saving.`
          : `Refined ${changed.length} card${changed.length === 1 ? '' : 's'} to about ${sentenceLimit} ${sentenceLimit === 1 ? 'sentence' : 'sentences'} each. Review before saving.`,
      );
    } else {
      this.stackScriptShortenUndoNarrations.set(null);
      const needsExpansion = cards.some((card) => stackScriptSentenceCount(card.narration) < sentenceLimit);
      this.stackScriptShortenNotice.set(
        needsExpansion && usedLocalFallback
          ? 'No fuller approved source text is available locally for these cards. The AI rewrite service is needed to expand them without inventing details.'
          : `The selected narration already fits about ${sentenceLimit} ${sentenceLimit === 1 ? 'sentence' : 'sentences'} per card.`,
      );
    }
    this.stackScriptShortening.set(false);
  }

  undoStackScriptShortening(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const undo = this.stackScriptShortenUndoNarrations();
    if (!undo) return;
    this.stackScriptCardDrafts.update((drafts) => {
      const next = { ...drafts };
      for (const [cardId, narration] of Object.entries(undo)) {
        const current = next[cardId];
        if (current) next[cardId] = { ...current, narration };
      }
      return next;
    });
    this.stackScriptShortenUndoNarrations.set(null);
    this.stackScriptShortenNotice.set('Length adjustment undone.');
  }

  private clearStackScriptShortenUndo(): void {
    this.stackScriptShortenUndoNarrations.set(null);
    this.stackScriptShortenNotice.set(null);
  }

  private stackScriptRicherNarration(...values: Array<string | undefined>): string {
    return values.reduce<string>((richest, value) => {
      const candidate = value?.replace(/\s+/g, ' ').trim() || '';
      if (!candidate) return richest;
      const candidateSentences = stackScriptSentenceCount(candidate);
      const richestSentences = stackScriptSentenceCount(richest);
      if (candidateSentences !== richestSentences) return candidateSentences > richestSentences ? candidate : richest;
      return candidate.split(/\s+/).length > richest.split(/\s+/).length ? candidate : richest;
    }, '');
  }

  private stackDurationLabel(seconds: number): string {
    const safeSeconds = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return minutes ? `~${minutes}:${String(remainder).padStart(2, '0')}` : `~${remainder}s`;
  }

  async previewStackScriptCard(card: BoardCard, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const board = this.stackBoard();
    const text = this.stackScriptNarration(card).trim();
    if (!this.isBrowser || !board || !text) return;
    if (this.stackScriptPreviewLoadingCardId() === card.id || this.stackVoicePreviewingId() === `studio-script:${card.id}`) {
      this.stopStackVoicePreview();
      this.stackScriptPreviewLoadingCardId.set(null);
      return;
    }
    this.stopStackVoicePreview();
    this.stackScriptPreviewLoadingCardId.set(card.id);
    this.stackScriptError.set(null);
    try {
      const url = await this.ensureTourAudioUrl(
        `stack-script-preview:${card.id}:r${Math.max(0, Math.trunc(card.videoNarrationRevision ?? 0))}:${text}`,
        text,
        this.stackNarratorVoiceId(),
        board.id,
        'stack-video',
        card.id,
        true,
      );
      if (!url) throw new Error('Preview audio was not returned.');
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.onended = () => this.stopStackVoicePreview();
      audio.onerror = () => {
        this.stopStackVoicePreview();
        this.stackScriptError.set('This script preview could not be played.');
      };
      this.stackVoicePreview = audio;
      await audio.play();
      this.stackVoicePreviewingId.set(`studio-script:${card.id}`);
    } catch (error) {
      this.stackScriptError.set(error instanceof Error ? error.message : 'This script preview could not be played.');
    } finally {
      this.stackScriptPreviewLoadingCardId.set(null);
    }
  }

  async regenerateStackScriptCardNarration(card: BoardCard, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    let board = this.stackBoard();
    const text = this.stackScriptNarration(card).trim();
    if (!this.isBrowser || !board || !this.canEditBoard(board) || !text || this.stackScriptRegeneratingCardId()) return;
    this.stopStackVoicePreview();
    this.stackScriptRegeneratingCardId.set(card.id);
    this.stackScriptError.set(null);
    try {
      if (this.stackScriptDirty() && !await this.saveStackScript(board)) return;
      board = this.stackBoard();
      const currentCard = board?.cards.find((item) => item.id === card.id);
      if (!board || !currentCard) throw new Error('This card is no longer available.');
      const now = new Date().toISOString();
      const revision = Math.max(0, Math.trunc(currentCard.videoNarrationRevision ?? 0)) + 1;
      const nextBoard: Board = {
        ...board,
        cards: board.cards.map((item) => item.id === currentCard.id
          ? { ...item, videoNarrationRevision: revision, updatedAt: now }
          : item),
        socialVideoRenderVersion: '',
        updatedAt: now,
      };
      if (!await this.persistAndReplaceBoard(nextBoard)) {
        throw new Error('The fresh narration could not be saved to this board.');
      }
      const savedCard = nextBoard.cards.find((item) => item.id === currentCard.id)!;
      const savedText = this.stackVideoNarrationText(savedCard);
      const url = await this.ensureTourAudioUrl(
        `stack-video:${savedCard.id}:r${revision}:${savedText}`,
        savedText,
        this.stackNarratorVoiceId(),
        nextBoard.id,
        'stack-video',
        savedCard.id,
        true,
      );
      if (!url) throw new Error('Fresh narration audio was not returned.');
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.onended = () => this.stopStackVoicePreview();
      audio.onerror = () => {
        this.stopStackVoicePreview();
        this.stackScriptError.set('The fresh narration was saved, but its preview could not be played.');
      };
      this.stackVoicePreview = audio;
      await audio.play();
      this.stackVoicePreviewingId.set(`studio-script:${card.id}`);
      this.setStackShareMessage('Fresh narration saved. The next Full video will use this take.', false);
    } catch (error) {
      this.stackScriptError.set(error instanceof Error ? error.message : 'Fresh narration could not be created.');
    } finally {
      this.stackScriptRegeneratingCardId.set(null);
    }
  }

  async saveStackScript(board: Board): Promise<boolean> {
    if (!this.canEditBoard(board) || this.stackScriptSaving() || this.stackCoverSaving()) return false;
    const title = this.stackScriptBoardTitle().trim();
    if (!title) {
      this.stackScriptError.set('Add a board title before saving.');
      return false;
    }
    if (this.stackScriptMissingCount() && !this.isPhotoStudioDraft(board)) {
      this.stackScriptError.set(`Add narration for ${this.stackScriptMissingCount()} selected card${this.stackScriptMissingCount() === 1 ? '' : 's'} before saving.`);
      return false;
    }
    this.stackScriptSaving.set(true);
    this.stackScriptError.set(null);
    const drafts = this.stackScriptCardDrafts();
    const selectedIds = this.stackSelectedCardIds();
    const now = new Date().toISOString();
    const nextBoard: Board = {
      ...board,
      title,
      description: this.stackScriptBoardDescription().trim(),
      imageUrl: this.stackCoverImageDraft(),
      cards: board.cards.map((card) => {
        const draft = drafts[card.id];
        if (!draft || !selectedIds.has(card.id)) return card;
        const narration = draft.narration.trim();
        return {
          ...card,
          title: draft.title.trim() || card.title,
          subtitle: draft.subtitle.trim(),
          notes: card.tour ? card.notes : narration,
          tour: card.tour ? { ...card.tour, guideScript: narration } : card.tour,
          stackNarrationSource: this.stackScriptRicherNarration(
            this.stackScriptLengthSourceNarrations()[card.id],
            narration,
          ).slice(0, 3000),
          updatedAt: now,
        };
      }),
      socialVideoRenderVersion: '',
      trailerVideoRenderVersion: '',
      updatedAt: now,
    };
    try {
      const saved = await this.persistAndReplaceBoard(nextBoard);
      if (!saved) throw new Error('The script could not be synchronized. Your draft is still here.');
      const savedBoard = this.boards().find((item) => item.id === nextBoard.id) ?? nextBoard;
      this.applyStackCoverState(savedBoard);
      this.stackScriptCardDrafts.set(Object.fromEntries(savedBoard.cards.map((card) => [card.id, {
        title: card.title,
        subtitle: card.subtitle,
        narration: card.tour?.guideScript || this.persistedStackCardNarrationText(card) || '',
      }])));
      const existingLengthSources = this.stackScriptLengthSourceNarrations();
      this.stackScriptLengthSourceNarrations.set(Object.fromEntries(savedBoard.cards.map((card) => [
        card.id,
        this.stackScriptRicherNarration(
          existingLengthSources[card.id],
          card.tour?.guideScript || this.persistedStackCardNarrationText(card) || '',
        ),
      ])));
      this.stackScriptOriginalSnapshot.set(this.stackScriptSnapshot(savedBoard));
      this.stackScriptSavedAt.set(now);
      this.clearStackScriptShortenUndo();
      this.setStackShareMessage(
        this.isPhotoStoryBoard(savedBoard)
          ? 'Stories saved. Each card and its narration now use these words.'
          : 'Script saved. Your video will use these words.',
        false,
      );
      return true;
    } catch (error) {
      this.stackScriptError.set(error instanceof Error ? error.message : 'The script could not be saved. Your draft is still here.');
      return false;
    } finally {
      this.stackScriptSaving.set(false);
    }
  }

  async continueStackStudio(board: Board, to: 'voice' | 'music'): Promise<void> {
    if ((this.stackScriptDirty() || this.stackCoverDirty()) && !await this.saveStackScript(board)) return;
    this.setStackSoundTab(to);
  }

  stackStudioCoverImage(board: Board): string {
    return this.stackCoverImageDraft()
      || board.cards.map((card) => this.cardImages(card)[0] ?? '').find(Boolean)
      || '';
  }

  async onStackCoverImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.stackCoverImageUploading()) return;
    if (file.size > 10 * 1024 * 1024) {
      this.stackCoverError.set('Choose a cover image smaller than 10 MB.');
      return;
    }
    this.stackCoverImageUploading.set(true);
    this.stackCoverError.set(null);
    try {
      this.stackCoverImageDraft.set(await this.readImageFile(file));
    } catch (error) {
      this.stackCoverError.set(error instanceof Error ? error.message : 'That cover image could not be prepared.');
    } finally {
      this.stackCoverImageUploading.set(false);
    }
  }

  clearStackCoverImage(): void {
    this.stackCoverImageDraft.set('');
    this.stackCoverError.set(null);
  }

  async saveStackCover(board: Board): Promise<boolean> {
    if (!this.canEditBoard(board) || this.stackCoverSaving() || this.stackCoverImageUploading() || this.stackScriptSaving()) {
      return false;
    }
    const title = this.stackScriptBoardTitle().trim();
    if (!title) {
      this.stackCoverError.set('Add a cover title before saving.');
      return false;
    }
    this.stackCoverSaving.set(true);
    this.stackCoverError.set(null);
    const now = new Date().toISOString();
    const currentBoard = this.stackBoard()?.id === board.id ? this.stackBoard()! : board;
    const nextBoard: Board = {
      ...currentBoard,
      title,
      description: this.stackScriptBoardDescription().trim(),
      imageUrl: this.stackCoverImageDraft(),
      socialVideoRenderVersion: '',
      trailerVideoRenderVersion: '',
      updatedAt: now,
    };
    try {
      if (!await this.persistAndReplaceBoard(nextBoard)) {
        throw new Error('The cover could not be synchronized.');
      }
      const savedBoard = this.boards().find((item) => item.id === nextBoard.id) ?? nextBoard;
      this.applyStackCoverState(savedBoard);
      this.stackCoverSavedAt.set(now);
      this.setStackShareMessage('Cover saved. Update the video when you are ready to publish it.', false);
      return true;
    } catch (error) {
      this.stackCoverError.set(error instanceof Error ? error.message : 'The cover could not be saved.');
      return false;
    } finally {
      this.stackCoverSaving.set(false);
    }
  }

  updateStackFinalScreenHeadline(value: string): void {
    this.stackFinalScreenHeadline.set(value.slice(0, 72));
    this.stackFinalScreenError.set(null);
  }

  updateStackFinalScreenMessage(value: string): void {
    this.stackFinalScreenMessage.set(value.slice(0, 180));
    this.stackFinalScreenError.set(null);
  }

  setStackFinalScreenShowQrCode(show: boolean): void {
    this.stackFinalScreenShowQrCode.set(show);
    this.stackFinalScreenError.set(null);
  }

  setStackFinalScreenImage(image: StackVideoClosingImage): void {
    if (image === 'custom' && !this.stackFinalScreenCustomImageUrl()) return;
    this.stackFinalScreenImage.set(image);
    this.stackFinalScreenError.set(null);
  }

  async onStackFinalScreenImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.stackFinalScreenImageUploading()) return;
    if (file.size > 10 * 1024 * 1024) {
      this.stackFinalScreenError.set('Choose a custom image smaller than 10 MB.');
      return;
    }
    this.stackFinalScreenImageUploading.set(true);
    this.stackFinalScreenError.set(null);
    try {
      const imageUrl = await this.readImageFile(file);
      this.stackFinalScreenCustomImageUrl.set(imageUrl);
      this.stackFinalScreenImage.set('custom');
    } catch (error) {
      this.stackFinalScreenError.set(error instanceof Error ? error.message : 'That custom image could not be prepared.');
    } finally {
      this.stackFinalScreenImageUploading.set(false);
    }
  }

  clearStackFinalScreenCustomImage(): void {
    this.stackFinalScreenCustomImageUrl.set('');
    if (this.stackFinalScreenImage() === 'custom') {
      this.stackFinalScreenImage.set('cover');
    }
    this.stackFinalScreenError.set(null);
  }

  setStackFinalScreenDuration(value: number): void {
    this.stackFinalScreenDurationSeconds.set(
      normalizeStackVideoClosingScreen({ durationSeconds: value }).durationSeconds,
    );
    this.stackFinalScreenError.set(null);
  }

  stackFinalScreenPreviewImage(board: Board): string {
    if (this.stackFinalScreenImage() === 'custom' && this.stackFinalScreenCustomImageUrl()) {
      return this.stackFinalScreenCustomImageUrl();
    }
    if (this.stackFinalScreenImage() === 'final-card') {
      const finalCard = this.stackSelectedCards()[this.stackSelectedCards().length - 1];
      const finalImage = finalCard ? this.cardImages(finalCard)[0] ?? '' : '';
      if (finalImage) return finalImage;
    }
    return this.stackStudioOpen() && this.stackStudioBoardId() === board.id
      ? this.stackStudioCoverImage(board)
      : this.stackCoverImage(board);
  }

  stackFinalScreenQrImage(board: Board): string {
    return this.stackQrImageUrl(board);
  }

  async saveStackFinalScreen(board: Board): Promise<boolean> {
    if (!this.canEditBoard(board) || this.stackFinalScreenSaving() || this.stackFinalScreenImageUploading()) return false;
    const normalized = this.currentStackFinalScreen(board);
    if (!normalized.headline || !normalized.message) {
      this.stackFinalScreenError.set('Add a headline and closing message before saving.');
      return false;
    }
    this.stackFinalScreenSaving.set(true);
    this.stackFinalScreenError.set(null);
    const now = new Date().toISOString();
    const nextBoard: Board = {
      ...board,
      socialVideoClosingHeadline: normalized.headline,
      socialVideoClosingMessage: normalized.message,
      socialVideoClosingShowQrCode: normalized.showQrCode,
      socialVideoClosingImage: normalized.image,
      socialVideoClosingCustomImageUrl: normalized.customImageUrl,
      socialVideoClosingDurationSeconds: normalized.durationSeconds,
      socialVideoRenderVersion: '',
      updatedAt: now,
    };
    try {
      if (!await this.persistAndReplaceBoard(nextBoard)) {
        throw new Error('The final screen could not be synchronized.');
      }
      this.applyStackFinalScreenState(this.boards().find((item) => item.id === nextBoard.id) ?? nextBoard);
      this.setStackShareMessage('Final screen saved. Update the Full video to publish it.', false);
      return true;
    } catch (error) {
      this.stackFinalScreenError.set(error instanceof Error ? error.message : 'The final screen could not be saved.');
      return false;
    } finally {
      this.stackFinalScreenSaving.set(false);
    }
  }

  async selectStackVideoBranding(board: Board, mode: StackVideoBrandingMode): Promise<void> {
    if (this.stackVideoExporting() || this.stackVideoBrandingSaving() || this.stackVideoBrandingUploading()) return;
    if (mode !== 'livingwiki' && !this.videoBrandingEligible()) {
      this.stackVideoBrandingUpgradeOpen.set(true);
      this.stackVideoBrandingError.set(null);
      return;
    }
    if (mode === 'custom' && !this.stackVideoBrandingLogoUrl()) {
      this.stackVideoBrandingMode.set('custom');
      this.stackVideoBrandingError.set(null);
      return;
    }
    await this.saveStackVideoBranding(board, mode, this.stackVideoBrandingLogoUrl());
  }

  async useBoardLogoForStackVideo(board: Board): Promise<void> {
    if (!board.logoUrl) return;
    if (!this.videoBrandingEligible()) {
      this.stackVideoBrandingUpgradeOpen.set(true);
      return;
    }
    this.stackVideoBrandingMode.set('custom');
    this.stackVideoBrandingLogoUrl.set(board.logoUrl);
    await this.saveStackVideoBranding(board, 'custom', board.logoUrl);
  }

  async onStackVideoBrandingLogoSelected(board: Board, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.stackVideoBrandingUploading() || this.stackVideoBrandingSaving()) return;
    if (!this.videoBrandingEligible()) {
      this.stackVideoBrandingUpgradeOpen.set(true);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.stackVideoBrandingError.set('Choose a logo smaller than 10 MB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.stackVideoBrandingError.set('Choose a PNG, WebP, or JPG logo.');
      return;
    }
    this.stackVideoBrandingUploading.set(true);
    this.stackVideoBrandingError.set(null);
    try {
      const logoUrl = await this.readVideoBrandingLogoFile(file);
      this.stackVideoBrandingMode.set('custom');
      this.stackVideoBrandingLogoUrl.set(logoUrl);
      await this.saveStackVideoBranding(board, 'custom', logoUrl);
    } catch (error) {
      this.stackVideoBrandingError.set(error instanceof Error ? error.message : 'That logo could not be prepared.');
    } finally {
      this.stackVideoBrandingUploading.set(false);
    }
  }

  async clearStackVideoBrandingLogo(board: Board): Promise<void> {
    if (!this.videoBrandingEligible() || this.stackVideoBrandingSaving()) return;
    this.stackVideoBrandingLogoUrl.set('');
    this.stackVideoBrandingMode.set('livingwiki');
    await this.saveStackVideoBranding(board, 'livingwiki', '');
  }

  upgradeVideoBranding(): void {
    this.stackVideoBrandingUpgradeOpen.set(false);
    void this.router.navigate(['/pricing'], { queryParams: { feature: 'video-branding' } });
  }

  dismissVideoBrandingUpgrade(): void {
    this.stackVideoBrandingUpgradeOpen.set(false);
  }

  private async saveStackVideoBranding(
    board: Board,
    mode: StackVideoBrandingMode,
    logoUrl: string,
  ): Promise<boolean> {
    if (!this.canEditBoard(board) || this.stackVideoBrandingSaving()) return false;
    if (mode !== 'livingwiki' && !this.videoBrandingEligible()) {
      this.stackVideoBrandingUpgradeOpen.set(true);
      return false;
    }
    const branding = normalizeStackVideoBranding({ mode, logoUrl });
    if (mode === 'custom' && branding.mode !== 'custom') {
      this.stackVideoBrandingError.set('Upload a logo before selecting Your logo.');
      return false;
    }
    this.stackVideoBrandingSaving.set(true);
    this.stackVideoBrandingError.set(null);
    try {
      const uid = this.authService.uid();
      if (!this.firestore || !uid) throw new Error('Sign in to save video branding.');
      const persistedLogoUrl = await this.persistImageIfNeeded(
        logoUrl.trim(),
        `users/${uid}/boards/${board.id}/social/branding/logo.png`,
      );
      const updatedAt = new Date().toISOString();
      await setDoc(doc(this.firestore, 'boards', board.id, 'video_settings', 'branding'), {
        owner_user_id: uid,
        mode: branding.mode,
        logo_url: persistedLogoUrl,
        updated_at_iso: updatedAt,
        server_updated_at: serverTimestamp(),
      });
      this.stackVideoBrandingMode.set(branding.mode);
      this.stackVideoBrandingLogoUrl.set(persistedLogoUrl);
      this.stackVideoBrandingUpdatedAt.set(updatedAt);
      this.stackVideoBrandingUpgradeOpen.set(false);
      this.setStackShareMessage('Video branding saved. Update existing videos to apply it.', false);
      return true;
    } catch (error) {
      this.stackVideoBrandingError.set(error instanceof Error ? error.message : 'Video branding could not be saved.');
      void this.loadStackVideoBranding(board, true);
      return false;
    } finally {
      this.stackVideoBrandingSaving.set(false);
    }
  }

  selectStackAudioTrack(board: Board, trackId: string): void {
    const normalizedTrackId = normalizeStackAudioTrackId(trackId);
    if (this.stackAudioTrackId() === normalizedTrackId) return;
    this.stopStackAudioPreview();
    this.stackAudioTrackId.set(normalizedTrackId);
    this.stackAudioError.set(null);
    this.saveStackAudioPreferences(board);
  }

  selectStackNarratorVoice(board: Board, voiceId: string): void {
    const normalizedVoiceId = normalizeStackNarratorVoiceId(voiceId);
    if (stackNarratorVoiceRequiresPaidPlan(normalizedVoiceId) && !this.personalVoiceEligible()) {
      this.requestPersonalVoiceUpgrade();
      return;
    }
    if (this.stackNarratorVoiceId() === normalizedVoiceId) {
      this.saveStackNarratorPreference(board, true);
      return;
    }
    this.stopStackVoicePreview();
    this.stopStackPlayback();
    this.stackVideoNarrationEnabled.set(true);
    this.stackNarratorVoiceId.set(normalizedVoiceId);
    this.stackVoiceError.set(null);
    this.saveStackNarratorPreference(board);
  }

  chooseStackNarratorVoice(board: Board, voiceId: string, closeLibrary = false): void {
    this.selectStackNarratorVoice(board, voiceId);
    if (closeLibrary && this.stackNarratorVoiceId() === normalizeStackNarratorVoiceId(voiceId)) {
      this.closeStackVoiceLibrary();
    }
  }

  openStackVoiceLibrary(): void {
    this.stackVoiceLibrarySearchQuery.set('');
    this.stackVoiceLibraryFilter.set('All');
    this.stackVoiceLibraryOpen.set(true);
    if (this.isBrowser) {
      this.stackVoiceLibraryReturnFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      window.setTimeout(() => this.stackVoiceLibrarySearch?.nativeElement.focus(), 0);
    }
  }

  closeStackVoiceLibrary(): void {
    this.stopStackVoicePreview();
    this.stackVoiceLibraryOpen.set(false);
    if (this.isBrowser) {
      const returnFocus = this.stackVoiceLibraryReturnFocus;
      this.stackVoiceLibraryReturnFocus = null;
      window.setTimeout(() => returnFocus?.focus(), 0);
    }
  }

  onStackVoiceLibrarySearch(value: string): void {
    this.stackVoiceLibrarySearchQuery.set(value);
  }

  selectStackVoiceLibraryFilter(filter: StackVoiceLibraryFilter): void {
    this.stackVoiceLibraryFilter.set(filter);
  }

  setStackVideoNarrationEnabled(enabled: boolean): void {
    if (!enabled) {
      this.stopStackVoicePreview();
    }
    this.stackVideoNarrationEnabled.set(enabled);
    this.stackVoiceError.set(null);
    this.setStackShareMessage(null);
  }

  setStackTrailerNarrationEnabled(enabled: boolean): void {
    if (!enabled) this.stopStackVoicePreview();
    this.stackTrailerNarrationEnabled.set(enabled);
    this.stackVoiceError.set(null);
    this.setStackShareMessage(null);
  }

  private requestPersonalVoiceUpgrade(): void {
    this.stopStackVoicePreview();
    this.stackVoiceError.set('Your free account includes one personal voice. Upgrade to add more reusable voices.');
    void this.router.navigate(['/pricing'], { queryParams: { feature: 'personal-voice' } });
  }

  personalNarratorId(voice: PersonalNarratorVoice): string {
    return voice.narratorVoiceId || personalStackNarratorVoiceId(voice.id);
  }

  personalVoiceForNarratorId(narratorVoiceId: string): PersonalNarratorVoice | null {
    const voiceId = personalVoiceIdFromStackNarrator(narratorVoiceId);
    if (voiceId) {
      return this.personalNarratorVoices().find((voice) => voice.id === voiceId) ?? null;
    }
    if (narratorVoiceId === PERSONAL_STACK_NARRATOR_VOICE_ID) {
      return this.personalNarratorVoices().find((voice) => voice.id === this.personalVoiceDefaultId())
        ?? this.personalNarratorVoices()[0]
        ?? null;
    }
    return null;
  }

  personalVoiceSelected(voice: PersonalNarratorVoice): boolean {
    const selected = this.stackNarratorVoiceId();
    return selected === this.personalNarratorId(voice)
      || (selected === PERSONAL_STACK_NARRATOR_VOICE_ID
        && voice.id === (this.personalVoiceDefaultId() ?? this.personalNarratorVoices()[0]?.id));
  }

  private applyPersonalNarratorVoiceResponse(response: PersonalNarratorVoiceResponse): void {
    const libraryVersion = Math.max(1, Math.trunc(response.libraryVersion ?? 1));
    const voices = (response.voices ?? (response.voice ? [response.voice] : [])).map((voice, index) => {
      const id = voice.id || (libraryVersion < 2 && index === 0 ? 'legacy' : `voice-${index + 1}`);
      return {
        ...voice,
        id,
        narratorVoiceId: voice.narratorVoiceId
          || (libraryVersion < 2 ? PERSONAL_STACK_NARRATOR_VOICE_ID : personalStackNarratorVoiceId(id)),
        voiceRevision: Math.max(1, Math.trunc(voice.voiceRevision ?? 1)),
      };
    });
    const admin = response.admin === true || this.authService.isAdmin();
    const fallbackLimit = this.authService.hasActivePersonalWikiPlan() ? 5 : 1;
    const voiceLimit = admin
      ? null
      : Math.max(1, typeof response.voiceLimit === 'number' ? response.voiceLimit : fallbackLimit);
    this.personalVoiceServerEligible.set(response.eligible);
    this.personalVoiceLibraryVersion.set(libraryVersion);
    this.personalNarratorVoices.set(voices);
    this.personalVoiceDefaultId.set(response.defaultVoiceId ?? voices[0]?.id ?? null);
    this.personalNarratorVoice.set(
      voices.find((voice) => voice.id === response.defaultVoiceId)
        ?? voices[0]
        ?? null,
    );
    this.personalVoiceLimit.set(voiceLimit);
    this.personalVoiceServerCanAdd.set(
      libraryVersion >= 2
        && (admin || (response.canAddVoice ?? voices.length < (voiceLimit ?? fallbackLimit))),
    );
    this.personalVoicePaid.set(admin || response.paid === true || this.authService.hasActivePersonalWikiPlan());
  }

  isStackVoicePreviewing(voiceId: string): boolean {
    return this.stackVoicePreviewingId() === voiceId;
  }

  async toggleStackVoicePreview(voice: StackNarratorVoice, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.isBrowser) return;
    if (this.isStackVoicePreviewing(voice.id)) {
      this.stopStackVoicePreview();
      return;
    }

    const board = this.stackBoard();
    this.stopStackVoicePreview();
    this.stopStackAudioPreview();
    this.stopSongPreview();
    const run = ++this.stackVoicePreviewRun;
    this.stackVoicePreviewLoadingId.set(voice.id);
    this.stackVoiceError.set(null);
    try {
      const sampleText = this.stackVoicePreviewSample(voice.sampleText);
      const audioUrl = await this.ensureTourAudioUrl(
        `stack-narrator-preview:${voice.id}:${sampleText}`,
        sampleText,
        voice.id,
        board?.id,
        'voice-preview',
      );
      if (run !== this.stackVoicePreviewRun) return;
      if (!audioUrl) {
        this.stackVoiceError.set('This voice preview could not be loaded. Try again in a moment.');
        return;
      }
      const audio = new Audio(audioUrl);
      audio.preload = 'auto';
      audio.onended = () => {
        if (this.stackVoicePreview === audio) this.stopStackVoicePreview();
      };
      audio.onerror = () => {
        if (this.stackVoicePreview === audio) {
          this.stopStackVoicePreview();
          this.stackVoiceError.set(`The ${voice.name} preview could not be played.`);
        }
      };
      this.stackVoicePreview = audio;
      await audio.play();
      if (run === this.stackVoicePreviewRun && this.stackVoicePreview === audio) {
        this.stackVoicePreviewingId.set(voice.id);
      }
    } catch {
      if (run === this.stackVoicePreviewRun) {
        this.stopStackVoicePreview();
        this.stackVoiceError.set('Preview playback was blocked. Tap play again.');
      }
    } finally {
      if (run === this.stackVoicePreviewRun) {
        this.stackVoicePreviewLoadingId.set(null);
      }
    }
  }

  stopStackVoicePreview(): void {
    this.stackVoicePreviewRun += 1;
    if (this.stackVoicePreview) {
      this.stackVoicePreview.pause();
      this.stackVoicePreview.currentTime = 0;
      this.stackVoicePreview.onended = null;
      this.stackVoicePreview.onerror = null;
      this.stackVoicePreview = null;
    }
    this.stackVoicePreviewingId.set(null);
    this.stackVoicePreviewLoadingId.set(null);
  }

  openPersonalVoiceSetup(voice: PersonalNarratorVoice | null = null): void {
    if (!this.personalVoiceEligible()) {
      return;
    }
    if (!voice && this.personalNarratorVoices().length > 0 && this.personalVoiceLibraryVersion() < 2) {
      this.personalVoiceError.set('Additional voices are not active on the voice service yet. Update the deployed Functions before adding another voice.');
      return;
    }
    if (!voice && !this.personalVoiceCanAdd()) {
      this.requestPersonalVoiceUpgrade();
      return;
    }
    this.stopPersonalVoiceRecording(true);
    this.personalVoiceFile.set(null);
    this.personalVoiceDurationSeconds.set(0);
    this.personalVoiceSetupVoiceId.set(voice?.id ?? null);
    this.personalVoiceName.set(voice?.name || `My voice${this.personalNarratorVoices().length ? ` ${this.personalNarratorVoices().length + 1}` : ''}`);
    this.personalVoiceOwnVoiceConfirmed.set(false);
    this.personalVoiceConsentConfirmed.set(false);
    this.personalVoiceSetupOpen.set(true);
    this.personalVoiceError.set(null);
  }

  closePersonalVoiceSetup(): void {
    if (this.personalVoiceCreating()) return;
    this.stopPersonalVoiceRecording(true);
    this.personalVoiceSetupOpen.set(false);
    this.personalVoiceSetupVoiceId.set(null);
    this.personalVoiceError.set(null);
  }

  private async loadPersonalNarratorVoice(): Promise<void> {
    if (!this.authService.uid() || this.personalVoiceLoading()) return;
    this.personalVoiceLoading.set(true);
    try {
      this.applyPersonalNarratorVoiceResponse(await this.personalVoiceService.loadLibrary());
    } catch (error) {
      this.personalVoiceError.set(this.cardImageActionErrorMessage(error, 'Your personal voice could not be loaded.'));
    } finally {
      this.personalVoiceLoading.set(false);
    }
  }

  async choosePersonalVoiceFile(event: Event): Promise<void> {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0] ?? null;
    if (input) input.value = '';
    if (!file) return;
    this.stopPersonalVoiceRecording(true);
    await this.setPersonalVoiceFile(file);
  }

  async startPersonalVoiceRecording(): Promise<void> {
    if (!this.isBrowser || this.personalVoiceRecording() || this.personalVoiceCreating()) return;
    if (!this.personalVoiceEligible()) {
      void this.router.navigate(['/pricing'], { queryParams: { feature: 'personal-voice' } });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.personalVoiceError.set('Voice recording is not supported in this browser. Upload an audio file instead.');
      return;
    }

    this.personalVoiceError.set(null);
    this.personalVoiceFile.set(null);
    this.personalVoiceDurationSeconds.set(0);
    this.discardPersonalVoiceRecording = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      this.personalVoiceRecordingStream = stream;
      this.personalVoiceRecorder = recorder;
      this.personalVoiceRecordingChunks = [];
      this.personalVoiceRecordingStartedAt = Date.now();
      recorder.ondataavailable = (chunk) => {
        if (chunk.data.size) this.personalVoiceRecordingChunks.push(chunk.data);
      };
      recorder.onerror = () => {
        this.personalVoiceError.set('The recording stopped unexpectedly. Please try again.');
        this.stopPersonalVoiceRecording(true);
      };
      recorder.onstop = () => {
        const duration = Math.max(1, Math.round((Date.now() - this.personalVoiceRecordingStartedAt) / 1000));
        const chunks = this.personalVoiceRecordingChunks;
        const discard = this.discardPersonalVoiceRecording;
        this.cleanupPersonalVoiceRecorder();
        if (discard || !chunks.length) return;
        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([new Blob(chunks, { type })], `my-voice-${Date.now()}.${extension}`, { type });
        void this.setPersonalVoiceFile(file, duration);
      };
      recorder.start(500);
      this.personalVoiceRecording.set(true);
      this.personalVoiceRecordingSeconds.set(0);
      this.personalVoiceRecordingTimer = setInterval(() => {
        const seconds = Math.floor((Date.now() - this.personalVoiceRecordingStartedAt) / 1000);
        this.personalVoiceRecordingSeconds.set(seconds);
        if (seconds >= 120) this.stopPersonalVoiceRecording();
      }, 500);
    } catch {
      this.cleanupPersonalVoiceRecorder();
      this.personalVoiceError.set('Microphone access was not available. Allow microphone access or upload an audio file.');
    }
  }

  stopPersonalVoiceRecording(discard = false): void {
    this.discardPersonalVoiceRecording = discard;
    const recorder = this.personalVoiceRecorder;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      return;
    }
    this.cleanupPersonalVoiceRecorder();
  }

  async createPersonalNarratorVoice(board: Board): Promise<void> {
    if (!this.authService.uid() || this.personalVoiceCreating()) return;
    const replacingVoiceId = this.personalVoiceSetupVoiceId();
    if (!replacingVoiceId && !this.personalVoiceCanAdd()) {
      this.requestPersonalVoiceUpgrade();
      return;
    }
    const file = this.personalVoiceFile();
    const duration = this.personalVoiceDurationSeconds();
    const name = this.personalVoiceName().trim().slice(0, 48) || 'My voice';
    if (!file || duration < 20 || duration > 180) {
      this.personalVoiceError.set('Choose a clear recording between 20 seconds and 3 minutes. Around 60–90 seconds works best.');
      return;
    }
    if (!this.personalVoiceOwnVoiceConfirmed() || !this.personalVoiceConsentConfirmed()) {
      this.personalVoiceError.set('Confirm that this is your own voice and that you consent to creating the voice model.');
      return;
    }

    this.personalVoiceCreating.set(true);
    this.personalVoiceError.set(null);
    try {
      const response = await this.personalVoiceService.createVoice({
        file,
        name,
        durationSeconds: duration,
        replacingVoiceId,
      });
      if (!response.voice) {
        throw new Error('The personal voice was not returned after processing.');
      }
      this.applyPersonalNarratorVoiceResponse(response);
      this.personalVoiceFile.set(null);
      this.personalVoiceDurationSeconds.set(0);
      this.personalVoiceSetupOpen.set(false);
      this.personalVoiceSetupVoiceId.set(null);
      const savedVoice = this.personalNarratorVoices().find((voice) => voice.id === response.voice?.id)
        ?? this.personalNarratorVoices().at(-1);
      if (savedVoice) this.selectStackNarratorVoice(board, this.personalNarratorId(savedVoice));
    } catch (error) {
      this.personalVoiceError.set(this.cardImageActionErrorMessage(error, 'Your voice could not be created. Check the recording and try again.'));
    } finally {
      this.personalVoiceCreating.set(false);
    }
  }

  async deletePersonalNarratorVoice(board: Board, voice: PersonalNarratorVoice): Promise<void> {
    if (this.personalVoiceDeleting() || !this.isBrowser) return;
    const confirmed = window.confirm(`Permanently delete “${voice.name}” and its source recording? Boards using this voice will return to Warm Storyteller.`);
    if (!confirmed) return;
    this.personalVoiceDeleting.set(true);
    this.personalVoiceDeletingId.set(voice.id);
    this.personalVoiceError.set(null);
    this.stopStackVoicePreview();
    try {
      this.applyPersonalNarratorVoiceResponse(await this.personalVoiceService.deleteVoice(voice.id));
      this.personalVoiceSetupOpen.set(false);
      if (this.personalVoiceSelected(voice)) {
        this.selectStackNarratorVoice(board, DEFAULT_STACK_NARRATOR_VOICE_ID);
      }
    } catch (error) {
      this.personalVoiceError.set(this.cardImageActionErrorMessage(error, 'Your personal voice could not be deleted.'));
    } finally {
      this.personalVoiceDeleting.set(false);
      this.personalVoiceDeletingId.set(null);
    }
  }

  async renamePersonalNarratorVoice(voice: PersonalNarratorVoice): Promise<void> {
    if (!this.isBrowser) return;
    const requestedName = window.prompt('Voice name', voice.name)?.replace(/\s+/g, ' ').trim().slice(0, 48);
    if (!requestedName || requestedName === voice.name) return;
    this.personalVoiceError.set(null);
    try {
      this.applyPersonalNarratorVoiceResponse(
        await this.personalVoiceService.renameVoice(voice.id, requestedName),
      );
    } catch (error) {
      this.personalVoiceError.set(this.cardImageActionErrorMessage(error, 'The voice name could not be updated.'));
    }
  }

  async togglePersonalVoicePreview(board: Board, voice: PersonalNarratorVoice, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.isBrowser) return;
    const narratorVoiceId = this.personalNarratorId(voice);
    if (this.isStackVoicePreviewing(narratorVoiceId)) {
      this.stopStackVoicePreview();
      return;
    }
    this.stopStackVoicePreview();
    this.stopStackAudioPreview();
    const run = ++this.stackVoicePreviewRun;
    this.stackVoicePreviewLoadingId.set(narratorVoiceId);
    this.personalVoiceError.set(null);
    try {
      const sample = this.stackVoicePreviewSample(
        'Welcome to my LivingWiki. I will guide you through the people, places, and stories that make this board worth exploring.',
      );
      const audioUrl = await this.ensureTourAudioUrl(
        `personal-narrator-preview:${voice.id}:${voice.voiceRevision}:${sample}`,
        sample,
        narratorVoiceId,
        board.id,
        'voice-preview',
      );
      if (run !== this.stackVoicePreviewRun) return;
      if (!audioUrl) throw new Error('Preview audio was not returned.');
      const audio = new Audio(audioUrl);
      audio.preload = 'auto';
      audio.onended = () => {
        if (this.stackVoicePreview === audio) this.stopStackVoicePreview();
      };
      audio.onerror = () => {
        if (this.stackVoicePreview === audio) {
          this.stopStackVoicePreview();
          this.personalVoiceError.set('Your voice preview could not be played.');
        }
      };
      this.stackVoicePreview = audio;
      await audio.play();
      if (run === this.stackVoicePreviewRun && this.stackVoicePreview === audio) {
        this.stackVoicePreviewingId.set(narratorVoiceId);
      }
    } catch (error) {
      if (run === this.stackVoicePreviewRun) {
        this.stopStackVoicePreview();
        this.personalVoiceError.set(this.cardImageActionErrorMessage(error, 'Your voice preview could not be generated.'));
      }
    } finally {
      if (run === this.stackVoicePreviewRun) this.stackVoicePreviewLoadingId.set(null);
    }
  }

  private async setPersonalVoiceFile(file: File, knownDuration?: number): Promise<void> {
    this.personalVoiceError.set(null);
    if (!file.type.startsWith('audio/')) {
      this.personalVoiceError.set('Choose an audio recording such as MP3, WAV, M4A, OGG, or WebM.');
      return;
    }
    if (file.size <= 0 || file.size > 15 * 1024 * 1024) {
      this.personalVoiceError.set('The voice recording must be smaller than 15 MB.');
      return;
    }
    try {
      const duration = knownDuration ?? await this.audioFileDuration(file);
      if (!Number.isFinite(duration) || duration < 20 || duration > 180) {
        this.personalVoiceError.set('Use 20 seconds to 3 minutes of clear speech. Around 60–90 seconds works best.');
        return;
      }
      this.personalVoiceFile.set(file);
      this.personalVoiceDurationSeconds.set(duration);
    } catch {
      this.personalVoiceError.set('The recording duration could not be read. Try an MP3, WAV, M4A, OGG, or WebM file.');
    }
  }

  private audioFileDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      const cleanup = () => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
        URL.revokeObjectURL(url);
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Audio metadata timed out.'));
      }, 10_000);
      audio.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        const duration = audio.duration;
        cleanup();
        Number.isFinite(duration) && duration > 0 ? resolve(duration) : reject(new Error('Invalid audio duration.'));
      };
      audio.onerror = () => {
        window.clearTimeout(timeout);
        cleanup();
        reject(new Error('Audio metadata failed.'));
      };
      audio.preload = 'metadata';
      audio.src = url;
    });
  }

  private cleanupPersonalVoiceRecorder(): void {
    if (this.personalVoiceRecordingTimer) {
      clearInterval(this.personalVoiceRecordingTimer);
      this.personalVoiceRecordingTimer = null;
    }
    this.personalVoiceRecordingStream?.getTracks().forEach((track) => track.stop());
    this.personalVoiceRecordingStream = null;
    this.personalVoiceRecorder = null;
    this.personalVoiceRecordingChunks = [];
    this.personalVoiceRecording.set(false);
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
    this.stopStackVoicePreview();
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
    return hasSongCardSignal(card);
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
    const frames = this.stackFrames();
    const index = Math.max(0, Math.min(frameIndex, frames.length - 1));
    return frames[index] ?? { kind: 'cover', index: 0, total: 1 };
  }

  previousStackFrame(): void {
    const resumeNarratedPlayback = this.isNarratedStackLiveView() && this.stackPlaying();
    if (resumeNarratedPlayback) {
      this.stackTourNarrationConsent.set(true);
    }
    this.stopStackPlayback();
    this.stackFrameIndex.update((index) => previousFiniteStackFrameIndex(index));
    this.stackCardPhotoIndex.set(0);
    this.syncStackLivePreviewAfterFrameChange();
    if (resumeNarratedPlayback) {
      this.stackPlaying.set(true);
      this.scheduleStackCardPhotoSequence(true);
      this.syncStackNarrationAfterFrameChange({ autoAdvance: true, forceNarration: true });
    }
  }

  async replayStack(board: Board, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    this.stopStackPlayback();
    this.stackExpandedCardId.set(null);
    this.stackFrameIndex.set(0);
    this.stackCardPhotoIndex.set(0);
    this.syncStackLivePreviewAfterFrameChange();
    await this.unlockStackNarrationAudio();
    if (!this.stackDirectView() || this.selectedBoard()?.id !== board.id) return;
    this.stackTourNarrationConsent.set(true);
    this.startStackPlayback();
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

  stackCardEyebrow(board: Board, card: BoardCard): string {
    const rank = card.rank || this.rankFromTags(card.tags);
    return [
      this.boardShowsCardNumbers(board) && rank ? `#${rank}` : '',
      this.cardDisplaySubtitle(board, card),
    ].filter(Boolean).join(' · ');
  }

  stackCardSummary(board: Board, card: BoardCard): string {
    const subtitle = this.cardDisplaySubtitle(board, card);
    const summary = cardPresentationSubtitle(
      card.shortSummary || subtitle,
      this.boardShowsCardNumbers(board),
    );
    if (summary && summary !== subtitle) return summary;
    const sentence = card.notes.match(/^(.{1,155}?[.!?])(?:\s|$)/)?.[1] ?? '';
    return sentence || subtitle;
  }

  stackCardPresentationImages(card: BoardCard): string[] {
    return listingCardPresentationImages(card);
  }

  stackCardPhotoPosition(): string {
    const images = this.stackCurrentCardPresentationImages();
    if (images.length < 2) return '';
    return `${Math.min(this.stackCardPhotoIndex() + 1, images.length)} of ${images.length}`;
  }

  stackListingGroupLabel(card: BoardCard): string {
    const presentation = card.listingPresentation;
    if (!presentation) return '';
    const count = presentation.sourcePhotoCount || card.imageUrls.length;
    return `${presentation.label} · ${count} ${count === 1 ? 'photo' : 'photos'}`;
  }

  selectStackCardPhoto(index: number, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const images = this.stackCurrentCardPresentationImages();
    if (!images.length) return;
    this.stackCardPhotoIndex.set(Math.max(0, Math.min(Math.trunc(index), images.length - 1)));
    this.scheduleStackCardPhotoSequence(false);
  }

  stackCardHasMore(board: Board, card: BoardCard): boolean {
    return card.notes.trim().length > 0 && card.notes.trim() !== this.stackCardSummary(board, card).trim();
  }

  stackHandoffTeaser(frame: StackFrame = this.stackCurrentFrame()): string {
    return frame.kind === 'handoff' ? tourHandoffDestinationTeaser(frame.nextCard) : '';
  }

  stackHandoffMeta(frame: StackFrame = this.stackCurrentFrame()): string {
    return frame.kind === 'handoff'
      ? [frame.card.tour?.legToNext?.durationText, frame.card.tour?.legToNext?.distanceText]
          .map((value) => value?.trim() || '')
          .filter(Boolean)
          .join(' · ')
      : '';
  }

  stackHandoffImage(board: Board, frame: StackFrame = this.stackCurrentFrame()): string {
    return frame.kind === 'handoff'
      ? this.cardImages(frame.nextCard)[0] || this.stackCoverImage(board)
      : '';
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

  async replayStackCardNarration(card: BoardCard, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.isBrowser || this.stackCurrentCard()?.id !== card.id) return;
    this.stopStackPlayback();
    await this.unlockStackNarrationAudio();
    if (this.stackCurrentCard()?.id !== card.id) return;
    this.stackPlaying.set(true);
    this.syncStackNarrationAfterFrameChange({ autoAdvance: true, forceNarration: true });
  }

  stackCardNarrationLoading(card: BoardCard): boolean {
    return this.tourAudioLoadingKey() === this.narrationAudioRequestKey(
      this.stackCardAudioKey(card),
      this.stackNarratorVoiceId(),
    );
  }

  stackNarrationLoading(): boolean {
    const frame = this.stackCurrentFrame();
    if (frame.kind === 'handoff') return this.stackTourNarrationLoading();
    if (frame.kind !== 'card') return false;
    return frame.card.tour
      ? this.stackTourNarrationLoading()
      : this.stackCardNarrationLoading(frame.card);
  }

  private stackCardNarrationText(card: BoardCard): string {
    const draft = this.stackStudioOpen() ? this.stackScriptCardDrafts()[card.id]?.narration : undefined;
    return (draft ?? this.persistedStackCardNarrationText(card)).trim();
  }

  private persistedStackCardNarrationText(card: BoardCard): string {
    return (card.notes || card.shortSummary || card.subtitle).trim();
  }

  private stackVoicePreviewSample(fallback: string): string {
    const firstCard = this.stackSelectedCards()[0];
    const script = firstCard ? this.stackScriptNarration(firstCard).trim() : '';
    if (!script) return fallback;
    const words = script.split(/\s+/).filter(Boolean);
    return words.slice(0, 42).join(' ');
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

  async toggleStackPlayback(): Promise<void> {
    if (this.stackPlaying()) {
      this.stopStackPlayback();
      return;
    }
    await this.unlockStackNarrationAudio();
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

  async startNarratedStack(event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    await this.unlockStackNarrationAudio();
    this.stackTourNarrationConsent.set(true);
    this.startStackPlayback();
  }

  stackTourNarrationLoading(): boolean {
    const frame = this.stackTourFrameFromStackFrame(this.stackCurrentFrame());
    return !!frame && this.tourAudioLoadingKey() === this.narrationAudioRequestKey(
      this.tourAudioKey(frame),
      this.stackNarratorVoiceId(),
    );
  }

  async replayStackCurrentNarration(event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const frameKey = stackStoryFrameKey(this.stackCurrentFrame());
    if (!this.stackCurrentNarrationFrame()) return;
    this.stopStackPlayback();
    await this.unlockStackNarrationAudio();
    if (stackStoryFrameKey(this.stackCurrentFrame()) !== frameKey) return;
    this.stackTourNarrationConsent.set(true);
    this.stackPlaying.set(true);
    this.syncStackNarrationAfterFrameChange({ autoAdvance: true, forceNarration: true });
  }

  async shareStackTo(target: StackExportTarget): Promise<void> {
    let board = this.stackBoard();
    if (!board || !this.isBrowser || this.stackVideoExporting()) {
      return;
    }
    if (!this.canEditBoard(board)) {
      this.setStackShareMessage('Make your own copy of this board before creating a new video.', false);
      return;
    }
    if (this.stackVideoNarrationEnabled()
      && stackNarratorVoiceRequiresPaidPlan(this.stackNarratorVoiceId())
      && !this.personalVoiceEligible()) {
      this.requestPersonalVoiceUpgrade();
      return;
    }
    const savedBoard = await this.stackBoardWithSavedVideoSettings(board);
    if (!savedBoard) return;
    board = savedBoard;
    const url = this.stackShareUrl(board);
    const caption = this.stackCaption().trim() || `LivingWiki Stack: ${board.title}`;
    const text = `${caption}\n${url}`;
    this.setStackShareMessage(null);
    this.stackVideoExporting.set(true);
    this.stackVideoProgress.set(0);
    this.setStackShareMessage('Preparing phone and landscape videos…', false);

    try {
      const { vertical, landscape } = await this.createStackVideoPair(board);
      const preferredRatio: StackDeliveryRatio = this.stackRatio() === 'landscape' ? 'landscape' : 'vertical';
      const result = preferredRatio === 'landscape' ? landscape : vertical;
      const file = this.stackVideoFile(board, result, preferredRatio);
      const librarySave = await this.saveStackVideoToLibrary(board, vertical, null, 'full', {
        result: landscape,
        publicStoragePath: '',
      });
      const libraryMessage = librarySave === true
        ? ' Both formats were saved to My Videos.'
        : librarySave === false
          ? ' The videos were created, but could not be saved to My Videos.'
          : '';

      if (target !== 'download' && this.canNativeShareFile(file)) {
        try {
          await navigator.share({
            title: board.title,
            text,
            files: [file],
          });
          this.setStackShareMessage(`${preferredRatio === 'landscape' ? 'Landscape' : 'Phone'} video shared as native media.${libraryMessage}`);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            this.setStackShareMessage('Share was cancelled.');
            return;
          }
        }
      }

      this.downloadStackVideo(file);
      if (target === 'download') {
        this.downloadStackVideo(this.stackVideoFile(
          board,
          preferredRatio === 'landscape' ? vertical : landscape,
          preferredRatio === 'landscape' ? 'vertical' : 'landscape',
        ));
      }
      await this.copyTextToClipboard(text);
      if (target === 'download') {
        this.setStackShareMessage(`Phone and landscape videos downloaded; the caption is copied.${libraryMessage}`, false);
      } else {
        this.setStackShareMessage(result.xCompatible
          ? `Video downloaded. Attach it to ${this.stackTargetLabel(target)} for inline playback; the caption is copied.${libraryMessage}`
          : `Video downloaded as WebM. Convert it to MP4, then attach it to ${this.stackTargetLabel(target)}; the caption is copied.${libraryMessage}`, false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Video export failed.';
      this.setStackShareMessage(message, false);
    } finally {
      this.stackVideoExporting.set(false);
      this.stackVideoProgress.set(0);
      this.stackVideoVerticalProgress.set(0);
      this.stackVideoLandscapeProgress.set(0);
      this.stackVideoRenderingRatio.set(null);
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

  trailerVideoShareUrl(board: Board): string {
    if (!board.trailerVideoUrl) return '';
    const version = encodeURIComponent(`${board.trailerVideoUpdatedAt || board.updatedAt || board.id}-${playerCardVersion}`);
    const path = `/share/board/${encodeURIComponent(board.id)}/trailer?v=${version}`;
    return board.visibility === 'public'
      ? `${PUBLIC_APP_URL}${path}`
      : this.isBrowser ? `${window.location.origin}${path}` : path;
  }

  trailerVideoFileUrl(board: Board): string {
    if (!board.trailerVideoUrl) return '';
    const version = encodeURIComponent(board.trailerVideoUpdatedAt || board.updatedAt || board.id);
    const path = `/share/board/${encodeURIComponent(board.id)}/trailer.mp4?v=${version}`;
    return board.visibility === 'public'
      ? `${PUBLIC_APP_URL}${path}`
      : this.isBrowser ? `${window.location.origin}${path}` : path;
  }

  stackSelectedShareUrl(board: Board): string {
    return this.stackShareMode() === 'trailer'
      ? this.trailerVideoShareUrl(board)
      : this.stackShareMode() === 'video'
        ? this.socialVideoShareUrl(board)
        : this.stackSocialShareUrl(board);
  }

  stackSelectedShareLabel(): string {
    return this.stackShareMode() === 'trailer'
      ? 'Board Trailer page'
      : this.stackShareMode() === 'video'
        ? 'Permanent full-video page (optional)'
        : 'Live-view link';
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
    if (this.stackShareMode() === 'trailer') {
      await this.sharePublishedStackTrailer(board, target);
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
    if (!board.socialVideoUrl || !board.socialVideoUpdatedAt
      || !board.socialLandscapeVideoUrl || !board.socialLandscapeVideoUpdatedAt) return false;
    if (!stackVideoRenderIsCurrent(board.socialVideoRenderVersion)) return false;
    if (!stackVideoRenderIsCurrent(board.socialLandscapeVideoRenderVersion)) return false;
    const videoTime = Date.parse(board.socialVideoUpdatedAt);
    const landscapeVideoTime = Date.parse(board.socialLandscapeVideoUpdatedAt);
    const boardTime = Date.parse(board.updatedAt);
    const brandingTime = this.stackStudioBoardId() === board.id
      ? Date.parse(this.stackVideoBrandingUpdatedAt())
      : Number.NaN;
    return Number.isFinite(videoTime)
      && Number.isFinite(landscapeVideoTime)
      && Number.isFinite(boardTime)
      && videoTime >= boardTime
      && landscapeVideoTime >= boardTime
      && (!Number.isFinite(brandingTime) || (videoTime >= brandingTime && landscapeVideoTime >= brandingTime));
  }

  trailerVideoIsCurrent(board: Board): boolean {
    if (!board.trailerVideoUrl || !board.trailerVideoUpdatedAt
      || !board.trailerLandscapeVideoUrl || !board.trailerLandscapeVideoUpdatedAt) return false;
    if (board.trailerVideoRenderVersion !== STACK_TRAILER_RENDER_VERSION) return false;
    if (board.trailerLandscapeVideoRenderVersion !== STACK_TRAILER_RENDER_VERSION) return false;
    const selectedIds = this.stackSelectedCards().slice(0, STACK_VIDEO_MAX_CARDS).map((card) => card.id);
    if (selectedIds.length !== board.trailerVideoCardIds.length
      || selectedIds.some((id, index) => board.trailerVideoCardIds[index] !== id)) return false;
    if (board.trailerVideoAudioTrackId !== this.stackAudioTrackId()
      || Math.abs(board.trailerVideoAudioVolume - this.stackAudioVolume()) > 0.001
      || (board.trailerVideoNarrationEnabled !== false) !== this.stackTrailerNarrationEnabled()) return false;
    const videoTime = Date.parse(board.trailerVideoUpdatedAt);
    const landscapeVideoTime = Date.parse(board.trailerLandscapeVideoUpdatedAt);
    const boardTime = Date.parse(board.updatedAt);
    const brandingTime = this.stackStudioBoardId() === board.id
      ? Date.parse(this.stackVideoBrandingUpdatedAt())
      : Number.NaN;
    return Number.isFinite(videoTime)
      && Number.isFinite(landscapeVideoTime)
      && Number.isFinite(boardTime)
      && videoTime >= boardTime
      && landscapeVideoTime >= boardTime
      && (!Number.isFinite(brandingTime) || (videoTime >= brandingTime && landscapeVideoTime >= brandingTime));
  }

  setStackSharePreviewRatio(ratio: StackDeliveryRatio): void {
    this.stackSharePreviewRatio.set(ratio);
  }

  publishedStackVideoVariant(
    board: Board,
    videoKind: 'full' | 'trailer',
    ratio: StackDeliveryRatio,
  ): PublishedStackVideoVariant | null {
    if (videoKind === 'trailer') {
      if (ratio === 'landscape') {
        return board.trailerLandscapeVideoUrl ? {
          url: board.trailerLandscapeVideoUrl,
          mimeType: board.trailerLandscapeVideoMimeType || 'video/mp4',
          updatedAt: board.trailerLandscapeVideoUpdatedAt,
          renderVersion: board.trailerLandscapeVideoRenderVersion || '',
          durationSeconds: board.trailerLandscapeVideoDurationSeconds,
          ratio,
        } : null;
      }
      return board.trailerVideoUrl ? {
        url: board.trailerVideoUrl,
        mimeType: board.trailerVideoMimeType || 'video/mp4',
        updatedAt: board.trailerVideoUpdatedAt,
        renderVersion: board.trailerVideoRenderVersion || '',
        durationSeconds: board.trailerVideoDurationSeconds,
        ratio,
      } : null;
    }
    if (ratio === 'landscape') {
      return board.socialLandscapeVideoUrl ? {
        url: board.socialLandscapeVideoUrl,
        mimeType: board.socialLandscapeVideoMimeType || 'video/mp4',
        updatedAt: board.socialLandscapeVideoUpdatedAt,
        renderVersion: board.socialLandscapeVideoRenderVersion || '',
        durationSeconds: board.socialLandscapeVideoDurationSeconds,
        ratio,
      } : null;
    }
    return board.socialVideoUrl ? {
      url: board.socialVideoUrl,
      mimeType: board.socialVideoMimeType || 'video/mp4',
      updatedAt: board.socialVideoUpdatedAt,
      renderVersion: board.socialVideoRenderVersion || '',
      durationSeconds: 0,
      ratio,
    } : null;
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

  async copyTrailerVideoFileUrl(board: Board): Promise<void> {
    if (!board.trailerVideoUrl) return;
    if (await this.copyTextToClipboard(this.trailerVideoFileUrl(board))) {
      this.setStackShareMessage('Direct Board Trailer file link copied.');
    } else {
      this.setStackShareMessage('Copy was blocked.', false);
    }
  }

  async publishStackTrailer(board: Board): Promise<void> {
    if (!this.isBrowser || this.stackVideoExporting()) return;
    if (this.stackVideoBrandingLoading() || this.stackVideoBrandingSaving() || this.stackVideoBrandingUploading()) {
      this.setStackShareMessage('Wait for video branding to finish before creating the trailer.', false);
      return;
    }
    if (!this.canEditBoard(board)) {
      this.setStackShareMessage('Only the board owner can publish a Board Trailer.', false);
      return;
    }
    if (board.visibility !== 'public') {
      this.setStackShareMessage('Make this board public before publishing its trailer.', false);
      return;
    }
    const uid = this.authService.uid();
    if (!uid || !this.storage) {
      this.setStackShareMessage('Sign in to publish a Board Trailer.', false);
      return;
    }
    if (this.stackTrailerNarrationEnabled()
      && stackNarratorVoiceRequiresPaidPlan(this.stackNarratorVoiceId())
      && !this.personalVoiceEligible()) {
      this.requestPersonalVoiceUpgrade();
      return;
    }
    const savedBoard = await this.stackBoardWithSavedScript(board);
    if (!savedBoard) return;
    board = savedBoard;

    this.stackVideoExporting.set(true);
    this.stackVideoProgress.set(0);
    this.setStackShareMessage('Writing the hook and creating your Board Trailer…', false);
    try {
      const created = await this.createStackTrailerPair(board);
      const { vertical, landscape } = created.results;
      if (vertical.blob.size >= 100 * 1024 * 1024 || landscape.blob.size >= 100 * 1024 * 1024) {
        throw new Error('The trailer is too large to publish. Select fewer cards and try again.');
      }
      const generatedAt = new Date().toISOString();
      const [verticalUpload, landscapeUpload] = await Promise.all([
        this.uploadPublishedStackVariant(uid, board, 'trailer', 'vertical', vertical, generatedAt),
        this.uploadPublishedStackVariant(uid, board, 'trailer', 'landscape', landscape, generatedAt),
      ]);
      this.publishedStackTrailerFiles.set(this.stackPublishedFileKey(board.id, 'vertical'), verticalUpload.file);
      this.publishedStackTrailerFiles.set(this.stackPublishedFileKey(board.id, 'landscape'), landscapeUpload.file);
      this.stackPublishedTrailerReady.set(true);
      const nextBoard: Board = {
        ...board,
        trailerVideoUrl: verticalUpload.url,
        trailerVideoMimeType: this.normalizedVideoMimeType(vertical.mimeType),
        trailerVideoUpdatedAt: generatedAt,
        trailerVideoRenderVersion: STACK_TRAILER_RENDER_VERSION,
        trailerVideoRatio: 'vertical',
        trailerVideoAudioTrackId: this.stackAudioTrackId(),
        trailerVideoAudioVolume: this.stackAudioVolume(),
        trailerVideoNarrationEnabled: this.stackTrailerNarrationEnabled(),
        trailerVideoScript: created.script,
        trailerVideoSourceFingerprint: created.fingerprint,
        trailerVideoCardIds: created.cardIds,
        trailerVideoDurationSeconds: vertical.durationSeconds,
        trailerLandscapeVideoUrl: landscapeUpload.url,
        trailerLandscapeVideoMimeType: this.normalizedVideoMimeType(landscape.mimeType),
        trailerLandscapeVideoUpdatedAt: generatedAt,
        trailerLandscapeVideoRenderVersion: STACK_TRAILER_RENDER_VERSION,
        trailerLandscapeVideoDurationSeconds: landscape.durationSeconds,
        stackNarratorVoiceId: this.stackNarratorVoiceId(),
      };
      const persisted = await this.persistBoard(nextBoard);
      this.boards.update((boards) => boards.map((item) => item.id === persisted.id ? persisted : item));
      const librarySave = await this.saveStackVideoToLibrary(persisted, vertical, {
        publicStoragePath: verticalUpload.path,
        publicShareUrl: this.trailerVideoShareUrl(persisted),
      }, 'trailer', {
        result: landscape,
        publicStoragePath: landscapeUpload.path,
      });
      this.setStackShareMessage(librarySave === false
        ? 'Board Trailer published. My Videos could not be updated, but the trailer link is ready.'
        : 'Board Trailer published and saved to My Videos. It is ready to share.', false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create the Board Trailer.';
      this.setStackShareMessage(message, false);
    } finally {
      this.stackVideoExporting.set(false);
      this.stackVideoProgress.set(0);
      this.stackVideoVerticalProgress.set(0);
      this.stackVideoLandscapeProgress.set(0);
      this.stackVideoRenderingRatio.set(null);
    }
  }

  async sharePublishedStackTrailer(
    board: Board,
    target: StackLinkShareTarget = 'more',
    ratio: StackDeliveryRatio = this.stackSharePreviewRatio(),
  ): Promise<void> {
    if (!this.isBrowser || this.stackVideoExporting()) return;
    const file = await this.preparePublishedStackFile(board, 'trailer', ratio);
    if (!file) return;
    const caption = this.stackCaption().trim() || `A quick look at ${board.title}.`;
    const boardUrl = this.stackSocialShareUrl(board);
    const shareText = `${caption}\n${boardUrl}`;
    try {
      if (target === 'more' && this.canNativeShareFile(file)) {
        await navigator.share({ title: board.title, text: shareText, files: [file] });
        this.setStackShareMessage(`${ratio === 'landscape' ? 'Landscape' : 'Phone'} Board Trailer shared as native video.`);
        return;
      }
      this.downloadStackVideo(file);
      if (target !== 'more') this.openStackLinkComposer(target, board, boardUrl, caption);
      await this.copyTextToClipboard(shareText);
      this.setStackShareMessage('Trailer downloaded and caption copied. Attach it as native media for autoplay.', false);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.setStackShareMessage('Share was cancelled.');
        return;
      }
      this.setStackShareMessage(error instanceof Error ? error.message : 'Could not share the Board Trailer.', false);
    }
  }

  private async preloadPublishedStackTrailer(board: Board, ratio: StackDeliveryRatio = 'vertical'): Promise<void> {
    const key = this.stackPublishedFileKey(board.id, ratio);
    if (!this.isBrowser || !this.publishedStackVideoVariant(board, 'trailer', ratio)
      || this.publishedStackTrailerFiles.has(key) || this.stackPublishedTrailerLoading()) return;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;
    this.stackPublishedTrailerLoading.set(true);
    this.stackPublishedTrailerReady.set(false);
    try {
      await this.preparePublishedStackFile(board, 'trailer', ratio, false);
      this.stackPublishedTrailerReady.set(true);
    } catch (error) {
      this.setStackShareMessage(error instanceof Error ? error.message : 'The Board Trailer could not be prepared.', false);
    } finally {
      this.stackPublishedTrailerLoading.set(false);
    }
  }

  private async createStackTrailerPair(board: Board): Promise<{
    results: StackVideoPair;
    script: string;
    fingerprint: string;
    cardIds: string[];
  }> {
    const cards = this.stackSelectedCards().slice(0, STACK_VIDEO_MAX_CARDS);
    if (!cards.length) throw new Error('Select at least one card for the Board Trailer.');
    if (!this.functions) throw new Error('Trailer writing is unavailable. Refresh and try again.');
    const prepare = httpsCallable<
      { boardId: string; cardIds: string[] },
      BoardTrailerPreparationResponse
    >(this.functions, 'prepareBoardTrailer', { timeout: 90_000 });
    const prepared = (await prepare({ boardId: board.id, cardIds: cards.map((card) => card.id) })).data;
    const script = prepared.script.trim();
    if (!script) throw new Error('The Board Trailer hook could not be written. Please try again.');
    let narration: StackTrailerNarration | null = null;
    if (this.stackTrailerNarrationEnabled()) {
      const audioUrl = await this.ensureTourAudioUrl(
        `stack-trailer:${board.id}:${prepared.fingerprint}:${script}`,
        script,
        this.stackNarratorVoiceId(),
        board.id,
        'stack-trailer',
        undefined,
        true,
      );
      if (!audioUrl) throw new Error('The Board Trailer voiceover could not be prepared. Please try again.');
      narration = { audioUrl, script, volume: 1 };
    }
    const payload = {
      title: board.title,
      subtitle: this.stackCoverSubtitle().trim() || board.description,
      ownerName: this.ownerName(board),
      coverImageUrl: this.stackCoverImage(board),
      liveUrl: this.stackShareUrl(board),
      qrImageUrl: '',
      showCardNumbers: this.boardShowsCardNumbers(board),
      branding: this.effectiveStackVideoBranding(board),
      cards: cards.map((card) => ({
        title: card.title,
        subtitle: this.cardDisplaySubtitle(board, card),
        notes: card.notes,
        rank: card.rank ?? null,
        imageUrl: listingCardPresentationImages(card)[0] ?? '',
        imageUrls: listingCardPresentationImages(card),
        tourSequence: card.tour?.sequence ?? null,
      })),
    };
    const backgroundAudio = this.stackVideoBackgroundAudio();
    this.stackVideoRenderingRatio.set('vertical');
    const vertical = await generateStackTrailer(payload, 'vertical', (progress) => {
      const percent = Math.round(progress * 100);
      this.stackVideoVerticalProgress.set(percent);
      this.stackVideoProgress.set(Math.round(progress * 50));
    }, backgroundAudio, narration);
    this.stackVideoRenderingRatio.set('landscape');
    const landscape = await generateStackTrailer(payload, 'landscape', (progress) => {
      const percent = Math.round(progress * 100);
      this.stackVideoLandscapeProgress.set(percent);
      this.stackVideoProgress.set(50 + Math.round(progress * 50));
    }, backgroundAudio, narration);
    return {
      results: { vertical, landscape },
      script,
      fingerprint: prepared.fingerprint,
      cardIds: prepared.cardIds,
    };
  }

  async publishStackVideo(board: Board): Promise<void> {
    if (!this.isBrowser || this.stackVideoExporting()) return;
    if (this.stackVideoBrandingLoading() || this.stackVideoBrandingSaving() || this.stackVideoBrandingUploading()) {
      this.setStackShareMessage('Wait for video branding to finish before creating the video.', false);
      return;
    }
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
    if (this.stackVideoNarrationEnabled()
      && stackNarratorVoiceRequiresPaidPlan(this.stackNarratorVoiceId())
      && !this.personalVoiceEligible()) {
      this.requestPersonalVoiceUpgrade();
      return;
    }
    const savedBoard = await this.stackBoardWithSavedVideoSettings(board);
    if (!savedBoard) return;
    board = savedBoard;

    this.stackVideoExporting.set(true);
    this.stackVideoProgress.set(0);
    this.setStackShareMessage('Creating and publishing your video…', false);
    try {
      const results = await this.createStackVideoPair(board);
      const { vertical, landscape } = results;
      if (vertical.blob.size >= 100 * 1024 * 1024 || landscape.blob.size >= 100 * 1024 * 1024) {
        throw new Error('The video is too large to publish. Select fewer cards and try again.');
      }
      const generatedAt = new Date().toISOString();
      const [verticalUpload, landscapeUpload] = await Promise.all([
        this.uploadPublishedStackVariant(uid, board, 'full', 'vertical', vertical, generatedAt),
        this.uploadPublishedStackVariant(uid, board, 'full', 'landscape', landscape, generatedAt),
      ]);
      this.publishedStackVideoFiles.set(this.stackPublishedFileKey(board.id, 'vertical'), verticalUpload.file);
      this.publishedStackVideoFiles.set(this.stackPublishedFileKey(board.id, 'landscape'), landscapeUpload.file);
      this.stackPublishedVideoReady.set(true);
      const nextBoard: Board = {
        ...board,
        socialVideoUrl: verticalUpload.url,
        socialVideoMimeType: this.normalizedVideoMimeType(vertical.mimeType),
        socialVideoUpdatedAt: generatedAt,
        socialVideoRenderVersion: STACK_VIDEO_RENDER_VERSION,
        socialVideoRatio: 'vertical',
        socialVideoAudioTrackId: this.stackAudioTrackId(),
        socialVideoAudioVolume: this.stackAudioVolume(),
        socialVideoNarrationEnabled: this.stackVideoNarrationEnabled(),
        socialLandscapeVideoUrl: landscapeUpload.url,
        socialLandscapeVideoMimeType: this.normalizedVideoMimeType(landscape.mimeType),
        socialLandscapeVideoUpdatedAt: generatedAt,
        socialLandscapeVideoRenderVersion: STACK_VIDEO_RENDER_VERSION,
        socialLandscapeVideoDurationSeconds: landscape.durationSeconds,
        stackNarratorVoiceId: this.stackNarratorVoiceId(),
      };
      const persisted = await this.persistBoard(nextBoard);
      this.boards.update((boards) => boards.map((item) => item.id === persisted.id ? persisted : item));
      const librarySave = await this.saveStackVideoToLibrary(persisted, vertical, {
        publicStoragePath: verticalUpload.path,
        publicShareUrl: this.socialVideoShareUrl(persisted),
      }, 'full', {
        result: landscape,
        publicStoragePath: landscapeUpload.path,
      });
      this.setStackShareMessage(librarySave === false
        ? 'Permanent video link published, but My Videos could not be updated. You can still copy the link or share the MP4.'
        : 'Permanent video link published and saved to My Videos. You can copy it or share the MP4 natively.', false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not publish the video.';
      this.setStackShareMessage(message, false);
    } finally {
      this.stackVideoExporting.set(false);
      this.stackVideoProgress.set(0);
      this.stackVideoVerticalProgress.set(0);
      this.stackVideoLandscapeProgress.set(0);
      this.stackVideoRenderingRatio.set(null);
    }
  }

  async sharePublishedStackVideo(
    board: Board,
    target: StackLinkShareTarget = 'more',
    ratio: StackDeliveryRatio = this.stackSharePreviewRatio(),
  ): Promise<void> {
    if (!this.isBrowser || this.stackVideoExporting()) return;
    const file = await this.preparePublishedStackFile(board, 'full', ratio);
    if (!file) return;
    const caption = this.stackCaption().trim() || `LivingWiki Stack: ${board.title}`;
    const liveUrl = this.stackSocialShareUrl(board);
    const shareText = `${caption}\n${liveUrl}`;
    try {
      if (target === 'more' && this.canNativeShareFile(file)) {
        await navigator.share({ title: board.title, text: shareText, files: [file] });
        this.setStackShareMessage(`${ratio === 'landscape' ? 'Landscape' : 'Phone'} MP4 shared as native media for in-feed playback.`);
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

  private async preloadPublishedStackVideo(board: Board, ratio: StackDeliveryRatio = 'vertical'): Promise<void> {
    const key = this.stackPublishedFileKey(board.id, ratio);
    if (!this.isBrowser || !this.publishedStackVideoVariant(board, 'full', ratio)
      || this.publishedStackVideoFiles.has(key) || this.stackPublishedVideoLoading()) {
      return;
    }
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return;
    }
    this.stackPublishedVideoLoading.set(true);
    this.stackPublishedVideoReady.set(false);
    try {
      await this.preparePublishedStackFile(board, 'full', ratio, false);
      this.stackPublishedVideoReady.set(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The permanent video could not be prepared.';
      this.setStackShareMessage(message, false);
    } finally {
      this.stackPublishedVideoLoading.set(false);
    }
  }

  private async preparePublishedStackFile(
    board: Board,
    videoKind: 'full' | 'trailer',
    ratio: StackDeliveryRatio,
    showError = true,
  ): Promise<File | null> {
    const variant = this.publishedStackVideoVariant(board, videoKind, ratio);
    if (!variant) {
      if (showError) this.setStackShareMessage(`${ratio === 'landscape' ? 'Landscape' : 'Phone'} version is not available yet.`, false);
      return null;
    }
    const files = videoKind === 'trailer' ? this.publishedStackTrailerFiles : this.publishedStackVideoFiles;
    const key = this.stackPublishedFileKey(board.id, ratio);
    const cached = files.get(key);
    if (cached) return cached;
    try {
      const response = await fetch(variant.url);
      if (!response.ok) throw new Error('The video file could not be prepared.');
      const blob = await response.blob();
      const extension: StackVideoResult['extension'] = (variant.mimeType || blob.type).includes('mp4') ? 'mp4' : 'webm';
      const result: StackVideoResult = {
        blob,
        mimeType: this.normalizedVideoMimeType(variant.mimeType || blob.type || `video/${extension}`),
        extension,
        xCompatible: extension === 'mp4',
        durationSeconds: variant.durationSeconds,
      };
      const file = videoKind === 'trailer'
        ? this.stackTrailerFile(board, result, ratio)
        : this.stackVideoFile(board, result, ratio);
      files.set(key, file);
      return file;
    } catch (error) {
      if (showError) {
        this.setStackShareMessage(error instanceof Error ? error.message : 'The video file could not be prepared.', false);
      }
      return null;
    }
  }

  async downloadPublishedStackVariant(
    board: Board,
    videoKind: 'full' | 'trailer',
    ratio: StackDeliveryRatio,
  ): Promise<void> {
    const file = await this.preparePublishedStackFile(board, videoKind, ratio);
    if (!file) return;
    this.downloadStackVideo(file);
    this.setStackShareMessage(`${ratio === 'landscape' ? 'Landscape 16:9' : 'Phone 9:16'} video downloaded.`);
  }

  async downloadBothPublishedStackVariants(board: Board, videoKind: 'full' | 'trailer'): Promise<void> {
    const [vertical, landscape] = await Promise.all([
      this.preparePublishedStackFile(board, videoKind, 'vertical'),
      this.preparePublishedStackFile(board, videoKind, 'landscape'),
    ]);
    if (vertical) this.downloadStackVideo(vertical);
    if (landscape) this.downloadStackVideo(landscape);
    if (vertical && landscape) this.setStackShareMessage('Phone and Landscape videos downloaded.');
  }

  private async createStackVideo(board: Board): Promise<StackVideoResult> {
    const prepared = await this.prepareStackVideoRender(board);
    return generateStackVideo(
      prepared.payload,
      this.stackRatio(),
      (progress) => this.stackVideoProgress.set(Math.round(progress * 100)),
      prepared.backgroundAudio,
      prepared.narration,
    );
  }

  private async createStackVideoPair(board: Board): Promise<StackVideoPair> {
    const prepared = await this.prepareStackVideoRender(board);
    this.stackVideoRenderingRatio.set('vertical');
    const vertical = await generateStackVideo(prepared.payload, 'vertical', (progress) => {
      const percent = Math.round(progress * 100);
      this.stackVideoVerticalProgress.set(percent);
      this.stackVideoProgress.set(Math.round(progress * 50));
    }, prepared.backgroundAudio, prepared.narration);
    this.stackVideoRenderingRatio.set('landscape');
    const landscape = await generateStackVideo(prepared.payload, 'landscape', (progress) => {
      const percent = Math.round(progress * 100);
      this.stackVideoLandscapeProgress.set(percent);
      this.stackVideoProgress.set(50 + Math.round(progress * 50));
    }, prepared.backgroundAudio, prepared.narration);
    return { vertical, landscape };
  }

  private async prepareStackVideoRender(board: Board): Promise<{
    payload: Parameters<typeof generateStackVideo>[0];
    backgroundAudio: StackVideoBackgroundAudio | null;
    narration: StackVideoNarration | null;
  }> {
    if (!this.canEditBoard(board)) {
      throw new Error('Make your own copy of this board before creating a new video.');
    }
    const selectedCards = this.stackSelectedCards().slice(0, STACK_VIDEO_MAX_CARDS);
    const backgroundAudio = this.stackVideoBackgroundAudio();
    if (this.stackVideoNarrationEnabled()
      && stackNarratorVoiceRequiresPaidPlan(this.stackNarratorVoiceId())
      && !this.personalVoiceEligible()) {
      throw new Error('Personal Voice requires Personal Plus or Creator. Choose an included narrator voice to continue for free.');
    }
    const narration = this.stackVideoNarrationEnabled()
      ? await this.stackVideoNarration(selectedCards, board)
      : null;
    const payload = {
      title: this.stackScriptBoardTitle().trim() || board.title,
      subtitle: this.stackScriptBoardDescription().trim() || board.description,
      ownerName: this.ownerName(board),
      coverImageUrl: this.stackCoverImage(board),
      liveUrl: this.stackShareUrl(board),
      qrImageUrl: this.stackQrImageUrl(board),
      showCardNumbers: this.boardShowsCardNumbers(board),
      branding: this.effectiveStackVideoBranding(board),
      closingScreen: this.currentStackFinalScreen(board),
      cards: selectedCards.map((card) => ({
        title: this.stackScriptTitle(card),
        subtitle: this.cardDisplaySubtitle(board, card),
        notes: this.stackScriptNarration(card),
        rank: card.rank ?? null,
        imageUrl: listingCardPresentationImages(card)[0] ?? '',
        imageUrls: listingCardPresentationImages(card),
        tourSequence: card.tour?.sequence ?? null,
      })),
    };
    return { payload, backgroundAudio, narration };
  }

  private async stackVideoNarration(cards: BoardCard[], board: Board): Promise<StackVideoNarration | null> {
    if (!cards.length) return null;
    const voiceId = this.stackNarratorVoiceId();
    const cardAudioUrls: Array<string | null> = Array.from({ length: cards.length }, () => null);
    const batchSize = 4;
    for (let offset = 0; offset < cards.length; offset += batchSize) {
      const batch = cards.slice(offset, offset + batchSize);
      const urls = await Promise.all(batch.map(async (card) => {
        const text = this.stackVideoNarrationText(card);
        try {
          const url = await this.ensureTourAudioUrl(
            `stack-video:${card.id}:r${Math.max(0, Math.trunc(card.videoNarrationRevision ?? 0))}:${text}`,
            text,
            voiceId,
            board.id,
            'stack-video',
            card.id,
            true,
          );
          if (url) return url;
        } catch (error) {
          console.error('Full video narration stopped before rendering.', error, {
            boardId: board.id,
            cardId: card.id,
          });
        }
        throw new Error(`Narration could not be prepared for “${card.title}”. No video was created. Please try again.`);
      }));
      urls.forEach((url, index) => {
        cardAudioUrls[offset + index] = url;
      });
    }
    if (!cardAudioUrls.every(Boolean)) {
      throw new Error('Full narration could not be prepared for every selected card. No video was created. Please try again.');
    }
    return { cardAudioUrls, volume: 1 };
  }

  private stackVideoNarrationText(card: BoardCard): string {
    return (this.stackScriptNarration(card) || `${this.stackScriptTitle(card)}.`).trim();
  }

  private async stackBoardWithSavedScript(board: Board): Promise<Board | null> {
    if (this.stackScriptDirty() || this.stackCoverDirty()) {
      const saved = this.stackScriptDirty()
        ? await this.saveStackScript(board)
        : await this.saveStackCover(board);
      if (!saved) {
        this.stackSoundTab.set('script');
        this.setStackShareMessage('Review the highlighted Studio fields before creating the video.', false);
        return null;
      }
    }
    const current = this.stackBoard();
    return current?.id === board.id ? current : board;
  }

  private async stackBoardWithSavedVideoSettings(board: Board): Promise<Board | null> {
    const scriptBoard = await this.stackBoardWithSavedScript(board);
    if (!scriptBoard) return null;
    if (this.stackFinalScreenDirty()) {
      const saved = await this.saveStackFinalScreen(scriptBoard);
      if (!saved) {
        this.setStackShareMessage('Review the Final screen settings before creating the video.', false);
        return null;
      }
    }
    const current = this.stackBoard();
    return current?.id === scriptBoard.id ? current : scriptBoard;
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
    this.publishedStackVideoFiles.delete(this.stackPublishedFileKey(board.id, 'vertical'));
    this.publishedStackVideoFiles.delete(this.stackPublishedFileKey(board.id, 'landscape'));
    this.stackPublishedVideoReady.set(false);
    void this.persistAndReplaceBoard(nextBoard);
  }

  private saveStackNarratorPreference(board: Board, force = false): void {
    const currentBoard = this.boards().find((item) => item.id === board.id);
    if (!currentBoard || !this.canEditBoard(currentBoard)) return;
    const voiceId = normalizeStackNarratorVoiceId(this.stackNarratorVoiceId());
    if (currentBoard.stackNarratorVoiceId === voiceId && !force) return;
    const nextBoard: Board = {
      ...currentBoard,
      stackNarratorVoiceId: voiceId,
      updatedAt: new Date().toISOString(),
    };
    this.boards.update((boards) =>
      boards.map((item) => item.id === nextBoard.id ? nextBoard : item),
    );
    this.publishedStackVideoFiles.delete(this.stackPublishedFileKey(board.id, 'vertical'));
    this.publishedStackVideoFiles.delete(this.stackPublishedFileKey(board.id, 'landscape'));
    this.stackPublishedVideoReady.set(false);
    void this.persistStackNarratorPreference(nextBoard).then((saved) => {
      this.stackVoiceError.set(saved
        ? null
        : 'The narrator changed here, but could not be saved. Check your connection and try Preview again.');
    });
  }

  private async persistStackNarratorPreference(board: Board): Promise<boolean> {
    const uid = this.authService.uid();
    if (!this.firestore || !uid) {
      return true;
    }
    if (board.ownerUserId !== uid) {
      this.boardsSyncError.set($localize`Only the board owner can save changes.`);
      return false;
    }

    try {
      await updateDoc(doc(this.firestore, 'boards', board.id), {
        stackNarratorVoiceId: normalizeStackNarratorVoiceId(board.stackNarratorVoiceId),
        updated_at_iso: board.updatedAt,
        server_updated_at: serverTimestamp(),
      });
      this.boardsSyncError.set(null);
      return true;
    } catch (error) {
      console.error('Board narrator Firebase sync failed', error, { boardId: board.id });
      this.boardsSyncError.set($localize`Saved on this browser, but Firebase sync failed.`);
      return false;
    }
  }

  private stackPublishedFileKey(boardId: string, ratio: StackDeliveryRatio): string {
    return `${boardId}:${ratio}`;
  }

  private stackVideoFile(board: Board, result: StackVideoResult, ratio: StackDeliveryRatio = 'vertical'): File {
    const slug = board.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 54) || 'livingwiki-stack';
    const suffix = ratio === 'landscape' ? 'landscape-16x9' : 'phone-9x16';
    return new File([result.blob], `${slug}-${suffix}.${result.extension}`, { type: this.normalizedVideoMimeType(result.mimeType) });
  }

  private stackTrailerFile(board: Board, result: StackVideoResult, ratio: StackDeliveryRatio = 'vertical'): File {
    const slug = board.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 46) || 'livingwiki-board';
    const suffix = ratio === 'landscape' ? 'landscape-16x9' : 'phone-9x16';
    return new File([result.blob], `${slug}-trailer-${suffix}.${result.extension}`, { type: this.normalizedVideoMimeType(result.mimeType) });
  }

  private async uploadPublishedStackVariant(
    uid: string,
    board: Board,
    videoKind: 'full' | 'trailer',
    ratio: StackDeliveryRatio,
    result: StackVideoResult,
    generatedAt: string,
  ): Promise<{ path: string; url: string; file: File }> {
    if (!this.storage) throw new Error('Video storage is not ready.');
    const file = videoKind === 'trailer'
      ? this.stackTrailerFile(board, result, ratio)
      : this.stackVideoFile(board, result, ratio);
    const path = publishedStackVideoStoragePath(
      uid,
      board.id,
      videoKind,
      result.extension,
      `${ratio}-${Date.now().toString(36)}-${this.createId()}`,
    );
    const ref = storageRef(this.storage, path);
    await uploadBytes(ref, result.blob, {
      contentType: this.normalizedVideoMimeType(result.mimeType),
      cacheControl: 'public,max-age=31536000,immutable',
      contentDisposition: `inline; filename="${file.name}"`,
      customMetadata: { boardId: board.id, videoKind, ratio, generatedAt },
    });
    return { path, url: await getDownloadURL(ref), file };
  }

  private async saveStackVideoToLibrary(
    board: Board,
    result: StackVideoResult,
    published: { publicStoragePath: string; publicShareUrl: string } | null = null,
    videoKind: 'full' | 'trailer' = 'full',
    landscape?: { result: StackVideoResult; publicStoragePath: string },
  ): Promise<boolean | null> {
    if (!this.canEditBoard(board) || !this.authService.uid()) {
      return null;
    }
    try {
      await this.videoLibrary.saveLatestBoardVideo({
        boardId: board.id,
        videoKind,
        boardTitle: board.title,
        boardRoute: `${this.boardRouteRoot(board)}/${encodeURIComponent(board.id)}`,
        boardUpdatedAt: board.updatedAt,
        posterUrl: this.stackCoverImage(board),
        blob: result.blob,
        extension: result.extension,
        mimeType: this.normalizedVideoMimeType(result.mimeType),
        ratio: landscape ? 'vertical' : this.stackRatio(),
        durationSeconds: result.durationSeconds,
        renderVersion: videoKind === 'trailer' ? STACK_TRAILER_RENDER_VERSION : STACK_VIDEO_RENDER_VERSION,
        narrationEnabled: videoKind === 'trailer' ? this.stackTrailerNarrationEnabled() : this.stackVideoNarrationEnabled(),
        publicStoragePath: published?.publicStoragePath,
        publicShareUrl: published?.publicShareUrl,
        landscapeVariant: landscape ? {
          blob: landscape.result.blob,
          extension: landscape.result.extension,
          mimeType: this.normalizedVideoMimeType(landscape.result.mimeType),
          ratio: 'landscape',
          durationSeconds: landscape.result.durationSeconds,
          renderVersion: videoKind === 'trailer' ? STACK_TRAILER_RENDER_VERSION : STACK_VIDEO_RENDER_VERSION,
          publicStoragePath: landscape.publicStoragePath,
        } : undefined,
      });
      return true;
    } catch (error) {
      console.error('Video library save failed', error, { boardId: board.id });
      return false;
    }
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
    this.stopStackVoicePreview();
    this.stackStudioBoardId.set(board.id);
    this.stackSelectedCardIds.set(new Set(board.cards.map((card) => card.id)));
    this.applyStackCoverState(board);
    this.stackScriptCardDrafts.set(Object.fromEntries(board.cards.map((card) => [card.id, {
      title: card.title,
      subtitle: card.subtitle,
      narration: card.tour?.guideScript || this.persistedStackCardNarrationText(card) || '',
    }])));
    this.stackScriptLengthSourceNarrations.set(Object.fromEntries(board.cards.map((card) => [
      card.id,
      this.stackScriptRicherNarration(
        card.stackNarrationSource,
        card.tour?.guideScript || this.persistedStackCardNarrationText(card) || '',
      ),
    ])));
    this.stackScriptExpandedCardIds.set(new Set(board.cards.slice(0, 1).map((card) => card.id)));
    this.stackScriptOriginalSnapshot.set(this.stackScriptSnapshot(board));
    this.stackScriptSavedAt.set('');
    this.stackScriptShortenMenuOpen.set(false);
    this.stackScriptShortening.set(false);
    this.clearStackScriptShortenUndo();
    this.stackCoverSavedAt.set('');
    this.stackScriptError.set(null);
    this.stackScriptDiscardConfirmOpen.set(false);
    this.applyStackFinalScreenState(board);
    this.resetStackVideoBrandingState();
    void this.loadStackVideoBranding(board);
    this.stackCaption.set(`I made a LivingWiki Stack: ${board.title}. Explore the full board.`);
    this.stackFormat.set('reel');
    this.stackRatio.set('vertical');
    this.stackAudioTrackId.set(normalizeStackAudioTrackId(board.socialVideoAudioTrackId));
    this.stackAudioVolume.set(normalizeStackAudioVolume(board.socialVideoAudioVolume));
    this.stackVideoNarrationEnabled.set(board.socialVideoNarrationEnabled !== false);
    this.stackTrailerNarrationEnabled.set(board.trailerVideoNarrationEnabled !== false);
    const narratorVoiceId = normalizeStackNarratorVoiceId(board.stackNarratorVoiceId);
    this.stackNarratorVoiceId.set(
      stackNarratorVoiceRequiresPaidPlan(narratorVoiceId) && !this.personalVoiceEligible()
        ? DEFAULT_STACK_NARRATOR_VOICE_ID
        : narratorVoiceId,
    );
    this.stackAudioError.set(null);
    this.stackVoiceError.set(null);
    this.stackSoundTab.set('script');
    this.personalVoiceSetupOpen.set(false);
    this.personalVoiceError.set(null);
    this.stackFrameIndex.set(0);
    this.stackCardPhotoIndex.set(0);
    this.stackTourNarrationConsent.set(false);
    this.setStackShareMessage(null);
    void this.preloadStackAudioUrls();
  }

  private currentStackFinalScreen(board: Board): ReturnType<typeof normalizeStackVideoClosingScreen> {
    return normalizeStackVideoClosingScreen({
      headline: this.stackFinalScreenHeadline(),
      message: this.stackFinalScreenMessage(),
      showQrCode: this.stackFinalScreenShowQrCode(),
      image: this.stackFinalScreenImage(),
      customImageUrl: this.stackFinalScreenCustomImageUrl(),
      durationSeconds: this.stackFinalScreenDurationSeconds(),
    }, board.title);
  }

  private stackFinalScreenSnapshot(): string {
    return JSON.stringify({
      headline: this.stackFinalScreenHeadline().trim(),
      message: this.stackFinalScreenMessage().trim(),
      showQrCode: this.stackFinalScreenShowQrCode(),
      image: this.stackFinalScreenImage(),
      customImageUrl: this.stackFinalScreenCustomImageUrl(),
      durationSeconds: this.stackFinalScreenDurationSeconds(),
    });
  }

  private applyStackFinalScreenState(board: Board): void {
    const closing = normalizeStackVideoClosingScreen({
      headline: board.socialVideoClosingHeadline,
      message: board.socialVideoClosingMessage,
      showQrCode: board.socialVideoClosingShowQrCode,
      image: board.socialVideoClosingImage,
      customImageUrl: board.socialVideoClosingCustomImageUrl,
      durationSeconds: board.socialVideoClosingDurationSeconds,
    }, board.title);
    this.stackFinalScreenHeadline.set(closing.headline);
    this.stackFinalScreenMessage.set(closing.message);
    this.stackFinalScreenShowQrCode.set(closing.showQrCode);
    this.stackFinalScreenImage.set(closing.image);
    this.stackFinalScreenCustomImageUrl.set(closing.customImageUrl);
    this.stackFinalScreenDurationSeconds.set(closing.durationSeconds);
    this.stackFinalScreenError.set(null);
    this.stackFinalScreenOriginalSnapshot.set(this.stackFinalScreenSnapshot());
  }

  private resetStackVideoBrandingState(): void {
    this.stackVideoBrandingMode.set('livingwiki');
    this.stackVideoBrandingLogoUrl.set('');
    this.stackVideoBrandingUpdatedAt.set('');
    this.stackVideoBrandingSaving.set(false);
    this.stackVideoBrandingUploading.set(false);
    this.stackVideoBrandingLoading.set(false);
    this.stackVideoBrandingError.set(null);
    this.stackVideoBrandingUpgradeOpen.set(false);
  }

  private async loadStackVideoBranding(board: Board, preserveError = false): Promise<void> {
    if (!this.firestore || !this.authService.uid() || !this.canEditBoard(board)) return;
    this.stackVideoBrandingLoading.set(true);
    try {
      const snapshot = await getDoc(doc(this.firestore, 'boards', board.id, 'video_settings', 'branding'));
      if (this.stackStudioBoardId() !== board.id) return;
      const data = snapshot.data();
      const branding = normalizeStackVideoBranding({
        mode: data?.['mode'] === 'none' || data?.['mode'] === 'custom' ? data['mode'] : 'livingwiki',
        logoUrl: typeof data?.['logo_url'] === 'string' ? data['logo_url'] : '',
      });
      this.stackVideoBrandingMode.set(branding.mode);
      this.stackVideoBrandingLogoUrl.set(typeof data?.['logo_url'] === 'string' ? data['logo_url'].trim() : '');
      this.stackVideoBrandingUpdatedAt.set(typeof data?.['updated_at_iso'] === 'string' ? data['updated_at_iso'] : '');
      if (!preserveError) this.stackVideoBrandingError.set(null);
    } catch (error) {
      if (this.stackStudioBoardId() === board.id && !preserveError) {
        this.stackVideoBrandingError.set(error instanceof Error ? error.message : 'Video branding could not be loaded.');
      }
    } finally {
      if (this.stackStudioBoardId() === board.id) this.stackVideoBrandingLoading.set(false);
    }
  }

  private effectiveStackVideoBranding(_board: Board): ReturnType<typeof normalizeStackVideoBranding> {
    if (!this.videoBrandingEligible()) return normalizeStackVideoBranding(null);
    const branding = normalizeStackVideoBranding({
      mode: this.stackVideoBrandingMode(),
      logoUrl: this.stackVideoBrandingLogoUrl(),
    });
    if (this.stackVideoBrandingMode() === 'custom' && branding.mode !== 'custom') {
      throw new Error('Upload a logo before creating a video with Your logo selected.');
    }
    return branding;
  }

  private stackCoverSnapshot(): string {
    return JSON.stringify({
      title: this.stackScriptBoardTitle().trim(),
      description: this.stackScriptBoardDescription().trim(),
      imageUrl: this.stackCoverImageDraft(),
    });
  }

  private applyStackCoverState(board: Board): void {
    this.stackCoverTitle.set(board.title);
    this.stackCoverSubtitle.set(board.description);
    this.stackCoverImageDraft.set(board.imageUrl);
    this.stackScriptBoardTitle.set(board.title);
    this.stackScriptBoardDescription.set(board.description);
    this.stackCoverError.set(null);
    this.stackCoverOriginalSnapshot.set(this.stackCoverSnapshot());
  }

  private stackScriptSnapshot(board: Board | null = this.stackBoard()): string {
    const drafts = this.stackScriptCardDrafts();
    return JSON.stringify({
      cards: (board?.cards ?? []).map((card) => ({
        id: card.id,
        title: drafts[card.id]?.title ?? card.title,
        subtitle: drafts[card.id]?.subtitle ?? card.subtitle,
        narration: drafts[card.id]?.narration ?? (card.tour?.guideScript || this.persistedStackCardNarrationText(card) || ''),
      })),
    });
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
    } else {
      const selectedIds = this.stackSelectedCardIds();
      const hasEveryCard = selectedIds.size === board.cards.length
        && board.cards.every((card) => selectedIds.has(card.id));
      if (!hasEveryCard) {
        this.stopStackPlayback();
        this.stackSelectedCardIds.set(new Set(board.cards.map((card) => card.id)));
        this.stackFrameIndex.set(0);
        this.stackCardPhotoIndex.set(0);
      }
    }
    this.stackStudioOpen.set(false);
    if (this.stackAutoplayRequested() || this.stackNarrationSession.isUnlocked()) {
      this.stackTourNarrationConsent.set(true);
      this.startStackPlayback();
    } else {
      this.stackTourNarrationConsent.set(false);
    }
  }

  private syncRequestedStackStudio(): void {
    if (!this.stackStudioDirectRequested) return;
    const board = this.selectedBoard();
    if (!board || this.stackStudioDirectOpenedFor === board.id || !this.canUseStackStudio(board)) {
      return;
    }
    this.stackStudioDirectOpenedFor = board.id;
    this.stackStudioDirectRequested = false;
    this.openStackStudio(board);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { studio: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private syncRequestedStackShare(): void {
    if (!this.stackShareDirectRequested) return;
    const board = this.selectedBoard();
    if (!board || this.stackShareDirectOpenedFor === board.id) {
      return;
    }
    this.stackShareDirectOpenedFor = board.id;
    this.openStackShareDialog(board);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { share: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private canonicalizeBoardsRootRoute(boardId: string | null, ownerKey: string | null): void {
    if (!shouldCanonicalizeBoardsRootRoute({
      isBrowser: this.isBrowser,
      isFriendsPage: this.friendsPage(),
      isSongsPage: this.songsPage(),
      isTripsPage: this.tripsPage(),
      boardId,
      ownerKey,
      userId: this.authService.uid(),
      createQuery: this.route.snapshot.queryParamMap.get('create'),
    })) {
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

  private boardEmailShareErrorMessage(error: unknown): string {
    if (error instanceof FirebaseError) {
      if (error.code === 'functions/resource-exhausted') {
        return 'You have reached the email sharing limit. Try again later.';
      }
      if (error.code === 'functions/failed-precondition') {
        return error.message.includes('Verify')
          ? 'Verify your account email before sharing a board by email.'
          : 'Only public boards can be emailed.';
      }
      if (error.code === 'functions/unauthenticated') {
        return 'Sign in before emailing a board.';
      }
    }
    return this.boardFriendErrorMessage(error, 'The board could not be emailed. Please try again.');
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
    let reachedClosingFrame = false;
    this.stackFrameIndex.update((index) => {
      const count = this.stackFrameCount();
      const nextIndex = nextFiniteStackFrameIndex(index, count);
      reachedClosingFrame = count > 0 && nextIndex === count - 1;
      return nextIndex;
    });
    this.scheduleStackCardPhotoSequence(true);
    this.syncStackLivePreviewAfterFrameChange();
    if (reachedClosingFrame) {
      this.stopStackPlayback();
      return;
    }
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
    this.scheduleStackCardPhotoSequence(true);
    if (this.syncStackNarrationAfterFrameChange({ autoAdvance: true })) {
      return;
    }
    this.stackPlaybackTimer = setInterval(() => this.advanceStackFrame(), this.stackFrameDurationMs);
  }

  private stopStackPlayback(): void {
    this.clearStackPlaybackTimer();
    this.clearStackCardPhotoTimer();
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

  private clearStackCardPhotoTimer(): void {
    if (!this.stackCardPhotoTimer) return;
    clearTimeout(this.stackCardPhotoTimer);
    this.stackCardPhotoTimer = null;
  }

  private scheduleStackCardPhotoSequence(resetIndex: boolean): void {
    this.clearStackCardPhotoTimer();
    const frame = this.stackCurrentFrame();
    const card = frame.kind === 'card' ? frame.card : null;
    const images = card ? listingCardPresentationImages(card) : [];
    if (resetIndex) this.stackCardPhotoIndex.set(0);
    if (!card || !isListingGroupCard(card) || images.length < 2 || !this.stackDirectView() || !this.stackPlaying()) {
      return;
    }
    const currentIndex = Math.max(0, Math.min(this.stackCardPhotoIndex(), images.length - 1));
    this.preloadStackCardPhoto(images[currentIndex + 1]);
    if (currentIndex >= images.length - 1) return;
    const cardId = card.id;
    this.stackCardPhotoTimer = setTimeout(() => {
      this.stackCardPhotoTimer = null;
      if (!this.stackPlaying() || this.stackCurrentCard()?.id !== cardId) return;
      this.stackCardPhotoIndex.update((index) => Math.min(index + 1, images.length - 1));
      this.scheduleStackCardPhotoSequence(false);
    }, this.stackFrameDurationMs);
  }

  private preloadStackCardPhoto(url: string | undefined): void {
    if (!this.isBrowser || !url) return;
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
  }

  private isNarratedStackLiveView(): boolean {
    return this.stackDirectView();
  }

  private stackTourFrameFromStackFrame(frame: StackFrame): TourDeckFrame | null {
    if (frame.kind === 'card') {
      return {
        kind: 'stop',
        card: frame.card,
        nextCard: null,
        index: frame.index,
        total: frame.total,
      };
    }
    if (frame.kind === 'handoff') {
      return {
        kind: 'leg',
        card: frame.card,
        nextCard: frame.nextCard,
        index: frame.index,
        total: frame.total,
      };
    }
    return null;
  }

  private stackTourFrameKey(frame: TourDeckFrame): string {
    return frame.kind === 'leg'
      ? `handoff:${frame.card.id}:${frame.nextCard?.id ?? 'end'}`
      : `card:${frame.card.id}`;
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
    const tourFrame = this.stackTourFrameFromStackFrame(frame);
    if (!tourFrame) {
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(this.stackFrameDurationMs, token);
      }
      return true;
    }
    if (!autoAdvance && !options.forceNarration) {
      return true;
    }

    void this.playStackNarration(tourFrame, token, autoAdvance);
    return true;
  }

  private async playStackNarration(
    frame: TourDeckFrame,
    token: number,
    autoAdvance: boolean,
  ): Promise<void> {
    const text = this.stackNarrationTextForTourFrame(frame);
    if (!text.trim()) {
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(this.stackFrameDurationMs, token);
      }
      return;
    }

    const startedAt = Date.now();
    const frameKey = this.stackTourFrameKey(frame);
    this.stackActiveFrameDurationMs.set(120_000);
    const audioKey = frame.card.tour ? this.tourAudioKey(frame) : this.stackCardAudioKey(frame.card);
    const boardId = this.stackBoard()?.id || this.selectedBoard()?.id;
    const audioUrl = await this.ensureTourAudioUrl(audioKey, text, this.stackNarratorVoiceId(), boardId);
    if (!this.isStackNarrationCurrent(token, frameKey)) {
      return;
    }
    if (!audioUrl) {
      this.tourAudioNotice.set(null);
      if (this.startStackBrowserNarration(frame, text, token, autoAdvance, startedAt, frameKey)) {
        return;
      }
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
      if (!this.isStackNarrationCurrent(token, frameKey) || !Number.isFinite(audio.duration) || audio.duration <= 0) {
        return;
      }
      const elapsedMs = Date.now() - startedAt;
      this.stackActiveFrameDurationMs.set(Math.max(this.stackFrameDurationMs, Math.ceil(elapsedMs + audio.duration * 1000 + 450)));
    };
    audio.onloadedmetadata = syncProgressDuration;
    audio.onended = () => {
      if (!this.isStackNarrationCurrent(token, frameKey) || this.tourAudio !== audio) {
        return;
      }
      this.stopTourSpeech();
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(450, token);
      }
    };
    audio.onerror = () => {
      if (!this.isStackNarrationCurrent(token, frameKey) || this.tourAudio !== audio) {
        return;
      }
      this.stopTourSpeech();
      this.tourAudioNotice.set(null);
      if (this.startStackBrowserNarration(frame, text, token, autoAdvance, startedAt)) {
        return;
      }
      this.stackActiveFrameDurationMs.set(this.stackFrameDurationMs);
      this.tourAudioNotice.set('The narration could not play this part of the tour. Continuing.');
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(this.stackFrameDurationMs, token);
      }
    };

    try {
      await audio.play();
      syncProgressDuration();
      this.prefetchNextStackNarration(frameKey);
    } catch {
      if (!this.isStackNarrationCurrent(token, frameKey) || this.tourAudio !== audio) {
        return;
      }
      this.stopTourSpeech();
      this.tourAudioNotice.set(null);
      if (this.startStackBrowserNarration(frame, text, token, autoAdvance, startedAt, frameKey)) {
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
    frameKey = this.stackTourFrameKey(frame),
  ): boolean {
    if (!this.isBrowser
      || typeof window.speechSynthesis === 'undefined'
      || typeof window.SpeechSynthesisUtterance === 'undefined'
      || !this.isStackNarrationCurrent(token, frameKey)) {
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
      if (this.tourSpeechUtterance !== utterance || !this.isStackNarrationCurrent(token, frameKey)) {
        return;
      }
      this.tourSpeechUtterance = null;
      this.tourSpeechPlaying.set(false);
      if (autoAdvance && this.stackPlaying()) {
        this.scheduleStackFrameAdvance(450, token);
      }
    };
    utterance.onerror = () => {
      if (this.tourSpeechUtterance !== utterance || !this.isStackNarrationCurrent(token, frameKey)) {
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
    this.prefetchNextStackNarration(frameKey);
    return true;
  }

  private stackNarrationTextForTourFrame(frame: TourDeckFrame): string {
    return frame.kind === 'leg' && frame.nextCard
      ? effectiveTourHandoffText(
          frame.card,
          frame.nextCard,
          this.selectedBoard()?.kind === 'driving-tour' ? 'driving' : 'walking',
        )
      : frame.card.tour?.guideScript || this.stackCardNarrationText(frame.card);
  }

  private prefetchNextStackNarration(currentFrameKey: string): void {
    if (!this.isBrowser || stackStoryFrameKey(this.stackCurrentFrame()) !== currentFrameKey) return;
    const nextFrame = this.stackFrameAtIndex(this.stackFrameIndex() + 1);
    const tourFrame = this.stackTourFrameFromStackFrame(nextFrame);
    if (!tourFrame) return;
    const text = this.stackNarrationTextForTourFrame(tourFrame).trim();
    if (!text) return;
    const audioKey = tourFrame.card.tour
      ? this.tourAudioKey(tourFrame)
      : this.stackCardAudioKey(tourFrame.card);
    const boardId = this.stackBoard()?.id || this.selectedBoard()?.id;
    void this.ensureTourAudioUrl(
      audioKey,
      text,
      this.stackNarratorVoiceId(),
      boardId,
      'tour',
      undefined,
      false,
      true,
    );
  }

  private isStackNarrationCurrent(token: number, frameKey: string): boolean {
    return token === this.stackTourNarrationSwitchToken
      && this.isNarratedStackLiveView()
      && stackStoryFrameKey(this.stackCurrentFrame()) === frameKey;
  }

  private async unlockStackNarrationAudio(): Promise<void> {
    await this.stackNarrationSession.unlock();
  }

  private disposeStackNarrationAudio(): void {
    this.stackNarrationSession.dispose();
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
    if (this.wizardMode() === 'url' && this.wizardEntryIntent() === 'real-estate') {
      return 'Real Estate TalkThru';
    }
    if (this.wizardMode() === 'url' && this.wizardEntryIntent() === 'rental') {
      return 'Rental Property TalkThru';
    }
    return this.wizardModes.find((mode) => mode.id === this.wizardMode())?.label ?? 'Wizard';
  }

  wizardIsTalkThruListing(): boolean {
    return this.wizardEntryIntent() === 'real-estate' || this.wizardEntryIntent() === 'rental';
  }

  wizardIsRentalTalkThru(): boolean {
    return this.wizardEntryIntent() === 'rental';
  }

  private wizardListingIntentForApi(): 'auto' | 'sale' | 'rental' {
    if (this.wizardEntryIntent() === 'real-estate') return 'sale';
    if (this.wizardEntryIntent() === 'rental') return 'rental';
    return 'auto';
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

  private wizardNarrationStyleForGeneration(): BoardNarrationStyleId {
    if (this.wizardTargetBoardId() === 'new') {
      return this.wizardNarrationStyle();
    }
    const targetBoard = this.boards().find((board) => board.id === this.wizardTargetBoardId());
    return normalizeBoardNarrationStyleId(targetBoard?.narrationStyle);
  }

  private wizardNarrationSecondsForGeneration(): number {
    if (this.wizardTargetBoardId() === 'new') {
      return this.wizardNarrationSecondsPerCard();
    }
    const targetBoard = this.boards().find((board) => board.id === this.wizardTargetBoardId());
    return normalizeBoardNarrationSeconds(targetBoard?.narrationSecondsPerCard);
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

  private wizardDraftSnapshotKey(): string {
    const result = this.wizardResult();
    const cards = this.wizardPreviewCards();
    if (!result || !cards.length || !this.authService.uid()) {
      return '';
    }
    return JSON.stringify({
      mode: this.wizardMode(),
      entryIntent: this.wizardEntryIntent(),
      targetBoardId: this.wizardTargetBoardId(),
      lockedTargetBoardId: this.wizardLockedTargetBoardId(),
      contributionBoardId: this.wizardContributionBoardId(),
      defaultType: this.wizardDefaultType(),
      count: this.wizardCount(),
      countMode: this.wizardCountMode(),
      vibe: this.wizardVibe(),
      mediaMode: this.wizardMediaMode(),
      narrationStyle: this.wizardNarrationStyle(),
      narrationSecondsPerCard: this.wizardNarrationSecondsPerCard(),
      listingMarketingStyle: this.wizardListingMarketingStyle(),
      listingMarketingDirection: this.wizardListingMarketingDirection(),
      prompt: this.wizardPrompt(),
      pastedList: this.wizardPastedList(),
      sourceUrl: this.wizardUrl(),
      offGridName: this.wizardOffGridName(),
      offGridAddress: this.wizardOffGridAddress(),
      offGridTip: this.wizardOffGridTip(),
      stackCtaLabel: this.wizardStackCtaLabel(),
      stackCtaUrl: this.wizardStackCtaUrl(),
      tourVoiceStyle: this.wizardTourVoiceStyle(),
      tourPaceOrStyle: this.wizardTourPaceOrStyle(),
      tourExtras: [...this.wizardTourExtras()].sort(),
      board: result.board,
      sourceReport: result.sourceReport,
      cards,
      selectedCardIds: [...this.wizardSelectedCardIds()].sort(),
    });
  }

  private scheduleWizardDraftAutosave(delayMs = 700): void {
    if (!this.isBrowser || !this.firestore || !this.authService.uid() || this.wizardDraftRestoreInProgress) {
      return;
    }
    if (!this.wizardActiveDraftId()) {
      this.wizardActiveDraftId.set(this.createId());
    }
    if (this.wizardDraftAutosaveTimer) {
      clearTimeout(this.wizardDraftAutosaveTimer);
    }
    this.wizardDraftAutosaveTimer = setTimeout(() => {
      this.wizardDraftAutosaveTimer = null;
      void this.persistActiveWizardDraft().catch(() => undefined);
    }, delayMs);
  }

  private async flushWizardDraftAutosave(): Promise<boolean> {
    if (this.wizardDraftAutosaveTimer) {
      clearTimeout(this.wizardDraftAutosaveTimer);
      this.wizardDraftAutosaveTimer = null;
    }
    if (!this.wizardResult() || !this.wizardPreviewCards().length) {
      return true;
    }
    if (!this.wizardActiveDraftId()) {
      this.wizardActiveDraftId.set(this.createId());
    }
    try {
      await this.persistActiveWizardDraft();
      return this.wizardDraftSaveState() === 'saved';
    } catch {
      return false;
    }
  }

  private async persistActiveWizardDraft(): Promise<void> {
    const inFlight = this.wizardDraftSavePromise;
    if (inFlight) {
      this.wizardDraftSavePending = true;
      await inFlight;
      while (this.wizardDraftSavePromise) {
        await this.wizardDraftSavePromise;
      }
      return;
    }
    const uid = this.authService.uid();
    const result = this.wizardResult();
    const cards = this.wizardPreviewCards();
    const draftId = this.wizardActiveDraftId();
    if (!this.firestore || !uid || !result || !cards.length || !draftId) {
      return;
    }
    const attemptedSnapshotKey = this.wizardDraftSnapshotKey();

    this.wizardDraftSaveInFlight = true;
    let saveSucceeded = false;
    let completeSave: () => void = () => undefined;
    this.wizardDraftSavePromise = new Promise<void>((resolve) => {
      completeSave = resolve;
    });
    this.wizardDraftSaveState.set('saving');
    try {
      const existing = this.wizardDrafts().find((draft) => draft.id === draftId);
      const createdAt = existing?.createdAt || new Date().toISOString();
      const updatedAt = new Date().toISOString();
      const persistedCards = await Promise.all(cards.map(async (card) => ({
        ...await boardWizardDraftCardWithPersistedImages(
          card,
          cardPhotoLimit(card),
          (imageUrl, index) => this.persistImageIfNeeded(
            imageUrl,
            `users/${uid}/boards/${draftId}/cards/${card.id}/${index}.jpg`,
          ),
        ),
        editing: false,
      })));
      const draft: BoardWizardDraft = {
        id: draftId,
        ownerUserId: uid,
        mode: this.wizardMode(),
        entryIntent: this.wizardEntryIntent(),
        targetBoardId: this.wizardTargetBoardId(),
        lockedTargetBoardId: this.wizardLockedTargetBoardId() ?? '',
        contributionBoardId: this.wizardContributionBoardId() ?? '',
        defaultType: this.wizardDefaultType(),
        count: this.wizardCount(),
        countMode: this.wizardCountMode(),
        vibe: this.wizardVibe(),
        mediaMode: this.wizardMediaMode(),
        narrationStyle: this.wizardNarrationStyle(),
        narrationSecondsPerCard: this.wizardNarrationSecondsPerCard(),
        listingMarketingStyle: this.wizardListingMarketingStyle(),
        listingMarketingDirection: this.wizardListingMarketingDirection(),
        prompt: this.wizardPrompt(),
        pastedList: this.wizardPastedList(),
        sourceUrl: this.wizardUrl(),
        offGridName: this.wizardOffGridName(),
        offGridAddress: this.wizardOffGridAddress(),
        offGridTip: this.wizardOffGridTip(),
        stackCtaLabel: this.wizardStackCtaLabel(),
        stackCtaUrl: this.wizardStackCtaUrl(),
        tourVoiceStyle: this.wizardTourVoiceStyle(),
        tourPaceOrStyle: this.wizardTourPaceOrStyle(),
        tourExtras: [...this.wizardTourExtras()],
        result: { ...result, cards: persistedCards },
        selectedCardIds: [...this.wizardSelectedCardIds()],
        createdAt,
        updatedAt,
      };
      const persistedDraftPayload = boardWizardDraftPayloadWithPreferences({
        id: draft.id,
        owner_user_id: draft.ownerUserId,
        mode: draft.mode,
        target_board_id: draft.targetBoardId,
        locked_target_board_id: draft.lockedTargetBoardId,
        contribution_board_id: draft.contributionBoardId,
        default_type: draft.defaultType,
        count: draft.count,
        vibe: draft.vibe,
        narration_style: draft.narrationStyle,
        prompt: draft.prompt,
        pasted_list: draft.pastedList,
        source_url: draft.sourceUrl,
        off_grid_name: draft.offGridName,
        off_grid_address: draft.offGridAddress,
        off_grid_tip: draft.offGridTip,
        stack_cta_label: draft.stackCtaLabel,
        stack_cta_url: draft.stackCtaUrl,
        tour_voice_style: draft.tourVoiceStyle,
        tour_pace_or_style: draft.tourPaceOrStyle,
        tour_extras: draft.tourExtras,
        result: draft.result,
        selected_card_ids: draft.selectedCardIds,
        created_at_iso: draft.createdAt,
        updated_at_iso: draft.updatedAt,
        server_updated_at: serverTimestamp(),
      }, draft.mediaMode, {
        countMode: draft.countMode,
        narrationSecondsPerCard: draft.narrationSecondsPerCard,
        listingIntent: draft.entryIntent,
        listingMarketing: {
          style: draft.listingMarketingStyle,
          direction: draft.listingMarketingDirection,
        },
      });
      await setDoc(
        doc(this.firestore, 'users', uid, 'board_wizard_drafts', draftId),
        omitUndefinedDeep(persistedDraftPayload),
      );
      this.wizardDrafts.update((drafts) => [
        draft,
        ...drafts.filter((item) => item.id !== draft.id),
      ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
      this.wizardDraftSavedAt.set(updatedAt);
      this.wizardDraftSaveState.set('saved');
      this.wizardDraftFailedSnapshotKey.set('');
      saveSucceeded = true;
    } catch (error) {
      this.wizardDraftSaveState.set('error');
      this.wizardDraftFailedSnapshotKey.set(attemptedSnapshotKey);
      console.error('Wizard draft autosave failed', error, {
        draftId,
        mode: this.wizardMode(),
        cardCount: cards.length,
      });
      throw error;
    } finally {
      this.wizardDraftSaveInFlight = false;
      const shouldSaveAgain = this.wizardDraftSavePending;
      this.wizardDraftSavePending = false;
      completeSave();
      this.wizardDraftSavePromise = null;
      if (shouldSaveAgain && saveSucceeded) {
        await this.persistActiveWizardDraft();
      }
    }
  }

  private async loadWizardDrafts(uid: string): Promise<void> {
    if (!this.firestore) {
      return;
    }
    try {
      const snapshot = await getDocs(collection(this.firestore, 'users', uid, 'board_wizard_drafts'));
      if (this.authService.uid() !== uid) {
        return;
      }
      const drafts = snapshot.docs
        .map((draftDoc) => this.wizardDraftFromRecord(draftDoc.id, draftDoc.data()))
        .filter((draft): draft is BoardWizardDraft => !!draft)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      this.wizardDrafts.set(drafts);
    } catch (error) {
      console.error('Board wizard drafts load failed', error);
    }
  }

  private wizardDraftFromRecord(id: string, value: Record<string, unknown>): BoardWizardDraft | null {
    const ownerUserId = this.stringValue(value['owner_user_id'], '', 180);
    const rawResult = value['result'];
    if (!ownerUserId || ownerUserId !== this.authService.uid() || !rawResult || typeof rawResult !== 'object') {
      return null;
    }
    try {
      const result = this.normalizeWizardBatch(rawResult);
      const resultRecord = rawResult as Record<string, unknown>;
      const rawCards = Array.isArray(resultRecord['cards']) ? resultRecord['cards'] : [];
      const cards = result.cards.map((card, index): BoardWizardPreviewCard => {
        const rawCard = rawCards[index] && typeof rawCards[index] === 'object'
          ? rawCards[index] as Record<string, unknown>
          : {};
        return {
          ...card,
          id: this.stringValue(rawCard['id'], this.createId(), 180),
          imageUrl: card.imageUrl ?? '',
          imageUrls: this.uniqueImageUrls([card.imageUrl, ...(card.imageUrls ?? [])]).slice(0, cardPhotoLimit(card)),
          placeId: card.placeId ?? '',
          googleMapsUrl: card.googleMapsUrl ?? '',
          editing: false,
        };
      });
      const modeValue = value['mode'];
      const mode: BoardWizardMode = modeValue === 'paste' || modeValue === 'photos' || modeValue === 'off-grid' || modeValue === 'nearby-gems'
        || modeValue === 'url' || modeValue === 'walking-tour' || modeValue === 'driving-tour'
        ? modeValue
        : 'describe';
      const defaultType = this.isBoardCardType(value['default_type']) ? value['default_type'] : 'place';
      const vibeValue = value['vibe'];
      const vibe: BoardWizardVibe = vibeValue === 'foodie' || vibeValue === 'traveler' || vibeValue === 'curator' || vibeValue === 'memory'
        ? vibeValue
        : 'playful';
      const narrationStyle = normalizeBoardNarrationStyleId(value['narration_style']);
      const mediaMode = boardWizardDraftMediaMode(value);
      const countMode = boardWizardDraftCountMode(value);
      const narrationSecondsPerCard = boardWizardDraftNarrationSeconds(value);
      const listingMarketing = boardWizardDraftListingMarketing(value);
      const entryIntent = boardWizardDraftListingIntent(value);
      const tourVoiceValue = value['tour_voice_style'];
      const tourVoiceStyle: BoardTourVoiceStyle = tourVoiceValue === 'local' || tourVoiceValue === 'kid-friendly'
        ? tourVoiceValue
        : 'historian';
      return {
        id,
        ownerUserId,
        mode,
        entryIntent,
        targetBoardId: this.stringValue(value['target_board_id'], 'new', 180),
        lockedTargetBoardId: this.stringValue(value['locked_target_board_id'], '', 180),
        contributionBoardId: this.stringValue(value['contribution_board_id'], '', 180),
        defaultType,
        count: Math.round(this.numberValue(value['count'], cards.length, 1, 100)),
        countMode,
        vibe,
        mediaMode,
        narrationStyle,
        narrationSecondsPerCard,
        listingMarketingStyle: listingMarketing.style,
        listingMarketingDirection: listingMarketing.direction,
        prompt: this.stringValue(value['prompt'], '', 2000),
        pastedList: this.stringValue(value['pasted_list'], '', BOARD_WIZARD_PASTE_MAX_LENGTH),
        sourceUrl: this.stringValue(value['source_url'], '', 2000),
        offGridName: this.stringValue(value['off_grid_name'], '', 120),
        offGridAddress: this.stringValue(value['off_grid_address'], '', 20_000),
        offGridTip: this.stringValue(value['off_grid_tip'], '', 1000),
        stackCtaLabel: this.stringValue(value['stack_cta_label'], '', 120),
        stackCtaUrl: this.stringValue(value['stack_cta_url'], '', 2000),
        tourVoiceStyle,
        tourPaceOrStyle: this.stringValue(value['tour_pace_or_style'], 'Standard', 120),
        tourExtras: Array.isArray(value['tour_extras'])
          ? value['tour_extras'].map((item) => this.stringValue(item, '', 120)).filter(Boolean).slice(0, 20)
          : [],
        result: { ...result, cards },
        selectedCardIds: Array.isArray(value['selected_card_ids'])
          ? value['selected_card_ids'].map((item) => this.stringValue(item, '', 180)).filter(Boolean)
          : cards.map((card) => card.id),
        createdAt: this.stringValue(value['created_at_iso'], new Date().toISOString(), 80),
        updatedAt: this.stringValue(value['updated_at_iso'], new Date().toISOString(), 80),
      };
    } catch {
      return null;
    }
  }

  private resetBoardWizard(): void {
    this.wizardImageEnrichmentRun += 1;
    this.wizardVideoEnrichmentRun += 1;
    const selectedBoard = this.selectedBoard();
    const editableSelectedBoard = selectedBoard && this.canEditBoard(selectedBoard) ? selectedBoard : null;
    this.wizardStep.set('choose');
    this.wizardMode.set('describe');
    this.wizardEntryIntent.set('default');
    this.wizardDoorwayId.set('real-estate');
    this.wizardDoorwayPointerStartX = null;
    this.wizardDoorwaySuppressActivation = false;
    this.wizardTargetBoardId.set(editableSelectedBoard?.id ?? 'new');
    this.wizardLockedTargetBoardId.set(null);
    this.wizardContributionBoardId.set(null);
    this.wizardDefaultType.set('place');
    this.wizardCount.set(12);
    this.wizardCountMode.set('auto');
    this.wizardVibe.set('playful');
    this.wizardMediaMode.set(DEFAULT_BOARD_WIZARD_MEDIA_MODE);
    this.wizardNarrationStyle.set(DEFAULT_BOARD_NARRATION_STYLE_ID);
    this.wizardNarrationSecondsPerCard.set(DEFAULT_BOARD_NARRATION_SECONDS_PER_CARD);
    this.wizardNarrationLengthCustomized.set(false);
    this.wizardPrompt.set('');
    this.wizardPastedList.set('');
    this.wizardUrl.set('');
    this.wizardSourceManifest.set(null);
    this.wizardSourceReviewUrl.set('');
    this.wizardSourceReviewExact.set(false);
    this.wizardSourceReviewWarning.set('');
    this.wizardSourceConfirmedUrl.set('');
    this.wizardListingPreview.set(null);
    this.wizardListingMarketingStyle.set('warm');
    this.wizardListingMarketingDirection.set('');
    this.wizardPhotos.set([]);
    this.wizardPhotoImportRun += 1;
    this.wizardPhotosLoading.set(false);
    this.wizardPhotoError.set(null);
    this.wizardPhotoStoryMode.set(null);
    this.wizardPhotoStudioNotice.set('');
    this.wizardSaveDestination.set('board');
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
    this.nearbyGemRange.set('walk');
    this.nearbyGemLocation.set(null);
    this.nearbyGemManualLocation.set('');
    this.nearbyGemDetails.set('');
    this.nearbyGemUseManualLocation.set(false);
    this.nearbyGemLocating.set(false);
    this.nearbyGemLocationError.set(null);
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
    this.wizardImageProgress.set(null);
    this.wizardImageNotice.set(null);
    this.wizardVideoLoadingCardIds.set(new Set());
    this.wizardVideoNotice.set(null);
    this.wizardEditingCardId.set(null);
    this.resetWizardCardImageTools();
    this.wizardSaving.set(false);
    this.wizardActiveDraftId.set(null);
    this.wizardDraftSaveState.set('idle');
    this.wizardDraftSavedAt.set('');
    this.wizardDraftDiscardCandidateId.set(null);
    this.wizardDraftFailedSnapshotKey.set('');
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
    const drafts = buildBoardPhotoStoryDrafts(photos, batch.cards);
    return {
      ...batch,
      cards: drafts.map((draft, index) => ({
        ...this.blankPhotoStoryCard(draft, index),
        ...(batch.cards[index] ?? {}),
        title: draft.title,
        subtitle: draft.subtitle,
        notes: draft.notes,
        short_summary: draft.shortSummary,
        imageUrl: draft.imageUrl,
      })),
    };
  }

  private async prepareBlankPhotoStoryBatch(): Promise<void> {
    this.wizardStep.set('loading');
    this.wizardError.set(null);
    this.wizardLoadingTask.set({
      message: 'Creating editable photo cards and opening Studio',
      progress: 55,
    });
    const drafts = buildBoardPhotoStoryDrafts(this.wizardPhotos());
    const batch: BoardWizardGeneratedBatch = {
      board: {
        title: this.wizardTargetBoardId() === 'new'
          ? this.titleFromWizardInput(this.wizardPrompt().trim() || 'Photo memories')
          : this.wizardTargetBoardTitle(),
        description: this.wizardPrompt().trim() || 'A visual story created from your selected photos.',
        icon: 'photo_library',
        tone: 'purple',
        kind: 'standard',
        tourMeta: null,
      },
      cards: drafts.map((draft, index) => this.blankPhotoStoryCard(draft, index)),
    };
    const previewCards = await this.enrichWizardCards(batch.cards);
    this.wizardResult.set({ ...batch, cards: previewCards });
    this.wizardPreviewCards.set(previewCards);
    this.wizardSelectedCardIds.set(new Set(previewCards.map((card) => card.id)));
    this.wizardLoadingTask.set({ message: 'Saving your photo board', progress: 88 });
    this.wizardStep.set('preview');
  }

  private blankPhotoStoryCard(
    draft: ReturnType<typeof buildBoardPhotoStoryDrafts>[number],
    index: number,
  ): BoardWizardGeneratedCard {
    return {
      title: draft.title,
      subtitle: draft.subtitle,
      notes: draft.notes,
      short_summary: draft.shortSummary,
      type: 'memory',
      scope: 'place',
      status: 'saved',
      rating: 4,
      tags: ['memory'],
      image_query: '',
      place_query: '',
      entity_name: draft.title,
      entity_type: 'other',
      image_intent: 'other',
      image_context: '',
      rank: index + 1,
      imageUrl: draft.imageUrl,
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
      timeout: 290_000,
    });
    const response = await callable({
      mode: this.wizardMode(),
      prompt,
      pastedList: this.wizardMode() === 'paste' ? this.wizardPastedList().trim() : '',
      url: this.wizardDetectedSourceUrl(),
      sourceManifest: this.wizardSourceManifest(),
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
      countMode: this.wizardCountMode(),
      vibe: this.wizardVibe(),
      mediaMode: this.wizardMediaMode(),
      narrationStyle: this.wizardNarrationStyleForGeneration(),
      narrationSecondsPerCard: this.wizardNarrationSecondsForGeneration(),
      narrationLengthCustomized: this.wizardNarrationLengthCustomized(),
      listingMarketing: {
        enabled: true,
        style: this.wizardListingMarketingStyle(),
        direction: this.wizardListingMarketingDirection().trim(),
      },
      listingIntent: this.wizardListingIntentForApi(),
      deferMediaEnrichment: this.wizardShouldDeferMediaEnrichment(),
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

  private wizardShouldDeferMediaEnrichment(): boolean {
    const intent = this.wizardCountIntent();
    return intent.policy === 'complete-set' || (intent.count ?? this.wizardCount()) > 16;
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
        description: boardDescriptionForFirestore(
          this.stringValue(boardData['description'], fallback.board.description, 500),
        ),
        icon: resolveBoardIcon(this.stringValue(boardData['icon'], fallback.board.icon, 64), {
          title: this.stringValue(boardData['title'], fallback.board.title, 90),
          description: this.stringValue(boardData['description'], fallback.board.description, 500),
          kind: this.isBoardKind(boardData['kind']) ? boardData['kind'] : fallback.board.kind,
        }),
        tone: this.isBoardTone(boardData['tone']) ? boardData['tone'] : fallback.board.tone,
        kind: this.isBoardKind(boardData['kind']) ? boardData['kind'] : fallback.board.kind,
        tourMeta: this.normalizeTourMeta(boardData['tourMeta']) ?? fallback.board.tourMeta,
        nearbyGems: this.normalizeNearbyGemsMeta(boardData['nearbyGems']) ?? fallback.board.nearbyGems,
      },
      // The server owns explicit-count and complete-set cardinality decisions.
      // Do not truncate a verified complete set back to the UI's default count.
      cards: cards.slice(0, 100),
      sourceReport: this.normalizeWizardSourceReport(data['sourceReport']),
      generation: this.normalizeWizardGenerationSummary(data['generation'], cards.length),
    };
  }

  private normalizeWizardGenerationSummary(
    value: unknown,
    fallbackCount: number,
  ): BoardWizardGenerationSummary | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const data = value as Record<string, unknown>;
    const countPolicy: BoardWizardCountPolicy = data['countPolicy'] === 'source-exact'
      || data['countPolicy'] === 'prompt-exact'
      || data['countPolicy'] === 'complete-set'
      ? data['countPolicy']
      : 'target-count';
    const narrationSecondsPerCard = normalizeBoardNarrationSeconds(data['narrationSecondsPerCard']);
    return {
      countPolicy,
      targetCount: Math.round(this.numberValue(data['targetCount'], fallbackCount, 1, 100)),
      resolvedCount: Math.round(this.numberValue(data['resolvedCount'], fallbackCount, 1, 100)),
      completeSet: data['completeSet'] === true,
      message: this.stringValue(data['message'], '', 500),
      narrationSecondsPerCard,
      targetWordsPerCard: Math.round(this.numberValue(
        data['targetWordsPerCard'],
        boardNarrationTargetWords(narrationSecondsPerCard),
        1,
        600,
      )),
    };
  }

  private applyWizardMediaModeToGeneratedBatch(batch: BoardWizardGeneratedBatch): BoardWizardGeneratedBatch {
    const mode = this.wizardMediaMode();
    if (mode === 'mixed') return batch;
    return {
      ...batch,
      cards: batch.cards.map((card) => mode === 'videos'
        ? { ...card, video_intent: true }
        : {
            ...card,
            video_intent: false,
            video_search_query: '',
            youtubeVideoId: '',
            youtubeVideoTitle: '',
            youtubeChannelTitle: '',
            youtubeThumbnailUrl: '',
            youtubeDurationSeconds: 0,
            youtubeMatchConfidence: 0,
            youtubeVerifiedAt: '',
          }),
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
      extractedItemCount: Math.round(this.numberValue(data['extractedItemCount'], 0, 0, 100)),
      matchedCardCount: Math.round(this.numberValue(data['matchedCardCount'], 0, 0, 100)),
      sourceImageCount: Math.round(this.numberValue(data['sourceImageCount'], 0, 0, 100)),
      confidence: this.numberValue(data['confidence'], status === 'exact' ? 1 : 0.5, 0, 1),
      snapshotDate: this.stringValue(data['snapshotDate'], '', 40),
      message: this.stringValue(data['message'], '', 500),
    };
  }

  private normalizeWizardListingPreview(value: unknown, sourceUrl: string): BoardWizardListingPreview {
    const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    let fallbackName = 'Real-estate listing';
    try {
      const url = new URL(sourceUrl);
      const slug = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '');
      fallbackName = slug.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) || fallbackName;
    } catch {
      // Keep the neutral label when the source URL cannot be parsed here.
    }
    return {
      listingName: this.stringValue(data['listingName'], fallbackName, 140),
      address: this.stringValue(data['address'], '', 300),
      price: this.stringValue(data['price'], '', 80),
      status: this.stringValue(data['status'], '', 80),
      propertyType: this.stringValue(data['propertyType'], '', 100),
      bedrooms: this.stringValue(data['bedrooms'], '', 40),
      bathrooms: this.stringValue(data['bathrooms'], '', 40),
      mlsId: this.stringValue(data['mlsId'], '', 80),
      imageCount: Math.round(this.numberValue(data['imageCount'], 0, 0, 100)),
      contactName: this.stringValue(data['contactName'], '', 140),
      contactRole: this.stringValue(data['contactRole'], '', 80),
      brokerage: this.stringValue(data['brokerage'], '', 160),
      siteName: this.stringValue(data['siteName'], '', 120),
      confidence: this.numberValue(data['confidence'], 0, 0, 1),
    };
  }

  private normalizeWizardSourceManifest(value: unknown, requiredUrl: string): BoardWizardSourceManifest | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    const sourceUrl = this.stringValue(data['sourceUrl'], '', 2000);
    if (!sourceUrl || this.canonicalWizardSourceUrl(sourceUrl) !== this.canonicalWizardSourceUrl(requiredUrl)) return null;
    const items = Array.isArray(data['items'])
      ? data['items'].flatMap((item, index): BoardWizardSourceManifestItem[] => {
          if (!item || typeof item !== 'object') return [];
          const record = item as Record<string, unknown>;
          const title = this.stringValue(record['title'], '', 80);
          if (!title) return [];
          return [{
            id: this.stringValue(record['id'], `source-${index + 1}`, 80),
            title,
            excerpt: this.stringValue(record['excerpt'], '', 1200),
            imageUrl: this.stringValue(record['imageUrl'], '', 2000),
            sourceIndex: index + 1,
          }];
        }).slice(0, 100)
      : [];
    if (items.length < 2) return null;
    const expectedValue = data['expectedCount'];
    const expectedCount = typeof expectedValue === 'number' && Number.isFinite(expectedValue)
      ? Math.max(1, Math.min(100, Math.round(expectedValue)))
      : null;
    return {
      kind: 'article-list',
      sourceUrl,
      finalUrl: this.stringValue(data['finalUrl'], sourceUrl, 2000),
      pageTitle: this.stringValue(data['pageTitle'], '', 220),
      siteName: this.stringValue(data['siteName'], '', 120),
      expectedCount,
      confidence: this.numberValue(data['confidence'], 0.5, 0, 1),
      method: data['method'] === 'reader' ? 'reader' : 'page',
      sourceBlocked: data['sourceBlocked'] === true,
      items,
    };
  }

  private canonicalWizardSourceUrl(value: string): string {
    try {
      const url = new URL(value);
      url.hash = '';
      return url.toString().replace(/\/$/, '');
    } catch {
      return value.trim().replace(/\/$/, '');
    }
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
    const entityType: BoardEntityType = this.isBoardEntityType(data['entity_type'])
      ? data['entity_type']
      : (type === 'place' || type === 'shop' ? 'place' : type === 'food' ? 'food' : 'other');
    const imageIntent: BoardImageIntent = this.isBoardImageIntent(data['image_intent'])
      ? data['image_intent']
      : (type === 'place' || type === 'shop' ? 'place' : type === 'food' ? 'food' : 'other');
    return {
      title,
      subtitle,
      notes,
      type,
      scope: this.isBoardCardScope(data['scope']) ? data['scope'] : 'place',
      status: this.isBoardCardStatus(data['status']) ? data['status'] : 'saved',
      rating: this.numberValue(data['rating'], 4, 1, 5),
      tags,
      image_query: this.normalizeWizardImageQuery(title, imageQuery, subtitle, notes, tags, entityType, imageIntent),
      place_query: this.stringValue(data['place_query'], title, 140),
      entity_name: this.stringValue(data['entity_name'], title, 100),
      entity_type: entityType,
      image_intent: imageIntent,
      image_context: this.stringValue(data['image_context'], '', 120),
      media_kind: this.isBoardMediaKind(data['media_kind']) ? data['media_kind'] : 'none',
      short_summary: this.stringValue(data['short_summary'], subtitle, 160),
      rank: this.numberValue(data['rank'], 0, 0, 100),
      nearby: this.normalizeNearbyGemMetrics(data['nearby']),
      video_intent: data['video_intent'] === true,
      video_search_query: this.stringValue(data['video_search_query'], '', 180),
      youtubeVideoId: youtubeVideoIdFromReference(data['youtubeVideoId']),
      youtubeVideoTitle: this.stringValue(data['youtubeVideoTitle'], '', 300),
      youtubeChannelTitle: this.stringValue(data['youtubeChannelTitle'], '', 200),
      youtubeThumbnailUrl: this.stringValue(data['youtubeThumbnailUrl'], '', 2000),
      youtubeDurationSeconds: this.numberValue(data['youtubeDurationSeconds'], 0, 0, 86_400),
      youtubeMatchConfidence: this.numberValue(data['youtubeMatchConfidence'], 0, 0, 1),
      youtubeVerifiedAt: this.stringValue(data['youtubeVerifiedAt'], '', 80),
      imageUrl: this.stringValue(data['imageUrl'], '', 2000),
      imageUrls: Array.isArray(data['imageUrls'])
        ? this.uniqueImageUrls(data['imageUrls'].map((url) => this.stringValue(url, '', 2000))).slice(0, cardPhotoLimit({
            imageSource: data['imageSource'],
            sourceUrl,
            tags,
          }))
        : [],
      listingPresentation: normalizeListingCardPresentation(data['listingPresentation']),
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
      image_query: this.normalizeWizardImageQuery(
        card.title,
        card.image_query || `${card.title} image`,
        card.subtitle,
        card.notes,
        card.tags,
        card.entity_type,
        card.image_intent,
      ),
      place_query: card.place_query || card.title,
      entity_name: card.entity_name || card.title,
      entity_type: card.entity_type,
      image_intent: card.image_intent,
      image_context: card.image_context || '',
      media_kind: card.media_kind || 'none',
      short_summary: card.short_summary || card.subtitle,
      rank: card.rank || 0,
      imageUrl: card.imageUrl || '',
      imageUrls: this.uniqueImageUrls([card.imageUrl, ...(card.imageUrls ?? [])]).slice(0, cardPhotoLimit(card)),
      ...(card.listingPresentation ? { listingPresentation: card.listingPresentation } : {}),
      video_intent: card.video_intent === true,
      video_search_query: card.video_search_query || '',
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
      nearby: card.nearby,
    };
  }

  private async enrichWizardCards(
    cards: BoardWizardGeneratedCard[],
    onProgress?: (completed: number, total: number) => void,
    enrichPlaces = true,
  ): Promise<BoardWizardPreviewCard[]> {
    const preview: BoardWizardPreviewCard[] = [];
    const candidates = cards.slice(0, 100);
    for (const card of candidates) {
      let enriched: BoardWizardPreviewCard = {
        ...card,
        id: this.createId(),
        what3wordsAddress: what3WordsAddressFromCard(card),
        imageUrl: card.imageUrl ?? '',
        imageUrls: this.uniqueImageUrls([card.imageUrl, ...(card.imageUrls ?? [])]).slice(0, cardPhotoLimit(card)),
        audioPreviewUrl: card.audioPreviewUrl ?? '',
        spotifyTrackId: card.spotifyTrackId ?? '',
        spotifyTrackUrl: card.spotifyTrackUrl ?? '',
        spotifyUri: card.spotifyUri ?? '',
        spotifyArtistName: card.spotifyArtistName ?? '',
        spotifyAlbumName: card.spotifyAlbumName ?? '',
        spotifyArtworkUrl: card.spotifyArtworkUrl ?? '',
        youtubeVideoId: card.youtubeVideoId ?? '',
        youtubeVideoTitle: card.youtubeVideoTitle ?? '',
        youtubeChannelTitle: card.youtubeChannelTitle ?? '',
        youtubeThumbnailUrl: card.youtubeThumbnailUrl ?? '',
        youtubeDurationSeconds: card.youtubeDurationSeconds ?? 0,
        youtubeMatchConfidence: card.youtubeMatchConfidence ?? 0,
        youtubeVerifiedAt: card.youtubeVerifiedAt ?? '',
        placeId: card.placeId ?? '',
        googleMapsUrl: card.googleMapsUrl ?? '',
        editing: false,
      };

      if (enrichPlaces && this.shouldEnrichWizardCard(card) && !enriched.imageUrl) {
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

  private wizardCardWantsVideo(card: BoardWizardGeneratedCard): boolean {
    if (card.video_intent === true) return true;
    const text = [
      this.wizardPrompt(),
      card.title,
      card.subtitle,
      card.notes,
      card.entity_name,
      card.image_context,
      ...card.tags,
    ].filter(Boolean).join(' ');
    return /\b(?:you\s*tube(?:\s+(?:link|video))?|best\s+song|signature\s+song|half[\s-]?time\s+show|live\s+performance|performance|concert|music\s+video|trailer|highlights?|speech|keynote|interview|tutorial|demonstration|awards?\s+show|opening\s+ceremony|closing\s+ceremony)\b/i.test(text);
  }

  private async enrichWizardVideos(
    cards: BoardWizardPreviewCard[],
    batch: BoardWizardGeneratedBatch,
    options: { youtubeReferences?: Record<string, string>; forceCardIds?: Set<string> } = {},
  ): Promise<void> {
    if (!this.functions) return;
    const forcedCards = options.forceCardIds
      ? cards.filter((card) => options.forceCardIds?.has(card.id))
      : [];
    const mediaMode = forcedCards.length ? 'videos' : this.wizardMediaMode();
    const candidates = forcedCards.length
      ? forcedCards
      : orderBoardWizardVideoCandidates(cards, mediaMode, (card) => this.wizardCardWantsVideo(card));
    const targetCount = forcedCards.length
      ? forcedCards.length
      : boardWizardVideoTargetCount(mediaMode, cards.length);
    if (!candidates.length || !targetCount) {
      this.wizardVideoNotice.set(null);
      this.wizardVideoLoadingCardIds.set(new Set());
      return;
    }
    const run = ++this.wizardVideoEnrichmentRun;
    this.wizardVideoLoadingCardIds.set(new Set(candidates.map((card) => card.id)));
    let matchedCount = 0;
    let attemptedCount = 0;
    let usedBackupSearch = false;
    let deadlineLimited = false;
    let lookupFailed = false;
    const batches = boardWizardVideoCandidateBatches(candidates);
    this.wizardVideoNotice.set(targetCount === 1
      ? $localize`Finding a verified video…`
      : `Finding up to ${targetCount} verified videos…`);
    try {
      const callable = httpsCallable<Record<string, unknown>, unknown>(this.functions, 'resolveBoardCardVideos', {
        timeout: 55_000,
      });
      for (const candidateBatch of batches) {
        if (run !== this.wizardVideoEnrichmentRun) return;
        if (matchedCount >= targetCount) break;
        this.wizardVideoNotice.set(
          `Verified ${matchedCount} of ${targetCount} videos · checking ${attemptedCount + 1}–${Math.min(attemptedCount + candidateBatch.length, candidates.length)} of ${candidates.length}`,
        );
        let response: Awaited<ReturnType<typeof callable>>;
        try {
          response = await callable({
            boardTitle: batch.board.title,
            boardDescription: batch.board.description,
            prompt: this.wizardPrompt().trim(),
            mediaMode,
            cards: candidateBatch.map((card) => ({
              cardId: card.id,
              title: card.title,
              subtitle: card.subtitle,
              notes: card.notes,
              entityName: card.entity_name || card.title,
              entityType: card.entity_type || '',
              imageContext: card.image_context || '',
              tags: card.tags,
              videoIntent: true,
              videoSearchQuery: card.video_search_query || '',
              youtubeReference: options.youtubeReferences?.[card.id] || '',
            })),
          });
        } catch (error) {
          console.error('Board wizard video enrichment batch failed.', error);
          lookupFailed = true;
          break;
        }
        if (run !== this.wizardVideoEnrichmentRun) return;
        attemptedCount += candidateBatch.length;
        const data = response.data && typeof response.data === 'object'
          ? response.data as Record<string, unknown>
          : {};
        usedBackupSearch ||= data['degraded'] === true;
        deadlineLimited ||= data['partial'] === true;
        const matches = Array.isArray(data['matches']) ? data['matches'] : [];
        const rawMatches = new Map<string, Record<string, unknown>>();
        for (const value of matches) {
          if (!value || typeof value !== 'object') continue;
          const match = value as Record<string, unknown>;
          const cardId = this.stringValue(match['cardId'], '', 160);
          if (cardId) rawMatches.set(cardId, match);
        }
        const accepted = new Map<string, Partial<BoardWizardPreviewCard>>();
        for (const card of candidateBatch) {
          if (matchedCount + accepted.size >= targetCount) break;
          const match = rawMatches.get(card.id);
          const videoId = youtubeVideoIdFromReference(match?.['youtubeVideoId']);
          if (!match || !videoId) continue;
          accepted.set(card.id, {
            video_intent: true,
            youtubeVideoId: videoId,
            youtubeVideoTitle: this.stringValue(match['youtubeVideoTitle'], '', 300),
            youtubeChannelTitle: this.stringValue(match['youtubeChannelTitle'], '', 200),
            youtubeThumbnailUrl: this.stringValue(match['youtubeThumbnailUrl'], '', 2000),
            youtubeDurationSeconds: this.numberValue(match['youtubeDurationSeconds'], 0, 0, 86_400),
            youtubeMatchConfidence: this.numberValue(match['youtubeMatchConfidence'], 0, 0, 1),
            youtubeVerifiedAt: this.stringValue(match['youtubeVerifiedAt'], new Date().toISOString(), 80),
          });
        }
        matchedCount += accepted.size;
        if (accepted.size) {
          this.wizardPreviewCards.update((current) => current.map((card) => {
            const match = accepted.get(card.id);
            return match ? { ...card, ...match } : card;
          }));
          const currentResult = this.wizardResult();
          if (currentResult) this.wizardResult.set({ ...currentResult, cards: this.wizardPreviewCards() });
        }
        const attemptedIds = new Set(candidateBatch.map((card) => card.id));
        this.wizardVideoLoadingCardIds.update((current) => new Set(
          [...current].filter((cardId) => !attemptedIds.has(cardId)),
        ));
      }
      if (run !== this.wizardVideoEnrichmentRun) return;
      if (matchedCount) {
        const qualifier = usedBackupSearch
          ? ' Some matches used backup search.'
          : deadlineLimited
            ? ' Some searches reached the lookup deadline.'
            : '';
        const fallback = matchedCount < targetCount
          ? ` ${targetCount - matchedCount} card${targetCount - matchedCount === 1 ? '' : 's'} kept their images.`
          : '';
        this.wizardVideoNotice.set(
          `${matchedCount} verified video${matchedCount === 1 ? '' : 's'} ready.${fallback}${qualifier}`,
        );
      } else if (lookupFailed) {
        this.wizardVideoNotice.set($localize`Video lookup is unavailable right now. Your image cards are unchanged.`);
      } else {
        this.wizardVideoNotice.set($localize`No confident embeddable videos were found. Your image cards are unchanged.`);
      }
    } finally {
      if (run === this.wizardVideoEnrichmentRun) {
        this.wizardVideoLoadingCardIds.set(new Set());
      }
    }
  }

  cancelWizardVideoEnrichment(): void {
    if (!this.wizardVideoLoadingCardIds().size) return;
    this.wizardVideoEnrichmentRun += 1;
    this.wizardVideoLoadingCardIds.set(new Set());
    this.wizardVideoNotice.set($localize`Video search stopped. The remaining cards kept their images.`);
  }

  async refreshWizardCardVideo(cardId: string, reference = ''): Promise<void> {
    const card = this.wizardPreviewCards().find((candidate) => candidate.id === cardId);
    const result = this.wizardResult();
    if (!card || !result) return;
    await this.enrichWizardVideos([card], result, {
      forceCardIds: new Set([cardId]),
      youtubeReferences: reference ? { [cardId]: reference } : undefined,
    });
  }

  removeWizardCardVideo(cardId: string): void {
    this.wizardPreviewCards.update((cards) => cards.map((card) => card.id === cardId ? {
      ...card,
      video_intent: false,
      video_search_query: '',
      youtubeVideoId: '',
      youtubeVideoTitle: '',
      youtubeChannelTitle: '',
      youtubeThumbnailUrl: '',
      youtubeDurationSeconds: 0,
      youtubeMatchConfidence: 0,
      youtubeVerifiedAt: '',
    } : card));
    const currentResult = this.wizardResult();
    if (currentResult) this.wizardResult.set({ ...currentResult, cards: this.wizardPreviewCards() });
  }

  private async requestWizardCardImage(
    card: BoardWizardPreviewCard,
    targetBoardTitle: string,
    promptContext = '',
    allowGeneratedFallback = false,
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
    const exactSubjectInstruction = card.entity_type === 'fictional_character' || card.image_intent === 'character'
      ? `Find the most accurate recognizable in-character depiction of this exact fictional character: ${card.entity_name || card.title}. Preserve aliases, civilian identity, franchise/universe, source work, medium, and portraying actor from the context.`
      : card.entity_type === 'place' || card.image_intent === 'place'
        ? `Find the most accurate real photograph for this exact place only: ${card.entity_name || card.title}.`
        : card.entity_type === 'person' || card.image_intent === 'portrait'
          ? `Find the most accurate real portrait of this exact person only: ${card.entity_name || card.title}.`
          : `Find the most accurate authoritative image for this exact subject only: ${card.entity_name || card.title}.`;
    const rejectionInstruction = card.entity_type === 'fictional_character' || card.image_intent === 'character'
      ? 'Do not use astronomy, statues, monuments, toys, cosplay, logos, generic symbols, unrelated namesakes, or the actor out of character.'
      : 'Do not use a map, icon, logo, generic object, or a similarly named subject.';
    const response = await callable({
      mode: this.wizardMode(),
      prompt: [
        this.wizardPrompt().trim(),
        exactSubjectInstruction,
        locationContext ? `Subject context: ${locationContext}.` : '',
        card.entity_type === 'place' || card.image_intent === 'place'
          ? 'Prefer an exact Google Place or authoritative reference photo.'
          : 'Prefer an authoritative exact-entity reference image with strong contextual agreement.',
        rejectionInstruction,
        'Preserve the title, text, what3words address, and all metadata.',
      ].filter(Boolean).join('\n'),
      pastedList: '',
      url: '',
      photoNames: [],
      imageOnly: true,
      allowGeneratedImageFallback: allowGeneratedFallback,
      currentCard: this.wizardCardToCurrentCard(card),
      targetBoardId: this.wizardTargetBoardId() === 'new' ? '' : this.wizardTargetBoardId(),
      targetBoardTitle,
      defaultType: card.type,
      count: 1,
      countMode: 'fixed',
      vibe: this.wizardVibe(),
      narrationStyle: this.wizardNarrationStyleForGeneration(),
      narrationSecondsPerCard: this.wizardNarrationSecondsPerCard(),
    });
    return this.normalizeWizardBatch(response.data).cards[0] ?? null;
  }

  private shouldEnrichWizardCard(card: BoardWizardGeneratedCard): boolean {
    if (card.tags.some((tag) => tag.toLowerCase() === 'listing')) {
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
      return ['person', 'fictional_character', 'event', 'work', 'product', 'organization'].includes(card.entity_type);
    }
    const text = `${card.title} ${card.subtitle} ${card.notes} ${card.tags.join(' ')} ${card.image_query}`.toLowerCase();
    return /\b(portrait|person|people|biography|born|died|president|first lady|signer|founding father|politician|leader|governor|senator|representative|justice|inventor|author|artist|scientist|athlete|actor|musician|composer|singer|rapper|pianist|guitarist|drummer|bassist|saxophonist|trumpeter|vocalist|bandleader|poet|philosopher|general|monarch|king|queen|emperor|saint|historical figure|world cup|fifa|national team|football team|soccer team|winner|winners|champion|champions|tournament|award|awards|record|records)\b/.test(text);
  }

  private normalizeWizardImageQuery(
    title: string,
    imageQuery: string,
    subtitle: string,
    notes: string,
    tags: string[],
    entityType?: BoardEntityType,
    imageIntent?: BoardImageIntent,
  ): string {
    if (entityType === 'fictional_character' || imageIntent === 'character') {
      return imageQuery.slice(0, 120);
    }
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

  private async enrichWizardImagesAfterPreview(
    cards: BoardWizardPreviewCard[],
    boardTitle: string,
  ): Promise<void> {
    if (!this.functions) return;
    const candidates = cards.filter((card) => !card.imageUrl);
    if (!candidates.length) {
      this.wizardImageProgress.set(null);
      this.wizardImageNotice.set(null);
      return;
    }
    const run = ++this.wizardImageEnrichmentRun;
    let nextIndex = 0;
    let completed = 0;
    let matched = 0;
    this.wizardImageProgress.set({ completed: 0, total: candidates.length });
    this.wizardImageNotice.set(`Finding or creating images · 0 of ${candidates.length} checked`);

    const recordCompletion = () => {
      completed += 1;
      if (run === this.wizardImageEnrichmentRun) {
        this.wizardImageProgress.set({ completed, total: candidates.length });
        this.wizardImageNotice.set(`Finding or creating images · ${completed} of ${candidates.length} checked · ${matched} added`);
      }
    };

    const worker = async () => {
      while (nextIndex < candidates.length && run === this.wizardImageEnrichmentRun) {
        const candidate = candidates[nextIndex++];
        const card = this.wizardPreviewCards().find((item) => item.id === candidate.id);
        if (!card || card.imageUrl) {
          recordCompletion();
          continue;
        }
        this.wizardImageLoadingCardIds.update((ids) => new Set(ids).add(card.id));
        try {
          const replacement = await this.requestWizardCardImage(
            card,
            boardTitle,
            card.image_context || card.subtitle,
            true,
          );
          if (run !== this.wizardImageEnrichmentRun) return;
          if (replacement?.imageUrl) {
            let applied = false;
            this.wizardPreviewCards.update((current) => current.map((item) => {
              if (item.id !== card.id || item.imageUrl) return item;
              applied = true;
              return {
                ...item,
                imageUrl: replacement.imageUrl || item.imageUrl,
                imageSource: replacement.imageSource || (item.productUrl ? 'search' : item.imageSource),
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
                locationLat: replacement.locationLat ?? item.locationLat,
                locationLng: replacement.locationLng ?? item.locationLng,
              };
            }));
            if (applied) {
              matched += 1;
              const currentResult = this.wizardResult();
              if (currentResult) this.wizardResult.set({ ...currentResult, cards: this.wizardPreviewCards() });
            }
          }
        } catch {
          // Progressive image lookup is best-effort. Text cards remain ready to edit and save.
        } finally {
          this.wizardImageLoadingCardIds.update((ids) => {
            const next = new Set(ids);
            next.delete(card.id);
            return next;
          });
          recordCompletion();
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, () => worker()));
    if (run !== this.wizardImageEnrichmentRun) return;
    this.wizardImageLoadingCardIds.set(new Set());
    const remaining = this.wizardMissingImageCount();
    this.wizardImageNotice.set(
      matched
        ? `${matched} image${matched === 1 ? '' : 's'} added. ${remaining ? `${remaining} card${remaining === 1 ? '' : 's'} still need a custom image.` : 'Every card now has an image.'}`
        : remaining
          ? 'The cards are ready. No additional images could be created, so you can add custom images where needed.'
          : 'Every card now has an image.',
    );
  }

  cancelWizardImageEnrichment(): void {
    if (!this.wizardImageEnrichmentActive()) return;
    this.wizardImageEnrichmentRun += 1;
    this.wizardImageLoadingCardIds.set(new Set());
    this.wizardImageProgress.set(null);
    this.wizardImageNotice.set('Image preparation stopped. You can continue with the images already added, or add custom images before publishing.');
  }

  wizardImageProgressLabel(): string {
    return boardWizardImageProgressLabel(
      this.wizardImageProgress(),
      this.wizardImageLoadingCardIds().size,
    );
  }

  private showWizardImageWaitNotice(): void {
    this.wizardImageNotice.set(
      'Images are still being prepared. You can keep editing while this finishes, or choose Stop to continue with the images already added.',
    );
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

  private normalizeNearbyGemMetrics(value: unknown): NearbyGemCardMetrics | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const data = value as Record<string, unknown>;
    const durationSeconds = this.numberValue(data['durationSeconds'], Number.NaN, 0, 86_400);
    const distanceMeters = this.numberValue(data['distanceMeters'], Number.NaN, 0, 2_000_000);
    if (!Number.isFinite(durationSeconds) && !Number.isFinite(distanceMeters)) return undefined;
    return {
      durationSeconds: Number.isFinite(durationSeconds) ? Math.round(durationSeconds) : 0,
      distanceMeters: Number.isFinite(distanceMeters) ? Math.round(distanceMeters) : 0,
      measurement: data['measurement'] === 'route' ? 'route' : 'estimated',
      category: this.stringValue(data['category'], 'Local discovery', 80),
    };
  }

  private normalizeNearbyGemsMeta(value: unknown): NearbyGemsBoardMeta | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    const range = data['range'];
    const generationGrantId = this.stringValue(data['generationGrantId'], '', 180);
    if ((range !== 'walk' && range !== 'quick-drive' && range !== 'adventure') || !generationGrantId) return null;
    return {
      locationLabel: this.stringValue(data['locationLabel'], 'your area', 120),
      range,
      travelMode: data['travelMode'] === 'walking' ? 'walking' : 'driving',
      defaultSort: data['defaultSort'] === 'distance' ? 'distance' : 'travel-time',
      generatedAt: this.stringValue(data['generatedAt'], new Date().toISOString(), 80),
      originStored: false,
      generationGrantId,
    };
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
                navScript: `Next stop: ${next}. We will continue the story of ${title} there. You should reach it in about ${durationText} ${mode === 'driving' ? 'by car' : 'on foot'}, around ${distanceText}. I'll meet you there.`,
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

    // Public profile routes should never parse another account's potentially large
    // local shelf before the first remote page can render.
    if (this.route.snapshot.paramMap.has('ownerKey')) {
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

  private async loadBoardCollections(ownerKey: string): Promise<void> {
    const normalizedOwnerKey = ownerKey.trim();
    const loadSequence = ++this.collectionLoadSequence;
    if (!normalizedOwnerKey) {
      this.boardCollections.set([]);
      this.boardCollectionsLoading.set(false);
      return;
    }
    this.boardCollectionsLoading.set(true);
    this.boardCollectionsError.set(null);
    try {
      const collections = await this.boardCollectionsService.listPublicForOwner(normalizedOwnerKey);
      if (loadSequence === this.collectionLoadSequence) {
        this.boardCollections.set(collections);
      }
    } catch {
      if (loadSequence === this.collectionLoadSequence) {
        this.boardCollections.set([]);
        this.boardCollectionsError.set('Collections could not be loaded. Refresh and try again.');
      }
    } finally {
      if (loadSequence === this.collectionLoadSequence) {
        this.boardCollectionsLoading.set(false);
      }
    }
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

    const loadSequence = ++this.boardLoadSequence;
    this.boardsLoading.set(true);
    this.boardsLoadingMore.set(false);
    this.boardsHasMore.set(false);
    this.boardsSyncError.set(null);
    this.privateBoardBlocked.set(false);
    this.boardPageCursor = null;
    this.boardLoadContext = null;
    const storedBoards = this.boards();
    const storedRouteBoard = boardId
      ? storedBoards.find((board) => customPublicUrlRouteMatches(
        boardId,
        board.id,
        board.customSlug ?? '',
      )) ?? null
      : null;
    const requestedBoardRouteKey = boardId ?? '';
    const startPriorityRouteLookup = (lookupKey: string): Promise<{ board: Board | null; error: unknown | null }> =>
      this.loadBoardById(lookupKey)
        .then((board) => {
          if (board) {
            this.retainPriorityRouteBoard(
              board,
              requestedBoardRouteKey,
              storedRouteBoard?.id ?? null,
              loadSequence,
            );
          }
          return { board, error: null };
        })
        .catch((error: unknown) => ({ board: null, error }));
    // Public gallery summaries are already authorized for display, so their full
    // record can begin loading immediately instead of waiting for auth hydration.
    let priorityRouteLookup = boardId && storedRouteBoard?.isSummary
      ? startPriorityRouteLookup(storedRouteBoard.id)
      : null;
    // Public owner shelves do not require identity. Start their compact public
    // query immediately and let authentication hydrate owner-only actions later.
    if (!publicOwnerRouteActive) {
      await this.authService.waitForReady();
    }
    if (loadSequence !== this.boardLoadSequence) {
      return;
    }
    const uid = this.authService.uid();
    this.boardLoadContext = { uid, publicOwnerUid, publicOwnerSlug, publicOwnerRouteActive };
    this.boardsHasMore.set(true);
    const priorityRouteLookupKey = boardId && (!storedRouteBoard || storedRouteBoard.isSummary)
      ? storedRouteBoard?.id ?? boardId
      : null;
    if (!priorityRouteLookup && priorityRouteLookupKey) {
      priorityRouteLookup = startPriorityRouteLookup(priorityRouteLookupKey);
    }

    try {
      await this.loadNextBoardPage(loadSequence, true);
      if (loadSequence !== this.boardLoadSequence) return;

      let loaded = this.boards();

      // Older public boards may predate the normalized owner slug. Keep the
      // compatibility lookup off the hot path and only use it when page one is empty.
      if (!loaded.length && publicOwnerRouteActive && publicOwnerSlug) {
        loaded = await this.loadPublicBoardsForOwnerSlug(publicOwnerSlug);
        if (loadSequence !== this.boardLoadSequence) return;
        this.boards.set(loaded);
        this.boardsHasMore.set(false);
      }

      let routedBoard = boardId
        ? loaded.find((board) => customPublicUrlRouteMatches(
          boardId,
          board.id,
          board.customSlug ?? '',
        )) ?? null
        : null;

      if (boardId && !routedBoard) {
        try {
          const priorityResult = priorityRouteLookup ? await priorityRouteLookup : null;
          if (priorityResult?.error) throw priorityResult.error;
          const sharedBoard = priorityResult?.board ?? await this.loadBoardById(boardId);
          if (sharedBoard) {
            const currentBoards = this.boards();
            const existingIndex = currentBoards.findIndex((candidate) => candidate.id === sharedBoard.id);
            const mergedBoards = existingIndex >= 0
              ? currentBoards.map((candidate, index) => index === existingIndex ? sharedBoard : candidate)
              : [sharedBoard, ...currentBoards];
            this.boards.set(mergedBoards);
            loaded = mergedBoards;
            routedBoard = sharedBoard;
          }
        } catch (error) {
          if (this.isPermissionDeniedError(error)) {
            this.privateBoardBlocked.set(true);
          } else {
            throw error;
          }
        }
      }

      if (boardId) {
        if (routedBoard) {
          if (this.selectedBoardId() !== routedBoard.id) {
            this.selectedBoardId.set(routedBoard.id);
          }
          this.boardAnalytics.startBoardSession({
            boardId: routedBoard.id,
            boardTitle: routedBoard.title,
            customSlug: routedBoard.customSlug || '',
            visibility: routedBoard.visibility,
            ownerUserId: routedBoard.ownerUserId,
            currentUserId: uid || '',
            requestedRouteKey: boardId,
          });
          this.canonicalizeBoardPublicUrl(routedBoard, boardId);
        }
      }

      if (!loaded.length && !publicOwnerRouteActive && uid && this.loadedStoredLocalBoards) {
        await Promise.all(storedBoards.map((board) => this.persistBoard(board)));
        const migrated = await this.loadUserBoards(uid);
        if (migrated.length) {
          this.boards.set(migrated);
          this.boardsHasMore.set(false);
        }
      }
    } catch {
      this.boardsSyncError.set($localize`Boards are using this browser for now. Firebase sync is unavailable.`);
      this.boardsHasMore.set(false);
    } finally {
      if (loadSequence === this.boardLoadSequence) {
        this.boardsLoading.set(false);
        this.scheduleGalleryViewportCheck();
      }
    }
  }

  private retainPriorityRouteBoard(
    board: Board,
    requestedRouteKey: string,
    storedRouteBoardId: string | null,
    loadSequence: number,
  ): void {
    if (loadSequence !== this.boardLoadSequence) return;
    this.boards.update((boards) => {
      const existing = boards.find((candidate) => candidate.id === board.id) ?? null;
      if (existing && !existing.isSummary && existing.updatedAt >= board.updatedAt) {
        return boards;
      }
      const next = existing
        ? boards.map((candidate) => candidate.id === board.id ? board : candidate)
        : [board, ...boards];
      return next.sort((left, right) => this.compareGalleryBoards(left, right));
    });
    const selectedId = this.selectedBoardId();
    if (selectedId === requestedRouteKey || selectedId === storedRouteBoardId) {
      this.selectedBoardId.set(board.id);
    }
  }

  private async loadNextBoardPage(
    loadSequence = this.boardLoadSequence,
    replace = false,
  ): Promise<boolean> {
    const context = this.boardLoadContext;
    if (
      !this.firestore
      || !context
      || loadSequence !== this.boardLoadSequence
      || !this.boardsHasMore()
      || this.boardsLoadingMore()
    ) {
      return false;
    }

    const usePublicSummaries = !this.selectedBoardId()
      && (context.publicOwnerRouteActive || !context.uid);
    const buildConstraints = (summaryQuery: boolean): QueryConstraint[] => {
      const constraints: QueryConstraint[] = [];
      if (context.publicOwnerRouteActive || context.publicOwnerUid) {
        if (context.publicOwnerUid) {
          constraints.push(where('owner_user_id', '==', context.publicOwnerUid));
        } else if (context.publicOwnerSlug) {
          constraints.push(where('owner_public_slug', '==', context.publicOwnerSlug));
        } else {
          return [];
        }
        constraints.push(where('visibility', '==', 'public'));
      } else if (context.uid) {
        constraints.push(where('owner_user_id', '==', context.uid));
      } else {
        constraints.push(where('visibility', '==', 'public'));
      }
      if (summaryQuery) constraints.push(where('is_root', '==', true));
      if (context.publicOwnerRouteActive || summaryQuery) {
        constraints.push(orderBy('created_at_iso', 'desc'));
      }
      if (this.boardPageCursor) constraints.push(startAfter(this.boardPageCursor));
      constraints.push(limit(BOARD_GALLERY_PAGE_SIZE));
      return constraints;
    };
    const primaryConstraints = buildConstraints(usePublicSummaries);
    if (!primaryConstraints.length) {
      this.boardsHasMore.set(false);
      return false;
    }

    this.boardsLoadingMore.set(true);
    try {
      let summaryPage = usePublicSummaries;
      let snapshot: QuerySnapshot<DocumentData>;
      try {
        snapshot = await getDocs(query(
          collection(this.firestore, summaryPage ? 'public_board_summaries' : 'boards'),
          ...primaryConstraints,
        ));
      } catch (error) {
        if (!summaryPage || this.boardPageCursor) throw error;
        summaryPage = false;
        snapshot = await getDocs(query(collection(this.firestore, 'boards'), ...buildConstraints(false)));
      }
      // Until the server-owned projection has been backfilled, an empty summary
      // collection automatically falls back to the established full-board query.
      if (summaryPage && snapshot.empty && replace && !this.boardPageCursor) {
        summaryPage = false;
        snapshot = await getDocs(query(collection(this.firestore, 'boards'), ...buildConstraints(false)));
      }
      if (loadSequence !== this.boardLoadSequence) {
        return false;
      }
      const page = snapshot.docs
        .map((boardDoc) => summaryPage
          ? this.boardSummaryFromRecord(boardDoc.id, boardDoc.data())
          : this.boardFromRecord(boardDoc.id, boardDoc.data()))
        .filter((board): board is Board => !!board);
      // A route change can refresh the gallery before a board that lives beyond
      // page one is fetched by id. Retain that board so the detail view never
      // collapses back into the gallery during the refresh.
      const selectedId = this.selectedBoardId();
      const selectedBoard = replace && selectedId
        ? this.boards().find((board) => board.id === selectedId && !board.isSummary) ?? null
        : null;
      const current = replace ? (selectedBoard ? [selectedBoard] : []) : this.boards();
      const boardsById = new Map(current.map((board) => [board.id, board]));
      page.forEach((board) => boardsById.set(board.id, board));
      this.boards.set([...boardsById.values()].sort((left, right) => this.compareGalleryBoards(left, right)));
      this.boardPageCursor = snapshot.docs.at(-1) ?? this.boardPageCursor;
      this.boardsHasMore.set(snapshot.docs.length === BOARD_GALLERY_PAGE_SIZE);
      return snapshot.docs.length > 0;
    } finally {
      if (loadSequence === this.boardLoadSequence) {
        this.boardsLoadingMore.set(false);
      }
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
        this.boards.update((boards) => {
          const current = boards.find((item) => item.id === board.id) ?? null;
          if (current && current.updatedAt > board.updatedAt) {
            return boards;
          }
          return current
            ? boards.map((item) => item.id === board.id ? board : item)
            : [board, ...boards];
        });
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
    const slug = normalizeCustomPublicUrlSlug(boardId);
    if (slug && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(boardId)) {
      const routeSnapshot = await getDoc(doc(this.firestore, 'public_board_routes', slug));
      const targetId = routeSnapshot.exists() && typeof routeSnapshot.data()['target_id'] === 'string'
        ? routeSnapshot.data()['target_id'].trim()
        : '';
      if (targetId) {
        const targetSnapshot = await getDoc(doc(this.firestore, 'boards', targetId));
        if (!targetSnapshot.exists()) return null;
        return this.boardFromRecord(targetSnapshot.id, targetSnapshot.data());
      }
    }
    const snapshot = await getDoc(doc(this.firestore, 'boards', boardId));
    return snapshot.exists() ? this.boardFromRecord(snapshot.id, snapshot.data()) : null;
  }

  private canonicalizeBoardPublicUrl(board: Board, requestedRouteKey: string): void {
    if (!this.isBrowser || board.visibility !== 'public' || !board.customSlug) return;
    const requestedSlug = normalizeCustomPublicUrlSlug(requestedRouteKey);
    const alreadyCanonical = !this.songsPage()
      && !this.tripsPage()
      && requestedSlug === board.customSlug;
    if (alreadyCanonical) return;
    void this.router.navigate(['/boards', board.customSlug], {
      replaceUrl: true,
      queryParamsHandling: 'preserve',
      preserveFragment: true,
    });
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

  private ensureCitiesLoaded(): Promise<void> {
    if (this.publicCities().length) return Promise.resolve();
    this.citiesLoadPromise ??= this.loadCities().finally(() => {
      this.citiesLoadPromise = null;
    });
    return this.citiesLoadPromise;
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
          visibility: (board as Partial<Board>).photoStudioDraft === true
            ? 'private'
            : this.isBoardVisibility((board as Partial<Board>).visibility) ? (board as Board).visibility : 'public',
          photoStoryBoard: (board as Partial<Board>).photoStoryBoard === true,
          photoStudioDraft: (board as Partial<Board>).photoStudioDraft === true,
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
          socialVideoNarrationEnabled: typeof (board as Partial<Board>).socialVideoNarrationEnabled === 'boolean'
            ? (board as Partial<Board>).socialVideoNarrationEnabled
            : undefined,
          socialLandscapeVideoUrl: typeof board.socialLandscapeVideoUrl === 'string' ? board.socialLandscapeVideoUrl : '',
          socialLandscapeVideoMimeType: typeof board.socialLandscapeVideoMimeType === 'string' ? board.socialLandscapeVideoMimeType : '',
          socialLandscapeVideoUpdatedAt: typeof board.socialLandscapeVideoUpdatedAt === 'string' ? board.socialLandscapeVideoUpdatedAt : '',
          socialLandscapeVideoRenderVersion: typeof board.socialLandscapeVideoRenderVersion === 'string' ? board.socialLandscapeVideoRenderVersion : '',
          socialLandscapeVideoDurationSeconds: typeof board.socialLandscapeVideoDurationSeconds === 'number' && Number.isFinite(board.socialLandscapeVideoDurationSeconds)
            ? Math.max(0, board.socialLandscapeVideoDurationSeconds)
            : 0,
          socialVideoClosingHeadline: typeof (board as Partial<Board>).socialVideoClosingHeadline === 'string'
            ? (board as Partial<Board>).socialVideoClosingHeadline!.slice(0, 72)
            : 'Keep exploring',
          socialVideoClosingMessage: typeof (board as Partial<Board>).socialVideoClosingMessage === 'string'
            ? (board as Partial<Board>).socialVideoClosingMessage!.slice(0, 180)
            : '',
          socialVideoClosingShowQrCode: (board as Partial<Board>).socialVideoClosingShowQrCode !== false,
          socialVideoClosingImage: (board as Partial<Board>).socialVideoClosingImage === 'final-card'
            || ((board as Partial<Board>).socialVideoClosingImage === 'custom'
              && typeof (board as Partial<Board>).socialVideoClosingCustomImageUrl === 'string'
              && Boolean((board as Partial<Board>).socialVideoClosingCustomImageUrl!.trim()))
            ? (board as Partial<Board>).socialVideoClosingImage as StackVideoClosingImage
            : 'cover',
          socialVideoClosingCustomImageUrl: typeof (board as Partial<Board>).socialVideoClosingCustomImageUrl === 'string'
            ? (board as Partial<Board>).socialVideoClosingCustomImageUrl!.trim()
            : '',
          socialVideoClosingDurationSeconds: normalizeStackVideoClosingScreen({
            durationSeconds: (board as Partial<Board>).socialVideoClosingDurationSeconds,
          }).durationSeconds,
          trailerVideoUrl: typeof board.trailerVideoUrl === 'string' ? board.trailerVideoUrl : '',
          trailerVideoMimeType: typeof board.trailerVideoMimeType === 'string' ? board.trailerVideoMimeType : '',
          trailerVideoUpdatedAt: typeof board.trailerVideoUpdatedAt === 'string' ? board.trailerVideoUpdatedAt : '',
          trailerVideoRenderVersion: typeof board.trailerVideoRenderVersion === 'string' ? board.trailerVideoRenderVersion : '',
          trailerVideoRatio: this.isStackRatio((board as Partial<Board>).trailerVideoRatio)
            ? (board as Board).trailerVideoRatio
            : 'vertical',
          trailerVideoAudioTrackId: normalizeStackAudioTrackId((board as Partial<Board>).trailerVideoAudioTrackId),
          trailerVideoAudioVolume: normalizeStackAudioVolume((board as Partial<Board>).trailerVideoAudioVolume),
          trailerVideoNarrationEnabled: typeof (board as Partial<Board>).trailerVideoNarrationEnabled === 'boolean'
            ? (board as Partial<Board>).trailerVideoNarrationEnabled
            : undefined,
          trailerVideoScript: typeof board.trailerVideoScript === 'string' ? board.trailerVideoScript : '',
          trailerVideoSourceFingerprint: typeof board.trailerVideoSourceFingerprint === 'string' ? board.trailerVideoSourceFingerprint : '',
          trailerVideoCardIds: Array.isArray(board.trailerVideoCardIds)
            ? board.trailerVideoCardIds.filter((value): value is string => typeof value === 'string').slice(0, 30)
            : [],
          trailerVideoDurationSeconds: typeof board.trailerVideoDurationSeconds === 'number' && Number.isFinite(board.trailerVideoDurationSeconds)
            ? Math.max(0, board.trailerVideoDurationSeconds)
            : 0,
          trailerLandscapeVideoUrl: typeof board.trailerLandscapeVideoUrl === 'string' ? board.trailerLandscapeVideoUrl : '',
          trailerLandscapeVideoMimeType: typeof board.trailerLandscapeVideoMimeType === 'string' ? board.trailerLandscapeVideoMimeType : '',
          trailerLandscapeVideoUpdatedAt: typeof board.trailerLandscapeVideoUpdatedAt === 'string' ? board.trailerLandscapeVideoUpdatedAt : '',
          trailerLandscapeVideoRenderVersion: typeof board.trailerLandscapeVideoRenderVersion === 'string' ? board.trailerLandscapeVideoRenderVersion : '',
          trailerLandscapeVideoDurationSeconds: typeof board.trailerLandscapeVideoDurationSeconds === 'number' && Number.isFinite(board.trailerLandscapeVideoDurationSeconds)
            ? Math.max(0, board.trailerLandscapeVideoDurationSeconds)
            : 0,
          narrationStyle: normalizeBoardNarrationStyleId((board as Partial<Board>).narrationStyle),
          narrationSecondsPerCard: normalizeBoardNarrationSeconds(
            (board as Partial<Board>).narrationSecondsPerCard,
          ),
          stackNarratorVoiceId: normalizeStackNarratorVoiceId(
            (board as Partial<Board>).stackNarratorVoiceId,
          ),
          backNote: board.backNote ?? '',
          stickers: this.normalizeStickers((board as Board).stickers),
          tourMeta: this.normalizeTourMeta((board as Board).tourMeta),
          nearbyGems: this.normalizeNearbyGemsMeta((board as Board).nearbyGems),
          learningQuiz: normalizeBoardLearningQuiz((board as Board).learningQuiz),
          parentBoardId: typeof (board as Board).parentBoardId === 'string' ? (board as Board).parentBoardId : '',
          parentCardId: typeof (board as Board).parentCardId === 'string' ? (board as Board).parentCardId : '',
          parentBoardTitle: typeof (board as Board).parentBoardTitle === 'string' ? (board as Board).parentBoardTitle : '',
          parentCardTitle: typeof (board as Board).parentCardTitle === 'string' ? (board as Board).parentCardTitle : '',
          atlasId: typeof (board as Partial<Board>).atlasId === 'string' ? (board as Partial<Board>).atlasId! : '',
          generatedForAtlasId: typeof (board as Partial<Board>).generatedForAtlasId === 'string' ? (board as Partial<Board>).generatedForAtlasId! : '',
          insideCardsDisplay: normalizeBoardInsideDisplay((board as Partial<Board>).insideCardsDisplay),
          showCardNumbers: (board as Partial<Board>).showCardNumbers !== false,
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
            videoNarrationRevision: typeof (card as Partial<BoardCard>).videoNarrationRevision === 'number'
              ? Math.max(0, Math.trunc((card as Partial<BoardCard>).videoNarrationRevision!))
              : 0,
            stackNarrationSource: typeof (card as Partial<BoardCard>).stackNarrationSource === 'string'
              ? (card as Partial<BoardCard>).stackNarrationSource!.replace(/\s+/g, ' ').trim().slice(0, 3000)
              : '',
            nearby: this.normalizeNearbyGemMetrics((card as Partial<BoardCard>).nearby),
            stickers: this.normalizeStickers(card.stickers),
            tour: this.normalizeCardTour((card as BoardCard).tour),
            conversation: normalizeBoardCardConversation((card as Partial<BoardCard>).conversation),
            childBoardId: typeof (card as BoardCard).childBoardId === 'string' ? (card as BoardCard).childBoardId : '',
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

  private async persistAndReplaceBoard(board: Board): Promise<boolean> {
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can save changes.`);
      return false;
    }
    try {
      const persisted = await this.persistBoard(board);
      this.boards.update((boards) => boards.map((item) => (item.id === persisted.id ? persisted : item)));
      this.boardsSyncError.set(null);
      return true;
    } catch (error) {
      console.error('Board Firebase sync failed', error, { boardId: board.id });
      this.boardsSyncError.set($localize`Saved on this browser, but Firebase sync failed.`);
      return false;
    }
  }

  private isVisibilityOnlyBoardEdit(previous: Board, next: Board): boolean {
    if (previous.visibility === next.visibility) {
      return false;
    }
    const unchangedFields: Array<keyof Board> = [
      'title',
      'description',
      'backNote',
      'icon',
      'tone',
      'imageUrl',
      'logoUrl',
      'logoLinkUrl',
      'stackCtaLabel',
      'stackCtaUrl',
    ];
    return unchangedFields.every((field) => previous[field] === next[field])
      && JSON.stringify(previous.stickers ?? []) === JSON.stringify(next.stickers ?? []);
  }

  private async persistVisibilityAndReplaceBoard(board: Board): Promise<boolean> {
    if (!this.canEditBoard(board)) {
      this.boardsSyncError.set($localize`Only the board owner can save changes.`);
      return false;
    }
    const uid = this.authService.uid();
    if (!this.firestore || !uid) {
      return true;
    }
    const updatedAt = board.updatedAt || new Date().toISOString();
    const nextBoard = { ...board, updatedAt };
    try {
      await updateDoc(doc(this.firestore, 'boards', board.id), {
        visibility: board.visibility,
        updated_at_iso: updatedAt,
        server_updated_at: serverTimestamp(),
      });
      this.boards.update((boards) => boards.map((item) => item.id === board.id ? nextBoard : item));
      this.boardsSyncError.set(null);
      return true;
    } catch (error) {
      console.error('Board visibility Firebase sync failed', error, { boardId: board.id });
      this.boardsSyncError.set($localize`Board save failed. Please try again.`);
      return false;
    }
  }

  private async persistBoard(board: Board): Promise<Board> {
    const visibilitySafeBoard: Board = board.photoStudioDraft
      ? { ...board, visibility: 'private' }
      : board;
    const uid = this.authService.uid();
    if (!this.firestore || !uid) {
      return visibilitySafeBoard;
    }
    const { prepared, persistable } = await this.prepareBoardForFirestore(visibilitySafeBoard, uid);
    await setDoc(doc(this.firestore, 'boards', prepared.id), persistable);
    return prepared;
  }

  private async publishWizardBoard(board: Board, draftId: string): Promise<Board> {
    const uid = this.authService.uid();
    if (!this.firestore || !uid) {
      throw new Error('Board sync is not ready.');
    }
    const { prepared, persistable } = await this.prepareBoardForFirestore(board, uid);
    const batch = writeBatch(this.firestore);
    batch.set(doc(this.firestore, 'boards', prepared.id), persistable);
    batch.delete(doc(this.firestore, 'users', uid, 'board_wizard_drafts', draftId));
    await batch.commit();
    return prepared;
  }

  private async deletePublishedWizardDraft(): Promise<void> {
    const uid = this.authService.uid();
    const draftId = this.wizardActiveDraftId();
    if (!this.firestore || !uid || !draftId) {
      return;
    }
    await deleteDoc(doc(this.firestore, 'users', uid, 'board_wizard_drafts', draftId));
    this.wizardDrafts.update((drafts) => drafts.filter((draft) => draft.id !== draftId));
    this.wizardActiveDraftId.set(null);
    this.wizardDraftSaveState.set('idle');
  }

  private async prepareBoardForFirestore(
    board: Board,
    uid: string,
  ): Promise<{ prepared: Board; persistable: Record<string, unknown> }> {
    if (board.ownerUserId !== uid) {
      throw new Error('Only the board owner can save changes.');
    }
    const boardWithOwner = {
      ...board,
      description: boardDescriptionForFirestore(board.description),
      ...this.currentOwnerSnapshot(),
    };
    const storageOwnerId = boardWithOwner.ownerUserId || uid;
    const resolvedOwnerPublicSlug = await this.resolveOwnerPublicSlug(boardWithOwner, storageOwnerId);
    const prepared = await this.prepareBoardImagesForFirebase({ ...boardWithOwner, ownerPublicSlug: resolvedOwnerPublicSlug }, storageOwnerId);
    const { likeCount, ...preparedFields } = prepared;
    const record: BoardRecord & { server_updated_at: unknown } = {
      ...preparedFields,
      like_count: likeCount ?? 0,
      ...(prepared.customSlug ? { custom_slug: prepared.customSlug } : {}),
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
      customSlug: _customSlug,
      atlasId,
      generatedForAtlasId,
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
      customSlug?: string;
      atlasId?: string;
      generatedForAtlasId?: string;
      server_updated_at: unknown;
    };
    return {
      prepared,
      persistable: omitUndefinedDeep({
        ...persistable,
        ...boardCityMetadataForFirestore(atlasId, generatedForAtlasId),
      }) as Record<string, unknown>,
    };
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

  private boardSummaryFromRecord(id: string, data: Record<string, unknown>): Board | null {
    const board = this.boardFromRecord(id, { ...data, cards: [] });
    if (!board) return null;
    return {
      ...board,
      isSummary: true,
      summaryCardCount: this.numberValue(data['card_count'], 0, 0, 100_000),
      summaryFavoriteCardCount: this.numberValue(data['favorite_card_count'], 0, 0, 100_000),
      summarySearchText: this.stringValue(data['search_text'], '', 8_000),
      imageWebpSrcset: this.stringValue(data['image_webp_srcset'], '', 8_000),
      imageWidth: this.numberValue(data['image_width'], 0, 0, 10_000),
      imageHeight: this.numberValue(data['image_height'], 0, 0, 10_000),
    };
  }

  private boardFromRecord(id: string, data: Record<string, unknown>): Board | null {
    const title = typeof data['title'] === 'string' ? data['title'] : '';
    if (!title) {
      return null;
    }

    const rawCards = Array.isArray(data['cards']) ? data['cards'] : [];
    const photoStudioDraft = data['photoStudioDraft'] === true;
    return {
      id,
      likeCount: typeof data['like_count'] === 'number' ? Math.max(0, Math.trunc(data['like_count'])) : 0,
      customSlug: typeof data['custom_slug'] === 'string'
        ? normalizeCustomPublicUrlSlug(data['custom_slug'])
        : '',
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
      visibility: photoStudioDraft
        ? 'private'
        : this.isBoardVisibility(data['visibility']) ? data['visibility'] : 'public',
      photoStoryBoard: data['photoStoryBoard'] === true,
      photoStudioDraft,
      title,
      description: typeof data['description'] === 'string' ? data['description'] : '',
      backNote: typeof data['backNote'] === 'string' ? data['backNote'] : '',
      icon: resolveBoardIcon(data['icon'], {
        title,
        description: typeof data['description'] === 'string' ? data['description'] : '',
        kind: this.isBoardKind(data['kind']) ? data['kind'] : 'standard',
      }),
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
      socialVideoNarrationEnabled: typeof data['socialVideoNarrationEnabled'] === 'boolean'
        ? data['socialVideoNarrationEnabled']
        : undefined,
      socialLandscapeVideoUrl: typeof data['socialLandscapeVideoUrl'] === 'string' ? data['socialLandscapeVideoUrl'] : '',
      socialLandscapeVideoMimeType: typeof data['socialLandscapeVideoMimeType'] === 'string' ? data['socialLandscapeVideoMimeType'] : '',
      socialLandscapeVideoUpdatedAt: typeof data['socialLandscapeVideoUpdatedAt'] === 'string' ? data['socialLandscapeVideoUpdatedAt'] : '',
      socialLandscapeVideoRenderVersion: typeof data['socialLandscapeVideoRenderVersion'] === 'string' ? data['socialLandscapeVideoRenderVersion'] : '',
      socialLandscapeVideoDurationSeconds: typeof data['socialLandscapeVideoDurationSeconds'] === 'number' && Number.isFinite(data['socialLandscapeVideoDurationSeconds'])
        ? Math.max(0, data['socialLandscapeVideoDurationSeconds'])
        : 0,
      socialVideoClosingHeadline: typeof data['socialVideoClosingHeadline'] === 'string'
        ? data['socialVideoClosingHeadline'].slice(0, 72)
        : 'Keep exploring',
      socialVideoClosingMessage: typeof data['socialVideoClosingMessage'] === 'string'
        ? data['socialVideoClosingMessage'].slice(0, 180)
        : '',
      socialVideoClosingShowQrCode: data['socialVideoClosingShowQrCode'] !== false,
      socialVideoClosingImage: data['socialVideoClosingImage'] === 'final-card'
        || (data['socialVideoClosingImage'] === 'custom'
          && typeof data['socialVideoClosingCustomImageUrl'] === 'string'
          && Boolean(data['socialVideoClosingCustomImageUrl'].trim()))
        ? data['socialVideoClosingImage'] as StackVideoClosingImage
        : 'cover',
      socialVideoClosingCustomImageUrl: typeof data['socialVideoClosingCustomImageUrl'] === 'string'
        ? data['socialVideoClosingCustomImageUrl'].trim()
        : '',
      socialVideoClosingDurationSeconds: normalizeStackVideoClosingScreen({
        durationSeconds: data['socialVideoClosingDurationSeconds'] as number | undefined,
      }).durationSeconds,
      trailerVideoUrl: typeof data['trailerVideoUrl'] === 'string' ? data['trailerVideoUrl'] : '',
      trailerVideoMimeType: typeof data['trailerVideoMimeType'] === 'string' ? data['trailerVideoMimeType'] : '',
      trailerVideoUpdatedAt: typeof data['trailerVideoUpdatedAt'] === 'string' ? data['trailerVideoUpdatedAt'] : '',
      trailerVideoRenderVersion: typeof data['trailerVideoRenderVersion'] === 'string' ? data['trailerVideoRenderVersion'] : '',
      trailerVideoRatio: this.isStackRatio(data['trailerVideoRatio']) ? data['trailerVideoRatio'] : 'vertical',
      trailerVideoAudioTrackId: normalizeStackAudioTrackId(data['trailerVideoAudioTrackId']),
      trailerVideoAudioVolume: normalizeStackAudioVolume(data['trailerVideoAudioVolume']),
      trailerVideoNarrationEnabled: typeof data['trailerVideoNarrationEnabled'] === 'boolean'
        ? data['trailerVideoNarrationEnabled']
        : undefined,
      trailerVideoScript: typeof data['trailerVideoScript'] === 'string' ? data['trailerVideoScript'] : '',
      trailerVideoSourceFingerprint: typeof data['trailerVideoSourceFingerprint'] === 'string' ? data['trailerVideoSourceFingerprint'] : '',
      trailerVideoCardIds: Array.isArray(data['trailerVideoCardIds'])
        ? data['trailerVideoCardIds'].filter((value): value is string => typeof value === 'string').slice(0, 30)
        : [],
      trailerVideoDurationSeconds: typeof data['trailerVideoDurationSeconds'] === 'number' && Number.isFinite(data['trailerVideoDurationSeconds'])
        ? Math.max(0, data['trailerVideoDurationSeconds'])
        : 0,
      trailerLandscapeVideoUrl: typeof data['trailerLandscapeVideoUrl'] === 'string' ? data['trailerLandscapeVideoUrl'] : '',
      trailerLandscapeVideoMimeType: typeof data['trailerLandscapeVideoMimeType'] === 'string' ? data['trailerLandscapeVideoMimeType'] : '',
      trailerLandscapeVideoUpdatedAt: typeof data['trailerLandscapeVideoUpdatedAt'] === 'string' ? data['trailerLandscapeVideoUpdatedAt'] : '',
      trailerLandscapeVideoRenderVersion: typeof data['trailerLandscapeVideoRenderVersion'] === 'string' ? data['trailerLandscapeVideoRenderVersion'] : '',
      trailerLandscapeVideoDurationSeconds: typeof data['trailerLandscapeVideoDurationSeconds'] === 'number' && Number.isFinite(data['trailerLandscapeVideoDurationSeconds'])
        ? Math.max(0, data['trailerLandscapeVideoDurationSeconds'])
        : 0,
      narrationStyle: normalizeBoardNarrationStyleId(data['narrationStyle']),
      narrationSecondsPerCard: normalizeBoardNarrationSeconds(data['narrationSecondsPerCard']),
      stackNarratorVoiceId: normalizeStackNarratorVoiceId(data['stackNarratorVoiceId']),
      stickers: this.normalizeStickers(data['stickers']),
      tourMeta: this.normalizeTourMeta(data['tourMeta']),
      nearbyGems: this.normalizeNearbyGemsMeta(data['nearbyGems']),
      learningQuiz: normalizeBoardLearningQuiz(data['learningQuiz']),
      parentBoardId: typeof data['parentBoardId'] === 'string' ? data['parentBoardId'] : '',
      parentCardId: typeof data['parentCardId'] === 'string' ? data['parentCardId'] : '',
      parentBoardTitle: typeof data['parentBoardTitle'] === 'string' ? data['parentBoardTitle'] : '',
      parentCardTitle: typeof data['parentCardTitle'] === 'string' ? data['parentCardTitle'] : '',
      atlasId: typeof data['atlas_id'] === 'string' ? data['atlas_id'] : '',
      generatedForAtlasId: typeof data['generated_for_atlas_id'] === 'string' ? data['generated_for_atlas_id'] : '',
      insideCardsDisplay: normalizeBoardInsideDisplay(data['insideCardsDisplay']),
      showCardNumbers: data['showCardNumbers'] !== false,
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
      nearby: this.normalizeNearbyGemMetrics(data['nearby']),
      videoNarrationRevision: typeof data['videoNarrationRevision'] === 'number'
        ? Math.max(0, Math.trunc(data['videoNarrationRevision']))
        : 0,
      videoIntent: data['videoIntent'] === true,
      videoSearchQuery: typeof data['videoSearchQuery'] === 'string' ? data['videoSearchQuery'].slice(0, 180) : '',
      youtubeVideoId: youtubeVideoIdFromReference(data['youtubeVideoId']),
      youtubeVideoTitle: typeof data['youtubeVideoTitle'] === 'string' ? data['youtubeVideoTitle'].slice(0, 300) : '',
      youtubeChannelTitle: typeof data['youtubeChannelTitle'] === 'string' ? data['youtubeChannelTitle'].slice(0, 200) : '',
      youtubeThumbnailUrl: typeof data['youtubeThumbnailUrl'] === 'string' ? data['youtubeThumbnailUrl'].slice(0, 2000) : '',
      youtubeDurationSeconds: typeof data['youtubeDurationSeconds'] === 'number'
        ? Math.max(0, Math.min(86_400, Math.trunc(data['youtubeDurationSeconds'])))
        : 0,
      youtubeMatchConfidence: typeof data['youtubeMatchConfidence'] === 'number'
        ? Math.max(0, Math.min(1, data['youtubeMatchConfidence']))
        : 0,
      youtubeVerifiedAt: typeof data['youtubeVerifiedAt'] === 'string' ? data['youtubeVerifiedAt'].slice(0, 80) : '',
      imageUrl: typeof data['imageUrl'] === 'string' ? data['imageUrl'] : '',
      imageUrls: this.uniqueImageUrls([
        typeof data['imageUrl'] === 'string' ? data['imageUrl'] : '',
        ...(Array.isArray(data['imageUrls']) ? data['imageUrls'].filter((url): url is string => typeof url === 'string') : []),
      ]).slice(0, cardPhotoLimit(data)),
      listingPresentation: normalizeListingCardPresentation(data['listingPresentation']),
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
      childBoardId: typeof data['childBoardId'] === 'string' ? data['childBoardId'] : '',
      relatedCards: includeRelatedCards && Array.isArray(data['relatedCards'])
        ? data['relatedCards']
          .map((card) => this.cardFromRecord(card, false))
          .filter((card): card is BoardCard => !!card)
          .slice(0, 100)
        : [],
      conversation: normalizeBoardCardConversation(data['conversation']),
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
    const socialVideoClosingCustomImageUrl = await this.persistImageIfNeeded(
      board.socialVideoClosingCustomImageUrl,
      `users/${uid}/boards/${board.id}/social/final-screen.jpg`,
    );
    const cards = await Promise.all(
      board.cards.map((card) => this.prepareBoardCardImagesForFirebase(card, uid, board.id)),
    );
    return { ...board, imageUrl, logoUrl, socialVideoClosingCustomImageUrl, cards };
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
    const persistedBySource = new Map(sourceImages.map((url, index) => [url, imageUrls[index] || url]));
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
      listingPresentation: card.listingPresentation ? {
        ...card.listingPresentation,
        presentationImageUrls: card.listingPresentation.presentationImageUrls
          .map((url) => persistedBySource.get(url) || url),
      } : null,
      relatedCards,
    };
  }

  private async persistImageIfNeeded(imageUrl: string, path: string): Promise<string> {
    if (!imageUrl.startsWith('data:') || !this.storage) {
      return imageUrl;
    }

    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const versioned = await this.versionedImageStoragePath(path, blob);
    const ref = storageRef(this.storage, versioned.path);
    await uploadBytes(ref, blob, {
      contentType: blob.type || 'image/jpeg',
      cacheControl: versioned.immutable
        ? 'public,max-age=31536000,immutable'
        : 'public,max-age=3600,stale-while-revalidate=86400',
    });
    return getDownloadURL(ref);
  }

  private async versionedImageStoragePath(path: string, blob: Blob): Promise<{ path: string; immutable: boolean }> {
    try {
      const digest = await window.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest).slice(0, 12))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      return {
        path: /\.[a-z0-9]+$/i.test(path)
          ? path.replace(/(\.[a-z0-9]+)$/i, `-${hash}$1`)
          : `${path}-${hash}`,
        immutable: true,
      };
    } catch {
      return { path, immutable: false };
    }
  }

  private isBoardTone(value: unknown): value is BoardTone {
    return typeof value === 'string' && this.tones.some((tone) => tone.id === value);
  }

  private isBoardKind(value: unknown): value is BoardKind {
    return value === 'standard' || value === 'nearby-gems' || value === 'off-grid' || value === 'walking-tour' || value === 'driving-tour';
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
    return mode === 'nearby-gems' || mode === 'off-grid' || mode === 'walking-tour' || mode === 'driving-tour' ? mode : 'standard';
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
    return value === 'person' || value === 'fictional_character' || value === 'place' || value === 'event' || value === 'work'
      || value === 'product' || value === 'food' || value === 'organization' || value === 'other';
  }

  private isBoardImageIntent(value: unknown): value is BoardImageIntent {
    return value === 'portrait' || value === 'character' || value === 'place' || value === 'event' || value === 'cover'
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

  private compareGalleryBoards(left: Board, right: Board): number {
    return this.publicOwnerKey()
      ? compareBoardsByCreatedDate(left, right)
      : this.compareBoards(left, right);
  }

  private compareBoardGallerySelection(left: Board, right: Board): number {
    const selection = this.boardGallerySort();
    if (selection === 'recent') {
      return this.compareDatesDesc(left.updatedAt, right.updatedAt)
        || left.title.localeCompare(right.title)
        || left.id.localeCompare(right.id);
    }
    if (selection === 'title') {
      return left.title.localeCompare(right.title)
        || this.compareDatesDesc(left.updatedAt, right.updatedAt)
        || left.id.localeCompare(right.id);
    }
    return this.compareGalleryBoards(left, right);
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

  cityForBoard(board: Board): BoardCityOption | null {
    const atlasId = board.atlasId || board.generatedForAtlasId;
    if (!atlasId) return null;
    return this.publicCities().find((city) => city.id === atlasId) ?? null;
  }

  cityBoardLink(city: BoardCityOption): string[] {
    return ['/chat', city.slug || city.id];
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

  private async readVideoBrandingLogoFile(file: File): Promise<string> {
    if (!this.isBrowser) throw new Error('Logo uploads are available in the browser.');
    const dataUrl = await this.readBlobAsDataUrl(file);
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (Math.min(width, height) < 128) {
          reject(new Error('Choose a logo that is at least 128 pixels on its shortest side.'));
          return;
        }
        resolve();
      };
      image.onerror = () => reject(new Error('That logo image could not be decoded.'));
      image.src = dataUrl;
    });
    return this.resizeImageDataUrl(dataUrl, 1800, 0.92, 'image/png');
  }

  private resizeImageDataUrl(
    dataUrl: string,
    maxSide = 1400,
    quality = 0.84,
    outputType: 'image/jpeg' | 'image/png' = 'image/jpeg',
  ): Promise<string> {
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
        resolve(canvas.toDataURL(outputType, quality));
      };
      image.onerror = () => reject(new Error('Could not load that image.'));
      image.src = dataUrl;
    });
  }
}
