/**
 * savedReports.ts — Phase AI.3
 *
 * Firestore CRUD for teacher-saved AI reports.
 * Path: students/{studentId}/aiReports/{reportId}  (auto-generated ID)
 *
 * Key change from AI.2B:
 *   - Multiple independent drafts per report type are supported.
 *   - saveReport() always creates a NEW document (addDoc).
 *   - updateReport() patches an existing document by its ID.
 *   - subscribeSavedReports() returns SavedAIReport[] sorted updatedAt DESC,
 *     with each entry's Firestore doc ID attached as `.id`.
 */

import { getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getFirestore,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  getDocs,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { SavedAIReport } from './reportTypes';

function getDb(): any {
  return getFirestore(getApp());
}

/**
 * Subscribe to all saved AI reports for a student.
 * Returns an unsubscribe function.
 *
 * Each report is returned with its Firestore document ID in `.id`.
 * Sorted by updatedAt DESC (client-side — avoids composite index).
 */
export function subscribeSavedReports(
  studentId: string,
  cb: (reports: SavedAIReport[]) => void,
): () => void {
  const db = getDb();
  const colRef = collection(db, 'students', studentId, 'aiReports');
  return onSnapshot(colRef, (snap: any) => {
    const reports: SavedAIReport[] = snap.docs.map((d: any) => ({
      id: d.id,
      ...(d.data() as Omit<SavedAIReport, 'id'>),
    }));
    reports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    cb(reports);
  });
}

/**
 * Create a new AI report document.
 * Always creates a NEW document — never overwrites an existing one.
 * Returns the new Firestore document ID.
 */
export async function saveReport(
  studentId: string,
  report: Omit<SavedAIReport, 'id'>,
): Promise<string> {
  const db = getDb();
  const colRef = collection(db, 'students', studentId, 'aiReports');
  const docRef = await addDoc(colRef, report);
  return docRef.id;
}

/**
 * Permanently delete a saved AI report document.
 */
export async function deleteReport(
  studentId: string,
  reportId: string,
): Promise<void> {
  const db = getDb();
  const docRef = doc(db, 'students', studentId, 'aiReports', reportId);
  await deleteDoc(docRef);
}

/**
 * One-time fetch of all saved AI reports for a student (no subscription).
 */
export async function fetchSavedReports(studentId: string): Promise<SavedAIReport[]> {
  const db = getDb();
  const colRef = collection(db, 'students', studentId, 'aiReports');
  const snap = await getDocs(colRef);
  const reports: SavedAIReport[] = snap.docs.map((d: any) => ({
    id: d.id,
    ...(d.data() as Omit<SavedAIReport, 'id'>),
  }));
  return reports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Update specific fields on an existing AI report document.
 * Used when a teacher edits and re-saves a draft they already created.
 */
export async function updateReport(
  studentId: string,
  reportId: string,
  updates: Partial<Omit<SavedAIReport, 'id'>>,
): Promise<void> {
  const db = getDb();
  const docRef = doc(db, 'students', studentId, 'aiReports', reportId);
  await updateDoc(docRef, updates as any);
}
