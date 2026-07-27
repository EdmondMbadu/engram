import { JSDOM } from 'jsdom';

export type CommerceImageSource = 'source-page' | 'product-page' | 'missing';
export type CommerceProductSource = 'structured-data' | 'dom' | 'product-meta';

export type CommerceProduct = {
  name: string;
  description: string;
  productUrl: string;
  imageUrl: string;
  imageCandidates: string[];
  imageSource: CommerceImageSource;
  price: string;
  currency: string;
  brand: string;
  category: string;
  sku: string;
  availability: string;
  position: number;
  confidence: number;
  sourceKind: CommerceProductSource;
};

export type CommercePageExtraction = {
  isCommerce: boolean;
  confidence: number;
  sourceUrl: string;
  finalUrl: string;
  pageTitle: string;
  siteName: string;
  brand: string;
  products: CommerceProduct[];
  evidence: string[];
};

const productContainerSelector = [
  '[itemtype*="schema.org/Product"]',
  '[itemtype$="/Product"]',
  '[itemprop="itemListElement"]',
  '[data-product-id]',
  '[data-product]',
  '[data-product-name]',
  '[data-testid*="product"]',
  '[class*="product-card"]',
  '[class*="product-tile"]',
  'article',
  'li',
].join(',');

const productNameSelector = [
  '[itemprop="name"]',
  '[data-product-name]',
  '[class*="product-name"]',
  '[class*="product-title"]',
  'h1',
  'h2',
  'h3',
  'h4',
].join(',');

const priceSelector = [
  '[itemprop="price"]',
  '[data-price]',
  '[class*="price"]',
  '[aria-label*="price" i]',
].join(',');

