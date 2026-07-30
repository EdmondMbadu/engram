export type GoThereCardLike = {
  type?: unknown;
  entityType?: unknown;
  mediaKind?: unknown;
  placeId?: unknown;
  googleMapsUrl?: unknown;
  locationLat?: unknown;
  locationLng?: unknown;
  what3wordsAddress?: unknown;
  tour?: unknown;
  tags?: unknown;
};

export type VisitPlanStatus = 'planned' | 'cancelled';

export type VisitPlanSummary = {
  id: string;
  boardId: string;
  cardId: string;
  placeName: string;
  startsAtIso: string;
  timezone: string;
  status: VisitPlanStatus;
  invitedCount: number;
  acceptedCount: number;
  pendingCount: number;
};

export type VisitPlanAttendee = {
  id: string;
  name: string;
  role: 'organizer' | 'guest';
  status: 'going' | 'pending';
};

export function canPlanVisit(card: GoThereCardLike): boolean {
  const mediaKind = stringValue(card.mediaKind).toLowerCase();
  const entityType = stringValue(card.entityType).toLowerCase();
  if (mediaKind && mediaKind !== 'none') {
    return false;
  }
  if (['person', 'work', 'product'].includes(entityType)) {
    return false;
  }

  const tour = card.tour && typeof card.tour === 'object'
    ? card.tour as Record<string, unknown>
    : null;
  const hasCoordinates = finiteCoordinate(card.locationLat, -90, 90)
    && finiteCoordinate(card.locationLng, -180, 180);
  const hasTourCoordinates = finiteCoordinate(tour?.['lat'], -90, 90)
    && finiteCoordinate(tour?.['lng'], -180, 180);
  const hasLocation = Boolean(
    stringValue(card.placeId)
    || safeHttpsUrl(card.googleMapsUrl)
    || stringValue(card.what3wordsAddress)
    || hasCoordinates
    || hasTourCoordinates
    || stringValue(tour?.['address']),
  );
  if (!hasLocation) {
    return false;
  }

  const tags = Array.isArray(card.tags)
    ? card.tags.map((tag) => stringValue(tag).toLowerCase())
    : [];
  return entityType === 'place'
    || stringValue(card.type).toLowerCase() === 'place'
    || Boolean(stringValue(card.placeId))
    || Boolean(stringValue(card.what3wordsAddress))
    || hasCoordinates
    || hasTourCoordinates
    || tags.some((tag) => ['place', 'off-grid', 'stop', 'walking-tour', 'driving-tour'].includes(tag));
}

export function parseVisitInviteEmails(value: string, limit = 10): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) {
        return false;
      }
      seen.add(email);
      return true;
    })
    .slice(0, limit);
}

export function defaultVisitDateTime(now = new Date()): string {
  const next = new Date(now);
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  next.setMinutes(minutes < 30 ? 30 : 60);
  return localDateTimeValue(next);
}

export function rightNowVisitDateTime(now = new Date()): string {
  const current = new Date(now);
  current.setSeconds(0, 0);
  return localDateTimeValue(current);
}

export function tomorrowVisitDateTime(now = new Date()): string {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  return localDateTimeValue(tomorrow);
}

export function visitStartIso(localDateTime: string): string {
  if (!localDateTime.trim()) {
    return '';
  }
  const date = new Date(localDateTime);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

export function visitPlanLabel(
  plan: Pick<VisitPlanSummary, 'startsAtIso' | 'timezone'>,
  now = new Date(),
): string {
  const start = new Date(plan.startsAtIso);
  if (!Number.isFinite(start.getTime())) {
    return 'Going';
  }
  const delta = start.getTime() - now.getTime();
  if (Math.abs(delta) < 15 * 60 * 1000) {
    return 'Going now';
  }
  try {
    return `Going · ${new Intl.DateTimeFormat(undefined, {
      timeZone: plan.timezone || undefined,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(start)}`;
  } catch {
    return `Going · ${start.toLocaleString()}`;
  }
}

export function visitPlanInvitationTime(
  plan: Pick<VisitPlanSummary, 'startsAtIso' | 'timezone'>,
): string {
  const start = new Date(plan.startsAtIso);
  if (!Number.isFinite(start.getTime())) {
    return '';
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: plan.timezone || undefined,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(start);
  } catch {
    return start.toLocaleString();
  }
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function localDateTimeValue(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  const hour = `${value.getHours()}`.padStart(2, '0');
  const minute = `${value.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeHttpsUrl(value: unknown): string {
  const text = stringValue(value);
  if (!text) {
    return '';
  }
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function finiteCoordinate(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
