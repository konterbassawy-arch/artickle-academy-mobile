# Phase 19.6D — Enrollment Assignment Logic (Planning)

**Status:** PLANNING — awaiting approval
**Date:** 2026-04-14
**Depends on:** 19.6A (model), 19.6B (data layer), 19.6C (period manager UI)
**Does not:** implement code, run migrations, or auto-link lessons

---

## Guiding Principles

1. **Reliability > automation.** A wrong silent assignment is worse than asking an admin to confirm.
2. **Explicit source of truth.** The enrollment a student belongs to is a record, not an inference.
3. **Reviewable, reversible actions.** Every automated suggestion must be undoable and logged.
4. **Preserve lesson history.** Lessons that exist today keep their status, financials, and reports — enrollment linking is additive, never rewriting lesson facts.
5. **No magical backfill.** Old lessons without an enrollment remain valid standalone lessons until a human decides otherwise.

---

## 1. Enrollment Assignment Rules

### Case 1 — New B2B student (school-paid)

| Aspect | Rule |
|--------|------|
| **Student setup** | `schoolId` set, `payerType = school` |
| **Default source** | Pick the most recent `active` `SchoolEnrollmentPeriod` for the student's school (`endDate >= today`) |
| **Fields inherited from period** | `startDate`, `endDate`, `schoolPeriodId`, `academicYear`, `term`, `defaultTotalLessons`, `defaultDurationMinutes` |
| **Editable per student** | `teacherId`, `instrument`, `totalLessons`, `durationMinutes`, `lessonType`, `deliveryMode`, `priceExpected` |
| **Override allowed?** | Yes — admin can set `isDateOverride = true` and use custom dates (e.g. mid-term joiner) |
| **School has no active period?** | Block auto-default; require admin to either (a) create a period first, or (b) create a fully manual enrollment |
| **Multiple active periods?** | Require admin to pick one from a dropdown; don't guess |

### Case 2 — New B2C parent-paid student

| Aspect | Rule |
|--------|------|
| **Student setup** | May have `schoolId` (lessons held at a school) or not. `payerType = parent` |
| **Default source** | **Not** linked to a school period by default — even if the student attends at a school |
| **Why** | School periods define billing cadence for the school, not the parent; term dates often differ for private arrangements |
| **What inherits** | Nothing from the school period by default |
| **Admin choice** | Admin may opt-in to copy dates from a school period (e.g. "align to school calendar") but this is always a deliberate checkbox, never automatic |
| **Override allowed?** | Always — parent-paid enrollments are manual by nature |

### Case 3 — New self-paid adult student

| Aspect | Rule |
|--------|------|
| **Student setup** | `schoolId` may be set or empty. `payerType = self`. Student must have a linked `uid` for self-billing visibility |
| **Default source** | **Fully manual** — adult schedules rarely match school terms |
| **What inherits** | Nothing — admin enters dates, lesson count, duration, and price explicitly |
| **Override allowed?** | Always |
| **Period link?** | Allowed but discouraged — the field exists if the student really is tied to a term, but the default is no link |

### Case 4 — Existing student mid-term (migration case)

| Aspect | Rule |
|--------|------|
| **Historical lessons** | **Never touched.** Existing `Lesson` rows remain as-is with no forced `enrollmentId` |
| **Enrollment creation** | Admin creates a **current** enrollment for the student using the current period (or manual dates) |
| **Past lessons in that period** | **Do not auto-link.** Shown in the UI as "unlinked lessons that fall within this enrollment's date range — review?" |
| **Historical summary** | Optionally, admin can create a **historical summary enrollment** for past terms (totalLessons = count of past lessons in that window), marked `status = completed`. This is a one-click review flow, not automatic |
| **Override allowed?** | Always — admin may set any dates that match reality |

---

## 2. Assignment Source of Truth

### Decision: **Option A — explicit assignment.**

Each student's enrollment(s) are stored as `Enrollment` records. "Current enrollment for this student on this instrument" is computed from those records, not inferred from lesson dates.

