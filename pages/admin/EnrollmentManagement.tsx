
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { matchesSearch } from '../../services/searchUtils';
import {
  Enrollment,
  EnrollmentStatus,
  EnrollmentPayerType,
  EnrollmentBillingStatus,
  DeliveryMode,
  Role,
  getEnrollmentRemaining,
  ENROLLMENT_CONSUMED_STATUSES,
  isTeacherOf,
  isHistoricalEnrollment,
} from '../../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const inputCls =
  'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600';
const selectCls =
  'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all';
const labelCls =
  'block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5';

const STATUS_COLORS: Record<EnrollmentStatus, string> = {
  [EnrollmentStatus.ACTIVE]:    'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
  [EnrollmentStatus.COMPLETED]: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
  [EnrollmentStatus.PAUSED]:    'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
  [EnrollmentStatus.CANCELLED]: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20',
};

const BILLING_LABELS: Record<EnrollmentBillingStatus, string> = {
  [EnrollmentBillingStatus.PAID]:           'Paid',
  [EnrollmentBillingStatus.TO_BE_INVOICED]: 'To Be Invoiced',
};

const PAYER_LABELS: Record<EnrollmentPayerType, string> = {
  [EnrollmentPayerType.PARENT]: 'Parent',
  [EnrollmentPayerType.SCHOOL]: 'School',
  [EnrollmentPayerType.SELF]:   'Self (Student)',
};

