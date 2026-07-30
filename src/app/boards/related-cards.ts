export function legacyMemoryImages(
  imageUrl: string,
  imageUrls: readonly string[] = [],
  excludedUrls: readonly string[] = [],
): string[] {
  const seen = new Set<string>();
  const excluded = new Set(excludedUrls);
  const images = [imageUrl, ...imageUrls].filter((value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
  return images.slice(1).filter((value) => !excluded.has(value));
}

export function relatedCardCollectionLabel(
  explicitTypes: readonly string[],
  legacyMemoryCount: number,
): string {
  const count = explicitTypes.length + Math.max(0, legacyMemoryCount);
  const containsOnlyMemories = explicitTypes.every((type) => type === 'memory');
  if (containsOnlyMemories) {
    return `Explore ${count} ${count === 1 ? 'memory' : 'memories'}`;
  }
  return `Explore ${count} related ${count === 1 ? 'card' : 'cards'}`;
}
