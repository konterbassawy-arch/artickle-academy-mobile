/**
 * EnrollmentReviewFilters — Phase 19.6D5A
 *
 * Filter row for the Enrollment Review page.
 * All state is lifted to the parent (EnrollmentReview.tsx).
 * Read-only — no writes.
 */

import React from 'react';
import { School, Teacher, Student, SchoolEnrollmentPeriod } from '../../types';

export type ConfidenceFilter = 'any' | 'high' | 'possible' | 'weak' | 'none';

export interface ReviewFilters {
  schoolId: string;         // '' = all
  teacherId: string;        // '' = all
  studentSearch: string;    // substring match on name
  instrument: string;       // '' = all
  dateFrom: string;
  dateTo: string;
  showCancelled: boolean;
  onlyWithSuggestion: boolean;
  /** 19.6D5D — filter by top-suggestion confidence tier; 'none' = rows with zero candidates */
  confidence: ConfidenceFilter;
  groupBy: 'lesson' | 'student' | 'student-instrument';
  /** Filter by linked enrollment's school period ('' = all) */
  periodId: string;
}

export const defaultFilters = (): ReviewFilters => ({
  schoolId: '',
  teacherId: '',
  studentSearch: '',
  instrument: '',
  dateFrom: '',
  dateTo: '',
  showCancelled: false,
  onlyWithSuggestion: false,
  confidence: 'any',
  groupBy: 'lesson',
  periodId: '',
});

const inputCls =
  'bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 placeholder:text-slate-600';

const selectCls =
  'bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-primary-500/50';

interface Props {
  filters: ReviewFilters;
  onChange: (f: ReviewFilters) => void;
  schools: School[];
  teachers: Teacher[];
  students: Student[];
  availableInstruments: string[];
  schoolEnrollmentPeriods: SchoolEnrollmentPeriod[];
  resultCount: number;
  totalCount: number;
}

export const EnrollmentReviewFilters: React.FC<Props> = ({
  filters,
  onChange,
  schools,
  teachers,
  students,
  availableInstruments,
  schoolEnrollmentPeriods,
  resultCount,
  totalCount,
}) => {
  const set = <K extends keyof ReviewFilters>(key: K, val: ReviewFilters[K]) =>
    onChange({ ...filters, [key]: val });

  // When school changes, clear period filter (period belongs to a school)
  const setSchool = (schoolId: string) =>
    onChange({ ...filters, schoolId, periodId: '' });

  // Filter teachers by selected school when a school is chosen
  const filteredTeachers = filters.schoolId
    ? teachers.filter(t => {
        // Teachers are linked to schools via lesson data — show all for simplicity
        return true;
      })
    : teachers;

  // Periods scoped to the selected school (or all active periods if no school selected)
  const availablePeriods = schoolEnrollmentPeriods
    .filter(p => !filters.schoolId || p.schoolId === filters.schoolId)
    .slice()
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="space-y-3">
      {/* Row 1: school / teacher / student / instrument */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filters.schoolId}
          onChange={e => setSchool(e.target.value)}
          className={selectCls}
        >
          <option value="">All Schools</option>
          <option value="__private__">Private (no school)</option>
          {schools
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
        </select>

        {/* Period filter — scoped to selected school */}
        {availablePeriods.length > 0 && (
          <select
            value={filters.periodId}
            onChange={e => set('periodId', e.target.value)}
            className={selectCls}
            title="Filter by school enrollment period"
          >
            <option value="">All Periods</option>
            {availablePeriods.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.term ? ` · ${p.term}` : ''} ({p.academicYear})
                {p.status === 'archived' ? ' [archived]' : ''}
              </option>
            ))}
          </select>
        )}

        <select
          value={filters.teacherId}
          onChange={e => set('teacherId', e.target.value)}
          className={selectCls}
        >
          <option value="">All Teachers</option>
          {filteredTeachers
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
        </select>

        <select
          value={filters.instrument}
          onChange={e => set('instrument', e.target.value)}
          className={selectCls}
        >
          <option value="">All Instruments</option>
          {availableInstruments.map(i => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>

        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={filters.studentSearch}
            onChange={e => set('studentSearch', e.target.value)}
            placeholder="Search student…"
            className={`${inputCls} pl-7 w-40`}
          />
        </div>
      </div>

      {/* Row 2: date range / toggles / group-by / result count */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium shrink-0">Date:</span>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => set('dateFrom', e.target.value)}
          className={`${inputCls} w-36`}
        />
        <span className="text-slate-600 text-xs">—</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => set('dateTo', e.target.value)}
          className={`${inputCls} w-36`}
        />

        {(filters.dateFrom || filters.dateTo) && (
          <button
            onClick={() => onChange({ ...filters, dateFrom: '', dateTo: '' })}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear dates
          </button>
        )}

        <div className="flex items-center gap-1.5 ml-2">
          <input
            type="checkbox"
            id="showCancelled"
            checked={filters.showCancelled}
            onChange={e => set('showCancelled', e.target.checked)}
            className="w-3 h-3 rounded accent-primary-500"
          />
          <label htmlFor="showCancelled" className="text-[11px] text-slate-400 cursor-pointer select-none">
            Show cancelled
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            id="onlyWithSuggestion"
            checked={filters.onlyWithSuggestion}
            onChange={e => set('onlyWithSuggestion', e.target.checked)}
            className="w-3 h-3 rounded accent-primary-500"
          />
          <label htmlFor="onlyWithSuggestion" className="text-[11px] text-slate-400 cursor-pointer select-none">
            Has suggestion
          </label>
        </div>

        {/* 19.6D5D: confidence filter */}
        <div className="flex items-center gap-1.5 ml-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Confidence:</span>
          <select
            value={filters.confidence}
            onChange={e => set('confidence', e.target.value as ReviewFilters['confidence'])}
            className={selectCls}
            title="Filter rows by top-suggestion confidence"
          >
            <option value="any">Any</option>
            <option value="high">High only</option>
            <option value="possible">Possible only</option>
            <option value="weak">Weak only</option>
            <option value="none">No suggestion</option>
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Group-by control */}
          <div className="flex items-center bg-slate-800/60 ring-1 ring-white/5 rounded-lg p-0.5 gap-0.5">
            {(['lesson', 'student', 'student-instrument'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => set('groupBy', mode)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                  filters.groupBy === mode
                    ? 'bg-primary-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {mode === 'lesson' ? 'Lesson' : mode === 'student' ? 'Student' : 'Student + Instrument'}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-slate-500 font-medium shrink-0">
            {resultCount} / {totalCount} lesson{totalCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
};
