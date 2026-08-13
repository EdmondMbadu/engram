#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { GoogleGenAI } = require('../functions/node_modules/@google/genai');
const { GLOBAL_UNIVERSITY_BOARD_TEMPLATES, renderUniversityBoardTitle } = require('../functions/lib/global-university-board-templates.js');
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const numberAfter = (flag, fallback, maximum) => Math.max(1, Math.min(maximum, Number.parseInt(valueAfter(flag) || String(fallback), 10)));
const apply = args.includes('--apply');
const jobId = valueAfter('--job');
const schoolLimit = numberAfter('--school-limit', 500, 500);
const universityConcurrency = numberAfter('--university-concurrency', 12, 64);
const boardConcurrency = numberAfter('--board-concurrency', 32, 128);
const model = valueAfter('--model') || 'gemini-3-flash-preview';
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const outputRoot = path.resolve(valueAfter('--output-dir') || 'artifacts/codex-university-boards');
const clean = (value, max = 2_000) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (!jobId) throw new Error('Pass --job JOB_ID.');
admin.initializeApp({ projectId });
const db = admin.firestore();

function runProcess(command, childArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, childArgs, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], ...options });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }));
  });
}

async function gcloudSecret(name) {
  const configured = clean(process.env[name], 4_000);
  if (configured) return configured;
  const result = await runProcess('gcloud', ['secrets', 'versions', 'access', 'latest', '--secret', name, '--project', projectId]);
  if (result.code !== 0 || !clean(result.stdout, 4_000)) throw new Error(`Could not access ${name}. ${clean(result.stderr, 500)}`);
  return clean(result.stdout, 4_000);
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
  required: ['subject_id', 'subject_type', 'entity_name', 'title', 'subtitle', 'notes', 'short_summary', 'evidence_claim', 'source_url', 'source_title', 'source_kind', 'source_fetched_at', 'access_notes', 'cost_status', 'under21_safe'],
  properties: {
    subject_id: { type: 'string' }, subject_type: { enum: ['place', 'tradition', 'activity', 'study_space', 'street_or_district', 'sequence_stop'] },
    entity_name: { type: 'string' }, title: { type: 'string' }, subtitle: { type: 'string' }, notes: { type: 'string' },
    short_summary: { type: 'string' }, evidence_claim: { type: 'string' }, source_url: { type: 'string' }, source_title: { type: 'string' },
    source_kind: { enum: ['university_official', 'business_official', 'government', 'student_media', 'local_media', 'cultural_institution', 'other_reliable'] },
    source_published_at: { type: 'string' }, source_fetched_at: { type: 'string' },
    latitude: { type: 'number' }, longitude: { type: 'number' }, maps_url: { type: 'string' }, access_notes: { type: 'string' },
    cost_status: { enum: ['free', 'purchase_required', 'unknown', 'not_applicable'] }, under21_safe: { type: 'boolean' },
  },
};

