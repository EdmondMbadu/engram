import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Page } from 'puppeteer-core';

export type HtmlFetchMethod = 'raw' | 'browser';

export interface HtmlFetchResult {
  html: string;
  contentType: string | null;
  finalUrl: string;
  status: number;
  method: HtmlFetchMethod;
}

let stealthConfigured = false;

const defaultUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export function looksLikeAntiBotChallenge(html: string): boolean {
  const normalized = html.toLowerCase();

  // Short challenge/block pages are typically <50KB. Real article/listing pages are much
  // larger. Cloudflare injects /cdn-cgi/challenge-platform/ tracking scripts on many
  // otherwise-normal pages, so that marker alone is not sufficient and caused false
  // positives on amanet.org (193KB real content flagged as blocked).
  const isSmallPage = normalized.length < 50_000;

  const strongBlockMarkers = [
    'attention required! | cloudflare',
    'sorry, you have been blocked',
    '<title>just a moment...</title>',
    'checking if the site connection is secure',
    'enable javascript and cookies to continue',
    'performance &amp; security by cloudflare',
    'performance & security by cloudflare',
    'error 1020',
    'error 1015',
    'ray id:',
    'class="lv-waiting"',
    'maintenance-page-desktop.jpg',
    'reference error',
  ];

  if (strongBlockMarkers.some((marker) => normalized.includes(marker))) {
    return true;
  }

  const weakBlockMarkers = [
    '_cf_chl_opt',
    'cf-mitigated',
    'challenge-platform',
  ];

  if (isSmallPage && weakBlockMarkers.some((marker) => normalized.includes(marker))) {
    return true;
  }

  return false;
}

export async function fetchHtmlWithFallback(
  url: string,
  options?: { timeoutMs?: number; preferBrowser?: boolean; allowBrowserFallback?: boolean },
): Promise<HtmlFetchResult> {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const allowBrowserFallback = options?.allowBrowserFallback ?? true;
  if (options?.preferBrowser) {
    try {
      const browser = await fetchHtmlInBrowser(url, timeoutMs);
      if (browser.status > 0 && browser.status < 400 && !looksLikeAntiBotChallenge(browser.html)) {
        return browser;
      }
    } catch {
      // Fall back to a raw fetch below.
    }
  }

  const raw = await fetchHtmlRaw(url, timeoutMs);
  if (raw.status > 0 && raw.status < 400 && !looksLikeAntiBotChallenge(raw.html)) {
    return raw;
  }

  if (!allowBrowserFallback) {
    return raw;
  }

  try {
    return await fetchHtmlInBrowser(url, timeoutMs);
  } catch {
    return raw;
  }
}

async function fetchHtmlRaw(url: string, timeoutMs: number): Promise<HtmlFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': defaultUserAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    return {
      html: await response.text(),
      contentType: response.headers.get('content-type'),
      finalUrl: response.url || url,
      status: response.status,
      method: 'raw',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHtmlInBrowser(
  url: string,
  timeoutMs: number,
): Promise<HtmlFetchResult> {
  ensureStealth();

  const browser = await puppeteer.launch(await resolveLaunchOptions());

  try {
    const page = await browser.newPage();
    await page.setUserAgent(defaultUserAgent);
    await page.setViewport({ width: 1366, height: 900 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Upgrade-Insecure-Requests': '1',
    });
    const navigationResponse = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: timeoutMs,
    });
    await hydrateBrowserPageForExtraction(page);

    return {
      html: await page.content(),
      contentType: 'text/html; charset=utf-8',
      finalUrl: page.url(),
      status: navigationResponse?.status() ?? 0,
      method: 'browser',
    };
  } finally {
    await browser.close();
  }
}

async function hydrateBrowserPageForExtraction(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const pause = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));
    const discoveredImages = new Map<string, { alt: string; src: string; srcset: string }>();
    const captureVisibleImages = () => {
      for (const image of Array.from(document.images)) {
        const src = image.getAttribute('src') || image.currentSrc || image.src;
        const srcset = image.getAttribute('srcset') || '';
        if (!src && !srcset) continue;
        const alt = image.getAttribute('alt') || '';
        discoveredImages.set(`${alt}\n${src}\n${srcset}`, { alt, src, srcset });
      }
    };
    const viewportHeight = Math.max(window.innerHeight, 700);
    // Menu and collection pages are frequently much taller than eight viewports. Sample the
    // full document instead of only its first ~7,000px so lazy-loaded item photos are present
    // in the serialized DOM. The caps keep unusually long/infinite feeds bounded.
    const maxScrollTop = Math.min(
      Math.max(document.documentElement.scrollHeight - viewportHeight, 0),
      120_000,
    );
    const stepCount = Math.min(48, Math.max(1, Math.ceil(maxScrollTop / 2_500)));
    captureVisibleImages();
    for (let step = 1; step <= stepCount; step += 1) {
      window.scrollTo(0, Math.round((maxScrollTop * step) / stepCount));
      await pause(120);
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
    headless: true,
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
