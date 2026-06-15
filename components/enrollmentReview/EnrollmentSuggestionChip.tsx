/**
 * EnrollmentSuggestionChip — Phase 19.6D5A
 *
 * Displays the top suggestion for an unlinked lesson.
 * Hovering reveals a score breakdown tooltip.
 * READ-ONLY in Stage A — no interactive callbacks.
 */

import React, { useState, useRef } from 'react';
import { EnrollmentSuggestion } from '../../services/enrollmentReviewSuggestions';

interface Props {
  suggestions: EnrollmentSuggestion[];
  /** Stage B will pass an onClick — undefined in Stage A (read-only) */
  onApply?: (suggestion: EnrollmentSuggestion) => void;
}

export const EnrollmentSuggestionChip: React.FC<Props> = ({ suggestions, onApply }) => {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const chipRef = useRef<HTMLSpanElement>(null);

  if (suggestions.length === 0) {
    return (
      <span className="text-[11px] text-slate-600 whitespace-nowrap">No match</span>
    );
  }

  const top = suggestions[0];
  const extra = suggestions.length - 1;

  const confidenceStyle: Record<string, string> = {
    high:     'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
    possible: 'bg-amber-500/15 text-amber-400 ring-amber-500/20',
    weak:     'bg-slate-700/40 text-slate-400 ring-slate-600/20',
  };

  const confidenceLabel: Record<string, string> = {
    high:     'High confidence',
    possible: 'Possible match',
    weak:     'Weak match',
  };

  const bp = top.breakdown;
  const breakdownRows: Array<[string, number]> = [
    ['Teacher match', bp.teacherMatch],
    ['Date in range', bp.dateInRange],
    ['School match', bp.schoolMatch],
    ['Delivery mode', bp.deliveryModeMatch],
    ['Current bonus', bp.isCurrentBonus],
    ['Duration match', bp.durationMatch],
  ].filter(([, v]) => (v as number) !== 0) as Array<[string, number]>;

  const chipLabel = top.enrollment.term
    ? `${top.enrollment.instrument} · ${top.enrollment.term}`
    : `${top.enrollment.instrument} · ${top.enrollment.studentName}`;

  return (
    <div className="relative inline-block">
      <span
        ref={chipRef}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 cursor-default whitespace-nowrap
          ${confidenceStyle[top.confidence]}
          ${onApply ? 'cursor-pointer hover:opacity-80' : ''}`}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        onClick={() => onApply?.(top)}
      >
        → {chipLabel}
        {top.dateOutOfRange && (
          <span className="ml-0.5 text-amber-400" title="Lesson date is outside enrollment period">⚠</span>
        )}
        {top.wouldExceedCapacity && (
          <span className="ml-0.5 text-red-400" title="Enrollment is at capacity">!</span>
        )}
      </span>

      {extra > 0 && (
        <span className="ml-1 text-[10px] text-slate-500">+{extra}</span>
      )}

      {/* Tooltip */}
      {tooltipVisible && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-48 bg-slate-900 ring-1 ring-white/10 rounded-xl p-3 shadow-xl text-[11px]">
          <p className="text-slate-400 font-semibold mb-1.5 uppercase tracking-wider text-[10px]">
            {confidenceLabel[top.confidence]} · Score {top.breakdown.total}
          </p>
          <div className="space-y-0.5">
            {breakdownRows.map(([label, val]) => (
              <div key={label} className="flex justify-between">
                <span className="text-slate-500">{label}</span>
                <span className={val > 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {val > 0 ? `+${val}` : val}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800 space-y-0.5 text-[10px] text-slate-600">
            <p>{top.enrollment.teacherName} · {top.enrollment.status}</p>
            {top.enrollment.startDate && top.enrollment.endDate && (
              <p>{top.enrollment.startDate} → {top.enrollment.endDate}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
