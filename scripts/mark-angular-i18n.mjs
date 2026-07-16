import { parseTemplate, TmplAstBoundText, TmplAstElement, TmplAstText } from '@angular/compiler';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../src/app/', import.meta.url));
const translatableAttributes = new Set(['alt', 'aria-label', 'placeholder', 'title']);

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
  }));
  return nested.flat();
}

function hasWords(value) {
  return /[\p{L}]{2}/u.test(value.replace(/\{\{[\s\S]*?\}\}/g, ''));
}

function isMaterialIcon(element) {
  const classAttribute = element.attributes.find((attribute) => attribute.name === 'class');
  return classAttribute?.value.includes('material-symbols') ?? false;
}

function isProductBrand(element) {
  const text = element.sourceSpan.toString().replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return text === 'LivingWiki' || ((element.name === 'b' || element.name === 'span') && text === 'Living');
}

function directMessage(element) {
  if (isMaterialIcon(element) || isProductBrand(element) || ['script', 'style', 'code', 'pre'].includes(element.name)) return false;
  return element.children.some((child) => {
    if (child instanceof TmplAstText) return hasWords(child.value);
    if (child instanceof TmplAstBoundText) return false;
    return false;
  });
}

function collectInsertions(nodes, insertions, ancestorIsMessage = false) {
  for (const node of nodes) {
    if (node instanceof TmplAstElement) {
      const existing = new Set(node.attributes.map((attribute) => attribute.name));
      const openingTag = node.startSourceSpan.toString();
      const hasElementMarker = /(?:^|\s)i18n(?:=|\s|\/?>)/.test(openingTag);
      const markers = [];
      const elementIsMessage = !ancestorIsMessage && directMessage(node) && !hasElementMarker;
      if (elementIsMessage) markers.push('i18n');

      for (const attribute of node.attributes) {
        if (
          translatableAttributes.has(attribute.name) &&
          hasWords(attribute.value) &&
          !new RegExp(`(?:^|\\s)i18n-${attribute.name}(?:=|\\s|/?>)`).test(openingTag)
        ) {
          markers.push(`i18n-${attribute.name}`);
        }
      }

      if (markers.length) {
        const startText = node.startSourceSpan.toString();
        const closingLength = startText.endsWith('/>') ? 2 : 1;
        insertions.push({
          offset: node.startSourceSpan.end.offset - closingLength,
          text: ` ${markers.join(' ')}`,
        });
      }

      collectInsertions(node.children, insertions, ancestorIsMessage || elementIsMessage || hasElementMarker);
      continue;
    }

    if (Array.isArray(node.children)) collectInsertions(node.children, insertions, ancestorIsMessage);
    if (Array.isArray(node.branches)) {
      for (const branch of node.branches) collectInsertions(branch.children ?? [], insertions, ancestorIsMessage);
    }
    if (Array.isArray(node.cases)) {
      for (const switchCase of node.cases) collectInsertions(switchCase.children ?? [], insertions, ancestorIsMessage);
    }
    if (node.empty?.children) collectInsertions(node.empty.children, insertions, ancestorIsMessage);
  }
}

for (const file of await htmlFiles(appRoot)) {
  const original = await readFile(file, 'utf8');
  // Angular removes i18n marker attributes from the normal attribute AST. Normalize
  // duplicate markers before parsing so this command remains safely idempotent.
  const source = original.replace(
    /(\s(i18n(?:-[\w:-]+)?)(?:="[^"]*")?)(?:\s+\2(?:="[^"]*")?)+/g,
    '$1',
  );
  const parsed = parseTemplate(source, file, { preserveWhitespaces: true });
  if (parsed.errors?.length) {
    throw new Error(`${file}: ${parsed.errors.map((error) => error.toString()).join('\n')}`);
  }

  const insertions = [];
  collectInsertions(parsed.nodes, insertions);
  if (!insertions.length && source === original) continue;

  let updated = source;
  for (const insertion of insertions.sort((left, right) => right.offset - left.offset)) {
    updated = `${updated.slice(0, insertion.offset)}${insertion.text}${updated.slice(insertion.offset)}`;
  }
  await writeFile(file, updated);
}
