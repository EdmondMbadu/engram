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
