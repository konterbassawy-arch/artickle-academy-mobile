# Phase 19.6D5 — Enrollment Review & Unlinked Lesson Tool (Planning)

**Status:** PLANNING — awaiting approval
**Date:** 2026-04-15
**Depends on:** 19.6A (model), 19.6B (data layer), 19.6C (period UI), 19.6D1 (helpers + validation), 19.6D2 (create UI), 19.6D3+D4 (display)
**Does not:** implement code, run migrations, auto-link lessons, modify lesson facts, modify financial logic

---

## 0. Guiding principles (locked)

1. **Nothing is auto-linked.** Suggestion generation is the only automatic behavior. Writes require explicit admin action.
2. **Every write is visible.** Admin sees exactly which lessons, which enrollment, which effect — before any Firestore write happens.
3. **Every write is reviewable.** Preview step → confirm dialog → explicit click.
4. **Every write is reversible.** Linking is a single-field mutation (`lesson.enrollmentId`) that can be undone by the same tool.
5. **Lesson facts are never touched.** Date, status, teacher, students, duration, notes, comments, financials — all read-only in this tool.
6. **Enrollment totals are never touched.** `totalLessons`, `priceExpected`, and lifecycle `status` are read-only here.
7. **Suggestions are advisory, not authoritative.** The tool never implies certainty it doesn't have.

These seven principles drive every design decision below. If a proposal violates one of them, it's wrong.

---

## 1. Definition of "unlinked lesson"

### Primary definition

```ts
lesson.enrollmentId == null   // undefined OR null
```

A lesson is **unlinked** when it has no `enrollmentId`. This is the only condition that ever drives an auto-surface in the review list.

### Secondary classifications (surfaced as advisory, not as "unlinked")

The tool also identifies two additional conditions and labels them clearly — these are **not** "unlinked", they are **linked but suspicious**:

| Condition | Label | Review behavior |
|-----------|-------|-----------------|
| `lesson.enrollmentId` set, but the target enrollment no longer exists in Firestore | **Orphaned link** | Show in a dedicated "Orphaned" tab. Safe to unlink manually; never auto-unlinked. |
| `lesson.enrollmentId` set, lesson date falls outside the enrollment's `startDate`/`endDate` | **Date out of range** | Show in an "Out of range" tab with a yellow warning. Advisory only — admin decides whether to re-link, edit lesson date, or accept the mismatch. |
| `lesson.enrollmentId` set, but `lesson.instrument` (or teacher) differs from the linked enrollment | **Mismatch** | Same pattern as Out of range — advisory tab, admin decides. |

**Hard rule:** secondary classifications are **never** auto-fixed. They appear in their own review tabs and require manual action.

### Out of scope for "unlinked"

- Lessons with `status = Cancelled` that have no `enrollmentId` — cancelled lessons don't consume enrollment slots, so linking them is cosmetic. They are **hidden by default** in the Unlinked tab with an optional "Include cancelled" toggle.
- Lessons from before the earliest existing enrollment's `startDate` for that student — still shown, but sorted to the bottom with a "before first enrollment" note.

---

## 2. Scope, access, route

### Route

```
/admin/enrollment-review
```

New page, nested under admin portal. Lazy-loaded from `App.tsx`.

### Access

| Role | Access | Scope |
|------|--------|-------|
| `admin` | ✅ Full | All schools, all students, all lessons |
| `school_admin` | ✅ Full (Phase 19.6D5C) | Only lessons where `lesson.schoolId === currentUser.schoolId` AND unlinked within that scope |
| `teacher` | ❌ No | Teachers don't get write access to enrollment linking; their lessons are visible via the admin/school_admin tool |
| `parent` | ❌ No | Billing-sensitive, out of scope |
| `student` | ❌ No | Same |

Phase 19.6D5A ships admin-only. `school_admin` access is enabled in a later sub-phase (19.6D5E) because the scoping rules for "unlinked lesson visible to school admin" need tighter validation — see risks §12.

Sidebar nav entry (admin only, Phase 19.6D5A+):
```
Operations
  ├── Bookings
  ├── Enrollments
  ├── Enrollment Review   ← NEW
  └── Schedule
```

### Why it does NOT live inside `EnrollmentManagement.tsx`

- EnrollmentManagement is about the enrollment record (CRUD + financial state). It is already dense.
- The review tool is **lesson-centric** — it scans lessons looking for linkable candidates. Different mental model.
- A dedicated page gives us room for filters, preview, confirmation screens, and a dismissal/undo stack without crowding the existing enrollment list.

---

## 3. UI structure

### 3.A Page header

- Title: "Enrollment Review"
- Subtitle: `"{N} unlinked lessons · {M} orphaned · {K} date-mismatched"` (three counts, computed client-side from `lessons` + `enrollments`)
- Small banner: "Nothing on this page is written automatically. Every action requires confirmation."

### 3.B Tab bar

Four tabs, left to right:

| Tab | Source | Default |
|-----|--------|---------|
| **Unlinked** | lessons with `enrollmentId == null` | ✅ default |
| **Orphaned** | lessons where `lesson.enrollmentId` doesn't resolve to any enrollment in state | |
| **Out of range** | lessons linked to an enrollment whose period doesn't cover the lesson date | |
| **Mismatch** | lessons linked to an enrollment with instrument/teacher disagreement | |

Counts per tab shown in small pills next to each label. Active tab highlighted.

### 3.C Filters row (above table)

All filters are AND-combined and update the table via `useMemo`:

| Filter | Control | Default |
|--------|---------|---------|
| School | Dropdown of all schools + "All" + "Private (no school)" | All |
| Teacher | Dropdown of teachers (optionally filtered by selected school) | All |
| Student | Search input, matches student name substring | empty |
| Instrument | Dropdown (unique instrument values present in filtered lessons) | All |
| Date from | Date picker | empty |
| Date to | Date picker | empty |
| Status | Multi-select (Present, Taught, Absent-Unexcused, Absent-Excused, Cancelled) | Present+Taught+Absent-Unexcused |
| Show cancelled | Toggle | off |
| "Has suggestion" | Toggle: only show rows that have ≥1 suggested enrollment | off |

Filters are persisted in URL query params so an admin can share a filtered view. Result count shown on the right: `"{filtered} of {total} unlinked lessons"`.

### 3.D Group-by control

Above the table, a radio: `Lesson` | `Student` | `Student + Instrument`.

- **Lesson** (default) — flat list, one row per lesson
- **Student** — collapsed groups, header row per student with count and aggregate actions (bulk-link all lessons under this student)
- **Student + Instrument** — tighter grouping, header row per (student, instrument) pair — this is the **ideal grouping for bulk linking** because suggestions will be identical within a group

### 3.E Main table

Flat mode columns:

| Col | Width | Content |
|-----|-------|---------|
| ☐ | 32px | Row checkbox (selection for batch) |
| Date | auto | `dd/mm/yyyy` |
| Student | auto | Name (+ parent badge if present) |
| Teacher | auto | Teacher name |
| Instrument | auto | Instrument |
| Status | auto | Colored pill |
| Duration | 60px right | `{n}min` |
| Current `enrollmentId` | auto | `—` if null; otherwise short monospace id + warning pill if orphaned/out-of-range/mismatch |
| Suggested | auto | Suggestion chip (see §4) |
| Actions | auto | `Link` button (enabled if ≥1 suggestion), `Choose…` dropdown, `Dismiss` button |

Grouped mode: a group header row sits above each group showing the group name, total lessons in group, and the group-level action (`Link all to…`) — disabled unless the group has a single unambiguous suggestion shared across every lesson in it.

### 3.F Row expansion

Clicking a row expands it in-place to show:
- Full lesson context: notes preview, comments, studentIds (for group lessons), enrollmentId (full), duration, delivery mode
- All suggestion candidates (not just the top one), ranked
- "View lesson in lesson log" link (opens `ViewLessonModal`, read-only)

### 3.G Bottom action bar (sticky)

Appears when ≥1 row is selected:

```
{N} lessons selected  |  [Review suggested links]  [Link all to…]  [Dismiss]  [Clear selection]
```

- **Review suggested links** — opens the preview modal in "apply suggestions" mode
- **Link all to…** — opens an enrollment picker; admin picks one enrollment, opens the preview modal in "force link" mode
- **Dismiss** — opens the dismissal modal (see §6)
- **Clear selection** — unchecks all

---

## 4. Suggestion logic

### 4.A Candidate generation

For an unlinked lesson `L`, a candidate enrollment `E` is eligible if **all primary criteria match**:

| Criterion | Rule |
|-----------|------|
| Student match | `L.studentIds.includes(E.studentId)` — for group lessons, `E.studentId` must be one of the lesson's students |
| Instrument match | `L.instrument === E.instrument` (case-insensitive, trimmed) |
| Date window | `L.date` within `[E.startDate, E.endDate]` if both are set; if either is missing, this check is a **soft** condition (see scoring below) |
| Not already full | `getEnrollmentRemaining(E, lessons).remaining > 0` — full enrollments are excluded unless the admin toggles "Show full enrollments" (see §4.D) |
| Active-ish | `E.status ∈ {active, paused, completed}` — `cancelled` is always excluded |

Any enrollment failing any primary criterion is **not** a candidate.

### 4.B Ranking (scoring)

Each candidate gets a score. Higher = better. Ties broken by `E.updatedAt` desc.

| Factor | Points |
|--------|--------|
| Teacher match (`L.teacherId === E.teacherId`) | +40 |
| Teacher assigned on enrollment but differs from lesson | −10 |
| Teacher unassigned on enrollment | 0 |
| Delivery mode match (`L.deliveryMode === E.deliveryMode`) | +10 |
| School match (`L.schoolId === E.schoolId`, both nullable) | +15 |
| Date inside `[startDate, endDate]` (both set) | +25 |
| Date inside only one of start/end (the other undefined) | +10 |
| Both dates undefined on enrollment (undated) | +5 |
| `isCurrentEnrollment(E, today)` | +10 (prefer current over completed) |
| Lesson duration matches enrollment duration | +5 |

A candidate with score < 40 is labeled **weak** and the UI shows "?" on its chip. Admin can still click it but the tool prompts for extra confirmation.

### 4.C Suggestion states per row

| # candidates | Row chip | Default action |
|--------------|----------|----------------|
| 0 | "No match" (gray) | `Choose…` only |
| 1 strong (score ≥ 40) | Green pill: `→ {E.instrument} {E.term or academicYear}` | `Link` enabled, points to this enrollment |
| 1 weak (score < 40) | Amber pill: `? {E.instrument} {E.term}` | `Link` enabled but highlighted; preview modal forces a second confirm |
| 2+ | Amber pill: `{N} matches — choose` | `Link` disabled; `Choose…` required |

### 4.D Transparency

