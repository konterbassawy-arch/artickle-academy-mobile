/**
 * payrollService.ts — Phase 17.6
 *
 * Payroll line item generation and status resolution.
 * Reuses existing guarantee + rate engine from rateService.ts.
 *
 * Guarantee grouping follows Phase 17.G rules:
 *   teacher + school + date + instrument
 *   ONE guarantee adjustment line per group.
 *
 * Delivery mode filtering:
 *   actualHours = sum of lessons where matchesDeliveryMode(appliesTo, deliveryMode)
 */

import {
  Lesson,
  LessonStatus,
  Teacher,
  School,
  PayrollLineItem,
  PayrollRun,
  PayrollStatus,
  DeliveryMode,
  getDeliveryMode
} from '../types';

import {
  resolveTeacherGuarantee,
  resolveTeacherRate,
  matchesDeliveryMode,
  normalizeInstrument
} from './rateService';

/**
 * Generate payroll line items for a teacher within a period.
 *
 * Returns { lessonLines, guaranteeLines, lessonTotal, guaranteeTotal }.
 */
export function generatePayrollLineItems(
  teacher: Teacher,
  lessons: Lesson[],
  schools: School[],
  periodStart: string,
  periodEnd: string,
  schoolFilter?: string
): {
  lessonLines: PayrollLineItem[];
  guaranteeLines: PayrollLineItem[];
  lessonTotal: number;
  guaranteeTotal: number;
} {
  // Filter lessons: this teacher, within period, active statuses
  const filtered = lessons.filter(l => {
    if (l.teacherId !== teacher.id) return false;
    const d = l.date.substring(0, 10);
    if (d < periodStart || d > periodEnd) return false;
    if (l.status === LessonStatus.CANCELLED || l.status === LessonStatus.ABSENT_EXCUSED) return false;
    if (schoolFilter && l.schoolId !== schoolFilter) return false;
    return true;
  });

  // Sort by date
  filtered.sort((a, b) => a.date.localeCompare(b.date));

  const inst = normalizeInstrument(teacher.instrument || 'unknown');

  // --- Lesson lines ---
  const lessonLines: PayrollLineItem[] = filtered.map(l => {
    const school = schools.find(s => s.id === l.schoolId);
    const hours = (l.durationMinutes || 0) / 60;
    const amount = l.teacherRate || 0;
    return {
      date: new Date(l.date).getTime(),
      description: `${l.studentNames.join(', ')} — ${l.type} ${l.durationMinutes}min — ${l.status}`,
      hours,
      rate: hours > 0 ? parseFloat((amount / hours).toFixed(2)) : 0,
      amount,
      lessonId: l.id,
      schoolId: l.schoolId,
      schoolName: school?.name || l.schoolName,
      instrument: inst,
      type: 'lesson' as const
    };
  });

  // --- Guarantee lines ---
  // Group by date + school + instrument (Phase 17.G rules)
  const dateSchoolMap: Record<string, Record<string, Lesson[]>> = {};

  filtered.forEach(l => {
    const date = l.date.substring(0, 10);
    if (!dateSchoolMap[date]) dateSchoolMap[date] = {};
    if (!dateSchoolMap[date][l.schoolId]) dateSchoolMap[date][l.schoolId] = [];
    dateSchoolMap[date][l.schoolId].push(l);
  });

  const guaranteeLines: PayrollLineItem[] = [];

  Object.entries(dateSchoolMap).forEach(([date, schoolsOnDate]) => {
    Object.entries(schoolsOnDate).forEach(([schoolId, group]) => {
      const guarantee = resolveTeacherGuarantee(teacher, schoolId, inst);
      if (!guarantee || group.length === 0) return;

      // actualHours = sum of lessons where deliveryMode matches appliesTo
      const actualHours = group
        .filter(l => matchesDeliveryMode(guarantee.appliesTo, getDeliveryMode(l)))
        .reduce((sum, l) => sum + (l.durationMinutes || 0) / 60, 0);

      if (actualHours < guarantee.minHours) {
        const shortfall = guarantee.minHours - actualHours;
        const dm = guarantee.appliesTo === 'online_only' ? DeliveryMode.ONLINE : DeliveryMode.IN_PERSON;
        const rate = resolveTeacherRate(teacher, schoolId, 'Individual', dm);
        const amount = parseFloat((shortfall * rate).toFixed(2));

        const school = schools.find(s => s.id === schoolId);
        const dateObj = new Date(date + 'T00:00:00Z');
        const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const instDisplay = inst.charAt(0).toUpperCase() + inst.slice(1);

        guaranteeLines.push({
          date: dateObj.getTime(),
          description: `Guarantee adjustment — ${instDisplay} — ${school?.name || schoolId} — ${dateStr}`,
          hours: shortfall,
          rate,
          amount,
          schoolId,
          schoolName: school?.name,
          instrument: inst,
          type: 'guarantee' as const
        });
      }
    });
  });

  const lessonTotal = parseFloat(lessonLines.reduce((sum, l) => sum + l.amount, 0).toFixed(2));
  const guaranteeTotal = parseFloat(guaranteeLines.reduce((sum, l) => sum + l.amount, 0).toFixed(2));

  return { lessonLines, guaranteeLines, lessonTotal, guaranteeTotal };
}

/**
 * Determine payroll status after a settlement change.
 *
 * Rules:
 *   paidAmount >= totalPayable → PAID (locked)
 *   paidAmount > 0             → PARTIALLY_PAID
 *   paidAmount === 0           → preserve current (DRAFT or APPROVED)
 */
export function resolvePayrollStatusAfterSettlement(
  payroll: Pick<PayrollRun, 'totalPayable' | 'status'>,
  newPaidAmount: number
): { status: PayrollStatus; isLocked: boolean } {
  if (newPaidAmount >= payroll.totalPayable) {
    return { status: PayrollStatus.PAID, isLocked: true };
  }
  if (newPaidAmount > 0) {
    return { status: PayrollStatus.PARTIALLY_PAID, isLocked: true };
  }
  // paidAmount === 0 — revert to APPROVED if was previously settled, otherwise keep current
  if (payroll.status === PayrollStatus.PAID || payroll.status === PayrollStatus.PARTIALLY_PAID) {
    return { status: PayrollStatus.APPROVED, isLocked: true };
  }
  // Keep as-is (DRAFT or APPROVED)
  return { status: payroll.status, isLocked: payroll.status === PayrollStatus.APPROVED };
}
