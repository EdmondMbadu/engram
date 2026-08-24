import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const projectId = 'demo-living-wiki';
const ownerUid = 'board-owner';
let testEnvironment;

function personalWizardBoard(overrides = {}) {
  return {
    id: 'wizard-board-1',
    owner_user_id: ownerUid,
    owner_public_slug: 'board-owner',
    owner_display_name: 'Board Owner',
    owner_photo_url: '',
    owner_profile_icon: 'person',
    owner_profile_picture_type: 'icon',
    visibility: 'public',
    kind: 'standard',
    sortOrder: 0,
    title: 'My saved board',
    description: 'A board created through the wizard.',
    backNote: 'Created with LivingWiki.',
    icon: 'space_dashboard',
    tone: 'teal',
    imageUrl: '',
    logoUrl: '',
    logoLinkUrl: '',
    stackCtaLabel: '',
    stackCtaUrl: '',
    socialVideoUrl: '',
    socialVideoMimeType: '',
    socialVideoUpdatedAt: '',
    socialVideoRatio: 'vertical',
    socialVideoClosingHeadline: 'Keep exploring',
    socialVideoClosingMessage: 'Open the full board',
    socialVideoClosingShowQrCode: true,
    socialVideoClosingImage: 'cover',
    socialVideoClosingCustomImageUrl: '',
    socialVideoClosingDurationSeconds: 3,
    narrationSecondsPerCard: 30,
    stickers: [],
    cards: [],
    created_at_iso: '2026-08-12T00:00:00.000Z',
    updated_at_iso: '2026-08-12T00:00:00.000Z',
    server_updated_at: serverTimestamp(),
    ...overrides,
  };
}

function publicBoardCollection(overrides = {}) {
  return {
    id: 'collection-1',
    slug: 'favorite-places',
    owner_user_id: ownerUid,
    owner_public_slug: 'board-owner',
    owner_display_name: 'Board Owner',
    owner_photo_url: '',
    owner_profile_icon: 'person',
    owner_profile_picture_type: 'icon',
    visibility: 'public',
    title: 'Favorite Places',
    description: 'A hand-picked set of public boards.',
    board_ids: ['wizard-board-1'],
    created_at_iso: '2026-08-13T00:00:00.000Z',
    updated_at_iso: '2026-08-13T00:00:00.000Z',
    server_updated_at: serverTimestamp(),
    ...overrides,
  };
}

function personalWizardDraft(overrides = {}) {
  return {
    id: 'media-draft-1',
    owner_user_id: ownerUid,
    mode: 'describe',
    target_board_id: 'new',
    locked_target_board_id: '',
    contribution_board_id: '',
    default_type: 'place',
    count: 12,
    vibe: 'curator',
    narration_style: 'storyteller',
    prompt: 'A carefully researched board',
    pasted_list: '',
    source_url: '',
    off_grid_name: '',
    off_grid_address: '',
    off_grid_tip: '',
    stack_cta_label: '',
    stack_cta_url: '',
    tour_voice_style: 'historian',
    tour_pace_or_style: 'Standard',
    tour_extras: [],
    result: {
      board: { title: 'Draft' },
      cards: [{ id: 'card-1', title: 'First card' }],
      wizard_preferences: { media_mode: 'images' },
    },
    selected_card_ids: ['card-1'],
    created_at_iso: '2026-08-16T00:00:00.000Z',
    updated_at_iso: '2026-08-16T00:00:00.000Z',
    server_updated_at: serverTimestamp(),
    ...overrides,
  };
}

