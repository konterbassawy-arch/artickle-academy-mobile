# ARTickle Known Errors / Technical Debt

## Purpose
This file tracks pre-existing errors, type mismatches, warnings, and technical debt that are NOT necessarily part of the current phase.
Claude must not silently ignore them. If a phase does not require fixing them, Claude should record them here instead of getting distracted.

## Rules
- If an error existed before the current phase, mark it as pre-existing
- If a new error is introduced by the current phase, mark it as introduced in current phase
- If an error blocks build, login, data loading, security, finance, attendance, or routing, it becomes high priority
- If an error is unrelated to the current phase and does not block functionality, log it here for later
- Never claim an error is pre-existing without evidence from build output, type output, or prior notes

---

## Complete Error Audit (as of Phase 9 completion)

**Total: 17 TypeScript errors from `tsc --noEmit`**
**Build status: PASSES (Vite ignores TS errors, bundles 57 modules, 350 kB)**
**Runtime status: App loads, login works, all pages render**

---

## CRITICAL (blocks build, auth, routing, security, finance, attendance)

_None. Build passes. No runtime blockers._

---

## HIGH (breaks a major feature but not everything)

### H1) Lesson `duration` property mismatch — FINANCIAL RISK
- **Status:** pre-existing (before Phase 7)
- **Severity:** HIGH
- **Location:** `context/AppContext.tsx` lines 743, 759
- **TS Error:** TS2339: Property 'duration' does not exist on type 'Lesson'
- **Problem:** `calculateGroupLessonFinancials` (L743) and `calculateLessonFinancials` (L759) use `lesson.duration` but the `Lesson` interface defines `durationMinutes: number`. The property `duration` does not exist on Lesson.
- **Root cause:** The Lesson model was updated from `duration` (hours) to `durationMinutes` at some point, but these two functions were not updated.
- **Runtime effect:** `lesson.duration` is `undefined` → `Number(undefined || 1)` evaluates to `Number(1)` = `1`. Every lesson is treated as 1 hour regardless of actual duration. This produces **incorrect financial calculations** for lessons that are not exactly 60 minutes.
- **Risk if fixed:** LOW — change `lesson.duration` → `lesson.durationMinutes / 60` in both places. Must verify financial output before/after.
- **Blocks Phase 10+:** Potentially — teacher portal finance view depends on these calculations.
- **Suggested fix:** `const duration = (lesson.durationMinutes || 60) / 60;`

### H2) `deleteLesson` missing from AppContextType interface
- **Status:** pre-existing (before Phase 7)
- **Severity:** HIGH (hidden by CDN import errors)
- **Location:** `context/AppContext.tsx` — missing from interface at lines 143-175; implemented at line 644; exposed in useMemo at line 979
- **TS Error:** None reported (masked by CDN import errors breaking module type resolution)
- **Problem:** `deleteLesson` is implemented as a function, included in the context value, and used by `LessonLog.tsx` (line 10, 194), but is NOT declared in the `AppContextType` interface. TypeScript should flag `useApp().deleteLesson` as an error in LessonLog.tsx, but doesn't because the CDN import errors (H4) break type resolution for the entire module.
- **Root cause:** Function was added to the implementation without updating the interface.
- **Runtime effect:** None — the function exists at runtime and works. But if CDN import errors are ever fixed (Phase 21), this would become a compile error.
- **Risk if fixed:** NONE — add one line to the interface: `deleteLesson: (id: string) => Promise<void>;`
- **Blocks Phase 10+:** No, but should be fixed for type safety.
- **Suggested fix:** Add `deleteLesson: (id: string) => Promise<void>;` to `AppContextType` interface.

---

## MEDIUM (type mismatch, inconsistency)

