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
    socialVideoClosingDurationSeconds: 3,
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

test('collection writes require at least one selected board', async () => {
  const database = testEnvironment.authenticatedContext(ownerUid).firestore();

  await assertFails(setDoc(
    doc(database, 'board_collections', 'collection-1'),
    publicBoardCollection({ board_ids: [] }),
  ));
});