function videoLibraryRecord(overrides = {}) {
  return {
    id: 'board_wizard-board-1',
    owner_user_id: ownerUid,
    source_type: 'board',
    video_kind: 'full',
    source_id: 'wizard-board-1',
    source_title: 'My saved board',
    source_route: '/boards/wizard-board-1',
    source_updated_at_iso: '2026-08-23T00:00:00.000Z',
    poster_url: '',
    video_url: 'https://example.com/phone.mp4',
    storage_path: 'users/board-owner/video-library/boards/wizard-board-1/full/vertical/render.mp4',
    public_storage_path: '',
    public_share_url: '',
    mime_type: 'video/mp4',
    ratio: 'vertical',
    duration_seconds: 24,
    render_version: 'stack-video-v14',
    narration_enabled: true,
    generated_at_iso: '2026-08-23T00:00:00.000Z',
    updated_at_iso: '2026-08-23T00:00:00.000Z',
    server_updated_at: serverTimestamp(),
    ...overrides,
  };
}

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, 'users', ownerUid), { role: 'member' });
    await setDoc(doc(database, 'users', ownerUid, 'board_wizard_drafts', 'wizard-board-1'), {
      id: 'wizard-board-1',
      owner_user_id: ownerUid,
    });
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

test('owner can atomically save a personal wizard board and remove its draft', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();
  const boardReference = doc(database, 'boards', 'wizard-board-1');
  const draftReference = doc(database, 'users', ownerUid, 'board_wizard_drafts', 'wizard-board-1');
  const batch = writeBatch(database);
  batch.set(boardReference, personalWizardBoard());
  batch.delete(draftReference);

  await assertSucceeds(batch.commit());

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    assert.equal((await getDoc(doc(context.firestore(), 'boards', 'wizard-board-1'))).exists(), true);
    assert.equal((await getDoc(doc(context.firestore(), 'users', ownerUid, 'board_wizard_drafts', 'wizard-board-1'))).exists(), false);
  });
});

test('personal board description boundary matches the client persistence contract', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();
  await assertSucceeds(setDoc(
    doc(database, 'boards', 'description-at-limit'),
    personalWizardBoard({ id: 'description-at-limit', description: 'x'.repeat(240) }),
  ));
  await assertFails(setDoc(
    doc(database, 'boards', 'description-over-limit'),
    personalWizardBoard({ id: 'description-over-limit', description: 'x'.repeat(241) }),
  ));
});

test('owner can stage a photo board privately in Studio and publish it later', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();
  const boardReference = doc(database, 'boards', 'wizard-board-1');
  const draftReference = doc(database, 'users', ownerUid, 'board_wizard_drafts', 'wizard-board-1');
  const privatePhotoDraft = personalWizardBoard({
    visibility: 'private',
    photoStoryBoard: true,
    photoStudioDraft: true,
    cards: [{ id: 'photo-1', title: 'Photo 1', notes: '', imageUrl: 'https://example.com/photo.jpg' }],
  });
  const batch = writeBatch(database);
  batch.set(boardReference, privatePhotoDraft);
  batch.delete(draftReference);

  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(boardReference));
  await assertFails(getDoc(doc(
    testEnvironment.authenticatedContext('different-user').firestore(),
    'boards',
    'wizard-board-1',
  )));

  await assertSucceeds(setDoc(boardReference, {
    ...privatePhotoDraft,
    cards: [{ id: 'photo-1', title: 'Opening day', notes: 'A finished narration.', imageUrl: 'https://example.com/photo.jpg' }],
    updated_at_iso: '2026-08-12T01:00:00.000Z',
    server_updated_at: serverTimestamp(),
  }));

  await assertSucceeds(setDoc(boardReference, {
    ...privatePhotoDraft,
    visibility: 'public',
    photoStudioDraft: false,
    updated_at_iso: '2026-08-12T02:00:00.000Z',
    server_updated_at: serverTimestamp(),
  }));
  await assertSucceeds(getDoc(doc(
    testEnvironment.unauthenticatedContext().firestore(),
    'boards',
    'wizard-board-1',
  )));
});

test('photo Studio exception cannot be used for an ordinary private board', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  await assertFails(setDoc(
    doc(database, 'boards', 'photo-draft-missing-story-flag'),
    personalWizardBoard({
      id: 'photo-draft-missing-story-flag',
      visibility: 'private',
      photoStudioDraft: true,
    }),
  ));
  await assertFails(setDoc(
    doc(database, 'boards', 'photo-draft-wrong-kind'),
    personalWizardBoard({
      id: 'photo-draft-wrong-kind',
      visibility: 'private',
      kind: 'walking-tour',
      photoStoryBoard: true,
      photoStudioDraft: true,
    }),
  ));
});

