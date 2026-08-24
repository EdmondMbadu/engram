export type BoardPhotoStoryMode = 'generate' | 'blank';

export type BoardPhotoStorySource = {
  imageUrl: string;
};

export type BoardPhotoStoryGeneratedCopy = {
  title?: string;
  subtitle?: string;
  notes?: string;
  short_summary?: string;
};

export type BoardPhotoStoryDraft = {
  title: string;
  subtitle: string;
  notes: string;
  shortSummary: string;
  imageUrl: string;
};

/**
 * Aligns generated copy to the selected photo order and supplies a deliberately
 * blank, editable fallback for every photo the generator did not return.
 */
export function buildBoardPhotoStoryDrafts(
  photos: readonly BoardPhotoStorySource[],
  generated: readonly BoardPhotoStoryGeneratedCopy[] = [],
): BoardPhotoStoryDraft[] {
  return photos.map((photo, index) => {
    const copy = generated[index];
    return {
      title: copy?.title?.trim() || `Photo ${index + 1}`,
      subtitle: copy?.subtitle?.trim() || '',
      notes: copy?.notes?.trim() || '',
      shortSummary: copy?.short_summary?.trim() || '',
      imageUrl: photo.imageUrl,
    };
  });
}

export function isBoardPhotoStudioDraft(board: {
  visibility: string;
  photoStudioDraft?: boolean;
}): boolean {
  return board.visibility === 'private' && board.photoStudioDraft === true;
}

export function isBoardPhotoStory(board: {
  photoStoryBoard?: boolean;
  backNote?: string;
}): boolean {
  return board.photoStoryBoard === true
    || /started with the livingwiki wizard from photos input\.?/i.test(board.backNote ?? '');
}

export function shouldOpenBoardPhotoStoryStudio(state: {
  mode: string;
  targetBoardId: string;
  lockedTargetBoardId?: string | null;
  contributionBoardId?: string | null;
}): boolean {
  return state.mode === 'photos'
    && state.targetBoardId === 'new'
    && !state.lockedTargetBoardId
    && !state.contributionBoardId;
}
