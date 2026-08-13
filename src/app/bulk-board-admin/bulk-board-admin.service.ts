import { Injectable } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase.client';

export type BulkBoardCity = {
  id: string;
  name: string;
  officialName?: string;
  region: string;
  countryCode: string;
  slug: string;
  kind?: 'city' | 'university';
  townName?: string;
  state?: string;
  unitId?: string;
  website?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type BoardFactoryKind = 'city' | 'university';

export type BulkBoardTemplateInput = {
  id: string;
  version: string;
  titlePattern: string;
  searchQuery: string;
  editorialBrief: string;
  count: number;
  cardTitleMode: 'place' | 'subject';
};

export type BulkBoardJob = {
  id: string;
  status: string;
  target_kind?: BoardFactoryKind;
  generation_engine?: string;
  worker_status?: string;
  template?: BulkBoardTemplateInput;
  total_count: number;
  completed_count: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  cancelled_count: number;
  cancel_requested: boolean;
  created_at: string | null;
  completed_at: string | null;
};

export type BulkBoardJobItem = {
  id: string;
  job_id: string;
  atlas_id: string;
  city_name: string;
  target_name?: string;
  school_name?: string;
  town_name?: string;
  target_kind?: BoardFactoryKind;
  generation_engine?: string;
  region_name: string;
  status: string;
  attempt_count: number;
  board_id: string;
  error_code: string;
  error_message: string;
  quality_warning_count: number;
  generation_score?: number | null;
  generation_grade?: string;
  updated_at: string | null;
};

export type BulkBoardAdminBoard = {
  id: string;
  title: string;
  atlas_id: string;
  generated_for_atlas_id: string;
  generation_job_id: string;
  generation_key: string;
  template_id: string;
  template_version: string;
  rubric_version: string;
  editorial_status: string;
  city_listing_status: string;
  source_status: string;
  quality_status: string;
  quality_warnings: string[];
  generation_score: number | null;
  generation_grade: string;
  generation_score_breakdown: {
    completeness?: number;
    evidence?: number;
    identity?: number;
    specificity?: number;
    freshness?: number;
    safety?: number;
  } | null;
  generation_score_reasons: string[];
  visibility: string;
  card_count: number;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  deletion_reason: string;
  validation_summary: {
    requested_count?: number;
    verified_count?: number;
    unique_place_ids?: number;
    unique_subject_ids?: number;
    all_have_coordinates?: boolean;
    all_have_source_urls?: boolean;
    all_have_images?: boolean;
    image_count?: number;
    unique_image_count?: number;
    candidate_sources?: string[];
    validated_at?: string;
  } | null;
};

export type BulkBoardDashboard = {
  generatorVersion: string;
  rubricVersion: string;
  cities: BulkBoardCity[];
  jobs: BulkBoardJob[];
  items: BulkBoardJobItem[];
  boards: BulkBoardAdminBoard[];
  catalog: GlobalCityBoardCatalogStatus;
  targetKind?: BoardFactoryKind;
  generationEngine?: string;
  templates?: BulkBoardTemplateInput[];
  itemDisplayLimit?: number;
};

export type GlobalCityBoardCatalogBucketStatus = {
  id: string;
  expectedCount: number;
  publishedCount: number;
  reviewCount: number;
  missingCount: number;
  invalidCount: number;
};

export type GlobalCityBoardCatalogStatus = {
  cityCount: number;
  targetCount?: number;
  bucketCount: number;
  expectedCount: number;
  publishedCount: number;
  reviewCount: number;
  missingCount: number;
  invalidCount: number;
  readyCount?: number;
  suppressedCount?: number;
  dryRun?: boolean;
  jobId?: string;
  generationEngine?: string;
  buckets: GlobalCityBoardCatalogBucketStatus[];
};

export type BulkBoardPreflight = {
  dryRun: true;
  requestedCount: number;
  eligibleCount: number;
  readyCount: number;
  existingCount: number;
  suppressedCount: number;
  template: BulkBoardTemplateInput;
};

export type BulkBoardAdminAction =
  | 'publish'
  | 'remove_from_city'
  | 'exclude_source'
  | 'approve_source'
  | 'trash'
  | 'restore'
  | 'permanent_delete';

export type BulkBoardPublishAllResult = {
  requestedCount: number;
  publishedCount: number;
  skippedCount: number;
  failedCount: number;
  failures: Array<{
    boardId: string;
    title: string;
    message: string;
  }>;
};

@Injectable({ providedIn: 'root' })
export class BulkBoardAdminService {
  async dashboard(kind: BoardFactoryKind = 'city'): Promise<BulkBoardDashboard> {
    const callable = httpsCallable<Record<string, never>, BulkBoardDashboard>(
      getFirebaseFunctions(),
      kind === 'university' ? 'getUniversityBoardAdminDashboard' : 'getBulkBoardAdminDashboard',
    );
    return (await callable({})).data;
  }

  async preflight(kind: BoardFactoryKind, cityIds: string[], template: BulkBoardTemplateInput): Promise<BulkBoardPreflight> {
    const callable = httpsCallable<
      { cityIds?: string[]; atlasIds?: string[]; template: BulkBoardTemplateInput; dryRun: true },
      BulkBoardPreflight
    >(getFirebaseFunctions(), kind === 'university' ? 'startUniversityBoardGeneration' : 'startBulkBoardGeneration');
    return (await callable(kind === 'university'
      ? { atlasIds: cityIds, template, dryRun: true }
      : { cityIds, template, dryRun: true })).data;
  }

  async start(kind: BoardFactoryKind, cityIds: string[], template: BulkBoardTemplateInput): Promise<{ jobId: string; cityCount: number }> {
    const callable = httpsCallable<
      { cityIds?: string[]; atlasIds?: string[]; template: BulkBoardTemplateInput },
      { jobId: string; cityCount: number }
    >(getFirebaseFunctions(), kind === 'university' ? 'startUniversityBoardGeneration' : 'startBulkBoardGeneration');
    return (await callable(kind === 'university'
      ? { atlasIds: cityIds, template }
      : { cityIds, template })).data;
  }

  async retryItem(itemId: string): Promise<void> {
    const callable = httpsCallable<{ itemId: string }, { ok: boolean }>(
      getFirebaseFunctions(),
      'retryBulkBoardGenerationItem',
    );
    await callable({ itemId });
  }

  async cancel(jobId: string): Promise<void> {
    const callable = httpsCallable<{ jobId: string }, { ok: boolean }>(
      getFirebaseFunctions(),
      'cancelBulkBoardGeneration',
    );
    await callable({ jobId });
  }

  async manageBoard(boardId: string, action: BulkBoardAdminAction, reason = ''): Promise<void> {
    const callable = httpsCallable<
      { boardId: string; action: BulkBoardAdminAction; reason: string },
      { ok: boolean }
    >(getFirebaseFunctions(), 'manageCityBoard');
    await callable({ boardId, action, reason });
  }

  async publishBoards(boardIds: string[]): Promise<BulkBoardPublishAllResult> {
    const callable = httpsCallable<
      { boardIds: string[] },
      BulkBoardPublishAllResult
    >(getFirebaseFunctions(), 'publishCityBoards');
    const result: BulkBoardPublishAllResult = {
      requestedCount: 0,
      publishedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      failures: [],
    };
    for (let offset = 0; offset < boardIds.length; offset += 500) {
      const chunk = (await callable({ boardIds: boardIds.slice(offset, offset + 500) })).data;
      result.requestedCount += chunk.requestedCount;
      result.publishedCount += chunk.publishedCount;
      result.skippedCount += chunk.skippedCount;
      result.failedCount += chunk.failedCount;
      result.failures.push(...chunk.failures);
    }
    return result;
  }

  async reconcileCatalog(kind: BoardFactoryKind, dryRun: boolean): Promise<GlobalCityBoardCatalogStatus> {
    const callable = httpsCallable<
      { dryRun: boolean },
      GlobalCityBoardCatalogStatus
    >(getFirebaseFunctions(), kind === 'university'
      ? 'reconcileGlobalUniversityBoardCatalog'
      : 'reconcileGlobalCityBoardCatalog');
    return (await callable({ dryRun })).data;
  }
}
