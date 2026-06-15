/**
 * stripClassFromStudentNames.ts — one-time bulk name cleanup
 *
 * Many student names have the class baked into the name string, e.g.
 *   "John Peter 5 c"  →  name "John Peter", class "5c"
 * This script strips that trailing "<grade> <section>" suffix from the name.
 *
 * It cleans:
 *   1. students/{id}.name                  (source of truth)
 *   2. lessons/{id}.studentNames[]         (denormalized copies)
 *   3. bookings/{id}.studentName
 *   4. timetableSlots/{id}.studentNames[]
 *
 * Optionally (--fill-grade) it also writes the extracted grade digits into
 * students/{id}.yearGrade when that field is currently empty.
 *
 * SAFETY: defaults to DRY RUN. Nothing is written unless you pass --apply.
 *
 * Run (preview):
 *   npx ts-node --project tsconfig.node.json scripts/stripClassFromStudentNames.ts
 * Run (apply):
 *   npx ts-node --project tsconfig.node.json scripts/stripClassFromStudentNames.ts --apply --fill-grade
 *
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS pointing to a service-account key with
 *     Firestore read/write, OR run inside the Firebase CLI environment.
 *   - npm install firebase-admin  (if not already present)
 */

import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const FILL_GRADE = process.argv.includes('--fill-grade');

/**
 * Trailing class pattern: a grade number (1–12) followed by an optional
 * single-letter section, at the very end of the name.
 * Matches: "5 c", "5c", "10 A", "12 B", "7".
 * Captures: [1] = grade digits, [2] = section letter (may be undefined).
 *
 * NOTE: tweak this regex if your class format differs. Test with dry run first.
 */
const CLASS_SUFFIX = /\s+(1[0-2]|[1-9])\s*([A-Za-z])?\s*$/;

/** Returns { clean, grade } if the name ends in a class suffix, else null. */
function parse(name: string): { clean: string; grade: string } | null {
  const m = name.match(CLASS_SUFFIX);
  if (!m) return null;
  const clean = name.replace(CLASS_SUFFIX, '').trim();
  if (!clean) return null; // guard: never blank out a name
  return { clean, grade: m[1] };
}

async function run() {
  console.log(APPLY ? '⚠️  APPLY MODE — writes will be made.' : '🔍 DRY RUN — no writes. Add --apply to commit.');
  console.log('');

  // Build a map of studentId -> { old, new } for the names that change.
  const studentsSnap = await db.collection('students').get();
  const changes = new Map<string, { old: string; clean: string; grade: string }>();

  for (const doc of studentsSnap.docs) {
    const name: string = doc.data().name ?? '';
    const parsed = parse(name);
    if (parsed) changes.set(doc.id, { old: name, ...parsed });
  }

  console.log(`Students: ${studentsSnap.size} total, ${changes.size} with a class suffix.\n`);
  for (const [id, c] of changes) {
    console.log(`  ${id}: "${c.old}"  →  "${c.clean}"  (grade ${c.grade})`);
  }
  console.log('');

  if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to write the above changes.');
    return;
  }

  // 1) Update the students collection.
  let n = 0;
  for (const [id, c] of changes) {
    const patch: Record<string, unknown> = { name: c.clean };
    if (FILL_GRADE) {
      const cur = studentsSnap.docs.find(d => d.id === id)?.data().yearGrade;
      if (!cur) patch.yearGrade = c.grade;
    }
    await db.collection('students').doc(id).update(patch);
    n++;
  }
  console.log(`Updated ${n} student docs.`);

  // Build a quick old-name -> clean-name lookup for denormalized copies.
  const byOldName = new Map<string, string>();
  for (const c of changes.values()) byOldName.set(c.old, c.clean);

  // 2) lessons.studentNames[]  &  4) timetableSlots.studentNames[]
  for (const col of ['lessons', 'timetableSlots']) {
    const snap = await db.collection(col).get();
    let patched = 0;
    for (const d of snap.docs) {
      const arr: string[] = d.data().studentNames ?? [];
      if (!arr.some(x => byOldName.has(x))) continue;
      const next = arr.map(x => byOldName.get(x) ?? x);
      await d.ref.update({ studentNames: next });
      patched++;
    }
    console.log(`Updated ${patched} ${col} docs.`);
  }

  // 3) bookings.studentName
  {
    const snap = await db.collection('bookings').get();
    let patched = 0;
    for (const d of snap.docs) {
      const nm: string = d.data().studentName ?? '';
      if (!byOldName.has(nm)) continue;
      await d.ref.update({ studentName: byOldName.get(nm) });
      patched++;
    }
    console.log(`Updated ${patched} bookings docs.`);
  }

  console.log('\nDone.');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
