import chromium from '@sparticuz/chromium';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import type { Request } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import puppeteer from 'puppeteer-extra';
import { db, storage } from './firebase';
import type { MappableLocation, TravelGuideCard } from './types';

const appUrl = 'https://www.livingwiki.com';
const imageVersion = 'v1';
const playerCardVersion = 'x-player-v2';

type ShareImageKind = 'og' | 'story';

interface ShareCard {
  id: string;
  atlasId: string | null;
  atlasName: string | null;
  atlasSlug: string | null;
  question: string;
  answerPreview: string;
  title: string;
  subtitle: string;
  keyFacts: string[];
  didYouKnow: string[];
  mappableLocations: MappableLocation[];
  likeCount: number;
  updatedAt: string | null;
}

interface TravelCardShare {
  id: string;
  atlasId: string | null;
  atlasName: string | null;
  atlasSlug: string | null;
  guideTitle: string | null;
  guideSummary: string | null;
  question: string | null;
  card: TravelGuideCard;
  updatedAt: string | null;
}

interface BoardShareCard {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  spotifyArtworkUrl: string | null;
  hasSongMedia: boolean;
}

interface BoardShareQuiz {
  title: string;
  description: string;
  questionCount: number;
  leaderboardEnabled: boolean;
}

interface BoardShare {
  id: string;
  title: string;
  description: string;
  ownerName: string;
  imageUrl: string | null;
  logoUrl: string | null;
  kind: string;
  socialVideoUrl: string | null;
  socialVideoMimeType: string;
  socialVideoUpdatedAt: string | null;
  socialVideoRatio: 'vertical' | 'square' | 'landscape';
  quiz: BoardShareQuiz | null;
  cards: BoardShareCard[];
  updatedAt: string | null;
}

export async function handleAnswerCardShare(req: Request, res: Response): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.set('Allow', 'GET, HEAD').status(405).send('Method not allowed');
    return;
  }

  const parsed = parseSharePath(req.originalUrl || req.url || '');
  if (!parsed) {
    res.status(404).send('Answer card share link not found.');
    return;
  }

  const card = await loadShareCard(parsed.cardId);
  if (!card) {
    res.status(404).send('Answer card not found.');
    return;
  }

  if (parsed.kind) {
    const image = await getOrRenderShareImage(card, parsed.kind);
    res
      .status(200)
      .set('Content-Type', 'image/png')
      .set('Cache-Control', 'public, max-age=86400, s-maxage=604800')
      .send(req.method === 'HEAD' ? undefined : image);
    return;
  }

  const html = buildSharePageHtml(card);
  res
    .status(200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'public, max-age=300, s-maxage=3600')
    .send(req.method === 'HEAD' ? undefined : html);
}

export async function handleTravelCardShare(req: Request, res: Response): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.set('Allow', 'GET, HEAD').status(405).send('Method not allowed');
    return;
  }

  const parsed = parseTravelSharePath(req.originalUrl || req.url || '');
  if (!parsed) {
    res.status(404).send('Guide card share link not found.');
    return;
  }

  const share = await loadTravelCardShare(parsed.shareId);
  if (!share) {
    res.status(404).send('Guide card not found.');
    return;
  }

  if (parsed.kind) {
    const image = await getOrRenderTravelImage(share, parsed.kind);
    res
      .status(200)
      .set('Content-Type', 'image/png')
      .set('Cache-Control', 'public, max-age=86400, s-maxage=604800')
      .send(req.method === 'HEAD' ? undefined : image);
    return;
  }

  res
    .status(200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'public, max-age=300, s-maxage=3600')
    .send(req.method === 'HEAD' ? undefined : buildTravelSharePageHtml(share));
}

export async function handleBoardShare(req: Request, res: Response): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.set('Allow', 'GET, HEAD').status(405).send('Method not allowed');
    return;
  }

  const parsed = parseBoardSharePath(req.originalUrl || req.url || '');
  if (!parsed) {
    res.status(404).send('Board share link not found.');
    return;
  }

  const board = await loadBoardShare(parsed.boardId);
  if (!board) {
    res.status(404).send('Public board not found.');
    return;
  }

  if (parsed.image) {
    const image = await getOrRenderBoardShareImage(board, parsed.quiz);
    res
      .status(200)
      .set('Content-Type', 'image/png')
      .set('Cache-Control', 'public, max-age=86400, s-maxage=604800')
      .send(req.method === 'HEAD' ? undefined : image);
    return;
  }

  if (parsed.rawVideo) {
    if (!board.socialVideoUrl) {
      res.status(404).send('This board does not have a published video yet.');
      return;
    }
    await proxyBoardVideo(req, res, board);
    return;
  }

  if (parsed.video || parsed.player) {
    if (!board.socialVideoUrl) {
      res.status(404).send('This board does not have a published video yet.');
      return;
    }
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300, s-maxage=3600')
      .send(req.method === 'HEAD'
        ? undefined
        : parsed.player
          ? buildBoardVideoPlayerHtml(board)
          : buildBoardVideoSharePageHtml(board));
    return;
  }

  res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300, s-maxage=3600')
      .send(req.method === 'HEAD'
        ? undefined
        : buildBoardSharePageHtml(
            board,
            parsed.stack,
            parsed.quiz,
            parsed.uiLanguage,
            parsed.contentLanguage,
          ));
}

function parseSharePath(url: string): { cardId: string; kind: ShareImageKind | null } | null {
  const path = url.split('?')[0] ?? '';
  const match = path.match(/\/share\/answer-card\/([A-Za-z0-9_-]{8,128})(?:\/(og|story)\.png)?\/?$/);
  if (!match) {
    return null;
  }

  return {
    cardId: match[1],
    kind: match[2] === 'og' || match[2] === 'story' ? match[2] : null,
  };
}

function parseTravelSharePath(url: string): { shareId: string; kind: ShareImageKind | null } | null {
  const path = url.split('?')[0] ?? '';
  const match = path.match(/\/share\/travel-card\/([A-Za-z0-9_-]{8,128})(?:\/(og|story)\.png)?\/?$/);
  if (!match) {
    return null;
  }

  return {
    shareId: match[1],
    kind: match[2] === 'og' || match[2] === 'story' ? match[2] : null,
  };
}

function parseBoardSharePath(url: string): {
  boardId: string;
  image: boolean;
  stack: boolean;
  quiz: boolean;
  video: boolean;
  player: boolean;
  rawVideo: boolean;
  uiLanguage: 'en' | 'fr' | 'ja';
  contentLanguage: 'en' | 'fr' | 'ja' | null;
} | null {
  const [path, query = ''] = url.split('?');
  const match = (path ?? '').match(/\/share\/board\/([A-Za-z0-9_-]{8,128})(?:\/(og\.png|video|video\/player|video\.mp4))?\/?$/);
  if (!match) {
    return null;
  }
  const queryParams = new URLSearchParams(query);
  const contentLanguage = boardShareLanguage(queryParams.get('lang'));
  const uiLanguage = boardShareLanguage(queryParams.get('ui')) ?? contentLanguage ?? 'en';

  return {
    boardId: match[1],
    image: match[2] === 'og.png',
    stack: queryParams.get('view') === 'stack',
    quiz: queryParams.get('learn') === 'quiz',
    video: match[2] === 'video',
    player: match[2] === 'video/player',
    rawVideo: match[2] === 'video.mp4',
    uiLanguage,
    contentLanguage,
  };
}

