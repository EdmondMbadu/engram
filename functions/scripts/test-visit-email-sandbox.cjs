const assert = require('node:assert/strict');
const sgMail = require('@sendgrid/mail');
const {
  buildVisitPlanEmail,
  buildVisitInvitationEmail,
  visitPlanEmailAttachments,
} = require('../lib/visit-plans.js');

const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  throw new Error('SENDGRID_API_KEY is required.');
}

const plan = {
  id: 'vp_sendgrid_sandbox',
  organizerName: 'LivingWiki',
  organizerEmail: 'missioncontrol@rocketgoals.com',
  boardId: 'sandbox-board',
  boardTitle: 'Sandbox board',
  cardId: 'sandbox-card',
  placeName: 'SendGrid validation place',
  placeAddress: 'Validation only — no email will be delivered',
  imageUrl: '',
  googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=36.6177%2C-121.9005',
  locationLat: null,
  locationLng: null,
  what3wordsAddress: 'candy.sage.sticks',
  startsAtIso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  timezone: 'UTC',
  status: 'planned',
};
const emails = [
  buildVisitInvitationEmail(
    plan,
    'https://livingwiki.com/go/sendgrid-sandbox-validation',
  ),
  buildVisitPlanEmail(plan, 'updated'),
];

sgMail.setApiKey(apiKey);
Promise.all(emails.map((email, index) => sgMail.send({
  to: `visit-email-validation-${index + 1}@example.com`,
  from: {
    email: 'missioncontrol@rocketgoals.com',
    name: 'LivingWiki',
  },
  subject: email.subject,
  text: email.text,
  html: email.html,
  attachments: visitPlanEmailAttachments(email),
  mailSettings: {
    sandboxMode: {
      enable: true,
    },
  },
}))).then((responses) => {
  for (const [response] of responses) {
    assert.equal(response.statusCode, 200);
  }
  console.log('SendGrid accepted the invitation and confirmation email payloads in sandbox mode; no email was delivered.');
}).catch((error) => {
  const details = error?.response?.body?.errors ?? error?.message ?? error;
  console.error(details);
  process.exitCode = 1;
});