function responseSchema(boardCount) {
  return {
    type: 'object',
    required: ['complete', 'school_name', 'town_name', 'boards', 'warnings'],
    properties: {
      complete: { type: 'boolean' }, school_name: { type: 'string' }, town_name: { type: 'string' },
      boards: {
        type: 'array',
        items: {
          type: 'object',
          required: ['complete', 'school_name', 'town_name', 'template_id', 'title', 'description', 'icon', 'cards', 'warnings'],
          properties: {
            complete: { type: 'boolean' }, school_name: { type: 'string' }, town_name: { type: 'string' }, template_id: { type: 'string' },
            title: { type: 'string' }, description: { type: 'string' }, icon: { type: 'string' },
            cards: { type: 'array', items: cardSchema },
            warnings: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
  };
}

function generationPrompt(target, templates) {
  return [
    `Create exactly ${templates.length} LivingWiki university boards for the supplied university. Create all ${templates.length * 10} cards in one researched pass.`,
    'Use Google Search to verify current public facts and direct HTTPS source URLs. Prefer the university, libraries, dining, student affairs, campus maps, alumni/archives, government, cultural institutions, direct businesses, and established student media.',
    'Search-result pages, snippets, reviews, Reddit, directories, aggregators, and listicles are discovery only. source_url must be the direct page supporting evidence_claim.',
    'Every board must be complete=true and contain exactly 10 distinct cards. Use exactly the supplied template_id, exact_title, icon, and allowed subject types.',
    'Across the complete set, minimize duplicate subjects; never reuse the same subject within a board. Pick visually documentable named places, objects, events, traditions, or activities with an exact photo likely available through the official source, Google Places, Wikimedia Commons, or credible local/student media.',
    'Never choose generic concepts, unnamed micro-spaces, logos, bare intersections, or ambiguous namesakes. For the blocks board, entity_name must be a named map-listed destination on or beside the stated corridor; set subject_type=street_or_district and name the corridor in subtitle/notes.',
    'Keep everything under-21-safe. Exclude bars, 21+-only venues, drinking rituals, trespass, and unsafe behavior. Never invent popularity, student behavior, signature orders, tradition origins, hours, prices, access, or uniqueness.',
    'Zero Dollars requires cost_status=free and direct evidence that no purchase/admission is required. Late Night requires direct current late-hours evidence in access_notes. Traditions require documented school-specific evidence.',
    'Write useful, specific copy: notes should be 80-180 characters and action-oriented; short_summary should be distinct. Avoid rankings, “best,” “must-visit,” hidden-gem language, stereotypes, and brochure copy.',
    'Use today for source_fetched_at. Use an empty string when coordinates, maps URL, or source publication date cannot be verified. Return JSON only.',
    JSON.stringify({ current_date: new Date().toISOString().slice(0, 10), target, templates }),
  ].join('\n\n');
}

function validateSet(result, target, templates) {
  if (!result || !Array.isArray(result.boards) || result.boards.length !== templates.length) throw new Error(`Gemini returned ${result?.boards?.length || 0}/${templates.length} boards.`);
  const expected = new Map(templates.map((template) => [template.id, template]));
  const seen = new Set();
  for (const board of result.boards) {
    const template = expected.get(clean(board?.template_id, 100));
    if (!template || seen.has(template.id)) throw new Error(`Gemini returned an unknown or duplicate template: ${board?.template_id || '(missing)'}.`);
    seen.add(template.id);
    if (board?.complete !== true || !Array.isArray(board?.cards) || board.cards.length !== 10) throw new Error(`${template.id} is incomplete or does not have 10 cards.`);
    board.school_name = target.schoolName;
    board.town_name = target.townName;
    board.title = template.exactTitle;
    board.icon = template.icon;
  }
  return result;
}

let ai;
async function generateWithRetry(target, templates) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: generationPrompt(target, templates),
        config: {
          responseMimeType: 'application/json', responseJsonSchema: responseSchema(templates.length),
          tools: [{ googleSearch: {} }], temperature: 0.25, maxOutputTokens: 32_768,
          thinkingConfig: { thinkingBudget: 768 },
        },
      });
      return validateSet(JSON.parse(response.text || '{}'), target, templates);
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(1_000 * attempt * attempt + Math.floor(Math.random() * 500));
    }
  }
  throw lastError;
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
  await writeFile(path.join(schoolDir, 'gemini-input.json'), `${JSON.stringify({ target, templates }, null, 2)}\n`, 'utf8');
  process.stdout.write(`[Gemini university set] ${target.schoolName} · ${templates.length} boards\n`);
  const startedAt = Date.now();
  const boardResults = await mapPool(templates, Math.min(7, templates.length), async (template) => {
    const result = await generateWithRetry(target, [template]);
    return result.boards[0];
  });
  const failedBoard = boardResults.find((board) => board?.ok === false);
  if (failedBoard) throw new Error(`Gemini board generation failed: ${failedBoard.error}`);
  const result = {
    complete: true,
    school_name: target.schoolName,
    town_name: target.townName,
    boards: boardResults,
    warnings: [],
  };
  await writeFile(path.join(schoolDir, 'gemini-board-set.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
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
  process.stdout.write(`[Gemini university set] ${target.schoolName} generated in ${Math.round((Date.now() - startedAt) / 1000)}s\n`);
  return { ok: true, school: target.schoolName, target, prepared };
}

async function processPreparedItem(item) {
  if (!apply) return { ok: true, itemId: item.id, dryRun: true };
  const result = await runProcess(process.execPath, [
    'scripts/run-university-board-worker.mjs', '--item', item.id, '--limit', '1', '--apply', '--resume', '--artifact-only', '--generation-engine', 'gemini',
  ]);
  const summaryMatch = result.stdout.match(/\{[\s\S]*\}\s*$/);
  let summary = null;
  try { summary = summaryMatch ? JSON.parse(summaryMatch[0]) : null; } catch { /* keep process diagnostics */ }
  return { ok: result.code === 0, itemId: item.id, code: result.code, summary,
    error: result.code === 0 ? '' : clean(result.stderr || result.stdout, 1_000) };
}

const apiKey = await gcloudSecret('GEMINI_API_KEY');
ai = new GoogleGenAI({ apiKey });
const snapshot = await db.collection('board_generation_items').where('job_id', '==', jobId).get();
const queued = snapshot.docs.map((document) => ({ id: document.id, data: document.data() }))
  .filter((item) => item.data.target_kind === 'university' && item.data.generation_engine === 'codex_local' && item.data.status === 'queued');
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
const generated = await mapPool(schools, universityConcurrency, generateSchoolSet);
const prepared = generated.flatMap((result) => result?.ok ? result.prepared : []);
const processed = await mapPool(prepared, boardConcurrency, processPreparedItem);
const created = processed.filter((result) => result?.summary?.created > 0).length;
const rejected = processed.filter((result) => result?.summary?.rejected > 0 || !result?.ok).length;
process.stdout.write(`${JSON.stringify({
  ok: true, apply, model, schoolCount: schools.length, universityConcurrency, boardConcurrency,
  generatedSchoolCount: generated.filter((result) => result?.ok).length,
  generationFailures: generated.filter((result) => !result?.ok), preparedBoardCount: prepared.length,
  processedBoardCount: processed.length, created, rejected, elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
}, null, 2)}\n`);
await admin.app().delete();
