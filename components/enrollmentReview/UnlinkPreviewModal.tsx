/**
 * UnlinkPreviewModal — Phase 19.6D5B
 *
 * Preview a single-lesson unlink before writing.
 * Used for Orphaned / Out-of-range / Mismatch tabs.
 */

import React, { useState } from 'react';
import { Lesson, Enrollment } from '../../types';

interface Props {
  lesson: Lesson;
  currentEnrollment: Enrollment | null; // null if orphaned (enrollment deleted)
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export const UnlinkPreviewModal: React.FC<Props> = ({
  lesson,
  currentEnrollment,
  onConfirm,
  onCancel,
}) => {
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!confirmed || saving) return;
    setSaving(true);
    await onConfirm();
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">

        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Confirm Unlink</h3>
            <p className="text-xs text-slate-500 mt-0.5">This will clear the enrollment link for this lesson.</p>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Lesson */}
        <div className="bg-slate-800/40 ring-1 ring-white/5 rounded-xl p-4 space-y-1.5 text-sm">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Lesson</p>
          <p className="text-slate-300">{fmtDate(lesson.date)} · {lesson.studentNames.join(', ')}</p>
          <p className="text-slate-400">{lesson.teacherName} · {lesson.status}</p>
        </div>

        {/* Current enrollment */}
        <div className="bg-slate-800/40 ring-1 ring-white/5 rounded-xl p-4 space-y-1.5 text-sm">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Linked Enrollment</p>
          {currentEnrollment ? (
            <>
              <p className="text-white font-medium">{currentEnrollment.instrument}</p>
              <p className="text-slate-400 text-xs">
                {currentEnrollment.teacherName}
                {currentEnrollment.startDate && (
                  <span className="ml-2">{fmtDate(currentEnrollment.startDate)} → {fmtDate(currentEnrollment.endDate)}</span>
                )}
              </p>
            </>
          ) : (
            <p className="text-red-400 text-xs">Enrollment no longer exists (ID: {lesson.enrollmentId})</p>
          )}
        </div>

        <div className="bg-amber-500/10 ring-1 ring-amber-500/20 rounded-lg px-4 py-2.5">
          <p className="text-sm text-amber-400">
            ⚠ Unlinking is reversible — you can re-link this lesson at any time using the review tool.
          </p>
        </div>

        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="unlinkConfirm"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded accent-primary-500"
          />
          <label htmlFor="unlinkConfirm" className="text-sm text-slate-300 cursor-pointer select-none">
            I confirm I want to unlink this lesson
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-1 border-t border-slate-800">
          <button onClick={onCancel} className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmed || saving}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Unlinking…' : 'Confirm Unlink'}
          </button>
        </div>
      </div>
    </div>
  );
};
