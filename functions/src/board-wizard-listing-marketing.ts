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
  style: BoardWizardListingMarketingStyle;
  direction: string;
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
    style,
    direction: cleanText(record.direction, 500),
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
    contactName: extraction.realEstate.agentName,
    contactRole: extraction.realEstate.agentRole,
    brokerage: extraction.realEstate.brokerage,
    siteName: extraction.siteName,
    confidence: extraction.confidence,
  };
}

export function isLikelyBoardWizardRealEstateUrl(value: string): boolean {
  return /(^|\.)(?:zillow|trulia|hotpads|realtor|redfin|apartments|homes|rent|zumper|apartmentlist|exprealty)\./i.test(safeHostname(value));
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
}): GeneratedBoardWizardBatch {
  const allAnalyses = mergeWithFallbackAnalyses(options.extraction, options.analyses);
  const listingIntent = normalizeBoardWizardListingIntent(options.listingIntent);
  const furnishingsIncluded = boardWizardListingFurnishingsIncluded(options.extraction);
  const aiScenes = validateAiScenes(
    options.aiScenes ?? [],
    allAnalyses,
    options.extraction,
    listingIntent,
    furnishingsIncluded,
  );
  const scenes = completeStoryScenes({
    extraction: options.extraction,
    analyses: allAnalyses,
    aiScenes,
    count: Math.max(1, Math.min(24, options.extraction.images.length, Math.round(options.count) || 12)),
    secondsPerCard: options.narrationSecondsPerCard,
    style: options.style,
    listingIntent,
    furnishingsIncluded,
  });
  return buildMarketingBatch({
    extraction: options.extraction,
    targetBoardTitle: options.targetBoardTitle,
    scenes,
    listingIntent,
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
  const { extraction } = options;
  const listingIntent = normalizeBoardWizardListingIntent(options.listingIntent);
  const supportsTalkThru = extraction.kind === 'real-estate' || listingIntent === 'rental';
  const furnishingsIncluded = boardWizardListingFurnishingsIncluded(extraction);
  if (!supportsTalkThru || options.marketing.enabled === false || extraction.images.length < 2) {
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
    listingIntent,
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
  listingIntent: BoardWizardListingIntent;
}): GeneratedBoardWizardBatch {
  const extractedAt = new Date().toISOString();
  const gallery = options.extraction.images.map((image) => image.url).slice(0, BOARD_WIZARD_SOURCE_GALLERY_LIMIT);
  const cards = options.scenes.map((scene, position): GeneratedBoardWizardCard => {
    const image = options.extraction.images[scene.photoIndex];
    const role = normalizedRole(scene.role);
    return {
      title: scene.title.slice(0, 80),
      subtitle: scene.subtitle.slice(0, 120),
      notes: scene.narration.slice(0, 3600),
      type: position === 0 ? 'place' : 'note',
      scope: 'place',
      status: position === options.scenes.length - 1 ? 'planned' : 'saved',
      rating: position === 0 ? 5 : 4,
      tags: [
        'listing',
        options.listingIntent === 'rental' ? 'rental' : 'real-estate',
        'listing-story',
        `story-${role}`,
        'source-image',
      ],
      image_query: `${options.extraction.listingName} ${scene.title}`.slice(0, 120),
      place_query: options.extraction.address || options.extraction.listingName,
      entity_name: options.extraction.listingName,
      entity_type: 'place',
      image_intent: 'place',
      image_context: image?.alt || scene.subtitle,
      short_summary: scene.subtitle.slice(0, 160),
      rank: position + 1,
      imageUrl: image?.url,
      imageUrls: position === 0 ? gallery : image ? [image.url] : [],
      sourceUrl: options.extraction.sourceUrl,
      imageSource: image ? 'source-page' : 'missing',
      extractionConfidence: options.extraction.confidence,
      extractedAt,
      locationLat: position === 0 ? options.extraction.latitude : undefined,
      locationLng: position === 0 ? options.extraction.longitude : undefined,
    };
  });
  return {
    board: {
      title: (options.targetBoardTitle || options.extraction.listingName).slice(0, 90),
      description: storyBoardDescription(options.extraction, options.listingIntent).slice(0, 240),
      icon: options.listingIntent === 'rental' ? 'key' : 'apartment',
      tone: options.listingIntent === 'rental' ? 'sky' : 'teal',
    },
    cards,
  };
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
  return `A connected ${listingIntent === 'rental' ? 'rental TalkThru' : 'property TalkThru'} of ${extraction.listingName}${details ? ` — ${details}` : ''}, arranged from arrival through the living spaces to the next step.`;
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
