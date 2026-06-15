/**
 * AI Report types — Phase AI.2 / AI.2B / AI.3
 */

export type ReportType = 'polish_report' | 'term_report' | 'certificate';

/**
 * Structured data needed to re-render a saved Certificate of Completion
 * independently of the live enrollment (stored on the saved report doc).
 */
export interface CertificateSnapshot {
  enrollmentId: string;
  studentName: string;
  instrument: string;
  lessonType: string;
  totalLessons: number;
  durationMinutes: number;
  startDate?: string;
  endDate?: string;
  schoolName?: string;
  teacherName: string;
  teacherId?: string;
  studentId?: string;
  /** School this certificate belongs to — used to load co-branding assets on re-render. */
  schoolId?: string;
  /** True = show the school logo + signatories alongside the Artickle branding. */
  coBranded?: boolean;
}

/** In-memory draft (never written to Firestore directly) */
export interface AIReport {
  text: string;
  reportType: ReportType;
  source: 'ai' | 'fallback';
  isFallback: boolean;
  generatedAt: string;
}

/**
 * Firestore document: students/{studentId}/aiReports/{reportId}
 *
 * AI.3 changes:
 *  - Path now uses an auto-generated reportId (not reportType).
 *    Multiple independent drafts per type are allowed.
 *  - Added: id (client-side only), schoolId, generatedByName,
 *    editedByName, status.
 */
/** Scores for a term report — stored alongside the text */
export interface TermReportScores {
  technical: number;  // 0–10
  practical: number;  // 0–20
  practice:  number;  // 0–10
}

export interface SavedAIReport {
  /**
   * Firestore document ID — populated by the client after fetch.
   * Not stored inside the Firestore document itself.
   */
  id?: string;
  reportType: ReportType;
  studentId: string;
  /** School this report belongs to (used for school_admin read access). */
  schoolId: string;
  teacherId: string;
  teacherIds: string[];
  text: string;
  source: 'ai' | 'fallback';
  status: 'draft';
  generatedAt: string;
  updatedAt: string;
  generatedBy: string;
  generatedByName: string;
  editedBy: string | null;
  editedByName: string | null;
  lastSourceAction: 'generated' | 'edited';
  promptVersion: string;
  providerVersion: string;
  /** Enrollment period the report was generated for (optional — not present on legacy docs) */
  periodName?: string;
  periodStart?: string;
  periodEnd?: string;
  /** Term report scores (optional — only present on term_report type) */
  scores?: TermReportScores;
  /** Teacher name as it appears on the signed report (printed name) */
  approvedByName?: string;
  /** ISO timestamp of when the report was approved */
  approvedAt?: string;
  /** Certificate-only: structured snapshot used to re-render the PDF. The
   *  editable completion sentence is stored in `text`. */
  certificate?: CertificateSnapshot;
}

export const PROMPT_VERSION = 'ai2b-1';
export const PROVIDER_VERSION = 'claude-sonnet-4-6';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  polish_report: 'Progress Review',
  term_report: 'Term Report',
  certificate: 'Certificate of Completion',
};

export const REPORT_TYPE_DESCRIPTIONS: Record<ReportType, string> = {
  polish_report: 'AI-refined summary of lesson notes and progress',
  term_report: 'Structured academic report: Technical, Practical, Practice, General',
  certificate: 'Official completion certificate — editable, shared with parents',
};
