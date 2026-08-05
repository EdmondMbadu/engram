#!/usr/bin/env node

const fs = require('node:fs');
const admin = require('firebase-admin');
const {
  buildBoardWizardVideoSearchQuery,
  buildBoardWizardRelatedVideoSearchQuery,
  buildBoardWizardYouTubeApiQuery,
  scoreBoardWizardVideoCandidate,
  parseIso8601DurationSeconds,
  youtubeVideoIdFromReference,
} = require('../lib/board-wizard-video.js');
const { createYouTubeEmbedVerifier } = require('../lib/youtube-embed-verifier.js');

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'living-atlas-7622a';
const boardId = String(process.argv[2] || '').trim();
const keyFile = String(process.argv[3] || '').trim();
const shouldApply = process.argv.includes('--apply');
const shouldReplace = process.argv.includes('--replace');

if (!/^[A-Za-z0-9_-]{8,160}$/.test(boardId) || !keyFile) {
  console.error('Usage: npm run repair:board-videos -- <board-id> <youtube-api-key-file> [--replace] [--apply]');
  process.exit(2);
}

const apiKey = fs.readFileSync(keyFile, 'utf8').trim();
if (apiKey.length < 20) {
  console.error('The YouTube API key file is missing or invalid.');
  process.exit(2);
}

if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
const boardRef = db.collection('boards').doc(boardId);
const embedVerifier = createYouTubeEmbedVerifier(5);

function stringValue(value, max = 500) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function normalizeCard(card) {
  return {
    title: stringValue(card.title, 120),
    subtitle: stringValue(card.subtitle, 180),
    notes: stringValue(card.notes, 800),
    entityName: stringValue(card.entityName, 120),
    entityType: stringValue(card.entityType, 40),
    imageContext: stringValue(card.imageContext, 180),
    tags: Array.isArray(card.tags) ? card.tags.map((tag) => stringValue(tag, 40)).filter(Boolean).slice(0, 8) : [],
    videoIntent: card.videoIntent === true,
    videoSearchQuery: stringValue(card.videoSearchQuery, 180),
  };
}

async function mapWithConcurrency(values, limit, mapper) {
  const output = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      output[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function youtubeJson(path, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  url.searchParams.set('key', apiKey);
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'LivingWiki/1.0 board-video-repair' },
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json();
  if (!response.ok || data.error?.message) {
    throw new Error(`YouTube ${path} failed (${response.status}): ${data.error?.message || 'unknown error'}`);
  }
  return data;
}

async function resolveCard(card, boardContext) {
  const normalized = normalizeCard(card);
  const query = buildBoardWizardVideoSearchQuery(normalized, boardContext);
  const primary = await resolveQuery(normalized, boardContext, query, false);
  if (primary) return { query, match: primary };
  const relatedQuery = buildBoardWizardRelatedVideoSearchQuery(normalized);
  const related = await resolveQuery(normalized, boardContext, relatedQuery, true);
  return { query: relatedQuery, match: related };
}

async function resolveQuery(normalized, boardContext, query, allowRelated) {
  const searchQuery = allowRelated ? query : buildBoardWizardYouTubeApiQuery(query);
  let candidates = [];
  try {
    const search = await youtubeJson('search', {
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      safeSearch: 'moderate',
      maxResults: '10',
      q: searchQuery,
    });
    const ids = Array.from(new Set((search.items || [])
      .map((item) => youtubeVideoIdFromReference(item.id?.videoId))
      .filter(Boolean)))
      .slice(0, 10);
    if (ids.length) {
      const details = await youtubeJson('videos', {
        part: 'snippet,status,contentDetails',
        id: ids.join(','),
      });
      candidates = (details.items || []).map((item) => {
        const thumbnails = item.snippet?.thumbnails || {};
        return {
          videoId: youtubeVideoIdFromReference(item.id),
          title: stringValue(item.snippet?.title, 300),
          channelTitle: stringValue(item.snippet?.channelTitle, 200),
          thumbnailUrl: stringValue(
            thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url
              || thumbnails.medium?.url || thumbnails.default?.url,
            2000,
          ),
          durationSeconds: parseIso8601DurationSeconds(item.contentDetails?.duration),
          embeddable: item.status?.embeddable === true && item.status?.privacyStatus === 'public',
        };
      }).filter((candidate) => candidate.videoId && candidate.embeddable);
    }
  } catch (error) {
    if (!String(error).includes('(429)')) throw error;
  }
  if (!candidates.length) candidates = await searchYouTubeWeb(searchQuery);
  const ranked = candidates.map((candidate) => ({
    candidate,
    score: scoreBoardWizardVideoCandidate(normalized, boardContext, candidate, { allowRelated }),
  })).filter((entry) => entry.score >= 55).sort((left, right) => right.score - left.score);
  for (const entry of ranked.slice(0, 8)) {
    if (await embedVerifier.isPlayable(entry.candidate.videoId)) return entry;
  }
  return null;
}

async function searchYouTubeWeb(query) {
  const url = new URL('https://www.youtube.com/results');
  url.searchParams.set('search_query', query);
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return [];
  const html = await response.text();
  const ids = Array.from(new Set(Array.from(
    html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g),
    (match) => match[1],
  ))).slice(0, 10);
  const candidates = await Promise.all(ids.map(async (videoId) => {
    try {
      const oembed = new URL('https://www.youtube.com/oembed');
      oembed.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
      oembed.searchParams.set('format', 'json');
      const result = await fetch(oembed, { signal: AbortSignal.timeout(5_000) });
      if (!result.ok) return null;
      const data = await result.json();
      if (!data.title || !data.author_name) return null;
      return {
        videoId,
        title: stringValue(data.title, 300),
        channelTitle: stringValue(data.author_name, 200),
        thumbnailUrl: stringValue(data.thumbnail_url, 2000),
        durationSeconds: 0,
        embeddable: true,
      };
    } catch {
      return null;
    }
  }));
  return candidates.filter(Boolean);
}

