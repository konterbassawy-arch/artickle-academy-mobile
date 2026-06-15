# ARTickle Academy — Full System Test Plan & Master Documentation

> **Purpose:** Complete system understanding, page-by-page breakdown, role permission map, data flow, and exhaustive test scenarios.
> **Scope:** All modules, all roles, all financial flows, all edge cases.
> **Status:** Production-safe reference. Do NOT modify code based on this document without explicit approval.
> **Generated:** 2026-03-30

---

## TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Architecture & Data Flow](#2-architecture--data-flow)
3. [Role Permission Map](#3-role-permission-map)
4. [Page-by-Page Breakdown](#4-page-by-page-breakdown)
5. [Financial System Deep Dive](#5-financial-system-deep-dive)
6. [Full Test Plan by Module](#6-full-test-plan-by-module)
7. [Critical Financial Test Scenarios](#7-critical-financial-test-scenarios)
8. [Export Test Scenarios](#8-export-test-scenarios)
9. [Security & Permission Test Scenarios](#9-security--permission-test-scenarios)
10. [Edge Cases & Error Scenarios](#10-edge-cases--error-scenarios)
11. [Known Limitations & Risk Areas](#11-known-limitations--risk-areas)

---

## 1. SYSTEM OVERVIEW

ARTickle Academy is a multi-role music academy management platform built on React + Firebase (Firestore + Auth). It manages lessons, teachers, students, schools, bookings, enrollments, invoices, payments, and payroll across five distinct user roles.

### Technology Stack
- **Frontend:** React 18 + TypeScript + Tailwind CSS + React Router
- **Backend:** Firebase Firestore (real-time) + Firebase Auth
- **Exports:** SheetJS (Excel) + jsPDF (PDF)
- **Build:** Vite
- **Currency:** SAR (ر.س)

### Firestore Collections (13 total)
| Collection | Purpose | Key Fields |
|---|---|---|
| `users` | Auth identity + role | id, email, role, schoolId (for school_admin) |
| `schools` | School entities + rates | id, name, code, defaultRate, guaranteesByInstrument |
| `teachers` | Teacher profiles + rates | id (= auth UID), baseRate, ratesBySchool, guaranteesBySchool |
| `students` | Student records | id, name, schoolId, teacherId, uid (for portal), parentIds |
| `lessons` | Lesson records + financials | id, teacherId, schoolId, status, teacherRate, schoolRate |
| `parents` | Parent profiles + child links | id (= auth UID), childIds |
| `bookings` | Trial/booking requests | id, requestedBy, teacherId, status |
| `timetableSlots` | Weekly recurring slots | id, teacherId, dayOfWeek, startTime |
| `enrollments` | Course packages | id, studentId, teacherId, payerType, totalLessons |
| `invoices` | Billing documents | id, payerId, payerType, status, totalAmount, paidAmount |
| `payments` | Payment records | id, invoiceId, amount, method, status |
| `payrollRuns` | Teacher payroll | id, teacherId, status, totalPayable, paidAmount |
| `counters` | Auto-increment sequences | key → lastValue |

---

## 2. ARCHITECTURE & DATA FLOW

### Layer Stack
```
Firebase Auth
      ↓
AppContext.tsx (single source of truth)
  ├── Role-scoped Firestore listeners (13 collections)
  ├── 44 public CRUD/business methods
  └── Formatting utilities
      ↓
React Components (pages + components)
  ├── Read: state from AppContext
  └── Write: call AppContext methods
      ↓
Services (pure stateless logic)
  ├── rateService.ts        — rate + guarantee resolution
  ├── payrollService.ts     — payroll line generation
  ├── paymentService.ts     — invoice reconciliation
  ├── financialCalculations.ts — legacy reporting metrics
  ├── permissionService.ts  — field-level data filtering
  ├── exportGrouping.ts     — grouped export formatting
  ├── invoiceExportService.ts — invoice Excel + PDF
  └── payrollExportService.ts — payroll Excel + PDF + register
```

### Data Flow: Writing a Lesson (teacher)
```
Teacher fills Attendance form
  → handleSubmit()
  → resolveSchoolRate() [client-side for schoolRate, not exposed to teacher]
  → AppContext.addLesson()
  → cleanData() [undefined → null]
  → setDoc(doc(db, 'lessons', id), ...)
  → Firestore onSnapshot fires for all subscribers
  → Admin sees lesson with schoolRate; teacher sees lesson with schoolRate=0
```

### Data Flow: Invoice Generation (admin)
```
Admin selects payer + period + mode
  → B2B: filter lessons by school + period
      → resolveSchoolGuarantee() per date+instrument
      → Build line items (lesson lines + guarantee adjustment lines)
  → B2C: filter lessons by student/enrollment + period
  → addInvoice() → Firestore write
  → invoiceNumber generated via reserveCounterRange()
```

### Data Flow: Payment + Reconciliation
```
Admin records payment
  → addPayment() → Firestore write
  → setTimeout(500ms) → reconcileInvoice()
  → getInvoicePaidAmount() [sums COMPLETED payments only]
  → resolveInvoiceStatusAfterPayment()
  → updateDoc(invoices/id, { paidAmount, status, isLocked })
```

### Data Flow: Payroll Generation
```
Admin selects teacher + period + school filter
  → generatePayrollLineItems() [payrollService.ts]
  → For each lesson: resolveTeacherRate()
  → For each date+school+instrument: resolveTeacherGuarantee()
  → Build lessonLines + guaranteeLines + manualLines
  → Preview shown to admin
  → addPayrollRun() → Firestore write
  → payrollNumber generated via reserveCounterRange()
```

---

## 3. ROLE PERMISSION MAP

### Access Control Matrix

| Resource | Admin | Teacher | Parent | Student | School Admin |
|---|---|---|---|---|---|
| **users** | Full CRUD | Own read only | None | None | None |
| **schools** | Full CRUD | Read (name/code only) | Read (name only) | Read (name only) | Read own school (full rates) |
| **teachers** | Full CRUD | Own read only (full) | Read (name/instrument only) | Read (name/instrument only) | Read (name/instrument only) |
| **students** | Full CRUD | Read own students, create | Read own children | None (own record only) | Read own school students |
| **lessons** | Full CRUD | Own read/write | Read linked children (no financial) | Read own (no financial) | Read own school (no teacherRate) |
| **bookings** | Full CRUD | Read own, no adminNotes | Read/Create own | None | None |
| **timetableSlots** | Full CRUD | Read own | None | None | None |
| **enrollments** | Full CRUD | None | Read own children | Read own (no financial) | None |
| **invoices** | Full CRUD | None | Read own (payerType=parent) | None | Read own school (payerType=school) |
| **payments** | Full CRUD | None | Read linked to own invoices (no reference) | None | Read linked to own invoices (keeps reference) |
| **payrollRuns** | Full CRUD | Read own (no notes) | None | None | None |
| **counters** | Read/Write | Read/Write | None | None | None |
| **Financials page** | Full | None | None | None | None |
| **Configuration page** | Full | None | None | None | None |

### Field-Level Stripping by Role

#### Lessons
| Field | Admin | Teacher | Parent | Student | School Admin |
|---|---|---|---|---|---|
| `teacherRate` | ✅ | ✅ (own lessons) | ❌ stripped | ❌ stripped | ❌ stripped |
| `schoolRate` | ✅ | ❌ stripped | ❌ stripped | ❌ stripped | ✅ |
| `notes` | ✅ | ✅ (own lessons) | ❌ stripped | ❌ stripped | ❌ stripped |
| `learning` | ✅ | ✅ | ✅ | ✅ | ❌ stripped |
| `interactivity` | ✅ | ✅ | ✅ | ✅ | ❌ stripped |
| `behavior` | ✅ | ✅ | ✅ | ✅ | ❌ stripped |
| `overallGrade` | ✅ | ✅ | ✅ | ✅ | ❌ stripped |
| `repertoire` | ✅ | ✅ | ✅ | ✅ | ❌ stripped |
| `practiceAssignment` | ✅ | ✅ | ✅ | ✅ | ❌ stripped |

#### Enrollments (parent view)
| Field | Admin | Parent | Student |
|---|---|---|---|
| `notes` | ✅ | ❌ stripped | ❌ stripped |
| `createdBy` | ✅ | ❌ (empty string) | ❌ (empty string) |
| `priceExpected` | ✅ | ✅ only if `payerType=parent` | ❌ stripped |
| `billingStatus` | ✅ | ✅ only if `payerType=parent` | ❌ stripped |
| `payerType` | ✅ | ✅ only if `payerType=parent` | ❌ stripped |

#### Payments (by payer role)
| Field | Admin | Parent | School Admin |
|---|---|---|---|
| `notes` | ✅ | ❌ stripped | ❌ stripped |
| `reference` | ✅ | ❌ stripped | ✅ (kept for B2B reconciliation) |

### Portal Routing
| Role | Root Redirect | Protected Route Tree |
|---|---|---|
| admin | `/admin/dashboard` | `/admin/*` |
| teacher | `/teacher/dashboard` | `/teacher/*` (also /attendance, /lessons shared) |
| parent | `/parent/dashboard` | `/parent/*` |
| student | `/student/dashboard` | `/student/*` |
| school_admin | `/school/dashboard` | `/school/*` |

---

## 4. PAGE-BY-PAGE BREAKDOWN

---

### ADMIN PORTAL

---

#### `/admin/dashboard` — Dashboard.tsx (shared)
**What it does:** Shows weekly lesson stats, financial summary cards, recent lessons with edit.
**Data read:** lessons, schools, teachers (via AppContext state)
**Buttons:**
- Edit (per lesson row) → opens EditLessonModal
**Calculations performed client-side:**
- Total revenue (sum schoolRate, active lessons only) with school guarantee adjustments
- Total payroll (sum teacherRate, active lessons only) with teacher guarantee adjustments
- Attendance % (Present+Taught / total non-cancelled)
- Guarantee adjustments per school+date+instrument and teacher+school+date+instrument
**Financial fields visible:** schoolRate (admin), teacherRate (admin)
**Does NOT affect:** No writes on this page except lesson edits via modal

---

#### `/admin/overview` — AdminOverview.tsx
**What it does:** Operational summary — counts, school breakdown, teacher performance.
**Data read:** users, schools, teachers, students, lessons
**Buttons:** Quick links to Manage Users, Onboard Parent, Configuration, Financials
**No writes on this page**

---

#### `/admin/users` — UserManagement.tsx
**What it does:** User CRUD for all 5 roles.
**Data read:** users, teachers, parents, schools
**Buttons:**
- Show/hide create form
- Create User → `addUser()`
- Edit (per row) → opens modal → `updateUser()`
- Delete → `deleteUser()`
**Key behaviors:**
- Role itself cannot be edited (must delete + recreate)
- Teacher creation auto-generates teacher code (`TE_NNN`)
- Parent creation auto-generates parentId (`PAR-NNN`)
- School admin creation stores `schoolId` on user doc
- `deleteUser()` deletes both `users` and `teachers` docs for teacher role
**Does NOT write to:** students, lessons, invoices

---

#### `/admin/parents` — ParentOnboarding.tsx
**What it does:** Create parent + link children.
**Data read:** users, students, parents
**Buttons:**
- Create Parent → `addUser()` with role=parent
- Select Existing Parent → picks from parent list
- Link Student → `linkParentToStudents()`
- Unlink Child → `unlinkParentFromStudent()`
- Back, Link More Children, Onboard Another Parent (flow navigation)
**Key behaviors:**
- Creates/updates `parents.childIds` array
- Parent ID format: PAR-NNN
**Affects:** parents collection, users collection

---

#### `/admin/bookings` — BookingManagement.tsx
**What it does:** Admin booking queue — review, approve, reject, convert to lesson.
**Data read:** bookings, teachers, students, schools
**Buttons:**
- Create Booking → `addBooking()`
- Approve → `updateBooking({ status: 'approved' })`
- Reject → `updateBooking({ status: 'rejected' })`
- Convert to Lesson → `convertBookingToLesson()`
- Save Changes → `updateBooking()`
**Key behaviors:**
- Converting a booking creates a full lesson and sets booking status to `converted`
- Admin can assign teacher and date during conversion
**Affects:** bookings, lessons collections

---

#### `/admin/enrollments` — EnrollmentManagement.tsx
**What it does:** Package enrollment CRUD for students.
**Data read:** enrollments, students, teachers, schools, lessons
**Buttons:**
- New Enrollment → form → `addEnrollment()`
- Edit → form → `updateEnrollment()`
- Delete → `deleteEnrollment()`
**Key behaviors:**
- Progress bar: consumed lessons = lessons with enrollmentId + status in [Present, Taught, Absent_Unexcused]
- Remaining = totalLessons - consumed
- Summary stats: total/active/completed/paused/cancelled counts
- Cross-link to related invoices shown
**Affects:** enrollments collection only

---

#### `/admin/invoices` — InvoiceManagement.tsx
**What it does:** Invoice generation and management — B2B (school) and B2C (parent/enrollment).
**Data read:** invoices, payments, lessons, schools, students, enrollments, teachers
**Buttons:**
- New Invoice → mode selector (B2B / B2C Enrollment / B2C Manual)
- B2B Generate → auto-builds line items from filtered lessons + guarantee adjustments
- B2C Generate → filters lessons by student/enrollment
- Manual mode → free-entry line items
- Remove/Add line item (manual)
- Edit → `updateInvoice()`
- Delete → `deleteInvoice()`
- Excel → `exportInvoiceExcel()`
- PDF → `exportInvoicePDF()`
- View Enrollment → cross-link navigation
- Open Payment → cross-link to payment
**Key behaviors:**
- Invoice number format: `INV-YYYYMM-XXXX` (counter per month)
- Duplicate detection: same payer + same period → warning (not blocked)
- Locking: issued/paid invoices are locked; edit requires explicit unlock
- Guarantee adjustments calculated at generation time and stored as line items
- **Totals are STORED on creation — never recalculated from line items during export**
- paidAmount auto-updated via payment reconciliation
**Affects:** invoices collection (payments via reconciliation trigger)

---

#### `/admin/payments` — PaymentManagement.tsx
**What it does:** Record and manage payments against invoices.
**Data read:** payments, invoices
**Buttons:**
- Record Payment → form → `addPayment()`
- Edit → form → `updatePayment()`
- Delete (requires double-confirm for COMPLETED payments) → `deletePayment()`
**Key behaviors:**
- Only COMPLETED payments count toward invoice paidAmount
- Invoice balance auto-filled when creating payment
- Search by invoice number, payer name, reference
- Summary cards: total recorded, completed, pending, refunded
- After every payment write/delete → reconcileInvoice() fires with 500ms delay
**Affects:** payments collection, triggers reconcileInvoice on invoices

---

#### `/admin/payroll` — PayrollManagement.tsx
**What it does:** Teacher payroll lifecycle — generate, preview, approve, settle, export.
**Data read:** payrollRuns, lessons, teachers, schools
**Buttons:**
- Export Payroll Register → `exportPayrollRegisterExcel()` or `exportPayrollRegisterPDF()`
- Generate Payroll → preview → `addPayrollRun()`
- Approve → `updatePayrollRun({ status: 'approved' })`
- Settle → payment form → `updatePayrollRun({ paidAmount, status })`
- Cancel → `updatePayrollRun({ status: 'cancelled' })`
- Delete (DRAFT or CANCELLED only) → `deletePayrollRun()`
- View → detail modal with line items
- Excel (in modal) → `exportPayrollExcel()`
- PDF (in modal) → `exportPayrollPDF()`
- Add manual line → adds manual_adjustment line item before save
- Remove line (preview only) → removes from preview array, recalculates totals
**Key behaviors:**
- Payroll number format: `PAY-YYYYMM-XXXX`
- Duplicate check: same teacher + period + schoolFilter + non-cancelled → rejected
- Status flow: DRAFT → APPROVED → PARTIALLY_PAID → PAID (or CANCELLED at any non-PAID step)
- Line item types: lesson (blue), guarantee (amber), manual_adjustment (purple)
- Summary cards include ONLY approved + partially_paid + paid (exclude draft + cancelled)
- Line items are snapshotted at creation — approved/paid payrolls are immutable
**Affects:** payrollRuns collection

---

#### `/admin/schedule` — ScheduleManager.tsx
**What it does:** Timetable slot CRUD + lesson generation from schedule.
**Data read:** timetableSlots, teachers, students, schools
**Buttons:**
- New Timetable Slot → `addTimetableSlot()`
- Generate Lessons → date range → `generateLessonsFromTimetable()`
- Edit → `updateTimetableSlot()`
- Pause/Resume → `updateTimetableSlot({ isActive: false/true })`
- Delete → `deleteTimetableSlot()`
**Key behaviors:**
- Slot has dayOfWeek (0-6), startTime (HH:MM), duration, teacher, students
- Only active slots generate lessons during batch generation
**Affects:** timetableSlots, lessons collections

---

#### `/admin/finance` — Financials.tsx
**What it does:** Legacy financial reporting dashboard — school invoicing + teacher payroll tabs.
**Data read:** lessons, schools, teachers (from AppContext state)
**Buttons:**
- School Invoicing tab / Teacher Payroll tab
- Year/Month/School/Teacher filter dropdowns
- Export Excel → `exportSchoolInvoice()` or `exportPayroll()`
**Key behaviors:**
- This is the LEGACY reporting path — independent from the invoice/payroll entity system
- Calculates totals directly from lessons (not from stored invoices/payrolls)
- Guarantee calculations applied during export generation
- NOT affected by invoice/payment/payroll writes
- Results should approximately match stored invoice totals (cross-check test needed)
**Affects:** Read-only. No writes.

---

#### `/admin/config` — Configuration.tsx
**What it does:** System configuration — schools, users, students, guarantee settings.
**Three tabs:**

**Schools Tab:**
- Add/edit school with rates and guarantee config
- School guarantee editor: per instrument (minHours, appliesTo=[in_person/online/both])
- Edit → `updateSchool()`
- Delete → `deleteSchool()`

**Users Tab:**
- Add user (all 5 roles)
- Teacher: instrument, base/group rates, per-school overrides, online rates, guarantee config
- Teacher guarantee editor: per school → per instrument rows
- Edit → `updateUser()`
- Delete → `deleteUser()`

**Students Tab:**
- Add/edit/delete students
- Import from Excel → `processStudentImport()`
- Export to Excel

**Affects:** schools, teachers, users, students collections

---

### TEACHER PORTAL

---

#### `/teacher/dashboard` — Dashboard.tsx (shared, teacher view)
**What it does:** Teacher weekly stats — own lessons only, earnings (teacherRate), no schoolRate.
**Financial cards visible:** Earnings (sum teacherRate), NOT revenue.
**Edit button:** Available for own lessons.

---

#### `/teacher/attendance` — Attendance.tsx
**What it does:** Submit new lesson with full evaluation.
**Key behaviors:**
- Filters schools and students to teacher's own assignments
- Calculates teacherRate client-side via `resolveTeacherRate()` — stored on lesson
- schoolRate is computed server-side in `addLesson()` via `resolveSchoolRate()` — teacher never sees it
- Evaluation fields: stars (interactivity, behavior), text (learning, notes), plus expanded fields (overallGrade, examPrepStatus, repertoire, practiceAssignment)
- datetime-local input with timezone handling
**Affects:** lessons collection

---

#### `/teacher/students` — MyStudents.tsx
**What it does:** Teacher's student list with add/import/export.
**Affects:** students collection

---

#### `/teacher/finance` — TeacherFinance.tsx
**What it does:** Teacher read-only earnings report.
**Key behaviors:**
- Filters lessons by teacher + month + year
- Applies teacher guarantee adjustments per school+date+instrument
- Shows rate, hours, earnings per lesson
- Does NOT show schoolRate or school financial data

---

#### `/teacher/payroll` — TeacherPayroll.tsx
**What it does:** Teacher read-only payroll history.
**Key behaviors:**
- Only own payroll runs (Firestore-filtered by teacherId)
- notes field stripped server-side
- View modal shows line items: lesson/guarantee/manual
- Summary: active earned, received, pending
- READ ONLY — no approve/settle/cancel actions

---

#### `/teacher/profile` — TeacherProfile.tsx
**READ ONLY.** Shows instrument, rates, guarantee config. No writes.

---

#### `/teacher/schedule` — MySchedule.tsx
**READ ONLY.** Own weekly timetable. No writes.

---

#### `/teacher/bookings` — TeacherBookings.tsx
**READ ONLY.** Own assigned bookings (adminNotes stripped). No writes.

---

### PARENT PORTAL

---

#### `/parent/dashboard` — ParentDashboard.tsx
**What it does:** Overview of linked children — lesson stats, behavior/interactivity averages.
**Key behaviors:**
- NO financial data shown
- NO teacher notes shown
- Reads from AppContext parent doc (childIds) to filter lessons

---

#### `/parent/child/:childId` — ChildProgress.tsx
**READ ONLY.** Full lesson history per child — evaluation fields visible, no financial/notes.

---

#### `/parent/bookings` — BookingRequest.tsx
**What it does:** Submit and track booking requests.
**Buttons:** New Request → `addBooking({ requestedBy: user.id })`

---

#### `/parent/enrollments` — ParentEnrollments.tsx
**What it does:** View course package progress for own children.
**Key behaviors:**
- Shows priceExpected ONLY for payerType=parent enrollments
- Groups by child
- Progress bar: consumed/total lessons
- Financial fields for school-payer enrollments are stripped

---

#### `/parent/billing` — ParentBilling.tsx
**What it does:** View own B2C invoices and payment history.
**Key behaviors:**
- Only invoices where payerId=own UID and payerType=parent
- Expandable: line items, payments, balance due
- reference field stripped from payments
- READ ONLY — no payment submission

---

### STUDENT PORTAL

---

#### `/student/dashboard` — StudentDashboard.tsx
**What it does:** Student home with stats, active enrollments (progress), recent 5 lessons.
**Key behaviors:**
- NO financial data (no prices, rates, invoices)
- NO teacher notes
- Shows evaluation: learning notes, repertoire, homework from lessons
- Shows enrollment progress: consumed/remaining lessons

---

#### `/student/lessons` — StudentLessons.tsx
**READ ONLY.** Full lesson history. No financial fields. No notes.

---

### SCHOOL ADMIN PORTAL

---

#### `/school/dashboard` — SchoolDashboard.tsx
**What it does:** School overview — rates, monthly lesson stats, invoice estimate, teacher activity, guarantee config.
**Key behaviors:**
- Shows schoolRate (billing) but NOT teacherRate
- Invoice estimate = sum of schoolRate for current month's active lessons
- Teacher activity: lesson counts and hours per teacher (name/instrument only)
- Guarantee minimum config display (read-only)

---

#### `/school/lessons` — SchoolLessons.tsx
**READ ONLY.** Lessons filtered to own school. Shows schoolRate. No teacherRate.

---

#### `/school/students` — SchoolStudents.tsx
**READ ONLY.** Students filtered to own school.

---

#### `/school/invoices` — SchoolInvoices.tsx
**What it does:** View own B2B invoices and payment status.
**Key behaviors:**
- Only invoices where payerId=schoolId and payerType=school
- Expandable: line items, payment history, balance due
- reference field kept (for bank reconciliation)
- Summary cards: total amount, paid, outstanding
- READ ONLY — no edits, no payments

---

## 5. FINANCIAL SYSTEM DEEP DIVE

### Rate Resolution (rateService.ts)

#### Teacher Rate Lookup Priority
```
1. School-specific rate: teacher.ratesBySchool[schoolId]
2. Base group rate: teacher.baseGroupRate (if Group lesson)
3. Base individual rate: teacher.baseRate
→ Apply delivery mode variant if lesson is Online:
   1. teacher.onlineRatesBySchool[schoolId]
   2. teacher.onlineGroupRate (if Group)
   3. teacher.onlineRate
   4. Fall back to in-person rate
```

#### School Rate Lookup Priority
```
1. Teacher-specific school rate: school.teacherRates[teacherId]
2. Instrument-specific rate: school.instrumentRates[instrument]
3. Group rate: school.defaultGroupRate (if Group)
4. Default rate: school.defaultRate
→ Apply delivery mode variant if Online:
   1. school.onlineTeacherRates[teacherId]
   2. school.onlineInstrumentRates[instrument]
   3. school.defaultOnlineGroupRate (if Group)
   4. school.defaultOnlineRate
   5. Fall back to in-person rate
```

### Guarantee System

#### School Guarantee (affects invoicing/revenue)
- Configured per instrument on school doc (`guaranteesByInstrument`)
- Applied per school + date + instrument
- `appliesTo` controls which lessons count: `in_person_only` | `online_only` | `both`
- Activates ONLY if ≥1 counted lesson exists for that school+date+instrument
- `resolveSchoolGuarantee()` returns `{ shortfallHours, shortfallAmount, guaranteeApplied }`
- Shortfall uses `resolveSchoolRate()` for the rate (NOT defaultRate)
- Legacy fallback: `minimumDailyHoursByInstrument` read if new field absent

#### Teacher Guarantee (affects payroll/expense)
- Configured per school → per instrument on teacher doc (`guaranteesBySchool`)
- Applied per teacher + school + date + instrument
- Same `appliesTo` delivery mode filter
- Same activation rule (≥1 counted lesson)
- Shortfall uses `resolveTeacherRate()` for the rate
- Legacy fallback same pattern

#### Guarantee Activation Conditions
- Status must NOT be `CANCELLED` or `ABSENT_EXCUSED`
- Delivery mode must match `appliesTo` setting
- At least 1 qualifying lesson in the group must exist
- Shortfall = max(0, minHours - actualHours)

### Invoice State Machine
```
DRAFT ──────────────────────────────┐
   ↓ (issue)                        │
ISSUED ──────────── (overdue date) ─┤
   ↓ (partial payment)              │
PARTIALLY_PAID                      │
   ↓ (full payment)                 │
PAID (locked)                       │
                                    ↓
                               CANCELLED (terminal)
```
- `isLocked = true` when status is PAID
- Locked invoices require explicit unlock before edit
- DRAFT and CANCELLED invoices are skipped by reconcileInvoice
- paidAmount updated automatically after each payment change

### Payroll State Machine
```
DRAFT ──────────────────────────────┐
   ↓ (approve)                      │
APPROVED (locked)                   │
   ↓ (partial settlement)           │
PARTIALLY_PAID (locked)             │
   ↓ (full settlement)              │
PAID (locked)                       │
                                    ↓
                               CANCELLED (terminal, from any non-PAID)
```
- lineItems + totalPayable are immutable once APPROVED
- Only DRAFT and CANCELLED can be deleted
- Summary cards count APPROVED + PARTIALLY_PAID + PAID only

### Two Financial Calculation Paths (Important)
| Path | Source | Used By | When to use |
|---|---|---|---|
| **Entity-based** | Stored invoice/payroll docs | InvoiceManagement, PayrollManagement, portal pages | Production billing |
| **Legacy metrics** | Calculated from lessons in real time | Financials.tsx, Dashboard.tsx | Reporting, cross-check |
These two paths should produce the same numbers for the same period. Divergence indicates a data integrity issue.

---

## 6. FULL TEST PLAN BY MODULE

---

### MODULE: Authentication

#### AUTH-001: Email login — admin
- **Steps:** Navigate to /login, enter valid admin email/password, submit.
- **Expected:** Redirect to /admin/dashboard. No console errors.
- **Failure:** Wrong email/password, or users/{uid}.role missing.

#### AUTH-002: Login with invalid credentials
- **Steps:** Enter wrong password.
- **Expected:** Error message shown. No redirect.
- **Failure:** App crashes or redirects anyway.

#### AUTH-003: Login with Google
- **Steps:** Click "Google Account" button.
- **Expected:** Google popup, successful auth, redirect to correct portal.
- **Failure:** auth/unauthorized-domain (check Firebase Console).

#### AUTH-004: Login as teacher
- **Expected:** Redirect to /teacher/dashboard. Only own lessons loaded.

#### AUTH-005: Login as parent
- **Expected:** Redirect to /parent/dashboard. childIds-based data loaded.

#### AUTH-006: Login as school_admin
- **Expected:** Redirect to /school/dashboard. users/{uid}.schoolId must exist.

#### AUTH-007: Login as student
- **Expected:** Redirect to /student/dashboard. students doc with uid field must exist.

#### AUTH-008: Logout
- **Steps:** Click Sign Out.
- **Expected:** Redirect to /login. All listeners stopped. State cleared.
- **Failure:** Memory leak (listeners not stopped), stale state on re-login.

#### AUTH-009: Direct URL access without auth
- **Steps:** Navigate to /admin/dashboard without logging in.
- **Expected:** Redirect to /login.

#### AUTH-010: Wrong-portal URL access
- **Steps:** Login as teacher, manually navigate to /admin/dashboard.
- **Expected:** Redirect to /teacher/dashboard.

---

### MODULE: User Management

#### USR-001: Create admin user
- **Steps:** Admin → Users → Create User → role=admin → submit.
- **Expected:** New user in list. users doc created. No teacher/parent doc created.

#### USR-002: Create teacher user
- **Steps:** Role=teacher, fill instrument, base rate → submit.
- **Expected:** users doc + teachers doc both created. Teacher code generated (TE_NNN).

#### USR-003: Create parent user
- **Steps:** Role=parent → submit.
- **Expected:** users doc + parents doc with empty childIds. parentId = PAR-NNN.

#### USR-004: Create school_admin user
- **Steps:** Role=school_admin, select school → submit.
- **Expected:** users doc with schoolId field. No teacher doc.

#### USR-005: Create student user (via User Management)
- **Steps:** Role=student → submit.
- **Expected:** users doc created. No student profile doc (separate from students collection).

#### USR-006: Edit teacher — change rates
- **Steps:** Edit teacher user → change baseRate → save.
- **Expected:** teachers doc updated. New lessons use updated rate. Existing lesson snapshots UNCHANGED.

#### USR-007: Edit teacher — add per-school rate
- **Steps:** Edit teacher → add school rate override → save.
- **Expected:** teachers.ratesBySchool updated. Old lessons unaffected.

#### USR-008: Delete user — teacher
- **Steps:** Delete a teacher user.
- **Expected:** Both users and teachers docs deleted.
- **Risk:** Lessons with this teacherId become orphaned (expected behavior).

#### USR-009: Duplicate email prevention
- **Steps:** Try to create a user with an already-used email.
- **Expected:** Error shown. No duplicate doc created.

#### USR-010: Edit role — attempt
- **Steps:** Open edit modal for a user.
- **Expected:** Role field is NOT editable. Changing role requires delete + recreate.

---

### MODULE: Schools

#### SCH-001: Create school
- **Steps:** Config → Schools → fill name, code, rates → save.
- **Expected:** School appears in list and all school dropdowns.

#### SCH-002: School code uniqueness
- **Steps:** Try to create two schools with the same code.
- **Expected:** Warning or error (currently app-layer check in addSchool).

#### SCH-003: Update school default rate
- **Steps:** Edit school, change defaultRate.
- **Expected:** School doc updated. Existing lesson schoolRate snapshots UNCHANGED.

#### SCH-004: Add school guarantee
- **Steps:** Edit school → add instrument row in guarantee editor → save.
- **Expected:** guaranteesByInstrument field updated on school doc.

#### SCH-005: Delete school
- **Steps:** Delete a school.
- **Expected:** School doc deleted. Students/lessons referencing this schoolId become orphaned (expected).

---

### MODULE: Students

#### STU-001: Create student with school
- **Steps:** Config → Students → fill name, school, teacher, instrument → add.
- **Expected:** Student ID = ST_[SCHOOLCODE]_NNN. Doc in students collection.

#### STU-002: Create private student (no school)
- **Steps:** Leave school field empty → add.
- **Expected:** Student ID = PV-NNN.

#### STU-003: Import students from Excel
- **Steps:** Import Students → upload valid .xlsx.
- **Expected:** New students created. Existing by name+school → updated. Error rows reported.

#### STU-004: Export students to Excel
- **Expected:** .xlsx downloads with all visible student fields.

#### STU-005: Teacher sees only own students
- **Steps:** Login as teacher → My Students.
- **Expected:** Only students where student.teacherId = teacher.uid.

#### STU-006: School admin sees only own school students
- **Steps:** Login as school_admin → Students.
- **Expected:** Only students where student.schoolId = school_admin.schoolId.

---

### MODULE: Lessons

#### LES-001: Teacher submits attendance
- **Steps:** Login as teacher → Take Attendance → fill form → submit.
- **Expected:** Lesson created. teacherRate stored. schoolRate stored (admin-only visible).

#### LES-002: schoolRate not visible to teacher
- **Steps:** Login as teacher → DevTools → AppContext state.lessons[0].
- **Expected:** schoolRate = 0 (stripped).

#### LES-003: schoolRate visible to admin
- **Steps:** Login as admin → Lesson Log → DevTools.
- **Expected:** schoolRate has real non-zero value.

#### LES-004: Admin edits lesson status
- **Steps:** Admin → Dashboard → Edit lesson → change status to Cancelled.
- **Expected:** Lesson updated. schoolRate and teacherRate become 0 for cancelled.

#### LES-005: Lesson import from Excel
- **Steps:** Admin → Lesson Log → Import.
- **Expected:** Lessons created or updated based on matching ID.

#### LES-006: Lesson export to Excel
- **Expected:** .xlsx downloads. schoolRate visible to admin.

#### LES-007: Student sees only own lessons
- **Steps:** Login as student → My Lessons.
- **Expected:** Only lessons where studentIds contains student's doc ID.

#### LES-008: Parent sees only linked children's lessons
- **Steps:** Login as parent → Child Progress.
- **Expected:** Only lessons for children in parent.childIds.

#### LES-009: Delete lesson
- **Steps:** Admin → Lesson Log → delete.
- **Expected:** Lesson removed. Does NOT affect stored invoice line items (snapshot model).

#### LES-010: Lesson rate snapshot integrity
- **Steps:** Create lesson → edit school rate → check lesson.
- **Expected:** Lesson schoolRate UNCHANGED (snapshot at creation).

---

### MODULE: Enrollments

#### ENR-001: Create enrollment
- **Steps:** Admin → Enrollments → New Enrollment → fill all fields → save.
- **Expected:** Enrollment created with enr_... ID. Status=ACTIVE.

#### ENR-002: Progress tracking
- **Steps:** Create enrollment (totalLessons=10) → submit 5 lessons with enrollmentId → check progress.
- **Expected:** consumed=5, remaining=5. Cancelled lessons do NOT count.

#### ENR-003: Absent Excused does not consume
- **Steps:** Lesson with status=ABSENT_EXCUSED and enrollmentId set.
- **Expected:** consumed count unchanged.

#### ENR-004: Absent Unexcused DOES consume
- **Steps:** Lesson with status=ABSENT_UNEXCUSED and enrollmentId set.
- **Expected:** consumed count increments.

#### ENR-005: Parent sees enrollment with price (payerType=parent)
- **Steps:** Login as parent → Enrollments.
- **Expected:** priceExpected visible for payerType=parent enrollments.

#### ENR-006: Parent does NOT see price for school-payer enrollment
- **Steps:** Enrollment with payerType=school → parent view.
- **Expected:** priceExpected stripped.

#### ENR-007: Student sees enrollment — no financial data
- **Steps:** Login as student → Dashboard enrollment section.
- **Expected:** Progress visible. No price. No billingStatus. No payerType.

#### ENR-008: Teacher/School Admin sees NO enrollments
- **Steps:** Login as teacher or school_admin.
- **Expected:** No enrollment data in state (listeners not set up for these roles).

#### ENR-009: Delete enrollment
- **Steps:** Admin → delete enrollment.
- **Expected:** Enrollment removed. Does NOT delete related invoices or lessons.

---

### MODULE: Invoices

#### INV-001: Generate B2B invoice
- **Steps:** Admin → Invoices → New → B2B → select school + period → generate.
- **Expected:** Line items built from filtered lessons. Guarantee adjustment lines if applicable. Invoice saved with INV-YYYYMM-XXXX.

#### INV-002: Generate B2C invoice (enrollment-based)
- **Steps:** New → B2C Enrollment → select parent/student/enrollment + period → generate.
- **Expected:** Line items from student lessons within period. No guarantee lines.

#### INV-003: Generate B2C invoice (manual)
- **Steps:** New → B2C Manual → add line items manually → save.
- **Expected:** Invoice saved with stored line items. No auto-generation.

#### INV-004: Invoice number sequence
- **Steps:** Create two invoices in same month.
- **Expected:** INV-YYYYMM-0001, INV-YYYYMM-0002. Counter increments via transaction.

#### INV-005: Duplicate invoice warning
- **Steps:** Create two B2B invoices for same school + same period.
- **Expected:** Warning shown. Second invoice can still be saved (not blocked).

#### INV-006: Invoice locking
- **Steps:** Issue an invoice. Try to edit without unlocking.
- **Expected:** Edit fields disabled until "Unlock" is clicked.

#### INV-007: Invoice cancellation
- **Steps:** Cancel an invoice.
- **Expected:** Status=CANCELLED. paidAmount unchanged. reconcileInvoice skips cancelled.

#### INV-008: Invoice status after partial payment
- **Steps:** Issue invoice for 1000 SAR → record payment of 600 SAR (COMPLETED).
- **Expected:** paidAmount=600, status=PARTIALLY_PAID, isLocked=false.

#### INV-009: Invoice status after full payment
- **Steps:** Record second payment of 400 SAR → total = 1000.
- **Expected:** paidAmount=1000, status=PAID, isLocked=true.

#### INV-010: Parent sees ONLY own B2C invoices
- **Steps:** Login as parent → My Billing.
- **Expected:** Only invoices where payerId=parent.uid AND payerType=parent.

#### INV-011: School admin sees ONLY own B2B invoices
- **Steps:** Login as school_admin → Invoices.
- **Expected:** Only invoices where payerId=schoolId AND payerType=school.

#### INV-012: Teacher sees NO invoices
- **Steps:** Login as teacher → check state.
- **Expected:** state.invoices = []. No invoice nav item.

#### INV-013: Delete invoice
- **Steps:** Delete a DRAFT invoice.
- **Expected:** Invoice removed. Payments referencing it remain (orphaned — no cascade delete).

#### INV-014: Summary cards accuracy
- **Steps:** Create invoices in various statuses → check cards.
- **Expected:** Cards exclude CANCELLED invoices from all totals.

---

### MODULE: Payments

#### PAY-001: Record payment — COMPLETED
- **Steps:** Admin → Payments → Record Payment → select invoice → amount → method=cash → status=completed → save.
- **Expected:** Payment saved. reconcileInvoice fires. Invoice paidAmount updated.

#### PAY-002: Record payment — PENDING (does not affect paidAmount)
- **Steps:** Record payment with status=PENDING.
- **Expected:** Payment saved. Invoice paidAmount NOT updated (only COMPLETED counts).

#### PAY-003: Delete COMPLETED payment triggers reconciliation
- **Steps:** Delete a completed payment.
- **Expected:** Invoice paidAmount recalculated. Status may change from PAID → ISSUED or PARTIALLY_PAID.

#### PAY-004: Payment reference visible to school admin
- **Steps:** Login as school_admin → School Invoices → expand invoice → payment row.
- **Expected:** reference field visible.

#### PAY-005: Payment reference hidden from parent
- **Steps:** Login as parent → My Billing → expand invoice → payment row.
- **Expected:** reference field NOT visible.

#### PAY-006: Payment notes hidden from both parent and school admin
- **Steps:** Check payment data for parent/school_admin role.
- **Expected:** notes field stripped for both.

#### PAY-007: Payment summary cards
- **Steps:** Admin → Payments → check summary cards.
- **Expected:** Total = all payments; Completed = sum of COMPLETED; Pending = sum of PENDING; Refunded = sum of REFUNDED.

---

### MODULE: Payroll

#### PRL-001: Generate payroll — no guarantee
- **Steps:** Admin → Payroll → Generate → select teacher + period (no guarantee school) → preview → save.
- **Expected:** Only lesson lines. No guarantee lines. Totals = sum of lesson teacherRates.

#### PRL-002: Generate payroll — with guarantee
- **Steps:** Teacher has guaranteesBySchool configured → generate payroll for that period.
- **Expected:** Guarantee lines appear in preview (amber). shortfallHours × teacherRate = guarantee line amount.

#### PRL-003: Payroll number sequence
- **Steps:** Create two payrolls in same month.
- **Expected:** PAY-YYYYMM-0001, PAY-YYYYMM-0002.

#### PRL-004: Duplicate payroll rejection
- **Steps:** Try to generate payroll for same teacher + period + schoolFilter (non-cancelled).
- **Expected:** Error returned. No duplicate created.

#### PRL-005: Add manual line item
- **Steps:** Generate payroll → Add manual line (description + amount) → save.
- **Expected:** Line with type=manual_adjustment appears. manualAdjustmentTotal stored. totalPayable includes it.

#### PRL-006: Approve payroll
- **Steps:** Draft payroll → Approve.
- **Expected:** status=APPROVED. Line items locked. Cannot add/remove lines.

#### PRL-007: Settle payroll — partial
- **Steps:** Approved payroll (totalPayable=1000) → Settle → enter 600.
- **Expected:** paidAmount=600, status=PARTIALLY_PAID.

#### PRL-008: Settle payroll — full
- **Steps:** Settle remaining 400.
- **Expected:** paidAmount=1000, status=PAID.

#### PRL-009: Delete DRAFT payroll
- **Steps:** Delete a DRAFT payroll.
- **Expected:** Deleted successfully.

#### PRL-010: Cannot delete APPROVED payroll
- **Steps:** Try to delete APPROVED payroll.
- **Expected:** Delete button not visible. Must cancel first.

#### PRL-011: Cancel → then delete
- **Steps:** Cancel an APPROVED payroll → then delete.
- **Expected:** Cancel sets status=CANCELLED. Then delete removes doc.

#### PRL-012: Teacher sees ONLY own payroll
- **Steps:** Login as teacher → My Payroll.
- **Expected:** Only payrollRuns where teacherId=teacher.uid.

#### PRL-013: Teacher does NOT see notes
- **Steps:** Login as teacher → payroll detail.
- **Expected:** notes field absent.

#### PRL-014: Summary cards accuracy
- **Steps:** Create payrolls in DRAFT, APPROVED, PARTIALLY_PAID, PAID, CANCELLED.
- **Expected:** Cards include APPROVED + PARTIALLY_PAID + PAID only. Draft + Cancelled excluded.

#### PRL-015: Delivery mode filtering for guarantee
- **Steps:** Teacher guarantee with appliesTo=in_person_only → mix of online and in-person lessons.
- **Expected:** Only in-person hours count toward guarantee threshold.

---

### MODULE: Configuration

#### CFG-001: Add school with all rate fields
- **Steps:** Config → Schools → add school → set individual + group + online rates → save.
- **Expected:** All rate fields stored. Dropdown updated.

#### CFG-002: School guarantee — add, save, verify
- **Steps:** Add guarantee row for Violin, 4h, both → save school.
- **Expected:** guaranteesByInstrument.violin = { minHours: 4, guaranteed: true, appliesTo: 'both' }.

#### CFG-003: Teacher — add per-school rate override
- **Steps:** Edit teacher → add school rate for a specific school → save.
- **Expected:** teachers.ratesBySchool[schoolId] = new rate.

#### CFG-004: Teacher guarantee — add per school
- **Steps:** Edit teacher → teacher guarantee editor → select school → add instrument row → save.
- **Expected:** guaranteesBySchool[schoolId][instrument] = config.

#### CFG-005: Student import — valid file
- **Steps:** Import Students → upload valid Excel.
- **Expected:** New students added, existing updated, errors reported.

#### CFG-006: Student import — invalid file
- **Steps:** Import non-Excel file or malformed data.
- **Expected:** Error shown. No partial writes.

---

## 7. CRITICAL FINANCIAL TEST SCENARIOS

---

### FIN-SCENARIO-001: Full B2B Invoice Lifecycle with Guarantee

**Setup:** School with Piano guarantee (minHours=3, appliesTo=both). Teacher with 2h Piano lessons on one day.

**Steps:**
1. Teacher submits 2x 1h Piano lessons at school (same day)
2. Admin → Invoices → B2B → select school + period → Generate
3. Verify line items: 2 lesson lines + 1 guarantee adjustment line (1h × schoolRate)
4. Issue invoice
5. Record partial payment (50%)
6. Verify: status=PARTIALLY_PAID, paidAmount=correct
7. Record second payment (remaining 50%)
8. Verify: status=PAID, isLocked=true

**Expected at each step:**
- Step 3: Guarantee shortfall = max(0, 3h - 2h) = 1h. Amount = 1h × resolveSchoolRate(school, teacher, instrument, date, IN_PERSON)
- Step 5: paidAmount updated automatically via reconcileInvoice
- Step 8: Invoice locked. Cannot edit without unlock.

---

### FIN-SCENARIO-002: Full B2C Invoice + Payment Lifecycle

**Setup:** Parent with one child enrolled. Child has 4 lessons in period.

**Steps:**
1. Admin → Invoices → B2C Enrollment → select enrollment + period → Generate
2. Verify 4 lesson lines, correct amounts, no guarantee lines
3. Issue invoice
4. Parent logs in → My Billing → sees invoice
5. Admin records full payment
6. Verify: Parent sees PAID status. paidAmount=totalAmount.

---

### FIN-SCENARIO-003: Payroll with Guarantee and Manual Adjustment

**Setup:** Teacher with school guarantee (Violin, 3h minimum, in_person_only). Period has 2h in-person + 1h online.

**Steps:**
1. Admin → Payroll → Generate → select teacher + period
2. Preview: lesson lines (3 lessons), guarantee line (1h — online doesn't count toward in_person min)
3. Add manual line: "Travel allowance" = 50 SAR
4. Save as DRAFT
5. Verify totals: lessonTotal + guaranteeTotal + manualAdjustmentTotal = totalPayable
6. Approve
7. Verify lineItems now locked (cannot modify)
8. Record partial settlement
9. Verify: status=PARTIALLY_PAID
10. Record final settlement
11. Verify: status=PAID

---

### FIN-SCENARIO-004: Legacy Financials vs Entity Cross-Check

**Steps:**
1. Pick a specific month with known data
2. Admin → Financials → School Invoicing → filter to that month + school → note total
3. Admin → Invoices → filter to same month + school → sum invoice totalAmounts
4. Compare the two numbers

**Expected:** Both should produce approximately the same revenue total.
**Risk flag:** If they differ significantly, it indicates either guarantee calculation divergence or lessons with missing schoolRate.

---

### FIN-SCENARIO-005: Payment Reconciliation After Deletion

**Steps:**
1. Create invoice for 1000 SAR → Issue
2. Record payment 1: 600 SAR COMPLETED → verify paidAmount=600, PARTIALLY_PAID
3. Record payment 2: 400 SAR COMPLETED → verify paidAmount=1000, PAID, locked
4. Delete payment 2 → verify paidAmount=600, status reverts to PARTIALLY_PAID, unlocked
5. Delete payment 1 → verify paidAmount=0, status=ISSUED, unlocked

---

### FIN-SCENARIO-006: Cancelled Invoice — Reconciliation Skipped

**Steps:**
1. Create invoice → Issue → record payment → Cancel invoice
2. Delete the payment
3. Verify: reconcileInvoice was called but SKIPPED because status=CANCELLED
4. Invoice paidAmount remains unchanged (stale but expected behavior)

---

### FIN-SCENARIO-007: Payroll Duplicate Prevention

**Steps:**
1. Generate payroll for Teacher A, March 2026, school=all → save as DRAFT
2. Try to generate ANOTHER payroll for Teacher A, March 2026, school=all
3. Expected: duplicate check fails, error returned, no second payroll created
4. Cancel the first payroll → try again
5. Expected: now succeeds (cancelled not counted in duplicate check)

---

## 8. EXPORT TEST SCENARIOS

---

### EXP-001: Invoice Excel — B2B with guarantee
- **Expected:** Rows grouped by date + instrument + rate. Guarantee rows present with "Guarantee Applied" label. Totals from stored invoice (not recalculated).

### EXP-002: Invoice Excel — B2C
- **Expected:** Stored line items as-is (not grouped). Correct totals.

### EXP-003: Invoice PDF — B2B
- **Expected:** ARTickle branded header (dark background, LIME accent). Grouped line items. Guarantee rows highlighted amber. Totals section: subtotal, adjustments, total, paid, balance.

### EXP-004: Invoice PDF — B2C
- **Expected:** Same branding. Line items as stored. Balance due if not fully paid.

### EXP-005: Payroll Excel — with guarantee + manual
- **Expected:** Grouped rows (date+school+instrument+rate). Guarantee section. Manual adjustments section. Totals breakdown: lessons + guarantee + manual = total.

### EXP-006: Payroll PDF — all line types
- **Expected:** Blue rows (lesson), amber rows (guarantee), purple rows (manual). Type badges. Totals from stored payroll.

### EXP-007: Payroll Register Excel
- **Steps:** Payroll Register export → filter by month → generate.
- **Expected:** One row per payroll run. All teachers in period. Grand totals row.

### EXP-008: Payroll Register PDF
- **Expected:** Landscape format. ARTickle header. "Payroll Register" title with month. All columns visible.

### EXP-009: Export uses STORED totals — never recalculates
- **Steps:** Manually edit an invoice line item after creation → export.
- **Expected:** Export shows stored totalAmount, not a recalculation from current lineItems.

### EXP-010: Export with missing logo
- **Expected:** PDF generates without error. Logo area is blank or fallback text used.

---

## 9. SECURITY & PERMISSION TEST SCENARIOS

---

### SEC-001: Teacher cannot see schoolRate in DevTools
- **Steps:** Login as teacher → browser DevTools → React state or Network responses.
- **Expected:** schoolRate = 0 on all lesson objects.

### SEC-002: Teacher cannot see other teachers' lessons
- **Steps:** Login as teacher → check state.lessons.
- **Expected:** All lessons have teacherId = current teacher's UID.

### SEC-003: Parent cannot see teacher rates or school billing
- **Steps:** Login as parent → DevTools → state.lessons.
- **Expected:** schoolRate = 0, teacherRate = 0 on all lesson objects.

### SEC-004: Parent cannot access admin pages via URL
- **Steps:** Login as parent → navigate to /admin/invoices.
- **Expected:** Redirect to /parent/dashboard.

### SEC-005: Parent invoice isolation
- **Steps:** Login as parent A → DevTools → state.invoices.
- **Expected:** Only invoices where payerId = parent A's UID.

### SEC-006: School admin cannot see teacherRate
- **Steps:** Login as school_admin → DevTools → state.lessons.
- **Expected:** teacherRate = 0 on all lesson objects.

### SEC-007: School admin sees only own school invoices
- **Steps:** Login as school_admin → state.invoices.
- **Expected:** All invoices have payerId = school_admin's schoolId.

### SEC-008: Student sees no financial data anywhere
- **Steps:** Login as student → DevTools → all state collections.
- **Expected:** No invoices, no payments, no payroll, no teacherRate, no schoolRate, no priceExpected.

### SEC-009: Firestore rule — parent cannot read another parent's invoice
- **Steps:** Firebase Console → Rules Playground → isParent, read invoice where payerId ≠ auth.uid.
- **Expected:** DENY.

### SEC-010: Firestore rule — teacher cannot read enrollments
- **Steps:** Rules Playground → isTeacher, read any enrollment.
- **Expected:** DENY.

---

## 10. EDGE CASES & ERROR SCENARIOS

---

### EDGE-001: Invoice with zero line items
- **Steps:** Create manual B2C invoice with no line items → save.
- **Expected:** Invoice saves with totalAmount=0. No error.

### EDGE-002: Payment amount exceeding invoice total
- **Steps:** Record payment of 9999 SAR against 100 SAR invoice.
- **Expected:** Payment saves. paidAmount > totalAmount. Status=PAID. No hard block (overpayment allowed).

### EDGE-003: Payroll with no lessons in period
- **Steps:** Generate payroll for teacher + period with zero qualifying lessons.
- **Expected:** Empty preview. No lesson lines. If teacher has guarantee, shortfall = full minHours.

### EDGE-004: Counter race condition
- **Steps:** Two admins create invoices simultaneously.
- **Expected:** reserveCounterRange uses runTransaction — both get unique sequential numbers.

### EDGE-005: Enrollment with 0 total lessons
- **Steps:** Create enrollment with totalLessons=0.
- **Expected:** Enrollment saves. Progress = 0/0. No division-by-zero error.

### EDGE-006: Parent with 0 linked children
- **Steps:** Create parent → no children linked → parent logs in.
- **Expected:** Dashboard shows empty children list. No error. No invoice/enrollment data.

### EDGE-007: Lesson without enrollmentId
- **Steps:** Old/legacy lesson with no enrollmentId → check enrollment progress.
- **Expected:** Enrollment progress unaffected. Lesson not counted for any enrollment.

### EDGE-008: School admin user missing schoolId
- **Steps:** school_admin user doc without schoolId field → logs in.
- **Expected:** getUserSchoolId() returns null → ALL invoice/payment rules DENY → permission errors in console.

### EDGE-009: Delete teacher who has lessons
- **Steps:** Delete teacher user who has existing lessons.
- **Expected:** Teacher deleted. Lessons remain with orphaned teacherId. No cascade delete.

### EDGE-010: Invoice line items with negative amounts
- **Steps:** Manual B2C invoice with a discount line (negative amount).
- **Expected:** totalAmount reduced. Export shows negative line. Balance calculated correctly.

### EDGE-011: Payroll with negative manual adjustment (deduction)
- **Steps:** Add manual line with negative amount → save.
- **Expected:** manualAdjustmentTotal is negative. totalPayable reduced. Export shows negative line.

### EDGE-012: Parent with >30 invoices
- **Steps:** Create >30 invoices for same parent.
- **Expected:** Payment listener only covers first 30 invoice IDs (known limitation — see docs).

### EDGE-013: Firestore Spark plan quota reached
- **Steps:** Heavy data load during development.
- **Expected:** All writes fail with quota error. App shows errors. Resets midnight Pacific.

### EDGE-014: Login with account not in users collection
- **Steps:** Firebase Auth has account, but no users/{uid} doc exists.
- **Expected:** Auth succeeds but role=undefined. getUserRole() returns undefined. All Firestore rules DENY.

### EDGE-015: Multiple lessons same day, same instrument — guarantee activation
- **Steps:** 3 lessons on same day, same instrument, 45 min each = 2.25h. Guarantee = 3h.
- **Expected:** Shortfall = 0.75h. Guarantee line = 0.75 × resolveSchoolRate.

---

## 11. KNOWN LIMITATIONS & RISK AREAS

### Architectural Risks

| Risk | Location | Severity | Notes |
|---|---|---|---|
| AppContext monolith | AppContext.tsx ~1700 lines | High | All logic in one file. Hard to test in isolation. |
| Two financial calculation paths | Financials.tsx vs InvoiceManagement | Medium | Can produce divergent totals. Cross-check test required. |
| 500ms reconciliation delay | AppContext reconcileInvoice | Low | Race condition possible if two payments saved rapidly. Invoice may briefly show stale status. |
| Payment listener 30-invoice cap | AppContext parent/school_admin listeners | Medium | Parents/school_admins with >30 invoices see incomplete payment data. TODO documented in code. |
| No cascade deletes | All delete operations | Medium | Deleting school/teacher/student leaves orphaned references in other collections. |
| schoolRate computed client-side in addLesson | AppContext.addLesson | Medium | Requires school doc read during lesson creation. If school doc unavailable, schoolRate may be wrong. |
| Guarantee keys case-sensitive in Firestore but normalized in code | rateService + AppContext | Low | normalizeInstrument() handles this, but manual Firestore edits could introduce case mismatches. |

### Data Integrity Risks

| Risk | Trigger | Impact |
|---|---|---|
| Invoice total drift | Line items edited after save | Export always uses stored total — line items and total can diverge |
| Payroll total drift | Not applicable | Payrolls are immutable once approved — no drift possible |
| stale paidAmount on cancelled invoice | Payment deleted after cancellation | reconcileInvoice skips cancelled — paidAmount stays stale |
| Orphaned paymentId references | Invoice deleted after payments recorded | Payments remain but invoice is gone |

### Security Limitations

| Limitation | Notes |
|---|---|
| Enrollments — parent/student read is role-based, not identity-based | Any parent can read any enrollment via direct Firestore call. App-layer query filters it, but rule doesn't enforce child identity. Acceptable given existing students/lessons pattern. |
| Payments — 30-invoice query window | Parent/school_admin payment listener only covers 30 invoices. Combined with cross-doc rule, remaining payments are inaccessible. |
| No server-side validation | All business logic runs client-side. A determined user could submit malformed data via direct Firestore writes. |

### Performance Risks

| Risk | Notes |
|---|---|
| 587 kB production bundle | No code splitting. Will slow initial load especially on mobile. |
| Full collection scans on login | Admin loads ALL lessons, students, teachers, schools on sign-in. Large datasets will cause slow startup. |
| No pagination | All lists render all records. Large datasets (1000+ lessons) will cause slow renders. |

---

## TESTING CHECKLIST (STEP-BY-STEP EXECUTION ORDER)

### Phase 1 — Authentication (run first, everything depends on this)
- [ ] AUTH-001 through AUTH-010

### Phase 2 — Data Integrity (verify migrated data is intact)
- [ ] USR-001, USR-006, USR-007 (spot check users + teacher rates)
- [ ] SCH-001, SCH-003, SCH-004 (spot check schools + guarantees)
- [ ] STU-001, STU-005 (spot check students)
- [ ] LES-003 (confirm schoolRate present on admin view)

### Phase 3 — Role Security (no data changes)
- [ ] SEC-001 through SEC-010

### Phase 4 — Core Modules (normal flows)
- [ ] LES-001 through LES-010
- [ ] ENR-001 through ENR-009
- [ ] INV-001 through INV-014
- [ ] PAY-001 through PAY-007
- [ ] PRL-001 through PRL-015

### Phase 5 — Critical Financial Scenarios
- [ ] FIN-SCENARIO-001 through FIN-SCENARIO-007

### Phase 6 — Exports
- [ ] EXP-001 through EXP-010

### Phase 7 — Edge Cases
- [ ] EDGE-001 through EDGE-015 (prioritize EDGE-008, EDGE-012, EDGE-014)

### Phase 8 — Configuration
- [ ] CFG-001 through CFG-006

---

*End of FULL_SYSTEM_TEST_PLAN.md*