### Why not Option B (infer from lessons)

- Silent misassignment is the worst failure mode. If we infer and get it wrong, we break remaining-lesson counts, billing expectations, and historical reports.
- Lesson dates + teacher + instrument are an ambiguous key. A student who changes teacher mid-term, or has overlapping programs, breaks any inference rule we could write.
- Group lessons already have a single `enrollmentId` limitation — trying to infer per-student enrollment from a multi-student lesson makes no sense.
- Reports that already rely on `Enrollment.totalLessons` and `getEnrollmentRemaining()` need a stable record to read.

### Why not pure Option C (hybrid)

Hybrid in practice means "infer + override" which is the same as "silently assign, hope for the best, review later." We reject this.

### What we do instead

- **Records are explicit.** Every enrollment is created by a human (admin / school_admin) via the UI.
- **Inference is only a suggestion layer.** The system may *suggest* a matching enrollment when a new lesson is logged (e.g. "this lesson matches enrollment X — link it?"), but never writes the link without an explicit action.
- **Queries are explicit.** "Current enrollment for student S on instrument I" = `enrollments.find(e => e.studentId === S && e.instrument === I && isCurrent(e))`. No fallback to lesson scanning.

---

## 3. Current vs Historical Enrollment Logic

### Primary flags

| Field | Role |
|-------|------|
| `status` | Lifecycle state (`active` / `paused` / `completed` / `cancelled`) |
| `startDate` / `endDate` | Period window — optional (undated enrollments behave as always-valid) |
| Today's date | Compared against `endDate` |

### Rule

```typescript
function isCurrentEnrollment(e: Enrollment, today: string /* 'YYYY-MM-DD' */): boolean {
  if (e.status !== 'active' && e.status !== 'paused') return false;
  if (!e.endDate) return true;                          // undated = always current if active/paused
  return e.endDate >= today;                            // still inside or on the last day
}

function isHistoricalEnrollment(e: Enrollment, today: string): boolean {
  if (e.status === 'completed' || e.status === 'cancelled') return true;
  if (e.endDate && e.endDate < today) return true;      // expired, even if still marked active
  return false;
}
```

### Interaction table

| `status` | has `endDate`? | `endDate < today`? | Classification |
|----------|---------------|-------------------|----------------|
| active | no | — | **Current** |
| active | yes | no | **Current** |
| active | yes | yes | **Historical** (expired — auto-bucketed to historical in UI, but record stays `active` until a human completes it) |
| paused | no | — | **Current** (paused enrollments are still "the student's current slot") |
| paused | yes | no | **Current** |
| paused | yes | yes | **Historical** |
| completed | any | any | **Historical** |
| cancelled | any | any | **Historical** |

### One active enrollment per student per instrument

This is the locked rule. The system enforces it as a **write-time validation** in `addEnrollment` / `updateEnrollment`:

- When creating a new enrollment: reject if another enrollment with the same `studentId + instrument` already has `status ∈ (active, paused)` AND is `isCurrent()`.
- The validation error should tell the admin which conflicting enrollment is blocking, and give the admin a one-click path to complete/cancel it.
- Historical/completed/cancelled enrollments never block new creation.

### Why paused counts as "current"

A paused enrollment represents "this student is on temporary hold, they still own this slot." Allowing a second active enrollment while one is paused would double-count the student. Admin must either resume, cancel, or complete the paused one before starting a new one.

---

## 4. Manual Override Rules

### Concept

An override is an enrollment where the admin has deliberately decoupled it from its school period's defaults.

### What can be overridden

| Field | Overridable? | Notes |
|-------|-------------|-------|
| `startDate` | ✅ | Flagged as `isDateOverride = true` when it differs from the linked period |
| `endDate` | ✅ | Same |
| `totalLessons` | ✅ | Independent of `defaultTotalLessons` |
| `durationMinutes` | ✅ | Independent of `defaultDurationMinutes` |
| `priceExpected` | ✅ | Free to set |
| `teacherId` | ✅ | Enrollment is per-teacher regardless of school defaults |
| `schoolPeriodId` | Settable / clearable | Admin can detach entirely: set to `undefined` → enrollment becomes standalone |
| `schoolId` | Not via override | Changing school = student transfer, separate workflow |

