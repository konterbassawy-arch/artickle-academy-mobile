import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback
} from 'react';

import { AppState, User, Role, School, Teacher, Student, Lesson, LessonStatus, Parent, Booking, BookingStatus, TimetableSlot, Enrollment, SchoolEnrollmentPeriod, Invoice, InvoiceStatus, Payment, PaymentStatus, PayrollRun, PayrollStatus, DeliveryMode, getDeliveryMode, findConflictingEnrollment, getTodayISO, isCurrentEnrollment } from '../types';
import { setPrimaryAssignment } from '../services/teachingAssignments';
import { resolveTeacherRate, resolveSchoolRate } from '../services/rateService';
import { getInvoicePaidAmount, resolveInvoiceStatusAfterPayment } from '../services/paymentService';
import { resolvePayrollStatusAfterSettlement } from '../services/payrollService';

// Firebase Imports using standard CDN (this project is CDN-based)
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
  updateDoc,
  writeBatch,
  getDocs,
  runTransaction,
  getDoc,
  deleteDoc,
  deleteField,
  addDoc,
  serverTimestamp,
  query,
  where
} from 'firebase/firestore';

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';

// ---------------------------
// Config
// ---------------------------

// Comma-separated emails that auto-become ADMIN on first login. Overridable per-environment
// via VITE_MASTER_ADMIN_EMAILS (e.g. to grant the dev partner admin in the dev project only).
const MASTER_ADMIN_EMAILS = (import.meta.env.VITE_MASTER_ADMIN_EMAILS || 'konterbassawy@gmail.com')
  .split(',')
  .map((e: string) => e.trim())
  .filter(Boolean);
const DEFAULT_CURRENCY = 'SAR';
const CURRENCY_SYMBOL = 'ر.س';

const toEmailId = (email: string) =>
  (email || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');

// Firebase credentials — loaded from env vars (VITE_FIREBASE_*) so the dev and production
// environments stay fully isolated. Copy .env.example to .env.local and fill in the values
// for the target project. The mobile dev workspace points at the `articklebeta` project;
// production keeps its own values. NEVER hardcode production credentials here.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Safety guard: refuse to start without an explicit project id, so this build can never
// silently fall back to — or accidentally connect to — the wrong (e.g. production) database.
if (!firebaseConfig.projectId) {
  throw new Error(
    'Missing Firebase config. Copy .env.example to .env.local and set the VITE_FIREBASE_* values.'
  );
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Secondary app for creating auth accounts without signing out the current admin
const secondaryApp = initializeApp(firebaseConfig, 'secondary');
const secondaryAuth = getAuth(secondaryApp);

// ---------------------------
// Helpers
// ---------------------------

const cleanData = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(cleanData);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, v === undefined ? null : cleanData(v)])
    );
  }
  return obj === undefined ? null : obj;
};

const normKey = (s: any) => String(s ?? '').trim().toLowerCase();

// Accepts: "Violin=4, Piano=2" -> { violin: 4, piano: 2 }
const parseGuaranteeText = (value: any): Record<string, { minHours: number; guaranteed: boolean }> => {
  const txt = String(value ?? '').trim();
  if (!txt) return {};
  const out: Record<string, { minHours: number; guaranteed: boolean }> = {};
  txt
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
    .forEach(pair => {
      const [kRaw, vRaw] = pair.split('=').map(x => x.trim());
      const k = normKey(kRaw);
      let hourStr = vRaw;
      // By default, if you specify bass=4, it means guarantee is ENABLED
      // Use bass=4! to explicitly DISABLE the guarantee
      let guaranteed = true;
      if (hourStr.endsWith('!')) {
        guaranteed = false;
        hourStr = hourStr.slice(0, -1).trim();
      }
      const n = Number(hourStr);
      if (!k) return;
      if (!Number.isFinite(n)) return;
      out[k] = { minHours: n, guaranteed };
    });
  return out;
};

const normalizeGuaranteeMap = (input: any): Record<string, { minHours: number; guaranteed: boolean }> => {
  if (!input) return {};
  if (typeof input === 'string') return parseGuaranteeText(input);
  const out: Record<string, { minHours: number; guaranteed: boolean }> = {};
  if (typeof input !== 'object') return out;
  Object.entries(input).forEach(([k, v]) => {
    const key = normKey(k);
    if (!key) return;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) out[key] = { minHours: v, guaranteed: true };
      return;
    }
    // support legacy nested objects { bass: { minHours: 4 } } or { bass: { minHours: 4, guaranteed: true } }
    if (v && typeof v === 'object') {
      const minHours = Number((v as any).minHours ?? (v as any).hours ?? (v as any).value);
      const guaranteed = (v as any).guaranteed !== false; // default to true if not specified
      if (Number.isFinite(minHours)) out[key] = { minHours, guaranteed };
    }
  });
  return out;
};

// ---------------------------
// Context types
// ---------------------------

