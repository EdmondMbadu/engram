import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const localeRoot = fileURLToPath(new URL('../src/locale/', import.meta.url));
const source = JSON.parse(await readFile(`${localeRoot}messages.json`, 'utf8'));
const targets = [
  ['fr', 'messages.fr.json'],
  ['ja', 'messages.ja.json'],
];
const placeholderPattern = /\{\$[^}]+\}|\{[A-Za-z][A-Za-z0-9_]*\}/g;

function placeholders(value) {
  return value.match(placeholderPattern) ?? [];
}

for (const [locale, filename] of targets) {
  const target = JSON.parse(await readFile(`${localeRoot}${filename}`, 'utf8'));
  if (target.locale !== locale) throw new Error(`${filename}: expected locale ${locale}`);

  const sourceIds = Object.keys(source.translations);
  const targetIds = Object.keys(target.translations);
  const missing = sourceIds.filter((id) => !(id in target.translations));
  const extra = targetIds.filter((id) => !(id in source.translations));
  if (missing.length || extra.length) {
    throw new Error(`${filename}: ${missing.length} missing and ${extra.length} stale messages`);
  }

  for (const id of sourceIds) {
    const expected = placeholders(source.translations[id]);
    const actual = placeholders(target.translations[id]);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new Error(`${filename}: placeholder mismatch for ${id}`);
    }
  }
  console.log(`${locale}: ${targetIds.length} complete translations`);
}