### The `isDateOverride` flag

- `isDateOverride = false` (or undefined) → enrollment inherits dates from its linked `schoolPeriodId`. If the period's dates change later, admin is offered a bulk-update prompt.
- `isDateOverride = true` → enrollment is frozen to its own dates. Bulk period updates skip it.

### Scenarios

| Scenario | Representation |
|----------|---------------|
| Student joins mid-term | `schoolPeriodId` set, `isDateOverride = true`, `startDate` = actual join date, `endDate` = period end. `totalLessons` reduced proportionally |
| Paused then resumed | Update `status` between `paused` ↔ `active`. Dates unchanged unless admin extends `endDate` explicitly |
| Custom B2C package | No `schoolPeriodId`, all fields manual |
| Self-paid adult, 10-lesson pack | `payerType = self`, no `schoolPeriodId`, `totalLessons = 10`, `startDate` = first lesson date, `endDate` = "expected last lesson" or just `undefined` |
| Fully detached from a school period after the fact | Clear `schoolPeriodId`, set `isDateOverride = true` (or leave the dates as-is but drop the link) |

### Override is additive, not destructive

Clearing `schoolPeriodId` or flipping `isDateOverride` never mutates other enrollments and never touches lessons. It only changes how this one enrollment relates to its period template.

---

## 5. Lesson ↔ Enrollment Linking Strategy

### The four safety tiers

| Action | Tier | Applies to |
|--------|------|-----------|
| Linking a new lesson to an enrollment at creation | **Suggested (auto-preselect, admin confirms with one click)** | New lessons via LessonLog / Attendance / booking conversion |
| Linking an existing unlinked lesson | **Manual or review-required** | Historical lessons |
| Re-linking a lesson to a different enrollment | **Manual** | Never happens automatically |
| Unlinking (clearing `enrollmentId`) | **Manual** | Admin-only |

### New lesson flow (suggested link)

When a teacher/admin logs a new lesson:

1. System finds candidate enrollments where:
   - `enrollmentId` not yet blocked by other rules
   - `studentId` ∈ `lesson.studentIds`
   - `instrument` matches lesson instrument
   - `teacherId` matches lesson teacher (preferred) OR is empty / wildcard
   - `isCurrent(enrollment, lesson.date)` is true
   - `isLessonInEnrollmentPeriod(lesson, enrollment)` is true (from 19.6A helper)
2. **Exactly 1 match** → auto-preselect in the form, show "linked to: [enrollment name]" with an edit control
3. **Multiple matches** → show a dropdown with remaining-count badge, no preselect
4. **Zero matches** → leave unlinked, no warning (lesson remains valid standalone)

**Critical:** step 2 is preselect only. The admin / teacher sees it in the form and clicks save to confirm. The system never writes `enrollmentId` without an explicit submit.

### Old unlinked lessons

Phase 19.6D does not touch them. They remain valid `enrollmentId = undefined` lessons. Reports that aggregate lessons by student/teacher/school continue to work because those reports don't depend on `enrollmentId`.

Phase 19.6D5 (later) provides a **review tool** — a dedicated page that:
- Lists all lessons with `enrollmentId = undefined`
- Groups by student + instrument + date range
- Shows candidate enrollment matches for each group
- Requires admin click-through to link
- Logs every action (who linked what, when)

No batch "link all" button. Review is per-group.

### Date-range usage

- Required to narrow candidates in step 1 above.
- Advisory for display: if a lesson is linked to an enrollment but falls outside its `startDate`/`endDate`, show a yellow warning in the lesson view. Never block, never auto-unlink.

### Group lesson linking