Every suggestion must be inspectable:
- Clicking the chip opens a tooltip listing the scoring breakdown ("teacher match +40, date in range +25, school match +15, …")
- Admin always sees **why** a suggestion was made, never just "trust me"

Bottom toolbar includes a toggle: **"Show full enrollments"** — off by default. When on, candidates at `remaining === 0` are included with a red dot on the chip and the preview modal forces extra confirmation ("This enrollment is already at capacity. Linking will push consumed over total.").

### 4.E What suggestions never do

- Suggestions never auto-apply
- Suggestions never change when the page reloads (they're pure functions of current Firestore state)
- Suggestions never fall back to "close enough" matches — no fuzzy student name matching, no date-slop-tolerance, no "best guess"
- The tool never invents data

---

## 5. Manual linking actions

### 5.A Per-lesson (single-row) actions

Three primary actions per row:

1. **Link** (green button)
   - Disabled if no strong suggestion exists for this row
   - On click: opens a **single-lesson preview modal** showing:
     - Lesson snapshot: date, student, teacher, instrument, status, duration
     - Target enrollment snapshot: instrument, period dates, teacher, consumed/total/remaining (before and after), status
     - Score breakdown
     - Two buttons: `Cancel` | `Confirm Link`
   - On Confirm: writes `lesson.enrollmentId = E.id` via `updateDoc`, no other fields touched. Success toast + row fades from list. Toast has `Undo` for 10 seconds (see §7.C).

2. **Choose…** (gray button)
   - Always enabled
   - On click: opens an **enrollment picker** pre-filtered to this student's enrollments (regardless of whether they're candidates — admin might deliberately pick a historical one)
   - Picker shows: instrument, term, dates, teacher, status, consumed/total for each enrollment
   - Picker has a search box
   - Admin picks one → opens preview modal (same as Link path) in "manual pick" mode with a note: "You manually picked this enrollment. The suggestion system did not recommend it." Extra confirmation required.

3. **Dismiss** (gray outline button)
   - Marks the lesson as "reviewed, leaving unlinked"
   - Stored in a new client-side only state (Phase 19.6D5A) or in a new Firestore subcollection (Phase 19.6D5C, opt-in)
   - Does NOT modify the lesson in Firestore
   - Row disappears from the Unlinked tab, reappears if admin clicks "Show dismissed" toggle
   - Primary purpose: reduce visual clutter; admin acknowledges this lesson should stay unlinked

### 5.B Per-group actions (when grouped by student + instrument)

A group header gains two buttons:

1. **Link all to suggested** — enabled only if every lesson in the group has the **same** top suggestion with score ≥ 40. Opens a batch preview modal (see §5.C).
2. **Link all to…** — always enabled; opens the enrollment picker; admin picks one; opens batch preview modal.

### 5.C Batch preview modal (for batch actions)

Shared modal used for every bulk action. Structure:

```
┌─────────────────────────────────────────┐
│ Review batch link                     ✕ │
├─────────────────────────────────────────┤
│ You are about to link X lessons to      │
│ enrollment: <instrument, term, teacher> │
│                                         │
│ Before:  consumed {a} / total {b}       │
│ After:   consumed {a+X} / total {b}     │
│ Over capacity? ⚠️ yes / ok              │
│                                         │
│ Lessons to be linked:                   │
│ ┌───────────────────────────────────┐   │
│ │ ✓ 2026-01-14  Ali Demir   Present│   │
│ │ ✓ 2026-01-21  Ali Demir   Taught │   │
│ │ ⚠ 2026-02-04  Ali Demir   Out of │   │
│ │   range — outside enrollment     │   │
│ │   period                          │   │
│ │ ...                                │   │
│ └───────────────────────────────────┘   │
│                                         │
│ [ ] I confirm these links are correct   │
│                                         │
│ [Cancel]              [Confirm link X]  │
└─────────────────────────────────────────┘
```

- Row checkmarks let the admin uncheck individual lessons to exclude them from the batch before confirming
- Warnings (out of range, cancelled, different school) are inline per row
- The confirm checkbox is required before the Confirm button activates
- Confirm button text reflects the current checked count: "Confirm link 3" / "Confirm link 14"

### 5.D Undo

Every successful action (single or batch) shows a toast with an `Undo` button. Clicking undo reverses the write(s) via a targeted `updateDoc` call that sets `enrollmentId = null` (or the previous value, if overwriting).

- Toast remains for 10 seconds
- Admin can also access the last 20 actions via a "Recent actions" side panel (read-only audit log, cleared on page refresh in Phase 19.6D5A, persisted to Firestore in Phase 19.6D5F)

---

## 6. Batch actions (controlled)

### Allowed batch operations

| Operation | Trigger | Preview | Confirmation |
|-----------|---------|---------|--------------|
| Link selected rows to their individual top suggestions | Bottom toolbar "Review suggested links" | Table of lesson → enrollment pairs with per-row warnings | Required: typed confirm OR checkbox |
| Link selected rows to one chosen enrollment | Bottom toolbar "Link all to…" | Enrollment picker → preview modal | Required |
| Link all lessons in a grouped (student+instrument) bucket | Group header button | Batch preview modal | Required |
| Dismiss selected rows as "leave unlinked" | Bottom toolbar "Dismiss" | Small confirm modal: "Dismiss N lessons? They'll be hidden from the Unlinked tab." | Required |

### Disallowed

