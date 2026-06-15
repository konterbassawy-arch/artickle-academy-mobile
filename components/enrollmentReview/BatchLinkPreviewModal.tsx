/**
 * BatchLinkPreviewModal — Phase 19.6D5C
 *
 * Preview and confirm a batch of lesson→enrollment links before writing.
 *
 * - Shows up to 200 rows (enforced by caller).
 * - Each row has a checkbox — admin can uncheck to exclude individual lessons.
 * - Aggregate warnings: weak matches, over-capacity, date-out-of-range.
 * - Hard-blocked lessons (cancelled enrollment) shown as disabled with badge.
 * - Confirmation checkbox required before write.
 * - onConfirm receives only the checked, non-blocked pairs.
 */

import React, { useState, useMemo } from 'react';
import { Lesson, Enrollment, getEnrollmentRemaining } from '../../types';
import { EnrollmentSuggestion } from '../../services/enrollmentReviewSuggestions';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BatchLinkItem {
  lesson: Lesson;
  enrollment: Enrollment;
  /** Present when linking via suggestion; absent for "link all to single enrollment" */
  suggestion?: EnrollmentSuggestion;
  /** Hard block — lesson cannot be linked (e.g. cancelled enrollment) */
  blockReason?: string;
}

interface Props {
  items: BatchLinkItem[];
  allLessons: Lesson[];
  onConfirm: (pairs: Array<{ lessonId: string; enrollmentId: string }>) => Promise<void>;
  onCancel: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function confidenceBadge(confidence: EnrollmentSuggestion['confidence'], score: number) {
  const cls =
    confidence === 'high'
      ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
      : confidence === 'possible'
      ? 'bg-amber-500/15 text-amber-400 ring-amber-500/20'
      : 'bg-slate-700/40 text-slate-400 ring-slate-600/20';
  const label =
    confidence === 'high' ? 'High' : confidence === 'possible' ? 'Possible' : 'Weak';
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ring-1 ${cls} whitespace-nowrap`}>
      {label} · {score}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export const BatchLinkPreviewModal: React.FC<Props> = ({
  items,
  allLessons,
  onConfirm,
  onCancel,
}) => {
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Start with all non-blocked items checked
  const initialChecked = useMemo(
    () => new Set(items.filter(i => !i.blockReason).map(i => i.lesson.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // intentionally only on mount — items prop is stable
  );
  const [checkedIds, setCheckedIds] = useState<Set<string>>(initialChecked);

  const toggleRow = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const eligible = items.filter(i => !i.blockReason).map(i => i.lesson.id);
    const allChecked = eligible.every(id => checkedIds.has(id));
    if (allChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(eligible));
    }
  };

  // ── Aggregate warnings ────────────────────────────────────────────────────
  const warnings = useMemo(() => {
    const w: string[] = [];
    const checkedItems = items.filter(i => checkedIds.has(i.lesson.id));

    const weakCount = checkedItems.filter(i => i.suggestion?.confidence === 'weak').length;
    if (weakCount > 0) {
      w.push(`${weakCount} lesson${weakCount !== 1 ? 's' : ''} with weak confidence — please verify.`);
    }

    const outOfRangeCount = checkedItems.filter(i => i.suggestion?.dateOutOfRange).length;
    if (outOfRangeCount > 0) {
      w.push(`${outOfRangeCount} lesson${outOfRangeCount !== 1 ? 's' : ''} have dates outside the enrollment period.`);
    }

    // Check per-enrollment over-capacity
    const enrollmentConsumedMap = new Map<string, { enrollment: Enrollment; addCount: number }>();
    for (const item of checkedItems) {
      const key = item.enrollment.id;
      if (!enrollmentConsumedMap.has(key)) {
        enrollmentConsumedMap.set(key, { enrollment: item.enrollment, addCount: 0 });
      }
      // Only count-consuming statuses
      const consumingStatuses = ['Present', 'Taught', 'Absent (Unexcused)'];
      if (consumingStatuses.includes(item.lesson.status)) {
        enrollmentConsumedMap.get(key)!.addCount++;
      }
    }
    for (const { enrollment, addCount } of enrollmentConsumedMap.values()) {
      if (addCount === 0) continue;
      const { consumed } = getEnrollmentRemaining(enrollment, allLessons);
      if (consumed + addCount > enrollment.totalLessons) {
        w.push(`"${enrollment.instrument}" enrollment (${enrollment.teacherName}) will exceed capacity.`);
      }
    }

    return w;
  }, [items, checkedIds, allLessons]);

  const blockedCount = items.filter(i => i.blockReason).length;
  const eligibleCount = items.filter(i => !i.blockReason).length;
  const checkedCount = checkedIds.size;
  const allEligibleChecked =
    eligibleCount > 0 &&
    items.filter(i => !i.blockReason).every(i => checkedIds.has(i.lesson.id));

  const handleConfirm = async () => {
    if (!confirmed || saving || checkedCount === 0) return;
    setSaving(true);
    const pairs = items
      .filter(i => checkedIds.has(i.lesson.id) && !i.blockReason)
      .map(i => ({ lessonId: i.lesson.id, enrollmentId: i.enrollment.id }));
    await onConfirm(pairs);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between mb-4 shrink-0">
          <div>
            <h3 className="text-base font-bold text-white">Batch Link Preview</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {checkedCount} of {eligibleCount} lesson{eligibleCount !== 1 ? 's' : ''} selected
              {blockedCount > 0 && ` · ${blockedCount} blocked`}
            </p>
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

        {/* 19.6D5D: confidence summary breakdown */}
        {(() => {
          const checkedItems = items.filter(i => checkedIds.has(i.lesson.id));
          const high     = checkedItems.filter(i => i.suggestion?.confidence === 'high').length;
          const possible = checkedItems.filter(i => i.suggestion?.confidence === 'possible').length;
          const weak     = checkedItems.filter(i => i.suggestion?.confidence === 'weak').length;
          const manual   = checkedItems.filter(i => !i.suggestion).length;
          return (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3 shrink-0">
              <div className="bg-slate-800/40 ring-1 ring-white/5 rounded-lg px-2.5 py-1.5">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">Total</p>
                <p className="text-sm font-bold text-white tabular-nums">{checkedCount}</p>
              </div>
              <div className="bg-emerald-500/5 ring-1 ring-emerald-500/15 rounded-lg px-2.5 py-1.5">
                <p className="text-[9px] text-emerald-500/80 uppercase tracking-wider">High</p>
                <p className="text-sm font-bold text-emerald-400 tabular-nums">{high}</p>
              </div>
              <div className="bg-amber-500/5 ring-1 ring-amber-500/15 rounded-lg px-2.5 py-1.5">
                <p className="text-[9px] text-amber-500/80 uppercase tracking-wider">Possible</p>
                <p className="text-sm font-bold text-amber-400 tabular-nums">{possible}</p>
              </div>
              <div className="bg-slate-700/20 ring-1 ring-slate-600/20 rounded-lg px-2.5 py-1.5">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">Weak</p>
                <p className="text-sm font-bold text-slate-300 tabular-nums">{weak}</p>
              </div>
              <div className="bg-slate-800/40 ring-1 ring-white/5 rounded-lg px-2.5 py-1.5">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">Manual</p>
                <p className="text-sm font-bold text-slate-300 tabular-nums">{manual}</p>
              </div>
            </div>
          );
        })()}

        {/* Aggregate warnings */}
        {warnings.map((w, i) => (
          <div key={i} className="bg-amber-500/10 ring-1 ring-amber-500/20 rounded-lg px-3 py-2 mb-3 shrink-0">
            <p className="text-xs text-amber-400">⚠ {w}</p>
          </div>
        ))}

        {/* Table — scrollable */}
        <div className="flex-1 overflow-y-auto rounded-xl ring-1 ring-white/5 bg-slate-800/20 mb-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-800/90 backdrop-blur-sm">
              <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                <th className="pl-3 pr-2 py-2">
                  <input
                    type="checkbox"
                    checked={allEligibleChecked}
                    onChange={toggleAll}
                    className="rounded accent-primary-500"
                    disabled={eligibleCount === 0}
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Student</th>
                <th className="px-3 py-2 text-left font-medium">Enrollment</th>
                <th className="px-3 py-2 text-left font-medium">Teacher</th>
                <th className="px-3 py-2 text-left font-medium">Confidence</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {items.map(item => {
                const isBlocked = Boolean(item.blockReason);
                const isChecked = checkedIds.has(item.lesson.id);
                return (
                  <tr
                    key={item.lesson.id}
                    className={`transition-colors ${
                      isBlocked
                        ? 'opacity-40'
                        : isChecked
                        ? 'bg-primary-500/5'
                        : 'opacity-60'
                    }`}
                  >
                    <td className="pl-3 pr-2 py-2.5" onClick={() => !isBlocked && toggleRow(item.lesson.id)}>
                      <input
                        type="checkbox"
                        checked={isChecked && !isBlocked}
                        disabled={isBlocked}
                        onChange={() => !isBlocked && toggleRow(item.lesson.id)}
                        className="rounded accent-primary-500 disabled:opacity-30 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-white tabular-nums whitespace-nowrap text-xs">
                      {fmtDate(item.lesson.date)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300 text-xs max-w-[120px]">
                      <span className="truncate block">{item.lesson.studentNames.join(', ')}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <span className="text-white font-medium">{item.enrollment.instrument}</span>
                      {item.enrollment.term && (
                        <span className="text-primary-400 ml-1 text-[10px]">· {item.enrollment.term}</span>
                      )}
                      {isBlocked && (
                        <span className="ml-1.5 text-[9px] text-red-400 ring-1 ring-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                          Blocked
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 text-xs whitespace-nowrap">
                      {item.enrollment.teacherName}
                    </td>
                    <td className="px-3 py-2.5">
                      {item.suggestion
                        ? confidenceBadge(item.suggestion.confidence, item.suggestion.score)
                        : <span className="text-[10px] text-slate-600">Manual</span>
                      }
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {item.lesson.status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Info bar */}
        <div className="bg-blue-500/10 ring-1 ring-blue-500/20 rounded-lg px-3 py-2 mb-4 shrink-0">
          <p className="text-xs text-blue-300">
            <strong>Writes only:</strong>{' '}
            <code className="bg-slate-800 px-1 py-0.5 rounded text-[10px]">lesson.enrollmentId</code>{' '}
            and <code className="bg-slate-800 px-1 py-0.5 rounded text-[10px]">lesson.updatedAt</code> on each selected lesson.
            No enrollment or student data is modified.
          </p>
        </div>

        {/* Confirmation checkbox */}
        <div className="flex items-start gap-2 mb-4 shrink-0">
          <input
            type="checkbox"
            id="batchLinkConfirm"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            disabled={checkedCount === 0}
            className="mt-0.5 w-4 h-4 rounded accent-primary-500 disabled:opacity-30"
          />
          <label
            htmlFor="batchLinkConfirm"
            className={`text-sm cursor-pointer select-none ${checkedCount === 0 ? 'text-slate-600' : 'text-slate-300'}`}
          >
            I confirm I want to link {checkedCount} lesson{checkedCount !== 1 ? 's' : ''}
          </label>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800 shrink-0">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmed || saving || checkedCount === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? `Linking ${checkedCount}…` : `Confirm — Link ${checkedCount}`}
          </button>
        </div>
      </div>
    </div>
  );
};
