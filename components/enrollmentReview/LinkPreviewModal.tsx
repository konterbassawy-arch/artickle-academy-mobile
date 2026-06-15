/**
 * LinkPreviewModal — Phase 19.6D5B
 *
 * Preview a single-lesson link before writing.
 * Shows before/after consumed counts, date-range warning, capacity warning.
 * Requires explicit confirmation before invoking onConfirm.
 *
 * READ-ONLY until onConfirm is provided.
 */

import React, { useState } from 'react';
import { Lesson, Enrollment } from '../../types';
import { EnrollmentSuggestion } from '../../services/enrollmentReviewSuggestions';
import { getEnrollmentRemaining } from '../../types';

interface Props {
  lesson: Lesson;
  targetEnrollment: Enrollment;
  suggestion?: EnrollmentSuggestion;  // present when linking via top suggestion
  allLessons: Lesson[];
  /** Hard-block reason — if set, Confirm is disabled with this message */
  blockReason?: string;
  /** Soft-warn reasons — list of advisory warnings to show */
  warnings?: string[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export const LinkPreviewModal: React.FC<Props> = ({
  lesson,
  targetEnrollment,
  suggestion,
  allLessons,
  blockReason,
  warnings = [],
  onConfirm,
  onCancel,
}) => {
  const [confirmed, setConfirmed] = useState(false);
  const [overCapacityAck, setOverCapacityAck] = useState(false);
  const [saving, setSaving] = useState(false);

  const { consumed: consumedBefore, remaining: remainingBefore } = getEnrollmentRemaining(
    targetEnrollment,
    allLessons
  );

  // After linking this lesson (if it has a consumed status), consumed goes up by 1
  const consumedStatusList = ['Present', 'Taught', 'Absent (Unexcused)'];
  const wouldConsume = consumedStatusList.includes(lesson.status);
  const consumedAfter = consumedBefore + (wouldConsume ? 1 : 0);
  const remainingAfter = Math.max(0, targetEnrollment.totalLessons - consumedAfter);
  const isOverCapacity = consumedAfter > targetEnrollment.totalLessons;

  // 19.6D5D: require extra acknowledgement when over-capacity
  const needsOverCapacityAck = isOverCapacity && !blockReason;

  const handleConfirm = async () => {
    if (!confirmed || saving || blockReason) return;
    if (needsOverCapacityAck && !overCapacityAck) return;
    setSaving(true);
    await onConfirm();
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Confirm Lesson Link</h3>
            <p className="text-xs text-slate-500 mt-0.5">Review before writing</p>
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

        {/* Lesson snapshot */}
        <div className="bg-slate-800/40 ring-1 ring-white/5 rounded-xl p-4 space-y-2">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Lesson</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-[10px] text-slate-600">Date</p>
              <p className="text-slate-300">{fmtDate(lesson.date)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-600">Student(s)</p>
              <p className="text-slate-300 truncate">{lesson.studentNames.join(', ')}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-600">Teacher</p>
              <p className="text-slate-300">{lesson.teacherName}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-600">Status</p>
              <p className="text-slate-300">{lesson.status}</p>
            </div>
          </div>
        </div>

        {/* Enrollment snapshot + before/after */}
        <div className="bg-slate-800/40 ring-1 ring-white/5 rounded-xl p-4 space-y-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Target Enrollment</p>
          <p className="text-sm font-semibold text-white">
            {targetEnrollment.instrument}
            {targetEnrollment.term && <span className="text-primary-400 ml-1.5">· {targetEnrollment.term}</span>}
          </p>
          <p className="text-xs text-slate-500">
            {targetEnrollment.teacherName}
            {targetEnrollment.startDate && <span className="ml-2">{fmtDate(targetEnrollment.startDate)} → {fmtDate(targetEnrollment.endDate)}</span>}
          </p>

          {/* Progress */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Before: <strong className="text-white">{consumedBefore} / {targetEnrollment.totalLessons}</strong>
              {' '}({remainingBefore} remaining)
            </span>
            <span className="text-slate-600">→</span>
            <span className={isOverCapacity ? 'text-red-400' : ''}>
              After: <strong className={isOverCapacity ? 'text-red-300' : 'text-white'}>
                {consumedAfter} / {targetEnrollment.totalLessons}
              </strong>
              {' '}({remainingAfter} remaining)
            </span>
          </div>

          {!wouldConsume && (
            <p className="text-[10px] text-slate-600">
              ℹ Lesson status "{lesson.status}" does not consume a slot — consumed count will not change.
            </p>
          )}
        </div>

        {/* Suggestion score badge */}
        {suggestion && (
          <div className="flex items-center gap-2">
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ring-1 ${
              suggestion.confidence === 'high'
                ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
                : suggestion.confidence === 'possible'
                ? 'bg-amber-500/15 text-amber-400 ring-amber-500/20'
                : 'bg-slate-700/40 text-slate-400 ring-slate-600/20'
            }`}>
              {suggestion.confidence === 'high' ? 'High confidence' : suggestion.confidence === 'possible' ? 'Possible match' : 'Weak match'} · score {suggestion.score}
            </span>
            {suggestion.confidence === 'weak' && (
              <span className="text-[10px] text-amber-400">Low score — please verify manually</span>
            )}
          </div>
        )}

        {/* Hard block */}
        {blockReason && (
          <div className="bg-red-500/10 ring-1 ring-red-500/20 rounded-lg px-4 py-2.5">
            <p className="text-sm text-red-400 font-medium">⛔ {blockReason}</p>
          </div>
        )}

        {/* Soft warnings */}
        {warnings.map((w, i) => (
          <div key={i} className="bg-amber-500/10 ring-1 ring-amber-500/20 rounded-lg px-4 py-2.5">
            <p className="text-sm text-amber-400">⚠ {w}</p>
          </div>
        ))}

        {/* Over-capacity soft warn */}
        {isOverCapacity && !blockReason && (
          <div className="bg-red-500/10 ring-1 ring-red-500/20 rounded-lg px-4 py-2.5">
            <p className="text-sm text-red-300 font-medium">⚠ Over capacity</p>
            <p className="text-xs text-red-300/80 mt-0.5">
              Linking this lesson will push <strong>consumed ({consumedAfter})</strong> above <strong>totalLessons ({targetEnrollment.totalLessons})</strong>.
              The enrollment will show as over its limit. Linking is still possible but requires an extra acknowledgement below.
            </p>
          </div>
        )}

        {/* Confirmation checkbox */}
        {!blockReason && (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="linkConfirm"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-primary-500"
              />
              <label htmlFor="linkConfirm" className="text-sm text-slate-300 cursor-pointer select-none">
                I confirm this link is correct
              </label>
            </div>

            {/* 19.6D5D: extra over-capacity confirmation */}
            {needsOverCapacityAck && (
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="linkOverCapacityAck"
                  checked={overCapacityAck}
                  onChange={e => setOverCapacityAck(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-red-500"
                />
                <label htmlFor="linkOverCapacityAck" className="text-sm text-red-300/90 cursor-pointer select-none">
                  I understand this enrollment will go over capacity
                </label>
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-3 pt-1 border-t border-slate-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmed || saving || Boolean(blockReason) || (needsOverCapacityAck && !overCapacityAck)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Linking…' : 'Confirm Link'}
          </button>
        </div>
      </div>
    </div>
  );
};