interface AppContextType extends AppState {
  persistenceMode: 'local' | 'cloud' | 'syncing';
  authLoading: boolean;
  authError: string | null;
  login: (email: string, pass: string) => Promise<{ success: boolean; message?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  addLesson: (lessonData: Omit<Lesson, 'id'>) => Promise<void>;
  updateLesson: (id: string, data: Partial<Lesson>) => Promise<void>;
  updateLessonSchoolComment: (id: string, schoolAdminComment: string, schoolAdminInternalComment: string) => Promise<void>;
  // Phase 19.2C: Clears the unread flag — teacher only, own lesson, only when flag is set
  clearUnreadAdminNote: (lessonId: string) => Promise<void>;
  deleteLesson: (id: string) => Promise<void>;
  addSchool: (name: string, rate: number, groupRate: number, code: string) => Promise<{ success: boolean; message?: string }>;
  addUser: (user: Partial<User>, teacherDetails?: Partial<Teacher>) => Promise<{ success: boolean; message?: string }>;
  addStudent: (name: string, schoolId: string, teacherId: string, instrument: string) => Promise<{ success: boolean; message?: string }>;
  updateSchool: (id: string, data: Partial<School>) => Promise<void>;
  updateUser: (id: string, data: Partial<User>, teacherData?: Partial<Teacher>) => Promise<boolean>;
  updateStudent: (id: string, data: Partial<Student>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  deleteSchool: (id: string) => Promise<void>;
  deleteStudent: (id: string) => Promise<void>;
  processStudentImport: (
    data: any[],
    options?: { role?: Role; currentUserId?: string; schoolId?: string }
  ) => Promise<{ added: number; skipped: number; errors: number; updated: number }>;
  processLessonImport: (
    data: any[],
    options?: { role?: Role; currentUserId?: string; schoolId?: string }
  ) => Promise<{ added: number; skipped: number; errors: number; updated: number }>;
  formatCurrency: (amount: number) => string;
  getCurrency: () => string;
  getCurrencySymbol: () => string;
  // Phase 17.1: Dead financial functions removed (calculateGroupLessonFinancials,
  // calculateLessonFinancials, calculateTeacherEarnings, calculateSchoolRevenue).
  // All pages read snapshot fields directly. Rate resolution is in services/rateService.ts.
  repairSchoolRates: () => Promise<{ fixed: number; total: number; details: string[] }>;
  linkParentToStudents: (parentId: string, childIds: string[]) => Promise<{ success: boolean; message?: string }>;
  unlinkParentFromStudent: (parentId: string, childId: string) => Promise<{ success: boolean; message?: string }>;
  // Phase 14: Bookings
  addBooking: (bookingData: Omit<Booking, 'id'>) => Promise<{ success: boolean; bookingId?: string; message?: string }>;
  updateBooking: (id: string, data: Partial<Booking>) => Promise<void>;
  convertBookingToLesson: (bookingId: string, lessonOverrides?: Partial<Lesson>) => Promise<{ success: boolean; lessonId?: string; message?: string }>;
  // Phase 15: Timetable / Scheduling
  addTimetableSlot: (slot: Omit<TimetableSlot, 'id' | 'createdAt'>) => Promise<{ success: boolean; message?: string }>;
  updateTimetableSlot: (id: string, data: Partial<TimetableSlot>) => Promise<void>;
  deleteTimetableSlot: (id: string) => Promise<void>;
  generateLessonsFromTimetable: (startDate: string, endDate: string) => Promise<{ created: number; skipped: number; errors: number }>;
  // Phase 17.2: Enrollments
  addEnrollment: (data: Omit<Enrollment, 'id' | 'createdAt' | 'updatedAt'>) => Promise<{ success: boolean; enrollmentId?: string; message?: string }>;
  batchAddEnrollments: (
    template: Omit<Enrollment, 'id' | 'createdAt' | 'updatedAt' | 'studentId' | 'studentName' | 'instrument'>,
    students: { id: string; name: string; instrument: string; teacherId?: string; teacherName?: string }[]
  ) => Promise<{ created: number; createdEnrollments: { studentId: string; enrollmentId: string }[]; skipped: { name: string; reason: string }[] }>;
  // Phase 19.6D1: updateEnrollment returns a result so the write-time
  // conflict validation can surface a clear message to the caller.
  updateEnrollment: (id: string, data: Partial<Enrollment>) => Promise<{ success: boolean; message?: string }>;
  deleteEnrollment: (id: string) => Promise<void>;
  // Phase 19.6: School Enrollment Periods
  addSchoolEnrollmentPeriod: (data: Omit<SchoolEnrollmentPeriod, 'id' | 'createdAt' | 'updatedAt'>) => Promise<{ success: boolean; periodId?: string; message?: string }>;
  updateSchoolEnrollmentPeriod: (id: string, data: Partial<SchoolEnrollmentPeriod>) => Promise<void>;
  deleteSchoolEnrollmentPeriod: (id: string) => Promise<void>;
  // Phase 17.3: Invoices
  addInvoice: (data: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt'>) => Promise<{ success: boolean; invoiceId?: string; invoiceNumber?: string; message?: string }>;
  updateInvoice: (id: string, data: Partial<Invoice>) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  // Phase 17.4: Payments
  addPayment: (data: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>) => Promise<{ success: boolean; paymentId?: string; message?: string }>;
  updatePayment: (id: string, data: Partial<Payment>) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  // Phase 17.6: Payroll
  addPayrollRun: (data: Omit<PayrollRun, 'id' | 'payrollNumber' | 'createdAt' | 'updatedAt'>) => Promise<{ success: boolean; payrollId?: string; payrollNumber?: string; message?: string }>;
  updatePayrollRun: (id: string, data: Partial<PayrollRun>) => Promise<void>;
  deletePayrollRun: (id: string) => Promise<void>;
  // Phase 19.6D5B: Enrollment Review — link/unlink a lesson to an enrollment
  // Writes ONLY lesson.enrollmentId (+ updatedAt). Touches no other field.
  // Admin-only.
  updateLessonEnrollmentLink: (lessonId: string, enrollmentId: string | null) => Promise<{ success: boolean; message?: string }>;
  // Phase 19.6D5C: Batch variant — writes up to 200 lessons in chunked writeBatch calls (max 100 per chunk).
  // Returns { success, written, failed } where written + failed = pairs.length on completion.
  batchUpdateLessonEnrollmentLinks: (pairs: Array<{ lessonId: string; enrollmentId: string | null }>) => Promise<{ success: boolean; written: number; failed: number; message?: string }>;
}

const defaultState: AppState = {
  currentUser: null,
  users: [],
  schools: [],
  teachers: [],
  students: [],
  lessons: [],
  parents: [],
  bookings: [],
  timetableSlots: [],
  enrollments: [],
  schoolEnrollmentPeriods: [],
  invoices: [],
  payments: [],
  payrollRuns: [],
  lessonCounters: {}
};

const AppContext = createContext<AppContextType | undefined>(undefined);

// ---------------------------
// Provider
// ---------------------------

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(defaultState);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [persistenceMode, setPersistenceMode] = useState<'local' | 'cloud' | 'syncing'>('syncing');

  const listenersRef = useRef<(() => void)[]>([]);

  const stopListeners = useCallback(() => {
    listenersRef.current.forEach(u => {
      try { u(); } catch {}
    });
    listenersRef.current = [];
  }, []);

  const startListeners = useCallback((user: User | null) => {
    stopListeners();

    const withError = (name: string) => (err: any) => {
      console.error(`[Firestore:${name}]`, err);
      setPersistenceMode('local');
    };

    const isTeacherRole = user?.role === Role.TEACHER;
    const isParentRole = user?.role === Role.PARENT;
    const isStudentRole = user?.role === Role.STUDENT;
    const isSchoolAdminRole = user?.role === Role.SCHOOL_ADMIN;
    const userSchoolId = user?.schoolId; // for school_admin scoping

    // USERS — only admins see all users; teachers get own doc via Firestore rules
    listenersRef.current.push(
      onSnapshot(
        collection(db, 'users'),
        snap => {
          const users = snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
          setState(p => ({ ...p, users }));
          setPersistenceMode('cloud');
        },
        withError('users')
      )
    );

    // SCHOOLS
    listenersRef.current.push(
      onSnapshot(
        collection(db, 'schools'),
        snap => {
          let schools = snap.docs.map(d => ({ id: d.id, ...d.data() } as School));
          // Phase 10/11/12: Strip billing rates from non-admin state.
          // School admin: sees only OWN school with FULL rates (billing visible).
          if (isSchoolAdminRole && userSchoolId) {
            schools = schools.filter(s => s.id === userSchoolId);
            // School admin keeps full school data including rates
          } else if (isTeacherRole) {
            schools = schools.map(s => ({
              id: s.id, name: s.name, code: s.code,
            } as School));
          } else if (isParentRole || isStudentRole) {
            schools = schools.map(s => ({
              id: s.id, name: s.name,
            } as School));
          }
          setState(p => ({ ...p, schools }));
        },
        withError('schools')
      )
    );

    // TEACHERS
    // Teachers see only their own doc; parents/students see name+instrument only; admins see all
    const teachersSource = isTeacherRole && user
      ? query(collection(db, 'teachers'), where('__name__', '==', user.id))
      : collection(db, 'teachers');

    listenersRef.current.push(
      onSnapshot(
        teachersSource,
        snap => {
          let teachers = snap.docs.map(d => {
            const raw: any = d.data();
            return {
              id: d.id,
              ...raw,
              // normalize old fields
              baseRate: raw.baseRate ?? raw.defaultRate ?? 0,
              baseGroupRate: raw.baseGroupRate ?? raw.defaultGroupRate ?? 0,
              ratesBySchool: raw.ratesBySchool ?? raw.schoolRates ?? {},
              minimumDailyHoursByInstrument: normalizeGuaranteeMap(raw.minimumDailyHoursByInstrument)
            } as Teacher;
          });
          // Phase 11/12: Parents/students/school_admins see only teacher name + instrument — no rates
          if (isParentRole || isStudentRole || isSchoolAdminRole) {
            teachers = teachers.map(t => ({
              id: t.id, name: t.name, instrument: t.instrument,
            } as Teacher));
          }
          setState(p => ({ ...p, teachers }));
        },
        withError('teachers')
      )
    );

    // STUDENTS
    // Teachers see own students; school_admins see school students; admins see all
    const studentsSource = isTeacherRole && user
      ? query(collection(db, 'students'), where('teacherId', '==', user.id))
      : (isSchoolAdminRole && userSchoolId)
        ? query(collection(db, 'students'), where('schoolId', '==', userSchoolId))
        : collection(db, 'students');

    listenersRef.current.push(
      onSnapshot(
        studentsSource,
        snap => {
          const students = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
          setState(p => ({ ...p, students }));
        },
        withError('students')
      )
    );

    // LESSONS
    // Teachers see own; school_admins see their school's lessons; admins see all;
    // parents/students see all (filtered client-side by childIds/studentId)
    const lessonsSource = isTeacherRole && user
      ? query(collection(db, 'lessons'), where('teacherId', '==', user.id))
      : (isSchoolAdminRole && userSchoolId)
        ? query(collection(db, 'lessons'), where('schoolId', '==', userSchoolId))
        : collection(db, 'lessons');

    listenersRef.current.push(
      onSnapshot(
        lessonsSource,
        snap => {
          let lessons = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson));
          // Phase 10: Strip schoolRate from teacher state
          if (isTeacherRole) {
            lessons = lessons.map(l => ({ ...l, schoolRate: 0 }));
          }
          // Phase 11: Strip ALL financial data + private notes from parent/student state.
          if (isParentRole || isStudentRole) {
            lessons = lessons.map(l => ({
              ...l,
              schoolRate: 0,
              teacherRate: 0,
              notes: undefined,
              schoolAdminInternalComment: undefined, // Phase 19.2A: internal note hidden from parents/students
              hasUnreadAdminNote: undefined,         // Phase 19.2C: unread flag hidden from parents/students
            }));
          }
          // Phase 12: School admin sees schoolRate (billing) but NOT teacherRate (pay) or notes
          if (isSchoolAdminRole) {
            lessons = lessons.map(l => ({
              ...l,
              teacherRate: 0,
              notes: undefined,
            }));
          }
          lessons.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setState(p => ({ ...p, lessons }));
        },
        withError('lessons')
      )
    );

    // COUNTERS
    listenersRef.current.push(
      onSnapshot(
        collection(db, 'counters'),
        snap => {
          const counters: Record<string, number> = {};
          snap.docs.forEach(d => {
            counters[d.id] = Number((d.data() as any).count ?? (d.data() as any).last ?? 0) || 0;
          });
          setState(p => ({ ...p, lessonCounters: counters }));
        },
        withError('counters')
      )
    );

    // PARENTS
    // Admin: full list. Parent: own doc only. Teacher/Student: none.
    if (isParentRole && user) {
      // Parent sees only their own parent doc (for childIds linkage)
      listenersRef.current.push(
        onSnapshot(
          doc(db, 'parents', user.id),
          snap => {
            if (snap.exists()) {
              const parentDoc = { id: snap.id, ...snap.data() } as Parent;
              setState(p => ({ ...p, parents: [parentDoc] }));

              // Phase 11: Now filter students + lessons to only this parent's children
              const childIds = parentDoc.childIds || [];
              // Re-filter students to only children
              setState(p => ({
                ...p,
                students: p.students.filter(s => childIds.includes(s.id)),
                lessons: p.lessons.filter(l =>
                  l.studentIds?.some((sid: string) => childIds.includes(sid))
                ),
              }));

              // Phase 17.5: Parent enrollment listener — enrollments where studentId ∈ childIds
              // Firestore 'in' supports up to 30 values; safe for parent-child relationships.
              if (childIds.length > 0) {
                const enrollChildIds = childIds.slice(0, 30); // Firestore 'in' limit
                listenersRef.current.push(
                  onSnapshot(
                    query(collection(db, 'enrollments'), where('studentId', 'in', enrollChildIds)),
                    eSnap => {
                      let enrollments = eSnap.docs.map(d => ({ id: d.id, ...d.data() } as Enrollment));
                      // Secondary safety: strip notes, strip priceExpected when payer is school (not parent's bill)
                      enrollments = enrollments.map(e => ({
                        ...e,
                        notes: undefined,
                        createdBy: '',
                        priceExpected: e.payerType === 'parent' ? e.priceExpected : undefined,
                      } as any as Enrollment));
                      enrollments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                      setState(p => ({ ...p, enrollments }));
                    },
                    withError('enrollments-parent')
                  )
                );
              }
            }
          },
          withError('parents')
        )
      );
    } else if (!isTeacherRole && !isStudentRole && !isSchoolAdminRole) {
      // Admin only: full parent list (school_admin doesn't need parents)
      listenersRef.current.push(
        onSnapshot(
          collection(db, 'parents'),
          snap => {
            const parents = snap.docs.map(d => ({ id: d.id, ...d.data() } as Parent));
            setState(p => ({ ...p, parents }));
          },
          withError('parents')
        )
      );
    }

    // Phase 11: STUDENT — filter students + lessons to self only
    if (isStudentRole && user) {
      // After the students listener fires, re-filter to only this student's record
      // We use a secondary listener on students where uid matches
      listenersRef.current.push(
        onSnapshot(
          query(collection(db, 'students'), where('uid', '==', user.id)),
          snap => {
            const myStudents = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
            setState(p => ({ ...p, students: myStudents }));

            // Filter lessons to only those containing this student's doc IDs
            const myStudentIds = myStudents.map(s => s.id);
            if (myStudentIds.length > 0) {
              setState(p => ({
                ...p,
                lessons: p.lessons.filter(l =>
                  l.studentIds?.some((sid: string) => myStudentIds.includes(sid))
                ),
              }));

              // Phase 17.5: Student enrollment listener — enrollments where studentId matches
              // Firestore-level filter: only own enrollments
              listenersRef.current.push(
                onSnapshot(
                  query(collection(db, 'enrollments'), where('studentId', 'in', myStudentIds.slice(0, 30))),
                  eSnap => {
                    let enrollments = eSnap.docs.map(d => ({ id: d.id, ...d.data() } as Enrollment));
                    // Strip ALL financial/billing fields + notes for students
                    enrollments = enrollments.map(e => ({
                      ...e,
                      notes: undefined,
                      createdBy: '',
                      priceExpected: undefined,
                      billingStatus: undefined,
                      payerType: undefined,
                    } as any as Enrollment));
                    enrollments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                    setState(p => ({ ...p, enrollments }));
                  },
                  withError('enrollments-student')
                )
              );
            }
          },
          withError('students-self')
        )
      );
    }

    // Phase 14: BOOKINGS
    // Admin sees all; teacher sees own; parent sees own requests; student/school_admin see none
    if (!isStudentRole && !isSchoolAdminRole) {
      const bookingsSource = isTeacherRole && user
        ? query(collection(db, 'bookings'), where('teacherId', '==', user.id))
        : isParentRole && user
          ? query(collection(db, 'bookings'), where('requestedBy', '==', user.id))
          : collection(db, 'bookings'); // admin sees all

      listenersRef.current.push(
        onSnapshot(
          bookingsSource,
          snap => {
            const bookings = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
            bookings.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
            setState(p => ({ ...p, bookings }));
          },
          withError('bookings')
        )
      );
    }

    // Phase 15: TIMETABLE SLOTS
    // Admin sees all; teacher sees own; others don't need them
    if (!isParentRole && !isStudentRole && !isSchoolAdminRole) {
      const timetableSource = isTeacherRole && user
        ? query(collection(db, 'timetableSlots'), where('teacherId', '==', user.id))
        : collection(db, 'timetableSlots'); // admin sees all

      listenersRef.current.push(
        onSnapshot(
          timetableSource,
          snap => {
            const timetableSlots = snap.docs.map(d => ({ id: d.id, ...d.data() } as TimetableSlot));
            timetableSlots.sort((a, b) => (a.dayOfWeek * 10000 + parseInt(a.startTime.replace(':', '')))
              - (b.dayOfWeek * 10000 + parseInt(b.startTime.replace(':', ''))));
            setState(p => ({ ...p, timetableSlots }));
          },
          withError('timetableSlots')
        )
      );
    }

    // Phase 17.2: ENROLLMENTS
    // Admin + Teacher: all (teacher needs enrollment circles on student detail).
    // Parent: childIds-based (set up in parent doc listener below).
    // Student: own studentId (set up in student listener below). School admin: none.
    if (!isParentRole && !isStudentRole && !isSchoolAdminRole) {
      // Admin / Teacher: full collection
      listenersRef.current.push(
        onSnapshot(
          collection(db, 'enrollments'),
          snap => {
            let enrollments = snap.docs.map(d => ({ id: d.id, ...d.data() } as Enrollment));
            // Strip financial data from teacher view (same as parent)
            if (isTeacherRole) {
              enrollments = enrollments.map(e => ({
                ...e,
                notes: undefined,
                priceExpected: undefined,
              } as any as Enrollment));
            }
            enrollments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setState(p => ({ ...p, enrollments }));
          },
          withError('enrollments')
        )
      );
    }
    // Parent enrollment listener is set up inside the parent doc listener (needs childIds).
    // Student enrollment listener is set up inside the student self-listener (needs studentId).

    // Phase 19.6: SCHOOL ENROLLMENT PERIODS
    // Admin + School admin + Teacher: period definitions for enrollment circles.
    // Parents/students don't need period definitions.
    if (!isParentRole && !isStudentRole) {
      const periodsSource = isSchoolAdminRole && user?.schoolId
        ? query(collection(db, 'schoolEnrollmentPeriods'), where('schoolId', '==', user.schoolId))
        : collection(db, 'schoolEnrollmentPeriods'); // admin sees all
      listenersRef.current.push(
        onSnapshot(
          periodsSource,
          snap => {
            const schoolEnrollmentPeriods = snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolEnrollmentPeriod));
            // Sort: active first, then by startDate descending (newest period first)
            schoolEnrollmentPeriods.sort((a, b) => {
              if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
              return (b.startDate || '').localeCompare(a.startDate || '');
            });
            setState(p => ({ ...p, schoolEnrollmentPeriods }));
          },
          withError('schoolEnrollmentPeriods')
        )
      );
    }