### M1) Guarantee type mismatch in migration function
- **Status:** ✅ FIXED (2026-03-24, micro-fix between Phase 16 and 17)
- **Severity:** MEDIUM
- **Location:** `context/AppContext.tsx` line 1272
- **TS Error:** TS2322: Type 'number' is not assignable to type '{ minHours: number; guaranteed: boolean; }'
- **Problem:** In `fixExistingTeachersGuaranteeMigration`, the code `normalized[instrument] = Number(legacy)` assigned a plain `number` where the type expects `{ minHours: number; guaranteed: boolean }`.
- **Fix applied:** `normalized[instrument] = { minHours: Number(legacy), guaranteed: true };`
- **Result:** Error count reduced from 9 → 8. Zero side effects.

### M2) `excelExport.ts` — references non-existent Lesson properties
- **Status:** pre-existing
- **Severity:** MEDIUM
- **Location:** `services/excelExport.ts` lines 353, 355, 362, 363, 365
- **TS Errors:** TS2339 (4 occurrences), TS2551 (1 occurrence)
- **Problem:** The lesson export map references 5 properties not on the `Lesson` interface:
  - `l.time` (L353) — Lesson has no `time` field, only `date` (ISO string)
  - `l.studentName` (L355) — should be `l.studentNames` (string array), TS suggests this
  - `l.minHours` (L362) — not a Lesson property (computed concept, not stored)
  - `l.chargedHours` (L363) — not a Lesson property (computed concept, not stored)
  - `l.createdAt` (L365) — not a Lesson property (Firestore might auto-add but not in type)
- **Root cause:** Export mapping was written against an older or planned Lesson schema that never materialized.
- **Runtime effect:** These 5 columns in the exported Excel file contain `undefined`. The file still generates but with empty columns.
- **Risk if fixed:** LOW — align property names or compute values at export time.
- **Blocks Phase 10+:** No, but export quality is degraded.
- **Suggested fix:** Map `l.time` → extract time from `l.date`, `l.studentName` → `l.studentNames.join(', ')`, remove or compute `minHours`/`chargedHours`, remove `createdAt` or add to Lesson type.

### M3) `generateTestScenario` argument count mismatch
- **Status:** pre-existing
- **Severity:** MEDIUM
- **Location:** `services/dataGenerator.ts` (signature: 0 params), called from `context/AppContext.tsx` line 851 with 1 argument
- **TS Error:** TS2554: Expected 0 arguments, but got 1
- **Problem:** `generateTestScenario` is declared with zero parameters but called as `generateTestScenario(db as any)`.
- **Root cause:** Function was refactored to use module-scope db or was always zero-arg, but call site still passes db.
- **Runtime effect:** None — JavaScript ignores extra arguments.
- **Risk if fixed:** NONE — remove the argument from the call site.
- **Suggested fix:** Change `generateTestScenario(db as any)` → `generateTestScenario()`.

---

## INFRASTRUCTURE

### I1) Firestore daily quota exceeded during heavy development
- **Status:** observed (2026-03-24, during Phase 17.3 testing)
- **Severity:** INFRASTRUCTURE (not a code bug)
- **Trigger:** Creating an invoice triggered "quota exceeded" error popup
- **Root cause:** Firebase Spark (free) plan has daily limits: 50,000 reads, 20,000 writes, 20,000 deletes. The app runs 10+ real-time `onSnapshot` listeners (users, schools, teachers, students, lessons, bookings, timetableSlots, enrollments, invoices, parents) that accumulate reads on every page load and state change. During heavy development sessions with frequent reloads, the daily quota ceiling is reached.
- **Affected operations:** Any Firestore write (create/update/delete) will fail once quota is hit. Reads may also fail. This affects ALL entities, not just invoices.
- **Workaround:** Wait until next day (quota resets at midnight Pacific Time).
- **Permanent fix:** Upgrade to Firebase **Blaze plan** (pay-as-you-go). No daily limits, charges ~$0.06/100k reads, ~$0.18/100k writes. Recommended for any production or active development usage.
- **NOT a Phase 17.3 bug:** The same counter pattern (`reserveCounterRange`) and listener pattern are used by lessons, teachers, students, parents, bookings, timetable slots, and enrollments — all of which worked fine until the cumulative daily quota was exhausted.

---

## LOW (cleanup, unused, cosmetic)