test('board narration length accepts supported timing and rejects out-of-range values', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  for (const seconds of [5, 30, 180]) {
    await assertSucceeds(setDoc(
      doc(database, 'boards', `narration-${seconds}`),
      personalWizardBoard({ id: `narration-${seconds}`, narrationSecondsPerCard: seconds }),
    ));
  }

  for (const seconds of [4, 181]) {
    await assertFails(setDoc(
      doc(database, 'boards', `narration-invalid-${seconds}`),
      personalWizardBoard({ id: `narration-invalid-${seconds}`, narrationSecondsPerCard: seconds }),
    ));
  }
});

test('owner can save each media preference without adding a top-level draft field', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  for (const mediaMode of ['images', 'mixed', 'videos']) {
    const draftId = `media-draft-${mediaMode}`;
    const payload = personalWizardDraft({
      id: draftId,
      result: {
        board: { title: 'Draft' },
        cards: [{ id: 'card-1', title: 'First card' }],
        wizard_preferences: { media_mode: mediaMode },
      },
    });
    assert.equal('media_mode' in payload, false);
    await assertSucceeds(setDoc(
      doc(database, 'users', ownerUid, 'board_wizard_drafts', draftId),
      payload,
    ));
  }
});

test('nearby gems drafts and boards save without persisting an origin', async () => {
  const generationGrantId = 'nearby-generation-grant-123456';
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'nearby_gem_generation_grants', generationGrantId), {
      owner_user_id: ownerUid,
      board_id: 'nearby-gems-draft',
      expires_at: new Date('2099-01-01T00:00:00.000Z'),
    });
  });
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();
  const draftId = 'nearby-gems-draft';
  const draft = personalWizardDraft({
    id: draftId,
    mode: 'nearby-gems',
    count: 8,
    vibe: 'traveler',
    prompt: '',
  });
  assert.equal('latitude' in draft, false);
  assert.equal('longitude' in draft, false);
  assert.equal('manual_location' in draft, false);
  await assertSucceeds(setDoc(
    doc(database, 'users', ownerUid, 'board_wizard_drafts', draftId),
    draft,
  ));

  const board = personalWizardBoard({
    id: draftId,
    visibility: 'private',
    kind: 'nearby-gems',
    title: 'Gems near Cape May, New Jersey',
    nearbyGems: {
      locationLabel: 'Cape May, New Jersey',
      range: 'quick-drive',
      travelMode: 'driving',
      defaultSort: 'travel-time',
      generatedAt: '2026-08-22T00:00:00.000Z',
      originStored: false,
      generationGrantId,
    },
  });
  const batch = writeBatch(database);
  batch.set(doc(database, 'boards', draftId), board);
  batch.delete(doc(database, 'users', ownerUid, 'board_wizard_drafts', draftId));
  await assertSucceeds(batch.commit());

  await assertSucceeds(getDoc(doc(database, 'boards', draftId)));
  await assertFails(getDoc(doc(
    testEnvironment.authenticatedContext('different-user').firestore(),
    'boards',
    draftId,
  )));
  await assertFails(getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), 'boards', draftId)));

  await assertSucceeds(setDoc(doc(database, 'boards', draftId), {
    ...board,
    visibility: 'public',
    updated_at_iso: '2026-08-22T01:00:00.000Z',
    server_updated_at: serverTimestamp(),
  }));
  await assertSucceeds(getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), 'boards', draftId)));

  await assertSucceeds(setDoc(doc(database, 'boards', draftId), {
    ...board,
    visibility: 'private',
    updated_at_iso: '2026-08-22T02:00:00.000Z',
    server_updated_at: serverTimestamp(),
  }));
});