function boardShareLanguage(value: string | null): 'en' | 'fr' | 'ja' | null {
  return value === 'en' || value === 'fr' || value === 'ja' ? value : null;
}

async function proxyBoardVideo(req: Request, res: Response, board: BoardShare): Promise<void> {
  const videoUrl = board.socialVideoUrl;
  if (!videoUrl) {
    res.status(404).send('Video not found.');
    return;
  }

  const requestHeaders: Record<string, string> = {};
  const range = req.get('range');
  if (range) requestHeaders['Range'] = range;

  try {
    const upstream = await fetch(videoUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: requestHeaders,
    });
    if (!upstream.ok && upstream.status !== 206) {
      logger.warn('Published board video proxy failed.', { boardId: board.id, status: upstream.status });
      res.status(502).send('Published video is temporarily unavailable.');
      return;
    }

    const contentType = (upstream.headers.get('content-type') || board.socialVideoMimeType || 'video/mp4').split(';')[0] || 'video/mp4';
    res.status(upstream.status);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.set('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
    res.set('Content-Disposition', `inline; filename="${safeFileName(board.title)}.mp4"`);
    for (const header of ['content-range', 'content-length'] as const) {
      const value = upstream.headers.get(header);
      if (value) res.set(header, value);
    }
    if (req.method === 'HEAD') {
      res.send();
      return;
    }
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    logger.error('Published board video proxy error.', {
      boardId: board.id,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    res.status(502).send('Published video is temporarily unavailable.');
  }
}

function safeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'livingwiki-video';
}

async function loadShareCard(cardId: string): Promise<ShareCard | null> {
  const snapshot = await db.collection('answer_cards').doc(cardId).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() ?? {};
  const atlasId = typeof data.atlas_id === 'string' ? data.atlas_id : null;
  const atlasTarget = await loadAtlasShareTarget(atlasId);
  return {
    id: snapshot.id,
    atlasId,
    atlasName: atlasTarget.name || (typeof data.atlas_name === 'string' ? data.atlas_name : null),
    atlasSlug: atlasTarget.slug,
    question: cleanText(data.question, 600),
    answerPreview: cleanText(data.answer_preview, 900),
    title: cleanText(data.title, 120) || 'A Philly Answer Worth Sharing',
    subtitle: cleanText(data.subtitle, 180) || 'A fast, shareable summary from Living Wiki Philly.',
    keyFacts: cleanList(data.key_facts, 5, 150),
    didYouKnow: cleanList(data.did_you_know, 3, 150),
    mappableLocations: cleanLocations(data.mappable_locations),
    likeCount: Number(data.like_count ?? 0) || 0,
    updatedAt: timestampToIso(data.updated_at) ?? timestampToIso(data.created_at),
  };
}

async function loadTravelCardShare(shareId: string): Promise<TravelCardShare | null> {
  const snapshot = await db.collection('travel_card_shares').doc(shareId).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() ?? {};
  const card = cleanTravelCard(data.card);
  if (!card) {
    return null;
  }
  const atlasId = typeof data.atlas_id === 'string' ? data.atlas_id : null;
  const atlasTarget = await loadAtlasShareTarget(atlasId);

  return {
    id: snapshot.id,
    atlasId,
    atlasName: atlasTarget.name || cleanText(data.atlas_name, 120) || null,
    atlasSlug: atlasTarget.slug,
    guideTitle: cleanText(data.guide_title, 160) || null,
    guideSummary: cleanText(data.guide_summary, 240) || null,
    question: cleanText(data.question, 500) || null,
    card,
    updatedAt: timestampToIso(data.updated_at) ?? timestampToIso(data.created_at),
  };
}

async function loadBoardShare(boardId: string): Promise<BoardShare | null> {
  const snapshot = await db.collection('boards').doc(boardId).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() ?? {};
  if (data.visibility !== 'public') {
    return null;
  }

  const title = cleanText(data.title, 160);
  if (!title) {
    return null;
  }

  const cards = Array.isArray(data.cards)
    ? data.cards
        .map(cleanBoardShareCard)
        .filter((card): card is BoardShareCard => !!card)
        .slice(0, 50)
    : [];
  const quiz = cleanBoardShareQuiz(data.learningQuiz);

  return {
    id: snapshot.id,
    title,
    description: cleanText(data.description, 320),
    ownerName: cleanText(data.owner_display_name, 100) || 'LivingWiki curator',
    imageUrl: safeUrl(data.imageUrl),
    logoUrl: safeUrl(data.logoUrl),
    kind: cleanText(data.kind, 40) || 'standard',
    socialVideoUrl: safeUrl(data.socialVideoUrl),
    socialVideoMimeType: cleanText(data.socialVideoMimeType, 120) || 'video/mp4',
    socialVideoUpdatedAt: cleanText(data.socialVideoUpdatedAt, 80),
    socialVideoRatio: data.socialVideoRatio === 'square' || data.socialVideoRatio === 'landscape'
      ? data.socialVideoRatio
      : 'vertical',
    quiz,
    cards,
    updatedAt: cleanText(data.updated_at_iso, 80) || timestampToIso(data.server_updated_at),
  };
}

function cleanBoardShareQuiz(value: unknown): BoardShareQuiz | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const questions = Array.isArray(data.questions) ? data.questions : [];
  if (data.published !== true || questions.length < 1) {
    return null;
  }
  return {
    title: cleanText(data.title, 120) || 'Board challenge',
    description: cleanText(data.description, 300),
    questionCount: Math.min(12, questions.length),
    leaderboardEnabled: data.leaderboardEnabled === true,
  };
}

function cleanBoardShareCard(value: unknown): BoardShareCard | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const title = cleanText(data.title, 140);
  if (!title) {
    return null;
  }
  const spotifyArtworkUrl = safeUrl(data.spotifyArtworkUrl);
  return {
    title,
    subtitle: cleanText(data.subtitle, 180),
    imageUrl: safeUrl(data.imageUrl),
    spotifyArtworkUrl,
    hasSongMedia: !!cleanText(data.spotifyTrackId, 120)
      || !!safeUrl(data.spotifyTrackUrl)
      || !!safeUrl(data.audioPreviewUrl)
      || !!spotifyArtworkUrl,
  };
}

