/**
 * payrollExportService.ts — Phase 17.7A
 *
 * Payroll Excel + PDF export with grouped line items.
 * Payroll Register batch export for all teachers.
 * Uses SheetJS (XLSX) via CDN for Excel, jsPDF via CDN for PDF.
 * Artickle branding for PDF output.
 *
 * Grouped by date + school + instrument + rate from PayrollLineItem data.
 * Manual adjustments shown in separate section.
 *
 * CRITICAL: Totals come from stored payroll entity — NEVER recalculated.
 *
 * Does NOT modify any existing export paths or Firestore data.
 */

import {
  PayrollRun,
  PayrollLineItem,
  PayrollStatus,
  School,
  getPayrollBalanceDue
} from '../types';

import { groupPayrollLines, GroupedPayrollLine } from './exportGrouping';
import { loadAcademyStamp, drawAcademyStamp } from './exportUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  approved: 'Approved',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

const fmtDate = (iso: string | undefined): string => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
};

const fmtTs = (ts: number | undefined): string => {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtCurrency = (amount: number): string => `${amount.toFixed(2)}`;

const fmtPeriod = (start: string | undefined, end: string | undefined): string => {
  if (!start && !end) return '';
  const s = start ? fmtDate(start) : '';
  const e = end ? fmtDate(end) : '';
  if (s && e) return `${s} – ${e}`;
  return s || e;
};

// Compact "DD MMM YY" (2-digit year) for tight PDF columns
const fmtDateShort = (iso: string | undefined): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const mon = d.toLocaleDateString('en-GB', { month: 'short' });
    const yr = String(d.getFullYear()).slice(2);
    return `${day} ${mon} ${yr}`;
  } catch { return iso; }
};

const fmtPeriodShort = (start: string | undefined, end: string | undefined): string => {
  if (!start && !end) return '';
  const s = start ? fmtDateShort(start) : '';
  const e = end ? fmtDateShort(end) : '';
  if (s && e) return `${s} – ${e}`;
  return s || e;
};

const loadLogoBase64 = async (): Promise<string | null> => {
  try {
    const resp = await fetch('/logo.png');
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
};

// ---------------------------------------------------------------------------
// Excel Export — Individual Payroll
// ---------------------------------------------------------------------------

export function exportPayrollExcel(
  payroll: PayrollRun,
  schoolName?: string,
  currencyCode: string = 'SAR'
): void {
  const XLSX = (window as any).XLSX;
  if (!XLSX) { alert('Excel library not loaded. Please refresh.'); return; }

  const balanceDue = getPayrollBalanceDue(payroll);
  const manualTotal = payroll.manualAdjustmentTotal || 0;

  const rows: any[][] = [];
  rows.push(['Payroll Export']);
  rows.push([]);
  rows.push(['Payroll Number', payroll.payrollNumber]);
  rows.push(['Teacher', payroll.teacherName]);
  rows.push(['Period Start', fmtDate(payroll.periodStart)]);
  rows.push(['Period End', fmtDate(payroll.periodEnd)]);
  if (payroll.schoolFilter) rows.push(['School Filter', schoolName || payroll.schoolFilter]);
  rows.push(['Status', STATUS_LABELS[payroll.status] || payroll.status]);
  rows.push([]);

  // Unified line items — interleave manual adjustments by date
  const { grouped, manualAdjustments } = groupPayrollLines(payroll.lineItems || []);
  const hasAnyGuarantee = grouped.some(g => g.hasGuarantee);

  const unifiedExcel = [
    ...grouped.map(g => ({ kind: 'grouped' as const, dateTs: g.dateTs, data: g })),
    ...manualAdjustments.map(m => ({ kind: 'manual' as const, dateTs: m.date, data: m })),
  ].sort((a, b) => a.dateTs - b.dateTs);

  const lineHeader = hasAnyGuarantee
    ? ['#', 'Date', 'School', 'Instrument', 'Description', 'Actual Hours', 'Guarantee Adj.', 'Paid Hours', `Rate (${currencyCode})`, `Line Total (${currencyCode})`, 'Note']
    : ['#', 'Date', 'School', 'Instrument', 'Description', 'Hours', `Rate (${currencyCode})`, `Line Total (${currencyCode})`];
  rows.push(lineHeader);

  let rowNum = 1;
  unifiedExcel.forEach(row => {
    if (row.kind === 'manual') {
      const m = row.data as PayrollLineItem;
      const manualDesc = `(Manual) ${m.description || ''}`.trim();
      if (hasAnyGuarantee) {
        rows.push([rowNum++, fmtDate(m.date), '', '', manualDesc, '', '', '', '', m.amount, '']);
      } else {
        rows.push([rowNum++, fmtDate(m.date), '', '', manualDesc, '', '', m.amount]);
      }
    } else {
      const g = row.data as GroupedPayrollLine;
      if (hasAnyGuarantee) {
        rows.push([rowNum++, fmtDate(g.date), g.schoolName, g.instrument, '', g.actualHours, g.guaranteeAdj > 0 ? g.guaranteeAdj : '', g.paidHours, g.rate, g.lineTotal, g.hasGuarantee ? 'Guarantee Applied' : '']);
      } else {
        rows.push([rowNum++, fmtDate(g.date), g.schoolName, g.instrument, '', g.paidHours, g.rate, g.lineTotal]);
      }
    }
  });

  rows.push([]);

  // Totals — from stored payroll
  rows.push(['Lesson Total', payroll.lessonTotal]);
  rows.push(['Guarantee Total', payroll.guaranteeTotal]);
  if (manualTotal !== 0) rows.push(['Manual Adjustments', manualTotal]);
  rows.push(['Total Payable', payroll.totalPayable]);
  rows.push(['Paid Amount', payroll.paidAmount || 0]);
  rows.push(['Balance Due', balanceDue]);
  if (payroll.paidAt) rows.push(['Paid At', fmtTs(payroll.paidAt)]);
  if (payroll.notes) rows.push(['Notes', payroll.notes]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 6 },   // #
    { wch: 16 },  // Date
    { wch: 20 },  // School
    { wch: 14 },  // Instrument
    { wch: 28 },  // Description (manual adj. only)
    { wch: 14 },  // Actual / Hours
    { wch: 14 },  // Guarantee / Rate
    { wch: 14 },  // Paid / Total
    { wch: 14 },  // Rate
    { wch: 16 },  // Line Total
    { wch: 18 },  // Note
  ];

  const firstName = (payroll.teacherName || '').split(' ')[0].toUpperCase();
  XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
  XLSX.writeFile(wb, `PAYROLL_${firstName}_${payroll.payrollNumber}.xlsx`);
}

