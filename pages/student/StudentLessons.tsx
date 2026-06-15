/**
 * StudentLessons — Phase 11
 *
 * Full lesson history for the logged-in student.
 * Same privacy rules as StudentDashboard:
 * - NO notes, NO rates
 * - YES learning, interactivity, behavior
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { LessonStatus, DeliveryMode, getDeliveryMode } from '../../types';

export const StudentLessons: React.FC = () => {
  const { lessons } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredLessons = useMemo(() => {
    let result = [...lessons]; // already filtered to self in AppContext

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.schoolName.toLowerCase().includes(q) ||
        l.teacherName.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(l => l.status === statusFilter);
    }

    return result;
  }, [lessons, search, statusFilter]);

  const statusBadge = (status: string) => {
    const cls = status === LessonStatus.PRESENT || status === LessonStatus.TAUGHT
      ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
      : status === LessonStatus.CANCELLED
        ? 'bg-red-500/15 text-red-400 ring-red-500/20'
        : 'bg-amber-500/15 text-amber-400 ring-amber-500/20';
    return <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ring-1 ${cls}`}>{status}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-white">My Lessons</h2>
        <p className="text-sm text-slate-500 mt-1">Full lesson history and progress</p>
      </div>

      {/* Filters toolbar */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by school, teacher, or ID..."
            className="w-full bg-slate-900/60 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 placeholder:text-slate-600"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500/50"
        >
          <option value="all">All Statuses</option>
          <option value={LessonStatus.PRESENT}>Present</option>
          <option value={LessonStatus.TAUGHT}>Taught</option>
          <option value={LessonStatus.ABSENT_EXCUSED}>Absent (Excused)</option>
          <option value={LessonStatus.ABSENT_UNEXCUSED}>Absent (Unexcused)</option>
          <option value={LessonStatus.CANCELLED}>Cancelled</option>
        </select>
      </div>

      {/* Results count */}
      <p className="text-xs text-slate-600 font-medium">
        {filteredLessons.length} lesson{filteredLessons.length !== 1 ? 's' : ''} found
      </p>

      {/* Lesson list */}
      {filteredLessons.length === 0 ? (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-10 text-center">
          <p className="text-slate-500 text-sm">No lessons match your filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLessons.map(lesson => (
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
                    {lesson.schoolName} &middot; {lesson.teacherName} &middot; {lesson.durationMinutes}min {lesson.type}
                    {getDeliveryMode(lesson) === DeliveryMode.ONLINE && <span className="ml-1 text-blue-400">&middot; Online</span>}
                  </p>
                </div>
                {statusBadge(lesson.status)}
              </div>

              {(lesson.interactivity || lesson.behavior || lesson.learning) && (
                <div className="mt-3 pt-3 border-t border-slate-800">
                  <div className="flex gap-4 mb-1.5">
                    {lesson.interactivity != null && (
                      <span className="text-xs text-slate-500">
                        Interactivity: <span className="text-blue-400 font-semibold">{lesson.interactivity}/5</span>
                      </span>
                    )}
                    {lesson.behavior != null && (
                      <span className="text-xs text-slate-500">
                        Behavior: <span className="text-violet-400 font-semibold">{lesson.behavior}/5</span>
                      </span>
                    )}
                  </div>
                  {lesson.learning && (
                    <p className="text-xs text-slate-400 leading-relaxed">{lesson.learning}</p>
                  )}
                  {/* Phase 13: expanded fields */}
                  {(lesson.overallGrade || lesson.repertoire || lesson.practiceAssignment || lesson.examPrepStatus) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                      {lesson.overallGrade && (
                        <span className="text-xs text-slate-500">Grade: <span className="text-white font-semibold">{lesson.overallGrade}</span></span>
                      )}
                      {lesson.repertoire && (
                        <span className="text-xs text-slate-500">Repertoire: <span className="text-white font-medium">{lesson.repertoire}</span></span>
                      )}
                      {lesson.examPrepStatus && (
                        <span className="text-xs text-slate-500">Exam: <span className="text-white font-medium">{lesson.examPrepStatus}</span></span>
                      )}
                    </div>
                  )}
                  {lesson.practiceAssignment && (
                    <div className="mt-1.5">
                      <span className="text-xs text-slate-600">Homework: </span>
                      <span className="text-xs text-slate-400">{lesson.practiceAssignment}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
