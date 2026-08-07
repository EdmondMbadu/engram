import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export type BoardWizardSourceItem = {
  id: string;
  title: string;
  excerpt: string;
  imageUrl: string;
  sourceIndex: number;
};

export type BoardWizardSourceManifest = {
  kind: 'article-list';
  sourceUrl: string;
  finalUrl: string;
  pageTitle: string;
  siteName: string;
  expectedCount: number | null;
  confidence: number;
  method: 'page' | 'reader';
  sourceBlocked: boolean;
  items: BoardWizardSourceItem[];
};

type ArticleSection = {
  title: string;
  excerpt: string;
  imageUrl: string;
};

const headingNoise = /^(?:related stories?|read more|more from|you may also like|recommended|about the author|sources?|references?|newsletter|sign up|comments?|advertisement)$/i;

export function extractBoardWizardReadableText(baseUrl: string, html: string): string {
  try {
    const dom = new JSDOM(html, { url: safeHttpUrl(baseUrl) || undefined });
    const article = new Readability(dom.window.document.cloneNode(true) as Document).parse();
    return cleanText(article?.textContent || dom.window.document.body?.textContent || '').slice(0, 20_000);
  } catch {
    return '';
  }
}

export function extractBoardWizardArticleManifest(
  inputUrl: string,
  finalUrl: string,
  html: string,
): BoardWizardSourceManifest | null {
  if (!html.trim()) return null;

  try {
    const baseUrl = safeHttpUrl(finalUrl) || safeHttpUrl(inputUrl);
    if (!baseUrl) return null;
    const dom = new JSDOM(html, { url: baseUrl });
    const article = new Readability(dom.window.document.cloneNode(true) as Document).parse();
    if (!article?.content || !article.textContent?.trim()) return null;

    const articleDom = new JSDOM(article.content, { url: baseUrl });
    const document = articleDom.window.document;
    const pageTitle = cleanText(article.title || document.title).slice(0, 220);
    const expectedCount = expectedListCount(pageTitle);
    let sections = extractHeadingSections(document, baseUrl);

    if (sections.length < 2) {
      sections = extractOrderedListSections(document, baseUrl);
    }
    sections = alignCombinedHeadingsToExpectedCount(sections, expectedCount);
    if (!isUsefulArticleList(sections, expectedCount)) return null;

    return buildManifest({
      inputUrl,
      finalUrl: baseUrl,
      pageTitle,
      siteName: siteNameFromDocument(dom.window.document, baseUrl),
      expectedCount,
      sections,
      method: 'page',
      sourceBlocked: false,
    });
  } catch {
    return null;
  }
}

export function extractBoardWizardArticleManifestFromMarkdown(
  inputUrl: string,
  markdown: string,
): BoardWizardSourceManifest | null {
  if (!markdown.trim()) return null;
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const pageTitle = cleanText(
    lines.find((line) => /^Title:\s+/i.test(line))?.replace(/^Title:\s+/i, '')
      || lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, '')
      || '',
  ).slice(0, 220);
  const expectedCount = expectedListCount(pageTitle);
  const sections: ArticleSection[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index]?.trim().match(/^#{2,4}\s+(.+?)\s*$/);
    if (!heading) continue;
    const title = cleanHeading(heading[1]);
    if (!isUsefulHeading(title)) continue;
    const body: string[] = [];
    let imageUrl = '';
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]?.trim() ?? '';
      if (/^#{1,4}\s+/.test(line)) break;
      const image = line.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i);
      if (image?.[1] && !imageUrl) imageUrl = safeHttpUrl(image[1]);
      const text = cleanText(line.replace(/!\[[^\]]*\]\([^)]*\)/g, ' '));
      if (text) body.push(text);
    }
    sections.push({ title, excerpt: body.join(' ').slice(0, 900), imageUrl });
  }

  const aligned = alignCombinedHeadingsToExpectedCount(sections, expectedCount);
  if (!isUsefulArticleList(aligned, expectedCount)) return null;
  return buildManifest({
    inputUrl,
    finalUrl: inputUrl,
    pageTitle,
    siteName: safeHostname(inputUrl),
    expectedCount,
    sections: aligned,
    method: 'reader',
    sourceBlocked: false,
  });
}

