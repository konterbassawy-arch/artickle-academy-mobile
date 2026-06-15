/**
 * backfillAiReportSchoolId.ts — Phase AI.3 one-time migration
 *
 * Existing aiReport documents were saved under the old path:
 *   students/{studentId}/aiReports/{reportType}
 * They are missing the fields added in AI.3:
 *   schoolId, generatedByName, editedByName, status
 *
 * This script:
 *   1. Iterates every student document.
 *   2. For each student, reads all aiReport sub-documents.
 *   3. For any report missing `schoolId`, patches it with the student's schoolId.
 *   4. For any report missing `generatedByName`, sets it to '' (unknown).
 *   5. For any report missing `editedByName`, sets it to null.
 *   6. For any report missing `status`, sets it to 'draft'.
 *
 * Run with:
 *   npx ts-node --project tsconfig.node.json scripts/backfillAiReportSchoolId.ts
 *
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service-account key
 *     that has Firestore read/write permissions, OR run inside Firebase CLI
 *     (firebase emulators:exec / Functions environment).
 *   - npm install firebase-admin  (if not already present)
 */

import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

async function backfill() {
  const studentsSnap = await db.collection('students').get();
  console.log(`Found ${studentsSnap.size} students.`);

  let reportsProcessed = 0;
  let reportsPatched = 0;

  for (const studentDoc of studentsSnap.docs) {
    const studentData = studentDoc.data();
    const schoolId: string = studentData.schoolId ?? '';

    const reportsSnap = await studentDoc.ref.collection('aiReports').get();
    if (reportsSnap.empty) continue;

    for (const reportDoc of reportsSnap.docs) {
      reportsProcessed++;
      const data = reportDoc.data();
      const patch: Record<string, unknown> = {};

      if (!data.schoolId) {
        patch.schoolId = schoolId;
      }
      if (data.generatedByName === undefined) {
        patch.generatedByName = '';
      }
      if (data.editedByName === undefined) {
        patch.editedByName = null;
      }
      if (!data.status) {
        patch.status = 'draft';
      }

      if (Object.keys(patch).length > 0) {
        await reportDoc.ref.update(patch);
        reportsPatched++;
        console.log(
          `  Patched students/${studentDoc.id}/aiReports/${reportDoc.id}:`,
          JSON.stringify(patch),
        );
      }
    }
  }

  console.log(
    `\nDone. Processed ${reportsProcessed} reports, patched ${reportsPatched}.`,
  );
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
