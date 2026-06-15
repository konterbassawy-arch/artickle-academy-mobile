/**
 * EnrollmentBadge — Phase 19.6D3+D4
 *
 * Shared read-only enrollment display components used across student list
 * pages and student detail pages.
 *
 * Exports:
 *   EnrollmentListBadge   — compact inline pill for table rows / grid cards
 *   EnrollmentDetailSection — full current + historical enrollment cards for
 *                             use in renderAfterSummary on detail pages
 */

import React from 'react';
import {
  Enrollment,
  EnrollmentStatus,
  Role,
  isCurrentEnrollment,
  isHistoricalEnrollment,
  getEnrollmentRemaining,
  getCurrentEnrollmentsForStudent,
  getTodayISO,
} from '../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Sort comparator: endDate DESC → startDate DESC → createdAt DESC */
function sortHistoricalDesc(a: Enrollment, b: Enrollment): number {
  const endCmp = (b.endDate ?? '').localeCompare(a.endDate ?? '');
  if (endCmp !== 0) return endCmp;
  const startCmp = (b.startDate ?? '').localeCompare(a.startDate ?? '');
  if (startCmp !== 0) return startCmp;
  return b.createdAt - a.createdAt;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function statusColor(status: EnrollmentStatus): string {
  switch (status) {
    case EnrollmentStatus.ACTIVE:    return 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20';
    case EnrollmentStatus.PAUSED:    return 'bg-amber-500/15 text-amber-400 ring-amber-500/20';
    case EnrollmentStatus.COMPLETED: return 'bg-blue-500/15 text-blue-400 ring-blue-500/20';
    case EnrollmentStatus.CANCELLED: return 'bg-red-500/15 text-red-400 ring-red-500/20';
    default:                         return 'bg-slate-700/40 text-slate-400 ring-slate-600/20';
  }
}

// ─── EnrollmentListBadge ──────────────────────────────────────────────────────

interface EnrollmentListBadgeProps {
  studentId: string;
  enrollments: Enrollment[];
  lessons: { enrollmentId?: string; status: string }[];
}

/**
 * Compact inline badge for student list rows/cards.
 * Shows the first current enrollment summary, or a "no enrollment" state.
 */
export const EnrollmentListBadge: React.FC<EnrollmentListBadgeProps> = ({
  studentId,
  enrollments,
  lessons,
}) => {
  const today = getTodayISO();
  const current = getCurrentEnrollmentsForStudent(studentId, enrollments, today);

  if (current.length > 0) {
    // Show first current enrollment — term + consumed/total
    const enr = current[0];
    const { consumed, remaining } = getEnrollmentRemaining(enr, lessons);
    const total = enr.totalLessons;
    const used = consumed;
    const label = enr.term
      ? `${enr.term} · ${used} / ${total}`
      : `${used} / ${total} lessons`;
    const extraCount = current.length > 1 ? current.length - 1 : 0;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          {label}
        </span>
        {extraCount > 0 && (
          <span className="text-[10px] text-slate-500">+{extraCount}</span>
        )}
      </span>
    );
  }

  // Check for historical only
  const hasHistorical = enrollments.some(
    e => e.studentId === studentId && isHistoricalEnrollment(e, today)
  );

  if (hasHistorical) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-500/80 ring-1 ring-amber-500/15 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0" />
        No active enrollment
      </span>
    );
  }

  return null;
};

// ─── EnrollmentDetailSection ──────────────────────────────────────────────────

interface EnrollmentDetailSectionProps {
  studentId: string;
  enrollments: Enrollment[];
  lessons: { enrollmentId?: string; status: string }[];
  role: Role;
  /** For school_admin: only show enrollments matching this schoolId */
  schoolId?: string;
  /** For teacher: only show enrollments matching this teacherId */
  teacherId?: string;
  /** Show payer / billing fields (admin only) */
  showFinancials?: boolean;
}

/**
 * Full current + historical enrollment section for student detail pages.
 * Renders via renderAfterSummary on StudentReportCore.
 */
