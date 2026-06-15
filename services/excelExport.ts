
import { Lesson, School, Teacher, LessonStatus } from '../types';

// Helper to check if SheetJS is loaded
const parseDate = (dateStr) => {
  if (!dateStr) return "";

  // Handle M/D/YYYY and MM/DD/YYYY formats
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
    const parts = dateStr.split(" ")[0].split("/");
    if (parts.length === 3) {
      const year = parseInt(parts[2], 10);
      const month = parseInt(parts[0], 10) - 1; // Month is 0-indexed
      const day = parseInt(parts[1], 10);
      const d = new Date(Date.UTC(year, month, day));
      return d.toISOString().substring(0, 10);
    }
  }

  // Handle ISO-like strings (YYYY-MM-DD...)
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().substring(0, 10);
    }
  } catch (e) {
    // Fallback for other formats
  }

  return dateStr.substring(0, 10); // Best effort
};

const getXLSX = () => {
  const XLSX = (window as any).XLSX;
  if (!XLSX) throw new Error("SheetJS not loaded");
  return XLSX;
};

// Helper: Get color for lesson status
const getStatusColor = (status: string): { fill: { fgColor: { rgb: string } }; font: { color: { rgb: string }; bold: boolean } } => {
  const colors: Record<string, { fill: { fgColor: { rgb: string } }; font: { color: { rgb: string }; bold: boolean } }> = {
    'Present': { fill: { fgColor: { rgb: 'FF00B050' } }, font: { color: { rgb: 'FFFFFFFF' }, bold: true } }, // Green
    'Taught': { fill: { fgColor: { rgb: 'FF00B050' } }, font: { color: { rgb: 'FFFFFFFF' }, bold: true } }, // Green
    'Absent (Unexcused)': { fill: { fgColor: { rgb: 'FFFFFF00' } }, font: { color: { rgb: 'FF000000' }, bold: true } }, // Yellow
    'Absent Excused': { fill: { fgColor: { rgb: 'FFFFC000' } }, font: { color: { rgb: 'FFFFFFFF' }, bold: true } }, // Orange
    'Cancelled': { fill: { fgColor: { rgb: 'FFFF0000' } }, font: { color: { rgb: 'FFFFFFFF' }, bold: true } } // Red
  };
  return colors[status] || { fill: { fgColor: { rgb: 'FFFFFFFF' } }, font: { color: { rgb: 'FF000000' }, bold: false } };
};

// Helper: Apply cell styling
const applyCellStyle = (cell: any, style: any) => {
  cell.fill = style.fill;
  cell.font = style.font;
};

interface ExportFilters {
  month: string; // YYYY-MM
  schoolId?: string;
  teacherId?: string;
}

interface AggregatedRow {
  date: string;
  schoolId: string;
  schoolName: string;
  teacherId: string;
  teacherName: string;
  teacherCode: string;
  instrument: string;
  actualHours: number;
  revenue: number; // For School Invoice
  cost: number; // For Teacher Pay
  lessonCount: number;
  status?: string; // Add status for color coding
}

// Helper: Group lessons by Date + School + Teacher + Instrument
// This matches the "Item/Description: <Instrument> classes (<Date>)" requirement
const aggregateLessons = (lessons: Lesson[]): AggregatedRow[] => {
  const groups: Record<string, AggregatedRow> = {};

  lessons.forEach(l => {
    // Skip only CANCELLED and ABSENT_EXCUSED lessons
    // ABSENT_UNEXCUSED should be counted (we bill for it)
    if (l.status === LessonStatus.CANCELLED || l.status === LessonStatus.ABSENT_EXCUSED) return;

    const date = parseDate(l.date);
    // Determine instrument from student/teacher context usually, 
    // but here we might need to derive it. 
    // Since Lesson type doesn't have instrument directly, we infer from context or use a placeholder if mixed.
    // However, the requirement asks for Instrument line items. 
    // In the AppContext/DataGenerator, Teacher has 'instrument'. We use that.
    
    // Key: Date_School_Teacher
    // We group by teacher, as rates and instruments are usually tied to teacher.
    const key = `${date}_${l.schoolId}_${l.teacherId}`;

    if (!groups[key]) {
      groups[key] = {
        date,
        schoolId: l.schoolId,
        schoolName: l.schoolName,
        teacherId: l.teacherId,
        teacherName: l.teacherName,
        teacherCode: '', // Filled later
        instrument: '', // Filled later
        actualHours: 0,
        revenue: 0,
        cost: 0,
        lessonCount: 0,
        status: l.status // Track status for color coding
      };
    }

    const durationHours = l.durationMinutes / 60;
    groups[key].actualHours += durationHours;
    groups[key].revenue += (l.schoolRate || 0);
    groups[key].cost += (l.teacherRate || 0);
    groups[key].lessonCount += 1;
  });

  return Object.values(groups);
};