const productPathPattern =
  /\/(?:products?|p|dp|item|sku)\/|\/[^/?#]*-nvprod\d+|[?&](?:product|sku|pid|item)=/i;
const pricePattern =
  /(?:US\$|CA\$|AU\$|NZ\$|HK\$|S\$|£|€|¥|\$)\s?\d[\d,.]*(?:\s?(?:USD|CAD|AUD|EUR|GBP|JPY))?/i;
const noiseNamePattern =
  /^(?:image|shop(?: now)?|view|learn more|discover|explore|buy now|add to (?:bag|cart)|quick view|new|featured|women|men|beauty|home)$/i;
const nonProductImagePattern =
  /(?:logo|icon|sprite|avatar|spacer|tracking|pixel|loader|placeholder|payment|flag|favicon)/i;

export function extractCommercePage(
  inputUrl: string,
  finalUrl: string,
  html: string,
): CommercePageExtraction {
  const sourceUrl = safeHttpUrl(inputUrl, inputUrl);
  const baseUrl = safeHttpUrl(finalUrl, sourceUrl) || sourceUrl;
  const dom = new JSDOM(html, { url: baseUrl });
  const document = dom.window.document;
  const pageTitle = cleanText(document.title, 180);
  const siteName = firstMeta(document, ['og:site_name', 'application-name']);
  const pageBrand = firstMeta(document, ['product:brand']) || siteName;

  const structuredProducts = extractStructuredProducts(document, baseUrl, pageBrand);
  const domProducts = extractDomProducts(document, baseUrl, pageBrand);
  const metaProduct = extractProductMeta(document, baseUrl, pageBrand);
  const products = mergeProducts([
    ...structuredProducts,
    ...domProducts,
    ...(metaProduct ? [metaProduct] : []),
  ]).slice(0, 100);

  const explicitProductEvidence =
    structuredProducts.length > 0 ||
    document.querySelector('[itemtype*="Product"], [data-product-id], [data-product-name]') !== null ||
    /(?:^|\s)product(?:\s|$)/i.test(firstMeta(document, ['og:type']));
  const strongDomProductCount = domProducts.filter((product) => product.confidence >= 0.72).length;
  const isCommerce =
    products.length >= 3 ||
    (explicitProductEvidence && products.length >= 1) ||
    strongDomProductCount >= 2;
  const confidence = isCommerce
    ? clampConfidence(
        (structuredProducts.length ? 0.82 : 0.58) +
          Math.min(0.14, products.length * 0.02) +
          (products.filter((product) => product.imageUrl).length === products.length ? 0.04 : 0),
      )
    : 0;
  const evidence = [
    structuredProducts.length
      ? `${structuredProducts.length} product record${structuredProducts.length === 1 ? '' : 's'} in structured data`
      : '',
    domProducts.length
      ? `${domProducts.length} product tile${domProducts.length === 1 ? '' : 's'} with locally bound names, links, and images`
      : '',
    metaProduct ? 'product-specific page metadata' : '',
  ].filter(Boolean);

  return {
    isCommerce,
    confidence,
    sourceUrl,
    finalUrl: baseUrl,
    pageTitle,
    siteName,
    brand: mostCommon(products.map((product) => product.brand).filter(Boolean)) || pageBrand,
    products,
    evidence,
  };
}

export function mergeCommerceProductDetail(
  product: CommerceProduct,
  detail: CommercePageExtraction,
): CommerceProduct {
  const match =
    detail.products.find((candidate) => sameCanonicalUrl(candidate.productUrl, product.productUrl)) ??
    detail.products.find((candidate) => normalizedKey(candidate.name) === normalizedKey(product.name)) ??
    (detail.products.length === 1 ? detail.products[0] : null);
  if (!match) {
    return product;
  }
  const detailImage = match.imageUrl && isUsableProductImageUrl(match.imageUrl) ? match.imageUrl : '';
  return {
    ...product,
    description: product.description || match.description,
    imageUrl: product.imageUrl || detailImage,
    imageCandidates: unique([
      ...product.imageCandidates,
      ...match.imageCandidates,
    ]).slice(0, 8),
    imageSource: product.imageUrl
      ? product.imageSource
      : detailImage
        ? 'product-page'
        : 'missing',
    price: product.price || match.price,
    currency: product.currency || match.currency,
    brand: product.brand || match.brand || detail.brand,
    category: product.category || match.category,
    sku: product.sku || match.sku,
    availability: product.availability || match.availability,
    confidence: clampConfidence(Math.max(product.confidence, match.confidence)),
  };
}

function extractStructuredProducts(
  document: Document,
  baseUrl: string,
  pageBrand: string,
): CommerceProduct[] {
  const products: CommerceProduct[] = [];
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    const raw = script.textContent?.trim();
    if (!raw) continue;
    try {
      visitJsonLd(JSON.parse(raw), (node, position) => {
        if (!jsonLdTypeIncludes(node, 'Product')) return;
        const name = cleanText(node['name'], 160);
        if (!validProductName(name)) return;
        const offer = firstOffer(node['offers']);
        const imageCandidates = jsonLdImages(node['image'], baseUrl);
        const productUrl = safeHttpUrl(
          stringValue(node['url']) || stringValue(node['@id']),
          baseUrl,
        );
        products.push({
          name,
          description: cleanText(node['description'], 700),
          productUrl,
          imageUrl: imageCandidates[0] ?? '',
          imageCandidates,
          imageSource: imageCandidates.length ? 'source-page' : 'missing',
          price: cleanPrice(offer?.['price'] ?? offer?.['lowPrice'] ?? ''),
          currency: cleanText(offer?.['priceCurrency'], 12).toUpperCase(),
          brand: jsonLdBrand(node['brand']) || pageBrand,
          category: cleanText(node['category'], 100),
          sku: cleanText(node['sku'] ?? node['mpn'] ?? node['productID'], 100),
          availability: availabilityLabel(offer?.['availability']),
          position,
          confidence: 0.96,
          sourceKind: 'structured-data',
        });
      });
    } catch {
      // Invalid JSON-LD must not prevent DOM extraction.
    }
  }
  return products;
}

