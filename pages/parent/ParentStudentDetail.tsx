/**
 * ChildProgress — Phase 11 / 19.5D
 *
 * Per-child detail view for parents at /parent/child/:childId
 * Refactored in Phase 19.5D to use StudentReportCore with PARENT_REPORT_CONFIG.
 *
 * Privacy rules (enforced by AppContext masking + PARENT_REPORT_CONFIG):
 *   - NO notes (teacher private notes) — masked to undefined by AppContext
 *   - NO schoolAdminInternalComment — masked to undefined by AppContext
 *   - NO financial data — masked to undefined by AppContext
 *   - YES learning, interactivity, behavior, schoolAdminComment, Phase 13 fields
 *   - YES PDF export ("Student Progress Report")
 *   - NO Excel export (PARENT_REPORT_CONFIG.allowExcel = false)
 *   - NO lesson history table (journey cards only — friendlier for parents)
 */

import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Lesson } from '../../types';
import { generateStudentReportPDF, generatePolishReportPDF, generateTermReportPDF } from '../../services/pdfExport';
import { ViewLessonModal } from '../../components/ViewLessonModal';
import { StudentReportCore, PARENT_REPORT_CONFIG } from '../../components/StudentReportCore';
import { subscribeSavedReports } from '../../services/aiSummary/savedReports';
import { SavedAIReport, REPORT_TYPE_LABELS, ReportType } from '../../services/aiSummary/reportTypes';
import { generateCertificatePDF, certInputFromSnapshot } from '../../services/certificateExport';
import { batchPolishForPdf } from '../../services/aiSummary/rewriteText';
import { resolveTermReportSections } from '../../services/aiSummary/resolveAiContent';
// @ts-ignore — CDN import for Firestore (read signature base64 for PDF)
import { getFirestore, doc as firestoreDoc, getDoc as firestoreGetDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';

// ─────────────────────────────────────────────────────────────────────────────
// Read-only reports card — shows saved progress reviews + signed term reports
// ─────────────────────────────────────────────────────────────────────────────

function reportTypeChip(type: ReportType) {
  const style = type === 'polish_report'
    ? 'bg-violet-500/15 border border-violet-500/25 text-violet-400'
    : type === 'certificate'
      ? 'bg-amber-500/15 border border-amber-500/25 text-amber-400'
      : 'bg-blue-500/15 border border-blue-500/25 text-blue-400';
  const label = type === 'polish_report' ? 'Progress' : type === 'certificate' ? 'Cert' : 'Term';
  return (
    <span className={`inline-flex items-center justify-center w-[68px] py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${style}`}>
      {label}
    </span>
  );
}

function relativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface ParentReportsCardProps {
  student: import('../../types').Student;
  childLessons: Lesson[];
  schoolName: string;
  teacherName: string;
  teacherReportDisplayName?: string;
  teacherSignatureUrl?: string;
}

const ParentReportsCard: React.FC<ParentReportsCardProps> = ({
  student,
  childLessons,
  schoolName,
  teacherName,
  teacherReportDisplayName,
  teacherSignatureUrl,
}) => {
  const studentId = student.id;
  const [savedReports, setSavedReports] = useState<SavedAIReport[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    return subscribeSavedReports(studentId, setSavedReports);
  }, [studentId]);

  // Progress reviews + certificates: show all saved. Term reports: only when signed.
  const visibleReports = savedReports.filter(r =>
    r.reportType === 'polish_report' ||
    r.reportType === 'certificate' ||
    (r.reportType === 'term_report' && !!r.approvedByName)
  );

  const handleDownload = async (r: SavedAIReport) => {
    if (downloadingId) return;
    setDownloadingId(r.id ?? null);
    try {
      const sorted = childLessons.slice().sort((a, b) => a.date.localeCompare(b.date));
      const text = r.text.startsWith('** ') ? r.text.slice(3) : r.text;

      if (r.reportType === 'certificate' && r.certificate) {
        await generateCertificatePDF(certInputFromSnapshot(r.certificate, r.text), 'download');
      } else if (r.reportType === 'polish_report') {
        const entries = sorted.map(l => ({
          id: l.id,
          text: [l.learning, l.overallGrade, l.repertoire, l.practiceAssignment, l.notes]
            .filter(Boolean).join(' · '),
        }));
        const polishedNotes = await batchPolishForPdf(entries);
        await generatePolishReportPDF(sorted, student, schoolName, text, polishedNotes, teacherName ?? '', r.periodName);
      } else if (r.reportType === 'term_report') {
        const sections = resolveTermReportSections(text);
        let sigDataUrl: string | undefined;
        if (teacherSignatureUrl && r.approvedByName) {
          try {
            const db = getFirestore(getApp());
            const snap = await firestoreGetDoc(firestoreDoc(db, 'teacherSignatures', student.teacherId));
            if (snap.exists()) sigDataUrl = snap.data()?.base64;
          } catch { /* signature fails gracefully */ }
        }
        await generateTermReportPDF(
          sorted, student, schoolName, sections,
          teacherName ?? '', r.periodName,
          undefined, r.scores,
          r.approvedByName ?? undefined,
          teacherReportDisplayName,
          sigDataUrl,
        );
      } else {
        await generateStudentReportPDF(sorted, student, schoolName, text, r.periodName);
      }
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
          Reports{visibleReports.length > 0 && ` (${visibleReports.length})`}
        </span>
      </div>
      {visibleReports.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-slate-600">No reports available yet</p>
        </div>
      ) : (
      <div className="px-4 py-4 space-y-1.5">
        {visibleReports.map(r => {
          const isLoading = downloadingId === r.id;
          return (
            <button
              key={r.id}
              onClick={() => handleDownload(r)}
              disabled={!!downloadingId}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 hover:border-slate-600/60 transition-all text-left group disabled:opacity-60 disabled:cursor-wait"
            >
              {reportTypeChip(r.reportType)}
              <span className="flex-1 min-w-0">
                <span className="text-xs text-slate-300 group-hover:text-white transition-colors font-medium block truncate">
                  {REPORT_TYPE_LABELS[r.reportType]}
                  {r.periodName && <span className="text-slate-500 font-normal ml-1.5">· {r.periodName}</span>}
                </span>
                <span className="text-[10px] text-slate-600 block">
                  {relativeDate(r.updatedAt)}
                  {r.reportType === 'term_report' && r.approvedByName && (
                    <span className="ml-1.5 text-emerald-500">· Signed</span>
                  )}
                </span>
              </span>
              {isLoading ? (
                <svg className="w-3.5 h-3.5 text-primary-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export const ParentStudentDetail: React.FC = () => {
  const { childId } = useParams<{ childId: string }>();
  const { students, teachers, schools, lessons } = useApp();
  const navigate = useNavigate();

  const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);

  const child   = students.find(s => s.id === childId);
  const teacher = child ? teachers.find(t => t.id === child.teacherId) : undefined;
  const school  = child ? schools.find(sc => sc.id === child.schoolId) : undefined;

  // All lessons for this child — AppContext already scopes to parent's children
  const childLessons = useMemo(
    () => lessons.filter(l => l.studentIds?.includes(childId || '')),
    [lessons, childId]
  );

  // Student not found or not linked to this parent
  if (!child) {
    return (
      <div className="text-center py-24">
        <p className="text-slate-400 text-sm">Student not found or not linked to your account.</p>
        <button
          onClick={() => navigate('/parent/dashboard')}
          className="mt-4 inline-flex items-center gap-1.5 text-primary-400 hover:text-primary-300 text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </button>
      </div>
    );
  }

  // PDF export — oldest-first; AppContext masking ensures no sensitive data passes through
  const handlePdfExport = () => {
    const sorted = childLessons.slice().sort((a, b) => a.date.localeCompare(b.date));
    generateStudentReportPDF(sorted, child, school?.name ?? sorted[0]?.schoolName ?? '');
  };

  return (
    <div className="space-y-6">

      {/* Back navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/parent/dashboard')}
          className="w-9 h-9 rounded-xl bg-slate-800/60 ring-1 ring-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <p className="text-sm text-slate-500">Back to Dashboard</p>
      </div>

      {/* Shared report core — parent config: no notes, no internal, no table, PDF only */}
      <StudentReportCore
        student={child}
        lessons={childLessons}
        schoolName={school?.name ?? ''}
        teacherName={teacher?.name ?? ''}
        config={PARENT_REPORT_CONFIG}
        onExportPdf={handlePdfExport}
        onLessonClick={lesson => setViewingLesson(lesson)}
        renderAfterSummary={() => (
          <ParentReportsCard
            student={child}
            childLessons={childLessons}
            schoolName={school?.name ?? ''}
            teacherName={teacher?.name ?? ''}
            teacherReportDisplayName={teacher?.reportDisplayName}
            teacherSignatureUrl={teacher?.signatureUrl}
          />
        )}
      />

      {/* ViewLessonModal — read-only for parents */}
      {viewingLesson && (
        <ViewLessonModal
          lesson={lessons.find(l => l.id === viewingLesson.id) ?? viewingLesson}
          onClose={() => setViewingLesson(null)}
        />
      )}
    </div>
  );
};
