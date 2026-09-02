export type ListingCardPresentation = {
  kind: 'listing-group';
  groupKey: string;
  label: string;
  confidence: number;
  reviewStatus: 'verified' | 'needs-review';
  sourcePhotoCount: number;
  presentationImageUrls: string[];
};

type ListingPresentationCardLike = {
  imageUrl?: string | null;
  imageUrls?: readonly string[] | null;
  listingPresentation?: ListingCardPresentation | null;
};

const MAX_LISTING_PRESENTATION_IMAGES = 4;

function uniqueUrls(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const url = typeof value === 'string' ? value.trim() : '';
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [url];
  });
}

export function normalizeListingCardPresentation(value: unknown): ListingCardPresentation | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record['kind'] !== 'listing-group') return null;
  const groupKey = typeof record['groupKey'] === 'string' ? record['groupKey'].trim().slice(0, 40) : '';
  const label = typeof record['label'] === 'string' ? record['label'].trim().slice(0, 80) : '';
  if (!groupKey || !label) return null;
  const rawConfidence = typeof record['confidence'] === 'number' ? record['confidence'] : 0;
  const rawCount = typeof record['sourcePhotoCount'] === 'number' ? record['sourcePhotoCount'] : 0;
  return {
    kind: 'listing-group',
    groupKey,
    label,
    confidence: Math.max(0, Math.min(1, Number.isFinite(rawConfidence) ? rawConfidence : 0)),
    reviewStatus: record['reviewStatus'] === 'needs-review' ? 'needs-review' : 'verified',
    sourcePhotoCount: Math.max(0, Math.min(100, Math.trunc(Number.isFinite(rawCount) ? rawCount : 0))),
    presentationImageUrls: uniqueUrls(
      Array.isArray(record['presentationImageUrls'])
        ? record['presentationImageUrls'].filter((url): url is string => typeof url === 'string')
        : [],
    ).slice(0, MAX_LISTING_PRESENTATION_IMAGES),
  };
}

/**
 * Live View and generated video share this exact visual plan. Legacy and
 * ordinary multi-photo cards intentionally remain one-cover chapters.
 */
export function listingCardPresentationImages(card: ListingPresentationCardLike): string[] {
  const cover = typeof card.imageUrl === 'string' ? card.imageUrl : '';
  const presentation = card.listingPresentation;
  if (!presentation || presentation.kind !== 'listing-group') {
    return uniqueUrls([cover]).slice(0, 1);
  }
  const allowed = new Set(uniqueUrls([cover, ...(card.imageUrls ?? [])]));
  const selected = uniqueUrls(presentation.presentationImageUrls)
    .filter((url) => allowed.has(url));
  return uniqueUrls([cover, ...selected]).slice(0, MAX_LISTING_PRESENTATION_IMAGES);
}

export function isListingGroupCard(card: ListingPresentationCardLike | null | undefined): boolean {
  return card?.listingPresentation?.kind === 'listing-group';
}
