/**
 * SchoolDashboard — Phase 12
 *
 * School admin home page showing:
 * - School info + billing rates
 * - Lesson counts and hours this month
 * - Invoice summary (schoolRate totals)
 * - Student count and teacher list
 *
 * Visibility:
 * - schoolRate: YES (billing is visible to school admin)
 * - teacherRate: NO (stripped in AppContext)
 * - notes: NO (stripped in AppContext)
 * - teacher pay rates: NO (stripped in AppContext)
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Lesson, LessonStatus } from '../../types';
import { ViewLessonModal } from '../../components/ViewLessonModal';
import { generateSchoolLessonPDF } from '../../services/pdfExport';

export const SchoolDashboard: React.FC = () => {
  const { schools, students, lessons, teachers, currentUser, updateLessonSchoolComment } = useApp();
  const navigate = useNavigate();

  const school = schools[0]; // school_admin sees only their own school

  const stats = useMemo(() => {
    if (!school) return null;

    const schoolLessons = lessons; // already filtered by schoolId in AppContext
    const completed = schoolLessons.filter(
      l => l.status !== LessonStatus.CANCELLED && l.status !== LessonStatus.ABSENT_EXCUSED
    );

    // Current month
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const thisMonthLessons = schoolLessons.filter(l => {
      const d = new Date(l.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const thisMonthCompleted = thisMonthLessons.filter(
      l => l.status !== LessonStatus.CANCELLED && l.status !== LessonStatus.ABSENT_EXCUSED
    );

    // Invoice total (schoolRate = what the school is billed)
    const thisMonthInvoice = thisMonthCompleted.reduce((sum, l) => sum + (l.schoolRate || 0), 0);
    const totalHoursThisMonth = thisMonthCompleted.reduce((sum, l) => sum + (l.durationMinutes || 60), 0) / 60;

    // Unique teachers teaching at this school
    const teacherIds = new Set(schoolLessons.map(l => l.teacherId));
    const activeTeachers = teachers.filter(t => teacherIds.has(t.id));

    // Lessons by teacher this month
    const byTeacher = activeTeachers.map(t => {
      const tLessons = thisMonthCompleted.filter(l => l.teacherId === t.id);
      const hours = tLessons.reduce((sum, l) => sum + (l.durationMinutes || 60), 0) / 60;
      const amount = tLessons.reduce((sum, l) => sum + (l.schoolRate || 0), 0);
      return { teacher: t, lessonCount: tLessons.length, hours, amount };
    }).filter(x => x.lessonCount > 0).sort((a, b) => b.hours - a.hours);

    // Recent classes — last 20 sorted by date desc
    const recentClasses = [...schoolLessons]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);

    return {
      totalLessons: schoolLessons.length,
      completedLessons: completed.length,
      studentCount: students.length,
      thisMonthLessons: thisMonthLessons.length,
      thisMonthCompleted: thisMonthCompleted.length,
      thisMonthInvoice,
      totalHoursThisMonth,
      activeTeachers,
      byTeacher,
      recentClasses,
      monthLabel: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
    };
  }, [school, lessons, students, teachers]);

  const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [editComment, setEditComment] = useState('');
  const [editInternal, setEditInternal] = useState('');
  const [saving, setSaving] = useState(false);

  const openEdit = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setEditComment(lesson.schoolAdminComment || '');
    setEditInternal(lesson.schoolAdminInternalComment || '');
  };

  const handleSaveComment = async () => {
    if (!editingLesson) return;
    setSaving(true);
    try { await updateLessonSchoolComment(editingLesson.id, editComment, editInternal); }
    catch (e) { console.error(e); }
    setSaving(false);
    setEditingLesson(null);
  };

  if (!school) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <span className="text-slate-500 text-xl">?</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">School Not Found</h2>
          <p className="text-slate-500 text-sm">
            Your account is not linked to a school. Contact the administrator.
          </p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* School header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-base ring-1 ring-amber-500/20">
          {school.code}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">{school.name}</h2>
          <p className="text-sm text-slate-500">School Dashboard</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button type="button" onClick={() => navigate('/school/students')} className="text-left bg-slate-900/60 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-500/40">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Students</p>
          <p className="text-2xl font-bold text-white">{stats.studentCount}</p>
        </button>
        <button type="button" onClick={() => navigate('/school/lessons')} className="text-left bg-slate-900/60 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-500/40">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Total Lessons</p>
          <p className="text-2xl font-bold text-white">{stats.totalLessons}</p>
        </button>
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition-colors">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">{stats.monthLabel} Lessons</p>
          <p className="text-2xl font-bold text-emerald-400">{stats.thisMonthCompleted}</p>
        </div>
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition-colors">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">{stats.monthLabel} Hours</p>
          <p className="text-2xl font-bold text-blue-400">{stats.totalHoursThisMonth.toFixed(1)}h</p>
        </div>
      </div>


      {/* Recent Classes */}
      {stats.recentClasses.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-white mb-3">Recent Classes</h3>
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Date</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Teacher</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Student(s)</th>
                  <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Type</th>
                  <th className="text-right px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Duration</th>
                  <th className="text-right px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {stats.recentClasses.map(lesson => {
                  const d = new Date(lesson.date);
                  const dateStr = d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
                  const timeStr = d.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' });
                  const statusColors: Record<string, string> = {
                    present: 'text-emerald-400',
                    completed: 'text-emerald-400',
                    cancelled: 'text-red-400',
                    absent_excused: 'text-amber-400',
                    absent_unexcused: 'text-red-400',
                    pending: 'text-slate-400',
                  };
                  const statusColor = statusColors[lesson.status?.toLowerCase()] ?? 'text-slate-400';
                  return (
                    <tr key={lesson.id} onClick={() => setViewingLesson(lesson)} className="hover:bg-slate-800/40 transition-colors cursor-pointer">
                      <td className="px-4 py-3 text-sm text-white tabular-nums whitespace-nowrap">
                        {dateStr} <span className="text-slate-500 text-xs">{timeStr}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white font-medium">{lesson.teacherName}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{lesson.studentNames?.join(', ') || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{lesson.type}</td>
                      <td className="px-4 py-3 text-sm text-white text-right tabular-nums">{lesson.durationMinutes}m</td>
                      <td className={`px-4 py-3 text-xs text-right font-medium capitalize ${statusColor}`}>{lesson.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewingLesson && !editingLesson && (
        <ViewLessonModal
          lesson={viewingLesson}
          onClose={() => setViewingLesson(null)}
          onEdit={() => { openEdit(viewingLesson); setViewingLesson(null); }}
          editLabel="+ Add School Comment"
        />
      )}

      {editingLesson && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-white font-mono">{editingLesson.id}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(editingLesson.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                  {' · '}{new Date(editingLesson.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button onClick={() => setEditingLesson(null)} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5 p-3 bg-slate-800/40 rounded-xl">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-0.5">Student</p>
                <p className="text-sm text-slate-300 truncate">{editingLesson.studentNames.join(', ')}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-0.5">Teacher</p>
                <p className="text-sm text-slate-300">{editingLesson.teacherName}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="border-t border-slate-800 pt-4">
                <p className="text-[10px] text-primary-400 uppercase tracking-wider font-semibold mb-4">School Comments</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">School Teacher Comment</label>
                <p className="text-[10px] text-slate-600 mb-2">Appears on the lesson PDF sent to parents.</p>
                <textarea value={editComment} onChange={e => setEditComment(e.target.value)} placeholder="Enter school teacher comment..." className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white text-sm h-24 focus:outline-none focus:ring-1 focus:ring-primary-500/40 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Internal Comment</label>
                <p className="text-[10px] text-slate-600 mb-2">Internal only — not visible on PDF or to parents.</p>
                <textarea value={editInternal} onChange={e => setEditInternal(e.target.value)} placeholder="Enter internal note..." className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white text-sm h-24 focus:outline-none focus:ring-1 focus:ring-primary-500/40 resize-none" />
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                <button onClick={() => generateSchoolLessonPDF(editingLesson)} className="text-amber-400 hover:text-amber-300 text-xs font-medium transition-colors">Download PDF</button>
                <div className="flex gap-3">
                  <button onClick={() => setEditingLesson(null)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm">Cancel</button>
                  <button onClick={handleSaveComment} disabled={saving} className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors text-sm disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save Comments'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
