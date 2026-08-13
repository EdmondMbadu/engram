#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  fetchBitmap,
  officialUniversitySiteCandidates,
  relatedPageImageCandidates,
  universityCampusFallbackCandidates,
  uploadBitmap,
} from './lib/university-board-images.mjs';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { GLOBAL_UNIVERSITY_BOARD_TEMPLATES, renderUniversityBoardTitle } = require('../functions/lib/global-university-board-templates.js');
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const numberAfter = (flag, fallback, maximum) => Math.max(1, Math.min(maximum, Number.parseInt(valueAfter(flag) || String(fallback), 10)));
const apply = args.includes('--apply');
const retryFailed = args.includes('--retry-failed');
const jobId = valueAfter('--job');
const schoolLimit = numberAfter('--school-limit', 500, 500);
const universityConcurrency = numberAfter('--university-concurrency', 12, 64);
const boardConcurrency = numberAfter('--board-concurrency', 32, 128);
const generationTimeoutMinutes = numberAfter('--generation-timeout-minutes', 18, 60);
const templateConcurrency = numberAfter('--template-concurrency', 7, 7);
const codexModel = valueAfter('--codex-model');
const codexReasoningEffort = valueAfter('--codex-reasoning-effort');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
const outputRoot = path.resolve(valueAfter('--output-dir') || 'artifacts/codex-university-boards');
const clean = (value, max = 2_000) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const knownCodexBinary = '/Applications/ChatGPT.app/Contents/Resources/codex';
const hash = (value, length = 28) => createHash('sha256').update(String(value)).digest('hex').slice(0, length);

if (!jobId) throw new Error('Pass --job JOB_ID.');
admin.initializeApp({ projectId });
const db = admin.firestore();

function runProcess(command, childArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, childArgs, {
      cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
      env: { ...process.env, OPENAI_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', ...(options.env || {}) },
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    let timedOut = false;
    const timeoutMs = Number(options.timeoutMs) || 0;
    const timer = timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill('SIGINT');
      setTimeout(() => child.kill('SIGTERM'), 5_000).unref();
    }, timeoutMs) : null;
    child.on('error', reject);
    child.on('exit', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, timedOut, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    });
  });
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

async function mapPool(values, concurrency, mapper) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      try { results[index] = await mapper(values[index], index); }
      catch (error) { results[index] = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function targetFromItems(items) {
  const first = items[0].data;
  return {
    atlasId: clean(first.atlas_id, 180), schoolName: clean(first.school_name, 180),
    shortSchoolName: clean(first.short_school_name || first.school_name, 180), townName: clean(first.town_name, 120),
    state: clean(first.state, 40), countryCode: clean(first.country_code, 20) || 'US',
    website: clean(first.website), latitude: Number.isFinite(Number(first.latitude)) ? Number(first.latitude) : null,
    longitude: Number.isFinite(Number(first.longitude)) ? Number(first.longitude) : null,
  };
}

const cardSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['subject_id', 'subject_type', 'entity_name', 'title', 'subtitle', 'notes', 'short_summary', 'evidence_claim', 'source_url', 'source_title', 'source_kind', 'source_published_at', 'source_fetched_at', 'latitude', 'longitude', 'maps_url', 'access_notes', 'cost_status', 'under21_safe'],
  properties: {
    subject_id: { type: 'string' }, subject_type: { enum: ['place', 'tradition', 'activity', 'study_space', 'street_or_district', 'sequence_stop'] },
    entity_name: { type: 'string' }, title: { type: 'string' }, subtitle: { type: 'string' }, notes: { type: 'string' },
    short_summary: { type: 'string' }, evidence_claim: { type: 'string' }, source_url: { type: 'string' }, source_title: { type: 'string' },
    source_kind: { enum: ['university_official', 'business_official', 'government', 'student_media', 'local_media', 'cultural_institution', 'other_reliable'] },
    source_published_at: { type: ['string', 'null'] }, source_fetched_at: { type: 'string' },
    latitude: { type: ['number', 'null'] }, longitude: { type: ['number', 'null'] }, maps_url: { type: ['string', 'null'] }, access_notes: { type: 'string' },
    cost_status: { enum: ['free', 'purchase_required', 'unknown', 'not_applicable'] }, under21_safe: { type: 'boolean' },
  },
};

