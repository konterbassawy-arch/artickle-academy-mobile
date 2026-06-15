/**
 * StudentReportCore — Phase 19.5A
 *
 * Shared student report component used across ALL roles.
 * Each role page wraps this with role-specific chrome (back button, modals, etc.).
 *
 * Visibility is controlled entirely via the `config` prop.
 * Data masking is handled by AppContext BEFORE this component receives lessons.
 * This component never makes masking decisions — it only renders what it receives.
 *
 * Config constants (ADMIN_REPORT_CONFIG, TEACHER_REPORT_CONFIG, etc.) are
 * exported here for use in each role's wrapper page.
 */

import React, { useMemo, useState } from 'react';
import { Lesson, LessonStatus, Student, DeliveryMode, getDeliveryMode } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportConfig {
  /** Render lesson.notes block (already masked by AppContext for non-teacher roles) */
  showNotes: boolean;
  /** Render schoolAdminComment as "School Teacher Comment" */
  showSchoolComment: boolean;
  /** Render schoolAdminInternalComment (subtle) — admin only */
  showInternalComment: boolean;
  /** Render Phase 13 fields: overallGrade, repertoire, practiceAssignment, examPrepStatus */
  showPhase13Fields: boolean;
  /** Show red unread dot on journey cards — teacher role only */
  showUnreadDot: boolean;
  /** Show email in student header */
  showEmail: boolean;
  /** Show dateOfBirth in student header */
  showDateOfBirth: boolean;
  /** Render the tabular lesson history section */
  showLessonHistoryTable: boolean;
  /** Include Excel option in export dropdown */
  allowExcel: boolean;
  /** Include PDF option in export dropdown */
  allowPdf: boolean;
}

export interface StudentReportCoreProps {
  student: Student;
  /** Pre-filtered to this student, pre-masked by AppContext for caller's role */
  lessons: Lesson[];
  schoolName: string;
  teacherName: string;
  config: ReportConfig;

  // Export callbacks (only fired when corresponding allow* flag is true)
  onExportExcel?: () => void;
  onExportPdf?: () => void;

  /**
   * Slot rendered after the 6-stat grid and before the Learning Journey.
   * Used for AI placeholder cards or other role-specific content.
   */
  renderAfterSummary?: () => React.ReactNode;

  /**
   * Per-row action cell rendered in the lesson history table.
   * Receives the lesson and returns JSX for the Actions column.
   * If omitted, a default "View" button is rendered if onLessonClick is set.
   */
  renderLessonActions?: (lesson: Lesson) => React.ReactNode;

  /**
   * If provided, entirely replaces the built-in lesson history table section.
   * Used by SchoolStudentDetail which needs checkboxes + Edit/PDF per row.
   */
  customTableSection?: React.ReactNode;

