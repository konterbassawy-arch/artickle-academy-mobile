/**
 * BulkReportsPage
 *
 * Full-page bulk reports management.
 * Desktop: two-panel (left: student list, right: content by tab)
 * Mobile: two-screen stack — list → viewer (Option A)
 *
 * Tabs: Students & Coverage | Generate (full mode only) | Export
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Student, Lesson, LessonStatus, Role } from '../types';
import { ReportType, SavedAIReport, PROMPT_VERSION, PROVIDER_VERSION } from '../services/aiSummary/reportTypes';
import { fetchSavedReports, updateReport, saveReport, deleteReport } from '../services/aiSummary/savedReports';
import { resolveTermReportSections, parseTermReport } from '../services/aiSummary/resolveAiContent';
import { TermReportScores } from '../services/aiSummary/reportTypes';
import { TermReportOverviewCard, TermReportSectionsView } from '../components/AIReportPreviewModal';
import { generateReport } from '../services/aiSummary/index';
import { getRelevantPeriodsForStudent } from '../services/schoolPeriodProgress';
import {
  bulkGenerateAndSave,
  bulkExportReports,
  BulkJobEntry,
  BulkStudentEntry,
  BulkExportEntry,
} from '../services/bulkReportService';
import { resolveCertInput, generateCertificatesZIP, generateCertificatePDF, snapshotFromCertInput, certInputFromSnapshot, buildCompletionLine, certInputFromEnrollment, mergeCertInputs, consumedLessonRange, countPaidLessons, CertInput } from '../services/certificateExport';
import { loadSchoolCertificateConfig } from '../services/schoolCertificate';
import { matchesSearch } from '../services/searchUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PageTab = 'students' | 'generate' | 'export';
type MobileView = 'list' | 'viewer';
type PeriodScope = 'current' | 'previous' | 'all';

interface CoverageData {
  polishCount: number;
  termCount: number;
  certCount: number;
  latestPolish?: SavedAIReport;
  latestTerm?: SavedAIReport;
  latestCert?: SavedAIReport;
  allPolish: SavedAIReport[];
  allTerm: SavedAIReport[];
  allCerts: SavedAIReport[];
}

type CoverageEntry = CoverageData | 'loading';

type EnrichedStudent = Student & { teacherName: string; schoolName: string };

// ─────────────────────────────────────────────────────────────────────────────
// Small shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const inputCls =
  'bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-primary-500/40 w-full';

const tabBtn = (active: boolean) =>
  `px-4 py-2 text-xs font-medium border-b-2 transition-all ${
    active
      ? 'border-primary-500 text-white'
      : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
  }`;

const REPORT_OPTIONS: { type: ReportType; label: string; sub: string }[] = [
  { type: 'polish_report', label: 'Progress Review', sub: 'AI-polished learning journey + teacher summary' },
  { type: 'term_report',   label: 'Term Report',             sub: 'Structured academic sections (Technical, Practical…)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// ReportTypeToggle
// ─────────────────────────────────────────────────────────────────────────────

function ReportTypeToggle({
  label, sub, checked, onChange, disabled,
}: { label: string; sub: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange} disabled={disabled}
      className={`flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-primary-500/10 border-primary-500/40 ring-1 ring-primary-500/20' : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
      }`}
    >
      <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${checked ? 'bg-primary-500 border-primary-500' : 'border-slate-600'}`}>
        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </span>
      <div>
        <p className={`text-sm font-medium leading-tight ${checked ? 'text-white' : 'text-slate-400'}`}>{label}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StudentRow — lazy-loads coverage via IntersectionObserver
// ─────────────────────────────────────────────────────────────────────────────

function StudentRow({
  student, cov, isViewing, isChecked, showCheckbox,
  onClick, onCheck, onLoad,
}: {
  student: EnrichedStudent;
  cov?: CoverageEntry;
  isViewing: boolean;
  isChecked?: boolean;
  showCheckbox?: boolean;
  onClick: () => void;
  onCheck?: () => void;
  onLoad: (id: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || cov !== undefined) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { onLoad(student.id); obs.disconnect(); }
    }, { rootMargin: '120px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [student.id, cov, onLoad]);

  const isLoading = cov === 'loading';
  const data = (cov && cov !== 'loading') ? cov as CoverageData : null;

  return (
    <div
      ref={rowRef}
      onClick={onClick}
      className={`px-3 py-2.5 cursor-pointer transition-colors border-b border-slate-800/50 ${isViewing ? 'bg-primary-500/10' : 'hover:bg-slate-800/50'}`}
    >
      <div className="flex items-center gap-2.5">
        {showCheckbox && (
          <input
            type="checkbox" checked={!!isChecked}
            onChange={e => { e.stopPropagation(); onCheck?.(); }}
            onClick={e => e.stopPropagation()}
            className="accent-primary-500 w-3.5 h-3.5 flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-medium truncate ${isViewing ? 'text-white' : 'text-slate-300'}`}>{student.name}</p>
          <p className="text-[10px] text-slate-600 truncate">
            {student.instrument}{student.schoolName ? ` · ${student.schoolName}` : ''}
          </p>
        </div>
      </div>
      {/* Coverage lines */}
      <div className="mt-1.5 space-y-0.5 pl-0.5">
        {(cov === undefined || isLoading) ? (
          <div className="h-7 flex flex-col justify-center gap-1">
            <div className="h-2 w-28 bg-slate-800 rounded animate-pulse" />
            <div className="h-2 w-20 bg-slate-800 rounded animate-pulse" />
          </div>
        ) : data ? (
          <>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-slate-600 w-[88px] shrink-0">Progress Review</span>
              <span className={data.polishCount > 0 ? 'text-emerald-400 font-medium' : 'text-slate-700'}>
                {data.polishCount > 0 ? `● ${data.polishCount}` : '—'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-slate-600 w-[88px] shrink-0">Term Report</span>
              <span className={data.termCount > 0 ? 'text-emerald-400 font-medium' : 'text-slate-700'}>
                {data.termCount > 0 ? `● ${data.termCount}` : '—'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-slate-600 w-[88px] shrink-0">Certificate</span>
              <span className={data.certCount > 0 ? 'text-amber-400 font-medium' : 'text-slate-700'}>
                {data.certCount > 0 ? `● ${data.certCount}` : '—'}
              </span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JobRow — generate progress row
// ─────────────────────────────────────────────────────────────────────────────

function JobRow({ job, wantPolish, wantTerm }: { job: BulkJobEntry; wantPolish: boolean; wantTerm: boolean }) {
  const icon =
    job.status === 'done'       ? <span className="text-emerald-400">✓</span> :
    job.status === 'skipped'    ? <span className="text-slate-500">–</span> :
    job.status === 'error'      ? <span className="text-red-400">✕</span> :
    job.status === 'generating' ? <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" /> :
                                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-700" />;
  const sub =
    job.status === 'skipped'    ? <span className="text-slate-600">{job.skipReason ?? 'Skipped'}</span> :
    job.status === 'error'      ? <span className="text-red-400">{job.error}</span> :
    job.status === 'generating' ? <span className="text-amber-400/80">{wantTerm && !job.termDone ? 'Term Report…' : wantPolish && !job.polishDone ? 'Progress Review…' : 'Saving…'}</span> :
    job.status === 'done'       ? <span className="text-slate-500">{[wantPolish && 'Progress Review', wantTerm && 'Term Report'].filter(Boolean).join(' + ')} saved</span> :
                                  <span className="text-slate-600">Queued</span>;
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${
      job.status === 'done' ? 'bg-emerald-950/30 border-emerald-900/40' :
      job.status === 'error' ? 'bg-red-950/30 border-red-900/40' :
      job.status === 'skipped' ? 'bg-slate-800/20 border-slate-800/60 opacity-50' :
      job.status === 'generating' ? 'bg-amber-950/20 border-amber-900/30' : 'bg-slate-800/30 border-slate-800'
    }`}>
      <div className="w-4 flex items-center justify-center flex-shrink-0 text-sm">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${job.status === 'skipped' ? 'text-slate-500' : 'text-white'}`}>{job.studentName}</p>
        <p className="text-[10px] mt-0.5">{sub}</p>
      </div>
      {job.periodName && job.status !== 'skipped' && (
        <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded truncate max-w-[90px]">{job.periodName}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReportViewer — right panel for Students tab
// ─────────────────────────────────────────────────────────────────────────────

interface ViewerStats {
  totalLessons: number;
  attended: number;
  absent: number;
  attendanceRate: number;
  totalHours: number;
}

function ReportViewer({
  student, cov, index, total, onNavigate, onBack, isMobile,
  onSaveReport, onRegenerateReport, onDeleteReport, onUpdateTermReport, onSaveCert, stats,
}: {
  student: EnrichedStudent;
  cov?: CoverageEntry;
  index: number;
  total: number;
  onNavigate: (dir: -1 | 1) => void;
  onBack?: () => void;
  isMobile?: boolean;
  onSaveReport?: (reportId: string, reportType: ReportType, text: string, action: 'generated' | 'edited') => Promise<void>;
  onRegenerateReport?: (reportType: ReportType) => Promise<void>;
  onDeleteReport?: (reportId: string, reportType: ReportType) => Promise<void>;
  onUpdateTermReport?: (reportId: string, updates: Partial<SavedAIReport>) => Promise<void>;
  onSaveCert?: (certId: string, updatedInput: CertInput) => Promise<void>;
  stats?: ViewerStats | null;
}) {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const [reportTab, setReportTab] = useState<'polish' | 'term' | 'cert'>('polish');
  const [editingTab, setEditingTab] = useState<'polish' | 'term' | null>(null);

  // Cert editing state
  const [certEditMode,  setCertEditMode]  = useState(false);
  const [certName,      setCertName]      = useState('');
  const [certInstrument, setCertInstrument] = useState('');
  const [certStart,     setCertStart]     = useState('');
  const [certEnd,       setCertEnd]       = useState('');
  const [certTeacher,   setCertTeacher]   = useState('');
  const [certBody,      setCertBody]      = useState('');
  const [certCustomised, setCertCustomised] = useState(false);
  const [certSaving,    setCertSaving]    = useState(false);
  const [certDownloading, setCertDownloading] = useState(false);
  const [confirmDeleteCert, setConfirmDeleteCert] = useState(false);
  const [deletingCert,  setDeletingCert]  = useState(false);
  const [editText, setEditText] = useState('');
  const [hasEdited, setHasEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState<'polish' | 'term' | null>(null);
  const [selectedPolishId, setSelectedPolishId] = useState<string | undefined>();
  const [selectedTermId, setSelectedTermId] = useState<string | undefined>();
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);
  const [confirmDeleteFooter, setConfirmDeleteFooter] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmRegenTab, setConfirmRegenTab] = useState<'polish' | 'term' | null>(null);

  // ── Term report scores + approval (local state, synced to Firestore) ──────
  const [termScores, setTermScores] = useState<TermReportScores>({ technical: 0, practical: 0, practice: 0 });
  const [termApprovedBy, setTermApprovedBy] = useState<string | null>(null);
  const [termSaving, setTermSaving] = useState(false);

  const isLoading = cov === 'loading' || cov === undefined;
  const data = (cov && cov !== 'loading') ? cov as CoverageData : null;

  const studentUrl = (() => {
    const prefix = currentUser?.role === Role.ADMIN ? '/admin'
      : currentUser?.role === Role.TEACHER ? '/teacher'
      : currentUser?.role === Role.SCHOOL_ADMIN ? '/school'
      : null;
    return prefix ? `${prefix}/students/${student.id}` : null;
  })();

  // Derive the actively-viewed report for each tab
  const activePolish = selectedPolishId
    ? (data?.allPolish?.find(r => r.id === selectedPolishId) ?? data?.latestPolish)
    : data?.latestPolish;
  const activeTerm = selectedTermId
    ? (data?.allTerm?.find(r => r.id === selectedTermId) ?? data?.latestTerm)
    : data?.latestTerm;

  // Reset on student change
  useEffect(() => {
    if (data) {
      if (!data.latestPolish && !data.latestTerm && data.latestCert) setReportTab('cert');
      else if (!data.latestPolish && data.latestTerm) setReportTab('term');
      else setReportTab('polish');
    }
    setEditingTab(null);
    setEditText('');
    setHasEdited(false);
    setSelectedPolishId(undefined);
    setSelectedTermId(undefined);
    setDeletingVersionId(null);
    setConfirmDeleteFooter(false);
    setCertEditMode(false);
    setConfirmDeleteCert(false);
  }, [student.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync term scores + approval from active term report
  useEffect(() => {
    if (activeTerm) {
      const s = activeTerm.scores
        ?? parseTermReport(activeTerm.text, stats?.attendanceRate).suggestedScores
        ?? { technical: 0, practical: 0, practice: 0 };
      setTermScores(s);
      setTermApprovedBy(activeTerm.approvedByName ?? null);
    }
  }, [activeTerm?.id, activeTerm?.scores, activeTerm?.approvedByName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync cert fields from active cert report
  const activeCert = data?.latestCert;
  useEffect(() => {
    if (activeCert?.certificate) {
      const ci = certInputFromSnapshot(activeCert.certificate, activeCert.text);
      setCertName(ci.studentName ?? '');
      setCertInstrument(ci.instrument ?? '');
      setCertStart(ci.startDate ? ci.startDate.slice(0, 7) : '');
      setCertEnd(ci.endDate ? ci.endDate.slice(0, 7) : '');
      setCertTeacher(ci.teacherName ?? '');
      setCertBody(activeCert.text ?? '');
      setCertCustomised(false);
      setCertEditMode(false);
      setConfirmDeleteCert(false);
    }
  }, [activeCert?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const certDerivedInput = (): CertInput => ({
    ...(activeCert?.certificate ? certInputFromSnapshot(activeCert.certificate) : {}),
    studentName: certName,
    instrument:  certInstrument,
    startDate:   certStart ? certStart + '-01' : undefined,
    endDate:     certEnd   ? certEnd   + '-01' : undefined,
    teacherName: certTeacher,
    bodyOverride: certCustomised ? certBody : undefined,
  } as CertInput);

  const certAutoBody = () => buildCompletionLine(certDerivedInput());

  const handleCertBodyChange = (val: string) => {
    setCertBody(val);
    setCertCustomised(true);
  };

  const handleCertResetBody = () => {
    setCertCustomised(false);
    setCertBody(certAutoBody());
  };

  const handleCertSave = async () => {
    if (!activeCert?.id || !onSaveCert) return;
    setCertSaving(true);
    try {
      await onSaveCert(activeCert.id, certDerivedInput());
      setCertEditMode(false);
    } finally {
      setCertSaving(false);
    }
  };

  const handleCertDownload = async () => {
    if (!activeCert) return;
    setCertDownloading(true);
    try {
      await generateCertificatePDF(certDerivedInput(), 'download');
    } finally {
      setCertDownloading(false);
    }
  };

  const handleCertDelete = async () => {
    if (!activeCert?.id || !onDeleteReport) return;
    setDeletingCert(true);
    try {
      await onDeleteReport(activeCert.id, 'certificate');
      setConfirmDeleteCert(false);
    } finally {
      setDeletingCert(false);
    }
  };

  const handleEdit = (tab: 'polish' | 'term', text: string) => {
    setEditingTab(tab);
    setEditText(text);
    setHasEdited(false);
    setReportTab(tab);
  };

  const handleCancelEdit = () => {
    setEditingTab(null);
    setEditText('');
    setHasEdited(false);
  };

  const handleDelete = async (reportId: string, reportType: ReportType) => {
    if (!onDeleteReport) return;
    setDeleting(true);
    try {
      await onDeleteReport(reportId, reportType);
      setConfirmDeleteFooter(false);
      setDeletingVersionId(null);
      if (reportType === 'polish_report') setSelectedPolishId(undefined);
      else setSelectedTermId(undefined);
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async (reportId: string, reportType: ReportType) => {
    if (!onSaveReport) return;
    setSaving(true);
    try {
      await onSaveReport(reportId, reportType, editText, hasEdited ? 'edited' : 'generated');
      setEditingTab(null);
    } finally {
      setSaving(false);
    }
  };

  const handleScoreChange = (key: keyof TermReportScores, val: number) => {
    setTermScores(prev => ({ ...prev, [key]: val }));
    // Auto-save scores
    if (activeTerm?.id && onUpdateTermReport) {
      const updated = { ...termScores, [key]: val };
      onUpdateTermReport(activeTerm.id, { scores: updated, updatedAt: new Date().toISOString() });
    }
  };

  const handleApproveReport = async () => {
    if (!activeTerm?.id || !onUpdateTermReport) return;
    const name = student.teacherName || 'Teacher';
    setTermApprovedBy(name);
    setTermSaving(true);
    try {
      await onUpdateTermReport(activeTerm.id, {
        scores: termScores,
        approvedByName: name,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setTermSaving(false);
    }
  };

  const handleRemoveApproval = async () => {
    if (!activeTerm?.id || !onUpdateTermReport) return;
    setTermApprovedBy(null);
    setTermSaving(true);
    try {
      await onUpdateTermReport(activeTerm.id, {
        approvedByName: null as any,
        approvedAt: null as any,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setTermSaving(false);
    }
  };

  const handleRegenerate = async (tab: 'polish' | 'term') => {
    if (!onRegenerateReport) return;
    setRegenerating(tab);
    setEditingTab(null);
    try {
      await onRegenerateReport(tab === 'polish' ? 'polish_report' : 'term_report');
      // Reset selection so the newly generated (latest) report is shown
      if (tab === 'polish') setSelectedPolishId(undefined);
      else setSelectedTermId(undefined);
    } finally {
      setRegenerating(null);
    }
  };

  // Copy current report text to clipboard
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const text = editingTab
      ? editText
      : reportTab === 'polish' ? activePolish?.text ?? ''
      : activeTerm?.text ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  };

  const NavBar = () => (
    <div className="flex items-center gap-1 flex-shrink-0">
      <button onClick={() => onNavigate(-1)} disabled={index === 0}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-xl text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-25 transition-colors"
      >‹</button>
      <span className="text-[11px] text-slate-500 tabular-nums px-1">{index + 1}/{total}</span>
      <button onClick={() => onNavigate(1)} disabled={index === total - 1}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-xl text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-25 transition-colors"
      >›</button>
    </div>
  );


  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800 flex-shrink-0">
        {isMobile && onBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm mr-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
        )}
        <div className="flex-1 min-w-0">
          {studentUrl ? (
            <button onClick={() => navigate(studentUrl)} className="text-white hover:text-primary-400 font-semibold text-sm truncate transition-colors block max-w-full text-left">
              {student.name}
            </button>
          ) : (
            <p className="text-white font-semibold text-sm truncate">{student.name}</p>
          )}
          <p className="text-[11px] text-slate-500 truncate">{student.instrument}{student.schoolName ? ` · ${student.schoolName}` : ''}</p>
        </div>
        {!isMobile && <NavBar />}
      </div>

      {/* Student info strip */}
      {(() => {
        return (
          <div className="mx-4 my-2.5 px-3.5 py-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40 flex-shrink-0 space-y-2">
            {/* Name + meta */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {studentUrl ? (
                <button
                  onClick={() => navigate(studentUrl)}
                  className="text-sm font-semibold text-white hover:text-primary-400 transition-colors leading-none flex items-center gap-1 group"
                >
                  {student.name}
                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              ) : (
                <span className="text-sm font-semibold text-white leading-none">{student.name}</span>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {student.instrument && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <svg className="w-3 h-3 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    {student.instrument}
                  </span>
                )}
                {student.yearGrade && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <svg className="w-3 h-3 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                    </svg>
                    Grade {student.yearGrade}
                  </span>
                )}
                {student.teacherName && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <svg className="w-3 h-3 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {student.teacherName}
                  </span>
                )}
                {student.schoolName && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <svg className="w-3 h-3 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    {student.schoolName}
                  </span>
                )}
              </div>
            </div>
            {/* Compact stats */}
            {stats && (
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { label: 'Lessons',    value: stats.totalLessons },
                  { label: 'Attended',   value: stats.attended },
                  { label: 'Absent',     value: stats.absent },
                  { label: 'Attendance', value: `${stats.attendanceRate}%` },
                  { label: 'Hours',      value: stats.totalHours.toFixed(1) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
                    <span className="text-sm font-bold text-white leading-none">{value}</span>
                    <span className="text-[9px] text-slate-500 font-medium text-center leading-tight">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <span className="w-5 h-5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
          </div>
        ) : !data || (!data.latestPolish && !data.latestTerm && !data.latestCert) ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <p className="text-slate-400 font-medium text-sm">No saved reports</p>
            <p className="text-[11px] text-slate-600 mt-1">Use the Generate tab to create reports for this student</p>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Report type tabs */}
            {((data.latestPolish ? 1 : 0) + (data.latestTerm ? 1 : 0) + (data.latestCert ? 1 : 0)) > 1 && (
              <div className="flex gap-2 flex-wrap">
                {data.latestPolish && (() => {
                  const isActive = reportTab === 'polish';
                  return (
                    <button onClick={() => { setReportTab('polish'); setEditingTab(null); setCertEditMode(false); }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${isActive ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'bg-violet-500/10 border-violet-500/20 text-violet-400/60 hover:text-violet-300 hover:border-violet-500/30'}`}
                    >Progress Review</button>
                  );
                })()}
                {data.latestTerm && (() => {
                  const isActive = reportTab === 'term';
                  return (
                    <button onClick={() => { setReportTab('term'); setEditingTab(null); setCertEditMode(false); }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${isActive ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-blue-500/10 border-blue-500/20 text-blue-400/60 hover:text-blue-300 hover:border-blue-500/30'}`}
                    >Term Report</button>
                  );
                })()}
                {data.latestCert && (() => {
                  const isActive = reportTab === 'cert';
                  return (
                    <button onClick={() => { setReportTab('cert'); setEditingTab(null); }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${isActive ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-amber-500/10 border-amber-500/20 text-amber-400/60 hover:text-amber-300 hover:border-amber-500/30'}`}
                    >Certificate</button>
                  );
                })()}
              </div>
            )}

            {/* Progress Review */}
            {reportTab === 'polish' && activePolish && (() => {
              const r = activePolish;
              const isEditingThis = editingTab === 'polish';
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Progress Review</p>
                    {r.periodName && <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded">{r.periodName}</span>}
                  </div>
                  {isEditingThis ? (
                    <textarea
                      value={editText}
                      onChange={e => { setEditText(e.target.value); setHasEdited(true); }}
                      className="w-full min-h-[260px] text-sm text-slate-200 leading-relaxed bg-slate-800/60 rounded-xl px-4 py-3 resize-y border border-slate-600 focus:border-primary-500 focus:outline-none transition-colors"
                      spellCheck autoFocus
                    />
                  ) : (
                    <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-800/40 rounded-xl p-4 border border-slate-800">
                      {r.text}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-600">
                    Saved {new Date(r.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' · '}{r.generatedByName ?? 'Unknown'}
                    {r.lastSourceAction === 'edited' && r.editedByName ? ` · edited by ${r.editedByName}` : ''}
                  </p>
                  {/* All versions list */}
                  {data.allPolish.length > 1 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">All versions ({data.polishCount})</p>
                        <p className="text-[10px] text-slate-600 italic">Tap a row to view · trash icon to delete</p>
                      </div>
                      {data.allPolish.map(v => (
                        <div key={v.id}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all ${
                            v.id === r.id ? 'bg-slate-700/80 border-slate-600' : 'bg-slate-800/40 border-slate-700/40'
                          }`}
                        >
                          {deletingVersionId === v.id ? (
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-xs text-red-400 font-medium flex-1">Delete this version?</span>
                              <button onClick={() => handleDelete(v.id!, 'polish_report')} disabled={deleting}
                                className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-60"
                              >{deleting ? '…' : 'Delete'}</button>
                              <button onClick={() => setDeletingVersionId(null)}
                                className="px-2 py-0.5 rounded bg-slate-700 text-slate-400 text-[10px] font-medium hover:bg-slate-600 transition-colors"
                              >Cancel</button>
                            </div>
                          ) : (
                            <>
                              <button onClick={() => { setSelectedPolishId(v.id); setEditingTab(null); }} className="flex items-center gap-2.5 flex-1 min-w-0 text-left group">
                                <span className="inline-flex items-center justify-center w-[60px] py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 bg-violet-500/15 border border-violet-500/25 text-violet-400">Progress</span>
                                <span className="flex-1 min-w-0">
                                  <span className={`text-xs font-medium block truncate ${v.id === r.id ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
                                    {v.periodName ?? 'Full enrollment'}
                                  </span>
                                  <span className="text-[10px] text-slate-600 block">
                                    {new Date(v.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    {v.generatedByName ? ` · ${v.generatedByName}` : ''}
                                    {v.lastSourceAction === 'edited' ? ' · edited' : ''}
                                  </span>
                                </span>
                                {v.id === r.id && <span className="text-[10px] text-primary-400 font-medium flex-shrink-0">Viewing</span>}
                              </button>
                              {onDeleteReport && (
                                <button onClick={() => setDeletingVersionId(v.id!)}
                                  className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                                  title="Delete this version"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Certificate of Completion */}
            {reportTab === 'cert' && activeCert && (() => {
              const inputCls2 = 'w-full rounded-xl px-3 py-2 text-sm text-slate-200 bg-slate-800/60 border border-slate-600 focus:outline-none focus:border-primary-500 transition-colors';
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Certificate of Completion</p>
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">Cert</span>
                  </div>

                  {certEditMode ? (
                    <div className="space-y-3">
                      {/* Student name */}
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Student name</label>
                        <input value={certName} onChange={e => setCertName(e.target.value)} className={inputCls2} />
                      </div>
                      {/* Instrument + Teacher */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Instrument</label>
                          <input value={certInstrument} onChange={e => setCertInstrument(e.target.value)} className={inputCls2} />
                        </div>
                        <div>
                          <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Teacher</label>
                          <input value={certTeacher} onChange={e => setCertTeacher(e.target.value)} className={inputCls2} />
                        </div>
                      </div>
                      {/* Dates */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Start month</label>
                          <input type="month" value={certStart} onChange={e => { setCertStart(e.target.value); if (!certCustomised) setCertBody(certAutoBody()); }} className={inputCls2} />
                        </div>
                        <div>
                          <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">End month</label>
                          <input type="month" value={certEnd} onChange={e => { setCertEnd(e.target.value); if (!certCustomised) setCertBody(certAutoBody()); }} className={inputCls2} />
                        </div>
                      </div>
                      {/* Completion statement */}
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Completion statement</label>
                        <textarea value={certBody} onChange={e => handleCertBodyChange(e.target.value)} rows={3} className={`${inputCls2} resize-none`} />
                        {certCustomised && (
                          <button onClick={handleCertResetBody} className="mt-1 text-[11px] text-slate-400 hover:text-primary-300 transition-colors">↺ Reset to default</button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-800">
                          <p className="text-[10px] text-slate-500 mb-0.5">Student</p>
                          <p className="text-slate-200 font-medium truncate">{certName}</p>
                        </div>
                        <div className="bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-800">
                          <p className="text-[10px] text-slate-500 mb-0.5">Instrument</p>
                          <p className="text-slate-200 font-medium truncate">{certInstrument}</p>
                        </div>
                        <div className="bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-800">
                          <p className="text-[10px] text-slate-500 mb-0.5">Teacher</p>
                          <p className="text-slate-200 font-medium truncate">{certTeacher}</p>
                        </div>
                        <div className="bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-800">
                          <p className="text-[10px] text-slate-500 mb-0.5">Period</p>
                          <p className="text-slate-200 font-medium truncate">{certStart && certEnd ? `${certStart} → ${certEnd}` : '—'}</p>
                        </div>
                      </div>
                      <div className="text-sm text-slate-300 leading-relaxed bg-slate-800/40 rounded-xl p-4 border border-slate-800 italic">
                        {certBody}
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-600">
                    Saved {new Date(activeCert.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' · '}{activeCert.generatedByName ?? 'Unknown'}
                    {activeCert.lastSourceAction === 'edited' && activeCert.editedByName ? ` · edited by ${activeCert.editedByName}` : ''}
                  </p>
                </div>
              );
            })()}

            {/* Term Report */}
            {reportTab === 'term' && activeTerm && (() => {
              const r = activeTerm;
              const isEditingThis = editingTab === 'term';
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Term Report</p>
                    {r.periodName && <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded">{r.periodName}</span>}
                  </div>
                  <TermReportOverviewCard
                    stats={stats ? {
                      totalLessons: stats.totalLessons,
                      attended: stats.attended,
                      absent: stats.absent,
                      attendanceRate: stats.attendanceRate,
                      totalHours: stats.totalHours,
                    } : undefined}
                    scores={termScores}
                    aiSuggested={false}
                    approvedByName={termApprovedBy}
                    readOnly={currentUser?.role === Role.SCHOOL_ADMIN}
                    teacherName={student.teacherName}
                    saving={termSaving}
                    periodLabel={r.periodName}
                    onScoreChange={handleScoreChange}
                    onApprove={handleApproveReport}
                    onRemoveApproval={handleRemoveApproval}
                  />
                  {isEditingThis ? (
                    <textarea
                      value={editText}
                      onChange={e => { setEditText(e.target.value); setHasEdited(true); }}
                      className="w-full min-h-[260px] text-sm text-slate-200 leading-relaxed bg-slate-800/60 rounded-xl px-4 py-3 resize-y border border-slate-600 focus:border-primary-500 focus:outline-none transition-colors font-mono"
                      spellCheck autoFocus
                    />
                  ) : (
                    <TermReportSectionsView text={r.text} />
                  )}
                  <p className="text-[10px] text-slate-600">
                    Saved {new Date(r.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' · '}{r.generatedByName ?? 'Unknown'}
                    {r.lastSourceAction === 'edited' && r.editedByName ? ` · edited by ${r.editedByName}` : ''}
                  </p>
                  {/* All versions list */}
                  {data.allTerm.length > 1 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">All versions ({data.termCount})</p>
                        <p className="text-[10px] text-slate-600 italic">Tap a row to view · trash icon to delete</p>
                      </div>
                      {data.allTerm.map(v => (
                        <div key={v.id}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all ${
                            v.id === r.id ? 'bg-slate-700/80 border-slate-600' : 'bg-slate-800/40 border-slate-700/40'
                          }`}
                        >
                          {deletingVersionId === v.id ? (
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-xs text-red-400 font-medium flex-1">Delete this version?</span>
                              <button onClick={() => handleDelete(v.id!, 'term_report')} disabled={deleting}
                                className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-60"
                              >{deleting ? '…' : 'Delete'}</button>
                              <button onClick={() => setDeletingVersionId(null)}
                                className="px-2 py-0.5 rounded bg-slate-700 text-slate-400 text-[10px] font-medium hover:bg-slate-600 transition-colors"
                              >Cancel</button>
                            </div>
                          ) : (
                            <>
                              <button onClick={() => { setSelectedTermId(v.id); setEditingTab(null); }} className="flex items-center gap-2.5 flex-1 min-w-0 text-left group">
                                <span className="inline-flex items-center justify-center w-[60px] py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 bg-blue-500/15 border border-blue-500/25 text-blue-400">Term</span>
                                <span className="flex-1 min-w-0">
                                  <span className={`text-xs font-medium block truncate ${v.id === r.id ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
                                    {v.periodName ?? 'Full enrollment'}
                                  </span>
                                  <span className="text-[10px] text-slate-600 block">
                                    {new Date(v.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    {v.generatedByName ? ` · ${v.generatedByName}` : ''}
                                    {v.lastSourceAction === 'edited' ? ' · edited' : ''}
                                  </span>
                                </span>
                                {v.id === r.id && <span className="text-[10px] text-primary-400 font-medium flex-shrink-0">Viewing</span>}
                              </button>
                              {onDeleteReport && (
                                <button onClick={() => setDeletingVersionId(v.id!)}
                                  className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                                  title="Delete this version"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Footer — action buttons + mobile nav */}
      {data && (activePolish || activeTerm || activeCert) && (() => {
        // Certificate tab footer
        if (reportTab === 'cert' && activeCert) {
          return (
            <div className="border-t border-slate-800 px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
              <p className="text-[10px] text-slate-600 italic hidden md:block">
                {certEditMode ? 'Editing certificate — save when ready' : 'Saved certificate'}
              </p>
              {isMobile && (
                <div className="flex items-center gap-1">
                  <button onClick={() => onNavigate(-1)} disabled={index === 0} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30 transition-colors font-medium"><span className="text-lg">‹</span> Prev</button>
                  <span className="text-[11px] text-slate-500 px-2">{index + 1}/{total}</span>
                  <button onClick={() => onNavigate(1)} disabled={index === total - 1} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30 transition-colors font-medium">Next <span className="text-lg">›</span></button>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Download */}
                <button onClick={handleCertDownload} disabled={certDownloading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors disabled:opacity-60"
                >
                  {certDownloading
                    ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>}
                  {certDownloading ? 'Downloading…' : 'Download PDF'}
                </button>
                {/* Edit / Save / Cancel */}
                {onSaveCert && (
                  certEditMode ? (
                    <>
                      <button onClick={() => { setCertEditMode(false); setCertCustomised(false); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                      >Cancel</button>
                      <button onClick={handleCertSave} disabled={certSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                      >
                        {certSaving
                          ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving…</>
                          : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>Save</>}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setCertEditMode(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      Edit
                    </button>
                  )
                )}
                {/* Delete */}
                {onDeleteReport && !certEditMode && (
                  confirmDeleteCert ? (
                    <>
                      <span className="text-xs text-red-400 font-medium">Delete certificate?</span>
                      <button onClick={handleCertDelete} disabled={deletingCert}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold transition-colors disabled:opacity-60"
                      >{deletingCert ? 'Deleting…' : 'Yes, delete'}</button>
                      <button onClick={() => setConfirmDeleteCert(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                      >Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteCert(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-red-400/70 hover:text-red-400 text-xs font-medium transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      Delete
                    </button>
                  )
                )}
              </div>
            </div>
          );
        }

        const activeReport = reportTab === 'polish' ? activePolish : activeTerm;
        const activeTab = reportTab as 'polish' | 'term';
        const activeType: ReportType = activeTab === 'polish' ? 'polish_report' : 'term_report';
        const isEditingActive = editingTab === activeTab;
        const isRegeneratingActive = regenerating === activeTab;
        if (!activeReport) return null;
        return (
          <div className="border-t border-slate-800 px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
            {/* Left: status label */}
            <p className="text-[10px] text-slate-600 italic hidden md:block">
              {isEditingActive ? 'Editing — save when ready' : 'Saved · for internal review only'}
            </p>
            {/* Mobile: nav arrows on left */}
            {isMobile && (
              <div className="flex items-center gap-1">
                <button onClick={() => onNavigate(-1)} disabled={index === 0}
                  className="flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30 transition-colors font-medium"
                ><span className="text-lg">‹</span> Prev</button>
                <span className="text-[11px] text-slate-500 px-2">{index + 1}/{total}</span>
                <button onClick={() => onNavigate(1)} disabled={index === total - 1}
                  className="flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30 transition-colors font-medium"
                >Next <span className="text-lg">›</span></button>
              </div>
            )}
            {/* Right: action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Copy */}
              {!isEditingActive && (
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                >
                  {copied
                    ? <><svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>Copied</>
                    : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>Copy</>}
                </button>
              )}
              {/* Edit/Save/Cancel/Regenerate */}
              {onSaveReport && (
                isEditingActive ? (
                  <>
                    <button onClick={handleCancelEdit}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                    >Cancel</button>
                    <button onClick={() => handleSave(activeReport.id!, activeType)} disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                    >
                      {saving
                        ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving…</>
                        : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>Save</>}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => handleEdit(activeTab, activeReport.text)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      Edit
                    </button>
                    {confirmRegenTab === activeTab ? (
                      <>
                        <span className="text-[10px] text-amber-400 font-medium">Overwrite existing report?</span>
                        <button onClick={() => { setConfirmRegenTab(null); handleRegenerate(activeTab); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-medium transition-colors"
                        >Yes, Regenerate</button>
                        <button onClick={() => setConfirmRegenTab(null)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-[10px] font-medium transition-colors"
                        >Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => {
                        // Check if a report of this type already exists
                        const hasExisting = activeTab === 'polish'
                          ? data?.allPolish && data.allPolish.length > 0
                          : data?.allTerm && data.allTerm.length > 0;
                        if (hasExisting) { setConfirmRegenTab(activeTab); return; }
                        handleRegenerate(activeTab);
                      }} disabled={!!regenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors disabled:opacity-60"
                      >
                        {isRegeneratingActive
                          ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating…</>
                          : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Regenerate</>}
                      </button>
                    )}
                  </>
                )
              )}
              {/* Delete — far right, only when not editing */}
              {onDeleteReport && !isEditingActive && (
                confirmDeleteFooter ? (
                  <>
                    <span className="text-xs text-red-400 font-medium">Delete this report?</span>
                    <button onClick={() => handleDelete(activeReport.id!, activeType)} disabled={deleting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold transition-colors disabled:opacity-60"
                    >
                      {deleting
                        ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Deleting…</>
                        : 'Yes, delete'}
                    </button>
                    <button onClick={() => setConfirmDeleteFooter(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                    >Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDeleteFooter(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-red-400/70 hover:text-red-400 text-xs font-medium transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    Delete
                  </button>
                )
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level gen store — persists across component mount/unmount so that an
// in-progress bulk generation survives navigation away and back.
// ─────────────────────────────────────────────────────────────────────────────

let _genJobs:        BulkJobEntry[] = [];
let _genRunning      = false;
let _genPrechecking  = false;
let _genDone         = false;
const _genListeners  = new Set<() => void>();
const _notifyGen = () => _genListeners.forEach(fn => fn());

const genStore = {
  get jobs()         { return _genJobs; },
  get running()      { return _genRunning; },
  get prechecking()  { return _genPrechecking; },
  get done()         { return _genDone; },
  setJobs(v: BulkJobEntry[] | ((p: BulkJobEntry[]) => BulkJobEntry[])) {
    _genJobs = typeof v === 'function' ? v(_genJobs) : v; _notifyGen();
  },
  setRunning(v: boolean)     { _genRunning = v;     _notifyGen(); },
  setPrechecking(v: boolean) { _genPrechecking = v; _notifyGen(); },
  setDone(v: boolean)        { _genDone = v;        _notifyGen(); },
  subscribe(fn: () => void)  { _genListeners.add(fn);    return () => _genListeners.delete(fn); },
};

function useGenStore() {
  const [, rerender] = useState(0);
  useEffect(() => genStore.subscribe(() => rerender(n => n + 1)), []);
  return genStore;
}

// ─────────────────────────────────────────────────────────────────────────────
// BulkReportsPage
// ─────────────────────────────────────────────────────────────────────────────

export const BulkReportsPage: React.FC<{ mode?: 'full' | 'export-only' }> = ({ mode = 'full' }) => {
  const {
    students, teachers, schools, lessons, enrollments,
    schoolEnrollmentPeriods, currentUser,
  } = useApp();
  const isExportOnly = mode === 'export-only';

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState('');
  const [schoolFilter, setSchoolFilter] = useState('all');

  // ── Tab + mobile view ──────────────────────────────────────────────────────
  const [tab,        setTab]        = useState<PageTab>(isExportOnly ? 'export' : 'students');
  const [mobileView, setMobileView] = useState<MobileView>('list');

  // Reset to list when tab changes
  useEffect(() => { setMobileView('list'); }, [tab]);

  // ── Students tab — viewing ────────────────────────────────────────────────
  const [viewingId, setViewingId] = useState<string | null>(null);

  // ── Generate / Export — selection ─────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Coverage: lazy per-student ────────────────────────────────────────────
  const coverageFetched = useRef<Set<string>>(new Set());
  const [coverage, setCoverage] = useState<Map<string, CoverageEntry>>(new Map());

  // ── Generate state ────────────────────────────────────────────────────────
  const [wantPolish,     setWantPolish]     = useState(true);
  const [wantTerm,       setWantTerm]       = useState(true);
  const [wantCert,       setWantCert]       = useState(false);
  const [certMinLessons, setCertMinLessons] = useState(4);
  const [certCoBrand,    setCertCoBrand]    = useState(true);
  // Legacy students often started before the system existed (lessons begin Jan 2026),
  // so the auto start month is unreliable — omit it by default.
  const [certIncludeStart, setCertIncludeStart] = useState(false);
  const [certBulkResult, setCertBulkResult] = useState<{ created: number; skippedExisting: number; skippedFew: number } | null>(null);
  const [periodScope,    setPeriodScope]    = useState<PeriodScope>('current');
  const [genMode,     setGenMode]     = useState<'all' | 'missing'>('all');

  // Persistent across navigation — lives in module-level genStore
  const gen = useGenStore();
  const genJobs        = gen.jobs;
  const genRunning     = gen.running;
  const genPrechecking = gen.prechecking;
  const genDone        = gen.done;
  const setGenJobs        = gen.setJobs;
  const setGenRunning     = gen.setRunning;
  const setGenPrechecking = gen.setPrechecking;
  const setGenDone        = gen.setDone;

  // ── Export state ──────────────────────────────────────────────────────────
  const [exportMode,        setExportMode]        = useState<'zip' | 'zip-per-student' | 'merged'>('zip-per-student');
  const [exportFileType,    setExportFileType]    = useState<'pdf' | 'word' | 'both'>('pdf');
  const [exportRunning,     setExportRunning]      = useState(false);
  const [exportProgress,    setExportProgress]     = useState<{ done: number; total: number; label?: string } | null>(null);
  const [certExporting,     setCertExporting]      = useState(false);
  const [certProgress,      setCertProgress]       = useState<{ done: number; total: number } | null>(null);
  const [certGenRunning,    setCertGenRunning]     = useState(false);
  const [certGenResult,     setCertGenResult]      = useState<{ done: number; total: number; created: number; skipped: number } | null>(null);
  const [exportCoverage,    setExportCoverage]     = useState<Map<string, { polish?: SavedAIReport; term?: SavedAIReport; cert?: SavedAIReport }> | null>(null);
  const [exportCovLoading,  setExportCovLoading]   = useState(false);

  // ── Bulk delete state ─────────────────────────────────────────────────────
  type BulkDeleteType = 'polish' | 'term' | 'cert' | 'both';
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleteType,    setBulkDeleteType]    = useState<BulkDeleteType>('both');
  const [bulkDeleting,      setBulkDeleting]      = useState(false);
  const [bulkDeleteDone,    setBulkDeleteDone]    = useState<{ deleted: number; skipped: number } | null>(null);

  // ── Derived data ──────────────────────────────────────────────────────────

  const enrichedStudents = useMemo<EnrichedStudent[]>(() => students.map(s => ({
    ...s,
    teacherName: teachers.find(t => t.id === s.teacherId)?.name ?? '',
    schoolName:  schools.find(sc => sc.id === s.schoolId)?.name ?? '',
  })), [students, teachers, schools]);

  const filteredStudents = useMemo(() => {
    let r = enrichedStudents;
    if (schoolFilter !== 'all') r = r.filter(s => s.schoolId === schoolFilter);
    if (search.trim()) {
      r = r.filter(s =>
        matchesSearch(search, [s.name, s.instrument, s.teacherName, s.schoolName]),
      );
    }
    return r;
  }, [enrichedStudents, schoolFilter, search]);

  const viewingIndex   = filteredStudents.findIndex(s => s.id === viewingId);
  const viewingStudent = viewingIndex >= 0 ? filteredStudents[viewingIndex] : null;

  const viewingStudentStats = useMemo(() => {
    if (!viewingStudent) return null;
    const sl = lessons.filter(l => l.studentIds?.includes(viewingStudent.id));
    const attended = sl.filter(l => l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT).length;
    const consumed  = sl.filter(l => l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT || l.status === LessonStatus.ABSENT_UNEXCUSED).length;
    const absent    = sl.filter(l => l.status === LessonStatus.ABSENT_EXCUSED || l.status === LessonStatus.ABSENT_UNEXCUSED).length;
    const attendanceRate = consumed > 0 ? Math.round((attended / consumed) * 100) : 0;
    const totalHours = sl.reduce((sum, l) => sum + (l.durationMinutes ?? 0), 0) / 60;
    return { totalLessons: sl.length, attended, absent, attendanceRate, totalHours };
  }, [viewingStudent, lessons]);
  const selectedStudents = useMemo(() => filteredStudents.filter(s => selectedIds.has(s.id)), [filteredStudents, selectedIds]);

  const allChecked  = filteredStudents.length > 0 && filteredStudents.every(s => selectedIds.has(s.id));
  const someChecked = filteredStudents.some(s => selectedIds.has(s.id)) && !allChecked;

  // ── Coverage loader ───────────────────────────────────────────────────────

  const loadCoverage = useCallback(async (studentId: string) => {
    if (coverageFetched.current.has(studentId)) return;
    coverageFetched.current.add(studentId);
    setCoverage(prev => new Map(prev).set(studentId, 'loading'));
    const reports = await fetchSavedReports(studentId);
    const polishReports = reports.filter(r => r.reportType === 'polish_report');
    const termReports   = reports.filter(r => r.reportType === 'term_report');
    const certReports   = reports.filter(r => r.reportType === 'certificate');
    setCoverage(prev => new Map(prev).set(studentId, {
      polishCount: polishReports.length,
      termCount:   termReports.length,
      certCount:   certReports.length,
      latestPolish: polishReports[0],
      latestTerm:   termReports[0],
      latestCert:   certReports[0],
      allPolish: polishReports,
      allTerm:   termReports,
      allCerts:  certReports,
    }));
  }, []);

  // ── Viewing navigation ────────────────────────────────────────────────────

  const selectStudent = useCallback((studentId: string) => {
    setViewingId(studentId);
    setMobileView('viewer');
    loadCoverage(studentId);
  }, [loadCoverage]);

  const navigateViewer = useCallback((dir: -1 | 1) => {
    const newIdx = viewingIndex + dir;
    if (newIdx < 0 || newIdx >= filteredStudents.length) return;
    const s = filteredStudents[newIdx];
    setViewingId(s.id);
    loadCoverage(s.id);
  }, [viewingIndex, filteredStudents, loadCoverage]);

  // ── Select-all / toggle ───────────────────────────────────────────────────

  const toggleAll = () => setSelectedIds(prev => {
    const n = new Set(prev);
    allChecked ? filteredStudents.forEach(s => n.delete(s.id)) : filteredStudents.forEach(s => n.add(s.id));
    return n;
  });

  const toggleOne = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // ── Period resolution ─────────────────────────────────────────────────────

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const resolvePeriod = useCallback((student: Student, studentLessons: Lesson[]) => {
    if (periodScope === 'all') return { lessons: studentLessons };
    const periods = getRelevantPeriodsForStudent(student, schoolEnrollmentPeriods, studentLessons, today, enrollments);
    const match = periodScope === 'current' ? periods.find(p => p.isCurrent) : periods.find(p => p.isPast);
    if (!match) return { lessons: studentLessons };
    return {
      lessons:     studentLessons.filter(l => l.date >= match.period.startDate && l.date <= match.period.endDate),
      periodName:  match.period.name,
      periodStart: match.period.startDate,
      periodEnd:   match.period.endDate,
    };
  }, [periodScope, schoolEnrollmentPeriods, enrollments, today]);

  const buildEntry = useCallback((student: EnrichedStudent): BulkStudentEntry => {
    const allLessons = lessons.filter(l => l.studentIds?.includes(student.id));
    const { lessons: pl, periodName, periodStart, periodEnd } = resolvePeriod(student, allLessons);
    return {
      student,
      lessons: pl,
      enrollments,
      schoolEnrollmentPeriods,
      schoolName:      schools.find(sc => sc.id === student.schoolId)?.name ?? '',
      teacherName:     teachers.find(t => t.id === student.teacherId)?.name ?? student.teacherName,
      schoolId:        student.schoolId ?? '',
      teacherIds:      (student as any).currentTeacherIds ?? (student.teacherId ? [student.teacherId] : []),
      generatedBy:     currentUser?.id ?? '',
      generatedByName: currentUser?.name ?? '',
      periodName, periodStart, periodEnd,
    };
  }, [lessons, enrollments, schoolEnrollmentPeriods, schools, teachers, currentUser, resolvePeriod]);

  const reportTypes = useMemo<ReportType[]>(() => [
    ...(wantPolish ? ['polish_report' as ReportType] : []),
    ...(wantTerm   ? ['term_report'   as ReportType] : []),
  ], [wantPolish, wantTerm]);

  const noTypes = !wantPolish && !wantTerm && !wantCert;

  // ── Viewer: save edits to a report ───────────────────────────────────────

  const handleViewerSave = useCallback(async (
    reportId: string, _reportType: ReportType, text: string, action: 'generated' | 'edited',
  ) => {
    if (!currentUser || !viewingStudent) return;
    const now = new Date().toISOString();
    await updateReport(viewingStudent.id, reportId, {
      text,
      lastSourceAction: action,
      updatedAt: now,
      editedBy: action === 'edited' ? currentUser.id : null,
      editedByName: action === 'edited' ? currentUser.name : null,
    });
    // Invalidate cache so the row re-fetches fresh counts & text
    coverageFetched.current.delete(viewingStudent.id);
    setCoverage(prev => { const n = new Map(prev); n.delete(viewingStudent.id); return n; });
    loadCoverage(viewingStudent.id);
  }, [currentUser, viewingStudent, loadCoverage]);

  // ── Viewer: update term report scores/approval ───────────────────────────

  const handleViewerUpdateTerm = useCallback(async (
    reportId: string, updates: Partial<SavedAIReport>,
  ) => {
    if (!viewingStudent) return;
    await updateReport(viewingStudent.id, reportId, updates);
    coverageFetched.current.delete(viewingStudent.id);
    setCoverage(prev => { const n = new Map(prev); n.delete(viewingStudent.id); return n; });
    loadCoverage(viewingStudent.id);
  }, [viewingStudent, loadCoverage]);

  // ── Viewer: regenerate a report ───────────────────────────────────────────

  const handleViewerRegenerate = useCallback(async (reportType: ReportType) => {
    if (!currentUser || !viewingStudent) return;
    const studentLessons = lessons.filter(l => l.studentIds?.includes(viewingStudent.id));
    const { lessons: pl, periodName, periodStart, periodEnd } = resolvePeriod(viewingStudent, studentLessons);
    const existingCov = coverage.get(viewingStudent.id);
    // Alignment: anchor the regenerated report to the OTHER type if it exists.
    const other = existingCov && existingCov !== 'loading'
      ? (reportType === 'polish_report' ? existingCov.latestTerm : existingCov.latestPolish)
      : undefined;
    const anchor = other?.text
      ? { reportType: other.reportType, text: other.text }
      : undefined;
    const report = await generateReport({
      student: viewingStudent,
      allLessons: pl,
      allEnrollments: enrollments,
      schoolEnrollmentPeriods,
      schoolName: schools.find(sc => sc.id === viewingStudent.schoolId)?.name ?? '',
      teacherName: teachers.find(t => t.id === viewingStudent.teacherId)?.name ?? viewingStudent.teacherName,
      audience: 'teacher',
      mode: 'polish',
    }, reportType, anchor);
    const now = new Date().toISOString();
    const existing = existingCov && existingCov !== 'loading'
      ? (reportType === 'polish_report' ? existingCov.latestPolish : existingCov.latestTerm)
      : undefined;
    if (existing?.id) {
      await updateReport(viewingStudent.id, existing.id, {
        text: report.text,
        lastSourceAction: 'generated',
        updatedAt: now,
        editedBy: null,
        editedByName: null,
      });
    } else {
      await saveReport(viewingStudent.id, {
        reportType,
        studentId: viewingStudent.id,
        schoolId: viewingStudent.schoolId,
        teacherId: viewingStudent.teacherId,
        teacherIds: (viewingStudent as any).currentTeacherIds ?? (viewingStudent.teacherId ? [viewingStudent.teacherId] : []),
        text: report.text,
        source: report.isFallback ? 'fallback' : 'ai',
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
        ...(periodName && { periodName, periodStart, periodEnd }),
      });
    }
    coverageFetched.current.delete(viewingStudent.id);
    setCoverage(prev => { const n = new Map(prev); n.delete(viewingStudent.id); return n; });
    loadCoverage(viewingStudent.id);
  }, [currentUser, viewingStudent, lessons, enrollments, schoolEnrollmentPeriods, schools, teachers, coverage, loadCoverage, resolvePeriod]);

  // ── Viewer: save cert edits ───────────────────────────────────────────────

  const handleViewerSaveCert = useCallback(async (certId: string, updatedInput: CertInput) => {
    if (!currentUser || !viewingStudent) return;
    const now = new Date().toISOString();
    await updateReport(viewingStudent.id, certId, {
      text: buildCompletionLine(updatedInput),
      certificate: snapshotFromCertInput(updatedInput),
      approvedByName: updatedInput.teacherName,
      updatedAt: now,
      editedBy: currentUser.id,
      editedByName: currentUser.name,
      lastSourceAction: 'edited',
    });
    coverageFetched.current.delete(viewingStudent.id);
    setCoverage(prev => { const n = new Map(prev); n.delete(viewingStudent.id); return n; });
    loadCoverage(viewingStudent.id);
  }, [currentUser, viewingStudent, loadCoverage]);

  // ── Viewer: delete a report ───────────────────────────────────────────────

  const handleViewerDelete = useCallback(async (reportId: string, _reportType: ReportType) => {
    if (!viewingStudent) return;
    await deleteReport(viewingStudent.id, reportId);
    coverageFetched.current.delete(viewingStudent.id);
    setCoverage(prev => { const n = new Map(prev); n.delete(viewingStudent.id); return n; });
    loadCoverage(viewingStudent.id);
  }, [viewingStudent, loadCoverage]);

  // ── Bulk delete ───────────────────────────────────────────────────────────

  const runBulkDelete = useCallback(async () => {
    if (!selectedStudents.length || bulkDeleting) return;
    setBulkDeleting(true);
    setBulkDeleteDone(null);
    let deleted = 0;
    let skipped = 0;
    for (const s of selectedStudents) {
      try {
        const reports = await fetchSavedReports(s.id);
        const toDelete = reports.filter(r =>
          bulkDeleteType === 'both' ? true
          : bulkDeleteType === 'polish' ? r.reportType === 'polish_report'
          : bulkDeleteType === 'cert' ? r.reportType === 'certificate'
          : r.reportType === 'term_report',
        );
        for (const r of toDelete) {
          await deleteReport(s.id, r.id!);
          deleted++;
        }
        if (toDelete.length > 0) {
          coverageFetched.current.delete(s.id);
          setCoverage(prev => { const n = new Map(prev); n.delete(s.id); return n; });
          loadCoverage(s.id);
        }
      } catch {
        skipped++;
      }
    }
    setBulkDeleting(false);
    setBulkDeleteDone({ deleted, skipped });
    setBulkDeleteConfirm(false);
    setSelectedIds(new Set());
  }, [selectedStudents, bulkDeleteType, bulkDeleting, loadCoverage, setSelectedIds]);

  // ── Generate ──────────────────────────────────────────────────────────────

  const runGenerate = useCallback(async () => {
    // Allow running when at least one report type OR certificates are requested.
    if (!selectedStudents.length || genRunning || genPrechecking || (!reportTypes.length && !wantCert)) return;
    setGenDone(false); setGenJobs([]); setCertBulkResult(null);

    // ── AI reports (Progress Review / Term Report) — only when a report type is chosen ──
    if (reportTypes.length > 0) {
      let entriesToGenerate: BulkStudentEntry[];
      let initialJobs: BulkJobEntry[];

      if (genMode === 'missing') {
        setGenPrechecking(true);
        const precheck = new Map<string, { polish?: SavedAIReport; term?: SavedAIReport }>();
        for (const s of selectedStudents) {
          const all = await fetchSavedReports(s.id);
          precheck.set(s.id, { polish: all.find(r => r.reportType === 'polish_report'), term: all.find(r => r.reportType === 'term_report') });
        }
        setGenPrechecking(false);
        setGenRunning(true);

        initialJobs = selectedStudents.map(s => {
          const cov = precheck.get(s.id) ?? {};
          const needsGen = (wantPolish && !cov.polish) || (wantTerm && !cov.term);
          return {
            studentId: s.id, studentName: s.name,
            status: needsGen ? 'pending' : 'skipped',
            polishDone: false, termDone: false,
            skipReason: needsGen ? undefined :
              wantPolish && wantTerm ? 'Both reports already saved' :
              wantPolish ? 'Progress Review already saved' : 'Term Report already saved',
          } satisfies BulkJobEntry;
        });
        setGenJobs([...initialJobs]);
        entriesToGenerate = selectedStudents
          .filter(s => { const c = precheck.get(s.id) ?? {}; return (wantPolish && !c.polish) || (wantTerm && !c.term); })
          .map(buildEntry);
      } else {
        setGenRunning(true);
        initialJobs = selectedStudents.map(s => ({ studentId: s.id, studentName: s.name, status: 'pending', polishDone: false, termDone: false }));
        setGenJobs([...initialJobs]);
        entriesToGenerate = selectedStudents.map(buildEntry);
      }

      await bulkGenerateAndSave(entriesToGenerate, reportTypes, serviceJobs => {
        setGenJobs(prev => prev.map(j => serviceJobs.find(sj => sj.studentId === j.studentId) ?? j));
      });
    } else {
      // Certificate-only run — still flag as running for the cert loop below.
      setGenRunning(true);
    }

    setGenRunning(false);

    // Also generate certificates if requested
    if (wantCert && currentUser) {
      let created = 0, skippedExisting = 0, skippedFew = 0;
      setCertBulkResult({ created, skippedExisting, skippedFew });
      // Preload which schools have a logo configured, so we can co-brand when requested.
      const schoolHasLogo = new Map<string, boolean>();
      if (certCoBrand) {
        const schoolIds = [...new Set(selectedStudents.map(s => s.schoolId).filter((x): x is string => !!x))];
        for (const sid of schoolIds) {
          const cfg = await loadSchoolCertificateConfig(sid);
          schoolHasLogo.set(sid, !!cfg?.logoBase64);
        }
      }
      for (const s of selectedStudents) {
        const sl = lessons.filter(l => l.studentIds?.includes(s.id));
        const teacher = teachers.find(t => t.id === s.teacherId);
        const schoolName = schools.find(sc => sc.id === s.schoolId)?.name ?? '';
        // Certificate scope follows the shared "Lesson Period" filter (Current / Previous / All lessons).
        const { lessons: scopeLessons } = resolvePeriod(s, sl);
        // Enrollments that have lessons in the selected scope (all enrollments when scope = All lessons).
        const scopeEnrollIds = new Set(scopeLessons.map(l => l.enrollmentId).filter((x): x is string => !!x));
        const scopeEnrollments = enrollments
          .filter(e => e.studentId === s.id && (periodScope === 'all' || scopeEnrollIds.has(e.id)))
          .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));

        let ci: CertInput | null = null;
        if (scopeEnrollments.length > 0) {
          const merged = mergeCertInputs(scopeEnrollments.map(e => certInputFromEnrollment(e, s, schoolName, teacher?.name ?? s.teacherName)));
          // Default range = first → last paid lesson within the selected scope.
          const range = consumedLessonRange(scopeLessons);
          ci = { ...merged, startDate: range.startDate ?? merged.startDate, endDate: range.endDate ?? merged.endDate };
        }
        if (!ci) {
          ci = resolveCertInput(s, enrollments, schoolEnrollmentPeriods, sl, schoolName, teacher?.name ?? s.teacherName);
          if (ci) {
            const range = consumedLessonRange(scopeLessons);
            if (range.startDate) ci = { ...ci, startDate: range.startDate, endDate: range.endDate };
          }
        }
        if (!ci) continue;
        // Co-brand when requested and the student's school has a logo configured.
        if (certCoBrand && s.schoolId && schoolHasLogo.get(s.schoolId)) {
          ci = { ...ci, coBranded: true };
        }
        // Omit the start month unless explicitly included (legacy students have
        // unreliable start dates). Result reads "…course, completed {endMonth}."
        if (!certIncludeStart) {
          ci = { ...ci, startDate: undefined };
        }
        // Credibility guard: skip students with too few paid lessons in the selected scope.
        const paidCount = countPaidLessons(scopeLessons);
        if (paidCount < certMinLessons) {
          skippedFew++;
          setCertBulkResult({ created, skippedExisting, skippedFew });
          continue;
        }
        try {
          const existing = await fetchSavedReports(s.id);
          const has = existing.some(r => r.reportType === 'certificate' && r.certificate?.enrollmentId === ci.id);
          if (!has) {
            const now = new Date().toISOString();
            await saveReport(s.id, {
              reportType: 'certificate', studentId: s.id, schoolId: s.schoolId,
              teacherId: s.teacherId, teacherIds: [s.teacherId].filter(Boolean),
              text: buildCompletionLine(ci), source: 'fallback', status: 'draft',
              generatedAt: now, updatedAt: now,
              generatedBy: currentUser.id, generatedByName: currentUser.name,
              editedBy: null, editedByName: null, lastSourceAction: 'generated',
              promptVersion: PROMPT_VERSION, providerVersion: PROVIDER_VERSION,
              certificate: snapshotFromCertInput(ci), approvedByName: ci.teacherName,
            });
            created++;
          } else {
            skippedExisting++;
          }
          setCertBulkResult({ created, skippedExisting, skippedFew });
        } catch { /* skip on error */ }
      }
    }

    setGenDone(true);
    // Invalidate coverage cache for generated students so they refresh
    selectedStudents.forEach(s => coverageFetched.current.delete(s.id));
    setCoverage(prev => { const n = new Map(prev); selectedStudents.forEach(s => n.delete(s.id)); return n; });
  }, [selectedStudents, genMode, wantPolish, wantTerm, wantCert, certMinLessons, certCoBrand, certIncludeStart, periodScope, resolvePeriod, reportTypes, genRunning, genPrechecking, buildEntry, currentUser, lessons, teachers, schools, enrollments, schoolEnrollmentPeriods]);

  // ── Export coverage ───────────────────────────────────────────────────────

  const loadExportCoverage = useCallback(async () => {
    if (!selectedStudents.length) return;
    setExportCovLoading(true);
    const map = new Map<string, { polish?: SavedAIReport; term?: SavedAIReport; cert?: SavedAIReport }>();
    for (const s of selectedStudents) {
      const all = await fetchSavedReports(s.id);
      map.set(s.id, {
        polish: all.find(r => r.reportType === 'polish_report'),
        term:   all.find(r => r.reportType === 'term_report'),
        cert:   all.find(r => r.reportType === 'certificate'),
      });
    }
    setExportCoverage(map);
    setExportCovLoading(false);
  }, [selectedStudents]);

  useEffect(() => { setExportCoverage(null); }, [selectedIds, wantPolish, wantTerm, wantCert]);

  const exportCovStats = useMemo(() => {
    if (!exportCoverage) return null;
    let ready = 0, partial = 0, missing = 0;
    for (const [, c] of exportCoverage) {
      const hp = !wantPolish || !!c.polish;
      const ht = !wantTerm   || !!c.term;
      const hc = !wantCert   || !!c.cert;
      if (hp && ht && hc) ready++;
      else if (hp || ht || hc) partial++;
      else missing++;
    }
    return { ready, partial, missing };
  }, [exportCoverage, wantPolish, wantTerm, wantCert]);

  const runExport = useCallback(async () => {
    if (!exportCoverage || exportRunning) return;
    setExportRunning(true); setExportProgress({ done: 0, total: 0 });

    // Build report entries — only when a report type (Progress/Term) is selected.
    const entries: BulkExportEntry[] = (wantPolish || wantTerm)
      ? selectedStudents.map(student => {
          const c = exportCoverage.get(student.id) ?? {};
          const allLessons = lessons.filter(l => l.studentIds?.includes(student.id));
          const { lessons: pl } = resolvePeriod(student, allLessons);
          const teacher = teachers.find(t => t.id === student.teacherId);
          return {
            student, lessons: pl,
            schoolName:  schools.find(sc => sc.id === student.schoolId)?.name ?? '',
            teacherName: teacher?.name ?? student.teacherName,
            teacherReportDisplayName: teacher?.reportDisplayName,
            teacherSignatureUrl: teacher?.signatureUrl,
            polishReport: wantPolish ? c.polish : undefined,
            termReport:   wantTerm   ? c.term   : undefined,
          };
        })
      : [];

    // Build cert inputs — use the saved snapshot when available (preserves edits +
    // co-branding); otherwise resolve one on the fly so the export is never empty.
    const certInputs: CertInput[] | undefined = wantCert
      ? selectedStudents
          .map(s => {
            const c = exportCoverage.get(s.id) ?? {};
            if (c.cert?.certificate) return certInputFromSnapshot(c.cert.certificate, c.cert.text);
            const sl = lessons.filter(l => l.studentIds?.includes(s.id));
            const teacher = teachers.find(t => t.id === s.teacherId);
            const schoolName = schools.find(sc => sc.id === s.schoolId)?.name ?? '';
            return resolveCertInput(s, enrollments, schoolEnrollmentPeriods, sl, schoolName, teacher?.name ?? s.teacherName);
          })
          .filter((x): x is CertInput => !!x)
      : undefined;

    // ONE combined download — reports + certificates together.
    const effectiveFileType = exportMode === 'zip' ? exportFileType : 'pdf';
    await bulkExportReports(
      entries,
      exportMode,
      (done, total, label) => setExportProgress({ done, total, label }),
      effectiveFileType,
      certInputs,
    );

    setExportRunning(false); setExportProgress(null);
  }, [exportCoverage, selectedStudents, lessons, schools, teachers, enrollments, schoolEnrollmentPeriods, wantPolish, wantTerm, wantCert, exportMode, exportFileType, exportRunning, resolvePeriod]);

  // Bulk certificates — one PDF per selected student, zipped. Auto-resolves each
  // student's course (enrollment → period → lessons), so no saved report needed.
  const runCertificateExport = useCallback(async () => {
    if (!selectedStudents.length || certExporting) return;
    setCertExporting(true); setCertProgress({ done: 0, total: 0 });
    const inputs = selectedStudents
      .map(s => {
        const sl = lessons.filter(l => l.studentIds?.includes(s.id));
        const teacher = teachers.find(t => t.id === s.teacherId);
        const schoolName = schools.find(sc => sc.id === s.schoolId)?.name ?? '';
        return resolveCertInput(s, enrollments, schoolEnrollmentPeriods, sl, schoolName, teacher?.name ?? s.teacherName);
      })
      .filter((x): x is CertInput => !!x);
    if (inputs.length) {
      await generateCertificatesZIP(inputs, 'Certificates', (done, total) => setCertProgress({ done, total }));
    }
    setCertExporting(false); setCertProgress(null);
  }, [selectedStudents, lessons, teachers, schools, enrollments, schoolEnrollmentPeriods, certExporting]);

  // Bulk-generate & save certificates (so they show for parents). Skips a student
  // who already has a saved certificate for the same course.
  const runCertificateGenerate = useCallback(async () => {
    if (!selectedStudents.length || certGenRunning || !currentUser) return;
    setCertGenRunning(true);
    setCertGenResult({ done: 0, total: selectedStudents.length, created: 0, skipped: 0 });
    let created = 0, skipped = 0;
    for (let i = 0; i < selectedStudents.length; i++) {
      const s = selectedStudents[i];
      const sl = lessons.filter(l => l.studentIds?.includes(s.id));
      const teacher = teachers.find(t => t.id === s.teacherId);
      const schoolName = schools.find(sc => sc.id === s.schoolId)?.name ?? '';
      const ci = resolveCertInput(s, enrollments, schoolEnrollmentPeriods, sl, schoolName, teacher?.name ?? s.teacherName);
      if (!ci) { skipped++; setCertGenResult({ done: i + 1, total: selectedStudents.length, created, skipped }); continue; }
      try {
        const existing = await fetchSavedReports(s.id);
        const has = existing.some(r => r.reportType === 'certificate' && r.certificate?.enrollmentId === ci.id);
        if (has) { skipped++; }
        else {
          const now = new Date().toISOString();
          const toSave: Omit<SavedAIReport, 'id'> = {
            reportType: 'certificate', studentId: s.id, schoolId: s.schoolId,
            teacherId: s.teacherId, teacherIds: [s.teacherId].filter(Boolean),
            text: buildCompletionLine(ci), source: 'fallback', status: 'draft',
            generatedAt: now, updatedAt: now,
            generatedBy: currentUser.id, generatedByName: currentUser.name,
            editedBy: null, editedByName: null, lastSourceAction: 'generated',
            promptVersion: PROMPT_VERSION, providerVersion: PROVIDER_VERSION,
            certificate: snapshotFromCertInput(ci), approvedByName: ci.teacherName,
          };
          await saveReport(s.id, toSave);
          created++;
        }
      } catch { skipped++; }
      setCertGenResult({ done: i + 1, total: selectedStudents.length, created, skipped });
    }
    setCertGenRunning(false);
  }, [selectedStudents, lessons, teachers, schools, enrollments, schoolEnrollmentPeriods, currentUser, certGenRunning]);

  // ── Generate derived ──────────────────────────────────────────────────────
  const activeJobs   = genJobs.filter(j => j.status !== 'skipped');
  const skippedCount = genJobs.filter(j => j.status === 'skipped').length;
  const doneCount    = activeJobs.filter(j => j.status === 'done').length;
  const errCount     = activeJobs.filter(j => j.status === 'error').length;
  const pct          = activeJobs.length > 0 ? (doneCount / activeJobs.length) * 100 : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Left panel — shared student list
  // ─────────────────────────────────────────────────────────────────────────

  const showCheckboxes = tab === 'generate' || tab === 'export' || tab === 'students';
  const showStudentsSelectBar = tab === 'students';

  const LeftPanel = (
    <div className="flex flex-col h-full overflow-hidden border-r border-slate-800">
      {/* Search + filter */}
      <div className="p-3 space-y-2 border-b border-slate-800 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className={`${inputCls} pl-8`} />
        </div>
        {schools.length > 1 && (
          <select value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)} className={inputCls}>
            <option value="all">All schools</option>
            {schools.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
          </select>
        )}
      </div>

      {/* Select-all (Generate/Export tabs) */}
      {showCheckboxes && (
        <div className="border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-2">
            <input type="checkbox" checked={allChecked}
              ref={el => { if (el) el.indeterminate = someChecked; }}
              onChange={toggleAll}
              className="accent-primary-500 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-[11px] text-slate-400 flex-1">
              {selectedIds.size > 0 ? <><span className="text-primary-400 font-medium">{selectedIds.size}</span> selected</> : 'Select all'}
            </span>
            {selectedIds.size > 0 && (
              <button onClick={() => { setSelectedIds(new Set()); setBulkDeleteConfirm(false); setBulkDeleteDone(null); }}
                className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">Clear</button>
            )}
          </div>
          {/* Bulk delete action bar — Students tab only */}
          {showStudentsSelectBar && selectedIds.size > 0 && (
            <div className="px-3 pb-2 space-y-2">
              {bulkDeleteDone && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                  <span className="text-[11px] text-emerald-400">{bulkDeleteDone.deleted} report{bulkDeleteDone.deleted !== 1 ? 's' : ''} deleted{bulkDeleteDone.skipped > 0 ? `, ${bulkDeleteDone.skipped} failed` : ''}</span>
                  <button onClick={() => setBulkDeleteDone(null)} className="ml-auto text-[10px] text-slate-600 hover:text-slate-400">×</button>
                </div>
              )}
              {bulkDeleteConfirm ? (
                <div className="space-y-2 px-2.5 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-[11px] text-red-400 font-medium">Delete reports for {selectedIds.size} student{selectedIds.size !== 1 ? 's' : ''}?</p>
                  <div className="flex items-center gap-1.5">
                    {(['both', 'polish', 'term', 'cert'] as const).map(t => (
                      <button key={t} onClick={() => setBulkDeleteType(t)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border ${
                          bulkDeleteType === t
                            ? 'bg-red-500/20 border-red-500/40 text-red-400'
                            : 'bg-slate-800/60 border-slate-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >{t === 'both' ? 'All types' : t === 'polish' ? 'Progress only' : t === 'cert' ? 'Certificate only' : 'Term only'}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={runBulkDelete} disabled={bulkDeleting}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold transition-colors disabled:opacity-60"
                    >
                      {bulkDeleting
                        ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Deleting…</>
                        : 'Yes, delete'}
                    </button>
                    <button onClick={() => setBulkDeleteConfirm(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                    >Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setBulkDeleteConfirm(true); setBulkDeleteDone(null); }}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-red-500/10 border border-slate-700/60 hover:border-red-500/30 text-slate-500 hover:text-red-400 text-xs font-medium transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  Delete reports for {selectedIds.size} student{selectedIds.size !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Student rows */}
      <div className="flex-1 overflow-y-auto">
        {filteredStudents.length === 0 ? (
          <p className="text-[11px] text-slate-600 text-center py-10">No students match</p>
        ) : filteredStudents.map(s => (
          <StudentRow
            key={s.id}
            student={s}
            cov={coverage.get(s.id)}
            isViewing={tab === 'students' && s.id === viewingId}
            isChecked={selectedIds.has(s.id)}
            showCheckbox={showCheckboxes}
            onClick={() => {
              if (tab === 'students') selectStudent(s.id);
              else toggleOne(s.id);
            }}
            onCheck={() => toggleOne(s.id)}
            onLoad={loadCoverage}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-slate-800 flex-shrink-0 space-y-2">
        <p className="text-[10px] text-slate-600">{filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}</p>
        {/* Mobile "Continue" button — full mode only, on Generate/Export tabs */}
        {!isExportOnly && (tab === 'generate' || tab === 'export') && (
          <button
            onClick={() => setMobileView('viewer')}
            className="md:hidden w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors"
          >
            {tab === 'generate' ? 'Configure generation' : 'Configure export'}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Right panel content by tab
  // ─────────────────────────────────────────────────────────────────────────

  const MobileBackBtn = (label: string) => (
    <button
      onClick={() => setMobileView('list')}
      className="md:hidden flex items-center gap-1.5 text-slate-400 hover:text-white text-sm font-medium transition-colors px-6 pt-4 pb-1 flex-shrink-0"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  );

  const RightGenerate = (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">
      {MobileBackBtn('Back to students')}
      {/* Report types */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Report types</p>
        <div className="grid grid-cols-2 gap-2">
          {REPORT_OPTIONS.map(opt => (
            <ReportTypeToggle key={opt.type} label={opt.label} sub={opt.sub}
              checked={opt.type === 'polish_report' ? wantPolish : wantTerm}
              onChange={() => opt.type === 'polish_report' ? setWantPolish(v => !v) : setWantTerm(v => !v)}
              disabled={genRunning}
            />
          ))}
          <ReportTypeToggle
            label="Certificate of Completion"
            sub="Saves a certificate for each student — visible to parents"
            checked={wantCert}
            onChange={() => setWantCert(v => !v)}
            disabled={genRunning}
          />
        </div>
        {wantCert && (
          <div className="space-y-1.5">
            {/* Minimum-lessons guard. Certificate date range + scope follow the Lesson Period filter below. */}
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-400">Minimum consumed lessons</label>
              <input
                type="number" min={0} value={certMinLessons} disabled={genRunning}
                onChange={e => setCertMinLessons(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-primary-500/40 disabled:opacity-40"
              />
              <span className="text-[10px] text-slate-600">Students with fewer consumed lessons (Taught/Present/Absent-Unexcused) are skipped. Certificate dates follow the Lesson Period below.</span>
            </div>
            {/* Co-branding toggle */}
            <button type="button" onClick={() => setCertCoBrand(v => !v)} disabled={genRunning}
              className={`flex items-center gap-2 text-left disabled:opacity-40 ${certCoBrand ? '' : ''}`}
            >
              <span className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${certCoBrand ? 'bg-amber-500 border-amber-500' : 'border-slate-600'}`}>
                {certCoBrand && <svg className="w-2.5 h-2.5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </span>
              <span className="text-[11px] text-slate-400">Co-brand with school logo &amp; signatories <span className="text-slate-600">(when the school has a logo configured)</span></span>
            </button>
            {/* Start-month toggle — omit by default for legacy students */}
            <button type="button" onClick={() => setCertIncludeStart(v => !v)} disabled={genRunning}
              className="flex items-center gap-2 text-left disabled:opacity-40"
            >
              <span className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${certIncludeStart ? 'bg-amber-500 border-amber-500' : 'border-slate-600'}`}>
                {certIncludeStart && <svg className="w-2.5 h-2.5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </span>
              <span className="text-[11px] text-slate-400">Include start month <span className="text-slate-600">(off → reads “…course, completed {`{month}`}”; on → “between {`{start}`} and {`{end}`}”)</span></span>
            </button>
            {certBulkResult && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] pt-0.5">
                <span className="text-emerald-400">{certBulkResult.created} created</span>
                {certBulkResult.skippedExisting > 0 && <span className="text-slate-500">· {certBulkResult.skippedExisting} already saved</span>}
                {certBulkResult.skippedFew > 0 && <span className="text-amber-400">· {certBulkResult.skippedFew} skipped (under {certMinLessons} lessons)</span>}
              </div>
            )}
          </div>
        )}
        {noTypes && <p className="text-[11px] text-amber-400">Select at least one report type.</p>}
      </div>

      {/* Period scope */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Lesson period</p>
        <div className="flex gap-1.5">
          {([
            { scope: 'current'  as PeriodScope, label: 'Current' },
            { scope: 'previous' as PeriodScope, label: 'Previous' },
            { scope: 'all'      as PeriodScope, label: 'All lessons' },
          ]).map(({ scope, label }) => (
            <button key={scope} onClick={() => setPeriodScope(scope)} disabled={genRunning}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 ${
                periodScope === scope ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-800/40 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
              }`}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Generate mode */}
      {!genRunning && !genPrechecking && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Generate mode</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { mode: 'all' as const,     label: 'Generate for all',    sub: 'Always calls AI — adds a new draft alongside any existing report' },
              { mode: 'missing' as const, label: 'Fill in missing only', sub: 'Skips students who already have the selected report type(s)' },
            ]).map(({ mode, label, sub }) => (
              <button key={mode} onClick={() => setGenMode(mode)}
                className={`text-left px-3.5 py-3 rounded-xl border transition-all ${
                  genMode === mode ? 'bg-primary-500/10 border-primary-500/40 ring-1 ring-primary-500/20' : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${genMode === mode ? 'border-primary-500 bg-primary-500' : 'border-slate-600'}`}>
                    {genMode === mode && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <p className={`text-xs font-semibold ${genMode === mode ? 'text-white' : 'text-slate-400'}`}>{label}</p>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed pl-5">{sub}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pre-check spinner */}
      {genPrechecking && (
        <div className="flex items-center gap-2.5">
          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin flex-shrink-0" />
          <p className="text-xs text-slate-400">Checking existing reports for {selectedIds.size} student{selectedIds.size !== 1 ? 's' : ''}…</p>
        </div>
      )}

      {/* Action button */}
      {!genRunning && !genPrechecking && (
        <button onClick={runGenerate}
          disabled={noTypes || selectedIds.size === 0}
          className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
            noTypes || selectedIds.size === 0
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : genDone
                ? 'bg-slate-700 border border-slate-600 text-slate-200 hover:bg-slate-600'
                : 'bg-primary-500 text-white hover:bg-primary-400 shadow-lg shadow-primary-500/10'
          }`}
        >
          {selectedIds.size === 0 ? 'Select students first' :
            genDone ? `Run again — ${selectedIds.size} student${selectedIds.size !== 1 ? 's' : ''}` :
            genMode === 'missing' ? `Check & fill missing — ${selectedIds.size} student${selectedIds.size !== 1 ? 's' : ''}` :
            (() => {
              const parts = [
                ...(wantPolish ? ['Progress Review'] : []),
                ...(wantTerm   ? ['Term Report'] : []),
                ...(wantCert   ? ['Certificate'] : []),
              ];
              return `Generate ${parts.join(' + ')} — ${selectedIds.size} student${selectedIds.size !== 1 ? 's' : ''}`;
            })()}
        </button>
      )}


      {/* Progress */}
      {genJobs.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 flex items-center gap-2">
                <span><span className="text-white font-medium">{doneCount}</span>/{activeJobs.length} generated</span>
                {skippedCount > 0 && <span className="text-slate-600">· {skippedCount} skipped</span>}
                {errCount > 0 && <span className="text-red-400">· {errCount} error{errCount !== 1 ? 's' : ''}</span>}
              </span>
              {genRunning && <span className="text-amber-400 animate-pulse">Running…</span>}
              {genDone    && <span className="text-emerald-400">Complete</span>}
            </div>
            {activeJobs.length > 0 && (
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${errCount > 0 && doneCount === activeJobs.length ? 'bg-amber-400' : 'bg-primary-500'}`} style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            {[...genJobs].sort((a, b) =>
              a.status === 'skipped' && b.status !== 'skipped' ? 1 :
              a.status !== 'skipped' && b.status === 'skipped' ? -1 : 0
            ).map(job => (
              <JobRow key={job.studentId} job={job} wantPolish={wantPolish} wantTerm={wantTerm} />
            ))}
          </div>
        </div>
      )}

      {/* Continue to export */}
      {genDone && (
        <button onClick={() => { setTab('export'); loadExportCoverage(); }}
          className="w-full py-2.5 rounded-xl bg-primary-500 text-white font-semibold text-sm hover:bg-primary-400 transition-all shadow-lg shadow-primary-500/10"
        >
          Continue to Export →
        </button>
      )}
    </div>
  );

  const RightExport = (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">
      {!isExportOnly && MobileBackBtn('Back to students')}
      {/* Report types to export */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Report types to export</p>
        <div className="grid grid-cols-2 gap-2">
          {REPORT_OPTIONS.map(opt => (
            <ReportTypeToggle key={opt.type} label={opt.label} sub={opt.sub}
              checked={opt.type === 'polish_report' ? wantPolish : wantTerm}
              onChange={() => {
                if (opt.type === 'polish_report') setWantPolish(v => !v);
                else setWantTerm(v => !v);
              }}
            />
          ))}
          <ReportTypeToggle
            label="Certificate of Completion"
            sub="Included in the same download as the reports"
            checked={wantCert}
            onChange={() => setWantCert(v => !v)}
          />
        </div>
        {noTypes && <p className="text-[11px] text-amber-400">Select at least one type.</p>}
      </div>

      {selectedIds.size === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-slate-400 font-medium text-sm">No students selected</p>
          <p className="text-[11px] text-slate-600 mt-1">{isExportOnly ? 'Select students from the list above' : 'Select students from the left panel'}</p>
        </div>
      ) : (
        <>
          {/* Coverage check */}
          {exportCovLoading && (
            <div className="flex items-center gap-2.5">
              <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin flex-shrink-0" />
              <p className="text-xs text-slate-400">Checking saved reports for {selectedStudents.length} student{selectedStudents.length !== 1 ? 's' : ''}…</p>
            </div>
          )}

          {!exportCoverage && !exportCovLoading && (
            <button onClick={loadExportCoverage}
              className="w-full py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-primary-500/40 hover:text-white transition-all"
            >
              Check saved reports
            </button>
          )}

          {exportCoverage && exportCovStats && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Ready',   value: exportCovStats.ready,   color: 'text-emerald-400', bg: 'bg-emerald-950/40 border-emerald-900/40' },
                  { label: 'Partial', value: exportCovStats.partial,  color: 'text-amber-400',   bg: 'bg-amber-950/30 border-amber-900/30' },
                  { label: 'Missing', value: exportCovStats.missing,  color: 'text-slate-500',   bg: 'bg-slate-800/40 border-slate-800' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`rounded-xl border px-3 py-2.5 text-center ${bg}`}>
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Per-student coverage */}
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {selectedStudents.map(s => {
                  const c = exportCoverage.get(s.id) ?? {};
                  const ready = (!wantPolish || !!c.polish) && (!wantTerm || !!c.term);
                  return (
                    <div key={s.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${ready ? 'bg-slate-800/30 border-slate-800' : 'bg-amber-950/20 border-amber-900/30'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{s.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{s.instrument} · {s.schoolName}</p>
                      </div>
                      {wantPolish && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.polish ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-800 text-slate-600'}`}>{c.polish ? 'Progress ✓' : 'Progress —'}</span>}
                      {wantTerm   && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.term   ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-800 text-slate-600'}`}>{c.term   ? 'Term ✓'    : 'Term —'}</span>}
                      {wantCert   && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.cert   ? 'bg-amber-900/50 text-amber-300'   : 'bg-slate-800 text-slate-600'}`}>{c.cert   ? 'Cert ✓'    : 'Cert —'}</span>}
                    </div>
                  );
                })}
              </div>

              <button onClick={loadExportCoverage} className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors">↺ Refresh coverage</button>

              {/* Format */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Download format</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { m: 'zip-per-student' as const, label: 'One PDF / student', sub: "Each student's reports + certificate in a single file, zipped" },
                    { m: 'zip' as const,    label: 'Zip archive', sub: 'Separate file per student per type' },
                    { m: 'merged' as const, label: 'Single PDF',  sub: 'All reports in one long file' },
                  ]).map(({ m, label, sub }) => (
                    <button key={m} onClick={() => setExportMode(m)}
                      className={`text-left px-3.5 py-3 rounded-xl border transition-all ${exportMode === m ? 'bg-slate-700/80 border-slate-500 ring-1 ring-slate-500/30' : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'}`}
                    >
                      <p className={`text-sm font-medium ${exportMode === m ? 'text-white' : 'text-slate-400'}`}>{label}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* File type — only meaningful for the Zip archive (Single PDF is inherently PDF) */}
              {exportMode === 'zip' && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">File type</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { f: 'pdf'  as const, label: 'PDF',  sub: '.pdf' },
                      { f: 'word' as const, label: 'Word', sub: '.docx' },
                      { f: 'both' as const, label: 'Both', sub: 'PDF + Word' },
                    ]).map(({ f, label, sub }) => (
                      <button key={f} onClick={() => setExportFileType(f)}
                        className={`text-center px-2 py-2.5 rounded-xl border transition-all ${exportFileType === f ? 'bg-slate-700/80 border-slate-500 ring-1 ring-slate-500/30' : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'}`}
                      >
                        <p className={`text-sm font-medium ${exportFileType === f ? 'text-white' : 'text-slate-400'}`}>{label}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Export progress — visible immediately while running */}
              {exportRunning && (
                <div className="space-y-1.5">
                  {!exportProgress || exportProgress.total === 0 ? (
                    <>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full w-1/3 bg-primary-500 rounded-full animate-pulse" />
                      </div>
                      <p className="text-[11px] text-slate-500 text-center">Preparing export…</p>
                    </>
                  ) : (
                    <>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full transition-all duration-300"
                          style={{ width: `${(exportProgress.done / exportProgress.total) * 100}%` }} />
                      </div>
                      <p className="text-[11px] text-slate-500 text-center">
                        {exportProgress.label
                          ? `Processing ${exportProgress.label}… (${Math.min(exportProgress.done + 1, exportProgress.total)} of ${exportProgress.total})`
                          : `Rendering ${exportProgress.done} of ${exportProgress.total}…`}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Export button — includes Ready + Partial (partial students export what they have) */}
              <button onClick={runExport}
                disabled={exportRunning || noTypes || (exportCovStats.ready + exportCovStats.partial) === 0}
                className="w-full py-2.5 rounded-xl bg-primary-500 text-white font-semibold text-sm hover:bg-primary-400 transition-all shadow-lg shadow-primary-500/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {exportRunning
                  ? 'Exporting…'
                  : `Download ${exportMode === 'merged' ? 'PDF' : 'Zip'} · ${exportCovStats.ready + exportCovStats.partial} student${(exportCovStats.ready + exportCovStats.partial) !== 1 ? 's' : ''}`}
              </button>
              {exportCovStats.partial > 0 && (
                <p className="text-[11px] text-amber-400/80 text-center -mt-2">
                  {exportCovStats.partial} student{exportCovStats.partial !== 1 ? 's are' : ' is'} partial — only available report types will be exported.
                </p>
              )}
              {exportCovStats.missing > 0 && (
                <p className="text-[11px] text-slate-500 text-center -mt-2">
                  {exportCovStats.missing} student{exportCovStats.missing !== 1 ? 's have' : ' has'} no saved reports — generate them first.
                </p>
              )}

            </>
          )}
        </>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page header + tabs ── */}
      <div className="px-6 pt-5 flex-shrink-0 border-b border-slate-800">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Reports</h1>
            <p className="text-sm text-slate-500 mt-0.5">{students.length} student{students.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex gap-0 -mb-px">
          <button onClick={() => setTab('students')} className={tabBtn(tab === 'students')}>
            Students
          </button>
          {!isExportOnly && (
            <button onClick={() => setTab('generate')} className={tabBtn(tab === 'generate')}>
              Generate
            </button>
          )}
          <button onClick={() => setTab('export')} className={tabBtn(tab === 'export')}>
            Export
          </button>
        </div>
      </div>

      {/* ── Two-panel body ── */}
      {/* export-only on mobile: stacked column so student list + export controls are both visible */}
      <div className={`flex flex-1 overflow-hidden min-h-0 ${isExportOnly ? 'flex-col md:flex-row' : ''}`}>

        {/* Left: student list */}
        <div className={`
          md:w-72 md:flex-shrink-0 flex flex-col overflow-hidden
          ${isExportOnly
            ? 'flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-800'
            : `w-full ${mobileView === 'viewer' ? 'hidden md:flex' : 'flex'}`
          }
        `}
          style={isExportOnly ? { maxHeight: 'clamp(180px, 40vh, 320px)' } : undefined}
          ref={el => { if (el && isExportOnly && window.innerWidth >= 768) el.style.maxHeight = 'none'; }}
        >
          {LeftPanel}
        </div>

        {/* Right: tab content — hidden on mobile when listing (full-mode only) */}
        <div className={`
          flex-1 flex flex-col overflow-hidden min-w-0
          ${!isExportOnly && mobileView === 'list' ? 'hidden md:flex' : 'flex'}
        `}>
          {tab === 'students' && (
            viewingStudent ? (
              <ReportViewer
                student={viewingStudent}
                cov={coverage.get(viewingStudent.id)}
                index={viewingIndex}
                total={filteredStudents.length}
                onNavigate={dir => {
                  navigateViewer(dir);
                  setMobileView('viewer');
                }}
                onBack={() => setMobileView('list')}
                isMobile={mobileView === 'viewer'}
                onSaveReport={handleViewerSave}
                onRegenerateReport={handleViewerRegenerate}
                onDeleteReport={handleViewerDelete}
                onUpdateTermReport={handleViewerUpdateTerm}
                onSaveCert={handleViewerSaveCert}
                stats={viewingStudentStats}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-slate-400 font-medium">Select a student</p>
                <p className="text-[11px] text-slate-600 mt-1">Click any student from the list to view their saved reports</p>
              </div>
            )
          )}
          {tab === 'generate' && RightGenerate}
          {tab === 'export'   && RightExport}
        </div>
      </div>
    </div>
  );
};
