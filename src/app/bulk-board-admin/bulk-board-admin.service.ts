import { Injectable } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase.client';

export type BulkBoardCity = {
  id: string;
  name: string;
  region: string;
  countryCode: string;
  slug: string;
};

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
  region_name: string;
  status: string;
  attempt_count: number;
  board_id: string;
  error_code: string;
  error_message: string;
  quality_warning_count: number;
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
    all_have_coordinates?: boolean;
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

@Injectable({ providedIn: 'root' })
export class BulkBoardAdminService {
  async dashboard(): Promise<BulkBoardDashboard> {
    const callable = httpsCallable<Record<string, never>, BulkBoardDashboard>(
      getFirebaseFunctions(),
      'getBulkBoardAdminDashboard',
    );
    return (await callable({})).data;
  }

  async preflight(cityIds: string[], template: BulkBoardTemplateInput): Promise<BulkBoardPreflight> {
    const callable = httpsCallable<
      { cityIds: string[]; template: BulkBoardTemplateInput; dryRun: true },
      BulkBoardPreflight
    >(getFirebaseFunctions(), 'startBulkBoardGeneration');
    return (await callable({ cityIds, template, dryRun: true })).data;
  }

  async start(cityIds: string[], template: BulkBoardTemplateInput): Promise<{ jobId: string; cityCount: number }> {
    const callable = httpsCallable<
      { cityIds: string[]; template: BulkBoardTemplateInput },
      { jobId: string; cityCount: number }
    >(getFirebaseFunctions(), 'startBulkBoardGeneration');
    return (await callable({ cityIds, template })).data;
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
}
