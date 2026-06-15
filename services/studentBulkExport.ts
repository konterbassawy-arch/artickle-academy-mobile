/**
 * studentBulkExport.ts
 *
 * Bulk student report export — Excel (detailed) and PDF (simplified table).
 * Columns are dynamically built from all enrollment periods found across the
 * selected students, so new periods automatically appear as new columns.
 *
 * Excel columns:
 *   Name | Instrument | Teacher | Attendance Rate | Total Hours | Avg Effort |
 *   Avg Practice | [Period 1] | [Period 2] | … | Total Lessons
 *
 * PDF columns (lean table, landscape):
 *   Name | Instrument | Teacher | [Period 1] | [Period 2] | … | Total
 *
 * Cell format for each period column:
 *   Excel → "8 / 12"  (taught / package total)
 *   PDF   → 8         (taught count only)
 */

import {
  Student,
  Lesson,
  Enrollment,
  SchoolEnrollmentPeriod,
  LessonStatus,
} from '../types';
import { loadAcademyStamp, drawAcademyStamp } from './exportUtils';

const TAUGHT_STATUSES: string[] = [LessonStatus.PRESENT, LessonStatus.TAUGHT];
// "Consumed" matches the system-wide ENROLLMENT_CONSUMED_STATUSES — these are
// the lessons that burn an enrollment slot (taught + present + absent-unexcused).
const CONSUMED_STATUSES: string[] = [
  LessonStatus.PRESENT,
  LessonStatus.TAUGHT,
  LessonStatus.ABSENT_UNEXCUSED,
];

const REPORT_TITLE = 'Artickle School Report';
const REPORT_NOTE =
  'Note: Total lessons counted include Present, Taught, and Absent (Unexcused) — Absent (Excused) and Cancelled lessons are excluded.';

// ─── Enrollment column descriptor ───────────────────────────────────────────

interface EnrollmentColumn {
  key: string;       // schoolPeriodId (or enrollmentId for standalone)
  label: string;     // "Enrollment 1", "Enrollment 2", etc.
  detailLabel: string; // period name / academic-year detail (sub-label)
  sortKey: string;   // ISO date string for ordering
  periodId?: string; // schoolPeriodId if linked
  isCurrent: boolean; // today falls within the period/enrollment date range
}

// ─── Per-student row data ────────────────────────────────────────────────────

interface StudentRow {
  name: string;
  instrument: string;
  teacherName: string;
  attendanceRate: string;
  totalHours: string;
  avgEffort: string;
  avgPractice: string;
  /** Lessons taught (Taught + Present) — what actually happened. */
  lessonsTaught: number;
  /** Lessons absent that still count toward the package (Absent Unexcused). */
  lessonsAbsentCounted: number;
  /** "8 / 12" or "—" per column key */
  enrollmentCells: Map<string, string>;
  /** raw consumed count per column key (for PDF) */
  taughtCounts: Map<string, number>;
  /** Total counted lessons across all of the student's lessons. */
  totalLessons: number;
}

// ─── Core builder — shared by Excel and PDF ─────────────────────────────────

