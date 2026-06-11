export type ProfileIconPreset = {
  code: string;
  label: string;
  icon: string;
  from: string;
  to: string;
  ink: string;
};

export const PROFILE_ICON_PRESETS: ProfileIconPreset[] = [
  {
    code: 'city-scribe',
    label: 'City Scribe',
    icon: 'edit_note',
    from: '#dffcf7',
    to: '#fff0b8',
    ink: '#007f7a',
  },
  {
    code: 'local-orbit',
    label: 'Local Orbit',
    icon: 'orbit',
    from: '#ddeeff',
    to: '#daf8c8',
    ink: '#1f62c8',
  },
  {
    code: 'knowledge-map',
    label: 'Knowledge Map',
    icon: 'travel_explore',
    from: '#ffe2d7',
    to: '#dff7ff',
    ink: '#d94d2b',
  },
  {
    code: 'story-light',
    label: 'Story Light',
    icon: 'emoji_objects',
    from: '#fff0b8',
    to: '#f0e4ff',
    ink: '#9a6500',
  },
  {
    code: 'green-root',
    label: 'Green Root',
    icon: 'eco',
    from: '#daf8c8',
    to: '#dffcf7',
    ink: '#28853c',
  },
  {
    code: 'archive-star',
    label: 'Archive Star',
    icon: 'auto_stories',
    from: '#f0e4ff',
    to: '#ddeeff',
    ink: '#7c3ec8',
  },
  {
    code: 'public-pulse',
    label: 'Public Pulse',
    icon: 'public',
    from: '#dff7ff',
    to: '#ffe2d7',
    ink: '#087b99',
  },
  {
    code: 'market-signal',
    label: 'Market Signal',
    icon: 'storefront',
    from: '#fff0b8',
    to: '#ffe2d7',
    ink: '#d94d2b',
  },
];

export function profileIconByCode(code: string | null | undefined): ProfileIconPreset | null {
  return PROFILE_ICON_PRESETS.find((preset) => preset.code === code) ?? null;
}

export function profileIconForSeed(seed: string | null | undefined): ProfileIconPreset {
  const source = seed?.trim() || 'living-wiki';
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return PROFILE_ICON_PRESETS[hash % PROFILE_ICON_PRESETS.length] ?? PROFILE_ICON_PRESETS[0];
}
