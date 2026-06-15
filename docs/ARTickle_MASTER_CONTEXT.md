# ARTickle Master Context

## Project Nature
This is an EXISTING React + Firebase application — ARTickle Academy Manager.
It is not a new app and must not be rebuilt from scratch.

## Core Rule
Extend and refactor carefully.
Do not replace existing business logic unless absolutely necessary.

---

## Tech Stack
- React 19 + TypeScript + Vite
- Tailwind CSS (dark theme — slate-900 background, primary-600 accent)
- Firebase Firestore (real-time listeners) + Firebase Auth + Firebase Hosting
- Site: `artickle-academy` → https://artickle-academy.web.app
- AppContext (`context/AppContext.tsx`) — single source of truth for all state + CRUD
- React Router v6 — role-based protected routes

---

## Roles
| Role | Access |
|------|--------|
| `admin` | Everything — all schools, all data, all features |
| `school_admin` | Own school only — students, lessons, periods, enrollments |
| `teacher` | Own students + lessons only |
| `parent` | Own linked children only |
| `student` | Own data only |

---

## Existing Logic to Preserve
- Lesson records + attendance tracking
- Teacher pay / payroll logic
- School rate / invoice logic
- Guarantee system (per instrument, per school)
- Evaluation / progress fields on lessons
- Exports (Excel + PDF) and reporting logic
- Firebase-backed real-time data flow
- All enrollment entity data (even if UI is de-emphasised)

---

## Current Architecture

### Core Entities (Firestore collections)
- `lessons` — lesson records with `studentIds[]`, `schoolId`, `status`, `durationMinutes`, `enrollmentId?`
- `students` — `schoolId`, `teacherId`, `instrument`, `yearGrade`, `email`, `dateOfBirth`
- `schools` — rates, guarantee configs, admin IDs
- `teachers` — rates, guarantee configs, `ratesBySchool`
- `users` — auth + role records
- `enrollments` — manual enrollment packages (Enrollment entity, Phase 17.2+)
- `schoolEnrollmentPeriods` — school-level term/semester definitions (Phase 19.6)
- `invoices`, `payments`, `payrollRecords` — financial entities

### Key Types (`types.ts`)
- `LessonStatus`: Present / Taught / Absent (Excused) / Absent (Unexcused) / Cancelled
- `ENROLLMENT_CONSUMED_STATUSES`: Present, Taught, Absent (Unexcused) — these consume slots
- `SchoolEnrollmentPeriod`: `{ id, schoolId, name, academicYear, term?, startDate, endDate, defaultTotalLessons, defaultDurationMinutes, status: 'active'|'archived' }`
- `Enrollment`: `{ studentId, teacherId, schoolId?, instrument, totalLessons, durationMinutes, payerType, billingStatus, status, startDate?, endDate?, schoolPeriodId?, isDateOverride?, academicYear?, term? }`
- `EnrollmentPayerType`: school / parent / self
- `DeliveryMode`: in_person / online

---

## Current Feature State

### School Period Auto-Progress (Phase 19.6 Reset) — ACTIVE DEFAULT
The primary progress model for school students. No manual enrollment linking required.

**How it works:**
- `student.schoolId` → school has `SchoolEnrollmentPeriod` records
- Progress = count of lessons with consumed statuses whose `date` falls within `[period.startDate, period.endDate]`
- Denominator = `period.defaultTotalLessons`
- Minutes tracked = sum of `lesson.durationMinutes` within the period

**Key service:** `services/schoolPeriodProgress.ts`
- `getSchoolPeriodProgress(student, period, allLessons, overrideDuration?)` → `PeriodProgress`
- `getRelevantPeriodsForStudent(student, periods, allLessons, today, allEnrollments?)` → `PeriodProgress[]`
- `getCompactPeriodSummary(student, periods, allLessons, today, allEnrollments?)` → `PeriodProgress | null`
- `PeriodProgress` includes: `consumedLessons`, `totalLessons`, `remainingLessons`, `consumedMinutes`, `totalMinutes`, `remainingMinutes`, `alertLevel` ('none'|'approaching'|'almost'), `alertSource`, `isCurrent`, `isPast`, `isUpcoming`
- Alert thresholds: approaching ≥ 80%, almost ≥ 90% (max of lesson % and minutes %)

