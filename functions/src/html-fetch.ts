import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

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
  options?: { timeoutMs?: number; preferBrowser?: boolean },
): Promise<HtmlFetchResult> {
  const timeoutMs = options?.timeoutMs ?? 60_000;
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
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: timeoutMs,
    });
    await sleep(750);

    return {
      html: await page.content(),
      contentType: 'text/html; charset=utf-8',
      finalUrl: page.url(),
      status: 200,
      method: 'browser',
    };
  } finally {
    await browser.close();
  }
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
