/**
 * AIReportPreviewModal — Phase AI.2B
 *
 * View/edit/save modal for AI-generated teacher reports.
 *
 * States:
 *   view  — read-only display; Edit button enters edit mode
 *   edit  — textarea active; Save / Cancel buttons
 *
 * Unsaved changes banner: shown when a saved version exists and current
 * text differs from it.
 *
 * Regenerate: confirmation dialog when a saved version exists.
 * Close: confirmation dialog when in edit mode with unsaved changes.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Student, Lesson } from '../types';
import { AIReport, SavedAIReport, TermReportScores, REPORT_TYPE_LABELS } from '../services/aiSummary/reportTypes';
import { generateStudentReportPDF, generatePolishReportPDF, generateTermReportPDF } from '../services/pdfExport';
import { generateTermReportDocx } from '../services/wordExport';
import { batchPolishForPdf } from '../services/aiSummary/rewriteText';
import { parseTermReport, resolveTermReportSections } from '../services/aiSummary/resolveAiContent';
// @ts-ignore — CDN import for Firestore (read signature base64 for PDF export)
import { getFirestore, doc as firestoreDoc, getDoc as firestoreGetDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stats card (term report only)
// ─────────────────────────────────────────────────────────────────────────────

interface ReportStats {
  totalLessons: number;
  attended: number;
  absent: number;
  attendanceRate: number;
  totalHours: number;
}

// ── Term report overview card (bars + editable scores) ───────────────────────

interface TermReportOverviewCardProps {
  stats?: ReportStats;
  scores: TermReportScores;
  aiSuggested: boolean;
  approvedByName: string | null;
  readOnly: boolean;
  teacherName?: string;
  saving: boolean;
  periodLabel?: string;
  onScoreChange: (key: keyof TermReportScores, val: number) => void;
  onApprove: () => void;
  onRemoveApproval: () => void;
}

function ScoreRow({
  label,
  value,
  max,
  barColor,
  suffix,
  editable,
  scoreKey,
  onScoreChange,
}: {
  label: string;
  value: number;
  max: number;
  barColor: string;
  suffix?: string;
  editable?: boolean;
  scoreKey?: keyof TermReportScores;
  onScoreChange?: (key: keyof TermReportScores, val: number) => void;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-28 flex-shrink-0 leading-tight">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {editable && scoreKey && onScoreChange ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            type="number"
            min={0}
            max={max}
            value={value}
            onChange={e => onScoreChange(scoreKey, Math.min(max, Math.max(0, parseInt(e.target.value) || 0)))}
            className="w-10 text-center text-xs font-bold text-white bg-slate-700/60 border border-slate-600/80 rounded-lg py-1 focus:border-primary-500 focus:outline-none"
          />
          <span className="text-[11px] text-slate-500">/{max}</span>
        </div>
      ) : (
        <span className="text-xs font-semibold text-white w-14 text-right flex-shrink-0">
          {suffix ?? `${value}/${max}`}
        </span>
      )}
    </div>
  );
}

export function TermReportOverviewCard({
  stats, scores, aiSuggested, approvedByName, readOnly,
  teacherName, saving, periodLabel, onScoreChange, onApprove, onRemoveApproval,
}: TermReportOverviewCardProps) {
  const total = scores.technical + scores.practical + scores.practice;
  const displayScores = readOnly && !scores ? null : scores;
  if (!displayScores && !stats) return null;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {periodLabel ? `${periodLabel} Overview` : 'Overview'}
        </p>
        {!readOnly && aiSuggested && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-400 text-[10px] font-semibold">
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.346.346a1 1 0 01-.707.293H9.372a1 1 0 01-.707-.293l-.346-.346z" />
            </svg>
            AI suggested
          </span>
        )}
        <span className="ml-auto text-xs font-bold text-white">
          {total}<span className="text-slate-500 font-normal text-[11px]">/40</span>
        </span>
      </div>
      <div className="space-y-2.5">
        {stats && (
          <ScoreRow
            label="Lessons Attended"
            value={stats.attendanceRate}
            max={100}
            barColor="bg-emerald-500"
            suffix={`${stats.attendanceRate}%`}
          />
        )}
        <ScoreRow
          label="Technical Work"
          value={scores.technical}
          max={10}
          barColor="bg-primary-500"
          editable={!readOnly}
          scoreKey="technical"
          onScoreChange={onScoreChange}
        />
        <ScoreRow
          label="Practical Work"
          value={scores.practical}
          max={20}
          barColor="bg-violet-500"
          editable={!readOnly}
          scoreKey="practical"
          onScoreChange={onScoreChange}
        />
        <ScoreRow
          label="Practice"
          value={scores.practice}
          max={10}
          barColor="bg-amber-500"
          editable={!readOnly}
          scoreKey="practice"
          onScoreChange={onScoreChange}
        />
      </div>

      {/* Approval */}
      {!readOnly && (
        approvedByName ? (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-emerald-300 flex-1">Approved by <span className="font-semibold">{approvedByName}</span></p>
            <button onClick={onRemoveApproval} className="text-emerald-600 hover:text-emerald-400 text-xs" title="Remove approval">✕</button>
          </div>
        ) : (
          <button
            onClick={onApprove}
            disabled={saving || !teacherName}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700/40 hover:bg-emerald-500/15 border border-slate-600/50 hover:border-emerald-500/30 text-slate-400 hover:text-emerald-300 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Approve & sign as {teacherName ?? 'teacher'}
          </button>
        )
      )}

      {readOnly && (
        approvedByName ? (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-emerald-300">Signed by <span className="font-semibold">{approvedByName}</span></p>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-600/50">
            <p className="text-xs text-slate-400 font-medium">Draft</p>
          </div>
        )
      )}
    </div>
  );
}

