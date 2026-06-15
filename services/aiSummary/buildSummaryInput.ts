/**
 * buildSummaryInput — Phase AI.1
 *
 * Assembles a role-safe SummaryInput from AppContext data already in memory.
 * NO Firestore reads. NO writes. Pure function.
 *
 * Safety rules enforced here:
 *   - No DOB, email, financial data, parent contacts, or rate fields in output
 *   - Teacher notes included only for teacher audience (audience === 'teacher')
 *   - schoolAdminInternalComment never included (internal only, not for any audience here)
 *   - schoolAdminComment included for teacher audience only
 */

import { Student, Lesson, Enrollment, SchoolEnrollmentPeriod, LessonStatus } from '../../types';
import { getRelevantPeriodsForStudent } from '../schoolPeriodProgress';
import {
  SummaryInput,
  SummaryAudience,
  SummaryMode,
  LessonSnapshot,
  AttendanceSummary,
  PeriodSnapshot,
  SummarySignals,
} from './types';

const CONSUMED_STATUSES: string[] = [
  LessonStatus.PRESENT,
  LessonStatus.TAUGHT,
  LessonStatus.ABSENT_UNEXCUSED,
];

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function toAttendanceSummary(lessons: Lesson[]): AttendanceSummary {
  let present = 0, taught = 0, absentExcused = 0, absentUnexcused = 0, cancelled = 0;
  for (const l of lessons) {
    switch (l.status) {
      case LessonStatus.PRESENT:          present++;         break;
      case LessonStatus.TAUGHT:           taught++;          break;
      case LessonStatus.ABSENT_EXCUSED:   absentExcused++;   break;
      case LessonStatus.ABSENT_UNEXCUSED: absentUnexcused++; break;
      case LessonStatus.CANCELLED:        cancelled++;       break;
    }
  }
  const totalConsumed = present + taught + absentUnexcused;
  const totalAll = lessons.length;
  const attended = present + taught;
  const attendanceRate = totalConsumed > 0
    ? Math.round((attended / totalConsumed) * 100)
    : 0;
  return { present, taught, absentExcused, absentUnexcused, cancelled, totalConsumed, totalAll, attendanceRate };
}

function toPeriodSnapshot(p: ReturnType<typeof getRelevantPeriodsForStudent>[number]): PeriodSnapshot {
  return {
    name: p.period.name,
    startDate: p.period.startDate,
    endDate: p.period.endDate,
    consumedLessons: p.consumedLessons,
    totalLessons: p.totalLessons,
    lessonPercent: p.lessonPercent,
    consumedMinutes: p.consumedMinutes,
    totalMinutes: p.totalMinutes,
    minutesPercent: p.minutesPercent,
    isCurrent: p.isCurrent,
    isPast: p.isPast,
  };
}

