/**
 * pdfExport.ts — Phase 19.2A
 *
 * School-admin lesson PDF export.
 * Mirrors the branded layout from LessonLog.tsx generatePDF() but:
 *   - Excludes financial data (already masked by AppContext)
 *   - Excludes teacher private notes (already masked by AppContext)
 *   - Includes schoolAdminComment as "School Teacher Comment"
 *   - Excludes schoolAdminInternalComment (internal only)
 */

import { Lesson, LessonStatus, DeliveryMode, getDeliveryMode, Student } from '../types';
import { TermReportScores } from './aiSummary/reportTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Internal date formatter
// ─────────────────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// Load logo from /logo.png as base64 for jsPDF addImage
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

/**
 * Generate a branded lesson PDF for school admin.
 * Uses jsPDF loaded via CDN (window.jspdf).
 */
export const generateSchoolLessonPDF = async (lesson: Lesson) => {
  if (typeof (window as any).jspdf === 'undefined') {
    alert('PDF Library loading... please wait or refresh.');
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
  const lineHeight = 7;

  // --- Helper: draw a section title with accent bar ---
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

  // --- Helper: label + value pair ---
  const fieldRow = (label: string, value: string, x: number, yPos: number, valOffset: number = 32): number => {
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(label, x, yPos);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...TEXT_BODY);
    doc.text(value || '-', x + valOffset, yPos);
    return yPos + lineHeight;
  };

  // --- Helper: draw a filled/outlined star (for ratings) ---
  const drawStar = (d: any, cx: number, cy: number, pts: number, outerR: number, innerR: number, filled: boolean) => {
    const path: number[][] = [];
    for (let i = 0; i < pts * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (Math.PI / 2 * 3) + (i * Math.PI / pts);
      path.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    const startX = path[0][0];
    const startY = path[0][1];
    d.setFillColor(...(filled ? LIME : [200, 213, 225]));
    d.setDrawColor(...(filled ? LIME : [200, 213, 225]));
    d.setLineWidth(0.3);
    d.lines(path.slice(1).map((p, i) => [p[0] - (i === 0 ? startX : path[i][0]), p[1] - (i === 0 ? startY : path[i][1])]),
      startX, startY, [1.0, 1.0], filled ? 'FD' : 'S', true);
  };

  // ===== HEADER =====
  const headerHeight = 52;
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 210, headerHeight, 'F');

  const logoBase64 = await loadLogoBase64();
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 14, 6, 22, 22); } catch { /* logo failed */ }
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
  doc.text('Lesson Report', titleX, 25);

  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  const now = new Date();
  doc.text(`Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`, titleX, 32);

  doc.setDrawColor(...LIME);
  doc.setLineWidth(1.2);
  doc.line(leftMargin, headerHeight - 2, rightMargin, headerHeight - 2);

  let y = headerHeight + 10;

  // ===== LESSON DETAILS =====
  y = sectionTitle('LESSON DETAILS', y);

  const infoBoxH = 50;
  doc.setFillColor(...SLATE_LIGHT);
  doc.setDrawColor(...SLATE_BORDER);
  doc.setLineWidth(0.4);
  doc.roundedRect(leftMargin, y - 5, contentWidth, infoBoxH, 2, 2, 'FD');

  const col1X = leftMargin + 4;
  const col2X = leftMargin + 98;
  let c1Y = y;
  let c2Y = y;

  c1Y = fieldRow('Lesson ID:', lesson.id, col1X, c1Y);
  c1Y = fieldRow('Date:', new Date(lesson.date).toLocaleDateString(), col1X, c1Y);
  const studentText = lesson.studentNames.join(', ');
  c1Y = fieldRow('Student:', studentText.length > 35 ? studentText.substring(0, 32) + '...' : studentText, col1X, c1Y);
  c1Y = fieldRow('School:', lesson.schoolName, col1X, c1Y);
  fieldRow('Type:', lesson.type || 'Individual', col1X, c1Y);

  c2Y = fieldRow('Time:', new Date(lesson.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), col2X, c2Y, 24);
  c2Y = fieldRow('Duration:', `${lesson.durationMinutes} mins`, col2X, c2Y, 24);
  c2Y = fieldRow('Teacher:', lesson.teacherName, col2X, c2Y, 24);

  // Status with color
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Status:', col2X, c2Y);
  doc.setFont(undefined, 'bold');
  if (lesson.status === LessonStatus.PRESENT || lesson.status === LessonStatus.TAUGHT) {
    doc.setTextColor(22, 163, 74);
  } else if (lesson.status === LessonStatus.CANCELLED) {
    doc.setTextColor(220, 38, 38);
  } else {
    doc.setTextColor(217, 119, 6);
  }
  doc.text(lesson.status, col2X + 24, c2Y);
  doc.setTextColor(...TEXT_BODY);
  c2Y += lineHeight;
  const modeLabel = getDeliveryMode(lesson) === DeliveryMode.ONLINE ? 'Online' : 'In-Person';
  fieldRow('Mode:', modeLabel, col2X, c2Y, 24);

  y += infoBoxH + 6;

  // ===== PERFORMANCE EVALUATION =====
  const showEvaluations = lesson.status === LessonStatus.PRESENT || lesson.status === LessonStatus.TAUGHT;
  if (showEvaluations && (lesson.interactivity || lesson.behavior)) {
    y = sectionTitle('PERFORMANCE EVALUATION', y);

    let evalRows = 0;
    if (lesson.interactivity) evalRows++;
    if (lesson.behavior) evalRows++;
    const evalBoxH = 4 + (evalRows * 10);

    doc.setFillColor(...SLATE_LIGHT);
    doc.setDrawColor(...SLATE_BORDER);
    doc.roundedRect(leftMargin, y - 5, contentWidth, evalBoxH, 2, 2, 'FD');

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_BODY);

    if (lesson.interactivity) {
      doc.text('Effort:', leftMargin + 4, y);
      let starX = leftMargin + 38;
      for (let i = 1; i <= 5; i++) {
        drawStar(doc, starX, y - 1, 5, 2.5, 1.2, i <= lesson.interactivity);
        starX += 8;
      }
      y += 10;
    }

    if (lesson.behavior) {
      doc.text('Practice:', leftMargin + 4, y);
      let starX = leftMargin + 38;
      for (let i = 1; i <= 5; i++) {
        drawStar(doc, starX, y - 1, 5, 2.5, 1.2, i <= lesson.behavior);
        starX += 8;
      }
      y += 10;
    }

    y += 4;
  }

  // ===== ACADEMIC PROGRESS (Phase 13 fields) =====
  const hasAcademic = lesson.overallGrade || lesson.repertoire || lesson.practiceAssignment || lesson.examPrepStatus;
  if (showEvaluations && hasAcademic) {
    y = sectionTitle('ACADEMIC PROGRESS', y);

    let acadRows = 0;
    if (lesson.overallGrade) acadRows++;
    if (lesson.repertoire) acadRows++;
    if (lesson.practiceAssignment) acadRows++;
    if (lesson.examPrepStatus) acadRows++;
    const acadBoxH = 4 + (acadRows * lineHeight);

    doc.setFillColor(...SLATE_LIGHT);
    doc.setDrawColor(...SLATE_BORDER);
    doc.roundedRect(leftMargin, y - 5, contentWidth, acadBoxH, 2, 2, 'FD');

    if (lesson.overallGrade) y = fieldRow('Grade Level:', lesson.overallGrade, leftMargin + 4, y, 36);
    if (lesson.repertoire) y = fieldRow('Repertoire:', lesson.repertoire, leftMargin + 4, y, 36);
    if (lesson.practiceAssignment) y = fieldRow('Practice:', lesson.practiceAssignment, leftMargin + 4, y, 36);
    if (lesson.examPrepStatus) y = fieldRow('Exam Prep:', lesson.examPrepStatus, leftMargin + 4, y, 36);

    y += 6;
  }

  // ===== LESSON NOTES (learning only — teacher notes masked for school admin) =====
  if (lesson.learning) {
    y = sectionTitle('LESSON NOTES', y);

    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...DARK);
    doc.text('What was learned:', leftMargin + 4, y);
    y += 5;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_BODY);
    const splitLearning = doc.splitTextToSize(lesson.learning, contentWidth - 8);
    doc.text(splitLearning, leftMargin + 4, y);
    y += (splitLearning.length * 4) + 5;
  }

  // ===== SCHOOL TEACHER COMMENT (Phase 19.2A) =====
  // This is the schoolAdminComment field, labeled "School Teacher Comment" on PDF
  if (lesson.schoolAdminComment) {
    y = sectionTitle('SCHOOL TEACHER COMMENT', y);

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_BODY);
    const splitComment = doc.splitTextToSize(lesson.schoolAdminComment, contentWidth - 8);
    doc.text(splitComment, leftMargin + 4, y);
    y += (splitComment.length * 4) + 5;
  }

  // NOTE: schoolAdminInternalComment is intentionally NOT included on PDF

  // ===== FOOTER =====
  const pageHeight = doc.internal.pageSize.height;
  doc.setDrawColor(...SLATE_BORDER);
  doc.setLineWidth(0.4);
  doc.line(leftMargin, pageHeight - 14, rightMargin, pageHeight - 14);
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Artickle Academy', leftMargin, pageHeight - 9);
  doc.setTextColor(...LIME);
  doc.text(' | ', leftMargin + doc.getTextWidth('Artickle Academy'), pageHeight - 9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Confidential', leftMargin + doc.getTextWidth('Artickle Academy | '), pageHeight - 9);
  doc.text(`Report ID: ${lesson.id}`, rightMargin - doc.getTextWidth(`Report ID: ${lesson.id}`), pageHeight - 9);

  const safeName = lesson.studentNames[0]?.replace(/[^a-z0-9]/gi, '_') || 'student';
  doc.save(`LessonReport_${safeName}_${lesson.id}.pdf`);
};

