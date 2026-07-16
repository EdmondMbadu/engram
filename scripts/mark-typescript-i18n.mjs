import ts from 'typescript';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const appRoot = fileURLToPath(new URL('../src/app/', import.meta.url));
const displayProperties = new Set([
  'addLabel',
  'buttonLabel',
  'caption',
  'description',
  'emptyLabel',
  'hint',
  'issue',
  'keyStat',
  'label',
  'message',
  'notes',
  'placeholder',
  'question',
  'subtitle',
  'summary',
  'tagline',
  'title',
]);

async function typescriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  }));
  return nested.flat();
}

function propertyName(node, sourceFile) {
  if (!node.name) return '';
  return node.name.getText(sourceFile).replace(/^['"]|['"]$/g, '');
}

function localizeLiteral(value) {
  return `$localize\`${value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\``;
}

function isDisplayName(name) {
  return /(Label|Title|Description|Placeholder|Message|Hint|Caption|Tagline|Text|Copy|Error)$/i.test(name);
}

for (const file of await typescriptFiles(appRoot)) {
  if (file.endsWith('/chat/chat.ts') || file.endsWith('/i18n/locales.ts')) continue;

  const source = await readFile(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const replacements = [];

  function addLiteral(node) {
    if (!ts.isStringLiteral(node) || !/[\p{L}]{2}/u.test(node.text)) return;
    replacements.push({
      start: node.getStart(sourceFile),
      end: node.end,
      text: localizeLiteral(node.text),
    });
  }

  function addLiteralsWithin(node) {
    if (ts.isStringLiteral(node)) {
      addLiteral(node);
      return;
    }
    ts.forEachChild(node, addLiteralsWithin);
  }

  function visit(node) {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
      const name = propertyName(node, sourceFile);
      if (displayProperties.has(name) && /[\p{L}]{2}/u.test(node.initializer.text)) {
        replacements.push({
          start: node.initializer.getStart(sourceFile),
          end: node.initializer.end,
          text: localizeLiteral(node.initializer.text),
        });
      }
    } else if (ts.isPropertyDeclaration(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = propertyName(node, sourceFile);
      if (isDisplayName(name)) {
        replacements.push({
          start: node.initializer.getStart(sourceFile),
          end: node.initializer.end,
          text: localizeLiteral(node.initializer.text),
        });
      }
    } else if (
      ts.isPropertyDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      isDisplayName(propertyName(node, sourceFile)) &&
      node.initializer.arguments[0]
    ) {
      addLiteralsWithin(node.initializer.arguments[0]);
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'set' &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
      isDisplayName(node.expression.expression.name.text) &&
      node.arguments[0]
    ) {
      addLiteralsWithin(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  if (!replacements.length) continue;

  let updated = source;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    if (source.slice(replacement.start - 10, replacement.start).includes('$localize')) continue;
    updated = `${updated.slice(0, replacement.start)}${replacement.text}${updated.slice(replacement.end)}`;
  }
  await writeFile(file, updated);
}
