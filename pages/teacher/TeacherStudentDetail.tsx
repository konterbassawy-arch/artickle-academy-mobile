/**
 * TeacherStudentDetail — Phase 19.5C
 *
 * Teacher-side student detail view at /teacher/students/:studentId
 * Uses StudentReportCore with TEACHER_REPORT_CONFIG.
 *
 * Teacher visibility:
 *   - lesson.notes (teacher notes) — visible (not masked by AppContext for teachers)
 *   - schoolAdminComment — visible (labeled "School Teacher Comment")
 *   - schoolAdminInternalComment — NOT visible (config + AppContext both gate this)
 *   - hasUnreadAdminNote — visible as unread dot (TEACHER_REPORT_CONFIG.showUnreadDot = true)
 *   - Clicking a card opens ViewLessonModal which clears the unread flag
 *
 * AppContext scoping: students are pre-filtered to only this teacher's students.
 * If the studentId is not in scope, a safe fallback is shown.
 */

import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Lesson } from '../../types';
import { studentLessonsToExcel, downloadExcel } from '../../services/exportUtils';
import { generateStudentReportPDF } from '../../services/pdfExport';
import { ViewLessonModal } from '../../components/ViewLessonModal';
import { StudentReportCore, TEACHER_REPORT_CONFIG } from '../../components/StudentReportCore';
import { SchoolPeriodProgressCard } from '../../components/SchoolPeriodProgressCard';
import { PeriodSelector } from '../../components/PeriodSelector';
import { AISummaryCard } from '../../components/AISummaryCard';

export const TeacherStudentDetail: React.FC = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  // AppContext already scopes students to currentUser.id (teacherId)
  const { students, teachers, schools, lessons, enrollments, currentUser, schoolEnrollmentPeriods } = useApp();

  const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<Set<string>>(new Set());

  // Selection helpers — toggle (multi via row clicks), single (dropdown), clear
  const togglePeriod = (id: string) => setSelectedPeriodIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectSinglePeriod = (id: string | null) => setSelectedPeriodIds(id ? new Set([id]) : new Set());
  const clearPeriods = () => setSelectedPeriodIds(new Set());

  const student = students.find(s => s.id === studentId);
  const teacher = currentUser
    ? teachers.find(t => t.id === currentUser.id)
    : undefined;
  const school  = student ? schools.find(sc => sc.id === student.schoolId) : undefined;

  // Lessons for this student — teacher sees only lessons where they are the teacher
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

  const selectedPeriodList = combinedPeriods.filter(p => selectedPeriodIds.has(p.id));
  const selectedPeriod = selectedPeriodList.length === 1 ? selectedPeriodList[0] : null;
  const selectedPeriodLabel = selectedPeriodList.length === 1
    ? selectedPeriodList[0].name
    : selectedPeriodList.length > 1 ? 'Selected_Periods' : undefined;

  // Safe fallback — student not in this teacher's scope
  if (!student) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/teacher/students')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to My Students
        </button>
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-12 text-center">
          <p className="text-white font-semibold mb-1">Student not found</p>
          <p className="text-slate-500 text-sm">This student is not assigned to you or does not exist.</p>
        </div>
      </div>
    );
  }


  // Export handlers — use filteredLessons when a period is selected, otherwise all
  const handleExcelExport = () => {
    const sorted = filteredLessons.slice().sort((a, b) => a.date.localeCompare(b.date));
    const periodTag = selectedPeriodLabel ? `_${selectedPeriodLabel.replace(/\s+/g, '_')}` : '';
    const data = studentLessonsToExcel(sorted, student.name);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadExcel(
      data,
      `StudentReport_${student.name.replace(/\s+/g, '_')}${periodTag}_${dateStr}.xlsx`,
      'Learning Journey'
    );
  };

  const handlePdfExport = () => {
    const sorted = filteredLessons.slice().sort((a, b) => a.date.localeCompare(b.date));
    generateStudentReportPDF(sorted, student, school?.name ?? sorted[0]?.schoolName ?? '', undefined, selectedPeriodLabel);
  };

  return (
    <div className="space-y-6">

      {/* Back navigation */}
      <button
        onClick={() => navigate('/teacher/students')}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to My Students
      </button>

      {/* Shared report core — teacher config shows notes + unread dots */}
      <StudentReportCore
        student={student}
        lessons={filteredLessons}
        schoolName={school?.name ?? ''}
        teacherName={teacher?.name ?? student.teacherId}
        config={TEACHER_REPORT_CONFIG}
        onExportExcel={handleExcelExport}
        onExportPdf={handlePdfExport}
        onLessonClick={lesson => setViewingLesson(lesson)}
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
            {/* Enrollment progress circles */}
            <SchoolPeriodProgressCard
              student={student}
              allLessons={studentLessons}
              allEnrollments={enrollments}
              schoolEnrollmentPeriods={schoolEnrollmentPeriods}
              school={school}
              selectedPeriodIds={selectedPeriodIds}
              onPeriodToggle={togglePeriod}
            />
            {/* AI.1 — teacher-facing draft summary */}
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
      />

      {/* ViewLessonModal — opens lesson details; clears hasUnreadAdminNote via existing logic */}
      {viewingLesson && (
        <ViewLessonModal
          lesson={lessons.find(l => l.id === viewingLesson.id) ?? viewingLesson}
          onClose={() => setViewingLesson(null)}
        />
      )}
    </div>
  );
};
