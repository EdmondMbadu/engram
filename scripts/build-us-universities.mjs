#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const inputPath = process.argv[2];
const outputDirectory = process.argv[3] || path.resolve('data/universities');
const enrichImages = process.argv.includes('--enrich-images');
if (!inputPath) {
  console.error('Usage: node scripts/build-us-universities.mjs <scorecard.csv> [output-dir] [--enrich-images]');
  process.exit(1);
}

const SOURCE_URL = 'https://collegescorecard.ed.gov/data/';
const SOURCE_FETCHED_AT = '2026-08-11T00:00:00.000Z';
const COHORT_VERSION = 'us-doe-scorecard-featured-500-2026.1';
const DATA_YEAR = 2026;

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

function nullableNumber(value) {
  if (!value || ['NULL', 'PrivacySuppressed', 'PS', 'NA'].includes(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedDomain(raw) {
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function percentile(values, value, inverse = false) {
  if (value === null || values.length < 2) return 0.35;
  let below = 0;
  for (const candidate of values) if (candidate <= value) below += 1;
  const rank = below / values.length;
  return inverse ? 1 - rank : rank;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function properWebsite(raw) {
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

async function wikipediaSummary(name) {
  const title = encodeURIComponent(name.replaceAll(' ', '_'));
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`, {
    headers: { 'User-Agent': 'LivingWikiUniversityCatalog/1.0 (jim.walker@mindpalace.com)' },
  });
  if (!response.ok) return null;
  const data = await response.json();
  const description = String(data.description || '').toLowerCase();
  const acceptable = /(universit|college|institute|school|academy)/.test(description);
  if (!acceptable) return null;
  return {
    hero_url: data.originalimage?.source || data.thumbnail?.source || null,
    hero_source_page: data.content_urls?.desktop?.page || null,
  };
}

function titleTokens(value) {
  return new Set(String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((token) => token.length > 2 && !['the', 'and'].includes(token)));
}

function titleSimilarity(expected, candidate) {
  const expectedTokens = titleTokens(expected);
  const candidateTokens = titleTokens(candidate);
  if (!expectedTokens.size || !candidateTokens.size) return 0;
  const intersection = [...expectedTokens].filter((token) => candidateTokens.has(token)).length;
  return intersection / Math.max(expectedTokens.size, candidateTokens.size);
}

async function wikipediaSearch(record) {
  const query = encodeURIComponent(`"${record.official_name}" ${record.city} ${record.state}`);
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${query}&gsrlimit=4&gsrnamespace=0&prop=pageimages%7Cinfo&piprop=original%7Cthumbnail&pithumbsize=1200&inprop=url`;
  const response = await fetch(url, { headers: { 'User-Agent': 'LivingWikiUniversityCatalog/1.0 (jim.walker@mindpalace.com)' } });
  if (!response.ok) return null;
  const data = await response.json();
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 99) - (b.index || 99));
  const match = pages
    .map((page) => ({ page, score: titleSimilarity(record.official_name, page.title) }))
    .sort((a, b) => b.score - a.score)[0];
  if (!match || match.score < 0.62) return null;
  const heroUrl = match.page.original?.source || match.page.thumbnail?.source || null;
  if (!heroUrl) return null;
  return { hero_url: heroUrl, hero_source_page: match.page.fullurl || null };
}

async function wikimediaCommonsSearch(record) {
  const query = encodeURIComponent(`"${record.official_name}" campus`);
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${query}&gsrlimit=6&gsrnamespace=6&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=1400`;
  const response = await fetch(url, { headers: { 'User-Agent': 'LivingWikiUniversityCatalog/1.0 (jim.walker@mindpalace.com)' } });
  if (!response.ok) return null;
  const data = await response.json();
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 99) - (b.index || 99));
  for (const page of pages) {
    const image = page.imageinfo?.[0];
    const mime = String(image?.mime || '');
    const score = titleSimilarity(record.official_name, page.title);
    if (!image || !/^image\/(?:jpeg|png|webp)$/i.test(mime) || score < 0.45) continue;
    return {
      hero_url: image.thumburl || image.url || null,
      hero_source_page: image.descriptionurl || null,
    };
  }
  return null;
}

async function officialWebsiteHero(record) {
  if (!record.website) return null;
  const response = await fetch(record.website, {
    redirect: 'follow',
    signal: AbortSignal.timeout(6000),
    headers: { 'User-Agent': 'Mozilla/5.0 LivingWikiUniversityCatalog/1.0' },
  });
  if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html')) return null;
  const html = (await response.text()).slice(0, 750_000);
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
  ];
  const raw = patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean);
  if (!raw) return null;
  try {
    const url = new URL(raw.replaceAll('&amp;', '&'), response.url).toString();
    return { hero_url: url, hero_source_page: response.url };
  } catch {
    return null;
  }
}

async function enrichVisuals(records) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < records.length) {
      const index = cursor++;
      const record = records[index];
      const domain = normalizedDomain(record.website);
      record.logo_url = domain
        ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`
        : null;
      record.logo_source_page = record.website;
      try {
        const summary = await wikipediaSummary(record.official_name)
          || await wikipediaSearch(record)
          || await wikimediaCommonsSearch(record);
        const officialHero = summary ? null : await officialWebsiteHero(record);
        record.hero_url = summary?.hero_url || officialHero?.hero_url || record.logo_url;
        record.hero_source_page = summary?.hero_source_page || officialHero?.hero_source_page || record.website;
        record.hero_match = summary?.hero_url
          ? 'wikimedia_verified_title'
          : officialHero?.hero_url
            ? 'official_website_open_graph'
            : 'official_site_mark_fallback';
      } catch {
        record.hero_url = record.logo_url;
        record.hero_source_page = record.website;
        record.hero_match = 'official_site_mark_fallback';
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}

const stream = fs.createReadStream(inputPath, { encoding: 'utf8' });
const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
let headers = null;
let indexes = null;
const candidates = [];
const requestedColumns = [
  'UNITID', 'OPEID', 'INSTNM', 'CITY', 'STABBR', 'ACCREDAGENCY', 'INSTURL', 'MAIN', 'PREDDEG',
  'HIGHDEG', 'CONTROL', 'LATITUDE', 'LONGITUDE', 'ADM_RATE', 'UGDS', 'CURROPER', 'DISTANCEONLY',
  'NPT4_PUB', 'NPT4_PRIV', 'C150_4', 'RET_FT4', 'MD_EARN_WNE_P10',
];

for await (const line of lines) {
  if (!headers) {
    headers = parseCsvLine(line.replace(/^\uFEFF/, ''));
    indexes = Object.fromEntries(requestedColumns.map((column) => [column, headers.indexOf(column)]));
    const missing = requestedColumns.filter((column) => indexes[column] < 0);
    if (missing.length) throw new Error(`Scorecard columns missing: ${missing.join(', ')}`);
    continue;
  }
  const row = parseCsvLine(line);
  const get = (column) => row[indexes[column]] ?? '';
  const current = nullableNumber(get('CURROPER')) === 1;
  const mainCampus = nullableNumber(get('MAIN')) === 1;
  const degreeLevel = nullableNumber(get('PREDDEG'));
  const controlCode = nullableNumber(get('CONTROL'));
  const enrollment = nullableNumber(get('UGDS'));
  const distanceOnly = nullableNumber(get('DISTANCEONLY')) === 1;
  if (!current || !mainCampus || distanceOnly || degreeLevel === null || degreeLevel < 3 || ![1, 2].includes(controlCode) || enrollment === null || enrollment < 500) continue;
  const website = properWebsite(get('INSTURL'));
  candidates.push({
    unit_id: get('UNITID'),
    ope_id: get('OPEID') || null,
    official_name: get('INSTNM'),
    city: get('CITY'),
    state: get('STABBR'),
    website,
    accreditation_agency: get('ACCREDAGENCY') || null,
    control: controlCode === 1 ? 'Public' : 'Private nonprofit',
    highest_degree: ({ 1: 'Certificate', 2: 'Associate degree', 3: 'Bachelor degree', 4: 'Graduate degree' })[nullableNumber(get('HIGHDEG'))] || null,
    latitude: nullableNumber(get('LATITUDE')),
    longitude: nullableNumber(get('LONGITUDE')),
    undergraduate_enrollment: Math.round(enrollment),
    admission_rate: nullableNumber(get('ADM_RATE')),
    completion_rate: nullableNumber(get('C150_4')),
    retention_rate: nullableNumber(get('RET_FT4')),
    average_net_price: nullableNumber(controlCode === 1 ? get('NPT4_PUB') : get('NPT4_PRIV')),
    median_earnings_10_year: nullableNumber(get('MD_EARN_WNE_P10')),
  });
}

const measureValues = (field) => candidates.map((record) => record[field]).filter((value) => value !== null).sort((a, b) => a - b);
const distributions = {
  completion_rate: measureValues('completion_rate'),
  retention_rate: measureValues('retention_rate'),
  median_earnings_10_year: measureValues('median_earnings_10_year'),
  average_net_price: measureValues('average_net_price'),
  undergraduate_enrollment: measureValues('undergraduate_enrollment'),
};

for (const record of candidates) {
  const completion = percentile(distributions.completion_rate, record.completion_rate);
  const retention = percentile(distributions.retention_rate, record.retention_rate);
  const earnings = percentile(distributions.median_earnings_10_year, record.median_earnings_10_year);
  const affordability = percentile(distributions.average_net_price, record.average_net_price, true);
  const scale = percentile(distributions.undergraduate_enrollment, record.undergraduate_enrollment);
  const dataCompleteness = ['completion_rate', 'retention_rate', 'median_earnings_10_year', 'average_net_price']
    .filter((field) => record[field] !== null).length / 4;
  record.cohort_score = Number((100 * (0.35 * completion + 0.15 * retention + 0.25 * earnings + 0.15 * affordability + 0.05 * scale + 0.05 * dataCompleteness)).toFixed(2));
}

const featured = candidates
  .sort((a, b) => b.cohort_score - a.cohort_score || a.official_name.localeCompare(b.official_name))
  .slice(0, 500)
  .map((record, index) => ({
    ...record,
    data_year: DATA_YEAR,
    cohort_rank: index + 1,
    cohort_version: COHORT_VERSION,
    source_url: SOURCE_URL,
    source_fetched_at: SOURCE_FETCHED_AT,
    hero_url: null,
    logo_url: null,
    hero_source_page: null,
    logo_source_page: record.website,
    hero_match: 'not_enriched',
    description: `${record.official_name} is a ${record.control.toLowerCase()} institution in ${record.city}, ${record.state}. This LivingWiki brings together federal education data and current official sources for academics, admissions, costs, campus life, and outcomes.`,
  }));

if (enrichImages) await enrichVisuals(featured);
fs.mkdirSync(outputDirectory, { recursive: true });
const jsonPath = path.join(outputDirectory, 'us-universities-500.json');
const csvPath = path.join(outputDirectory, 'us-universities-500.csv');
const manifestPath = path.join(outputDirectory, 'README.md');
fs.writeFileSync(jsonPath, `${JSON.stringify(featured, null, 2)}\n`);
const csvHeaders = Object.keys(featured[0]).filter((key) => key !== 'hero_match');
fs.writeFileSync(csvPath, `${csvHeaders.join(',')}\n${featured.map((record) => csvHeaders.map((header) => csvCell(record[header])).join(',')).join('\n')}\n`);
const exactHeroes = featured.filter((record) => record.hero_match === 'wikimedia_verified_title').length;
const officialHeroes = featured.filter((record) => record.hero_match === 'official_website_open_graph').length;
const fallbackHeroes = featured.filter((record) => record.hero_match === 'official_site_mark_fallback').length;
fs.writeFileSync(manifestPath, `# U.S. university cohort\n\n- Records: ${featured.length}\n- Cohort: \`${COHORT_VERSION}\`\n- Federal source: ${SOURCE_URL}\n- Source release: June 10, 2026\n- Built: ${SOURCE_FETCHED_AT}\n- Eligible universe: operating, main-campus, predominantly bachelor's-or-higher, public or private nonprofit U.S. institutions with at least 500 undergraduate students and not distance-only.\n- Composite: completion 35%, median earnings 25%, retention 15%, affordability 15%, undergraduate scale 5%, data completeness 5%.\n- Wikimedia verified hero images: ${exactHeroes}\n- Official-site Open Graph images: ${officialHeroes}\n- Official-site mark fallbacks: ${fallbackHeroes}\n\nThis is a transparent featured cohort, not a claim that one-dimensional ordinal rank captures every definition of “best.” Null federal values remain null; no suppressed value is inferred. Logo URLs use the institution's official web domain as a branded-site icon fallback. Every hero and logo includes its source page in the CSV/JSON.\n`);
console.log(JSON.stringify({ records: featured.length, candidates: candidates.length, wikimediaHeroes: exactHeroes, officialHeroes, fallbackHeroes, jsonPath, csvPath }, null, 2));
