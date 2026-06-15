
export enum Role {
  ADMIN = 'admin',
  TEACHER = 'teacher',
  PARENT = 'parent',
  STUDENT = 'student',
  SCHOOL_ADMIN = 'school_admin'
}

export enum LessonStatus {
  PRESENT = 'Present',
  TAUGHT = 'Taught',
  ABSENT_EXCUSED = 'Absent (Excused)',
  ABSENT_UNEXCUSED = 'Absent (Unexcused)',
  CANCELLED = 'Cancelled'
}

// Phase 15: Delivery mode — first-class system field
export enum DeliveryMode {
  IN_PERSON = 'in_person',
  ONLINE = 'online'
}

/**
 * Phase 15: Centralized helper — ALL reads of lesson.deliveryMode must use this.
 * Returns the delivery mode, defaulting to IN_PERSON for legacy lessons without the field.
 */
export function getDeliveryMode(lesson: { deliveryMode?: DeliveryMode }): DeliveryMode {
  return lesson.deliveryMode || DeliveryMode.IN_PERSON;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  // Added email property to fix Object literal errors in AppContext.tsx
  email?: string;
  password?: string;
  instrument?: string;
  // school_admin: which school they manage
  schoolId?: string;
  /** Firebase Auth UID — recorded on first login so rules can match request.auth.uid */
  uid?: string;
  /** Unix ms timestamp of the user's most recent login — written by onAuthStateChanged */
  lastLogin?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: Student-Centered Teacher Assignment
// Structured record of who teaches a student, on which instrument.
// Source of truth for current assignments; lessons remain historical truth.
// ─────────────────────────────────────────────────────────────────────────────
export interface TeachingAssignment {
  /** e.g. "Piano" */
  instrument: string;
  /** App-side email-based ID, e.g. "dana_example_com" */
  teacherId: string;
  /** Firebase Auth UID — null until the teacher has logged in at least once */
  teacherUid: string | null;
  /** Optional: student may have different schools per instrument */
  schoolId?: string;
  /** false = historical; kept on the student for a trailing window */
  isActive: boolean;
  /** ISO timestamp when this assignment became active */
  assignedAt: string;
  /** ISO timestamp when isActive was flipped to false */
  endedAt?: string;
}

// Phase 17.G: Guarantee system types
export type GuaranteeAppliesTo = 'in_person_only' | 'online_only' | 'both';
export interface GuaranteeConfig {
  enabled: boolean;
  minHours: number;
  appliesTo: GuaranteeAppliesTo;
}

export interface School {
  id: string;
  name: string;
  code: string; // 2-letter code (SS)
  defaultRate: number; // Individual hourly rate
  defaultGroupRate?: number; // Group hourly rate PER STUDENT
  teacherRates?: Record<string, number>; // Custom rates per teacher ID
  instrumentRates?: Record<string, number>; // Custom rates per instrument
  // Phase 17.G: School guarantee — keyed by instrument (lowercase+trimmed).
  // Affects INVOICES only. Always billed if enabled. Per day per instrument.
  guaranteesByInstrument?: Record<string, GuaranteeConfig>;
  // Legacy (read-only fallback): old guarantee field, do NOT write to this after 17.G
  minimumDailyHoursByInstrument?: Record<string, { minHours: number; guaranteed: boolean }>;
  adminIds?: string[]; // School admin UIDs linked to this school (Phase 12)
  // Phase 16: Online lesson pricing
  defaultOnlineRate?: number;                      // Online individual hourly rate
  defaultOnlineGroupRate?: number;                 // Online group hourly rate PER STUDENT
  onlineTeacherRates?: Record<string, number>;     // Online custom rates per teacher ID
  onlineInstrumentRates?: Record<string, number>;  // Online custom rates per instrument
}

export interface Teacher {
  id: string;
  name: string;
  instrument: string;
  code: string; // 2-digit code (TT)
  baseRate: number; // Individual hourly pay
  baseGroupRate?: number; // Group hourly pay PER STUDENT
  ratesBySchool?: Record<string, number>; // Custom hourly rate per School ID
  // Phase 17.G: Teacher guarantee — keyed by schoolId → instrument (lowercase+trimmed).
  // Affects PAYROLL only. Activates only if ≥1 counted lesson that day.
  // Per teacher + school + instrument + date.
  guaranteesBySchool?: Record<string, Record<string, GuaranteeConfig>>;
  // Legacy (read-only fallback): old guarantee field, do NOT write to this after 17.G
  minimumDailyHoursByInstrument?: Record<string, { minHours: number; guaranteed: boolean }>;
  // Phase 16: Online lesson configuration
  supportsOnline?: boolean;                    // Teacher can deliver online lessons
  onlineRate?: number;                         // Online individual hourly pay
  onlineGroupRate?: number;                    // Online group hourly pay PER STUDENT
  onlineRatesBySchool?: Record<string, number>; // Online custom rate per School ID
  /** Formal display name for reports, e.g. "Mrs. Susan S. Dela Rosa". Falls back to name. */
  reportDisplayName?: string;
  /** Firebase Storage URL of the teacher's handwritten signature PNG for report PDFs. */
  signatureUrl?: string;
}

export interface Student {
  id: string;
  name: string;
  schoolId: string;
  /** @deprecated — kept for backward compat; primary assignment now lives in teachingAssignments */
  teacherId: string;
  /** @deprecated — primary instrument now reflected in teachingAssignments */
  instrument: string;
  phone?: string; // Added for search
  uid?: string;          // Firebase Auth uid — enables student portal login (Phase 11)
  parentIds?: string[];  // Parent uids linked to this student (Phase 11)
  yearGrade?: string;    // Phase 19.4B/C — digits-only (e.g. "5", "10") normalised via normaliseGrade()
  email?: string;        // Phase 19.4B — normalized to lowercase
  dateOfBirth?: string;  // Phase 19.4B — ISO date YYYY-MM-DD

  // ── Phase: Student-Centered Teacher Assignment ────────────────────────────
  /** Structured teaching assignments (current + trailing history). Source of truth. */
  teachingAssignments?: TeachingAssignment[];
  /** Derived mirror — active teacherIds (app email-based IDs). Never write directly. */
  currentTeacherIds?: string[];
  /** Derived mirror — active Firebase Auth UIDs. Used in Firestore rules. Never write directly. */
  currentTeacherUids?: string[];
}

/**
 * Check whether a teacher (by app email-based ID) is currently assigned to a student.
 *
 * Uses currentTeacherIds (the derived mirror) when available — supports multi-teacher.
 * Falls back to legacy student.teacherId for students not yet backfilled.
 *
 * Use this everywhere teacher-scoped student filtering happens. Never compare
 * student.teacherId directly in new code.
 */
export function isTeacherOf(student: Student, teacherId: string): boolean {
  if (student.currentTeacherIds && student.currentTeacherIds.length > 0) {
    return student.currentTeacherIds.includes(teacherId);
  }
  return student.teacherId === teacherId;
}

export interface Lesson {
  id: string; // Format: SS-TT-NNNN
  date: string; // ISO string
  teacherId: string;
  teacherName: string;
  studentIds: string[];
  studentNames: string[];
  schoolId: string;
  schoolName: string;
  status: LessonStatus;
  durationMinutes: number;
  type: 'Individual' | 'Group';
  
  // Financials (Snapshot at time of creation)
  teacherRate: number; // Cost (Expense) - What teacher earns
  schoolRate: number; // Billing (Revenue) - What school is invoiced
  
  // Evaluation
  notes?: string;
  learning?: string;
  interactivity?: number; // 1-5
  behavior?: number; // 1-5

  // Expanded evaluation (Phase 13)
  overallGrade?: string;        // e.g. "Grade 3", "Beginner", "Advanced"
  repertoire?: string;          // piece/repertoire being studied
  practiceAssignment?: string;  // homework / practice tasks
  examPrepStatus?: string;      // e.g. "Not started", "Preparing", "Ready", "Completed"

  // Delivery mode (Phase 15) — optional in type for backward compat only.
  // All NEW lessons MUST have this set. Use getDeliveryMode() for all reads.
  deliveryMode?: DeliveryMode;

  // Enrollment link (Phase 17) — links lesson to an enrollment package.
  // Optional: standalone/ad-hoc/legacy lessons have no enrollment.
  enrollmentId?: string;

  // School admin comments (Phase 19.2A)
  schoolAdminComment?: string;         // Official school-side comment — appears on parent-facing PDF as "School Teacher Comment"
  schoolAdminInternalComment?: string;  // Internal school-admin note — NOT on parent PDF

  // Unread indicator (Phase 19.2C)
  // Set true by school admin when internal comment is written/updated (real change only).
  // Cleared to false when the assigned teacher opens ViewLessonModal.
  // Masked to undefined for parent/student (same scope as schoolAdminInternalComment).
  hasUnreadAdminNote?: boolean;

  // Metadata
  createdAt?: number; // Unix ms timestamp — optional for backward compat with pre-existing lessons
}

// Phase 14: Booking system
export enum BookingStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CONVERTED = 'converted',  // booking has been turned into a Lesson
  CANCELLED = 'cancelled'
}

