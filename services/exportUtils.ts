import { Lesson, getDeliveryMode, DeliveryMode } from '../types';

// CSV Export (kept for backward compatibility)
export const downloadCSV = (csvContent: string, filename: string) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ----------------------------------------------------------------------------
// Academy stamp / seal — shared across the invoice, payroll, and student-report
// PDF exports. Loads /stamp.png (the academy seal the admin uploads in
// Configuration) once and caches it. Returns a base64 data URL, or null if the
// file is absent so callers can simply skip drawing.
// ----------------------------------------------------------------------------
let _academyStampCache: string | null | undefined;
export const loadAcademyStamp = async (): Promise<string | null> => {
  if (_academyStampCache !== undefined) return _academyStampCache;
  try {
    const resp = await fetch('/stamp.png');
    if (!resp.ok) { _academyStampCache = null; return null; }
    const blob = await resp.blob();
    _academyStampCache = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    return _academyStampCache;
  } catch { _academyStampCache = null; return null; }
};

// Draw the academy stamp on a jsPDF doc as a square seal with a small caption
// underneath. (x, y) is the top-left of the square; size is the side in mm.
// No-op when stampDataUrl is null. captionColor is an [r,g,b] tuple.
export const drawAcademyStamp = (
  doc: any,
  stampDataUrl: string | null,
  x: number,
  y: number,
  size: number = 30,
  captionColor: readonly [number, number, number] = [148, 163, 184],
): void => {
  if (!stampDataUrl) return;
  try {
    doc.addImage(stampDataUrl, 'PNG', x, y, size, size);
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(captionColor[0], captionColor[1], captionColor[2]);
    doc.text('Authorised stamp', x + size / 2, y + size + 4, { align: 'center' });
  } catch { /* ignore malformed image */ }
};

// ----------------------------------------------------------------------------
// Import instructions — embedded as a second sheet ("Instructions") in every
// exported workbook. The importer only reads the first sheet (see importUtils),
// so having this sheet present never affects re-import.
// ----------------------------------------------------------------------------

export const LESSON_IMPORT_INSTRUCTIONS: string[][] = [
  ['LESSONS — IMPORT CHEAT SHEET'],
  [''],
  ['UPDATE EXISTING LESSON'],
  ['• Keep the original Lesson ID. Edit any cell. Blank cells are ignored (existing data kept).'],
  ['• Teachers: update only your own lessons; cannot change the two Comment columns.'],
  ['• School Admins: update lessons at your school; can edit both Comment columns.'],
  ['• Admins: can edit everything, including financial columns.'],
  [''],
  ['ADD NEW LESSON'],
  ['• Type "#NEW" in the Lesson ID column.'],
  ['• Required: Date, Time, Teacher, Student, School, Duration, Type, Delivery Mode.'],
  ['• Group lessons: put multiple student names comma-separated in the Student cell.'],
  ['• Status defaults to "Taught" if left blank.'],
  ['• Rates auto-calculate from the rate tables — leave Teacher Pay / School Bill blank.'],
  [''],
  ['RATE OVERRIDE (Admin only)'],
  ['• Prefix a rate with "#" to force a custom value.'],
  ['• Example: Teacher Pay cell = "#180" → uses 180 SAR verbatim.'],
  ['• Plain "180" (no #) on a new lesson triggers auto-calculation.'],
  [''],
  ['VALID VALUES'],
  ['• Status:        Present, Taught, Absent (Excused), Absent (Unexcused), Cancelled'],
  ['• Type:          Individual, Group'],
  ['• Delivery Mode: In-Person, Online'],
  ['• Effort / Practice: 1–5'],
  [''],
  ['NOTES'],
  ['• Changing Status or Duration recalculates rates automatically (unless you used "#" override).'],
  ['• New lessons created via import are NOT linked to any enrollment (standalone/ad-hoc).'],
];

