# Phase 19.6 — Enrollment System Refinement Plan

**Status:** PLANNING — awaiting approval  
**Date:** 2026-04-14  
**Depends on:** Phase 17.2 (Enrollment Entity), Phase 15 (Scheduling)

---

## 1. Refined Enrollment Data Model

### Current Enrollment Interface
```typescript
interface Enrollment {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  schoolId?: string;
  schoolName?: string;
  instrument: string;
  totalLessons: number;
  durationMinutes: number;
  lessonType: 'Individual' | 'Group';
  deliveryMode: DeliveryMode;
  payerType: EnrollmentPayerType;       // parent | school
  billingStatus: EnrollmentBillingStatus;
  priceExpected?: number;
  status: EnrollmentStatus;             // active | completed | paused | cancelled
  notes?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}
```

### Proposed Additions
```typescript
interface Enrollment {
  // ... all existing fields unchanged ...

  // ── Phase 19.6 new fields ──

  /** Enrollment period — when lessons can be scheduled/consumed */
  startDate?: string;          // ISO date 'YYYY-MM-DD', optional for backward compat
  endDate?: string;            // ISO date 'YYYY-MM-DD', optional for backward compat

  /** Link to the school enrollment period this was derived from (if any) */
  schoolPeriodId?: string;     // references SchoolEnrollmentPeriod.id

  /** Whether this enrollment's dates were manually overridden from the school default */
  isDateOverride?: boolean;    // true = admin manually set dates, ignoring school period

  /** Academic context */
  academicYear?: string;       // e.g. "2025-2026" — derived from school period or manual
  term?: string;               // e.g. "Term 1", "Semester 2" — free text, optional

  /** Self-paid student support */
  payerType: EnrollmentPayerType;  // parent | school | self  (enum extended)
}
```

### Field Rationale
| Field | Why |
|-------|-----|
| `startDate` / `endDate` | Define when the enrollment is valid. Enables historical vs current queries. |
| `schoolPeriodId` | Links to the school's default period — allows bulk updates if a period changes. |
| `isDateOverride` | Distinguishes manual overrides from inherited defaults. If `false`/undefined, dates sync with the school period. |
| `academicYear` / `term` | Display context for grouping and filtering enrollments ("2025-2026 Term 1"). |

### Backward Compatibility
- All new fields are **optional** (`?`).
- Existing enrollments with no `startDate`/`endDate` are treated as **undated** — they behave exactly as today (no period restrictions).
- `payerType` enum extension adds `self` without breaking existing `parent`/`school` values.

---

## 2. School Enrollment Period Model

### New Entity: `SchoolEnrollmentPeriod`
```typescript
interface SchoolEnrollmentPeriod {
  id: string;                  // e.g. "sep_1711234567_abc123"
  schoolId: string;            // references School.id
  schoolName: string;          // denormalised for display

  /** Period identity */
  name: string;                // e.g. "2025-2026 Term 1"
  academicYear: string;        // e.g. "2025-2026"
  term?: string;               // e.g. "Term 1", "Semester 2" (optional)

  /** Date range */
  startDate: string;           // ISO 'YYYY-MM-DD'
  endDate: string;             // ISO 'YYYY-MM-DD'

  /** Package defaults for this period */
  defaultTotalLessons: number;      // e.g. 16
  defaultDurationMinutes: number;   // e.g. 30

  /** Status */
  status: 'active' | 'archived';
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}
```

### Firestore Location
```
/schoolEnrollmentPeriods/{id}
```

### Design Decisions
- **One period per school per term** — the admin creates a period when a new term starts. Old periods are archived, not deleted.
- **Not nested under schools** — top-level collection for simpler querying across all schools.
- **Default package values** — when creating enrollments from a period, `totalLessons` and `durationMinutes` are pre-filled but editable per student.
- **No auto-expiry** — periods don't auto-close. The admin manually archives them or they remain active past `endDate`. Status is informational.

---

## 3. Student Assignment / Default + Override Logic

### Flow: Creating Enrollments from a School Period

