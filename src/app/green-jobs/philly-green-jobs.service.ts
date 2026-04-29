import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { getFirebaseApp } from '../firebase.client';

export type GreenListingBucket = 'jobs' | 'pathways';
export type GreenListingFit = 'direct' | 'support' | 'pathway';

export interface PhillyGreenJobListing {
  id: string;
  title: string;
  organization: string;
  summary: string;
  location: string;
  sourceId: string;
  sourceLabel: string;
  sourceUrl: string;
  detailsUrl: string;
  applyUrl: string;
  bucket: GreenListingBucket;
  fit: GreenListingFit;
  postedLabel: string | null;
  compensation: string | null;
  greenReason: string;
  tags: string[];
}

export interface PhillyGreenJobSourceStatus {
  id: string;
  label: string;
  url: string;
  cadence: 'daily' | 'weekly';
  bucket: GreenListingBucket | 'mixed';
  note: string;
  itemCount: number;
  refreshedAt: string | null;
  error: string | null;
}

export interface PhillyGreenJobsSnapshot {
  listings: PhillyGreenJobListing[];
  sources: PhillyGreenJobSourceStatus[];
  refreshedAt: string;
}

interface SourceDefinition {
  id: string;
  label: string;
  url: string;
  cadence: 'daily' | 'weekly';
  bucket: GreenListingBucket | 'mixed';
  note: string;
  scrape: (html: string, source: SourceDefinition) => Promise<PhillyGreenJobListing[]> | PhillyGreenJobListing[];
}

const CACHE_KEY = 'living-wiki:philly-green-jobs:v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PHILADELPHIA = 'Philadelphia, PA';

