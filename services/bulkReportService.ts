/**
 * bulkReportService — Bulk AI report generation and export
 *
 * Phase 1 — bulkGenerateAndSave:
 *   Loops through students, generates both report types via Claude,
 *   saves each to students/{id}/aiReports. Calls onProgress after each step.
 *
 * Phase 2 — bulkExportReports:
 *   Reads pre-saved reports from Firestore, renders PDFs, then packages
 *   them as a zip file (one PDF per student per type) or a single merged PDF.
 */

import { Student, Lesson, Enrollment, SchoolEnrollmentPeriod } from '../types';
import { ReportType, SavedAIReport, PROMPT_VERSION, PROVIDER_VERSION } from './aiSummary/reportTypes';
import { generateReport, AnchorReport } from './aiSummary/generateReport';
import { saveReport, fetchSavedReports } from './aiSummary/savedReports';
import { batchPolishForPdf } from './aiSummary/rewriteText';
import { resolveTermReportSections } from './aiSummary/resolveAiContent';
import { generatePolishReportPDF, generateTermReportPDF } from './pdfExport';
import { generatePolishReportDocx, generateTermReportDocx } from './wordExport';

export type ExportFileType = 'pdf' | 'word' | 'both';
// @ts-ignore — CDN import for Firestore
import { getFirestore, doc as firestoreDoc, getDoc as firestoreGetDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BulkJobEntry {
  studentId: string;
  studentName: string;
  status: 'pending' | 'generating' | 'done' | 'error' | 'skipped';
  polishDone: boolean;
  termDone: boolean;
  periodName?: string;
  skipReason?: string;
  error?: string;
}

export type { ReportType };

export interface BulkStudentEntry {
  student: Student;
  lessons: Lesson[];             // already filtered to period by caller
  enrollments: Enrollment[];
  schoolEnrollmentPeriods: SchoolEnrollmentPeriod[];
  schoolName: string;
  teacherName: string;
  schoolId: string;
  teacherIds: string[];
  generatedBy: string;
  generatedByName: string;
  periodName?: string;
  periodStart?: string;
  periodEnd?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Generate & Save
// ─────────────────────────────────────────────────────────────────────────────

export async function bulkGenerateAndSave(
  entries: BulkStudentEntry[],
  reportTypes: ReportType[],
  onProgress: (jobs: BulkJobEntry[]) => void,
): Promise<BulkJobEntry[]> {
  const wantPolish = reportTypes.includes('polish_report');
  const wantTerm   = reportTypes.includes('term_report');

  const jobs: BulkJobEntry[] = entries.map(e => ({
    studentId: e.student.id,
    studentName: e.student.name,
    status: 'pending',
    polishDone: !wantPolish,
    termDone:   !wantTerm,
    periodName: e.periodName,
  }));

  const now = () => new Date().toISOString();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    jobs[i] = { ...jobs[i], status: 'generating' };
    onProgress([...jobs]);

    try {
      const opts = {
        student: entry.student,
        allLessons: entry.lessons,
        allEnrollments: entry.enrollments,
        schoolEnrollmentPeriods: entry.schoolEnrollmentPeriods,
        schoolName: entry.schoolName,
        teacherName: entry.teacherName,
        audience: 'teacher' as const,
        mode: 'polish' as const,
      };

      const baseDoc: Omit<SavedAIReport, 'id' | 'reportType' | 'text' | 'source' | 'generatedAt' | 'updatedAt' | 'lastSourceAction'> = {
        studentId: entry.student.id,
        schoolId: entry.schoolId,
        teacherId: entry.generatedBy,
        teacherIds: entry.teacherIds,
        status: 'draft',
        generatedBy: entry.generatedBy,
        generatedByName: entry.generatedByName,
        editedBy: null,
        editedByName: null,
        promptVersion: PROMPT_VERSION,
        providerVersion: PROVIDER_VERSION,
        ...(entry.periodName  ? { periodName:  entry.periodName  } : {}),
        ...(entry.periodStart ? { periodStart: entry.periodStart } : {}),
        ...(entry.periodEnd   ? { periodEnd:   entry.periodEnd   } : {}),
      };

      // Alignment: each report uses the OTHER type's existing report as an
      // additional consistency input. When both are generated fresh, the Term
      // Report is produced first and becomes the anchor for the Progress Review.
      // When only one type is wanted, the other is loaded from Firestore.
      let existingReports: SavedAIReport[] | null = null;
      const loadExisting = async (): Promise<SavedAIReport[]> => {
        if (existingReports === null) existingReports = await fetchSavedReports(entry.student.id);
        return existingReports;
      };
      let freshTermText: string | undefined;

      if (wantTerm) {
        let anchor: AnchorReport | undefined;
        if (!wantPolish) {
          const ex = (await loadExisting()).find(r => r.reportType === 'polish_report');
          if (ex?.text) anchor = { reportType: 'polish_report', text: ex.text };
        }
        const result = await generateReport(opts, 'term_report', anchor);
        freshTermText = result.text;
        await saveReport(entry.student.id, {
          ...baseDoc,
          reportType: 'term_report',
          text: result.text,
          source: result.source,
          generatedAt: now(),
          updatedAt: now(),
          lastSourceAction: 'generated',
        });
        jobs[i] = { ...jobs[i], termDone: true };
        onProgress([...jobs]);
      }

      if (wantPolish) {
        let anchor: AnchorReport | undefined;
        if (freshTermText) {
          anchor = { reportType: 'term_report', text: freshTermText };
        } else {
          const ex = (await loadExisting()).find(r => r.reportType === 'term_report');
          if (ex?.text) anchor = { reportType: 'term_report', text: ex.text };
        }
        const result = await generateReport(opts, 'polish_report', anchor);
        await saveReport(entry.student.id, {
          ...baseDoc,
          reportType: 'polish_report',
          text: result.text,
          source: result.source,
          generatedAt: now(),
          updatedAt: now(),
          lastSourceAction: 'generated',
        });
        jobs[i] = { ...jobs[i], polishDone: true };
        onProgress([...jobs]);
      }

      jobs[i] = { ...jobs[i], status: 'done' };
      onProgress([...jobs]);
    } catch (err: any) {
      jobs[i] = { ...jobs[i], status: 'error', error: err?.message ?? 'Unknown error' };
      onProgress([...jobs]);
    }
  }

  return jobs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Export
// ─────────────────────────────────────────────────────────────────────────────

export interface BulkExportEntry {
  student: Student;
  lessons: Lesson[];
  schoolName: string;
  teacherName: string;
  teacherReportDisplayName?: string;
  teacherSignatureUrl?: string;
  polishReport?: SavedAIReport;
  termReport?: SavedAIReport;
}

export async function bulkExportReports(
  entries: BulkExportEntry[],
  exportMode: 'zip' | 'merged',
  onProgress?: (done: number, total: number) => void,
  fileType: ExportFileType = 'pdf',
): Promise<void> {
  const dateTag = new Date().toISOString().slice(0, 10);

  if (exportMode === 'zip') {
    await exportAsZip(entries, dateTag, fileType, onProgress);
  } else {
    // Merged "Single PDF" mode is inherently PDF — fileType is ignored here.
    await exportAsMergedPDF(entries, dateTag, onProgress);
  }
}

async function exportAsZip(
  entries: BulkExportEntry[],
  dateTag: string,
  fileType: ExportFileType,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const JSZip = (window as any).JSZip;
  if (!JSZip) { alert('JSZip library not loaded — please refresh.'); return; }

  const wantPdf  = fileType === 'pdf'  || fileType === 'both';
  const wantWord = fileType === 'word' || fileType === 'both';
  const filesPerReport = (wantPdf ? 1 : 0) + (wantWord ? 1 : 0);

  const zip = new JSZip();
  let done = 0;
  const total = entries.reduce(
    (sum, e) => sum + ((e.polishReport ? 1 : 0) + (e.termReport ? 1 : 0)) * filesPerReport,
    0,
  );

  for (const entry of entries) {
    const safeName = entry.student.name.replace(/[^a-z0-9]/gi, '_');
    const sortedLessons = entry.lessons.slice().sort((a, b) => a.date.localeCompare(b.date));

    if (entry.polishReport) {
      const polishedNotes = await buildPolishedNotes(sortedLessons);
      if (wantPdf) {
        const blob = await generatePolishReportPDF(
          sortedLessons,
          entry.student,
          entry.schoolName,
          entry.polishReport.text,
          polishedNotes,
          entry.teacherName,
          entry.polishReport.periodName,
          'blob',
        ) as Uint8Array | undefined;
        if (blob) zip.file(`${safeName}_ProgressReview_${dateTag}.pdf`, blob);
        done++;
        onProgress?.(done, total);
      }
      if (wantWord) {
        const docxBlob = await generatePolishReportDocx(
          sortedLessons,
          entry.student,
          entry.schoolName,
          entry.polishReport.text,
          polishedNotes,
          entry.teacherName,
          entry.polishReport.periodName,
          'blob',
        ) as Blob | undefined;
        if (docxBlob) zip.file(`${safeName}_ProgressReview_${dateTag}.docx`, docxBlob);
        done++;
        onProgress?.(done, total);
      }
    }

    if (entry.termReport) {
      const sections = resolveTermReportSections(entry.termReport.text);
      const sigDataUrl = entry.teacherSignatureUrl
        ? await loadSignatureDataUrl(entry.student.teacherId)
        : undefined;
      if (wantPdf) {
        const blob = await generateTermReportPDF(
          sortedLessons,
          entry.student,
          entry.schoolName,
          sections,
          entry.teacherName,
          entry.termReport.periodName,
          'blob',
          entry.termReport.scores,
          entry.termReport.approvedByName,
          entry.teacherReportDisplayName,
          sigDataUrl,
        ) as Uint8Array | undefined;
        if (blob) zip.file(`${safeName}_AcademicReport_${dateTag}.pdf`, blob);
        done++;
        onProgress?.(done, total);
      }
      if (wantWord) {
        const docxBlob = await generateTermReportDocx(
          sortedLessons,
          entry.student,
          entry.schoolName,
          sections,
          entry.teacherName,
          entry.termReport.periodName,
          entry.termReport.scores,
          entry.termReport.approvedByName,
          entry.teacherReportDisplayName,
          sigDataUrl,
          'blob',
        ) as Blob | undefined;
        if (docxBlob) zip.file(`${safeName}_AcademicReport_${dateTag}.docx`, docxBlob);
        done++;
        onProgress?.(done, total);
      }
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `BulkReports_${dateTag}.zip`);
}

async function exportAsMergedPDF(
  entries: BulkExportEntry[],
  dateTag: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  // Collect all individual PDF blobs then merge via pdf-lib if available,
  // otherwise fall back to sequential zip with a "_merged" name note.
  const blobs: { name: string; bytes: Uint8Array }[] = [];
  let done = 0;
  const total = entries.reduce((sum, e) => sum + (e.polishReport ? 1 : 0) + (e.termReport ? 1 : 0), 0);

  for (const entry of entries) {
    const safeName = entry.student.name.replace(/[^a-z0-9]/gi, '_');
    const sortedLessons = entry.lessons.slice().sort((a, b) => a.date.localeCompare(b.date));

    if (entry.polishReport) {
      const polishedNotes = await buildPolishedNotes(sortedLessons);
      const blob = await generatePolishReportPDF(
        sortedLessons,
        entry.student,
        entry.schoolName,
        entry.polishReport.text,
        polishedNotes,
        entry.teacherName,
        entry.polishReport.periodName,
        'blob',
      ) as Uint8Array | undefined;
      if (blob) blobs.push({ name: `${safeName}_ProgressReview`, bytes: blob });
      done++;
      onProgress?.(done, total);
    }

    if (entry.termReport) {
      const sections = resolveTermReportSections(entry.termReport.text);
      const sigDataUrl = entry.teacherSignatureUrl
        ? await loadSignatureDataUrl(entry.student.teacherId)
        : undefined;
      const blob = await generateTermReportPDF(
        sortedLessons,
        entry.student,
        entry.schoolName,
        sections,
        entry.teacherName,
        entry.termReport.periodName,
        'blob',
        entry.termReport.scores,
        entry.termReport.approvedByName,
        entry.teacherReportDisplayName,
        sigDataUrl,
      ) as Uint8Array | undefined;
      if (blob) blobs.push({ name: `${safeName}_AcademicReport`, bytes: blob });
      done++;
      onProgress?.(done, total);
    }
  }

  if (blobs.length === 0) return;

  // Try pdf-lib merge
  const PDFLib = (window as any).PDFLib;
  if (PDFLib) {
    const merged = await PDFLib.PDFDocument.create();
    for (const { bytes } of blobs) {
      const src = await PDFLib.PDFDocument.load(bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p: any) => merged.addPage(p));
    }
    const mergedBytes = await merged.save();
    triggerDownload(new Blob([mergedBytes], { type: 'application/pdf' }), `BulkReports_${dateTag}.pdf`);
    return;
  }

  // pdf-lib not available — fall back to zip with note in filename
  const JSZip = (window as any).JSZip;
  if (!JSZip) { alert('No PDF merge library available — please refresh.'); return; }
  const zip = new JSZip();
  blobs.forEach(({ name, bytes }) => zip.file(`${name}_${dateTag}.pdf`, bytes));
  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `BulkReports_${dateTag}.zip`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Load a teacher's signature base64 from Firestore (avoids CORS). */
async function loadSignatureDataUrl(teacherId: string): Promise<string | undefined> {
  try {
    const db = getFirestore(getApp());
    const snap = await firestoreGetDoc(firestoreDoc(db, 'teacherSignatures', teacherId));
    return snap.exists() ? snap.data()?.base64 : undefined;
  } catch {
    return undefined;
  }
}

async function buildPolishedNotes(lessons: Lesson[]): Promise<Map<string, string>> {
  const entries = lessons
    .filter(l => l.learning || l.notes)
    .map(l => ({ id: l.id, text: [l.learning, l.notes].filter(Boolean).join(' | ') }));
  if (entries.length === 0) return new Map();
  return batchPolishForPdf(entries);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
