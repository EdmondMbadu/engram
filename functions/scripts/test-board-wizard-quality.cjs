const assert = require('node:assert/strict');
const {
  wikipediaPageTitleMatchScore,
} = require('../lib/board-wizard-image-quality.js');
const {
  shouldGroundAndVerifyBoardWizardBatch,
} = require('../lib/board-wizard-generation-quality.js');

const score = (query, pageTitle, candidates) =>
  wikipediaPageTitleMatchScore(query, pageTitle, candidates);

assert.ok(score('Marie Curie physicist portrait', 'Marie Curie', ['Marie Curie']) >= 80);
assert.equal(score('Marie Curie physicist portrait', 'Pierre Curie', ['Marie Curie']), 0);
assert.equal(score('Ada Lovelace portrait', 'Augusta Leigh', ['Ada Lovelace']), 0);
assert.ok(score('Titanic 1997 official movie poster', 'Titanic (1997 film)', ['Titanic (1997 film)', 'Titanic']) >= 80);
assert.equal(score('Titanic 1997 official movie poster', 'Titanic museum', ['Titanic (1997 film)']), 0);
assert.ok(score('Beatles band portrait', 'The Beatles', ['The Beatles']) >= 80);
assert.equal(score('Beatles band portrait', 'Beatles Ashram', ['The Beatles']), 0);

const shouldVerify = (prompt, count = 12, mode = 'describe') =>
  shouldGroundAndVerifyBoardWizardBatch({ mode, prompt, count });
assert.equal(shouldVerify('complete chronological list of a real-world set'), true);
assert.equal(shouldVerify('list of historical scientists with pictures'), true);
assert.equal(shouldVerify('all championship winners in order'), true);
assert.equal(shouldVerify('twenty independent items', 20), true);
assert.equal(shouldVerify('five creative taco ideas', 5), false);
assert.equal(shouldVerify('complete list from this source URL', 30, 'url'), false);

console.log('Board wizard image-quality tests passed.');