export const buildBulkExportData = (
  selectedStudents: Student[],
  allLessons: Lesson[],
  allEnrollments: Enrollment[],
  allPeriods: SchoolEnrollmentPeriod[],
  teachers: Array<{ id: string; name: string }>,
): { rows: StudentRow[]; columns: EnrollmentColumn[] } => {
  const selectedIds = new Set(selectedStudents.map(s => s.id));
  const relevantEnrollments = allEnrollments.filter(e => selectedIds.has(e.studentId));
  const periodMap = new Map(allPeriods.map(p => [p.id, p]));
  const enrollmentMap = new Map(relevantEnrollments.map(e => [e.id, e]));

  // ── Build enrollment columns ──────────────────────────────────────────────
  // Columns are derived from school enrollment periods, scoped to the schools
  // of the selected students — so a student-set from one school doesn't get
  // padded with another school's term columns.
  const selectedSchoolIds = new Set(
    selectedStudents.map(s => s.schoolId).filter((x): x is string => !!x),
  );
  const scopedPeriods =
    selectedSchoolIds.size > 0
      ? allPeriods.filter(p => selectedSchoolIds.has(p.schoolId))
      : allPeriods;

  const today = new Date().toISOString().slice(0, 10);
  const isInRange = (start?: string | null, end?: string | null) =>
    !!(start && end && today >= start && today <= end);

  const columns: EnrollmentColumn[] = scopedPeriods
    .slice()
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
    .map(p => ({
      key: p.id,
      label: '',
      detailLabel: p.name,
      sortKey: p.startDate ?? '',
      periodId: p.id,
      isCurrent: isInRange(p.startDate, p.endDate),
    }));

  // Append standalone enrollments (no schoolPeriodId) from selected students
  const seenStandalone = new Set<string>();
  relevantEnrollments
    .filter(e => !e.schoolPeriodId)
    .forEach(enr => {
      if (seenStandalone.has(enr.id)) return;
      seenStandalone.add(enr.id);
      const detailLabel =
        [enr.academicYear, enr.term].filter(Boolean).join(' ') ||
        new Date(enr.createdAt).toLocaleDateString('en-GB', {
          month: 'short',
          year: 'numeric',
        });
      columns.push({
        key: enr.id,
        label: '',
        detailLabel,
        sortKey: enr.startDate ?? String(enr.createdAt),
        isCurrent: isInRange(enr.startDate, enr.endDate),
      });
    });

  // Number them generically — auto-extends as new enrollment periods appear.
  columns.forEach((col, i) => {
    col.label = `Enrollment ${i + 1}`;
  });

  // ── Build per-student rows ─────────────────────────────────────────────────
  const rows: StudentRow[] = selectedStudents.map(student => {
    const studentLessons = allLessons.filter(l => l.studentIds?.includes(student.id));
    const studentEnrollments = relevantEnrollments.filter(e => e.studentId === student.id);

    // Teacher name
    const activeTeacherId = student.currentTeacherIds?.[0] ?? student.teacherId;
    const teacherName = teachers.find(t => t.id === activeTeacherId)?.name ?? '—';

    // Stats
    const taughtLessons = studentLessons.filter(l =>
      TAUGHT_STATUSES.includes(l.status),
    );
    const absentCounted = studentLessons.filter(
      l => l.status === LessonStatus.ABSENT_UNEXCUSED,
    );
    const consumedLessons = studentLessons.filter(l =>
      CONSUMED_STATUSES.includes(l.status),
    );
    const activeLessons = studentLessons.filter(l => l.status !== LessonStatus.CANCELLED);

    const attendanceRate =
      consumedLessons.length > 0
        ? `${Math.round((taughtLessons.length / consumedLessons.length) * 100)}%`
        : '—';

    const hoursNum =
      activeLessons.reduce((s, l) => s + (l.durationMinutes || 60), 0) / 60;
    const totalHours = `${hoursNum.toFixed(1)}h`;

    const effortVals = taughtLessons
      .filter(l => l.interactivity != null)
      .map(l => l.interactivity!);
    const practiceVals = taughtLessons
      .filter(l => l.behavior != null)
      .map(l => l.behavior!);

    const avgEffort = effortVals.length
      ? `${(effortVals.reduce((a, b) => a + b, 0) / effortVals.length).toFixed(1)} / 5`
      : '—';
    const avgPractice = practiceVals.length
      ? `${(practiceVals.reduce((a, b) => a + b, 0) / practiceVals.length).toFixed(1)} / 5`
      : '—';

    // Enrollment counts per column
    const enrollmentCells = new Map<string, string>();
    const taughtCounts = new Map<string, number>();

    for (const col of columns) {
      // Resolve the date range and package total for this column.
      // Date range comes from the SchoolEnrollmentPeriod (or standalone enrollment).
      // Package total comes from the student's enrollment record(s) for this period,
      // if any — otherwise it's just unknown and we just show the lesson count.
      let dateStart: string | null = null;
      let dateEnd: string | null = null;
      let packageTotal = 0;

      if (col.periodId) {
        const period = periodMap.get(col.periodId);
        dateStart = period?.startDate ?? null;
        dateEnd = period?.endDate ?? null;
        const colEnrs = studentEnrollments.filter(e => e.schoolPeriodId === col.periodId);
        // Prefer the student's own enrollment package total; fall back to the
        // period's default lesson count (this matches what the student detail
        // page shows in the "School Period Progress" card, e.g. 4/10).
        packageTotal = colEnrs.length > 0
          ? colEnrs.reduce((s, e) => s + (e.totalLessons || 0), 0)
          : (period?.defaultTotalLessons ?? 0);
      } else {
        const enr = enrollmentMap.get(col.key);
        if (enr) {
          dateStart = enr.startDate ?? null;
          dateEnd = enr.endDate ?? null;
          packageTotal = enr.totalLessons || 0;
        }
      }

      // Count this student's CONSUMED lessons (taught + present + absent-unexcused)
      // that fall inside the period's date range. Matches the "4 / 10 lessons"
      // ring on the student detail page.
      let taught = 0;
      if (dateStart && dateEnd) {
        taught = studentLessons.filter(l => {
          if (!CONSUMED_STATUSES.includes(l.status)) return false;
          const d = (l.date || '').slice(0, 10);
          return d >= dateStart && d <= dateEnd;
        }).length;
      }

      if (taught === 0 && packageTotal === 0) {
        enrollmentCells.set(col.key, '—');
        taughtCounts.set(col.key, 0);
      } else {
        enrollmentCells.set(
          col.key,
          packageTotal > 0 ? `${taught} / ${packageTotal}` : String(taught),
        );
        taughtCounts.set(col.key, taught);
      }
    }

    return {
      name: student.name,
      instrument: student.instrument || '—',
      teacherName,
      attendanceRate,
      totalHours,
      avgEffort,
      avgPractice,
      lessonsTaught: taughtLessons.length,
      lessonsAbsentCounted: absentCounted.length,
      enrollmentCells,
      taughtCounts,
      totalLessons: consumedLessons.length, // total counted = present + taught + absent-unexcused
    };
  });

  return { rows, columns };
};

