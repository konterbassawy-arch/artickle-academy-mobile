/**
 * TeachingAssignmentBackfill — Phase: Student-Centered Teacher Assignment
 * Admin-only diagnostic + migration tool.
 *
 * Phase P3: Dry run — compute proposed assignments for every student and show a diff.
 * Phase P4: Apply  — write the computed assignments + mirrors to Firestore.
 *
 * Navigation: /admin/teaching-assignment-backfill
 * Not in the sidebar — admin navigates here directly when needed.
 */

import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  deriveAssignmentsFromHistory,
  writeTeachingAssignments,
  refreshTeacherUids,
} from '../../services/teachingAssignments';
import { TeachingAssignment } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** ISO date string ~3 months ago */
function threeMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().substring(0, 10);
}

interface StudentRow {
  studentId: string;
  studentName: string;
  existing: TeachingAssignment[];
  proposed: TeachingAssignment[];
  hasChanges: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const TeachingAssignmentBackfill: React.FC = () => {
  const { students, lessons, enrollments, currentUser } = useApp();

  const [status, setStatus] = useState<'idle' | 'applying' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [uidStatus, setUidStatus] = useState<'idle' | 'refreshing' | 'done' | 'error'>('idle');
  const [uidProgress, setUidProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [uidErrorMsg, setUidErrorMsg] = useState<string | null>(null);

  // Admin-only guard
  if (currentUser?.role !== 'admin') {
    return (
      <div className="p-8 text-red-400">
        Access denied — admin only.
      </div>
    );
  }

  // ── Dry-run computation (derived fresh on every render — pure) ────────────
  const cutoff = threeMonthsAgo();
  const rows: StudentRow[] = useMemo(() => {
    return students.map(student => {
      const proposed = deriveAssignmentsFromHistory(student, lessons, enrollments, cutoff);
      const existing: TeachingAssignment[] = student.teachingAssignments ?? [];

      // Determine if there are meaningful changes
      const existingKeys = new Set(existing.map(a => `${a.teacherId}::${a.instrument}::${a.isActive}`));
      const proposedKeys = new Set(proposed.map(a => `${a.teacherId}::${a.instrument}::${a.isActive}`));
      const hasChanges =
        existing.length !== proposed.length ||
        proposed.some(a => !existingKeys.has(`${a.teacherId}::${a.instrument}::${a.isActive}`)) ||
        existing.some(a => !proposedKeys.has(`${a.teacherId}::${a.instrument}::${a.isActive}`));

      return { studentId: student.id, studentName: student.name, existing, proposed, hasChanges };
    });
  }, [students, lessons, enrollments, cutoff]);

  const needsUpdate = rows.filter(r => r.hasChanges);
  const alreadyPopulated = rows.filter(r => !r.hasChanges && r.existing.length > 0);
  const noData = rows.filter(r => r.proposed.length === 0);

  // ── Apply ─────────────────────────────────────────────────────────────────
  const handleApply = async () => {
    if (!window.confirm(
      `Apply teaching assignments to ${needsUpdate.length} student(s)?\n\n` +
      `This writes teachingAssignments, currentTeacherIds, currentTeacherUids to Firestore.\n` +
      `teacherUid will be null until teachers log in — that's expected.\n\n` +
      `Proceed?`
    )) return;

    setStatus('applying');
    setProgress({ done: 0, total: needsUpdate.length });
    setErrorMsg(null);

    let done = 0;
    for (const row of needsUpdate) {
      try {
        await writeTeachingAssignments(row.studentId, row.proposed);
        done++;
        setProgress({ done, total: needsUpdate.length });
      } catch (e: any) {
        setErrorMsg(`Failed on ${row.studentName} (${row.studentId}): ${e?.message}`);
        setStatus('error');
        return;
      }
    }
    setStatus('done');
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── P8: Refresh UIDs ──────────────────────────────────────────────────────
  // Students that have at least one active assignment with teacherUid === null
  const studentsNeedingUidRefresh = students.filter(s =>
    (s.teachingAssignments ?? []).some(a => a.isActive && a.teacherUid === null),
  );

  const handleRefreshUids = async () => {
    if (!window.confirm(
      `Refresh Firebase Auth UIDs on ${studentsNeedingUidRefresh.length} student(s)?\n\n` +
      `This looks up each teacher's uid from /users/{teacherId} and updates\n` +
      `currentTeacherUids on each student. Only teachers who have logged in\n` +
      `at least once will be resolved — others stay null.\n\n` +
      `Safe to re-run at any time. Proceed?`
    )) return;

    setUidStatus('refreshing');
    setUidProgress({ done: 0, total: studentsNeedingUidRefresh.length });
    setUidErrorMsg(null);

    let done = 0;
    for (const student of studentsNeedingUidRefresh) {
      try {
        await refreshTeacherUids(student.id, student.teachingAssignments ?? []);
        done++;
        setUidProgress({ done, total: studentsNeedingUidRefresh.length });
      } catch (e: any) {
        setUidErrorMsg(`Failed on ${student.name} (${student.id}): ${e?.message}`);
        setUidStatus('error');
        return;
      }
    }
    setUidStatus('done');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white mb-1">Teaching Assignment Backfill</h1>
        <p className="text-sm text-slate-400">
          One-time migration tool. Computes and writes{' '}
          <code className="text-violet-300">teachingAssignments</code>,{' '}
          <code className="text-violet-300">currentTeacherIds</code>, and{' '}
          <code className="text-violet-300">currentTeacherUids</code> for every student.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Active criteria: current <code>student.teacherId</code> · active/paused enrollments · lessons within ~3 months.
          <br />
          <code>teacherUid</code> will be <code>null</code> until each teacher logs in — this is expected and safe.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-amber-300">{needsUpdate.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">Students need update</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-emerald-300">{alreadyPopulated.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">Already up to date</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-slate-400">{noData.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">No assignments derived</p>
        </div>
      </div>

      {/* Action buttons */}
      {status === 'idle' && needsUpdate.length > 0 && (
        <button
          onClick={handleApply}
          className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Apply to {needsUpdate.length} student{needsUpdate.length !== 1 ? 's' : ''}
        </button>
      )}

      {status === 'applying' && (
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <svg className="w-4 h-4 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Applying… {progress.done} / {progress.total}
        </div>
      )}

      {status === 'done' && (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Done — {progress.total} student{progress.total !== 1 ? 's' : ''} updated.
        </div>
      )}

      {status === 'error' && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
          <strong>Error:</strong> {errorMsg}
          <br />
          <span className="text-xs text-slate-400">
            The backfill is idempotent — fix the issue and re-run from the top.
          </span>
        </div>
      )}

      {needsUpdate.length === 0 && status === 'idle' && (
        <div className="text-sm text-emerald-400">
          All students are already up to date. No writes needed.
        </div>
      )}

      {/* ── P8: UID Refresh section ─────────────────────────────────────── */}
      <div className="border-t border-slate-800 pt-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Refresh Firebase Auth UIDs</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Looks up each teacher's Firebase Auth UID from <code>/users/&#123;teacherId&#125;.uid</code> and
            populates <code>currentTeacherUids</code> on student docs. Run this after teachers have
            logged in. Required before Firestore rules can enforce teacher-level access.
          </p>
        </div>

        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className={studentsNeedingUidRefresh.length > 0 ? 'text-amber-300 font-semibold' : 'text-emerald-400'}>
            {studentsNeedingUidRefresh.length} student{studentsNeedingUidRefresh.length !== 1 ? 's' : ''} with null teacherUids
          </span>
          {studentsNeedingUidRefresh.length === 0 && (
            <span className="text-slate-600">— all UIDs populated</span>
          )}
        </div>

        {uidStatus === 'idle' && studentsNeedingUidRefresh.length > 0 && (
          <button
            onClick={handleRefreshUids}
            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Refresh UIDs on {studentsNeedingUidRefresh.length} student{studentsNeedingUidRefresh.length !== 1 ? 's' : ''}
          </button>
        )}

        {uidStatus === 'refreshing' && (
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <svg className="w-4 h-4 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Refreshing… {uidProgress.done} / {uidProgress.total}
          </div>
        )}

        {uidStatus === 'done' && (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Done — {uidProgress.total} student{uidProgress.total !== 1 ? 's' : ''} UID-refreshed.
          </div>
        )}

        {uidStatus === 'error' && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
            <strong>Error:</strong> {uidErrorMsg}
            <br />
            <span className="text-xs text-slate-400">Idempotent — fix the issue and re-run.</span>
          </div>
        )}
      </div>

      {/* Student list — only show students that need changes */}
      {needsUpdate.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Students that will be updated ({needsUpdate.length})
          </h2>
          {needsUpdate.map(row => (
            <div
              key={row.studentId}
              className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => toggleExpand(row.studentId)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/40 transition-colors"
              >
                <div>
                  <span className="text-sm font-medium text-white">{row.studentName}</span>
                  <span className="ml-2 text-xs text-slate-500">{row.studentId}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-amber-300">
                    {row.existing.length} → {row.proposed.length} assignment{row.proposed.length !== 1 ? 's' : ''}
                  </span>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${expandedIds.has(row.studentId) ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {expandedIds.has(row.studentId) && (
                <div className="border-t border-slate-800 px-4 py-3 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-slate-500 mb-1.5 font-semibold uppercase tracking-wide">Current (in Firestore)</p>
                    {row.existing.length === 0 ? (
                      <p className="text-slate-600 italic">None</p>
                    ) : (
                      row.existing.map((a, i) => (
                        <div key={i} className="mb-1 text-slate-400">
                          <span className={a.isActive ? 'text-emerald-400' : 'text-slate-600'}>
                            {a.isActive ? '✓' : '✗'}
                          </span>{' '}
                          {a.instrument || '—'} · {a.teacherId}
                          {a.teacherUid && <span className="text-slate-600"> · uid:{a.teacherUid.substring(0, 8)}…</span>}
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1.5 font-semibold uppercase tracking-wide">Proposed</p>
                    {row.proposed.map((a, i) => (
                      <div key={i} className="mb-1 text-slate-300">
                        <span className={a.isActive ? 'text-emerald-400' : 'text-slate-600'}>
                          {a.isActive ? '✓' : '✗'}
                        </span>{' '}
                        {a.instrument || '—'} · {a.teacherId}
                        <span className="text-slate-600"> · uid: null</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeachingAssignmentBackfill;
