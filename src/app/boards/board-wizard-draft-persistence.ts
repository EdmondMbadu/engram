import {
  normalizeBoardWizardMediaMode,
  type BoardWizardMediaMode,
} from './board-wizard-media-mode';
import {
  DEFAULT_BOARD_NARRATION_SECONDS_PER_CARD,
  normalizeBoardNarrationSeconds,
} from './board-narration-length';
import type { BoardWizardCountMode } from './board-wizard-count-policy';

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
  count_mode: BoardWizardCountMode;
  narration_seconds_per_card: number;
  listing_intent: BoardWizardPersistedListingIntent;
  listing_marketing?: {
    style: 'warm' | 'guided' | 'luxury' | 'brisk' | 'investor';
    direction: string;
    propertyType: string;
    introMessage: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    agency: string;
    showContact: boolean;
  };
};

export type BoardWizardPersistedListingIntent = 'default' | 'real-estate' | 'rental';

type BoardWizardDraftCardImages = {
  imageUrl?: string;
  imageUrls?: string[];
  listingPresentation?: {
    presentationImageUrls?: string[];
    [key: string]: unknown;
  } | null;
};

/**
 * Draft cards can contain browser-local data URLs in both the primary image
 * field and the image gallery. Persist every unique image before the card is
 * written to Firestore so a duplicate base64 payload cannot exceed the
 * document size limit.
 */
export async function boardWizardDraftCardWithPersistedImages<
  TCard extends BoardWizardDraftCardImages,
>(
  card: TCard,
  maxImages: number,
  persistImage: (imageUrl: string, index: number) => Promise<string>,
): Promise<TCard & { imageUrl: string; imageUrls: string[] }> {
  const sourceImages = [card.imageUrl ?? '', ...(card.imageUrls ?? [])]
    .filter((imageUrl, index, images) => !!imageUrl && images.indexOf(imageUrl) === index)
    .slice(0, Math.max(0, maxImages));
  const persistedImages = await Promise.all(
    sourceImages.map((imageUrl, index) => persistImage(imageUrl, index)),
  );
  const imageUrls = persistedImages
    .filter((imageUrl, index, images) => !!imageUrl && images.indexOf(imageUrl) === index);
  const persistedBySource = new Map(sourceImages.map((imageUrl, index) => [imageUrl, persistedImages[index] || imageUrl]));
  return {
    ...card,
    imageUrl: imageUrls[0] ?? '',
    imageUrls,
    ...(card.listingPresentation ? {
      listingPresentation: {
        ...card.listingPresentation,
        presentationImageUrls: (card.listingPresentation.presentationImageUrls ?? [])
          .map((imageUrl) => persistedBySource.get(imageUrl) || imageUrl),
      },
    } : {}),
  };
}

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
  preferences: {
    countMode?: BoardWizardCountMode;
    narrationSecondsPerCard?: number;
    listingIntent?: unknown;
    listingMarketing?: {
      style?: unknown;
      direction?: unknown;
      propertyType?: unknown;
      introMessage?: unknown;
      contactName?: unknown;
      contactEmail?: unknown;
      contactPhone?: unknown;
      agency?: unknown;
      showContact?: unknown;
    };
  } = {},
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
        count_mode: preferences.countMode === 'fixed' ? 'fixed' : 'auto',
        narration_seconds_per_card: normalizeBoardNarrationSeconds(
          preferences.narrationSecondsPerCard ?? DEFAULT_BOARD_NARRATION_SECONDS_PER_CARD,
        ),
        listing_intent: normalizePersistedListingIntent(preferences.listingIntent),
        ...(preferences.listingMarketing ? {
          listing_marketing: normalizePersistedListingMarketing(preferences.listingMarketing),
        } : {}),
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

function boardWizardDraftPreferences(value: Record<string, unknown>): Record<string, unknown> {
  const result = value['result'] && typeof value['result'] === 'object'
    ? value['result'] as Record<string, unknown>
    : {};
  return result[BOARD_WIZARD_PREFERENCES_FIELD]
    && typeof result[BOARD_WIZARD_PREFERENCES_FIELD] === 'object'
    ? result[BOARD_WIZARD_PREFERENCES_FIELD] as Record<string, unknown>
    : {};
}

export function boardWizardDraftCountMode(value: Record<string, unknown>): BoardWizardCountMode {
  const temporary = value['count_mode'];
  if (temporary === 'fixed' || temporary === 'auto') return temporary;
  return boardWizardDraftPreferences(value)['count_mode'] === 'fixed' ? 'fixed' : 'auto';
}

export function boardWizardDraftNarrationSeconds(value: Record<string, unknown>): number {
  const temporary = value['narration_seconds_per_card'];
  if (typeof temporary === 'number') return normalizeBoardNarrationSeconds(temporary);
  return normalizeBoardNarrationSeconds(
    boardWizardDraftPreferences(value)['narration_seconds_per_card'],
  );
}

export function boardWizardDraftListingMarketing(value: Record<string, unknown>): {
  style: 'warm' | 'guided' | 'luxury' | 'brisk' | 'investor';
  direction: string;
  propertyType: string;
  introMessage: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  agency: string;
  showContact: boolean;
} {
  return normalizePersistedListingMarketing(boardWizardDraftPreferences(value)['listing_marketing']);
}

export function boardWizardDraftListingIntent(value: Record<string, unknown>): BoardWizardPersistedListingIntent {
  return normalizePersistedListingIntent(boardWizardDraftPreferences(value)['listing_intent']);
}

function normalizePersistedListingIntent(value: unknown): BoardWizardPersistedListingIntent {
  return value === 'real-estate' || value === 'rental' ? value : 'default';
}

function normalizePersistedListingMarketing(value: unknown): {
  style: 'warm' | 'guided' | 'luxury' | 'brisk' | 'investor';
  direction: string;
  propertyType: string;
  introMessage: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  agency: string;
  showContact: boolean;
} {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const style = record['style'];
  return {
    style: style === 'guided' || style === 'luxury' || style === 'brisk' || style === 'investor'
      ? style
      : 'warm',
    direction: typeof record['direction'] === 'string'
      ? record['direction'].replace(/\s+/g, ' ').trim().slice(0, 500)
      : '',
    propertyType: cleanPreferenceText(record['property_type'] ?? record['propertyType'], 100),
    introMessage: cleanPreferenceText(record['intro_message'] ?? record['introMessage'], 800, false),
    contactName: cleanPreferenceText(record['contact_name'] ?? record['contactName'], 140),
    contactEmail: cleanPreferenceText(record['contact_email'] ?? record['contactEmail'], 254),
    contactPhone: cleanPreferenceText(record['contact_phone'] ?? record['contactPhone'], 40),
    agency: cleanPreferenceText(record['agency'], 160),
    showContact: (record['show_contact'] ?? record['showContact']) !== false,
  };
}

function cleanPreferenceText(value: unknown, maxLength: number, collapseWhitespace = true): string {
  if (typeof value !== 'string') return '';
  const text = collapseWhitespace ? value.replace(/\s+/g, ' ') : value.replace(/\r\n?/g, '\n');
  return text.trim().slice(0, maxLength);
}
