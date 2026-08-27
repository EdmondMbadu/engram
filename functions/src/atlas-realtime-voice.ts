export type AtlasRealtimeVoiceSelection = {
  voiceId: string;
  name: string;
  accent: string | null;
  score: number;
  source: 'wiki' | 'global-default';
};

type VoiceCandidate = {
  voiceId: string | null;
  name: string | null;
  available: boolean;
};

export function selectAtlasRealtimeVoice(options: {
  overridesEnabled: boolean;
  accent: string | null;
  wikiVoice: VoiceCandidate;
  globalDefaultVoice: VoiceCandidate;
}): AtlasRealtimeVoiceSelection | null {
  if (!options.overridesEnabled) {
    return null;
  }

  if (options.wikiVoice.available && options.wikiVoice.voiceId) {
    return {
      voiceId: options.wikiVoice.voiceId,
      name: options.wikiVoice.name ?? 'LivingWiki voice',
      accent: options.accent,
      score: Number.MAX_SAFE_INTEGER,
      source: 'wiki',
    };
  }

  if (options.globalDefaultVoice.available && options.globalDefaultVoice.voiceId) {
    return {
      voiceId: options.globalDefaultVoice.voiceId,
      name: options.globalDefaultVoice.name ?? 'LivingWiki default voice',
      accent: options.accent,
      score: Number.MAX_SAFE_INTEGER,
      source: 'global-default',
    };
  }

  return null;
}