function responseSchema(boardCount) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['complete', 'school_name', 'town_name', 'boards', 'warnings'],
    properties: {
      complete: { type: 'boolean' }, school_name: { type: 'string' }, town_name: { type: 'string' },
      boards: {
        type: 'array',
        minItems: boardCount,
        maxItems: boardCount,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['complete', 'school_name', 'town_name', 'template_id', 'title', 'description', 'icon', 'cards', 'warnings'],
          properties: {
            complete: { type: 'boolean' }, school_name: { type: 'string' }, town_name: { type: 'string' }, template_id: { type: 'string' },
            title: { type: 'string' }, description: { type: 'string' }, icon: { type: 'string' },
            cards: { type: 'array', minItems: 10, maxItems: 10, items: cardSchema },
            warnings: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
  };
}

function generationPrompt(target, templates) {
  const excludedSourceUrls = templates.flatMap((template) => template.excludedSourceUrls || []);
  return [
    `Create exactly ${templates.length} LivingWiki university boards for the supplied university. Create all ${templates.length * 10} cards in one researched pass.`,
    'Use web search to verify current public facts and direct HTTPS source URLs. Prefer the university, libraries, dining, student affairs, campus maps, alumni/archives, government, cultural institutions, direct businesses, and established student media.',
    'Search-result pages, snippets, reviews, Reddit, directories, aggregators, and listicles are discovery only. source_url must be the direct page supporting evidence_claim.',
    excludedSourceUrls.length
      ? `Do not cite these URLs because the live validator found them broken: ${excludedSourceUrls.join(', ')}`
      : '',
    'Every board must be complete=true and contain exactly 10 distinct cards. Use exactly the supplied template_id, exact_title, icon, and allowed subject types.',
    'Across the complete set, minimize duplicate subjects; never reuse the same subject within a board. Pick visually documentable named places, objects, events, traditions, or activities with an exact photo likely available through the official source, Google Places, Wikimedia Commons, or credible local/student media.',
    'Never choose generic concepts, unnamed micro-spaces, logos, bare intersections, or ambiguous namesakes. For the blocks board, entity_name must be a named map-listed destination on or beside the stated corridor; set subject_type=street_or_district and name the corridor in subtitle/notes.',
    'Keep everything under-21-safe. Exclude bars, 21+-only venues, drinking rituals, trespass, and unsafe behavior. Never invent popularity, student behavior, signature orders, tradition origins, hours, prices, access, or uniqueness.',
    'Zero Dollars requires cost_status=free and direct evidence that no purchase/admission is required. Late Night requires direct current late-hours evidence in access_notes. Traditions require documented school-specific evidence.',
    'Write useful, specific copy: notes should be 80-180 characters and action-oriented; short_summary should be distinct. Avoid rankings, “best,” “must-visit,” hidden-gem language, stereotypes, and brochure copy.',
    'Use today for source_fetched_at. Use null when coordinates, maps URL, or source publication date cannot be verified. Return JSON only.',
    JSON.stringify({ current_date: new Date().toISOString().slice(0, 10), target, templates }),
  ].join('\n\n');
}

async function brokenSourceUrls(board) {
  const urls = [...new Set((board.cards || []).map((card) => clean(card?.source_url)).filter(Boolean))];
  const results = await mapPool(urls, 10, async (url) => {
    try {
      const response = await fetch(url, {
        redirect: 'follow', signal: AbortSignal.timeout(15_000),
        headers: { 'user-agent': 'LivingWiki university evidence validator/1.0' },
      });
      await response.body?.cancel();
      return { url, broken: !((response.status >= 200 && response.status < 400) || [401, 403, 405, 429].includes(response.status)) };
    } catch {
      return { url, broken: false };
    }
  });
  return results.filter((entry) => entry.broken).map((entry) => entry.url);
}

async function repairBrokenBoardSources(target, template, board, schoolDir) {
  const broken = await brokenSourceUrls(board);
  if (!broken.length) return board;
  const repairArtifact = path.join(schoolDir, `codex-${template.id}-source-repair.json`);
  const repaired = await generateWithCodex(
    target, [{ ...template, excludedSourceUrls: broken }], repairArtifact,
    path.join(schoolDir, `codex-${template.id}-source-repair.schema.json`),
    path.join(schoolDir, `codex-${template.id}-source-repair.log`),
  );
  const repairedBoard = repaired.boards[0];
  const remainingBroken = await brokenSourceUrls(repairedBoard);
  if (remainingBroken.length) throw new Error(`${template.id} still has ${remainingBroken.length} conclusive broken source URL(s) after repair.`);
  await writeFile(path.join(schoolDir, `codex-${template.id}.json`), `${JSON.stringify({
    complete: true, school_name: target.schoolName, town_name: target.townName, boards: [repairedBoard], warnings: [],
  }, null, 2)}\n`, 'utf8');
  return repairedBoard;
}

function validateSet(result, target, templates) {
  if (!result || !Array.isArray(result.boards) || result.boards.length !== templates.length) throw new Error(`Codex returned ${result?.boards?.length || 0}/${templates.length} boards.`);
  const expected = new Map(templates.map((template) => [template.id, template]));
  const seen = new Set();
  for (const board of result.boards) {
    const template = expected.get(clean(board?.template_id, 100));
    if (!template || seen.has(template.id)) throw new Error(`Codex returned an unknown or duplicate template: ${board?.template_id || '(missing)'}.`);
    seen.add(template.id);
    if (board?.complete !== true || !Array.isArray(board?.cards) || board.cards.length !== 10) throw new Error(`${template.id} is incomplete or does not have 10 cards.`);
    board.school_name = target.schoolName;
    board.town_name = target.townName;
    board.title = template.exactTitle;
    board.icon = template.icon;
  }
  return result;
}

function normalizedIdentity(value) {
  return clean(value, 200).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function overlapCount(board, boards) {
  const own = new Set((board.cards || []).map((card) => normalizedIdentity(card?.entity_name)).filter(Boolean));
  const other = new Set(boards.filter((candidate) => candidate !== board)
    .flatMap((candidate) => candidate.cards || [])
    .map((card) => normalizedIdentity(card?.entity_name)).filter(Boolean));
  return [...own].filter((identity) => other.has(identity)).length;
}

function largestLowOverlapSubset(boards) {
  const accepted = [...boards];
  const rejected = [];
  while (accepted.length > 1) {
    const ranked = accepted.map((board, index) => ({ board, index, count: overlapCount(board, accepted) }))
      .sort((left, right) => right.count - left.count
        || Number(right.board.template_id === 'college-first-weekend') - Number(left.board.template_id === 'college-first-weekend')
        || Number(right.board.template_id === 'college-campus-tour-skips') - Number(left.board.template_id === 'college-campus-tour-skips'));
    if (!ranked.length || ranked[0].count <= 4) break;
    const [removed] = accepted.splice(ranked[0].index, 1);
    rejected.push({
      ok: false,
      templateId: removed.template_id,
      error: `${removed.template_id} overlaps ${ranked[0].count} subjects with sibling boards; saved the largest compliant subset and left this rubric queued for focused repair.`,
    });
  }
  return { accepted, rejected };
}

async function generateWithCodex(target, templates, outputPath, schemaPath, logPath) {
  await writeFile(schemaPath, `${JSON.stringify(responseSchema(templates.length), null, 2)}\n`, 'utf8');
  const binary = await codexBinary();
  const childArgs = [
    'exec', '--ephemeral', '--ignore-user-config', '--enable', 'browser_use',
    '--sandbox', 'read-only', '--skip-git-repo-check', '--output-schema', schemaPath,
    '-o', outputPath,
  ];
  if (codexModel) childArgs.push('--model', codexModel);
  if (codexReasoningEffort) childArgs.push('-c', `model_reasoning_effort="${codexReasoningEffort}"`);
  childArgs.push(generationPrompt(target, templates));
  const result = await runProcess(binary, childArgs, { timeoutMs: generationTimeoutMinutes * 60_000 });
  await writeFile(logPath, `${result.stderr}\n${result.stdout}`.trimStart(), 'utf8');
  if (result.timedOut) throw new Error(`Codex exceeded the ${generationTimeoutMinutes}-minute generation timeout. See ${logPath}.`);
  if (result.code !== 0) throw new Error(`Codex exited with code ${result.code}. See ${logPath}.`);
  return validateSet(JSON.parse(await readFile(outputPath, 'utf8')), target, templates);
}

async function buildSharedImagePool(target, boards, schoolDir) {
  const poolPath = path.join(schoolDir, 'free-campus-image-pool.json');
  try {
    const existing = JSON.parse(await readFile(poolPath, 'utf8'));
    const fingerprints = new Set((existing?.images || []).map((image) => clean(image?.imageFingerprint)).filter(Boolean));
    if (existing?.target === target.atlasId && fingerprints.size >= 7) {
      return { poolPath, imageCount: existing.images.length, imagePoolReused: true };
    }
  } catch { /* build a new free pool */ }
  const sourceUrls = boards.flatMap((board) => board.cards || []).map((card) => clean(card?.source_url)).filter(Boolean);
  const [commons, official] = await Promise.all([
    universityCampusFallbackCandidates(target),
    officialUniversitySiteCandidates(target, target.website, sourceUrls.slice(0, 16)),
  ]);
  const initialCandidates = [...new Map([...commons, ...official].map((candidate) => [candidate.imageUrl, candidate])).values()];
  const related = initialCandidates.length >= 14 ? [] : (await mapPool(
    [...new Set(sourceUrls)].slice(0, 24), 8,
    (url) => relatedPageImageCandidates(url, `${target.schoolName} cited source page`),
  )).flatMap((result) => Array.isArray(result) ? result : []);
  const candidates = [...new Map([...initialCandidates, ...related].map((candidate) => [candidate.imageUrl, candidate])).values()];
  const selected = [];
  const used = new Set();
  for (let offset = 0; offset < candidates.length && selected.length < 14; offset += 8) {
    const attempts = await Promise.all(candidates.slice(offset, offset + 8).map(async (candidate) => {
      try { return { candidate, bitmap: await fetchBitmap(candidate.imageUrl) }; } catch { return null; }
    }));
    for (const attempt of attempts) {
      if (!attempt || used.has(attempt.bitmap.fingerprint)) continue;
      used.add(attempt.bitmap.fingerprint);
      selected.push(attempt);
      if (selected.length >= 14) break;
    }
  }
  if (selected.length < 7) throw new Error(`Only ${selected.length} distinct free campus images passed validation; 7 are required.`);
  const images = await mapPool(selected, 6, async ({ candidate, bitmap }, index) => {
    const storagePath = `university-image-pools/${target.atlasId}/${String(index + 1).padStart(2, '0')}-${bitmap.fingerprint.slice(0, 16)}.${bitmap.extension}`;
    const imageUrl = await uploadBitmap(admin, bitmap, storagePath, candidate, storageBucket);
    return {
      imageUrl, imageSource: candidate.provider, imageSourceUrl: candidate.sourceUrl,
      imageSourceLabel: candidate.sourceLabel, imageLicense: candidate.license || '',
      imageTitle: candidate.title || target.schoolName, imageFingerprint: bitmap.fingerprint,
      imageWidth: bitmap.dimensions.width, imageHeight: bitmap.dimensions.height,
      imageResolvedAt: new Date().toISOString(),
    };
  });
  await writeFile(poolPath, `${JSON.stringify({
    target: target.atlasId, schoolName: target.schoolName, generatedAt: new Date().toISOString(),
    mode: images.length >= 10 ? 'free-related-campus-distinct' : 'free-related-campus-limited-reuse', images,
  }, null, 2)}\n`, 'utf8');
  return { poolPath, imageCount: images.length };
}

async function generateSchoolSet(group) {
  const target = targetFromItems(group.items);
  const schoolDir = path.join(outputRoot, jobId, `school-${target.atlasId}`);
  await mkdir(schoolDir, { recursive: true });
  const itemTemplates = new Set(group.items.map((item) => clean(item.data.template_id, 100)));
  const templates = GLOBAL_UNIVERSITY_BOARD_TEMPLATES
    .filter((template) => itemTemplates.has(template.id))
    .map((template) => ({ ...template, exactTitle: renderUniversityBoardTitle(template, target.shortSchoolName, target.townName) }));
  if (templates.length !== group.items.length) throw new Error(`Template mismatch for ${target.schoolName}.`);
  await writeFile(path.join(schoolDir, 'codex-input.json'), `${JSON.stringify({ target, templates }, null, 2)}\n`, 'utf8');
  process.stdout.write(`[Free Codex university set] ${target.schoolName} · ${templates.length} boards\n`);
  const startedAt = Date.now();
  const resultPath = path.join(schoolDir, 'codex-board-set.json');
  let legacyBoards = [];
  try {
    const legacy = JSON.parse(await readFile(resultPath, 'utf8'));
    legacyBoards = Array.isArray(legacy?.boards) ? legacy.boards : [];
  } catch { /* no combined legacy artifact */ }
  const boardResults = await mapPool(templates, Math.min(templateConcurrency, templates.length), async (template) => {
    const templateArtifact = path.join(schoolDir, `codex-${template.id}.json`);
    let templateResult;
    try {
      templateResult = validateSet(JSON.parse(await readFile(templateArtifact, 'utf8')), target, [template]);
    } catch {
      const legacyBoard = legacyBoards.find((board) => board?.template_id === template.id);
      if (legacyBoard) {
        templateResult = validateSet({
          complete: true, school_name: target.schoolName, town_name: target.townName,
          boards: [legacyBoard], warnings: [],
        }, target, [template]);
      } else {
        templateResult = await generateWithCodex(
          target, [template], templateArtifact,
          path.join(schoolDir, `codex-${template.id}.schema.json`),
          path.join(schoolDir, `codex-${template.id}.log`),
        );
      }
    }
    return repairBrokenBoardSources(target, template, templateResult.boards[0], schoolDir);
  });
  const generatedBoards = boardResults.filter((board) => board && board.ok !== false);
  const generatedFailures = boardResults.filter((board) => board?.ok === false);
  const overlapSelection = largestLowOverlapSubset(generatedBoards);
  const successfulBoards = overlapSelection.accepted;
  const generationFailures = [...generatedFailures, ...overlapSelection.rejected];
  if (!successfulBoards.length) throw new Error(`All ${templates.length} template generation pass(es) failed.`);
  const result = {
    complete: successfulBoards.length === templates.length,
    school_name: target.schoolName, town_name: target.townName,
    boards: successfulBoards,
    warnings: generationFailures.map((failure) => failure.error),
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const imagePool = await buildSharedImagePool(target, result.boards, schoolDir);
  const byTemplate = new Map(result.boards.map((board) => [board.template_id, board]));
  const prepared = [];
  for (const item of group.items) {
    const board = byTemplate.get(clean(item.data.template_id, 100));
    if (!board) continue;
    const itemDir = path.join(outputRoot, jobId, item.id);
    await mkdir(itemDir, { recursive: true });
    await writeFile(path.join(itemDir, 'board.json'), `${JSON.stringify(board, null, 2)}\n`, 'utf8');
    prepared.push(item);
  }
  process.stdout.write(`[Free Codex university set] ${target.schoolName} generated in ${Math.round((Date.now() - startedAt) / 1000)}s\n`);
  return { ok: true, school: target.schoolName, target, prepared, generationFailures, ...imagePool };
}

async function processPreparedItem(prepared) {
  const { item, poolPath } = prepared;
  if (!apply) return { ok: true, itemId: item.id, dryRun: true };
  const result = await runProcess(process.execPath, [
    'scripts/run-university-board-worker.mjs', '--item', item.id, '--limit', '1', '--apply', '--resume', '--artifact-only', '--free-images', '--shared-image-pool', poolPath, '--generation-engine', 'codex_local',
  ]);
  const summaryMatch = result.stdout.match(/\{[\s\S]*\}\s*$/);
  let summary = null;
  try { summary = summaryMatch ? JSON.parse(summaryMatch[0]) : null; } catch { /* keep process diagnostics */ }
  return { ok: result.code === 0, itemId: item.id, code: result.code, summary,
    error: result.code === 0 ? '' : clean(result.stderr || result.stdout, 1_000) };
}

const snapshot = await db.collection('board_generation_items').where('job_id', '==', jobId).get();
const allItems = snapshot.docs.map((document) => ({ id: document.id, ref: document.ref, data: document.data() }))
  .filter((item) => item.data.target_kind === 'university' && item.data.generation_engine === 'codex_local');
const retryItems = retryFailed ? allItems.filter((item) => item.data.status === 'failed') : [];
if (retryItems.length) {
  for (let offset = 0; offset < retryItems.length; offset += 400) {
    const batch = db.batch();
    for (const item of retryItems.slice(offset, offset + 400)) batch.update(item.ref, {
      status: 'queued', worker_status: 'retry_queued', error_code: '', error_message: '',
      completed_at: admin.firestore.FieldValue.delete(), updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }
  await db.collection('board_generation_jobs').doc(jobId).update({
    completed_count: admin.firestore.FieldValue.increment(-retryItems.length),
    failed_count: admin.firestore.FieldValue.increment(-retryItems.length),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}
const queued = allItems.filter((item) => item.data.status === 'queued' || (retryFailed && item.data.status === 'failed'));
const grouped = new Map();
for (const item of queued) {
  const atlasId = clean(item.data.atlas_id, 180);
  if (!grouped.has(atlasId)) grouped.set(atlasId, []);
  grouped.get(atlasId).push(item);
}
const schools = [...grouped.entries()].map(([atlasId, items]) => ({ atlasId, items }))
  .sort((left, right) => clean(left.items[0].data.school_name).localeCompare(clean(right.items[0].data.school_name)))
  .slice(0, schoolLimit);
if (!schools.length) throw new Error('No queued university boards are available.');
const startedAt = Date.now();
const generated = await mapPool(schools, universityConcurrency, async (school) => {
  const result = await generateSchoolSet(school);
  if (!result?.ok) return result;
  const processed = await mapPool(
    result.prepared.map((item) => ({ item, poolPath: result.poolPath })),
    Math.min(boardConcurrency, result.prepared.length),
    processPreparedItem,
  );
  return { ...result, processed };
});
const prepared = generated.flatMap((result) => result?.ok ? result.prepared : []);
const processed = generated.flatMap((result) => result?.ok ? result.processed : []);
const created = processed.filter((result) => result?.summary?.created > 0).length;
const rejected = processed.filter((result) => result?.summary?.rejected > 0 || !result?.ok).length;
process.stdout.write(`${JSON.stringify({
  ok: true, apply, generationEngine: 'codex_local_free', codexModel: codexModel || 'account-default',
  codexReasoningEffort: codexReasoningEffort || 'account-default', templateConcurrency,
  paidApiCredentialsDisabled: true, schoolCount: schools.length, universityConcurrency, boardConcurrency,
  generatedSchoolCount: generated.filter((result) => result?.ok).length,
  generationFailures: generated.filter((result) => !result?.ok), preparedBoardCount: prepared.length,
  processedBoardCount: processed.length, created, rejected, elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
}, null, 2)}\n`);
await admin.app().delete();
