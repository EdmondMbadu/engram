import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AtlasAdminProfile, AtlasChatGuideConfig, AtlasItem, AtlasNewsletterConfig, AtlasNewsletterTestResult, AtlasSubscriptionItem, AtlasTextMessagingConfig, AtlasTextMessagingProvider, AtlasUsage, CityAtlasConfig, CityPulseMetric } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { AuthService } from '../auth.service';
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

@Component({
  selector: 'app-atlas-manage',
  imports: [FormsModule, RouterLink, ThemeToggleComponent],
  templateUrl: './atlas-manage.html',
})
export class AtlasManageComponent {
  private readonly atlasService = inject(AtlasService);
  private readonly authService = inject(AuthService);

  readonly atlases = this.atlasService.atlases;
  readonly activeAtlasId = this.atlasService.activeAtlasId;

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
  readonly deletingId = signal<string | null>(null);
  readonly pageError = signal<string | null>(null);

  readonly hasMultipleAtlases = computed(() => this.atlases().length > 1);
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
    return this.defaultAnswerMode(atlas) === 'internet' ? 'Internet' : 'Living Wiki';
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

  selectAtlas(atlasId: string): void {
    this.atlasService.setActive(atlasId);
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
      const nextConfig: CityAtlasConfig = {
        enabled: draft.enabled,
        city_name: draft.city_name.trim() || null,
        region_name: draft.region_name.trim() || null,
        country_code: draft.country_code.trim() || null,
        timezone: draft.timezone.trim() || null,
        census_state_code: censusStateCode || null,
        census_place_code: censusPlaceCode || null,
        airnow_zip_code: draft.airnow_zip_code.trim() || null,
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
