/**
 * restore-from-backup.ts
 * ----------------------------------------------------------------------------
 * Restores a nightly ARTickle backup ZIP into a target Firestore project.
 *
 * The nightly Cloud Function (`dailyExcelExport` in functions/src/index.ts) writes a
 * `json/{date}.zip` to the `artickle-academy-backups` bucket. Each entry is one
 * `{collection}.json` file holding an array of docs shaped `{ _id, ...fields }`, plus a
 * `_manifest.json` with per-collection counts. `students_aiReports.json` additionally
 * carries `studentId` so it can be restored into the `students/{id}/aiReports` subcollection.
 *
 * This script reads that ZIP and writes every document back, preserving document IDs.
 * It serves BOTH purposes:
 *   1. Seed the isolated dev project (`articklebeta`) with a snapshot of real data.
 *   2. Inject live data into the new app at launch, if ever needed.
 *
 * SAFETY: it refuses to target the production project (`artickle-academy`) unless you pass
 * --force-prod, so you cannot accidentally overwrite the live database.
 *
 * Usage:
 *   npm run restore -- --zip ./backups/2026-06-15.zip --project articklebeta \
 *       --key ./articklebeta-service-account.json
 *
 *   # See what would happen without writing anything:
 *   npm run restore -- --zip ./backups/2026-06-15.zip --project articklebeta \
 *       --key ./key.json --dry-run
 *
 * Get a service-account key from:
 *   Firebase Console → Project settings → Service accounts → Generate new private key
 *   (keep it OUT of git — *service-account*.json is already gitignored)
 * ----------------------------------------------------------------------------
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import JSZip from 'jszip';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const PROD_PROJECT_ID = 'artickle-academy';
const AI_REPORTS_KEY = 'students_aiReports';
const BATCH_LIMIT = 450; // Firestore allows 500 writes per batch; stay under it.

interface Args {
  zip: string;
  project: string;
  key: string;
  dryRun: boolean;
  forceProd: boolean;
  yes: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force-prod') out.forceProd = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1];
      i++;
    }
  }
  const missing = ['zip', 'project', 'key'].filter((k) => !out[k]);
  if (missing.length) {
    console.error(`Missing required arg(s): ${missing.map((m) => '--' + m).join(', ')}`);
    console.error(
      'Usage: npm run restore -- --zip <path.zip> --project <projectId> --key <serviceAccount.json> [--dry-run] [--yes]'
    );
    process.exit(1);
  }
  return {
    zip: String(out.zip),
    project: String(out.project),
    key: String(out.key),
    dryRun: Boolean(out.dryRun),
    forceProd: Boolean(out.forceProd),
    yes: Boolean(out.yes),
  };
}

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

async function writeDocs(
  db: Firestore,
  ref: (id: string) => FirebaseFirestore.DocumentReference,
  docs: Record<string, unknown>[],
  dryRun: boolean
): Promise<number> {
  if (dryRun) return docs.length;
  let batch = db.batch();
  let inBatch = 0;
  let written = 0;
  for (const doc of docs) {
    const { _id, ...data } = doc as { _id: string } & Record<string, unknown>;
    if (!_id) continue;
    batch.set(ref(_id), data);
    inBatch++;
    written++;
    if (inBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await batch.commit();
  return written;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.project === PROD_PROJECT_ID && !args.forceProd) {
    console.error(
      `\nREFUSING to target the PRODUCTION project "${PROD_PROJECT_ID}".\n` +
        'If you really mean to, re-run with --force-prod (you almost never should).\n'
    );
    process.exit(1);
  }

  console.log(`\nRestore plan:`);
  console.log(`  ZIP:      ${args.zip}`);
  console.log(`  Project:  ${args.project}${args.project === PROD_PROJECT_ID ? '  ⚠ PRODUCTION' : ''}`);
  console.log(`  Mode:     ${args.dryRun ? 'DRY RUN (no writes)' : 'WRITE'}\n`);

  // ── Load and parse the ZIP ────────────────────────────────────────────────
  const zip = await JSZip.loadAsync(readFileSync(args.zip));
  const fileNames = Object.keys(zip.files).filter((n) => n.endsWith('.json'));

  let manifest: { collections?: Record<string, number>; exportDate?: string } = {};
  const manifestFile = zip.file('_manifest.json');
  if (manifestFile) manifest = JSON.parse(await manifestFile.async('string'));
  if (manifest.exportDate) console.log(`  Snapshot date: ${manifest.exportDate}\n`);

  // Read every collection file into memory first (so we can show a summary up front).
  const collections: Record<string, Record<string, unknown>[]> = {};
  for (const name of fileNames) {
    if (name === '_manifest.json') continue;
    const colName = name.replace(/\.json$/, '');
    collections[colName] = JSON.parse(await zip.file(name)!.async('string'));
  }

  console.log('  Collections found in backup:');
  for (const [name, docs] of Object.entries(collections)) {
    const expected = manifest.collections?.[name];
    const mismatch = expected !== undefined && expected !== docs.length ? `  (manifest says ${expected}!)` : '';
    console.log(`    ${name.padEnd(26)} ${String(docs.length).padStart(6)} docs${mismatch}`);
  }
  console.log('');

  if (!args.dryRun && !args.yes) {
    const ok = await confirm(`Write all of the above into "${args.project}"? [y/N] `);
    if (!ok) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // ── Connect with the Admin SDK ────────────────────────────────────────────
  const serviceAccount = JSON.parse(readFileSync(args.key, 'utf8'));
  if (serviceAccount.project_id && serviceAccount.project_id !== args.project) {
    console.error(
      `\nKey is for project "${serviceAccount.project_id}" but --project is "${args.project}". Aborting.\n`
    );
    process.exit(1);
  }
  initializeApp({ credential: cert(serviceAccount), projectId: args.project });
  const db = getFirestore();

  // ── Restore each collection ───────────────────────────────────────────────
  const results: { name: string; written: number }[] = [];
  for (const [name, docs] of Object.entries(collections)) {
    if (name === AI_REPORTS_KEY) continue; // handled below as a subcollection
    const written = await writeDocs(db, (id) => db.collection(name).doc(id), docs, args.dryRun);
    results.push({ name, written });
    console.log(`  ${args.dryRun ? 'would write' : 'wrote'} ${String(written).padStart(6)}  ${name}`);
  }

  // students_aiReports → students/{studentId}/aiReports/{_id}
  if (collections[AI_REPORTS_KEY]) {
    let written = 0;
    if (!args.dryRun) {
      let batch = db.batch();
      let inBatch = 0;
      for (const doc of collections[AI_REPORTS_KEY]) {
        const { _id, studentId, ...data } = doc as { _id: string; studentId: string } & Record<string, unknown>;
        if (!_id || !studentId) continue;
        const ref = db.collection('students').doc(studentId).collection('aiReports').doc(_id);
        batch.set(ref, { studentId, ...data });
        inBatch++;
        written++;
        if (inBatch >= BATCH_LIMIT) {
          await batch.commit();
          batch = db.batch();
          inBatch = 0;
        }
      }
      if (inBatch > 0) await batch.commit();
    } else {
      written = collections[AI_REPORTS_KEY].length;
    }
    results.push({ name: AI_REPORTS_KEY, written });
    console.log(
      `  ${args.dryRun ? 'would write' : 'wrote'} ${String(written).padStart(6)}  ${AI_REPORTS_KEY} (→ students/*/aiReports)`
    );
  }

  const total = results.reduce((s, r) => s + r.written, 0);
  console.log(`\n${args.dryRun ? 'DRY RUN complete' : 'Restore complete'} — ${total} documents across ${results.length} collections.\n`);
}

main().catch((err) => {
  console.error('\nRestore failed:', err);
  process.exit(1);
});
