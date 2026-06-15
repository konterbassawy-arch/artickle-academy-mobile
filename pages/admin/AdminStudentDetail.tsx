/**
 * AdminStudentDetail — Phase 19.4A / 19.5B
 *
 * Admin-side student detail view at /admin/students/:studentId
 * Refactored in Phase 19.5B to use StudentReportCore.
 *
 * Admin visibility (no AppContext masking applies to admin):
 *   - lesson.notes (teacher notes) — visible via ADMIN_REPORT_CONFIG
 *   - schoolAdminComment — visible
 *   - schoolAdminInternalComment — visible but subtle
 *   - No financial fields shown
 *   - No comment editing — admin view is read-only for school admin fields
 */

import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Lesson } from '../../types';
import { studentLessonsToExcel, downloadExcel } from '../../services/exportUtils';
import { generatePolishReportPDF } from '../../services/pdfExport';
import { ViewLessonModal } from '../../components/ViewLessonModal';
import { EditLessonModal } from '../../components/EditLessonModal';
import { StudentReportCore, ADMIN_REPORT_CONFIG } from '../../components/StudentReportCore';
import { SchoolPeriodProgressCard } from '../../components/SchoolPeriodProgressCard';
import { PeriodSelector } from '../../components/PeriodSelector';
import { AISummaryCard } from '../../components/AISummaryCard';
import { Role } from '../../types';

