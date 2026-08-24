import { JSDOM } from 'jsdom';
import type { GeneratedBoardWizardBatch, GeneratedBoardWizardCard } from './gemini';

export type BoardWizardListingKind = 'vacation-rental' | 'real-estate' | 'hotel';

export type BoardWizardListingImage = {
  url: string;
  alt: string;
  evidence: 'structured-data' | 'listing-gallery' | 'page-metadata';
};

export type BoardWizardListingUnit = {
  name: string;
  bedrooms: string;
  bathrooms: string;
  area: string;
  availability: string;
  price: string;
};

export type BoardWizardListingExtraction = {
  kind: BoardWizardListingKind;
  sourceUrl: string;
  finalUrl: string;
  siteName: string;
  listingName: string;
  description: string;
  address: string;
  host: string;
  price: string;
  rating: string;
  facts: string[];
  amenities: string[];
  images: BoardWizardListingImage[];
  units: BoardWizardListingUnit[];
  latitude?: number;
  longitude?: number;
  confidence: number;
};

type JsonRecord = Record<string, unknown>;

const LISTING_TYPES = new Map<string, BoardWizardListingKind>([
  ['vacationrental', 'vacation-rental'],
  ['realestatelisting', 'real-estate'],
  ['hotel', 'hotel'],
  ['hotelroom', 'hotel'],
  ['accommodation', 'hotel'],
  ['lodgingbusiness', 'hotel'],
  ['resort', 'hotel'],
]);

const VACATION_HOSTS = /(^|\.)(airbnb|vrbo|booking|expedia|agoda|hotels)\./i;
const REAL_ESTATE_HOSTS = /(^|\.)(zillow|trulia|hotpads|realtor|redfin|apartments|homes|rent|zumper|apartmentlist)\./i;
const HOTEL_HOSTS = /(^|\.)(marriott|hilton|hyatt|ihg|wyndham|choicehotels)\./i;
const NOISE_MEDIA = /(logo|favicon|icon|avatar|profile|host[-_ ]?photo|review|rating|star|badge|tracking|pixel|sprite|search[-_ ]?bar|platform[-_ ]?assets|nearby|recommend|similar|map[-_ ]?pin|payment|social)/i;

export function extractBoardWizardListing(
  inputUrl: string,
  finalUrl: string,
  html: string,
): BoardWizardListingExtraction | null {
  const baseUrl = safeHttpUrl(finalUrl) || safeHttpUrl(inputUrl);
  if (!baseUrl || !html.trim()) return null;

  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url: baseUrl });
  } catch {
    return null;
  }
  const document = dom.window.document;
  const jsonNodes = extractJsonLdNodes(document);
  const candidates = jsonNodes
    .map((node) => ({ node, ...classifyListingNode(node) }))
    .filter((candidate): candidate is { node: JsonRecord; kind: BoardWizardListingKind; score: number } => !!candidate.kind)
    .sort((a, b) => b.score - a.score);
  const hostKind = listingKindFromUrl(inputUrl || baseUrl);
  const primary = candidates[0];

  // A known host alone is not enough: search/category pages must not be converted
  // into a single property. Require listing semantics or a strong listing-page URL.
  const kind = primary?.kind || (isStrongListingUrl(inputUrl || baseUrl) ? hostKind : null);
  if (!kind) return null;

  const primaryNode = primary?.node || {};
  const nestedAbout = recordValue(primaryNode.about);
  const listingName = firstText(
    nestedAbout.name,
    primaryNode.name,
    metaContent(document, 'property', 'og:title'),
    metaContent(document, 'name', 'twitter:title'),
    document.title,
  ).replace(/\s+[|–—-]\s+(Airbnb|Zillow|Vrbo|Booking\.com).*$/i, '').trim();
  if (!listingName) return null;

  const relatedNodes = jsonNodes.filter((node) => {
    const name = firstText(recordValue(node.about).name, node.name);
    return name && normalizeText(name) === normalizeText(listingName);
  });
  const siteName = firstText(
    metaContent(document, 'property', 'og:site_name'),
    recordValue(primaryNode.publisher).name,
    hostnameLabel(baseUrl),
  );
  const description = firstText(
    primaryNode.description,
    nestedAbout.description,
    metaContent(document, 'name', 'description'),
    metaContent(document, 'property', 'og:description'),
  );
  const address = formatAddress(primaryNode.address)
    || formatAddress(nestedAbout.address)
    || firstText(primaryNode.contentLocation, nestedAbout.contentLocation);
  const pageText = cleanText(document.body?.textContent || '').slice(0, 80_000);
  const images = extractListingImages({
    document,
    nodes: [primaryNode, nestedAbout, ...relatedNodes],
    baseUrl,
    kind,
    hostname: safeHostname(baseUrl),
  });
  const offers = recordValue(primaryNode.offers);
  const aggregateRating = recordValue(primaryNode.aggregateRating);
  const geo = recordValue(primaryNode.geo);

  return {
    kind,
    sourceUrl: inputUrl,
    finalUrl: baseUrl,
    siteName,
    listingName,
    description: cleanText(description).slice(0, 1200),
    address: cleanText(address).slice(0, 300),
    host: extractHost(primaryNode, pageText),
    price: formatOfferPrice(offers),
    rating: firstText(aggregateRating.ratingValue, primaryNode.ratingValue),
    facts: extractListingFacts(primaryNode, nestedAbout, pageText),
    amenities: extractAmenities(primaryNode, nestedAbout, `${description} ${pageText}`),
    images,
    units: kind === 'real-estate' ? extractUnits(document, pageText) : [],
    latitude: finiteNumber(geo.latitude) ?? finiteNumber(primaryNode.latitude),
    longitude: finiteNumber(geo.longitude) ?? finiteNumber(primaryNode.longitude),
    confidence: primary ? (images.length ? 0.99 : 0.94) : (images.length ? 0.9 : 0.82),
  };
}

