/**
 * AI Summary — shared types (Phase AI.1)
 *
 * SummaryInput is assembled by buildSummaryInput.ts and consumed by both
 * the deterministic fallback and (later) live AI providers.
 *
 * ROLE SAFETY: sensitive fields are excluded at input-assembly time, not here.
 * No DOB, email, financial data, or parent contact fields ever appear in these types.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Audience + mode
// ─────────────────────────────────────────────────────────────────────────────

/** Currently only teacher — expand in AI.2+ */
export type SummaryAudience = 'teacher';

/**
 * polish — flowing lesson-progress paragraph; friendly prose style
 * term   — structured term summary with section headings and statistics
 */
export type SummaryMode = 'polish' | 'term';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface LessonSnapshot {
  date: string;            // YYYY-MM-DD
  status: string;          // LessonStatus value — no financial fields
  durationMinutes: number;
  evaluation?: string;     // overallGrade
  repertoire?: string;
  practiceAssignment?: string;
  notes?: string;          // teacher lesson notes — included only for teacher audience
  schoolComment?: string;  // schoolAdminComment — included only for teacher audience
}

export interface AttendanceSummary {
  present: number;
  taught: number;
  absentExcused: number;
  absentUnexcused: number;
  cancelled: number;
  totalConsumed: number;   // present + taught + absentUnexcused
  totalAll: number;        // all lessons including cancelled + excused
  attendanceRate: number;  // (present + taught) / totalConsumed * 100, 0–100
}

export interface PeriodSnapshot {
  name: string;
  startDate: string;
  endDate: string;
  consumedLessons: number;
  totalLessons: number;
  lessonPercent: number;
  consumedMinutes: number;
  totalMinutes: number;
  minutesPercent: number;
  isCurrent: boolean;
  isPast: boolean;
}

export interface SummarySignals {
  completionRate: number;       // 0–100 (consumed / total lessons for current period, else total lesson rate)
  attendanceRate: number;       // 0–100
  trend: 'improving' | 'steady' | 'declining' | 'insufficient_data';
  hasRecentEvaluation: boolean;
  latestEvaluation?: string;    // overallGrade from most recent evaluated lesson
  latestRepertoire?: string;
  latestPracticeAssignment?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary input shape
// ─────────────────────────────────────────────────────────────────────────────

export interface SummaryInput {
  audience: SummaryAudience;
  mode: SummaryMode;
  generatedAt: string;         // ISO timestamp (client-side, no server write)

  // Student — safe fields only (no DOB, email, financial, parent contact)
  studentFirstName: string;
  studentFullName: string;
  instrument: string;
  yearGrade?: string;
  schoolName?: string;
  teacherName?: string;

  // Period progress (school period model, if student has schoolId + periods)
  currentPeriod?: PeriodSnapshot;
  historicalPeriods: PeriodSnapshot[];

  // Attendance breakdown
  attendance: AttendanceSummary;

  // Last 10 lessons (no financial fields, no rate data)
  recentLessons: LessonSnapshot[];

  // Aggregated signals
  signals: SummarySignals;

  // Teacher-internal notes (last 5 lessons that have notes) — teacher audience only
  recentTeacherNotes: string[];
}