function extractDomProducts(
  document: Document,
  baseUrl: string,
  pageBrand: string,
): CommerceProduct[] {
  const containers = new Set<Element>(
    Array.from(document.querySelectorAll(productContainerSelector)),
  );
  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = safeHttpUrl(anchor.getAttribute('href'), baseUrl);
    if (!productPathPattern.test(href)) continue;
    const owner = nearestProductContainer(anchor);
    if (owner) containers.add(owner);
  }

  const products: CommerceProduct[] = [];
  let position = 0;
  for (const container of containers) {
    const product = productFromContainer(container, baseUrl, pageBrand, position + 1);
    if (!product) continue;
    products.push(product);
    position += 1;
  }
  return products;
}

function productFromContainer(
  container: Element,
  baseUrl: string,
  pageBrand: string,
  position: number,
): CommerceProduct | null {
  const anchors = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'));
  if (container instanceof container.ownerDocument.defaultView!.HTMLAnchorElement) {
    anchors.unshift(container as HTMLAnchorElement);
  }
  const productAnchor =
    anchors.find((anchor) => productPathPattern.test(safeHttpUrl(anchor.getAttribute('href'), baseUrl))) ??
    anchors.find((anchor) => anchor.querySelector('img') !== null) ??
    anchors[0];
  const productUrl = safeHttpUrl(productAnchor?.getAttribute('href'), baseUrl);
  const explicitlyProduct =
    container.matches(
      '[itemtype*="Product"], [data-product-id], [data-product], [data-product-name], [class*="product-card"], [class*="product-tile"]',
    ) || !!container.getAttribute('itemprop');
  if (!explicitlyProduct && !productPathPattern.test(productUrl)) {
    return null;
  }

  const imageCandidates = extractElementImages(container, baseUrl);
  const name = extractDomProductName(container, productAnchor, imageCandidates);
  if (!validProductName(name)) return null;
  const price = extractDomPrice(container);
  const category = nearestSectionHeading(container, name);
  const sku = cleanText(
    container.getAttribute('data-product-id') ??
      container.getAttribute('data-sku') ??
      container.querySelector('[itemprop="sku"]')?.getAttribute('content') ??
      '',
    100,
  );
  const availability = availabilityLabel(
    container.querySelector('[itemprop="availability"]')?.getAttribute('href') ??
      container.querySelector('[itemprop="availability"]')?.getAttribute('content') ??
      '',
  );
  const description = extractDomDescription(container, name, price);
  let confidence = 0.12;
  if (explicitlyProduct) confidence += 0.24;
  if (productPathPattern.test(productUrl)) confidence += 0.28;
  if (imageCandidates.length) confidence += 0.2;
  if (price) confidence += 0.12;
  if (name) confidence += 0.12;
  if (sku) confidence += 0.08;
  if (confidence < 0.58) return null;

  return {
    name,
    description,
    productUrl,
    imageUrl: imageCandidates[0] ?? '',
    imageCandidates,
    imageSource: imageCandidates.length ? 'source-page' : 'missing',
    price,
    currency: currencyFromPrice(price),
    brand: cleanText(
      container.querySelector('[itemprop="brand"]')?.textContent ??
        container.querySelector('[itemprop="brand"]')?.getAttribute('content') ??
        pageBrand,
      100,
    ),
    category,
    sku,
    availability,
    position,
    confidence: clampConfidence(confidence),
    sourceKind: 'dom',
  };
}

