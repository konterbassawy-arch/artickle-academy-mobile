/**
 * SchoolPeriodListBadge — unified "Enrollment" column badge
 *
 * Handles three cases:
 *   1. School student with a school period → period name + bars
 *   2. School student with no period → individual enrollment + bars (fallback)
 *   3. Private student (no schoolId) → individual enrollment + bars
 *
 * Override badge shown when a school-period enrollment has isDurationOverride.
 *
 * READ-ONLY. NO WRITES.
 */

import React, { useMemo } from 'react';
import { Student, Lesson, Enrollment, SchoolEnrollmentPeriod, Role, ENROLLMENT_CONSUMED_STATUSES, isCurrentEnrollment } from '../types';
import {
  getCompactPeriodSummary,
} from '../services/schoolPeriodProgress';

interface Props {
  student: Student;
  allLessons: Lesson[];
  allEnrollments?: Enrollment[];
  schoolEnrollmentPeriods: SchoolEnrollmentPeriod[];
  today?: string;
  viewerRole?: Role;
}

function pct(consumed: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (consumed / total) * 100));
}

/** Two progress bars shared by both school-period and individual enrollment paths */
function TwoBars({
  label,
  consumedMinutes,
  totalMinutes,
  consumedLessons,
  totalLessons,
  overrideBadge,
  alertPill,
}: {
  label: string;
  consumedMinutes: number;
  totalMinutes: number;
  consumedLessons: number;
  totalLessons: number;
  overrideBadge?: boolean;
  alertPill?: React.ReactNode;
}) {
  const minPct = pct(consumedMinutes, totalMinutes);
  const lsnPct = pct(consumedLessons, totalLessons);

  return (
    <div
      className="flex flex-col gap-0.5 w-[80px]"
      title={`${label} · ${consumedMinutes}/${totalMinutes} min · ${consumedLessons}/${totalLessons} lessons`}
    >
      {/* Label row */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[10px] text-slate-500 font-medium truncate flex-1">{label}</span>
        {overrideBadge && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30 font-medium leading-none shrink-0 whitespace-nowrap">
            Custom
          </span>
        )}
      </div>

      {/* Minutes bar — emerald */}
      <div className="flex items-center gap-1">
        <div className="flex-1 bg-slate-700/50 rounded-full h-1">
          <div className="h-1 rounded-full transition-all" style={{ width: `${minPct}%`, backgroundColor: '#10b981' }} />
        </div>
        <span className="text-[9px] text-emerald-400 tabular-nums shrink-0">
          {consumedMinutes}<span className="text-slate-600">m</span>
        </span>
      </div>

      {/* Lessons bar — sky/blue */}
      <div className="flex items-center gap-1">
        <div className="flex-1 bg-slate-700/50 rounded-full h-1">
          <div className="h-1 rounded-full transition-all" style={{ width: `${lsnPct}%`, backgroundColor: '#38bdf8' }} />
        </div>
        <span className="text-[9px] text-sky-400 tabular-nums shrink-0">
          {consumedLessons}<span className="text-slate-600">/{totalLessons}</span>
        </span>
      </div>

      {alertPill && <div className="mt-0.5">{alertPill}</div>}
    </div>
  );
}

