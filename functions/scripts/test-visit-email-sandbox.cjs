const assert = require('node:assert/strict');
const sgMail = require('@sendgrid/mail');
const {
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
  googleMapsUrl: 'https://www.google.com/maps',
  locationLat: null,
  locationLng: null,
  what3wordsAddress: '',
  startsAtIso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  timezone: 'UTC',
  status: 'planned',
};
const email = buildVisitInvitationEmail(
  plan,
  'https://livingwiki.com/go/sendgrid-sandbox-validation',
);

sgMail.setApiKey(apiKey);
sgMail.send({
  to: 'visit-email-validation@example.com',
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
}).then(([response]) => {
  assert.equal(response.statusCode, 200);
  console.log('SendGrid accepted the complete visit email payload in sandbox mode; no email was delivered.');
}).catch((error) => {
  const details = error?.response?.body?.errors ?? error?.message ?? error;
  console.error(details);
  process.exitCode = 1;
});
