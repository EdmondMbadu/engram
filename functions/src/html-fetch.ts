import { createHash } from 'node:crypto';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { HTTPRequest, Page } from 'puppeteer-core';

export type HtmlFetchMethod = 'raw' | 'browser';

export interface HtmlFetchAttempt {
  method: HtmlFetchMethod;
  durationMs: number;
  status: number;
  blocked: boolean;
  errorMessage: string;
}

export interface HtmlFetchResult {
  html: string;
  contentType: string | null;
  finalUrl: string;
  status: number;
  method: HtmlFetchMethod;
  attempts: HtmlFetchAttempt[];
}

let stealthConfigured = false;

const defaultUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const rawHtmlHeaders = {
  'User-Agent': defaultUserAgent,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};
const linkPreviewUserAgents = [
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Twitterbot/1.0',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
];

export function looksLikeAntiBotChallenge(html: string): boolean {
  const normalized = html.toLowerCase();

  // Short challenge/block pages are typically <50KB. Real article/listing pages are much
  // larger. Cloudflare injects /cdn-cgi/challenge-platform/ tracking scripts on many
  // otherwise-normal pages, so that marker alone is not sufficient and caused false
  // positives on amanet.org (193KB real content flagged as blocked).
  const isSmallPage = normalized.length < 50_000;

  const absoluteBlockMarkers = [
    'attention required! | cloudflare',
    'sorry, you have been blocked',
    'error 1020',
    'error 1015',
    'ray id:',
    'class="lv-waiting"',
    'maintenance-page-desktop.jpg',
    'reference error',
  ];

  if (absoluteBlockMarkers.some((marker) => normalized.includes(marker))) {
    return true;
  }

  const renderedContentEvidence = normalized.length >= 100_000
    && (
      /"@type"\s*:\s*"(?:menuitem|product|itemlist|restaurant)"/i.test(html)
      || (html.match(/<img\b/gi)?.length ?? 0) >= 8
      || (html.match(/data-testid=/gi)?.length ?? 0) >= 12
    );
  const challengeMarkers = [
    '<title>just a moment...</title>',
    'checking if the site connection is secure',
    'checking if the site connection is secured',
    'enable javascript and cookies to continue',
    'performance &amp; security by cloudflare',
    'performance & security by cloudflare',
    '_cf_chl_opt',
    'cf-mitigated',
    'challenge-platform',
    // Lofty/Chime brokerage sites answer ordinary HTTP clients with a small
    // nonstandard 218 proof-of-work document. Treat it as a challenge so the
    // browser strategy can execute the script, reload, and capture the real
    // server-rendered listing rather than handing the challenge to generation.
    "var key = 'cf_retry'",
    'cf_pow',
    'cf_pass',
    'lofty does not support embedding its pages inside iframes or framesets',
  ];

  if (
    !renderedContentEvidence
    && (isSmallPage || /<title>just a moment\.\.\.<\/title>/i.test(html))
    && challengeMarkers.some((marker) => normalized.includes(marker))
  ) {
    return true;
  }

  return false;
}

/**
 * Completes the small SHA-1 proof-of-work challenge served by Lofty/Chime.
 * This mirrors the public page's own script and is deliberately bounded so a
 * hostile page cannot turn URL extraction into unbounded CPU work.
 */