  /** Called when a journey card or table row is clicked */
  onLessonClick?: (lesson: Lesson) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-built config constants (import the right one in each role wrapper)
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_REPORT_CONFIG: ReportConfig = {
  showNotes: true,
  showSchoolComment: true,
  showInternalComment: true,
  showPhase13Fields: true,
  showUnreadDot: false,
  showEmail: true,
  showDateOfBirth: true,
  showLessonHistoryTable: true,
  allowExcel: true,
  allowPdf: true,
};

export const TEACHER_REPORT_CONFIG: ReportConfig = {
  showNotes: true,
  showSchoolComment: true,
  showInternalComment: false,
  showPhase13Fields: true,
  showUnreadDot: true,
  showEmail: true,
  showDateOfBirth: false,
  showLessonHistoryTable: true,
  allowExcel: true,
  allowPdf: true,
};

export const SCHOOL_ADMIN_REPORT_CONFIG: ReportConfig = {
  showNotes: false,       // double-gated: also masked to undefined by AppContext
  showSchoolComment: true,
  showInternalComment: false, // shown only in SchoolStudentDetail edit modal, not in journey cards
  showPhase13Fields: true,
  showUnreadDot: false,
  showEmail: true,
  showDateOfBirth: false,
  showLessonHistoryTable: true,
  allowExcel: true,
  allowPdf: true,
};

export const PARENT_REPORT_CONFIG: ReportConfig = {
  showNotes: false,       // double-gated: also masked to undefined by AppContext
  showSchoolComment: true,
  showInternalComment: false, // double-gated: also masked to undefined by AppContext
  showPhase13Fields: true,
  showUnreadDot: false,
  showEmail: false,
  showDateOfBirth: false,
  showLessonHistoryTable: true,
  allowExcel: false,
  allowPdf: true,
};

export const STUDENT_REPORT_CONFIG: ReportConfig = {
  showNotes: false,       // double-gated: also masked to undefined by AppContext
  showSchoolComment: true,
  showInternalComment: false, // double-gated: also masked to undefined by AppContext
  showPhase13Fields: true,
  showUnreadDot: false,
  showEmail: false,
  showDateOfBirth: false,
  showLessonHistoryTable: false,
  allowExcel: false,
  allowPdf: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const statusBadge = (status: string) => {
  const cls =
    status === LessonStatus.PRESENT || status === LessonStatus.TAUGHT
      ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
      : status === LessonStatus.CANCELLED
      ? 'bg-red-500/15 text-red-400 ring-red-500/20'
      : 'bg-amber-500/15 text-amber-400 ring-amber-500/20';
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ring-1 ${cls}`}>
      {status}
    </span>
  );
};

const StarRow = ({ label, value }: { label: string; value: number }) => (
  <div>
    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">{label}</p>
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} className={`text-base leading-none ${n <= value ? 'text-lime-400' : 'text-slate-700'}`}>★</span>
      ))}
    </div>
  </div>
);

const inputCls =
  'bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20';

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export const StudentReportCore: React.FC<StudentReportCoreProps> = ({
  student,
  lessons,
  schoolName,
  teacherName,
  config,
  onExportExcel,
  onExportPdf,
  renderAfterSummary,
  renderLessonActions,
  customTableSection,
  onLessonClick,
}) => {
  // ── Export menu state ──────────────────────────────────────────────────────
  const [showExportMenu, setShowExportMenu] = useState(false);

  // ── Table filter state ─────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // ── Derived lesson sets (performance: all with useMemo) ───────────────────

  const completedLessons = useMemo(
    () => lessons.filter(l => l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT),
    [lessons]
  );

  const activeLessons = useMemo(
    () => lessons.filter(
      l => l.status !== LessonStatus.CANCELLED && l.status !== LessonStatus.ABSENT_EXCUSED
    ),
    [lessons]
  );

  // ── Summary stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalHours = (
      activeLessons.reduce((sum, l) => sum + (l.durationMinutes || 60), 0) / 60
    ).toFixed(1);

    // Exclude cancelled lessons from the denominator — they were never scheduled to happen
    const scheduledLessons = lessons.filter(l => l.status !== LessonStatus.CANCELLED);
    const attendanceRate = scheduledLessons.length > 0
      ? Math.round((completedLessons.length / scheduledLessons.length) * 100)
      : 0;

    const iVals = completedLessons.filter(l => l.interactivity != null).map(l => l.interactivity!);
    const bVals = completedLessons.filter(l => l.behavior != null).map(l => l.behavior!);

    const avgInteractivity = iVals.length
      ? (iVals.reduce((a, b) => a + b, 0) / iVals.length).toFixed(1)
      : '—';
    const avgBehavior = bVals.length
      ? (bVals.reduce((a, b) => a + b, 0) / bVals.length).toFixed(1)
      : '—';

    return { totalHours, attendanceRate, avgInteractivity, avgBehavior };
  }, [lessons, completedLessons, activeLessons]);

  // ── Learning Journey — newest first ───────────────────────────────────────
  const journeyLessons = useMemo(
    () => lessons.slice().sort((a, b) => b.date.localeCompare(a.date)),
    [lessons]
  );

  // ── Lesson history table months ───────────────────────────────────────────
  const months = useMemo(() => {
    const set = new Set<string>();
    lessons.forEach(l => {
      const d = new Date(l.date);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(set).sort().reverse();
  }, [lessons]);

  // ── Filtered lesson history ────────────────────────────────────────────────
  const filteredLessons = useMemo(() => {
    let result = lessons.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (statusFilter !== 'all') result = result.filter(l => l.status === statusFilter);
    if (monthFilter !== 'all') {
      result = result.filter(l => {
        const d = new Date(l.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === monthFilter;
      });
    }
    if (dateFrom) result = result.filter(l => l.date.substring(0, 10) >= dateFrom);
    if (dateTo) result = result.filter(l => l.date.substring(0, 10) <= dateTo);
    return result;
  }, [lessons, statusFilter, monthFilter, dateFrom, dateTo]);

  const showExportDropdown = config.allowExcel || config.allowPdf;

  // ── Export dropdown ────────────────────────────────────────────────────────
  const ExportDropdown = () => (
    <div className="relative">
      <button
        onClick={() => setShowExportMenu(v => !v)}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-slate-800/80 ring-1 ring-white/10 text-slate-300 hover:bg-slate-700/80 hover:text-white transition-all"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export
        <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {showExportMenu && (
        <div className="absolute right-0 top-full mt-1 bg-slate-800 ring-1 ring-white/10 rounded-xl shadow-2xl z-10 min-w-[168px] overflow-hidden">
          {config.allowExcel && onExportExcel && (
            <button
              onClick={() => { onExportExcel(); setShowExportMenu(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700/60 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Excel (.xlsx)
            </button>
          )}
          {config.allowPdf && onExportPdf && (
            <button
              onClick={() => { onExportPdf(); setShowExportMenu(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700/60 transition-colors flex items-center gap-2 ${config.allowExcel ? 'border-t border-slate-700/60' : ''}`}
            >
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              PDF Report
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Student header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xl ring-1 ring-emerald-500/20 shrink-0">
            {student.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">{student.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-400 ring-1 ring-primary-500/20 font-medium">
                {student.instrument}
              </span>
              {schoolName && (
                <span className="text-xs text-slate-400">{schoolName}</span>
              )}
              {teacherName && (
                <span className="text-xs text-slate-500">
                  Taught by <span className="text-slate-300">{teacherName}</span>
                </span>
              )}
              {student.yearGrade && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 ring-1 ring-slate-600/40 font-medium">
                  Grade {student.yearGrade}
                </span>
              )}
              {config.showEmail && student.email && (
                <span className="text-xs text-slate-500">{student.email}</span>
              )}
              {config.showDateOfBirth && student.dateOfBirth && (
                <span className="text-xs text-slate-500">DOB: {student.dateOfBirth}</span>
              )}
            </div>
          </div>
        </div>

        {/* Export dropdown — top-right, near student header */}
        {showExportDropdown && <ExportDropdown />}
      </div>

      {/* ── Summary stats ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-white">Summary</h3>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Total Lessons</p>
            <p className="text-2xl font-bold text-white tabular-nums">{lessons.length}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Completed</p>
            <p className="text-2xl font-bold text-emerald-400 tabular-nums">{completedLessons.length}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Attendance Rate</p>
            <p className="text-2xl font-bold text-blue-400 tabular-nums">{stats.attendanceRate}%</p>
          </div>
          <div className="bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Total Hours</p>
            <p className="text-2xl font-bold text-blue-400 tabular-nums">{stats.totalHours}h</p>
          </div>
          <div className="bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Avg Effort</p>
            <p className="text-2xl font-bold text-emerald-400 tabular-nums">{stats.avgInteractivity}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">out of 5</p>
          </div>
          <div className="bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Avg Practice</p>
            <p className="text-2xl font-bold text-amber-400 tabular-nums">{stats.avgBehavior}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">out of 5</p>
          </div>
        </div>

        {/* Role-specific slot after stats (e.g., AI placeholder cards) */}
        {renderAfterSummary?.()}
      </div>

      {/* ── Student Learning Journey ──────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-white">
          Student Learning Journey
          <span className="text-slate-500 font-normal text-sm ml-2">
            ({journeyLessons.length} lesson{journeyLessons.length !== 1 ? 's' : ''})
          </span>
        </h3>

        {journeyLessons.length === 0 ? (
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-10 text-center">
            <p className="text-slate-500 text-sm">No lessons recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {journeyLessons.map(lesson => {
              const isCompleted =
                lesson.status === LessonStatus.PRESENT || lesson.status === LessonStatus.TAUGHT;
              const isUnread = config.showUnreadDot && lesson.hasUnreadAdminNote === true;

              return (
                <div
                  key={lesson.id}
                  onClick={() => onLessonClick?.(lesson)}
                  className={`bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-xl p-4 ${
                    onLessonClick ? 'cursor-pointer hover:bg-white/[0.07] transition-colors' : ''
                  } ${isUnread ? 'border-l-2 border-l-red-500/40 bg-red-500/[0.03]' : ''}`}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">
                          {new Date(lesson.date).toLocaleDateString('en-US', {
                            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                          })}
                        </p>
                        {isUnread && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 ring-1 ring-red-500/20 font-medium">
                            <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse inline-block" />
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {lesson.teacherName}
                        {' · '}
                        {lesson.type || 'Individual'}
                        {' · '}
                        {getDeliveryMode(lesson) === DeliveryMode.ONLINE ? 'Online' : 'In-Person'}
                        {' · '}
                        {lesson.durationMinutes}min
                      </p>
                    </div>
                    {statusBadge(lesson.status)}
                  </div>

                  {/* Learning */}
                  {lesson.learning && (
                    <div className="mb-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-0.5">Learning</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{lesson.learning}</p>
                    </div>
                  )}

                  {/* Teacher Notes — only if config allows AND data exists (double-gated) */}
                  {config.showNotes && lesson.notes && (
                    <div className="mb-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-0.5">Teacher Notes</p>
                      <p className="text-sm text-slate-400 leading-relaxed">{lesson.notes}</p>
                    </div>
                  )}

                  {/* Star ratings */}
                  {isCompleted && (lesson.interactivity || lesson.behavior) && (
                    <div className="flex flex-wrap gap-5 mb-3">
                      {lesson.interactivity != null && (
                        <StarRow label="Effort" value={lesson.interactivity} />
                      )}
                      {lesson.behavior != null && (
                        <StarRow label="Practice" value={lesson.behavior} />
                      )}
                    </div>
                  )}

                  {/* Phase 13 fields */}
                  {config.showPhase13Fields && (
                    lesson.overallGrade || lesson.repertoire || lesson.practiceAssignment || lesson.examPrepStatus
                  ) && (
                    <div className="mb-3">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {lesson.overallGrade && (
                          <span className="text-xs text-slate-500">
                            Grade: <span className="text-white font-medium">{lesson.overallGrade}</span>
                          </span>
                        )}
                        {lesson.repertoire && (
                          <span className="text-xs text-slate-500">
                            Repertoire: <span className="text-white font-medium">{lesson.repertoire}</span>
                          </span>
                        )}
                        {lesson.examPrepStatus && (
                          <span className="text-xs text-slate-500">
                            Exam: <span className="text-white font-medium">{lesson.examPrepStatus}</span>
                          </span>
                        )}
                      </div>
                      {lesson.practiceAssignment && (
                        <div className="mt-2">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Practice Assignment</p>
                          <p className="text-sm text-slate-300">{lesson.practiceAssignment}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* School Teacher Comment — only if config allows AND data exists */}
                  {config.showSchoolComment && lesson.schoolAdminComment && (
                    <div className="mt-1 p-3 bg-slate-800/40 rounded-lg">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-0.5">
                        School Teacher Comment
                      </p>
                      <p className="text-sm text-slate-300 leading-relaxed">{lesson.schoolAdminComment}</p>
                    </div>
                  )}

                  {/* Internal comment — admin only; double-gated by config + data */}
                  {config.showInternalComment && lesson.schoolAdminInternalComment && (
                    <div className="mt-2 p-2.5 bg-slate-900/60 border border-slate-700/40 rounded-lg">
                      <p className="text-[9px] text-slate-600 uppercase tracking-wider font-medium mb-0.5">
                        Internal (School Admin)
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed italic">
                        {lesson.schoolAdminInternalComment}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Lesson History Table ──────────────────────────────────────────── */}
      {config.showLessonHistoryTable && (
        customTableSection ?? (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <h3 className="text-base font-semibold text-white">
                Lesson History
                <span className="text-slate-500 font-normal text-sm ml-2">
                  ({filteredLessons.length} lesson{filteredLessons.length !== 1 ? 's' : ''})
                </span>
              </h3>
            </div>

            {/* Filters row 1 */}
            <div className="flex flex-wrap gap-2 mb-2">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputCls}>
                <option value="all">All Statuses</option>
                <option value={LessonStatus.PRESENT}>Present</option>
                <option value={LessonStatus.TAUGHT}>Taught</option>
                <option value={LessonStatus.ABSENT_EXCUSED}>Absent (Excused)</option>
                <option value={LessonStatus.ABSENT_UNEXCUSED}>Absent (Unexcused)</option>
                <option value={LessonStatus.CANCELLED}>Cancelled</option>
              </select>
              <select
                value={monthFilter}
                onChange={e => { setMonthFilter(e.target.value); setDateFrom(''); setDateTo(''); }}
                className={inputCls}
              >
                <option value="all">All Months</option>
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Filters row 2: date range */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs text-slate-500 font-medium shrink-0">Date range:</span>
              <input
                type="date" value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setMonthFilter('all'); }}
                className={`${inputCls} w-40`}
              />
              <span className="text-xs text-slate-600">—</span>
              <input
                type="date" value={dateTo}
                onChange={e => { setDateTo(e.target.value); setMonthFilter('all'); }}
                className={`${inputCls} w-40`}
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {filteredLessons.length === 0 ? (
              <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-10 text-center">
                <p className="text-slate-500 text-sm">No lessons match this filter.</p>
              </div>
            ) : (
              <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Date</th>
                        <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Teacher</th>
                        <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Type</th>
                        <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Mode</th>
                        <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Status</th>
                        <th className="text-right px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Duration</th>
                        {(renderLessonActions || onLessonClick) && (
                          <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredLessons.map(lesson => (
                        <tr
                          key={lesson.id}
                          onClick={() => onLessonClick?.(lesson)}
                          className={`transition-colors ${onLessonClick ? 'hover:bg-slate-800/40 cursor-pointer' : ''}`}
                        >
                          <td className="px-4 py-3 text-sm text-white tabular-nums">
                            {new Date(lesson.date).toLocaleDateString('en-US', {
                              year: 'numeric', month: 'short', day: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">{lesson.teacherName}</td>
                          <td className="px-4 py-3 text-sm text-slate-400">{lesson.type}</td>
                          <td className="px-4 py-3">
                            {getDeliveryMode(lesson) === DeliveryMode.ONLINE
                              ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20 font-medium">Online</span>
                              : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400 ring-1 ring-slate-600/20 font-medium">In-Person</span>
                            }
                          </td>
                          <td className="px-4 py-3">{statusBadge(lesson.status)}</td>
                          <td className="px-4 py-3 text-sm text-white text-right tabular-nums">{lesson.durationMinutes}min</td>
                          {(renderLessonActions || onLessonClick) && (
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              {renderLessonActions ? renderLessonActions(lesson) : (
                                onLessonClick && (
                                  <button
                                    onClick={() => onLessonClick(lesson)}
                                    className="text-primary-400 hover:text-primary-300 font-medium text-xs transition-colors"
                                  >
                                    View
                                  </button>
                                )
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};
