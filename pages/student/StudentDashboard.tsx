/**
 * StudentDashboard — Phase 11
 *
 * Student home page showing:
 * - Own lesson stats
 * - Progress averages
 * - Recent lessons
 *
 * Privacy rules:
 * - NO notes (private teacher notes) — stripped in AppContext
 * - NO financial data — stripped in AppContext
 * - YES learning, interactivity, behavior
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { LessonStatus, EnrollmentStatus, getEnrollmentRemaining } from '../../types';

export const StudentDashboard: React.FC = () => {
  const { students, lessons, enrollments, currentUser } = useApp();
  const navigate = useNavigate();

  // Find this student's record (matched by uid)
  const myStudent = students.find(s => s.uid === currentUser?.id);

  // My lessons — already filtered in AppContext for student role
  const myLessons = lessons;
  const completedLessons = myLessons.filter(
    l => l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT
  );

  const stats = useMemo(() => {
    const interactivity = completedLessons.filter(l => l.interactivity != null).map(l => l.interactivity!);
    const behavior = completedLessons.filter(l => l.behavior != null).map(l => l.behavior!);
    return {
      totalLessons: myLessons.length,
      completedLessons: completedLessons.length,
      totalHours: (completedLessons.reduce((sum, l) => sum + (l.durationMinutes || 60), 0) / 60).toFixed(1),
      avgInteractivity: interactivity.length ? (interactivity.reduce((a, b) => a + b, 0) / interactivity.length).toFixed(1) : '-',
      avgBehavior: behavior.length ? (behavior.reduce((a, b) => a + b, 0) / behavior.length).toFixed(1) : '-',
    };
  }, [myLessons, completedLessons]);

  // Recent 5 lessons
  const recentLessons = myLessons.slice(0, 5);

  const statusBadge = (status: string) => {
    const cls = status === LessonStatus.PRESENT || status === LessonStatus.TAUGHT
      ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
      : status === LessonStatus.CANCELLED
        ? 'bg-red-500/15 text-red-400 ring-red-500/20'
        : 'bg-amber-500/15 text-amber-400 ring-amber-500/20';
    return <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ring-1 ${cls}`}>{status}</span>;
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-white">
          Welcome{myStudent ? `, ${myStudent.name}` : ''}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {myStudent?.instrument ? `${myStudent.instrument} Student` : 'Your learning dashboard'}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Lessons', value: stats.totalLessons, color: 'text-white' },
          { label: 'Completed', value: stats.completedLessons, color: 'text-emerald-400' },
          { label: 'Hours Learned', value: `${stats.totalHours}h`, color: 'text-white' },
          { label: 'Avg Effort', value: `${stats.avgInteractivity}/5`, color: 'text-blue-400' },
          { label: 'Avg Practice', value: `${stats.avgBehavior}/5`, color: 'text-violet-400' },
        ].map(card => (
          <div key={card.label} className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition-colors">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Phase 17.5: Enrollment progress (no pricing, no billing info) */}
      {enrollments.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-white mb-3">My Enrollments</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {enrollments
              .filter(e => e.status === EnrollmentStatus.ACTIVE || e.status === EnrollmentStatus.PAUSED)
              .map(enrollment => {
                const { consumed, remaining } = getEnrollmentRemaining(enrollment, lessons);
                const progress = enrollment.totalLessons > 0
                  ? Math.round((consumed / enrollment.totalLessons) * 100)
                  : 0;
                return (
                  <div key={enrollment.id} className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-white font-semibold text-sm">{enrollment.instrument}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {enrollment.teacherName} &middot; {enrollment.lessonType} &middot; {enrollment.durationMinutes}min
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ring-1 ${
                        enrollment.status === EnrollmentStatus.ACTIVE
                          ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
                          : 'bg-amber-500/15 text-amber-400 ring-amber-500/20'
                      }`}>
                        {enrollment.status === EnrollmentStatus.ACTIVE ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mb-2">
                      <span>{consumed} of {enrollment.totalLessons} lessons</span>
                      <span className="text-slate-500">{remaining} remaining</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          progress >= 100 ? 'bg-blue-500' : progress >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, progress)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Recent lessons */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold text-white">Recent Lessons</h3>
          {myLessons.length > 5 && (
            <button onClick={() => navigate('/student/lessons')}
              className="text-xs text-primary-400 hover:text-primary-300 font-medium">
              View All &rarr;
            </button>
          )}
        </div>

        {recentLessons.length === 0 ? (
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-10 text-center">
            <p className="text-slate-500 text-sm">No lessons recorded yet. Your lesson history will appear here after your first lesson.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentLessons.map(lesson => (
              <div key={lesson.id}
                className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-medium text-sm">
                      {new Date(lesson.date).toLocaleDateString('en-US', {
                        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                      })}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {lesson.schoolName} &middot; {lesson.teacherName} &middot; {lesson.durationMinutes}min
                    </p>
                  </div>
                  {statusBadge(lesson.status)}
                </div>

                {(lesson.interactivity || lesson.behavior || lesson.learning) && (
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <div className="flex gap-4 mb-1.5">
                      {lesson.interactivity != null && (
                        <span className="text-xs text-slate-500">Interactivity: <span className="text-blue-400 font-semibold">{lesson.interactivity}/5</span></span>
                      )}
                      {lesson.behavior != null && (
                        <span className="text-xs text-slate-500">Behavior: <span className="text-violet-400 font-semibold">{lesson.behavior}/5</span></span>
                      )}
                    </div>
                    {lesson.learning && (
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{lesson.learning}</p>
                    )}
                    {/* Phase 13: expanded fields */}
                    {(lesson.repertoire || lesson.practiceAssignment) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                        {lesson.repertoire && (
                          <span className="text-xs text-slate-500">Piece: <span className="text-slate-300">{lesson.repertoire}</span></span>
                        )}
                        {lesson.practiceAssignment && (
                          <span className="text-xs text-slate-500">Homework: <span className="text-slate-300 line-clamp-1">{lesson.practiceAssignment}</span></span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
