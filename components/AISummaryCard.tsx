/**
 * AISummaryCard — Phase AI.3
 *
 * Teacher + admin card for generating and saving AI reports.
 * school_admin sees a read-only version (readOnly prop).
 *
 * Data model (AI.3):
 *   - Each saved report is an independent document in
 *     students/{studentId}/aiReports/{reportId}  (auto-generated ID).
 *   - Multiple drafts per type are allowed; no overwriting.
 *   - Editing an existing draft updates that document in place.
 *   - Saving a fresh AI draft creates a new document.
 *
 * UI:
 *   - Generate buttons (teacher/admin only) show the most-recent saved
 *     draft for each type (if any).
 *   - A "Saved Drafts" list below shows all saved reports sorted by
 *     updatedAt DESC; clicking any opens it in the preview modal.
 *   - readOnly=true (school_admin): shows only the drafts list, no
 *     generate buttons and no edit/save/regenerate in the modal.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Student, Lesson, Enrollment, SchoolEnrollmentPeriod, LessonStatus, Role } from '../types';
import { useApp } from '../context/AppContext';
import { generateReport } from '../services/aiSummary/index';
import {
  AIReport,
  SavedAIReport,
  TermReportScores,
  ReportType,
  REPORT_TYPE_LABELS,
  REPORT_TYPE_DESCRIPTIONS,
  PROMPT_VERSION,
  PROVIDER_VERSION,
} from '../services/aiSummary/reportTypes';
import { subscribeSavedReports, saveReport, updateReport, deleteReport } from '../services/aiSummary/savedReports';
import { AIReportPreviewModal } from './AIReportPreviewModal';
import { CertificateModal } from './CertificateModal';
import { CertInput, snapshotFromCertInput, certInputFromSnapshot, resolveCertInput, buildCompletionLine, generateCertificatePDF, certInputFromEnrollment, mergeCertInputs, consumedLessonRange } from '../services/certificateExport';
import { loadSchoolCertificateConfig } from '../services/schoolCertificate';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format ISO date 'YYYY-MM-DD' → e.g. '15 Jan' or '15 Jan 2025' */
function fmtDate(iso: string, showYear = false): string {
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDate();
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  return showYear ? `${day} ${mon} ${d.getFullYear()}` : `${day} ${mon}`;
}

function periodRange(start?: string, end?: string): string {
  if (!start || !end) return '';
  const sy = start.slice(0, 4);
  const ey = end.slice(0, 4);
  return `${fmtDate(start, sy !== ey)} – ${fmtDate(end, sy !== ey)}`;
}

/**
 * Try to infer which enrollment period a report was generated for,
 * used as a fallback when the report has no stored period fields.
 * Filters to the same school, looks for a period containing generatedAt,
 * then falls back to the most-recently-ended period before that date.
 */
