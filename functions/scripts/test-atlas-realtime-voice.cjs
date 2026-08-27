const assert = require('node:assert/strict');
const { selectAtlasRealtimeVoice } = require('../lib/atlas-realtime-voice.js');

const clearDefault = {
  voiceId: 'clear-default',
  name: 'Warm Storyteller',
  available: true,
};

assert.deepEqual(
  selectAtlasRealtimeVoice({
    overridesEnabled: true,
    accent: 'American',
    wikiVoice: { voiceId: 'george', name: 'George Washington', available: true },
    globalDefaultVoice: clearDefault,
  }),
  {
    voiceId: 'george',
    name: 'George Washington',
    accent: 'American',
    score: Number.MAX_SAFE_INTEGER,
    source: 'wiki',
  },
);

assert.deepEqual(
  selectAtlasRealtimeVoice({
    overridesEnabled: true,
    accent: 'American',
    wikiVoice: { voiceId: null, name: null, available: false },
    globalDefaultVoice: clearDefault,
  }),
  {
    voiceId: 'clear-default',
    name: 'Warm Storyteller',
    accent: 'American',
    score: Number.MAX_SAFE_INTEGER,
    source: 'global-default',
  },
);

assert.equal(
  selectAtlasRealtimeVoice({
    overridesEnabled: false,
    accent: null,
    wikiVoice: { voiceId: 'george', name: 'George Washington', available: true },
    globalDefaultVoice: clearDefault,
  }),
  null,
);

assert.equal(
  selectAtlasRealtimeVoice({
    overridesEnabled: true,
    accent: null,
    wikiVoice: { voiceId: 'unavailable-custom', name: 'Unavailable', available: false },
    globalDefaultVoice: { ...clearDefault, available: false },
  }),
  null,
);

console.log('Atlas realtime voice isolation checks passed.');
