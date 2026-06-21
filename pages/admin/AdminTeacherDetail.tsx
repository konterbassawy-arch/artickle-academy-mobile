import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Lesson, LessonStatus } from '../../types';
import { ViewLessonModal } from '../../components/ViewLessonModal';
import { EditLessonModal } from '../../components/EditLessonModal';
import { matchesSearch } from '../../services/searchUtils';

const StatCard: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5">
    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">{label}</p>
    <p className="text-2xl font-bold text-white">{value}</p>
    {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
  </div>
);

export const AdminTeacherDetail: React.FC = () => {
  const { teacherId } = useParams<{ teacherId: string }>();
  const navigate = useNavigate();
  const { teachers, students, schools, lessons, currentUser, updateLesson } = useApp();

  const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [search, setSearch] = useState('');

  const teacher = teachers.find(t => t.id === teacherId);

  const teacherLessons = useMemo(
    () => (teacher ? lessons.filter(l => l.teacherId === teacher.id) : []),
    [lessons, teacher]
  );

  const teacherStudents = useMemo(
    () => students.filter(s =>
      s.teacherId === teacher?.id ||
      (s.currentTeacherIds ?? []).includes(teacher?.id ?? '')
    ),
    [students, teacher]
  );

  const stats = useMemo(() => {
    const completed = teacherLessons.filter(l =>
      l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT
    );
    const totalMinutes = completed.reduce((sum, l) => sum + (l.durationMinutes || 0), 0);
    const totalPay = teacherLessons.reduce((sum, l) => sum + (l.teacherRate || 0), 0);
    const schoolIds = [...new Set(teacherLessons.map(l => l.schoolId).filter(Boolean))];
    return {
      totalLessons: teacherLessons.length,
      completedLessons: completed.length,
      totalHours: (totalMinutes / 60).toFixed(1),
      totalPay,
      schoolCount: schoolIds.length,
      schoolNames: schoolIds.map(id => schools.find(s => s.id === id)?.name ?? id),
      attendanceRate: teacherLessons.filter(l => l.status !== LessonStatus.CANCELLED).length > 0
        ? Math.round((completed.length / teacherLessons.filter(l => l.status !== LessonStatus.CANCELLED).length) * 100)
        : 0,
    };
  }, [teacherLessons, schools]);

  const filteredLessons = useMemo(() => {
    return teacherLessons
      .filter(l =>
        matchesSearch(search, [...l.studentNames, l.schoolName, l.status])
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [teacherLessons, search]);

  if (!teacher) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="bg-slate-900/60 rounded-xl ring-1 ring-white/5 p-12 text-center">
          <p className="text-white font-semibold mb-1">Teacher not found</p>
          <p className="text-slate-500 text-sm">This teacher ID does not exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const initials = teacher.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="space-y-6">

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Header */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6 flex items-start gap-5">
        <div className="w-14 h-14 rounded-full bg-primary-600/20 ring-2 ring-primary-500/30 flex items-center justify-center text-primary-300 font-bold text-lg shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white">{teacher.name}</h1>
          <div className="flex flex-wrap gap-2 mt-1.5">
            <span className="px-2 py-0.5 bg-slate-800 rounded-full text-xs text-slate-400 ring-1 ring-white/5">
              {teacher.instrument}
            </span>
            <span className="px-2 py-0.5 bg-slate-800 rounded-full text-xs text-slate-400 ring-1 ring-white/5">
              Code: {teacher.code}
            </span>
            {stats.schoolNames.map(name => (
              <span key={name} className="px-2 py-0.5 bg-slate-800 rounded-full text-xs text-slate-400 ring-1 ring-white/5">
                {name}
              </span>
            ))}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span>Base rate: <span className="text-slate-300">{teacher.baseRate} SAR/hr</span></span>
            {teacher.baseGroupRate != null && (
              <span>Group rate: <span className="text-slate-300">{teacher.baseGroupRate} SAR/hr/student</span></span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total Lessons" value={stats.totalLessons} />
        <StatCard label="Completed" value={stats.completedLessons} />
        <StatCard label="Attendance Rate" value={`${stats.attendanceRate}%`} />
        <StatCard label="Total Hours" value={`${stats.totalHours}h`} sub="completed lessons" />
        <StatCard label="Total Earnings" value={`${stats.totalPay.toLocaleString()} SAR`} sub="all-time payroll" />
      </div>

      {/* Students */}
      {teacherStudents.length > 0 && (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Students ({teacherStudents.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {teacherStudents.map(s => (
              <button
                key={s.id}
                onClick={() => navigate(`/admin/students/${s.id}`)}
                className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 ring-1 ring-white/5 hover:ring-primary-500/30 rounded-xl text-sm text-slate-300 hover:text-white transition-all"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lessons */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            Lessons ({filteredLessons.length})
          </h2>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by student, school, status…"
            className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['Date', 'Student', 'School', 'Status', 'Duration', 'Pay'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLessons.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-600 text-sm">No lessons found</td>
                </tr>
              ) : filteredLessons.map(l => (
                <tr
                  key={l.id}
                  onClick={() => setViewingLesson(l)}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                    {new Date(l.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                      {l.studentNames.map((name, i) => {
                        const sid = l.studentIds?.[i];
                        return sid ? (
                          <button
                            key={sid}
                            onClick={e => { e.stopPropagation(); navigate(`/admin/students/${sid}`); }}
                            className="text-slate-300 hover:text-primary-400 hover:underline transition-colors text-left"
                          >
                            {name}
                          </button>
                        ) : (
                          <span key={i} className="text-slate-300">{name}</span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{l.schoolName}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT
                        ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20'
                        : l.status === LessonStatus.ABSENT_EXCUSED
                        ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20'
                        : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
                    }`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{l.durationMinutes} min</td>
                  <td className="px-4 py-3 text-slate-300">{l.teacherRate} SAR</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewingLesson && (
        <ViewLessonModal
          lesson={lessons.find(l => l.id === viewingLesson.id) ?? viewingLesson}
          onClose={() => setViewingLesson(null)}
          onEdit={() => { setEditingLesson(viewingLesson); setViewingLesson(null); }}
        />
      )}
      {editingLesson && (
        <EditLessonModal
          lesson={lessons.find(l => l.id === editingLesson.id) ?? editingLesson}
          onClose={() => setEditingLesson(null)}
          onSave={(id, data) => { updateLesson(id, data); setEditingLesson(null); }}
        />
      )}
    </div>
  );
};