function inferPeriod(
  report: SavedAIReport,
  periods: SchoolEnrollmentPeriod[],
  schoolId: string,
): SchoolEnrollmentPeriod | undefined {
  const genDate = report.generatedAt.slice(0, 10);
  const school = periods.filter(p => p.schoolId === schoolId);
  const within = school.find(p => p.startDate <= genDate && p.endDate >= genDate);
  if (within) return within;
  // Most recent period that ended before generatedAt
  return school
    .filter(p => p.endDate < genDate)
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Generate button (teacher/admin only)
// ─────────────────────────────────────────────────────────────────────────────

function ReportButton({
  reportType,
  loading,
  latestSaved,
  label,
  onClick,
}: {
  reportType: ReportType;
  loading: boolean;
  latestSaved: SavedAIReport | null;
  label: string;
  onClick: () => void;
}) {
  const isPolish = reportType === 'polish_report';
  const hasSaved = latestSaved != null;

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex-1 flex flex-col items-start gap-1.5 px-4 py-3 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800 hover:border-slate-600 transition-all group disabled:opacity-60 disabled:cursor-wait text-left"
    >
      <div className="flex items-center gap-2 w-full">
        {loading ? (
          <svg className="w-4 h-4 text-primary-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : isPolish ? (
          <svg className="w-4 h-4 text-primary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-primary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
        <span className="text-sm font-medium text-white group-hover:text-primary-300 transition-colors flex-1">
          {loading ? 'Generating…' : label}
        </span>
        {hasSaved && !loading && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[10px] font-semibold flex-shrink-0">
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 w-full pl-6">
        {hasSaved && !loading
          ? `Latest: ${relativeTime(latestSaved!.updatedAt)}`
          : REPORT_TYPE_DESCRIPTIONS[reportType]}
      </p>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface AISummaryCardProps {
  student: Student;
  allLessons: Lesson[];
  allEnrollments: Enrollment[];
  schoolEnrollmentPeriods: SchoolEnrollmentPeriod[];
  schoolName?: string;
  teacherName?: string;
  teacherReportDisplayName?: string;
  teacherSignatureUrl?: string;
  filteredLessons?: Lesson[];
  selectedPeriodName?: string;
  /** school_admin: view-only — shows drafts list, no generate/edit/save/regenerate */
  readOnly?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main card
// ─────────────────────────────────────────────────────────────────────────────

export const AISummaryCard: React.FC<AISummaryCardProps> = ({
  student,
  allLessons,
  allEnrollments,
  schoolEnrollmentPeriods,
  schoolName,
  teacherName,
  teacherReportDisplayName,
  teacherSignatureUrl,
  filteredLessons,
  selectedPeriodName,
  readOnly = false,
}) => {
  const { currentUser } = useApp();
  const isAdmin = currentUser?.role === Role.ADMIN;

  const [loadingType, setLoadingType] = useState<ReportType | null>(null);
  const [certModal, setCertModal] = useState<{ data: CertInput; text?: string; editId: string | null } | null>(null);
  const [certSaving, setCertSaving] = useState(false);
  const [certDownloadingId, setCertDownloadingId] = useState<string | null>(null);
  const [certPicker, setCertPicker] = useState<{ enrollments: Enrollment[]; selected: Set<string> } | null>(null);
  /** True when the student's school has a certificate logo configured (enables co-branding). */
  const [schoolHasLogo, setSchoolHasLogo] = useState(false);
  const [activeReport, setActiveReport] = useState<AIReport | null>(null);
  const [activeReportType, setActiveReportType] = useState<ReportType | null>(null);
  /**
   * Firestore doc ID of the report currently shown in the modal.
   * null  → fresh AI draft, not yet saved.
   * string → editing / viewing a specific existing saved report.
   */
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  /** All saved reports for this student, sorted updatedAt DESC. */
  const [savedReports, setSavedReports] = useState<SavedAIReport[]>([]);

  /** Duplicate-warning: report type waiting for user confirmation */
  const [pendingGenerateType, setPendingGenerateType] = useState<ReportType | null>(null);
  /** ID of the saved report row currently flashing to draw attention */
  const [flashingReportId, setFlashingReportId] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use period-filtered lessons when a filter is active
  const lessonsForReport = (filteredLessons && filteredLessons.length > 0)
    ? filteredLessons
    : allLessons;

  const termPeriodLabel = selectedPeriodName ?? undefined;

  const termReportLabel = termPeriodLabel
    ? `End of ${termPeriodLabel} Report`
    : 'End of Enrollment Report';

  // ── Certificate of Completion — same card as the reports ──────────────────
  // Resolve the enrollment to certify: the one matching the selected period,
  // else the student's most-recent enrollment. Hidden when none exists.
  /** Recompute teacherIds from all lessons (never trust stored values). */
  const computeTeacherIds = useCallback((): string[] => {
    const set = new Set<string>();
    if (student.teacherId) set.add(student.teacherId);
    allLessons.forEach(l => {
      if (l.studentIds.includes(student.id) && l.teacherId) set.add(l.teacherId);
    });
    return Array.from(set);
  }, [student, allLessons]);

  // Resolve certificate data for ANY student (enrollment → period → lessons).
  const certData = useMemo<CertInput | null>(
    () => resolveCertInput(student, allEnrollments, schoolEnrollmentPeriods, allLessons, schoolName ?? '', teacherName, selectedPeriodName ?? undefined),
    [student, allEnrollments, schoolEnrollmentPeriods, allLessons, schoolName, teacherName, selectedPeriodName],
  );

  /** Latest saved certificate for the currently-resolved course (if any). */
  const latestCertForEnrollment = useMemo(
    () => (certData
      ? savedReports.find(r => r.reportType === 'certificate' && r.certificate?.enrollmentId === certData.id) ?? null
      : null),
    [savedReports, certData],
  );

  // Student's enrollments (all statuses) — used for the multi-enrollment picker.
  const studentEnrollments = useMemo(
    () => allEnrollments.filter(e => e.studentId === student.id)
      .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '') || (a.createdAt ?? 0) - (b.createdAt ?? 0)),
    [allEnrollments, student.id],
  );

  // Open the certificate editor — shows enrollment picker first when >1 enrollment.
  const handleOpenCertificate = useCallback(() => {
    if (!certData) return;
    if (studentEnrollments.length > 1) {
      // Pre-select all enrollments by default
      setCertPicker({ enrollments: studentEnrollments, selected: new Set(studentEnrollments.map(e => e.id)) });
      return;
    }
    setCertModal({
      data: { ...certData, coBranded: latestCertForEnrollment?.certificate?.coBranded ?? schoolHasLogo },
      text: latestCertForEnrollment?.text,
      editId: latestCertForEnrollment?.id ?? null,
    });
  }, [certData, latestCertForEnrollment, studentEnrollments, schoolHasLogo]);

  // Confirm enrollment picker → merge selected enrollments → open modal.
  const handleCertPickerConfirm = useCallback(() => {
    if (!certPicker) return;
    const selected = certPicker.enrollments.filter(e => certPicker.selected.has(e.id));
    if (!selected.length) return;
    const inputs = selected.map(e => certInputFromEnrollment(e, student, schoolName ?? '', teacherName));
    const merged = mergeCertInputs(inputs);
    // Default date range = first → last paid lesson across the selected enrollment(s).
    const range = consumedLessonRange(allLessons, selected.map(e => e.id));
    // Find an existing saved cert matching the primary enrollment
    const existingCert = savedReports.find(r =>
      r.reportType === 'certificate' && r.certificate?.enrollmentId === selected[0].id,
    ) ?? null;
    const data: CertInput = {
      ...merged,
      startDate: range.startDate ?? merged.startDate,
      endDate: range.endDate ?? merged.endDate,
      coBranded: existingCert?.certificate?.coBranded ?? schoolHasLogo,
    };
    setCertPicker(null);
    setCertModal({ data, text: existingCert?.text, editId: existingCert?.id ?? null });
  }, [certPicker, student, schoolName, teacherName, savedReports, allLessons, schoolHasLogo]);

  // Open an existing saved certificate (from the drafts list) — rebuilds data from its snapshot.
  const openSavedCertificate = useCallback((saved: SavedAIReport) => {
    if (!saved.certificate) return;
    setCertModal({
      data: certInputFromSnapshot(saved.certificate),
      text: saved.text,
      editId: saved.id ?? null,
    });
  }, []);

  const handleSaveCertificate = useCallback(async (updatedInput: CertInput) => {
    if (!currentUser || !certModal) return;
    setCertSaving(true);
    try {
      const now = new Date().toISOString();
      const teacherIds = computeTeacherIds();
      const text = buildCompletionLine(updatedInput);
      const snapshot = snapshotFromCertInput(updatedInput);
      if (certModal.editId) {
        await updateReport(student.id, certModal.editId, {
          text,
          updatedAt: now,
          editedBy: currentUser.id,
          editedByName: currentUser.name,
          lastSourceAction: 'edited',
          certificate: snapshot,
          approvedByName: updatedInput.teacherName,
        });
      } else {
        const toSave: Omit<SavedAIReport, 'id'> = {
          reportType: 'certificate',
          studentId: student.id,
          schoolId: student.schoolId,
          teacherId: student.teacherId,
          teacherIds,
          text,
          source: 'fallback',
          status: 'draft',
          generatedAt: now,
          updatedAt: now,
          generatedBy: currentUser.id,
          generatedByName: currentUser.name,
          editedBy: null,
          editedByName: null,
          lastSourceAction: 'generated',
          promptVersion: PROMPT_VERSION,
          providerVersion: PROVIDER_VERSION,
          certificate: snapshot,
          approvedByName: updatedInput.teacherName,
        };
        await saveReport(student.id, toSave);
      }
      setCertModal(null);
    } finally {
      setCertSaving(false);
    }
  }, [currentUser, certModal, computeTeacherIds, student.id, student.schoolId, student.teacherId]);

  const handleDownloadCertificate = useCallback(async (saved: SavedAIReport) => {
    if (!saved.certificate || certDownloadingId) return;
    setCertDownloadingId(saved.id ?? null);
    try {
      await generateCertificatePDF(certInputFromSnapshot(saved.certificate, saved.text), 'download');
    } finally {
      setCertDownloadingId(null);
    }
  }, [certDownloadingId]);

  const reportStats = useMemo(() => {
    const attended = lessonsForReport.filter(l =>
      l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT
    ).length;
    const consumed = lessonsForReport.filter(l =>
      l.status === LessonStatus.PRESENT ||
      l.status === LessonStatus.TAUGHT ||
      l.status === LessonStatus.ABSENT_UNEXCUSED
    ).length;
    const absent = lessonsForReport.filter(l =>
      l.status === LessonStatus.ABSENT_EXCUSED || l.status === LessonStatus.ABSENT_UNEXCUSED
    ).length;
    const attendanceRate = consumed > 0 ? Math.round((attended / consumed) * 100) : 0;
    const totalHours = lessonsForReport.reduce((sum, l) => sum + (l.durationMinutes ?? 0), 0) / 60;
    return { totalLessons: lessonsForReport.length, attended, absent, attendanceRate, totalHours };
  }, [lessonsForReport]);

  // Most-recent saved report per type (for generate button badges)
  const latestByType = useMemo(() => {
    const map: Partial<Record<ReportType, SavedAIReport>> = {};
    savedReports.forEach(r => {
      if (!map[r.reportType] || r.updatedAt > map[r.reportType]!.updatedAt) {
        map[r.reportType] = r;
      }
    });
    return map;
  }, [savedReports]);

  // The specific saved report currently open in the modal (reactive — updates
  // as soon as Firestore confirms the write).
  const activeSavedReport = useMemo<SavedAIReport | null>(
    () => (activeReportId ? (savedReports.find(r => r.id === activeReportId) ?? null) : null),
    [savedReports, activeReportId],
  );

  // Subscribe to saved reports for this student
  useEffect(() => {
    const unsub = subscribeSavedReports(student.id, setSavedReports);
    return unsub;
  }, [student.id]);

  // Detect whether the student's school has a certificate logo (for co-branding default).
  useEffect(() => {
    let alive = true;
    if (!student.schoolId) { setSchoolHasLogo(false); return; }
    loadSchoolCertificateConfig(student.schoolId).then(cfg => {
      if (alive) setSchoolHasLogo(!!cfg?.logoBase64);
    });
    return () => { alive = false; };
  }, [student.schoolId]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  // ── Generate a fresh AI draft ─────────────────────────────────────────────

  const handleGenerate = useCallback(async (reportType: ReportType) => {
    setLoadingType(reportType);
    setActiveReportId(null); // fresh draft — not yet saved
    try {
      // Alignment: anchor to the latest saved report of the OTHER type, if any,
      // so the two reports describe the same picture of the student.
      const otherType: ReportType = reportType === 'polish_report' ? 'term_report' : 'polish_report';
      const other = savedReports.find(r => r.reportType === otherType);
      const anchor = other?.text
        ? { reportType: other.reportType, text: other.text }
        : undefined;
      const report = await generateReport(
        {
          student,
          allLessons: lessonsForReport,
          allEnrollments,
          schoolEnrollmentPeriods,
          schoolName,
          teacherName,
          audience: 'teacher',
          mode: 'polish',
        },
        reportType,
        anchor,
      );
      // Polish reports get the ** AI marker so teachers can see at a glance it's AI-generated
      const taggedReport = reportType === 'polish_report'
        ? { ...report, text: '** ' + report.text }
        : report;
      setActiveReport(taggedReport);
      setActiveReportType(reportType);
    } finally {
      setLoadingType(null);
    }
  }, [student, lessonsForReport, allEnrollments, schoolEnrollmentPeriods, schoolName, teacherName, savedReports]);

  // ── Open a saved report directly (no API call) ────────────────────────────

  const handleOpenSaved = useCallback((saved: SavedAIReport) => {
    const report: AIReport = {
      text: saved.text,
      reportType: saved.reportType,
      source: saved.source,
      isFallback: saved.source === 'fallback',
      generatedAt: saved.generatedAt,
    };
    setActiveReport(report);
    setActiveReportType(saved.reportType);
    setActiveReportId(saved.id ?? null);
  }, []);

  // ── Generate button: always generates a fresh draft ──────────────────────
  // Saved state on the button is informational only; use the drafts list to
  // open existing reports.

  const handleButtonClick = useCallback((reportType: ReportType) => {
    const existing = latestByType[reportType];
    if (existing?.id) {
      // Flash the existing draft row to draw attention
      setFlashingReportId(existing.id);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashingReportId(null), 2000);
      // Show confirm dialog
      setPendingGenerateType(reportType);
      return;
    }
    handleGenerate(reportType);
  }, [handleGenerate, latestByType]);

  // ── Delete a saved report ─────────────────────────────────────────────────

  const handleDelete = useCallback(async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation(); // don't open the report row
    if (!window.confirm('Delete this saved draft? This cannot be undone.')) return;
    // If this is the currently open report, close the modal
    if (activeReportId === reportId) {
      setActiveReport(null);
      setActiveReportType(null);
      setActiveReportId(null);
    }
    await deleteReport(student.id, reportId);
  }, [student.id, activeReportId]);

  // ── Regenerate (called from modal) ────────────────────────────────────────

  const handleRegenerate = useCallback(() => {
    if (activeReportType) {
      // Clear the active report ID so the new AI draft is treated as unsaved
      setActiveReportId(null);
      handleGenerate(activeReportType);
    }
  }, [activeReportType, handleGenerate]);

  // ── Save (called from modal) ──────────────────────────────────────────────

  const handleSave = useCallback(async (
    text: string,
    lastSourceAction: 'generated' | 'edited',
    scores?: TermReportScores,
    approvedByName?: string,
  ) => {
    if (!currentUser || !activeReportType) return;

    const now = new Date().toISOString();
    const teacherIds = computeTeacherIds();

    // Resolve the period this report was generated for
    const matchedPeriod = selectedPeriodName
      ? schoolEnrollmentPeriods.find(p => p.name === selectedPeriodName)
      : undefined;

    if (activeReportId) {
      // ── Update existing draft ──
      await updateReport(student.id, activeReportId, {
        text,
        lastSourceAction,
        updatedAt: now,
        teacherIds,
        editedBy: lastSourceAction === 'edited' ? currentUser.id : null,
        editedByName: lastSourceAction === 'edited' ? currentUser.name : null,
        ...(scores !== undefined && { scores }),
        ...(typeof approvedByName === 'string' && { approvedByName, approvedAt: now }),
      });
    } else {
      // ── Create new draft ──
      const toSave: Omit<SavedAIReport, 'id'> = {
        reportType: activeReportType,
        studentId: student.id,
        schoolId: student.schoolId,
        teacherId: student.teacherId,
        teacherIds,
        text,
        source: activeReport?.isFallback ? 'fallback' : 'ai',
        status: 'draft',
        generatedAt: now,
        updatedAt: now,
        generatedBy: currentUser.id,
        generatedByName: currentUser.name,
        editedBy: lastSourceAction === 'edited' ? currentUser.id : null,
        editedByName: lastSourceAction === 'edited' ? currentUser.name : null,
        lastSourceAction,
        promptVersion: PROMPT_VERSION,
        providerVersion: PROVIDER_VERSION,
        ...(matchedPeriod && {
          periodName: matchedPeriod.name,
          periodStart: matchedPeriod.startDate,
          periodEnd: matchedPeriod.endDate,
        }),
        ...(scores !== undefined && { scores }),
        ...(typeof approvedByName === 'string' && { approvedByName, approvedAt: now }),
      };
      const newId = await saveReport(student.id, toSave);
      // Attach new ID so subsequent saves in the same modal session update the same doc
      setActiveReportId(newId);
    }
  }, [currentUser, activeReportType, activeReportId, student, activeReport, computeTeacherIds, selectedPeriodName, schoolEnrollmentPeriods]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
          {!readOnly && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-semibold tracking-wide">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.346.346a1 1 0 01-.707.293H9.372a1 1 0 01-.707-.293l-.346-.346z" />
              </svg>
              AI Drafts
            </span>
          )}
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
            {readOnly ? 'Saved Drafts' : 'Review before sharing'}
          </span>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">

          {/* Generate buttons — hidden for school_admin */}
          {!readOnly && (
            <>
              <p className="text-xs text-slate-500">
                Generate a draft report for {student.name.split(' ')[0]} based on{' '}
                {selectedPeriodName
                  ? <span className="text-primary-400 font-medium">{selectedPeriodName}</span>
                  : 'their full lesson history'
                }.
              </p>
              <div className="flex gap-2.5">
                <ReportButton
                  reportType="polish_report"
                  loading={loadingType === 'polish_report'}
                  latestSaved={latestByType['polish_report'] ?? null}
                  label={REPORT_TYPE_LABELS['polish_report']}
                  onClick={() => handleButtonClick('polish_report')}
                />
                <ReportButton
                  reportType="term_report"
                  loading={loadingType === 'term_report'}
                  latestSaved={latestByType['term_report'] ?? null}
                  label={termReportLabel}
                  onClick={() => handleButtonClick('term_report')}
                />
              </div>

              {/* Duplicate report warning */}
              {pendingGenerateType && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-amber-300 font-medium">
                        A saved {pendingGenerateType === 'term_report' ? 'Term Report' : 'Progress Review'} already exists for this student.
                      </p>
                      <p className="text-[10px] text-amber-400/70 mt-0.5">
                        Check the highlighted draft below. Generate a new one anyway?
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setPendingGenerateType(null); setFlashingReportId(null); }}
                      className="px-3 py-1.5 text-[10px] font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { const rt = pendingGenerateType; setPendingGenerateType(null); setFlashingReportId(null); handleGenerate(rt); }}
                      className="px-3 py-1.5 text-[10px] font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition-colors"
                    >
                      Generate New
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Certificate of Completion — admin only: create/edit/save */}
          {isAdmin && certData && (
            <div className="flex gap-2.5">
              <ReportButton
                reportType="certificate"
                loading={false}
                latestSaved={latestCertForEnrollment}
                label={REPORT_TYPE_LABELS['certificate']}
                onClick={handleOpenCertificate}
              />
            </div>
          )}

          {/* Saved drafts list */}
          {savedReports.length > 0 ? (
            <div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">
                Saved Drafts ({savedReports.length})
              </p>
              <div className="space-y-1.5">
                {savedReports.map(r => (
                  <div
                    key={r.id}
                    className={`flex items-center gap-1.5 transition-all duration-300 ${flashingReportId === r.id ? 'animate-pulse' : ''}`}
                  >
                    <button
                      onClick={() => {
                        if (r.reportType === 'certificate') {
                          isAdmin ? openSavedCertificate(r) : handleDownloadCertificate(r);
                        } else {
                          handleOpenSaved(r);
                        }
                      }}
                      disabled={r.reportType === 'certificate' && !isAdmin && !!certDownloadingId}
                      className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left group min-w-0 ${flashingReportId === r.id ? 'bg-amber-500/20 border-2 border-amber-400/60 ring-2 ring-amber-400/30' : 'bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 hover:border-slate-600/60'} disabled:opacity-60 disabled:cursor-wait`}
                    >
                      {reportTypeChip(r.reportType)}
                      <span className="flex-1 min-w-0">
                        <span className="text-xs text-slate-300 group-hover:text-white transition-colors font-medium block truncate">
                          {r.reportType === 'term_report'
                            ? termReportLabel
                            : REPORT_TYPE_LABELS[r.reportType]}
                        </span>
                        <span className="text-[10px] text-slate-600 block">
                          {(() => {
                            const start = r.periodStart;
                            const end   = r.periodEnd;
                            const name  = r.periodName;
                            if (name || (start && end)) {
                              return (
                                <span className="text-slate-400 font-medium mr-1.5">
                                  {name && <span>{name}</span>}
                                  {start && end && (
                                    <span className="text-slate-600 font-normal ml-1">
                                      {periodRange(start, end)}
                                    </span>
                                  )}
                                </span>
                              );
                            }
                            // Infer from schoolEnrollmentPeriods for legacy reports
                            const inferred = inferPeriod(r, schoolEnrollmentPeriods, student.schoolId);
                            if (inferred) {
                              return (
                                <span className="text-slate-400 font-medium mr-1.5">
                                  {inferred.name}
                                  <span className="text-slate-600 font-normal ml-1">
                                    {periodRange(inferred.startDate, inferred.endDate)}
                                  </span>
                                </span>
                              );
                            }
                            return null;
                          })()}
                          {relativeTime(r.updatedAt)}
                          {r.generatedByName && ` · by ${r.generatedByName}`}
                          {r.lastSourceAction === 'edited' && r.editedByName && r.editedByName !== r.generatedByName
                            ? ` · edited by ${r.editedByName}`
                            : r.lastSourceAction === 'edited' ? ' · edited' : ''}
                        </span>
                      </span>
                      {r.reportType === 'certificate' && !isAdmin ? (
                        certDownloadingId === r.id ? (
                          <svg className="w-3.5 h-3.5 text-primary-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        )
                      ) : (
                        <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>
                    {!readOnly && (
                      <button
                        onClick={e => handleDelete(e, r.id!)}
                        title="Delete draft"
                        className="flex-shrink-0 p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-600 italic">
              {readOnly ? 'No saved drafts for this student yet.' : 'No saved drafts yet — generate one above.'}
            </p>
          )}
        </div>
      </div>

      {/* Modal */}
      {activeReport && activeReportType && (
        <AIReportPreviewModal
          student={student}
          allLessons={lessonsForReport}
          schoolName={schoolName ?? ''}
          teacherName={teacherName}
          teacherReportDisplayName={teacherReportDisplayName}
          teacherSignatureUrl={teacherSignatureUrl}
          report={activeReport}
          savedReport={activeSavedReport}
          currentUserId={currentUser?.id ?? ''}
          currentUserName={currentUser?.name ?? ''}
          periodLabel={termPeriodLabel}
          stats={activeReportType === 'term_report' ? reportStats : undefined}
          readOnly={readOnly}
          onSave={readOnly ? undefined : handleSave}
          onRegenerate={readOnly ? undefined : handleRegenerate}
          onClose={() => { setActiveReport(null); setActiveReportType(null); setActiveReportId(null); }}
        />
      )}

      {certPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setCertPicker(null)}>
          <div className="relative bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl w-full max-w-sm flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="5"/><path d="M8.5 12.5 7 22l5-3 5 3-1.5-9.5"/></svg>
                  Certificate
                </span>
                <p className="text-sm font-semibold text-white">Choose enrollments</p>
              </div>
              <button onClick={() => setCertPicker(null)} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            {/* Body */}
            <div className="px-5 py-4 space-y-2">
              <p className="text-xs text-slate-500">Select which enrollments to include. If multiple are selected, the certificate will span from the first start to the last end date and list all instruments.</p>
              <div className="space-y-2 mt-3">
                {certPicker.enrollments.map(e => {
                  const checked = certPicker.selected.has(e.id);
                  const dateRange = e.startDate && e.endDate
                    ? `${new Date(e.startDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(e.endDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
                    : e.startDate
                      ? `From ${new Date(e.startDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
                      : 'No dates';
                  return (
                    <button
                      key={e.id}
                      onClick={() => setCertPicker(prev => {
                        if (!prev) return prev;
                        const next = new Set(prev.selected);
                        if (next.has(e.id)) { if (next.size > 1) next.delete(e.id); }
                        else next.add(e.id);
                        return { ...prev, selected: next };
                      })}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${checked ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-800/40 border-slate-700/40 hover:border-slate-600'}`}
                    >
                      <span className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${checked ? 'bg-amber-500 border-amber-500' : 'border-slate-600'}`}>
                        {checked && <svg className="w-2.5 h-2.5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${checked ? 'text-white' : 'text-slate-400'}`}>{e.instrument}</p>
                        <p className="text-[10px] text-slate-600">{dateRange}</p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${e.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                        {e.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800">
              <button onClick={() => setCertPicker(null)} className="px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors">Cancel</button>
              <button onClick={handleCertPickerConfirm} disabled={certPicker.selected.size === 0}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
      )}

      {certModal && (
        <CertificateModal
          data={certModal.data}
          initialText={certModal.text}
          readOnly={!isAdmin}
          saving={certSaving}
          schoolHasLogo={schoolHasLogo}
          onSave={isAdmin ? handleSaveCertificate : undefined}
          onClose={() => setCertModal(null)}
        />
      )}
    </>
  );
};
