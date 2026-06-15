/**
 * exportGrouping.ts — Phase 17.7A
 *
 * Shared grouping utilities for invoice and payroll exports.
 * Groups micro-line items into summarized rows for professional presentation.
 *
 * Does NOT modify any financial calculations.
 * Does NOT modify any Firestore data.
 */

import {
  Lesson,
  LessonStatus,
  Invoice,
  InvoicePayerType,
  PayrollLineItem,
  Teacher,
  School,
  DeliveryMode,
  getDeliveryMode
} from '../types';

import {
  resolveSchoolGuarantee,
  resolveSchoolRate,
  matchesDeliveryMode,
  normalizeInstrument
} from './rateService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GroupedInvoiceLine {
  date: string;           // YYYY-MM-DD
  dateTs: number;         // timestamp for sorting
  instrument: string;     // capitalized display name
  lessonType: string;     // 'Individual' | 'Group'
  actualHours: number;
  guaranteeAdj: number;   // additional hours from guarantee
  billedHours: number;    // actualHours + guaranteeAdj
  rate: number;           // school rate per hour
  lineTotal: number;      // billedHours × rate
  hasGuarantee: boolean;  // true if guarantee was applied
}

export interface GroupedPayrollLine {
  date: string;           // YYYY-MM-DD
  dateTs: number;
  schoolName: string;
  instrument: string;     // capitalized display name
  actualHours: number;
  guaranteeAdj: number;
  paidHours: number;      // actualHours + guaranteeAdj
  rate: number;
  lineTotal: number;
  hasGuarantee: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Lesson statuses that are billable on a B2B invoice */
const BILLABLE_STATUSES: readonly string[] = [
  LessonStatus.PRESENT,
  LessonStatus.TAUGHT,
  LessonStatus.ABSENT_UNEXCUSED,
];

// ---------------------------------------------------------------------------
// Invoice Grouping — from LESSON data (source of truth)
// ---------------------------------------------------------------------------

/**
 * Group lessons into summarized invoice rows for B2B school invoices.
 *
 * Grouping key: date + instrument + rate
 * Source: lessons filtered by school + period + billable status.
 * Guarantee adjustments are computed per date+instrument group and folded in.
 *
 * IMPORTANT: This is for DISPLAY only. Invoice totals come from the stored
 * invoice entity — never recalculated here.
 */
export function groupInvoiceLinesFromLessons(
  lessons: Lesson[],
  invoice: Invoice,
  teachers: Teacher[],
  schools: School[]
): GroupedInvoiceLine[] {
  // Only group B2B school invoices
  if (invoice.payerType !== InvoicePayerType.SCHOOL) return [];

  const school = schools.find(s => s.id === invoice.payerId);
  const periodStart = invoice.periodStart;
  const periodEnd = invoice.periodEnd;

  // Filter lessons: same school, within period, billable
  const billable = lessons.filter(l =>
    l.schoolId === invoice.payerId &&
    l.date.substring(0, 10) >= periodStart &&
    l.date.substring(0, 10) <= periodEnd &&
    BILLABLE_STATUSES.includes(l.status)
  );

  // Build groups: date + instrument + rate
  const groupMap: Record<string, {
    date: string;
    instrument: string;
    instrumentNorm: string;
    lessonType: string;
    rate: number;
    totalHours: number;
    lessons: Lesson[];
  }> = {};

  billable.forEach(l => {
    const date = l.date.substring(0, 10);
    const teacher = teachers.find(t => t.id === l.teacherId);
    const instNorm = normalizeInstrument(teacher?.instrument || 'unknown');
    const instDisplay = instNorm.charAt(0).toUpperCase() + instNorm.slice(1);
    const rate = l.schoolRate || 0;
    const hours = (l.durationMinutes || 0) / 60;
    const perHourRate = hours > 0 ? rate / hours : 0;
    const rateKey = perHourRate.toFixed(2);
    const key = `${date}|${instNorm}|${l.type}|${rateKey}`;

    if (!groupMap[key]) {
      groupMap[key] = {
        date,
        instrument: instDisplay,
        instrumentNorm: instNorm,
        lessonType: l.type,
        rate: perHourRate,
        totalHours: 0,
        lessons: [],
      };
    }
    groupMap[key].totalHours += hours;
    groupMap[key].lessons.push(l);
  });

  // Compute guarantee adjustments per date + instrument
  // (guarantee groups by date+instrument, not by rate — so we aggregate across rate sub-groups)
  const guaranteeMap: Record<string, number> = {}; // key: "date|instNorm" → shortfall hours

  if (school) {
    const dateInstMap: Record<string, Record<string, Lesson[]>> = {};
    billable.forEach(l => {
      const date = l.date.substring(0, 10);
      const teacher = teachers.find(t => t.id === l.teacherId);
      const inst = normalizeInstrument(teacher?.instrument || 'unknown');
      if (!dateInstMap[date]) dateInstMap[date] = {};
      if (!dateInstMap[date][inst]) dateInstMap[date][inst] = [];
      dateInstMap[date][inst].push(l);
    });

    Object.entries(dateInstMap).forEach(([date, instruments]) => {
      Object.entries(instruments).forEach(([inst, group]) => {
        const guarantee = resolveSchoolGuarantee(school, inst);
        if (!guarantee) return;

        const actualHours = group
          .filter(l => matchesDeliveryMode(guarantee.appliesTo, getDeliveryMode(l)))
          .reduce((sum, l) => sum + (l.durationMinutes || 0) / 60, 0);

        if (actualHours < guarantee.minHours) {
          const shortfall = guarantee.minHours - actualHours;
          guaranteeMap[`${date}|${inst}`] = shortfall;
        }
      });
    });
  }

  // Build result rows
  const rows: GroupedInvoiceLine[] = [];

  Object.values(groupMap).forEach(g => {
    const gKey = `${g.date}|${g.instrumentNorm}`;
    // Distribute guarantee proportionally if multiple rate sub-groups share same date+instrument
    // For simplicity: assign guarantee to the first rate group for that date+instrument
    let guaranteeHours = 0;
    if (guaranteeMap[gKey] !== undefined && guaranteeMap[gKey] > 0) {
      guaranteeHours = guaranteeMap[gKey];
      // Compute guarantee rate using resolveSchoolRate
      guaranteeMap[gKey] = 0; // consume it so it's not double-counted
    }

    let guaranteeAmount = 0;
    if (guaranteeHours > 0 && school) {
      const dm = DeliveryMode.IN_PERSON; // default for guarantee
      const gRate = resolveSchoolRate(school, '', g.instrumentNorm, 'Individual', dm);
      guaranteeAmount = parseFloat((guaranteeHours * gRate).toFixed(2));
    }

    const lessonTotal = parseFloat((g.totalHours * (g.totalHours > 0 ? (g.lessons.reduce((s, l) => s + (l.schoolRate || 0), 0) / g.totalHours) : 0)).toFixed(2));
    // Actually: rate per hour = sum(schoolRate) / totalHours for the group
    const ratePerHour = g.totalHours > 0
      ? parseFloat((g.lessons.reduce((s, l) => s + (l.schoolRate || 0), 0) / g.totalHours).toFixed(2))
      : 0;

    const billedHours = g.totalHours + guaranteeHours;
    const lineTotal = parseFloat((g.lessons.reduce((s, l) => s + (l.schoolRate || 0), 0) + guaranteeAmount).toFixed(2));

    rows.push({
      date: g.date,
      dateTs: new Date(g.date + 'T00:00:00Z').getTime(),
      instrument: g.instrument,
      lessonType: g.lessonType,
      actualHours: parseFloat(g.totalHours.toFixed(2)),
      guaranteeAdj: parseFloat(guaranteeHours.toFixed(2)),
      billedHours: parseFloat(billedHours.toFixed(2)),
      rate: ratePerHour,
      lineTotal,
      hasGuarantee: guaranteeHours > 0,
    });
  });

  // Sort by date then instrument
  rows.sort((a, b) => a.dateTs - b.dateTs || a.instrument.localeCompare(b.instrument));

  return rows;
}

// ---------------------------------------------------------------------------
// Payroll Grouping — from PayrollLineItem data
// ---------------------------------------------------------------------------

/**
 * Group payroll line items into summarized rows.
 *
 * Grouping key: date + school + instrument + rate
 * Lesson and guarantee items are merged into the same group.
 * Manual adjustment items are returned separately.
 */
export function groupPayrollLines(
  lineItems: PayrollLineItem[]
): { grouped: GroupedPayrollLine[]; manualAdjustments: PayrollLineItem[] } {
  const manualAdjustments = lineItems.filter(li => li.type === 'manual_adjustment');
  const groupable = lineItems.filter(li => li.type !== 'manual_adjustment');

  const groupMap: Record<string, {
    date: string;
    schoolName: string;
    instrument: string;
    rate: number;
    lessonHours: number;
    lessonAmount: number;
    guaranteeHours: number;
    guaranteeAmount: number;
  }> = {};

  groupable.forEach(li => {
    const date = new Date(li.date).toISOString().substring(0, 10);
    const inst = (li.instrument || 'unknown').charAt(0).toUpperCase() + (li.instrument || 'unknown').slice(1);
    const instNorm = (li.instrument || 'unknown').toLowerCase();
    const schoolName = li.schoolName || 'Unknown';
    const rate = li.rate || 0;
    const rateKey = rate.toFixed(2);
    const key = `${date}|${li.schoolId || ''}|${instNorm}|${rateKey}`;

    if (!groupMap[key]) {
      groupMap[key] = {
        date,
        schoolName,
        instrument: inst,
        rate,
        lessonHours: 0,
        lessonAmount: 0,
        guaranteeHours: 0,
        guaranteeAmount: 0,
      };
    }

    if (li.type === 'lesson') {
      groupMap[key].lessonHours += li.hours;
      groupMap[key].lessonAmount += li.amount;
    } else if (li.type === 'guarantee') {
      groupMap[key].guaranteeHours += li.hours;
      groupMap[key].guaranteeAmount += li.amount;
    }
  });

  const grouped: GroupedPayrollLine[] = Object.values(groupMap).map(g => ({
    date: g.date,
    dateTs: new Date(g.date + 'T00:00:00Z').getTime(),
    schoolName: g.schoolName,
    instrument: g.instrument,
    actualHours: parseFloat(g.lessonHours.toFixed(2)),
    guaranteeAdj: parseFloat(g.guaranteeHours.toFixed(2)),
    paidHours: parseFloat((g.lessonHours + g.guaranteeHours).toFixed(2)),
    rate: g.rate,
    lineTotal: parseFloat((g.lessonAmount + g.guaranteeAmount).toFixed(2)),
    hasGuarantee: g.guaranteeHours > 0,
  }));

  grouped.sort((a, b) => a.dateTs - b.dateTs || a.schoolName.localeCompare(b.schoolName) || a.instrument.localeCompare(b.instrument));

  return { grouped, manualAdjustments };
}
