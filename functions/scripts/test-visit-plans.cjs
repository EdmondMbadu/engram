const assert = require('node:assert/strict');
const {
  boardCardById,
  buildVisitGuestPage,
  buildVisitInterestAcknowledgementEmail,
  buildVisitInterestOwnerEmail,
  buildVisitJoinedEmail,
  buildVisitPlanIcs,
  buildVisitPlanEmail,
  isVisitableBoardCard,
  normalizeVisitPlanEmails,
  normalizeVisitStart,
  normalizeVisitTimezone,
  serializeVisitPlan,
  visitPlanDocumentId,
  visitMapsUrl,
  visitPlanEmailAttachments,
  visitReminderAtMs,
} = require('../lib/visit-plans.js');

const parentCard = {
  id: 'parent-card',
  relatedCards: [
    { id: 'related-place', title: 'Hidden garden' },
  ],
};
assert.equal(boardCardById([parentCard], 'parent-card').id, 'parent-card');
assert.equal(boardCardById([parentCard], 'related-place').title, 'Hidden garden');
assert.equal(boardCardById([parentCard], 'missing-card'), null);

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
const publicPlan = serializeVisitPlan({
  id: 'vp_test',
  board_id: 'board-one',
  card_id: 'card-one',
  place_name: 'Steinbeck Plaza',
  organizer_name: 'Edmond',
  starts_at_iso: plan.startsAtIso,
  timezone: plan.timezone,
  status: 'planned',
  open_to_board: true,
  invited_count: 4,
  accepted_count: 2,
  pending_count: 2,
});
assert.equal(publicPlan.organizerName, 'Edmond');
assert.equal(publicPlan.openToBoard, true);
const joinedEmail = buildVisitJoinedEmail(plan, 'https://livingwiki.com/go/token');
assert.match(joinedEmail.subject, /You're in/);
assert.match(joinedEmail.text, /View or change your response/);
assert.match(joinedEmail.html, /Let&#039;s go/);
const ownerInterestEmail = buildVisitInterestOwnerEmail({
  organizerName: 'Edmond',
  interestedName: 'Maya',
  placeName: plan.placeName,
  boardTitle: plan.boardTitle,
  boardUrl: 'https://livingwiki.com/boards/board-one?view=stack',
});
assert.match(ownerInterestEmail.subject, /Maya wants to go/);
assert.match(ownerInterestEmail.html, /Choose a time/);
const interestAcknowledgement = buildVisitInterestAcknowledgementEmail({
  interestedName: 'Maya',
  placeName: plan.placeName,
  boardTitle: plan.boardTitle,
  boardUrl: 'https://livingwiki.com/boards/board-one?view=stack',
});
assert.match(interestAcknowledgement.subject, /We'll let you know/);
assert.match(interestAcknowledgement.text, /email you an invitation/);

const guestPage = buildVisitGuestPage({
  plan,
  invitationUrl: 'https://livingwiki.com/go/token',
  responseStatus: 'pending',
});
assert.match(guestPage, /I'm in/);
assert.match(guestPage, /Google Maps/);
assert.match(guestPage, /\/\/\/candy\.sage\.sticks/);
assert.doesNotMatch(guestPage, /<script/);
const coordinateDirections = visitMapsUrl(plan);
assert.match(coordinateDirections, /^https:\/\/www\.google\.com\/maps\/dir\//);
assert.match(coordinateDirections, /destination=36\.6177%2C-121\.9017/);
assert.doesNotMatch(coordinateDirections, /place_id%3A/);
const legacyPlaceDirections = visitMapsUrl({
  ...plan,
  googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=place_id%3AChIJtest123',
  locationLat: null,
  locationLng: null,
});
assert.match(legacyPlaceDirections, /^https:\/\/www\.google\.com\/maps\/dir\//);
assert.match(legacyPlaceDirections, /destination=Steinbeck\+Plaza%2C\+Cannery\+Row/);
assert.match(legacyPlaceDirections, /destination_place_id=ChIJtest123/);
assert.doesNotMatch(legacyPlaceDirections, /place_id%3A/);

console.log('Visit plan tests passed.');