    // Phase 17.3: INVOICES
    // Admin: all. Parent: payerId=self + payerType=parent. School admin: payerId=schoolId + payerType=school.
    // Student/Teacher: none.
    if (!isTeacherRole && !isParentRole && !isStudentRole && !isSchoolAdminRole) {
      // Admin: full collection
      listenersRef.current.push(
        onSnapshot(
          collection(db, 'invoices'),
          snap => {
            const invoices = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
            invoices.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setState(p => ({ ...p, invoices }));
          },
          withError('invoices')
        )
      );
    } else if (isParentRole && user) {
      // Parent: B2C invoices — Firestore-level filter by payerId + payerType.
      // Phase 17.4: payment listener is set up inside this callback once invoice IDs are known.
      let unsubParentPayments: (() => void) | null = null;
      listenersRef.current.push(
        onSnapshot(
          query(collection(db, 'invoices'),
            where('payerId', '==', user.id),
            where('payerType', '==', 'parent')
          ),
          snap => {
            let invoices = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
            // Secondary safety: strip admin notes + createdBy
            invoices = invoices.map(inv => ({ ...inv, notes: undefined, createdBy: '' } as any as Invoice));
            invoices.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setState(p => ({ ...p, invoices }));

            // Tear down previous payment listener before creating a new one
            if (unsubParentPayments) { unsubParentPayments(); unsubParentPayments = null; }
            const invoiceIds = snap.docs.map(d => d.id);
            if (invoiceIds.length === 0) {
              setState(p => ({ ...p, payments: [] }));
              return;
            }
            // TODO: Firestore 'in' queries support max 30 values. Parents with >30 invoices
            // will only see payments for the 30 most recent invoice IDs. Full batching
            // (multiple listeners merged) should be implemented when that threshold is a concern.
            unsubParentPayments = onSnapshot(
              query(collection(db, 'payments'), where('invoiceId', 'in', invoiceIds.slice(0, 30))),
              pSnap => {
                let payments = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
                // Strip notes + reference: parents are consumers and do not need internal bank refs
                payments = payments.map(pay => ({ ...pay, notes: undefined, reference: undefined } as any as Payment));
                payments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                setState(p => ({ ...p, payments }));
              },
              withError('payments-parent')
            );
            listenersRef.current.push(unsubParentPayments);
          },
          withError('invoices-parent')
        )
      );
    } else if (isSchoolAdminRole && userSchoolId) {
      // School admin: B2B invoices — Firestore-level filter by payerId + payerType.
      // Phase 17.4: payment listener is set up inside this callback once invoice IDs are known.
      let unsubSchoolPayments: (() => void) | null = null;
      listenersRef.current.push(
        onSnapshot(
          query(collection(db, 'invoices'),
            where('payerId', '==', userSchoolId),
            where('payerType', '==', 'school')
          ),
          snap => {
            let invoices = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
            // Secondary safety: strip admin notes + createdBy
            invoices = invoices.map(inv => ({ ...inv, notes: undefined, createdBy: '' } as any as Invoice));
            invoices.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setState(p => ({ ...p, invoices }));

            // Tear down previous payment listener before creating a new one
            if (unsubSchoolPayments) { unsubSchoolPayments(); unsubSchoolPayments = null; }
            const invoiceIds = snap.docs.map(d => d.id);
            if (invoiceIds.length === 0) {
              setState(p => ({ ...p, payments: [] }));
              return;
            }
            // TODO: Firestore 'in' queries support max 30 values. School admins with >30 invoices
            // will only see payments for the 30 most recent invoice IDs. Full batching
            // (multiple listeners merged) should be implemented when that threshold is a concern.
            unsubSchoolPayments = onSnapshot(
              query(collection(db, 'payments'), where('invoiceId', 'in', invoiceIds.slice(0, 30))),
              pSnap => {
                let payments = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
                // Strip notes only. reference (bank ref/transaction ID) is intentionally kept:
                // school admins are B2B partners who need it for payment reconciliation.
                payments = payments.map(pay => ({ ...pay, notes: undefined } as any as Payment));
                payments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                setState(p => ({ ...p, payments }));
              },
              withError('payments-school')
            );
            listenersRef.current.push(unsubSchoolPayments);
          },
          withError('invoices-school')
        )
      );
    }
    // Student/Teacher: no invoice listener (stays empty [])

    // Phase 17.4: PAYMENTS
    // Admin: full collection. Parent + school admin: handled inside invoice callbacks above.
    // Student/Teacher: none.
    if (!isTeacherRole && !isParentRole && !isStudentRole && !isSchoolAdminRole) {
      // Admin: full collection
      listenersRef.current.push(
        onSnapshot(
          collection(db, 'payments'),
          snap => {
            const payments = snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
            payments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setState(p => ({ ...p, payments }));
          },
          withError('payments')
        )
      );
    }
    // Parent + school admin: payment listeners set up inside invoice callbacks above
    // Student/Teacher: no payment listener (stays empty [])

