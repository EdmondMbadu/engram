#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
admin.initializeApp({ projectId });
const db = admin.firestore();

const buckets = [
  'global-dishes-explain',
  'global-guidebooks-miss',
  'global-zero-dollars',
  'global-where-locals-linger',
  'global-neighborhoods-one-reason',
  'global-only-happens-here',
  'global-first-24-hours',
];

const concise = process.argv.includes('--concise');
const [atlasSnapshot, boardSnapshot, listingSnapshot, jobSnapshot, itemSnapshot, placeSnapshot, candidateSetSnapshot] = await Promise.all([
  db.collection('atlases').where('is_public', '==', true).get(),
  db.collection('boards').where('origin', '==', 'bulk_generator').get(),
  db.collection('city_board_listings').get(),
  db.collection('board_generation_jobs').get(),
  db.collection('board_generation_items').get(),
  db.collection('city_places').get(),
  db.collection('bulk_board_candidate_sets').get(),
]);

const cities = new Map(atlasSnapshot.docs.flatMap((document) => {
  const data = document.data();
  const config = data.city_config || {};
  return config.enabled === true ? [[document.id, {
    id: document.id,
    name: config.city_name || data.name,
    slug: data.slug || '',
  }]] : [];
}));
const listingsByBoard = new Map(listingSnapshot.docs.map((document) => [document.data().board_id, document.data()]));
const cells = new Map();
const orphanBoards = [];
for (const document of boardSnapshot.docs) {
  const board = document.data();
  const atlasId = String(board.atlas_id || board.generated_for_atlas_id || '');
  const templateId = String(board.template_id || '');
  if (!cities.has(atlasId) || !buckets.includes(templateId)) {
    orphanBoards.push({ id: document.id, atlasId, templateId, title: board.title || '' });
    continue;
  }
  const key = `${atlasId}|${templateId}`;
  cells.set(key, [...(cells.get(key) || []), { id: document.id, ...board }]);
}

function boardProblems(board) {
  const problems = [];
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const summary = board.validation_summary || {};
  const listing = listingsByBoard.get(board.id);
  if (board.deleted_at) problems.push('deleted');
  if (cards.length !== 10) problems.push(`cards:${cards.length}`);
  if (Number(summary.requested_count) !== 10) problems.push(`requested:${summary.requested_count ?? 'missing'}`);
  if (Number(summary.verified_count) !== 10) problems.push(`verified:${summary.verified_count ?? 'missing'}`);
  if (Number(summary.unique_place_ids) !== 10) problems.push(`unique:${summary.unique_place_ids ?? 'missing'}`);
  if (summary.all_have_coordinates !== true) problems.push('coordinates');
  if (board.atlas_id !== board.generated_for_atlas_id) problems.push('atlas-link-mismatch');
  if (board.template_version !== '1.0') problems.push(`template-version:${board.template_version || 'missing'}`);
  if (board.rubric_version !== '1.0') problems.push(`rubric-version:${board.rubric_version || 'missing'}`);
  if (board.editorial_status !== 'published') problems.push(`editorial:${board.editorial_status || 'missing'}`);
  if (board.city_listing_status !== 'listed') problems.push(`city-listing:${board.city_listing_status || 'missing'}`);
  if (board.visibility !== 'public') problems.push(`visibility:${board.visibility || 'missing'}`);
  if (!listing || listing.atlas_id !== board.atlas_id || listing.city_listing_status !== 'listed') problems.push('listing-projection');
  return problems;
}

const coverage = {};
const missing = [];
const duplicates = [];
const invalid = [];
for (const bucket of buckets) {
  const bucketStats = { complete: 0, present: 0, missing: 0, invalid: 0, duplicate: 0 };
  for (const city of cities.values()) {
    const boards = cells.get(`${city.id}|${bucket}`) || [];
    const active = boards.filter((board) => !board.deleted_at);
    if (!active.length) {
      bucketStats.missing += 1;
      missing.push({ atlasId: city.id, city: city.name, bucket });
      continue;
    }
    bucketStats.present += 1;
    if (active.length > 1) {
      bucketStats.duplicate += 1;
      duplicates.push({ atlasId: city.id, city: city.name, bucket, boardIds: active.map((board) => board.id) });
    }
    const valid = active.filter((board) => boardProblems(board).length === 0);
    if (valid.length === 1 && active.length === 1) {
      bucketStats.complete += 1;
    } else {
      bucketStats.invalid += 1;
      invalid.push(...active.map((board) => ({
        atlasId: city.id,
        city: city.name,
        bucket,
        boardId: board.id,
        problems: boardProblems(board),
      })).filter((entry) => entry.problems.length));
    }
  }
  coverage[bucket] = bucketStats;
}

