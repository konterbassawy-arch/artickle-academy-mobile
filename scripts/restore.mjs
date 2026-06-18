/**
 * restore.mjs — plain Node.js (no TypeScript, no tsx)
 * Usage: node scripts/restore.mjs
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import JSZip from 'jszip';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ZIP_PATH   = './backups/_tmp/artickle-restore-2026-06-17.zip';
const PROJECT_ID = 'articklebeta';
const KEY_PATH   = './articklebeta-service-account.json';
const BATCH_LIMIT = 450;

console.log('\nRestore plan:');
console.log('  ZIP:    ', ZIP_PATH);
console.log('  Project:', PROJECT_ID);
console.log('  Mode:    WRITE\n');

// Load ZIP
const zip = await JSZip.loadAsync(readFileSync(ZIP_PATH));
const fileNames = Object.keys(zip.files).filter(n => n.endsWith('.json'));

let manifest = {};
const mf = zip.file('_manifest.json');
if (mf) manifest = JSON.parse(await mf.async('string'));
if (manifest.exportDate) console.log('  Snapshot date:', manifest.exportDate, '\n');

const collections = {};
for (const name of fileNames) {
  if (name === '_manifest.json') continue;
  const col = name.replace(/\.json$/, '');
  collections[col] = JSON.parse(await zip.file(name).async('string'));
}

console.log('  Collections:');
for (const [name, docs] of Object.entries(collections)) {
  console.log(`    ${name.padEnd(28)} ${String(docs.length).padStart(6)} docs`);
}
console.log('');

// Connect Firebase Admin
const serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
const db = getFirestore();

async function writeDocs(refs, docs) {
  let batch = db.batch();
  let inBatch = 0, written = 0;
  for (const doc of docs) {
    const { _id, ...data } = doc;
    if (!_id) continue;
    batch.set(refs(_id), data);
    if (++inBatch >= BATCH_LIMIT) { await batch.commit(); batch = db.batch(); inBatch = 0; }
    written++;
  }
  if (inBatch > 0) await batch.commit();
  return written;
}

let total = 0;
for (const [name, docs] of Object.entries(collections)) {
  if (name === 'students_aiReports') continue;
  const n = await writeDocs(id => db.collection(name).doc(id), docs);
  console.log(`  wrote ${String(n).padStart(6)}  ${name}`);
  total += n;
}

// students_aiReports subcollection
if (collections['students_aiReports']) {
  let batch = db.batch(), inBatch = 0, written = 0;
  for (const doc of collections['students_aiReports']) {
    const { _id, studentId, ...data } = doc;
    if (!_id || !studentId) continue;
    batch.set(db.collection('students').doc(studentId).collection('aiReports').doc(_id), { studentId, ...data });
    if (++inBatch >= BATCH_LIMIT) { await batch.commit(); batch = db.batch(); inBatch = 0; }
    written++;
  }
  if (inBatch > 0) await batch.commit();
  console.log(`  wrote ${String(written).padStart(6)}  students_aiReports (→ students/*/aiReports)`);
  total += written;
}

console.log(`\nRestore complete — ${total} documents written.\n`);
