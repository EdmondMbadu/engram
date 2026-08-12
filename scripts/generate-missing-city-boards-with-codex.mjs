#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { GLOBAL_CITY_BOARD_TEMPLATES } = require('../functions/lib/global-city-board-templates.js');

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const has = (flag) => args.includes(flag);
const limit = Math.max(1, Number.parseInt(valueAfter('--limit') || '1', 10));
const cityFilter = valueAfter('--city').toLocaleLowerCase();
const templateFilter = valueAfter('--template');
const apply = has('--apply');
const publish = has('--publish');
const reuseArtifacts = has('--reuse-artifacts');
const resume = has('--resume');
const outputRoot = path.resolve(valueAfter('--output-dir') || 'artifacts/codex-city-boards');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const codexBinary = '/Applications/ChatGPT.app/Contents/Resources/codex';
const schemaPath = path.resolve('scripts/schemas/open-data-city-board.schema.json');
const functionsBaseUrl = `https://us-central1-${projectId}.cloudfunctions.net`;

if (publish && !apply) throw new Error('--publish requires --apply.');
if (templateFilter && !GLOBAL_CITY_BOARD_TEMPLATES.some((template) => template.id === templateFilter)) {
  throw new Error(`Unknown template: ${templateFilter}`);
}

admin.initializeApp({ projectId });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

function clean(value, max = 10_000) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function generationKey(atlasId, template) {
  return `${atlasId}__${template.id}__${template.version}`;
}

