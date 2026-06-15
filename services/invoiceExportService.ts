/**
 * invoiceExportService.ts — Phase 17.7A
 *
 * Invoice Excel + PDF export with grouped line items.
 * Uses SheetJS (XLSX) via CDN for Excel, jsPDF via CDN for PDF.
 * Artickle branding for PDF output.
 *
 * B2B invoices: grouped by date + instrument + rate from LESSON data.
 * B2C invoices: kept as-is (already clean enrollment lines).
 *
 * CRITICAL: Totals come from stored invoice entity — NEVER recalculated.
 * Grouping from lessons is for DISPLAY only.
 *
 * Does NOT modify any existing export paths or Firestore data.
 */

import {
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
  InvoicePayerType,
  Lesson,
  Teacher,
  School,
  getInvoiceSubtotal,
  getInvoiceBalanceDue
} from '../types';

import { groupInvoiceLinesFromLessons, GroupedInvoiceLine } from './exportGrouping';
import { resolveSchoolGuarantee, normalizeInstrument } from './rateService';
import { loadAcademyStamp, drawAcademyStamp } from './exportUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
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
// Excel Export
// ---------------------------------------------------------------------------

export function exportInvoiceExcel(
  invoice: Invoice,
  lessons: Lesson[],
  teachers: Teacher[],
  schools: School[],
  currencyCode: string = 'SAR'
): void {
  const XLSX = (window as any).XLSX;
  if (!XLSX) { alert('Excel library not loaded. Please refresh.'); return; }

  const subtotal = getInvoiceSubtotal(invoice.lineItems || []);
  const balanceDue = getInvoiceBalanceDue(invoice);
  const school = schools.find(s => s.id === invoice.payerId);

  const rows: any[][] = [];

  // Header block with branding
  rows.push(['Artickle Academy']);
  rows.push([]);
  rows.push(['Invoice To', invoice.payerName]);
  rows.push(['Invoice Number', invoice.invoiceNumber]);
  rows.push(['Period Start', fmtDate(invoice.periodStart)]);
  rows.push(['Period End', fmtDate(invoice.periodEnd)]);
  if (invoice.issuedDate) rows.push(['Issued Date', fmtDate(invoice.issuedDate)]);
  if (invoice.dueDate) rows.push(['Due Date', fmtDate(invoice.dueDate)]);
  rows.push(['Status', STATUS_LABELS[invoice.status] || invoice.status]);
  rows.push(['Currency', currencyCode]);
  rows.push([]);

  if (invoice.payerType === InvoicePayerType.SCHOOL) {
    const grouped = groupInvoiceLinesFromLessons(lessons, invoice, teachers, schools);
    const hasAnyGuarantee = grouped.some(g => g.hasGuarantee);

    if (hasAnyGuarantee) {
      rows.push([
        '#', 'Date', 'Description',
        'Actual Hours', 'Min Hours', 'Charged Hours',
        'Guarantee', 'Guarantee Adj. (Hours)', `Guarantee Adj. (${currencyCode})`,
        `Rate (${currencyCode})`, `Subtotal (${currencyCode})`
      ]);

      grouped.forEach((g, idx) => {
        const instNorm = normalizeInstrument(g.instrument);
        const guarantee = school ? resolveSchoolGuarantee(school, instNorm) : null;
        const minHours = guarantee ? guarantee.minHours : '';
        const guarAdjSAR = g.guaranteeAdj > 0 ? parseFloat((g.guaranteeAdj * g.rate).toFixed(2)) : '';

        rows.push([
          idx + 1,
          fmtDate(g.date),
          `${g.instrument} classes (${fmtDate(g.date)})`,
          g.actualHours,
          minHours,
          g.billedHours,
          g.hasGuarantee ? 'Yes' : 'No',
          g.guaranteeAdj > 0 ? g.guaranteeAdj : '',
          guarAdjSAR,
          g.rate,
          g.lineTotal,
        ]);
      });
    } else {
      rows.push(['#', 'Date', 'Description', 'Hours', `Rate (${currencyCode})`, `Subtotal (${currencyCode})`]);

      grouped.forEach((g, idx) => {
        rows.push([
          idx + 1,
          fmtDate(g.date),
          `${g.instrument} classes (${fmtDate(g.date)})`,
          g.billedHours,
          g.rate,
          g.lineTotal,
        ]);
      });
    }
  } else {
    rows.push(['#', 'Date', 'Description', `Amount (${currencyCode})`]);
    (invoice.lineItems || []).forEach((li: InvoiceLineItem, idx: number) => {
      rows.push([
        idx + 1,
        li.date ? fmtTs(li.date) : '',
        li.description || '',
        li.amount || 0,
      ]);
    });
  }

  rows.push([]);

  rows.push(['Subtotal', subtotal]);
  if (invoice.adjustments) rows.push(['Adjustments', invoice.adjustments]);
  if (invoice.vatAmount && invoice.vatAmount > 0) rows.push([`VAT (${invoice.vatRate}%)`, invoice.vatAmount]);
  rows.push(['Total Amount', invoice.totalAmount]);
  rows.push(['Paid Amount', invoice.paidAmount || 0]);
  rows.push(['Balance Due', balanceDue]);
  if (invoice.notes) rows.push(['Notes', invoice.notes]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 5 },   // #
    { wch: 14 },  // Date
    { wch: 18 },  // Description
    { wch: 12 },  // Actual Hours
    { wch: 10 },  // Min Hours
    { wch: 14 },  // Charged Hours
    { wch: 12 },  // Guarantee
    { wch: 20 },  // Guarantee Adj. (Hours)
    { wch: 20 },  // Guarantee Adj. (SAR)
    { wch: 12 },  // Rate
    { wch: 16 },  // Subtotal
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
  XLSX.writeFile(wb, `${invoice.invoiceNumber}.xlsx`);
}

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

