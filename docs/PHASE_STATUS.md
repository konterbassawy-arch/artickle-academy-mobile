# ARTickle Phase Status

## Current Phase
Phase 19.6 Reset — Simple School Period Auto-Progress - COMPLETED (2026-04-18)

## Planning Phases (complete)
1. Codebase analysis - COMPLETED (2026-03-22)
2. Architecture mapping - COMPLETED (2026-03-22)
3. Security audit - COMPLETED (2026-03-22)
4. Role and permission model - COMPLETED (2026-03-22)
5. Requirements curation - COMPLETED (2026-03-22)
6. Implementation roadmap - COMPLETED (2026-03-22)
6.5. Final architecture lock - COMPLETED (2026-03-22)

## Implementation Phases

### Tier 1 — Foundation (must be done first, in order)
7. Role system foundations - COMPLETED (2026-03-22)
8. Portal route structure + React Router - COMPLETED (2026-03-22)

### Tier 2 — Core portals (after Tier 1, order matters)
9. Admin portal consolidation - COMPLETED (2026-03-22)
9.1. Admin enhancements + ID system (user edit, parentId, private student PV IDs) - COMPLETED (2026-03-23)
10. Teacher portal - COMPLETED (2026-03-22)
11. Parent/student visibility + portals - COMPLETED (2026-03-23)
12. School admin layer - COMPLETED (2026-03-23)

### Tier 3 — Feature layers (after Tier 2, mostly independent)
13. Evaluations and progress expansion - COMPLETED (2026-03-23)
14. Booking and calendar foundations - COMPLETED (2026-03-23)
14.1. Professional export & report improvements - IN PROGRESS
  14.1a. PDF report branding (logo, layout, Phase 13 fields) - COMPLETED (2026-03-24)
  14.1b. Excel export styling (freeze panes, status colors, header styling) - PENDING
15. Scheduling engine (timetable + auto-generation + deliveryMode) - COMPLETED (2026-03-24)

### Tier 4 — Advanced features (after Tier 3, order flexible)
16. Online lessons configuration (supportsOnline, online rates, teacher filtering) - COMPLETED (2026-03-24)
17. Payment/invoice architecture
  17.0. Financial architecture design (enrollment, invoice, payment, rate engine) - COMPLETED (2026-03-24)
  17.1. Rate Engine + Dead Code Cleanup (resolveTeacherRate, resolveSchoolRate, remove dead fns) - COMPLETED (2026-03-24)
  17.2. Enrollment Entity - COMPLETED (2026-03-24)
  17.3. Invoice Entity - COMPLETED (2026-03-24)
  17.4. Payment Entity & Invoice Reconciliation - COMPLETED (2026-03-25)
  17.5. Portal Integration & Visibility - COMPLETED (2026-03-25)
  17.G. Guarantee System Refactor - COMPLETED (2026-03-25)
  17.G.1. Invoice Guarantee Integration - COMPLETED (2026-03-26)
  17.D. Documentation Consolidation - COMPLETED (2026-03-26)
  17.6. Payroll Entity + Settlement Tracking - COMPLETED (2026-03-26)
  17.6A. Payroll & Invoice Workflow Refinement - COMPLETED (2026-03-26)
  17.7. Invoice & Payroll Export (Excel + PDF with ARTickle branding) - COMPLETED (2026-03-26)
  17.7A. Finance Export Redesign (grouped exports + payroll register) - COMPLETED (2026-03-27)
  17.8. Invoice & Payroll UI Minimal Alignment - COMPLETED (2026-03-27)
18. Notifications and automations (in-app + email + WhatsApp)
19. File sharing and practice tracking
  19.1-19.2. School admin lesson view + comment system - COMPLETED
  19.3. Unread notes indicators (teacher + dashboard) - COMPLETED
  19.4. Student detail + report system (admin + school admin) - COMPLETED
  19.4A. Admin students page + admin student detail - COMPLETED
  19.4B. Student data enrichment (yearGrade, email, DOB) - COMPLETED
  19.4C. Grade/email filters across all student + lesson pages - COMPLETED
  19.5. Unified Student Report System (all roles) - COMPLETED (2026-04-14)
    19.5A. StudentReportCore shared component - COMPLETED
    19.5B. Admin + SchoolAdmin migration to shared component - COMPLETED
    19.5C. Teacher student detail page (TeacherStudentDetail) - COMPLETED
    19.5D. Parent view upgrade (ChildProgress refactor + PDF export) - COMPLETED
    19.5E. Student self-view (StudentSelfView + My Progress route) - COMPLETED
    19.5F. Export verification + documentation - COMPLETED
  19.6. Enrollment System Refinement - IN PROGRESS
    19.6A. Types / data model groundwork - COMPLETED (2026-04-14)
    19.6B. AppContext + Firestore data layer (listeners + CRUD) - COMPLETED (2026-04-14)
    19.6C. School Period Manager UI (admin + school_admin) - COMPLETED (2026-04-14)
    19.6D1. Enrollment validation + isCurrentEnrollment / isHistoricalEnrollment helpers - COMPLETED (2026-04-14)
    19.6D2. Enrollment creation UI (period/custom mode, role-aware form, payer-type defaults) - COMPLETED (2026-04-14)
    19.6D3+D4. Current + historical enrollment display (list badges + detail sections, all roles) - COMPLETED (2026-04-14)
    19.6D5. Enrollment Review & Unlinked Lesson Tool (admin-only diagnostic page) - COMPLETED (2026-04-15)
      19.6D5A. Read-only page — 4 tabs, filters, suggestion chips, group-by - COMPLETED
      19.6D5B. Single-lesson actions — Link, Choose, Dismiss, Unlink with modals + undo toast - COMPLETED
      19.6D5C. Batch linking — row selection, batch preview modal, chunked writeBatch, batch undo - COMPLETED
      19.6D5D. Period filter in Enrollment Review + school period display in expanded rows - COMPLETED

  19.6 Reset — Simple School Period Auto-Progress - COMPLETED (2026-04-18)
    Step 1: Pure helper module (services/schoolPeriodProgress.ts)
      - getSchoolPeriodProgress: lessons + minutes count for one student/period
      - getRelevantPeriodsForStudent: current + past-with-activity periods, sorted
      - getCompactPeriodSummary: single best period for list display
      - PeriodProgress type with lesson %, minutes %, alertLevel (none/approaching/almost)
      - Alert thresholds: approaching ≥80%, almost ≥90% (max of lesson% and minutes%)
    Step 2: Student detail cards
      - components/SchoolPeriodProgressCard.tsx — full period breakdown with progress bars
      - Added to AdminStudentDetail, SchoolStudentDetail, TeacherStudentDetail
      - Handles: no periods configured / no lessons yet / current + historical periods
    Step 3: Student list compact badge
      - components/SchoolPeriodListBadge.tsx — SVG circle + minutes/lessons lines + alert pill
      - components/MinutesProgressCircle.tsx — reusable SVG donut (xs/sm/md, tone-aware)
      - Added to AdminStudents, MyStudents, SchoolStudents
    Fixes also shipped in this phase:
      - SchoolPeriodManager edit button fixed (selectedSchoolId now set in startEdit)
      - School Periods removed from sidebar; lives in Configuration → School Periods tab
      - EnrollmentManagement student dropdown: filtered by school, deduplicated by name+instrument
      - EnrollmentManagement school change now clears student if student not in new school
      - Stale /admin/school-periods nav link fixed to /admin/config