function hash(value, length = 28) {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function boardIdFor(key) {
  return `bulk_${hash(key)}`;
}

function templateInstructions(template) {
  const instructions = {
    'global-dishes-explain': 'Each card must identify one named dish and one exact venue serving it. A direct venue menu or reliable city/cultural source must support the dish-to-venue connection. Do not infer dishes from cuisine categories. Card titles must be dish-first.',
    'global-guidebooks-miss': 'Choose exact, independently identifiable places. A reliable local or official source must support the concrete use, community role, or reason to pass the place to a friend. Never claim locals-only behavior or obscurity without evidence.',
    'global-zero-dollars': 'Every card needs an official or reliable source explicitly supporting free public access or no required admission/purchase. Avoid venues that are merely outdoors or sometimes free. Card titles must lead with the free action.',
    'global-where-locals-linger': 'Every card needs a source supporting a concrete lingering affordance such as public seating, reading/study space, tables, park access, or café seating. Do not claim staff tolerate long stays. Explain the physical setup, not an invented local habit.',
    'global-neighborhoods-one-reason': 'Every card must be a real named neighborhood, district, sublocality, or locality—not a business, attraction, road, or the city itself. Give exactly one conservative, sourced distinction. Do not invent demographic, safety, culture, or history claims.',
    'global-only-happens-here': 'Every card must have a source supporting a genuinely city-specific institution, object, ritual, landscape, or local form. Explain why it makes sense in this city. Do not turn an ordinary attraction into an unsupported uniqueness claim.',
    'global-first-24-hours': 'Create a plausible ten-stop sequence from exact sourced places. Give each card one role in the day. Do not state current hours, travel times, or admission facts unless directly sourced. Avoid ranking and bucket-list language.',
  };
  return instructions[template.id];
}

function promptFor(inputPath, city, template) {
  return [
    `Read ${inputPath}. Research and write one source-backed LivingWiki board for ${city.name}${city.region ? `, ${city.region}` : ''}.`,
    `template_id: ${template.id}. Exact board title: ${template.titlePattern.replaceAll('{count}', String(template.count)).replaceAll('{city}', city.name)}.`,
    templateInstructions(template),
    'The input candidates are identity leads only. Their names, addresses, coordinates, types, and Google Maps URLs may establish identity/location, but never prove free admission, a menu item, local behavior, uniqueness, history, quality, opening hours, or popularity.',
    'Use browser research. Prefer official venue/institution/government pages, direct menus, cultural institutions, and established local publications. Avoid SEO listicles, scraped aggregators, review snippets, and invented synthesis.',
    'Every card must have a direct https source_url that supports its central claim and a precise source_title. Preserve a candidate place_id and maps_url when the selected entity matches a supplied candidate. Otherwise use null. Use supplied coordinates only for an exact identity match; otherwise null.',
    'Use fresh, concise LivingWiki voice: specific, observant, and useful. No rankings, best/must-visit/hidden-gem language, generic praise, stereotypes, or unsupported superlatives.',
    'Return exactly 10 distinct cards only when all ten are defensible. Otherwise set complete=false and return only the defensible cards with clear warnings. Never fill a slot to reach ten.',
    'The board icon must be one of: restaurant, style, money_off, weekend, location_city, fingerprint, schedule, dashboard_customize.',
  ].join(' ');
}

function candidatePayload(candidate) {
  return {
    place_id: clean(candidate?.placeId, 300),
    name: clean(candidate?.name, 200),
    address: clean(candidate?.address, 300),
    latitude: Number.isFinite(candidate?.lat) ? candidate.lat : null,
    longitude: Number.isFinite(candidate?.lng) ? candidate.lng : null,
    types: Array.isArray(candidate?.types) ? candidate.types.map((type) => clean(type, 80)).filter(Boolean) : [],
    maps_url: clean(candidate?.googleMapsUrl, 2_000),
    photo_reference: clean(candidate?.photoReference, 2_000),
  };
}

async function runCodex(prompt, outputPath, logPath) {
  const childArgs = [
    'exec', '--ephemeral', '--ignore-user-config', '--enable', 'browser_use',
    '--sandbox', 'read-only', '--skip-git-repo-check',
    '--output-schema', schemaPath, '-o', outputPath, prompt,
  ];
  await new Promise((resolve, reject) => {
    const log = createWriteStream(logPath, { flags: 'w' });
    const child = spawn(codexBinary, childArgs, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('error', reject);
    child.on('exit', (code) => {
      log.end();
      if (code === 0) resolve();
      else reject(new Error(`Codex exited with code ${code}. See ${logPath}.`));
    });
  });
}

async function reachable(url) {
  try {
    let response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': 'LivingWiki evidence validator/1.0' },
    });
    if (response.status === 405) {
      response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
        headers: { 'user-agent': 'LivingWiki evidence validator/1.0' },
      });
    }
    return {
      ok: (response.status >= 200 && response.status < 400) || response.status === 401 || response.status === 403,
      status: response.status,
      finalUrl: response.url,
      error: '',
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function validateArtifact(artifact, city, template) {
  const problems = [];
  const cards = Array.isArray(artifact?.cards) ? artifact.cards : [];
  if (artifact?.complete !== true) problems.push('Writer marked the board incomplete.');
  const artifactCity = clean(artifact?.city, 160).toLocaleLowerCase();
  const expectedCity = city.name.toLocaleLowerCase();
  if (artifactCity !== expectedCity && !artifactCity.startsWith(`${expectedCity},`)) problems.push('City identity mismatch.');
  if (artifact?.template_id !== template.id) problems.push('Template identity mismatch.');
  const allowedIcons = new Set(['restaurant', 'style', 'money_off', 'weekend', 'location_city', 'fingerprint', 'schedule', 'dashboard_customize']);
  if (!allowedIcons.has(clean(artifact?.icon, 64))) problems.push('Board icon is not an approved Material Symbol.');
  if (cards.length !== template.count) problems.push(`Expected ${template.count} cards; received ${cards.length}.`);
  const dishTitles = cards.map((card) => clean(card?.title, 200).toLocaleLowerCase()).filter(Boolean);
  if (new Set(dishTitles).size !== cards.length) problems.push('Card dishes are not unique.');
  const sourceUrls = cards.map((card) => clean(card?.source_url, 2_000));
  if (sourceUrls.some((url) => !/^https:\/\//i.test(url))) problems.push('Every card needs a direct HTTPS source URL.');
  if (cards.some((card) => !clean(card?.source_title, 240))) problems.push('Every card needs a source title.');
  if (cards.some((card) => !clean(card?.title, 100) || !clean(card?.notes, 3_600) || !clean(card?.short_summary, 200))) {
    problems.push('Every card needs a title, notes, and short summary.');
  }
  const prohibited = /\b(?:best|must[- ]visit|hidden gem|off the beaten path|locals[- ]only|tourist[- ]free)\b/i;
  if (cards.some((card) => prohibited.test(`${card?.title || ''} ${card?.subtitle || ''} ${card?.notes || ''}`))) {
    problems.push('Prohibited ranking or anti-slop language found.');
  }
  const uniqueSourceUrls = [...new Set(sourceUrls.filter(Boolean))];
  const reachability = await Promise.all(uniqueSourceUrls.map(async (url) => ({ url, ...await reachable(url) })));
  const unreachable = reachability.filter((entry) => !entry.ok);
  if (unreachable.length) problems.push(`${unreachable.length} source URL(s) could not be reached.`);
  return { ok: problems.length === 0, problems, sourceCount: uniqueSourceUrls.length, reachability, unreachable };
}

function cardForBoard(card, index, now, candidateByPlaceId) {
  const placeId = clean(card.place_id, 300);
  const candidate = placeId ? candidateByPlaceId.get(placeId) : null;
  const sourceUrl = clean(card.source_url, 2_000);
  const mapsUrl = clean(card.maps_url, 2_000) || clean(candidate?.googleMapsUrl, 2_000);
  const photoReference = clean(candidate?.photoReference, 2_000);
  const imageUrl = photoReference
    ? `${functionsBaseUrl}/boardPlacePhoto?ref=${encodeURIComponent(photoReference)}`
    : '';
  const identity = `editorial_${hash(`${sourceUrl}\0${clean(card.title, 200)}`, 32)}`;
  const latitude = Number.isFinite(card.latitude) ? card.latitude : Number.isFinite(candidate?.lat) ? candidate.lat : null;
  const longitude = Number.isFinite(card.longitude) ? card.longitude : Number.isFinite(candidate?.lng) ? candidate.lng : null;
  return {
    id: `card_${hash(identity, 20)}`,
    title: clean(card.title, 90),
    subtitle: clean(card.subtitle, 120),
    notes: clean(card.notes, 3_600),
    type: 'place', scope: 'place', status: 'saved', rating: 4,
    entityName: clean(card.entity_name, 100), entityType: 'place', imageIntent: 'place',
    imageContext: clean(card.subtitle, 120), mediaKind: 'none',
    shortSummary: clean(card.short_summary, 160), rank: index + 1,
    videoIntent: false, videoSearchQuery: '', youtubeVideoId: '', youtubeVideoTitle: '', youtubeChannelTitle: '', youtubeThumbnailUrl: '', youtubeDurationSeconds: 0, youtubeMatchConfidence: 0, youtubeVerifiedAt: '',
    imageUrl, imageUrls: imageUrl ? [imageUrl] : [], imageSource: imageUrl ? 'search' : 'missing',
    audioPreviewUrl: '', spotifyTrackId: '', spotifyTrackUrl: '', spotifyUri: '', spotifyArtistName: '', spotifyAlbumName: '', spotifyArtworkUrl: '',
    placeId: identity, externalPlaceId: placeId, googleMapsUrl: mapsUrl, locationLat: latitude, locationLng: longitude,
    sourceUrl, sourceTitle: clean(card.source_title, 240), productUrl: '', merchant: '', price: '', currency: '', sku: '', availability: '', productCategory: '',
    extractionConfidence: 1, extractedAt: now, what3wordsAddress: '', tags: [`rank-${index + 1}`, 'source-backed', 'codex-researched'], stickers: [], tour: null, childBoardId: '', relatedCards: [], createdAt: now, updatedAt: now,
  };
}

function boardPayload(artifact, city, template, candidates) {
  const now = new Date().toISOString();
  const key = generationKey(city.id, template);
  const candidateByPlaceId = new Map(candidates.map((candidate) => [clean(candidate.placeId, 300), candidate]));
  const cards = artifact.cards.map((card, index) => cardForBoard(card, index, now, candidateByPlaceId));
  const coordinateCount = cards.filter((card) => Number.isFinite(card.locationLat) && Number.isFinite(card.locationLng)).length;
  const warnings = Array.isArray(artifact.warnings) ? artifact.warnings.map((warning) => clean(warning, 500)).filter(Boolean) : [];
  return {
    id: boardIdFor(key), kind: 'standard', sortOrder: Date.now(), owner_user_id: 'livingwiki-system', owner_public_slug: 'livingwiki', owner_display_name: 'LivingWiki', owner_photo_url: '', owner_profile_icon: 'public', owner_profile_picture_type: 'icon',
    forkedFromBoardId: '', forkedFromTitle: '', forkedFromOwnerUserId: '', forkedFromOwnerName: '',
    visibility: publish ? 'public' : 'private', title: clean(artifact.title, 100), description: clean(artifact.description, 240),
    backNote: 'Researched with Codex from direct public sources. Editorial evidence is retained on every card.',
    icon: clean(artifact.icon, 64), tone: 'teal', imageUrl: cards.find((card) => card.imageUrl)?.imageUrl || '', logoUrl: '', logoLinkUrl: '', stackCtaLabel: '', stackCtaUrl: '',
    socialVideoUrl: '', socialVideoMimeType: '', socialVideoUpdatedAt: '', socialVideoRenderVersion: '', socialVideoRatio: 'vertical', socialVideoAudioTrackId: '', socialVideoAudioVolume: 0.18, socialVideoNarrationEnabled: true,
    trailerVideoUrl: '', trailerVideoMimeType: '', trailerVideoUpdatedAt: '', trailerVideoRenderVersion: '', trailerVideoRatio: 'vertical', trailerVideoAudioTrackId: '', trailerVideoAudioVolume: 0.18, trailerVideoNarrationEnabled: true, trailerVideoScript: '', trailerVideoSourceFingerprint: '', trailerVideoCardIds: [], trailerVideoDurationSeconds: 0,
    narrationStyle: 'storyteller', stackNarratorVoiceId: 'warm-storyteller', stickers: [], tourMeta: null, learningQuiz: null, parentBoardId: '', parentCardId: '', parentBoardTitle: '', parentCardTitle: '', insideCardsDisplay: 'nested', showCardNumbers: true,
    cards, atlas_id: city.id, generated_for_atlas_id: city.id, origin: 'bulk_generator', publisher_type: 'livingwiki',
    generation_job_id: 'codex-open-data-direct', generation_item_id: '', generation_key: key, generator_version: 'codex-open-data-1.0', template_id: template.id, template_version: template.version, rubric_version: '1.0',
    editorial_status: publish ? 'published' : 'needs_review', city_listing_status: publish ? 'listed' : 'pending', source_status: 'excluded', quality_status: warnings.length ? 'warnings' : 'not_scored', quality_warnings: warnings,
    validation_summary: { requested_count: template.count, verified_count: cards.length, unique_place_ids: new Set(cards.map((card) => card.placeId)).size, all_have_coordinates: coordinateCount === cards.length, coordinate_count: coordinateCount, validation_mode: 'source_backed_editorial', all_have_source_urls: cards.every((card) => /^https:\/\//i.test(card.sourceUrl)), candidate_sources: ['codex_web_research', ...(candidates.length ? ['cached_google_places_identity'] : [])], validated_at: now },
    created_by_user_id: 'livingwiki-system', approved_by_user_id: publish ? 'livingwiki-system' : '', approved_at: publish ? FieldValue.serverTimestamp() : null,
    deleted_at: null, deleted_by_user_id: '', deletion_reason: '', created_at_iso: now, updated_at_iso: now, server_updated_at: FieldValue.serverTimestamp(),
  };
}

async function loadTargets() {
  const [atlasSnapshot, boardSnapshot] = await Promise.all([
    db.collection('atlases').where('is_public', '==', true).get(),
    db.collection('boards').where('origin', '==', 'bulk_generator').get(),
  ]);
  const existing = new Set(boardSnapshot.docs.flatMap((document) => {
    const board = document.data();
    return board.deleted_at ? [] : [clean(board.generation_key, 500)];
  }));
  const cities = atlasSnapshot.docs.flatMap((document) => {
    const atlas = document.data();
    const config = atlas.city_config || {};
    if (atlas.is_public !== true || config.enabled !== true) return [];
    return [{ id: document.id, name: clean(config.city_name || atlas.name, 160), region: clean(config.region_name, 160), country: clean(config.country_name || config.country_code, 80) }];
  });
  return cities.flatMap((city) => GLOBAL_CITY_BOARD_TEMPLATES.flatMap((template) => {
    const key = generationKey(city.id, template);
    if (existing.has(key)) return [];
    if (cityFilter && !`${city.name} ${city.region} ${city.country}`.toLocaleLowerCase().includes(cityFilter)) return [];
    if (templateFilter && template.id !== templateFilter) return [];
    return [{ city, template, key }];
  })).slice(0, limit);
}

async function main() {
  await mkdir(outputRoot, { recursive: true });
  const targets = await loadTargets();
  const summary = { projectId, apply, publish, requested: targets.length, generated: 0, valid: 0, written: 0, rejected: 0, results: [] };
  for (const { city, template, key } of targets) {
    const targetDir = path.join(outputRoot, `${city.id}__${template.id}`);
    await mkdir(targetDir, { recursive: true });
    const cacheId = hash(key, 64);
    const cacheSnapshot = await db.collection('bulk_board_candidate_sets').doc(cacheId).get();
    const candidates = Array.isArray(cacheSnapshot.data()?.candidates) ? cacheSnapshot.data().candidates : [];
    const inputPath = path.join(targetDir, 'input.json');
    const outputPath = path.join(targetDir, 'board.json');
    const validationPath = path.join(targetDir, 'validation.json');
    const researchLogPath = path.join(targetDir, 'codex.log');
    await writeFile(inputPath, `${JSON.stringify({ city, template, generation_key: key, candidates: candidates.map(candidatePayload) }, null, 2)}\n`, 'utf8');
    process.stdout.write(`\n[Codex] ${city.name} · ${template.id} · ${candidates.length} cached identity leads\n`);
    try {
      let shouldGenerate = !reuseArtifacts;
      if (resume) {
        try {
          await readFile(outputPath, 'utf8');
          shouldGenerate = false;
        } catch {
          shouldGenerate = true;
        }
      }
      if (shouldGenerate) await runCodex(promptFor(inputPath, city, template), outputPath, researchLogPath);
      summary.generated += 1;
      const artifact = JSON.parse(await readFile(outputPath, 'utf8'));
      const validation = await validateArtifact(artifact, city, template);
      await writeFile(validationPath, `${JSON.stringify(validation, null, 2)}\n`, 'utf8');
      if (!validation.ok) {
        summary.rejected += 1;
        summary.results.push({ city: city.name, templateId: template.id, status: 'rejected', problems: validation.problems, outputPath });
        continue;
      }
      summary.valid += 1;
      if (apply) {
        const boardId = boardIdFor(key);
        const boardRef = db.collection('boards').doc(boardId);
        const existingBoard = await boardRef.get();
        if (existingBoard.exists && !existingBoard.data()?.deleted_at) throw new Error(`Board appeared during generation: ${boardId}`);
        await boardRef.set(boardPayload(artifact, city, template, candidates));
        await db.collection('board_generation_audit').add({
          action: publish ? 'codex_open_data_generate_and_publish' : 'codex_open_data_generate_for_review',
          board_id: boardId, atlas_id: city.id, template_id: template.id, actor_user_id: 'livingwiki-system',
          generator_version: 'codex-open-data-1.0', gemini_used: false, source_count: validation.sourceCount,
          artifact_path: outputPath, created_at: FieldValue.serverTimestamp(),
        });
        summary.written += 1;
        summary.results.push({ city: city.name, templateId: template.id, status: publish ? 'published' : 'needs_review', boardId, outputPath });
      } else {
        summary.results.push({ city: city.name, templateId: template.id, status: 'validated_dry_run', outputPath });
      }
    } catch (error) {
      summary.rejected += 1;
      summary.results.push({ city: city.name, templateId: template.id, status: 'error', problems: [error instanceof Error ? error.message : String(error)] });
    }
    await writeFile(path.join(outputRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`\n${JSON.stringify(summary, null, 2)}\n`);
  await admin.app().delete();
}

main().catch(async (error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  try { await admin.app().delete(); } catch { /* App may already be closed. */ }
  process.exitCode = 1;
});
