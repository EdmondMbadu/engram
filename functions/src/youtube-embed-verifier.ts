import chromium from '@sparticuz/chromium';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import puppeteer, { type Browser, type HTTPRequest } from 'puppeteer-core';

const PLAYER_ERROR_PATTERN = /\b(?:video unavailable|player configuration error|error\s+\d+|blocked it from display|watch on youtube)\b/i;

export function youtubeEmbedBodyIsPlayable(text: string, hasPlayer: boolean, hasPlayerError: boolean): boolean {
  return hasPlayer && !hasPlayerError && !PLAYER_ERROR_PATTERN.test(text);
}

export type YouTubeEmbedVerifier = {
  isPlayable(videoId: string): Promise<boolean>;
  close(): Promise<void>;
};

export function createYouTubeEmbedVerifier(maxConcurrency = 5): YouTubeEmbedVerifier {
  let browserPromise: Promise<Browser> | null = null;
  let originPromise: Promise<{ server: Server; origin: string }> | null = null;
  const cached = new Map<string, Promise<boolean>>();
  const queue: Array<() => void> = [];
  let active = 0;

  const runLimited = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (active >= maxConcurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await operation();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };

  const getOrigin = async (): Promise<{ server: Server; origin: string }> => {
    if (!originPromise) {
      originPromise = new Promise((resolve, reject) => {
        const server = createServer((request, response) => {
          const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
          const videoId = requestUrl.searchParams.get('video') ?? '';
          const safeId = /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : '';
          response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'; frame-src https://www.youtube-nocookie.com",
          });
          response.end(`<!doctype html><html><body><iframe title="YouTube verification" allow="autoplay; encrypted-media" src="https://www.youtube-nocookie.com/embed/${safeId}?autoplay=1&playsinline=1&rel=0"></iframe></body></html>`);
        });
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject);
          const address = server.address() as AddressInfo;
          resolve({ server, origin: `http://127.0.0.1:${address.port}` });
        });
      });
    }
    return originPromise;
  };

  const getBrowser = async (): Promise<Browser> => {
    if (!browserPromise) {
      browserPromise = (async () => {
        const isLocalMac = process.platform === 'darwin';
        if (isLocalMac) {
          return await puppeteer.launch({
            headless: true,
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
        }
        chromium.setGraphicsMode = false;
        return await puppeteer.launch({
          headless: 'shell',
          executablePath: await chromium.executablePath(),
          args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
        });
      })();
    }
    return browserPromise;
  };

  const verify = (videoId: string): Promise<boolean> => {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return Promise.resolve(false);
    const existing = cached.get(videoId);
    if (existing) return existing;
    const pending = runLimited(async () => {
      let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
      try {
        const [{ origin }, browser] = await Promise.all([getOrigin(), getBrowser()]);
        page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', (request: HTTPRequest) => {
          const resourceType = request.resourceType();
          if (resourceType === 'media' || resourceType === 'font' || resourceType === 'image') {
            void request.abort().catch(() => undefined);
          } else {
            void request.continue().catch(() => undefined);
          }
        });
        await page.goto(`${origin}/?video=${encodeURIComponent(videoId)}`, {
          waitUntil: 'domcontentloaded',
          timeout: 12_000,
        });
        await new Promise((resolve) => setTimeout(resolve, 1_800));
        const frame = page.frames().find((candidate) => candidate.url().includes('youtube-nocookie.com/embed/'));
        if (!frame) return false;
        const result = await frame.evaluate(() => ({
          text: document.body?.innerText?.replace(/\s+/g, ' ').trim() ?? '',
          hasPlayer: !!document.querySelector('.html5-video-player'),
          hasPlayerError: !!document.querySelector('.ytp-error, .ytp-error-content-wrap-reason'),
        }));
        return youtubeEmbedBodyIsPlayable(result.text, result.hasPlayer, result.hasPlayerError);
      } catch {
        return false;
      } finally {
        await page?.close().catch(() => undefined);
      }
    });
    cached.set(videoId, pending);
    return pending;
  };

  return {
    isPlayable: verify,
    async close(): Promise<void> {
      const browser = browserPromise ? await browserPromise.catch(() => null) : null;
      await browser?.close().catch(() => undefined);
      const origin = originPromise ? await originPromise.catch(() => null) : null;
      if (origin) {
        await new Promise<void>((resolve) => origin.server.close(() => resolve()));
      }
    },
  };
}