export const EnrollmentDetailSection: React.FC<EnrollmentDetailSectionProps> = ({
  studentId,
  enrollments,
  lessons,
  role,
  schoolId,
  teacherId,
  showFinancials = false,
}) => {
  const today = getTodayISO();

  // Apply role-scoped filter
  let scoped = enrollments.filter(e => e.studentId === studentId);
  if (role === Role.SCHOOL_ADMIN && schoolId) {
    scoped = scoped.filter(e => e.schoolId === schoolId);
  } else if (role === Role.TEACHER && teacherId) {
    scoped = scoped.filter(e => e.teacherId === teacherId);
  }

  const current  = scoped.filter(e => isCurrentEnrollment(e, today));
  const historical = scoped
    .filter(e => isHistoricalEnrollment(e, today))
    .slice()
    .sort(sortHistoricalDesc);

  return (
    <div className="space-y-5">
      {/* ── Current Enrollments ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-white">
            Current Enrollments
          </h3>
          {current.length > 0 && (
            <span className="text-xs text-slate-500 font-medium">
              {current.length} active
            </span>
          )}
        </div>

        {current.length === 0 ? (
          <div className="bg-slate-900/40 ring-1 ring-white/5 rounded-xl p-5 text-center">
            <p className="text-slate-500 text-sm">No active enrollment for this student.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {current.map(enr => (
              <CurrentEnrollmentCard
                key={enr.id}
                enrollment={enr}
                lessons={lessons}
                showFinancials={showFinancials}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Previous Enrollments ── */}
      <div>
        <h3 className="text-base font-semibold text-white mb-3">
          Previous Enrollments
        </h3>

        {historical.length === 0 ? (
          <div className="bg-slate-900/40 ring-1 ring-white/5 rounded-xl p-5 text-center">
            <p className="text-slate-500 text-sm">No previous enrollments.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {historical.map(enr => (
              <HistoricalEnrollmentRow
                key={enr.id}
                enrollment={enr}
                lessons={lessons}
                showFinancials={showFinancials}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── CurrentEnrollmentCard ────────────────────────────────────────────────────

interface CardProps {
  enrollment: Enrollment;
  lessons: { enrollmentId?: string; status: string }[];
  showFinancials: boolean;
}

const CurrentEnrollmentCard: React.FC<CardProps> = ({ enrollment, lessons, showFinancials }) => {
  const { consumed, remaining } = getEnrollmentRemaining(enrollment, lessons);
  const total = enrollment.totalLessons;
  const pct = total > 0 ? Math.round((consumed / total) * 100) : 0;

  // Hide the lesson progress bar when this enrollment is linked to a school period —
  // the SchoolPeriodProgressCard above already shows the same data with circles.
  // For private/custom enrollments (no schoolPeriodId) keep the bar — it's the only place progress is shown.
  const showProgressBar = !enrollment.schoolPeriodId;

  const progressBarColor =
    remaining === 0
      ? 'bg-red-500'
      : remaining <= 2
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <div className="bg-slate-900/60 ring-1 ring-white/8 rounded-xl p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white truncate">{enrollment.instrument}</p>
            {enrollment.term && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-300 ring-1 ring-primary-500/20 font-medium">
                {enrollment.term}
              </span>
            )}
            {enrollment.academicYear && (
              <span className="text-[11px] text-slate-500">{enrollment.academicYear}</span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center flex-wrap gap-x-1">
            <span>{enrollment.lessonType} · {enrollment.durationMinutes}min</span>
            {enrollment.isDurationOverride && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20 font-medium">
                Duration override
              </span>
            )}
            <span>· {enrollment.deliveryMode}</span>
            {enrollment.schoolName && <span>· {enrollment.schoolName}</span>}
          </p>
        </div>
        <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium ring-1 ${statusColor(enrollment.status)}`}>
          {enrollment.status}
        </span>
      </div>

      {/* Progress bar — only for private/custom enrollments not linked to a school period */}
      {showProgressBar && (
        <div>
          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
            <span>{consumed} of {total} lessons used</span>
            <span className={remaining <= 2 ? 'text-amber-400 font-medium' : 'text-slate-400'}>
              {remaining} remaining
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all ${progressBarColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Dates + teacher row */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
        {enrollment.startDate && (
          <span>Start: <span className="text-slate-400">{fmtDate(enrollment.startDate)}</span></span>
        )}
        {enrollment.endDate && (
          <span>End: <span className="text-slate-400">{fmtDate(enrollment.endDate)}</span></span>
        )}
        <span>Teacher: <span className="text-slate-400">{enrollment.teacherName}</span></span>
        {showFinancials && (
          <>
            <span>Payer: <span className="text-slate-400 capitalize">{enrollment.payerType}</span></span>
            <span>Billing: <span className="text-slate-400">{enrollment.billingStatus}</span></span>
            {enrollment.priceExpected != null && (
              <span>Price: <span className="text-slate-400">${enrollment.priceExpected}</span></span>
            )}
          </>
        )}
      </div>

      {/* Notes */}
      {enrollment.notes && (
        <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-800/40">
          {enrollment.notes}
        </p>
      )}
    </div>
  );
};

// ─── HistoricalEnrollmentRow ──────────────────────────────────────────────────

interface RowProps {
  enrollment: Enrollment;
  lessons: { enrollmentId?: string; status: string }[];
  showFinancials: boolean;
}

const HistoricalEnrollmentRow: React.FC<RowProps> = ({ enrollment, lessons, showFinancials }) => {
  const { consumed } = getEnrollmentRemaining(enrollment, lessons);

  return (
    <div className="bg-slate-900/40 ring-1 ring-white/5 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {/* Status badge */}
      <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium ring-1 ${statusColor(enrollment.status)}`}>
        {enrollment.status}
      </span>

      {/* Instrument + term */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm text-slate-300 font-medium truncate">{enrollment.instrument}</span>
        {enrollment.term && (
          <span className="text-[11px] text-slate-500">{enrollment.term}</span>
        )}
        {enrollment.academicYear && (
          <span className="text-[11px] text-slate-600">{enrollment.academicYear}</span>
        )}
      </div>

      {/* Lessons consumed */}
      <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">
        {consumed} / {enrollment.totalLessons} lessons
      </span>

      {/* Dates */}
      <span className="text-[11px] text-slate-600 shrink-0">
        {fmtDate(enrollment.startDate)} — {fmtDate(enrollment.endDate)}
      </span>

      {/* Teacher */}
      <span className="text-[11px] text-slate-600 shrink-0">
        {enrollment.teacherName}
      </span>

      {/* Financials (admin only) */}
      {showFinancials && (
        <span className="text-[11px] text-slate-600 shrink-0 capitalize">
          {enrollment.payerType}
          {enrollment.priceExpected != null && ` · $${enrollment.priceExpected}`}
        </span>
      )}
    </div>
  );
};
