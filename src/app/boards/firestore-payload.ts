/**
 * Firestore rejects `undefined` anywhere in a document, including nested card
 * objects. Remove undefined object properties and array entries immediately
 * before writing while preserving nulls and Firestore sentinel values.
 */
export function omitUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => omitUndefinedDeep(item)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (nestedValue !== undefined) {
      result[key] = omitUndefinedDeep(nestedValue);
    }
  }
  return result as T;
}

/**
 * City publication metadata is privileged and Firestore rejects it on a
 * personal board create. Omit empty values entirely instead of serializing
 * them as null so ordinary wizard saves cannot look like city-publisher
 * writes to the security rules.
 */
export function boardCityMetadataForFirestore(
  atlasId: unknown,
  generatedForAtlasId: unknown,
): Record<string, string> {
  const metadata: Record<string, string> = {};
  const normalizedAtlasId = typeof atlasId === 'string' ? atlasId.trim() : '';
  const normalizedGeneratedForAtlasId = typeof generatedForAtlasId === 'string'
    ? generatedForAtlasId.trim()
    : '';

  if (normalizedAtlasId) {
    metadata['atlas_id'] = normalizedAtlasId;
  }
  if (normalizedGeneratedForAtlasId) {
    metadata['generated_for_atlas_id'] = normalizedGeneratedForAtlasId;
  }

  return metadata;
}

export const FIRESTORE_BOARD_DESCRIPTION_MAX_LENGTH = 240;

/**
 * Keep every board-writing path aligned with the Firestore board validator.
 * Generators and importers may retain longer source copy for cards, but the
 * board-level description is deliberately compact and capped by the rules.
 */
export function boardDescriptionForFirestore(value: unknown): string {
  return (typeof value === 'string' ? value : '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FIRESTORE_BOARD_DESCRIPTION_MAX_LENGTH);
}