export enum BookingType {
  TRIAL = 'trial',
  REGULAR = 'regular'
}

export interface Booking {
  id: string;
  // Who requested it
  requestedBy: string;       // uid of the requester (parent or admin)
  requestedByName: string;
  requestedAt: number;       // timestamp
  // Lesson details (proposed)
  studentId: string;
  studentName: string;
  schoolId?: string;
  schoolName?: string;
  teacherId?: string;        // may be unassigned initially
  teacherName?: string;
  instrument: string;
  type: BookingType;
  lessonType: 'Individual' | 'Group';
  durationMinutes: number;
  preferredDate?: string;    // ISO date string — requested date/time
  notes?: string;            // requester notes (e.g. "morning preferred")
  // Admin workflow
  status: BookingStatus;
  adminNotes?: string;       // admin internal notes
  reviewedBy?: string;       // admin uid who approved/rejected
  reviewedAt?: number;       // timestamp
  convertedLessonId?: string; // once converted, link to the created lesson
  deliveryMode?: DeliveryMode; // Phase 15: requested delivery mode
}

export interface Parent {
  id: string;           // same as user uid (Firestore doc key)
  parentId?: string;    // human-readable display ID: PAR-001 (Phase 9.1)
  name: string;
  email: string;
  phone?: string;
  childIds: string[];   // references to student IDs
}