// Which enrollment mode each payer type defaults to when creating a new enrollment
const PAYER_DEFAULT_MODE: Record<EnrollmentPayerType, 'period' | 'custom'> = {
  [EnrollmentPayerType.SCHOOL]: 'period',
  [EnrollmentPayerType.PARENT]: 'custom',
  [EnrollmentPayerType.SELF]:   'custom',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const EnrollmentManagement: React.FC = () => {
  const {
    currentUser,
    enrollments,
    invoices,
    lessons,
    students,
    teachers,
    schools,
    schoolEnrollmentPeriods,
    addEnrollment,
    batchAddEnrollments,
    batchUpdateLessonEnrollmentLinks,
    updateEnrollment,
    deleteEnrollment,
    formatCurrency,
  } = useApp();
  const navigate = useNavigate();

  // ---- Role helpers ----
  const isAdmin       = currentUser?.role === Role.ADMIN;
  const isSchoolAdmin = currentUser?.role === Role.SCHOOL_ADMIN;
  const isTeacher     = currentUser?.role === Role.TEACHER;

  // Access gate — only these three roles may view this page
  if (!isAdmin && !isSchoolAdmin && !isTeacher) {
    return (
      <div className="text-red-400 text-sm p-6">
        You do not have permission to view enrollments.
      </div>
    );
  }

  // ---- UI state ----
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);

  // ---- Basic form fields ----
  const [formStudentId,    setFormStudentId]    = useState('');
  const [formTeacherId,    setFormTeacherId]    = useState('');
  const [formSchoolId,     setFormSchoolId]     = useState('');
  const [formInstrument,   setFormInstrument]   = useState('');
  const [formTotalLessons, setFormTotalLessons] = useState(8);
  const [formDuration,     setFormDuration]     = useState(30);
  const [formLessonType,   setFormLessonType]   = useState<'Individual' | 'Group'>('Individual');
  const [formDeliveryMode, setFormDeliveryMode] = useState<DeliveryMode>(DeliveryMode.IN_PERSON);
  const [formPayerType,    setFormPayerType]    = useState<EnrollmentPayerType>(EnrollmentPayerType.SCHOOL);
  const [formBillingStatus, setFormBillingStatus] = useState<EnrollmentBillingStatus>(EnrollmentBillingStatus.TO_BE_INVOICED);
  const [formPriceExpected, setFormPriceExpected] = useState<string>('');
  const [formStatus,       setFormStatus]       = useState<EnrollmentStatus>(EnrollmentStatus.ACTIVE);
  const [formNotes,        setFormNotes]        = useState('');

  // ---- Phase 19.6D2: Enrollment mode + date/period fields ----
  const [formMode,          setFormMode]          = useState<'period' | 'custom'>('period');
  const [formPeriodId,      setFormPeriodId]      = useState('');
  const [formStartDate,     setFormStartDate]     = useState('');
  const [formEndDate,       setFormEndDate]       = useState('');
  const [formAcademicYear,  setFormAcademicYear]  = useState('');
  const [formTerm,          setFormTerm]          = useState('');
  // Tracks whether dates have been edited away from the selected period's defaults
  const [formIsDateOverride, setFormIsDateOverride] = useState(false);
  // Tracks whether this student has a custom lesson duration overriding the school/period default
  const [formIsDurationOverride, setFormIsDurationOverride] = useState(false);
  // Tracks whether this student has a custom totalLessons overriding the school/period default
  const [formIsLessonsOverride, setFormIsLessonsOverride] = useState(false);

  // ---- Auto-link pending prompt (after enrollment creation, single or bulk) ----
  const [pendingLink, setPendingLink] = useState<{
    // Generic pairs: each lesson mapped to its enrollment
    pairs: { lessonId: string; enrollmentId: string }[];
    // Human-readable label for the prompt
    label: string;
  } | null>(null);
  const [linkResult, setLinkResult] = useState<{ linked: number } | null>(null);

  // ---- Single enrollment student search ----
  const [singleStudentSearch, setSingleStudentSearch] = useState('');

  // ---- Bulk enrollment mode ----
  const [formBulkMode, setFormBulkMode] = useState(false);
  const [formBulkStudentIds, setFormBulkStudentIds] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: { name: string; reason: string }[] } | null>(null);
  const [bulkSearch, setBulkSearch] = useState('');
  // Reference dates from the currently-selected period — used to detect divergence
  const [periodRefStart, setPeriodRefStart] = useState('');
  const [periodRefEnd,   setPeriodRefEnd]   = useState('');

  // ---- Derived: role-scoped student list ----
  const visibleStudents = useMemo(() => {
    if (isAdmin)       return students;
    if (isSchoolAdmin) return students.filter(s => s.schoolId === currentUser?.schoolId);
    if (isTeacher)     return students.filter(s => currentUser ? isTeacherOf(s, currentUser.id) : false);
    return [];
  }, [students, currentUser, isAdmin, isSchoolAdmin, isTeacher]);

  // ---- Derived: form student list — filtered by school AND/OR teacher, deduplicated, sorted ----
  const formStudentOptions = useMemo(() => {
    let list = visibleStudents;
    if (formSchoolId)  list = list.filter(s => s.schoolId  === formSchoolId);
    if (formTeacherId) list = list.filter(s => s.teacherId === formTeacherId);
    list = list.slice().sort((a, b) => a.name.localeCompare(b.name));

    // Deduplicate by name + instrument — keep the first occurrence only.
    const seen = new Set<string>();
    list = list.filter(s => {
      const key = `${s.name.trim().toLowerCase()}|${s.instrument.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return list.map(s => ({ id: s.id, label: `${s.name} (${s.instrument})`, instrument: s.instrument }));
  }, [visibleStudents, formSchoolId, formTeacherId]);

  // ---- Derived: single-mode student list after search ----
  const filteredSingleStudentOptions = useMemo(() => {
    if (!singleStudentSearch.trim()) return formStudentOptions;
    return formStudentOptions.filter(s => matchesSearch(singleStudentSearch, [s.label]));
  }, [formStudentOptions, singleStudentSearch]);

  // ---- Derived: student list for bulk multi-select — filtered by school AND/OR teacher ----
  const bulkStudentList = useMemo(() => {
    // Require at least school or teacher to be selected
    if (!formSchoolId && !formTeacherId) return [];
    let list = visibleStudents;
    if (formSchoolId)   list = list.filter(s => s.schoolId  === formSchoolId);
    if (formTeacherId)  list = list.filter(s => s.teacherId === formTeacherId);
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleStudents, formSchoolId, formTeacherId]);

  // ---- Derived: bulk list after in-panel search ----
  const filteredBulkStudentList = useMemo(() => {
    if (!bulkSearch.trim()) return bulkStudentList;
    return bulkStudentList.filter(s => matchesSearch(bulkSearch, [s.name, s.instrument]));
  }, [bulkStudentList, bulkSearch]);

  // ---- Derived: active periods for the currently-selected school ----
  const availablePeriods = useMemo(() => {
    if (!formSchoolId) return [];
    return schoolEnrollmentPeriods
      .filter(p => p.schoolId === formSchoolId && p.status === 'active')
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [schoolEnrollmentPeriods, formSchoolId]);

  // ---- Derived: role-scoped + filtered enrollment list ----
  const filtered = useMemo(() => {
    let list = enrollments;
    if (isSchoolAdmin) list = list.filter(e => e.schoolId === currentUser?.schoolId);
    if (isTeacher)     list = list.filter(e => e.teacherId === currentUser?.id);
    if (statusFilter !== 'all') list = list.filter(e => e.status === statusFilter);
    if (search.trim()) {
      list = list.filter(e =>
        matchesSearch(search, [e.studentName, e.teacherName, e.schoolName, e.instrument, e.id])
      );
    }
    return list;
  }, [enrollments, currentUser, isAdmin, isSchoolAdmin, isTeacher, statusFilter, search]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  // Switch enrollment mode; clears period link when switching to custom
  const handleModeSelect = (mode: 'period' | 'custom') => {
    setFormMode(mode);
    if (mode === 'custom') {
      setFormPeriodId('');
      setPeriodRefStart('');
      setPeriodRefEnd('');
      setFormIsDateOverride(true);
    } else {
      // Switching to period mode — period not auto-selected; user picks from dropdown
      setFormIsDateOverride(false);
    }
  };

  // Payer type change: sets default mode for new enrollments
  const handlePayerTypeChange = (payer: EnrollmentPayerType) => {
    setFormPayerType(payer);
    if (!editingId) {
      handleModeSelect(PAYER_DEFAULT_MODE[payer]);
    }
  };

  // School change: clear period + student selection when school changes
  const handleSchoolChange = (schoolId: string) => {
    setFormSchoolId(schoolId);
    setFormPeriodId('');
    setPeriodRefStart('');
    setPeriodRefEnd('');
    setFormIsDateOverride(false);
    // Clear student if they don't belong to the newly-selected school
    if (formStudentId) {
      const currentStudent = students.find(s => s.id === formStudentId);
      if (currentStudent && currentStudent.schoolId !== schoolId) {
        setFormStudentId('');
        setFormTeacherId('');
        setFormInstrument('');
      }
    }
  };

  // Student selection: auto-fill teacher / school / instrument / payer type
  const handleStudentChange = (studentId: string) => {
    setFormStudentId(studentId);
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    // Teacher auto-fill (always)
    setFormTeacherId(student.teacherId || '');
    setFormInstrument(student.instrument || '');

    // School: admin updates freely; school_admin is locked to their own school
    if (isAdmin) handleSchoolChange(student.schoolId || '');

    // Default payer type from student type + switch mode accordingly
    const defaultPayer = student.schoolId
      ? EnrollmentPayerType.SCHOOL
      : EnrollmentPayerType.PARENT;
    setFormPayerType(defaultPayer);
    if (!editingId) handleModeSelect(PAYER_DEFAULT_MODE[defaultPayer]);
  };

  // Period selection: pre-fill all derived fields; mark as NOT overridden
  const handlePeriodSelect = (periodId: string) => {
    setFormPeriodId(periodId);
    if (!periodId) {
      setPeriodRefStart('');
      setPeriodRefEnd('');
      return;
    }
    const period = schoolEnrollmentPeriods.find(p => p.id === periodId);
    if (!period) return;
    setFormStartDate(period.startDate);
    setFormEndDate(period.endDate);
    setFormAcademicYear(period.academicYear);
    setFormTerm(period.term || '');
    setFormTotalLessons(period.defaultTotalLessons);
    setFormDuration(period.defaultDurationMinutes);
    // Store reference values so we can detect divergence
    setPeriodRefStart(period.startDate);
    setPeriodRefEnd(period.endDate);
    setFormIsDateOverride(false);
    setFormIsDurationOverride(false);
    setFormIsLessonsOverride(false);
  };

  // Date change handlers: detect divergence from period defaults in period mode
  const handleStartDateChange = (val: string) => {
    setFormStartDate(val);
    if (formMode === 'period' && formPeriodId) {
      setFormIsDateOverride(val !== periodRefStart || formEndDate !== periodRefEnd);
    }
  };

  const handleEndDateChange = (val: string) => {
    setFormEndDate(val);
    if (formMode === 'period' && formPeriodId) {
      setFormIsDateOverride(formStartDate !== periodRefStart || val !== periodRefEnd);
    }
  };

  // ---- Reset form ----
  const resetForm = () => {
    setFormStudentId('');
    setFormTeacherId(isTeacher ? (currentUser?.id || '') : '');
    setFormSchoolId(isSchoolAdmin ? (currentUser?.schoolId || '') : '');
    setFormInstrument('');
    setFormTotalLessons(8);
    setFormDuration(30);
    setFormLessonType('Individual');
    setFormDeliveryMode(DeliveryMode.IN_PERSON);
    setFormPayerType(isSchoolAdmin ? EnrollmentPayerType.SCHOOL : EnrollmentPayerType.SCHOOL);
    setFormBillingStatus(EnrollmentBillingStatus.TO_BE_INVOICED);
    setFormPriceExpected('');
    setFormStatus(EnrollmentStatus.ACTIVE);
    setFormNotes('');
    setFormMode('period');
    setFormPeriodId('');
    setFormStartDate('');
    setFormEndDate('');
    setFormAcademicYear('');
    setFormTerm('');
    setFormIsDateOverride(false);
    setFormIsDurationOverride(false);
    setFormIsLessonsOverride(false);
    setPeriodRefStart('');
    setPeriodRefEnd('');
    setFormBulkMode(false);
    setFormBulkStudentIds(new Set());
    setBulkResult(null);
    setBulkSearch('');
    setSingleStudentSearch('');
    setEditingId(null);
    setShowForm(false);
  };

  // ---- Start editing ----
  const startEdit = (e: Enrollment) => {
    setEditingId(e.id);
    setFormStudentId(e.studentId);
    setFormTeacherId(e.teacherId);
    setFormSchoolId(e.schoolId || '');
    setFormInstrument(e.instrument);
    setFormTotalLessons(e.totalLessons);
    setFormDuration(e.durationMinutes);
    setFormLessonType(e.lessonType);
    setFormDeliveryMode(e.deliveryMode);
    setFormPayerType(e.payerType);
    setFormBillingStatus(e.billingStatus);
    setFormPriceExpected(e.priceExpected != null ? String(e.priceExpected) : '');
    setFormStatus(e.status);
    setFormNotes(e.notes || '');
    // Phase 19.6D2: restore date/period state
    setFormStartDate(e.startDate || '');
    setFormEndDate(e.endDate || '');
    setFormAcademicYear(e.academicYear || '');
    setFormTerm(e.term || '');
    setFormIsDateOverride(!!e.isDateOverride);
    setFormIsDurationOverride(!!e.isDurationOverride);
    if (e.schoolPeriodId) {
      setFormMode('period');
      setFormPeriodId(e.schoolPeriodId);
      const period = schoolEnrollmentPeriods.find(p => p.id === e.schoolPeriodId);
      setFormIsLessonsOverride(period ? e.totalLessons !== period.defaultTotalLessons : false);
      setPeriodRefStart(period ? period.startDate : (e.startDate || ''));
      setPeriodRefEnd(period ? period.endDate : (e.endDate || ''));
    } else {
      setFormMode('custom');
      setFormPeriodId('');
      setPeriodRefStart('');
      setPeriodRefEnd('');
    }
    setShowForm(true);
  };

  // ---- Submit ----
  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();

    // In bulk mode teacher is a filter only — not required (each student carries their own teacher)
    if (!formBulkMode && !formTeacherId) {
      alert('Teacher is required.');
      return;
    }
    if (!formBulkMode && !formStudentId) {
      alert('Student is required.');
      return;
    }
    if (formBulkMode && formBulkStudentIds.size === 0) {
      alert('Select at least one student.');
      return;
    }
    if (!formStartDate) {
      alert('Start date is required.');
      return;
    }
    if (formEndDate && formStartDate >= formEndDate) {
      alert('End date must be after start date.');
      return;
    }
    if (formTotalLessons < 1) {
      alert('Total lessons must be at least 1.');
      return;
    }

    const teacher = teachers.find(t => t.id === formTeacherId);
    const school  = formSchoolId ? schools.find(s => s.id === formSchoolId) : undefined;

    const isDateOverride =
      formMode === 'custom'
        ? true
        : formPeriodId
          ? (formStartDate !== periodRefStart || formEndDate !== periodRefEnd)
          : false;

    // ---- Bulk path ----
    if (formBulkMode) {
      const selectedStudents = bulkStudentList
        .filter(s => formBulkStudentIds.has(s.id))
        .map(s => {
          // Each student uses their own teacher; formTeacherId is filter-only in bulk mode
          const studentTeacher = teachers.find(t => t.id === s.teacherId);
          return {
            id: s.id,
            name: s.name,
            instrument: s.instrument,
            teacherId: s.teacherId || formTeacherId || '',
            teacherName: studentTeacher?.name || teachers.find(t => t.id === formTeacherId)?.name || 'Unknown',
          };
        });

      const template: Omit<Enrollment, 'id' | 'createdAt' | 'updatedAt' | 'studentId' | 'studentName' | 'instrument'> = {
        teacherId:    formTeacherId,
        teacherName:  teacher?.name || 'Unknown',
        schoolId:     formSchoolId || undefined,
        schoolName:   school?.name || undefined,
        totalLessons: formTotalLessons,
        durationMinutes: formDuration,
        lessonType:   formLessonType,
        deliveryMode: formDeliveryMode,
        payerType:    formPayerType,
        billingStatus: formBillingStatus,
        priceExpected: formPriceExpected ? Number(formPriceExpected) : undefined,
        status:       formStatus,
        notes:        formNotes || undefined,
        createdBy:    currentUser!.id,
        startDate:     formStartDate,
        endDate:       formEndDate || undefined,
        academicYear:  formAcademicYear || undefined,
        term:          formTerm || undefined,
        schoolPeriodId: formMode === 'period' && formPeriodId ? formPeriodId : undefined,
        isDateOverride: isDateOverride || undefined,
        isDurationOverride: formIsDurationOverride || undefined,
      };

      const result = await batchAddEnrollments(template, selectedStudents);
      setBulkResult(result);
      setFormBulkStudentIds(new Set());

      // ── Auto-link: find unlinked lessons per student across all created enrollments ──
      if (result.createdEnrollments.length > 0) {
        const linkPairs: { lessonId: string; enrollmentId: string }[] = [];
        for (const { studentId, enrollmentId } of result.createdEnrollments) {
          const unlinked = lessons.filter(l =>
            l.studentIds?.includes(studentId) &&
            !l.enrollmentId &&
            l.date >= formStartDate &&
            (!formEndDate || l.date <= formEndDate)
          );
          for (const l of unlinked) {
            linkPairs.push({ lessonId: l.id, enrollmentId });
          }
        }
        if (linkPairs.length > 0) {
          const studentCount = new Set(
            linkPairs.map(p => result.createdEnrollments.find(e => e.enrollmentId === p.enrollmentId)?.studentId)
          ).size;
          setPendingLink({
            pairs: linkPairs,
            label: `${linkPairs.length} existing lesson${linkPairs.length !== 1 ? 's' : ''} found across ${studentCount} student${studentCount !== 1 ? 's' : ''}`,
          });
          setShowForm(false);
          return;
        }
      }

      return;
    }

    // ---- Single path ----
    const student = students.find(s => s.id === formStudentId);

    const payload: Omit<Enrollment, 'id' | 'createdAt' | 'updatedAt'> = {
      studentId:    formStudentId,
      studentName:  student?.name || 'Unknown',
      teacherId:    formTeacherId,
      teacherName:  teacher?.name || 'Unknown',
      schoolId:     formSchoolId || undefined,
      schoolName:   school?.name || undefined,
      instrument:   formInstrument,
      totalLessons: formTotalLessons,
      durationMinutes: formDuration,
      lessonType:   formLessonType,
      deliveryMode: formDeliveryMode,
      payerType:    formPayerType,
      billingStatus: formBillingStatus,
      priceExpected: formPriceExpected ? Number(formPriceExpected) : undefined,
      status:       formStatus,
      notes:        formNotes || undefined,
      createdBy:    currentUser!.id,
      startDate:     formStartDate,
      endDate:       formEndDate || undefined,
      academicYear:  formAcademicYear || undefined,
      term:          formTerm || undefined,
      schoolPeriodId: formMode === 'period' && formPeriodId ? formPeriodId : undefined,
      isDateOverride: isDateOverride || undefined,
      isDurationOverride: formIsDurationOverride || undefined,
    };

    if (editingId) {
      const result = await updateEnrollment(editingId, payload);
      if (!result.success) {
        alert(result.message || 'Failed to update enrollment.');
        return;
      }
      // ── Auto-link on edit: check for unlinked lessons now that dates may have changed ──
      const unlinkedOnEdit = lessons.filter(l =>
        l.studentIds?.includes(formStudentId) &&
        !l.enrollmentId &&
        l.date >= formStartDate &&
        (!formEndDate || l.date <= formEndDate)
      );
      if (unlinkedOnEdit.length > 0) {
        const student = students.find(s => s.id === formStudentId);
        const studentName = student?.name ?? 'this student';
        setPendingLink({
          pairs: unlinkedOnEdit.map(l => ({ lessonId: l.id, enrollmentId: editingId })),
          label: `${unlinkedOnEdit.length} unlinked lesson${unlinkedOnEdit.length !== 1 ? 's' : ''} found for ${studentName}`,
        });
        setShowForm(false);
        setEditingId(null);
        return;
      }
    } else {
      const result = await addEnrollment(payload);
      if (!result.success) {
        alert(result.message || 'Failed to create enrollment.');
        return;
      }

      // ── Auto-link: find unlinked lessons for this student in this date range ──
      if (result.enrollmentId) {
        const unlinked = lessons.filter(l =>
          l.studentIds?.includes(formStudentId) &&
          !l.enrollmentId &&
          l.date >= formStartDate &&
          (!formEndDate || l.date <= formEndDate)
        );
        if (unlinked.length > 0) {
          const student = students.find(s => s.id === formStudentId);
          const studentName = student?.name ?? 'this student';
          setPendingLink({
            pairs: unlinked.map(l => ({ lessonId: l.id, enrollmentId: result.enrollmentId! })),
            label: `${unlinked.length} existing lesson${unlinked.length !== 1 ? 's' : ''} found for ${studentName}`,
          });
          setShowForm(false);
          setEditingId(null);
          return; // hold off on full reset until user decides
        }
      }
    }

    resetForm();
  };

  // ---- Delete ----
  const handleDelete = async (id: string) => {
    const linkedCount = lessons.filter(l => l.enrollmentId === id).length;
    const msg = linkedCount > 0
      ? `This enrollment has ${linkedCount} linked lesson(s). Delete anyway? The lessons will become standalone.`
      : 'Delete this enrollment?';
    if (!window.confirm(msg)) return;
    await deleteEnrollment(id);
  };

  // ---- Auto-link handler ----
  const handleLinkLessons = async () => {
    if (!pendingLink) return;
    const result = await batchUpdateLessonEnrollmentLinks(pendingLink.pairs);
    setPendingLink(null);
    if (result.success) {
      setLinkResult({ linked: result.written });
    } else {
      alert(result.message || 'Failed to link lessons.');
    }
  };

  // ---- Retroactive link: link unlinked/mislinked lessons to an enrollment ----
  const handleRetroLink = async (enrollment: Enrollment) => {
    const today = new Date().toISOString().slice(0, 10);
    const unlinked = lessons.filter(l => {
      if (!l.studentIds?.includes(enrollment.studentId)) return false;
      if (l.date < enrollment.startDate) return false;
      if (enrollment.endDate && l.date > enrollment.endDate) return false;
      if (!l.enrollmentId) return true;                          // unlinked
      if (l.enrollmentId === enrollment.id) return false;        // already on this enrollment
      const linkedTo = enrollments.find(e => e.id === l.enrollmentId);
      if (!linkedTo) return true;                                // orphaned link
      if (isHistoricalEnrollment(linkedTo, today)) return true;  // linked to completed/expired enrollment
      return false;
    });
    if (unlinked.length === 0) return;
    const ok = window.confirm(
      `Link ${unlinked.length} existing lesson${unlinked.length !== 1 ? 's' : ''} to this enrollment?\n\nThis will update the consumed count for ${enrollment.studentName}.`
    );
    if (!ok) return;
    const pairs = unlinked.map(l => ({ lessonId: l.id, enrollmentId: enrollment.id }));
    const result = await batchUpdateLessonEnrollmentLinks(pairs);
    if (result.success) {
      setLinkResult({ linked: result.written });
    } else {
      alert(result.message || 'Failed to link lessons.');
    }
  };

  // ---- Helpers ----
  const getRemainingForEnrollment = (enrollment: Enrollment) =>
    getEnrollmentRemaining(enrollment, lessons);

  const consumedStatusList = ENROLLMENT_CONSUMED_STATUSES.join(', ');

  // ---- Summary stats ----
  const activeCount    = filtered.filter(e => e.status === EnrollmentStatus.ACTIVE).length;
  const completedCount = filtered.filter(e => e.status === EnrollmentStatus.COMPLETED).length;
  const pausedCount    = filtered.filter(e => e.status === EnrollmentStatus.PAUSED).length;

  // ---- Selected period info (for display in form) ----
  const selectedPeriod = formPeriodId
    ? schoolEnrollmentPeriods.find(p => p.id === formPeriodId)
    : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-8">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Enrollments</h1>
          <p className="text-slate-500 text-sm mt-1">
            {filtered.length} total
            {activeCount > 0 && <span className="mx-1 text-slate-700">·</span>}
            {activeCount > 0 && <span className="text-emerald-400">{activeCount} active</span>}
            {completedCount > 0 && <span className="mx-1 text-slate-700">·</span>}
            {completedCount > 0 && <span className="text-blue-400">{completedCount} completed</span>}
            {pausedCount > 0 && <span className="mx-1 text-slate-700">·</span>}
            {pausedCount > 0 && <span className="text-amber-400">{pausedCount} paused</span>}
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary-900/20 transition-all active:scale-[0.98]"
        >
          + New Enrollment
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search student, teacher, school, instrument…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={`flex-1 ${inputCls}`}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
        >
          <option value="all">All Statuses</option>
          {Object.values(EnrollmentStatus).map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* ── Create / Edit Form ── */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              {editingId ? 'Edit Enrollment' : 'New Enrollment'}
            </h2>
            {/* Bulk / Single toggle — only on create */}
            {!editingId && isAdmin && (
              <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => { setFormBulkMode(false); setFormBulkStudentIds(new Set()); setBulkResult(null); }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${!formBulkMode ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => { setFormBulkMode(true); setFormStudentId(''); setBulkResult(null); }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${formBulkMode ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Bulk
                </button>
              </div>
            )}
          </div>

          {/* ── Lesson progress — edit mode only ── */}
          {editingId && (() => {
            const enr = enrollments.find(e => e.id === editingId);
            if (!enr) return null;
            const { consumed, remaining } = getEnrollmentRemaining(enr, lessons);
            const pct = enr.totalLessons > 0 ? Math.round((consumed / enr.totalLessons) * 100) : 0;
            return (
              <div className="rounded-xl bg-slate-800/50 ring-1 ring-white/5 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Lesson Progress</span>
                  <span className="text-slate-500">{consumed} of {enr.totalLessons} used · <span className={remaining <= 2 ? 'text-amber-400 font-medium' : 'text-slate-400'}>{remaining} remaining</span></span>
                </div>
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })()}

          {/* ── Section 1: Who ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Student — single mode with search panel */}
            {!formBulkMode && (
            <div className="md:col-span-3">
              <label className={labelCls}>Student *</label>
              <div className="rounded-xl ring-1 ring-white/5 bg-slate-800/40 overflow-hidden">
                {/* Search input */}
                <div className="px-3 py-2 border-b border-slate-700/50">
                  <div className="relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none"
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={singleStudentSearch}
                      onChange={e => setSingleStudentSearch(e.target.value)}
                      placeholder={
                        formSchoolId || formTeacherId
                          ? 'Search by name or instrument…'
                          : 'Select a school or teacher above to filter, or search all students…'
                      }
                      className="w-full bg-slate-700/40 border border-slate-700/60 rounded-lg pl-8 pr-3 py-1.5 text-white text-xs focus:outline-none focus:border-primary-500/50 placeholder:text-slate-600"
                    />
                    {singleStudentSearch && (
                      <button
                        type="button"
                        onClick={() => setSingleStudentSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {/* Student list */}
                {filteredSingleStudentOptions.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-slate-500">
                    {singleStudentSearch ? `No students match "${singleStudentSearch}".` : 'No students found for selected filters.'}
                  </p>
                ) : (
                  <div className="max-h-44 overflow-y-auto divide-y divide-slate-700/30">
                    {filteredSingleStudentOptions.map(s => (
                      <label key={s.id}
                        className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
                          formStudentId === s.id ? 'bg-primary-500/15' : 'hover:bg-slate-700/30'
                        }`}
                      >
                        <input
                          type="radio"
                          name="singleStudent"
                          value={s.id}
                          checked={formStudentId === s.id}
                          onChange={() => { handleStudentChange(s.id); setSingleStudentSearch(''); }}
                          className="accent-primary-500 shrink-0"
                        />
                        <span className={`text-sm flex-1 ${formStudentId === s.id ? 'text-white font-medium' : 'text-slate-300'}`}>
                          {s.label.replace(` (${s.instrument})`, '')}
                        </span>
                        <span className="text-[11px] text-slate-500 shrink-0">{s.instrument}</span>
                      </label>
                    ))}
                  </div>
                )}
                {/* Selected student pill */}
                {formStudentId && (
                  <div className="px-4 py-2 border-t border-slate-700/50 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      Selected: <span className="text-white font-medium">
                        {formStudentOptions.find(s => s.id === formStudentId)?.label}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStudentChange('')}
                      className="text-[11px] text-slate-500 hover:text-red-400 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </div>
            )}

            {/* Teacher — locked for teacher role; filter-only in bulk mode */}
            <div>
              <label className={labelCls}>
                Teacher {formBulkMode ? <span className="normal-case text-slate-600 font-normal">(filter)</span> : '*'}
              </label>
              {isTeacher ? (
                <div className={`${inputCls} text-slate-300 cursor-not-allowed opacity-70`}>
                  {teachers.find(t => t.id === currentUser?.id)?.name || currentUser?.name}
                </div>
              ) : (
                <select
                  value={formTeacherId}
                  onChange={e => setFormTeacherId(e.target.value)}
                  className={selectCls}
                  required={!formBulkMode}
                >
                  <option value="">{formBulkMode ? 'All Teachers' : 'Select Teacher'}</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* School — hidden for teacher, locked for school_admin */}
            {!isTeacher && (
              <div>
                <label className={labelCls}>School</label>
                {isSchoolAdmin ? (
                  <div className={`${inputCls} text-slate-300 cursor-not-allowed opacity-70`}>
                    {schools.find(s => s.id === currentUser?.schoolId)?.name || 'Your School'}
                  </div>
                ) : (
                  <select
                    value={formSchoolId}
                    onChange={e => handleSchoolChange(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Private (no school)</option>
                    {schools.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* ── Bulk student selector ── */}
          {formBulkMode && (
            <div className="rounded-xl ring-1 ring-white/5 bg-slate-800/40 overflow-hidden">
              {/* Header: label + selected count + select-all */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50">
                <label className={labelCls + ' mb-0'}>
                  Students *
                  {formBulkStudentIds.size > 0 && (
                    <span className="ml-2 text-primary-400 normal-case font-semibold">{formBulkStudentIds.size} selected</span>
                  )}
                </label>
                {bulkStudentList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      // Select all / deselect all operates on the full unfiltered list
                      if (formBulkStudentIds.size === bulkStudentList.length) {
                        setFormBulkStudentIds(new Set());
                      } else {
                        setFormBulkStudentIds(new Set(bulkStudentList.map(s => s.id)));
                      }
                    }}
                    className="text-[11px] text-slate-400 hover:text-white transition-colors"
                  >
                    {formBulkStudentIds.size === bulkStudentList.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>

              {/* Search box — only shown when there are students to search */}
              {bulkStudentList.length > 0 && (
                <div className="px-3 py-2 border-b border-slate-700/30">
                  <div className="relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none"
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={bulkSearch}
                      onChange={e => setBulkSearch(e.target.value)}
                      placeholder="Search by name or instrument…"
                      className="w-full bg-slate-700/40 border border-slate-700/60 rounded-lg pl-8 pr-3 py-1.5 text-white text-xs focus:outline-none focus:border-primary-500/50 placeholder:text-slate-600"
                    />
                    {bulkSearch && (
                      <button
                        type="button"
                        onClick={() => setBulkSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Student list */}
              {!formSchoolId && !formTeacherId ? (
                <p className="px-4 py-3 text-xs text-slate-500">Select a school or teacher above to see students.</p>
              ) : bulkStudentList.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-500">No students found for the selected filters.</p>
              ) : filteredBulkStudentList.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-500">No students match "{bulkSearch}".</p>
              ) : (
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-700/30">
                  {filteredBulkStudentList.map(s => (
                    <label key={s.id} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-700/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formBulkStudentIds.has(s.id)}
                        onChange={e => {
                          const next = new Set(formBulkStudentIds);
                          if (e.target.checked) next.add(s.id); else next.delete(s.id);
                          setFormBulkStudentIds(next);
                        }}
                        className="rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500/40"
                      />
                      <span className="text-sm text-white flex-1">{s.name}</span>
                      <span className="text-xs text-slate-500">{s.instrument}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Bulk result summary ── */}
          {bulkResult && (
            <div className="rounded-xl ring-1 ring-white/5 bg-slate-800/40 px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-emerald-400">
                ✓ {bulkResult.created} enrollment{bulkResult.created !== 1 ? 's' : ''} created
              </p>
              {bulkResult.skipped.length > 0 && (
                <div>
                  <p className="text-xs text-amber-400 font-medium mb-0.5">{bulkResult.skipped.length} skipped:</p>
                  {bulkResult.skipped.map((s, i) => (
                    <p key={i} className="text-xs text-slate-500">{s.name} — {s.reason}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Instrument — hidden in bulk mode (comes from each student's profile) */}
            {!formBulkMode && (
            <div>
              <label className={labelCls}>Instrument</label>
              <input
                type="text"
                value={formInstrument}
                onChange={e => setFormInstrument(e.target.value)}
                className={inputCls}
                placeholder="e.g. Piano"
              />
            </div>
            )}

            {/* Payer Type */}
            <div>
              <label className={labelCls}>Payer</label>
              <select
                value={formPayerType}
                onChange={e => handlePayerTypeChange(e.target.value as EnrollmentPayerType)}
                className={selectCls}
              >
                {Object.entries(PAYER_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            {/* Lesson Type */}
            <div>
              <label className={labelCls}>Lesson Type</label>
              <select
                value={formLessonType}
                onChange={(e: any) => setFormLessonType(e.target.value)}
                className={selectCls}
              >
                <option value="Individual">Individual</option>
                <option value="Group">Group</option>
              </select>
            </div>

            {/* Delivery Mode */}
            <div>
              <label className={labelCls}>Delivery Mode</label>
              <select
                value={formDeliveryMode}
                onChange={(e: any) => setFormDeliveryMode(e.target.value)}
                className={selectCls}
              >
                <option value={DeliveryMode.IN_PERSON}>In-Person</option>
                <option value={DeliveryMode.ONLINE}>Online</option>
              </select>
            </div>
          </div>

          {/* ── Section 2: Enrollment Mode (Phase 19.6D2) ── */}
          <div className="border-t border-slate-800/60 pt-5 space-y-4">
            <div>
              <label className={labelCls}>Enrollment Mode</label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => handleModeSelect('period')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all border ${
                    formMode === 'period'
                      ? 'bg-primary-600/20 border-primary-500/50 text-primary-300'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-500'
                  }`}
                >
                  Use School Period
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSelect('custom')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all border ${
                    formMode === 'custom'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-500'
                  }`}
                >
                  Custom Enrollment
                </button>
              </div>
            </div>

            {/* Period mode: dropdown */}
            {formMode === 'period' && (
              <div>
                <label className={labelCls}>School Period</label>
                {!formSchoolId ? (
                  <p className="text-xs text-slate-500 mt-1">
                    Select a school first to see available periods.
                  </p>
                ) : availablePeriods.length === 0 ? (
                  <p className="text-xs text-amber-400 mt-1">
                    No active periods for this school. Switch to Custom or{' '}
                    <button
                      type="button"
                      onClick={() => navigate(isSchoolAdmin ? '/school/config' : '/admin/config')}
                      className="underline hover:text-amber-300"
                    >
                      create one
                    </button>
                    .
                  </p>
                ) : (
                  <>
                    <select
                      value={formPeriodId}
                      onChange={e => handlePeriodSelect(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">Select a period…</option>
                      {availablePeriods.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.startDate} → {p.endDate})
                        </option>
                      ))}
                    </select>
                    {/* Transparency indicator */}
                    {formPeriodId && !formIsDateOverride && (
                      <p className="text-xs text-emerald-400/80 mt-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        Prefilled from school period — dates and defaults are inherited.
                      </p>
                    )}
                    {formPeriodId && formIsDateOverride && (
                      <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        Custom override applied — dates differ from period defaults.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Custom mode: context note */}
            {formMode === 'custom' && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-amber-500/8 ring-1 ring-amber-500/20 rounded-xl">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <p className="text-xs text-amber-300/80">
                  Custom enrollment — dates and defaults must be set manually. No school period will be linked.
                </p>
              </div>
            )}
          </div>

          {/* ── Section 3: Dates (always shown; pre-filled in period mode) ── */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                Start Date *
                {formMode === 'period' && selectedPeriod && !formIsDateOverride && (
                  <span className="ml-1 text-emerald-500/60 normal-case font-normal">(from period)</span>
                )}
              </label>
              <input
                type="date"
                value={formStartDate}
                onChange={e => handleStartDateChange(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>
                End Date
                {formMode === 'period' && selectedPeriod && !formIsDateOverride && (
                  <span className="ml-1 text-emerald-500/60 normal-case font-normal">(from period)</span>
                )}
              </label>
              <input
                type="date"
                value={formEndDate}
                onChange={e => handleEndDateChange(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                Academic Year
                {formMode === 'period' && selectedPeriod && (
                  <span className="ml-1 text-emerald-500/60 normal-case font-normal">(from period)</span>
                )}
              </label>
              <input
                type="text"
                value={formAcademicYear}
                onChange={e => setFormAcademicYear(e.target.value)}
                className={inputCls}
                placeholder="e.g. 2025-2026"
              />
            </div>
            <div>
              <label className={labelCls}>
                Term
                {formMode === 'period' && selectedPeriod && (
                  <span className="ml-1 text-emerald-500/60 normal-case font-normal">(from period)</span>
                )}
              </label>
              <input
                type="text"
                value={formTerm}
                onChange={e => setFormTerm(e.target.value)}
                className={inputCls}
                placeholder="e.g. Term 1"
              />
            </div>
          </div>

          {/* ── Section 4: Lesson details ── */}
          <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                Total Lessons *
                {formMode === 'period' && selectedPeriod && !formIsLessonsOverride && (
                  <span className="ml-1 text-emerald-500/60 normal-case font-normal">(from period)</span>
                )}
              </label>
              <input
                type="number"
                value={formTotalLessons}
                onChange={e => setFormTotalLessons(Number(e.target.value))}
                className={inputCls}
                min="1"
                required
                disabled={formMode === 'period' && !!selectedPeriod && !formIsLessonsOverride}
              />
              <label className="mt-1.5 flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formIsLessonsOverride}
                  onChange={e => {
                    const on = e.target.checked;
                    setFormIsLessonsOverride(on);
                    if (!on && formMode === 'period' && selectedPeriod) {
                      setFormTotalLessons(selectedPeriod.defaultTotalLessons);
                    }
                  }}
                  className="rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/40"
                />
                <span className="text-[11px] text-slate-400">Override lessons for this student</span>
              </label>
            </div>
            <div>
              <label className={labelCls}>
                Duration (min)
                {formMode === 'period' && selectedPeriod && !formIsDurationOverride && (
                  <span className="ml-1 text-emerald-500/60 normal-case font-normal">(from period)</span>
                )}
              </label>
              <input
                type="number"
                value={formDuration}
                onChange={e => setFormDuration(Number(e.target.value))}
                className={inputCls}
                min="1"
                disabled={formMode === 'period' && !!selectedPeriod && !formIsDurationOverride}
              />
              <label className="mt-1.5 flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formIsDurationOverride}
                  onChange={e => {
                    const on = e.target.checked;
                    setFormIsDurationOverride(on);
                    if (!on && formMode === 'period' && selectedPeriod) {
                      setFormDuration(selectedPeriod.defaultDurationMinutes);
                    }
                  }}
                  className="rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/40"
                />
                <span className="text-[11px] text-slate-400">Override duration for this student</span>
              </label>
            </div>
          </div>

          {/* ── Section 5: Financial + admin fields ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Billing Status</label>
              <select
                value={formBillingStatus}
                onChange={(e: any) => setFormBillingStatus(e.target.value)}
                className={selectCls}
              >
                {Object.entries(BILLING_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Expected Price</label>
              <input
                type="number"
                value={formPriceExpected}
                onChange={e => setFormPriceExpected(e.target.value)}
                className={inputCls}
                placeholder="Optional"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={formStatus}
                onChange={(e: any) => setFormStatus(e.target.value)}
                className={selectCls}
              >
                {Object.values(EnrollmentStatus).map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <input
              type="text"
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              className={inputCls}
              placeholder="Optional admin notes"
            />
          </div>

          {/* ── Submit / Cancel ── */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary-900/20 transition-all active:scale-[0.98]"
            >
              {editingId ? 'Save Changes' : 'Create Enrollment'}
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

      {/* ── Auto-link prompt — appears after enrollment creation when unlinked lessons exist ── */}
      {pendingLink && (
        <div className="bg-amber-500/10 ring-1 ring-amber-500/30 rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 w-5 h-5 shrink-0 text-amber-400">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
              </svg>
            </span>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-amber-300">
                {pendingLink.label}
              </p>
              <p className="text-xs text-slate-400">
                These lessons are in the enrollment's date range but aren't linked to any enrollment yet.
                Link them now so they count toward this enrollment's progress?
              </p>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleLinkLessons}
              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/40 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            >
              Yes — link {pendingLink.pairs.length} lesson{pendingLink.pairs.length !== 1 ? 's' : ''}
            </button>
            <button
              onClick={() => { setPendingLink(null); resetForm(); }}
              className="px-4 py-2 bg-slate-800 ring-1 ring-white/10 text-slate-400 rounded-xl hover:bg-slate-700 text-sm font-medium transition-all"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ── Link result success banner ── */}
      {linkResult && (
        <div className="bg-emerald-500/10 ring-1 ring-emerald-500/30 rounded-2xl px-5 py-3 flex items-center justify-between">
          <p className="text-sm text-emerald-400 font-medium">
            ✓ {linkResult.linked} lesson{linkResult.linked !== 1 ? 's' : ''} linked to the enrollment.
          </p>
          <button
            onClick={() => setLinkResult(null)}
            className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Info: consumed statuses ── */}
      <p className="text-xs text-slate-600">
        Consumed statuses: {consumedStatusList}. Cancelled and Absent (Excused) do not consume slots.
      </p>

      {/* ── Enrollment List ── */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-10 text-center">
            <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.331 0 4.472.89 6.042 2.347M12 6.042A8.967 8.967 0 0118 3.75c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.347m0-14.305v14.305" />
            </svg>
            <p className="text-slate-500 text-sm">
              {filtered.length === 0 && enrollments.length === 0
                ? 'No enrollments yet. Create one to get started.'
                : 'No enrollments match your filters.'}
            </p>
          </div>
        )}

        {filtered.map(enrollment => {
          const { consumed, remaining } = getRemainingForEnrollment(enrollment);
          const progressPct = enrollment.totalLessons > 0
            ? Math.min(100, Math.round((consumed / enrollment.totalLessons) * 100))
            : 0;

          return (
            <div
              key={enrollment.id}
              className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5 hover:bg-slate-800/40 transition-colors"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Left: Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{enrollment.studentName}</span>
                    <span className="text-slate-700">·</span>
                    <span className="text-slate-400 text-sm">{enrollment.instrument}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[enrollment.status]}`}>
                      {enrollment.status}
                    </span>
                    {/* Phase 19.6D2: period / date badge */}
                    {enrollment.academicYear && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-700/50 text-slate-400">
                        {enrollment.academicYear}{enrollment.term ? ` · ${enrollment.term}` : ''}
                      </span>
                    )}
                    {enrollment.isDateOverride && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
                        Override
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap gap-x-1">
                    <span>Teacher: <span className="text-slate-400">{enrollment.teacherName}</span></span>
                    {enrollment.schoolName && <><span className="text-slate-700">·</span><span>School: <span className="text-slate-400">{enrollment.schoolName}</span></span></>}
                    {!enrollment.schoolId && <><span className="text-slate-700">·</span><span className="text-amber-500">Private</span></>}
                    <span className="text-slate-700">·</span>
                    <span>{enrollment.lessonType}</span>
                    <span className="text-slate-700">·</span>
                    <span className="tabular-nums">{enrollment.durationMinutes}min</span>
                    {enrollment.isDurationOverride && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20 font-medium">Custom</span>
                    )}
                    <span className="text-slate-700">·</span>
                    <span>{enrollment.deliveryMode === DeliveryMode.ONLINE ? 'Online' : 'In-Person'}</span>
                  </div>
                  {/* Phase 19.6D2: show dates if present */}
                  {(enrollment.startDate || enrollment.endDate) && (
                    <div className="text-xs text-slate-600 mt-0.5">
                      {enrollment.startDate && <span>{enrollment.startDate}</span>}
                      {enrollment.startDate && enrollment.endDate && <span className="mx-1">→</span>}
                      {enrollment.endDate && <span>{enrollment.endDate}</span>}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-1">
                    <span>Payer: <span className="text-slate-400">{PAYER_LABELS[enrollment.payerType]}</span></span>
                    <span className="text-slate-700">·</span>
                    <span>Billing: <span className="text-slate-400">{BILLING_LABELS[enrollment.billingStatus]}</span></span>
                    {enrollment.priceExpected != null && (
                      <><span className="text-slate-700">·</span><span>Expected: <span className="text-slate-400 tabular-nums">{formatCurrency(enrollment.priceExpected)}</span></span></>
                    )}
                  </div>
                  {enrollment.notes && (
                    <p className="text-xs text-slate-600 mt-1.5 italic">"{enrollment.notes}"</p>
                  )}
                  {/* Cross-link to linked invoices */}
                  {(() => {
                    const linkedInvoices = invoices.filter(inv => inv.enrollmentId === enrollment.id);
                    if (linkedInvoices.length === 0) return null;
                    return (
                      <div className="mt-1.5 flex items-center gap-2">
                        {linkedInvoices.map(inv => (
                          <button
                            key={inv.id}
                            onClick={e => { e.stopPropagation(); navigate('/admin/invoices'); }}
                            className="text-xs text-primary-400 hover:text-primary-300 underline transition-colors"
                          >
                            {inv.invoiceNumber}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Middle: Progress */}
                <div className="w-full md:w-48 shrink-0">
                  <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                    <span className="tabular-nums">{consumed} / {enrollment.totalLessons} consumed</span>
                    <span className={`tabular-nums font-medium ${remaining === 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {remaining} left
                    </span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${remaining === 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  {/* Link unlinked lessons button — shown when unlinked lessons exist in date range */}
                  {(() => {
                    const _today = new Date().toISOString().slice(0, 10);
                    const unlinkedCount = lessons.filter(l => {
                      if (!l.studentIds?.includes(enrollment.studentId)) return false;
                      if (l.date < enrollment.startDate) return false;
                      if (enrollment.endDate && l.date > enrollment.endDate) return false;
                      if (!l.enrollmentId) return true;
                      if (l.enrollmentId === enrollment.id) return false;
                      const linkedTo = enrollments.find(e => e.id === l.enrollmentId);
                      if (!linkedTo) return true;
                      if (isHistoricalEnrollment(linkedTo, _today)) return true;
                      return false;
                    }).length;
                    return unlinkedCount > 0 ? (
                      <button
                        onClick={() => handleRetroLink(enrollment)}
                        className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors px-3 py-1.5 bg-amber-500/5 ring-1 ring-amber-500/20 rounded-lg hover:bg-amber-500/10"
                      >
                        Link {unlinkedCount} lesson{unlinkedCount !== 1 ? 's' : ''}
                      </button>
                    ) : null;
                  })()}
                  <button
                    onClick={() => startEdit(enrollment)}
                    className="text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors px-3 py-1.5 bg-slate-800/60 ring-1 ring-white/5 rounded-lg hover:bg-slate-700/60"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(enrollment.id)}
                    className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors px-3 py-1.5 bg-red-500/5 ring-1 ring-red-500/10 rounded-lg hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
