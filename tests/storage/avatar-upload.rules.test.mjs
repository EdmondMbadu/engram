import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const projectId = 'demo-living-wiki';
const ownerUid = 'avatar-owner';
const otherUid = 'another-user';
let testEnvironment;

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
    storage: {
      rules: await readFile(new URL('../../storage.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await Promise.all([
    testEnvironment.clearFirestore(),
    testEnvironment.clearStorage(),
  ]);
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'atlases', 'new-avatar'), {
      user_id: ownerUid,
      admin_user_ids: [],
      is_public: false,
    });
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

test('owner can upload and delete a public-readable image in their avatar namespace', async () => {
  const ownerStorage = testEnvironment.authenticatedContext(ownerUid).storage();
  const portrait = ref(ownerStorage, `users/${ownerUid}/avatars/new-avatar/chat-guide.png`);

  await assertSucceeds(uploadBytes(portrait, new Uint8Array([1, 2, 3]), { contentType: 'image/png' }));
  const publicStorage = testEnvironment.unauthenticatedContext().storage();
  await assertSucceeds(getBytes(ref(publicStorage, portrait.fullPath)));
  await assertSucceeds(deleteObject(portrait));
});

test('another user cannot write to or delete an owners avatar namespace', async () => {
  const ownerStorage = testEnvironment.authenticatedContext(ownerUid).storage();
  const portraitPath = `users/${ownerUid}/avatars/new-avatar/chat-guide.png`;
  await assertSucceeds(uploadBytes(ref(ownerStorage, portraitPath), new Uint8Array([1]), { contentType: 'image/png' }));

  const otherStorage = testEnvironment.authenticatedContext(otherUid).storage();
  await assertFails(uploadBytes(ref(otherStorage, portraitPath), new Uint8Array([2]), { contentType: 'image/png' }));
  await assertFails(deleteObject(ref(otherStorage, portraitPath)));
});

test('avatar namespace rejects non-image content and images at the ten megabyte boundary', async () => {
  const ownerStorage = testEnvironment.authenticatedContext(ownerUid).storage();
  await assertFails(uploadBytes(
    ref(ownerStorage, `users/${ownerUid}/avatars/new-avatar/not-an-image.txt`),
    new Uint8Array([1]),
    { contentType: 'text/plain' },
  ));
  await assertFails(uploadBytes(
    ref(ownerStorage, `users/${ownerUid}/avatars/new-avatar/too-large.png`),
    new Uint8Array(10 * 1024 * 1024),
    { contentType: 'image/png' },
  ));
});

test('existing Atlas-owner image uploads remain allowed and outsiders remain denied', async () => {
  const ownerStorage = testEnvironment.authenticatedContext(ownerUid).storage();
  const existingPath = 'atlases/new-avatar/chat-guide.png';
  await assertSucceeds(uploadBytes(ref(ownerStorage, existingPath), new Uint8Array([1]), { contentType: 'image/png' }));

  const otherStorage = testEnvironment.authenticatedContext(otherUid).storage();
  await assertFails(uploadBytes(ref(otherStorage, existingPath), new Uint8Array([2]), { contentType: 'image/png' }));
});