test('nearby privacy exception rejects missing or mismatched server grants', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();
  const metadata = {
    locationLabel: 'Cape May, New Jersey',
    range: 'walk',
    travelMode: 'walking',
    defaultSort: 'travel-time',
    generatedAt: '2026-08-22T00:00:00.000Z',
    originStored: false,
    generationGrantId: 'missing-generation-grant-123456',
  };
  await assertFails(setDoc(
    doc(database, 'boards', 'fake-nearby-board'),
    personalWizardBoard({
      id: 'fake-nearby-board',
      kind: 'nearby-gems',
      visibility: 'private',
      nearbyGems: metadata,
    }),
  ));
  await assertFails(setDoc(
    doc(database, 'boards', 'ordinary-private-board'),
    personalWizardBoard({ id: 'ordinary-private-board', visibility: 'private' }),
  ));
});

test('wizard draft media mode cannot bypass its allowlist or ownership', async () => {
  const ownerDatabase = testEnvironment.authenticatedContext(ownerUid).firestore();
  await assertFails(setDoc(
    doc(ownerDatabase, 'users', ownerUid, 'board_wizard_drafts', 'media-draft-invalid'),
    personalWizardDraft({ id: 'media-draft-invalid', media_mode: 'random' }),
  ));

  const otherDatabase = testEnvironment.authenticatedContext('different-user').firestore();
  await assertFails(setDoc(
    doc(otherDatabase, 'users', ownerUid, 'board_wizard_drafts', 'media-draft-other'),
    personalWizardDraft({ id: 'media-draft-other' }),
  ));
});

test('legacy wizard drafts remain writable without media preferences', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();
  const legacyDraft = personalWizardDraft({
    id: 'media-draft-legacy',
    result: { board: { title: 'Legacy draft' }, cards: [{ id: 'card-1' }] },
  });

  await assertSucceeds(setDoc(
    doc(database, 'users', ownerUid, 'board_wizard_drafts', 'media-draft-legacy'),
    legacyDraft,
  ));
});

test('video library accepts a complete landscape variant and remains compatible with older records', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();
  const collectionPath = ['users', ownerUid, 'videos'];
  await assertSucceeds(setDoc(
    doc(database, ...collectionPath, 'board_wizard-board-1'),
    videoLibraryRecord(),
  ));
  await assertSucceeds(setDoc(
    doc(database, ...collectionPath, 'board_wizard-board-2'),
    videoLibraryRecord({
      id: 'board_wizard-board-2',
      source_id: 'wizard-board-2',
      landscape_video_url: 'https://example.com/landscape.mp4',
      landscape_storage_path: 'users/board-owner/video-library/boards/wizard-board-2/full/landscape/render.mp4',
      landscape_public_storage_path: '',
      landscape_mime_type: 'video/mp4',
      landscape_duration_seconds: 24,
      landscape_render_version: 'stack-video-v14',
      landscape_generated_at_iso: '2026-08-23T00:00:00.000Z',
    }),
  ));
  await assertFails(setDoc(
    doc(database, ...collectionPath, 'board_wizard-board-3'),
    videoLibraryRecord({
      id: 'board_wizard-board-3',
      source_id: 'wizard-board-3',
      landscape_video_url: 'https://example.com/incomplete.mp4',
    }),
  ));
});

test('analytics collections cannot be read or written directly by any client', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'board_analytics_daily_shards', 'wizard-board-1__2026-08-19__0'), {
      board_id: 'wizard-board-1',
      day: '2026-08-19',
      counts: { views: 4 },
    });
    await setDoc(doc(context.firestore(), 'users', 'admin-user'), { role: 'admin' });
  });

  for (const database of [
    testEnvironment.unauthenticatedContext().firestore(),
    testEnvironment.authenticatedContext(ownerUid).firestore(),
    testEnvironment.authenticatedContext('admin-user').firestore(),
  ]) {
    const reference = doc(database, 'board_analytics_daily_shards', 'wizard-board-1__2026-08-19__0');
    await assertFails(getDoc(reference));
    await assertFails(setDoc(reference, { counts: { views: 999 } }));
  }
});

