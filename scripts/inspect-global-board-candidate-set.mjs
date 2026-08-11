#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const [atlasId, templateId, version = '1.0'] = process.argv.slice(2);
if (!atlasId || !templateId) throw new Error('Usage: node scripts/inspect-global-board-candidate-set.mjs <atlas-id> <template-id> [version]');
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a' });
const db = admin.firestore();
const generationKey = `${atlasId}__${templateId}__${version}`;
const cacheId = createHash('sha256').update(generationKey).digest('hex');
const snapshot = await db.collection('bulk_board_candidate_sets').doc(cacheId).get();
console.log(JSON.stringify(snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : { missing: true, cacheId }, null, 2));
process.exit(0);