### L1) Firebase CDN imports — no type declarations
- **Status:** pre-existing (known architectural choice)
- **Severity:** LOW (but MASKS other errors — see H2)
- **Location:** `context/AppContext.tsx` lines 15, 32, 42
- **TS Error:** TS2307: Cannot find module (3 occurrences)
- **Problem:** Firebase is loaded via CDN URLs (`https://www.gstatic.com/firebasejs/...`). TypeScript cannot resolve type declarations for URL-based imports.
- **Root cause:** Architectural choice — Firebase loaded via CDN importmap, not npm.
- **Runtime effect:** None — Vite resolves these at build time via importmap. App works.
- **IMPORTANT SIDE EFFECT:** These 3 errors break type resolution for the ENTIRE AppContext module. This masks downstream type errors (like H2) that would otherwise be caught. Any consumer of `useApp()` gets degraded type checking.
- **Risk if fixed:** LOW — add a `firebase.d.ts` stub file with `declare module` for the 3 CDN URLs. This would EXPOSE currently-hidden type errors.
- **Blocks Phase 10+:** No, but fixing this would improve type safety across the entire app.
- **Suggested fix (interim):** Create `types/firebase-cdn.d.ts` with `declare module 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';` etc. Full fix in Phase 21 (npm migration).

### L2) `src/firebaseConfig.ts` — dead/duplicate file
- **Status:** pre-existing
- **Severity:** LOW
- **Location:** `src/firebaseConfig.ts` lines 3-7
- **TS Error:** TS2307: Cannot find module (5 occurrences)
- **Problem:** This file imports Firebase from npm paths (`firebase/app`, etc.) which don't exist. It duplicates the config already hardcoded in `context/AppContext.tsx` lines 58-65. No file in the project imports this module.
- **Root cause:** Leftover from a previous setup attempt or template.
- **Runtime effect:** None — file is never imported.
- **Risk if fixed:** NONE — just delete the file.
- **Blocks Phase 10+:** No.
- **Suggested fix:** `rm src/firebaseConfig.ts` — verify no imports reference it first.

### L3) 26 `as any` casts in AppContext.tsx
- **Status:** pre-existing
- **Severity:** LOW (technical debt)
- **Location:** `context/AppContext.tsx` — 26 occurrences of `as any`
- **Problem:** Extensive use of `as any` bypasses TypeScript's type checking. Some are necessary (CDN imports), some are laziness (avoiding proper typing of function parameters/return values).
- **Root cause:** Rapid development without strict typing discipline.
- **Runtime effect:** None directly, but prevents TypeScript from catching real bugs.
- **Risk if fixed:** MEDIUM — some casts exist because types don't match; removing them would expose errors that need separate fixes.
- **Blocks Phase 10+:** No.
- **Suggested fix:** Address incrementally as each phase touches the relevant code. Do not attempt bulk removal.

---

## Summary Table (as of Phase 12)

| # | Severity | File | Line(s) | TS Error | Status |
|---|----------|------|---------|----------|--------|
| ~~H1~~ | ~~HIGH~~ | ~~AppContext.tsx~~ | ~~743, 759~~ | ~~TS2339~~ | **FIXED in Phase 10** |
| ~~H2~~ | ~~HIGH~~ | ~~AppContext.tsx~~ | ~~interface~~ | ~~(masked)~~ | **FIXED in Phase 10** |
| M1 | MEDIUM | AppContext.tsx | 1272 | TS2322 | ✅ **FIXED** (micro-fix, 2026-03-24) |
| M2 | MEDIUM | excelExport.ts | 353-365 | TS2339/2551 | Pre-existing, pending |
| ~~M3~~ | ~~MEDIUM~~ | ~~AppContext.tsx~~ | ~~851~~ | ~~TS2554~~ | **FIXED in Phase 10** |
| L1 | LOW | AppContext.tsx | 15, 32, 42 | TS2307 ×3 | Pre-existing, pending |
| ~~L2~~ | ~~LOW~~ | ~~src/firebaseConfig.ts~~ | ~~3-7~~ | ~~TS2307 ×5~~ | **FIXED in Phase 10 (deleted)** |
| L3 | LOW | AppContext.tsx | scattered | (not errors) | Pre-existing, pending |