export function isBoardWizardListingPageUrl(value: string): boolean {
  return isStrongListingUrl(value);
}

export function extractBoardWizardListingFromMarkdown(
  sourceUrl: string,
  markdown: string,
): BoardWizardListingExtraction | null {
  if (!isStrongListingUrl(sourceUrl) || !markdown.trim()) return null;
  const kind = listingKindFromUrl(sourceUrl);
  if (!kind) return null;

  const titleLine = markdown.match(/^Title:\s*(.+)$/im)?.[1]
    || markdown.match(/^#\s+(.+)$/m)?.[1]
    || '';
  const listingName = cleanText(titleLine)
    .replace(/\s*\|\s*(?:MLS\b[^|]*\|\s*)?(?:Zillow|Airbnb|Vrbo|Booking\.com).*$/i, '')
    .trim();
  if (!listingName) return null;

  const galleryBoundary = firstPositiveIndex(
    markdown,
    /\bSee all media\b/i,
    /^#{1,6}\s+(?:Nearby|Similar|Other homes|Meet your host|Reviews|Things to know)\b/im,
  );
  const listingRegion = markdown.slice(0, galleryBoundary > 0 ? galleryBoundary : Math.min(markdown.length, 30_000));
  const markdownImages = Array.from(listingRegion.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)[^)]*\)/g))
    .map((match) => ({ alt: cleanText(match[1]), url: match[2] }));
  const candidateImages = markdownImages.filter((image) => {
    if (NOISE_MEDIA.test(`${image.alt} ${image.url}`)) return false;
    if (kind === 'real-estate' && safeHostname(sourceUrl).includes('zillow.')) {
      return /photos\.zillowstatic\.com\/fp\//i.test(image.url)
        && !/(?:zillow_web|[-_]h_l\.(?:jpg|jpeg|png|webp)|[-_]p_e\.webp)/i.test(image.url);
    }
    if (kind === 'vacation-rental' && safeHostname(sourceUrl).includes('airbnb.')) {
      return /a\d\.muscache\.com\/im\/pictures\/(?:miso\/hosting|hosting|prohost-api)/i.test(image.url);
    }
    return /\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(image.url)
      && /property|home|house|room|suite|bedroom|kitchen|building|listing|photo|image/i.test(image.alt);
  });
  const bestImages = bestMarkdownListingImages(candidateImages).slice(0, 12);
  if (!bestImages.length) return null;

  const specialDescription = markdownSection(markdown, /^(?:#{1,6}\s*)?What's special\s*$/im);
  const fallbackDescription = markdown.match(/\b(?:For sale|For rent)[\s\S]{0,1200}/i)?.[0] || '';
  const description = markdownToPlainText(specialDescription || fallbackDescription).slice(0, 1200);
  const factsText = markdownToPlainText(markdown.slice(0, Math.min(markdown.length, 24_000)));
  const price = factsText.match(/\$[\d,]+(?:\.\d{2})?/)?.[0] || '';
  const latitude = finiteNumber(markdown.match(/[?&]center=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i)?.[1]);
  const longitude = finiteNumber(markdown.match(/[?&]center=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i)?.[2]);
  const syntheticHtml = `<!doctype html><html><head>
    <meta property="og:site_name" content="${escapeHtml(hostnameLabel(sourceUrl))}">
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': kind === 'real-estate' ? 'RealEstateListing' : kind === 'hotel' ? 'Hotel' : 'VacationRental',
      name: listingName,
      description,
      address: kind === 'real-estate' ? listingName : undefined,
      image: bestImages.map((image) => image.url),
      offers: price ? { price, priceCurrency: 'USD' } : undefined,
      latitude,
      longitude,
    })}</script>
  </head><body>${escapeHtml(factsText)}</body></html>`;
  const extraction = extractBoardWizardListing(sourceUrl, sourceUrl, syntheticHtml);
  if (!extraction) return null;
  return {
    ...extraction,
    images: bestImages.map((image) => ({
      url: image.url,
      alt: image.alt || `${listingName} listing photo`,
      evidence: 'listing-gallery' as const,
    })),
    confidence: 0.9,
  };
}

export function buildBoardWizardListingBatch(options: {
  extraction: BoardWizardListingExtraction;
  targetBoardTitle: string;
  count: number;
}): GeneratedBoardWizardBatch {
  const extraction = options.extraction;
  const count = Math.max(1, Math.min(100, Math.round(options.count) || 1));
  const imageUrls = extraction.images.map((image) => image.url).slice(0, 12);
  const kindLabel = extraction.kind === 'real-estate'
    ? 'Property listing'
    : extraction.kind === 'hotel' ? 'Hotel listing' : 'Vacation rental';
  const primaryTags = extraction.kind === 'real-estate'
    ? ['listing', 'real-estate', 'source-image']
    : ['listing', 'lodging', 'source-image'];
  const extractedAt = new Date().toISOString();
  const overview: GeneratedBoardWizardCard = {
    title: extraction.listingName.slice(0, 80),
    subtitle: (extraction.address || extraction.siteName || kindLabel).slice(0, 120),
    notes: (extraction.description || `Review this ${kindLabel.toLowerCase()} on the original source page.`).slice(0, 3600),
    type: 'place',
    scope: 'place',
    status: 'saved',
    rating: 5,
    tags: primaryTags,
    image_query: `${extraction.listingName} property exterior interior`,
    place_query: extraction.address || extraction.listingName,
    entity_name: extraction.listingName,
    entity_type: 'place',
    image_intent: 'place',
    short_summary: (extraction.description || kindLabel).slice(0, 160),
    imageUrl: imageUrls[0],
    imageUrls,
    sourceUrl: extraction.sourceUrl,
    imageSource: imageUrls.length ? 'source-page' : 'missing',
    extractionConfidence: extraction.confidence,
    extractedAt,
    locationLat: extraction.latitude,
    locationLng: extraction.longitude,
  };

  const detailCards: GeneratedBoardWizardCard[] = [];
  for (const unit of extraction.units) {
    const details = [unit.bedrooms, unit.bathrooms, unit.area, unit.availability, unit.price].filter(Boolean);
    detailCards.push(listingDetailCard({
      title: unit.name || 'Available unit',
      subtitle: details.slice(0, 3).join(' · '),
      notes: details.join(' · '),
      tag: 'unit',
      extraction,
      extractedAt,
    }));
  }
  if (extraction.facts.length) {
    detailCards.push(listingDetailCard({
      title: extraction.kind === 'vacation-rental' ? 'Stay details' : 'Property details',
      subtitle: extraction.facts.slice(0, 3).join(' · '),
      notes: extraction.facts.join(' · '),
      tag: 'details',
      extraction,
      extractedAt,
    }));
  }
  if (extraction.amenities.length) {
    detailCards.push(listingDetailCard({
      title: 'Amenities',
      subtitle: extraction.amenities.slice(0, 3).join(' · '),
      notes: extraction.amenities.join(', '),
      tag: 'amenities',
      extraction,
      extractedAt,
    }));
  }
  if (extraction.address) {
    detailCards.push({
      ...listingDetailCard({
        title: 'Location',
        subtitle: extraction.address,
        notes: `Source-listed location: ${extraction.address}. Confirm directions and access details on the original page.`,
        tag: 'location',
        extraction,
        extractedAt,
      }),
      type: 'place',
      place_query: extraction.address,
      locationLat: extraction.latitude,
      locationLng: extraction.longitude,
    });
  }
  detailCards.push(listingDetailCard({
    title: extraction.kind === 'real-estate' ? 'Verify availability' : 'View listing',
    subtitle: extraction.price || `Open on ${extraction.siteName || 'source site'}`,
    notes: extraction.kind === 'real-estate'
      ? 'Check current rent, availability, fees, lease terms, pet rules, and contact details on the original listing.'
      : 'Check current price, availability, fees, cancellation terms, house rules, and booking details on the original listing.',
    tag: 'action',
    extraction,
    extractedAt,
  }));

  const sourceBoundDetailCards = detailCards.map((card, index) => {
    if (!extraction.images.length) return card;
    const image = extraction.images[(index + 1) % extraction.images.length];
    return {
      ...card,
      tags: Array.from(new Set([...card.tags, 'source-image'])),
      image_query: image.alt || card.image_query,
      image_context: image.alt || `${extraction.listingName} source gallery`,
      imageUrl: image.url,
      imageUrls: [image.url],
      imageSource: 'source-page' as const,
    };
  });

  return {
    board: {
      title: (options.targetBoardTitle || extraction.listingName).slice(0, 90),
      description: (extraction.description || `${kindLabel} captured from ${extraction.siteName || 'the source page'}.`).slice(0, 240),
      icon: extraction.kind === 'real-estate' ? 'apartment' : 'hotel',
      tone: extraction.kind === 'real-estate' ? 'teal' : 'sky',
    },
    cards: [overview, ...sourceBoundDetailCards].slice(0, count),
  };
}

function listingDetailCard(options: {
  title: string;
  subtitle: string;
  notes: string;
  tag: string;
  extraction: BoardWizardListingExtraction;
  extractedAt: string;
}): GeneratedBoardWizardCard {
  return {
    title: options.title.slice(0, 80),
    subtitle: options.subtitle.slice(0, 120),
    notes: options.notes.slice(0, 3600),
    type: 'note',
    scope: 'place',
    status: options.tag === 'action' ? 'planned' : 'saved',
    rating: 4,
    tags: ['listing', options.tag, options.extraction.kind === 'real-estate' ? 'real-estate' : 'lodging'],
    image_query: `${options.extraction.listingName} ${options.tag}`,
    place_query: options.extraction.address || options.extraction.listingName,
    entity_name: options.extraction.listingName,
    entity_type: 'place',
    image_intent: 'place',
    short_summary: options.subtitle.slice(0, 160),
    sourceUrl: options.extraction.sourceUrl,
    imageSource: 'missing',
    extractionConfidence: options.extraction.confidence,
    extractedAt: options.extractedAt,
  };
}

function extractJsonLdNodes(document: Document): JsonRecord[] {
  const nodes: JsonRecord[] = [];
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    const raw = script.textContent?.trim();
    if (!raw) continue;
    try {
      collectJsonRecords(JSON.parse(raw), nodes);
    } catch {
      // Ignore malformed analytics/JSON-LD blocks and continue with valid blocks.
    }
  }
  return nodes;
}

