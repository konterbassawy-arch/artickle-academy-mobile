/**
 * SchoolPeriodProgressCard — Phase 19.6 Reset (minutes-based visual + renewal alerts)
 *
 * Read-only card showing auto-progress across all relevant school periods.
 * Used on student detail pages (Admin / School / Teacher views).
 *
 * READ-ONLY. NO WRITES. NO ENROLLMENT LINKING.
 *
 * Shows:
 *   - All relevant periods (current + past with activity)
 *   - Minutes circle (primary) + lesson count (secondary) per period
 *   - Renewal alert pill on the CURRENT period when >= 80% / >= 90%
 *   - Fallback states for missing periods / no lessons yet
 */

import React from 'react';
import { Student, Lesson, Enrollment, SchoolEnrollmentPeriod, School, Role, isCurrentEnrollment, ENROLLMENT_CONSUMED_STATUSES } from '../types';
import {
  getRelevantPeriodsForStudent,
  getSchoolPeriodProgress,
  PeriodProgress,
  PeriodAlertLevel,
  PeriodAlertSource,
} from '../services/schoolPeriodProgress';
import { MinutesProgressCircle } from './MinutesProgressCircle';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function toneFor(level: PeriodAlertLevel): 'neutral' | 'approaching' | 'almost' {
  if (level === 'almost') return 'almost';
  if (level === 'approaching') return 'approaching';
  return 'neutral';
}

function alertWording(level: PeriodAlertLevel, source: PeriodAlertSource): string {
  if (level === 'none') return '';
  const head = level === 'almost' ? 'Almost complete' : 'Approaching completion';
  if (!source) return head;
  const tail =
    source === 'both' ? 'based on lessons and minutes'
    : source === 'lessons' ? 'based on lessons'
    : 'based on minutes';
  return `${head} — ${tail}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal sub-components
// ─────────────────────────────────────────────────────────────────────────────

function AlertPill({ level, source, compact = false }: {
  level: PeriodAlertLevel;
  source: PeriodAlertSource;
  compact?: boolean;
}) {
  if (level === 'none') return null;
  const colorCls =
    level === 'almost'
      ? 'bg-red-500/15 text-red-300 ring-red-500/30'
      : 'bg-amber-500/15 text-amber-300 ring-amber-500/30';
  const text = compact
    ? (level === 'almost' ? 'Almost complete' : 'Approaching completion')
    : alertWording(level, source);
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 font-medium leading-none ${colorCls}`}>
      {text}
    </span>
  );
}