function extractProductMeta(
  document: Document,
  baseUrl: string,
  pageBrand: string,
): CommerceProduct | null {
  const ogType = firstMeta(document, ['og:type']);
  const price = firstMeta(document, ['product:price:amount']);
  const productEvidence = /product/i.test(ogType) || !!price;
  if (!productEvidence) return null;
  const name = firstMeta(document, ['og:title', 'twitter:title']) || cleanText(document.title, 160);
  if (!validProductName(name)) return null;
  const imageCandidates = unique(
    [
      firstMeta(document, ['og:image:secure_url', 'og:image', 'twitter:image']),
      ...Array.from(document.querySelectorAll<HTMLMetaElement>('meta[property="og:image"]')).map(
        (meta) => meta.content,
      ),
    ]
      .map((url) => safeHttpUrl(url, baseUrl))
      .filter(isUsableProductImageUrl),
  );
  return {
    name,
    description: firstMeta(document, ['og:description', 'description']),
    productUrl:
      safeHttpUrl(firstMeta(document, ['og:url']), baseUrl) ||
      safeHttpUrl(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href, baseUrl) ||
      baseUrl,
    imageUrl: imageCandidates[0] ?? '',
    imageCandidates,
    imageSource: imageCandidates.length ? 'source-page' : 'missing',
    price: cleanPrice(price),
    currency: firstMeta(document, ['product:price:currency']).toUpperCase(),
    brand: firstMeta(document, ['product:brand']) || pageBrand,
    category: firstMeta(document, ['product:category']),
    sku: firstMeta(document, ['product:retailer_item_id']),
    availability: availabilityLabel(firstMeta(document, ['product:availability'])),
    position: 1,
    confidence: 0.88,
    sourceKind: 'product-meta',
  };
}

function visitJsonLd(
  value: unknown,
  visitor: (node: Record<string, unknown>, position: number) => void,
  position = 0,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitJsonLd(item, visitor, index + 1));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const node = value as Record<string, unknown>;
  visitor(node, numericValue(node['position']) || position);
  if (Array.isArray(node['@graph'])) visitJsonLd(node['@graph'], visitor, position);
  if (Array.isArray(node['itemListElement'])) visitJsonLd(node['itemListElement'], visitor, position);
  if (node['item'] && typeof node['item'] === 'object') visitJsonLd(node['item'], visitor, position);
}

function nearestProductContainer(anchor: HTMLAnchorElement): Element | null {
  let current: Element | null = anchor;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    if (current.matches(productContainerSelector)) return current;
    const textLength = cleanText(current.textContent, 2000).length;
    const imageCount = current.querySelectorAll('img, picture, [data-lw-background-image]').length;
    const productLinkCount = Array.from(current.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(
      (candidate) => productPathPattern.test(candidate.getAttribute('href') ?? ''),
    ).length;
    if (imageCount >= 1 && productLinkCount >= 1 && productLinkCount <= 4 && textLength <= 900) {
      return current;
    }
  }
  return anchor;
}

function extractDomProductName(
  container: Element,
  productAnchor: HTMLAnchorElement | undefined,
  imageCandidates: string[],
): string {
  const candidates = [
    container.getAttribute('data-product-name'),
    container.querySelector(productNameSelector)?.getAttribute('content'),
    container.querySelector(productNameSelector)?.textContent,
    productAnchor?.getAttribute('aria-label'),
    productAnchor?.textContent,
    ...Array.from(container.querySelectorAll<HTMLImageElement>('img')).map((image) => image.alt),
  ];
  for (const candidate of candidates) {
    const name = cleanProductName(candidate);
    if (validProductName(name)) return name;
  }
  return cleanProductName(imageCandidates[0]?.split('/').pop()?.split('?')[0].replace(/[-_]+/g, ' '));
}

function extractElementImages(container: Element, baseUrl: string): string[] {
  const candidates: string[] = [];
  for (const image of Array.from(container.querySelectorAll<HTMLImageElement>('img'))) {
    candidates.push(
      image.getAttribute('data-lw-current-src') ?? '',
      image.currentSrc,
      image.getAttribute('src') ?? '',
      image.getAttribute('data-src') ?? '',
      image.getAttribute('data-original') ?? '',
      bestSrcsetUrl(image.getAttribute('srcset') ?? image.getAttribute('data-srcset') ?? ''),
    );
  }
  for (const source of Array.from(container.querySelectorAll<HTMLSourceElement>('source'))) {
    candidates.push(bestSrcsetUrl(source.getAttribute('srcset') ?? ''));
  }
  for (const element of Array.from(container.querySelectorAll<HTMLElement>('[data-lw-background-image]'))) {
    candidates.push(element.getAttribute('data-lw-background-image') ?? '');
  }
  return unique(
    candidates
      .flatMap(extractCssUrls)
      .map((candidate) => safeHttpUrl(candidate, baseUrl))
      .filter(isUsableProductImageUrl),
  ).slice(0, 8);
}

