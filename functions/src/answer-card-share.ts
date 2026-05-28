import chromium from '@sparticuz/chromium';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import type { Request } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import puppeteer from 'puppeteer-extra';
import { db, storage } from './firebase';
import type { MappableLocation } from './types';

const appUrl = 'https://living-atlas-7622a.web.app';
const imageVersion = 'v1';

type ShareImageKind = 'og' | 'story';

interface ShareCard {
  id: string;
  atlasName: string | null;
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

async function loadShareCard(cardId: string): Promise<ShareCard | null> {
  const snapshot = await db.collection('answer_cards').doc(cardId).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    atlasName: typeof data.atlas_name === 'string' ? data.atlas_name : null,
    question: cleanText(data.question, 600),
    answerPreview: cleanText(data.answer_preview, 900),
    title: cleanText(data.title, 120) || 'A Philly Answer Worth Sharing',
    subtitle: cleanText(data.subtitle, 180) || 'A fast, shareable summary from My living wiki Philly.',
    keyFacts: cleanList(data.key_facts, 5, 150),
    didYouKnow: cleanList(data.did_you_know, 3, 150),
    mappableLocations: cleanLocations(data.mappable_locations),
    likeCount: Number(data.like_count ?? 0) || 0,
    updatedAt: timestampToIso(data.updated_at) ?? timestampToIso(data.created_at),
  };
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
  const title = `${card.title} | My living wiki`;
  const description = card.subtitle || card.question;
  const shareUrl = `${appUrl}/share/answer-card/${encodeURIComponent(card.id)}`;
  const appCardUrl = `${appUrl}/answer-card/${encodeURIComponent(card.id)}`;
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
  <meta property="og:site_name" content="My living wiki">
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
        <img src="${appUrl}/assets/image/my-living-wiki.png" alt="My living wiki">
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
        <a href="${escapeHtml(appCardUrl)}">Open full card</a>
        <a href="${escapeHtml(storyImage)}" download>Download story image</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function buildShareImageHtml(card: ShareCard, kind: ShareImageKind): string {
  return kind === 'story' ? buildStoryImageHtml(card) : buildOgImageHtml(card);
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
              <p>My living wiki</p>
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
            <p>My living wiki</p>
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
        <small>living-atlas-7622a.web.app</small>
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
