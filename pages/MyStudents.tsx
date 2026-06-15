import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Role, isTeacherOf } from '../types';
import { SchoolPeriodListBadge } from '../components/SchoolPeriodListBadge';
import { studentsToExcel, downloadExcel, STUDENT_IMPORT_INSTRUCTIONS } from '../services/exportUtils';
import { parseStudentExcel } from '../services/importUtils';
import { ImportResultsModal } from '../components/ImportResultsModal';
import {
  exportStudentBulkExcel,
  exportStudentBulkPDF,
} from '../services/studentBulkExport';

const inputCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600';
const selectCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all';
const labelCls = 'block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5';

export const MyStudents: React.FC = () => {
  const { currentUser, students, schools, lessons, enrollments, schoolEnrollmentPeriods, addStudent, addSchool, processStudentImport } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [instrument, setInstrument] = useState(currentUser?.instrument || '');
  // Phase 19.4B: new optional fields
  const [yearGrade, setYearGrade] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  // Phase 19.4C: list filters
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [nameSearch, setNameSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [exportMenuOpen]);

  // Import Modal State
  const [importResults, setImportResults] = useState<{ added: number; skipped: number; errors: number; updated: number } | null>(null);
  // Add School State
  const [isAddingSchool, setIsAddingSchool] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolCode, setNewSchoolCode] = useState('');

  if (currentUser?.role !== Role.TEACHER) return <div className="text-red-500 text-sm">Access Denied</div>;

  // P6: use isTeacherOf — supports multi-teacher (currentTeacherIds) with legacy fallback
  const myStudents = students.filter(s => isTeacherOf(s, currentUser.id));

  // Phase 19.4C: grade list + filtered students
  const availableGrades = useMemo(() => {
    const grades = [...new Set(myStudents.map(s => s.yearGrade).filter(Boolean) as string[])];
    return grades.sort((a, b) => Number(a) - Number(b));
  }, [myStudents]);

  const filteredStudents = useMemo(() => {
    let result = myStudents;
    if (gradeFilter !== 'all') result = result.filter(s => s.yearGrade === gradeFilter);
    if (nameSearch.trim()) {
      const q = nameSearch.trim().toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.instrument.toLowerCase().includes(q) ||
        (s.email?.toLowerCase().includes(q) ?? false)
      );
    }
    return result;
  }, [myStudents, gradeFilter, nameSearch]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name && schoolId && instrument) {
      const res = await addStudent(name, schoolId, currentUser.id, instrument, { yearGrade, email, dateOfBirth });
      if (res.success) {
        setName('');
        setYearGrade('');
        setEmail('');
        setDateOfBirth('');
        alert('Student added successfully!');
      } else {
        alert(res.message || 'Failed to add student.');
      }
    }
  };

  // UPDATED HERE: Added async/await to correctly handle the Promise from addSchool
  const handleAddSchool = async () => {
    if (newSchoolName && newSchoolCode) {
        if (!/^[A-Z]{2}$/.test(newSchoolCode)) {
            alert("Code must be 2 Uppercase Letters (e.g. KC)");
            return;
        }
        const result = await addSchool(newSchoolName, 120, 80, newSchoolCode);

        if (result.success) {
            setNewSchoolName('');
            setNewSchoolCode('');
            setIsAddingSchool(false);
            alert(`School "${newSchoolName}" added.`);
        } else {
            alert(`Error: ${result.message}`);
        }
    }
  };

  // ── Selection helpers ────────────────────────────────────────────────────
  const allFilteredSelected =
    filteredStudents.length > 0 && filteredStudents.every(s => selectedIds.has(s.id));
  const someSelected = selectedIds.size > 0;

  const toggleStudent = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredStudents.forEach(s => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredStudents.forEach(s => next.add(s.id));
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedStudents = useMemo(
    () => myStudents.filter(s => selectedIds.has(s.id)),
    [myStudents, selectedIds],
  );

  const handleBulkExportExcel = () => {
    setExportMenuOpen(false);
    exportStudentBulkExcel(
      selectedStudents,
      lessons,
      enrollments,
      schoolEnrollmentPeriods,
      [{ id: currentUser.id, name: currentUser.name }],
      schools,
    );
  };

  const handleBulkExportPdf = async () => {
    setExportMenuOpen(false);
    setExportingPdf(true);
    await exportStudentBulkPDF(
      selectedStudents,
      lessons,
      enrollments,
      schoolEnrollmentPeriods,
      [{ id: currentUser.id, name: currentUser.name }],
      schools,
    );
    setExportingPdf(false);
  };

  // --- IMPORT / EXPORT ---
  const handleExportStudents = () => {
      // For teacher, export only their students
      const data = studentsToExcel(myStudents, schools, [{ id: currentUser.id, name: currentUser.name }]);
      downloadExcel(data, `My_Students_${new Date().toISOString().slice(0,10)}.xlsx`, 'Students', STUDENT_IMPORT_INSTRUCTIONS);
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  // UPDATED HERE: Added await to processStudentImport call to fix Promise assignment error.
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
          const data = await parseStudentExcel(file);
          const results = await processStudentImport(data, {
            role: currentUser?.role,
            currentUserId: currentUser?.id,
          });
          setImportResults(results);
      } catch (err) {
          alert('Error processing file: ' + err);
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-8">
      {/* IMPORT RESULTS MODAL */}
      {importResults && (
        <ImportResultsModal
            results={importResults}
            onClose={() => setImportResults(null)}
        />
      )}

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">My Students</h1>
          <p className="text-slate-500 text-sm mt-1">
            {myStudents.length} student{myStudents.length !== 1 ? 's' : ''} assigned to you
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />
          <button
            onClick={handleImportClick}
            className="bg-slate-800/80 ring-1 ring-white/5 hover:bg-slate-700/80 text-slate-300 hover:text-white px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
          </button>

          {/* Export dropdown — bulk report for selected students */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => someSelected && setExportMenuOpen(o => !o)}
              disabled={!someSelected || exportingPdf}
              className="bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700/60 disabled:cursor-not-allowed disabled:text-slate-500 active:scale-[0.98] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
              title={someSelected ? 'Export selected students' : 'Select students to export'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {exportingPdf
                ? 'Generating…'
                : someSelected
                ? `Export ${selectedIds.size} selected`
                : 'Export'}
              {someSelected && !exportingPdf && (
                <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {exportMenuOpen && someSelected && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-slate-900 ring-1 ring-white/10 rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-30">
                <button
                  onClick={handleBulkExportExcel}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-emerald-600/20 hover:text-emerald-300 transition-colors flex items-center gap-2.5"
                >
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 17v-6a2 2 0 012-2h2a2 2 0 012 2v6m-6 0h6m-3-13a9 9 0 110 18 9 9 0 010-18z" />
                  </svg>
                  Excel (.xlsx)
                </button>
                <div className="h-px bg-white/5" />
                <button
                  onClick={handleBulkExportPdf}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-rose-600/20 hover:text-rose-300 transition-colors flex items-center gap-2.5"
                >
                  <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  PDF (.pdf)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add student form */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">Add New Student</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-4 items-end">
          <div className="flex-grow min-w-[200px]">
            <label className={labelCls}>Student Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls}
              required
              placeholder="e.g., John Smith"
            />
          </div>

          <div className="w-64 min-w-[240px]">
            <label className={labelCls}>School</label>
            {!isAddingSchool ? (
              <div className="flex gap-2">
                <select
                  value={schoolId}
                  onChange={e => setSchoolId(e.target.value)}
                  className={selectCls}
                  required
                >
                  <option value="">Select School</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setIsAddingSchool(true)}
                  className="bg-slate-700/60 hover:bg-slate-600/60 ring-1 ring-white/10 text-white px-3 rounded-xl text-xs font-medium whitespace-nowrap transition-colors"
                >
                  + New
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSchoolName}
                  onChange={e => setNewSchoolName(e.target.value)}
                  className={inputCls}
                  placeholder="School Name"
                  autoFocus
                />
                <input
                  type="text"
                  value={newSchoolCode}
                  maxLength={2}
                  onChange={e => setNewSchoolCode(e.target.value.toUpperCase())}
                  className={`${inputCls} !w-16 shrink-0`}
                  placeholder="CD"
                />
                <button
                  type="button"
                  onClick={handleAddSchool}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 rounded-xl text-xs transition-colors shrink-0"
                  title="Save School"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingSchool(false)}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-3 rounded-xl text-xs transition-colors shrink-0"
                  title="Cancel"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="w-40 min-w-[150px]">
            <label className={labelCls}>Instrument</label>
            <input
              type="text"
              value={instrument}
              onChange={e => setInstrument(e.target.value)}
              className={inputCls}
              required
            />
          </div>
          <div className="w-36 min-w-[130px]">
            <label className={labelCls}>Year / Grade</label>
            <input
              type="number"
              min={1}
              max={12}
              step={1}
              value={yearGrade}
              onChange={e => setYearGrade(e.target.value)}
              className={inputCls}
              placeholder="1–12"
            />
          </div>
          <div className="w-48 min-w-[180px]">
            <label className={labelCls}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputCls}
              placeholder="student@email.com"
            />
          </div>
          <div className="w-40 min-w-[150px]">
            <label className={labelCls}>Date of Birth</label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={e => setDateOfBirth(e.target.value)}
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary-900/20 transition-all active:scale-[0.98] h-[42px]"
          >
            Add Student
          </button>
        </form>
      </div>

      {/* Compact selection badge */}
      {someSelected && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="px-2 py-1 rounded-full bg-primary-500/15 text-primary-300 font-medium">
            {selectedIds.size} selected
          </span>
          <button
            onClick={clearSelection}
            className="text-slate-500 hover:text-slate-300 transition-colors underline-offset-2 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Phase 19.4C: Student list filters */}
      {myStudents.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={gradeFilter}
            onChange={e => setGradeFilter(e.target.value)}
            className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500/50"
          >
            <option value="all">All Grades</option>
            {availableGrades.map(g => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={nameSearch}
              onChange={e => setNameSearch(e.target.value)}
              placeholder="Search name, instrument, or email..."
              className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 pl-9 text-white text-sm focus:outline-none focus:border-primary-500/50 w-full placeholder:text-slate-600"
            />
          </div>
          <span className="text-xs text-slate-600 font-medium shrink-0">
            {filteredStudents.length} result{filteredStudents.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Students table */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-800/40 text-[10px] text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500/40 cursor-pointer"
                    title={allFilteredSelected ? 'Deselect all' : 'Select all visible'}
                  />
                </th>
                <th className="px-5 py-3 font-medium text-left">Name</th>
                <th className="px-5 py-3 font-medium text-left">School</th>
                <th className="px-5 py-3 font-medium text-left">Instrument</th>
                <th className="px-5 py-3 font-medium text-left">Enrollment</th>
                <th className="px-5 py-3 font-medium text-left">Grade</th>
                <th className="px-5 py-3 font-medium text-left">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredStudents.map(s => (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/teacher/students/${s.id}`)}
                  className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${
                    selectedIds.has(s.id) ? 'bg-primary-900/10' : ''
                  }`}
                >
                  <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleStudent(s.id)}
                      className="rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500/40 cursor-pointer"
                    />
                  </td>
                  <td className="px-5 py-3.5 text-white font-medium">{s.name}</td>
                  <td className="px-5 py-3.5 text-slate-300">{schools.find(sch => sch.id === s.schoolId)?.name || 'Unknown'}</td>
                  <td className="px-5 py-3.5 text-slate-300 capitalize">{s.instrument}</td>
                  <td className="px-5 py-3.5">
                    <SchoolPeriodListBadge
                      student={s}
                      allLessons={lessons}
                      allEnrollments={enrollments}
                      schoolEnrollmentPeriods={schoolEnrollmentPeriods}
                    />
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 text-xs">{s.yearGrade ? `Grade ${s.yearGrade}` : <span className="text-slate-600">—</span>}</td>
                  <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">{s.id}</td>
                </tr>
              ))}
              {myStudents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-500 text-sm">
                    No students assigned to you yet.
                  </td>
                </tr>
              )}
              {myStudents.length > 0 && filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-500 text-sm">
                    No students match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
