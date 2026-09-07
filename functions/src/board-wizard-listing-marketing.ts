import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import sharp from 'sharp';
import { logger } from 'firebase-functions';
import { db } from './firebase';
import {
  analyzeBoardWizardListingPhotos,
  generateBoardWizardListingStory,
  type BoardWizardListingPhotoAnalysis,
  type BoardWizardListingStoryScene,
  type GeneratedBoardWizardBatch,
  type GeneratedBoardWizardCard,
} from './gemini';
import {
  BOARD_WIZARD_SOURCE_GALLERY_LIMIT,
  boardWizardListingFurnishingsIncluded,
  buildBoardWizardListingBatch,
  normalizeBoardWizardListingIntent,
  type BoardWizardListingExtraction,
  type BoardWizardListingImage,
  type BoardWizardListingIntent,
} from './board-wizard-listing';
import type { BoardNarrationStyleId } from './board-wizard-narration';

export type BoardWizardListingMarketingStyle = 'warm' | 'guided' | 'luxury' | 'brisk' | 'investor';

export type BoardWizardListingMarketingOptions = {
  enabled: boolean;
  personalized: boolean;
  style: BoardWizardListingMarketingStyle;
  direction: string;
  propertyType: string;
  introMessage: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  agency: string;
  showContactOnClosingCard: boolean;
};

export type BoardWizardListingPreview = {
  kind: 'real-estate' | 'rental';
  listingName: string;
  address: string;
  price: string;
  status: string;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  mlsId: string;
  imageCount: number;
  imageUrl: string;
  contactName: string;
  contactRole: string;
  brokerage: string;
  siteName: string;
  confidence: number;
};

const PHOTO_ANALYSIS_VERSION = 'listing-photo-v2-furnishings';
const STORY_VERSION = 'listing-story-v2-staging';
const PHOTO_BATCH_SIZE = 10;
const MAX_ANALYZED_PHOTOS = 48;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DISALLOWED_STORY_SCENES = new Set(['agent', 'logo', 'map', 'duplicate']);
const ALLOWED_PROPERTY_STORY_ROLES = new Set([
  'hook', 'arrival', 'overview', 'exterior', 'aerial', 'entry', 'living', 'kitchen', 'dining',
  'bedroom', 'bathroom', 'office', 'flex', 'laundry', 'garage', 'outdoor', 'balcony', 'view',
  'amenity', 'floor-plan', 'property-view', 'facts', 'fact-and-action', 'action', 'next-step',
]);

type ListingGroupKey =
  | 'overview'
  | 'exterior'
  | 'living'
  | 'kitchen'
  | 'dining'
  | 'bedrooms'
  | 'bathrooms'
  | 'work-utility'
  | 'outdoor'
  | 'amenities'
  | 'floor-plans'
  | 'additional'
  | 'next-step';

type ListingPhotoGroup = {
  key: ListingGroupKey;
  label: string;
  priority: number;
  reviewStatus: 'verified' | 'needs-review';
  analyses: BoardWizardListingPhotoAnalysis[];
};

const LISTING_GROUP_DEFINITIONS: Record<ListingGroupKey, { label: string; priority: number }> = {
  overview: { label: 'Property Overview', priority: 0 },
  exterior: { label: 'Exterior & Arrival', priority: 10 },
  living: { label: 'Living Areas', priority: 20 },
  kitchen: { label: 'Kitchen', priority: 30 },
  dining: { label: 'Dining Areas', priority: 35 },
  bedrooms: { label: 'Bedrooms', priority: 40 },
  bathrooms: { label: 'Bathrooms', priority: 50 },
  'work-utility': { label: 'More Spaces', priority: 60 },
  outdoor: { label: 'Outdoor Spaces & Views', priority: 70 },
  amenities: { label: 'Amenities', priority: 80 },
  'floor-plans': { label: 'Floor Plans', priority: 90 },
  additional: { label: 'Additional Photos', priority: 95 },
  'next-step': { label: 'Next Step', priority: 100 },
};

const LISTING_PRESENTATION_IMAGE_LIMIT = 4;

export function normalizeBoardWizardListingMarketingOptions(value: unknown): BoardWizardListingMarketingOptions {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const style: BoardWizardListingMarketingStyle = record.style === 'guided'
    || record.style === 'luxury'
    || record.style === 'brisk'
    || record.style === 'investor'
    ? record.style
    : 'warm';
  return {
    enabled: record.enabled !== false,
    personalized: record.personalized === true,
    style,
    direction: cleanText(record.direction, 500),
    propertyType: cleanText(record.propertyType, 100),
    introMessage: cleanMultilineText(record.introMessage, 800),
    contactName: cleanText(record.contactName, 140),
    contactEmail: normalizedContactEmail(record.contactEmail),
    contactPhone: normalizedContactPhone(record.contactPhone),
    agency: cleanText(record.agency, 160),
    showContactOnClosingCard: record.showContactOnClosingCard !== false,
  };
}

