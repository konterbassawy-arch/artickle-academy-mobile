import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { LessonStatus, Role, Lesson, DeliveryMode, getDeliveryMode } from '../types';
import {
  resolveTeacherGuarantee,
  resolveTeacherRate,
  matchesDeliveryMode,
  normalizeInstrument
} from '../services/rateService';

const normKey = (s: any) => String(s || '').trim().toLowerCase();

// Helper function to parse dates in both M/D/YYYY and ISO formats
const parseDateToYearMonth = (dateStr: string): string => {
  try {
    // Try parsing as M/D/YYYY or MM/DD/YYYY format first
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/').map(p => p.trim());
      if (parts.length === 3) {
        const month = String(parseInt(parts[0])).padStart(2, '0');
        const year = parts[2];
        return `${year}-${month}`;
      }
    }
    // Fall back to ISO date parsing
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    }
  } catch (e) {
    // If all parsing fails, return empty string
  }
  return '';
};

// Get current year and month for initial state
const now = new Date();
const currentYear = now.getFullYear().toString();
const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

export const TeacherFinance: React.FC = () => {
  const { lessons, currentUser, teachers, schools } = useApp();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);

  if (currentUser?.role !== Role.TEACHER) return <div className="text-red-500">Access Denied</div>;

  const teacher = teachers.find(t => t.id === currentUser.id);

  // Generate year options (current year - 2 to current year + 1)
  const yearOptions = useMemo(() => {
    const currentYearNum = new Date().getFullYear();
    const years = [];
    for (let i = currentYearNum - 2; i <= currentYearNum + 1; i++) {
      years.push(i.toString());
    }
    return years;
  }, []);

  // Month names
  const monthNames = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ];

  const myLessons = useMemo(() => lessons.filter(l => l.teacherId === currentUser.id), [lessons, currentUser.id]);

  const displayMonth = `${selectedYear}-${selectedMonth}`;

  const filteredLessons = useMemo(() => {
    if (!displayMonth || displayMonth === '-') return [];
    return myLessons.filter(l => {
      const lessonYearMonth = parseDateToYearMonth(l.date);
      return lessonYearMonth === displayMonth;
    });
  }, [myLessons, displayMonth]);

  // Define activeLessons first for use in other useMemos
  // Only exclude CANCELLED and ABSENT_EXCUSED
  // ABSENT_UNEXCUSED should be counted (teacher still gets paid)
  const activeLessons = useMemo(() => 
    filteredLessons.filter(
      l => l.status !== LessonStatus.CANCELLED && l.status !== LessonStatus.ABSENT_EXCUSED
    ),
    [filteredLessons]
  );

  const financials = useMemo(() => {
    let totalPay = activeLessons.reduce((sum, l) => sum + (l.teacherRate || 0), 0);
    const totalHours = activeLessons.reduce((sum, l) => sum + (l.durationMinutes || 0) / 60, 0);
    const guaranteeHits: { date: string; school: string; actualHours: number; minHours: number; amount: number }[] = [];

    if (!teacher) return { totalPay, totalHours, guaranteeHits };

    const inst = normalizeInstrument(teacher.instrument || 'unknown');

    // Group by date → school
    const dateSchoolMap: Record<string, Record<string, Lesson[]>> = {};
    activeLessons.forEach(l => {
      const date = l.date.substring(0, 10);
      if (!dateSchoolMap[date]) dateSchoolMap[date] = {};
      if (!dateSchoolMap[date][l.schoolId]) dateSchoolMap[date][l.schoolId] = [];
      dateSchoolMap[date][l.schoolId].push(l);
    });

    // Apply TEACHER guarantees per school per day
    Object.entries(dateSchoolMap).forEach(([date, schoolsOnDate]) => {
      Object.entries(schoolsOnDate).forEach(([schoolId, group]) => {
        const guarantee = resolveTeacherGuarantee(teacher, schoolId, inst);
        if (!guarantee || group.length === 0) return;

        const actualHours = group
          .filter(l => matchesDeliveryMode(guarantee.appliesTo, getDeliveryMode(l)))
          .reduce((sum, l) => sum + (l.durationMinutes || 0) / 60, 0);

        if (actualHours < guarantee.minHours) {
          const shortfall = guarantee.minHours - actualHours;
          const dm = guarantee.appliesTo === 'online_only' ? DeliveryMode.ONLINE : DeliveryMode.IN_PERSON;
          const adjustment = shortfall * resolveTeacherRate(teacher, schoolId, 'Individual', dm);
          totalPay += adjustment;
          const school = schools.find(s => s.id === schoolId);
          guaranteeHits.push({
            date,
            school: school?.name || schoolId,
            actualHours,
            minHours: guarantee.minHours,
            amount: adjustment
          });
        }
      });
    });

    return { totalPay, totalHours, guaranteeHits };
  }, [filteredLessons, activeLessons, teacher, schools]);

  const formatMonth = (yyyyMm: string) => {
    if (!yyyyMm) return '';
    const [year, month] = yyyyMm.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-white">My Earnings</h2>
        <div className="flex gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1 font-medium">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 w-24"
            >
              {yearOptions.map(year => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1 font-medium">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 w-32"
            >
              {monthNames.map(month => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Total Earnings</h3>
          <p className="text-3xl font-bold text-amber-400">{financials.totalPay.toFixed(2)} SAR</p>
          <p className="text-xs text-slate-500 mt-2">Includes lessons & guarantees</p>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Hours Taught</h3>
          <p className="text-3xl font-bold text-blue-400">{financials.totalHours.toFixed(1)} hrs</p>
          <p className="text-xs text-slate-500 mt-2">Billable hours this month</p>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Lesson Count</h3>
          <p className="text-3xl font-bold text-blue-400">{filteredLessons.length}</p>
          <p className="text-xs text-slate-500 mt-2">Total scheduled sessions</p>
        </div>
      </div>

      {/* Guarantee Adjustments */}
      {financials.guaranteeHits.length > 0 && (
        <div className="bg-amber-900/10 border border-amber-500/20 rounded-xl p-4">
          <h3 className="text-amber-400 font-bold text-sm mb-2 flex items-center gap-2">
            <span>⚡</span> Guarantee Adjustments Applied
          </h3>
          <div className="grid gap-2">
            {financials.guaranteeHits.map((hit, idx) => (
              <div key={idx} className="text-xs text-amber-200/80 flex justify-between bg-amber-900/20 p-2 rounded">
                <span>{new Date(hit.date).toLocaleDateString()} ({hit.school}) - {hit.actualHours.toFixed(1)}h / {hit.minHours}h min</span>
                <span className="font-bold">+{hit.amount.toFixed(2)} SAR</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-700 bg-slate-850">
          <h3 className="font-bold text-white text-sm">Detailed Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">School</th>
                <th className="px-6 py-3">Student</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3 text-right">Hours</th>
                <th className="px-6 py-3 text-right">Rate</th>
                <th className="px-6 py-3 text-right">Earnings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredLessons.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(lesson => {
                const hours = (lesson.durationMinutes || 0) / 60;
                const effectiveRate = hours > 0 ? ((lesson.teacherRate || 0) / hours) : 0;
                const isCancelled = lesson.status === LessonStatus.CANCELLED || lesson.status === LessonStatus.ABSENT_EXCUSED;
                return (
                  <tr key={lesson.id} className={`border-slate-700 hover:bg-slate-900/50 ${isCancelled ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4 text-slate-300">{new Date(lesson.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-slate-300">{lesson.schoolName}</td>
                    <td className="px-6 py-4 text-slate-300">{lesson.studentNames.join(', ')}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        lesson.type === 'Group' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'
                      }`}>
                        {lesson.type}
                      </span>
                      {isCancelled && <span className="ml-2 px-2 py-1 rounded text-xs font-semibold bg-red-500/20 text-red-300">CANCELLED</span>}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-300">{hours.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{effectiveRate.toFixed(0)} SAR/hr</td>
                    <td className="px-6 py-4 text-right font-semibold text-amber-400">{(lesson.teacherRate || 0).toFixed(2)} SAR</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
