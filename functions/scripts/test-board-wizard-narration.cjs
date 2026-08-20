const assert = require('node:assert/strict');
const {
  boardNarrationFallbackDescription,
  boardNarrationFallbackNotes,
  boardNarrationPromptInstructions,
  defaultBoardNarrationStyleId,
  normalizeBoardNarrationStyle,
} = require('../lib/board-wizard-narration.js');
const {
  boardNarrationLengthPromptInstructions,
  boardNarrationTargetWords,
  normalizeBoardNarrationSeconds,
} = require('../lib/board-narration-length.js');

assert.equal(defaultBoardNarrationStyleId, 'storyteller');
assert.equal(normalizeBoardNarrationStyle(undefined), 'storyteller');
assert.equal(normalizeBoardNarrationStyle('unknown'), 'storyteller');
assert.equal(normalizeBoardNarrationStyle('teen-perspective'), 'teen-perspective');

const personal = boardNarrationPromptInstructions('personal-story');
assert.match(personal, /first-person perspective/i);
assert.match(personal, /board\.description/i);
assert.match(personal, /every card\.notes/i);
assert.match(personal, /Never invent personal memories/i);

const teen = boardNarrationPromptInstructions('teen-perspective');
assert.match(teen, /first-person teen perspective/i);
assert.match(teen, /without forced slang/i);

const guided = boardNarrationPromptInstructions('guided-tour');
assert.match(guided, /second-person guide/i);

const documentary = boardNarrationPromptInstructions('documentary');
assert.match(documentary, /objective third-person documentary/i);

assert.match(
  boardNarrationFallbackDescription('teen-perspective', 'Summer Festivals', 'Five celebrations worth seeing.'),
  /^Here’s my take on Summer Festivals/i,
);
assert.match(
  boardNarrationFallbackNotes('guided-tour', 'Main Stage', 'Live music begins at noon.'),
  /^Take a closer look at Main Stage/i,
);
assert.equal(
  boardNarrationFallbackDescription('storyteller', 'Summer Festivals', 'Five celebrations worth seeing.'),
  'Five celebrations worth seeing.',
);

assert.equal(normalizeBoardNarrationSeconds(undefined), 30);
assert.equal(normalizeBoardNarrationSeconds(43), 45);
assert.equal(normalizeBoardNarrationSeconds(240), 180);
assert.equal(boardNarrationTargetWords(5), 12);
assert.equal(boardNarrationTargetWords(30), 71);
assert.equal(boardNarrationTargetWords(180), 423);
assert.match(boardNarrationLengthPromptInstructions(30), /approximately 71 spoken words/i);
assert.match(boardNarrationLengthPromptInstructions(5), /one crisp, self-contained sentence/i);

console.log('Board wizard narration checks passed.');