async function loadAtlasShareTarget(atlasId: string | null): Promise<{ name: string | null; slug: string | null }> {
  if (!atlasId) {
    return { name: null, slug: null };
  }

  try {
    const snapshot = await db.collection('atlases').doc(atlasId).get();
    if (!snapshot.exists) {
      return { name: null, slug: null };
    }
    const data = snapshot.data() ?? {};
    return {
      name: cleanText(data.name, 120) || null,
      slug: normalizeSlug(data.slug),
    };
  } catch (error) {
    logger.warn('Failed to load share atlas target.', {
      atlasId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { name: null, slug: null };
  }
}

async function getOrRenderShareImage(card: ShareCard, kind: ShareImageKind): Promise<Buffer> {
  const hash = createHash('sha256')
    .update(JSON.stringify({
      imageVersion,
      kind,
      title: card.title,
      subtitle: card.subtitle,
      question: card.question,
      facts: card.keyFacts,
      didYouKnow: card.didYouKnow,
      locations: card.mappableLocations,
      atlasName: card.atlasName,
      atlasSlug: card.atlasSlug,
      updatedAt: card.updatedAt,
    }))
    .digest('hex')
    .slice(0, 18);
  const path = `answer-card-share/${card.id}/${kind}-${hash}.png`;
  const file = storage.bucket().file(path);

  try {
    const [exists] = await file.exists();
    if (exists) {
      const [cached] = await file.download();
      return cached;
    }
  } catch (error) {
    logger.warn('Failed to read cached answer card image.', {
      cardId: card.id,
      kind,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  const image = await renderShareImage(card, kind);
  await file.save(image, {
    resumable: false,
    contentType: 'image/png',
    metadata: {
      cacheControl: 'public,max-age=604800',
    },
  });
  return image;
}

async function getOrRenderTravelImage(share: TravelCardShare, kind: ShareImageKind): Promise<Buffer> {
  const hash = createHash('sha256')
    .update(JSON.stringify({
      imageVersion,
      kind,
      atlasName: share.atlasName,
      atlasSlug: share.atlasSlug,
      guideTitle: share.guideTitle,
      guideSummary: share.guideSummary,
      question: share.question,
      card: share.card,
      updatedAt: share.updatedAt,
    }))
    .digest('hex')
    .slice(0, 18);
  const path = `travel-card-share/${share.id}/${kind}-${hash}.png`;
  const file = storage.bucket().file(path);

  try {
    const [exists] = await file.exists();
    if (exists) {
      const [cached] = await file.download();
      return cached;
    }
  } catch (error) {
    logger.warn('Failed to read cached travel card image.', {
      shareId: share.id,
      kind,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  const image = await renderTravelImage(share, kind);
  await file.save(image, {
    resumable: false,
    contentType: 'image/png',
    metadata: {
      cacheControl: 'public,max-age=604800',
    },
  });
  return image;
}

async function getOrRenderBoardShareImage(board: BoardShare, quiz = false): Promise<Buffer> {
  const hash = createHash('sha256')
    .update(JSON.stringify({
      imageVersion,
      title: board.title,
      description: board.description,
      ownerName: board.ownerName,
      imageUrl: board.imageUrl,
      logoUrl: board.logoUrl,
      kind: board.kind,
      cards: board.cards.slice(0, 4),
      quiz: quiz ? board.quiz : null,
      updatedAt: board.updatedAt,
    }))
    .digest('hex')
    .slice(0, 18);
  const path = `board-share/${board.id}/${quiz ? 'quiz-' : ''}og-${hash}.png`;
  const file = storage.bucket().file(path);

  try {
    const [exists] = await file.exists();
    if (exists) {
      const [cached] = await file.download();
      return cached;
    }
  } catch (error) {
    logger.warn('Failed to read cached board share image.', {
      boardId: board.id,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  const image = await renderBoardShareImage(board, quiz);
  await file.save(image, {
    resumable: false,
    contentType: 'image/png',
    metadata: {
      cacheControl: 'public,max-age=604800',
    },
  });
  return image;
}

async function renderShareImage(card: ShareCard, kind: ShareImageKind): Promise<Buffer> {
  const { width, height } = imageSize(kind);
  const browser = await puppeteer.launch(await resolveLaunchOptions());

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(buildShareImageHtml(card, kind), { waitUntil: 'networkidle0' });
    const image = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
    return Buffer.from(image);
  } finally {
    await browser.close();
  }
}

async function renderTravelImage(share: TravelCardShare, kind: ShareImageKind): Promise<Buffer> {
  const { width, height } = imageSize(kind);
  const browser = await puppeteer.launch(await resolveLaunchOptions());

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(buildTravelImageHtml(share, kind), { waitUntil: 'networkidle0' });
    const image = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
    return Buffer.from(image);
  } finally {
    await browser.close();
  }
}

async function renderBoardShareImage(board: BoardShare, quiz = false): Promise<Buffer> {
  const width = 1200;
  const height = 630;
  const browser = await puppeteer.launch(await resolveLaunchOptions());

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(buildBoardShareImageHtml(board, quiz), { waitUntil: 'networkidle0' });
    const image = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
    return Buffer.from(image);
  } finally {
    await browser.close();
  }
}

async function resolveLaunchOptions() {
  if (process.platform === 'darwin') {
    return {
      headless: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };
  }

  chromium.setGraphicsMode = false;
  return {
    headless: true,
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
  };
}

function buildSharePageHtml(card: ShareCard): string {
  const title = `${card.title} | Living Wiki`;
  const description = card.subtitle || card.question;
  const shareUrl = `${appUrl}/share/answer-card/${encodeURIComponent(card.id)}`;
  const appCardUrl = `${appUrl}/answer-card/${encodeURIComponent(card.id)}`;
  const wikiChatUrl = buildWikiChatUrl(card.atlasSlug);
  const wikiLabel = card.atlasName ? `Ask ${card.atlasName}` : 'Open this living wiki';
  const imageCacheKey = encodeURIComponent(card.updatedAt ?? imageVersion);
  const ogImage = `${shareUrl}/og.png?v=${imageCacheKey}`;
  const storyImage = `${shareUrl}/story.png?v=${imageCacheKey}`;
  const facts = card.keyFacts.length > 0 ? card.keyFacts : card.didYouKnow;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(shareUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Living Wiki">
  <meta property="og:title" content="${escapeHtml(card.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(card.title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(card.title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  ${sharePageStyles()}
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="brand">
        <img src="${appUrl}/assets/image/livingwiki.png" alt="Living Wiki">
        <span>${escapeHtml(card.atlasName || 'Philly')}</span>
      </div>
      <p class="eyebrow">Shared Answer Card</p>
      <h1>${escapeHtml(card.title)}</h1>
      <p class="subtitle">${escapeHtml(card.subtitle)}</p>
      <div class="question">${escapeHtml(card.question)}</div>
      <div class="facts">
        ${facts.slice(0, 4).map((fact) => `<p>${escapeHtml(fact)}</p>`).join('')}
      </div>
      <div class="actions">
        <a href="${escapeHtml(wikiChatUrl)}">${escapeHtml(wikiLabel)}</a>
        <a href="${escapeHtml(appCardUrl)}">Open full card</a>
        <a href="${escapeHtml(storyImage)}" download>Download story image</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function buildTravelSharePageHtml(share: TravelCardShare): string {
  const title = `${share.card.title} | Living Wiki`;
  const description = share.card.description || share.card.subtitle || share.guideSummary || '';
  const shareUrl = `${appUrl}/share/travel-card/${encodeURIComponent(share.id)}`;
  const imageCacheKey = encodeURIComponent(share.updatedAt ?? imageVersion);
  const ogImage = `${shareUrl}/og.png?v=${imageCacheKey}`;
  const storyImage = `${shareUrl}/story.png?v=${imageCacheKey}`;
  const mapUrl = travelCardMapUrl(share.card);
  const sourceUrl = safeUrl(share.card.source_url);
  const wikiChatUrl = buildWikiChatUrl(share.atlasSlug);
  const wikiLabel = share.atlasName ? `Ask ${share.atlasName}` : 'Open this living wiki';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(shareUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Living Wiki">
  <meta property="og:title" content="${escapeHtml(share.card.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(share.card.title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  ${sharePageStyles()}
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="brand">
        <img src="${appUrl}/assets/image/livingwiki.png" alt="Living Wiki">
        <span>${escapeHtml(share.atlasName || 'Shared guide')}</span>
      </div>
      <p class="eyebrow">${escapeHtml(share.guideTitle || 'Guide Card')}</p>
      <h1>${escapeHtml(share.card.title)}</h1>
      <p class="subtitle">${escapeHtml(description)}</p>
      ${share.question ? `<div class="question">${escapeHtml(share.question)}</div>` : ''}
      <div class="facts">
        ${travelFacts(share.card).map((fact) => `<p>${escapeHtml(fact)}</p>`).join('')}
      </div>
      <div class="actions">
        <a href="${escapeHtml(wikiChatUrl)}">${escapeHtml(wikiLabel)}</a>
        <a href="${escapeHtml(mapUrl)}">Open map</a>
        ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}">Read source</a>` : ''}
        <a href="${escapeHtml(storyImage)}" download>Download story image</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function buildBoardSharePageHtml(
  board: BoardShare,
  stack: boolean,
  quiz: boolean,
  uiLanguage: 'en' | 'fr' | 'ja' = 'en',
  contentLanguage: 'en' | 'fr' | 'ja' | null = null,
): string {
  const sharedQuiz = quiz ? board.quiz : null;
  const title = sharedQuiz?.title || board.title;
  const description = sharedQuiz
    ? sharedQuiz.description || `Take this ${sharedQuiz.questionCount}-question challenge from ${board.title}.`
    : boardShareDescription(board);
  const route = boardShareRoute(board);
  const shareVersion = board.updatedAt ?? imageVersion;
  const shareQuery = new URLSearchParams({ v: shareVersion, ui: uiLanguage });
  const appQuery = new URLSearchParams();
  if (contentLanguage) {
    shareQuery.set('lang', contentLanguage);
    appQuery.set('contentLang', contentLanguage);
  }
  if (stack) {
    shareQuery.set('view', 'stack');
    appQuery.set('view', 'stack');
  } else if (sharedQuiz) {
    shareQuery.set('learn', 'quiz');
    appQuery.set('learn', 'quiz');
  }
  const localePrefix = uiLanguage === 'en' ? '' : `/${uiLanguage}`;
  const shareUrl = `${appUrl}/share/board/${encodeURIComponent(board.id)}?${shareQuery.toString()}`;
  const appBoardUrl = `${appUrl}${localePrefix}/${route}/${encodeURIComponent(board.id)}${appQuery.size ? `?${appQuery.toString()}` : ''}`;
  const imageCacheKey = encodeURIComponent(`${board.updatedAt ?? 'board'}-${imageVersion}`);
  const ogImage = `${appUrl}/share/board/${encodeURIComponent(board.id)}/og.png?v=${imageCacheKey}${sharedQuiz ? '&learn=quiz' : ''}`;

  return `<!doctype html>
<html lang="${uiLanguage}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(`${title} | LivingWiki`)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${escapeHtml(shareUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="LivingWiki">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:secure_url" content="${escapeHtml(ogImage)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(sharedQuiz ? `Quiz preview for ${title}` : `Cover preview for ${board.title}`)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <meta name="twitter:image:alt" content="${escapeHtml(sharedQuiz ? `Quiz preview for ${title}` : `Cover preview for ${board.title}`)}">
  <meta name="twitter:label1" content="Curator">
  <meta name="twitter:data1" content="${escapeHtml(board.ownerName)}">
  <meta name="twitter:label2" content="${sharedQuiz ? 'Challenge' : 'Collection'}">
  <meta name="twitter:data2" content="${escapeHtml(sharedQuiz ? `${sharedQuiz.questionCount} questions` : `${board.cards.length} ${board.cards.length === 1 ? 'card' : 'cards'}`)}">
  <script>window.location.replace(${JSON.stringify(appBoardUrl)});</script>
  ${sharePageStyles()}
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="brand">
        <img src="${appUrl}/assets/image/livingwiki.png" alt="LivingWiki">
        <span>Shared board</span>
      </div>
      <p class="eyebrow">${sharedQuiz ? 'Opening quiz challenge' : 'Opening board'}</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="subtitle">${escapeHtml(description)}</p>
      <div class="actions"><a href="${escapeHtml(appBoardUrl)}">${sharedQuiz ? 'Take the quiz' : 'Open board'}</a></div>
    </section>
  </main>
</body>
</html>`;
}

function buildBoardVideoSharePageHtml(board: BoardShare): string {
  const description = `Watch ${board.title}, a LivingWiki video curated by ${board.ownerName}.`;
  const version = boardVideoVersion(board);
  const shareUrl = `${appUrl}/share/board/${encodeURIComponent(board.id)}/video?v=${version}`;
  const playerUrl = `${appUrl}/share/board/${encodeURIComponent(board.id)}/video/player?v=${version}`;
  const boardUrl = `${appUrl}/${boardShareRoute(board)}/${encodeURIComponent(board.id)}?view=stack`;
  const imageCacheKey = encodeURIComponent(`${board.updatedAt ?? 'board'}-${imageVersion}`);
  const posterUrl = `${appUrl}/share/board/${encodeURIComponent(board.id)}/og.png?v=${imageCacheKey}`;
  const videoUrl = `${appUrl}/share/board/${encodeURIComponent(board.id)}/video.mp4?v=${version}`;
  const videoType = board.socialVideoMimeType.split(';')[0] || 'video/mp4';
  const sourceDimensions = boardVideoSourceDimensions(board.socialVideoRatio);
  const playerDimensions = boardVideoPlayerDimensions(board.socialVideoRatio);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(`${board.title} | LivingWiki video`)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow,max-video-preview:-1,max-image-preview:large">
  <link rel="icon" type="image/png" sizes="64x64" href="${appUrl}/assets/image/living-wiki-favicon.png">
  <link rel="apple-touch-icon" href="${appUrl}/assets/image/living-wiki-favicon.png">
  <link rel="canonical" href="${escapeHtml(shareUrl)}">
  <meta property="og:type" content="video.other">
  <meta property="og:site_name" content="LivingWiki">
  <meta property="og:title" content="${escapeHtml(board.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta property="og:image" content="${escapeHtml(posterUrl)}">
  <meta property="og:image:secure_url" content="${escapeHtml(posterUrl)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(`Cover preview for ${board.title}`)}">
  <meta property="og:video" content="${escapeHtml(videoUrl)}">
  <meta property="og:video:secure_url" content="${escapeHtml(videoUrl)}">
  <meta property="og:video:type" content="${escapeHtml(videoType)}">
  <meta property="og:video:width" content="${sourceDimensions.width}">
  <meta property="og:video:height" content="${sourceDimensions.height}">
  <meta name="twitter:card" content="player">
  <meta name="twitter:url" content="${escapeHtml(shareUrl)}">
  <meta name="twitter:title" content="${escapeHtml(board.title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(posterUrl)}">
  <meta name="twitter:image:alt" content="${escapeHtml(`Cover preview for ${board.title}`)}">
  <meta name="twitter:player" content="${escapeHtml(playerUrl)}">
  <meta name="twitter:player:width" content="${playerDimensions.width}">
  <meta name="twitter:player:height" content="${playerDimensions.height}">
  <meta name="twitter:player:stream" content="${escapeHtml(videoUrl)}">
  <meta name="twitter:player:stream:content_type" content="${escapeHtml(videoType)}">
  <style>
    * { box-sizing: border-box; }
    html { color-scheme: dark; background: #050807; }
    body { min-height: 100dvh; margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; color: #f7fff9; background: radial-gradient(circle at 50% 10%, #173d31, #050807 62%); }
    main { display: grid; width: min(100% - 28px, 1160px); min-height: 100dvh; margin: auto; grid-template-columns: minmax(0, 1fr) minmax(260px, 360px); gap: clamp(24px, 5vw, 72px); align-items: center; padding: 28px 0; }
    .player { display: grid; min-width: 0; place-items: center; }
    video { display: block; width: ${board.socialVideoRatio === 'vertical' ? 'min(100%, 430px)' : '100%'}; max-height: calc(100dvh - 56px); border: 1px solid rgba(255,255,255,.32); border-radius: 24px; background: #000; box-shadow: 0 28px 80px rgba(0,0,0,.5); object-fit: contain; }
    .copy { display: grid; gap: 18px; }
    .brand { color: #8ff1c4; font-size: 14px; font-weight: 950; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(36px, 6vw, 70px); line-height: .95; letter-spacing: -.04em; }
    p { margin: 0; color: rgba(247,255,249,.72); font-size: 17px; font-weight: 650; line-height: 1.5; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    a { display: inline-flex; align-items: center; min-height: 46px; border: 2px solid #8ff1c4; border-radius: 999px; color: #071a13; background: #8ff1c4; font-size: 14px; font-weight: 950; padding: 10px 18px; text-decoration: none; }
    a.secondary { color: #eafff1; background: transparent; }
    small { color: rgba(247,255,249,.48); font-weight: 700; line-height: 1.45; }
    @media (max-width: 760px) { main { grid-template-columns: 1fr; align-content: start; } video { max-height: 68dvh; } .copy { padding-bottom: 24px; } }
  </style>
</head>
<body>
  <main>
    <section class="player">
      <video src="${escapeHtml(videoUrl)}" poster="${escapeHtml(posterUrl)}" autoplay muted loop playsinline controls preload="metadata"></video>
    </section>
    <section class="copy">
      <span class="brand">LivingWiki video</span>
      <h1>${escapeHtml(board.title)}</h1>
      <p>${escapeHtml(description)}</p>
      <div class="actions">
        <a href="${escapeHtml(boardUrl)}">Open live view</a>
        <a class="secondary" href="${escapeHtml(videoUrl)}" download>Open video file</a>
      </div>
      <small>For dependable inline playback on social media, attach the video file to the post. Platforms decide whether shared links autoplay.</small>
    </section>
  </main>
</body>
</html>`;
}

function buildBoardVideoPlayerHtml(board: BoardShare): string {
  const version = boardVideoVersion(board);
  const videoUrl = `${appUrl}/share/board/${encodeURIComponent(board.id)}/video.mp4?v=${version}`;
  const imageCacheKey = encodeURIComponent(`${board.updatedAt ?? 'board'}-${imageVersion}`);
  const posterUrl = `${appUrl}/share/board/${encodeURIComponent(board.id)}/og.png?v=${imageCacheKey}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>${escapeHtml(board.title)}</title>
  <link rel="icon" type="image/png" sizes="64x64" href="${appUrl}/assets/image/living-wiki-favicon.png">
  <link rel="apple-touch-icon" href="${appUrl}/assets/image/living-wiki-favicon.png">
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #000; }
    video { display: block; width: 100%; height: 100%; background: #000; object-fit: contain; }
  </style>
</head>
<body>
  <video src="${escapeHtml(videoUrl)}" poster="${escapeHtml(posterUrl)}" playsinline controls preload="metadata"></video>
</body>
</html>`;
}

function boardVideoVersion(board: BoardShare): string {
  const videoVersion = board.socialVideoUpdatedAt ?? board.updatedAt ?? imageVersion;
  return encodeURIComponent(`${videoVersion}-${playerCardVersion}`);
}

function boardVideoSourceDimensions(ratio: BoardShare['socialVideoRatio']): { width: number; height: number } {
  if (ratio === 'square') return { width: 720, height: 720 };
  if (ratio === 'landscape') return { width: 1280, height: 720 };
  return { width: 720, height: 1280 };
}

function boardVideoPlayerDimensions(ratio: BoardShare['socialVideoRatio']): { width: number; height: number } {
  if (ratio === 'square') return { width: 720, height: 720 };
  if (ratio === 'landscape') return { width: 1280, height: 720 };
  return { width: 405, height: 720 };
}

function buildBoardShareImageHtml(board: BoardShare, quiz = false): string {
  const sharedQuiz = quiz ? board.quiz : null;
  const title = sharedQuiz?.title || board.title;
  const description = sharedQuiz
    ? sharedQuiz.description || `A ${sharedQuiz.questionCount}-question challenge from ${board.title}.`
    : boardShareDescription(board);
  const coverImage = board.imageUrl
    || board.cards.find((card) => card.spotifyArtworkUrl || card.imageUrl)?.spotifyArtworkUrl
    || board.cards.find((card) => card.imageUrl)?.imageUrl
    || board.logoUrl;
  const cardType = boardShareRoute(board) === 'songs' ? 'songs' : 'cards';
  const previewCards = sharedQuiz ? [] : board.cards.slice(0, 3);
  const cover = coverImage
    ? `<img class="cover" src="${escapeHtml(coverImage)}" alt="">`
    : `<div class="cover cover--empty"><img src="${appUrl}/assets/image/living-wiki-favicon.png" alt=""></div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
    body { font-family: Inter, Arial, sans-serif; color: #17211d; background: #edf4ee; }
    main { display: grid; grid-template-columns: 55% 45%; width: 100%; height: 100%; }
    .visual { position: relative; min-width: 0; overflow: hidden; background: #dfe9e1; }
    .cover { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover--empty { display: grid; place-items: center; background: #dbeadd; }
    .cover--empty img { width: 210px; height: 210px; object-fit: contain; }
    .visual::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 68%, rgba(237,244,238,.82)); }
    .content { display: flex; min-width: 0; flex-direction: column; justify-content: space-between; padding: 46px 46px 40px 32px; }
    .brand { display: flex; align-items: center; gap: 13px; color: #287a5c; font-size: 21px; font-weight: 900; }
    .brand img { width: 48px; height: 48px; object-fit: contain; }
    .quiz-badge { display: inline-flex; width: fit-content; margin-top: 26px; padding: 9px 14px; border-radius: 999px; background: #5e4ce6; color: white; font-size: 16px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
    h1 { margin: 24px 0 0; font-size: 58px; line-height: .98; font-weight: 950; letter-spacing: 0; overflow-wrap: anywhere; }
    .description { display: -webkit-box; margin: 17px 0 0; overflow: hidden; color: rgba(23,33,29,.72); font-size: 21px; line-height: 1.28; font-weight: 700; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
    .cards { display: grid; gap: 9px; margin-top: 22px; }
    .card { display: grid; grid-template-columns: 42px 1fr; align-items: center; gap: 11px; min-width: 0; border-top: 1px solid rgba(23,33,29,.12); padding-top: 9px; }
    .thumb { width: 42px; height: 42px; border-radius: 6px; object-fit: cover; background: white; }
    .thumb--empty { display: grid; place-items: center; color: #287a5c; font-weight: 950; }
    .card strong { display: block; overflow: hidden; font-size: 16px; line-height: 1.18; text-overflow: ellipsis; white-space: nowrap; }
    .footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 20px; color: rgba(23,33,29,.6); font-size: 16px; font-weight: 850; }
    .footer b { color: #17211d; }
  </style>
</head>
<body>
  <main>
    <section class="visual">${cover}</section>
    <section class="content">
      <div>
        <div class="brand"><img src="${appUrl}/assets/image/living-wiki-favicon.png" alt="">LivingWiki</div>
        ${sharedQuiz ? '<div class="quiz-badge">Board challenge</div>' : ''}
        <h1>${escapeHtml(title)}</h1>
        <p class="description">${escapeHtml(description)}</p>
        <div class="cards">
          ${previewCards.map((card) => {
            const imageUrl = card.spotifyArtworkUrl || card.imageUrl;
            const thumb = imageUrl
              ? `<img class="thumb" src="${escapeHtml(imageUrl)}" alt="">`
              : '<span class="thumb thumb--empty">+</span>';
            return `<div class="card">${thumb}<strong>${escapeHtml(card.title)}</strong></div>`;
          }).join('')}
        </div>
      </div>
      <div class="footer">
        <span>${sharedQuiz ? `From <b>${escapeHtml(board.title)}</b>` : `Curated by <b>${escapeHtml(board.ownerName)}</b>`}</span>
        <span>${sharedQuiz ? `${sharedQuiz.questionCount} questions${sharedQuiz.leaderboardEnabled ? ' · Leaderboard' : ''}` : `${board.cards.length} ${escapeHtml(cardType)}`}</span>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function boardShareDescription(board: BoardShare): string {
  return board.description || `${board.cards.length} ${board.cards.length === 1 ? 'card' : 'cards'} curated by ${board.ownerName}.`;
}

function boardShareRoute(board: BoardShare): 'boards' | 'songs' | 'trips' {
  if (board.kind === 'walking-tour' || board.kind === 'driving-tour') {
    return 'trips';
  }
  const text = `${board.title} ${board.description}`;
  if (/\b(song|songs|music|album|single|tracks|hits|spotify|playlist|discography)\b/i.test(text)) {
    return 'songs';
  }
  const songCards = board.cards.filter((card) => card.hasSongMedia).length;
  return songCards >= Math.max(2, Math.ceil(board.cards.length * 0.35)) ? 'songs' : 'boards';
}

function buildShareImageHtml(card: ShareCard, kind: ShareImageKind): string {
  return kind === 'story' ? buildStoryImageHtml(card) : buildOgImageHtml(card);
}

function buildTravelImageHtml(share: TravelCardShare, kind: ShareImageKind): string {
  return kind === 'story' ? buildTravelStoryImageHtml(share) : buildTravelOgImageHtml(share);
}

function buildOgImageHtml(card: ShareCard): string {
  const facts = teaserFacts(card);
  const hiddenText = hiddenTeaser(card);
  const places = card.mappableLocations.slice(0, 3);
  return imageDocument(1200, 630, `
    <section class="og-card">
      <div class="og-main">
        <div class="brand-row">
          <div class="brand-lockup">
            <div class="brand-dot">LW</div>
            <div>
              <p>Living Wiki</p>
              <strong>${escapeHtml(card.atlasName || 'Philly')}</strong>
            </div>
          </div>
          <div class="field-badge">Shared guide</div>
        </div>

        <p class="question-label">Asked locally</p>
        <h1>${escapeHtml(card.title)}</h1>
        <p class="subtitle">${escapeHtml(card.subtitle)}</p>

        <div class="answer-stack">
          ${facts.map((fact) => `
            <div class="fact-row">
              <span></span>
              <p>${escapeHtml(fact)}</p>
            </div>
          `).join('')}
          <div class="fact-row hidden-row">
            <span></span>
            <p>${escapeHtml(hiddenText)}</p>
          </div>
        </div>
      </div>

      <aside class="og-side">
        <div class="question-card">
          <small>The question</small>
          <p>${escapeHtml(card.question)}</p>
        </div>
        <div class="place-card">
          <small>${places.length ? 'Places inside' : 'Tap for the full answer'}</small>
          ${places.length ? places.map((place) => `<strong>${escapeHtml(place.name)}</strong>`).join('') : `<strong>Full guide, facts, and follow-up ideas</strong>`}
        </div>
        <div class="cta">See the full guide</div>
      </aside>
    </section>
  `);
}

function buildStoryImageHtml(card: ShareCard): string {
  const fact = teaserFacts(card)[0] ?? card.subtitle;
  return imageDocument(1080, 1920, `
    <section class="story-card">
      <div class="story-top">
        <div class="brand-lockup">
          <div class="brand-dot">LW</div>
          <div>
            <p>Living Wiki</p>
            <strong>${escapeHtml(card.atlasName || 'Philly')}</strong>
          </div>
        </div>
        <div class="field-badge">Answer card</div>
      </div>

      <div class="story-middle">
        <p class="question-label">Someone asked</p>
        <h1>${escapeHtml(card.question)}</h1>
      </div>

      <div class="story-bottom">
        <p>${escapeHtml(fact)}</p>
        <div class="story-cta">See the full guide</div>
        <small>livingwiki.com</small>
      </div>
    </section>
  `);
}

function buildTravelOgImageHtml(share: TravelCardShare): string {
  const facts = travelFacts(share.card);
  return imageDocument(1200, 630, `
    <section class="og-card">
      <div class="og-main">
        <div class="brand-row">
          <div class="brand-lockup">
            <div class="brand-dot">LW</div>
            <div>
              <p>Living Wiki</p>
              <strong>${escapeHtml(share.atlasName || 'Guide pick')}</strong>
            </div>
          </div>
          <div class="field-badge">Share card</div>
        </div>

        <p class="question-label">${escapeHtml(share.guideTitle || 'Local pick')}</p>
        <h1>${escapeHtml(share.card.title)}</h1>
        <p class="subtitle">${escapeHtml(share.card.description || share.card.subtitle || '')}</p>

        <div class="answer-stack">
          ${facts.slice(0, 3).map((fact) => `
            <div class="fact-row">
              <span></span>
              <p>${escapeHtml(fact)}</p>
            </div>
          `).join('')}
          <div class="fact-row hidden-row">
            <span></span>
            <p>${escapeHtml(share.card.local_tip || share.guideSummary || 'Open the full card for the local move.')}</p>
          </div>
        </div>
      </div>

      <aside class="og-side">
        <div class="question-card">
          <small>${escapeHtml(share.card.neighborhood || share.card.subtitle || 'The pick')}</small>
          <p>${escapeHtml(share.card.best_for || share.card.vibe || 'Worth saving for later')}</p>
        </div>
        <div class="place-card">
          <small>Quick details</small>
          ${[share.card.cost, share.card.time_hint, share.card.vibe].filter(Boolean).map((item) => `<strong>${escapeHtml(String(item))}</strong>`).join('') || '<strong>Map, tip, and source inside</strong>'}
        </div>
        <div class="cta">Open the share card</div>
      </aside>
    </section>
  `);
}

function buildTravelStoryImageHtml(share: TravelCardShare): string {
  return imageDocument(1080, 1920, `
    <section class="story-card">
      <div class="story-top">
        <div class="brand-lockup">
          <div class="brand-dot">LW</div>
          <div>
            <p>Living Wiki</p>
            <strong>${escapeHtml(share.atlasName || 'Guide pick')}</strong>
          </div>
        </div>
        <div class="field-badge">Share card</div>
      </div>

      <div class="story-middle">
        <p class="question-label">${escapeHtml(share.guideTitle || 'Local pick')}</p>
        <h1>${escapeHtml(share.card.title)}</h1>
      </div>

      <div class="story-bottom">
        <p>${escapeHtml(share.card.local_tip || share.card.description || share.card.subtitle || '')}</p>
        <div class="story-cta">Open the full card</div>
        <small>livingwiki.com</small>
      </div>
    </section>
  `);
}

function imageDocument(width: number, height: number, body: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; margin: 0; overflow: hidden; }
    body {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #17211d;
      background: #f7f0e5;
    }
    .og-card {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 28px;
      width: 1200px;
      height: 630px;
      padding: 50px;
      background:
        linear-gradient(135deg, rgba(254, 249, 239, 0.98), rgba(241, 232, 216, 0.92)),
        radial-gradient(circle at 88% 12%, rgba(217, 65, 60, 0.24), transparent 30%),
        radial-gradient(circle at 5% 92%, rgba(37, 76, 137, 0.2), transparent 32%);
    }
    .og-card::after,
    .story-card::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 16px;
      background: linear-gradient(90deg, #254c89, #f3ba4f, #d9413c, #25785f);
    }
    .og-main,
    .og-side,
    .story-card > * {
      position: relative;
      z-index: 1;
    }
    .brand-row,
    .story-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .brand-lockup {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-dot {
      display: grid;
      width: 58px;
      height: 58px;
      place-items: center;
      border-radius: 18px;
      background: #17211d;
      color: #f9f3e8;
      font-size: 17px;
      font-weight: 950;
      letter-spacing: 0;
    }
    .brand-lockup p,
    .brand-lockup strong,
    .question-label,
    .field-badge,
    .question-card small,
    .place-card small,
    .story-bottom small {
      margin: 0;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }
    .brand-lockup p,
    .question-card small,
    .place-card small,
    .story-bottom small {
      color: rgba(23, 33, 29, 0.58);
      font-size: 14px;
      font-weight: 850;
    }
    .brand-lockup strong {
      display: block;
      margin-top: 3px;
      color: #17211d;
      font-size: 20px;
      font-weight: 950;
    }
    .field-badge {
      border-radius: 999px;
      background: #f3ba4f;
      color: #28190b;
      padding: 12px 18px;
      font-size: 14px;
      font-weight: 950;
    }
    .question-label {
      margin-top: 42px;
      color: #25785f;
      font-size: 16px;
      font-weight: 950;
    }
    .og-card h1 {
      max-width: 720px;
      margin: 14px 0 0;
      color: #17211d;
      font-size: 74px;
      line-height: 0.94;
      font-weight: 950;
      letter-spacing: 0;
    }
    .subtitle {
      max-width: 700px;
      margin: 18px 0 0;
      color: rgba(23, 33, 29, 0.78);
      font-size: 25px;
      line-height: 1.28;
      font-weight: 720;
    }
    .answer-stack {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 28px;
    }
    .fact-row {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      gap: 12px;
      align-items: start;
      min-height: 82px;
      border: 1px solid rgba(23, 33, 29, 0.12);
      border-radius: 18px;
      background: rgba(255, 252, 246, 0.78);
      padding: 16px;
    }
    .fact-row span {
      width: 18px;
      height: 18px;
      margin-top: 5px;
      border-radius: 6px;
      background: #25785f;
    }
    .fact-row p {
      margin: 0;
      color: #17211d;
      font-size: 20px;
      line-height: 1.22;
      font-weight: 780;
    }
    .hidden-row {
      position: relative;
      overflow: hidden;
      background: rgba(255, 252, 246, 0.55);
    }
    .hidden-row p {
      filter: blur(4px);
      color: rgba(23, 33, 29, 0.42);
    }
    .hidden-row::after {
      content: "plus more in the full guide";
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: #17211d;
      font-size: 18px;
      font-weight: 950;
      background: rgba(247, 240, 229, 0.55);
    }
    .og-side {
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto auto;
      gap: 16px;
    }
    .question-card,
    .place-card {
      border: 1px solid rgba(23, 33, 29, 0.12);
      border-radius: 26px;
      background: #17211d;
      color: #f9f3e8;
      padding: 24px;
      box-shadow: 0 24px 60px rgba(23, 33, 29, 0.16);
    }
    .question-card p {
      margin: 14px 0 0;
      font-size: 27px;
      line-height: 1.12;
      font-weight: 900;
    }
    .question-card small,
    .place-card small {
      color: rgba(249, 243, 232, 0.62);
    }
    .place-card {
      display: grid;
      gap: 10px;
      background: #254c89;
    }
    .place-card strong {
      display: block;
      color: #fffaf0;
      font-size: 20px;
      line-height: 1.1;
      font-weight: 900;
    }
    .cta,
    .story-cta {
      display: grid;
      place-items: center;
      min-height: 64px;
      border-radius: 999px;
      background: #d9413c;
      color: white;
      font-size: 20px;
      font-weight: 950;
    }
    .story-card {
      position: relative;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      width: 1080px;
      height: 1920px;
      padding: 76px 72px 92px;
      background:
        linear-gradient(180deg, rgba(251, 247, 239, 0.98), rgba(239, 229, 211, 0.94)),
        radial-gradient(circle at 80% 8%, rgba(217, 65, 60, 0.28), transparent 26%),
        radial-gradient(circle at 12% 86%, rgba(37, 76, 137, 0.22), transparent 30%);
    }
    .story-middle {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding-bottom: 160px;
    }
    .story-middle .question-label {
      margin-top: 0;
      font-size: 26px;
    }
    .story-middle h1 {
      margin: 24px 0 0;
      color: #17211d;
      font-size: 92px;
      line-height: 0.96;
      font-weight: 950;
      letter-spacing: 0;
    }
    .story-bottom {
      display: grid;
      gap: 26px;
    }
    .story-bottom p {
      margin: 0;
      border-left: 12px solid #f3ba4f;
      border-radius: 28px;
      background: rgba(255, 252, 246, 0.74);
      padding: 30px;
      color: #17211d;
      font-size: 38px;
      line-height: 1.12;
      font-weight: 860;
    }
    .story-cta {
      min-height: 92px;
      font-size: 32px;
    }
    .story-bottom small {
      text-align: center;
      font-size: 20px;
      color: rgba(23, 33, 29, 0.5);
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function sharePageStyles(): string {
  return `<style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #17211d;
      background: #f7f0e5;
    }
    .page {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px;
    }
    .hero {
      width: min(920px, 100%);
      border: 1px solid rgba(23, 33, 29, 0.12);
      border-radius: 28px;
      background: rgba(255, 252, 246, 0.86);
      box-shadow: 0 28px 80px rgba(23, 33, 29, 0.12);
      padding: clamp(24px, 5vw, 54px);
    }
    .brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      color: rgba(23, 33, 29, 0.58);
      font-size: 13px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .brand img {
      width: 150px;
      height: auto;
    }
    .eyebrow {
      margin: 38px 0 0;
      color: #25785f;
      font-size: 13px;
      font-weight: 950;
      letter-spacing: 0.11em;
      text-transform: uppercase;
    }
    h1 {
      max-width: 12ch;
      margin: 12px 0 0;
      font-size: clamp(3rem, 9vw, 6.6rem);
      line-height: 0.94;
      letter-spacing: 0;
    }
    .subtitle {
      max-width: 720px;
      margin: 20px 0 0;
      color: rgba(23, 33, 29, 0.76);
      font-size: clamp(1.1rem, 2.4vw, 1.5rem);
      line-height: 1.45;
      font-weight: 700;
    }
    .question {
      margin-top: 24px;
      border-left: 6px solid #f3ba4f;
      border-radius: 18px;
      background: #f3eadb;
      padding: 18px;
      font-weight: 750;
      line-height: 1.45;
    }
    .facts {
      display: grid;
      gap: 10px;
      margin-top: 24px;
    }
    .facts p {
      margin: 0;
      border: 1px solid rgba(23, 33, 29, 0.11);
      border-radius: 16px;
      background: white;
      padding: 14px 16px;
      font-weight: 700;
      line-height: 1.4;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;
    }
    .actions a {
      display: inline-flex;
      min-height: 46px;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: #17211d;
      color: #fffaf0;
      padding: 0 18px;
      text-decoration: none;
      font-weight: 900;
    }
    .actions a + a {
      background: #254c89;
    }
  </style>`;
}

function teaserFacts(card: ShareCard): string[] {
  const facts = [...card.keyFacts, ...card.didYouKnow].filter(Boolean);
  if (facts.length > 0) {
    return facts.slice(0, 3);
  }
  return splitPreview(card.answerPreview).slice(0, 3);
}

function hiddenTeaser(card: ShareCard): string {
  const place = card.mappableLocations[2]?.name || card.mappableLocations[1]?.name;
  if (place) {
    return `A few more details, including ${place}.`;
  }
  return card.didYouKnow[1] || card.answerPreview || 'More local context inside the full card.';
}

function splitPreview(value: string): string[] {
  return value
    .split(/(?:\n+|(?<=[.!?])\s+)/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function imageSize(kind: ShareImageKind): { width: number; height: number } {
  return kind === 'story' ? { width: 1080, height: 1920 } : { width: 1200, height: 630 };
}

function cleanText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function cleanList(value: unknown, limit: number, itemLimit: number): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item, itemLimit)).filter(Boolean).slice(0, limit)
    : [];
}

function cleanLocations(value: unknown): MappableLocation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): MappableLocation | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const data = item as Record<string, unknown>;
      const name = cleanText(data.name, 120);
      const searchQuery = cleanText(data.search_query, 240);
      if (!name || !searchQuery) {
        return null;
      }
      return {
        name,
        search_query: searchQuery,
        address_hint: cleanText(data.address_hint, 240) || null,
      };
    })
    .filter((location): location is MappableLocation => !!location)
    .slice(0, 6);
}

function cleanTravelCard(value: unknown): TravelGuideCard | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const title = cleanText(data.title, 140);
  const description = cleanText(data.description, 600);
  if (!title || !description) {
    return null;
  }

  return {
    id: cleanText(data.id, 120) || 'guide-card',
    title,
    subtitle: cleanText(data.subtitle, 180) || null,
    description,
    neighborhood: cleanText(data.neighborhood, 160) || null,
    best_for: cleanText(data.best_for, 160) || null,
    vibe: cleanText(data.vibe, 80) || null,
    local_tip: cleanText(data.local_tip, 240) || null,
    cost: cleanText(data.cost, 80) || null,
    time_hint: cleanText(data.time_hint, 80) || null,
    image_url: safeUrl(data.image_url) || null,
    map_query: cleanText(data.map_query, 240) || null,
    source_url: safeUrl(data.source_url) || null,
  };
}

function travelFacts(card: TravelGuideCard): string[] {
  return [
    card.subtitle || card.neighborhood || '',
    card.best_for ? `Best for: ${card.best_for}` : '',
    card.local_tip ? `Local move: ${card.local_tip}` : '',
    card.cost ? `Cost: ${card.cost}` : '',
    card.time_hint ? `Timing: ${card.time_hint}` : '',
  ].filter(Boolean).slice(0, 4);
}

function travelCardMapUrl(card: TravelGuideCard): string {
  const query = card.map_query?.trim() || card.subtitle?.trim() || card.title;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeSlug(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const slug = value.trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

function buildWikiChatUrl(slug: string | null): string {
  return slug ? `${appUrl}/chat/${encodeURIComponent(slug)}` : `${appUrl}/public-wikis`;
}

function timestampToIso(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