### AI Phases

  AI.1 — AI Summary Architecture + Deterministic Fallback - COMPLETED (2026-04-20)
    Types: SummaryInput, SummaryMode, SummaryAudience, LessonSnapshot, AttendanceSummary, PeriodSnapshot, SummarySignals
    buildSummaryInput: role-safe input assembly (no DOB, email, financial, parent contact)
      - teacher audience: includes teacher notes + schoolAdminComment
      - parent/student/admin: excluded (AI.2+)
    deterministicSummary: two modes
      - polish: flowing prose paragraph (attendance + progress + trend)
      - term: structured sections (STUDENT / TERM PROGRESS / ATTENDANCE / PROGRESS / PREVIOUS TERMS / NOTES)
    provider.ts: AISummaryProvider interface + noneProvider (always falls back — AI.1 default)
    prompts/teacher.ts: buildTeacherPrompt() — ready for AI.2 provider wiring
    index.ts: generateSummary() — routes to provider or deterministic fallback
    AISummaryCard: teacher-only UI card
      - mode toggle: Lesson Summary (polish) / Term Summary (term)
      - "AI Draft" badge + "Review before sharing" label always visible
      - lazy generate on button click; Regenerate after first generation
      - "not saved · for internal review only" footer
    Added to TeacherStudentDetail above SchoolPeriodProgressCard
    NO Firestore writes. NO API dependency. Display only.

  AI.2 — Provider Integration (Claude via Cloud Function proxy) - COMPLETED (2026-04-20)
    Firebase Cloud Function (functions/src/index.ts) — generateAIReport HTTPS proxy
      - Receives pre-built prompt from client (system + user + reportType)
      - Calls claude-haiku-4-5 server-side; API key via Firebase Secret Manager
      - Returns { text } — no Firestore writes, no logging
    Two report types (ReportType = 'polish_report' | 'term_report')
      - polish_report: professional rewrite of recent teacher notes (same meaning, no invention)
      - term_report: structured 4-section academic report (Technical / Practical / Practice / General)
    Client architecture
      - services/aiSummary/reportTypes.ts — AIReport, ReportType, labels, descriptions
      - services/aiSummary/claudeProvider.ts — fetch to VITE_AI_FUNCTION_URL
      - services/aiSummary/prompts/polishReport.ts — prompt builder
      - services/aiSummary/prompts/termReport.ts — prompt builder
      - services/aiSummary/deterministicReport.ts — fallback for both types
      - services/aiSummary/generateReport.ts — routes to Cloud Function or fallback
    UI
      - AISummaryCard: replaced mode tabs with two report-type buttons (Polish / Term)
      - AIReportPreviewModal: AI draft badge + fallback banner + Copy / Export PDF / Regenerate
      - pdfExport.generateStudentReportPDF: optional aiReportText → "AI Report (Teacher Reviewed)" section
    Fallback banner shown in modal when Cloud Function fails (isFallback=true)
    NO Firestore writes anywhere. Teacher audience only.
    Setup required: firebase functions:secrets:set ANTHROPIC_API_KEY + set VITE_AI_FUNCTION_URL
  AI.3 — Parent audience + PDF export integration - PENDING
  AI.4 — Student self-view + admin renewal recommendation - PENDING
  AI.5 — Multi-provider + per-school config - PENDING

### Tier 5 — Public + Polish
20. Public website shell + trial lead capture
21. Branding, i18n preparation, consent
22. Multi-region preparation
23. Premium features (certificates, video, analytics)
24. Final review, cleanup, and production hardening

## Phase Completion Notes
Use this file to mark:
- started
- in progress
- completed
- blocked