@Injectable({ providedIn: 'root' })
export class PhillyGreenJobsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly sources: SourceDefinition[] = [
    {
      id: 'pea-recent-opportunities',
      label: 'PEA Recent Opportunities',
      url: 'https://philaenergy.org/',
      cadence: 'daily',
      bucket: 'jobs',
      note: 'Recent opportunities syndicated by the Philadelphia Energy Authority job ecosystem.',
      scrape: (html, source) => this.scrapePeaRecentOpportunities(html, source),
    },
    {
      id: 'eca-open-roles',
      label: 'Energy Coordinating Agency Open Roles',
      url: 'https://ecasavesenergy.org/about/join-our-team/',
      cadence: 'daily',
      bucket: 'jobs',
      note: 'Direct openings at one of Philadelphia’s core clean-energy workforce institutions.',
      scrape: (html, source) => this.scrapeEcaJobs(html, source),
    },
    {
      id: 'eca-training-center',
      label: 'ECA Training Center',
      url: 'https://ecasavesenergy.org/training-center/',
      cadence: 'weekly',
      bucket: 'pathways',
      note: 'Clean-energy training programs for HVAC, retrofit, remediation, heat pumps, and more.',
      scrape: (html, source) => this.scrapeEcaTraining(html, source),
    },
    {
      id: 'powercorps-apply-now',
      label: 'PowerCorpsPHL Pathways',
      url: 'https://powercorpsphl.org/apply-now/',
      cadence: 'weekly',
      bucket: 'pathways',
      note: 'Environmental stewardship, urban agriculture, and reforestation pathways tied to Philly employers.',
      scrape: (html, source) => this.scrapePowerCorpsPrograms(html, source),
    },
    {
      id: 'pwd-apprenticeship',
      label: 'PWD Apprenticeships',
      url: 'https://water.phila.gov/careers/apprenticeship/',
      cadence: 'weekly',
      bucket: 'pathways',
      note: 'Public-sector pathways into water, treatment operations, and green stormwater infrastructure.',
      scrape: (html, source) => this.scrapePwdApprenticeships(html, source),
    },
  ];

  readCachedSnapshot(): PhillyGreenJobsSnapshot | null {
    if (!this.isBrowser) {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as { expiresAt?: number; snapshot?: PhillyGreenJobsSnapshot };
      if (!parsed?.snapshot || typeof parsed.expiresAt !== 'number') {
        return null;
      }

      if (Date.now() > parsed.expiresAt) {
        window.localStorage.removeItem(CACHE_KEY);
        return null;
      }

      return parsed.snapshot;
    } catch {
      return null;
    }
  }

  async fetchLatestSnapshot(): Promise<PhillyGreenJobsSnapshot> {
    const refreshStartedAt = new Date().toISOString();
    const sourceResults = await Promise.all(
      this.sources.map(async (source) => {
        try {
          const html = await this.fetchHtmlThroughProxy(source.url);
          const listings = await source.scrape(html, source);
          return {
            source,
            listings,
            error: null,
          };
        } catch (error) {
          return {
            source,
            listings: [] as PhillyGreenJobListing[],
            error: error instanceof Error ? error.message : 'Could not refresh this source.',
          };
        }
      }),
    );

    const listings = dedupeListings(
      sourceResults.flatMap((result) => result.listings),
    ).sort((left, right) => {
      if (left.bucket !== right.bucket) {
        return left.bucket === 'jobs' ? -1 : 1;
      }
      return left.title.localeCompare(right.title);
    });

    const sources = sourceResults.map((result) => ({
      id: result.source.id,
      label: result.source.label,
      url: result.source.url,
      cadence: result.source.cadence,
      bucket: result.source.bucket,
      note: result.source.note,
      itemCount: result.listings.length,
      refreshedAt: refreshStartedAt,
      error: result.error,
    }));

    const snapshot = {
      listings,
      sources,
      refreshedAt: refreshStartedAt,
    };

    this.writeCachedSnapshot(snapshot);
    return snapshot;
  }

  private writeCachedSnapshot(snapshot: PhillyGreenJobsSnapshot): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      window.localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          snapshot,
          expiresAt: Date.now() + CACHE_TTL_MS,
        }),
      );
    } catch {
      // Ignore storage failures and keep the page live.
    }
  }

  private async fetchHtmlThroughProxy(url: string): Promise<string> {
    const projectId = getFirebaseApp().options.projectId;
    if (!projectId) {
      throw new Error('Firebase project configuration is missing.');
    }

    const encodedUrl = encodeURIComponent(url);
    const endpoints = [
      ...(typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
        ? [`http://127.0.0.1:5001/${projectId}/us-central1/fetchProxy?url=${encodedUrl}`]
        : []),
      `https://us-central1-${projectId}.cloudfunctions.net/fetchProxy?url=${encodedUrl}`,
    ];

    let lastError: unknown = null;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        if (!response.ok) {
          throw new Error(await this.readProxyError(response));
        }

        return await response.text();
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Could not fetch the source page.');
  }

  private async readProxyError(response: Response): Promise<string> {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const payload = (await response.json()) as { message?: unknown; targetHost?: unknown };
        const message = typeof payload.message === 'string' ? payload.message.trim() : '';
        const targetHost = typeof payload.targetHost === 'string' ? payload.targetHost.trim() : '';
        if (message && targetHost) {
          return `${message} Source: ${targetHost}.`;
        }
        if (message) {
          return message;
        }
      } catch {
        // Fall through to the generic response.
      }
    }

    return `Could not fetch the source page (${response.status}).`;
  }

  private async scrapePeaRecentOpportunities(
    html: string,
    source: SourceDefinition,
  ): Promise<PhillyGreenJobListing[]> {
    const document = parseDocument(html);
    const anchors = Array.from(document.querySelectorAll('a[href]'))
      .map((anchor) => ({
        href: normalizeUrl(anchor.getAttribute('href'), source.url),
        text: cleanText(anchor.textContent),
      }))
      .filter((anchor) => anchor.href.includes('/job/') && anchor.text && !anchor.text.toLowerCase().includes('view all jobs'));

    const uniqueLinks = Array.from(new Map(anchors.map((anchor) => [anchor.href, anchor])).values()).slice(0, 6);
    const detailResults = await Promise.all(
      uniqueLinks.map(async (link) => {
        try {
          const detailHtml = await this.fetchHtmlThroughProxy(link.href);
          return this.parsePeaJobDetail(detailHtml, link.href, source);
        } catch {
          return null;
        }
      }),
    );

    return detailResults.filter((listing): listing is PhillyGreenJobListing => !!listing);
  }

  private parsePeaJobDetail(
    html: string,
    detailsUrl: string,
    source: SourceDefinition,
  ): PhillyGreenJobListing | null {
    const document = parseDocument(html);
    const title = lastNonEmptyText(document, 'h1') || cleanTitleFromUrl(detailsUrl);
    const lines = sliceContentLines(document, title, ['View all jobs', 'Have a job listing', 'Contact Us']);
    if (!title || lines.length === 0) {
      return null;
    }

    const organization = firstMatchingLine(lines, (line) => !/^posted\b/i.test(line) && !looksLikeLocation(line) && !looksLikeCompensation(line)) ?? 'Philadelphia clean-energy employer';
    const location = firstMatchingLine(lines, looksLikeLocation) ?? PHILADELPHIA;
    const postedLabel = firstMatchingLine(lines, (line) => /^posted\b/i.test(line)) ?? null;
    const compensation = firstMatchingLine(lines, looksLikeCompensation) ?? null;
    const summary = summarizeLines(
      lines,
      new Set([organization, location, postedLabel ?? '', compensation ?? '', title]),
    );
    const applyUrl =
      externalActionLink(document, detailsUrl, /apply|click here|submit/i) ??
      detailsUrl;
    const tags = buildTags(`${title} ${organization} ${summary}`);
    const fit = inferFit(tags, 'jobs');

    return {
      id: source.id + ':' + stableId(detailsUrl),
      title,
      organization,
      summary,
      location,
      sourceId: source.id,
      sourceLabel: source.label,
      sourceUrl: source.url,
      detailsUrl,
      applyUrl,
      bucket: 'jobs',
      fit,
      postedLabel,
      compensation,
      greenReason: buildGreenReason(fit, tags),
      tags,
    };
  }

  private scrapeEcaJobs(html: string, source: SourceDefinition): PhillyGreenJobListing[] {
    const document = parseDocument(html);
    const headingLinks = Array.from(document.querySelectorAll('h2 a[href], h3 a[href]'))
      .map((anchor) => ({
        title: cleanText(anchor.textContent),
        detailsUrl: normalizeUrl(anchor.getAttribute('href'), source.url),
      }))
      .filter((item) => item.title && item.title.toLowerCase() !== 'join our team');

    const lines = sliceContentLines(document, 'Available Positions', ['Get Updates']);
    const listings = headingLinks.map((item) => {
      const titleIndex = lines.findIndex((line) => line === item.title);
      const relevantLines = titleIndex >= 0 ? lines.slice(titleIndex + 1, titleIndex + 6) : lines;
      const postedLabel = firstMatchingLine(relevantLines, (line) => /^posted:/i.test(line)) ?? null;
      const summary = summarizeLines(relevantLines, new Set([item.title, postedLabel ?? '']));
      const tags = buildTags(`${item.title} ${summary} energy efficiency weatherization clean energy`);
      const fit = inferFit(tags, 'jobs');

      return {
        id: source.id + ':' + stableId(item.detailsUrl),
        title: item.title,
        organization: 'Energy Coordinating Agency',
        summary,
        location: PHILADELPHIA,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceUrl: source.url,
        detailsUrl: item.detailsUrl,
        applyUrl: item.detailsUrl,
        bucket: 'jobs' as const,
        fit,
        postedLabel,
        compensation: firstMatchingLine(relevantLines, looksLikeCompensation) ?? null,
        greenReason: buildGreenReason(fit, tags),
        tags,
      };
    });

    if (listings.length > 0) {
      return listings;
    }

    const fallbackTitle = firstMatchingLine(lines, (line) => line !== 'Available Positions' && !/^posted:/i.test(line));
    if (!fallbackTitle) {
      return [];
    }

    const titleIndex = lines.findIndex((line) => line === fallbackTitle);
    const relevantLines = titleIndex >= 0 ? lines.slice(titleIndex + 1, titleIndex + 6) : lines;
    const postedLabel = firstMatchingLine(relevantLines, (line) => /^posted:/i.test(line)) ?? null;
    const summary = summarizeLines(relevantLines, new Set([fallbackTitle, postedLabel ?? '']));
    const tags = buildTags(`${fallbackTitle} ${summary} energy efficiency weatherization clean energy`);

    return [
      {
        id: source.id + ':' + stableId(fallbackTitle),
        title: fallbackTitle,
        organization: 'Energy Coordinating Agency',
        summary,
        location: PHILADELPHIA,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceUrl: source.url,
        detailsUrl: source.url,
        applyUrl: source.url,
        bucket: 'jobs',
        fit: inferFit(tags, 'jobs'),
        postedLabel,
        compensation: firstMatchingLine(relevantLines, looksLikeCompensation) ?? null,
        greenReason: buildGreenReason(inferFit(tags, 'jobs'), tags),
        tags,
      },
    ];
  }

  private scrapeEcaTraining(html: string, source: SourceDefinition): PhillyGreenJobListing[] {
    const document = parseDocument(html);
    const lines = sliceContentLines(document, 'Our 2024 Impact', ['Build Your Program With Us']);
    const listItems = Array.from(document.querySelectorAll('li'))
      .map((item) => cleanText(item.textContent))
      .filter((item) =>
        [
          'Green Renovation + Retrofit',
          'Gas Technician',
          'HVAC Installer/Maintenance',
          'Heat Pump Technician',
          'Brownfields Environmental Remediation',
          'Disaster Recovery',
          'Integrated Pest Management',
        ].includes(item),
      );

    const baseSummary =
      firstMatchingLine(lines, (line) => /^Through \d+ cohorts/i.test(line)) ??
      'ECA offers grant-funded training programs that move Philadelphians into clean-energy work.';

    return listItems.map((program) => {
      const tags = buildTags(`${program} ${baseSummary}`);
      return {
        id: source.id + ':' + stableId(program),
        title: program,
        organization: 'Energy Coordinating Agency',
        summary: `${baseSummary} Apply through ECA’s trainee pipeline for upcoming Philadelphia cohorts.`,
        location: PHILADELPHIA,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceUrl: source.url,
        detailsUrl: 'https://ecasavesenergy.org/training-center/trainees/',
        applyUrl: 'https://ecasavesenergy.org/training-center/trainees/',
        bucket: 'pathways',
        fit: 'pathway',
        postedLabel: null,
        compensation: null,
        greenReason: 'Workforce pathway into Philadelphia’s clean-energy economy.',
        tags,
      };
    });
  }

  private scrapePowerCorpsPrograms(html: string, source: SourceDefinition): PhillyGreenJobListing[] {
    const lines = extractContentLines(parseDocument(html));
    const sections = ['INDUSTRY ACADEMIES', 'FOUNDATIONS', 'TRUST', 'PHILADELPHIA REFORESTATION HUB'];

    return sections.map((section) => {
      const index = lines.findIndex((line) => line.toUpperCase() === section);
      const summary = index >= 0 ? lines.slice(index + 1, index + 3).join(' ') : 'Philadelphia workforce pathway.';
      const title = toTitleCase(section);
      const tags = buildTags(`${title} ${summary}`);
      return {
        id: source.id + ':' + stableId(section),
        title,
        organization: 'PowerCorpsPHL',
        summary,
        location: PHILADELPHIA,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceUrl: source.url,
        detailsUrl: source.url,
        applyUrl: source.url,
        bucket: 'pathways',
        fit: 'pathway',
        postedLabel: null,
        compensation: null,
        greenReason: 'Paid or structured pathway into environmental stewardship and green-sector work in Philadelphia.',
        tags,
      };
    });
  }

  private scrapePwdApprenticeships(html: string, source: SourceDefinition): PhillyGreenJobListing[] {
    const document = parseDocument(html);
    const allItems = Array.from(document.querySelectorAll('li'))
      .map((item) => cleanText(item.textContent))
      .filter((item) =>
        [
          'Electrician',
          'Electronics & Instrumentation Technician',
          'HVAC Mechanic',
          'Machinery & Equipment Mechanic',
          'Engineering Aide',
          'Science Technician',
          'Green Stormwater Infrastructure Maintenance Worker',
          'Water Treatment Plant Operator',
          'Safety Technician',
        ].includes(item),
      );

    return allItems.map((item) => {
      const tags = buildTags(`${item} water stormwater apprenticeship`);
      return {
        id: source.id + ':' + stableId(item),
        title: item,
        organization: 'Philadelphia Water Department',
        summary: 'PWD apprenticeship pathway with a six-month temporary start and a route into permanent civil service roles.',
        location: PHILADELPHIA,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceUrl: source.url,
        detailsUrl: source.url,
        applyUrl: 'https://water.phila.gov/careers/apprenticeship/apply/',
        bucket: 'pathways',
        fit: 'pathway',
        postedLabel: null,
        compensation: null,
        greenReason: 'Public-sector pathway into water, treatment, and green stormwater infrastructure work.',
        tags,
      };
    });
  }
}

function parseDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function extractContentLines(document: Document): string[] {
  const root = document.querySelector('main') ?? document.body;
  const selectors = 'h1, h2, h3, h4, p, li, blockquote, a';
  const lines: string[] = [];

  for (const element of Array.from(root.querySelectorAll(selectors))) {
    const text = cleanText(element.textContent);
    if (!text) {
      continue;
    }

    if (lines[lines.length - 1] !== text) {
      lines.push(text);
    }
  }

  return lines;
}

function sliceContentLines(document: Document, startMarker: string, endMarkers: string[]): string[] {
  const lines = extractContentLines(document);
  const startIndex = lines.findIndex((line) => line.toLowerCase().includes(startMarker.toLowerCase()));
  if (startIndex === -1) {
    return lines;
  }

  const afterStart = lines.slice(startIndex);
  const endIndex = afterStart.findIndex((line, index) => index > 0 && endMarkers.some((marker) => line.toLowerCase().includes(marker.toLowerCase())));
  return endIndex >= 0 ? afterStart.slice(0, endIndex) : afterStart;
}

function normalizeUrl(rawHref: string | null, baseUrl: string): string {
  try {
    return new URL(rawHref ?? '', baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function cleanText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lastNonEmptyText(document: Document, selector: string): string {
  const values = Array.from(document.querySelectorAll(selector))
    .map((node) => cleanText(node.textContent))
    .filter(Boolean);
  return values[values.length - 1] ?? '';
}

function firstMatchingLine(
  lines: string[],
  matcher: ((line: string) => boolean) | RegExp,
): string | null {
  for (const line of lines) {
    if (matcher instanceof RegExp) {
      if (matcher.test(line)) {
        return line;
      }
      continue;
    }

    if (matcher(line)) {
      return line;
    }
  }

  return null;
}

function summarizeLines(lines: string[], excluded: Set<string>): string {
  const summaryParts = lines.filter((line) => {
    if (!line || excluded.has(line)) {
      return false;
    }

    const normalized = line.toLowerCase();
    if (
      normalized === 'job title' ||
      normalized === 'position overview' ||
      normalized === 'qualifications' ||
      normalized === 'responsibilities' ||
      normalized === 'to apply:' ||
      normalized === 'how to apply'
    ) {
      return false;
    }

    if (/^posted\b/i.test(line)) {
      return false;
    }

    return line.length > 30;
  });

  return summaryParts.slice(0, 3).join(' ').trim() || 'Philadelphia green-economy opportunity.';
}

function looksLikeLocation(line: string): boolean {
  return /,\s*pa\b|hybrid|remote|address|market street|broad street|clearfield street|kensington/i.test(line);
}

function looksLikeCompensation(line: string): boolean {
  return /\$[\d,]+|salary|annually|hourly|paid/i.test(line);
}

function externalActionLink(document: Document, baseUrl: string, textMatcher: RegExp): string | null {
  const baseHost = new URL(baseUrl).hostname.replace(/^www\./, '');
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map((anchor) => ({
      href: normalizeUrl(anchor.getAttribute('href'), baseUrl),
      text: cleanText(anchor.textContent),
    }))
    .filter((link) => link.href && textMatcher.test(link.text));

  const external = links.find((link) => new URL(link.href).hostname.replace(/^www\./, '') !== baseHost);
  return external?.href ?? links[0]?.href ?? null;
}

function stableId(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanTitleFromUrl(url: string): string {
  const segment = url
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .pop();
  return toTitleCase(segment?.replace(/^\d+$/, 'Opportunity') ?? 'Opportunity');
}

function toTitleCase(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildTags(corpus: string): string[] {
  const value = corpus.toLowerCase();
  const tags = new Set<string>();

  if (value.includes('solar')) tags.add('solar');
  if (value.includes('hvac') || value.includes('heat pump')) tags.add('hvac');
  if (value.includes('weatherization') || value.includes('retrofit')) tags.add('retrofit');
  if (value.includes('stormwater')) tags.add('stormwater');
  if (value.includes('water treatment') || value.includes('water department') || value.includes('water ')) tags.add('water');
  if (value.includes('energy efficiency') || value.includes('energy auditor')) tags.add('energy efficiency');
  if (value.includes('construction') || value.includes('building')) tags.add('green construction');
  if (value.includes('remediation')) tags.add('remediation');
  if (value.includes('urban agriculture') || value.includes('farm')) tags.add('urban agriculture');
  if (value.includes('reforestation') || value.includes('forestry')) tags.add('urban forestry');
  if (value.includes('apprentice')) tags.add('apprenticeship');
  if (value.includes('intern')) tags.add('internship');
  if (value.includes('training') || value.includes('academy') || value.includes('program')) tags.add('training');

  return Array.from(tags);
}

function inferFit(tags: string[], bucket: GreenListingBucket): GreenListingFit {
  if (bucket === 'pathways') {
    return 'pathway';
  }

  const directTags = ['solar', 'hvac', 'stormwater', 'water', 'energy efficiency', 'green construction', 'remediation', 'urban forestry', 'urban agriculture'];
  if (tags.some((tag) => directTags.includes(tag))) {
    return 'direct';
  }

  return 'support';
}

function buildGreenReason(fit: GreenListingFit, tags: string[]): string {
  if (fit === 'pathway') {
    return 'Workforce pathway into Philadelphia green-sector employment.';
  }

  if (fit === 'direct') {
    const focus = tags[0] ?? 'clean-energy';
    return `Direct ${focus} role tied to Philadelphia’s climate, water, building, or clean-energy economy.`;
  }

  return 'Support role inside a Philadelphia clean-energy, sustainability, or workforce institution.';
}

function dedupeListings(listings: PhillyGreenJobListing[]): PhillyGreenJobListing[] {
  const byKey = new Map<string, PhillyGreenJobListing>();
  for (const listing of listings) {
    const key = `${listing.applyUrl || listing.detailsUrl}::${listing.title.toLowerCase()}::${listing.organization.toLowerCase()}`;
    if (!byKey.has(key)) {
      byKey.set(key, listing);
    }
  }
  return Array.from(byKey.values());
}