// ── Term report section comments ──────────────────────────────────────────────

export function TermReportSectionsView({ text }: { text: string }) {
  const { sections } = parseTermReport(text);
  const items: Array<{ label: string; body: string }> = [
    { label: 'Technical Work',  body: sections.technicalWork },
    { label: 'Practical Work',  body: sections.practicalWork },
    { label: 'Practice',        body: sections.practiceAtHome },
    { label: 'General Comment', body: sections.generalComment },
  ];
  return (
    <div className="space-y-4">
      {items.map(({ label, body }) => {
        if (body === '—') return null;
        return (
          <div key={label}>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Strips the AI SCORES block so only the four comment sections remain. */
function stripTermReportScores(text: string): string {
  // The SCORES block ends at the first blank line — use \n\n as the boundary
  // so we don't accidentally stop at section headers inside the scores block.
  const stripped = text.replace(/^SCORES:[\s\S]*?\n\n/i, '').trim();
  return stripped || text;
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

// ─────────────────────────────────────────────────────────────────────────────
// Copy button
// ─────────────────────────────────────────────────────────────────────────────

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  }, [getText]);

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
    >
      {copied ? (
        <><svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Copied</>
      ) : (
        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy</>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirm dialog (inline overlay within modal)
// ─────────────────────────────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/80 rounded-2xl">
      <div className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-4 shadow-xl max-w-xs w-full mx-4">
        <p className="text-sm text-slate-200 mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-500 rounded-lg transition-colors">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface AIReportPreviewModalProps {
  student: Student;
  allLessons: Lesson[];
  schoolName: string;
  teacherName?: string;
  teacherReportDisplayName?: string;
  teacherSignatureUrl?: string;
  report: AIReport;
  savedReport: SavedAIReport | null;
  currentUserId: string;
  currentUserName: string;
  periodLabel?: string;
  stats?: ReportStats;
  /**
   * school_admin: view-only — hides Edit, Save, Regenerate, Approve.
   * Copy and Export PDF remain available.
   */
  readOnly?: boolean;
  /** Required unless readOnly=true */
  onSave?: (text: string, lastSourceAction: 'generated' | 'edited', scores?: TermReportScores, approvedByName?: string) => Promise<void>;
  /** Required unless readOnly=true */
  onRegenerate?: () => void;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

export const AIReportPreviewModal: React.FC<AIReportPreviewModalProps> = ({
  student,
  allLessons,
  schoolName,
  teacherName,
  teacherReportDisplayName,
  teacherSignatureUrl,
  report,
  savedReport,
  currentUserId: _currentUserId,
  currentUserName: _currentUserName,
  periodLabel,
  stats,
  readOnly = false,
  onSave,
  onRegenerate,
  onClose,
}) => {
  const isTermReport = report.reportType === 'term_report';
  const reportTitle = isTermReport
    ? `End of ${periodLabel ?? 'Enrollment'} Report`
    : REPORT_TYPE_LABELS[report.reportType];

  // editedText: initialised from savedReport if one exists, else from fresh AI draft.
  // For term reports, strip the SCORES block so only the four comment sections appear.
  const [editedText, setEditedText] = useState(() => {
    const raw = savedReport?.text ?? report.text;
    return (report.reportType === 'term_report') ? stripTermReportScores(raw) : raw;
  });
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [hasBeenManuallyEdited, setHasBeenManuallyEdited] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // ── Term report scores ────────────────────────────────────────────────────
  // Initialise from saved scores if they exist, otherwise parse from AI text
  const [scores, setScores] = useState<TermReportScores>(() => {
    if (savedReport?.scores) return savedReport.scores;
    if (isTermReport) {
      const parsed = parseTermReport(savedReport?.text ?? report.text, stats?.attendanceRate);
      return parsed.suggestedScores ?? { technical: 7, practical: 14, practice: 7 };
    }
    return { technical: 7, practical: 14, practice: 7 };
  });
  // Whether the current scores came from the AI (not yet manually changed)
  const [scoresAreAiSuggested, setScoresAreAiSuggested] = useState<boolean>(() => {
    if (savedReport?.scores) return false; // already manually set/saved
    return isTermReport;
  });

  // ── Approval ──────────────────────────────────────────────────────────────
  const [approvedByName, setApprovedByName] = useState<string | null>(
    savedReport?.approvedByName ?? null,
  );

  // Text at the point user entered edit mode — used to detect actual changes for Cancel
  const textBeforeEdit = useRef(editedText);

  // When a new report comes in after Regenerate, reset to the new AI text + re-parse scores
  const prevReportText = useRef(report.text);
  useEffect(() => {
    if (report.text !== prevReportText.current) {
      prevReportText.current = report.text;
      setEditedText(isTermReport ? stripTermReportScores(report.text) : report.text);
      setHasBeenManuallyEdited(false);
      setMode('view');
      if (isTermReport) {
        const parsed = parseTermReport(report.text, stats?.attendanceRate);
        if (parsed.suggestedScores) {
          setScores(parsed.suggestedScores);
          setScoresAreAiSuggested(true);
        }
      }
      setApprovedByName(null);
    }
  }, [report.text, isTermReport]);

  // "Unsaved changes" = a saved version exists AND current text differs from it.
  // Normalise saved text for term reports (strip SCORES block if present in older records).
  const savedTextNormalized = (savedReport && isTermReport)
    ? stripTermReportScores(savedReport.text)
    : savedReport?.text;
  const isUnsaved = savedReport != null && editedText !== savedTextNormalized;

  const handleEdit = useCallback(() => {
    textBeforeEdit.current = editedText;
    setMode('edit');
  }, [editedText]);

  const handleCancel = useCallback(() => {
    setEditedText(textBeforeEdit.current);
    setHasBeenManuallyEdited(false);
    setMode('view');
  }, []);

  const handleSave = useCallback(async (nameOverride?: string) => {
    if (!onSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const action: 'generated' | 'edited' = hasBeenManuallyEdited ? 'edited' : 'generated';
      // Strip the AI marker when teacher has edited the text — it's now their own words
      const textToSave = (action === 'edited' && editedText.startsWith('** '))
        ? editedText.slice(3)
        : editedText;
      const termScores = isTermReport ? scores : undefined;
      const approvedName = nameOverride ?? approvedByName ?? undefined;
      await onSave(textToSave, action, termScores, approvedName);
      if (action === 'edited') setEditedText(textToSave);
      setHasBeenManuallyEdited(false);
      setMode('view');
    } catch (err: any) {
      console.error('Save failed:', err);
      setSaveError(err?.message ?? 'Save failed — please try again.');
    } finally {
      setSaving(false);
    }
  }, [editedText, hasBeenManuallyEdited, onSave, isTermReport, scores, approvedByName]);

  const handleApprove = useCallback(async () => {
    if (!onSave || !teacherName) return;
    const name = teacherName;
    setApprovedByName(name);
    // Save immediately with approval stamp
    await handleSave(name);
  }, [onSave, teacherName, handleSave]);

  const handleRegenerateRequest = useCallback(() => {
    if (!onRegenerate) return;
    if (savedReport) {
      setShowRegenerateConfirm(true);
    } else {
      onRegenerate();
    }
  }, [savedReport, onRegenerate]);

  const handleRegenerateConfirm = useCallback(() => {
    setShowRegenerateConfirm(false);
    onRegenerate?.();
  }, [onRegenerate]);

  const handleCloseRequest = useCallback(() => {
    if (mode === 'edit' && editedText !== textBeforeEdit.current) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }, [mode, editedText, onClose]);

  const handleExportPdf = useCallback(async () => {
    setExportingPdf(true);
    try {
      const sorted   = allLessons.slice().sort((a, b) => a.date.localeCompare(b.date));
      // Strip internal ** AI marker — not for printed documents
      const pdfText  = editedText.startsWith('** ') ? editedText.slice(3) : editedText;

      if (report.reportType === 'polish_report') {
        // Batch-polish all lesson notes in one API call, then generate Style A report
        const entries = sorted.map(l => ({
          id:   l.id,
          text: [l.learning, l.overallGrade, l.repertoire, l.practiceAssignment, l.notes]
            .filter(Boolean).join(' · '),
        }));
        const polishedNotes = await batchPolishForPdf(entries);
        await generatePolishReportPDF(
          sorted, student, schoolName, pdfText, polishedNotes,
          teacherName ?? '', periodLabel,
        );
      } else if (report.reportType === 'term_report') {
        // Parse the four academic sections from the AI text, then generate Style B report
        const sections = resolveTermReportSections(pdfText);
        // Load signature base64 from Firestore (stored at upload time — avoids CORS)
        let sigDataUrl: string | undefined;
        if (teacherSignatureUrl && approvedByName) {
          try {
            const db = getFirestore(getApp());
            const snap = await firestoreGetDoc(firestoreDoc(db, 'teacherSignatures', student.teacherId));
            if (snap.exists()) sigDataUrl = snap.data()?.base64;
          } catch (e) {
            console.warn('Signature base64 load failed, using text fallback:', e);
          }
        }
        await generateTermReportPDF(
          sorted, student, schoolName, sections,
          teacherName ?? '', periodLabel,
          undefined,
          isTermReport ? scores : undefined,
          approvedByName ?? undefined,
          teacherReportDisplayName,
          sigDataUrl,
        );
      } else {
        await generateStudentReportPDF(sorted, student, schoolName, pdfText, periodLabel);
      }
    } finally {
      setExportingPdf(false);
    }
  }, [allLessons, student, schoolName, teacherName, teacherReportDisplayName, teacherSignatureUrl, editedText, periodLabel, report.reportType, isTermReport, scores, approvedByName]);

  const handleExportDocx = useCallback(async () => {
    if (report.reportType !== 'term_report') return;
    setExportingDocx(true);
    try {
      const sorted   = allLessons.slice().sort((a, b) => a.date.localeCompare(b.date));
      const docxText = editedText.startsWith('** ') ? editedText.slice(3) : editedText;
      const sections = resolveTermReportSections(docxText);
      // Load signature base64 (same path as PDF export)
      let sigDataUrl: string | undefined;
      if (teacherSignatureUrl && approvedByName) {
        try {
          const db = getFirestore(getApp());
          const snap = await firestoreGetDoc(firestoreDoc(db, 'teacherSignatures', student.teacherId));
          if (snap.exists()) sigDataUrl = snap.data()?.base64;
        } catch (e) {
          console.warn('Signature base64 load failed for Word export:', e);
        }
      }
      await generateTermReportDocx(
        sorted, student, schoolName, sections,
        teacherName ?? '', periodLabel,
        isTermReport ? scores : undefined,
        approvedByName ?? undefined,
        teacherReportDisplayName,
        sigDataUrl,
      );
    } finally {
      setExportingDocx(false);
    }
  }, [allLessons, student, schoolName, teacherName, teacherReportDisplayName, teacherSignatureUrl, editedText, periodLabel, report.reportType, isTermReport, scores, approvedByName]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) handleCloseRequest(); }}
    >
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── Confirm overlays ── */}
        {showRegenerateConfirm && (
          <ConfirmDialog
            message="Generate a new AI draft? Your current text will be replaced. Any unsaved changes will be lost."
            confirmLabel="Regenerate"
            onConfirm={handleRegenerateConfirm}
            onCancel={() => setShowRegenerateConfirm(false)}
          />
        )}
        {showCloseConfirm && (
          <ConfirmDialog
            message="You have unsaved edits. Close without saving?"
            confirmLabel="Discard & Close"
            onConfirm={onClose}
            onCancel={() => setShowCloseConfirm(false)}
          />
        )}

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            {!readOnly && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-semibold tracking-wide">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.346.346a1 1 0 01-.707.293H9.372a1 1 0 01-.707-.293l-.346-.346z" />
                </svg>
                AI Draft
              </span>
            )}
            <div>
              <p className="text-sm font-semibold text-white leading-none">
                {reportTitle}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {mode === 'edit' ? 'Editing — save when ready' : 'Review before sharing'}
              </p>
            </div>
          </div>
          <button onClick={handleCloseRequest} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Saved meta strip ── */}
        {savedReport && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-3 flex-shrink-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
            <span className="text-xs text-slate-500">
              {relativeTime(savedReport.updatedAt)}
            </span>
            {savedReport.generatedByName && (
              <span className="text-xs text-slate-500">
                Created by <span className="text-slate-400">{savedReport.generatedByName}</span>
              </span>
            )}
            {savedReport.lastSourceAction === 'edited' && savedReport.editedByName && (
              <span className="text-xs text-slate-500">
                · Last edited by <span className="text-slate-400">{savedReport.editedByName}</span>
              </span>
            )}
          </div>
        )}

        {/* ── Fallback banner ── */}
        {report.isFallback && (
          <div className="flex items-center gap-2 mx-5 mt-3 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex-shrink-0">
            <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-xs text-amber-300">
              <span className="font-semibold">AI unavailable</span> — showing an auto-generated summary. Try regenerating when the service is available.
            </p>
          </div>
        )}

        {/* ── Unsaved changes banner ── */}
        {isUnsaved && (
          <div className="flex items-center gap-2 mx-5 mt-3 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <p className="text-xs text-blue-300">Unsaved changes — save to preserve your edits.</p>
          </div>
        )}

        {/* ── Student info strip ── */}
        <div className="mx-5 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40 flex-shrink-0">
          <span className="text-sm font-semibold text-white leading-none">{student.name}</span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {(student.instrument) && (
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
            {teacherName && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <svg className="w-3 h-3 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {teacherName}
              </span>
            )}
            {schoolName && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <svg className="w-3 h-3 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {schoolName}
              </span>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── Term report: overview bars + scores + approval ── */}
          {isTermReport && (
            <TermReportOverviewCard
              stats={stats}
              scores={readOnly ? (savedReport?.scores ?? scores) : scores}
              aiSuggested={scoresAreAiSuggested}
              approvedByName={readOnly ? (savedReport?.approvedByName ?? null) : approvedByName}
              readOnly={readOnly}
              teacherName={teacherName}
              saving={saving}
              periodLabel={periodLabel}
              onScoreChange={(key, val) => {
                setScores(prev => ({ ...prev, [key]: val }));
                setScoresAreAiSuggested(false);
              }}
              onApprove={handleApprove}
              onRemoveApproval={() => setApprovedByName(null)}
            />
          )}

          {/* ── Text body ── */}
          {mode === 'edit' ? (
            <textarea
              value={editedText}
              onChange={e => { setEditedText(e.target.value); setHasBeenManuallyEdited(true); }}
              className="w-full min-h-[220px] text-sm text-slate-200 leading-relaxed bg-slate-800/60 rounded-xl px-4 py-3 resize-y border border-slate-600 focus:border-primary-500 focus:outline-none transition-colors font-mono"
              spellCheck
              autoFocus
            />
          ) : isTermReport ? (
            <TermReportSectionsView text={editedText} />
          ) : (
            <div className="text-sm text-slate-300 leading-relaxed bg-slate-800/40 rounded-xl px-4 py-3 whitespace-pre-wrap">
              {editedText}
            </div>
          )}
        </div>

        {/* ── Save error banner ── */}
        {saveError && (
          <div className="flex items-center gap-2 mx-5 mb-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 flex-shrink-0">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-xs text-red-300 flex-1">{saveError}</p>
            <button onClick={() => setSaveError(null)} className="text-red-500 hover:text-red-300 text-xs">✕</button>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-800 flex-shrink-0 gap-3 flex-wrap">
          <p className="text-xs text-slate-600 italic">
            {readOnly
              ? 'View only · for internal review'
              : savedReport ? 'Saved · for internal review only' : 'Not saved · for internal review only'}
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Copy + Export PDF are always visible */}
            <CopyButton getText={() => editedText} />

            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {exportingPdf ? (
                <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Exporting…</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Export PDF</>
              )}
            </button>

            {/* Export Word — term reports only */}
            {isTermReport && (
              <button
                onClick={handleExportDocx}
                disabled={exportingDocx}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {exportingDocx ? (
                  <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Exporting…</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Export Word</>
                )}
              </button>
            )}

            {/* Edit / Save / Regenerate — hidden for school_admin (readOnly) */}
            {!readOnly && (
              mode === 'view' ? (
                <>
                  {/* Save — grey default, blue "✓ Saved" once this draft is saved */}
                  {(() => {
                    const isSaved = savedReport !== null && editedText === savedReport.text;
                    return (
                      <button
                        onClick={() => handleSave()}
                        disabled={saving}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait ${
                          isSaved
                            ? 'bg-primary-600 hover:bg-primary-500 text-white'
                            : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white'
                        }`}
                      >
                        {saving ? (
                          <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Saving…</>
                        ) : isSaved ? (
                          <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Saved</>
                        ) : (
                          <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Save</>
                        )}
                      </button>
                    );
                  })()}

                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>

                  <button
                    onClick={handleRegenerateRequest}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regenerate
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
                  >
                    {saving ? (
                      <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Saving…</>
                    ) : (
                      <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Save</>
                    )}
                  </button>
                </>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
