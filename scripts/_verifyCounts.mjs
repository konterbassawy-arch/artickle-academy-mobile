import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const KEY = '/Users/karim/Downloads/articklebeta-firebase-adminsdk-fbsvc-bcf73c7643.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
if (sa.project_id !== 'articklebeta') {
  console.error('REFUSING: key is not for articklebeta:', sa.project_id);
  process.exit(1);
}
initializeApp({ credential: cert(sa), projectId: 'articklebeta' });
const db = getFirestore();

const cols = ['lessons','students','teachers','schools','users','parents','bookings','timetableSlots','enrollments','schoolEnrollmentPeriods','invoices','payments','payrollRuns','counters'];
console.log('project:', sa.project_id);
for (const c of cols) {
  const snap = await db.collection(c).count().get();
  console.log(c.padEnd(26), snap.data().count);
}
// sample aiReports subcollection across a couple of students
const studs = await db.collection('students').limit(5).get();
let aiTotal = 0;
for (const s of studs.docs) {
  const a = await s.ref.collection('aiReports').count().get();
  aiTotal += a.data().count;
}
console.log('aiReports (first 5 students)', aiTotal);
process.exit(0);
