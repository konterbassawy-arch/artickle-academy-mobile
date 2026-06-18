// TEMP verification helper — creates or checks/deletes a throwaway test user in the
// articklebeta dev project, used to verify in-app account deletion. Safe: dev sandbox only.
// Usage: node scripts/_tmp_test_user.mjs <create|check> <keyPath>
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const [, , action, keyPath] = process.argv;
const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
initializeApp({ credential: cert(sa) });
const auth = getAuth();
const db = getFirestore();

const EMAIL = 'delete-test@artickle-qa.dev';
const PASS = 'DeleteTest!2026';
const DOC_ID = 'delete_test_artickle_qa_dev';

if (action === 'create') {
  // Remove any leftover from a previous run.
  try { const u = await auth.getUserByEmail(EMAIL); await auth.deleteUser(u.uid); } catch {}
  const u = await auth.createUser({ email: EMAIL, password: PASS, emailVerified: true });
  await db.collection('users').doc(DOC_ID).set({
    id: DOC_ID, email: EMAIL, name: 'Delete Test', role: 'teacher', uid: u.uid,
  });
  await db.collection('teachers').doc(DOC_ID).set({ id: DOC_ID, name: 'Delete Test' });
  console.log(JSON.stringify({ created: true, email: EMAIL, pass: PASS, uid: u.uid }));
} else if (action === 'check') {
  let authExists = false, userDoc = false, teacherDoc = false;
  try { await auth.getUserByEmail(EMAIL); authExists = true; } catch {}
  userDoc = (await db.collection('users').doc(DOC_ID).get()).exists;
  teacherDoc = (await db.collection('teachers').doc(DOC_ID).get()).exists;
  console.log(JSON.stringify({ authExists, userDoc, teacherDoc }));
}
process.exit(0);