// ---------------------------------------------------------------------------
// PDF Export — Individual Payroll
// ---------------------------------------------------------------------------

async function buildPayrollPDFDoc(
  payroll: PayrollRun,
  schoolName?: string,
  currencyCode: string = 'SAR',
  options?: { stripNotes?: boolean }
): Promise<any> {
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF();

  // --- Brand colors ---
  const DARK = [31, 41, 55] as const;
  const LIME = [200, 255, 0] as const;
  const SLATE_LIGHT = [248, 250, 252] as const;
  const SLATE_BORDER = [200, 213, 225] as const;
  const TEXT_BODY = [71, 85, 105] as const;
  const TEXT_MUTED = [148, 163, 184] as const;
  const AMBER_BG = [255, 251, 235] as const;
  const AMBER_TEXT = [180, 120, 0] as const;
  const PURPLE_BG = [250, 245, 255] as const;

  const leftMargin = 15;
  const rightMargin = 195;
  const contentWidth = rightMargin - leftMargin;
  const lineHeight = 6;
  const pageHeight = 280;

  const sectionTitle = (title: string, yPos: number): number => {
    doc.setDrawColor(...LIME);
    doc.setLineWidth(1.5);
    doc.line(leftMargin, yPos - 1, leftMargin + 4, yPos - 1);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...DARK);
    doc.text(title, leftMargin + 7, yPos);
    return yPos + 8;
  };

  const fieldRow = (label: string, value: string, x: number, yPos: number, valOffset: number = 35): number => {
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(label, x, yPos);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...TEXT_BODY);
    doc.text(value || '—', x + valOffset, yPos);
    return yPos + lineHeight;
  };

  const checkPage = (y: number, needed: number): number => {
    if (y + needed > pageHeight) {
      doc.addPage();
      return 15;
    }
    return y;
  };

  const balanceDue = getPayrollBalanceDue(payroll);
  const manualTotal = payroll.manualAdjustmentTotal || 0;

  // ===== HEADER =====
  const headerHeight = 52;
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 210, headerHeight, 'F');

  const logoBase64 = await loadLogoBase64();
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 14, 6, 22, 22); } catch {}
  }

  const titleX = logoBase64 ? 42 : 15;
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Artickle', titleX, 17);
  doc.setTextColor(...LIME);
  doc.text(' Academy', titleX + doc.getTextWidth('Artickle'), 17);

  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...LIME);
  doc.text('Payroll Statement', titleX, 25);

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(payroll.payrollNumber, titleX, 35);

  doc.setFontSize(9);
  doc.setTextColor(...LIME);
  doc.text(STATUS_LABELS[payroll.status] || payroll.status, titleX, 43);

  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  const now = new Date();
  doc.text(
    `Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    rightMargin - 55, 43
  );

  doc.setDrawColor(...LIME);
  doc.setLineWidth(1.2);
  doc.line(leftMargin, headerHeight - 2, rightMargin, headerHeight - 2);

  let y = headerHeight + 10;

  // ===== PAYROLL DETAILS =====
  y = sectionTitle('PAYROLL DETAILS', y);

  const detailRows = 3 + (payroll.schoolFilter ? 1 : 0);
  const infoBoxH = detailRows * lineHeight + 8;
  doc.setFillColor(...SLATE_LIGHT);
  doc.setDrawColor(...SLATE_BORDER);
  doc.setLineWidth(0.4);
  doc.roundedRect(leftMargin, y - 5, contentWidth, infoBoxH, 2, 2, 'FD');

  const col1X = leftMargin + 4;
  const col2X = leftMargin + 98;

  y = fieldRow('Teacher:', payroll.teacherName, col1X, y);
  const rowY = y;
  y = fieldRow('Period:', `${fmtDate(payroll.periodStart)} – ${fmtDate(payroll.periodEnd)}`, col1X, y);
  fieldRow('Status:', STATUS_LABELS[payroll.status] || payroll.status, col2X, rowY);

  if (payroll.schoolFilter) {
    y = fieldRow('School:', schoolName || payroll.schoolFilter, col1X, y);
  }

  y += 8;

  // ===== LINE ITEMS =====
  y = checkPage(y, 30);
  y = sectionTitle('LINE ITEMS', y);

  const { grouped, manualAdjustments } = groupPayrollLines(payroll.lineItems || []);
  const hasAnyGuarantee = grouped.some(g => g.hasGuarantee);

  // Unified sorted list — interleave manual adjustments by date
  type UnifiedRow =
    | { kind: 'grouped'; dateTs: number; data: GroupedPayrollLine }
    | { kind: 'manual'; dateTs: number; data: PayrollLineItem };

  const unifiedRows: UnifiedRow[] = [
    ...grouped.map(g => ({ kind: 'grouped' as const, dateTs: g.dateTs, data: g })),
    ...manualAdjustments.map(m => ({ kind: 'manual' as const, dateTs: m.date, data: m })),
  ].sort((a, b) => a.dateTs - b.dateTs);

  // Table header
  doc.setFillColor(...DARK);
  doc.rect(leftMargin, y - 4, contentWidth, 8, 'F');
  doc.setFontSize(7);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);

  const cDate = leftMargin + 2;
  const cSchool = leftMargin + 24;
  const cInst = leftMargin + 52;
  const cTotal = rightMargin - 5;

  if (hasAnyGuarantee) {
    const cActual = rightMargin - 72;
    const cGuar = rightMargin - 56;
    const cPaid = rightMargin - 40;
    const cRate = rightMargin - 24;

    doc.text('Date', cDate, y);
    doc.text('School', cSchool, y);
    doc.text('Instrument', cInst, y);
    doc.text('Actual', cActual, y, { align: 'right' });
    doc.text('Guar.', cGuar, y, { align: 'right' });
    doc.text('Paid', cPaid, y, { align: 'right' });
    doc.text('Rate', cRate, y, { align: 'right' });
    doc.text('Total', cTotal, y, { align: 'right' });
    y += 7;

    let rowIdx = 0;
    unifiedRows.forEach(row => {
      if (row.kind === 'manual') {
        const m = row.data as PayrollLineItem;
        y = checkPage(y, 7);
        doc.setFillColor(...PURPLE_BG);
        doc.rect(leftMargin, y - 4, contentWidth, 6, 'F');
        doc.setFontSize(7);
        doc.setTextColor(130, 80, 200);
        doc.setFont(undefined, 'bold');
        doc.text(fmtDate(m.date), cDate, y);
        doc.text('Manual', cSchool, y);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...TEXT_BODY);
        const maxDescW = cActual - cInst - 4;
        const truncDesc = doc.splitTextToSize(m.description || '', maxDescW)[0] || '';
        doc.text(truncDesc, cInst, y);
        doc.setFont(undefined, 'bold');
        doc.text(fmtCurrency(m.amount), cTotal, y, { align: 'right' });
        y += 6;
        return;
      }

      const g = row.data as GroupedPayrollLine;
      y = checkPage(y, 12);

      if (g.hasGuarantee) {
        doc.setFillColor(...AMBER_BG);
        doc.rect(leftMargin, y - 4, contentWidth, 6, 'F');
      } else if (rowIdx % 2 === 0) {
        doc.setFillColor(...SLATE_LIGHT);
        doc.rect(leftMargin, y - 4, contentWidth, 6, 'F');
      }
      rowIdx++;

      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...TEXT_BODY);
      doc.text(fmtDate(g.date), cDate, y);
      const maxSchoolW = cInst - cSchool - 4;
      doc.text(doc.splitTextToSize(g.schoolName, maxSchoolW)[0] || g.schoolName, cSchool, y);
      doc.text(g.instrument, cInst, y);
      doc.text(g.actualHours.toFixed(2), cActual, y, { align: 'right' });

      if (g.guaranteeAdj > 0) {
        doc.setTextColor(...AMBER_TEXT);
        doc.setFont(undefined, 'bold');
        doc.text(`+${g.guaranteeAdj.toFixed(2)}`, cGuar, y, { align: 'right' });
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...TEXT_BODY);
      } else {
        doc.text('—', cGuar, y, { align: 'right' });
      }

      doc.text(g.paidHours.toFixed(2), cPaid, y, { align: 'right' });
      doc.text(fmtCurrency(g.rate), cRate, y, { align: 'right' });
      doc.setFont(undefined, 'bold');
      doc.text(fmtCurrency(g.lineTotal), cTotal, y, { align: 'right' });

      if (g.hasGuarantee) {
        y += 5;
        y = checkPage(y, 5);
        doc.setFontSize(6);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...AMBER_TEXT);
        const badgeText = 'Guarantee Applied';
        const badgeWidth = doc.getTextWidth(badgeText) + 4;
        doc.setFillColor(...AMBER_BG);
        doc.setDrawColor(...AMBER_TEXT);
        doc.setLineWidth(0.2);
        doc.roundedRect(cSchool - 1, y - 3.5, badgeWidth, 4.5, 1, 1, 'FD');
        doc.text(badgeText, cSchool + 1, y);
        doc.setTextColor(...TEXT_BODY);
      }
      y += 6;
    });
  } else {
    const cHours = rightMargin - 40;
    const cRate = rightMargin - 24;

    doc.text('Date', cDate, y);
    doc.text('School', cSchool, y);
    doc.text('Instrument', cInst, y);
    doc.text('Hours', cHours, y, { align: 'right' });
    doc.text('Rate', cRate, y, { align: 'right' });
    doc.text('Total', cTotal, y, { align: 'right' });
    y += 7;

    let rowIdx = 0;
    unifiedRows.forEach(row => {
      if (row.kind === 'manual') {
        const m = row.data as PayrollLineItem;
        y = checkPage(y, 7);
        doc.setFillColor(...PURPLE_BG);
        doc.rect(leftMargin, y - 4, contentWidth, 6, 'F');
        doc.setFontSize(7);
        doc.setTextColor(130, 80, 200);
        doc.setFont(undefined, 'bold');
        doc.text(fmtDate(m.date), cDate, y);
        doc.text('Manual', cSchool, y);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...TEXT_BODY);
        const maxDescW = cHours - cInst - 4;
        const truncDesc = doc.splitTextToSize(m.description || '', maxDescW)[0] || '';
        doc.text(truncDesc, cInst, y);
        doc.setFont(undefined, 'bold');
        doc.text(fmtCurrency(m.amount), cTotal, y, { align: 'right' });
        y += 6;
        return;
      }

      const g = row.data as GroupedPayrollLine;
      y = checkPage(y, 7);
      if (rowIdx % 2 === 0) {
        doc.setFillColor(...SLATE_LIGHT);
        doc.rect(leftMargin, y - 4, contentWidth, 6, 'F');
      }
      rowIdx++;

      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...TEXT_BODY);
      doc.text(fmtDate(g.date), cDate, y);
      const maxSchoolW = cInst - cSchool - 4;
      doc.text(doc.splitTextToSize(g.schoolName, maxSchoolW)[0] || g.schoolName, cSchool, y);
      doc.text(g.instrument, cInst, y);
      doc.text(g.paidHours.toFixed(2), cHours, y, { align: 'right' });
      doc.text(fmtCurrency(g.rate), cRate, y, { align: 'right' });
      doc.setFont(undefined, 'bold');
      doc.text(fmtCurrency(g.lineTotal), cTotal, y, { align: 'right' });
      y += 6;
    });
  }

  // ===== TOTALS (from stored payroll — NEVER recalculated) =====
  y += 4;
  y = checkPage(y, 50);

  const totalsX = rightMargin - 70;
  const totalsValX = rightMargin - 5;

  doc.setDrawColor(...SLATE_BORDER);
  doc.setLineWidth(0.3);
  doc.line(totalsX, y - 2, rightMargin, y - 2);

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...TEXT_BODY);

  doc.text('Lesson Total:', totalsX, y + 2);
  doc.text(`${currencyCode} ${fmtCurrency(payroll.lessonTotal)}`, totalsValX, y + 2, { align: 'right' });
  y += 6;

  doc.text('Guarantee Total:', totalsX, y + 2);
  doc.text(`${currencyCode} ${fmtCurrency(payroll.guaranteeTotal)}`, totalsValX, y + 2, { align: 'right' });
  y += 6;

  if (manualTotal !== 0) {
    doc.text('Manual Adjustments:', totalsX, y + 2);
    doc.text(`${currencyCode} ${fmtCurrency(manualTotal)}`, totalsValX, y + 2, { align: 'right' });
    y += 6;
  }

  doc.setDrawColor(...SLATE_BORDER);
  doc.line(totalsX, y - 1, rightMargin, y - 1);

  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text('Total Payable:', totalsX, y + 3);
  doc.text(`${currencyCode} ${fmtCurrency(payroll.totalPayable)}`, totalsValX, y + 3, { align: 'right' });
  y += 8;

  if (payroll.paidAmount > 0) {
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(16, 185, 129);
    doc.text('Paid:', totalsX, y + 2);
    doc.text(`${currencyCode} ${fmtCurrency(payroll.paidAmount)}`, totalsValX, y + 2, { align: 'right' });
    y += 6;
  }

  if (balanceDue > 0 && payroll.status !== PayrollStatus.CANCELLED) {
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(245, 158, 11);
    doc.text('Balance Due:', totalsX, y + 2);
    doc.text(`${currencyCode} ${fmtCurrency(balanceDue)}`, totalsValX, y + 2, { align: 'right' });
    y += 8;
  }

  // Notes (admin only, skipped if stripNotes)
  if (payroll.notes && !options?.stripNotes) {
    y += 4;
    y = checkPage(y, 15);
    y = sectionTitle('NOTES', y);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_MUTED);
    const noteLines = doc.splitTextToSize(payroll.notes, contentWidth - 10);
    noteLines.forEach((line: string) => {
      y = checkPage(y, 5);
      doc.text(line, leftMargin + 4, y);
      y += 4;
    });
  }

  // Academy stamp — authorised seal, lower-right above the footer
  const stamp = await loadAcademyStamp();
  if (stamp) {
    const stampSize = 30;
    y = checkPage(y, stampSize + 12);
    const sx = rightMargin - stampSize;
    const sy = Math.max(y + 4, 240);
    drawAcademyStamp(doc, stamp, sx, sy, stampSize, TEXT_MUTED);
  }

  // Footer
  const footY = 290;
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Artickle Academy — Payroll Statement', leftMargin, footY);
  doc.text(payroll.payrollNumber, rightMargin, footY, { align: 'right' });

  return doc;
}

export async function exportPayrollPDF(
  payroll: PayrollRun,
  schoolName?: string,
  currencyCode: string = 'SAR',
  options?: { stripNotes?: boolean }
): Promise<void> {
  if (typeof (window as any).jspdf === 'undefined') {
    alert('PDF library loading... please wait or refresh.');
    return;
  }
  const doc = await buildPayrollPDFDoc(payroll, schoolName, currencyCode, options);
  const firstNamePdf = (payroll.teacherName || '').split(' ')[0].toUpperCase();
  doc.save(`PAYROLL_${firstNamePdf}_${payroll.payrollNumber}.pdf`);
}

// ---------------------------------------------------------------------------
// ZIP Export — Multiple Individual PDFs bundled into one ZIP
// ---------------------------------------------------------------------------

export async function exportPayrollZip(
  payrollRuns: PayrollRun[],
  schools: School[],
  currencyCode: string = 'SAR'
): Promise<void> {
  if (typeof (window as any).jspdf === 'undefined') {
    alert('PDF library loading... please wait or refresh.');
    return;
  }
  const JSZip = (window as any).JSZip;
  if (!JSZip) {
    alert('ZIP library not loaded. Please refresh.');
    return;
  }

  const zip = new JSZip();

  for (const pr of payrollRuns) {
    const schoolName = pr.schoolFilter
      ? schools.find(s => s.id === pr.schoolFilter)?.name
      : undefined;
    const doc = await buildPayrollPDFDoc(pr, schoolName, currencyCode);
    const firstName = (pr.teacherName || '').split(' ')[0].toUpperCase();
    const filename = `PAYROLL_${firstName}_${pr.payrollNumber}.pdf`;
    zip.file(filename, doc.output('arraybuffer'));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  link.download = `Payrolls_ZIP_${dateStr}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Payroll Register — Batch Export (all teachers for a period)
// ---------------------------------------------------------------------------

export interface PayrollRegisterFilters {
  month: string;           // YYYY-MM
  schoolFilter?: string;   // optional school ID
  statusFilter?: string;   // optional status filter
  preFiltered?: boolean;   // if true, skip internal filter — payrollRuns is already the final set
  labelOverride?: string;  // replaces the month label in document headers
}

/**
 * Filter payroll runs for the register based on month, school, and status.
 */
function filterPayrollRuns(
  payrollRuns: PayrollRun[],
  filters: PayrollRegisterFilters
): PayrollRun[] {
  if (filters.preFiltered) return payrollRuns;

  const { month, schoolFilter, statusFilter } = filters;
  const [y, m] = month.split('-').map(Number);
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return payrollRuns.filter(pr => {
    if (pr.periodEnd < monthStart || pr.periodStart > monthEnd) return false;
    if (schoolFilter && pr.schoolFilter !== schoolFilter) return false;
    if (statusFilter && statusFilter !== 'all' && pr.status !== statusFilter) return false;
    return true;
  });
}

function getMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/**
 * Export Payroll Register as Excel.
 */
export function exportPayrollRegisterExcel(
  payrollRuns: PayrollRun[],
  schools: School[],
  filters: PayrollRegisterFilters,
  currencyCode: string = 'SAR'
): void {
  const XLSX = (window as any).XLSX;
  if (!XLSX) { alert('Excel library not loaded. Please refresh.'); return; }

  const filtered = filterPayrollRuns(payrollRuns, filters);
  const monthLabel = filters.labelOverride || getMonthLabel(filters.month);

  const rows: any[][] = [];
  rows.push(['Payroll Register']);
  rows.push([]);
  rows.push(['Period', monthLabel]);
  if (filters.schoolFilter) {
    const school = schools.find(s => s.id === filters.schoolFilter);
    rows.push(['School', school?.name || filters.schoolFilter]);
  }
  if (filters.statusFilter && filters.statusFilter !== 'all') {
    rows.push(['Status Filter', STATUS_LABELS[filters.statusFilter] || filters.statusFilter]);
  }
  rows.push(['Total Records', filtered.length]);
  rows.push([]);

  // Table header
  const header = [
    '#', 'Payroll Number', 'Period', 'Teacher', 'School',
    'Lesson Hours', 'Guarantee Hours',
    `Lesson Total (${currencyCode})`, `Guarantee Total (${currencyCode})`,
    `Manual Adj. (${currencyCode})`, `Total Payable (${currencyCode})`,
    `Paid (${currencyCode})`, `Balance Due (${currencyCode})`, 'Status'
  ];
  rows.push(header);

  let grandLessonTotal = 0;
  let grandGuaranteeTotal = 0;
  let grandManualTotal = 0;
  let grandTotalPayable = 0;
  let grandPaid = 0;
  let grandBalanceDue = 0;

  filtered
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName))
    .forEach((pr, idx) => {
      const school = pr.schoolFilter ? schools.find(s => s.id === pr.schoolFilter)?.name || pr.schoolFilter : 'All';
      const lessonHours = (pr.lineItems || []).filter(li => li.type === 'lesson').reduce((s, li) => s + li.hours, 0);
      const guarHours = (pr.lineItems || []).filter(li => li.type === 'guarantee').reduce((s, li) => s + li.hours, 0);
      const manual = pr.manualAdjustmentTotal || 0;
      const balance = getPayrollBalanceDue(pr);

      grandLessonTotal += pr.lessonTotal;
      grandGuaranteeTotal += pr.guaranteeTotal;
      grandManualTotal += manual;
      grandTotalPayable += pr.totalPayable;
      grandPaid += pr.paidAmount;
      grandBalanceDue += balance;

      rows.push([
        idx + 1,
        pr.payrollNumber,
        fmtPeriod(pr.periodStart, pr.periodEnd),
        pr.teacherName,
        school,
        parseFloat(lessonHours.toFixed(2)),
        parseFloat(guarHours.toFixed(2)),
        pr.lessonTotal,
        pr.guaranteeTotal,
        manual,
        pr.totalPayable,
        pr.paidAmount,
        balance,
        STATUS_LABELS[pr.status] || pr.status,
      ]);
    });

  // Grand totals
  rows.push([]);
  rows.push([
    '', '', '', 'GRAND TOTALS', '',
    '', '',
    parseFloat(grandLessonTotal.toFixed(2)),
    parseFloat(grandGuaranteeTotal.toFixed(2)),
    parseFloat(grandManualTotal.toFixed(2)),
    parseFloat(grandTotalPayable.toFixed(2)),
    parseFloat(grandPaid.toFixed(2)),
    parseFloat(grandBalanceDue.toFixed(2)),
    '',
  ]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 4 }, { wch: 18 }, { wch: 26 }, { wch: 20 }, { wch: 16 },
    { wch: 12 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Payroll Register');
  XLSX.writeFile(wb, `Payroll-Register-${filters.month}.xlsx`);
}

