/**
 * One-shot backfill: stamps latitude/longitude onto each public city atlas's
 * `city_config`, so the /dymaxion (Fuller projection) map can place its marker.
 *
 * Coordinates are a curated table keyed by atlas slug (the authoritative key in
 * the live directory). Only public atlases whose slug is in COORDS and that are
 * missing `city_config.latitude` get written; everything else is logged and
 * skipped. Non-city atlases (platform/topic) are intentionally absent from the
 * table.
 *
 * Usage (from functions/ dir):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npx ts-node scripts/backfill-city-coords.ts            # dry-run (no writes)
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npx ts-node scripts/backfill-city-coords.ts --apply    # writes
 *   npx ts-node scripts/backfill-city-coords.ts --force      # also overwrite existing coords
 *
 * Alternatively, if `firebase login` is active and the local CLI has app-default
 * credentials, admin.initializeApp() will pick those up automatically.
 */

import * as admin from 'firebase-admin';

// slug -> [latitude, longitude]
const COORDS: Record<string, [number, number]> = {
  // ---- North America (US / Canada / Mexico) ----
  'philly': [39.9526, -75.1652],
  'my-living-wiki-washington-dc': [38.9072, -77.0369],
  'my-living-wiki-new-york-city': [40.7128, -74.006],
  'my-living-wiki-boston': [42.3601, -71.0589],
  'my-living-wiki-chicago': [41.8781, -87.6298],
  'my-living-wiki-los-angeles': [34.0522, -118.2437],
  'my-living-wiki-san-francisco': [37.7749, -122.4194],
  'my-living-wiki-san-diego': [32.7157, -117.1611],
  'my-living-wiki-seattle': [47.6062, -122.3321],
  'my-living-wiki-portland': [45.5152, -122.6784],
  'my-living-wiki-denver': [39.7392, -104.9903],
  'my-living-wiki-austin': [30.2672, -97.7431],
  'my-living-wiki-dallas': [32.7767, -96.797],
  'my-living-wiki-houston': [29.7604, -95.3698],
  'my-living-wiki-phoenix': [33.4484, -112.074],
  'my-living-wiki-las-vegas': [36.1699, -115.1398],
  'my-living-wiki-atlanta': [33.749, -84.388],
  'my-living-wiki-miami': [25.7617, -80.1918],
  'my-living-wiki-new-orleans': [29.9511, -90.0715],
  'my-living-wiki-nashville': [36.1627, -86.7816],
  'my-living-wiki-detroit': [42.3314, -83.0458],
  'my-living-wiki-minneapolis': [44.9778, -93.265],
  'my-living-wiki-charleston': [32.7765, -79.9311],
  'my-living-wiki-savannah': [32.0809, -81.0912],
  'my-living-wiki-asheville': [35.5951, -82.5515],
  'my-living-wiki-santa-fe': [35.687, -105.9378],
  'my-living-wiki-sedona': [34.8697, -111.761],
  'my-living-wiki-key-west': [24.5551, -81.78],
  'my-living-wiki-virginia-beach': [36.8529, -75.978],
  'my-living-wiki-san-juan': [18.4655, -66.1057],
  'my-living-wiki-amherst': [42.3732, -72.5199],
  'my-living-wiki-northampton': [42.3251, -72.6412],
  'my-living-wiki-nantucket': [41.2835, -70.0995],
  'my-living-wiki-cape-may': [38.9351, -74.9060],
  'my-living-wiki-avalon': [39.1012, -74.7177],
  'my-living-wiki-ocean-city-nj': [39.2776, -74.5746],
  'my-living-wiki-the-hamptons': [40.9634, -72.1848],
  'my-living-wiki-turks-caicos': [21.694, -71.7979],
  'my-living-wiki-toronto': [43.6532, -79.3832],
  'my-living-wiki-montreal': [45.5017, -73.5673],
  'my-living-wiki-vancouver': [49.2827, -123.1207],
  'my-living-wiki-quebec-city': [46.8139, -71.208],
  'my-living-wiki-mexico-city': [19.4326, -99.1332],

  // ---- South America ----
  'my-living-wiki-bogota': [4.711, -74.0721],
  'my-living-wiki-lima': [-12.0464, -77.0428],
  'my-living-wiki-santiago': [-33.4489, -70.6693],
  'my-living-wiki-buenos-aires': [-34.6037, -58.3816],
  'my-living-wiki-rio-de-janeiro': [-22.9068, -43.1729],
  'my-living-wiki-s-o-paulo': [-23.5558, -46.6396],

  // ---- Europe ----
  'my-living-wiki-london': [51.5074, -0.1278],
  'my-living-wiki-edinburgh': [55.9533, -3.1883],
  'my-living-wiki-glasgow': [55.8642, -4.2518],
  'my-living-wiki-dublin': [53.3498, -6.2603],
  'my-living-wiki-paris': [48.8566, 2.3522],
  'my-living-wiki-amsterdam': [52.3676, 4.9041],
  'my-living-wiki-brussels': [50.8503, 4.3517],
  'my-living-wiki-berlin': [52.52, 13.405],
  'my-living-wiki-madrid': [40.4168, -3.7038],
  'my-living-wiki-barcelona': [41.3851, 2.1734],
  'my-living-wiki-lisbon': [38.7223, -9.1393],
  'my-living-wiki-rome': [41.9028, 12.4964],
  'my-living-wiki-milan': [45.4642, 9.19],
  'my-living-wiki-florence': [43.7696, 11.2558],
  'my-living-wiki-venice': [45.4408, 12.3155],
  'my-living-wiki-vienna': [48.2082, 16.3738],
  'my-living-wiki-prague': [50.0755, 14.4378],
  'my-living-wiki-budapest': [47.4979, 19.0402],
  'my-living-wiki-warsaw': [52.2297, 21.0122],
  'my-living-wiki-athens': [37.9838, 23.7275],
  'my-living-wiki-geneva': [46.2044, 6.1432],
  'my-living-wiki-zurich': [47.3769, 8.5417],
  'my-living-wiki-copenhagen': [55.6761, 12.5683],
  'my-living-wiki-oslo': [59.9139, 10.7522],
  'my-living-wiki-stockholm': [59.3293, 18.0686],
  'my-living-wiki-helsinki': [60.1699, 24.9384],

  // ---- Middle East ----
  'my-living-wiki-istanbul': [41.0082, 28.9784],
  'my-living-wiki-jerusalem': [31.7683, 35.2137],
  'my-living-wiki-tel-aviv': [32.0853, 34.7818],
  'my-living-wiki-dubai': [25.2048, 55.2708],
  'my-living-wiki-abu-dhabi': [24.4539, 54.3773],
  'my-living-wiki-doha': [25.2854, 51.531],

  // ---- Africa ----
  'my-living-wiki-cairo': [30.0444, 31.2357],
  'my-living-wiki-marrakech': [31.6295, -7.9811],
  'my-living-wiki-accra': [5.6037, -0.187],
  'my-living-wiki-lagos': [6.5244, 3.3792],
  'my-living-wiki-nairobi': [-1.2921, 36.8219],
  'my-living-wiki-kinshasa': [-4.4419, 15.2663],
  'my-living-wiki-johannesburg': [-26.2041, 28.0473],
  'my-living-wiki-cape-town': [-33.9249, 18.4241],

  // ---- Asia ----
  'my-living-wiki-mumbai': [19.076, 72.8777],
  'my-living-wiki-delhi': [28.6139, 77.209],
  'my-living-wiki-bangkok': [13.7563, 100.5018],
  'my-living-wiki-singapore': [1.3521, 103.8198],
  'my-living-wiki-hong-kong': [22.3193, 114.1694],
  'my-living-wiki-shanghai': [31.2304, 121.4737],
  'my-living-wiki-beijing': [39.9042, 116.4074],
  'my-living-wiki-taipei': [25.033, 121.5654],
  'my-living-wiki-seoul': [37.5665, 126.978],
  'my-living-wiki-tokyo': [35.6762, 139.6503],
  'my-living-wiki-kyoto': [35.0116, 135.7681],

  // ---- Oceania ----
  'my-living-wiki-sydney': [-33.8688, 151.2093],
  'my-living-wiki-auckland': [-36.8485, 174.7633],
};

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const force = args.includes('--force');

  admin.initializeApp();
  const db = admin.firestore();

  const snap = await db.collection('atlases').where('is_public', '==', true).get();

  console.log(`\n${snap.size} public atlases found.`);
  console.log(apply ? 'Mode: APPLY (writes will occur)' : 'Mode: DRY-RUN (no writes)');
  console.log(force ? 'Overwrite: FORCE (existing coords will be replaced)\n' : 'Overwrite: skip atlases that already have coords\n');

  const toWrite: { ref: FirebaseFirestore.DocumentReference; slug: string; coords: [number, number] }[] = [];
  const alreadyHave: string[] = [];
  const unmatched: { slug: string; name: string }[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const slug = (data['slug'] as string | undefined) ?? '';
    const name = (data['name'] as string | undefined) ?? '(unnamed)';
    const coords = COORDS[slug];

    if (!coords) {
      unmatched.push({ slug, name });
      continue;
    }

    const cityConfig = (data['city_config'] as Record<string, unknown> | undefined) ?? {};
    const hasCoords =
      typeof cityConfig['latitude'] === 'number' && typeof cityConfig['longitude'] === 'number';

    if (hasCoords && !force) {
      alreadyHave.push(slug);
      continue;
    }

    toWrite.push({ ref: doc.ref, slug, coords });
  }

  console.log(`Matched & needing write: ${toWrite.length}`);
  for (const w of toWrite) {
    console.log(`  ${w.slug.padEnd(34)} -> [${w.coords[0]}, ${w.coords[1]}]`);
  }

  console.log(`\nAlready have coords (skipped): ${alreadyHave.length}`);

  console.log(`\nPublic atlases NOT in coords table (skipped): ${unmatched.length}`);
  for (const u of unmatched) {
    console.log(`  ${u.slug.padEnd(34)} (${u.name})`);
  }

  if (!apply) {
    console.log('\nDry-run complete. Re-run with --apply to write coordinates.');
    return;
  }

  let written = 0;
  for (let i = 0; i < toWrite.length; i += 400) {
    const batch = db.batch();
    const chunk = toWrite.slice(i, i + 400);
    for (const w of chunk) {
      batch.set(
        w.ref,
        { city_config: { latitude: w.coords[0], longitude: w.coords[1] } },
        { merge: true },
      );
    }
    await batch.commit();
    written += chunk.length;
    console.log(`  committed ${chunk.length} (running total: ${written})`);
  }

  console.log(`\nDone. ${written} atlases updated with coordinates.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
