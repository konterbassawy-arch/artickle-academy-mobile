
import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { SchoolEnrollmentPeriod, Role } from '../../types';

// ---------------------------------------------------------------------------
// Style constants (match existing admin page style)
// ---------------------------------------------------------------------------

const inputCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600';
const selectCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all';
const labelCls = 'block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5';

const STATUS_STYLE: Record<SchoolEnrollmentPeriod['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
  archived: 'bg-slate-700/40 text-slate-400 ring-1 ring-slate-600/30',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect overlap between two [start, end] date ranges (inclusive).
 * Dates are ISO 'YYYY-MM-DD' strings — safe to compare lexically.
 */
const periodsOverlap = (
  aStart: string, aEnd: string,
  bStart: string, bEnd: string
): boolean => {
  return aStart <= bEnd && bStart <= aEnd;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SchoolPeriodManager: React.FC = () => {
  const {
    currentUser,
    schools,
    enrollments,
    schoolEnrollmentPeriods,
    addSchoolEnrollmentPeriod,
    updateSchoolEnrollmentPeriod,
    deleteSchoolEnrollmentPeriod,
  } = useApp();

  const isAdmin = currentUser?.role === Role.ADMIN;
  const isSchoolAdmin = currentUser?.role === Role.SCHOOL_ADMIN;

  // ---- UI State ----
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(
    isSchoolAdmin ? (currentUser?.schoolId || '') : ''
  );
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // ---- Form State ----
  const [formName, setFormName] = useState('');
  const [formAcademicYear, setFormAcademicYear] = useState('');
  const [formTerm, setFormTerm] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formDefaultTotalLessons, setFormDefaultTotalLessons] = useState<number>(16);
  const [formDefaultDurationMinutes, setFormDefaultDurationMinutes] = useState<number>(30);

  // ---- Access gate ----
  if (!isAdmin && !isSchoolAdmin) {
    return (
      <div className="text-red-500">
        Only administrators can manage school enrollment periods.
      </div>
    );
  }

  // School_admin lock: always scoped to their own school, can never choose another.
  const effectiveSchoolId = isSchoolAdmin
    ? (currentUser?.schoolId || '')
    : selectedSchoolId;

  // ---- Filter periods by role + selected school ----
  const visiblePeriods = useMemo(() => {
    let list = schoolEnrollmentPeriods;
    if (isSchoolAdmin) {
      // Defense-in-depth: listener already filters, but re-filter client-side too.
      list = list.filter(p => p.schoolId === currentUser?.schoolId);
    } else if (effectiveSchoolId) {
      list = list.filter(p => p.schoolId === effectiveSchoolId);
    }
    if (!showArchived) {
      list = list.filter(p => p.status === 'active');
    }
    // Already sorted at listener level, but ensure consistency
    return list.slice().sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return (b.startDate || '').localeCompare(a.startDate || '');
    });
  }, [schoolEnrollmentPeriods, isSchoolAdmin, currentUser?.schoolId, effectiveSchoolId, showArchived]);

  // ---- Group by academic year ----
  const groupedByYear = useMemo(() => {
    const groups = new Map<string, SchoolEnrollmentPeriod[]>();
    visiblePeriods.forEach(p => {
      const year = p.academicYear || '—';
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year)!.push(p);
    });
    // Sort years descending (newest first)
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [visiblePeriods]);

  // ---- Counts ----
  const activeCount = schoolEnrollmentPeriods.filter(
    p => p.status === 'active' && (!effectiveSchoolId || p.schoolId === effectiveSchoolId)
  ).length;
  const archivedCount = schoolEnrollmentPeriods.filter(
    p => p.status === 'archived' && (!effectiveSchoolId || p.schoolId === effectiveSchoolId)
  ).length;

  // ---- Form helpers ----
  const resetForm = () => {
    setFormName('');
    setFormAcademicYear('');
    setFormTerm('');
    setFormStartDate('');
    setFormEndDate('');
    setFormDefaultTotalLessons(16);
    setFormDefaultDurationMinutes(30);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (p: SchoolEnrollmentPeriod) => {
    // Safety: school_admin can only edit their own school's periods
    if (isSchoolAdmin && p.schoolId !== currentUser?.schoolId) {
      alert('You can only edit periods for your own school.');
      return;
    }
    // For admin: ensure selectedSchoolId matches the period's school so the
    // form render-guard (showForm && effectiveSchoolId) doesn't silently block.
    if (isAdmin) {
      setSelectedSchoolId(p.schoolId);
    }
    setEditingId(p.id);
    setFormName(p.name);
    setFormAcademicYear(p.academicYear);
    setFormTerm(p.term || '');
    setFormStartDate(p.startDate);
    setFormEndDate(p.endDate);
    setFormDefaultTotalLessons(p.defaultTotalLessons);
    setFormDefaultDurationMinutes(p.defaultDurationMinutes);
    setShowForm(true);
  };

  const handleArchive = async (p: SchoolEnrollmentPeriod) => {
    // Safety: school_admin can only archive their own school's periods
    if (isSchoolAdmin && p.schoolId !== currentUser?.schoolId) {
      alert('You can only archive periods for your own school.');
      return;
    }
    if (!window.confirm(
      `Archive period "${p.name}"?\n\nArchived periods stay in the system for historical reference but are hidden from active lists.`
    )) return;
    await updateSchoolEnrollmentPeriod(p.id, { status: 'archived' });
  };

  const handleReactivate = async (p: SchoolEnrollmentPeriod) => {
    if (isSchoolAdmin && p.schoolId !== currentUser?.schoolId) {
      alert('You can only reactivate periods for your own school.');
      return;
    }
    await updateSchoolEnrollmentPeriod(p.id, { status: 'active' });
  };

  const handleDelete = async (p: SchoolEnrollmentPeriod) => {
    if (isSchoolAdmin && p.schoolId !== currentUser?.schoolId) {
      alert('You can only delete periods for your own school.');
      return;
    }
    // Check if any enrollments are linked to this period
    const linkedCount = enrollments.filter(e => e.schoolPeriodId === p.id).length;
    const linkWarning = linkedCount > 0
      ? `\n\n⚠ ${linkedCount} enrollment${linkedCount !== 1 ? 's are' : ' is'} linked to this period. Deleting it will NOT remove those enrollments, but the period link will be orphaned.`
      : '';
    if (!window.confirm(
      `Permanently delete period "${p.name}"?\n\nThis cannot be undone. Archived periods are usually preferable to deletion.${linkWarning}`
    )) return;
    await deleteSchoolEnrollmentPeriod(p.id);
  };

  // ---- Submit (create or edit) ----
  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();

    // Which school is this period for?
    const targetSchoolId = isSchoolAdmin
      ? (currentUser?.schoolId || '')
      : selectedSchoolId;

    if (!targetSchoolId) {
      alert('Please select a school first.');
      return;
    }

    // Role safety: school_admin cannot create/edit periods for other schools
    if (isSchoolAdmin && targetSchoolId !== currentUser?.schoolId) {
      alert('You can only manage periods for your own school.');
      return;
    }

    // ---- Validation ----
    if (!formName.trim()) {
      alert('Name is required.');
      return;
    }
    if (!formAcademicYear.trim()) {
      alert('Academic Year is required.');
      return;
    }
    if (!formStartDate || !formEndDate) {
      alert('Start date and end date are required.');
      return;
    }
    if (formStartDate >= formEndDate) {
      alert('Start date must be before end date.');
      return;
    }

    // Duplicate check: same school + same academicYear + same name (case-insensitive)
    const nameLower = formName.trim().toLowerCase();
    const yearLower = formAcademicYear.trim().toLowerCase();
    const duplicate = schoolEnrollmentPeriods.find(p =>
      p.id !== editingId &&
      p.schoolId === targetSchoolId &&
      (p.academicYear || '').toLowerCase() === yearLower &&
      p.name.trim().toLowerCase() === nameLower
    );
    if (duplicate) {
      alert(`A period named "${formName}" already exists for this school in ${formAcademicYear}.`);
      return;
    }

    // Overlap warning (non-blocking)
    const overlaps = schoolEnrollmentPeriods.filter(p =>
      p.id !== editingId &&
      p.schoolId === targetSchoolId &&
      p.status === 'active' &&
      periodsOverlap(formStartDate, formEndDate, p.startDate, p.endDate)
    );
    if (overlaps.length > 0) {
      const list = overlaps.map(p => `• ${p.name} (${p.startDate} → ${p.endDate})`).join('\n');
      const proceed = window.confirm(
        `Warning: this period overlaps with ${overlaps.length} existing active period(s):\n\n${list}\n\nContinue anyway?`
      );
      if (!proceed) return;
    }

    const school = schools.find(s => s.id === targetSchoolId);
    if (!school) {
      alert('Selected school not found.');
      return;
    }

    // When editing, preserve the existing period's status (do NOT force it back to 'active').
    const existingStatus = editingId
      ? (schoolEnrollmentPeriods.find(p => p.id === editingId)?.status ?? 'active')
      : 'active';

    const payload: Omit<SchoolEnrollmentPeriod, 'id' | 'createdAt' | 'updatedAt'> = {
      schoolId: targetSchoolId,
      schoolName: school.name,
      name: formName.trim(),
      academicYear: formAcademicYear.trim(),
      term: formTerm.trim() || undefined,
      startDate: formStartDate,
      endDate: formEndDate,
      defaultTotalLessons: formDefaultTotalLessons,
      defaultDurationMinutes: formDefaultDurationMinutes,
      status: existingStatus,
      createdBy: currentUser?.id || '',
    };

    if (editingId) {
      await updateSchoolEnrollmentPeriod(editingId, payload);
    } else {
      const result = await addSchoolEnrollmentPeriod(payload);
      if (!result.success) {
        alert(result.message || 'Failed to create school enrollment period.');
        return;
      }
    }

    resetForm();
  };

  // ---- Render ----
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">School Enrollment Periods</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Define enrollment periods (terms / semesters) per school. Each period sets the default
            lesson count and duration that will be used when enrollments are created from it.
          </p>
          <p className="text-slate-600 text-xs mt-2">
            {activeCount} active
            {archivedCount > 0 && <span className="mx-1 text-slate-700">·</span>}
            {archivedCount > 0 && <span>{archivedCount} archived</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {schoolEnrollmentPeriods.some(p => p.status === 'archived') && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="px-4 py-2.5 bg-slate-800 ring-1 ring-white/10 text-slate-300 rounded-xl hover:bg-slate-700 text-sm font-medium transition-all"
            >
              {showArchived ? 'Hide Archived' : 'Show Archived'}
            </button>
          )}
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            disabled={!effectiveSchoolId}
            className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary-900/20 transition-all active:scale-[0.98] disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
          >
            + New Period
          </button>
        </div>
      </div>

      {/* School selector (admin only) */}
      {isAdmin && (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5">
          <label className={labelCls}>School</label>
          <select
            value={selectedSchoolId}
            onChange={(e) => { setSelectedSchoolId(e.target.value); resetForm(); }}
            className={selectCls}
          >
            <option value="">Select a school to view its periods…</option>
            {schools.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {!selectedSchoolId && (
            <p className="text-xs text-slate-600 mt-2">
              Pick a school to view, create, or edit its enrollment periods.
            </p>
          )}
        </div>
      )}

      {/* Create / Edit Form */}
      {showForm && effectiveSchoolId && (
        <form onSubmit={handleSubmit} className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            {editingId ? 'Edit Period' : 'New Period'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className={inputCls}
                placeholder="e.g. Term 1"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Academic Year *</label>
              <input
                type="text"
                value={formAcademicYear}
                onChange={(e) => setFormAcademicYear(e.target.value)}
                className={inputCls}
                placeholder="e.g. 2025-2026"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Term (optional)</label>
              <input
                type="text"
                value={formTerm}
                onChange={(e) => setFormTerm(e.target.value)}
                className={inputCls}
                placeholder="e.g. Semester 1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Start Date *</label>
              <input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>End Date *</label>
              <input
                type="date"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                className={inputCls}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Default Total Lessons</label>
              <input
                type="number"
                value={formDefaultTotalLessons}
                onChange={(e) => setFormDefaultTotalLessons(Number(e.target.value))}
                className={inputCls}
                min="1"
              />
              <p className="text-[10px] text-slate-600 mt-1">
                Pre-fills the lesson count when enrollments are created from this period.
              </p>
            </div>
            <div>
              <label className={labelCls}>Default Duration (minutes)</label>
              <input
                type="number"
                value={formDefaultDurationMinutes}
                onChange={(e) => setFormDefaultDurationMinutes(Number(e.target.value))}
                className={inputCls}
                min="1"
              />
              <p className="text-[10px] text-slate-600 mt-1">
                Pre-fills lesson duration. Editable per student later.
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary-900/20 transition-all active:scale-[0.98]"
            >
              {editingId ? 'Save Changes' : 'Create Period'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-2.5 bg-slate-800 ring-1 ring-white/10 text-slate-300 rounded-xl hover:bg-slate-700 text-sm font-medium transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Empty state */}
      {!effectiveSchoolId && isAdmin && (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-10 text-center">
          <p className="text-slate-500 text-sm">
            Select a school above to view its enrollment periods.
          </p>
        </div>
      )}

      {effectiveSchoolId && visiblePeriods.length === 0 && (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-10 text-center">
          <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-slate-500 text-sm">
            {showArchived
              ? 'No archived periods for this school.'
              : 'No enrollment periods yet. Create one to get started.'}
          </p>
        </div>
      )}

      {/* Grouped list */}
      {groupedByYear.map(([year, periods]) => (
        <div key={year} className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 px-1">
            {year}
          </h3>
          <div className="overflow-x-auto bg-slate-900/60 ring-1 ring-white/5 rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-800/60">
                  <th className="px-4 py-3">Name</th>
                  {isAdmin && <th className="px-4 py-3">School</th>}
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">End</th>
                  <th className="px-4 py-3 text-right">Default Lessons</th>
                  <th className="px-4 py-3 text-right">Duration</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.map(p => (
                  <tr key={p.id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{p.name}</div>
                      {p.term && <div className="text-xs text-slate-500">{p.term}</div>}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-slate-400">{p.schoolName}</td>
                    )}
                    <td className="px-4 py-3 text-slate-300">{p.startDate}</td>
                    <td className="px-4 py-3 text-slate-300">{p.endDate}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{p.defaultTotalLessons}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{p.defaultDurationMinutes} min</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[p.status]}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => startEdit(p)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 ring-1 ring-white/10 rounded-lg hover:bg-slate-700 transition-all"
                        >
                          Edit
                        </button>
                        {p.status === 'active' ? (
                          <button
                            onClick={() => handleArchive(p)}
                            className="px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/20 rounded-lg hover:bg-amber-500/15 transition-all"
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(p)}
                            className="px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20 rounded-lg hover:bg-emerald-500/15 transition-all"
                          >
                            Reactivate
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(p)}
                          className="px-3 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 ring-1 ring-red-500/20 rounded-lg hover:bg-red-500/15 transition-all"
                          title="Permanently delete this period"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};