// Phase 15: Teacher weekly timetable slot
export interface TimetableSlot {
  id: string;
  teacherId: string;
  teacherName: string;
  studentIds: string[];        // 1 for individual, N for group
  studentNames: string[];
  schoolId: string;            // empty string for private students
  schoolName: string;          // "Private" for private students
  instrument: string;
  dayOfWeek: number;           // 0=Sun, 1=Mon, ..., 6=Sat
  startTime: string;           // "HH:MM" 24h format
  endTime: string;             // "HH:MM" 24h format
  durationMinutes: number;
  type: 'Individual' | 'Group';
  deliveryMode: DeliveryMode;
  isActive: boolean;           // pause/resume without deleting
  notes?: string;
  createdAt: number;
}

// Phase 17.2: Enrollment entity — course/package enrollment per student
export enum EnrollmentStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled'
}

export enum EnrollmentPayerType {
  PARENT = 'parent',
  SCHOOL = 'school',
  SELF   = 'self'        // Phase 19.6: adult students paying for themselves
}

export enum EnrollmentBillingStatus {
  PAID = 'paid',
  TO_BE_INVOICED = 'to_be_invoiced'
}

/**
 * Phase 17.2: Statuses that count toward enrollment lesson consumption.
 * A lesson counts as "consumed" if its status is in this set.
 * Cancelled lessons do NOT consume enrollment slots.
 * Absent (Excused) does NOT consume — lesson can be rescheduled.
 */
