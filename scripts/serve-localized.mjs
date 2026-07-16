import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const browserRoot = join(workspaceRoot, 'dist/living-atlast/browser');
const port = Number.parseInt(process.env.PORT ?? '4200', 10);
// Browsers may resolve localhost to either address. Claim both explicitly so a
// second dev server cannot silently take one address and receive some requests.
const configuredHost = process.env.HOST?.trim();
const listenHosts = configuredHost ? [configuredHost] : ['127.0.0.1', '::1'];
const displayHost = configuredHost && configuredHost !== '127.0.0.1' && configuredHost !== '::1'
  ? configuredHost
  : 'localhost';
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function localeFallback(pathname) {
  if (pathname === '/fr' || pathname.startsWith('/fr/')) return 'fr/index.html';
  if (pathname === '/ja' || pathname.startsWith('/ja/')) return 'ja/index.html';
  return 'index.html';
}

async function resolvedFile(pathname, acceptsHtml) {
  const decoded = decodeURIComponent(pathname);
  const relativePath = normalize(decoded).replace(/^[/\\]+/, '');
  if (relativePath === '..' || relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    return null;
  }

  let candidate = join(browserRoot, relativePath);
  try {
    const details = await stat(candidate);
    if (details.isDirectory()) candidate = join(candidate, 'index.html');
    await stat(candidate);
    return candidate;
  } catch {
    if (!acceptsHtml || extname(relativePath)) return null;
    return join(browserRoot, localeFallback(decoded));
  }
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `localhost:${port}`}`);
    const acceptsHtml = (request.headers.accept ?? '').includes('text/html');
    const file = await resolvedFile(url.pathname, acceptsHtml || request.method === 'HEAD');
    if (!file) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const body = await readFile(file);
    const isHtml = extname(file) === '.html';
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Internal server error');
  }
}

function portIsInUse(address) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: address, port });
    socket.setTimeout(300);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

const occupiedHost = (await Promise.all(listenHosts.map(async (host) => ({
  host,
  occupied: await portIsInUse(host),
})))).find(({ occupied }) => occupied)?.host;

if (occupiedHost) {
  console.error(`Port ${port} is already in use.`);
  console.error('Stop the existing ng serve process, then run npm start again.');
  process.exitCode = 1;
} else {
  const servers = listenHosts.map(() => createServer(handleRequest));

  try {
    await Promise.all(servers.map((server, index) => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ port, host: listenHosts[index] }, () => {
        server.off('error', reject);
        resolve();
      });
    })));

    console.log(`LivingWiki localized server: http://${displayHost}:${port}`);
    console.log('English: /  French: /fr/  Japanese: /ja/');
  } catch (error) {
    await Promise.all(servers.map((server) => new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(resolve);
    })));
    throw error;
  }
}
