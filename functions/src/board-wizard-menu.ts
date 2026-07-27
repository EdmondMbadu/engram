import {
  matchBoardWizardMenuImage,
  type BoardWizardMenuImageCandidate,
} from './board-wizard-menu-images';

export type StructuredBoardWizardMenuItem = {
  title: string;
  description: string;
  price: string;
  category: string;
  imageUrl: string;
};

export function isBoardWizardMenuActionCard(value: {
  title: string;
  type: string;
  tags: string[];
}): boolean {
  if (value.type !== 'note') return false;
  const tags = new Set(value.tags.map((tag) => tag.toLowerCase()));
  return /^open\s+(?:the\s+)?menu$/i.test(value.title.trim())
    || (tags.has('action') && tags.has('menu'));
}

export function extractStructuredBoardWizardMenuItems(
  html: string,
  images: BoardWizardMenuImageCandidate[],
): StructuredBoardWizardMenuItem[] {
  const items: StructuredBoardWizardMenuItem[] = [];
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const script of scripts) {
    try {
      visitJsonLdMenuNode(JSON.parse(script[1]), '', items, images);
    } catch {
      continue;
    }
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 100);
}

function visitJsonLdMenuNode(
  value: unknown,
  inheritedCategory: string,
  items: StructuredBoardWizardMenuItem[],
  images: BoardWizardMenuImageCandidate[],
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitJsonLdMenuNode(item, inheritedCategory, items, images);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
  const isMenuSection = types.some((type) => stringValue(type).toLowerCase() === 'menusection');
  const category = isMenuSection
    ? stringValue(record.name).replace(/\s+/g, ' ').trim().slice(0, 90) || inheritedCategory
    : inheritedCategory;
  const isMenuItem = types.some((type) => stringValue(type).toLowerCase() === 'menuitem');
  if (isMenuItem) {
    const title = stripStructuredMenuMarkup(stringValue(record.name)).slice(0, 180);
    if (title) {
      items.push({
        title,
        description: stripStructuredMenuMarkup(stringValue(record.description)).slice(0, 260),
        price: structuredMenuPrice(record.offers),
        category,
        imageUrl: structuredMenuImage(record.image)
          || matchBoardWizardMenuImage(title, images),
      });
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (key === 'image' || key === 'offers') continue;
    visitJsonLdMenuNode(child, category, items, images);
  }
}

function structuredMenuPrice(value: unknown): string {
  const offer = Array.isArray(value) ? value[0] : value;
  if (!offer || typeof offer !== 'object') return '';
  const record = offer as Record<string, unknown>;
  const price = stringValue(record.price).trim();
  if (!price) return '';
  const currency = stringValue(record.priceCurrency).toUpperCase();
  const prefix = currency === 'USD' ? '$' : currency ? `${currency} ` : '';
  return `${prefix}${price}`.slice(0, 40);
}

function structuredMenuImage(value: unknown): string {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    return value.map(structuredMenuImage).find(Boolean) ?? '';
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return structuredMenuImage(record.url || record.contentUrl);
  }
  return '';
}

function stripStructuredMenuMarkup(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