export const ENROLLMENT_CONSUMED_STATUSES: readonly LessonStatus[] = [
  LessonStatus.PRESENT,
  LessonStatus.TAUGHT,
  LessonStatus.ABSENT_UNEXCUSED,  // student's fault — slot consumed
] as const;

export interface Enrollment {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  schoolId?: string;           // undefined for private students
  schoolName?: string;         // undefined for private students
  instrument: string;
  // Package details
  totalLessons: number;        // total lessons in this package
  durationMinutes: number;     // per-lesson duration
  lessonType: 'Individual' | 'Group';
  deliveryMode: DeliveryMode;
  // Billing
  payerType: EnrollmentPayerType;
  billingStatus: EnrollmentBillingStatus;
  priceExpected?: number;      // total expected price for the package (future invoice use)
  // Status
  status: EnrollmentStatus;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;           // admin uid who created

  // ── Phase 19.6: Enrollment period & dating ──

  /** When lessons can be scheduled/consumed — ISO 'YYYY-MM-DD', optional for backward compat */
  startDate?: string;
  endDate?: string;

  /** Link to the school enrollment period this was derived from (if any) */
  schoolPeriodId?: string;

  /** True = admin manually overrode dates, ignoring the linked school period.
   *  False/undefined = dates inherited from school period and eligible for bulk updates. */
  isDateOverride?: boolean;

  /** True = admin manually set a custom durationMinutes for this student, overriding the school/period default.
   *  False/undefined = duration inherited from school period or left at default. */
  isDurationOverride?: boolean;

  /** Academic context — derived from school period or set manually */
  academicYear?: string;       // e.g. "2025-2026"
  term?: string;               // e.g. "Term 1", "Semester 2" — free text
}

/**
 * Phase 17.2: Compute remaining lessons for an enrollment.
 * consumed = lessons matching enrollmentId with a consumed status.
 * remaining = totalLessons - consumed (min 0).
 */
export function getEnrollmentRemaining(
  enrollment: Enrollment,
  lessons: Pick<Lesson, 'enrollmentId' | 'status'>[]
): { consumed: number; remaining: number } {
  const consumed = lessons.filter(
    l => l.enrollmentId === enrollment.id
      && (ENROLLMENT_CONSUMED_STATUSES as readonly string[]).includes(l.status)
  ).length;
  return {
    consumed,
    remaining: Math.max(0, enrollment.totalLessons - consumed)
  };
}

// ---------------------------------------------------------------------------
// Phase 19.6D1: Enrollment current/historical classification + active-key logic
// ---------------------------------------------------------------------------

/**
 * Today's date as ISO 'YYYY-MM-DD'. Helper for callers who don't want to build
 * the string themselves. Uses local time — matches how lesson/enrollment dates
 * are stored in this app.
 */
export function getTodayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Phase 19.6D1: Is this enrollment currently active for its student's slot?
 *
 * Rules (from Phase 19.6D plan, section 3):
 *   - status must be 'active' or 'paused'
 *   - no endDate  → undated enrollment is always current while active/paused
 *   - has endDate → current only while today <= endDate (inclusive last day)
 *
 * `today` is injected as an ISO 'YYYY-MM-DD' string so tests / UI code can
 * pass a fixed date. Callers that just need "right now" can use getTodayISO().
 */
export function isCurrentEnrollment(
  enrollment: Pick<Enrollment, 'status' | 'endDate'>,
  today: string
): boolean {
  if (
    enrollment.status !== EnrollmentStatus.ACTIVE &&
    enrollment.status !== EnrollmentStatus.PAUSED
  ) {
    return false;
  }
  if (!enrollment.endDate) return true;
  return enrollment.endDate >= today;
}

