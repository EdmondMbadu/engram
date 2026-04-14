/**
 * One-shot backfill: stamps atlas_id on every record owned by <userId>
 * that is currently missing atlas_id (or has null).
 *
 * Usage (from functions/ dir):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npx ts-node scripts/backfill-atlas-id.ts <userId> <atlasId>            # dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npx ts-node scripts/backfill-atlas-id.ts <userId> <atlasId> --apply    # writes
 *
 * Alternatively, if `firebase login` is active and the local CLI has app-default
 * credentials, admin.initializeApp() will pick those up automatically.
 */

import * as admin from 'firebase-admin';

const USER_COLLECTIONS = [
  'documents',
  'raw_extracts',
  'knowledge_entries',
  'wiki_topics',
  'wiki_topic_jobs',
  'queries',
  'chat_threads',
  'chat_messages',
];

async function main() {
  const [, , userId, atlasId, ...rest] = process.argv;
  const apply = rest.includes('--apply');

  if (!userId || !atlasId) {
    console.error('Usage: ts-node scripts/backfill-atlas-id.ts <userId> <atlasId> [--apply]');
    process.exit(1);
  }

  admin.initializeApp();
  const db = admin.firestore();

  // Sanity check: atlas exists and belongs to userId
  const atlasSnap = await db.collection('atlases').doc(atlasId).get();
  if (!atlasSnap.exists) {
    console.error(`Atlas ${atlasId} does not exist.`);
    process.exit(1);
  }
  const atlasData = atlasSnap.data();
  if (atlasData?.user_id !== userId) {
    console.error(`Atlas ${atlasId} is not owned by user ${userId}.`);
    process.exit(1);
  }

  console.log(`\nBackfill target: atlas "${atlasData?.name ?? '(unnamed)'}" (${atlasId}) for user ${userId}`);
  console.log(apply ? 'Mode: APPLY (writes will occur)\n' : 'Mode: DRY-RUN (no writes)\n');

  let grandTotalNeeding = 0;
  let grandTotalUpdated = 0;

  for (const collectionName of USER_COLLECTIONS) {
    const snap = await db.collection(collectionName).where('user_id', '==', userId).get();
    const needing = snap.docs.filter((doc) => {
      const data = doc.data();
      return data.atlas_id === undefined || data.atlas_id === null;
    });

    console.log(`${collectionName}: ${snap.size} owned by user, ${needing.length} need atlas_id`);
    grandTotalNeeding += needing.length;

    if (!apply || needing.length === 0) continue;

    // Batch writes in chunks of 400
    for (let i = 0; i < needing.length; i += 400) {
      const batch = db.batch();
      const chunk = needing.slice(i, i + 400);
      for (const doc of chunk) {
        batch.update(doc.ref, { atlas_id: atlasId });
      }
      await batch.commit();
      grandTotalUpdated += chunk.length;
      console.log(`  committed ${chunk.length} (running total: ${grandTotalUpdated})`);
    }
  }

  console.log(`\nDone. ${grandTotalNeeding} records needed backfill.`);
  if (apply) {
    console.log(`${grandTotalUpdated} records updated.`);
  } else {
    console.log('Dry-run complete. Re-run with --apply to actually write.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
