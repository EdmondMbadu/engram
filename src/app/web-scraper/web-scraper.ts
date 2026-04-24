import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { getFirebaseApp } from '../firebase.client';
import { AuthService } from '../auth.service';
import { AtlasService } from '../atlas.service';
import { DocumentsService } from '../documents.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { AtlasSwitcherComponent } from '../atlas-switcher/atlas-switcher';
import { AtlasBadgeComponent } from '../atlas-badge/atlas-badge';
import type { DocumentItem } from '../atlas.models';

type ScraperState =
  | 'IDLE'
  | 'DISCOVERING'
  | 'PREVIEW'
  | 'SCRAPING'
  | 'DONE'
  | 'ERROR';

type DiscoveryPlatform = 'beehiiv' | 'substack' | 'ghost' | 'generic';

interface DiscoveredArticle {
  title: string;
  url: string;
  domain: string;
  alreadyIngested: boolean;
}

interface ScrapeFailure {
  title: string;
  url: string;
  reason: string;
}

interface ScrapeLogEntry {
  id: string;
  status: 'success' | 'error' | 'info';
  message: string;
}

const AVERAGE_TOKENS_PER_ARTICLE = 1_064;
const EMBEDDING_COST_PER_MILLION_TOKENS = 0.02;

@Component({
  selector: 'app-web-scraper',
  imports: [
    FormsModule,
    RouterLink,
    ThemeToggleComponent,
    MobileMenuComponent,
    AtlasSwitcherComponent,
    AtlasBadgeComponent,
  ],
  templateUrl: './web-scraper.html',
})
export class WebScraperComponent {
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly documentsService = inject(DocumentsService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);
  private readonly discoveryPageBatchSize = 500;

  readonly state = signal<ScraperState>('IDLE');
  readonly sourceUrl = signal('');
  readonly isSigningOut = signal(false);
  readonly avatarMenuOpen = signal(false);
  readonly statusMessage = signal<string | null>(null);
  readonly discoveredArticles = signal<DiscoveredArticle[]>([]);
  readonly scrapeCount = signal(0);
  readonly skipAlreadyIngested = signal(true);
  readonly currentArticle = signal<DiscoveredArticle | null>(null);
  readonly currentStageLabel = signal('Waiting to begin');
  readonly completedCount = signal(0);
  readonly successfulCount = signal(0);
  readonly failures = signal<ScrapeFailure[]>([]);
  readonly recentLog = signal<ScrapeLogEntry[]>([]);
  readonly cancelRequested = signal(false);
  readonly runCancelled = signal(false);
  readonly discoveryDomain = signal<string | null>(null);

  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly atlasHomeLink = this.atlasService.activeAtlasHomeLink;
  readonly atlasWikiLink = this.atlasService.activeAtlasWikiLink;
  readonly activeAtlas = this.atlasService.activeAtlas;
  readonly activeAtlasName = computed(() => this.atlasService.displayName(this.activeAtlas()));
  readonly totalDiscovered = computed(() => this.discoveredArticles().length);
  readonly alreadyIngestedCount = computed(
    () => this.discoveredArticles().filter((article) => article.alreadyIngested).length,
  );
  readonly eligibleArticles = computed(() => {
    const articles = this.discoveredArticles();
    if (!this.skipAlreadyIngested()) {
      return articles;
    }
    return articles.filter((article) => !article.alreadyIngested);
  });
  readonly eligibleCount = computed(() => this.eligibleArticles().length);
  readonly clampedScrapeCount = computed(() => {
    const total = this.eligibleCount();
    if (total <= 0) {
      return 0;
    }

    return Math.min(Math.max(this.scrapeCount(), 1), total);
  });
  readonly selectedArticles = computed(() =>
    this.eligibleArticles().slice(0, this.clampedScrapeCount()),
  );
  readonly estimatedTokens = computed(
    () => this.clampedScrapeCount() * AVERAGE_TOKENS_PER_ARTICLE,
  );
  readonly estimatedCost = computed(
    () =>
      (this.estimatedTokens() / 1_000_000) * EMBEDDING_COST_PER_MILLION_TOKENS,
  );
  readonly progressPercent = computed(() => {
    const total = this.clampedScrapeCount();
    if (total <= 0) {
      return 0;
    }
    return Math.round((this.completedCount() / total) * 100);
  });
  readonly pageSubtitle = computed(() => {
    switch (this.state()) {
      case 'DISCOVERING':
        return this.discoveryDomain()
          ? `Finding articles on ${this.discoveryDomain()}`
          : 'Finding article links';
      case 'PREVIEW':
        return 'Review the links, choose a count, and queue them into the current atlas.';
      case 'SCRAPING':
        return 'Queueing article URLs one by one and waiting for ingestion to finish.';
      case 'DONE':
        return this.runCancelled()
          ? 'The run stopped after the current article completed.'
          : 'The scrape run has finished.';
      case 'ERROR':
        return 'Fix the issue below and try another source.';
      default:
        return 'Discover article links from a source page and ingest them into the active atlas.';
    }
  });