/**
 * Phase 19.6D1: Is this enrollment historical?
 *
 * Historical = no longer occupies a student's current slot:
 *   - status 'completed' or 'cancelled' → always historical
 *   - active/paused with an expired endDate → historical (even though the
 *     record still reads active until a human completes it)
 *
 * Paired with isCurrentEnrollment — the two are mutually exclusive.
 */
export function isHistoricalEnrollment(
  enrollment: Pick<Enrollment, 'status' | 'endDate'>,
  today: string
): boolean {
  if (
    enrollment.status === EnrollmentStatus.COMPLETED ||
    enrollment.status === EnrollmentStatus.CANCELLED
  ) {
    return true;
  }
  if (enrollment.endDate && enrollment.endDate < today) return true;
  return false;
}

/**
 * Phase 19.6D1: Active-slot key for duplicate detection.
 *
 * The locked rule (Phase 19.6D plan, section 3 + section 10):
 *   "one active enrollment per (studentId, instrument, schoolId || 'private')"
 *
 * `schoolId` is nullable so a student can run parallel programs at different
 * schools (e.g. Piano @ School A + Piano @ School B is allowed). Two active
 * Piano enrollments at the same school are not.
 *
 * Instrument is normalised (trim + lowercase) so "Piano" and "piano " collapse.
 */
export function getEnrollmentActiveKey(
  enrollment: Pick<Enrollment, 'studentId' | 'instrument' | 'schoolId'>
): string {
  const school = enrollment.schoolId || 'private';
  const instrument = (enrollment.instrument || '').trim().toLowerCase();
  return `${enrollment.studentId}::${instrument}::${school}`;
}

/**
 * Phase 19.6D1: Read-only lookup — all current enrollments for a student.
 *
 * Returns enrollments where:
 *   - studentId matches
 *   - isCurrentEnrollment(e, today) is true
 *
 * Under the active-key rule there should be at most one per (instrument,
 * school) combination; this helper returns all of them so callers can display
 * multi-instrument students. No writes, no side effects.
 */
export function getCurrentEnrollmentsForStudent(
  studentId: string,
  enrollments: Enrollment[],
  today: string
): Enrollment[] {
  return enrollments.filter(
    e => e.studentId === studentId && isCurrentEnrollment(e, today)
  );
}

/**
 * Phase 19.6D1: Find an enrollment that would block `candidate` under the
 * active-key rule, or null if there is no conflict.
 *
 * Used by write-time validation in addEnrollment / updateEnrollment. Only
 * current enrollments are considered on both sides:
 *   - A candidate that is itself not current can never be in conflict
 *     (completing or cancelling is always allowed).
 *   - Completed / cancelled / expired records can never block a new write.
 *
 * Pass `ignoreId` to exclude the enrollment being updated from the scan so it
 * doesn't collide with itself.
 */
export function findConflictingEnrollment(
  candidate: Pick<Enrollment, 'studentId' | 'instrument' | 'schoolId' | 'status' | 'endDate'>,
  allEnrollments: Enrollment[],
  today: string,
  ignoreId?: string
): Enrollment | null {
  if (!isCurrentEnrollment(candidate, today)) return null;
  const key = getEnrollmentActiveKey(candidate);
  return (
    allEnrollments.find(
      e =>
        e.id !== ignoreId &&
        getEnrollmentActiveKey(e) === key &&
        isCurrentEnrollment(e, today)
    ) || null
  );
}

// ---------------------------------------------------------------------------
// Phase 19.6: School Enrollment Period
// ---------------------------------------------------------------------------

/**
 * A school-level default enrollment period (e.g. "2025-2026 Term 1").
 * Stored in its own top-level Firestore collection: /schoolEnrollmentPeriods/{id}
 * NOT embedded inside School documents — enables cross-school querying.
 */
export interface SchoolEnrollmentPeriod {
  id: string;                  // e.g. "sep_1711234567_abc123"
  schoolId: string;
  schoolName: string;          // denormalised for display

  /** Period identity */
  name: string;                // e.g. "2025-2026 Term 1"
  academicYear: string;        // e.g. "2025-2026"
  term?: string;               // e.g. "Term 1", "Semester 2" (optional)