function normalizedContactEmail(value: unknown): string {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizedContactPhone(value: unknown): string {
  const phone = cleanText(value, 40);
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 && /^[+\d().\-\s]+$/.test(phone) ? phone : '';
}

function cleanMultilineText(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').trim().slice(0, max)
    : '';
}

function personalizedListingExtraction(
  extraction: BoardWizardListingExtraction,
  marketing: BoardWizardListingMarketingOptions,
): BoardWizardListingExtraction {
  const exposePersonalContact = !marketing.personalized || marketing.showContactOnClosingCard;
  return {
    ...extraction,
    realEstate: {
      ...extraction.realEstate,
      propertyType: marketing.personalized ? marketing.propertyType : marketing.propertyType || extraction.realEstate.propertyType,
      agentName: marketing.personalized
        ? (exposePersonalContact ? marketing.contactName : '')
        : marketing.contactName || extraction.realEstate.agentName,
      agentEmail: marketing.personalized
        ? (exposePersonalContact ? marketing.contactEmail : '')
        : extraction.realEstate.agentEmail,
      agentPhone: marketing.personalized
        ? (exposePersonalContact ? marketing.contactPhone : '')
        : extraction.realEstate.agentPhone,
      brokerage: marketing.personalized
        ? (exposePersonalContact ? marketing.agency : '')
        : marketing.agency || extraction.realEstate.brokerage,
    },
  };
}

export function boardWizardListingPreview(
  extraction: BoardWizardListingExtraction,
  listingIntent: BoardWizardListingIntent = 'auto',
): BoardWizardListingPreview {
  const intent = normalizeBoardWizardListingIntent(listingIntent);
  return {
    kind: intent === 'rental' ? 'rental' : 'real-estate',
    listingName: extraction.listingName,
    address: extraction.address,
    price: extraction.price,
    status: extraction.realEstate.listingStatus,
    propertyType: extraction.realEstate.propertyType,
    bedrooms: extraction.realEstate.bedrooms,
    bathrooms: extraction.realEstate.bathrooms,
    mlsId: extraction.realEstate.mlsId,
    imageCount: extraction.images.length,
    imageUrl: extraction.images[0]?.url || '',
    contactName: extraction.realEstate.agentName,
    contactRole: extraction.realEstate.agentRole,
    brokerage: extraction.realEstate.brokerage,
    siteName: extraction.siteName,
    confidence: extraction.confidence,
  };
}

export function isLikelyBoardWizardRealEstateUrl(value: string): boolean {
  if (/(^|\.)(?:zillow|trulia|hotpads|realtor|redfin|apartments|homes|rent|zumper|apartmentlist|exprealty)\./i.test(safeHostname(value))) {
    return true;
  }
  try {
    return /^\/listing-detail\/\d{6,}\/[A-Za-z0-9][A-Za-z0-9-]{5,}\/?$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

/** Pure story-composition seam used by regression tests and the AI fallback. */
export function buildBoardWizardListingMarketingBatchFromAnalyses(options: {
  extraction: BoardWizardListingExtraction;
  targetBoardTitle: string;
  count: number;
  narrationSecondsPerCard: number;
  style: BoardWizardListingMarketingStyle;
  listingIntent?: BoardWizardListingIntent;
  analyses: BoardWizardListingPhotoAnalysis[];
  aiScenes?: BoardWizardListingStoryScene[];
  marketing?: BoardWizardListingMarketingOptions;
}): GeneratedBoardWizardBatch {
  const extraction = options.marketing
    ? personalizedListingExtraction(options.extraction, options.marketing)
    : options.extraction;
  const allAnalyses = mergeWithFallbackAnalyses(extraction, options.analyses);
  const listingIntent = normalizeBoardWizardListingIntent(options.listingIntent);
  const furnishingsIncluded = boardWizardListingFurnishingsIncluded(extraction);
  const aiScenes = validateAiScenes(
    options.aiScenes ?? [],
    allAnalyses,
    extraction,
    listingIntent,
    furnishingsIncluded,
  );
  const scenes = completeStoryScenes({
    extraction,
    analyses: allAnalyses,
    aiScenes,
    count: Math.max(1, Math.min(24, extraction.images.length, Math.round(options.count) || 12)),
    secondsPerCard: options.narrationSecondsPerCard,
    style: options.style,
    listingIntent,
    furnishingsIncluded,
  });
  return buildMarketingBatch({
    extraction,
    targetBoardTitle: options.targetBoardTitle,
    scenes,
    analyses: allAnalyses,
    maxCards: Math.max(1, Math.min(24, Math.round(options.count) || 12)),
    listingIntent,
    marketing: options.marketing,
  });
}

export async function generateBoardWizardListingMarketingBatch(options: {
  extraction: BoardWizardListingExtraction;
  targetBoardTitle: string;
  count: number;
  narrationStyle: BoardNarrationStyleId;
  narrationSecondsPerCard: number;
  marketing: BoardWizardListingMarketingOptions;
  listingIntent?: BoardWizardListingIntent;
}): Promise<GeneratedBoardWizardBatch> {
  const extraction = personalizedListingExtraction(options.extraction, options.marketing);
  const listingIntent = normalizeBoardWizardListingIntent(options.listingIntent);
  const supportsTalkThru = extraction.kind === 'real-estate' || listingIntent === 'rental';
  const furnishingsIncluded = boardWizardListingFurnishingsIncluded(extraction);
  if (!supportsTalkThru || options.marketing.enabled === false || extraction.images.length === 0) {
    return buildBoardWizardListingBatch({
      extraction,
      targetBoardTitle: options.targetBoardTitle,
      count: options.count,
      listingIntent,
    });
  }

  const sceneCount = Math.max(1, Math.min(24, extraction.images.length, Math.round(options.count) || 12));
  const startedAt = Date.now();
  let analyses: BoardWizardListingPhotoAnalysis[] = [];
  let aiScenes: BoardWizardListingStoryScene[] = [];
  try {
    analyses = await analyzeListingGallery(extraction);
    const usable = analyses.filter((analysis) => !DISALLOWED_STORY_SCENES.has(analysis.sceneType));
    if (usable.length) {
      aiScenes = await cachedListingStoryPlan({
        listingName: extraction.listingName,
        address: extraction.address,
        facts: listingFacts(extraction),
        photos: usable,
        sceneCount: Math.min(sceneCount, usable.length),
        narrationStyle: options.narrationStyle,
        narrationSecondsPerCard: options.narrationSecondsPerCard,
        marketingStyle: marketingStyleDescription(options.marketing.style),
        direction: options.marketing.direction,
        listingIntent,
        furnishingsIncluded,
      });
    }
  } catch (error) {
    logger.warn('Listing Marketing Specialist AI pass failed; using the grounded story fallback.', {
      sourceHost: safeHostname(extraction.sourceUrl),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  const allAnalyses = mergeWithFallbackAnalyses(extraction, analyses);
  const validatedAiScenes = validateAiScenes(
    aiScenes,
    allAnalyses,
    extraction,
    listingIntent,
    furnishingsIncluded,
  );
  const scenes = completeStoryScenes({
    extraction,
    analyses: allAnalyses,
    aiScenes: validatedAiScenes,
    count: sceneCount,
    secondsPerCard: options.narrationSecondsPerCard,
    style: options.marketing.style,
    listingIntent,
    furnishingsIncluded,
  });
  if (!scenes.length) {
    return buildBoardWizardListingBatch({
      extraction,
      targetBoardTitle: options.targetBoardTitle,
      count: options.count,
      listingIntent,
    });
  }

  logger.info('Listing Marketing Specialist completed.', {
    sourceHost: safeHostname(extraction.sourceUrl),
    sourceImageCount: extraction.images.length,
    analyzedImageCount: analyses.length,
    aiSceneCount: validatedAiScenes.length,
    finalSceneCount: scenes.length,
    durationMs: Date.now() - startedAt,
    version: STORY_VERSION,
  });
  return buildMarketingBatch({
    extraction,
    targetBoardTitle: options.targetBoardTitle,
    scenes,
    analyses: allAnalyses,
    maxCards: sceneCount,
    listingIntent,
    marketing: options.marketing,
  });
}

async function cachedListingStoryPlan(params: Parameters<typeof generateBoardWizardListingStory>[0]): Promise<BoardWizardListingStoryScene[]> {
  const cacheKey = createHash('sha256').update(JSON.stringify({ version: STORY_VERSION, ...params })).digest('hex');
  const reference = db.collection('listing_story_plans').doc(cacheKey);
  try {
    const snapshot = await reference.get();
    const cachedScenes = normalizeCachedStoryScenes(snapshot.data()?.['scenes']);
    if (cachedScenes.length) return cachedScenes;
  } catch (error) {
    logger.warn('Listing story-plan cache read failed.', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
  const scenes = await generateBoardWizardListingStory(params);
  if (scenes.length) {
    try {
      await reference.set({
        version: STORY_VERSION,
        scenes,
        listing_name: params.listingName,
        address: params.address,
        updated_at: new Date().toISOString(),
      }, { merge: true });
    } catch (error) {
      logger.warn('Listing story-plan cache write failed.', {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return scenes;
}

function normalizeCachedStoryScenes(value: unknown): BoardWizardListingStoryScene[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): BoardWizardListingStoryScene[] => {
    const scene = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const photoIndex = Number(scene.photoIndex);
    const title = cleanText(scene.title, 80);
    const narration = cleanText(scene.narration, 3600);
    if (!Number.isInteger(photoIndex) || photoIndex < 0 || !title || !narration) return [];
    return [{
      photoIndex,
      role: cleanText(scene.role, 40),
      title,
      subtitle: cleanText(scene.subtitle, 120),
      narration,
      durationSeconds: Math.max(5, Math.min(180, Math.round(Number(scene.durationSeconds) || 30))),
      factKeys: Array.isArray(scene.factKeys)
        ? scene.factKeys.map((key) => cleanText(key, 60)).filter(Boolean).slice(0, 12)
        : [],
    }];
  });
}

async function analyzeListingGallery(extraction: BoardWizardListingExtraction): Promise<BoardWizardListingPhotoAnalysis[]> {
  const images = extraction.images.slice(0, MAX_ANALYZED_PHOTOS);
  const cached = new Map<number, BoardWizardListingPhotoAnalysis>();
  const missing: Array<{ image: BoardWizardListingImage; index: number; key: string }> = [];
  const refs = images.map((image, index) => {
    const key = analysisCacheKey(image.url);
    return { index, image, key, ref: db.collection('listing_photo_analysis').doc(key) };
  });
  if (refs.length) {
    try {
      const snapshots = await db.getAll(...refs.map((item) => item.ref));
      snapshots.forEach((snapshot, position) => {
        const value = normalizeCachedAnalysis(snapshot.data(), refs[position].index);
        if (value) cached.set(refs[position].index, value);
      });
    } catch (error) {
      logger.warn('Listing photo-analysis cache read failed.', {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (const item of refs) {
    if (!cached.has(item.index)) missing.push(item);
  }

  const prepared: Array<{
    index: number;
    key: string;
    sourceLabel: string;
    mimeType: 'image/jpeg';
    base64: string;
    contentHash: string;
  }> = [];
  for (let start = 0; start < missing.length; start += 4) {
    const group = missing.slice(start, start + 4);
    const results = await Promise.all(group.map(async (item) => {
      try {
        const bytes = await downloadAndResizeListingImage(item.image.url);
        return {
          index: item.index,
          key: item.key,
          sourceLabel: item.image.alt,
          mimeType: 'image/jpeg' as const,
          base64: bytes.toString('base64'),
          contentHash: createHash('sha256').update(bytes).digest('hex'),
        };
      } catch (error) {
        logger.warn('Listing photo could not be prepared for visual analysis.', {
          imageHost: safeHostname(item.image.url),
          imageIndex: item.index,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }));
    prepared.push(...results.filter((item): item is NonNullable<typeof item> => !!item));
  }

  const duplicateOf = new Map<number, number>();
  const firstByHash = new Map<string, number>();
  const uniquePrepared = prepared.filter((item) => {
    const firstIndex = firstByHash.get(item.contentHash);
    if (firstIndex !== undefined) {
      duplicateOf.set(item.index, firstIndex);
      return false;
    }
    firstByHash.set(item.contentHash, item.index);
    return true;
  });
  for (let start = 0; start < uniquePrepared.length; start += PHOTO_BATCH_SIZE) {
    const batch = uniquePrepared.slice(start, start + PHOTO_BATCH_SIZE);
    const generated = await analyzeBoardWizardListingPhotos({
      listingName: extraction.listingName,
      address: extraction.address,
      photos: batch,
    });
    for (const analysis of generated) cached.set(analysis.index, analysis);
  }
  for (const [index] of duplicateOf) {
    cached.set(index, fallbackAnalysis(extraction.images[index], index, 'duplicate'));
  }

  const writes = refs.flatMap((item) => {
    const analysis = cached.get(item.index);
    if (!analysis || !missing.some((entry) => entry.index === item.index)) return [];
    return [item.ref.set({
      ...analysis,
      source_url: item.image.url,
      version: PHOTO_ANALYSIS_VERSION,
      updated_at: new Date().toISOString(),
    }, { merge: true })];
  });
  if (writes.length) {
    await Promise.allSettled(writes);
  }
  return Array.from(cached.values()).sort((left, right) => left.index - right.index);
}

function completeStoryScenes(options: {
  extraction: BoardWizardListingExtraction;
  analyses: BoardWizardListingPhotoAnalysis[];
  aiScenes: BoardWizardListingStoryScene[];
  count: number;
  secondsPerCard: number;
  style: BoardWizardListingMarketingStyle;
  listingIntent: BoardWizardListingIntent;
  furnishingsIncluded: boolean;
}): BoardWizardListingStoryScene[] {
  const usable = options.analyses.filter((analysis) => !DISALLOWED_STORY_SCENES.has(analysis.sceneType));
  const used = new Set(options.aiScenes.map((scene) => scene.photoIndex));
  const scenes = [...options.aiScenes];
  for (const analysis of orderedAnalyses(usable)) {
    if (scenes.length >= options.count || used.has(analysis.index)) continue;
    scenes.push(fallbackScene(
      options.extraction,
      analysis,
      scenes.length,
      options.secondsPerCard,
      options.style,
      options.listingIntent,
      options.furnishingsIncluded,
    ));
    used.add(analysis.index);
  }
  const limited = scenes.slice(0, options.count);
  if (!limited.length) return limited;
  const last = limited[limited.length - 1];
  const close = listingClose(options.extraction, options.listingIntent, options.furnishingsIncluded);
  const rental = options.listingIntent === 'rental';
  const shortTermRental = rental && options.extraction.kind === 'vacation-rental';
  limited[limited.length - 1] = {
    ...last,
    role: 'next-step',
    title: rental
      ? shortTermRental ? 'Check availability & book' : 'Check availability & apply'
      : options.extraction.price ? `The next step · ${options.extraction.price}` : 'See the full listing',
    subtitle: closingSubtitle(options.extraction, options.listingIntent),
    narration: appendSentence(last.narration, close, 3600),
    factKeys: Array.from(new Set([...last.factKeys, 'price', 'status', 'contact', 'brokerage'].filter((key) => !!listingFacts(options.extraction)[key]))),
  };
  return limited;
}

function validateAiScenes(
  scenes: BoardWizardListingStoryScene[],
  analyses: BoardWizardListingPhotoAnalysis[],
  extraction: BoardWizardListingExtraction,
  listingIntent: BoardWizardListingIntent,
  furnishingsIncluded: boolean,
): BoardWizardListingStoryScene[] {
  const analysisByIndex = new Map(analyses.map((analysis) => [analysis.index, analysis]));
  const factValues = Object.values(listingFacts(extraction)).join(' ');
  const seen = new Set<number>();
  return scenes.filter((scene) => {
    const analysis = analysisByIndex.get(scene.photoIndex);
    if (!analysis || seen.has(scene.photoIndex) || DISALLOWED_STORY_SCENES.has(analysis.sceneType)) return false;
    if (!ALLOWED_PROPERTY_STORY_ROLES.has(normalizedRole(scene.role))) return false;
    if (containsUnsafeListingLanguage(scene.narration)) return false;
    if (
      listingIntent !== 'rental'
      && !furnishingsIncluded
      && containsUnqualifiedSaleFurnishingClaim([scene.title, scene.subtitle, scene.narration].join('. '))
    ) return false;
    const narrationNumbers = scene.narration.match(/\b\d[\d,.]*\b/g) ?? [];
    if (narrationNumbers.some((number) => !factValues.includes(number))) return false;
    seen.add(scene.photoIndex);
    return true;
  });
}

function buildMarketingBatch(options: {
  extraction: BoardWizardListingExtraction;
  targetBoardTitle: string;
  scenes: BoardWizardListingStoryScene[];
  analyses: BoardWizardListingPhotoAnalysis[];
  maxCards: number;
  listingIntent: BoardWizardListingIntent;
  marketing?: BoardWizardListingMarketingOptions;
}): GeneratedBoardWizardBatch {
  const extractedAt = new Date().toISOString();
  const gallery = options.extraction.images.map((image) => image.url).slice(0, BOARD_WIZARD_SOURCE_GALLERY_LIMIT);
  const groups = listingPhotoGroups(options.analyses)
    .filter((group) => group.analyses.some((analysis) => !!options.extraction.images[analysis.index]))
    .sort((left, right) => left.priority - right.priority);
  const sceneByPhotoIndex = new Map(options.scenes.map((scene) => [scene.photoIndex, scene]));
  const knownAnalyses = groups.flatMap((group) => group.reviewStatus === 'verified' ? group.analyses : []);
  const heroAnalyses = [...knownAnalyses].sort((left, right) =>
    right.heroScore - left.heroScore || right.qualityScore - left.qualityScore || left.index - right.index);
  const fallbackAnalyses = [...options.analyses]
    .filter((analysis) => !DISALLOWED_STORY_SCENES.has(analysis.sceneType))
    .sort((left, right) => right.qualityScore - left.qualityScore || left.index - right.index);
  const overviewAnalyses = uniqueAnalyses([...heroAnalyses, ...fallbackAnalyses]).slice(0, 3);
  const overviewUrls = listingAnalysisUrls(options.extraction, overviewAnalyses);
  const overviewScene = overviewAnalyses.map((analysis) => sceneByPhotoIndex.get(analysis.index)).find(Boolean)
    ?? options.scenes[0];
  const maxCards = Math.max(1, options.maxCards);
  const reserveNextStep = maxCards > 1 || (options.marketing?.personalized === true && options.listingIntent !== 'rental');
  // Once grouping is enabled, every confidently identified space remains
  // represented. The requested scene count controls narrative depth, not
  // whether a bedroom or bathroom silently disappears from the board.
  const selectedGroups = maxCards > 1 ? groups : [];
  const rentalTag = options.listingIntent === 'rental' ? 'rental' : 'real-estate';
  const shared = {
    scope: 'place' as const,
    place_query: options.extraction.address || options.extraction.listingName,
    entity_name: options.extraction.listingName,
    entity_type: 'place' as const,
    image_intent: 'place' as const,
    sourceUrl: options.extraction.sourceUrl,
    extractionConfidence: options.extraction.confidence,
    extractedAt,
  };
  const overview: GeneratedBoardWizardCard = {
    ...shared,
    title: options.extraction.listingName.slice(0, 80),
    subtitle: (overviewScene?.subtitle || listingOverviewSubtitleForStory(options.extraction)).slice(0, 120),
    notes: (overviewScene?.narration || options.extraction.description || `Explore ${options.extraction.listingName} through its verified listing gallery.`).slice(0, 3600),
    type: 'place',
    status: 'saved',
    rating: 5,
    tags: ['listing', rentalTag, 'listing-story', 'listing-group', 'group-overview', 'source-image'],
    image_query: `${options.extraction.listingName} property overview`.slice(0, 120),
    image_context: options.extraction.address || options.extraction.listingName,
    short_summary: (overviewScene?.subtitle || listingOverviewSubtitleForStory(options.extraction)).slice(0, 160),
    rank: 1,
    imageUrl: overviewUrls[0] || gallery[0],
    // Preserve the complete exact gallery on the opening card for board browsing
    // and existing exports. Live View uses the explicit presentation subset.
    imageUrls: gallery,
    imageSource: gallery.length ? 'source-page' : 'missing',
    locationLat: options.extraction.latitude,
    locationLng: options.extraction.longitude,
    listingPresentation: {
      ...listingPresentation('overview', overviewUrls, overviewAnalyses, 'verified'),
      sourcePhotoCount: gallery.length,
    },
  };
  const groupCards = selectedGroups.map((group, index): GeneratedBoardWizardCard => {
    const ordered = [...group.analyses].sort((left, right) =>
      right.qualityScore - left.qualityScore || right.heroScore - left.heroScore || left.index - right.index);
    const urls = listingAnalysisUrls(options.extraction, ordered);
    const representative = ordered.map((analysis) => sceneByPhotoIndex.get(analysis.index)).find(Boolean);
    const subtitle = listingGroupSubtitle(group, ordered);
    const notes = group.reviewStatus === 'needs-review'
      ? 'These verified source photographs could not be classified confidently. Review them before assigning a specific room label.'
      : representative?.narration || `Continue the property tour through ${group.label.toLowerCase()}, using only details visible in the source photographs.`;
    return {
      ...shared,
      title: group.label,
      subtitle,
      notes: notes.slice(0, 3600),
      type: 'note',
      status: 'saved',
      rating: 4,
      tags: ['listing', rentalTag, 'listing-story', 'listing-group', `group-${group.key}`, 'source-image'],
      image_query: `${options.extraction.listingName} ${group.label}`.slice(0, 120),
      image_context: group.reviewStatus === 'needs-review' ? 'Unclassified source listing photographs' : group.label,
      short_summary: subtitle.slice(0, 160),
      rank: index + 2,
      imageUrl: urls[0],
      imageUrls: urls,
      imageSource: urls.length ? 'source-page' : 'missing',
      listingPresentation: listingPresentation(group.key, urls, ordered, group.reviewStatus),
    };
  });
  const cards: GeneratedBoardWizardCard[] = [];
  if (options.marketing?.personalized && options.listingIntent !== 'rental') {
    const introMessage = options.marketing?.introMessage.trim() || '';
    const contactName = options.marketing?.contactName.trim() || options.extraction.realEstate.agentName;
    const introImage = overviewUrls[0] || gallery[0];
    cards.push({
      ...shared,
      title: introMessage ? `Welcome from ${contactName || 'your agent'}`.slice(0, 80) : 'Intro card',
      subtitle: introMessage
        ? `A personal introduction to ${options.extraction.listingName}`.slice(0, 120)
        : 'Only you can see this reminder until you add your introduction.',
      notes: introMessage || 'Add a short welcome message about the property and invite buyers to look around.',
      type: 'note',
      status: 'saved',
      rating: 5,
      authorOnly: !introMessage,
      tags: introMessage
        ? ['listing', 'real-estate', 'listing-story', 'story-intro', 'agent-intro']
        : ['listing', 'real-estate', 'listing-story', 'story-intro', 'intro-placeholder', 'author-only'],
      image_query: `${options.extraction.listingName} welcome`.slice(0, 120),
      image_context: options.extraction.address || options.extraction.listingName,
      short_summary: introMessage
        ? introMessage.slice(0, 160)
        : 'Add your personal property introduction.',
      rank: 1,
      imageUrl: introImage,
      imageUrls: introImage ? [introImage] : [],
      imageSource: introImage ? 'source-page' : 'missing',
    });
  }
  cards.push(overview, ...groupCards);
  if (options.marketing?.personalized && options.listingIntent !== 'rental') {
    const setupImage = overviewUrls[0] || gallery[0];
    cards.push({
      ...shared,
      title: 'Your Talking Card',
      subtitle: 'Let buyers ask you questions about this property.',
      notes: 'Set up your agent Talking Card when you are ready. This card is visible only to you until setup is complete.',
      type: 'note',
      status: 'saved',
      rating: 5,
      authorOnly: true,
      tags: ['listing', 'real-estate', 'listing-story', 'listing-talking-card-placeholder', 'author-only'],
      image_query: `${options.extraction.listingName} agent conversation`.slice(0, 120),
      image_context: options.extraction.address || options.extraction.listingName,
      short_summary: 'Make yourself available to buyers.',
      rank: cards.length + 1,
      imageUrl: setupImage,
      imageUrls: setupImage ? [setupImage] : [],
      imageSource: setupImage ? 'source-page' : 'missing',
    });
  }
  if (reserveNextStep) {
    const finalScene = options.scenes.at(-1);
    const nextStepImage = overviewUrls[0] || gallery[0];
    const showContact = options.marketing?.personalized === true
      && options.listingIntent !== 'rental'
      && options.marketing?.showContactOnClosingCard !== false;
    const contactName = showContact
      ? options.marketing?.contactName.trim() || options.extraction.realEstate.agentName
      : '';
    const contactEmail = showContact ? options.marketing?.contactEmail.trim() || '' : '';
    const contactPhone = showContact ? options.marketing?.contactPhone.trim() || '' : '';
    const agency = showContact ? options.marketing?.agency.trim() || '' : options.extraction.realEstate.brokerage;
    const isListingContact = showContact && !!(contactPhone || contactEmail);
    const contactLines = [
      contactName,
      agency && agency !== contactName ? agency : '',
      contactPhone ? `Phone: ${contactPhone}` : '',
      contactEmail ? `Email: ${contactEmail}` : '',
    ].filter(Boolean);
    const nextStepTitle = options.listingIntent === 'rental'
      ? options.extraction.kind === 'vacation-rental' ? 'Check availability & book' : 'Check availability & apply'
      : isListingContact ? `Contact ${contactName || 'the listing agent'}`
      : options.extraction.price ? `The next step · ${options.extraction.price}` : 'See the full listing';
    const contactInvitation = `Interested in this home? ${contactName ? `Contact ${contactName}` : 'Get in touch with the listing agent'} to ask a question or arrange a private showing.`;
    const closingSubtitleText = isListingContact
      ? `Questions about this home? Get in touch with ${contactName || 'the listing agent'}.`
      : closingSubtitle(options.extraction, options.listingIntent);
    const closingNotes = isListingContact
      ? [contactInvitation, ...contactLines].filter(Boolean).join('\n')
      : [finalScene?.narration || listingClose(options.extraction, options.listingIntent, boardWizardListingFurnishingsIncluded(options.extraction))].filter(Boolean).join('\n');
    cards.push({
      ...shared,
      title: nextStepTitle.slice(0, 80),
      subtitle: closingSubtitleText.slice(0, 120),
      notes: closingNotes.slice(0, 3600),
      type: 'note',
      status: 'planned',
      rating: 4,
      tags: ['listing', rentalTag, 'listing-story', 'listing-group', 'group-next-step', 'action', ...(isListingContact ? ['listing-contact'] : [])],
      image_query: `${options.extraction.listingName} next step`.slice(0, 120),
      image_context: options.extraction.address || options.extraction.listingName,
      short_summary: closingSubtitleText.slice(0, 160),
      rank: cards.length + 1,
      imageUrl: nextStepImage,
      imageUrls: nextStepImage ? [nextStepImage] : [],
      imageSource: nextStepImage ? 'source-page' : 'missing',
      listingPresentation: listingPresentation('next-step', nextStepImage ? [nextStepImage] : [], [], 'verified'),
    });
  }
  return {
    board: {
      title: (options.targetBoardTitle || options.extraction.listingName).slice(0, 90),
      description: storyBoardDescription(options.extraction, options.listingIntent).slice(0, 240),
      icon: options.listingIntent === 'rental' ? 'key' : 'apartment',
      tone: options.listingIntent === 'rental' ? 'sky' : 'teal',
    },
    cards: cards.map((card, index) => ({ ...card, rank: index + 1 })),
  };
}

function listingPhotoGroups(analyses: BoardWizardListingPhotoAnalysis[]): ListingPhotoGroup[] {
  const groups = new Map<ListingGroupKey, ListingPhotoGroup>();
  for (const analysis of analyses) {
    if (DISALLOWED_STORY_SCENES.has(analysis.sceneType)) continue;
    const key = listingGroupKey(analysis);
    const definition = LISTING_GROUP_DEFINITIONS[key];
    const group = groups.get(key) ?? {
      key,
      label: definition.label,
      priority: definition.priority,
      reviewStatus: key === 'additional' ? 'needs-review' : 'verified',
      analyses: [],
    };
    group.analyses.push(analysis);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function listingGroupKey(analysis: BoardWizardListingPhotoAnalysis): ListingGroupKey {
  if (analysis.confidence < 0.65 || analysis.sceneType === 'unknown') return 'additional';
  switch (analysis.sceneType) {
    case 'exterior':
    case 'aerial':
    case 'entry': return 'exterior';
    case 'living': return 'living';
    case 'kitchen': return 'kitchen';
    case 'dining': return 'dining';
    case 'bedroom': return 'bedrooms';
    case 'bathroom': return 'bathrooms';
    case 'office':
    case 'flex':
    case 'laundry':
    case 'garage': return 'work-utility';
    case 'outdoor':
    case 'balcony':
    case 'view': return 'outdoor';
    case 'amenity': return 'amenities';
    case 'floor-plan': return 'floor-plans';
    default: return 'additional';
  }
}

function listingAnalysisUrls(
  extraction: BoardWizardListingExtraction,
  analyses: BoardWizardListingPhotoAnalysis[],
): string[] {
  return Array.from(new Set(analyses
    .map((analysis) => extraction.images[analysis.index]?.url || '')
    .filter(Boolean)));
}

function uniqueAnalyses(analyses: BoardWizardListingPhotoAnalysis[]): BoardWizardListingPhotoAnalysis[] {
  const seen = new Set<number>();
  return analyses.filter((analysis) => {
    if (seen.has(analysis.index)) return false;
    seen.add(analysis.index);
    return true;
  });
}

function listingPresentation(
  key: ListingGroupKey,
  imageUrls: string[],
  analyses: BoardWizardListingPhotoAnalysis[],
  reviewStatus: 'verified' | 'needs-review',
): NonNullable<GeneratedBoardWizardCard['listingPresentation']> {
  const definition = LISTING_GROUP_DEFINITIONS[key];
  const confidence = analyses.length
    ? analyses.reduce((sum, analysis) => sum + analysis.confidence, 0) / analyses.length
    : 1;
  return {
    kind: 'listing-group',
    groupKey: key,
    label: definition.label,
    confidence: Math.max(0, Math.min(1, confidence)),
    reviewStatus,
    sourcePhotoCount: imageUrls.length,
    presentationImageUrls: imageUrls.slice(0, key === 'overview' ? 3 : LISTING_PRESENTATION_IMAGE_LIMIT),
  };
}

function listingGroupSubtitle(group: ListingPhotoGroup, analyses: BoardWizardListingPhotoAnalysis[]): string {
  const features = Array.from(new Set(analyses.flatMap(listingFixedFeatures))).slice(0, 3);
  if (group.reviewStatus === 'needs-review') {
    return `${analyses.length} source ${analyses.length === 1 ? 'photo' : 'photos'} · Needs review`;
  }
  return [
    `${analyses.length} ${analyses.length === 1 ? 'photo' : 'photos'}`,
    features.join(' · '),
  ].filter(Boolean).join(' · ').slice(0, 120);
}

function listingOverviewSubtitleForStory(extraction: BoardWizardListingExtraction): string {
  return [
    extraction.price,
    extraction.realEstate.bedrooms ? `${extraction.realEstate.bedrooms} beds` : '',
    extraction.realEstate.bathrooms ? `${extraction.realEstate.bathrooms} baths` : '',
  ].filter(Boolean).join(' · ') || extraction.address || 'Property overview';
}

function orderedAnalyses(analyses: BoardWizardListingPhotoAnalysis[]): BoardWizardListingPhotoAnalysis[] {
  const priority: Record<string, number> = {
    exterior: 10, aerial: 15, entry: 20, living: 30, kitchen: 40, dining: 45,
    bedroom: 55, bathroom: 65, office: 70, flex: 72, laundry: 75, garage: 78,
    outdoor: 82, balcony: 84, view: 86, amenity: 88, 'floor-plan': 95, unknown: 90,
  };
  const candidates = [...analyses].sort((left, right) => {
    const leftPriority = priority[left.sceneType] ?? 90;
    const rightPriority = priority[right.sceneType] ?? 90;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return right.qualityScore - left.qualityScore || left.index - right.index;
  });
  const hero = [...candidates]
    .filter((item) => ['exterior', 'living', 'kitchen', 'view', 'outdoor'].includes(item.sceneType))
    .sort((left, right) => right.heroScore - left.heroScore || right.qualityScore - left.qualityScore)[0];
  return hero ? [hero, ...candidates.filter((item) => item.index !== hero.index)] : candidates;
}

function fallbackScene(
  extraction: BoardWizardListingExtraction,
  analysis: BoardWizardListingPhotoAnalysis,
  position: number,
  secondsPerCard: number,
  style: BoardWizardListingMarketingStyle,
  listingIntent: BoardWizardListingIntent,
  furnishingsIncluded: boolean,
): BoardWizardListingStoryScene {
  const role = position === 0 ? 'hook' : analysis.sceneType;
  const room = analysis.confidence >= 0.65 ? analysis.roomType : neutralRoomLabel(analysis.sceneType);
  const fixedFeatures = listingFixedFeatures(analysis);
  const movableFurnishings = listingMovableFurnishings(analysis);
  const visibleFeatures = listingIntent === 'rental' || furnishingsIncluded
    ? [...fixedFeatures, ...movableFurnishings]
    : fixedFeatures;
  const featureText = visibleFeatures.slice(0, 2).join(' and ');
  const transition = position === 0
    ? `${styleLead(style)} ${room} opens the visual story of ${extraction.listingName}.`
    : `From here, the tour moves into ${room.toLowerCase()}.`;
  const visible = featureText ? `The photograph highlights ${featureText}, keeping the focus on details visible in the listing itself.` : '';
  const staging = listingIntent !== 'rental' && !furnishingsIncluded && movableFurnishings.length
    ? `Shown staged with ${humanList(movableFurnishings.slice(0, 3))}, the room demonstrates one possible arrangement; these furnishings may not be included with the property.`
    : '';
  const furnished = listingIntent !== 'rental' && furnishingsIncluded && movableFurnishings.length
    ? `The listing states that the property is offered furnished; confirm the exact included inventory on the original listing.`
    : '';
  return {
    photoIndex: analysis.index,
    role,
    title: position === 0 ? `Begin at ${shortAddress(extraction)}` : room,
    subtitle: visibleFeatures.slice(0, 3).join(' · ') || `Source listing photo ${analysis.index + 1}`,
    narration: fitFallbackNarration([transition, staging, visible, furnished].filter(Boolean).join(' '), secondsPerCard),
    durationSeconds: secondsPerCard,
    factKeys: [],
  };
}

function mergeWithFallbackAnalyses(
  extraction: BoardWizardListingExtraction,
  analyses: BoardWizardListingPhotoAnalysis[],
): BoardWizardListingPhotoAnalysis[] {
  const byIndex = new Map(analyses.map((analysis) => [analysis.index, analysis]));
  return extraction.images.map((image, index) => byIndex.get(index) ?? fallbackAnalysis(image, index));
}

function fallbackAnalysis(
  image: BoardWizardListingImage,
  index: number,
  forcedScene?: string,
): BoardWizardListingPhotoAnalysis {
  let imagePath = '';
  try { imagePath = new URL(image.url).pathname; } catch { imagePath = image.url; }
  const text = `${image.alt} ${imagePath}`.toLowerCase();
  const patterns: Array<[RegExp, string, string]> = [
    [/front|facade|exterior|building/, 'exterior', 'Exterior'],
    [/aerial|drone/, 'aerial', 'Aerial view'],
    [/living|great room|family room/, 'living', 'Living area'],
    [/kitchen/, 'kitchen', 'Kitchen'],
    [/dining/, 'dining', 'Dining area'],
    [/bed|primary|master/, 'bedroom', 'Bedroom'],
    [/bath|shower|vanity/, 'bathroom', 'Bathroom'],
    [/deck|balcony|terrace/, 'balcony', 'Outdoor living'],
    [/patio|yard|pool|outdoor/, 'outdoor', 'Outdoor space'],
    [/garage|parking/, 'garage', 'Garage and parking'],
    [/floor.?plan/, 'floor-plan', 'Floor plan'],
    [/agent|profile|portrait|realtor/, 'agent', 'Agent'],
    [/logo|brand/, 'logo', 'Logo'],
    [/map/, 'map', 'Map'],
  ];
  const match = patterns.find(([pattern]) => pattern.test(text));
  const sceneType = forcedScene || match?.[1] || 'unknown';
  return {
    index,
    sceneType,
    roomType: match?.[2] || 'Property view',
    features: [],
    movableFurnishings: [],
    qualityScore: Math.max(0.35, 0.72 - index * 0.002),
    heroScore: sceneType === 'exterior' ? 0.82 : index === 0 ? 0.68 : 0.4,
    confidence: match ? 0.72 : 0.3,
  };
}

function listingFacts(extraction: BoardWizardListingExtraction): Record<string, string> {
  const details = extraction.realEstate;
  const facts: Record<string, string> = {
    address: extraction.address,
    price: extraction.price,
    status: details.listingStatus,
    property_type: details.propertyType,
    bedrooms: details.bedrooms,
    bathrooms: details.bathrooms,
    full_bathrooms: details.fullBathrooms,
    half_bathrooms: details.halfBathrooms,
    year_built: details.yearBuilt,
    hoa_fee: details.hoaFee,
    taxes: details.taxes,
    mls_id: details.mlsId,
    contact: details.agentName ? `${details.agentRole || 'Site contact'}: ${details.agentName}` : '',
    brokerage: details.brokerage,
    data_source: details.dataSource,
    source_description: extraction.description,
  };
  details.features.slice(0, 16).forEach((feature, index) => {
    facts[`feature_${index + 1}`] = feature;
  });
  extraction.amenities.slice(0, 12).forEach((amenity, index) => {
    facts[`amenity_${index + 1}`] = amenity;
  });
  extraction.facts.slice(0, 16).forEach((fact, index) => {
    facts[`listing_fact_${index + 1}`] = fact;
  });
  return Object.fromEntries(Object.entries(facts).filter(([, value]) => !!value));
}

function storyBoardDescription(extraction: BoardWizardListingExtraction, listingIntent: BoardWizardListingIntent): string {
  const details = [
    extraction.price,
    extraction.realEstate.bedrooms ? `${extraction.realEstate.bedrooms} bedrooms` : '',
    extraction.realEstate.bathrooms ? `${extraction.realEstate.bathrooms} bathrooms` : '',
    extraction.realEstate.propertyType,
  ].filter(Boolean).join(' · ');
  return `A connected ${listingIntent === 'rental' ? 'rental TalkThru' : 'Real Estate VirtualTalkThru'} of ${extraction.listingName}${details ? ` — ${details}` : ''}, arranged from arrival through the living spaces to the next step.`;
}

function listingClose(
  extraction: BoardWizardListingExtraction,
  listingIntent: BoardWizardListingIntent,
  furnishingsIncluded: boolean,
): string {
  const contact = extraction.realEstate.agentName
    ? `The source page identifies ${extraction.realEstate.agentName} as ${extraction.realEstate.agentRole || 'the site contact'}.`
    : '';
  const brokerage = extraction.realEstate.brokerage ? `The listing shows ${extraction.realEstate.brokerage} as the brokerage.` : '';
  return [
    contact,
    brokerage,
    listingIntent === 'rental'
      ? extraction.kind === 'vacation-rental'
        ? 'Open the original rental listing to confirm the current price, availability, fees, cancellation terms, house rules, and booking details.'
        : 'Open the original rental listing to confirm the current rent, availability, lease terms, deposits, fees, application requirements, and contact details.'
      : furnishingsIncluded
        ? 'The source describes the property as furnished. Confirm the exact furniture inventory, exclusions, current price, status, disclosures, fees, showing availability, and contact details on the original listing.'
        : 'Furnishings and decor shown in listing photographs may be staging and may not be included in the sale. Confirm all inclusions, current price, status, disclosures, fees, showing availability, and contact details on the original listing.',
  ].filter(Boolean).join(' ');
}

function closingSubtitle(extraction: BoardWizardListingExtraction, listingIntent: BoardWizardListingIntent): string {
  return [
    listingIntent === 'rental' ? 'Verify current availability' : '',
    extraction.realEstate.listingStatus,
    extraction.realEstate.mlsId ? `MLS# ${extraction.realEstate.mlsId}` : '',
    extraction.realEstate.brokerage,
  ].filter(Boolean).join(' · ').slice(0, 120);
}

function appendSentence(value: string, sentence: string, max: number): string {
  const cleanValue = value.trim().replace(/\s+/g, ' ');
  const cleanSentence = sentence.trim().replace(/\s+/g, ' ');
  if (!cleanSentence || cleanValue.includes(cleanSentence)) return cleanValue.slice(0, max);
  return `${cleanValue}${/[.!?]$/.test(cleanValue) ? '' : '.'} ${cleanSentence}`.slice(0, max).trim();
}

function fitFallbackNarration(value: string, seconds: number): string {
  const maxWords = Math.max(12, Math.round(Math.max(5, seconds) * 2.6));
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value;
  return `${words.slice(0, maxWords).join(' ').replace(/[,:;]$/, '')}.`;
}

function marketingStyleDescription(style: BoardWizardListingMarketingStyle): string {
  switch (style) {
    case 'guided': return 'welcoming guided property tour, direct and spatially coherent';
    case 'luxury': return 'restrained luxury editorial, polished but never hyperbolic';
    case 'brisk': return 'brisk agent reel, concise and energetic without urgency claims';
    case 'investor': return 'fact-forward property overview, emphasizing only verified practical details';
    default: return 'warm storyteller, inviting and visually connected without sales hype';
  }
}

const MOVABLE_FURNISHING_PATTERN = /\b(?:furnishings?|furniture|bunk\s+beds?|beds?|headboards?|nightstands?|dressers?|wardrobes?|desks?|office\s+chairs?|chairs?|sofas?|couches?|sectionals?|ottomans?|coffee\s+tables?|dining\s+tables?|tables?|stools?|benches?|rugs?|carpets?|artwork|paintings?|televisions?|tvs?|lamps?|cribs?|bookcases?|bookshelves?|loose\s+decor|decorations?|refrigerators?|washers?|dryers?|microwaves?|appliances?)\b/i;
const STAGING_QUALIFIER_PATTERN = /\b(?:staged|staging|shown|pictured|depicted|illustrat(?:e|es|ed|ing)|demonstrat(?:e|es|ed|ing)|could|may|might|imagine|example|possible|potential|visualiz(?:e|es|ed|ing)|accommodat(?:e|es|ed|ing)|space for|room for|can fit|if desired|depending on|not included|does not convey)\b/i;

function listingFixedFeatures(analysis: BoardWizardListingPhotoAnalysis): string[] {
  return (analysis.features ?? []).filter((feature) => !MOVABLE_FURNISHING_PATTERN.test(feature));
}

function listingMovableFurnishings(analysis: BoardWizardListingPhotoAnalysis): string[] {
  return Array.from(new Set([
    ...(analysis.movableFurnishings ?? []),
    ...(analysis.features ?? []).filter((feature) => MOVABLE_FURNISHING_PATTERN.test(feature)),
  ])).slice(0, 8);
}

function containsUnqualifiedSaleFurnishingClaim(value: string): boolean {
  return value
    .split(/(?<=[.!?])\s+|\s+[·|]\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => MOVABLE_FURNISHING_PATTERN.test(part) && !STAGING_QUALIFIER_PATTERN.test(part));
}

function humanList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function styleLead(style: BoardWizardListingMarketingStyle): string {
  switch (style) {
    case 'guided': return 'Step into the property as the tour begins.';
    case 'luxury': return 'The story begins with a composed first impression.';
    case 'brisk': return 'Start with the strongest first look.';
    case 'investor': return 'The walkthrough begins with the property itself.';
    default: return 'The first frame sets the tone for the walk-through.';
  }
}

function neutralRoomLabel(sceneType: string): string {
  if (sceneType === 'exterior' || sceneType === 'aerial') return 'Property exterior';
  if (sceneType === 'outdoor' || sceneType === 'balcony' || sceneType === 'view') return 'Outdoor view';
  return 'Interior view';
}

function shortAddress(extraction: BoardWizardListingExtraction): string {
  return (extraction.address || extraction.listingName).split(',').slice(0, 2).join(',').slice(0, 60);
}

function normalizedRole(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'property-view';
}

function containsUnsafeListingLanguage(value: string): boolean {
  return /\b(?:safe(?:st)?|crime[- ]free|perfect for (?:families|singles|young professionals)|family[- ]friendly neighborhood|exclusive community|good schools?|best schools?|guaranteed return|won't last|act now)\b/i.test(value);
}

function analysisCacheKey(url: string): string {
  return createHash('sha256').update(`${PHOTO_ANALYSIS_VERSION}\n${url}`).digest('hex');
}

function normalizeCachedAnalysis(value: unknown, expectedIndex: number): BoardWizardListingPhotoAnalysis | null {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (record.version !== PHOTO_ANALYSIS_VERSION) return null;
  const score = (input: unknown) => Math.max(0, Math.min(1, Number(input) || 0));
  const features = Array.isArray(record.features)
    ? record.features.map((item) => cleanText(item, 90)).filter(Boolean).slice(0, 8)
    : [];
  const movableFurnishings = Array.isArray(record.movableFurnishings)
    ? record.movableFurnishings.map((item) => cleanText(item, 90)).filter(Boolean).slice(0, 8)
    : [];
  return {
    index: expectedIndex,
    sceneType: cleanText(record.sceneType, 40).toLowerCase() || 'unknown',
    roomType: cleanText(record.roomType, 80) || 'Property view',
    features,
    movableFurnishings,
    qualityScore: score(record.qualityScore),
    heroScore: score(record.heroScore),
    confidence: score(record.confidence),
  };
}

async function downloadAndResizeListingImage(url: string): Promise<Buffer> {
  let current = new URL(url);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    await assertPublicImageUrl(current);
    const response = await fetch(current, {
      redirect: 'manual',
      headers: {
        Accept: 'image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5',
        'User-Agent': 'LivingWiki/1.0 listing-story-image-reader',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Image redirect did not include a location.');
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`Image download returned ${response.status}.`);
    const type = (response.headers.get('content-type') || '').toLowerCase();
    if (!type.startsWith('image/')) throw new Error('Listing media is not an image.');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_IMAGE_BYTES) throw new Error('Listing image is too large to analyze.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('Listing image has an invalid size.');
    return sharp(buffer, { failOn: 'none', limitInputPixels: 30_000_000 })
      .rotate()
      .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 68, mozjpeg: true })
      .toBuffer();
  }
  throw new Error('Listing image redirected too many times.');
}

async function assertPublicImageUrl(url: URL): Promise<void> {
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) {
    throw new Error('Unsupported listing image URL.');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local')) throw new Error('Private image host rejected.');
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('Private image address rejected.');
  }
}

function isPrivateAddress(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  const ipv4 = normalized.replace(/^::ffff:/, '').split('.').map(Number);
  if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part))) return false;
  return ipv4[0] === 10
    || ipv4[0] === 127
    || (ipv4[0] === 169 && ipv4[1] === 254)
    || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
    || (ipv4[0] === 192 && ipv4[1] === 168)
    || ipv4[0] === 0;
}

function cleanText(value: unknown, max: number): string {
  return (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeHostname(value: string): string {
  try { return new URL(value).hostname; } catch { return ''; }
}
