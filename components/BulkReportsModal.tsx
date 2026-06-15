/**
 * BulkReportsModal — Phase Bulk.2
 *
 * Right-side drawer for bulk report generation and export.
 *  - Report-type selection (Progress Review / Term Report / both)
 *  - Two-panel layout: student picker + action panel
 *  - Generate tab: per-student progress rows with live status
 *  - Export tab: coverage table, type filter, zip/merged choice
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Student, Lesson, Enrollment, SchoolEnrollmentPeriod } from '../types';
import { ReportType, SavedAIReport } from '../services/aiSummary/reportTypes';
import { fetchSavedReports } from '../services/aiSummary/savedReports';
import { getRelevantPeriodsForStudent } from '../services/schoolPeriodProgress';
import {
  bulkGenerateAndSave,
  bulkExportReports,
  BulkJobEntry,
  BulkStudentEntry,
  BulkExportEntry,
} from '../services/bulkReportService';

type PeriodScope = 'current' | 'previous' | 'all';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface BulkReportsModalProps {
  onClose: () => void;
  /** 'full' = admin/teacher (generate + export). 'export-only' = school admin (export tab only). */
  mode?: 'full' | 'export-only';
  students: (Student & { teacherName?: string; schoolName?: string })[];
  lessons: Lesson[];
  enrollments: Enrollment[];
  schoolEnrollmentPeriods: SchoolEnrollmentPeriod[];
  schools: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  currentUserId: string;
  currentUserName: string;
}

type Tab = 'generate' | 'export';

// ─────────────────────────────────────────────────────────────────────────────
// Small reusable pieces
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_OPTIONS: { type: ReportType; label: string; sub: string }[] = [
  { type: 'polish_report', label: 'Progress Review', sub: 'AI-polished learning journey + teacher summary' },
  { type: 'term_report',   label: 'Term Report',             sub: 'Structured academic sections (Technical, Practical…)' },
];

function ReportTypeToggle({
  type, label, sub, checked, onChange, disabled,
}: {
  type: ReportType; label: string; sub: string;
  checked: boolean; onChange: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border transition-all ${
        checked
          ? 'bg-primary-500/10 border-primary-500/40 ring-1 ring-primary-500/20'
          : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
        checked ? 'bg-primary-500 border-primary-500' : 'border-slate-600'
      }`}>
        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>}
      </span>
      <div>
        <p className={`text-sm font-medium leading-tight ${checked ? 'text-white' : 'text-slate-400'}`}>{label}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
      </div>
    </button>
  );
}

function JobRow({ job, wantPolish, wantTerm }: { job: BulkJobEntry; wantPolish: boolean; wantTerm: boolean }) {
  const icon =
    job.status === 'done'       ? <span className="text-emerald-400 text-base leading-none">✓</span> :
    job.status === 'skipped'    ? <span className="text-slate-500 text-base leading-none">–</span> :
    job.status === 'error'      ? <span className="text-red-400 text-base leading-none">✕</span> :
    job.status === 'generating' ? <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" /> :
                                  <span className="inline-block w-3 h-3 rounded-full bg-slate-700" />;

  const sub =
    job.status === 'skipped'    ? <span className="text-slate-600">{job.skipReason ?? 'Skipped'}</span> :
    job.status === 'error'      ? <span className="text-red-400">{job.error ?? 'Unknown error'}</span> :
    job.status === 'generating' ? (
      <span className="text-amber-400/80">
        {wantPolish && !job.polishDone ? 'Progress Review…' :
         wantTerm   && !job.termDone  ? 'Term Report…' : 'Saving…'}
      </span>
    ) :
    job.status === 'done' ? (
      <span className="text-slate-500">
        {[wantPolish && 'Progress Review', wantTerm && 'Term Report'].filter(Boolean).join(' + ')} saved
      </span>
    ) : <span className="text-slate-600">Queued</span>;

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
      job.status === 'done'       ? 'bg-emerald-950/30 border-emerald-900/40' :
      job.status === 'skipped'    ? 'bg-slate-800/20 border-slate-800/60 opacity-60' :
      job.status === 'error'      ? 'bg-red-950/30 border-red-900/40' :
      job.status === 'generating' ? 'bg-amber-950/20 border-amber-900/30' :
                                    'bg-slate-800/30 border-slate-800'
    }`}>
      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${job.status === 'skipped' ? 'text-slate-500' : 'text-white'}`}>{job.studentName}</p>
        <p className="text-[10px] mt-0.5">{sub}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {job.periodName && job.status !== 'skipped' && (
          <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded truncate max-w-[100px]">{job.periodName}</span>
        )}
        {wantPolish && wantTerm && job.status === 'generating' && (
          <div className="flex gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${job.polishDone ? 'bg-emerald-400' : 'bg-slate-700'}`} />
            <span className={`w-1.5 h-1.5 rounded-full ${job.termDone   ? 'bg-emerald-400' : 'bg-slate-700'}`} />
          </div>
        )}
      </div>
    </div>
  );
}

