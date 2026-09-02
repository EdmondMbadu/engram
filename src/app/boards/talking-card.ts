export type TalkingCardActionKind = 'schedule' | 'link';

export type TalkingCardAction = {
  id: string;
  kind: TalkingCardActionKind;
  label: string;
  url: string;
  description?: string;
};

export type BoardCardConversation = {
  version: 1;
  provider: 'atlas';
  atlasId: string;
  openingMessage: string;
  ctaLabel?: string;
  actions?: TalkingCardAction[];
};

export type TalkingCardEditorResult = {
  cardId?: string;
  atlasId: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  personaPrompt?: string;
  openingMessage: string;
  ctaLabel: string;
  actions: TalkingCardAction[];
  placement: 'start' | 'end' | 'keep';
};

export type TalkingCardEditorValue = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  placement: 'start' | 'end' | 'keep';
  conversation: BoardCardConversation;
};

const ATLAS_ID_MAX_LENGTH = 128;
const OPENING_MESSAGE_MAX_LENGTH = 500;
const CTA_LABEL_MAX_LENGTH = 48;
const ACTION_ID_MAX_LENGTH = 80;
const ACTION_LABEL_MAX_LENGTH = 48;
const ACTION_DESCRIPTION_MAX_LENGTH = 180;
const ACTION_URL_MAX_LENGTH = 2000;
const ACTION_LIMIT = 4;

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0;
}

export function normalizeTalkingCardActionUrl(value: unknown): string {
  const raw = cleanString(value, ACTION_URL_MAX_LENGTH);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const privateIpv6 = hostname.includes(':') && (
      hostname === '::1'
      || hostname.startsWith('fc')
      || hostname.startsWith('fd')
      || hostname.startsWith('fe8')
      || hostname.startsWith('fe9')
      || hostname.startsWith('fea')
      || hostname.startsWith('feb')
    );
    const blockedHostname = hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || privateIpv6
      || isPrivateIpv4(hostname);
    if (url.protocol !== 'https:' || !hostname || blockedHostname || url.username || url.password) return '';
    return url.toString().slice(0, ACTION_URL_MAX_LENGTH);
  } catch {
    return '';
  }
}

export function normalizeTalkingCardActions(value: unknown): TalkingCardAction[] {
  if (!Array.isArray(value)) return [];
  let hasSchedule = false;
  const ids = new Set<string>();
  const actions: TalkingCardAction[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object' || actions.length >= ACTION_LIMIT) continue;
    const data = item as Record<string, unknown>;
    const kind: TalkingCardActionKind = data['kind'] === 'schedule' ? 'schedule' : 'link';
    if (kind === 'schedule' && hasSchedule) continue;
    const url = normalizeTalkingCardActionUrl(data['url']);
    const label = cleanString(data['label'], ACTION_LABEL_MAX_LENGTH)
      || (kind === 'schedule' ? 'Schedule a meeting' : 'Open link');
    if (!url) continue;
    let id = cleanString(data['id'], ACTION_ID_MAX_LENGTH).replace(/[^A-Za-z0-9_-]/g, '');
    if (!id || ids.has(id)) id = `${kind}-${index + 1}`;
    while (ids.has(id)) id = `${id}-${actions.length + 1}`;
    ids.add(id);
    if (kind === 'schedule') hasSchedule = true;
    const description = cleanString(data['description'], ACTION_DESCRIPTION_MAX_LENGTH);
    actions.push({ id, kind, label, url, ...(description ? { description } : {}) });
  }
  return actions;
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
  const actions = normalizeTalkingCardActions(data['actions']);
  return {
    version: 1,
    provider: 'atlas',
    atlasId,
    openingMessage,
    ...(ctaLabel ? { ctaLabel } : {}),
    ...(actions.length ? { actions } : {}),
  };
}

export function talkingCardCtaLabel(conversation: BoardCardConversation | null | undefined): string {
  return conversation?.ctaLabel?.trim() || 'Talk to me';
}

export function talkingCardActions(conversation: BoardCardConversation | null | undefined): TalkingCardAction[] {
  return normalizeTalkingCardActions(conversation?.actions);
}
