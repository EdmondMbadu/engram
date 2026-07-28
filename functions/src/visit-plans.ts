import { createHash } from 'node:crypto';

export type VisitPlanEmail = {
  subject: string;
  text: string;
  html: string;
  calendar?: {
    content: string;
    filename: string;
  };
};

export type VisitPlanEmailAttachment = {
  content: string;
  filename: string;
  type: 'text/calendar';
  disposition: 'attachment';
};

export type VisitPlanSnapshot = {
  id: string;
  organizerName: string;
  organizerEmail: string;
  boardId: string;
  boardTitle: string;
  cardId: string;
  placeName: string;
  placeAddress: string;
  imageUrl: string;
  googleMapsUrl: string;
  locationLat: number | null;
  locationLng: number | null;
  what3wordsAddress: string;
  startsAtIso: string;
  timezone: string;
  status: 'planned' | 'cancelled';
};

export function visitPlanDocumentId(userId: string, boardId: string, cardId: string): string {
  const hash = createHash('sha256')
    .update(`${userId}\n${boardId}\n${cardId}`)
    .digest('hex')
    .slice(0, 48);
  return `vp_${hash}`;
}

export function visitEmailInvitationDocumentId(planId: string, email: string): string {
  const hash = createHash('sha256')
    .update(`${planId}\n${email.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 48);
  return `vpi_${hash}`;
}

export function visitPlanEmailAttachments(email: VisitPlanEmail): VisitPlanEmailAttachment[] {
  if (!email.calendar) {
    return [];
  }
  return [{
    content: Buffer.from(email.calendar.content, 'utf8').toString('base64'),
    filename: email.calendar.filename,
    type: 'text/calendar',
    disposition: 'attachment',
  }];
}

export function normalizeVisitPlanEmails(value: unknown, limit = 10): string[] {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,;]+/) : [];
  const seen = new Set<string>();
  return source
    .map((email) => text(email, 254).toLowerCase())
    .filter((email) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) {
        return false;
      }
      seen.add(email);
      return true;
    })
    .slice(0, limit);
}

export function isVisitableBoardCard(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const card = value as Record<string, unknown>;
  const mediaKind = text(card.mediaKind, 40).toLowerCase();
  const entityType = text(card.entityType, 40).toLowerCase();
  if (mediaKind && mediaKind !== 'none') {
    return false;
  }
  if (['person', 'work', 'product'].includes(entityType)) {
    return false;
  }

  const tour = card.tour && typeof card.tour === 'object'
    ? card.tour as Record<string, unknown>
    : null;
  const what3wordsAddress = extractWhat3WordsAddress([
    card.what3wordsAddress,
    card.subtitle,
    card.notes,
    card.sourceUrl,
  ]);
  const hasCoordinates = coordinate(card.locationLat, -90, 90) !== null
    && coordinate(card.locationLng, -180, 180) !== null;
  const hasTourCoordinates = coordinate(tour?.lat, -90, 90) !== null
    && coordinate(tour?.lng, -180, 180) !== null;
  const hasLocation = Boolean(
    text(card.placeId, 180)
    || safeHttpsUrl(card.googleMapsUrl)
    || what3wordsAddress
    || hasCoordinates
    || hasTourCoordinates
    || text(tour?.address, 240),
  );
  if (!hasLocation) {
    return false;
  }

  const tags = Array.isArray(card.tags)
    ? card.tags.map((tag) => text(tag, 40).toLowerCase())
    : [];
  return entityType === 'place'
    || text(card.type, 40).toLowerCase() === 'place'
    || Boolean(text(card.placeId, 180))
    || Boolean(what3wordsAddress)
    || hasCoordinates
    || hasTourCoordinates
    || tags.some((tag) => ['place', 'off-grid', 'stop', 'walking-tour', 'driving-tour'].includes(tag));
}

export function normalizeVisitStart(value: unknown, nowMs = Date.now()): {
  iso: string;
  ms: number;
} {
  const date = new Date(text(value, 80));
  const ms = date.getTime();
  if (!Number.isFinite(ms)) {
    throw new Error('Choose a valid date and time.');
  }
  if (ms < nowMs - 5 * 60 * 1000) {
    throw new Error('Choose a time that has not already passed.');
  }
  if (ms > nowMs + 2 * 366 * 24 * 60 * 60 * 1000) {
    throw new Error('Choose a date within the next two years.');
  }
  return { iso: date.toISOString(), ms };
}

export function normalizeVisitTimezone(value: unknown): string {
  const timezone = text(value, 80) || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return 'UTC';
  }
}

export function visitReminderAtMs(startMs: number, nowMs = Date.now()): number | null {
  const reminder = startMs - 60 * 60 * 1000;
  return reminder > nowMs + 60 * 1000 ? reminder : null;
}

export function visitPlanSnapshot(
  planId: string,
  board: Record<string, unknown>,
  card: Record<string, unknown>,
  organizer: { name: string; email: string },
  start: { iso: string; ms: number },
  timezone: string,
): VisitPlanSnapshot {
  const tour = card.tour && typeof card.tour === 'object'
    ? card.tour as Record<string, unknown>
    : null;
  const subtitle = text(card.subtitle, 240);
  const words = extractWhat3WordsAddress([
    card.what3wordsAddress,
    subtitle,
    card.notes,
    card.sourceUrl,
  ]);
  const subtitleIsOnlyWords = Boolean(words && normalizeWordsCandidate(subtitle) === words);
  return {
    id: planId,
    organizerName: text(organizer.name, 120) || 'A LivingWiki member',
    organizerEmail: text(organizer.email, 254).toLowerCase(),
    boardId: text(board.id, 160),
    boardTitle: text(board.title, 120) || 'LivingWiki board',
    cardId: text(card.id, 160),
    placeName: text(card.title, 160) || 'LivingWiki place',
    placeAddress: text(tour?.address, 240) || (subtitleIsOnlyWords ? '' : subtitle),
    imageUrl: safeHttpsUrl(card.imageUrl),
    googleMapsUrl: safeGoogleMapsUrl(card.googleMapsUrl),
    locationLat: coordinate(card.locationLat, -90, 90) ?? coordinate(tour?.lat, -90, 90),
    locationLng: coordinate(card.locationLng, -180, 180) ?? coordinate(tour?.lng, -180, 180),
    what3wordsAddress: words,
    startsAtIso: start.iso,
    timezone,
    status: 'planned',
  };
}

export function serializeVisitPlan(value: Record<string, unknown>) {
  return {
    id: text(value.id, 160),
    boardId: text(value.board_id, 160),
    cardId: text(value.card_id, 160),
    placeName: text(value.place_name, 160),
    startsAtIso: text(value.starts_at_iso, 80),
    timezone: normalizeVisitTimezone(value.timezone),
    status: value.status === 'cancelled' ? 'cancelled' as const : 'planned' as const,
    invitedCount: nonNegativeInteger(value.invited_count),
    acceptedCount: nonNegativeInteger(value.accepted_count),
    pendingCount: nonNegativeInteger(value.pending_count),
  };
}

export function visitWhenLabel(startIso: string, timezone: string): string {
  const date = new Date(startIso);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: normalizeVisitTimezone(timezone),
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return date.toUTCString();
  }
}

export function visitMapsUrl(plan: Pick<
  VisitPlanSnapshot,
  'googleMapsUrl' | 'locationLat' | 'locationLng' | 'placeName' | 'placeAddress'
>): string {
  if (plan.googleMapsUrl) {
    return plan.googleMapsUrl;
  }
  const query = plan.locationLat !== null && plan.locationLng !== null
    ? `${plan.locationLat},${plan.locationLng}`
    : [plan.placeName, plan.placeAddress].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function visitWhat3WordsUrl(words: string): string {
  const normalized = normalizeWordsCandidate(words);
  return normalized ? `https://what3words.com/${encodeURIComponent(normalized)}` : '';
}

export function buildVisitPlanEmail(
  plan: VisitPlanSnapshot,
  kind: 'confirmation' | 'updated' | 'reminder' | 'cancelled',
): VisitPlanEmail {
  const when = visitWhenLabel(plan.startsAtIso, plan.timezone);
  const mapsUrl = visitMapsUrl(plan);
  const wordsUrl = visitWhat3WordsUrl(plan.what3wordsAddress);
  const boardUrl = `https://livingwiki.com/boards/${encodeURIComponent(plan.boardId)}`;
  const title = kind === 'reminder'
    ? `One hour until ${plan.placeName}`
    : kind === 'updated'
      ? `Your plan for ${plan.placeName} was updated`
      : kind === 'cancelled'
        ? `Your plan for ${plan.placeName} was cancelled`
        : `You're going to ${plan.placeName}`;
  const intro = kind === 'reminder'
    ? `Your LivingWiki plan starts in about one hour.`
    : kind === 'updated'
      ? `Your LivingWiki plan has a new date or time.`
      : kind === 'cancelled'
        ? `Your LivingWiki plan has been cancelled.`
        : `Your plan is locked in.`;
  const exactLine = plan.what3wordsAddress ? `Exact spot: ///${plan.what3wordsAddress}` : '';
  const textBody = [
    intro,
    '',
    plan.placeName,
    when,
    plan.placeAddress,
    exactLine,
    '',
    `Directions: ${mapsUrl}`,
    wordsUrl ? `Exact spot: ${wordsUrl}` : '',
    `Board: ${boardUrl}`,
  ].filter((line) => line !== '').join('\n');

  return {
    subject: title,
    text: textBody,
    html: emailFrame({
      eyebrow: kind === 'reminder' ? 'One-hour reminder' : kind === 'cancelled' ? 'Plan cancelled' : 'Go there',
      title,
      intro,
      plan,
      when,
      mapsUrl,
      wordsUrl,
      primaryLabel: kind === 'cancelled' ? 'Open board' : 'Get directions',
      primaryUrl: kind === 'cancelled' ? boardUrl : mapsUrl,
    }),
    calendar: {
      content: buildVisitPlanIcs(plan, kind === 'cancelled' ? 'cancelled' : 'confirmed'),
      filename: safeFilename(`${plan.placeName}.ics`),
    },
  };
}

export function buildVisitInvitationEmail(
  plan: VisitPlanSnapshot,
  invitationUrl: string,
  kind: 'invitation' | 'updated' = 'invitation',
): VisitPlanEmail {
  const when = visitWhenLabel(plan.startsAtIso, plan.timezone);
  const mapsUrl = visitMapsUrl(plan);
  const wordsUrl = visitWhat3WordsUrl(plan.what3wordsAddress);
  const title = kind === 'updated'
    ? `${plan.organizerName} updated the plan for ${plan.placeName}`
    : `${plan.organizerName} is inviting you to ${plan.placeName}`;
  const intro = kind === 'updated'
    ? `The date or time changed. Review the updated plan below.`
    : `Open the invitation to say whether you're in. You do not need a LivingWiki account.`;
  return {
    subject: title,
    text: [
      title,
      '',
      when,
      plan.placeAddress,
      plan.what3wordsAddress ? `Exact spot: ///${plan.what3wordsAddress}` : '',
      '',
      `Respond: ${invitationUrl}`,
      `Directions: ${mapsUrl}`,
      wordsUrl ? `Exact spot: ${wordsUrl}` : '',
    ].filter((line) => line !== '').join('\n'),
    html: emailFrame({
      eyebrow: kind === 'updated' ? 'Plan updated' : 'Invitation',
      title,
      intro,
      plan,
      when,
      mapsUrl,
      wordsUrl,
      primaryLabel: kind === 'updated' ? 'Review updated plan' : "I'm in",
      primaryUrl: invitationUrl,
    }),
    calendar: {
      content: buildVisitPlanIcs(plan, 'confirmed'),
      filename: safeFilename(`${plan.placeName}.ics`),
    },
  };
}

export function buildVisitResponseEmail(
  plan: VisitPlanSnapshot,
  guestLabel: string,
  response: 'accepted' | 'declined',
): VisitPlanEmail {
  const accepted = response === 'accepted';
  const when = visitWhenLabel(plan.startsAtIso, plan.timezone);
  const title = accepted
    ? `${guestLabel} is in for ${plan.placeName}`
    : `${guestLabel} can't make it to ${plan.placeName}`;
  return {
    subject: title,
    text: `${title}\n\n${when}\n${plan.placeAddress}`,
    html: emailFrame({
      eyebrow: accepted ? 'Guest accepted' : 'Guest declined',
      title,
      intro: accepted ? `Your invitation was accepted.` : `Your invitation was declined.`,
      plan,
      when,
      mapsUrl: visitMapsUrl(plan),
      wordsUrl: visitWhat3WordsUrl(plan.what3wordsAddress),
      primaryLabel: 'Open board',
      primaryUrl: `https://livingwiki.com/boards/${encodeURIComponent(plan.boardId)}`,
    }),
  };
}

export function buildVisitGuestPage(params: {
  plan: VisitPlanSnapshot;
  invitationUrl: string;
  responseStatus: 'pending' | 'accepted' | 'declined';
  guestName?: string;
}): string {
  const plan = params.plan;
  const when = visitWhenLabel(plan.startsAtIso, plan.timezone);
  const mapsUrl = visitMapsUrl(plan);
  const wordsUrl = visitWhat3WordsUrl(plan.what3wordsAddress);
  const cancelled = plan.status === 'cancelled';
  const responseMessage = cancelled
    ? 'This plan was cancelled.'
    : params.responseStatus === 'accepted'
      ? "You're in. The plan is ready for you."
      : params.responseStatus === 'declined'
        ? "You let the organizer know you can't make it."
        : `${plan.organizerName} invited you to go here.`;
  const image = plan.imageUrl
    ? `<img class="hero" src="${escapeHtml(plan.imageUrl)}" alt="">`
    : `<div class="hero hero--fallback" aria-hidden="true">📍</div>`;
  const forms = cancelled ? '' : `
    <form method="post" action="${escapeHtml(params.invitationUrl)}">
      <label>Your name <small>(optional)</small>
        <input name="guestName" maxlength="80" autocomplete="name" value="${escapeHtml(params.guestName ?? '')}" placeholder="How the organizer knows you">
      </label>
      <div class="responses">
        <button class="primary" type="submit" name="response" value="accepted">I'm in</button>
        <button type="submit" name="response" value="declined">Can't make it</button>
      </div>
    </form>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>${escapeHtml(plan.placeName)} invitation | LivingWiki</title>
  <style>
    :root{color-scheme:light;--ink:#10241a;--deep:#0d3823;--green:#27b45b;--mint:#e8f7ed;--line:#cfe0d5;--yellow:#f4df5b}
    *{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#eef8f1,#fff 55%,#f9f5d9);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;padding:24px}
    main{width:min(100%,620px);margin:30px auto;background:#fff;border:2px solid var(--ink);border-radius:28px;overflow:hidden;box-shadow:10px 12px 0 var(--deep)}
    .brand{display:flex;align-items:center;justify-content:space-between;background:var(--deep);color:#fff;padding:18px 24px;font-weight:900}.brand small{color:#bde8ca;text-transform:uppercase;letter-spacing:.12em}
    .hero{width:100%;height:250px;object-fit:cover;background:var(--mint)}.hero--fallback{display:grid;place-items:center;font-size:70px}
    .body{padding:28px}.status{display:inline-flex;background:var(--yellow);border:1px solid var(--ink);border-radius:999px;padding:8px 13px;font-size:12px;font-weight:900}
    h1{font-size:clamp(28px,7vw,42px);line-height:1.05;margin:18px 0 8px}p{line-height:1.55;color:#496054}.when{font-size:18px;font-weight:900;color:var(--ink)}
    .location{display:grid;gap:8px;margin:20px 0;padding:16px;background:var(--mint);border-radius:16px}.location a{color:var(--deep);font-weight:850}
    form{margin-top:22px;border-top:1px solid var(--line);padding-top:22px}label{display:grid;gap:7px;font-weight:850}label small{font-weight:600;color:#687a70}
    input{width:100%;border:1.5px solid #9eb6a7;border-radius:14px;padding:13px;font:inherit}.responses{display:flex;gap:10px;margin-top:16px}.responses button{flex:1;border:2px solid var(--ink);border-radius:999px;background:#fff;padding:14px;font:900 15px/1 system-ui;cursor:pointer;box-shadow:0 3px 0 var(--ink)}.responses .primary{background:var(--green);color:#fff}
    @media(max-width:520px){body{padding:10px}main{margin:8px auto;box-shadow:5px 7px 0 var(--deep)}.body{padding:22px}.responses{flex-direction:column}}
  </style>
</head>
<body>
  <main>
    <div class="brand"><span>LivingWiki</span><small>Go there</small></div>
    ${image}
    <div class="body">
      <span class="status">${escapeHtml(cancelled ? 'Cancelled' : params.responseStatus === 'pending' ? 'Invitation' : params.responseStatus)}</span>
      <h1>${escapeHtml(plan.placeName)}</h1>
      <p>${escapeHtml(responseMessage)}</p>
      <p class="when">${escapeHtml(when)}</p>
      <div class="location">
        ${plan.placeAddress ? `<span>📍 ${escapeHtml(plan.placeAddress)}</span>` : ''}
        ${plan.what3wordsAddress ? `<span>Exact spot: <strong>///${escapeHtml(plan.what3wordsAddress)}</strong></span>` : ''}
        <span><a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">Google Maps</a>${wordsUrl ? ` · <a href="${escapeHtml(wordsUrl)}" target="_blank" rel="noopener noreferrer">Exact spot</a>` : ''}</span>
      </div>
      ${forms}
    </div>
  </main>
</body>
</html>`;
}

export function buildVisitPlanIcs(
  plan: VisitPlanSnapshot,
  state: 'confirmed' | 'cancelled',
): string {
  const start = new Date(plan.startsAtIso);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const mapsUrl = visitMapsUrl(plan);
  const wordsUrl = visitWhat3WordsUrl(plan.what3wordsAddress);
  const description = [
    `LivingWiki plan for ${plan.placeName}`,
    `Directions: ${mapsUrl}`,
    wordsUrl ? `Exact spot: ${wordsUrl}` : '',
  ].filter(Boolean).join('\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LivingWiki//Go There//EN',
    'CALSCALE:GREGORIAN',
    state === 'cancelled' ? 'METHOD:CANCEL' : 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(plan.id)}@livingwiki.com`,
    `DTSTAMP:${icsUtc(new Date())}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(`Go to ${plan.placeName}`)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `LOCATION:${icsEscape(plan.placeAddress || plan.placeName)}`,
    `URL:${icsEscape(mapsUrl)}`,
    `STATUS:${state === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(`Go to ${plan.placeName} in one hour`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function snapshotFromVisitPlanRecord(value: Record<string, unknown>): VisitPlanSnapshot {
  return {
    id: text(value.id, 160),
    organizerName: text(value.organizer_name, 120) || 'A LivingWiki member',
    organizerEmail: text(value.organizer_email, 254).toLowerCase(),
    boardId: text(value.board_id, 160),
    boardTitle: text(value.board_title, 120),
    cardId: text(value.card_id, 160),
    placeName: text(value.place_name, 160),
    placeAddress: text(value.place_address, 240),
    imageUrl: safeHttpsUrl(value.image_url),
    googleMapsUrl: safeGoogleMapsUrl(value.google_maps_url),
    locationLat: coordinate(value.location_lat, -90, 90),
    locationLng: coordinate(value.location_lng, -180, 180),
    what3wordsAddress: normalizeWordsCandidate(value.what3words_address),
    startsAtIso: text(value.starts_at_iso, 80),
    timezone: normalizeVisitTimezone(value.timezone),
    status: value.status === 'cancelled' ? 'cancelled' : 'planned',
  };
}

function emailFrame(params: {
  eyebrow: string;
  title: string;
  intro: string;
  plan: VisitPlanSnapshot;
  when: string;
  mapsUrl: string;
  wordsUrl: string;
  primaryLabel: string;
  primaryUrl: string;
}): string {
  const image = params.plan.imageUrl
    ? `<img src="${escapeHtml(params.plan.imageUrl)}" alt="" style="width:100%;height:240px;object-fit:cover;display:block;">`
    : '';
  return `<div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:640px;margin:0 auto;color:#10241a;">
    <div style="background:#0d3823;color:#fff;padding:28px 30px;border-radius:20px 20px 0 0;">
      <div style="font-size:12px;font-weight:850;letter-spacing:.13em;text-transform:uppercase;color:#bde8ca;">${escapeHtml(params.eyebrow)}</div>
      <h1 style="font-size:28px;line-height:1.15;margin:10px 0 0;">${escapeHtml(params.title)}</h1>
    </div>
    ${image}
    <div style="background:#fff;border:1px solid #dbe8df;border-top:0;border-radius:0 0 20px 20px;padding:30px;">
      <p style="font-size:16px;line-height:1.6;color:#40584a;margin:0 0 20px;">${escapeHtml(params.intro)}</p>
      <div style="background:#edf8f0;border-radius:16px;padding:20px;margin-bottom:22px;">
        <strong style="font-size:21px;display:block;margin-bottom:8px;">${escapeHtml(params.plan.placeName)}</strong>
        <span style="font-size:16px;font-weight:800;display:block;margin-bottom:8px;">${escapeHtml(params.when)}</span>
        ${params.plan.placeAddress ? `<span style="display:block;color:#40584a;margin-bottom:6px;">📍 ${escapeHtml(params.plan.placeAddress)}</span>` : ''}
        ${params.plan.what3wordsAddress ? `<span style="display:block;color:#40584a;">Exact spot: <strong>///${escapeHtml(params.plan.what3wordsAddress)}</strong></span>` : ''}
      </div>
      <div style="text-align:center;margin:24px 0;">
        <a href="${escapeHtml(params.primaryUrl)}" style="display:inline-block;background:#27b45b;color:#fff;text-decoration:none;border-radius:999px;padding:14px 26px;font-weight:900;">${escapeHtml(params.primaryLabel)}</a>
      </div>
      <p style="font-size:13px;text-align:center;color:#718078;margin:0;">
        <a href="${escapeHtml(params.mapsUrl)}" style="color:#0d3823;font-weight:800;">Google Maps</a>
        ${params.wordsUrl ? ` · <a href="${escapeHtml(params.wordsUrl)}" style="color:#0d3823;font-weight:800;">Exact spot</a>` : ''}
      </p>
    </div>
  </div>`;
}

function extractWhat3WordsAddress(values: unknown[]): string {
  for (const value of values) {
    const candidate = text(value, 2000);
    if (!candidate) {
      continue;
    }
    const url = candidate.match(/https?:\/\/(?:www\.)?(?:what3words\.com|w3w\.co)\/([a-z]+(?:\.[a-z]+){2})/i);
    const slashed = candidate.match(/\/\/\/([a-z]+(?:\.[a-z]+){2})/i);
    const normalized = normalizeWordsCandidate(url?.[1] || slashed?.[1] || candidate);
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function normalizeWordsCandidate(value: unknown): string {
  const candidate = text(value, 240)
    .replace(/^https?:\/\/(?:www\.)?(?:what3words\.com|w3w\.co)\//i, '')
    .replace(/^\/+/, '')
    .split(/[?#\s]/)[0]
    ?.toLowerCase() ?? '';
  return /^[a-z]+(?:\.[a-z]+){2}$/.test(candidate) ? candidate : '';
}

function safeGoogleMapsUrl(value: unknown): string {
  const candidate = safeHttpsUrl(value);
  if (!candidate) {
    return '';
  }
  try {
    const hostname = new URL(candidate).hostname.toLowerCase();
    return hostname === 'google.com'
      || hostname.endsWith('.google.com')
      || hostname === 'goo.gl'
      || hostname === 'maps.app.goo.gl'
      ? candidate
      : '';
  } catch {
    return '';
  }
}

function safeHttpsUrl(value: unknown): string {
  const candidate = text(value, 2000);
  if (!candidate) {
    return '';
  }
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch {
    return '';
  }
}

function coordinate(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function nonNegativeInteger(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, limit)
    : '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeFilename(value: string): string {
  const normalized = value.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').slice(0, 90);
  return normalized || 'livingwiki-plan.ics';
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function icsUtc(value: Date): string {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
