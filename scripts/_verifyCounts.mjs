import { readFileSync, writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const OUT = '/tmp/verify_counts.txt';
const log = (s) => { try { writeFileSync(OUT, s + '\n', { flag: 'a' }); } catch {} };
writeFileSync(OUT, ''); // reset

const KEY = '/Users/karim/Downloads/articklebeta-firebase-adminsdk-fbsvc-bcf73c7643.json';
const sa = JSON.parse(readFileSync(KEY, 'utf8'));
if (sa.project_id !== 'articklebeta') { log('REFUSING: key not articklebeta: ' + sa.project_id); process.exit(1); }

initializeApp({ credential: cert(sa), projectId: 'articklebeta' });
const db = getFirestore();
db.settings({ preferRest: true }); // force REST transport (gRPC stalls in this env)

log('project: ' + sa.project_id);
const cols = ['lessons','students','teachers','schools','users','parents','bookings','timetableSlots','enrollments','schoolEnrollmentPeriods','invoices','payments','payrollRuns','counters'];
for (const c of cols) {
  const snap = await db.collection(c).count().get();
  log(c.padEnd(26) + snap.data().count);
}
const studs = await db.collection('students').limit(5).get();
let aiTotal = 0;
for (const s of studs.docs) {
  const a = await s.ref.collection('aiReports').count().get();
  aiTotal += a.data().count;
}
log('aiReports(first5students)  ' + aiTotal);
log('DONE');
process.exit(0);
