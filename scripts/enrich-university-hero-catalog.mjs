#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  fetchBitmap,
  officialUniversitySiteCandidates,
  relatedPageImageCandidates,
  universityCampusFallbackCandidates,
} from './lib/university-board-images.mjs';

const defaultInput = path.resolve('data/universities/us-universities-500.json');
const inputPath = path.resolve(argumentValue('--input') || defaultInput);
const apply = process.argv.includes('--apply');
const refreshAll = process.argv.includes('--all');
const retryUnresolved = process.argv.includes('--retry-unresolved');
const requestedUnitId = argumentValue('--unit-id');
const concurrency = boundedInteger(argumentValue('--concurrency'), 8, 1, 16);
const offset = boundedInteger(argumentValue('--offset'), 0, 0, 499);
const requestedLimit = boundedInteger(argumentValue('--limit'), Number.MAX_SAFE_INTEGER, 1, 500);
const checkpointPath = path.resolve(argumentValue('--checkpoint') || '/private/tmp/livingwiki-university-hero-checkpoint.json');
const overridePath = path.resolve('data/universities/university-hero-overrides.json');
const heroOverrides = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
const markPattern = /(?:logo|seal|crest|wordmark|coat[_ -]?of[_ -]?arms|favicon|emblem|mark[_-]?fallback)/i;
const unsuitablePhotoPattern = /(?:portrait|headshot|commencement|graduation|football|basketball|baseball|athlete|team photo|mascot|cemetery|arboretum|prairie|lagoon|specimen|species|flower|tree\.jpg)/i;
const campusLandmarkPattern = /(?:campus|hall|building|library|quad|tower|chapel|center|centre|university|college|school|administration|aerial|courtyard|arch|auditorium|student union|old well|yard)/i;

function argumentValue(name) {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function boundedInteger(value, fallback, min, max) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function isMark(value) {
  try {
    return markPattern.test(decodeURIComponent(String(value || '')));
  } catch {
    return markPattern.test(String(value || ''));
  }
}

function targetFor(record) {
  return {
    schoolName: record.official_name,
    townName: record.city,
    latitude: record.latitude,
    longitude: record.longitude,
  };
}

async function fetchBitmapWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchBitmap(url);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

function upgradedWikimediaUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== 'upload.wikimedia.org' || !/\.(?:jpe?g|png)$/i.test(url.pathname)) return '';
    const pathParts = url.pathname.split('/');
    const filename = pathParts.at(-1);
    if (!filename) return '';
    if (url.pathname.includes('/thumb/')) {
      url.pathname = url.pathname.replace(/\/\d+px-([^/]+)$/i, '/1600px-$1');
    } else {
      const commonsIndex = pathParts.indexOf('commons');
      if (commonsIndex < 0 || pathParts.length < commonsIndex + 4) return '';
      pathParts.splice(commonsIndex + 1, 0, 'thumb');
      pathParts.push(`1600px-${filename}`);
      url.pathname = pathParts.join('/');
    }
    return url.toString();
  } catch {
    return '';
  }
}

async function validatedCandidate(candidates, {
  requireStrongCommons = false,
  minWidth = 800,
  minAspect = 0.62,
  limit = 20,
} = {}) {
  const ordered = [...candidates].sort((left, right) => {
    const visualScore = (candidate) => (campusLandmarkPattern.test(candidate.title || '') ? 70 : 0)
      - (unsuitablePhotoPattern.test(candidate.title || '') ? 200 : 0);
    return (Number(right.score || 0) + visualScore(right)) - (Number(left.score || 0) + visualScore(left));
  });
  for (const candidate of ordered.slice(0, limit)) {
    if (!candidate?.imageUrl || isMark(candidate.imageUrl) || unsuitablePhotoPattern.test(`${candidate.title || ''} ${candidate.imageUrl}`)) continue;
    if (requireStrongCommons && Number(candidate.score || 0) < 230) continue;
    const imageUrls = [...new Set([upgradedWikimediaUrl(candidate.imageUrl), candidate.imageUrl].filter(Boolean))];
    for (const imageUrl of imageUrls) {
      try {
        const bitmap = await fetchBitmapWithRetry(imageUrl);
        const aspect = bitmap.dimensions.width / bitmap.dimensions.height;
        if (aspect < minAspect || bitmap.dimensions.width < minWidth) continue;
        return { ...candidate, imageUrl, dimensions: bitmap.dimensions };
      } catch {
        // Keep looking. A remote result is not catalog-safe until its image is readable.
      }
    }
  }
  return null;
}