export function buildLoftyProofOfWorkCookie(html: string, elapsedMs: number): string {
  if (html.length > 50_000 || !/\bcf_(?:retry|pow|pass)\b/i.test(html)) return '';
  const nonce = html.match(/\bvar\s+nonce\s*=\s*['"]([a-f0-9]{16,128})['"]/i)?.[1] || '';
  const difficulty = Number(html.match(/\bvar\s+difficulty\s*=\s*(\d+)/i)?.[1]);
  const passA = html.match(/\bvar\s+_a\s*=\s*['"]([a-z0-9.]+)['"]/i)?.[1] || '';
  const passB = html.match(/\b_b\s*=\s*['"]([a-z0-9.]+)['"]/i)?.[1] || '';
  const passC = html.match(/\b_c\s*=\s*['"]([a-z0-9.]+)['"]/i)?.[1] || '';
  if (!nonce || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5 || !passA || !passB || !passC) {
    return '';
  }
  const target = '7'.repeat(difficulty);
  const maxAttempts = 2_000_000;
  for (let answer = 0; answer <= maxAttempts; answer += 1) {
    const digest = createHash('sha1').update(`${nonce}${answer}`).digest('hex');
    if (!digest.startsWith(target)) continue;
    const elapsed = Math.max(1, Math.min(60_000, Math.round(elapsedMs) || 1));
    return `cf_pow=${answer}; cf_time=${elapsed}; cf_pass=${passA}${passB}${passC}`;
  }
  return '';
}

export async function fetchHtmlWithFallback(
  url: string,
  options?: { timeoutMs?: number; preferBrowser?: boolean; allowBrowserFallback?: boolean },
): Promise<HtmlFetchResult> {
  const timeoutMs = Math.max(3_000, Math.min(options?.timeoutMs ?? 30_000, 45_000));
  const allowBrowserFallback = options?.allowBrowserFallback ?? true;
  const attempts: HtmlFetchAttempt[] = [];
  let lastResult: HtmlFetchResult | null = null;
  const strategies: HtmlFetchMethod[] = options?.preferBrowser
    ? ['browser', 'raw']
    : allowBrowserFallback
      ? ['raw', 'browser']
      : ['raw'];

  for (const method of strategies) {
    if (method === 'browser' && !allowBrowserFallback && !options?.preferBrowser) {
      continue;
    }
    const startedAt = Date.now();
    try {
      const result = method === 'browser'
        ? await fetchHtmlInBrowser(url, timeoutMs)
        : await fetchHtmlRaw(url, Math.min(timeoutMs, 10_000));
      const blocked = looksLikeAntiBotChallenge(result.html);
      attempts.push({
        method,
        durationMs: Date.now() - startedAt,
        status: result.status,
        blocked,
        errorMessage: '',
      });
      lastResult = { ...result, attempts: [...attempts] };
      if (result.status > 0 && result.status < 400 && !blocked) {
        return lastResult;
      }
    } catch (error) {
      attempts.push({
        method,
        durationMs: Date.now() - startedAt,
        status: 0,
        blocked: false,
        errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      });
    }
  }

  if (lastResult) {
    return { ...lastResult, attempts };
  }
  throw new Error(
    `URL fetch failed: ${attempts.map((attempt) =>
      `${attempt.method} ${attempt.errorMessage || attempt.status || 'failed'}`).join('; ')}`,
  );
}

async function fetchHtmlRaw(url: string, timeoutMs: number): Promise<HtmlFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: rawHtmlHeaders,
    });
    const html = await response.text();
    let bestHtml = html;
    let bestResponse = response;
    const proofStartedAt = Date.now();
    const proofCookie = buildLoftyProofOfWorkCookie(html, 1);
    if (proofCookie) {
      const elapsedCookie = proofCookie.replace(
        /\bcf_time=\d+/,
        `cf_time=${Math.max(1, Date.now() - proofStartedAt)}`,
      );
      const solvedResponse = await fetch(response.url || url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { ...rawHtmlHeaders, Cookie: elapsedCookie },
      });
      const solvedHtml = await solvedResponse.text();
      if (solvedResponse.status >= 200 && solvedResponse.status < 400 && !looksLikeAntiBotChallenge(solvedHtml)) {
        bestHtml = solvedHtml;
        bestResponse = solvedResponse;
      }
      if (solvedResponse.status >= 200 && solvedResponse.status < 400 && !looksLikeAntiBotChallenge(solvedHtml)) {
        if (isLoftyListingUrl(response.url || url) && !hasAuthoritativeLoftyListingPayload(solvedHtml)) {
          // The proof passed but the cloud-specific response is still only a
          // visible carousel shell. Continue into link-preview recovery below.
        } else {
        return {
          html: solvedHtml,
          contentType: solvedResponse.headers.get('content-type'),
          finalUrl: solvedResponse.url || response.url || url,
          status: solvedResponse.status,
          method: 'raw',
          attempts: [],
        };
        }
      }
    }

    // Some cloud egress addresses receive a plausible HTTP 200 page from
    // Lofty that contains only the visible carousel and "price per sqft".
    // Because it is not an anti-bot page, recover every incomplete Lofty
    // detail response rather than limiting this path to explicit challenges.
    if (isLoftyListingUrl(response.url || url) && !hasAuthoritativeLoftyListingPayload(bestHtml)) {
      const preview = await fetchLoftyLinkPreview(response.url || url, controller.signal);
      if (preview) return preview;
    }

    return {
      html: bestHtml,
      contentType: bestResponse.headers.get('content-type'),
      finalUrl: bestResponse.url || response.url || url,
      status: bestResponse.status,
      method: 'raw',
      attempts: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLoftyLinkPreview(url: string, signal: AbortSignal): Promise<HtmlFetchResult | null> {
  const previewUrl = canonicalLoftyListingUrl(url);
  for (const userAgent of linkPreviewUserAgents) {
    try {
      const response = await fetch(previewUrl, {
        method: 'GET',
        redirect: 'follow',
        signal,
        headers: { ...rawHtmlHeaders, 'User-Agent': userAgent },
      });
      const html = await response.text();
      if (
        response.status >= 200
        && response.status < 400
        && !looksLikeAntiBotChallenge(html)
        && hasAuthoritativeLoftyListingPayload(html)
      ) {
        return {
          html,
          contentType: response.headers.get('content-type'),
          finalUrl: response.url || previewUrl,
          status: response.status,
          method: 'raw',
          attempts: [],
        };
      }
    } catch {
      // Try the next public link-preview representation within the same bound.
    }
  }
  return null;
}

function hasAuthoritativeLoftyListingPayload(html: string): boolean {
  if (/window\.sitePageJSON\s*=/.test(html) && /"pictureList"\s*:\s*\[/.test(html)) return true;
  if (!/"@type"\s*:\s*"RealEstateListing"/i.test(html)) return false;
  return (html.match(/\/mls-listing\//gi)?.length ?? 0) >= 2;
}

function isLoftyListingUrl(value: string): boolean {
  try {
    return /^\/listing-detail\/\d{6,}\/[A-Za-z0-9][A-Za-z0-9-]{5,}\/?$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

function canonicalLoftyListingUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!isLoftyListingUrl(value)) {
      return value;
    }
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

async function fetchHtmlInBrowser(
  url: string,
  timeoutMs: number,
): Promise<HtmlFetchResult> {
  ensureStealth();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  let expired = false;
  const operation = async (): Promise<HtmlFetchResult> => {
    browser = await puppeteer.launch({
      ...await resolveLaunchOptions(),
      timeout: Math.min(15_000, timeoutMs),
    });
    if (expired) {
      throw new Error('Browser launch exceeded the extraction deadline.');
    }
    const page = await browser.newPage();
    await page.setUserAgent(defaultUserAgent);
    await page.setViewport({ width: 1366, height: 900 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Upgrade-Insecure-Requests': '1',
    });
    await page.setRequestInterception(true);
    page.on('request', (request: HTTPRequest) => {
      const resourceType = request.resourceType();
      if (resourceType === 'font' || resourceType === 'media') {
        void request.abort().catch(() => undefined);
      } else {
        void request.continue().catch(() => undefined);
      }
    });
    const navigationResponse = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(18_000, timeoutMs),
    });
    await page.waitForNetworkIdle({
      idleTime: 400,
      timeout: Math.min(4_000, Math.max(1_000, timeoutMs - 1_000)),
    }).catch(() => undefined);
    await hydrateBrowserPageForExtraction(page);

    return {
      html: await page.content(),
      contentType: 'text/html; charset=utf-8',
      finalUrl: page.url(),
      status: navigationResponse?.status() ?? 0,
      method: 'browser',
      attempts: [],
    };
  };
  let deadline: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => {
          expired = true;
          reject(new Error(`Browser extraction exceeded ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (deadline) clearTimeout(deadline);
    expired = true;
    if (browser) {
      await closeBrowserWithin(browser, 2_500);
    }
  }
}

async function closeBrowserWithin(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  timeoutMs: number,
): Promise<void> {
  let closed = false;
  try {
    await Promise.race([
      browser.close().then(() => {
        closed = true;
      }),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // The process-level fallback below handles an unresponsive browser.
  }
  if (!closed) {
    browser.process()?.kill('SIGKILL');
  }
}

async function hydrateBrowserPageForExtraction(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const pause = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));
    const discoveredImages = new Map<string, { alt: string; src: string; srcset: string }>();
    const captureVisibleImages = () => {
      for (const image of Array.from(document.images)) {
        // `src` often remains a shared lazy-loading placeholder after the browser has selected
        // the real responsive asset. Capture the browser-resolved URL first so virtualized
        // menu/product rows retain the photo that was actually rendered.
        const src = image.currentSrc || image.src || image.getAttribute('src') || '';
        const srcset = image.getAttribute('srcset') || '';
        if (!src && !srcset) continue;
        const alt = image.getAttribute('alt') || '';
        discoveredImages.set(`${alt}\n${src}\n${srcset}`, { alt, src, srcset });
      }
    };
    await pause(500);
    const viewportHeight = Math.max(window.innerHeight, 700);
    // Menu and collection pages are frequently much taller than eight viewports. Sample the
    // full document instead of only its first ~7,000px so lazy-loaded item photos are present
    // in the serialized DOM. Recompute the height as the app renders new sections; a single
    // height measurement immediately after DOMContentLoaded is frequently incomplete.
    const stepDistance = Math.max(650, Math.round(viewportHeight * 0.85));
    let scrollTop = 0;
    let stableBottomRounds = 0;
    captureVisibleImages();
    for (let step = 0; step < 180 && stableBottomRounds < 3; step += 1) {
      const maxScrollTop = Math.min(
        Math.max(document.documentElement.scrollHeight - viewportHeight, 0),
        140_000,
      );
      if (scrollTop < maxScrollTop) {
        scrollTop = Math.min(maxScrollTop, scrollTop + stepDistance);
        stableBottomRounds = 0;
      } else {
        stableBottomRounds += 1;
      }
      window.scrollTo(0, scrollTop);
      await pause(scrollTop >= maxScrollTop ? 240 : 70);
      captureVisibleImages();
    }
    window.scrollTo(0, 0);
    await pause(250);
    captureVisibleImages();

    for (const image of Array.from(document.images)) {
      const currentSrc = image.currentSrc || image.src;
      if (currentSrc) image.setAttribute('data-lw-current-src', currentSrc);
    }
    // Some commerce/menu UIs virtualize rows and remove off-screen images from the DOM.
    // Preserve every image observed during scrolling in a hidden extraction-only container.
    const extractionImages = document.createElement('div');
    extractionImages.hidden = true;
    extractionImages.setAttribute('data-lw-extraction-images', 'true');
    for (const discovered of discoveredImages.values()) {
      const image = document.createElement('img');
      image.setAttribute('alt', discovered.alt);
      if (discovered.src) image.setAttribute('src', discovered.src);
      if (discovered.srcset) image.setAttribute('srcset', discovered.srcset);
      extractionImages.appendChild(image);
    }
    document.body.appendChild(extractionImages);
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[style*="background"], [class]')).slice(0, 2500);
    for (const element of elements) {
      const backgroundImage = window.getComputedStyle(element).backgroundImage;
      if (backgroundImage && backgroundImage !== 'none' && /url\(/i.test(backgroundImage)) {
        element.setAttribute('data-lw-background-image', backgroundImage);
      }
    }
  });
}

function ensureStealth(): void {
  if (stealthConfigured) {
    return;
  }

  puppeteer.use(StealthPlugin());
  stealthConfigured = true;
}

async function resolveLaunchOptions() {
  const isLocalMac = process.platform === 'darwin';

  if (isLocalMac) {
    return {
      headless: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };
  }

  chromium.setGraphicsMode = false;
  return {
    headless: 'shell' as const,
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
  };
}
