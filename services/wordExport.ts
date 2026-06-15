/**
 * wordExport.ts
 *
 * Generates a .docx Term Report that mirrors the PDF layout as closely as
 * Word format allows:
 *   - Branded dark header (simulated via shaded table row)
 *   - Info grid (Student / Instrument / Teacher / Period / Date Range)
 *   - Scores card
 *   - Academic sections (Technical Work / Practical Work / Practice / General Comment)
 *   - Monthly Lesson Summary table
 *   - Teacher signature (embedded image when available)
 *   - Footer on every page
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  Header,
  Footer,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  VerticalAlign,
  PageNumber,
  HeadingLevel,
} from 'docx';
import { saveAs } from 'file-saver';
import { Lesson, LessonStatus, Student } from '../types';
import { TermReportScores } from './aiSummary/reportTypes';

// ─── Brand palette (approximate — Word doesn't support arbitrary RGB everywhere) ──
const DARK_HEX    = '1F2937';   // bg-slate-800
const LIME_HEX    = 'C8FF00';   // lime accent
const BODY_HEX    = '475569';   // slate-600
const MUTED_HEX   = '94A3B8';   // slate-400
const LIGHT_HEX   = 'F8FAFC';   // slate-50
const BORDER_HEX  = 'C8D5E1';   // slate-200
const WHITE_HEX   = 'FFFFFF';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Thin horizontal rule paragraph */
const hrParagraph = () =>
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LIME_HEX, space: 1 } },
    spacing: { before: 0, after: 120 },
    children: [],
  });

/** Section heading (lime underline style) */
const sectionHeading = (text: string) =>
  new Paragraph({
    spacing: { before: 280, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: LIME_HEX, space: 1 } },
    children: [
      new TextRun({ text, bold: true, size: 20, font: 'Calibri', color: DARK_HEX }),
    ],
  });

/** Body paragraph */
const bodyParagraph = (text: string, spacingAfter = 100) =>
  new Paragraph({
    spacing: { before: 60, after: spacingAfter },
    children: [
      new TextRun({ text, size: 19, font: 'Calibri', color: BODY_HEX }),
    ],
  });

/** Label + value inline */
const labelValue = (label: string, value: string) =>
  new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [
      new TextRun({ text: `${label}  `, bold: true, size: 18, font: 'Calibri', color: DARK_HEX }),
      new TextRun({ text: value || '—', size: 18, font: 'Calibri', color: BODY_HEX }),
    ],
  });

/** Two-column info row as a borderless table */
const infoRow = (
  lbl1: string, val1: string,
  lbl2: string | null, val2: string | null,
): Table => {
  const cellLeft = new TableCell({
    width: { size: 4680, type: WidthType.DXA },
    borders: noBorders(),
    margins: { top: 40, bottom: 40, left: 0, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: `${lbl1}  `, bold: true, size: 18, font: 'Calibri', color: DARK_HEX }),
          new TextRun({ text: val1 || '—', size: 18, font: 'Calibri', color: BODY_HEX }),
        ],
      }),
    ],
  });
  const cellRight = new TableCell({
    width: { size: 4680, type: WidthType.DXA },
    borders: noBorders(),
    margins: { top: 40, bottom: 40, left: 120, right: 0 },
    children: [
      lbl2 && val2 !== null
        ? new Paragraph({
            children: [
              new TextRun({ text: `${lbl2}  `, bold: true, size: 18, font: 'Calibri', color: DARK_HEX }),
              new TextRun({ text: val2 || '—', size: 18, font: 'Calibri', color: BODY_HEX }),
            ],
          })
        : new Paragraph({ children: [] }),
    ],
  });
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    rows: [new TableRow({ children: [cellLeft, cellRight] })],
  });
};

/** No-border helper */
const noBorders = () => ({
  top:    { style: BorderStyle.NONE, size: 0, color: 'auto' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'auto' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'auto' },
});

/** Light-bg card borders */
const cardBorders = () => ({
  top:    { style: BorderStyle.SINGLE, size: 4, color: BORDER_HEX },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_HEX },
  left:   { style: BorderStyle.SINGLE, size: 4, color: BORDER_HEX },
  right:  { style: BorderStyle.SINGLE, size: 4, color: BORDER_HEX },
});

// ─── Fetch image as ArrayBuffer ───────────────────────────────────────────────
async function fetchImageBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

// ─── Main export function ─────────────────────────────────────────────────────