async function resolveHero(record) {
  const override = heroOverrides[String(record.unit_id)];
  if (override) {
    if (override.imageUrl.startsWith('/assets/')) {
      const assetPath = path.resolve('src', override.imageUrl.replace(/^\//, ''));
      if (!fs.existsSync(assetPath)) throw new Error(`Missing local override asset: ${assetPath}`);
    }
    return {
      ...override,
      dimensions: { width: override.width, height: override.height },
    };
  }
  const target = targetFor(record);
  const commons = await universityCampusFallbackCandidates(target);
  const commonsHero = await validatedCandidate(commons, { requireStrongCommons: true });
  if (commonsHero) return commonsHero;

  const official = await officialUniversitySiteCandidates(target, record.website, [record.hero_source_page]);
  const officialHero = await validatedCandidate(official);
  if (officialHero) return officialHero;

  const sourcePage = await relatedPageImageCandidates(
    record.hero_source_page,
    `${record.official_name} verified source page`,
  );
  const sourcePageHero = await validatedCandidate(sourcePage);
  if (sourcePageHero) return sourcePageHero;

  const landmarkCommons = commons.filter((candidate) =>
    Number(candidate.score || 0) >= 100 && campusLandmarkPattern.test(candidate.title || ''),
  );
  const landmarkHero = await validatedCandidate(landmarkCommons, {
    minWidth: 600,
    minAspect: 0.55,
    limit: 30,
  });
  if (landmarkHero) return landmarkHero;

  const landmarkSourcePage = sourcePage.filter((candidate) =>
    campusLandmarkPattern.test(candidate.imageUrl || ''),
  );
  const landmarkSourcePageHero = await validatedCandidate(landmarkSourcePage, {
    minWidth: 600,
    minAspect: 0.55,
    limit: 40,
  });
  if (landmarkSourcePageHero) return landmarkSourcePageHero;

  if (!isMark(record.hero_url)) {
    const existing = await validatedCandidate([{
      imageUrl: record.hero_url,
      sourceUrl: record.hero_source_page || record.website,
      sourceLabel: 'Existing verified university image',
      license: record.hero_license || '',
      provider: record.hero_provider || record.hero_match || 'existing',
      title: record.hero_source_title || record.official_name,
    }]);
    if (existing) return existing;
  }
  return null;
}

function loadCheckpoint() {
  try {
    const value = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function saveCheckpoint(checkpoint) {
  fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

function applyResult(record, result) {
  if (!result) return record;
  return {
    ...record,
    hero_url: result.imageUrl,
    hero_source_page: result.sourceUrl,
    hero_match: result.provider === 'campus-fallback-wikimedia'
      ? 'wikimedia_campus_verified'
      : result.provider === 'official-campus-fallback'
        ? 'official_campus_verified'
        : result.provider === 'related-source-page'
          ? 'verified_source_page_photo'
          : result.provider === 'university-identity-fallback'
            ? 'university_identity_fallback'
            : result.provider?.includes('manual-campus-override')
              ? 'manual_campus_verified'
              : 'existing_photo_verified',
    hero_provider: result.provider,
    hero_license: result.license || null,
    hero_source_title: result.title || record.official_name,
    hero_width: result.dimensions?.width || null,
    hero_height: result.dimensions?.height || null,
    hero_verified_at: new Date().toISOString(),
  };
}

const records = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!Array.isArray(records) || records.length !== 500) {
  throw new Error(`Expected exactly 500 university records; found ${records?.length ?? 0}.`);
}

const checkpoint = loadCheckpoint();
const eligible = records
  .map((record, index) => ({ record, index }))
  .filter(({ record }) => requestedUnitId
    ? String(record.unit_id) === requestedUnitId
    : refreshAll || isMark(record.hero_url) || !record.hero_url)
  .slice(offset, offset + requestedLimit);
let cursor = 0;
let completed = 0;
let resolved = 0;
let unresolved = 0;

console.log(JSON.stringify({
  input: inputPath,
  records: records.length,
  eligible: eligible.length,
  concurrency,
  checkpoint: checkpointPath,
  mode: apply ? 'apply' : 'dry-run',
}, null, 2));

async function worker() {
  while (cursor < eligible.length) {
    const task = eligible[cursor++];
    const key = String(task.record.unit_id);
    const checkpointResult = checkpoint[key];
    const canReuseCheckpoint = !heroOverrides[key]
      && (checkpointResult?.imageUrl || (!retryUnresolved && checkpointResult?.error));
    let result = canReuseCheckpoint ? checkpointResult : null;
    if (!result) {
      try {
        result = await resolveHero(task.record);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) };
      }
      checkpoint[key] = result || { error: 'No verified campus photograph found.' };
      saveCheckpoint(checkpoint);
    }
    if (result && !result.error && result.imageUrl) {
      records[task.index] = applyResult(task.record, result);
      resolved += 1;
    } else {
      unresolved += 1;
    }
    completed += 1;
    console.log(`[${completed}/${eligible.length}] ${task.record.official_name}: ${result?.imageUrl ? result.provider : `unresolved · ${result?.error || 'no result'}`}`);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

if (apply) {
  fs.writeFileSync(inputPath, `${JSON.stringify(records, null, 2)}\n`);
  const csvPath = inputPath.replace(/\.json$/i, '.csv');
  const csvHeaders = Object.keys(records[0]).filter((key) => key !== 'hero_match');
  fs.writeFileSync(csvPath, `${csvHeaders.join(',')}\n${records.map((record) => csvHeaders.map((header) => csvCell(record[header])).join(',')).join('\n')}\n`);
}

console.log(JSON.stringify({ completed, resolved, unresolved, mode: apply ? 'apply' : 'dry-run' }, null, 2));
if (unresolved) process.exitCode = 2;