export const AdminStudentDetail: React.FC = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { students, teachers, schools, lessons, enrollments, schoolEnrollmentPeriods, updateLesson, deleteLesson } = useApp();

  const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<Set<string>>(new Set());

  // Selection helpers — toggle (multi via row clicks), single (dropdown), clear
  const togglePeriod = (id: string) => setSelectedPeriodIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectSinglePeriod = (id: string | null) => setSelectedPeriodIds(id ? new Set([id]) : new Set());
  const clearPeriods = () => setSelectedPeriodIds(new Set());

  const student = students.find(s => s.id === studentId);
  const teacher = student ? teachers.find(t => t.id === student.teacherId) : undefined;
  const school  = student ? schools.find(sc => sc.id === student.schoolId) : undefined;

  // All lessons for this student — admin sees all, no schoolId scoping
  const studentLessons = useMemo(
    () => (student ? lessons.filter(l => l.studentIds?.includes(student.id)) : []),
    [lessons, student]
  );

  // Periods for this student's school (for the period selector dropdown)
  const studentSchoolPeriods = useMemo(
    () => student?.schoolId ? schoolEnrollmentPeriods.filter(p => p.schoolId === student.schoolId) : [],
    [schoolEnrollmentPeriods, student?.schoolId]
  );

  // Combined: school periods + synthetic entries from individual enrollments that
  // have their own dates but are NOT already backed by a school period record.
  const combinedPeriods = useMemo(() => {
    if (!student) return studentSchoolPeriods;
    const studentEnrollments = enrollments.filter(e => e.studentId === student.id && e.startDate && e.endDate);
    const coveredPeriodIds = new Set(studentSchoolPeriods.map(p => p.id));
    const synthetic = studentEnrollments
      .filter(e => !e.schoolPeriodId || !coveredPeriodIds.has(e.schoolPeriodId))
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

  // Lessons filtered by selected periods (UNION of all selected).
  // - Individual enrollment ("enroll_<id>") → match by enrollmentId so overlapping
  //   enrollments of different instruments stay isolated.
  // - School period → match by the period's date range.
  const filteredLessons = useMemo(() => {
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

  // Selected period(s) — for export filename + AI summary label.
  const selectedPeriodList = combinedPeriods.filter(p => selectedPeriodIds.has(p.id));
  const selectedPeriod = selectedPeriodList.length === 1 ? selectedPeriodList[0] : null;
  const selectedPeriodLabel = selectedPeriodList.length === 1
    ? selectedPeriodList[0].name
    : selectedPeriodList.length > 1 ? 'Selected_Periods' : undefined;

  // Safe fallback if student not found
  if (!student) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/admin/students')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Students
        </button>
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-12 text-center">
          <p className="text-white font-semibold mb-1">Student not found</p>
          <p className="text-slate-500 text-sm">This student ID does not exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const handleDeleteLesson = async (lesson: Lesson) => {
    const studentList = lesson.studentNames.join(', ');
    const dateStr = new Date(lesson.date).toLocaleDateString();
    const msg = `DELETE LESSON\n\nStudent: ${studentList}\nTeacher: ${lesson.teacherName}\nSchool: ${lesson.schoolName}\nDate: ${dateStr}\nDuration: ${lesson.durationMinutes} min\n\nThis cannot be undone!`;
    if (!window.confirm(msg)) return;
    try {
      await deleteLesson(lesson.id);
      alert('Lesson deleted successfully');
    } catch (error) {
      alert('Error deleting lesson: ' + error);
    }
  };

  // Export handlers — use filteredLessons when a period is selected, otherwise all
  const handleExcelExport = () => {
    const sorted = filteredLessons.slice().sort((a, b) => a.date.localeCompare(b.date));
    const periodTag = selectedPeriodLabel ? `_${selectedPeriodLabel.replace(/\s+/g, '_')}` : '';
    const data = studentLessonsToExcel(sorted, student.name);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadExcel(data, `StudentReport_${student.name.replace(/\s+/g, '_')}${periodTag}_${dateStr}.xlsx`, 'Learning Journey');
  };

  const handlePdfExport = () => {
    const sorted = filteredLessons.slice().sort((a, b) => a.date.localeCompare(b.date));
    generatePolishReportPDF(
      sorted,
      student,
      school?.name ?? sorted[0]?.schoolName ?? '',
      undefined,           // no AI summary → teacher summary section is skipped
      new Map(),           // no polished notes → raw lesson.learning / notes used
      teacher?.name ?? '',
      selectedPeriodLabel,
    );
  };


  return (
    <div className="space-y-6">

      {/* Back navigation */}
      <button
        onClick={() => navigate('/admin/students')}
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
        lessons={filteredLessons}
        schoolName={school?.name ?? ''}
        teacherName={teacher?.name ?? ''}
        config={ADMIN_REPORT_CONFIG}
        onExportExcel={handleExcelExport}
        onExportPdf={handlePdfExport}
        renderAfterSummary={() => (
          <div className="space-y-5">
            {/* Period selector dropdown */}
            {combinedPeriods.length > 0 && (
              <PeriodSelector
                periods={combinedPeriods}
                selectedPeriodIds={selectedPeriodIds}
                onSelectSingle={selectSinglePeriod}
                onClear={clearPeriods}
                filteredCount={selectedPeriodIds.size > 0 ? filteredLessons.length : undefined}
              />
            )}
            {/* Phase 19.6 Reset: school-period auto-progress (school students only) */}
            <SchoolPeriodProgressCard
              student={student}
              allLessons={studentLessons}
              allEnrollments={enrollments}
              schoolEnrollmentPeriods={schoolEnrollmentPeriods}
              school={school}
              viewerRole={Role.ADMIN}
              selectedPeriodIds={selectedPeriodIds}
              onPeriodToggle={togglePeriod}
            />
            <AISummaryCard
              student={student}
              allLessons={studentLessons}
              filteredLessons={selectedPeriodIds.size > 0 ? filteredLessons : undefined}
              selectedPeriodName={selectedPeriod?.name}
              allEnrollments={enrollments}
              schoolEnrollmentPeriods={schoolEnrollmentPeriods}
              schoolName={school?.name}
              teacherName={teacher?.name}
              teacherReportDisplayName={teacher?.reportDisplayName}
              teacherSignatureUrl={teacher?.signatureUrl}
            />
          </div>
        )}
        onLessonClick={lesson => setViewingLesson(lesson)}
        renderLessonActions={lesson => (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setViewingLesson(lesson)}
              className="text-primary-400 hover:text-primary-300 font-medium text-xs transition-colors"
            >
              View
            </button>
            <button
              onClick={() => handleDeleteLesson(lesson)}
              className="text-red-400 hover:text-red-300 font-medium text-xs transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      />

      {/* ViewLessonModal — with Edit button for admin */}
      {viewingLesson && (
        <ViewLessonModal
          lesson={lessons.find(l => l.id === viewingLesson.id) ?? viewingLesson}
          onClose={() => setViewingLesson(null)}
          onEdit={() => { setEditingLesson(viewingLesson); setViewingLesson(null); }}
        />
      )}

      {/* EditLessonModal */}
      {editingLesson && (
        <EditLessonModal
          lesson={lessons.find(l => l.id === editingLesson.id) ?? editingLesson}
          onClose={() => setEditingLesson(null)}
          onSave={(id, data) => {
            updateLesson(id, data);
            setEditingLesson(null);
          }}
        />
      )}
    </div>
  );
};
