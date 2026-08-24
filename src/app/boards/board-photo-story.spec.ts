import {
  buildBoardPhotoStoryDrafts,
  isBoardPhotoStory,
  isBoardPhotoStudioDraft,
  shouldOpenBoardPhotoStoryStudio,
} from './board-photo-story';

describe('photo story drafts', () => {
  const photos = [
    { imageUrl: 'first-photo' },
    { imageUrl: 'second-photo' },
    { imageUrl: 'third-photo' },
  ];

  it('creates one blank, sequentially titled story per photo', () => {
    const drafts = buildBoardPhotoStoryDrafts(photos);

    expect(drafts.map((draft) => draft.title)).toEqual(['Photo 1', 'Photo 2', 'Photo 3']);
    expect(drafts.map((draft) => draft.imageUrl)).toEqual(['first-photo', 'second-photo', 'third-photo']);
    expect(drafts.every((draft) => draft.subtitle === '' && draft.notes === '' && draft.shortSummary === '')).toBeTrue();
  });

  it('keeps generated titles and stories paired with their original photos', () => {
    const drafts = buildBoardPhotoStoryDrafts(photos, [
      { title: 'Opening whistle', notes: 'The team gathers before the match.' },
      { title: 'On the pitch', notes: 'The first attack begins.' },
      { title: 'Together afterward', notes: 'The team celebrates the day.' },
    ]);

    expect(drafts.map(({ title, notes, imageUrl }) => ({ title, notes, imageUrl }))).toEqual([
      { title: 'Opening whistle', notes: 'The team gathers before the match.', imageUrl: 'first-photo' },
      { title: 'On the pitch', notes: 'The first attack begins.', imageUrl: 'second-photo' },
      { title: 'Together afterward', notes: 'The team celebrates the day.', imageUrl: 'third-photo' },
    ]);
  });

  it('falls back safely for missing or unusable generated copy without dropping photos', () => {
    const drafts = buildBoardPhotoStoryDrafts(photos, [
      { title: '  Team arrival  ', notes: '  Everyone walks onto the field.  ' },
      { title: '   ', subtitle: '   ', notes: '   ', short_summary: '   ' },
    ]);

    expect(drafts).toEqual([
      {
        title: 'Team arrival',
        subtitle: '',
        notes: 'Everyone walks onto the field.',
        shortSummary: '',
        imageUrl: 'first-photo',
      },
      { title: 'Photo 2', subtitle: '', notes: '', shortSummary: '', imageUrl: 'second-photo' },
      { title: 'Photo 3', subtitle: '', notes: '', shortSummary: '', imageUrl: 'third-photo' },
    ]);
  });

  it('ignores extra generated stories so the uploaded photo count remains authoritative', () => {
    const drafts = buildBoardPhotoStoryDrafts(photos.slice(0, 1), [
      { title: 'Only selected photo' },
      { title: 'Unexpected extra story' },
    ]);

    expect(drafts.map((draft) => draft.title)).toEqual(['Only selected photo']);
  });

  it('marks only private photo Studio boards as unpublished drafts', () => {
    expect(isBoardPhotoStudioDraft({ visibility: 'private', photoStudioDraft: true })).toBeTrue();
    expect(isBoardPhotoStudioDraft({ visibility: 'public', photoStudioDraft: true })).toBeFalse();
    expect(isBoardPhotoStudioDraft({ visibility: 'private', photoStudioDraft: false })).toBeFalse();
    expect(isBoardPhotoStudioDraft({ visibility: 'private' })).toBeFalse();
  });

  it('recognizes current and legacy photo-story boards without matching unrelated boards', () => {
    expect(isBoardPhotoStory({ photoStoryBoard: true })).toBeTrue();
    expect(isBoardPhotoStory({
      backNote: 'Started with the LivingWiki Wizard from photos input.',
    })).toBeTrue();
    expect(isBoardPhotoStory({
      backNote: 'Started with the LivingWiki Wizard from describe input.',
    })).toBeFalse();
    expect(isBoardPhotoStory({ photoStoryBoard: false })).toBeFalse();
  });

  it('routes only new standalone photo boards directly into Studio', () => {
    expect(shouldOpenBoardPhotoStoryStudio({
      mode: 'photos',
      targetBoardId: 'new',
    })).toBeTrue();
    expect(shouldOpenBoardPhotoStoryStudio({
      mode: 'photos',
      targetBoardId: 'existing-board',
    })).toBeFalse();
    expect(shouldOpenBoardPhotoStoryStudio({
      mode: 'photos',
      targetBoardId: 'new',
      lockedTargetBoardId: 'existing-board',
    })).toBeFalse();
    expect(shouldOpenBoardPhotoStoryStudio({
      mode: 'describe',
      targetBoardId: 'new',
    })).toBeFalse();
  });
});