/**
 * Generate a branded multi-lesson student progress report PDF.
 * Phase 19.4 — student-level, school-scoped, no financial data, no internal comments.
 *
 * lessons: pre-filtered to this student, sorted oldest-first by caller
 * student: Student object (name + instrument)
 * schoolName: display name for the header
 * aiReportText: when provided, renders a compact 1-2 page term report (stats + AI text, no lesson detail)
 * periodLabel: e.g. "Term 1" → renders "End of Term 1 Report"; omit for "End of Enrollment Report"
 */
export const generateStudentReportPDF = async (
  lessons: Lesson[],
  student: Student,
  schoolName: string,
  aiReportText?: string,
  periodLabel?: string,
): Promise<void> => {
  if (typeof (window as any).jspdf === 'undefined') {
    alert('PDF Library loading... please wait or refresh.');
    return;
  }
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF();

  // --- Brand colors (same palette as generateSchoolLessonPDF) ---
  const DARK = [31, 41, 55] as const;
  const LIME = [200, 255, 0] as const;
  const SLATE_BORDER = [200, 213, 225] as const;
  const TEXT_BODY = [71, 85, 105] as const;
  const TEXT_MUTED = [148, 163, 184] as const;

  const leftMargin = 15;
  const rightMargin = 195;
  const contentWidth = rightMargin - leftMargin;
  const pageHeight = doc.internal.pageSize.height;

  // Load logo (async, before any drawing)
  const logoBase64 = await loadLogoBase64();

  // --- Star helper (closure over doc) ---
  const drawStar = (cx: number, cy: number, filled: boolean) => {
    const pts = 5;
    const outerR = 2.5;
    const innerR = 1.2;
    const path: number[][] = [];
    for (let i = 0; i < pts * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (Math.PI / 2 * 3) + (i * Math.PI / pts);
      path.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    const startX = path[0][0];
    const startY = path[0][1];
    doc.setFillColor(...(filled ? LIME : [200, 213, 225]));
    doc.setDrawColor(...(filled ? LIME : [200, 213, 225]));
    doc.setLineWidth(0.3);
    doc.lines(
      path.slice(1).map((p: number[], i: number) => [
        p[0] - (i === 0 ? startX : path[i][0]),
        p[1] - (i === 0 ? startY : path[i][1]),
      ]),
      startX, startY, [1.0, 1.0], filled ? 'FD' : 'S', true
    );
  };

  // --- Footer helper ---
  let pageNum = 1;
  const drawFooter = () => {
    doc.setDrawColor(...SLATE_BORDER);
    doc.setLineWidth(0.4);
    doc.line(leftMargin, pageHeight - 14, rightMargin, pageHeight - 14);
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Artickle Academy', leftMargin, pageHeight - 9);
    doc.setTextColor(...LIME);
    doc.text(' | ', leftMargin + doc.getTextWidth('Artickle Academy'), pageHeight - 9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Confidential — Student Progress Report', leftMargin + doc.getTextWidth('Artickle Academy | '), pageHeight - 9);
    const pageLabel = `Page ${pageNum}`;
    doc.text(pageLabel, rightMargin - doc.getTextWidth(pageLabel), pageHeight - 9);
  };

  // --- Page-break helper ---
  let y = 0;
  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 20) {
      drawFooter();
      doc.addPage();
      pageNum++;
      // Slim continuation header
      doc.setFillColor(...DARK);
      doc.rect(0, 0, 210, 16, 'F');
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Artickle Academy', leftMargin, 11);
      doc.setTextColor(...LIME);
      doc.text(` · ${student.name} — Progress Report`, leftMargin + doc.getTextWidth('Artickle Academy'), 11);
      doc.setDrawColor(...LIME);
      doc.setLineWidth(0.6);
      doc.line(leftMargin, 15, rightMargin, 15);
      y = 24;
    }
  };

  // ===== PAGE 1 HEADER =====
  const headerHeight = 60;
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 210, headerHeight, 'F');

  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 14, 6, 22, 22); } catch { /* logo load failed */ }
  }
  const titleX = logoBase64 ? 42 : 15;

  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Artickle', titleX, 17);
  doc.setTextColor(...LIME);
  doc.text(' Academy', titleX + doc.getTextWidth('Artickle'), 17);

  const reportTitle = aiReportText
    ? `End of ${periodLabel ?? 'Enrollment'} Report`
    : 'Student Progress Report';

  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...LIME);
  doc.text(reportTitle, titleX, 25);

  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(student.name, titleX, 34);

  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    `${schoolName}  ·  ${student.instrument}  ·  ${lessons.length} lesson${lessons.length !== 1 ? 's' : ''}`,
    titleX, 41
  );

  const now = new Date();
  doc.text(
    `Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    titleX, 48
  );

  doc.setDrawColor(...LIME);
  doc.setLineWidth(1.2);
  doc.line(leftMargin, headerHeight - 2, rightMargin, headerHeight - 2);

  y = headerHeight + 10;

  // ===== SUMMARY STATS =====
  // Compute the same values shown on the student detail page
  const completedLessons = lessons.filter(
    l => l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT
  );
  const activeLessons = lessons.filter(
    l => l.status !== LessonStatus.CANCELLED
  );
  const totalHours = (activeLessons.reduce((s, l) => s + (l.durationMinutes || 60), 0) / 60).toFixed(1);
  const attendanceRate = lessons.length > 0
    ? Math.round((completedLessons.length / lessons.length) * 100)
    : 0;
  const interactivityVals = completedLessons.filter(l => l.interactivity != null).map(l => l.interactivity!);
  const behaviorVals      = completedLessons.filter(l => l.behavior != null).map(l => l.behavior!);
  const avgInteractivity = interactivityVals.length
    ? (interactivityVals.reduce((a, b) => a + b, 0) / interactivityVals.length).toFixed(1)
    : '—';
  const avgBehavior = behaviorVals.length
    ? (behaviorVals.reduce((a, b) => a + b, 0) / behaviorVals.length).toFixed(1)
    : '—';

  // Section title with lime accent bar
  doc.setDrawColor(...LIME);
  doc.setLineWidth(1.5);
  doc.line(leftMargin, y - 1, leftMargin + 4, y - 1);
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...DARK);
  doc.text('SUMMARY', leftMargin + 7, y);
  y += 8;

  // Stats box background
  const SLATE_LIGHT = [248, 250, 252] as const;
  const boxH = 36;
  doc.setFillColor(...SLATE_LIGHT);
  doc.setDrawColor(...SLATE_BORDER);
  doc.setLineWidth(0.4);
  doc.roundedRect(leftMargin, y - 5, contentWidth, boxH, 2, 2, 'FD');

  // Six stats in a 3×2 grid
  const stats = [
    { label: 'Total Lessons',    value: String(lessons.length) },
    { label: 'Completed',        value: String(completedLessons.length) },
    { label: 'Attendance Rate',  value: `${attendanceRate}%` },
    { label: 'Total Hours',      value: `${totalHours}h` },
    { label: 'Avg Effort', value: `${avgInteractivity} / 5` },
    { label: 'Avg Practice',     value: `${avgBehavior} / 5` },
  ];

  const colW = contentWidth / 3;
  stats.forEach((stat, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const sx = leftMargin + 4 + col * colW;
    const sy = y + row * 16;

    doc.setFontSize(7.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(stat.label, sx, sy);

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...DARK);
    doc.text(stat.value, sx, sy + 7);
  });

  y += boxH + 8;

  if (aiReportText) {
    // ===== COMPACT TERM REPORT: period name then AI text, no lesson detail =====

    // Period / enrollment name heading
    const termHeading = periodLabel
      ? `End of ${periodLabel} Report`
      : 'End of Enrollment Report';

    doc.setDrawColor(...LIME);
    doc.setLineWidth(1.5);
    doc.line(leftMargin, y - 1, leftMargin + 4, y - 1);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...DARK);
    doc.text(termHeading.toUpperCase(), leftMargin + 7, y);

    doc.setFontSize(7.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Reviewed by teacher · Not a substitute for formal assessment', leftMargin + 7, y + 5);
    y += 14;

    doc.setDrawColor(...SLATE_BORDER);
    doc.setLineWidth(0.3);
    doc.line(leftMargin, y - 2, rightMargin, y - 2);

    // AI report body
    const SECTION_HEADERS = [
      'Overview:', 'Key Progress Points:', 'Next Steps:',
      'Technical Work:', 'Practical Work:', 'Practice:', 'General Comment:',
    ];

    aiReportText.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) { y += 2; return; }

      const isSectionHeader = SECTION_HEADERS.some(h => trimmed === h || trimmed.startsWith(h + ' '));
      const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-');

      if (isSectionHeader) {
        checkPageBreak(14);
        y += 4;
        doc.setFontSize(9.5);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...DARK);
        const colonIdx = trimmed.indexOf(':');
        const headerLabel = trimmed.slice(0, colonIdx + 1);
        const inlineBody = trimmed.slice(colonIdx + 1).trim();
        doc.text(headerLabel, leftMargin + 2, y);
        y += 5.5;
        if (inlineBody) {
          const inlineLines = doc.splitTextToSize(inlineBody, contentWidth - 8);
          checkPageBreak(inlineLines.length * 5);
          doc.setFont(undefined, 'normal');
          doc.setFontSize(9);
          doc.setTextColor(...TEXT_BODY);
          doc.text(inlineLines, leftMargin + 4, y);
          y += inlineLines.length * 5 + 1;
        }
      } else if (isBullet) {
        const bulletText = trimmed.replace(/^[•\-]\s*/, '');
        const bulletLines = doc.splitTextToSize(bulletText, contentWidth - 12);
        checkPageBreak(bulletLines.length * 5 + 3);
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...LIME);
        doc.text('•', leftMargin + 4, y);
        doc.setTextColor(...TEXT_BODY);
        doc.text(bulletLines, leftMargin + 9, y);
        y += bulletLines.length * 5 + 1;
      } else {
        const splitLine = doc.splitTextToSize(trimmed, contentWidth - 4);
        checkPageBreak(splitLine.length * 5 + 2);
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...TEXT_BODY);
        doc.text(splitLine, leftMargin + 2, y);
        y += splitLine.length * 5 + 2;
      }
    });

    y += 6;

  } else {
    // ===== FULL LESSON-BY-LESSON REPORT =====
    lessons.forEach((lesson, idx) => {
      const isCompleted =
        lesson.status === LessonStatus.PRESENT || lesson.status === LessonStatus.TAUGHT;

      let est = 22;
      if (lesson.learning) {
        const lines = doc.splitTextToSize(lesson.learning, contentWidth - 12);
        est += 7 + lines.length * 4.5;
      }
      if (isCompleted && lesson.interactivity) est += 10;
      if (isCompleted && lesson.behavior) est += 10;
      if (lesson.schoolAdminComment) {
        const lines = doc.splitTextToSize(lesson.schoolAdminComment, contentWidth - 12);
        est += 7 + lines.length * 4.5;
      }
      est += 10;

      checkPageBreak(est);

      doc.setDrawColor(...LIME);
      doc.setLineWidth(1.5);
      doc.line(leftMargin, y, leftMargin, y + 3);

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...DARK);
      const dateStr = new Date(lesson.date).toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      });
      doc.text(`${idx + 1}.  ${dateStr}`, leftMargin + 6, y);

      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...TEXT_MUTED);
      const rightLabel = `${lesson.teacherName}  ·  ${lesson.status}`;
      doc.text(rightLabel, rightMargin - doc.getTextWidth(rightLabel), y);
      y += 6;

      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(
        `${lesson.type || 'Individual'}  ·  ${getDeliveryMode(lesson) === DeliveryMode.ONLINE ? 'Online' : 'In-Person'}  ·  ${lesson.durationMinutes}min`,
        leftMargin + 6, y
      );
      y += 8;

      if (lesson.learning) {
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...TEXT_BODY);
        doc.text('Learning:', leftMargin + 6, y);
        y += 5;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...TEXT_BODY);
        const splitLearning = doc.splitTextToSize(lesson.learning, contentWidth - 12);
        doc.text(splitLearning, leftMargin + 6, y);
        y += splitLearning.length * 4.5 + 3;
      }

      if (isCompleted && lesson.interactivity) {
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...TEXT_BODY);
        doc.text('Effort:', leftMargin + 6, y);
        let starX = leftMargin + 40;
        for (let i = 1; i <= 5; i++) {
          drawStar(starX, y - 1, i <= lesson.interactivity);
          starX += 8;
        }
        y += 9;
      }

      if (isCompleted && lesson.behavior) {
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...TEXT_BODY);
        doc.text('Practice:', leftMargin + 6, y);
        let starX = leftMargin + 40;
        for (let i = 1; i <= 5; i++) {
          drawStar(starX, y - 1, i <= lesson.behavior);
          starX += 8;
        }
        y += 9;
      }

      if (lesson.schoolAdminComment) {
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...TEXT_BODY);
        doc.text('School Teacher Comment:', leftMargin + 6, y);
        y += 5;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...TEXT_BODY);
        const splitComment = doc.splitTextToSize(lesson.schoolAdminComment, contentWidth - 12);
        doc.text(splitComment, leftMargin + 6, y);
        y += splitComment.length * 4.5 + 3;
      }

      if (idx < lessons.length - 1) {
        doc.setDrawColor(...SLATE_BORDER);
        doc.setLineWidth(0.3);
        doc.line(leftMargin, y + 2, rightMargin, y + 2);
        y += 10;
      }
    });
  }

  // Footer on final page
  drawFooter();

  const safeName = student.name.replace(/[^a-z0-9]/gi, '_');
  const dateTag = new Date().toISOString().slice(0, 10);
  doc.save(`StudentReport_${safeName}_${dateTag}.pdf`);
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Polish Report PDF — Phase AI.2B+
 *
 * Two-part layout:
 *   Page 1  — dark branded header · student info grid · attendance snapshot
 *             with progress bars · AI-polished teacher summary
 *   Page 2+ — chronological Learning Journey (one card per lesson)
 *             Each card: date/duration/mode · polished notes · school comment quote box
 *
 * polishedNotes: Map<lessonId, polishedText> — built by batchPolishForPdf() before
 * this function is called.  Falls back to lesson.learning if key absent.
 */
export const generatePolishReportPDF = async (
  lessons: Lesson[],                    // sorted oldest-first by caller
  student: Student,
  schoolName: string,
  aiSummaryText: string | undefined,     // the reviewed AI prose; omit for raw (no-AI) export
  polishedNotes: Map<string, string>,   // lesson.id → polished lesson text
  teacherName: string,
  periodLabel?: string,
  outputMode?: 'download' | 'blob',
): Promise<void | Uint8Array> => {
  if (typeof (window as any).jspdf === 'undefined') {
    alert('PDF Library loading… please wait or refresh.');
    return;
  }
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF();

  // --- Palette ---
  const DARK         = [31, 41, 55]   as const;
  const LIME         = [200, 255, 0]  as const;
  const SLATE_LIGHT  = [248, 250, 252] as const;
  const SLATE_BORDER = [200, 213, 225] as const;
  const TEXT_BODY    = [71, 85, 105]  as const;
  const TEXT_MUTED   = [148, 163, 184] as const;
  const QUOTE_BG     = [241, 245, 249] as const;

  const leftMargin  = 15;
  const rightMargin = 195;
  const contentW    = rightMargin - leftMargin;
  const pageH       = doc.internal.pageSize.height;

  const logoBase64 = await loadLogoBase64();

  // --- Footer helper ---
  let pageNum = 1;
  const drawFooter = () => {
    doc.setDrawColor(...SLATE_BORDER);
    doc.setLineWidth(0.4);
    doc.line(leftMargin, pageH - 14, rightMargin, pageH - 14);
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Artickle Academy', leftMargin, pageH - 9);
    doc.setTextColor(...LIME);
    doc.text(' | ', leftMargin + doc.getTextWidth('Artickle Academy'), pageH - 9);
    doc.setTextColor(...TEXT_MUTED);
    const footerLabel = aiSummaryText?.trim()
      ? 'Confidential — Automated Progress Review'
      : 'Confidential — Progress Report';
    doc.text(footerLabel, leftMargin + doc.getTextWidth('Artickle Academy | '), pageH - 9);
    const lbl = `Page ${pageNum}`;
    doc.text(lbl, rightMargin - doc.getTextWidth(lbl), pageH - 9);
  };

  // --- Page-break + slim continuation header ---
  let y = 0;
  const checkPageBreak = (need: number) => {
    if (y + need <= pageH - 20) return;
    drawFooter();
    doc.addPage();
    pageNum++;
    doc.setFillColor(...DARK);
    doc.rect(0, 0, 210, 16, 'F');
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Artickle Academy', leftMargin, 11);
    doc.setTextColor(...LIME);
    doc.text(` · ${student.name} — Progress Report`, leftMargin + doc.getTextWidth('Artickle Academy'), 11);
    doc.setDrawColor(...LIME);
    doc.setLineWidth(0.6);
    doc.line(leftMargin, 15, rightMargin, 15);
    y = 24;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — HEADER
  // ═══════════════════════════════════════════════════════════════════════════
  const headerH = 54;
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 210, headerH, 'F');

  // Logo
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 14, 7, 20, 20); } catch { /* skip */ }
  }
  const titleX = logoBase64 ? 40 : leftMargin;

  // Wordmark
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Artickle', titleX, 18);
  doc.setTextColor(...LIME);
  doc.text(' Academy', titleX + doc.getTextWidth('Artickle'), 18);

  // Report subtitle
  const subtitle = periodLabel ? `Progress Report · ${periodLabel}` : 'Progress Report';
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...LIME);
  doc.text(subtitle, titleX, 26);

  // Student name
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(student.name, titleX, 36);

  // Student code — subtitle under name
  doc.setFontSize(7.5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`ID: ${student.id}`, titleX, 44);

  // School name — right-aligned, prominent
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(schoolName, rightMargin, 18, { align: 'right' });

  const nowLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.setFontSize(7);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Generated: ${nowLabel}`, rightMargin, 26, { align: 'right' });

  doc.setDrawColor(...LIME);
  doc.setLineWidth(1);
  doc.line(leftMargin, headerH - 1, rightMargin, headerH - 1);

  y = headerH + 10;

  // ─── INFO GRID ────────────────────────────────────────────────────────────
  const col2X     = leftMargin + contentW / 2 + 4;
  const fromLabel = lessons[0]?.date      ? fmtDate(lessons[0].date)                      : '—';
  const toLabel   = lessons[lessons.length - 1]?.date ? fmtDate(lessons[lessons.length - 1].date) : '—';

  const infoRow = (
    lbl1: string, val1: string,
    lbl2: string | null, val2: string | null,
  ) => {
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(lbl1.toUpperCase(), leftMargin, y);
    if (lbl2) doc.text(lbl2.toUpperCase(), col2X, y);
    y += 4;

    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...TEXT_BODY);
    doc.text(val1 || '—', leftMargin, y);
    if (val2 !== null) doc.text(val2 || '—', col2X, y);
    y += 7;
  };

  infoRow('Student',    student.name,                   'Instrument', student.instrument);
  infoRow('Teacher',    teacherName || '—',              'Period',     periodLabel || 'Full History');
  infoRow('Date Range', `${fromLabel}  –  ${toLabel}`,  null,         null);

  // Optional student fields — only rendered when the value actually exists
  const optFields: Array<[string, string]> = [];
  if (student.yearGrade)    optFields.push(['Year / Grade',   `Year ${student.yearGrade}`]);
  if (student.email)        optFields.push(['Email',           student.email]);
  if (student.phone)        optFields.push(['Phone',           student.phone]);
  if (student.dateOfBirth)  optFields.push(['Date of Birth',   fmtDate(student.dateOfBirth)]);

  for (let i = 0; i < optFields.length; i += 2) {
    const [l1, v1] = optFields[i];
    const pair     = optFields[i + 1];
    infoRow(l1, v1, pair ? pair[0] : null, pair ? pair[1] : null);
  }

  y += 2;

  // ─── ATTENDANCE SNAPSHOT ──────────────────────────────────────────────────
  const attended     = lessons.filter(l => l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT);
  const consumed     = lessons.filter(l =>
    l.status === LessonStatus.PRESENT ||
    l.status === LessonStatus.TAUGHT ||
    l.status === LessonStatus.ABSENT_UNEXCUSED,
  );
  const attendedCnt  = attended.length;
  const consumedCnt  = consumed.length;
  const lessonRate   = consumedCnt > 0 ? attendedCnt / consumedCnt : 0;

  // Avg effort & practice (out of 5) from completed lessons
  const effortVals   = attended.filter(l => l.interactivity != null).map(l => l.interactivity!);
  const practiceVals = attended.filter(l => l.behavior != null).map(l => l.behavior!);
  const avgEffort    = effortVals.length
    ? effortVals.reduce((a, b) => a + b, 0) / effortVals.length
    : null;
  const avgPractice  = practiceVals.length
    ? practiceVals.reduce((a, b) => a + b, 0) / practiceVals.length
    : null;

  // Section label
  doc.setDrawColor(...LIME);
  doc.setLineWidth(1.5);
  doc.line(leftMargin, y - 1, leftMargin + 4, y - 1);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...DARK);
  doc.text('ATTENDANCE SNAPSHOT', leftMargin + 7, y);
  y += 8;

  const snapH     = 52;
  const barStartX = leftMargin + 58;
  const barW      = contentW - 86;
  const barH      = 3.5;

  doc.setFillColor(...SLATE_LIGHT);
  doc.setDrawColor(...SLATE_BORDER);
  doc.setLineWidth(0.4);
  doc.roundedRect(leftMargin, y - 4, contentW, snapH, 2, 2, 'FD');

  const drawBar = (label: string, valLabel: string, rate: number, rowY: number) => {
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...DARK);
    doc.text(label, leftMargin + 4, rowY);

    doc.setFontSize(7.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_BODY);
    doc.text(valLabel, rightMargin - 4, rowY, { align: 'right' });

    // background track
    doc.setFillColor(...SLATE_BORDER);
    doc.rect(barStartX, rowY - 3.5, barW, barH, 'F');
    // filled portion
    if (rate > 0) {
      doc.setFillColor(...LIME);
      doc.rect(barStartX, rowY - 3.5, barW * Math.min(rate, 1), barH, 'F');
    }
    // percent label centred under bar
    const pctStr = `${Math.round(rate * 100)}%`;
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(pctStr, barStartX + barW / 2, rowY + 3.5, { align: 'center' });
  };

  drawBar(
    'Lessons attended',
    consumedCnt > 0 ? `${attendedCnt} / ${consumedCnt}` : '—',
    lessonRate,
    y + 5,
  );
  drawBar(
    'Avg Effort',
    avgEffort != null ? `${avgEffort.toFixed(1)} / 5` : '—',
    avgEffort != null ? avgEffort / 5 : 0,
    y + 22,
  );
  drawBar(
    'Avg Practice',
    avgPractice != null ? `${avgPractice.toFixed(1)} / 5` : '—',
    avgPractice != null ? avgPractice / 5 : 0,
    y + 39,
  );
  y += snapH + 8;

  // ─── LEARNING HIGHLIGHTS ──────────────────────────────────────────────────
  // Only show lessons that have actual notes content
  const lessonsWithNotes = lessons.filter(l => {
    const polished = polishedNotes.get(l.id);
    const raw = [l.learning, l.overallGrade, l.repertoire, l.practiceAssignment, l.notes]
      .filter(Boolean).join('');
    const combined = polished || raw;
    return combined.trim().length > 0;
  });

  if (lessonsWithNotes.length > 0) {
    checkPageBreak(20);
    doc.setDrawColor(...LIME);
    doc.setLineWidth(1.5);
    doc.line(leftMargin, y - 1, leftMargin + 4, y - 1);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...DARK);
    doc.text('LEARNING HIGHLIGHTS', leftMargin + 7, y);
    const ljLabelW = doc.getTextWidth('LEARNING HIGHLIGHTS');
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`  ${lessonsWithNotes.length} lesson${lessonsWithNotes.length !== 1 ? 's' : ''}`, leftMargin + 7 + ljLabelW, y);
    y += 8;

    lessonsWithNotes.forEach((lesson, idx) => {
      const rawNotes = [lesson.learning, lesson.overallGrade, lesson.repertoire,
        lesson.practiceAssignment, lesson.notes].filter(Boolean).join(' · ');
      const notesText = (polishedNotes.get(lesson.id) || '').trim() || rawNotes;
      const commentText = lesson.schoolAdminComment || '';

      // Pre-split at the correct render font size (9pt) for accurate line wrapping
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      const noteLines = notesText ? doc.splitTextToSize(notesText, contentW - 14) : [];
      let est = 14; // date + meta row
      if (noteLines.length) est += noteLines.length * 5 + 4;
      if (commentText) {
        doc.setFontSize(8.5);
        const cLines = doc.splitTextToSize(commentText, contentW - 20);
        est += cLines.length * 5 + 14;
      }
      est += 8;
      checkPageBreak(est);

      const cardStartY = y;

      // Date (bold) + duration/mode (right-aligned)
      const dateStr = new Date(lesson.date).toLocaleDateString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      });
      const modeStr = getDeliveryMode(lesson) === DeliveryMode.ONLINE ? 'Online' : 'In-Person';
      const metaStr = `${lesson.durationMinutes ?? 60}min · ${modeStr}`;

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...DARK);
      doc.text(dateStr, leftMargin + 6, y);
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...TEXT_MUTED);
      doc.text(metaStr, rightMargin, y, { align: 'right' });
      y += 6;

      // Notes — rendered line by line (no justify — avoids word-spacing on short/last lines)
      if (noteLines.length) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...TEXT_BODY);
        for (const noteLine of noteLines) {
          doc.text(noteLine, leftMargin + 6, y);
          y += 5;
        }
        y += 2;
      }

      // School comment — quoted box with lime left accent
      if (commentText) {
        doc.setFontSize(8.5);
        doc.setFont(undefined, 'normal');
        const cLines = doc.splitTextToSize(commentText, contentW - 20);
        const boxH   = cLines.length * 5 + 10;
        doc.setFillColor(...QUOTE_BG);
        doc.setDrawColor(...SLATE_BORDER);
        doc.setLineWidth(0.4);
        doc.roundedRect(leftMargin + 6, y - 2, contentW - 6, boxH, 1, 1, 'FD');
        doc.setFillColor(...LIME);
        doc.rect(leftMargin + 6, y - 2, 2, boxH, 'F');
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...TEXT_MUTED);
        doc.text('SCHOOL TEACHER COMMENT', leftMargin + 11, y + 2.5);
        doc.setFontSize(8.5);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(...TEXT_BODY);
        doc.text(cLines, leftMargin + 11, y + 8);
        y += boxH + 3;
      }

      // Left lime accent line spanning the full card height
      doc.setFillColor(...LIME);
      doc.rect(leftMargin, cardStartY - 2, 2, y - cardStartY + 2, 'F');

      // Divider between cards
      if (idx < lessonsWithNotes.length - 1) {
        doc.setDrawColor(...SLATE_BORDER);
        doc.setLineWidth(0.3);
        doc.line(leftMargin, y + 2, rightMargin, y + 2);
        y += 7;
      }
    });

    y += 8;
  }

  // ─── TEACHER SUMMARY (only when AI text is provided) ─────────────────────
  if (aiSummaryText?.trim()) {
  checkPageBreak(30);
  doc.setDrawColor(...LIME);
  doc.setLineWidth(1.5);
  doc.line(leftMargin, y - 1, leftMargin + 4, y - 1);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...DARK);
  doc.text('TEACHER SUMMARY', leftMargin + 7, y);

  doc.setFontSize(7.5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Not a substitute for formal assessment', leftMargin + 7, y + 5.5);
  y += 14;

  doc.setDrawColor(...SLATE_BORDER);
  doc.setLineWidth(0.3);
  doc.line(leftMargin, y - 2, rightMargin, y - 2);

  const SUMMARY_HEADERS = ['Overview:', 'Key Progress Points:', 'Areas for Development:'];
  aiSummaryText.split('\n').forEach(line => {
    const t = line.trim();
    if (!t) { y += 2; return; }

    const isH = SUMMARY_HEADERS.some(h => t.startsWith(h));
    const isB = t.startsWith('•') || t.startsWith('-');

    if (isH) {
      checkPageBreak(14);
      y += 3;
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...DARK);
      const ci = t.indexOf(':');
      const hLabel = t.slice(0, ci + 1);
      const hBody  = t.slice(ci + 1).trim();
      doc.text(hLabel, leftMargin + 2, y);
      y += 5;
      if (hBody) {
        const ls = doc.splitTextToSize(hBody, contentW - 6);
        checkPageBreak(ls.length * 5);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...TEXT_BODY);
        doc.text(ls, leftMargin + 4, y, { align: 'justify', maxWidth: contentW - 6 });
        y += ls.length * 5 + 1;
      }
    } else if (isB) {
      const bText = t.replace(/^[•\-]\s*/, '');
      const ls    = doc.splitTextToSize(bText, contentW - 10);
      checkPageBreak(ls.length * 5 + 3);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...LIME);
      doc.text('•', leftMargin + 4, y);
      doc.setTextColor(...TEXT_BODY);
      doc.text(ls, leftMargin + 9, y);
      y += ls.length * 5 + 1;
    } else {
      const ls = doc.splitTextToSize(t, contentW - 4);
      checkPageBreak(ls.length * 5 + 2);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...TEXT_BODY);
      doc.text(ls, leftMargin + 2, y, { align: 'justify', maxWidth: contentW - 4 });
      y += ls.length * 5 + 2;
    }
  });
  } // end teacher summary block

  drawFooter();

  const safeName2 = student.name.replace(/[^a-z0-9]/gi, '_');
  const dateTag2  = new Date().toISOString().slice(0, 10);
  const fileName2 = aiSummaryText?.trim()
    ? `ProgressReview_${safeName2}_${dateTag2}.pdf`
    : `${safeName2}.pdf`;
  if (outputMode === 'blob') return new Uint8Array((doc as any).output('arraybuffer') as ArrayBuffer);
  doc.save(fileName2);
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Term Report PDF — Style B
 *
 * Three-page structured academic report:
 *   Page 1 — cover + identity (header · info grid · attendance snapshot)
 *   Page 2 — four academic sections parsed from the saved AI term report
 *   Page 3 (optional) — monthly lesson count appendix + signature lines
 *
 * sections: parsed by resolveTermReportSections() before calling this function.
 */
