/**
 * StudentSelfView — Phase 19.5E
 *
 * Student's own learning progress report at /student/progress
 * Uses StudentReportCore with STUDENT_REPORT_CONFIG.
 *
 * Student visibility (AppContext masking applied):
 *   - lesson.notes — masked to undefined (not shown)
 *   - schoolAdminInternalComment — masked to undefined (not shown)
 *   - schoolAdminComment — visible (labeled "School Teacher Comment")
 *   - learning, interactivity, behavior, Phase 13 fields — all visible
 *   - No financial data
 *   - No lesson history table (journey cards only — friendlier view)
 *   - PDF export available ("My Progress Report" label)
 *
 * Safety fallback: if student.uid is not linked to a student record,
 * shows a clear message to contact school.
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { generateStudentReportPDF } from '../../services/pdfExport';
import { ViewLessonModal } from '../../components/ViewLessonModal';
import { Lesson } from '../../types';
import { StudentReportCore, STUDENT_REPORT_CONFIG } from '../../components/StudentReportCore';

export const StudentSelfView: React.FC = () => {
  const { students, teachers, schools, lessons, currentUser } = useApp();
  const navigate = useNavigate();
  const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);

  // Resolve own student record by Firebase Auth uid
  const myStudent = students.find(s => s.uid === currentUser?.id);
  const teacher   = myStudent ? teachers.find(t => t.id === myStudent.teacherId) : undefined;
  const school    = myStudent ? schools.find(sc => sc.id === myStudent.schoolId) : undefined;

  // AppContext already filters lessons for the student role — all lessons here belong to me
  const myLessons = useMemo(() => lessons, [lessons]);

  // PDF export — oldest-first, labeled "My Progress Report" via student name
  const handlePdfExport = () => {
    if (!myStudent) return;
    const sorted = myLessons.slice().sort((a, b) => a.date.localeCompare(b.date));
    generateStudentReportPDF(sorted, myStudent, school?.name ?? sorted[0]?.schoolName ?? '');
  };

  // Fallback: student record not linked
  if (!myStudent) {
    return (
      <div className="space-y-6">
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-800 ring-1 ring-white/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-1">Your profile is not yet linked.</p>
          <p className="text-slate-500 text-sm">Please contact your school to set up your student account.</p>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="mt-5 inline-flex items-center gap-1.5 text-primary-400 hover:text-primary-300 text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">My Progress</h1>
        <p className="text-slate-500 text-sm mt-1">Your learning journey</p>
      </div>

      {/* Shared report core — student config: no notes, no internal, no table */}
      <StudentReportCore
        student={myStudent}
        lessons={myLessons}
        schoolName={school?.name ?? ''}
        teacherName={teacher?.name ?? ''}
        config={STUDENT_REPORT_CONFIG}
        onExportPdf={handlePdfExport}
        onLessonClick={lesson => setViewingLesson(lesson)}
      />

      {/* ViewLessonModal — student view is read-only */}
      {viewingLesson && (
        <ViewLessonModal
          lesson={lessons.find(l => l.id === viewingLesson.id) ?? viewingLesson}
          onClose={() => setViewingLesson(null)}
        />
      )}
    </div>
  );
};
