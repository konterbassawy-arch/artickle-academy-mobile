/**
 * SchoolLessons — Phase 12 + Phase 19.2A
 *
 * Lesson log scoped to the school admin's school.
 * No financial columns (schoolRate/teacherRate hidden). Excel export available.
 * Phase 19.2A: Edit schoolAdminComment / schoolAdminInternalComment + per-lesson PDF.
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Lesson, LessonStatus, DeliveryMode, getDeliveryMode, SchoolEnrollmentPeriod } from '../../types';
import { lessonsToExcel, downloadExcel, LESSON_IMPORT_INSTRUCTIONS } from '../../services/exportUtils';
import { generateSchoolLessonPDF } from '../../services/pdfExport';
import { ViewLessonModal } from '../../components/ViewLessonModal';
import { matchesSearch } from '../../services/searchUtils';

export const SchoolLessons: React.FC = () => {
  const { lessons, students, schools, teachers, schoolEnrollmentPeriods, updateLessonSchoolComment } = useApp(); // already filtered by schoolId in AppContext
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  // Phase 19.4C: student cross-reference filters
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [emailSearch, setEmailSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);
  const [editComment, setEditComment] = useState('');
  const [editInternal, setEditInternal] = useState('');
  const [saving, setSaving] = useState(false);

  // Get unique months from lessons
  const months = useMemo(() => {
    const set = new Set<string>();
    lessons.forEach(l => {
      const d = new Date(l.date);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(set).sort().reverse();
  }, [lessons]);

  // Phase 19.4C: available grades from school-scoped students
  const availableGrades = useMemo(() => {
    const grades = [...new Set(students.map(s => s.yearGrade).filter(Boolean) as string[])];
    return grades.sort((a, b) => Number(a) - Number(b));
  }, [students]);

  const hasStudentFilter = gradeFilter !== 'all' || emailSearch.trim() !== '';

  const matchingStudentIds = useMemo((): Set<string> => {
    if (!hasStudentFilter) return new Set();
    const gradeMatch = gradeFilter !== 'all' ? students.filter(s => s.yearGrade === gradeFilter) : students;
    const emailQ = emailSearch.trim().toLowerCase();
    const emailMatch = emailQ ? gradeMatch.filter(s => s.email?.toLowerCase().includes(emailQ)) : gradeMatch;
    return new Set(emailMatch.map(s => s.id));
  }, [hasStudentFilter, students, gradeFilter, emailSearch]);

  const filtered = useMemo(() => {
    let result = [...lessons];

    if (search) {
      result = result.filter(l =>
        matchesSearch(search, [l.teacherName, ...l.studentNames, l.id])
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(l => l.status === statusFilter);
    }

    if (monthFilter !== 'all') {
      result = result.filter(l => {
        const d = new Date(l.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return key === monthFilter;
      });
    }

    if (dateFrom) {
      result = result.filter(l => l.date.substring(0, 10) >= dateFrom);
    }

    if (dateTo) {
      result = result.filter(l => l.date.substring(0, 10) <= dateTo);
    }

    if (periodFilter !== 'all') {
      const period = schoolEnrollmentPeriods.find(p => p.id === periodFilter);
      if (period) {
        result = result.filter(l => l.date.substring(0, 10) >= period.startDate && l.date.substring(0, 10) <= period.endDate);
      }
    }

    // Phase 19.4C: student cross-reference filter
    if (hasStudentFilter) {
      result = result.filter(l => l.studentIds?.some(id => matchingStudentIds.has(id)) ?? false);
    }

    return result;
  }, [lessons, search, statusFilter, monthFilter, periodFilter, dateFrom, dateTo, hasStudentFilter, matchingStudentIds, schoolEnrollmentPeriods]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(l => l.id)));
    }
  };

  const handleExport = () => {
    const toExport = selectedIds.size > 0
      ? filtered.filter(l => selectedIds.has(l.id))
      : filtered;
    const data = lessonsToExcel(toExport, 'school_admin', { teachers, students, schools });
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadExcel(data, `SchoolLessons_${dateStr}.xlsx`, 'Lessons', LESSON_IMPORT_INSTRUCTIONS);
  };

  // Phase 19.2A: Open edit modal for school comment fields only
  const openEdit = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setEditComment(lesson.schoolAdminComment || '');
    setEditInternal(lesson.schoolAdminInternalComment || '');
  };

  const handleSaveComment = async () => {
    if (!editingLesson) return;
    setSaving(true);
    try {
      await updateLessonSchoolComment(editingLesson.id, editComment, editInternal);
    } catch (e) {
      console.error('Failed to save school comment:', e);
    }
    setSaving(false);
    setEditingLesson(null);
  };

  const statusBadge = (status: string) => {
    const cls = status === LessonStatus.PRESENT || status === LessonStatus.TAUGHT
      ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
      : status === LessonStatus.CANCELLED
        ? 'bg-red-500/15 text-red-400 ring-red-500/20'
        : 'bg-amber-500/15 text-amber-400 ring-amber-500/20';
    return <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ring-1 ${cls}`}>{status}</span>;
  };

  const inputCls = "bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">School Lessons</h2>
          <p className="text-sm text-slate-500 mt-1">Lesson history</p>
        </div>
        <button
          onClick={handleExport}
          className="shrink-0 bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          {selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : 'Export Excel'}
        </button>
      </div>

      {/* Filters card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
        {/* Search row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search teacher, student, or lesson ID..."
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 placeholder:text-slate-500"
            />
          </div>
          <div className="relative flex-1">
            <input
              type="text"
              value={emailSearch}
              onChange={e => setEmailSearch(e.target.value)}
              placeholder="Filter by student email..."
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={monthFilter}
            onChange={e => { setMonthFilter(e.target.value); setDateFrom(''); setDateTo(''); setPeriodFilter('all'); }}
            className={inputCls}
          >
            <option value="all">All Months</option>
            {months.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className={inputCls}
          >
            <option value="all">All Statuses</option>
            <option value={LessonStatus.PRESENT}>Present</option>
            <option value={LessonStatus.TAUGHT}>Taught</option>
            <option value={LessonStatus.ABSENT_EXCUSED}>Absent (Excused)</option>
            <option value={LessonStatus.ABSENT_UNEXCUSED}>Absent (Unexcused)</option>
            <option value={LessonStatus.CANCELLED}>Cancelled</option>
          </select>

          {schoolEnrollmentPeriods.length > 0 && (
            <select
              value={periodFilter}
              onChange={e => { setPeriodFilter(e.target.value); setMonthFilter('all'); setDateFrom(''); setDateTo(''); }}
              className={inputCls}
            >
              <option value="all">All Periods</option>
              {schoolEnrollmentPeriods
                .slice()
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
          )}

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

          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setMonthFilter('all'); setPeriodFilter('all'); }}
              className={inputCls}
            />
            <span className="text-slate-600 text-xs">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setMonthFilter('all'); setPeriodFilter('all'); }}
              className={inputCls}
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-xs text-slate-500 hover:text-rose-400 transition-colors ml-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-600 font-medium">
          {filtered.length} lesson{filtered.length !== 1 ? 's' : ''} found
          {selectedIds.size > 0 && (
            <span className="ml-2 text-primary-400 font-semibold">· {selectedIds.size} selected</span>
          )}
        </p>
      </div>

      {/* Lesson table */}
      {filtered.length === 0 ? (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-10 text-center">
          <p className="text-slate-500 text-sm">No lessons match your filters.</p>
        </div>
      ) : (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Student</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Date</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Time</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Teacher</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Type</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Mode</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Status</th>
                  <th className="text-right px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Duration</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(lesson => (
                  <tr
                    key={lesson.id}
                    onClick={() => setViewingLesson(lesson)}
                    className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${selectedIds.has(lesson.id) ? 'bg-primary-500/5' : ''}`}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lesson.id)}
                        onChange={() => toggleSelect(lesson.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 max-w-[180px]">
                      <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                        {lesson.studentNames.map((name, i) => {
                          const sid = lesson.studentIds?.[i];
                          return sid ? (
                            <button
                              key={sid}
                              onClick={e => { e.stopPropagation(); navigate(`/school/students/${sid}`); }}
                              className="hover:text-primary-400 hover:underline transition-colors text-left"
                            >
                              {name}
                            </button>
                          ) : (
                            <span key={i}>{name}</span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-white tabular-nums">
                      {new Date(lesson.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 tabular-nums">
                      {lesson.date?.includes('T')
                        ? new Date(lesson.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                        : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{lesson.teacherName}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{lesson.type}</td>
                    <td className="px-4 py-3">
                      {getDeliveryMode(lesson) === DeliveryMode.ONLINE
                        ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20 font-medium">Online</span>
                        : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400 ring-1 ring-slate-600/20 font-medium">In-Person</span>
                      }
                    </td>
                    <td className="px-4 py-3">{statusBadge(lesson.status)}</td>
                    <td className="px-4 py-3 text-sm text-white text-right tabular-nums">{lesson.durationMinutes}min</td>
                    <td className="px-4 py-3 flex gap-2.5" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(lesson)} className="text-primary-400 hover:text-primary-300 font-medium text-xs transition-colors">Edit</button>
                      <button onClick={() => generateSchoolLessonPDF(lesson)} className="text-amber-400 hover:text-amber-300 font-medium text-xs transition-colors">PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ViewLessonModal — read-only details; Edit button opens slim comment modal */}
      {viewingLesson && !editingLesson && (
        <ViewLessonModal
          lesson={viewingLesson}
          onClose={() => setViewingLesson(null)}
          onEdit={() => { openEdit(viewingLesson); setViewingLesson(null); }}
          editLabel="+ Add School Comment"
        />
      )}

      {/* Slim school-admin edit modal — minimal context + editable comment fields */}
      {editingLesson && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl">

            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-white font-mono">{editingLesson.id}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(editingLesson.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                  {' · '}
                  {new Date(editingLesson.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button onClick={() => setEditingLesson(null)} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Minimal context */}
            <div className="grid grid-cols-2 gap-3 mb-5 p-3 bg-slate-800/40 rounded-xl">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-0.5">Student</p>
                <p className="text-sm text-slate-300 truncate">{editingLesson.studentNames.join(', ')}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-0.5">Teacher</p>
                <p className="text-sm text-slate-300">{editingLesson.teacherName}</p>
              </div>
            </div>

            {/* Editable comment fields */}
            <div className="space-y-4">
              <div className="border-t border-slate-800 pt-4">
                <p className="text-[10px] text-primary-400 uppercase tracking-wider font-semibold mb-4">School Comments</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">School Teacher Comment</label>
                <p className="text-[10px] text-slate-600 mb-2">Appears on the lesson PDF sent to parents.</p>
                <textarea
                  value={editComment}
                  onChange={e => setEditComment(e.target.value)}
                  placeholder="Enter school teacher comment..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white text-sm h-24 focus:outline-none focus:ring-1 focus:ring-primary-500/40 focus:border-primary-500/50 placeholder:text-slate-600 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">School Admin Internal Comment</label>
                <p className="text-[10px] text-slate-600 mb-2">Internal only — not visible on PDF or to parents.</p>
                <textarea
                  value={editInternal}
                  onChange={e => setEditInternal(e.target.value)}
                  placeholder="Enter internal note..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white text-sm h-24 focus:outline-none focus:ring-1 focus:ring-primary-500/40 focus:border-primary-500/50 placeholder:text-slate-600 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingLesson(null)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveComment}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Comments'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
