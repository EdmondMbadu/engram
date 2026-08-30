export type AtlasWikiType = 'city' | 'person' | 'university' | 'organization' | 'topic';

export type AtlasResponsePerspective = 'auto' | 'first_person' | 'third_person';

export type AtlasEffectivePerspective = Exclude<AtlasResponsePerspective, 'auto'>;

export function normalizeAtlasWikiType(
  value: unknown,
  options: { hasCityConfig?: boolean; hasUniversityConfig?: boolean } = {},
): AtlasWikiType {
  if (
    value === 'city'
    || value === 'person'
    || value === 'university'
    || value === 'organization'
    || value === 'topic'
  ) {
    return value;
  }
  if (options.hasUniversityConfig) return 'university';
  if (options.hasCityConfig) return 'city';
  return 'topic';
}

export function normalizeAtlasResponsePerspective(value: unknown): AtlasResponsePerspective {
  return value === 'first_person' || value === 'third_person' ? value : 'auto';
}

export function resolveAtlasResponsePerspective(
  wikiType: AtlasWikiType,
  configuredPerspective: AtlasResponsePerspective,
): AtlasEffectivePerspective {
  if (configuredPerspective === 'first_person' || configuredPerspective === 'third_person') {
    return configuredPerspective;
  }
  return wikiType === 'person' ? 'first_person' : 'third_person';
}

function subjectLabel(wikiType: AtlasWikiType): string {
  switch (wikiType) {
    case 'city': return 'city';
    case 'person': return 'person';
    case 'university': return 'university';
    case 'organization': return 'organization';
    default: return 'topic';
  }
}

export function buildAtlasIdentityInstruction(params: {
  atlasName: string | null;
  guideName?: string | null;
  wikiType: AtlasWikiType;
  configuredPerspective: AtlasResponsePerspective;
}): { effectivePerspective: AtlasEffectivePerspective; instruction: string } {
  const atlasName = params.atlasName?.trim() || params.guideName?.trim() || 'this wiki subject';
  const guideName = params.guideName?.trim() || atlasName;
  const effectivePerspective = resolveAtlasResponsePerspective(
    params.wikiType,
    params.configuredPerspective,
  );
  const label = subjectLabel(params.wikiType);

  const perspectiveRules = effectivePerspective === 'first_person'
    ? [
        `Speak as ${guideName} in the first person when discussing ${atlasName}.`,
        'Use I, me, my, and mine for the subject\'s documented actions, experiences, views, and possessions.',
        `Do not narrate ${atlasName} from the outside or repeatedly refer to ${atlasName} in the third person, except when quoting a source, distinguishing the historical record from personal recollection, or clarifying identity.`,
        'First-person voice never permits invented memories, private thoughts, quotations, experiences, or certainty unsupported by the available evidence.',
      ]
    : [
        `Speak as a knowledgeable guide about ${atlasName} in the third person.`,
        `Refer to ${atlasName} by name or with an appropriate ${label} reference; do not claim to literally be ${atlasName}.`,
        'Do not use I, me, my, or mine for the subject\'s actions, experiences, views, history, or possessions.',
        'First person may be used only for brief guide operations such as “I can explain,” never as the wiki subject.',
      ];

  return {
    effectivePerspective,
    instruction: [
      '=== RESPONSE PERSPECTIVE (system-defined; authoritative) ===',
      `Wiki subject: ${atlasName}. Subject type: ${label}.`,
      ...perspectiveRules,
      'Apply this perspective consistently in direct answers, headings, summaries, lists, follow-ups, and spoken responses.',
      '=== END RESPONSE PERSPECTIVE ===',
    ].join('\n'),
  };
}