export const generateTermReportDocx = async (
  lessons:                  Lesson[],
  student:                  Student,
  schoolName:               string,
  sections: {
    technicalWork:  string;
    practicalWork:  string;
    practiceAtHome: string;
    generalComment: string;
  },
  teacherName:              string,
  periodLabel?:             string,
  scores?:                  TermReportScores,
  approvedByName?:          string,
  teacherReportDisplayName?: string,
  teacherSignatureDataUrl?: string,
  output:                   'save' | 'blob' = 'save',
): Promise<void | Blob> => {
  const sorted = lessons.slice().sort((a, b) => a.date.localeCompare(b.date));
  const attended = sorted.filter(l =>
    l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT,
  );
  const consumed = sorted.filter(l =>
    l.status === LessonStatus.PRESENT ||
    l.status === LessonStatus.TAUGHT  ||
    l.status === LessonStatus.ABSENT_UNEXCUSED,
  );
  const attendedCnt  = attended.length;
  const consumedCnt  = consumed.length;
  const lessonPct    = consumedCnt > 0 ? Math.round((attendedCnt / consumedCnt) * 100) : 0;
  const totalHoursNum = attended.reduce((s, l) => s + (l.durationMinutes ?? 0), 0) / 60;
  const fromLabel    = sorted[0]?.date ? fmtDate(sorted[0].date) : '—';
  const toLabel      = sorted[sorted.length - 1]?.date ? fmtDate(sorted[sorted.length - 1].date) : '—';
  const nowLabel     = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const reportTitle  = periodLabel ? `${periodLabel} Academic Report` : 'Academic Report';
  const signatureName = teacherReportDisplayName ?? approvedByName ?? teacherName ?? '—';

  // ── Try loading logo & signature ────────────────────────────────────────────
  let logoBuffer: ArrayBuffer | null = null;
  try { logoBuffer = await fetchImageBuffer('/logo.png'); } catch { /* skip */ }

  let sigBuffer: ArrayBuffer | null = null;
  if (teacherSignatureDataUrl) {
    // teacherSignatureDataUrl is a base64 data URL — convert to ArrayBuffer
    try {
      const base64 = teacherSignatureDataUrl.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      sigBuffer = bytes.buffer;
    } catch { /* skip */ }
  }

  // ── Build document children ─────────────────────────────────────────────────
  const children: (Paragraph | Table)[] = [];

  // ── HEADER BLOCK (dark background table) ───────────────────────────────────
  const headerCellChildren: (Paragraph | Table)[] = [];

  if (logoBuffer) {
    headerCellChildren.push(
      new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [
          new ImageRun({
            type: 'png',
            data: logoBuffer,
            transformation: { width: 48, height: 48 },
            altText: { title: 'Logo', description: 'Artickle Academy', name: 'Logo' },
          }),
        ],
      }),
    );
  }

  headerCellChildren.push(
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({ text: 'Artickle', bold: true, size: 36, font: 'Calibri', color: WHITE_HEX }),
        new TextRun({ text: ' Academy', bold: true, size: 36, font: 'Calibri', color: LIME_HEX }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({ text: reportTitle, size: 20, font: 'Calibri', color: LIME_HEX }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({ text: student.name, bold: true, size: 22, font: 'Calibri', color: WHITE_HEX }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({ text: `ID: ${student.id}`, size: 15, font: 'Calibri', color: MUTED_HEX }),
        new TextRun({ text: `   ·   ${schoolName}`, size: 15, font: 'Calibri', color: MUTED_HEX }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({ text: `Generated: ${nowLabel}`, size: 16, font: 'Calibri', color: MUTED_HEX }),
      ],
    }),
  );

  children.push(
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 9360, type: WidthType.DXA },
              shading: { fill: DARK_HEX, type: ShadingType.CLEAR },
              borders: noBorders(),
              margins: { top: 200, bottom: 200, left: 240, right: 240 },
              children: headerCellChildren,
            }),
          ],
        }),
      ],
    }),
  );

  // ── INFO GRID ────────────────────────────────────────────────────────────────
  children.push(new Paragraph({ spacing: { before: 160, after: 40 }, children: [] }));
  children.push(infoRow('Student:', student.name,      'Instrument:', student.instrument));
  children.push(infoRow('Teacher:', teacherName || '—', 'Period:',     periodLabel || 'Full History'));
  children.push(infoRow('Date Range:', `${fromLabel}  –  ${toLabel}`, null, null));

  // Optional student fields (matches PDF info grid)
  const optFields: Array<[string, string]> = [];
  if (student.yearGrade)   optFields.push(['Year / Grade:', `Year ${student.yearGrade}`]);
  if (student.email)       optFields.push(['Email:', student.email]);
  if (student.phone)       optFields.push(['Phone:', student.phone]);
  if (student.dateOfBirth) optFields.push(['Date of Birth:', fmtDate(student.dateOfBirth)]);
  for (let i = 0; i < optFields.length; i += 2) {
    const [l1, v1] = optFields[i];
    const pair = optFields[i + 1];
    children.push(infoRow(l1, v1, pair ? pair[0] : null, pair ? pair[1] : null));
  }

  // ── SCORES ────────────────────────────────────────────────────────────────────
  if (scores) {
    const scoreTotalText = `Total: ${scores.technical + scores.practical + scores.practice}/40`;
    children.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        rows: [new TableRow({
          children: [
            new TableCell({
              width: { size: 4680, type: WidthType.DXA },
              borders: { ...noBorders(), bottom: { style: BorderStyle.SINGLE, size: 8, color: LIME_HEX } },
              verticalAlign: VerticalAlign.BOTTOM,
              margins: { top: 120, bottom: 40, left: 0, right: 0 },
              children: [new Paragraph({
                children: [new TextRun({ text: 'SCORES', bold: true, size: 20, font: 'Calibri', color: DARK_HEX })],
              })],
            }),
            new TableCell({
              width: { size: 4680, type: WidthType.DXA },
              borders: { ...noBorders(), bottom: { style: BorderStyle.SINGLE, size: 8, color: LIME_HEX } },
              verticalAlign: VerticalAlign.BOTTOM,
              margins: { top: 120, bottom: 40, left: 0, right: 0 },
              children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: scoreTotalText, bold: true, size: 19, font: 'Calibri', color: DARK_HEX })],
              })],
            }),
          ],
        })],
      }),
    );
  } else {
    children.push(sectionHeading('SCORES'));
  }

  const scoreRows: Array<{ label: string; display: string }> = [
    {
      label:   'Lessons Attended',
      display: consumedCnt > 0 ? `${attendedCnt} / ${consumedCnt}  (${lessonPct}%)` : '—',
    },
    {
      label:   'Total Hours',
      display: `${totalHoursNum.toFixed(1)}h`,
    },
    ...(scores ? [
      { label: 'Technical Work', display: `${scores.technical} / 10` },
      { label: 'Practical Work', display: `${scores.practical} / 20` },
      { label: 'Practice',       display: `${scores.practice} / 10`  },
      {
        label:   'Total',
        display: `${scores.technical + scores.practical + scores.practice} / 40`,
      },
    ] : []),
  ];

  const scoreTableRows = scoreRows.map((row, idx) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 6000, type: WidthType.DXA },
          shading: { fill: idx % 2 === 0 ? LIGHT_HEX : WHITE_HEX, type: ShadingType.CLEAR },
          borders: cardBorders(),
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: row.label,
                  bold: row.label === 'Total',
                  size: 18,
                  font: 'Calibri',
                  color: DARK_HEX,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: 3360, type: WidthType.DXA },
          shading: { fill: idx % 2 === 0 ? LIGHT_HEX : WHITE_HEX, type: ShadingType.CLEAR },
          borders: cardBorders(),
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: row.display,
                  bold: row.label === 'Total',
                  size: 18,
                  font: 'Calibri',
                  color: row.label === 'Total' ? DARK_HEX : BODY_HEX,
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  );

  children.push(
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [6000, 3360],
      rows: scoreTableRows,
    }),
  );

  // ── ACADEMIC ASSESSMENT ───────────────────────────────────────────────────────
  children.push(sectionHeading('ACADEMIC ASSESSMENT'));

  const commentSections: Array<{ title: string; body: string }> = [
    { title: 'Technical Work',  body: sections.technicalWork },
    { title: 'Practical Work',  body: sections.practicalWork },
    { title: 'Practice',        body: sections.practiceAtHome },
    { title: 'General Comment', body: sections.generalComment },
  ];

  for (const { title, body } of commentSections) {
    if (!body || body === '—') continue;
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 60 },
        children: [
          new TextRun({ text: title.toUpperCase(), bold: true, size: 19, font: 'Calibri', color: DARK_HEX }),
        ],
      }),
    );
    children.push(bodyParagraph(body, 60));
  }

  // ── MONTHLY LESSON SUMMARY ───────────────────────────────────────────────────
  children.push(sectionHeading('MONTHLY LESSON SUMMARY'));

  const byMonth = new Map<string, { attended: number; total: number; mins: number }>();
  sorted.forEach(l => {
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

  const monthlyHeaderRow = new TableRow({
    tableHeader: true,
    children: ['Month', 'Attended', 'Total', 'Hours'].map(h =>
      new TableCell({
        width: { size: 2340, type: WidthType.DXA },
        shading: { fill: DARK_HEX, type: ShadingType.CLEAR },
        borders: cardBorders(),
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: h, bold: true, size: 18, font: 'Calibri', color: WHITE_HEX })],
          }),
        ],
      }),
    ),
  });

  const monthlyDataRows = months.map(([key, data], idx) => {
    const monthName = new Date(key + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return new TableRow({
      children: [monthName, String(data.attended), String(data.total), `${(data.mins / 60).toFixed(1)}h`].map(v =>
        new TableCell({
          width: { size: 2340, type: WidthType.DXA },
          shading: { fill: idx % 2 === 0 ? LIGHT_HEX : WHITE_HEX, type: ShadingType.CLEAR },
          borders: cardBorders(),
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [new TextRun({ text: v, size: 18, font: 'Calibri', color: BODY_HEX })],
            }),
          ],
        }),
      ),
    });
  });

  const totalRow = new TableRow({
    children: [
      'TOTAL',
      String(attendedCnt),
      String(sorted.length),
      `${totalHoursNum.toFixed(1)}h`,
    ].map(v =>
      new TableCell({
        width: { size: 2340, type: WidthType.DXA },
        shading: { fill: DARK_HEX, type: ShadingType.CLEAR },
        borders: cardBorders(),
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: v, bold: true, size: 18, font: 'Calibri', color: WHITE_HEX })],
          }),
        ],
      }),
    ),
  });

  children.push(
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2340, 2340, 2340, 2340],
      rows: [monthlyHeaderRow, ...monthlyDataRows, totalRow],
    }),
  );

  // ── TEACHER / SIGNATURE ───────────────────────────────────────────────────────
  children.push(sectionHeading('TEACHER'));
  children.push(labelValue('Name of Teacher:', signatureName));
  children.push(
    new Paragraph({ spacing: { before: 120, after: 40 }, children: [
      new TextRun({ text: 'Signature:', bold: true, size: 18, font: 'Calibri', color: DARK_HEX }),
    ]}),
  );

  if (sigBuffer) {
    children.push(
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [
          new ImageRun({
            type: 'png',
            data: sigBuffer,
            transformation: { width: 130, height: 45 },
            altText: { title: 'Signature', description: 'Teacher signature', name: 'Signature' },
          }),
        ],
      }),
    );
  } else if (approvedByName) {
    // Italic text fallback
    children.push(
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({ text: approvedByName, italics: true, size: 24, font: 'Calibri', color: BODY_HEX }),
        ],
      }),
    );
  } else {
    // Blank signature line
    children.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_HEX, space: 1 } },
        spacing: { before: 40, after: 200 },
        children: [],
      }),
    );
  }

  children.push(labelValue(
    'Date:',
    approvedByName
      ? new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '',
  ));

  // ── ASSEMBLE DOCUMENT ────────────────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 20 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 720, right: 1080, bottom: 720, left: 1080 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${student.name}  —  ${reportTitle}`, size: 16, font: 'Calibri', color: MUTED_HEX }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                spacing: { before: 80 },
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_HEX, space: 1 } },
                children: [
                  new TextRun({ text: 'Artickle Academy', size: 14, font: 'Calibri', color: MUTED_HEX }),
                  new TextRun({ text: '  |  ', size: 14, font: 'Calibri', color: LIME_HEX }),
                  new TextRun({ text: 'Confidential — Academic Report', size: 14, font: 'Calibri', color: MUTED_HEX }),
                  new TextRun({ text: '    Page ', size: 14, font: 'Calibri', color: MUTED_HEX }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 14, font: 'Calibri', color: MUTED_HEX }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  if (output === 'blob') return buffer;
  const safeName  = student.name.replace(/[^a-z0-9]/gi, '_');
  const dateTag   = new Date().toISOString().slice(0, 10);
  const periodTag = periodLabel ? `_${periodLabel.replace(/\s+/g, '_')}` : '';
  saveAs(buffer, `AcademicReport_${safeName}${periodTag}_${dateTag}.docx`);
};

