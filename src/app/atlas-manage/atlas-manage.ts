import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AtlasAdminProfile, AtlasItem, AtlasUsage, CityAtlasConfig, CityPulseMetric } from '../atlas.models';
import { AtlasService } from '../atlas.service';
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

@Component({
  selector: 'app-atlas-manage',
  imports: [FormsModule, RouterLink, ThemeToggleComponent],
  templateUrl: './atlas-manage.html',
})
export class AtlasManageComponent {
  private readonly atlasService = inject(AtlasService);

  readonly atlases = this.atlasService.atlases;
  readonly activeAtlasId = this.atlasService.activeAtlasId;

  readonly usageById = signal<Record<string, AtlasUsage>>({});
  readonly loadingUsageById = signal<Record<string, boolean>>({});
  readonly renamingId = signal<string | null>(null);
  readonly renameDraft = signal('');
  readonly renaming = signal(false);
  readonly cityEditingId = signal<string | null>(null);
  readonly cityDraft = signal<CityConfigDraft | null>(null);
  readonly savingCityConfig = signal(false);
  readonly savingDefaultModeById = signal<Record<string, boolean>>({});
  readonly adminEmailDraftById = signal<Record<string, string>>({});
  readonly sharingAdminById = signal<Record<string, boolean>>({});
  readonly removingAdminKey = signal<string | null>(null);
  readonly openSections = signal<Record<string, boolean>>({});
  readonly deletingId = signal<string | null>(null);
  readonly pageError = signal<string | null>(null);

  readonly hasMultipleAtlases = computed(() => this.atlases().length > 1);

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

  defaultAnswerMode(atlas: AtlasItem): 'wiki' | 'internet' {
    return atlas.default_answer_mode === 'internet' ? 'internet' : 'wiki';
  }

  defaultAnswerModeSummary(atlas: AtlasItem): string {
    return this.defaultAnswerMode(atlas) === 'internet' ? 'Internet' : 'Living Wiki';
  }

  isSavingDefaultMode(atlasId: string): boolean {
    return this.savingDefaultModeById()[atlasId] ?? false;
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