Current model: `Lesson.studentIds: string[]` + single `Lesson.enrollmentId`. This is a structural limitation — multiple students in one lesson could belong to different enrollments.

**Phase 19.6D rule:** group lessons keep the single-`enrollmentId` model. The auto-suggest flow only pre-selects if **all students in the group lesson have exactly one matching candidate, and all those candidates are the same enrollment** (unlikely, but safe). Otherwise, leave unlinked and let the admin decide.

Splitting group-lesson linking into per-student enrollment attribution is **deferred to a future phase** (not 19.6D). The current workaround remains: one school-level enrollment covers the group.

---

## 6. Assignment / Linking Safety Model

### Classification of operations

| Operation | Tier | Rationale |
|-----------|------|-----------|
| New enrollment for new student, school period selected | **Automatic with form review** (admin opens the form, sees pre-filled defaults, clicks Create) | Safe because admin sees and approves every field |
| Blocking duplicate active enrollments on same student+instrument | **Automatic (validation)** | Safe because it prevents an obvious error |
| Bulk create enrollments for many students from a period | **Review-required** (select students, see preview list, confirm) | Safe because admin sees exactly which students + which defaults before committing |
| New lesson linking | **Suggested, admin confirms on submit** | Admin always clicks save |
| Linking existing unlinked lesson to enrollment | **Manual per-lesson or per-group** | Small blast radius, reviewable |
| Bulk auto-link of historical lessons | **Not supported** | Too risky, no way to audit |
| Creating historical summary enrollment from past lessons | **Review-required** (show preview: period dates, lesson count, students, totals) | Admin confirms before writing |
| Student transfer to another school | **Manual** (step-by-step flow: close current enrollment, create new at new school) | Complex, per-student |
| Period date change propagating to inherited enrollments | **Confirm dialog** (show affected enrollments, admin confirms) | Admin sees blast radius |
| Deleting an enrollment | **Manual + confirm + block if linked lessons exist** | Already implemented style |
| Archiving a school period | **Manual** (already live in 19.6C) | Soft op, reversible |

### The "review-required" pattern

Every review-required action follows this flow:
1. Preview screen shows: what will be created/changed, affected records, counts, warnings
2. Admin clicks "Confirm" button
3. Server writes with a log entry: `{ action, actor, timestamp, before, after, affectedIds }`
4. Success screen with undo link where possible

**No review-required action ever fires on page load, on listener change, or in a background job.** They all require explicit click.

---

## 7. Student List / Student Detail Impact (UI spec — not yet built)

### Student list

For each student row, show **only** the current-active enrollment summary:

| Field | Source |
|-------|--------|
| Term label | `currentEnrollment.term` or `currentEnrollment.academicYear` or `"—"` |
| Remaining lessons | `getEnrollmentRemaining(currentEnrollment, lessons).remaining` |
| Total lessons | `currentEnrollment.totalLessons` |
| Small badge | Green if remaining ≥ 20% of total, amber < 20%, red = 0 |

If the student has **no current enrollment**, show a subtle "No active enrollment" badge. Do not show any historical data on the list.

Students with multiple instruments: if a student has active enrollments for multiple instruments, show a compact "N enrollments" pill that expands on hover. First pass: only show the most-recently-updated one.

### Student detail

Three sections, stacked:

1. **Current active enrollment(s)** — one card per active-per-instrument enrollment. Each card shows:
   - Period name + academic year + term
   - Dates (startDate → endDate)
   - Teacher, instrument, lesson type, delivery mode
   - Consumed / Remaining / Total (big numbers)
   - Payer type badge
   - "Edit" button (admin / school_admin only)

2. **Historical enrollments** — collapsible list, grouped by academic year descending. Each row: compact summary + click to expand for stats.

3. **Unlinked lessons** — count badge: "N lessons not yet linked to any enrollment" — links to the review tool (19.6D5). Shown only if any unlinked lessons exist for this student.

### Data flow

