/**
 * PeriodSelector — dropdown to choose an enrollment period
 *
 * Used on student detail pages (Admin / School / Teacher) to select
 * which period's lessons feed into the learning journey, exports,
 * and report/certificate generation.
 *
 * READ-ONLY. NO WRITES.
 */

import React from 'react';
import { SchoolEnrollmentPeriod } from '../types';

interface Props {
  periods: SchoolEnrollmentPeriod[];
  /** All currently-selected period/enrollment ids (multi-select). */
  selectedPeriodIds: Set<string>;
  /** Quick single-select from the dropdown — replaces the whole selection (null = clear all). */
  onSelectSingle: (periodId: string | null) => void;
  /** Clear the entire selection. */
  onClear: () => void;
  today?: string;
  /** Number of filtered lessons (shown when a selection is active) */
  filteredCount?: number;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Short month-year, e.g. '2026-02-01' → 'Feb 2026' */
function fmtMonthYear(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export const PeriodSelector: React.FC<Props> = ({
  periods,
  selectedPeriodIds,
  onSelectSingle,
  onClear,
  today: todayProp,
  filteredCount,
}) => {
  const today = todayProp ?? new Date().toISOString().slice(0, 10);
  if (periods.length === 0) return null;

  // Sort: active current first, then by startDate descending
  const sorted = [...periods].sort((a, b) => {
    const aCurrent = today >= a.startDate && today <= a.endDate;
    const bCurrent = today >= b.startDate && today <= b.endDate;
    if (aCurrent && !bCurrent) return -1;
    if (!aCurrent && bCurrent) return 1;
    return b.startDate.localeCompare(a.startDate);
  });

  const count = selectedPeriodIds.size;
  const selectedList = sorted.filter(p => selectedPeriodIds.has(p.id));
  // Dropdown reflects a single selection; shows "Multiple" when >1 are active.
  const dropdownValue = count === 1 ? [...selectedPeriodIds][0] : count > 1 ? '__multi__' : '';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">
          Enrollment Period
        </label>
        <select
          value={dropdownValue}
          onChange={e => { if (e.target.value !== '__multi__') onSelectSingle(e.target.value || null); }}
          className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 min-w-[220px]"
        >
          <option value="">All Periods</option>
          {count > 1 && <option value="__multi__">Multiple selected ({count})</option>}
          {sorted.map(p => {
            const isCurrent = today >= p.startDate && today <= p.endDate;
            const isPast = today > p.endDate;
            const label = p.term
              ? `${p.term}${p.academicYear ? ` · ${p.academicYear}` : ''}`
              : p.name;
            const suffix = isCurrent ? ' (Current)' : isPast ? ' (Past)' : ' (Upcoming)';
            return (
              <option key={p.id} value={p.id}>
                {label}{suffix}
              </option>
            );
          })}
        </select>

        {count > 0 && (
          <button
            onClick={onClear}
            className="text-primary-400 hover:text-white text-xs font-medium transition-colors whitespace-nowrap"
          >
            Clear
          </button>
        )}
        <span className="text-[10px] text-slate-600">Tip: click rows below to select several</span>
      </div>

      {/* Active filter banner */}
      {count > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-primary-500/10 ring-1 ring-primary-500/20">
          <p className="text-xs text-primary-300 font-medium">
            {count === 1 ? (
              <>
                Showing lessons for <span className="font-bold">{selectedList[0]?.name}</span>
                {selectedList[0] && (
                  <span className="text-primary-400/60 ml-2">
                    {fmtDate(selectedList[0].startDate)} → {fmtDate(selectedList[0].endDate)}
                  </span>
                )}
              </>
            ) : (
              <>
                Showing lessons for <span className="font-bold">{count} selections</span>
                <span className="text-primary-400/60 ml-2">{selectedList.map(p => p.name).join(', ')}</span>
              </>
            )}
            {filteredCount != null && (
              <span className="text-primary-400/60 ml-2">
                ({filteredCount} lesson{filteredCount !== 1 ? 's' : ''})
              </span>
            )}
          </p>
          <button
            onClick={onClear}
            className="text-primary-400 hover:text-white text-xs font-medium transition-colors ml-4 whitespace-nowrap"
          >
            Clear ×
          </button>
        </div>
      )}
    </div>
  );
};