/** SVG circle for lesson count (sky/blue accent) — matches MinutesProgressCircle md size. */
function LessonsCircle({ consumed, total }: { consumed: number; total: number }) {
  const px = 96;
  const stroke = 8;
  const radius = (px - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? Math.max(0, Math.min(100, (consumed / total) * 100)) : 0;
  const dashOffset = circumference - (pct / 100) * circumference;
  const cx = px / 2;
  const cy = px / 2;

  return (
    <div className="inline-flex flex-col items-center gap-1 shrink-0">
      <div className="relative" style={{ width: px, height: px }}>
        <svg width={px} height={px} className="-rotate-90">
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#334155" strokeWidth={stroke} />
          <circle
            cx={cx} cy={cy} r={radius} fill="none"
            stroke="#38bdf8"
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 400ms ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
          <span className="text-sm font-bold text-sky-300 tabular-nums">
            {consumed}<span className="text-slate-500 mx-0.5">/</span>{total}
          </span>
        </div>
      </div>
      <span className="text-[11px] text-slate-500 whitespace-nowrap">lessons</span>
    </div>
  );
}

/** Individual enrollment section shown below school-period rows (or standalone for private students) */
function EnrollmentSection({
  enrollment,
  allLessons,
  standalone = false,
  selectedPeriodIds,
  onPeriodToggle,
}: {
  enrollment: Enrollment;
  allLessons: Lesson[];
  standalone?: boolean;
  selectedPeriodIds?: Set<string>;
  onPeriodToggle?: (periodId: string) => void;
}) {
  const synthId = `enroll_${enrollment.id}`;
  const isSelected = !!selectedPeriodIds?.has(synthId);
  const clickable = !!onPeriodToggle;
  const consumedLessons = allLessons.filter(
    l =>
      l.enrollmentId === enrollment.id &&
      (ENROLLMENT_CONSUMED_STATUSES as readonly string[]).includes(l.status)
  );
  const consumed = consumedLessons.length;
  const total = enrollment.totalLessons;
  const dur = enrollment.durationMinutes;
  const consumedMin = consumedLessons.reduce(
    (sum, l) => sum + (l.durationMinutes && l.durationMinutes > 0 ? l.durationMinutes : dur),
    0
  );
  const totalMin = total * dur;
  const label = enrollment.term || enrollment.lessonType || 'Enrollment';

  return (
    <div className={standalone ? '' : 'mt-4 pt-4 border-t border-slate-800/60'}>
      {!standalone && (
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Individual Enrollment
        </p>
      )}
      <div
        onClick={clickable ? () => onPeriodToggle!(synthId) : undefined}
        className={`flex items-center gap-4 py-2 rounded-xl transition-all
          ${clickable ? 'cursor-pointer hover:bg-slate-800/60 px-3 -mx-3' : ''}
          ${isSelected ? 'ring-2 ring-primary-500/60 bg-primary-500/10 px-3 -mx-3 shadow-lg shadow-primary-500/10' : ''}
        `}
      >
        {/* Minutes circle */}
        <MinutesProgressCircle
          current={consumedMin}
          total={totalMin}
          label="min taught"
          size="md"
          tone="neutral"
        />
        {/* Lessons circle */}
        <LessonsCircle consumed={consumed} total={total} />
        {/* Right side info */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-white">{label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20 font-medium leading-none">
              Active
            </span>
          </div>
          <p className="text-xs text-slate-400 tabular-nums">
            <span className="text-slate-500">{totalMin - consumedMin} min left</span>
            <span className="text-slate-700 mx-2">·</span>
            <span className="text-slate-500">
              {total - consumed} lesson{(total - consumed) !== 1 ? 's' : ''} left
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function PeriodRow({
  p, showAlert, isSelected, onClick, enrollmentCompleted,
}: {
  p: PeriodProgress;
  showAlert: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  /** True when the linked enrollment record is marked completed/cancelled */
  enrollmentCompleted?: boolean;
}) {
  const label = p.period.term
    ? `${p.period.term}${p.period.academicYear ? ` · ${p.period.academicYear}` : ''}`
    : p.period.name;

  // Treat as "done" if the enrollment was explicitly completed, even if date is still current
  const effectivelyActive = p.isCurrent && !enrollmentCompleted;
  const tone = effectivelyActive ? toneFor(p.alertLevel) : 'neutral';

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 py-4 rounded-xl transition-all
        ${onClick ? 'cursor-pointer hover:bg-slate-800/60 px-3 -mx-3' : ''}
        ${isSelected ? 'ring-2 ring-primary-500/60 bg-primary-500/10 px-3 -mx-3 shadow-lg shadow-primary-500/10' : ''}
        ${effectivelyActive ? '' : 'opacity-75'}
      `}
    >
      {/* Primary visual — minutes circle */}
      <MinutesProgressCircle
        current={p.consumedMinutes}
        total={p.totalMinutes}
        label="min taught"
        size="md"
        tone={tone}
      />

      {/* Secondary visual — lessons circle */}
      <LessonsCircle consumed={p.consumedLessons} total={p.totalLessons} />

      {/* Right side — period info + alert */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-sm font-medium ${effectivelyActive ? 'text-white' : 'text-slate-300'}`}>
            {label}
          </span>
          {effectivelyActive && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20 font-medium leading-none">
              Current
            </span>
          )}
          {enrollmentCompleted && p.isCurrent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/20 font-medium leading-none">
              Completed
            </span>
          )}
          {p.isPast && !p.isCurrent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/60 text-slate-500 ring-1 ring-white/5 font-medium leading-none">
              Past
            </span>
          )}
          {p.period.status === 'archived' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/60 text-slate-500 ring-1 ring-white/5 font-medium leading-none">
              Archived
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-600">
          {fmtDate(p.period.startDate)} → {fmtDate(p.period.endDate)}
        </p>
        <p className="text-xs text-slate-400 tabular-nums">
          <span className="text-slate-500">{p.remainingMinutes} min left</span>
          <span className="text-slate-700 mx-2">·</span>
          <span className="text-slate-500">{p.remainingLessons} lesson{p.remainingLessons !== 1 ? 's' : ''} left</span>
        </p>
        {showAlert && effectivelyActive && p.alertLevel !== 'none' && (
          <div className="pt-0.5">
            <AlertPill level={p.alertLevel} source={p.alertSource} />
          </div>
        )}
        {isSelected && (
          <div className="pt-0.5">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-300 ring-1 ring-primary-500/30 font-medium leading-none">
              Filtering lessons ↓
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  student: Student;
  allLessons: Lesson[];
  allEnrollments?: Enrollment[];
  schoolEnrollmentPeriods: SchoolEnrollmentPeriod[];
  school?: School;
  /** ISO 'YYYY-MM-DD' — defaults to today when omitted */
  today?: string;
  /** Current user's role — only admin sees the alert pill/banner */
  viewerRole?: Role;
  /** Highlights every period/enrollment row whose id is in this set */
  selectedPeriodIds?: Set<string>;
  /** Called with the period id when a row is clicked; toggles membership */
  onPeriodToggle?: (periodId: string) => void;
}

export const SchoolPeriodProgressCard: React.FC<Props> = ({
  student,
  allLessons,
  allEnrollments,
  schoolEnrollmentPeriods,
  school,
  today: todayProp,
  viewerRole,
  selectedPeriodIds,
  onPeriodToggle,
}) => {
  const today = todayProp ?? new Date().toISOString().slice(0, 10);

  const showAlert = viewerRole === Role.ADMIN;

  // Active individual enrollment (current = active/paused + endDate >= today)
  // Exclude enrollments linked to a school period — those are already shown in the period rows
  const activeEnrollment = allEnrollments
    ? allEnrollments
        .filter(e => e.studentId === student.id && !e.schoolPeriodId && isCurrentEnrollment(e, today))
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    : null;

  // Non-school students: show only enrollment card (or nothing)
  if (!student.schoolId) {
    if (!activeEnrollment) return null;
    return (
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
          Enrollment Progress
        </p>
        <EnrollmentSection enrollment={activeEnrollment} allLessons={allLessons} selectedPeriodIds={selectedPeriodIds} onPeriodToggle={onPeriodToggle} standalone />
      </div>
    );
  }

  const schoolPeriods = schoolEnrollmentPeriods.filter(
    p => p.schoolId === student.schoolId
  );

  // ── Case A: school has no periods configured ─────────────────────────────
  if (schoolPeriods.length === 0) {
    return (
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Enrollment Progress
        </p>
        <p className="text-sm text-slate-500">
          No school periods configured
          {school ? ` for ${school.name}` : ''}.
        </p>
        {activeEnrollment && (
          <EnrollmentSection enrollment={activeEnrollment} allLessons={allLessons} selectedPeriodIds={selectedPeriodIds} onPeriodToggle={onPeriodToggle} />
        )}
      </div>
    );
  }

  const relevant = getRelevantPeriodsForStudent(
    student,
    schoolEnrollmentPeriods,
    allLessons,
    today,
    allEnrollments
  );

  // Current-period-level alert for banner (admin only, only current period)
  const currentRelevant = relevant.find(p => p.isCurrent);

  // ── Case B: periods exist but student has no consumed lessons yet ─────────
  if (relevant.length === 0) {
    // Try to show current period at 0/total (all zeros through helper)
    const currentPeriod = schoolPeriods.find(
      p =>
        p.status !== 'archived' &&
        today >= p.startDate &&
        today <= p.endDate
    );

    return (
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Enrollment Progress
          </p>
          {school && (
            <span className="text-[11px] text-slate-600">{school.name}</span>
          )}
        </div>

        {currentPeriod ? (
          <PeriodRow
            p={{
              ...getSchoolPeriodProgress(student, currentPeriod, allLessons,
                allEnrollments ? allEnrollments.find(e =>
                  e.studentId === student.id && e.isDurationOverride && e.status !== 'cancelled' &&
                  (e.schoolPeriodId === currentPeriod.id || (e.startDate === currentPeriod.startDate && e.schoolId === currentPeriod.schoolId))
                )?.durationMinutes : undefined,
                undefined,
                allEnrollments
              ),
              isCurrent: true,
              isPast: false,
              isUpcoming: false,
            }}
            showAlert={showAlert}
          />
        ) : (
          <p className="text-sm text-slate-500 mt-3">
            No lessons recorded yet for any school period.
          </p>
        )}
        {activeEnrollment && (
          <EnrollmentSection enrollment={activeEnrollment} allLessons={allLessons} selectedPeriodIds={selectedPeriodIds} onPeriodToggle={onPeriodToggle} />
        )}
      </div>
    );
  }

  // ── Normal case: one or more relevant periods ─────────────────────────────
  return (
    <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Enrollment Progress
        </p>
        {school && (
          <span className="text-[11px] text-slate-600">{school.name}</span>
        )}
      </div>

      {/* Admin banner — current period in alert band (skip if enrollment is completed) */}
      {showAlert && currentRelevant && currentRelevant.alertLevel !== 'none' && (() => {
        const currentLinked = allEnrollments?.find(
          e => e.studentId === student.id && e.schoolPeriodId === currentRelevant.period.id
        );
        const currentCompleted = currentLinked?.status === 'completed' || currentLinked?.status === 'cancelled';
        if (currentCompleted) return null;
        return (
          <div className="mt-2 mb-1">
            <AlertPill level={currentRelevant.alertLevel} source={currentRelevant.alertSource} />
          </div>
        );
      })()}

      <div className="divide-y divide-slate-800/60">
        {relevant.map(p => {
          const linkedEnrollment = allEnrollments?.find(
            e => e.studentId === student.id && e.schoolPeriodId === p.period.id
          );
          const enrollmentCompleted =
            linkedEnrollment?.status === 'completed' || linkedEnrollment?.status === 'cancelled';
          return (
            <React.Fragment key={p.period.id}>
              <PeriodRow
                p={p}
                showAlert={showAlert}
                isSelected={!!selectedPeriodIds?.has(p.period.id)}
                enrollmentCompleted={enrollmentCompleted}
                onClick={onPeriodToggle
                  ? () => onPeriodToggle(p.period.id)
                  : undefined
                }
              />
            </React.Fragment>
          );
        })}
      </div>

      {/* Individual enrollment section (below school-period rows) */}
      {activeEnrollment && (
        <EnrollmentSection enrollment={activeEnrollment} allLessons={allLessons} selectedPeriodIds={selectedPeriodIds} onPeriodToggle={onPeriodToggle} />
      )}
    </div>
  );
};