**UI components:**
- `components/SchoolPeriodProgressCard.tsx` — full detail card (all roles' student detail pages)
- `components/SchoolPeriodListBadge.tsx` — compact badge with SVG circle, minutes + lessons lines, alert pill (admin only)
- `components/MinutesProgressCircle.tsx` — SVG donut circle (xs/sm/md sizes, tone: neutral/approaching/almost)

**Applies to:** students with `schoolId` only. B2C / self-paid students are unaffected.

**Shown on:**
- `AdminStudentDetail`, `SchoolStudentDetail`, `TeacherStudentDetail` — full `SchoolPeriodProgressCard`
- `AdminStudents`, `MyStudents`, `SchoolStudents` — compact `SchoolPeriodListBadge` column

### School Period Manager — in Configuration tab
- Accessible via **Configuration → School Periods tab** (NOT a separate sidebar item)
- `pages/admin/SchoolPeriodManager.tsx` — create, edit, archive, delete periods
- Embedded in `pages/Configuration.tsx` as the `periods` tab
- Removed from sidebar (was previously a standalone nav item)
- Edit bug fixed: `startEdit()` now always sets `selectedSchoolId` to the period's school so the form render guard passes

### Manual Enrollment System (Phase 17.2 + 19.6D) — kept for exceptions
Used for: B2C parent-paid, self-paid adults, custom packages.
NOT the default for school students anymore.

**Pages:**
- `pages/admin/EnrollmentManagement.tsx` — create/edit/delete enrollments
  - Student dropdown: filtered by selected school, deduplicated by name+instrument, sorted alphabetically
  - School change clears student if student doesn't belong to new school
  - Two modes: "Use School Period" (pre-fills dates from period) or "Custom Enrollment"
- `pages/admin/EnrollmentReview.tsx` — diagnostic tool for unlinked/orphaned/out-of-range lessons (admin only, in sidebar under Operations)

**Components:**
- `components/EnrollmentBadge.tsx` — `EnrollmentListBadge` (list) + `EnrollmentDetailSection` (detail) — still shown on all student detail pages alongside school-period card

**AppContext functions:**
- `addEnrollment`, `updateEnrollment`, `deleteEnrollment`
- `updateLessonEnrollmentLink(lessonId, enrollmentId)` — single lesson link
- `batchUpdateLessonEnrollmentLinks(pairs[])` — chunked writeBatch (max 100/chunk)
- `addSchoolEnrollmentPeriod`, `updateSchoolEnrollmentPeriod`, `deleteSchoolEnrollmentPeriod`

### Navigation / Sidebar
- Admin sidebar: Dashboard, Overview | Users, Parent Onboarding, Students | Bookings, Enrollments, Enrollment Review, Schedule | Invoices, Payments, Payroll, Financials | Configuration, (no separate School Periods item)
- School admin sidebar: School Lessons, Students (no School Periods item — accessed via Configuration)
- Teacher sidebar: My Schedule, My Students, My Profile, etc.

### Configuration Page (`pages/Configuration.tsx`)
Four tabs:
1. **Schools Management** — add/edit/delete schools, rates, guarantees
2. **User Authorization** — add/edit/delete users, teacher pay rates
3. **Student Directory** — view/edit/delete students
4. **School Periods** — full `SchoolPeriodManager` embedded inline

---

## Critical Constraints
- Do NOT break financial calculations (invoices, payroll, rate engine)
- Do NOT break lesson logic or lesson creation flow
- Do NOT expose unauthorized data between users
- Do NOT make destructive architecture changes without clear need
- Do NOT auto-link lessons to enrollments (enrollment linking is manual/admin-only)
- Do NOT run migrations or backfills against Firestore without explicit plan + approval
- Preserve AppContext and core services unless carefully extracted
- School-period auto-progress is READ-ONLY — no writes, no side effects

---

## Service Files (key)
| File | Purpose |
|------|---------|
| `services/schoolPeriodProgress.ts` | Pure helpers for school-period auto-progress (no writes) |
| `services/enrollmentReviewSuggestions.ts` | Suggestion scoring for Enrollment Review tool |
| `services/exportUtils.ts` | Excel export helpers |
| `services/pdfExport.ts` | PDF generation |
| `services/rateService.ts` | Rate resolution engine |
| `services/importUtils.ts` | Student/lesson import parsing |

---

## Working Style for Claude
Before coding:
1. Inspect current code carefully (read relevant files first)
2. State the plan + list files to create/modify/avoid
3. List risks
4. Implement only the requested phase

After coding:
1. Summarize all changes
2. State whether financial/lesson logic was affected
3. Run `npx tsc --noEmit` and `npm run build`
4. Report failures clearly
5. Confirm: no writes added if change was read-only

---

## Deploy
```
npm run build && firebase deploy --only hosting
```
Site: https://artickle-academy.web.app
Project: artickle-academy