const jobs = jobSnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
const items = itemSnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
const latestJobs = [...jobs]
  .sort((left, right) => (right.created_at?.toMillis?.() || 0) - (left.created_at?.toMillis?.() || 0))
  .slice(0, 5)
  .map((job) => ({
    id: job.id,
    status: job.status || 'unknown',
    templateId: job.template?.id || '',
    totalCount: Number(job.total_count) || 0,
    completedCount: Number(job.completed_count) || 0,
    successCount: Number(job.success_count) || 0,
    failedCount: Number(job.failed_count) || 0,
    items: items.filter((item) => item.job_id === job.id).slice(0, 10).map((item) => ({
      id: item.id,
      city: item.city_name || '',
      bucket: item.template_id || '',
      status: item.status || 'unknown',
      errorCode: item.error_code || '',
      errorMessage: item.error_message || '',
      boardId: item.board_id || '',
    })),
  }));
const latestJobIds = new Set(latestJobs.slice(0, 1).map((job) => job.id));
const latestGeneratedBoards = boardSnapshot.docs.flatMap((document) => {
  const board = document.data();
  if (!latestJobIds.has(board.generation_job_id)) return [];
  return [{
    id: document.id,
    title: board.title || '',
    atlasId: board.atlas_id || '',
    generatedForAtlasId: board.generated_for_atlas_id || '',
    templateId: board.template_id || '',
    editorialStatus: board.editorial_status || '',
    cityListingStatus: board.city_listing_status || '',
    visibility: board.visibility || '',
    validationSummary: board.validation_summary || null,
    qualityWarnings: board.quality_warnings || [],
    cards: Array.isArray(board.cards) ? board.cards.map((card) => ({
      title: card.title || '',
      entityName: card.entityName || '',
      placeId: card.placeId || '',
      hasCoordinates: Number.isFinite(card.locationLat) && Number.isFinite(card.locationLng),
    })) : [],
  }];
});
const failureGroups = items
  .filter((item) => item.status === 'failed')
  .reduce((groups, item) => {
    const message = String(item.error_message || 'Unknown failure')
      .replace(/\b[0-9a-f]{20,}\b/gi, '<id>')
      .replace(/\d+/g, '#')
      .slice(0, 500);
    const key = `${item.error_code || 'unknown'}|${message}`;
    const group = groups.get(key) || {
      errorCode: item.error_code || 'unknown',
      message,
      count: 0,
      buckets: {},
      examples: [],
    };
    group.count += 1;
    const bucket = item.template_id || 'unknown';
    group.buckets[bucket] = (group.buckets[bucket] || 0) + 1;
    if (group.examples.length < 5) {
      group.examples.push({ itemId: item.id, city: item.city_name || '', bucket });
    }
    groups.set(key, group);
    return groups;
  }, new Map());
const cachedPlacesByCity = placeSnapshot.docs.reduce((counts, document) => {
  const atlasId = String(document.data().atlas_id || '');
  if (cities.has(atlasId)) counts.set(atlasId, (counts.get(atlasId) || 0) + 1);
  return counts;
}, new Map());
const cacheCoverage = [...cities.values()].reduce((summary, city) => {
  const count = cachedPlacesByCity.get(city.id) || 0;
  if (count === 0) summary.none += 1;
  else if (count < 10) summary.belowTen += 1;
  else summary.tenOrMore += 1;
  summary.total += count;
  return summary;
}, { none: 0, belowTen: 0, tenOrMore: 0, total: 0 });
const result = {
  projectId,
  cities: cities.size,
  buckets: buckets.length,
  expectedCells: cities.size * buckets.length,
  bulkBoards: boardSnapshot.size,
  relevantCellsWithBoards: cells.size,
  completeCells: Object.values(coverage).reduce((sum, value) => sum + value.complete, 0),
  missingCells: missing.length,
  invalidBoards: invalid.length,
  duplicateCells: duplicates.length,
  orphanBoards: orphanBoards.length,
  listingDocuments: listingSnapshot.size,
  coverage,
  jobsByStatus: jobs.reduce((counts, job) => ({ ...counts, [job.status || 'unknown']: (counts[job.status || 'unknown'] || 0) + 1 }), {}),
  itemsByStatus: items.reduce((counts, item) => ({ ...counts, [item.status || 'unknown']: (counts[item.status || 'unknown'] || 0) + 1 }), {}),
  cachedCityPlaces: {
    documents: placeSnapshot.size,
    ...cacheCoverage,
  },
  cachedCandidateSets: candidateSetSnapshot.size,
  latestJobs,
  latestGeneratedBoards,
  failureGroups: [...failureGroups.values()].sort((left, right) => right.count - left.count),
  missing: concise ? missing.slice(0, 25) : missing,
  missingTruncated: concise && missing.length > 25 ? missing.length - 25 : 0,
  invalid: invalid.slice(0, 100),
  duplicates,
  orphanBoards: orphanBoards.slice(0, 100),
};
console.log(JSON.stringify(result, null, 2));
process.exit(0);