function deriveTrend(
  lessons: Lesson[]
): SummarySignals['trend'] {
  // Need at least 6 lessons to attempt trend detection
  const consumed = lessons
    .filter(l => CONSUMED_STATUSES.includes(l.status))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (consumed.length < 6) return 'insufficient_data';

  const mid = Math.floor(consumed.length / 2);
  const first = consumed.slice(0, mid);
  const second = consumed.slice(mid);

  // Trend from evaluations (overallGrade is free text; use interactivity/behavior as proxy)
  const avgScore = (ls: Lesson[]) => {
    const scored = ls.filter(l => l.interactivity || l.behavior);
    if (!scored.length) return null;
    const sum = scored.reduce((acc, l) => acc + ((l.interactivity ?? 0) + (l.behavior ?? 0)) / 2, 0);
    return sum / scored.length;
  };

  const s1 = avgScore(first);
  const s2 = avgScore(second);

  if (s1 !== null && s2 !== null) {
    if (s2 - s1 > 0.3) return 'improving';
    if (s1 - s2 > 0.3) return 'declining';
    return 'steady';
  }

  // Fallback: attendance trend
  const attRate = (ls: Lesson[]) => {
    const consumed2 = ls.filter(l => CONSUMED_STATUSES.includes(l.status));
    const attended = ls.filter(l => l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT);
    return consumed2.length > 0 ? attended.length / consumed2.length : null;
  };

  const r1 = attRate(first);
  const r2 = attRate(second);

  if (r1 !== null && r2 !== null) {
    if (r2 - r1 > 0.1) return 'improving';
    if (r1 - r2 > 0.1) return 'declining';
    return 'steady';
  }

  return 'insufficient_data';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildSummaryInputOptions {
  student: Student;
  allLessons: Lesson[];                      // lessons already filtered to this student
  allEnrollments: Enrollment[];
  schoolEnrollmentPeriods: SchoolEnrollmentPeriod[];
  schoolName?: string;
  teacherName?: string;
  audience: SummaryAudience;
  mode: SummaryMode;
}

export function buildSummaryInput(opts: BuildSummaryInputOptions): SummaryInput {
  const {
    student, allLessons, allEnrollments,
    schoolEnrollmentPeriods, schoolName, teacherName,
    audience, mode,
  } = opts;

  const today = new Date().toISOString().slice(0, 10);

  // ── Period progress ──────────────────────────────────────────────────────
  const periods = getRelevantPeriodsForStudent(
    student, schoolEnrollmentPeriods, allLessons, today, allEnrollments
  );
  const currentPeriod = periods.find(p => p.isCurrent);
  const historicalPeriods = periods.filter(p => p.isPast);

  // ── Attendance ───────────────────────────────────────────────────────────
  const attendance = toAttendanceSummary(allLessons);

  // ── Recent lessons (last 10, sorted newest-first, NO financial fields) ───
  const sorted = allLessons
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const recentLessons: LessonSnapshot[] = sorted.slice(0, 10).map(l => {
    const snap: LessonSnapshot = {
      date: l.date.substring(0, 10),
      status: l.status,
      durationMinutes: l.durationMinutes,
    };
    if (l.overallGrade)           snap.evaluation          = l.overallGrade;
    if (l.repertoire)             snap.repertoire          = l.repertoire;
    if (l.practiceAssignment)     snap.practiceAssignment  = l.practiceAssignment;
    // Teacher notes + school comment — teacher audience only
    // l.learning = lesson content shown in UI; l.notes = extra teacher notes
    if (audience === 'teacher') {
      const combined = [l.learning, l.notes].filter(Boolean).join(' | ');
      if (combined)              snap.notes               = combined;
      if (l.schoolAdminComment)  snap.schoolComment       = l.schoolAdminComment;
      // schoolAdminInternalComment intentionally excluded — internal only
    }
    return snap;
  });

  // ── Signals ──────────────────────────────────────────────────────────────
  const mostRecentEvaluated = sorted.find(l => l.overallGrade || l.repertoire || l.practiceAssignment);
  const completionRate = currentPeriod?.lessonPercent
    ?? (attendance.totalConsumed > 0 && allLessons.length > 0
        ? Math.round((attendance.totalConsumed / allLessons.length) * 100)
        : 0);

  const signals: SummarySignals = {
    completionRate,
    attendanceRate: attendance.attendanceRate,
    trend: deriveTrend(allLessons),
    hasRecentEvaluation: !!mostRecentEvaluated,
    latestEvaluation: mostRecentEvaluated?.overallGrade,
    latestRepertoire: mostRecentEvaluated?.repertoire,
    latestPracticeAssignment: mostRecentEvaluated?.practiceAssignment,
  };

  // ── Teacher notes (last 5 lessons with content) — teacher audience only ──
  const recentTeacherNotes: string[] = audience === 'teacher'
    ? sorted
        .filter(l => (l.learning && l.learning.trim()) || (l.notes && l.notes.trim()))
        .slice(0, 5)
        .map(l => [l.learning, l.notes].filter(Boolean).join(' | '))
    : [];

  // ── Student name ─────────────────────────────────────────────────────────
  const studentFirstName = student.name.split(' ')[0] ?? student.name;

  return {
    audience,
    mode,
    generatedAt: new Date().toISOString(),
    studentFirstName,
    studentFullName: student.name,
    instrument: student.instrument,
    yearGrade: student.yearGrade,
    schoolName,
    teacherName,
    currentPeriod: currentPeriod ? toPeriodSnapshot(currentPeriod) : undefined,
    historicalPeriods: historicalPeriods.map(toPeriodSnapshot),
    attendance,
    recentLessons,
    signals,
    recentTeacherNotes,
  };
}
