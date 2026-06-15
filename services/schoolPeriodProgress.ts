/**
 * schoolPeriodProgress — Phase 19.6 Reset (minutes-based visual + renewal alerts)
 *
 * Pure read-only helpers for school-period auto-progress.
 *
 * For normal school students:
 *   - student belongs to school
 *   - school has SchoolEnrollmentPeriod records
 *   - lessons are counted into matching periods by date range
 *   - no enrollmentId linking required
 *
 * NO WRITES. NO APPCONTEXT DEPS. PURE FUNCTIONS ONLY.
 */

import {
  Student,
  Lesson,
  Enrollment,
  SchoolEnrollmentPeriod,
  ENROLLMENT_CONSUMED_STATUSES,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Threshold alert level for renewal notifications (admin-only UI surface).
 * Derived from the max of lessonPercent / minutesPercent.
 *
 *   'almost'      → >= 90%
 *   'approaching' → >= 80%
 *   'none'        → below 80%
 */
export type PeriodAlertLevel = 'none' | 'approaching' | 'almost';

/**
 * Which metric triggered the alert — used for detail-page wording.
 * Null when alertLevel is 'none'.
 */
export type PeriodAlertSource = 'lessons' | 'minutes' | 'both' | null;

export interface PeriodProgress {
  period: SchoolEnrollmentPeriod;

  // ── Lessons ──
  consumedLessons: number;
  totalLessons: number;
  remainingLessons: number;
  lessonPercent: number;   // 0–100, clamped for display (overshoot stays truthful in raw counts)

  // ── Minutes ──
  consumedMinutes: number;
  totalMinutes: number;
  remainingMinutes: number;
  minutesPercent: number;  // 0–100, clamped for display

  // ── Renewal alert ──
  alertLevel: PeriodAlertLevel;
  alertSource: PeriodAlertSource;

  // ── Matched lessons (already filtered to consumed statuses in range) ──
  matchedLessons: Lesson[];

  // ── Period position vs today ──
  isCurrent: boolean;
  isPast: boolean;
  isUpcoming: boolean;

  // ── Backward-compat aliases (deprecated — do not use in new code) ──
  /** @deprecated use consumedLessons */
  consumed: number;
  /** @deprecated use totalLessons */
  total: number;
  /** @deprecated use remainingLessons */
  remaining: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal — compute alert level / source from two percentages
// ─────────────────────────────────────────────────────────────────────────────

function deriveAlert(lessonPercent: number, minutesPercent: number): {
  alertLevel: PeriodAlertLevel;
  alertSource: PeriodAlertSource;
} {
  const lessonsHit90 = lessonPercent >= 90;
  const minutesHit90 = minutesPercent >= 90;
  const lessonsHit80 = lessonPercent >= 80;
  const minutesHit80 = minutesPercent >= 80;

  if (lessonsHit90 || minutesHit90) {
    const source: PeriodAlertSource =
      lessonsHit90 && minutesHit90 ? 'both' : lessonsHit90 ? 'lessons' : 'minutes';
    return { alertLevel: 'almost', alertSource: source };
  }

  if (lessonsHit80 || minutesHit80) {
    const source: PeriodAlertSource =
      lessonsHit80 && minutesHit80 ? 'both' : lessonsHit80 ? 'lessons' : 'minutes';
    return { alertLevel: 'approaching', alertSource: source };
  }

  return { alertLevel: 'none', alertSource: null };
}

function clampPct(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

/**
 * Sum of durations for a list of matched lessons.
 * Fallback order per lesson:
 *   1. lesson.durationMinutes (normal case — non-optional on the type)
 *   2. period.defaultDurationMinutes (legacy/malformed lessons)
 *   3. 0 (undercounts one lesson, never crashes)
 */
/**
 * Find whether a student's enrollment for a given period has a duration override.
 * Returns the override durationMinutes, or undefined if none found.
 * Matches by schoolPeriodId (explicit link) or by schoolId + matching startDate (custom).
 */
function findEnrollmentDurationOverride(
  studentId: string,
  period: SchoolEnrollmentPeriod,
  allEnrollments: Enrollment[]
): number | undefined {
  const enr = allEnrollments.find(e =>
    e.studentId === studentId &&
    e.isDurationOverride &&
    e.status !== 'cancelled' &&
    (
      e.schoolPeriodId === period.id ||
      (e.schoolId === period.schoolId &&
       e.startDate === period.startDate &&
       (!e.endDate || e.endDate === period.endDate))
    )
  );
  return enr?.durationMinutes;
}

/**
 * Find whether a student's enrollment for a given period has a custom totalLessons
 * that differs from the period default. Returns the override count, or undefined if none.
 */
function findEnrollmentTotalLessonsOverride(
  studentId: string,
  period: SchoolEnrollmentPeriod,
  allEnrollments: Enrollment[]
): number | undefined {
  const enr = allEnrollments.find(e =>
    e.studentId === studentId &&
    e.status !== 'cancelled' &&
    (
      e.schoolPeriodId === period.id ||
      (e.schoolId === period.schoolId &&
       e.startDate === period.startDate &&
       (!e.endDate || e.endDate === period.endDate))
    )
  );
  if (!enr) return undefined;
  return enr.totalLessons !== period.defaultTotalLessons ? enr.totalLessons : undefined;
}

function sumMinutes(lessons: Lesson[], period: SchoolEnrollmentPeriod): number {
  let total = 0;
  for (const l of lessons) {
    if (l.durationMinutes && l.durationMinutes > 0) {
      total += l.durationMinutes;
    } else if (period.defaultDurationMinutes && period.defaultDurationMinutes > 0) {
      total += period.defaultDurationMinutes;
    }
    // else: fall through, count as 0
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper 1 — getSchoolPeriodProgress
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count consumed lessons + minutes for ONE student in ONE period.
 *
 * A lesson is counted when ALL of:
 *   1. lesson.studentIds includes student.id
 *   2. lesson.schoolId === student.schoolId
 *   3. lesson.date is within [period.startDate, period.endDate] (inclusive)
 *   4. lesson.status is in ENROLLMENT_CONSUMED_STATUSES
 *      (Present / Taught / Absent-Unexcused)
 *
 * Absent (Excused) and Cancelled do NOT consume.
 */
export function getSchoolPeriodProgress(
  student: Student,
  period: SchoolEnrollmentPeriod,
  allLessons: Lesson[],
  /** When a student has an enrollment duration override (isDurationOverride), pass durationMinutes here */
  overrideDurationMinutes?: number,
  /** When a student has a custom totalLessons different from the period default, pass it here */
  overrideTotalLessons?: number,
  /** Pass full enrollments to exclude lessons linked to a different enrollment */
  allEnrollments?: Enrollment[]
): PeriodProgress {
  const matchedLessons = allLessons.filter(l => {
    if (!l.studentIds?.includes(student.id)) return false;
    if (l.schoolId !== student.schoolId) return false;
    if (l.date < period.startDate || l.date > period.endDate) return false;
    if (!(ENROLLMENT_CONSUMED_STATUSES as readonly string[]).includes(l.status)) return false;
    // Exclude lessons linked to a different enrollment (not this period's enrollment)
    if (l.enrollmentId && allEnrollments) {
      const linkedEnrollment = allEnrollments.find(e => e.id === l.enrollmentId);
      if (linkedEnrollment && linkedEnrollment.schoolPeriodId && linkedEnrollment.schoolPeriodId !== period.id) {
        return false;
      }
      if (linkedEnrollment && !linkedEnrollment.schoolPeriodId) {
        return false;
      }
    }
    // Exclude unlinked lessons when the student has an active individual enrollment
    // covering this lesson date — the lesson likely belongs to the newer enrollment
    if (!l.enrollmentId && allEnrollments) {
      const hasActiveIndividual = allEnrollments.some(e =>
        e.studentId === student.id &&
        !e.schoolPeriodId &&
        (e.status === 'active' || e.status === 'paused') &&
        l.date >= e.startDate &&
        (!e.endDate || l.date <= e.endDate)
      );
      if (hasActiveIndividual) {
        return false;
      }
    }
    return true;
  });

  const consumedLessons = matchedLessons.length;
  const totalLessons = overrideTotalLessons ?? period.defaultTotalLessons;
  const remainingLessons = Math.max(0, totalLessons - consumedLessons);

  const consumedMinutes = sumMinutes(matchedLessons, period);
  // Use enrollment override duration if provided, otherwise fall back to period default
  const effectiveDuration = overrideDurationMinutes ?? period.defaultDurationMinutes;
  const totalMinutes = totalLessons * effectiveDuration;
  const remainingMinutes = Math.max(0, totalMinutes - consumedMinutes);

  const lessonPercent = totalLessons > 0 ? clampPct((consumedLessons / totalLessons) * 100) : 0;
  const minutesPercent = totalMinutes > 0 ? clampPct((consumedMinutes / totalMinutes) * 100) : 0;

  const { alertLevel, alertSource } = deriveAlert(lessonPercent, minutesPercent);

  // isCurrent/isPast/isUpcoming are resolved by the caller (getRelevantPeriodsForStudent)
  // when positional context is needed. When this function is called directly, default to false.
  return {
    period,
    consumedLessons,
    totalLessons,
    remainingLessons,
    lessonPercent,
    consumedMinutes,
    totalMinutes,
    remainingMinutes,
    minutesPercent,
    alertLevel,
    alertSource,
    matchedLessons,
    isCurrent: false,
    isPast: false,
    isUpcoming: false,
    // Deprecated aliases
    consumed: consumedLessons,
    total: totalLessons,
    remaining: remainingLessons,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper 2 — getRelevantPeriodsForStudent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all display-relevant periods for a school student, sorted most-recent first.
 *
 * A period is "relevant" when:
 *   - It belongs to student.schoolId
 *   - AND: it is the current period  → always shown (even with 0 consumed)
 *   - OR:  it is a past period with consumed > 0  → historical record
 *   - Archived periods appear only if they have consumed lessons
 *   - Upcoming (startDate > today) periods are excluded from the standard view
 *
 * Returns [] when student has no schoolId (B2C / self-paid — not affected).
 *
 * @param today  ISO 'YYYY-MM-DD' — pass new Date().toISOString().slice(0,10) at call-site
 */
export function getRelevantPeriodsForStudent(
  student: Student,
  periods: SchoolEnrollmentPeriod[],
  allLessons: Lesson[],
  today: string,
  /** Pass full enrollments list to honour per-student duration overrides in totalMinutes */
  allEnrollments?: Enrollment[]
): PeriodProgress[] {
  if (!student.schoolId) return [];

  const schoolPeriods = periods.filter(p => p.schoolId === student.schoolId);

  const annotated: PeriodProgress[] = schoolPeriods.map(period => {
    const overrideDuration = allEnrollments
      ? findEnrollmentDurationOverride(student.id, period, allEnrollments)
      : undefined;
    const overrideLessons = allEnrollments
      ? findEnrollmentTotalLessonsOverride(student.id, period, allEnrollments)
      : undefined;
    const base = getSchoolPeriodProgress(student, period, allLessons, overrideDuration, overrideLessons, allEnrollments);
    const isCurrent = today >= period.startDate && today <= period.endDate;
    const isPast = today > period.endDate;
    const isUpcoming = today < period.startDate;
    return { ...base, isCurrent, isPast, isUpcoming };
  });

  // Filter to relevant entries
  const relevant = annotated.filter(r => {
    if (r.period.status === 'archived') return r.consumedLessons > 0;  // archived: only if used
    if (r.isCurrent) return true;                                       // current: always show
    if (r.isPast) return true;                                          // past: always show
    return false;                                                        // upcoming: skip
  });

  // Sort: current first, then past descending by startDate
  return relevant.sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    return b.period.startDate.localeCompare(a.period.startDate);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper 3 — getCompactPeriodSummary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the single most-relevant period for compact list display.
 *
 * Priority:
 *   1. Current active period (today in range)
 *   2. Latest past period with consumed lessons
 *
 * Returns null for non-school students or if no relevant period found.
 */
export function getCompactPeriodSummary(
  student: Student,
  periods: SchoolEnrollmentPeriod[],
  allLessons: Lesson[],
  today: string,
  /** Pass full enrollments list to honour per-student duration overrides in totalMinutes */
  allEnrollments?: Enrollment[]
): PeriodProgress | null {
  if (!student.schoolId) return null;

  // Check if school has any periods at all
  const hasPeriods = periods.some(p => p.schoolId === student.schoolId);
  if (!hasPeriods) return null;

  const relevant = getRelevantPeriodsForStudent(student, periods, allLessons, today, allEnrollments);

  // getRelevantPeriodsForStudent always puts current first
  if (relevant.length > 0) return relevant[0];

  // No current period and no past lessons — check if there is a current period
  // to show at 0/total
  const currentPeriod = periods.find(
    p =>
      p.schoolId === student.schoolId &&
      p.status !== 'archived' &&
      today >= p.startDate &&
      today <= p.endDate
  );
  if (currentPeriod) {
    const overrideDuration = allEnrollments
      ? findEnrollmentDurationOverride(student.id, currentPeriod, allEnrollments)
      : undefined;
    const overrideLessons = allEnrollments
      ? findEnrollmentTotalLessonsOverride(student.id, currentPeriod, allEnrollments)
      : undefined;
    const base = getSchoolPeriodProgress(student, currentPeriod, allLessons, overrideDuration, overrideLessons, allEnrollments);
    return { ...base, isCurrent: true, isPast: false, isUpcoming: false };
  }

  return null;
}