export const STUDENT_IMPORT_INSTRUCTIONS: string[][] = [
  ['STUDENTS — IMPORT CHEAT SHEET'],
  [''],
  ['UPDATE EXISTING STUDENT'],
  ['• Keep the original Student ID. Edit any cell. Blank cells are ignored.'],
  ['• Teachers: only students assigned to you.'],
  ['• School Admins: only students at your school.'],
  [''],
  ['ADD NEW STUDENT'],
  ['• Type "#NEW" in the Student ID column.'],
  ['• Required: Student Name, School.'],
  ['• Optional: Assigned Teacher, Instrument, Year/Grade, Email, Date of Birth.'],
  ['• A new Student ID is generated automatically using the school code.'],
  [''],
  ['DUPLICATE DETECTION (when Student ID is blank)'],
  ['• Matches by name + school (+ teacher + instrument). If matched → updates that student.'],
  ['• To force creation even if a match exists, write "#NEW" in the Student ID column.'],
  [''],
  ['FORMATS'],
  ['• Date of Birth: YYYY-MM-DD'],
  ['• Year/Grade:    digits only (e.g. "5", "10")'],
  ['• Email:         lowercase, trimmed automatically'],
];

// Excel Export Function — attaches an "Instructions" sheet if provided
export const downloadExcel = (
  data: any[][],
  filename: string,
  sheetName: string = 'Sheet1',
  instructions?: string[][]
) => {
  const XLSX = (window as any).XLSX;
  if (!XLSX) {
    alert('Excel library not loaded. Please refresh the page.');
    return;
  }

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  const colWidths = data[0]?.map((col: any) => ({
    wch: Math.max(15, String(col).length + 2)
  })) || [];
  worksheet['!cols'] = colWidths;

  // Style header row
  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1F2937' } },
    alignment: { horizontal: 'center', vertical: 'center' }
  };

  for (let i = 0; i < data[0]?.length || 0; i++) {
    const cellRef = XLSX.utils.encode_col(i) + '1';
    if (worksheet[cellRef]) {
      worksheet[cellRef].s = headerStyle;
    }
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Append instructions sheet if provided — lives alongside the data sheet.
  // The importer reads only the first sheet, so this never interferes.
  if (instructions && instructions.length > 0) {
    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
    instructionsSheet['!cols'] = [{ wch: 100 }];
    // Bold the first row (title)
    const titleCell = instructionsSheet['A1'];
    if (titleCell) {
      titleCell.s = {
        font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1F2937' } },
      };
    }
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');
  }

  XLSX.writeFile(workbook, filename);
};