// ─── Progress Review (polish report) DOCX ──────────────────────────────────────

/** Bullet list paragraph */
const bulletParagraph = (text: string) =>
  new Paragraph({
    spacing: { before: 30, after: 30 },
    indent: { left: 360, hanging: 180 },
    children: [
      new TextRun({ text: '•  ', bold: true, size: 19, font: 'Calibri', color: DARK_HEX }),
      new TextRun({ text, size: 19, font: 'Calibri', color: BODY_HEX }),
    ],
  });

/**
 * Renders the Progress Review summary text (Overview / Key Progress Points /
 * Areas for Development) into Word paragraphs. Mirrors the polish PDF parser:
 * strips the internal `** ` AI marker, treats known headings as bold section
 * titles, and `•`/`-` lines as bullets.
 */
const renderPolishSummary = (aiSummaryText: string): Paragraph[] => {
  const SUMMARY_HEADERS = ['Overview:', 'Key Progress Points:', 'Areas for Development:'];
  const out: Paragraph[] = [];
  aiSummaryText.split('\n').forEach(rawLine => {
    let t = rawLine.trim();
    if (!t) return;
    if (t.startsWith('** ')) t = t.slice(3).trim();
    else if (t.startsWith('**')) t = t.slice(2).trim();
    if (!t) return;

    const header = SUMMARY_HEADERS.find(h => t.startsWith(h));
    const isBullet = t.startsWith('•') || t.startsWith('-');

    if (header) {
      const body = t.slice(header.length).trim();
      out.push(
        new Paragraph({
          spacing: { before: 160, after: 40 },
          children: [new TextRun({ text: header.replace(/:$/, ''), bold: true, size: 19, font: 'Calibri', color: DARK_HEX })],
        }),
      );
      if (body) out.push(bodyParagraph(body, 40));
    } else if (isBullet) {
      out.push(bulletParagraph(t.replace(/^[•\-]\s*/, '')));
    } else {
      out.push(bodyParagraph(t, 60));
    }
  });
  return out;
};

