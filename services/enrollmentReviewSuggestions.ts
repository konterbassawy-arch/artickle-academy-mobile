/**
 * enrollmentReviewSuggestions.ts — Phase 19.6D5A
 *
 * Pure, stateless suggestion logic for the Enrollment Review tool.
 * NO side effects. NO Firestore writes. NO state mutations.
 *
 * Exports:
 *   classifyLesson()       — determine which review tab a lesson belongs to
 *   generateSuggestions()  — score candidate enrollments for an unlinked lesson
 *   scoreCandidate()        — score a single enrollment candidate (exposed for transparency tooltips)
 *   EnrollmentSuggestion   — typed suggestion result
 *   LessonClassification   — 'unlinked' | 'orphaned' | 'out-of-range' | 'mismatch' | 'ok'
 */

import {
  Lesson,
  Enrollment,
  EnrollmentStatus,
  LessonStatus,
  isCurrentEnrollment,
  getEnrollmentRemaining,
} from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LessonClassification =
  | 'unlinked'       // enrollmentId == null/undefined
  | 'orphaned'       // enrollmentId set but enrollment no longer in state
  | 'out-of-range'   // linked but lesson.date outside enrollment period
  | 'mismatch'       // linked but instrument or teacher disagrees
  | 'ok';            // linked and all checks pass

export interface ScoreBreakdown {
  teacherMatch: number;
  schoolMatch: number;
  dateInRange: number;
  deliveryModeMatch: number;
  isCurrentBonus: number;
  durationMatch: number;
  total: number;
}

export interface EnrollmentSuggestion {
  enrollment: Enrollment;
  score: number;
  confidence: 'high' | 'possible' | 'weak';
  breakdown: ScoreBreakdown;
  /** Advisory: lesson date is outside enrollment's startDate/endDate */
  dateOutOfRange: boolean;
  /** Advisory: linking would push consumed over totalLessons */
  wouldExceedCapacity: boolean;
}

// ─── Classification ────────────────────────────────────────────────────────────

/**
 * Classifies a single lesson against the current set of enrollments.
 * Returns the tab this lesson belongs to, plus the linked enrollment if any.
 */
export function classifyLesson(
  lesson: Lesson,
  enrollments: Enrollment[],
): { classification: LessonClassification; linkedEnrollment: Enrollment | null } {
  if (!lesson.enrollmentId) {
    return { classification: 'unlinked', linkedEnrollment: null };
  }

  const linked = enrollments.find(e => e.id === lesson.enrollmentId) ?? null;

  if (!linked) {
    return { classification: 'orphaned', linkedEnrollment: null };
  }

  // Instrument mismatch (case-insensitive, trimmed) takes priority over date check
  const lessonInstrument = (lesson as any).instrument as string | undefined;
  if (
    lessonInstrument &&
    linked.instrument &&
    lessonInstrument.trim().toLowerCase() !== linked.instrument.trim().toLowerCase()
  ) {
    return { classification: 'mismatch', linkedEnrollment: linked };
  }

  // Teacher mismatch (only when lesson has a teacherId and enrollment does too)
  if (
    lesson.teacherId &&
    linked.teacherId &&
    lesson.teacherId !== linked.teacherId
  ) {
    return { classification: 'mismatch', linkedEnrollment: linked };
  }

  // Date out of range
  if (linked.startDate && lesson.date < linked.startDate) {
    return { classification: 'out-of-range', linkedEnrollment: linked };
  }
  if (linked.endDate && lesson.date > linked.endDate) {
    return { classification: 'out-of-range', linkedEnrollment: linked };
  }

  return { classification: 'ok', linkedEnrollment: linked };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Score a single enrollment as a candidate for the given lesson.
 * Returns null if the enrollment fails the primary eligibility criteria.
 *
 * Primary criteria (ALL must pass to be a candidate):
 *   - student match (lesson.studentIds includes enrollment.studentId)
 *   - instrument match (case-insensitive)
 *   - enrollment not cancelled
 *
 * Secondary criteria (scored, not blocking):
 *   - teacher match
 *   - date window
 *   - school match
 *   - delivery mode match
 *   - lesson duration match
 *   - current vs historical enrollment
 *   - remaining capacity (filtered separately — see generateSuggestions)
 */
export function scoreCandidate(
  lesson: Lesson,
  enrollment: Enrollment,
  today: string,
): EnrollmentSuggestion | null {
  // ── Primary checks (blocking) ──────────────────────────────────────────────

  // Must include the student
  const studentIds = lesson.studentIds ?? [];
  if (!studentIds.includes(enrollment.studentId)) return null;

  // Instrument must match (case-insensitive, trimmed)
  const lessonInstrument = ((lesson as any).instrument as string | undefined)?.trim().toLowerCase()
    ?? '';
  const enrollmentInstrument = enrollment.instrument?.trim().toLowerCase() ?? '';
  if (lessonInstrument && enrollmentInstrument) {
    if (lessonInstrument !== enrollmentInstrument) return null;
  }

  // Never suggest cancelled enrollments
  if (enrollment.status === EnrollmentStatus.CANCELLED) return null;

  // ── Scoring (advisory) ────────────────────────────────────────────────────

  let teacherMatch = 0;
  if (lesson.teacherId && enrollment.teacherId) {
    teacherMatch = lesson.teacherId === enrollment.teacherId ? 40 : -10;
  }

  let dateInRange = 0;
  const hasStart = Boolean(enrollment.startDate);
  const hasEnd = Boolean(enrollment.endDate);
  if (hasStart && hasEnd) {
    if (lesson.date >= enrollment.startDate! && lesson.date <= enrollment.endDate!) {
      dateInRange = 25;
    }
    // else: date outside range → +0 (will be flagged as dateOutOfRange)
  } else if (hasStart || hasEnd) {
    dateInRange = 10; // partial window
  } else {
    dateInRange = 5; // undated enrollment
  }

  const lessonSchoolId = lesson.schoolId ?? '';
  const enrollmentSchoolId = enrollment.schoolId ?? '';
  const schoolMatch =
    lessonSchoolId && enrollmentSchoolId && lessonSchoolId === enrollmentSchoolId ? 15 : 0;

  let deliveryModeMatch = 0;
  if (lesson.deliveryMode && enrollment.deliveryMode) {
    deliveryModeMatch = lesson.deliveryMode === enrollment.deliveryMode ? 10 : 0;
  }

  const isCurrentBonus = isCurrentEnrollment(enrollment, today) ? 10 : 0;

  const durationMatch =
    lesson.durationMinutes && enrollment.durationMinutes &&
    lesson.durationMinutes === enrollment.durationMinutes
      ? 5
      : 0;

  const total =
    teacherMatch + dateInRange + schoolMatch + deliveryModeMatch + isCurrentBonus + durationMatch;

  const breakdown: ScoreBreakdown = {
    teacherMatch,
    schoolMatch,
    dateInRange,
    deliveryModeMatch,
    isCurrentBonus,
    durationMatch,
    total,
  };

  const confidence: EnrollmentSuggestion['confidence'] =
    total >= 60 ? 'high' : total >= 40 ? 'possible' : 'weak';

  // Advisory flags
  const dateOutOfRange =
    (enrollment.startDate != null && lesson.date < enrollment.startDate) ||
    (enrollment.endDate != null && lesson.date > enrollment.endDate);

  // Capacity check (uses empty lessons array — caller passes real one)
  const wouldExceedCapacity = false; // computed in generateSuggestions with real lessons

  return {
    enrollment,
    score: total,
    confidence,
    breakdown,
    dateOutOfRange,
    wouldExceedCapacity,
  };
}

/**
 * Generate ranked suggestions for a single unlinked lesson.
 *
 * @param lesson            The lesson to find candidates for
 * @param allEnrollments    All enrollments in the system
 * @param allLessons        All lessons (for remaining-capacity computation)
 * @param today             Today's date 'YYYY-MM-DD'
 * @param includeAtCapacity When true, at-capacity enrollments are included with a warning flag
 */
export function generateSuggestions(
  lesson: Lesson,
  allEnrollments: Enrollment[],
  allLessons: Lesson[],
  today: string,
  includeAtCapacity = false,
): EnrollmentSuggestion[] {
  const results: EnrollmentSuggestion[] = [];

  for (const enrollment of allEnrollments) {
    const suggestion = scoreCandidate(lesson, enrollment, today);
    if (!suggestion) continue;

    // Capacity check
    const { remaining } = getEnrollmentRemaining(enrollment, allLessons);
    const wouldExceedCapacity = remaining <= 0;

    if (!includeAtCapacity && wouldExceedCapacity) continue;

    results.push({ ...suggestion, wouldExceedCapacity });
  }

  // Sort by score DESC, then by updatedAt DESC for ties
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.enrollment.updatedAt ?? 0) - (a.enrollment.updatedAt ?? 0);
  });

  return results;
}