function collectJsonRecords(value: unknown, target: JsonRecord[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonRecords(item, target));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as JsonRecord;
  target.push(record);
  for (const nested of Object.values(record)) collectJsonRecords(nested, target);
}

function classifyListingNode(node: JsonRecord): { kind: BoardWizardListingKind | null; score: number } {
  const types = stringList(node['@type']).map(normalizeText);
  for (const [schemaType, kind] of LISTING_TYPES) {
    if (types.includes(schemaType)) {
      const score = 100
        + (schemaType === 'vacationrental' || schemaType === 'realestatelisting' ? 30 : 0)
        + (node.name ? 5 : 0)
        + (node.image ? 5 : 0);
      return { kind, score };
    }
  }
  return { kind: null, score: 0 };
}

function extractListingImages(options: {
  document: Document;
  nodes: JsonRecord[];
  baseUrl: string;
  kind: BoardWizardListingKind;
  hostname: string;
}): BoardWizardListingImage[] {
  const candidates: Array<BoardWizardListingImage & { priority: number }> = [];
  const add = (value: unknown, alt: string, evidence: BoardWizardListingImage['evidence'], priority: number): void => {
    for (const raw of imageValues(value)) {
      const url = absoluteImageUrl(raw, options.baseUrl);
      if (!url || !plausibleListingImage(url, alt, options.kind, options.hostname, evidence)) continue;
      candidates.push({ url, alt: cleanText(alt).slice(0, 180), evidence, priority });
    }
  };
  for (const node of options.nodes) {
    add(node.image, firstText(node.name, 'Property photo'), 'structured-data', 100);
    add(node.photo, firstText(node.name, 'Property photo'), 'structured-data', 98);
    add(node.thumbnailUrl, firstText(node.name, 'Property photo'), 'structured-data', 90);
  }
  add(metaContent(options.document, 'property', 'og:image'), 'Property photo', 'page-metadata', 70);

  for (const image of Array.from(options.document.querySelectorAll('img'))) {
    const alt = firstText(image.getAttribute('alt'), image.getAttribute('aria-label'));
    const src = bestSrcsetUrl(image.getAttribute('srcset'), options.baseUrl)
      || absoluteImageUrl(firstText(image.getAttribute('src'), image.getAttribute('data-src')), options.baseUrl);
    if (!src) continue;
    const listingGallery = /building photo|property photo|listing photo|room photo|photo of|image of/i.test(alt)
      || !!image.closest('[data-testid*="photo" i], [data-testid*="gallery" i], [aria-label*="photo" i], [class*="gallery" i]');
    if (!listingGallery) continue;
    add(src, alt || 'Property photo', 'listing-gallery', 85);
  }

  candidates.sort((a, b) => b.priority - a.priority || imageResolutionScore(b.url) - imageResolutionScore(a.url));
  const seen = new Set<string>();
  const result: BoardWizardListingImage[] = [];
  for (const candidate of candidates) {
    const key = imageAssetKey(candidate.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ url: candidate.url, alt: candidate.alt, evidence: candidate.evidence });
    if (result.length >= 12) break;
  }
  return result;
}

function imageValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(imageValues);
  if (!value || typeof value !== 'object') return [];
  const record = value as JsonRecord;
  return imageValues(record.url || record.contentUrl || record.thumbnailUrl);
}

function plausibleListingImage(
  url: string,
  alt: string,
  kind: BoardWizardListingKind,
  hostname: string,
  evidence: BoardWizardListingImage['evidence'],
): boolean {
  const context = `${url} ${alt}`;
  if (NOISE_MEDIA.test(context)) return false;
  if (!/^https?:\/\//i.test(url) || /\.(?:svg|ico|gif)(?:[?#]|$)/i.test(url)) return false;
  if (hostname.includes('airbnb.')) {
    return /a\d\.muscache\.com\/im\/pictures\/(?:miso\/hosting|hosting|prohost-api|[0-9a-f-]{12,})/i.test(url)
      || evidence === 'page-metadata';
  }
  if (hostname.includes('zillow.')) {
    return /photos\.zillowstatic\.com\/fp\//i.test(url)
      && (evidence !== 'listing-gallery' || /building photo|property photo|listing photo/i.test(alt));
  }
  if (evidence === 'structured-data' || evidence === 'page-metadata') return true;
  return kind !== 'real-estate' || /property|building|listing|room|home|apartment/i.test(alt);
}

function imageAssetKey(value: string): string {
  try {
    const url = new URL(value);
    const airbnbId = url.pathname.match(/\/pictures\/(?:miso\/hosting\/\d+\/)?([0-9a-f-]{20,})/i)?.[1];
    if (airbnbId) return `airbnb:${airbnbId}`;
    const zillowId = url.pathname.match(/\/fp\/([0-9a-f]{24,})/i)?.[1];
    if (zillowId) return `zillow:${zillowId.toLowerCase()}`;
    return `${url.hostname}${url.pathname}`
      .toLowerCase()
      .replace(/[-_](?:\d{2,4}x\d{2,4}|thumb|small|medium|large)(?=\.)/g, '');
  } catch {
    return '';
  }
}

function imageResolutionScore(value: string): number {
  const dimensions = [...value.matchAll(/(?:[?&](?:w|width)=|[-_/])(\d{2,4})(?:x(\d{2,4}))?/gi)];
  return dimensions.reduce((best, match) => Math.max(best, Number(match[1]) * Number(match[2] || match[1])), 0);
}

function bestMarkdownListingImages(
  images: Array<{ alt: string; url: string }>,
): Array<{ alt: string; url: string }> {
  const best = new Map<string, { alt: string; url: string; score: number; position: number }>();
  images.forEach((image, position) => {
    const key = imageAssetKey(image.url);
    if (!key) return;
    const score = imageResolutionScore(image.url)
      + (/1152|1536|2048|original/i.test(image.url) ? 5_000_000 : 0)
      - (/192|thumbnail/i.test(image.url) ? 1_000_000 : 0);
    const current = best.get(key);
    if (!current || score > current.score) best.set(key, { ...image, score, position });
  });
  return Array.from(best.values())
    .sort((left, right) => left.position - right.position)
    .map(({ alt, url }) => ({ alt, url }));
}

function markdownSection(markdown: string, headingPattern: RegExp): string {
  const match = headingPattern.exec(markdown);
  if (!match || match.index == null) return '';
  const start = match.index + match[0].length;
  const remainder = markdown.slice(start);
  const nextHeading = remainder.search(/^#{1,6}\s+\S/im);
  return remainder.slice(0, nextHeading >= 0 ? nextHeading : 1600);
}

function markdownToPlainText(value: string): string {
  return cleanText(value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`>|]+/g, ' '));
}

function firstPositiveIndex(value: string, ...patterns: RegExp[]): number {
  const indexes = patterns.map((pattern) => value.search(pattern)).filter((index) => index > 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bestSrcsetUrl(value: string | null, baseUrl: string): string {
  if (!value) return '';
  return value.split(',').map((candidate) => {
    const parts = candidate.trim().split(/\s+/);
    return { url: absoluteImageUrl(parts[0] || '', baseUrl), width: Number((parts[1] || '').replace(/[^\d.]/g, '')) || 0 };
  }).filter((candidate) => !!candidate.url).sort((a, b) => b.width - a.width)[0]?.url || '';
}

function extractListingFacts(primary: JsonRecord, about: JsonRecord, text: string): string[] {
  const facts: string[] = [];
  const add = (value: string): void => {
    const clean = cleanText(value);
    if (clean && !facts.some((item) => normalizeText(item) === normalizeText(clean))) facts.push(clean);
  };
  const containedPlace = recordValue(primary.containsPlace);
  const bedrooms = firstText(primary.numberOfBedrooms, about.numberOfBedrooms, containedPlace.numberOfBedrooms);
  const bathrooms = firstText(primary.numberOfBathroomsTotal, primary.numberOfBathrooms, about.numberOfBathroomsTotal, containedPlace.numberOfBathroomsTotal);
  const occupancy = firstText(
    recordValue(primary.occupancy).value,
    primary.occupancy,
    primary.numberOfGuests,
    recordValue(containedPlace.occupancy).value,
  );
  const floorSize = recordValue(primary.floorSize);
  if (occupancy) add(`${occupancy} guests`);
  if (bedrooms) add(`${bedrooms} bedrooms`);
  if (bathrooms) add(`${bathrooms} bathrooms`);
  if (floorSize.value) add(`${firstText(floorSize.value)} ${firstText(floorSize.unitText, floorSize.unitCode)}`);
  for (const pattern of [
    /\b\d+\s+guests?\b/gi,
    /\b\d+(?:\.\d+)?\s+(?:bedrooms?|beds?|baths?|bathrooms?)\b/gi,
    /\b(?:studio|pet[- ]friendly|pets? allowed)\b/gi,
  ]) {
    for (const match of text.matchAll(pattern)) add(match[0]);
  }
  return facts.slice(0, 12);
}

function extractAmenities(primary: JsonRecord, about: JsonRecord, text: string): string[] {
  const result: string[] = [];
  const add = (value: string): void => {
    const clean = cleanText(value).replace(/^true\s*/i, '');
    if (clean && !result.some((item) => normalizeText(item) === normalizeText(clean))) result.push(clean);
  };
  for (const value of [...arrayValue(primary.amenityFeature), ...arrayValue(about.amenityFeature)]) {
    const record = recordValue(value);
    if (record.value === false) continue;
    add(firstText(record.name, record.value));
  }
  const known: Array<[string, RegExp]> = [
    ['Wifi', /\bwi-?fi\b/i], ['Kitchen', /\bkitchen\b/i], ['Pool', /\bpool\b/i],
    ['Hot tub', /\bhot tub\b/i], ['Free parking', /\bfree parking\b/i],
    ['Air conditioning', /\b(?:air conditioning|central air)\b/i],
    ['In-unit laundry', /\b(?:in-unit laundry|washer and dryer|washer\/dryer)\b/i],
    ['Gym', /\b(?:gym|fitness center)\b/i], ['Elevator', /\belevator\b/i],
    ['Doorman', /\bdoorman\b/i], ['Balcony', /\bbalcony\b/i], ['Dishwasher', /\bdishwasher\b/i],
    ['Pet friendly', /\b(?:pet[- ]friendly|pets? (?:allowed|permitted)|dogs allowed|cats allowed)\b/i],
    ['Wheelchair accessible', /\bwheelchair accessible\b/i],
  ];
  for (const [amenity, pattern] of known) {
    if (pattern.test(text)) add(amenity);
  }
  return result.slice(0, 24);
}

function extractUnits(document: Document, pageText: string): BoardWizardListingUnit[] {
  const units: BoardWizardListingUnit[] = [];
  for (const row of Array.from(document.querySelectorAll('tr, [role="row"]'))) {
    const cells = Array.from(row.querySelectorAll('th, td, [role="cell"], [role="gridcell"]'))
      .map((cell) => cleanText(cell.textContent || '')).filter(Boolean);
    if (cells.length < 2 || !/\bunit\s*[#a-z0-9-]+/i.test(cells.join(' '))) continue;
    units.push(unitFromParts(cells));
  }
  if (!units.length) {
    const pattern = /\b(Unit\s*[#A-Z0-9-]+)\s+(Studio|\d+(?:\.\d+)?\s*bd)\s*[,·]?\s*(\d+(?:\.\d+)?\s*ba)?\s*[,·]?\s*(\d[\d,]*\s*(?:sq\.?\s*ft|ft²)?)?\s*([^$\n]{0,30})?\s*(\$[\d,]+(?:\/mo)?)/gi;
    for (const match of pageText.matchAll(pattern)) {
      units.push({
        name: cleanText(match[1]), bedrooms: cleanText(match[2]), bathrooms: cleanText(match[3] || ''),
        area: cleanText(match[4] || ''), availability: cleanText(match[5] || ''), price: cleanText(match[6]),
      });
    }
  }
  const seen = new Set<string>();
  return units.filter((unit) => {
    const key = normalizeText(unit.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function unitFromParts(cells: string[]): BoardWizardListingUnit {
  const joined = cells.join(' · ');
  const compactUnitMatch = joined.match(/\bUnit\s*#?\s*([A-Z0-9-]+?)(?=(?:\d(?:\.\d+)?\s*bd\b|Studio\b|\s*[·,]|$))/i);
  const unitName = compactUnitMatch
    ? `Unit ${compactUnitMatch[1]}`
    : (cells.find((cell) => /\bunit\s*[#a-z0-9-]+/i.test(cell)) || cells[0] || 'Available unit');
  const details = compactUnitMatch ? joined.replace(compactUnitMatch[0], ' ') : joined.replace(unitName, ' ');
  return {
    name: unitName,
    bedrooms: details.match(/\b(?:studio|\d+(?:\.\d+)?\s*bd)\b/i)?.[0] || '',
    bathrooms: details.match(/\b\d+(?:\.\d+)?\s*ba\b/i)?.[0] || '',
    area: details.match(/\b\d[\d,]*\s*(?:sq\.?\s*ft|ft²)\b/i)?.[0] || '',
    availability: cells.find((cell) => /\b(?:available|now|immediate|\d{1,2}\/\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(cell)) || '',
    price: joined.match(/\$[\d,]+(?:\/mo)?/i)?.[0] || '',
  };
}

function extractHost(node: JsonRecord, text: string): string {
  const provider = recordValue(node.provider);
  const author = recordValue(node.author);
  const structured = firstText(provider.name, author.name);
  if (structured) return structured;
  return text.match(/\bHosted by\s+([^·|\n]{2,80})/i)?.[1]?.trim() || '';
}

function formatOfferPrice(offers: JsonRecord): string {
  const price = firstText(offers.price, offers.lowPrice);
  if (!price) return '';
  const currency = firstText(offers.priceCurrency);
  return currency ? `${currency} ${price}` : price;
}

function formatAddress(value: unknown): string {
  if (typeof value === 'string') return cleanText(value);
  const address = recordValue(value);
  return [address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode, address.addressCountry]
    .map((part) => firstText(part)).filter(Boolean).join(', ');
}

function listingKindFromUrl(value: string): BoardWizardListingKind | null {
  const hostname = safeHostname(value);
  if (VACATION_HOSTS.test(hostname)) return 'vacation-rental';
  if (REAL_ESTATE_HOSTS.test(hostname)) return 'real-estate';
  if (HOTEL_HOSTS.test(hostname)) return 'hotel';
  return null;
}

function isStrongListingUrl(value: string): boolean {
  const kind = listingKindFromUrl(value);
  if (!kind) return false;
  try {
    const url = new URL(value);
    if (/airbnb\./i.test(url.hostname)) return /\/rooms\/\d+/i.test(url.pathname);
    if (/zillow\./i.test(url.hostname)) {
      return /\/homedetails\//i.test(url.pathname)
        || /\/b\/[^/]+\/[A-Za-z0-9_-]{5,}\/?$/i.test(url.pathname)
        || /\/apartments\/[^/]+\/[^/]+\/[A-Za-z0-9_-]{5,}\/?$/i.test(url.pathname);
    }
    if (/(?:^|\/)(?:search|vacation-rentals|category|browse|s\/homes)(?:\/|$)/i.test(url.pathname)) return false;
    return url.pathname.split('/').filter(Boolean).length >= 2;
  } catch {
    return false;
  }
}

function metaContent(document: Document, attribute: 'name' | 'property', key: string): string {
  return document.querySelector(`meta[${attribute}="${key.replace(/"/g, '')}" i]`)?.getAttribute('content')?.trim() || '';
}

function absoluteImageUrl(value: string, baseUrl: string): string {
  if (!value) return '';
  const normalized = value.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/gi, '&');
  try {
    const url = new URL(normalized, baseUrl);
    return /^https?:$/i.test(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function safeHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function safeHostname(value: string): string {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
}

function hostnameLabel(value: string): string {
  const host = safeHostname(value).replace(/^www\./, '');
  const label = host.split('.')[0] || '';
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
}

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(stringList) : typeof value === 'string' ? [value] : [];
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' || typeof value === 'number') {
      const clean = cleanText(String(value));
      if (clean) return clean;
    }
  }
  return '';
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeText(value: string): string {
  return cleanText(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(firstText(value));
  return Number.isFinite(number) ? number : undefined;
}