**8 TypeScript errors remaining (from 17). M1 fixed as micro-fix (2026-03-24). Zero introduced by Phases 10–17.3.**

---

## Recommendation: What to fix next

### Remaining items (none blocking):
- **H2** — Add `deleteLesson` to `AppContextType` interface. 1 line.
- **M3** — Remove db argument from `generateTestScenario()` call. 1 line.
- **L2** — Delete dead `src/firebaseConfig.ts`. 0 lines.

### Can safely wait:
- **M1** — Guarantee migration function rarely used. Fix when guarantee logic is consolidated.
- **M2** — Excel export columns. Fix in Phase 17 (Payment/Invoice) when export is reworked.
- **L1** — CDN type stubs. Fix in Phase 21 or when type safety becomes a blocker.
- **L3** — `as any` reduction. Fix incrementally per phase.

---

## Fixed During Phase 17.6A (Payroll & Invoice Workflow Refinement)
- **Zero new TS errors introduced.** 8 pre-existing errors remain (3 CDN imports, 5 excelExport).
- **No bugs fixed.** Phase is purely additive UI/workflow refinements.
- **Net result:** 8 TypeScript errors, same as before Phase 17.6A. Zero new errors.

## Fixed During Phase 17.6 (Payroll Entity + Settlement Tracking)
- **One bug fixed during implementation**: `inst` variable was used on line 79 of `payrollService.ts` before its declaration on line 86. Moved declaration before first usage. Not a TS error (hoisted `const` in same scope) but would have caused a runtime ReferenceError.
- **Net result:** 8 TypeScript errors, same as before Phase 17.6. Zero new errors.

## Fixed During Phase 17.G.1 (Invoice Guarantee Integration)
- **One TS error introduced and fixed within the phase**: `teachers` not destructured from useApp in InvoiceManagement.tsx — added to destructuring. Error caught during build check and resolved.
- **Net result:** 8 TypeScript errors, same as before. Zero new errors.

## Fixed During Phase 17.G (Guarantee System Refactor)
- **Zero new TS errors introduced.** 8 pre-existing errors remain (3 CDN imports, 5 excelExport).
- **4 behavioral bugs fixed** (see DECISIONS.md Phase 17.G for details):
  1. Teacher payroll used school's guarantee config instead of teacher's own
  2. Payroll shortfall used `teacher.baseRate` instead of `resolveTeacherRate()`
  3. Invoice shortfall used `school.defaultRate` / manual lookup instead of `resolveSchoolRate()`
  4. Delivery mode ignored entirely for guarantee applicability

## Fixed During Phase 17.5 (Portal Integration & Visibility)
- **One TS error introduced and fixed within the phase**: `Object.entries(byChild)` returned `unknown` for values in ParentEnrollments.tsx — fixed with explicit `[string, Enrollment[]][]` cast. Error caught during build check and resolved before completion.
- **Net result:** 8 TypeScript errors, same as before Phase 17.5. Zero new errors.

## Fixed During Phase 17.4 (Payment Entity & Invoice Reconciliation)
- **No errors fixed or introduced** — Phase 17.4 adds PaymentStatus, PaymentMethod enums and Payment interface to types.ts; creates `services/paymentService.ts` with `getInvoicePaidAmount()` and `resolveInvoiceStatusAfterPayment()` helpers; adds Payment CRUD (addPayment, updatePayment, deletePayment) and `reconcileInvoice()` to AppContext; creates PaymentManagement admin page with create/edit/delete (completed payment deletion requires explicit double-confirmation); adds `/admin/payments` route and "Payments" sidebar nav. Reconciliation auto-updates invoice paidAmount + status (PAID/PARTIALLY_PAID/OVERDUE/ISSUED) and auto-locks/unlocks isLocked accordingly.
- **Net result:** 8 TypeScript errors, same as before Phase 17.4. Zero new errors.

