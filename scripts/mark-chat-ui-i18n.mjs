import ts from 'typescript';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../src/app/chat/chat.ts', import.meta.url));
const source = await readFile(file, 'utf8');
const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const replacements = [];

function templateText(value) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('`', '\\`')
    .replaceAll('${', '\\${');
}

function visit(node) {
  if (
    ts.isPropertyAssignment(node) &&
    node.name.getText(sourceFile).replace(/^['"]|['"]$/g, '') === 'en' &&
    ts.isObjectLiteralExpression(node.initializer)
  ) {
    for (const property of node.initializer.properties) {
      if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) {
        replacements.push({
          start: property.initializer.getStart(sourceFile),
          end: property.initializer.getEnd(),
          text: `$localize\`${templateText(property.initializer.text)}\``,
        });
      }
    }
  }
  ts.forEachChild(node, visit);
}

visit(sourceFile);
if (replacements.length) {
  let updated = source;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    updated = `${updated.slice(0, replacement.start)}${replacement.text}${updated.slice(replacement.end)}`;
  }
  await writeFile(file, updated);
}