// --- A) SCHOOL INVOICE EXPORT ---
export const exportSchoolInvoice = (
  lessons: Lesson[], 
  schools: School[], 
  teachers: Teacher[], 
  filters: ExportFilters
) => {
  const XLSX = getXLSX();
  
  // 1. Filter
  const filtered = lessons.filter(l => {
    const lessonDate = new Date(l.date);
    const filterDate = new Date(filters.month);
    if (lessonDate.getFullYear() !== filterDate.getFullYear() || lessonDate.getMonth() !== filterDate.getMonth()) return false;
    if (filters.schoolId && l.schoolId !== filters.schoolId) return false;
    if (filters.teacherId && l.teacherId !== filters.teacherId) return false;
    return true;
  });

  // 2. Aggregate
  const rows = aggregateLessons(filtered);

  // 3. Process Rows (Apply School Guarantees)
  const excelRows = rows.map(row => {
    const school = schools.find(s => s.id === row.schoolId);
    const teacher = teachers.find(t => t.id === row.teacherId);
    
    // Enrich data
    row.instrument = teacher?.instrument || 'Music';
    
    let guaranteedApplied = 'No';
    let minHours = 0;
    let chargedHours = row.actualHours;
    let adjustmentAmount = 0;

    // Check School Guarantees
    if (school?.minimumDailyHoursByInstrument && row.instrument) {
        // Find config for this instrument
        // Note: The key in config might be "Violin" but teacher instrument might be "Violin". Case sensitive match.
        const configEntry = Object.entries(school.minimumDailyHoursByInstrument).find(
            ([k, v]) => k.toLowerCase() === row.instrument.toLowerCase()
        );

        if (configEntry) {
            // The value is an object with { minHours, guaranteed }
            const config = configEntry[1] as any;
            if (config.guaranteed) {
                minHours = config.minHours || 0;
                if (row.actualHours < minHours) {
                    guaranteedApplied = 'Yes';
                    chargedHours = minHours;
                    
                    // Calculate Adjustment Cost
                    // Rate derivation: Revenue / Actual Hours. 
                    // If Actual Hours is 0 (unlikely here due to filter, but possible in edge cases), use default.
                    let effectiveRate = row.actualHours > 0 ? (row.revenue / row.actualHours) : school.defaultRate;
                    
                    // Specific Instrument Rate Override Check
                    if (school.instrumentRates) {
                         const rateKey = Object.keys(school.instrumentRates).find(k => k.toLowerCase() === row.instrument.toLowerCase());
                         if (rateKey) effectiveRate = school.instrumentRates[rateKey];
                    }

                    adjustmentAmount = (chargedHours - row.actualHours) * effectiveRate;
                }
            }
        }
    }

    const subtotal = row.revenue + adjustmentAmount;
    // Calculate display rate
    const displayRate = row.actualHours > 0 ? (row.revenue / row.actualHours) : 0;

    return {
        "School": row.schoolName,
        "Date": row.date,
        "Description": `${row.instrument} classes (${row.date})`,
        "Instrument": row.instrument,
        "Actual Hours": Number(row.actualHours.toFixed(2)),
        "Rate (SAR)": Number(displayRate.toFixed(2)),
        "Guaranteed Applied": guaranteedApplied,
        "Min Hours": minHours > 0 ? minHours : '-',
        "Charged Hours": Number(chargedHours.toFixed(2)),
        "Guarantee Adj.": Number(adjustmentAmount.toFixed(2)),
        "Subtotal (SAR)": Number(subtotal.toFixed(2))
    };
  });

  // 4. Create Workbook
  const worksheet = XLSX.utils.json_to_sheet(excelRows);
  
  // No color formatting needed for School Invoice
  
  // Auto-width (rudimentary)
  const wscols = Object.keys(excelRows[0] || {}).map(k => ({ wch: 20 }));
  wscols[2] = { wch: 30 }; // Description wider
  worksheet['!cols'] = wscols;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Invoice Data");
  
  const filename = `School_Invoice_${filters.month}${filters.schoolId ? '_'+filters.schoolId : ''}.xlsx`;
  XLSX.writeFile(workbook, filename);
};