export const generateTermReportPDF = async (
  lessons:       Lesson[],                 // sorted oldest-first
  student:       Student,
  schoolName:    string,
  sections: {
    technicalWork:  string;
    practicalWork:  string;
    practiceAtHome: string;
    generalComment: string;
  },
  teacherName:   string,
  periodLabel?:  string,
  outputMode?:   'download' | 'blob',
  scores?:       TermReportScores,
  approvedByName?: string,
  teacherReportDisplayName?: string,
  /** Pre-loaded base64 data URL of the teacher's signature PNG (avoids CORS) */
  teacherSignatureDataUrl?: string,
): Promise<void | Uint8Array> => {
  if (typeof (window as any).jspdf === 'undefined') {
    alert('PDF library loading… please wait or refresh.');
    return;
  }
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF();

  // ── Palette ─────────────────────────────────────────────────────────────────
  const DARK         = [31, 41, 55]    as const;
  const LIME         = [200, 255, 0]   as const;
  const SLATE_LIGHT  = [248, 250, 252] as const;
  const SLATE_BORDER = [200, 213, 225] as const;
  const TEXT_BODY    = [71,  85, 105]  as const;
  const TEXT_MUTED   = [148, 163, 184] as const;
  const SECTION_BG   = [241, 245, 249] as const; // slightly off-white card bg

  const leftMargin  = 15;
  const rightMargin = 195;
  const contentW    = rightMargin - leftMargin;
  const pageH       = doc.internal.pageSize.height;

  const logoBase64 = await loadLogoBase64();

  // ── Footer ──────────────────────────────────────────────────────────────────
  let pageNum = 1;
  const drawFooter = () => {
    doc.setDrawColor(...SLATE_BORDER);
    doc.setLineWidth(0.4);
    doc.line(leftMargin, pageH - 14, rightMargin, pageH - 14);
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Artickle Academy', leftMargin, pageH - 9);
    doc.setTextColor(...LIME);
    doc.text(' | ', leftMargin + doc.getTextWidth('Artickle Academy'), pageH - 9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Confidential — Academic Report', leftMargin + doc.getTextWidth('Artickle Academy | '), pageH - 9);
    const lbl = `Page ${pageNum}`;
    doc.text(lbl, rightMargin - doc.getTextWidth(lbl), pageH - 9);
  };

  // ── Page-break + slim continuation header ───────────────────────────────────
  let y = 0;
  const checkPageBreak = (need: number) => {
    if (y + need <= pageH - 20) return;
    drawFooter();
    doc.addPage();
    pageNum++;
    doc.setFillColor(...DARK);
    doc.rect(0, 0, 210, 16, 'F');
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Artickle Academy', leftMargin, 11);
    doc.setTextColor(...LIME);
    doc.text(` · ${student.name} — Academic Report`, leftMargin + doc.getTextWidth('Artickle Academy'), 11);
    doc.setDrawColor(...LIME);
    doc.setLineWidth(0.6);
    doc.line(leftMargin, 15, rightMargin, 15);
    y = 24;
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // PAGE 1 — HEADER
  // ══════════════════════════════════════════════════════════════════════════════
  const headerH = 64;
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 210, headerH, 'F');

  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 14, 7, 20, 20); } catch { /* skip */ }
  }
  const titleX = logoBase64 ? 40 : leftMargin;

  // Wordmark
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Artickle', titleX, 18);
  doc.setTextColor(...LIME);
  doc.text(' Academy', titleX + doc.getTextWidth('Artickle'), 18);

  // Report subtitle
  const subtitle = periodLabel ? `${periodLabel} Academic Report` : 'Academic Report';
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...LIME);
  doc.text(subtitle, titleX, 26);

  // Student name
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(student.name, titleX, 36);

  // Student code
  doc.setFontSize(7.5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`ID: ${student.id}`, titleX, 44);

  // School name — right-aligned, prominent
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(schoolName, rightMargin, 18, { align: 'right' });

  const nowLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.setFontSize(7);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Generated: ${nowLabel}`, rightMargin, 26, { align: 'right' });

  doc.setDrawColor(...LIME);
  doc.setLineWidth(1);
  doc.line(leftMargin, headerH - 1, rightMargin, headerH - 1);

  y = headerH + 10;

  // ── Info Grid ───────────────────────────────────────────────────────────────
  const col2X     = leftMargin + contentW / 2 + 4;
  const fromLabel = lessons[0]?.date ? fmtDate(lessons[0].date) : '—';
  const toLabel   = lessons[lessons.length - 1]?.date ? fmtDate(lessons[lessons.length - 1].date) : '—';

  const infoRow = (
    lbl1: string, val1: string,
    lbl2: string | null, val2: string | null,
  ) => {
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(lbl1.toUpperCase(), leftMargin, y);
    if (lbl2) doc.text(lbl2.toUpperCase(), col2X, y);
    y += 4.5;
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...TEXT_BODY);
    doc.text(val1 || '—', leftMargin, y);
    if (val2 !== null) doc.text(val2 || '—', col2X, y);
    y += 9;
  };

  infoRow('Student',    student.name,                  'Instrument', student.instrument);
  infoRow('Teacher',    teacherName || '—',             'Period',     periodLabel || 'Full History');
  infoRow('Date Range', `${fromLabel}  –  ${toLabel}`, null,         null);

  // Optional fields — only if data exists
  const optFields: Array<[string, string]> = [];
  if (student.yearGrade)   optFields.push(['Year / Grade',  `Year ${student.yearGrade}`]);
  if (student.email)       optFields.push(['Email',          student.email]);
  if (student.phone)       optFields.push(['Phone',          student.phone]);
  if (student.dateOfBirth) optFields.push(['Date of Birth',  fmtDate(student.dateOfBirth)]);
  for (let i = 0; i < optFields.length; i += 2) {
    const [l1, v1] = optFields[i];
    const pair     = optFields[i + 1];
    infoRow(l1, v1, pair ? pair[0] : null, pair ? pair[1] : null);
  }

  y += 2;

  // ── Attendance stats ─────────────────────────────────────────────────────────
  const attended    = lessons.filter(l => l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT);
  const consumed    = lessons.filter(l =>
    l.status === LessonStatus.PRESENT ||
    l.status === LessonStatus.TAUGHT  ||
    l.status === LessonStatus.ABSENT_UNEXCUSED,
  );
  const attendedCnt = attended.length;
  const consumedCnt = consumed.length;
  const lessonRate  = consumedCnt > 0 ? attendedCnt / consumedCnt : 0;
  const totalHoursNum = attended.reduce((s, l) => s + (l.durationMinutes ?? 0), 0) / 60;

  // ── SCORES card ───────────────────────────────────────────────────────────────
  checkPageBreak(20);
  doc.setDrawColor(...LIME);
  doc.setLineWidth(1.5);
  doc.line(leftMargin, y - 1, leftMargin + 4, y - 1);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...DARK);
  doc.text('SCORES', leftMargin + 7, y);
  if (scores) {
    const total = scores.technical + scores.practical + scores.practice;
    doc.setFontSize(9.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...DARK);
    doc.text(`Total: ${total}/40`, rightMargin, y, { align: 'right' });
  }
  y += 12;

  const scoreRows: Array<{ label: string; value: number; max: number; display: string }> = [
    {
      label:   'Lessons Attended',
      value:   attendedCnt,
      max:     consumedCnt || 1,
      display: consumedCnt > 0 ? `${attendedCnt}/${consumedCnt}  ·  ${Math.round(lessonRate * 100)}%` : '—',
    },
    ...(scores ? [
      { label: 'Technical Work', value: scores.technical, max: 10, display: `${scores.technical}/10` },
      { label: 'Practical Work', value: scores.practical, max: 20, display: `${scores.practical}/20` },
      { label: 'Practice',       value: scores.practice,  max: 10, display: `${scores.practice}/10`  },
    ] : []),
  ];

  const cardH = scoreRows.length * 13 + 12;
  checkPageBreak(cardH);
  doc.setFillColor(...SLATE_LIGHT);
  doc.setDrawColor(...SLATE_BORDER);
  doc.setLineWidth(0.4);
  doc.roundedRect(leftMargin, y - 4, contentW, cardH, 2, 2, 'FD');

  const sbLabelW = 44;
  const sbBarX   = leftMargin + sbLabelW + 8;
  const sbBarW   = contentW - sbLabelW - 30;
  const sbBarH   = 3;

  scoreRows.forEach((row, idx) => {
    const rowY = y + 5 + idx * 13;
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...DARK);
    doc.text(row.label, leftMargin + 4, rowY);
    doc.setFillColor(...SLATE_BORDER);
    doc.rect(sbBarX, rowY - 2.5, sbBarW, sbBarH, 'F');
    const rate = Math.min(1, row.value / row.max);
    if (rate > 0) {
      doc.setFillColor(...LIME);
      doc.rect(sbBarX, rowY - 2.5, sbBarW * rate, sbBarH, 'F');
    }
    doc.setFontSize(7.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_BODY);
    doc.text(row.display, rightMargin - 4, rowY, { align: 'right' });
  });

  y += cardH + 12;

  // ── ACADEMIC ASSESSMENT — plain paragraphs ────────────────────────────────────
  checkPageBreak(20);
  doc.setDrawColor(...LIME);
  doc.setLineWidth(1.5);
  doc.line(leftMargin, y - 1, leftMargin + 4, y - 1);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...DARK);
  doc.text('ACADEMIC ASSESSMENT', leftMargin + 7, y);
  y += 12;

  const commentSections: Array<{ title: string; body: string }> = [
    { title: 'Technical Work',  body: sections.technicalWork },
    { title: 'Practical Work',  body: sections.practicalWork },
    { title: 'Practice',        body: sections.practiceAtHome },
    { title: 'General Comment', body: sections.generalComment },
  ];

  for (const { title, body } of commentSections) {
    if (!body || body === '—') continue;
    const bodyLines = doc.splitTextToSize(body, contentW);
    checkPageBreak(8 + bodyLines.length * 5.5 + 8);
    doc.setFontSize(8.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...DARK);
    doc.text(title.toUpperCase(), leftMargin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_BODY);
    for (const line of bodyLines) {
      doc.text(line, leftMargin, y);
      y += 5.5;
    }
    y += 7;
  }

  // ── MONTHLY LESSON SUMMARY ─────────────────────────────────────────────────
  checkPageBreak(50);
  y += 4;
  doc.setDrawColor(...LIME);
  doc.setLineWidth(1.5);
  doc.line(leftMargin, y - 1, leftMargin + 4, y - 1);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...DARK);
  doc.text('MONTHLY LESSON SUMMARY', leftMargin + 7, y);
  y += 12;

  const byMonth = new Map<string, { attended: number; total: number; mins: number }>();
  lessons.forEach(l => {
    const key = l.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, { attended: 0, total: 0, mins: 0 });
    const m = byMonth.get(key)!;
    m.total++;
    if (l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT) {
      m.attended++;
      m.mins += l.durationMinutes ?? 0;
    }
  });

  const months = Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b));
  const COL = { month: leftMargin, attended: leftMargin + 60, total: leftMargin + 95, hours: leftMargin + 130 };

  doc.setFillColor(...DARK);
  doc.rect(leftMargin, y - 4, contentW, 11, 'F');
  doc.setFontSize(7.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Month',    COL.month    + 2, y + 2);
  doc.text('Attended', COL.attended + 2, y + 2);
  doc.text('Total',    COL.total    + 2, y + 2);
  doc.text('Hours',    COL.hours    + 2, y + 2);
  y += 10;

  months.forEach(([key, data], idx) => {
    checkPageBreak(10);
    const monthName = new Date(key + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (idx % 2 === 0) {
      doc.setFillColor(...SLATE_LIGHT);
      doc.rect(leftMargin, y - 4, contentW, 9, 'F');
    }
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_BODY);
    doc.text(monthName,             COL.month    + 2, y + 1);
    doc.text(String(data.attended), COL.attended + 2, y + 1);
    doc.text(String(data.total),    COL.total    + 2, y + 1);
    doc.text(`${(data.mins / 60).toFixed(1)}h`, COL.hours + 2, y + 1);
    y += 9;
  });

  const totalAttended = attended.length;
  const totalHours    = totalHoursNum.toFixed(1);
  doc.setFillColor(...DARK);
  doc.rect(leftMargin, y - 2, contentW, 10, 'F');
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL',                  COL.month    + 2, y + 4);
  doc.text(String(totalAttended),    COL.attended + 2, y + 4);
  doc.text(String(lessons.length),   COL.total    + 2, y + 4);
  doc.text(`${totalHours}h`,         COL.hours    + 2, y + 4);
  y += 18;

  // ── TEACHER SIGNATURE (always last) ───────────────────────────────────────────
  checkPageBreak(50);
  doc.setDrawColor(...LIME);
  doc.setLineWidth(1.5);
  doc.line(leftMargin, y - 1, leftMargin + 4, y - 1);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...DARK);
  doc.text('TEACHER', leftMargin + 7, y);
  y += 12;

  doc.setFontSize(8.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...DARK);
  doc.text('NAME OF TEACHER:', leftMargin, y);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...TEXT_BODY);
  doc.text(teacherReportDisplayName ?? approvedByName ?? teacherName ?? '—', leftMargin + 44, y);
  y += 12;

  doc.setFontSize(8.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...DARK);
  doc.text('SIGNATURE:', leftMargin, y);

  if (approvedByName && teacherSignatureDataUrl) {
    // Embed the pre-loaded signature image
    try {
      doc.addImage(teacherSignatureDataUrl, 'PNG', leftMargin + 28, y - 10, 50, 16);
    } catch {
      // Fallback: italic name if image embed fails
      doc.setFontSize(12);
      doc.setFont(undefined, 'italic');
      doc.setTextColor(...TEXT_BODY);
      doc.text(approvedByName, leftMargin + 30, y + 1);
    }
  } else if (approvedByName) {
    doc.setFontSize(12);
    doc.setFont(undefined, 'italic');
    doc.setTextColor(...TEXT_BODY);
    doc.text(approvedByName, leftMargin + 30, y + 1);
  } else {
    doc.setDrawColor(...SLATE_BORDER);
    doc.setLineWidth(0.5);
    doc.line(leftMargin + 30, y + 1, leftMargin + 110, y + 1);
  }
  y += 14;

  doc.setFontSize(8.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...DARK);
  doc.text('DATE:', leftMargin, y);
  if (approvedByName) {
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...TEXT_BODY);
    doc.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), leftMargin + 18, y);
  } else {
    doc.setDrawColor(...SLATE_BORDER);
    doc.setLineWidth(0.5);
    doc.line(leftMargin + 18, y + 1, leftMargin + 80, y + 1);
  }

  drawFooter();

  const safeName3 = student.name.replace(/[^a-z0-9]/gi, '_');
  const dateTag3  = new Date().toISOString().slice(0, 10);
  const periodTag = periodLabel ? `_${periodLabel.replace(/\s+/g, '_')}` : '';
  if (outputMode === 'blob') return new Uint8Array((doc as any).output('arraybuffer') as ArrayBuffer);
  doc.save(`AcademicReport_${safeName3}${periodTag}_${dateTag3}.pdf`);
};
