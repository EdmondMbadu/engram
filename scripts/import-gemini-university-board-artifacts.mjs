#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { scoreGeneratedBoard } = require('../functions/lib/board-generation-score.js');
const args = process.argv.slice(2);
const valueAfter = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : fallback;
};
const apply = args.includes('--apply');
const jobId = valueAfter('--job');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const artifactRoot = path.resolve(valueAfter('--root', 'artifacts/codex-university-boards'), jobId);
if (!jobId) throw new Error('Pass --job JOB_ID.');

admin.initializeApp({ projectId });
const db = admin.firestore();
const { FieldValue } = admin.firestore;
const clean = (value, max = 2_000) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const hash = (value, length = 28) => createHash('sha256').update(String(value)).digest('hex').slice(0, length);
const slug = (value) => clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'university';
const finite = (value, min, max) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;

function cardPayload(card, index, target, now) {
  const subjectType = clean(card.subject_type, 80);
  const isGeographic = ['place', 'study_space', 'street_or_district', 'sequence_stop'].includes(subjectType);
  const identity = clean(card.subject_id, 200) || `${card.source_url || ''}\0${card.entity_name || ''}`;
  return {
    id: `card_${hash(identity, 20)}`, title: clean(card.title, 90), subtitle: clean(card.subtitle, 120),
    notes: clean(card.notes, 3_600), type: isGeographic ? 'place' : subjectType === 'tradition' ? 'memory' : 'idea',
    scope: isGeographic ? 'place' : 'city', status: 'saved', rating: 4,
    entityName: clean(card.entity_name, 100), entityType: isGeographic ? 'place' : 'other',
    imageIntent: isGeographic ? 'place' : 'other', imageContext: clean(card.subtitle, 120), mediaKind: 'none',
    shortSummary: clean(card.short_summary, 160), rank: index + 1, subjectType,
    evidenceClaim: clean(card.evidence_claim, 500), accessNotes: clean(card.access_notes, 500),
    costStatus: clean(card.cost_status, 40), under21Safe: card.under21_safe === true,
    sourceKind: clean(card.source_kind, 80), sourcePublishedAt: clean(card.source_published_at, 80),
    sourceFetchedAt: clean(card.source_fetched_at, 80), sourceUrl: clean(card.source_url, 2_000),
    sourceTitle: clean(card.source_title, 240), imageUrl: '', imageUrls: [], imageSource: 'missing',
    imageSourceUrl: '', imageFingerprint: '', imageVerificationStatus: 'pending', imageLicense: '',
    imageAuthor: '', imageAttribution: '', imageStoragePath: '', imageResolvedAt: '', extractionConfidence: 1,
    placeId: `university_${hash(`${target.atlasId}\0${identity}`, 32)}`, externalPlaceId: '',
    googleMapsUrl: clean(card.maps_url, 2_000), locationLat: finite(card.latitude, -90, 90),
    locationLng: finite(card.longitude, -180, 180), videoIntent: false, videoSearchQuery: '',
    youtubeVideoId: '', youtubeVideoTitle: '', youtubeChannelTitle: '', youtubeThumbnailUrl: '', youtubeDurationSeconds: 0,
    youtubeMatchConfidence: 0, youtubeVerifiedAt: '', audioPreviewUrl: '', spotifyTrackId: '', spotifyTrackUrl: '',
    spotifyUri: '', spotifyArtistName: '', spotifyAlbumName: '', spotifyArtworkUrl: '', productUrl: '', merchant: '',
    price: '', currency: '', sku: '', availability: '', productCategory: '', what3wordsAddress: '',
    tags: [`rank-${index + 1}`, 'source-backed', 'gemini-researched', 'images-pending', subjectType, slug(target.shortName)].filter(Boolean).slice(0, 8),
    stickers: [], tour: null, childBoardId: '', relatedCards: [], createdAt: now, updatedAt: now,
  };
}

