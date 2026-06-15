/**
 * ParentDashboard — Phase 11
 *
 * Parent home page showing:
 * - Linked children list
 * - Recent lessons per child
 * - Progress summaries (interactivity, behavior averages)
 *
 * Privacy rules:
 * - NO notes (private teacher notes)
 * - NO financial data (schoolRate, teacherRate)
 * - YES learning, interactivity, behavior
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { LessonStatus } from '../../types';

const statusBadge = (status: string) => {
  if (status === LessonStatus.PRESENT || status === LessonStatus.TAUGHT)
    return 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20';
  if (status === LessonStatus.CANCELLED)
    return 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20';
  return 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20';
};

export const ParentDashboard: React.FC = () => {
  const { students, lessons, parents, currentUser } = useApp();
  const navigate = useNavigate();

  // Get this parent's linked children
  const parentDoc = parents.find(p => p.id === currentUser?.id);
  const childIds = parentDoc?.childIds || [];
  const children = students.filter(s => childIds.includes(s.id));

  // Summary stats per child
  const childSummaries = useMemo(() => {
    return children.map(child => {
      const childLessons = lessons.filter(l =>
        l.studentIds?.includes(child.id)
      );
      const completedLessons = childLessons.filter(
        l => l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT
      );

      // Average interactivity and behavior from completed lessons
      const interactivityScores = completedLessons
        .filter(l => l.interactivity != null)
        .map(l => l.interactivity!);
      const behaviorScores = completedLessons
        .filter(l => l.behavior != null)
        .map(l => l.behavior!);

      const avgInteractivity = interactivityScores.length > 0
        ? (interactivityScores.reduce((a, b) => a + b, 0) / interactivityScores.length).toFixed(1)
        : '-';
      const avgBehavior = behaviorScores.length > 0
        ? (behaviorScores.reduce((a, b) => a + b, 0) / behaviorScores.length).toFixed(1)
        : '-';

      // Most recent lesson
      const recentLesson = childLessons[0]; // already sorted by date desc in AppContext

      return {
        child,
        totalLessons: childLessons.length,
        completedLessons: completedLessons.length,
        avgInteractivity,
        avgBehavior,
        recentLesson,
      };
    });
  }, [children, lessons]);

  if (children.length === 0) {
    return (
      <div className="text-center py-24">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/60 ring-1 ring-white/5 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Welcome, {currentUser?.name}!</h2>
        <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
          No children have been linked to your account yet. Please contact the academy administrator to link your children.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">My Children</h1>
        <p className="text-slate-500 text-sm mt-1">
          {children.length} {children.length === 1 ? 'child' : 'children'} linked to your account
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {childSummaries.map(({ child, totalLessons, completedLessons, avgInteractivity, avgBehavior, recentLesson }) => (
          <div
            key={child.id}
            className="bg-slate-900/60 rounded-2xl ring-1 ring-white/5 p-5 hover:ring-primary-500/30 hover:bg-slate-900/80 transition-all cursor-pointer group"
            onClick={() => navigate(`/parent/child/${child.id}`)}
          >
            {/* Child header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl bg-primary-600/15 text-primary-300 flex items-center justify-center font-bold text-base ring-1 ring-primary-500/25">
                {child.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-white font-semibold leading-tight">{child.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5 capitalize">{child.instrument}</p>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <div className="bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Lessons</p>
                <p className="text-xl font-bold text-white tabular-nums">{totalLessons}</p>
              </div>
              <div className="bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Completed</p>
                <p className="text-xl font-bold text-emerald-400 tabular-nums">{completedLessons}</p>
              </div>
              <div className="bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Avg Effort</p>
                <p className="text-xl font-bold text-blue-400 tabular-nums">{avgInteractivity}<span className="text-xs font-normal text-slate-600">/5</span></p>
              </div>
              <div className="bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Avg Practice</p>
                <p className="text-xl font-bold text-purple-400 tabular-nums">{avgBehavior}<span className="text-xs font-normal text-slate-600">/5</span></p>
              </div>
            </div>

            {/* Recent lesson */}
            {recentLesson && (
              <div className="bg-slate-800/40 ring-1 ring-white/5 rounded-xl p-3 mb-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Latest Lesson</p>
                <div className="flex justify-between items-center gap-2">
                  <p className="text-sm text-slate-300 truncate">
                    {new Date(recentLesson.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    <span className="text-slate-600 mx-1">·</span>
                    {recentLesson.schoolName}
                  </p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusBadge(recentLesson.status)}`}>
                    {recentLesson.status}
                  </span>
                </div>
                {recentLesson.learning && (
                  <p className="text-xs text-slate-500 mt-1.5 line-clamp-1">{recentLesson.learning}</p>
                )}
              </div>
            )}

            {/* CTA */}
            <div className="flex items-center justify-end gap-1 text-xs text-primary-400 group-hover:text-primary-300 transition-colors font-medium">
              View Progress
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
