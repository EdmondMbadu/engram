import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { AtlasAdminProfile, AtlasChatGuideConfig, AtlasItem, AtlasNewsletterConfig, AtlasNewsletterTestResult, AtlasSubscriptionItem, AtlasTextMessagingConfig, AtlasTextMessagingProvider, AtlasUsage, AtlasVoiceAgentConfig, CityAtlasConfig, CityPulseMetric } from '../atlas.models';
import { AtlasService, type CityPopulationRefreshResult, type CustomCityAtlasInput } from '../atlas.service';
import { AuthService } from '../auth.service';
import { CITY_ATLAS_TEMPLATES, type CityAtlasTemplate } from '../city-atlas-templates';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

interface CityConfigDraft {
  enabled: boolean;
  city_name: string;
  region_name: string;
  country_code: string;
  timezone: string;
  census_state_code: string;
  census_place_code: string;
  airnow_zip_code: string;
  global_region: string;
  population: string;
  population_year: string;
  manual_metrics_json: string;
}

interface NewsletterDraft {
  enabled: boolean;
  day_of_week: number;
  send_time: string;
  timezone: string;
  prompt: string;
}

interface ChatGuideDraft {
  label: string;
  name: string;
  image_url: string;
  banner_url: string;
}

interface TextMessagingDraft {
  enabled: boolean;
  provider: AtlasTextMessagingProvider;
  phone_number: string;
  vapi_phone_number_id: string;
  webhook_token: string;
  webhook_url: string;
}

interface VoiceAgentDraft {
  enabled: boolean;
  phone_number: string;
  vapi_phone_number_id: string;
  vapi_assistant_id: string;
  webhook_token: string;
  tool_url: string;
}

interface CustomCityDraft {
  city_name: string;
  region_name: string;
  timezone: string;
  name: string;
  description: string;
  global_region: string;
  population: string;
  population_year: string;
  latitude: string;
  longitude: string;
}

interface BulkCityDraft extends CustomCityDraft {
  row_number: number;
  slug: string;
  errors: string[];
  duplicate: boolean;
  create_status: 'pending' | 'creating' | 'created' | 'skipped' | 'failed';
  create_error: string | null;
}

interface BulkCityProgress {
  total: number;
  processed: number;
  created: number;
  failed: number;
  skipped: number;
  started_at_ms: number;
}

interface PopulationBackfillProgress {
  total: number;
  processed: number;
  updated: number;
  failed: number;
  skipped: number;
  started_at_ms: number;
  mode: 'missing' | 'refresh';
}

