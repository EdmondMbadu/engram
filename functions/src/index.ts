import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import sgMail from '@sendgrid/mail';
import Stripe from 'stripe';
import stackNarratorVoiceCatalog from './stack-narrator-voices.json';
import { BOARD_WIZARD_PASTE_MAX_LENGTH, parseNumberedBoardSource, type NumberedBoardSource } from './board-wizard-source';
import {
  boardWizardImageEntityName,
  buildBoardWizardContextualImagePrompt,
  buildBoardWizardFictionalCharacterSearchQueries,
  buildBoardWizardFictionalCharacterWikipediaTitles,
  buildBoardWizardCommonsSearchQueries,
  buildBoardWizardImageRecoveryQueries,
  buildBoardWizardPlaceSearchQueries,
  isBoardWizardFictionalCharacter,
  rankBoardWizardPlaceCandidates,
  scoreBoardWizardFictionalCharacterImageResult,
  shouldResolveBoardWizardCardAsPlace,
  stripBoardWizardReferenceTitleDescriptor,
  wikipediaPageTitleMatchScore,
} from './board-wizard-image-quality';
import { resolveBoardWizardMediaKind, type BoardWizardMediaKind } from './board-wizard-media-quality';
import {
  applyBoardWizardMediaMode,
  boardWizardCardWantsVideo,
  boardWizardVideoCandidateLooksDirect,
  buildBoardWizardContextVideoSearchQuery,
  buildBoardWizardRelatedVideoSearchQuery,
  buildBoardWizardYouTubeApiQuery,
  buildBoardWizardVideoSearchQuery,
  parseIso8601DurationSeconds,
  rankBoardWizardVideoCandidates,
  scoreBoardWizardVideoCandidate,
  normalizeBoardWizardMediaMode,
  youtubeVideoIdFromReference,
  type BoardWizardVideoCandidate,
  type BoardWizardVideoCardInput,
} from './board-wizard-video';
import { createYouTubeEmbedVerifier, type YouTubeEmbedVerifier } from './youtube-embed-verifier';
import { extractYouTubeWebSearchResults } from './youtube-web-search';
import {
  extractBoardTranslationSource,
  isBoardTranslationLanguage,
  type BoardTranslationSegment,
} from './board-translation';
import { db, storage } from './firebase';
import {
  broadLocationLabel,
  formatNearbyGemDuration,
  haversineMeters,
  googleDurationSeconds,
  nearbyGemCategory,
  nearbyGemPreset,
  rankNearbyGemCandidates,
  type NearbyGemCandidate,
  type NearbyGemPreset,
} from './nearby-gems';
import { publicBoardRouteKey } from './custom-public-routes';
export {
  cleanupDeletedBoardPublicRoutes,
  cleanupDeletedCollectionPublicRoutes,
  setCustomPublicUrl,
} from './custom-public-routes';
export { getBoardInsights, recordBoardAnalyticsEvent } from './board-analytics';
import { handleAnswerCardShare, handleBoardShare, handleTravelCardShare } from './answer-card-share';
import { buildDirectBoardShareEmail, safeBoardShareImageUrl } from './board-share-email';
import { resolveSpotifyOAuthRedirectUri } from './spotify-oauth';
import {
  SPOTIFY_PLAYLIST_SCOPE,
  spotifyCanExportPlaylist,
  spotifyPlaylistContentHash,
  spotifyPlaylistDescription,
  spotifyPlaylistName,
} from './spotify-playlist';
import {
  boardCardById,
  buildVisitGuestPage,
  buildVisitInterestAcknowledgementEmail,
  buildVisitInterestOwnerEmail,
  buildVisitInvitationEmail,
  buildVisitJoinedEmail,
  buildVisitPlanEmail,
  buildVisitResponseEmail,
  isVisitableBoardCard,
  normalizeVisitPlanEmails,
  normalizeVisitStart,
  normalizeVisitTimezone,
  serializeVisitPlan,
  snapshotFromVisitPlanRecord,
  visitEmailInvitationDocumentId,
  visitPlanDocumentId,
  visitPlanEmailAttachments,
  visitPlanSnapshot,
  visitReminderAtMs,
  visitWhenLabel,
  type VisitPlanEmail,
  type VisitPlanSnapshot,
} from './visit-plans';
import {
  answerWithGoogleSearch,
  extractMappableLocations,
  geminiApiKey,
  generateAnswerCard,
  generateAnswerQuiz,
  generateBoardCardImageAsset,
  generateBoardTrailerScript,
  generateBoardWizardBatch as generateBoardWizardBatchWithGemini,
  translateBoardTextSegments,
  generateVoiceConversationRecap,
  type BoardWizardMode,
  type BoardWizardVibe,
  type GeneratedBoardCardTour,
  type GeneratedBoardTourLeg,
  type GeneratedBoardTourMeta,
  type GeneratedBoardTourMode,
  type GeneratedBoardTourVoiceStyle,
  type GeneratedBoardWizardBatch,
  type GeneratedBoardWizardCard,
  type GeneratedBoardWizardSourceReport,
} from './gemini';
import {
  BULK_BOARD_RUBRIC_VERSION,
  bulkBoardDocumentId,
  bulkBoardGenerationKey,
  bulkBoardSuppressionId,
  normalizeBulkBoardTemplate,
  processBulkBoardGenerationItem,
} from './bulk-board-generation';
import { GLOBAL_CITY_BOARD_TEMPLATES } from './global-city-board-templates';
import {
  GLOBAL_UNIVERSITY_BOARD_TEMPLATES,
  type GlobalUniversityBoardTemplate,
} from './global-university-board-templates';
import {
  boardNarrationFallbackDescription,
  boardNarrationFallbackNotes,
  normalizeBoardNarrationStyle,
} from './board-wizard-narration';
import {
  getStoredCityPulseSnapshot,
  listEnabledCityAtlasIds,
  refreshStoredCityPulseSnapshot,
} from './city-pulse';
import { refreshCityPopulationMetadata } from './city-population';
import {
  buildCityPlaceTextSearchRequest,
  cityPlaceSearchCandidateLimit,
  cityPlaceSearchGoogleResultLimit,
} from './city-place-search';
import {
  sharedStackNarrationCacheMode,
  stackVideoNarrationCardFromBoard,
  stackVideoNarrationRevisionCacheKey,
  stackVideoNarrationTextFromCard,
} from './stack-video-narration';
import {
  cityBoardAtlasId,
  cityBoardListingId,
  cityBoardListingPayload,
  isPublicCityBoard,
} from './city-board-listing';
import {
  getStoredPhillyGreenJobsSnapshot,
  refreshStoredPhillyGreenJobsSnapshot,
} from './green-jobs';
import { fetchHtmlWithFallback, looksLikeAntiBotChallenge } from './html-fetch';
import {
  extractCommercePage,
  mergeCommerceProductDetail,
  type CommercePageExtraction,
} from './board-wizard-commerce';
import {
  bestBoardWizardSrcsetUrl,
  extractBoardWizardPictureImages,
  isPlausibleBoardWizardFoodImageContext,
  matchBoardWizardMenuImage,
} from './board-wizard-menu-images';
import {
  extractStructuredBoardWizardMenuItems,
  isBoardWizardMenuActionCard,
} from './board-wizard-menu';
import {
  boardWizardReaderPageTitle,
  extractBoardWizardReaderMenuItems,
  extractBoardWizardReaderProducts,
  fetchBoardWizardReaderPage,
} from './board-wizard-reader';
import {
  alignBoardWizardSourceCards,
  boardWizardSourceManifestIsExact,
  extractBoardWizardArticleManifest,
  extractBoardWizardArticleManifestFromMarkdown,
  extractBoardWizardReadableText,
  normalizeBoardWizardSourceManifest,
  type BoardWizardSourceManifest,
} from './board-wizard-article';
import {
  clientTimestamp,
  deleteChatEntityForUser,
  deleteDocumentForUser,
  getPublicChatState as loadPublicChatState,
  getWikiTopicDetailsForUser,
  loadDocumentRecord,
  newDocumentRecord,
  processWikiTopicSummaryJob,
  processStoredDocument,
  processUrlDocument,
  runAtlasQuery,
  runAtlasInternetStream,
  runPublicAtlasQuery,
} from './pipeline';
import { buildStoragePath, detectFileType, extractDocumentIdFromPath } from './utils';
import type { AnswerCardRecord, AnswerQuizQuestionRecord, AnswerQuizRecord, MappableLocation, SupportedFileType, TravelGuideCard } from './types';

const callableRegion = 'us-central1';
const storageTriggerRegion = 'us-west1';
const staleIngestionThresholdMinutes = 10;
const defaultRetryLimit = 50;
const staleRetryBatchLimit = 200;
const maxGoogleDriveImportFiles = 10;
const sendgridApiKey = defineSecret('SENDGRID_API_KEY');
const elevenLabsApiKey = defineSecret('ELEVENLABS_API_KEY');
const elevenLabsAgentId = defineString('ELEVENLABS_AGENT_ID');
const elevenLabsTtsVoiceOverridesEnabled = defineString('ELEVENLABS_TTS_VOICE_OVERRIDES_ENABLED', {
  default: 'false',
});
const elevenLabsFirstMessageOverridesEnabled = defineString('ELEVENLABS_FIRST_MESSAGE_OVERRIDES_ENABLED', {
  default: 'false',
});
export const googlePlacesApiKey = defineSecret('GOOGLE_PLACES_API_KEY');
const googleCustomSearchApiKey = defineSecret('GOOGLE_CUSTOM_SEARCH_API_KEY');
const youtubeDataApiKey = defineSecret('YOUTUBE_DATA_API_KEY');
const googleCustomSearchCx = process.env.GOOGLE_CUSTOM_SEARCH_CX ?? '';
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID ?? '';
const spotifyClientSecret = defineSecret('SPOTIFY_CLIENT_SECRET');
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const stripePersonalPlusMonthlyPriceId = defineString('STRIPE_PRICE_PERSONAL_PLUS_MONTHLY', { default: '' });
const stripePersonalPlusAnnualPriceId = defineString('STRIPE_PRICE_PERSONAL_PLUS_ANNUAL', { default: '' });
const stripeCreatorMonthlyPriceId = defineString('STRIPE_PRICE_CREATOR_MONTHLY', { default: '' });
const stripeCreatorAnnualPriceId = defineString('STRIPE_PRICE_CREATOR_ANNUAL', { default: '' });
const inviteSenderEmail = 'missioncontrol@rocketgoals.com';
const publicAppUrl = 'https://livingwiki.com';
const publicFunctionsBaseUrl = 'https://us-central1-living-atlas-7622a.cloudfunctions.net';
const spotifyOAuthRedirectUri = resolveSpotifyOAuthRedirectUri(
  process.env.SPOTIFY_REDIRECT_URI,
  publicAppUrl,
);
const spotifyOAuthScopes = [
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-private',
  SPOTIFY_PLAYLIST_SCOPE,
].join(' ');
const spotifyOAuthStateTtlMs = 10 * 60 * 1000;
const spotifyRefreshLifetimeMs = 183 * 24 * 60 * 60 * 1000;
const maxSmsReplyLength = 1200;
const chatAnswerVoiceId = 'ed7fd7f55fa58dd74b904a15d1e38bf97763ae8d9faccdce8a27de3441bffa75';
const elevenLabsPremadeNarratorVoiceIds = [
  '21m00Tcm4TlvDq8ikWAM',
  'EXAVITQu4vr4xnSDxMaL',
  'pNInz6obpgDQGcFmaJgB',
];
const stackNarratorVoiceIds = Object.fromEntries(
  stackNarratorVoiceCatalog.map((voice) => [voice.id, voice.providerVoiceId]),
) as Readonly<Record<string, string>>;
const personalStackNarratorVoiceId = 'personal-voice';
const personalNarratorVoiceCollection = 'user_narrator_voices';
const personalNarratorVoiceConsentVersion = 'v1';
const personalNarratorVoiceMinDurationSeconds = 20;
const personalNarratorVoiceMaxDurationSeconds = 180;
const personalNarratorVoiceMaxBytes = 15 * 1024 * 1024;
const maxSpeechTextLength = 4000;
const maxSpeechRecapWords = 28;
const speechRecapVersion = 'v2';
const tourSpeechVersion = 'v1';
const chatAnswerSpeechModel = 'eleven_flash_v2_5';
const tourGuideSpeechModel = 'eleven_multilingual_v2';
const elevenLabsVoiceCacheTtlMs = 6 * 60 * 60 * 1000;
const elevenLabsVoiceSearchDeadlineMs = 950;
const elevenLabsTokenRequestTimeoutMs = 5000;
const elevenLabsVoiceCache = new Map<string, ElevenLabsVoiceCacheEntry>();
const defaultNewsletterPrompt = [
  'Create a premium weekly Living Wiki email briefing with exactly five of the biggest headlines for this specific wiki.',
  'Focus on the latest verified public information, news, civic updates, development, culture, public safety, transportation, economy, and community signals that matter most to readers.',
  'For Philadelphia wikis, prioritize Philadelphia and the surrounding region.',
  'Use fresh web search, include dates when available, avoid rumors, and keep every item concise.',
  'Write like a top-tier professional local intelligence briefing: sharp, useful, polished, and skimmable.',
].join(' ');
const urlIngestionTriggerOptions = {
  region: callableRegion,
  timeoutSeconds: 540,
  memory: '2GiB' as const,
  cpu: 2,
  concurrency: 1,
  maxInstances: 16,
  secrets: [geminiApiKey],
};

export const answerCardShare = onRequest(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '1GiB',
    cors: true,
  },
  handleAnswerCardShare,
);

export const travelCardShare = onRequest(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '1GiB',
    cors: true,
  },
  handleTravelCardShare,
);

export const boardShare = onRequest(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '1GiB',
    cors: true,
  },
  handleBoardShare,
);

type GoogleDriveImportSelection = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
};

type GoogleDriveFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
};

type GoogleDriveImportPlan = {
  fileType: SupportedFileType;
  filename: string;
  title: string;
  requestMimeType: string;
  uploadMimeType: string;
  mode: 'download' | 'export';
};

function timestampToIso(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  return null;
}

async function assertPlatformAdmin(userId: string): Promise<void> {
  const snapshot = await db.collection('users').doc(userId).get();
  if (!snapshot.exists || snapshot.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Platform admin access is required.');
  }
}

function hasActivePersonalWikiPlan(profile: Record<string, unknown> | undefined): boolean {
  const camelPlan = typeof profile?.pricingPlan === 'string' ? profile.pricingPlan.trim().toLowerCase() : '';
  const snakePlan = typeof profile?.pricing_plan === 'string' ? profile.pricing_plan.trim().toLowerCase() : '';
  const camelStatus = typeof profile?.subscriptionStatus === 'string' ? profile.subscriptionStatus.trim().toLowerCase() : '';
  const snakeStatus = typeof profile?.subscription_status === 'string' ? profile.subscription_status.trim().toLowerCase() : '';
  const plan = camelPlan || snakePlan;
  const status = camelStatus || snakeStatus;
  return (plan === 'personal_plus' || plan === 'creator' || plan === 'explorer' || plan === 'lifetime')
    && (status === 'active' || status === 'trialing' || status === 'paid');
}

async function assertCanCreateWiki(userId: string): Promise<void> {
  const snapshot = await db.collection('users').doc(userId).get();
  const profile = snapshot.data() as Record<string, unknown> | undefined;
  if (profile?.role === 'admin' || hasActivePersonalWikiPlan(profile)) {
    return;
  }
  throw new HttpsError('permission-denied', 'Upgrade to Personal Plus or Creator to create Wikis.');
}

type BusinessCheckoutPlanKey = 'local' | 'favorite' | 'sponsor';
type UserPricingPlanKey = 'personal_plus' | 'creator';
type UserPricingBillingCycle = 'monthly' | 'annual';
type MembershipCheckoutPlanKey = 'explorer' | 'lifetime';

const businessCheckoutPlans: Record<BusinessCheckoutPlanKey, {
  amount: number;
  name: string;
  description: string;
}> = {
  local: {
    amount: 2500,
    name: 'LivingWiki Business Local',
    description: 'Tone control, business documents, 200+ conversation minutes, and conversation details.',
  },
  favorite: {
    amount: 6500,
    name: 'LivingWiki Business Local Favorite',
    description: 'Business AI setup plus stronger local placement and priority support.',
  },
  sponsor: {
    amount: 18000,
    name: 'LivingWiki City Sponsor',
    description: 'Citywide visibility with deeper support for launch and growth.',
  },
};

const userPricingPlanLabels: Record<UserPricingPlanKey, string> = {
  personal_plus: 'LivingWiki Personal Plus',
  creator: 'LivingWiki Creator',
};

const membershipCheckoutPlans: Record<MembershipCheckoutPlanKey, {
  amount: number;
  billingCycle: 'monthly' | 'lifetime';
  description: string;
  mode: 'subscription' | 'payment';
  name: string;
}> = {
  explorer: {
    amount: 399,
    billingCycle: 'monthly',
    description: 'Unlimited boards, advanced templates, collaboration, and higher AI generation limits.',
    mode: 'subscription',
    name: 'LivingWiki Explorer Launch Membership',
  },
  lifetime: {
    amount: 5900,
    billingCycle: 'lifetime',
    description: 'Lifetime access to Explorer features, upgrades, priority support, and Founding Member benefits.',
    mode: 'payment',
    name: 'LivingWiki Lifetime Launch Membership',
  },
};

const allowedCheckoutOrigins = new Set([
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:4201',
  'http://127.0.0.1:4201',
  'https://livingwiki.com',
  'https://www.livingwiki.com',
  'https://living-atlas-7622a.web.app',
  'https://living-atlas-7622a.firebaseapp.com',
]);

let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  const secret = stripeSecretKey.value();
  if (!secret) {
    throw new HttpsError('failed-precondition', 'Stripe is not configured.');
  }
  stripeClient ??= new Stripe(secret);
  return stripeClient;
}

function normalizeBusinessCheckoutPlan(value: unknown): BusinessCheckoutPlanKey | null {
  if (typeof value !== 'string') {
    return null;
  }
  const plan = value.toLowerCase();
  return plan === 'local' || plan === 'favorite' || plan === 'sponsor' ? plan : null;
}

function normalizeUserPricingPlan(value: unknown): UserPricingPlanKey | null {
  if (typeof value !== 'string') {
    return null;
  }
  const plan = value.toLowerCase();
  return plan === 'personal_plus' || plan === 'creator' ? plan : null;
}

function normalizeUserPricingBillingCycle(value: unknown): UserPricingBillingCycle | null {
  if (typeof value !== 'string') {
    return null;
  }
  const cycle = value.toLowerCase();
  return cycle === 'monthly' || cycle === 'annual' ? cycle : null;
}

function normalizeMembershipCheckoutPlan(value: unknown): MembershipCheckoutPlanKey | null {
  if (typeof value !== 'string') {
    return null;
  }
  const plan = value.toLowerCase();
  return plan === 'explorer' || plan === 'lifetime' ? plan : null;
}

function getUserPricingPriceId(plan: UserPricingPlanKey, billingCycle: UserPricingBillingCycle): string {
  const priceId = plan === 'personal_plus'
    ? (billingCycle === 'annual' ? stripePersonalPlusAnnualPriceId.value() : stripePersonalPlusMonthlyPriceId.value())
    : (billingCycle === 'annual' ? stripeCreatorAnnualPriceId.value() : stripeCreatorMonthlyPriceId.value());
  if (!priceId) {
    throw new HttpsError('failed-precondition', 'User pricing is not configured.');
  }
  return priceId;
}

function userPricingPlanForPriceId(priceId: string | null | undefined): { plan: UserPricingPlanKey; billingCycle: UserPricingBillingCycle } | null {
  if (!priceId) {
    return null;
  }
  const entries: Array<[UserPricingPlanKey, UserPricingBillingCycle, string]> = [
    ['personal_plus', 'monthly', stripePersonalPlusMonthlyPriceId.value()],
    ['personal_plus', 'annual', stripePersonalPlusAnnualPriceId.value()],
    ['creator', 'monthly', stripeCreatorMonthlyPriceId.value()],
    ['creator', 'annual', stripeCreatorAnnualPriceId.value()],
  ];
  const match = entries.find(([, , configuredPriceId]) => configuredPriceId && configuredPriceId === priceId);
  return match ? { plan: match[0], billingCycle: match[1] } : null;
}

function firstSubscriptionPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price?.id ?? null;
}

function resolveCheckoutUrl(value: unknown, fallbackPath: string, requestOrigin?: string): string {
  const fallbackOrigin = requestOrigin && allowedCheckoutOrigins.has(requestOrigin) ? requestOrigin : publicAppUrl;
  const rawUrl = typeof value === 'string' && value.trim()
    ? value.trim()
    : `${fallbackOrigin}${fallbackPath}`;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new HttpsError('invalid-argument', 'Checkout return URL is invalid.');
  }

  const origin = `${parsed.protocol}//${parsed.host}`;
  if (!allowedCheckoutOrigins.has(origin)) {
    throw new HttpsError('invalid-argument', 'Checkout return URL is not allowed.');
  }

  return parsed.toString();
}

async function markBusinessCheckoutPaid(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId?.trim();
  const claimKey = session.metadata?.claimKey?.trim();
  const plan = normalizeBusinessCheckoutPlan(session.metadata?.planType);
  if (!userId || !claimKey || !plan) {
    throw new HttpsError('invalid-argument', 'Checkout session is missing business claim metadata.');
  }

  const paid = session.payment_status === 'paid' || session.status === 'complete';
  if (!paid) {
    throw new HttpsError('failed-precondition', 'Checkout has not completed yet.');
  }

  const update = {
    owner_user_id: userId,
    business_plan: plan,
    business_paid: true,
    business_documents_enabled: true,
    payment_status: 'paid',
    stripe_checkout_session_id: session.id,
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
    stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : null,
    paid_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  const requestRef = db.collection('business_claim_requests').doc(claimKey);
  const claimRef = db.collection('business_claims').doc(claimKey);
  const claimSnapshot = await claimRef.get();
  await requestRef.set(update, { merge: true });
  if (claimSnapshot.exists) {
    await claimRef.set(update, { merge: true });
  }
}

async function markUserCheckoutPaid(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId?.trim();
  const plan = normalizeUserPricingPlan(session.metadata?.planType);
  const billingCycle = normalizeUserPricingBillingCycle(session.metadata?.billingCycle);
  const priceId = session.metadata?.priceId?.trim() || null;
  if (!userId || !plan || !billingCycle) {
    throw new HttpsError('invalid-argument', 'Checkout session is missing user pricing metadata.');
  }

  const paid = session.payment_status === 'paid' || session.status === 'complete';
  if (!paid) {
    throw new HttpsError('failed-precondition', 'Checkout has not completed yet.');
  }

  await db.collection('users').doc(userId).set({
    pricingPlan: plan,
    pricing_plan: plan,
    pricingPlanLabel: userPricingPlanLabels[plan],
    pricing_plan_label: userPricingPlanLabels[plan],
    billingCycle,
    billing_cycle: billingCycle,
    subscriptionStatus: 'paid',
    subscription_status: 'paid',
    userBillingActive: true,
    user_billing_active: true,
    stripeCheckoutSessionId: session.id,
    stripe_checkout_session_id: session.id,
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
    stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
    stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : null,
    stripePriceId: priceId,
    stripe_price_id: priceId,
    paidAt: FieldValue.serverTimestamp(),
    paid_at: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function markMembershipCheckoutPaid(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId?.trim();
  const planKey = normalizeMembershipCheckoutPlan(session.metadata?.planType);
  if (!userId || !planKey) {
    throw new HttpsError('invalid-argument', 'Checkout session is missing membership metadata.');
  }

  const paid = session.payment_status === 'paid' || session.status === 'complete';
  if (!paid) {
    throw new HttpsError('failed-precondition', 'Checkout has not completed yet.');
  }

  const plan = membershipCheckoutPlans[planKey];
  await db.collection('users').doc(userId).set({
    pricingPlan: planKey,
    pricing_plan: planKey,
    pricingPlanLabel: plan.name,
    pricing_plan_label: plan.name,
    billingCycle: plan.billingCycle,
    billing_cycle: plan.billingCycle,
    subscriptionStatus: 'paid',
    subscription_status: 'paid',
    userBillingActive: true,
    user_billing_active: true,
    launchMember: true,
    launch_member: true,
    foundingMember: true,
    founding_member: true,
    stripeCheckoutSessionId: session.id,
    stripe_checkout_session_id: session.id,
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
    stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
    stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : null,
    paidAt: FieldValue.serverTimestamp(),
    paid_at: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function updateBusinessRecordsForSubscription(
  subscriptionId: string,
  update: Record<string, unknown>,
): Promise<void> {
  if (!subscriptionId) {
    return;
  }

  const snapshot = await db.collection('business_claim_requests')
    .where('stripe_subscription_id', '==', subscriptionId)
    .limit(10)
    .get();

  await Promise.all(snapshot.docs.map(async (requestDoc) => {
    const claimKey = requestDoc.id;
    const claimRef = db.collection('business_claims').doc(claimKey);
    const claimSnapshot = await claimRef.get();
    await requestDoc.ref.set(update, { merge: true });
    if (claimSnapshot.exists) {
      await claimRef.set(update, { merge: true });
    }
  }));
}

async function updateUserRecordsForSubscription(
  subscriptionId: string,
  update: Record<string, unknown>,
): Promise<void> {
  if (!subscriptionId) {
    return;
  }

  const [snakeSnapshot, camelSnapshot] = await Promise.all([
    db.collection('users')
      .where('stripe_subscription_id', '==', subscriptionId)
      .limit(10)
      .get(),
    db.collection('users')
      .where('stripeSubscriptionId', '==', subscriptionId)
      .limit(10)
      .get(),
  ]);

  const docs = new Map<string, DocumentReference>();
  for (const userDoc of [...snakeSnapshot.docs, ...camelSnapshot.docs]) {
    docs.set(userDoc.id, userDoc.ref);
  }

  await Promise.all([...docs.values()].map((userRef) => userRef.set(update, { merge: true })));
}

function subscriptionAccessEnabled(status: unknown): boolean {
  return status === 'active' || status === 'trialing';
}

function getSubscriptionUpdate(subscription: Stripe.Subscription): Record<string, unknown> {
  const subscriptionRecord = subscription as Stripe.Subscription & {
    current_period_end?: number | null;
    cancel_at_period_end?: boolean | null;
  };
  const enabled = subscriptionAccessEnabled(subscription.status);
  return {
    business_paid: enabled,
    business_documents_enabled: enabled,
    payment_status: enabled ? 'paid' : subscription.status,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    subscription_cancel_at_period_end: subscriptionRecord.cancel_at_period_end === true,
    subscription_current_period_end: typeof subscriptionRecord.current_period_end === 'number'
      ? new Date(subscriptionRecord.current_period_end * 1000)
      : null,
    updated_at: FieldValue.serverTimestamp(),
  };
}

function getUserSubscriptionUpdate(subscription: Stripe.Subscription): Record<string, unknown> {
  const subscriptionRecord = subscription as Stripe.Subscription & {
    current_period_end?: number | null;
    cancel_at_period_end?: boolean | null;
  };
  const enabled = subscriptionAccessEnabled(subscription.status);
  const priceId = firstSubscriptionPriceId(subscription);
  const mappedPlan = userPricingPlanForPriceId(priceId);
  const update: Record<string, unknown> = {
    subscriptionStatus: subscription.status,
    subscription_status: subscription.status,
    userBillingActive: enabled,
    user_billing_active: enabled,
    stripeSubscriptionId: subscription.id,
    stripe_subscription_id: subscription.id,
    stripePriceId: priceId,
    stripe_price_id: priceId,
    subscriptionCancelAtPeriodEnd: subscriptionRecord.cancel_at_period_end === true,
    subscription_cancel_at_period_end: subscriptionRecord.cancel_at_period_end === true,
    subscriptionCurrentPeriodEnd: typeof subscriptionRecord.current_period_end === 'number'
      ? new Date(subscriptionRecord.current_period_end * 1000)
      : null,
    subscription_current_period_end: typeof subscriptionRecord.current_period_end === 'number'
      ? new Date(subscriptionRecord.current_period_end * 1000)
      : null,
    updatedAt: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  if (mappedPlan) {
    update.pricingPlan = mappedPlan.plan;
    update.pricing_plan = mappedPlan.plan;
    update.pricingPlanLabel = userPricingPlanLabels[mappedPlan.plan];
    update.pricing_plan_label = userPricingPlanLabels[mappedPlan.plan];
    update.billingCycle = mappedPlan.billingCycle;
    update.billing_cycle = mappedPlan.billingCycle;
  }

  return update;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const invoiceRecord = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
    parent?: {
      subscription_details?: {
        subscription?: string | Stripe.Subscription | null;
      } | null;
    } | null;
  };
  const subscription = invoiceRecord.subscription ?? invoiceRecord.parent?.subscription_details?.subscription;
  if (typeof subscription === 'string') {
    return subscription;
  }
  if (subscription && typeof subscription === 'object' && 'id' in subscription && typeof subscription.id === 'string') {
    return subscription.id;
  }
  return null;
}

export const createBusinessCheckoutSession = onCall(
  { region: callableRegion, cors: true, secrets: [stripeSecretKey] },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to start business checkout.');
    }

    const planKey = normalizeBusinessCheckoutPlan(request.data?.plan);
    if (!planKey) {
      throw new HttpsError('invalid-argument', 'Choose a paid business plan.');
    }

    const claimKey = typeof request.data?.claimKey === 'string' ? request.data.claimKey.trim() : '';
    if (!claimKey) {
      throw new HttpsError('invalid-argument', 'Business claim key is required.');
    }

    const businessName = typeof request.data?.businessName === 'string' && request.data.businessName.trim()
      ? request.data.businessName.trim()
      : 'Business';
    const citySlug = typeof request.data?.citySlug === 'string' ? request.data.citySlug.trim() : '';
    const originHeader = request.rawRequest.headers.origin;
    const requestOrigin = typeof originHeader === 'string' ? originHeader : undefined;
    const successUrl = resolveCheckoutUrl(request.data?.successUrl, '/business/claim?businessPayment=success', requestOrigin);
    const cancelUrl = resolveCheckoutUrl(request.data?.cancelUrl, '/business/claim?businessPayment=cancelled', requestOrigin);
    const plan = businessCheckoutPlans[planKey];
    const customerEmail = typeof request.auth?.token.email === 'string' ? request.auth.token.email : undefined;

    try {
      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: plan.name,
                description: plan.description,
              },
              recurring: { interval: 'month' },
              unit_amount: plan.amount,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: claimKey,
        metadata: {
          source: 'business_claim',
          userId,
          claimKey,
          businessName,
          citySlug,
          planType: planKey,
        },
        customer_email: customerEmail,
      });

      await db.collection('business_claim_requests').doc(claimKey).set({
        claim_key: claimKey,
        owner_user_id: userId,
        business_name: businessName,
        city_slug: citySlug,
        business_plan: planKey,
        business_documents_enabled: false,
        payment_status: 'checkout_started',
        stripe_checkout_session_id: session.id,
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { sessionId: session.id, url: session.url ?? null };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('Failed to create business checkout session', error);
      throw new HttpsError('internal', 'Checkout could not be started. Please try again.');
    }
  },
);

export const createUserCheckoutSession = onCall(
  { region: callableRegion, cors: true, secrets: [stripeSecretKey] },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to start checkout.');
    }

    const plan = normalizeUserPricingPlan(request.data?.plan);
    const billingCycle = normalizeUserPricingBillingCycle(request.data?.billingCycle);
    if (!plan || !billingCycle) {
      throw new HttpsError('invalid-argument', 'Choose a paid personal plan.');
    }

    const originHeader = request.rawRequest.headers.origin;
    const requestOrigin = typeof originHeader === 'string' ? originHeader : undefined;
    const successUrl = resolveCheckoutUrl(request.data?.successUrl, '/pricing?pricingPayment=success', requestOrigin);
    const cancelUrl = resolveCheckoutUrl(request.data?.cancelUrl, '/pricing?pricingPayment=cancelled', requestOrigin);
    const customerEmail = typeof request.auth?.token.email === 'string' ? request.auth.token.email : undefined;
    const priceId = getUserPricingPriceId(plan, billingCycle);

    try {
      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        allow_promotion_codes: true,
        metadata: {
          source: 'user_pricing',
          userId,
          planType: plan,
          billingCycle,
          priceId,
        },
        customer_email: customerEmail,
      });

      await db.collection('users').doc(userId).set({
        pricingPlan: plan,
        pricing_plan: plan,
        pricingPlanLabel: userPricingPlanLabels[plan],
        pricing_plan_label: userPricingPlanLabels[plan],
        billingCycle,
        billing_cycle: billingCycle,
        subscriptionStatus: 'checkout_started',
        subscription_status: 'checkout_started',
        userBillingActive: false,
        user_billing_active: false,
        stripeCheckoutSessionId: session.id,
        stripe_checkout_session_id: session.id,
        stripePriceId: priceId,
        stripe_price_id: priceId,
        updatedAt: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { sessionId: session.id, url: session.url ?? null };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('Failed to create user checkout session', error);
      throw new HttpsError('internal', 'Checkout could not be started. Please try again.');
    }
  },
);

export const createMembershipCheckoutSession = onCall(
  { region: callableRegion, cors: true, secrets: [stripeSecretKey] },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to start membership checkout.');
    }

    const planKey = normalizeMembershipCheckoutPlan(request.data?.plan);
    if (!planKey) {
      throw new HttpsError('invalid-argument', 'Choose a Launch Membership.');
    }

    const originHeader = request.rawRequest.headers.origin;
    const requestOrigin = typeof originHeader === 'string' ? originHeader : undefined;
    const successUrl = resolveCheckoutUrl(
      request.data?.successUrl,
      `/membership?membershipPayment=success&plan=${planKey}`,
      requestOrigin,
    );
    const cancelUrl = resolveCheckoutUrl(
      request.data?.cancelUrl,
      `/membership?membershipPayment=cancelled&plan=${planKey}`,
      requestOrigin,
    );
    const customerEmail = typeof request.auth?.token.email === 'string'
      ? request.auth.token.email
      : undefined;
    const plan = membershipCheckoutPlans[planKey];

    try {
      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.create({
        mode: plan.mode,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: plan.name,
                description: plan.description,
              },
              unit_amount: plan.amount,
              ...(plan.mode === 'subscription'
                ? { recurring: { interval: 'month' as const } }
                : {}),
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        allow_promotion_codes: true,
        customer_creation: plan.mode === 'payment' ? 'always' : undefined,
        metadata: {
          source: 'membership_launch',
          userId,
          planType: planKey,
          billingCycle: plan.billingCycle,
          amount: String(plan.amount),
        },
        customer_email: customerEmail,
      });

      await db.collection('users').doc(userId).set({
        pricingPlan: planKey,
        pricing_plan: planKey,
        pricingPlanLabel: plan.name,
        pricing_plan_label: plan.name,
        billingCycle: plan.billingCycle,
        billing_cycle: plan.billingCycle,
        subscriptionStatus: 'checkout_started',
        subscription_status: 'checkout_started',
        userBillingActive: false,
        user_billing_active: false,
        stripeCheckoutSessionId: session.id,
        stripe_checkout_session_id: session.id,
        updatedAt: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { sessionId: session.id, url: session.url ?? null };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('Failed to create membership checkout session', error);
      throw new HttpsError('internal', 'Membership checkout could not be started. Please try again.');
    }
  },
);

export const confirmUserCheckoutSession = onCall(
  { region: callableRegion, cors: true, secrets: [stripeSecretKey] },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to confirm checkout.');
    }

    const sessionId = typeof request.data?.sessionId === 'string' ? request.data.sessionId.trim() : '';
    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'Checkout session ID is required.');
    }

    try {
      const session = await getStripeClient().checkout.sessions.retrieve(sessionId);
      if (session.metadata?.source !== 'user_pricing' || session.metadata?.userId !== userId) {
        throw new HttpsError('permission-denied', 'This checkout session does not belong to your account.');
      }
      await markUserCheckoutPaid(session);
      return {
        paid: true,
        plan: normalizeUserPricingPlan(session.metadata?.planType),
        billingCycle: normalizeUserPricingBillingCycle(session.metadata?.billingCycle),
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('Failed to confirm user checkout session', error);
      throw new HttpsError('internal', 'Checkout could not be confirmed. Please try again.');
    }
  },
);

export const confirmMembershipCheckoutSession = onCall(
  { region: callableRegion, cors: true, secrets: [stripeSecretKey] },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to confirm membership checkout.');
    }

    const sessionId = typeof request.data?.sessionId === 'string'
      ? request.data.sessionId.trim()
      : '';
    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'Checkout session ID is required.');
    }

    try {
      const session = await getStripeClient().checkout.sessions.retrieve(sessionId);
      if (session.metadata?.source !== 'membership_launch' || session.metadata?.userId !== userId) {
        throw new HttpsError('permission-denied', 'This checkout session does not belong to your account.');
      }
      await markMembershipCheckoutPaid(session);
      return {
        paid: true,
        plan: normalizeMembershipCheckoutPlan(session.metadata?.planType),
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('Failed to confirm membership checkout session', error);
      throw new HttpsError('internal', 'Membership checkout could not be confirmed. Please try again.');
    }
  },
);

export const confirmBusinessCheckoutSession = onCall(
  { region: callableRegion, cors: true, secrets: [stripeSecretKey] },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to confirm business checkout.');
    }

    const sessionId = typeof request.data?.sessionId === 'string' ? request.data.sessionId.trim() : '';
    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'Checkout session ID is required.');
    }

    try {
      const session = await getStripeClient().checkout.sessions.retrieve(sessionId);
      if (session.metadata?.source !== 'business_claim' || session.metadata?.userId !== userId) {
        throw new HttpsError('permission-denied', 'This checkout session does not belong to your account.');
      }
      await markBusinessCheckoutPaid(session);
      return {
        paid: true,
        plan: normalizeBusinessCheckoutPlan(session.metadata?.planType),
        claimKey: session.metadata?.claimKey ?? null,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('Failed to confirm business checkout session', error);
      throw new HttpsError('internal', 'Checkout could not be confirmed. Please try again.');
    }
  },
);

export const stripeBusinessWebhook = onRequest(
  { region: callableRegion, secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).send('Method Not Allowed');
      return;
    }

    const signature = request.headers['stripe-signature'];
    if (!signature) {
      response.status(400).send('Missing Stripe signature.');
      return;
    }

    let event: Stripe.Event;
    try {
      const rawBody = (request as unknown as { rawBody?: Buffer | string }).rawBody ?? request.body;
      event = getStripeClient().webhooks.constructEvent(rawBody, signature as string, stripeWebhookSecret.value());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown verification error';
      logger.warn('Business Stripe webhook signature verification failed', message);
      response.status(400).send(`Webhook Error: ${message}`);
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.metadata?.source === 'business_claim') {
            await markBusinessCheckoutPaid(session);
          } else if (session.metadata?.source === 'user_pricing') {
            await markUserCheckoutPaid(session);
          } else if (session.metadata?.source === 'membership_launch') {
            await markMembershipCheckoutPaid(session);
          }
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          await Promise.all([
            updateBusinessRecordsForSubscription(subscription.id, getSubscriptionUpdate(subscription)),
            updateUserRecordsForSubscription(subscription.id, getUserSubscriptionUpdate(subscription)),
          ]);
          break;
        }
        case 'invoice.paid':
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionId = getInvoiceSubscriptionId(invoice);
          await Promise.all([
            updateBusinessRecordsForSubscription(subscriptionId ?? '', {
              business_paid: true,
              business_documents_enabled: true,
              payment_status: 'paid',
              latest_invoice_id: invoice.id,
              last_payment_at: FieldValue.serverTimestamp(),
              updated_at: FieldValue.serverTimestamp(),
            }),
            updateUserRecordsForSubscription(subscriptionId ?? '', {
              subscriptionStatus: 'paid',
              subscription_status: 'paid',
              userBillingActive: true,
              user_billing_active: true,
              latestInvoiceId: invoice.id,
              latest_invoice_id: invoice.id,
              lastPaymentAt: FieldValue.serverTimestamp(),
              last_payment_at: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              updated_at: FieldValue.serverTimestamp(),
            }),
          ]);
          break;
        }
        case 'invoice.payment_failed':
        case 'invoice.payment_action_required': {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionId = getInvoiceSubscriptionId(invoice);
          const paymentStatus = event.type === 'invoice.payment_action_required' ? 'payment_action_required' : 'payment_failed';
          await Promise.all([
            updateBusinessRecordsForSubscription(subscriptionId ?? '', {
              business_paid: false,
              business_documents_enabled: false,
              payment_status: paymentStatus,
              latest_invoice_id: invoice.id,
              updated_at: FieldValue.serverTimestamp(),
            }),
            updateUserRecordsForSubscription(subscriptionId ?? '', {
              subscriptionStatus: paymentStatus,
              subscription_status: paymentStatus,
              userBillingActive: false,
              user_billing_active: false,
              latestInvoiceId: invoice.id,
              latest_invoice_id: invoice.id,
              updatedAt: FieldValue.serverTimestamp(),
              updated_at: FieldValue.serverTimestamp(),
            }),
          ]);
          break;
        }
        default:
          break;
      }
      response.sendStatus(200);
    } catch (error) {
      logger.error('Failed to process business Stripe webhook', error);
      response.status(500).send('Business checkout update failed.');
    }
  },
);

type AtlasTextMessagingProvider = 'twilio' | 'vapi';

type AtlasTextMessagingConfig = {
  enabled: boolean;
  provider: AtlasTextMessagingProvider;
  phone_number: string | null;
  vapi_phone_number_id: string | null;
  webhook_token: string;
  updated_at?: unknown;
};

type AtlasVoiceAgentConfig = {
  enabled: boolean;
  phone_number: string | null;
  vapi_phone_number_id: string | null;
  vapi_assistant_id: string | null;
  webhook_token: string;
  updated_at?: unknown;
};

type ElevenLabsVoicePreference = {
  languageCode: string | null;
  language: string | null;
  country: string | null;
  accent: string | null;
};

type ElevenLabsResolvedVoice = {
  voiceId: string;
  name: string;
  accent: string | null;
  score: number;
};

type ElevenLabsVoiceCacheEntry = {
  preferenceKey: string;
  voice: ElevenLabsResolvedVoice | null;
  cachedAt: number;
};

type ElevenLabsVoiceRecord = {
  voice_id?: unknown;
  name?: unknown;
  category?: unknown;
  description?: unknown;
  labels?: unknown;
  verified_languages?: unknown;
};

type ElevenLabsVerifiedLanguage = {
  language?: unknown;
  accent?: unknown;
  locale?: unknown;
};

type VapiToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

type HttpRequestLike = {
  body?: unknown;
  rawBody?: Buffer;
};

type HttpResponseLike = {
  status(code: number): HttpResponseLike;
  set(field: string, value: string): HttpResponseLike;
  send(body: unknown): void;
};

export const fetchProxy = onRequest(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '1GiB',
  },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).send('Method not allowed.');
      return;
    }

    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl) {
      res.status(400).send('Missing url param.');
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(rawUrl);
    } catch {
      res.status(400).send('Invalid url param.');
      return;
    }

    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      res.status(400).send('Only http and https URLs are allowed.');
      return;
    }

    try {
      const fetched = await fetchHtmlWithFallback(targetUrl.toString(), {
        timeoutMs: 90_000,
      });
      const blockedByAntiBot = looksLikeAntiBotChallenge(fetched.html);

      if (fetched.status >= 400 || blockedByAntiBot) {
        const upstreamStatus = fetched.status || 0;
        const message = blockedByAntiBot
          ? `The source site blocked server-side scraping with an anti-bot challenge. Try a less-protected source such as an RSS feed, a public archive page, or an individual article URL.`
          : `The source site responded with ${upstreamStatus}.`;

        logger.warn('fetchProxy upstream blocked or failed', {
          url: targetUrl.toString(),
          upstreamStatus,
          blockedByAntiBot,
        });

        res.status(blockedByAntiBot ? 422 : upstreamStatus);
        res.set('Content-Type', 'application/json; charset=utf-8');
        res.send({
          code: blockedByAntiBot ? 'site-blocked-bot-challenge' : 'upstream-fetch-failed',
          message,
          upstreamStatus,
          targetHost: targetUrl.hostname,
        });
        return;
      }

      res.status(200);
      res.set(
        'Content-Type',
        fetched.contentType && fetched.contentType.includes('text/html')
          ? fetched.contentType
          : 'text/html; charset=utf-8',
      );
      res.send(fetched.html);
    } catch (error) {
      logger.error('fetchProxy failed', {
        url: targetUrl.toString(),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      res.status(500).send('Fetch failed.');
    }
  },
);

async function countPublicAtlasCollection(collectionName: string, userId: string, atlasId: string): Promise<number> {
  const snapshot = await db
    .collection(collectionName)
    .where('user_id', '==', userId)
    .where('atlas_id', '==', atlasId)
    .count()
    .get();
  return snapshot.data().count;
}

function normalizeTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

function timestampToMillis(value: unknown): number | null {
  if (!value) {
    return null;
  }
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate().getTime();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  return null;
}

function normalizeGoogleDriveSelections(value: unknown): GoogleDriveImportSelection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = typeof entry === 'object' && entry ? (entry as Record<string, unknown>) : null;
      if (!record) {
        return null;
      }

      const id = String(record['id'] ?? '').trim();
      const name = String(record['name'] ?? '').trim();
      const mimeType = String(record['mimeType'] ?? '').trim();
      const sizeValue = Number(record['size']);
      const size = Number.isFinite(sizeValue) ? sizeValue : null;

      if (!id || !name || !mimeType) {
        return null;
      }

      return { id, name, mimeType, size };
    })
    .filter((entry): entry is GoogleDriveImportSelection => entry !== null)
    .slice(0, maxGoogleDriveImportFiles);
}

function deriveGoogleDriveFilename(name: string, extension: string): string {
  const trimmed = name.trim();
  const suffix = `.${extension}`;
  if (trimmed.toLowerCase().endsWith(suffix.toLowerCase())) {
    return trimmed;
  }

  return `${trimmed}${suffix}`;
}

function deriveGoogleDriveUploadName(metadata: GoogleDriveFileMetadata): string {
  const lowerName = metadata.name.trim().toLowerCase();

  if (metadata.mimeType === 'application/pdf') {
    return deriveGoogleDriveFilename(metadata.name, 'pdf');
  }
  if (metadata.mimeType === 'application/msword') {
    return deriveGoogleDriveFilename(metadata.name, 'doc');
  }
  if (metadata.mimeType === 'application/vnd.ms-powerpoint') {
    return deriveGoogleDriveFilename(metadata.name, 'ppt');
  }
  if (metadata.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return deriveGoogleDriveFilename(metadata.name, 'docx');
  }
  if (metadata.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return deriveGoogleDriveFilename(metadata.name, 'pptx');
  }
  if (metadata.mimeType === 'text/plain') {
    return lowerName.endsWith('.md')
      ? deriveGoogleDriveFilename(metadata.name, 'md')
      : deriveGoogleDriveFilename(metadata.name, 'txt');
  }
  if (metadata.mimeType === 'text/markdown') {
    return deriveGoogleDriveFilename(metadata.name, 'md');
  }
  if (metadata.mimeType === 'image/png') {
    return deriveGoogleDriveFilename(metadata.name, 'png');
  }
  if (metadata.mimeType === 'image/jpeg') {
    return deriveGoogleDriveFilename(metadata.name, lowerName.endsWith('.jpeg') ? 'jpeg' : 'jpg');
  }

  return metadata.name.trim();
}

function resolveGoogleDriveImportPlan(metadata: GoogleDriveFileMetadata): GoogleDriveImportPlan {
  const normalizedName = metadata.name.trim();
  const title = normalizedName || 'Untitled document';

  switch (metadata.mimeType) {
    case 'application/vnd.google-apps.document':
      return {
        fileType: 'docx',
        filename: deriveGoogleDriveFilename(title, 'docx'),
        title,
        requestMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploadMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        mode: 'export',
      };
    case 'application/vnd.google-apps.presentation':
      return {
        fileType: 'pptx',
        filename: deriveGoogleDriveFilename(title, 'pptx'),
        title,
        requestMimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        uploadMimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        mode: 'export',
      };
    case 'application/vnd.google-apps.spreadsheet':
      return {
        fileType: 'pdf',
        filename: deriveGoogleDriveFilename(title, 'pdf'),
        title,
        requestMimeType: 'application/pdf',
        uploadMimeType: 'application/pdf',
        mode: 'export',
      };
    default: {
      const filename = deriveGoogleDriveUploadName(metadata);
      const fileType = detectFileType(filename, metadata.mimeType);
      return {
        fileType,
        filename,
        title,
        requestMimeType: metadata.mimeType,
        uploadMimeType: metadata.mimeType,
        mode: 'download',
      };
    }
  }
}

async function fetchGoogleDriveMetadata(
  accessToken: string,
  fileId: string,
): Promise<GoogleDriveFileMetadata> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size&supportsAllDrives=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to read Google Drive metadata (${response.status}): ${body.slice(0, 240)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const name = String(data['name'] ?? '').trim();
  const mimeType = String(data['mimeType'] ?? '').trim();
  const id = String(data['id'] ?? fileId).trim();
  const sizeValue = Number(data['size']);

  if (!id || !name || !mimeType) {
    throw new Error('Google Drive file metadata was incomplete.');
  }

  return {
    id,
    name,
    mimeType,
    size: Number.isFinite(sizeValue) ? sizeValue : null,
  };
}

async function fetchGoogleDriveFileBuffer(params: {
  accessToken: string;
  fileId: string;
  plan: GoogleDriveImportPlan;
}): Promise<Buffer> {
  const endpoint =
    params.plan.mode === 'export'
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.fileId)}/export?mimeType=${encodeURIComponent(params.plan.requestMimeType)}`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.fileId)}?alt=media&supportsAllDrives=true`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to download Google Drive file (${response.status}): ${body.slice(0, 240)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

type StaleUrlDocumentCandidate = FirebaseFirestore.QueryDocumentSnapshot;

async function collectStaleUrlDocuments(params: {
  userId: string | null;
  atlasId: string | null;
  staleMinutes: number;
  limit: number;
}): Promise<StaleUrlDocumentCandidate[]> {
  const cutoffMs = Date.now() - params.staleMinutes * 60_000;
  const staleDocs = new Map<string, StaleUrlDocumentCandidate>();

  for (const status of ['processing', 'pending'] as const) {
    let query = db.collection('documents').where('status', '==', status).limit(1000);
    if (params.userId) {
      query = query.where('user_id', '==', params.userId);
    }
    if (params.atlasId) {
      query = query.where('atlas_id', '==', params.atlasId);
    }

    const snapshot = await query.get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.source_type !== 'url') {
        continue;
      }

      const heartbeatMs = timestampToMillis(data.last_heartbeat_at);
      if (heartbeatMs === null || heartbeatMs >= cutoffMs) {
        continue;
      }

      staleDocs.set(doc.id, doc);
      if (staleDocs.size >= params.limit) {
        return Array.from(staleDocs.values());
      }
    }
  }

  return Array.from(staleDocs.values());
}

async function requeueStaleUrlDocuments(
  staleDocuments: StaleUrlDocumentCandidate[],
): Promise<void> {
  for (const doc of staleDocuments) {
    await doc.ref.set(
      {
        status: 'failed',
        processing_stage: 'failed',
        error_message: 'Retrying stale ingestion request.',
        failure_code: 'retrying_stale_ingestion',
        last_heartbeat_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await doc.ref.set(
      {
        status: 'pending',
        processing_stage: 'queued',
        processed_chunks: 0,
        total_chunks: 0,
        error_message: null,
        failure_code: null,
        last_heartbeat_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

type PublicDocumentCandidate = Record<string, unknown> & { id: string };

type WikipediaSearchResponse = {
  query?: {
    search?: Array<{
      pageid?: number;
      title?: string;
    }>;
  };
};

type WikipediaPageImagesResponse = {
  query?: {
    pages?: Record<string, {
      pageid?: number;
      title?: string;
      fullurl?: string;
      original?: { source?: string };
      thumbnail?: { source?: string };
    }>;
  };
};

type WikipediaBatchPageImagesResponse = {
  query?: {
    normalized?: Array<{ from?: string; to?: string }>;
    redirects?: Array<{ from?: string; to?: string }>;
    pages?: Record<string, {
      pageid?: number;
      title?: string;
      original?: { source?: string };
      thumbnail?: { source?: string };
      terms?: { description?: string[] };
    }>;
  };
};

type WikipediaPageSummaryResponse = {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source?: string; width?: number; height?: number };
  originalimage?: { source?: string; width?: number; height?: number };
};

type WikipediaPageMediaResponse = {
  query?: {
    pages?: Record<string, {
      pageid?: number;
      title?: string;
      images?: Array<{
        ns?: number;
        title?: string;
      }>;
    }>;
  };
};

type GoogleCustomSearchImageResponse = {
  items?: Array<{
    title?: string;
    link?: string;
    mime?: string;
    displayLink?: string;
    snippet?: string;
    image?: {
      contextLink?: string;
      thumbnailLink?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type BoardCardImageSearchResult = {
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  sourceLabel: string;
  title: string;
  token: string;
};

type WikimediaCommonsImageSearchResponse = {
  query?: {
    pages?: Record<string, {
      title?: string;
      imageinfo?: Array<{
        url?: string;
        thumburl?: string;
        descriptionurl?: string;
        mime?: string;
        extmetadata?: {
          LicenseShortName?: { value?: string };
        };
      }>;
    }>;
  };
  error?: {
    info?: string;
  };
};

type GoogleCustomSearchWebResponse = {
  items?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
  error?: {
    message?: string;
  };
};

type YouTubeSearchResponse = {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
  }>;
  error?: { message?: string };
};

type YouTubeVideosResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    status?: { embeddable?: boolean; privacyStatus?: string };
    contentDetails?: { duration?: string };
  }>;
  error?: { message?: string };
};

type YouTubeOEmbedResponse = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

type AppleMusicSearchResponse = {
  results?: Array<{
    wrapperType?: string;
    kind?: string;
    artistName?: string;
    trackName?: string;
    collectionName?: string;
    artworkUrl100?: string;
    artworkUrl600?: string;
    previewUrl?: string;
  }>;
};

type AppleMusicMediaScore = {
  artwork: string;
  audioPreviewUrl: string;
  score: number;
};

type DeezerTrackSearchResponse = {
  data?: Array<{
    id?: number;
    readable?: boolean;
    title?: string;
    title_short?: string;
    title_version?: string;
    isrc?: string;
    link?: string;
    preview?: string;
    rank?: number;
    artist?: {
      name?: string;
    };
    album?: {
      title?: string;
      cover_xl?: string;
      cover_big?: string;
      cover_medium?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type SpotifyTrackMatch = {
  id: string;
  trackUrl: string;
  uri: string;
  artistName: string;
  albumName: string;
  artworkUrl: string;
};

type SpotifySearchResponse = {
  tracks?: {
    items?: Array<{
      id?: string;
      name?: string;
      uri?: string;
      external_urls?: {
        spotify?: string;
      };
      artists?: Array<{
        name?: string;
      }>;
      album?: {
        name?: string;
        images?: Array<{
          url?: string;
          width?: number;
          height?: number;
        }>;
      };
    }>;
  };
  error?: {
    message?: string;
  };
};

type SpotifyTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

let spotifyAccessTokenCache: { token: string; expiresAt: number } | null = null;
let googleCustomSearchUnavailableUntil = 0;
let youtubeDataApiSearchUnavailableUntil = 0;
let youtubeDataApiSearchUnavailableReason = '';
const youtubeBlockedEmbedUntil = new Map<string, number>();

const BOARD_VIDEO_LOOKUP_BUDGET_MS = 42_000;
const BOARD_VIDEO_DEADLINE_BUFFER_MS = 1_500;
const BOARD_VIDEO_BLOCKED_MEMORY_MS = 24 * 60 * 60 * 1000;

type WikimediaCommonsImageResponse = {
  query?: {
    pages?: Record<string, {
      pageid?: number;
      title?: string;
      imageinfo?: Array<{
        url?: string;
        thumburl?: string;
        mime?: string;
        size?: number;
      }>;
    }>;
  };
};

type CoverImageCandidate = {
  imageUrl: string;
  pageTitle: string;
  pageUrl: string;
  source: 'wikipedia' | 'wikimedia-commons';
};

type AutomatedCoverResult = {
  atlasId: string;
  heroUrl: string;
  sourceUrl: string;
  pageTitle: string;
  contentType: string;
  bytes: number;
};

async function serializePublicAtlas(
  atlasId: string,
  atlas: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return {
    id: atlasId,
    ...atlas,
    public_voice_phone_number: await loadPublicVoicePhoneNumber(atlasId),
    created_at: normalizeTimestamp(atlas.created_at),
    updated_at: normalizeTimestamp(atlas.updated_at),
  };
}

async function loadPublicVoicePhoneNumber(atlasId: string): Promise<string | null> {
  try {
    const integrationSnapshot = await db.collection('atlas_integrations').doc(atlasId).get();
    const config = voiceAgentConfigFromStored(integrationSnapshot.data()?.voice_agent);
    if (!config?.enabled) {
      return null;
    }
    return config.phone_number;
  } catch (error) {
    logger.warn('Failed to load public voice phone number.', {
      atlasId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function buildDocumentDownloadUrl(storagePath: string): Promise<string> {
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  const [metadata] = await file.getMetadata();
  const existingTokens = String(metadata.metadata?.firebaseStorageDownloadTokens ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const token = existingTokens[0] ?? randomUUID();

  if (existingTokens.length === 0) {
    await file.setMetadata({
      metadata: {
        ...(metadata.metadata ?? {}),
        firebaseStorageDownloadTokens: token,
      },
    });
  }

  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

function textFromUnknown(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'cover';
}

function imageExtensionForContentType(contentType: string): string | null {
  const normalized = contentType.toLowerCase().split(';')[0]?.trim();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  return null;
}

let wikimediaFetchQueue: Promise<void> = Promise.resolve();
const wikipediaImageCache = new Map<string, { imageUrl: string; expiresAt: number }>();
const WIKIPEDIA_IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WIKIPEDIA_IMAGE_CACHE_MAX_ENTRIES = 1200;

async function fetchJson<T>(url: string): Promise<T> {
  const hostname = new URL(url).hostname.toLowerCase();
  const isWikimedia = hostname === 'en.wikipedia.org'
    || hostname === 'commons.wikimedia.org'
    || hostname === 'www.wikidata.org';
  const retries = isWikimedia ? 2 : 0;

  const execute = async (): Promise<T> => {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'LivingWikiBot/1.0 (https://livingwiki.com) board-image-resolution',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        return await response.json() as T;
      }

      const retryable = [429, 502, 503, 504].includes(response.status);
      if (!retryable || attempt >= retries) {
        throw new Error(`Request failed with ${response.status}.`);
      }

      const retryAfterSeconds = Number(response.headers.get('retry-after'));
      const retryDelayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(5000, retryAfterSeconds * 1000)
        : 400 * (2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    throw new Error('Request failed after retries.');
  };

  if (!isWikimedia) {
    return execute();
  }
  const queued = wikimediaFetchQueue.then(execute, execute);
  wikimediaFetchQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

function canTryCoverImageUrl(url: string): boolean {
  const normalized = url.toLowerCase().split('?')[0] ?? '';
  return !!url
    && !normalized.endsWith('.svg')
    && !normalized.endsWith('.tif')
    && !normalized.endsWith('.tiff');
}

function addCoverCandidate(
  candidates: CoverImageCandidate[],
  seenUrls: Set<string>,
  candidate: CoverImageCandidate,
): void {
  if (!canTryCoverImageUrl(candidate.imageUrl) || seenUrls.has(candidate.imageUrl)) {
    return;
  }
  seenUrls.add(candidate.imageUrl);
  candidates.push(candidate);
}

async function collectWikipediaCoverImageCandidates(
  cityName: string,
  regionName: string | null,
  candidates: CoverImageCandidate[],
  seenUrls: Set<string>,
): Promise<void> {
  const searchTerms = [
    regionName ? `${cityName}, ${regionName}` : cityName,
    cityName,
  ];
  const seenPageIds = new Set<number>();

  for (const term of searchTerms) {
    const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('list', 'search');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('srlimit', '5');
    searchUrl.searchParams.set('srsearch', term);

    const search = await fetchJson<WikipediaSearchResponse>(searchUrl.toString());
    const pageIds = (search.query?.search ?? [])
      .map((result) => result.pageid)
      .filter((pageId): pageId is number => typeof pageId === 'number' && !seenPageIds.has(pageId));
    pageIds.forEach((pageId) => seenPageIds.add(pageId));
    if (pageIds.length === 0) {
      continue;
    }

    const imageUrl = new URL('https://en.wikipedia.org/w/api.php');
    imageUrl.searchParams.set('action', 'query');
    imageUrl.searchParams.set('format', 'json');
    imageUrl.searchParams.set('prop', 'pageimages|info');
    imageUrl.searchParams.set('piprop', 'original|thumbnail');
    imageUrl.searchParams.set('pithumbsize', '1600');
    imageUrl.searchParams.set('inprop', 'url');
    imageUrl.searchParams.set('pageids', pageIds.join('|'));

    const pages = await fetchJson<WikipediaPageImagesResponse>(imageUrl.toString());
    for (const page of Object.values(pages.query?.pages ?? {})) {
      const title = page.title ?? term;
      const pageUrl = page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
      for (const source of [page.thumbnail?.source, page.original?.source]) {
        if (!source) {
          continue;
        }
        addCoverCandidate(candidates, seenUrls, {
          imageUrl: source,
          pageTitle: title,
          pageUrl,
          source: 'wikipedia',
        });
      }
    }
  }
}

async function collectCommonsCoverImageCandidates(
  cityName: string,
  regionName: string | null,
  candidates: CoverImageCandidate[],
  seenUrls: Set<string>,
): Promise<void> {
  const place = regionName ? `${cityName} ${regionName}` : cityName;
  const searchTerms = [
    `${place} skyline`,
    `${place} downtown`,
    `${place} city`,
    place,
  ];

  for (const term of searchTerms) {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrsearch', term);
    url.searchParams.set('gsrnamespace', '6');
    url.searchParams.set('gsrlimit', '8');
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|mime|size');
    url.searchParams.set('iiurlwidth', '1800');

    const data = await fetchJson<WikimediaCommonsImageResponse>(url.toString());
    for (const page of Object.values(data.query?.pages ?? {})) {
      const image = page.imageinfo?.[0];
      if (!image) {
        continue;
      }
      const title = page.title ?? term;
      const mime = image.mime?.toLowerCase() ?? '';
      if (mime && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime)) {
        continue;
      }
      for (const source of [image.thumburl, image.url]) {
        if (!source) {
          continue;
        }
        addCoverCandidate(candidates, seenUrls, {
          imageUrl: source,
          pageTitle: title.replace(/^File:/i, ''),
          pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
          source: 'wikimedia-commons',
        });
      }
    }
  }
}

async function findValidatedCoverImage(cityName: string, regionName: string | null): Promise<{ candidate: CoverImageCandidate; image: { buffer: Buffer; contentType: string; extension: string } }> {
  const candidates: CoverImageCandidate[] = [];
  const seenUrls = new Set<string>();
  await collectWikipediaCoverImageCandidates(cityName, regionName, candidates, seenUrls);
  await collectCommonsCoverImageCandidates(cityName, regionName, candidates, seenUrls);

  if (candidates.length === 0) {
    throw new HttpsError('not-found', `No usable Wikimedia cover image candidates found for ${cityName}.`);
  }

  const failures: string[] = [];
  for (const candidate of candidates.slice(0, 30)) {
    try {
      return {
        candidate,
        image: await fetchValidatedCoverImage(candidate.imageUrl),
      };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'candidate failed');
    }
  }

  throw new HttpsError(
    'failed-precondition',
    `No valid bitmap cover image found after ${Math.min(candidates.length, 30)} candidates. Last issue: ${failures.at(-1) ?? 'unknown failure'}`,
  );
}

async function fetchValidatedCoverImage(imageUrl: string): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  const response = await fetch(imageUrl, {
    headers: {
      'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
      'User-Agent': 'LivingWiki/1.0 cover-image-automation (https://livingwiki.com)',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new HttpsError('unavailable', `Image download failed with ${response.status}.`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const extension = imageExtensionForContentType(contentType);
  if (!extension) {
    throw new HttpsError('failed-precondition', `Candidate image is not a supported bitmap type (${contentType || 'unknown'}).`);
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  const maxBytes = 12 * 1024 * 1024;
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpsError('failed-precondition', 'Candidate image is larger than 12 MB.');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 50 * 1024) {
    throw new HttpsError('failed-precondition', 'Candidate image is too small to use as a cover.');
  }
  if (buffer.length > maxBytes) {
    throw new HttpsError('failed-precondition', 'Candidate image is larger than 12 MB.');
  }

  return { buffer, contentType: contentType.split(';')[0]?.trim() || contentType, extension };
}

async function buildSpeechCacheDownloadUrl(storagePath: string): Promise<string> {
  return buildDocumentDownloadUrl(storagePath);
}

const speechSynthesisLockWaitMs = 20_000;
const speechSynthesisLockStaleMs = 150_000;

function cloudStorageErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = Number((error as { code?: unknown }).code);
  return Number.isFinite(code) ? code : null;
}

function isCloudStoragePreconditionFailure(error: unknown): boolean {
  const status = cloudStorageErrorStatus(error);
  return status === 409 || status === 412;
}

async function waitForSpeechSynthesisLock(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 400));
}

async function loadPublicAtlasById(atlasId: string): Promise<Record<string, unknown> & { id: string; user_id: string; is_public: boolean }> {
  const atlasSnapshot = await db.collection('atlases').doc(atlasId).get();
  if (!atlasSnapshot.exists) {
    throw new HttpsError('not-found', 'Atlas not found.');
  }

  const atlas = atlasSnapshot.data() as Record<string, unknown> | undefined;
  if (!atlas?.is_public || !atlas.user_id) {
    throw new HttpsError('permission-denied', 'Atlas is not public.');
  }

  return {
    id: atlasSnapshot.id,
    user_id: String(atlas.user_id),
    is_public: atlas.is_public === true,
    ...atlas,
  };
}

type CityPlaceCandidate = {
  placeId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  types: string[];
  category: string;
  googleMapsUrl: string;
  source: 'google' | 'reviewed';
  ratingAvg?: number;
  ratingCount?: number;
  reviewCount?: number;
};

type CityPlaceRecord = CityPlaceCandidate & {
  id: string;
  atlasId: string;
  citySlug: string;
  latestReviewText: string;
  latestReviewRating: number | null;
  latestReviewAt: string | null;
};

type CityPlaceReviewRecord = {
  id: string;
  atlasId: string;
  citySlug: string;
  placeId: string;
  googlePlaceId: string;
  placeName: string;
  rating: number;
  text: string;
  reviewerType: string;
  reviewerName: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type GooglePlacesTextSearchResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    place_id?: string;
    name?: string;
    formatted_address?: string;
    types?: string[];
    rating?: number;
    user_ratings_total?: number;
    photos?: Array<{
      photo_reference?: string;
      width?: number;
      height?: number;
    }>;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
};

type GooglePlaceDetailsResponse = {
  status?: string;
  error_message?: string;
  result?: {
    place_id?: string;
    name?: string;
    formatted_address?: string;
    website?: string;
    url?: string;
    rating?: number;
    user_ratings_total?: number;
    types?: string[];
    photos?: Array<{
      photo_reference?: string;
      width?: number;
      height?: number;
    }>;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  };
};

function placeDocIdFromGooglePlaceId(placeId: string): string {
  return `google_${placeId.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 120)}`;
}

function cityScopedPlaceDocId(atlasId: string, placeId: string): string {
  const atlasHash = createHash('sha1').update(atlasId).digest('hex').slice(0, 12);
  return `${atlasHash}_${placeDocIdFromGooglePlaceId(placeId)}`;
}

function cityPlaceCategory(types: string[]): string {
  if (types.includes('restaurant')) return 'Restaurant';
  if (types.includes('cafe')) return 'Cafe';
  if (types.includes('bar')) return 'Bar';
  if (types.includes('bakery')) return 'Bakery';
  if (types.includes('tourist_attraction')) return 'Attraction';
  if (types.includes('park')) return 'Park';
  if (types.includes('lodging')) return 'Hotel';
  if (types.includes('museum')) return 'Museum';
  if (types.includes('store')) return 'Shop';
  return 'Place';
}

function normalizePlaceReviewText(value: unknown): string {
  return textFromUnknown(value).replace(/\s+/g, ' ').slice(0, 900);
}

function reviewRatingFromUnknown(value: unknown): number {
  const rating = Math.round(Number(value));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new HttpsError('invalid-argument', 'Rating must be between 1 and 5.');
  }
  return rating;
}

function anonymousPlaceReviewerKey(requestAuthUid: string | undefined, anonymousVisitorId: unknown): string {
  if (requestAuthUid) {
    return `user:${requestAuthUid}`;
  }

  const visitorId = textFromUnknown(anonymousVisitorId);
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(visitorId)) {
    throw new HttpsError('unauthenticated', 'Anonymous review session is missing.');
  }
  return `anon:${visitorId}`;
}

function reviewerHash(reviewerKey: string): string {
  return createHash('sha256').update(reviewerKey).digest('hex').slice(0, 32);
}

function serializeCityPlace(snapshotId: string, data: Record<string, unknown>): CityPlaceRecord {
  return {
    id: snapshotId,
    atlasId: textFromUnknown(data.atlas_id),
    citySlug: textFromUnknown(data.city_slug),
    placeId: textFromUnknown(data.google_place_id || data.place_id),
    name: textFromUnknown(data.name),
    address: textFromUnknown(data.address),
    lat: typeof data.lat === 'number' ? data.lat : null,
    lng: typeof data.lng === 'number' ? data.lng : null,
    types: Array.isArray(data.types) ? data.types.map((type) => textFromUnknown(type)).filter(Boolean) : [],
    category: textFromUnknown(data.category) || 'Place',
    googleMapsUrl: textFromUnknown(data.google_maps_url),
    source: 'reviewed',
    ratingAvg: typeof data.rating_avg === 'number' ? data.rating_avg : 0,
    ratingCount: typeof data.rating_count === 'number' ? data.rating_count : 0,
    reviewCount: typeof data.review_count === 'number' ? data.review_count : 0,
    latestReviewText: textFromUnknown(data.latest_review_text),
    latestReviewRating: typeof data.latest_review_rating === 'number' ? data.latest_review_rating : null,
    latestReviewAt: timestampToIso(data.latest_review_at),
  };
}

function serializeCityPlaceReview(snapshotId: string, data: Record<string, unknown>): CityPlaceReviewRecord {
  return {
    id: snapshotId,
    atlasId: textFromUnknown(data.atlas_id),
    citySlug: textFromUnknown(data.city_slug),
    placeId: textFromUnknown(data.place_id),
    googlePlaceId: textFromUnknown(data.google_place_id),
    placeName: textFromUnknown(data.place_name),
    rating: typeof data.rating === 'number' ? data.rating : 0,
    text: textFromUnknown(data.text),
    reviewerType: textFromUnknown(data.reviewer_type) || 'anonymous',
    reviewerName: textFromUnknown(data.reviewer_name) || 'Local reviewer',
    createdAt: timestampToIso(data.created_at),
    updatedAt: timestampToIso(data.updated_at),
  };
}

function cityAtlasSearchContext(atlas: Record<string, unknown>): string {
  const cityConfig = (atlas.city_config ?? {}) as Record<string, unknown>;
  const name = textFromUnknown(cityConfig.city_name) || textFromUnknown(atlas.name).replace(/^Living Wiki:\s*/i, '');
  const region = textFromUnknown(cityConfig.region_name);
  const country = textFromUnknown(cityConfig.country_code);
  return [name, region, country].filter(Boolean).join(', ');
}

function cityAtlasPlaceSearchBias(atlas: Record<string, unknown>) {
  const cityConfig = (atlas.city_config ?? {}) as Record<string, unknown>;
  return {
    cityName: textFromUnknown(cityConfig.city_name) || textFromUnknown(atlas.name).replace(/^Living Wiki:\s*/i, ''),
    regionName: textFromUnknown(cityConfig.region_name),
    countryCode: textFromUnknown(cityConfig.country_code),
    latitude: cityConfig.latitude ?? atlas.latitude,
    longitude: cityConfig.longitude ?? atlas.longitude,
  };
}

function assertPublicCityAtlas(atlas: Record<string, unknown>): void {
  const cityConfig = (atlas.city_config ?? {}) as Record<string, unknown>;
  if (cityConfig.enabled !== true) {
    throw new HttpsError('failed-precondition', 'Place reviews are only available for city wikis.');
  }
}

function googleCandidateFromResult(result: NonNullable<GooglePlacesTextSearchResponse['results']>[number]): CityPlaceCandidate | null {
  const placeId = textFromUnknown(result.place_id);
  const name = textFromUnknown(result.name);
  if (!placeId || !name) {
    return null;
  }

  const types = Array.isArray(result.types) ? result.types.map((type) => textFromUnknown(type)).filter(Boolean) : [];
  return {
    placeId,
    name,
    address: textFromUnknown(result.formatted_address),
    lat: typeof result.geometry?.location?.lat === 'number' ? result.geometry.location.lat : null,
    lng: typeof result.geometry?.location?.lng === 'number' ? result.geometry.location.lng : null,
    types,
    category: cityPlaceCategory(types),
    googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`,
    source: 'google',
    ratingAvg: typeof result.rating === 'number' ? result.rating : undefined,
    ratingCount: typeof result.user_ratings_total === 'number' ? result.user_ratings_total : undefined,
    reviewCount: 0,
  };
}

function matchesPlaceQuery(place: CityPlaceRecord, query: string): boolean {
  const haystack = `${place.name} ${place.address} ${place.category}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

async function assertAtlasOwner(atlasId: string | null, userId: string): Promise<void> {
  if (!atlasId) {
    return;
  }

  const atlasSnapshot = await db.collection('atlases').doc(atlasId).get();
  if (!atlasSnapshot.exists) {
    throw new HttpsError('not-found', 'Atlas not found.');
  }

  const atlas = atlasSnapshot.data() as Record<string, unknown> | undefined;
  if (!atlas?.user_id || String(atlas.user_id) !== userId) {
    throw new HttpsError('permission-denied', 'You do not have access to upload to this atlas.');
  }
}

function normalizeUserEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function firstNameFromDisplayName(value: unknown): string | null {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!text || text.includes('@')) {
    return null;
  }
  const first = text.split(' ')[0]?.replace(/[^a-zA-ZÀ-ÿ'’-]/g, '').trim() ?? '';
  return first.length >= 2 ? first.slice(0, 40) : null;
}

function normalizeAdminProfiles(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeAppRedirect(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

function buildAppActionUrl(
  flow: 'verifyEmailComplete' | 'resetPasswordComplete',
  redirectTo?: unknown,
): string {
  const url = new URL('/auth/action', publicAppUrl);
  url.searchParams.set('flow', flow);

  if (isSafeAppRedirect(redirectTo)) {
    url.searchParams.set('redirectTo', redirectTo);
  }

  return url.toString();
}

function publicAuthActionLinkFromGeneratedLink(generatedLink: string, redirectTo?: unknown): string {
  const generatedUrl = new URL(generatedLink);
  const actionUrl = new URL('/auth/action', publicAppUrl);
  const passthroughParams = ['mode', 'oobCode', 'apiKey', 'lang'];

  for (const param of passthroughParams) {
    const value = generatedUrl.searchParams.get(param);
    if (value) {
      actionUrl.searchParams.set(param, value);
    }
  }

  if (isSafeAppRedirect(redirectTo)) {
    actionUrl.searchParams.set('redirectTo', redirectTo);
  }

  return actionUrl.toString();
}

function buildVerifyAccountEmail(params: {
  recipientEmail: string;
  recipientName: string | null;
  verificationUrl: string;
}) {
  const displayName = params.recipientName?.trim() || 'there';
  const subject = 'Verify your LivingWiki account';
  const safeDisplayName = escapeHtml(displayName);
  const safeVerificationUrl = escapeHtml(params.verificationUrl);

  const text = `Hi ${displayName},

Welcome to LivingWiki. Verify your email address to activate your account and continue to your workspace.

Verify your email:
${params.verificationUrl}

This verification link expires for your security. If you did not create a LivingWiki account, you can ignore this email.

The LivingWiki Team`;

  const html = `
    <div style="margin:0;padding:0;background:#f5f7f6;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#102017;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        Verify your email address to activate your LivingWiki account.
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f5f7f6;margin:0;padding:0;">
        <tr>
          <td align="center" style="padding:32px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:640px;background:#ffffff;border:1px solid #dfe8e2;border-radius:18px;overflow:hidden;">
              <tr>
                <td style="background:#0e2518;padding:30px 32px;">
                  <div style="font-size:28px;line-height:1.1;font-weight:900;color:#ffffff;letter-spacing:0;">LivingWiki</div>
                  <div style="margin-top:10px;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#9bd7ad;">Account verification</div>
                </td>
              </tr>
              <tr>
                <td style="padding:34px 32px 30px;">
                  <h1 style="margin:0 0 14px;color:#102017;font-size:26px;line-height:1.25;font-weight:850;">Verify your email address</h1>
                  <p style="margin:0 0 18px;color:#3f4f46;font-size:16px;line-height:1.65;">Hi ${safeDisplayName},</p>
                  <p style="margin:0 0 22px;color:#3f4f46;font-size:16px;line-height:1.65;">
                    Welcome to <strong style="color:#102017;">LivingWiki</strong>. Confirm this email address to activate your account and continue to your workspace.
                  </p>
                  <div style="text-align:center;margin:30px 0;">
                    <a href="${safeVerificationUrl}" style="display:inline-block;background:#1c7c41;color:#ffffff;text-decoration:none;border-radius:999px;padding:15px 28px;font-size:15px;font-weight:850;">
                      Verify Email
                    </a>
                  </div>
                  <div style="background:#f7faf8;border:1px solid #dfe8e2;border-radius:14px;padding:18px 18px;margin:0 0 22px;">
                    <p style="margin:0;color:#52625a;font-size:14px;line-height:1.65;">
                      This secure link expires for your protection. If you requested multiple verification emails, use the newest one.
                    </p>
                  </div>
                  <p style="margin:0 0 8px;color:#6c7971;font-size:13px;line-height:1.65;">If the button does not work, paste this link into your browser:</p>
                  <p style="margin:0;word-break:break-all;color:#1c7c41;font-size:13px;line-height:1.6;">
                    <a href="${safeVerificationUrl}" style="color:#1c7c41;text-decoration:underline;">${safeVerificationUrl}</a>
                  </p>
                  <hr style="border:none;border-top:1px solid #e5ece7;margin:28px 0 18px;">
                  <p style="margin:0;color:#8a968f;font-size:12px;line-height:1.6;">
                    You received this email because a LivingWiki account was created with this address. If this was not you, no action is needed.
                  </p>
                  <p style="margin:10px 0 0;color:#9aa6a0;font-size:12px;line-height:1.55;">The LivingWiki Team</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return { subject, text, html };
}

function buildPasswordResetEmail(params: {
  recipientEmail: string;
  recipientName: string | null;
  resetUrl: string;
}) {
  const displayName = params.recipientName?.trim() || 'there';
  const subject = 'Reset your LivingWiki password';
  const safeDisplayName = escapeHtml(displayName);
  const safeResetUrl = escapeHtml(params.resetUrl);

  const text = `Hi ${displayName},

We received a request to reset the password for your LivingWiki account.

Reset your password:
${params.resetUrl}

This link expires for your security. If you did not request a password reset, you can ignore this email.

The LivingWiki Team`;

  const html = `
    <div style="margin:0;padding:0;background:#f5f7f6;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#102017;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        Reset your LivingWiki password.
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f5f7f6;margin:0;padding:0;">
        <tr>
          <td align="center" style="padding:32px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:640px;background:#ffffff;border:1px solid #dfe8e2;border-radius:18px;overflow:hidden;">
              <tr>
                <td style="background:#0e2518;padding:30px 32px;">
                  <div style="font-size:28px;line-height:1.1;font-weight:900;color:#ffffff;letter-spacing:0;">LivingWiki</div>
                  <div style="margin-top:10px;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#9bd7ad;">Password recovery</div>
                </td>
              </tr>
              <tr>
                <td style="padding:34px 32px 30px;">
                  <h1 style="margin:0 0 14px;color:#102017;font-size:26px;line-height:1.25;font-weight:850;">Reset your password</h1>
                  <p style="margin:0 0 18px;color:#3f4f46;font-size:16px;line-height:1.65;">Hi ${safeDisplayName},</p>
                  <p style="margin:0 0 22px;color:#3f4f46;font-size:16px;line-height:1.65;">
                    We received a request to reset the password for your <strong style="color:#102017;">LivingWiki</strong> account.
                  </p>
                  <div style="text-align:center;margin:30px 0;">
                    <a href="${safeResetUrl}" style="display:inline-block;background:#1c7c41;color:#ffffff;text-decoration:none;border-radius:999px;padding:15px 28px;font-size:15px;font-weight:850;">
                      Reset Password
                    </a>
                  </div>
                  <div style="background:#f7faf8;border:1px solid #dfe8e2;border-radius:14px;padding:18px 18px;margin:0 0 22px;">
                    <p style="margin:0;color:#52625a;font-size:14px;line-height:1.65;">
                      This secure link expires for your protection. If you did not request a password reset, no action is needed.
                    </p>
                  </div>
                  <p style="margin:0 0 8px;color:#6c7971;font-size:13px;line-height:1.65;">If the button does not work, paste this link into your browser:</p>
                  <p style="margin:0;word-break:break-all;color:#1c7c41;font-size:13px;line-height:1.6;">
                    <a href="${safeResetUrl}" style="color:#1c7c41;text-decoration:underline;">${safeResetUrl}</a>
                  </p>
                  <hr style="border:none;border-top:1px solid #e5ece7;margin:28px 0 18px;">
                  <p style="margin:0;color:#9aa6a0;font-size:12px;line-height:1.55;">The LivingWiki Team</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return { subject, text, html };
}

async function sendLivingWikiVerificationEmail(params: {
  recipientEmail: string;
  recipientName: string | null;
  verificationUrl: string;
}): Promise<string | null> {
  const apiKey = sendgridApiKey.value();
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'SendGrid API key is not configured.');
  }

  sgMail.setApiKey(apiKey);
  const email = buildVerifyAccountEmail(params);
  const [response] = await sgMail.send({
    to: params.recipientEmail,
    from: {
      email: inviteSenderEmail,
      name: 'LivingWiki',
    },
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return typeof response.headers?.['x-message-id'] === 'string'
    ? response.headers['x-message-id']
    : null;
}

async function sendLivingWikiPasswordResetEmail(params: {
  recipientEmail: string;
  recipientName: string | null;
  resetUrl: string;
}): Promise<string | null> {
  const apiKey = sendgridApiKey.value();
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'SendGrid API key is not configured.');
  }

  sgMail.setApiKey(apiKey);
  const email = buildPasswordResetEmail(params);
  const [response] = await sgMail.send({
    to: params.recipientEmail,
    from: {
      email: inviteSenderEmail,
      name: 'LivingWiki',
    },
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return typeof response.headers?.['x-message-id'] === 'string'
    ? response.headers['x-message-id']
    : null;
}

export const sendAccountVerificationEmail = onCall(
  { region: callableRegion, cors: true, secrets: [sendgridApiKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in before requesting verification email.');
    }

    const user = await getAuth().getUser(uid);
    if (!user.email) {
      throw new HttpsError('failed-precondition', 'This account does not have an email address.');
    }

    if (user.emailVerified) {
      return { sent: false, alreadyVerified: true };
    }

    const authEmail = normalizeUserEmail(request.auth?.token.email);
    const userEmail = normalizeUserEmail(user.email);
    if (authEmail && authEmail !== userEmail) {
      throw new HttpsError('permission-denied', 'The signed-in account does not match this email address.');
    }

    const actionUrl = buildAppActionUrl('verifyEmailComplete', request.data?.redirectTo);
    const generatedVerificationUrl = await getAuth().generateEmailVerificationLink(user.email, {
      url: actionUrl,
      handleCodeInApp: false,
    });
    const verificationUrl = publicAuthActionLinkFromGeneratedLink(
      generatedVerificationUrl,
      request.data?.redirectTo,
    );
    const messageId = await sendLivingWikiVerificationEmail({
      recipientEmail: user.email,
      recipientName: firstNameFromDisplayName(user.displayName),
      verificationUrl,
    });

    logger.info('LivingWiki account verification email accepted by SendGrid.', {
      uid,
      recipientEmail: user.email,
      messageId,
    });

    return { sent: true, alreadyVerified: false };
  },
);

export const sendAccountPasswordResetEmail = onCall(
  { region: callableRegion, cors: true, secrets: [sendgridApiKey] },
  async (request) => {
    const email = normalizeUserEmail(request.data?.email);
    if (!isValidEmail(email)) {
      throw new HttpsError('invalid-argument', 'Enter a valid email address.');
    }

    let user;
    try {
      user = await getAuth().getUserByEmail(email);
    } catch (error) {
      logger.info('Password reset requested for unknown email.', { email });
      return { sent: false };
    }

    const actionUrl = buildAppActionUrl('resetPasswordComplete');
    const generatedResetUrl = await getAuth().generatePasswordResetLink(email, {
      url: actionUrl,
      handleCodeInApp: false,
    });
    const resetUrl = publicAuthActionLinkFromGeneratedLink(generatedResetUrl);
    const messageId = await sendLivingWikiPasswordResetEmail({
      recipientEmail: email,
      recipientName: firstNameFromDisplayName(user.displayName),
      resetUrl,
    });

    logger.info('LivingWiki password reset email accepted by SendGrid.', {
      uid: user.uid,
      recipientEmail: email,
      messageId,
    });

    return { sent: true };
  },
);

function atlasDisplayName(atlas: Record<string, unknown>, atlasId: string): string {
  const name = typeof atlas.name === 'string' ? atlas.name.trim() : '';
  return name || `Wiki ${atlasId.slice(0, 6)}`;
}

type AtlasNewsletterConfig = {
  enabled: boolean;
  day_of_week: number;
  send_time: string;
  timezone: string;
  prompt: string;
  last_sent_key?: string | null;
  last_sent_at?: unknown;
};

function normalizeNewsletterConfig(value: unknown, fallbackTimezone = 'America/New_York'): AtlasNewsletterConfig {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const day = Number(data.day_of_week);
  const rawSendTime = typeof data.send_time === 'string' ? data.send_time.trim() : '';
  const rawTimezone = typeof data.timezone === 'string' ? data.timezone.trim() : '';
  const rawPrompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';

  return {
    enabled: data.enabled === true,
    day_of_week: Number.isInteger(day) && day >= 0 && day <= 6 ? day : 1,
    send_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(rawSendTime) ? rawSendTime : '09:00',
    timezone: rawTimezone || fallbackTimezone,
    prompt: rawPrompt ? rawPrompt.slice(0, 4000) : defaultNewsletterPrompt,
    last_sent_key: typeof data.last_sent_key === 'string' ? data.last_sent_key : null,
    last_sent_at: data.last_sent_at,
  };
}

function normalizeNewsletterConfigInput(value: unknown, fallbackTimezone = 'America/New_York'): AtlasNewsletterConfig {
  const config = normalizeNewsletterConfig(value, fallbackTimezone);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: config.timezone }).format(new Date());
  } catch {
    throw new HttpsError('invalid-argument', 'Enter a valid timezone, for example America/New_York.');
  }
  return config;
}

function newsletterConfigForWrite(config: AtlasNewsletterConfig): Record<string, unknown> {
  const data: Record<string, unknown> = {
    enabled: config.enabled,
    day_of_week: config.day_of_week,
    send_time: config.send_time,
    timezone: config.timezone,
    prompt: config.prompt,
  };
  if (config.last_sent_key) {
    data['last_sent_key'] = config.last_sent_key;
  }
  if (config.last_sent_at) {
    data['last_sent_at'] = config.last_sent_at;
  }
  return data;
}

function localNewsletterKey(now: Date, timezone: string, sendTime: string): {
  key: string;
  dayOfWeek: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dateKey = `${value('year')}-${value('month')}-${value('day')}`;
  return {
    key: `${dateKey}:${sendTime}`,
    dayOfWeek: weekdayMap[value('weekday')] ?? 0,
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  };
}

function isNewsletterDue(config: AtlasNewsletterConfig, now = new Date()): { due: boolean; key: string } {
  const local = localNewsletterKey(now, config.timezone, config.send_time);
  const [sendHourText, sendMinuteText] = config.send_time.split(':');
  const sendHour = Number(sendHourText);
  const sendMinute = Number(sendMinuteText);
  const due =
    config.enabled &&
    local.dayOfWeek === config.day_of_week &&
    local.hour === sendHour &&
    local.minute >= sendMinute &&
    config.last_sent_key !== local.key;
  return { due, key: local.key };
}

function buildAtlasAdminInviteEmail(params: {
  recipientName: string | null;
  recipientEmail: string;
  inviterName: string;
  atlasName: string;
  adminUrl: string;
  publicUrl: string;
}) {
  const recipientName = params.recipientName?.trim() || params.recipientEmail;
  const subject = `You have been added as an admin for ${params.atlasName}`;
  const safeRecipientName = escapeHtml(recipientName);
  const safeInviterName = escapeHtml(params.inviterName);
  const safeAtlasName = escapeHtml(params.atlasName);
  const safeAdminUrl = escapeHtml(params.adminUrl);
  const safePublicUrl = escapeHtml(params.publicUrl);

  const text = `Hi ${recipientName},

${params.inviterName} added you as an admin for "${params.atlasName}" on Living Wiki.

You can now help manage this wiki's AI voice and settings.

Open the admin page:
${params.adminUrl}

Open the public wiki:
${params.publicUrl}

If your admin access is removed later, this wiki will automatically disappear from your Wikis page.

The Living Wiki Team`;

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; padding: 0;">
      <div style="background: linear-gradient(135deg, #0b1f14 0%, #1c7c41 100%); padding: 34px 30px; border-radius: 18px 18px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800;">Living Wiki</h1>
        <p style="color: rgba(255,255,255,0.76); margin: 10px 0 0; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase;">Admin invitation</p>
      </div>
      <div style="background: #ffffff; padding: 32px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 18px 18px;">
        <p style="color: #111827; font-size: 16px; line-height: 1.6; margin: 0 0 18px;">Hi <strong>${safeRecipientName}</strong>,</p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 22px;">
          ${safeInviterName} added you as an admin for <strong>${safeAtlasName}</strong> on Living Wiki.
        </p>
        <div style="background: #f8faf9; border: 1px solid #dbe8df; border-radius: 14px; padding: 20px; margin: 0 0 24px;">
          <p style="color: #0f2417; font-size: 15px; line-height: 1.6; margin: 0;">
            You can now open this wiki from your Wikis page and manage its AI voice and settings.
          </p>
        </div>
        <div style="text-align: center; margin: 26px 0;">
          <a href="${safeAdminUrl}" style="background: #1c7c41; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 999px; font-weight: 800; display: inline-block; font-size: 15px;">
            Open Admin Page
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 10px;">
          Public wiki: <a href="${safePublicUrl}" style="color: #1c7c41; text-decoration: none;">${safePublicUrl}</a>
        </p>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0;">
          If your admin access is removed later, this wiki will automatically disappear from your Wikis page.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 13px; margin: 0;">The Living Wiki Team</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

async function sendAtlasAdminInviteEmail(params: {
  recipientName: string | null;
  recipientEmail: string;
  inviterName: string;
  atlasName: string;
  adminUrl: string;
  publicUrl: string;
}): Promise<void> {
  const apiKey = sendgridApiKey.value();
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'SendGrid API key is not configured.');
  }

  sgMail.setApiKey(apiKey);
  const email = buildAtlasAdminInviteEmail(params);
  await sgMail.send({
    to: params.recipientEmail,
    from: {
      email: inviteSenderEmail,
      name: 'Living Wiki',
    },
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

function boardFriendRequestId(fromUserId: string, toEmail: string): string {
  return createHash('sha256')
    .update(`${fromUserId}:${toEmail}`)
    .digest('hex')
    .slice(0, 48);
}

function boardFriendshipId(leftUserId: string, rightUserId: string): string {
  return [leftUserId, rightUserId].sort().join('_');
}

const offGridWordsPattern = /^[\p{L}]+(?:[-'][\p{L}]+)*\.[\p{L}]+(?:[-'][\p{L}]+)*\.[\p{L}]+(?:[-'][\p{L}]+)*$/u;

function offGridContributionText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeOffGridWords(value: unknown): string {
  const words = offGridContributionText(value, 240)
    .toLocaleLowerCase()
    .replace(/^\/+/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  return offGridWordsPattern.test(words) ? words : '';
}

function offGridContributorName(
  user: Record<string, unknown> | undefined,
  token: Record<string, unknown>,
): string {
  const displayName = offGridContributionText(user?.displayName, 80)
    || offGridContributionText(token.name, 80);
  if (displayName) {
    return displayName;
  }
  const email = normalizeUserEmail(user?.email ?? token.email);
  return email ? email.split('@')[0]?.slice(0, 80) || 'A LivingWiki friend' : 'A LivingWiki friend';
}

function buildOffGridContributionCard(
  value: unknown,
  contributorName: string,
  contributorUserId: string,
): Record<string, unknown> {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const title = offGridContributionText(input.title, 80);
  const words = normalizeOffGridWords(input.what3wordsAddress);
  const tip = offGridContributionText(input.notes, 3600);
  const imageUrl = offGridContributionText(input.imageUrl, 2000);
  if (title.length < 2) {
    throw new HttpsError('invalid-argument', 'Name this place before adding it.');
  }
  if (!words) {
    throw new HttpsError('invalid-argument', 'A verified what3words address is required.');
  }
  if (imageUrl && !/^https:\/\/firebasestorage\.googleapis\.com\//i.test(imageUrl)) {
    throw new HttpsError('invalid-argument', 'The card photo must be uploaded before adding it.');
  }
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title,
    subtitle: `Pinned to ///${words} · Dropped by ${contributorName}`,
    notes: tip || `Walk to ///${words}. This what3words address identifies an exact 3 m square.`,
    type: 'place',
    scope: 'place',
    status: 'saved',
    rating: 4,
    entityName: title,
    entityType: 'place',
    imageIntent: 'place',
    imageContext: '',
    mediaKind: 'none',
    shortSummary: `Exact location: ///${words}`,
    rank: 0,
    imageUrl,
    imageUrls: imageUrl ? [imageUrl] : [],
    audioPreviewUrl: '',
    spotifyTrackId: '',
    spotifyTrackUrl: '',
    spotifyUri: '',
    spotifyArtistName: '',
    spotifyAlbumName: '',
    spotifyArtworkUrl: '',
    placeId: '',
    googleMapsUrl: '',
    what3wordsAddress: words,
    tags: ['off-grid', 'what3words'],
    stickers: [],
    tour: null,
    contributorUserId,
    contributorName,
    createdAt: now,
    updatedAt: now,
  };
}

function displayNameForUser(data: Record<string, unknown> | undefined, fallbackEmail: string, fallback = 'A LivingWiki friend'): string {
  const displayName = typeof data?.displayName === 'string' ? data.displayName.trim() : '';
  if (displayName) {
    return displayName;
  }
  return fallbackEmail || fallback;
}

function boardFriendUserSummary(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data() as Record<string, unknown> | undefined;
  const email = normalizeUserEmail(data?.email);
  return {
    userId: doc.id,
    email,
    displayName: displayNameForUser(data, email),
    photoURL: typeof data?.photoURL === 'string' ? data.photoURL : '',
    profileIcon: typeof data?.profileIcon === 'string' ? data.profileIcon : '',
    profilePictureType: data?.profilePictureType === 'image' || data?.profilePictureType === 'icon' ? data.profilePictureType : null,
  };
}

function candidateNameQueries(queryText: string): string[] {
  const trimmed = queryText.trim().replace(/\s+/g, ' ');
  const titleCase = trimmed
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
  return Array.from(new Set([trimmed, trimmed.toLowerCase(), titleCase].filter((value) => value.length >= 2))).slice(0, 3);
}

function boardFriendInviteUrl(): string {
  return `${publicAppUrl}/boards?friends=1`;
}

function buildBoardFriendInviteEmail(params: {
  recipientEmail: string;
  recipientName: string | null;
  inviterName: string;
  inviteUrl: string;
  isExistingUser: boolean;
}) {
  const recipientName = params.recipientName?.trim() || params.recipientEmail;
  const subject = `${params.inviterName} invited you to connect on LivingWiki`;
  const safeRecipientName = escapeHtml(recipientName);
  const safeInviterName = escapeHtml(params.inviterName);
  const safeInviteUrl = escapeHtml(params.inviteUrl);
  const actionText = params.isExistingUser ? 'Accept Friend Request' : 'Join and Accept';

  const text = `Hi ${recipientName},

${params.inviterName} invited you to connect as friends on LivingWiki.

Friends can see each other's public board profiles and get updates when a new public board is added.

Open LivingWiki:
${params.inviteUrl}

The LivingWiki Team`;

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #102017 0%, #38a169 100%); padding: 34px 30px; border-radius: 18px 18px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 850;">LivingWiki</h1>
        <p style="color: rgba(255,255,255,0.76); margin: 10px 0 0; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase;">Friend request</p>
      </div>
      <div style="background: #ffffff; padding: 32px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 18px 18px;">
        <p style="color: #111827; font-size: 16px; line-height: 1.6; margin: 0 0 18px;">Hi <strong>${safeRecipientName}</strong>,</p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 22px;">
          <strong>${safeInviterName}</strong> invited you to connect as friends on LivingWiki.
        </p>
        <div style="background: #f8faf9; border: 1px solid #dbe8df; border-radius: 14px; padding: 20px; margin: 0 0 24px;">
          <p style="color: #0f2417; font-size: 15px; line-height: 1.6; margin: 0;">
            Friends can view each other's public board profiles and get a note when someone adds a new public board. Private boards stay private.
          </p>
        </div>
        <div style="text-align: center; margin: 26px 0;">
          <a href="${safeInviteUrl}" style="background: #1c7c41; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 999px; font-weight: 850; display: inline-block; font-size: 15px;">
            ${actionText}
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 13px; margin: 0;">The LivingWiki Team</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

function buildBoardFriendNewBoardEmail(params: {
  recipientName: string | null;
  recipientEmail: string;
  friendName: string;
  boardTitle: string;
  boardDescription: string;
  boardCoverImageUrl: string;
  boardUrl: string;
}) {
  const recipientName = params.recipientName?.trim() || params.recipientEmail;
  const subject = `${params.friendName} added a board on LivingWiki`;
  const safeRecipientName = escapeHtml(recipientName);
  const safeFriendName = escapeHtml(params.friendName);
  const safeBoardTitle = escapeHtml(params.boardTitle);
  const safeBoardDescription = escapeHtml(params.boardDescription);
  const safeBoardUrl = escapeHtml(params.boardUrl);
  const safeBoardCoverImageUrl = escapeHtml(safeBoardCardRemoteImageUrl(params.boardCoverImageUrl));

  const text = `Hi ${recipientName},

${params.friendName} added a new public LivingWiki board: ${params.boardTitle}

${params.boardDescription}

Open the board:
${params.boardUrl}

The LivingWiki Team`;

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #102017 0%, #1c7c41 100%); padding: 34px 30px; border-radius: 18px 18px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 850;">LivingWiki</h1>
        <p style="color: rgba(255,255,255,0.76); margin: 10px 0 0; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase;">New board from a friend</p>
      </div>
      <div style="background: #ffffff; padding: 32px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 18px 18px;">
        <p style="color: #111827; font-size: 16px; line-height: 1.6; margin: 0 0 18px;">Hi <strong>${safeRecipientName}</strong>,</p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 22px;">
          <strong>${safeFriendName}</strong> added a new public board.
        </p>
        <div style="background: #f8faf9; border: 1px solid #dbe8df; border-radius: 14px; overflow: hidden; margin: 0 0 24px;">
          ${safeBoardCoverImageUrl ? `
          <a href="${safeBoardUrl}" style="display: block; text-decoration: none;">
            <img src="${safeBoardCoverImageUrl}" alt="${safeBoardTitle} cover image" width="578" style="display: block; width: 100%; height: 260px; object-fit: cover; border: 0;" />
          </a>` : ''}
          <div style="padding: 20px;">
            <h2 style="color: #102017; font-size: 22px; line-height: 1.25; margin: 0 0 10px;">${safeBoardTitle}</h2>
            ${safeBoardDescription ? `<p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0;">${safeBoardDescription}</p>` : ''}
          </div>
        </div>
        <div style="text-align: center; margin: 26px 0;">
          <a href="${safeBoardUrl}" style="background: #1c7c41; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 999px; font-weight: 850; display: inline-block; font-size: 15px;">
            Open Board
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 13px; margin: 0;">Private boards are never sent to friends.</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

async function sendBoardFriendEmail(params: {
  recipientEmail: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const apiKey = sendgridApiKey.value();
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'SendGrid API key is not configured.');
  }

  sgMail.setApiKey(apiKey);
  await sgMail.send({
    to: params.recipientEmail,
    from: {
      email: inviteSenderEmail,
      name: 'LivingWiki',
    },
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

async function consumeBoardEmailShareQuota(userId: string): Promise<void> {
  const now = Date.now();
  const hourBucket = Math.floor(now / (60 * 60 * 1000));
  const dayBucket = Math.floor(now / (24 * 60 * 60 * 1000));
  const quotaRef = db.collection('board_email_share_limits').doc(userId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(quotaRef);
    const data = snapshot.data() as Record<string, unknown> | undefined;
    const previousHourCount = data?.hour_bucket === hourBucket && typeof data.hour_count === 'number'
      ? data.hour_count
      : 0;
    const previousDayCount = data?.day_bucket === dayBucket && typeof data.day_count === 'number'
      ? data.day_count
      : 0;
    if (previousHourCount >= 10 || previousDayCount >= 30) {
      throw new HttpsError('resource-exhausted', 'You have reached the board email sharing limit. Try again later.');
    }
    transaction.set(quotaRef, {
      user_id: userId,
      hour_bucket: hourBucket,
      hour_count: previousHourCount + 1,
      day_bucket: dayBucket,
      day_count: previousDayCount + 1,
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export const shareBoardByEmail = onCall(
  { region: callableRegion, cors: true, secrets: [sendgridApiKey] },
  async (request) => {
    const senderUserId = request.auth?.uid ?? '';
    if (!senderUserId) {
      throw new HttpsError('unauthenticated', 'Sign in before emailing a board.');
    }
    if (request.auth?.token.email_verified !== true) {
      throw new HttpsError('failed-precondition', 'Verify your email address before emailing a board.');
    }

    const boardId = typeof request.data?.boardId === 'string' ? request.data.boardId.trim().slice(0, 160) : '';
    const recipientEmail = normalizeUserEmail(request.data?.email);
    if (!boardId || !/^[a-zA-Z0-9_-]+$/.test(boardId)) {
      throw new HttpsError('invalid-argument', 'Choose a valid board.');
    }
    if (!isValidEmail(recipientEmail)) {
      throw new HttpsError('invalid-argument', 'Enter a valid recipient email address.');
    }

    const [boardSnapshot, senderSnapshot] = await Promise.all([
      db.collection('boards').doc(boardId).get(),
      db.collection('users').doc(senderUserId).get(),
    ]);
    if (!boardSnapshot.exists) {
      throw new HttpsError('not-found', 'That board is no longer available.');
    }
    const board = boardSnapshot.data() as Record<string, unknown>;
    if (board.visibility !== 'public') {
      throw new HttpsError('failed-precondition', 'Only public boards can be emailed.');
    }
    const boardRouteKey = publicBoardRouteKey(boardId, board.custom_slug);

    await consumeBoardEmailShareQuota(senderUserId);

    const senderEmail = normalizeUserEmail(request.auth?.token.email);
    const sender = senderSnapshot.data() as Record<string, unknown> | undefined;
    const senderName = displayNameForUser(sender, senderEmail, 'A LivingWiki member').slice(0, 100);
    const recipientSnapshot = await db.collection('users').where('email', '==', recipientEmail).limit(1).get();
    const recipientDoc = recipientSnapshot.docs[0];
    const email = buildDirectBoardShareEmail({
      recipientEmail,
      recipientName: recipientDoc
        ? displayNameForUser(recipientDoc.data() as Record<string, unknown>, recipientEmail)
        : null,
      senderName,
      boardTitle: typeof board.title === 'string' ? board.title.slice(0, 120) : 'LivingWiki board',
      boardDescription: typeof board.description === 'string' ? board.description.slice(0, 600) : '',
      boardCoverImageUrl: safeBoardShareImageUrl(board.imageUrl),
      boardUrl: `${publicAppUrl}/boards/${encodeURIComponent(boardRouteKey)}`,
    });
    await sendBoardFriendEmail({ recipientEmail, ...email });
    logger.info('Public board shared by email.', { boardId, senderUserId });
    return { sent: true };
  },
);

export const inviteBoardFriend = onCall({ region: callableRegion, cors: true, secrets: [sendgridApiKey] }, async (request) => {
  const fromUserId = request.auth?.uid ?? '';
  if (!fromUserId) {
    throw new HttpsError('unauthenticated', 'Sign in before inviting friends.');
  }

  const toEmail = normalizeUserEmail(request.data?.email);
  if (!isValidEmail(toEmail)) {
    throw new HttpsError('invalid-argument', 'Enter a valid friend email address.');
  }

  const fromEmail = normalizeUserEmail((request.auth?.token ?? {}).email);
  if (fromEmail && fromEmail === toEmail) {
    throw new HttpsError('invalid-argument', 'You cannot invite yourself.');
  }

  const fromUserSnapshot = await db.collection('users').doc(fromUserId).get();
  const fromUser = fromUserSnapshot.data() as Record<string, unknown> | undefined;
  const inviterName = displayNameForUser(fromUser, fromEmail, 'A LivingWiki user');
  const targetSnapshot = await db.collection('users').where('email', '==', toEmail).limit(1).get();
  const targetDoc = targetSnapshot.docs[0] ?? null;
  const toUserId = targetDoc?.id ?? null;

  if (toUserId) {
    const friendshipSnapshot = await db.collection('board_friendships').doc(boardFriendshipId(fromUserId, toUserId)).get();
    if (friendshipSnapshot.exists) {
      return { status: 'already_friends' };
    }
  }

  const requestId = boardFriendRequestId(fromUserId, toEmail);
  const requestRef = db.collection('board_friend_requests').doc(requestId);
  const now = new Date().toISOString();
  const existingRequest = await requestRef.get();
  const existingRequestData = existingRequest.data() as Record<string, unknown> | undefined;
  const wasPending = existingRequestData?.status === 'pending';
  await requestRef.set({
    id: requestId,
    from_user_id: fromUserId,
    from_email: fromEmail,
    from_display_name: inviterName,
    to_email: toEmail,
    to_user_id: toUserId,
    status: 'pending',
    created_at: typeof existingRequestData?.created_at === 'string' ? existingRequestData.created_at : now,
    updated_at: now,
    server_updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

  if (wasPending) {
    return { status: 'pending', requestId, existingUser: !!targetDoc };
  }

  const email = buildBoardFriendInviteEmail({
    recipientEmail: toEmail,
    recipientName: targetDoc ? displayNameForUser(targetDoc.data() as Record<string, unknown>, toEmail) : null,
    inviterName,
    inviteUrl: boardFriendInviteUrl(),
    isExistingUser: !!targetDoc,
  });
  await sendBoardFriendEmail({ recipientEmail: toEmail, ...email });

  return { status: 'sent', requestId, existingUser: !!targetDoc };
});

export const searchBoardFriendCandidates = onCall({ region: callableRegion, cors: true }, async (request) => {
  const uid = request.auth?.uid ?? '';
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to search friends.');
  }

  const queryText = typeof request.data?.query === 'string' ? request.data.query.trim() : '';
  if (queryText.length < 2) {
    return { candidates: [] };
  }

  const authEmail = normalizeUserEmail((request.auth?.token ?? {}).email);
  const byId = new Map<string, ReturnType<typeof boardFriendUserSummary>>();
  const normalizedEmailQuery = normalizeUserEmail(queryText);
  const addSnapshot = (snapshot: FirebaseFirestore.QuerySnapshot): void => {
    snapshot.docs.forEach((doc) => {
      if (doc.id === uid) {
        return;
      }
      const candidate = boardFriendUserSummary(doc);
      if (!candidate.email || candidate.email === authEmail) {
        return;
      }
      byId.set(doc.id, candidate);
    });
  };

  if (normalizedEmailQuery.length >= 2) {
    const emailSnapshot = await db.collection('users')
      .where('email', '>=', normalizedEmailQuery)
      .where('email', '<=', `${normalizedEmailQuery}\uf8ff`)
      .limit(8)
      .get();
    addSnapshot(emailSnapshot);
  }

  const nameSnapshots = await Promise.all(candidateNameQueries(queryText).map((nameQuery) =>
    db.collection('users')
      .where('displayName', '>=', nameQuery)
      .where('displayName', '<=', `${nameQuery}\uf8ff`)
      .limit(8)
      .get(),
  ));
  nameSnapshots.forEach(addSnapshot);

  const friendshipsSnapshot = await db.collection('board_friendships')
    .where('user_ids', 'array-contains', uid)
    .limit(100)
    .get();
  const friendIds = new Set(friendshipsSnapshot.docs
    .flatMap((doc) => doc.data().user_ids as unknown[] | undefined ?? [])
    .filter((id): id is string => typeof id === 'string' && id !== uid));

  const outgoingSnapshot = await db.collection('board_friend_requests')
    .where('from_user_id', '==', uid)
    .where('status', '==', 'pending')
    .limit(100)
    .get();
  const pendingEmails = new Set(outgoingSnapshot.docs.map((doc) => normalizeUserEmail(doc.data().to_email)).filter(Boolean));

  const candidates = Array.from(byId.values())
    .map((candidate) => ({
      ...candidate,
      relationshipStatus: friendIds.has(candidate.userId)
        ? 'friend'
        : pendingEmails.has(candidate.email)
          ? 'pending'
          : 'available',
    }))
    .sort((left, right) => {
      const leftStatus = left.relationshipStatus === 'available' ? 0 : left.relationshipStatus === 'pending' ? 1 : 2;
      const rightStatus = right.relationshipStatus === 'available' ? 0 : right.relationshipStatus === 'pending' ? 1 : 2;
      return leftStatus - rightStatus || left.displayName.localeCompare(right.displayName);
    })
    .slice(0, 8);

  return { candidates };
});

export const listBoardFriends = onCall({ region: callableRegion, cors: true }, async (request) => {
  const uid = request.auth?.uid ?? '';
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to view friends.');
  }
  const authEmail = normalizeUserEmail((request.auth?.token ?? {}).email);

  const friendshipsSnapshot = await db.collection('board_friendships')
    .where('user_ids', 'array-contains', uid)
    .limit(100)
    .get();
  const friendIds = friendshipsSnapshot.docs
    .map((doc) => (doc.data().user_ids as unknown[] | undefined)?.find((id) => typeof id === 'string' && id !== uid))
    .filter((id): id is string => typeof id === 'string');
  const friendDocs = await Promise.all(friendIds.map((id) => db.collection('users').doc(id).get()));
  const friends = friendDocs
    .filter((doc) => doc.exists)
    .map((doc) => boardFriendUserSummary(doc));

  const incomingSnapshots = authEmail
    ? await db.collection('board_friend_requests').where('to_email', '==', authEmail).limit(50).get()
    : null;
  const incoming = (incomingSnapshots?.docs ?? [])
    .map((doc): Record<string, unknown> & { id: string } => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
    .filter((item) => item.status === 'pending')
    .map((item) => ({
      id: String(item.id),
      fromUserId: String(item.from_user_id ?? ''),
      fromEmail: String(item.from_email ?? ''),
      fromDisplayName: String(item.from_display_name ?? 'LivingWiki friend'),
      createdAt: String(item.created_at ?? ''),
    }));

  const outgoingSnapshot = await db.collection('board_friend_requests')
    .where('from_user_id', '==', uid)
    .limit(50)
    .get();
  const outgoing = outgoingSnapshot.docs
    .map((doc): Record<string, unknown> & { id: string } => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
    .filter((item) => item.status === 'pending')
    .map((item) => ({
      id: String(item.id),
      toEmail: String(item.to_email ?? ''),
      createdAt: String(item.created_at ?? ''),
    }));

  return { friends, incoming, outgoing };
});

export const respondBoardFriendRequest = onCall({ region: callableRegion, cors: true }, async (request) => {
  const uid = request.auth?.uid ?? '';
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to respond to friend requests.');
  }

  const requestId = typeof request.data?.requestId === 'string' ? request.data.requestId.trim() : '';
  const action = request.data?.action === 'decline' ? 'decline' : request.data?.action === 'accept' ? 'accept' : '';
  if (!requestId || !action) {
    throw new HttpsError('invalid-argument', 'Choose a friend request response.');
  }

  const requestRef = db.collection('board_friend_requests').doc(requestId);
  const snapshot = await requestRef.get();
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Friend request not found.');
  }
  const data = snapshot.data() as Record<string, unknown>;
  if (data.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'This request has already been handled.');
  }

  const authEmail = normalizeUserEmail((request.auth?.token ?? {}).email);
  const toUserId = typeof data.to_user_id === 'string' ? data.to_user_id : '';
  const toEmail = normalizeUserEmail(data.to_email);
  if (toUserId && toUserId !== uid) {
    throw new HttpsError('permission-denied', 'This friend request belongs to another account.');
  }
  if (!toUserId && (!authEmail || authEmail !== toEmail)) {
    throw new HttpsError('permission-denied', 'This friend request belongs to another email address.');
  }

  const fromUserId = typeof data.from_user_id === 'string' ? data.from_user_id : '';
  if (!fromUserId || fromUserId === uid) {
    throw new HttpsError('failed-precondition', 'This friend request is invalid.');
  }

  const now = new Date().toISOString();
  if (action === 'decline') {
    await requestRef.update({
      status: 'declined',
      to_user_id: uid,
      updated_at: now,
      server_updated_at: FieldValue.serverTimestamp(),
    });
    return { status: 'declined' };
  }

  const friendshipId = boardFriendshipId(fromUserId, uid);
  await db.collection('board_friendships').doc(friendshipId).set({
    id: friendshipId,
    user_ids: [fromUserId, uid].sort(),
    requester_user_id: fromUserId,
    accepted_user_id: uid,
    created_at: now,
    updated_at: now,
    server_updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  await requestRef.update({
    status: 'accepted',
    to_user_id: uid,
    accepted_at: now,
    updated_at: now,
    server_updated_at: FieldValue.serverTimestamp(),
  });
  return { status: 'accepted' };
});

export const addOffGridBoardCard = onCall({ region: callableRegion, cors: true }, async (request) => {
  const contributorUserId = request.auth?.uid ?? '';
  if (!contributorUserId) {
    throw new HttpsError('unauthenticated', 'Sign in before dropping a card.');
  }

  const boardId = offGridContributionText(request.data?.boardId, 120);
  if (!boardId || !/^[a-zA-Z0-9_-]+$/.test(boardId)) {
    throw new HttpsError('invalid-argument', 'Choose a valid Off-grid board.');
  }

  const contributorSnapshot = await db.collection('users').doc(contributorUserId).get();
  const contributor = contributorSnapshot.data() as Record<string, unknown> | undefined;
  const contributorName = offGridContributorName(
    contributor,
    (request.auth?.token ?? {}) as Record<string, unknown>,
  );
  const card = buildOffGridContributionCard(request.data?.card, contributorName, contributorUserId);
  const boardRef = db.collection('boards').doc(boardId);

  await db.runTransaction(async (transaction) => {
    const boardSnapshot = await transaction.get(boardRef);
    if (!boardSnapshot.exists) {
      throw new HttpsError('not-found', 'This Off-grid board no longer exists.');
    }
    const board = boardSnapshot.data() as Record<string, unknown>;
    const ownerUserId = offGridContributionText(board.owner_user_id, 180);
    if (board.visibility !== 'public' || board.kind !== 'off-grid' || !ownerUserId) {
      throw new HttpsError('failed-precondition', 'This board is not open for Off-grid contributions.');
    }

    if (ownerUserId !== contributorUserId) {
      const friendship = await transaction.get(
        db.collection('board_friendships').doc(boardFriendshipId(ownerUserId, contributorUserId)),
      );
      if (!friendship.exists) {
        throw new HttpsError(
          'permission-denied',
          'Only accepted LivingWiki friends of the board owner can add a location.',
        );
      }
    }

    const cards = Array.isArray(board.cards) ? board.cards : [];
    if (cards.length >= 200) {
      throw new HttpsError('resource-exhausted', 'This board has reached its 200-card limit.');
    }
    const updatedAt = new Date().toISOString();
    transaction.update(boardRef, {
      cards: [card, ...cards],
      updated_at_iso: updatedAt,
      server_updated_at: FieldValue.serverTimestamp(),
    });
  });

  return { boardId, card };
});

export const notifyBoardFriendsOnCreate = onDocumentCreated(
  {
    region: callableRegion,
    document: 'boards/{boardId}',
    secrets: [sendgridApiKey],
  },
  async (event) => {
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (!data || data.visibility !== 'public') {
      return;
    }
    const ownerUserId = typeof data.owner_user_id === 'string' ? data.owner_user_id : '';
    if (!ownerUserId) {
      return;
    }

    const friendshipsSnapshot = await db.collection('board_friendships')
      .where('user_ids', 'array-contains', ownerUserId)
      .limit(100)
      .get();
    if (friendshipsSnapshot.empty) {
      return;
    }

    const boardId = event.params.boardId;
    const boardTitle = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'New board';
    const boardDescription = typeof data.description === 'string' ? data.description.trim() : '';
    const boardCoverImageUrl = safeBoardCardRemoteImageUrl(data.imageUrl);
    const friendName = typeof data.owner_display_name === 'string' && data.owner_display_name.trim()
      ? data.owner_display_name.trim()
      : 'A LivingWiki friend';
    const boardRouteKey = publicBoardRouteKey(boardId, data.custom_slug);
    const boardUrl = `${publicAppUrl}/boards/${encodeURIComponent(boardRouteKey)}`;
    const friendIds = friendshipsSnapshot.docs
      .map((doc) => (doc.data().user_ids as unknown[] | undefined)?.find((id) => typeof id === 'string' && id !== ownerUserId))
      .filter((id): id is string => typeof id === 'string');
    const friendDocs = await Promise.all(friendIds.map((id) => db.collection('users').doc(id).get()));

    await Promise.all(friendDocs.map(async (friendDoc) => {
      if (!friendDoc.exists) {
        return;
      }
      const friend = friendDoc.data() as Record<string, unknown>;
      const recipientEmail = normalizeUserEmail(friend.email);
      if (!isValidEmail(recipientEmail)) {
        return;
      }
      const email = buildBoardFriendNewBoardEmail({
        recipientEmail,
        recipientName: displayNameForUser(friend, recipientEmail),
        friendName,
        boardTitle,
        boardDescription,
        boardCoverImageUrl,
        boardUrl,
      });
      try {
        await sendBoardFriendEmail({ recipientEmail, ...email });
      } catch (error) {
        logger.error('Failed to send board friend notification email.', {
          boardId,
          recipientUserId: friendDoc.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }));
  },
);

function buildAtlasSubscriptionEmail(params: {
  recipientEmail: string;
  atlasName: string;
  chatUrl: string;
  unsubscribeUrl: string;
}) {
  const subject = `You're subscribed to Living Wiki Weekly Updates`;
  const safeRecipientEmail = escapeHtml(params.recipientEmail);
  const safeAtlasName = escapeHtml(params.atlasName);
  const safeChatUrl = escapeHtml(params.chatUrl);
  const safeUnsubscribeUrl = escapeHtml(params.unsubscribeUrl);

  const text = `Hi,

You subscribed to Living Wiki Weekly Updates for "${params.atlasName}".

Each week, you will receive related information and updates from this wiki.

Open the wiki chat:
${params.chatUrl}

Unsubscribe:
${params.unsubscribeUrl}

The Living Wiki Team`;

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; padding: 0;">
      <div style="background: linear-gradient(135deg, #0b1f14 0%, #1c7c41 100%); padding: 34px 30px; border-radius: 18px 18px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800;">Living Wiki</h1>
        <p style="color: rgba(255,255,255,0.76); margin: 10px 0 0; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase;">Weekly updates</p>
      </div>
      <div style="background: #ffffff; padding: 32px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 18px 18px;">
        <p style="color: #111827; font-size: 16px; line-height: 1.6; margin: 0 0 18px;">Hi <strong>${safeRecipientEmail}</strong>,</p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 22px;">
          You subscribed to <strong>Living Wiki Weekly Updates</strong> for <strong>${safeAtlasName}</strong>.
        </p>
        <div style="background: #f8faf9; border: 1px solid #dbe8df; border-radius: 14px; padding: 20px; margin: 0 0 24px;">
          <p style="color: #0f2417; font-size: 15px; line-height: 1.6; margin: 0;">
            Each week, you will receive related information and updates from this wiki.
          </p>
        </div>
        <div style="text-align: center; margin: 26px 0;">
          <a href="${safeChatUrl}" style="background: #1c7c41; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 999px; font-weight: 800; display: inline-block; font-size: 15px;">
            Open Wiki Chat
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0;">
          Chat page: <a href="${safeChatUrl}" style="color: #1c7c41; text-decoration: none;">${safeChatUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0 0 8px;">
          You can <a href="${safeUnsubscribeUrl}" style="color: #1c7c41; text-decoration: underline;">unsubscribe from these weekly updates</a> at any time.
        </p>
        <p style="color: #9ca3af; font-size: 13px; margin: 0;">The Living Wiki Team</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

async function sendAtlasSubscriptionEmail(params: {
  recipientEmail: string;
  atlasName: string;
  chatUrl: string;
  unsubscribeUrl: string;
}): Promise<void> {
  const apiKey = sendgridApiKey.value();
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'SendGrid API key is not configured.');
  }

  sgMail.setApiKey(apiKey);
  const email = buildAtlasSubscriptionEmail(params);
  const [response] = await sgMail.send({
    to: params.recipientEmail,
    from: {
      email: inviteSenderEmail,
      name: 'Living Wiki',
    },
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  logger.info('Atlas subscription confirmation accepted by SendGrid.', {
    recipientEmail: params.recipientEmail,
    atlasName: params.atlasName,
    statusCode: response.statusCode,
    messageId: response.headers?.['x-message-id'] ?? null,
  });
}

type VoiceSummaryTranscriptEntry = {
  role: 'user' | 'agent';
  text: string;
};

type VoiceConversationSummary = {
  title: string;
  summary: string;
  keyQuestions: string[];
  takeaways: string[];
  contextualAnswer: string;
  transcriptText: string;
};

type VoiceConversationPlaceLink = {
  name: string;
  reason: string;
  address: string | null;
  websiteUrl: string | null;
  googleMapsUrl: string;
  searchQuery: string;
  rating: number | null;
  ratingCount: number | null;
};

type VoiceConversationRecapInput = {
  title: string;
  summary: string;
  contextual_answer: string;
  key_questions: string[];
  useful_takeaways: string[];
  suggested_places: Array<{
    name: string;
    reason: string;
    search_query: string;
  }>;
};

function normalizeVoiceSummaryTranscript(value: unknown): VoiceSummaryTranscriptEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): VoiceSummaryTranscriptEntry | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const data = item as Record<string, unknown>;
      const role = data.role === 'user' ? 'user' : data.role === 'agent' || data.role === 'assistant' ? 'agent' : null;
      const text = typeof data.text === 'string' ? data.text.replace(/\s+/g, ' ').trim().slice(0, 1000) : '';
      if (!role || !text || /^voice session ended:/i.test(text)) {
        return null;
      }
      return { role, text };
    })
    .filter((item): item is VoiceSummaryTranscriptEntry => !!item)
    .slice(-40);
}

function shortVoiceSummaryLine(value: string, maxLength = 180): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

function buildVoiceConversationSummary(params: {
  atlasName: string;
  cityName: string | null;
  transcript: VoiceSummaryTranscriptEntry[];
  recap?: VoiceConversationRecapInput | null;
}): VoiceConversationSummary {
  const placeName = params.cityName || params.atlasName || 'this wiki';
  const userMessages = params.transcript.filter((item) => item.role === 'user').map((item) => item.text);
  const agentMessages = params.transcript.filter((item) => item.role === 'agent').map((item) => item.text);
  const fallbackKeyQuestions = userMessages.slice(0, 4).map((text) => shortVoiceSummaryLine(text, 160));
  const fallbackTakeaways = agentMessages
    .filter((text) => !/^hello\b/i.test(text))
    .slice(0, 4)
    .map((text) => shortVoiceSummaryLine(text, 190));
  const summaryParts = [
    userMessages[0] ? `You asked about ${shortVoiceSummaryLine(userMessages[0], 120)}` : `You had a voice conversation about ${placeName}.`,
    agentMessages[0] ? `The wiki responded with local context for ${placeName}.` : '',
  ].filter(Boolean);
  const transcriptText = params.transcript
    .map((item) => `${item.role === 'user' ? 'You' : 'Living Wiki'}: ${item.text}`)
    .join('\n');

  return {
    title: params.recap?.title?.trim() || `${placeName} voice chat recap`,
    summary: params.recap?.summary?.trim() || summaryParts.join(' '),
    keyQuestions: params.recap?.key_questions?.length ? params.recap.key_questions : fallbackKeyQuestions,
    takeaways: params.recap?.useful_takeaways?.length ? params.recap.useful_takeaways : fallbackTakeaways,
    contextualAnswer: params.recap?.contextual_answer?.trim() || summaryParts.join(' '),
    transcriptText,
  };
}

function buildVoiceConversationSummaryEmail(params: {
  recipientEmail: string;
  recipientName: string | null;
  atlasName: string;
  cityName: string | null;
  summary: VoiceConversationSummary;
  answerCardUrl: string | null;
  placeLinks: VoiceConversationPlaceLink[];
  continueChatUrl: string;
}) {
  const placeName = params.cityName || params.atlasName || 'this wiki';
  const subject = `Your Living Wiki voice recap for ${placeName}`;
  const greetingName = params.recipientName || params.recipientEmail;
  const safeGreetingName = escapeHtml(greetingName);
  const safePlaceName = escapeHtml(placeName);
  const safeTitle = escapeHtml(params.summary.title);
  const safeSummary = escapeHtml(params.summary.summary);
  const safeContinueChatUrl = escapeHtml(params.continueChatUrl);
  const safeAnswerCardUrl = params.answerCardUrl ? escapeHtml(params.answerCardUrl) : null;
  const placeLinksHtml = params.placeLinks.length
    ? params.placeLinks.map((place) => {
        const safeName = escapeHtml(place.name);
        const safeReason = escapeHtml(place.reason);
        const safeAddress = place.address ? escapeHtml(place.address) : '';
        const safeWebsite = place.websiteUrl ? escapeHtml(place.websiteUrl) : null;
        const safeMaps = escapeHtml(place.googleMapsUrl);
        const rating = typeof place.rating === 'number'
          ? `<span style="color:#6f7d74;font-size:12px;">${place.rating.toFixed(1)}${place.ratingCount ? ` · ${place.ratingCount} reviews` : ''}</span>`
          : '';
        return `
          <div style="border:1px solid #e2e8df;border-radius:14px;padding:14px 15px;margin:0 0 10px;background:#ffffff;">
            <p style="margin:0 0 5px;color:#0d1f15;font-size:15px;font-weight:900;">${safeName}</p>
            ${safeAddress ? `<p style="margin:0 0 6px;color:#526057;font-size:13px;line-height:1.45;">${safeAddress}</p>` : ''}
            <p style="margin:0 0 10px;color:#3f4d45;font-size:13px;line-height:1.5;">${safeReason}</p>
            <p style="margin:0;display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:13px;font-weight:800;">
              ${safeWebsite ? `<a href="${safeWebsite}" style="color:#1c7c41;text-decoration:none;">Website</a>` : ''}
              <a href="${safeMaps}" style="color:#1c7c41;text-decoration:none;">Open in Maps</a>
              ${rating}
            </p>
          </div>
        `;
      }).join('')
    : '';
  const keyQuestionsHtml = params.summary.keyQuestions.length
    ? params.summary.keyQuestions.map((text) => `<li style="margin:0 0 8px;">${escapeHtml(text)}</li>`).join('')
    : '<li style="margin:0 0 8px;">Your voice questions are included in the transcript below.</li>';
  const takeawaysHtml = params.summary.takeaways.length
    ? params.summary.takeaways.map((text) => `<li style="margin:0 0 8px;">${escapeHtml(text)}</li>`).join('')
    : '<li style="margin:0 0 8px;">Open the chat page to continue exploring this wiki.</li>';
  const transcriptHtml = params.summary.transcriptText
    .split('\n')
    .slice(0, 16)
    .map((line) => `<p style="margin:0 0 10px;color:#3f4d45;font-size:13px;line-height:1.55;">${escapeHtml(line)}</p>`)
    .join('');

  const text = `Hi ${greetingName},

Here is your Living Wiki voice recap for ${placeName}.

${params.summary.summary}

Questions and prompts:
${params.summary.keyQuestions.map((item) => `- ${item}`).join('\n') || '- See transcript below.'}

Useful takeaways:
${params.summary.takeaways.map((item) => `- ${item}`).join('\n') || '- Continue in the wiki chat.'}

${params.placeLinks.length ? `Places and links:\n${params.placeLinks.map((place) => `- ${place.name}${place.address ? `, ${place.address}` : ''}${place.websiteUrl ? `\n  Website: ${place.websiteUrl}` : ''}\n  Maps: ${place.googleMapsUrl}`).join('\n')}\n\n` : ''}${params.answerCardUrl ? `Open the full recap card:\n${params.answerCardUrl}\n\n` : ''}Continue the chat:
${params.continueChatUrl}

Transcript:
${params.summary.transcriptText}

The Living Wiki Team`;

  const html = `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:680px;margin:0 auto;padding:0;background:#f6f8f5;">
      <div style="background:linear-gradient(135deg,#07160f 0%,#1c7c41 68%,#d6a94a 100%);padding:34px 30px;border-radius:20px 20px 0 0;">
        <h1 style="color:#ffffff;margin:0;font-size:27px;font-weight:900;letter-spacing:-0.02em;">Living Wiki</h1>
        <p style="color:rgba(255,255,255,0.78);margin:10px 0 0;font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;">Voice recap</p>
      </div>
      <div style="background:#ffffff;padding:30px;border:1px solid #e3e8df;border-top:none;border-radius:0 0 20px 20px;">
        <p style="color:#111827;font-size:15px;line-height:1.65;margin:0 0 18px;">Hi <strong>${safeGreetingName}</strong>,</p>
        <h2 style="color:#0d1f15;font-size:24px;line-height:1.15;margin:0 0 12px;font-weight:900;letter-spacing:-0.03em;">${safeTitle}</h2>
        <p style="color:#3f4d45;font-size:15px;line-height:1.65;margin:0 0 18px;">${safeSummary}</p>
        <div style="background:#f8faf7;border:1px solid #dfe8dc;border-radius:16px;padding:18px 20px;margin:0 0 20px;">
          <p style="margin:0;color:#2f3d35;font-size:14px;line-height:1.65;">${escapeHtml(params.summary.contextualAnswer).replace(/\n/g, '<br>')}</p>
        </div>
        <div style="background:#f8faf7;border:1px solid #dfe8dc;border-radius:16px;padding:18px 20px;margin:0 0 20px;">
          <p style="margin:0 0 10px;color:#0d1f15;font-size:13px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;">Questions and prompts</p>
          <ul style="margin:0;padding-left:20px;color:#2f3d35;font-size:14px;line-height:1.55;">${keyQuestionsHtml}</ul>
        </div>
        <div style="background:#fffaf0;border:1px solid #eedfaf;border-radius:16px;padding:18px 20px;margin:0 0 22px;">
          <p style="margin:0 0 10px;color:#0d1f15;font-size:13px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;">Useful takeaways</p>
          <ul style="margin:0;padding-left:20px;color:#2f3d35;font-size:14px;line-height:1.55;">${takeawaysHtml}</ul>
        </div>
        ${placeLinksHtml ? `
        <div style="background:#f7fbfa;border:1px solid #d8ece7;border-radius:16px;padding:18px 20px;margin:0 0 22px;">
          <p style="margin:0 0 12px;color:#0d1f15;font-size:13px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;">Places from your conversation</p>
          ${placeLinksHtml}
        </div>
        ` : ''}
        <div style="text-align:center;margin:26px 0;">
          ${safeAnswerCardUrl ? `<a href="${safeAnswerCardUrl}" style="background:#0f2417;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:900;display:inline-block;font-size:14px;margin:0 6px 10px;">Open Full Recap Card</a>` : ''}
          <a href="${safeContinueChatUrl}" style="background:#1c7c41;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:900;display:inline-block;font-size:14px;margin:0 6px 10px;">Continue in ${safePlaceName}</a>
        </div>
        <div style="border-top:1px solid #e5e7eb;margin:24px 0 0;padding-top:20px;">
          <p style="margin:0 0 12px;color:#0d1f15;font-size:13px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;">Transcript excerpt</p>
          ${transcriptHtml}
        </div>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:13px;margin:0;">The Living Wiki Team</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

async function createVoiceConversationAnswerCard(params: {
  uid: string | null;
  atlasId: string | null;
  atlasName: string | null;
  cityHint: string | null;
  question: string;
  answer: string;
  locations: MappableLocation[];
}): Promise<{ id: string; url: string } | null> {
  if (!params.answer.trim() || params.answer.length < 120) {
    return null;
  }

  const generated = await generateAnswerCard({
    question: params.question.slice(0, 2000),
    answer: params.answer.slice(0, 8000),
    atlasName: params.atlasName,
    cityHint: params.cityHint,
    locations: params.locations,
  });
  const record: AnswerCardRecord = {
    owner_user_id: params.uid,
    atlas_id: params.atlasId,
    atlas_name: params.atlasName,
    question: params.question.slice(0, 2000),
    answer_preview: params.answer.slice(0, 900),
    title: generated.title,
    subtitle: generated.subtitle,
    key_facts: generated.key_facts,
    did_you_know: generated.did_you_know,
    mappable_locations: params.locations,
    source_thread_id: null,
    source_message_id: null,
    source_message_kind: null,
    source_answer_mode: 'internet',
    answer_quiz_id: null,
    like_count: 0,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };
  const docRef = db.collection('answer_cards').doc();
  await docRef.set(record);
  return {
    id: docRef.id,
    url: `${publicAppUrl}/answer-card/${encodeURIComponent(docRef.id)}`,
  };
}

function voicePlaceMapSearchUrl(searchQuery: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
}

async function fetchGooglePlaceDetails(placeId: string, apiKey: string): Promise<GooglePlaceDetailsResponse['result'] | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'place_id,name,formatted_address,website,url,rating,user_ratings_total,types,geometry');
  url.searchParams.set('key', apiKey);
  const data = await fetchJson<GooglePlaceDetailsResponse>(url.toString());
  if (data.status && !['OK', 'ZERO_RESULTS'].includes(data.status)) {
    logger.warn('Google Place Details lookup failed for voice recap.', {
      status: data.status,
      error: data.error_message,
      placeId,
    });
    return null;
  }
  return data.result ?? null;
}

async function resolveVoiceConversationPlaceLinks(params: {
  atlas: Record<string, unknown> | null;
  cityHint: string | null;
  suggestedPlaces: VoiceConversationRecapInput['suggested_places'];
}): Promise<{ links: VoiceConversationPlaceLink[]; locations: MappableLocation[] }> {
  const deduped = new Map<string, VoiceConversationRecapInput['suggested_places'][number]>();
  for (const place of params.suggestedPlaces ?? []) {
    const name = place.name?.replace(/\s+/g, ' ').trim();
    const query = place.search_query?.replace(/\s+/g, ' ').trim();
    if (!name || !query) {
      continue;
    }
    const key = `${name}|${query}`.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, {
        name: name.slice(0, 120),
        reason: (place.reason || 'Mentioned in your voice conversation.').replace(/\s+/g, ' ').trim().slice(0, 180),
        search_query: query.slice(0, 180),
      });
    }
  }

  const apiKey = googlePlacesApiKey.value();
  const links: VoiceConversationPlaceLink[] = [];
  const locations: MappableLocation[] = [];
  const context = params.atlas ? cityAtlasSearchContext(params.atlas) : params.cityHint ?? '';

  for (const place of Array.from(deduped.values()).slice(0, 6)) {
    const baseQuery = `${place.search_query} ${context}`.trim();
    let resolvedName = place.name;
    let address: string | null = null;
    let websiteUrl: string | null = null;
    let googleMapsUrl = voicePlaceMapSearchUrl(baseQuery);
    let rating: number | null = null;
    let ratingCount: number | null = null;

    if (apiKey) {
      try {
        const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
        searchUrl.searchParams.set('query', baseQuery);
        searchUrl.searchParams.set('key', apiKey);
        const search = await fetchJson<GooglePlacesTextSearchResponse>(searchUrl.toString());
        if (search.status && !['OK', 'ZERO_RESULTS'].includes(search.status)) {
          logger.warn('Google Places text search failed for voice recap.', {
            status: search.status,
            error: search.error_message,
            query: baseQuery,
          });
        }
        const candidate = (search.results ?? []).map(googleCandidateFromResult).find((item): item is CityPlaceCandidate => !!item);
        if (candidate) {
          resolvedName = candidate.name;
          address = candidate.address || null;
          googleMapsUrl = candidate.googleMapsUrl || googleMapsUrl;
          rating = typeof candidate.ratingAvg === 'number' ? candidate.ratingAvg : null;
          ratingCount = typeof candidate.ratingCount === 'number' ? candidate.ratingCount : null;

          const details = await fetchGooglePlaceDetails(candidate.placeId, apiKey);
          if (details) {
            resolvedName = textFromUnknown(details.name) || resolvedName;
            address = textFromUnknown(details.formatted_address) || address;
            websiteUrl = textFromUnknown(details.website) || null;
            googleMapsUrl = textFromUnknown(details.url) || googleMapsUrl;
            rating = typeof details.rating === 'number' ? details.rating : rating;
            ratingCount = typeof details.user_ratings_total === 'number' ? details.user_ratings_total : ratingCount;
          }
        }
      } catch (error) {
        logger.warn('Voice recap place enrichment failed for one place.', {
          query: baseQuery,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const searchQuery = [resolvedName, address || context].filter(Boolean).join(', ');
    links.push({
      name: resolvedName,
      reason: place.reason,
      address,
      websiteUrl,
      googleMapsUrl,
      searchQuery,
      rating,
      ratingCount,
    });
    locations.push({
      name: resolvedName,
      search_query: searchQuery || baseQuery,
      address_hint: address,
    });
  }

  return { links, locations };
}

type NewsletterSourceLink = {
  title: string;
  url: string;
};

function renderNewsletterInline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" style="color:#1c7c41;text-decoration:none;font-weight:700;">$1</a>');
}

function newsletterHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

function newsletterSourceFromLine(line: string): NewsletterSourceLink | null {
  const markdownLink = line.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
  if (markdownLink) {
    return {
      title: markdownLink[1].trim() || newsletterHost(markdownLink[2]),
      url: markdownLink[2].trim().replace(/[).,;]+$/g, ''),
    };
  }

  const rawUrl = line.match(/(https?:\/\/\S+)/);
  if (!rawUrl) {
    return null;
  }

  const url = rawUrl[1].trim().replace(/[).,;]+$/g, '');
  const title = line
    .replace(rawUrl[1], '')
    .replace(/^[-*\s]*(source|read article|article|link)\s*:/i, '')
    .replace(/[:.\s-]+$/, '')
    .trim();
  return {
    title: title || newsletterHost(url),
    url,
  };
}

async function resolveNewsletterUrl(url: string): Promise<string> {
  const trimmed = url.trim().replace(/[).,;]+$/g, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const isGoogleGroundingRedirect =
    /vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/i.test(trimmed) ||
    /google\.com\/search/i.test(trimmed);
  if (!isGoogleGroundingRedirect) {
    return trimmed;
  }

  try {
    const response = await fetch(trimmed, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    const location = response.headers.get('location');
    if (location && /^https?:\/\//i.test(location)) {
      return location;
    }
    if (response.url && response.url !== trimmed && /^https?:\/\//i.test(response.url)) {
      return response.url;
    }
  } catch (error) {
    logger.warn('Failed to resolve newsletter source redirect.', {
      url: trimmed,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return trimmed;
}

function looksLikeMissingPage(html: string): boolean {
  const normalized = html.toLowerCase().slice(0, 120_000);
  return (
    /<title>[^<]*(404|not found|page not found|access denied|forbidden)[^<]*<\/title>/i.test(normalized) ||
    normalized.includes('the page you requested could not be found') ||
    normalized.includes('this page could not be found') ||
    normalized.includes('page not found') ||
    normalized.includes('404 not found')
  );
}

async function validateNewsletterUrl(url: string): Promise<string | null> {
  const resolvedUrl = await resolveNewsletterUrl(url);
  if (
    !/^https?:\/\//i.test(resolvedUrl) ||
    /vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/i.test(resolvedUrl) ||
    /google\.com\/search/i.test(resolvedUrl)
  ) {
    return null;
  }

  try {
    const result = await fetchHtmlWithFallback(resolvedUrl, { timeoutMs: 18_000 });
    const finalUrl = (result.finalUrl || resolvedUrl).trim();
    if (
      result.status < 200 ||
      result.status >= 400 ||
      !/^https?:\/\//i.test(finalUrl) ||
      /vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/i.test(finalUrl) ||
      /google\.com\/search/i.test(finalUrl) ||
      looksLikeAntiBotChallenge(result.html) ||
      looksLikeMissingPage(result.html)
    ) {
      logger.warn('Newsletter source URL rejected.', {
        url: resolvedUrl,
        finalUrl,
        status: result.status,
        method: result.method,
      });
      return null;
    }
    return finalUrl;
  } catch (error) {
    logger.warn('Newsletter source URL validation failed.', {
      url: resolvedUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function prepareNewsletterMarkdownLinks(markdown: string): Promise<{ markdown: string; validUrls: Set<string> }> {
  const urls = new Set<string>();
  for (const match of markdown.matchAll(/https?:\/\/[^\s)]+/g)) {
    urls.add(match[0].replace(/[).,;]+$/g, ''));
  }
  if (urls.size === 0) {
    return { markdown, validUrls: new Set<string>() };
  }

  const validatedEntries = await Promise.all(
    Array.from(urls).map(async (url) => [url, await validateNewsletterUrl(url)] as const),
  );
  const validatedByUrl = new Map(validatedEntries);
  const validUrls = new Set<string>();
  let nextMarkdown = markdown;
  for (const [original, validUrl] of validatedByUrl.entries()) {
    if (validUrl) {
      validUrls.add(validUrl);
      if (original !== validUrl) {
        nextMarkdown = nextMarkdown.split(original).join(validUrl);
      }
    }
  }
  return { markdown: nextMarkdown, validUrls };
}

function renderHeadlineSourceButton(source: NewsletterSourceLink): string {
  const safeUrl = escapeHtml(source.url);
  const safeTitle = escapeHtml(source.title.length > 72 ? `${source.title.slice(0, 69)}...` : source.title);
  const safeHost = escapeHtml(newsletterHost(source.url));
  return `
    <a href="${safeUrl}" style="display:inline-block;margin-top:14px;background:#102016;color:#ffffff;text-decoration:none;padding:11px 15px;border-radius:999px;font-size:13px;font-weight:900;">
      Read article
    </a>
    <span style="display:block;margin-top:7px;color:#6f7d74;font-size:12px;line-height:1.4;">${safeTitle} · ${safeHost}</span>`;
}

function renderNewsletterMarkdown(
  markdown: string,
  fallbackSources: NewsletterSourceLink[] = [],
  validUrls = new Set<string>(),
): { html: string; usedSourceUrls: string[] } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  const usedSourceUrls = new Set<string>();
  let inList = false;
  let inHeadlineCard = false;
  let headlineSource: NewsletterSourceLink | null = null;
  let fallbackSourceIndex = 0;

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };
  const nextFallbackSource = (): NewsletterSourceLink | null => {
    while (fallbackSourceIndex < fallbackSources.length) {
      const source = fallbackSources[fallbackSourceIndex];
      fallbackSourceIndex += 1;
      if (!usedSourceUrls.has(source.url)) {
        return source;
      }
    }
    return null;
  };
  const closeHeadlineCard = () => {
    closeList();
    if (inHeadlineCard) {
      const source = headlineSource ?? nextFallbackSource();
      if (source) {
        usedSourceUrls.add(source.url);
        html.push(renderHeadlineSourceButton(source));
      }
      html.push('</div>');
      inHeadlineCard = false;
      headlineSource = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    if (line.startsWith('### ')) {
      closeHeadlineCard();
      html.push('<div style="margin:16px 0;padding:20px;border:1px solid #dfe9e3;border-radius:18px;background:#fbfdfb;">');
      const source = newsletterSourceFromLine(line);
      if (source && validUrls.has(source.url)) {
        headlineSource = source;
      }
      html.push(`<h3 style="margin:0 0 10px;color:#102016;font-size:18px;line-height:1.25;">${renderNewsletterInline(line.slice(4).replace(/\s*\[[^\]]+\]\(https?:\/\/[^)\s]+\)\s*/g, '').trim())}</h3>`);
      inHeadlineCard = true;
      continue;
    }

    if (line.startsWith('## ')) {
      closeHeadlineCard();
      html.push(`<h2 style="margin:28px 0 12px;color:#102016;font-size:20px;line-height:1.2;">${renderNewsletterInline(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith('# ')) {
      closeHeadlineCard();
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      const listText = line.slice(2).trim();
      if (inHeadlineCard && /^(source|read article|article|link)\s*:/i.test(listText)) {
        closeList();
        const source = newsletterSourceFromLine(listText);
        if (source && validUrls.has(source.url)) {
          headlineSource = source;
        }
        continue;
      }

      if (!inList) {
        html.push('<ul style="margin:8px 0 0;padding-left:20px;color:#34443b;font-size:14px;line-height:1.6;">');
        inList = true;
      }
      html.push(`<li style="margin:6px 0;">${renderNewsletterInline(listText)}</li>`);
      continue;
    }

    if (inHeadlineCard && /^(source|read article|article|link)\s*:/i.test(line)) {
      closeList();
      const source = newsletterSourceFromLine(line);
      if (source && validUrls.has(source.url)) {
        headlineSource = source;
      }
      continue;
    }

    closeList();
    html.push(`<p style="margin:0 0 16px;color:#34443b;font-size:15px;line-height:1.68;">${renderNewsletterInline(line)}</p>`);
  }

  closeHeadlineCard();
  return { html: html.join('\n'), usedSourceUrls: Array.from(usedSourceUrls) };
}

function extractNewsletterSources(markdown: string, validUrls = new Set<string>()): { bodyMarkdown: string; sources: NewsletterSourceLink[] } {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const sourceMatch = normalized.match(/\n##\s+Sources\s*\n/i);
  const bodyMarkdown = (sourceMatch ? normalized.slice(0, sourceMatch.index).trim() : normalized.trim())
    .split('\n')
    .filter((line) => !/^sources$/i.test(line.trim()))
    .join('\n')
    .trim();
  const sourceMarkdown = sourceMatch ? normalized.slice((sourceMatch.index ?? 0) + sourceMatch[0].length) : '';
  const sources = new Map<string, string>();

  const addSource = (title: string, url: string) => {
    const cleanUrl = url.trim().replace(/[).,;]+$/g, '');
    if (!/^https?:\/\//i.test(cleanUrl) || sources.has(cleanUrl) || (validUrls.size > 0 && !validUrls.has(cleanUrl))) {
      return;
    }
    const cleanTitle = title
      .replace(/^[-*\d.\s]+/, '')
      .replace(/\s+/g, ' ')
      .replace(/[:.\s-]+$/, '')
      .trim();
    if (/current time information/i.test(cleanTitle)) {
      return;
    }
    sources.set(cleanUrl, cleanTitle || new URL(cleanUrl).hostname.replace(/^www\./, ''));
  };

  for (const match of sourceMarkdown.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    addSource(match[1], match[2]);
  }
  for (const line of sourceMarkdown.split('\n')) {
    const match = line.match(/^(.*?)(https?:\/\/\S+)/);
    if (match) {
      addSource(match[1], match[2]);
    }
  }

  return {
    bodyMarkdown,
    sources: Array.from(sources.entries()).slice(0, 8).map(([url, title]) => ({ title, url })),
  };
}

function renderNewsletterSourceButtons(sources: NewsletterSourceLink[], title = 'More source links'): string {
  if (sources.length === 0) {
    return '';
  }

  const buttons = sources
    .map((source) => {
      const safeTitle = escapeHtml(source.title.length > 72 ? `${source.title.slice(0, 69)}...` : source.title);
      const safeUrl = escapeHtml(source.url);
      let host = '';
      try {
        host = new URL(source.url).hostname.replace(/^www\./, '');
      } catch {
        host = 'Source';
      }
      return `
        <a href="${safeUrl}" style="display:block;margin:8px 0;padding:13px 14px;border:1px solid #dbe8df;border-radius:14px;background:#ffffff;color:#102016;text-decoration:none;">
          <span style="display:block;font-size:14px;font-weight:800;line-height:1.35;">${safeTitle}</span>
          <span style="display:block;margin-top:3px;color:#6f7d74;font-size:12px;">${escapeHtml(host)}</span>
        </a>`;
    })
    .join('');

  return `
    <div style="margin:28px 0 0;padding:18px;border-radius:18px;background:#f8faf9;border:1px solid #dbe8df;">
      <p style="margin:0 0 8px;color:#102016;font-size:13px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;">${escapeHtml(title)}</p>
      ${buttons}
    </div>`;
}

function stripMarkdownForPreview(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_`>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function extractNewsletterHeadlineTitles(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('### '))
    .map((line) => line.slice(4).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim())
    .filter(Boolean)
    .slice(0, 5);
}

function mergeNewsletterSources(primary: NewsletterSourceLink[], secondary: NewsletterSourceLink[]): NewsletterSourceLink[] {
  const byUrl = new Map<string, NewsletterSourceLink>();
  for (const source of [...primary, ...secondary]) {
    if (!byUrl.has(source.url)) {
      byUrl.set(source.url, source);
    }
  }
  return Array.from(byUrl.values());
}

async function findAdditionalNewsletterSources(params: {
  atlasName: string;
  headlines: string[];
}): Promise<NewsletterSourceLink[]> {
  if (params.headlines.length === 0) {
    return [];
  }

  try {
    const response = await answerWithGoogleSearch({
      question: [
        `Find direct, reachable publisher article URLs for these ${params.atlasName} newsletter headlines.`,
        'Return only markdown bullets in this exact form: - [Publication or article title](direct URL)',
        'Do not use Google search URLs, grounding redirect URLs, homepages, tag pages, or calendar listing pages.',
        'Prefer official city, transit, school district, newsroom, or established local news article pages.',
        '',
        ...params.headlines.map((headline, index) => `${index + 1}. ${headline}`),
      ].join('\n'),
    });
    const prepared = await prepareNewsletterMarkdownLinks(response.answer);
    return extractNewsletterSources(`\n## Sources\n${prepared.markdown}`, prepared.validUrls).sources;
  } catch (error) {
    logger.warn('Failed to find additional newsletter sources.', {
      atlasName: params.atlasName,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function buildNewsletterQuestion(params: {
  atlasName: string;
  atlasSlug: string;
  prompt: string;
}): string {
  return [
    params.prompt,
    '',
    `Wiki name: ${params.atlasName}`,
    `Wiki slug/context: ${params.atlasSlug}`,
    '',
    'Return a short complete newsletter body in clean markdown.',
    'Hard requirements:',
    '- Exactly five headline sections. No more and no fewer.',
    '- Keep the full body under 750 words.',
    '- Do not include raw URLs in the body.',
    '- Do not create a Sources section; citation links will be handled separately.',
    '- Each headline must be specific and timely, with dates when known.',
    '- Each headline must include one final source line in this exact form: "- Read article: [Publication or article name](source URL)".',
    '- The Read article URL must point to the most relevant article/source for that headline.',
    '- Use direct publisher URLs only for Read article links. Never use google.com/search, vertexaisearch.cloud.google.com, or grounding-api-redirect URLs.',
    '',
    'Use this exact structure:',
    '# A timely, specific title',
    'A one-paragraph opening, maximum 45 words.',
    '## Five headlines to know',
    '### Headline 1',
    '- What happened: one sentence.',
    '- Why it matters: one sentence.',
    '- Read article: [Publication or article name](source URL)',
    '### Headline 2',
    '- What happened: one sentence.',
    '- Why it matters: one sentence.',
    '- Read article: [Publication or article name](source URL)',
    'Continue through Headline 5.',
    '## What to watch next',
    '- Three short bullets maximum.',
    '',
    'Make it professional, factual, and useful. Do not invent facts. Avoid generic filler.',
  ].join('\n');
}

async function generateAtlasNewsletterContent(params: {
  atlasId: string;
  atlas: Record<string, unknown>;
  config: AtlasNewsletterConfig;
}): Promise<{ subject: string; markdown: string; previewText: string }> {
  const atlasName = atlasDisplayName(params.atlas, params.atlasId);
  const atlasSlug = typeof params.atlas.slug === 'string' && params.atlas.slug.trim()
    ? params.atlas.slug.trim()
    : params.atlasId;
  const response = await answerWithGoogleSearch({
    question: buildNewsletterQuestion({
      atlasName,
      atlasSlug,
      prompt: params.config.prompt,
    }),
    personaPrompt: typeof params.atlas.persona_prompt === 'string' ? params.atlas.persona_prompt : null,
  });
  const markdown = response.answer.trim();
  const title = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '))
    ?.replace(/^#\s+/, '')
    .trim();
  const subject = title
    ? `${atlasName}: ${title}`.slice(0, 140)
    : `${atlasName} Weekly Update`;
  return {
    subject,
    markdown,
    previewText: stripMarkdownForPreview(markdown),
  };
}

async function buildNewsletterEmail(params: {
  atlasName: string;
  subject: string;
  markdown: string;
  previewText: string;
  chatUrl: string;
  unsubscribeUrl?: string | null;
}) {
  const safeAtlasName = escapeHtml(params.atlasName);
  const safeSubject = escapeHtml(params.subject);
  const safePreview = escapeHtml(params.previewText);
  const safeChatUrl = escapeHtml(params.chatUrl);
  const safeUnsubscribeUrl = params.unsubscribeUrl ? escapeHtml(params.unsubscribeUrl) : '';
  const prepared = await prepareNewsletterMarkdownLinks(params.markdown);
  const extracted = extractNewsletterSources(prepared.markdown, prepared.validUrls);
  const bodyMarkdown = extracted.bodyMarkdown;
  let sources = extracted.sources;
  if (sources.length < 5) {
    const extraSources = await findAdditionalNewsletterSources({
      atlasName: params.atlasName,
      headlines: extractNewsletterHeadlineTitles(bodyMarkdown),
    });
    sources = mergeNewsletterSources(sources, extraSources).slice(0, 8);
    for (const source of sources) {
      prepared.validUrls.add(source.url);
    }
  }
  const renderedBody = renderNewsletterMarkdown(bodyMarkdown, sources.slice(0, 5), prepared.validUrls);
  const bodyHtml = renderedBody.html;
  const usedSourceUrls = new Set(renderedBody.usedSourceUrls);
  const extraSources = sources.filter((source) => !usedSourceUrls.has(source.url)).slice(0, 3);
  const sourceButtonsHtml = renderNewsletterSourceButtons(extraSources, 'Additional source links');
  const unsubscribeText = params.unsubscribeUrl
    ? `\n\nUnsubscribe: ${params.unsubscribeUrl}`
    : '';
  const sourceText = sources.length
    ? `\n\nSource links:\n${sources.map((source) => `- ${source.title}: ${source.url}`).join('\n')}`
    : '';

  const text = `${params.subject}

${bodyMarkdown}${sourceText}

Open this wiki:
${params.chatUrl}${unsubscribeText}`;

  const html = `
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;">${safePreview}</div>
    <div style="margin:0;padding:0;background:#f3f7f4;">
      <div style="font-family:Inter,'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:720px;margin:0 auto;padding:28px 16px;">
        <div style="background:#0b1f14;border-radius:24px 24px 0 0;padding:34px 32px;border:1px solid #173a25;">
          <p style="margin:0 0 8px;color:#ffffff;font-size:20px;font-weight:900;line-height:1;">Living Wiki</p>
          <p style="margin:0 0 22px;color:#90d7aa;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;">Weekly Updates</p>
          <h1 style="margin:0;color:#ffffff;font-size:32px;line-height:1.08;font-weight:900;">${safeSubject}</h1>
          <p style="margin:14px 0 0;color:rgba(255,255,255,.72);font-size:15px;line-height:1.6;">A curated local intelligence briefing from ${safeAtlasName}.</p>
        </div>
        <div style="background:#ffffff;border:1px solid #dfe9e3;border-top:0;padding:32px;border-radius:0 0 24px 24px;">
          ${bodyHtml}
          ${sourceButtonsHtml}
          <div style="margin:30px 0 0;padding:20px;border-radius:18px;background:#102016;border:1px solid #173a25;">
            <p style="margin:0;color:rgba(255,255,255,.78);font-size:14px;line-height:1.65;">Continue the conversation with this Living Wiki.</p>
            <a href="${safeChatUrl}" style="display:inline-block;margin-top:14px;background:#ffffff;color:#102016;text-decoration:none;padding:12px 18px;border-radius:999px;font-size:14px;font-weight:900;">Open Wiki Chat</a>
          </div>
          <div style="margin:20px 0 0;padding:16px;border-radius:16px;background:#f8faf9;border:1px solid #dbe8df;">
            <p style="margin:0;color:#34443b;font-size:14px;line-height:1.65;font-weight:800;">Reading note</p>
            <p style="margin:8px 0 0;color:#6f7d74;font-size:12px;line-height:1.55;">Forward-looking items can change quickly. Use the source buttons above to check the latest detail.</p>
          </div>
          <hr style="border:none;border-top:1px solid #e5ece7;margin:28px 0 18px;">
          <p style="margin:0;color:#7a8780;font-size:12px;line-height:1.65;">
            You received this Living Wiki email because you subscribed to weekly updates for <strong style="color:#34443b;">${safeAtlasName}</strong>.
            ${safeUnsubscribeUrl ? `You can <a href="${safeUnsubscribeUrl}" style="color:#1c7c41;text-decoration:underline;font-weight:700;">unsubscribe from these Living Wiki updates</a> at any time.` : ''}
          </p>
          <p style="margin:10px 0 0;color:#9aa6a0;font-size:12px;line-height:1.55;">
            Living Wiki turns local knowledge into useful, current briefings and conversations.
          </p>
        </div>
      </div>
    </div>
  `;

  return { subject: params.subject, text, html };
}

async function sendNewsletterEmail(params: {
  recipientEmail: string;
  atlasName: string;
  subject: string;
  markdown: string;
  previewText: string;
  chatUrl: string;
  unsubscribeUrl?: string | null;
}): Promise<string | null> {
  const apiKey = sendgridApiKey.value();
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'SendGrid API key is not configured.');
  }

  sgMail.setApiKey(apiKey);
  const email = await buildNewsletterEmail(params);
  const [response] = await sgMail.send({
    to: params.recipientEmail,
    from: {
      email: inviteSenderEmail,
      name: 'Living Wiki',
    },
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  return typeof response.headers?.['x-message-id'] === 'string'
    ? response.headers['x-message-id']
    : null;
}

async function listActiveAtlasSubscriptions(atlasId: string) {
  const subscriptionsSnapshot = await db
    .collection('atlas_subscriptions')
    .where('atlas_id', '==', atlasId)
    .limit(1000)
    .get();

  return subscriptionsSnapshot.docs
    .map((snapshot) => ({ id: snapshot.id, data: snapshot.data() as Record<string, unknown>, ref: snapshot.ref }))
    .filter((subscription) => subscription.data.status === 'active' && typeof subscription.data.email === 'string' && subscription.data.email);
}

async function ensureSubscriptionUnsubscribeToken(subscription: {
  id: string;
  data: Record<string, unknown>;
  ref: DocumentReference;
}): Promise<string> {
  const existing = typeof subscription.data.unsubscribe_token === 'string'
    ? subscription.data.unsubscribe_token.trim()
    : '';
  if (existing) {
    return existing;
  }
  const token = randomUUID();
  await subscription.ref.set(
    {
      unsubscribe_token: token,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return token;
}

function buildSubscriptionUnsubscribeUrl(subscriptionId: string, token: string): string {
  return `${publicFunctionsBaseUrl}/unsubscribeAtlasSubscription?sid=${encodeURIComponent(subscriptionId)}&token=${encodeURIComponent(token)}`;
}

async function loadOwnedAtlasForAdminMutation(atlasId: string, userId: string) {
  const atlasRef = db.collection('atlases').doc(atlasId);
  const atlasSnapshot = await atlasRef.get();
  if (!atlasSnapshot.exists) {
    throw new HttpsError('not-found', 'Atlas not found.');
  }

  const atlas = atlasSnapshot.data() as Record<string, unknown> | undefined;
  if (!atlas?.user_id || String(atlas.user_id) !== userId) {
    throw new HttpsError('permission-denied', 'Only the wiki owner can manage admins.');
  }

  return { atlasRef, atlas };
}

async function loadAtlasForAdminAccess(atlasId: string, userId: string) {
  const atlasSnapshot = await db.collection('atlases').doc(atlasId).get();
  if (!atlasSnapshot.exists) {
    throw new HttpsError('not-found', 'Atlas not found.');
  }

  const atlas = atlasSnapshot.data() as Record<string, unknown> | undefined;
  const ownerId = String(atlas?.user_id ?? '');
  const adminIds = Array.isArray(atlas?.admin_user_ids)
    ? atlas.admin_user_ids.map((value) => String(value))
    : [];
  if (ownerId !== userId && !adminIds.includes(userId)) {
    throw new HttpsError('permission-denied', 'You do not have access to this wiki admin data.');
  }

  return { atlasSnapshot, atlas: atlas ?? {} };
}

export const listPlatformUsers = onCall({ region: callableRegion, cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  await assertPlatformAdmin(request.auth.uid);

  const snapshot = await db.collection('users').get();
  const users = snapshot.docs
    .map((userDoc) => {
      const data = userDoc.data() as Record<string, unknown>;
      return {
        id: userDoc.id,
        email: typeof data.email === 'string' ? data.email : null,
        displayName: typeof data.displayName === 'string' ? data.displayName : null,
        role: data.role === 'admin' ? 'admin' : 'user',
        emailVerified: data.emailVerified === true,
        providers: Array.isArray(data.providers)
          ? data.providers.filter((provider): provider is string => typeof provider === 'string')
          : [],
        creationTime: timestampToIso(data.creationTime),
        lastSignInTime: timestampToIso(data.lastSignInTime),
        updatedAt: timestampToIso(data.updatedAt),
      };
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.lastSignInTime ?? a.updatedAt ?? a.creationTime ?? '') || 0;
      const bTime = Date.parse(b.lastSignInTime ?? b.updatedAt ?? b.creationTime ?? '') || 0;
      if (aTime !== bTime) return bTime - aTime;
      return (a.email ?? a.id).localeCompare(b.email ?? b.id);
    });

  return {
    total: users.length,
    admins: users.filter((user) => user.role === 'admin').length,
    users,
  };
});

export const listCityReviewedPlaces = onCall({ region: callableRegion, cors: true }, async (request) => {
  const atlasId = textFromUnknown(request.data?.atlasId);
  if (!atlasId) {
    throw new HttpsError('invalid-argument', 'Atlas ID is required.');
  }

  const atlas = await loadPublicAtlasById(atlasId);
  assertPublicCityAtlas(atlas);

  const snapshot = await db
    .collection('city_places')
    .where('atlas_id', '==', atlasId)
    .limit(80)
    .get();

  const places = snapshot.docs
    .map((doc) => serializeCityPlace(doc.id, doc.data() as Record<string, unknown>))
    .sort((a, b) => {
      const countDelta = (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
      if (countDelta !== 0) return countDelta;
      const ratingDelta = (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0);
      if (ratingDelta !== 0) return ratingDelta;
      return (b.latestReviewAt ?? '').localeCompare(a.latestReviewAt ?? '');
    })
    .slice(0, 24);

  return { places };
});

export const searchCityPlaces = onCall(
  { region: callableRegion, cors: true, secrets: [googlePlacesApiKey], timeoutSeconds: 30, memory: '512MiB' },
  async (request) => {
    const atlasId = textFromUnknown(request.data?.atlasId);
    const query = textFromUnknown(request.data?.query).slice(0, 120);
    if (!atlasId || query.length < 2) {
      throw new HttpsError('invalid-argument', 'A city and search query are required.');
    }

    const atlas = await loadPublicAtlasById(atlasId);
    assertPublicCityAtlas(atlas);

    const reviewedSnapshot = await db
      .collection('city_places')
      .where('atlas_id', '==', atlasId)
      .limit(80)
      .get();

    const reviewedPlaces = reviewedSnapshot.docs
      .map((doc) => serializeCityPlace(doc.id, doc.data() as Record<string, unknown>))
      .filter((place) => matchesPlaceQuery(place, query))
      .slice(0, 5);

    const key = googlePlacesApiKey.value();
    if (!key) {
      return { places: reviewedPlaces, candidates: reviewedPlaces };
    }

    const searchRequest = buildCityPlaceTextSearchRequest(query, cityAtlasPlaceSearchBias(atlas));
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', searchRequest.query);
    if (searchRequest.location) {
      url.searchParams.set('location', searchRequest.location);
    }
    if (searchRequest.radius) {
      url.searchParams.set('radius', String(searchRequest.radius));
    }
    if (searchRequest.region) {
      url.searchParams.set('region', searchRequest.region);
    }
    url.searchParams.set('key', key);

    const data = await fetchJson<GooglePlacesTextSearchResponse>(url.toString());
    if (data.status && !['OK', 'ZERO_RESULTS'].includes(data.status)) {
      logger.warn('Google Places text search failed', { status: data.status, error: data.error_message });
      throw new HttpsError('unavailable', data.error_message || 'Place search is temporarily unavailable.');
    }

    const seen = new Set(reviewedPlaces.map((place) => place.placeId).filter(Boolean));
    const googlePlaces = (data.results ?? [])
      .map(googleCandidateFromResult)
      .filter((candidate): candidate is CityPlaceCandidate => !!candidate)
      .filter((candidate) => {
        if (seen.has(candidate.placeId)) {
          return false;
        }
        seen.add(candidate.placeId);
        return true;
      })
      .slice(0, cityPlaceSearchGoogleResultLimit);

    return {
      places: reviewedPlaces,
      candidates: [...reviewedPlaces, ...googlePlaces].slice(0, cityPlaceSearchCandidateLimit),
    };
  },
);

type BoardWizardCallableData = {
  mode?: unknown;
  prompt?: unknown;
  pastedList?: unknown;
  url?: unknown;
  photoNames?: unknown;
  photos?: unknown;
  imageOnly?: unknown;
  currentCard?: unknown;
  targetBoardId?: unknown;
  targetBoardTitle?: unknown;
  defaultType?: unknown;
  count?: unknown;
  vibe?: unknown;
  mediaMode?: unknown;
  narrationStyle?: unknown;
  tourOptions?: unknown;
  existingCards?: unknown;
  singleTourStop?: unknown;
  sourceManifest?: unknown;
};

type BoardWizardTourOptions = {
  voiceStyle: GeneratedBoardTourVoiceStyle;
  paceOrRouteStyle: string;
  extras: string[];
};

type BoardWizardUrlLink = {
  label: string;
  href: string;
};

type BoardWizardUrlImage = {
  alt: string;
  src: string;
};

type BoardWizardCurrentCard = {
  title: string;
  subtitle: string;
  notes: string;
  type: GeneratedBoardWizardCard['type'];
  scope: GeneratedBoardWizardCard['scope'];
  status: GeneratedBoardWizardCard['status'];
  rating: number;
  tags: string[];
  image_query: string;
  place_query: string;
  entity_name?: string;
  entity_type?: GeneratedBoardWizardCard['entity_type'];
  image_intent?: GeneratedBoardWizardCard['image_intent'];
  image_context?: string;
  media_kind?: GeneratedBoardWizardCard['media_kind'];
  short_summary?: string;
  rank?: number;
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
  imageSource?: GeneratedBoardWizardCard['imageSource'];
  extractionConfidence?: number;
  extractedAt?: string;
};

type BoardWizardMenuItem = {
  title: string;
  description: string;
  price: string;
  category: string;
  imageUrl: string;
};

type BoardWizardAccommodationExtraction = {
  sourceUrl: string;
  listingName: string;
  description: string;
  location: string;
  host: string;
  images: BoardWizardUrlImage[];
  amenities: string[];
  pageTitle: string;
  siteName: string;
};

type BoardWizardUrlExtraction = {
  context: string;
  restaurantLike: boolean;
  menuItems: BoardWizardMenuItem[];
  pageTitle: string;
  siteName: string;
};

function firstHttpUrl(value: string): string {
  const markdownTarget = value.match(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i)?.[1];
  const candidate = markdownTarget ?? value.match(/https?:\/\/[^\s<>"'\]]+/i)?.[0] ?? '';
  let trimmed = candidate.replace(/[.,;!?]+$/, '');
  while (
    trimmed.endsWith(')')
    && (trimmed.match(/\)/g)?.length ?? 0) > (trimmed.match(/\(/g)?.length ?? 0)
  ) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

function isGoogleMapsUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'maps.app.goo.gl'
      || hostname === 'goo.gl'
      || /^(?:[^.]+\.)*google\.(?:com?|co)\.[a-z]{2}$/i.test(hostname)
      || /^(?:[^.]+\.)*google\.[a-z]{2,}$/i.test(hostname);
  } catch {
    return false;
  }
}

async function resolveGoogleMapsUrl(inputUrl: string): Promise<string> {
  let currentUrl = inputUrl;
  for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
    const parsed = new URL(currentUrl);
    if (!isGoogleMapsUrl(currentUrl)) {
      throw new Error(`Google Maps redirected to an unexpected host: ${parsed.hostname}`);
    }
    if (parsed.pathname.includes('/maps/')) {
      return currentUrl;
    }
    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LivingWiki/1.0; +https://livingwiki.com)',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
    });
    const location = response.headers.get('location');
    if (!location) {
      return response.url || currentUrl;
    }
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error('Google Maps link exceeded the redirect limit.');
}

function buildGoogleMapsTourContext(inputUrl: string, finalUrl: string): string {
  if (!isGoogleMapsUrl(inputUrl) || !isGoogleMapsUrl(finalUrl)) {
    return '';
  }
  try {
    const parsed = new URL(finalUrl);
    const marker = '/maps/dir/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) {
      return finalUrl !== inputUrl ? `Resolved Google Maps URL: ${finalUrl}` : '';
    }
    const routePath = parsed.pathname.slice(markerIndex + marker.length);
    const stops = routePath
      .split('/')
      .filter((part) => part && !part.startsWith('@') && !part.startsWith('data='))
      .map((part) => decodeURIComponent(part.replace(/\+/g, ' ')).trim())
      .filter(Boolean)
      .slice(0, 25);
    if (!stops.length) {
      return `Resolved Google Maps route URL: ${finalUrl}`;
    }
    return [
      'Resolved Google Maps route. Treat these as authoritative ordered stops and preserve their country/region; do not substitute similarly named places elsewhere:',
      ...stops.map((stop, index) => `${index + 1}. ${stop}`),
      `Resolved route URL: ${finalUrl}`,
    ].join('\n');
  } catch {
    return '';
  }
}

async function buildBoardWizardUrlContext(inputUrl: string, finalUrl: string, html: string): Promise<BoardWizardUrlExtraction> {
  const baseUrl = finalUrl || inputUrl;
  const pageText = (extractBoardWizardReadableText(baseUrl, html) || stripHtmlForBoardWizard(html)).slice(0, 10_000);
  const pageLines = stripHtmlLinesForBoardWizard(html);
  const title = firstHtmlMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = firstHtmlMeta(html, ['description', 'og:description', 'twitter:description']);
  const siteName = firstHtmlMeta(html, ['og:site_name']);
  const jsonLd = extractBoardWizardJsonLdText(html).slice(0, 2400);
  const links = extractBoardWizardLinks(html, baseUrl);
  const importantLinks = links.filter(isBoardWizardRestaurantLink).slice(0, 18);
  // Keep the complete bounded image set for item-to-photo matching. Only the small preview is
  // included in the model context so a long menu does not crowd out the menu text.
  const allImages = extractBoardWizardImages(html, baseUrl).slice(0, 500);
  const images = allImages.slice(0, 24);
  const linkedContext = '';
  const restaurantLike = looksLikeRestaurantWizardUrl(inputUrl, pageText, importantLinks);
  const structuredMenuItems = restaurantLike
    ? extractStructuredBoardWizardMenuItems(html, allImages)
    : [];
  const lineMenuItems = restaurantLike ? extractBoardWizardMenuItems(pageLines, allImages) : [];
  const menuItems = mergeBoardWizardMenuItems(structuredMenuItems, lineMenuItems).slice(0, 50);

  const context = [
    `Source URL: ${inputUrl}`,
    finalUrl && finalUrl !== inputUrl ? `Final URL: ${finalUrl}` : '',
    title ? `Page title: ${title}` : '',
    siteName ? `Site name: ${siteName}` : '',
    description ? `Page description: ${description}` : '',
    restaurantLike ? 'Detected page type: restaurant/menu. Build one restaurant board with menu-item cards, location/contact cards, and reserve/order/menu action cards.' : '',
    menuItems.length ? `Extracted menu item candidates:\n${menuItems.map((item) => `- ${item.title}${item.price ? ` (${item.price})` : ''}${item.category ? ` [${item.category}]` : ''}${item.description ? `: ${item.description}` : ''}${item.imageUrl ? ` | image: ${item.imageUrl}` : ''}`).join('\n')}` : '',
    importantLinks.length ? `Important links:\n${importantLinks.map((link) => `- ${link.label}: ${link.href}`).join('\n')}` : '',
    pageText ? `Main page text:\n${pageText}` : '',
    images.length ? `Image candidates:\n${images.map((image) => `- ${image.alt || 'image'}: ${image.src}`).join('\n')}` : '',
    jsonLd ? `Structured data snippets:\n${jsonLd}` : '',
    linkedContext ? `Linked page excerpts:\n${linkedContext}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 16_000);
  return { context, restaurantLike, menuItems, pageTitle: title, siteName };
}

function buildBoardWizardResearchFallbackExtraction(inputUrl: string): BoardWizardUrlExtraction {
  let siteName = '';
  try {
    siteName = new URL(inputUrl).hostname.replace(/^www\./, '');
  } catch {
    siteName = 'source page';
  }
  return {
    context: [
      `Source URL: ${inputUrl}`,
      'The publisher did not expose usable page content to the importer.',
      'Use Google Search as a fallback and stay scoped to this exact URL and its indexed public representation.',
      'First determine the page type. If it is a shopping, collection, category, or merchant homepage, return the complete set of concrete named products visibly featured on that page, not the merchant’s entire catalog.',
      'For each product, use entity_type "product", image_intent "product", type "shop", and an exact brand-plus-product image_query.',
      'When a verified canonical product detail URL is available in search results, put that URL in place_query so the saved card can link back to the exact product.',
      'Also put the verified canonical product detail URL in productUrl. A product without an official detail URL is not sufficiently verified and must be omitted.',
      'If public indexing exposes the exact official product image asset, put that absolute URL in imageUrl and use imageSource "product-page". Never guess an image URL or use a store, logo, category, campaign, or similar-product image; leave imageUrl empty instead.',
      'Never invent membership. If current page membership cannot be verified, say so in the board description and return only strongly supported items.',
    ].join('\n'),
    restaurantLike: false,
    menuItems: [],
    pageTitle: '',
    siteName,
  };
}

function buildBoardWizardReaderExtraction(
  inputUrl: string,
  markdown: string,
): BoardWizardUrlExtraction | null {
  const menuItems = extractBoardWizardReaderMenuItems(markdown);
  const pageTitle = boardWizardReaderPageTitle(markdown);
  let siteName = pageTitle.replace(/\s*[|–—]\s*.*$/, '').trim();
  if (!siteName) {
    try {
      siteName = new URL(inputUrl).hostname.replace(/^www\./, '');
    } catch {
      siteName = 'source page';
    }
  }
  const restaurantLike = menuItems.length >= 3;
  if (!restaurantLike && markdown.trim().length < 200) {
    return null;
  }
  const context = [
    `Source URL: ${inputUrl}`,
    pageTitle ? `Page title: ${pageTitle}` : '',
    siteName ? `Site name: ${siteName}` : '',
    'The publisher blocked direct cloud extraction. This content was recovered from the public page through the no-key Reader fallback.',
    restaurantLike
      ? 'Detected page type: restaurant/menu. Build one restaurant board using these exact current menu records and their source-page photos.'
      : '',
    menuItems.length
      ? `Extracted menu items:\n${menuItems.map((item) =>
          `- ${item.title}${item.price ? ` (${item.price})` : ''}${item.category ? ` [${item.category}]` : ''}${item.description ? `: ${item.description}` : ''} | image: ${item.imageUrl}`,
        ).join('\n')}`
      : '',
    !restaurantLike
      ? `Reader page excerpt:\n${markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\s+/g, ' ').slice(0, 8_000)}`
      : '',
  ].filter(Boolean).join('\n\n').slice(0, 14_000);
  return {
    context,
    restaurantLike,
    menuItems: menuItems.slice(0, 100),
    pageTitle,
    siteName,
  };
}

function buildBoardWizardReaderCommerceExtraction(
  inputUrl: string,
  markdown: string,
): CommercePageExtraction | null {
  const readerProducts = extractBoardWizardReaderProducts(markdown, inputUrl);
  if (readerProducts.length < 2) return null;
  const pageTitle = boardWizardReaderPageTitle(markdown);
  const sourceHost = safeCommerceHostname(inputUrl);
  const siteName = pageTitle.replace(/\s*[|–—]\s*.*$/, '').trim()
    || sourceHost.replace(/^www\./, '');
  const products = readerProducts.map((product, index) => ({
    name: product.title,
    description: product.description,
    productUrl: product.productUrl,
    imageUrl: product.imageUrl,
    imageCandidates: product.imageUrl ? [product.imageUrl] : [],
    imageSource: product.imageUrl ? 'source-page' as const : 'missing' as const,
    price: product.price,
    currency: /\$/.test(product.price) ? 'USD' : '',
    brand: siteName,
    category: product.category,
    sku: product.sku,
    availability: '',
    position: index + 1,
    confidence: product.imageUrl ? 0.9 : 0.82,
    sourceKind: 'reader' as const,
  }));
  return {
    isCommerce: true,
    confidence: products.every((product) => !!product.imageUrl) ? 0.92 : 0.84,
    sourceUrl: inputUrl,
    finalUrl: inputUrl,
    pageTitle,
    siteName,
    brand: siteName,
    products,
    evidence: [
      `${products.length} official product links recovered from the public Reader representation`,
      `${products.filter((product) => !!product.imageUrl).length} locally paired product images`,
    ],
  };
}

type BoardWizardSourcePreviewAnalysis = {
  manifest: BoardWizardSourceManifest | null;
  specializedKind: 'restaurant' | 'commerce' | 'accommodation' | null;
  warning: string;
};

async function analyzeBoardWizardSourcePreview(sourceUrl: string): Promise<BoardWizardSourcePreviewAnalysis> {
  try {
    const fetched = await fetchHtmlWithFallback(sourceUrl, {
      timeoutMs: 30_000,
      preferBrowser: false,
      allowBrowserFallback: true,
    });
    const blocked = looksLikeAntiBotChallenge(fetched.html);
    if (fetched.status >= 200 && fetched.status < 400 && !blocked) {
      const extraction = await buildBoardWizardUrlContext(sourceUrl, fetched.finalUrl || sourceUrl, fetched.html);
      if (extraction.restaurantLike && extraction.menuItems.length >= 3) {
        return { manifest: null, specializedKind: 'restaurant', warning: '' };
      }
      const commerce = extractCommercePage(sourceUrl, fetched.finalUrl || sourceUrl, fetched.html);
      if (commerce.isCommerce && commerce.products.length >= 2) {
        return { manifest: null, specializedKind: 'commerce', warning: '' };
      }
      if (buildBoardWizardAccommodationExtraction(sourceUrl, fetched.finalUrl || sourceUrl, fetched.html)) {
        return { manifest: null, specializedKind: 'accommodation', warning: '' };
      }
      const manifest = extractBoardWizardArticleManifest(sourceUrl, fetched.finalUrl || sourceUrl, fetched.html);
      if (manifest) return { manifest, specializedKind: null, warning: '' };
    }
  } catch {
    // The no-key Reader fallback below can still recover public article content.
  }

  const reader = await fetchBoardWizardReaderPage(sourceUrl, { timeoutMs: 18_000 });
  if (reader.markdown) {
    if (extractBoardWizardReaderMenuItems(reader.markdown).length >= 3) {
      return { manifest: null, specializedKind: 'restaurant', warning: '' };
    }
    if (extractBoardWizardReaderProducts(reader.markdown, sourceUrl).length >= 2) {
      return { manifest: null, specializedKind: 'commerce', warning: '' };
    }
    const manifest = extractBoardWizardArticleManifestFromMarkdown(sourceUrl, reader.markdown);
    if (manifest) return { manifest, specializedKind: null, warning: '' };
  }

  return {
    manifest: null,
    specializedKind: null,
    warning: reader.blocked
      ? 'The publisher blocked source reading. LivingWiki will use verified public indexing and clearly mark the result for review.'
      : 'LivingWiki could not identify a reliable ordered list before generation. The full card preview will require careful review.',
  };
}

function buildArticleManifestUrlExtraction(manifest: BoardWizardSourceManifest): BoardWizardUrlExtraction {
  const context = [
    `Source URL: ${manifest.sourceUrl}`,
    manifest.pageTitle ? `Page title: ${manifest.pageTitle}` : '',
    manifest.siteName ? `Site name: ${manifest.siteName}` : '',
    `Authoritative extracted source items (${manifest.items.length}):`,
    ...manifest.items.map((item) => [
      `${item.sourceIndex}. ${item.title}`,
      item.excerpt ? `   ${item.excerpt}` : '',
      item.imageUrl ? `   Source image: ${item.imageUrl}` : '',
    ].filter(Boolean).join('\n')),
  ].filter(Boolean).join('\n');
  return {
    context: context.slice(0, 30_000),
    restaurantLike: false,
    menuItems: [],
    pageTitle: manifest.pageTitle,
    siteName: manifest.siteName,
  };
}

async function fetchBoardWizardLinkedContext(links: BoardWizardUrlLink[], baseUrl: string): Promise<string> {
  const seen = new Set<string>();
  const contexts: string[] = [];
  for (const link of links) {
    if (contexts.length >= 3) {
      break;
    }
    if (seen.has(link.href) || /\.pdf(?:[?#]|$)/i.test(link.href)) {
      continue;
    }
    seen.add(link.href);
    try {
      const url = new URL(link.href, baseUrl);
      const base = new URL(baseUrl);
      if (url.hostname !== base.hostname && !/(opentable|toasttab|resy|sevn|sevenrooms)/i.test(url.hostname)) {
        continue;
      }
      const fetched = await fetchHtmlWithFallback(url.toString(), { timeoutMs: 20_000 });
      if (looksLikeAntiBotChallenge(fetched.html)) {
        continue;
      }
      const text = stripHtmlForBoardWizard(fetched.html).slice(0, 2200);
      if (text) {
        contexts.push(`From ${link.label} (${url.toString()}):\n${text}`);
      }
    } catch {
      continue;
    }
  }
  return contexts.join('\n\n').slice(0, 5000);
}

function extractBoardWizardLinks(html: string, baseUrl: string): BoardWizardUrlLink[] {
  const links: BoardWizardUrlLink[] = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) && links.length < 80) {
    const href = htmlAttribute(match[1], 'href');
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) {
      continue;
    }
    const absolute = safeAbsoluteUrl(href, baseUrl);
    if (!absolute) {
      continue;
    }
    const label = stripHtmlForBoardWizard(match[2]).slice(0, 90) || absolute;
    links.push({ label, href: absolute });
  }
  return dedupeBoardWizardLinks(links);
}

function extractBoardWizardImages(html: string, baseUrl: string): BoardWizardUrlImage[] {
  // Responsive storefronts often keep the real asset exclusively on <picture><source>
  // while the nested <img src> is a placeholder. Preserve the title-bearing picture
  // association before collecting standalone images.
  const images: BoardWizardUrlImage[] = extractBoardWizardPictureImages(html, baseUrl);
  const imagePattern = /<img\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = imagePattern.exec(html)) && images.length < 600) {
    const attrs = match[1];
    const srcset = htmlAttribute(attrs, 'srcset') || htmlAttribute(attrs, 'data-srcset');
    const src = htmlAttribute(attrs, 'data-lw-current-src')
      || bestBoardWizardSrcsetUrl(srcset)
      || htmlAttribute(attrs, 'data-src')
      || htmlAttribute(attrs, 'data-original')
      || htmlAttribute(attrs, 'src');
    const absolute = src ? safeAbsoluteUrl(src, baseUrl) : '';
    if (!absolute || !canTryCoverImageUrl(absolute)) {
      continue;
    }
    const alt = htmlAttribute(attrs, 'alt').slice(0, 90);
    if (/(logo|icon|avatar|spacer|tracking|pixel)/i.test(`${alt} ${absolute}`)) {
      continue;
    }
    images.push({ alt, src: absolute });
  }
  const ogImage = firstHtmlMeta(html, ['og:image', 'twitter:image']);
  const ogAbsolute = ogImage ? safeAbsoluteUrl(ogImage, baseUrl) : '';
  if (ogAbsolute && canTryCoverImageUrl(ogAbsolute)) {
    images.unshift({ alt: 'featured image', src: ogAbsolute });
  }
  for (const match of html.matchAll(/url\(["']?(https?:\/\/[^"')\s]+\.(?:png|jpe?g|webp)(?:\?[^"')\s]*)?)["']?\)/gi)) {
    const src = match[1];
    if (src && canTryCoverImageUrl(src)) {
      images.push({ alt: 'background image', src });
    }
  }
  const seen = new Set<string>();
  return images.filter((image) => {
    if (seen.has(image.src)) {
      return false;
    }
    seen.add(image.src);
    return true;
  }).slice(0, 600);
}

function extractBoardWizardMenuItems(lines: string[], images: BoardWizardUrlImage[]): BoardWizardMenuItem[] {
  const items: BoardWizardMenuItem[] = [];
  const seen = new Set<string>();
  let category = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = cleanBoardWizardMenuLine(lines[index]);
    if (!line) {
      continue;
    }
    if (isBoardWizardMenuCategory(line)) {
      category = line;
      continue;
    }
    if (!isLikelyBoardWizardMenuTitle(line)) {
      continue;
    }
    const lookahead = lines.slice(index + 1, index + 7).map(cleanBoardWizardMenuLine).filter(Boolean);
    const price = lookahead.find((next) => /^\$[\d,.]+/.test(next)) ?? '';
    const hasMenuEvidence = !!price || lookahead.some((next) => /^#\d+\s+most liked/i.test(next)) || !!category;
    if (!hasMenuEvidence) {
      continue;
    }
    const description = lookahead
      .filter((next) => next !== price)
      .filter((next) => !/^#\d+\s+most liked/i.test(next))
      .filter((next) => !isLikelyBoardWizardMenuTitle(next))
      .filter((next) => !isBoardWizardMenuNoise(next))
      .join(' ')
      .slice(0, 220);
    const key = line.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({
      title: line,
      description,
      price,
      category,
      imageUrl: matchBoardWizardMenuImage(line, images),
    });
    if (items.length >= 60) {
      break;
    }
  }
  return items;
}

function mergeBoardWizardMenuItems(
  primary: BoardWizardMenuItem[],
  secondary: BoardWizardMenuItem[],
): BoardWizardMenuItem[] {
  const merged = new Map<string, BoardWizardMenuItem>();
  for (const item of [...primary, ...secondary]) {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, item);
      continue;
    }
    merged.set(key, {
      title: existing.title || item.title,
      description: existing.description || item.description,
      price: existing.price || item.price,
      category: existing.category || item.category,
      imageUrl: existing.imageUrl || item.imageUrl,
    });
  }
  return [...merged.values()];
}

function meaningfulBoardWizardTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 3 && !['with', 'the', 'and', 'classic'].includes(token))
    .slice(0, 8);
}

function cleanBoardWizardMenuLine(value: string | undefined): string {
  return decodeBoardWizardHtmlEntities(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^\W+|\W+$/g, '')
    .trim()
    .slice(0, 180);
}

function isLikelyBoardWizardMenuTitle(line: string): boolean {
  if (line.length < 3 || line.length > 80 || isBoardWizardMenuNoise(line) || /^\$[\d,.]+/.test(line)) {
    return false;
  }
  if (/[.!?]$/.test(line) || /\b(add|choose|select|delivery|pickup|checkout|rewards|sign in|order now)\b/i.test(line)) {
    return false;
  }
  const words = line.split(/\s+/);
  return words.length <= 9 && /[A-Za-z]/.test(line) && words.some((word) => /^[A-Z0-9#]/.test(word));
}

function isBoardWizardMenuCategory(line: string): boolean {
  return /^(featured items|most ordered|favorites|sandwiches|subs|salads|sides|drinks|beverages|desserts|kids|combos|cheesesteaks|turkey subs|vegetarian|featured|popular)$/i.test(line);
}

function isBoardWizardMenuNoise(line: string): boolean {
  return /^(icon loading|loading|popular|new|home|menu|locations|catering|rewards|about|careers|franchising|privacy policy|terms|skip to content)$/i.test(line)
    || /^#\d+\s+most liked/i.test(line)
    || /^\d+$/.test(line);
}

function stripHtmlLinesForBoardWizard(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\n+/)
    .map((line) => cleanBoardWizardMenuLine(line))
    .filter(Boolean)
    .flatMap((line) => line.split(/\s{2,}/).map(cleanBoardWizardMenuLine).filter(Boolean));
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isBoardWizardRestaurantLink(link: BoardWizardUrlLink): boolean {
  return /(menu|food|drink|brunch|lunch|dinner|happy hour|reserve|reservation|book|order|delivery|toast|opentable|resy|sevenrooms|pdf)/i
    .test(`${link.label} ${link.href}`);
}

function looksLikeRestaurantWizardUrl(url: string, text: string, links: BoardWizardUrlLink[]): boolean {
  return /(restaurant|bar|pub|menu|food|drink|brunch|lunch|dinner|reservation|opentable|toast)/i
    .test(`${url} ${text.slice(0, 3000)} ${links.map((link) => `${link.label} ${link.href}`).join(' ')}`);
}

function dedupeBoardWizardLinks(links: BoardWizardUrlLink[]): BoardWizardUrlLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) {
      return false;
    }
    seen.add(link.href);
    return true;
  });
}

function extractBoardWizardJsonLdText(html: string): string {
  return Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))
    .map((match) => stripHtmlForBoardWizard(match[1]).slice(0, 1200))
    .filter(Boolean)
    .slice(0, 4)
    .join('\n');
}

function buildBoardWizardAccommodationExtraction(inputUrl: string, finalUrl: string, html: string): BoardWizardAccommodationExtraction | null {
  if (!isBoardWizardAccommodationUrl(inputUrl)) {
    return null;
  }

  const baseUrl = finalUrl || inputUrl;
  const pageText = stripHtmlForBoardWizard(html).slice(0, 8000);
  const pageTitle = firstHtmlMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const siteName = firstHtmlMeta(html, ['og:site_name']) || airbnbHostLabel(inputUrl);
  const description = firstHtmlMeta(html, ['description', 'og:description', 'twitter:description'])
    || firstUsefulAccommodationSentence(pageText);
  const listingName = cleanAccommodationTitle(
    firstHtmlMeta(html, ['og:title', 'twitter:title']) || pageTitle || siteName || 'Stay',
    siteName,
  );
  const images = extractBoardWizardAccommodationImages(html, baseUrl).slice(0, 18);
  const amenities = extractBoardWizardAccommodationAmenities(pageText);
  const location = inferAccommodationLocation(listingName, description, pageText);
  const host = inferAccommodationHost(pageText);

  if (!listingName && !description && images.length === 0) {
    return null;
  }

  return {
    sourceUrl: inputUrl,
    listingName: listingName || 'Stay',
    description,
    location,
    host,
    images,
    amenities,
    pageTitle,
    siteName,
  };
}

function buildFallbackAccommodationExtraction(sourceUrl: string): BoardWizardAccommodationExtraction {
  return {
    sourceUrl,
    listingName: airbnbHostLabel(sourceUrl) === 'Airbnb' ? 'Airbnb Stay' : 'Lodging Stay',
    description: 'Review the source listing for photos, rooms, amenities, house rules, pricing, availability, and booking terms.',
    location: '',
    host: '',
    images: [],
    amenities: [],
    pageTitle: '',
    siteName: airbnbHostLabel(sourceUrl),
  };
}

function isBoardWizardAccommodationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)airbnb\./i.test(url.hostname)
      || /(hotel|resort|inn|lodging|vacation-rental|vrbo|booking|expedia|marriott|hilton|hyatt)/i.test(`${url.hostname} ${url.pathname}`);
  } catch {
    return false;
  }
}

function buildAccommodationWizardBatch(
  options: {
    extraction: BoardWizardAccommodationExtraction;
    targetBoardTitle: string;
    count: number;
  },
): GeneratedBoardWizardBatch {
  const listingName = options.extraction.listingName;
  const images = options.extraction.images;
  const hasAmenities = options.extraction.amenities.length > 0;
  const infoCardCount = 3 + (hasAmenities ? 1 : 0);
  const maxPhotoCards = Math.max(0, options.count - infoCardCount);
  const photoCards = images.slice(0, maxPhotoCards).map((image): GeneratedBoardWizardCard => ({
    title: accommodationPhotoTitle(),
    subtitle: '',
    notes: '',
    type: 'note',
    scope: 'place',
    status: 'saved',
    rating: 4,
    tags: ['lodging', 'photo', 'source-image'],
    image_query: image.alt || `${listingName} listing photo`,
    place_query: options.extraction.sourceUrl,
    imageUrl: image.src,
  }));
  const cards: GeneratedBoardWizardCard[] = [
    ...photoCards,
    {
      title: listingName.slice(0, 80),
      subtitle: options.extraction.location || options.extraction.siteName || 'Stay listing',
      notes: (options.extraction.description || 'Overview of the stay, location, and booking details.').slice(0, 260),
      type: 'place',
      scope: 'place',
      status: 'saved',
      rating: 5,
      tags: ['lodging', 'airbnb', 'overview'],
      image_query: `${listingName} listing`,
      place_query: options.extraction.location || listingName,
      imageUrl: undefined,
    },
    {
      title: 'Location',
      subtitle: options.extraction.location || 'Listing area',
      notes: options.extraction.location
        ? `Located around ${options.extraction.location}. Confirm the exact address and neighborhood on the booking page.`
        : 'Confirm the exact address, neighborhood, and travel times on the booking page.',
      type: 'place',
      scope: 'place',
      status: 'planned',
      rating: 4,
      tags: ['lodging', 'location'],
      image_query: `${listingName} location`,
      place_query: options.extraction.location || listingName,
      imageUrl: undefined,
    },
  ];

  if (hasAmenities) {
    cards.push({
      title: 'Amenities',
      subtitle: `${options.extraction.amenities.slice(0, 3).join(', ')}${options.extraction.amenities.length > 3 ? '...' : ''}`.slice(0, 90),
      notes: options.extraction.amenities.join(', ').slice(0, 260),
      type: 'note',
      scope: 'place',
      status: 'saved',
      rating: 4,
      tags: ['lodging', 'amenities'],
      image_query: `${listingName} amenities`,
      place_query: options.extraction.sourceUrl,
      imageUrl: undefined,
    });
  }

  cards.push({
    title: 'Book Now',
    subtitle: 'Open the original listing',
    notes: 'Use this action card to review availability, price, fees, house rules, and booking terms on the source page.',
    type: 'note',
    scope: 'place',
    status: 'planned',
    rating: 4,
    tags: ['action', 'booking', 'lodging'],
    image_query: `${listingName} booking`,
    place_query: options.extraction.sourceUrl,
    imageUrl: undefined,
  });

  return {
    board: {
      title: (options.targetBoardTitle || `${listingName} Stay`).slice(0, 90),
      description: (options.extraction.description || `Lodging board generated from ${options.extraction.siteName || 'the listing'}.`).slice(0, 220),
      icon: 'hotel',
      tone: 'sky',
    },
    cards: cards.slice(0, options.count),
  };
}

function extractBoardWizardAccommodationImages(html: string, baseUrl: string): BoardWizardUrlImage[] {
  const images = [...extractBoardWizardImages(html, baseUrl)];
  const imageUrlPattern = /https?:(?:\\?\/\\?\/|\/\/)[^"' <>)\\]+(?:muscache|airbnb|vrbo|expedia|booking|hotel|resort)[^"' <>)\\]+/gi;
  for (const match of html.matchAll(imageUrlPattern)) {
    const raw = normalizeEmbeddedImageUrl(match[0]);
    const src = safeAbsoluteUrl(raw, baseUrl);
    if (src && canTryCoverImageUrl(src) && isLikelyAccommodationSourcePhotoUrl(src)) {
      images.push({ alt: inferAccommodationImageAlt(src), src });
    }
  }
  const seen = new Set<string>();
  return images
    .filter((image) => isLikelyAccommodationSourcePhotoUrl(image.src))
    .sort((a, b) => accommodationImagePriority(b.src) - accommodationImagePriority(a.src))
    .filter((image) => {
      const cleanSrc = image.src.split('?')[0] || image.src;
      if (seen.has(cleanSrc)) {
        return false;
      }
      seen.add(cleanSrc);
      return true;
    });
}

function isLikelyAccommodationSourcePhotoUrl(src: string): boolean {
  const normalized = src.toLowerCase().split('?')[0] ?? '';
  if (!normalized || /\.(?:js|css|svg|ico|json|map)$/i.test(normalized)) {
    return false;
  }
  if (/(airbnb-platform-assets|static\/icons|search-bar-icons|favicon|apple-touch-icon|logo|avatar)/i.test(src)) {
    return false;
  }
  if (/a\d\.muscache\.com\/im\/pictures\//i.test(src)) {
    return /\/im\/pictures\/(?:miso\/|hosting\/|prohost-api\/|[0-9a-f-]{12,}\/)/i.test(src);
  }
  return /\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(src);
}

function accommodationImagePriority(src: string): number {
  if (/\/im\/pictures\/(?:miso|hosting|prohost-api)\//i.test(src)) {
    return 30;
  }
  if (/\/im\/pictures\//i.test(src)) {
    return 20;
  }
  if (/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(src)) {
    return 10;
  }
  return 0;
}

function normalizeEmbeddedImageUrl(value: string): string {
  return decodeBoardWizardHtmlEntities(value)
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\&/g, '&');
}

function extractBoardWizardAccommodationAmenities(text: string): string[] {
  const amenities = [
    'Wifi',
    'Kitchen',
    'Pool',
    'Hot tub',
    'Free parking',
    'Washer',
    'Dryer',
    'Air conditioning',
    'Heating',
    'Dedicated workspace',
    'Gym',
    'Elevator',
    'Patio',
    'Balcony',
    'TV',
    'Coffee',
  ];
  const normalized = text.toLowerCase();
  return amenities.filter((amenity) => normalized.includes(amenity.toLowerCase())).slice(0, 10);
}

function cleanAccommodationTitle(title: string, siteName: string): string {
  return decodeBoardWizardHtmlEntities(title)
    .replace(/\s*-\s*Airbnb.*$/i, '')
    .replace(/\s*\|\s*Airbnb.*$/i, '')
    .replace(siteName ? new RegExp(`\\s*[-|]\\s*${siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'i') : /$^/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function firstUsefulAccommodationSentence(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .find((line) => line.length > 40 && !/cookie|privacy|javascript|browser/i.test(line))
    ?.slice(0, 260) ?? '';
}

function inferAccommodationLocation(title: string, description: string, text: string): string {
  const source = `${title}. ${description}. ${text.slice(0, 1500)}`;
  const patterns = [
    /\bin\s+([A-Z][A-Za-z .'-]+,\s*[A-Z]{2}(?:,\s*[A-Za-z .'-]+)?)/,
    /\bin\s+([A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+){1,2})/,
    /\bnear\s+([A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?)/,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, ' ').trim().slice(0, 90);
    }
  }
  return '';
}

function inferAccommodationHost(text: string): string {
  const match = text.match(/\bhosted by\s+([A-Z][A-Za-z .'-]{1,60})/i);
  return match?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 70) ?? '';
}

function buildAccommodationSpaceNote(extraction: BoardWizardAccommodationExtraction): string {
  const parts = [
    extraction.description,
    extraction.host ? `Hosted by ${extraction.host}.` : '',
    extraction.amenities.length ? `Amenities called out include ${extraction.amenities.slice(0, 6).join(', ')}.` : '',
  ].filter(Boolean);
  return (parts.join(' ') || 'Review the source listing for bedrooms, beds, baths, amenities, and house rules.').slice(0, 260);
}

function accommodationPhotoTitle(): string {
  return 'Photo';
}

function inferAccommodationImageAlt(src: string): string {
  return 'listing photo';
}

function airbnbHostLabel(value: string): string {
  try {
    const url = new URL(value);
    return /airbnb/i.test(url.hostname) ? 'Airbnb' : url.hostname.replace(/^www\./, '');
  } catch {
    return 'Listing';
  }
}

function firstHtmlMeta(html: string, keys: string[]): string {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${escaped}["'])([^>]*)>`, 'i');
    const match = html.match(pattern);
    const content = match?.[1] ? htmlAttribute(match[1], 'content') : '';
    if (content) {
      return content.slice(0, 500);
    }
  }
  return '';
}

function firstHtmlMatch(html: string, pattern: RegExp): string {
  const match = html.match(pattern);
  return match?.[1] ? stripHtmlForBoardWizard(match[1]).slice(0, 300) : '';
}

function htmlAttribute(attrs: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = attrs.match(new RegExp(`${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeBoardWizardHtmlEntities((match?.[1] || match?.[2] || match?.[3] || '').trim());
}

function safeAbsoluteUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return '';
  }
}

function decodeBoardWizardHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

type NearbyPlacesApiPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryType?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
  editorialSummary?: { text?: string };
  photos?: Array<{ name?: string }>;
};

const nearbyGemPlaceTypeGroups = [
  ['tourist_attraction', 'museum', 'art_gallery', 'historical_place', 'cultural_landmark', 'monument'],
  ['hiking_area', 'botanical_garden', 'state_park', 'beach', 'nature_preserve', 'scenic_spot'],
  ['cafe', 'bakery', 'book_store', 'coffee_shop'],
] as const;

function finiteNearbyCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

async function consumeNearbyGemQuota(userId: string): Promise<void> {
  const hour = Math.floor(Date.now() / 3_600_000);
  const reference = db.collection('nearby_gem_quotas').doc(userId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data() ?? {};
    const currentHour = Number(data['hour']);
    const count = currentHour === hour ? Math.max(0, Number(data['count']) || 0) : 0;
    if (count >= 20) {
      throw new HttpsError('resource-exhausted', 'You have made several nearby searches. Please try again in a little while.');
    }
    transaction.set(reference, {
      hour,
      count: count + 1,
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function geocodeNearbyGemOrigin(query: string, apiKey: string): Promise<{ lat: number; lng: number }> {
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', query);
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const data = await response.json() as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    const location = data.results?.[0]?.geometry?.location;
    const lat = finiteNearbyCoordinate(location?.lat, -90, 90);
    const lng = finiteNearbyCoordinate(location?.lng, -180, 180);
    if (response.ok && data.status === 'OK' && lat != null && lng != null) return { lat, lng };
  } catch {
    // Fall through to the Places text-search geocoder below.
  }
  try {
    const placeUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    placeUrl.searchParams.set('query', query);
    placeUrl.searchParams.set('key', apiKey);
    const placeResponse = await fetch(placeUrl, { signal: AbortSignal.timeout(12_000) });
    const placeData = await placeResponse.json() as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    const placeLocation = placeData.results?.[0]?.geometry?.location;
    const placeLat = finiteNearbyCoordinate(placeLocation?.lat, -90, 90);
    const placeLng = finiteNearbyCoordinate(placeLocation?.lng, -180, 180);
    if (placeResponse.ok && placeData.status === 'OK' && placeLat != null && placeLng != null) {
      return { lat: placeLat, lng: placeLng };
    }
  } catch {
    // The final message below is intentionally the same for either geocoder.
  }
  throw new HttpsError('not-found', 'We could not find that starting place. Try a city, neighborhood, or full address.');
}

async function reverseGeocodeNearbyGemLabel(
  origin: { lat: number; lng: number },
  apiKey: string,
): Promise<string> {
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${origin.lat},${origin.lng}`);
    url.searchParams.set('result_type', 'locality|postal_town|administrative_area_level_1|country');
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await response.json() as {
      results?: Array<{ address_components?: Array<{ long_name?: string; types?: string[] }> }>;
    };
    const components = data.results?.flatMap((result) => result.address_components ?? []) ?? [];
    return broadLocationLabel(components.map((component) => ({
      longText: component.long_name,
      types: component.types,
    })));
  } catch {
    return 'your area';
  }
}

async function searchNearbyGemCandidates(
  origin: { lat: number; lng: number },
  preset: NearbyGemPreset,
  apiKey: string,
): Promise<NearbyGemCandidate[]> {
  const responses = await Promise.allSettled(nearbyGemPlaceTypeGroups.map(async (includedTypes) => {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.types',
          'places.primaryType',
          'places.rating',
          'places.userRatingCount',
          'places.googleMapsUri',
          'places.businessStatus',
          'places.editorialSummary',
          'places.photos',
        ].join(','),
      },
      body: JSON.stringify({
        includedTypes,
        maxResultCount: 20,
        rankPreference: 'POPULARITY',
        locationRestriction: {
          circle: {
            center: { latitude: origin.lat, longitude: origin.lng },
            radius: preset.radiusMeters,
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json() as { places?: NearbyPlacesApiPlace[]; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || `Places request failed (${response.status}).`);
    return data.places ?? [];
  }));

  const places = responses.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (!places.length) return searchLegacyNearbyGemCandidates(origin, preset, apiKey);
  return places.flatMap((place): NearbyGemCandidate[] => {
    const id = stringOrEmpty(place.id);
    const name = stringOrEmpty(place.displayName?.text).slice(0, 120);
    const lat = finiteNearbyCoordinate(place.location?.latitude, -90, 90);
    const lng = finiteNearbyCoordinate(place.location?.longitude, -180, 180);
    if (!id || !name || lat == null || lng == null || (place.businessStatus && place.businessStatus !== 'OPERATIONAL')) return [];
    return [{
      id,
      name,
      address: stringOrEmpty(place.formattedAddress).slice(0, 240),
      lat,
      lng,
      types: Array.isArray(place.types) ? place.types.map(stringOrEmpty).filter(Boolean).slice(0, 20) : [],
      primaryType: stringOrEmpty(place.primaryType),
      rating: Math.max(0, Math.min(5, Number(place.rating) || 0)),
      ratingCount: Math.max(0, Math.trunc(Number(place.userRatingCount) || 0)),
      googleMapsUrl: stringOrEmpty(place.googleMapsUri).slice(0, 1000) || `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(id)}`,
      photoName: stringOrEmpty(place.photos?.[0]?.name).slice(0, 1200),
      editorialSummary: stringOrEmpty(place.editorialSummary?.text).slice(0, 600),
      straightLineMeters: haversineMeters(origin, { lat, lng }),
    }];
  });
}

async function searchLegacyNearbyGemCandidates(
  origin: { lat: number; lng: number },
  preset: NearbyGemPreset,
  apiKey: string,
): Promise<NearbyGemCandidate[]> {
  const keywords = ['local attractions museums history', 'parks gardens scenic nature', 'independent cafes bakeries bookstores'];
  const responses = await Promise.allSettled(keywords.map(async (keyword) => {
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${origin.lat},${origin.lng}`);
    url.searchParams.set('radius', String(Math.round(preset.radiusMeters)));
    url.searchParams.set('keyword', keyword);
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const data = await response.json() as {
      status?: string;
      error_message?: string;
      results?: Array<{
        place_id?: string;
        name?: string;
        vicinity?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
        types?: string[];
        rating?: number;
        user_ratings_total?: number;
        business_status?: string;
        photos?: Array<{ photo_reference?: string }>;
      }>;
    };
    if (!response.ok || (data.status !== 'OK' && data.status !== 'ZERO_RESULTS')) {
      throw new Error(data.error_message || `Legacy Places request failed (${response.status}).`);
    }
    return data.results ?? [];
  }));
  const results = responses.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (!results.length && responses.every((result) => result.status === 'rejected')) {
    throw new HttpsError('unavailable', 'Nearby place search is temporarily unavailable. Please try again.');
  }
  return results.flatMap((place): NearbyGemCandidate[] => {
    const id = stringOrEmpty(place.place_id);
    const name = stringOrEmpty(place.name).slice(0, 120);
    const lat = finiteNearbyCoordinate(place.geometry?.location?.lat, -90, 90);
    const lng = finiteNearbyCoordinate(place.geometry?.location?.lng, -180, 180);
    if (!id || !name || lat == null || lng == null || (place.business_status && place.business_status !== 'OPERATIONAL')) return [];
    const types = Array.isArray(place.types) ? place.types.map(stringOrEmpty).filter(Boolean).slice(0, 20) : [];
    return [{
      id,
      name,
      address: stringOrEmpty(place.vicinity).slice(0, 240),
      lat,
      lng,
      types,
      primaryType: types[0] ?? '',
      rating: Math.max(0, Math.min(5, Number(place.rating) || 0)),
      ratingCount: Math.max(0, Math.trunc(Number(place.user_ratings_total) || 0)),
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(id)}`,
      photoName: '',
      photoReference: stringOrEmpty(place.photos?.[0]?.photo_reference).slice(0, 1200),
      editorialSummary: '',
      straightLineMeters: haversineMeters(origin, { lat, lng }),
    }];
  });
}

async function attachNearbyGemRoutes(
  candidates: NearbyGemCandidate[],
  origin: { lat: number; lng: number },
  preset: NearbyGemPreset,
  apiKey: string,
): Promise<NearbyGemCandidate[]> {
  if (!candidates.length) return candidates;
  try {
    const response = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,status,condition,distanceMeters,duration',
      },
      body: JSON.stringify({
        origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }],
        destinations: candidates.slice(0, 50).map((candidate) => ({
          waypoint: { location: { latLng: { latitude: candidate.lat, longitude: candidate.lng } } },
        })),
        travelMode: preset.travelMode,
        ...(preset.travelMode === 'DRIVE' ? { routingPreference: 'TRAFFIC_UNAWARE' } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Route matrix failed (${response.status}).`);
    const rows = await response.json() as Array<{
      destinationIndex?: number;
      condition?: string;
      distanceMeters?: number;
      duration?: string;
    }>;
    const routes = new Map(rows.flatMap((row) => {
      const index = Number(row.destinationIndex);
      const duration = googleDurationSeconds(row.duration);
      return Number.isInteger(index) && row.condition === 'ROUTE_EXISTS' && duration != null
        ? [[index, { duration, distance: Math.max(0, Number(row.distanceMeters) || 0) }] as const]
        : [];
    }));
    const metersPerSecond = preset.travelMode === 'WALK' ? 1.35 : 10;
    return candidates.map((candidate, index) => {
      const route = routes.get(index);
      if (route) return { ...candidate, routeDurationSeconds: route.duration, routeDistanceMeters: route.distance };
      const estimatedDistance = Math.round((candidate.straightLineMeters ?? 0) * 1.25);
      return {
        ...candidate,
        routeDistanceMeters: estimatedDistance,
        routeDurationSeconds: Math.round(estimatedDistance / metersPerSecond) + (preset.travelMode === 'DRIVE' ? 120 : 0),
      };
    });
  } catch (error) {
    logger.warn('Nearby gems route filtering fell back to distance estimates.', {
      travelMode: preset.travelMode,
      candidateCount: candidates.length,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    const metersPerSecond = preset.travelMode === 'WALK' ? 1.35 : 10;
    return candidates.map((candidate) => ({
      ...candidate,
      routeDistanceMeters: Math.round((candidate.straightLineMeters ?? 0) * 1.25),
      routeDurationSeconds: Math.round((candidate.straightLineMeters ?? 0) * 1.25 / metersPerSecond)
        + (preset.travelMode === 'DRIVE' ? 120 : 0),
    }));
  }
}

function nearbyGemCard(candidate: NearbyGemCandidate, index: number): GeneratedBoardWizardCard {
  const category = nearbyGemCategory(candidate);
  const duration = formatNearbyGemDuration(candidate.routeDurationSeconds);
  const ratingDetail = candidate.rating > 0
    ? `${candidate.rating.toFixed(1)} stars${candidate.ratingCount ? ` from ${candidate.ratingCount.toLocaleString('en-US')} reviews` : ''}`
    : '';
  const notes = candidate.editorialSummary
    || [
      `${candidate.name} is a ${category.toLocaleLowerCase()} find worth considering nearby.`,
      ratingDetail ? `It is rated ${ratingDetail}.` : '',
      candidate.address ? `Find it at ${candidate.address}.` : '',
    ].filter(Boolean).join(' ');
  return {
    title: candidate.name,
    subtitle: `${duration} · ${category}`,
    notes,
    type: category === 'Food & drink' ? 'food' : category === 'Curious corner' ? 'shop' : 'place',
    scope: 'place',
    status: 'saved',
    rating: Math.max(1, Math.min(5, Math.round(candidate.rating || 4))),
    tags: ['nearby gem', category.toLocaleLowerCase(), presetTagFromDuration(candidate.routeDurationSeconds)].filter(Boolean).slice(0, 6),
    image_query: `${candidate.name} ${candidate.address} photo`.trim(),
    place_query: `${candidate.name} ${candidate.address}`.trim(),
    entity_name: candidate.name,
    entity_type: 'place',
    image_intent: category === 'Food & drink' ? 'food' : 'place',
    image_context: `${candidate.name}, ${candidate.address}`.slice(0, 600),
    media_kind: 'none',
    short_summary: `${category} · ${duration}`,
    rank: index + 1,
    imageUrl: candidate.photoName
      ? `${publicFunctionsBaseUrl}/boardPlacePhoto?name=${encodeURIComponent(candidate.photoName)}`
      : candidate.photoReference
        ? `${publicFunctionsBaseUrl}/boardPlacePhoto?ref=${encodeURIComponent(candidate.photoReference)}`
        : undefined,
    placeId: candidate.id,
    googleMapsUrl: candidate.googleMapsUrl,
    locationLat: candidate.lat,
    locationLng: candidate.lng,
    sourceUrl: candidate.googleMapsUrl,
    imageSource: candidate.photoName || candidate.photoReference ? 'search' : 'missing',
    extractionConfidence: 1,
    extractedAt: new Date().toISOString(),
    tour: null,
  };
}

function presetTagFromDuration(seconds: number | undefined): string {
  if (!Number.isFinite(seconds)) return 'nearby';
  return `${Math.max(1, Math.round((seconds ?? 0) / 60))} min away`;
}

export const discoverNearbyGems = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 60,
    memory: '1GiB',
    concurrency: 8,
    maxInstances: 30,
    secrets: [googlePlacesApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError('unauthenticated', 'Sign in to find nearby gems.');
    const data = request.data && typeof request.data === 'object' ? request.data as Record<string, unknown> : {};
    const preset = nearbyGemPreset(data['range']);
    if (!preset) throw new HttpsError('invalid-argument', 'Choose a valid travel range.');
    const apiKey = googlePlacesApiKey.value();
    if (!apiKey) throw new HttpsError('failed-precondition', 'Nearby place search is not configured.');
    await consumeNearbyGemQuota(userId);

    const manualLocation = stringOrEmpty(data['manualLocation']).trim().slice(0, 240);
    const latitude = finiteNearbyCoordinate(data['latitude'], -90, 90);
    const longitude = finiteNearbyCoordinate(data['longitude'], -180, 180);
    const origin = manualLocation
      ? await geocodeNearbyGemOrigin(manualLocation, apiKey)
      : latitude != null && longitude != null
        ? { lat: latitude, lng: longitude }
        : null;
    if (!origin) throw new HttpsError('invalid-argument', 'Allow location access or enter a starting place.');

    const startedAt = Date.now();
    const [rawCandidates, locationLabel] = await Promise.all([
      searchNearbyGemCandidates(origin, preset, apiKey),
      reverseGeocodeNearbyGemLabel(origin, apiKey),
    ]);
    const routedCandidates = await attachNearbyGemRoutes(rawCandidates, origin, preset, apiKey);
    const details = stringOrEmpty(data['details']).trim().slice(0, 500);
    const requestedCount = Math.max(6, Math.min(10, Math.trunc(Number(data['count']) || 8)));
    const candidates = rankNearbyGemCandidates(routedCandidates, preset, details, requestedCount);
    if (!candidates.length) {
      throw new HttpsError('not-found', `No strong matches were found within ${preset.description.toLocaleLowerCase()}. Try another range or starting place.`);
    }

    logger.info('Nearby gems discovery completed.', {
      userId,
      range: preset.id,
      sourceCandidateCount: rawCandidates.length,
      selectedCount: candidates.length,
      usedManualLocation: !!manualLocation,
      durationMs: Date.now() - startedAt,
    });
    return {
      board: {
        title: `Gems near ${locationLabel}`.slice(0, 90),
        description: `${candidates.length} interesting places within ${preset.description.toLocaleLowerCase()} of ${locationLabel}. Review, edit, and keep only the gems that fit you.`.slice(0, 500),
        icon: 'explore_nearby',
        tone: 'green',
        kind: 'standard',
        tourMeta: null,
      },
      cards: candidates.map(nearbyGemCard),
      locationLabel,
      searchMeta: {
        range: preset.id,
        rangeLabel: preset.label,
        candidateCount: rawCandidates.length,
        selectedCount: candidates.length,
        routeFiltered: routedCandidates.some((candidate) => candidate.routeDurationSeconds != null),
      },
    } satisfies GeneratedBoardWizardBatch & Record<string, unknown>;
  },
);

export const boardPlacePhoto = onRequest(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 30,
    memory: '512MiB',
    secrets: [googlePlacesApiKey],
  },
  async (request, response) => {
    const photoReference = textFromUnknown(request.query['ref']).slice(0, 1200);
    const photoName = textFromUnknown(request.query['name']).slice(0, 1200);
    if (!photoReference && !photoName) {
      response.status(400).send('Missing photo reference.');
      return;
    }

    const apiKey = googlePlacesApiKey.value();
    if (!apiKey) {
      response.status(503).send('Google Places is not configured.');
      return;
    }

    try {
      const safePhotoName = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoName) ? photoName : '';
      if (photoName && !safePhotoName) {
        response.status(400).send('Invalid photo name.');
        return;
      }
      const url = safePhotoName
        ? new URL(`https://places.googleapis.com/v1/${safePhotoName}/media`)
        : new URL('https://maps.googleapis.com/maps/api/place/photo');
      if (safePhotoName) {
        url.searchParams.set('maxWidthPx', '1000');
      } else {
        url.searchParams.set('maxwidth', '1000');
        url.searchParams.set('photo_reference', photoReference);
      }
      url.searchParams.set('key', apiKey);
      const upstream = await fetch(url.toString(), {
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) {
        response.status(upstream.status).send('Place photo unavailable.');
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      const bytes = Buffer.from(await upstream.arrayBuffer());
      response.setHeader('Content-Type', contentType);
      response.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800');
      response.status(200).send(bytes);
    } catch (error) {
      logger.warn('Board place photo proxy failed.', {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      response.status(502).send('Place photo unavailable.');
    }
  },
);

export const translateBoard = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 300,
    memory: '1GiB',
    concurrency: 8,
    maxInstances: 10,
    secrets: [geminiApiKey],
  },
  async (request) => {
    const boardId = stringOrEmpty(request.data?.boardId).trim();
    const targetLanguage = request.data?.targetLanguage;
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(boardId) || !isBoardTranslationLanguage(targetLanguage)) {
      throw new HttpsError('invalid-argument', 'Choose a valid board and translation language.');
    }

    const boardSnapshot = await db.collection('boards').doc(boardId).get();
    if (!boardSnapshot.exists) {
      throw new HttpsError('not-found', 'This board could not be found.');
    }
    const board = boardSnapshot.data() as Record<string, unknown>;
    const ownerUserId = stringOrEmpty(board['owner_user_id']);
    const isOwner = !!request.auth?.uid && request.auth.uid === ownerUserId;
    const isAdmin = request.auth?.token?.['admin'] === true;
    if (board['visibility'] !== 'public' && !isOwner && !isAdmin) {
      throw new HttpsError('permission-denied', 'This board is private.');
    }

    let source;
    try {
      source = extractBoardTranslationSource(board);
    } catch (error) {
      throw new HttpsError(
        'resource-exhausted',
        error instanceof Error ? error.message : 'This board is too large to translate.',
      );
    }
    if (!source.segments.length) {
      return {
        boardId,
        targetLanguage,
        sourceLanguage: source.sourceLanguage,
        fingerprint: source.fingerprint,
        segments: source.segments,
        cached: true,
        changed: false,
      };
    }

    const cacheId = createHash('sha256')
      .update(`${boardId}:${targetLanguage}`)
      .digest('hex');
    const cacheRef = db.collection('board_translations').doc(cacheId);
    const cached = await cacheRef.get();
    const cachedData = cached.data() as Record<string, unknown> | undefined;
    if (cached.exists
      && cachedData?.['status'] === 'ready'
      && cachedData['fingerprint'] === source.fingerprint) {
      return boardTranslationCallableResponse(
        boardId,
        targetLanguage,
        source.sourceLanguage,
        source.fingerprint,
        cachedData['segments'],
        true,
        cachedData['changed'] === true,
      );
    }

    const leaseToken = randomUUID();
    const now = Date.now();
    const leaseExpiresAt = now + 5 * 60 * 1000;
    const acquired = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(cacheRef);
      const value = snapshot.data() as Record<string, unknown> | undefined;
      if (value?.['status'] === 'ready' && value['fingerprint'] === source.fingerprint) {
        return 'ready';
      }
      const existingLease = typeof value?.['lease_expires_at_ms'] === 'number'
        ? value['lease_expires_at_ms']
        : 0;
      if (value?.['status'] === 'generating'
        && value['fingerprint'] === source.fingerprint
        && existingLease > now) {
        return 'wait';
      }
      transaction.set(cacheRef, {
        board_id: boardId,
        target_language: targetLanguage,
        source_language: source.sourceLanguage,
        fingerprint: source.fingerprint,
        status: 'generating',
        lease_token: leaseToken,
        lease_expires_at_ms: leaseExpiresAt,
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
      return 'acquired';
    });

    if (acquired === 'ready') {
      const ready = await cacheRef.get();
      return boardTranslationCallableResponse(
        boardId,
        targetLanguage,
        source.sourceLanguage,
        source.fingerprint,
        ready.data()?.['segments'],
        true,
        ready.data()?.['changed'] === true,
      );
    }
    if (acquired === 'wait') {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        const ready = await cacheRef.get();
        const value = ready.data() as Record<string, unknown> | undefined;
        if (value?.['status'] === 'ready' && value['fingerprint'] === source.fingerprint) {
          return boardTranslationCallableResponse(
            boardId,
            targetLanguage,
            source.sourceLanguage,
            source.fingerprint,
            value['segments'],
            true,
            value['changed'] === true,
          );
        }
        if (value?.['status'] !== 'generating') {
          break;
        }
      }
      throw new HttpsError('aborted', 'This translation is still being prepared. Please try again.');
    }

    await consumeBoardTranslationQuota(request, source.sourceCharacters);
    try {
      const segments = await translateBoardTextSegments(source.segments, targetLanguage);
      const changed = segments.some(
        (segment, index) => segment.text !== source.segments[index]?.text,
      );
      await cacheRef.set({
        board_id: boardId,
        target_language: targetLanguage,
        source_language: source.sourceLanguage,
        fingerprint: source.fingerprint,
        status: 'ready',
        segments,
        changed,
        source_characters: source.sourceCharacters,
        lease_token: FieldValue.delete(),
        lease_expires_at_ms: 0,
        generated_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
      return boardTranslationCallableResponse(
        boardId,
        targetLanguage,
        source.sourceLanguage,
        source.fingerprint,
        segments,
        false,
        changed,
      );
    } catch (error) {
      logger.error('Board translation failed.', {
        boardId,
        targetLanguage,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      await cacheRef.set({
        status: 'error',
        lease_token: FieldValue.delete(),
        lease_expires_at_ms: 0,
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw new HttpsError('unavailable', 'We could not translate this board right now. Please try again.');
    }
  },
);

async function consumeBoardTranslationQuota(
  request: CallableRequest<unknown>,
  sourceCharacters: number,
): Promise<void> {
  const uid = request.auth?.uid ?? '';
  const forwardedFor = stringOrEmpty(request.rawRequest.headers['x-forwarded-for']).split(',')[0]?.trim() ?? '';
  const userAgent = stringOrEmpty(request.rawRequest.headers['user-agent']).slice(0, 240);
  const actor = uid || `${forwardedFor}:${userAgent}`;
  const actorHash = createHash('sha256').update(actor || 'anonymous').digest('hex');
  const quotaRef = db.collection('board_translation_limits').doc(actorHash);
  const windowMs = 30 * 60 * 1000;
  const maximumRequests = uid ? 30 : 10;
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(quotaRef);
    const value = snapshot.data() as Record<string, unknown> | undefined;
    const windowStartedAt = typeof value?.['window_started_at_ms'] === 'number'
      ? value['window_started_at_ms']
      : 0;
    const count = typeof value?.['count'] === 'number' ? value['count'] : 0;
    const reset = now - windowStartedAt >= windowMs;
    if (!reset && count >= maximumRequests) {
      throw new HttpsError(
        'resource-exhausted',
        'You have translated several boards recently. Please try again in a little while.',
      );
    }
    transaction.set(quotaRef, {
      window_started_at_ms: reset || !windowStartedAt ? now : windowStartedAt,
      count: reset ? 1 : count + 1,
      source_characters: FieldValue.increment(sourceCharacters),
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

function boardTranslationCallableResponse(
  boardId: string,
  targetLanguage: 'en' | 'fr' | 'ja',
  sourceLanguage: 'en' | 'fr' | 'ja',
  fingerprint: string,
  value: unknown,
  cached: boolean,
  changed: boolean,
): {
  boardId: string;
  targetLanguage: 'en' | 'fr' | 'ja';
  sourceLanguage: 'en' | 'fr' | 'ja';
  fingerprint: string;
  segments: BoardTranslationSegment[];
  cached: boolean;
  changed: boolean;
} {
  const segments = Array.isArray(value)
    ? value.flatMap((item) => {
        const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        const key = stringOrEmpty(record['key']).slice(0, 180);
        const text = stringOrEmpty(record['text']).slice(0, 16_000);
        return key && text ? [{ key, text }] : [];
      })
    : [];
  return { boardId, targetLanguage, sourceLanguage, fingerprint, segments, cached, changed };
}

export const previewBoardWizardSource = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 90,
    memory: '1GiB',
    concurrency: 4,
    maxInstances: 20,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError('unauthenticated', 'Sign in to read a board source.');
    const data = (request.data ?? {}) as Record<string, unknown>;
    const prompt = stringOrEmpty(data.prompt).slice(0, 4000);
    const submitted = stringOrEmpty(data.url).slice(0, 1000) || firstHttpUrl(prompt);
    const sourceUrl = safeBoardCardSourceUrl(submitted);
    if (!sourceUrl) throw new HttpsError('invalid-argument', 'Provide a public HTTP or HTTPS page URL.');

    const startedAt = Date.now();
    const analysis = await analyzeBoardWizardSourcePreview(sourceUrl);
    logger.info('Board wizard source preview completed.', {
      userId,
      sourceHost: safeCommerceHostname(sourceUrl),
      specializedKind: analysis.specializedKind,
      manifestItemCount: analysis.manifest?.items.length ?? 0,
      expectedCount: analysis.manifest?.expectedCount ?? null,
      confidence: analysis.manifest?.confidence ?? 0,
      method: analysis.manifest?.method ?? null,
      durationMs: Date.now() - startedAt,
    });
    return {
      sourceUrl,
      requiresReview: !!analysis.manifest,
      specializedKind: analysis.specializedKind,
      manifest: analysis.manifest,
      exact: analysis.manifest ? boardWizardSourceManifestIsExact(analysis.manifest) : false,
      warning: analysis.warning,
    };
  },
);

export const generateBoardWizardBatch = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 300,
    memory: '2GiB',
    concurrency: 1,
    maxInstances: 20,
    secrets: [geminiApiKey, googlePlacesApiKey, googleCustomSearchApiKey, spotifyClientSecret],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to use the LivingWiki Wizard.');
    }

    const data = (request.data ?? {}) as BoardWizardCallableData;
    const mode = normalizeBoardWizardMode(data.mode);
    const defaultType = normalizeBoardWizardDefaultType(data.defaultType);
    const vibe = normalizeBoardWizardVibe(data.vibe);
    const mediaMode = normalizeBoardWizardMediaMode(data.mediaMode);
    const narrationStyle = normalizeBoardNarrationStyle(data.narrationStyle);
    const tourOptions = normalizeBoardWizardTourOptions(data.tourOptions, mode);
    const targetBoardId = stringOrEmpty(data.targetBoardId).slice(0, 140);
    const targetBoardTitle = stringOrEmpty(data.targetBoardTitle).slice(0, 120);
    const prompt = stringOrEmpty(data.prompt).slice(0, 4000);
    const pastedList = stringOrEmpty(data.pastedList).slice(0, BOARD_WIZARD_PASTE_MAX_LENGTH);
    const describedUrl = mode === 'describe' ? firstHttpUrl(prompt) : '';
    const submittedUrl = stringOrEmpty(data.url).slice(0, 1000) || describedUrl;
    const url = submittedUrl ? safeBoardCardSourceUrl(submittedUrl) : '';
    const usesUrlSource = (mode === 'url' || !!describedUrl) && !!submittedUrl;
    const generationMode: BoardWizardMode = usesUrlSource ? 'url' : mode;
    if (usesUrlSource && submittedUrl && !url) {
      throw new HttpsError('invalid-argument', 'Provide a public HTTP or HTTPS page URL.');
    }
    const submittedSourceManifest = url
      ? normalizeBoardWizardSourceManifest(data.sourceManifest, url)
      : null;
    const numberedSource = mode === 'paste' ? parseNumberedBoardSource(pastedList) : null;
    const explicitCount = inferBoardWizardRequestedCount([prompt, pastedList, targetBoardTitle].join(' '));
    const requestedCount = numberedSource?.items.length ?? explicitCount ?? (Number(data.count) || 12);
    const count = Math.max(1, Math.min(100, requestedCount));
    const photoNames = Array.isArray(data.photoNames)
      ? data.photoNames.map((name) => stringOrEmpty(name).slice(0, 180)).filter(Boolean).slice(0, 100)
      : [];
    let photoPayloadCharacters = 0;
    const photos = Array.isArray(data.photos)
      ? data.photos
          .map((value, index) => {
            const photo = value && typeof value === 'object' ? value as Record<string, unknown> : {};
            const mimeType = stringOrEmpty(photo.mimeType).toLowerCase();
            const base64 = stringOrEmpty(photo.base64);
            if (!/^image\/(?:jpeg|png|webp)$/.test(mimeType)
              || !base64
              || base64.length > 600_000
              || photoPayloadCharacters + base64.length > 9_000_000) {
              return null;
            }
            photoPayloadCharacters += base64.length;
            return {
              index,
              name: stringOrEmpty(photo.name).slice(0, 180),
              caption: stringOrEmpty(photo.caption).slice(0, 280),
              mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
              base64,
            };
          })
          .filter((photo): photo is {
            index: number;
            name: string;
            caption: string;
            mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
            base64: string;
          } => !!photo)
          .slice(0, 24)
      : [];
    const existingCards = Array.isArray(data.existingCards)
      ? data.existingCards.map(normalizeExistingBoardWizardCard).filter((card): card is { title: string; subtitle?: string; tags?: string[] } => !!card).slice(0, 40)
      : [];
    const singleTourStop = data.singleTourStop === true && isBoardWizardTourMode(mode) && count === 1;
    const currentCard = normalizeBoardWizardCurrentCard(data.currentCard, defaultType);

    if (data.imageOnly === true) {
      if (!currentCard) {
        throw new HttpsError('invalid-argument', 'Provide the current card before replacing its image.');
      }
      const result = await buildBoardWizardImageOnlyBatch({
        currentCard,
        prompt,
        targetBoardTitle,
        defaultType,
      });
      await db.collection('board_wizard_batches').add({
        owner_user_id: userId,
        mode: 'card-image',
        target_board_id: targetBoardId || null,
        target_board_title: targetBoardTitle || null,
        default_type: defaultType,
        vibe,
        narration_style: narrationStyle,
        requested_count: 1,
        generated_count: result.cards.length,
        prompt_preview: prompt.slice(0, 500),
        board_title: result.board.title,
        card_titles: result.cards.map((card) => card.title).slice(0, 100),
        created_at: FieldValue.serverTimestamp(),
      });
      return result;
    }

    let urlExtraction: BoardWizardUrlExtraction | null = null;
    let articleManifest: BoardWizardSourceManifest | null = submittedSourceManifest;
    let accommodationExtraction: BoardWizardAccommodationExtraction | null = null;
    let commerceExtraction: CommercePageExtraction | null = null;
    let urlResearchFallback = false;
    let urlSourceBlocked = false;
    let urlRecoveryMethod: GeneratedBoardWizardSourceReport['method'] = 'page';
    let mapsTourContext = '';
    const tourPromptUrl = isBoardWizardTourMode(mode) ? firstHttpUrl(prompt) : '';
    const sourceUrl = url || tourPromptUrl;
    if (isBoardWizardTourMode(mode) && sourceUrl && isGoogleMapsUrl(sourceUrl)) {
      try {
        const resolvedMapsUrl = await resolveGoogleMapsUrl(sourceUrl);
        mapsTourContext = buildGoogleMapsTourContext(sourceUrl, resolvedMapsUrl);
        if (!mapsTourContext) {
          throw new Error('Google Maps URL did not resolve to a usable route or place.');
        }
      } catch (error) {
        logger.warn('Board wizard Google Maps tour URL resolution failed.', {
          userId,
          sourceUrl,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      if (!mapsTourContext) {
        throw new HttpsError(
          'unavailable',
          'That Google Maps link could not be resolved. Please try again instead of generating an unrelated tour.',
        );
      }
    }
    if (usesUrlSource && url) {
      const urlIntakeStartedAt = Date.now();
      if (articleManifest) {
        urlExtraction = buildArticleManifestUrlExtraction(articleManifest);
        urlRecoveryMethod = articleManifest.method;
        urlSourceBlocked = articleManifest.sourceBlocked;
      } else try {
        const fetched = await fetchHtmlWithFallback(url, {
          timeoutMs: 30_000,
          preferBrowser: false,
          allowBrowserFallback: true,
        });
        const blocked = looksLikeAntiBotChallenge(fetched.html);
        urlSourceBlocked = blocked || fetched.status <= 0 || fetched.status >= 400;
        logger.info('Board wizard URL fetch completed.', {
          userId,
          urlHost: safeCommerceHostname(url),
          finalHost: safeCommerceHostname(fetched.finalUrl || url),
          method: fetched.method,
          status: fetched.status,
          blocked,
          htmlCharacters: fetched.html.length,
          durationMs: Date.now() - urlIntakeStartedAt,
          attempts: fetched.attempts,
        });
        const usableResponse = fetched.status >= 200 && fetched.status < 400 && !blocked;
        if (usableResponse) {
          urlRecoveryMethod = 'page';
          urlExtraction = await buildBoardWizardUrlContext(url, fetched.finalUrl || url, fetched.html);
          logger.info('Board wizard URL extraction completed.', {
            userId,
            urlHost: safeCommerceHostname(url),
            restaurantLike: urlExtraction.restaurantLike,
            menuItemCount: urlExtraction.menuItems.length,
            menuItemImageCount: urlExtraction.menuItems.filter((item) => !!item.imageUrl).length,
            durationMs: Date.now() - urlIntakeStartedAt,
          });
          // Restaurant menus can resemble product grids. Give a strongly extracted menu
          // precedence so its food-card behavior and page-bound photos are preserved.
          if (!(urlExtraction.restaurantLike && urlExtraction.menuItems.length >= 3)) {
            const commerce = extractCommercePage(url, fetched.finalUrl || url, fetched.html);
            commerceExtraction = commerce.isCommerce
              ? await enrichCommerceProductDetails(commerce)
              : null;
            logger.info('Board wizard commerce classification completed.', {
              userId,
              urlHost: safeCommerceHostname(url),
              isCommerce: commerce.isCommerce,
              productCount: commerce.products.length,
              productImageCount: commerce.products.filter((product) => !!product.imageUrl).length,
              durationMs: Date.now() - urlIntakeStartedAt,
            });
          }
          if (!commerceExtraction) {
            accommodationExtraction = buildBoardWizardAccommodationExtraction(url, fetched.finalUrl || url, fetched.html);
          }
          if (!commerceExtraction && !accommodationExtraction && !(urlExtraction.restaurantLike && urlExtraction.menuItems.length >= 3)) {
            articleManifest = extractBoardWizardArticleManifest(url, fetched.finalUrl || url, fetched.html);
            if (articleManifest) {
              urlExtraction = buildArticleManifestUrlExtraction(articleManifest);
            }
          }
        } else {
          logger.warn('Board wizard rejected an unusable source response.', {
            userId,
            urlHost: safeCommerceHostname(url),
            method: fetched.method,
            status: fetched.status,
            blocked,
            durationMs: Date.now() - urlIntakeStartedAt,
          });
        }
      } catch (error) {
        logger.warn('Board wizard URL intake failed.', {
          userId,
          url,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      if (!urlExtraction && !accommodationExtraction && !commerceExtraction) {
        const reader = await fetchBoardWizardReaderPage(url, { timeoutMs: 18_000 });
        if (reader.markdown) {
          urlExtraction = buildBoardWizardReaderExtraction(url, reader.markdown);
          if (!(urlExtraction?.restaurantLike && urlExtraction.menuItems.length >= 3)) {
            commerceExtraction = buildBoardWizardReaderCommerceExtraction(url, reader.markdown);
          }
          if (!commerceExtraction && !(urlExtraction?.restaurantLike && urlExtraction.menuItems.length >= 3)) {
            articleManifest = extractBoardWizardArticleManifestFromMarkdown(url, reader.markdown);
            if (articleManifest) urlExtraction = buildArticleManifestUrlExtraction(articleManifest);
          }
          if (urlExtraction || commerceExtraction) {
            urlRecoveryMethod = 'reader';
          }
        }
        urlSourceBlocked = urlSourceBlocked || reader.blocked;
        logger.info('Board wizard no-key Reader fallback completed.', {
          userId,
          urlHost: safeCommerceHostname(url),
          status: reader.status,
          markdownCharacters: reader.markdown.length,
          restaurantLike: urlExtraction?.restaurantLike ?? false,
          menuItemCount: urlExtraction?.menuItems.length ?? 0,
          menuItemImageCount: urlExtraction?.menuItems.filter((item) => !!item.imageUrl).length ?? 0,
          durationMs: reader.durationMs,
          errorMessage: reader.errorMessage,
          blocked: reader.blocked,
          commerceProductCount: commerceExtraction?.products.length ?? 0,
          commerceProductImageCount: commerceExtraction?.products.filter((product) => !!product.imageUrl).length ?? 0,
        });
      }
      if (!accommodationExtraction && isBoardWizardAccommodationUrl(url)) {
        accommodationExtraction = buildFallbackAccommodationExtraction(url);
      }
      if (!urlExtraction && !accommodationExtraction && !commerceExtraction) {
        urlExtraction = buildBoardWizardResearchFallbackExtraction(url);
        urlResearchFallback = true;
        urlRecoveryMethod = 'grounded-search';
        logger.warn('Board wizard URL extraction is using grounded research fallback.', {
          userId,
          urlHost: safeCommerceHostname(url),
          durationMs: Date.now() - urlIntakeStartedAt,
        });
      }
    }

    const effectivePrompt = [
      prompt,
      mapsTourContext,
      urlResearchFallback
        ? 'SOURCE PAGE COULD NOT BE FETCHED. Use grounded web research to reconstruct only the concrete named items publicly associated with this exact page.'
        : '',
      commerceExtraction
        ? `Detected shopping page with ${commerceExtraction.products.length} locally bound product records.`
        : '',
      accommodationExtraction ? `Detected lodging listing: ${accommodationExtraction.listingName}` : '',
      urlExtraction?.context ? `URL extraction context:\n${urlExtraction.context}` : '',
    ].filter(Boolean).join('\n\n').trim();
    const mapsTourStopCount = mapsTourContext
      ? (mapsTourContext.match(/^\d+\. /gm)?.length ?? 0)
      : 0;
    const generationCount = numberedSource?.items.length || articleManifest?.items.length || mapsTourStopCount || photos.length || count;

    if (!effectivePrompt && !pastedList && photoNames.length === 0 && photos.length === 0 && !url) {
      throw new HttpsError('invalid-argument', 'Describe the board, paste a list, choose photos, or provide a URL.');
    }

    const generationUsesNarrationPrompt = !commerceExtraction
      && !accommodationExtraction
      && !(urlExtraction?.restaurantLike && urlExtraction.menuItems.length >= 3);
    let generated: GeneratedBoardWizardBatch;
    try {
      generated = commerceExtraction
        ? buildCommerceWizardBatch({
            extraction: commerceExtraction,
            targetBoardTitle,
            requestedCount: explicitCount,
          })
        : accommodationExtraction
        ? buildAccommodationWizardBatch({
            extraction: accommodationExtraction,
            targetBoardTitle,
            count,
          })
        : urlExtraction?.restaurantLike && urlExtraction.menuItems.length >= 3
        ? buildRestaurantMenuWizardBatch({
            extraction: urlExtraction,
            sourceUrl: url,
            targetBoardTitle,
            count,
          })
        : await generateBoardWizardBatchWithGemini({
            mode: generationMode,
            prompt: effectivePrompt || url || photoNames.join(', '),
            pastedList,
            url: sourceUrl,
            photoNames,
            photos,
            targetBoardTitle,
            defaultType,
            count: generationCount,
            countIsExplicit: !!numberedSource || !!articleManifest || explicitCount !== null || photoNames.length > 0 || photos.length > 0,
            vibe,
            narrationStyle,
            tourOptions: isBoardWizardTourMode(mode) ? tourOptions : null,
            existingCards,
            singleTourStop,
            sourceManifest: articleManifest,
          });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/credits are depleted|prepayment|prepaid balance/iu.test(message)) {
        throw new HttpsError(
          'resource-exhausted',
          'AI generation is paused because the Gemini API prepaid balance is empty. Add credits in Google AI Studio Billing, then try again.',
        );
      }
      throw new HttpsError(
        'unavailable',
        message || 'AI generation is temporarily unavailable. Please try again.',
      );
    }
    const narrationReadyGenerated = generationUsesNarrationPrompt
      ? generated
      : {
          ...generated,
          board: {
            ...generated.board,
            description: boardNarrationFallbackDescription(
              narrationStyle,
              generated.board.title,
              generated.board.description,
            ),
          },
          cards: generated.cards.map((card) => ({
            ...card,
            notes: boardNarrationFallbackNotes(narrationStyle, card.title, card.notes),
          })),
        };
    const sourceShapedGenerated = numberedSource
      ? shapeNumberedSourceWizardBatch(narrationReadyGenerated, numberedSource, defaultType)
      : articleManifest
        ? shapeArticleSourceWizardBatch(narrationReadyGenerated, articleManifest, defaultType)
        : narrationReadyGenerated;
    const urlFallbackShapedGenerated = urlResearchFallback
      ? shapeBoardWizardResearchFallbackBatch(sourceShapedGenerated, url)
      : sourceShapedGenerated;
    const enrichedResult = accommodationExtraction
      ? urlFallbackShapedGenerated
      : await enrichBoardWizardBatchWithPlaces(urlFallbackShapedGenerated, {
          userId,
          mode,
          prompt: effectivePrompt || prompt || pastedList || url || photoNames.join(', '),
          targetBoardTitle,
          defaultType,
        });
    const imageProvenanceResult = markCommerceImageFallbacks(enrichedResult);
    const result = numberedSource
      ? shapeNumberedSourceWizardBatch(imageProvenanceResult, numberedSource, defaultType)
      : articleManifest
        ? shapeArticleSourceWizardBatch(imageProvenanceResult, articleManifest, defaultType)
        : imageProvenanceResult;
    const previewReadyResult = await enrichBoardWizardBatchWithSongAudioPreviews(
      result,
      [
        effectivePrompt || prompt || pastedList || url || photoNames.join(', '),
        targetBoardTitle,
        result.board.title,
        result.board.description,
      ].filter(Boolean).join(' '),
    );
    const routeReadyResult = isBoardWizardTourMode(mode)
      ? await enrichBoardWizardTourBatchWithRoutes(previewReadyResult, mode, tourOptions)
      : previewReadyResult;
    const mediaReadyResult: GeneratedBoardWizardBatch = {
      ...routeReadyResult,
      cards: applyBoardWizardMediaMode(routeReadyResult.cards, mediaMode),
    };

    const resultWithSourceReport: GeneratedBoardWizardBatch = usesUrlSource && url
      ? {
          ...mediaReadyResult,
          sourceReport: buildBoardWizardSourceReport(mediaReadyResult, {
            sourceUrl: url,
            sourceBlocked: urlSourceBlocked,
            method: urlRecoveryMethod,
            manifest: articleManifest,
          }),
        }
      : mediaReadyResult;

    await db.collection('board_wizard_batches').add({
      owner_user_id: userId,
      mode,
      target_board_id: targetBoardId || null,
      target_board_title: targetBoardTitle || null,
      default_type: defaultType,
      vibe,
      media_mode: mediaMode,
      narration_style: narrationStyle,
      requested_count: generationCount,
      generated_count: resultWithSourceReport.cards.length,
      prompt_preview: (prompt || pastedList || url || photoNames.join(', ')).slice(0, 500),
      board_title: resultWithSourceReport.board.title,
      card_titles: resultWithSourceReport.cards.map((card) => card.title).slice(0, 100),
      source_report: resultWithSourceReport.sourceReport ?? null,
      created_at: FieldValue.serverTimestamp(),
    });

    return resultWithSourceReport;
  },
);

export const resolveBoardCardVideos = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 120,
    memory: '1GiB',
    concurrency: 5,
    maxInstances: 10,
    secrets: [googleCustomSearchApiKey, youtubeDataApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to find videos for board cards.');
    }
    const data = request.data && typeof request.data === 'object'
      ? request.data as Record<string, unknown>
      : {};
    const submittedMediaMode = data.mediaMode === undefined
      ? null
      : normalizeBoardWizardMediaMode(data.mediaMode);
    if (submittedMediaMode === 'images') {
      return { matches: [], attempted: 0, skippedByMediaMode: true };
    }
    const boardContext = [
      stringOrEmpty(data.boardTitle).slice(0, 120),
      stringOrEmpty(data.boardDescription).slice(0, 300),
      stringOrEmpty(data.prompt).slice(0, 600),
    ].filter(Boolean).join(' · ');
    // A board generation currently tops out at 20 cards. Keep the resolver to
    // that same bound and overlap independent lookups so a temporary miss does
    // not make an otherwise-ready board wait for a long serial search.
    const rawCards = Array.isArray(data.cards) ? data.cards.slice(0, 20) : [];
    const cards = rawCards.map((value) => normalizeBoardVideoLookupCard(value)).filter(
      (card): card is NormalizedBoardVideoLookupCard => !!card,
    );
    if (!cards.length) {
      return { matches: [], attempted: 0 };
    }

    const lookupStartedAt = Date.now();
    const deadlineAt = lookupStartedAt + BOARD_VIDEO_LOOKUP_BUDGET_MS;
    let deadlineSkippedCount = 0;
    const apiKey = youtubeDataApiKey.value();
    const customSearchApiKey = googleCustomSearchApiKey.value();
    // One persistent player avoids competing cold starts in the 1 GiB Cloud
    // Run container. Candidate checks are then fast cue operations, and the
    // ten concurrent card searches naturally take turns through the queue.
    const embedVerifier = createYouTubeEmbedVerifier(1);
    try {
      // Let every card begin its search before a difficult card can consume the
      // entire lookup budget. The verifier still caps Chromium work at five
      // pages, so this improves fairness without increasing browser pressure.
      const matches = await mapWithConcurrency(cards, Math.min(10, cards.length), async (card) => {
        try {
          if (Date.now() >= deadlineAt - BOARD_VIDEO_DEADLINE_BUFFER_MS) {
            deadlineSkippedCount += 1;
            return null;
          }
          if (!card.youtubeReference && !boardWizardCardWantsVideo(card, boardContext)) {
            return null;
          }
          const query = buildBoardWizardVideoSearchQuery(card, boardContext);
          const candidate = card.youtubeReference
            ? await resolveYouTubeCandidateByReference(card.youtubeReference, apiKey, embedVerifier, deadlineAt)
            : await resolveCachedBoardWizardVideo(
                card,
                boardContext,
                query,
                apiKey,
                customSearchApiKey,
                embedVerifier,
                deadlineAt,
              );
          if (!candidate) return null;
          const score = card.youtubeReference
            ? 100
            : scoreBoardWizardVideoCandidate(card, boardContext, candidate);
          if (!card.youtubeReference && score < 55) return null;
          const match = {
            cardId: card.cardId,
            youtubeVideoId: candidate.videoId,
            youtubeVideoTitle: candidate.title,
            youtubeChannelTitle: candidate.channelTitle,
            youtubeThumbnailUrl: candidate.thumbnailUrl,
            youtubeDurationSeconds: candidate.durationSeconds,
            youtubeMatchConfidence: card.youtubeReference
              ? 1
              : Math.max(0, Math.min(1, Number(((score - 35) / 100).toFixed(2)))),
            youtubeVerifiedAt: new Date().toISOString(),
          };
          logger.info('Verified a playable YouTube result for a board card.', {
            cardId: card.cardId,
            cardTitle: card.title,
            videoId: candidate.videoId,
            videoTitle: candidate.title,
            score,
          });
          return match;
        } catch (error) {
          logger.warn('Board wizard video lookup failed for one card; continuing with the remaining cards.', {
            cardId: card.cardId,
            cardTitle: card.title,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      });

      const degraded = Date.now() < youtubeDataApiSearchUnavailableUntil;
      logger.info('Board wizard video enrichment completed.', {
        userId,
        requestedCount: cards.length,
        matchedCount: matches.filter(Boolean).length,
        degraded,
        degradedReason: degraded ? youtubeDataApiSearchUnavailableReason : '',
        deadlineSkippedCount,
        durationMs: Date.now() - lookupStartedAt,
        boardTitle: stringOrEmpty(data.boardTitle).slice(0, 120),
      });
      return {
        matches: matches.filter((match) => !!match),
        attempted: cards.length,
        degraded,
        partial: deadlineSkippedCount > 0,
      };
    } finally {
      await embedVerifier.close();
    }
  },
);

type NormalizedBoardVideoLookupCard = BoardWizardVideoCardInput & {
  cardId: string;
  youtubeReference: string;
  excludeVideoIds: string[];
};

function normalizeBoardVideoLookupCard(value: unknown): NormalizedBoardVideoLookupCard | null {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const cardId = stringOrEmpty(data.cardId).slice(0, 160);
  const title = stringOrEmpty(data.title).replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!cardId || !title) return null;
  return {
    cardId,
    title,
    subtitle: stringOrEmpty(data.subtitle).replace(/\s+/g, ' ').trim().slice(0, 180),
    notes: stringOrEmpty(data.notes).replace(/\s+/g, ' ').trim().slice(0, 800),
    entityName: stringOrEmpty(data.entityName).replace(/\s+/g, ' ').trim().slice(0, 120),
    entityType: stringOrEmpty(data.entityType).slice(0, 40),
    imageContext: stringOrEmpty(data.imageContext).replace(/\s+/g, ' ').trim().slice(0, 180),
    tags: Array.isArray(data.tags)
      ? data.tags.map((tag) => stringOrEmpty(tag).slice(0, 40)).filter(Boolean).slice(0, 8)
      : [],
    videoIntent: data.videoIntent === true,
    videoSearchQuery: stringOrEmpty(data.videoSearchQuery).replace(/\s+/g, ' ').trim().slice(0, 180),
    youtubeReference: stringOrEmpty(data.youtubeReference).trim().slice(0, 500),
    excludeVideoIds: Array.isArray(data.excludeVideoIds)
      ? Array.from(new Set(data.excludeVideoIds.map(youtubeVideoIdFromReference).filter(Boolean))).slice(0, 20)
      : [],
  };
}

async function resolveCachedBoardWizardVideo(
  card: NormalizedBoardVideoLookupCard,
  boardContext: string,
  query: string,
  youtubeApiKey: string,
  customSearchApiKey: string,
  embedVerifier: YouTubeEmbedVerifier,
  deadlineAt: number,
): Promise<BoardWizardVideoCandidate | null> {
  if (!query) return null;
  // Prefix the hash whenever resolver credentials or matching semantics change.
  // This prevents a short-lived outage from pinning freshly repaired searches
  // to an old negative cache entry.
  const exclusionKey = [...card.excludeVideoIds].sort().join(',');
  const cacheId = createHash('sha256')
    .update(`youtube-playable-v7|${query.toLowerCase()}|exclude:${exclusionKey}`)
    .digest('hex');
  const cacheRef = db.collection('board_video_matches').doc(cacheId);
  try {
    const cached = await cacheRef.get();
    const data = cached.data();
    if (data && Number(data.expires_at_ms) > Date.now()) {
      return normalizeCachedBoardVideoCandidate(data.match);
    }
  } catch (error) {
    logger.warn('Board video cache read failed.', {
      query,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  const candidate = await searchYouTubeForBoardCard(
    card,
    boardContext,
    query,
    youtubeApiKey,
    customSearchApiKey,
    embedVerifier,
    deadlineAt,
  );
  try {
    await cacheRef.set({
      query,
      resolver_version: 'youtube-playable-v7',
      verification_status: candidate ? 'playable' : 'no-playable-match',
      verified_at_iso: candidate ? new Date().toISOString() : '',
      match: candidate ?? null,
      expires_at_ms: Date.now() + (candidate ? 48 * 60 * 60 * 1000 : 5 * 60 * 1000),
      updated_at: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.warn('Board video cache write failed.', {
      query,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
  return candidate;
}

function normalizeCachedBoardVideoCandidate(value: unknown): BoardWizardVideoCandidate | null {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const videoId = youtubeVideoIdFromReference(data.videoId);
  if (!videoId || data.embeddable !== true) return null;
  return {
    videoId,
    title: stringOrEmpty(data.title).slice(0, 300),
    channelTitle: stringOrEmpty(data.channelTitle).slice(0, 200),
    thumbnailUrl: stringOrEmpty(data.thumbnailUrl).slice(0, 2000),
    durationSeconds: Math.max(0, Math.min(86_400, Number(data.durationSeconds) || 0)),
    embeddable: true,
  };
}

async function searchYouTubeForBoardCard(
  card: NormalizedBoardVideoLookupCard,
  boardContext: string,
  query: string,
  youtubeApiKey: string,
  customSearchApiKey: string,
  embedVerifier: YouTubeEmbedVerifier,
  deadlineAt: number,
): Promise<BoardWizardVideoCandidate | null> {
  const apiSearch = await searchYouTubeDataApi(query, youtubeApiKey, deadlineAt);
  let officialCandidates = apiSearch.candidates;
  if (!officialCandidates.length) {
    officialCandidates = await searchYouTubeWeb(buildBoardWizardYouTubeApiQuery(query), deadlineAt);
  }
  const officialMatch = await chooseBoardWizardVideoCandidate(
    card,
    boardContext,
    officialCandidates,
    embedVerifier,
    {
      verificationLimit: 5,
      requireDirectMedia: true,
      deadlineAt,
    },
  );
  if (officialMatch) return officialMatch;
  if (Date.now() >= deadlineAt - BOARD_VIDEO_DEADLINE_BUFFER_MS) return null;
  const relatedQuery = buildBoardWizardRelatedVideoSearchQuery(card);
  const relatedApiSearch = await searchYouTubeDataApi(relatedQuery, youtubeApiKey, deadlineAt);
  let relatedCandidates = relatedApiSearch.candidates;
  if (!relatedCandidates.length) {
    relatedCandidates = await searchYouTubeWeb(relatedQuery, deadlineAt);
  }
  const relatedMatch = await chooseBoardWizardVideoCandidate(
    card,
    boardContext,
    relatedCandidates,
    embedVerifier,
    {
      allowRelated: true,
      verificationLimit: 10,
      requireDirectMedia: true,
      deadlineAt,
    },
  );
  if (relatedMatch) return relatedMatch;
  if (Date.now() >= deadlineAt - BOARD_VIDEO_DEADLINE_BUFFER_MS) return null;
  const contextCandidates = await searchYouTubeWeb(buildBoardWizardContextVideoSearchQuery(card), deadlineAt);
  const contextMatch = await chooseBoardWizardVideoCandidate(
    card,
    boardContext,
    contextCandidates,
    embedVerifier,
    {
      allowRelated: true,
      verificationLimit: 7,
      deadlineAt,
    },
  );
  if (contextMatch) return contextMatch;
  if (Date.now() >= deadlineAt - BOARD_VIDEO_DEADLINE_BUFFER_MS) return null;
  const fallbackCandidates = await searchYouTubeWithCustomSearch(query, customSearchApiKey);
  return await chooseBoardWizardVideoCandidate(card, boardContext, fallbackCandidates, embedVerifier, {
    verificationLimit: 4,
    deadlineAt,
  });
}

async function chooseBoardWizardVideoCandidate(
  card: NormalizedBoardVideoLookupCard,
  boardContext: string,
  candidates: BoardWizardVideoCandidate[],
  embedVerifier: YouTubeEmbedVerifier,
  options: {
    allowRelated?: boolean;
    requireDirectMedia?: boolean;
    verificationLimit?: number;
    deadlineAt: number;
  },
): Promise<BoardWizardVideoCandidate | null> {
  const ranked = rankBoardWizardVideoCandidates(card, boardContext, candidates, {
    allowRelated: options.allowRelated,
    limit: 12,
  });
  const verificationLimit = Math.max(0, Math.min(8, Math.trunc(options.verificationLimit ?? 3)));
  const candidatesToVerify = ranked
    .filter((entry) => !card.excludeVideoIds.includes(entry.candidate.videoId))
    .filter((entry) => !youtubeVideoEmbedIsKnownBlocked(entry.candidate.videoId))
    .filter((entry) => !options.requireDirectMedia || boardWizardVideoCandidateLooksDirect(card, entry.candidate))
    .slice(0, verificationLimit);
  for (const entry of candidatesToVerify) {
    if (Date.now() >= options.deadlineAt - BOARD_VIDEO_DEADLINE_BUFFER_MS) break;
    const verification = await embedVerifier.verify(entry.candidate.videoId, options.deadlineAt);
    if (verification.status === 'playable') return entry.candidate;
    if (verification.status === 'blocked') {
      rememberBlockedYouTubeEmbed(entry.candidate.videoId);
    }
    logger.info('Rejected a YouTube result that was not verified playable in an embedded player.', {
      cardId: card.cardId,
      cardTitle: card.title,
      videoId: entry.candidate.videoId,
      videoTitle: entry.candidate.title,
      candidateScore: entry.score,
      verificationStatus: verification.status,
      verificationReason: verification.reason,
      playerErrorCode: verification.errorCode,
    });
  }
  return null;
}

async function resolveYouTubeCandidateByReference(
  reference: string,
  apiKey: string,
  embedVerifier: YouTubeEmbedVerifier,
  deadlineAt: number,
): Promise<BoardWizardVideoCandidate | null> {
  const videoId = youtubeVideoIdFromReference(reference);
  if (!videoId) return null;
  const official = await fetchYouTubeDataApiCandidates([videoId], apiKey);
  const fallback = official[0]?.embeddable
    ? official[0]
    : await fetchYouTubeOEmbedCandidate(videoId, deadlineAt);
  if (!fallback) return null;
  const verification = await embedVerifier.verify(videoId, deadlineAt);
  if (verification.status !== 'playable') {
    if (verification.status === 'blocked') rememberBlockedYouTubeEmbed(videoId);
    logger.info('Rejected an explicit YouTube reference because embedded playback could not be verified.', {
      videoId,
      verificationStatus: verification.status,
      verificationReason: verification.reason,
      playerErrorCode: verification.errorCode,
    });
    return null;
  }
  return fallback;
}

function youtubeVideoEmbedIsKnownBlocked(videoId: string): boolean {
  const normalized = youtubeVideoIdFromReference(videoId);
  if (!normalized) return true;
  const blockedUntil = youtubeBlockedEmbedUntil.get(normalized) ?? 0;
  if (blockedUntil <= Date.now()) {
    youtubeBlockedEmbedUntil.delete(normalized);
    return false;
  }
  return true;
}

function rememberBlockedYouTubeEmbed(videoId: string): void {
  const normalized = youtubeVideoIdFromReference(videoId);
  if (!normalized) return;
  if (youtubeBlockedEmbedUntil.size >= 2_000) {
    const now = Date.now();
    for (const [id, blockedUntil] of youtubeBlockedEmbedUntil) {
      if (blockedUntil <= now || youtubeBlockedEmbedUntil.size >= 1_500) {
        youtubeBlockedEmbedUntil.delete(id);
      }
    }
  }
  youtubeBlockedEmbedUntil.set(normalized, Date.now() + BOARD_VIDEO_BLOCKED_MEMORY_MS);
}

async function searchYouTubeDataApi(
  query: string,
  apiKey: string,
  deadlineAt: number,
): Promise<{ candidates: BoardWizardVideoCandidate[]; available: boolean }> {
  if (!apiKey) return { candidates: [], available: false };
  if (Date.now() < youtubeDataApiSearchUnavailableUntil) {
    return { candidates: [], available: false };
  }
  if (Date.now() >= deadlineAt - BOARD_VIDEO_DEADLINE_BUFFER_MS) {
    return { candidates: [], available: false };
  }
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoEmbeddable', 'true');
    url.searchParams.set('videoSyndicated', 'true');
    url.searchParams.set('safeSearch', 'moderate');
    url.searchParams.set('maxResults', '15');
    url.searchParams.set('q', buildBoardWizardYouTubeApiQuery(query));
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'LivingWiki/1.0 board-video-resolver' },
      signal: AbortSignal.timeout(boardVideoRequestTimeout(deadlineAt, 7_000)),
    });
    const data = await response.json() as YouTubeSearchResponse;
    if (!response.ok || data.error?.message) {
      if (response.status === 403 || response.status === 429) {
        youtubeDataApiSearchUnavailableUntil = Date.now() + (response.status === 429 ? 30 * 60 * 1000 : 10 * 60 * 1000);
        youtubeDataApiSearchUnavailableReason = response.status === 429 ? 'quota-exhausted' : 'access-denied';
      }
      logger.warn('YouTube Data API search unavailable; using search fallback.', {
        query,
        status: response.status,
        error: data.error?.message,
      });
      return { candidates: [], available: false };
    }
    const ids = (data.items ?? [])
      .map((item) => youtubeVideoIdFromReference(item.id?.videoId))
      .filter(Boolean);
    return {
      candidates: await fetchYouTubeDataApiCandidates(ids, apiKey, deadlineAt),
      available: true,
    };
  } catch (error) {
    logger.warn('YouTube Data API search failed; using search fallback.', {
      query,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { candidates: [], available: false };
  }
}

async function fetchYouTubeDataApiCandidates(
  videoIds: string[],
  apiKey: string,
  deadlineAt?: number,
): Promise<BoardWizardVideoCandidate[]> {
  const ids = videoIds.map(youtubeVideoIdFromReference).filter(Boolean).slice(0, 20);
  if (!apiKey || !ids.length) return [];
  if (deadlineAt && Date.now() >= deadlineAt - BOARD_VIDEO_DEADLINE_BUFFER_MS) return [];
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,status,contentDetails');
    url.searchParams.set('id', ids.join(','));
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'LivingWiki/1.0 board-video-resolver' },
      signal: AbortSignal.timeout(deadlineAt ? boardVideoRequestTimeout(deadlineAt, 6_000) : 6_000),
    });
    const data = await response.json() as YouTubeVideosResponse;
    if (!response.ok || data.error?.message) return [];
    return (data.items ?? []).map((item): BoardWizardVideoCandidate | null => {
      const videoId = youtubeVideoIdFromReference(item.id);
      if (!videoId || item.status?.embeddable !== true || item.status?.privacyStatus !== 'public') return null;
      const thumbnails = item.snippet?.thumbnails ?? {};
      return {
        videoId,
        title: decodeBasicHtmlEntities(stringOrEmpty(item.snippet?.title)).slice(0, 300),
        channelTitle: decodeBasicHtmlEntities(stringOrEmpty(item.snippet?.channelTitle)).slice(0, 200),
        thumbnailUrl: stringOrEmpty(
          thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url
          || thumbnails.medium?.url || thumbnails.default?.url,
        ).slice(0, 2000),
        durationSeconds: parseIso8601DurationSeconds(item.contentDetails?.duration),
        embeddable: true,
      };
    }).filter((candidate): candidate is BoardWizardVideoCandidate => !!candidate);
  } catch {
    return [];
  }
}

async function searchYouTubeWithCustomSearch(
  query: string,
  apiKey: string,
): Promise<BoardWizardVideoCandidate[]> {
  const cx = googleCustomSearchCx.trim();
  if (!apiKey || !cx || Date.now() < googleCustomSearchUnavailableUntil) return [];
  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', `${query} site:youtube.com/watch`);
    url.searchParams.set('num', '8');
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'LivingWiki/1.0 board-video-resolver' },
      signal: AbortSignal.timeout(7_000),
    });
    const data = await response.json() as GoogleCustomSearchWebResponse;
    if (!response.ok || data.error?.message) {
      if (response.status === 403 || response.status === 429) {
        googleCustomSearchUnavailableUntil = Date.now() + (response.status === 403 ? 60 * 60 * 1000 : 60 * 1000);
      }
      logger.warn('YouTube Custom Search fallback unavailable.', {
        query,
        status: response.status,
        error: data.error?.message,
      });
      return [];
    }
    const ids = Array.from(new Set((data.items ?? [])
      .map((item) => youtubeVideoIdFromReference(item.link))
      .filter(Boolean)))
      .slice(0, 6);
    const candidates = await Promise.all(ids.map((id) => fetchYouTubeOEmbedCandidate(id)));
    return candidates.filter((candidate): candidate is BoardWizardVideoCandidate => !!candidate);
  } catch (error) {
    logger.warn('YouTube Custom Search fallback failed.', {
      query,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function searchYouTubeWeb(query: string, deadlineAt: number): Promise<BoardWizardVideoCandidate[]> {
  if (Date.now() >= deadlineAt - BOARD_VIDEO_DEADLINE_BUFFER_MS) return [];
  try {
    const url = new URL('https://www.youtube.com/results');
    url.searchParams.set('search_query', query);
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      },
      signal: AbortSignal.timeout(boardVideoRequestTimeout(deadlineAt, 6_000)),
    });
    if (!response.ok) return [];
    const html = await response.text();
    const parsed = extractYouTubeWebSearchResults(html, 24).map((candidate): BoardWizardVideoCandidate => ({
      ...candidate,
      thumbnailUrl: decodeBasicHtmlEntities(candidate.thumbnailUrl),
      title: decodeBasicHtmlEntities(candidate.title),
      channelTitle: decodeBasicHtmlEntities(candidate.channelTitle),
      embeddable: true,
    }));
    if (parsed.length) return parsed;
    const ids = Array.from(html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g), (match) => match[1]);
    const uniqueIds = Array.from(new Set(ids)).slice(0, 4);
    const candidates = await Promise.all(uniqueIds.map((id) => fetchYouTubeOEmbedCandidate(id, deadlineAt)));
    return candidates.filter((candidate): candidate is BoardWizardVideoCandidate => !!candidate);
  } catch (error) {
    logger.warn('YouTube web search fallback failed.', {
      query,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function fetchYouTubeOEmbedCandidate(
  videoId: string,
  deadlineAt?: number,
): Promise<BoardWizardVideoCandidate | null> {
  const id = youtubeVideoIdFromReference(videoId);
  if (!id) return null;
  if (deadlineAt && Date.now() >= deadlineAt - BOARD_VIDEO_DEADLINE_BUFFER_MS) return null;
  try {
    const url = new URL('https://www.youtube.com/oembed');
    url.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`);
    url.searchParams.set('format', 'json');
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'LivingWiki/1.0 board-video-resolver' },
      signal: AbortSignal.timeout(deadlineAt ? boardVideoRequestTimeout(deadlineAt, 4_000) : 4_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as YouTubeOEmbedResponse;
    if (!data.title || !data.author_name) return null;
    return {
      videoId: id,
      title: decodeBasicHtmlEntities(data.title).slice(0, 300),
      channelTitle: decodeBasicHtmlEntities(data.author_name).slice(0, 200),
      thumbnailUrl: stringOrEmpty(data.thumbnail_url).slice(0, 2000),
      durationSeconds: 0,
      embeddable: true,
    };
  } catch {
    return null;
  }
}

function boardVideoRequestTimeout(deadlineAt: number, maximumMs: number): number {
  return Math.max(250, Math.min(maximumMs, deadlineAt - Date.now() - 250));
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export const generateBoardCardImage = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 120,
    memory: '1GiB',
    secrets: [geminiApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to generate card images.');
    }
    const boardId = optionalBoardCardImageIdentifier(request.data?.boardId);
    if (boardId) {
      await assertCanEditBoardImages(userId, boardId);
    }

    const userPrompt = stringOrEmpty(request.data?.prompt).replace(/\s+/g, ' ').trim().slice(0, 700);
    const cardTitle = stringOrEmpty(request.data?.cardTitle).replace(/\s+/g, ' ').trim().slice(0, 120);
    const cardSubtitle = stringOrEmpty(request.data?.cardSubtitle).replace(/\s+/g, ' ').trim().slice(0, 180);
    const cardNotes = stringOrEmpty(request.data?.cardNotes).replace(/\s+/g, ' ').trim().slice(0, 320);
    const boardTitle = stringOrEmpty(request.data?.boardTitle).replace(/\s+/g, ' ').trim().slice(0, 120);
    const boardDescription = stringOrEmpty(request.data?.boardDescription).replace(/\s+/g, ' ').trim().slice(0, 240);
    if (userPrompt.length < 3 && cardTitle.length < 3) {
      throw new HttpsError('invalid-argument', 'Describe the image or add a card title first.');
    }

    const prompt = [
      'Create one beautiful, high-quality editorial image for a LivingWiki card.',
      'Use a polished photographic or premium illustrative composition appropriate to the subject.',
      'The image must work as a landscape card cover with the main subject clear at thumbnail size.',
      'Do not add words, captions, logos, UI, borders, watermarks, signatures, or mockup frames.',
      'Do not imitate an existing album cover, poster, copyrighted character, or another artist\'s signature style.',
      userPrompt ? `User direction: ${userPrompt}` : '',
      cardTitle ? `Card title: ${cardTitle}` : '',
      cardSubtitle ? `Card subtitle: ${cardSubtitle}` : '',
      cardNotes ? `Card context: ${cardNotes}` : '',
      boardTitle ? `Board: ${boardTitle}` : '',
      boardDescription ? `Board context: ${boardDescription}` : '',
    ].filter(Boolean).join('\n');

    try {
      const generated = await generateBoardCardImageAsset(prompt);
      const bytes = Buffer.from(generated.base64, 'base64');
      if (!bytes.length || bytes.length > 7 * 1024 * 1024) {
        throw new HttpsError('resource-exhausted', 'Generated image was too large to return.');
      }
      return {
        imageDataUrl: `data:${generated.mimeType};base64,${generated.base64}`,
        model: generated.model,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('generateBoardCardImage failed.', {
        userId,
        boardId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError('internal', error instanceof Error ? error.message : 'Nano Banana could not generate this image.');
    }
  },
);

export const searchBoardCardImages = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [googleCustomSearchApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to search for card images.');
    }
    const boardId = optionalBoardCardImageIdentifier(request.data?.boardId);
    if (boardId) {
      await assertCanEditBoardImages(userId, boardId);
    }
    const query = stringOrEmpty(request.data?.query).replace(/\s+/g, ' ').trim().slice(0, 180);
    if (query.length < 2) {
      throw new HttpsError('invalid-argument', 'Enter at least two characters to search for a photo.');
    }
    const apiKey = googleCustomSearchApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Photo search is not configured.');
    }
    const worldCupEventTitle = buildWorldCupTeamWikipediaTitle(query, query);
    const searchQueries = buildBoardCardImageSearchQueries(query);
    const [eventImageUrl, searchSettled] = await Promise.all([
      worldCupEventTitle ? findReferenceImageForBoardWizard(worldCupEventTitle) : Promise.resolve(''),
      Promise.allSettled(searchQueries.map((searchQuery) => findWikimediaCommonsImagesForBoardCard(searchQuery, 8))),
    ]);
    const successfulSearches = searchSettled.filter(
      (result): result is PromiseFulfilledResult<Array<Omit<BoardCardImageSearchResult, 'token'>>> => result.status === 'fulfilled',
    );
    if (!successfulSearches.length) {
      throw new HttpsError('unavailable', 'Photo search is temporarily unavailable.');
    }
    const searchedImages = successfulSearches
      .flatMap((result) => result.value)
      .filter((result) => !worldCupEventTitle || isUsefulWorldCupPhotoSearchResult(result));
    const commonsResults = worldCupEventTitle ? rankWorldCupPhotoSearchResults(searchedImages, query) : searchedImages;
    const eventResult: Omit<BoardCardImageSearchResult, 'token'>[] = eventImageUrl
      ? [{
          imageUrl: eventImageUrl,
          thumbnailUrl: eventImageUrl,
          sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(worldCupEventTitle.replace(/ /g, '_'))}`,
          sourceLabel: 'Wikipedia · tournament event',
          title: `${worldCupEventTitle} event photo`,
        }]
      : [];
    const results = [...eventResult, ...commonsResults]
      .filter((result, index, all) => all.findIndex((candidate) => candidate.imageUrl === result.imageUrl) === index)
      .slice(0, 8);
    return {
      query,
      provider: 'Wikimedia Commons',
      results: results.map((result): BoardCardImageSearchResult => ({
        ...result,
        token: boardCardImageSearchToken(userId, query, result, apiKey),
      })),
    };
  },
);

export const importBoardCardImage = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 45,
    memory: '512MiB',
    secrets: [googleCustomSearchApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to use a searched card image.');
    }
    const boardId = optionalBoardCardImageIdentifier(request.data?.boardId);
    if (boardId) {
      await assertCanEditBoardImages(userId, boardId);
    }
    const query = stringOrEmpty(request.data?.query).replace(/\s+/g, ' ').trim().slice(0, 180);
    const result = boardCardImageSearchResultFromInput(request.data?.result);
    const token = stringOrEmpty(request.data?.token);
    const apiKey = googleCustomSearchApiKey.value();
    if (!query || !result || !token || !boardCardImageSearchTokenMatches(userId, query, result, token, apiKey)) {
      throw new HttpsError('permission-denied', 'That image selection could not be verified. Search again and retry.');
    }

    let image: { buffer: Buffer; contentType: string } | null = null;
    for (const candidate of [result.imageUrl, result.thumbnailUrl].filter(Boolean)) {
      try {
        image = await fetchBoardCardImageAsset(candidate);
        break;
      } catch (error) {
        logger.warn('Board card selected image candidate failed.', {
          boardId,
          candidate,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (!image) {
      throw new HttpsError('unavailable', 'That image could not be downloaded. Choose another result.');
    }
    return {
      imageDataUrl: `data:${image.contentType};base64,${image.buffer.toString('base64')}`,
      sourceUrl: result.sourceUrl,
      title: result.title,
    };
  },
);

type VisitInvitationRecord = {
  id: string;
  plan_id: string;
  token: string;
  recipient_email: string | null;
  channel: 'email' | 'text' | 'copy';
  status: 'pending' | 'accepted' | 'declined';
  guest_name: string;
};

function visitPlanIdentifier(value: unknown, field: string): string {
  const identifier = stringOrEmpty(value).slice(0, 160);
  if (!/^[A-Za-z0-9_-]{4,160}$/.test(identifier)) {
    throw new HttpsError('invalid-argument', `${field} is invalid.`);
  }
  return identifier;
}

async function visitPlanBoardAndCard(
  boardId: string,
  cardId: string,
  userId: string,
): Promise<{ board: Record<string, unknown>; card: Record<string, unknown> }> {
  const snapshot = await db.collection('boards').doc(boardId).get();
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Board not found.');
  }
  const board: Record<string, unknown> = { id: snapshot.id, ...(snapshot.data() ?? {}) };
  if (board.visibility !== 'public' && board.owner_user_id !== userId) {
    throw new HttpsError('permission-denied', 'You do not have access to this board.');
  }
  const card = boardCardById(board.cards, cardId);
  if (!card) {
    throw new HttpsError('not-found', 'Place card not found.');
  }
  if (!isVisitableBoardCard(card)) {
    throw new HttpsError('failed-precondition', 'Let’s go is available only for cards with a verified place location.');
  }
  return { board, card };
}

async function visitPlanOrganizer(
  userId: string,
  authToken: Record<string, unknown>,
): Promise<{ name: string; email: string }> {
  const userSnapshot = await db.collection('users').doc(userId).get();
  const user = userSnapshot.data() as Record<string, unknown> | undefined;
  const email = normalizeUserEmail(user?.email ?? authToken.email);
  if (!isValidEmail(email)) {
    throw new HttpsError('failed-precondition', 'Add a valid email address to receive plan confirmations.');
  }
  return {
    name: displayNameForUser(user, email, 'A LivingWiki member'),
    email,
  };
}

function visitPlanRecord(snapshot: VisitPlanSnapshot, startMs: number, nowMs: number) {
  return {
    id: snapshot.id,
    organizer_name: snapshot.organizerName,
    organizer_email: snapshot.organizerEmail,
    board_id: snapshot.boardId,
    board_title: snapshot.boardTitle,
    card_id: snapshot.cardId,
    place_name: snapshot.placeName,
    place_address: snapshot.placeAddress,
    image_url: snapshot.imageUrl,
    google_maps_url: snapshot.googleMapsUrl,
    location_lat: snapshot.locationLat,
    location_lng: snapshot.locationLng,
    what3words_address: snapshot.what3wordsAddress,
    starts_at_iso: snapshot.startsAtIso,
    starts_at_ms: startMs,
    timezone: snapshot.timezone,
    status: snapshot.status,
    reminder_at_ms: visitReminderAtMs(startMs, nowMs),
    reminder_claimed_at_ms: null,
    reminder_sent_at_iso: '',
    reminder_error: '',
    updated_at_iso: new Date(nowMs).toISOString(),
    server_updated_at: FieldValue.serverTimestamp(),
  };
}

function visitInterestDocumentId(boardId: string, cardId: string, email: string): string {
  return `vpi_${createHash('sha256')
    .update(`${boardId}\n${cardId}\n${email.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 48)}`;
}

function cleanVisitGuestName(value: unknown, fallback: string): string {
  return stringOrEmpty(value)
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
    .slice(0, 80)
    || fallback;
}

async function visitParticipant(
  request: CallableRequest<Record<string, unknown>>,
): Promise<{ email: string; name: string; userId: string }> {
  const userId = request.auth?.uid ?? '';
  let profile: Record<string, unknown> | undefined;
  if (userId) {
    profile = (await db.collection('users').doc(userId).get()).data() as Record<string, unknown> | undefined;
  }
  const email = normalizeUserEmail(profile?.email ?? request.auth?.token?.email ?? request.data?.email);
  if (!isValidEmail(email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address so we can keep you updated.');
  }
  return {
    email,
    name: cleanVisitGuestName(
      profile?.displayName ?? request.auth?.token?.name ?? request.data?.guestName,
      email.split('@')[0] || 'A guest',
    ),
    userId,
  };
}

async function notifyVisitInterests(
  plan: VisitPlanSnapshot,
  alreadyInvitedEmails = new Set<string>(),
): Promise<{ notified: number; failed: number }> {
  const snapshot = await db.collection('visit_plan_interests')
    .where('card_id', '==', plan.cardId)
    .limit(100)
    .get();
  const interests = snapshot.docs.filter((document) => {
    const data = document.data();
    return data.board_id === plan.boardId
      && data.status === 'interested'
      && isValidEmail(normalizeUserEmail(data.email))
      && normalizeUserEmail(data.email) !== plan.organizerEmail;
  });
  const alreadyInvited = interests.filter((document) =>
    alreadyInvitedEmails.has(normalizeUserEmail(document.data().email)));
  await Promise.all(alreadyInvited.map((document) => document.ref.set({
    status: 'invited',
    plan_id: plan.id,
    invited_at_iso: new Date().toISOString(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true })));
  const results = await Promise.all(interests
    .filter((document) => !alreadyInvitedEmails.has(normalizeUserEmail(document.data().email)))
    .map(async (document) => {
    const email = normalizeUserEmail(document.data().email);
    const result = await sendVisitInvitation(plan, email);
    if (result.sent) {
      await document.ref.set({
        status: 'invited',
        plan_id: plan.id,
        invited_at_iso: new Date().toISOString(),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
      return result.sent;
    }));
  return {
    notified: results.filter(Boolean).length,
    failed: results.filter((sent) => !sent).length,
  };
}

async function sendVisitTransactionalEmail(
  recipientEmail: string,
  email: VisitPlanEmail,
): Promise<void> {
  const apiKey = sendgridApiKey.value();
  if (!apiKey) {
    throw new Error('SendGrid API key is not configured.');
  }
  sgMail.setApiKey(apiKey);
  await sgMail.send({
    to: recipientEmail,
    from: {
      email: inviteSenderEmail,
      name: 'LivingWiki',
    },
    subject: email.subject,
    text: email.text,
    html: email.html,
    trackingSettings: {
      clickTracking: {
        enable: false,
        enableText: false,
      },
    },
    ...(email.calendar ? { attachments: visitPlanEmailAttachments(email) } : {}),
  });
}

function visitEmailDeliveryError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return error instanceof Error ? error.message : 'Email delivery failed.';
  }
  const response = (error as {
    response?: { body?: { errors?: Array<{ message?: unknown; field?: unknown }> } };
  }).response;
  const details = response?.body?.errors
    ?.map((item) => {
      const message = stringOrEmpty(item.message);
      const field = stringOrEmpty(item.field);
      return [field, message].filter(Boolean).join(': ');
    })
    .filter(Boolean)
    .join(' · ');
  return (details || (error instanceof Error ? error.message : 'Email delivery failed.')).slice(0, 500);
}

function visitInvitationUrl(token: string): string {
  return `${publicAppUrl}/go/${encodeURIComponent(token)}`;
}

async function ensureVisitInvitation(
  plan: VisitPlanSnapshot,
  recipientEmail: string | null,
  channel: VisitInvitationRecord['channel'],
): Promise<{ ref: DocumentReference; record: VisitInvitationRecord; url: string; created: boolean }> {
  const normalizedEmail = normalizeUserEmail(recipientEmail);
  const token = randomBytes(24).toString('base64url');
  const id = normalizedEmail
    ? visitEmailInvitationDocumentId(plan.id, normalizedEmail)
    : `vpi_${createHash('sha256').update(`${plan.id}\n${token}`).digest('hex').slice(0, 48)}`;
  const ref = db.collection('visit_plan_invitations').doc(id);
  const existing = await ref.get();
  const existingData = existing.data() as Partial<VisitInvitationRecord> | undefined;
  const resolvedToken = stringOrEmpty(existingData?.token) || token;
  const record: VisitInvitationRecord = {
    id,
    plan_id: plan.id,
    token: resolvedToken,
    recipient_email: normalizedEmail || null,
    channel,
    status: existingData?.status === 'accepted' || existingData?.status === 'declined'
      ? existingData.status
      : 'pending',
    guest_name: stringOrEmpty(existingData?.guest_name).slice(0, 80),
  };
  await ref.set({
    ...record,
    organizer_user_id: null,
    place_name: plan.placeName,
    sent_at_iso: new Date().toISOString(),
    delivery_error: '',
    created_at: existing.exists ? existing.data()?.created_at ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (!existing.exists) {
    await db.collection('visit_plans').doc(plan.id).set({
      invited_count: FieldValue.increment(1),
      pending_count: FieldValue.increment(1),
      server_updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return {
    ref,
    record,
    url: visitInvitationUrl(resolvedToken),
    created: !existing.exists,
  };
}

async function sendVisitInvitation(
  plan: VisitPlanSnapshot,
  recipientEmail: string,
  kind: 'invitation' | 'updated' = 'invitation',
): Promise<{ sent: boolean; url: string }> {
  const invitation = await ensureVisitInvitation(plan, recipientEmail, 'email');
  try {
    await sendVisitTransactionalEmail(
      recipientEmail,
      buildVisitInvitationEmail(plan, invitation.url, kind),
    );
    await invitation.ref.set({
      delivered_at_iso: new Date().toISOString(),
      delivery_error: '',
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { sent: true, url: invitation.url };
  } catch (error) {
    const deliveryError = visitEmailDeliveryError(error);
    await invitation.ref.set({
      delivery_error: deliveryError,
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    logger.warn('Visit invitation email failed.', {
      planId: plan.id,
      recipientEmail,
      errorMessage: deliveryError,
    });
    return { sent: false, url: invitation.url };
  }
}

async function visitPlanInvitations(planId: string): Promise<Array<{
  ref: DocumentReference;
  record: VisitInvitationRecord;
}>> {
  const snapshot = await db.collection('visit_plan_invitations')
    .where('plan_id', '==', planId)
    .limit(100)
    .get();
  return snapshot.docs.map((document) => ({
    ref: document.ref,
    record: document.data() as VisitInvitationRecord,
  }));
}

async function notifyExistingVisitInvitees(
  plan: VisitPlanSnapshot,
  kind: 'updated' | 'cancelled',
): Promise<void> {
  const invitations = await visitPlanInvitations(plan.id);
  await Promise.allSettled(invitations
    .filter(({ record }) => record.status !== 'declined' && isValidEmail(normalizeUserEmail(record.recipient_email)))
    .map(async ({ ref, record }) => {
      const recipientEmail = normalizeUserEmail(record.recipient_email);
      const url = visitInvitationUrl(record.token);
      const email = kind === 'updated'
        ? buildVisitInvitationEmail(plan, url, 'updated')
        : buildVisitPlanEmail({ ...plan, status: 'cancelled' }, 'cancelled');
      await sendVisitTransactionalEmail(recipientEmail, email);
      await ref.set({
        last_update_sent_at_iso: new Date().toISOString(),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    }));
}

export const createVisitPlan = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
    secrets: [sendgridApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid ?? '';
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to make a Let’s go plan.');
    }
    const boardId = visitPlanIdentifier(request.data?.boardId, 'boardId');
    const cardId = visitPlanIdentifier(request.data?.cardId, 'cardId');
    const nowMs = Date.now();
    let start: { iso: string; ms: number };
    try {
      start = normalizeVisitStart(request.data?.startsAtIso, nowMs);
    } catch (error) {
      throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Choose a valid date and time.');
    }
    const timezone = normalizeVisitTimezone(request.data?.timezone);
    const [{ board, card }, organizer] = await Promise.all([
      visitPlanBoardAndCard(boardId, cardId, userId),
      visitPlanOrganizer(userId, (request.auth?.token ?? {}) as Record<string, unknown>),
    ]);
    const planId = visitPlanDocumentId(userId, boardId, cardId);
    const ref = db.collection('visit_plans').doc(planId);
    const previous = await ref.get();
    const previousData = previous.data() as Record<string, unknown> | undefined;
    const previousStart = stringOrEmpty(previousData?.starts_at_iso);
    const previousTimezone = normalizeVisitTimezone(previousData?.timezone);
    const openToBoard = board.visibility === 'public' && request.data?.openToBoard !== false;
    const snapshot = visitPlanSnapshot(planId, board, card, organizer, start, timezone);
    await ref.set({
      ...visitPlanRecord(snapshot, start.ms, nowMs),
      organizer_user_id: userId,
      open_to_board: openToBoard,
      created_at_iso: stringOrEmpty(previousData?.created_at_iso) || new Date(nowMs).toISOString(),
      invited_count: previous.exists ? Math.max(0, Number(previousData?.invited_count) || 0) : 0,
      accepted_count: previous.exists ? Math.max(0, Number(previousData?.accepted_count) || 0) : 0,
      pending_count: previous.exists ? Math.max(0, Number(previousData?.pending_count) || 0) : 0,
    }, { merge: true });

    let confirmationEmailSent = false;
    try {
      await sendVisitTransactionalEmail(
        organizer.email,
        buildVisitPlanEmail(snapshot, previous.exists ? 'updated' : 'confirmation'),
      );
      confirmationEmailSent = true;
      await ref.set({
        confirmation_sent_at_iso: new Date().toISOString(),
        confirmation_error: '',
      }, { merge: true });
    } catch (error) {
      const deliveryError = visitEmailDeliveryError(error);
      await ref.set({
        confirmation_error: deliveryError,
      }, { merge: true });
      logger.warn('Visit plan confirmation email failed; plan remains saved.', {
        planId,
        errorMessage: deliveryError,
      });
    }

    if (
      previous.exists
      && previousStart
      && (previousStart !== start.iso || previousTimezone !== timezone)
    ) {
      await notifyExistingVisitInvitees(snapshot, 'updated');
    }
    const inviteEmails = normalizeVisitPlanEmails(request.data?.inviteEmails)
      .filter((email) => email !== organizer.email);
    const invitationResults = await Promise.all(inviteEmails.map((email) => sendVisitInvitation(snapshot, email)));
    const interestResults = openToBoard && board.owner_user_id === userId
      ? await notifyVisitInterests(snapshot, new Set(inviteEmails))
      : { notified: 0, failed: 0 };
    const saved = await ref.get();
    return {
      plan: serializeVisitPlan(saved.data() ?? {}),
      confirmationEmailSent,
      invitationsSent: invitationResults.filter((result) => result.sent).length,
      invitationsFailed: invitationResults.filter((result) => !result.sent).length,
      interestsNotified: interestResults.notified,
      interestsFailed: interestResults.failed,
    };
  },
);

export const getOpenVisitPlans = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const boardId = visitPlanIdentifier(request.data?.boardId, 'boardId');
    const cardId = visitPlanIdentifier(request.data?.cardId, 'cardId');
    await visitPlanBoardAndCard(boardId, cardId, request.auth?.uid ?? '');
    const nowMs = Date.now() - 5 * 60 * 1000;
    const [plansSnapshot, interestsSnapshot] = await Promise.all([
      db.collection('visit_plans').where('card_id', '==', cardId).limit(100).get(),
      db.collection('visit_plan_interests').where('card_id', '==', cardId).limit(100).get(),
    ]);
    const plans = plansSnapshot.docs
      .map((document) => document.data() as Record<string, unknown>)
      .filter((data) =>
        data.board_id === boardId
        && data.status === 'planned'
        && data.open_to_board === true
        && Number(data.starts_at_ms) >= nowMs)
      .map((data) => {
        const plan = serializeVisitPlan(data);
        return {
          ...plan,
          invitedCount: plan.acceptedCount,
          pendingCount: 0,
        };
      })
      .sort((left, right) => left.startsAtIso.localeCompare(right.startsAtIso));
    const interestCount = interestsSnapshot.docs.filter((document) => {
      const data = document.data();
      return data.board_id === boardId && data.status === 'interested';
    }).length;
    return { plans, interestCount };
  },
);

export const expressVisitInterest = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 45,
    memory: '256MiB',
    cors: true,
    secrets: [sendgridApiKey],
  },
  async (request) => {
    const boardId = visitPlanIdentifier(request.data?.boardId, 'boardId');
    const cardId = visitPlanIdentifier(request.data?.cardId, 'cardId');
    const [{ board, card }, participant] = await Promise.all([
      visitPlanBoardAndCard(boardId, cardId, request.auth?.uid ?? ''),
      visitParticipant(request),
    ]);
    const ownerUserId = stringOrEmpty(board.owner_user_id);
    if (participant.userId && participant.userId === ownerUserId) {
      throw new HttpsError('failed-precondition', 'Choose a time to open this plan to the board.');
    }
    const ref = db.collection('visit_plan_interests')
      .doc(visitInterestDocumentId(boardId, cardId, participant.email));
    const existing = await ref.get();
    const boardTitle = stringOrEmpty(board.title).slice(0, 120) || 'LivingWiki board';
    const placeName = stringOrEmpty(card.title).slice(0, 160) || 'this place';
    const boardUrl = `${publicAppUrl}/boards/${encodeURIComponent(boardId)}?view=stack`;
    await ref.set({
      id: ref.id,
      board_id: boardId,
      card_id: cardId,
      owner_user_id: ownerUserId,
      email: participant.email,
      name: participant.name,
      user_id: participant.userId || null,
      board_title: boardTitle,
      place_name: placeName,
      status: 'interested',
      created_at: existing.exists ? existing.data()?.created_at ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    let organizerNotified = existing.exists;
    let acknowledgementSent = false;
    if (!existing.exists) {
      const ownerProfile = ownerUserId
        ? (await db.collection('users').doc(ownerUserId).get()).data() as Record<string, unknown> | undefined
        : undefined;
      const ownerEmail = normalizeUserEmail(ownerProfile?.email);
      const ownerName = displayNameForUser(ownerProfile, ownerEmail, 'Board organizer');
      const results = await Promise.allSettled([
        ...(isValidEmail(ownerEmail)
          ? [sendVisitTransactionalEmail(ownerEmail, buildVisitInterestOwnerEmail({
              organizerName: ownerName,
              interestedName: participant.name,
              placeName,
              boardTitle,
              boardUrl,
            }))]
          : []),
        sendVisitTransactionalEmail(participant.email, buildVisitInterestAcknowledgementEmail({
          interestedName: participant.name,
          placeName,
          boardTitle,
          boardUrl,
        })),
      ]);
      organizerNotified = isValidEmail(ownerEmail) && results[0]?.status === 'fulfilled';
      acknowledgementSent = results.at(-1)?.status === 'fulfilled';
    }
    return { saved: true, alreadySaved: existing.exists, organizerNotified, acknowledgementSent };
  },
);

export const joinOpenVisitPlan = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 45,
    memory: '256MiB',
    cors: true,
    secrets: [sendgridApiKey],
  },
  async (request) => {
    const planId = visitPlanIdentifier(request.data?.planId, 'planId');
    const [planDocument, participant] = await Promise.all([
      db.collection('visit_plans').doc(planId).get(),
      visitParticipant(request),
    ]);
    const planData = planDocument.data() as Record<string, unknown> | undefined;
    if (
      !planDocument.exists
      || planData?.status !== 'planned'
      || planData.open_to_board !== true
    ) {
      throw new HttpsError('not-found', 'This open plan is no longer available.');
    }
    const plan = snapshotFromVisitPlanRecord(planData);
    await visitPlanBoardAndCard(plan.boardId, plan.cardId, participant.userId);
    if (participant.email === plan.organizerEmail) {
      throw new HttpsError('failed-precondition', 'You are already organizing this plan.');
    }
    const invitation = await ensureVisitInvitation(plan, participant.email, 'email');
    let changed = false;
    await db.runTransaction(async (transaction) => {
      const [freshInvitation, freshPlan] = await Promise.all([
        transaction.get(invitation.ref),
        transaction.get(planDocument.ref),
      ]);
      if (!freshInvitation.exists || !freshPlan.exists || freshPlan.data()?.status !== 'planned') {
        throw new HttpsError('not-found', 'This open plan is no longer available.');
      }
      const currentStatus = freshInvitation.data()?.status;
      changed = currentStatus !== 'accepted';
      if (!changed) {
        return;
      }
      transaction.set(invitation.ref, {
        status: 'accepted',
        guest_name: participant.name,
        user_id: participant.userId || null,
        responded_at_iso: new Date().toISOString(),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(planDocument.ref, {
        accepted_count: FieldValue.increment(1),
        pending_count: FieldValue.increment(currentStatus === 'pending' ? -1 : 0),
        last_response_at_iso: new Date().toISOString(),
        server_updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    let emailSent = false;
    if (changed) {
      const results = await Promise.allSettled([
        sendVisitTransactionalEmail(participant.email, buildVisitJoinedEmail(plan, invitation.url)),
        sendVisitTransactionalEmail(plan.organizerEmail, buildVisitResponseEmail(plan, participant.name, 'accepted')),
      ]);
      emailSent = results[0]?.status === 'fulfilled';
    }
    const saved = await planDocument.ref.get();
    return {
      joined: true,
      alreadyJoined: !changed,
      emailSent,
      manageUrl: invitation.url,
      plan: {
        ...serializeVisitPlan(saved.data() ?? {}),
        invitedCount: Math.max(0, Number(saved.data()?.accepted_count) || 0),
        pendingCount: 0,
      },
    };
  },
);

export const getMyVisitPlans = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const userId = request.auth?.uid ?? '';
    if (!userId) {
      return { plans: [] };
    }
    const boardId = visitPlanIdentifier(request.data?.boardId, 'boardId');
    const cardIds = (Array.isArray(request.data?.cardIds) ? request.data.cardIds : [])
      .map((cardId: unknown) => visitPlanIdentifier(cardId, 'cardId'))
      .slice(0, 200);
    if (!cardIds.length) {
      return { plans: [] };
    }
    const snapshots = await db.getAll(
      ...cardIds.map((cardId: string) =>
        db.collection('visit_plans').doc(visitPlanDocumentId(userId, boardId, cardId))),
    );
    return {
      plans: snapshots
        .filter((snapshot) => snapshot.exists && snapshot.data()?.organizer_user_id === userId)
        .map((snapshot) => serializeVisitPlan(snapshot.data() ?? {}))
        .filter((plan) => plan.status === 'planned'),
    };
  },
);

export const getVisitPlanAttendees = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const userId = request.auth?.uid ?? '';
    const planId = visitPlanIdentifier(request.data?.planId, 'planId');
    const planDocument = await db.collection('visit_plans').doc(planId).get();
    const planData = planDocument.data() as Record<string, unknown> | undefined;
    const isOrganizer = !!userId && planData?.organizer_user_id === userId;
    const isOpen = planData?.status === 'planned' && planData.open_to_board === true;
    if (!planDocument.exists || (!isOrganizer && !isOpen)) {
      throw new HttpsError('not-found', 'Visit plan not found.');
    }
    if (!isOrganizer) {
      await visitPlanBoardAndCard(
        stringOrEmpty(planData.board_id),
        stringOrEmpty(planData.card_id),
        userId,
      );
    }
    const organizerName = stringOrEmpty(planData.organizer_name).slice(0, 120) || 'You';
    const invitations = await visitPlanInvitations(planId);
    const guests = invitations
      .map(({ record }) => {
        const status = record.status === 'accepted'
          ? 'going' as const
          : isOrganizer && record.status === 'pending'
            ? 'pending' as const
            : null;
        if (!status) {
          return null;
        }
        const recipientEmail = normalizeUserEmail(record.recipient_email);
        const fallbackName = record.channel === 'text'
          ? 'Text invitation'
          : record.channel === 'copy'
            ? 'Shared invitation'
            : 'Invited guest';
        return {
          id: stringOrEmpty(record.id),
          name: stringOrEmpty(record.guest_name).slice(0, 80)
            || (isOrganizer ? recipientEmail : '')
            || fallbackName,
          role: 'guest' as const,
          status,
        };
      })
      .filter((attendee): attendee is NonNullable<typeof attendee> => !!attendee)
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'going' ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });
    return {
      attendees: [
        {
          id: `organizer_${planId}`,
          name: organizerName,
          role: 'organizer' as const,
          status: 'going' as const,
        },
        ...guests,
      ],
    };
  },
);

export const inviteToVisitPlan = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 45,
    memory: '256MiB',
    cors: true,
    secrets: [sendgridApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid ?? '';
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to invite someone.');
    }
    const planId = visitPlanIdentifier(request.data?.planId, 'planId');
    const ref = db.collection('visit_plans').doc(planId);
    const planDocument = await ref.get();
    if (!planDocument.exists || planDocument.data()?.organizer_user_id !== userId) {
      throw new HttpsError('not-found', 'Visit plan not found.');
    }
    const plan = snapshotFromVisitPlanRecord(planDocument.data() ?? {});
    if (plan.status !== 'planned') {
      throw new HttpsError('failed-precondition', 'This visit plan is no longer active.');
    }
    const recipientEmail = normalizeUserEmail(request.data?.email);
    if (recipientEmail) {
      if (!isValidEmail(recipientEmail)) {
        throw new HttpsError('invalid-argument', 'Enter a valid email address.');
      }
      if (recipientEmail === plan.organizerEmail) {
        throw new HttpsError('invalid-argument', 'You are already going.');
      }
      const result = await sendVisitInvitation(plan, recipientEmail);
      return { shareUrl: result.url, emailSent: result.sent };
    }
    const channel = request.data?.channel === 'copy' ? 'copy' : 'text';
    const invitation = await ensureVisitInvitation(plan, null, channel);
    return { shareUrl: invitation.url, emailSent: false };
  },
);

export const cancelVisitPlan = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
    secrets: [sendgridApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid ?? '';
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to cancel this plan.');
    }
    const planId = visitPlanIdentifier(request.data?.planId, 'planId');
    const ref = db.collection('visit_plans').doc(planId);
    const document = await ref.get();
    if (!document.exists || document.data()?.organizer_user_id !== userId) {
      throw new HttpsError('not-found', 'Visit plan not found.');
    }
    const plan = { ...snapshotFromVisitPlanRecord(document.data() ?? {}), status: 'cancelled' as const };
    await ref.set({
      status: 'cancelled',
      reminder_at_ms: null,
      reminder_claimed_at_ms: null,
      cancelled_at_iso: new Date().toISOString(),
      updated_at_iso: new Date().toISOString(),
      server_updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    await Promise.allSettled([
      sendVisitTransactionalEmail(plan.organizerEmail, buildVisitPlanEmail(plan, 'cancelled')),
      notifyExistingVisitInvitees(plan, 'cancelled'),
    ]);
    return { cancelled: true };
  },
);

function visitInvitationTokenFromRequestPath(path: string): string {
  const token = path.split('/').filter(Boolean).at(-1) ?? '';
  return /^[A-Za-z0-9_-]{24,120}$/.test(token) ? token : '';
}

export const visitPlanGuest = onRequest(
  {
    region: callableRegion,
    timeoutSeconds: 45,
    memory: '256MiB',
    cors: false,
    secrets: [sendgridApiKey],
  },
  async (request, response) => {
    response.set('Cache-Control', 'no-store, private');
    response.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.set('Content-Security-Policy', "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const token = visitInvitationTokenFromRequestPath(request.path);
    if (!token) {
      response.status(404).send('Invitation not found.');
      return;
    }
    const invitationId = `vpi_${createHash('sha256').update(token).digest('hex').slice(0, 48)}`;
    let invitationDocument = await db.collection('visit_plan_invitations').doc(invitationId).get();
    if (!invitationDocument.exists) {
      const byToken = await db.collection('visit_plan_invitations').where('token', '==', token).limit(1).get();
      invitationDocument = byToken.docs[0] ?? invitationDocument;
    }
    if (!invitationDocument.exists) {
      response.status(404).send('Invitation not found.');
      return;
    }
    const invitationRef = invitationDocument.ref;
    const invitation = invitationDocument.data() as VisitInvitationRecord;
    const planRef = db.collection('visit_plans').doc(visitPlanIdentifier(invitation.plan_id, 'planId'));
    const planDocument = await planRef.get();
    if (!planDocument.exists) {
      response.status(404).send('Plan not found.');
      return;
    }
    let plan = snapshotFromVisitPlanRecord(planDocument.data() ?? {});
    let status: VisitInvitationRecord['status'] = invitation.status === 'accepted' || invitation.status === 'declined'
      ? invitation.status
      : 'pending';
    let guestName = stringOrEmpty(invitation.guest_name).slice(0, 80);

    if (request.method === 'POST' && plan.status === 'planned') {
      const requestedStatus = request.body?.response === 'accepted' || request.body?.response === 'declined'
        ? request.body.response as 'accepted' | 'declined'
        : '';
      guestName = stringOrEmpty(request.body?.guestName)
        .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
        .slice(0, 80);
      if (requestedStatus) {
        const previousStatus = status;
        await db.runTransaction(async (transaction) => {
          const [freshInvitation, freshPlan] = await Promise.all([
            transaction.get(invitationRef),
            transaction.get(planRef),
          ]);
          if (!freshInvitation.exists || !freshPlan.exists || freshPlan.data()?.status !== 'planned') {
            return;
          }
          const currentStatus = freshInvitation.data()?.status === 'accepted'
            || freshInvitation.data()?.status === 'declined'
            ? freshInvitation.data()?.status as 'accepted' | 'declined'
            : 'pending';
          const acceptedDelta = (requestedStatus === 'accepted' ? 1 : 0) - (currentStatus === 'accepted' ? 1 : 0);
          const pendingDelta = 0 - (currentStatus === 'pending' ? 1 : 0);
          transaction.set(invitationRef, {
            status: requestedStatus,
            guest_name: guestName,
            responded_at_iso: new Date().toISOString(),
            updated_at: FieldValue.serverTimestamp(),
          }, { merge: true });
          transaction.set(planRef, {
            accepted_count: FieldValue.increment(acceptedDelta),
            pending_count: FieldValue.increment(pendingDelta),
            last_response_at_iso: new Date().toISOString(),
            server_updated_at: FieldValue.serverTimestamp(),
          }, { merge: true });
        });
        status = requestedStatus;
        if (previousStatus !== requestedStatus) {
          const guestLabel = guestName
            || normalizeUserEmail(invitation.recipient_email)
            || 'A guest';
          await Promise.allSettled([
            sendVisitTransactionalEmail(
              plan.organizerEmail,
              buildVisitResponseEmail(plan, guestLabel, requestedStatus),
            ),
            ...(requestedStatus === 'accepted' && isValidEmail(normalizeUserEmail(invitation.recipient_email))
              ? [sendVisitTransactionalEmail(
                  normalizeUserEmail(invitation.recipient_email),
                  buildVisitPlanEmail(plan, 'confirmation'),
                )]
              : []),
          ]);
        }
      }
      const refreshedPlan = await planRef.get();
      plan = snapshotFromVisitPlanRecord(refreshedPlan.data() ?? {});
    }

    const invitationUrl = `${publicAppUrl}/go/${encodeURIComponent(token)}`;
    response.status(200).type('html').send(request.method === 'HEAD' ? undefined : buildVisitGuestPage({
      plan,
      invitationUrl,
      responseStatus: status,
      guestName,
    }));
  },
);

export const sendVisitPlanReminders = onSchedule(
  {
    region: callableRegion,
    schedule: 'every 5 minutes',
    timeZone: 'UTC',
    timeoutSeconds: 300,
    memory: '256MiB',
    secrets: [sendgridApiKey],
  },
  async () => {
    const nowMs = Date.now();
    const due = await db.collection('visit_plans')
      .where('reminder_at_ms', '<=', nowMs)
      .orderBy('reminder_at_ms', 'asc')
      .limit(100)
      .get();
    for (const document of due.docs) {
      const claimed = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(document.ref);
        const data = fresh.data() ?? {};
        const reminderAtMs = Number(data.reminder_at_ms);
        const claimedAtMs = Number(data.reminder_claimed_at_ms);
        if (
          data.status !== 'planned'
          || !Number.isFinite(reminderAtMs)
          || reminderAtMs > nowMs
          || (Number.isFinite(claimedAtMs) && claimedAtMs > nowMs - 15 * 60 * 1000)
        ) {
          return false;
        }
        transaction.set(document.ref, {
          reminder_claimed_at_ms: nowMs,
          reminder_error: '',
          server_updated_at: FieldValue.serverTimestamp(),
        }, { merge: true });
        return true;
      });
      if (!claimed) {
        continue;
      }
      const plan = snapshotFromVisitPlanRecord(document.data());
      try {
        const invitations = await visitPlanInvitations(plan.id);
        const recipients = new Set([
          plan.organizerEmail,
          ...invitations
            .filter(({ record }) => record.status === 'accepted')
            .map(({ record }) => normalizeUserEmail(record.recipient_email))
            .filter(isValidEmail),
        ]);
        const email = buildVisitPlanEmail(plan, 'reminder');
        await Promise.all([...recipients].map((recipient) => sendVisitTransactionalEmail(recipient, email)));
        await document.ref.set({
          reminder_at_ms: null,
          reminder_claimed_at_ms: null,
          reminder_sent_at_iso: new Date().toISOString(),
          reminder_recipient_count: recipients.size,
          reminder_error: '',
          server_updated_at: FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (error) {
        const deliveryError = visitEmailDeliveryError(error);
        await document.ref.set({
          reminder_claimed_at_ms: null,
          reminder_error: deliveryError,
          server_updated_at: FieldValue.serverTimestamp(),
        }, { merge: true });
        logger.warn('Visit plan reminder failed and will be retried.', {
          planId: plan.id,
          errorMessage: deliveryError,
        });
      }
    }
  },
);

type SpotifyConnectionRecord = {
  owner_user_id: string;
  account_id: string;
  spotify_user_id: string;
  display_name: string;
  profile_image_url: string;
  product: string;
  scopes: string[];
  access_token: string;
  access_token_expires_at_ms: number;
  refresh_token: string;
  refresh_expires_at_ms: number;
  status: 'connected' | 'reconnect';
  connected_at_iso: string;
  updated_at_iso: string;
  last_used_at_iso: string;
};

type SpotifyOAuthStateRecord = {
  owner_user_id: string;
  verifier: string;
  return_url: string;
  expires_at_ms: number;
  consumed_at_iso: string;
  created_at_iso: string;
};

type SpotifyOAuthTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
};

type SpotifyProfileResponse = {
  account_id?: unknown;
  id?: unknown;
  display_name?: unknown;
  product?: unknown;
  images?: unknown;
};

type SpotifyDeviceResponse = {
  devices?: unknown;
};

type SpotifyPlaybackLookup = {
  key: string;
  title: string;
  artist: string;
  context: string;
};

export const getSpotifyConnection = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 20 },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      return {
        configured: !!spotifyClientId,
        connected: false,
        needsReauthorization: false,
        canExportPlaylists: false,
      };
    }
    const snapshot = await db.collection('spotify_connections').doc(userId).get();
    const data = snapshot.exists ? snapshot.data() as Partial<SpotifyConnectionRecord> : null;
    const refreshExpiresAt = Number(data?.refresh_expires_at_ms ?? 0);
    const connected = data?.status === 'connected'
      && !!data.refresh_token
      && refreshExpiresAt > Date.now();
    const canExportPlaylists = connected && spotifyCanExportPlaylist(data?.scopes);
    return {
      configured: !!spotifyClientId,
      connected,
      needsReauthorization: !!data && (!connected || !canExportPlaylists),
      canExportPlaylists,
      account: data
        ? {
            accountId: data.account_id ?? '',
            displayName: data.display_name ?? 'Spotify listener',
            imageUrl: data.profile_image_url ?? '',
            product: data.product ?? '',
            connectedAt: data.connected_at_iso ?? '',
            refreshExpiresAt: refreshExpiresAt ? new Date(refreshExpiresAt).toISOString() : '',
          }
        : null,
    };
  },
);

export const createSpotifyConnectionUrl = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 20 },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to connect Spotify.');
    }
    if (!spotifyClientId) {
      throw new HttpsError('failed-precondition', 'Spotify is not configured for LivingWiki.');
    }

    const data = request.data && typeof request.data === 'object'
      ? request.data as Record<string, unknown>
      : {};
    const returnUrl = normalizeSpotifyReturnUrl(data.returnUrl);
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(64).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const now = Date.now();
    const stateRecord: SpotifyOAuthStateRecord = {
      owner_user_id: userId,
      verifier,
      return_url: returnUrl,
      expires_at_ms: now + spotifyOAuthStateTtlMs,
      consumed_at_iso: '',
      created_at_iso: new Date(now).toISOString(),
    };
    await db.collection('spotify_oauth_states').doc(spotifyOAuthStateId(state)).set(stateRecord);

    const url = new URL('https://accounts.spotify.com/authorize');
    url.searchParams.set('client_id', spotifyClientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', spotifyOAuthRedirectUri);
    url.searchParams.set('scope', spotifyOAuthScopes);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('state', state);
    return { authorizationUrl: url.toString() };
  },
);

export const spotifyOAuthCallback = onRequest(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async (request, response) => {
    const state = stringOrEmpty(request.query.state).slice(0, 200);
    const code = stringOrEmpty(request.query.code).slice(0, 2400);
    const authorizationError = stringOrEmpty(request.query.error).slice(0, 120);
    let returnUrl = `${publicAppUrl}/boards`;
    try {
      if (!state) {
        throw new Error('The Spotify connection could not be verified.');
      }
      const stateRef = db.collection('spotify_oauth_states').doc(spotifyOAuthStateId(state));
      const stateRecord = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(stateRef);
        if (!snapshot.exists) {
          throw new Error('This Spotify connection link is no longer valid.');
        }
        const data = snapshot.data() as SpotifyOAuthStateRecord;
        returnUrl = normalizeSpotifyReturnUrl(data.return_url);
        if (data.consumed_at_iso || data.expires_at_ms <= Date.now()) {
          throw new Error('This Spotify connection link has expired.');
        }
        transaction.update(stateRef, { consumed_at_iso: new Date().toISOString() });
        return data;
      });

      if (authorizationError) {
        throw new Error(authorizationError === 'access_denied'
          ? 'Spotify connection was cancelled.'
          : 'Spotify could not authorize this connection.');
      }
      if (!code) {
        throw new Error('Spotify returned no authorization code.');
      }

      const token = await exchangeSpotifyAuthorizationCode(code, stateRecord.verifier);
      const accessToken = stringOrEmpty(token.access_token);
      const refreshToken = stringOrEmpty(token.refresh_token);
      if (!accessToken || !refreshToken) {
        throw new Error('Spotify returned incomplete authorization credentials.');
      }
      const profile = await fetchSpotifyProfile(accessToken);
      const now = Date.now();
      const existing = await db.collection('spotify_connections').doc(stateRecord.owner_user_id).get();
      const connectedAt = existing.exists
        ? stringOrEmpty(existing.data()?.connected_at_iso) || new Date(now).toISOString()
        : new Date(now).toISOString();
      const record: SpotifyConnectionRecord = {
        owner_user_id: stateRecord.owner_user_id,
        account_id: stringOrEmpty(profile.account_id) || stringOrEmpty(profile.id),
        spotify_user_id: stringOrEmpty(profile.id),
        display_name: stringOrEmpty(profile.display_name).slice(0, 160) || 'Spotify listener',
        profile_image_url: spotifyProfileImage(profile),
        product: stringOrEmpty(profile.product).slice(0, 40),
        scopes: stringOrEmpty(token.scope).split(/\s+/).filter(Boolean),
        access_token: accessToken,
        access_token_expires_at_ms: now + spotifyTokenLifetimeMs(token.expires_in),
        refresh_token: refreshToken,
        refresh_expires_at_ms: now + spotifyRefreshLifetimeMs,
        status: 'connected',
        connected_at_iso: connectedAt,
        updated_at_iso: new Date(now).toISOString(),
        last_used_at_iso: '',
      };
      await db.collection('spotify_connections').doc(stateRecord.owner_user_id).set(record);
      response.redirect(302, spotifyReturnUrl(returnUrl, 'connected'));
    } catch (error) {
      logger.warn('Spotify OAuth callback failed.', {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      response.redirect(302, spotifyReturnUrl(
        returnUrl,
        'error',
        spotifyPublicErrorCode(error),
      ));
    }
  },
);

export const getSpotifyPlaybackToken = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 30 },
  async (request) => {
    const userId = requireCallableUserId(request.auth?.uid, 'Sign in to play with Spotify.');
    const token = await spotifyAccessTokenForUser(userId);
    return {
      accessToken: token.accessToken,
      expiresAt: new Date(token.expiresAtMs).toISOString(),
    };
  },
);

export const listSpotifyDevices = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 30 },
  async (request) => {
    const userId = requireCallableUserId(request.auth?.uid, 'Sign in to use Spotify devices.');
    const result = await spotifyApiRequestForUser(userId, '/v1/me/player/devices', { method: 'GET' });
    const payload = await result.json().catch(() => ({})) as SpotifyDeviceResponse;
    const devices = Array.isArray(payload.devices)
      ? payload.devices.map((value) => {
          const device = value && typeof value === 'object' ? value as Record<string, unknown> : {};
          return {
            id: stringOrEmpty(device.id).slice(0, 180),
            name: stringOrEmpty(device.name).slice(0, 120) || 'Spotify device',
            type: stringOrEmpty(device.type).slice(0, 60),
            isActive: device.is_active === true,
            isRestricted: device.is_restricted === true,
            volumePercent: Math.max(0, Math.min(100, Number(device.volume_percent) || 0)),
          };
        }).filter((device) => device.id && !device.isRestricted)
      : [];
    return { devices };
  },
);

export const resolveSpotifyPlaybackTracks = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
    const userId = requireCallableUserId(request.auth?.uid, 'Sign in to find songs on Spotify.');
    const data = request.data && typeof request.data === 'object'
      ? request.data as Record<string, unknown>
      : {};
    const requests: SpotifyPlaybackLookup[] = (Array.isArray(data.tracks) ? data.tracks : [])
      .slice(0, 100)
      .map((value, index) => {
        const track = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        return {
          key: stringOrEmpty(track.key).slice(0, 180) || String(index),
          title: stringOrEmpty(track.title).slice(0, 220),
          artist: stringOrEmpty(track.artist).slice(0, 220),
          context: stringOrEmpty(track.context).slice(0, 220),
        };
      })
      .filter((track) => track.title);
    if (!requests.length) {
      throw new HttpsError('invalid-argument', 'Choose at least one song to find.');
    }

    const tracks: Array<Record<string, unknown>> = [];
    for (let index = 0; index < requests.length; index += 5) {
      const batch = requests.slice(index, index + 5);
      const matches = await Promise.all(batch.map((track) => (
        resolveSpotifyPlaybackTrack(userId, track).catch(() => null)
      )));
      matches.forEach((match) => {
        if (match) {
          tracks.push(match);
        }
      });
    }
    return { tracks };
  },
);

export const exportSpotifyBoardPlaylist = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    const userId = requireCallableUserId(request.auth?.uid, 'Sign in to create a Spotify playlist.');
    const boardId = stringOrEmpty(request.data?.boardId).trim();
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(boardId)) {
      throw new HttpsError('invalid-argument', 'Choose a valid music board.');
    }
    const [boardSnapshot, connectionSnapshot] = await Promise.all([
      db.collection('boards').doc(boardId).get(),
      db.collection('spotify_connections').doc(userId).get(),
    ]);
    if (!boardSnapshot.exists) throw new HttpsError('not-found', 'This music board could not be found.');
    const board = boardSnapshot.data() as Record<string, unknown>;
    if (board.visibility !== 'public' && stringOrEmpty(board.owner_user_id) !== userId) {
      throw new HttpsError('permission-denied', 'You do not have access to this music board.');
    }
    const connection = connectionSnapshot.data() as SpotifyConnectionRecord | undefined;
    if (!connection || !spotifyCanExportPlaylist(connection.scopes)) {
      throw new HttpsError('failed-precondition', 'Reconnect Spotify and approve playlist access.');
    }

    const rawCards = Array.isArray(board.cards) ? board.cards.slice(0, 100) : [];
    const candidates = rawCards.map((value, index) => {
      const card = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      const title = stringOrEmpty(card.title).slice(0, 220);
      const tags = Array.isArray(card.tags) ? card.tags.map(stringOrEmpty) : [];
      const spotifyReference = [card.spotifyUri, card.spotifyTrackId, card.spotifyTrackUrl]
        .map(stringOrEmpty).join(' ');
      const directId = spotifyReference.match(/(?:spotify:track:|open\.spotify\.com\/track\/)?([A-Za-z0-9]{12,32})/)?.[1] ?? '';
      const looksLikeSong = !!directId
        || !!stringOrEmpty(card.audioPreviewUrl)
        || stringOrEmpty(card.mediaKind) === 'song'
        || tags.some((tag) => ['song', 'songs', 'music-track', 'spotify-track'].includes(tag.toLowerCase()));
      return {
        key: String(index),
        title,
        artist: stringOrEmpty(card.spotifyArtistName || card.subtitle).slice(0, 220),
        context: stringOrEmpty(board.title).slice(0, 220),
        directUri: directId ? `spotify:track:${directId}` : '',
        looksLikeSong,
      };
    }).filter((card) => card.looksLikeSong && card.title);
    if (!candidates.length) throw new HttpsError('failed-precondition', 'This board has no songs to export.');

    const resolved = new Map<string, string>();
    candidates.forEach((card) => { if (card.directUri) resolved.set(card.key, card.directUri); });
    const missing = candidates.filter((card) => !card.directUri);
    for (let index = 0; index < missing.length; index += 5) {
      const matches = await Promise.all(missing.slice(index, index + 5).map((card) => (
        resolveSpotifyPlaybackTrack(userId, card).catch(() => null)
      )));
      matches.forEach((match) => {
        const key = stringOrEmpty(match?.key);
        const uri = stringOrEmpty(match?.uri);
        if (key && isSpotifyTrackUri(uri)) resolved.set(key, uri);
      });
    }
    const uris = candidates.flatMap((card) => {
      const uri = resolved.get(card.key) ?? '';
      return uri ? [uri] : [];
    });
    const unmatchedTitles = candidates.filter((card) => !resolved.has(card.key)).map((card) => card.title);
    if (!uris.length) throw new HttpsError('not-found', 'Spotify could not match any songs from this board.');

    const contentHash = spotifyPlaylistContentHash(boardId, uris);
    const exportRef = db.collection('spotify_playlist_exports')
      .doc(createHash('sha256').update(`${userId}:${boardId}`).digest('hex'));
    const previousSnapshot = await exportRef.get();
    const previous = previousSnapshot.data() as Record<string, unknown> | undefined;
    const previousPlaylistId = stringOrEmpty(previous?.playlist_id);
    const previousPlaylistUrl = stringOrEmpty(previous?.playlist_url);
    if (previous?.content_hash === contentHash && previousPlaylistId && previousPlaylistUrl) {
      return {
        playlistId: previousPlaylistId,
        playlistUrl: previousPlaylistUrl,
        matchedCount: uris.length,
        totalCount: candidates.length,
        unmatchedTitles,
        reused: true,
      };
    }

    let playlistId = previousPlaylistId;
    let playlistUrl = previousPlaylistUrl;
    if (!playlistId) {
      const createResponse = await spotifyApiRequestForUser(userId, '/v1/me/playlists', {
        method: 'POST',
        body: JSON.stringify({
          name: spotifyPlaylistName(board.title),
          description: spotifyPlaylistDescription(boardId),
          public: false,
        }),
      }, 'playlist');
      const created = await createResponse.json().catch(() => ({})) as Record<string, unknown>;
      playlistId = stringOrEmpty(created.id);
      const externalUrls = created.external_urls && typeof created.external_urls === 'object'
        ? created.external_urls as Record<string, unknown> : {};
      playlistUrl = stringOrEmpty(externalUrls.spotify)
        || (playlistId ? `https://open.spotify.com/playlist/${encodeURIComponent(playlistId)}` : '');
      if (!playlistId || !playlistUrl) throw new HttpsError('unavailable', 'Spotify returned an incomplete playlist.');
    }

    await spotifyApiRequestForUser(userId, `/v1/playlists/${encodeURIComponent(playlistId)}/items`, {
      method: 'PUT',
      body: JSON.stringify({ uris }),
    }, 'playlist');
    await exportRef.set({
      owner_user_id: userId,
      board_id: boardId,
      playlist_id: playlistId,
      playlist_url: playlistUrl,
      content_hash: contentHash,
      matched_count: uris.length,
      total_count: candidates.length,
      unmatched_titles: unmatchedTitles,
      updated_at_iso: new Date().toISOString(),
      server_updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
      playlistId,
      playlistUrl,
      matchedCount: uris.length,
      totalCount: candidates.length,
      unmatchedTitles,
      reused: false,
    };
  },
);

export const controlSpotifyPlayback = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 30 },
  async (request) => {
    const userId = requireCallableUserId(request.auth?.uid, 'Sign in to control Spotify.');
    const data = request.data && typeof request.data === 'object'
      ? request.data as Record<string, unknown>
      : {};
    const action = stringOrEmpty(data.action);
    const deviceId = stringOrEmpty(data.deviceId).slice(0, 180);
    const deviceQuery = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';

    if (action === 'play') {
      const uris = Array.isArray(data.uris)
        ? data.uris.map((uri) => stringOrEmpty(uri)).filter(isSpotifyTrackUri).slice(0, 100)
        : [];
      if (!uris.length) {
        throw new HttpsError('invalid-argument', 'Choose a Spotify track to play.');
      }
      await spotifyApiRequestForUser(userId, `/v1/me/player/play${deviceQuery}`, {
        method: 'PUT',
        body: JSON.stringify({ uris }),
      });
      return { ok: true };
    }

    if (action === 'transfer') {
      if (!deviceId) {
        throw new HttpsError('invalid-argument', 'Choose a Spotify device.');
      }
      await spotifyApiRequestForUser(userId, '/v1/me/player', {
        method: 'PUT',
        body: JSON.stringify({ device_ids: [deviceId], play: true }),
      });
      return { ok: true };
    }

    if (action === 'seek') {
      const positionMs = Math.max(0, Math.min(24 * 60 * 60 * 1000, Number(data.positionMs) || 0));
      const separator = deviceQuery ? '&' : '?';
      await spotifyApiRequestForUser(
        userId,
        `/v1/me/player/seek${deviceQuery}${separator}position_ms=${Math.round(positionMs)}`,
        { method: 'PUT' },
      );
      return { ok: true };
    }

    const command: Record<string, { path: string; method: 'POST' | 'PUT' }> = {
      pause: { path: '/v1/me/player/pause', method: 'PUT' },
      resume: { path: '/v1/me/player/play', method: 'PUT' },
      next: { path: '/v1/me/player/next', method: 'POST' },
      previous: { path: '/v1/me/player/previous', method: 'POST' },
    };
    const selected = command[action];
    if (!selected) {
      throw new HttpsError('invalid-argument', 'That Spotify playback action is not supported.');
    }
    await spotifyApiRequestForUser(userId, `${selected.path}${deviceQuery}`, {
      method: selected.method,
    });
    return { ok: true };
  },
);

export const disconnectSpotify = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 20 },
  async (request) => {
    const userId = requireCallableUserId(request.auth?.uid, 'Sign in to disconnect Spotify.');
    await db.collection('spotify_connections').doc(userId).delete();
    return { disconnected: true };
  },
);

function requireCallableUserId(userId: string | undefined, message: string): string {
  if (!userId) {
    throw new HttpsError('unauthenticated', message);
  }
  return userId;
}

function normalizeSpotifyReturnUrl(value: unknown): string {
  const fallback = `${publicAppUrl}/boards`;
  const raw = stringOrEmpty(value) || fallback;
  try {
    const url = new URL(raw);
    if (!allowedCheckoutOrigins.has(url.origin)) {
      return fallback;
    }
    if (!/^\/(?:boards|songs)(?:\/|$)/.test(url.pathname)) {
      url.pathname = '/boards';
      url.search = '';
    }
    url.hash = '';
    url.searchParams.delete('spotify');
    url.searchParams.delete('spotify_error');
    return url.toString();
  } catch {
    return fallback;
  }
}

function spotifyOAuthStateId(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

function spotifyReturnUrl(returnUrl: string, status: 'connected' | 'error', errorCode = ''): string {
  const url = new URL(normalizeSpotifyReturnUrl(returnUrl));
  url.searchParams.set('spotify', status);
  if (errorCode) {
    url.searchParams.set('spotify_error', errorCode);
  }
  return url.toString();
}

function spotifyPublicErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('cancel')) return 'cancelled';
  if (message.includes('expired') || message.includes('no longer valid')) return 'expired';
  if (message.includes('redirect') || message.includes('client')) return 'configuration';
  if (message.includes('development mode') || message.includes('authorized user')) {
    return 'access_restricted';
  }
  return 'connection_failed';
}

function spotifyTokenLifetimeMs(value: unknown): number {
  const seconds = Number(value);
  return Math.max(60, Math.min(7200, Number.isFinite(seconds) ? seconds : 3600)) * 1000;
}

function spotifyProfileImage(profile: SpotifyProfileResponse): string {
  if (!Array.isArray(profile.images)) {
    return '';
  }
  for (const value of profile.images) {
    const image = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const url = stringOrEmpty(image.url);
    if (/^https:\/\/i\.scdn\.co\//i.test(url)) {
      return url.slice(0, 1000);
    }
  }
  return '';
}

async function exchangeSpotifyAuthorizationCode(
  code: string,
  verifier: string,
): Promise<SpotifyOAuthTokenResponse> {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: spotifyClientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: spotifyOAuthRedirectUri,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as SpotifyOAuthTokenResponse;
  if (!response.ok) {
    throw new Error(
      stringOrEmpty(payload.error_description)
      || stringOrEmpty(payload.error)
      || 'Spotify authorization failed.',
    );
  }
  return payload;
}

async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyProfileResponse> {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(
        'Spotify Development Mode denied this account. The app owner must have Premium and this Spotify account must be an authorized user.',
      );
    }
    throw new Error('Spotify account details could not be loaded.');
  }
  return response.json() as Promise<SpotifyProfileResponse>;
}

async function spotifyAccessTokenForUser(
  userId: string,
  forceRefresh = false,
): Promise<{ accessToken: string; expiresAtMs: number }> {
  const ref = db.collection('spotify_connections').doc(userId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new HttpsError('failed-precondition', 'Connect Spotify before playing a full song.');
  }
  const connection = snapshot.data() as SpotifyConnectionRecord;
  if (connection.status !== 'connected'
    || !connection.refresh_token
    || connection.refresh_expires_at_ms <= Date.now()) {
    await ref.set({
      status: 'reconnect',
      updated_at_iso: new Date().toISOString(),
    }, { merge: true });
    throw new HttpsError('failed-precondition', 'Reconnect Spotify to continue listening.');
  }
  if (!forceRefresh
    && connection.access_token
    && connection.access_token_expires_at_ms > Date.now() + 90_000) {
    return {
      accessToken: connection.access_token,
      expiresAtMs: connection.access_token_expires_at_ms,
    };
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: spotifyClientId,
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as SpotifyOAuthTokenResponse;
  const accessToken = stringOrEmpty(payload.access_token);
  if (!response.ok || !accessToken) {
    if (stringOrEmpty(payload.error) === 'invalid_grant') {
      await ref.set({
        status: 'reconnect',
        access_token: '',
        updated_at_iso: new Date().toISOString(),
      }, { merge: true });
      throw new HttpsError('failed-precondition', 'Reconnect Spotify to continue listening.');
    }
    throw new HttpsError('unavailable', 'Spotify could not refresh this connection. Try again.');
  }

  const expiresAtMs = Date.now() + spotifyTokenLifetimeMs(payload.expires_in);
  const nextRefreshToken = stringOrEmpty(payload.refresh_token) || connection.refresh_token;
  await ref.set({
    access_token: accessToken,
    access_token_expires_at_ms: expiresAtMs,
    refresh_token: nextRefreshToken,
    status: 'connected',
    updated_at_iso: new Date().toISOString(),
    last_used_at_iso: new Date().toISOString(),
  }, { merge: true });
  return { accessToken, expiresAtMs };
}

async function spotifyApiRequestForUser(
  userId: string,
  path: string,
  init: { method: 'GET' | 'POST' | 'PUT'; body?: string },
  context: 'playback' | 'playlist' = 'playback',
): Promise<Response> {
  const makeRequest = async (forceRefresh: boolean) => {
    const token = await spotifyAccessTokenForUser(userId, forceRefresh);
    return fetch(`https://api.spotify.com${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body,
      signal: AbortSignal.timeout(15_000),
    });
  };

  let response = await makeRequest(false);
  if (response.status === 401) {
    response = await makeRequest(true);
  }
  if (response.ok) {
    return response;
  }
  if (response.status === 403) {
    throw new HttpsError(
      'permission-denied',
      context === 'playlist'
        ? 'Spotify did not allow playlist changes. Reconnect and approve playlist access.'
        : 'Spotify Premium and playback permission are required for full songs.',
    );
  }
  if (response.status === 404) {
    throw new HttpsError(
      'failed-precondition',
      context === 'playlist'
        ? 'That Spotify playlist is no longer available. Disconnect and reconnect Spotify to create it again.'
        : 'No Spotify player is available. Open Spotify on a device or try this browser again.',
    );
  }
  if (response.status === 429) {
    throw new HttpsError('resource-exhausted', 'Spotify is busy. Wait a moment and try again.');
  }
  throw new HttpsError(
    'unavailable',
    context === 'playlist'
      ? 'Spotify playlist creation is temporarily unavailable.'
      : 'Spotify playback is temporarily unavailable.',
  );
}

function isSpotifyTrackUri(value: string): boolean {
  return /^spotify:track:[A-Za-z0-9]{12,32}$/.test(value);
}

async function resolveSpotifyPlaybackTrack(
  userId: string,
  lookup: SpotifyPlaybackLookup,
): Promise<Record<string, unknown> | null> {
  const query = [lookup.title, lookup.artist, lookup.context].filter(Boolean).join(' ');
  const path = `/v1/search?type=track&limit=5&q=${encodeURIComponent(query)}`;
  const response = await spotifyApiRequestForUser(userId, path, { method: 'GET' });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  const tracks = payload.tracks && typeof payload.tracks === 'object'
    ? payload.tracks as Record<string, unknown>
    : {};
  const items = Array.isArray(tracks.items) ? tracks.items : [];
  const first = items.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
  if (!first) {
    return null;
  }
  const id = stringOrEmpty(first.id);
  const uri = stringOrEmpty(first.uri);
  if (!id || !isSpotifyTrackUri(uri)) {
    return null;
  }
  const artists = Array.isArray(first.artists)
    ? first.artists
        .map((artist) => artist && typeof artist === 'object'
          ? stringOrEmpty((artist as Record<string, unknown>).name)
          : '')
        .filter(Boolean)
    : [];
  const album = first.album && typeof first.album === 'object'
    ? first.album as Record<string, unknown>
    : {};
  const albumImages = Array.isArray(album.images) ? album.images : [];
  const artwork = albumImages
    .map((image) => image && typeof image === 'object'
      ? stringOrEmpty((image as Record<string, unknown>).url)
      : '')
    .find((url) => /^https:\/\//i.test(url)) ?? '';
  return {
    key: lookup.key,
    uri,
    title: stringOrEmpty(first.name).slice(0, 220) || lookup.title,
    artist: artists.join(', ').slice(0, 300) || lookup.artist,
    album: stringOrEmpty(album.name).slice(0, 220),
    artworkUrl: artwork.slice(0, 1000),
    spotifyUrl: `https://open.spotify.com/track/${encodeURIComponent(id)}`,
  };
}

export const resolveBoardSongSpotify = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: [googleCustomSearchApiKey, spotifyClientSecret],
  },
  async (request) => {
    const data = (request.data ?? {}) as Record<string, unknown>;
    const boardTitle = stringOrEmpty(data.boardTitle).slice(0, 160);
    const rawCards: unknown[] = Array.isArray(data.cards) ? data.cards : [];
    const customSearchApiKey = googleCustomSearchApiKey.value();
    const cards = rawCards
      .map((card) => normalizeBoardWizardCurrentCard(card, 'note'))
      .filter((card): card is BoardWizardCurrentCard => !!card)
      .slice(0, 40);
    const results = await Promise.all(cards.map(async (card) => {
      const match = await findSpotifyTrackForBoardWizard(card, boardTitle, customSearchApiKey);
      const mediaCard = match
        ? {
            ...card,
            tags: Array.from(new Set([...card.tags, 'song', 'music', match.artistName.toLowerCase()].filter(Boolean))),
            image_query: [
              card.image_query,
              card.title,
              match.artistName,
              'song cover art',
            ].filter(Boolean).join(' '),
            spotifyTrackId: match.id,
            spotifyTrackUrl: match.trackUrl,
            spotifyUri: match.uri,
            spotifyArtistName: match.artistName,
            spotifyAlbumName: match.albumName,
            spotifyArtworkUrl: match.artworkUrl,
          }
        : card;
      const audioPreviewUrl = card.audioPreviewUrl || await findSongAudioPreviewForBoardWizard(
        mediaCard,
        [boardTitle, match?.artistName ?? '', match?.albumName ?? '', 'song preview'].filter(Boolean).join(' '),
      );
      return {
        title: card.title,
        audioPreviewUrl,
        spotifyTrackId: match?.id ?? '',
        spotifyTrackUrl: match?.trackUrl ?? '',
        spotifyUri: match?.uri ?? '',
        spotifyArtistName: match?.artistName ?? '',
        spotifyAlbumName: match?.albumName ?? '',
        spotifyArtworkUrl: match?.artworkUrl ?? '',
      };
    }));
    return { cards: results };
  },
);

async function enrichBoardWizardBatchWithPlaces(
  batch: GeneratedBoardWizardBatch,
  context: {
    userId: string;
    mode: BoardWizardMode;
    prompt: string;
    targetBoardTitle: string;
    defaultType: GeneratedBoardWizardCard['type'];
  },
): Promise<GeneratedBoardWizardBatch> {
  const apiKey = googlePlacesApiKey.value();
  const customSearchApiKey = googleCustomSearchApiKey.value();
  const searchContext = inferBoardWizardPlaceContext(context.prompt, context.targetBoardTitle || batch.board.title);
  const menuImageCache = new Map<string, Promise<string>>();
  const exactReferenceImages = await findBatchExactWikipediaImagesForBoardWizard(batch.cards, searchContext);
  // Reference boards can contain dozens of cards. Keep outbound enrichment
  // bounded so Wikimedia and the other providers do not receive one large burst.
  const enrichedCards = await mapWithConcurrency(
    batch.cards,
    5,
    async (card, index) => {
      if (isBoardWizardMenuActionCard(card)) {
        return card;
      }
      if (isBoardWizardProductCard(card)) {
        if (card.imageUrl) return card;
        const exactProductImage = await withBoardWizardTimeout(
          findBoardWizardVerifiedWebImage(card, searchContext, customSearchApiKey),
          5_000,
          '',
        );
        if (exactProductImage) {
          return { ...card, imageUrl: exactProductImage, imageSource: 'search' as const };
        }
        // The final repair pass owns the broader Wikipedia/Commons query
        // ladder. Keeping it out of this pass avoids performing the same
        // recovery work twice when exact web lookup is unavailable.
        return { ...card, imageSource: 'missing' as const };
      }
      const exactReferenceImage = exactReferenceImages.get(index);
      if (!card.imageUrl && exactReferenceImage) {
        card = { ...card, imageUrl: exactReferenceImage };
      }
      if (isBoardWizardMenuItemCard(card) && !card.imageUrl) {
        const itemImageUrl = await resolveBoardWizardMenuItemImage(card, searchContext, customSearchApiKey, menuImageCache);
        if (itemImageUrl) {
          return { ...card, imageUrl: itemImageUrl, imageSource: 'search' as const };
        }
        // Restaurant dishes are not Wikipedia entities or generic places. If exact page and
        // exact web-search images both fail, preserve an honest empty image.
        return card;
      }
      return enrichBoardWizardCard(card, searchContext, apiKey, customSearchApiKey);
    },
  );
  const repairedCards = await mapWithConcurrency(enrichedCards, 3, async (card) => {
    if (
      card.imageUrl
      || isBoardWizardMenuActionCard(card)
    ) return card;
    const startedAt = Date.now();
    let imageUrl = '';
    let provider = '';
    if (isBoardWizardProductCard(card)) {
      imageUrl = await withBoardWizardTimeout(
        findBoardWizardGroundedRecoveryImage(card, searchContext),
        8_000,
        '',
      );
      if (imageUrl) provider = 'grounded-product-recovery';
    } else if (isBoardWizardMenuItemCard(card)) {
      // The first pass already tried exact menu/restaurant imagery. Preserve
      // the empty card for the contextual generation layer below.
    } else if (isBoardWizardFictionalCharacter(card)) {
      imageUrl = await withBoardWizardTimeout(
        findBoardWizardVerifiedWebImage(card, searchContext, customSearchApiKey),
        5_000,
        '',
      );
      if (imageUrl) provider = 'verified-web';
    } else {
      imageUrl = await withBoardWizardTimeout(
        findCommonsReferenceImageForBoardWizard(card, searchContext),
        6_000,
        '',
      );
      provider = imageUrl ? 'wikimedia' : '';
      if (!imageUrl) {
        imageUrl = await withBoardWizardTimeout(
          findBoardWizardVerifiedWebImage(card, searchContext, customSearchApiKey),
          5_000,
          '',
        );
        if (imageUrl) provider = 'verified-web';
      }
      if (!imageUrl) {
        imageUrl = await withBoardWizardTimeout(
          findBoardWizardGroundedRecoveryImage(card, searchContext),
          8_000,
          '',
        );
        if (imageUrl) provider = 'contextual-grounded-recovery';
      }
    }
    logger.info('Board wizard final image repair completed.', {
      entity: boardWizardImageEntityName(card),
      resolved: !!imageUrl,
      provider,
      durationMs: Date.now() - startedAt,
    });
    return imageUrl
      ? { ...card, imageUrl, ...(isBoardWizardProductCard(card) ? { imageSource: 'search' as const } : {}) }
      : card;
  });
  const generatedCandidateIndexes = new Set(repairedCards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => !card.imageUrl && !isBoardWizardMenuActionCard(card))
    .slice(0, 20)
    .map(({ index }) => index));
  const completedCards = await mapWithConcurrency(repairedCards, 4, async (card, index) => {
    if (!generatedCandidateIndexes.has(index)) return card;
    const startedAt = Date.now();
    const imageUrl = await withBoardWizardTimeout(
      generateAndStoreBoardWizardContextualImage({
        userId: context.userId,
        card,
        cardIndex: index,
        boardTitle: batch.board.title,
        boardDescription: batch.board.description,
      }),
      45_000,
      '',
    );
    logger.info('Board wizard contextual image fallback completed.', {
      entity: boardWizardImageEntityName(card),
      resolved: !!imageUrl,
      durationMs: Date.now() - startedAt,
    });
    return imageUrl ? { ...card, imageUrl, imageSource: 'generated' as const } : card;
  });
  const resolvedImageCount = completedCards.filter((card) => !!card.imageUrl).length;
  const providerCounts = completedCards.reduce<Record<string, number>>((counts, card) => {
    if (!card.imageUrl) return counts;
    const provider = boardWizardImageProvider(card.imageUrl);
    counts[provider] = (counts[provider] ?? 0) + 1;
    return counts;
  }, {});
  logger.info('Board wizard image coverage completed.', {
    cardCount: completedCards.length,
    resolvedImageCount,
    coveragePercent: completedCards.length ? Math.round(resolvedImageCount / completedCards.length * 100) : 100,
    providerCounts,
    generatedFallbackCount: completedCards.filter((card) => card.imageSource === 'generated').length,
    missingEntities: completedCards.filter((card) => !card.imageUrl).map((card) => card.entity_name || card.title).slice(0, 30),
  });
  return { ...batch, cards: completedCards };
}

function isBoardWizardProductCard(card: GeneratedBoardWizardCard): boolean {
  return !!card.productUrl
    || card.entity_type === 'product'
    || card.image_intent === 'product'
    || (card.type === 'shop' && card.tags.some((tag) => /\bproduct|shopping|handbag|perfume|beauty\b/i.test(tag)));
}

async function findBoardWizardGroundedRecoveryImage(
  card: GeneratedBoardWizardCard,
  searchContext: string,
): Promise<string> {
  const queries = buildBoardWizardImageRecoveryQueries(card, searchContext).slice(0, 3);
  for (const query of queries) {
    try {
      const wikipediaImage = await withBoardWizardTimeout(
        findReferenceImageForBoardWizard(query),
        3_500,
        '',
      );
      if (wikipediaImage) return wikipediaImage;
      const commonsImage = await withBoardWizardTimeout(
        findCommonsReferenceImageForBoardWizard({ ...card, image_query: query }, searchContext),
        4_500,
        '',
      );
      if (commonsImage) return commonsImage;
    } catch (error) {
      logger.warn('Board wizard grounded image recovery query failed.', {
        entity: boardWizardImageEntityName(card),
        query,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return '';
}

async function generateAndStoreBoardWizardContextualImage(options: {
  userId: string;
  card: GeneratedBoardWizardCard;
  cardIndex: number;
  boardTitle: string;
  boardDescription: string;
}): Promise<string> {
  try {
    const prompt = buildBoardWizardContextualImagePrompt(
      options.card,
      options.boardTitle,
      options.boardDescription,
    );
    const generated = await generateBoardCardImageAsset(prompt);
    const bytes = Buffer.from(generated.base64, 'base64');
    if (bytes.length < 2_048 || bytes.length > 8 * 1024 * 1024) {
      throw new Error('Generated board image size was unsupported.');
    }
    const extension = imageExtensionForContentType(generated.mimeType) ?? 'png';
    const safeUserId = options.userId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 160) || 'user';
    const month = new Date().toISOString().slice(0, 7);
    const storagePath = [
      'users',
      safeUserId,
      'wizard-images',
      month,
      `${String(options.cardIndex + 1).padStart(2, '0')}-${slugPart(boardWizardImageEntityName(options.card))}-${randomUUID()}.${extension}`,
    ].join('/');
    const token = randomUUID();
    const bucket = storage.bucket();
    await bucket.file(storagePath).save(bytes, {
      resumable: false,
      metadata: {
        contentType: generated.mimeType,
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: {
          firebaseStorageDownloadTokens: token,
          livingWikiImageSource: 'generated-contextual-fallback',
          livingWikiImageModel: generated.model,
        },
      },
    });
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
  } catch (error) {
    logger.warn('Board wizard contextual image generation failed.', {
      entity: boardWizardImageEntityName(options.card),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return '';
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) {
    return [];
  }
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, Math.trunc(concurrency)), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function enrichBoardWizardBatchWithSongAudioPreviews(
  batch: GeneratedBoardWizardBatch,
  searchContext: string,
): Promise<GeneratedBoardWizardBatch> {
  const songIndexes = batch.cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => !card.audioPreviewUrl && boardWizardReferenceImageKind(card, searchContext) === 'song')
    .slice(0, 40);
  if (!songIndexes.length) {
    return batch;
  }
  const cards = [...batch.cards];
  for (const { card, index } of songIndexes) {
    const audioPreviewUrl = await findSongAudioPreviewForBoardWizard(card, searchContext);
    if (audioPreviewUrl) {
      cards[index] = { ...cards[index], audioPreviewUrl };
    }
  }
  return { ...batch, cards };
}

type GoogleRoutesComputeResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: {
      encodedPolyline?: string;
    };
  }>;
};

async function enrichBoardWizardTourBatchWithRoutes(
  batch: GeneratedBoardWizardBatch,
  wizardMode: 'walking-tour' | 'driving-tour',
  tourOptions: BoardWizardTourOptions,
): Promise<GeneratedBoardWizardBatch> {
  const tourMode: GeneratedBoardTourMode = wizardMode === 'driving-tour' ? 'driving' : 'walking';
  const sorted = [...batch.cards].sort((left, right) => (left.tour?.sequence ?? 0) - (right.tour?.sequence ?? 0));
  const routePolylineParts: string[] = [];
  let totalMeters = 0;
  let totalSeconds = 0;
  const cards = await Promise.all(
    batch.cards.map(async (card) => {
      if (!card.tour?.legToNext) {
        return card;
      }
      const next = sorted.find((item) => (item.tour?.sequence ?? 0) === (card.tour?.sequence ?? 0) + 1) ?? null;
      const computed = next ? await computeBoardWizardTourLeg(card, next, tourMode) : null;
      if (computed?.encodedPolyline) {
        routePolylineParts.push(computed.encodedPolyline);
      }
      if (computed?.meters) {
        totalMeters += computed.meters;
      } else {
        totalMeters += metersFromDistanceText(card.tour.legToNext.distanceText);
      }
      if (computed?.seconds) {
        totalSeconds += computed.seconds;
      } else {
        totalSeconds += secondsFromDurationText(card.tour.legToNext.durationText);
      }
      const leg: GeneratedBoardTourLeg = {
        distanceText: computed?.distanceText || card.tour.legToNext.distanceText,
        durationText: computed?.durationText || card.tour.legToNext.durationText,
        instruction: card.tour.legToNext.instruction || buildBoardWizardTourInstruction(card, next, tourMode),
        navScript: card.tour.legToNext.navScript || buildBoardWizardTourNavScript(card, next, tourMode, computed?.durationText || card.tour.legToNext.durationText, computed?.distanceText || card.tour.legToNext.distanceText),
        encodedPolyline: computed?.encodedPolyline || card.tour.legToNext.encodedPolyline,
      };
      return { ...card, tour: { ...card.tour, legToNext: leg } };
    }),
  );

  const fallbackDistance = sorted.reduce((sum, card) => sum + metersFromDistanceText(card.tour?.legToNext?.distanceText ?? ''), 0);
  const fallbackSeconds = sorted.reduce((sum, card) => sum + secondsFromDurationText(card.tour?.legToNext?.durationText ?? ''), 0);
  const meta: GeneratedBoardTourMeta = {
    mode: tourMode,
    totalDistanceText: formatMeters(totalMeters || fallbackDistance),
    totalDurationText: formatSeconds(totalSeconds || fallbackSeconds),
    routePolyline: routePolylineParts.join('|'),
    voiceStyle: tourOptions.voiceStyle,
    paceOrRouteStyle: tourOptions.paceOrRouteStyle,
    extras: tourOptions.extras,
    showWayfindersDefault: false,
  };
  return {
    board: {
      ...batch.board,
      kind: wizardMode,
      icon: batch.board.icon || (tourMode === 'driving' ? 'directions_car' : 'directions_walk'),
      tourMeta: {
        ...meta,
        totalDistanceText: batch.board.tourMeta?.totalDistanceText || meta.totalDistanceText,
        totalDurationText: batch.board.tourMeta?.totalDurationText || meta.totalDurationText,
      },
    },
    cards,
  };
}

type BoardTourRoutePoint = {
  title: string;
  tour?: {
    lat?: number | null;
    lng?: number | null;
  } | null;
};

async function computeBoardWizardTourLeg(
  from: BoardTourRoutePoint,
  to: BoardTourRoutePoint,
  mode: GeneratedBoardTourMode,
): Promise<{ distanceText: string; durationText: string; encodedPolyline: string; meters: number; seconds: number } | null> {
  const apiKey = googlePlacesApiKey.value();
  const fromLat = from.tour?.lat;
  const fromLng = from.tour?.lng;
  const toLat = to.tour?.lat;
  const toLng = to.tour?.lng;
  if (!apiKey || typeof fromLat !== 'number' || typeof fromLng !== 'number' || typeof toLat !== 'number' || typeof toLng !== 'number') {
    return null;
  }
  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: fromLat, longitude: fromLng } } },
        destination: { location: { latLng: { latitude: toLat, longitude: toLng } } },
        travelMode: mode === 'driving' ? 'DRIVE' : 'WALK',
        routingPreference: mode === 'driving' ? 'TRAFFIC_UNAWARE' : undefined,
        polylineQuality: 'OVERVIEW',
      }),
    });
    if (!response.ok) {
      logger.warn('Board wizard Routes API failed.', { status: response.status, from: from.title, to: to.title });
      return null;
    }
    const data = await response.json() as GoogleRoutesComputeResponse;
    const route = data.routes?.[0];
    const meters = typeof route?.distanceMeters === 'number' ? route.distanceMeters : 0;
    const seconds = secondsFromGoogleDuration(route?.duration);
    if (!meters && !seconds) {
      return null;
    }
    return {
      distanceText: formatMeters(meters),
      durationText: formatSeconds(seconds),
      encodedPolyline: textFromUnknown(route?.polyline?.encodedPolyline),
      meters,
      seconds,
    };
  } catch (error) {
    logger.warn('Board wizard route leg enrichment failed.', {
      from: from.title,
      to: to.title,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function buildBoardWizardTourInstruction(from: BoardTourRoutePoint, to: BoardTourRoutePoint | null, mode: GeneratedBoardTourMode): string {
  return to ? `${mode === 'driving' ? 'Drive' : 'Walk'} from ${from.title} to ${to.title}.` : '';
}

function buildBoardWizardTourNavScript(from: BoardTourRoutePoint, to: BoardTourRoutePoint | null, mode: GeneratedBoardTourMode, duration: string, distance: string): string {
  return to ? `From ${from.title}, ${mode === 'driving' ? 'drive' : 'walk'} about ${duration || 'a short distance'}, roughly ${distance || 'nearby'}, to your next stop: ${to.title}.` : '';
}

function secondsFromGoogleDuration(value: unknown): number {
  const text = textFromUnknown(value);
  const seconds = Number.parseInt(text.replace(/s$/, ''), 10);
  return Number.isFinite(seconds) ? seconds : 0;
}

function metersFromDistanceText(text: string): number {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return /\bft\b/i.test(text) ? value * 0.3048 : value * 1609.344;
}

function secondsFromDurationText(text: string): number {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return /\bhr|hour/i.test(text) ? value * 3600 : value * 60;
}

function formatMeters(meters: number): string {
  if (!meters) {
    return '';
  }
  if (meters < 305) {
    return `${Math.round(meters / 0.3048)} ft`;
  }
  const miles = meters / 1609.344;
  return `${miles.toFixed(miles >= 10 ? 0 : 1)} mi`;
}

function formatSeconds(seconds: number): string {
  if (!seconds) {
    return '';
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 90) {
    return `${minutes} min`;
  }
  const hours = minutes / 60;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)} hr`;
}

type StoredTourCard = Record<string, unknown> & {
  id: string;
  title: string;
  tour: Record<string, unknown>;
};

function storedCardId(value: unknown): string {
  return value && typeof value === 'object'
    ? textFromUnknown((value as Record<string, unknown>).id).slice(0, 160)
    : '';
}

function storedTourCard(value: unknown): StoredTourCard | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const card = value as Record<string, unknown>;
  const id = textFromUnknown(card.id).slice(0, 160);
  const title = textFromUnknown(card.title).slice(0, 180);
  const tour = card.tour && typeof card.tour === 'object'
    ? card.tour as Record<string, unknown>
    : null;
  return id && title && tour ? { ...card, id, title, tour } : null;
}

function storedTourRoutePoint(card: StoredTourCard): BoardTourRoutePoint {
  const lat = typeof card.tour.lat === 'number' && Number.isFinite(card.tour.lat) ? card.tour.lat : null;
  const lng = typeof card.tour.lng === 'number' && Number.isFinite(card.tour.lng) ? card.tour.lng : null;
  return { title: card.title, tour: { lat, lng } };
}

function normalizedTourRouteText(value: unknown): string {
  return textFromUnknown(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function existingTourLegTargetsCard(value: unknown, nextCard: StoredTourCard): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const leg = value as Record<string, unknown>;
  const toCardId = textFromUnknown(leg.toCardId);
  if (toCardId) {
    return toCardId === nextCard.id;
  }
  const nextTitle = normalizedTourRouteText(nextCard.title);
  const routeText = normalizedTourRouteText(`${textFromUnknown(leg.instruction)} ${textFromUnknown(leg.navScript)}`);
  return nextTitle.length >= 4 && routeText.includes(nextTitle);
}

export const recalculateBoardTourRoute = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 90,
    memory: '512MiB',
    secrets: [googlePlacesApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid ?? '';
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Sign in to edit a tour.');
    }
    const boardId = textFromUnknown(request.data?.boardId).slice(0, 160);
    const baseUpdatedAt = textFromUnknown(request.data?.baseUpdatedAt).slice(0, 80);
    const addedCard = storedTourCard(request.data?.addedCard);
    const deletedCardId = textFromUnknown(request.data?.deletedCardId).slice(0, 160);
    const deletedCardIds = Array.from(new Set([
      deletedCardId,
      ...(Array.isArray(request.data?.deletedCardIds)
        ? request.data.deletedCardIds.map((value: unknown) => textFromUnknown(value).slice(0, 160))
        : []),
    ].filter(Boolean))).slice(0, 100);
    const orderedCardIds: string[] = Array.isArray(request.data?.orderedCardIds)
      ? request.data.orderedCardIds
        .map((value: unknown) => textFromUnknown(value).slice(0, 160))
        .filter(Boolean)
        .slice(0, 100)
      : [];
    if (
      !boardId
      || new Set(orderedCardIds).size !== orderedCardIds.length
      || (addedCard && deletedCardIds.length)
      || (!orderedCardIds.length && !deletedCardIds.length)
    ) {
      throw new HttpsError('invalid-argument', 'Provide every tour stop once, in the desired order.');
    }

    const boardRef = db.collection('boards').doc(boardId);
    const snapshot = await boardRef.get();
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'This tour no longer exists.');
    }
    const board = snapshot.data() as Record<string, unknown>;
    if (textFromUnknown(board.owner_user_id) !== userId) {
      throw new HttpsError('permission-denied', 'Only the board owner can edit this tour.');
    }
    const kind = textFromUnknown(board.kind);
    if (kind !== 'walking-tour' && kind !== 'driving-tour') {
      throw new HttpsError('failed-precondition', 'This board is not a walking or driving tour.');
    }
    const storedUpdatedAt = textFromUnknown(board.updated_at_iso);
    if (baseUpdatedAt && storedUpdatedAt && baseUpdatedAt !== storedUpdatedAt) {
      throw new HttpsError('failed-precondition', 'This tour changed elsewhere. Reload it and try again.');
    }

    const rawCards: unknown[] = Array.isArray(board.cards) ? board.cards : [];
    const storedIds = new Set(rawCards.map(storedCardId).filter(Boolean));
    if (addedCard && storedIds.has(addedCard.id)) {
      throw new HttpsError('already-exists', 'That tour stop already exists.');
    }
    if (deletedCardIds.some((id) => !storedIds.has(id))) {
      throw new HttpsError('failed-precondition', 'That tour stop was already removed.');
    }
    const deletedIds = new Set(deletedCardIds);
    const mutatedRawCards = deletedIds.size
      ? rawCards.filter((card) => {
          const id = storedCardId(card);
          return !id || !deletedIds.has(id);
        })
      : addedCard
        ? [...rawCards, addedCard]
        : rawCards;
    const currentTourCards = mutatedRawCards
      .map(storedTourCard)
      .filter((card): card is StoredTourCard => !!card);
    const currentIds = new Set(currentTourCards.map((card) => card.id));
    if (currentIds.size !== orderedCardIds.length || orderedCardIds.some((id) => !currentIds.has(id))) {
      throw new HttpsError('failed-precondition', 'The tour stops changed. Reload the board and try again.');
    }
    const cardById = new Map(currentTourCards.map((card) => [card.id, card]));
    const orderedCards: StoredTourCard[] = orderedCardIds
      .map((id) => cardById.get(id))
      .filter((card): card is StoredTourCard => !!card);
    const mode: GeneratedBoardTourMode = kind === 'driving-tour' ? 'driving' : 'walking';

    const updatedTourCards = await mapWithConcurrency(orderedCards, 4, async (card, index) => {
      const nextCard = orderedCards[index + 1] ?? null;
      const tour = { ...card.tour, sequence: index + 1 };
      if (!nextCard) {
        return { ...card, tour: { ...tour, legToNext: null } };
      }

      const currentLeg = card.tour.legToNext;
      if (existingTourLegTargetsCard(currentLeg, nextCard)) {
        return {
          ...card,
          tour: {
            ...tour,
            legToNext: {
              ...(currentLeg as Record<string, unknown>),
              toCardId: nextCard.id,
            },
          },
        };
      }

      const fromPoint = storedTourRoutePoint(card);
      const toPoint = storedTourRoutePoint(nextCard);
      const computed = await computeBoardWizardTourLeg(fromPoint, toPoint, mode);
      const distanceText = computed?.distanceText ?? '';
      const durationText = computed?.durationText ?? '';
      return {
        ...card,
        tour: {
          ...tour,
          legToNext: {
            distanceText,
            durationText,
            instruction: buildBoardWizardTourInstruction(fromPoint, toPoint, mode),
            navScript: buildBoardWizardTourNavScript(fromPoint, toPoint, mode, durationText, distanceText),
            encodedPolyline: computed?.encodedPolyline ?? '',
            toCardId: nextCard.id,
          },
        },
      };
    });

    let tourIndex = 0;
    const updatedCards = mutatedRawCards.map((card) => storedTourCard(card)
      ? updatedTourCards[tourIndex++] ?? card
      : card);
    const routeLegs: Record<string, unknown>[] = updatedTourCards.flatMap((card) => {
      const leg = card.tour.legToNext;
      return leg && typeof leg === 'object' ? [leg as Record<string, unknown>] : [];
    });
    const totalMeters = routeLegs.reduce(
      (total, leg) => total + metersFromDistanceText(textFromUnknown(leg.distanceText)),
      0,
    );
    const totalSeconds = routeLegs.reduce(
      (total, leg) => total + secondsFromDurationText(textFromUnknown(leg.durationText)),
      0,
    );
    const existingMeta = board.tourMeta && typeof board.tourMeta === 'object'
      ? board.tourMeta as Record<string, unknown>
      : {};
    const tourMeta = {
      ...existingMeta,
      mode,
      totalDistanceText: formatMeters(totalMeters),
      totalDurationText: formatSeconds(totalSeconds),
      routePolyline: routeLegs.map((leg) => textFromUnknown(leg.encodedPolyline)).filter(Boolean).join('|').slice(0, 4000),
    };
    const updatedAt = new Date().toISOString();

    await db.runTransaction(async (transaction) => {
      const latestSnapshot = await transaction.get(boardRef);
      const latest = latestSnapshot.data() as Record<string, unknown> | undefined;
      if (!latestSnapshot.exists || !latest || textFromUnknown(latest.owner_user_id) !== userId) {
        throw new HttpsError('failed-precondition', 'This tour is no longer available to edit.');
      }
      const latestUpdatedAt = textFromUnknown(latest.updated_at_iso);
      if (storedUpdatedAt && latestUpdatedAt !== storedUpdatedAt) {
        throw new HttpsError('failed-precondition', 'This tour changed while the route was updating. Try again.');
      }
      transaction.update(boardRef, {
        cards: updatedCards,
        tourMeta,
        updated_at_iso: updatedAt,
        server_updated_at: FieldValue.serverTimestamp(),
      });
    });

    return { cards: updatedCards, tourMeta, updatedAt };
  },
);

async function buildBoardWizardImageOnlyBatch(
  options: {
    currentCard: BoardWizardCurrentCard;
    prompt: string;
    targetBoardTitle: string;
    defaultType: GeneratedBoardWizardCard['type'];
  },
): Promise<GeneratedBoardWizardBatch> {
  const card: GeneratedBoardWizardCard = {
    title: options.currentCard.title,
    subtitle: options.currentCard.subtitle,
    notes: options.currentCard.notes,
    type: options.currentCard.type,
    scope: options.currentCard.scope,
    status: options.currentCard.status,
    rating: options.currentCard.rating,
    tags: options.currentCard.tags,
    image_query: buildBoardWizardCardImageQuery(options.currentCard, options.prompt, options.targetBoardTitle),
    place_query: options.currentCard.place_query || options.targetBoardTitle || options.currentCard.title,
    entity_name: options.currentCard.entity_name,
    entity_type: options.currentCard.entity_type,
    image_intent: options.currentCard.image_intent,
    image_context: options.currentCard.image_context,
    media_kind: options.currentCard.media_kind,
    short_summary: options.currentCard.short_summary,
    rank: options.currentCard.rank,
    audioPreviewUrl: options.currentCard.audioPreviewUrl,
    spotifyTrackId: options.currentCard.spotifyTrackId,
    spotifyTrackUrl: options.currentCard.spotifyTrackUrl,
    spotifyUri: options.currentCard.spotifyUri,
    spotifyArtistName: options.currentCard.spotifyArtistName,
    spotifyAlbumName: options.currentCard.spotifyAlbumName,
    spotifyArtworkUrl: options.currentCard.spotifyArtworkUrl,
    placeId: options.currentCard.placeId,
    googleMapsUrl: options.currentCard.googleMapsUrl,
    locationLat: options.currentCard.locationLat,
    locationLng: options.currentCard.locationLng,
  };
  const customSearchApiKey = googleCustomSearchApiKey.value();
  const apiKey = googlePlacesApiKey.value();
  const referenceKind = boardWizardReferenceImageKind(card, `${options.prompt} ${options.targetBoardTitle}`);
  let imageUrl = '';
  let placeEnrichment: GeneratedBoardWizardCard | null = null;

  if (isBoardWizardMenuItemCard(card)) {
    imageUrl = await resolveBoardWizardMenuItemImage(card, options.targetBoardTitle, customSearchApiKey, new Map());
  }
  if (!imageUrl && (card.type === 'food' || /food|dish|dessert|cake|menu-item/i.test(`${card.title} ${card.tags.join(' ')}`))) {
    imageUrl = await findBoardWizardMenuItemWebImage(card.image_query, customSearchApiKey, card.title);
  }
  if (!imageUrl && card.type !== 'food' && shouldResolveBoardWizardCardAsPlace(card) && apiKey) {
    placeEnrichment = await enrichBoardWizardCardWithPlace(card, options.targetBoardTitle, apiKey);
    imageUrl = placeEnrichment.imageUrl || '';
  }
  let audioPreviewUrl = card.audioPreviewUrl || '';
  let spotifyTrack: SpotifyTrackMatch | null = null;
  if (!imageUrl && (referenceKind === 'song' || referenceKind === 'album')) {
    spotifyTrack = await findSpotifyTrackForBoardWizard(card, options.targetBoardTitle, customSearchApiKey);
    const musicMedia = await findAppleMusicMediaForBoardWizard(card, options.targetBoardTitle, referenceKind);
    imageUrl = musicMedia.imageUrl;
    audioPreviewUrl = musicMedia.audioPreviewUrl || audioPreviewUrl;
    if (referenceKind === 'song' && !audioPreviewUrl) {
      audioPreviewUrl = await findDeezerAudioPreviewForBoardWizard(card, options.targetBoardTitle);
    }
  }
  if (!imageUrl && referenceKind && referenceKind !== 'person') {
    imageUrl = await findReferenceImageForBoardWizard(card.image_query);
  }
  if (!imageUrl) {
    imageUrl = await findCommonsReferenceImageForBoardWizard(card, options.targetBoardTitle);
  }
  if (!imageUrl && card.type !== 'food') {
    imageUrl = await findReferenceImageForBoardWizard(card.image_query);
  }

  return {
    board: {
      title: options.targetBoardTitle || 'Card image',
      description: 'Single-card image replacement.',
      icon: 'image_search',
      tone: 'teal',
    },
    cards: [{
      ...card,
      tags: placeEnrichment?.tags ?? card.tags,
      place_query: placeEnrichment?.place_query ?? card.place_query,
      placeId: placeEnrichment?.placeId ?? card.placeId,
      googleMapsUrl: placeEnrichment?.googleMapsUrl ?? card.googleMapsUrl,
      ...spotifyFieldsForBoardWizardCard(spotifyTrack),
      imageUrl: imageUrl || undefined,
      audioPreviewUrl: audioPreviewUrl || undefined,
    }],
  };
}

function buildBoardWizardCardImageQuery(card: BoardWizardCurrentCard, prompt: string, boardTitle: string): string {
  const title = card.title.replace(/\s+/g, ' ').trim();
  const referenceKind = boardWizardReferenceImageKind(card, `${prompt} ${boardTitle}`);
  if (referenceKind) {
    return buildBoardWizardMediaImageQuery(title, card, `${prompt} ${boardTitle}`, referenceKind).slice(0, 180);
  }
  const instruction = prompt.replace(/\b(replace|current|image|photo|picture|appropriate|better|wrong|random|fix|with|as|name|suggests)\b/gi, ' ');
  const usefulInstruction = meaningfulBoardWizardTokens(instruction).slice(0, 5).join(' ');
  const foodSuffix = card.type === 'food' || /food|dish|dessert|cake|menu-item/i.test(`${title} ${card.tags.join(' ')}`)
    ? 'food photo'
    : 'photo';
  return [title, usefulInstruction, boardTitle, foodSuffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

async function enrichCommerceProductDetails(
  extraction: CommercePageExtraction,
): Promise<CommercePageExtraction> {
  const sourceHost = safeCommerceHostname(extraction.finalUrl || extraction.sourceUrl);
  if (!sourceHost) return extraction;
  const missingProducts = extraction.products
    .map((product, index) => ({ product, index }))
    .filter(({ product }) => !product.imageUrl && !!product.productUrl)
    .filter(({ product }) => safeCommerceHostname(product.productUrl) === sourceHost)
    .slice(0, 12);
  if (!missingProducts.length) return extraction;

  const enriched = await mapWithConcurrency(missingProducts, 3, async ({ product, index }) => {
    try {
      const fetched = await fetchHtmlWithFallback(product.productUrl, {
        timeoutMs: 8_000,
        allowBrowserFallback: false,
      });
      if (
        fetched.status <= 0 ||
        fetched.status >= 400 ||
        looksLikeAntiBotChallenge(fetched.html)
      ) {
        return { index, product };
      }
      const detail = extractCommercePage(
        product.productUrl,
        fetched.finalUrl || product.productUrl,
        fetched.html,
      );
      return { index, product: mergeCommerceProductDetail(product, detail) };
    } catch {
      return { index, product };
    }
  });
  const products = [...extraction.products];
  for (const result of enriched) products[result.index] = result.product;
  return { ...extraction, products };
}

function safeCommerceHostname(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.hostname.toLowerCase() : '';
  } catch {
    return '';
  }
}

function buildBoardWizardSourceReport(
  batch: GeneratedBoardWizardBatch,
  options: {
    sourceUrl: string;
    sourceBlocked: boolean;
    method: GeneratedBoardWizardSourceReport['method'];
    manifest?: BoardWizardSourceManifest | null;
  },
): GeneratedBoardWizardSourceReport {
  const productCards = batch.cards.filter((card) => !!card.productUrl);
  const exactImageCount = productCards.filter((card) =>
    !!card.imageUrl && (card.imageSource === 'source-page' || card.imageSource === 'product-page'),
  ).length;
  const missingImageCount = productCards.filter((card) => !card.imageUrl).length;
  const extractedItemCount = options.manifest?.items.length ?? 0;
  const normalizedCardTitles = new Set(batch.cards.map((card) => normalizeBoardWizardSourceTitle(card.title)));
  const matchedCardCount = options.manifest?.items.filter((item) =>
    normalizedCardTitles.has(normalizeBoardWizardSourceTitle(item.title)),
  ).length ?? 0;
  const sourceImageCount = options.manifest?.items.filter((item) => !!item.imageUrl).length ?? exactImageCount;
  const recovered = options.method !== 'page' || options.sourceBlocked;
  const deterministicSourceCards = batch.cards.filter((card) =>
    !!card.productUrl
    || card.tags.some((tag) => ['menu-item', 'lodging'].includes(tag.toLowerCase())),
  );
  const manifestExact = !!options.manifest
    && boardWizardSourceManifestIsExact(options.manifest)
    && matchedCardCount === extractedItemCount
    && options.manifest.expectedCount === extractedItemCount;
  const status: GeneratedBoardWizardSourceReport['status'] = options.manifest
    ? manifestExact ? (recovered ? 'recovered' : 'exact') : 'partial'
    : recovered
      ? productCards.length > 0 && missingImageCount === 0 ? 'recovered' : 'partial'
      : deterministicSourceCards.length > 0 ? 'exact' : 'partial';
  const message = options.manifest
    ? `${matchedCardCount} of ${extractedItemCount} source item${extractedItemCount === 1 ? '' : 's'} matched in the generated preview${sourceImageCount ? `; ${sourceImageCount} source image${sourceImageCount === 1 ? '' : 's'} recovered` : ''}.`
    : options.method === 'grounded-search'
    ? productCards.length
      ? `${productCards.length} product${productCards.length === 1 ? '' : 's'} verified from the public indexed representation because the publisher blocked direct extraction.`
      : 'The publisher blocked direct extraction. Public search evidence was used, so review every card before saving.'
    : options.method === 'reader'
      ? `${productCards.length || batch.cards.length} item${(productCards.length || batch.cards.length) === 1 ? '' : 's'} recovered from the page’s public Reader representation.`
      : deterministicSourceCards.length > 0
        ? `${deterministicSourceCards.length} structured source item${deterministicSourceCards.length === 1 ? '' : 's'} extracted directly from the page.`
        : `${batch.cards.length} card${batch.cards.length === 1 ? '' : 's'} generated from readable source text. The page did not expose a reliable structured item list, so review the names before saving.`;
  return {
    status,
    method: options.method,
    sourceHost: safeCommerceHostname(options.sourceUrl).replace(/^www\./, ''),
    sourceBlocked: options.sourceBlocked,
    productCount: productCards.length,
    exactImageCount,
    missingImageCount,
    extractedItemCount,
    matchedCardCount,
    sourceImageCount,
    confidence: options.manifest?.confidence ?? (status === 'exact' ? 1 : status === 'recovered' ? 0.8 : 0.5),
    snapshotDate: new Date().toISOString().slice(0, 10),
    message,
  };
}

function normalizeBoardWizardSourceTitle(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildCommerceWizardBatch(options: {
  extraction: CommercePageExtraction;
  targetBoardTitle: string;
  requestedCount: number | null;
}): GeneratedBoardWizardBatch {
  const extraction = options.extraction;
  const cardLimit = options.requestedCount
    ? Math.max(1, Math.min(100, options.requestedCount))
    : 100;
  const extractedAt = new Date().toISOString();
  const merchant =
    extraction.brand ||
    extraction.siteName ||
    safeCommerceHostname(extraction.finalUrl).replace(/^www\./, '');
  const products = extraction.products.slice(0, cardLimit);
  const cards = products.map((product, index): GeneratedBoardWizardCard => {
    const subtitle = [product.category, product.price].filter(Boolean).join(' · ') || merchant || 'Product';
    const brandTag = merchant.toLowerCase().replace(/\s+/g, '-').slice(0, 24);
    const categoryTag = product.category.toLowerCase().replace(/\s+/g, '-').slice(0, 24);
    return {
      title: product.name.slice(0, 80),
      subtitle: subtitle.slice(0, 120),
      notes: (
        product.description ||
        `Featured by ${merchant || 'the merchant'} on the imported page. Review current details on the original product page.`
      ).slice(0, 3600),
      type: 'shop',
      scope: 'place',
      status: index < 4 ? 'favorite' : 'saved',
      rating: index < 4 ? 5 : 4,
      tags: mergeBoardWizardTags(
        ['product', 'shopping'],
        [brandTag, categoryTag, product.availability.toLowerCase()],
      ),
      image_query: [merchant, product.name, product.category, 'product'].filter(Boolean).join(' ').slice(0, 120),
      place_query: product.productUrl || extraction.sourceUrl,
      entity_name: product.name.slice(0, 100),
      entity_type: 'product',
      image_intent: 'product',
      image_context: [merchant, product.category, product.sku].filter(Boolean).join(' · ').slice(0, 120),
      media_kind: 'none',
      short_summary: (product.description || subtitle).slice(0, 160),
      rank: product.position || index + 1,
      imageUrl: product.imageUrl || undefined,
      sourceUrl: extraction.sourceUrl,
      productUrl: product.productUrl || extraction.sourceUrl,
      merchant: merchant.slice(0, 120),
      price: product.price.slice(0, 80),
      currency: product.currency.slice(0, 12),
      sku: product.sku.slice(0, 100),
      availability: product.availability.slice(0, 100),
      productCategory: product.category.slice(0, 100),
      imageSource: product.imageUrl ? product.imageSource : 'missing',
      extractionConfidence: product.confidence,
      extractedAt,
    };
  });
  const imageCount = cards.filter((card) => !!card.imageUrl).length;
  const title = (
    options.targetBoardTitle ||
    commerceBoardTitle(extraction, merchant)
  ).slice(0, 90);
  return {
    board: {
      title,
      description: [
        `${cards.length} product${cards.length === 1 ? '' : 's'} imported from ${merchant || 'a shopping page'}.`,
        `${imageCount} exact source image${imageCount === 1 ? '' : 's'} matched before fallback enrichment.`,
        `Snapshot captured ${extractedAt.slice(0, 10)}.`,
      ].join(' '),
      icon: 'shopping_bag',
      tone: 'purple',
    },
    cards,
  };
}

function commerceBoardTitle(extraction: CommercePageExtraction, merchant: string): string {
  const pageTitle = extraction.pageTitle
    .replace(/\s*[|–—-]\s*(?:official|home|homepage|shop).*$/i, '')
    .trim();
  if (pageTitle && pageTitle.length <= 72 && !/^home(?:page)?$/i.test(pageTitle)) return pageTitle;
  return merchant ? `${merchant} Products` : 'Imported Products';
}

function markCommerceImageFallbacks(batch: GeneratedBoardWizardBatch): GeneratedBoardWizardBatch {
  return {
    ...batch,
    cards: batch.cards.map((card) => {
      if (!card.productUrl) return card;
      if (card.imageSource === 'source-page' || card.imageSource === 'product-page') return card;
      return {
        ...card,
        imageSource: card.imageUrl ? 'search' : 'missing',
      };
    }),
  };
}

function shapeBoardWizardResearchFallbackBatch(
  batch: GeneratedBoardWizardBatch,
  sourceUrl: string,
): GeneratedBoardWizardBatch {
  const productCards = batch.cards.filter((card) =>
    card.entity_type === 'product'
    || card.image_intent === 'product'
    || card.tags.some((tag) => /\bproduct|shopping|handbag|perfume|beauty\b/i.test(tag)),
  );
  if (!productCards.length) return batch;
  const merchant = safeCommerceHostname(sourceUrl).replace(/^www\./, '');
  const extractedAt = new Date().toISOString();
  const verifiedCards = productCards.flatMap((card): GeneratedBoardWizardCard[] => {
    const researchedProductUrl = verifiedBoardWizardResearchProductUrl(card, sourceUrl);
    if (!researchedProductUrl) return [];
    const exactOfficialImage = verifiedBoardWizardResearchProductImage(card.imageUrl, sourceUrl);
    return [{
      ...card,
      type: 'shop',
      scope: 'place',
      entity_type: 'product',
      image_intent: 'product',
      image_query: [merchant, card.entity_name || card.title, card.image_context, 'official product']
        .filter(Boolean)
        .join(' ')
        .slice(0, 120),
      place_query: researchedProductUrl,
      sourceUrl,
      productUrl: researchedProductUrl,
      merchant,
      imageUrl: exactOfficialImage || undefined,
      imageSource: exactOfficialImage ? 'product-page' : 'missing',
      extractionConfidence: exactOfficialImage ? 0.82 : 0.72,
      extractedAt,
    }];
  });
  if (!verifiedCards.length) {
    throw new HttpsError(
      'unavailable',
      'The publisher blocked this shopping page, and no exact official product links could be verified from its public indexed representation. Try again later or use a more specific collection URL.',
    );
  }
  return {
    board: {
      ...batch.board,
      icon: 'shopping_bag',
      description: `${verifiedCards.length} product${verifiedCards.length === 1 ? '' : 's'} recovered from the public indexed representation of ${merchant}. The publisher blocked direct extraction; every card includes a verified official product link, while unavailable images remain visibly blank.`.slice(0, 500),
    },
    cards: verifiedCards,
  };
}

function verifiedBoardWizardResearchProductUrl(
  card: GeneratedBoardWizardCard,
  sourceUrl: string,
): string {
  const candidates = [card.productUrl, card.place_query]
    .map((value) => safeBoardCardSourceUrl(value))
    .filter(Boolean);
  for (const candidate of candidates) {
    if (!sameBoardWizardMerchant(candidate, sourceUrl)) continue;
    if (!/\/(?:products?|p|dp|item|sku)\/|\/[^/?#]*-nvprod\d+|[?&](?:product|sku|pid|item)=/i.test(candidate)) {
      continue;
    }
    return candidate;
  }
  return '';
}

function verifiedBoardWizardResearchProductImage(
  value: string | undefined,
  sourceUrl: string,
): string {
  const imageUrl = safeBoardCardSourceUrl(value);
  if (!imageUrl || !sameBoardWizardMerchant(imageUrl, sourceUrl)) return '';
  try {
    const url = new URL(imageUrl);
    if (
      !/\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(url.toString())
      && !/\/images?\/is\/image\//i.test(url.pathname)
      && !/\/image\/upload\//i.test(url.pathname)
    ) {
      return '';
    }
    if (/(?:logo|icon|sprite|avatar|spacer|tracking|pixel|loader|placeholder|maintenance)/i.test(url.toString())) {
      return '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

function sameBoardWizardMerchant(left: string, right: string): boolean {
  const merchantRoot = (value: string) => {
    const hostname = safeCommerceHostname(value).replace(/^www\./, '');
    const labels = hostname.split('.');
    const countryCodeSecondLevel =
      labels.length >= 3
      && labels[labels.length - 1]?.length === 2
      && /^(?:ac|co|com|gov|net|org)$/.test(labels[labels.length - 2] ?? '');
    return labels.slice(countryCodeSecondLevel ? -3 : -2).join('.');
  };
  const leftRoot = merchantRoot(left);
  return !!leftRoot && leftRoot === merchantRoot(right);
}

function buildRestaurantMenuWizardBatch(
  options: {
    extraction: BoardWizardUrlExtraction;
    sourceUrl: string;
    targetBoardTitle: string;
    count: number;
  },
): GeneratedBoardWizardBatch {
  const restaurantName = inferRestaurantNameFromUrlExtraction(options.extraction, options.sourceUrl, options.targetBoardTitle);
  const menuLimit = Math.max(1, Math.min(options.extraction.menuItems.length, options.count - 1));
  const menuCards = options.extraction.menuItems.slice(0, menuLimit).map((item, index): GeneratedBoardWizardCard => ({
    title: item.title.slice(0, 80),
    subtitle: [item.category, item.price].filter(Boolean).join(' · ').slice(0, 90) || 'Menu item',
    notes: (item.description || `A menu item from ${restaurantName}.`).slice(0, 260),
    type: 'food',
    scope: 'place',
    status: index < 3 ? 'favorite' : 'saved',
    rating: index < 3 ? 5 : 4,
    tags: mergeBoardWizardTags(['menu-item', 'food'], [item.category]),
    image_query: `${item.title} ${restaurantName} food`.slice(0, 120),
    place_query: restaurantName.slice(0, 140),
    imageUrl: item.imageUrl || undefined,
    sourceUrl: options.sourceUrl,
    imageSource: item.imageUrl ? 'source-page' : 'missing',
  }));
  const cards = [
    ...menuCards,
    {
      title: 'Open Menu',
      subtitle: 'View the original menu',
      notes: 'Use this card as the action link back to the restaurant menu.',
      type: 'note',
      scope: 'place',
      status: 'planned',
      rating: 4,
      tags: ['action', 'menu'],
      image_query: `${restaurantName} menu`,
      place_query: options.sourceUrl,
    } satisfies GeneratedBoardWizardCard,
  ].slice(0, options.count);

  return {
    board: {
      title: (options.targetBoardTitle || `${restaurantName} Menu`).slice(0, 90),
      description: `Food-item board generated from ${restaurantName}.`,
      icon: 'restaurant',
      tone: 'coral',
    },
    cards,
  };
}

function inferRestaurantNameFromUrlExtraction(
  extraction: BoardWizardUrlExtraction,
  sourceUrl: string,
  targetBoardTitle: string,
): string {
  if (targetBoardTitle.trim()) {
    return targetBoardTitle.trim();
  }
  const title = (extraction.siteName || extraction.pageTitle)
    .replace(/\s*[|–—]\s*.*$/i, '')
    .replace(/\s+-\s+(order|menu|location|official|best|delivery|pickup).*$/i, '')
    .replace(/^(order|menu for)\s+/i, '')
    .replace(/\s+(menu|location|restaurant)$/i, '')
    .trim();
  if (title) {
    return title;
  }
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '').split('.')[0].replace(/[-_]+/g, ' ');
  } catch {
    return 'Restaurant';
  }
}

function shapeRestaurantMenuWizardBatch(
  batch: GeneratedBoardWizardBatch,
  options: {
    menuItems: BoardWizardMenuItem[];
    sourceUrl: string;
    count: number;
  },
): GeneratedBoardWizardBatch {
  const restaurantName = batch.board.title.replace(/\s+(menu|food|board|guide)$/i, '').trim() || batch.board.title;
  const actionCard = batch.cards.find((card) =>
    card.type === 'note' || /(menu|order|reserve|book)/i.test(`${card.title} ${card.subtitle} ${card.place_query}`),
  );
  const menuLimit = Math.min(options.menuItems.length, Math.max(1, options.count - (actionCard ? 1 : 0)));
  const menuCards = options.menuItems.slice(0, menuLimit).map((item, index): GeneratedBoardWizardCard => ({
    title: item.title.slice(0, 80),
    subtitle: [item.category, item.price].filter(Boolean).join(' · ').slice(0, 90) || 'Menu item',
    notes: (item.description || `A menu item from ${restaurantName}.`).slice(0, 260),
    type: 'food',
    scope: 'place',
    status: index < 3 ? 'favorite' : 'saved',
    rating: index < 3 ? 5 : 4,
    tags: mergeBoardWizardTags(['menu-item', 'food'], [item.category]),
    image_query: `${item.title} ${restaurantName} food`.slice(0, 120),
    place_query: restaurantName.slice(0, 140),
    imageUrl: item.imageUrl || undefined,
    sourceUrl: options.sourceUrl,
    imageSource: item.imageUrl ? 'source-page' : 'missing',
  }));
  const finalAction: GeneratedBoardWizardCard = actionCard
    ? { ...actionCard, tags: mergeBoardWizardTags(actionCard.tags, ['action']) }
    : {
        title: 'Open Menu',
        subtitle: 'View the source menu',
        notes: 'Use this card as the action link back to the restaurant menu.',
        type: 'note',
        scope: 'place',
        status: 'planned',
        rating: 4,
        tags: ['action', 'menu'],
        image_query: `${restaurantName} menu`,
        place_query: options.sourceUrl,
      };
  const cards = [...menuCards, finalAction].slice(0, options.count);
  return {
    ...batch,
    board: {
      ...batch.board,
      icon: 'restaurant',
      description: `Menu-item board generated from ${restaurantName}.`,
    },
    cards,
  };
}

async function enrichBoardWizardCard(
  card: GeneratedBoardWizardCard,
  searchContext: string,
  apiKey: string,
  customSearchApiKey = '',
): Promise<GeneratedBoardWizardCard> {
  // A commerce image bound inside the same product record is stronger evidence than
  // any subsequent place, Wikimedia, or web-search result.
  if (card.productUrl && card.imageUrl) {
    return card;
  }
  if (isBoardWizardFictionalCharacter(card)) {
    const imageQuery = buildBoardWizardReferenceImageQuery(card, searchContext);
    if (card.imageUrl) {
      return { ...card, image_query: imageQuery };
    }
    const webImageUrl = await findBoardWizardVerifiedWebImage(card, searchContext, customSearchApiKey);
    if (webImageUrl) {
      return { ...card, image_query: imageQuery, imageUrl: webImageUrl };
    }
    const summaryImageUrl = await findWikipediaFictionalCharacterSummaryImage(card, searchContext);
    return summaryImageUrl
      ? { ...card, image_query: imageQuery, imageUrl: summaryImageUrl }
      : { ...card, image_query: imageQuery };
  }
  if (shouldUseReferenceImageBeforePlaces(card, searchContext)) {
    const imageQuery = buildBoardWizardReferenceImageQuery(card, searchContext);
    const referenceKind = boardWizardReferenceImageKind(card, searchContext);
    let musicAudioPreviewUrl = '';
    let spotifyTrack: SpotifyTrackMatch | null = null;
    if (referenceKind === 'song' || referenceKind === 'album') {
      spotifyTrack = await findSpotifyTrackForBoardWizard(card, searchContext, customSearchApiKey);
      const musicMedia = await findAppleMusicMediaForBoardWizard(card, searchContext, referenceKind);
      musicAudioPreviewUrl = musicMedia.audioPreviewUrl || card.audioPreviewUrl || '';
      if (referenceKind === 'song' && !musicAudioPreviewUrl) {
        musicAudioPreviewUrl = await findDeezerAudioPreviewForBoardWizard(card, searchContext);
      }
      if (musicMedia.imageUrl) {
        return {
          ...card,
          ...spotifyFieldsForBoardWizardCard(spotifyTrack),
          image_query: imageQuery,
          imageUrl: musicMedia.imageUrl || card.imageUrl,
          audioPreviewUrl: musicAudioPreviewUrl || card.audioPreviewUrl,
        };
      }
    }
    const referenceEnriched = await enrichBoardWizardCardWithReferenceImage({
      ...card,
      image_query: imageQuery,
    });
    if (referenceEnriched.imageUrl) {
      return {
        ...referenceEnriched,
        ...spotifyFieldsForBoardWizardCard(spotifyTrack),
        audioPreviewUrl: musicAudioPreviewUrl || referenceEnriched.audioPreviewUrl || card.audioPreviewUrl,
      };
    }
    if (referenceKind && referenceKind !== 'person') {
      const webImageUrl = await findBoardWizardReferenceWebImage(imageQuery, customSearchApiKey);
      if (webImageUrl) {
        return {
          ...card,
          ...spotifyFieldsForBoardWizardCard(spotifyTrack),
          image_query: imageQuery,
          imageUrl: webImageUrl,
          audioPreviewUrl: musicAudioPreviewUrl || card.audioPreviewUrl,
        };
      }
    }
    return {
      ...card,
      ...spotifyFieldsForBoardWizardCard(spotifyTrack),
      image_query: imageQuery,
      audioPreviewUrl: musicAudioPreviewUrl || card.audioPreviewUrl,
    };
  }
  const placeEnriched = apiKey && shouldResolveBoardWizardCardAsPlace(card)
    ? await withBoardWizardTimeout(enrichBoardWizardCardWithPlace(card, searchContext, apiKey), 7_000, card)
    : card;
  if (placeEnriched.imageUrl) {
    return placeEnriched;
  }
  return await enrichBoardWizardCardWithReferenceImage(placeEnriched);
}

function shouldUseReferenceImageBeforePlaces(card: GeneratedBoardWizardCard, searchContext: string): boolean {
  if (isBoardWizardMenuItemCard(card)) {
    return false;
  }
  if (shouldResolveBoardWizardCardAsPlace(card)) {
    return false;
  }
  if (card.entity_type && ['person', 'fictional_character', 'event', 'work', 'product', 'organization'].includes(card.entity_type)) {
    return true;
  }
  if (card.image_intent && ['portrait', 'character', 'event', 'cover', 'product', 'logo'].includes(card.image_intent)) {
    return true;
  }
  const text = `${card.title} ${card.subtitle} ${card.notes} ${card.tags.join(' ')} ${card.image_query} ${searchContext}`.toLowerCase();
  if (boardWizardReferenceImageKind(card, searchContext)) {
    return true;
  }
  if (/\b(portrait|person|people|biography|born|died|president|first lady|signer|founding father|politician|leader|governor|senator|representative|justice|inventor|author|artist|scientist|athlete|actor|musician|composer|poet|philosopher|general|monarch|king|queen|emperor|saint)\b/.test(text)) {
    return true;
  }
  if (/\b(american presidents|u\.s\. presidents|us presidents|56 signers|declaration of independence|hall of fame|notable people|historical figures|world cup winners|fifa world cup|world cup champions|world cup winner|world cup champion|national team|football team|soccer team)\b/.test(text)) {
    return true;
  }
  return card.type !== 'place'
    && /\b(history|fact|facts|timeline|profile|figure|legacy|era|state|country|winner|winners|champion|champions|tournament|award|awards|record|records)\b/.test(text);
}

function buildBoardWizardReferenceImageQuery(card: GeneratedBoardWizardCard, searchContext = ''): string {
  if (isBoardWizardFictionalCharacter(card)) {
    return buildBoardWizardFictionalCharacterSearchQueries(card, searchContext)[0]?.slice(0, 180)
      || textFromUnknown(card.image_query || card.entity_name || card.title).slice(0, 180);
  }
  const title = stripBoardWizardListPrefix(textFromUnknown(card.entity_name || card.title));
  const text = `${title} ${card.subtitle} ${card.notes} ${card.tags.join(' ')} ${card.image_query} ${searchContext}`;
  const worldCupTeamTitle = buildWorldCupTeamWikipediaTitle(title, text);
  if (worldCupTeamTitle) {
    return worldCupTeamTitle.slice(0, 140);
  }
  const referenceKind = boardWizardReferenceImageKind(card, searchContext);
  if (referenceKind) {
    return buildBoardWizardMediaImageQuery(title, card, searchContext, referenceKind).slice(0, 140);
  }
  const query = textFromUnknown(card.image_query).replace(/\s+/g, ' ').trim();
  if (query && !/\b(building|house|library|museum|monument|memorial|school|university|bridge|park|airport|station)\b/i.test(query)) {
    return query.slice(0, 140);
  }
  if (/\b(president|signer|portrait|born|died|biography)\b/i.test(`${card.subtitle} ${card.notes} ${card.tags.join(' ')}`)) {
    return `${title} portrait`.slice(0, 140);
  }
  return title.slice(0, 140);
}

type BoardWizardReferenceImageKind = Exclude<BoardWizardMediaKind, 'none'> | 'person' | '';

function boardWizardReferenceImageKind(card: GeneratedBoardWizardCard | BoardWizardCurrentCard, searchContext = ''): BoardWizardReferenceImageKind {
  if ('entity_type' in card && card.entity_type === 'person') {
    return 'person';
  }
  if ('image_intent' in card && card.image_intent === 'portrait') return 'person';
  const mediaKind = resolveBoardWizardMediaKind(card);
  if (mediaKind !== 'none') return mediaKind;
  if ('media_kind' in card && card.media_kind) return '';

  // Legacy fallback only: use card-local content. Global board context must
  // never turn every card into the same media type.
  const text = `${card.title} ${card.subtitle} ${card.tags.join(' ')} ${card.image_query}`.toLowerCase();
  const cardText = `${card.title} ${card.subtitle} ${card.notes} ${card.tags.join(' ')}`.toLowerCase();
  if (/\b(president|presidential|first lady|signer|founding father|politician|governor|senator|representative|justice)\b/.test(cardText)) {
    return 'person';
  }
  if (/\b(movie|movies|film|films|cinema|filmography|starring|directed by|screenplay|box office|oscars?|academy award)\b/.test(text)) {
    return 'film';
  }
  if (/\b(song|songs|single|singles|track|tracks|lyrics|billboard|hot 100)\b/.test(text)) {
    return 'song';
  }
  if (/\b(album|albums|ep|lp|record cover)\b/.test(text)) {
    return 'album';
  }
  if (/\b(book|books|novel|novels|memoir|author|published|literature)\b/.test(text)) {
    return 'book';
  }
  if (/\b(tv|television|series|season|episode|episodes|sitcom|streaming)\b/.test(text)) {
    return 'tv';
  }
  if (/\b(video game|video games|game|games|console|playstation|xbox|nintendo|steam)\b/.test(text)) {
    return 'game';
  }
  if (/\b(portrait|person|people|biography|born|died|president|presidential|first lady|signer|founding father|politician|governor|senator|representative|justice|actor|actress|artist|musician|composer|singer|rapper|pianist|guitarist|drummer|bassist|saxophonist|trumpeter|vocalist|bandleader|author|athlete|director)\b/.test(text)) {
    return 'person';
  }
  return '';
}

function buildBoardWizardMediaImageQuery(
  title: string,
  card: GeneratedBoardWizardCard | BoardWizardCurrentCard,
  searchContext: string,
  kind: BoardWizardReferenceImageKind,
): string {
  const contextText = `${card.title} ${card.subtitle} ${'notes' in card ? card.notes : ''} ${Array.isArray(card.tags) ? card.tags.join(' ') : ''} ${card.image_query} ${searchContext}`;
  const cleanTitle = kind === 'person'
    ? canonicalBoardWizardPersonImageTitle(title, contextText)
    : title.replace(/\s+/g, ' ').trim();
  const artistOrCreator = extractBoardWizardCreatorHint(`${card.subtitle} ${'notes' in card ? card.notes : ''} ${Array.isArray(card.tags) ? card.tags.join(' ') : ''} ${searchContext}`);
  const yearHint = extractBoardWizardYearHint(contextText);
  switch (kind) {
    case 'film':
      return [cleanTitle, cleanTitle.includes(yearHint) ? '' : yearHint, 'official movie poster'].filter(Boolean).join(' ');
    case 'song':
      return [cleanTitle, artistOrCreator, 'song cover art'].filter(Boolean).join(' ');
    case 'album':
      return `${cleanTitle} album cover`;
    case 'book':
      return `${cleanTitle} book cover`;
    case 'tv':
      return `${cleanTitle} TV series poster`;
    case 'game':
      return `${cleanTitle} video game cover art`;
    case 'person':
      return [cleanTitle, boardWizardPersonRoleHint(contextText), 'portrait'].filter(Boolean).join(' ');
    default:
      return cleanTitle;
  }
}

function canonicalBoardWizardPersonImageTitle(title: string, text: string): string {
  const normalized = stripBoardWizardListPrefix(title);
  const match = normalized.match(/^[^:\u2013\u2014-]{2,36}[:\u2013\u2014-]\s*([^:\u2013\u2014-]{2,80})$/);
  const subject = (match?.[1] ?? '').replace(/^["'`]+|["'`]+$/g, '').trim();
  if (subject && isBoardWizardLikelyPersonSubject(subject, text)) {
    return subject;
  }
  return normalized;
}

function isBoardWizardLikelyPersonSubject(subject: string, text: string): boolean {
  const words = subject.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) {
    return false;
  }
  if (!/\b(portrait|person|people|biography|born|died|artist|musician|composer|singer|rapper|pianist|guitarist|drummer|bassist|saxophonist|trumpeter|vocalist|bandleader|actor|actress|author|writer|poet|scientist|inventor|athlete|president|leader|historical figure)\b/i.test(text)) {
    return false;
  }
  return words.some((word) => /^[A-Z][A-Za-z'.-]+$/.test(word));
}

function boardWizardPersonRoleHint(text: string): string {
  const lower = text.toLowerCase();
  if (/\bjazz\b/.test(lower) && /\bpianist\b/.test(lower)) {
    return 'jazz pianist';
  }
  const roles = ['pianist', 'composer', 'singer', 'rapper', 'guitarist', 'drummer', 'bassist', 'saxophonist', 'trumpeter', 'vocalist', 'bandleader', 'musician', 'artist', 'actor', 'actress', 'author', 'writer', 'poet', 'scientist', 'inventor', 'athlete', 'president', 'leader'];
  return roles.find((role) => new RegExp(`\\b${role}\\b`, 'i').test(text)) ?? '';
}

function extractBoardWizardCreatorHint(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const patterns = [
    /\b(?:by|made by|performed by|sung by|artist|featuring|feat\.?|starring)\s+([a-z][\w'.-]+(?:\s+[a-z][\w'.-]+){0,4})/i,
    /\b([a-z][\w'.-]+(?:\s+[a-z][\w'.-]+){0,4})\s+(?:songs?|singles?|albums?|tracks?|discography|hits?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const value = match?.[1]
      ?.replace(/\b(?:movies?|films?|songs?|albums?|books?|discography|hits?|in order|ranked|chronological(?:ly)?|from|with|and)\b.*$/i, '')
      .replace(/^(?:top|best|biggest|greatest|classic|major|popular|favorite|favourite|ultimate|essential)\s+/i, '')
      .replace(/\s+(?:top|best|biggest|greatest|classic|major|popular|favorite|favourite|ultimate|essential)$/i, '')
      .replace(/[.,;:()[\]{}"'`]+$/g, '')
      .trim();
    if (value && value.length <= 60 && !isGenericBoardWizardCreatorHint(value)) {
      return value;
    }
  }
  return '';
}

function isGenericBoardWizardCreatorHint(value: string): boolean {
  const normalized = normalizeMusicArtworkText(value);
  if (!normalized) {
    return true;
  }
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const meaningfulTokens = tokens.filter((token) => !['the', 'a', 'an', 'of', 's'].includes(token));
  if (!meaningfulTokens.length) {
    return true;
  }
  const generic = new Set([
    'ultimate',
    'essential',
    'definitive',
    'greatest',
    'biggest',
    'best',
    'top',
    'classic',
    'major',
    'popular',
    'favorite',
    'favourite',
    'hits',
    'hit',
    'songs',
    'song',
    'singles',
    'single',
    'tracks',
    'track',
    'collection',
    'decade',
    'decades',
    'soundtrack',
    'soundtracks',
    'album',
    'albums',
    'king',
    'pop',
  ]);
  return meaningfulTokens.every((token) => generic.has(token));
}

function extractBoardWizardYearHint(text: string): string {
  const match = text.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
  return match?.[1] ?? '';
}

function buildWorldCupTeamWikipediaTitle(title: string, text: string): string {
  if (!/\b(fifa\s+)?world cup|world cup winner|world cup champion|world cup winners|world cup champions\b/i.test(text)) {
    return '';
  }
  const teamName = extractWorldCupWinnerTeamName(title);
  const year = extractBoardWizardYearHint(`${title} ${text}`);
  if (!teamName || !year) {
    return teamName ? `${teamName} national football team` : '';
  }
  if (year === '1950' && teamName === 'Uruguay') {
    return 'Uruguay v Brazil (1950 FIFA World Cup)';
  }
  return `${year} FIFA World Cup final`;
}

function extractWorldCupWinnerTeamName(title: string): string {
  const compact = title
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(winner|winners|champion|champions|fifa|world cup|men'?s|women'?s|team|national|football|soccer|titles?|wins?)\b/gi, ' ')
    .replace(/[,:;|/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const knownTeams = [
    'Argentina',
    'Brazil',
    'England',
    'France',
    'Germany',
    'Italy',
    'Spain',
    'Uruguay',
    'West Germany',
  ];
  const text = `${title} ${compact}`;
  const known = knownTeams.find((team) => new RegExp(`\\b${team.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text));
  if (known) {
    return known;
  }
  return compact.replace(/^[\-–—]+|[\-–—]+$/g, '').trim().slice(0, 70);
}

function buildBoardCardImageSearchQueries(query: string): string[] {
  const normalized = query.replace(/\s+/g, ' ').trim().slice(0, 180);
  const worldCupEventTitle = buildWorldCupTeamWikipediaTitle(normalized, normalized);
  if (!worldCupEventTitle) {
    const broaderQuery = normalized
      .replace(/\b(high quality|editorial|beautiful|authentic|specific|actual|real|showing|photo|picture|image)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return [normalized, broaderQuery]
      .filter((value) => value.length >= 2)
      .filter((value, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index);
  }
  const teamName = extractWorldCupWinnerTeamName(normalized);
  const year = extractBoardWizardYearHint(normalized);
  return [
    normalized,
    [teamName, 'national football team', year].filter(Boolean).join(' '),
    [year, teamName, 'FIFA World Cup'].filter(Boolean).join(' '),
    [year, 'FIFA World Cup final'].filter(Boolean).join(' '),
  ]
    .map((value) => value.replace(/\s+/g, ' ').trim().slice(0, 180))
    .filter((value) => value.length >= 2)
    .filter((value, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index);
}

function isUsefulWorldCupPhotoSearchResult(result: Omit<BoardCardImageSearchResult, 'token'>): boolean {
  const title = result.title.toLowerCase();
  if (/\b(map|qualification|qualifying|host|hosts|poster|stamp|logo|crest|badge|flag|coat of arms|emblem|kit graphic|formation diagram)\b/.test(title)) {
    return false;
  }
  return !/^\d{4}( fifa)? world cup(?: with qualification)?$/.test(title)
    && !/^fifa world cup appearances/.test(title)
    && !/^countries in the fifa world cup/.test(title);
}

function rankWorldCupPhotoSearchResults(
  results: Array<Omit<BoardCardImageSearchResult, 'token'>>,
  query: string,
): Array<Omit<BoardCardImageSearchResult, 'token'>> {
  const teamName = extractWorldCupWinnerTeamName(query).toLowerCase();
  const year = extractBoardWizardYearHint(query);
  const unique = results.filter(
    (result, index, all) => all.findIndex((candidate) => candidate.imageUrl === result.imageUrl) === index,
  );
  return unique.sort((left, right) => {
    const score = (result: Omit<BoardCardImageSearchResult, 'token'>): number => {
      const title = result.title.toLowerCase();
      return (teamName && title.includes(teamName) ? 18 : 0)
        + (year && title.includes(year) ? 12 : 0)
        + (/\b(celebrating|celebration|champion|champions|squad|team)\b/.test(title) ? 10 : 0)
        + (/\b(final|match|goal|victory|trophy)\b/.test(title) ? 6 : 0);
    };
    return score(right) - score(left);
  });
}

async function enrichBoardWizardCardWithPlace(
  card: GeneratedBoardWizardCard,
  searchContext: string,
  apiKey: string,
): Promise<GeneratedBoardWizardCard> {
  if (isBoardWizardMenuItemCard(card)) {
    return card;
  }
  if (!shouldResolveBoardWizardCardAsPlace(card)) {
    return card;
  }

  const lookupCard: GeneratedBoardWizardCard = {
    ...card,
    locationLat: card.locationLat ?? card.tour?.lat ?? undefined,
    locationLng: card.locationLng ?? card.tour?.lng ?? undefined,
  };
  const queries = buildBoardWizardPlaceSearchQueries(lookupCard, searchContext);
  if (!queries.length) {
    return card;
  }

  const startedAt = Date.now();
  let attemptedQueries = 0;
  let candidateCount = 0;
  let selectedQuery = '';
  let selectedScore = 0;
  let selectedPlace: NonNullable<GooglePlacesTextSearchResponse['results']>[number] | null = null;
  let verifiedDetails: GooglePlaceDetailsResponse['result'] | null = null;
  try {
    if (lookupCard.placeId) {
      verifiedDetails = await fetchGooglePlaceDetailsForBoardWizard(lookupCard.placeId, apiKey);
      if (verifiedDetails?.place_id) {
        selectedPlace = verifiedDetails;
        selectedScore = 1_000;
        selectedQuery = 'verified place id';
        candidateCount = 1;
      }
    }

    for (const query of bestBoardWizardPlacePhotoReference(selectedPlace?.photos ?? []) ? [] : queries) {
      attemptedQueries += 1;
      const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
      searchUrl.searchParams.set('query', query);
      if (Number.isFinite(lookupCard.locationLat) && Number.isFinite(lookupCard.locationLng)) {
        searchUrl.searchParams.set('location', `${lookupCard.locationLat},${lookupCard.locationLng}`);
        searchUrl.searchParams.set('radius', '5000');
      }
      searchUrl.searchParams.set('key', apiKey);
      const search = await fetchJson<GooglePlacesTextSearchResponse>(searchUrl.toString());
      if (search.status && search.status !== 'OK' && search.status !== 'ZERO_RESULTS') {
        logger.warn('Board wizard Google Places text search failed.', {
          status: search.status,
          error: search.error_message,
          entity: boardWizardImageEntityName(card),
          query,
        });
        continue;
      }

      const results = search.results ?? [];
      candidateCount += results.length;
      const ranked = rankBoardWizardPlaceCandidates(lookupCard, results, searchContext);
      const best = ranked[0];
      if (!best) continue;
      const bestHasPhoto = !!bestBoardWizardPlacePhotoReference(best.candidate.photos ?? []);
      const selectedHasPhoto = !!bestBoardWizardPlacePhotoReference(selectedPlace?.photos ?? []);
      if (!selectedPlace || (bestHasPhoto && !selectedHasPhoto) || best.score > selectedScore) {
        selectedPlace = best.candidate;
        selectedScore = best.score;
        selectedQuery = query;
      }
      if (bestHasPhoto) break;
    }

    const placeId = textFromUnknown(selectedPlace?.place_id);
    if (!placeId) {
      logger.info('Board wizard place image lookup completed.', {
        entity: boardWizardImageEntityName(card),
        resolved: false,
        attemptedQueries,
        candidateCount,
        durationMs: Date.now() - startedAt,
      });
      return card;
    }

    const selectedPhotos = selectedPlace?.photos ?? [];
    const details = verifiedDetails ?? (bestBoardWizardPlacePhotoReference(selectedPhotos)
      ? null
      : await fetchGooglePlaceDetailsForBoardWizard(placeId, apiKey));
    const photos = details?.photos?.length ? details.photos : selectedPhotos;
    const photoReference = bestBoardWizardPlacePhotoReference(photos);
    const matchedName = textFromUnknown(details?.name) || textFromUnknown(selectedPlace?.name) || card.title;
    const address = textFromUnknown(details?.formatted_address) || textFromUnknown(selectedPlace?.formatted_address);
    const types = Array.isArray(details?.types)
      ? details.types.map((type) => textFromUnknown(type)).filter(Boolean)
      : Array.isArray(selectedPlace?.types)
        ? selectedPlace.types.map((type) => textFromUnknown(type)).filter(Boolean)
        : [];
    const lat = typeof details?.geometry?.location?.lat === 'number'
      ? details.geometry.location.lat
      : typeof selectedPlace?.geometry?.location?.lat === 'number'
        ? selectedPlace.geometry.location.lat
        : card.tour?.lat ?? null;
    const lng = typeof details?.geometry?.location?.lng === 'number'
      ? details.geometry.location.lng
      : typeof selectedPlace?.geometry?.location?.lng === 'number'
        ? selectedPlace.geometry.location.lng
        : card.tour?.lng ?? null;

    logger.info('Board wizard place image lookup completed.', {
      entity: boardWizardImageEntityName(card),
      resolved: !!photoReference,
      matchedName,
      selectedScore,
      selectedQuery,
      attemptedQueries,
      candidateCount,
      durationMs: Date.now() - startedAt,
    });

    return {
      ...card,
      tags: mergeBoardWizardTags(card.tags, types.map((type) => type.replace(/_/g, ' '))),
      place_query: selectedQuery || card.place_query,
      placeId,
      googleMapsUrl: textFromUnknown(details?.url) || `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`,
      imageUrl: photoReference ? `${publicFunctionsBaseUrl}/boardPlacePhoto?ref=${encodeURIComponent(photoReference)}` : card.imageUrl,
      tour: card.tour
        ? {
            ...card.tour,
            lat,
            lng,
            address: address || card.tour.address,
          }
        : card.tour,
    };
  } catch (error) {
    logger.warn('Board wizard place enrichment failed.', {
      title: card.title,
      entity: boardWizardImageEntityName(card),
      attemptedQueries,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return card;
  }
}

function bestBoardWizardPlacePhotoReference(
  photos: Array<{ photo_reference?: string; width?: number; height?: number }>,
): string {
  return photos
    .map((photo, index) => {
      const photoReference = textFromUnknown(photo.photo_reference);
      const width = typeof photo.width === 'number' ? photo.width : 0;
      const height = typeof photo.height === 'number' ? photo.height : 0;
      const ratio = width > 0 && height > 0 ? width / height : 1;
      const landscapeScore = ratio >= 1.15 && ratio <= 2.4 ? 45 : ratio >= 0.9 && ratio < 1.15 ? 20 : 0;
      const resolutionScore = Math.min(30, Math.round(Math.max(width, height) / 120));
      return { photoReference, score: landscapeScore + resolutionScore - index * 2 };
    })
    .filter((item) => !!item.photoReference)
    .sort((left, right) => right.score - left.score)[0]?.photoReference ?? '';
}

function isBoardWizardMenuItemCard(card: GeneratedBoardWizardCard): boolean {
  if (card.type !== 'food') {
    return false;
  }
  const tags = card.tags.map((tag) => tag.toLowerCase());
  return tags.some((tag) => ['menu-item', 'dish', 'menu', 'food item'].includes(tag));
}

async function withBoardWizardTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function resolveBoardWizardMenuItemImage(
  card: GeneratedBoardWizardCard,
  searchContext: string,
  customSearchApiKey: string,
  cache: Map<string, Promise<string>>,
): Promise<string> {
  const queries = buildBoardWizardMenuItemImageQueries(card, searchContext).slice(0, 2);
  for (const query of queries) {
    const cacheKey = `web:${query.toLowerCase()}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = withBoardWizardTimeout(
        findBoardWizardMenuItemWebImage(query, customSearchApiKey, card.title),
        4_000,
        '',
      );
      cache.set(cacheKey, pending);
    }
    const imageUrl = await pending;
    if (imageUrl) {
      return imageUrl;
    }
  }
  return '';
}

function buildBoardWizardMenuItemImageQueries(card: GeneratedBoardWizardCard, searchContext: string): string[] {
  const title = textFromUnknown(card.title).slice(0, 80);
  const placeQuery = textFromUnknown(card.place_query).slice(0, 120);
  const restaurant = /^https?:\/\//i.test(placeQuery) ? '' : placeQuery;
  const noteKeywords = meaningfulBoardWizardTokens(card.notes)
    .filter((token) => !meaningfulBoardWizardTokens(title).includes(token))
    .slice(0, 5)
    .join(' ');
  const category = card.tags
    .filter((tag) => !['menu-item', 'dish', 'menu', 'food item', 'food'].includes(tag.toLowerCase()))
    .slice(0, 2)
    .join(' ');
  return [
    [title, restaurant, 'menu item'].filter(Boolean).join(' '),
    [title, restaurant, category, 'food photo'].filter(Boolean).join(' '),
    [title, category, 'food photo'].filter(Boolean).join(' '),
    [title, 'food photo'].filter(Boolean).join(' '),
    [noteKeywords, category, 'food photo'].filter(Boolean).join(' '),
    [title, searchContext, 'food'].filter(Boolean).join(' '),
  ]
    .map((query) => query.replace(/\s+/g, ' ').trim().slice(0, 180))
    .filter((query) => query.length >= 3)
    .filter((query, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === query.toLowerCase()) === index)
    .slice(0, 5);
}

async function findBoardWizardMenuItemWebImage(
  query: string,
  customSearchApiKey: string,
  entityName = query,
): Promise<string> {
  return await findWebSearchImageForBoardWizard(query, customSearchApiKey, {
    imageType: 'photo',
    entityName,
    requireFoodContext: true,
  });
}

async function findBoardWizardReferenceWebImage(query: string, customSearchApiKey: string): Promise<string> {
  return await findWebSearchImageForBoardWizard(query, customSearchApiKey, { imageType: 'any' });
}

async function findBoardWizardVerifiedWebImage(
  card: GeneratedBoardWizardCard,
  searchContext: string,
  customSearchApiKey: string,
): Promise<string> {
  const entityName = boardWizardImageEntityName(card);
  const fictionalCharacter = isBoardWizardFictionalCharacter(card);
  const queries = fictionalCharacter
    ? buildBoardWizardFictionalCharacterSearchQueries(card, searchContext).slice(0, 3)
    : buildBoardWizardCommonsSearchQueries(card, searchContext).slice(0, 2);
  for (const query of queries) {
    const imageUrl = await findWebSearchImageForBoardWizard(query, customSearchApiKey, {
      imageType: card.image_intent === 'place' || card.image_intent === 'portrait' ? 'photo' : 'any',
      entityName,
      fictionalCharacterCard: fictionalCharacter ? card : undefined,
      searchContext,
    });
    if (imageUrl) return imageUrl;
  }
  return '';
}

async function findWebSearchImageForBoardWizard(
  query: string,
  legacyGoogleApiKey: string,
  options: BoardWizardWebImageSearchOptions = {},
): Promise<string> {
  return legacyGoogleApiKey
    ? await findGoogleCustomSearchImageForBoardWizard(query, legacyGoogleApiKey, options)
    : '';
}

async function findAppleMusicMediaForBoardWizard(
  card: GeneratedBoardWizardCard | BoardWizardCurrentCard,
  searchContext: string,
  kind: 'song' | 'album',
): Promise<{ imageUrl: string; audioPreviewUrl: string }> {
  const title = textFromUnknown(card.title).replace(/\s+/g, ' ').trim();
  if (title.length < 2) {
    return { imageUrl: '', audioPreviewUrl: '' };
  }
  const artistHints = buildAppleMusicArtistHints(card, searchContext);
  const primaryArtistHint = artistHints[0] ?? '';
  const titleCandidates = buildAppleMusicTitleCandidates(title, card.image_query);
  const searchTerms = buildAppleMusicSearchTerms(titleCandidates, artistHints);

  try {
    const responses = await Promise.all(searchTerms.map(async (searchTerm) => {
      const searchUrl = new URL('https://itunes.apple.com/search');
      searchUrl.searchParams.set('term', searchTerm);
      searchUrl.searchParams.set('media', 'music');
      searchUrl.searchParams.set('entity', kind === 'song' ? 'song' : 'album');
      searchUrl.searchParams.set('country', 'US');
      searchUrl.searchParams.set('limit', '25');
      return await fetchJson<AppleMusicSearchResponse>(searchUrl.toString());
    }));
    const seenResults = new Set<string>();
    const results = responses.flatMap((data) => data.results ?? []).filter((result) => {
      const key = [
        textFromUnknown(result.artistName).toLowerCase(),
        textFromUnknown(result.trackName || result.collectionName).toLowerCase(),
        textFromUnknown(result.collectionName).toLowerCase(),
      ].join('|');
      if (seenResults.has(key)) {
        return false;
      }
      seenResults.add(key);
      return true;
    });
    let scored = scoreAppleMusicMediaResults(results, titleCandidates, artistHints, kind);
    const best = kind === 'song'
      ? scored.find((item) => item.audioPreviewUrl) ?? scored[0]
      : scored[0];
    if (kind === 'song' && !best?.audioPreviewUrl) {
      const fallbackPreview = await findAppleMusicPreviewFallback({
        titleCandidates,
        artistHints,
        kind,
        existingSearchTerms: searchTerms,
      });
      if (fallbackPreview) {
        return {
          imageUrl: best?.artwork ?? '',
          audioPreviewUrl: fallbackPreview,
        };
      }
    }
    if (!best || (kind === 'song' && !best.audioPreviewUrl)) {
      logger.info('Board wizard Apple Music media lookup returned no preview match.', {
        title,
        artistHint: primaryArtistHint,
        artistHints,
        kind,
        searchTerms,
        resultCount: results.length,
        scoredCount: scored.length,
      });
    }
    return {
      imageUrl: best?.artwork ?? '',
      audioPreviewUrl: best?.audioPreviewUrl ?? '',
    };
  } catch (error) {
    logger.warn('Board wizard Apple Music media lookup failed.', {
      title,
      artistHint: primaryArtistHint,
      artistHints,
      kind,
      searchTerms,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { imageUrl: '', audioPreviewUrl: '' };
  }
}

async function findSongAudioPreviewForBoardWizard(
  card: GeneratedBoardWizardCard | BoardWizardCurrentCard,
  searchContext: string,
): Promise<string> {
  if (card.audioPreviewUrl) {
    return card.audioPreviewUrl;
  }
  const apple = await findAppleMusicMediaForBoardWizard(card, searchContext, 'song');
  if (apple.audioPreviewUrl) {
    return apple.audioPreviewUrl;
  }
  return await findDeezerAudioPreviewForBoardWizard(card, searchContext);
}

async function findSpotifyTrackForBoardWizard(
  card: GeneratedBoardWizardCard | BoardWizardCurrentCard,
  searchContext: string,
  customSearchApiKey: string,
): Promise<SpotifyTrackMatch | null> {
  const title = textFromUnknown(card.title).replace(/\s+/g, ' ').trim();
  if (title.length < 2) {
    return null;
  }
  if (card.spotifyTrackId) {
    return {
      id: card.spotifyTrackId,
      trackUrl: card.spotifyTrackUrl || `https://open.spotify.com/track/${card.spotifyTrackId}`,
      uri: card.spotifyUri || `spotify:track:${card.spotifyTrackId}`,
      artistName: card.spotifyArtistName || '',
      albumName: card.spotifyAlbumName || '',
      artworkUrl: card.spotifyArtworkUrl || '',
    };
  }
  const artistHints = buildAppleMusicArtistHints(card, searchContext);
  const titleCandidates = buildAppleMusicTitleCandidates(title, card.image_query);
  const spotifyApiMatch = await findSpotifyTrackWithOfficialApi(titleCandidates, artistHints);
  if (spotifyApiMatch) {
    return spotifyApiMatch;
  }
  const cx = googleCustomSearchCx.trim();
  if (!customSearchApiKey || !cx || Date.now() < googleCustomSearchUnavailableUntil) {
    return null;
  }

  const searchTerms = buildAppleMusicSearchTerms(titleCandidates, artistHints)
    .map((term) => `${term} site:open.spotify.com/track`)
    .slice(0, 4);

  try {
    const responses = await Promise.all(searchTerms.map(async (query) => {
      const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
      searchUrl.searchParams.set('key', customSearchApiKey);
      searchUrl.searchParams.set('cx', cx);
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('num', '5');
      const response = await fetch(searchUrl.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'LivingWiki/1.0 spotify-track-resolver (https://livingwiki.com)',
        },
        signal: AbortSignal.timeout(4500),
      });
      const search = await response.json() as GoogleCustomSearchWebResponse;
      if (!response.ok || search.error?.message) {
        if (response.status === 403 || response.status === 429) {
          googleCustomSearchUnavailableUntil = Date.now() + (response.status === 403 ? 60 * 60 * 1000 : 60 * 1000);
        }
        logger.warn('Board wizard Spotify track search failed.', {
          query,
          status: response.status,
          error: search.error?.message,
        });
        return [] as NonNullable<GoogleCustomSearchWebResponse['items']>;
      }
      return search.items ?? [];
    }));

    const titleTokenSets = titleCandidates.map((candidate) => musicArtworkTokens(candidate)).filter((tokens) => tokens.length);
    const artistTokenSets = artistHints.map((hint) => musicArtworkTokens(hint)).filter((tokens) => tokens.length);
    const candidates = responses.flatMap((items) => items)
      .map((item) => {
        const link = textFromUnknown(item.link);
        const id = spotifyTrackIdFromUrl(link);
        if (!id) {
          return null;
        }
        const text = `${item.title ?? ''} ${item.snippet ?? ''} ${link}`.toLowerCase();
        const tokens = musicArtworkTokens(text);
        const titleScore = Math.max(0, ...titleTokenSets.map((set) =>
          set.filter((token) => tokens.includes(token)).length / set.length,
        ));
        const artistScore = artistTokenSets.length
          ? Math.max(0, ...artistTokenSets.map((set) => set.filter((token) => tokens.includes(token)).length / set.length))
          : 0.15;
        const hasStrongArtistMatch = artistTokenSets.some((artistTokens) =>
          artistTokens.filter((token) => tokens.includes(token)).length >= Math.min(2, artistTokens.length),
        );
        if (artistTokenSets.length && !hasStrongArtistMatch) {
          return null;
        }
        const score = titleScore * 2 + artistScore + (/open\.spotify\.com\/track\//i.test(link) ? 0.5 : 0);
        return {
          id,
          score,
          match: {
            id,
            trackUrl: `https://open.spotify.com/track/${id}`,
            uri: `spotify:track:${id}`,
            artistName: artistHints[0] ?? '',
            albumName: '',
            artworkUrl: '',
          } satisfies SpotifyTrackMatch,
        };
      })
      .filter((item): item is { id: string; score: number; match: SpotifyTrackMatch } => !!item && item.score >= 1.4)
      .sort((left, right) => right.score - left.score);
    return candidates[0]?.match ?? null;
  } catch (error) {
    logger.warn('Board wizard Spotify track lookup failed.', {
      title,
      searchTerms,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function findSpotifyTrackWithOfficialApi(titleCandidates: string[], artistHints: string[]): Promise<SpotifyTrackMatch | null> {
  const token = await getSpotifyClientCredentialsToken();
  if (!token) {
    return null;
  }
  const searchTerms = buildSpotifySearchTerms(titleCandidates, artistHints);
  if (!searchTerms.length) {
    return null;
  }
  const titleTokenSets = titleCandidates.map((candidate) => musicArtworkTokens(candidate)).filter((tokens) => tokens.length);
  const artistTokenSets = artistHints.map((hint) => musicArtworkTokens(hint)).filter((tokens) => tokens.length);
  const normalizedTitles = titleCandidates.map((candidate) => normalizeMusicArtworkText(candidate)).filter(Boolean);
  try {
    const responses = await Promise.all(searchTerms.map(async (query) => {
      const searchUrl = new URL('https://api.spotify.com/v1/search');
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('type', 'track');
      searchUrl.searchParams.set('market', 'US');
      searchUrl.searchParams.set('limit', '10');
      const response = await fetch(searchUrl.toString(), {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'LivingWiki/1.0 spotify-track-resolver (https://livingwiki.com)',
        },
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json() as SpotifySearchResponse;
      if (!response.ok || data.error?.message) {
        logger.warn('Board wizard Spotify API search failed.', {
          query,
          status: response.status,
          error: data.error?.message,
        });
        return [] as NonNullable<SpotifySearchResponse['tracks']>['items'];
      }
      return data.tracks?.items ?? [];
    }));

    const candidates = responses.flatMap((items) => items ?? [])
      .map((track) => scoreSpotifyApiTrack(track, titleTokenSets, artistTokenSets, normalizedTitles))
      .filter((item): item is { score: number; match: SpotifyTrackMatch } => !!item && item.score >= (artistTokenSets.length ? 78 : 92))
      .sort((left, right) => right.score - left.score);
    return candidates[0]?.match ?? null;
  } catch (error) {
    logger.warn('Board wizard Spotify API lookup failed.', {
      searchTerms,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function getSpotifyClientCredentialsToken(): Promise<string> {
  const clientSecret = spotifyClientSecret.value();
  if (!spotifyClientId || !clientSecret) {
    return '';
  }
  const now = Date.now();
  if (spotifyAccessTokenCache && spotifyAccessTokenCache.expiresAt > now + 30_000) {
    return spotifyAccessTokenCache.token;
  }
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${spotifyClientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json() as SpotifyTokenResponse;
    if (!response.ok || !data.access_token) {
      logger.warn('Board wizard Spotify token request failed.', {
        status: response.status,
        error: data.error,
        errorDescription: data.error_description,
      });
      spotifyAccessTokenCache = null;
      return '';
    }
    const expiresInMs = Math.max(60, data.expires_in ?? 3600) * 1000;
    spotifyAccessTokenCache = {
      token: data.access_token,
      expiresAt: now + expiresInMs,
    };
    return data.access_token;
  } catch (error) {
    logger.warn('Board wizard Spotify token request errored.', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    spotifyAccessTokenCache = null;
    return '';
  }
}

function buildSpotifySearchTerms(titleCandidates: string[], artistHints: string[]): string[] {
  const primaryTitle = titleCandidates[0] ?? '';
  const compactTitle = titleCandidates.find((candidate) => musicArtworkTokens(candidate).length <= 6) ?? primaryTitle;
  const primaryArtist = artistHints[0] ?? '';
  const quotedPrimary = primaryArtist ? `track:"${compactTitle}" artist:"${primaryArtist}"` : `track:"${compactTitle}"`;
  return [
    quotedPrimary,
    [compactTitle, primaryArtist].filter(Boolean).join(' '),
    [primaryTitle, primaryArtist].filter(Boolean).join(' '),
    ...artistHints.slice(1).map((artist) => `track:"${compactTitle}" artist:"${artist}"`),
    compactTitle,
  ]
    .map((term) => term.replace(/\s+/g, ' ').trim().slice(0, 180))
    .filter((term) => term.length >= 2)
    .filter((term, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === term.toLowerCase()) === index)
    .slice(0, 5);
}

function scoreSpotifyApiTrack(
  track: NonNullable<NonNullable<SpotifySearchResponse['tracks']>['items']>[number],
  titleTokenSets: string[][],
  artistTokenSets: string[][],
  normalizedTitles: string[],
): { score: number; match: SpotifyTrackMatch } | null {
  const id = textFromUnknown(track.id);
  const title = textFromUnknown(track.name);
  const artists = (track.artists ?? []).map((artist) => textFromUnknown(artist.name)).filter(Boolean);
  if (!id || !title) {
    return null;
  }
  const artistText = artists.join(' ');
  const resultText = normalizeMusicArtworkText(`${title} ${artistText}`);
  const titleText = normalizeMusicArtworkText(title);
  const titleMatches = titleTokenSets.map((titleTokens) => {
    const matches = titleTokens.filter((token) => resultText.includes(token)).length;
    const required = titleTokens.length <= 2 ? titleTokens.length : Math.min(2, titleTokens.length);
    return { matches, required, tokenCount: titleTokens.length };
  });
  const bestTitle = titleMatches
    .filter((item) => item.required > 0 && item.matches >= item.required)
    .sort((left, right) => right.matches - left.matches || left.tokenCount - right.tokenCount)[0];
  if (!bestTitle) {
    return null;
  }
  const artistMatches = artistTokenSets.map((artistTokens) => artistTokens.filter((token) => resultText.includes(token)).length);
  const bestArtistMatches = artistMatches.length ? Math.max(...artistMatches) : 0;
  const hasStrongArtistMatch = artistTokenSets.some((artistTokens, index) =>
    artistMatches[index] >= Math.min(2, artistTokens.length),
  );
  if (artistTokenSets.length && !hasStrongArtistMatch) {
    return null;
  }
  const exactTitleMatch = normalizedTitles.some((normalizedTitle) => titleText === normalizedTitle);
  const closeTitleMatch = normalizedTitles.some((normalizedTitle) =>
    titleText.includes(normalizedTitle) || normalizedTitle.includes(titleText),
  );
  let score = bestTitle.matches * 18 + bestArtistMatches * 28;
  if (exactTitleMatch) {
    score += 92;
  } else if (closeTitleMatch) {
    score += 46;
  }
  if (hasStrongArtistMatch) {
    score += 44;
  } else if (artistTokenSets.length) {
    score -= exactTitleMatch ? 10 : 32;
  }
  if (/\b(live|karaoke|tribute|cover|instrumental|mixed|dj mix|demo)\b/.test(titleText) && !/\b(live|karaoke|tribute|cover|instrumental|mixed|dj mix|demo)\b/.test(normalizedTitles.join(' '))) {
    score -= 35;
  }
  const albumImages = [...(track.album?.images ?? [])].sort((left, right) => (right.width ?? 0) - (left.width ?? 0));
  const trackUrl = textFromUnknown(track.external_urls?.spotify) || `https://open.spotify.com/track/${id}`;
  return {
    score,
    match: {
      id,
      trackUrl,
      uri: textFromUnknown(track.uri) || `spotify:track:${id}`,
      artistName: artists[0] ?? '',
      albumName: textFromUnknown(track.album?.name),
      artworkUrl: textFromUnknown(albumImages[0]?.url),
    },
  };
}

function spotifyTrackIdFromUrl(value: string): string {
  const match = value.match(/(?:open\.spotify\.com\/track\/|spotify:track:)([A-Za-z0-9]{12,32})/i);
  return match?.[1] ?? '';
}

function spotifyFieldsForBoardWizardCard(match: SpotifyTrackMatch | null): Partial<GeneratedBoardWizardCard> {
  if (!match) {
    return {};
  }
  return {
    spotifyTrackId: match.id,
    spotifyTrackUrl: match.trackUrl,
    spotifyUri: match.uri,
    spotifyArtistName: match.artistName,
    spotifyAlbumName: match.albumName,
    spotifyArtworkUrl: match.artworkUrl,
  };
}

async function findDeezerAudioPreviewForBoardWizard(
  card: GeneratedBoardWizardCard | BoardWizardCurrentCard,
  searchContext: string,
): Promise<string> {
  const title = textFromUnknown(card.title).replace(/\s+/g, ' ').trim();
  if (title.length < 2) {
    return '';
  }
  const artistHints = buildAppleMusicArtistHints(card, searchContext);
  const titleCandidates = buildAppleMusicTitleCandidates(title, card.image_query);
  const searchTerms = buildAppleMusicSearchTerms(titleCandidates, artistHints);
  const titleTokenSets = titleCandidates.map((candidate) => musicArtworkTokens(candidate)).filter((tokens) => tokens.length);
  const artistTokenSets = artistHints.map((hint) => musicArtworkTokens(hint)).filter((tokens) => tokens.length);
  const normalizedTitles = titleCandidates.map((candidate) => normalizeMusicArtworkText(candidate)).filter(Boolean);

  try {
    const responses = await Promise.all(searchTerms.map(async (searchTerm) => {
      const searchUrl = new URL('https://api.deezer.com/search/track');
      searchUrl.searchParams.set('q', searchTerm);
      searchUrl.searchParams.set('limit', '12');
      return await fetchJson<DeezerTrackSearchResponse>(searchUrl.toString());
    }));
    const scored = responses
      .flatMap((data) => data.data ?? [])
      .map((track) => scoreDeezerAudioPreview(track, titleTokenSets, artistTokenSets, normalizedTitles))
      .filter((item): item is { score: number; previewUrl: string } => !!item && item.score >= (artistTokenSets.length ? 78 : 92))
      .sort((left, right) => right.score - left.score);
    return scored[0]?.previewUrl ?? '';
  } catch (error) {
    logger.warn('Board wizard Deezer preview lookup failed.', {
      title,
      artistHint: artistHints[0] ?? '',
      searchTerms,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return '';
  }
}

function scoreDeezerAudioPreview(
  track: NonNullable<DeezerTrackSearchResponse['data']>[number],
  titleTokenSets: string[][],
  artistTokenSets: string[][],
  normalizedTitles: string[],
): { score: number; previewUrl: string } | null {
  const previewUrl = textFromUnknown(track.preview);
  const title = textFromUnknown(track.title_short || track.title);
  const artistName = textFromUnknown(track.artist?.name);
  if (!previewUrl || !title) {
    return null;
  }
  const resultTitleText = normalizeMusicArtworkText(title);
  const resultText = normalizeMusicArtworkText(`${track.title ?? ''} ${track.title_short ?? ''} ${track.title_version ?? ''} ${artistName} ${track.album?.title ?? ''}`);
  const titleMatches = titleTokenSets.map((titleTokens) => {
    const matches = titleTokens.filter((token) => resultText.includes(token)).length;
    const required = titleTokens.length <= 2 ? titleTokens.length : Math.min(2, titleTokens.length);
    return { matches, required, tokenCount: titleTokens.length };
  });
  const bestTitle = titleMatches
    .filter((item) => item.required > 0 && item.matches >= item.required)
    .sort((left, right) => right.matches - left.matches || left.tokenCount - right.tokenCount)[0];
  if (!bestTitle) {
    return null;
  }
  const artistMatches = artistTokenSets.map((artistTokens) => artistTokens.filter((token) => resultText.includes(token)).length);
  const bestArtistMatches = artistMatches.length ? Math.max(...artistMatches) : 0;
  const hasStrongArtistMatch = artistTokenSets.some((artistTokens, index) =>
    artistMatches[index] >= Math.min(2, artistTokens.length),
  );
  if (artistTokenSets.length && !hasStrongArtistMatch) {
    return null;
  }
  const exactTitleMatch = normalizedTitles.some((normalizedTitle) => resultTitleText === normalizedTitle);
  const closeTitleMatch = normalizedTitles.some((normalizedTitle) =>
    resultTitleText.includes(normalizedTitle) || normalizedTitle.includes(resultTitleText),
  );
  let score = bestTitle.matches * 18 + bestArtistMatches * 28;
  if (exactTitleMatch) {
    score += 92;
  } else if (closeTitleMatch) {
    score += 46;
  }
  if (hasStrongArtistMatch) {
    score += 44;
  } else if (artistTokenSets.length) {
    score -= exactTitleMatch ? 10 : 32;
  }
  if (track.readable === false) {
    score -= 15;
  }
  if (typeof track.rank === 'number') {
    score += Math.min(14, Math.max(0, track.rank / 100_000));
  }
  if (/\b(live|karaoke|tribute|cover|instrumental|mixed|dj mix|demo)\b/.test(resultText) && !/\b(live|karaoke|tribute|cover|instrumental|mixed|dj mix|demo)\b/.test(normalizedTitles.join(' '))) {
    score -= 35;
  }
  return { score, previewUrl };
}

function scoreAppleMusicMediaResults(
  results: NonNullable<AppleMusicSearchResponse['results']>,
  titleCandidates: string[],
  artistHints: string[],
  kind: 'song' | 'album',
): AppleMusicMediaScore[] {
  const titleTokenSets = titleCandidates.map((candidate) => musicArtworkTokens(candidate)).filter((tokens) => tokens.length);
  const artistTokenSets = artistHints.map((hint) => musicArtworkTokens(hint)).filter((tokens) => tokens.length);
  const normalizedTitles = titleCandidates.map((candidate) => normalizeMusicArtworkText(candidate)).filter(Boolean);
  return results
    .map((result) => {
      const resultTitle = kind === 'song' ? textFromUnknown(result.trackName) : textFromUnknown(result.collectionName);
      const resultArtist = textFromUnknown(result.artistName);
      const resultText = normalizeMusicArtworkText(`${resultTitle} ${resultArtist}`);
      const resultTitleText = normalizeMusicArtworkText(resultTitle);
      const resultCollectionText = normalizeMusicArtworkText(textFromUnknown(result.collectionName));
      const artwork = textFromUnknown(result.artworkUrl600 || result.artworkUrl100)
        .replace(/\/\d+x\d+bb\./, '/1000x1000bb.')
        .replace(/\/\d+x\d+bb-/, '/1000x1000bb-');
      const audioPreviewUrl = kind === 'song' ? textFromUnknown(result.previewUrl) : '';
      if (!artwork || !canTryCoverImageUrl(artwork)) {
        return { artwork: '', audioPreviewUrl: '', score: 0 };
      }
      const titleMatchScores = titleTokenSets.map((titleTokens) => {
        const titleMatches = titleTokens.filter((token) => resultText.includes(token)).length;
        const requiredTitleMatches = titleTokens.length <= 2 ? titleTokens.length : Math.min(2, titleTokens.length);
        return { titleTokens, titleMatches, requiredTitleMatches };
      });
      const bestTitleMatch = titleMatchScores
        .filter((item) => item.requiredTitleMatches > 0 && item.titleMatches >= item.requiredTitleMatches)
        .sort((left, right) => right.titleMatches - left.titleMatches || left.titleTokens.length - right.titleTokens.length)[0];
      if (!bestTitleMatch) {
        return { artwork: '', audioPreviewUrl: '', score: 0 };
      }
      const artistMatches = artistTokenSets.map((artistTokens) => artistTokens.filter((token) => resultText.includes(token)).length);
      const bestArtistMatches = artistMatches.length ? Math.max(...artistMatches) : 0;
      const hasStrongArtistMatch = artistTokenSets.some((artistTokens, index) =>
        artistMatches[index] >= Math.min(2, artistTokens.length),
      );
      if (artistTokenSets.length && !hasStrongArtistMatch) {
        return { artwork: '', audioPreviewUrl: '', score: 0 };
      }
      const exactTitleMatch = normalizedTitles.some((normalizedTitle) => resultTitleText === normalizedTitle);
      const closeTitleMatch = normalizedTitles.some((normalizedTitle) =>
        resultTitleText.includes(normalizedTitle) || normalizedTitle.includes(resultTitleText),
      );
      let score = bestTitleMatch.titleMatches * 18 + bestArtistMatches * 26;
      if (exactTitleMatch) {
        score += 90;
      } else if (closeTitleMatch) {
        score += 45;
      }
      if (hasStrongArtistMatch) {
        score += 42;
      } else if (artistTokenSets.length) {
        score -= exactTitleMatch ? 8 : 24;
      }
      if (kind === 'song' && result.kind === 'song') {
        score += 8;
      }
      if (kind === 'album' && result.wrapperType === 'collection') {
        score += 8;
      }
      if (audioPreviewUrl) {
        score += 4;
      }
      if (/\b(live|karaoke|tribute|cover|instrumental|mixed|dj mix|demo)\b/.test(`${resultTitleText} ${resultCollectionText}`)) {
        score -= /\b(live|karaoke|tribute|cover|instrumental|mixed|dj mix|demo)\b/.test(normalizedTitles.join(' ')) ? 0 : 28;
      }
      if (/\b(definitive|number 1|greatest hits|essential|best of|anthology|collection)\b/.test(resultCollectionText)) {
        score += exactTitleMatch ? 5 : 0;
      }
      return { artwork, audioPreviewUrl, score };
    })
    .filter((item) => item.artwork && item.score >= (artistHints.length ? 72 : 82))
    .sort((left, right) => right.score - left.score);
}

async function findAppleMusicPreviewFallback(options: {
  titleCandidates: string[];
  artistHints: string[];
  kind: 'song' | 'album';
  existingSearchTerms: string[];
}): Promise<string> {
  const fallbackTerms = buildAppleMusicSearchTerms(options.titleCandidates, options.artistHints)
    .concat(options.titleCandidates)
    .map((term) => term.replace(/\s+/g, ' ').trim().slice(0, 180))
    .filter((term) => term.length >= 2)
    .filter((term, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === term.toLowerCase()) === index)
    .slice(0, 4);
  const countries = ['CA', 'GB', 'AU', 'NZ'];
  for (const country of countries) {
    try {
      const responses = await Promise.all(fallbackTerms.map(async (searchTerm) => {
        const searchUrl = new URL('https://itunes.apple.com/search');
        searchUrl.searchParams.set('term', searchTerm);
        searchUrl.searchParams.set('media', 'music');
        searchUrl.searchParams.set('entity', options.kind === 'song' ? 'song' : 'album');
        searchUrl.searchParams.set('country', country);
        searchUrl.searchParams.set('limit', '25');
        return await fetchJson<AppleMusicSearchResponse>(searchUrl.toString());
      }));
      const scored = scoreAppleMusicMediaResults(
        responses.flatMap((data) => data.results ?? []),
        options.titleCandidates,
        options.artistHints,
        options.kind,
      );
      const preview = scored.find((item) => item.audioPreviewUrl)?.audioPreviewUrl;
      if (preview) {
        return preview;
      }
    } catch {
      // Storefront fallback is best-effort; the main lookup already logged durable failures.
    }
  }
  return '';
}

function buildAppleMusicArtistHints(
  card: GeneratedBoardWizardCard | BoardWizardCurrentCard,
  searchContext: string,
): string[] {
  const values = [
    extractBoardWizardCreatorHint(searchContext),
    extractBoardWizardCreatorHint(`${card.image_query} ${Array.isArray(card.tags) ? card.tags.join(' ') : ''}`),
    extractBoardWizardCreatorHint(`${card.subtitle} ${'notes' in card ? card.notes : ''}`),
  ];
  return values
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter((value) => value && !isGenericBoardWizardCreatorHint(value))
    .filter((value, index, all) => all.findIndex((candidate) => normalizeMusicArtworkText(candidate) === normalizeMusicArtworkText(value)) === index)
    .slice(0, 3);
}

function buildAppleMusicTitleCandidates(title: string, imageQuery = ''): string[] {
  const values = [
    title,
    imageQuery,
    ...[title, imageQuery].flatMap((value) => {
      const compact = textFromUnknown(value)
        .replace(/\b(?:official|song|single|track|cover art|album art|audio preview|preview)\b/gi, ' ')
        .replace(/\b(?:19|20)\d{2}\b/g, ' ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/^[\s#\d.)-]+/, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const segments = compact
        .split(/\s+[-–—:|]\s+/)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length >= 2);
      return [compact, segments[0] ?? '', segments.find((segment) => musicArtworkTokens(segment).length <= 6) ?? ''];
    }),
  ];
  return values
    .map((value) => textFromUnknown(value).replace(/\s+/g, ' ').trim())
    .filter((value) => value.length >= 2 && musicArtworkTokens(value).length > 0)
    .filter((value, index, all) => all.findIndex((candidate) => normalizeMusicArtworkText(candidate) === normalizeMusicArtworkText(value)) === index)
    .slice(0, 5);
}

function buildAppleMusicSearchTerms(titleCandidates: string[], artistHints: string[]): string[] {
  const primaryTitle = titleCandidates[0] ?? '';
  const compactTitle = titleCandidates.find((candidate) => musicArtworkTokens(candidate).length <= 6) ?? primaryTitle;
  const primaryArtistHint = artistHints[0] ?? '';
  return [
    [compactTitle, primaryArtistHint].filter(Boolean).join(' '),
    [primaryTitle, primaryArtistHint].filter(Boolean).join(' '),
    ...artistHints.slice(1).map((artistHint) => [compactTitle, artistHint].filter(Boolean).join(' ')),
    compactTitle,
    primaryTitle,
  ]
    .map((term) => term.replace(/\s+/g, ' ').trim().slice(0, 180))
    .filter((term) => term.length >= 2)
    .filter((term, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === term.toLowerCase()) === index)
    .slice(0, 4);
}

function normalizeMusicArtworkText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*(remaster|remastered|radio edit|single version|deluxe|explicit|clean|mono|stereo)[^)]*\)/gi, ' ')
    .replace(/\b(feat|featuring|ft|remaster|remastered|version|single|radio|edit|explicit|clean|mono|stereo)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function musicArtworkTokens(value: string): string[] {
  return normalizeMusicArtworkText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !['the', 'and', 'for', 'with', 'song', 'album', 'cover', 'art', 'official'].includes(token))
    .slice(0, 6);
}

type BoardWizardWebImageSearchOptions = {
  imageType?: 'photo' | 'any';
  entityName?: string;
  requireFoodContext?: boolean;
  fictionalCharacterCard?: GeneratedBoardWizardCard;
  searchContext?: string;
};

async function findGoogleCustomSearchImageForBoardWizard(
  query: string,
  apiKey: string,
  options: BoardWizardWebImageSearchOptions = {},
): Promise<string> {
  const cx = googleCustomSearchCx.trim();
  if (!cx || Date.now() < googleCustomSearchUnavailableUntil) {
    return '';
  }

  try {
    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
    searchUrl.searchParams.set('key', apiKey);
    searchUrl.searchParams.set('cx', cx);
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('searchType', 'image');
    searchUrl.searchParams.set('safe', 'active');
    if (options.imageType !== 'any') {
      searchUrl.searchParams.set('imgType', 'photo');
    }
    searchUrl.searchParams.set('num', options.fictionalCharacterCard ? '8' : '4');
    const response = await fetch(searchUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'LivingWiki/1.0 board-wizard (https://livingwiki.com)',
      },
      signal: AbortSignal.timeout(3500),
    });
    const search = await response.json() as GoogleCustomSearchImageResponse;
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        googleCustomSearchUnavailableUntil = Date.now() + (response.status === 403 ? 60 * 60 * 1000 : 60 * 1000);
      }
      logger.warn('Board wizard Google image search failed.', {
        query,
        status: response.status,
        error: search.error?.message,
      });
      return '';
    }
    if (search.error?.message) {
      logger.warn('Board wizard Google image search failed.', {
        query,
        error: search.error.message,
      });
      return '';
    }
    const items = options.fictionalCharacterCard
      ? rankGoogleFictionalCharacterImageResultsForBoardWizard(
          search.items ?? [],
          options.fictionalCharacterCard,
          options.searchContext ?? '',
        )
      : options.entityName
      ? rankGoogleImageResultsForBoardWizard(search.items ?? [], options.entityName)
      : search.items ?? [];
    for (const item of items) {
      if (options.requireFoodContext && !isPlausibleBoardWizardFoodImageResult(item)) {
        continue;
      }
      const link = textFromUnknown(item.link);
      if (link && canTryCoverImageUrl(link)) {
        return link;
      }
      const thumbnail = textFromUnknown(item.image?.thumbnailLink);
      if (thumbnail && canTryCoverImageUrl(thumbnail)) {
        return thumbnail;
      }
    }
  } catch (error) {
    logger.warn('Board wizard Google image search failed.', {
      query,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
  return '';
}

function isPlausibleBoardWizardFoodImageResult(
  item: NonNullable<GoogleCustomSearchImageResponse['items']>[number],
): boolean {
  const context = [
    item.title,
    item.snippet,
    item.displayLink,
    item.image?.contextLink,
    item.link,
  ].map((value) => textFromUnknown(value).toLowerCase()).join(' ');
  return isPlausibleBoardWizardFoodImageContext(context);
}

function rankGoogleImageResultsForBoardWizard(
  items: NonNullable<GoogleCustomSearchImageResponse['items']>,
  entityName: string,
): NonNullable<GoogleCustomSearchImageResponse['items']> {
  const entityTokens = meaningfulBoardWizardTokens(entityName)
    .filter((token) => !['official', 'photo', 'image', 'picture'].includes(token))
    .slice(0, 5);
  if (!entityTokens.length) return [];
  const requiredMatches = entityTokens.length <= 2 ? entityTokens.length : Math.max(2, Math.ceil(entityTokens.length * 0.67));
  return items
    .map((item, index) => {
      const haystack = [
        item.title,
        item.snippet,
        item.displayLink,
        item.image?.contextLink,
        item.link,
      ].map((value) => textFromUnknown(value).toLowerCase()).join(' ');
      const matches = entityTokens.filter((token) => haystack.includes(token)).length;
      const url = textFromUnknown(item.link).toLowerCase();
      const unsafeAsset = /\b(?:sprite|placeholder|avatar-default|favicon|loading)[-_.]/.test(url)
        || /\.(?:svg|gif)(?:\?|$)/.test(url);
      return {
        item,
        matches,
        score: matches * 30 - index * 2 - (unsafeAsset ? 100 : 0),
      };
    })
    .filter((result) => result.matches >= requiredMatches && result.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((result) => result.item);
}

function rankGoogleFictionalCharacterImageResultsForBoardWizard(
  items: NonNullable<GoogleCustomSearchImageResponse['items']>,
  card: GeneratedBoardWizardCard,
  searchContext: string,
): NonNullable<GoogleCustomSearchImageResponse['items']> {
  return items
    .map((item, index) => {
      const context = [
        item.title,
        item.snippet,
        item.displayLink,
        item.image?.contextLink,
        item.link,
      ].map((value) => textFromUnknown(value)).join(' ');
      const url = textFromUnknown(item.link).toLowerCase();
      const unsafeAsset = /\b(?:sprite|placeholder|avatar-default|favicon|loading)[-_.]/.test(url)
        || /\.(?:svg|gif)(?:\?|$)/.test(url);
      const score = unsafeAsset
        ? 0
        : scoreBoardWizardFictionalCharacterImageResult(card, searchContext, context, index);
      return { item, score };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((result) => result.item);
}

async function findWikimediaCommonsImagesForBoardCard(
  query: string,
  limit: number,
): Promise<Array<Omit<BoardCardImageSearchResult, 'token'>>> {
  try {
    const searchUrl = new URL('https://commons.wikimedia.org/w/api.php');
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('formatversion', '2');
    searchUrl.searchParams.set('generator', 'search');
    searchUrl.searchParams.set('gsrsearch', query);
    searchUrl.searchParams.set('gsrnamespace', '6');
    searchUrl.searchParams.set('gsrlimit', String(Math.max(8, Math.min(30, limit * 3))));
    searchUrl.searchParams.set('prop', 'imageinfo');
    searchUrl.searchParams.set('iiprop', 'url|mime|extmetadata');
    searchUrl.searchParams.set('iiurlwidth', '1400');
    const response = await fetch(searchUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'LivingWiki/1.0 card-photo-search (https://livingwiki.com)',
      },
      signal: AbortSignal.timeout(10000),
    });
    const search = await response.json() as WikimediaCommonsImageSearchResponse;
    if (!response.ok || search.error?.info) {
      logger.warn('Card editor Wikimedia Commons search failed.', {
        query,
        status: response.status,
        error: search.error?.info,
      });
      throw new HttpsError('unavailable', 'Photo search is temporarily unavailable.');
    }
    const seen = new Set<string>();
    return Object.values(search.query?.pages ?? {})
      .map((page): Omit<BoardCardImageSearchResult, 'token'> | null => {
        const imageInfo = page.imageinfo?.[0];
        const mime = textFromUnknown(imageInfo?.mime).toLowerCase();
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
          return null;
        }
        const imageUrl = safeBoardCardRemoteImageUrl(imageInfo?.thumburl || imageInfo?.url);
        const thumbnailUrl = safeBoardCardRemoteImageUrl(imageInfo?.thumburl) || imageUrl;
        if (!imageUrl || seen.has(imageUrl)) {
          return null;
        }
        seen.add(imageUrl);
        const sourceUrl = safeBoardCardSourceUrl(imageInfo?.descriptionurl) || 'https://commons.wikimedia.org/';
        const license = textFromUnknown(imageInfo?.extmetadata?.LicenseShortName?.value)
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .slice(0, 35);
        const rawTitle = textFromUnknown(page.title).replace(/^File:/i, '').replace(/\.[^.]+$/, '');
        return {
          imageUrl,
          thumbnailUrl: thumbnailUrl || imageUrl,
          sourceUrl,
          sourceLabel: `Wikimedia Commons${license ? ` · ${license}` : ''}`.slice(0, 80),
          title: rawTitle.replace(/[_\s]+/g, ' ').slice(0, 140) || query,
        };
      })
      .filter((item): item is Omit<BoardCardImageSearchResult, 'token'> => !!item)
      .slice(0, limit);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.warn('Card editor Wikimedia Commons search failed.', {
      query,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw new HttpsError('unavailable', 'Photo search is temporarily unavailable.');
  }
}

function boardCardImageIdentifier(value: unknown, field: string): string {
  const id = stringOrEmpty(value).slice(0, 128);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) {
    throw new HttpsError('invalid-argument', `${field} is invalid.`);
  }
  return id;
}

function optionalBoardCardImageIdentifier(value: unknown): string {
  const id = stringOrEmpty(value);
  return id ? boardCardImageIdentifier(id, 'boardId') : '';
}

async function assertCanEditBoardImages(userId: string, boardId: string): Promise<void> {
  const snapshot = await db.collection('boards').doc(boardId).get();
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Board not found.');
  }
  if (textFromUnknown(snapshot.data()?.owner_user_id) !== userId) {
    throw new HttpsError('permission-denied', 'Only the board owner can change card images.');
  }
}

function boardCardImageSearchToken(
  userId: string,
  query: string,
  result: Omit<BoardCardImageSearchResult, 'token'>,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(boardCardImageSearchTokenPayload(userId, query, result))
    .digest('hex');
}

function boardCardImageSearchTokenMatches(
  userId: string,
  query: string,
  result: Omit<BoardCardImageSearchResult, 'token'>,
  token: string,
  secret: string,
): boolean {
  if (!secret || !/^[a-f0-9]{64}$/i.test(token)) {
    return false;
  }
  const expected = boardCardImageSearchToken(userId, query, result, secret);
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'));
}

function boardCardImageSearchTokenPayload(
  userId: string,
  query: string,
  result: Omit<BoardCardImageSearchResult, 'token'>,
): string {
  return [userId, query, result.imageUrl, result.thumbnailUrl, result.sourceUrl, result.sourceLabel, result.title].join('\n');
}

function boardCardImageSearchResultFromInput(value: unknown): Omit<BoardCardImageSearchResult, 'token'> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const imageUrl = safeBoardCardRemoteImageUrl(data.imageUrl);
  const thumbnailUrl = safeBoardCardRemoteImageUrl(data.thumbnailUrl);
  if (!imageUrl || !thumbnailUrl) {
    return null;
  }
  return {
    imageUrl,
    thumbnailUrl,
    sourceUrl: safeBoardCardSourceUrl(data.sourceUrl),
    sourceLabel: stringOrEmpty(data.sourceLabel).replace(/\s+/g, ' ').slice(0, 80),
    title: stringOrEmpty(data.title).replace(/\s+/g, ' ').slice(0, 140),
  };
}

function safeBoardCardRemoteImageUrl(value: unknown): string {
  const url = safeBoardCardSourceUrl(value);
  if (!url || !canTryCoverImageUrl(url)) {
    return '';
  }
  return url;
}

function safeBoardCardSourceUrl(value: unknown): string {
  const raw = stringOrEmpty(value).slice(0, 2000);
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || isBlockedBoardCardImageHost(url.hostname)) {
      return '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

function isBlockedBoardCardImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost'
    || host === '0.0.0.0'
    || host === '::1'
    || host === 'metadata.google.internal'
    || host.endsWith('.internal')
    || host.endsWith('.local')
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
    || /^192\.168\./.test(host)
    || /^169\.254\./.test(host)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    || /^(?:fc|fd)[0-9a-f]{2}:/.test(host)
    || /^fe[89ab][0-9a-f]:/.test(host)
    || /^::ffff:(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);
}

async function fetchBoardCardImageAsset(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  let currentUrl = safeBoardCardRemoteImageUrl(url);
  if (!currentUrl) {
    throw new Error('Unsupported image URL.');
  }
  let response: Response | null = null;
  for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
    response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: {
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
        'User-Agent': 'LivingWiki/1.0 card-image-import (https://livingwiki.com)',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (response.status < 300 || response.status >= 400) {
      break;
    }
    const location = response.headers.get('location');
    const nextUrl = location ? safeBoardCardRemoteImageUrl(new URL(location, currentUrl).toString()) : '';
    if (!nextUrl || redirectCount === 2) {
      throw new Error('Image redirected to an unsupported location.');
    }
    currentUrl = nextUrl;
  }
  if (!response) {
    throw new Error('Image download failed.');
  }
  if (!response.ok) {
    throw new Error(`Image download failed with ${response.status}.`);
  }
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (!contentType || !imageExtensionForContentType(contentType)) {
    throw new Error('Search result is not a supported image type.');
  }
  const maxBytes = 4 * 1024 * 1024;
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error('Search result is too large to import.');
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 2048 || buffer.length > maxBytes) {
    throw new Error('Search result image size is unsupported.');
  }
  return { buffer, contentType };
}

async function fetchGooglePlaceDetailsForBoardWizard(
  placeId: string,
  apiKey: string,
): Promise<GooglePlaceDetailsResponse['result'] | null> {
  const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  detailsUrl.searchParams.set('place_id', placeId);
  detailsUrl.searchParams.set('fields', 'place_id,name,formatted_address,url,rating,user_ratings_total,types,photos,geometry');
  detailsUrl.searchParams.set('key', apiKey);
  const details = await fetchJson<GooglePlaceDetailsResponse>(detailsUrl.toString());
  if (details.status && details.status !== 'OK') {
    logger.warn('Board wizard Google Place Details failed.', {
      placeId,
      status: details.status,
      error: details.error_message,
    });
    return null;
  }
  return details.result ?? null;
}

async function enrichBoardWizardCardWithReferenceImage(card: GeneratedBoardWizardCard): Promise<GeneratedBoardWizardCard> {
  if (card.imageUrl) {
    return card;
  }

  const query = textFromUnknown(card.image_query || card.title).slice(0, 140);
  if (query.length < 2) {
    return card;
  }

  try {
    const imageUrl = await findReferenceImageForBoardWizard(query);
    return imageUrl ? { ...card, imageUrl } : card;
  } catch (error) {
    logger.warn('Board wizard reference image lookup failed.', {
      title: card.title,
      query,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return card;
  }
}

async function findWikipediaFictionalCharacterSummaryImage(
  card: GeneratedBoardWizardCard,
  searchContext: string,
): Promise<string> {
  const cacheKey = `fictional-character:${buildBoardWizardReferenceImageQuery(card, searchContext)}`;
  const cached = getCachedWikipediaImage(cacheKey);
  if (cached !== null) return cached;

  const titles = buildBoardWizardFictionalCharacterWikipediaTitles(card);
  for (const title of titles) {
    try {
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
      const summary = await fetchJson<WikipediaPageSummaryResponse>(summaryUrl);
      if (summary.type && summary.type !== 'standard') continue;
      const imageUrl = textFromUnknown(summary.thumbnail?.source || summary.originalimage?.source);
      if (!imageUrl || !canTryCoverImageUrl(imageUrl)) continue;
      const resultContext = [summary.title, summary.description, summary.extract].map(textFromUnknown).join(' ');
      if (scoreBoardWizardFictionalCharacterImageResult(card, searchContext, resultContext) <= 0) continue;
      setCachedWikipediaImage(cacheKey, imageUrl);
      logger.info('Board wizard fictional character summary image resolved.', {
        entity: boardWizardImageEntityName(card),
        requestedTitle: title,
        matchedTitle: textFromUnknown(summary.title),
      });
      return imageUrl;
    } catch {
      // A missing qualified title is expected; continue through aliases and
      // then the context-validated plain character title.
    }
  }
  setCachedWikipediaImage(cacheKey, '');
  return '';
}

async function findReferenceImageForBoardWizard(query: string): Promise<string> {
  const exactImage = await findExactWikipediaImageForBoardWizard(query);
  if (exactImage) {
    return exactImage;
  }

  const exactMediaImage = await findExactWikipediaMediaFileImageForBoardWizard(query);
  if (exactMediaImage) {
    return exactMediaImage;
  }

  const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
  searchUrl.searchParams.set('action', 'query');
  searchUrl.searchParams.set('list', 'search');
  searchUrl.searchParams.set('format', 'json');
  searchUrl.searchParams.set('srlimit', '4');
  searchUrl.searchParams.set('srsearch', buildWikipediaSearchQueryForBoardWizard(query));

  const search = await fetchJson<WikipediaSearchResponse>(searchUrl.toString());
  const confidentSearchResults = (search.query?.search ?? [])
    .filter((result) => isConfidentWikipediaPageTitleMatch(query, textFromUnknown(result.title)));
  const pageIds = confidentSearchResults
    .map((result) => result.pageid)
    .filter((pageId): pageId is number => typeof pageId === 'number')
    .slice(0, 4);
  if (!pageIds.length) {
    return '';
  }

  const searchMediaImage = await findWikipediaPageMediaFileImageForBoardWizard(query, pageIds);
  if (searchMediaImage) {
    return searchMediaImage;
  }

  const imageUrl = new URL('https://en.wikipedia.org/w/api.php');
  imageUrl.searchParams.set('action', 'query');
  imageUrl.searchParams.set('format', 'json');
  imageUrl.searchParams.set('prop', 'pageimages');
  imageUrl.searchParams.set('piprop', 'original|thumbnail');
  imageUrl.searchParams.set('pithumbsize', '900');
  imageUrl.searchParams.set('pageids', pageIds.join('|'));

  const pages = await fetchJson<WikipediaPageImagesResponse>(imageUrl.toString());
  for (const page of Object.values(pages.query?.pages ?? {})) {
    const source = page.thumbnail?.source || page.original?.source || '';
    if (source && canTryCoverImageUrl(source)) {
      return source;
    }
  }

  return '';
}

async function findExactWikipediaMediaFileImageForBoardWizard(query: string): Promise<string> {
  const titles = exactWikipediaTitleCandidates(query);
  if (!titles.length) {
    return '';
  }

  const mediaUrl = new URL('https://en.wikipedia.org/w/api.php');
  mediaUrl.searchParams.set('action', 'query');
  mediaUrl.searchParams.set('format', 'json');
  mediaUrl.searchParams.set('redirects', '1');
  mediaUrl.searchParams.set('prop', 'images');
  mediaUrl.searchParams.set('imlimit', '50');
  mediaUrl.searchParams.set('titles', titles.join('|'));

  const media = await fetchJson<WikipediaPageMediaResponse>(mediaUrl.toString());
  const fileTitles = Object.values(media.query?.pages ?? {})
    .flatMap((page) => page.images ?? [])
    .map((image) => textFromUnknown(image.title))
    .filter((title) => title.startsWith('File:'));
  const bestFiles = fileTitles
    .map((title) => ({ title, score: scoreWikipediaMediaFileTitle(title, query, titles) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((item) => item.title);
  if (!bestFiles.length) {
    return '';
  }

  const imageUrl = new URL('https://en.wikipedia.org/w/api.php');
  imageUrl.searchParams.set('action', 'query');
  imageUrl.searchParams.set('format', 'json');
  imageUrl.searchParams.set('prop', 'imageinfo');
  imageUrl.searchParams.set('iiprop', 'url|mime|size');
  imageUrl.searchParams.set('iiurlwidth', '1200');
  imageUrl.searchParams.set('titles', bestFiles.join('|'));

  const data = await fetchJson<WikimediaCommonsImageResponse>(imageUrl.toString());
  const pages = Object.values(data.query?.pages ?? {});
  const orderedPages = bestFiles
    .map((fileTitle) => pages.find((page) => normalizeWikipediaTitleCandidate(page.title ?? '') === normalizeWikipediaTitleCandidate(fileTitle)))
    .filter((page): page is NonNullable<(typeof pages)[number]> => !!page);
  for (const page of orderedPages) {
    const image = page.imageinfo?.[0];
    const mime = image?.mime?.toLowerCase() ?? '';
    if (mime && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime)) {
      continue;
    }
    for (const source of [image?.thumburl, image?.url]) {
      if (source && canTryCoverImageUrl(source)) {
        return source;
      }
    }
  }

  return '';
}

async function findWikipediaPageMediaFileImageForBoardWizard(query: string, pageIds: number[]): Promise<string> {
  if (!pageIds.length) {
    return '';
  }

  const mediaUrl = new URL('https://en.wikipedia.org/w/api.php');
  mediaUrl.searchParams.set('action', 'query');
  mediaUrl.searchParams.set('format', 'json');
  mediaUrl.searchParams.set('prop', 'images');
  mediaUrl.searchParams.set('imlimit', '50');
  mediaUrl.searchParams.set('pageids', pageIds.slice(0, 4).join('|'));

  const media = await fetchJson<WikipediaPageMediaResponse>(mediaUrl.toString());
  const fileTitles = Object.values(media.query?.pages ?? {})
    .flatMap((page) => page.images ?? [])
    .map((image) => textFromUnknown(image.title))
    .filter((title) => title.startsWith('File:'));
  const scoringTitles = exactWikipediaTitleCandidates(query);
  const bestFiles = fileTitles
    .map((title) => ({ title, score: scoreWikipediaMediaFileTitle(title, query, scoringTitles.length ? scoringTitles : [query]) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((item) => item.title);
  if (!bestFiles.length) {
    return '';
  }

  const imageUrl = new URL('https://en.wikipedia.org/w/api.php');
  imageUrl.searchParams.set('action', 'query');
  imageUrl.searchParams.set('format', 'json');
  imageUrl.searchParams.set('prop', 'imageinfo');
  imageUrl.searchParams.set('iiprop', 'url|mime|size');
  imageUrl.searchParams.set('iiurlwidth', '1200');
  imageUrl.searchParams.set('titles', bestFiles.join('|'));

  const data = await fetchJson<WikimediaCommonsImageResponse>(imageUrl.toString());
  const pages = Object.values(data.query?.pages ?? {});
  const orderedPages = bestFiles
    .map((fileTitle) => pages.find((page) => normalizeWikipediaTitleCandidate(page.title ?? '') === normalizeWikipediaTitleCandidate(fileTitle)))
    .filter((page): page is NonNullable<(typeof pages)[number]> => !!page);
  for (const page of orderedPages) {
    const image = page.imageinfo?.[0];
    const mime = image?.mime?.toLowerCase() ?? '';
    if (mime && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime)) {
      continue;
    }
    for (const source of [image?.thumburl, image?.url]) {
      if (source && canTryCoverImageUrl(source)) {
        return source;
      }
    }
  }

  return '';
}

function scoreWikipediaMediaFileTitle(fileTitle: string, query: string, titleCandidates: string[]): number {
  const normalizedFile = normalizeWikipediaTitleCandidate(fileTitle.replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, ' '));
  const normalizedQuery = normalizeWikipediaTitleCandidate(query);
  const isFilm = /\b(movie|film|poster)\b/i.test(query);
  const isSongOrAlbum = /\b(song|single|album|cover art|album cover)\b/i.test(query);
  const isBook = /\b(book|novel|book cover)\b/i.test(query);
  const isTv = /\b(tv|television|series)\b/i.test(query);
  const isGame = /\b(video game|game|cover art)\b/i.test(query);
  const isPerson = /\b(portrait|person|people|biography|born|died|politician|leader|author|artist|scientist|athlete|actor|musician|composer|singer|president)\b/i.test(query);
  let score = 0;

  if (/\b(poster|cover|cover art|album|single|key art|box art|book cover|dvd|blu ray)\b/i.test(normalizedFile)) {
    score += 45;
  }
  if (isFilm && /\b(poster|film poster|movie poster|key art)\b/i.test(normalizedFile)) {
    score += 80;
  }
  if (isSongOrAlbum && /\b(cover|cover art|album|single)\b/i.test(normalizedFile)) {
    score += 80;
  }
  if (isBook && /\b(cover|book cover|novel)\b/i.test(normalizedFile)) {
    score += 70;
  }
  if (isTv && /\b(poster|title card|key art)\b/i.test(normalizedFile)) {
    score += 60;
  }
  if (isGame && /\b(cover|box art|cover art)\b/i.test(normalizedFile)) {
    score += 70;
  }

  const titleTokens = titleCandidates
    .flatMap((title) => meaningfulBoardWizardTokens(title.replace(/\([^)]*\)/g, ' ')))
    .filter((token) => token.length >= 3 && !['film', 'movie', 'song', 'album', 'book', 'novel', 'official', 'poster', 'cover'].includes(token));
  const uniqueTokens = Array.from(new Set(titleTokens)).slice(0, 8);
  const matchedTokens = uniqueTokens.filter((token) => normalizedFile.includes(token));
  const requiredTokens = requestedEntityTokensForWikipediaImage(query, titleCandidates);
  const matchedRequiredTokens = requiredTokens.filter((token) => normalizedFile.includes(token));
  const requiredMatchCount = requiredTokens.length <= 2 ? requiredTokens.length : Math.min(2, requiredTokens.length);
  if (requiredMatchCount > 0 && matchedRequiredTokens.length < requiredMatchCount) {
    return 0;
  }
  score += matchedTokens.length * 8;
  if (uniqueTokens.length && matchedTokens.length >= Math.min(3, uniqueTokens.length)) {
    score += 25;
  }

  if (normalizedQuery.includes(normalizedFile) || normalizedFile.includes(normalizedQuery.replace(/\b(official|poster|cover|art|movie|film|song|album|book)\b/g, '').replace(/\s+/g, ' ').trim())) {
    score += 12;
  }
  if (isPerson && /\b(headshot|portrait|official portrait|photograph|photo)\b/i.test(normalizedFile)) {
    score += 55;
  }
  if (!isPerson && /\b(cannes|festival|premiere|red carpet|cropped|actor|actress|director|headshot|portrait)\b/i.test(normalizedFile) && !/\bposter|cover|key art|box art\b/i.test(normalizedFile)) {
    score -= 35;
  }
  if (/\b(flag|logo|icon|edit|svg|map)\b/i.test(normalizedFile)) {
    score -= 80;
  }
  return score;
}

function requestedEntityTokensForWikipediaImage(query: string, titleCandidates: string[]): string[] {
  const candidates = titleCandidates.length ? titleCandidates : [query];
  const bestTitle = candidates
    .map((title) => title
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b(18\d{2}|19\d{2}|20\d{2})\b/g, ' ')
      .replace(/\b(official|movie|film|poster|song|single|album|book|novel|tv|television|series|video game|game|cover|art|portrait|photo|image|picture)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((title) => title.length >= 2)
    .sort((left, right) => meaningfulBoardWizardTokens(left).length - meaningfulBoardWizardTokens(right).length)[0] ?? query;
  return meaningfulBoardWizardTokens(bestTitle)
    .filter((token) => token.length >= 3 && !['the', 'and', 'official', 'movie', 'film', 'poster', 'cover', 'art'].includes(token))
    .slice(0, 5);
}

function buildWikipediaSearchQueryForBoardWizard(query: string): string {
  const yearHint = extractBoardWizardYearHint(query);
  const baseTitle = exactWikipediaTitleCandidates(query)[0] ?? query;
  const title = baseTitle
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(18\d{2}|19\d{2}|20\d{2})\b/g, ' ')
    .replace(/\b(official|movie|film|poster|song|single|album|book|novel|tv|television|series|video game|game|cover|art|portrait|photo|image|picture)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const kind = /\b(movie|film|poster)\b/i.test(query)
    ? 'film'
    : /\b(song|single)\b/i.test(query)
      ? 'song'
      : /\b(album|lp|ep)\b/i.test(query)
        ? 'album'
        : /\b(book|novel)\b/i.test(query)
          ? 'book'
          : /\b(tv|television|series)\b/i.test(query)
            ? 'television'
            : /\b(video game|game)\b/i.test(query)
              ? 'video game'
              : '';
  return [title || query, yearHint && !(title || query).includes(yearHint) ? yearHint : '', kind]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

async function findExactWikipediaImageForBoardWizard(query: string): Promise<string> {
  const cached = getCachedWikipediaImage(query);
  if (cached !== null) {
    return cached;
  }
  const titles = exactWikipediaTitleCandidates(query);
  if (!titles.length) {
    return '';
  }

  const imageUrl = new URL('https://en.wikipedia.org/w/api.php');
  imageUrl.searchParams.set('action', 'query');
  imageUrl.searchParams.set('format', 'json');
  imageUrl.searchParams.set('redirects', '1');
  imageUrl.searchParams.set('prop', 'pageimages');
  imageUrl.searchParams.set('piprop', 'original|thumbnail');
  imageUrl.searchParams.set('pithumbsize', '900');
  imageUrl.searchParams.set('titles', titles.join('|'));

  const pages = await fetchJson<WikipediaPageImagesResponse>(imageUrl.toString());
  const normalizedTitles = new Set(titles.map((title) => normalizeWikipediaTitleCandidate(title)));
  const exactPages = Object.values(pages.query?.pages ?? {}).filter((page) =>
    normalizedTitles.has(normalizeWikipediaTitleCandidate(page.title ?? ''))
      || isConfidentWikipediaPageTitleMatch(query, textFromUnknown(page.title)),
  );
  for (const page of exactPages) {
    const source = page.thumbnail?.source || page.original?.source || '';
    if (source && canTryCoverImageUrl(source)) {
      setCachedWikipediaImage(query, source);
      return source;
    }
  }
  setCachedWikipediaImage(query, '');
  return '';
}

async function findBatchExactWikipediaImagesForBoardWizard(
  cards: GeneratedBoardWizardCard[],
  searchContext: string,
): Promise<Map<number, string>> {
  const images = new Map<number, string>();
  const pending: Array<{ index: number; query: string; titles: string[] }> = [];
  cards.forEach((card, index) => {
    if (
      card.imageUrl
      || isBoardWizardMenuActionCard(card)
      || isBoardWizardFictionalCharacter(card)
      || !shouldUseReferenceImageBeforePlaces(card, searchContext)
    ) {
      return;
    }
    const query = buildBoardWizardReferenceImageQuery(card, searchContext);
    const cached = getCachedWikipediaImage(query);
    if (cached) {
      images.set(index, cached);
      return;
    }
    if (cached === '') {
      return;
    }
    const entityName = stripBoardWizardListPrefix(textFromUnknown(card.entity_name || card.title));
    const titles = [...exactWikipediaTitleCandidates(query), ...exactWikipediaTitleCandidates(entityName)]
      .filter((title, titleIndex, all) => all.findIndex((candidate) =>
        normalizeWikipediaTitleCandidate(candidate) === normalizeWikipediaTitleCandidate(title)) === titleIndex)
      .slice(0, 6);
    if (query.length >= 2 && titles.length) {
      pending.push({ index, query, titles });
    }
  });

  const requestedTitles = pending.flatMap((entry) => entry.titles)
    .filter((title, index, all) => all.findIndex((candidate) =>
      normalizeWikipediaTitleCandidate(candidate) === normalizeWikipediaTitleCandidate(title)) === index);
  for (let offset = 0; offset < requestedTitles.length; offset += 40) {
    const chunk = requestedTitles.slice(offset, offset + 40);
    const imageUrl = new URL('https://en.wikipedia.org/w/api.php');
    imageUrl.searchParams.set('action', 'query');
    imageUrl.searchParams.set('format', 'json');
    imageUrl.searchParams.set('redirects', '1');
    imageUrl.searchParams.set('prop', 'pageimages|pageterms');
    imageUrl.searchParams.set('piprop', 'original|thumbnail');
    imageUrl.searchParams.set('pithumbsize', '900');
    imageUrl.searchParams.set('wbptterms', 'description');
    imageUrl.searchParams.set('titles', chunk.join('|'));
    try {
      const data = await fetchJson<WikipediaBatchPageImagesResponse>(imageUrl.toString());
      for (const page of Object.values(data.query?.pages ?? {})) {
        const source = page.thumbnail?.source || page.original?.source || '';
        if (!source || !canTryCoverImageUrl(source)) {
          continue;
        }
        const matches = pending
          .filter((entry) => !images.has(entry.index))
          .map((entry) => ({
            entry,
            score: wikipediaPageTitleMatchScore(entry.query, textFromUnknown(page.title), entry.titles),
          }))
          .filter((match) => match.score >= 80)
          .sort((left, right) => right.score - left.score);
        const best = matches[0]?.entry;
        if (best) {
          images.set(best.index, source);
          setCachedWikipediaImage(best.query, source);
        }
      }
    } catch (error) {
      logger.warn('Board wizard batch Wikipedia image lookup failed.', {
        requestedTitleCount: chunk.length,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return images;
}

function getCachedWikipediaImage(query: string): string | null {
  const key = normalizeWikipediaTitleCandidate(query);
  const cached = wikipediaImageCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    wikipediaImageCache.delete(key);
    return null;
  }
  return cached.imageUrl;
}

function setCachedWikipediaImage(query: string, imageUrl: string): void {
  const key = normalizeWikipediaTitleCandidate(query);
  if (!key) {
    return;
  }
  if (wikipediaImageCache.size >= WIKIPEDIA_IMAGE_CACHE_MAX_ENTRIES) {
    const oldestKey = wikipediaImageCache.keys().next().value as string | undefined;
    if (oldestKey) wikipediaImageCache.delete(oldestKey);
  }
  wikipediaImageCache.set(key, { imageUrl, expiresAt: Date.now() + WIKIPEDIA_IMAGE_CACHE_TTL_MS });
}

function isConfidentWikipediaPageTitleMatch(query: string, pageTitle: string): boolean {
  return wikipediaPageTitleMatchScore(query, pageTitle, exactWikipediaTitleCandidates(query)) >= 80;
}

function exactWikipediaTitleCandidates(query: string): string[] {
  const raw = stripBoardWizardListPrefix(query);
  const yearHint = extractBoardWizardYearHint(raw);
  const withoutDescriptors = raw
    .replace(/\b(official|public domain|photograph|photo|picture|image|poster|cover art|cover|portrait|biography|person|people|american|u\.s\.|us|united states|president|presidential|first lady|signer|founding father|historical figure)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const baseTitles = [withoutDescriptors, raw]
    // Preserve identity-bearing hyphens in names such as Star-Lord and
    // Spider-Man; only punctuation or a spaced dash starts a descriptor.
    .map(stripBoardWizardReferenceTitleDescriptor)
    .filter((title) => title.length >= 3 && title.length <= 80);
  const mediaTitles: string[] = [];
  for (const title of baseTitles) {
    const cleanedTitle = title
      .replace(/\b(movie|film|song|single|album|book|novel|tv|television|series|video game|game)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanedTitle || cleanedTitle.length < 3) {
      continue;
    }
    const cleanedWithoutYear = yearHint
      ? cleanedTitle.replace(new RegExp(`\\b${yearHint}\\b`, 'g'), ' ').replace(/\s+/g, ' ').trim()
      : cleanedTitle;
    if (cleanedWithoutYear.length >= 3) {
      mediaTitles.push(cleanedWithoutYear);
    }
    if (/\b(movie|film)\b/i.test(raw)) {
      if (yearHint && cleanedWithoutYear.length >= 3) {
        mediaTitles.push(`${cleanedWithoutYear} (${yearHint} film)`);
      }
      mediaTitles.push(`${cleanedWithoutYear || cleanedTitle} (film)`);
    }
    if (/\b(song|single)\b/i.test(raw)) {
      if (yearHint && cleanedWithoutYear.length >= 3) {
        mediaTitles.push(`${cleanedWithoutYear} (${yearHint} song)`);
      }
      mediaTitles.push(`${cleanedWithoutYear || cleanedTitle} (song)`);
    }
    if (/\b(album|lp|ep)\b/i.test(raw)) {
      if (yearHint && cleanedWithoutYear.length >= 3) {
        mediaTitles.push(`${cleanedWithoutYear} (${yearHint} album)`);
      }
      mediaTitles.push(`${cleanedWithoutYear || cleanedTitle} (album)`);
    }
    if (/\b(book|novel)\b/i.test(raw)) {
      if (yearHint && cleanedWithoutYear.length >= 3) {
        mediaTitles.push(`${cleanedWithoutYear} (${yearHint} book)`);
      }
      mediaTitles.push(`${cleanedWithoutYear || cleanedTitle}`);
      mediaTitles.push(`${cleanedWithoutYear || cleanedTitle} (novel)`);
    }
    if (/\b(tv|television|series)\b/i.test(raw)) {
      if (yearHint && cleanedWithoutYear.length >= 3) {
        mediaTitles.push(`${cleanedWithoutYear} (${yearHint} TV series)`);
      }
      mediaTitles.push(`${cleanedWithoutYear || cleanedTitle} (TV series)`);
    }
    if (/\b(video game|game)\b/i.test(raw)) {
      if (yearHint && cleanedWithoutYear.length >= 3) {
        mediaTitles.push(`${cleanedWithoutYear} (${yearHint} video game)`);
      }
      mediaTitles.push(`${cleanedWithoutYear || cleanedTitle} (video game)`);
    }
  }
  return [...mediaTitles, ...baseTitles]
    .flatMap((title) => wikipediaTitleCaseVariants(title))
    .filter((title) => title.length >= 3 && title.length <= 90)
    .filter((title, index, all) => all.indexOf(title) === index)
    .slice(0, 6);
}

function stripBoardWizardListPrefix(value: string): string {
  return value
    .replace(/^\s*(?:[#№]?\d{1,3}(?:st|nd|rd|th)?\s*(?:[.):\]-]|–|—)\s*|[-*•]\s+)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWikipediaTitleCandidate(value: string): string {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function wikipediaTitleCaseVariants(title: string): string[] {
  const variants = [title];
  const simplifiedMixedCase = title.replace(/\b[A-Z][a-z]+[A-Z][A-Za-z0-9']*\b/g, (word) => `${word.slice(0, 1)}${word.slice(1).toLowerCase()}`);
  if (simplifiedMixedCase !== title) {
    variants.push(simplifiedMixedCase);
  }
  return variants;
}

async function findCommonsReferenceImageForBoardWizard(
  queryOrCard: string | GeneratedBoardWizardCard,
  searchContext = '',
): Promise<string> {
  const card = typeof queryOrCard === 'string' ? null : queryOrCard;
  const query = typeof queryOrCard === 'string'
    ? queryOrCard
    : buildBoardWizardReferenceImageQuery(queryOrCard, searchContext);
  const isFoodQuery = /\b(food|dish|meal|dessert|drink|restaurant|menu)\b/i.test(query);
  const searchTerms = card
    ? buildBoardWizardCommonsSearchQueries(card, searchContext)
    : [query, isFoodQuery ? `${query} food` : '']
      .map((term) => term.replace(/\s+/g, ' ').trim())
      .filter((term) => term.length >= 3)
      .filter((term, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === term.toLowerCase()) === index)
      .slice(0, 4);

  for (const term of searchTerms) {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrsearch', term);
    url.searchParams.set('gsrnamespace', '6');
    url.searchParams.set('gsrlimit', '12');
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|mime|size');
    url.searchParams.set('iiurlwidth', '1200');

    const data = await fetchJson<WikimediaCommonsImageResponse>(url.toString());
    const rankedPages = Object.values(data.query?.pages ?? {})
      .map((page) => ({
        page,
        score: scoreBoardWizardCommonsCandidate(
          textFromUnknown(page.title),
          term,
          exactWikipediaTitleCandidates(term),
          card,
        ),
      }))
      .filter((item) => item.score >= 20)
      .sort((left, right) => right.score - left.score);
    for (const { page } of rankedPages) {
      const image = page.imageinfo?.[0];
      if (!image) {
        continue;
      }
      const mime = image.mime?.toLowerCase() ?? '';
      if (mime && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime)) {
        continue;
      }
      for (const source of [image.thumburl, image.url]) {
        if (source && canTryCoverImageUrl(source)) {
          return source;
        }
      }
    }
  }

  return '';
}

function scoreBoardWizardCommonsCandidate(
  fileTitle: string,
  query: string,
  titleCandidates: string[],
  card: GeneratedBoardWizardCard | null,
): number {
  let score = scoreWikipediaMediaFileTitle(fileTitle, query, titleCandidates);
  if (!score || !card) return score;
  const normalized = fileTitle.toLowerCase();
  if (shouldResolveBoardWizardCardAsPlace(card)) {
    if (/\b(distillery|building|exterior|entrance|visitor|centre|center|estate|view|facade|façade)\b/.test(normalized)) {
      score += 30;
    }
    if (/\b(bottle|bottling|label|packaging|box|advert|advertisement|logo|map|diagram)\b/.test(normalized)) {
      score -= 70;
    }
  }
  if (card.image_intent === 'portrait' && /\b(portrait|headshot|photograph|photo)\b/.test(normalized)) {
    score += 25;
  }
  return score;
}

function boardWizardImageProvider(imageUrl: string): string {
  if (imageUrl.includes('/boardPlacePhoto?')) return 'google-places';
  if (/%2Fwizard-images%2F|\/wizard-images\//i.test(imageUrl)) return 'generated';
  if (/upload\.wikimedia\.org|wikimedia\.org|wikipedia\.org/i.test(imageUrl)) return 'wikimedia';
  if (/googleusercontent\.com|gstatic\.com/i.test(imageUrl)) return 'google';
  if (/mzstatic\.com|spotifycdn\.com|scdn\.co|deezer/i.test(imageUrl)) return 'music-provider';
  return 'web-or-source';
}

function inferBoardWizardPlaceContext(prompt: string, boardTitle: string): string {
  const text = `${prompt} ${boardTitle}`.replace(/\s+/g, ' ');
  const explicitIn = text.match(/\bin\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,4})/);
  if (explicitIn?.[1]) {
    return explicitIn[1].replace(/[,.!?].*$/, '').trim();
  }
  const explicitNear = text.match(/\bnear\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,4})/);
  if (explicitNear?.[1]) {
    return explicitNear[1].replace(/[,.!?].*$/, '').trim();
  }
  return boardTitle;
}

function inferBoardWizardRequestedCount(text: string): number | null {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const numericPatterns = [
    /\b(?:make|create|build|generate|include|with|top|best)\s+(?:a\s+board\s+(?:with|of)\s+)?(\d{1,3})\b/,
    /\b(\d{1,3})\s+(?:signers|people|persons|destinations|places|restaurants|cards|items|facts|rooms|amenities|cities)\b/,
  ];
  for (const pattern of numericPatterns) {
    const match = normalized.match(pattern);
    const count = match?.[1] ? Number(match[1]) : 0;
    if (Number.isInteger(count) && count >= 1 && count <= 100) {
      return count;
    }
  }

  const words: Record<string, number> = {
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
  const wordMatch = normalized.match(/\b(?:top|best|include|with|make|create|build|generate)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\b/);
  return wordMatch?.[1] ? words[wordMatch[1]] ?? null : null;
}

function shapeNumberedSourceWizardBatch(
  batch: GeneratedBoardWizardBatch,
  source: NumberedBoardSource,
  defaultType: GeneratedBoardWizardCard['type'],
): GeneratedBoardWizardBatch {
  const sourceTitle = source.title.replace(/\s+/g, ' ').trim().slice(0, 90);
  const cards = source.items.map((item, index): GeneratedBoardWizardCard => {
    const generated = batch.cards[index];
    const subtitle = item.subtitle
      ? `#${item.rank} · ${item.subtitle}`
      : `Rank #${item.rank}`;
    const notes = item.body || generated?.notes || 'Imported from the pasted source.';
    const type = generated?.type ?? defaultType;
    return {
      title: cleanBoardWizardSourceText(item.title).slice(0, 80),
      subtitle: cleanBoardWizardSourceText(subtitle).slice(0, 120),
      notes: cleanBoardWizardSourceText(notes).slice(0, 3600),
      type,
      scope: generated?.scope ?? 'place',
      status: generated?.status ?? 'saved',
      rating: generated?.rating ?? 4,
      tags: mergeBoardWizardTags([`rank-${item.rank}`, 'source-item'], generated?.tags ?? []),
      image_query: (generated?.image_query || `${item.title} ${sourceTitle} travel photo`).slice(0, 120),
      place_query: (generated?.place_query || item.title).slice(0, 140),
      entity_name: cleanBoardWizardSourceText(generated?.entity_name || item.title).slice(0, 100),
      entity_type: generated?.entity_type ?? (type === 'place' || type === 'shop' ? 'place' : type === 'food' ? 'food' : 'other'),
      image_intent: generated?.image_intent ?? (type === 'place' || type === 'shop' ? 'place' : type === 'food' ? 'food' : 'other'),
      image_context: generated?.image_context || item.subtitle,
      media_kind: generated?.media_kind ?? 'none',
      short_summary: generated?.short_summary || item.subtitle || firstBoardWizardSentence(notes),
      rank: item.rank,
      imageUrl: generated?.imageUrl,
      audioPreviewUrl: generated?.audioPreviewUrl,
      spotifyTrackId: generated?.spotifyTrackId,
      spotifyTrackUrl: generated?.spotifyTrackUrl,
      spotifyUri: generated?.spotifyUri,
      spotifyArtistName: generated?.spotifyArtistName,
      spotifyAlbumName: generated?.spotifyAlbumName,
      spotifyArtworkUrl: generated?.spotifyArtworkUrl,
      placeId: generated?.placeId,
      googleMapsUrl: generated?.googleMapsUrl,
      tour: generated?.tour,
    };
  });

  return {
    board: {
      ...batch.board,
      title: sourceTitle || batch.board.title,
      description: source.description.slice(0, 500) || batch.board.description || `${cards.length} ordered items imported from pasted text.`,
    },
    cards,
  };
}

function shapeArticleSourceWizardBatch(
  batch: GeneratedBoardWizardBatch,
  manifest: BoardWizardSourceManifest,
  defaultType: GeneratedBoardWizardCard['type'],
): GeneratedBoardWizardBatch {
  const cards = alignBoardWizardSourceCards(manifest.items, batch.cards).map(({ item, card: generated }): GeneratedBoardWizardCard => {
    const type = generated?.type ?? defaultType;
    const sourceImage = item.imageUrl;
    const notes = item.excerpt || generated?.notes || 'Imported from the source article.';
    return {
      ...generated,
      title: cleanBoardWizardSourceText(item.title).slice(0, 80),
      subtitle: cleanBoardWizardSourceText(generated?.subtitle || `Source item ${item.sourceIndex}`).slice(0, 120),
      notes: cleanBoardWizardSourceText(notes).slice(0, 3600),
      type,
      scope: generated?.scope ?? 'place',
      status: generated?.status ?? 'saved',
      rating: generated?.rating ?? 4,
      tags: mergeBoardWizardTags(['source-item', `source-${item.sourceIndex}`], generated?.tags ?? []),
      image_query: (generated?.image_query || `${item.title} photo`).slice(0, 180),
      place_query: (generated?.place_query || item.title).slice(0, 240),
      entity_name: cleanBoardWizardSourceText(item.title).slice(0, 120),
      entity_type: generated?.entity_type ?? (type === 'place' || type === 'shop' ? 'place' : type === 'food' ? 'food' : 'other'),
      image_intent: generated?.image_intent ?? (type === 'place' || type === 'shop' ? 'place' : type === 'food' ? 'food' : 'other'),
      image_context: generated?.image_context || manifest.pageTitle,
      media_kind: generated?.media_kind ?? 'none',
      short_summary: generated?.short_summary || firstBoardWizardSentence(notes),
      rank: item.sourceIndex,
      imageUrl: sourceImage || generated?.imageUrl,
      imageSource: sourceImage ? 'source-page' : generated?.imageSource,
      sourceUrl: manifest.sourceUrl,
      extractionConfidence: manifest.confidence,
      extractedAt: generated?.extractedAt || new Date().toISOString(),
    };
  });
  return {
    board: {
      ...batch.board,
      title: cleanBoardWizardSourceText(batch.board.title || manifest.pageTitle).slice(0, 90),
      description: batch.board.description || `${cards.length} items imported from ${manifest.siteName || 'the source article'}.`,
    },
    cards,
  };
}

function cleanBoardWizardSourceText(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^[#>*_`~\s-]+|[*_`~]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstBoardWizardSentence(value: string): string {
  const cleaned = cleanBoardWizardSourceText(value);
  return (cleaned.match(/^(.{1,155}?[.!?])(?:\s|$)/)?.[1] ?? cleaned.slice(0, 160)).trim();
}

function mergeBoardWizardTags(existing: string[], additions: string[]): string[] {
  return Array.from(
    new Set(
      [...existing, ...additions]
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 6);
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoardWizardMode(value: unknown): BoardWizardMode {
  return value === 'paste'
    || value === 'photos'
    || value === 'url'
    || value === 'expand'
    || value === 'walking-tour'
    || value === 'driving-tour'
    ? value
    : 'describe';
}

function normalizeBoardWizardVibe(value: unknown): BoardWizardVibe {
  return value === 'playful' || value === 'traveler' || value === 'curator' || value === 'memory' ? value : 'foodie';
}

function normalizeBoardWizardDefaultType(value: unknown): GeneratedBoardWizardCard['type'] {
  return value === 'place' || value === 'memory' || value === 'idea' || value === 'shop' || value === 'note' ? value : 'food';
}

function normalizeExistingBoardWizardCard(value: unknown): { title: string; subtitle?: string; tags?: string[] } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const title = stringOrEmpty(data.title).slice(0, 90);
  if (!title) {
    return null;
  }
  return {
    title,
    subtitle: stringOrEmpty(data.subtitle).slice(0, 120) || undefined,
    tags: Array.isArray(data.tags)
      ? data.tags.map((tag) => stringOrEmpty(tag).slice(0, 40)).filter(Boolean).slice(0, 8)
      : undefined,
  };
}

function isBoardWizardTourMode(mode: BoardWizardMode): mode is 'walking-tour' | 'driving-tour' {
  return mode === 'walking-tour' || mode === 'driving-tour';
}

function normalizeBoardWizardTourOptions(value: unknown, mode: BoardWizardMode): BoardWizardTourOptions {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const voiceStyle: GeneratedBoardTourVoiceStyle =
    data.voiceStyle === 'local' || data.voiceStyle === 'kid-friendly' || data.voiceStyle === 'historian'
      ? data.voiceStyle
      : 'historian';
  const fallbackStyle = mode === 'driving-tour' ? 'Balanced' : 'Standard';
  return {
    voiceStyle,
    paceOrRouteStyle: stringOrEmpty(data.paceOrRouteStyle).slice(0, 40) || fallbackStyle,
    extras: Array.isArray(data.extras)
      ? data.extras.map((extra) => stringOrEmpty(extra).slice(0, 40)).filter(Boolean).slice(0, 8)
      : [],
  };
}

function normalizeBoardWizardCurrentCard(value: unknown, defaultType: GeneratedBoardWizardCard['type']): BoardWizardCurrentCard | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const title = stringOrEmpty(data.title).slice(0, 90);
  if (!title) {
    return null;
  }
  const type = normalizeBoardWizardDefaultType(data.type || defaultType);
  const scopeRaw = stringOrEmpty(data.scope);
  const statusRaw = stringOrEmpty(data.status);
  const ratingRaw = typeof data.rating === 'number' ? data.rating : Number(stringOrEmpty(data.rating));
  return {
    title,
    subtitle: stringOrEmpty(data.subtitle).slice(0, 120),
    notes: stringOrEmpty(data.notes).slice(0, 3600),
    type,
    scope: scopeRaw === 'city' || scopeRaw === 'country' || scopeRaw === 'region' ? scopeRaw : 'place',
    status: statusRaw === 'planned' || statusRaw === 'visited' || statusRaw === 'favorite' ? statusRaw : 'saved',
    rating: Math.max(1, Math.min(5, Math.round(Number.isFinite(ratingRaw) ? ratingRaw : 4))),
    tags: Array.isArray(data.tags)
      ? data.tags.map((tag) => stringOrEmpty(tag).slice(0, 40).toLowerCase()).filter(Boolean).slice(0, 8)
      : [],
    image_query: stringOrEmpty(data.image_query).slice(0, 160),
    place_query: stringOrEmpty(data.place_query).slice(0, 180),
    entity_name: stringOrEmpty(data.entity_name).slice(0, 100) || undefined,
    entity_type: normalizeBoardWizardEntityTypeValue(data.entity_type),
    image_intent: normalizeBoardWizardImageIntentValue(data.image_intent),
    image_context: stringOrEmpty(data.image_context).slice(0, 120) || undefined,
    media_kind: normalizeBoardWizardMediaKindValue(data.media_kind),
    short_summary: stringOrEmpty(data.short_summary).slice(0, 160) || undefined,
    rank: normalizeBoardWizardRankValue(data.rank),
    audioPreviewUrl: stringOrEmpty(data.audioPreviewUrl).slice(0, 2000) || undefined,
    spotifyTrackId: stringOrEmpty(data.spotifyTrackId).slice(0, 120) || undefined,
    spotifyTrackUrl: stringOrEmpty(data.spotifyTrackUrl).slice(0, 2000) || undefined,
    spotifyUri: stringOrEmpty(data.spotifyUri).slice(0, 240) || undefined,
    spotifyArtistName: stringOrEmpty(data.spotifyArtistName).slice(0, 180) || undefined,
    spotifyAlbumName: stringOrEmpty(data.spotifyAlbumName).slice(0, 180) || undefined,
    spotifyArtworkUrl: stringOrEmpty(data.spotifyArtworkUrl).slice(0, 2000) || undefined,
    placeId: stringOrEmpty(data.placeId).slice(0, 240) || undefined,
    googleMapsUrl: safeBoardCardSourceUrl(data.googleMapsUrl) || undefined,
    locationLat: finiteBoardWizardCoordinate(data.locationLat, -90, 90),
    locationLng: finiteBoardWizardCoordinate(data.locationLng, -180, 180),
    sourceUrl: safeBoardCardSourceUrl(data.sourceUrl) || undefined,
    productUrl: safeBoardCardSourceUrl(data.productUrl) || undefined,
    merchant: stringOrEmpty(data.merchant).slice(0, 120) || undefined,
    price: stringOrEmpty(data.price).slice(0, 80) || undefined,
    currency: stringOrEmpty(data.currency).slice(0, 12) || undefined,
    sku: stringOrEmpty(data.sku).slice(0, 100) || undefined,
    availability: stringOrEmpty(data.availability).slice(0, 100) || undefined,
    productCategory: stringOrEmpty(data.productCategory).slice(0, 100) || undefined,
    imageSource: data.imageSource === 'source-page' || data.imageSource === 'product-page'
      || data.imageSource === 'search' || data.imageSource === 'generated' || data.imageSource === 'missing'
      ? data.imageSource
      : undefined,
    extractionConfidence: typeof data.extractionConfidence === 'number'
      ? Math.max(0, Math.min(1, data.extractionConfidence))
      : undefined,
    extractedAt: stringOrEmpty(data.extractedAt).slice(0, 40) || undefined,
  };
}

function finiteBoardWizardCoordinate(value: unknown, min: number, max: number): number | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  const coordinate = typeof value === 'number' ? value : text ? Number(text) : Number.NaN;
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : undefined;
}

function normalizeBoardWizardEntityTypeValue(value: unknown): GeneratedBoardWizardCard['entity_type'] | undefined {
  return value === 'person' || value === 'fictional_character' || value === 'place' || value === 'event' || value === 'work'
    || value === 'product' || value === 'food' || value === 'organization' || value === 'other' ? value : undefined;
}

function normalizeBoardWizardImageIntentValue(value: unknown): GeneratedBoardWizardCard['image_intent'] | undefined {
  return value === 'portrait' || value === 'character' || value === 'place' || value === 'event' || value === 'cover'
    || value === 'product' || value === 'food' || value === 'logo' || value === 'other' ? value : undefined;
}

function normalizeBoardWizardMediaKindValue(value: unknown): GeneratedBoardWizardCard['media_kind'] | undefined {
  return value === 'none' || value === 'song' || value === 'album' || value === 'film'
    || value === 'book' || value === 'tv' || value === 'game' ? value : undefined;
}

function normalizeBoardWizardRankValue(value: unknown): number | undefined {
  const rank = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(stringOrEmpty(value), 10);
  return Number.isFinite(rank) && rank > 0 && rank <= 100 ? rank : undefined;
}

function stripHtmlForBoardWizard(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export const listCityPlaceReviews = onCall({ region: callableRegion, cors: true }, async (request) => {
  const atlasId = textFromUnknown(request.data?.atlasId);
  const placeId = textFromUnknown(request.data?.placeId);
  if (!atlasId || !placeId) {
    throw new HttpsError('invalid-argument', 'Atlas ID and place ID are required.');
  }

  const atlas = await loadPublicAtlasById(atlasId);
  assertPublicCityAtlas(atlas);

  const snapshot = await db
    .collection('city_place_reviews')
    .where('atlas_id', '==', atlasId)
    .where('place_id', '==', placeId)
    .limit(120)
    .get();

  const reviews = snapshot.docs
    .map((doc) => serializeCityPlaceReview(doc.id, doc.data() as Record<string, unknown>))
    .sort((a, b) => {
      const aTime = Date.parse(a.createdAt ?? a.updatedAt ?? '') || 0;
      const bTime = Date.parse(b.createdAt ?? b.updatedAt ?? '') || 0;
      return bTime - aTime;
    });

  return { reviews };
});

export const submitCityPlaceReview = onCall({ region: callableRegion, cors: true, timeoutSeconds: 30 }, async (request) => {
  const atlasId = textFromUnknown(request.data?.atlasId);
  const place = (request.data?.place ?? {}) as Record<string, unknown>;
  const googlePlaceId = textFromUnknown(place.placeId || place.google_place_id || place.place_id);
  const placeName = textFromUnknown(place.name).slice(0, 160);
  const address = textFromUnknown(place.address).slice(0, 260);
  const rating = reviewRatingFromUnknown(request.data?.rating);
  const reviewText = normalizePlaceReviewText(request.data?.text);

  if (!atlasId || !googlePlaceId || !placeName) {
    throw new HttpsError('invalid-argument', 'A valid city place is required.');
  }
  if (reviewText.length < 3) {
    throw new HttpsError('invalid-argument', 'Review text must be at least 3 characters.');
  }

  const atlas = await loadPublicAtlasById(atlasId);
  assertPublicCityAtlas(atlas);
  const citySlug = textFromUnknown(atlas.slug) || slugPart(cityAtlasSearchContext(atlas));
  const reviewerKey = anonymousPlaceReviewerKey(request.auth?.uid, request.data?.anonymousVisitorId);
  const placeDocId = cityScopedPlaceDocId(atlasId, googlePlaceId);
  const placeRef = db.collection('city_places').doc(placeDocId);
  const reviewRef = db.collection('city_place_reviews').doc();
  const types = Array.isArray(place.types) ? place.types.map((type) => textFromUnknown(type)).filter(Boolean).slice(0, 12) : [];
  const lat = typeof place.lat === 'number' ? place.lat : null;
  const lng = typeof place.lng === 'number' ? place.lng : null;
  const reviewerName = textFromUnknown(request.auth?.token?.name)
    || textFromUnknown(request.auth?.token?.email)
    || 'Local reviewer';
  const googleMapsUrl = textFromUnknown(place.googleMapsUrl || place.google_maps_url)
    || `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(googlePlaceId)}`;
  const category = textFromUnknown(place.category) || cityPlaceCategory(types);

  const placeResult = await db.runTransaction(async (transaction) => {
    const placeSnapshot = await transaction.get(placeRef);

    const existingPlace = (placeSnapshot.data() ?? {}) as Record<string, unknown>;
    const currentCount = typeof existingPlace.rating_count === 'number' ? existingPlace.rating_count : 0;
    const currentSum = typeof existingPlace.rating_sum === 'number'
      ? existingPlace.rating_sum
      : (typeof existingPlace.rating_avg === 'number' ? existingPlace.rating_avg * currentCount : 0);
    const nextCount = currentCount + 1;
    const nextSum = currentSum + rating;
    const nextAverage = nextCount > 0 ? Math.round((nextSum / nextCount) * 10) / 10 : rating;

    const placePayload = {
      atlas_id: atlasId,
      city_slug: citySlug,
      google_place_id: googlePlaceId,
      place_id: googlePlaceId,
      name: placeName,
      address,
      lat,
      lng,
      types,
      category,
      google_maps_url: googleMapsUrl,
      rating_sum: nextSum,
      rating_avg: nextAverage,
      rating_count: nextCount,
      review_count: nextCount,
      latest_review_text: reviewText,
      latest_review_rating: rating,
      latest_review_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      created_at: placeSnapshot.exists ? existingPlace.created_at ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    };

    transaction.set(placeRef, placePayload, { merge: true });
    transaction.set(reviewRef, {
      atlas_id: atlasId,
      city_slug: citySlug,
      place_id: placeDocId,
      google_place_id: googlePlaceId,
      place_name: placeName,
      rating,
      text: reviewText,
      reviewer_hash: reviewerHash(reviewerKey),
      reviewer_type: request.auth?.uid ? 'user' : 'anonymous',
      reviewer_name: reviewerName,
      user_id: request.auth?.uid ?? null,
      status: 'published',
      updated_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      id: placeDocId,
      ...placePayload,
      latest_review_at: new Date().toISOString(),
    } as Record<string, unknown>;
  });

  return {
    place: serializeCityPlace(placeDocId, placeResult),
    reviewId: reviewRef.id,
  };
});

export const autoUploadAtlasCoverImage = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 120,
    memory: '1GiB',
  },
  async (request): Promise<AutomatedCoverResult> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    await assertPlatformAdmin(request.auth.uid);

    const atlasId = typeof request.data?.atlasId === 'string' ? request.data.atlasId.trim() : '';
    const overwrite = request.data?.overwrite === true;
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    const atlasRef = db.collection('atlases').doc(atlasId);
    const atlasSnapshot = await atlasRef.get();
    if (!atlasSnapshot.exists) {
      throw new HttpsError('not-found', 'Atlas not found.');
    }

    const atlas = atlasSnapshot.data() as Record<string, unknown>;
    if (atlas.is_public !== true) {
      throw new HttpsError('failed-precondition', 'Only public Wikis can use automated cover images.');
    }
    if (!overwrite && textFromUnknown(atlas.hero_url)) {
      throw new HttpsError('failed-precondition', 'This Wiki already has a cover image.');
    }

    const cityConfig = atlas.city_config && typeof atlas.city_config === 'object'
      ? atlas.city_config as Record<string, unknown>
      : {};
    const cityName = textFromUnknown(cityConfig.city_name) || textFromUnknown(atlas.name).replace(/^living wiki:\s*/i, '');
    const regionName = textFromUnknown(cityConfig.region_name) || null;
    if (!cityName) {
      throw new HttpsError('failed-precondition', 'This Wiki does not have a city name.');
    }

    const { candidate, image } = await findValidatedCoverImage(cityName, regionName);
    const token = randomUUID();
    const storagePath = `atlases/${atlasId}/hero-auto-${slugPart(cityName)}-${Date.now()}.${image.extension}`;
    await storage.bucket().file(storagePath).save(image.buffer, {
      contentType: image.contentType,
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000',
        metadata: {
          firebaseStorageDownloadTokens: token,
          source: candidate.source,
          sourceUrl: candidate.pageUrl,
          sourceImageUrl: candidate.imageUrl,
          sourcePageTitle: candidate.pageTitle,
        },
      },
    });

    const heroUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storage.bucket().name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
    await atlasRef.update({
      hero_url: heroUrl,
      hero_image_source: candidate.source,
      hero_image_source_url: candidate.pageUrl,
      hero_image_source_title: candidate.pageTitle,
      hero_image_original_url: candidate.imageUrl,
      updated_at: FieldValue.serverTimestamp(),
    });

    return {
      atlasId,
      heroUrl,
      sourceUrl: candidate.pageUrl,
      pageTitle: candidate.pageTitle,
      contentType: image.contentType,
      bytes: image.buffer.length,
    };
  },
);

export const addAtlasAdmin = onCall({ region: callableRegion, cors: true, secrets: [sendgridApiKey] }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const atlasId = typeof request.data?.atlasId === 'string' ? request.data.atlasId.trim() : '';
  const email = normalizeUserEmail(request.data?.email);
  if (!atlasId) {
    throw new HttpsError('invalid-argument', 'atlasId is required.');
  }
  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'Enter a valid admin email address.');
  }

  const { atlasRef, atlas } = await loadOwnedAtlasForAdminMutation(atlasId, request.auth.uid);
  const ownerEmail = normalizeUserEmail((request.auth.token ?? {}).email);
  if (ownerEmail && ownerEmail === email) {
    throw new HttpsError('invalid-argument', 'You are already the owner of this wiki.');
  }

  const userSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();
  const userDoc = userSnapshot.docs[0];
  if (!userDoc) {
    throw new HttpsError('not-found', 'No Living Wiki account exists for that email yet.');
  }

  const userId = userDoc.id;
  if (String(atlas.user_id) === userId) {
    throw new HttpsError('invalid-argument', 'That user already owns this wiki.');
  }

  const user = userDoc.data() as Record<string, unknown>;
  const atlasName = atlasDisplayName(atlas, atlasId);
  const atlasSlug = typeof atlas.slug === 'string' && atlas.slug.trim()
    ? atlas.slug.trim()
    : atlasId;
  const token = (request.auth.token ?? {}) as { name?: unknown; email?: unknown };
  const inviterName = typeof token.name === 'string' && token.name.trim()
    ? token.name.trim()
    : typeof token.email === 'string' && token.email.trim()
      ? token.email.trim()
      : 'A Living Wiki owner';
  const admin = {
    user_id: userId,
    email,
    display_name: typeof user.displayName === 'string' && user.displayName.trim()
      ? user.displayName.trim()
      : null,
    added_at: new Date().toISOString(),
  };
  const adminProfiles = normalizeAdminProfiles(atlas.admin_profiles)
    .filter((profile) => String(profile.user_id ?? '') !== userId);

  await atlasRef.update({
    admin_user_ids: FieldValue.arrayUnion(userId),
    admin_profiles: [...adminProfiles, admin],
    updated_at: FieldValue.serverTimestamp(),
  });

  try {
    await sendAtlasAdminInviteEmail({
      recipientName: typeof user.displayName === 'string' ? user.displayName : null,
      recipientEmail: email,
      inviterName,
      atlasName,
      adminUrl: `${publicAppUrl}/atlases/${encodeURIComponent(atlasId)}/persona`,
      publicUrl: `${publicAppUrl}/atlas/${encodeURIComponent(atlasSlug)}`,
    });
  } catch (error) {
    logger.error('Failed to send atlas admin invitation email; rolling back admin grant.', {
      atlasId,
      userId,
      email,
      error: error instanceof Error ? error.message : String(error),
    });
    const rollbackProfiles = normalizeAdminProfiles((await atlasRef.get()).data()?.admin_profiles)
      .filter((profile) => String(profile.user_id ?? '') !== userId);
    await atlasRef.update({
      admin_user_ids: FieldValue.arrayRemove(userId),
      admin_profiles: rollbackProfiles,
      updated_at: FieldValue.serverTimestamp(),
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Admin invite email could not be sent.');
  }

  return { admin, emailSent: true };
});

export const removeAtlasAdmin = onCall({ region: callableRegion, cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const atlasId = typeof request.data?.atlasId === 'string' ? request.data.atlasId.trim() : '';
  const userId = typeof request.data?.userId === 'string' ? request.data.userId.trim() : '';
  if (!atlasId) {
    throw new HttpsError('invalid-argument', 'atlasId is required.');
  }
  if (!userId) {
    throw new HttpsError('invalid-argument', 'userId is required.');
  }

  const { atlasRef, atlas } = await loadOwnedAtlasForAdminMutation(atlasId, request.auth.uid);
  if (String(atlas.user_id) === userId) {
    throw new HttpsError('invalid-argument', 'The owner cannot be removed as an admin.');
  }

  const adminProfiles = normalizeAdminProfiles(atlas.admin_profiles)
    .filter((profile) => String(profile.user_id ?? '') !== userId);

  await atlasRef.update({
    admin_user_ids: FieldValue.arrayRemove(userId),
    admin_profiles: adminProfiles,
    updated_at: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

export const subscribeToAtlasUpdates = onCall(
  { region: callableRegion, cors: true, secrets: [sendgridApiKey] },
  async (request) => {
    const atlasId = typeof request.data?.atlasId === 'string' ? request.data.atlasId.trim() : '';
    const email = normalizeUserEmail(request.data?.email);
    const anonymousVisitorId = typeof request.data?.anonymousVisitorId === 'string'
      ? request.data.anonymousVisitorId.trim().slice(0, 128)
      : null;

    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError('invalid-argument', 'Enter a valid email address.');
    }

    const atlas = await loadPublicAtlasById(atlasId) as Record<string, unknown>;
    const atlasName = atlasDisplayName(atlas, atlasId);
    const atlasSlug = typeof atlas['slug'] === 'string' && atlas['slug'].trim()
      ? atlas['slug'].trim()
      : atlasId;
    const subscriptionId = createHash('sha256')
      .update(`${atlasId}:${email}`)
      .digest('hex');
    const subscriptionRef = db.collection('atlas_subscriptions').doc(subscriptionId);
    const existingSubscription = await subscriptionRef.get();
    const existingData = existingSubscription.data() as Record<string, unknown> | undefined;
    const unsubscribeToken = typeof existingData?.unsubscribe_token === 'string' && existingData.unsubscribe_token.trim()
      ? existingData.unsubscribe_token.trim()
      : randomUUID();
    const unsubscribeUrl = `${publicFunctionsBaseUrl}/unsubscribeAtlasSubscription?sid=${encodeURIComponent(subscriptionId)}&token=${encodeURIComponent(unsubscribeToken)}`;

    if (existingSubscription.exists && existingData?.status === 'active') {
      logger.info('Atlas subscription already active; confirmation email not resent.', {
        atlasId,
        email,
        subscriptionId,
      });
      return { ok: true, alreadySubscribed: true };
    }

    try {
      await sendAtlasSubscriptionEmail({
        recipientEmail: email,
        atlasName,
        chatUrl: `${publicAppUrl}/chat/${encodeURIComponent(atlasSlug)}`,
        unsubscribeUrl,
      });
    } catch (error) {
      logger.error('Failed to send atlas subscription confirmation email.', {
        atlasId,
        email,
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Subscription email could not be sent.');
    }

    await subscriptionRef.set(
      {
        atlas_id: atlasId,
        atlas_name: atlasName,
        atlas_slug: atlasSlug,
        email,
        status: 'active',
        source: 'chat',
        subscriber_user_id: request.auth?.uid ?? null,
        anonymous_visitor_id: anonymousVisitorId,
        unsubscribe_token: unsubscribeToken,
        subscribed_at: FieldValue.serverTimestamp(),
        created_at: existingSubscription.exists && existingData?.created_at
          ? existingData.created_at
          : FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { ok: true, alreadySubscribed: false };
  },
);

export const listAtlasSubscriptions = onCall({ region: callableRegion, cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const atlasId = typeof request.data?.atlasId === 'string' ? request.data.atlasId.trim() : '';
  if (!atlasId) {
    throw new HttpsError('invalid-argument', 'atlasId is required.');
  }

  await loadAtlasForAdminAccess(atlasId, request.auth.uid);
  const subscriptionsSnapshot = await db
    .collection('atlas_subscriptions')
    .where('atlas_id', '==', atlasId)
    .limit(500)
    .get();

  const subscriptions = subscriptionsSnapshot.docs
    .map((subscriptionSnapshot) => {
      const data = subscriptionSnapshot.data() as Record<string, unknown>;
      return {
        id: subscriptionSnapshot.id,
        atlas_id: String(data.atlas_id ?? ''),
        email: String(data.email ?? ''),
        status: data.status === 'unsubscribed' ? 'unsubscribed' : 'active',
        subscriber_user_id: typeof data.subscriber_user_id === 'string' ? data.subscriber_user_id : null,
        source: typeof data.source === 'string' ? data.source : null,
        created_at: normalizeTimestamp(data.created_at ?? data.subscribed_at),
        updated_at: normalizeTimestamp(data.updated_at),
      };
    })
    .filter((subscription) => subscription.email && subscription.status === 'active')
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

  return { subscriptions };
});

export const removeAtlasSubscription = onCall({ region: callableRegion, cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const atlasId = typeof request.data?.atlasId === 'string' ? request.data.atlasId.trim() : '';
  const subscriptionId = typeof request.data?.subscriptionId === 'string' ? request.data.subscriptionId.trim() : '';
  if (!atlasId) {
    throw new HttpsError('invalid-argument', 'atlasId is required.');
  }
  if (!subscriptionId) {
    throw new HttpsError('invalid-argument', 'subscriptionId is required.');
  }

  await loadAtlasForAdminAccess(atlasId, request.auth.uid);
  const subscriptionRef = db.collection('atlas_subscriptions').doc(subscriptionId);
  const subscriptionSnapshot = await subscriptionRef.get();
  if (!subscriptionSnapshot.exists) {
    return { ok: true };
  }

  const subscription = subscriptionSnapshot.data() as Record<string, unknown> | undefined;
  if (String(subscription?.atlas_id ?? '') !== atlasId) {
    throw new HttpsError('permission-denied', 'That subscriber does not belong to this wiki.');
  }

  await subscriptionRef.delete();
  logger.info('Atlas subscription removed by admin.', {
    atlasId,
    subscriptionId,
    adminUserId: request.auth.uid,
  });
  return { ok: true };
});

function sendUnsubscribeHtml(
  res: { status(code: number): unknown; set(name: string, value: string): unknown; send(body: string): unknown },
  statusCode: number,
  params: { title: string; message: string; actionUrl?: string; actionLabel?: string },
): void {
  const safeTitle = escapeHtml(params.title);
  const safeMessage = escapeHtml(params.message);
  const safeActionUrl = params.actionUrl ? escapeHtml(params.actionUrl) : '';
  const safeActionLabel = params.actionLabel ? escapeHtml(params.actionLabel) : '';
  res.status(statusCode);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7faf8; color: #102016; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(92vw, 520px); border: 1px solid #dbe8df; border-radius: 24px; background: white; padding: 32px; box-shadow: 0 24px 60px rgba(15, 36, 23, 0.12); }
      .eyebrow { color: #1c7c41; font-size: 12px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
      h1 { margin: 10px 0 12px; font-size: 30px; line-height: 1.1; }
      p { margin: 0; color: #55635b; font-size: 16px; line-height: 1.6; }
      a { display: inline-flex; margin-top: 24px; border-radius: 999px; background: #1c7c41; color: white; padding: 12px 18px; text-decoration: none; font-weight: 800; }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">Living Wiki</div>
      <h1>${safeTitle}</h1>
      <p>${safeMessage}</p>
      ${safeActionUrl && safeActionLabel ? `<a href="${safeActionUrl}">${safeActionLabel}</a>` : ''}
    </main>
  </body>
</html>`);
}

export const unsubscribeAtlasSubscription = onRequest(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');

    if (req.method !== 'GET') {
      res.status(405).send('Method not allowed.');
      return;
    }

    const subscriptionId = typeof req.query.sid === 'string' ? req.query.sid.trim() : '';
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!subscriptionId || !token) {
      sendUnsubscribeHtml(res, 400, {
        title: 'Unsubscribe link is incomplete',
        message: 'This unsubscribe link is missing required information.',
        actionUrl: publicAppUrl,
        actionLabel: 'Open Living Wiki',
      });
      return;
    }

    const subscriptionRef = db.collection('atlas_subscriptions').doc(subscriptionId);
    const subscriptionSnapshot = await subscriptionRef.get();
    if (!subscriptionSnapshot.exists) {
      sendUnsubscribeHtml(res, 404, {
        title: 'Subscription not found',
        message: 'This subscription may have already been removed.',
        actionUrl: publicAppUrl,
        actionLabel: 'Open Living Wiki',
      });
      return;
    }

    const subscription = subscriptionSnapshot.data() as Record<string, unknown> | undefined;
    const expectedToken = typeof subscription?.unsubscribe_token === 'string'
      ? subscription.unsubscribe_token
      : '';
    if (!expectedToken || expectedToken !== token) {
      sendUnsubscribeHtml(res, 403, {
        title: 'Unsubscribe link is invalid',
        message: 'This unsubscribe link is not valid for this subscription.',
        actionUrl: publicAppUrl,
        actionLabel: 'Open Living Wiki',
      });
      return;
    }

    if (subscription?.status !== 'unsubscribed') {
      await subscriptionRef.set(
        {
          status: 'unsubscribed',
          unsubscribed_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    const atlasSlug = typeof subscription?.atlas_slug === 'string' && subscription.atlas_slug.trim()
      ? subscription.atlas_slug.trim()
      : null;
    const atlasName = typeof subscription?.atlas_name === 'string' && subscription.atlas_name.trim()
      ? subscription.atlas_name.trim()
      : 'this wiki';

    logger.info('Atlas subscription unsubscribed from email link.', {
      subscriptionId,
      atlasId: subscription?.atlas_id ?? null,
      email: subscription?.email ?? null,
    });

    sendUnsubscribeHtml(res, 200, {
      title: 'You are unsubscribed',
      message: `You will no longer receive Living Wiki Weekly Updates for ${atlasName}.`,
      actionUrl: atlasSlug ? `${publicAppUrl}/chat/${encodeURIComponent(atlasSlug)}` : publicAppUrl,
      actionLabel: 'Return to Living Wiki',
    });
  },
);

export const getAtlasTextMessagingConfig = onCall({ region: callableRegion, cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const atlasId = typeof request.data?.atlasId === 'string' ? request.data.atlasId.trim() : '';
  if (!atlasId) {
    throw new HttpsError('invalid-argument', 'atlasId is required.');
  }

  await loadAtlasForAdminAccess(atlasId, request.auth.uid);
  const config = await loadOrCreateTextMessagingConfig(atlasId);
  return { config: serializeTextMessagingConfig(atlasId, config) };
});

export const updateAtlasTextMessagingConfig = onCall({ region: callableRegion, cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const atlasId = typeof request.data?.atlasId === 'string' ? request.data.atlasId.trim() : '';
  if (!atlasId) {
    throw new HttpsError('invalid-argument', 'atlasId is required.');
  }

  await loadAtlasForAdminAccess(atlasId, request.auth.uid);
  const integrationRef = db.collection('atlas_integrations').doc(atlasId);
  const integrationSnapshot = await integrationRef.get();
  const existing = textMessagingConfigFromStored(integrationSnapshot.data()?.text_messaging);
  const config = normalizeTextMessagingConfigInput(
    request.data?.config,
    existing?.webhook_token ?? null,
    request.data?.rotateToken === true,
  );

  await integrationRef.set(
    {
      atlas_id: atlasId,
      text_messaging: {
        ...config,
        updated_at: FieldValue.serverTimestamp(),
        updated_by: request.auth.uid,
      },
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { config: serializeTextMessagingConfig(atlasId, { ...config, updated_at: new Date().toISOString() }) };
});

export const atlasTextWebhook = onRequest(
  {
    region: callableRegion,
    timeoutSeconds: 180,
    memory: '1GiB',
    secrets: [geminiApiKey],
  },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      res.status(200).send({
        ok: true,
        message: 'Living Wiki text webhook. Configure this URL as an inbound SMS webhook with atlasId and token.',
      });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed.');
      return;
    }

    const atlasId = normalizeAtlasId(req.query.atlasId);
    const token = textValue(req.query.token, 256) || textValue(req.get('x-living-wiki-token'), 256);
    if (!atlasId || !token) {
      sendTwilioMessage(res, 'This Living Wiki text endpoint is missing its configuration.', 400);
      return;
    }

    try {
      const integrationSnapshot = await db.collection('atlas_integrations').doc(atlasId).get();
      const config = textMessagingConfigFromStored(integrationSnapshot.data()?.text_messaging);
      if (!config?.enabled || config.webhook_token !== token) {
        sendTwilioMessage(res, 'This Living Wiki text number is not enabled.', 403);
        return;
      }

      const inboundText =
        requestField(req, ['Body', 'body', 'text', 'message', 'Message']) ||
        nestedRequestField(req, ['message', 'text']) ||
        nestedRequestField(req, ['message', 'content']);
      const fromNumber =
        requestField(req, ['From', 'from', 'fromNumber', 'customerNumber', 'phoneNumber']) ||
        nestedRequestField(req, ['customer', 'number']) ||
        nestedRequestField(req, ['message', 'from']);
      const toNumber =
        requestField(req, ['To', 'to', 'toNumber']) ||
        nestedRequestField(req, ['message', 'to']);

      if (!inboundText || !fromNumber) {
        sendTwilioMessage(res, 'Send a question to this Living Wiki number and I will answer from the public wiki.', 400);
        return;
      }

      const atlas = await loadPublicAtlasById(atlasId);
      const response = await runPublicAtlasQuery({
        atlasId,
        atlasOwnerUserId: String(atlas.user_id),
        question: inboundText,
        answerMode: atlas.default_answer_mode === 'internet' ? 'internet' : 'wiki',
        visitor: {
          kind: 'anonymous',
          visitorUserId: null,
          anonymousVisitorId: phoneVisitorId(atlasId, fromNumber),
          visitorDisplayName: maskPhoneNumber(fromNumber),
          visitorEmail: null,
        },
      });

      const continuationUrl = `${publicAppUrl}/chat/${encodeURIComponent(String(atlas.slug || atlasId))}`;
      const reply = response.blocked
        ? `This text chat reached its public question limit. Continue here: ${continuationUrl}`
        : formatSmsReply(response.answer, continuationUrl);

      await db.collection('atlas_text_messages').add({
        atlas_id: atlasId,
        atlas_owner_user_id: String(atlas.user_id),
        provider: config.provider,
        from_hash: createHash('sha256').update(fromNumber).digest('hex'),
        to_number: toNumber,
        question_preview: inboundText.slice(0, 500),
        answer_preview: reply.slice(0, 500),
        thread_id: response.threadId,
        created_at: FieldValue.serverTimestamp(),
      });

      const acceptsJson = String(req.get('accept') ?? '').includes('application/json') ||
        String(req.get('content-type') ?? '').includes('application/json');
      if (acceptsJson && !requestField(req, ['SmsMessageSid', 'MessageSid'])) {
        res.status(200).send({ ok: true, answer: reply, threadId: response.threadId });
        return;
      }

      sendTwilioMessage(res, reply);
    } catch (error) {
      logger.error('atlasTextWebhook failed', {
        atlasId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      sendTwilioMessage(res, 'Living Wiki could not answer that text right now. Please try again shortly.', 500);
    }
  },
);

export const getAtlasVoiceAgentConfig = onCall({ region: callableRegion, cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const atlasId = typeof request.data?.atlasId === 'string' ? request.data.atlasId.trim() : '';
  if (!atlasId) {
    throw new HttpsError('invalid-argument', 'atlasId is required.');
  }

  await loadAtlasForAdminAccess(atlasId, request.auth.uid);
  const config = await loadOrCreateVoiceAgentConfig(atlasId);
  return { config: serializeVoiceAgentConfig(atlasId, config) };
});

export const updateAtlasVoiceAgentConfig = onCall({ region: callableRegion, cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const atlasId = typeof request.data?.atlasId === 'string' ? request.data.atlasId.trim() : '';
  if (!atlasId) {
    throw new HttpsError('invalid-argument', 'atlasId is required.');
  }

  await loadAtlasForAdminAccess(atlasId, request.auth.uid);
  const integrationRef = db.collection('atlas_integrations').doc(atlasId);
  const integrationSnapshot = await integrationRef.get();
  const existing = voiceAgentConfigFromStored(integrationSnapshot.data()?.voice_agent);
  const config = normalizeVoiceAgentConfigInput(
    request.data?.config,
    existing?.webhook_token ?? null,
    request.data?.rotateToken === true,
  );

  await integrationRef.set(
    {
      atlas_id: atlasId,
      voice_agent: {
        ...config,
        updated_at: FieldValue.serverTimestamp(),
        updated_by: request.auth.uid,
      },
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { config: serializeVoiceAgentConfig(atlasId, { ...config, updated_at: new Date().toISOString() }) };
});

export const createElevenLabsVoiceSession = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
    secrets: [elevenLabsApiKey],
  },
  async (request) => {
    const startedAt = Date.now();
    const timings: Record<string, number> = {};
    const markTiming = (key: string, since: number): number => {
      const now = Date.now();
      timings[key] = now - since;
      return now;
    };

    const atlasId = normalizeAtlasId(request.data?.atlasId);
    const anonymousVisitorId = normalizeAnonymousVisitorId(request.data?.anonymousVisitorId);
    const uid = request.auth?.uid ?? null;
    if (!uid && !anonymousVisitorId) {
      throw new HttpsError('unauthenticated', 'Authentication or anonymousVisitorId is required.');
    }

    let atlasName = textValue(request.data?.atlasName, 120) || null;
    let checkpoint = Date.now();
    if (atlasId) {
      if (uid) {
        const { atlas } = await loadAtlasForAdminAccess(atlasId, uid);
        atlasName = textValue(atlas.name, 120) || atlasName;
      } else {
        const atlas = await loadPublicAtlasById(atlasId);
        atlasName = textValue(atlas.name, 120) || atlasName;
      }
    }
    checkpoint = markTiming('atlasLoadMs', checkpoint);

    const apiKey = elevenLabsApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'ElevenLabs API key is not configured.');
    }

    const agentId = elevenLabsAgentId.value().trim();
    if (!agentId) {
      throw new HttpsError('failed-precondition', 'ELEVENLABS_AGENT_ID is not configured.');
    }
    if (agentId === chatAnswerVoiceId || /^[a-f0-9]{64}$/i.test(agentId)) {
      throw new HttpsError(
        'failed-precondition',
        'ELEVENLABS_AGENT_ID must be an ElevenLabs Conversational AI agent ID, not a voice ID. Create or open an ElevenLabs agent and use its agent ID.',
      );
    }

    const voicePreference = normalizeElevenLabsVoicePreference(request.data);
    const voiceOverrideEnabled = isTruthyParam(elevenLabsTtsVoiceOverridesEnabled.value());
    const firstMessageOverrideEnabled = elevenLabsFirstMessageOverridesEnabled.value().trim().toLowerCase() !== 'false';
    const voiceCacheKey = elevenLabsVoicePreferenceCacheKey(voicePreference);
    const selectedVoice = voiceOverrideEnabled
      ? await resolveElevenLabsVoiceForPreference(apiKey, voicePreference, voiceCacheKey)
      : null;
    checkpoint = markTiming('voiceResolveMs', checkpoint);
    if (voicePreference.languageCode && !voiceOverrideEnabled) {
      logger.warn('ElevenLabs TTS voice override is disabled; using the agent default voice.', {
        languageCode: voicePreference.languageCode,
        country: voicePreference.country,
      });
    }
    const visitorId = uid ?? anonymousVisitorId ?? `visitor_${randomUUID()}`;
    const params = new URLSearchParams({
      agent_id: agentId,
      participant_name: textValue(request.data?.participantName, 80) || visitorId.slice(0, 80),
      environment: 'production',
    });

    const response = await fetchWithTimeout(`https://api.elevenlabs.io/v1/convai/conversation/token?${params.toString()}`, {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    }, elevenLabsTokenRequestTimeoutMs);
    markTiming('tokenRequestMs', checkpoint);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger.warn('ElevenLabs voice session token request failed', {
        status: response.status,
        body: errorText.slice(0, 500),
      });
      if (response.status === 404 && errorText.includes('agent_not_found')) {
        throw new HttpsError(
          'failed-precondition',
          'ElevenLabs agent not found. Set ELEVENLABS_AGENT_ID to a valid Conversational AI agent ID from ElevenLabs, not the voice ID.',
        );
      }
      throw new HttpsError('internal', 'Failed to start realtime voice.');
    }

    const data = await response.json() as { token?: unknown };
    const conversationToken = typeof data.token === 'string' ? data.token : '';
    if (!conversationToken) {
      throw new HttpsError('internal', 'ElevenLabs did not return a conversation token.');
    }

    timings.totalMs = Date.now() - startedAt;
    logger.info('ElevenLabs voice session prepared.', {
      atlasId,
      uidPresent: Boolean(uid),
      anonymousVisitorIdPresent: Boolean(anonymousVisitorId),
      voiceOverrideEnabled,
      firstMessageOverrideEnabled,
      voiceCacheKey,
      selectedVoiceId: selectedVoice?.voiceId ?? null,
      timings,
    });

    return {
      conversationToken,
      agentId,
      userId: visitorId,
      voiceOverrideEnabled,
      firstMessageOverrideEnabled,
      timings,
      voiceId: selectedVoice?.voiceId ?? null,
      voiceName: selectedVoice?.name ?? null,
      voiceAccent: selectedVoice?.accent ?? voicePreference.accent,
      dynamicVariables: {
        atlas_id: atlasId ?? '',
        atlas_name: atlasName ?? '',
        answer_mode: 'internet',
        visitor_id: visitorId,
        link_delivery_instruction: 'If the user asks for links, websites, maps, addresses, or asks you to send links, tell them the relevant links will be collected and included in the recap email after they hang up. Do not say you cannot send links directly.',
        preferred_language_code: voicePreference.languageCode ?? '',
        preferred_language: voicePreference.language ?? '',
        preferred_country: voicePreference.country ?? '',
        preferred_accent: selectedVoice?.accent ?? voicePreference.accent ?? '',
        selected_voice_id: selectedVoice?.voiceId ?? '',
        selected_voice_name: selectedVoice?.name ?? '',
      },
    };
  },
);

function normalizeElevenLabsVoicePreference(data: unknown): ElevenLabsVoicePreference {
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  return {
    languageCode: textValue(record['voiceLanguageCode'], 24)?.toLowerCase() ?? null,
    language: textValue(record['voiceLanguage'], 80),
    country: textValue(record['voiceCountry'], 80),
    accent: textValue(record['voiceAccent'], 120),
  };
}

function isTruthyParam(value: string): boolean {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(value.trim().toLowerCase());
}

async function resolveElevenLabsVoiceForPreference(
  apiKey: string,
  preference: ElevenLabsVoicePreference,
  cacheKey = elevenLabsVoicePreferenceCacheKey(preference),
): Promise<ElevenLabsResolvedVoice | null> {
  if (!preference.languageCode && !preference.language && !preference.country) {
    return null;
  }

  const cached = readCachedElevenLabsVoice(cacheKey);
  if (cached !== undefined) {
    logger.info('Using cached ElevenLabs native voice selection.', {
      preference,
      cacheKey,
      voiceId: cached?.voiceId ?? null,
      voiceName: cached?.name ?? null,
    });
    return cached;
  }

  const searchStartedAt = Date.now();
  const searchTerms = buildElevenLabsVoiceSearchTerms(preference).slice(0, 4);
  const candidates = new Map<string, ElevenLabsVoiceRecord>();

  for (const term of searchTerms) {
    if (Date.now() - searchStartedAt > elevenLabsVoiceSearchDeadlineMs) {
      logger.warn('ElevenLabs native voice search deadline reached; falling back to agent default voice.', {
        preference,
        cacheKey,
        elapsedMs: Date.now() - searchStartedAt,
      });
      cacheElevenLabsVoice(cacheKey, null);
      return null;
    }
    const remainingMs = Math.max(150, elevenLabsVoiceSearchDeadlineMs - (Date.now() - searchStartedAt));
    const voices = await fetchElevenLabsVoices(apiKey, term, remainingMs);
    for (const voice of voices) {
      const voiceId = textValue(voice.voice_id, 120);
      if (voiceId && !candidates.has(voiceId)) {
        candidates.set(voiceId, voice);
      }
    }
    if (candidates.size >= 40) {
      break;
    }
  }

  let best: ElevenLabsResolvedVoice | null = null;
  for (const voice of candidates.values()) {
    const scored = scoreElevenLabsVoice(voice, preference);
    if (!scored) {
      continue;
    }
    if (!best || scored.score > best.score) {
      best = scored;
    }
  }

  if (!best || best.score < 45) {
    logger.warn('No strong ElevenLabs native voice match found; falling back to agent default voice.', {
      preference,
      best,
    });
    cacheElevenLabsVoice(cacheKey, null);
    return null;
  }

  logger.info('Selected ElevenLabs native voice for realtime accent.', {
    preference,
    voiceId: best.voiceId,
    name: best.name,
    accent: best.accent,
    score: best.score,
    elapsedMs: Date.now() - searchStartedAt,
  });
  cacheElevenLabsVoice(cacheKey, best);
  return best;
}

function elevenLabsVoicePreferenceCacheKey(preference: ElevenLabsVoicePreference): string {
  return [
    preference.languageCode ?? '',
    preference.language ?? '',
    preference.country ?? '',
    preference.accent ?? '',
  ].map((value) => value.trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
}

function readCachedElevenLabsVoice(cacheKey: string): ElevenLabsResolvedVoice | null | undefined {
  const cached = elevenLabsVoiceCache.get(cacheKey);
  if (!cached) {
    return undefined;
  }
  if (Date.now() - cached.cachedAt > elevenLabsVoiceCacheTtlMs) {
    elevenLabsVoiceCache.delete(cacheKey);
    return undefined;
  }
  return cached.voice;
}

function cacheElevenLabsVoice(cacheKey: string, voice: ElevenLabsResolvedVoice | null): void {
  elevenLabsVoiceCache.set(cacheKey, {
    preferenceKey: cacheKey,
    voice,
    cachedAt: Date.now(),
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function buildElevenLabsVoiceSearchTerms(preference: ElevenLabsVoicePreference): string[] {
  const languageName = elevenLabsLanguageSearchName(preference.languageCode, preference.language);
  const country = preference.country ?? '';
  const countryCode = elevenLabsCountryCode(preference.country);
  const accentTerms = elevenLabsAccentSearchTerms(preference.country, preference.languageCode);
  const accent = preference.accent ?? '';
  return Array.from(new Set([
    ...accentTerms.map((term) => [term, languageName, 'native'].filter(Boolean).join(' ')),
    [country, languageName, 'native'].filter(Boolean).join(' '),
    [languageName, countryCode ? `${preference.languageCode}-${countryCode}` : ''].filter(Boolean).join(' '),
    [languageName, country].filter(Boolean).join(' '),
    countryCode ? `${preference.languageCode}-${countryCode}` : '',
    ...accentTerms,
    accent,
    languageName,
    country,
    preference.languageCode ?? '',
  ].map((term) => term.replace(/\s+/g, ' ').trim()).filter(Boolean)));
}

async function fetchElevenLabsVoices(apiKey: string, search: string, timeoutMs: number): Promise<ElevenLabsVoiceRecord[]> {
  const params = new URLSearchParams({ page_size: '100', search });
  let response: Response;
  try {
    response = await fetchWithTimeout(`https://api.elevenlabs.io/v2/voices?${params.toString()}`, {
      method: 'GET',
      headers: { 'xi-api-key': apiKey },
    }, timeoutMs);
  } catch (error) {
    logger.warn('ElevenLabs voice search timed out or failed.', {
      search,
      timeoutMs,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.warn('ElevenLabs voice search failed.', {
      search,
      status: response.status,
      body: body.slice(0, 300),
    });
    return [];
  }

  const data = await response.json().catch(() => null) as { voices?: unknown } | null;
  return Array.isArray(data?.voices) ? data.voices as ElevenLabsVoiceRecord[] : [];
}

function scoreElevenLabsVoice(
  voice: ElevenLabsVoiceRecord,
  preference: ElevenLabsVoicePreference,
): ElevenLabsResolvedVoice | null {
  const voiceId = textValue(voice.voice_id, 120);
  const name = textValue(voice.name, 120) ?? 'ElevenLabs voice';
  if (!voiceId) {
    return null;
  }

  const languageCode = preference.languageCode ?? '';
  const country = (preference.country ?? '').toLowerCase();
  const countryCode = elevenLabsCountryCode(preference.country);
  const accentTerms = elevenLabsAccentSearchTerms(preference.country, preference.languageCode).map((term) => term.toLowerCase());
  const languageName = elevenLabsLanguageSearchName(preference.languageCode, preference.language).toLowerCase();
  const preferredAccent = (preference.accent ?? '').toLowerCase();
  const labels = objectToSearchText(voice.labels);
  const verifiedLanguages = Array.isArray(voice.verified_languages)
    ? voice.verified_languages as ElevenLabsVerifiedLanguage[]
    : [];
  const searchable = [
    name,
    textValue(voice.category, 80) ?? '',
    textValue(voice.description, 500) ?? '',
    labels,
    ...verifiedLanguages.flatMap((entry) => [
      textValue(entry.language, 80) ?? '',
      textValue(entry.accent, 120) ?? '',
      textValue(entry.locale, 40) ?? '',
    ]),
  ].join(' ').toLowerCase();

  let score = 0;
  let matchedAccent: string | null = null;

  for (const entry of verifiedLanguages) {
    const verifiedLanguage = (textValue(entry.language, 80) ?? '').toLowerCase();
    const verifiedLocale = (textValue(entry.locale, 40) ?? '').toLowerCase();
    const verifiedAccent = (textValue(entry.accent, 120) ?? '').toLowerCase();

    if (languageCode && (verifiedLanguage === languageCode || verifiedLocale.startsWith(`${languageCode}-`))) {
      score += 90;
    }
    if (languageName && verifiedLanguage.includes(languageName)) {
      score += 40;
    }
    if (country && verifiedAccent.includes(country)) {
      score += 70;
      matchedAccent = textValue(entry.accent, 120);
    }
    for (const accentTerm of accentTerms) {
      if (verifiedAccent.includes(accentTerm)) {
        score += 85;
        matchedAccent = textValue(entry.accent, 120);
      }
    }
    if (countryCode && verifiedLocale === `${languageCode}-${countryCode}`) {
      score += 110;
      matchedAccent = textValue(entry.accent, 120);
    } else if (countryCode && verifiedLocale.endsWith(`-${countryCode}`)) {
      score += 60;
      matchedAccent = textValue(entry.accent, 120);
    }
    if (preferredAccent && verifiedAccent && preferredAccent.includes(verifiedAccent)) {
      score += 50;
      matchedAccent = textValue(entry.accent, 120);
    }
  }

  if (languageName && searchable.includes(languageName)) {
    score += 28;
  }
  if (country && searchable.includes(country)) {
    score += 36;
  }
  for (const accentTerm of accentTerms) {
    if (searchable.includes(accentTerm)) {
      score += 38;
    }
  }
  if (countryCode && searchable.includes(`-${countryCode}`)) {
    score += 35;
  }
  if (preferredAccent) {
    for (const token of preferredAccent.split(/\s+/).filter((part) => part.length > 4)) {
      if (searchable.includes(token)) {
        score += 8;
      }
    }
  }
  if (searchable.includes('native')) {
    score += 8;
  }
  if (searchable.includes('professional')) {
    score += 4;
  }

  return { voiceId, name, accent: matchedAccent ?? preference.accent, score };
}

function objectToSearchText(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, entry]) => [key, typeof entry === 'string' ? entry : ''])
    .join(' ');
}

function elevenLabsAccentSearchTerms(country: string | null, languageCode: string | null): string[] {
  if (!country) {
    return [];
  }
  const normalized = normalizeCountryName(country);
  const terms: Record<string, string[]> = {
    algeria: ['algerian', 'north african', 'maghrebi'],
    argentina: ['argentinian', 'rioplatense', 'latin american'],
    australia: ['australian'],
    austria: ['austrian'],
    belgium: ['belgian'],
    'bosnia herzegovina': ['bosnian', 'balkan'],
    'bosnia and herzegovina': ['bosnian', 'balkan'],
    brazil: ['brazilian'],
    canada: ['canadian'],
    'cape verde': ['cape verdean', 'cabo verdean'],
    colombia: ['colombian', 'latin american'],
    croatia: ['croatian', 'balkan'],
    curacao: ['caribbean', 'curacaoan', 'curaçaoan'],
    'dr congo': ['congolese', 'central african', 'african french'],
    ecuador: ['ecuadorian', 'latin american'],
    egypt: ['egyptian'],
    england: ['british', 'english'],
    france: ['french from france', 'parisian', 'metropolitan french', 'france french'],
    germany: ['german'],
    ghana: ['ghanaian', 'west african'],
    haiti: ['haitian', 'caribbean french', 'haitian creole'],
    india: ['indian', 'hindi'],
    iran: ['iranian', 'persian'],
    iraq: ['iraqi'],
    'ivory coast': ['ivorian', 'west african', 'african french'],
    japan: ['japanese'],
    jordan: ['jordanian'],
    mexico: ['mexican', 'latin american'],
    morocco: ['moroccan', 'north african', 'maghrebi'],
    netherlands: ['dutch', 'netherlands'],
    'new zealand': ['new zealand', 'kiwi'],
    norway: ['norwegian'],
    panama: ['panamanian', 'latin american'],
    paraguay: ['paraguayan', 'latin american'],
    portugal: ['portuguese from portugal', 'european portuguese'],
    qatar: ['qatari', 'gulf arabic'],
    russia: ['russian'],
    'saudi arabia': ['saudi', 'gulf arabic'],
    scotland: ['scottish'],
    senegal: ['senegalese', 'west african', 'african french'],
    'south africa': ['south african'],
    'south korea': ['korean'],
    spain: ['spanish from spain', 'castilian', 'european spanish'],
    sweden: ['swedish'],
    switzerland: ['swiss'],
    tunisia: ['tunisian', 'north african', 'maghrebi'],
    turkey: ['turkish'],
    turkiye: ['turkish'],
    türkiye: ['turkish'],
    uruguay: ['uruguayan', 'rioplatense', 'latin american'],
    'united states': ['american', 'us english'],
    uzbekistan: ['uzbek', 'central asian'],
  };
  const specificTerms = terms[normalized] ?? [];
  const countryTerm = normalized ? [normalized] : [];
  const languageTerm = languageCode ? [`${languageCode}-${elevenLabsCountryCode(country) ?? ''}`.replace(/-$/, '')] : [];
  return Array.from(new Set([...specificTerms, ...countryTerm, ...languageTerm].filter(Boolean)));
}

function elevenLabsLanguageSearchName(code: string | null, fallback: string | null): string {
  const names: Record<string, string> = {
    ar: 'Arabic',
    bg: 'Bulgarian',
    cs: 'Czech',
    cy: 'Welsh',
    da: 'Danish',
    de: 'German',
    el: 'Greek',
    en: 'English',
    es: 'Spanish',
    fa: 'Persian',
    fi: 'Finnish',
    fr: 'French',
    hi: 'Hindi',
    hr: 'Croatian',
    hu: 'Hungarian',
    id: 'Indonesian',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    ms: 'Malay',
    nl: 'Dutch',
    no: 'Norwegian',
    pl: 'Polish',
    pt: 'Portuguese',
    'pt-br': 'Portuguese',
    ro: 'Romanian',
    ru: 'Russian',
    sk: 'Slovak',
    sr: 'Serbian',
    sv: 'Swedish',
    sw: 'Swahili',
    th: 'Thai',
    tl: 'Filipino',
    tr: 'Turkish',
    uk: 'Ukrainian',
    vi: 'Vietnamese',
    zh: 'Chinese',
  };
  return (code ? names[code] : null) ?? fallback ?? '';
}

function elevenLabsCountryCode(country: string | null): string | null {
  if (!country) {
    return null;
  }
  const normalized = normalizeCountryName(country);
  const codes: Record<string, string> = {
    algeria: 'dz',
    argentina: 'ar',
    australia: 'au',
    austria: 'at',
    belgium: 'be',
    'bosnia herzegovina': 'ba',
    'bosnia and herzegovina': 'ba',
    brazil: 'br',
    bulgaria: 'bg',
    cameroon: 'cm',
    canada: 'ca',
    'cape verde': 'cv',
    china: 'cn',
    colombia: 'co',
    croatia: 'hr',
    curacao: 'cw',
    czechia: 'cz',
    denmark: 'dk',
    'dr congo': 'cd',
    ecuador: 'ec',
    egypt: 'eg',
    england: 'gb',
    finland: 'fi',
    france: 'fr',
    germany: 'de',
    ghana: 'gh',
    greece: 'gr',
    haiti: 'ht',
    hungary: 'hu',
    india: 'in',
    indonesia: 'id',
    iran: 'ir',
    iraq: 'iq',
    italy: 'it',
    'ivory coast': 'ci',
    japan: 'jp',
    'japan j league': 'jp',
    jordan: 'jo',
    kenya: 'ke',
    malaysia: 'my',
    mexico: 'mx',
    morocco: 'ma',
    netherlands: 'nl',
    'new zealand': 'nz',
    nigeria: 'ng',
    norway: 'no',
    panama: 'pa',
    paraguay: 'py',
    philippines: 'ph',
    poland: 'pl',
    portugal: 'pt',
    qatar: 'qa',
    romania: 'ro',
    russia: 'ru',
    'saudi arabia': 'sa',
    scotland: 'gb',
    senegal: 'sn',
    serbia: 'rs',
    slovakia: 'sk',
    'south africa': 'za',
    'south korea': 'kr',
    spain: 'es',
    sweden: 'se',
    switzerland: 'ch',
    thailand: 'th',
    tunisia: 'tn',
    turkey: 'tr',
    turkiye: 'tr',
    türkiye: 'tr',
    ukraine: 'ua',
    'united states': 'us',
    usa: 'us',
    uruguay: 'uy',
    uzbekistan: 'uz',
    vietnam: 'vn',
    wales: 'gb',
  };
  return codes[normalized] ?? null;
}

function normalizeCountryName(country: string): string {
  return country
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

export const elevenLabsLivingWikiInternetTool = onRequest(
  {
    region: callableRegion,
    timeoutSeconds: 180,
    memory: '1GiB',
    secrets: [geminiApiKey],
  },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      res.status(200).send({
        ok: true,
        message: 'Living Wiki ElevenLabs internet voice tool. POST a question to answer from internet mode.',
      });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send({ error: 'Method not allowed.' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const atlasId = normalizeAtlasId(req.query.atlasId) || normalizeAtlasId(body['atlasId']);
    const token =
      textValue(req.query.token, 256) ||
      bearerToken(req.get('authorization')) ||
      textValue(req.get('x-living-wiki-token'), 256);
    if (!atlasId || !token) {
      res.status(401).send({ error: 'Missing atlasId or authorization token.' });
      return;
    }

    try {
      const integrationSnapshot = await db.collection('atlas_integrations').doc(atlasId).get();
      const config = voiceAgentConfigFromStored(integrationSnapshot.data()?.voice_agent);
      if (!config?.enabled || config.webhook_token !== token) {
        res.status(403).send({ error: 'Living Wiki voice agent endpoint is not enabled.' });
        return;
      }

      const question = extractElevenLabsToolQuestion(body);
      if (!question) {
        res.status(200).send({
          answer: 'Ask me a specific question about this living wiki and I can look it up.',
        });
        return;
      }

      const atlas = await loadPublicAtlasById(atlasId);
      const visitorId = normalizeAnonymousVisitorId(body['anonymousVisitorId']) ??
        `elevenlabs_${createHash('sha256').update(`${atlasId}:${token}`).digest('hex').slice(0, 48)}`;
      const response = await runPublicAtlasQuery({
        atlasId,
        atlasOwnerUserId: String(atlas.user_id),
        question,
        answerMode: 'internet',
        anonymousQuestionLimit: null,
        visitor: {
          kind: 'anonymous',
          visitorUserId: null,
          anonymousVisitorId: visitorId,
          visitorDisplayName: 'ElevenLabs voice visitor',
          visitorEmail: null,
        },
      });

      res.status(200).send({
        answer: formatVoiceToolResult(response.answer),
        threadId: response.threadId,
      });
    } catch (error) {
      logger.error('elevenLabsLivingWikiInternetTool failed', {
        atlasId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      res.status(500).send({
        answer: 'Living Wiki could not answer that right now. Please try again shortly.',
      });
    }
  },
);

export const vapiLivingWikiTool = onRequest(
  {
    region: callableRegion,
    timeoutSeconds: 180,
    memory: '1GiB',
    secrets: [geminiApiKey],
  },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      res.status(200).send({
        ok: true,
        message: 'Living Wiki Vapi tool endpoint. Configure this URL as a Vapi custom function tool server URL.',
      });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send({ error: 'Method not allowed.' });
      return;
    }

    const atlasId = normalizeAtlasId(req.query.atlasId);
    const token =
      textValue(req.query.token, 256) ||
      bearerToken(req.get('authorization')) ||
      textValue(req.get('x-living-wiki-token'), 256);

    if (!atlasId || !token) {
      res.status(401).send({ error: 'Missing atlasId or authorization token.' });
      return;
    }

    try {
      const integrationSnapshot = await db.collection('atlas_integrations').doc(atlasId).get();
      const config = voiceAgentConfigFromStored(integrationSnapshot.data()?.voice_agent);
      if (!config?.enabled || config.webhook_token !== token) {
        res.status(403).send({ error: 'Living Wiki voice agent endpoint is not enabled.' });
        return;
      }

      const toolCalls = extractVapiToolCalls(req.body);
      if (toolCalls.length === 0) {
        res.status(200).send({ ok: true, ignored: true });
        return;
      }

      const atlas = await loadPublicAtlasById(atlasId);
      const callId =
        nestedRequestField(req, ['message', 'call', 'id']) ||
        nestedRequestField(req, ['message', 'callId']) ||
        randomUUID();
      const callerNumber =
        nestedRequestField(req, ['message', 'customer', 'number']) ||
        nestedRequestField(req, ['message', 'call', 'customer', 'number']) ||
        nestedRequestField(req, ['message', 'call', 'phoneNumber', 'number']) ||
        null;
      const visitorId = `vapi_${createHash('sha256').update(`${atlasId}:${callId}:${callerNumber ?? ''}`).digest('hex').slice(0, 48)}`;
      const visitorName = callerNumber ? `Vapi caller ${maskPhoneNumber(callerNumber).replace(/^SMS /, '')}` : 'Vapi caller';

      const results = [];
      for (const toolCall of toolCalls) {
        const question = extractToolQuestion(toolCall.arguments);
        if (!question) {
          results.push({
            toolCallId: toolCall.id,
            result: 'Ask me a specific question about the Living Wiki and I can look it up.',
          });
          continue;
        }

        const response = await runPublicAtlasQuery({
          atlasId,
          atlasOwnerUserId: String(atlas.user_id),
          question,
          answerMode: atlas.default_answer_mode === 'internet' ? 'internet' : 'wiki',
          anonymousQuestionLimit: null,
          visitor: {
            kind: 'anonymous',
            visitorUserId: null,
            anonymousVisitorId: visitorId,
            visitorDisplayName: visitorName,
            visitorEmail: null,
          },
        });

        results.push({
          toolCallId: toolCall.id,
          result: formatVoiceToolResult(response.answer),
        });

        await db.collection('atlas_voice_tool_calls').add({
          atlas_id: atlasId,
          atlas_owner_user_id: String(atlas.user_id),
          vapi_call_id: callId,
          vapi_tool_name: toolCall.name,
          caller_hash: callerNumber ? createHash('sha256').update(callerNumber).digest('hex') : null,
          question_preview: question.slice(0, 500),
          answer_preview: response.answer.slice(0, 500),
          thread_id: response.threadId,
          created_at: FieldValue.serverTimestamp(),
        });
      }

      res.status(200).send({ results });
    } catch (error) {
      logger.error('vapiLivingWikiTool failed', {
        atlasId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      res.status(500).send({
        results: [
          {
            toolCallId: firstVapiToolCallId(req.body) ?? 'unknown',
            result: 'Living Wiki could not answer that right now. Please try again shortly.',
          },
        ],
      });
    }
  },
);

export const updateAtlasNewsletterConfig = onCall({ region: callableRegion, cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const atlasId = typeof request.data?.atlasId === 'string' ? request.data.atlasId.trim() : '';
  if (!atlasId) {
    throw new HttpsError('invalid-argument', 'atlasId is required.');
  }

  const { atlasSnapshot, atlas } = await loadAtlasForAdminAccess(atlasId, request.auth.uid);
  const fallbackTimezone =
    atlas.city_config && typeof atlas.city_config === 'object' && typeof (atlas.city_config as Record<string, unknown>).timezone === 'string'
      ? String((atlas.city_config as Record<string, unknown>).timezone)
      : 'America/New_York';
  const config = normalizeNewsletterConfigInput(request.data?.config, fallbackTimezone);
  await atlasSnapshot.ref.set(
    {
      newsletter_config: {
        ...newsletterConfigForWrite(config),
        updated_at: FieldValue.serverTimestamp(),
      },
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    config: {
      ...config,
      updated_at: new Date().toISOString(),
    },
  };
});

export const sendAtlasNewsletterTest = onCall(
  { region: callableRegion, cors: true, secrets: [sendgridApiKey, geminiApiKey], timeoutSeconds: 180, memory: '1GiB' },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const atlasId = typeof request.data?.atlasId === 'string' ? request.data.atlasId.trim() : '';
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    const requestedRecipientEmail = normalizeUserEmail(request.data?.recipientEmail);
    const recipientEmail = requestedRecipientEmail || normalizeUserEmail((request.auth.token ?? {}).email);
    if (!recipientEmail) {
      throw new HttpsError('failed-precondition', 'Enter an email address for the test newsletter.');
    }
    if (!isValidEmail(recipientEmail)) {
      throw new HttpsError('invalid-argument', 'Enter a valid test recipient email address.');
    }

    const { atlas } = await loadAtlasForAdminAccess(atlasId, request.auth.uid);
    const fallbackTimezone =
      atlas.city_config && typeof atlas.city_config === 'object' && typeof (atlas.city_config as Record<string, unknown>).timezone === 'string'
        ? String((atlas.city_config as Record<string, unknown>).timezone)
        : 'America/New_York';
    const config = normalizeNewsletterConfig(request.data?.config ?? atlas.newsletter_config, fallbackTimezone);
    const atlasName = atlasDisplayName(atlas, atlasId);
    const atlasSlug = typeof atlas.slug === 'string' && atlas.slug.trim() ? atlas.slug.trim() : atlasId;
    const content = await generateAtlasNewsletterContent({ atlasId, atlas, config });
    const messageId = await sendNewsletterEmail({
      recipientEmail,
      atlasName,
      subject: `[Test] ${content.subject}`,
      markdown: content.markdown,
      previewText: content.previewText,
      chatUrl: `${publicAppUrl}/chat/${encodeURIComponent(atlasSlug)}`,
      unsubscribeUrl: null,
    });

    await db.collection('atlas_newsletter_runs').add({
      atlas_id: atlasId,
      atlas_name: atlasName,
      mode: 'test',
      recipient_count: 1,
      requested_by: request.auth.uid,
      subject: `[Test] ${content.subject}`,
      sendgrid_message_id: messageId,
      created_at: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      sentTo: recipientEmail,
      subject: `[Test] ${content.subject}`,
      previewText: content.previewText,
      messageId,
    };
  },
);

export const sendWeeklyAtlasNewsletters = onSchedule(
  {
    region: callableRegion,
    schedule: 'every 15 minutes',
    timeZone: 'UTC',
    timeoutSeconds: 540,
    memory: '1GiB',
    maxInstances: 1,
    secrets: [sendgridApiKey, geminiApiKey],
  },
  async () => {
    const snapshot = await db
      .collection('atlases')
      .where('newsletter_config.enabled', '==', true)
      .limit(100)
      .get();

    for (const atlasSnapshot of snapshot.docs) {
      const atlas = atlasSnapshot.data() as Record<string, unknown>;
      const fallbackTimezone =
        atlas.city_config && typeof atlas.city_config === 'object' && typeof (atlas.city_config as Record<string, unknown>).timezone === 'string'
          ? String((atlas.city_config as Record<string, unknown>).timezone)
          : 'America/New_York';
      const config = normalizeNewsletterConfig(atlas.newsletter_config, fallbackTimezone);
      const due = isNewsletterDue(config);
      if (!due.due) {
        continue;
      }

      const atlasId = atlasSnapshot.id;
      const atlasName = atlasDisplayName(atlas, atlasId);
      const atlasSlug = typeof atlas.slug === 'string' && atlas.slug.trim() ? atlas.slug.trim() : atlasId;
      const subscriptions = await listActiveAtlasSubscriptions(atlasId);
      if (subscriptions.length === 0) {
        await atlasSnapshot.ref.set(
          {
            newsletter_config: {
              ...newsletterConfigForWrite(config),
              last_sent_key: due.key,
              last_sent_at: FieldValue.serverTimestamp(),
              last_recipient_count: 0,
            },
            updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        continue;
      }

      try {
        const content = await generateAtlasNewsletterContent({ atlasId, atlas, config });
        let sentCount = 0;
        const messageIds: string[] = [];
        for (const subscription of subscriptions) {
          const email = normalizeUserEmail(subscription.data.email);
          if (!email) {
            continue;
          }
          const token = await ensureSubscriptionUnsubscribeToken(subscription);
          const messageId = await sendNewsletterEmail({
            recipientEmail: email,
            atlasName,
            subject: content.subject,
            markdown: content.markdown,
            previewText: content.previewText,
            chatUrl: `${publicAppUrl}/chat/${encodeURIComponent(atlasSlug)}`,
            unsubscribeUrl: buildSubscriptionUnsubscribeUrl(subscription.id, token),
          });
          sentCount += 1;
          if (messageId) {
            messageIds.push(messageId);
          }
        }

        await atlasSnapshot.ref.set(
          {
            newsletter_config: {
              ...newsletterConfigForWrite(config),
              last_sent_key: due.key,
              last_sent_at: FieldValue.serverTimestamp(),
              last_recipient_count: sentCount,
              last_subject: content.subject,
            },
            updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        await db.collection('atlas_newsletter_runs').add({
          atlas_id: atlasId,
          atlas_name: atlasName,
          mode: 'scheduled',
          recipient_count: sentCount,
          subject: content.subject,
          sendgrid_message_ids: messageIds.slice(0, 20),
          schedule_key: due.key,
          created_at: FieldValue.serverTimestamp(),
        });
      } catch (error) {
        logger.error('Scheduled atlas newsletter failed.', {
          atlasId,
          atlasName,
          error: error instanceof Error ? error.message : String(error),
        });
        await db.collection('atlas_newsletter_runs').add({
          atlas_id: atlasId,
          atlas_name: atlasName,
          mode: 'scheduled',
          status: 'failed',
          schedule_key: due.key,
          error_message: error instanceof Error ? error.message : String(error),
          created_at: FieldValue.serverTimestamp(),
        });
      }
    }
  },
);

async function loadPublicAtlasBySlug(slug: string) {
  const trimmedSlug = slug.trim();
  if (!trimmedSlug) {
    throw new HttpsError('invalid-argument', 'slug is required.');
  }

  const snapshot = await db
    .collection('atlases')
    .where('slug', '==', trimmedSlug)
    .where('is_public', '==', true)
    .limit(1)
    .get();

  const atlasSnapshot = snapshot.docs[0];
  if (!atlasSnapshot) {
    throw new HttpsError('not-found', 'Atlas not found.');
  }

  const atlas = atlasSnapshot.data() as Record<string, unknown>;
  return {
    id: atlasSnapshot.id,
    user_id: String(atlas.user_id ?? ''),
    is_public: atlas.is_public === true,
    ...atlas,
  };
}

async function documentAccessAllowed(requestUid: string | undefined, documentId: string) {
  const document = await loadDocumentRecord(documentId);
  if (requestUid && document.user_id === requestUid) {
    return document;
  }

  if (!document.atlas_id) {
    throw new HttpsError('permission-denied', 'You do not have access to this document.');
  }

  const atlas = await loadPublicAtlasById(document.atlas_id);
  if (atlas.user_id !== document.user_id) {
    throw new HttpsError('permission-denied', 'You do not have access to this document.');
  }
  if (document.visible === false) {
    throw new HttpsError('permission-denied', 'You do not have access to this document.');
  }

  return document;
}

async function findPublicDocumentByFilename(atlasId: string, filename: string) {
  const atlas = await loadPublicAtlasById(atlasId);
  const trimmedFilename = filename.trim();
  if (!trimmedFilename) {
    throw new HttpsError('invalid-argument', 'filename is required.');
  }

  const snapshot = await db
    .collection('documents')
    .where('user_id', '==', atlas.user_id)
    .where('atlas_id', '==', atlas.id)
    .where('filename', '==', trimmedFilename)
    .limit(10)
    .get();

  const candidates: PublicDocumentCandidate[] = snapshot.docs
    .map<PublicDocumentCandidate>((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }))
    .filter((document) => document.visible !== false);

  const exactTitleMatch = candidates.find((document) => String(document.title ?? '').trim() === trimmedFilename);
  if (exactTitleMatch) {
    return exactTitleMatch;
  }

  const indexedCandidate = candidates.find((document) => document.status === 'indexed');
  if (indexedCandidate) {
    return indexedCandidate;
  }

  const firstCandidate = candidates[0];
  if (firstCandidate) {
    return firstCandidate;
  }

  throw new HttpsError('not-found', 'Document file is unavailable.');
}

function normalizeAtlasId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAnonymousVisitorId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) {
    return null;
  }

  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

function normalizeSpeechText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
    .replace(/[`*_#>~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxSpeechTextLength);
}

function cleanSpeechLine(value: string): string {
  return value
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^[\s>*#`~_-]+/, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isWeakSpeechLead(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.length < 35 ||
    /^here'?s\b/.test(normalized) ||
    /^absolutely\b/.test(normalized) ||
    /^sure\b/.test(normalized) ||
    /^quick\s+(take|answer|recap)\b/.test(normalized) ||
    /^short\s+answer\b/.test(normalized) ||
    /^the\s+(gist|bottom line)\b/.test(normalized)
  );
}

function extractSpeechItemLabel(value: string): string {
  const line = cleanSpeechLine(value)
    .replace(/^\*\*([^:*]+):?\*\*:?\s*/g, '$1: ')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();
  const label = line.match(/^(.{4,80}?):\s+\S/)?.[1] ?? line.match(/^(.{4,80}?)[.!?]\s+\S/)?.[1] ?? line;
  return label
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+\|\s+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
}

function buildSpeechListRecap(questionValue: unknown, answerValue: unknown): string | null {
  if (typeof answerValue !== 'string') {
    return null;
  }

  const rawLines = answerValue
    .replace(/\n\s*#{0,3}\s*Sources\b[\s\S]*$/i, '')
    .replace(/\bSources\b[\s\S]*$/i, '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const labels: string[] = [];

  for (const rawLine of rawLines) {
    const looksLikeItem =
      /^\s*(?:[-*•]|\d+[.)])\s+/.test(rawLine) ||
      /^\s*\*\*[^*]{4,80}:?\*\*:/.test(rawLine) ||
      /^\s*#{2,4}\s+/.test(rawLine);
    if (!looksLikeItem) {
      continue;
    }

    const label = extractSpeechItemLabel(rawLine);
    if (!label || isWeakSpeechLead(label)) {
      continue;
    }
    if (!labels.some((existing) => existing.toLowerCase() === label.toLowerCase())) {
      labels.push(label);
    }
    if (labels.length >= 4) {
      break;
    }
  }

  if (labels.length < 2) {
    return null;
  }

  const question = typeof questionValue === 'string' ? questionValue.toLowerCase() : '';
  const noun = question.includes('visit') || question.includes('go') || question.includes('see')
    ? 'places'
    : question.includes('latest') || question.includes('update') || question.includes('news')
      ? 'top updates'
      : 'key points';
  const listText = labels.length === 2
    ? `${labels[0]} and ${labels[1]}`
    : `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
  return `Quick recap: the ${noun} are ${listText}.`.replace(/\s+/g, ' ').slice(0, 300);
}

function chooseSpeechRecapLine(answerValue: unknown): string {
  if (typeof answerValue !== 'string') {
    return '';
  }

  const answerWithoutSources = answerValue
    .replace(/\n\s*#{0,3}\s*Sources\b[\s\S]*$/i, '')
    .replace(/\bSources\b[\s\S]*$/i, '');
  const lines = answerWithoutSources
    .split(/\n+/)
    .map(cleanSpeechLine)
    .filter(Boolean);

  const listItem = lines.find((line) => {
    const rawLine = answerWithoutSources
      .split(/\n+/)
      .find((candidate) => cleanSpeechLine(candidate) === line);
    return Boolean(rawLine?.match(/^\s*(?:[-*•]|\d+[.)])\s+/)) && !isWeakSpeechLead(line);
  });
  if (listItem) {
    return listItem;
  }

  const joined = lines
    .filter((line) => !/^sources$/i.test(line))
    .join(' ');
  const sentences = joined
    .split(/(?<=[.!?])\s+/)
    .map(cleanSpeechLine)
    .filter(Boolean);
  return sentences.find((sentence) => !isWeakSpeechLead(sentence)) ?? sentences[0] ?? '';
}

function buildSpeechRecapText(questionValue: unknown, answerValue: unknown): string {
  const listRecap = buildSpeechListRecap(questionValue, answerValue);
  if (listRecap) {
    return listRecap;
  }

  const answer = chooseSpeechRecapLine(answerValue) || normalizeSpeechText(answerValue);
  if (!answer) {
    return '';
  }

  const words = answer.split(/\s+/).filter(Boolean);
  const recap = words.slice(0, maxSpeechRecapWords).join(' ');
  const clipped = recap.length < answer.length ? recap.replace(/[,:;.-]+$/, '') : recap;
  return `Quick recap: ${clipped}.`.replace(/\s+/g, ' ').slice(0, 300);
}

function textValue(value: unknown, maxLength = 2000): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function generateWebhookToken(): string {
  return createHash('sha256').update(`${randomUUID()}:${Date.now()}`).digest('hex');
}

function buildAtlasTextWebhookUrl(atlasId: string, token: string): string {
  return `${publicFunctionsBaseUrl}/atlasTextWebhook?atlasId=${encodeURIComponent(atlasId)}&token=${encodeURIComponent(token)}`;
}

function buildVapiVoiceToolUrl(atlasId: string, token: string): string {
  return `${publicFunctionsBaseUrl}/vapiLivingWikiTool?atlasId=${encodeURIComponent(atlasId)}&token=${encodeURIComponent(token)}`;
}

function normalizeTextMessagingConfigInput(
  value: unknown,
  existingToken: string | null,
  rotateToken = false,
): AtlasTextMessagingConfig {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const existingProvider = data['provider'] === 'vapi' ? 'vapi' : 'twilio';
  const token = rotateToken || !existingToken ? generateWebhookToken() : existingToken;

  return {
    enabled: data['enabled'] === true,
    provider: existingProvider,
    phone_number: textValue(data['phone_number'], 40),
    vapi_phone_number_id: textValue(data['vapi_phone_number_id'], 120),
    webhook_token: token,
  };
}

function textMessagingConfigFromStored(value: unknown): AtlasTextMessagingConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const data = value as Record<string, unknown>;
  const token = textValue(data['webhook_token'], 256);
  if (!token) {
    return null;
  }

  return {
    enabled: data['enabled'] === true,
    provider: data['provider'] === 'vapi' ? 'vapi' : 'twilio',
    phone_number: textValue(data['phone_number'], 40),
    vapi_phone_number_id: textValue(data['vapi_phone_number_id'], 120),
    webhook_token: token,
    updated_at: data['updated_at'],
  };
}

function serializeTextMessagingConfig(atlasId: string, config: AtlasTextMessagingConfig) {
  return {
    enabled: config.enabled,
    provider: config.provider,
    phone_number: config.phone_number,
    vapi_phone_number_id: config.vapi_phone_number_id,
    webhook_token: config.webhook_token,
    webhook_url: buildAtlasTextWebhookUrl(atlasId, config.webhook_token),
    updated_at: normalizeTimestamp(config.updated_at),
  };
}

async function loadOrCreateTextMessagingConfig(atlasId: string): Promise<AtlasTextMessagingConfig> {
  const integrationRef = db.collection('atlas_integrations').doc(atlasId);
  const integrationSnapshot = await integrationRef.get();
  const existing = textMessagingConfigFromStored(integrationSnapshot.data()?.text_messaging);
  if (existing) {
    return existing;
  }

  const config = normalizeTextMessagingConfigInput(null, null);
  await integrationRef.set(
    {
      atlas_id: atlasId,
      text_messaging: {
        ...config,
        updated_at: FieldValue.serverTimestamp(),
      },
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return config;
}

function normalizeVoiceAgentConfigInput(
  value: unknown,
  existingToken: string | null,
  rotateToken = false,
): AtlasVoiceAgentConfig {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const token = rotateToken || !existingToken ? generateWebhookToken() : existingToken;

  return {
    enabled: data['enabled'] === true,
    phone_number: textValue(data['phone_number'], 40),
    vapi_phone_number_id: textValue(data['vapi_phone_number_id'], 120),
    vapi_assistant_id: textValue(data['vapi_assistant_id'], 120),
    webhook_token: token,
  };
}

function voiceAgentConfigFromStored(value: unknown): AtlasVoiceAgentConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const data = value as Record<string, unknown>;
  const token = textValue(data['webhook_token'], 256);
  if (!token) {
    return null;
  }

  return {
    enabled: data['enabled'] === true,
    phone_number: textValue(data['phone_number'], 40),
    vapi_phone_number_id: textValue(data['vapi_phone_number_id'], 120),
    vapi_assistant_id: textValue(data['vapi_assistant_id'], 120),
    webhook_token: token,
    updated_at: data['updated_at'],
  };
}

function serializeVoiceAgentConfig(atlasId: string, config: AtlasVoiceAgentConfig) {
  return {
    enabled: config.enabled,
    phone_number: config.phone_number,
    vapi_phone_number_id: config.vapi_phone_number_id,
    vapi_assistant_id: config.vapi_assistant_id,
    webhook_token: config.webhook_token,
    tool_url: buildVapiVoiceToolUrl(atlasId, config.webhook_token),
    updated_at: normalizeTimestamp(config.updated_at),
  };
}

async function loadOrCreateVoiceAgentConfig(atlasId: string): Promise<AtlasVoiceAgentConfig> {
  const integrationRef = db.collection('atlas_integrations').doc(atlasId);
  const integrationSnapshot = await integrationRef.get();
  const existing = voiceAgentConfigFromStored(integrationSnapshot.data()?.voice_agent);
  if (existing) {
    return existing;
  }

  const config = normalizeVoiceAgentConfigInput(null, null);
  await integrationRef.set(
    {
      atlas_id: atlasId,
      voice_agent: {
        ...config,
        updated_at: FieldValue.serverTimestamp(),
      },
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return config;
}

function bearerToken(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? textValue(match[1], 256) : null;
}

function requestField(req: HttpRequestLike, names: string[]): string | null {
  const tryRecord = (record: Record<string, unknown> | null) => {
    if (!record) {
      return null;
    }
    for (const name of names) {
      const value = record[name];
      if (Array.isArray(value)) {
        const first = textValue(value[0], 4000);
        if (first) return first;
      } else {
        const text = textValue(value, 4000);
        if (text) return text;
      }
    }
    return null;
  };

  const body = req.body;
  if (body && typeof body === 'object') {
    const value = tryRecord(body as Record<string, unknown>);
    if (value) return value;
  }

  if (typeof body === 'string') {
    const params = new URLSearchParams(body);
    for (const name of names) {
      const value = textValue(params.get(name), 4000);
      if (value) return value;
    }
  }

  const rawBody = req.rawBody;
  if (rawBody?.length) {
    const rawText = rawBody.toString('utf8');
    try {
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      const value = tryRecord(parsed);
      if (value) return value;
    } catch {
      const params = new URLSearchParams(rawText);
      for (const name of names) {
        const value = textValue(params.get(name), 4000);
        if (value) return value;
      }
    }
  }

  return null;
}

function nestedRequestField(req: HttpRequestLike, path: string[]): string | null {
  let current: unknown = req.body;
  for (const part of path) {
    if (!current || typeof current !== 'object') {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return textValue(current, 4000);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatSmsReply(answer: string, continuationUrl: string): string {
  const compact = answer
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (compact.length <= maxSmsReplyLength) {
    return compact;
  }
  return `${compact.slice(0, maxSmsReplyLength - 80).trimEnd()}... More: ${continuationUrl}`;
}

function phoneVisitorId(atlasId: string, phoneNumber: string): string {
  return `sms_${createHash('sha256').update(`${atlasId}:${phoneNumber}`).digest('hex').slice(0, 48)}`;
}

function maskPhoneNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.length >= 4 ? `SMS ${digits.slice(-4)}` : 'SMS visitor';
}

function sendTwilioMessage(res: HttpResponseLike, message: string, status = 200): void {
  res.status(status);
  res.set('Content-Type', 'text/xml; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(`<Response><Message>${xmlEscape(message)}</Message></Response>`);
}

function extractVapiToolCalls(body: unknown): VapiToolCall[] {
  const message = body && typeof body === 'object'
    ? (body as Record<string, unknown>)['message']
    : null;
  const container = message && typeof message === 'object'
    ? message as Record<string, unknown>
    : body && typeof body === 'object'
      ? body as Record<string, unknown>
      : {};
  const candidates = [
    container['toolCallList'],
    container['toolCalls'],
    container['tool_call_list'],
    container['tool_calls'],
  ];
  const list = candidates.find(Array.isArray) as unknown[] | undefined;
  if (!list) {
    const single = container['toolCall'];
    return single && typeof single === 'object'
      ? normalizeVapiToolCalls([single])
      : [];
  }
  return normalizeVapiToolCalls(list);
}

function normalizeVapiToolCalls(list: unknown[]): VapiToolCall[] {
  return list
    .map((item): VapiToolCall | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const data = item as Record<string, unknown>;
      const id = textValue(data['id'] ?? data['toolCallId'] ?? data['tool_call_id'], 160);
      const name = textValue(data['name'] ?? data['functionName'] ?? data['function'] ?? data['toolName'], 120) ?? 'ask_living_wiki';
      const args = normalizeToolArguments(data['arguments'] ?? data['parameters'] ?? data['args']);
      return id ? { id, name, arguments: args } : null;
    })
    .filter((item): item is VapiToolCall => item !== null);
}

function normalizeToolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { question: value };
    }
  }
  return {};
}

function extractToolQuestion(args: Record<string, unknown>): string | null {
  return textValue(args['question'], 1200) ||
    textValue(args['query'], 1200) ||
    textValue(args['prompt'], 1200) ||
    textValue(args['text'], 1200);
}

function extractElevenLabsToolQuestion(body: Record<string, unknown>): string | null {
  const direct = extractToolQuestion(body);
  if (direct) {
    return direct;
  }

  const parameters = body['parameters'];
  if (parameters && typeof parameters === 'object') {
    const question = extractToolQuestion(parameters as Record<string, unknown>);
    if (question) {
      return question;
    }
  }

  const argumentsValue = body['arguments'];
  if (argumentsValue && typeof argumentsValue === 'object') {
    const question = extractToolQuestion(argumentsValue as Record<string, unknown>);
    if (question) {
      return question;
    }
  }

  return null;
}

function firstVapiToolCallId(body: unknown): string | null {
  return extractVapiToolCalls(body)[0]?.id ?? null;
}

function formatVoiceToolResult(answer: string): string {
  const compact = answer
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return compact.slice(0, 4500);
}

function normalizeAnswerCardId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'cardId is required.');
  }

  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(trimmed)) {
    throw new HttpsError('invalid-argument', 'cardId is invalid.');
  }

  return trimmed;
}

function normalizeAnswerQuizId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'quizId is required.');
  }

  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(trimmed)) {
    throw new HttpsError('invalid-argument', 'quizId is invalid.');
  }

  return trimmed;
}

function normalizeOptionalSourceMessageId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{4,160}$/.test(trimmed) ? trimmed : null;
}

function normalizeSourceMessageKind(value: unknown): 'workspace' | 'public' | null {
  return value === 'workspace' || value === 'public' ? value : null;
}

function normalizeAnswerCardLocations(value: unknown): MappableLocation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const locations: MappableLocation[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const data = item as Record<string, unknown>;
    const name = typeof data.name === 'string' ? data.name.replace(/\s+/g, ' ').trim() : '';
    const searchQuery =
      typeof data.search_query === 'string' ? data.search_query.replace(/\s+/g, ' ').trim() : '';
    if (!name || !searchQuery) {
      continue;
    }

    const key = `${name.toLowerCase()}::${searchQuery.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    locations.push({
      name: name.slice(0, 120),
      search_query: searchQuery.slice(0, 240),
      address_hint:
        typeof data.address_hint === 'string' && data.address_hint.trim()
          ? data.address_hint.replace(/\s+/g, ' ').trim().slice(0, 240)
          : null,
    });

    if (locations.length >= 6) {
      break;
    }
  }

  return locations;
}

function normalizeTravelCardShareCard(value: unknown): TravelGuideCard {
  if (!value || typeof value !== 'object') {
    throw new HttpsError('invalid-argument', 'card is required.');
  }

  const data = value as Record<string, unknown>;
  const title = normalizeShareText(data.title, 140);
  const description = normalizeShareText(data.description, 600);
  if (!title || !description) {
    throw new HttpsError('invalid-argument', 'card title and description are required.');
  }

  return {
    id: normalizeShareText(data.id, 120) || 'guide-card',
    title,
    subtitle: normalizeShareText(data.subtitle, 180) || null,
    description,
    neighborhood: normalizeShareText(data.neighborhood, 160) || null,
    best_for: normalizeShareText(data.best_for, 160) || null,
    vibe: normalizeShareText(data.vibe, 80) || null,
    local_tip: normalizeShareText(data.local_tip, 240) || null,
    cost: normalizeShareText(data.cost, 80) || null,
    time_hint: normalizeShareText(data.time_hint, 80) || null,
    image_url: normalizeShareUrl(data.image_url),
    map_query: normalizeShareText(data.map_query, 240) || null,
    source_url: normalizeShareUrl(data.source_url),
  };
}

function normalizeShareText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function normalizeShareUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

async function loadSourceAssistantMessage(params: {
  uid: string | null;
  anonymousVisitorId?: string | null;
  sourceMessageKind: 'workspace' | 'public' | null;
  sourceMessageId: string | null;
  threadId: string | null;
  answer: string;
}): Promise<{
  ref: DocumentReference;
  data: Record<string, unknown>;
  kind: 'workspace' | 'public';
} | null> {
  const sourceKind = params.sourceMessageKind;
  if (!sourceKind) {
    return null;
  }

  const collection = sourceKind === 'public' ? db.collection('public_chat_messages') : db.collection('chat_messages');
  const allowed = (data: Record<string, unknown>) => {
    if (data.role !== 'assistant') {
      return false;
    }
    if (sourceKind === 'public') {
      return (!!params.uid && data.visitor_uid === params.uid) ||
        (!!params.anonymousVisitorId && data.anonymous_visitor_id === params.anonymousVisitorId);
    }
    return !!params.uid && data.user_id === params.uid;
  };

  if (params.sourceMessageId) {
    const snapshot = await collection.doc(params.sourceMessageId).get();
    if (snapshot.exists) {
      const data = snapshot.data() ?? {};
      if (allowed(data) && (!params.threadId || data.thread_id === params.threadId)) {
        return { ref: snapshot.ref, data, kind: sourceKind };
      }
    }
  }

  if (!params.threadId || !params.answer.trim()) {
    return null;
  }

  const snapshot = await collection
    .where('thread_id', '==', params.threadId)
    .limit(80)
    .get();
  const match = snapshot.docs.find((doc) => {
    const data = doc.data();
    return allowed(data) && String(data.text ?? '') === params.answer;
  });

  return match ? { ref: match.ref, data: match.data(), kind: sourceKind } : null;
}

async function loadExistingAnswerCardForSource(params: {
  uid: string | null;
  threadId: string | null;
  answer: string;
}): Promise<{ id: string; data: Record<string, unknown> } | null> {
  if (!params.threadId || !params.answer.trim()) {
    return null;
  }

  const preview = params.answer.slice(0, 900);
  const snapshot = await db.collection('answer_cards')
    .where('source_thread_id', '==', params.threadId)
    .limit(50)
    .get();
  const match = snapshot.docs.find((doc) => {
    const data = doc.data();
    return data.owner_user_id === params.uid && String(data.answer_preview ?? '') === preview;
  });

  return match ? { id: match.id, data: match.data() } : null;
}

function serializeTimestamp(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate(): Date }).toDate()).toISOString();
  }
  return null;
}

function serializeAnswerCard(id: string, data: Record<string, unknown>) {
  return {
    id,
    atlasId: typeof data.atlas_id === 'string' ? data.atlas_id : null,
    atlasName: typeof data.atlas_name === 'string' ? data.atlas_name : null,
    question: String(data.question ?? ''),
    answerPreview: String(data.answer_preview ?? ''),
    title: String(data.title ?? 'A Philly Answer Worth Sharing'),
    subtitle: String(data.subtitle ?? 'A fast, shareable summary from Living Wiki Philly.'),
    keyFacts: Array.isArray(data.key_facts) ? data.key_facts.map(String).filter(Boolean).slice(0, 5) : [],
    didYouKnow: Array.isArray(data.did_you_know) ? data.did_you_know.map(String).filter(Boolean).slice(0, 3) : [],
    mappableLocations: normalizeAnswerCardLocations(data.mappable_locations),
    likeCount: Number(data.like_count ?? 0) || 0,
    sourceThreadId: typeof data.source_thread_id === 'string' ? data.source_thread_id : null,
    sourceAnswerMode: data.source_answer_mode === 'internet' ? 'internet' : data.source_answer_mode === 'wiki' ? 'wiki' : null,
    createdAt: serializeTimestamp(data.created_at),
    updatedAt: serializeTimestamp(data.updated_at),
  };
}

function serializeAnswerQuiz(id: string, data: Record<string, unknown>, leaderboard: unknown[] = []) {
  const questions = normalizeQuizQuestions(data.questions, false);
  return {
    id,
    answerCardId: typeof data.answer_card_id === 'string' ? data.answer_card_id : '',
    atlasId: typeof data.atlas_id === 'string' ? data.atlas_id : null,
    atlasName: typeof data.atlas_name === 'string' ? data.atlas_name : null,
    title: String(data.title ?? 'Philly Knowledge Challenge'),
    description: String(data.description ?? 'Test what you picked up from this Living Wiki Philly answer.'),
    sourceQuestion: String(data.source_question ?? ''),
    questionCount: questions.length,
    questions: questions.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      options: item.options,
    })),
    leaderboard,
    createdAt: serializeTimestamp(data.created_at),
    updatedAt: serializeTimestamp(data.updated_at),
  };
}

function normalizeQuizQuestions(value: unknown, includeCorrect: true): AnswerQuizQuestionRecord[];
function normalizeQuizQuestions(value: unknown, includeCorrect?: false): Array<Omit<AnswerQuizQuestionRecord, 'correct_option_id'> & { correct_option_id?: string }>;
function normalizeQuizQuestions(value: unknown, includeCorrect = false) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item): AnswerQuizQuestionRecord | null => {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const data = item as Record<string, unknown>;
    const id = typeof data.id === 'string' ? data.id.trim() : '';
    const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
    const correctOptionId = typeof data.correct_option_id === 'string' ? data.correct_option_id.trim() : '';
    const explanation = typeof data.explanation === 'string' ? data.explanation.trim() : '';
    const options = Array.isArray(data.options)
      ? data.options.map((option): { id: string; text: string } | null => {
          if (!option || typeof option !== 'object') {
            return null;
          }
          const optionData = option as Record<string, unknown>;
          const optionId = typeof optionData.id === 'string' ? optionData.id.trim() : '';
          const text = typeof optionData.text === 'string' ? optionData.text.trim() : '';
          return optionId && text ? { id: optionId, text } : null;
        }).filter((option): option is { id: string; text: string } => !!option)
      : [];

    if (!id || !prompt || options.length < 2 || !correctOptionId) {
      return null;
    }

    return {
      id,
      prompt,
      options,
      correct_option_id: includeCorrect ? correctOptionId : '',
      explanation,
    };
  }).filter((item): item is AnswerQuizQuestionRecord => !!item);
}

function buildQuizQuestionRecords(questions: Array<{ prompt: string; options: string[]; correct_option_index: number; explanation: string }>): AnswerQuizQuestionRecord[] {
  return questions.slice(0, 8).map((question, questionIndex) => {
    const options = question.options.slice(0, 4).map((text, optionIndex) => ({
      id: String.fromCharCode(97 + optionIndex),
      text: text.slice(0, 140),
    }));
    const correctOption = options[Math.max(0, Math.min(options.length - 1, question.correct_option_index))] ?? options[0];
    return {
      id: `q${questionIndex + 1}`,
      prompt: question.prompt.slice(0, 220),
      options,
      correct_option_id: correctOption?.id ?? 'a',
      explanation: question.explanation.slice(0, 220),
    };
  }).filter((question) => question.options.length === 4);
}

function normalizeQuizAnswers(value: unknown): Map<string, string> {
  const answers = new Map<string, string>();
  if (!Array.isArray(value)) {
    return answers;
  }

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const data = item as Record<string, unknown>;
    const questionId = typeof data.questionId === 'string' ? data.questionId.trim() : '';
    const optionId = typeof data.optionId === 'string' ? data.optionId.trim() : '';
    if (/^q\d{1,2}$/.test(questionId) && /^[a-z]$/.test(optionId)) {
      answers.set(questionId, optionId);
    }
  }
  return answers;
}

function gradeQuiz(questions: AnswerQuizQuestionRecord[], answers: Map<string, string>) {
  const results = questions.map((question) => {
    const selectedOptionId = answers.get(question.id) ?? null;
    const correct = selectedOptionId === question.correct_option_id;
    return {
      questionId: question.id,
      selectedOptionId,
      correctOptionId: question.correct_option_id,
      correct,
      explanation: question.explanation,
    };
  });
  const score = results.filter((result) => result.correct).length;
  return {
    score,
    total: questions.length,
    percent: questions.length > 0 ? Math.round((score / questions.length) * 100) : 0,
    results,
  };
}

function serializeQuizScores(docs: FirebaseFirestore.QueryDocumentSnapshot[]): unknown[] {
  return docs.map((doc, index) => {
    const data = doc.data();
    return {
      rank: index + 1,
      displayName: String(data.display_name ?? 'Living Wiki Player'),
      score: Number(data.score ?? 0) || 0,
      total: Number(data.total ?? 0) || 0,
      percent: Number(data.percent ?? 0) || 0,
      elapsedMs: Number(data.elapsed_ms ?? 0) || 0,
      attempts: Number(data.attempts ?? 1) || 1,
      updatedAt: serializeTimestamp(data.updated_at),
    };
  });
}

async function loadQuizLeaderboard(quizId: string): Promise<unknown[]> {
  const snapshot = await db.collection('answer_quizzes').doc(quizId).collection('scores')
    .orderBy('score', 'desc')
    .limit(25)
    .get();
  return serializeQuizScores(snapshot.docs)
    .sort((a, b) => {
      const left = a as { score: number; elapsedMs: number; updatedAt: string | null };
      const right = b as { score: number; elapsedMs: number; updatedAt: string | null };
      if (right.score !== left.score) return right.score - left.score;
      if (left.elapsedMs !== right.elapsedMs) return left.elapsedMs - right.elapsedMs;
      return String(left.updatedAt ?? '').localeCompare(String(right.updatedAt ?? ''));
    })
    .slice(0, 10)
    .map((item, index) => ({ ...(item as Record<string, unknown>), rank: index + 1 }));
}

async function loadAnswerCardAtlas(atlasId: string | null, uid: string | null): Promise<Record<string, unknown> | null> {
  if (!atlasId) {
    return null;
  }

  const atlasSnapshot = await db.collection('atlases').doc(atlasId).get();
  if (!atlasSnapshot.exists) {
    throw new HttpsError('not-found', 'Atlas not found.');
  }

  const atlas = atlasSnapshot.data() as Record<string, unknown> | undefined;
  const isOwner = !!uid && String(atlas?.user_id ?? '') === uid;
  const isPublic = atlas?.is_public === true;
  if (!isOwner && !isPublic) {
    throw new HttpsError('permission-denied', 'You do not have access to this atlas.');
  }

  return {
    id: atlasSnapshot.id,
    ...atlas,
  };
}

function answerCardLikeDocumentId(cardId: string, visitorId: string): string {
  const hash = createHash('sha256').update(`${cardId}:${visitorId}`).digest('hex').slice(0, 40);
  return `${cardId}_${hash}`;
}

function getPublicChatVisitorContext(request: {
  auth?: { uid?: string; token?: unknown } | null;
  data?: Record<string, unknown>;
}) {
  if (request.auth?.uid) {
    const token = (request.auth.token ?? {}) as { name?: unknown; email?: unknown };
    const displayName = typeof token.name === 'string' && token.name.trim() ? token.name.trim() : null;
    const email = typeof token.email === 'string' && token.email.trim() ? token.email.trim().toLowerCase() : null;

    return {
      kind: 'authenticated' as const,
      visitorUserId: request.auth.uid,
      anonymousVisitorId: null,
      visitorDisplayName: displayName,
      visitorEmail: email,
    };
  }

  const anonymousVisitorId = normalizeAnonymousVisitorId(request.data?.anonymousVisitorId);
  if (!anonymousVisitorId) {
    throw new HttpsError('unauthenticated', 'anonymousVisitorId is required.');
  }

  return {
    kind: 'anonymous' as const,
    visitorUserId: null,
    anonymousVisitorId,
    visitorDisplayName: 'Anonymous',
    visitorEmail: null,
  };
}

export const sendVoiceConversationSummary = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
    secrets: [sendgridApiKey, geminiApiKey, googlePlacesApiKey],
  },
  async (request) => {
    const requesterUid = request.auth?.uid ?? null;
    const anonymousVisitorId = normalizeAnonymousVisitorId(request.data?.anonymousVisitorId);
    if (!requesterUid && !anonymousVisitorId) {
      throw new HttpsError('unauthenticated', 'Authentication or an anonymous visitor session is required.');
    }

    const requestedEmail = normalizeUserEmail(request.data?.recipientEmail);
    const authEmail = normalizeUserEmail((request.auth?.token ?? {}).email);
    const recipientEmail = requestedEmail || authEmail;
    if (!isValidEmail(recipientEmail)) {
      throw new HttpsError('invalid-argument', 'Enter a valid email address.');
    }
    const authToken = (request.auth?.token ?? {}) as { name?: unknown };
    const recipientName = firstNameFromDisplayName(request.data?.recipientName)
      ?? firstNameFromDisplayName(authToken.name);

    const transcript = normalizeVoiceSummaryTranscript(request.data?.transcript);
    const hasUserTurn = transcript.some((item) => item.role === 'user');
    const hasAgentTurn = transcript.some((item) => item.role === 'agent');
    if (transcript.length < 2 || !hasUserTurn || !hasAgentTurn) {
      throw new HttpsError('invalid-argument', 'A voice recap needs at least one user message and one wiki response.');
    }

    const atlasId = normalizeAtlasId(request.data?.atlasId);
    const atlas = await loadAnswerCardAtlas(atlasId, requesterUid);
    const requestAtlasName = typeof request.data?.atlasName === 'string' ? request.data.atlasName.trim().slice(0, 160) : '';
    const requestCityName = typeof request.data?.cityName === 'string' ? request.data.cityName.trim().slice(0, 120) : '';
    const requestCountryName = typeof request.data?.cityCountry === 'string' ? request.data.cityCountry.trim().slice(0, 120) : '';
    const requestAtlasSlug = typeof request.data?.atlasSlug === 'string' ? request.data.atlasSlug.trim().slice(0, 160) : '';
    const cityConfig = atlas?.city_config && typeof atlas.city_config === 'object'
      ? atlas.city_config as Record<string, unknown>
      : null;
    const atlasName = typeof atlas?.name === 'string' && atlas.name.trim()
      ? atlas.name.trim()
      : requestAtlasName || 'Living Wiki';
    const cityName = typeof cityConfig?.city_name === 'string' && cityConfig.city_name.trim()
      ? cityConfig.city_name.trim()
      : requestCityName || null;
    const regionName = typeof cityConfig?.region_name === 'string' && cityConfig.region_name.trim()
      ? cityConfig.region_name.trim()
      : requestCountryName || null;
    const atlasSlug = typeof atlas?.slug === 'string' && atlas.slug.trim()
      ? atlas.slug.trim()
      : requestAtlasSlug || null;
    const continueChatUrl = atlasSlug
      ? `${publicAppUrl}/chat/${encodeURIComponent(atlasSlug)}`
      : publicAppUrl;
    const cityHint = [cityName, regionName].filter(Boolean).join(', ') || null;
    const recap = await generateVoiceConversationRecap({
      atlasName,
      cityHint,
      transcript,
    });
    const summary = buildVoiceConversationSummary({
      atlasName,
      cityName,
      transcript,
      recap,
    });
    const extractedLocations = await extractMappableLocations({
      question: transcript.filter((item) => item.role === 'user').map((item) => item.text).join('\n').slice(0, 2000),
      answer: summary.contextualAnswer,
      atlasName,
      cityHint,
    });
    const suggestedPlaces = [
      ...(recap.suggested_places ?? []),
      ...extractedLocations.map((location) => ({
        name: location.name,
        reason: 'Mentioned in your voice conversation.',
        search_query: location.search_query,
      })),
    ];
    const resolvedPlaces = await resolveVoiceConversationPlaceLinks({
      atlas,
      cityHint,
      suggestedPlaces,
    });
    const firstUserQuestion = transcript.find((item) => item.role === 'user')?.text
      ?? `Voice conversation about ${cityName || atlasName}`;
    const cardAnswer = [
      summary.contextualAnswer,
      summary.summary,
      summary.keyQuestions.length ? `Questions:\n${summary.keyQuestions.map((item) => `- ${item}`).join('\n')}` : '',
      summary.takeaways.length ? `Useful takeaways:\n${summary.takeaways.map((item) => `- ${item}`).join('\n')}` : '',
      resolvedPlaces.links.length
        ? `Places and links:\n${resolvedPlaces.links.map((place) => `- ${place.name}${place.address ? `, ${place.address}` : ''}${place.websiteUrl ? `\n  Website: ${place.websiteUrl}` : ''}\n  Maps: ${place.googleMapsUrl}`).join('\n')}`
        : '',
      `Transcript:\n${summary.transcriptText}`,
    ].filter(Boolean).join('\n\n');
    let answerCardId: string | null = null;
    let answerCardUrl: string | null = null;

    if (request.data?.createAnswerCard !== false) {
      try {
        const card = await createVoiceConversationAnswerCard({
          uid: requesterUid,
          atlasId,
          atlasName,
          cityHint,
          question: firstUserQuestion,
          answer: cardAnswer,
          locations: resolvedPlaces.locations,
        });
        answerCardId = card?.id ?? null;
        answerCardUrl = card?.url ?? null;
      } catch (error) {
        logger.warn('Voice conversation recap card generation failed; continuing with email only.', {
          atlasId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const apiKey = sendgridApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'SendGrid API key is not configured.');
    }

    sgMail.setApiKey(apiKey);
    const email = buildVoiceConversationSummaryEmail({
      recipientEmail,
      recipientName,
      atlasName,
      cityName,
      summary,
      answerCardUrl,
      placeLinks: resolvedPlaces.links,
      continueChatUrl,
    });
    const [response] = await sgMail.send({
      to: recipientEmail,
      from: {
        email: inviteSenderEmail,
        name: 'Living Wiki',
      },
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    const docRef = db.collection('voice_conversation_summaries').doc();
    await docRef.set({
      user_id: requesterUid,
      anonymous_visitor_id: requesterUid ? null : anonymousVisitorId,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      atlas_id: atlasId,
      atlas_name: atlasName,
      atlas_slug: atlasSlug,
      city_name: cityName,
      city_region: regionName,
      language: typeof request.data?.language === 'string' ? request.data.language.trim().slice(0, 80) : null,
      country: typeof request.data?.country === 'string' ? request.data.country.trim().slice(0, 80) : null,
      conversation_id: typeof request.data?.conversationId === 'string' ? request.data.conversationId.trim().slice(0, 160) : null,
      summary_title: summary.title,
      summary_text: summary.summary,
      contextual_answer: summary.contextualAnswer,
      key_questions: summary.keyQuestions,
      takeaways: summary.takeaways,
      place_links: resolvedPlaces.links,
      transcript_count: transcript.length,
      transcript_preview: summary.transcriptText.slice(0, 2000),
      answer_card_id: answerCardId,
      continue_chat_url: continueChatUrl,
      sendgrid_status_code: response.statusCode,
      sendgrid_message_id: response.headers?.['x-message-id'] ?? null,
      created_at: FieldValue.serverTimestamp(),
    });

    logger.info('Voice conversation summary email accepted by SendGrid.', {
      summaryId: docRef.id,
      atlasId,
      recipientEmail,
      statusCode: response.statusCode,
      answerCardId,
    });

    return {
      sent: true,
      summaryId: docRef.id,
      recipientEmail,
      summary: summary.summary,
      answerCardId,
      answerCardUrl,
      continueChatUrl,
    };
  },
);

export const prepareDocumentUpload = onCall({ region: callableRegion, cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const filename = String(request.data?.filename ?? '').trim();
  const mimeType = String(request.data?.mimeType ?? '').trim() || null;
  const fileSize = Number(request.data?.fileSize ?? 0);
  const atlasId = normalizeAtlasId(request.data?.atlasId);

  if (!filename) {
    throw new HttpsError('invalid-argument', 'filename is required.');
  }

  let fileType;
  try {
    fileType = detectFileType(filename, mimeType);
  } catch (error) {
    throw new HttpsError(
      'invalid-argument',
      error instanceof Error ? error.message : 'Unsupported file type.',
    );
  }

  const documentRef = db.collection('documents').doc();
  const storagePath = buildStoragePath(request.auth.uid, documentRef.id, filename);

  await assertAtlasOwner(atlasId, request.auth.uid);

  await documentRef.set(
    newDocumentRecord({
      userId: request.auth.uid,
      filename,
      fileType,
      storagePath,
      sourceType: 'file',
      mimeType,
      fileSize: Number.isFinite(fileSize) ? fileSize : null,
      atlasId,
    }),
  );

  return {
    documentId: documentRef.id,
    storagePath,
    fileType,
    createdAt: clientTimestamp().toMillis(),
  };
});

export const getPublicAtlasBySlug = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const slug = String(request.data?.slug ?? '').trim();
    if (!slug) {
      throw new HttpsError('invalid-argument', 'slug is required.');
    }

    const atlas = await loadPublicAtlasBySlug(slug);
    return {
      atlas: await serializePublicAtlas(atlas.id, atlas),
    };
  },
);

export const submitUrlDocument = onCall(
  { region: callableRegion, cors: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const url = String(request.data?.url ?? '').trim();
    const atlasId = normalizeAtlasId(request.data?.atlasId);
    if (!url) {
      throw new HttpsError('invalid-argument', 'url is required.');
    }

    try {
      new URL(url);
    } catch {
      throw new HttpsError('invalid-argument', 'Enter a valid URL.');
    }

    await assertAtlasOwner(atlasId, request.auth.uid);

    const documentRef = db.collection('documents').doc();
    await documentRef.set(
      newDocumentRecord({
        userId: request.auth.uid,
        filename: url,
        fileType: 'url',
        storagePath: null,
        sourceType: 'url',
        sourceUrl: url,
        title: url,
        atlasId,
      }),
    );

    return { documentId: documentRef.id };
  },
);

export const importGoogleDriveFiles = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 540,
    memory: '1GiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const accessToken = String(request.data?.accessToken ?? '').trim();
    const atlasId = normalizeAtlasId(request.data?.atlasId);
    const selectedFiles = normalizeGoogleDriveSelections(request.data?.files);

    if (!accessToken) {
      throw new HttpsError('invalid-argument', 'Google Drive accessToken is required.');
    }
    if (selectedFiles.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one Google Drive file is required.');
    }

    await assertAtlasOwner(atlasId, request.auth.uid);

    const imported: Array<{ documentId: string; filename: string; title: string | null }> = [];
    const failed: Array<{ fileId: string; name: string | null; error: string }> = [];

    for (const selectedFile of selectedFiles) {
      let metadata: GoogleDriveFileMetadata | null = null;
      let plan: GoogleDriveImportPlan | null = null;
      let documentId: string | null = null;

      try {
        metadata = await fetchGoogleDriveMetadata(accessToken, selectedFile.id);
        plan = resolveGoogleDriveImportPlan(metadata);
        const buffer = await fetchGoogleDriveFileBuffer({
          accessToken,
          fileId: metadata.id,
          plan,
        });

        const documentRef = db.collection('documents').doc();
        documentId = documentRef.id;
        const storagePath = buildStoragePath(request.auth.uid, documentRef.id, plan.filename);

        await documentRef.set(
          newDocumentRecord({
            userId: request.auth.uid,
            filename: plan.filename,
            fileType: plan.fileType,
            storagePath,
            sourceType: 'file',
            mimeType: plan.uploadMimeType,
            fileSize: buffer.byteLength,
            title: plan.title,
            atlasId,
          }),
        );

        await storage.bucket().file(storagePath).save(buffer, {
          resumable: false,
          metadata: {
            contentType: plan.uploadMimeType,
            metadata: {
              documentId: documentRef.id,
              originalFilename: plan.filename,
              sourceProvider: 'google_drive',
              sourceFileId: metadata.id,
            },
          },
        });

        imported.push({
          documentId: documentRef.id,
          filename: plan.filename,
          title: plan.title,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Google Drive import failed.';

        if (documentId) {
          await db.collection('documents').doc(documentId).set(
            {
              status: 'failed',
              processing_stage: 'failed',
              last_heartbeat_at: FieldValue.serverTimestamp(),
              error_message: message,
              failure_code: 'google_drive_import_failed',
            },
            { merge: true },
          );
        }

        failed.push({
          fileId: selectedFile.id,
          name: metadata?.name ?? selectedFile.name ?? null,
          error: message,
        });
      }
    }

    return { imported, failed };
  },
);

export const retryStaleUrlDocuments = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const atlasId = normalizeAtlasId(request.data?.atlasId);
    await assertAtlasOwner(atlasId, request.auth.uid);

    const staleMinutes = Math.max(
      staleIngestionThresholdMinutes,
      Number(request.data?.staleMinutes ?? staleIngestionThresholdMinutes) || staleIngestionThresholdMinutes,
    );
    const limit = Math.min(
      staleRetryBatchLimit,
      Math.max(1, Number(request.data?.limit ?? defaultRetryLimit) || defaultRetryLimit),
    );
    const staleDocuments = await collectStaleUrlDocuments({
      userId: request.auth.uid,
      atlasId,
      staleMinutes,
      limit,
    });

    if (staleDocuments.length === 0) {
      return { retriedCount: 0, documentIds: [] };
    }

    await requeueStaleUrlDocuments(staleDocuments);

    return {
      retriedCount: staleDocuments.length,
      documentIds: staleDocuments.map((doc) => doc.id),
    };
  },
);

export const sweepStaleUrlDocuments = onSchedule(
  {
    region: callableRegion,
    schedule: 'every 15 minutes',
    timeZone: 'America/Los_Angeles',
    timeoutSeconds: 300,
    memory: '256MiB',
    maxInstances: 1,
  },
  async () => {
    const staleDocuments = await collectStaleUrlDocuments({
      userId: null,
      atlasId: null,
      staleMinutes: staleIngestionThresholdMinutes,
      limit: staleRetryBatchLimit,
    });

    if (staleDocuments.length === 0) {
      logger.info('sweepStaleUrlDocuments found no stale URL documents');
      return;
    }

    await requeueStaleUrlDocuments(staleDocuments);
    logger.warn('sweepStaleUrlDocuments requeued stale URL documents', {
      count: staleDocuments.length,
      documentIds: staleDocuments.slice(0, 25).map((doc) => doc.id),
    });
  },
);

export const askAtlas = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 180,
    memory: '1GiB',
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const question = String(request.data?.question ?? '').trim();
    const threadId = String(request.data?.threadId ?? '').trim() || null;
    const atlasId = normalizeAtlasId(request.data?.atlasId);
    const answerMode = request.data?.answerMode === 'internet' ? 'internet' : 'wiki';
    const topicIds = Array.isArray(request.data?.topicIds)
      ? request.data.topicIds.map((value: unknown) => String(value)).filter(Boolean)
      : undefined;

    if (!question) {
      throw new HttpsError('invalid-argument', 'question is required.');
    }

    try {
      return await runAtlasQuery({
        userId: request.auth.uid,
        atlasId,
        answerMode,
        question,
        topicIds,
        threadId,
      });
    } catch (error) {
      logger.error('askAtlas failed', { errorMessage: error instanceof Error ? error.message : String(error) });
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to answer question.',
      );
    }
  },
);

export const createAnswerCard = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 90,
    memory: '512MiB',
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request) => {
    const question = String(request.data?.question ?? '').replace(/\s+/g, ' ').trim();
    const answer = String(request.data?.answer ?? '').trim();
    if (!question) {
      throw new HttpsError('invalid-argument', 'question is required.');
    }
    if (!answer) {
      throw new HttpsError('invalid-argument', 'answer is required.');
    }

    const requesterUid = request.auth?.uid ?? null;
    const anonymousVisitorId = normalizeAnonymousVisitorId(request.data?.anonymousVisitorId);
    const sourceMessageKind = normalizeSourceMessageKind(request.data?.sourceMessageKind);
    if (!requesterUid && (!anonymousVisitorId || sourceMessageKind !== 'public')) {
      throw new HttpsError('unauthenticated', 'Authentication or a public anonymous visitor session is required.');
    }

    const atlasId = normalizeAtlasId(request.data?.atlasId);
    const atlas = await loadAnswerCardAtlas(atlasId, requesterUid);
    const atlasName = typeof atlas?.name === 'string' ? atlas.name : null;
    const cityConfig = atlas?.city_config && typeof atlas.city_config === 'object'
      ? atlas.city_config as Record<string, unknown>
      : null;
    const cityName = typeof cityConfig?.city_name === 'string' ? cityConfig.city_name : null;
    const regionName = typeof cityConfig?.region_name === 'string' ? cityConfig.region_name : null;
    const cityHint = [cityName, regionName].filter(Boolean).join(', ') || null;
    const locations = normalizeAnswerCardLocations(request.data?.mappableLocations);
    const threadId = typeof request.data?.threadId === 'string' && request.data.threadId.trim()
      ? request.data.threadId.trim().slice(0, 160)
      : null;
    const answerMode = request.data?.answerMode === 'internet' ? 'internet' : request.data?.answerMode === 'wiki' ? 'wiki' : null;
    const sourceMessageId = normalizeOptionalSourceMessageId(request.data?.sourceMessageId);
    const sourceMessage = await loadSourceAssistantMessage({
      uid: requesterUid,
      anonymousVisitorId,
      sourceMessageKind,
      sourceMessageId,
      threadId,
      answer,
    });

    const existingMessageCardId = typeof sourceMessage?.data.answer_card_id === 'string'
      ? sourceMessage.data.answer_card_id
      : null;
    if (existingMessageCardId) {
      const snapshot = await db.collection('answer_cards').doc(existingMessageCardId).get();
      if (snapshot.exists) {
        return { card: serializeAnswerCard(snapshot.id, snapshot.data() ?? {}) };
      }
    }

    const existingSourceCard = await loadExistingAnswerCardForSource({
      uid: requesterUid,
      threadId,
      answer,
    });
    if (existingSourceCard) {
      const sourcePatch = sourceMessage
        ? {
            source_message_id: sourceMessage.ref.id,
            source_message_kind: sourceMessage.kind,
            updated_at: FieldValue.serverTimestamp(),
          }
        : null;
      await Promise.all([
        sourceMessage?.ref.set({ answer_card_id: existingSourceCard.id }, { merge: true }) ?? Promise.resolve(),
        sourcePatch
          ? db.collection('answer_cards').doc(existingSourceCard.id).set(sourcePatch, { merge: true })
          : Promise.resolve(),
      ]);
      return {
        card: serializeAnswerCard(existingSourceCard.id, {
          ...existingSourceCard.data,
          ...(sourcePatch ?? {}),
        }),
      };
    }

    try {
      const generated = await generateAnswerCard({
        question: question.slice(0, 2000),
        answer: answer.slice(0, 8000),
        atlasName,
        cityHint,
        locations,
      });
      const record: AnswerCardRecord = {
        owner_user_id: requesterUid,
        atlas_id: atlasId,
        atlas_name: atlasName,
        question: question.slice(0, 2000),
        answer_preview: answer.slice(0, 900),
        title: generated.title,
        subtitle: generated.subtitle,
        key_facts: generated.key_facts,
        did_you_know: generated.did_you_know,
        mappable_locations: locations,
        source_thread_id: threadId,
        source_message_id: sourceMessage?.ref.id ?? null,
        source_message_kind: sourceMessage?.kind ?? sourceMessageKind,
        source_answer_mode: answerMode,
        answer_quiz_id: null,
        like_count: 0,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };

      const docRef = db.collection('answer_cards').doc();
      await docRef.set(record);
      if (sourceMessage) {
        await sourceMessage.ref.set({ answer_card_id: docRef.id }, { merge: true });
      }
      const snapshot = await docRef.get();
      const savedRecord = snapshot.data() ?? (record as unknown as Record<string, unknown>);
      return { card: serializeAnswerCard(docRef.id, savedRecord) };
    } catch (error) {
      logger.error('createAnswerCard failed', { errorMessage: error instanceof Error ? error.message : String(error) });
      throw new HttpsError('internal', error instanceof Error ? error.message : 'Failed to create answer card.');
    }
  },
);

export const createTravelCardShare = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const card = normalizeTravelCardShareCard(request.data?.card);
    const atlasId = normalizeAtlasId(request.data?.atlasId);
    const atlasName = normalizeShareText(request.data?.atlasName, 120) || null;
    const guideTitle = normalizeShareText(request.data?.guideTitle, 160) || null;
    const guideSummary = normalizeShareText(request.data?.guideSummary, 240) || null;
    const question = normalizeShareText(request.data?.question, 500) || null;
    const sourceThreadId = typeof request.data?.threadId === 'string' && request.data.threadId.trim()
      ? request.data.threadId.trim().slice(0, 160)
      : null;
    const sourceMessageId = normalizeOptionalSourceMessageId(request.data?.sourceMessageId);
    const ownerUserId = request.auth?.uid ?? null;
    const shareHash = createHash('sha256')
      .update(JSON.stringify({
        ownerUserId,
        atlasId,
        atlasName,
        guideTitle,
        guideSummary,
        question,
        sourceThreadId,
        sourceMessageId,
        card,
      }))
      .digest('hex')
      .slice(0, 36);
    const docRef = db.collection('travel_card_shares').doc(`tc_${shareHash}`);

    await docRef.set(
      {
        owner_user_id: ownerUserId,
        atlas_id: atlasId,
        atlas_name: atlasName,
        guide_title: guideTitle,
        guide_summary: guideSummary,
        question,
        source_thread_id: sourceThreadId,
        source_message_id: sourceMessageId,
        card,
        updated_at: FieldValue.serverTimestamp(),
        created_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      share: {
        id: docRef.id,
        url: `${publicAppUrl}/share/travel-card/${docRef.id}`,
      },
    };
  },
);

type BoardQuizOption = {
  id: string;
  text: string;
};

type BoardQuizQuestion = {
  id: string;
  sourceCardId: string;
  sourceCardTitle: string;
  prompt: string;
  options: BoardQuizOption[];
  correctOptionId: string;
  explanation: string;
};

type BoardQuiz = {
  id: string;
  title: string;
  published: boolean;
  leaderboardEnabled: boolean;
  allowGuestNames: boolean;
  questions: BoardQuizQuestion[];
  updatedAt: string;
  versionHash: string;
};

function boardQuizString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

function normalizeBoardQuizIdentifier(value: unknown, fieldName: string): string {
  const id = boardQuizString(value, 160);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new HttpsError('invalid-argument', `${fieldName} is invalid.`);
  }
  return id;
}

function normalizeStoredBoardQuiz(value: unknown): BoardQuiz | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const questions = Array.isArray(data.questions)
    ? data.questions
        .map((question): BoardQuizQuestion | null => {
          if (!question || typeof question !== 'object') {
            return null;
          }
          const entry = question as Record<string, unknown>;
          const options = Array.isArray(entry.options)
            ? entry.options
                .map((option): BoardQuizOption | null => {
                  if (!option || typeof option !== 'object') {
                    return null;
                  }
                  const optionData = option as Record<string, unknown>;
                  const id = boardQuizString(optionData.id, 160);
                  const text = boardQuizString(optionData.text, 160);
                  return id && text ? { id, text } : null;
                })
                .filter((option): option is BoardQuizOption => Boolean(option))
                .slice(0, 4)
            : [];
          const id = boardQuizString(entry.id, 160);
          const sourceCardId = boardQuizString(entry.sourceCardId, 160);
          const prompt = boardQuizString(entry.prompt, 360);
          const correctOptionId = boardQuizString(entry.correctOptionId, 160);
          if (
            !id
            || !sourceCardId
            || !prompt
            || options.length < 2
            || !options.some((option) => option.id === correctOptionId)
          ) {
            return null;
          }
          return {
            id,
            sourceCardId,
            sourceCardTitle: boardQuizString(entry.sourceCardTitle, 120),
            prompt,
            options,
            correctOptionId,
            explanation: boardQuizString(entry.explanation, 500),
          };
        })
        .filter((question): question is BoardQuizQuestion => Boolean(question))
        .slice(0, 12)
    : [];
  const id = boardQuizString(data.id, 160);
  const title = boardQuizString(data.title, 120);
  if (!id || !title || questions.length < 3) {
    return null;
  }
  const versionHash = createHash('sha256')
    .update(JSON.stringify(questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options,
      correctOptionId: question.correctOptionId,
      sourceCardId: question.sourceCardId,
    }))))
    .digest('hex')
    .slice(0, 24);
  return {
    id,
    title,
    published: data.published === true,
    leaderboardEnabled: data.leaderboardEnabled === true,
    allowGuestNames: data.allowGuestNames === true,
    questions,
    updatedAt: boardQuizString(data.updatedAt, 80),
    versionHash,
  };
}

function boardQuizGuestSessionId(value: unknown): string {
  const sessionId = boardQuizString(value, 120);
  return /^[A-Za-z0-9_-]{16,120}$/.test(sessionId) ? sessionId : '';
}

function boardQuizIdentityHash(boardId: string, quizId: string, identity: string): string {
  return createHash('sha256').update(`${boardId}:${quizId}:${identity}`).digest('hex');
}

function boardQuizMillis(value: unknown): number {
  return Math.max(0, Math.min(Number(value ?? 0) || 0, 24 * 60 * 60 * 1000));
}

function normalizeBoardQuizAnswers(value: unknown): Map<string, string> {
  const answers = new Map<string, string>();
  if (!Array.isArray(value)) {
    return answers;
  }
  for (const answer of value.slice(0, 12)) {
    if (!answer || typeof answer !== 'object') {
      continue;
    }
    const entry = answer as Record<string, unknown>;
    const questionId = boardQuizString(entry.questionId, 160);
    const optionId = boardQuizString(entry.optionId, 160);
    if (questionId && optionId) {
      answers.set(questionId, optionId);
    }
  }
  return answers;
}

function gradeStoredBoardQuiz(quiz: BoardQuiz, answers: Map<string, string>) {
  const results = quiz.questions.map((question) => {
    const selectedOptionId = answers.get(question.id) ?? null;
    return {
      questionId: question.id,
      selectedOptionId,
      correctOptionId: question.correctOptionId,
      correct: selectedOptionId === question.correctOptionId,
      sourceCardId: question.sourceCardId,
      explanation: question.explanation,
    };
  });
  const score = results.filter((result) => result.correct).length;
  return {
    score,
    total: results.length,
    percent: results.length ? Math.round((score / results.length) * 100) : 0,
    results,
  };
}

export const submitBoardQuizAttempt = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const boardId = normalizeBoardQuizIdentifier(request.data?.boardId, 'boardId');
    const quizId = normalizeBoardQuizIdentifier(request.data?.quizId, 'quizId');
    const boardSnapshot = await db.collection('boards').doc(boardId).get();
    if (!boardSnapshot.exists) {
      throw new HttpsError('not-found', 'Board not found.');
    }
    const board = boardSnapshot.data() ?? {};
    const ownerUserId = boardQuizString(board.owner_user_id, 160);
    const memberUserId = request.auth?.uid ?? '';
    if (board.visibility !== 'public' && ownerUserId !== memberUserId) {
      throw new HttpsError('permission-denied', 'You do not have access to this quiz.');
    }
    const quiz = normalizeStoredBoardQuiz(board.learningQuiz);
    if (!quiz?.published || quiz.id !== quizId) {
      throw new HttpsError('failed-precondition', 'This board quiz is not published.');
    }

    const answers = normalizeBoardQuizAnswers(request.data?.answers);
    const hasCompleteValidAnswers = quiz.questions.every((question) => {
      const optionId = answers.get(question.id);
      return Boolean(optionId && question.options.some((option) => option.id === optionId));
    });
    if (!hasCompleteValidAnswers || answers.size !== quiz.questions.length) {
      throw new HttpsError('invalid-argument', 'Answer every quiz question before submitting.');
    }
    const grade = gradeStoredBoardQuiz(quiz, answers);
    const elapsedMs = boardQuizMillis(request.data?.elapsedMs);
    const token = (request.auth?.token ?? {}) as { name?: unknown; email?: unknown; picture?: unknown };
    const guestName = boardQuizString(request.data?.guestName, 40)
      .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
      .trim();
    const guestSessionId = boardQuizGuestSessionId(request.data?.guestSessionId);
    const participantType = memberUserId ? 'member' : 'guest';
    if (!memberUserId) {
      if (!quiz.leaderboardEnabled || !quiz.allowGuestNames) {
        throw new HttpsError('unauthenticated', 'Sign in to save your board quiz result.');
      }
      if (
        guestName.length < 2
        || !guestSessionId
        || /(?:https?:\/\/|www\.)/i.test(guestName)
      ) {
        throw new HttpsError('invalid-argument', 'A guest name and quiz session are required.');
      }
    }
    const displayName = memberUserId
      ? boardQuizString(token.name, 80)
        || (typeof token.email === 'string' ? boardQuizString(token.email.split('@')[0], 80) : '')
        || 'Living Wiki Learner'
      : guestName;
    const photoUrl = memberUserId ? boardQuizString(token.picture, 1000) : '';
    const identity = memberUserId ? `member:${memberUserId}` : `guest:${guestSessionId}`;
    const identityHash = boardQuizIdentityHash(boardId, quiz.id, identity);
    const attemptRef = db.collection('board_quiz_attempts').doc();
    const scoreRef = db.collection('board_quiz_scores').doc(`bqs_${identityHash.slice(0, 48)}`);
    const shouldPublishScore = quiz.leaderboardEnabled && (participantType === 'member' || quiz.allowGuestNames);

    await db.runTransaction(async (transaction) => {
      const previousScoreSnapshot = shouldPublishScore ? await transaction.get(scoreRef) : null;
      transaction.set(attemptRef, {
        board_id: boardId,
        board_owner_user_id: ownerUserId,
        quiz_id: quiz.id,
        quiz_version: quiz.versionHash,
        quiz_updated_at: quiz.updatedAt,
        participant_type: participantType,
        identity_hash: identityHash,
        user_id: memberUserId || null,
        display_name: displayName,
        score: grade.score,
        total: grade.total,
        percent: grade.percent,
        elapsed_ms: elapsedMs,
        results: grade.results.map((result) => ({
          question_id: result.questionId,
          source_card_id: result.sourceCardId,
          correct: result.correct,
        })),
        created_at: FieldValue.serverTimestamp(),
      });

      if (!shouldPublishScore) {
        return;
      }
      const previous = previousScoreSnapshot?.data() ?? {};
      const sameQuizVersion = previous.quiz_version === quiz.versionHash;
      const previousBestScore = sameQuizVersion ? Number(previous.score ?? -1) : -1;
      const previousBestElapsed = sameQuizVersion
        ? Number(previous.elapsed_ms ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
      const isBetter = grade.score > previousBestScore
        || (grade.score === previousBestScore && elapsedMs > 0 && elapsedMs < previousBestElapsed);
      const attempts = (sameQuizVersion ? Math.max(0, Number(previous.attempts ?? 0) || 0) : 0) + 1;
      const scoreRecord: Record<string, unknown> = {
        board_id: boardId,
        board_owner_user_id: ownerUserId,
        quiz_id: quiz.id,
        quiz_version: quiz.versionHash,
        participant_type: participantType,
        identity_hash: identityHash,
        user_id: memberUserId || null,
        display_name: displayName,
        photo_url: photoUrl,
        attempts,
        latest_score: grade.score,
        latest_total: grade.total,
        latest_percent: grade.percent,
        latest_elapsed_ms: elapsedMs,
        last_attempt_at: FieldValue.serverTimestamp(),
        created_at: previousScoreSnapshot?.exists && sameQuizVersion
          ? previous.created_at ?? FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
      };
      if (isBetter) {
        scoreRecord.score = grade.score;
        scoreRecord.total = grade.total;
        scoreRecord.percent = grade.percent;
        scoreRecord.elapsed_ms = elapsedMs;
        scoreRecord.achieved_at = FieldValue.serverTimestamp();
      }
      transaction.set(scoreRef, scoreRecord, { merge: true });
    });

    return {
      grade,
      leaderboardSaved: shouldPublishScore,
      participantType,
    };
  },
);

export const getBoardQuizLeaderboard = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const boardId = normalizeBoardQuizIdentifier(request.data?.boardId, 'boardId');
    const boardSnapshot = await db.collection('boards').doc(boardId).get();
    if (!boardSnapshot.exists) {
      throw new HttpsError('not-found', 'Board not found.');
    }
    const board = boardSnapshot.data() ?? {};
    const ownerUserId = boardQuizString(board.owner_user_id, 160);
    if (board.visibility !== 'public' && ownerUserId !== request.auth?.uid) {
      throw new HttpsError('permission-denied', 'You do not have access to this leaderboard.');
    }
    const quiz = normalizeStoredBoardQuiz(board.learningQuiz);
    if (!quiz?.published) {
      throw new HttpsError('failed-precondition', 'This board quiz is not published.');
    }
    if (!quiz.leaderboardEnabled) {
      return {
        leaderboard: {
          enabled: false,
          totalPlayers: 0,
          entries: [],
        },
      };
    }

    const scoresSnapshot = await db.collection('board_quiz_scores')
      .where('board_id', '==', boardId)
      .limit(500)
      .get();
    const scores = scoresSnapshot.docs
      .map((document) => document.data())
      .filter((score) => score.quiz_id === quiz.id && score.quiz_version === quiz.versionHash)
      .map((score) => {
        const achievedAt = score.achieved_at as { toMillis?: () => number } | undefined;
        return {
          identityHash: boardQuizString(score.identity_hash, 80),
          displayName: boardQuizString(score.display_name, 80) || 'Living Wiki Learner',
          photoUrl: score.participant_type === 'member' ? boardQuizString(score.photo_url, 1000) : '',
          participantType: score.participant_type === 'guest' ? 'guest' as const : 'member' as const,
          score: Math.max(0, Number(score.score) || 0),
          total: Math.max(0, Number(score.total) || quiz.questions.length),
          percent: Math.max(0, Math.min(100, Number(score.percent) || 0)),
          elapsedMs: boardQuizMillis(score.elapsed_ms),
          attempts: Math.max(1, Number(score.attempts) || 1),
          achievedAt: typeof achievedAt?.toMillis === 'function' ? achievedAt.toMillis() : 0,
        };
      })
      .sort((left, right) =>
        right.score - left.score
        || (left.elapsedMs || Number.MAX_SAFE_INTEGER) - (right.elapsedMs || Number.MAX_SAFE_INTEGER)
        || left.achievedAt - right.achievedAt);

    const guestSessionId = boardQuizGuestSessionId(request.data?.guestSessionId);
    const currentIdentity = request.auth?.uid
      ? `member:${request.auth.uid}`
      : guestSessionId
        ? `guest:${guestSessionId}`
        : '';
    const currentIdentityHash = currentIdentity
      ? boardQuizIdentityHash(boardId, quiz.id, currentIdentity)
      : '';
    const rankedEntries = scores.map((score, index) => ({
      rank: index + 1,
      displayName: score.displayName,
      photoUrl: score.photoUrl,
      participantType: score.participantType,
      score: score.score,
      total: score.total,
      percent: score.percent,
      elapsedMs: score.elapsedMs,
      attempts: score.attempts,
      isCurrentPlayer: Boolean(currentIdentityHash && score.identityHash === currentIdentityHash),
    }));
    const visibleEntries = rankedEntries.slice(0, 25);
    const currentEntry = rankedEntries.find((entry) => entry.isCurrentPlayer);
    if (currentEntry && currentEntry.rank > 25) {
      visibleEntries.push(currentEntry);
    }

    return {
      leaderboard: {
        enabled: true,
        totalPlayers: scores.length,
        entries: visibleEntries,
      },
    };
  },
);

export const getBoardQuizStats = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to view board quiz results.');
    }

    const boardId = normalizeBoardQuizIdentifier(request.data?.boardId, 'boardId');
    const boardSnapshot = await db.collection('boards').doc(boardId).get();
    if (!boardSnapshot.exists) {
      throw new HttpsError('not-found', 'Board not found.');
    }
    const board = boardSnapshot.data() ?? {};
    if (board.owner_user_id !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Only the board owner can view quiz results.');
    }
    const quiz = normalizeStoredBoardQuiz(board.learningQuiz);
    if (!quiz?.published) {
      return {
        stats: {
          attemptCount: 0,
          averagePercent: 0,
          completionCount: 0,
          difficultCards: [],
        },
      };
    }

    const attemptsSnapshot = await db.collection('board_quiz_attempts')
      .where('board_id', '==', boardId)
      .limit(500)
      .get();
    const attempts = attemptsSnapshot.docs
      .map((document) => document.data())
      .filter((attempt) => attempt.quiz_id === quiz.id && attempt.quiz_version === quiz.versionHash);
    const cardTitles = new Map<string, string>(
      (Array.isArray(board.cards) ? board.cards : [])
        .filter((card): card is Record<string, unknown> => Boolean(card) && typeof card === 'object')
        .map((card) => [boardQuizString(card.id, 160), boardQuizString(card.title, 120)]),
    );
    const perCard = new Map<string, { attempts: number; correct: number }>();
    for (const attempt of attempts) {
      const results = Array.isArray(attempt.results) ? attempt.results : [];
      for (const result of results) {
        if (!result || typeof result !== 'object') {
          continue;
        }
        const resultData = result as Record<string, unknown>;
        const cardId = boardQuizString(resultData.source_card_id, 160);
        if (!cardId) {
          continue;
        }
        const current = perCard.get(cardId) ?? { attempts: 0, correct: 0 };
        current.attempts += 1;
        current.correct += resultData.correct === true ? 1 : 0;
        perCard.set(cardId, current);
      }
    }
    const averagePercent = attempts.length
      ? Math.round(attempts.reduce((sum, attempt) => sum + (Number(attempt.percent) || 0), 0) / attempts.length)
      : 0;
    const difficultCards = [...perCard.entries()]
      .map(([cardId, values]) => ({
        cardId,
        title: cardTitles.get(cardId) || quiz.questions.find((question) => question.sourceCardId === cardId)?.sourceCardTitle || 'Board card',
        attempts: values.attempts,
        correctPercent: values.attempts ? Math.round((values.correct / values.attempts) * 100) : 0,
      }))
      .sort((left, right) => left.correctPercent - right.correctPercent || right.attempts - left.attempts)
      .slice(0, 3);

    return {
      stats: {
        attemptCount: attempts.length,
        averagePercent,
        completionCount: attempts.filter((attempt) => Number(attempt.total) === quiz.questions.length).length,
        difficultCards,
      },
    };
  },
);

export const getAnswerCard = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const cardId = normalizeAnswerCardId(request.data?.cardId);
    const snapshot = await db.collection('answer_cards').doc(cardId).get();
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Answer card not found.');
    }

    return { card: serializeAnswerCard(snapshot.id, snapshot.data() ?? {}) };
  },
);

export const likeAnswerCard = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const cardId = normalizeAnswerCardId(request.data?.cardId);
    const visitorId = request.auth?.uid || normalizeAnonymousVisitorId(request.data?.visitorId);
    if (!visitorId) {
      throw new HttpsError('invalid-argument', 'visitorId is required.');
    }

    const cardRef = db.collection('answer_cards').doc(cardId);
    const likeRef = db.collection('answer_card_likes').doc(answerCardLikeDocumentId(cardId, visitorId));

    const result = await db.runTransaction(async (transaction) => {
      const [cardSnapshot, likeSnapshot] = await Promise.all([
        transaction.get(cardRef),
        transaction.get(likeRef),
      ]);
      if (!cardSnapshot.exists) {
        throw new HttpsError('not-found', 'Answer card not found.');
      }

      const currentCount = Number(cardSnapshot.data()?.like_count ?? 0) || 0;
      if (likeSnapshot.exists) {
        return { liked: true, likeCount: currentCount };
      }

      transaction.set(likeRef, {
        card_id: cardId,
        visitor_id_hash: createHash('sha256').update(visitorId).digest('hex'),
        created_at: FieldValue.serverTimestamp(),
      });
      transaction.update(cardRef, {
        like_count: FieldValue.increment(1),
        updated_at: FieldValue.serverTimestamp(),
      });
      return { liked: true, likeCount: currentCount + 1 };
    });

    return result;
  },
);

export const createAnswerQuiz = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 90,
    memory: '512MiB',
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to create a quiz challenge.');
    }

    const cardId = normalizeAnswerCardId(request.data?.cardId);
    const sourceMessageKind = normalizeSourceMessageKind(request.data?.sourceMessageKind);
    const sourceMessageId = normalizeOptionalSourceMessageId(request.data?.sourceMessageId);
    const existing = await db.collection('answer_quizzes')
      .where('answer_card_id', '==', cardId)
      .limit(1)
      .get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      const cardSnapshot = await db.collection('answer_cards').doc(cardId).get();
      const card = cardSnapshot.data() ?? {};
      const messageKind = normalizeSourceMessageKind(card.source_message_kind) ?? sourceMessageKind;
      const messageId = normalizeOptionalSourceMessageId(card.source_message_id) ?? sourceMessageId;
      if (messageKind && messageId) {
        const sourceMessage = await loadSourceAssistantMessage({
          uid: request.auth.uid,
          anonymousVisitorId: null,
          sourceMessageKind: messageKind,
          sourceMessageId: messageId,
          threadId: typeof card.source_thread_id === 'string' ? card.source_thread_id : null,
          answer: String(card.answer_preview ?? ''),
        });
        await sourceMessage?.ref.set({ answer_card_id: cardId, answer_quiz_id: doc.id }, { merge: true });
      }
      await db.collection('answer_cards').doc(cardId).set(
        {
          answer_quiz_id: doc.id,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { quiz: serializeAnswerQuiz(doc.id, doc.data(), await loadQuizLeaderboard(doc.id)) };
    }

    const cardSnapshot = await db.collection('answer_cards').doc(cardId).get();
    if (!cardSnapshot.exists) {
      throw new HttpsError('not-found', 'Answer card not found.');
    }

    const card = cardSnapshot.data() ?? {};
    const generated = await generateAnswerQuiz({
      title: String(card.title ?? ''),
      question: String(card.question ?? ''),
      answerPreview: String(card.answer_preview ?? ''),
      keyFacts: Array.isArray(card.key_facts) ? card.key_facts.map(String) : [],
      didYouKnow: Array.isArray(card.did_you_know) ? card.did_you_know.map(String) : [],
      atlasName: typeof card.atlas_name === 'string' ? card.atlas_name : null,
    });
    const questions = buildQuizQuestionRecords(generated.questions);
    if (questions.length < 3) {
      throw new HttpsError('internal', 'Could not generate enough quiz questions.');
    }

    const record: AnswerQuizRecord = {
      owner_user_id: request.auth.uid,
      answer_card_id: cardId,
      atlas_id: typeof card.atlas_id === 'string' ? card.atlas_id : null,
      atlas_name: typeof card.atlas_name === 'string' ? card.atlas_name : null,
      title: generated.title,
      description: generated.description,
      source_question: String(card.question ?? '').slice(0, 2000),
      questions,
      play_count: 0,
      submission_count: 0,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };

    const docRef = db.collection('answer_quizzes').doc();
    await docRef.set(record);
    await db.collection('answer_cards').doc(cardId).set(
      {
        answer_quiz_id: docRef.id,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    const messageKind = normalizeSourceMessageKind(card.source_message_kind) ?? sourceMessageKind;
    const messageId = normalizeOptionalSourceMessageId(card.source_message_id) ?? sourceMessageId;
    if (messageKind && messageId) {
      const sourceMessage = await loadSourceAssistantMessage({
        uid: request.auth.uid,
        anonymousVisitorId: null,
        sourceMessageKind: messageKind,
        sourceMessageId: messageId,
        threadId: typeof card.source_thread_id === 'string' ? card.source_thread_id : null,
        answer: String(card.answer_preview ?? ''),
      });
      await sourceMessage?.ref.set({ answer_card_id: cardId, answer_quiz_id: docRef.id }, { merge: true });
    }
    const snapshot = await docRef.get();
    return { quiz: serializeAnswerQuiz(docRef.id, snapshot.data() ?? record as unknown as Record<string, unknown>, []) };
  },
);

export const getAnswerQuiz = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const quizId = normalizeAnswerQuizId(request.data?.quizId);
    const snapshot = await db.collection('answer_quizzes').doc(quizId).get();
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Quiz not found.');
    }

    await snapshot.ref.update({
      play_count: FieldValue.increment(1),
      updated_at: FieldValue.serverTimestamp(),
    }).catch(() => undefined);

    return {
      quiz: serializeAnswerQuiz(snapshot.id, snapshot.data() ?? {}, await loadQuizLeaderboard(snapshot.id)),
    };
  },
);

export const gradeAnswerQuizAttempt = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const quizId = normalizeAnswerQuizId(request.data?.quizId);
    const snapshot = await db.collection('answer_quizzes').doc(quizId).get();
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Quiz not found.');
    }

    const questions = normalizeQuizQuestions(snapshot.data()?.questions, true);
    const grade = gradeQuiz(questions, normalizeQuizAnswers(request.data?.answers));
    return { grade };
  },
);

export const submitAnswerQuizScore = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to save your leaderboard score.');
    }

    const uid = request.auth.uid;
    const quizId = normalizeAnswerQuizId(request.data?.quizId);
    const quizRef = db.collection('answer_quizzes').doc(quizId);
    const quizSnapshot = await quizRef.get();
    if (!quizSnapshot.exists) {
      throw new HttpsError('not-found', 'Quiz not found.');
    }

    const questions = normalizeQuizQuestions(quizSnapshot.data()?.questions, true);
    const grade = gradeQuiz(questions, normalizeQuizAnswers(request.data?.answers));
    const elapsedMs = Math.max(0, Math.min(Number(request.data?.elapsedMs ?? 0) || 0, 24 * 60 * 60 * 1000));
    const token = (request.auth.token ?? {}) as { name?: unknown; email?: unknown };
    const displayName = typeof token.name === 'string' && token.name.trim()
      ? token.name.trim().slice(0, 80)
      : typeof token.email === 'string' && token.email.includes('@')
        ? token.email.split('@')[0].slice(0, 80)
        : 'Living Wiki Player';
    const scoreRef = quizRef.collection('scores').doc(uid);

    const saveResult = await db.runTransaction(async (transaction) => {
      const scoreSnapshot = await transaction.get(scoreRef);
      const previous = scoreSnapshot.exists ? scoreSnapshot.data() ?? {} : {};
      const previousScore = Number(previous.score ?? -1);
      const previousElapsed = Number(previous.elapsed_ms ?? Number.MAX_SAFE_INTEGER);
      const isBetter = grade.score > previousScore || (grade.score === previousScore && elapsedMs > 0 && elapsedMs < previousElapsed);
      const attempts = (Number(previous.attempts ?? 0) || 0) + 1;

      if (isBetter) {
        transaction.set(scoreRef, {
          quiz_id: quizId,
          user_id: uid,
          display_name: displayName,
          score: grade.score,
          total: grade.total,
          percent: grade.percent,
          elapsed_ms: elapsedMs,
          attempts,
          created_at: scoreSnapshot.exists ? previous.created_at ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        transaction.set(scoreRef, {
          quiz_id: quizId,
          user_id: uid,
          display_name: displayName,
          attempts,
          last_attempt_at: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      transaction.update(quizRef, {
        submission_count: FieldValue.increment(1),
        updated_at: FieldValue.serverTimestamp(),
      });

      return { savedBest: isBetter, attempts };
    });

    return {
      grade,
      savedBest: saveResult.savedBest,
      attempts: saveResult.attempts,
      leaderboard: await loadQuizLeaderboard(quizId),
    };
  },
);

function writeSseEvent(response: { write(chunk: string): unknown }, event: string, data: unknown): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

export const askAtlasStream = onRequest(
  {
    region: callableRegion,
    timeoutSeconds: 180,
    memory: '1GiB',
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    try {
      const authorization = request.get('authorization') ?? '';
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      if (!match?.[1]) {
        response.status(401).json({ error: 'Authentication is required.' });
        return;
      }

      const decodedToken = await getAuth().verifyIdToken(match[1]);
      const question = String(request.body?.question ?? '').trim();
      const threadId = String(request.body?.threadId ?? '').trim() || null;
      const atlasId = normalizeAtlasId(request.body?.atlasId);

      if (!question) {
        response.status(400).json({ error: 'question is required.' });
        return;
      }

      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders?.();

      writeSseEvent(response, 'start', { ok: true });

      const result = await runAtlasInternetStream({
        userId: decodedToken.uid,
        atlasId,
        question,
        threadId,
        onDelta: (delta) => writeSseEvent(response, 'delta', { delta }),
      });

      writeSseEvent(response, 'final', result);
      response.end();
    } catch (error) {
      logger.error('askAtlasStream failed', { errorMessage: error instanceof Error ? error.message : String(error) });
      if (!response.headersSent) {
        response.status(500).json({ error: error instanceof Error ? error.message : 'Failed to stream answer.' });
        return;
      }
      writeSseEvent(response, 'error', {
        message: error instanceof Error ? error.message : 'Failed to stream answer.',
      });
      response.end();
    }
  },
);

export const shareChatThread = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const threadId = String(request.data?.threadId ?? '').trim();
    if (!threadId) {
      throw new HttpsError('invalid-argument', 'threadId is required.');
    }

    const threadRef = db.collection('chat_threads').doc(threadId);
    const threadSnapshot = await threadRef.get();
    if (!threadSnapshot.exists) {
      throw new HttpsError('not-found', 'Chat thread not found.');
    }

    const thread = threadSnapshot.data() as {
      user_id?: string;
      is_shared?: boolean;
    };
    if (thread.user_id !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'You do not have access to this chat thread.');
    }

    const sharedAtIso = clientTimestamp().toDate().toISOString();
    if (thread.is_shared !== true) {
      await threadRef.set(
        {
          is_shared: true,
          shared_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    return {
      threadId,
      isShared: true,
      sharedAt: sharedAtIso,
    };
  },
);

export const getSharedChatThread = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const threadId = String(request.data?.threadId ?? '').trim();
    if (!threadId) {
      throw new HttpsError('invalid-argument', 'threadId is required.');
    }

    const threadSnapshot = await db.collection('chat_threads').doc(threadId).get();
    if (!threadSnapshot.exists) {
      throw new HttpsError('not-found', 'Shared chat thread not found.');
    }

    const thread = threadSnapshot.data() as {
      atlas_id?: string | null;
      title?: string;
      is_shared?: boolean;
      shared_at?: unknown;
    };

    if (thread.is_shared !== true) {
      throw new HttpsError('permission-denied', 'This chat thread is not shared.');
    }

    const messagesSnapshot = await db
      .collection('chat_messages')
      .where('thread_id', '==', threadId)
      .orderBy('created_at', 'asc')
      .limit(250)
      .get();

    let atlasName: string | null = null;
    if (typeof thread.atlas_id === 'string' && thread.atlas_id.trim()) {
      const atlasSnapshot = await db.collection('atlases').doc(thread.atlas_id).get();
      if (atlasSnapshot.exists) {
        atlasName = String(atlasSnapshot.data()?.name ?? '').trim() || null;
      }
    }

    return {
      threadId,
      title: String(thread.title ?? '').trim() || 'Shared chat',
      atlasName,
      sharedAt: normalizeTimestamp(thread.shared_at),
      messages: messagesSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          created_at: normalizeTimestamp(data.created_at),
        };
      }),
    };
  },
);

export const getPublicChatState = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const atlasId = normalizeAtlasId(request.data?.atlasId);
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    const atlas = await loadPublicAtlasById(atlasId);
    const visitor = getPublicChatVisitorContext(request);

    if (visitor.kind === 'authenticated' && visitor.visitorUserId === atlas.user_id) {
      throw new HttpsError('failed-precondition', 'Atlas owners should use the workspace chat.');
    }

    try {
      const state = await loadPublicChatState({
        atlasId: atlas.id,
        visitor: {
          kind: visitor.kind,
          visitorUserId: visitor.visitorUserId,
          anonymousVisitorId: visitor.anonymousVisitorId,
          visitorDisplayName: visitor.visitorDisplayName,
          visitorEmail: visitor.visitorEmail,
        },
      });

      return {
        ...state,
        messages: state.messages.map((message) => ({
          ...message,
          created_at: normalizeTimestamp(message.created_at),
        })),
      };
    } catch (error) {
      logger.error('getPublicChatState failed', {
        atlasId,
        visitorKind: visitor.kind,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to load public chat state.',
      );
    }
  },
);

type PersonalNarratorVoiceRecord = {
  owner_user_id?: unknown;
  provider_voice_id?: unknown;
  name?: unknown;
  status?: unknown;
  sample_storage_path?: unknown;
  sample_duration_seconds?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

function personalNarratorVoiceResponse(
  record: PersonalNarratorVoiceRecord | undefined,
): Record<string, unknown> | null {
  if (!record || record.status !== 'ready' || typeof record.name !== 'string') {
    return null;
  }
  return {
    name: record.name.slice(0, 48),
    status: 'ready',
    sampleDurationSeconds: typeof record.sample_duration_seconds === 'number'
      ? record.sample_duration_seconds
      : null,
    createdAt: timestampToIso(record.created_at),
    updatedAt: timestampToIso(record.updated_at),
  };
}

async function personalNarratorEligibility(userId: string): Promise<{
  eligible: boolean;
  profile: Record<string, unknown> | undefined;
}> {
  const profileSnapshot = await db.collection('users').doc(userId).get();
  const profile = profileSnapshot.data() as Record<string, unknown> | undefined;
  return {
    eligible: profile?.role === 'admin' || hasActivePersonalWikiPlan(profile),
    profile,
  };
}

async function deleteElevenLabsPersonalVoice(
  apiKey: string,
  voiceId: string,
  strict: boolean,
): Promise<void> {
  if (!voiceId) return;
  const response = await fetch(
    `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
    {
      method: 'DELETE',
      headers: { 'xi-api-key': apiKey },
    },
  );
  if (response.ok || response.status === 404) return;
  const body = (await response.text().catch(() => '')).slice(0, 500);
  logger.warn('ElevenLabs personal voice deletion failed', {
    status: response.status,
    body,
  });
  if (strict) {
    throw new HttpsError('internal', 'The personal narrator could not be removed from the voice provider.');
  }
}

function normalizeNarrationAuthorizationText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxSpeechTextLength);
}

function personalNarrationTextsFromCard(value: unknown): Set<string> {
  const card = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const allowed = new Set<string>();
  const add = (candidate: unknown) => {
    const normalized = normalizeNarrationAuthorizationText(candidate);
    if (normalized) allowed.add(normalized);
  };
  add(card['notes']);
  add(card['shortSummary']);
  add(card['subtitle']);

  const tour = card['tour'] && typeof card['tour'] === 'object'
    ? card['tour'] as Record<string, unknown>
    : {};
  add(tour['guideScript']);
  const leg = tour['legToNext'] && typeof tour['legToNext'] === 'object'
    ? tour['legToNext'] as Record<string, unknown>
    : {};
  add(leg['navScript']);
  add(leg['instruction']);

  const title = String(card['title'] ?? '').trim();
  const detail = String(card['shortSummary'] ?? card['subtitle'] ?? card['notes'] ?? '').trim();
  const firstSentence = detail.match(/^(.{1,320}?[.!?])(?:\s|$)/)?.[1] ?? detail.slice(0, 280);
  add(`${title}. ${firstSentence.trim()}`.trim().slice(0, 420));
  return allowed;
}

function boardAllowsNarrationText(board: Record<string, unknown>, text: string): boolean {
  const requestedText = normalizeNarrationAuthorizationText(text);
  if (!requestedText) return false;
  if (normalizeNarrationAuthorizationText(board['trailerVideoScript']) === requestedText) return true;
  if (!Array.isArray(board['cards'])) return false;
  return board['cards'].some((card) => personalNarrationTextsFromCard(card).has(requestedText));
}

export const getPersonalNarratorVoice = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    const userId = request.auth.uid;
    const [{ eligible }, voiceSnapshot] = await Promise.all([
      personalNarratorEligibility(userId),
      db.collection(personalNarratorVoiceCollection).doc(userId).get(),
    ]);
    return {
      eligible,
      voice: personalNarratorVoiceResponse(
        voiceSnapshot.data() as PersonalNarratorVoiceRecord | undefined,
      ),
    };
  },
);

export const createPersonalNarratorVoice = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
    secrets: [elevenLabsApiKey],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    const userId = request.auth.uid;
    const { eligible } = await personalNarratorEligibility(userId);
    if (!eligible) {
      throw new HttpsError(
        'permission-denied',
        'A Personal Plus or Creator plan is required to create a personal narrator.',
      );
    }
    if (request.data?.ownVoiceConfirmed !== true || request.data?.consentConfirmed !== true) {
      throw new HttpsError(
        'failed-precondition',
        'Confirm that this is your voice and that you consent to creating the narrator.',
      );
    }

    const name = String(request.data?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
    const sampleStoragePath = String(request.data?.sampleStoragePath ?? '').trim();
    const sampleDurationSeconds = Number(request.data?.sampleDurationSeconds);
    const expectedPrefix = `users/${userId}/voice-samples/`;
    if (!name) {
      throw new HttpsError('invalid-argument', 'Give your narrator a name.');
    }
    if (!sampleStoragePath.startsWith(expectedPrefix)
      || sampleStoragePath.includes('..')
      || sampleStoragePath.length > 500) {
      throw new HttpsError('invalid-argument', 'The voice sample path is not valid.');
    }
    if (!Number.isFinite(sampleDurationSeconds)
      || sampleDurationSeconds < personalNarratorVoiceMinDurationSeconds
      || sampleDurationSeconds > personalNarratorVoiceMaxDurationSeconds) {
      throw new HttpsError(
        'invalid-argument',
        `Use a voice sample between ${personalNarratorVoiceMinDurationSeconds} and ${personalNarratorVoiceMaxDurationSeconds} seconds.`,
      );
    }

    const sampleFile = storage.bucket().file(sampleStoragePath);
    const [exists] = await sampleFile.exists();
    if (!exists) {
      throw new HttpsError('not-found', 'The uploaded voice sample could not be found.');
    }
    const [sampleMetadata] = await sampleFile.getMetadata();
    const contentType = String(sampleMetadata.contentType ?? '').toLowerCase();
    const sampleSize = Number(sampleMetadata.size ?? 0);
    if (!contentType.startsWith('audio/') || !sampleSize || sampleSize > personalNarratorVoiceMaxBytes) {
      throw new HttpsError('invalid-argument', 'Upload an audio file no larger than 15 MB.');
    }

    const apiKey = elevenLabsApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'ElevenLabs API key is not configured.');
    }
    const [sampleBuffer] = await sampleFile.download();
    const form = new FormData();
    form.append('name', name);
    form.append('description', 'Personal LivingWiki narrator');
    form.append('remove_background_noise', 'true');
    const filename = sampleStoragePath.split('/').pop() || 'voice-sample.webm';
    form.append('files', new Blob([Uint8Array.from(sampleBuffer)], { type: contentType }), filename);

    const providerResponse = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
    });
    if (!providerResponse.ok) {
      const providerBody = (await providerResponse.text().catch(() => '')).slice(0, 500);
      logger.warn('ElevenLabs personal voice creation failed', {
        userId,
        status: providerResponse.status,
        body: providerBody,
      });
      throw new HttpsError(
        providerResponse.status === 400 || providerResponse.status === 422
          ? 'invalid-argument'
          : 'internal',
        providerResponse.status === 400 || providerResponse.status === 422
          ? 'ElevenLabs could not use this sample. Try a clearer recording with only your voice.'
          : 'The personal narrator could not be created. Try again in a moment.',
      );
    }
    const providerData = await providerResponse.json() as Record<string, unknown>;
    const providerVoiceId = String(providerData['voice_id'] ?? '').trim();
    if (!providerVoiceId) {
      throw new HttpsError('internal', 'The voice provider did not return a narrator.');
    }

    const voiceRef = db.collection(personalNarratorVoiceCollection).doc(userId);
    const previousSnapshot = await voiceRef.get();
    const previous = previousSnapshot.data() as PersonalNarratorVoiceRecord | undefined;
    const now = FieldValue.serverTimestamp();
    try {
      await voiceRef.set({
        owner_user_id: userId,
        provider_voice_id: providerVoiceId,
        name,
        status: 'ready',
        sample_storage_path: sampleStoragePath,
        sample_duration_seconds: sampleDurationSeconds,
        consent_version: personalNarratorVoiceConsentVersion,
        own_voice_confirmed: true,
        consent_confirmed_at: now,
        created_at: previous?.created_at ?? now,
        updated_at: now,
      });
    } catch (error) {
      await deleteElevenLabsPersonalVoice(apiKey, providerVoiceId, false);
      logger.error('Personal narrator record could not be saved', {
        userId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError('internal', 'The personal narrator could not be saved. Please try again.');
    }

    const previousProviderVoiceId = typeof previous?.provider_voice_id === 'string'
      ? previous.provider_voice_id
      : '';
    const previousSamplePath = typeof previous?.sample_storage_path === 'string'
      ? previous.sample_storage_path
      : '';
    if (previousProviderVoiceId && previousProviderVoiceId !== providerVoiceId) {
      await deleteElevenLabsPersonalVoice(apiKey, previousProviderVoiceId, false);
    }
    if (previousSamplePath && previousSamplePath !== sampleStoragePath) {
      await storage.bucket().file(previousSamplePath).delete({ ignoreNotFound: true }).catch((error) => {
        logger.warn('Previous personal voice sample cleanup failed', {
          userId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      });
    }

    const savedSnapshot = await voiceRef.get();
    return {
      eligible: true,
      voice: personalNarratorVoiceResponse(
        savedSnapshot.data() as PersonalNarratorVoiceRecord | undefined,
      ),
    };
  },
);

export const deletePersonalNarratorVoice = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
    secrets: [elevenLabsApiKey],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    const userId = request.auth.uid;
    const voiceRef = db.collection(personalNarratorVoiceCollection).doc(userId);
    const voiceSnapshot = await voiceRef.get();
    if (!voiceSnapshot.exists) return { deleted: true };
    const voice = voiceSnapshot.data() as PersonalNarratorVoiceRecord;
    if (voice.owner_user_id !== userId) {
      throw new HttpsError('permission-denied', 'You cannot remove this narrator.');
    }

    const apiKey = elevenLabsApiKey.value();
    const providerVoiceId = typeof voice.provider_voice_id === 'string' ? voice.provider_voice_id : '';
    if (providerVoiceId && apiKey) {
      await deleteElevenLabsPersonalVoice(apiKey, providerVoiceId, true);
    }
    const sampleStoragePath = typeof voice.sample_storage_path === 'string'
      ? voice.sample_storage_path
      : '';
    if (sampleStoragePath) {
      await storage.bucket().file(sampleStoragePath).delete({ ignoreNotFound: true });
    }
    await storage.bucket().deleteFiles({
      prefix: `chat-answer-speech/personal/${userId}/`,
      force: true,
    }).catch((error) => {
      logger.warn('Personal narrator audio cache cleanup failed', {
        userId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });

    const boardSnapshot = await db.collection('boards').where('owner_user_id', '==', userId).get();
    const personalBoards = boardSnapshot.docs.filter(
      (doc) => doc.data()?.stackNarratorVoiceId === personalStackNarratorVoiceId,
    );
    for (let offset = 0; offset < personalBoards.length; offset += 450) {
      const batch = db.batch();
      personalBoards.slice(offset, offset + 450).forEach((doc) => {
        batch.update(doc.ref, {
          stackNarratorVoiceId: 'warm-storyteller',
          updated_at: FieldValue.serverTimestamp(),
          server_updated_at: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }
    await voiceRef.delete();
    return { deleted: true };
  },
);

export const prepareBoardTrailer = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError('unauthenticated', 'Sign in to create a Board Trailer.');
    const boardId = String(request.data?.boardId ?? '').trim().slice(0, 160);
    if (!boardId) throw new HttpsError('invalid-argument', 'A board is required.');

    const boardRef = db.collection('boards').doc(boardId);
    const snapshot = await boardRef.get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'The board could not be found.');
    const board = snapshot.data() as Record<string, unknown>;
    if (String(board['owner_user_id'] ?? '').trim() !== userId) {
      throw new HttpsError('permission-denied', 'Only the board owner can create its trailer.');
    }
    const sourceCards = Array.isArray(board['cards'])
      ? board['cards'].filter((value): value is Record<string, unknown> => !!value && typeof value === 'object')
      : [];
    const requestedIds: string[] = Array.isArray(request.data?.cardIds)
      ? Array.from(new Set<string>(request.data.cardIds
          .map((value: unknown) => String(value ?? '').trim())
          .filter((value: string) => !!value))).slice(0, 30)
      : [];
    const cardsById = new Map(sourceCards.map((card) => [String(card['id'] ?? card['card_id'] ?? '').trim(), card]));
    if (requestedIds.some((id) => !cardsById.has(id))) {
      throw new HttpsError('permission-denied', 'Every trailer card must belong to the selected board.');
    }
    const selectedCards = (requestedIds.length ? requestedIds.map((id) => cardsById.get(id)!) : sourceCards.slice(0, 30))
      .filter(Boolean);
    if (!selectedCards.length) throw new HttpsError('failed-precondition', 'Add at least one card before creating a trailer.');

    const title = String(board['title'] ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const description = String(board['description'] ?? '').replace(/\s+/g, ' ').trim().slice(0, 360);
    const cardInputs = selectedCards.map((card) => ({
      id: String(card['id'] ?? card['card_id'] ?? '').trim(),
      title: String(card['title'] ?? '').replace(/\s+/g, ' ').trim().slice(0, 100),
      subtitle: String(card['shortSummary'] ?? card['subtitle'] ?? card['notes'] ?? '')
        .replace(/\s+/g, ' ').trim().slice(0, 180),
    }));
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ title, description, cards: cardInputs }))
      .digest('hex');
    const cachedScript = normalizeNarrationAuthorizationText(board['trailerVideoScript']);
    const cachedFingerprint = String(board['trailerVideoSourceFingerprint'] ?? '').trim();
    if (cachedScript && cachedFingerprint === fingerprint) {
      return { script: cachedScript, fingerprint, cached: true, cardIds: cardInputs.map((card) => card.id) };
    }

    const script = await generateBoardTrailerScript({ title, description, cards: cardInputs });
    await boardRef.update({
      trailerVideoScript: script,
      trailerVideoSourceFingerprint: fingerprint,
      trailerVideoCardIds: cardInputs.map((card) => card.id),
      trailerVideoScriptUpdatedAt: new Date().toISOString(),
      server_updated_at: FieldValue.serverTimestamp(),
    });
    return { script, fingerprint, cached: false, cardIds: cardInputs.map((card) => card.id) };
  },
);

export const synthesizeChatAnswerSpeech = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
    secrets: [elevenLabsApiKey],
  },
  async (request) => {
    if (!request.auth?.uid && !normalizeAnonymousVisitorId(request.data?.anonymousVisitorId)) {
      throw new HttpsError('unauthenticated', 'Authentication or anonymousVisitorId is required.');
    }
    const requestedMode = request.data?.mode === 'stack-trailer'
      ? 'stack-trailer'
      : request.data?.mode === 'stack-video'
      ? 'stack-video'
      : request.data?.mode === 'voice-preview'
        ? 'voice-preview'
      : request.data?.mode === 'tour'
        ? 'tour'
        : request.data?.mode === 'full'
          ? 'full'
          : 'recap';
    const requestedNarratorId = String(request.data?.narratorVoiceId ?? '').trim();
    const boardId = String(request.data?.boardId ?? '').trim();
    const requestedCardId = String(request.data?.cardId ?? '').trim().slice(0, 160);
    let requestedBoard: Record<string, unknown> | null = null;
    let requestedStackVideoCard: Record<string, unknown> | null = null;
    if (requestedMode === 'stack-video' || requestedMode === 'stack-trailer') {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError('unauthenticated', 'Sign in to create narrated videos.');
      }
      if (!boardId) {
        throw new HttpsError('failed-precondition', 'A board is required to create narrated videos.');
      }
      const boardSnapshot = await db.collection('boards').doc(boardId).get();
      if (!boardSnapshot.exists) {
        throw new HttpsError('not-found', 'The board for this video could not be found.');
      }
      requestedBoard = boardSnapshot.data() as Record<string, unknown>;
      if (String(requestedBoard['owner_user_id'] ?? '').trim() !== userId) {
        throw new HttpsError('permission-denied', 'Only the board owner can create its narrated video.');
      }
      if (requestedMode === 'stack-video' && requestedCardId) {
        requestedStackVideoCard = stackVideoNarrationCardFromBoard(requestedBoard, requestedCardId);
        if (!requestedStackVideoCard) {
          throw new HttpsError('permission-denied', 'This narration card does not belong to the selected board.');
        }
      }
    }
    let requestedNarratorVoiceId = requestedNarratorId && requestedNarratorId !== personalStackNarratorVoiceId
      ? stackNarratorVoiceIds[requestedNarratorId as keyof typeof stackNarratorVoiceIds]
      : '';
    if (requestedNarratorId
      && requestedNarratorId !== personalStackNarratorVoiceId
      && !requestedNarratorVoiceId) {
      throw new HttpsError('invalid-argument', 'The selected narrator voice is not available.');
    }
    const text = requestedMode === 'stack-video' && requestedStackVideoCard
      ? stackVideoNarrationTextFromCard(requestedStackVideoCard, normalizeSpeechText)
      : requestedMode === 'full' || requestedMode === 'tour' || requestedMode === 'stack-video' || requestedMode === 'stack-trailer' || requestedMode === 'voice-preview'
        ? normalizeSpeechText(request.data?.text)
        : buildSpeechRecapText(request.data?.question, request.data?.text);
    if (!text) {
      throw new HttpsError('invalid-argument', 'Answer text is required.');
    }
    if (requestedMode === 'stack-video'
      && (!requestedBoard || (!requestedStackVideoCard && !boardAllowsNarrationText(requestedBoard, text)))) {
      throw new HttpsError('permission-denied', 'This narration does not match a card on the selected board.');
    }
    if (requestedMode === 'stack-trailer'
      && (!requestedBoard || normalizeNarrationAuthorizationText(requestedBoard['trailerVideoScript']) !== text)) {
      throw new HttpsError('permission-denied', 'This voiceover does not match the prepared Board Trailer script.');
    }

    const isPersonalNarrator = requestedNarratorId === personalStackNarratorVoiceId;
    let personalVoiceOwnerId = '';
    if (isPersonalNarrator) {
      if (boardId) {
        let board = requestedBoard;
        if (!board) {
          const snapshot = await db.collection('boards').doc(boardId).get();
          if (!snapshot.exists) {
            throw new HttpsError('not-found', 'The board for this narrator could not be found.');
          }
          board = snapshot.data() as Record<string, unknown>;
        }
        personalVoiceOwnerId = String(board['owner_user_id'] ?? '').trim();
        const isOwner = !!request.auth?.uid && request.auth.uid === personalVoiceOwnerId;
        const canUsePublicNarration = board['visibility'] === 'public'
          && board['stackNarratorVoiceId'] === personalStackNarratorVoiceId
          && boardAllowsNarrationText(board, text);
        if (!personalVoiceOwnerId || (!isOwner && !canUsePublicNarration)) {
          throw new HttpsError('permission-denied', 'This personal narrator is not available for that text.');
        }
      } else if (request.auth?.uid) {
        personalVoiceOwnerId = request.auth.uid;
      } else {
        throw new HttpsError('permission-denied', 'A board is required to use this personal narrator.');
      }

      const [{ eligible }, voiceSnapshot] = await Promise.all([
        personalNarratorEligibility(personalVoiceOwnerId),
        db.collection(personalNarratorVoiceCollection).doc(personalVoiceOwnerId).get(),
      ]);
      const voice = voiceSnapshot.data() as PersonalNarratorVoiceRecord | undefined;
      requestedNarratorVoiceId = voice?.status === 'ready' && typeof voice.provider_voice_id === 'string'
        ? voice.provider_voice_id
        : '';
      if (!eligible) {
        throw new HttpsError('failed-precondition', 'This personal narrator requires an active paid plan.');
      }
      if (!requestedNarratorVoiceId) {
        throw new HttpsError('failed-precondition', 'This personal narrator is not ready.');
      }
    }

    const apiKey = elevenLabsApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'ElevenLabs API key is not configured.');
    }

    const primaryVoiceId = requestedNarratorVoiceId || chatAnswerVoiceId;
    if (requestedMode === 'voice-preview') {
      const previewResponse = await fetch(
        `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(primaryVoiceId)}`,
        { headers: { 'xi-api-key': apiKey } },
      );
      if (!previewResponse.ok) {
        const previewBody = await previewResponse.text().catch(() => '');
        logger.warn('ElevenLabs voice preview lookup failed', {
          status: previewResponse.status,
          voiceId: primaryVoiceId,
          body: previewBody.slice(0, 500),
        });
        throw new HttpsError('unavailable', 'This voice preview is temporarily unavailable.');
      }
      const previewData = await previewResponse.json() as Record<string, unknown>;
      const previewUrl = typeof previewData['preview_url'] === 'string'
        ? previewData['preview_url'].trim()
        : '';
      if (!previewUrl.startsWith('https://')) {
        logger.warn('ElevenLabs voice did not provide a secure preview URL', {
          voiceId: primaryVoiceId,
        });
        throw new HttpsError('unavailable', 'This voice does not have a preview available.');
      }
      return {
        audioUrl: previewUrl,
        contentType: 'audio/mpeg',
        voiceId: isPersonalNarrator ? null : primaryVoiceId,
        speechText: text,
        durationHintSeconds: null,
        provider: 'elevenlabs',
        narratorVoiceId: requestedNarratorId || null,
        cached: true,
      };
    }

    const speechModel = requestedMode === 'tour' || requestedMode === 'stack-video'
      ? tourGuideSpeechModel
      : chatAnswerSpeechModel;
    const voiceSettings = requestedMode === 'tour' || requestedMode === 'stack-video'
      ? isPersonalNarrator
        ? {
            stability: 0.6,
            similarity_boost: 0.86,
            style: 0,
            use_speaker_boost: true,
          }
        : {
            stability: 0.34,
            similarity_boost: 0.86,
            style: 0.72,
            use_speaker_boost: true,
          }
      : {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: false,
    };
    const speechVersion = requestedMode === 'tour' || requestedMode === 'stack-video'
      ? tourSpeechVersion
      : speechRecapVersion;
    // Live View and full-video narration use identical synthesis settings, so they
    // share one cache identity. Keep `tour` as the canonical mode so existing Live
    // View audio is reused immediately after this change.
    const narrationCacheMode = sharedStackNarrationCacheMode(requestedMode);
    const stackVideoNarrationRevisionKey = requestedMode === 'stack-video'
      ? stackVideoNarrationRevisionCacheKey(requestedStackVideoCard)
      : '';
    const voiceIds = isPersonalNarrator
      ? [primaryVoiceId]
      : Array.from(new Set([
          primaryVoiceId,
          ...elevenLabsPremadeNarratorVoiceIds,
        ].filter(Boolean)));
    let lastErrorStatus: number | null = null;
    let lastErrorBody = '';

    for (const voiceId of voiceIds) {
      const textHash = createHash('sha256')
        .update(`${voiceId}:${speechModel}:${speechVersion}:${narrationCacheMode}:${JSON.stringify(voiceSettings)}:${text}`)
        .digest('hex');
      const storagePath = isPersonalNarrator
        ? `chat-answer-speech/personal/${personalVoiceOwnerId}/${narrationCacheMode}/${speechVersion}/${textHash}.mp3`
        : `chat-answer-speech/${narrationCacheMode}/${speechVersion}/${voiceId}/${textHash}.mp3`;
      const cachedFile = storage.bucket().file(storagePath);
      const [cacheExists] = await cachedFile.exists();
      if (cacheExists) {
        return {
          audioUrl: await buildSpeechCacheDownloadUrl(storagePath),
          contentType: 'audio/mpeg',
          voiceId: isPersonalNarrator ? null : voiceId,
          speechText: text,
          durationHintSeconds: requestedMode === 'recap' ? 15 : null,
          provider: 'elevenlabs',
          narratorVoiceId: requestedNarratorId || null,
          cached: true,
        };
      }

      // Preserve audio made by the previous stack-video-specific cache. When a
      // video encounters it, copy it into the shared cache without spending more
      // ElevenLabs credits.
      if (requestedMode === 'stack-video') {
        const legacyTextHash = createHash('sha256')
          .update(`${voiceId}:${speechModel}:${speechVersion}:${requestedMode}${stackVideoNarrationRevisionKey}:${JSON.stringify(voiceSettings)}:${text}`)
          .digest('hex');
        const legacyStoragePath = isPersonalNarrator
          ? `chat-answer-speech/personal/${personalVoiceOwnerId}/${requestedMode}/${speechVersion}/${legacyTextHash}.mp3`
          : `chat-answer-speech/${requestedMode}/${speechVersion}/${voiceId}/${legacyTextHash}.mp3`;
        const legacyFile = storage.bucket().file(legacyStoragePath);
        const [legacyCacheExists] = await legacyFile.exists();
        if (legacyCacheExists) {
          try {
            await legacyFile.copy(cachedFile);
            logger.info('Migrated video narration into shared Live View cache', {
              legacyStoragePath,
              storagePath,
            });
            return {
              audioUrl: await buildSpeechCacheDownloadUrl(storagePath),
              contentType: 'audio/mpeg',
              voiceId: isPersonalNarrator ? null : voiceId,
              speechText: text,
              durationHintSeconds: null,
              provider: 'elevenlabs',
              narratorVoiceId: requestedNarratorId || null,
              cached: true,
            };
          } catch (error) {
            logger.warn('Could not migrate legacy video narration cache; using it in place', {
              legacyStoragePath,
              storagePath,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
            return {
              audioUrl: await buildSpeechCacheDownloadUrl(legacyStoragePath),
              contentType: 'audio/mpeg',
              voiceId: isPersonalNarrator ? null : voiceId,
              speechText: text,
              durationHintSeconds: null,
              provider: 'elevenlabs',
              narratorVoiceId: requestedNarratorId || null,
              cached: true,
            };
          }
        }
      }

      // A cache lookup alone is not enough: two Cloud Run instances can miss at
      // the same time and both spend credits. This zero-generation lock is an
      // atomic, cross-instance single-flight guard for one exact audio identity.
      const synthesisLockFile = storage.bucket().file(`${storagePath}.synthesis-lock`);
      const lockWaitDeadline = Date.now() + speechSynthesisLockWaitMs;
      const lockToken = randomUUID();
      let ownsSynthesisLock = false;
      let ownedSynthesisLockGeneration = '';
      let releaseSynthesisLock = false;
      while (!ownsSynthesisLock) {
        try {
          await synthesisLockFile.save(Buffer.from(JSON.stringify({
            token: lockToken,
            createdAt: new Date().toISOString(),
          })), {
            resumable: false,
            preconditionOpts: { ifGenerationMatch: 0 },
            metadata: {
              contentType: 'application/json',
              cacheControl: 'no-store',
            },
          });
          ownsSynthesisLock = true;
          try {
            const [ownedLockMetadata] = await synthesisLockFile.getMetadata();
            ownedSynthesisLockGeneration = String(ownedLockMetadata.generation ?? '');
          } catch (metadataError) {
            logger.warn('Speech synthesis lock generation could not be read', {
              storagePath,
              lockToken,
              errorMessage: metadataError instanceof Error ? metadataError.message : String(metadataError),
            });
          }
        } catch (error) {
          if (!isCloudStoragePreconditionFailure(error)) throw error;

          const [cacheCreatedByOtherRequest] = await cachedFile.exists();
          if (cacheCreatedByOtherRequest) {
            return {
              audioUrl: await buildSpeechCacheDownloadUrl(storagePath),
              contentType: 'audio/mpeg',
              voiceId: isPersonalNarrator ? null : voiceId,
              speechText: text,
              durationHintSeconds: requestedMode === 'recap' ? 15 : null,
              provider: 'elevenlabs',
              narratorVoiceId: requestedNarratorId || null,
              cached: true,
            };
          }

          try {
            const [lockMetadata] = await synthesisLockFile.getMetadata();
            const lockCreatedAt = Date.parse(String(lockMetadata.timeCreated ?? ''));
            if (Number.isFinite(lockCreatedAt)
              && Date.now() - lockCreatedAt > speechSynthesisLockStaleMs
              && lockMetadata.generation) {
              await synthesisLockFile.delete({
                ifGenerationMatch: lockMetadata.generation,
              });
              logger.warn('Removed stale speech synthesis lock', {
                storagePath,
                lockGeneration: lockMetadata.generation,
              });
              continue;
            }
          } catch (metadataError) {
            const status = cloudStorageErrorStatus(metadataError);
            if (status !== 404 && !isCloudStoragePreconditionFailure(metadataError)) {
              logger.warn('Speech synthesis lock metadata could not be checked', {
                storagePath,
                errorMessage: metadataError instanceof Error ? metadataError.message : String(metadataError),
              });
            }
          }

          if (Date.now() >= lockWaitDeadline) {
            throw new HttpsError(
              'unavailable',
              'This narration is already being generated. Try again after it finishes.',
            );
          }
          await waitForSpeechSynthesisLock();
        }
      }

      try {
        // Recheck after taking the lock in case another request completed between
        // the original cache lookup and our atomic lock acquisition.
        const [cacheCreatedBeforeLock] = await cachedFile.exists();
        if (cacheCreatedBeforeLock) {
          releaseSynthesisLock = true;
          return {
            audioUrl: await buildSpeechCacheDownloadUrl(storagePath),
            contentType: 'audio/mpeg',
            voiceId: isPersonalNarrator ? null : voiceId,
            speechText: text,
            durationHintSeconds: requestedMode === 'recap' ? 15 : null,
            provider: 'elevenlabs',
            narratorVoiceId: requestedNarratorId || null,
            cached: true,
          };
        }

        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128&optimize_streaming_latency=3`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': apiKey,
            },
            body: JSON.stringify({
              text,
              model_id: speechModel,
              voice_settings: voiceSettings,
            }),
          },
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          lastErrorStatus = response.status;
          lastErrorBody = errorText.slice(0, 500);
          logger.warn('ElevenLabs speech synthesis failed for voice candidate', {
            status: response.status,
            voiceId,
            body: lastErrorBody,
          });
          if (response.status === 401 && errorText.includes('quota_exceeded')) {
            throw new HttpsError(
              'resource-exhausted',
              'Video narration is temporarily unavailable because the voice-generation quota is exhausted.',
            );
          }
          if (response.status === 404) {
            releaseSynthesisLock = true;
            continue;
          }
          throw new HttpsError('internal', 'Failed to create audio for this answer.');
        }

        const audioBuffer = Buffer.from(await response.arrayBuffer());
        await cachedFile.save(audioBuffer, {
          resumable: false,
          metadata: {
            contentType: 'audio/mpeg',
            cacheControl: 'public, max-age=31536000, immutable',
            metadata: {
              voiceId: isPersonalNarrator ? personalStackNarratorVoiceId : voiceId,
              modelId: speechModel,
              mode: narrationCacheMode,
              requestedMode,
              textHash,
            },
          },
        });
        releaseSynthesisLock = true;

        if (voiceId !== primaryVoiceId) {
          logger.warn('Using fallback ElevenLabs voice for speech synthesis', {
            requestedVoiceId: primaryVoiceId,
            fallbackVoiceId: voiceId,
            mode: requestedMode,
          });
        }

        return {
          audioUrl: await buildSpeechCacheDownloadUrl(storagePath),
          contentType: 'audio/mpeg',
          voiceId: isPersonalNarrator ? null : voiceId,
          speechText: text,
          durationHintSeconds: requestedMode === 'recap' ? 15 : null,
          provider: 'elevenlabs',
          narratorVoiceId: requestedNarratorId || null,
          cached: false,
        };
      } finally {
        if (ownsSynthesisLock && releaseSynthesisLock) {
          await synthesisLockFile.delete({
            ignoreNotFound: true,
            ...(ownedSynthesisLockGeneration
              ? { ifGenerationMatch: ownedSynthesisLockGeneration }
              : {}),
          }).catch((error) => {
            logger.warn('Speech synthesis lock cleanup failed', {
              storagePath,
              lockToken,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          });
        } else if (ownsSynthesisLock) {
          logger.warn('Retaining speech synthesis lock after an uncertain failure', {
            storagePath,
            lockToken,
            retryAfterMs: speechSynthesisLockStaleMs,
          });
        }
      }
    }

    logger.warn('ElevenLabs speech synthesis failed for all voice candidates', {
      status: lastErrorStatus,
      body: lastErrorBody,
      voiceIds,
    });
    throw new HttpsError('internal', 'Failed to create audio for this answer.');
  },
);

export const askPublicAtlas = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 180,
    memory: '1GiB',
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request) => {
    const atlasId = normalizeAtlasId(request.data?.atlasId);
    const question = String(request.data?.question ?? '').trim();
    const threadId = String(request.data?.threadId ?? '').trim() || null;
    const startNewThread = request.data?.startNewThread === true;
    const answerMode = request.data?.answerMode === 'internet' ? 'internet' : 'wiki';
    const topicIds = Array.isArray(request.data?.topicIds)
      ? request.data.topicIds.map((value: unknown) => String(value)).filter(Boolean)
      : undefined;

    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }
    if (!question) {
      throw new HttpsError('invalid-argument', 'question is required.');
    }

    const atlas = await loadPublicAtlasById(atlasId);
    const visitor = getPublicChatVisitorContext(request);

    if (visitor.kind === 'authenticated' && visitor.visitorUserId === atlas.user_id) {
      throw new HttpsError('failed-precondition', 'Atlas owners should use the workspace chat.');
    }

    try {
      return await runPublicAtlasQuery({
        atlasId: atlas.id,
        atlasOwnerUserId: atlas.user_id,
        question,
        answerMode,
        topicIds,
        threadId,
        startNewThread,
        visitor: {
          kind: visitor.kind,
          visitorUserId: visitor.visitorUserId,
          anonymousVisitorId: visitor.anonymousVisitorId,
          visitorDisplayName: visitor.visitorDisplayName,
          visitorEmail: visitor.visitorEmail,
        },
      });
    } catch (error) {
      logger.error('askPublicAtlas failed', {
        atlasId,
        visitorKind: visitor.kind,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to answer public question.',
      );
    }
  },
);

export const deleteDocument = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 300,
    memory: '1GiB',
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const documentId = String(request.data?.documentId ?? '').trim();
    if (!documentId) {
      throw new HttpsError('invalid-argument', 'documentId is required.');
    }

    try {
      return await deleteDocumentForUser({
        documentId,
        userId: request.auth.uid,
      });
    } catch (error) {
      logger.error('deleteDocument failed', { documentId, errorMessage: error instanceof Error ? error.message : String(error) });
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to delete document.',
      );
    }
  },
);

export const getWikiTopicDetails = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const topicId = String(request.data?.topicId ?? '').trim();
    if (!topicId) {
      throw new HttpsError('invalid-argument', 'topicId is required.');
    }

    try {
      return await getWikiTopicDetailsForUser({
        userId: request.auth.uid,
        topicId,
      });
    } catch (error) {
      logger.error('getWikiTopicDetails failed', { topicId, errorMessage: error instanceof Error ? error.message : String(error) });
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to load topic details.',
      );
    }
  },
);

export const getPublicAtlasUsage = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const atlasId = String(request.data?.atlasId ?? '').trim();
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    const atlas = await loadPublicAtlasById(atlasId);

    const [documents, wikiArticles, knowledgeEntries, wikiTopics, chatThreads] = await Promise.all([
      countPublicAtlasCollection('documents', atlas.user_id, atlasId),
      countPublicAtlasCollection('wiki_articles', atlas.user_id, atlasId),
      countPublicAtlasCollection('knowledge_entries', atlas.user_id, atlasId),
      countPublicAtlasCollection('wiki_topics', atlas.user_id, atlasId),
      countPublicAtlasCollection('chat_threads', atlas.user_id, atlasId),
    ]);

    return {
      documents,
      wiki_articles: wikiArticles,
      knowledge_entries: knowledgeEntries,
      wiki_topics: wikiTopics,
      queries: 0,
      chat_threads: chatThreads,
      total: documents + wikiArticles + knowledgeEntries + wikiTopics + chatThreads,
    };
  },
);

export const getCityPulseSnapshot = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const atlasId = String(request.data?.atlasId ?? '').trim();
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    if (request.auth?.uid) {
      const atlasSnapshot = await db.collection('atlases').doc(atlasId).get();
      if (!atlasSnapshot.exists) {
        throw new HttpsError('not-found', 'Atlas not found.');
      }
      const atlasData = atlasSnapshot.data() as Record<string, unknown> | undefined;
      const readable =
        atlasData?.is_public === true || String(atlasData?.user_id ?? '') === request.auth.uid;
      if (!readable) {
        throw new HttpsError('permission-denied', 'Atlas is not readable.');
      }
    } else {
      await loadPublicAtlasById(atlasId);
    }

    const existing = await getStoredCityPulseSnapshot(atlasId);
    if (existing) {
      return existing;
    }

    return await refreshStoredCityPulseSnapshot(atlasId, 'bootstrap');
  },
);

export const refreshCityPulseSnapshot = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const atlasId = String(request.data?.atlasId ?? '').trim();
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    await assertAtlasOwner(atlasId, request.auth.uid);
    return await refreshStoredCityPulseSnapshot(atlasId, 'admin');
  },
);

export const refreshCityPopulation = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const atlasId = String(request.data?.atlasId ?? '').trim();
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    const atlasSnapshot = await db.collection('atlases').doc(atlasId).get();
    if (!atlasSnapshot.exists) {
      throw new HttpsError('not-found', 'Atlas not found.');
    }

    const atlas = atlasSnapshot.data() as Record<string, unknown>;
    const adminUserIds = Array.isArray(atlas.admin_user_ids)
      ? atlas.admin_user_ids.map((value) => String(value))
      : [];
    const canAdminAtlas =
      String(atlas.user_id ?? '') === request.auth.uid || adminUserIds.includes(request.auth.uid);
    if (!canAdminAtlas) {
      await assertPlatformAdmin(request.auth.uid);
    }

    return await refreshCityPopulationMetadata(atlasId, {
      force: request.data?.force === true,
    });
  },
);

type BulkCityCreateRow = {
  rowNumber?: number;
  cityName?: string;
  regionName?: string;
  countryCode?: string;
  timezone?: string;
  name?: string;
  description?: string;
  globalRegion?: string;
  population?: number | string | null;
  populationYear?: number | string | null;
  areaKm2?: number | string | null;
  populationDensityPerKm2?: number | string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type BulkCityCreateResult = {
  rowNumber: number;
  cityName: string;
  slug: string;
  status: 'created' | 'skipped' | 'failed';
  atlasId: string | null;
  error: string | null;
};

function cityImportSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'wiki';
}

function cityImportIdentity(value: string): string {
  return value
    .toLowerCase()
    .replace(/^living wiki:\s*/i, '')
    .replace(/\s*\(flagship\)\s*$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }
  return null;
}

function decimalNumberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function nullableTextFromUnknown(value: unknown, maxLength: number): string | null {
  const text = textFromUnknown(value).slice(0, maxLength);
  return text || null;
}

function bulkCityResult(
  row: BulkCityCreateRow,
  status: BulkCityCreateResult['status'],
  details: Partial<Omit<BulkCityCreateResult, 'rowNumber' | 'cityName' | 'status'>>,
): BulkCityCreateResult {
  return {
    rowNumber: typeof row.rowNumber === 'number' && Number.isFinite(row.rowNumber) ? Math.round(row.rowNumber) : 0,
    cityName: textFromUnknown(row.cityName).slice(0, 120),
    slug: details.slug ?? '',
    status,
    atlasId: details.atlasId ?? null,
    error: details.error ?? null,
  };
}

export const createBulkCityAtlases = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    await assertCanCreateWiki(uid);

    const rows = Array.isArray(request.data?.rows)
      ? (request.data.rows as BulkCityCreateRow[])
      : [];
    if (rows.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one city row is required.');
    }
    if (rows.length > 250) {
      throw new HttpsError('invalid-argument', 'Import up to 250 cities at a time.');
    }

    const publicSnapshot = await db.collection('atlases').where('is_public', '==', true).get();
    const existingKeys = new Set<string>();
    for (const docSnapshot of publicSnapshot.docs) {
      const atlas = docSnapshot.data();
      const cityConfig = atlas.city_config && typeof atlas.city_config === 'object'
        ? atlas.city_config as Record<string, unknown>
        : {};
      [
        textFromUnknown(atlas.slug),
        cityImportIdentity(textFromUnknown(cityConfig.city_name)),
        cityImportIdentity(textFromUnknown(atlas.name)),
      ].filter(Boolean).forEach((key) => existingKeys.add(key));
    }

    const batch = db.batch();
    const results: BulkCityCreateResult[] = [];
    const now = FieldValue.serverTimestamp();
    const seenInRequest = new Set<string>();
    let createCount = 0;

    for (const row of rows) {
      const cityName = textFromUnknown(row.cityName).replace(/\s+/g, ' ').slice(0, 120);
      const name = (textFromUnknown(row.name).replace(/\s+/g, ' ').slice(0, 160) || `Living Wiki: ${cityName}`).trim();
      const slug = cityImportSlug(name);
      const cityKey = cityImportIdentity(cityName);
      const nameKey = cityImportIdentity(name);
      const keys = [slug, cityKey, nameKey].filter(Boolean);

      if (!cityName) {
        results.push(bulkCityResult(row, 'failed', { slug, error: 'City name is required.' }));
        continue;
      }
      if (!slug || keys.length === 0) {
        results.push(bulkCityResult(row, 'failed', { slug, error: 'City identity is invalid.' }));
        continue;
      }
      if (keys.some((key) => existingKeys.has(key) || seenInRequest.has(key))) {
        results.push(bulkCityResult(row, 'skipped', { slug }));
        keys.forEach((key) => seenInRequest.add(key));
        continue;
      }

      const countryCode = textFromUnknown(row.countryCode).toUpperCase();
      const cleanCountryCode = /^[A-Z]{2}$/.test(countryCode) ? countryCode : 'US';
      const regionName = nullableTextFromUnknown(row.regionName, 120);
      const timezone = textFromUnknown(row.timezone).slice(0, 80) || 'America/New_York';
      const globalRegion = nullableTextFromUnknown(row.globalRegion, 60);
      const population = numberFromUnknown(row.population);
      const populationYear = numberFromUnknown(row.populationYear);
      const areaKm2 = decimalNumberFromUnknown(row.areaKm2);
      const populationDensityPerKm2 = numberFromUnknown(row.populationDensityPerKm2)
        ?? (areaKm2 && population ? Math.round(population / areaKm2) : null);
      const latitude = typeof row.latitude === 'number' && Number.isFinite(row.latitude) && row.latitude >= -90 && row.latitude <= 90
        ? row.latitude
        : null;
      const longitude = typeof row.longitude === 'number' && Number.isFinite(row.longitude) && row.longitude >= -180 && row.longitude <= 180
        ? row.longitude
        : null;
      const description = textFromUnknown(row.description).slice(0, 700)
        || `${cityName}'s practical local knowledge, civic updates, transit, culture, climate, jobs, food, neighborhoods, and public information.`;
      const regionPhrase = regionName ? `${cityName}, ${regionName}` : cityName;
      const atlasRef = db.collection('atlases').doc();

      batch.set(atlasRef, {
        user_id: uid,
        wiki_type: 'city',
        name,
        slug,
        description,
        landing_summary: `A city-first guide for ${regionPhrase}, focused on practical local knowledge, neighborhoods, transit, civic life, culture, climate, jobs, food, and local updates.`,
        is_public: true,
        logo_url: '/assets/image/living-cities.png',
        hero_url: null,
        video_url: null,
        cover_color: '#255a61',
        default_answer_mode: 'internet',
        city_config: {
          enabled: true,
          city_name: cityName,
          region_name: regionName,
          country_code: cleanCountryCode,
          timezone,
          census_state_code: null,
          census_place_code: null,
          airnow_zip_code: null,
          latitude,
          longitude,
          metadata: {
            global_region: globalRegion,
            population,
            population_year: populationYear,
            area_km2: areaKm2,
            population_density_per_km2: populationDensityPerKm2,
            population_scope: population ? 'unknown' : null,
            population_source: population ? 'manual' : null,
            population_source_url: null,
            population_source_record_id: null,
            population_fetched_at: population ? new Date().toISOString() : null,
            population_confidence: population ? 'medium' : null,
            population_match_method: population ? 'manual' : null,
          },
          manual_metrics: null,
        },
        chat_guide: {
          name: `${cityName} Guide`,
          label: `Ask about ${cityName} civic life, transit, culture, climate, jobs, food, neighborhoods, and local updates.`,
          image_url: '/assets/image/living-cities.png',
          banner_url: null,
        },
        persona_prompt: [
          `You are the Living Wiki guide for ${regionPhrase}.`,
          `Speak with practical local confidence about ${cityName}, while staying source-aware and clear about uncertainty.`,
          'Use live internet grounding by default because this city was created before source ingestion.',
          'Keep answers concise, readable, energetic, and useful for residents, visitors, builders, researchers, and local operators.',
          'Include tasteful local emojis when they make the answer feel more alive, but keep the facts precise.',
        ].join(' '),
        created_at: now,
        updated_at: now,
      });

      createCount += 1;
      keys.forEach((key) => {
        existingKeys.add(key);
        seenInRequest.add(key);
      });
      results.push(bulkCityResult(row, 'created', { slug, atlasId: atlasRef.id }));
    }

    if (createCount > 0) {
      await batch.commit();
    }

    return {
      created: results.filter((result) => result.status === 'created').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      failed: results.filter((result) => result.status === 'failed').length,
      results,
    };
  },
);

type UniversityCreateRow = {
  rowNumber?: number;
  unitId?: string | number;
  opeId?: string | null;
  officialName?: string;
  city?: string;
  state?: string;
  website?: string | null;
  accreditationAgency?: string | null;
  control?: string | null;
  highestDegree?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  undergraduateEnrollment?: number | null;
  admissionRate?: number | null;
  completionRate?: number | null;
  retentionRate?: number | null;
  averageNetPrice?: number | null;
  medianEarnings10Year?: number | null;
  dataYear?: number | null;
  cohortRank?: number | null;
  cohortScore?: number | null;
  cohortVersion?: string | null;
  sourceUrl?: string | null;
  sourceFetchedAt?: string | null;
  heroUrl?: string | null;
  logoUrl?: string | null;
  heroSourcePage?: string | null;
  logoSourcePage?: string | null;
  description?: string | null;
};

type UniversityCreateResult = {
  rowNumber: number;
  unitId: string;
  officialName: string;
  slug: string;
  status: 'created' | 'skipped' | 'failed';
  atlasId: string | null;
  error: string | null;
};

function universityNumber(value: unknown, options: { min?: number; max?: number } = {}): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (options.min !== undefined && parsed < options.min) return null;
  if (options.max !== undefined && parsed > options.max) return null;
  return parsed;
}

function universityUrl(value: unknown): string | null {
  const raw = textFromUnknown(value).trim().slice(0, 1000);
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export const createUniversityAtlases = onCall(
  {
    region: callableRegion,
    cors: true,
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    await assertPlatformAdmin(uid);

    const rows = Array.isArray(request.data?.rows) ? request.data.rows as UniversityCreateRow[] : [];
    if (!rows.length) throw new HttpsError('invalid-argument', 'At least one university row is required.');
    if (rows.length > 250) throw new HttpsError('invalid-argument', 'Import up to 250 universities at a time.');

    const existingSnapshot = await db.collection('atlases').where('is_public', '==', true).get();
    const existingUnitIds = new Set(existingSnapshot.docs.map((docSnapshot) => {
      const config = docSnapshot.data().university_config as Record<string, unknown> | undefined;
      return textFromUnknown(config?.unit_id);
    }).filter(Boolean));
    const existingSlugs = new Set(existingSnapshot.docs.map((docSnapshot) => textFromUnknown(docSnapshot.data().slug)).filter(Boolean));
    const seenUnitIds = new Set<string>();
    const seenSlugs = new Set<string>();
    const results: UniversityCreateResult[] = [];
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    let createCount = 0;

    for (const row of rows) {
      const rowNumber = Math.round(universityNumber(row.rowNumber, { min: 0 }) ?? 0);
      const unitId = textFromUnknown(row.unitId).replace(/\D/g, '').slice(0, 12);
      const officialName = textFromUnknown(row.officialName).replace(/\s+/g, ' ').trim().slice(0, 180);
      const city = textFromUnknown(row.city).replace(/\s+/g, ' ').trim().slice(0, 100);
      const state = textFromUnknown(row.state).trim().toUpperCase().slice(0, 2);
      const baseSlug = cityImportSlug(officialName);
      let slug = baseSlug;
      const withSuffix = (base: string, suffix: string) => {
        const cleanSuffix = cityImportSlug(suffix).slice(0, 16);
        return `${base.slice(0, Math.max(1, 47 - cleanSuffix.length))}-${cleanSuffix}`;
      };
      if (existingSlugs.has(slug) || seenSlugs.has(slug)) slug = withSuffix(baseSlug, state);
      if (existingSlugs.has(slug) || seenSlugs.has(slug)) slug = withSuffix(baseSlug, `${state}-${unitId}`);
      const base = { rowNumber, unitId, officialName, slug, atlasId: null };

      if (!unitId || !officialName || !city || !/^[A-Z]{2}$/.test(state)) {
        results.push({ ...base, status: 'failed', error: 'Unit ID, official name, city, and two-letter state are required.' });
        continue;
      }
      if (existingUnitIds.has(unitId) || seenUnitIds.has(unitId)) {
        results.push({ ...base, status: 'skipped', error: null });
        continue;
      }

      const controlValue = textFromUnknown(row.control);
      const control = ['Public', 'Private nonprofit', 'Private for-profit'].includes(controlValue)
        ? controlValue
        : 'Unknown';
      const website = universityUrl(row.website);
      const heroUrl = universityUrl(row.heroUrl);
      const logoUrl = universityUrl(row.logoUrl);
      const location = `${city}, ${state}`;
      const description = textFromUnknown(row.description).slice(0, 900)
        || `${officialName} is a ${control.toLowerCase()} institution in ${location}. Explore admissions, academics, campus life, costs, outcomes, and current official information.`;
      const atlasRef = db.collection('atlases').doc();
      const fetchedAt = nullableTextFromUnknown(row.sourceFetchedAt, 60) || new Date().toISOString();
      const universityConfig = {
        enabled: true,
        unit_id: unitId,
        ope_id: nullableTextFromUnknown(row.opeId, 20),
        official_name: officialName,
        city,
        state,
        country_code: 'US',
        website,
        accreditation_agency: nullableTextFromUnknown(row.accreditationAgency, 240),
        control,
        highest_degree: nullableTextFromUnknown(row.highestDegree, 80),
        latitude: universityNumber(row.latitude, { min: -90, max: 90 }),
        longitude: universityNumber(row.longitude, { min: -180, max: 180 }),
        undergraduate_enrollment: universityNumber(row.undergraduateEnrollment, { min: 0 }),
        admission_rate: universityNumber(row.admissionRate, { min: 0, max: 1 }),
        completion_rate: universityNumber(row.completionRate, { min: 0, max: 1 }),
        retention_rate: universityNumber(row.retentionRate, { min: 0, max: 1 }),
        average_net_price: universityNumber(row.averageNetPrice, { min: 0 }),
        median_earnings_10_year: universityNumber(row.medianEarnings10Year, { min: 0 }),
        data_year: universityNumber(row.dataYear, { min: 2000, max: 2100 }),
        cohort_rank: universityNumber(row.cohortRank, { min: 1 }),
        cohort_score: universityNumber(row.cohortScore, { min: 0, max: 100 }),
        cohort_version: nullableTextFromUnknown(row.cohortVersion, 80),
        source_url: universityUrl(row.sourceUrl),
        source_fetched_at: fetchedAt,
        hero_source: {
          url: heroUrl,
          page_url: universityUrl(row.heroSourcePage),
          provider: heroUrl ? 'wikimedia' : 'fallback',
          title: officialName,
          license: null,
          fetched_at: fetchedAt,
        },
        logo_source: {
          url: logoUrl,
          page_url: universityUrl(row.logoSourcePage),
          provider: logoUrl ? 'wikimedia' : 'fallback',
          title: `${officialName} logo`,
          license: null,
          fetched_at: fetchedAt,
        },
      };

      batch.set(atlasRef, {
        user_id: uid,
        wiki_type: 'university',
        name: slug === baseSlug ? officialName : `${officialName} (${state})`,
        slug,
        description,
        landing_summary: `A source-aware guide to ${officialName}: academics, admissions, cost, campus life, outcomes, and current institutional information.`,
        is_public: true,
        logo_url: logoUrl,
        hero_url: heroUrl,
        video_url: null,
        cover_color: '#173f35',
        default_answer_mode: 'internet',
        city_config: null,
        university_config: universityConfig,
        chat_guide: {
          name: `${officialName} Guide`,
          label: `Ask about ${officialName} academics, admissions, costs, campus life, outcomes, and current news.`,
          image_url: logoUrl,
          banner_url: heroUrl,
        },
        persona_prompt: [
          `You are the LivingWiki guide for ${officialName} in ${location}.`,
          `Use official institutional sources and U.S. Department of Education data first.`,
          `Separate verified facts from interpretation, state the data year for statistics, and never invent rankings, programs, costs, admissions figures, or campus details.`,
          `Be concise, welcoming, useful to prospective students, current students, families, alumni, faculty, and researchers.`,
        ].join(' '),
        import_batch_id: nullableTextFromUnknown(row.cohortVersion, 80),
        created_at: now,
        updated_at: now,
      });

      createCount += 1;
      existingUnitIds.add(unitId);
      existingSlugs.add(slug);
      seenUnitIds.add(unitId);
      seenSlugs.add(slug);
      results.push({ ...base, status: 'created', atlasId: atlasRef.id, error: null });
    }

    if (createCount) await batch.commit();
    return {
      created: results.filter((result) => result.status === 'created').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      failed: results.filter((result) => result.status === 'failed').length,
      results,
    };
  },
);

export const refreshCityPulseDaily = onSchedule(
  {
    region: callableRegion,
    schedule: '0 6 * * *',
    timeZone: 'America/New_York',
    timeoutSeconds: 540,
    memory: '1GiB',
    maxInstances: 1,
  },
  async () => {
    const atlasIds = await listEnabledCityAtlasIds();
    for (const atlasId of atlasIds) {
      try {
        await refreshStoredCityPulseSnapshot(atlasId, 'schedule');
      } catch (error) {
        logger.warn('refreshCityPulseDaily failed for atlas', {
          atlasId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
);

export const getPhillyGreenJobsSnapshot = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async () => {
    const snapshot = await getStoredPhillyGreenJobsSnapshot();
    if (snapshot) {
      return snapshot;
    }

    return await refreshStoredPhillyGreenJobsSnapshot('bootstrap');
  },
);

export const refreshPhillyGreenJobs = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 300,
    memory: '1GiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const atlas = await loadPublicAtlasBySlug('philly');
    if (atlas.user_id !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Only the Philly atlas owner can refresh green jobs.');
    }

    return await refreshStoredPhillyGreenJobsSnapshot('admin');
  },
);

export const refreshPhillyGreenJobsDaily = onSchedule(
  {
    region: callableRegion,
    schedule: '0 5 * * *',
    timeZone: 'America/New_York',
    timeoutSeconds: 300,
    memory: '1GiB',
    maxInstances: 1,
  },
  async () => {
    await refreshStoredPhillyGreenJobsSnapshot('schedule');
  },
);

export const getPublicAtlasDocuments = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const atlasId = String(request.data?.atlasId ?? '').trim();
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    const atlas = await loadPublicAtlasById(atlasId);
    const snapshot = await db
      .collection('documents')
      .where('user_id', '==', atlas.user_id)
      .where('atlas_id', '==', atlas.id)
      .where('visible', '==', true)
      .orderBy('uploaded_at', 'desc')
      .limit(250)
      .get();

    return {
      documents: snapshot.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          ...data,
          uploaded_at: normalizeTimestamp(data.uploaded_at),
          indexed_at: normalizeTimestamp(data.indexed_at),
          last_heartbeat_at: normalizeTimestamp(data.last_heartbeat_at),
        };
      }),
    };
  },
);

export const getPublicWikiContent = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const atlasId = String(request.data?.atlasId ?? '').trim();
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'atlasId is required.');
    }

    const atlas = await loadPublicAtlasById(atlasId);

    const [articleSnapshot, topicSnapshot] = await Promise.all([
      db
        .collection('wiki_articles')
        .where('user_id', '==', atlas.user_id)
        .where('atlas_id', '==', atlasId)
        .orderBy('last_updated', 'desc')
        .limit(250)
        .get(),
      db
        .collection('wiki_topics')
        .where('user_id', '==', atlas.user_id)
        .where('atlas_id', '==', atlasId)
        .orderBy('last_updated', 'desc')
        .limit(250)
        .get(),
    ]);

    return {
      articles: articleSnapshot.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          ...data,
          created_at: normalizeTimestamp(data.created_at),
          last_updated: normalizeTimestamp(data.last_updated),
        };
      }),
      topics: topicSnapshot.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          ...data,
          last_updated: normalizeTimestamp(data.last_updated),
        };
      }),
    };
  },
);

export const getPublicWikiTopicDetails = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const topicId = String(request.data?.topicId ?? '').trim();
    if (!topicId) {
      throw new HttpsError('invalid-argument', 'topicId is required.');
    }

    const topicSnapshot = await db.collection('wiki_topics').doc(topicId).get();
    if (!topicSnapshot.exists) {
      throw new HttpsError('not-found', 'Topic not found.');
    }

    const topic = topicSnapshot.data() as Record<string, unknown> | undefined;
    if (!topic?.atlas_id || !topic.user_id) {
      throw new HttpsError('permission-denied', 'Topic is not public.');
    }

    const atlas = await loadPublicAtlasById(String(topic.atlas_id));
    if (atlas.user_id !== String(topic.user_id)) {
      throw new HttpsError('permission-denied', 'Topic is not public.');
    }

    const entryIds = ((topic.entry_ids as string[] | undefined) ?? []).slice(0, 250);
    if (entryIds.length === 0) {
      return { entries: [], sourceDocuments: [] };
    }

    const entrySnapshots = await Promise.all(
      entryIds.map((entryId) => db.collection('knowledge_entries').doc(entryId).get()),
    );

    const entryRecords = entrySnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() as Record<string, unknown>) })) as Array<
        Record<string, unknown> & { id: string }
      >;

    const entries = entryRecords.filter(
        (entry) =>
          String(entry.user_id ?? '') === atlas.user_id &&
          String(entry.atlas_id ?? '') === atlas.id &&
          entry.orphaned !== true,
      );

    const documentIds = Array.from(
      new Set(entries.map((entry) => String(entry.document_id ?? '')).filter(Boolean)),
    ).slice(0, 30);
    const documentSnapshots = await Promise.all(
      documentIds.map((documentId) => db.collection('documents').doc(documentId).get()),
    );

    const sourceDocumentRecords = documentSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() as Record<string, unknown>) })) as Array<
        Record<string, unknown> & { id: string }
      >;

    const sourceDocuments = sourceDocumentRecords
      .filter(
        (document) =>
          String(document.user_id ?? '') === atlas.user_id &&
          String(document.atlas_id ?? '') === atlas.id &&
          document.visible !== false,
      )
      .map((document) => ({
        ...document,
        uploaded_at: normalizeTimestamp(document.uploaded_at),
        indexed_at: normalizeTimestamp(document.indexed_at),
        last_heartbeat_at: normalizeTimestamp(document.last_heartbeat_at),
      }));

    return { entries, sourceDocuments };
  },
);

export const getWikiSourceDocumentLink = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    const documentId = String(request.data?.documentId ?? '').trim();
    const atlasId = String(request.data?.atlasId ?? '').trim();
    const filename = String(request.data?.filename ?? '').trim();
    if (!documentId && (!atlasId || !filename)) {
      throw new HttpsError('invalid-argument', 'documentId or atlasId + filename is required.');
    }

    let document:
      | {
          id: string;
          source_type?: unknown;
          source_url?: unknown;
          storage_path?: unknown;
        }
      | (Record<string, unknown> & { id: string });

    try {
      if (documentId) {
        document = await documentAccessAllowed(request.auth?.uid, documentId);
      } else {
        document = await findPublicDocumentByFilename(atlasId, filename);
      }
    } catch (error) {
      if (!atlasId || !filename) {
        throw error;
      }
      document = await findPublicDocumentByFilename(atlasId, filename);
    }

    if (document.source_type === 'url' && typeof document.source_url === 'string' && document.source_url) {
      return { url: document.source_url };
    }

    if (typeof document.storage_path !== 'string' || !document.storage_path) {
      throw new HttpsError('not-found', 'Document file is unavailable.');
    }

    return { url: await buildDocumentDownloadUrl(document.storage_path) };
  },
);

export const deleteQuery = onCall(
  {
    region: callableRegion,
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const queryId = String(request.data?.queryId ?? '').trim();
    if (!queryId) {
      throw new HttpsError('invalid-argument', 'queryId is required.');
    }

    try {
      return await deleteChatEntityForUser({
        chatId: queryId,
        userId: request.auth.uid,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete chat.';
      if (message === 'Chat not found.') {
        throw new HttpsError('not-found', message);
      }
      if (message === 'You do not have access to this chat.') {
        throw new HttpsError('permission-denied', message);
      }
      throw new HttpsError('internal', message);
    }
  },
);

type BulkBoardAdminAction =
  | 'publish'
  | 'remove_from_city'
  | 'exclude_source'
  | 'approve_source'
  | 'trash'
  | 'restore'
  | 'permanent_delete';

function bulkBoardDashboardTimestamp(value: unknown): string | null {
  return timestampToIso(value);
}

function bulkBoardDashboardDocument(id: string, value: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    ...value,
    created_at: bulkBoardDashboardTimestamp(value.created_at),
    updated_at: bulkBoardDashboardTimestamp(value.updated_at),
    started_at: bulkBoardDashboardTimestamp(value.started_at),
    completed_at: bulkBoardDashboardTimestamp(value.completed_at),
    deleted_at: bulkBoardDashboardTimestamp(value.deleted_at),
    approved_at: bulkBoardDashboardTimestamp(value.approved_at),
  };
}

type GlobalCityBoardCatalogStatus = {
  cityCount: number;
  bucketCount: number;
  expectedCount: number;
  publishedCount: number;
  reviewCount: number;
  missingCount: number;
  invalidCount: number;
  buckets: Array<{
    id: string;
    expectedCount: number;
    publishedCount: number;
    reviewCount: number;
    missingCount: number;
    invalidCount: number;
  }>;
};

function globalCityBoardCatalogStatus(
  cityIds: string[],
  boardDocuments: Array<{ id: string; data: Record<string, unknown> }>,
): GlobalCityBoardCatalogStatus {
  const boardsByKey = new Map(boardDocuments.map(({ data }) => [textFromUnknown(data.generation_key), data]));
  const buckets = GLOBAL_CITY_BOARD_TEMPLATES.map((template) => {
    const status = {
      id: template.id,
      expectedCount: cityIds.length,
      publishedCount: 0,
      reviewCount: 0,
      missingCount: 0,
      invalidCount: 0,
    };
    for (const cityId of cityIds) {
      const generationKey = bulkBoardGenerationKey(cityId, normalizeBulkBoardTemplate(template));
      const board = boardsByKey.get(generationKey);
      if (!board || board.deleted_at) {
        status.missingCount += 1;
        continue;
      }
      const cards = Array.isArray(board.cards) ? board.cards : [];
      const validation = board.validation_summary && typeof board.validation_summary === 'object'
        ? board.validation_summary as Record<string, unknown>
        : {};
      const identitiesValidated = validation.all_have_coordinates === true
        || (validation.validation_mode === 'source_backed_editorial'
          && validation.all_have_source_urls === true);
      const structurallyValid = cards.length === template.count
        && Number(validation.requested_count) === template.count
        && Number(validation.verified_count) === template.count
        && Number(validation.unique_place_ids) === template.count
        && identitiesValidated
        && textFromUnknown(board.atlas_id) === cityId
        && textFromUnknown(board.generated_for_atlas_id) === cityId
        && textFromUnknown(board.template_id) === template.id
        && textFromUnknown(board.template_version) === template.version;
      if (!structurallyValid) {
        status.invalidCount += 1;
      } else if (board.editorial_status === 'published'
        && board.city_listing_status === 'listed'
        && board.visibility === 'public') {
        status.publishedCount += 1;
      } else {
        status.reviewCount += 1;
      }
    }
    return status;
  });
  return {
    cityCount: cityIds.length,
    bucketCount: GLOBAL_CITY_BOARD_TEMPLATES.length,
    expectedCount: cityIds.length * GLOBAL_CITY_BOARD_TEMPLATES.length,
    publishedCount: buckets.reduce((sum, bucket) => sum + bucket.publishedCount, 0),
    reviewCount: buckets.reduce((sum, bucket) => sum + bucket.reviewCount, 0),
    missingCount: buckets.reduce((sum, bucket) => sum + bucket.missingCount, 0),
    invalidCount: buckets.reduce((sum, bucket) => sum + bucket.invalidCount, 0),
    buckets,
  };
}

type UniversityBoardTarget = {
  id: string;
  name: string;
  shortName: string;
  townName: string;
  state: string;
  countryCode: string;
  slug: string;
  unitId: string;
  website: string;
  latitude: number | null;
  longitude: number | null;
};

function universityBoardTargetFromAtlas(
  id: string,
  atlas: Record<string, unknown>,
): UniversityBoardTarget | null {
  const config = atlas.university_config && typeof atlas.university_config === 'object'
    ? atlas.university_config as Record<string, unknown>
    : {};
  if (atlas.is_public !== true || config.enabled !== true || atlas.wiki_type !== 'university') return null;
  const name = textFromUnknown(config.official_name) || textFromUnknown(atlas.name);
  const townName = textFromUnknown(config.city);
  const state = textFromUnknown(config.state).toUpperCase();
  if (!name || !townName || !state) return null;
  const shortName = name
    .replace(/-Main Campus$/i, '')
    .replace(/ in the City of [A-Z][\w .'-]+$/i, '')
    .trim();
  const latitude = Number(config.latitude);
  const longitude = Number(config.longitude);
  return {
    id,
    name,
    shortName: shortName || name,
    townName,
    state,
    countryCode: textFromUnknown(config.country_code).toUpperCase() || 'US',
    slug: textFromUnknown(atlas.slug),
    unitId: textFromUnknown(config.unit_id),
    website: textFromUnknown(config.website),
    latitude: Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? latitude : null,
    longitude: Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? longitude : null,
  };
}

function universityBoardGenerationKey(
  atlasId: string,
  template: Pick<GlobalUniversityBoardTemplate, 'id' | 'version'>,
): string {
  return `${atlasId}__${template.id}__${template.version}`;
}

function universityBoardTemplateInput(template: GlobalUniversityBoardTemplate): Record<string, unknown> {
  return {
    id: template.id,
    version: template.version,
    titlePattern: template.titlePattern,
    searchQuery: template.researchQueries.join(' '),
    editorialBrief: template.editorialBrief,
    count: template.count,
    cardTitleMode: 'subject',
    icon: template.icon,
    primarySubjectType: template.primarySubjectType,
    allowedSubjectTypes: [...template.allowedSubjectTypes],
    freshnessDays: template.freshnessDays,
  };
}

function globalUniversityBoardCatalogStatus(
  targets: UniversityBoardTarget[],
  boardDocuments: Array<{ id: string; data: Record<string, unknown> }>,
): GlobalCityBoardCatalogStatus & { targetCount: number } {
  const boardsByKey = new Map(boardDocuments.map(({ data }) => [textFromUnknown(data.generation_key), data]));
  const buckets = GLOBAL_UNIVERSITY_BOARD_TEMPLATES.map((template) => {
    const status = {
      id: template.id,
      expectedCount: targets.length,
      publishedCount: 0,
      reviewCount: 0,
      missingCount: 0,
      invalidCount: 0,
    };
    for (const target of targets) {
      const board = boardsByKey.get(universityBoardGenerationKey(target.id, template));
      if (!board || board.deleted_at) {
        status.missingCount += 1;
        continue;
      }
      const cards = Array.isArray(board.cards) ? board.cards : [];
      const validation = board.validation_summary && typeof board.validation_summary === 'object'
        ? board.validation_summary as Record<string, unknown>
        : {};
      const score = Number(board.generation_score);
      const imageFingerprints = new Set(cards.map((card) => textFromUnknown(
        (card as Record<string, unknown>)?.imageFingerprint,
      )).filter(Boolean));
      const relatedFallbackMode = textFromUnknown(validation.image_validation_mode)
        === 'exact_or_related_university_location_with_limited_reuse_and_provenance';
      const imageDiversityAccepted = imageFingerprints.size === cards.length
        || (relatedFallbackMode && imageFingerprints.size >= 7);
      const imagesValidated = cards.every((card) => {
        const universityCard = card as Record<string, unknown>;
        return textFromUnknown(universityCard.imageUrl).includes('firebasestorage.googleapis.com')
          && !!textFromUnknown(universityCard.imageSourceUrl)
          && !!textFromUnknown(universityCard.imageFingerprint);
      }) && imageDiversityAccepted
        && validation.all_have_images === true
        && Number(validation.image_count) === template.count
        && Number(validation.unique_image_count) === imageFingerprints.size;
      const structurallyValid = cards.length === template.count
        && Number(validation.requested_count) === template.count
        && Number(validation.verified_count) === template.count
        && Number(validation.unique_subject_ids) === template.count
        && validation.all_have_source_urls === true
        && textFromUnknown(board.atlas_id) === target.id
        && textFromUnknown(board.generated_for_atlas_id) === target.id
        && textFromUnknown(board.template_id) === template.id
        && textFromUnknown(board.template_version) === template.version
        && Number.isFinite(score)
        && score >= 70
        && imagesValidated;
      if (!structurallyValid) {
        status.invalidCount += 1;
      } else if (board.editorial_status === 'published'
        && board.city_listing_status === 'listed'
        && board.visibility === 'public') {
        status.publishedCount += 1;
      } else {
        status.reviewCount += 1;
      }
    }
    return status;
  });
  return {
    cityCount: targets.length,
    targetCount: targets.length,
    bucketCount: GLOBAL_UNIVERSITY_BOARD_TEMPLATES.length,
    expectedCount: targets.length * GLOBAL_UNIVERSITY_BOARD_TEMPLATES.length,
    publishedCount: buckets.reduce((sum, bucket) => sum + bucket.publishedCount, 0),
    reviewCount: buckets.reduce((sum, bucket) => sum + bucket.reviewCount, 0),
    missingCount: buckets.reduce((sum, bucket) => sum + bucket.missingCount, 0),
    invalidCount: buckets.reduce((sum, bucket) => sum + bucket.invalidCount, 0),
    buckets,
  };
}

async function canManageBulkBoardAtlas(userId: string, atlasId: string): Promise<boolean> {
  const [userSnapshot, atlasSnapshot] = await Promise.all([
    db.collection('users').doc(userId).get(),
    db.collection('atlases').doc(atlasId).get(),
  ]);
  if (userSnapshot.data()?.role === 'admin') {
    return true;
  }
  if (!atlasSnapshot.exists) {
    return false;
  }
  const atlas = atlasSnapshot.data() as Record<string, unknown>;
  const adminUserIds = Array.isArray(atlas.admin_user_ids)
    ? atlas.admin_user_ids.map((value) => String(value))
    : [];
  return String(atlas.user_id ?? '') === userId || adminUserIds.includes(userId);
}

async function assertBulkBoardAtlasAccess(userId: string, atlasId: string): Promise<void> {
  if (!await canManageBulkBoardAtlas(userId, atlasId)) {
    throw new HttpsError('permission-denied', 'You cannot manage boards for this city.');
  }
}

export const getBulkBoardAdminDashboard = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 60, memory: '1GiB' },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    const requestingUserId = request.auth.uid;
    await assertPlatformAdmin(requestingUserId);

    const [atlasSnapshot, jobSnapshot, boardSnapshot] = await Promise.all([
      db.collection('atlases').where('is_public', '==', true).get(),
      db.collection('board_generation_jobs').orderBy('created_at', 'desc').limit(20).get(),
      db.collection('boards').where('origin', '==', 'bulk_generator').get(),
    ]);
    const cities = atlasSnapshot.docs
      .flatMap((atlasDocument) => {
        const atlas = atlasDocument.data() as Record<string, unknown>;
        const cityConfig = atlas.city_config && typeof atlas.city_config === 'object'
          ? atlas.city_config as Record<string, unknown>
          : {};
        if (cityConfig.enabled !== true) return [];
        const name = textFromUnknown(cityConfig.city_name)
          || textFromUnknown(atlas.name).replace(/^Living Wiki:\s*/i, '');
        if (!name) return [];
        return [{
          id: atlasDocument.id,
          name,
          region: textFromUnknown(cityConfig.region_name),
          countryCode: textFromUnknown(cityConfig.country_code),
          slug: textFromUnknown(atlas.slug),
        }];
      })
      .sort((left, right) => left.name.localeCompare(right.name));
    const jobs = jobSnapshot.docs.map((document) => bulkBoardDashboardDocument(
      document.id,
      document.data() as Record<string, unknown>,
    ));
    const latestJobId = textFromUnknown(jobs[0]?.['id']);
    const itemSnapshot = latestJobId
      ? await db.collection('board_generation_items').where('job_id', '==', latestJobId).limit(1600).get()
      : null;
    const items = itemSnapshot?.docs.map((document) => bulkBoardDashboardDocument(
      document.id,
      document.data() as Record<string, unknown>,
    )) ?? [];
    const boards = boardSnapshot.docs
      .map((document) => {
        const data = document.data() as Record<string, unknown>;
        return bulkBoardDashboardDocument(document.id, {
          title: textFromUnknown(data.title),
          atlas_id: textFromUnknown(data.atlas_id),
          generated_for_atlas_id: textFromUnknown(data.generated_for_atlas_id),
          generation_job_id: textFromUnknown(data.generation_job_id),
          generation_key: textFromUnknown(data.generation_key),
          template_id: textFromUnknown(data.template_id),
          template_version: textFromUnknown(data.template_version),
          rubric_version: textFromUnknown(data.rubric_version),
          editorial_status: textFromUnknown(data.editorial_status),
          city_listing_status: textFromUnknown(data.city_listing_status),
          source_status: textFromUnknown(data.source_status),
          quality_status: textFromUnknown(data.quality_status),
          quality_warnings: Array.isArray(data.quality_warnings)
            ? data.quality_warnings.map((warning) => textFromUnknown(warning)).filter(Boolean).slice(0, 20)
            : [],
          generation_score: Number.isFinite(Number(data.generation_score)) ? Number(data.generation_score) : null,
          generation_grade: textFromUnknown(data.generation_grade),
          generation_score_breakdown: data.generation_score_breakdown ?? null,
          generation_score_reasons: Array.isArray(data.generation_score_reasons)
            ? data.generation_score_reasons.map((reason) => textFromUnknown(reason)).filter(Boolean).slice(0, 12)
            : [],
          validation_summary: data.validation_summary ?? null,
          visibility: textFromUnknown(data.visibility),
          card_count: Array.isArray(data.cards) ? data.cards.length : 0,
          created_at: data.created_at_iso ?? data.created_at,
          updated_at: data.updated_at_iso ?? data.updated_at,
          deleted_at: data.deleted_at,
          deletion_reason: textFromUnknown(data.deletion_reason),
        });
      })
      .sort((left, right) => String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? '')));
    const catalog = globalCityBoardCatalogStatus(
      cities.map((city) => city.id),
      boardSnapshot.docs.map((document) => ({
        id: document.id,
        data: document.data() as Record<string, unknown>,
      })),
    );

    return {
      generatorVersion: '1.0.0',
      rubricVersion: BULK_BOARD_RUBRIC_VERSION,
      cities,
      jobs,
      items,
      boards,
      catalog,
    };
  },
);

export const getUniversityBoardAdminDashboard = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 90, memory: '2GiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    await assertPlatformAdmin(request.auth.uid);

    const [atlasSnapshot, jobSnapshot, boardSnapshot] = await Promise.all([
      db.collection('atlases').where('is_public', '==', true).get(),
      db.collection('board_generation_jobs').orderBy('created_at', 'desc').limit(100).get(),
      db.collection('boards').where('origin', '==', 'bulk_generator').get(),
    ]);
    const targets = atlasSnapshot.docs
      .map((document) => universityBoardTargetFromAtlas(
        document.id,
        document.data() as Record<string, unknown>,
      ))
      .filter((target): target is UniversityBoardTarget => !!target)
      .sort((left, right) => left.name.localeCompare(right.name));
    const targetIds = new Set(targets.map((target) => target.id));
    const universityBoardDocuments = boardSnapshot.docs
      .map((document) => ({ id: document.id, data: document.data() as Record<string, unknown> }))
      .filter(({ data }) => data.target_kind === 'university'
        || targetIds.has(textFromUnknown(data.atlas_id || data.generated_for_atlas_id)));
    const jobs = jobSnapshot.docs
      .filter((document) => document.data().target_kind === 'university')
      .slice(0, 20)
      .map((document) => bulkBoardDashboardDocument(
        document.id,
        document.data() as Record<string, unknown>,
      ));
    const latestJobId = textFromUnknown(jobs[0]?.['id']);
    const itemSnapshot = latestJobId
      ? await db.collection('board_generation_items').where('job_id', '==', latestJobId).limit(750).get()
      : null;
    const items = itemSnapshot?.docs.map((document) => bulkBoardDashboardDocument(
      document.id,
      document.data() as Record<string, unknown>,
    )) ?? [];
    const boards = universityBoardDocuments.map(({ id, data }) => bulkBoardDashboardDocument(id, {
      title: textFromUnknown(data.title),
      atlas_id: textFromUnknown(data.atlas_id),
      generated_for_atlas_id: textFromUnknown(data.generated_for_atlas_id),
      generation_job_id: textFromUnknown(data.generation_job_id),
      generation_key: textFromUnknown(data.generation_key),
      target_kind: 'university',
      generation_engine: textFromUnknown(data.generation_engine),
      template_id: textFromUnknown(data.template_id),
      template_version: textFromUnknown(data.template_version),
      rubric_version: textFromUnknown(data.rubric_version),
      editorial_status: textFromUnknown(data.editorial_status),
      city_listing_status: textFromUnknown(data.city_listing_status),
      source_status: textFromUnknown(data.source_status),
      quality_status: textFromUnknown(data.quality_status),
      quality_warnings: Array.isArray(data.quality_warnings)
        ? data.quality_warnings.map((warning) => textFromUnknown(warning)).filter(Boolean).slice(0, 20)
        : [],
      generation_score: Number.isFinite(Number(data.generation_score)) ? Number(data.generation_score) : null,
      generation_grade: textFromUnknown(data.generation_grade),
      generation_score_breakdown: data.generation_score_breakdown ?? null,
      generation_score_reasons: Array.isArray(data.generation_score_reasons)
        ? data.generation_score_reasons.map((reason) => textFromUnknown(reason)).filter(Boolean).slice(0, 12)
        : [],
      validation_summary: data.validation_summary ?? null,
      paid_artifact_recovery: data.paid_artifact_recovery === true,
      visibility: textFromUnknown(data.visibility),
      card_count: Array.isArray(data.cards) ? data.cards.length : 0,
      created_at: data.created_at_iso ?? data.created_at,
      updated_at: data.updated_at_iso ?? data.updated_at,
      deleted_at: data.deleted_at,
      deletion_reason: textFromUnknown(data.deletion_reason),
    })).sort((left, right) => String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? '')));
    const catalog = globalUniversityBoardCatalogStatus(targets, universityBoardDocuments);

    return {
      generatorVersion: 'codex-university-1.0.0',
      rubricVersion: 'university-1.0',
      targetKind: 'university',
      generationEngine: 'codex_local',
      cities: targets.map((target) => ({
        id: target.id,
        name: target.shortName,
        officialName: target.name,
        region: `${target.townName}, ${target.state}`,
        townName: target.townName,
        state: target.state,
        countryCode: target.countryCode,
        slug: target.slug,
        unitId: target.unitId,
        website: target.website,
        latitude: target.latitude,
        longitude: target.longitude,
        kind: 'university',
      })),
      jobs,
      items,
      itemDisplayLimit: 750,
      boards,
      catalog,
      templates: GLOBAL_UNIVERSITY_BOARD_TEMPLATES.map(universityBoardTemplateInput),
    };
  },
);

function canonicalUniversityBoardTemplate(value: unknown): GlobalUniversityBoardTemplate {
  const templateId = typeof value === 'string'
    ? textFromUnknown(value)
    : textFromUnknown((value as Record<string, unknown> | null | undefined)?.id);
  const template = GLOBAL_UNIVERSITY_BOARD_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) throw new HttpsError('invalid-argument', 'Choose one of the seven approved university board templates.');
  return template;
}

async function universityBoardGenerationChecks(
  atlasIds: string[],
  template: GlobalUniversityBoardTemplate,
): Promise<{
  targets: Array<{ snapshot: FirebaseFirestore.DocumentSnapshot; target: UniversityBoardTarget }>;
  existingCount: number;
  suppressedCount: number;
  ready: Array<{
    snapshot: FirebaseFirestore.DocumentSnapshot;
    target: UniversityBoardTarget;
    generationKey: string;
  }>;
}> {
  const snapshots = await db.getAll(...atlasIds.map((atlasId) => db.collection('atlases').doc(atlasId)));
  const targets = snapshots.flatMap((snapshot) => {
    const target = snapshot.exists
      ? universityBoardTargetFromAtlas(snapshot.id, snapshot.data() as Record<string, unknown>)
      : null;
    return target ? [{ snapshot, target }] : [];
  });
  if (targets.length !== atlasIds.length) {
    throw new HttpsError('failed-precondition', 'One or more selected universities are no longer eligible. Refresh and try again.');
  }
  const keyed = targets.map(({ snapshot, target }) => {
    const generationKey = universityBoardGenerationKey(snapshot.id, template);
    return {
      snapshot,
      target,
      generationKey,
      boardRef: db.collection('boards').doc(bulkBoardDocumentId(generationKey)),
      suppressionRef: db.collection('board_generation_suppressions').doc(bulkBoardSuppressionId(generationKey)),
    };
  });
  const [boards, suppressions] = await Promise.all([
    db.getAll(...keyed.map((entry) => entry.boardRef)),
    db.getAll(...keyed.map((entry) => entry.suppressionRef)),
  ]);
  const existingKeys = new Set(boards.flatMap((snapshot, index) => snapshot.exists && !snapshot.data()?.deleted_at
    ? [keyed[index].generationKey]
    : []));
  const suppressedKeys = new Set(suppressions.flatMap((snapshot, index) => snapshot.exists && snapshot.data()?.active !== false
    ? [keyed[index].generationKey]
    : []));
  return {
    targets,
    existingCount: existingKeys.size,
    suppressedCount: suppressedKeys.size,
    ready: keyed.filter((entry) => !existingKeys.has(entry.generationKey) && !suppressedKeys.has(entry.generationKey)),
  };
}

async function createUniversityBoardJob(params: {
  requestedBy: string;
  items: Array<{
    target: UniversityBoardTarget;
    generationKey: string;
    template: GlobalUniversityBoardTemplate;
  }>;
  catalogMode: boolean;
}): Promise<string> {
  const jobRef = db.collection('board_generation_jobs').doc();
  const lockId = 'university_codex_local';
  await db.runTransaction(async (transaction) => {
    const lockRef = db.collection('board_generation_locks').doc(lockId);
    const lockSnapshot = await transaction.get(lockRef);
    const lockedJobId = textFromUnknown(lockSnapshot.data()?.job_id);
    if (lockedJobId) {
      const lockedJob = await transaction.get(db.collection('board_generation_jobs').doc(lockedJobId));
      if (lockedJob.data()?.status === 'running' && lockedJob.data()?.cancel_requested !== true) {
        throw new HttpsError('already-exists', 'Another university Codex generation job is already running.');
      }
    }
    transaction.set(jobRef, {
      requested_by_user_id: params.requestedBy,
      target_kind: 'university',
      generation_engine: 'codex_local',
      lock_id: lockId,
      catalog_mode: params.catalogMode,
      catalog_bucket_ids: params.catalogMode ? GLOBAL_UNIVERSITY_BOARD_TEMPLATES.map((template) => template.id) : [],
      template: params.catalogMode
        ? { id: 'global-university-board-catalog', version: '1.0', titlePattern: 'Seven global buckets × all universities' }
        : universityBoardTemplateInput(params.items[0].template),
      rubric_version: 'university-1.0',
      score_rubric_version: '1.0',
      generator_version: 'codex-university-1.0.0',
      status: params.items.length ? 'running' : 'completed',
      worker_status: params.items.length ? 'waiting_for_codex' : 'complete',
      cancel_requested: false,
      total_count: params.items.length,
      completed_count: 0,
      success_count: 0,
      failed_count: 0,
      skipped_count: 0,
      cancelled_count: 0,
      atlas_ids: [...new Set(params.items.map((item) => item.target.id))],
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      ...(params.items.length ? {} : { completed_at: FieldValue.serverTimestamp() }),
    });
    transaction.set(lockRef, {
      job_id: jobRef.id,
      target_kind: 'university',
      generation_engine: 'codex_local',
      acquired_by_user_id: params.requestedBy,
      acquired_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  });
  try {
    for (let offset = 0; offset < params.items.length; offset += 300) {
      const batch = db.batch();
      for (const item of params.items.slice(offset, offset + 300)) {
        const itemId = `${jobRef.id}__${createHash('sha256').update(item.generationKey).digest('hex').slice(0, 28)}`;
        batch.set(db.collection('board_generation_items').doc(itemId), {
          job_id: jobRef.id,
          atlas_id: item.target.id,
          target_kind: 'university',
          generation_engine: 'codex_local',
          target_name: item.target.shortName,
          city_name: item.target.shortName,
          school_name: item.target.name,
          short_school_name: item.target.shortName,
          town_name: item.target.townName,
          region_name: `${item.target.townName}, ${item.target.state}`,
          state: item.target.state,
          country_code: item.target.countryCode,
          unit_id: item.target.unitId,
          website: item.target.website,
          latitude: item.target.latitude,
          longitude: item.target.longitude,
          template_id: item.template.id,
          template_version: item.template.version,
          template: universityBoardTemplateInput(item.template),
          generation_key: item.generationKey,
          status: 'queued',
          attempt_count: 0,
          board_id: '',
          error_code: '',
          error_message: '',
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    await jobRef.set({
      status: 'cancelled',
      cancel_requested: true,
      worker_status: 'setup_failed',
      setup_error: error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
      completed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.runTransaction(async (transaction) => {
      const lockRef = db.collection('board_generation_locks').doc(lockId);
      const lock = await transaction.get(lockRef);
      if (textFromUnknown(lock.data()?.job_id) === jobRef.id) transaction.delete(lockRef);
    });
    throw new HttpsError('internal', 'The university job could not be queued completely. It was cancelled and can be safely started again.');
  }
  return jobRef.id;
}

export const startUniversityBoardGeneration = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 120, memory: '2GiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    await assertPlatformAdmin(request.auth.uid);
    const template = canonicalUniversityBoardTemplate(request.data?.template ?? request.data?.templateId);
    const requestedIds: unknown[] = Array.isArray(request.data?.atlasIds)
      ? request.data.atlasIds
      : Array.isArray(request.data?.cityIds) ? request.data.cityIds : [];
    const atlasIds = Array.from(new Set(requestedIds.map((value) => textFromUnknown(value).slice(0, 160)).filter(Boolean))).slice(0, 500);
    if (!atlasIds.length) throw new HttpsError('invalid-argument', 'Select at least one university.');
    const checks = await universityBoardGenerationChecks(atlasIds, template);
    const preview = {
      dryRun: request.data?.dryRun === true,
      requestedCount: atlasIds.length,
      eligibleCount: checks.targets.length,
      readyCount: checks.ready.length,
      existingCount: checks.existingCount,
      suppressedCount: checks.suppressedCount,
      template: universityBoardTemplateInput(template),
      generationEngine: 'codex_local',
    };
    if (request.data?.dryRun === true || !checks.ready.length) return preview;
    const jobId = await createUniversityBoardJob({
      requestedBy: request.auth.uid,
      catalogMode: false,
      items: checks.ready.map(({ target, generationKey }) => ({ target, generationKey, template })),
    });
    await db.collection('board_generation_audit').add({
      action: 'university_job_started',
      job_id: jobId,
      actor_user_id: request.auth.uid,
      target_kind: 'university',
      generation_engine: 'codex_local',
      university_count: checks.ready.length,
      template_id: template.id,
      created_at: FieldValue.serverTimestamp(),
    });
    return { ...preview, dryRun: false, jobId, cityCount: checks.ready.length };
  },
);

export const reconcileGlobalUniversityBoardCatalog = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 180, memory: '2GiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    await assertPlatformAdmin(request.auth.uid);
    const [atlasSnapshot, boardSnapshot, suppressionSnapshot] = await Promise.all([
      db.collection('atlases').where('is_public', '==', true).get(),
      db.collection('boards').where('origin', '==', 'bulk_generator').get(),
      db.collection('board_generation_suppressions').get(),
    ]);
    const targets = atlasSnapshot.docs.map((document) => universityBoardTargetFromAtlas(
      document.id,
      document.data() as Record<string, unknown>,
    )).filter((target): target is UniversityBoardTarget => !!target);
    const targetIds = new Set(targets.map((target) => target.id));
    const boardDocuments = boardSnapshot.docs
      .map((document) => ({ id: document.id, data: document.data() as Record<string, unknown> }))
      .filter(({ data }) => data.target_kind === 'university'
        || targetIds.has(textFromUnknown(data.atlas_id || data.generated_for_atlas_id)));
    const existingKeys = new Set(boardDocuments.flatMap(({ data }) => {
      const key = textFromUnknown(data.generation_key);
      return key && !data.deleted_at ? [key] : [];
    }));
    const expectedKeys = new Set(targets.flatMap((target) => GLOBAL_UNIVERSITY_BOARD_TEMPLATES.map(
      (template) => universityBoardGenerationKey(target.id, template),
    )));
    const suppressedKeys = new Set(suppressionSnapshot.docs.flatMap((document) => {
      const data = document.data() as Record<string, unknown>;
      const key = textFromUnknown(data.generation_key);
      return key && expectedKeys.has(key) && data.active !== false ? [key] : [];
    }));
    const items = targets.flatMap((target) => GLOBAL_UNIVERSITY_BOARD_TEMPLATES.flatMap((template) => {
      const generationKey = universityBoardGenerationKey(target.id, template);
      return existingKeys.has(generationKey) || suppressedKeys.has(generationKey)
        ? []
        : [{ target, template, generationKey }];
    }));
    const catalog = globalUniversityBoardCatalogStatus(targets, boardDocuments);
    const preview = {
      dryRun: request.data?.dryRun === true,
      ...catalog,
      readyCount: items.length,
      suppressedCount: suppressedKeys.size,
      generationEngine: 'codex_local',
    };
    if (request.data?.dryRun === true || !items.length) return preview;
    const jobId = await createUniversityBoardJob({
      requestedBy: request.auth.uid,
      items,
      catalogMode: true,
    });
    await db.collection('board_generation_audit').add({
      action: 'global_university_catalog_reconciliation_started',
      job_id: jobId,
      actor_user_id: request.auth.uid,
      target_kind: 'university',
      generation_engine: 'codex_local',
      university_count: targets.length,
      bucket_count: GLOBAL_UNIVERSITY_BOARD_TEMPLATES.length,
      queued_count: items.length,
      existing_count: catalog.expectedCount - catalog.missingCount,
      suppressed_count: suppressedKeys.size,
      created_at: FieldValue.serverTimestamp(),
    });
    return { ...preview, dryRun: false, jobId };
  },
);

export const startBulkBoardGeneration = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 120, memory: '1GiB' },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    const requestingUserId = request.auth.uid;
    await assertPlatformAdmin(requestingUserId);

    let template;
    try {
      template = normalizeBulkBoardTemplate(request.data?.template);
    } catch (error) {
      throw new HttpsError('invalid-argument', error instanceof Error ? error.message : String(error));
    }
    const requestedCityIds: unknown[] = Array.isArray(request.data?.cityIds) ? request.data.cityIds : [];
    const cityIds: string[] = Array.from(new Set(
      requestedCityIds
        .map((value: unknown) => textFromUnknown(value).slice(0, 160))
        .filter(Boolean),
    )).slice(0, 300);
    if (!cityIds.length) {
      throw new HttpsError('invalid-argument', 'Select at least one city.');
    }

    const atlasSnapshots = await db.getAll(...cityIds.map((atlasId) => db.collection('atlases').doc(atlasId)));
    const eligible = atlasSnapshots.filter((snapshot) => {
      const atlas = snapshot.data() as Record<string, unknown> | undefined;
      const config = atlas?.city_config && typeof atlas.city_config === 'object'
        ? atlas.city_config as Record<string, unknown>
        : {};
      return snapshot.exists && atlas?.is_public === true && config.enabled === true;
    });
    if (eligible.length !== cityIds.length) {
      throw new HttpsError('failed-precondition', 'One or more selected cities are no longer eligible. Refresh and try again.');
    }

    const checks = eligible.map((atlasSnapshot) => {
      const generationKey = bulkBoardGenerationKey(atlasSnapshot.id, template);
      return {
        atlasSnapshot,
        generationKey,
        boardRef: db.collection('boards').doc(`bulk_${createHash('sha256').update(generationKey).digest('hex').slice(0, 28)}`),
        suppressionRef: db.collection('board_generation_suppressions').doc(bulkBoardSuppressionId(generationKey)),
      };
    });
    const [existingBoards, suppressions] = await Promise.all([
      db.getAll(...checks.map((check) => check.boardRef)),
      db.getAll(...checks.map((check) => check.suppressionRef)),
    ]);
    const existingCount = existingBoards.filter((snapshot) => snapshot.exists && !snapshot.data()?.deleted_at).length;
    const suppressedCount = suppressions.filter((snapshot) => snapshot.exists && snapshot.data()?.active !== false).length;

    if (request.data?.dryRun === true) {
      return {
        dryRun: true,
        requestedCount: cityIds.length,
        eligibleCount: eligible.length,
        readyCount: Math.max(0, eligible.length - existingCount - suppressedCount),
        existingCount,
        suppressedCount,
        template,
      };
    }

    const jobRef = db.collection('board_generation_jobs').doc();
    await db.runTransaction(async (transaction) => {
      const lockRef = db.collection('board_generation_locks').doc('active');
      const lockSnapshot = await transaction.get(lockRef);
      const lockedJobId = textFromUnknown(lockSnapshot.data()?.job_id);
      if (lockedJobId) {
        const lockedJobSnapshot = await transaction.get(db.collection('board_generation_jobs').doc(lockedJobId));
        if (lockedJobSnapshot.data()?.status === 'running') {
          throw new HttpsError('already-exists', 'Another bulk board generation job is already running.');
        }
      }
      transaction.set(jobRef, {
        requested_by_user_id: requestingUserId,
        template,
        rubric_version: BULK_BOARD_RUBRIC_VERSION,
        generator_version: '1.0.0',
        status: 'running',
        cancel_requested: false,
        total_count: eligible.length,
        completed_count: 0,
        success_count: 0,
        failed_count: 0,
        skipped_count: 0,
        cancelled_count: 0,
        city_ids: cityIds,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      transaction.set(lockRef, {
        job_id: jobRef.id,
        acquired_by_user_id: requestingUserId,
        acquired_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      for (const check of checks) {
        const atlas = check.atlasSnapshot.data() as Record<string, unknown>;
        const config = atlas.city_config as Record<string, unknown>;
        const itemId = `${jobRef.id}__${createHash('sha256').update(check.atlasSnapshot.id).digest('hex').slice(0, 20)}`;
        transaction.set(db.collection('board_generation_items').doc(itemId), {
          job_id: jobRef.id,
          atlas_id: check.atlasSnapshot.id,
          city_name: textFromUnknown(config.city_name) || textFromUnknown(atlas.name),
          region_name: textFromUnknown(config.region_name),
          template_id: template.id,
          template_version: template.version,
          generation_key: check.generationKey,
          status: 'queued',
          attempt_count: 0,
          board_id: '',
          error_code: '',
          error_message: '',
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    });
    await db.collection('board_generation_audit').add({
      action: 'job_started',
      job_id: jobRef.id,
      actor_user_id: requestingUserId,
      city_count: eligible.length,
      template_id: template.id,
      template_version: template.version,
      created_at: FieldValue.serverTimestamp(),
    });
    return { jobId: jobRef.id, cityCount: eligible.length, template };
  },
);

export const reconcileGlobalCityBoardCatalog = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 120, memory: '2GiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const requestingUserId = request.auth.uid;
    await assertPlatformAdmin(requestingUserId);

    const [atlasSnapshot, boardSnapshot, suppressionSnapshot] = await Promise.all([
      db.collection('atlases').where('is_public', '==', true).get(),
      db.collection('boards').where('origin', '==', 'bulk_generator').get(),
      db.collection('board_generation_suppressions').get(),
    ]);
    const cities = atlasSnapshot.docs.flatMap((snapshot) => {
      const atlas = snapshot.data() as Record<string, unknown>;
      const config = atlas.city_config && typeof atlas.city_config === 'object'
        ? atlas.city_config as Record<string, unknown>
        : {};
      return config.enabled === true ? [{ snapshot, atlas, config }] : [];
    });
    const existingKeys = new Set(boardSnapshot.docs.flatMap((snapshot) => {
      const board = snapshot.data() as Record<string, unknown>;
      const generationKey = textFromUnknown(board.generation_key);
      return generationKey && !board.deleted_at ? [generationKey] : [];
    }));
    const suppressedKeys = new Set(suppressionSnapshot.docs.flatMap((snapshot) => {
      const suppression = snapshot.data() as Record<string, unknown>;
      const generationKey = textFromUnknown(suppression.generation_key);
      return generationKey && suppression.active !== false ? [generationKey] : [];
    }));
    const items = cities.flatMap(({ snapshot, atlas, config }) => GLOBAL_CITY_BOARD_TEMPLATES.flatMap((rawTemplate) => {
      const template = normalizeBulkBoardTemplate(rawTemplate);
      const generationKey = bulkBoardGenerationKey(snapshot.id, template);
      if (existingKeys.has(generationKey) || suppressedKeys.has(generationKey)) return [];
      return [{
        atlasId: snapshot.id,
        cityName: textFromUnknown(config.city_name) || textFromUnknown(atlas.name),
        regionName: textFromUnknown(config.region_name),
        generationKey,
        template,
      }];
    }));
    const catalog = globalCityBoardCatalogStatus(
      cities.map(({ snapshot }) => snapshot.id),
      boardSnapshot.docs.map((snapshot) => ({
        id: snapshot.id,
        data: snapshot.data() as Record<string, unknown>,
      })),
    );
    const preview = {
      dryRun: request.data?.dryRun === true,
      ...catalog,
      readyCount: items.length,
      suppressedCount: suppressedKeys.size,
    };
    if (request.data?.dryRun === true || items.length === 0) return preview;

    const jobRef = db.collection('board_generation_jobs').doc();
    await db.runTransaction(async (transaction) => {
      const lockRef = db.collection('board_generation_locks').doc('active');
      const lockSnapshot = await transaction.get(lockRef);
      const lockedJobId = textFromUnknown(lockSnapshot.data()?.job_id);
      if (lockedJobId) {
        const lockedJobSnapshot = await transaction.get(db.collection('board_generation_jobs').doc(lockedJobId));
        if (lockedJobSnapshot.data()?.status === 'running') {
          throw new HttpsError('already-exists', 'Another bulk board generation job is already running.');
        }
      }
      transaction.set(jobRef, {
        requested_by_user_id: requestingUserId,
        template: {
          id: 'global-city-board-catalog',
          version: '1.0',
          titlePattern: 'Seven global buckets × all cities',
          searchQuery: 'catalog reconciliation',
          editorialBrief: 'Canonical global city-board catalog reconciliation.',
          count: 10,
          cardTitleMode: 'place',
        },
        catalog_mode: true,
        catalog_bucket_ids: GLOBAL_CITY_BOARD_TEMPLATES.map((template) => template.id),
        rubric_version: BULK_BOARD_RUBRIC_VERSION,
        generator_version: '1.1.0',
        status: 'running',
        cancel_requested: false,
        total_count: items.length,
        completed_count: 0,
        success_count: 0,
        failed_count: 0,
        skipped_count: 0,
        cancelled_count: 0,
        city_ids: cities.map(({ snapshot }) => snapshot.id),
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      transaction.set(lockRef, {
        job_id: jobRef.id,
        acquired_by_user_id: requestingUserId,
        acquired_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    });

    try {
      for (let offset = 0; offset < items.length; offset += 350) {
        const batch = db.batch();
        for (const item of items.slice(offset, offset + 350)) {
          const itemId = `${jobRef.id}__${createHash('sha256').update(item.generationKey).digest('hex').slice(0, 28)}`;
          batch.set(db.collection('board_generation_items').doc(itemId), {
            job_id: jobRef.id,
            atlas_id: item.atlasId,
            city_name: item.cityName,
            region_name: item.regionName,
            template_id: item.template.id,
            template_version: item.template.version,
            template: item.template,
            generation_key: item.generationKey,
            status: 'queued',
            attempt_count: 0,
            board_id: '',
            error_code: '',
            error_message: '',
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    } catch (error) {
      await jobRef.set({
        status: 'cancelled',
        cancel_requested: true,
        setup_error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
        completed_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw new HttpsError('internal', 'The catalog job could not be queued completely. No retry will start automatically.');
    }

    await db.collection('board_generation_audit').add({
      action: 'global_catalog_reconciliation_started',
      job_id: jobRef.id,
      actor_user_id: requestingUserId,
      city_count: cities.length,
      bucket_count: GLOBAL_CITY_BOARD_TEMPLATES.length,
      queued_count: items.length,
      existing_count: catalog.expectedCount - catalog.missingCount,
      suppressed_count: suppressedKeys.size,
      created_at: FieldValue.serverTimestamp(),
    });
    return { ...preview, dryRun: false, jobId: jobRef.id };
  },
);

export const retryBulkBoardGenerationItem = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const requestingUserId = request.auth.uid;
    await assertPlatformAdmin(requestingUserId);
    const itemId = textFromUnknown(request.data?.itemId).slice(0, 220);
    if (!itemId) throw new HttpsError('invalid-argument', 'itemId is required.');
    await db.runTransaction(async (transaction) => {
      const itemRef = db.collection('board_generation_items').doc(itemId);
      const itemSnapshot = await transaction.get(itemRef);
      const item = (itemSnapshot.data() ?? {}) as Record<string, unknown>;
      const itemStatus = textFromUnknown(item.status);
      const itemUpdatedAt = Date.parse(timestampToIso(item.updated_at) ?? '');
      const staleRunning = itemStatus === 'running'
        && Number.isFinite(itemUpdatedAt)
        && itemUpdatedAt <= Date.now() - 12 * 60 * 1000;
      if (!itemSnapshot.exists || (itemStatus !== 'failed' && !staleRunning)) {
        throw new HttpsError('failed-precondition', 'Only failed or stale generation items can be retried.');
      }
      const jobId = textFromUnknown(item.job_id);
      const jobRef = db.collection('board_generation_jobs').doc(jobId);
      const jobSnapshot = await transaction.get(jobRef);
      if (!jobSnapshot.exists) {
        throw new HttpsError('failed-precondition', 'The generation job for this item no longer exists.');
      }
      const job = (jobSnapshot.data() ?? {}) as Record<string, unknown>;
      const lockRef = db.collection('board_generation_locks').doc(textFromUnknown(job.lock_id) || 'active');
      const lockSnapshot = await transaction.get(lockRef);
      const lockedJobId = textFromUnknown(lockSnapshot.data()?.job_id);
      if (lockedJobId && lockedJobId !== jobId) {
        const lockedJobSnapshot = await transaction.get(db.collection('board_generation_jobs').doc(lockedJobId));
        if (lockedJobSnapshot.data()?.status === 'running') {
          throw new HttpsError('already-exists', 'Another bulk board generation job is already running.');
        }
      }
      transaction.update(itemRef, {
        status: 'queued',
        error_code: '',
        error_message: '',
        completed_at: FieldValue.delete(),
        updated_at: FieldValue.serverTimestamp(),
      });
      transaction.update(jobRef, {
        status: 'running',
        cancel_requested: false,
        completed_count: Math.max(0, Number(job.completed_count) - (itemStatus === 'failed' ? 1 : 0)),
        failed_count: Math.max(0, Number(job.failed_count) - (itemStatus === 'failed' ? 1 : 0)),
        completed_at: FieldValue.delete(),
        updated_at: FieldValue.serverTimestamp(),
      });
      transaction.set(lockRef, {
        job_id: jobId,
        acquired_by_user_id: requestingUserId,
        acquired_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true };
  },
);

export const cancelBulkBoardGeneration = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 120, memory: '1GiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    await assertPlatformAdmin(request.auth.uid);
    const jobId = textFromUnknown(request.data?.jobId).slice(0, 160);
    if (!jobId) throw new HttpsError('invalid-argument', 'jobId is required.');
    const jobRef = db.collection('board_generation_jobs').doc(jobId);
    const jobSnapshot = await jobRef.get();
    if (!jobSnapshot.exists) throw new HttpsError('not-found', 'Generation job not found.');
    const job = jobSnapshot.data() as Record<string, unknown>;
    await jobRef.set({
      cancel_requested: true,
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (job.target_kind === 'university' && job.generation_engine === 'codex_local') {
      const itemSnapshot = await db.collection('board_generation_items').where('job_id', '==', jobId).get();
      const queued = itemSnapshot.docs.filter((document) => document.data().status === 'queued');
      for (let offset = 0; offset < queued.length; offset += 400) {
        const batch = db.batch();
        for (const document of queued.slice(offset, offset + 400)) {
          batch.update(document.ref, {
            status: 'cancelled',
            error_code: 'job-cancelled',
            error_message: 'Cancelled before the local Codex worker claimed this item.',
            completed_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }
      const refreshedItems = await db.collection('board_generation_items').where('job_id', '==', jobId).get();
      const statusCounts = refreshedItems.docs.reduce((counts, document) => {
        const status = textFromUnknown(document.data().status);
        if (['needs_review', 'failed', 'skipped_existing', 'suppressed', 'cancelled'].includes(status)) {
          counts.completed += 1;
        }
        if (status === 'needs_review') counts.success += 1;
        if (status === 'failed') counts.failed += 1;
        if (status === 'skipped_existing' || status === 'suppressed') counts.skipped += 1;
        if (status === 'cancelled') counts.cancelled += 1;
        return counts;
      }, { completed: 0, success: 0, failed: 0, skipped: 0, cancelled: 0 });
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(jobRef);
        const currentJob = (current.data() ?? {}) as Record<string, unknown>;
        const completedCount = Math.min(Number(currentJob.total_count) || 0, statusCounts.completed);
        const isComplete = completedCount >= (Number(currentJob.total_count) || 0);
        const lockRef = isComplete
          ? db.collection('board_generation_locks').doc(textFromUnknown(currentJob.lock_id) || 'university_codex_local')
          : null;
        const lock = lockRef ? await transaction.get(lockRef) : null;
        transaction.set(jobRef, {
          completed_count: completedCount,
          success_count: statusCounts.success,
          failed_count: statusCounts.failed,
          skipped_count: statusCounts.skipped,
          cancelled_count: statusCounts.cancelled,
          status: isComplete ? 'cancelled' : 'running',
          worker_status: isComplete ? 'cancelled' : 'cancelling',
          updated_at: FieldValue.serverTimestamp(),
          ...(isComplete ? { completed_at: FieldValue.serverTimestamp() } : {}),
        }, { merge: true });
        if (lockRef && textFromUnknown(lock?.data()?.job_id) === jobId) transaction.delete(lockRef);
      });
    }
    return { ok: true };
  },
);

function cityBoardPublishFailure(board: Record<string, unknown>): string {
  if (board.deleted_at) return 'Restore this board before publishing it.';
  const cards = Array.isArray(board.cards) ? board.cards : [];
  if (!cards.length) return 'This board has no cards to publish.';
  const summary = board.validation_summary && typeof board.validation_summary === 'object'
    ? board.validation_summary as Record<string, unknown>
    : {};
  if (Number(summary.verified_count) !== cards.length) {
    return 'This board has not passed place validation.';
  }
  if (board.target_kind === 'university') {
    if (!Number.isFinite(Number(board.generation_score)) || Number(board.generation_score) < 70) {
      return 'This university board does not meet the 70-point generation-score threshold.';
    }
    if (cards.some((card) => !(card as Record<string, unknown>)?.under21Safe)) {
      return 'This university board has not passed the under-21 safety check.';
    }
    const imageFingerprints = new Set(cards.map((card) => textFromUnknown(
      (card as Record<string, unknown>)?.imageFingerprint,
    )).filter(Boolean));
    const relatedFallbackMode = textFromUnknown(summary.image_validation_mode)
      === 'exact_or_related_university_location_with_limited_reuse_and_provenance';
    const imageDiversityAccepted = imageFingerprints.size === cards.length
      || (relatedFallbackMode && imageFingerprints.size >= 7);
    if (cards.some((card) => {
      const universityCard = card as Record<string, unknown>;
      return !textFromUnknown(universityCard.imageUrl)
        || !textFromUnknown(universityCard.imageSourceUrl)
        || !textFromUnknown(universityCard.imageFingerprint);
    }) || !imageDiversityAccepted) {
      return 'Every university card needs validated related imagery with source provenance and sufficient visual diversity.';
    }
    if (summary.all_have_images !== true || Number(summary.image_count) !== cards.length) {
      return 'This university board has not passed complete image validation.';
    }
  }
  return '';
}

export const publishCityBoards = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 120, memory: '1GiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const requestingUserId = request.auth.uid;
    await assertPlatformAdmin(requestingUserId);
    const requestedBoardIds: unknown[] = Array.isArray(request.data?.boardIds) ? request.data.boardIds : [];
    const boardIds = Array.from(new Set(
      requestedBoardIds
        .map((value) => textFromUnknown(value).slice(0, 160))
        .filter(Boolean),
    ));
    if (!boardIds.length) {
      throw new HttpsError('invalid-argument', 'Select at least one board to publish.');
    }
    if (boardIds.length > 500) {
      throw new HttpsError('invalid-argument', 'Publish up to 500 boards at a time. Narrow the filters and try again.');
    }

    const snapshots = await db.getAll(...boardIds.map((boardId) => db.collection('boards').doc(boardId)));
    const failures: Array<{ boardId: string; title: string; message: string }> = [];
    const skipped: string[] = [];
    const publishable: Array<{
      boardId: string;
      title: string;
      atlasId: string;
      board: Record<string, unknown>;
      ref: DocumentReference;
    }> = [];

    for (let index = 0; index < snapshots.length; index += 1) {
      const snapshot = snapshots[index];
      const boardId = boardIds[index];
      if (!snapshot.exists) {
        failures.push({ boardId, title: boardId, message: 'Board not found.' });
        continue;
      }
      const board = snapshot.data() as Record<string, unknown>;
      const title = textFromUnknown(board.title) || boardId;
      if (board.origin !== 'bulk_generator') {
        failures.push({ boardId, title, message: 'Only factory-generated boards can be published in bulk.' });
        continue;
      }
      const atlasId = textFromUnknown(board.atlas_id || board.generated_for_atlas_id);
      if (!atlasId) {
        failures.push({ boardId, title, message: 'This board is not associated with a city.' });
        continue;
      }
      if (textFromUnknown(board.editorial_status) === 'published' && !board.deleted_at) {
        skipped.push(boardId);
        continue;
      }
      const validationFailure = cityBoardPublishFailure(board);
      if (validationFailure) {
        failures.push({ boardId, title, message: validationFailure });
        continue;
      }
      publishable.push({ boardId, title, atlasId, board, ref: snapshot.ref });
    }

    const publishedIds: string[] = [];
    const operationId = db.collection('board_generation_audit').doc().id;
    const chunkSize = 200;
    for (let offset = 0; offset < publishable.length; offset += chunkSize) {
      const chunk = publishable.slice(offset, offset + chunkSize);
      const batch = db.batch();
      const nowIso = new Date().toISOString();
      for (const candidate of chunk) {
        batch.update(candidate.ref, {
          visibility: 'public',
          editorial_status: 'published',
          city_listing_status: 'listed',
          approved_by_user_id: requestingUserId,
          approved_at: FieldValue.serverTimestamp(),
          updated_at_iso: nowIso,
          server_updated_at: FieldValue.serverTimestamp(),
        });
        batch.set(db.collection('board_generation_audit').doc(), {
          action: 'publish',
          bulk_operation_id: operationId,
          board_id: candidate.boardId,
          atlas_id: candidate.atlasId,
          actor_user_id: requestingUserId,
          previous_state: {
            visibility: textFromUnknown(candidate.board.visibility),
            editorial_status: textFromUnknown(candidate.board.editorial_status),
            city_listing_status: textFromUnknown(candidate.board.city_listing_status),
            source_status: textFromUnknown(candidate.board.source_status),
          },
          created_at: FieldValue.serverTimestamp(),
        });
      }
      try {
        await batch.commit();
        publishedIds.push(...chunk.map((candidate) => candidate.boardId));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The database rejected this publish batch.';
        failures.push(...chunk.map((candidate) => ({
          boardId: candidate.boardId,
          title: candidate.title,
          message,
        })));
      }
    }

    try {
      await db.collection('board_generation_audit').add({
        action: 'publish_all_completed',
        bulk_operation_id: operationId,
        actor_user_id: requestingUserId,
        requested_count: boardIds.length,
        published_count: publishedIds.length,
        skipped_count: skipped.length,
        failed_count: failures.length,
        created_at: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logger.warn('Bulk city-board publish completed, but its summary audit write failed.', {
        operationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      requestedCount: boardIds.length,
      publishedCount: publishedIds.length,
      skippedCount: skipped.length,
      failedCount: failures.length,
      failures: failures.slice(0, 100),
    };
  },
);

export const manageCityBoard = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 60, memory: '1GiB' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const boardId = textFromUnknown(request.data?.boardId).slice(0, 160);
    const action = textFromUnknown(request.data?.action) as BulkBoardAdminAction;
    const reason = textFromUnknown(request.data?.reason).slice(0, 500);
    if (!boardId || !['publish', 'remove_from_city', 'exclude_source', 'approve_source', 'trash', 'restore', 'permanent_delete'].includes(action)) {
      throw new HttpsError('invalid-argument', 'A valid board and action are required.');
    }
    const boardRef = db.collection('boards').doc(boardId);
    const boardSnapshot = await boardRef.get();
    if (!boardSnapshot.exists) throw new HttpsError('not-found', 'Board not found.');
    const board = boardSnapshot.data() as Record<string, unknown>;
    const atlasId = textFromUnknown(board.atlas_id || board.generated_for_atlas_id);
    if (!atlasId) throw new HttpsError('failed-precondition', 'This board is not associated with a city.');
    await assertBulkBoardAtlasAccess(request.auth.uid, atlasId);
    const userSnapshot = await db.collection('users').doc(request.auth.uid).get();
    const isPlatformAdmin = userSnapshot.data()?.role === 'admin';
    const isGeneratedBoard = board.origin === 'bulk_generator';
    if (['publish', 'trash', 'restore'].includes(action) && !isGeneratedBoard && !isPlatformAdmin
      && textFromUnknown(board.owner_user_id) !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'City admins may moderate city association, but cannot delete another user’s board.');
    }
    if (action === 'permanent_delete' && !isPlatformAdmin) {
      throw new HttpsError('permission-denied', 'Only a platform admin can permanently delete a board.');
    }

    const nowIso = new Date().toISOString();
    const common = {
      updated_at_iso: nowIso,
      server_updated_at: FieldValue.serverTimestamp(),
    };
    let updates: Record<string, unknown> = {};
    let restoredGenerationKey = '';
    switch (action) {
      case 'publish': {
        const validationFailure = cityBoardPublishFailure(board);
        if (validationFailure) throw new HttpsError('failed-precondition', validationFailure);
        updates = {
          ...common,
          visibility: 'public',
          editorial_status: 'published',
          city_listing_status: 'listed',
          approved_by_user_id: request.auth.uid,
          approved_at: FieldValue.serverTimestamp(),
        };
        break;
      }
      case 'remove_from_city':
        updates = { ...common, city_listing_status: 'removed', source_status: 'excluded' };
        break;
      case 'exclude_source':
        updates = { ...common, source_status: 'excluded' };
        break;
      case 'approve_source':
        if (board.editorial_status !== 'published') {
          throw new HttpsError('failed-precondition', 'Publish and review the board before approving it as a source.');
        }
        updates = { ...common, source_status: 'approved' };
        break;
      case 'trash': {
        const generationKey = textFromUnknown(board.generation_key);
        updates = {
          ...common,
          visibility: 'private',
          editorial_status: 'archived',
          city_listing_status: 'removed',
          source_status: 'excluded',
          deleted_at: FieldValue.serverTimestamp(),
          deleted_by_user_id: request.auth.uid,
          deletion_reason: reason || 'Moved to trash by an admin.',
          deletion_snapshot: {
            visibility: textFromUnknown(board.visibility) || 'private',
            editorial_status: textFromUnknown(board.editorial_status) || 'needs_review',
            city_listing_status: textFromUnknown(board.city_listing_status) || 'pending',
            source_status: textFromUnknown(board.source_status) || 'excluded',
          },
        };
        if (generationKey) {
          await db.collection('board_generation_suppressions').doc(bulkBoardSuppressionId(generationKey)).set({
            active: true,
            generation_key: generationKey,
            atlas_id: atlasId,
            board_id: boardId,
            reason: reason || 'Board moved to trash.',
            created_by_user_id: request.auth.uid,
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        break;
      }
      case 'restore': {
        if (!board.deleted_at) throw new HttpsError('failed-precondition', 'This board is not in trash.');
        updates = {
          ...common,
          visibility: 'private',
          editorial_status: 'needs_review',
          city_listing_status: 'pending',
          source_status: 'excluded',
          deleted_at: null,
          deleted_by_user_id: '',
          deletion_reason: '',
          deletion_snapshot: FieldValue.delete(),
        };
        const generationKey = textFromUnknown(board.generation_key);
        if (generationKey) {
          restoredGenerationKey = generationKey;
        }
        break;
      }
      case 'permanent_delete': {
        if (!board.deleted_at) throw new HttpsError('failed-precondition', 'Move the board to trash before permanently deleting it.');
        const dependencyCollections = ['board_translations', 'board_quiz_attempts', 'visit_plans'];
        for (const collectionName of dependencyCollections) {
          while (true) {
            const snapshot = await db.collection(collectionName).where('board_id', '==', boardId).limit(400).get();
            if (snapshot.empty) break;
            const batch = db.batch();
            snapshot.docs.forEach((document) => batch.delete(document.ref));
            await batch.commit();
          }
        }
        const deletionBatch = db.batch();
        deletionBatch.set(db.collection('board_generation_audit').doc(), {
          action,
          board_id: boardId,
          atlas_id: atlasId,
          actor_user_id: request.auth.uid,
          reason,
          generation_key: textFromUnknown(board.generation_key),
          created_at: FieldValue.serverTimestamp(),
        });
        deletionBatch.delete(boardRef);
        await deletionBatch.commit();
        return { ok: true, deleted: true };
      }
    }
    const mutationBatch = db.batch();
    mutationBatch.update(boardRef, updates);
    mutationBatch.set(db.collection('board_generation_audit').doc(), {
      action,
      board_id: boardId,
      atlas_id: atlasId,
      actor_user_id: request.auth.uid,
      reason,
      previous_state: {
        visibility: textFromUnknown(board.visibility),
        editorial_status: textFromUnknown(board.editorial_status),
        city_listing_status: textFromUnknown(board.city_listing_status),
        source_status: textFromUnknown(board.source_status),
      },
      created_at: FieldValue.serverTimestamp(),
    });
    await mutationBatch.commit();
    if (restoredGenerationKey) {
      await db.collection('board_generation_suppressions').doc(bulkBoardSuppressionId(restoredGenerationKey)).set({
        active: false,
        restored_by_user_id: request.auth.uid,
        restored_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return { ok: true };
  },
);

const bulkBoardWorkerOptions = {
  region: callableRegion,
  document: 'board_generation_items/{itemId}',
  timeoutSeconds: 540,
  memory: '2GiB' as const,
  concurrency: 1,
  maxInstances: 5,
  secrets: [geminiApiKey, googlePlacesApiKey],
};

export const generateBulkCityBoard = onDocumentCreated(
  bulkBoardWorkerOptions,
  async (event) => {
    if (!event.data) return;
    const item = event.data.data() as Record<string, unknown>;
    if (item.generation_engine === 'codex_local' || item.target_kind === 'university') return;
    await processBulkBoardGenerationItem(event.params.itemId, googlePlacesApiKey.value());
  },
);

export const retryBulkCityBoard = onDocumentUpdated(
  bulkBoardWorkerOptions,
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || after.status !== 'queued' || before?.status === 'queued') return;
    if (after.generation_engine === 'codex_local' || after.target_kind === 'university') return;
    await processBulkBoardGenerationItem(event.params.itemId, googlePlacesApiKey.value());
  },
);

export const retryGlobalCityBoardCatalogFailures = onDocumentUpdated(
  {
    region: callableRegion,
    document: 'board_generation_jobs/{jobId}',
    timeoutSeconds: 120,
    memory: '1GiB',
    concurrency: 1,
    maxInstances: 1,
  },
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!after || after.catalog_mode !== true || before?.status === 'completed' || after.status !== 'completed') return;
    const retryRound = Math.max(0, Math.trunc(Number(after.catalog_retry_round) || 0));
    if (retryRound >= 1 || Number(after.failed_count) <= 0) return;

    const jobId = textFromUnknown(event.params.jobId);
    const itemSnapshot = await db.collection('board_generation_items').where('job_id', '==', jobId).get();
    const retryable = itemSnapshot.docs.filter((document) => {
      const item = document.data() as Record<string, unknown>;
      const message = textFromUnknown(item.error_message).toLowerCase();
      if (item.status !== 'failed' || /credit|quota|billing|resource_exhausted/.test(message)) return false;
      return /subject-first card title|verified places/.test(message);
    }).slice(0, 400);
    if (!retryable.length) return;

    const claimed = await db.runTransaction(async (transaction) => {
      const jobRef = db.collection('board_generation_jobs').doc(jobId);
      const lockRef = db.collection('board_generation_locks').doc('active');
      const [jobSnapshot, lockSnapshot] = await Promise.all([
        transaction.get(jobRef),
        transaction.get(lockRef),
      ]);
      const current = jobSnapshot.data() as Record<string, unknown> | undefined;
      if (!current || current.status !== 'completed'
        || Math.max(0, Math.trunc(Number(current.catalog_retry_round) || 0)) >= 1) return false;
      const lockedJobId = textFromUnknown(lockSnapshot.data()?.job_id);
      if (lockedJobId && lockedJobId !== jobId) {
        const lockedJob = await transaction.get(db.collection('board_generation_jobs').doc(lockedJobId));
        if (lockedJob.data()?.status === 'running') return false;
      }
      transaction.update(jobRef, {
        status: 'running',
        completed_count: Math.max(0, Number(current.completed_count) - retryable.length),
        failed_count: Math.max(0, Number(current.failed_count) - retryable.length),
        catalog_retry_round: retryRound + 1,
        catalog_retry_count: retryable.length,
        completed_at: FieldValue.delete(),
        updated_at: FieldValue.serverTimestamp(),
      });
      transaction.set(lockRef, {
        job_id: jobId,
        acquired_by_user_id: textFromUnknown(current.requested_by_user_id) || 'livingwiki-system',
        acquired_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (!claimed) return;

    try {
      const batch = db.batch();
      for (const document of retryable) {
        batch.update(document.ref, {
          status: 'queued',
          error_code: '',
          error_message: '',
          completed_at: FieldValue.delete(),
          updated_at: FieldValue.serverTimestamp(),
        });
      }
      batch.set(db.collection('board_generation_audit').doc(), {
        action: 'global_catalog_failures_requeued',
        job_id: jobId,
        retry_round: retryRound + 1,
        item_count: retryable.length,
        created_at: FieldValue.serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      await db.collection('board_generation_jobs').doc(jobId).set({
        status: 'completed',
        completed_count: FieldValue.increment(retryable.length),
        failed_count: FieldValue.increment(retryable.length),
        catalog_retry_error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
        completed_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  },
);

export const syncPublicCityBoardListing = onDocumentWritten(
  {
    region: callableRegion,
    document: 'boards/{boardId}',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (event) => {
    const boardId = textFromUnknown(event.params.boardId);
    if (!boardId || !event.data) return;

    const before = event.data.before.exists
      ? event.data.before.data() as Record<string, unknown>
      : null;
    const after = event.data.after.exists
      ? event.data.after.data() as Record<string, unknown>
      : null;
    const beforeAtlasId = cityBoardAtlasId(before);
    const afterAtlasId = cityBoardAtlasId(after);
    const beforeQualifies = isPublicCityBoard(before);
    const afterQualifies = isPublicCityBoard(after);
    const batch = db.batch();
    let hasMutation = false;

    if (beforeQualifies && beforeAtlasId && (!afterQualifies || beforeAtlasId !== afterAtlasId)) {
      batch.delete(db.collection('city_board_listings').doc(cityBoardListingId(beforeAtlasId, boardId)));
      hasMutation = true;
    }
    if (afterQualifies && after && afterAtlasId) {
      batch.set(
        db.collection('city_board_listings').doc(cityBoardListingId(afterAtlasId, boardId)),
        {
          ...cityBoardListingPayload(boardId, after),
          server_updated_at: FieldValue.serverTimestamp(),
        },
      );
      hasMutation = true;
    }
    if (hasMutation) {
      await batch.commit();
    }
  },
);

export const listPublicCityBoards = onCall(
  { region: callableRegion, cors: true, timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    const atlasId = textFromUnknown(request.data?.atlasId).slice(0, 180);
    if (!atlasId) {
      throw new HttpsError('invalid-argument', 'A public atlas ID is required.');
    }

    const atlasSnapshot = await db.collection('atlases').doc(atlasId).get();
    const atlas = atlasSnapshot.data() as Record<string, unknown> | undefined;
    const cityConfig = atlas?.city_config && typeof atlas.city_config === 'object'
      ? atlas.city_config as Record<string, unknown>
      : null;
    const universityConfig = atlas?.university_config && typeof atlas.university_config === 'object'
      ? atlas.university_config as Record<string, unknown>
      : null;
    const supportsBoardCollection = cityConfig?.enabled === true
      || atlas?.wiki_type === 'university'
      || universityConfig?.enabled === true;
    if (!atlasSnapshot.exists || atlas?.is_public !== true || !supportsBoardCollection) {
      throw new HttpsError('not-found', 'The public atlas was not found.');
    }

    // This callable is both a migration bridge for boards published before the
    // projection trigger existed and a safe fallback if a listing is rebuilding.
    // It deliberately returns the same public-only projection, never board cards.
    const snapshot = await db.collection('boards')
      .where('atlas_id', '==', atlasId)
      .where('city_listing_status', '==', 'listed')
      .limit(250)
      .get();
    const boards = snapshot.docs
      .filter((document) => isPublicCityBoard(document.data() as Record<string, unknown>))
      .map((document) => cityBoardListingPayload(
        document.id,
        document.data() as Record<string, unknown>,
      ));
    return { boards };
  },
);

export const ingestUploadedDocument = onObjectFinalized(
  {
    region: storageTriggerRegion,
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [geminiApiKey],
  },
  async (event) => {
    const storagePath = event.data.name;
    if (!storagePath || !storagePath.startsWith('users/')) {
      return;
    }

    const documentId = extractDocumentIdFromPath(storagePath);
    if (!documentId) {
      logger.warn('Ignoring storage object without a Living Wiki document path', { storagePath });
      return;
    }

    try {
      const document = await loadDocumentRecord(documentId);
      if (document.storage_path !== storagePath || document.status === 'indexed') {
        return;
      }

      await processStoredDocument(documentId);
    } catch (error) {
      logger.error('ingestUploadedDocument failed', {
        storagePath,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  },
);

export const ingestSubmittedUrl = onDocumentCreated(
  {
    ...urlIngestionTriggerOptions,
    document: 'documents/{documentId}',
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      return;
    }

    const data = snapshot.data();
    if (!data || data.source_type !== 'url' || data.status !== 'pending') {
      return;
    }

    try {
      await processUrlDocument(snapshot.id);
    } catch (error) {
      logger.error('ingestSubmittedUrl failed', { documentId: snapshot.id, errorMessage: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
);

export const retrySubmittedUrl = onDocumentUpdated(
  {
    ...urlIngestionTriggerOptions,
    document: 'documents/{documentId}',
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || after.source_type !== 'url' || after.status !== 'pending') {
      return;
    }

    if (before.status === 'pending') {
      return;
    }

    try {
      await processUrlDocument(event.params.documentId);
    } catch (error) {
      logger.error('retrySubmittedUrl failed', {
        documentId: event.params.documentId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
);

export const refreshWikiTopicSummary = onDocumentCreated(
  {
    region: callableRegion,
    document: 'wiki_topic_jobs/{jobId}',
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: [geminiApiKey],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      return;
    }

    try {
      await processWikiTopicSummaryJob(snapshot.id);
    } catch (error) {
      logger.error('refreshWikiTopicSummary failed', { jobId: snapshot.id, errorMessage: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
);
