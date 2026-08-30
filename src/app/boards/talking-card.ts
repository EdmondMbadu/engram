export type BoardCardConversation = {
  version: 1;
  provider: 'atlas';
  atlasId: string;
  openingMessage: string;
  ctaLabel?: string;
};

export type TalkingCardEditorResult = {
  atlasId: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  openingMessage: string;
  ctaLabel: string;
  placement: 'start' | 'end';
};

const ATLAS_ID_MAX_LENGTH = 128;
const OPENING_MESSAGE_MAX_LENGTH = 500;
const CTA_LABEL_MAX_LENGTH = 48;

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeBoardCardConversation(value: unknown): BoardCardConversation | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const atlasId = cleanString(data['atlasId'], ATLAS_ID_MAX_LENGTH);
  if (!atlasId || data['provider'] !== 'atlas') {
    return null;
  }
  const openingMessage = cleanString(data['openingMessage'], OPENING_MESSAGE_MAX_LENGTH);
  const ctaLabel = cleanString(data['ctaLabel'], CTA_LABEL_MAX_LENGTH);
  return {
    version: 1,
    provider: 'atlas',
    atlasId,
    openingMessage,
    ...(ctaLabel ? { ctaLabel } : {}),
  };
}

export function talkingCardCtaLabel(conversation: BoardCardConversation | null | undefined): string {
  return conversation?.ctaLabel?.trim() || 'Talk to me';
}

