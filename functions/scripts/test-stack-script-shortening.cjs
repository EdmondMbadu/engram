const assert = require('node:assert/strict');
const {
  deterministicStackScriptAdjustment,
  deterministicStackScriptShortening,
  normalizeStackScriptShortening,
  stackScriptSentenceCount,
} = require('../lib/stack-script-shortening');

const source = 'The home is listed at $799,900. It has four bedrooms. The kitchen opens to the dining area.';
assert.equal(stackScriptSentenceCount(source), 3);
assert.equal(
  deterministicStackScriptShortening(source, 2),
  'The home is listed at $799,900. It has four bedrooms.',
);

assert.equal(
  deterministicStackScriptAdjustment({
    narration: 'The home is listed at $799,900.',
    sourceNarration: source,
  }, 3),
  source,
);

assert.deepEqual(normalizeStackScriptShortening(
  [{ cardId: 'one', title: 'Overview', narration: source }],
  [{ cardId: 'one', narration: 'This home costs $200. It has four bedrooms.' }],
  2,
), [{ cardId: 'one', narration: 'The home is listed at $799,900. It has four bedrooms.' }]);

assert.deepEqual(normalizeStackScriptShortening(
  [{
    cardId: 'one',
    title: 'Overview',
    narration: 'The home is listed at $799,900.',
    sourceNarration: source,
  }],
  [{ cardId: 'one', narration: 'Listed at $799,900, this home offers four bedrooms. The kitchen opens to the dining area.' }],
  3,
), [{ cardId: 'one', narration: 'Listed at $799,900, this home offers four bedrooms. The kitchen opens to the dining area.' }]);

console.log('stack-script-shortening tests passed');