async function main() {
  const snapshot = await boardRef.get();
  if (!snapshot.exists) throw new Error(`Board ${boardId} was not found.`);
  const board = snapshot.data() || {};
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const boardContext = [board.title, board.description].map((value) => stringValue(value, 500)).filter(Boolean).join(' · ');
  const targets = cards.filter((card) => card?.videoIntent === true
    && (shouldReplace || !youtubeVideoIdFromReference(card.youtubeVideoId)));
  if (!targets.length) {
    console.log('No video-intent cards require repair.');
    return;
  }

  const resolved = await mapWithConcurrency(targets, 5, async (card) => {
    const result = await resolveCard(card, boardContext);
    const entry = { cardId: card.id, title: card.title, ...result };
    console.log(result.match
      ? `MATCH ${card.title} -> ${result.match.candidate.title} [${result.match.candidate.channelTitle}] score=${result.match.score}`
      : `MISS  ${card.title} (${result.query})`);
    return entry;
  });

  const matches = new Map(resolved.filter((entry) => entry.match).map((entry) => [entry.cardId, entry.match]));
  if (!shouldApply) {
    console.log(`Dry run complete: ${matches.size}/${targets.length} verified matches. Add --apply to persist them.`);
    return;
  }
  if (!matches.size) throw new Error('No verified matches were found; the board was not changed.');

  const verifiedAt = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const latestSnapshot = await transaction.get(boardRef);
    const latest = latestSnapshot.data() || {};
    const latestCards = Array.isArray(latest.cards) ? latest.cards : [];
    const nextCards = latestCards.map((card) => {
      const entry = matches.get(card?.id);
      if (!entry) return card;
      const candidate = entry.candidate;
      return {
        ...card,
        videoIntent: true,
        youtubeVideoId: candidate.videoId,
        youtubeVideoTitle: candidate.title,
        youtubeChannelTitle: candidate.channelTitle,
        youtubeThumbnailUrl: candidate.thumbnailUrl,
        youtubeDurationSeconds: candidate.durationSeconds,
        youtubeMatchConfidence: Math.max(0, Math.min(1, Number(((entry.score - 35) / 100).toFixed(2)))),
        youtubeVerifiedAt: verifiedAt,
      };
    });
    transaction.update(boardRef, {
      cards: nextCards,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  console.log(`Applied ${matches.size}/${targets.length} verified video matches to board ${boardId}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await embedVerifier.close();
    await Promise.all(admin.apps.map((app) => app.delete()));
  });
