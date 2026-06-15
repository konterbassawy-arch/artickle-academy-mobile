import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Role, LessonStatus, Lesson, DeliveryMode, getDeliveryMode } from '../types';
import { EditLessonModal } from '../components/EditLessonModal';
import { ViewLessonModal } from '../components/ViewLessonModal';
import {
  resolveSchoolGuarantee,
  resolveTeacherGuarantee,
  resolveSchoolRate,
  resolveTeacherRate,
  matchesDeliveryMode,
  normalizeInstrument
} from '../services/rateService';

export const Dashboard: React.FC = () => {
  const { lessons, currentUser, updateLesson, schools, teachers } = useApp();
  const navigate = useNavigate();
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);

  const myLessons = currentUser?.role === Role.TEACHER
    ? lessons.filter(l => l.teacherId === currentUser.id)
    : lessons;

  const unreadCount = currentUser?.role === Role.TEACHER
    ? myLessons.filter(l => l.hasUnreadAdminNote).length
    : 0;

  const totalLessons = myLessons.length;
  const completed = myLessons.filter(l => l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT).length;
  
  // Calculate financial metrics the same way as Financial Reports
  const metrics = useMemo(() => {
    // Get the current month (most recent month with lessons)
    const months = new Set(myLessons.map(l => l.date.substring(0, 7)));
    const sortedMonths = Array.from(months).sort().reverse();
    const currentMonth = sortedMonths[0] || '';

    // Filter lessons for current month
    const monthLessons = currentMonth 
      ? myLessons.filter(l => l.date.substring(0, 7) === currentMonth)
      : myLessons;

    // Filter out CANCELLED and ABSENT_EXCUSED lessons
    const activeLessons = monthLessons.filter(
      l => l.status !== LessonStatus.CANCELLED && l.status !== LessonStatus.ABSENT_EXCUSED
    );

    let totalRevenue = activeLessons.reduce((sum, l) => sum + (l.schoolRate || 0), 0);
    let totalPayroll = activeLessons.reduce((sum, l) => sum + (l.teacherRate || 0), 0);

    // ---- SCHOOL GUARANTEES → REVENUE (per school + date + instrument) ----
    const schoolMap: Record<string, Lesson[]> = {};
    activeLessons.forEach(l => {
      if (!schoolMap[l.schoolId]) schoolMap[l.schoolId] = [];
      schoolMap[l.schoolId].push(l);
    });

    Object.entries(schoolMap).forEach(([schoolId, schoolLessons]) => {
      const school = schools.find(s => s.id === schoolId);
      if (!school) return;

      // Group by date → instrument (normalized)
      const dateInstrMap: Record<string, Record<string, Lesson[]>> = {};
      schoolLessons.forEach(l => {
        const date = l.date.substring(0, 10);
        const t = teachers.find(tc => tc.id === l.teacherId);
        const inst = normalizeInstrument(t?.instrument || 'unknown');
        if (!dateInstrMap[date]) dateInstrMap[date] = {};
        if (!dateInstrMap[date][inst]) dateInstrMap[date][inst] = [];
        dateInstrMap[date][inst].push(l);
      });

      Object.values(dateInstrMap).forEach(instruments => {
        Object.entries(instruments).forEach(([inst, group]) => {
          const guarantee = resolveSchoolGuarantee(school, inst);
          if (!guarantee) return;
          const actualHours = group
            .filter(l => matchesDeliveryMode(guarantee.appliesTo, getDeliveryMode(l)))
            .reduce((sum, l) => sum + (l.durationMinutes || 0) / 60, 0);
          if (actualHours < guarantee.minHours) {
            const shortfall = guarantee.minHours - actualHours;
            const dm = guarantee.appliesTo === 'online_only' ? DeliveryMode.ONLINE : DeliveryMode.IN_PERSON;
            totalRevenue += shortfall * resolveSchoolRate(school, '', inst, 'Individual', dm);
          }
        });
      });
    });

    // ---- TEACHER GUARANTEES → PAYROLL (per teacher + school + date + instrument) ----
    const teacherMap: Record<string, Lesson[]> = {};
    activeLessons.forEach(l => {
      if (!teacherMap[l.teacherId]) teacherMap[l.teacherId] = [];
      teacherMap[l.teacherId].push(l);
    });

    Object.entries(teacherMap).forEach(([, teacherLessons]) => {
      const teacher = teachers.find(t => t.id === teacherLessons[0]?.teacherId);
      if (!teacher) return;
      const inst = normalizeInstrument(teacher.instrument || 'unknown');

      // Group by date → school
      const dateSchoolMap: Record<string, Record<string, Lesson[]>> = {};
      teacherLessons.forEach(l => {
        const date = l.date.substring(0, 10);
        if (!dateSchoolMap[date]) dateSchoolMap[date] = {};
        if (!dateSchoolMap[date][l.schoolId]) dateSchoolMap[date][l.schoolId] = [];
        dateSchoolMap[date][l.schoolId].push(l);
      });

      Object.values(dateSchoolMap).forEach(schoolsOnDate => {
        Object.entries(schoolsOnDate).forEach(([schoolId, group]) => {
          const guarantee = resolveTeacherGuarantee(teacher, schoolId, inst);
          if (!guarantee || group.length === 0) return;
          const actualHours = group
            .filter(l => matchesDeliveryMode(guarantee.appliesTo, getDeliveryMode(l)))
            .reduce((sum, l) => sum + (l.durationMinutes || 0) / 60, 0);
          if (actualHours < guarantee.minHours) {
            const shortfall = guarantee.minHours - actualHours;
            const dm = guarantee.appliesTo === 'online_only' ? DeliveryMode.ONLINE : DeliveryMode.IN_PERSON;
            totalPayroll += shortfall * resolveTeacherRate(teacher, schoolId, 'Individual', dm);
          }
        });
      });
    });

    return {
      revenue: totalRevenue,
      payroll: totalPayroll,
      lessonCount: activeLessons.length
    };
  }, [myLessons, schools, teachers]);

  const handleSaveLesson = (id: string, data: Partial<Lesson>) => {
    updateLesson(id, data);
  };



  const StatCard = ({ title, value, sub, color, icon }: any) => (
    <div className="bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-6 relative overflow-hidden group hover:bg-white/[0.07] transition-all">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{title}</p>
          <p className={`text-3xl font-bold mt-2 tabular-nums ${color}`}>{value}</p>
          {sub && <p className="text-slate-500 text-[10px] mt-1.5 font-medium">{sub}</p>}
        </div>
        <span className="text-2xl opacity-15 group-hover:opacity-30 transition-opacity">{icon}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Hello, {currentUser?.name}!</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {currentUser?.role === Role.ADMIN ? 'Manage schools and financials' : 'Your teaching dashboard'}
            </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Lessons" 
          value={totalLessons} 
          sub="Weekly View"
          color="text-white"
          icon="📅"
        />
        <StatCard 
          title="Attendance" 
          value={`${Math.round((completed / totalLessons) * 100 || 0)}%`}
          sub="Completed"
          color="text-green-400"
          icon="✅"
        />
        {currentUser?.role === Role.ADMIN && (
          <>
            <StatCard 
              title="Revenue" 
              value={`${metrics.revenue} SAR`}
              sub="School Billing"
              color="text-blue-400"
              icon="💰"
            />
            <StatCard 
              title="Payroll" 
              value={`${metrics.payroll} SAR`}
              sub="Teacher Total"
              color="text-amber-400"
              icon="💵"
            />
          </>
        )}
        {currentUser?.role === Role.TEACHER && (
          <StatCard 
            title="My Earnings" 
            value={`${metrics.payroll} SAR`}
            sub="This Month"
            color="text-amber-400"
            icon="💵"
          />
        )}
      </div>

      {/* Unread notes banner — teacher only */}
      {currentUser?.role === Role.TEACHER && unreadCount > 0 && (
        <div className="flex items-center justify-between gap-4 bg-red-500/[0.06] ring-1 ring-red-500/20 rounded-2xl px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
            <p className="text-sm text-red-300 font-medium">
              {unreadCount} lesson{unreadCount !== 1 ? 's' : ''} with new school admin note{unreadCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => navigate('/teacher/lessons?unread=1')}
            className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors shrink-0 flex items-center gap-1"
          >
            View in Lesson Log
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Recent Lessons Table */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/60 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-white">Week Timeline (S1, S2, S3)</h2>
          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{Math.min(myLessons.length, 50)} Entries</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/40 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5 text-left">Date</th>
                <th className="px-5 py-3.5 text-left">Teacher</th>
                <th className="px-5 py-3.5 text-left">Student</th>
                <th className="px-5 py-3.5 text-left">School</th>
                <th className="px-5 py-3.5 text-left">Status</th>
                <th className="px-5 py-3.5 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {myLessons.slice(0, 50).map((lesson) => {
                const teacher = teachers.find(t => t.id === lesson.teacherId);
                const school = schools.find(s => s.id === lesson.schoolId);
                const statusCls =
                  lesson.status === LessonStatus.CANCELLED
                    ? 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
                    : lesson.status === LessonStatus.PRESENT || lesson.status === LessonStatus.TAUGHT
                    ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20'
                    : 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20';

                return (
                  <tr
                    key={lesson.id}
                    onClick={() => setViewingLesson(lesson)}
                    className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${
                      currentUser?.role === Role.TEACHER && lesson.hasUnreadAdminNote
                        ? 'bg-red-500/[0.03] border-l-2 border-l-red-500/40'
                        : ''
                    }`}
                  >
                    <td className="px-5 py-3.5 text-slate-300">
                      {new Date(lesson.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      <span className="block text-xs text-slate-500 mt-0.5">
                        {new Date(lesson.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300">{teacher?.name || 'Unknown'}</td>
                    <td className="px-5 py-3.5 text-slate-300">{lesson.studentNames.join(', ')}</td>
                    <td className="px-5 py-3.5 text-slate-300">{school?.name || 'Unknown'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${statusCls}`}>
                        {lesson.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); setEditingLesson(lesson); }}
                          className="text-primary-400 hover:text-primary-300 text-xs font-medium transition-colors"
                        >
                          Edit
                        </button>
                        {(currentUser?.role === Role.TEACHER || currentUser?.role === Role.ADMIN) && lesson.hasUnreadAdminNote && (
                          <span
                            className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse"
                            title="Unread school admin note"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewingLesson && !editingLesson && (
        <ViewLessonModal
          lesson={lessons.find(l => l.id === viewingLesson.id) ?? viewingLesson}
          onClose={() => setViewingLesson(null)}
          onEdit={() => { setEditingLesson(viewingLesson); setViewingLesson(null); }}
        />
      )}

      {editingLesson && (
        <EditLessonModal
          lesson={editingLesson}
          onClose={() => setEditingLesson(null)}
          onSave={(data) => {
            handleSaveLesson(editingLesson.id, data);
            setEditingLesson(null);
          }}
        />
      )}
    </div>
  );
};