  /** Date range — ISO 'YYYY-MM-DD' */
  startDate: string;
  endDate: string;

  /** Package defaults for enrollments created from this period (editable per student) */
  defaultTotalLessons: number;
  defaultDurationMinutes: number;

  /** Status — 'archived' is soft-delete; archived periods are hidden from dropdowns */
  status: 'active' | 'archived';

  createdAt: number;
  updatedAt: number;
  createdBy: string;           // admin uid
}

/**
 * Phase 19.6: Check whether a lesson date falls within an enrollment's period.
 * Returns true if the enrollment has no dates (undated = always valid) or if
 * lesson.date is within [startDate, endDate] inclusive.
 * Used as an advisory check — does NOT block lesson creation.
 */
export function isLessonInEnrollmentPeriod(
  lesson: Pick<Lesson, 'date'>,
  enrollment: Pick<Enrollment, 'startDate' | 'endDate'>
): boolean {
  if (!enrollment.startDate || !enrollment.endDate) return true;
  return lesson.date >= enrollment.startDate && lesson.date <= enrollment.endDate;
}

// Phase 17.3: Invoice entity
export enum InvoiceStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled'
}

export enum InvoicePayerType {
  SCHOOL = 'school',   // B2B
  PARENT = 'parent'    // B2C
}

export interface InvoiceLineItem {
  lessonId?: string;      // links to lesson snapshot (undefined for manual/adjustment lines)
  date?: number;          // timestamp of the lesson or adjustment
  description: string;    // e.g. "Piano - Individual - 30min - Ahmed" or "Discount"
  amount: number;         // positive for charges, negative for credits/discounts
}

/**
 * Phase 17.3: Compute subtotal from line items.
 * Subtotal is NOT stored — always derived from lineItems.
 */
export function getInvoiceSubtotal(lineItems: InvoiceLineItem[]): number {
  return parseFloat(lineItems.reduce((sum, li) => sum + (li.amount || 0), 0).toFixed(2));
}

/**
 * Phase 17.3: Compute balance due.
 * balanceDue is NOT stored — always derived from totalAmount - paidAmount.
 */
export function getInvoiceBalanceDue(invoice: Pick<Invoice, 'totalAmount' | 'paidAmount'>): number {
  return parseFloat((invoice.totalAmount - (invoice.paidAmount || 0)).toFixed(2));
}

export interface Invoice {
  id: string;
  invoiceNumber: string;  // INV-YYYYMM-XXXX (sequential per month)
  // Payer
  payerId: string;        // school ID or parent ID
  payerType: InvoicePayerType;
  payerName: string;
  // Optional enrollment link (B2C enrollment-based invoices)
  enrollmentId?: string;
  // Line items — snapshotted at creation, never recomputed
  lineItems: InvoiceLineItem[];
  // Totals
  // subtotal: computed from lineItems via getInvoiceSubtotal() — NOT stored
  adjustments: number;    // manual +/- (discount, late fee, etc.)
  vatRate?: number;       // VAT percentage applied (e.g. 15). undefined/0 = no VAT (legacy invoices)
  vatAmount?: number;     // (subtotal + adjustments) × vatRate/100 — stored snapshot
  totalAmount: number;    // getInvoiceSubtotal(lineItems) + adjustments + vatAmount — primary stored total
  paidAmount: number;     // tracks partial payments (Phase 17.4 updates this)
  // balanceDue: computed via getInvoiceBalanceDue() — NOT stored
  // Status
  status: InvoiceStatus;
  isLocked: boolean;      // true after issue/pay — edit requires explicit unlock
  // Period
  periodStart: string;    // ISO date (YYYY-MM-DD)
  periodEnd: string;      // ISO date (YYYY-MM-DD)
  fromDate?: string;      // Phase 17.6A: optional "from" date for display clarity
  issuedDate: string;     // ISO date (YYYY-MM-DD)
  dueDate: string;        // ISO date (YYYY-MM-DD)
  // Metadata
  currency: string;       // e.g. "SAR"
  notes?: string;
  createdAt: number;
  createdBy: string;      // admin uid
  updatedAt: number;
}