export function normalizeBoardWizardSourceManifest(
  value: unknown,
  requiredSourceUrl = '',
): BoardWizardSourceManifest | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const sourceUrl = safeHttpUrl(text(data.sourceUrl));
  const required = safeHttpUrl(requiredSourceUrl);
  if (!sourceUrl || (required && canonicalUrl(sourceUrl) !== canonicalUrl(required))) return null;
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems.flatMap((item, index): BoardWizardSourceItem[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const title = cleanHeading(text(record.title)).slice(0, 80);
    if (!isUsefulHeading(title)) return [];
    return [{
      id: text(record.id).slice(0, 80) || `source-${index + 1}`,
      title,
      excerpt: cleanText(text(record.excerpt)).slice(0, 1200),
      imageUrl: safeHttpUrl(text(record.imageUrl)),
      sourceIndex: index + 1,
    }];
  }).slice(0, 100);
  if (items.length < 2) return null;
  const expected = numberOrNull(data.expectedCount, 1, 100);
  return {
    kind: 'article-list',
    sourceUrl,
    finalUrl: safeHttpUrl(text(data.finalUrl)) || sourceUrl,
    pageTitle: cleanText(text(data.pageTitle)).slice(0, 220),
    siteName: cleanText(text(data.siteName)).slice(0, 120) || safeHostname(sourceUrl),
    expectedCount: expected,
    confidence: clampNumber(data.confidence, 0, 1, manifestConfidence(items, expected)),
    method: data.method === 'reader' ? 'reader' : 'page',
    sourceBlocked: data.sourceBlocked === true,
    items,
  };
}

export function boardWizardSourceManifestIsExact(manifest: BoardWizardSourceManifest): boolean {
  return manifest.items.length >= 2
    && manifest.expectedCount !== null
    && manifest.expectedCount === manifest.items.length
    && manifest.confidence >= 0.8;
}

export function alignBoardWizardSourceCards<T extends { title: string }>(
  items: BoardWizardSourceItem[],
  cards: T[],
): Array<{ item: BoardWizardSourceItem; card: T | undefined }> {
  const cardsByTitle = new Map(cards.map((card) => [normalizedSourceTitle(card.title), card] as const));
  return items.map((item, index) => ({
    item,
    card: cardsByTitle.get(normalizedSourceTitle(item.title)) ?? cards[index],
  }));
}

function extractHeadingSections(document: Document, baseUrl: string): ArticleSection[] {
  const headings = Array.from(document.querySelectorAll<HTMLElement>('h2, h3, h4'));
  const sections: ArticleSection[] = [];
  for (const heading of headings) {
    const title = cleanHeading(heading.textContent ?? '');
    if (!isUsefulHeading(title)) continue;
    const body: string[] = [];
    let imageUrl = '';
    let node = heading.nextElementSibling;
    while (node && !/^H[1-4]$/.test(node.tagName)) {
      const element = node as HTMLElement;
      if (!imageUrl) imageUrl = firstElementImage(element, baseUrl);
      if (/^(?:P|BLOCKQUOTE|UL|OL|DIV|FIGURE|SECTION)$/.test(element.tagName)) {
        const value = cleanText(element.textContent ?? '');
        if (value && !/^image\s*:/i.test(value)) body.push(value);
      }
      node = node.nextElementSibling;
    }
    sections.push({
      title,
      excerpt: dedupeText(body.join(' ')).slice(0, 900),
      imageUrl,
    });
  }
  return dedupeSections(sections);
}

function extractOrderedListSections(document: Document, baseUrl: string): ArticleSection[] {
  const lists = Array.from(document.querySelectorAll<HTMLOListElement>('ol'))
    .map((list) => Array.from(list.children).filter((child) => child.tagName === 'LI'))
    .sort((left, right) => right.length - left.length);
  const items = lists[0] ?? [];
  if (items.length < 2) return [];
  return dedupeSections(items.flatMap((item): ArticleSection[] => {
    const element = item as HTMLElement;
    const strong = element.querySelector<HTMLElement>('h2,h3,h4,strong,b');
    const fullText = cleanText(element.textContent ?? '');
    const title = cleanHeading(strong?.textContent || fullText.split(/[.!?]\s/)[0] || '');
    if (!isUsefulHeading(title)) return [];
    const excerpt = fullText.startsWith(title) ? fullText.slice(title.length).trim() : fullText;
    return [{ title, excerpt: excerpt.slice(0, 900), imageUrl: firstElementImage(element, baseUrl) }];
  }));
}

function alignCombinedHeadingsToExpectedCount(
  sections: ArticleSection[],
  expectedCount: number | null,
): ArticleSection[] {
  if (!expectedCount || sections.length !== expectedCount - 1) return sections;
  for (let index = 0; index < sections.length; index += 1) {
    const split = splitCombinedLocationHeading(sections[index].title);
    if (!split) continue;
    return [
      ...sections.slice(0, index),
      { ...sections[index], title: split[0] },
      { ...sections[index], title: split[1] },
      ...sections.slice(index + 1),
    ];
  }
  return sections;
}