export const SchoolPeriodListBadge: React.FC<Props> = ({
  student,
  allLessons,
  allEnrollments,
  schoolEnrollmentPeriods,
  today: todayProp,
  viewerRole,
}) => {
  const today = todayProp ?? new Date().toISOString().slice(0, 10);

  // ── School-period path ──────────────────────────────────────────────────────
  const summary = useMemo(
    () => getCompactPeriodSummary(student, schoolEnrollmentPeriods, allLessons, today, allEnrollments),
    [student, schoolEnrollmentPeriods, allLessons, today, allEnrollments]
  );

  // ── Active individual enrollment (current = active/paused + endDate >= today) ──
  // Exclude enrollments linked to a school period — those are shown via the period path
  const activeIndividualEnrollment = useMemo(() => {
    if (!allEnrollments) return null;
    const current = allEnrollments
      .filter(e => e.studentId === student.id && !e.schoolPeriodId && isCurrentEnrollment(e, today))
      .sort((a, b) => b.createdAt - a.createdAt);
    return current[0] ?? null;
  }, [allEnrollments, student.id, today]);

  // ── School-period path ──────────────────────────────────────────────────────
  if (summary) {
    const label = summary.period.term || summary.period.name;

    // Check override: find the linked enrollment for this period
    const linkedEnrollment = allEnrollments?.find(
      e => e.studentId === student.id && e.schoolPeriodId === summary.period.id
    );
    const hasOverride = !!(linkedEnrollment?.isDurationOverride);

    // If the linked enrollment is completed/cancelled and there's an active individual
    // enrollment, prefer showing the active one on the compact list badge
    const enrollmentCompleted =
      linkedEnrollment?.status === 'completed' || linkedEnrollment?.status === 'cancelled';
    if (enrollmentCompleted && activeIndividualEnrollment) {
      // Fall through to individual enrollment path below
    } else {
      // Suppress renewal alerts when enrollment is completed; show "Completed" badge instead
      const showAlert = viewerRole === Role.ADMIN && summary.isCurrent && !enrollmentCompleted && summary.alertLevel !== 'none';
      const alertPillCls =
        summary.alertLevel === 'almost'
          ? 'bg-red-500/15 text-red-300 ring-red-500/30'
          : 'bg-amber-500/15 text-amber-300 ring-amber-500/30';
      const alertText =
        summary.alertLevel === 'almost' ? 'Almost complete' : 'Approaching';

      const pill = enrollmentCompleted ? (
        <span className="text-[9px] px-1 py-0.5 rounded-full ring-1 font-medium leading-none w-fit bg-violet-500/15 text-violet-400 ring-violet-500/30">
          Completed
        </span>
      ) : showAlert ? (
        <span className={`text-[9px] px-1 py-0.5 rounded-full ring-1 font-medium leading-none w-fit ${alertPillCls}`}>
          {alertText}
        </span>
      ) : undefined;

      return (
        <TwoBars
          label={label}
          consumedMinutes={summary.consumedMinutes}
          totalMinutes={summary.totalMinutes}
          consumedLessons={summary.consumedLessons}
          totalLessons={summary.totalLessons}
          overrideBadge={hasOverride}
          alertPill={pill}
        />
      );
    }
  }

  // ── Individual-enrollment path (no school period) ──────────────────────────
  if (activeIndividualEnrollment) {
    const consumedLessons = allLessons.filter(
      l => l.enrollmentId === activeIndividualEnrollment.id
        && (ENROLLMENT_CONSUMED_STATUSES as readonly string[]).includes(l.status)
    );
    const consumed = consumedLessons.length;
    const total = activeIndividualEnrollment.totalLessons;
    const dur = activeIndividualEnrollment.durationMinutes;
    const consumedMin = consumedLessons.reduce(
      (sum, l) => sum + (l.durationMinutes && l.durationMinutes > 0 ? l.durationMinutes : dur),
      0
    );
    const label = activeIndividualEnrollment.term || activeIndividualEnrollment.lessonType || 'Individual';

    return (
      <TwoBars
        label={label}
        consumedMinutes={consumedMin}
        totalMinutes={total * dur}
        consumedLessons={consumed}
        totalLessons={total}
      />
    );
  }

  // ── No data ─────────────────────────────────────────────────────────────────
  if (student.schoolId) {
    const hasPeriods = schoolEnrollmentPeriods.some(p => p.schoolId === student.schoolId);
    if (!hasPeriods) return <span className="text-[11px] text-slate-600">No periods set</span>;
  }

  return <span className="text-[11px] text-slate-600">No enrollment</span>;
};