`StudentReportCore` gets a new optional `renderEnrollmentHistory` prop (or new config flag). Parent/student/teacher views pass it; school_admin and admin views pass a version with edit controls enabled. No new component needed — fits the existing config-driven pattern from Phase 19.5.

### What does NOT change

- Lesson history table
- Summary stats (total hours, attendance rate, etc.)
- PDF / Excel exports
- Financial display

---

## 8. Migration Strategy for Existing Students

### Principle

We do not run a single big-bang migration. We provide tools that let an admin migrate **student by student, at their own pace, with every step reviewable and reversible.**

### Phase 0 — Preconditions (already done)

- ✅ 19.6A — optional fields on Enrollment
- ✅ 19.6B — Firestore collection + listener + CRUD
- ✅ 19.6C — SchoolPeriodManager UI

### Phase 1 — Create school periods (admin task, no code)

Admin uses 19.6C UI to create the `SchoolEnrollmentPeriod` record(s) for the current term of each school. This is just data entry.

### Phase 2 — Current enrollments (code + admin work)

For each active student:
- **If the student has an existing enrollment record** (pre-19.6 enrollments created in Phase 17.2 with no dates): admin opens the enrollment, links it to a period (or manual dates), checks `isDateOverride` if needed, saves. No data is destroyed.
- **If the student has no enrollment record**: admin creates a new current enrollment from the appropriate school period.
- The existing `EnrollmentManagement.tsx` page gains period-awareness fields (date pickers, period dropdown) in Phase 19.6E.

Optional: a small "Students without a current enrollment" filter on the admin students page, to help the admin work through the list.

### Phase 3 — Lesson validation (advisory, no mutation)

For each current enrollment, the admin detail page shows:
- "Lessons in this period's date range: N"
- "Linked to this enrollment: M"
- "Unlinked lessons in this range: N - M"

Lessons are not auto-linked. The admin reviews and clicks-through on a per-enrollment basis.

### Phase 4 — Historical summaries (optional, per-student)

For students with significant past lesson history, the admin can **optionally** create a historical summary enrollment:
- Preview screen: "this student has 47 lessons before 2025-09-01 at School X, Teacher Y, Instrument Piano. Create a historical enrollment marked `completed` with `totalLessons = 47`?"
- Admin clicks Confirm. Enrollment is written with `status = completed`, `endDate = <latest lesson date>`, `startDate = <earliest lesson date>`, `isDateOverride = true`, no `schoolPeriodId`.
- This is **for display only** — it doesn't re-link the historical lessons, it just gives the student detail page a "last term" card to show.
- Entirely optional. Skipping it means the student's history simply doesn't appear in the enrollment timeline, only in the lesson log.

### Phase 5 — Detailed backfill (future, optional)

Review tool (19.6D5) for linking individual historical lessons to enrollments, if the admin ever wants the data clean. This is entirely optional and can be done years after the feature ships.

### What never happens automatically

- No batch write on the Firestore collection
- No "migrate all existing enrollments" script
- No "auto-create enrollments from lesson history" background job
- No destructive updates to existing `Lesson` records

### Rollback

Every step is a single Firestore write that can be undone by editing/deleting the created enrollment. No lessons are touched. No financials recomputed. Worst case, an admin creates a wrong enrollment, spots it, clicks cancel/complete or delete, moves on.

---

## 9. Payer Type Logic

### `school`

- **Default behavior:** uses school period defaults when available. If the student's school has an active period, it pre-fills the form. Admin confirms.
- **Invoice target:** `schoolId` (existing logic, no change)
- **Period link:** strong default — "link to school period" is the norm
- **Override:** allowed, flagged via `isDateOverride`

### `parent`

- **Default behavior:** **does not** use school period defaults by default, even if the student attends at a school
- **Reason:** parent billing cycles rarely match school term billing cycles; parents often pay by custom package or by month
- **Period link:** allowed as opt-in (checkbox in form: "align to school calendar") but off by default
- **Invoice target:** parent entity (existing logic)
- **Override:** everything is effectively "override" for parent-paid; the form is fully manual
- **Common case:** 10-lesson packages, quarterly billing, custom schedules

