/**
 * financialCalculations.ts — Phase 17.G refactor
 *
 * Centralized financial metrics calculation with dual-guarantee architecture.
 * - School guarantee → affects INVOICES (revenue) only
 * - Teacher guarantee → affects PAYROLL only
 *
 * Guarantees are per DAY. Grouping:
 * - School: school + date + instrument (NOT per teacher)
 * - Teacher: teacher + school + date + instrument
 *
 * actualHours within a group = sum of lessons whose deliveryMode matches the
 * guarantee's appliesTo. Shortfall rate uses the centralized rate engine.
 */

import { Lesson, LessonStatus, School, Teacher, DeliveryMode, getDeliveryMode } from '../types';
import {
  resolveSchoolGuarantee,
  resolveTeacherGuarantee,
  resolveSchoolRate,
  resolveTeacherRate,
  matchesDeliveryMode,
  normalizeInstrument
} from './rateService';

export interface FinancialMetrics {
  revenue: number;
  payroll: number;
  totalHours: number;
  lessonCount: number;
}

/**
 * Calculate financial metrics with guarantee adjustments applied.
 * This ensures Dashboard and Financials show the same numbers.
 */
export const calculateFinancialMetrics = (
  lessons: Lesson[],
  schools: School[],
  teachers: Teacher[]
): FinancialMetrics => {
  // Filter out CANCELLED and ABSENT_EXCUSED lessons
  const activeLessons = lessons.filter(
    l => l.status !== LessonStatus.CANCELLED && l.status !== LessonStatus.ABSENT_EXCUSED
  );

  let totalRevenue = 0;
  let totalPayroll = 0;
  let totalHours = 0;

  // Calculate base revenue and payroll from lesson snapshots
  activeLessons.forEach(l => {
    totalRevenue += l.schoolRate || 0;
    totalPayroll += l.teacherRate || 0;
    totalHours += (l.durationMinutes || 0) / 60;
  });

  // -----------------------------------------------------------------------
  // SCHOOL GUARANTEES → REVENUE (per school + date + instrument)
  // -----------------------------------------------------------------------
  const schoolMap: Record<string, Lesson[]> = {};
  activeLessons.forEach(l => {
    if (!schoolMap[l.schoolId]) schoolMap[l.schoolId] = [];
    schoolMap[l.schoolId].push(l);
  });

  Object.entries(schoolMap).forEach(([schoolId, schoolLessons]) => {
    const school = schools.find(s => s.id === schoolId);
    if (!school) return;

    // Group by date → instrument (normalized)
    // Each lesson contributes hours under its teacher's instrument
    const dateInstrMap: Record<string, Record<string, Lesson[]>> = {};

    schoolLessons.forEach(l => {
      const date = l.date.substring(0, 10);
      const teacher = teachers.find(t => t.id === l.teacherId);
      const inst = normalizeInstrument(teacher?.instrument || 'unknown');

      if (!dateInstrMap[date]) dateInstrMap[date] = {};
      if (!dateInstrMap[date][inst]) dateInstrMap[date][inst] = [];
      dateInstrMap[date][inst].push(l);
    });

    // For each date + instrument group, check school guarantee
    Object.entries(dateInstrMap).forEach(([, instruments]) => {
      Object.entries(instruments).forEach(([inst, lessonsInGroup]) => {
        const guarantee = resolveSchoolGuarantee(school, inst);
        if (!guarantee) return;

        // actualHours = sum of lessons whose deliveryMode matches appliesTo
        const actualHours = lessonsInGroup
          .filter(l => matchesDeliveryMode(guarantee.appliesTo, getDeliveryMode(l)))
          .reduce((sum, l) => sum + (l.durationMinutes || 0) / 60, 0);

        if (actualHours < guarantee.minHours) {
          const shortfall = guarantee.minHours - actualHours;
          // Shortfall rate via centralized engine. Empty teacherId — guarantee
          // lines are school-level, not teacher-specific. Delivery mode for rate:
          // in_person_only → IN_PERSON rate, online_only → ONLINE rate, both → IN_PERSON rate
          const rateDeliveryMode = guarantee.appliesTo === 'online_only'
            ? DeliveryMode.ONLINE : DeliveryMode.IN_PERSON;
          const rate = resolveSchoolRate(school, '', inst, 'Individual', rateDeliveryMode);
          totalRevenue += shortfall * rate;
        }
      });
    });
  });

  // -----------------------------------------------------------------------
  // TEACHER GUARANTEES → PAYROLL (per teacher + school + date + instrument)
  // -----------------------------------------------------------------------
  const teacherMap: Record<string, Lesson[]> = {};
  activeLessons.forEach(l => {
    if (!teacherMap[l.teacherId]) teacherMap[l.teacherId] = [];
    teacherMap[l.teacherId].push(l);
  });

  Object.entries(teacherMap).forEach(([teacherId, teacherLessons]) => {
    const teacher = teachers.find(t => t.id === teacherId);
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

    // For each date + school group, check teacher guarantee
    Object.entries(dateSchoolMap).forEach(([, schoolsOnDate]) => {
      Object.entries(schoolsOnDate).forEach(([schoolId, lessonsInGroup]) => {
        const guarantee = resolveTeacherGuarantee(teacher, schoolId, inst);
        if (!guarantee) return;

        // Activation: at least 1 counted lesson must exist in this group
        // (activeLessons already excludes Cancelled + Absent_Excused, so
        // any lesson in this group counts as activation)
        if (lessonsInGroup.length === 0) return;

        // actualHours = sum of lessons whose deliveryMode matches appliesTo
        const actualHours = lessonsInGroup
          .filter(l => matchesDeliveryMode(guarantee.appliesTo, getDeliveryMode(l)))
          .reduce((sum, l) => sum + (l.durationMinutes || 0) / 60, 0);

        if (actualHours < guarantee.minHours) {
          const shortfall = guarantee.minHours - actualHours;
          const rateDeliveryMode = guarantee.appliesTo === 'online_only'
            ? DeliveryMode.ONLINE : DeliveryMode.IN_PERSON;
          const rate = resolveTeacherRate(teacher, schoolId, 'Individual', rateDeliveryMode);
          totalPayroll += shortfall * rate;
        }
      });
    });
  });

  return {
    revenue: Math.round(totalRevenue * 100) / 100,
    payroll: Math.round(totalPayroll * 100) / 100,
    totalHours: Math.round(totalHours * 10) / 10,
    lessonCount: activeLessons.length
  };
};