// Phase 17.4: Payment entity
export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded'
}

export enum PaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CARD = 'card',
  MADA = 'mada',
  APPLE_PAY = 'apple_pay',
  OTHER = 'other'
}

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;    // display snapshot only — NOT source of truth
  payerName: string;        // display snapshot only — NOT source of truth
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference?: string;       // bank ref, transaction ID, receipt number
  notes?: string;
  paidAt?: number;          // timestamp of actual payment (required for completed/refunded)
  createdAt: number;
  createdBy: string;        // admin uid
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Phase 17.6: Payroll Entity
// ---------------------------------------------------------------------------

export enum PayrollStatus {
  DRAFT = 'draft',
  APPROVED = 'approved',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  CANCELLED = 'cancelled'
}

export interface PayrollLineItem {
  date: number;           // timestamp
  description: string;
  hours: number;
  rate: number;
  amount: number;
  lessonId?: string;      // undefined for guarantee lines
  schoolId?: string;
  schoolName?: string;
  instrument?: string;
  type: 'lesson' | 'guarantee' | 'manual_adjustment';
}

export interface PayrollRun {
  id: string;
  payrollNumber: string;  // PAY-YYYYMM-XXXX (counter per month)
  teacherId: string;
  teacherName: string;    // display snapshot
  // Period
  periodStart: string;    // ISO date YYYY-MM-DD
  periodEnd: string;      // ISO date YYYY-MM-DD
  schoolFilter?: string;  // optional: limit to one school
  // Line items — snapshotted at creation, immutable once APPROVED/PAID
  lineItems: PayrollLineItem[];
  // Totals — frozen at creation, immutable once APPROVED/PAID
  lessonTotal: number;
  guaranteeTotal: number;
  manualAdjustmentTotal?: number;  // Phase 17.6A: sum of manual_adjustment lines
  totalPayable: number;   // lessonTotal + guaranteeTotal + manualAdjustmentTotal
  // Settlement
  paidAmount: number;
  // balanceDue = totalPayable - paidAmount (computed via getPayrollBalanceDue, NOT stored)
  status: PayrollStatus;
  isLocked: boolean;      // true when APPROVED or PAID — lineItems + totalPayable immutable
  paidAt?: number;        // timestamp when fully paid
  // Metadata
  notes?: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

/** Compute balance due for a payroll run (NOT stored). */
export function getPayrollBalanceDue(p: PayrollRun): number {
  return Math.max(0, parseFloat((p.totalPayable - p.paidAmount).toFixed(2)));
}

export interface AppState {
  currentUser: User | null;
  users: User[];
  schools: School[];
  teachers: Teacher[];
  students: Student[];
  lessons: Lesson[];
  parents: Parent[];
  bookings: Booking[];  // Phase 14
  timetableSlots: TimetableSlot[];  // Phase 15
  enrollments: Enrollment[];  // Phase 17.2
  schoolEnrollmentPeriods: SchoolEnrollmentPeriod[];  // Phase 19.6
  invoices: Invoice[];  // Phase 17.3
  payments: Payment[];  // Phase 17.4
  payrollRuns: PayrollRun[];  // Phase 17.6
  // Tracks the counter for SS-TT pairs
  // Key: "SSTT" (e.g. "KC01"), Value: current count (e.g. 34)
  lessonCounters: Record<string, number>;
}

// Phase 16: Online session architecture — provider-agnostic interface (stub)
// Implementation deferred. This defines the contract for future online meeting integration.
export interface OnlineSessionConfig {
  provider: 'zoom' | 'google_meet' | 'teams' | 'custom';
  meetingUrl?: string;
  meetingId?: string;
  passcode?: string;
  autoCreate?: boolean;  // auto-generate meeting link on lesson creation
}
