#!/usr/bin/env node

const args = process.argv.slice(2);

function readArg(flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
}

const target = args.find((arg) => !arg.startsWith('--')) ?? null;
const projectId =
  readArg('--project') ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'living-atlas-7622a';

if (!target) {
  console.error('Usage: npm run city-pulse:refresh -- <atlas-slug-or-id> [--project <firebase-project-id>]');
  process.exit(1);
}

process.env.GCLOUD_PROJECT = projectId;
process.env.GOOGLE_CLOUD_PROJECT = projectId;
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId,
  storageBucket: `${projectId}.firebasestorage.app`,
});

const { db } = require('../lib/firebase');
const { refreshStoredCityPulseSnapshot } = require('../lib/city-pulse');

async function resolveAtlasId(input) {
  const byId = await db.collection('atlases').doc(input).get();
  if (byId.exists) {
    return byId.id;
  }

  const bySlug = await db.collection('atlases').where('slug', '==', input).limit(1).get();
  if (!bySlug.empty) {
    return bySlug.docs[0].id;
  }

  throw new Error(`Atlas not found for "${input}".`);
}

async function main() {
  const atlasId = await resolveAtlasId(target);
  const snapshot = await refreshStoredCityPulseSnapshot(atlasId, 'admin');

  console.log(
    JSON.stringify(
      {
        projectId,
        atlasId,
        refreshed_at: snapshot.refreshed_at,
        metricIds: snapshot.metrics.map((metric) => metric.id),
        notes: snapshot.notes ?? [],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
