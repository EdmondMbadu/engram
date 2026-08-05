import chromium from '@sparticuz/chromium';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import puppeteer, { type Browser, type HTTPRequest } from 'puppeteer-core';

const PLAYER_ERROR_PATTERN = /\b(?:video unavailable|player configuration error|error\s+\d+|blocked it from display|watch on youtube)\b/i;
const DEFINITIVE_PLAYER_ERROR_CODES = new Set([5, 100, 101, 150]);

export function youtubeEmbedBodyIsPlayable(text: string, hasPlayer: boolean, hasPlayerError: boolean): boolean {
  return hasPlayer && !hasPlayerError && !PLAYER_ERROR_PATTERN.test(text);
}

export type YouTubeEmbedVerificationStatus = 'playable' | 'blocked' | 'unavailable';

export type YouTubeEmbedVerification = {
  status: YouTubeEmbedVerificationStatus;
  errorCode: number;
  reason: string;
};

export function classifyYouTubeEmbedVerification(input: {
  text: string;
  hasPlayer: boolean;
  hasPlayerError: boolean;
  apiReady: boolean;
  errorCode: number;
}): YouTubeEmbedVerification {
  const errorCode = Number.isFinite(input.errorCode) ? Math.trunc(input.errorCode) : 0;
  if (DEFINITIVE_PLAYER_ERROR_CODES.has(errorCode)) {
    return { status: 'blocked', errorCode, reason: `player-error-${errorCode}` };
  }
  if (input.hasPlayerError || PLAYER_ERROR_PATTERN.test(input.text)) {
    return { status: 'blocked', errorCode, reason: 'player-error-message' };
  }
  if (errorCode) {
    return { status: 'unavailable', errorCode, reason: `verifier-error-${errorCode}` };
  }
  if (input.apiReady || youtubeEmbedBodyIsPlayable(input.text, input.hasPlayer, input.hasPlayerError)) {
    return { status: 'playable', errorCode: 0, reason: 'player-ready' };
  }
  return { status: 'unavailable', errorCode: 0, reason: 'player-did-not-settle' };
}

export type YouTubeEmbedVerifier = {
  verify(videoId: string, deadlineAt?: number): Promise<YouTubeEmbedVerification>;
  close(): Promise<void>;
};

export function createYouTubeEmbedVerifier(maxConcurrency = 5): YouTubeEmbedVerifier {
  let browserPromise: Promise<Browser> | null = null;
  let originPromise: Promise<{ server: Server; origin: string }> | null = null;
  const cached = new Map<string, Promise<YouTubeEmbedVerification>>();
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
          const host = typeof request.headers.host === 'string' ? request.headers.host : '127.0.0.1';
          const origin = `http://${host}`;
          const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${safeId}`);
          embedUrl.searchParams.set('enablejsapi', '1');
          embedUrl.searchParams.set('origin', origin);
          embedUrl.searchParams.set('playsinline', '1');
          embedUrl.searchParams.set('rel', '0');
          response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline' https://www.youtube.com; frame-src https://www.youtube-nocookie.com",
          });
          response.end(`<!doctype html><html><body>
            <iframe id="player" title="YouTube verification" allow="encrypted-media" referrerpolicy="strict-origin-when-cross-origin" src="${embedUrl.toString()}"></iframe>
            <script>window.__livingWikiYouTubeVerification={apiReady:false,errorCode:0};</script>
            <script src="https://www.youtube.com/iframe_api"></script>
            <script>
              function onYouTubeIframeAPIReady(){
                new YT.Player('player',{events:{
                  onReady:function(){window.__livingWikiYouTubeVerification.apiReady=true;},
                  onError:function(event){window.__livingWikiYouTubeVerification.errorCode=Number(event.data)||-1;}
                }});
              }
            </script>
          </body></html>`);
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

  const verify = (videoId: string, deadlineAt?: number): Promise<YouTubeEmbedVerification> => {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      return Promise.resolve({ status: 'blocked', errorCode: 2, reason: 'invalid-video-id' });
    }
    if (deadlineAt && Date.now() >= deadlineAt - 750) {
      return Promise.resolve({ status: 'unavailable', errorCode: 0, reason: 'verification-deadline' });
    }
    const existing = cached.get(videoId);
    if (existing) return existing;
    const pending = runLimited<YouTubeEmbedVerification>(async () => {
      let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
      try {
        if (deadlineAt && Date.now() >= deadlineAt - 750) {
          return { status: 'unavailable', errorCode: 0, reason: 'verification-deadline' };
        }
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
          timeout: Math.max(500, Math.min(8_000, deadlineAt ? deadlineAt - Date.now() - 500 : 8_000)),
        });
        const settleMs = Math.max(0, Math.min(2_200, deadlineAt ? deadlineAt - Date.now() - 400 : 2_200));
        if (settleMs) await new Promise((resolve) => setTimeout(resolve, settleMs));
        const frame = page.frames().find((candidate) => candidate.url().includes('youtube-nocookie.com/embed/'));
        if (!frame) {
          return { status: 'unavailable', errorCode: 0, reason: 'player-frame-missing' };
        }
        const [apiResult, frameResult] = await Promise.all([
          page.evaluate(() => {
            const state = (window as typeof window & {
              __livingWikiYouTubeVerification?: { apiReady?: boolean; errorCode?: number };
            }).__livingWikiYouTubeVerification;
            return {
              apiReady: state?.apiReady === true,
              errorCode: Number(state?.errorCode) || 0,
            };
          }),
          frame.evaluate(() => ({
          text: document.body?.innerText?.replace(/\s+/g, ' ').trim() ?? '',
          hasPlayer: !!document.querySelector('.html5-video-player'),
          hasPlayerError: !!document.querySelector('.ytp-error, .ytp-error-content-wrap-reason'),
          })),
        ]);
        return classifyYouTubeEmbedVerification({
          ...frameResult,
          ...apiResult,
        });
      } catch (error) {
        return {
          status: 'unavailable',
          errorCode: 0,
          reason: error instanceof Error ? `verifier-failed:${error.name}` : 'verifier-failed',
        };
      } finally {
        await page?.close().catch(() => undefined);
      }
    });
    cached.set(videoId, pending);
    return pending;
  };

  return {
    verify,
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