function splitCombinedLocationHeading(value: string): [string, string] | null {
  const sharedLocation = value.match(/^(.{2,70}?)\s+and\s+(.{2,70}?)\s+in\s+((?:New\s+)?[A-Z][A-Za-z .'-]{2,50})$/);
  if (sharedLocation) {
    return [
      `${cleanHeading(sharedLocation[1])}, ${cleanHeading(sharedLocation[3])}`,
      `${cleanHeading(sharedLocation[2])}, ${cleanHeading(sharedLocation[3])}`,
    ];
  }
  return null;
}

function buildManifest(input: {
  inputUrl: string;
  finalUrl: string;
  pageTitle: string;
  siteName: string;
  expectedCount: number | null;
  sections: ArticleSection[];
  method: 'page' | 'reader';
  sourceBlocked: boolean;
}): BoardWizardSourceManifest {
  const items = input.sections.slice(0, 100).map((section, index): BoardWizardSourceItem => ({
    id: `source-${index + 1}`,
    title: section.title.slice(0, 80),
    excerpt: section.excerpt.slice(0, 1200),
    imageUrl: section.imageUrl,
    sourceIndex: index + 1,
  }));
  return {
    kind: 'article-list',
    sourceUrl: safeHttpUrl(input.inputUrl),
    finalUrl: safeHttpUrl(input.finalUrl) || safeHttpUrl(input.inputUrl),
    pageTitle: input.pageTitle,
    siteName: input.siteName,
    expectedCount: input.expectedCount,
    confidence: manifestConfidence(items, input.expectedCount),
    method: input.method,
    sourceBlocked: input.sourceBlocked,
    items,
  };
}

function manifestConfidence(items: BoardWizardSourceItem[], expectedCount: number | null): number {
  const described = items.filter((item) => item.excerpt.length >= 40).length / Math.max(1, items.length);
  const expectedAgreement = expectedCount ? (expectedCount === items.length ? 1 : 0) : 0.85;
  return Math.round(Math.min(0.99, 0.5 + described * 0.25 + expectedAgreement * 0.24) * 100) / 100;
}

function isUsefulArticleList(sections: ArticleSection[], expectedCount: number | null): boolean {
  if (sections.length < 2 || sections.length > 100) return false;
  if (expectedCount && Math.abs(expectedCount - sections.length) > Math.max(2, Math.ceil(expectedCount * 0.2))) return false;
  return sections.filter((section) => section.excerpt.length >= 25).length >= Math.min(2, sections.length);
}

function isUsefulHeading(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  return value.length >= 2 && value.length <= 180 && words.length <= 24 && !headingNoise.test(value);
}

function dedupeSections(sections: ArticleSection[]): ArticleSection[] {
  const seen = new Set<string>();
  return sections.filter((section) => {
    const key = section.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstElementImage(element: HTMLElement, baseUrl: string): string {
  const image = element.matches('img') ? element as HTMLImageElement : element.querySelector<HTMLImageElement>('img');
  if (!image) return '';
  const srcset = image.getAttribute('srcset') || image.getAttribute('data-srcset') || '';
  const bestSrcset = srcset.split(',').map((entry) => entry.trim().split(/\s+/)[0]).filter(Boolean).at(-1) || '';
  return resolveHttpUrl(
    image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('data-lazy-src') || bestSrcset,
    baseUrl,
  );
}

function expectedListCount(title: string): number | null {
  const match = title.match(/(?:^|\b)(\d{1,3})\s+(?:most|best|top|underrated|places?|destinations?|cities?|items?|ways?|things?)/i)
    || title.match(/\b(?:top|best)\s+(\d{1,3})\b/i);
  const value = match?.[1] ? Number(match[1]) : 0;
  return Number.isInteger(value) && value >= 2 && value <= 100 ? value : null;
}

function siteNameFromDocument(document: Document, baseUrl: string): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content;
  return cleanText(meta || safeHostname(baseUrl)).slice(0, 120);
}

function cleanHeading(value: string): string {
  return cleanText(value).replace(/^\d{1,3}[.)]\s+/, '').replace(/\s+[|–—-]\s+[^|–—]{2,50}$/, '').trim();
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function dedupeText(value: string): string {
  const sentences = value.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  return sentences.filter((sentence) => {
    const key = sentence.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(' ');
}

function resolveHttpUrl(value: string | null, baseUrl: string): string {
  if (!value) return '';
  try {
    return safeHttpUrl(new URL(value, baseUrl).toString());
  } catch {
    return '';
  }
}

function safeHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function safeHostname(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value;
  }
}

function normalizedSourceTitle(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrNull(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(text(value), 10);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}
