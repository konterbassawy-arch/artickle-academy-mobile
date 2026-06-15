/**
 * ParentEnrollments — Phase 17.5
 *
 * Parent enrollment view showing:
 * - Enrollments for all linked children (studentId ∈ childIds)
 * - Progress (consumed/remaining) per enrollment
 * - Pricing shown ONLY when payerType === 'parent'
 * - No admin notes, no createdBy
 *
 * Data is Firestore-filtered at query level (AppContext) + client-stripped as secondary safety.
 */

import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Enrollment,
  EnrollmentStatus,
  Role,
  getEnrollmentRemaining
} from '../../types';

const STATUS_COLORS: Record<EnrollmentStatus, string> = {
  [EnrollmentStatus.ACTIVE]:    'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
  [EnrollmentStatus.COMPLETED]: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
  [EnrollmentStatus.PAUSED]:    'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
  [EnrollmentStatus.CANCELLED]: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20',
};

const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  [EnrollmentStatus.ACTIVE]:    'Active',
  [EnrollmentStatus.COMPLETED]: 'Completed',
  [EnrollmentStatus.PAUSED]:    'Paused',
  [EnrollmentStatus.CANCELLED]: 'Cancelled',
};

const progressBarColor = (pct: number) =>
  pct >= 100 ? 'bg-blue-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

export const ParentEnrollments: React.FC = () => {
  const { currentUser, enrollments, lessons, students, parents, formatCurrency } = useApp();

  if (currentUser?.role !== Role.PARENT) {
    return <div className="text-red-500 text-sm">Access denied.</div>;
  }

  const parentDoc = parents.find(p => p.id === currentUser?.id);
  const childIds = parentDoc?.childIds || [];

  // Enrollments already Firestore-filtered to studentId ∈ childIds
  // Secondary safety: verify studentId is in childIds
  const myEnrollments = useMemo(() =>
    enrollments.filter(e => childIds.includes(e.studentId)),
    [enrollments, childIds]
  );

  // Group by child
  const byChild = useMemo(() => {
    const map: Record<string, Enrollment[]> = {};
    for (const e of myEnrollments) {
      if (!map[e.studentId]) map[e.studentId] = [];
      map[e.studentId].push(e);
    }
    return map;
  }, [myEnrollments]);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Enrollments</h1>
        <p className="text-slate-500 text-sm mt-1">
          Course packages for your {Object.keys(byChild).length > 1 ? 'children' : 'child'}
        </p>
      </div>

      {myEnrollments.length === 0 ? (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-10 text-center">
          <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-slate-500 text-sm">No enrollments found.</p>
          <p className="text-slate-600 text-xs mt-1">Active course packages will appear here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {(Object.entries(byChild) as [string, Enrollment[]][]).map(([studentId, enrolls]) => {
            const child = students.find(s => s.id === studentId);
            if (!child) return null; // Safe fallback: skip if no matching student

            const activeCount = enrolls.filter(e => e.status === EnrollmentStatus.ACTIVE).length;

            return (
              <div key={studentId}>
                {/* Child section header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-primary-600/15 text-primary-300 flex items-center justify-center font-bold text-sm ring-1 ring-primary-500/25">
                    {child.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">{child.name}</h2>
                    <p className="text-xs text-slate-500 mt-0.5 capitalize">
                      {child.instrument}
                      {activeCount > 0 && (
                        <span className="ml-2 text-emerald-400">{activeCount} active</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Enrollment cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {enrolls.map(enrollment => {
                    const { consumed, remaining } = getEnrollmentRemaining(enrollment, lessons);
                    const progress = enrollment.totalLessons > 0
                      ? Math.round((consumed / enrollment.totalLessons) * 100)
                      : 0;
                    // Price visible ONLY for parent-payer enrollments (already stripped in AppContext, but double-check)
                    const showPrice = enrollment.payerType === 'parent' && enrollment.priceExpected != null;

                    return (
                      <div key={enrollment.id} className="bg-slate-900/60 ring-1 ring-white/5 rounded-xl p-4">
                        {/* Card header */}
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="text-white font-medium text-sm capitalize">{enrollment.instrument}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {enrollment.teacherName}
                              <span className="mx-1 text-slate-700">·</span>
                              {enrollment.lessonType}
                              <span className="mx-1 text-slate-700">·</span>
                              {enrollment.durationMinutes}min
                            </p>
                            {enrollment.deliveryMode && (
                              <p className="text-xs text-slate-500 capitalize mt-0.5">
                                {enrollment.deliveryMode.replace('_', ' ')}
                              </p>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[enrollment.status]}`}>
                            {STATUS_LABELS[enrollment.status]}
                          </span>
                        </div>

                        {/* Progress */}
                        <div className="mb-3">
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-slate-400 tabular-nums">{consumed} of {enrollment.totalLessons} lessons</span>
                            <span className="text-slate-500 tabular-nums">{remaining} left</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${progressBarColor(progress)}`}
                              style={{ width: `${Math.min(100, progress)}%` }}
                            />
                          </div>
                          <div className="text-right mt-1">
                            <span className="text-[10px] text-slate-600 tabular-nums">{progress}%</span>
                          </div>
                        </div>

                        {/* Price — parent-payer only */}
                        {showPrice && (
                          <div className="pt-2 border-t border-slate-800/60">
                            <span className="text-xs text-slate-500">Package price: </span>
                            <span className="text-sm text-white font-semibold tabular-nums">
                              {formatCurrency(enrollment.priceExpected!)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
