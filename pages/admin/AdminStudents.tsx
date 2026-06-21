/**
 * AdminStudents — Phase 19.4A
 *
 * Admin-side student list. Table layout with school filter + search.
 * Admin sees all students across all schools (no AppContext scoping applied).
 * Clicking a row navigates to /admin/students/:studentId
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Role } from '../../types';
import { SchoolPeriodListBadge } from '../../components/SchoolPeriodListBadge';
import { getCompactPeriodSummary } from '../../services/schoolPeriodProgress';
import {
  exportStudentBulkExcel,
  exportStudentBulkPDF,
} from '../../services/studentBulkExport';
import { matchesSearch } from '../../services/searchUtils';

export const AdminStudents: React.FC = () => {
  const { students, teachers, schools, lessons, enrollments, schoolEnrollmentPeriods } = useApp();
  const navigate = useNavigate();
  const [schoolFilter, setSchoolFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  // Phase 19.6 Reset: admin-only renewal filter
  const [renewalsOnly, setRenewalsOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [exportMenuOpen]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const enrichedStudents = useMemo(() => {
    return students.map(s => {
      const teacher = teachers.find(t => t.id === s.teacherId);
      const school = schools.find(sc => sc.id === s.schoolId);
      const lessonCount = lessons.filter(l => l.studentIds?.includes(s.id)).length;
      const summary = getCompactPeriodSummary(s, schoolEnrollmentPeriods, lessons, today, enrollments);
      // Suppress alert when the linked enrollment is completed/cancelled
      const linkedEnrollment = summary
        ? enrollments.find(e => e.studentId === s.id && e.schoolPeriodId === summary.period.id)
        : undefined;
      const enrollmentDone = linkedEnrollment?.status === 'completed' || linkedEnrollment?.status === 'cancelled';
      const alertLevel = summary && summary.isCurrent && !enrollmentDone ? summary.alertLevel : 'none';
      return {
        ...s,
        teacherName: teacher?.name ?? '—',
        schoolName: school?.name ?? '—',
        lessonCount,
        alertLevel,
      };
    });
  }, [students, teachers, schools, lessons, schoolEnrollmentPeriods, today]);

  const availableGrades = useMemo(() => {
    const grades = [...new Set(enrichedStudents.map(s => s.yearGrade).filter(Boolean) as string[])];
    return grades.sort((a, b) => Number(a) - Number(b));
  }, [enrichedStudents]);

  const filtered = useMemo(() => {
    let result = enrichedStudents;
    if (schoolFilter !== 'all') result = result.filter(s => s.schoolId === schoolFilter);
    if (gradeFilter !== 'all') result = result.filter(s => s.yearGrade === gradeFilter);
    if (renewalsOnly) result = result.filter(s => s.alertLevel !== 'none');
    if (search.trim()) {
      result = result.filter(s =>
        matchesSearch(search, [s.name, s.instrument, s.teacherName, s.schoolName, s.email]),
      );
    }
    return result;
  }, [enrichedStudents, schoolFilter, gradeFilter, search, renewalsOnly]);

  const renewalsCount = useMemo(
    () => enrichedStudents.filter(s => s.alertLevel !== 'none').length,
    [enrichedStudents],
  );

  // ── Selection helpers ──────────────────────────────────────────────────────
  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selectedIds.has(s.id));
  const someSelected = selectedIds.size > 0;

  const toggleStudent = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(s => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(s => next.add(s.id));
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ── Export handlers ────────────────────────────────────────────────────────
  const selectedStudents = useMemo(
    () => students.filter(s => selectedIds.has(s.id)),
    [students, selectedIds],
  );

  const handleExportExcel = () => {
    setExportMenuOpen(false);
    exportStudentBulkExcel(selectedStudents, lessons, enrollments, schoolEnrollmentPeriods, teachers, schools);
  };

  const handleExportPdf = async () => {
    setExportMenuOpen(false);
    setExportingPdf(true);
    await exportStudentBulkPDF(selectedStudents, lessons, enrollments, schoolEnrollmentPeriods, teachers, schools);
    setExportingPdf(false);
  };

  const inputCls =
    'bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 placeholder:text-slate-600';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Students</h1>
          <p className="text-slate-500 text-sm mt-1">
            {students.length} student{students.length !== 1 ? 's' : ''}
            <span className="mx-1.5 text-slate-700">·</span>
            {lessons.length} total lesson{lessons.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Export button — top right (matches Lessons Log pattern) */}
        <div className="relative shrink-0" ref={exportMenuRef}>
          <button
            onClick={() => someSelected && setExportMenuOpen(o => !o)}
            disabled={!someSelected || exportingPdf}
            className="bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700/60 disabled:cursor-not-allowed disabled:text-slate-500 active:scale-[0.98] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
            title={someSelected ? 'Export selected students' : 'Select students to export'}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exportingPdf
              ? 'Generating…'
              : someSelected
              ? `Export ${selectedIds.size} selected`
              : 'Export'}
            {someSelected && !exportingPdf && (
              <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>

          {exportMenuOpen && someSelected && (
            <div className="absolute right-0 top-full mt-2 w-44 bg-slate-900 ring-1 ring-white/10 rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-30">
              <button
                onClick={handleExportExcel}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-emerald-600/20 hover:text-emerald-300 transition-colors flex items-center gap-2.5"
              >
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 17v-6a2 2 0 012-2h2a2 2 0 012 2v6m-6 0h6m-3-13a9 9 0 110 18 9 9 0 010-18z" />
                </svg>
                Excel (.xlsx)
              </button>
              <div className="h-px bg-white/5" />
              <button
                onClick={handleExportPdf}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-rose-600/20 hover:text-rose-300 transition-colors flex items-center gap-2.5"
              >
                <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                PDF (.pdf)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={schoolFilter}
          onChange={e => setSchoolFilter(e.target.value)}
          className={inputCls}
        >
          <option value="all">All Schools</option>
          {schools
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
        </select>

        <select
          value={gradeFilter}
          onChange={e => setGradeFilter(e.target.value)}
          className={inputCls}
        >
          <option value="all">All Grades</option>
          {availableGrades.map(g => (
            <option key={g} value={g}>Grade {g}</option>
          ))}
        </select>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, instrument, teacher, school, email..."
            className={`${inputCls} pl-9 w-full`}
          />
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer select-none shrink-0 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-amber-500/40 transition-colors">
          <input
            type="checkbox"
            checked={renewalsOnly}
            onChange={e => setRenewalsOnly(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/40"
          />
          <span className="text-xs text-slate-300 font-medium">
            Renewals
            {renewalsCount > 0 && (
              <span className="ml-1 text-amber-400 tabular-nums">({renewalsCount})</span>
            )}
          </span>
        </label>

        <span className="text-xs text-slate-600 font-medium shrink-0">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Compact selection badge — shown when students are selected */}
      {someSelected && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="px-2 py-1 rounded-full bg-primary-500/15 text-primary-300 font-medium">
            {selectedIds.size} selected
          </span>
          <button
            onClick={clearSelection}
            className="text-slate-500 hover:text-slate-300 transition-colors underline-offset-2 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-10 text-center">
          <p className="text-slate-500 text-sm">No students match this filter.</p>
        </div>
      ) : (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/40 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3.5 text-left w-8">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500/40 cursor-pointer"
                      title={allFilteredSelected ? 'Deselect all' : 'Select all visible'}
                    />
                  </th>
                  <th className="px-5 py-3.5 text-left">Name</th>
                  <th className="px-5 py-3.5 text-left">School</th>
                  <th className="px-5 py-3.5 text-left">Teacher</th>
                  <th className="px-5 py-3.5 text-left">Instrument</th>
                  <th className="px-5 py-3.5 text-left">Enrollment</th>
                  <th className="px-5 py-3.5 text-right">Lessons</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(student => (
                  <tr
                    key={student.id}
                    onClick={() => navigate(`/admin/students/${student.id}`)}
                    className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${
                      selectedIds.has(student.id) ? 'bg-primary-900/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(student.id)}
                        onChange={() => toggleStudent(student.id)}
                        className="rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500/40 cursor-pointer"
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs ring-1 ring-emerald-500/20 shrink-0">
                          {student.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-white font-medium block truncate">{student.name}</span>
                          <span className="text-slate-500 font-mono text-[10px] block truncate">{student.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300">{student.schoolName}</td>
                    <td className="px-5 py-3.5 text-slate-400">{student.teacherName}</td>
                    <td className="px-5 py-3.5 text-slate-400">{student.instrument}</td>
                    <td className="px-5 py-3.5">
                      <SchoolPeriodListBadge
                        student={student}
                        allLessons={lessons}
                        allEnrollments={enrollments}
                        schoolEnrollmentPeriods={schoolEnrollmentPeriods}
                        today={today}
                        viewerRole={Role.ADMIN}
                      />
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-300 tabular-nums font-medium">
                      {student.lessonCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