export const generatePolishReportDocx = async (
  lessons:        Lesson[],
  student:        Student,
  schoolName:     string,
  aiSummaryText:  string,                 // the reviewed Progress Review prose
  polishedNotes:  Map<string, string>,    // lesson.id → polished lesson text
  teacherName:    string,
  periodLabel?:   string,
  output:         'save' | 'blob' = 'save',
): Promise<void | Blob> => {
  const sorted = lessons.slice().sort((a, b) => a.date.localeCompare(b.date));
  const attended = sorted.filter(l =>
    l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT,
  );
  const consumed = sorted.filter(l =>
    l.status === LessonStatus.PRESENT ||
    l.status === LessonStatus.TAUGHT  ||
    l.status === LessonStatus.ABSENT_UNEXCUSED,
  );
  const attendedCnt   = attended.length;
  const consumedCnt   = consumed.length;
  const lessonPct     = consumedCnt > 0 ? Math.round((attendedCnt / consumedCnt) * 100) : 0;
  const totalHoursNum = attended.reduce((s, l) => s + (l.durationMinutes ?? 0), 0) / 60;
  const fromLabel     = sorted[0]?.date ? fmtDate(sorted[0].date) : '—';
  const toLabel       = sorted[sorted.length - 1]?.date ? fmtDate(sorted[sorted.length - 1].date) : '—';
  const nowLabel      = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const reportTitle   = periodLabel ? `Progress Review · ${periodLabel}` : 'Progress Review';

  let logoBuffer: ArrayBuffer | null = null;
  try { logoBuffer = await fetchImageBuffer('/logo.png'); } catch { /* skip */ }

  const children: (Paragraph | Table)[] = [];

  // ── HEADER BLOCK ────────────────────────────────────────────────────────────
  const headerCellChildren: (Paragraph | Table)[] = [];
  if (logoBuffer) {
    headerCellChildren.push(
      new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [
          new ImageRun({
            type: 'png',
            data: logoBuffer,
            transformation: { width: 48, height: 48 },
            altText: { title: 'Logo', description: 'Artickle Academy', name: 'Logo' },
          }),
        ],
      }),
    );
  }
  headerCellChildren.push(
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({ text: 'Artickle', bold: true, size: 36, font: 'Calibri', color: WHITE_HEX }),
        new TextRun({ text: ' Academy', bold: true, size: 36, font: 'Calibri', color: LIME_HEX }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [new TextRun({ text: reportTitle, size: 20, font: 'Calibri', color: LIME_HEX })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [new TextRun({ text: student.name, bold: true, size: 22, font: 'Calibri', color: WHITE_HEX })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({ text: `ID: ${student.id}`, size: 15, font: 'Calibri', color: MUTED_HEX }),
        new TextRun({ text: `   ·   ${schoolName}`, size: 15, font: 'Calibri', color: MUTED_HEX }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: `Generated: ${nowLabel}`, size: 16, font: 'Calibri', color: MUTED_HEX })],
    }),
  );
  children.push(
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      rows: [new TableRow({
        children: [new TableCell({
          width: { size: 9360, type: WidthType.DXA },
          shading: { fill: DARK_HEX, type: ShadingType.CLEAR },
          borders: noBorders(),
          margins: { top: 200, bottom: 200, left: 240, right: 240 },
          children: headerCellChildren,
        })],
      })],
    }),
  );

  // ── INFO GRID ───────────────────────────────────────────────────────────────
  children.push(new Paragraph({ spacing: { before: 160, after: 40 }, children: [] }));
  children.push(infoRow('Student:', student.name,       'Instrument:', student.instrument));
  children.push(infoRow('Teacher:', teacherName || '—', 'Period:',     periodLabel || 'Full History'));
  children.push(infoRow('Date Range:', `${fromLabel}  –  ${toLabel}`, 'Lessons Attended:',
    consumedCnt > 0 ? `${attendedCnt} / ${consumedCnt}  (${lessonPct}%)` : '—'));
  children.push(infoRow('Total Hours:', `${totalHoursNum.toFixed(1)}h`, null, null));

  // ── TEACHER SUMMARY ───────────────────────────────────────────────────────────
  if (aiSummaryText?.trim()) {
    children.push(sectionHeading('TEACHER SUMMARY'));
    children.push(
      new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: 'Not a substitute for formal assessment', italics: true, size: 15, font: 'Calibri', color: MUTED_HEX })],
      }),
    );
    children.push(...renderPolishSummary(aiSummaryText));
  }

  // ── LEARNING HIGHLIGHTS ─────────────────────────────────────────────────────
  const lessonsWithNotes = sorted.filter(l => (polishedNotes.get(l.id) || '').trim() || l.learning || l.notes);
  if (lessonsWithNotes.length > 0) {
    children.push(sectionHeading('LEARNING HIGHLIGHTS'));
    lessonsWithNotes.forEach(l => {
      const dateStr = new Date(l.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
      const noteText = (polishedNotes.get(l.id) || '').trim()
        || [l.learning, l.notes].filter(Boolean).join(' · ');
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 20 },
          children: [new TextRun({ text: dateStr, bold: true, size: 18, font: 'Calibri', color: DARK_HEX })],
        }),
      );
      if (noteText) children.push(bodyParagraph(noteText, 40));
    });
  }

  // ── ASSEMBLE ──────────────────────────────────────────────────────────────────
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 720, right: 1080, bottom: 720, left: 1080 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `${student.name}  —  ${reportTitle}`, size: 16, font: 'Calibri', color: MUTED_HEX })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            spacing: { before: 80 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_HEX, space: 1 } },
            children: [
              new TextRun({ text: 'Artickle Academy', size: 14, font: 'Calibri', color: MUTED_HEX }),
              new TextRun({ text: '  |  ', size: 14, font: 'Calibri', color: LIME_HEX }),
              new TextRun({ text: 'Confidential — Progress Review', size: 14, font: 'Calibri', color: MUTED_HEX }),
              new TextRun({ text: '    Page ', size: 14, font: 'Calibri', color: MUTED_HEX }),
              new TextRun({ children: [PageNumber.CURRENT], size: 14, font: 'Calibri', color: MUTED_HEX }),
            ],
          })],
        }),
      },
      children,
    }],
  });

  const buffer = await Packer.toBlob(doc);
  if (output === 'blob') return buffer;
  const safeName  = student.name.replace(/[^a-z0-9]/gi, '_');
  const dateTag   = new Date().toISOString().slice(0, 10);
  const periodTag = periodLabel ? `_${periodLabel.replace(/\s+/g, '_')}` : '';
  saveAs(buffer, `ProgressReview_${safeName}${periodTag}_${dateTag}.docx`);
};
