const assert = require('node:assert/strict');

const {
  buildAtlasIdentityInstruction,
  normalizeAtlasResponsePerspective,
  normalizeAtlasWikiType,
  resolveAtlasResponsePerspective,
} = require('../lib/atlas-identity.js');

assert.equal(normalizeAtlasWikiType('person'), 'person');
assert.equal(normalizeAtlasWikiType(undefined, { hasCityConfig: true }), 'city');
assert.equal(normalizeAtlasWikiType(undefined, { hasUniversityConfig: true }), 'university');
assert.equal(normalizeAtlasWikiType(undefined), 'topic');
assert.equal(normalizeAtlasResponsePerspective('first_person'), 'first_person');
assert.equal(normalizeAtlasResponsePerspective('unexpected'), 'auto');
assert.equal(resolveAtlasResponsePerspective('person', 'auto'), 'first_person');
assert.equal(resolveAtlasResponsePerspective('city', 'auto'), 'third_person');
assert.equal(resolveAtlasResponsePerspective('person', 'third_person'), 'third_person');

const person = buildAtlasIdentityInstruction({
  atlasName: 'George Washington',
  guideName: 'George Washington',
  wikiType: 'person',
  configuredPerspective: 'auto',
});
assert.equal(person.effectivePerspective, 'first_person');
assert.match(person.instruction, /Speak as George Washington in the first person/);
assert.match(person.instruction, /Use I, me, my, and mine/);
assert.match(person.instruction, /never permits invented memories/i);

const city = buildAtlasIdentityInstruction({
  atlasName: 'Philadelphia',
  guideName: 'Philadelphia Guide',
  wikiType: 'city',
  configuredPerspective: 'auto',
});
assert.equal(city.effectivePerspective, 'third_person');
assert.match(city.instruction, /guide about Philadelphia in the third person/);
assert.match(city.instruction, /do not claim to literally be Philadelphia/i);
assert.match(city.instruction, /Do not use I, me, my, or mine for the subject/);

console.log('atlas identity tests passed');