/**
 * Export Payroll Register as PDF.
 */
export async function exportPayrollRegisterPDF(
  payrollRuns: PayrollRun[],
  schools: School[],
  filters: PayrollRegisterFilters,
  currencyCode: string = 'SAR'
): Promise<void> {
  if (typeof (window as any).jspdf === 'undefined') {
    alert('PDF library loading... please wait or refresh.');
    return;
  }
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF('landscape');

  const DARK = [31, 41, 55] as const;
  const LIME = [200, 255, 0] as const;
  const SLATE_LIGHT = [248, 250, 252] as const;
  const SLATE_BORDER = [200, 213, 225] as const;
  const TEXT_BODY = [71, 85, 105] as const;
  const TEXT_MUTED = [148, 163, 184] as const;

  const leftMargin = 12;
  const rightMargin = 285;
  const contentWidth = rightMargin - leftMargin;
  const pageHeight = 195;

  const checkPage = (y: number, needed: number): number => {
    if (y + needed > pageHeight) {
      doc.addPage();
      return 15;
    }
    return y;
  };

  const filtered = filterPayrollRuns(payrollRuns, filters);
  const monthLabel = filters.labelOverride || getMonthLabel(filters.month);

  // ===== HEADER =====
  const headerHeight = 42;
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 297, headerHeight, 'F');

  const logoBase64 = await loadLogoBase64();
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 12, 5, 18, 18); } catch {}
  }

  const titleX = logoBase64 ? 35 : 12;
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Artickle', titleX, 15);
  doc.setTextColor(...LIME);
  doc.text(' Academy', titleX + doc.getTextWidth('Artickle'), 15);

  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...LIME);
  doc.text('Payroll Register', titleX, 23);

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(monthLabel, titleX, 33);

  // Filters info
  let filterText = `${filtered.length} payroll runs`;
  if (filters.schoolFilter) {
    const school = schools.find(s => s.id === filters.schoolFilter);
    filterText += ` • School: ${school?.name || filters.schoolFilter}`;
  }
  if (filters.statusFilter && filters.statusFilter !== 'all') {
    filterText += ` • Status: ${STATUS_LABELS[filters.statusFilter] || filters.statusFilter}`;
  }
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(filterText, rightMargin, 33, { align: 'right' });

  const now = new Date();
  doc.text(
    `Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    rightMargin, 38, { align: 'right' }
  );

  doc.setDrawColor(...LIME);
  doc.setLineWidth(1.2);
  doc.line(leftMargin, headerHeight - 2, rightMargin, headerHeight - 2);

  let y = headerHeight + 8;

  // ===== TABLE =====
  // Column positions (landscape)
  const cols = {
    num: leftMargin + 2,
    payNum: leftMargin + 10,
    teacher: leftMargin + 38,
    school: leftMargin + 62,
    period: leftMargin + 100,   // right-aligned; "DD MMM – DD MMM" fits ~22mm
    lHours: leftMargin + 122,
    gHours: leftMargin + 138,
    lTotal: leftMargin + 157,
    gTotal: leftMargin + 176,
    manual: leftMargin + 194,
    total: leftMargin + 213,
    paid: leftMargin + 232,
    balance: leftMargin + 252,
    status: rightMargin - 5,
  };

  // Header row
  doc.setFillColor(...DARK);
  doc.rect(leftMargin, y - 4, contentWidth, 8, 'F');
  doc.setFontSize(6);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);

  doc.text('#', cols.num, y);
  doc.text('Payroll #', cols.payNum, y);
  doc.text('Teacher', cols.teacher, y);
  doc.text('School', cols.school, y);
  doc.text('Period', cols.period, y, { align: 'right' });
  doc.text('Lesson Hrs', cols.lHours, y, { align: 'right' });
  doc.text('Guar. Hrs', cols.gHours, y, { align: 'right' });
  doc.text('Lesson Tot.', cols.lTotal, y, { align: 'right' });
  doc.text('Guar. Tot.', cols.gTotal, y, { align: 'right' });
  doc.text('Manual', cols.manual, y, { align: 'right' });
  doc.text('Total Pay.', cols.total, y, { align: 'right' });
  doc.text('Paid', cols.paid, y, { align: 'right' });
  doc.text('Balance', cols.balance, y, { align: 'right' });
  doc.text('Status', cols.status, y, { align: 'right' });
  y += 7;

  let grandLessonTotal = 0;
  let grandGuaranteeTotal = 0;
  let grandManualTotal = 0;
  let grandTotalPayable = 0;
  let grandPaid = 0;
  let grandBalanceDue = 0;

  const sorted = [...filtered].sort((a, b) => a.teacherName.localeCompare(b.teacherName));

  sorted.forEach((pr, idx) => {
    y = checkPage(y, 7);

    if (idx % 2 === 0) {
      doc.setFillColor(...SLATE_LIGHT);
      doc.rect(leftMargin, y - 4, contentWidth, 6, 'F');
    }

    const school = pr.schoolFilter ? schools.find(s => s.id === pr.schoolFilter)?.name || 'Unknown' : 'All';
    const lessonHours = (pr.lineItems || []).filter(li => li.type === 'lesson').reduce((s, li) => s + li.hours, 0);
    const guarHours = (pr.lineItems || []).filter(li => li.type === 'guarantee').reduce((s, li) => s + li.hours, 0);
    const manual = pr.manualAdjustmentTotal || 0;
    const balance = getPayrollBalanceDue(pr);

    grandLessonTotal += pr.lessonTotal;
    grandGuaranteeTotal += pr.guaranteeTotal;
    grandManualTotal += manual;
    grandTotalPayable += pr.totalPayable;
    grandPaid += pr.paidAmount;
    grandBalanceDue += balance;

    doc.setFontSize(6);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_BODY);

    doc.text(`${idx + 1}`, cols.num, y);
    doc.text(pr.payrollNumber, cols.payNum, y);

    const maxTeacherW = cols.school - cols.teacher - 4;
    doc.text(doc.splitTextToSize(pr.teacherName, maxTeacherW)[0] || pr.teacherName, cols.teacher, y);

    const maxSchoolW = 22;
    doc.text(doc.splitTextToSize(school, maxSchoolW)[0] || school, cols.school, y);

    const periodStr = fmtPeriodShort(pr.periodStart, pr.periodEnd);
    doc.text(periodStr, cols.period, y, { align: 'right' });

    doc.text(lessonHours.toFixed(2), cols.lHours, y, { align: 'right' });

    if (guarHours > 0) {
      doc.setTextColor(180, 120, 0);
      doc.setFont(undefined, 'bold');
    }
    doc.text(guarHours.toFixed(2), cols.gHours, y, { align: 'right' });
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_BODY);

    doc.text(fmtCurrency(pr.lessonTotal), cols.lTotal, y, { align: 'right' });
    doc.text(fmtCurrency(pr.guaranteeTotal), cols.gTotal, y, { align: 'right' });
    doc.text(fmtCurrency(manual), cols.manual, y, { align: 'right' });

    doc.setFont(undefined, 'bold');
    doc.text(fmtCurrency(pr.totalPayable), cols.total, y, { align: 'right' });
    doc.setFont(undefined, 'normal');

    doc.setTextColor(16, 185, 129);
    doc.text(fmtCurrency(pr.paidAmount), cols.paid, y, { align: 'right' });

    if (balance > 0) {
      doc.setTextColor(245, 158, 11);
      doc.setFont(undefined, 'bold');
    } else {
      doc.setTextColor(...TEXT_BODY);
    }
    doc.text(fmtCurrency(balance), cols.balance, y, { align: 'right' });
    doc.setFont(undefined, 'normal');

    doc.setTextColor(...TEXT_MUTED);
    doc.text(STATUS_LABELS[pr.status] || pr.status, cols.status, y, { align: 'right' });

    y += 6;
  });

  // Grand totals
  y += 2;
  y = checkPage(y, 10);
  doc.setDrawColor(...SLATE_BORDER);
  doc.setLineWidth(0.5);
  doc.line(leftMargin, y - 3, rightMargin, y - 3);

  doc.setFillColor(...DARK);
  doc.rect(leftMargin, y - 2, contentWidth, 8, 'F');
  y += 3;

  doc.setFontSize(6);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);

  doc.text('GRAND TOTALS', cols.teacher, y);
  doc.text(fmtCurrency(grandLessonTotal), cols.lTotal, y, { align: 'right' });
  doc.text(fmtCurrency(grandGuaranteeTotal), cols.gTotal, y, { align: 'right' });
  doc.text(fmtCurrency(grandManualTotal), cols.manual, y, { align: 'right' });
  doc.text(fmtCurrency(grandTotalPayable), cols.total, y, { align: 'right' });
  doc.setTextColor(16, 185, 129);
  doc.text(fmtCurrency(grandPaid), cols.paid, y, { align: 'right' });
  doc.setTextColor(245, 158, 11);
  doc.text(fmtCurrency(grandBalanceDue), cols.balance, y, { align: 'right' });

  // Footer
  const footY = 203;
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Artickle Academy — Payroll Register', leftMargin, footY);
  doc.text(monthLabel, rightMargin, footY, { align: 'right' });

  doc.save(`Payroll-Register-${filters.month}.pdf`);
}