// ─── Excel export ────────────────────────────────────────────────────────────

// Resolve unique school names for the selected students. Falls back to enrollments
// and periods when the schools array isn't provided (or doesn't have a match).
const resolveSchoolNames = (
  selectedStudents: Student[],
  allEnrollments: Enrollment[],
  allPeriods: SchoolEnrollmentPeriod[],
  schools?: Array<{ id: string; name: string }>,
): string[] => {
  const byId = new Map<string, string>();
  schools?.forEach(s => byId.set(s.id, s.name));
  allPeriods.forEach(p => { if (!byId.has(p.schoolId)) byId.set(p.schoolId, p.schoolName); });
  allEnrollments.forEach(e => {
    if (e.schoolId && e.schoolName && !byId.has(e.schoolId)) byId.set(e.schoolId, e.schoolName);
  });
  const names = new Set<string>();
  for (const s of selectedStudents) {
    const sid = s.schoolId;
    if (!sid) continue;
    const name = byId.get(sid);
    if (name) names.add(name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
};

export const exportStudentBulkExcel = (
  selectedStudents: Student[],
  allLessons: Lesson[],
  allEnrollments: Enrollment[],
  allPeriods: SchoolEnrollmentPeriod[],
  teachers: Array<{ id: string; name: string }>,
  schools?: Array<{ id: string; name: string }>,
): void => {
  const { rows, columns } = buildBulkExportData(
    selectedStudents,
    allLessons,
    allEnrollments,
    allPeriods,
    teachers,
  );

  const headers = [
    'Student Name',
    'Instrument',
    'Teacher',
    'Attendance Rate',
    'Total Hours',
    'Avg Effort',
    'Avg Practice',
    'Lessons Taught (Taught + Present)',
    'Lessons Absent — Counted (Unexcused)',
    ...columns.map(c => {
      const detail = c.detailLabel ? ` (${c.detailLabel})` : '';
      const current = c.isCurrent ? ' (Current)' : '';
      return `${c.label}${detail}${current}`;
    }),
    'Total Lessons',
  ];

  const dataRows = rows.map(r => [
    r.name,
    r.instrument,
    r.teacherName,
    r.attendanceRate,
    r.totalHours,
    r.avgEffort,
    r.avgPractice,
    r.lessonsTaught,
    r.lessonsAbsentCounted,
    ...columns.map(c => r.enrollmentCells.get(c.key) ?? '—'),
    r.totalLessons,
  ]);

  // Leader rows above the headers: title, note, generated stamp, and one row per
  // school of the selected students. Empty cells in trailing columns keep alignment
  // consistent for Excel renderers.
  const now = new Date();
  const generatedLabel = `Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  ·  ${rows.length} student${rows.length !== 1 ? 's' : ''}`;
  const schoolNames = resolveSchoolNames(selectedStudents, allEnrollments, allPeriods, schools);
  const schoolLabel =
    schoolNames.length === 1
      ? `School: ${schoolNames[0]}`
      : schoolNames.length > 1
      ? `Schools: ${schoolNames.join(', ')}`
      : '';
  const titleRow = [REPORT_TITLE, ...new Array(headers.length - 1).fill('')];
  const noteRow = [REPORT_NOTE, ...new Array(headers.length - 1).fill('')];
  const genRow  = [generatedLabel, ...new Array(headers.length - 1).fill('')];
  const schoolRow = schoolLabel ? [schoolLabel, ...new Array(headers.length - 1).fill('')] : null;

  const XLSX = (window as any).XLSX;
  if (!XLSX) {
    alert('Excel library not loaded. Please refresh the page.');
    return;
  }

  const sheetData = [
    titleRow,
    noteRow,
    genRow,
    ...(schoolRow ? [schoolRow] : []),
    [],
    headers,
    ...dataRows,
  ];
  const headerRowIdx = sheetData.length - dataRows.length; // 1-based row index = headerRowIdx + 1
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Column widths sized off the header row, not the title row.
  worksheet['!cols'] = headers.map(h => ({
    wch: Math.max(14, String(h).length + 2),
  }));

  // Merge each leader row across all columns so they render as banners.
  const lastCol = headers.length - 1;
  const leaderRowCount = 3 + (schoolRow ? 1 : 0);
  worksheet['!merges'] = Array.from({ length: leaderRowCount }, (_, r) => ({
    s: { r, c: 0 },
    e: { r, c: lastCol },
  }));

  // Style: title (row 1), note (row 2), generated-on (row 3), school (row 4 if present),
  // table header (row after the empty spacer).
  const titleCell = worksheet['A1'];
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1F2937' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }
  const noteCell = worksheet['A2'];
  if (noteCell) {
    noteCell.s = {
      font: { italic: true, sz: 10, color: { rgb: '475569' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    };
  }
  const genCell = worksheet['A3'];
  if (genCell) {
    genCell.s = {
      font: { sz: 9, color: { rgb: '64748B' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }
  if (schoolRow) {
    const schoolCell = worksheet['A4'];
    if (schoolCell) {
      schoolCell.s = {
        font: { bold: true, sz: 10, color: { rgb: '1F2937' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      };
    }
  }
  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1F2937' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
  // Header row is the row after the empty spacer.
  const headerXlsxRow = leaderRowCount + 2; // 1-based
  for (let i = 0; i < headers.length; i++) {
    const cellRef = XLSX.utils.encode_col(i) + String(headerXlsxRow);
    if (worksheet[cellRef]) worksheet[cellRef].s = headerStyle;
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Students Report');

  const dateTag = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `Artickle_School_Report_${dateTag}.xlsx`);
};

// ─── PDF export — lean landscape table ──────────────────────────────────────

const loadLogoBase64 = async (): Promise<string | null> => {
  try {
    const resp = await fetch('/logo.png');
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export const exportStudentBulkPDF = async (
  selectedStudents: Student[],
  allLessons: Lesson[],
  allEnrollments: Enrollment[],
  allPeriods: SchoolEnrollmentPeriod[],
  teachers: Array<{ id: string; name: string }>,
  schools?: Array<{ id: string; name: string }>,
): Promise<void> => {
  if (typeof (window as any).jspdf === 'undefined') {
    alert('PDF library loading… please wait or refresh.');
    return;
  }

  const { rows, columns } = buildBulkExportData(
    selectedStudents,
    allLessons,
    allEnrollments,
    allPeriods,
    teachers,
  );

  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF({ orientation: 'portrait' });
  const schoolNames = resolveSchoolNames(selectedStudents, allEnrollments, allPeriods, schools);

  // ── Palette ────────────────────────────────────────────────────────────────
  const DARK        = [31, 41, 55]    as const;
  const LIME        = [200, 255, 0]   as const;
  const SLATE_LIGHT = [248, 250, 252] as const;
  const SLATE_BD    = [200, 213, 225] as const;
  const TEXT_BODY   = [71, 85, 105]   as const;
  const TEXT_MUTED  = [148, 163, 184] as const;

  const pageW   = doc.internal.pageSize.width;   // 210mm portrait
  const pageH   = doc.internal.pageSize.height;  // 297mm portrait
  const lm      = 8;
  const rm      = pageW - 8;
  const contentW = rm - lm;

  // ── Column widths ──────────────────────────────────────────────────────────
  // Portrait is narrow — extra columns ("Taught" and "Absent (Counted)") are added
  // before the enrollment columns. Tighten fixed cols accordingly.
  const fixedW = {
    name: 36,
    instrument: 18,
    teacher: 22,
    taught: 14,
    absent: 14,
    total: 12,
  };
  const fixedTotal =
    fixedW.name + fixedW.instrument + fixedW.teacher +
    fixedW.taught + fixedW.absent + fixedW.total;
  const periodW = columns.length > 0
    ? Math.max(13, (contentW - fixedTotal) / columns.length)
    : contentW - fixedTotal;

  // Column x positions
  const xName       = lm;
  const xInstrument = xName + fixedW.name;
  const xTeacher    = xInstrument + fixedW.instrument;
  const xTaught     = xTeacher + fixedW.teacher;
  const xAbsent     = xTaught + fixedW.taught;
  const xPeriod0    = xAbsent + fixedW.absent;
  const COL = {
    name:       xName,
    instrument: xInstrument,
    teacher:    xTeacher,
    taught:     xTaught,
    absent:     xAbsent,
    periods:    columns.map((_, i) => xPeriod0 + i * periodW),
    total:      xPeriod0 + columns.length * periodW,
  };

  const ROW_H     = 7;
  const HEADER_H  = 16; // table header row height (2 lines: number + period detail)
  // Brand band grows when multiple schools need to fit — base 26mm + 4mm per
  // extra school + 4mm for the "Schools:" label when multi-school.
  const HEADER_PDF =
    26 +
    (schoolNames.length > 1 ? 4 : 0) +
    Math.max(0, schoolNames.length - 1) * 4;
  const NOTE_H    = 10; // counting-rule note line below the branded header

  // ── Logo ───────────────────────────────────────────────────────────────────
  const logoBase64 = await loadLogoBase64();

  // ── Page helper ────────────────────────────────────────────────────────────
  let pageNum = 1;
  let y = 0;

  const drawBrandedHeader = () => {
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageW, HEADER_PDF, 'F');

    if (logoBase64) {
      try { doc.addImage(logoBase64, 'PNG', lm, 4, 14, 14); } catch { /* skip */ }
    }
    const titleX = logoBase64 ? lm + 18 : lm;

    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Artickle', titleX, 12);
    doc.setTextColor(...LIME);
    doc.text(' Academy', titleX + doc.getTextWidth('Artickle'), 12);

    doc.setFontSize(8.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...LIME);
    doc.text(REPORT_TITLE, titleX, 18);

    const now = new Date();
    doc.setFontSize(6.5);
    doc.setTextColor(...TEXT_MUTED);
    const genLabel = `Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  ·  ${rows.length} student${rows.length !== 1 ? 's' : ''}`;
    doc.text(genLabel, rm, 12, { align: 'right' });

    // School name(s) — right-aligned, just under the "Generated:" line.
    // Single school: one bold line. Multiple schools: each on its own line.
    if (schoolNames.length > 0) {
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7.5);
      let sy = 17;
      const heading = schoolNames.length === 1 ? '' : 'Schools:';
      if (heading) {
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...TEXT_MUTED);
        doc.setFontSize(6);
        doc.text(heading, rm, sy, { align: 'right' });
        sy += 3.5;
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
      }
      for (const name of schoolNames) {
        doc.text(name, rm, sy, { align: 'right' });
        sy += 4;
      }
      doc.setFont(undefined, 'normal');
    }

    doc.setDrawColor(...LIME);
    doc.setLineWidth(0.6);
    doc.line(lm, HEADER_PDF - 1, rm, HEADER_PDF - 1);

    // Counting-rule note — italic, muted, just below the brand band
    doc.setFontSize(7);
    doc.setFont(undefined, 'italic');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(REPORT_NOTE, lm, HEADER_PDF + 5);
    doc.setFont(undefined, 'normal');
  };

  const drawFooter = () => {
    doc.setDrawColor(...SLATE_BD);
    doc.setLineWidth(0.3);
    doc.line(lm, pageH - 10, rm, pageH - 10);
    doc.setFontSize(6.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Artickle Academy', lm, pageH - 6);
    doc.setTextColor(...LIME);
    doc.text(' | ', lm + doc.getTextWidth('Artickle Academy'), pageH - 6);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Confidential', lm + doc.getTextWidth('Artickle Academy | '), pageH - 6);
    const pg = `Page ${pageNum}`;
    doc.text(pg, rm - doc.getTextWidth(pg), pageH - 6);
  };

  const clipText = (text: string, maxW: number) => {
    let t = text;
    while (doc.getTextWidth(t) > maxW - 2 && t.length > 2) t = t.slice(0, -1);
    return t === text ? t : t.slice(0, -1) + '…';
  };

  const drawTableHeader = (yPos: number) => {
    doc.setFillColor(...DARK);
    doc.rect(lm, yPos, contentW, HEADER_H, 'F');

    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);

    // Fixed columns — most are single-line; "Taught" / "Absent" wrap to 2 lines.
    doc.setFontSize(7);
    const cy = yPos + HEADER_H / 2 + 1.5;
    doc.text('Name',       COL.name + 1.5, cy);
    doc.text('Instrument', COL.instrument + 1.5, cy);
    doc.text('Teacher',    COL.teacher + 1.5, cy);
    doc.text('Total',      COL.total + 1.5, cy);

    // Two-line headers for the new columns (clearer at small width)
    doc.setFontSize(6.5);
    doc.text('Taught',           COL.taught + 1.5, yPos + 6);
    doc.setFontSize(5.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...LIME);
    doc.text('Taught + Present', COL.taught + 1.5, yPos + 11);

    doc.setFontSize(6.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Absent',            COL.absent + 1.5, yPos + 6);
    doc.setFontSize(5.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...LIME);
    doc.text('Unexcused',         COL.absent + 1.5, yPos + 11);

    doc.setFontSize(6.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);

    // Enrollment columns: 2 lines — number (+ "Current" badge) on top, period detail below
    columns.forEach((col, i) => {
      doc.setFontSize(6.5);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      const topLabel = col.isCurrent ? `${col.label} • CURRENT` : col.label;
      doc.text(clipText(topLabel, periodW), COL.periods[i] + 1.5, yPos + 6);

      if (col.detailLabel) {
        doc.setFontSize(5.5);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...LIME);
        doc.text(clipText(col.detailLabel, periodW), COL.periods[i] + 1.5, yPos + 11);
      }
    });

    return yPos + HEADER_H;
  };

  const addPage = () => {
    drawFooter();
    doc.addPage();
    pageNum++;
    drawBrandedHeader();
    y = HEADER_PDF + NOTE_H;
    y = drawTableHeader(y);
  };

  // ── Page 1 ─────────────────────────────────────────────────────────────────
  drawBrandedHeader();
  y = HEADER_PDF + NOTE_H;
  y = drawTableHeader(y);

  // ── Rows ───────────────────────────────────────────────────────────────────
  rows.forEach((row, idx) => {
    if (y + ROW_H > pageH - 14) addPage();

    // Alternating background
    if (idx % 2 === 0) {
      doc.setFillColor(...SLATE_LIGHT);
      doc.rect(lm, y, contentW, ROW_H, 'F');
    }

    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_BODY);

    const ry = y + 5;

    doc.text(clipText(row.name, fixedW.name),               COL.name + 1.5, ry);
    doc.text(clipText(row.instrument, fixedW.instrument),   COL.instrument + 1.5, ry);
    doc.text(clipText(row.teacherName, fixedW.teacher),     COL.teacher + 1.5, ry);
    doc.text(String(row.lessonsTaught),         COL.taught + 1.5, ry);
    doc.text(String(row.lessonsAbsentCounted),  COL.absent + 1.5, ry);

    // Enrollment columns: show "taught/total" so PDF carries the same detail as Excel
    columns.forEach((col, i) => {
      const cellText = row.enrollmentCells.get(col.key) ?? '—';
      const isEmpty = cellText === '—';
      doc.setTextColor(
        isEmpty ? TEXT_MUTED[0] : TEXT_BODY[0],
        isEmpty ? TEXT_MUTED[1] : TEXT_BODY[1],
        isEmpty ? TEXT_MUTED[2] : TEXT_BODY[2],
      );
      doc.text(clipText(cellText, periodW), COL.periods[i] + 1.5, ry);
    });

    doc.setTextColor(...TEXT_BODY);
    doc.setFont(undefined, 'bold');
    doc.text(String(row.totalLessons), COL.total + 1.5, ry);
    doc.setFont(undefined, 'normal');

    // Bottom divider
    doc.setDrawColor(...SLATE_BD);
    doc.setLineWidth(0.2);
    doc.line(lm, y + ROW_H, rm, y + ROW_H);

    y += ROW_H;
  });

  // ── Totals row ─────────────────────────────────────────────────────────────
  if (y + ROW_H + 2 > pageH - 14) addPage();
  y += 2;
  doc.setFillColor(...DARK);
  doc.rect(lm, y, contentW, ROW_H + 2, 'F');
  doc.setFontSize(7);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`${rows.length} students`, COL.name + 1.5, y + 5.5);

  const sumTaught   = rows.reduce((s, r) => s + r.lessonsTaught, 0);
  const sumAbsent   = rows.reduce((s, r) => s + r.lessonsAbsentCounted, 0);
  const grandTotal  = rows.reduce((s, r) => s + r.totalLessons, 0);
  doc.text(String(sumTaught),  COL.taught + 1.5, y + 5.5);
  doc.text(String(sumAbsent),  COL.absent + 1.5, y + 5.5);
  doc.text(String(grandTotal), COL.total + 1.5, y + 5.5);

  columns.forEach((col, i) => {
    const colTotal = rows.reduce((s, r) => s + (r.taughtCounts.get(col.key) ?? 0), 0);
    doc.text(String(colTotal), COL.periods[i] + 1.5, y + 5.5);
  });

  y += ROW_H + 2;

  // Academy stamp — authorised seal below the totals row. Start a fresh page if
  // the last page is too full to fit the seal above the footer.
  const stamp = await loadAcademyStamp();
  if (stamp) {
    const stampSize = 26;
    if (y + stampSize + 12 > pageH - 12) {
      drawFooter();
      doc.addPage();
      pageNum++;
      drawBrandedHeader();
      y = HEADER_PDF + NOTE_H;
    }
    drawAcademyStamp(doc, stamp, rm - stampSize, y + 2, stampSize, TEXT_MUTED);
  }

  drawFooter();

  const dateTag = new Date().toISOString().slice(0, 10);
  doc.save(`Students_Report_${dateTag}.pdf`);
};
