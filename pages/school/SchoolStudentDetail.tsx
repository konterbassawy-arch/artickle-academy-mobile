/**
 * SchoolStudentDetail — Phase 19.1C / 19.2A / 19.5B
 *
 * Student detail view for school admin at /school/students/:studentId
 * Refactored in Phase 19.5B to use StudentReportCore.
 *
 * School admin specifics (kept as wrapper-level chrome):
 *   - Edit modal for schoolAdminComment / schoolAdminInternalComment
 *   - Checkbox selection for bulk Excel export
 *   - Per-lesson PDF action button in table
 *
 * AppContext masking enforces: notes=undefined, teacherRate=0
 * SCHOOL_ADMIN_REPORT_CONFIG enforces: showNotes=false, showInternalComment=false (journey cards)
 */

import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Lesson, LessonStatus, DeliveryMode, getDeliveryMode } from '../../types';
import { schoolLessonsToExcel, studentLessonsToExcel, downloadExcel } from '../../services/exportUtils';
import { generateSchoolLessonPDF, generateStudentReportPDF } from '../../services/pdfExport';
import { ViewLessonModal } from '../../components/ViewLessonModal';
import { StudentReportCore, SCHOOL_ADMIN_REPORT_CONFIG } from '../../components/StudentReportCore';
import { SchoolPeriodProgressCard } from '../../components/SchoolPeriodProgressCard';
import { PeriodSelector } from '../../components/PeriodSelector';
import { AISummaryCard } from '../../components/AISummaryCard';

const inputCls =
  'bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20';

