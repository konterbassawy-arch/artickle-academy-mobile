/**
 * ChooseEnrollmentModal — Phase 19.6D5B
 *
 * Shows a list of enrollments for the lesson's student(s).
 * Admin picks one, then the caller opens LinkPreviewModal for final confirmation.
 * READ-ONLY until onSelect is provided and invoked.
 */

import React, { useState, useMemo } from 'react';
import { Lesson, Enrollment, EnrollmentStatus } from '../../types';
import { getEnrollmentRemaining } from '../../types';

interface Props {
  lesson: Lesson;
  enrollments: Enrollment[];
  allLessons: Lesson[];
  /** Called when admin picks an enrollment — caller opens LinkPreviewModal */
  onSelect: (enrollment: Enrollment) => void;
  onClose: () => void;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const statusColor: Record<string, string> = {
  active:    'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
  paused:    'bg-amber-500/15 text-amber-400 ring-amber-500/20',
  completed: 'bg-blue-500/15 text-blue-400 ring-blue-500/20',
  cancelled: 'bg-red-500/15 text-red-400 ring-red-500/20',
};

export const ChooseEnrollmentModal: React.FC<Props> = ({
  lesson,
  enrollments,
  allLessons,
  onSelect,
  onClose,
}) => {
  const [search, setSearch] = useState('');

  // Enrollments for any student in this lesson, excluding cancelled
  const candidates = useMemo(() => {
    const studentIds = lesson.studentIds ?? [];
    return enrollments
      .filter(e =>
        studentIds.includes(e.studentId) &&
        e.status !== EnrollmentStatus.CANCELLED
      )
      .slice() // do not mutate
      .sort((a, b) => {
        // Current first, then by updatedAt desc
        const aActive = a.status === 'active' ? 0 : a.status === 'paused' ? 1 : 2;
        const bActive = b.status === 'active' ? 0 : b.status === 'paused' ? 1 : 2;
        if (aActive !== bActive) return aActive - bActive;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      });
  }, [enrollments, lesson.studentIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.trim().toLowerCase();
    return candidates.filter(
      e =>
        e.instrument.toLowerCase().includes(q) ||
        e.teacherName.toLowerCase().includes(q) ||
        (e.term?.toLowerCase().includes(q) ?? false) ||
        (e.academicYear?.toLowerCase().includes(q) ?? false)
    );
  }, [candidates, search]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white">Choose Enrollment</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {lesson.studentNames.join(', ')} · {lesson.date}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search instrument, teacher, term…"
            className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 pl-9 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40 placeholder:text-slate-600"
            autoFocus
          />
        </div>

        {/* Note when this is a manual pick */}
        <div className="bg-amber-500/10 ring-1 ring-amber-500/20 rounded-lg px-3 py-2 mb-4">
          <p className="text-[11px] text-amber-400">
            ℹ You are manually picking an enrollment. If it doesn't match by instrument/teacher/date, a warning will be shown before confirming.
          </p>
        </div>

        {/* Enrollment list */}
        {filtered.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">
            {candidates.length === 0
              ? 'No active enrollments for this student.'
              : 'No enrollments match your search.'}
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {filtered.map(e => {
              const { consumed, remaining } = getEnrollmentRemaining(e, allLessons);
              const atCapacity = remaining === 0;
              return (
                <div
                  key={e.id}
                  className="bg-slate-800/40 ring-1 ring-white/5 rounded-xl p-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm text-white font-medium">{e.instrument}</span>
                      {e.term && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-500/15 text-primary-300 ring-1 ring-primary-500/20">
                          {e.term}
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ring-1 ${statusColor[e.status] ?? statusColor.completed}`}>
                        {e.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {e.teacherName}
                      {e.startDate && <span className="ml-2">{fmtDate(e.startDate)} → {fmtDate(e.endDate)}</span>}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5 tabular-nums">
                      {consumed} / {e.totalLessons} lessons used · {remaining} remaining
                      {atCapacity && <span className="text-red-400 ml-1">· At capacity</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => onSelect(e)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-600/20 text-primary-300 hover:bg-primary-600/40 hover:text-white transition-all"
                  >
                    Select
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end mt-4 pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
