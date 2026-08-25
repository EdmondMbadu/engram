export const MANUAL_CARD_PHOTO_LIMIT = 12;
export const VERIFIED_URL_LISTING_GALLERY_LIMIT = 100;

export type CardPhotoLimitInput = {
  imageSource?: unknown;
  sourceUrl?: unknown;
  tags?: unknown;
};

export function isVerifiedUrlListingGallery(input: CardPhotoLimitInput): boolean {
  if (input.imageSource !== 'source-page'
    || typeof input.sourceUrl !== 'string'
    || !/^https?:\/\//i.test(input.sourceUrl)) {
    return false;
  }
  const tags = Array.isArray(input.tags)
    ? input.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.toLowerCase())
    : [];
  return tags.includes('listing')
    && tags.includes('source-image')
    && tags.some((tag) => tag === 'real-estate' || tag === 'lodging');
}

export function cardPhotoLimit(input: CardPhotoLimitInput): number {
  return isVerifiedUrlListingGallery(input)
    ? VERIFIED_URL_LISTING_GALLERY_LIMIT
    : MANUAL_CARD_PHOTO_LIMIT;
}