```
Admin selects a school period
  → System lists all students at that school (via student.schoolId)
  → Admin can select all or subset of students
  → For each selected student:
      - Creates Enrollment with:
        startDate = period.startDate
        endDate = period.endDate
        schoolPeriodId = period.id
        academicYear = period.academicYear
        term = period.term
        totalLessons = period.defaultTotalLessons (editable)
        durationMinutes = period.defaultDurationMinutes (editable)
        isDateOverride = false
      - teacherId, instrument, payerType set per student (from existing data or form)
```

### Manual Override
- Admin can edit any enrollment's `startDate` / `endDate` independently.
- When overridden: `isDateOverride = true`.
- If `isDateOverride = true`, the enrollment is **excluded** from future bulk-update-from-period operations.
- If `isDateOverride = false` and the period's dates change, the admin gets a prompt: "Update all linked enrollments to the new period dates?"

### Private Students (no school)
- Private students have `schoolId = undefined`.
- Their enrollments have no `schoolPeriodId` — dates are always manual.
- `startDate` / `endDate` remain optional for private student enrollments (backward compat).

---

## 4. Payer Type Model

### Extended Enum
```typescript
export enum EnrollmentPayerType {
  PARENT = 'parent',
  SCHOOL = 'school',
  SELF   = 'self'       // Phase 19.6 addition
}
```

### Payer Type Semantics

| Payer | Who pays | Invoice target | Use case |
|-------|----------|---------------|----------|
| `school` | The school (B2B) | School entity | Most common — school pays ARTickle for the teacher |
| `parent` | The parent (B2C) | Parent entity | Private lessons or parent-funded school lessons |
| `self` | The student directly | Student entity | Adult students paying for themselves |