const statusBadge = (status: string) => {
  const cls =
    status === LessonStatus.PRESENT || status === LessonStatus.TAUGHT
      ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
      : status === LessonStatus.CANCELLED
      ? 'bg-red-500/15 text-red-400 ring-red-500/20'
      : 'bg-amber-500/15 text-amber-400 ring-amber-500/20';
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ring-1 ${cls}`}>
      {status}
    </span>
  );
};

export const SchoolStudentDetail: React.FC = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { students, teachers, schools, lessons, enrollments, currentUser, updateLessonSchoolComment, schoolEnrollmentPeriods } = useApp();

  // Table filter state — managed here since customTableSection uses them
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal state
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<Set<string>>(new Set());

  // Selection helpers — toggle (multi via row clicks), single (dropdown), clear
  const togglePeriod = (id: string) => setSelectedPeriodIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectSinglePeriod = (id: string | null) => setSelectedPeriodIds(id ? new Set([id]) : new Set());
  const clearPeriods = () => setSelectedPeriodIds(new Set());
  const [editComment, setEditComment] = useState('');
  const [editInternal, setEditInternal] = useState('');
  const [saving, setSaving] = useState(false);

  const student = students.find(s => s.id === studentId);
  const teacher = student ? teachers.find(t => t.id === student.teacherId) : undefined;
  const school  = student ? schools.find(sc => sc.id === student.schoolId) : undefined;

  // All lessons for this student (school scope enforced by AppContext)
  const studentLessons = useMemo(
    () => (student ? lessons.filter(l => l.studentIds?.includes(student.id)) : []),
    [lessons, student]
  );

  // Periods for this student's school (for the period selector dropdown)
  const studentSchoolPeriods = useMemo(
    () => student?.schoolId ? schoolEnrollmentPeriods.filter(p => p.schoolId === student.schoolId) : [],
    [schoolEnrollmentPeriods, student?.schoolId]
  );

  // Combined: school periods + synthetic entries from individual enrollments with dates
  const combinedPeriods = useMemo(() => {
    if (!student) return studentSchoolPeriods;
    const coveredIds = new Set(studentSchoolPeriods.map(p => p.id));
    const synthetic = enrollments
      .filter(e => e.studentId === student.id && e.startDate && e.endDate && (!e.schoolPeriodId || !coveredIds.has(e.schoolPeriodId)))
      .map(e => ({
        id: `enroll_${e.id}`,
        schoolId: e.schoolId ?? '',
        schoolName: e.schoolName ?? '',
        name: e.term || (e.instrument ? `${e.instrument} enrollment` : 'Individual enrollment'),
        academicYear: '',
        term: undefined,
        startDate: e.startDate!,
        endDate: e.endDate!,
        defaultTotalLessons: e.totalLessons,
        defaultDurationMinutes: e.durationMinutes,
        status: 'active' as const,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        createdBy: e.createdBy,
      }));
    return [...studentSchoolPeriods, ...synthetic];
  }, [studentSchoolPeriods, enrollments, student]);

  // Filter by selected periods (UNION of all selected).
  // - Individual enrollment ("enroll_<id>") → match by enrollmentId so overlapping
  //   enrollments of different instruments stay isolated.
  // - School period → match by the period's date range.
  const periodFilteredLessons = useMemo(() => {
    if (selectedPeriodIds.size === 0) return studentLessons;
    const enrollIds = new Set<string>();
    const ranges: { start: string; end: string }[] = [];
    selectedPeriodIds.forEach(id => {
      if (id.startsWith('enroll_')) enrollIds.add(id.slice('enroll_'.length));
      else {
        const p = combinedPeriods.find(pp => pp.id === id);
        if (p) ranges.push({ start: p.startDate, end: p.endDate });
      }
    });
    return studentLessons.filter(l => {
      if (l.enrollmentId && enrollIds.has(l.enrollmentId)) return true;
      const d = l.date.substring(0, 10);
      return ranges.some(r => d >= r.start && d <= r.end);
    });
  }, [studentLessons, selectedPeriodIds, combinedPeriods]);

  const selectedPeriodList = combinedPeriods.filter(p => selectedPeriodIds.has(p.id));
  const selectedPeriod = selectedPeriodList.length === 1 ? selectedPeriodList[0] : null;
  const selectedPeriodLabel = selectedPeriodList.length === 1
    ? selectedPeriodList[0].name
    : selectedPeriodList.length > 1 ? 'Selected_Periods' : undefined;

  // Unique months for filter dropdown
  const months = useMemo(() => {
    const set = new Set<string>();
    studentLessons.forEach(l => {
      const d = new Date(l.date);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(set).sort().reverse();
  }, [studentLessons]);

  // Filtered lesson history for the custom table
  const filteredLessons = useMemo(() => {
    let result = studentLessons.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (statusFilter !== 'all') result = result.filter(l => l.status === statusFilter);
    if (monthFilter !== 'all') {
      result = result.filter(l => {
        const d = new Date(l.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === monthFilter;
      });
    }
    if (dateFrom) result = result.filter(l => l.date.substring(0, 10) >= dateFrom);
    if (dateTo)   result = result.filter(l => l.date.substring(0, 10) <= dateTo);
    return result;
  }, [studentLessons, statusFilter, monthFilter, dateFrom, dateTo]);

  // Student not found — outside school scope or invalid ID
  if (!student) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/school/students')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Students
        </button>
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-12 text-center">
          <p className="text-white font-semibold mb-1">Student not found</p>
          <p className="text-slate-500 text-sm">This student does not exist or is not in your school.</p>
        </div>
      </div>
    );
  }

  // ── Checkbox selection helpers ─────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLessons.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLessons.map(l => l.id)));
    }
  };

  // ── Export handlers ────────────────────────────────────────────────────────
  const handleTableExport = () => {
    const toExport = selectedIds.size > 0
      ? filteredLessons.filter(l => selectedIds.has(l.id))
      : filteredLessons;
    const data = schoolLessonsToExcel(toExport);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadExcel(data, `Student_${student.name.replace(/\s+/g, '_')}_${dateStr}.xlsx`, 'Lessons');
  };

  // Student-level export — use period-filtered lessons when a period is selected
  const handleStudentExcelExport = () => {
    const sorted = periodFilteredLessons.slice().sort((a, b) => a.date.localeCompare(b.date));
    const periodTag = selectedPeriodLabel ? `_${selectedPeriodLabel.replace(/\s+/g, '_')}` : '';
    const data = studentLessonsToExcel(sorted, student.name);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadExcel(data, `StudentReport_${student.name.replace(/\s+/g, '_')}${periodTag}_${dateStr}.xlsx`, 'Learning Journey');
  };

  const handleStudentPdfExport = () => {
    const sorted = periodFilteredLessons.slice().sort((a, b) => a.date.localeCompare(b.date));
    generateStudentReportPDF(sorted, student, sorted[0]?.schoolName ?? '', undefined, selectedPeriodLabel);
  };

  // ── Comment edit modal helpers ─────────────────────────────────────────────
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


  // ── Custom table section (checkbox + Edit + PDF per row) ───────────────────
  const customTableSection = (
    <div>
      {/* Section header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <h3 className="text-base font-semibold text-white">
          Lesson History
          <span className="text-slate-500 font-normal text-sm ml-2">
            ({filteredLessons.length} lesson{filteredLessons.length !== 1 ? 's' : ''}
            {selectedIds.size > 0 && (
              <span className="text-primary-400"> · {selectedIds.size} selected</span>
            )})
          </span>
        </h3>
        <button
          onClick={handleTableExport}
          className="bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 self-start sm:self-auto"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : 'Export Excel'}
        </button>
      </div>

      {/* Filters row 1 */}
      <div className="flex flex-wrap gap-2 mb-2">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputCls}>
          <option value="all">All Statuses</option>
          <option value={LessonStatus.PRESENT}>Present</option>
          <option value={LessonStatus.TAUGHT}>Taught</option>
          <option value={LessonStatus.ABSENT_EXCUSED}>Absent (Excused)</option>
          <option value={LessonStatus.ABSENT_UNEXCUSED}>Absent (Unexcused)</option>
          <option value={LessonStatus.CANCELLED}>Cancelled</option>
        </select>
        <select
          value={monthFilter}
          onChange={e => { setMonthFilter(e.target.value); setDateFrom(''); setDateTo(''); }}
          className={inputCls}
        >
          <option value="all">All Months</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Filters row 2: date range */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-slate-500 font-medium shrink-0">Date range:</span>
        <input
          type="date" value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setMonthFilter('all'); }}
          className={`${inputCls} w-40`}
        />
        <span className="text-xs text-slate-600">—</span>
        <input
          type="date" value={dateTo}
          onChange={e => { setDateTo(e.target.value); setMonthFilter('all'); }}
          className={`${inputCls} w-40`}
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {filteredLessons.length === 0 ? (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-10 text-center">
          <p className="text-slate-500 text-sm">No lessons match this filter.</p>
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
                      checked={selectedIds.size === filteredLessons.length && filteredLessons.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Date</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Teacher</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Type</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Mode</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Status</th>
                  <th className="text-right px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Duration</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLessons.map(lesson => (
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
                    <td className="px-4 py-3 text-sm text-white tabular-nums">
                      {new Date(lesson.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
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
                      <button
                        onClick={() => openEdit(lesson)}
                        className="text-primary-400 hover:text-primary-300 font-medium text-xs transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => generateSchoolLessonPDF(lesson)}
                        className="text-amber-400 hover:text-amber-300 font-medium text-xs transition-colors"
                      >
                        PDF
                      </button>
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

  return (
    <div className="space-y-6">

      {/* Back navigation */}
      <button
        onClick={() => navigate('/school/students')}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Students
      </button>

      {/* Shared report core */}
      <StudentReportCore
        student={student}
        lessons={periodFilteredLessons}
        schoolName={studentLessons[0]?.schoolName ?? ''}
        teacherName={teacher?.name ?? ''}
        config={SCHOOL_ADMIN_REPORT_CONFIG}
        onExportExcel={handleStudentExcelExport}
        onExportPdf={handleStudentPdfExport}
        renderAfterSummary={() => (
          <div className="space-y-5">
            {/* Period selector dropdown */}
            {combinedPeriods.length > 0 && (
              <PeriodSelector
                periods={combinedPeriods}
                selectedPeriodIds={selectedPeriodIds}
                onSelectSingle={selectSinglePeriod}
                onClear={clearPeriods}
                filteredCount={selectedPeriodIds.size > 0 ? periodFilteredLessons.length : undefined}
              />
            )}
            <SchoolPeriodProgressCard
              student={student}
              allLessons={studentLessons}
              allEnrollments={enrollments}
              schoolEnrollmentPeriods={schoolEnrollmentPeriods}
              school={school}
              selectedPeriodIds={selectedPeriodIds}
              onPeriodToggle={togglePeriod}
            />
            <AISummaryCard
              readOnly
              student={student}
              allLessons={studentLessons}
              allEnrollments={enrollments}
              schoolEnrollmentPeriods={schoolEnrollmentPeriods}
              schoolName={school?.name ?? studentLessons[0]?.schoolName ?? ''}
              teacherName={teacher?.name ?? ''}
              teacherReportDisplayName={teacher?.reportDisplayName}
              teacherSignatureUrl={teacher?.signatureUrl}
              filteredLessons={periodFilteredLessons}
              selectedPeriodName={selectedPeriod?.name}
            />
          </div>
        )}
        onLessonClick={lesson => setViewingLesson(lesson)}
        customTableSection={customTableSection}
      />

      {/* ViewLessonModal — read-only details; Edit button opens comment modal */}
      {viewingLesson && !editingLesson && (
        <ViewLessonModal
          lesson={lessons.find(l => l.id === viewingLesson.id) ?? viewingLesson}
          onClose={() => setViewingLesson(null)}
          onEdit={() => { openEdit(viewingLesson); setViewingLesson(null); }}
          editLabel="+ Add Comment"
        />
      )}

      {/* Slim school-admin edit modal */}
      {editingLesson && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl">

            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-white font-mono">{editingLesson.id}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(editingLesson.date).toLocaleDateString('en-US', {
                    weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
                  })}
                  {' · '}
                  {new Date(editingLesson.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button
                onClick={() => setEditingLesson(null)}
                className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
              >
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
