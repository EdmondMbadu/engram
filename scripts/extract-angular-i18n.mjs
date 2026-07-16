import { computeMsgId, parseTemplate, TmplAstElement } from '@angular/compiler';
import ts from 'typescript';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const appRoot = join(workspaceRoot, 'src/app');
const outputDirectory = join(workspaceRoot, 'src/locale');
const messages = new Map();

async function sourceFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [path] : [];
  }));
  return nested.flat();
}

function addMessage(message, file) {
  if (!message || typeof message.messageString !== 'string') return;
  // Angular's build localizer hashes the whitespace-normalized message string.
  // The parser's `id` can still reflect the original source whitespace, so
  // recomputing here is required for catalogs that exactly match production.
  // The template parser exposes an internal empty-container token after void
  // elements (`br`, `img`, `input`) that the build localizer omits.
  const source = message.messageString.replaceAll('{$}', '');
  const id = message.customId || computeMsgId(source, message.meaning ?? '');
  if (!id || messages.has(id)) return;
  messages.set(id, {
    source,
    file: relative(workspaceRoot, file),
  });
}

function visitTemplateNodes(nodes, file) {
  for (const node of nodes) {
    addMessage(node.i18n, file);
    if (node instanceof TmplAstElement) {
      for (const attribute of [...node.attributes, ...node.inputs]) addMessage(attribute.i18n, file);
    }
    if (Array.isArray(node.children)) visitTemplateNodes(node.children, file);
    if (Array.isArray(node.branches)) {
      for (const branch of node.branches) visitTemplateNodes(branch.children ?? [], file);
    }
    if (Array.isArray(node.cases)) {
      for (const switchCase of node.cases) visitTemplateNodes(switchCase.children ?? [], file);
    }
    if (node.empty?.children) visitTemplateNodes(node.empty.children, file);
  }
}

for (const file of await sourceFiles(appRoot, '.html')) {
  const source = await readFile(file, 'utf8');
  const parsed = parseTemplate(source, relative(workspaceRoot, file), {
    // Match Angular's default template compilation whitespace normalization.
    preserveWhitespaces: false,
    enableI18nLegacyMessageIdFormat: false,
  });
  if (parsed.errors?.length) throw new Error(parsed.errors.map((error) => error.toString()).join('\n'));
  visitTemplateNodes(parsed.nodes, file);
}

for (const file of await sourceFiles(appRoot, '.ts')) {
  const source = await readFile(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (
      ts.isTaggedTemplateExpression(node) &&
      node.tag.getText(sourceFile) === '$localize' &&
      ts.isNoSubstitutionTemplateLiteral(node.template)
    ) {
      const text = node.template.text;
      const id = computeMsgId(text, '');
      if (!messages.has(id)) messages.set(id, { source: text, file: relative(workspaceRoot, file) });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const sorted = [...messages.entries()].sort((left, right) => left[0].localeCompare(right[0]));
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  join(outputDirectory, 'messages.json'),
  `${JSON.stringify({
    locale: 'en-US',
    translations: Object.fromEntries(sorted.map(([id, message]) => [id, message.source])),
  }, null, 2)}\n`,
);
await writeFile(
  join(outputDirectory, 'messages.metadata.json'),
  `${JSON.stringify(Object.fromEntries(sorted), null, 2)}\n`,
);
console.log(`Extracted ${sorted.length} messages.`);