## Fixed During Phase 17.3 (Invoice Entity)
- **No errors fixed or introduced** — Phase 17.3 adds Invoice interface (InvoiceStatus, InvoicePayerType enums, InvoiceLineItem interface), helper functions (getInvoiceSubtotal, getInvoiceBalanceDue), Invoice CRUD in AppContext, Firestore `/invoices` collection listener (admin only), InvoiceManagement admin page with B2B/B2C generation, route + sidebar nav. `invoiceNumber` generated via `INV-YYYYMM-XXXX` counter pattern. All new types/fields are additive.
- **Net result:** 8 TypeScript errors, same as before Phase 17.3. Zero new errors.

## Fixed During Phase 17.2 (Enrollment Entity)
- **No errors fixed or introduced** — Phase 17.2 adds Enrollment interface (EnrollmentStatus, EnrollmentPayerType, EnrollmentBillingStatus enums), Enrollment CRUD in AppContext, Firestore `/enrollments` collection listener (admin only), EnrollmentManagement admin page, route + sidebar nav. All new fields/types are additive. `enrollmentId` on Lesson was already added in Phase 17.1.
- **Net result:** 8 TypeScript errors, same as before Phase 17.2. Zero new errors.

## Fixed During Phase 17.1 (Rate Engine + Dead Code Cleanup)
- **Created `services/rateService.ts`** — centralized `resolveTeacherRate()` and `resolveSchoolRate()` replacing inline rate computation in Attendance.tsx, LessonLog.tsx, AppContext.tsx (addLesson, generateLessonsFromTimetable), and BookingManagement.tsx.
- **Regression bug found and fixed**: Initial implementation used early-return pattern which broke Group lesson rates. `baseGroupRate` must OVERRIDE `ratesBySchool[schoolId]` (sequential-assignment pattern). Fixed to use `let rate = ...` with sequential overrides matching old inline behavior. Same fix applied to `resolveSchoolRate` where `teacherRates` must only apply to Individual (not Group).
- **Removed 4 dead functions** from AppContext.tsx: `calculateGroupLessonFinancials`, `calculateLessonFinancials`, `calculateTeacherEarnings`, `calculateSchoolRevenue` — confirmed unused by grep across all UI pages.
- **Added `enrollmentId?: string`** to Lesson interface (Phase 17 enrollment linkage).
- **Net result:** 8 TypeScript errors, same as before Phase 17.1. Zero new errors.

## Fixed During Phase 15 (Scheduling Engine)
- **No errors fixed or introduced** — Phase 15 adds DeliveryMode enum, TimetableSlot entity, timetable CRUD, lesson generation from timetable, deliveryMode field on Lesson/Booking, delivery mode display in all portal pages, delivery mode column in exports, delivery mode in PDF reports, and schedule pages for admin/teacher. One TS error in ScheduleManager (selectedOptions type) was introduced and fixed within the same phase.
- **Net result:** 9 TypeScript errors, same as before Phase 15. Zero new errors.

## Fixed During Phase 16 (Online Lessons Configuration)
- **No errors fixed or introduced** — Phase 16 adds `supportsOnline`, `onlineRate`, `onlineGroupRate`, `onlineRatesBySchool` to Teacher interface; `defaultOnlineRate`, `defaultOnlineGroupRate`, `onlineTeacherRates`, `onlineInstrumentRates` to School interface; `OnlineSessionConfig` stub; online config UI in Configuration page; teacher filtering by `supportsOnline` in ScheduleManager and BookingManagement; online info indicator in Attendance. All new fields are optional — zero breaking changes.
- **Net result:** 9 TypeScript errors, same as before Phase 16. Zero new errors.

## Fixed During Phase 14.1a (PDF Report Branding)
- **No errors fixed or introduced** — Phase 14.1a replaces the PDF logo placeholder with the real ARTickle logo (fetched at runtime), adds Phase 13 evaluation fields (overallGrade, repertoire, practiceAssignment, examPrepStatus), and improves section layout with branded styling. Only `generatePDF()` in LessonLog.tsx was modified.
- **Net result:** 9 TypeScript errors, same as before Phase 14.1a. Zero new errors.

