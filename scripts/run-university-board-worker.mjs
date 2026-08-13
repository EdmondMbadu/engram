#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { enrichUniversityBoardImages } from './lib/university-board-images.mjs';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const {
  GLOBAL_UNIVERSITY_BOARD_TEMPLATES,
  renderUniversityBoardTitle,
} = require('../functions/lib/global-university-board-templates.js');
const { scoreGeneratedBoard } = require('../functions/lib/board-generation-score.js');

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const has = (flag) => args.includes(flag);
const apply = has('--apply');
const resume = has('--resume');
const artifactOnly = has('--artifact-only');
const regenerate = has('--regenerate');
const reuseDossiers = has('--reuse-dossiers') || resume;
const skipSourceCheck = has('--skip-source-check');
const limit = Math.max(1, Math.min(100, Number.parseInt(valueAfter('--limit') || '1', 10)));
const requestedJobId = valueAfter('--job');
const requestedItemId = valueAfter('--item');
const generationEngine = valueAfter('--generation-engine') || 'codex_local';
const outputRoot = path.resolve(valueAfter('--output-dir') || 'artifacts/codex-university-boards');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const knownCodexBinary = '/Applications/ChatGPT.app/Contents/Resources/codex';
const dossierSchemaPath = path.resolve('scripts/schemas/university-research-dossier.schema.json');
const boardSchemaPath = path.resolve('scripts/schemas/university-board.schema.json');
const workerVersion = generationEngine === 'gemini' ? 'gemini-university-1.0.0' : 'codex-university-1.0.0';
const scoreThreshold = 70;
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
const functionsBaseUrl = `https://us-central1-${projectId}.cloudfunctions.net`;

if (has('--help') || has('-h')) {
  process.stdout.write([
    'University Board Factory local Codex worker',
    '',
    'Usage:',
    '  npm run university-boards:worker -- [options]',
    '',
    'Options:',
    '  --job JOB_ID            Process queued items from one job (otherwise latest active job)',
    '  --item ITEM_ID          Process one explicit item',
    '  --limit N               Process at most N items; default 1, maximum 100',
    '  --apply                 Save passing private boards and update job progress',
    '  --reuse-dossiers        Reuse a valid university-wide research dossier',
    '  --resume                Reuse both dossier and existing per-item board artifact',
    '  --artifact-only         Validate the resumed board artifact without invoking Codex',
    '  --generation-engine ID  Label saved boards/audit with the actual generator',
    '  --regenerate            Replace an existing private review board when the new score improves it',
    '  --output-dir PATH       Store audit artifacts at PATH',
    '  --skip-source-check     Diagnostic only; skip live source reachability checks',
    '  -h, --help              Show this help',
    '',
    'Without --apply, Codex still researches and writes local artifacts, but Firestore is not mutated.',
    '',
  ].join('\n'));
  process.exit(0);
}

admin.initializeApp({ projectId });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

function clean(value, max = 10_000) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function hash(value, length = 28) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

function slug(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'university';
}

