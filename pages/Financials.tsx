
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { LessonStatus, Lesson, DeliveryMode, getDeliveryMode } from '../types';
import { exportSchoolInvoice, exportPayroll } from '../services/excelExport';
import {
  resolveSchoolGuarantee,
  resolveTeacherGuarantee,
  resolveSchoolRate,
  resolveTeacherRate,
  matchesDeliveryMode,
  normalizeInstrument
} from '../services/rateService';

export const Financials: React.FC = () => {
  const { lessons, schools, teachers } = useApp();
  const [activeTab, setActiveTab] = useState<'invoicing' | 'payroll'>('invoicing');
  
  // Filter State
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('');

  // Initialize to current year and month
  React.useEffect(() => {
    if (!selectedYear || !selectedMonth) {
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      if (!selectedYear) setSelectedYear(year);
      if (!selectedMonth) setSelectedMonth(month);
    }
  }, []);

  // Generate year options (current year - 2 to current year + 1)
  const yearOptions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const years = [];
    for (let i = currentYear - 2; i <= currentYear + 1; i++) {
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

  const handleYearChange = (val: string) => {
    setSelectedYear(val);
  };

  const handleMonthChange = (val: string) => {
    setSelectedMonth(val);
  };

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

  // Filter lessons based on active filters
  const filteredLessons = useMemo(() => {
    return lessons.filter(l => {
      const lessonDate = parseDateToYearMonth(l.date); // Parse to YYYY-MM
      const selectedYearMonth = selectedYear && selectedMonth ? `${selectedYear}-${selectedMonth}` : '';
      
      if (selectedYearMonth && lessonDate !== selectedYearMonth) return false;
      if (selectedSchool && l.schoolId !== selectedSchool) return false;
      if (selectedTeacher && l.teacherId !== selectedTeacher) return false;
      
      return true;
    });
  }, [lessons, selectedYear, selectedMonth, selectedSchool, selectedTeacher, parseDateToYearMonth]);

  const handleExport = () => {
    if (!selectedYear || !selectedMonth) {
        alert("Please select a year and month to export.");
        return;
    }

    const selectedYearMonth = `${selectedYear}-${selectedMonth}`;
    const filters = {
        month: selectedYearMonth,
        schoolId: selectedSchool || undefined,
        teacherId: selectedTeacher || undefined
    };

    try {
        if (activeTab === 'invoicing') {
            exportSchoolInvoice(filteredLessons, schools, teachers, filters);
        } else {
            exportPayroll(filteredLessons, schools, teachers, filters);
        }
    } catch (e: any) {
        alert("Export failed: " + e.message);
    }
  };

  const formatMonth = (yyyyMm: string) => {
    if (!yyyyMm) return '';
    const [year, month] = yyyyMm.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const getStats = () => {
      // Filter out only CANCELLED and ABSENT_EXCUSED lessons
      // ABSENT_UNEXCUSED should be counted (teacher still gets paid)
      const activeLessons = filteredLessons.filter(
        l => l.status !== LessonStatus.CANCELLED && l.status !== LessonStatus.ABSENT_EXCUSED
      );
      
      const totalHours = activeLessons.reduce((sum, l) => sum + (l.durationMinutes / 60), 0);
      
      let totalMoney = 0;

      if (activeTab === 'payroll') {
        // PAYROLL: Group by teacher → apply TEACHER guarantees only
        const teacherMap: Record<string, any> = {};

        filteredLessons.forEach(l => {
          const teacher = teachers.find(t => t.id === l.teacherId);
          if (!teacherMap[l.teacherId]) {
            teacherMap[l.teacherId] = { lessons: [], teacher };
          }
          teacherMap[l.teacherId].lessons.push(l);
        });

        Object.values(teacherMap).forEach((group: any) => {
          const teacherLessons = group.lessons;
          const tActiveLessons = teacherLessons.filter((l: any) => l.status !== LessonStatus.CANCELLED && l.status !== LessonStatus.ABSENT_EXCUSED);
          let teacherPay = tActiveLessons.reduce((sum: number, l: any) => sum + (l.teacherRate || 0), 0);
          if (!group.teacher) { totalMoney += teacherPay; return; }
          const inst = normalizeInstrument(group.teacher.instrument || 'unknown');

          // Group by date → school
          const dateSchoolMap: Record<string, Record<string, Lesson[]>> = {};
          tActiveLessons.forEach((l: Lesson) => {
            const date = l.date.substring(0, 10);
            if (!dateSchoolMap[date]) dateSchoolMap[date] = {};
            if (!dateSchoolMap[date][l.schoolId]) dateSchoolMap[date][l.schoolId] = [];
            dateSchoolMap[date][l.schoolId].push(l);
          });

          // Apply TEACHER guarantees per school per day
          Object.values(dateSchoolMap).forEach(schoolsOnDate => {
            Object.entries(schoolsOnDate).forEach(([schoolId, lessonsGroup]) => {
              const guarantee = resolveTeacherGuarantee(group.teacher, schoolId, inst);
              if (!guarantee || lessonsGroup.length === 0) return;
              const actualHours = lessonsGroup
                .filter((l: Lesson) => matchesDeliveryMode(guarantee.appliesTo, getDeliveryMode(l)))
                .reduce((sum: number, l: Lesson) => sum + (l.durationMinutes || 0) / 60, 0);
              if (actualHours < guarantee.minHours) {
                const shortfall = guarantee.minHours - actualHours;
                const dm = guarantee.appliesTo === 'online_only' ? DeliveryMode.ONLINE : DeliveryMode.IN_PERSON;
                teacherPay += shortfall * resolveTeacherRate(group.teacher, schoolId, 'Individual', dm);
              }
            });
          });

          totalMoney += teacherPay;
        });
      } else {
        // INVOICING: Group by school
        const schoolMap: Record<string, any> = {};
        
        // Filter out only CANCELLED and ABSENT_EXCUSED lessons FIRST
        // ABSENT_UNEXCUSED should be counted (school still gets invoiced)
        const activeFilteredLessons = filteredLessons.filter(
          l => l.status !== LessonStatus.CANCELLED && l.status !== LessonStatus.ABSENT_EXCUSED
        );
        
        activeFilteredLessons.forEach(l => {
          const school = schools.find(s => s.id === l.schoolId);
          if (!schoolMap[l.schoolId]) {
            schoolMap[l.schoolId] = {
              lessons: [],
              school
            };
          }
          schoolMap[l.schoolId].lessons.push(l);
        });

        Object.values(schoolMap).forEach((group: any) => {
          const schoolLessons = group.lessons as Lesson[];
          let schoolInvoice = schoolLessons.reduce((sum: number, l: Lesson) => sum + (l.schoolRate || 0), 0);
          if (!group.school) { totalMoney += schoolInvoice; return; }

          // Apply SCHOOL guarantees (per date + instrument, NOT per teacher)
          const dateInstrMap: Record<string, Record<string, Lesson[]>> = {};
          schoolLessons.forEach((l: Lesson) => {
            const date = l.date.substring(0, 10);
            const t = teachers.find(tc => tc.id === l.teacherId);
            const inst = normalizeInstrument(t?.instrument || 'unknown');
            if (!dateInstrMap[date]) dateInstrMap[date] = {};
            if (!dateInstrMap[date][inst]) dateInstrMap[date][inst] = [];
            dateInstrMap[date][inst].push(l);
          });

          Object.values(dateInstrMap).forEach(instruments => {
            Object.entries(instruments).forEach(([inst, lessonsGroup]) => {
              const guarantee = resolveSchoolGuarantee(group.school, inst);
              if (!guarantee) return;
              const actualHours = lessonsGroup
                .filter((l: Lesson) => matchesDeliveryMode(guarantee.appliesTo, getDeliveryMode(l)))
                .reduce((sum: number, l: Lesson) => sum + (l.durationMinutes || 0) / 60, 0);
              if (actualHours < guarantee.minHours) {
                const shortfall = guarantee.minHours - actualHours;
                const dm = guarantee.appliesTo === 'online_only' ? DeliveryMode.ONLINE : DeliveryMode.IN_PERSON;
                schoolInvoice += shortfall * resolveSchoolRate(group.school, '', inst, 'Individual', dm);
              }
            });
          });

          totalMoney += schoolInvoice;
        });
      }

      return { count: activeLessons.length, hours: totalHours, money: totalMoney };
  };

  const stats = getStats();

  // ── Shared class constants (visual only) ───────────────────────────────────
  const selectCls = 'bg-slate-800/80 border border-slate-700/80 text-white text-sm rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all p-2.5';

  return (
    <div className="space-y-8">
      {/* Page header + controls */}
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
        <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Financial Reports</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {activeTab === 'invoicing' ? 'School invoicing summary' : 'Teacher payroll summary'}
            </p>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
            <div>
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Year</label>
                <select
                    value={selectedYear}
                    onChange={(e) => handleYearChange(e.target.value)}
                    className={`${selectCls} w-32`}
                >
                    {yearOptions.map(year => (
                        <option key={year} value={year}>
                            {year}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Month</label>
                <select
                    value={selectedMonth}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    className={`${selectCls} w-40`}
                >
                    {monthNames.map(month => (
                        <option key={month.value} value={month.value}>
                            {month.label}
                        </option>
                    ))}
                </select>
            </div>

           <div>
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">School Filter</label>
              <select
                  value={selectedSchool}
                  onChange={(e) => setSelectedSchool(e.target.value)}
                  className={`${selectCls} w-40`}
              >
                  <option value="">All Schools</option>
                  {schools.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Teacher Filter</label>
              <select
                  value={selectedTeacher}
                  onChange={(e) => setSelectedTeacher(e.target.value)}
                  className={`${selectCls} w-40`}
              >
                  <option value="">All Teachers</option>
                  {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
              </select>
            </div>

            {/* Tab toggle */}
            <div className="flex bg-slate-800/80 ring-1 ring-white/10 p-1 rounded-xl">
                <button
                    onClick={() => setActiveTab('invoicing')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'invoicing' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:text-white'}`}
                >
                    School Invoicing
                </button>
                <button
                    onClick={() => setActiveTab('payroll')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'payroll' ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/20' : 'text-slate-400 hover:text-white'}`}
                >
                    Teacher Payroll
                </button>
            </div>

            <button
                onClick={handleExport}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-primary-900/20 transition-all active:scale-[0.98]"
            >
                Export Excel
            </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 ring-1 ring-amber-500/10 rounded-2xl p-6">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">
            {activeTab === 'invoicing' ? 'Total Invoiced' : 'Total Payable'}
          </p>
          <p className="text-3xl font-bold text-amber-400 tabular-nums">{stats.money.toFixed(2)} SAR</p>
          <p className="text-xs text-slate-500 mt-2">Before guarantee adjustments (calculated in Excel)</p>
        </div>

        <div className="bg-slate-900/60 ring-1 ring-blue-500/10 rounded-2xl p-6">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Total Hours</p>
          <p className="text-3xl font-bold text-blue-400 tabular-nums">{stats.hours.toFixed(1)} hrs</p>
          <p className="text-xs text-slate-500 mt-2">Billable hours this month</p>
        </div>

        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Lessons</p>
          <p className="text-3xl font-bold text-white tabular-nums">{stats.count}</p>
          <p className="text-xs text-slate-500 mt-2">Total scheduled sessions</p>
        </div>
      </div>

      {/* Footer note */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-xl p-4 flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
        <p className="text-xs text-slate-500">Guarantees are calculated during Excel export based on school/teacher configurations</p>
      </div>
    </div>
  );
};
