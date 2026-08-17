import {
  normalizeBoardWizardMediaMode,
  type BoardWizardMediaMode,
} from './board-wizard-media-mode';

export const BOARD_WIZARD_PREFERENCES_FIELD = 'wizard_preferences';

export const BOARD_WIZARD_DRAFT_STABLE_TOP_LEVEL_FIELDS = [
  'id',
  'owner_user_id',
  'mode',
  'target_board_id',
  'locked_target_board_id',
  'contribution_board_id',
  'default_type',
  'count',
  'vibe',
  'narration_style',
  'prompt',
  'pasted_list',
  'source_url',
  'off_grid_name',
  'off_grid_address',
  'off_grid_tip',
  'stack_cta_label',
  'stack_cta_url',
  'tour_voice_style',
  'tour_pace_or_style',
  'tour_extras',
  'result',
  'selected_card_ids',
  'created_at_iso',
  'updated_at_iso',
  'server_updated_at',
] as const;

type PersistedWizardPreferences = {
  media_mode: BoardWizardMediaMode;
};

/**
 * Optional wizard preferences live inside `result`, an established draft field.
 * Keeping them out of the top-level document prevents client/rules deployment
 * order from breaking autosave when a preference is introduced.
 */
export function boardWizardDraftPayloadWithPreferences<
  TResult extends Record<string, unknown>,
>(
  payload: Record<string, unknown> & { result: TResult },
  mediaMode: BoardWizardMediaMode,
): Record<string, unknown> & { result: TResult & { wizard_preferences: PersistedWizardPreferences } } {
  const stablePayload: Record<string, unknown> = {};
  for (const field of BOARD_WIZARD_DRAFT_STABLE_TOP_LEVEL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      stablePayload[field] = payload[field];
    }
  }
  return {
    ...stablePayload,
    result: {
      ...payload.result,
      [BOARD_WIZARD_PREFERENCES_FIELD]: {
        ...(payload.result[BOARD_WIZARD_PREFERENCES_FIELD]
          && typeof payload.result[BOARD_WIZARD_PREFERENCES_FIELD] === 'object'
          ? payload.result[BOARD_WIZARD_PREFERENCES_FIELD] as Record<string, unknown>
          : {}),
        media_mode: mediaMode,
      },
    },
  };
}

export function boardWizardDraftMediaMode(value: Record<string, unknown>): BoardWizardMediaMode {
  // Read the temporary top-level format for drafts created while that client
  // version was active, but never emit it again.
  if (value['media_mode'] === 'mixed' || value['media_mode'] === 'videos' || value['media_mode'] === 'images') {
    return value['media_mode'];
  }
  const result = value['result'] && typeof value['result'] === 'object'
    ? value['result'] as Record<string, unknown>
    : {};
  const preferences = result[BOARD_WIZARD_PREFERENCES_FIELD]
    && typeof result[BOARD_WIZARD_PREFERENCES_FIELD] === 'object'
    ? result[BOARD_WIZARD_PREFERENCES_FIELD] as Record<string, unknown>
    : {};
  return normalizeBoardWizardMediaMode(preferences['media_mode']);
}
