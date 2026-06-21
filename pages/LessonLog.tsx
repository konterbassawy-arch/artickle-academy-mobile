import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Role, Lesson, LessonStatus, DeliveryMode, getDeliveryMode, isTeacherOf } from '../types';
import { resolveTeacherRate, resolveSchoolRate } from '../services/rateService';
import { lessonsToExcel, downloadExcel, LESSON_IMPORT_INSTRUCTIONS } from '../services/exportUtils';
import { parseLessonExcel } from '../services/importUtils';
import { EditLessonModal } from '../components/EditLessonModal';
import { ViewLessonModal } from '../components/ViewLessonModal';
import { ImportResultsModal } from '../components/ImportResultsModal';
import { Attendance } from './Attendance';
import { matchesSearch } from '../services/searchUtils';

export const LessonLog: React.FC = () => {
  const { lessons, currentUser, updateLesson, deleteLesson, processLessonImport, schools, teachers, students, schoolEnrollmentPeriods } = useApp();
  const navigate = useNavigate();

  const studentDetailPath = (studentId: string) => {
    const base = currentUser?.role === Role.TEACHER ? '/teacher'
               : currentUser?.role === Role.SCHOOL_ADMIN ? '/school'
               : '/admin';
    return `${base}/students/${studentId}`;
  };

  const teacherDetailPath = (tid: string) =>
    currentUser?.role === Role.ADMIN ? `/admin/teachers/${tid}` : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [showFinancials, setShowFinancials] = useState(false);

  // Phase 19.3: Unread-notes filter — initialise from ?unread=1 URL param
  const [unreadOnly, setUnreadOnly] = useState(() => searchParams.get('unread') === '1');
  // Phase 19.4C: Student cross-reference filters (grade + email)
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [emailSearch, setEmailSearch] = useState('');
  // School filter (admin only)
  const [schoolFilter, setSchoolFilter] = useState<string>('all');
  // School period filter — sets date range when selected
  const [periodFilter, setPeriodFilter] = useState<string>('all');

  // Phase 19.3: Consume the ?unread=1 param once on mount, then clear it from the URL
  useEffect(() => {
    if (searchParams.get('unread') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('unread');
      setSearchParams(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- SELECTION STATE ---
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResults, setImportResults] = useState<{ added: number; skipped: number; errors: number; updated: number } | null>(null);

  const myLessons = currentUser?.role === Role.TEACHER
    ? lessons.filter(l => l.teacherId === currentUser.id)
    : lessons;

  // Phase 19.3: Count of teacher's unread lessons (used for toggle label + filter)
  const unreadCount = currentUser?.role === Role.TEACHER
    ? myLessons.filter(l => l.hasUnreadAdminNote).length
    : 0;

  // Phase 19.4C: available grades + student cross-reference set
  const availableGrades = useMemo(() => {
    const src = currentUser?.role === Role.TEACHER
      ? students.filter(s => isTeacherOf(s, currentUser.id))
      : students;
    const grades = [...new Set(src.map(s => s.yearGrade).filter(Boolean) as string[])];
    return grades.sort((a, b) => Number(a) - Number(b));
  }, [students, currentUser]);

  const hasStudentFilter = gradeFilter !== 'all' || emailSearch.trim() !== '';

  const matchingStudentIds = useMemo((): Set<string> => {
    if (!hasStudentFilter) return new Set();
    const src = currentUser?.role === Role.TEACHER
      ? students.filter(s => isTeacherOf(s, currentUser.id))
      : students;
    const gradeMatch = gradeFilter !== 'all'
      ? src.filter(s => s.yearGrade === gradeFilter)
      : src;
    const emailQ = emailSearch.trim().toLowerCase();
    const emailMatch = emailQ
      ? gradeMatch.filter(s => s.email?.toLowerCase().includes(emailQ))
      : gradeMatch;
    return new Set(emailMatch.map(s => s.id));
  }, [hasStudentFilter, students, currentUser, gradeFilter, emailSearch]);

  const filtered = myLessons.filter(l => {
    // Build a rich search corpus for this lesson, including instruments from student records
    const lessonStudents = l.studentIds?.map(id => students.find(s => s.id === id)).filter(Boolean) ?? [];
    const instruments = lessonStudents.map(s => s!.instrument || '').filter(Boolean);
    const corpus = [
      ...l.studentNames,
      l.teacherName,
      l.schoolName,
      l.id,
      l.type || '',
      l.status || '',
      ...instruments,
    ].map(v => v.toLowerCase());

    // Multi-term: split by comma — lesson matches only if EVERY term hits the corpus (AND logic)
    const searchMatch = matchesSearch(search, corpus);

    // Extract date in YYYY-MM-DD format from ISO string
    const lessonDate = l.date.substring(0, 10);
    let matchesDate = true;

    // Only apply date filters if they are set
    if (startDate) {
      // startDate is in YYYY-MM-DD format from date input
      matchesDate = matchesDate && lessonDate >= startDate;
    }
    if (endDate) {
      // endDate is in YYYY-MM-DD format from date input
      matchesDate = matchesDate && lessonDate <= endDate;
    }

    // Phase 19.3: Teacher-only unread filter — stacks with all existing filters
    const matchesUnread = !unreadOnly || l.hasUnreadAdminNote === true;

    // Phase 19.4C: student cross-reference filter — lesson must include at least one matching student
    const matchesStudent = !hasStudentFilter ||
      (l.studentIds?.some(id => matchingStudentIds.has(id)) ?? false);

    // School filter (admin only)
    const matchesSchool = schoolFilter === 'all' || l.schoolId === schoolFilter;

    return searchMatch && matchesDate && matchesUnread && matchesStudent && matchesSchool;
  });

  // --- BULK ACTIONS ---

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filtered.map(l => l.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkUpdate = (field: keyof Lesson, value: any) => {
    if (!window.confirm(`Are you sure you want to set ${field} to "${value}" for ${selectedIds.length} lessons?`)) return;

    selectedIds.forEach(id => {
      const lesson = lessons.find(l => l.id === id);
      if (!lesson) return;

      const updates: Partial<Lesson> = { [field]: value };

      const effectiveStatus = field === 'status' ? value : lesson.status;
      const effectiveType = field === 'type' ? value : lesson.type;

      // Phase 17.1: Centralized rate recalculation via resolveTeacherRate/resolveSchoolRate.
      // Uses the lesson's snapshotted deliveryMode so online lessons get online rates.
      if (field === 'status' || field === 'type') {
        if (effectiveStatus === LessonStatus.ABSENT_EXCUSED || effectiveStatus === LessonStatus.CANCELLED) {
            updates.teacherRate = 0;
            updates.schoolRate = 0;
        } else {
            const teacher = teachers.find(t => t.id === lesson.teacherId);
            const school = schools.find(s => s.id === lesson.schoolId);
            const lessonDeliveryMode = getDeliveryMode(lesson);

            // Resolve hourly rates using centralized engine
            const hourlyTeacherRate = teacher
              ? resolveTeacherRate(teacher, lesson.schoolId, effectiveType, lessonDeliveryMode)
              : 60;

            // For school rate: find instrument from first student
            const firstStudent = lesson.studentIds?.length > 0
              ? students.find(s => s.id === lesson.studentIds[0])
              : undefined;
            const instrument = firstStudent?.instrument || '';

            const hourlySchoolRate = school
              ? resolveSchoolRate(school, lesson.teacherId, instrument, effectiveType, lessonDeliveryMode)
              : 120;

            const durationHours = (lesson.durationMinutes || 30) / 60;
            const studentCount = lesson.studentIds.length > 0 ? lesson.studentIds.length : (lesson.studentNames.length || 1);

            let tRate = hourlyTeacherRate * durationHours;
            let sRate = hourlySchoolRate * durationHours;

            // Multiply by student count for Group lessons
            if (effectiveType === 'Group') {
                tRate = tRate * studentCount;
                sRate = sRate * studentCount;
            }

            updates.teacherRate = parseFloat(tRate.toFixed(2));
            updates.schoolRate = parseFloat(sRate.toFixed(2));
        }
      }

      updateLesson(id, updates);
    });

    setSelectedIds([]); // Clear selection after action
  };

  // --- EXISTING HANDLERS ---

  const handleExportCSV = () => {
    const toExport = selectedIds.length > 0
      ? filtered.filter(l => selectedIds.includes(l.id))
      : filtered;
    const mode = currentUser?.role === Role.TEACHER ? 'teacher'
               : currentUser?.role === Role.SCHOOL_ADMIN ? 'school_admin'
               : 'admin';
    const data = lessonsToExcel(toExport, mode, { teachers, students, schools });
    const dateStr = new Date().toISOString().slice(0,10);
    downloadExcel(data, `LessonLog_${dateStr}.xlsx`, 'Lessons', LESSON_IMPORT_INSTRUCTIONS);
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
          const data = await parseLessonExcel(file);
          const results = await processLessonImport(data, {
            role: currentUser?.role,
            currentUserId: currentUser?.id,
            schoolId: (currentUser as any)?.schoolId,
          });
          setImportResults(results);
      } catch (err) {
          alert('Error processing file: ' + err);
      }
      
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveLesson = (id: string, data: Partial<Lesson>) => {
    updateLesson(id, data);
  };

  const handleDeleteLesson = async (lesson: Lesson) => {
    const studentList = lesson.studentNames.join(', ');
    const dateStr = new Date(lesson.date).toLocaleDateString();
    const msg = `DELETE LESSON\n\nStudent: ${studentList}\nTeacher: ${lesson.teacherName}\nSchool: ${lesson.schoolName}\nDate: ${dateStr}\nDuration: ${lesson.durationMinutes} min\nAmount: Inv ${lesson.schoolRate} | Pay ${lesson.teacherRate}\n\nThis cannot be undone!`;
    
    if (!window.confirm(msg)) return;
    
    try {
      await deleteLesson(lesson.id);
      alert('Lesson deleted successfully');
    } catch (error) {
      alert('Error deleting lesson: ' + error);
    }
  };

  // Robust Vector Star Drawer
  const drawStar = (doc: any, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, filled: boolean) => {
    let rot = (Math.PI / 2) * 3;
    let step = Math.PI / spikes;
    let startX = cx + Math.cos(rot) * outerRadius;
    let startY = cy + Math.sin(rot) * outerRadius;
    const path = [];
    let currentX = startX;
    let currentY = startY;
    for (let i = 0; i < spikes; i++) {
        rot += step;
        let nx = cx + Math.cos(rot) * innerRadius;
        let ny = cy + Math.sin(rot) * innerRadius;
        path.push([nx - currentX, ny - currentY]);
        currentX = nx; currentY = ny;
        rot += step;
        nx = cx + Math.cos(rot) * outerRadius;
        ny = cy + Math.sin(rot) * outerRadius;
        path.push([nx - currentX, ny - currentY]);
        currentX = nx; currentY = ny;
    }
    doc.setDrawColor(255, 193, 7); 
    if (filled) doc.setFillColor(255, 193, 7); else doc.setFillColor(255, 255, 255);
    doc.setLineWidth(0.1);
    doc.lines(path, startX, startY, [1.0, 1.0], filled ? 'FD' : 'S', true);
  };

  // Phase 14.1: Load logo from /logo.png, convert to base64 for jsPDF addImage
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

  const generatePDF = async (lesson: any) => {
    if (typeof (window as any).jspdf === 'undefined') { alert('PDF Library loading... please wait or refresh.'); return; }
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();

    // --- Brand colors ---
    const DARK = [31, 41, 55] as const;       // slate-800
    const LIME = [200, 255, 0] as const;       // ARTickle lime
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

    // ===== HEADER =====
    const headerHeight = 52;
    doc.setFillColor(...DARK);
    doc.rect(0, 0, 210, headerHeight, 'F');

    // Logo (fetched at runtime → base64)
    const logoBase64 = await loadLogoBase64();
    if (logoBase64) {
      try { doc.addImage(logoBase64, 'PNG', 14, 6, 22, 22); } catch { /* logo failed, continue */ }
    }

    // Title text (positioned after logo area)
    const titleX = logoBase64 ? 42 : 15;
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('ARTickle', titleX, 17);
    doc.setTextColor(...LIME);
    doc.text(' Academy', titleX + doc.getTextWidth('ARTickle'), 17);

    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...LIME);
    doc.text('Lesson Report', titleX, 25);

    // Generated date
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    const now = new Date();
    doc.text(`Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`, titleX, 32);

    // Accent line at bottom of header
    doc.setDrawColor(...LIME);
    doc.setLineWidth(1.2);
    doc.line(leftMargin, headerHeight - 2, rightMargin, headerHeight - 2);

    let y = headerHeight + 10;

    // ===== LESSON DETAILS =====
    y = sectionTitle('LESSON DETAILS', y);

    // Info box background
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
    if (lesson.status === 'Present' || lesson.status === LessonStatus.PRESENT ||
        lesson.status === 'Taught' || lesson.status === LessonStatus.TAUGHT) {
      doc.setTextColor(22, 163, 74); // green
    } else if (lesson.status === 'Cancelled' || lesson.status === LessonStatus.CANCELLED) {
      doc.setTextColor(220, 38, 38); // red
    } else {
      doc.setTextColor(217, 119, 6); // amber
    }
    doc.text(lesson.status, col2X + 24, c2Y);
    doc.setTextColor(...TEXT_BODY);
    c2Y += lineHeight;
    // Phase 15: Delivery mode
    const modeLabel = getDeliveryMode(lesson) === DeliveryMode.ONLINE ? 'Online' : 'In-Person';
    c2Y = fieldRow('Mode:', modeLabel, col2X, c2Y, 24);

    y += infoBoxH + 6;

    // ===== PERFORMANCE EVALUATION =====
    const showEvaluations = lesson.status === LessonStatus.PRESENT || lesson.status === LessonStatus.TAUGHT || lesson.status === 'Present' || lesson.status === 'Taught';
    if (showEvaluations && (lesson.interactivity || lesson.behavior)) {
      y = sectionTitle('PERFORMANCE EVALUATION', y);

      // Calculate box height: base 4 + 8 per rating row
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

      // Count rows to size the box
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

    // ===== LESSON NOTES =====
    if (lesson.learning || lesson.notes) {
      y = sectionTitle('LESSON NOTES', y);

      if (lesson.learning) {
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

      if (lesson.notes) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...DARK);
        doc.text('Teacher Comments:', leftMargin + 4, y);
        y += 5;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...TEXT_BODY);
        const splitNotes = doc.splitTextToSize(lesson.notes, contentWidth - 8);
        doc.text(splitNotes, leftMargin + 4, y);
      }
    }

    // ===== FOOTER =====
    const pageHeight = doc.internal.pageSize.height;
    doc.setDrawColor(...SLATE_BORDER);
    doc.setLineWidth(0.4);
    doc.line(leftMargin, pageHeight - 14, rightMargin, pageHeight - 14);
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('ARTickle Academy', leftMargin, pageHeight - 9);
    doc.setTextColor(...LIME);
    doc.text(' | ', leftMargin + doc.getTextWidth('ARTickle Academy'), pageHeight - 9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Confidential', leftMargin + doc.getTextWidth('ARTickle Academy | '), pageHeight - 9);
    doc.text(`Report ID: ${lesson.id}`, rightMargin - doc.getTextWidth(`Report ID: ${lesson.id}`), pageHeight - 9);

    const safeName = lesson.studentNames[0]?.replace(/[^a-z0-9]/gi, '_') || 'student';
    doc.save(`LessonReport_${safeName}_${lesson.id}.pdf`);
  };

  const inputCls = 'w-full bg-slate-800/80 border border-slate-700/80 text-white px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm placeholder:text-slate-600 transition-all';
  const labelCls = 'block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="space-y-6">
      {importResults && (
        <ImportResultsModal
            results={importResults}
            onClose={() => setImportResults(null)}
        />
      )}

      {showAddLesson && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-slate-950 ring-1 ring-white/10 rounded-2xl w-full max-w-3xl my-8 relative">
            <button
              onClick={() => setShowAddLesson(false)}
              className="absolute top-4 right-4 z-10 text-slate-400 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              ×
            </button>
            <div className="p-6">
              <Attendance onClose={() => setShowAddLesson(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Lessons Log</h1>
          <p className="text-slate-500 text-sm mt-1">Lesson history</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />
          {currentUser?.role === Role.ADMIN && (
            <button
              onClick={handleImportClick}
              className="bg-slate-800/80 ring-1 ring-white/10 hover:bg-slate-700/80 text-slate-300 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Import
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            {selectedIds.length > 0 ? `Export ${selectedIds.length} selected` : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* Filters card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
        {/* Row 1: search inputs */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ID, student, teacher, instrument..."
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 placeholder:text-slate-500"
            />
          </div>
          <div className="relative flex-1">
            <input
              type="text"
              value={emailSearch}
              onChange={e => setEmailSearch(e.target.value)}
              placeholder="Filter by student email..."
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Row 2: dropdowns */}
        <div className="flex gap-1.5">
          {currentUser?.role === Role.ADMIN && (
            <select
              value={schoolFilter}
              onChange={e => { setSchoolFilter(e.target.value); setPeriodFilter('all'); setStartDate(''); setEndDate(''); }}
              className="flex-1 min-w-0 bg-slate-800/80 border border-slate-700/80 text-white px-2 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-xs transition-all"
            >
              <option value="all">All Schools</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {currentUser?.role === Role.ADMIN && (
            <select
              value={periodFilter}
              onChange={e => {
                const val = e.target.value;
                setPeriodFilter(val);
                if (val === 'all') { setStartDate(''); setEndDate(''); }
                else {
                  const period = schoolEnrollmentPeriods.find(p => p.id === val);
                  if (period) { setStartDate(period.startDate); setEndDate(period.endDate); }
                }
              }}
              className="flex-1 min-w-0 bg-slate-800/80 border border-slate-700/80 text-white px-2 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-xs transition-all"
              disabled={schoolEnrollmentPeriods.filter(p => schoolFilter === 'all' || p.schoolId === schoolFilter).length === 0}
            >
              <option value="all">All Periods</option>
              {schoolEnrollmentPeriods
                .filter(p => p.status !== 'archived' && (schoolFilter === 'all' || p.schoolId === schoolFilter))
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {schoolFilter === 'all' ? `${p.schoolName} — ` : ''}{p.name}
                  </option>
                ))
              }
            </select>
          )}
          <select
            value={gradeFilter}
            onChange={e => setGradeFilter(e.target.value)}
            className="flex-1 min-w-0 bg-slate-800/80 border border-slate-700/80 text-white px-2 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-xs transition-all"
          >
            <option value="all">All Grades</option>
            {availableGrades.map(g => <option key={g} value={g}>Grade {g}</option>)}
          </select>
          {currentUser?.role === Role.TEACHER && unreadCount > 0 && (
            <button
              onClick={() => setUnreadOnly(v => !v)}
              className={`px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 shrink-0 ${
                unreadOnly
                  ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'
                  : 'bg-slate-800/80 ring-1 ring-white/10 text-slate-400 hover:text-slate-300 hover:bg-slate-700/80'
              }`}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              Unread Notes ({unreadCount})
            </button>
          )}
        </div>

        {/* Row 3: date range */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-slate-800/80 border border-slate-700/80 text-white px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-all"
          />
          <span className="text-slate-600 text-xs shrink-0">—</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="bg-slate-800/80 border border-slate-700/80 text-white px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-all"
          />
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); }} className="text-xs text-slate-500 hover:text-rose-400 transition-colors">✕ Clear</button>
          )}
        </div>
      </div>

      {/* Pre-table bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">
          {filtered.length} lesson{filtered.length !== 1 ? 's' : ''} found
          {selectedIds.length > 0 && <span className="ml-2 text-primary-400 font-semibold">· {selectedIds.length} selected</span>}
        </p>
        {currentUser?.role === Role.ADMIN && (
          <button
            onClick={() => setShowAddLesson(true)}
            className="bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Lesson
          </button>
        )}
      </div>

      {/* BULK ACTION TOOLBAR */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-900/60 ring-1 ring-primary-500/30 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3.5 flex-wrap">
                <span className="bg-primary-600/20 text-primary-300 ring-1 ring-primary-500/30 px-3 py-1 rounded-full text-xs font-semibold">{selectedIds.length} Selected</span>
                <div className="h-5 w-px bg-slate-700"></div>
                <select
                    onChange={(e) => handleBulkUpdate('status', e.target.value)}
                    className="bg-slate-800/80 border border-slate-700/80 text-white text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-primary-500 outline-none"
                    defaultValue=""
                >
                    <option value="" disabled>Set Status…</option>
                    <option value={LessonStatus.PRESENT}>Present</option>
                    <option value={LessonStatus.ABSENT_EXCUSED}>Absent (Excused)</option>
                    <option value={LessonStatus.ABSENT_UNEXCUSED}>Absent (Unexcused)</option>
                    <option value={LessonStatus.CANCELLED}>Cancelled</option>
                </select>
                <select
                    onChange={(e) => handleBulkUpdate('type', e.target.value)}
                    className="bg-slate-800/80 border border-slate-700/80 text-white text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-primary-500 outline-none"
                    defaultValue=""
                >
                    <option value="" disabled>Set Type…</option>
                    <option value="Individual">Individual</option>
                    <option value="Group">Group</option>
                </select>
            </div>
            <button
                onClick={() => setSelectedIds([])}
                className="text-slate-500 hover:text-white transition-colors text-lg leading-none"
            >×</button>
        </div>
      )}

      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/40 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3.5 text-left"><input type="checkbox" onChange={handleSelectAll} checked={selectedIds.length === filtered.length && filtered.length > 0} className="rounded" /></th>
                <th className="px-4 py-3.5 text-left">ID</th>
                <th className="px-4 py-3.5 text-left">Date</th>
                <th className="px-4 py-3.5 text-left">Time</th>
                <th className="px-4 py-3.5 text-left">Teacher</th>
                <th className="px-4 py-3.5 text-left">Student</th>
                <th className="px-4 py-3.5 text-left">School</th>
                <th className="px-4 py-3.5 text-left">Status</th>
                <th className="px-4 py-3.5 text-left">Type</th>
                <th className="px-4 py-3.5 text-left">Mode</th>
                <th className="px-4 py-3.5 text-left">
                  <button
                    onClick={() => setShowFinancials(v => !v)}
                    className={`flex items-center gap-1.5 uppercase tracking-wider text-[10px] font-medium transition-colors ${showFinancials ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
                    title={showFinancials ? 'Hide financial data' : 'Show financial data'}
                  >
                    Amount
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {showFinancials
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18" />
                      }
                    </svg>
                  </button>
                </th>
                {currentUser?.role === Role.ADMIN && <th className="px-4 py-3.5 text-left">Created</th>}
                <th className="px-4 py-3.5 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(lesson => {
                const l = lesson;
                return (
                  <tr
                    key={l.id}
                    onClick={() => setViewingLesson(lesson)}
                    className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${
                      currentUser?.role === Role.TEACHER && lesson.hasUnreadAdminNote
                        ? 'bg-red-500/[0.03] border-l-2 border-l-red-500/40'
                        : ''
                    }`}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(l.id)} onChange={() => toggleSelect(l.id)} className="rounded" />
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs max-w-[120px]" title={l.id}>
                      <span className="block truncate">{l.id}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{new Date(l.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-slate-400 tabular-nums text-xs">
                      {l.date?.includes('T')
                        ? new Date(l.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                        : <span className="text-slate-600">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {(() => {
                        const path = teacherDetailPath(l.teacherId);
                        return path ? (
                          <button
                            onClick={e => { e.stopPropagation(); navigate(path); }}
                            className="hover:text-primary-400 hover:underline transition-colors text-left"
                          >
                            {l.teacherName}
                          </button>
                        ) : l.teacherName;
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                        {l.studentNames.map((name, i) => {
                          const sid = l.studentIds?.[i];
                          return sid ? (
                            <button
                              key={sid}
                              onClick={e => { e.stopPropagation(); navigate(studentDetailPath(sid)); }}
                              className="text-slate-300 hover:text-primary-400 hover:underline transition-colors text-left"
                            >
                              {name}
                            </button>
                          ) : (
                            <span key={i} className="text-slate-300">{name}</span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{l.schoolName}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT
                          ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20'
                          : l.status === LessonStatus.ABSENT_EXCUSED
                          ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20'
                          : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
                      }`}>
                        {lesson.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{lesson.type}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        getDeliveryMode(lesson) === DeliveryMode.ONLINE
                          ? 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20'
                          : 'bg-slate-700/50 text-slate-400 ring-1 ring-white/5'
                      }`}>
                        {getDeliveryMode(lesson) === DeliveryMode.ONLINE ? 'Online' : 'In-Person'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs tabular-nums">
                      {showFinancials
                        ? (currentUser?.role === Role.TEACHER ? `Earning: ${l.teacherRate}` : `Inv: ${l.schoolRate} | Pay: ${l.teacherRate}`)
                        : <span className="text-slate-700">••••</span>
                      }
                    </td>
                    {currentUser?.role === Role.ADMIN && (
                      <td className="px-4 py-3 text-slate-500 text-xs tabular-nums whitespace-nowrap">
                        {l.createdAt
                          ? new Date(l.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 flex items-center gap-2.5" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setEditingLesson(lesson)} className="text-primary-400 hover:text-primary-300 font-medium text-xs transition-colors">Edit</button>
                      <button onClick={() => generatePDF(lesson)} className="text-amber-400 hover:text-amber-300 font-medium text-xs transition-colors">PDF</button>
                      {currentUser?.role === Role.ADMIN && (
                          <button onClick={() => handleDeleteLesson(lesson)} className="text-red-400 hover:text-red-300 font-medium text-xs transition-colors">Delete</button>
                      )}
                      {(currentUser?.role === Role.TEACHER || currentUser?.role === Role.ADMIN) && lesson.hasUnreadAdminNote && (
                        <span
                          className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse"
                          title="Unread school admin note"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewingLesson && !editingLesson && (
        <ViewLessonModal
          lesson={lessons.find(l => l.id === viewingLesson.id) ?? viewingLesson}
          onClose={() => setViewingLesson(null)}
          onEdit={() => { setEditingLesson(viewingLesson); setViewingLesson(null); }}
        />
      )}

      {editingLesson && (
        <EditLessonModal
          lesson={editingLesson}
          onClose={() => setEditingLesson(null)}
          onSave={handleSaveLesson}
        />
      )}
    </div>
  );
};