export async function exportInvoicePDF(
  invoice: Invoice,
  lessons: Lesson[],
  teachers: Teacher[],
  schools: School[],
  currencyCode: string = 'SAR'
): Promise<void> {
  if (typeof (window as any).jspdf === 'undefined') {
    alert('PDF library loading... please wait or refresh.');
    return;
  }
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF();

  // --- Brand colors ---
  const DARK = [31, 41, 55] as const;
  const LIME = [200, 255, 0] as const;
  const SLATE_LIGHT = [248, 250, 252] as const;
  const SLATE_BORDER = [200, 213, 225] as const;
  const TEXT_BODY = [71, 85, 105] as const;
  const TEXT_MUTED = [148, 163, 184] as const;

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
  doc.text('Invoice', titleX, 25);

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(invoice.invoiceNumber, titleX, 35);

  doc.setFontSize(9);
  doc.setTextColor(...LIME);
  doc.text(STATUS_LABELS[invoice.status] || invoice.status, titleX, 43);

  // "Tax included" sticker — only when VAT was applied
  if (invoice.vatAmount && invoice.vatAmount > 0) {
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    const badgeText = 'TAX INCLUDED';
    const padX = 4;
    const badgeW = doc.getTextWidth(badgeText) + padX * 2;
    const badgeH = 7;
    const badgeX = rightMargin - badgeW;
    const badgeY = 9;
    doc.setFillColor(...LIME);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.8, 1.8, 'F');
    doc.setTextColor(...DARK);
    doc.text(badgeText, badgeX + padX, badgeY + 5);
    doc.setFont(undefined, 'normal');
  }

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

  // ===== INVOICE DETAILS =====
  y = sectionTitle('INVOICE DETAILS', y);

  const infoBoxH = invoice.fromDate ? 48 : 42;
  doc.setFillColor(...SLATE_LIGHT);
  doc.setDrawColor(...SLATE_BORDER);
  doc.setLineWidth(0.4);
  doc.roundedRect(leftMargin, y - 5, contentWidth, infoBoxH, 2, 2, 'FD');

  const col1X = leftMargin + 4;
  const col2X = leftMargin + 98;

  y = fieldRow('Payer:', invoice.payerName, col1X, y);
  y = fieldRow('Type:', invoice.payerType === InvoicePayerType.SCHOOL ? 'B2B (School)' : 'B2C (Parent)', col2X, y - lineHeight);

  if (invoice.fromDate) {
    y = fieldRow('From Date:', fmtDate(invoice.fromDate), col1X, y);
  }
  y = fieldRow('Period:', `${fmtDate(invoice.periodStart)} – ${fmtDate(invoice.periodEnd)}`, col1X, y);
  const periodY = y;
  y = fieldRow('Due Date:', fmtDate(invoice.dueDate), col2X, periodY - lineHeight);
  if (invoice.issuedDate) {
    y = fieldRow('Issued:', fmtDate(invoice.issuedDate), col2X, y);
  }

  y += 8;

  // ===== LINE ITEMS =====
  y = checkPage(y, 30);
  y = sectionTitle('LINE ITEMS', y);

  if (invoice.payerType === InvoicePayerType.SCHOOL) {
    // Clean layout: guarantee is calculated into billed Hours but never itemized.
    const grouped = groupInvoiceLinesFromLessons(lessons, invoice, teachers, schools);

    doc.setFillColor(...DARK);
    doc.rect(leftMargin, y - 4, contentWidth, 8, 'F');
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);

    const cNum = leftMargin + 2;
    const cDate = leftMargin + 10;
    const cDesc = leftMargin + 32;
    const cHours = rightMargin - 40;
    const cRate = rightMargin - 24;
    const cTotal = rightMargin - 5;

    doc.text('#', cNum, y);
    doc.text('Date', cDate, y);
    doc.text('Description', cDesc, y);
    doc.text('Hours', cHours, y, { align: 'right' });
    doc.text('Rate', cRate, y, { align: 'right' });
    doc.text('Subtotal', cTotal, y, { align: 'right' });
    y += 9;

    grouped.forEach((g, idx) => {
      y = checkPage(y, 7);

      if (idx % 2 === 0) {
        doc.setFillColor(...SLATE_LIGHT);
        doc.rect(leftMargin, y - 4, contentWidth, 6, 'F');
      }

      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...TEXT_BODY);
      doc.text(String(idx + 1), cNum, y);
      doc.text(fmtDate(g.date), cDate, y);
      doc.text(`${g.instrument} classes (${fmtDate(g.date)})`, cDesc, y);
      doc.text(g.billedHours.toFixed(2), cHours, y, { align: 'right' });
      doc.text(fmtCurrency(g.rate), cRate, y, { align: 'right' });
      doc.setFont(undefined, 'bold');
      doc.text(fmtCurrency(g.lineTotal), cTotal, y, { align: 'right' });
      y += 6;
    });
  } else {
    // B2C: original line items
    const colNum = leftMargin + 2;
    const colDate = leftMargin + 10;
    const colDesc = leftMargin + 38;
    const colAmt = rightMargin - 5;

    doc.setFillColor(...DARK);
    doc.rect(leftMargin, y - 4, contentWidth, 8, 'F');
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('#', colNum, y);
    doc.text('Date', colDate, y);
    doc.text('Description', colDesc, y);
    doc.text('Amount', colAmt, y, { align: 'right' });
    y += 9;

    const items = invoice.lineItems || [];
    items.forEach((li: InvoiceLineItem, idx: number) => {
      y = checkPage(y, 7);
      if (idx % 2 === 0) {
        doc.setFillColor(...SLATE_LIGHT);
        doc.rect(leftMargin, y - 4, contentWidth, 6, 'F');
      }
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...TEXT_BODY);
      doc.text(String(idx + 1), colNum, y);
      doc.text(li.date ? fmtTs(li.date) : '', colDate, y);
      const desc = li.description || '';
      const maxDescWidth = colAmt - colDesc - 15;
      const truncDesc = doc.splitTextToSize(desc, maxDescWidth)[0] || desc;
      doc.text(truncDesc, colDesc, y);
      doc.setFont(undefined, 'bold');
      doc.text(`${fmtCurrency(li.amount)}`, colAmt, y, { align: 'right' });
      y += 6;
    });
  }

  // ===== TOTALS (from stored invoice — NEVER recalculated) =====
  y += 4;
  y = checkPage(y, 40);

  const totalsX = rightMargin - 70;
  const totalsValX = rightMargin - 5;
  const subtotal = getInvoiceSubtotal(invoice.lineItems || []);
  const balanceDue = getInvoiceBalanceDue(invoice);

  doc.setDrawColor(...SLATE_BORDER);
  doc.setLineWidth(0.3);
  doc.line(totalsX, y - 2, rightMargin, y - 2);

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...TEXT_BODY);
  doc.text('Subtotal:', totalsX, y + 2);
  doc.text(`${currencyCode} ${fmtCurrency(subtotal)}`, totalsValX, y + 2, { align: 'right' });
  y += 6;

  if (invoice.adjustments) {
    doc.text('Adjustments:', totalsX, y + 2);
    doc.text(`${currencyCode} ${fmtCurrency(invoice.adjustments)}`, totalsValX, y + 2, { align: 'right' });
    y += 6;
  }

  if (invoice.vatAmount && invoice.vatAmount > 0) {
    doc.text(`VAT (${invoice.vatRate}%):`, totalsX, y + 2);
    doc.text(`${currencyCode} ${fmtCurrency(invoice.vatAmount)}`, totalsValX, y + 2, { align: 'right' });
    y += 6;
  }

  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text('Total:', totalsX, y + 2);
  doc.text(`${currencyCode} ${fmtCurrency(invoice.totalAmount)}`, totalsValX, y + 2, { align: 'right' });
  y += 7;

  if (invoice.paidAmount > 0) {
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(16, 185, 129);
    doc.text('Paid:', totalsX, y + 2);
    doc.text(`${currencyCode} ${fmtCurrency(invoice.paidAmount)}`, totalsValX, y + 2, { align: 'right' });
    y += 6;
  }

  if (balanceDue > 0 && invoice.status !== InvoiceStatus.CANCELLED) {
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(245, 158, 11);
    doc.text('Balance Due:', totalsX, y + 2);
    doc.text(`${currencyCode} ${fmtCurrency(balanceDue)}`, totalsValX, y + 2, { align: 'right' });
    y += 8;
  }

  // Notes
  if (invoice.notes) {
    y += 4;
    y = checkPage(y, 15);
    y = sectionTitle('NOTES', y);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_MUTED);
    const noteLines = doc.splitTextToSize(invoice.notes, contentWidth - 10);
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
  doc.text('Artickle Academy — Invoice', leftMargin, footY);
  doc.text(invoice.invoiceNumber, rightMargin, footY, { align: 'right' });

  doc.save(`${invoice.invoiceNumber}.pdf`);
}