### Invoice Integration (Phase 17)
- Existing invoice generation keys on `payerType`:
  - `school` → invoice addressed to `schoolId`
  - `parent` → invoice addressed to `parentId` (resolved from student's `parentId`)
  - `self` → invoice addressed to `studentId` (new)
- For `self` payer type, the student must have `email` and a linked `uid` (Firebase auth) for billing visibility.

### Backward Compatibility
- All existing enrollments are `parent` or `school` — no migration needed.
- The `self` option only appears in the create/edit form.
- `ParentBilling.tsx` and `SchoolInvoices.tsx` are unaffected — they already filter by their own entity ID.

---

## 5. Lesson Counting Rules

### Current Rules (unchanged)
```typescript
export const ENROLLMENT_CONSUMED_STATUSES: readonly LessonStatus[] = [
  LessonStatus.PRESENT,
  LessonStatus.TAUGHT,
  LessonStatus.ABSENT_UNEXCUSED,
] as const;
```

**Consumed:** Present, Taught, Absent (Unexcused) — these count against `totalLessons`.  
**Not consumed:** Cancelled, Absent (Excused), Scheduled — these do NOT count.

### `getEnrollmentRemaining()` — No Change Needed
```typescript
function getEnrollmentRemaining(enrollment, lessons) {
  const consumed = lessons.filter(
    l => l.enrollmentId === enrollment.id
      && ENROLLMENT_CONSUMED_STATUSES.includes(l.status)
  ).length;
  return { consumed, remaining: Math.max(0, enrollment.totalLessons - consumed) };
}
```

### Date-Aware Validation (New)
When an enrollment has `startDate` and `endDate`, a new helper validates that a lesson falls within the period:

```typescript
function isLessonInEnrollmentPeriod(lesson: Lesson, enrollment: Enrollment): boolean {
  if (!enrollment.startDate || !enrollment.endDate) return true; // undated = always valid
  return lesson.date >= enrollment.startDate && lesson.date <= enrollment.endDate;
}
```

**Usage:** Advisory only — displayed as a warning in the UI if a lesson is linked to an enrollment but falls outside its date range. Does NOT block the lesson from being created (flexibility for edge cases).

---

## 6. Lesson ↔ Enrollment Linking Strategy

### Current State
- `Lesson.enrollmentId?: string` — optional link to an Enrollment.
- Set during lesson creation in `Attendance.tsx` or `LessonLog.tsx`.
- Currently requires manual selection from a dropdown of active enrollments.

### Proposed Enhancement: Smart Auto-Linking

When a teacher records a lesson:
1. System checks for **active enrollments** matching `(studentId, teacherId, instrument)`.
2. If exactly **one** match → auto-populate `enrollmentId` (teacher can override).
3. If **multiple** matches → show dropdown of matching enrollments with remaining count.
4. If **zero** matches → leave `enrollmentId` empty (lesson stands alone).

### Date-Aware Filtering
If enrollments have `startDate`/`endDate`, the auto-link logic only considers enrollments where `lesson.date` falls within the period. This naturally separates current vs expired enrollments.

### Group Lesson Linking
- Group lessons have `studentIds: string[]`.
- Each student in a group lesson can be linked to a **different** enrollment.
- Current model: single `enrollmentId` per lesson — this is a limitation.
- **Phase 19.6 does NOT change this.** Group enrollment linking is deferred to a future phase.
- Workaround: group lessons under a school enrollment are linked to a school-level enrollment that covers the group.

---

## 7. Historical vs Current Display Design

### Definition
| Category | Criteria |
|----------|----------|
| **Current** | `status = active` AND (`endDate` is undefined OR `endDate >= today`) |
| **Historical** | `status = completed \| cancelled` OR (`endDate < today`) |
| **Paused** | `status = paused` (shown separately) |

### UI Changes by Page

#### `EnrollmentManagement.tsx` (Admin)
- Add **tab bar**: `Current` | `Historical` | `All`
- Default tab: `Current`
- `Current` tab: shows active enrollments (current period or undated)
- `Historical` tab: shows completed, cancelled, and date-expired enrollments
- `All` tab: shows everything (existing behavior, for search/audit)
- Existing status filter dropdown remains available within each tab

#### `ParentEnrollments.tsx` (Parent)
- Add **toggle**: `Current` (default) | `Past`
- `Current`: active enrollments for their children
- `Past`: completed/cancelled/expired — read-only, no actions

#### `StudentDashboard.tsx` (Student)
- Currently shows active enrollment cards
- Add small "Past Enrollments" expandable section below

#### `AdminStudentDetail.tsx` / `SchoolStudentDetail.tsx` / `TeacherStudentDetail.tsx`
- Add **Enrollment History** section to `StudentReportCore` via `renderAfterSummary` or a new config flag
- Shows: enrollment name/period, totalLessons, consumed, remaining, status badge
- Grouped by academic year if available

### Timeline / Journey Integration
- In `StudentReportCore` journey cards, optionally show enrollment period badge:
  `"Term 1 (3/16 lessons)"` — small, non-intrusive, config-driven

---

## 8. Backward-Compatible Migration Strategy

### Principle: Zero-Downtime, No Data Loss

#### Step 1: Schema Extension (Non-Breaking)
- Add optional fields to `Enrollment` interface (`startDate`, `endDate`, `schoolPeriodId`, `isDateOverride`, `academicYear`, `term`).
- Add `self` to `EnrollmentPayerType` enum.
- **No Firestore migration needed** — existing documents simply lack the new fields, which default to `undefined`.

#### Step 2: New Collection
- Create `schoolEnrollmentPeriods` collection in Firestore.
- Add `onSnapshot` listener in AppContext alongside existing enrollment listener.
- Add CRUD functions: `addSchoolPeriod`, `updateSchoolPeriod`, `deleteSchoolPeriod`.

#### Step 3: UI Progressive Enhancement
- All new UI elements (tabs, period selector, date fields) handle the `undefined` case gracefully.
- Undated enrollments appear in "Current" tab if `status = active`.
- No forced data backfill — admin can optionally add dates to old enrollments via the edit form.

#### Step 4: Optional Backfill Tool
- Admin-only utility (in Configuration or a dedicated page): "Assign period to existing enrollments"
- Select a school → select a period → shows unlinked active enrollments → bulk-assign dates + `schoolPeriodId`.
- Entirely optional — the system works fine with a mix of dated and undated enrollments.

---

## 9. UI / Configuration Impact

### New Pages / Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `SchoolPeriodManager` | `/admin/periods` (new route) | CRUD for school enrollment periods |
| Enrollment create form updates | `EnrollmentManagement.tsx` | Add date fields, period selector, `self` payer option |
| Enrollment tabs | `EnrollmentManagement.tsx` | Current / Historical / All tabs |
| Bulk enrollment creator | `SchoolPeriodManager` or modal | Create enrollments for all students in a school from a period template |

### Modified Pages

| Page | Changes |
|------|---------|
| `EnrollmentManagement.tsx` | Add date fields, period dropdown, tab bar, `self` payer type |
| `ParentEnrollments.tsx` | Add current/past toggle |
| `StudentDashboard.tsx` | Add past enrollments section |
| `AdminStudentDetail.tsx` | Add enrollment history via renderAfterSummary |
| `SchoolStudentDetail.tsx` | Add enrollment history via renderAfterSummary |
| `TeacherStudentDetail.tsx` | Add enrollment history (read-only) via renderAfterSummary |
| `Sidebar.tsx` | Add "Enrollment Periods" nav item under Admin > Operations |
| `App.tsx` | Add route for `/admin/periods` |
| `AppContext.tsx` | Add `schoolEnrollmentPeriods` collection, CRUD functions, state |
| `types.ts` | Add `SchoolEnrollmentPeriod` interface, extend `EnrollmentPayerType`, add `isLessonInEnrollmentPeriod()` |
| `Configuration.tsx` | No changes — periods are per-school, not global config |

### Sidebar Navigation (Admin)
```
Operations
  ├── Bookings
  ├── Enrollments          (existing)
  ├── Enrollment Periods   (NEW)
  └── Schedule
```

---

## 10. Step-by-Step Rollout Phases

### Phase 19.6A — Data Model + Types (Foundation)
**Files:** `types.ts`
- Add `SchoolEnrollmentPeriod` interface
- Add optional fields to `Enrollment` interface (`startDate`, `endDate`, `schoolPeriodId`, `isDateOverride`, `academicYear`, `term`)
- Add `SELF = 'self'` to `EnrollmentPayerType` enum
- Add `isLessonInEnrollmentPeriod()` helper
- **No UI changes — types only**

### Phase 19.6B — AppContext + Firestore (Data Layer)
**Files:** `context/AppContext.tsx`
- Add `schoolEnrollmentPeriods` state + `onSnapshot` listener
- Add CRUD: `addSchoolPeriod`, `updateSchoolPeriod`, `deleteSchoolPeriod`
- Export new state and functions in context value
- Update `AppContextType` interface

### Phase 19.6C — School Period Manager (New Page)
**Files:** `pages/admin/SchoolPeriodManager.tsx` (new), `App.tsx`, `Sidebar.tsx`
- Full CRUD page for school enrollment periods
- Create/edit form: school selector, name, academic year, term, start/end dates, default lessons, default duration
- Period list with status badges, school grouping
- Archive action (soft status change, not delete)
- Add route `/admin/periods` and sidebar nav item

### Phase 19.6D — Enrollment Form Enhancement
**Files:** `pages/admin/EnrollmentManagement.tsx`
- Add `startDate` / `endDate` date picker fields to create/edit form
- Add school period dropdown: selecting a period auto-fills dates + defaults
- Add `self` option to payer type dropdown
- Add `isDateOverride` toggle (shown when period is linked)
- Add `academicYear` / `term` display fields (auto-filled from period, editable)
- Preserve all existing form behavior for enrollments without periods

### Phase 19.6E — Enrollment Tabs + Historical View
**Files:** `pages/admin/EnrollmentManagement.tsx`, `pages/parent/ParentEnrollments.tsx`, `pages/student/StudentDashboard.tsx`
- Add Current / Historical / All tab bar to admin enrollment page
- Add Current / Past toggle to parent enrollments
- Add past enrollments expandable section to student dashboard
- Implement `isCurrentEnrollment()` / `isHistoricalEnrollment()` helpers in types.ts

### Phase 19.6F — Enrollment History on Student Detail Pages
**Files:** `pages/admin/AdminStudentDetail.tsx`, `pages/school/SchoolStudentDetail.tsx`, `pages/teacher/TeacherStudentDetail.tsx`
- Add enrollment history section via `renderAfterSummary` slot
- Show: period name, dates, total/consumed/remaining, status badge
- Grouped by academic year when available
- Read-only for teacher and school admin views

### Phase 19.6G — Bulk Enrollment Creator
**Files:** `pages/admin/SchoolPeriodManager.tsx` or new modal component
- "Create Enrollments from Period" action on a school period
- Lists all students at the school, checkbox selection
- Per-student overrides: teacher, instrument, lesson count, duration
- Bulk-create with progress indicator
- Skip students who already have an enrollment in this period

### Phase 19.6H — Verification + Documentation
- Build verification (all modules compile)
- Manual test scenarios:
  - Create school period → bulk-create enrollments → verify dates
  - Override one student's dates → verify `isDateOverride` flag
  - Complete enrollment → verify historical tab
  - Create `self`-paid enrollment → verify payer display
  - Undated legacy enrollment → verify it still works unchanged
- Update `PHASE_STATUS.md`
- Update `docs/` with enrollment system documentation

---

## 11. Risks and Edge Cases

### Risk: Group Lesson Enrollment Linking
- **Issue:** A group lesson has one `enrollmentId` but multiple students, each potentially on different enrollments.
- **Mitigation:** Phase 19.6 does NOT change group lesson linking. The existing single `enrollmentId` per lesson remains. Group enrollment splitting is a future phase.
- **Impact:** Low — most group lessons are school-funded with a single school enrollment covering the group.

### Risk: Period Date Changes After Enrollments Created
- **Issue:** Admin changes a school period's dates after enrollments are linked to it.
- **Mitigation:** Show confirmation dialog: "X enrollments are linked to this period. Update their dates?" Only updates enrollments where `isDateOverride = false`.
- **Edge case:** Some linked enrollments may have lessons outside the new date range → show advisory warning, don't block.

### Risk: Overlapping Periods
- **Issue:** Two active periods for the same school with overlapping date ranges.
- **Mitigation:** Allow it (real schools sometimes have overlapping terms for different instruments/programs). Show a warning in the UI but don't block creation.

### Risk: `self` Payer Type Without Student Auth
- **Issue:** `self`-paid enrollment requires the student to see their own invoices, but the student may not have a Firebase auth account linked.
- **Mitigation:** `self` payer type is only selectable when the student has a `uid` field. Show validation message: "Student must have a linked account for self-pay billing."

### Risk: Undated Enrollment Ambiguity
- **Issue:** Legacy enrollments without dates could be "current" forever.
- **Mitigation:** Undated + active = shown in "Current" tab. Admin can optionally add dates via edit. No forced migration.

### Risk: Performance with Large Enrollment History
- **Issue:** Schools with many terms accumulate large numbers of enrollments.
- **Mitigation:** Historical enrollments load via the same `onSnapshot` (already loaded). Tab filtering is client-side via `useMemo`. If performance becomes an issue in the future, archived periods could be excluded from the initial query.

### Edge Case: Student Transfers Between Schools
- **Issue:** Student moves from School A to School B mid-term. Old enrollment at School A should be completed/cancelled; new enrollment at School B created.
- **Handling:** Manual admin action — complete the old enrollment, create a new one at the new school. The student's detail page shows both in enrollment history.

### Edge Case: Enrollment Without a School (Private Students)
- **Handling:** Private students have no `schoolId`, so no `schoolPeriodId`. Dates are always manual. The "Create from Period" bulk tool skips private students. Private enrollments appear in admin enrollment management but not in any school period view.

### Edge Case: Multiple Enrollments Per Student Per Period
- **Handling:** Allowed — a student might have separate enrollments for piano and violin in the same term. The system does not enforce uniqueness on `(studentId, schoolPeriodId)`. The enrollment list UI shows instrument to distinguish them.

---

## Summary

| Aspect | Decision |
|--------|----------|
| **Migration** | Zero-migration — all new fields optional |
| **School periods** | New top-level Firestore collection |
| **Enrollment dates** | Optional on Enrollment, inherited from school period or manual |
| **Override model** | `isDateOverride` flag separates inherited vs manual dates |
| **Payer types** | Extended to `parent \| school \| self` |
| **Lesson counting** | Unchanged — same consumed statuses |
| **Historical view** | Tab-based filtering by date + status |
| **Group lessons** | No change — deferred to future phase |
| **Rollout** | 8 sub-phases (19.6A → 19.6H), types-first, UI-last |
| **Total new files** | ~2 (SchoolPeriodManager, types additions) |
| **Total modified files** | ~12 |