test('public board summaries are public-read and server-write only', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, 'public_board_summaries', 'public-board'), {
      id: 'public-board',
      visibility: 'public',
      owner_public_slug: 'board-owner',
      is_root: true,
      created_at_iso: '2026-08-21T00:00:00.000Z',
    });
    await setDoc(doc(database, 'public_board_summaries', 'private-board'), {
      id: 'private-board',
      visibility: 'private',
      owner_public_slug: 'board-owner',
      is_root: true,
      created_at_iso: '2026-08-21T00:00:00.000Z',
    });
  });

  const anonymous = testEnvironment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anonymous, 'public_board_summaries', 'public-board')));
  await assertFails(getDoc(doc(anonymous, 'public_board_summaries', 'private-board')));
  const publicQuery = query(
    collection(anonymous, 'public_board_summaries'),
    where('visibility', '==', 'public'),
    limit(10),
  );
  const publicResults = await assertSucceeds(getDocs(publicQuery));
  assert.equal(publicResults.size, 1);

  for (const database of [
    testEnvironment.unauthenticatedContext().firestore(),
    testEnvironment.authenticatedContext(ownerUid).firestore(),
  ]) {
    await assertFails(setDoc(doc(database, 'public_board_summaries', 'client-write'), {
      id: 'client-write',
      visibility: 'public',
    }));
  }
});

test('older clients may save a personal board with null city metadata', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  await assertSucceeds(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({ atlas_id: null, generated_for_atlas_id: null }),
  ));
});

test('client payload may not claim privileged city publication metadata', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  await assertFails(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({ atlas_id: 'atlas-philly' }),
  ));
});

test('owner can update a full personal board without hitting the rule expression limit', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'boards', 'wizard-board-1'),
      personalWizardBoard({ server_updated_at: new Date('2026-08-12T00:00:00.000Z') }),
    );
  });
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  await assertSucceeds(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({
      title: 'My updated board',
      updated_at_iso: '2026-08-12T01:00:00.000Z',
    }),
  ));
});

test('owner can save a fresh narration revision with final-screen settings', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'boards', 'wizard-board-1'),
      personalWizardBoard({ server_updated_at: new Date('2026-08-12T00:00:00.000Z') }),
    );
  });
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  await assertSucceeds(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({
      cards: [{
        id: 'card-1',
        title: 'Closing card',
        notes: 'A clean narration take.',
        videoNarrationRevision: 1,
      }],
      socialVideoRenderVersion: '',
      socialVideoClosingHeadline: 'Plan your own journey',
      socialVideoClosingMessage: 'Scan to explore every stop.',
      socialVideoClosingShowQrCode: false,
      socialVideoClosingImage: 'final-card',
      socialVideoClosingDurationSeconds: 4.5,
      updated_at_iso: '2026-08-12T01:00:00.000Z',
    }),
  ));
});

test('final-screen settings remain bounded by the board schema', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  await assertFails(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({ socialVideoClosingDurationSeconds: 30 }),
  ));
  await assertFails(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({ socialVideoClosingImage: 'external-image' }),
  ));
  await assertFails(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({ socialVideoClosingImage: 'custom', socialVideoClosingCustomImageUrl: '' }),
  ));
});

test('owner can save a custom final-screen image', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  await assertSucceeds(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({
      socialVideoClosingImage: 'custom',
      socialVideoClosingCustomImageUrl: 'https://storage.googleapis.com/example/final-screen.jpg',
    }),
  ));
});

test('owner can update the Studio cover and final card together', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'boards', 'wizard-board-1'),
      personalWizardBoard({ server_updated_at: new Date('2026-08-12T00:00:00.000Z') }),
    );
  });
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  await assertSucceeds(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({
      title: 'A stronger opening',
      description: '',
      imageUrl: 'https://storage.googleapis.com/example/cover.jpg',
      socialVideoClosingHeadline: 'Keep exploring',
      socialVideoClosingMessage: 'Scan to open the complete board.',
      socialVideoClosingShowQrCode: true,
      socialVideoClosingImage: 'cover',
      socialVideoClosingDurationSeconds: 4,
      updated_at_iso: '2026-08-12T02:00:00.000Z',
    }),
  ));
});