export const lessonsToCSV = (lessons: Lesson[]) => {
  const headers = [
    'Lesson ID',
    'Date',
    'Time',
    'Teacher',
    'Student',
    'School',
    'Status',
    'Duration',
    'Type',
    'Delivery Mode',
    'Teacher Pay',
    'School Bill',
    'Effort',
    'Practice',
    'Learning',
    'Notes'
  ];

  const rows = lessons.map(l => [
    l.id, // SS-TT-NNNN
    new Date(l.date).toLocaleDateString(),
    new Date(l.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    `"${l.teacherName}"`,
    `"${l.studentNames.join(', ')}"`,
    `"${l.schoolName}"`,
    l.status,
    l.durationMinutes,
    l.type,
    getDeliveryMode(l) === DeliveryMode.ONLINE ? 'Online' : 'In-Person',
    l.teacherRate,
    l.schoolRate,
    l.interactivity || '',
    l.behavior || '',
    `"${(l.learning || '').replace(/"/g, '""')}"`,
    `"${(l.notes || '').replace(/"/g, '""')}"`
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
};

// Unified lesson export — mode controls financials + internal comment visibility.
// - admin:        all fields including financials + internal comment
// - teacher:      no financials (teacher never sees school bill or their own pay via export)
// - school_admin: no financials, but keeps internal comment (scoped to their school)
export type LessonExportMode = 'admin' | 'teacher' | 'school_admin';

// Optional resolvers: when passed, the export writes the CURRENT names of the
// teacher / students / school (looked up live from state) rather than the
// snapshot names stored on the lesson. This matters because lessons store
// names at creation time — if a school is renamed later, the snapshot goes
// stale and re-import can't match the name. Passing resolvers fixes that.
export interface LessonExportResolvers {
  teachers?: Array<{ id: string; name: string }>;
  students?: Array<{ id: string; name: string }>;
  schools?: Array<{ id: string; name: string }>;
}

export const lessonsToExcel = (
  lessons: Lesson[],
  mode: LessonExportMode = 'admin',
  resolvers?: LessonExportResolvers,
) => {
  const includeFinancials = mode === 'admin';
  const includeInternalComment = mode === 'admin' || mode === 'school_admin';

  const headers: string[] = [
    'Lesson ID',
    'Date',
    'Time',
    'Teacher',
    'Student',
    'School',
    'Status',
    'Duration (min)',
    'Type',
    'Delivery Mode',
    ...(includeFinancials ? ['Teacher Pay (SAR)', 'School Bill (SAR)'] : []),
    'Effort',
    'Practice',
    'Learning',
    'Notes',
    // Phase 13 expanded evaluation fields
    'Overall Grade',
    'Repertoire',
    'Practice Assignment',
    'Exam Prep Status',
    // Phase 19.2A comments
    'School Teacher Comment',
    ...(includeInternalComment ? ['School Admin Internal Comment'] : []),
    // Admin-only audit column — mirrors the "Created" column in the Lessons Log table
    ...(includeFinancials ? ['Created'] : []),
  ];

  // Build O(1) lookup maps once so the row-level loop is cheap even with 10k+ lessons.
  const teacherById = new Map(resolvers?.teachers?.map(t => [t.id, t.name]) ?? []);
  const studentById = new Map(resolvers?.students?.map(s => [s.id, s.name]) ?? []);
  const schoolById = new Map(resolvers?.schools?.map(s => [s.id, s.name]) ?? []);

  const rows = lessons.map(l => {
    // Prefer live/current names; fall back to snapshot on the lesson if not found.
    const currentTeacherName = teacherById.get(l.teacherId) ?? l.teacherName;
    const currentStudentNames = (l.studentIds && l.studentIds.length > 0)
      ? l.studentIds.map((id, i) => studentById.get(id) ?? l.studentNames[i] ?? '').filter(Boolean).join(', ')
      : l.studentNames.join(', ');
    const currentSchoolName = schoolById.get(l.schoolId) ?? l.schoolName;

    const row: any[] = [
      l.id,
      new Date(l.date).toLocaleDateString(),
      new Date(l.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      currentTeacherName,
      currentStudentNames,
      currentSchoolName,
      l.status,
      l.durationMinutes,
      l.type,
      getDeliveryMode(l) === DeliveryMode.ONLINE ? 'Online' : 'In-Person',
    ];
    if (includeFinancials) row.push(l.teacherRate, l.schoolRate);
    row.push(
      l.interactivity || '',
      l.behavior || '',
      l.learning || '',
      l.notes || '',
      l.overallGrade || '',
      l.repertoire || '',
      l.practiceAssignment || '',
      l.examPrepStatus || '',
      l.schoolAdminComment || '',
    );
    if (includeInternalComment) row.push(l.schoolAdminInternalComment || '');
    if (includeFinancials) row.push(l.createdAt ? new Date(l.createdAt).toLocaleString() : '');
    return row;
  });

  return [headers, ...rows];
};

// Backward-compat alias — SchoolLessons.tsx still imports this name
export const schoolLessonsToExcel = (lessons: Lesson[]) =>
  lessonsToExcel(lessons, 'school_admin');

export const financialsToCSV = (data: any[], type: 'school' | 'teacher') => {
  if (type === 'school') {
    const headers = ['School ID', 'School Name', 'School Code', 'Default Rate', 'Total Lessons', 'Total Invoice Amount'];
    const rows = data.map(s => [
        s.id,
        `"${s.name}"`,
        s.code,
        s.defaultRate,
        s.totalLessons,
        s.totalInvoice
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  } else {
    const headers = ['Teacher ID', 'Teacher Name', 'Teacher Code', 'Instrument', 'Base Rate', 'Total Lessons', 'Total Payroll Amount'];
    const rows = data.map(t => [
        t.id,
        `"${t.name}"`,
        t.code,
        `"${t.instrument}"`,
        t.baseRate,
        t.totalLessons,
        t.totalPay
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
};

// Excel version of financials export
export const financialsToExcel = (data: any[], type: 'school' | 'teacher') => {
  if (type === 'school') {
    const headers = ['School ID', 'School Name', 'School Code', 'Default Rate', 'Total Lessons', 'Total Invoice Amount (SAR)'];
    const rows = data.map(s => [
        s.id,
        s.name,
        s.code,
        s.defaultRate,
        s.totalLessons,
        s.totalInvoice
    ]);
    return [headers, ...rows];
  } else {
    const headers = ['Teacher ID', 'Teacher Name', 'Teacher Code', 'Instrument', 'Base Rate', 'Total Lessons', 'Total Payroll Amount (SAR)'];
    const rows = data.map(t => [
        t.id,
        t.name,
        t.code,
        t.instrument,
        t.baseRate,
        t.totalLessons,
        t.totalPay
    ]);
    return [headers, ...rows];
  }
};

// Student-level lesson export — per-student report, no financial data, no internal comments
// Phase 19.4
// lessons must be pre-filtered to the target student and pre-sorted by the caller
export const studentLessonsToExcel = (lessons: Lesson[], studentName: string): any[][] => {
  const headers = [
    'Date',
    'Teacher',
    'Status',
    'Duration (min)',
    'Type',
    'Delivery Mode',
    'Effort',
    'Practice',
    'Learning',
    'Notes',
    'School Teacher Comment',
    // schoolAdminInternalComment intentionally excluded — Phase 19.4
  ];

  const rows = lessons.map(l => [
    new Date(l.date).toLocaleDateString(),
    l.teacherName,
    l.status,
    l.durationMinutes,
    l.type,
    getDeliveryMode(l) === DeliveryMode.ONLINE ? 'Online' : 'In-Person',
    l.interactivity ?? '',
    l.behavior ?? '',
    l.learning ?? '',
    l.notes ?? '',                 // already masked to undefined for school_admin by AppContext
    l.schoolAdminComment ?? '',    // "School Teacher Comment" — Phase 19.2A
  ]);

  return [headers, ...rows];
};

export const studentsToCSV = (students: any[], schools: any[], teachers: any[]) => {
  const headers = ['Student Name', 'School', 'Assigned Teacher', 'Instrument', 'Student ID'];
  const rows = students.map(s => {
      const schoolName = schools.find((sc: any) => sc.id === s.schoolId)?.name || 'Unknown';
      const teacherName = teachers.find((t: any) => t.id === s.teacherId)?.name || 'Unknown';
      return [`"${s.name}"`, `"${schoolName}"`, `"${teacherName}"`, `"${s.instrument}"`, s.id];
  });
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
};

// Excel version of students export — includes Phase 19.4B/C fields (year/grade, email, DOB)
export const studentsToExcel = (students: any[], schools: any[], teachers: any[]) => {
  const headers = [
    'Student ID',
    'Student Name',
    'School',
    'Assigned Teacher',
    'Instrument',
    'Year/Grade',
    'Email',
    'Date of Birth',
  ];
  const rows = students.map(s => {
    const schoolName = schools.find((sc: any) => sc.id === s.schoolId)?.name || 'Unknown';
    // Prefer current teacher assignment mirror; fall back to legacy teacherId
    const activeTeacherId = (s.currentTeacherIds && s.currentTeacherIds[0]) || s.teacherId;
    const teacherName = teachers.find((t: any) => t.id === activeTeacherId)?.name || 'Unknown';
    return [
      s.id,
      s.name,
      schoolName,
      teacherName,
      s.instrument || '',
      s.yearGrade || '',
      s.email || '',
      s.dateOfBirth || '',
    ];
  });
  return [headers, ...rows];
};