function normalizedIdentity(value) {
  return clean(value, 200).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function finite(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function generationKey(atlasId, template) {
  return `${atlasId}__${template.id}__${template.version}`;
}

function boardIdFor(key) {
  return `bulk_${hash(key)}`;
}

function suppressionId(key) {
  return hash(key, 64);
}

async function codexBinary() {
  const configured = clean(process.env.CODEX_BIN, 2_000);
  if (configured) return configured;
  try {
    await access(knownCodexBinary, fsConstants.X_OK);
    return knownCodexBinary;
  } catch {
    return 'codex';
  }
}

async function runCodex(prompt, schemaPath, outputPath, logPath) {
  const binary = await codexBinary();
  const childArgs = [
    'exec', '--ephemeral', '--ignore-user-config', '--enable', 'browser_use',
    '--sandbox', 'read-only', '--skip-git-repo-check',
    '--output-schema', schemaPath, '-o', outputPath, prompt,
  ];
  const result = await new Promise((resolve, reject) => {
    const child = spawn(binary, childArgs, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('exit', (code) => resolve({
      code,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
  await writeFile(logPath, `${result.stderr}\n${result.stdout}`.trimStart(), 'utf8');
  if (result.code !== 0) throw new Error(`Codex exited with code ${result.code}. See ${logPath}.`);
}

function dossierPrompt(inputPath, outputPath) {
  return [
    `Read the university target at ${inputPath}. Build a reusable, source-backed research dossier. Return only the structured dossier as your final response; the Codex CLI captures it at ${outputPath}, so do not use shell commands or file-editing tools to write that path.`,
    'Research all seven template buckets listed in the input. Aim for 45–70 defensible evidence records so later boards can avoid repeating the same subjects.',
    'Use web research. Prefer official university, library, dining, student-affairs, campus-map, alumni, government, cultural-institution, direct business, and established student-media sources.',
    'Search results and reviews are discovery leads only. Do not use snippets, Reddit, anonymous posts, SEO listicles, scraped directories, or Google Maps as proof of the central claim.',
    'Each evidence record must state one conservative supported_claim and one direct HTTPS source. Never invent student behavior, popularity, signature orders, access, free admission, hours, tradition origins, or uniqueness.',
    'The audience includes students under 21. Exclude bars, 21+-only venues, drinking rituals, trespass, and unsafe behavior.',
    'For free activities, cost_status must be free only when the source supports no required purchase or admission. For late-night evidence, access_notes must describe what the source actually verifies about late availability.',
    'Use the exact school and town identity from the input. In shared cities, keep results in the practical orbit of this campus rather than returning a generic city guide.',
    'Use today as source_fetched_at. If a source publication date is unavailable, use null. Set complete=false when the source footprint is too thin and explain the gap in warnings.',
  ].join(' ');
}

function boardPrompt(inputPath, dossierPath, template, exactTitle) {
  return [
    `Read the generation input at ${inputPath} and the reusable research dossier at ${dossierPath}.`,
    'Return only the structured board as your final response. The Codex CLI captures it automatically; do not use shell commands or file-editing tools to write the output.',
    `Create exactly one LivingWiki university board for template ${template.id}. Exact title: ${exactTitle}.`,
    template.editorialBrief,
    `Allowed subject types: ${template.allowedSubjectTypes.join(', ')}. Use exactly 10 distinct subjects and icon ${template.icon}.`,
    'Every card needs one direct HTTPS source supporting its evidence_claim. Prefer dossier evidence, but use fresh web research when the dossier cannot defensibly fill all ten slots.',
    'A source proves only what it says. Do not infer current hours, price, access, popularity, student habits, school affiliation, uniqueness, safety, or tradition origins.',
    'Write specific, compact, useful copy. Avoid rankings, “best,” hidden-gem language, generic praise, stereotypes, brochure copy, and claims that every student behaves the same way.',
    'Each card notes field must be a useful 80–180 character action-oriented explanation, not a short label or disclaimer. Keep the short_summary distinct from the notes.',
    'Keep the exact entity name recognizable. For non-place subjects, latitude, longitude, and maps_url may be null. Never fabricate coordinates.',
    'Every selected subject must also be visually documentable: choose a named place, event, object, artwork, or tradition with an exact attributable photo on an official source, established local/student publication, Google Places listing, or Wikimedia Commons. Avoid generic concepts, micro-spaces, and ambiguous names whose only likely images are logos, banners, stock art, or unrelated namesakes.',
    template.id === 'college-blocks-off-campus'
      ? 'For this blocks-off-campus board, anchor every card to one clearly named, map-listed destination on or immediately beside the block (park, cafe, shop, library, museum, theater, market, or civic site). Put the block/corridor in the subtitle and notes. Never use a bare intersection, generic street segment, unnamed civic block, or corridor as the entity unless its exact source page visibly contains an attributable photograph.'
      : '',
    'All content must be under-21-safe. Set complete=false rather than filling a weak slot. Return no more than ten cards and never duplicate a subject under a different title.',
    'The generation input contains excluded_subjects already used by other boards for this university. Do not use any excluded subject, close alias, or the same place/activity reframed under another title.',
    'The generation input may contain excluded_source_urls that failed live validation. Never cite those URLs; find a current direct replacement or choose a different subject.',
  ].join(' ');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function reachable(url) {
  if (skipSourceCheck) return { ok: true, conclusive: false, status: 0, finalUrl: url, error: 'skipped' };
  try {
    const response = await fetch(url, {
      method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': 'LivingWiki university evidence validator/1.0' },
    });
    const ok = (response.status >= 200 && response.status < 400) || [401, 403, 405, 429].includes(response.status);
    await response.body?.cancel();
    return { ok, conclusive: true, status: response.status, finalUrl: response.url, error: '' };
  } catch (error) {
    return {
      ok: true,
      conclusive: false,
      status: 0,
      finalUrl: url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function crossBoardOverlap(atlasId, templateId, cards) {
  const snapshot = await db.collection('boards').where('atlas_id', '==', atlasId).limit(80).get();
  const existing = new Set(snapshot.docs.flatMap((document) => {
    const board = document.data();
    if (board.deleted_at || board.template_id === templateId || !Array.isArray(board.cards)) return [];
    return board.cards.map((card) => normalizedIdentity(card?.entityName || card?.entity_name)).filter(Boolean);
  }));
  const overlapping = cards
    .map((card) => clean(card.entity_name, 160))
    .filter((name) => existing.has(normalizedIdentity(name)));
  return [...new Set(overlapping)];
}

async function excludedSubjects(atlasId, templateId) {
  const snapshot = await db.collection('boards').where('atlas_id', '==', atlasId).limit(80).get();
  const subjects = snapshot.docs.flatMap((document) => {
    const board = document.data();
    if (board.deleted_at || board.template_id === templateId || !Array.isArray(board.cards)) return [];
    return board.cards.map((card) => clean(card?.entityName || card?.entity_name, 160)).filter(Boolean);
  });
  return [...new Map(subjects.map((subject) => [normalizedIdentity(subject), subject])).values()].slice(0, 120);
}

async function validateArtifact(artifact, target, template) {
  const problems = [];
  const warnings = Array.isArray(artifact?.warnings) ? artifact.warnings.map((warning) => clean(warning, 500)).filter(Boolean) : [];
  const cards = Array.isArray(artifact?.cards) ? artifact.cards : [];
  if (artifact?.complete !== true) problems.push('Writer marked the board incomplete.');
  if (clean(artifact?.school_name, 180).toLowerCase() !== target.schoolName.toLowerCase()) problems.push('School identity mismatch.');
  if (clean(artifact?.town_name, 180).toLowerCase() !== target.townName.toLowerCase()) problems.push('Town identity mismatch.');
  if (artifact?.template_id !== template.id) problems.push('Template identity mismatch.');
  const exactTitle = renderUniversityBoardTitle(template, target.shortSchoolName, target.townName);
  if (clean(artifact?.title, 100) !== exactTitle) problems.push('Board title does not match the canonical template.');
  if (clean(artifact?.icon, 64) !== template.icon) problems.push('Board icon does not match the canonical template.');
  if (cards.length !== template.count) problems.push(`Expected ${template.count} cards; received ${cards.length}.`);
  const ids = cards.map((card) => clean(card?.subject_id, 200)).filter(Boolean);
  const titles = cards.map((card) => normalizedIdentity(card?.title)).filter(Boolean);
  const entities = cards.map((card) => normalizedIdentity(card?.entity_name)).filter(Boolean);
  if (ids.length !== cards.length || new Set(ids).size !== cards.length) problems.push('Every card needs a unique subject_id.');
  if (new Set(titles).size !== cards.length) problems.push('Card titles are not unique.');
  if (new Set(entities).size !== cards.length) problems.push('Card entities are not unique.');
  if (cards.some((card) => !template.allowedSubjectTypes.includes(card?.subject_type))) problems.push('A card uses a subject type outside the template rubric.');
  if (cards.some((card) => !clean(card?.title, 100) || !clean(card?.notes, 3_600) || !clean(card?.short_summary, 200) || !clean(card?.evidence_claim, 500))) {
    problems.push('Every card needs a title, notes, short summary, and evidence claim.');
  }
  if (cards.some((card) => !/^https:\/\//i.test(clean(card?.source_url, 2_000)) || !clean(card?.source_title, 240))) {
    problems.push('Every card needs a direct HTTPS source URL and source title.');
  }
  if (cards.some((card) => !Number.isFinite(Date.parse(clean(card?.source_fetched_at, 80))))) {
    problems.push('Every card needs a valid source_fetched_at timestamp.');
  }
  if (cards.some((card) => card?.under21_safe !== true)) problems.push('Every card must be explicitly under-21-safe.');
  if (template.id === 'college-zero-dollar-hangs' && cards.some((card) => card?.cost_status !== 'free')) {
    problems.push('Every Zero Dollars card must have source-supported free status.');
  }
  if (template.id === 'college-late-night-runs' && cards.some((card) => clean(card?.access_notes, 500).length < 20)) {
    problems.push('Every late-night card needs a specific access or hours evidence note.');
  }
  const prohibited = /\b(?:best|must[- ]visit|hidden gem|off the beaten path|locals[- ]only|tourist[- ]free|bar crawl|21\+|fake id|trespass)\b/i;
  if (cards.some((card) => prohibited.test(`${card?.title || ''} ${card?.subtitle || ''} ${card?.notes || ''}`))) {
    problems.push('Prohibited ranking, generic, adult-only, or unsafe language found.');
  }
  const sourceUrls = [...new Set(cards.map((card) => clean(card?.source_url, 2_000)).filter(Boolean))];
  const reachability = await Promise.all(sourceUrls.map(async (url) => ({ url, ...await reachable(url) })));
  const broken = reachability.filter((entry) => entry.conclusive && !entry.ok);
  const inconclusive = reachability.filter((entry) => !entry.conclusive);
  if (broken.length) problems.push(`${broken.length} source URL(s) returned a conclusive broken response.`);
  if (inconclusive.length && !skipSourceCheck) warnings.push(`${inconclusive.length} source URL check(s) were inconclusive and need editorial confirmation.`);
  const overlap = await crossBoardOverlap(target.atlasId, template.id, cards);
  if (overlap.length > 4) problems.push(`Cross-board overlap exceeds four subjects: ${overlap.join(', ')}.`);
  else if (overlap.length) warnings.push(`${overlap.length} subject(s) also appear on another board for this school.`);
  return { ok: problems.length === 0, problems, warnings, reachability, overlap, sourceCount: sourceUrls.length };
}

function cardPayload(card, index, now, target) {
  const subjectType = clean(card.subject_type, 80);
  const latitude = finite(card.latitude, -90, 90);
  const longitude = finite(card.longitude, -180, 180);
  const isGeographic = ['place', 'study_space', 'street_or_district', 'sequence_stop'].includes(subjectType);
  const sourceUrl = clean(card.source_url, 2_000);
  const identity = clean(card.subject_id, 200) || `${sourceUrl}\0${clean(card.entity_name, 200)}`;
  return {
    id: `card_${hash(identity, 20)}`,
    title: clean(card.title, 90),
    subtitle: clean(card.subtitle, 120),
    notes: clean(card.notes, 3_600),
    type: isGeographic ? 'place' : subjectType === 'tradition' ? 'memory' : 'idea',
    scope: isGeographic ? 'place' : 'city',
    status: 'saved', rating: 4,
    entityName: clean(card.entity_name, 100),
    entityType: isGeographic ? 'place' : 'other',
    imageIntent: isGeographic ? 'place' : 'other',
    imageContext: clean(card.subtitle, 120),
    mediaKind: 'none', shortSummary: clean(card.short_summary, 160), rank: index + 1,
    subjectType, evidenceClaim: clean(card.evidence_claim, 500),
    accessNotes: clean(card.access_notes, 500), costStatus: clean(card.cost_status, 40), under21Safe: card.under21_safe === true,
    sourceKind: clean(card.source_kind, 80), sourcePublishedAt: clean(card.source_published_at, 80), sourceFetchedAt: clean(card.source_fetched_at, 80),
    videoIntent: false, videoSearchQuery: '', youtubeVideoId: '', youtubeVideoTitle: '', youtubeChannelTitle: '', youtubeThumbnailUrl: '', youtubeDurationSeconds: 0, youtubeMatchConfidence: 0, youtubeVerifiedAt: '',
    imageUrl: '', imageUrls: [], imageSource: 'missing',
    audioPreviewUrl: '', spotifyTrackId: '', spotifyTrackUrl: '', spotifyUri: '', spotifyArtistName: '', spotifyAlbumName: '', spotifyArtworkUrl: '',
    placeId: `university_${hash(`${target.atlasId}\0${identity}`, 32)}`,
    externalPlaceId: '', googleMapsUrl: clean(card.maps_url, 2_000), locationLat: latitude, locationLng: longitude,
    sourceUrl, sourceTitle: clean(card.source_title, 240), productUrl: '', merchant: '', price: '', currency: '', sku: '', availability: '', productCategory: '',
    extractionConfidence: 1, extractedAt: now, what3wordsAddress: '',
    tags: [`rank-${index + 1}`, 'source-backed', `${generationEngine}-researched`, subjectType, slug(target.shortSchoolName)].filter(Boolean).slice(0, 8),
    stickers: [], tour: null, childBoardId: '', relatedCards: [], createdAt: now, updatedAt: now,
  };
}

function boardPayload(artifact, validation, target, template, jobId, itemId, heroUrl) {
  const now = new Date().toISOString();
  const key = generationKey(target.atlasId, template);
  const cards = artifact.cards.map((card, index) => cardPayload(card, index, now, target));
  const payload = {
    id: boardIdFor(key), kind: 'standard', sortOrder: Date.now(), owner_user_id: 'livingwiki-system', owner_public_slug: 'livingwiki', owner_display_name: 'LivingWiki', owner_photo_url: '', owner_profile_icon: 'school', owner_profile_picture_type: 'icon',
    forkedFromBoardId: '', forkedFromTitle: '', forkedFromOwnerUserId: '', forkedFromOwnerName: '',
    visibility: 'private', title: clean(artifact.title, 100), description: clean(artifact.description, 240),
    backNote: `Researched with ${generationEngine === 'gemini' ? 'Gemini' : 'Codex'} from direct public sources. Every card retains its evidence source. Editorial review is required before publishing.`,
    icon: template.icon, tone: 'teal', imageUrl: clean(heroUrl, 2_000), logoUrl: '', logoLinkUrl: '', stackCtaLabel: '', stackCtaUrl: '',
    socialVideoUrl: '', socialVideoMimeType: '', socialVideoUpdatedAt: '', socialVideoRenderVersion: '', socialVideoRatio: 'vertical', socialVideoAudioTrackId: '', socialVideoAudioVolume: 0.18, socialVideoNarrationEnabled: true,
    trailerVideoUrl: '', trailerVideoMimeType: '', trailerVideoUpdatedAt: '', trailerVideoRenderVersion: '', trailerVideoRatio: 'vertical', trailerVideoAudioTrackId: '', trailerVideoAudioVolume: 0.18, trailerVideoNarrationEnabled: true, trailerVideoScript: '', trailerVideoSourceFingerprint: '', trailerVideoCardIds: [], trailerVideoDurationSeconds: 0,
    narrationStyle: 'storyteller', stackNarratorVoiceId: 'warm-storyteller', stickers: [], tourMeta: null, learningQuiz: null, parentBoardId: '', parentCardId: '', parentBoardTitle: '', parentCardTitle: '', insideCardsDisplay: 'nested', showCardNumbers: true,
    cards, atlas_id: target.atlasId, generated_for_atlas_id: target.atlasId, target_kind: 'university', origin: 'bulk_generator', publisher_type: 'livingwiki',
    generation_engine: generationEngine, generation_job_id: jobId, generation_item_id: itemId, generation_key: key, generator_version: workerVersion, template_id: template.id, template_version: template.version, rubric_version: 'university-1.0',
    school_name: target.schoolName, short_school_name: target.shortSchoolName, town_name: target.townName, state: target.state, unit_id: target.unitId,
    editorial_status: 'needs_review', city_listing_status: 'pending', source_status: 'excluded',
    quality_status: validation.warnings.length ? 'warnings' : 'passed', quality_warnings: validation.warnings,
    validation_summary: {
      requested_count: template.count, verified_count: cards.length, unique_subject_ids: new Set(cards.map((card) => card.placeId)).size,
      all_have_source_urls: cards.every((card) => /^https:\/\//i.test(card.sourceUrl)),
      coordinate_count: cards.filter((card) => Number.isFinite(card.locationLat) && Number.isFinite(card.locationLng)).length,
      source_count: validation.sourceCount, candidate_sources: [...new Set(cards.map((card) => card.sourceKind).filter(Boolean))],
      cross_board_overlap_count: validation.overlap.length, validation_mode: 'source_backed_university_editorial', validated_at: now,
    },
    created_by_user_id: 'livingwiki-system', approved_by_user_id: '', approved_at: null,
    deleted_at: null, deleted_by_user_id: '', deletion_reason: '', created_at_iso: now, updated_at_iso: now, server_updated_at: FieldValue.serverTimestamp(),
  };
  const scoring = scoreGeneratedBoard(payload, { expectedCount: template.count, freshnessDays: template.freshnessDays, now: new Date(now) });
  return {
    ...payload,
    generation_score: scoring.score, generation_grade: scoring.grade, generation_score_breakdown: scoring.breakdown,
    generation_score_reasons: scoring.reasons, generation_scored_at: scoring.scoredAt, generation_score_rubric_version: scoring.rubricVersion,
  };
}

async function googlePlacesApiKey() {
  const configured = clean(process.env.GOOGLE_PLACES_API_KEY, 2_000);
  if (configured) return configured;
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn('gcloud', ['secrets', 'versions', 'access', 'latest', '--secret', 'GOOGLE_PLACES_API_KEY', '--project', projectId], {
        cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdout = [];
      child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
      child.on('error', reject);
      child.on('exit', (code) => resolve({ code, value: Buffer.concat(stdout).toString('utf8').trim() }));
    });
    return result.code === 0 ? clean(result.value, 2_000) : '';
  } catch {
    return '';
  }
}


async function gcloudSecret(name) {
  const configured = clean(process.env[name], 2_000);
  if (configured) return configured;
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn('gcloud', ['secrets', 'versions', 'access', 'latest', '--secret', name, '--project', projectId], {
        cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdout = [];
      child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
      child.on('error', reject);
      child.on('exit', (code) => resolve({ code, value: Buffer.concat(stdout).toString('utf8').trim() }));
    });
    return result.code === 0 ? clean(result.value, 2_000) : '';
  } catch {
    return '';
  }
}

async function latestUniversityJobId() {
  const snapshot = await db.collection('board_generation_jobs').orderBy('created_at', 'desc').limit(100).get();
  return snapshot.docs.find((document) => {
    const job = document.data();
    return job.target_kind === 'university' && job.generation_engine === 'codex_local'
      && job.status === 'running' && job.cancel_requested !== true;
  })?.id || '';
}

async function loadWorkItems() {
  if (requestedItemId) {
    const snapshot = await db.collection('board_generation_items').doc(requestedItemId).get();
    if (!snapshot.exists) throw new Error(`Item not found: ${requestedItemId}`);
    return [{ id: snapshot.id, data: snapshot.data() }];
  }
  const jobId = requestedJobId || await latestUniversityJobId();
  if (!jobId) throw new Error('No active university Codex job found. Queue one in the University Board Factory or pass --job.');
  const snapshot = await db.collection('board_generation_items').where('job_id', '==', jobId).get();
  return snapshot.docs
    .map((document) => ({ id: document.id, data: document.data() }))
    .filter(({ data }) => data.target_kind === 'university' && data.generation_engine === 'codex_local' && data.status === 'queued')
    .sort((left, right) => `${left.data.atlas_id}\0${left.data.template_id}`.localeCompare(`${right.data.atlas_id}\0${right.data.template_id}`))
    .slice(0, limit);
}

async function claimItem(itemId) {
  if (!apply) return true;
  return db.runTransaction(async (transaction) => {
    const ref = db.collection('board_generation_items').doc(itemId);
    const snapshot = await transaction.get(ref);
    const item = snapshot.data();
    if (!snapshot.exists || item?.status !== 'queued' || item?.generation_engine !== 'codex_local' || item?.target_kind !== 'university') return false;
    const jobRef = db.collection('board_generation_jobs').doc(clean(item.job_id, 180));
    const job = await transaction.get(jobRef);
    if (!job.exists || job.data()?.cancel_requested === true) return false;
    transaction.update(ref, {
      status: 'running', attempt_count: FieldValue.increment(1), worker_status: 'researching',
      worker_id: `local-${process.pid}`, lease_started_at: FieldValue.serverTimestamp(), started_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(),
      error_code: '', error_message: '',
    });
    transaction.set(jobRef, { worker_status: 'running_codex', worker_heartbeat_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

async function finishItem(item, status, fields = {}) {
  if (!apply) return;
  const itemRef = db.collection('board_generation_items').doc(item.id);
  const jobRef = db.collection('board_generation_jobs').doc(clean(item.data.job_id, 180));
  await db.runTransaction(async (transaction) => {
    const [itemSnapshot, jobSnapshot] = await Promise.all([transaction.get(itemRef), transaction.get(jobRef)]);
    if (!itemSnapshot.exists || !['running', 'queued'].includes(clean(itemSnapshot.data()?.status, 40))) return;
    const job = jobSnapshot.data() || {};
    const completed = Math.max(0, Number(job.completed_count) || 0) + 1;
    const total = Math.max(0, Number(job.total_count) || 0);
    const isComplete = completed >= total;
    transaction.update(itemRef, { status, ...fields, completed_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
    transaction.set(jobRef, {
      completed_count: completed,
      success_count: Math.max(0, Number(job.success_count) || 0) + (status === 'needs_review' ? 1 : 0),
      failed_count: Math.max(0, Number(job.failed_count) || 0) + (status === 'failed' ? 1 : 0),
      skipped_count: Math.max(0, Number(job.skipped_count) || 0) + (status === 'skipped_existing' || status === 'suppressed' ? 1 : 0),
      cancelled_count: Math.max(0, Number(job.cancelled_count) || 0) + (status === 'cancelled' ? 1 : 0),
      status: isComplete ? (job.cancel_requested === true ? 'cancelled' : 'completed') : 'running',
      worker_status: isComplete ? 'complete' : 'running_codex',
      worker_heartbeat_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(),
      ...(isComplete ? { completed_at: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
    if (isComplete) transaction.delete(db.collection('board_generation_locks').doc(clean(job.lock_id, 180) || 'university_codex_local'));
  });
}

async function targetForItem(item) {
  const atlasId = clean(item.data.atlas_id, 180);
  const snapshot = await db.collection('atlases').doc(atlasId).get();
  if (!snapshot.exists) throw new Error(`University atlas not found: ${atlasId}`);
  const atlas = snapshot.data();
  const config = atlas.university_config || {};
  if (atlas.is_public !== true || atlas.wiki_type !== 'university' || config.enabled !== true) throw new Error('Target is no longer an enabled public university.');
  return {
    atlasId,
    schoolName: clean(config.official_name || item.data.school_name, 180),
    shortSchoolName: clean(item.data.short_school_name || config.official_name, 180).replace(/-Main Campus$/i, ''),
    townName: clean(config.city || item.data.town_name, 120), state: clean(config.state || item.data.state, 20),
    countryCode: clean(config.country_code || item.data.country_code, 20) || 'US', unitId: clean(config.unit_id || item.data.unit_id, 40),
    website: clean(config.website || item.data.website, 2_000), latitude: finite(config.latitude, -90, 90), longitude: finite(config.longitude, -180, 180),
    heroUrl: clean(atlas.hero_url || config.hero_source?.url, 2_000), logoUrl: clean(atlas.logo_url || config.logo_source?.url, 2_000),
  };
}

async function ensureDossier(target, templateInput, targetDir) {
  const dossierDir = path.join(outputRoot, 'dossiers');
  await mkdir(dossierDir, { recursive: true });
  const dossierPath = path.join(dossierDir, `${target.atlasId}.json`);
  const dossierLogPath = path.join(dossierDir, `${target.atlasId}.codex.log`);
  let useExisting = reuseDossiers;
  if (useExisting) {
    try {
      const existing = await readJson(dossierPath);
      useExisting = existing?.school_name === target.schoolName && Array.isArray(existing?.evidence) && existing.evidence.length >= 20;
    } catch {
      useExisting = false;
    }
  }
  if (!useExisting) {
    const dossierInputPath = path.join(targetDir, 'dossier-input.json');
    await writeFile(dossierInputPath, `${JSON.stringify({
      current_date: new Date().toISOString().slice(0, 10), target,
      templates: GLOBAL_UNIVERSITY_BOARD_TEMPLATES.map((candidate) => ({
        id: candidate.id, titlePattern: candidate.titlePattern, editorialBrief: candidate.editorialBrief,
        researchQueries: candidate.researchQueries, allowedSubjectTypes: candidate.allowedSubjectTypes,
      })),
    }, null, 2)}\n`, 'utf8');
    await runCodex(dossierPrompt(dossierInputPath, dossierPath), dossierSchemaPath, dossierPath, dossierLogPath);
  }
  const dossier = await readJson(dossierPath);
  if (!Array.isArray(dossier.evidence) || dossier.evidence.length < 20) throw new Error(`University dossier has only ${dossier.evidence?.length || 0} evidence records; at least 20 are required.`);
  if (apply) {
    await db.collection('university_board_research').doc(target.atlasId).set({
      atlas_id: target.atlasId, school_name: target.schoolName, town_name: target.townName,
      evidence_count: dossier.evidence.length, complete: dossier.complete === true,
      dossier_fingerprint: hash(JSON.stringify(dossier), 64), generator_version: workerVersion,
      researched_at_iso: clean(dossier.researched_at, 80), updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return { dossier, dossierPath };
}

async function writeBoard(payload, item, target, template, artifactPath, validationPath) {
  if (!apply) return 'dry_run';
  const boardRef = db.collection('boards').doc(payload.id);
  return db.runTransaction(async (transaction) => {
    const jobRef = db.collection('board_generation_jobs').doc(clean(item.data.job_id, 180));
    const suppressionRef = db.collection('board_generation_suppressions').doc(suppressionId(payload.generation_key));
    const [job, suppression, board] = await Promise.all([
      transaction.get(jobRef), transaction.get(suppressionRef), transaction.get(boardRef),
    ]);
    if (job.data()?.cancel_requested === true) return 'cancelled';
    if (suppression.exists && suppression.data()?.active !== false) return 'suppressed';
    if (board.exists && !board.data()?.deleted_at) {
      const current = board.data() || {};
      const replaceable = regenerate
        && current.visibility === 'private'
        && current.editorial_status === 'needs_review'
        && current.generation_key === payload.generation_key
        && payload.generation_score > (Number(current.generation_score) || 0);
      if (!replaceable) return 'existing';
    }
    transaction.set(boardRef, payload);
    transaction.set(db.collection('board_generation_audit').doc(), {
      action: `${generationEngine}_university_generate_for_review`, board_id: payload.id, atlas_id: target.atlasId,
      job_id: clean(item.data.job_id, 180), item_id: item.id, template_id: template.id,
      actor_user_id: 'livingwiki-system', target_kind: 'university', generation_engine: generationEngine,
      generator_version: workerVersion, generation_score: payload.generation_score,
      artifact_path: artifactPath, validation_path: validationPath, created_at: FieldValue.serverTimestamp(),
    });
    return 'created';
  });
}

async function processItem(item) {
  if (!await claimItem(item.id)) return { itemId: item.id, status: 'not_claimed' };
  const target = await targetForItem(item);
  const template = GLOBAL_UNIVERSITY_BOARD_TEMPLATES.find((candidate) => candidate.id === clean(item.data.template_id, 100));
  if (!template) throw new Error(`Unknown university template: ${item.data.template_id}`);
  const key = generationKey(target.atlasId, template);
  const [existingBoard, suppression] = await Promise.all([
    db.collection('boards').doc(boardIdFor(key)).get(),
    db.collection('board_generation_suppressions').doc(suppressionId(key)).get(),
  ]);
  if (suppression.exists && suppression.data()?.active !== false) {
    await finishItem(item, 'suppressed', { generation_key: key });
    return { itemId: item.id, school: target.shortSchoolName, template: template.id, status: 'suppressed' };
  }
  if (existingBoard.exists && !existingBoard.data()?.deleted_at && !regenerate) {
    await finishItem(item, 'skipped_existing', { board_id: existingBoard.id, generation_key: key });
    return { itemId: item.id, school: target.shortSchoolName, template: template.id, status: 'existing', boardId: existingBoard.id };
  }
  const targetDir = path.join(outputRoot, clean(item.data.job_id, 180) || 'dry-run', item.id);
  await mkdir(targetDir, { recursive: true });
  const inputPath = path.join(targetDir, 'input.json');
  const artifactPath = path.join(targetDir, 'board.json');
  const validationPath = path.join(targetDir, 'validation.json');
  const logPath = path.join(targetDir, 'codex.log');
  const exactTitle = renderUniversityBoardTitle(template, target.shortSchoolName, target.townName);
  const excluded = await excludedSubjects(target.atlasId, template.id);
  let excludedSourceUrls = [];
  try {
    const previousValidation = await readJson(validationPath);
    excludedSourceUrls = (previousValidation?.reachability || [])
      .filter((entry) => entry?.conclusive === true && entry?.ok === false)
      .map((entry) => clean(entry?.url, 2_000))
      .filter(Boolean);
  } catch { /* no prior validation */ }
  let dossierPath = path.join(outputRoot, 'dossiers', `${target.atlasId}.json`);
  if (!artifactOnly) {
    ({ dossierPath } = await ensureDossier(target, item.data.template, targetDir));
  } else {
    try {
      await readFile(artifactPath, 'utf8');
    } catch {
      throw new Error(`--artifact-only requires an existing board artifact at ${artifactPath}.`);
    }
  }
  const imageOptions = {
    admin, bucketName: storageBucket, functionsBaseUrl,
    googlePlacesApiKey: await googlePlacesApiKey(),
    googleCustomSearchApiKey: await gcloudSecret('GOOGLE_CUSTOM_SEARCH_API_KEY'),
    googleCustomSearchCx: process.env.GOOGLE_CUSTOM_SEARCH_CX || 'f5a12e50537f14b83',
  };
  let validation;
  let payload = null;
  let imageRetrySubjects = [];
  const maximumImageAttempts = artifactOnly ? 1 : 3;
  for (let imageAttempt = 1; imageAttempt <= maximumImageAttempts; imageAttempt += 1) {
    await writeFile(inputPath, `${JSON.stringify({
      current_date: new Date().toISOString().slice(0, 10), target, template,
      exact_title: exactTitle,
      excluded_subjects: [...new Set([...excluded, ...imageRetrySubjects])],
      excluded_source_urls: excludedSourceUrls,
      image_retry_attempt: imageAttempt,
    }, null, 2)}\n`, 'utf8');
    let shouldGenerate = true;
    if (resume && imageAttempt === 1) {
      try { await readFile(artifactPath, 'utf8'); shouldGenerate = false; } catch { shouldGenerate = true; }
    }
    if (shouldGenerate) {
      const attemptLogPath = imageAttempt === 1 ? logPath : path.join(targetDir, `codex-image-retry-${imageAttempt}.log`);
      await runCodex(boardPrompt(inputPath, dossierPath, template, exactTitle), boardSchemaPath, artifactPath, attemptLogPath);
    }
    const artifact = await readJson(artifactPath);
    validation = await validateArtifact(artifact, target, template);
    payload = validation.ok ? boardPayload(artifact, validation, target, template, clean(item.data.job_id, 180), item.id, target.heroUrl) : null;
    if (!payload) break;
    const imageResult = await enrichUniversityBoardImages(payload, target, imageOptions);
    if (imageResult.ok) {
      payload = imageResult.board;
      break;
    }
    const failedIndexes = new Set(imageResult.failures.map((failure) => Number.parseInt(failure, 10) - 1).filter((index) => index >= 0));
    const failedEntities = artifact.cards
      .filter((_, index) => failedIndexes.has(index))
      .map((card) => clean(card?.entity_name, 160))
      .filter(Boolean);
    imageRetrySubjects = [...new Set([...imageRetrySubjects, ...failedEntities])];
    payload = null;
    if (imageAttempt === maximumImageAttempts) {
      validation.ok = false;
      validation.problems.push(`Every card needs a validated image. Missing after ${maximumImageAttempts} attempt(s): ${imageResult.failures.join(', ')}.`);
    }
  }
  if (payload && payload.generation_score < scoreThreshold) {
    validation.ok = false;
    validation.problems.push(`Generation score ${payload.generation_score}/100 is below the ${scoreThreshold} publish-review threshold.`);
  }
  await writeFile(validationPath, `${JSON.stringify({ ...validation, generationScore: payload?.generation_score ?? null, generationGrade: payload?.generation_grade ?? null }, null, 2)}\n`, 'utf8');
  if (!validation.ok || !payload) {
    await finishItem(item, 'failed', {
      error_code: 'quality-validation-failed', error_message: validation.problems.join(' · ').slice(0, 1_000),
      quality_warning_count: validation.warnings.length, generation_score: payload?.generation_score ?? null,
      artifact_path: artifactPath, validation_path: validationPath,
    });
    return { itemId: item.id, school: target.shortSchoolName, template: template.id, status: 'rejected', problems: validation.problems, score: payload?.generation_score ?? null };
  }
  const writeResult = await writeBoard(payload, item, target, template, artifactPath, validationPath);
  if (writeResult === 'cancelled') await finishItem(item, 'cancelled');
  else if (writeResult === 'suppressed') await finishItem(item, 'suppressed', { generation_key: payload.generation_key });
  else if (writeResult === 'existing') await finishItem(item, 'skipped_existing', { board_id: payload.id, generation_key: payload.generation_key });
  else if (writeResult === 'created') await finishItem(item, 'needs_review', {
    board_id: payload.id, generation_key: payload.generation_key, quality_warning_count: validation.warnings.length,
    generation_score: payload.generation_score, generation_grade: payload.generation_grade,
    artifact_path: artifactPath, validation_path: validationPath,
  });
  return { itemId: item.id, school: target.shortSchoolName, template: template.id, status: writeResult, boardId: payload.id, score: payload.generation_score, grade: payload.generation_grade };
}

async function main() {
  await mkdir(outputRoot, { recursive: true });
  const items = await loadWorkItems();
  if (!items.length) {
    process.stdout.write('No queued university Codex items found.\n');
    return;
  }
  const summary = { projectId, apply, requested: items.length, completed: 0, created: 0, rejected: 0, results: [] };
  for (const item of items) {
    process.stdout.write(`[University Codex] ${clean(item.data.school_name || item.data.city_name, 180)} · ${clean(item.data.template_id, 100)}\n`);
    try {
      const result = await processItem(item);
      summary.completed += 1;
      if (result.status === 'created' || result.status === 'dry_run') summary.created += 1;
      if (result.status === 'rejected') summary.rejected += 1;
      summary.results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.completed += 1;
      summary.rejected += 1;
      summary.results.push({ itemId: item.id, status: 'error', error: message });
      await finishItem(item, 'failed', { error_code: 'codex-worker-failed', error_message: message.slice(0, 1_000) });
    }
    await writeFile(path.join(outputRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch(async (error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
}).finally(async () => {
  try { await admin.app().delete(); } catch { /* no-op */ }
});