function boardPayload(artifact, target) {
  const now = new Date().toISOString();
  const boardId = `gemini_paid_${hash(`${jobId}\0${target.atlasId}\0${artifact.template_id}`)}`;
  const cards = artifact.cards.map((card, index) => cardPayload(card, index, target, now));
  const canonicalKey = `${target.atlasId}__${clean(artifact.template_id, 100)}__1.0`;
  const payload = {
    id: boardId, kind: 'standard', sortOrder: Date.now(), owner_user_id: 'livingwiki-system',
    owner_public_slug: 'livingwiki', owner_display_name: 'LivingWiki', owner_photo_url: '',
    owner_profile_icon: 'school', owner_profile_picture_type: 'icon', forkedFromBoardId: '', forkedFromTitle: '',
    forkedFromOwnerUserId: '', forkedFromOwnerName: '', visibility: 'private', title: clean(artifact.title, 100),
    description: clean(artifact.description, 240),
    backNote: 'Paid Gemini research artifact recovered. Sources and copy are preserved. Images and final editorial validation are required before publishing.',
    icon: clean(artifact.icon, 64) || 'school', tone: 'teal', imageUrl: target.heroUrl, logoUrl: target.logoUrl,
    logoLinkUrl: '', stackCtaLabel: '', stackCtaUrl: '', stickers: [], tourMeta: null, learningQuiz: null,
    parentBoardId: '', parentCardId: '', parentBoardTitle: '', parentCardTitle: '', insideCardsDisplay: 'nested',
    showCardNumbers: true, narrationStyle: 'storyteller', stackNarratorVoiceId: 'warm-storyteller', cards,
    socialVideoUrl: '', socialVideoMimeType: '', socialVideoUpdatedAt: '', socialVideoRenderVersion: '', socialVideoRatio: 'vertical', socialVideoAudioTrackId: '', socialVideoAudioVolume: 0.18, socialVideoNarrationEnabled: true,
    trailerVideoUrl: '', trailerVideoMimeType: '', trailerVideoUpdatedAt: '', trailerVideoRenderVersion: '', trailerVideoRatio: 'vertical', trailerVideoAudioTrackId: '', trailerVideoAudioVolume: 0.18, trailerVideoNarrationEnabled: true, trailerVideoScript: '', trailerVideoSourceFingerprint: '', trailerVideoCardIds: [], trailerVideoDurationSeconds: 0,
    atlas_id: target.atlasId, generated_for_atlas_id: target.atlasId, target_kind: 'university',
    origin: 'bulk_generator', publisher_type: 'livingwiki', generation_engine: 'gemini', generation_job_id: jobId,
    generation_item_id: '', generation_key: `${canonicalKey}__paid_${jobId}`, canonical_generation_key: canonicalKey,
    generator_version: 'gemini-university-recovered-1.0.0', template_id: clean(artifact.template_id, 100),
    template_version: '1.0', rubric_version: 'university-1.0', school_name: target.schoolName,
    short_school_name: target.shortName, town_name: target.townName, state: target.state, unit_id: target.unitId,
    editorial_status: 'needs_review', city_listing_status: 'pending', source_status: 'excluded',
    quality_status: 'awaiting_images', quality_warnings: ['Paid Gemini artifact recovered; all 10 card images still require enrichment and validation.'],
    validation_summary: {
      requested_count: 10, verified_count: cards.length, unique_subject_ids: new Set(cards.map((card) => card.placeId)).size,
      all_have_source_urls: cards.every((card) => /^https:\/\//i.test(card.sourceUrl)),
      coordinate_count: cards.filter((card) => card.locationLat !== null && card.locationLng !== null).length,
      source_count: new Set(cards.map((card) => card.sourceUrl).filter(Boolean)).size,
      candidate_sources: [...new Set(cards.map((card) => card.sourceKind).filter(Boolean))],
      all_have_images: false, image_count: 0, unique_image_count: 0,
      validation_mode: 'recovered_paid_gemini_artifact_images_pending', validated_at: now,
    },
    paid_artifact_recovery: true, paid_artifact_imported_at: now, created_by_user_id: 'livingwiki-system',
    approved_by_user_id: '', approved_at: null, deleted_at: null, deleted_by_user_id: '', deletion_reason: '',
    created_at_iso: now, updated_at_iso: now, server_updated_at: FieldValue.serverTimestamp(),
  };
  const scoring = scoreGeneratedBoard(payload, { expectedCount: 10, now: new Date(now) });
  return { ...payload, generation_score: scoring.score, generation_grade: scoring.grade,
    generation_score_breakdown: scoring.breakdown, generation_score_reasons: scoring.reasons,
    generation_scored_at: scoring.scoredAt, generation_score_rubric_version: scoring.rubricVersion };
}

const recovered = [];
for (const entry of await readdir(artifactRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('school-')) continue;
  const atlasId = entry.name.slice('school-'.length);
  try {
    const artifact = JSON.parse(await readFile(path.join(artifactRoot, entry.name, 'gemini-board-set.json'), 'utf8'));
    if (!Array.isArray(artifact.boards) || artifact.boards.length !== 7) continue;
    const atlas = await db.collection('atlases').doc(atlasId).get();
    if (!atlas.exists) continue;
    const data = atlas.data() || {};
    const config = data.university_config || {};
    const target = {
      atlasId, schoolName: clean(config.official_name || artifact.school_name, 180),
      shortName: clean(config.short_name || artifact.school_name, 180).replace(/-Main Campus$/i, ''),
      townName: clean(config.city || artifact.town_name, 120), state: clean(config.state, 40), unitId: clean(config.unit_id, 40),
      heroUrl: clean(data.hero_url || config.hero_source?.url, 2_000), logoUrl: clean(data.logo_url || config.logo_source?.url, 2_000),
    };
    for (const board of artifact.boards) {
      if (board?.complete === true && Array.isArray(board.cards) && board.cards.length === 10) recovered.push(boardPayload(board, target));
    }
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === 'ENOENT')) {
      process.stderr.write(`Skipped ${entry.name}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

if (apply) {
  for (let index = 0; index < recovered.length; index += 240) {
    const batch = db.batch();
    for (const board of recovered.slice(index, index + 240)) {
      batch.set(db.collection('boards').doc(board.id), board, { merge: false });
      batch.set(db.collection('board_generation_audit').doc(), {
        action: 'recover_paid_gemini_university_artifact', board_id: board.id, atlas_id: board.atlas_id,
        job_id: jobId, template_id: board.template_id, actor_user_id: 'livingwiki-system',
        target_kind: 'university', generation_engine: 'gemini', image_status: 'awaiting_images',
        created_at: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

process.stdout.write(`${JSON.stringify({ ok: true, apply, jobId,
  universityCount: new Set(recovered.map((board) => board.atlas_id)).size, boardCount: recovered.length,
  cardCount: recovered.reduce((sum, board) => sum + board.cards.length, 0),
  allPrivate: recovered.every((board) => board.visibility === 'private'),
  allImagesPending: recovered.every((board) => board.validation_summary.image_count === 0),
}, null, 2)}\n`);
await admin.app().delete();
