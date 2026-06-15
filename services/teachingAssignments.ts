/**
 * services/teachingAssignments.ts
 * Phase: Student-Centered Teacher Assignment
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SINGLE CHOKE-POINT                                                      ║
 * ║  All writes to these three Student fields MUST go through this module:   ║
 * ║    • teachingAssignments                                                  ║
 * ║    • currentTeacherIds   (derived mirror)                                 ║
 * ║    • currentTeacherUids  (derived mirror)                                 ║
 * ║  No other code may write these fields directly.                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Uses getApp() to reuse the already-initialized Firebase app from AppContext.
 */

import { getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

import {
  TeachingAssignment,
  Student,
  Lesson,
  Enrollment,
  EnrollmentStatus,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Internal Firestore accessor
// ─────────────────────────────────────────────────────────────────────────────

function getDb(): any {
  return getFirestore(getApp());
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (no Firestore I/O)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recompute the flat mirror arrays from an assignment list.
 * Call this every time assignments change; never store stale mirrors.
 */
export function computeAssignmentMirrors(assignments: TeachingAssignment[]): {
  currentTeacherIds: string[];
  currentTeacherUids: string[];
} {
  const active = assignments.filter(a => a.isActive);
  return {
    currentTeacherIds: [...new Set(active.map(a => a.teacherId))],
    currentTeacherUids: [
      ...new Set(
        active.filter(a => a.teacherUid != null).map(a => a.teacherUid as string),
      ),
    ],
  };
}

/**
 * Derive an initial assignment list from existing student + lesson + enrollment data.
 * Used for the one-time backfill only — not during normal operations.
 *
 * Active criteria (approved plan, P3/P4):
 *  1. Matches student.teacherId (primary — always active)
 *  2. Has an active enrollment for this student
 *  3. Has a lesson within ~3 months (cutoffDate) for this student
 *
 * teacherUid is always null here — the UID backfill runs separately.
 */
export function deriveAssignmentsFromHistory(
  student: Student,
  allLessons: Lesson[],
  allEnrollments: Enrollment[],
  cutoffDate: string, // ISO date string, ~3 months ago
): TeachingAssignment[] {
  const now = new Date().toISOString();
  // key = "teacherId::instrument" to deduplicate
  const map = new Map<string, TeachingAssignment>();

  const addAssignment = (teacherId: string, instrument: string, schoolId?: string) => {
    if (!teacherId) return;
    const key = `${teacherId}::${instrument}`;
    if (!map.has(key)) {
      map.set(key, {
        instrument,
        teacherId,
        teacherUid: null,
        schoolId,
        isActive: true,
        assignedAt: now,
      });
    }
  };

  // 1. Primary teacher from student record
  addAssignment(
    student.teacherId,
    student.instrument || '',
    student.schoolId || undefined,
  );

  // 2. Active (or paused — still current) enrollments
  const todayISO = now.substring(0, 10);
  const activeEnrollments = allEnrollments.filter(
    e =>
      e.studentId === student.id &&
      (e.status === EnrollmentStatus.ACTIVE || e.status === EnrollmentStatus.PAUSED) &&
      (!e.endDate || e.endDate >= todayISO),
  );
  for (const enr of activeEnrollments) {
    addAssignment(
      enr.teacherId,
      enr.instrument || student.instrument || '',
      enr.schoolId || student.schoolId || undefined,
    );
  }

  // 3. Recent lessons (within ~3 months)
  const recentTeacherIds = new Set<string>();
  allLessons
    .filter(
      l =>
        l.teacherId &&
        l.studentIds.includes(student.id) &&
        l.date >= cutoffDate,
    )
    .forEach(l => recentTeacherIds.add(l.teacherId));

  for (const teacherId of recentTeacherIds) {
    // Try to find the instrument from an enrollment for this teacher
    const matchingEnr = allEnrollments.find(
      e => e.studentId === student.id && e.teacherId === teacherId,
    );
    const instrument = matchingEnr?.instrument || student.instrument || '';
    addAssignment(teacherId, instrument, student.schoolId || undefined);
  }

  return Array.from(map.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a teacher's Firebase Auth UID from their user document.
 * Returns null if the user doc doesn't exist or hasn't recorded a UID yet
 * (i.e., the teacher has never logged in since UID recording was added).
 */
export async function getTeacherUid(teacherId: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(getDb(), 'users', teacherId));
    if (!snap.exists()) return null;
    return (snap.data() as any).uid ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore writes  ← THE ONLY PLACE these fields are written
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write teaching assignments + derived mirrors to a student document.
 *
 * This is the ONLY function allowed to write:
 *   - student.teachingAssignments
 *   - student.currentTeacherIds
 *   - student.currentTeacherUids
 *
 * Uses merge:true so all other student fields are preserved.
 */
export async function writeTeachingAssignments(
  studentId: string,
  assignments: TeachingAssignment[],
): Promise<void> {
  const mirrors = computeAssignmentMirrors(assignments);
  await setDoc(
    doc(getDb(), 'students', studentId),
    {
      teachingAssignments: assignments,
      currentTeacherIds: mirrors.currentTeacherIds,
      currentTeacherUids: mirrors.currentTeacherUids,
    },
    { merge: true },
  );
}

/**
 * Set (or update) the primary teaching assignment for a student.
 * Called when a student is created or when their primary teacher/instrument changes.
 *
 * Logic:
 *  - Re-activates an existing matching assignment if found inactive.
 *  - Deactivates the old assignment for the same instrument if the teacher changed.
 *  - Appends a new assignment if no match exists.
 *  - Always looks up teacherUid from the users collection.
 */
export async function setPrimaryAssignment(
  student: Pick<Student, 'id' | 'schoolId'> & {
    teachingAssignments?: TeachingAssignment[];
  },
  newTeacherId: string,
  newInstrument: string,
): Promise<void> {
  if (!newTeacherId) return;

  const now = new Date().toISOString();
  const teacherUid = await getTeacherUid(newTeacherId);
  const existing: TeachingAssignment[] = student.teachingAssignments ?? [];
  const newKey = `${newTeacherId}::${newInstrument}`;

  const updated: TeachingAssignment[] = existing.map(a => {
    const aKey = `${a.teacherId}::${a.instrument}`;

    // Deactivate an old active assignment for the same instrument (teacher change)
    if (a.isActive && a.instrument === newInstrument && aKey !== newKey) {
      return { ...a, isActive: false, endedAt: now };
    }

    // Re-activate a previously inactive matching assignment
    if (aKey === newKey && !a.isActive) {
      return { ...a, isActive: true, endedAt: undefined, teacherUid };
    }

    // Update UID on an existing active matching assignment
    if (aKey === newKey && a.isActive) {
      return { ...a, teacherUid };
    }

    return a;
  });

  // Append new assignment if it doesn't exist at all
  const exists = updated.some(a => `${a.teacherId}::${a.instrument}` === newKey);
  if (!exists) {
    updated.push({
      instrument: newInstrument,
      teacherId: newTeacherId,
      teacherUid,
      schoolId: student.schoolId || undefined,
      isActive: true,
      assignedAt: now,
    });
  }

  await writeTeachingAssignments(student.id, updated);
}

/**
 * Refresh teacherUid on all active assignments for a student.
 * Called after a UID backfill to update stale null values.
 */
export async function refreshTeacherUids(
  studentId: string,
  assignments: TeachingAssignment[],
): Promise<void> {
  const updated = await Promise.all(
    assignments.map(async a => {
      if (!a.isActive) return a;
      const uid = await getTeacherUid(a.teacherId);
      return uid !== a.teacherUid ? { ...a, teacherUid: uid } : a;
    }),
  );
  await writeTeachingAssignments(studentId, updated);
}
