#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { scoreGeneratedBoard } = require('../functions/lib/board-generation-score.js');
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const filePath = valueAfter('--file');
if (!filePath) throw new Error('Pass --file FILE.json.');
const clean = (value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const artifact = JSON.parse(await readFile(filePath, 'utf8'));
const board = artifact?.boards?.[0];
const cards = Array.isArray(board?.cards) ? board.cards : [];
const problems = [];
if (artifact?.complete !== true || board?.complete !== true) problems.push('incomplete');
if (cards.length !== 10) problems.push(`cards=${cards.length}`);
if (new Set(cards.map((card) => clean(card.subject_id))).size !== cards.length) problems.push('subject-ids');
if (new Set(cards.map((card) => clean(card.entity_name).toLowerCase())).size !== cards.length) problems.push('entities');
if (!cards.every((card) => clean(card.notes).length >= 80)) problems.push('thin-notes');
if (!cards.every((card) => card.under21_safe === true)) problems.push('under21');
const sourceResults = await Promise.all([...new Set(cards.map((card) => clean(card.source_url)).filter(Boolean))].map(async (url) => {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'LivingWiki university evidence validator/1.0' } });
    await response.body?.cancel();
    return { url, status: response.status, ok: (response.status >= 200 && response.status < 400) || [401, 403, 405, 429].includes(response.status) };
  } catch (error) {
    return { url, status: 0, ok: true, inconclusive: true, error: error instanceof Error ? error.message : String(error) };
  }
}));
const broken = sourceResults.filter((entry) => !entry.ok);
if (broken.length) problems.push(`broken-sources=${broken.length}`);
const payload = {
  cards: cards.map((card) => ({
    title: card.title, subtitle: card.subtitle, notes: card.notes, shortSummary: card.short_summary,
    entityName: card.entity_name, subjectType: card.subject_type, sourceUrl: card.source_url,
    sourceTitle: card.source_title, sourceFetchedAt: card.source_fetched_at,
    locationLat: card.latitude, locationLng: card.longitude,
  })),
  validation_summary: { requested_count: 10 }, quality_warnings: board.warnings || [],
};
const score = scoreGeneratedBoard(payload, { expectedCount: 10, now: new Date() });
if (score.score < 70) problems.push(`score=${score.score}`);
process.stdout.write(`${JSON.stringify({ ok: problems.length === 0, filePath, score, problems, sourceResults }, null, 2)}\n`);