### `self`

- **Default behavior:** fully manual. No period link by default.
- **Reason:** adult students have their own schedules, budgets, availability
- **Student requirement:** the student must have a linked Firebase `uid` to see their own invoices (enforced in form validation)
- **Period link:** rarely used — allowed, but almost nobody will use it
- **Invoice target:** `studentId` (new for Phase 19.6; existing invoice logic needs a small extension in a later phase to address invoices to students directly — out of scope for 19.6D)
- **Common case:** "pay-as-you-go" or "6-lesson intro pack" style enrollments

### Summary table

| `payerType` | School period default? | Bills to | Typical use |
|-------------|----------------------|----------|-------------|
| `school` | Yes (opt-out) | School | B2B partnership — the bread and butter |
| `parent` | No (opt-in) | Parent | Private lessons with a parent payer |
| `self` | No | Student | Adult self-paying students |

### Form implications (19.6E)

The form starts in the right mode based on the selected student:
- student has `schoolId` and no `parentIds` → default to `payerType = school`, preselect school period dropdown
- student has `parentIds` → default to `payerType = parent`, no period preselection
- student has `uid` and no `parentIds` and no `schoolId` → default to `payerType = self`, no period
- ambiguous (e.g. student has schoolId AND parentIds) → no default, admin picks

Admin can always override the preselection.

---

## 10. Edge Cases

### Student transfers to another school

- **Workflow:** complete/cancel all current enrollments at the old school (status change), change `student.schoolId` to new school, create new enrollment at new school
- **Not supported:** editing the schoolId field of an existing enrollment. If the school changes, the old enrollment is historical and a new one is created
- **UI:** transfer flow is a dedicated action in the student detail page (out of scope for 19.6D, noted for future)

### Teacher changes mid-period

- **Workflow:** complete the current enrollment on the old teacher, create a new one with the same period + new teacher
- Alternative: edit `teacherId` on the existing enrollment — allowed, but the admin decides. The second option doesn't preserve historical attribution of earlier lessons to the old teacher's enrollment, which is why the first option is recommended
- **Validation:** the "one active per student + instrument" rule still applies. Admin must close the old enrollment before opening the new one

### Instrument changes

- Same as teacher changes. Each instrument has its own enrollment by rule. If a student switches from violin to cello, the violin enrollment is completed and a new cello enrollment is created. No reconciliation needed

### Overlapping school periods (same school, same instrument)

- Allowed (some schools run parallel programs, summer camps during term time, etc.)
- When creating a new enrollment, if multiple periods cover the lesson date, admin picks one from a dropdown
- Overlap warning already exists in 19.6C for period creation

### Paused enrollments

- `status = paused` counts as "the student's current slot." Blocks creation of another active enrollment on the same student + instrument
- Resume: flip back to `active`
- Cancel: flip to `cancelled` → becomes historical
- Dates: paused doesn't extend the `endDate` automatically. If the admin wants to extend, they edit `endDate` explicitly

### B2C student inside a school

- `payerType = parent` with `schoolId` set
- School period **not** linked by default
- Lessons still happen at the school location, but billing is to the parent
- Shows up in the school's lesson list but not in the school's invoices
- Already supported by Phase 17 logic; Phase 19.6D just adds the clearer default in the form

### Adult self-paid without school

- `payerType = self`, `schoolId` undefined or empty
- Fully manual enrollment
- Shows up in private students list and admin enrollment list

### Lessons outside enrollment date range

- Advisory only. Yellow warning in lesson view: "This lesson's date is outside the linked enrollment's period (Term 1: 2025-09-01 → 2025-12-20)."
- Does not block lesson creation
- Does not auto-unlink
- Admin can ignore, edit the lesson date, or change the linked enrollment

### Group lessons