test('a non-owner cannot update an existing board through Studio fields', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'boards', 'wizard-board-1'),
      personalWizardBoard({ server_updated_at: new Date('2026-08-12T00:00:00.000Z') }),
    );
  });
  const database = testEnvironment.authenticatedContext('different-user').firestore();

  await assertFails(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({
      title: 'Unauthorized cover edit',
      socialVideoClosingMessage: 'Unauthorized final-card edit',
      updated_at_iso: '2026-08-12T02:00:00.000Z',
    }),
  ));
});

test('owner can repair a legacy personal board that stored null city metadata', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'boards', 'wizard-board-1'),
      personalWizardBoard({
        atlas_id: null,
        generated_for_atlas_id: null,
        server_updated_at: new Date('2026-08-12T00:00:00.000Z'),
      }),
    );
  });
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  await assertSucceeds(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({
      title: 'Legacy board repaired',
      updated_at_iso: '2026-08-12T01:00:00.000Z',
    }),
  ));
});

test('signed-in users cannot save a board under another owner', async () => {
  const database = testEnvironment.authenticatedContext('different-user').firestore();

  await assertFails(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard(),
  ));
});

test('owner can create a public board collection', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  await assertSucceeds(setDoc(
    doc(database, 'board_collections', 'collection-1'),
    publicBoardCollection(),
  ));
});

test('owner can check collection slug availability before creating it', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  const snapshot = await assertSucceeds(getDocs(query(
    collection(database, 'board_collections'),
    where('owner_user_id', '==', ownerUid),
    where('slug', '==', 'favorite-places'),
    limit(1),
  )));

  assert.equal(snapshot.empty, true);
});

test('public visitors can read a public board collection', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'board_collections', 'collection-1'),
      publicBoardCollection({ server_updated_at: new Date('2026-08-13T00:00:00.000Z') }),
    );
  });
  const database = testEnvironment.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(database, 'board_collections', 'collection-1')));
});

test('another user cannot replace an owners board collection', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'board_collections', 'collection-1'),
      publicBoardCollection({ server_updated_at: new Date('2026-08-13T00:00:00.000Z') }),
    );
  });
  const database = testEnvironment.authenticatedContext('different-user').firestore();

  await assertFails(setDoc(
    doc(database, 'board_collections', 'collection-1'),
    publicBoardCollection({ owner_user_id: 'different-user' }),
  ));
});

test('public route documents are readable but never client-writable', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'public_board_routes', 'cape-may-gems'), {
      slug: 'cape-may-gems',
      resource_type: 'board',
      target_id: 'wizard-board-1',
      owner_user_id: ownerUid,
      primary: true,
    });
  });
  const visitorDatabase = testEnvironment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(visitorDatabase, 'public_board_routes', 'cape-may-gems')));

  const ownerDatabase = testEnvironment.authenticatedContext(ownerUid).firestore();
  await assertFails(setDoc(doc(ownerDatabase, 'public_board_routes', 'another-name'), {
    target_id: 'wizard-board-1',
  }));
});

test('normal board saves preserve but cannot change a server-managed custom slug', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'boards', 'wizard-board-1'),
      personalWizardBoard({ custom_slug: 'cape-may-gems', server_updated_at: new Date() }),
    );
  });
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();
  await assertSucceeds(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({ custom_slug: 'cape-may-gems', title: 'Updated title' }),
  ));
  await assertFails(setDoc(
    doc(database, 'boards', 'wizard-board-1'),
    personalWizardBoard({ custom_slug: 'stolen-or-unregistered' }),
  ));
});

test('collection writes require at least one selected board', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  await assertFails(setDoc(
    doc(database, 'board_collections', 'collection-1'),
    publicBoardCollection({ board_ids: [] }),
  ));
});