// ─── Group lesson helpers ─────────────────────────────────────────────────────

/**
 * For a group lesson (studentIds.length > 1), returns suggestions only when
 * ALL students in the group share the same single top candidate.
 * Returns empty array when students disagree on the best enrollment.
 */
export function generateGroupSuggestions(
  lesson: Lesson,
  allEnrollments: Enrollment[],
  allLessons: Lesson[],
  today: string,
): EnrollmentSuggestion[] {
  if (lesson.studentIds.length <= 1) {
    return generateSuggestions(lesson, allEnrollments, allLessons, today);
  }

  // Compute top candidate for each student
  const perStudent: Array<EnrollmentSuggestion | null> = lesson.studentIds.map(sid => {
    // Temporarily treat this as a single-student lesson for candidate search
    const fakeLesson = { ...lesson, studentIds: [sid] };
    const suggestions = generateSuggestions(fakeLesson, allEnrollments, allLessons, today);
    return suggestions[0] ?? null;
  });

  // All students must have the same top candidate for a group suggestion
  if (perStudent.some(s => s === null)) return [];
  const topId = perStudent[0]!.enrollment.id;
  if (!perStudent.every(s => s!.enrollment.id === topId)) return [];

  // Return the suggestion as seen from the first student's perspective
  return [perStudent[0]!];
}

// ─── Batch classification ─────────────────────────────────────────────────────

export interface ClassifiedLesson {
  lesson: Lesson;
  classification: LessonClassification;
  linkedEnrollment: Enrollment | null;
  suggestions: EnrollmentSuggestion[];
}

/**
 * Classify all lessons and generate suggestions for unlinked ones.
 * Returns a flat array of classified results — callers filter by classification for tabs.
 */
export function classifyAllLessons(
  lessons: Lesson[],
  enrollments: Enrollment[],
  today: string,
  includeAtCapacity = false,
): ClassifiedLesson[] {
  return lessons.map(lesson => {
    const { classification, linkedEnrollment } = classifyLesson(lesson, enrollments);

    let suggestions: EnrollmentSuggestion[] = [];
    if (classification === 'unlinked') {
      suggestions =
        lesson.studentIds.length > 1
          ? generateGroupSuggestions(lesson, enrollments, lessons, today)
          : generateSuggestions(lesson, enrollments, lessons, today, includeAtCapacity);
    }

    return { lesson, classification, linkedEnrollment, suggestions };
  });
}