function extractDomPrice(container: Element): string {
  const priceElement = container.querySelector(priceSelector);
  const content =
    priceElement?.getAttribute('content') ??
    priceElement?.getAttribute('data-price') ??
    priceElement?.getAttribute('aria-label') ??
    priceElement?.textContent ??
    '';
  return cleanPrice(content || cleanText(container.textContent, 1200).match(pricePattern)?.[0] || '');
}

function extractDomDescription(container: Element, name: string, price: string): string {
  const candidates = Array.from(container.querySelectorAll('p, [itemprop="description"]'))
    .map((element) => cleanText(element.textContent ?? element.getAttribute('content'), 700))
    .filter((text) => text && text !== name && text !== price && !noiseNamePattern.test(text));
  return candidates[0] ?? '';
}

function nearestSectionHeading(container: Element, productName: string): string {
  let current: Element | null = container;
  for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
    const heading = current.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > header h1, :scope > header h2, :scope > header h3');
    const label = cleanText(heading?.textContent ?? current.getAttribute('aria-label'), 100);
    if (
      label &&
      label.length >= 2 &&
      normalizedKey(label) !== normalizedKey(productName) &&
      !noiseNamePattern.test(label)
    ) {
      return label;
    }
  }
  return '';
}

function mergeProducts(products: CommerceProduct[]): CommerceProduct[] {
  const merged = new Map<string, CommerceProduct>();
  for (const product of products) {
    const key = product.productUrl
      ? `url:${canonicalUrl(product.productUrl)}`
      : `name:${normalizedKey(product.name)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, product);
      continue;
    }
    const preferred =
      product.confidence > existing.confidence ||
      (product.confidence === existing.confidence && !!product.imageUrl && !existing.imageUrl)
        ? product
        : existing;
    const secondary = preferred === product ? existing : product;
    const imageCandidates = unique([
      ...preferred.imageCandidates,
      ...secondary.imageCandidates,
    ]).slice(0, 8);
    merged.set(key, {
      ...preferred,
      description: preferred.description || secondary.description,
      productUrl: preferred.productUrl || secondary.productUrl,
      imageUrl: preferred.imageUrl || secondary.imageUrl || imageCandidates[0] || '',
      imageCandidates,
      imageSource:
        preferred.imageUrl || secondary.imageUrl || imageCandidates.length ? 'source-page' : 'missing',
      price: preferred.price || secondary.price,
      currency: preferred.currency || secondary.currency,
      brand: preferred.brand || secondary.brand,
      category: preferred.category || secondary.category,
      sku: preferred.sku || secondary.sku,
      availability: preferred.availability || secondary.availability,
      position: Math.min(
        preferred.position || Number.MAX_SAFE_INTEGER,
        secondary.position || Number.MAX_SAFE_INTEGER,
      ),
      confidence: clampConfidence(Math.max(preferred.confidence, secondary.confidence)),
    });
  }
  return Array.from(merged.values()).sort(
    (a, b) => (a.position || Number.MAX_SAFE_INTEGER) - (b.position || Number.MAX_SAFE_INTEGER),
  );
}

function jsonLdTypeIncludes(node: Record<string, unknown>, expected: string): boolean {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  return types.some((type) => stringValue(type).toLowerCase() === expected.toLowerCase());
}

function jsonLdImages(value: unknown, baseUrl: string): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return unique(
    raw
      .flatMap((item) => {
        if (typeof item === 'string') return [item];
        if (!item || typeof item !== 'object') return [];
        const image = item as Record<string, unknown>;
        return [stringValue(image['url']), stringValue(image['contentUrl'])];
      })
      .map((url) => safeHttpUrl(url, baseUrl))
      .filter(isUsableProductImageUrl),
  ).slice(0, 8);
}

function jsonLdBrand(value: unknown): string {
  if (typeof value === 'string') return cleanText(value, 100);
  if (!value || typeof value !== 'object') return '';
  return cleanText((value as Record<string, unknown>)['name'], 100);
}

function firstOffer(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>) : null;
}

function firstMeta(document: Document, names: string[]): string {
  for (const name of names) {
    const escaped = name.replace(/"/g, '\\"');
    const meta = document.querySelector<HTMLMetaElement>(
      `meta[property="${escaped}"], meta[name="${escaped}"], meta[itemprop="${escaped}"]`,
    );
    const value = cleanText(meta?.content, 700);
    if (value) return value;
  }
  return '';
}

function cleanProductName(value: unknown): string {
  return cleanText(value, 160)
    .replace(/^(?:image|photo|picture)\s+(?:of\s+)?/i, '')
    .replace(/\s+(?:image|photo|picture)$/i, '')
    .replace(/\s*[|–—-]\s*(?:official site|shop now)$/i, '')
    .trim();
}

function validProductName(value: string): boolean {
  if (!value || value.length < 2 || value.length > 160 || noiseNamePattern.test(value)) return false;
  if (/^(?:https?:|\/|#|\$|€|£|¥)/i.test(value)) return false;
  return /[\p{L}\p{N}]/u.test(value);
}

function cleanPrice(value: unknown): string {
  const text = cleanText(value, 80);
  if (!text) return '';
  const match = text.match(pricePattern);
  if (match) return match[0].replace(/\s+/g, ' ').trim();
  return /^\d[\d,.]*$/.test(text) ? text : '';
}

function currencyFromPrice(price: string): string {
  if (/€/.test(price)) return 'EUR';
  if (/£/.test(price)) return 'GBP';
  if (/¥/.test(price)) return 'JPY';
  if (/CA\$|CAD/i.test(price)) return 'CAD';
  if (/AU\$|AUD/i.test(price)) return 'AUD';
  if (/\$|USD/i.test(price)) return 'USD';
  return '';
}

function availabilityLabel(value: unknown): string {
  const text = cleanText(value, 120).split('/').pop()?.replace(/([a-z])([A-Z])/g, '$1 $2') ?? '';
  return text.trim();
}

function bestSrcsetUrl(srcset: string): string {
  const candidates = srcset
    .split(',')
    .map((part) => {
      const [url, descriptor = ''] = part.trim().split(/\s+/, 2);
      const score = descriptor.endsWith('w')
        ? Number.parseFloat(descriptor)
        : descriptor.endsWith('x')
          ? Number.parseFloat(descriptor) * 1000
          : 1;
      return { url, score: Number.isFinite(score) ? score : 1 };
    })
    .filter((candidate) => !!candidate.url);
  return candidates.sort((a, b) => b.score - a.score)[0]?.url ?? '';
}

function extractCssUrls(value: string): string[] {
  if (!value) return [];
  const matches = Array.from(value.matchAll(/url\(["']?([^"')]+)["']?\)/gi)).map((match) => match[1]);
  return matches.length ? matches : [value];
}

function isUsableProductImageUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  const normalized = value.toLowerCase();
  if (/\.(?:svg|tiff?|ico)(?:[?#]|$)/i.test(normalized)) return false;
  if (nonProductImagePattern.test(normalized)) return false;
  if (/[?&](?:w|width|h|height)=(?:[0-9]|[1-7][0-9])(?:&|$)/i.test(normalized)) return false;
  return true;
}

function safeHttpUrl(value: unknown, baseUrl: string): string {
  const raw = stringValue(value).trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, baseUrl || undefined);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(?:utm_|gclid|fbclid|ref|source)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return value;
  }
}

function sameCanonicalUrl(a: string, b: string): boolean {
  return !!a && !!b && canonicalUrl(a) === canonicalUrl(b);
}

function normalizedKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function cleanText(value: unknown, maxLength: number): string {
  return stringValue(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function numericValue(value: unknown): number {
  const number = typeof value === 'number' ? value : Number.parseInt(stringValue(value), 10);
  return Number.isFinite(number) ? number : 0;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}