  readonly userInitials = computed(() => {
    const name = this.currentUserName()?.trim();
    if (!name) {
      return '?';
    }

    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase();

    return initials || '?';
  });

  toggleAvatarMenu(): void {
    this.avatarMenuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (
      !this.elementRef.nativeElement
        .querySelector('.avatar-menu-wrapper')
        ?.contains(event.target as Node)
    ) {
      this.avatarMenuOpen.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.isSigningOut.set(true);
    this.avatarMenuOpen.set(false);

    try {
      await this.authService.signOut();
      await this.router.navigateByUrl('/');
    } finally {
      this.isSigningOut.set(false);
    }
  }

  updateScrapeCount(value: unknown): void {
    const numericValue = Number(value);
    const total = this.eligibleCount();
    if (!Number.isFinite(numericValue)) {
      this.scrapeCount.set(total);
      return;
    }

    this.scrapeCount.set(total > 0 ? Math.min(Math.max(Math.floor(numericValue), 1), total) : 0);
  }

  toggleSkipAlreadyIngested(value: boolean): void {
    this.skipAlreadyIngested.set(value);
    this.scrapeCount.set(this.eligibleCount());
  }

  async discoverArticles(): Promise<void> {
    const normalizedUrl = this.normalizeInputUrl(this.sourceUrl());
    if (!normalizedUrl) {
      this.state.set('ERROR');
      this.statusMessage.set('Enter a valid listing page URL.');
      return;
    }

    this.state.set('DISCOVERING');
    this.statusMessage.set(null);
    this.discoveryDomain.set(this.safeDomain(normalizedUrl));
    this.discoveredArticles.set([]);
    this.scrapeCount.set(0);
    this.currentArticle.set(null);
    this.currentStageLabel.set('Waiting to begin');
    this.completedCount.set(0);
    this.successfulCount.set(0);
    this.failures.set([]);
    this.recentLog.set([]);
    this.cancelRequested.set(false);
    this.runCancelled.set(false);

    try {
      const articles = await this.discoverArticlesFromUrl(normalizedUrl);

      if (articles.length === 0) {
        this.state.set('ERROR');
        this.statusMessage.set(
          'No same-domain article links matched the current discovery rules on that page.',
        );
        return;
      }

      this.sourceUrl.set(normalizedUrl);
      this.discoveredArticles.set(articles);
      const eligible = this.skipAlreadyIngested()
        ? articles.filter((article) => !article.alreadyIngested).length
        : articles.length;
      this.scrapeCount.set(eligible);
      this.state.set('PREVIEW');
    } catch (error) {
      this.state.set('ERROR');
      this.statusMessage.set(
        error instanceof Error ? error.message : 'Discovery failed. Try another source URL.',
      );
    }
  }

  private async discoverArticlesFromUrl(seedUrl: string): Promise<DiscoveredArticle[]> {
    const discoveryUrls = await this.buildDiscoveryUrls(seedUrl);
    const htmlPages = await Promise.all(
      discoveryUrls.map((url) => this.fetchHtmlThroughProxy(url)),
    );

    const deduped = new Map<string, DiscoveredArticle>();
    for (const html of htmlPages) {
      for (const article of this.extractArticlesFromHtml(html, seedUrl)) {
        if (!deduped.has(article.url)) {
          deduped.set(article.url, article);
        }
      }
    }

    return Array.from(deduped.values());
  }

  async startScraping(): Promise<void> {
    const atlasId = this.atlasService.activeAtlasId();
    const targets = this.selectedArticles();

    if (!atlasId) {
      this.state.set('ERROR');
      this.statusMessage.set('Select an atlas before starting a scrape run.');
      return;
    }

    if (targets.length === 0) {
      this.state.set('ERROR');
      this.statusMessage.set('Discover at least one article before starting.');
      return;
    }

    this.state.set('SCRAPING');
    this.statusMessage.set(null);
    this.completedCount.set(0);
    this.successfulCount.set(0);
    this.failures.set([]);
    this.recentLog.set([]);
    this.cancelRequested.set(false);
    this.runCancelled.set(false);

    for (let index = 0; index < targets.length; index += 1) {
      const article = targets[index];
      this.currentArticle.set(article);
      this.currentStageLabel.set('Queueing URL for background ingestion');

      try {
        await this.documentsService.queueUrlDocument(article.url, { atlasId });
        this.successfulCount.update((count) => count + 1);
        this.pushLog('success', `Queued ${article.title}`);
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'The article could not be queued.';
        this.failures.update((items) => [
          ...items,
          { title: article.title, url: article.url, reason },
        ]);
        this.pushLog('error', `Failed to queue ${article.title}: ${reason}`);
      }

      this.completedCount.update((count) => count + 1);

      if (this.cancelRequested()) {
        this.runCancelled.set(true);
        break;
      }

      if (index < targets.length - 1) {
        this.currentStageLabel.set('Rate limiting before the next queue');
        await this.delay(1100);
      }
    }

    this.currentArticle.set(null);
    this.currentStageLabel.set(
      this.runCancelled()
        ? 'Queueing stopped after the current article.'
        : 'Queueing complete. Background ingestion continues in Source Files.',
    );
    this.state.set('DONE');
  }

  requestCancel(): void {
    this.cancelRequested.set(true);
    this.currentStageLabel.set('Cancel requested. Finishing the current article first.');
  }

  reset(): void {
    this.state.set('IDLE');
    this.statusMessage.set(null);
    this.discoveredArticles.set([]);
    this.scrapeCount.set(0);
    this.currentArticle.set(null);
    this.currentStageLabel.set('Waiting to begin');
    this.completedCount.set(0);
    this.successfulCount.set(0);
    this.failures.set([]);
    this.recentLog.set([]);
    this.cancelRequested.set(false);
    this.runCancelled.set(false);
    this.discoveryDomain.set(null);
    this.sourceUrl.set('');
  }

  logClasses(entry: ScrapeLogEntry): string {
    switch (entry.status) {
      case 'success':
        return 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-text)]';
      case 'error':
        return 'border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error-text)]';
      default:
        return 'border-white/10 bg-white/[0.03] text-[var(--muted)]';
    }
  }

  private async fetchHtmlThroughProxy(url: string): Promise<string> {
    const projectId = getFirebaseApp().options.projectId;
    if (!projectId) {
      throw new Error('Firebase project configuration is missing.');
    }

    const endpoints = this.fetchProxyEndpoints(projectId, url);
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

    throw lastError instanceof Error
      ? lastError
      : new Error('Could not fetch the source page.');
  }

  private async readProxyError(response: Response): Promise<string> {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const payload = (await response.json()) as {
          message?: unknown;
          upstreamStatus?: unknown;
          targetHost?: unknown;
          code?: unknown;
        };

        const message =
          typeof payload.message === 'string' && payload.message.trim()
            ? payload.message.trim()
            : null;
        const targetHost =
          typeof payload.targetHost === 'string' && payload.targetHost.trim()
            ? payload.targetHost.trim()
            : null;

        if (message && targetHost) {
          return `${message} Source: ${targetHost}.`;
        }
        if (message) {
          return message;
        }
      } catch {
        // Fall through to the generic message below.
      }
    }

    return `Could not fetch the source page (${response.status}).`;
  }

  private fetchProxyEndpoints(projectId: string, targetUrl: string): string[] {
    const encodedUrl = encodeURIComponent(targetUrl);
    const productionEndpoint = `https://us-central1-${projectId}.cloudfunctions.net/fetchProxy?url=${encodedUrl}`;

    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return [
          `http://127.0.0.1:5001/${projectId}/us-central1/fetchProxy?url=${encodedUrl}`,
          productionEndpoint,
        ];
      }
    }

    return [productionEndpoint];
  }

  private async buildDiscoveryUrls(seedUrl: string): Promise<string[]> {
    const seed = new URL(seedUrl);
    if (this.normalizeHost(seed.hostname) !== 'amanet.org') {
      return [seedUrl];
    }

    if (!seed.pathname.toLowerCase().startsWith('/articles')) {
      return [seedUrl];
    }

    const firstPageUrl = new URL(seedUrl);
    firstPageUrl.searchParams.set('mpp', String(this.discoveryPageBatchSize));
    firstPageUrl.searchParams.set('pg', '1');

    const firstHtml = await this.fetchHtmlThroughProxy(firstPageUrl.toString());
    const totalResults = this.extractAmaTotalResults(firstHtml);
    if (!totalResults || totalResults <= this.discoveryPageBatchSize) {
      return [firstPageUrl.toString()];
    }

    const totalPages = Math.ceil(totalResults / this.discoveryPageBatchSize);
    const urls = [firstPageUrl.toString()];
    for (let page = 2; page <= totalPages; page += 1) {
      const pageUrl = new URL(firstPageUrl.toString());
      pageUrl.searchParams.set('pg', String(page));
      urls.push(pageUrl.toString());
    }

    return urls;
  }

  private extractAmaTotalResults(html: string): number | null {
    const text = html.replace(/\s+/g, ' ');
    const match =
      text.match(/articles\s*:\s*\d+\s*-\s*\d+\s*of\s*(\d+)\s*results/i) ??
      text.match(/content\s*\((\d+)\)/i);

    if (!match) {
      return null;
    }

    const total = Number(match[1]);
    return Number.isFinite(total) && total > 0 ? total : null;
  }

  private extractArticlesFromHtml(html: string, seedUrl: string): DiscoveredArticle[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const platform = this.detectPlatform(seedUrl, doc);
    const seed = new URL(seedUrl);
    const seedHost = this.normalizeHost(seed.hostname);
    const seedKey = this.normalizeComparableUrl(seed.toString());
    const existingUrls = this.collectExistingIngestedUrls();
    const seen = new Set<string>();
    const articles: DiscoveredArticle[] = [];

    for (const anchor of Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
      const href = anchor.getAttribute('href')?.trim() ?? '';
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) {
        continue;
      }

      let candidate: URL;
      try {
        candidate = new URL(href, seed);
      } catch {
        continue;
      }

      if (!['http:', 'https:'].includes(candidate.protocol)) {
        continue;
      }

      if (this.normalizeHost(candidate.hostname) !== seedHost) {
        continue;
      }

      const comparableUrl = this.normalizeComparableUrl(candidate.toString());
      if (!comparableUrl || comparableUrl === seedKey || seen.has(comparableUrl)) {
        continue;
      }

      if (!this.matchesArticlePattern(candidate, platform)) {
        continue;
      }

      seen.add(comparableUrl);
      articles.push({
        title: this.extractLinkTitle(anchor, candidate),
        url: comparableUrl,
        domain: candidate.hostname,
        alreadyIngested: existingUrls.has(comparableUrl),
      });
    }

    return articles;
  }

  private collectExistingIngestedUrls(): Set<string> {
    const urls = new Set<string>();
    for (const document of this.documentsService.documents()) {
      if (document.source_type !== 'url') {
        continue;
      }
      const candidate =
        (typeof document.source_url === 'string' && document.source_url.trim()) ||
        (typeof document.filename === 'string' && document.filename.trim()) ||
        '';
      if (!candidate) {
        continue;
      }
      try {
        urls.add(this.normalizeComparableUrl(candidate));
      } catch {
        // ignore malformed stored URLs
      }
    }
    return urls;
  }

  private detectPlatform(seedUrl: string, doc: Document): DiscoveryPlatform {
    const host = this.normalizeHost(new URL(seedUrl).hostname);
    if (host.includes('beehiiv.com')) {
      return 'beehiiv';
    }
    if (host.includes('substack.com')) {
      return 'substack';
    }

    const generator = doc
      .querySelector('meta[name="generator"]')
      ?.getAttribute('content')
      ?.toLowerCase() ?? '';
    if (host.includes('ghost.io') || generator.includes('ghost')) {
      return 'ghost';
    }

    return 'generic';
  }

  private matchesArticlePattern(url: URL, platform: DiscoveryPlatform): boolean {
    const pathname = url.pathname.toLowerCase();
    if (!pathname || this.isExcludedPath(pathname)) {
      return false;
    }

    if (platform === 'beehiiv' || platform === 'substack') {
      return pathname.includes('/p/');
    }

    if (platform === 'ghost') {
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length === 0 || segments.length > 2) {
        return false;
      }
      if (segments[segments.length - 1].includes('.')) {
        return false;
      }
      return true;
    }

    return this.matchesGenericArticlePath(url);
  }

  private matchesGenericArticlePath(url: URL): boolean {
    if (this.hasDisqualifyingArticleQuery(url)) {
      return false;
    }

    const segments = url.pathname
      .toLowerCase()
      .split('/')
      .filter(Boolean);

    for (const section of ['p', 'articles', 'posts', 'blog', 'entry']) {
      const sectionIndex = segments.indexOf(section);
      if (sectionIndex === -1) {
        continue;
      }

      const slugSegments = segments.slice(sectionIndex + 1);
      if (slugSegments.length === 0) {
        return false;
      }

      if (slugSegments.some((segment) => this.isDisallowedArticleSegment(segment))) {
        return false;
      }

      const slug = slugSegments[slugSegments.length - 1];
      return this.isLikelyArticleSlug(slug);
    }

    return false;
  }

  private hasDisqualifyingArticleQuery(url: URL): boolean {
    const disallowedKeys = new Set([
      'pg',
      'page',
      'mpp',
      'sort',
      'filter',
      'keyword',
      'it',
      'hawksortby',
      'hawktabs',
      'content_topic',
      'redir',
      'returnurl',
    ]);

    for (const key of url.searchParams.keys()) {
      if (disallowedKeys.has(key.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  private isDisallowedArticleSegment(segment: string): boolean {
    return [
      'page',
      'tag',
      'tags',
      'category',
      'categories',
      'author',
      'authors',
      'search',
      'archive',
    ].includes(segment);
  }

  private isLikelyArticleSlug(value: string): boolean {
    if (!value || value.includes('.')) {
      return false;
    }

    if (/^\d+$/.test(value)) {
      return false;
    }

    return /[a-z]/.test(value) && value.length >= 4;
  }

  private isExcludedPath(pathname: string): boolean {
    const normalized = pathname.toLowerCase();
    if (normalized === '/' || normalized === '/about' || normalized === '/contact') {
      return true;
    }

    return (
      normalized.startsWith('/tag/') ||
      normalized.startsWith('/category/') ||
      normalized.startsWith('/author/')
    );
  }

  private extractLinkTitle(anchor: HTMLAnchorElement, candidate: URL): string {
    const textCandidates = [
      anchor.textContent,
      anchor.querySelector('h1,h2,h3,h4,h5,h6')?.textContent,
      anchor.closest('article,li,section,div')?.querySelector('h1,h2,h3,h4,h5,h6')?.textContent,
      anchor.previousElementSibling?.matches('h1,h2,h3,h4,h5,h6')
        ? anchor.previousElementSibling.textContent
        : null,
      anchor.nextElementSibling?.matches('h1,h2,h3,h4,h5,h6')
        ? anchor.nextElementSibling.textContent
        : null,
    ];

    for (const candidateText of textCandidates) {
      const cleaned = this.cleanTitle(candidateText ?? '');
      if (cleaned) {
        return cleaned;
      }
    }

    return candidate.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? candidate.href;
  }

  private cleanTitle(value: string): string {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length < 4) {
      return '';
    }
    if (/^(read more|learn more|more|open|click here)$/i.test(cleaned)) {
      return '';
    }
    return cleaned;
  }

  private normalizeInputUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
      const url = new URL(withProtocol);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return null;
      }
      return this.normalizeComparableUrl(url.toString());
    } catch {
      return null;
    }
  }

  private normalizeComparableUrl(value: string): string {
    const url = new URL(value);
    url.hash = '';

    for (const key of Array.from(url.searchParams.keys())) {
      if (/^utm_/i.test(key) || key === 'ref' || key === 'source') {
        url.searchParams.delete(key);
      }
    }

    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
    url.pathname = normalizedPath;
    return url.toString();
  }

  private normalizeHost(hostname: string): string {
    return hostname.toLowerCase().replace(/^www\./, '');
  }

  private safeDomain(value: string): string {
    try {
      return new URL(value).hostname;
    } catch {
      return value;
    }
  }

  private pushLog(status: ScrapeLogEntry['status'], message: string): void {
    this.recentLog.update((entries) => {
      const next = [
        ...entries,
        {
          id: `${Date.now()}-${entries.length}`,
          status,
          message,
        },
      ];
      return next.slice(-5);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
