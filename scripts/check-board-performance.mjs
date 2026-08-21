import { gzipSync } from 'node:zlib';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const outputDirectory = join(process.cwd(), 'dist', 'living-atlast', 'browser');
const names = await readdir(outputDirectory);
const javascriptNames = names.filter((name) => name.endsWith('.js'));
const entries = await Promise.all(javascriptNames.map(async (name) => {
  const path = join(outputDirectory, name);
  const bytes = await readFile(path);
  return { name, path, bytes, gzipBytes: gzipSync(bytes).byteLength, rawBytes: (await stat(path)).size };
}));

const main = entries.find((entry) => entry.name.startsWith('main-'));
const boards = entries.find((entry) => entry.bytes.includes(Buffer.from('app-boards')));
if (!main || !boards) throw new Error('Could not identify the main and boards production bundles.');

const budgets = [
  { label: 'main', entry: main, maxGzipBytes: 450_000 },
  { label: 'boards feature', entry: boards, maxGzipBytes: 330_000 },
];

let failed = false;
for (const budget of budgets) {
  const kib = (budget.entry.gzipBytes / 1024).toFixed(1);
  const maxKib = (budget.maxGzipBytes / 1024).toFixed(1);
  console.log(`${budget.label}: ${budget.entry.name} — ${kib} KiB gzip (budget ${maxKib} KiB)`);
  if (budget.entry.gzipBytes > budget.maxGzipBytes) failed = true;
}
if (failed) {
  throw new Error('A production JavaScript performance budget was exceeded. Split or defer code before shipping.');
}
