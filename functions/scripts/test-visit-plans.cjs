const assert = require('node:assert/strict');
const {
  buildVisitGuestPage,
  buildVisitPlanIcs,
  buildVisitPlanEmail,
  isVisitableBoardCard,
  normalizeVisitPlanEmails,
  normalizeVisitStart,
  normalizeVisitTimezone,
  visitPlanDocumentId,
  visitMapsUrl,
  visitPlanEmailAttachments,
  visitReminderAtMs,
} = require('../lib/visit-plans.js');

assert.equal(isVisitableBoardCard({
  type: 'place',
  entityType: 'place',
  what3wordsAddress: 'candy.sage.sticks',
}), true);
assert.equal(isVisitableBoardCard({
  type: 'place',
  entityType: 'place',
  mediaKind: 'song',
  googleMapsUrl: 'https://maps.google.com/',
}), false);
assert.equal(isVisitableBoardCard({
  type: 'shop',
  entityType: 'product',
  googleMapsUrl: 'https://maps.google.com/',
}), false);

assert.deepEqual(
  normalizeVisitPlanEmails(['SAM@example.com', 'sam@example.com', 'maya@example.org', 'bad']),
  ['sam@example.com', 'maya@example.org'],
);

const now = Date.parse('2026-07-27T20:00:00.000Z');
const start = normalizeVisitStart('2026-07-27T23:00:00.000Z', now);
assert.equal(start.iso, '2026-07-27T23:00:00.000Z');
assert.equal(visitReminderAtMs(start.ms, now), Date.parse('2026-07-27T22:00:00.000Z'));
assert.equal(visitReminderAtMs(Date.parse('2026-07-27T20:30:00.000Z'), now), null);
assert.throws(() => normalizeVisitStart('2026-07-27T19:00:00.000Z', now));
assert.equal(normalizeVisitTimezone('America/Los_Angeles'), 'America/Los_Angeles');
assert.equal(normalizeVisitTimezone('Invalid/Timezone'), 'UTC');
assert.equal(
  visitPlanDocumentId('user', 'board', 'card'),
  visitPlanDocumentId('user', 'board', 'card'),
);

const plan = {
  id: 'vp_test',
  organizerName: 'Edmond',
  organizerEmail: 'edmond@example.com',
  boardId: 'board-one',
  boardTitle: 'Cannery Row',
  cardId: 'card-one',
  placeName: 'Steinbeck Plaza',
  placeAddress: 'Cannery Row, Monterey, CA',
  imageUrl: 'https://example.com/place.jpg',
  googleMapsUrl: 'https://maps.google.com/?q=Steinbeck+Plaza',
  locationLat: 36.6177,
  locationLng: -121.9017,
  what3wordsAddress: 'candy.sage.sticks',
  startsAtIso: '2026-07-28T17:00:00.000Z',
  timezone: 'America/Los_Angeles',
  status: 'planned',
};
const ics = buildVisitPlanIcs(plan, 'confirmed');
assert.match(ics, /BEGIN:VALARM/);
assert.match(ics, /TRIGGER:-PT1H/);
assert.match(ics, /UID:vp_test@livingwiki.com/);
const attachments = visitPlanEmailAttachments({
  subject: 'Test',
  text: 'Test',
  html: '<p>Test</p>',
  calendar: { content: ics, filename: 'test.ics' },
});
assert.equal(attachments.length, 1);
assert.equal(attachments[0].type, 'text/calendar');
assert.equal(attachments[0].type.includes(';'), false);
assert.equal(Buffer.from(attachments[0].content, 'base64').toString('utf8'), ics);
const confirmationEmail = buildVisitPlanEmail(plan, 'updated');
assert.match(
  confirmationEmail.html,
  /href="https:\/\/what3words\.com\/candy\.sage\.sticks"[^>]*><strong>\/\/\/candy\.sage\.sticks<\/strong>/,
);
assert.match(confirmationEmail.html, />Google Maps<\/a>/);
assert.match(confirmationEmail.html, />Exact spot · \/\/\/candy\.sage\.sticks<\/a>/);

const guestPage = buildVisitGuestPage({
  plan,
  invitationUrl: 'https://livingwiki.com/go/token',
  responseStatus: 'pending',
});
assert.match(guestPage, /I'm in/);
assert.match(guestPage, /Google Maps/);
assert.match(guestPage, /\/\/\/candy\.sage\.sticks/);
assert.doesNotMatch(guestPage, /<script/);
assert.match(visitMapsUrl({ ...plan, googleMapsUrl: '' }), /36\.6177%2C-121\.9017/);

console.log('Visit plan tests passed.');