function CoverageRow({
  student, polish, term, wantPolish, wantTerm,
}: {
  student: Student & { schoolName?: string };
  polish?: SavedAIReport; term?: SavedAIReport;
  wantPolish: boolean; wantTerm: boolean;
}) {
  const ready = (!wantPolish || !!polish) && (!wantTerm || !!term);
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
      ready ? 'bg-slate-800/30 border-slate-800' : 'bg-amber-950/20 border-amber-900/30'
    }`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{student.name}</p>
        <p className="text-[10px] text-slate-500 truncate">{student.instrument} · {student.schoolName ?? '—'}</p>
      </div>
      {wantPolish && (
        <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${
          polish ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-800 text-slate-600'
        }`}>
          {polish ? 'Progress ✓' : 'Progress —'}
        </span>
      )}
      {wantTerm && (
        <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${
          term ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-800 text-slate-600'
        }`}>
          {term ? 'Term ✓' : 'Term —'}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export const BulkReportsModal: React.FC<BulkReportsModalProps> = ({
  onClose, mode = 'full', students, lessons, enrollments, schoolEnrollmentPeriods,
  schools, teachers, currentUserId, currentUserName,
}) => {
  const isExportOnly = mode === 'export-only';
  const [tab, setTab] = useState<Tab>(isExportOnly ? 'export' : 'generate');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<Set<string>>(new Set());

  // Report type selection (shared between tabs)
  const [wantPolish, setWantPolish] = useState(true);
  const [wantTerm,   setWantTerm]   = useState(true);

  // Period scope
  const [periodScope, setPeriodScope] = useState<PeriodScope>('current');

  // Generate state
  const [genMode,        setGenMode]        = useState<'all' | 'missing'>('all');
  const [genJobs,        setGenJobs]        = useState<BulkJobEntry[]>([]);
  const [genRunning,     setGenRunning]     = useState(false);
  const [genPrechecking, setGenPrechecking] = useState(false);
  const [genDone,        setGenDone]        = useState(false);

  // Export state
  const [exportMode,     setExportMode]     = useState<'zip' | 'merged'>('zip');
  const [exportRunning,  setExportRunning]  = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);
  const [coverage,       setCoverage]       = useState<Map<string, { polish?: SavedAIReport; term?: SavedAIReport }> | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);

  // ── Student list ──────────────────────────────────────────────────────────

  const visible = useMemo(() => {
    let r = students;
    if (schoolFilter !== 'all') r = r.filter(s => s.schoolId === schoolFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.instrument ?? '').toLowerCase().includes(q) ||
        (s.teacherName ?? '').toLowerCase().includes(q) ||
        (s.schoolName  ?? '').toLowerCase().includes(q),
      );
    }
    return r;
  }, [students, schoolFilter, search]);

  const visibleIds = visible.map(s => s.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const someChecked = visibleIds.some(id => selected.has(id)) && !allChecked;

  const toggleAll = () => {
    setSelected(prev => {
      const n = new Set(prev);
      allChecked ? visibleIds.forEach(id => n.delete(id)) : visibleIds.forEach(id => n.add(id));
      return n;
    });
  };
  const toggleOne = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const selectedStudents = useMemo(() => students.filter(s => selected.has(s.id)), [students, selected]);

  // Reset coverage when selection or type changes
  useEffect(() => { setCoverage(null); }, [selected, wantPolish, wantTerm]);

  // In export-only mode, auto-load coverage whenever selection changes
  useEffect(() => {
    if (isExportOnly && selected.size > 0) loadCoverage();
  }, [isExportOnly, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Period resolution per student ─────────────────────────────────────────

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const resolvePeriod = useCallback((student: Student, studentLessons: Lesson[]) => {
    if (periodScope === 'all') return { lessons: studentLessons };
    const periods = getRelevantPeriodsForStudent(student, schoolEnrollmentPeriods, studentLessons, today, enrollments);
    const match = periodScope === 'current'
      ? periods.find(p => p.isCurrent)
      : periods.find(p => p.isPast);
    if (!match) return { lessons: studentLessons };
    const filtered = studentLessons.filter(l => l.date >= match.period.startDate && l.date <= match.period.endDate);
    return {
      lessons: filtered,
      periodName:  match.period.name,
      periodStart: match.period.startDate,
      periodEnd:   match.period.endDate,
    };
  }, [periodScope, schoolEnrollmentPeriods, enrollments, today]);

  // ── Generate ──────────────────────────────────────────────────────────────

  const reportTypes = useMemo<ReportType[]>(() => [
    ...(wantPolish ? ['polish_report' as ReportType] : []),
    ...(wantTerm   ? ['term_report'   as ReportType] : []),
  ], [wantPolish, wantTerm]);

  const buildEntry = useCallback((student: Student & { teacherName?: string; schoolName?: string }): BulkStudentEntry => {
    const allStudentLessons = lessons.filter(l => l.studentIds?.includes(student.id));
    const { lessons: periodLessons, periodName, periodStart, periodEnd } = resolvePeriod(student, allStudentLessons);
    return {
      student,
      lessons: periodLessons,
      enrollments,
      schoolEnrollmentPeriods,
      schoolName:  schools.find(sc => sc.id === student.schoolId)?.name ?? '',
      teacherName: teachers.find(t => t.id === student.teacherId)?.name ?? student.teacherName ?? '',
      schoolId:    student.schoolId ?? '',
      teacherIds:  (student as any).currentTeacherIds ?? (student.teacherId ? [student.teacherId] : []),
      generatedBy: currentUserId,
      generatedByName: currentUserName,
      periodName,
      periodStart,
      periodEnd,
    };
  }, [lessons, enrollments, schoolEnrollmentPeriods, schools, teachers, currentUserId, currentUserName, resolvePeriod]);

  const runGenerate = useCallback(async () => {
    if (!selectedStudents.length || genRunning || genPrechecking || !reportTypes.length) return;
    setGenRunning(true);
    setGenDone(false);
    setGenJobs([]);

    let entriesToGenerate: BulkStudentEntry[];
    let initialJobs: BulkJobEntry[];

    if (genMode === 'missing') {
      setGenPrechecking(true);
      setGenRunning(false);
      const precheck = new Map<string, { polish?: SavedAIReport; term?: SavedAIReport }>();
      for (const s of selectedStudents) {
        const all = await fetchSavedReports(s.id);
        precheck.set(s.id, {
          polish: all.find(r => r.reportType === 'polish_report'),
          term:   all.find(r => r.reportType === 'term_report'),
        });
      }
      setGenPrechecking(false);
      setGenRunning(true);

      initialJobs = selectedStudents.map(s => {
        const cov = precheck.get(s.id) ?? {};
        const missingPolish = wantPolish && !cov.polish;
        const missingTerm   = wantTerm   && !cov.term;
        const needsGen = missingPolish || missingTerm;
        const skipReason = needsGen ? undefined :
          wantPolish && wantTerm ? 'Both reports already saved' :
          wantPolish ? 'Progress Review already saved' : 'Term Report already saved';
        return {
          studentId: s.id,
          studentName: s.name,
          status: needsGen ? 'pending' : 'skipped',
          polishDone: false,
          termDone: false,
          skipReason,
        } satisfies BulkJobEntry;
      });
      setGenJobs([...initialJobs]);

      entriesToGenerate = selectedStudents
        .filter(s => {
          const cov = precheck.get(s.id) ?? {};
          return (wantPolish && !cov.polish) || (wantTerm && !cov.term);
        })
        .map(buildEntry);
    } else {
      initialJobs = selectedStudents.map(s => ({
        studentId: s.id, studentName: s.name,
        status: 'pending', polishDone: false, termDone: false,
      }));
      setGenJobs([...initialJobs]);
      entriesToGenerate = selectedStudents.map(buildEntry);
    }

    await bulkGenerateAndSave(entriesToGenerate, reportTypes, serviceJobs => {
      setGenJobs(prev => prev.map(j => {
        const updated = serviceJobs.find(sj => sj.studentId === j.studentId);
        return updated ?? j;
      }));
    });

    setGenRunning(false);
    setGenDone(true);
  }, [selectedStudents, genMode, wantPolish, wantTerm, reportTypes, genRunning, genPrechecking, buildEntry]);

  // ── Coverage (export tab) ─────────────────────────────────────────────────

  const loadCoverage = useCallback(async () => {
    if (!selectedStudents.length) return;
    setCoverageLoading(true);
    const map = new Map<string, { polish?: SavedAIReport; term?: SavedAIReport }>();
    for (const s of selectedStudents) {
      const all = await fetchSavedReports(s.id);
      map.set(s.id, {
        polish: all.find(r => r.reportType === 'polish_report'),
        term:   all.find(r => r.reportType === 'term_report'),
      });
    }
    setCoverage(map);
    setCoverageLoading(false);
  }, [selectedStudents]);

  const coverageStats = useMemo(() => {
    if (!coverage) return null;
    let ready = 0, partial = 0, missing = 0;
    for (const [, cov] of coverage) {
      const hasPolish = !wantPolish || !!cov.polish;
      const hasTerm   = !wantTerm   || !!cov.term;
      if (hasPolish && hasTerm) ready++;
      else if (hasPolish || hasTerm) partial++;
      else missing++;
    }
    return { ready, partial, missing };
  }, [coverage, wantPolish, wantTerm]);

  // ── Export ────────────────────────────────────────────────────────────────

  const runExport = useCallback(async () => {
    if (!coverage || exportRunning) return;
    setExportRunning(true);
    setExportProgress({ done: 0, total: 0 });

    const entries: BulkExportEntry[] = selectedStudents.map(student => {
      const cov = coverage.get(student.id) ?? {};
      const allStudentLessons = lessons.filter(l => l.studentIds?.includes(student.id));
      const { lessons: periodLessons } = resolvePeriod(student, allStudentLessons);
      return {
        student,
        lessons: periodLessons,
        schoolName:  schools.find(sc => sc.id === student.schoolId)?.name ?? '',
        teacherName: teachers.find(t => t.id === student.teacherId)?.name ?? student.teacherName ?? '',
        polishReport: wantPolish ? cov.polish : undefined,
        termReport:   wantTerm   ? cov.term   : undefined,
      };
    });

    await bulkExportReports(entries, exportMode, (done, total) => setExportProgress({ done, total }));
    setExportRunning(false);
    setExportProgress(null);
  }, [coverage, selectedStudents, lessons, schools, teachers, wantPolish, wantTerm, exportMode, exportRunning]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeJobs  = genJobs.filter(j => j.status !== 'skipped');
  const skippedCount = genJobs.filter(j => j.status === 'skipped').length;
  const doneCount   = activeJobs.filter(j => j.status === 'done').length;
  const errCount    = activeJobs.filter(j => j.status === 'error').length;
  const pct         = activeJobs.length > 0 ? (doneCount / activeJobs.length) * 100 : 0;
  const noTypes     = !wantPolish && !wantTerm;

  const generateLabel = () => {
    const who = `${selected.size} student${selected.size !== 1 ? 's' : ''}`;
    if (wantPolish && wantTerm) return `Generate both reports for ${who}`;
    if (wantPolish) return `Generate Progress Review for ${who}`;
    if (wantTerm)   return `Generate Term Report for ${who}`;
    return 'Select at least one report type';
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render — right-side drawer
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer panel */}
      <div className="w-full max-w-4xl bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-500/15 border border-primary-500/25 flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white leading-tight">Bulk Reports</h2>
              <p className="text-[11px] text-slate-500">
                {isExportOnly
                  ? 'Export saved AI reports for your school\'s students'
                  : 'Generate and export AI reports for multiple students'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 transition-all text-lg leading-none">×</button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── Left panel: student picker ── */}
          <div className="w-64 flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/50">
            {/* Search + filter */}
            <div className="p-3 space-y-2 border-b border-slate-800 flex-shrink-0">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-primary-500/40"
                />
              </div>
              {schools.length > 1 && (
                <select
                  value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-primary-500/40"
                >
                  <option value="all">All schools</option>
                  {schools.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                </select>
              )}
            </div>

            {/* Select-all row */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 flex-shrink-0">
              <input
                type="checkbox" id="sel-all"
                checked={allChecked}
                ref={el => { if (el) el.indeterminate = someChecked; }}
                onChange={toggleAll}
                className="accent-primary-500 w-3.5 h-3.5 cursor-pointer"
              />
              <label htmlFor="sel-all" className="text-[11px] text-slate-400 cursor-pointer select-none flex-1">
                {selected.size > 0 ? <span><span className="text-primary-400 font-medium">{selected.size}</span> selected</span> : 'Select all'}
              </label>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">Clear</button>
              )}
            </div>

            {/* Student list */}
            <div className="overflow-y-auto flex-1 py-1">
              {visible.length === 0 ? (
                <p className="text-[11px] text-slate-600 text-center py-8">No students match</p>
              ) : visible.map(s => (
                <label key={s.id} className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer group transition-colors ${selected.has(s.id) ? 'bg-primary-500/5' : 'hover:bg-slate-800/50'}`}>
                  <input
                    type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)}
                    className="accent-primary-500 w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-medium truncate transition-colors ${selected.has(s.id) ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>{s.name}</p>
                    <p className="text-[10px] text-slate-600 truncate">{s.instrument}{s.schoolName ? ` · ${s.schoolName}` : ''}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Footer count */}
            <div className="px-3 py-2 border-t border-slate-800 flex-shrink-0">
              <p className="text-[10px] text-slate-600">{visible.length} student{visible.length !== 1 ? 's' : ''} shown</p>
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">

            {/* Settings bar: report types + period scope — hidden in export-only mode */}
            <div className={`px-5 pt-4 pb-3 border-b border-slate-800 flex-shrink-0 space-y-3 ${isExportOnly ? 'hidden' : ''}`}>
              {/* Report types */}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Report types</p>
                <div className="grid grid-cols-2 gap-2">
                  {REPORT_OPTIONS.map(opt => (
                    <ReportTypeToggle
                      key={opt.type}
                      type={opt.type} label={opt.label} sub={opt.sub}
                      checked={opt.type === 'polish_report' ? wantPolish : wantTerm}
                      onChange={() => opt.type === 'polish_report' ? setWantPolish(v => !v) : setWantTerm(v => !v)}
                      disabled={genRunning}
                    />
                  ))}
                </div>
                {noTypes && <p className="text-[11px] text-amber-400 mt-1.5">Select at least one report type.</p>}
              </div>

              {/* Period scope */}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Lesson period</p>
                <div className="flex gap-1.5">
                  {([
                    { scope: 'current'  as PeriodScope, label: 'Current period' },
                    { scope: 'previous' as PeriodScope, label: 'Previous period' },
                    { scope: 'all'      as PeriodScope, label: 'All lessons' },
                  ]).map(({ scope, label }) => (
                    <button
                      key={scope}
                      onClick={() => { setPeriodScope(scope); setCoverage(null); }}
                      disabled={genRunning}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 ${
                        periodScope === scope
                          ? 'bg-slate-700 border-slate-500 text-white'
                          : 'bg-slate-800/40 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-600 mt-1.5">
                  {periodScope === 'current'  && 'Lessons from each student\'s active enrollment period.'}
                  {periodScope === 'previous' && 'Lessons from each student\'s most recent completed period.'}
                  {periodScope === 'all'      && 'All lessons regardless of period (full history).'}
                </p>
              </div>
            </div>

            {/* Tabs — hidden in export-only mode */}
            {!isExportOnly && (
              <div className="flex gap-1 px-5 pt-3 flex-shrink-0">
                {(['generate', 'export'] as Tab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      setTab(t);
                      if (t === 'export' && !coverage && !coverageLoading) loadCoverage();
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      tab === t
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    {t === 'generate' ? '1 · Generate & Save' : '2 · Export PDFs'}
                  </button>
                ))}
              </div>
            )}

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">

              {/* ──────────── GENERATE TAB ──────────── */}
              {tab === 'generate' && (
                <>
                  {selected.size === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center mb-3">
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                      </div>
                      <p className="text-sm text-slate-400 font-medium">No students selected</p>
                      <p className="text-[11px] text-slate-600 mt-1">Pick students from the left panel</p>
                    </div>
                  ) : (
                    <>
                      {/* Generate mode toggle */}
                      {!genRunning && !genPrechecking && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Generate mode</p>
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              { mode: 'all' as const,
                                label: 'Generate for all',
                                sub: 'Always calls AI — adds a new draft alongside any existing report' },
                              { mode: 'missing' as const,
                                label: 'Fill in missing only',
                                sub: 'Checks first — skips students who already have the selected report type(s)' },
                            ]).map(({ mode, label, sub }) => (
                              <button
                                key={mode}
                                onClick={() => setGenMode(mode)}
                                className={`text-left px-3.5 py-3 rounded-xl border transition-all ${
                                  genMode === mode
                                    ? 'bg-primary-500/10 border-primary-500/40 ring-1 ring-primary-500/20'
                                    : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                                    genMode === mode ? 'border-primary-500 bg-primary-500' : 'border-slate-600'
                                  }`}>
                                    {genMode === mode && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </span>
                                  <p className={`text-xs font-semibold ${genMode === mode ? 'text-white' : 'text-slate-400'}`}>{label}</p>
                                </div>
                                <p className="text-[10px] text-slate-500 leading-relaxed pl-5">{sub}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pre-checking indicator */}
                      {genPrechecking && (
                        <div className="flex items-center gap-2.5 py-2">
                          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin flex-shrink-0" />
                          <p className="text-xs text-slate-400">Checking existing reports for {selected.size} student{selected.size !== 1 ? 's' : ''}…</p>
                        </div>
                      )}

                      {/* Action button */}
                      {!genRunning && !genPrechecking && (
                        <button
                          onClick={runGenerate}
                          disabled={noTypes}
                          className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
                            noTypes
                              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                              : genDone
                                ? 'bg-slate-700 border border-slate-600 text-slate-200 hover:bg-slate-600'
                                : 'bg-primary-500 text-white hover:bg-primary-400 shadow-lg shadow-primary-500/10'
                          }`}
                        >
                          {genDone
                            ? `Run again for ${selected.size} student${selected.size !== 1 ? 's' : ''}`
                            : genMode === 'missing'
                              ? `Check & fill missing — ${selected.size} student${selected.size !== 1 ? 's' : ''}`
                              : generateLabel()}
                        </button>
                      )}

                      {/* Progress */}
                      {genJobs.length > 0 && (
                        <div className="space-y-3">
                          {/* Bar + counts */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400 flex items-center gap-2">
                                <span>
                                  <span className="text-white font-medium">{doneCount}</span>
                                  {' / '}{activeJobs.length} generated
                                </span>
                                {skippedCount > 0 && (
                                  <span className="text-slate-600">· {skippedCount} skipped</span>
                                )}
                                {errCount > 0 && (
                                  <span className="text-red-400">· {errCount} error{errCount !== 1 ? 's' : ''}</span>
                                )}
                              </span>
                              {genRunning && <span className="text-amber-400 animate-pulse">Running…</span>}
                              {genDone    && <span className="text-emerald-400">Complete</span>}
                            </div>
                            {activeJobs.length > 0 && (
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${errCount > 0 && doneCount === activeJobs.length ? 'bg-amber-400' : 'bg-primary-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>

                          {/* Per-student rows — active first, then skipped */}
                          <div className="space-y-1.5">
                            {[...genJobs].sort((a, b) =>
                              a.status === 'skipped' && b.status !== 'skipped' ? 1 :
                              a.status !== 'skipped' && b.status === 'skipped' ? -1 : 0
                            ).map(job => (
                              <JobRow key={job.studentId} job={job} wantPolish={wantPolish} wantTerm={wantTerm} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Go to export */}
                      {genDone && (
                        <button
                          onClick={() => { setTab('export'); loadCoverage(); }}
                          className="w-full py-2.5 rounded-xl bg-primary-500 text-white font-semibold text-sm hover:bg-primary-400 transition-all shadow-lg shadow-primary-500/10"
                        >
                          Continue to Export →
                        </button>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ──────────── EXPORT TAB ──────────── */}
              {tab === 'export' && (
                <>
                  {/* Report type selector — shown inline for export-only mode */}
                  {isExportOnly && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Report types to export</p>
                      <div className="grid grid-cols-2 gap-2">
                        {REPORT_OPTIONS.map(opt => (
                          <ReportTypeToggle
                            key={opt.type}
                            type={opt.type} label={opt.label} sub={opt.sub}
                            checked={opt.type === 'polish_report' ? wantPolish : wantTerm}
                            onChange={() => {
                              if (opt.type === 'polish_report') setWantPolish(v => !v);
                              else setWantTerm(v => !v);
                              setCoverage(null);
                            }}
                          />
                        ))}
                      </div>
                      {noTypes && <p className="text-[11px] text-amber-400">Select at least one report type.</p>}
                    </div>
                  )}

                  {selected.size === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <p className="text-sm text-slate-400 font-medium">No students selected</p>
                      <p className="text-[11px] text-slate-600 mt-1">Pick students from the left panel</p>
                    </div>
                  ) : (
                    <>
                      {/* Coverage check */}
                      {coverageLoading && (
                        <div className="flex items-center gap-2 py-3">
                          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin flex-shrink-0" />
                          <p className="text-xs text-slate-400">Checking saved reports for {selectedStudents.length} student{selectedStudents.length !== 1 ? 's' : ''}…</p>
                        </div>
                      )}

                      {!coverage && !coverageLoading && (
                        <button
                          onClick={loadCoverage}
                          className="w-full py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-primary-500/40 hover:text-white transition-all"
                        >
                          Check saved reports
                        </button>
                      )}

                      {coverage && coverageStats && (
                        <>
                          {/* Stats row */}
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: 'Ready to export', value: coverageStats.ready,   color: 'text-emerald-400', bg: 'bg-emerald-950/40 border-emerald-900/40' },
                              { label: 'Partial reports', value: coverageStats.partial,  color: 'text-amber-400',   bg: 'bg-amber-950/30 border-amber-900/30' },
                              { label: 'No reports yet', value: coverageStats.missing,  color: 'text-slate-500',   bg: 'bg-slate-800/40 border-slate-800' },
                            ].map(({ label, value, color, bg }) => (
                              <div key={label} className={`rounded-xl border px-3 py-2.5 text-center ${bg}`}>
                                <p className={`text-xl font-bold ${color}`}>{value}</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                              </div>
                            ))}
                          </div>

                          {/* Per-student coverage */}
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {selectedStudents.map(s => {
                              const cov = coverage.get(s.id) ?? {};
                              return (
                                <CoverageRow
                                  key={s.id}
                                  student={s} polish={cov.polish} term={cov.term}
                                  wantPolish={wantPolish} wantTerm={wantTerm}
                                />
                              );
                            })}
                          </div>

                          {/* Refresh coverage */}
                          <button
                            onClick={loadCoverage}
                            className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
                          >
                            Refresh coverage
                          </button>

                          {/* Export format */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Download format</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { mode: 'zip' as const, label: 'Zip archive', sub: 'Separate PDF per student per type' },
                                { mode: 'merged' as const, label: 'Single PDF', sub: 'All reports in one long file' },
                              ].map(({ mode, label, sub }) => (
                                <button
                                  key={mode}
                                  onClick={() => setExportMode(mode)}
                                  className={`text-left px-3.5 py-3 rounded-xl border transition-all ${
                                    exportMode === mode
                                      ? 'bg-slate-700/80 border-slate-500 ring-1 ring-slate-500/30'
                                      : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'
                                  }`}
                                >
                                  <p className={`text-sm font-medium ${exportMode === mode ? 'text-white' : 'text-slate-400'}`}>{label}</p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Export progress */}
                          {exportRunning && exportProgress && exportProgress.total > 0 && (
                            <div className="space-y-1.5">
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary-500 rounded-full transition-all duration-300"
                                  style={{ width: `${(exportProgress.done / exportProgress.total) * 100}%` }}
                                />
                              </div>
                              <p className="text-[11px] text-slate-500 text-center">
                                Rendering PDF {exportProgress.done} of {exportProgress.total}…
                              </p>
                            </div>
                          )}

                          {/* Export button */}
                          <button
                            onClick={runExport}
                            disabled={exportRunning || noTypes || coverageStats.ready === 0}
                            className="w-full py-2.5 rounded-xl bg-primary-500 text-white font-semibold text-sm hover:bg-primary-400 transition-all shadow-lg shadow-primary-500/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                          >
                            {exportRunning
                              ? 'Exporting…'
                              : `Download ${exportMode === 'zip' ? 'Zip' : 'PDF'} · ${coverageStats.ready} student${coverageStats.ready !== 1 ? 's' : ''}`}
                          </button>
                          {coverageStats.missing > 0 && (
                            <p className="text-[11px] text-amber-400/80 text-center -mt-1">
                              {coverageStats.missing} student{coverageStats.missing !== 1 ? 's have' : ' has'} no saved reports — generate them first.
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