- Single `enrollmentId` per lesson remains the model
- Auto-suggest only fires if all students in the group resolve to the same enrollment candidate (rare)
- Otherwise, lesson remains unlinked and admin decides later
- Proper per-student attribution inside a group lesson is deferred — not in 19.6D

### Student has two enrollments for same instrument at different schools

- Possible if the student takes lessons at two schools
- Rule: "one active per student + instrument" is scoped to the student's primary school context. We will allow this edge case by relaxing the rule to **one active per student + instrument + schoolId (nullable)**
- This means a student can have: (Piano @ School A, active) AND (Piano @ School B, active). But not two Piano enrollments at School A
- **Decision for 19.6D:** the validation key becomes `(studentId, instrument, schoolId || 'private')`. This gives flexibility without opening the door to duplicates at the same school

---

## 11. Safest Rollout Phases

### 19.6D1 — Assignment rules + enrollment validation

- **Code:** add `isCurrentEnrollment()` and `isHistoricalEnrollment()` helpers to `types.ts`
- **Code:** add write-time validation in `addEnrollment` / `updateEnrollment` enforcing "one active per `(studentId, instrument, schoolId||'private')`"
- **Code:** add `getCurrentEnrollmentsForStudent(studentId, enrollments, today)` helper
- **No UI changes, no data writes**
- **Safe because:** validation is additive. Existing enrollments that already duplicate would not be touched; the rule only applies to new writes. Include a guard to only enforce on newly-created conflicts, not on legacy state

### 19.6D2 — New student assignment flow

- **Code:** update `EnrollmentManagement.tsx` create/edit form to:
  - Add start/end date pickers
  - Add school period dropdown (populated from `schoolEnrollmentPeriods` state)
  - Selecting a period auto-fills dates + defaults (editable)
  - `isDateOverride` checkbox (computed automatically: true if dates differ from period)
  - Add `self` option to payer type dropdown
  - Payer-type-based form defaults as described in section 9
- **No auto-link, no migration**
- **Safe because:** admin drives every write; the form just makes the new fields accessible

### 19.6D3 — Current enrollment display

- **Code:** modify `AdminStudents.tsx`, `SchoolStudents.tsx`, `MyStudents.tsx` to show current enrollment summary per student
- **Code:** extend `StudentReportCore` with `renderEnrollmentHistory` prop (current section only in this phase)
- **Code:** show current active enrollment card(s) on all student detail views
- **No auto-link, no historical view yet**
- **Safe because:** read-only; if current enrollment is missing, shows "no active enrollment" — no data is invented

### 19.6D4 — Historical enrollment display + tabs

- **Code:** add Current / Historical tab to `EnrollmentManagement.tsx` (as described in section 3)
- **Code:** add historical enrollments section to `StudentReportCore`
- **Code:** add Current / Past toggle to `ParentEnrollments.tsx` and `StudentDashboard.tsx`
- **No auto-link**
- **Safe because:** purely read-side filtering. Historical vs current is computed from status + dates, no writes

### 19.6D5 — Review tool for unlinked lessons

- **Code:** new page `/admin/enrollment-review` (admin + school_admin)
- Lists students with unlinked lessons that fall within a current enrollment's date range
- Per-lesson or per-group review + link actions
- Every action logged (who, when, what linked)
- **No batch "link all"**
- **Safe because:** every link is explicit; small operations; fully reversible

### 19.6D6 — Historical summary enrollment tool

- **Code:** "Create historical summary" action on student detail page
- Preview screen → confirm → creates a single `status = completed` enrollment covering past lessons
- **No backfill of lesson `enrollmentId`** — summary is for display only
- **Safe because:** one write per invocation; preview + confirm; admin sees exactly what gets created

### 19.6D7 — Bulk enrollment creator from period

- **Code:** "Create enrollments from period" action in `SchoolPeriodManager.tsx`
- Lists all students at the school, checkbox selection, per-student overrides
- Preview screen → confirm → writes N enrollments with one-click undo on each
- **Safe because:** review-required pattern; admin sees every row before writing