    // Phase 17.6: PAYROLL RUNS
    // Admin: all. Teacher: own payroll runs only (notes stripped). Others: none.
    if (!isParentRole && !isStudentRole && !isSchoolAdminRole) {
      const payrollSource = isTeacherRole && user
        ? query(collection(db, 'payrollRuns'), where('teacherId', '==', user.id))
        : collection(db, 'payrollRuns'); // admin sees all

      listenersRef.current.push(
        onSnapshot(
          payrollSource,
          snap => {
            let payrollRuns = snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRun));
            // Teacher: strip admin notes
            if (isTeacherRole) {
              payrollRuns = payrollRuns.map(pr => ({ ...pr, notes: undefined } as any as PayrollRun));
            }
            payrollRuns.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setState(p => ({ ...p, payrollRuns }));
          },
          withError('payrollRuns')
        )
      );
    }
    // Parent/Student/SchoolAdmin: no payroll listener (stays empty [])
  }, [stopListeners]);

  // AUTH BOOTSTRAP
  useEffect(() => {
    setPersistenceMode('syncing');

    const unsub = onAuthStateChanged(auth, async fbUser => {
      setAuthLoading(true);
      setAuthError(null);
      try {
        if (!fbUser) {
          stopListeners();
          setState(defaultState);
          setPersistenceMode('local');
          return;
        }

        const email = (fbUser.email || '').trim().toLowerCase();
        const emailId = toEmailId(email);

        // Ensure user is authorized in /users (invite-only)
        const userDocRef = doc(db, 'users', emailId);
        const snap = await getDoc(userDocRef);

        // Auto-create master admin
        if (!snap.exists() && MASTER_ADMIN_EMAILS.includes(email)) {
          const admin: User = {
            id: emailId,
            email,
            name: 'Master Admin',
            role: Role.ADMIN
          } as any;
          await setDoc(userDocRef, cleanData(admin), { merge: true });
        }

        const snap2 = await getDoc(userDocRef);
        if (!snap2.exists()) {
          await signOut(auth);
          stopListeners();
          setState(defaultState);
          setAuthError('Not authorized. Ask admin to authorize your email first.');
          setPersistenceMode('local');
          return;
        }

        // Record Firebase Auth UID and last login timestamp on the user document.
        if (fbUser.uid) {
          setDoc(userDocRef, { uid: fbUser.uid, lastLogin: Date.now() }, { merge: true }).catch(() => {
            // Non-fatal — captured on next login if this fails.
          });
        }

        const currentUser = { id: emailId, ...(snap2.data() as any), uid: fbUser.uid } as User;
        setState(p => ({ ...p, currentUser }));
        startListeners(currentUser);
        setPersistenceMode('cloud');
      } catch (e: any) {
        console.error('auth bootstrap failed', e);
        setAuthError(e?.message || 'Authentication error');
        setPersistenceMode('local');
      } finally {
        setAuthLoading(false);
      }
    });

    return () => {
      unsub();
      stopListeners();
    };
  }, [startListeners, stopListeners]);

  // ---------------------------
  // Currency
  // ---------------------------

  const getCurrency = () => DEFAULT_CURRENCY;
  const getCurrencySymbol = () => CURRENCY_SYMBOL;
  const formatCurrency = (amount: number) => `${CURRENCY_SYMBOL} ${Number(amount || 0).toFixed(2)}`;

  // ---------------------------
  // Counters
  // ---------------------------

  const reserveCounterRange = async (counterKey: string, count: number) => {
    const ref = doc(db, 'counters', counterKey);
    return await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      const last = Number(snap.exists() ? (snap.data() as any).last ?? (snap.data() as any).count : 0) || 0;
      const start = last + 1;
      tx.set(ref, { last: last + count }, { merge: true });
      return start;
    });
  };

  const generateTeacherCode = async () => {
    const start = await reserveCounterRange('teachers', 1);
    return `TE_${String(start).padStart(3, '0')}`;
  };

  const generateStudentId = async (schoolCode: string) => {
    const code = String(schoolCode || '').trim().toUpperCase();
    const start = await reserveCounterRange(`students_${code}`, 1);
    return `ST_${code}_${String(start).padStart(3, '0')}`;
  };

  // ---------------------------
  // CRUD
  // ---------------------------

  const addSchool = async (name: string, rate: number, groupRate: number, code: string) => {
    try {
      const trimmedName = String(name || '').trim();
      const trimmedCode = String(code || '').trim().toUpperCase();
      if (!trimmedName) return { success: false, message: 'School name is required.' };
      if (!trimmedCode) return { success: false, message: 'School code is required.' };

      const ref = await addDoc(
        collection(db, 'schools'),
        cleanData({
          name: trimmedName,
          code: trimmedCode,
          defaultRate: Number(rate) || 0,
          defaultGroupRate: Number(groupRate) || 0,
          createdAt: serverTimestamp()
        })
      );

      await setDoc(doc(db, 'schools', ref.id), cleanData({ id: ref.id }), { merge: true });
      return { success: true };
    } catch (e: any) {
      console.error('addSchool failed', e);
      return { success: false, message: e?.message || 'Failed to add school.' };
    }
  };

  const addUser = async (user: Partial<User>, teacherDetails?: Partial<Teacher>, password?: string) => {
    try {
      const email = String(user.email || '').trim().toLowerCase();
      if (!email) return { success: false, message: 'Email is required.' };
      if (!user.role) return { success: false, message: 'Role is required.' };

      // Create Firebase Auth account if password provided
      // Uses secondary auth instance so the current admin session is preserved
      if (password) {
        try {
          await createUserWithEmailAndPassword(secondaryAuth, email, password);
          // Sign out the secondary auth immediately — we don't need a session on it
          await signOut(secondaryAuth);
        } catch (authErr: any) {
          // auth/email-already-in-use is OK — the Firestore doc may need updating
          if (authErr?.code !== 'auth/email-already-in-use') {
            return { success: false, message: authErr?.message || 'Failed to create auth account.' };
          }
        }
      }

      const id = toEmailId(email);
      const finalUser: any = {
        id,
        email,
        name: user.name || user.username || email,
        username: user.username || email,
        role: user.role
      };

      await setDoc(doc(db, 'users', id), cleanData(finalUser), { merge: true });

      if (user.role === Role.TEACHER) {
        const code = (teacherDetails as any)?.code || (await generateTeacherCode());
        const teacher: any = {
          id,
          name: finalUser.name,
          code,
          instrument: (teacherDetails as any)?.instrument || '',
          baseRate: Number((teacherDetails as any)?.baseRate ?? (teacherDetails as any)?.defaultRate) || 0,
          baseGroupRate:
            Number((teacherDetails as any)?.baseGroupRate ?? (teacherDetails as any)?.defaultGroupRate) || 0,
          ratesBySchool: (teacherDetails as any)?.ratesBySchool ?? (teacherDetails as any)?.schoolRates ?? {},
          minimumDailyHoursByInstrument: normalizeGuaranteeMap((teacherDetails as any)?.minimumDailyHoursByInstrument),
          // Phase 16: Online lesson configuration
          supportsOnline: (teacherDetails as any)?.supportsOnline || false,
          onlineRate: Number((teacherDetails as any)?.onlineRate) || 0,
          onlineGroupRate: Number((teacherDetails as any)?.onlineGroupRate) || 0,
          onlineRatesBySchool: (teacherDetails as any)?.onlineRatesBySchool ?? {}
        };
        await setDoc(doc(db, 'teachers', id), cleanData(teacher), { merge: true });
      }

      // Phase 9: Create parent doc when role is parent
      // Phase 9.1: Generate human-readable parentId (PAR-NNN)
      if (user.role === Role.PARENT) {
        const parentSeq = await reserveCounterRange('parents', 1);
        const parentId = `PAR-${String(parentSeq).padStart(3, '0')}`;
        const parent: any = {
          id,
          parentId,
          name: finalUser.name,
          email,
          phone: (user as any)?.phone || '',
          childIds: []
        };
        await setDoc(doc(db, 'parents', id), cleanData(parent), { merge: true });
      }

      // Phase 9: Store schoolId on user doc when role is school_admin
      if (user.role === Role.SCHOOL_ADMIN && (user as any)?.schoolId) {
        await setDoc(doc(db, 'users', id), { schoolId: (user as any).schoolId }, { merge: true });
      }

      return { success: true };
    } catch (e: any) {
      console.error('addUser failed', e);
      return { success: false, message: e?.message || 'Failed to add user.' };
    }
  };

  // Phase 19.4C: strip non-digit characters, return digits-only string or undefined
  const normaliseGrade = (raw: string | undefined | null): string | undefined => {
    if (!raw) return undefined;
    const digits = String(raw).replace(/\D/g, '');
    return digits || undefined;
  };

  // Phase 19.4B: optional extra fields (yearGrade, email, dateOfBirth)
  const addStudent = async (
    name: string,
    schoolId: string,
    teacherId: string,
    instrument: string,
    extra?: { yearGrade?: string; email?: string; dateOfBirth?: string },
  ) => {
    try {
      const nm = String(name || '').trim();
      if (!nm) return { success: false, message: 'Student name is required.' };
      if (!teacherId) return { success: false, message: 'Teacher is required.' };
      const inst = String(instrument || '').trim();
      if (!inst) return { success: false, message: 'Instrument is required.' };

      let id: string;

      // Phase 9.1: Private students (no school) get PV-NNN prefix
      if (!schoolId) {
        const pvSeq = await reserveCounterRange('students_PV', 1);
        id = `PV-${String(pvSeq).padStart(3, '0')}`;
      } else {
        const school = state.schools.find(s => s.id === schoolId) as any;
        const schoolCode = String(school?.code || '').trim();
        if (!schoolCode) return { success: false, message: 'School code is missing.' };
        id = await generateStudentId(schoolCode);
      }

      // Phase 19.4B/C: sanitise extra fields — normalise grade to digits-only, normalise email
      const enriched: Record<string, any> = {};
      const normGrade = normaliseGrade(extra?.yearGrade);
      if (normGrade) enriched.yearGrade = normGrade;
      if (extra?.email?.trim()) enriched.email = extra.email.trim().toLowerCase();
      if (extra?.dateOfBirth?.trim()) enriched.dateOfBirth = extra.dateOfBirth.trim().substring(0, 10);

      await setDoc(
        doc(db, 'students', id),
        cleanData({ id, name: nm, schoolId: schoolId || '', teacherId, instrument: inst, ...enriched }),
        { merge: true }
      );

      // P5 dual-write: initialise the primary teaching assignment immediately.
      // Non-fatal — assignment can be back-filled if this fails.
      try {
        await setPrimaryAssignment(
          { id, schoolId: schoolId || '', teachingAssignments: undefined },
          teacherId,
          inst,
        );
      } catch (assignErr) {
        console.warn('addStudent: teaching assignment init failed (non-fatal)', assignErr);
      }

      return { success: true };
    } catch (e: any) {
      console.error('addStudent failed', e);
      return { success: false, message: e?.message || 'Failed to add student.' };
    }
  };

  const updateSchool = async (id: string, data: Partial<School>) => {
    await setDoc(doc(db, 'schools', id), cleanData(data), { merge: true });
  };

  const updateStudent = async (id: string, data: Partial<Student>) => {
    await setDoc(doc(db, 'students', id), cleanData(data), { merge: true });

    // P5 dual-write: if teacher or instrument changed, update primary assignment.
    if (data.teacherId !== undefined || data.instrument !== undefined) {
      const existing = state.students.find(s => s.id === id);
      if (existing) {
        const newTeacherId = data.teacherId ?? existing.teacherId;
        const newInstrument = data.instrument ?? existing.instrument;
        if (newTeacherId) {
          setPrimaryAssignment(
            {
              id,
              schoolId: data.schoolId ?? existing.schoolId,
              teachingAssignments: existing.teachingAssignments,
            },
            newTeacherId,
            newInstrument,
          ).catch(err => {
            console.warn('updateStudent: teaching assignment sync failed (non-fatal)', err);
          });
        }
      }
    }
  };

  const updateUser = async (id: string, data: Partial<User>, teacherData?: Partial<Teacher>) => {
    try {
      await setDoc(doc(db, 'users', id), cleanData(data), { merge: true });

      if (!teacherData) return true;

      // Read existing teacher doc if present (for merge)
      const existingTeacher: any = state.teachers.find(t => t.id === id) || {};

      // Rates
      const baseRate =
        Number((teacherData as any).baseRate ?? (teacherData as any).defaultRate ?? existingTeacher.baseRate ?? existingTeacher.defaultRate ?? 0) || 0;
      const baseGroupRate =
        Number((teacherData as any).baseGroupRate ?? (teacherData as any).defaultGroupRate ?? existingTeacher.baseGroupRate ?? existingTeacher.defaultGroupRate ?? 0) || 0;
      const ratesBySchool =
        (teacherData as any).ratesBySchool ?? (teacherData as any).schoolRates ?? existingTeacher.ratesBySchool ?? existingTeacher.schoolRates ?? {};

      // Guarantee (accept map or string)
      const incomingGuaranteeRaw =
        (teacherData as any).minimumDailyHoursByInstrument ??
        (teacherData as any).minimumDailyHoursText ??
        (teacherData as any).dailyMinimumGuarantee ??
        null;

      const incomingMap = normalizeGuaranteeMap(incomingGuaranteeRaw);
      const instrumentKey = normKey((teacherData as any).instrument ?? existingTeacher.instrument);

      // Hard guard: if guarantee supplied but no instrument, refuse
      const hasGuaranteeUpdate = incomingGuaranteeRaw !== null && (typeof incomingGuaranteeRaw === 'string' ? String(incomingGuaranteeRaw).trim() !== '' : true);
      if (hasGuaranteeUpdate && !instrumentKey) {
        throw new Error('Cannot save guarantee hours: teacher instrument is missing.');
      }

      const mergedGuarantee: Record<string, { minHours: number; guaranteed: boolean }> = {
        ...(existingTeacher.minimumDailyHoursByInstrument ?? {})
      };
      // Only keep the teacher's instrument key to avoid mismatches
      if (instrumentKey && Object.prototype.hasOwnProperty.call(incomingMap, instrumentKey)) {
        // Store the full object with minHours and guaranteed properties
        mergedGuarantee[instrumentKey] = incomingMap[instrumentKey];
      }

      // Phase 16: Online lesson configuration
      const supportsOnline = (teacherData as any).supportsOnline ?? existingTeacher.supportsOnline ?? false;
      const onlineRate = Number((teacherData as any).onlineRate ?? existingTeacher.onlineRate) || 0;
      const onlineGroupRate = Number((teacherData as any).onlineGroupRate ?? existingTeacher.onlineGroupRate) || 0;
      const onlineRatesBySchool = (teacherData as any).onlineRatesBySchool ?? existingTeacher.onlineRatesBySchool ?? {};

      // Phase 17.G fix: When guaranteesBySchool is explicitly provided (admin saved
      // the new guarantee editor), clear the legacy field so payroll no longer falls
      // back to it. Only clear on intentional new-format save, not on every edit.
      const hasNewGuarantees = (teacherData as any).guaranteesBySchool !== undefined;

      const updatedTeacher: any = {
        id,
        ...teacherData,
        baseRate,
        baseGroupRate,
        ratesBySchool,
        minimumDailyHoursByInstrument: hasNewGuarantees ? null : mergedGuarantee,
        // backward fields
        defaultRate: baseRate,
        defaultGroupRate: baseGroupRate,
        schoolRates: ratesBySchool,
        // Phase 16: Online fields
        supportsOnline,
        onlineRate,
        onlineGroupRate,
        onlineRatesBySchool
      };

      const cleaned = cleanData(updatedTeacher);
      // Apply deleteField() AFTER cleanData so the sentinel isn't destroyed
      // by recursive object processing. deleteField() must be passed directly
      // to Firestore as a FieldValue sentinel.
      if (hasNewGuarantees) {
        cleaned.minimumDailyHoursByInstrument = deleteField();
        // Remove guaranteesBySchool from the merged write — deep merge would
        // preserve stale instrument keys inside the nested map. Instead, we
        // fully replace it with a separate updateDoc call below.
        delete cleaned.guaranteesBySchool;
      }

      await setDoc(doc(db, 'teachers', id), cleaned, { merge: true });

      // Fully replace guaranteesBySchool in a separate updateDoc so Firestore
      // overwrites the entire nested map instead of deep-merging it.
      if (hasNewGuarantees) {
        await updateDoc(doc(db, 'teachers', id), {
          guaranteesBySchool: (teacherData as any).guaranteesBySchool || {}
        });
      }
      return true;
    } catch (e: any) {
      console.error('updateUser failed', e);
      return false;
    }
  };

  const deleteUser = async (id: string) => {
    await deleteDoc(doc(db, 'users', id));
    await deleteDoc(doc(db, 'teachers', id));
  };

  const deleteSchool = async (id: string) => {
    await deleteDoc(doc(db, 'schools', id));
  };

  const deleteStudent = async (id: string) => {
    await deleteDoc(doc(db, 'students', id));
  };

  // ---------------------------
  // Lessons
  // ---------------------------

  const addLesson = async (lessonData: Omit<Lesson, 'id'>) => {
    // Phase 17.G: Human-readable lesson ID
    // Format: LES-YYYYMMDD-HHmm_CYYYYMMDD-HHmm_xxxx
    //   LES-<taught date>-<taught time>_C<created date>-<created time>_<random>
    const rnd = Math.random().toString(36).slice(2, 6);
    const now = new Date();
    const createdPart = `C${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    let id: string;
    try {
      const dateStr = String((lessonData as any).date || '');
      // Expect "YYYY-MM-DDTHH:mm" or similar parseable format
      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) throw new Error('invalid date');
      const taughtPart = `${parsed.getFullYear()}${String(parsed.getMonth()+1).padStart(2,'0')}${String(parsed.getDate()).padStart(2,'0')}-${String(parsed.getHours()).padStart(2,'0')}${String(parsed.getMinutes()).padStart(2,'0')}`;
      id = `LES-${taughtPart}_${createdPart}_${rnd}`;
    } catch {
      // Fallback: old format if date is missing or malformed
      id = `lesson_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
    const finalData: any = { id, ...lessonData, createdAt: Date.now() };

    // Phase 15: deliveryMode safety net — all creation paths should provide it,
    // but if somehow missing, default to in_person and warn.
    if (!finalData.deliveryMode) {
      console.warn('addLesson: deliveryMode missing — defaulting to in_person. All creation paths must provide deliveryMode.');
      finalData.deliveryMode = DeliveryMode.IN_PERSON;
    }

    // Phase 17.1: Compute schoolRate server-side via resolveSchoolRate.
    // Teachers never have school billing rates in their state, so addLesson reads
    // the school doc from Firestore directly to resolve the correct hourly rate.
    if ((!finalData.schoolRate || finalData.schoolRate === 0) && finalData.status !== 'Cancelled' && finalData.status !== 'Absent (Excused)') {
      try {
        const schoolSnap = await getDoc(doc(db, 'schools', finalData.schoolId));
        if (schoolSnap.exists()) {
          const schoolData = schoolSnap.data() as any;
          const durationHours = (finalData.durationMinutes || 60) / 60;
          const firstStudent = state.students.find(s => finalData.studentIds?.includes(s.id));
          const teacher = state.teachers.find(t => t.id === finalData.teacherId);
          const instrument = firstStudent?.instrument || teacher?.instrument || '';
          const hourlySchoolRate = resolveSchoolRate(
            schoolData as any,
            finalData.teacherId,
            instrument,
            finalData.type,
            getDeliveryMode(finalData)
          );
          const studentCount = (finalData.studentIds?.length || 1);
          finalData.schoolRate = parseFloat((hourlySchoolRate * durationHours * (finalData.type === 'Group' ? studentCount : 1)).toFixed(2));
        }
      } catch (e) {
        console.error('addLesson: failed to compute schoolRate', e);
      }
    }

    // Auto-link to active enrollment if the student has one covering this lesson date
    if (!finalData.enrollmentId && finalData.studentIds?.length) {
      const lessonDate = finalData.date?.slice?.(0, 10) || '';
      if (lessonDate) {
        const today = new Date().toISOString().slice(0, 10);
        // For each student, find matching active enrollments
        // Prefer individual enrollments (no schoolPeriodId) over school-period ones
        for (const sid of finalData.studentIds) {
          const matching = state.enrollments.filter(e =>
            e.studentId === sid &&
            isCurrentEnrollment(e, today) &&
            lessonDate >= e.startDate &&
            (!e.endDate || lessonDate <= e.endDate)
          );
          // Prefer individual enrollment (no schoolPeriodId)
          const individual = matching.find(e => !e.schoolPeriodId);
          const linked = individual || matching[0];
          if (linked) {
            finalData.enrollmentId = linked.id;
            break; // Use first student's enrollment for the lesson
          }
        }
      }
    }

    await setDoc(doc(db, 'lessons', id), cleanData(finalData), { merge: true });
  };

  const updateLesson = async (id: string, data: Partial<Lesson>) => {
    await updateDoc(doc(db, 'lessons', id), cleanData(data));
  };

  const repairSchoolRates = async (): Promise<{ fixed: number; total: number; details: string[] }> => {
    const details: string[] = [];
    let fixed = 0;
    const billable = state.lessons.filter(l =>
      l.schoolId &&
      l.status !== LessonStatus.CANCELLED &&
      l.status !== LessonStatus.ABSENT_EXCUSED
    );

    const schoolCache: Record<string, any> = {};
    for (const school of state.schools) {
      const snap = await getDoc(doc(db, 'schools', school.id));
      if (snap.exists()) schoolCache[school.id] = snap.data();
    }

    for (const lesson of billable) {
      const schoolData = schoolCache[lesson.schoolId];
      if (!schoolData) continue;

      const teacher = state.teachers.find(t => t.id === lesson.teacherId);
      const firstStudent = state.students.find(s => lesson.studentIds?.includes(s.id));
      const instrument = firstStudent?.instrument || teacher?.instrument || '';
      const durationHours = (lesson.durationMinutes || 60) / 60;
      const hourlyRate = resolveSchoolRate(
        schoolData as any, lesson.teacherId, instrument,
        lesson.type, getDeliveryMode(lesson)
      );
      const studentCount = lesson.studentIds?.length || 1;
      const multiplier = lesson.type === 'Group' ? studentCount : 1;
      const correctRate = parseFloat((hourlyRate * durationHours * multiplier).toFixed(2));

      if (Math.abs((lesson.schoolRate || 0) - correctRate) > 0.01) {
        await updateDoc(doc(db, 'lessons', lesson.id), { schoolRate: correctRate });
        details.push(`${lesson.id}: ${lesson.schoolRate} → ${correctRate} (${lesson.studentNames?.[0] || 'unknown'})`);
        fixed++;
      }
    }

    return { fixed, total: billable.length, details };
  };

  // Phase 19.2A: Scoped update for school admin — ONLY the two allowed fields
  // Phase 19.2C: Sets hasUnreadAdminNote=true only when internal comment actually changes;
  //              clears it when internal comment is emptied; leaves it untouched if unchanged.
  const updateLessonSchoolComment = async (
    id: string,
    schoolAdminComment: string,
    schoolAdminInternalComment: string
  ) => {
    // Compare against current in-memory value to detect a real change
    const currentLesson = state.lessons.find(l => l.id === id);
    const prevInternal = currentLesson?.schoolAdminInternalComment ?? '';
    const newInternal = schoolAdminInternalComment;

    const updatePayload: Record<string, any> = {
      schoolAdminComment,
      schoolAdminInternalComment,
    };

    if (newInternal.trim() === '') {
      // Internal comment was cleared — also clear the unread flag
      updatePayload.hasUnreadAdminNote = false;
    } else if (newInternal !== prevInternal) {
      // Internal comment changed (new or updated) — mark unread for the teacher
      updatePayload.hasUnreadAdminNote = true;
    }
    // If internal comment is identical to previous value, hasUnreadAdminNote is NOT written

    await updateDoc(doc(db, 'lessons', id), cleanData(updatePayload));
  };

  // Phase 19.2C: Clear unread flag — runs only when all safety checks pass:
  //   - caller is a teacher
  //   - lesson exists in state (Firestore query already scopes to this teacher's lessons)
  //   - the flag is actually set
  // NOTE: teacherId === currentUser.id check is intentionally omitted — the Firestore
  // query `where('teacherId', '==', user.id)` already guarantees lesson ownership, and
  // any ID representation mismatch would cause a silent no-op instead of clearing.
  const clearUnreadAdminNote = async (lessonId: string) => {
    if (!state.currentUser || state.currentUser.role !== Role.TEACHER) return;
    const lesson = state.lessons.find(l => l.id === lessonId);
    if (!lesson || !lesson.hasUnreadAdminNote) return;
    await updateDoc(doc(db, 'lessons', lessonId), { hasUnreadAdminNote: false });
  };

  const deleteLesson = async (id: string) => {
    try {
      // Delete the lesson document from Firestore
      await deleteDoc(doc(db, 'lessons', id));
      
      // Update local state - remove the lesson from the lessons array
      setState(prev => ({
        ...prev,
        lessons: prev.lessons.filter(l => l.id !== id)
      }));
      
      console.log(`Lesson ${id} deleted successfully`);
    } catch (error) {
      console.error('Error deleting lesson:', error);
      throw error;
    }
  };

  // ---------------------------
  // Bookings (Phase 14)
  // ---------------------------

  const addBooking = async (bookingData: Omit<Booking, 'id'>): Promise<{ success: boolean; bookingId?: string; message?: string }> => {
    try {
      const id = `booking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const finalData = { id, ...bookingData };
      await setDoc(doc(db, 'bookings', id), cleanData(finalData));
      return { success: true, bookingId: id };
    } catch (error: any) {
      console.error('addBooking error:', error);
      return { success: false, message: error.message || 'Failed to create booking' };
    }
  };

  const updateBooking = async (id: string, data: Partial<Booking>): Promise<void> => {
    await updateDoc(doc(db, 'bookings', id), cleanData(data));
  };

  const convertBookingToLesson = async (
    bookingId: string,
    lessonOverrides?: Partial<Lesson>
  ): Promise<{ success: boolean; lessonId?: string; message?: string }> => {
    try {
      const booking = state.bookings.find(b => b.id === bookingId);
      if (!booking) return { success: false, message: 'Booking not found' };
      if (booking.status !== BookingStatus.APPROVED) return { success: false, message: 'Booking must be approved before converting' };
      if (!booking.teacherId || !booking.schoolId) return { success: false, message: 'Booking must have teacher and school assigned' };

      // Build lesson data from booking — reuses addLesson which handles schoolRate server-side
      const lessonData: Omit<Lesson, 'id'> = {
        date: booking.preferredDate || new Date().toISOString(),
        teacherId: booking.teacherId,
        teacherName: booking.teacherName || '',
        studentIds: [booking.studentId],
        studentNames: [booking.studentName],
        schoolId: booking.schoolId,
        schoolName: booking.schoolName || '',
        status: 'Present' as any,
        durationMinutes: booking.durationMinutes || 30,
        type: booking.lessonType || 'Individual',
        teacherRate: 0, // will be computed or overridden
        schoolRate: 0,   // addLesson computes server-side
        deliveryMode: booking.deliveryMode || DeliveryMode.IN_PERSON,
        ...lessonOverrides,
      };

      await addLesson(lessonData);

      // Mark booking as converted
      await updateBooking(bookingId, {
        status: BookingStatus.CONVERTED,
        convertedLessonId: 'created', // We don't easily get the ID back from addLesson
      });

      return { success: true, message: 'Booking converted to lesson' };
    } catch (error: any) {
      console.error('convertBookingToLesson error:', error);
      return { success: false, message: error.message || 'Conversion failed' };
    }
  };

  // ---------------------------
  // Timetable / Scheduling (Phase 15)
  // ---------------------------

  const addTimetableSlot = async (slotData: Omit<TimetableSlot, 'id' | 'createdAt'>): Promise<{ success: boolean; message?: string }> => {
    try {
      const id = `slot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const finalData: TimetableSlot = { id, ...slotData, createdAt: Date.now() };
      await setDoc(doc(db, 'timetableSlots', id), cleanData(finalData));
      return { success: true };
    } catch (error: any) {
      console.error('addTimetableSlot error:', error);
      return { success: false, message: error.message || 'Failed to create timetable slot' };
    }
  };

  const updateTimetableSlot = async (id: string, data: Partial<TimetableSlot>): Promise<void> => {
    await updateDoc(doc(db, 'timetableSlots', id), cleanData(data));
  };

  const deleteTimetableSlot = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'timetableSlots', id));
  };

  const generateLessonsFromTimetable = async (
    startDate: string,
    endDate: string
  ): Promise<{ created: number; skipped: number; errors: number }> => {
    let created = 0;
    let skipped = 0;
    let errors = 0;

    const activeSlots = state.timetableSlots.filter(s => s.isActive);
    if (activeSlots.length === 0) return { created, skipped, errors };

    // Limit to max 12 weeks
    const start = new Date(startDate);
    const end = new Date(endDate);
    const maxDays = 84; // 12 weeks
    const diffDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > maxDays) {
      end.setTime(start.getTime() + maxDays * 24 * 60 * 60 * 1000);
    }

    // Build existing lesson keys for duplicate detection
    const existingKeys = new Set<string>();
    state.lessons.forEach(l => {
      const datePrefix = l.date.substring(0, 10);
      const key = `${l.teacherId}_${datePrefix}_${l.studentIds.slice().sort().join(',')}`;
      existingKeys.add(key);
    });

    for (const slot of activeSlots) {
      // Find all dates within range that match this dayOfWeek
      const current = new Date(start);
      while (current <= end) {
        if (current.getDay() === slot.dayOfWeek) {
          const year = current.getFullYear();
          const month = String(current.getMonth() + 1).padStart(2, '0');
          const day = String(current.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          const dateISO = `${dateStr}T${slot.startTime}:00`;

          // Duplicate check
          const dedupKey = `${slot.teacherId}_${dateStr}_${slot.studentIds.slice().sort().join(',')}`;
          if (existingKeys.has(dedupKey)) {
            skipped++;
            current.setDate(current.getDate() + 1);
            continue;
          }

          try {
            // Phase 17.1: Centralized rate resolution
            const teacher = state.teachers.find(t => t.id === slot.teacherId);
            const durationHours = slot.durationMinutes / 60;
            const hourlyTeacherRate = teacher
              ? resolveTeacherRate(teacher, slot.schoolId, slot.type, slot.deliveryMode || DeliveryMode.IN_PERSON)
              : 60;

            let teacherRate = hourlyTeacherRate * durationHours;
            if (slot.type === 'Group') {
              teacherRate = teacherRate * (slot.studentIds.length || 1);
            }

            await addLesson({
              date: dateISO,
              teacherId: slot.teacherId,
              teacherName: slot.teacherName,
              studentIds: [...slot.studentIds],
              studentNames: [...slot.studentNames],
              schoolId: slot.schoolId,
              schoolName: slot.schoolName,
              status: 'Present' as any,
              durationMinutes: slot.durationMinutes,
              type: slot.type,
              teacherRate: parseFloat(teacherRate.toFixed(2)),
              schoolRate: 0, // addLesson computes server-side
              deliveryMode: slot.deliveryMode,
            });

            existingKeys.add(dedupKey); // prevent intra-batch duplicates
            created++;
          } catch (e) {
            console.error('generateLessonsFromTimetable: error creating lesson', e);
            errors++;
          }
        }
        current.setDate(current.getDate() + 1);
      }
    }

    return { created, skipped, errors };
  };

  // ---------------------------
  // Enrollments (Phase 17.2)
  // ---------------------------

  const addEnrollment = async (data: Omit<Enrollment, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; enrollmentId?: string; message?: string }> => {
    try {
      // Phase 19.6D1: write-time duplicate validation.
      // Rule: at most one current enrollment per
      //   (studentId, instrument, schoolId || 'private').
      // Only blocks NEW conflicts — current listener state is the source of truth.
      const today = getTodayISO();
      const conflict = findConflictingEnrollment(data as Enrollment, state.enrollments, today);
      if (conflict) {
        const scope = conflict.schoolName || 'Private';
        return {
          success: false,
          message: `Active enrollment already exists for "${conflict.studentName} — ${conflict.instrument}" at ${scope} `
                 + `(id: ${conflict.id}, status: ${conflict.status}). Complete or cancel it before creating another.`
        };
      }

      const id = `enr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = Date.now();
      const finalData = { id, ...data, createdAt: now, updatedAt: now };
      await setDoc(doc(db, 'enrollments', id), cleanData(finalData));
      return { success: true, enrollmentId: id };
    } catch (error: any) {
      console.error('addEnrollment error:', error);
      return { success: false, message: error.message || 'Failed to create enrollment' };
    }
  };

  const batchAddEnrollments = async (
    template: Omit<Enrollment, 'id' | 'createdAt' | 'updatedAt' | 'studentId' | 'studentName' | 'instrument'>,
    students: { id: string; name: string; instrument: string; teacherId?: string; teacherName?: string }[]
  ): Promise<{ created: number; createdEnrollments: { studentId: string; enrollmentId: string }[]; skipped: { name: string; reason: string }[] }> => {
    const now = Date.now();
    const today = getTodayISO();
    const skipped: { name: string; reason: string }[] = [];
    const toWrite: Enrollment[] = [];

    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const payload = {
        ...template,
        studentId: student.id,
        studentName: student.name,
        instrument: student.instrument,
        // Per-student teacher overrides template teacher (used in bulk mode where teacher = filter only)
        ...(student.teacherId ? { teacherId: student.teacherId, teacherName: student.teacherName ?? '' } : {}),
      } as Enrollment;
      const conflict = findConflictingEnrollment(payload, state.enrollments, today);
      if (conflict) {
        skipped.push({ name: student.name, reason: `Already enrolled in ${student.instrument}` });
        continue;
      }
      const id = `enr_${now}_${i}_${Math.random().toString(36).slice(2, 6)}`;
      toWrite.push({ id, ...payload, createdAt: now, updatedAt: now });
    }

    const CHUNK = 100;
    for (let i = 0; i < toWrite.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const enrollment of toWrite.slice(i, i + CHUNK)) {
        batch.set(doc(db, 'enrollments', enrollment.id), cleanData(enrollment));
      }
      await batch.commit();
    }

    const createdEnrollments = toWrite.map(e => ({ studentId: e.studentId, enrollmentId: e.id }));
    return { created: toWrite.length, createdEnrollments, skipped };
  };

  const updateEnrollment = async (id: string, data: Partial<Enrollment>): Promise<{ success: boolean; message?: string }> => {
    try {
      // Phase 19.6D1: write-time duplicate validation on update.
      //
      // We only want to block writes that introduce a NEW conflict. Legacy
      // duplicates (two actives that already exist in Firestore from pre-19.6)
      // must still be editable — otherwise the admin can't clean them up.
      //
      // Strategy: compute the conflict state BEFORE and AFTER the merge.
      // If the enrollment was already in conflict, allow the update. Only
      // block when the update moves from "no conflict" to "conflict".
      const existing = state.enrollments.find(e => e.id === id);
      if (existing) {
        const merged = { ...existing, ...data } as Enrollment;
        const today = getTodayISO();
        const newConflict = findConflictingEnrollment(merged, state.enrollments, today, id);
        if (newConflict) {
          const priorConflict = findConflictingEnrollment(existing, state.enrollments, today, id);
          if (!priorConflict) {
            const scope = newConflict.schoolName || 'Private';
            return {
              success: false,
              message: `Update would conflict with active enrollment "${newConflict.studentName} — ${newConflict.instrument}" at ${scope} `
                     + `(id: ${newConflict.id}). Complete or cancel it before making this change.`
            };
          }
        }
      }

      await updateDoc(doc(db, 'enrollments', id), cleanData({ ...data, updatedAt: Date.now() }));
      return { success: true };
    } catch (error: any) {
      console.error('updateEnrollment error:', error);
      return { success: false, message: error.message || 'Failed to update enrollment' };
    }
  };

  const deleteEnrollment = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'enrollments', id));
    setState(prev => ({
      ...prev,
      enrollments: prev.enrollments.filter(e => e.id !== id)
    }));
  };

  // ---------------------------
  // School Enrollment Periods (Phase 19.6)
  // ---------------------------

  const addSchoolEnrollmentPeriod = async (
    data: Omit<SchoolEnrollmentPeriod, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ success: boolean; periodId?: string; message?: string }> => {
    try {
      const id = `sep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = Date.now();
      const finalData = { id, ...data, createdAt: now, updatedAt: now };
      await setDoc(doc(db, 'schoolEnrollmentPeriods', id), cleanData(finalData));
      return { success: true, periodId: id };
    } catch (error: any) {
      console.error('addSchoolEnrollmentPeriod error:', error);
      return { success: false, message: error.message || 'Failed to create school enrollment period' };
    }
  };

  const updateSchoolEnrollmentPeriod = async (
    id: string,
    data: Partial<SchoolEnrollmentPeriod>
  ): Promise<void> => {
    await updateDoc(doc(db, 'schoolEnrollmentPeriods', id), cleanData({ ...data, updatedAt: Date.now() }));
  };

  const deleteSchoolEnrollmentPeriod = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'schoolEnrollmentPeriods', id));
    setState(prev => ({
      ...prev,
      schoolEnrollmentPeriods: prev.schoolEnrollmentPeriods.filter(p => p.id !== id)
    }));
  };

  // ---------------------------
  // Phase 19.6D5B: Enrollment Review — lesson enrollment link
  // ---------------------------

  /**
   * Write ONLY lesson.enrollmentId (and updatedAt).
   * Pass null to unlink. No other lesson or enrollment field is touched.
   * Admin-only — callers in EnrollmentReview.tsx must already have verified the role.
   */
  const updateLessonEnrollmentLink = async (
    lessonId: string,
    enrollmentId: string | null
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const existing = state.lessons.find(l => l.id === lessonId);
      if (!existing) {
        return { success: false, message: `Lesson ${lessonId} not found` };
      }
      if (enrollmentId !== null) {
        const targetEnrollment = state.enrollments.find(e => e.id === enrollmentId);
        if (!targetEnrollment) {
          return { success: false, message: `Enrollment ${enrollmentId} no longer exists` };
        }
        if (targetEnrollment.status === 'cancelled') {
          return { success: false, message: 'Cannot link to a cancelled enrollment' };
        }
      }
      await updateDoc(doc(db, 'lessons', lessonId), {
        enrollmentId: enrollmentId ?? deleteField(),
        updatedAt: Date.now(),
      });
      return { success: true };
    } catch (error: any) {
      console.error('updateLessonEnrollmentLink error:', error);
      return { success: false, message: error.message || 'Failed to update lesson enrollment link' };
    }
  };

  /**
   * Phase 19.6D5C: Batch write lesson.enrollmentId for multiple lessons.
   * Writes ONLY enrollmentId (+ updatedAt) — no other fields touched.
   * Uses writeBatch, chunked at 100 operations per batch (Firestore limit).
   * Max 200 pairs per call (enforced by caller in EnrollmentReview).
   */
  const batchUpdateLessonEnrollmentLinks = async (
    pairs: Array<{ lessonId: string; enrollmentId: string | null }>
  ): Promise<{ success: boolean; written: number; failed: number; message?: string }> => {
    if (pairs.length === 0) return { success: true, written: 0, failed: 0 };
    const CHUNK = 100;
    let written = 0;
    let failed = 0;
    const now = Date.now();
    try {
      for (let i = 0; i < pairs.length; i += CHUNK) {
        const chunk = pairs.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        for (const { lessonId, enrollmentId } of chunk) {
          const ref = doc(db, 'lessons', lessonId);
          batch.update(ref, {
            enrollmentId: enrollmentId ?? deleteField(),
            updatedAt: now,
          });
        }
        await batch.commit();
        written += chunk.length;
      }
      return { success: true, written, failed: 0 };
    } catch (error: any) {
      console.error('batchUpdateLessonEnrollmentLinks error:', error);
      // Some chunks may have succeeded before the failure
      failed = pairs.length - written;
      return {
        success: false,
        written,
        failed,
        message: error.message || 'Batch update failed',
      };
    }
  };

  // ---------------------------
  // Invoices (Phase 17.3)
  // ---------------------------

  const generateInvoiceNumber = async (periodMonth: string): Promise<string> => {
    // periodMonth = "YYYY-MM" e.g. "2026-03"
    const ym = periodMonth.replace('-', '');  // "202603"
    const counterKey = `invoices_${ym}`;
    const seq = await reserveCounterRange(counterKey, 1);
    return `INV-${ym}-${String(seq).padStart(4, '0')}`;
  };

  const addInvoice = async (data: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; invoiceId?: string; invoiceNumber?: string; message?: string }> => {
    try {
      const id = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const periodMonth = (data.periodStart || '').substring(0, 7); // "YYYY-MM"
      const invoiceNumber = await generateInvoiceNumber(periodMonth || new Date().toISOString().substring(0, 7));
      const now = Date.now();
      const finalData = { id, invoiceNumber, ...data, createdAt: now, updatedAt: now };
      await setDoc(doc(db, 'invoices', id), cleanData(finalData));
      return { success: true, invoiceId: id, invoiceNumber };
    } catch (error: any) {
      console.error('addInvoice error:', error);
      return { success: false, message: error.message || 'Failed to create invoice' };
    }
  };

  const updateInvoice = async (id: string, data: Partial<Invoice>): Promise<void> => {
    await updateDoc(doc(db, 'invoices', id), cleanData({ ...data, updatedAt: Date.now() }));
  };

  const deleteInvoice = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'invoices', id));
    setState(prev => ({
      ...prev,
      invoices: prev.invoices.filter(inv => inv.id !== id)
    }));
  };

  // ---------------------------
  // Payments (Phase 17.4)
  // ---------------------------

  /**
   * Reconcile an invoice's paidAmount and status from its payments.
   * Called after every payment add/update/delete.
   * Only touches invoices that are NOT draft or cancelled.
   */
  const reconcileInvoice = async (invoiceId: string) => {
    const invoice = state.invoices.find(inv => inv.id === invoiceId);
    if (!invoice) return;
    // Don't reconcile draft or cancelled invoices
    if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.CANCELLED) return;

    const newPaidAmount = getInvoicePaidAmount(state.payments, invoiceId);
    const { status: newStatus, isLocked: newLocked } = resolveInvoiceStatusAfterPayment(invoice, newPaidAmount);

    await updateDoc(doc(db, 'invoices', invoiceId), cleanData({
      paidAmount: newPaidAmount,
      status: newStatus,
      isLocked: newLocked,
      updatedAt: Date.now()
    }));
  };

  const addPayment = async (data: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; paymentId?: string; message?: string }> => {
    try {
      const id = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = Date.now();
      const finalData = { id, ...data, createdAt: now, updatedAt: now };
      await setDoc(doc(db, 'payments', id), cleanData(finalData));
      // Reconcile the linked invoice
      // Use a short delay to allow Firestore listener to pick up the new payment
      // so reconcileInvoice reads fresh state. We also compute directly as fallback.
      setTimeout(() => reconcileInvoice(data.invoiceId), 500);
      return { success: true, paymentId: id };
    } catch (error: any) {
      console.error('addPayment error:', error);
      return { success: false, message: error.message || 'Failed to create payment' };
    }
  };

  const updatePayment = async (id: string, data: Partial<Payment>): Promise<void> => {
    await updateDoc(doc(db, 'payments', id), cleanData({ ...data, updatedAt: Date.now() }));
    // Determine invoiceId from existing payment or from update data
    const existing = state.payments.find(p => p.id === id);
    const invoiceId = data.invoiceId || existing?.invoiceId;
    if (invoiceId) {
      setTimeout(() => reconcileInvoice(invoiceId), 500);
    }
  };

  const deletePayment = async (id: string): Promise<void> => {
    const existing = state.payments.find(p => p.id === id);
    const invoiceId = existing?.invoiceId;
    await deleteDoc(doc(db, 'payments', id));
    setState(prev => ({
      ...prev,
      payments: prev.payments.filter(p => p.id !== id)
    }));
    if (invoiceId) {
      setTimeout(() => reconcileInvoice(invoiceId), 500);
    }
  };

  // ---------------------------
  // Payroll (Phase 17.6)
  // ---------------------------

  const generatePayrollNumber = async (periodMonth: string): Promise<string> => {
    // periodMonth = "YYYY-MM" e.g. "2026-03"
    const ym = periodMonth.replace('-', '');  // "202603"
    const counterKey = `payroll_${ym}`;
    const seq = await reserveCounterRange(counterKey, 1);
    return `PAY-${ym}-${String(seq).padStart(4, '0')}`;
  };

  const addPayrollRun = async (data: Omit<PayrollRun, 'id' | 'payrollNumber' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; payrollId?: string; payrollNumber?: string; message?: string }> => {
    try {
      // Duplicate check: same teacher + overlapping period + same school filter
      const existing = state.payrollRuns.find(pr =>
        pr.teacherId === data.teacherId &&
        pr.periodStart === data.periodStart &&
        pr.periodEnd === data.periodEnd &&
        (pr.schoolFilter || '') === (data.schoolFilter || '') &&
        pr.status !== PayrollStatus.CANCELLED
      );
      if (existing) {
        return { success: false, message: `Duplicate payroll already exists: ${existing.payrollNumber}` };
      }

      const id = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const periodMonth = (data.periodStart || '').substring(0, 7);
      const payrollNumber = await generatePayrollNumber(periodMonth || new Date().toISOString().substring(0, 7));
      const now = Date.now();
      const finalData = { id, payrollNumber, ...data, createdAt: now, updatedAt: now };
      await setDoc(doc(db, 'payrollRuns', id), cleanData(finalData));
      return { success: true, payrollId: id, payrollNumber };
    } catch (error: any) {
      console.error('addPayrollRun error:', error);
      return { success: false, message: error.message || 'Failed to create payroll run' };
    }
  };

  const updatePayrollRun = async (id: string, data: Partial<PayrollRun>): Promise<void> => {
    await updateDoc(doc(db, 'payrollRuns', id), cleanData({ ...data, updatedAt: Date.now() }));
  };

  const deletePayrollRun = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'payrollRuns', id));
    setState(prev => ({
      ...prev,
      payrollRuns: prev.payrollRuns.filter(pr => pr.id !== id)
    }));
  };

  // ---------------------------
  // Imports
  // ---------------------------

  const processStudentImport = async (
    rows: any[],
    options?: { role?: Role; currentUserId?: string; schoolId?: string }
  ) => {
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    if (!Array.isArray(rows) || rows.length === 0) return { added, updated, skipped, errors };

    const role = options?.role;
    const currentUserId = options?.currentUserId;
    const roleSchoolId = options?.schoolId;

    for (let i = 0; i < rows.length; i += 450) {
      const batch = writeBatch(db);
      const chunk = rows.slice(i, i + 450);

      for (const row of chunk) {
        try {
          const rowStudentId = String(row.id ?? row.ID ?? row['Student ID'] ?? '').trim();
          const isForceNew = rowStudentId.toUpperCase() === '#NEW';

          const name = String(row.name ?? row.Name ?? row['Student Name'] ?? '').trim();
          let schoolId = String(row.schoolId ?? row['School ID'] ?? '').trim();
          const instrument = String(row.instrument ?? row.Instrument ?? '').trim();

          // Phase 19.4B/C: parse new optional fields from import row; normalise grade to digits-only
          const yearGrade = normaliseGrade(String(row.yearGrade ?? row['Year / Grade'] ?? row['Year/Grade'] ?? row.Year ?? row.Grade ?? '').trim());
          const rawEmail  = String(row.email ?? row.Email ?? '').trim().toLowerCase();
          const dob       = String(row.dateOfBirth ?? row['Date of Birth'] ?? row.DOB ?? row.dob ?? '').trim().substring(0, 10);

          if (!name) { skipped += 1; continue; }

          // Resolve school by ID, else by name — accept both "School" and "School Name" columns
          if (!schoolId) {
            const schoolName = String(row.school ?? row.School ?? row['School Name'] ?? '').trim();
            const foundSchool = state.schools.find(s => s.name?.toLowerCase() === schoolName.toLowerCase());
            if (foundSchool) schoolId = foundSchool.id;
          }

          // Resolve teacherId — accept "Assigned Teacher" (export header), "Teacher", "Teacher Name", and ID columns
          let resolvedTeacherId = String(row.teacherId ?? row['Teacher ID'] ?? '').trim();
          if (!resolvedTeacherId) {
            const teacherName = String(
              row.teacher ?? row.Teacher ?? row['Teacher Name'] ?? row['Assigned Teacher'] ?? ''
            ).trim();
            if (teacherName) {
              const foundTeacher = state.teachers.find(t => t.name?.toLowerCase() === teacherName.toLowerCase());
              if (foundTeacher) resolvedTeacherId = foundTeacher.id;
            }
          }

          // Role scope guards
          if (role === Role.TEACHER && currentUserId) {
            // Teacher import: force assignment to themselves if unset
            if (!resolvedTeacherId) resolvedTeacherId = currentUserId;
            // Teachers cannot assign students to other teachers via import
            if (resolvedTeacherId !== currentUserId) { errors += 1; continue; }
          }
          if (role === Role.SCHOOL_ADMIN && roleSchoolId) {
            if (schoolId && schoolId !== roleSchoolId) { errors += 1; continue; }
            if (!schoolId) schoolId = roleSchoolId;
          }

          // --- Duplicate detection (skipped when user explicitly wrote #NEW) ---
          let existingStudent: typeof state.students[number] | undefined;
          if (!isForceNew) {
            // 1. Try matching by existing Student ID (strongest identifier)
            existingStudent = rowStudentId ? state.students.find(s => s.id === rowStudentId) : undefined;

            // 2. Composite match: name + schoolId (+ optional teacher/instrument)
            if (!existingStudent && schoolId) {
              existingStudent = state.students.find(s =>
                s.name.toLowerCase() === name.toLowerCase() &&
                s.schoolId === schoolId &&
                (s.teacherId === resolvedTeacherId || !resolvedTeacherId) &&
                (s.instrument.toLowerCase() === instrument.toLowerCase() || !instrument)
              );
            }

            // 3. Supporting email match — only if email present and exactly one match
            if (!existingStudent && rawEmail) {
              const emailMatches = state.students.filter(s => s.email === rawEmail);
              if (emailMatches.length === 1) existingStudent = emailMatches[0];
            }
          }

          if (existingStudent) {
            // Role guard: teacher can only update their own students; school_admin only students at their school
            if (role === Role.TEACHER && currentUserId && existingStudent.teacherId !== currentUserId && !(existingStudent.currentTeacherIds ?? []).includes(currentUserId)) {
              skipped += 1; continue;
            }
            if (role === Role.SCHOOL_ADMIN && roleSchoolId && existingStudent.schoolId !== roleSchoolId) {
              skipped += 1; continue;
            }

            const patch: Record<string, any> = {};
            if (name && name !== existingStudent.name) patch.name = name;
            if (schoolId && schoolId !== existingStudent.schoolId) patch.schoolId = schoolId;
            if (resolvedTeacherId && resolvedTeacherId !== existingStudent.teacherId) patch.teacherId = resolvedTeacherId;
            if (instrument && instrument !== existingStudent.instrument) patch.instrument = instrument;
            if (yearGrade && yearGrade !== existingStudent.yearGrade) patch.yearGrade = yearGrade;
            if (rawEmail && rawEmail !== existingStudent.email) patch.email = rawEmail;
            if (dob && dob !== existingStudent.dateOfBirth) patch.dateOfBirth = dob;

            if (Object.keys(patch).length > 0) {
              batch.set(doc(db, 'students', existingStudent.id), cleanData(patch), { merge: true });
              updated += 1;
            } else {
              skipped += 1;
            }
            continue;
          }

          // CREATE new student
          if (!schoolId) { errors += 1; continue; }
          const school = state.schools.find(s => s.id === schoolId) as any;
          if (!school) { errors += 1; continue; }
          // Fall back to schoolId if school.code is missing — prevents silent failures
          const schoolCode = String(school?.code || school?.id || '').trim();
          if (!schoolCode) { errors += 1; continue; }
          const studentId = await generateStudentId(schoolCode);

          const payload: Record<string, any> = {
            id: studentId,
            name,
            schoolId,
            teacherId: resolvedTeacherId,
            instrument,
          };
          if (yearGrade) payload.yearGrade = yearGrade;
          if (rawEmail) payload.email = rawEmail;
          if (dob) payload.dateOfBirth = dob;

          batch.set(doc(db, 'students', studentId), cleanData(payload), { merge: true });
          added += 1;
        } catch (e) {
          errors += 1;
        }
      }
      await batch.commit();
    }
    return { added, updated, skipped, errors };
  };

  // Role-gated lesson import — updates existing lessons, or creates new ones when
  // "Lesson ID" = "#NEW". Supports "#<number>" prefix on rate columns to override
  // the auto-calculated rate (admin only; ignored for other roles).
  const processLessonImport = async (
    rows: any[],
    options?: { role?: Role; currentUserId?: string; schoolId?: string }
  ) => {
    let added = 0, updated = 0, skipped = 0, errors = 0;
    if (!Array.isArray(rows) || rows.length === 0) return { added, updated, skipped, errors };

    const role = options?.role;
    const currentUserId = options?.currentUserId;
    const roleSchoolId = options?.schoolId;
    const canEditFinancials = role === Role.ADMIN;
    const canEditComments = role === Role.ADMIN || role === Role.SCHOOL_ADMIN;

    const validStatuses = new Set(Object.values(LessonStatus));

    // Parse a rate cell. Returns { value, override } — override=true means "#" prefix present.
    const parseRateCell = (raw: any): { value: number | null; override: boolean } => {
      if (raw === undefined || raw === null || raw === '') return { value: null, override: false };
      const str = String(raw).trim();
      const override = str.startsWith('#');
      const numStr = override ? str.slice(1).trim() : str;
      const n = parseFloat(numStr);
      return { value: isNaN(n) ? null : n, override };
    };

    // Recalculate snapshot rates from the rate tables for a lesson-like object.
    const calcRates = (lesson: {
      teacherId: string; schoolId: string; type: string; deliveryMode: DeliveryMode;
      durationMinutes: number; studentIds: string[]; studentNames: string[];
    }): { teacherRate: number; schoolRate: number } => {
      const teacher = state.teachers.find(t => t.id === lesson.teacherId);
      const school = state.schools.find(s => s.id === lesson.schoolId);
      const firstStudent = lesson.studentIds?.length > 0 ? state.students.find(s => s.id === lesson.studentIds[0]) : undefined;
      const instrument = firstStudent?.instrument || teacher?.instrument || '';
      const hourlyT = teacher ? resolveTeacherRate(teacher, lesson.schoolId, lesson.type as any, lesson.deliveryMode) : 60;
      const hourlyS = school ? resolveSchoolRate(school, lesson.teacherId, instrument, lesson.type as any, lesson.deliveryMode) : 120;
      const hours = lesson.durationMinutes / 60;
      const studentCount = lesson.studentIds.length > 0 ? lesson.studentIds.length : (lesson.studentNames.length || 1);
      const multiplier = lesson.type === 'Group' ? studentCount : 1;
      return {
        teacherRate: parseFloat((hourlyT * hours * multiplier).toFixed(2)),
        schoolRate: parseFloat((hourlyS * hours * multiplier).toFixed(2)),
      };
    };

    for (let i = 0; i < rows.length; i += 450) {
      const batch = writeBatch(db);
      const chunk = rows.slice(i, i + 450);

      for (const row of chunk) {
        try {
          const lessonId = String(row['Lesson ID'] ?? row.id ?? row.ID ?? '').trim();
          if (!lessonId) { skipped += 1; continue; }

          // Common text cells (used for both create and update)
          const rawStatus = String(row.Status ?? row.status ?? '').trim();
          const rawDuration = parseInt(String(row['Duration (min)'] ?? row.duration ?? row.durationMinutes ?? ''), 10);
          const rawEffort = parseInt(String(row.Effort ?? row.interactivity ?? ''), 10);
          const rawPractice = parseInt(String(row.Practice ?? row.behavior ?? ''), 10);
          const rawLearning = String(row.Learning ?? row.learning ?? '').trim();
          const rawNotes = String(row.Notes ?? row.notes ?? '').trim();
          const rawGrade = String(row['Overall Grade'] ?? row.overallGrade ?? '').trim();
          const rawRepertoire = String(row.Repertoire ?? row.repertoire ?? '').trim();
          const rawPracticeAssignment = String(row['Practice Assignment'] ?? row.practiceAssignment ?? '').trim();
          const rawExamPrep = String(row['Exam Prep Status'] ?? row.examPrepStatus ?? '').trim();
          const rawSchoolComment = String(row['School Teacher Comment'] ?? row.schoolAdminComment ?? '').trim();
          const rawInternalComment = String(row['School Admin Internal Comment'] ?? row.schoolAdminInternalComment ?? '').trim();

          // -----------------------------------------------------------------
          // CREATE NEW LESSON — "#NEW" marker in Lesson ID
          // -----------------------------------------------------------------
          if (lessonId.toUpperCase() === '#NEW') {
            const teacherName = String(row.Teacher ?? row.teacher ?? row['Teacher Name'] ?? '').trim();
            const studentRaw = String(row.Student ?? row.student ?? row['Student Name'] ?? '').trim();
            const schoolName = String(row.School ?? row.school ?? '').trim();
            const dateStr = String(row.Date ?? row.date ?? '').trim();
            const timeStr = String(row.Time ?? row.time ?? '').trim();
            const rawType = String(row.Type ?? row.type ?? 'Individual').trim();
            const rawDelivery = String(row['Delivery Mode'] ?? row.deliveryMode ?? 'In-Person').trim();

            if (!teacherName || !studentRaw || !schoolName || !dateStr) {
              console.warn('[Lesson Import] #NEW row missing required fields', { teacherName, studentRaw, schoolName, dateStr });
              errors += 1; continue;
            }

            // Resolve school — first by current name, then fallback to snapshot names
            // on existing lessons (handles the case where a school was renamed and
            // the exported file still carries the old snapshot).
            let school = state.schools.find(s => s.name?.toLowerCase() === schoolName.toLowerCase());
            if (!school) {
              const lessonWithOldName = state.lessons.find(l => l.schoolName?.toLowerCase() === schoolName.toLowerCase());
              if (lessonWithOldName) school = state.schools.find(s => s.id === lessonWithOldName.schoolId);
            }
            if (!school) {
              console.warn('[Lesson Import] #NEW row could not resolve school', schoolName);
              errors += 1; continue;
            }

            // Role scope guard: school_admin can only create at their own school
            if (role === Role.SCHOOL_ADMIN && roleSchoolId && school.id !== roleSchoolId) { errors += 1; continue; }

            // Resolve teacher — current name, then fallback to snapshot in lessons
            let teacher = state.teachers.find(t => t.name?.toLowerCase() === teacherName.toLowerCase());
            if (!teacher) {
              const lessonWithOldTeacherName = state.lessons.find(l => l.teacherName?.toLowerCase() === teacherName.toLowerCase());
              if (lessonWithOldTeacherName) teacher = state.teachers.find(t => t.id === lessonWithOldTeacherName.teacherId);
            }
            if (!teacher) {
              console.warn('[Lesson Import] #NEW row could not resolve teacher', teacherName);
              errors += 1; continue;
            }

            // Role scope guard: teacher can only create lessons assigned to themselves
            if (role === Role.TEACHER && currentUserId && teacher.id !== currentUserId) { errors += 1; continue; }

            // Resolve students — comma-separated "Name 1, Name 2" for groups. For each name,
            // prefer current match at this school; fall back to snapshot names on existing lessons.
            const studentNames = studentRaw.split(',').map(s => s.trim()).filter(Boolean);
            const resolvedStudents = studentNames.map(sn => {
              const direct = state.students.find(st => st.name?.toLowerCase() === sn.toLowerCase() && st.schoolId === school!.id);
              if (direct) return direct;
              // Fallback: any student whose current school-ID matches, even if renamed
              const anySchool = state.students.find(st => st.name?.toLowerCase() === sn.toLowerCase());
              if (anySchool && anySchool.schoolId === school!.id) return anySchool;
              // Last fallback: look at existing lessons that reference this student name at this school
              const lessonMatch = state.lessons.find(l =>
                l.schoolId === school!.id &&
                (l.studentNames || []).some(n => n.toLowerCase() === sn.toLowerCase())
              );
              if (lessonMatch) {
                const idx = lessonMatch.studentNames.findIndex(n => n.toLowerCase() === sn.toLowerCase());
                const studentId = lessonMatch.studentIds?.[idx];
                if (studentId) return state.students.find(st => st.id === studentId);
              }
              return undefined;
            }).filter(Boolean) as typeof state.students;

            if (resolvedStudents.length === 0) {
              console.warn('[Lesson Import] #NEW row could not resolve any student', { studentRaw, schoolId: school.id });
              errors += 1; continue;
            }

            // Build ISO date — accept "YYYY-MM-DD" + "HH:mm" or full ISO in Date cell
            let iso: string;
            try {
              const combined = timeStr ? `${dateStr} ${timeStr}` : dateStr;
              const parsed = new Date(combined);
              if (isNaN(parsed.getTime())) throw new Error('invalid');
              iso = parsed.toISOString();
            } catch {
              errors += 1; continue;
            }

            const status = validStatuses.has(rawStatus as LessonStatus) ? (rawStatus as LessonStatus) : LessonStatus.TAUGHT;
            const durationMinutes = !isNaN(rawDuration) && rawDuration > 0 ? rawDuration : 30;
            const type: 'Individual' | 'Group' = rawType.toLowerCase() === 'group' ? 'Group' : 'Individual';
            const deliveryMode: DeliveryMode = /online/i.test(rawDelivery) ? DeliveryMode.ONLINE : DeliveryMode.IN_PERSON;

            // Calculate rates (unless # override + admin permission)
            const teacherPayCell = parseRateCell(row['Teacher Pay (SAR)'] ?? row.teacherRate);
            const schoolBillCell = parseRateCell(row['School Bill (SAR)'] ?? row.schoolRate);
            let teacherRate: number, schoolRate: number;
            if (status === LessonStatus.ABSENT_EXCUSED || status === LessonStatus.CANCELLED) {
              teacherRate = 0; schoolRate = 0;
            } else {
              const calc = calcRates({
                teacherId: teacher.id, schoolId: school.id, type, deliveryMode,
                durationMinutes, studentIds: resolvedStudents.map(s => s.id), studentNames: resolvedStudents.map(s => s.name),
              });
              teacherRate = (canEditFinancials && teacherPayCell.override && teacherPayCell.value !== null) ? teacherPayCell.value : calc.teacherRate;
              schoolRate  = (canEditFinancials && schoolBillCell.override && schoolBillCell.value !== null) ? schoolBillCell.value : calc.schoolRate;
            }

            // Generate lesson ID following addLesson's format
            const rnd = Math.random().toString(36).slice(2, 6);
            const now = new Date();
            const createdPart = `C${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
            const parsedDate = new Date(iso);
            const taughtPart = `${parsedDate.getFullYear()}${String(parsedDate.getMonth()+1).padStart(2,'0')}${String(parsedDate.getDate()).padStart(2,'0')}-${String(parsedDate.getHours()).padStart(2,'0')}${String(parsedDate.getMinutes()).padStart(2,'0')}`;
            const newId = `LES-${taughtPart}_${createdPart}_${rnd}`;

            const payload: Record<string, any> = {
              id: newId,
              date: iso,
              teacherId: teacher.id,
              teacherName: teacher.name,
              studentIds: resolvedStudents.map(s => s.id),
              studentNames: resolvedStudents.map(s => s.name),
              schoolId: school.id,
              schoolName: school.name,
              status,
              durationMinutes,
              type,
              deliveryMode,
              teacherRate,
              schoolRate,
              createdAt: Date.now(),
            };
            if (rawEffort >= 1 && rawEffort <= 5) payload.interactivity = rawEffort;
            if (rawPractice >= 1 && rawPractice <= 5) payload.behavior = rawPractice;
            if (rawLearning) payload.learning = rawLearning;
            if (rawNotes) payload.notes = rawNotes;
            if (rawGrade) payload.overallGrade = rawGrade;
            if (rawRepertoire) payload.repertoire = rawRepertoire;
            if (rawPracticeAssignment) payload.practiceAssignment = rawPracticeAssignment;
            if (rawExamPrep) payload.examPrepStatus = rawExamPrep;
            if (canEditComments && rawSchoolComment) payload.schoolAdminComment = rawSchoolComment;
            if (canEditComments && rawInternalComment) payload.schoolAdminInternalComment = rawInternalComment;

            batch.set(doc(db, 'lessons', newId), cleanData(payload), { merge: true });
            added += 1;
            continue;
          }

          // -----------------------------------------------------------------
          // UPDATE EXISTING LESSON
          // -----------------------------------------------------------------
          const existing = state.lessons.find(l => l.id === lessonId);
          if (!existing) { skipped += 1; continue; }

          // Role scope guards
          if (role === Role.TEACHER && currentUserId && existing.teacherId !== currentUserId) { skipped += 1; continue; }
          if (role === Role.SCHOOL_ADMIN && roleSchoolId && existing.schoolId !== roleSchoolId) { skipped += 1; continue; }

          const patch: Record<string, any> = {};

          if (rawStatus && validStatuses.has(rawStatus as LessonStatus) && rawStatus !== existing.status) {
            patch.status = rawStatus as LessonStatus;
          }
          if (!isNaN(rawDuration) && rawDuration > 0 && rawDuration !== existing.durationMinutes) {
            patch.durationMinutes = rawDuration;
          }
          if (!isNaN(rawEffort) && rawEffort >= 1 && rawEffort <= 5 && rawEffort !== existing.interactivity) {
            patch.interactivity = rawEffort;
          }
          if (!isNaN(rawPractice) && rawPractice >= 1 && rawPractice <= 5 && rawPractice !== existing.behavior) {
            patch.behavior = rawPractice;
          }
          if (rawLearning && rawLearning !== (existing.learning ?? '')) patch.learning = rawLearning;
          if (rawNotes && rawNotes !== (existing.notes ?? '')) patch.notes = rawNotes;
          if (rawGrade && rawGrade !== (existing.overallGrade ?? '')) patch.overallGrade = rawGrade;
          if (rawRepertoire && rawRepertoire !== (existing.repertoire ?? '')) patch.repertoire = rawRepertoire;
          if (rawPracticeAssignment && rawPracticeAssignment !== (existing.practiceAssignment ?? '')) patch.practiceAssignment = rawPracticeAssignment;
          if (rawExamPrep && rawExamPrep !== (existing.examPrepStatus ?? '')) patch.examPrepStatus = rawExamPrep;

          // Role-gated comments
          if (canEditComments && rawSchoolComment && rawSchoolComment !== (existing.schoolAdminComment ?? '')) {
            patch.schoolAdminComment = rawSchoolComment;
          }
          if (canEditComments && rawInternalComment && rawInternalComment !== (existing.schoolAdminInternalComment ?? '')) {
            patch.schoolAdminInternalComment = rawInternalComment;
            patch.hasUnreadAdminNote = true;
          }

          // Admin-only: explicit "#<n>" override on financial columns
          if (canEditFinancials) {
            const teacherPayCell = parseRateCell(row['Teacher Pay (SAR)']);
            const schoolBillCell = parseRateCell(row['School Bill (SAR)']);
            if (teacherPayCell.override && teacherPayCell.value !== null && teacherPayCell.value !== existing.teacherRate) {
              patch.teacherRate = teacherPayCell.value;
            }
            if (schoolBillCell.override && schoolBillCell.value !== null && schoolBillCell.value !== existing.schoolRate) {
              patch.schoolRate = schoolBillCell.value;
            }
          }

          if (Object.keys(patch).length === 0) { skipped += 1; continue; }

          // Recalculate rates when status or duration changes — unless admin already overrode
          const rateAlreadyOverridden = patch.teacherRate !== undefined || patch.schoolRate !== undefined;
          if (!rateAlreadyOverridden && (patch.status !== undefined || patch.durationMinutes !== undefined)) {
            const effectiveStatus = (patch.status ?? existing.status) as LessonStatus;
            const effectiveDuration = (patch.durationMinutes ?? existing.durationMinutes) as number;
            if (effectiveStatus === LessonStatus.ABSENT_EXCUSED || effectiveStatus === LessonStatus.CANCELLED) {
              patch.teacherRate = 0;
              patch.schoolRate = 0;
            } else {
              const rates = calcRates({
                teacherId: existing.teacherId, schoolId: existing.schoolId,
                type: existing.type, deliveryMode: getDeliveryMode(existing),
                durationMinutes: effectiveDuration,
                studentIds: existing.studentIds, studentNames: existing.studentNames,
              });
              patch.teacherRate = rates.teacherRate;
              patch.schoolRate = rates.schoolRate;
            }
          }

          batch.set(doc(db, 'lessons', lessonId), cleanData(patch), { merge: true });
          updated += 1;
        } catch {
          errors += 1;
        }
      }
      await batch.commit();
    }
    return { added, updated, skipped, errors };
  };

  // ---------------------------
  // Phase 17.1: Dead financial functions removed.
  // calculateGroupLessonFinancials, calculateLessonFinancials,
  // calculateTeacherEarnings, calculateSchoolRevenue were never called
  // from any UI page. All pages read lesson snapshot fields (teacherRate,
  // schoolRate) directly. Rate resolution is now in services/rateService.ts.
  // ---------------------------

  // ---------------------------
  // ---------------------------
  // Auth actions
  // ---------------------------

  const login = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Login failed' };
    }
  };

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      return { success: true };
    } catch (e: any) {
      // Fallback to redirect if popup is blocked
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(auth, googleProvider);
          return { success: true };
        } catch (redirectErr: any) {
          return { success: false, message: redirectErr?.message || 'Google login failed' };
        }
      }
      return { success: false, message: e?.message || 'Google login failed' };
    }
  };

  // Phase 9: Link parent to students (set childIds on parent doc)
  const linkParentToStudents = async (parentId: string, childIds: string[]) => {
    try {
      const parentRef = doc(db, 'parents', parentId);
      const snap = await getDoc(parentRef);
      if (!snap.exists()) return { success: false, message: 'Parent not found.' };
      const existing: string[] = (snap.data() as any).childIds || [];
      const merged = [...new Set([...existing, ...childIds])];
      await setDoc(parentRef, { childIds: merged }, { merge: true });
      return { success: true };
    } catch (e: any) {
      console.error('linkParentToStudents failed', e);
      return { success: false, message: e?.message || 'Failed to link parent.' };
    }
  };

  // Phase 9: Unlink a single student from parent
  const unlinkParentFromStudent = async (parentId: string, childId: string) => {
    try {
      const parentRef = doc(db, 'parents', parentId);
      const snap = await getDoc(parentRef);
      if (!snap.exists()) return { success: false, message: 'Parent not found.' };
      const existing: string[] = (snap.data() as any).childIds || [];
      const updated = existing.filter(id => id !== childId);
      await setDoc(parentRef, { childIds: updated }, { merge: true });
      return { success: true };
    } catch (e: any) {
      console.error('unlinkParentFromStudent failed', e);
      return { success: false, message: e?.message || 'Failed to unlink student.' };
    }
  };

  const logout = async () => {
    await signOut(auth);
    stopListeners();
    setState(defaultState);
    setPersistenceMode('local');
  };

  // ---------------------------
  // Provide
  // ---------------------------

  const value: AppContextType = useMemo(
    () => ({
      ...state,
      persistenceMode,
      authLoading,
      authError,
      login,
      loginWithGoogle,
      logout,
      addLesson,
      updateLesson,
      repairSchoolRates,
      updateLessonSchoolComment,
      clearUnreadAdminNote,
      deleteLesson,
      addSchool,
      addUser,
      addStudent,
      updateSchool,
      updateUser,
      updateStudent,
      deleteUser,
      deleteSchool,
      deleteStudent,
      processStudentImport,
      processLessonImport,
      formatCurrency,
      getCurrency,
      getCurrencySymbol,
      // Phase 17.1: Dead financial functions removed from context value
      linkParentToStudents,
      unlinkParentFromStudent,
      addBooking,
      updateBooking,
      convertBookingToLesson,
      addTimetableSlot,
      updateTimetableSlot,
      deleteTimetableSlot,
      generateLessonsFromTimetable,
      addEnrollment,
      updateEnrollment,
      deleteEnrollment,
      addSchoolEnrollmentPeriod,
      updateSchoolEnrollmentPeriod,
      deleteSchoolEnrollmentPeriod,
      addInvoice,
      updateInvoice,
      deleteInvoice,
      addPayment,
      updatePayment,
      deletePayment,
      addPayrollRun,
      updatePayrollRun,
      deletePayrollRun,
      updateLessonEnrollmentLink,
      batchUpdateLessonEnrollmentLinks,
      batchAddEnrollments,
    }),
    [
      state,
      persistenceMode,
      authLoading,
      authError
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
