import {
  boardCollectionFromData,
  boardCollectionOwnerParts,
  boardCollectionSlug,
} from './board-collections.service';

describe('board collections', () => {
  it('creates stable URL slugs', () => {
    expect(boardCollectionSlug('  Montréal Food & Music!  ')).toBe('montreal-food-music');
    expect(boardCollectionSlug('***')).toBe('collection');
  });

  it('reads owner handles with and without a uid suffix', () => {
    expect(boardCollectionOwnerParts('edmond-mbadu')).toEqual({ uid: '', slug: 'edmond-mbadu' });
    expect(boardCollectionOwnerParts('Edmond%20Mbadu~abc123')).toEqual({ uid: 'abc123', slug: 'edmond-mbadu' });
  });

  it('normalizes a public collection record and preserves board order', () => {
    const result = boardCollectionFromData('collection-1', {
      owner_user_id: 'owner-1',
      owner_public_slug: 'owner-one',
      owner_display_name: 'Owner One',
      owner_photo_url: '',
      owner_profile_icon: 'person',
      owner_profile_picture_type: 'icon',
      slug: 'favorite-places',
      visibility: 'public',
      title: 'Favorite Places',
      description: 'Three boards in a deliberate order.',
      board_ids: ['third', 'first', 'second', 'third'],
      created_at_iso: '2026-08-13T00:00:00.000Z',
      updated_at_iso: '2026-08-13T01:00:00.000Z',
    });

    expect(result?.boardIds).toEqual(['third', 'first', 'second']);
    expect(result?.title).toBe('Favorite Places');
  });

  it('rejects private or empty collections', () => {
    expect(boardCollectionFromData('collection-1', {
      owner_user_id: 'owner-1',
      owner_public_slug: 'owner-one',
      slug: 'private-list',
      visibility: 'private',
      title: 'Private list',
      board_ids: ['one'],
    })).toBeNull();
    expect(boardCollectionFromData('collection-1', {
      owner_user_id: 'owner-1',
      owner_public_slug: 'owner-one',
      slug: 'empty-list',
      visibility: 'public',
      title: 'Empty list',
      board_ids: [],
    })).toBeNull();
  });
});
