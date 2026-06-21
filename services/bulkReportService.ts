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
import { resolvePolishedNotes } from './polishedNotesCache';
import { resolveTermReportSections } from './aiSummary/resolveAiContent';
import { generatePolishReportPDF, generateTermReportPDF } from './pdfExport';
import { generatePolishReportDocx, generateTermReportDocx } from './wordExport';
import { renderCertificatePDFs, CertInput } from './certificateExport';

export type ExportFileType = 'pdf' | 'word' | 'both';

/** Bulk export output formats. */
export type BulkExportMode = 'zip' | 'zip-per-student' | 'merged';

/** Progress callback — label, when present, names the current student. */
export type BulkExportProgress = (done: number, total: number, label?: string) => void;
// @ts-ignore — CDN import for Firestore
import { getFirestore, doc as firestoreDoc, getDoc as firestoreGetDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';

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
  exportMode: BulkExportMode,
  onProgress?: BulkExportProgress,
  fileType: ExportFileType = 'pdf',
  certInputs?: CertInput[],
): Promise<void> {
  const dateTag = new Date().toISOString().slice(0, 10);

  if (exportMode === 'zip') {
    await exportAsZip(entries, dateTag, fileType, certInputs, onProgress);
  } else if (exportMode === 'zip-per-student') {
    await exportAsPerStudentZip(entries, dateTag, certInputs, onProgress);
  } else {
    // Merged "Single PDF" mode is inherently PDF — fileType is ignored here.
    await exportAsMergedPDF(entries, dateTag, certInputs, onProgress);
  }
}

async function exportAsZip(
  entries: BulkExportEntry[],
  dateTag: string,
  fileType: ExportFileType,
  certInputs: CertInput[] | undefined,
  onProgress?: BulkExportProgress,
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
  ) + (certInputs?.length ?? 0);
  onProgress?.(0, total);

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

  // Certificate PDFs go into the SAME zip as the reports.
  if (certInputs?.length) {
    const certPdfs = await renderCertificatePDFs(certInputs);
    for (const { name, bytes } of certPdfs) {
      zip.file(name, bytes);
      done++;
      onProgress?.(done, total);
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `BulkReports_${dateTag}.zip`);
}

async function exportAsMergedPDF(
  entries: BulkExportEntry[],
  dateTag: string,
  certInputs: CertInput[] | undefined,
  onProgress?: BulkExportProgress,
): Promise<void> {
  // Collect all individual PDF blobs then merge via pdf-lib if available,
  // otherwise fall back to sequential zip with a "_merged" name note.
  const blobs: { name: string; bytes: Uint8Array }[] = [];
  let done = 0;
  const total = entries.reduce((sum, e) => sum + (e.polishReport ? 1 : 0) + (e.termReport ? 1 : 0), 0)
    + (certInputs?.length ?? 0);
  onProgress?.(0, total);

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

  // Certificate PDFs get appended to the same merged document.
  if (certInputs?.length) {
    const certPdfs = await renderCertificatePDFs(certInputs);
    for (const { name, bytes } of certPdfs) {
      blobs.push({ name, bytes });
      done++;
      onProgress?.(done, total);
    }
  }

  if (blobs.length === 0) return;

  // Try pdf-lib merge
  const PDFLib = (window as any).PDFLib;
  if (PDFLib) {
    const mergedBytes = await mergePdfBytes(PDFLib, blobs.map(b => b.bytes));
    triggerDownload(new Blob([mergedBytes], { type: 'application/pdf' }), `BulkReports_${dateTag}.pdf`);
    return;
  }

  // pdf-lib not available — fall back to zip with note in filename.
  // Strip any trailing ".pdf" before appending so names don't double up.
  const JSZip = (window as any).JSZip;
  if (!JSZip) { alert('No PDF merge library available — please refresh.'); return; }
  const zip = new JSZip();
  blobs.forEach(({ name, bytes }) => zip.file(`${name.replace(/\.pdf$/i, '')}_${dateTag}.pdf`, bytes));
  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `BulkReports_${dateTag}.zip`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-student zip: one merged PDF per student (all their reports + certificate),
// all in a single zip. Progress is reported up front and per student so the bar
// is visible immediately and names the student currently rendering.
// ─────────────────────────────────────────────────────────────────────────────
async function exportAsPerStudentZip(
  entries: BulkExportEntry[],
  dateTag: string,
  certInputs: CertInput[] | undefined,
  onProgress?: BulkExportProgress,
): Promise<void> {
  const JSZip = (window as any).JSZip;
  if (!JSZip) { alert('JSZip library not loaded — please refresh.'); return; }
  const PDFLib = (window as any).PDFLib;
  if (!PDFLib) { alert('PDF merge library not loaded — please refresh.'); return; }

  // Group entries by student, preserving first-seen order.
  const order: string[] = [];
  const byStudent = new Map<string, BulkExportEntry[]>();
  for (const e of entries) {
    if (!byStudent.has(e.student.id)) { byStudent.set(e.student.id, []); order.push(e.student.id); }
    byStudent.get(e.student.id)!.push(e);
  }

  // renderCertificatePDFs is 1:1 with certInputs, so index i aligns with
  // certInputs[i]. Key the rendered bytes by the cert's studentId (falling back
  // to its id) so each student's certificate(s) can be attached.
  const certBytesByStudent = new Map<string, Uint8Array[]>();
  if (certInputs?.length) {
    const certPdfs = await renderCertificatePDFs(certInputs);
    certInputs.forEach((ci, i) => {
      const key = ci.studentId ?? ci.id;
      if (!certBytesByStudent.has(key)) certBytesByStudent.set(key, []);
      if (certPdfs[i]) certBytesByStudent.get(key)!.push(certPdfs[i].bytes);
    });
  }

  const zip = new JSZip();
  const total = order.length;
  let done = 0;
  const firstStudent = byStudent.get(order[0])?.[0]?.student;
  onProgress?.(0, total, firstStudent?.name);

  const used = new Set<string>();

  for (const studentId of order) {
    const studentEntries = byStudent.get(studentId)!;
    const student = studentEntries[0].student;
    onProgress?.(done, total, student.name);

    const parts: Uint8Array[] = [];

    for (const entry of studentEntries) {
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
        if (blob) parts.push(blob);
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
        if (blob) parts.push(blob);
      }
    }

    // Append this student's certificate(s).
    for (const bytes of certBytesByStudent.get(studentId) ?? []) parts.push(bytes);

    if (parts.length > 0) {
      const merged = await mergePdfBytes(PDFLib, parts);
      const safeName = student.name.replace(/[^a-z0-9]/gi, '_');
      let name = `${safeName}_${dateTag}.pdf`;
      if (used.has(name)) name = `${safeName}_${studentId}_${dateTag}.pdf`;
      used.add(name);
      zip.file(name, merged);
    }

    done++;
    onProgress?.(done, total, student.name);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `BulkReports_${dateTag}.zip`);
}

/** Merge several PDF byte arrays into one. Returns the single input unchanged
 *  when there's only one part. Mixed page sizes are fine. */
async function mergePdfBytes(PDFLib: any, parts: Uint8Array[]): Promise<Uint8Array> {
  if (parts.length === 1) return parts[0];
  const merged = await PDFLib.PDFDocument.create();
  for (const bytes of parts) {
    const src = await PDFLib.PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p: any) => merged.addPage(p));
  }
  return merged.save();
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
  return resolvePolishedNotes(lessons);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