## Fixed During Phase 9.1
- **No errors fixed or introduced** — Phase 9.1 adds parentId (PAR-NNN) generation, private student PV-NNN IDs, and Edit button/modal in UserManagement. No existing code paths broken.
- **Net result:** 9 TypeScript errors, same as before Phase 9.1. Zero new errors.

## Fixed During Phase 14
- **No errors fixed or introduced** — Phase 14 adds new Booking entity, collection, pages, and CRUD. No existing code paths modified.
- **Net result:** 9 TypeScript errors, same as before Phase 14. Zero new errors.

## Fixed During Phase 13
- **No errors fixed or introduced** — Phase 13 only added new optional fields to the Lesson interface and display logic.
- **Net result:** 9 TypeScript errors, same as before Phase 13. Zero new errors.

## Fixed During Phase 12
- **SchoolDashboard TS error** — `Object.entries` inferred `config` as `object`, causing TS2339. Fixed with explicit cast to `{ minHours: number; guaranteed: boolean }`. This was introduced and fixed in the same phase — zero net new errors.
- **Net result:** 9 TypeScript errors, same as before Phase 12.

## Fixed During Phase 11
- **Permission service notes leak** — `filterLessonFields` for PARENT/STUDENT included `notes` field, violating DECISIONS.md. Removed `notes` from parent/student lesson view.
- **Net result:** 9 TypeScript errors, same as before Phase 11. Zero new errors.

## Fixed During Phase 10 (includes 9.5 prerequisite fixes)
- **H1** — `lesson.duration` → `(lesson.durationMinutes || 60) / 60` in calculateGroupLessonFinancials and calculateLessonFinancials. Fixed financial calculations for non-60min lessons.
- **H2** — Added `deleteLesson: (id: string) => Promise<void>` to AppContextType interface. Type-only fix.
- **M3** — Removed extra `db` argument from `generateTestScenario()` call. Zero runtime effect.
- **L2** — Deleted dead `src/firebaseConfig.ts` (zero imports confirmed). Removed 5 TS errors.
- **Net result:** 17 → 9 TypeScript errors. 8 errors eliminated.

## Phase 17.7 — Invoice & Payroll Export
- **New errors introduced:** 0
- **Pre-existing errors:** 8 (unchanged — 3 CDN imports, 5 excelExport property mismatches)
- **Build status:** `vite build` passes clean
- **Notes:** Two new service files created; no modifications to existing export code paths.

## Phase 17.7A — Finance Export Redesign
- **New errors introduced:** 0
- **Pre-existing errors:** 8 (unchanged)
- **Build status:** `vite build` passes clean (586 kB)
- **Temporary issue during implementation:** `LessonStatus.LATE` and `LessonStatus.SICK` used in exportGrouping.ts BILLABLE_STATUSES — corrected to match actual enum values (PRESENT, TAUGHT, ABSENT_UNEXCUSED). Fixed before final build.
- **Notes:** Rewrote invoiceExportService.ts and payrollExportService.ts, created new exportGrouping.ts. Old Financials export paths untouched.

## Phase 17.8 — Invoice & Payroll UI Minimal Alignment
- **New errors introduced:** 0
- **Pre-existing errors:** 8 (unchanged)
- **Build status:** `vite build` passes clean (587 kB)
- **Notes:** UI-only changes to InvoiceManagement.tsx. No logic, data, or export changes.

## Fixed During Phase 9
- None (no errors were blocking)

## Fixed During Phase 8
- **Double AppProvider wrapping** (pre-existing logic bug) — removed inner AppProvider from App.tsx
- **Duplicate script tag in index.html** (pre-existing) — removed duplicate `/index.tsx` script

## Fixed During Phase 7
- Firestore rules case mismatch ('Admin'→'admin', 'Teacher'→'teacher')
- AppContext stale closure bug (startListeners now accepts user parameter)
- Student query scoping for teachers (added where clause)
- loadTestScenario production guard (added import.meta.env.PROD check)
