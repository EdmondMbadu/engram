#!/usr/bin/env node

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const projectId = process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a';
const ownerUid = process.env.UNIVERSITY_OWNER_UID;
const inputPath = process.argv[2] || 'data/universities/us-universities-500.json';
const apply = process.argv.includes('--apply');
if (!ownerUid) throw new Error('Set UNIVERSITY_OWNER_UID to the platform catalog owner.');

admin.initializeApp({ projectId });
const db = admin.firestore();
const rows = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!Array.isArray(rows) || rows.length !== 500) throw new Error(`Expected exactly 500 rows; found ${rows?.length ?? 0}.`);
const nameCounts = rows.reduce((counts, row) => counts.set(row.official_name, (counts.get(row.official_name) || 0) + 1), new Map());

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'university';
}

function uniqueSlug(base, suffix) {
  const cleanSuffix = slugify(suffix).slice(0, 16);
  return `${base.slice(0, Math.max(1, 47 - cleanSuffix.length))}-${cleanSuffix}`;
}

const existing = await db.collection('atlases').where('is_public', '==', true).get();
const existingSlugs = new Set(existing.docs.map((doc) => String(doc.data().slug || '')).filter(Boolean));
const existingUnitIds = new Set(existing.docs.map((doc) => String(doc.data().university_config?.unit_id || '')).filter(Boolean));
const pending = [];
let skipped = 0;

for (const row of rows) {
  if (existingUnitIds.has(row.unit_id)) {
    skipped += 1;
    continue;
  }
  let slug = slugify(row.official_name);
  if (existingSlugs.has(slug)) slug = uniqueSlug(slug, row.state);
  if (existingSlugs.has(slug)) slug = uniqueSlug(slugify(row.official_name), `${row.state}-${row.unit_id}`);
  existingSlugs.add(slug);
  existingUnitIds.add(row.unit_id);
  const atlasRef = db.collection('atlases').doc();
  const heroProvider = row.hero_match === 'wikimedia_verified_title'
    ? 'wikimedia'
    : row.hero_match === 'official_website_open_graph'
      ? 'official_website'
      : 'fallback';
  const location = `${row.city}, ${row.state}`;
  const displayName = nameCounts.get(row.official_name) > 1 ? `${row.official_name} (${row.state})` : row.official_name;
  pending.push({ atlasRef, data: {
    user_id: ownerUid,
    wiki_type: 'university',
    response_perspective: 'auto',
    name: displayName,
    slug,
    description: row.description,
    landing_summary: `A source-aware guide to ${row.official_name}: academics, admissions, cost, campus life, outcomes, and current institutional information.`,
    is_public: true,
    logo_url: row.logo_url,
    hero_url: row.hero_url,
    video_url: null,
    cover_color: '#173f35',
    default_answer_mode: 'internet',
    city_config: null,
    university_config: {
      enabled: true,
      unit_id: row.unit_id,
      ope_id: row.ope_id,
      official_name: row.official_name,
      city: row.city,
      state: row.state,
      country_code: 'US',
      website: row.website,
      accreditation_agency: row.accreditation_agency,
      control: row.control,
      highest_degree: row.highest_degree,
      latitude: row.latitude,
      longitude: row.longitude,
      undergraduate_enrollment: row.undergraduate_enrollment,
      admission_rate: row.admission_rate,
      completion_rate: row.completion_rate,
      retention_rate: row.retention_rate,
      average_net_price: row.average_net_price,
      median_earnings_10_year: row.median_earnings_10_year,
      data_year: row.data_year,
      cohort_rank: row.cohort_rank,
      cohort_score: row.cohort_score,
      cohort_version: row.cohort_version,
      source_url: row.source_url,
      source_fetched_at: row.source_fetched_at,
      hero_source: { url: row.hero_url, page_url: row.hero_source_page, provider: heroProvider, title: row.official_name, license: null, fetched_at: row.source_fetched_at },
      logo_source: { url: row.logo_url, page_url: row.logo_source_page, provider: 'official_website', title: `${row.official_name} website mark`, license: null, fetched_at: row.source_fetched_at },
    },
    chat_guide: {
      name: `${row.official_name} Guide`,
      label: `Ask about ${row.official_name} academics, admissions, costs, campus life, outcomes, and current news.`,
      image_url: row.logo_url,
      banner_url: row.hero_url,
    },
    persona_prompt: [
      `You are the LivingWiki guide for ${row.official_name} in ${location}.`,
      'Use official institutional sources and U.S. Department of Education data first.',
      'Separate verified facts from interpretation, state the data year for statistics, and never invent rankings, programs, costs, admissions figures, or campus details.',
      'Be concise, welcoming, and useful to prospective students, current students, families, alumni, faculty, and researchers.',
    ].join(' '),
    import_batch_id: row.cohort_version,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  }});
}

console.log(JSON.stringify({ projectId, input: rows.length, existingUniversities: skipped, toCreate: pending.length, mode: apply ? 'apply' : 'dry-run' }, null, 2));
if (apply) {
  for (let offset = 0; offset < pending.length; offset += 250) {
    const batch = db.batch();
    for (const item of pending.slice(offset, offset + 250)) batch.set(item.atlasRef, item.data);
    await batch.commit();
    console.log(`Committed ${Math.min(offset + 250, pending.length)} of ${pending.length}.`);
  }
}
process.exit(0);