- ❌ "Link everything I can" one-click action
- ❌ Any link operation without a preview
- ❌ Any link operation triggered by an `onSnapshot` listener
- ❌ Any link operation triggered on page load
- ❌ Any background job
- ❌ Any Firestore write that affects fields other than `lesson.enrollmentId`
- ❌ Any operation that touches `lesson.status`, `lesson.date`, `lesson.notes`, enrollment `totalLessons`, enrollment `priceExpected`

### Batch size caps

- Per preview modal: **max 200 lessons** — above this, admin must narrow filters first. Prevents accidental huge batches and keeps the preview readable.
- Per Firestore commit: writes are chunked into `writeBatch` calls of **100** (Firestore's hard limit is 500; we stay conservative).
- If a batch partially fails, successful writes stay applied and the UI shows which rows failed so admin can retry.

---

## 7. Conflict handling

### 7.A Conflicts at link time

When the admin confirms a link, re-check these conditions in the client **just before** writing (last chance to abort):

| Condition | Action |
|-----------|--------|
| Lesson already has `enrollmentId` and `enrollmentId !== target` | Block silently by default. Show warning: "This lesson was already linked to a different enrollment ({old id}). Re-link?" with a force button. |
| Lesson already has `enrollmentId === target` | Skip (no-op). Count it as "already linked" in the result summary. |
| Target enrollment's `instrument !== lesson.instrument` | Hard block in the single-link path. In batch mode, row is flagged and must be unchecked before confirming. |
| Target enrollment's date window doesn't cover `lesson.date` | Soft warn. Admin can still confirm. Creates an "out of range" state for this lesson. |
| Target enrollment is `status = cancelled` | Hard block. Cancelled enrollments cannot receive links. |
| Target enrollment would exceed `totalLessons` after this link | Soft warn. Shows the over-capacity warning. Admin can still confirm — `getEnrollmentRemaining` would return 0 remaining and `consumed > total`. **This never auto-increments `totalLessons`.** |
| Target enrollment does not exist anymore (stale state) | Hard block. Tell admin the enrollment was deleted; abort write. |
| Lesson doesn't exist anymore (stale state) | Hard block. Skip row. |

### 7.B Conflict handling in the Out-of-range tab

The Out-of-range tab shows lessons that are linked but the dates don't match. Three actions per row:

1. **Re-link** — opens the enrollment picker to pick a better-fitting enrollment
2. **Unlink** — clears `enrollmentId` (single-field mutation, reversible)
3. **Accept** — admin acknowledges the mismatch; row is dismissed from the tab (via the same dismissal mechanism as §5.A)

Unlinking is a **valid manual action** — sometimes the only correct fix. It is always explicit.

### 7.C Undo is a first-class operation

For any link or unlink action, the Recent Actions panel shows the inverse. Undo is a targeted Firestore write that flips `enrollmentId` back. Undo itself cannot be undone — it just writes the inverse.

---

## 8. Safety model

### Automatic (no admin intervention)

- ✅ Candidate generation
- ✅ Scoring
- ✅ Filter + group computations
- ✅ Counts displayed in tab pills
- ✅ Stale-state detection (spotting deleted enrollments/lessons)

That is the **complete list**. Nothing else happens without explicit admin action.

### Manual (click-only)

- ✅ Per-row Link
- ✅ Per-row Choose…
- ✅ Per-row Dismiss
- ✅ Per-row Unlink (Out-of-range tab only)
- ✅ Any Firestore write

### Confirmation-gated (preview + confirm)

- ✅ Every batch action
- ✅ Single-row link with a weak suggestion (score < 40)
- ✅ Single-row link into an at-capacity enrollment
- ✅ Single-row link that creates an out-of-range condition

### Hard-blocked (never allowed)

- ❌ Linking into a cancelled enrollment
- ❌ Linking with instrument mismatch (batch can override after unchecking; single-link path blocks)
- ❌ Any modification of lesson fields other than `enrollmentId`
- ❌ Any modification of enrollment fields
- ❌ Any write triggered on mount, on listener event, or on filter change

---

## 9. Data write behavior

### 9.A What gets written

Exactly one field, per lesson, per action:

```ts
await updateDoc(doc(db, 'lessons', lessonId), {
  enrollmentId: targetEnrollmentId, // or null for unlink
  updatedAt: Date.now(),
});
```

No other Firestore collection is touched. The `updatedAt` bump on the lesson is a concession to existing conventions in the rest of AppContext — it keeps the lesson's modification timestamp honest but changes no user-facing fact.

### 9.B What is explicitly NOT written

- ❌ `lesson.status`
- ❌ `lesson.date`
- ❌ `lesson.studentIds`
- ❌ `lesson.teacherId`
- ❌ `lesson.instrument`
- ❌ `lesson.notes`, `lesson.schoolAdminComment`, `lesson.schoolAdminInternalComment`
- ❌ `lesson.durationMinutes`
- ❌ `lesson.deliveryMode`
- ❌ Any enrollment fields (`totalLessons`, `priceExpected`, `status`, `startDate`, `endDate`, etc.)
- ❌ Any payment, invoice, or payroll fields

### 9.C Batch writes

Uses Firestore `writeBatch` (up to 100 ops per batch). Batches are chunked. The tool calls `batch.update(...)` once per lesson, then `batch.commit()`. If commit fails, the tool reports the failure and leaves the row in the list.

### 9.D Audit log (phased — see §11)

**Phase 19.6D5A–D:** in-memory audit log only. Lives in component state. Cleared on page unload. Good enough for undo during the session.

**Phase 19.6D5F (optional future):** persistent audit log in a new Firestore collection:

```
/enrollmentReviewActions/{id}
  - actor (uid)
  - timestamp
  - action: 'link' | 'unlink' | 'dismiss'
  - lessonId
  - before: { enrollmentId: string | null }
  - after: { enrollmentId: string | null }
```

Written atomically alongside the lesson update via `writeBatch`. Future "Recent activity" admin view.

### 9.E AppContext integration

The tool reuses existing `lessons` and `enrollments` state from AppContext. No new state in AppContext for Phase 19.6D5A. The update operation calls a new exported function:

```ts
// In AppContext.tsx
updateLessonEnrollmentLink: (lessonId: string, enrollmentId: string | null) => Promise<{ success: boolean; message?: string }>
```

This function:
- Fetches the lesson from state
- Validates the target enrollment exists (if not null)
- Calls `updateDoc` with `{ enrollmentId, updatedAt: Date.now() }`
- Returns success/failure

This is the **only** new AppContext function. It is role-gated: `admin` only (school_admin gets the same function but scoped later).

---

## 10. Interaction with current system

### 10.A Student detail pages

No structural change. When a lesson gets linked, `getEnrollmentRemaining()` immediately reflects the new count because it's a pure function of current state. The `EnrollmentDetailSection` component (from 19.6D3+D4) re-renders automatically via `onSnapshot`.

### 10.B Enrollment progress calculation

Unchanged. `getEnrollmentRemaining(enrollment, lessons)` is the single source of truth. Linking a lesson causes `consumed` to increment on the next render. The tool itself does **not** write to enrollment.totalLessons or any other enrollment field.

### 10.C Existing `EnrollmentManagement.tsx` (admin page)

Gets a small addition: a pill next to each enrollment's remaining count:

```
"7 / 12 lessons — 2 unlinked in period"
```

Clicking the pill links to the review tool pre-filtered to that student+instrument+period. Read-only signal that helps admin spot enrollments that are missing data.

### 10.D Existing `Attendance.tsx` / `LessonLog.tsx`

Unchanged. New lessons continue to go through the existing creation flow (which has its own enrollment linking UX). The review tool is for **already-created** lessons that weren't linked at creation time.

### 10.E Financial side (invoices, payroll, rate engine)

**Zero interaction.** No invoice is regenerated. No payroll is recomputed. No rate is resolved. Linking a lesson only affects which enrollment it is displayed under — every financial helper already handles the "lesson has an enrollmentId or not" case.

If a future phase wants invoice/payroll to factor in enrollment linkage, that's a separate phase. 19.6D5 touches none of it.

### 10.F Parent/student visibility

The tool is admin-only. Parents and students see their own data via their existing pages. Linking a lesson may cause it to appear under a different enrollment card on the parent/student side, but the lesson itself (date, status, notes) stays identical.

### 10.G Exports

Existing Excel/PDF exports read lesson fields directly. They are unaffected. If an export already groups by enrollment, newly-linked lessons will appear under their new enrollment next time the export runs — no special handling needed.

---

## 11. Phased rollout

Broken into six small sub-phases. Each lands independently. Each is safe to skip or roll back.

### 19.6D5A — Read-only review page (no writes)

**Scope:** new page at `/admin/enrollment-review`, sidebar nav, tab bar, filters, flat table, per-row expansion, suggestion chips and scoring, grouped views.

**Writes:** zero. Every button is either a navigation or opens a modal with a warning "This page is read-only in Phase 19.6D5A. Writing will be enabled in a later phase."

**Safe because:** no mutations possible. Purely a diagnostic tool. Lets admin see what exists, validate the suggestions make sense, report weirdness, and live with the tool for a week before any data changes.

### 19.6D5B — Single-lesson linking + unlinking + dismissal

**Scope:** enables the per-row Link / Choose… / Dismiss / Unlink actions. Single-lesson preview modal. In-memory undo with 10-second toast.

**Writes:** single-field `enrollmentId` updates to individual lessons. No batch. No audit persistence.

**Safe because:** one lesson at a time, every write confirmed in a modal, instant undo.

### 19.6D5C — Batch linking with confirmation

**Scope:** enables selection checkboxes, bottom toolbar, group-level Link buttons, batch preview modal. Max 200 rows per preview, 100 per commit chunk.

**Writes:** `writeBatch` updates with per-row validation. Still only touches `enrollmentId`.

**Safe because:** preview gates every batch; admin can uncheck rows mid-preview; undo available per batch.

### 19.6D5D — Suggestion refinement + transparency UI

**Scope:** scoring tooltips, "Show full enrollments" toggle, weak-match highlighting, "Has suggestion" filter, group-level "all identical suggestions" detection. Small improvements based on admin feedback from D5A–D5C.

**Writes:** none new.

**Safe because:** pure UX polish.

### 19.6D5E — School admin access (scoped)

**Scope:** enables `/school/enrollment-review` for `school_admin`. Review and linking limited to lessons where `lesson.schoolId === currentUser.schoolId` AND target enrollment's `schoolId === currentUser.schoolId`. Cannot cross schools. Cannot see private student lessons.

**Writes:** same as 19.6D5B–C, scoped by role.

**Safe because:** scoping is enforced in the `updateLessonEnrollmentLink` function and defence-in-depth at the page level. Tested with a school_admin account that has no access to cross-school lessons.

### 19.6D5F — Persistent audit log (optional future)

**Scope:** write each action to `/enrollmentReviewActions/`. Add a read-only "Recent activity" admin view showing the last 100 actions with actor, timestamp, and before/after. Enables cross-session undo.

**Writes:** one new audit doc per lesson linking/unlinking action, written in the same `writeBatch` as the lesson update.

**Safe because:** audit log is append-only, no existing data is modified by its introduction.

---

## 12. Edge cases (explicit)

### 12.A Group lessons

Group lesson = `lesson.studentIds.length > 1`. Current model: one `enrollmentId` per lesson for all students in the group. This is a pre-existing limitation (documented in 19.6 master plan §7).

**Review tool behavior:**
- Group lessons appear in the Unlinked tab with a "Group" badge showing the number of students
- Suggestion logic: the tool computes candidates for **each student in the group** and only suggests an enrollment if **every student** has that same enrollment as a top candidate. Otherwise, no suggestion is shown and the admin must Choose… manually
- Single `enrollmentId` per lesson is preserved — the tool does not attempt to split group lessons
- When grouped by student, a group lesson can appear under multiple student groups (appears per-student), but linking it from any group writes the same single `enrollmentId`

### 12.B Teacher changes mid-term

Lesson has a teacher different from its linked enrollment's teacher.
- Not unlinked per se — falls into the "Mismatch" tab if a link exists
- If unlinked and the suggestion scoring sees different teachers, the candidate loses 10 points but can still be the top match
- Admin can always Choose… a different enrollment to correctly re-attribute

### 12.C Instrument changes

Student switches instruments mid-term. Old enrollment should have been completed; new one created.
- Old lessons (violin): candidates for the violin enrollment
- New lessons (cello): candidates for the cello enrollment
- The tool treats them independently — different instrument → different enrollment candidates. No cross-instrument suggestion.

### 12.D Lessons outside any enrollment period

Lesson exists but no enrollment covers its date.
- Appears in Unlinked tab
- Suggestion: zero candidates (because date-window is a primary criterion) OR a weak candidate if the nearest enrollment has undated windows
- Admin can still Choose… manually
- **Recommended action:** Dismiss, or create a new enrollment that covers the lesson dates (out-of-tool action), then return and link it

### 12.E Student transfers between schools

Student moves from School A → School B. Old School A lessons should link to old School A enrollments; new School B lessons to new School B enrollments.
- Student filter and school filter together let admin work School A first, then School B
- Suggestion scoring gives +15 for school match, so cross-school links are discouraged but not blocked
- Admin can Choose… a cross-school enrollment if the workflow requires it

### 12.F Multiple active enrollments edge case

The 19.6D validation key is `(studentId, instrument, schoolId||'private')`. So a student can legitimately have two simultaneous active enrollments if they're at different schools.

- Suggestion logic: both enrollments are candidates; scoring via school match usually disambiguates
- If a lesson has no `schoolId` but both enrollments have school IDs, both candidates appear — admin Choose… required
- The tool never enforces the validation key at link time — it respects whatever the enrollments say. The validation is the business rule in addEnrollment/updateEnrollment; the review tool's job is just to link.

### 12.G Lessons from before enrollment system existed

Pre-Phase-17.2 lessons: `enrollmentId` is undefined by default. These are the bulk of the Unlinked tab on first use.
- Treated identically to any other unlinked lesson
- Suggestion logic depends on whether an enrollment exists that matches their (student, instrument, date)
- If no enrollment has been created for that period yet, zero candidates — admin creates the enrollment first (in EnrollmentManagement), then returns to review

### 12.H Lesson with `status = Cancelled` and no enrollmentId

- Cancelled lessons don't consume enrollment slots, so linking them is cosmetic
- Hidden by default in the Unlinked tab via the "Show cancelled" toggle
- If shown, they rank below uncancelled lessons in sort order
- If linked, no harm — `getEnrollmentRemaining` excludes cancelled statuses from consumption

### 12.I Enrollment deleted while review tool is open

- Listener updates remove the enrollment from state
- Tool detects stale reference on next render
- Row shows an "enrollment no longer exists" warning
- Link action is hard-blocked if the target disappeared between preview and confirm

### 12.J Lesson deleted while review tool is open

- Listener removes the lesson
- Row disappears from the list
- No action needed

### 12.K Very old lessons (years ago) with teachers/schools that no longer exist

- Lesson references a `teacherId` or `schoolId` that is no longer in state
- Suggestion scoring treats the reference as "no teacher set" (+0) or "no school set" (+0)
- Not a blocker; admin can Choose… an active enrollment if one covers the time range

### 12.L Self-paid student (payerType = self) with no linked uid

- Enrollment validation for new enrollments already requires `uid` on the student for self-pay (from 19.6D plan §9)
- Existing self-pay enrollments lacking uid just won't appear as candidates for future linking? No — they do appear, because the review tool treats `self` enrollments the same way. The missing-uid issue is only enforced at enrollment creation time, not at link time
- Admin can link lessons to a self-pay enrollment regardless of uid status

### 12.M Two admins using the review tool simultaneously

- Both see the same Firestore state via listeners
- If admin A links a lesson that admin B had in their current filter, admin B's row update reflects the new `enrollmentId` and the row moves out of the Unlinked tab (or into Out of range if the link is suspect)
- No locking required — single-field writes are last-writer-wins, and the fact being written is safe to overwrite
- If A and B simultaneously link the same lesson to different enrollments, whichever write lands last wins. Both admins see the final state. If that's wrong, either can unlink/relink.

### 12.N An enrollment's dates change after lessons are linked to it

- Tool handles this via the Out-of-range tab: lessons newly outside the enrollment's period appear there for review
- Linking is not reversed automatically
- Admin can unlink from the Out-of-range tab or accept the mismatch

### 12.O Student has 500+ unlinked lessons

- Group-by (student + instrument) keeps the view manageable
- Batch cap of 200 rows per preview forces the admin to narrow filters
- Filter by date range lets admin work term-by-term
- No performance issues expected — `useMemo` on ~10k lesson state is comfortable

### 12.P Orphaned `enrollmentId` (lesson points to a deleted enrollment)

- Appears in the Orphaned tab
- Actions: Unlink, or re-link via Choose…
- Orphaned tab is the only path the tool ever touches `enrollmentId` for a lesson that already had one

### 12.Q Lesson's linked enrollment has instrument "Piano" but lesson is "Violin"

- Appears in the Mismatch tab
- Actions: Unlink, Choose…, or Accept
- Admin decides — sometimes this is a data entry error in the lesson, sometimes in the enrollment

### 12.R Admin accidentally confirms a wrong bulk link

- Undo toast is available for 10 seconds after the batch commit
- Recent Actions panel (in-memory) lets admin undo up to ~20 recent actions during the session
- After refresh (in Phase 19.6D5A–E), undo is lost — the only way to "undo" is to manually unlink from the Out-of-range tab or via the review tool again
- In Phase 19.6D5F, the persistent audit log enables cross-session undo

---

## 13. Risks and failure modes

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Admin links a lesson to the wrong enrollment** | Medium | Medium (affects remaining count, display) | Preview modal for every link; undo available; single-field mutation is reversible |
| **Batch link has a silent partial failure** | Low | Medium | `writeBatch` errors are surfaced; failed rows stay in the list; admin can retry |
| **Suggestion logic produces a bad recommendation that gets trusted** | Medium (early on) | Medium | Scoring breakdown visible in tooltip; weak matches flagged amber; admin always sees "why" |
| **Admin over-capacity-links and confuses `getEnrollmentRemaining`** | Low (requires explicit confirmation) | Low (display oddity) | `remaining = max(0, …)` prevents negatives; over-capacity state is visible in the UI |
| **Tool masks a deeper data quality issue** ("everyone has unlinked lessons, just auto-link them") | Medium | High | No auto-link ever; admin must work through each case; friction is the point |
| **Admin dismisses lessons they shouldn't** | Medium | Low | Dismissal is a visibility-only operation; nothing is deleted; "Show dismissed" toggle restores them |
| **Suggestions slow the page down** (recomputing on every filter change) | Low | Low | `useMemo` with stable keys; scoring runs once per lesson per state update; ~10k lessons is fine |
| **School admin (Phase D5E) sees lessons from another school** | Low | High | `updateLessonEnrollmentLink` server-side-style role check in AppContext; UI filters pre-scope; defence in depth |
| **Race condition: two admins link the same lesson to different enrollments** | Low | Low | Firestore last-writer-wins is safe because the field being written is a pointer, not a counter |
| **Review tool becomes a dumping ground** ("I'll fix it later") | Medium | Low | Page shows total counts; dashboard widget flags > N unlinked lessons as a reminder (future) |
| **Admin accidentally unlinks a correctly-linked lesson** | Low | Low | Unlink is only exposed in the Out-of-range / Orphaned / Mismatch tabs, not for correctly-linked lessons; undo available |
| **Tool writes `updatedAt` which triggers downstream side effects** | Low | Low | Existing code already writes `updatedAt` on every lesson update; no downstream side effects exist today |
| **Suggestion scoring changes between sessions and confuses admin** | Low | Low | Scoring is deterministic and documented; changes to the algorithm are versioned in comments |
| **Dismissal list grows unbounded (in-memory)** | Low | Low | In-memory state resets on refresh; persistent storage (future) uses a bounded collection |
| **Admin expects the tool to fix enrollment date windows** | Medium | Low | Tool does not touch enrollment fields; out-of-range state explicitly surfaced; admin edits the enrollment in the existing page |
| **Page load performance with 50k lessons + 2k enrollments** | Low (current dataset is far smaller) | Medium | Scoring is O(lessons × enrollments) in the worst case but filterable; pagination only if needed |

### Failure-mode philosophy (inherited from 19.6D)

The review tool follows the same fall-back-to-nothing principle as the rest of 19.6. Every behavior it adds is additive:
- If the tool has a bug, admin can close the tab. Nothing is written without confirmation.
- If the tool writes a wrong link, it's a single-field revert. No lesson data is destroyed.
- If the tool is removed entirely, the system returns to "lessons have enrollmentId or not, same as before."
- No field becomes required, no schema changes, no migration.

---

## 14. What this phase explicitly does NOT do

To keep the scope locked:

- ❌ Does not run any migration script
- ❌ Does not write to any collection other than `/lessons` (and in Phase 19.6D5F, `/enrollmentReviewActions`)
- ❌ Does not touch `enrollment.totalLessons`, `enrollment.priceExpected`, or any financial field
- ❌ Does not touch `lesson.status`, `lesson.date`, `lesson.notes`, `lesson.schoolAdminComment`, or any other lesson field besides `enrollmentId`
- ❌ Does not regenerate invoices, payroll, or rates
- ❌ Does not create new enrollments (that happens in the existing Enrollment Management page)
- ❌ Does not modify `SchoolEnrollmentPeriod` records
- ❌ Does not touch `student.*` fields
- ❌ Does not introduce any automatic background job
- ❌ Does not auto-link on page load or on listener update
- ❌ Does not attempt per-student attribution in group lessons
- ❌ Does not guess facts (fuzzy matching, date slop, name similarity)

---

## 15. Files to create / modify (preview — not implementation)

### New files
- `pages/admin/EnrollmentReview.tsx` — main review page
- `components/enrollmentReview/EnrollmentReviewTable.tsx` — table component with group/flat rendering
- `components/enrollmentReview/EnrollmentReviewFilters.tsx` — filter row
- `components/enrollmentReview/EnrollmentSuggestionChip.tsx` — suggestion chip with tooltip
- `components/enrollmentReview/LinkPreviewModal.tsx` — single-lesson preview
- `components/enrollmentReview/BatchLinkPreviewModal.tsx` — batch preview with per-row checkmarks
- `components/enrollmentReview/EnrollmentPickerModal.tsx` — "Choose…" enrollment picker
- `services/enrollmentReviewSuggestions.ts` — pure suggestion logic (candidate gen + scoring)

### Modified files
- `context/AppContext.tsx` — adds `updateLessonEnrollmentLink(lessonId, enrollmentId | null)` function
- `types.ts` — adds `EnrollmentSuggestion` type and possibly a small helper `scoreEnrollmentCandidate(lesson, enrollment)` (pure fn, no state)
- `App.tsx` — new route `/admin/enrollment-review`
- `components/Sidebar.tsx` — admin sidebar nav item
- `docs/PHASE_STATUS.md` — phase tracking
- (Later, 19.6D5E) `pages/school/SchoolEnrollmentReview.tsx` + `App.tsx` + `Sidebar.tsx` for school_admin

### Intentionally untouched
- `services/invoiceGeneration.ts`
- `services/rateEngine.ts`
- `services/payrollExport.ts`
- `services/pdfExport.ts`, `services/exportUtils.ts`, `services/excelExport.ts`
- `pages/admin/EnrollmentManagement.tsx` (except for a single read-only "N unlinked" pill in 19.6D5D)
- `pages/Attendance.tsx`, `pages/LessonLog.tsx`
- `types.ts` enrollment/lesson interfaces (no new fields)
- Firestore security rules (no new collection access in Phase A–E; Phase F adds the audit log)

---

## 16. Testing checklist (for future implementation)

### Phase 19.6D5A — Read-only
- [ ] Page loads with empty Firestore → shows zero counts, no errors
- [ ] Page loads with 100 unlinked lessons → all appear, paginated or scrollable
- [ ] Filters narrow the list correctly (school, teacher, student, date range, instrument, status)
- [ ] Tab counts match table rows
- [ ] Group-by mode renders headers with correct counts
- [ ] Suggestion chips show correct candidates
- [ ] Scoring tooltip shows breakdown
- [ ] No write buttons exist / all write buttons are disabled

### Phase 19.6D5B — Single-lesson
- [ ] Link button writes `enrollmentId` to Firestore
- [ ] Undo toast reverts the write
- [ ] Choose… picker shows correct enrollments for the student
- [ ] Preview modal blocks confirm until the confirmation checkbox is checked
- [ ] Hard-blocked conflicts (cancelled enrollment, instrument mismatch in single-link path) actually block
- [ ] Soft-warned conflicts (out-of-range, over-capacity) allow through with warning
- [ ] Dismissal hides rows without writing to Firestore
- [ ] Unlink from Out-of-range tab clears `enrollmentId`

### Phase 19.6D5C — Batch
- [ ] Selection checkboxes work
- [ ] Bottom toolbar appears on selection
- [ ] Batch preview modal shows all selected rows with per-row warnings
- [ ] Unchecking rows in the preview modal excludes them from the commit
- [ ] Batch confirm writes all selected (minus unchecked) rows
- [ ] Partial batch failure surfaces errors; successful rows stay applied
- [ ] 200-row cap enforced
- [ ] 100-row commit chunks work correctly for >100 selections
- [ ] Undo reverts the entire batch

### Phase 19.6D5D — Refinement
- [ ] Scoring tooltip visible on hover
- [ ] Weak matches highlighted amber
- [ ] Full enrollments toggle reveals at-capacity candidates
- [ ] "Has suggestion" filter works

### Phase 19.6D5E — School admin
- [ ] School admin sees only their school's lessons
- [ ] School admin cannot link a lesson to another school's enrollment
- [ ] School admin cannot see private student lessons

### Phase 19.6D5F — Audit log
- [ ] Every link / unlink / dismiss writes an audit doc
- [ ] Recent activity view shows last N actions
- [ ] Cross-session undo works from the audit log

---

## 17. Summary — what 19.6D5 buys us

| Capability | Before | After |
|-----------|--------|-------|
| Find unlinked lessons | Search by hand in LessonLog | Dedicated page with counts and filters |
| Understand why a lesson is unlinked | Guess | Tabs separate true unlinked from orphaned/mismatched |
| Suggest a correct link | None | Scored candidates with transparent reasoning |
| Single-lesson linking | No dedicated flow | Preview + confirm + undo |
| Batch linking | Not possible | Reviewable, per-row-verifiable, confirmation-gated |
| Fix an over-eager link | Edit enrollment in admin page (awkward) | Unlink from Out-of-range tab (one click, reversible) |
| Auditability | None | In-session undo (A–E); persistent log (F) |
| Migration of pre-19.6 lessons | Unsafe scripts | Per-lesson, per-session, per-admin, fully reversible |

---

## STOP

**⏸️ Plan complete. Awaiting approval. No code to be written until the plan is approved.**