// --- B) PAYROLL EXPORT ---
export const exportPayroll = (
  lessons: Lesson[], 
  schools: School[], 
  teachers: Teacher[], 
  filters: ExportFilters
) => {
  const XLSX = getXLSX();
  
  // 1. Filter
  const filtered = lessons.filter(l => {
    const lessonDate = new Date(l.date);
    const filterDate = new Date(filters.month);
    if (lessonDate.getFullYear() !== filterDate.getFullYear() || lessonDate.getMonth() !== filterDate.getMonth()) return false;
    if (filters.schoolId && l.schoolId !== filters.schoolId) return false;
    if (filters.teacherId && l.teacherId !== filters.teacherId) return false;
    return true;
  });

  // 2. Aggregate
  const rows = aggregateLessons(filtered);

  // 3. Process Rows (Apply Teacher Guarantees)
  const excelRows = rows.map(row => {
    const teacher = teachers.find(t => t.id === row.teacherId);
    
    // Enrich data
    row.instrument = teacher?.instrument || 'Music';
    row.teacherCode = teacher?.code || '';
    
    let guaranteedApplied = 'No';
    let minHours = 0;
    let chargedHours = row.actualHours;
    let adjustmentAmount = 0;

    // Only apply SCHOOL guarantees - ignore teacher guarantees
    const school = schools.find(s => s.id === row.schoolId);
    if (school?.minimumDailyHoursByInstrument && row.instrument) {
        const configEntry = Object.entries(school.minimumDailyHoursByInstrument).find(
            ([k, v]) => k.toLowerCase() === row.instrument.toLowerCase()
        );

        if (configEntry) {
            const config = configEntry[1] as any;
            if (config.guaranteed) {
                minHours = config.minHours || 0;
                if (row.actualHours < minHours) {
                    guaranteedApplied = 'Yes';
                    chargedHours = minHours;
                    
                    // Adjustment based on School Rate
                    let effectiveRate = row.actualHours > 0 ? (row.cost / row.actualHours) : school.defaultRate;
                    
                    if (school.instrumentRates) {
                        const rateKey = Object.keys(school.instrumentRates).find(k => k.toLowerCase() === row.instrument.toLowerCase());
                        if (rateKey) effectiveRate = school.instrumentRates[rateKey];
                    }
                    
                    adjustmentAmount = (chargedHours - row.actualHours) * effectiveRate;
                }
            }
        }
    }
    // Note: Teacher guarantees are NOT applied - only school guarantees apply

    const totalEarnings = row.cost + adjustmentAmount;
    const displayRate = row.actualHours > 0 ? (row.cost / row.actualHours) : 0;

    return {
        "Teacher": row.teacherName,
        "Teacher ID": row.teacherCode || row.teacherId, // Prefer TT-Code
        "School": row.schoolName,
        "Date": row.date,
        "Instrument": row.instrument,
        "Actual Hours": Number(row.actualHours.toFixed(2)),
        "Rate Used": Number(displayRate.toFixed(2)),
        "Earnings": Number(row.cost.toFixed(2)),
        "Guaranteed Applied": guaranteedApplied,
        "Min Hours": minHours > 0 ? minHours : '-',
        "Charged Hours": Number(chargedHours.toFixed(2)),
        "Guarantee Adj.": Number(adjustmentAmount.toFixed(2)),
        "Total Earnings": Number(totalEarnings.toFixed(2))
    };
  });

  // 4. Create Workbook
  const worksheet = XLSX.utils.json_to_sheet(excelRows);
  
  const wscols = Object.keys(excelRows[0] || {}).map(k => ({ wch: 15 }));
  wscols[0] = { wch: 20 }; // Name wider
  wscols[2] = { wch: 20 }; // School wider
  worksheet['!cols'] = wscols;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll Data");
  
  const filename = `Teacher_Payroll_${filters.month}${filters.teacherId ? '_'+filters.teacherId : ''}.xlsx`;
  XLSX.writeFile(workbook, filename);
};


// --- C) LESSON LOG EXPORT ---
export const exportLessonLog = (
  lessons: Lesson[],
  filters: any
) => {
  const XLSX = getXLSX();

  // 1. Filter lessons based on the provided filters
  const filtered = lessons.filter(l => {
    if (filters.from && new Date(l.date) < new Date(filters.from)) return false;
    if (filters.to && new Date(l.date) > new Date(filters.to)) return false;
    if (filters.teacherId && l.teacherId !== filters.teacherId) return false;
    if (filters.schoolId && l.schoolId !== filters.schoolId) return false;
    return true;
  });

  // 2. Map to a flat structure for export
  const excelRows = filtered.map(l => ({
    'Lesson ID': l.id,
    'Date': l.date,
    'Time': l.time,
    'Teacher': l.teacherName,
    'Student': l.studentName,
    'School': l.schoolName,
    'Status': l.status,
    'Duration (min)': l.durationMinutes,
    'Type': l.type,
    'Teacher Rate': l.teacherRate,
    'School Rate': l.schoolRate,
    'Min Hours': l.minHours,
    'Charged Hours': l.chargedHours,
    'Notes': l.notes,
    'Created At': l.createdAt
  }));

  // 3. Create Workbook
  const worksheet = XLSX.utils.json_to_sheet(excelRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Lesson Log');

  // 4. Auto-width columns
  const wscols = Object.keys(excelRows[0] || {}).map(k => ({ wch: 20 }));
  worksheet['!cols'] = wscols;

  // 5. Write file
  const today = new Date().toISOString().slice(0, 10);
  const filename = `LessonLog_${today}.xlsx`;
  XLSX.writeFile(workbook, filename);
};