function normalizeAdminCityIdentity(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/^my living wiki:\s*/i, '')
    .replace(/\s*\(flagship\)\s*$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function parseOptionalPositiveInteger(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : NaN;
}

@Component({
  selector: 'app-atlas-manage',
  imports: [FormsModule, RouterLink, ThemeToggleComponent],
  templateUrl: './atlas-manage.html',
})
export class AtlasManageComponent {
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly atlases = this.atlasService.atlases;
  readonly activeAtlasId = this.atlasService.activeAtlasId;
  readonly activeAtlasHomeLink = this.atlasService.activeAtlasHomeLink;
  readonly activeAtlasWikiLink = this.atlasService.activeAtlasWikiLink;

  readonly usageById = signal<Record<string, AtlasUsage>>({});
  readonly loadingUsageById = signal<Record<string, boolean>>({});
  readonly subscriptionsById = signal<Record<string, AtlasSubscriptionItem[]>>({});
  readonly loadingSubscriptionsById = signal<Record<string, boolean>>({});
  readonly removingSubscriptionKey = signal<string | null>(null);
  readonly newsletterDraftById = signal<Record<string, NewsletterDraft>>({});
  readonly savingNewsletterById = signal<Record<string, boolean>>({});
  readonly newsletterSavedById = signal<Record<string, string>>({});
  readonly newsletterTestEmailById = signal<Record<string, string>>({});
  readonly sendingNewsletterTestById = signal<Record<string, boolean>>({});
  readonly newsletterTestResultById = signal<Record<string, AtlasNewsletterTestResult>>({});
  readonly textMessagingDraftById = signal<Record<string, TextMessagingDraft>>({});
  readonly loadingTextMessagingById = signal<Record<string, boolean>>({});
  readonly savingTextMessagingById = signal<Record<string, boolean>>({});
  readonly copiedTextMessagingById = signal<Record<string, boolean>>({});
  readonly voiceAgentDraftById = signal<Record<string, VoiceAgentDraft>>({});
  readonly loadingVoiceAgentById = signal<Record<string, boolean>>({});
  readonly savingVoiceAgentById = signal<Record<string, boolean>>({});
  readonly copiedVoiceAgentById = signal<Record<string, boolean>>({});
  readonly renamingId = signal<string | null>(null);
  readonly renameDraft = signal('');
  readonly renaming = signal(false);
  readonly cityEditingId = signal<string | null>(null);
  readonly cityDraft = signal<CityConfigDraft | null>(null);
  readonly savingCityConfig = signal(false);
  readonly chatGuideDraftById = signal<Record<string, ChatGuideDraft>>({});
  readonly savingChatGuideById = signal<Record<string, boolean>>({});
  readonly uploadingChatGuideImageById = signal<Record<string, boolean>>({});
  readonly savingDefaultModeById = signal<Record<string, boolean>>({});
  readonly adminEmailDraftById = signal<Record<string, string>>({});
  readonly sharingAdminById = signal<Record<string, boolean>>({});
  readonly removingAdminKey = signal<string | null>(null);
  readonly openWikis = signal<Record<string, boolean>>({});
  readonly openSections = signal<Record<string, boolean>>({});
  readonly cityLaunchOpen = signal(false);
  readonly wikiListOpen = signal(false);
  readonly deletingId = signal<string | null>(null);
  readonly pageError = signal<string | null>(null);
  readonly cityTemplates = CITY_ATLAS_TEMPLATES;
  readonly creatingCitySlug = signal<string | null>(null);
  readonly creatingCustomCity = signal(false);
  readonly creatingBulkCities = signal(false);
  readonly bulkCityProgress = signal<BulkCityProgress | null>(null);
  readonly bulkCityEtaNowMs = signal(Date.now());
  readonly cityCreationMessage = signal<string | null>(null);
  readonly bulkCityFileName = signal<string | null>(null);
  readonly bulkCityRows = signal<BulkCityDraft[]>([]);
  readonly bulkCityError = signal<string | null>(null);
  readonly populationBackfillRunning = signal(false);
  readonly populationBackfillProgress = signal<PopulationBackfillProgress | null>(null);
  readonly populationBackfillResults = signal<CityPopulationRefreshResult[]>([]);
  readonly populationBackfillMessage = signal<string | null>(null);
  readonly populationBackfillNowMs = signal(Date.now());
  readonly publicCityTemplateKeys = signal<Set<string>>(new Set());
  readonly automatingCoverImages = signal(false);
  readonly automatingCoverImageId = signal<string | null>(null);
  readonly coverImageStatusById = signal<Record<string, { state: 'running' | 'done' | 'failed'; message: string }>>({});
  readonly coverImageAutomationMessage = signal<string | null>(null);
  readonly coverImageProgress = signal<{ total: number; processed: number; created: number; failed: number } | null>(null);
  private bulkCityEtaTimer: number | null = null;
  private populationBackfillEtaTimer: number | null = null;
  readonly customCityDraft = signal<CustomCityDraft>({
    city_name: '',
    region_name: '',
    timezone: 'America/New_York',
    name: '',
    description: '',
    global_region: '',
    population: '',
    population_year: '',
    latitude: '',
    longitude: '',
  });

  readonly hasMultipleAtlases = computed(() => this.atlases().length > 1);
  readonly existingCityTemplateKeys = computed(() =>
    new Set(
      [
        ...this.atlases().flatMap((atlas) => this.cityIdentityKeysForAtlas(atlas)),
        ...this.publicCityTemplateKeys(),
      ],
    ),
  );
  readonly remainingCityTemplates = computed(() =>
    this.cityTemplates.filter((template) => !this.cityTemplateExists(template)),
  );
  readonly customCityNamePreview = computed(() => {
    const draft = this.customCityDraft();
    const explicitName = draft.name.trim();
    if (explicitName) {
      return explicitName;
    }
    const city = draft.city_name.trim();
    return city ? `My living wiki: ${city}` : 'My living wiki: New City';
  });
  readonly customCitySlugPreview = computed(() =>
    this.atlasService.slugify(this.customCityDraft().city_name.trim() || this.customCityNamePreview()),
  );
  readonly canCreateCustomCity = computed(() =>
    !!this.customCityDraft().city_name.trim() && !this.creatingCustomCity() && !this.creatingCitySlug(),
  );
  readonly validBulkCityRows = computed(() =>
    this.bulkCityRows().filter((row) =>
      row.errors.length === 0
	      && !row.duplicate
	      && row.create_status !== 'created'
	      && row.create_status !== 'skipped'
	      && row.create_status !== 'creating',
	    ),
	  );
	  readonly skippedBulkCityRows = computed(() =>
	    this.bulkCityRows().filter((row) =>
	      row.errors.length > 0
	      || row.duplicate
	      || row.create_status === 'created'
	      || row.create_status === 'skipped',
	    ),
	  );
  readonly canCreateBulkCities = computed(() =>
    this.validBulkCityRows().length > 0
    && !this.creatingBulkCities()
    && !this.creatingCustomCity()
    && !this.creatingCitySlug(),
  );
  readonly bulkCityProgressPercent = computed(() => {
    const progress = this.bulkCityProgress();
    if (!progress || progress.total <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((progress.processed / progress.total) * 100));
  });
  readonly bulkCityEtaLabel = computed(() => {
    const progress = this.bulkCityProgress();
    if (!progress || progress.total <= 0) {
      return null;
    }

    const remainingRows = Math.max(0, progress.total - progress.processed);
    if (!this.creatingBulkCities()) {
      return remainingRows > 0 ? 'Retry available' : 'Done';
    }
    if (progress.processed <= 0) {
      return 'Estimating...';
    }

    const elapsedMs = Math.max(1, this.bulkCityEtaNowMs() - progress.started_at_ms);
    const averageMsPerRow = elapsedMs / progress.processed;
    const remainingSeconds = Math.ceil((averageMsPerRow * remainingRows) / 1000);
    return `${this.formatDuration(remainingSeconds)} remaining`;
  });
  readonly coverlessCityAtlases = computed(() =>
    this.atlases()
      .filter((atlas) =>
        atlas.is_public
        && atlas.city_config?.enabled === true
        && !atlas.hero_url?.trim(),
      )
      .sort((a, b) => this.displayName(a).localeCompare(this.displayName(b))),
  );
  readonly cityPopulationAtlases = computed(() =>
    this.atlases()
      .filter((atlas) => atlas.city_config?.enabled === true)
      .sort((a, b) => this.displayName(a).localeCompare(this.displayName(b))),
  );
  readonly missingPopulationAtlases = computed(() =>
    this.cityPopulationAtlases().filter((atlas) => !atlas.city_config?.metadata?.population),
  );
  readonly populationBackfillProgressPercent = computed(() => {
    const progress = this.populationBackfillProgress();
    if (!progress || progress.total <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((progress.processed / progress.total) * 100));
  });
  readonly populationBackfillEtaLabel = computed(() => {
    const progress = this.populationBackfillProgress();
    if (!progress || progress.total <= 0) {
      return null;
    }
    if (!this.populationBackfillRunning()) {
      return progress.processed >= progress.total ? 'Done' : 'Stopped';
    }
    if (progress.processed <= 0) {
      return 'Estimating...';
    }

    const remainingRows = Math.max(0, progress.total - progress.processed);
    const elapsedMs = Math.max(1, this.populationBackfillNowMs() - progress.started_at_ms);
    const averageMsPerRow = elapsedMs / progress.processed;
    const remainingSeconds = Math.ceil((averageMsPerRow * remainingRows) / 1000);
    return `${this.formatDuration(remainingSeconds)} remaining`;
  });
  readonly populationBackfillFailures = computed(() =>
    this.populationBackfillResults().filter((result) => result.status === 'failed'),
  );
  readonly coverImageProgressPercent = computed(() => {
    const progress = this.coverImageProgress();
    if (!progress || progress.total <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((progress.processed / progress.total) * 100));
  });
  readonly weekdays = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
  ];

  constructor() {
    void this.loadPublicCityTemplateSlugs();
    effect(() => {
      const atlases = this.atlases();
      void this.syncUsage(atlases);
    });
  }

  displayName(atlas: AtlasItem | null | undefined): string {
    return this.atlasService.displayName(atlas);
  }

  atlasMeta(atlas: AtlasItem): string {
    return atlas.id.slice(0, 6);
  }

  isOwner(atlas: AtlasItem): boolean {
    return this.atlasService.isAtlasOwner(atlas);
  }

  isAdmin(atlas: AtlasItem): boolean {
    return this.atlasService.isAtlasAdmin(atlas);
  }

  usage(atlasId: string): AtlasUsage | null {
    return this.usageById()[atlasId] ?? null;
  }

  isUsageLoading(atlasId: string): boolean {
    return this.loadingUsageById()[atlasId] ?? false;
  }

  chatCount(usage: AtlasUsage): number {
    return usage.queries + usage.chat_threads;
  }

  usageLabel(usage: AtlasUsage | null): string {
    if (!usage) {
      return 'Checking atlas contents...';
    }

    if (usage.total === 0) {
      return 'Empty atlas';
    }

    const parts = [
      usage.documents ? `${usage.documents} doc${usage.documents === 1 ? '' : 's'}` : null,
      usage.knowledge_entries ? `${usage.knowledge_entries} knowledge entr${usage.knowledge_entries === 1 ? 'y' : 'ies'}` : null,
      usage.wiki_topics ? `${usage.wiki_topics} topic${usage.wiki_topics === 1 ? '' : 's'}` : null,
      this.chatCount(usage) ? `${this.chatCount(usage)} chat${this.chatCount(usage) === 1 ? '' : 's'}` : null,
    ].filter(Boolean);

    return parts.join(' • ');
  }

  personaSummary(atlas: AtlasItem): string {
    const persona = atlas.persona_prompt?.trim();
    if (!persona) {
      return 'Default voice';
    }
    return `Custom voice • ${persona.length} chars`;
  }

  chatGuideSummary(atlas: AtlasItem): string {
    const guide = atlas.chat_guide;
    if (!guide?.name && !guide?.label && !guide?.image_url && !guide?.banner_url) {
      return 'No guide shown';
    }
    return [guide.label?.trim() || null, guide.name?.trim() || null, guide.banner_url ? 'Banner' : null].filter(Boolean).join(' • ') || 'Guide configured';
  }

  defaultAnswerMode(atlas: AtlasItem): 'wiki' | 'internet' {
    return atlas.default_answer_mode === 'internet' ? 'internet' : 'wiki';
  }

  defaultAnswerModeSummary(atlas: AtlasItem): string {
    return this.defaultAnswerMode(atlas) === 'internet' ? 'Internet' : 'My living wiki';
  }

  isSavingDefaultMode(atlasId: string): boolean {
    return this.savingDefaultModeById()[atlasId] ?? false;
  }

  isWikiOpen(atlas: AtlasItem): boolean {
    return this.openWikis()[atlas.id] === true;
  }

  toggleWiki(atlas: AtlasItem): void {
    this.openWikis.update((current) => ({ ...current, [atlas.id]: !current[atlas.id] }));
  }

  openWikiPanel(atlas: AtlasItem): void {
    this.openWikis.update((current) => ({ ...current, [atlas.id]: true }));
  }

  sectionKey(atlas: AtlasItem, section: string): string {
    return `${atlas.id}:${section}`;
  }

  isSectionOpen(atlas: AtlasItem, section: string): boolean {
    return this.openSections()[this.sectionKey(atlas, section)] === true;
  }

  toggleSection(atlas: AtlasItem, section: string): void {
    const key = this.sectionKey(atlas, section);
    this.openSections.update((current) => ({ ...current, [key]: !current[key] }));
  }

  openSection(atlas: AtlasItem, section: string): void {
    const key = this.sectionKey(atlas, section);
    this.openSections.update((current) => ({ ...current, [key]: true }));
  }

  toggleSubscriptionSection(atlas: AtlasItem): void {
    const willOpen = !this.isSectionOpen(atlas, 'subscribers');
    this.toggleSection(atlas, 'subscribers');
    if (willOpen) {
      void this.loadSubscriptions(atlas.id);
    }
  }

  toggleNewsletterSection(atlas: AtlasItem): void {
    const willOpen = !this.isSectionOpen(atlas, 'newsletter');
    this.toggleSection(atlas, 'newsletter');
    if (willOpen) {
      this.ensureNewsletterDraft(atlas);
    }
  }

  toggleChatGuideSection(atlas: AtlasItem): void {
    const willOpen = !this.isSectionOpen(atlas, 'chat-guide');
    this.toggleSection(atlas, 'chat-guide');
    if (willOpen) {
      this.ensureChatGuideDraft(atlas);
    }
  }

  toggleTextMessagingSection(atlas: AtlasItem): void {
    const willOpen = !this.isSectionOpen(atlas, 'text-messaging');
    this.toggleSection(atlas, 'text-messaging');
    if (willOpen) {
      void this.loadTextMessagingConfig(atlas.id);
    }
  }

  toggleVoiceAgentSection(atlas: AtlasItem): void {
    const willOpen = !this.isSectionOpen(atlas, 'voice-agent');
    this.toggleSection(atlas, 'voice-agent');
    if (willOpen) {
      void this.loadVoiceAgentConfig(atlas.id);
    }
  }

  subscriptions(atlasId: string): AtlasSubscriptionItem[] {
    return this.subscriptionsById()[atlasId] ?? [];
  }

  subscriberCountLabel(atlasId: string): string {
    const count = this.subscriptions(atlasId).length;
    if (this.isLoadingSubscriptions(atlasId)) {
      return 'Loading subscribers...';
    }
    if (count === 0) {
      return 'No subscribers yet';
    }
    return `${count} subscriber${count === 1 ? '' : 's'}`;
  }

  isLoadingSubscriptions(atlasId: string): boolean {
    return this.loadingSubscriptionsById()[atlasId] ?? false;
  }

  subscriptionDate(subscription: AtlasSubscriptionItem): string {
    const value = subscription.created_at ?? subscription.updated_at;
    const date = this.asDate(value);
    if (!date) {
      return 'Date unavailable';
    }
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  isRemovingSubscription(atlasId: string, subscriptionId: string): boolean {
    return this.removingSubscriptionKey() === `${atlasId}:${subscriptionId}`;
  }

  newsletterDraft(atlas: AtlasItem): NewsletterDraft {
    const existing = this.newsletterDraftById()[atlas.id];
    if (existing) {
      return existing;
    }
    return this.toNewsletterDraft(atlas);
  }

  newsletterSummary(atlas: AtlasItem): string {
    const config = atlas.newsletter_config;
    if (!config?.enabled) {
      return 'Off';
    }
    return `${this.weekdayLabel(config.day_of_week)} at ${config.send_time} ${config.timezone}`;
  }

  newsletterLastSentLabel(atlas: AtlasItem): string {
    const sentAt = this.asDate(atlas.newsletter_config?.last_sent_at);
    if (!sentAt) {
      return 'Not sent yet';
    }
    const count = atlas.newsletter_config?.last_recipient_count;
    const countLabel = typeof count === 'number' ? ` to ${count} subscriber${count === 1 ? '' : 's'}` : '';
    return `Last sent ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(sentAt)}${countLabel}`;
  }

  updateNewsletterDraft<K extends keyof NewsletterDraft>(atlasId: string, key: K, value: NewsletterDraft[K]): void {
    this.newsletterSavedById.update((current) => {
      if (!current[atlasId]) {
        return current;
      }
      const next = { ...current };
      delete next[atlasId];
      return next;
    });
    this.newsletterDraftById.update((current) => {
      const existing = current[atlasId] ?? this.toNewsletterDraft(this.atlases().find((atlas) => atlas.id === atlasId) ?? null);
      return { ...current, [atlasId]: { ...existing, [key]: value } };
    });
  }

  newsletterTestEmail(atlasId: string): string {
    return this.newsletterTestEmailById()[atlasId] ?? this.authService.email();
  }

  updateNewsletterTestEmail(atlasId: string, value: string): void {
    this.newsletterTestEmailById.update((current) => ({ ...current, [atlasId]: value }));
  }

  weekdayValue(value: unknown): number {
    const day = Number(value);
    return Number.isInteger(day) && day >= 0 && day <= 6 ? day : 1;
  }

  isSavingNewsletter(atlasId: string): boolean {
    return this.savingNewsletterById()[atlasId] ?? false;
  }

  isSendingNewsletterTest(atlasId: string): boolean {
    return this.sendingNewsletterTestById()[atlasId] ?? false;
  }

  newsletterTestResult(atlasId: string): AtlasNewsletterTestResult | null {
    return this.newsletterTestResultById()[atlasId] ?? null;
  }

  chatGuideDraft(atlas: AtlasItem): ChatGuideDraft {
    return this.chatGuideDraftById()[atlas.id] ?? this.toChatGuideDraft(atlas);
  }

  updateChatGuideDraft<K extends keyof ChatGuideDraft>(atlasId: string, key: K, value: ChatGuideDraft[K]): void {
    this.chatGuideDraftById.update((current) => {
      const existing = current[atlasId] ?? this.toChatGuideDraft(this.atlases().find((atlas) => atlas.id === atlasId) ?? null);
      return { ...current, [atlasId]: { ...existing, [key]: value } };
    });
  }

  isSavingChatGuide(atlasId: string): boolean {
    return this.savingChatGuideById()[atlasId] ?? false;
  }

  isUploadingChatGuideImage(atlasId: string): boolean {
    return this.uploadingChatGuideImageById()[atlasId] ?? false;
  }

  textMessagingDraft(atlasId: string): TextMessagingDraft | null {
    return this.textMessagingDraftById()[atlasId] ?? null;
  }

  textMessagingSummary(atlas: AtlasItem): string {
    const draft = this.textMessagingDraft(atlas.id);
    if (!draft) {
      return 'Not loaded';
    }
    if (!draft.enabled) {
      return 'Off';
    }
    return draft.phone_number || (draft.provider === 'vapi' ? 'Vapi number' : 'Twilio webhook');
  }

  isLoadingTextMessaging(atlasId: string): boolean {
    return this.loadingTextMessagingById()[atlasId] ?? false;
  }

  isSavingTextMessaging(atlasId: string): boolean {
    return this.savingTextMessagingById()[atlasId] ?? false;
  }

  copiedTextMessaging(atlasId: string): boolean {
    return this.copiedTextMessagingById()[atlasId] ?? false;
  }

  updateTextMessagingDraft<K extends keyof TextMessagingDraft>(atlasId: string, key: K, value: TextMessagingDraft[K]): void {
    this.textMessagingDraftById.update((current) => {
      const existing = current[atlasId] ?? this.emptyTextMessagingDraft();
      return { ...current, [atlasId]: { ...existing, [key]: value } };
    });
    this.copiedTextMessagingById.update((current) => ({ ...current, [atlasId]: false }));
  }

  async loadTextMessagingConfig(atlasId: string): Promise<void> {
    if (this.textMessagingDraft(atlasId) || this.isLoadingTextMessaging(atlasId)) {
      return;
    }

    this.loadingTextMessagingById.update((current) => ({ ...current, [atlasId]: true }));
    this.pageError.set(null);
    try {
      const config = await this.atlasService.getAtlasTextMessagingConfig(atlasId);
      this.textMessagingDraftById.update((current) => ({ ...current, [atlasId]: this.toTextMessagingDraft(config) }));
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to load text messaging settings.');
    } finally {
      this.loadingTextMessagingById.update((current) => ({ ...current, [atlasId]: false }));
    }
  }

  async saveTextMessagingConfig(atlas: AtlasItem, rotateToken = false): Promise<void> {
    const draft = this.textMessagingDraft(atlas.id);
    if (!draft || this.isSavingTextMessaging(atlas.id)) {
      return;
    }

    this.savingTextMessagingById.update((current) => ({ ...current, [atlas.id]: true }));
    this.pageError.set(null);
    try {
      const saved = await this.atlasService.updateAtlasTextMessagingConfig(
        atlas.id,
        {
          enabled: draft.enabled,
          provider: draft.provider,
          phone_number: draft.phone_number.trim() || null,
          vapi_phone_number_id: draft.vapi_phone_number_id.trim() || null,
        },
        rotateToken,
      );
      this.textMessagingDraftById.update((current) => ({ ...current, [atlas.id]: this.toTextMessagingDraft(saved) }));
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to save text messaging settings.');
    } finally {
      this.savingTextMessagingById.update((current) => ({ ...current, [atlas.id]: false }));
    }
  }

  async copyTextMessagingWebhook(atlasId: string): Promise<void> {
    const url = this.textMessagingDraft(atlasId)?.webhook_url;
    if (!url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.copiedTextMessagingById.update((current) => ({ ...current, [atlasId]: true }));
    } catch {
      this.pageError.set('Could not copy the webhook URL.');
    }
  }

  voiceAgentDraft(atlasId: string): VoiceAgentDraft | null {
    return this.voiceAgentDraftById()[atlasId] ?? null;
  }

  voiceAgentSummary(atlas: AtlasItem): string {
    const draft = this.voiceAgentDraft(atlas.id);
    if (!draft) {
      return 'Not loaded';
    }
    if (!draft.enabled) {
      return 'Off';
    }
    return draft.phone_number || draft.vapi_phone_number_id || draft.vapi_assistant_id || 'Vapi tool enabled';
  }

  isLoadingVoiceAgent(atlasId: string): boolean {
    return this.loadingVoiceAgentById()[atlasId] ?? false;
  }

  isSavingVoiceAgent(atlasId: string): boolean {
    return this.savingVoiceAgentById()[atlasId] ?? false;
  }

  copiedVoiceAgent(atlasId: string): boolean {
    return this.copiedVoiceAgentById()[atlasId] ?? false;
  }

  updateVoiceAgentDraft<K extends keyof VoiceAgentDraft>(atlasId: string, key: K, value: VoiceAgentDraft[K]): void {
    this.voiceAgentDraftById.update((current) => {
      const existing = current[atlasId] ?? this.emptyVoiceAgentDraft();
      return { ...current, [atlasId]: { ...existing, [key]: value } };
    });
    this.copiedVoiceAgentById.update((current) => ({ ...current, [atlasId]: false }));
  }

  async loadVoiceAgentConfig(atlasId: string): Promise<void> {
    if (this.voiceAgentDraft(atlasId) || this.isLoadingVoiceAgent(atlasId)) {
      return;
    }

    this.loadingVoiceAgentById.update((current) => ({ ...current, [atlasId]: true }));
    this.pageError.set(null);
    try {
      const config = await this.atlasService.getAtlasVoiceAgentConfig(atlasId);
      this.voiceAgentDraftById.update((current) => ({ ...current, [atlasId]: this.toVoiceAgentDraft(config) }));
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to load Vapi voice settings.');
    } finally {
      this.loadingVoiceAgentById.update((current) => ({ ...current, [atlasId]: false }));
    }
  }

  async saveVoiceAgentConfig(atlas: AtlasItem, rotateToken = false): Promise<void> {
    const draft = this.voiceAgentDraft(atlas.id);
    if (!draft || this.isSavingVoiceAgent(atlas.id)) {
      return;
    }

    this.savingVoiceAgentById.update((current) => ({ ...current, [atlas.id]: true }));
    this.pageError.set(null);
    try {
      const saved = await this.atlasService.updateAtlasVoiceAgentConfig(
        atlas.id,
        {
          enabled: draft.enabled,
          phone_number: draft.phone_number.trim() || null,
          vapi_phone_number_id: draft.vapi_phone_number_id.trim() || null,
          vapi_assistant_id: draft.vapi_assistant_id.trim() || null,
        },
        rotateToken,
      );
      this.voiceAgentDraftById.update((current) => ({ ...current, [atlas.id]: this.toVoiceAgentDraft(saved) }));
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to save Vapi voice settings.');
    } finally {
      this.savingVoiceAgentById.update((current) => ({ ...current, [atlas.id]: false }));
    }
  }

  async copyVoiceAgentToolUrl(atlasId: string): Promise<void> {
    const url = this.voiceAgentDraft(atlasId)?.tool_url;
    if (!url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.copiedVoiceAgentById.update((current) => ({ ...current, [atlasId]: true }));
    } catch {
      this.pageError.set('Could not copy the Vapi tool URL.');
    }
  }

  async onChatGuideImageSelected(atlas: AtlasItem, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.isUploadingChatGuideImage(atlas.id)) {
      return;
    }

    this.uploadingChatGuideImageById.update((current) => ({ ...current, [atlas.id]: true }));
    this.pageError.set(null);
    try {
      const imageUrl = await this.atlasService.uploadAtlasImage(atlas.id, 'chat-guide', file);
      const nextDraft = { ...this.chatGuideDraft(atlas), image_url: imageUrl };
      const config = this.normalizeChatGuideDraft(nextDraft);

      await this.atlasService.updateChatGuideConfig(atlas.id, config);
      this.chatGuideDraftById.update((current) => ({ ...current, [atlas.id]: nextDraft }));
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to upload guide image.');
    } finally {
      this.uploadingChatGuideImageById.update((current) => ({ ...current, [atlas.id]: false }));
    }
  }

  clearChatGuideImage(atlas: AtlasItem): void {
    this.updateChatGuideDraft(atlas.id, 'image_url', '');
  }

  adminEmailDraft(atlasId: string): string {
    return this.adminEmailDraftById()[atlasId] ?? '';
  }

  isSharingAdmin(atlasId: string): boolean {
    return this.sharingAdminById()[atlasId] ?? false;
  }

  adminProfiles(atlas: AtlasItem): AtlasAdminProfile[] {
    return atlas.admin_profiles ?? [];
  }

  adminLabel(admin: AtlasAdminProfile): string {
    return admin.display_name?.trim() || admin.email?.trim() || admin.user_id.slice(0, 8);
  }

  onAdminEmailInput(atlasId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.adminEmailDraftById.update((current) => ({ ...current, [atlasId]: value }));
  }

  async shareAdmin(event: Event, atlas: AtlasItem): Promise<void> {
    event.preventDefault();
    if (!this.isOwner(atlas) || this.isSharingAdmin(atlas.id)) {
      return;
    }

    const email = this.adminEmailDraft(atlas.id).trim().toLowerCase();
    if (!email) {
      return;
    }

    this.sharingAdminById.update((current) => ({ ...current, [atlas.id]: true }));
    this.pageError.set(null);
    try {
      await this.atlasService.addAtlasAdmin(atlas.id, email);
      this.adminEmailDraftById.update((current) => ({ ...current, [atlas.id]: '' }));
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to add admin.');
    } finally {
      this.sharingAdminById.update((current) => ({ ...current, [atlas.id]: false }));
    }
  }

  async removeAdmin(atlas: AtlasItem, admin: AtlasAdminProfile): Promise<void> {
    if (!this.isOwner(atlas)) {
      return;
    }

    const confirmed = window.confirm(`Remove ${this.adminLabel(admin)} as an admin of "${this.displayName(atlas)}"?`);
    if (!confirmed) {
      return;
    }

    const key = `${atlas.id}:${admin.user_id}`;
    this.removingAdminKey.set(key);
    this.pageError.set(null);
    try {
      await this.atlasService.removeAtlasAdmin(atlas.id, admin.user_id);
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to remove admin.');
    } finally {
      this.removingAdminKey.set(null);
    }
  }

  async removeSubscription(atlas: AtlasItem, subscription: AtlasSubscriptionItem): Promise<void> {
    const confirmed = window.confirm(`Remove ${subscription.email} from weekly updates for "${this.displayName(atlas)}"?`);
    if (!confirmed) {
      return;
    }

    const key = `${atlas.id}:${subscription.id}`;
    this.removingSubscriptionKey.set(key);
    this.pageError.set(null);
    try {
      await this.atlasService.removeAtlasSubscription(atlas.id, subscription.id);
      this.subscriptionsById.update((current) => ({
        ...current,
        [atlas.id]: (current[atlas.id] ?? []).filter((item) => item.id !== subscription.id),
      }));
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to remove subscriber.');
    } finally {
      this.removingSubscriptionKey.set(null);
    }
  }

  async saveNewsletterConfig(atlas: AtlasItem): Promise<void> {
    const draft = this.newsletterDraft(atlas);
    const config = this.normalizeNewsletterDraft(draft);
    this.savingNewsletterById.update((current) => ({ ...current, [atlas.id]: true }));
    this.pageError.set(null);
    this.newsletterSavedById.update((current) => {
      const next = { ...current };
      delete next[atlas.id];
      return next;
    });
    try {
      const saved = await this.atlasService.updateAtlasNewsletterConfig(atlas.id, config);
      let latestAtlas: AtlasItem | null = null;
      try {
        latestAtlas = await this.atlasService.refreshAtlas(atlas.id);
      } catch {
        latestAtlas = null;
      }
      const persistedAtlas = latestAtlas ?? { ...atlas, newsletter_config: saved };
      const persistedDraft = this.toNewsletterDraft(persistedAtlas);
      this.newsletterDraftById.update((current) => ({ ...current, [atlas.id]: persistedDraft }));
      this.newsletterSavedById.update((current) => ({
        ...current,
        [atlas.id]: `Saved: ${this.weekdayLabel(persistedDraft.day_of_week)} at ${persistedDraft.send_time} ${persistedDraft.timezone}.`,
      }));
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to save email settings.');
    } finally {
      this.savingNewsletterById.update((current) => ({ ...current, [atlas.id]: false }));
    }
  }

  async sendNewsletterTest(atlas: AtlasItem): Promise<void> {
    const draft = this.newsletterDraft(atlas);
    const config = this.normalizeNewsletterDraft(draft);
    const recipientEmail = this.newsletterTestEmail(atlas.id).trim();
    if (!recipientEmail) {
      this.pageError.set('Enter a test recipient email address.');
      return;
    }
    this.sendingNewsletterTestById.update((current) => ({ ...current, [atlas.id]: true }));
    this.pageError.set(null);
    this.newsletterTestResultById.update((current) => {
      const next = { ...current };
      delete next[atlas.id];
      return next;
    });
    try {
      const result = await this.atlasService.sendAtlasNewsletterTest(atlas.id, config, recipientEmail);
      this.newsletterTestResultById.update((current) => ({ ...current, [atlas.id]: result }));
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to send test newsletter.');
    } finally {
      this.sendingNewsletterTestById.update((current) => ({ ...current, [atlas.id]: false }));
    }
  }

  async saveChatGuide(atlas: AtlasItem): Promise<void> {
    const draft = this.chatGuideDraft(atlas);
    const config = this.normalizeChatGuideDraft(draft);
    this.savingChatGuideById.update((current) => ({ ...current, [atlas.id]: true }));
    this.pageError.set(null);
    try {
      await this.atlasService.updateChatGuideConfig(atlas.id, config);
      this.chatGuideDraftById.update((current) => ({ ...current, [atlas.id]: this.toChatGuideDraft({ ...atlas, chat_guide: config }) }));
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to save chat guide.');
    } finally {
      this.savingChatGuideById.update((current) => ({ ...current, [atlas.id]: false }));
    }
  }

  cityConfigSummary(atlas: AtlasItem): string {
    const config = atlas.city_config;
    if (!config?.enabled) {
      return 'City pulse disabled';
    }

    const parts = [
      config.city_name?.trim() || this.displayName(atlas),
      config.region_name?.trim() || null,
      config.timezone?.trim() || null,
    ].filter(Boolean);
    return parts.join(' • ');
  }

  toggleCityLaunch(): void {
    this.cityLaunchOpen.update((open) => !open);
  }

  toggleWikiList(): void {
    this.wikiListOpen.update((open) => !open);
  }

  updateCustomCityDraft<K extends keyof CustomCityDraft>(key: K, value: CustomCityDraft[K]): void {
    this.customCityDraft.update((current) => ({ ...current, [key]: value }));
  }

  async createCustomCityAtlas(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canCreateCustomCity()) {
      return;
    }

    const draft = this.customCityDraft();
    const latRaw = draft.latitude.trim();
    const lngRaw = draft.longitude.trim();
    if ((latRaw !== '') !== (lngRaw !== '')) {
      this.pageError.set('Provide both latitude and longitude, or leave both blank.');
      return;
    }
    const latitude = latRaw ? Number(latRaw) : null;
    const longitude = lngRaw ? Number(lngRaw) : null;
    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      this.pageError.set('Latitude must be a number between -90 and 90.');
      return;
    }
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      this.pageError.set('Longitude must be a number between -180 and 180.');
      return;
    }
    const population = parseOptionalPositiveInteger(draft.population);
    const populationYear = parseOptionalPositiveInteger(draft.population_year);
    if (Number.isNaN(population)) {
      this.pageError.set('Population must be a positive number.');
      return;
    }
    if (Number.isNaN(populationYear)) {
      this.pageError.set('Population year must be a positive number.');
      return;
    }
    const input: CustomCityAtlasInput = {
      cityName: draft.city_name,
      regionName: draft.region_name,
      timezone: draft.timezone,
      name: draft.name,
      description: draft.description,
      globalRegion: draft.global_region,
      population,
      populationYear,
      latitude,
      longitude,
    };

    this.creatingCustomCity.set(true);
    this.pageError.set(null);
    this.cityCreationMessage.set(null);
    try {
      const atlasId = await this.atlasService.createCustomCityAtlas(input);
      if (atlasId) {
        this.cityCreationMessage.set(`${this.customCityNamePreview()} is live with internet answers enabled.`);
        this.customCityDraft.set({
          city_name: '',
          region_name: '',
          timezone: 'America/New_York',
          name: '',
          description: '',
          global_region: '',
          population: '',
          population_year: '',
          latitude: '',
          longitude: '',
        });
      }
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to create custom city Wiki.');
    } finally {
      this.creatingCustomCity.set(false);
    }
  }

  async onBulkCityCsvSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.bulkCityError.set(null);
    this.cityCreationMessage.set(null);

    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.bulkCityRows.set([]);
      this.bulkCityFileName.set(null);
      this.bulkCityError.set('Upload a .csv file.');
      return;
    }

    try {
      const text = await file.text();
      this.bulkCityFileName.set(file.name);
      this.bulkCityRows.set(this.parseBulkCityCsv(text));
    } catch (error) {
      this.bulkCityRows.set([]);
      this.bulkCityFileName.set(null);
      this.bulkCityError.set(error instanceof Error ? error.message : 'Failed to read CSV file.');
    }
  }

  downloadBulkCitySampleCsv(): void {
    const csv = [
      'city_name,region_name,global_region,population,population_year,timezone,public_title,description,latitude,longitude',
      '"Seattle","Washington","Americas",755078,2024,"America/Los_Angeles","My living wiki: Seattle","Seattle practical local knowledge - neighborhoods, transit, tech, climate, housing, jobs, food, culture, public services, waterfront life, and civic updates.",47.6062,-122.3321',
      '"Las Vegas","Nevada","Americas",660929,2024,"America/Los_Angeles","My living wiki: Las Vegas","Las Vegas practical local knowledge - tourism, entertainment, hospitality, neighborhoods, transportation, water, climate resilience, jobs, development, public safety, and civic updates.",36.1699,-115.1398',
      '"Nairobi","Kenya","Africa",5545000,2024,"Africa/Nairobi","My living wiki: Nairobi","Nairobi practical local knowledge - neighborhoods, tech, transport, climate, jobs, business, culture, food, public services, startups, and civic updates.",-1.2921,36.8219',
      '"Kinshasa","Democratic Republic of the Congo","Africa",17032000,2024,"Africa/Kinshasa","My living wiki: Kinshasa","Kinshasa practical local knowledge - neighborhoods, transportation, culture, business, public services, infrastructure, climate, jobs, food, music, and civic updates.",-4.4419,15.2663',
      '"Tokyo","Japan","Asia",14180000,2024,"Asia/Tokyo","My living wiki: Tokyo","Tokyo practical local knowledge - neighborhoods, transit, business, technology, culture, food, housing, climate resilience, public services, and civic updates.",35.6762,139.6503',
      '"London","United Kingdom","Europe",8978000,2024,"Europe/London","My living wiki: London","London practical local knowledge - neighborhoods, transport, housing, culture, finance, jobs, climate, food, safety, and civic updates.",51.5074,-0.1278',
      '"Paris","France","Europe",2103000,2024,"Europe/Paris","My living wiki: Paris","Paris practical local knowledge - neighborhoods, transit, culture, tourism, climate, housing, jobs, food, public services, urban planning, and civic updates.",48.8566,2.3522',
      '"Singapore","Singapore","Asia",6040000,2024,"Asia/Singapore","My living wiki: Singapore","Singapore practical local knowledge - housing, transport, business, technology, climate adaptation, food, public services, jobs, neighborhoods, and civic updates.",1.3521,103.8198',
      '"Cape Town","South Africa","Africa",4772000,2024,"Africa/Johannesburg","My living wiki: Cape Town","Cape Town practical local knowledge - neighborhoods, tourism, beaches, food, culture, climate, jobs, safety, water, and civic updates.",-33.9249,18.4241',
      '"Mexico City","Mexico","Americas",9209944,2024,"America/Mexico_City","My living wiki: Mexico City","Mexico City practical local knowledge - neighborhoods, transit, food, culture, business, housing, climate, safety, public services, and civic updates.",19.4326,-99.1332',
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bulk-city-wikis-sample.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  clearBulkCityCsv(): void {
    if (this.creatingBulkCities()) {
      return;
    }
    this.bulkCityFileName.set(null);
    this.bulkCityRows.set([]);
    this.bulkCityError.set(null);
    this.bulkCityProgress.set(null);
    this.stopBulkCityEtaTimer();
  }

  async runPopulationBackfill(force: boolean): Promise<void> {
    if (this.populationBackfillRunning()) {
      return;
    }

    const atlases = force ? this.cityPopulationAtlases() : this.missingPopulationAtlases();
    if (atlases.length === 0) {
      this.populationBackfillMessage.set(
        force
          ? 'No city Wikis are available to refresh.'
          : 'Every city Wiki already has population attached.',
      );
      return;
    }

    const startedAtMs = Date.now();
    this.populationBackfillRunning.set(true);
    this.populationBackfillMessage.set(null);
    this.populationBackfillResults.set([]);
    this.pageError.set(null);
    this.populationBackfillNowMs.set(startedAtMs);
    this.populationBackfillProgress.set({
      total: atlases.length,
      processed: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
      started_at_ms: startedAtMs,
      mode: force ? 'refresh' : 'missing',
    });
    this.startPopulationBackfillEtaTimer();

    try {
      for (const atlas of atlases) {
        const result = await this.refreshCityPopulationWithTimeout(atlas, force);
        this.populationBackfillResults.update((current) => [...current, result]);
        this.incrementPopulationBackfillProgress(result.status);
      }

      const progress = this.populationBackfillProgress();
      if (progress) {
        const noun = progress.total === 1 ? 'city' : 'cities';
        this.populationBackfillMessage.set(
          `${force ? 'Refresh' : 'Backfill'} finished for ${progress.total} ${noun}: ${progress.updated} updated, ${progress.skipped} skipped, ${progress.failed} failed.`,
        );
      }
    } finally {
      this.populationBackfillRunning.set(false);
      this.stopPopulationBackfillEtaTimer();
    }
  }

  coverImageStatus(atlasId: string): { state: 'running' | 'done' | 'failed'; message: string } | null {
    return this.coverImageStatusById()[atlasId] ?? null;
  }

  async automateCoverImage(atlas: AtlasItem): Promise<void> {
    if (this.automatingCoverImages() || this.automatingCoverImageId()) {
      return;
    }

    this.automatingCoverImageId.set(atlas.id);
    this.coverImageAutomationMessage.set(null);
    this.pageError.set(null);
    this.coverImageStatusById.update((current) => ({
      ...current,
      [atlas.id]: { state: 'running', message: 'Finding and validating image...' },
    }));

	    try {
	      const result = await this.autoUploadAtlasCoverImageWithTimeout(atlas.id);
      this.coverImageStatusById.update((current) => ({
        ...current,
        [atlas.id]: { state: 'done', message: `Added cover from ${result.pageTitle}.` },
      }));
      this.coverImageAutomationMessage.set(`Added cover image for ${this.displayName(atlas)}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cover image automation failed.';
      this.coverImageStatusById.update((current) => ({
        ...current,
        [atlas.id]: { state: 'failed', message },
      }));
      this.pageError.set(message);
    } finally {
      this.automatingCoverImageId.set(null);
    }
  }

  async automateMissingCoverImages(): Promise<void> {
    const atlases = this.coverlessCityAtlases();
    if (atlases.length === 0 || this.automatingCoverImages() || this.automatingCoverImageId()) {
      return;
    }

    this.automatingCoverImages.set(true);
    this.coverImageAutomationMessage.set(null);
    this.pageError.set(null);
    this.coverImageProgress.set({
      total: atlases.length,
      processed: 0,
      created: 0,
      failed: 0,
    });

	    let created = 0;
	    let failed = 0;
	    try {
	      let nextIndex = 0;
	      const processAtlas = async (atlas: AtlasItem): Promise<void> => {
	        this.automatingCoverImageId.set(atlas.id);
	        this.coverImageStatusById.update((current) => ({
	          ...current,
	          [atlas.id]: { state: 'running', message: 'Finding and validating image...' },
	        }));
	        try {
	          const result = await this.autoUploadAtlasCoverImageWithTimeout(atlas.id);
	          created += 1;
	          this.coverImageStatusById.update((current) => ({
	            ...current,
	            [atlas.id]: { state: 'done', message: `Added cover from ${result.pageTitle}.` },
          }));
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : 'Cover image automation failed.';
          this.coverImageStatusById.update((current) => ({
            ...current,
            [atlas.id]: { state: 'failed', message },
          }));
        } finally {
          this.coverImageProgress.update((progress) => progress
            ? {
                ...progress,
                processed: Math.min(progress.total, progress.processed + 1),
                created,
                failed,
              }
	            : progress,
	          );
	        }
	      };

	      const workerCount = Math.min(2, atlases.length);
	      await Promise.all(
	        Array.from({ length: workerCount }, async () => {
	          while (nextIndex < atlases.length) {
	            const atlas = atlases[nextIndex];
	            nextIndex += 1;
	            if (atlas) {
	              await processAtlas(atlas);
	            }
	          }
	        }),
	      );

      this.coverImageAutomationMessage.set(
        failed
          ? `Added ${created} cover image${created === 1 ? '' : 's'}. ${failed} failed and can be retried.`
          : `Added ${created} cover image${created === 1 ? '' : 's'}.`,
      );
      this.coverImageProgress.set(null);
    } finally {
      this.automatingCoverImages.set(false);
	      this.automatingCoverImageId.set(null);
	    }
	  }

	  private async autoUploadAtlasCoverImageWithTimeout(atlasId: string) {
	    return await this.withTimeout(
	      this.atlasService.autoUploadAtlasCoverImage(atlasId),
	      60_000,
	      'Cover image lookup took longer than 60 seconds. It was skipped so the rest can continue; retry this city after the batch finishes.',
	    );
	  }

	  async createBulkCityAtlases(): Promise<void> {
    this.refreshBulkCityDuplicateStatus();
    const rows = this.validBulkCityRows();
    if (rows.length === 0 || this.creatingBulkCities()) {
      return;
    }

    this.creatingBulkCities.set(true);
    this.pageError.set(null);
    this.bulkCityError.set(null);
    this.cityCreationMessage.set(null);
    const startedAtMs = Date.now();
    this.bulkCityEtaNowMs.set(startedAtMs);
    this.bulkCityProgress.set({
      total: rows.length,
      processed: 0,
      created: 0,
      failed: 0,
      skipped: 0,
      started_at_ms: startedAtMs,
    });
    this.startBulkCityEtaTimer();

	    const failed: string[] = [];
	    try {
	      let nextIndex = 0;
	      const processRow = async (row: BulkCityDraft): Promise<void> => {
	        this.updateBulkCityRow(row.row_number, {
	          create_status: 'creating',
	          create_error: null,
	        });

        try {
          const atlasId = await this.createCustomCityAtlasWithRetry({
            cityName: row.city_name,
            regionName: row.region_name,
            timezone: row.timezone,
            name: row.name,
            description: row.description,
            globalRegion: row.global_region,
            population: parseOptionalPositiveInteger(row.population),
            populationYear: parseOptionalPositiveInteger(row.population_year),
            latitude: row.latitude ? Number(row.latitude) : null,
            longitude: row.longitude ? Number(row.longitude) : null,
          });
          if (!atlasId) {
            throw new Error('City Wiki was not created. Check that you are signed in and try again.');
          }
	          this.addBulkCityIdentityKeys(row);
	          this.incrementBulkCityProgress('created');
	          this.updateBulkCityRow(row.row_number, {
	            duplicate: false,
	            create_status: 'created',
	            create_error: null,
	          });
	        } catch (error) {
	          const message = error instanceof Error ? error.message : 'failed';
	          if (this.isAlreadyCreatedError(message)) {
	            this.addBulkCityIdentityKeys(row);
	            this.incrementBulkCityProgress('skipped');
	            this.updateBulkCityRow(row.row_number, {
	              duplicate: true,
	              create_status: 'skipped',
	              create_error: null,
	            });
	          } else {
            failed.push(`${row.city_name}: ${message}`);
            this.incrementBulkCityProgress('failed');
            this.updateBulkCityRow(row.row_number, {
              create_status: 'failed',
	              create_error: message,
	            });
	          }
	        }
	      };

	      const workerCount = Math.min(5, rows.length);
	      await Promise.all(
	        Array.from({ length: workerCount }, async () => {
	          while (nextIndex < rows.length) {
	            const row = rows[nextIndex];
	            nextIndex += 1;
	            if (row) {
	              await processRow(row);
	            }
	          }
	        }),
	      );
	      await this.reconcileBulkCityRowsAfterRun(rows);
	      const summary = this.bulkCityRunSummary(rows);

	      this.cityCreationMessage.set(
	        summary.failed
	          ? `Created ${summary.created} city Wikis. ${summary.skipped} already existed. ${summary.failed} row${summary.failed === 1 ? '' : 's'} failed and can be retried.`
	          : `Created ${summary.created} public city Wiki${summary.created === 1 ? '' : 's'}${summary.skipped ? `; ${summary.skipped} already existed` : ''}.`,
	      );
	      if (summary.failed === 0) {
	        this.bulkCityRows.set([]);
	        this.bulkCityFileName.set(null);
	        this.bulkCityProgress.set(null);
	      }
	      if (summary.failed) {
	        this.bulkCityError.set(failed.slice(0, 4).join(' | '));
	      }
    } finally {
      this.creatingBulkCities.set(false);
      this.stopBulkCityEtaTimer();
    }
  }

  private incrementBulkCityProgress(kind: 'created' | 'failed' | 'skipped'): void {
    this.bulkCityProgress.update((progress) => {
      if (!progress) {
        return progress;
      }
      return {
        ...progress,
        processed: Math.min(progress.total, progress.processed + 1),
        [kind]: progress[kind] + 1,
      };
    });
  }

  private incrementPopulationBackfillProgress(status: 'updated' | 'failed' | 'skipped'): void {
    this.populationBackfillProgress.update((progress) => {
      if (!progress) {
        return progress;
      }
      return {
        ...progress,
        processed: Math.min(progress.total, progress.processed + 1),
        [status]: progress[status] + 1,
      };
    });
  }

  private async refreshCityPopulationWithTimeout(
    atlas: AtlasItem,
    force: boolean,
  ): Promise<CityPopulationRefreshResult> {
    try {
      return await this.withTimeout(
        this.atlasService.refreshCityPopulation(atlas.id, force),
        90_000,
        'Population lookup took longer than 90 seconds. It was skipped so the batch can continue.',
      );
    } catch (error) {
      return {
        atlasId: atlas.id,
        status: 'failed',
        cityName: atlas.city_config?.city_name || this.displayName(atlas),
        population: atlas.city_config?.metadata?.population ?? null,
        populationYear: atlas.city_config?.metadata?.population_year ?? null,
        source: atlas.city_config?.metadata?.population_source ?? null,
        sourceLabel: null,
        confidence: atlas.city_config?.metadata?.population_confidence ?? null,
        message: error instanceof Error ? error.message : 'Population lookup failed.',
      };
    }
  }

  private parseBulkCityCsv(csv: string): BulkCityDraft[] {
    const rows = parseCsvRows(csv);
    if (rows.length < 2) {
      throw new Error('CSV needs a header row and at least one city row.');
    }

    const headers = rows[0].map((header) => header.replace(/^\ufeff/, '').trim().toLowerCase());
    const indexFor = (names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
    const cityIndex = indexFor(['city_name', 'city', 'name']);
    const regionIndex = indexFor(['region_name', 'region', 'state', 'region_state']);
    const timezoneIndex = indexFor(['timezone', 'time_zone']);
    const titleIndex = indexFor(['public_title', 'title', 'wiki_title']);
    const descriptionIndex = indexFor(['description', 'desc']);
    const globalRegionIndex = indexFor(['global_region', 'continent', 'world_region', 'directory_region']);
    const populationIndex = indexFor(['population', 'population_estimate', 'latest_population']);
    const populationYearIndex = indexFor(['population_year', 'population_as_of', 'population_estimate_year']);
    const latitudeIndex = indexFor(['latitude', 'lat']);
    const longitudeIndex = indexFor(['longitude', 'lng', 'lon', 'long']);

    if (cityIndex < 0) {
      throw new Error('CSV is missing the city_name column.');
    }

    const seen = new Set<string>();
    const existingKeys = this.existingCityTemplateKeys();
    return rows.slice(1).map((row, index): BulkCityDraft => {
      const cell = (cellIndex: number): string => (cellIndex >= 0 ? row[cellIndex]?.trim() ?? '' : '');
      const cityName = cell(cityIndex);
      const regionName = cell(regionIndex);
      const timezone = cell(timezoneIndex) || 'America/New_York';
      const name = cell(titleIndex);
      const description = cell(descriptionIndex);
      const globalRegion = cell(globalRegionIndex);
      const population = cell(populationIndex);
      const populationYear = cell(populationYearIndex);
      const latitude = cell(latitudeIndex);
      const longitude = cell(longitudeIndex);
      const key = normalizeAdminCityIdentity(cityName || name);
      const slug = this.atlasService.slugify(cityName || name || `row-${index + 2}`);
      const errors: string[] = [];
      if (!cityName) {
        errors.push('Missing city name');
      }
      if (titleIndex >= 0 && !name) {
        errors.push('Missing public title');
      }
      if (descriptionIndex >= 0 && !description) {
        errors.push('Missing description');
      }
      const parsedPopulation = parseOptionalPositiveInteger(population);
      if (Number.isNaN(parsedPopulation)) {
        errors.push('Invalid population');
      }
      const parsedPopulationYear = parseOptionalPositiveInteger(populationYear);
      if (Number.isNaN(parsedPopulationYear)) {
        errors.push('Invalid population year');
      }
      // Coordinates are optional, but if one is given both must be valid so the
      // city lands in the right place on the Dymaxion map.
      const hasAnyCoord = latitude !== '' || longitude !== '';
      if (hasAnyCoord) {
        const lat = Number(latitude);
        const lng = Number(longitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
          errors.push('Invalid latitude (-90 to 90)');
        }
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
          errors.push('Invalid longitude (-180 to 180)');
        }
      }
      if (!key) {
        errors.push('Missing city identity');
      }
      const duplicate = !!key && (seen.has(key) || existingKeys.has(key) || existingKeys.has(slug));
      seen.add(key);

      return {
        row_number: index + 2,
        city_name: cityName,
        region_name: regionName,
        timezone,
        name: name || (cityName ? `My living wiki: ${cityName}` : ''),
        description,
        global_region: globalRegion,
        population,
        population_year: populationYear,
        latitude,
        longitude,
        slug,
        errors,
        duplicate,
        create_status: 'pending',
        create_error: null,
      };
    });
  }

	  private async createCustomCityAtlasWithRetry(input: CustomCityAtlasInput): Promise<string | null> {
	    const maxAttempts = 2;
	    let lastError: unknown = null;
	    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
	      try {
	        return await this.withTimeout(
	          this.atlasService.createCustomCityAtlas(input),
	          20_000,
	          `${input.cityName} took longer than 20 seconds. It was skipped so the rest can continue; retry this row after the batch finishes.`,
	        );
	      } catch (error) {
	        lastError = error;
	        const message = error instanceof Error ? error.message : '';
	        if (
	          this.isAlreadyCreatedError(message)
	          || message.toLowerCase().includes('required')
	          || message.toLowerCase().includes('took longer than')
	          || attempt === maxAttempts
	        ) {
	          throw error;
	        }
	        await this.wait(600 * attempt);
	      }
	    }
	    throw lastError;
	  }

	  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	    let timer: number | null = null;
	    const timeout = new Promise<never>((_, reject) => {
	      timer = window.setTimeout(() => reject(new Error(message)), ms);
	    });
	    return Promise.race([promise, timeout]).finally(() => {
	      if (timer !== null) {
	        window.clearTimeout(timer);
	      }
	    });
	  }

  private updateBulkCityRow(rowNumber: number, patch: Partial<BulkCityDraft>): void {
    this.bulkCityRows.update((rows) =>
      rows.map((row) => (row.row_number === rowNumber ? { ...row, ...patch } : row)),
    );
  }

	  private addBulkCityIdentityKeys(row: BulkCityDraft): void {
	    const keys = this.cityIdentityKeysForBulkRow(row);
	    this.publicCityTemplateKeys.update((current) => new Set([...current, ...keys]));
	  }

	  private cityIdentityKeysForBulkRow(row: BulkCityDraft): string[] {
	    return [
	      row.slug,
	      normalizeAdminCityIdentity(row.city_name),
	      normalizeAdminCityIdentity(row.name),
	    ].filter(Boolean);
	  }

	  private async reconcileBulkCityRowsAfterRun(processedRows: BulkCityDraft[]): Promise<void> {
	    const rowNumbers = new Set(processedRows.map((row) => row.row_number));
	    try {
	      await this.wait(900);
	      const publicKeys = new Set(
	        (await this.atlasService.listPublicAtlases()).flatMap((atlas) => this.cityIdentityKeysForAtlas(atlas)),
	      );
	      this.publicCityTemplateKeys.update((current) => new Set([...current, ...publicKeys]));
	      this.bulkCityRows.update((rows) =>
	        rows.map((row) => {
	          if (!rowNumbers.has(row.row_number) || !['failed', 'creating'].includes(row.create_status)) {
	            return row;
	          }
	          const exists = this.cityIdentityKeysForBulkRow(row).some((key) => publicKeys.has(key));
	          return exists
	            ? {
	                ...row,
	                duplicate: true,
	                create_status: 'skipped',
	                create_error: null,
	              }
	            : {
	                ...row,
	                create_status: 'failed',
	                create_error: row.create_error || 'This row did not finish. Retry available.',
	              };
	        }),
	      );
	    } catch {
	      this.bulkCityRows.update((rows) =>
	        rows.map((row) =>
	          rowNumbers.has(row.row_number) && row.create_status === 'creating'
	            ? {
	                ...row,
	                create_status: 'failed',
	                create_error: 'This row did not finish. Retry available.',
	              }
	            : row,
	        ),
	      );
	    } finally {
	      this.syncBulkCityProgressFromRows(processedRows);
	    }
	  }

	  private bulkCityRunSummary(processedRows: BulkCityDraft[]): { created: number; skipped: number; failed: number } {
	    const rowNumbers = new Set(processedRows.map((row) => row.row_number));
	    return this.bulkCityRows().reduce(
	      (summary, row) => {
	        if (!rowNumbers.has(row.row_number)) {
	          return summary;
	        }
	        if (row.create_status === 'created') {
	          summary.created += 1;
	        } else if (row.create_status === 'skipped') {
	          summary.skipped += 1;
	        } else if (row.create_status === 'failed') {
	          summary.failed += 1;
	        }
	        return summary;
	      },
	      { created: 0, skipped: 0, failed: 0 },
	    );
	  }

	  private syncBulkCityProgressFromRows(processedRows: BulkCityDraft[]): void {
	    const summary = this.bulkCityRunSummary(processedRows);
	    this.bulkCityProgress.update((progress) => progress
	      ? {
	          ...progress,
	          processed: Math.min(progress.total, summary.created + summary.skipped + summary.failed),
	          created: summary.created,
	          skipped: summary.skipped,
	          failed: summary.failed,
	        }
	      : progress,
	    );
	  }

	  private refreshBulkCityDuplicateStatus(): void {
    const existingKeys = this.existingCityTemplateKeys();
    this.bulkCityRows.update((rows) =>
      rows.map((row) => {
        if (row.errors.length > 0 || row.create_status === 'created') {
          return row;
        }
        const keys = [
          row.slug,
          normalizeAdminCityIdentity(row.city_name),
          normalizeAdminCityIdentity(row.name),
        ].filter(Boolean);
        return {
          ...row,
          duplicate: keys.some((key) => existingKeys.has(key)),
        };
      }),
    );
  }

  private isAlreadyCreatedError(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes('already exists') || normalized.includes('already live');
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private startBulkCityEtaTimer(): void {
    this.stopBulkCityEtaTimer();
    this.bulkCityEtaTimer = window.setInterval(() => {
      this.bulkCityEtaNowMs.set(Date.now());
    }, 1000);
  }

  private stopBulkCityEtaTimer(): void {
    if (this.bulkCityEtaTimer === null) {
      return;
    }
    window.clearInterval(this.bulkCityEtaTimer);
    this.bulkCityEtaTimer = null;
    this.bulkCityEtaNowMs.set(Date.now());
  }

  private startPopulationBackfillEtaTimer(): void {
    this.stopPopulationBackfillEtaTimer();
    this.populationBackfillEtaTimer = window.setInterval(() => {
      this.populationBackfillNowMs.set(Date.now());
    }, 1000);
  }

  private stopPopulationBackfillEtaTimer(): void {
    if (this.populationBackfillEtaTimer === null) {
      return;
    }
    window.clearInterval(this.populationBackfillEtaTimer);
    this.populationBackfillEtaTimer = null;
    this.populationBackfillNowMs.set(Date.now());
  }

  private formatDuration(totalSeconds: number): string {
    if (totalSeconds <= 0) {
      return '0 sec';
    }
    if (totalSeconds < 60) {
      return `${totalSeconds} sec`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds ? `${minutes} min ${seconds} sec` : `${minutes} min`;
  }

  cityTemplateExists(template: CityAtlasTemplate): boolean {
    const existingKeys = this.existingCityTemplateKeys();
    return this.cityIdentityKeysForTemplate(template).some((key) => existingKeys.has(key));
  }

  cityTemplateActionLabel(template: CityAtlasTemplate): string {
    if (this.creatingCitySlug() === template.slug) {
      return 'Creating...';
    }
    return this.cityTemplateExists(template) ? 'Created' : 'Create live city';
  }

  async createCityAtlas(template: CityAtlasTemplate): Promise<void> {
    if (this.cityTemplateExists(template) || this.creatingCitySlug()) {
      return;
    }

    this.creatingCitySlug.set(template.slug);
    this.pageError.set(null);
    this.cityCreationMessage.set(null);
    try {
      const atlasId = await this.atlasService.createCityAtlasFromTemplate(template);
      if (atlasId) {
        this.publicCityTemplateKeys.update((current) => new Set([...current, ...this.cityIdentityKeysForTemplate(template)]));
        this.cityCreationMessage.set(`${template.name} is live with internet answers enabled.`);
      }
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to create city Wiki.');
    } finally {
      this.creatingCitySlug.set(null);
    }
  }

  private async loadPublicCityTemplateSlugs(): Promise<void> {
    try {
      const publicKeys = (await this.atlasService.listPublicAtlases())
        .flatMap((atlas) => this.cityIdentityKeysForAtlas(atlas))
        .filter(Boolean);
      this.publicCityTemplateKeys.set(new Set(publicKeys));
    } catch {
      this.publicCityTemplateKeys.set(new Set());
    }
  }

  private cityIdentityKeysForTemplate(template: CityAtlasTemplate): string[] {
    return [
      template.slug,
      template.cityConfig.city_name,
      template.name,
    ]
      .map((value) => normalizeAdminCityIdentity(value))
      .filter(Boolean);
  }

  private cityIdentityKeysForAtlas(atlas: AtlasItem): string[] {
    return [
      atlas.slug,
      atlas.city_config?.city_name,
      atlas.name,
    ]
      .map((value) => normalizeAdminCityIdentity(value))
      .filter(Boolean);
  }

  selectAtlas(atlasId: string): void {
    this.atlasService.setActive(atlasId);
  }

  openAtlasSection(atlas: AtlasItem, section: string): void {
    this.openWikiPanel(atlas);
    this.openSection(atlas, section);
    if (section === 'voice-agent') {
      void this.loadVoiceAgentConfig(atlas.id);
    }
    if (section === 'text-messaging') {
      void this.loadTextMessagingConfig(atlas.id);
    }
    if (section === 'newsletter') {
      this.ensureNewsletterDraft(atlas);
    }
    if (section === 'chat-guide') {
      this.ensureChatGuideDraft(atlas);
    }
  }

  async openAtlasChat(atlas: AtlasItem): Promise<void> {
    this.selectAtlas(atlas.id);
    await this.router.navigate(['/chat']);
  }

  async openAtlasUpload(atlas: AtlasItem): Promise<void> {
    this.selectAtlas(atlas.id);
    await this.router.navigate(['/upload']);
  }

  async openAtlasSources(atlas: AtlasItem): Promise<void> {
    this.selectAtlas(atlas.id);
    await this.router.navigate(['/library']);
  }

  async openAtlasWiki(atlas: AtlasItem): Promise<void> {
    this.selectAtlas(atlas.id);
    await this.router.navigate(['/wiki']);
  }

  startRename(atlas: AtlasItem): void {
    this.pageError.set(null);
    this.openWikiPanel(atlas);
    this.renamingId.set(atlas.id);
    this.renameDraft.set(this.displayName(atlas));
  }

  cancelRename(): void {
    this.renamingId.set(null);
    this.renameDraft.set('');
  }

  startCityEdit(atlas: AtlasItem): void {
    const config = atlas.city_config;
    this.pageError.set(null);
    this.openWikiPanel(atlas);
    this.openSection(atlas, 'city');
    this.cityEditingId.set(atlas.id);
    this.cityDraft.set({
      enabled: config?.enabled === true,
      city_name: config?.city_name ?? '',
      region_name: config?.region_name ?? '',
      country_code: config?.country_code ?? 'US',
      timezone: config?.timezone ?? 'America/New_York',
      census_state_code: config?.census_state_code ?? '',
      census_place_code: config?.census_place_code ?? '',
      airnow_zip_code: config?.airnow_zip_code ?? '',
      global_region: config?.metadata?.global_region ?? '',
      population: config?.metadata?.population ? String(config.metadata.population) : '',
      population_year: config?.metadata?.population_year ? String(config.metadata.population_year) : '',
      manual_metrics_json: this.stringifyManualMetrics(config?.manual_metrics ?? null),
    });
  }

  cancelCityEdit(): void {
    if (this.savingCityConfig()) {
      return;
    }
    this.cityEditingId.set(null);
    this.cityDraft.set(null);
  }

  updateCityDraft<K extends keyof CityConfigDraft>(key: K, value: CityConfigDraft[K]): void {
    this.cityDraft.update((current) => (current ? { ...current, [key]: value } : current));
  }

  onRenameInput(event: Event): void {
    this.renameDraft.set((event.target as HTMLInputElement).value);
  }

  async saveRename(event: Event): Promise<void> {
    event.preventDefault();
    const atlasId = this.renamingId();
    const name = this.renameDraft().trim();
    if (!atlasId || !name) {
      this.cancelRename();
      return;
    }

    this.renaming.set(true);
    this.pageError.set(null);
    try {
      await this.atlasService.renameAtlas(atlasId, name);
      this.cancelRename();
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to rename atlas.');
    } finally {
      this.renaming.set(false);
    }
  }

  async saveCityConfig(atlas: AtlasItem): Promise<void> {
    const draft = this.cityDraft();
    if (!draft) {
      return;
    }

    this.savingCityConfig.set(true);
    this.pageError.set(null);
    try {
      const censusStateCode = draft.census_state_code.trim();
      const censusPlaceCode = draft.census_place_code.trim();
      if (draft.enabled && (!censusStateCode || !censusPlaceCode)) {
        throw new Error('Census state code and Census place code are required for city pulse demographics.');
      }

      const manualMetrics = this.parseManualMetricsJson(draft.manual_metrics_json);
      const population = parseOptionalPositiveInteger(draft.population);
      const populationYear = parseOptionalPositiveInteger(draft.population_year);
      if (Number.isNaN(population)) {
        throw new Error('Population must be a positive number.');
      }
      if (Number.isNaN(populationYear)) {
        throw new Error('Population year must be a positive number.');
      }
      const existingMetadata = atlas.city_config?.metadata ?? null;
      const populationChanged =
        population !== (existingMetadata?.population ?? null)
        || populationYear !== (existingMetadata?.population_year ?? null);
      const nextConfig: CityAtlasConfig = {
        enabled: draft.enabled,
        city_name: draft.city_name.trim() || null,
        region_name: draft.region_name.trim() || null,
        country_code: draft.country_code.trim() || null,
        timezone: draft.timezone.trim() || null,
        census_state_code: censusStateCode || null,
        census_place_code: censusPlaceCode || null,
        airnow_zip_code: draft.airnow_zip_code.trim() || null,
        latitude: atlas.city_config?.latitude ?? null,
        longitude: atlas.city_config?.longitude ?? null,
        metadata: {
          ...(existingMetadata ?? {}),
          global_region: draft.global_region.trim() || null,
          population,
          population_year: populationYear,
          population_scope: population
            ? (populationChanged ? 'unknown' : existingMetadata?.population_scope ?? 'unknown')
            : null,
          population_source: population
            ? (populationChanged ? 'manual' : existingMetadata?.population_source ?? 'manual')
            : null,
          population_source_url: populationChanged ? null : existingMetadata?.population_source_url ?? null,
          population_source_record_id: populationChanged ? null : existingMetadata?.population_source_record_id ?? null,
          population_fetched_at: population
            ? (populationChanged ? new Date().toISOString() : existingMetadata?.population_fetched_at ?? null)
            : null,
          population_confidence: population
            ? (populationChanged ? 'medium' : existingMetadata?.population_confidence ?? 'medium')
            : null,
          population_match_method: population
            ? (populationChanged ? 'manual' : existingMetadata?.population_match_method ?? 'manual')
            : null,
        },
        manual_metrics: manualMetrics,
      };
      await this.atlasService.updateCityConfig(atlas.id, nextConfig);
      this.cancelCityEdit();
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to save city pulse settings.');
    } finally {
      this.savingCityConfig.set(false);
    }
  }

  async updateDefaultAnswerMode(atlas: AtlasItem, mode: 'wiki' | 'internet'): Promise<void> {
    if (this.defaultAnswerMode(atlas) === mode || this.isSavingDefaultMode(atlas.id)) {
      return;
    }

    this.savingDefaultModeById.update((current) => ({ ...current, [atlas.id]: true }));
    this.pageError.set(null);
    try {
      await this.atlasService.updateDefaultAnswerMode(atlas.id, mode);
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to save default search mode.');
    } finally {
      this.savingDefaultModeById.update((current) => ({ ...current, [atlas.id]: false }));
    }
  }

  canDelete(atlas: AtlasItem): boolean {
    if (!this.isOwner(atlas) || !this.hasMultipleAtlases()) {
      return false;
    }

    const usage = this.usage(atlas.id);
    return !!usage && usage.total === 0;
  }

  async deleteAtlas(atlas: AtlasItem): Promise<void> {
    const usage = this.usage(atlas.id);
    if (!usage || usage.total > 0 || !this.hasMultipleAtlases()) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${this.displayName(atlas)}"?\n\nThis atlas is empty and will be removed permanently.`,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId.set(atlas.id);
    this.pageError.set(null);
    try {
	      await this.atlasService.deleteAtlas(atlas.id);
	      const removedKeys = new Set(this.cityIdentityKeysForAtlas(atlas));
	      this.publicCityTemplateKeys.update((current) => new Set([...current].filter((key) => !removedKeys.has(key))));
	      this.renamingId.update((current) => (current === atlas.id ? null : current));
	      this.renameDraft.set('');

      this.usageById.update((current) => {
        const next = { ...current };
        delete next[atlas.id];
        return next;
      });
      this.loadingUsageById.update((current) => {
        const next = { ...current };
        delete next[atlas.id];
        return next;
      });
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to delete atlas.');
    } finally {
      this.deletingId.set(null);
    }
  }

  private async syncUsage(atlases: AtlasItem[]): Promise<void> {
    const atlasIds = new Set(atlases.map((atlas) => atlas.id));

    this.usageById.update((current) => {
      const next: Record<string, AtlasUsage> = {};
      for (const [atlasId, usage] of Object.entries(current)) {
        if (atlasIds.has(atlasId)) {
          next[atlasId] = usage;
        }
      }
      return next;
    });

    this.loadingUsageById.update((current) => {
      const next: Record<string, boolean> = {};
      for (const [atlasId, loading] of Object.entries(current)) {
        if (atlasIds.has(atlasId)) {
          next[atlasId] = loading;
        }
      }
      return next;
    });

    this.subscriptionsById.update((current) => {
      const next: Record<string, AtlasSubscriptionItem[]> = {};
      for (const [atlasId, subscriptions] of Object.entries(current)) {
        if (atlasIds.has(atlasId)) {
          next[atlasId] = subscriptions;
        }
      }
      return next;
    });

    this.loadingSubscriptionsById.update((current) => {
      const next: Record<string, boolean> = {};
      for (const [atlasId, loading] of Object.entries(current)) {
        if (atlasIds.has(atlasId)) {
          next[atlasId] = loading;
        }
      }
      return next;
    });

    this.textMessagingDraftById.update((current) => {
      const next: Record<string, TextMessagingDraft> = {};
      for (const [atlasId, draft] of Object.entries(current)) {
        if (atlasIds.has(atlasId)) {
          next[atlasId] = draft;
        }
      }
      return next;
    });

    this.voiceAgentDraftById.update((current) => {
      const next: Record<string, VoiceAgentDraft> = {};
      for (const [atlasId, draft] of Object.entries(current)) {
        if (atlasIds.has(atlasId)) {
          next[atlasId] = draft;
        }
      }
      return next;
    });

    await Promise.all(
      atlases.map(async (atlas) => {
        if (this.usage(atlas.id) || this.isUsageLoading(atlas.id)) {
          return;
        }

        this.loadingUsageById.update((current) => ({ ...current, [atlas.id]: true }));
        try {
          const usage = await this.atlasService.getAtlasUsage(atlas.id);
          this.usageById.update((current) => ({ ...current, [atlas.id]: usage }));
        } catch {
          // Collaborator admins may not have direct read access to every owner-only usage collection.
        } finally {
          this.loadingUsageById.update((current) => ({ ...current, [atlas.id]: false }));
        }
      }),
    );
  }

  private async loadSubscriptions(atlasId: string): Promise<void> {
    if (this.subscriptionsById()[atlasId] || this.isLoadingSubscriptions(atlasId)) {
      return;
    }

    this.loadingSubscriptionsById.update((current) => ({ ...current, [atlasId]: true }));
    this.pageError.set(null);
    try {
      const subscriptions = await this.atlasService.listAtlasSubscriptions(atlasId);
      this.subscriptionsById.update((current) => ({ ...current, [atlasId]: subscriptions }));
    } catch (error) {
      this.pageError.set(error instanceof Error ? error.message : 'Failed to load subscribers.');
    } finally {
      this.loadingSubscriptionsById.update((current) => ({ ...current, [atlasId]: false }));
    }
  }

  private ensureNewsletterDraft(atlas: AtlasItem): void {
    if (this.newsletterDraftById()[atlas.id]) {
      return;
    }
    this.newsletterDraftById.update((current) => ({ ...current, [atlas.id]: this.toNewsletterDraft(atlas) }));
  }

  private ensureChatGuideDraft(atlas: AtlasItem): void {
    if (this.chatGuideDraftById()[atlas.id]) {
      return;
    }
    this.chatGuideDraftById.update((current) => ({ ...current, [atlas.id]: this.toChatGuideDraft(atlas) }));
  }

  private toNewsletterDraft(atlas: AtlasItem | null): NewsletterDraft {
    const config = atlas?.newsletter_config;
    return {
      enabled: config?.enabled === true,
      day_of_week: Number.isInteger(config?.day_of_week) ? Number(config?.day_of_week) : 1,
      send_time: config?.send_time && /^([01]\d|2[0-3]):[0-5]\d$/.test(config.send_time) ? config.send_time : '09:00',
      timezone: config?.timezone?.trim() || atlas?.city_config?.timezone?.trim() || 'America/New_York',
      prompt: config?.prompt?.trim() || this.atlasService.defaultNewsletterPrompt(),
    };
  }

  private normalizeNewsletterDraft(draft: NewsletterDraft): AtlasNewsletterConfig {
    const day = Number(draft.day_of_week);
    return {
      enabled: draft.enabled === true,
      day_of_week: Number.isInteger(day) && day >= 0 && day <= 6 ? day : 1,
      send_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.send_time) ? draft.send_time : '09:00',
      timezone: draft.timezone.trim() || 'America/New_York',
      prompt: draft.prompt.trim() || this.atlasService.defaultNewsletterPrompt(),
    };
  }

  private toChatGuideDraft(atlas: AtlasItem | null): ChatGuideDraft {
    const guide = atlas?.chat_guide;
    return {
      label: guide?.label?.trim() ?? '',
      name: guide?.name?.trim() ?? '',
      image_url: guide?.image_url?.trim() ?? '',
      banner_url: guide?.banner_url?.trim() ?? '',
    };
  }

  private emptyTextMessagingDraft(): TextMessagingDraft {
    return {
      enabled: false,
      provider: 'twilio',
      phone_number: '',
      vapi_phone_number_id: '',
      webhook_token: '',
      webhook_url: '',
    };
  }

  private toTextMessagingDraft(config: AtlasTextMessagingConfig): TextMessagingDraft {
    return {
      enabled: config.enabled,
      provider: config.provider,
      phone_number: config.phone_number ?? '',
      vapi_phone_number_id: config.vapi_phone_number_id ?? '',
      webhook_token: config.webhook_token ?? '',
      webhook_url: config.webhook_url ?? '',
    };
  }

  private emptyVoiceAgentDraft(): VoiceAgentDraft {
    return {
      enabled: false,
      phone_number: '',
      vapi_phone_number_id: '',
      vapi_assistant_id: '',
      webhook_token: '',
      tool_url: '',
    };
  }

  private toVoiceAgentDraft(config: AtlasVoiceAgentConfig): VoiceAgentDraft {
    return {
      enabled: config.enabled,
      phone_number: config.phone_number ?? '',
      vapi_phone_number_id: config.vapi_phone_number_id ?? '',
      vapi_assistant_id: config.vapi_assistant_id ?? '',
      webhook_token: config.webhook_token ?? '',
      tool_url: config.tool_url ?? '',
    };
  }

  private normalizeChatGuideDraft(draft: ChatGuideDraft): AtlasChatGuideConfig | null {
    const label = draft.label.trim().slice(0, 120);
    const name = draft.name.trim().slice(0, 80);
    const imageUrl = draft.image_url.trim().slice(0, 1000);
    const bannerUrl = draft.banner_url.trim().slice(0, 1000);
    if (!label && !name && !imageUrl && !bannerUrl) {
      return null;
    }

    return {
      label: label || null,
      name: name || null,
      image_url: imageUrl || null,
      banner_url: bannerUrl || null,
    };
  }

  private weekdayLabel(day: number | null | undefined): string {
    return this.weekdays.find((weekday) => weekday.value === day)?.label ?? 'Monday';
  }

  private asDate(value: { toDate(): Date } | Date | string | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value.toDate === 'function') {
      return value.toDate();
    }
    return null;
  }

  private stringifyManualMetrics(metrics: CityPulseMetric[] | null): string {
    if (!metrics || metrics.length === 0) {
      return '';
    }

    return JSON.stringify(metrics, null, 2);
  }

  private parseManualMetricsJson(raw: string): CityPulseMetric[] | null {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Manual metrics JSON is not valid JSON.');
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Manual metrics JSON must be an array of metric objects.');
    }

    return parsed.map((metric) => this.parseManualMetric(metric)).filter((metric): metric is CityPulseMetric => !!metric);
  }

  private parseManualMetric(value: unknown): CityPulseMetric | null {
    if (!value || typeof value !== 'object') {
      throw new Error('Each manual metric must be an object.');
    }

    const data = value as Record<string, unknown>;
    const id = String(data['id'] ?? '').trim();
    const label = String(data['label'] ?? '').trim();
    const numericValue = Number(data['value']);
    if (!id || !label || !Number.isFinite(numericValue)) {
      throw new Error('Each manual metric needs string `id`, string `label`, and numeric `value`.');
    }

    return {
      id,
      label,
      short_label: String(data['short_label'] ?? label).trim() || label,
      description: String(data['description'] ?? '').trim(),
      format: data['format'] === 'currency' || data['format'] === 'percent' ? data['format'] : 'number',
      value: numericValue,
      decimals: typeof data['decimals'] === 'number' ? data['decimals'] : undefined,
      unit_prefix: typeof data['unit_prefix'] === 'string' ? data['unit_prefix'] : null,
      unit_suffix: typeof data['unit_suffix'] === 'string' ? data['unit_suffix'] : null,
      source_label: String(data['source_label'] ?? 'Manual').trim() || 'Manual',
      source_detail: typeof data['source_detail'] === 'string' ? data['source_detail'] : null,
      source_url: typeof data['source_url'] === 'string' ? data['source_url'] : null,
      methodology: typeof data['methodology'] === 'string' ? data['methodology'] : null,
      cadence:
        data['cadence'] === 'realtime' ||
        data['cadence'] === 'daily' ||
        data['cadence'] === 'weekly' ||
        data['cadence'] === 'monthly' ||
        data['cadence'] === 'yearly'
          ? data['cadence']
          : 'manual',
      as_of: typeof data['as_of'] === 'string' ? data['as_of'] : null,
      realtime:
        data['realtime'] && typeof data['realtime'] === 'object'
          ? {
              anchor_iso: String((data['realtime'] as Record<string, unknown>)['anchor_iso'] ?? ''),
              baseline_value: Number((data['realtime'] as Record<string, unknown>)['baseline_value'] ?? numericValue),
              rate_per_second: Number((data['realtime'] as Record<string, unknown>)['rate_per_second'] ?? 0),
              min_value:
                typeof (data['realtime'] as Record<string, unknown>)['min_value'] === 'number'
                  ? ((data['realtime'] as Record<string, unknown>)['min_value'] as number)
                  : null,
            }
          : null,
    };
  }
}
