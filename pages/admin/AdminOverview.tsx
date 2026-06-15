/**
 * AdminOverview — combined operational + financial summary
 *
 * Layout (top → bottom):
 *   1. Header + quick stat chips (Schools / Teachers / Students / Parents / Users / Lessons this month)
 *   2. Revenue + Payroll financial cards (current billing month)
 *   3. Lessons by School  |  Teacher Performance  (two-column grid)
 *   4. Recent Lessons table (last 50 lessons, clickable)
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Role, LessonStatus, Lesson, DeliveryMode, getDeliveryMode } from '../../types';
import { ViewLessonModal } from '../../components/ViewLessonModal';
import { EditLessonModal } from '../../components/EditLessonModal';
import {
  resolveSchoolGuarantee,
  resolveTeacherGuarantee,
  resolveSchoolRate,
  resolveTeacherRate,
  matchesDeliveryMode,
  normalizeInstrument,
} from '../../services/rateService';

// ─── Small chip stat (top row) ────────────────────────────────────────────────
const ChipStat: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  onClick?: () => void;
}> = ({ label, value, sub, color = 'text-primary-400', onClick }) => (
  <div
    onClick={onClick}
    className={`bg-slate-900 border border-slate-800 rounded-xl p-5 transition-all ${onClick ? 'cursor-pointer hover:bg-slate-800 hover:border-slate-700 hover:shadow-lg group' : ''}`}
  >
    <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
      {label}
      {onClick && <svg className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
    </p>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
  </div>
);

// ─── Financial card (Revenue / Payroll) ───────────────────────────────────────
const FinCard: React.FC<{
  title: string;
  value: string;
  sub: string;
  color: string;
  icon: string;
}> = ({ title, value, sub, color, icon }) => (
  <div className="bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-6 relative overflow-hidden group hover:bg-white/[0.07] transition-all">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{title}</p>
        <p className={`text-3xl font-bold mt-2 tabular-nums ${color}`}>{value}</p>
        <p className="text-slate-500 text-[10px] mt-1.5 font-medium">{sub}</p>
      </div>
      <span className="text-2xl opacity-15 group-hover:opacity-30 transition-opacity">{icon}</span>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
export const AdminOverview: React.FC = () => {
  const { users, schools, teachers, students, lessons, parents, updateLesson } = useApp();
  const navigate = useNavigate();
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);
  const [showFinancials, setShowFinancials] = useState(false);

  // ── Operational stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const monthLessons = lessons.filter(l => l.date.startsWith(thisMonth));
    const taughtThisMonth = monthLessons.filter(
      l => l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT
    );

    // Lessons by school
    const bySchool: Record<string, { name: string; count: number; hours: number }> = {};
    taughtThisMonth.forEach(l => {
      if (!bySchool[l.schoolId]) bySchool[l.schoolId] = { name: l.schoolName || l.schoolId, count: 0, hours: 0 };
      bySchool[l.schoolId].count++;
      bySchool[l.schoolId].hours += (l.durationMinutes || 0) / 60;
    });
    const schoolBreakdown = Object.values(bySchool).sort((a, b) => b.count - a.count);

    // Teacher performance
    const byTeacher: Record<string, { name: string; count: number; hours: number }> = {};
    taughtThisMonth.forEach(l => {
      if (!byTeacher[l.teacherId]) byTeacher[l.teacherId] = { name: l.teacherName || l.teacherId, count: 0, hours: 0 };
      byTeacher[l.teacherId].count++;
      byTeacher[l.teacherId].hours += (l.durationMinutes || 0) / 60;
    });
    const teacherBreakdown = Object.values(byTeacher).sort((a, b) => b.hours - a.hours);

    // Role breakdown
    const roleCounts: Record<string, number> = {};
    users.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });

    return {
      totalUsers: users.length,
      totalSchools: schools.length,
      totalTeachers: teachers.length,
      totalStudents: students.length,
      totalParents: parents.length,
      totalLessons: lessons.length,
      monthLessonCount: taughtThisMonth.length,
      monthLabel,
      schoolBreakdown,
      teacherBreakdown,
      roleCounts,
    };
  }, [users, schools, teachers, students, lessons, parents]);

  // ── Financial metrics (same logic as Dashboard) ────────────────────────────
  const financials = useMemo(() => {
    const months = new Set(lessons.map(l => l.date.substring(0, 7)));
    const sortedMonths = Array.from(months).sort().reverse();
    const currentMonth = sortedMonths[0] || '';

    const monthLessons = currentMonth
      ? lessons.filter(l => l.date.substring(0, 7) === currentMonth)
      : lessons;

    const activeLessons = monthLessons.filter(
      l => l.status !== LessonStatus.CANCELLED && l.status !== LessonStatus.ABSENT_EXCUSED
    );

    let totalRevenue = activeLessons.reduce((sum, l) => sum + (l.schoolRate || 0), 0);
    let totalPayroll = activeLessons.reduce((sum, l) => sum + (l.teacherRate || 0), 0);

    // School guarantees → revenue
    const schoolMap: Record<string, Lesson[]> = {};
    activeLessons.forEach(l => {
      if (!schoolMap[l.schoolId]) schoolMap[l.schoolId] = [];
      schoolMap[l.schoolId].push(l);
    });
    Object.entries(schoolMap).forEach(([schoolId, schoolLessons]) => {
      const school = schools.find(s => s.id === schoolId);
      if (!school) return;
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

    // Teacher guarantees → payroll
    const teacherMap: Record<string, Lesson[]> = {};
    activeLessons.forEach(l => {
      if (!teacherMap[l.teacherId]) teacherMap[l.teacherId] = [];
      teacherMap[l.teacherId].push(l);
    });
    Object.entries(teacherMap).forEach(([, teacherLessons]) => {
      const teacher = teachers.find(t => t.id === teacherLessons[0]?.teacherId);
      if (!teacher) return;
      const inst = normalizeInstrument(teacher.instrument || 'unknown');
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

    return { revenue: totalRevenue, payroll: totalPayroll };
  }, [lessons, schools, teachers]);

  // ── Recent lessons (latest 50, sorted newest first) ───────────────────────
  const recentLessons = useMemo(
    () => [...lessons].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50),
    [lessons]
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Overview</h1>
        <p className="text-sm text-slate-500 mt-1">Operational summary for {stats.monthLabel}</p>
      </div>

      {/* 1 — Quick stat chips */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <ChipStat label="Schools"  value={stats.totalSchools}  onClick={() => navigate('/admin/config')} />
        <ChipStat label="Teachers" value={stats.totalTeachers} onClick={() => navigate('/admin/config?tab=users')} />
        <ChipStat label="Students" value={stats.totalStudents} onClick={() => navigate('/admin/students')} />
        <ChipStat label="Parents"  value={stats.totalParents}  onClick={() => navigate('/admin/config?tab=parents')} />
        <ChipStat
          label="Users"
          value={stats.totalUsers}
          sub={Object.entries(stats.roleCounts).map(([r, c]) => `${r}: ${c}`).join(', ')}
          onClick={() => navigate('/admin/users')}
        />
        <ChipStat
          label="Lessons (month)"
          value={stats.monthLessonCount}
          color="text-emerald-400"
          sub={`of ${stats.totalLessons} total`}
          onClick={() => navigate('/admin/lessons')}
        />
      </div>

      {/* 2 — Financial cards (toggle) */}
      <div>
        <button
          onClick={() => setShowFinancials(v => !v)}
          className="flex items-center gap-2 mb-4 group"
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-slate-300 transition-colors">
            Financial Summary
          </span>
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ring-1 font-medium transition-all ${
            showFinancials
              ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
              : 'bg-slate-800 text-slate-500 ring-white/5'
          }`}>
            {showFinancials ? (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Visible
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18" /></svg>
                Hidden
              </>
            )}
          </span>
        </button>

        {showFinancials ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FinCard
              title="Revenue"
              value={`${financials.revenue.toLocaleString()} SAR`}
              sub="School Billing"
              color="text-blue-400"
              icon="💰"
            />
            <FinCard
              title="Payroll"
              value={`${financials.payroll.toLocaleString()} SAR`}
              sub="Teacher Total"
              color="text-amber-400"
              icon="💵"
            />
          </div>
        ) : (
          <div
            onClick={() => setShowFinancials(true)}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 cursor-pointer"
          >
            {['Revenue', 'Payroll'].map(label => (
              <div key={label} className="bg-white/5 ring-1 ring-white/10 rounded-2xl p-6 flex items-center gap-3 hover:bg-white/[0.07] transition-all">
                <svg className="w-4 h-4 text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18" /></svg>
                <div>
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
                  <p className="text-slate-700 text-xl font-bold tracking-widest mt-1">••••••</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3 — Lessons by school + Teacher performance */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
            Lessons by School <span className="text-slate-500 font-normal">({stats.monthLabel})</span>
          </h2>
          {stats.schoolBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No lessons this month</p>
          ) : (
            <div className="space-y-2">
              {stats.schoolBreakdown.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
                  <span className="text-sm text-slate-300 truncate">{s.name}</span>
                  <div className="flex gap-4 text-xs">
                    <span className="text-slate-400">{s.count} lessons</span>
                    <span className="text-primary-400 font-medium">{s.hours.toFixed(1)}h</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
            Teacher Performance <span className="text-slate-500 font-normal">({stats.monthLabel})</span>
          </h2>
          {stats.teacherBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No lessons this month</p>
          ) : (
            <div className="space-y-2">
              {stats.teacherBreakdown.map((t, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
                  <span className="text-sm text-slate-300 truncate">{t.name}</span>
                  <div className="flex gap-4 text-xs">
                    <span className="text-slate-400">{t.count} lessons</span>
                    <span className="text-emerald-400 font-medium">{t.hours.toFixed(1)}h</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4 — Recent lessons table */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/60 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-white">Recent Lessons</h2>
          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
            {recentLessons.length} Entries
          </span>
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
              {recentLessons.map(lesson => {
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
                    className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5 text-slate-300">
                      {new Date(lesson.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      <span className="block text-xs text-slate-500 mt-0.5">
                        {new Date(lesson.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300">{teacher?.name || lesson.teacherName || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-300">{lesson.studentNames?.join(', ') || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-300">{school?.name || lesson.schoolName || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${statusCls}`}>
                        {lesson.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={e => { e.stopPropagation(); setEditingLesson(lesson); }}
                        className="text-primary-400 hover:text-primary-300 text-xs font-medium transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
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
          onSave={data => {
            updateLesson(editingLesson.id, data);
            setEditingLesson(null);
          }}
        />
      )}
    </div>
  );
};

export default AdminOverview;