### 19.6D8 — Documentation + testing

- Update `PHASE_STATUS.md`
- Add a testing checklist for enrollment flows
- Verify: new students in all 3 payer types, mid-term joiners, overlapping periods, transfers, validation errors

---

## 12. Risks and Failure Modes

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Silent misassignment during new lesson linking** | Low — suggestion only, never auto-writes | High if it happened | No auto-write anywhere; admin confirms every save |
| **"One active per student + instrument" validation rejects legitimate parallel programs** | Medium | Medium (annoying) | Scope the key to `(studentId, instrument, schoolId||'private')`; allow edge cases explicitly |
| **Migration stalls because admin doesn't create periods** | High (human factor) | Low (system still works with undated enrollments) | Make period creation the first visible step; add a banner: "X students have no current enrollment — review" |
| **Existing enrollments from Phase 17.2 block new validations** | Medium | Medium | Validation only fires on new writes, not on reads. Legacy duplicates are flagged in a "data cleanup" view but never auto-fixed |
| **Overlapping school periods confuse the auto-suggest** | Medium | Low | Multiple candidates → no preselect, admin picks |
| **Group lesson attribution problems** | Persistent | Low (workaround exists: one enrollment per group) | Documented limitation; deferred to a future phase |
| **Period date change cascades unexpectedly** | Low | Medium | Bulk update is opt-in with a confirm dialog showing affected enrollment count |
| **Historical summary enrollment is mistaken for a real enrollment** | Low | Low | Display with a clear "HISTORICAL SUMMARY" badge; `status = completed` from day one; excluded from current lists |
| **Lesson `enrollmentId` points to a deleted enrollment** | Low | Low | Existing delete confirms linked lesson count; also plan to allow enrollment delete to clear `enrollmentId` on linked lessons in a later cleanup phase |
| **Admin forgets to end a completed enrollment → "paused/active" but no new lessons** | Medium | Low | Dashboard widget: "X enrollments ended >30 days ago still marked active — complete them?" (advisory, not automatic) |
| **Parent/student visibility leaks historical enrollments with sensitive data (priceExpected, notes)** | Low | High if it happened | Existing 19.5 masking rules (parent/student strip notes, priceExpected for school-paid, etc.) extend automatically to historical enrollments — same listener, same masking |
| **Self-paid student without a linked `uid` gets an enrollment but can't see invoices** | Medium | Low | Form validation blocks `payerType = self` unless student has a `uid` |
| **Reports break because they started counting by `enrollmentId`** | Low | High | No existing report counts by `enrollmentId` (verified during Phase 17–19 work). New reports that do will be introduced with fallback to unlinked lesson counts |

### Failure mode philosophy

If any 19.6D sub-phase causes unexpected issues, the system falls back to its pre-19.6 behavior automatically because:
- `enrollmentId` was already optional on Lesson
- `startDate` / `endDate` / `schoolPeriodId` are all optional on Enrollment
- Undated enrollments are treated as "always current if active"
- Historical display gracefully handles missing data

There is no state where disabling 19.6D causes data loss. The worst case is losing the new UI affordances until they're re-enabled.

---

## Summary — What 19.6D buys us

| Capability | Before | After |
|-----------|--------|-------|
| Know which enrollment is "current" for a student | Guess from recent activity | Explicit record + `isCurrent()` helper |
| One active enrollment per student + instrument | Not enforced | Validated at write time |
| Enrollment period dates | Not stored | Stored, optionally linked to school period |
| Payer types | parent / school | parent / school / self |
| Current vs historical view | No distinction | Tabbed, rule-based |
| New lesson linking | Manual dropdown | Suggested + admin confirms |
| Historical lesson linking | Manual dropdown | Review tool (per-group) |
| Bulk enrollment creation | Not supported | Review-required bulk creator from period |
| Migration path | N/A | Incremental, per-student, fully reversible |

---

## STOP

**⏸️ Plan complete. Awaiting approval. No code to be written until the plan is approved.**
