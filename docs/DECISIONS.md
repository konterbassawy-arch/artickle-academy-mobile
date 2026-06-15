# ARTickle Decisions Log

## Architecture
- Existing app remains the operational core
- Public website and protected portal should coexist cleanly
- Avoid rebuilding from zero

## Roles
- admin
- teacher
- parent
- student
- school_admin

## Role Rules
- Admin sees everything
- Multi-role users may exist
- UI permissions and backend/data access rules must align

## Portal Direction
Target portal sections:
- /admin
- /teacher
- /parent
- /student
- /school

## Booking Direction
- booking request and confirmed lesson should be treated separately if needed
- teacher availability should be planned carefully
- trial lesson flow should be supported

## Online Lessons
- zoom support is expected later
- architecture should be prepared first
- final implementation method not yet locked

## Finance Direction
- preserve current finance logic
- future payment layer should not replace teacher pay / school billing logic
- future payment gateway should be modular

## Security Direction
- no exposed secrets
- no role leakage
- no unsafe privileged client logic
- public website and protected portal must be clearly separated

## Routing Decision
- React Router will be added (required for portal structure)
- No-router page-state pattern in App.tsx will be replaced by React Router
- All existing pages will be moved under role-scoped route trees
- Public website routes will be separated from authenticated portal routes

## Context Splitting Decision
- AppContext.tsx will remain the initial single context
- It will be split incrementally: AuthContext first, then domain contexts per phase
- Do not split all at once — risk of breaking existing logic is too high
- Split only when a phase explicitly requires it

## Firebase SDK Decision
- Firebase CDN import pattern will be kept for now (not migrated to npm)
- Reason: too risky to change build chain mid-project without a dedicated migration phase
- Revisit only if CDN imports cause build or type issues in a specific phase

## Role Storage Decision
- Roles stored as lowercase strings in Firestore: 'admin', 'teacher', 'parent', 'student', 'school_admin'
- All role checks in code and Firestore rules must use lowercase
- Role case bugs in AppContext.tsx listeners and firestore.rules must be fixed in Phase 3 (Security Audit)

## Multi-Role Decision
- A user document may carry a single role field initially
- Multi-role support (roles array) will be planned but not implemented until needed
- For now: one user = one role

## Data Model Decision
- Lesson rates remain snapshotted at creation time (teacherRate, schoolRate fields on lesson)
- New entities (Parent, Booking, TeacherAvailability, OnlineLessonSession) will be added as separate Firestore collections
- Do not modify the Lesson schema unless a phase explicitly requires it

## Online Lesson Decision
- An OnlineLessonService interface will be defined (provider-agnostic)
- Zoom is not implemented yet — interface only
- Lesson model will gain optional deliveryMode field ('in-person' | 'online') when online lesson phase begins

## Financial Guarantee Decision
- Duplicate guarantee logic (currently in 4 places) will be consolidated into services/guaranteeService.ts
- This consolidation will happen in Phase 7 or earlier if a financial bug is found
- No financial logic changes until consolidation is confirmed correct

## Firestore Structure Decision
- /users/{uid} — profile + role (existing)
- /schools/{schoolId} — school data (existing)
- /teachers/{uid} — teacher profile (existing, uid matches user uid)
- /students/{studentId} — student data (existing)
- /lessons/{lessonId} — lesson records (existing)
- /counters/{key} — sequence counters (existing)
- /parents/{uid} — parent profiles (new, uid matches user uid)
- /bookings/{bookingId} — trial/booking requests (new)
- /availability/{teacherId} — teacher availability slots (new)
- /notifications/{id} — notification records (new, future)
- /onlineSessions/{id} — online lesson sessions (new, future)

## Security Decisions (Phase 3)

### Service Account Key
- firebase-service-account.json must NEVER be committed to any repo
- Added to .gitignore with a broad pattern (*service-account*.json, *serviceAccount*.json)
- For CI/CD use, store as an encrypted secret in your pipeline (GitHub Actions secrets, etc.)
- If the key has already been committed anywhere historically, rotate it immediately in Firebase Console

### Firebase API Key (Web SDK)
- Firebase Web SDK API keys are NOT traditional secrets — they are identifiers
- Real protection comes from Firestore security rules and Firebase Auth restrictions
- HOWEVER: should still be moved to VITE_ env vars for environment flexibility
- Will be migrated when AppContext is refactored in Phase 7

### Firestore Rules — CRITICAL FINDING (VERIFIED 2026-03-22)
- Local firestore.rules uses 'Admin' and 'Teacher' (capital case) — WRONG
- Database stores 'admin' and 'teacher' (lowercase) — CORRECT
- DEPLOYED rules are wide-open: `allow read, write: if request.auth != null` — the structured rules were NEVER deployed
- The app works ONLY because there are zero access restrictions on any authenticated user
- FIX REQUIRED in Phase 7: correct case in firestore.rules, then DEPLOY the structured rules
- Roles will be lowercase ('admin', 'teacher', 'parent', 'student', 'school_admin') everywhere

### Client-Side Role Scoping — CRITICAL FINDING
- AppContext.tsx lines 240 and 280 check role === 'Teacher' (capital T)
- Role.TEACHER = 'teacher' (lowercase)
- Client-side Firestore query scoping for teachers is broken — teachers receive ALL data
- This must be fixed in Phase 7 (Role System Foundations) before teacher portal is built

### Teacher Data Privacy
- Currently all students are readable by any authenticated teacher (no filter by teacherId/schoolId)
- Teacher can see schoolRate (billing rate) on all lessons they access
- These are acceptable short-term risks while only admin+teacher roles exist
- Must be tightened when parent/student portals are added

### Notes Field Privacy
- Attendance.tsx labels "notes" as "Private Notes" (internal teacher notes)
- When parent/student portals are built, notes field must be explicitly excluded from parent/student reads
- learning field is intended to be parent/student visible; notes field is not

### Deployment Target
- Both firebase.json and vercel.json exist — both have SPA rewrites
- Decision needed: pick one deployment target and remove the other config
- Recommended: Firebase Hosting (keeps everything in one Google ecosystem with Firestore)

## Role and Permission Model Decisions (Phase 4)

### Role Enum Extension
- types.ts Role enum must be extended to include: 'parent', 'student', 'school_admin'
- All five roles stored as lowercase strings: 'admin', 'teacher', 'parent', 'student', 'school_admin'
- Do NOT implement until Phase 7

### User-to-Entity Linkage Model
- Admin: role='admin' in /users/{uid} — no parallel entity doc required
- Teacher: role='teacher' in /users/{uid} AND /teachers/{uid} document (uid must match — existing)
- Parent: role='parent' in /users/{uid} AND /parents/{uid} document (uid must match — new)
- Student: role='student' in /users/{uid} AND /students/{studentId} document with uid field added (new field)
- School Admin: role='school_admin' in /users/{uid} AND schoolId field in /users/{uid} doc (new field on user doc)

### Parent-Student Linkage
- Parent document carries childIds: string[] (array of student document IDs)
- Student document carries parentIds: string[] (array of parent UIDs)
- Both sides are denormalized for bidirectional Firestore query support
- Admin links parents to students during onboarding — not self-service initially

### School Admin Linkage
- User document carries schoolId: string when role is school_admin
- School document carries adminIds: string[] (array of school_admin UIDs)
- Both sides denormalized for bidirectional lookup
- Admin assigns school_admin role and links to school during setup

### Student Login Decision
- Students will have Firebase Auth accounts (email/password)
- Student document will gain a uid field linking Firebase Auth uid to the student record
- This enables student portal login without changing the student data model significantly
- Student uid field added only when Phase 9 (parent/student visibility) begins

### Field Visibility Rules (permanent, must be enforced in all portals)
- notes field (Lesson): ADMIN and TEACHER only — never visible to parent, student, school_admin
- teacherRate field (Lesson): ADMIN only — never visible to teacher, parent, student, school_admin
- schoolRate field (Lesson): ADMIN and SCHOOL_ADMIN only — not visible to teacher, parent, student
- teacher pay rates (Teacher.baseRate, ratesBySchool): ADMIN only — never visible to others
- school billing rates (School.defaultRate, teacherRates): ADMIN and SCHOOL_ADMIN only
- learning field (Lesson): visible to ADMIN, TEACHER, PARENT, STUDENT
- interactivity, behavior (Lesson): visible to ADMIN, TEACHER, PARENT, STUDENT

### Firestore Rules Architecture
- All role checks must use lowercase strings matching the Role enum
- Field-level restrictions NOT enforced by Firestore rules (not natively supported)
- Field-level restrictions enforced in: service layer (data fetching transformations) and UI components
- Firestore rules enforce: who can access which documents (collection-level and document-level)
- Client-side service layer enforces: which fields are returned to which role
- This is a two-layer model: Firestore rules = document guard, service layer = field guard

### Counter Access for Teachers
- Teachers are granted read/write on /counters/{key} — required for lesson ID generation
- Long-term fix: move counter increment to Cloud Function to remove client-side counter access
- Short-term acceptable since counters only store integers and teachers are trusted users

### schoolRate Visibility for Teachers
- Decision: teachers CANNOT see schoolRate (school billing rate) in their portal views
- schoolRate is stripped from teacher-facing lesson views at the service/UI layer
- This preserves ARTickle's commercial confidentiality with schools

### Multi-Role Future Planning
- Single role per user for now (as previously decided)
- When multi-role is needed: user doc gains roles: string[] array alongside role: string
- All role checks updated to use array-contains logic
- Firestore rules updated similarly
- Do not implement until a specific use case requires it

## Requirements Curation Decisions (Phase 5)

### Firebase Verification — ANSWERED (2026-03-22)

#### Q17 — Role values in Firestore (CONFIRMED)
- All user documents store roles as LOWERCASE: 'admin', 'teacher'
- Documents checked: manus_test_com, manus_teacher_com, karim_adnan_hotmail_com, konterbassawy_gmail_com
- No mixed-case variants exist in the database
- Conclusion: types.ts Role enum is CORRECT. firestore.rules is WRONG (uses 'Admin'/'Teacher').

#### Q18 — Deployed Firestore Rules (CONFIRMED)
- DEPLOYED rules are WIDE OPEN: `allow read, write: if request.auth != null;`
- This means ANY authenticated user can read and write EVERY document in the entire database
- The structured firestore.rules file in the project has NEVER been deployed
- The app works because there are NO access restrictions — not because roles are checked

#### Impact Assessment
- SECURITY STATUS: Currently any authenticated user (teacher, future parent, future student) can:
  - Read ALL financial data (teacher rates, school rates, all lessons)
  - Write to ANY collection (could delete schools, modify other teachers' lessons, change user roles)
  - Read ALL user documents (emails, names, roles of everyone)
- This was acceptable when the system had only 2-4 trusted admin/teacher users
- This is UNACCEPTABLE before adding parent, student, or school_admin roles
- The structured firestore.rules file must be FIXED (lowercase roles) and DEPLOYED before Phase 9

#### Fix Plan (for Phase 7)
1. Fix firestore.rules: change 'Admin' → 'admin', 'Teacher' → 'teacher'
2. Add rules for new roles: parent, student, school_admin
3. Fix AppContext.tsx: change role === 'Teacher' → role === Role.TEACHER (two occurrences)
4. Test all existing flows with corrected rules locally using Firebase emulator
5. Deploy corrected rules to Firebase Console
6. Verify no existing functionality breaks

### Student Age Range (Q31 — Answered)
- Primary student age: 5–15 years old
- Also teaches adults
- Children under 13 present → COPPA / child privacy considerations apply
- Parental consent is required for under-13 student accounts
- Student portal for under-13s must NOT collect personal data without parent consent
- Parent portal is the primary interface for children under 13; student portal is secondary
- Adult students may act as their own "parent" (self-managed account)
- Privacy policy and consent forms must cover minors explicitly (Phase 9)

### Business Model
- Dual model: B2B (schools pay ARTickle monthly based on lessons delivered) AND B2C (parents pay ARTickle directly)
- Private students exist (not attached to any school) — parent pays directly
- Teacher pay: monthly per hour currently — system must be upgradable for future pay models (per lesson, salary, etc.)
- Lesson rates: every school can have different rates; online vs in-person rates may differ per school

### Booking & Trial Flow
- Current flow: WhatsApp → admin assigns teacher → teacher does trial → admin confirms enrollment
- Future flow (upgradable): parent books next available slot automatically via website
- B2C parents can request trials through the public website
- Enrollment confirmed by parent paying for the course
- Trial and confirmed lessons are separate entities in the system
- Build manual-first booking flow now; design for future automation

### Lesson Scheduling & Calendar
- Teachers have fixed weekly timetables (e.g. Mon 10am-12pm at School X)
- System must auto-generate recurring lesson slots from the timetable
- Rescheduling and cancellation allowed by admin, teacher, and parent — but requires alignment/approval from all parties
- Reschedule approval flow needed (request → approve → confirm)

### School Contracts
- Some schools have guaranteed minimum hours, some do not
- Guarantees are per-instrument (some instruments guaranteed, others not) — existing logic already handles this
- Teachers can work at multiple schools — existing system supports this
- Students can be at multiple schools (e.g. school lessons + private online lessons)

### Evaluation & Progress — EXPANDED
- Current fields kept: interactivity (1-5), behavior (1-5), "what did the student learn", private notes
- NEW fields to add:
  - Overall grade / level
  - Piece/repertoire being studied
  - Practice assignment / homework
  - Exam preparation status
  - Average score across lessons (computed, not stored per lesson)
- Parents see progress LIVE (after every lesson) — not weekly/monthly summaries only
- Parents also see the running average score
- Implementation: Phase 12 (Evaluations and Progress Visibility)

### Communication & Notifications
- Channels: in-app (bell icon), email, WhatsApp — all three required
- WhatsApp is HIGH PRIORITY (Saudi market standard)
- Zoom for online lessons (not a notification channel, but listed by user alongside comms)
- ALL notification events enabled:
  - New lesson booked
  - Lesson cancelled
  - Lesson rescheduled
  - Attendance recorded (parent notified)
  - Evaluation submitted (parent notified)
  - Payment due / overdue
  - Trial lesson confirmed
  - New progress report available
- Implementation: separate notification phase after core portals are built
- WhatsApp integration: likely via WhatsApp Business API or third-party (e.g. Twilio, MessageBird)

### Language & Branding
- English only for now, Arabic later (RTL support deferred but architecture must not block it)
- Brand identity exists: logo + fonts available
- Current dark theme is placeholder — will be replaced with brand identity
- RTL preparation: use CSS logical properties (margin-inline-start, not margin-left) where practical

### Online Lessons
- Not currently supported — planned for website phase
- Zoom preferred; platform should auto-generate meeting links (not teacher-pasted)
- Online vs in-person have different rates (per school configuration)
- Lesson model needs deliveryMode: 'in-person' | 'online' field (already decided in Phase 2)
- School model needs onlineRate / defaultOnlineRate fields alongside defaultRate
- Implementation: Phase 13 (Online Lesson Architecture)

### Reports & Exports
- Admin: full Excel payroll, school invoices, all lesson data — YES (existing)
- Teacher: own payslip export — YES (existing)
- School admin: school invoice export — NOT YET NEEDED (defer)
- Parent: child's progress report as PDF — YES (new)
- Parent progress PDF: use existing jsPDF (already loaded in index.html but unused) or server-side generation

### Parent Portal Scope
- ALL of the following are required:
  - Child's attendance record
  - Child's evaluation scores (interactivity, behavior, new fields)
  - What the child learned each lesson
  - Upcoming scheduled lessons
  - Teacher profile (name, instrument)
  - Request lesson reschedule
  - Message the teacher (simple messaging, not real-time chat)
- Payment/invoice visibility:
  - B2B (school students): show lesson count taken and remaining in course — NO money amounts
  - B2C (direct/private students): show money amounts, payment history, invoices
- This split visibility is a critical UI/logic distinction

### Student Portal
- Students DO get their own login (Firebase Auth account)
- Student sees: own lessons, attendance, progress, materials, online lesson links
- Age range: NOT YET ANSWERED — must be confirmed before Phase 9 (affects privacy/consent)

### Premium Features — Confirmed for Future
- Practice tracking: YES — students/parents log practice hours between lessons
- File sharing: YES — teachers upload sheet music, recordings, materials for students
- Video recording: YES — but storage cost concerns; needs cloud storage strategy
- Payment gateway: YES but NOT YET — for now send payment links externally (manual)
- Parent consent: YES — digital consent forms for B2C online students (photo/video permission, ToS)
- Teacher performance analytics: YES — admin sees attendance rate, avg evaluation scores, retention rate
- Student certificates: YES — platform generates completion certificates
- Multi-branch support: YES — ARTickle will operate in different regions; plan for multi-region admin teams
- Public teacher profiles: NO — website showcases instruments/courses as products, not individual teachers

### Public Website Direction
- Website showcases instruments and courses as premium products (like a product catalog)
- NOT a teacher marketplace — teachers are internal, not publicly profiled
- Trial lesson request form for B2C parents
- Brand identity (logo, fonts, colors) to be applied
- English first, Arabic-ready architecture

### Payment Architecture Direction
- Phase 14 (Payment/Invoice Architecture Preparation) — design only, no gateway integration yet
- Current state: external payment links sent manually
- Future state: integrated gateway (credit card, Mada, Apple Pay) — Saudi market standard
- B2B invoicing: monthly invoice to schools based on lessons delivered (existing logic preserved)
- B2C invoicing: course/package payment by parent (new)
- Payment gateway must be modular (swap provider without rewriting billing logic)

### Multi-Branch / Multi-Region
- ARTickle will expand to multiple regions
- Implies: region field on schools, teachers, students
- Implies: regional admin roles (future — beyond current 5 roles)
- Do NOT implement now, but do NOT design anything that blocks it
- No hardcoded single-tenant assumptions in data model

## Implementation Roadmap Decisions (Phase 6)

### Tier Ordering Rationale
- Tier 1 (Phases 7-8) must come first: everything depends on roles + routes existing
- Tier 2 (Phases 9-12) builds portals in dependency order: admin first (already exists, just reorganize), teacher next (already partially exists), parent/student (new), school admin (new)
- Tier 3 (Phases 13-15) adds features ON TOP of working portals — cannot build before portals exist
- Tier 4 (Phases 16-19) adds advanced integrations — external dependencies (Zoom, payment gateways, WhatsApp API)
- Tier 5 (Phases 20-24) is public-facing and polish — requires all internal systems working first

### Firestore Rules Deployment Timing
- Phase 7 fixes the rules file and deploys it WITH the existing admin+teacher roles
- Phase 7 does NOT add parent/student/school_admin rules yet — those roles don't exist in the system
- Each subsequent phase that adds a role also adds that role's Firestore rules in the same phase
- This prevents deploying rules for roles that have no users yet

### React Router Migration Strategy
- Phase 8 introduces React Router
- Current page-state pattern (useState('dashboard')) in App.tsx is replaced
- All existing pages keep their components unchanged — only the navigation mechanism changes
- Sidebar.tsx updates from setPage('x') to navigate('/admin/x')
- This is the HIGHEST RISK phase for breaking the existing app — extra testing required

### Service Layer Introduction
- New services/ files are created incrementally per phase
- services/permissionService.ts — created in Phase 7 (role checks + field filtering)
- services/lessonService.ts — extracted from AppContext in Phase 10 (teacher portal)
- services/parentService.ts — created in Phase 11
- services/schoolAdminService.ts — created in Phase 12
- services/bookingService.ts — created in Phase 14
- services/schedulingService.ts — created in Phase 15
- Do NOT extract all services at once — extract when a phase needs it

### Parent + Student Portal Decisions (Phase 11)

#### Data Isolation — DevTools-Proof
- **Parents/Students see:** lesson date, status, teacher name, school name, duration, type, learning, interactivity, behavior
- **Parents/Students NEVER see:** notes (private teacher notes), schoolRate, teacherRate, teacher rates/codes, school billing rates
- All sensitive fields are stripped in AppContext listener callbacks BEFORE entering React state
- Even browser DevTools inspection shows zero financial data and zero private notes
- This matches the permission service field filtering but enforced at the data layer

#### Parent Scoping
- Parent listener fetches own `/parents/{uid}` doc first to get `childIds`
- Students and lessons are then filtered to only children in `childIds`
- If admin changes links, parent doc listener auto-updates in real-time

#### Student Scoping
- Student listener queries `/students` where `uid == currentUser.id`
- Lessons filtered to only those containing the student's doc ID in `studentIds`
- Student doc must have `uid` field set (admin links during setup)

#### Student Data Model Extension
- `Student.uid?: string` — Firebase Auth uid for student portal login
- `Student.parentIds?: string[]` — parent uids linked (for future bidirectional queries)
- Both fields are optional — existing students unaffected until admin links them

#### Firestore Rules Updates
- Lessons: parent read enabled (`allow read: if isParent()`)
- Lessons: student read enabled (`allow read: if isStudent()`)
- Students: student self-read via uid match (`resource.data.uid == request.auth.uid`)
- App-layer filtering handles the row-level scoping (childIds, studentIds)

#### Permission Service Bug Fix
- `filterLessonFields` for PARENT/STUDENT previously included `notes` field
- Fixed: `notes` removed from parent/student view per DECISIONS.md field visibility rules
- DECISIONS.md: "notes field (Lesson): ADMIN and TEACHER only — never visible to parent, student, school_admin"

#### B2B vs B2C Visibility
- B2B students (attached to school): parent sees school name in lesson card
- B2C students (private/no school): parent sees "Private" or school name as stored
- No code split needed — same component handles both; `schoolName` field carries the context

#### parentService.ts Deferred
- DECISIONS.md planned `services/parentService.ts` for Phase 11
- Decision: NOT created in this phase — parent operations are simple enough to stay in AppContext
- Will extract to parentService.ts if Phase 14+ (booking) requires complex parent logic

### School Admin Portal Decisions (Phase 12)

#### School Admin Scoping
- School admin sees ONLY their own school's data — enforced at Firestore query level
- Students: `where('schoolId', '==', userSchoolId)` query in AppContext
- Lessons: `where('schoolId', '==', userSchoolId)` query in AppContext
- Schools: client-side filter to own school only (Firestore rules allow read for any school)

#### School Admin Visibility Matrix
- **schoolRate (billing):** YES — school admin can verify what they're being billed
- **teacherRate (pay):** NO — stripped in AppContext listener (set to 0)
- **notes (private):** NO — stripped in AppContext listener (set to undefined)
- **School billing rates (defaultRate, defaultGroupRate):** YES — visible on dashboard
- **Teacher pay rates (baseRate, ratesBySchool):** NO — stripped, only name + instrument visible
- **Guarantees (minimumDailyHoursByInstrument):** YES — school admin sees their guarantee config
- **Other schools:** NO — filtered out entirely

#### School Admin Portal Pages
- SchoolDashboard: school info, stat cards, invoice estimate, teacher activity breakdown, guarantees
- SchoolLessons: lesson log with search/filter, shows Billed column (schoolRate), no teacherRate
- SchoolStudents: student cards with teacher name and lesson count, read-only

#### Firestore Rules Updates
- Lessons: `allow read: if isSchoolAdmin()` (app-layer filters by schoolId)
- Students: `allow read: if isSchoolAdmin()` (app-layer filters by schoolId)
- Schools: already had `allow read: if isSchoolAdmin()` from Phase 7

#### School.adminIds Deferred
- DECISIONS.md planned bidirectional linkage: School.adminIds + User.schoolId
- Decision: User.schoolId is sufficient for Phase 12 — no need for School.adminIds yet
- Added `adminIds?: string[]` to School interface for future use, but not populated
- Will be populated when admin UI for managing multiple school admins per school is needed

#### schoolAdminService.ts Deferred
- DECISIONS.md planned `services/schoolAdminService.ts` for Phase 12
- Decision: NOT created — school admin operations are simple read-only views
- Will extract if Phase 17+ (invoicing) adds school admin write operations

### Financial Logic Protection
- financialCalculations.ts, excelExport.ts, exportUtils.ts are NOT touched until Phase 17 (Payment)
- Attendance.tsx rate logic is NOT changed until Phase 15 (Scheduling) adds server-side computation
- Any phase that accidentally breaks financial test output must be rolled back before proceeding

### Testing Strategy
- Firebase Emulator required from Phase 7 onward for rules testing
- Each phase must pass: build check + manual smoke test of existing flows
- Financial regression test: export payroll for a known month, compare output before and after each phase

## Phase 9 Decisions

### Parent Entity Pull-Forward
- DECISIONS.md originally placed Parent entity in Phase 11
- User's Phase 9 request explicitly requires "create parent account, link parent to student(s)"
- Decision: pull Parent interface and /parents collection into Phase 9
- Phase 11 will add: reverse linkage (Student.parentIds), parentService.ts, parent portal

### Parent Linkage — One-Directional for Now
- Parent.childIds → Student IDs (set in Phase 9)
- Student.parentIds ← NOT added until Phase 11
- Sufficient for admin operations; reverse lookup deferred

### AdminOverview vs Dashboard
- Dashboard.tsx contains financial guarantee logic — NOT touched
- AdminOverview.tsx is a SEPARATE page with operational stats and quick actions
- Admin sidebar shows both: "Dashboard" (financial) and "Overview" (operational)

### Google Auth Popup Fallback
- Added signInWithRedirect fallback when signInWithPopup is blocked
- This handles embedded/sandboxed browsers that block popups

## Phase 10 Decisions

### Teacher Portal Scope
- Teacher portal uses existing pages (Dashboard, MyStudents, Attendance, TeacherFinance, LessonLog) — no rewrites
- Added TeacherProfile page (read-only view of own teacher record)
- Permission service exists but is NOT wired into page components yet — schoolRate hiding is handled inline in each page that needs it (LessonLog L569, Dashboard L204/222)
- Full permission service integration deferred to Phase 11+ when parent/student portals need consistent field filtering

### Teacher Data Isolation — DevTools-Proof (Phase 10 Security Hardening)
- **Problem:** Teachers could inspect schoolRate on lesson objects and school billing rates via browser DevTools / React DevTools / console, even though the UI hid them.
- **Solution — 3 layers:**
  1. **Lessons:** schoolRate is zeroed out in the Firestore listener callback BEFORE entering React state. Teachers never have schoolRate in memory.
  2. **Schools:** Billing rates (defaultRate, defaultGroupRate, teacherRates, instrumentRates, minimumDailyHoursByInstrument) are stripped from school objects in teacher state. Teachers only see school name + code.
  3. **Lesson creation:** `addLesson` in AppContext now reads the school document directly from Firestore to compute schoolRate when the client doesn't provide it. Teachers' Attendance.tsx no longer computes schoolRate client-side.
- **Result:** A teacher inspecting any variable in DevTools will NEVER see school billing rates or lesson schoolRate values. The data simply doesn't exist in their client memory.
- **Admin path is unchanged:** Admin clients receive full unfiltered data.
- **Note:** Firestore security rules are the ultimate guard (document-level). This is the field-level guard (Layer 2 in the two-layer security model).

### Roadmap Update — IDs, User Edit, Booking Split (confirmed 2026-03-23)

#### 1. Admin User Edit Button
- UserManagement page currently has only Delete — must add Edit capability
- Edit modal shows role-appropriate fields:
  - **All roles:** name, email
  - **Teacher:** instrument, base rate, group rate, per-school rates (delegates to existing updateUser + updateTeacher)
  - **Parent:** phone, display parentId (read-only)
  - **Student:** instrument, school, teacher assignment (delegates to updateStudent)
  - **School Admin:** linked school (schoolId on user doc)
  - **Admin:** name/email only (no special fields)
- Role itself is NOT editable via Edit — role change requires delete + recreate (prevents accidental role escalation)
- **Phase affected:** Phase 9 (admin portal) — add as Phase 9.1 enhancement (retroactive)
- **Implementation:** Add Edit button + modal to UserManagement.tsx, reuse existing updateUser/updateStudent context methods

#### 2. Unified Human-Readable ID System

##### Design Principle
Every entity that appears in admin views, exports, or search results gets a **human-readable display ID** separate from the Firestore document ID. The Firestore document key remains the technical primary key; the display ID is a stored field for human use.

##### ID Formats

| Entity | Prefix | Format | Example | Firestore doc key |
|--------|--------|--------|---------|-------------------|
| School | — | 2-letter code (existing) | `KC`, `AM` | auto-generated |
| Teacher | `TE` | `TE-NNN` | `TE-001` | uid (matches /users) |
| Student (school) | `ST` | `ST_{SCHOOL}_NNN` | `ST_KC_001` | same as display ID (existing) |
| Student (private) | `PV` | `PV-NNN` | `PV-001` | same as display ID |
| Parent | `PAR` | `PAR-NNN` | `PAR-001` | uid (matches /users) |
| Lesson | `SS-TT` | `SS-TT-NNNN` | `KC-01-0034` | auto-generated |
| Booking | — | `booking_timestamp_random` | `booking_1711...` | same (internal only) |

##### Key Rules
- **School students** keep existing format: `ST_{SCHOOLCODE}_NNN` (already implemented, works)
- **Private students** (no school / schoolId is empty or special) get prefix `PV`: `PV-NNN`
- **Parents** get `parentId` field: `PAR-NNN` — stored on the Parent document, NOT the Firestore key
  - Firestore key remains `uid` (matches /users/{uid} for auth linkage)
  - `parentId` is a display/search/export field only
  - Generated via `/counters/parents` using same `reserveCounterRange` pattern
- **Teachers** already have `code` field (`TE_NNN` format) — keep as-is, this IS the display ID
- **Relationship labels** (P1/P2 per child) are optional UI convenience, NOT primary identifiers
  - Can be computed from child's `parentIds` array order, not stored

##### ID Generation Strategy (safe, no duplicates)
All IDs use the existing `reserveCounterRange` Firestore transaction pattern:
```
reserveCounterRange(counterKey, 1) → returns next sequential number
```
| Counter Key | Used For | Result |
|-------------|----------|--------|
| `teachers` | Teacher code | `TE-001`, `TE-002` ... |
| `students_{SCHOOLCODE}` | School student ID | `ST_KC_001`, `ST_KC_002` ... |
| `students_PV` | Private student ID | `PV-001`, `PV-002` ... |
| `parents` | Parent display ID | `PAR-001`, `PAR-002` ... |

- Transaction-based: guaranteed no duplicates even with concurrent writes
- Sequential: human-friendly, sortable
- Existing counter infrastructure in `/counters/{key}` collection — no new infrastructure needed

##### Storage Rules
- `parentId` field added to `Parent` interface: `parentId?: string`
- `Student.id` already IS the human-readable ID for school students (no change)
- For private students: `addStudent` detects empty/missing schoolId → uses `PV` prefix counter
- Teacher `code` field already exists — no change needed
- School `code` field already exists — no change needed

#### 3. Booking System Split — Public vs Portal

##### Current State (Phase 14, already built)
- Booking system lives inside the authenticated parent portal
- Parents submit requests → admin reviews → converts to lesson
- This works for EXISTING families (already have accounts)

##### New Requirement: Public Trial Leads
- Trial booking for NEW families (no account yet) must come from the public website
- These are anonymous lead captures, not authenticated booking requests
- Different from portal bookings in every way:

| Aspect | Public Trial Lead | Portal Booking |
|--------|------------------|----------------|
| **Source** | Public website (unauthenticated) | Parent portal (authenticated) |
| **Who submits** | Anonymous visitor | Logged-in parent |
| **Data collected** | Name, phone, email, instrument interest, preferred time | Child selection, school, teacher, exact scheduling |
| **Where it goes** | New `/trialLeads` Firestore collection | Existing `/bookings` collection |
| **Admin workflow** | Contact lead → create parent+student accounts → then booking flow | Review → approve → convert to lesson |
| **Student exists?** | No | Yes |
| **Account exists?** | No | Yes |

##### Booking Type Enum Update
The existing `BookingType` enum (`trial` | `regular`) is **kept as-is** for portal bookings. A portal parent CAN still request a trial for a new instrument — that's a valid portal booking.

The public website trial lead is a SEPARATE entity (`TrialLead`), not a `Booking`. The flow is:
1. Public website → `TrialLead` created (unauthenticated)
2. Admin contacts lead → creates parent account + student record
3. Admin creates portal `Booking` (type=trial) → normal flow

##### Data Model for Trial Leads (Phase 20)
```typescript
interface TrialLead {
  id: string;
  // Contact info (from public form)
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  // Interest
  childName: string;
  childAge?: number;
  instrumentInterest: string;
  preferredSchedule?: string; // free text: "mornings", "weekends", etc.
  message?: string;
  // Admin tracking
  status: 'new' | 'contacted' | 'converted' | 'declined';
  adminNotes?: string;
  createdAt: number;
  convertedToParentId?: string; // once admin creates the parent account
}
```

#### 4. Phase Impact Summary

| Phase | Status | Change Needed |
|-------|--------|---------------|
| **Phase 9** | COMPLETED | Needs **Phase 9.1 patch**: add Edit button to UserManagement, add parentId generation |
| **Phase 14** | COMPLETED | **No code change needed** — portal booking stays as-is. Only DECISIONS.md clarified. |
| **Phase 20** | NOT STARTED | Add TrialLead entity, public trial form, admin lead management page |
| **Phase 11** | COMPLETED | Needs **Phase 9.1 patch**: add parentId field to Parent interface/creation |

### Revised Phase Descriptions

#### Phase 9.1 — Admin Enhancements + ID System (NEW — patch phase)
**Goal:** Add user edit capability and human-readable ID system
**Scope:**
1. UserManagement.tsx: Add Edit button beside Delete for each user
2. Edit modal: role-appropriate fields (name, email, + role-specific)
3. Parent interface: add `parentId?: string` field
4. Parent creation (addUser for role=parent, ParentOnboarding): generate `PAR-NNN` via counter
5. Private student creation: detect no-school → generate `PV-NNN` via counter
6. Admin views: show parentId in parent rows, show student ID prominently
**Files to update:** types.ts, context/AppContext.tsx, pages/admin/UserManagement.tsx
**Files to avoid:** All financial, lesson, attendance, evaluation, export files
**Risk:** LOW — purely additive UI + one new optional field on Parent

#### Phase 14 — Booking and Calendar Foundations (NO CODE CHANGE)
**Clarification only:** Phase 14's portal booking system is confirmed as the flow for EXISTING families. The `trial` booking type in the portal is for existing parents requesting a trial for a new instrument/child — this is valid and stays.

Public-facing trial lead capture is explicitly OUT OF SCOPE for Phase 14 — it belongs in Phase 20.

#### Phase 20 — Public Website Shell (UPDATED SCOPE)
**Original scope:** Public marketing website, course catalog, brand identity
**Added scope:**
1. `TrialLead` entity + `/trialLeads` Firestore collection
2. Public trial request form (unauthenticated) — name, phone, email, instrument, schedule preference
3. Admin lead management page: view leads, mark contacted/converted/declined
4. Lead-to-booking pipeline: admin converts lead → creates parent + student → creates booking
5. Firestore rules for `/trialLeads`: public create (no auth required), admin read/write only
**Risk:** Public write to Firestore requires rate limiting / abuse protection (reCAPTCHA or Cloud Function gatekeeper)

### Booking System Decisions (Phase 14)

#### Booking Entity — Separate from Lesson
- `Booking` is a NEW Firestore collection (`/bookings/{bookingId}`), completely separate from `/lessons`
- A booking represents a *request* — it is NOT a lesson until explicitly converted by admin
- This preserves all existing lesson/financial logic untouched
- Booking lifecycle: `pending` → `approved` → `converted` (or `rejected`/`cancelled`)

#### Booking → Lesson Conversion
- `convertBookingToLesson` reuses `addLesson` from AppContext
- This guarantees schoolRate is computed server-side (same Phase 10 logic)
- teacherRate is computed from teacher profile at conversion time
- Admin must assign teacher + school before conversion is allowed
- No duplicate financial calculation paths — single `addLesson` entry point

#### Manual-First Design
- No auto-conversion, no auto-assignment, no auto-scheduling
- Admin reviews every booking, assigns teacher/school, approves, then converts
- Parents can submit requests but cannot self-approve
- Teachers see assigned bookings read-only (no approval power)
- This matches DECISIONS.md "build manual-first booking flow now; design for future automation"

#### Booking Visibility by Role
- **Admin:** Full CRUD on all bookings, sees adminNotes
- **Teacher:** Read-only on own bookings (where teacherId matches). No adminNotes visible.
- **Parent:** Create new requests + read own bookings. No adminNotes, no reviewedBy visible.
- **Student:** No booking access (Phase 14)
- **School Admin:** No booking access (Phase 14)

#### Booking Types
- `trial` — trial lesson request (from new parent or existing parent for new instrument)
- `regular` — regular lesson request (e.g. parent wants to add a session)
- Stored as string enum, not boolean, for future extensibility

#### Firestore Rules for Bookings
- Admin: full read/write
- Teacher: read own (where teacherId matches resource)
- Parent: read own requests (where requestedBy matches) + create (where requestedBy matches)
- Default deny for all other roles

#### AppContext Booking Listener Scoping
- Admin: `collection(db, 'bookings')` — sees all
- Teacher: `where('teacherId', '==', user.id)` — sees only assigned
- Parent: `where('requestedBy', '==', user.id)` — sees only own requests
- Student/SchoolAdmin: no listener (bookings array stays empty)

#### No Financial Impact
- Phase 14 does NOT modify any financial calculation, rate logic, or export logic
- The only financial interaction is at conversion time, where existing `addLesson` handles everything
- No changes to Dashboard, Financials, TeacherFinance, excelExport, or financialCalculations

### Evaluation Expansion Decisions (Phase 13)

#### New Lesson Fields
- Added 4 optional fields to `Lesson` interface: `overallGrade`, `repertoire`, `practiceAssignment`, `examPrepStatus`
- All fields are optional strings — existing lessons unaffected (no migration needed)
- `examPrepStatus` uses predefined values: "Not started", "Preparing", "Ready", "Completed" (stored as string, not enum — flexible for future additions)

#### Attendance Form Updates
- Teacher Attendance page gets 4 new form fields in the Evaluation section
- Fields are only saved to Firestore if non-empty (spread conditionally in addLesson call)
- `overallGrade`: free text input (e.g. "Grade 3", "Beginner", "Advanced")
- `examPrepStatus`: dropdown select with N/A default
- `repertoire`: free text input for piece being studied
- `practiceAssignment`: textarea for homework/practice tasks
- Form resets `repertoire` and `practiceAssignment` after submit (alongside existing `learning`/`notes` reset)

#### Visibility Rules for New Fields
- **Admin:** Full access (all 4 fields visible)
- **Teacher:** Full access (all 4 fields visible — they create these)
- **Parent:** All 4 fields visible — parents see their child's evaluation details live
- **Student:** All 4 fields visible — students see their own evaluation details
- **School Admin:** All 4 fields visible (no financial sensitivity)
- This matches the existing interactivity/behavior/learning visibility pattern
- `notes` remains ADMIN+TEACHER only (unchanged)

#### Permission Service Update
- `filterLessonFields` for PARENT/STUDENT whitelist extended with all 4 new fields
- School admin and teacher paths inherit the fields naturally (they get everything except the other side's financial field)

#### No Financial Impact
- Phase 13 does NOT touch any financial logic (rates, calculations, exports)
- No changes to AppContext listeners, Firestore rules, or data isolation logic
- Purely additive UI/data changes

### Duration Fix (H1 from Phase 9.5)
- Fixed `lesson.duration` → `(lesson.durationMinutes || 60) / 60` in calculateGroupLessonFinancials and calculateLessonFinancials
- Previous behavior: every lesson defaulted to 1 hour regardless of actual duration
- New behavior: uses actual durationMinutes, with 60min fallback for legacy records
- This fixes financial calculations for non-60-minute lessons

### Dead Code Cleanup (L2)
- Deleted `src/firebaseConfig.ts` — confirmed zero imports, dead duplicate of config in AppContext

## Final Architecture Lock (Phase 6.5)

### Conflict Analysis — Issues Found and Resolved

#### CONFLICT 1: Student.schoolId is singular but students can be at multiple schools
- types.ts has `schoolId: string` (singular)
- Decision says students can be at school AND enrolled in private online lessons
- RESOLUTION: Change Student to `schoolIds: string[]` in Phase 11
- Migration: existing `schoolId` value migrated to `schoolIds: [schoolId]`
- All queries using `schoolId` on students must be updated to array-contains
- This is a BREAKING CHANGE that must be handled with a migration script

#### CONFLICT 2: Student.teacherId is singular but students could have multiple teachers
- types.ts has `teacherId: string` (singular)
- A student at a school with one instrument teacher + private online lessons with another teacher would need multiple teacherIds
- RESOLUTION: Keep singular `teacherId` for now (primary teacher)
- Add optional `additionalTeacherIds?: string[]` when multi-teacher scenarios are confirmed
- For Phase 11: private online students get their own Student document with their online teacherId

#### CONFLICT 3: Guarantee logic duplicated in 4 places (per Phase 3 finding)
- financialCalculations.ts, Financials.tsx, Dashboard.tsx, and TeacherFinance.tsx all compute guarantees
- Decision says consolidate into services/guaranteeService.ts in Phase 7
- RESOLUTION: Phase 7 creates guaranteeService.ts with the SINGLE correct implementation
- All 4 locations call the service — no inline guarantee math anywhere
- Financial exports must produce identical numbers before and after

#### CONFLICT 4: Firebase imports are CDN-based but Vite is the bundler
- AppContext.tsx imports from `https://www.gstatic.com/firebasejs/10.8.0/*.js`
- index.html has an importmap loading React from `esm.sh`
- Vite is configured as the bundler
- Decision says keep CDN for now (too risky to migrate mid-project)
- RESOLUTION: Keep CDN imports exactly as-is through Tiers 1-3
- Phase 21 (Branding + Polish) is the safe point to migrate to npm imports
- Until then: do NOT add any npm Firebase packages that would conflict

#### CONFLICT 5: Student Portal age-range privacy
- Students aged 5-15 + adults
- Under-13 requires COPPA-like protections
- Student portal was planned for Phase 11
- RESOLUTION: Phase 11 builds parent portal FIRST, student portal SECOND
- Under-13 students: parent manages their account, student portal is read-only view
- 13+ students: can have full student portal access
- Adults: act as their own parent (single account, dual view)
- Student age field must be added to Student interface: `dateOfBirth?: string`

#### CONFLICT 6: "Reschedule requires approval from all parties" vs simplicity
- Decision says reschedule needs alignment from admin + teacher + parent
- This is a complex multi-party approval workflow
- RESOLUTION: Phase 14 implements SIMPLE reschedule (request → admin approves)
- Multi-party approval is deferred to Phase 18 (Notifications) when all parties can be notified
- Initial flow: parent/teacher requests → admin approves → lesson updated

#### CONFLICT 7: B2B parent sees "lessons remaining" — but no course/package entity exists yet
- Parent portal shows "lessons taken and remaining in course"
- No Course or Package entity is defined in the data model
- RESOLUTION: Add Enrollment entity in Phase 11
- Enrollment { studentId, schoolId, totalLessons, instrument, startDate, status }
- "Remaining" = totalLessons - count of completed lessons for that enrollment
- B2C version uses same entity with paymentStatus tracking

### Confirmed Assumptions (all verified against DECISIONS.md)

1. ✅ Roles: admin, teacher, parent, student, school_admin — lowercase, single role per user for now
2. ✅ Auth: Firebase Auth (email/password + Google) — no change
3. ✅ Database: Cloud Firestore — no change
4. ✅ Hosting: Firebase Hosting — vercel.json to be removed in Phase 8
5. ✅ Financial snapshot: teacherRate + schoolRate frozen at lesson creation time — no change
6. ✅ Guarantee logic: school guarantees (revenue) + teacher guarantees (payroll) — preserve exactly
7. ✅ Lesson ID format: SS-TT-NNNN using counters — no change
8. ✅ Rate hierarchy: school default → school per-teacher override → teacher per-school override → group variants
9. ✅ Cancelled/Excused lessons: rates = 0 — no change
10. ✅ Teacher pay: monthly per hour — upgradable but not changed now
11. ✅ Multi-region: planned but not implemented — no hardcoded single-tenant assumptions
12. ✅ Online lessons: Zoom, auto-generated links, different rates — Phase 16
13. ✅ WhatsApp: high priority, via Business API — Phase 18
14. ✅ Arabic: later, English first — Phase 21

### Updated Firestore Collections (Final)

Existing (do not modify structure unless specified):
- /users/{uid} — profile + role + optional schoolId
- /schools/{schoolId} — school data + adminIds[] + rates + guarantees
- /teachers/{uid} — teacher profile + rates + guarantees
- /students/{studentId} — student data + optional uid, parentIds[], schoolIds[]
- /lessons/{lessonId} — lesson records + evaluation fields + optional deliveryMode
- /counters/{key} — sequence counters

New (added incrementally per phase):
- /parents/{uid} — parent profile + childIds[] (Phase 11)
- /enrollments/{id} — course/package enrollment per student (Phase 11)
- /messages/{id} — parent-teacher messages (Phase 11)
- /bookings/{bookingId} — trial/booking requests (Phase 14)
- /schedules/{teacherId} — teacher weekly timetable (Phase 15)
- /onlineSessions/{id} — Zoom/Meet session records (Phase 16)
- /invoices/{id} — generated invoices (Phase 17)
- /payments/{id} — payment records (Phase 17)
- /notifications/{id} — notification records (Phase 18)
- /materials/{id} — uploaded files metadata (Phase 19)
- /practiceLogs/{id} — student practice records (Phase 19)

### Updated Implementation Phases (7+) — Final Locked Version

#### Phase 7 — Role System Foundations
Scope: Fix security bugs, extend types, create permission service, consolidate guarantee logic
Files to modify: types.ts, firestore.rules, context/AppContext.tsx
Files to create: services/permissionService.ts, services/guaranteeService.ts, components/RoleGuard.tsx
Files to delete: pages/LessonLog.tsx.bak, pages/LessonLog_OLD.tsx
Risk: MEDIUM
Touches financials: YES (guarantee consolidation — must produce identical output)
Deploy: Firestore rules to console after testing

#### Phase 8 — Portal Route Structure + React Router
Scope: Replace useState page navigation with React Router, create layout shells
Files to modify: App.tsx (major rewrite), components/Sidebar.tsx, index.html (cleanup)
Files to create: routes/index.tsx, layouts/AuthLayout.tsx, layouts/PublicLayout.tsx, components/ProtectedRoute.tsx, components/RoleRedirect.tsx
Files to delete: vercel.json
Package: npm install react-router-dom
Risk: HIGH (navigation rewrite)
Touches financials: NO

#### Phase 9 — Admin Portal Consolidation
Scope: Organize existing admin pages under /admin routes, add user management + parent onboarding
Files to modify: routes/index.tsx, components/Sidebar.tsx
Files to create: pages/admin/UserManagement.tsx, pages/admin/ParentOnboarding.tsx
Risk: LOW
Touches financials: NO

#### Phase 10 — Teacher Portal
Scope: Teacher-specific dashboard, field filtering, profile self-edit
Files to modify: pages/LessonLog.tsx (hide schoolRate for teachers), pages/TeacherFinance.tsx, components/Sidebar.tsx
Files to create: pages/teacher/TeacherDashboard.tsx, pages/teacher/TeacherProfile.tsx, services/lessonService.ts
Risk: LOW-MEDIUM
Touches financials: NO (display filtering only, underlying data unchanged)

#### Phase 11 — Parent + Student Portals
Scope: Parent entity, parent-student linkage, enrollment entity, parent portal, student portal, B2B/B2C visibility split
Data changes: Create /parents, /enrollments, /messages collections. Add uid + parentIds + schoolIds to Student.
Files to create: ~10 new files (parent pages, student pages, parentService.ts)
Files to modify: types.ts, firestore.rules, context/AppContext.tsx (add parent/student listeners)
Migration: Existing students get schoolIds:[schoolId] backfill, empty parentIds:[]
Risk: MEDIUM-HIGH (new data model, privacy-critical)
Touches financials: NO

#### Phase 12 — School Admin Layer
Scope: school_admin role, school-scoped views, school dashboard + reports
Data changes: Add adminIds[] to school docs, schoolId to user docs
Files to create: pages/school/SchoolDashboard.tsx, SchoolLessons.tsx, SchoolReports.tsx, services/schoolAdminService.ts
Files to modify: firestore.rules, types.ts
Risk: MEDIUM
Touches financials: NO (read-only views of existing financial data)

#### Phase 13 — Evaluations and Progress Expansion
Scope: New evaluation fields, running average computation, progress trends
Data changes: Add optional fields to Lesson (overallGrade, repertoire, practiceAssignment, examPrepStatus, dateOfBirth to Student)
Files to modify: types.ts, pages/Attendance.tsx (form), pages/parent/ChildProgress.tsx, pages/student/MyProgress.tsx
Files to create: pages/admin/EvaluationOverview.tsx, services/progressService.ts
Risk: LOW (additive — existing lessons with missing fields display as before)
Touches financials: NO

#### Phase 14 — Booking and Calendar Foundations
Scope: Booking entity, trial request flow, admin booking management, parent request form
Data changes: Create /bookings collection
Files to create: services/bookingService.ts, pages/admin/BookingManagement.tsx, pages/parent/TrialRequest.tsx
Risk: MEDIUM
Touches financials: NO

#### Phase 15 — Scheduling Engine
Scope: Teacher timetable, auto-generation of recurring lessons, reschedule flow
Data changes: Create /schedules collection
Files to create: services/schedulingService.ts, pages/admin/ScheduleManager.tsx, pages/teacher/MySchedule.tsx
Risk: HIGH (auto-generates lessons — directly affects financial data)
Touches financials: YES (auto-generated lessons must use identical rate logic to Attendance.tsx)

#### Phase 16 — Online Lesson Architecture
Scope: deliveryMode field, Zoom integration, online rates, Cloud Functions setup
Data changes: Add deliveryMode to Lesson, defaultOnlineRate to School, /onlineSessions collection
Files to create: services/onlineLessonService.ts, functions/createZoomMeeting.ts (Cloud Function)
Risk: MEDIUM (first Cloud Functions usage, external API)
Touches financials: YES (online rates)

#### Phase 17 — Payment / Invoice Architecture
Scope: Invoice generation, payment records, B2B/B2C billing, payment link generation (manual gateway)
Data changes: Create /invoices, /payments collections
Files to create: services/invoiceService.ts, services/paymentService.ts, pages/admin/InvoiceManager.tsx, pages/parent/PaymentHistory.tsx
Risk: HIGH (financial data)
Touches financials: YES (invoice = aggregated financial view — must match existing export logic)

#### Phase 18 — Notifications and Automations
Scope: In-app notifications, email, WhatsApp integration, multi-party reschedule approval
Data changes: Create /notifications collection, add notification preferences to users
Files to create: services/notificationService.ts, functions/notificationTriggers.ts, components/NotificationBell.tsx
Risk: MEDIUM (external APIs)
Touches financials: NO

#### Phase 19 — File Sharing and Practice Tracking
Scope: Firebase Storage for materials, teacher upload UI, student/parent download, practice logs
Data changes: Create /materials, /practiceLogs collections
Files to create: services/storageService.ts, pages/teacher/MaterialUpload.tsx, pages/student/Materials.tsx, pages/student/PracticeLog.tsx
Risk: LOW
Touches financials: NO

#### Phase 20 — Public Website Shell
Scope: Home, About, Instruments catalog, Contact, Trial form (connects to bookings)
Files to create: ~8 pages under pages/public/
Files to modify: routes/index.tsx, layouts/PublicLayout.tsx
Risk: LOW (isolated from portal)
Touches financials: NO

#### Phase 21 — Branding, i18n, Build Cleanup
Scope: Brand identity, CDN→npm migration, Tailwind Vite plugin, security headers, i18n setup
Files to modify: index.html (major cleanup), vite.config.ts, firebase.json, package.json
Risk: MEDIUM (build chain changes)
Touches financials: NO

#### Phase 22 — Multi-Region Preparation
Scope: regionId field on schools/teachers/students, admin region filter
Risk: LOW
Touches financials: NO

#### Phase 23 — Premium Features
Scope: Certificates, teacher analytics, video recording, payment gateway integration
Risk: LOW-MEDIUM (gateway integration is medium)
Touches financials: YES (gateway integration)

#### Phase 24 — Final Review + Production Hardening
Scope: Full security re-audit, performance, error boundaries, monitoring, backup, CI/CD
Risk: LOW
Touches financials: Audit only

### Key Risks Summary

1. HIGHEST RISK: Phase 8 (React Router migration) — replaces the entire navigation system
2. HIGH RISK: Phase 15 (Scheduling engine) — auto-generates lessons that affect financial calculations
3. HIGH RISK: Phase 17 (Payment) — new financial logic must be consistent with existing snapshot model
4. MEDIUM RISK: Phase 7 (Firestore rules deployment) — could break access for existing users
5. MEDIUM RISK: Phase 11 (Student model change) — schoolId→schoolIds migration affects queries
6. MEDIUM RISK: Phase 21 (Build chain cleanup) — CDN→npm could break imports

### Missing Decisions Still Needed (not blocking Phase 7, but needed before their phase)

1. Phase 11: What is the course/package structure for B2C? Fixed number of lessons? Monthly subscription? (Needed for Enrollment entity)
2. Phase 15: How far in advance should lessons be auto-generated? 1 week? 4 weeks? Entire semester?
3. Phase 16: Zoom plan level? (Free has 40-min limit for group calls — may affect group online lessons)
4. Phase 17: Which payment gateway? (Mada, Apple Pay, Tamara, HyperPay are common in Saudi market)
5. Phase 18: Which WhatsApp Business API provider? (Twilio, MessageBird, direct Meta API)

## Phase 7 Decisions (2026-03-22)

### Changes Made
1. **Role enum extended** — Added PARENT, STUDENT, SCHOOL_ADMIN to `types.ts` Role enum
2. **Firestore rules fixed** — Changed 'Admin'→'admin', 'Teacher'→'teacher' to match DB values; added helper functions for all 5 roles; added teacher access to counters collection; added placeholder rules for future collections (bookings, invoices, notifications)
3. **AppContext stale closure fix** — Changed `startListeners()` to `startListeners(user: User | null)` to pass the authenticated user directly instead of reading from stale `state.currentUser` (which was always null due to useCallback closure)
4. **Teacher data scoping** — Teachers now query only their own teacher doc (`__name__` filter), their own students (`teacherId` filter), and their own lessons (`teacherId` filter)
5. **Permission service created** — `services/permissionService.ts` with `canAccess()`, `filterLessonFields()`, `filterTeacherFields()`, `filterSchoolFields()` implementing field-level security
6. **RoleGuard component created** — `components/RoleGuard.tsx` wrapper for role-based UI access control
7. **loadTestScenario guarded** — Disabled in production via `import.meta.env.PROD` check
8. **Dead files deleted** — Removed `LessonLog.tsx.bak` and `LessonLog_OLD.tsx`
9. **tsconfig updated** — Added `"vite/client"` to types array for `import.meta.env` support

### Key Decisions
- **Guarantee consolidation DEFERRED** — Moving inline guarantee logic from Dashboard/Financials/TeacherFinance into a shared service was deferred from Phase 7 to avoid touching financial logic during security overhaul. Will revisit in Phase 13 (Evaluations and progress expansion).
- **Teacher sees own teacher doc only** — Used `where('__name__', '==', user.id)` to filter teacher collection by document ID (since teacher doc ID = user auth ID)
- **Students scoped for teachers** — Teachers now only see students where `teacherId == user.id`. This was previously unfiltered (all teachers saw all students).
- **Field filtering is app-layer** — Firestore rules handle document-level access; field stripping (e.g., hiding schoolRate from teachers) is done in the permission service at the app layer, not in Firestore rules (Firestore doesn't support field-level rules).

### What Was NOT Changed (intentionally)
- Financial calculation logic (Financials.tsx, Dashboard.tsx, TeacherFinance.tsx, financialCalculations.ts) — untouched
- Attendance/lesson creation logic (Attendance.tsx) — untouched
- Rate hierarchy logic — untouched
- UI/portal structure — deferred to Phase 8+

## Phase 8 Decisions (2026-03-22)

### Changes Made
1. **React Router added** — `react-router-dom@6.30.3` installed via npm. Added to importmap in index.html for dev mode consistency.
2. **App.tsx rewritten** — Replaced `useState('dashboard')` + `renderPage()` switch pattern with `<Routes>/<Route>` tree. Created `PortalLayout`, `AdminRoutes`, `TeacherRoutes` helper components. Removed duplicate `AppProvider` wrapping (was double-wrapped with index.tsx).
3. **Sidebar.tsx rewritten** — Removed `currentPage`/`setPage` props. Now uses `useNavigate()` + `useLocation()` from React Router. Role-aware portal prefix determines URLs. Active page detection uses `location.pathname`.
4. **index.tsx updated** — Added `BrowserRouter` wrapping inside `AppProvider`. Kept single `AppProvider` (removed duplicate from App.tsx).
5. **index.html cleaned** — Removed duplicate `<script>` tag (lines 54-55). Added react-router-dom to importmap.
6. **ProtectedRoute created** — `components/ProtectedRoute.tsx` — redirects to `/login` when not authenticated.
7. **RoleRedirect created** — `components/RoleRedirect.tsx` — redirects to correct portal based on user's role.
8. **PlaceholderPage created** — `pages/placeholders/PlaceholderPage.tsx` — "Coming Soon" for unbuilt portals.
9. **vercel.json deleted** — Per Phase 6.5 decision: use Firebase Hosting only.

### Route Structure Implemented
```
/login              → Login (public)
/                   → RoleRedirect (→ /admin/dashboard or /teacher/dashboard etc.)
/admin/dashboard    → Dashboard
/admin/finance      → Financials
/admin/lessons      → LessonLog
/admin/config       → Configuration
/teacher/dashboard  → Dashboard
/teacher/students   → MyStudents
/teacher/attendance → Attendance
/teacher/finance    → TeacherFinance
/teacher/lessons    → LessonLog
/parent/*           → PlaceholderPage (Phase 11)
/student/*          → PlaceholderPage (Phase 11)
/school/*           → PlaceholderPage (Phase 12)
*                   → Redirect to /
```

### Key Decisions
- **react-router-dom v6 (not v7)** — v7 is the Remix merger with a different API pattern. v6 is stable, well-documented, and sufficient for this project's needs.
- **CDN + npm dual install** — Installed via npm for Vite bundling + TypeScript types. Added to importmap for dev mode browser resolution.
- **Wrong-portal access → redirect (not Access Denied)** — When a teacher navigates to `/admin/finance`, they are redirected to `/teacher/dashboard` via RoleRedirect fallback on RoleGuard. Better UX than a dead end.
- **Double AppProvider bug fixed** — index.tsx AND App.tsx both wrapped in AppProvider. Removed from App.tsx. All useApp() calls now use the single provider from index.tsx.
- **Page components NOT moved** — Existing page files stay in `/pages/`. Restructuring to `/pages/admin/`, `/pages/teacher/` etc. deferred to Phase 9+ when new pages are created.
- **SPA rewrite already configured** — firebase.json has `"source": "**", "destination": "/index.html"` rewrite. No changes needed for direct URL access.

### What Was NOT Changed (intentionally)
- All 7 page components (Dashboard, Financials, LessonLog, Configuration, Attendance, MyStudents, TeacherFinance) — zero changes
- context/AppContext.tsx — untouched
- Financial logic — untouched
- Attendance logic — untouched
- Firestore rules — untouched

---

## Phase 9.1 — Admin Enhancements + ID System (2026-03-23)

### What Was Implemented

1. **Parent ID generation (PAR-NNN)**
   - When a parent user is created via `addUser`, a human-readable `parentId` (e.g., PAR-001) is generated using `reserveCounterRange('parents', 1)` — atomic, no duplicates.
   - Stored on the Parent document as `parentId` field (optional, for backward compat with existing parents).
   - Displayed read-only in the Edit modal.

2. **Private student ID (PV-NNN)**
   - When `addStudent` is called with no `schoolId`, the student gets a PV-NNN ID instead of the usual SS-NNNN format.
   - Uses `reserveCounterRange('students_PV', 1)` counter key.
   - The schoolId validation guard was removed to allow private (no-school) students.

3. **Edit button + modal in UserManagement**
   - Edit button added beside Delete for every user row.
   - Modal shows role badge (read-only — role change requires delete + recreate).
   - Editable fields: name, email (display only, not Firebase Auth).
   - Teacher-specific: instrument field (with note pointing to Configuration for rates).
   - School Admin-specific: school picker dropdown.
   - Parent-specific: read-only parentId, read-only linked children list.
   - Uses existing `updateUser` from AppContext (already supports teacherData merge).

### Design Decisions

- **Role is NOT editable** — changing a role has cascading effects (permissions, portal access, linked entities). Safer to delete + recreate.
- **Email edit is display-only** — Firebase Auth email requires a separate server-side update. The User doc email is updated but the login email stays the same. This is noted in the UI.
- **parentId is optional** — existing parents created before Phase 9.1 won't have it. It only applies to newly created parents going forward.
- **PV-NNN counter is separate** — uses `students_PV` counter key to avoid collision with school-based student counters.

### What Was NOT Changed (intentionally)
- Financial logic — untouched
- Attendance logic — untouched
- Firestore rules — untouched (parent doc already writable by admin)
- Configuration.tsx — remains the detailed teacher/school/student editor
- Booking system — untouched

### Files Modified
- `types.ts` — added `parentId?: string` to Parent interface
- `context/AppContext.tsx` — parentId generation in addUser, PV-NNN branch in addStudent
- `pages/admin/UserManagement.tsx` — added Edit button, edit modal, updateUser integration

---

## Roadmap Update — Professional Export & Report Improvements (2026-03-23)

### Context
Exports and PDF reports are used today by admins, teachers, and will be shared with schools and parents. The current implementations are functional but lack polish, have broken property references, and don't meet professional presentation standards.

### New Confirmed Requirements

#### R1: Excel Export Visual & Structural Improvements (all exports)
- Freeze first row (header row always visible when scrolling)
- Freeze first column where appropriate (e.g., School Name, Teacher Name, Lesson ID)
- Better column spacing and auto-fit based on content
- Branded header styling: ARTickle color scheme (dark header, lime-green accent)
- Cleaner number formatting (SAR currency, hours with 2 decimals)
- All exports: consistent professional look

#### R2: Lesson Excel Export — Color-Coded Statuses
- Status column must use cell background colors:
  - `Present` / `Taught` → green background, white text
  - `Absent (Excused)` → orange background, white text
  - `Absent (Unexcused)` → yellow background, black text
  - `Cancelled` → red background, white text
- Note: `getStatusColor()` already exists in `excelExport.ts` but is DEAD CODE (never applied). Must wire it up.
- The lesson log export in `excelExport.ts` (function `exportLessonLog`) also has 5 broken property references (KNOWN_ERRORS M2) — these must be fixed as part of this phase.

#### R3: PDF Lesson Report — Professional Upgrade
- Use the actual ARTickle logo from `/public/logo.png` (currently draws a circle placeholder)
- Include Phase 13 evaluation fields: overallGrade, repertoire, practiceAssignment, examPrepStatus
- Professional layout improvements: better spacing, section dividers, cleaner typography
- Role-aware content: decide which fields are visible per audience (admin sees financials, parent does not)
- Footer with ARTickle branding and confidentiality notice (partially exists)
- Suitable for sharing with schools, parents, and admins

### Design Decisions

1. **New Phase 14.1 — Professional Export & Report Improvements**
   - Self-contained scope: export formatting + PDF generation only
   - Does NOT change financial calculation logic (rates, guarantees, aggregation)
   - Does NOT change what data is exported — only HOW it looks
   - Placed after Phase 14, before Phase 15, in Tier 3

2. **Fix KNOWN_ERRORS M2 as natural side effect**
   - The lesson log export (`exportLessonLog`) references `l.time`, `l.studentName`, `l.minHours`, `l.chargedHours`, `l.createdAt` — none exist on the Lesson type
   - Phase 14.1 will fix these mappings: `l.time` → extract from `l.date`, `l.studentName` → `l.studentNames.join(', ')`, remove non-existent computed fields or replace with actual data

3. **SheetJS styling requires xlsx-style or sheetjs-style plugin**
   - The community SheetJS build loaded via CDN (`window.XLSX`) does NOT support cell styling (fill, font color, freeze panes) out of the box
   - Options: (a) switch to sheetjs-style fork, (b) use xlsx-populate, (c) use ExcelJS
   - Decision: Evaluate at implementation time. If CDN SheetJS supports `!freeze` and basic styling, use it. If not, add ExcelJS via CDN or npm.
   - CONSTRAINT: Must not break the existing CDN-based loading pattern (no npm-only dependencies unless also CDN-available)

4. **Logo embedding in PDF**
   - jsPDF supports `doc.addImage()` with base64 or URL
   - The logo at `/public/logo.png` can be loaded as base64 at build time or fetched at runtime
   - Preferred: convert logo to base64 constant to avoid async fetch during PDF generation

5. **Role-aware PDF content**
   - Admin PDF: all fields including financial rates
   - Teacher PDF: all fields including own rate, no school rate
   - Parent/Student PDF: lesson info, evaluation, notes — NO financial fields
   - This aligns with existing `permissionService.ts` field filtering

6. **Export function refactoring approach**
   - Keep existing function signatures (exportSchoolInvoice, exportPayroll, exportLessonLog, lessonsToExcel, etc.)
   - Add shared styling helpers (applyHeaderStyle, applyFreeze, applyStatusColor)
   - Do NOT merge the two export files — they serve different purposes

### Phase Impact Summary

| Phase | Impact |
|-------|--------|
| **14.1 (NEW)** | Primary phase — all export/report improvements |
| **17 (Payment/Invoice)** | Benefits from clean export foundation — no changes needed now |
| **13 (Evaluations)** | Already complete — Phase 14.1 adds missing eval fields to PDF |
| **24 (Final cleanup)** | No longer needs to address export polish |

### Likely File Impact (Phase 14.1)

| File | Change Type | Description |
|------|-------------|-------------|
| `services/excelExport.ts` | MODIFY | Add freeze panes, branded header styling, wire up status colors, fix broken `exportLessonLog` property refs (M2) |
| `services/exportUtils.ts` | MODIFY | Add freeze panes, branded headers, better column widths to `downloadExcel`, `lessonsToExcel`, `financialsToExcel`, `studentsToExcel` |
| `pages/LessonLog.tsx` | MODIFY | Upgrade `generatePDF()` — embed real logo, add Phase 13 fields, role-aware content |
| `assets/logoBase64.ts` (NEW) | CREATE | Base64-encoded logo constant for PDF embedding |
| `services/exportStyles.ts` (NEW, maybe) | CREATE | Shared styling helpers if needed (freeze, header style, status colors) |

### Files NOT Touched
- `context/AppContext.tsx` — no data changes
- `types.ts` — no type changes
- `firestore.rules` — no security changes
- Financial calculation logic — untouched
- Attendance logic — untouched
- All portal pages except LessonLog.tsx — untouched

### Risks / Notes
- **SheetJS styling limitation** — The free community build may not support cell styling. Must verify before implementation. If it doesn't, will need ExcelJS or a styled fork. This is the main technical risk.
- **Logo file size** — Base64 logo adds to bundle size. Keep it small (< 50KB).
- **No financial logic changes** — This phase is presentation-only. Numbers must remain identical before and after.
- **Backward compatibility** — Export filenames and function signatures stay the same. Any page calling these functions continues to work without changes.

## Phase 15 Decisions — Scheduling Engine + DeliveryMode (2026-03-24)

### DeliveryMode as First-Class System Field
- `DeliveryMode` enum: `IN_PERSON = 'in_person'`, `ONLINE = 'online'`
- Added to `Lesson` as optional field (backward compat) — but all NEW lessons MUST have it
- Centralized `getDeliveryMode(lesson)` helper — ALL reads must use this, never direct property access
- Safety net in `addLesson()`: defaults to `IN_PERSON` with `console.warn` if missing
- Displayed in all portal pages via delivery mode badge
- Added to Excel/CSV exports as "Delivery Mode" column
- Added to PDF lesson reports

### Phase Discipline for DeliveryMode
- Phase 15: STORE and DISPLAY only — zero financial logic changes
- Phase 16: ADD configuration (supportsOnline, online rates) — zero financial logic changes
- Phase 17: ONLY phase that changes rate computation to branch on deliveryMode

### Snapshot Rule
Every lesson snapshots at creation: deliveryMode, teacherRate, schoolRate, durationMinutes, type. NEVER retroactively recomputed.

### TimetableSlot Entity
- New Firestore collection: `/timetableSlots/{slotId}`
- Fields: teacherId, teacherName, studentIds, studentNames, schoolId, schoolName, instrument, dayOfWeek, startTime, endTime, durationMinutes, type, deliveryMode, isActive, notes, createdAt
- Admin: full CRUD. Teacher: read-only (own slots).
- `isActive` flag enables pause/resume without deletion

### Lesson Generation Logic
- `generateLessonsFromTimetable(startDate, endDate)`: generates lessons for all active slots within range
- Max 12 weeks (84 days) per generation run
- Duplicate detection: `teacherId + date(YYYY-MM-DD) + studentIds` composite key
- Reuses `addLesson()` to preserve financial snapshot logic (schoolRate computed server-side)
- teacherRate computed client-side with same logic as Attendance.tsx
- Sequential writes (not parallel) to avoid Firestore contention
- Status defaults to `Present` for generated lessons

### Reschedule Foundation
- NO reschedule request entity in Phase 15
- `isActive` flag on TimetableSlot enables pause/resume
- Individual lesson date edits use existing `updateLesson()`
- Full reschedule request/approval flow deferred to Phase 18 (Notifications)

### Files Created
- pages/admin/ScheduleManager.tsx — admin timetable CRUD + lesson generation
- pages/teacher/MySchedule.tsx — teacher read-only weekly view

### Files Updated
- types.ts — DeliveryMode enum, getDeliveryMode helper, TimetableSlot interface, deliveryMode on Lesson + Booking, timetableSlots on AppState
- context/AppContext.tsx — timetable listener, CRUD, generateLessonsFromTimetable, deliveryMode safety net in addLesson, deliveryMode in booking→lesson conversion
- firestore.rules — timetableSlots collection rules
- services/permissionService.ts — timetableSlots resource, deliveryMode in parent/student filter
- pages/Attendance.tsx — deliveryMode dropdown (required, visible)
- pages/LessonLog.tsx — Mode column + PDF delivery mode
- pages/student/StudentLessons.tsx — delivery mode badge
- pages/parent/ChildProgress.tsx — delivery mode badge
- pages/school/SchoolLessons.tsx — Mode column
- services/exportUtils.ts — Delivery Mode column in CSV + Excel
- App.tsx — schedule routes
- components/Sidebar.tsx — Schedule nav items

### Files NOT Touched (intentionally)
- Financial calculation functions (calculateTeacherEarnings, calculateSchoolRevenue, calculateLessonFinancials, calculateGroupLessonFinancials)
- Financials.tsx, TeacherFinance.tsx, Dashboard.tsx
- services/excelExport.ts (the broken one — deferred to Phase 14.1b)
- All parent/student dashboard pages (other than badge additions)

## Phase 16 Decisions — Online Lessons Configuration (2026-03-24)

### Teacher Online Capability Model
- `supportsOnline?: boolean` on Teacher — simple toggle, not array
- `onlineRate?: number` — online individual hourly pay (separate from baseRate)
- `onlineGroupRate?: number` — online group hourly pay per student
- `onlineRatesBySchool?: Record<string, number>` — online per-school rate overrides
- All fields optional — existing teachers unaffected (defaults to false/0)

### School Online Pricing Model
- `defaultOnlineRate?: number` — online billing rate (individual)
- `defaultOnlineGroupRate?: number` — online billing rate (group per student)
- `onlineTeacherRates?: Record<string, number>` — per-teacher online billing overrides
- `onlineInstrumentRates?: Record<string, number>` — per-instrument online billing overrides
- All fields optional — existing schools unaffected

### Online Session Architecture (Stub)
- `OnlineSessionConfig` interface added to types.ts — provider-agnostic contract
- Supports: zoom, google_meet, teams, custom providers
- No runtime implementation — placeholder for future integration
- Fields: provider, meetingUrl, meetingId, passcode, autoCreate

### Teacher Filtering by Online Capability
- ScheduleManager: When deliveryMode=ONLINE, teacher dropdown filters to `supportsOnline===true`
- BookingManagement: Same filter for teacher assignment on online bookings
- Attendance: Info warning when teacher selects online but profile not configured
- Switching to online mode clears incompatible teacher selection in ScheduleManager

### Phase Discipline Maintained
- Phase 16 STORES configuration only — zero financial calculation changes
- Online rates are persisted to Firestore but NOT used in any rate computation
- Phase 17 is the ONLY phase that will branch financial logic on deliveryMode

### Configuration UI
- Teacher edit form: "Supports Online" checkbox + conditional online rate fields
- Teacher display row: blue "Online" badge when supportsOnline is true + online rate display
- School edit form: separate online rate inputs (individual/group) alongside in-person rates
- School display row: online rates shown when configured

### Files Updated
- types.ts — Teacher online fields, School online fields, OnlineSessionConfig stub
- context/AppContext.tsx — addUser/updateUser persist online teacher fields
- pages/Configuration.tsx — OnlineConfigEditor component, school online rate inputs, teacher online badge, handleSave with online fields
- pages/admin/ScheduleManager.tsx — Teacher filtering by supportsOnline, auto-clear on mode switch
- pages/admin/BookingManagement.tsx — Teacher filtering for online bookings
- pages/Attendance.tsx — Online info indicator for unconfigured teacher

### Files NOT Touched (intentionally)
- Financial calculation functions — Phase 17 only
- Financials.tsx, TeacherFinance.tsx, Dashboard.tsx
- LessonLog.tsx, StudentLessons.tsx, ChildProgress.tsx, SchoolLessons.tsx (already complete from Phase 15)
- firestore.rules — no new collections
- App.tsx, Sidebar.tsx — no new routes
- services/exportUtils.ts, services/excelExport.ts — no changes needed

## Phase 17.1 — Rate Engine + Dead Code Cleanup (2026-03-24)

### Rate Resolution Architecture
- Created `services/rateService.ts` with `resolveTeacherRate()` and `resolveSchoolRate()`
- Both functions use **sequential-assignment pattern** (NOT early returns) to preserve original inline behavior
- Key behavioral rules:
  - **Teacher Group rates**: `baseGroupRate` is the FINAL override — wins over `ratesBySchool[schoolId]`
  - **School Group rates**: `teacherRates` is NOT checked for Group lessons (only Individual)
  - **Online chain**: Layers on top of in-person result as fallback, same sequential pattern
  - Online Group: `onlineGroupRate` is FINAL override, wins over `onlineRatesBySchool[schoolId]`
  - Online School Group: `onlineTeacherRates` NOT checked for Group (matching in-person pattern)

### Teacher Rate Fallback (in-person):
- Individual: `baseRate → ratesBySchool[schoolId]` (school override wins)
- Group: `baseRate → ratesBySchool[schoolId] → baseGroupRate` (group rate is FINAL override)

### School Rate Fallback (in-person):
- Individual: `defaultRate → instrumentRates[instrument] → teacherRates[teacherId]`
- Group: `defaultRate → instrumentRates[instrument] → defaultGroupRate` (teacherRates skipped)

### Dead Code Removed
- `calculateGroupLessonFinancials` — never called from any UI page
- `calculateLessonFinancials` — never called from any UI page
- `calculateTeacherEarnings` — never called from any UI page (had `lesson.duration` bug)
- `calculateSchoolRevenue` — never called from any UI page
- Removed from: interface declarations, implementations, and context value

### Callers Updated
- `pages/Attendance.tsx` — uses `resolveTeacherRate()`
- `pages/LessonLog.tsx` — uses both `resolveTeacherRate()` and `resolveSchoolRate()`
- `context/AppContext.tsx` — `addLesson` uses `resolveSchoolRate()`, `generateLessonsFromTimetable` uses `resolveTeacherRate()`
- `pages/admin/BookingManagement.tsx` — convert-to-lesson uses `resolveTeacherRate()`

### Files NOT Modified (by design)
- `pages/Financials.tsx` — reads snapshots directly, never resolves rates
- `pages/TeacherFinance.tsx` — reads snapshots directly, never resolves rates
- `services/exportUtils.ts`, `services/excelExport.ts` — no rate logic

## Phase 17.2 — Enrollment Entity (2026-03-24)

### Enrollment Data Model
- New Firestore collection: `/enrollments/{id}`
- `Enrollment` interface with: studentId, teacherId, schoolId (optional — undefined for private), instrument, totalLessons, durationMinutes, lessonType, deliveryMode, payerType, billingStatus, priceExpected (optional), status, notes, createdAt, updatedAt, createdBy
- `schoolId` and `schoolName` are optional (`undefined` for private students), not empty string
- `priceExpected` is optional — reserved for future invoice display, no logic yet

### Enrollment Enums
- `EnrollmentStatus`: active, completed, paused, cancelled
- `EnrollmentPayerType`: parent, school
- `EnrollmentBillingStatus`: paid, to_be_invoiced

### Lesson Consumption Rule (CRITICAL)
- Lessons count as "consumed" ONLY if their status is in `ENROLLMENT_CONSUMED_STATUSES`:
  - **Present** — consumed
  - **Taught** — consumed
  - **Absent (Unexcused)** — consumed (student's fault, slot used)
  - **Absent (Excused)** — NOT consumed (can be rescheduled)
  - **Cancelled** — NOT consumed
- Remaining = `totalLessons - consumed` (minimum 0)
- Computed at read time via `getEnrollmentRemaining()` in types.ts — never stored

### Lesson Linkage
- `enrollmentId?: string` on Lesson (added in Phase 17.1)
- Lessons link TO enrollment. Enrollment does NOT store linkedLessonIds.
- Old/standalone lessons with no enrollmentId continue working unchanged.

### Access Control
- Enrollment CRUD: admin only (Phase 17.2)
- Firestore listener: admin only — teacher/parent/student/school_admin do not load enrollments yet
- Portal visibility for other roles deferred to Phase 17.5

### Files Created
- `pages/admin/EnrollmentManagement.tsx` — admin enrollment management page

### Files Modified
- `types.ts` — Enrollment interface + enums + `ENROLLMENT_CONSUMED_STATUSES` + `getEnrollmentRemaining()` helper
- `context/AppContext.tsx` — Enrollment state, Firestore listener, CRUD (addEnrollment, updateEnrollment, deleteEnrollment)
- `App.tsx` — Admin route for `/admin/enrollments`
- `components/Sidebar.tsx` — "Enrollments" nav item for admin

### Files NOT Modified (by design)
- All financial pages (Financials.tsx, TeacherFinance.tsx, Dashboard.tsx)
- Attendance.tsx, LessonLog.tsx — no enrollment selection needed yet
- services/rateService.ts — enrollment does NOT affect rates
- services/exportUtils.ts, services/excelExport.ts — no export changes
- No parent/student/school portal pages — deferred to Phase 17.5

## Phase 17.3 — Invoice Entity (2026-03-24)

### Invoice Data Model
- New Firestore collection: `/invoices/{id}`
- `Invoice` interface with: id, invoiceNumber, payerId, payerType, payerName, enrollmentId (optional), lineItems, adjustments, totalAmount, paidAmount, status, isLocked, periodStart, periodEnd, issuedDate, dueDate, currency, notes, createdAt, createdBy, updatedAt
- `InvoiceLineItem` interface with: lessonId (optional), date (number timestamp), description, amount

### Computed Fields (NOT stored)
- **subtotal**: computed via `getInvoiceSubtotal(lineItems)` — sum of all line item amounts
- **balanceDue**: computed via `getInvoiceBalanceDue(invoice)` — totalAmount - paidAmount
- **totalAmount**: the ONLY stored total — equals subtotal + adjustments at creation time

### Invoice Number Format
- `INV-YYYYMM-XXXX` — sequential per month via Firestore counter `invoices_YYYYMM`
- Generated server-side in `addInvoice` — caller never provides invoiceNumber

### B2B vs B2C
- **B2B (school)**: Admin selects school + period → system snapshots billable lesson data (schoolRate) into line items
- **B2C enrollment**: Admin selects parent → enrollment → populates from enrollment.priceExpected or linked lesson snapshots
- **B2C manual**: Admin selects parent → adds line items manually
- B2C defaults to enrollment-based; lesson-based is optional fallback

### Billable Lesson Statuses
- Present, Taught, Absent (Unexcused) — same as ENROLLMENT_CONSUMED_STATUSES
- Cancelled and Absent (Excused) are NOT billed

### Line Item Snapshotting (CRITICAL)
- B2B line items snapshot lesson data (description, amount=schoolRate) at invoice creation time
- Once created, line items are NEVER recomputed from live lesson data
- This follows the same snapshot-at-creation-time principle as lesson.teacherRate and lesson.schoolRate

### Locking
- `isLocked: boolean` on Invoice
- Auto-locked when status is set to "issued" or "paid"
- Editing a locked invoice requires explicit unlock confirmation
- Deleting a locked invoice requires explicit confirmation

### Duplicate Detection
- When creating: system checks for existing non-cancelled invoices with same payerId + periodStart + periodEnd
- If duplicates found: amber warning shown with invoice numbers, statuses, and amounts
- Does NOT block creation — admin discretion

### Access Control
- Invoice CRUD: admin only (Phase 17.3)
- Firestore listener: admin only
- Portal visibility for other roles deferred to Phase 17.5

### Files Created
- `pages/admin/InvoiceManagement.tsx` — admin invoice management page (create B2B/B2C, edit, delete, list with filtering)

### Files Modified
- `types.ts` — Invoice, InvoiceLineItem interfaces; InvoiceStatus, InvoicePayerType enums; getInvoiceSubtotal(), getInvoiceBalanceDue() helpers; `invoices: Invoice[]` added to AppState
- `context/AppContext.tsx` — Invoice state, Firestore listener, generateInvoiceNumber(), addInvoice, updateInvoice, deleteInvoice CRUD
- `App.tsx` — Admin route for `/admin/invoices`
- `components/Sidebar.tsx` — "Invoices" nav item for admin

### Files NOT Modified (by design)
- `pages/Financials.tsx` — reads lesson snapshots directly, no invoice integration yet
- `pages/TeacherFinance.tsx` — teacher pay view, unchanged
- `pages/Attendance.tsx`, `pages/LessonLog.tsx` — unrelated
- `services/rateService.ts` — invoices do NOT affect rates
- `services/exportUtils.ts`, `services/excelExport.ts` — no export changes
- All parent/student/school portal pages — deferred to Phase 17.5

---

## Phase 17.4: Payment Entity & Invoice Reconciliation (2026-03-25)

### Payment Model
- `Payment` interface: id, invoiceId, invoiceNumber (display snapshot), payerName (display snapshot), amount, method, status, reference?, notes?, paidAt? (optional — required in practice for completed/refunded), createdAt, createdBy, updatedAt
- `PaymentStatus` enum: pending, completed, failed, refunded
- `PaymentMethod` enum: cash, bank_transfer, card, mada, apple_pay, other
- `paidAt` is optional in the type, but expected for completed/refunded payments

### Payment Service Layer
- `getInvoicePaidAmount()` and `resolveInvoiceStatusAfterPayment()` placed in `services/paymentService.ts` (NOT in types.ts — per user directive)
- `getInvoicePaidAmount()` sums only COMPLETED payments for a given invoiceId
- `resolveInvoiceStatusAfterPayment()` returns new status + isLocked based on paidAmount vs totalAmount

### Reconciliation
- `reconcileInvoice(invoiceId)` in AppContext: called after every addPayment, updatePayment, deletePayment
- Skips DRAFT and CANCELLED invoices (never auto-modified by payment changes)
- Recomputes paidAmount from ALL completed payments (not incremental — safe against race conditions)
- Status resolution:
  - paidAmount >= totalAmount → PAID, isLocked: true
  - paidAmount > 0 and < totalAmount → PARTIALLY_PAID, isLocked: false
  - paidAmount === 0 and dueDate past → OVERDUE, isLocked: false
  - paidAmount === 0 and dueDate future/empty → ISSUED, isLocked: false
- Auto-unlock: when invoice falls back from PAID (e.g. payment deleted/refunded), isLocked automatically set to false

### Deletion Safety
- Deleting a COMPLETED payment requires explicit double-confirmation (click Delete, then click "Confirm Delete?")
- Non-completed payments can be deleted with single click

### Display Snapshots
- Payment stores `invoiceNumber` and `payerName` as display snapshots only — NOT source of truth
- Source of truth for invoice data is always the Invoice entity

### Access Control
- Payment CRUD: admin only (Phase 17.4)
- Firestore listener on `/payments`: admin only
- Portal visibility for other roles deferred to Phase 17.5

### Files Created
- `services/paymentService.ts` — payment helpers (getInvoicePaidAmount, resolveInvoiceStatusAfterPayment)
- `pages/admin/PaymentManagement.tsx` — admin payment management page (create, edit, delete, list with filtering, summary stats)

### Files Modified
- `types.ts` — Payment interface; PaymentStatus, PaymentMethod enums; `payments: Payment[]` added to AppState
- `context/AppContext.tsx` — Payment/paymentService imports; payment state; Firestore listener; reconcileInvoice(); addPayment, updatePayment, deletePayment CRUD; useMemo updated
- `App.tsx` — Admin route for `/admin/payments`
- `components/Sidebar.tsx` — "Payments" nav item for admin

### Files NOT Modified (by design)
- `pages/Financials.tsx` — reads lesson snapshots directly, no payment integration
- `pages/TeacherFinance.tsx` — teacher pay view, unchanged
- `pages/admin/InvoiceManagement.tsx` — invoice page unchanged (payments page is separate)
- `services/rateService.ts` — payments do NOT affect rates
- All parent/student/school portal pages — deferred to Phase 17.5

---

## Phase 17.5: Portal Integration & Visibility (2026-03-25)

### Architecture: Firestore-First Filtering
All role-based data restriction uses Firestore `where()` queries as the primary mechanism. Client-side stripping is a secondary safety layer only.

### Parent Visibility
- **Enrollments**: Firestore `where('studentId', 'in', childIds)` — parent sees enrollments for ALL children, regardless of payerType. `priceExpected` shown only when `payerType === 'parent'`. Notes/createdBy stripped client-side.
- **Invoices**: Firestore `where('payerId', '==', userId)` + `where('payerType', '==', 'parent')` — parent sees only B2C invoices addressed to them. Admin notes and createdBy stripped client-side.
- **Payments**: Full collection listener, client-filtered to match visible invoiceIds. Notes and reference stripped client-side. Only payments whose invoiceId matches a parent-visible invoice are shown.
- **New pages**: `/parent/billing` (ParentBilling.tsx), `/parent/enrollments` (ParentEnrollments.tsx)
- **New nav**: "Enrollments", "My Billing" in parent sidebar

### School Admin Visibility
- **Invoices**: Firestore `where('payerId', '==', schoolId)` + `where('payerType', '==', 'school')` — school admin sees only B2B invoices for own school. Admin notes and createdBy stripped. No private student billing visible.
- **Payments**: Full collection listener, client-filtered to match visible invoiceIds. Admin notes stripped.
- **Enrollments**: NOT shown (enrollments are student-level, not school-level)
- **New page**: `/school/invoices` (SchoolInvoices.tsx)
- **New nav**: "Invoices" in school admin sidebar

### Student Visibility
- **Enrollments**: Firestore `where('studentId', 'in', [studentDocId])` — student sees only own enrollments. ALL financial fields stripped: priceExpected, billingStatus, payerType, notes, createdBy.
- **Invoices**: NEVER shown (no listener, stays empty [])
- **Payments**: NEVER shown (no listener, stays empty [])
- **UI change**: Enrollment progress cards added to StudentDashboard (consumed/remaining, no pricing)

### Teacher Visibility
- No change. Teachers see NO enrollments, invoices, or payments (all stay empty []).

### Admin Cross-Links
- EnrollmentManagement: shows linked invoice numbers (by enrollmentId match), click navigates to `/admin/invoices`
- InvoiceManagement: shows payment count (by invoiceId match), click navigates to `/admin/payments`; shows "View Enrollment" link if enrollmentId is set, navigates to `/admin/enrollments`
- PaymentManagement: already displays invoiceNumber — no additional changes needed

### Safe Fallback Rule
- If student record is not found for an enrollment → card not rendered (null return)
- If childIds is empty → enrollment listener not started (stays empty [])
- If schoolId is missing → invoice listener not started (stays empty [])
- Payments always filtered against visible invoiceIds; if invoices are empty, payments stay empty

### Files Created
- `pages/parent/ParentBilling.tsx` — parent invoice + payment view (B2C only)
- `pages/parent/ParentEnrollments.tsx` — parent enrollment progress per child
- `pages/school/SchoolInvoices.tsx` — school admin invoice + payment view (B2B only)

### Files Modified
- `context/AppContext.tsx` — Enrollment listeners for parent (childIds-based) and student (studentId-based); Invoice listeners for parent (payerId+payerType) and school admin (payerId+payerType); Payment listeners for parent and school admin (collection + client invoiceId filter); all with client-side field stripping
- `App.tsx` — Parent routes (billing, enrollments), School route (invoices), imports
- `components/Sidebar.tsx` — Parent nav (Enrollments, My Billing), School admin nav (Invoices)
- `pages/student/StudentDashboard.tsx` — Enrollment progress cards (no pricing)
- `pages/admin/EnrollmentManagement.tsx` — Cross-link to linked invoices
- `pages/admin/InvoiceManagement.tsx` — Cross-links to payments count and enrollment

### Files NOT Modified (by design)
- `pages/Financials.tsx` — admin financial view, unchanged
- `pages/TeacherFinance.tsx` — teacher pay view, unchanged
- `pages/Attendance.tsx`, `pages/LessonLog.tsx` — unrelated
- `services/rateService.ts`, `services/paymentService.ts` — unrelated
- `services/excelExport.ts`, `services/exportUtils.ts` — unrelated
- `types.ts` — no schema changes needed
- `pages/admin/PaymentManagement.tsx` — already has invoice references, no change needed

---

## Phase 17.G: Guarantee System Refactor (2026-03-25)

### Dual-Guarantee Architecture
- **School guarantee** → affects INVOICES (revenue) only. Always billed if enabled. Scope: school + instrument + date.
- **Teacher guarantee** → affects PAYROLL only. Activates only if ≥1 counted lesson that day. Scope: teacher + school + instrument + date.
- They are independent — school guarantee NEVER affects payroll, teacher guarantee NEVER affects invoices.

### Data Model
- `School.guaranteesByInstrument?: Record<string, GuaranteeConfig>` — key = normalized instrument name
- `Teacher.guaranteesBySchool?: Record<string, Record<string, GuaranteeConfig>>` — first key = schoolId, second key = normalized instrument name
- `GuaranteeConfig = { enabled: boolean; minHours: number; appliesTo: GuaranteeAppliesTo }`
- `GuaranteeAppliesTo = 'in_person_only' | 'online_only' | 'both'`
- Default appliesTo = `'in_person_only'`

### Delivery Mode Logic
- Guarantees are NOT grouped by deliveryMode. Grouping is school+date+instrument (school) or teacher+school+date+instrument (teacher).
- Within each group, `actualHours` = sum of lessons whose deliveryMode matches the guarantee's `appliesTo`.
- Mixed days (online + in-person) are handled correctly: only matching lessons count toward actualHours.

### Rate Usage for Shortfall
- Payroll shortfall: `resolveTeacherRate(teacher, schoolId, 'Individual', deliveryMode)` — respects school-specific and online rates. NEVER uses `teacher.baseRate` directly.
- Invoice shortfall: `resolveSchoolRate(school, '', instrument, 'Individual', deliveryMode)` — empty teacherId because guarantee lines are school-level, not teacher-specific. Falls back to instrument-level rates.
- DeliveryMode for rate resolution: `online_only` → ONLINE, otherwise → IN_PERSON.

### Instrument Normalization
- All instrument keys are normalized via `normalizeInstrument()`: lowercase + trimmed.
- Applied consistently across: guarantee configs, guarantee lookups, rate lookups, and the Configuration UI.
- Legacy data with mixed-case keys is handled via case-insensitive fallback scan.

### Migration Strategy
- New fields (`guaranteesByInstrument`, `guaranteesBySchool`) are the **source of truth**.
- Old fields (`minimumDailyHoursByInstrument`) are **read-only fallback** — NEVER written to after 17.G.
- Resolution functions: check new field first → if empty, fall back to legacy field.
- School guarantees: auto-migrated on load in Configuration UI (legacy `guaranteed` → `enabled`, add `appliesTo: 'in_person_only'`).
- Teacher guarantees: legacy flat map cannot be auto-migrated to school-specific structure. Admin must re-enter via new UI. Legacy data still works as fallback (applies to ALL schools).
- If `teacher.guaranteesBySchool` has ANY entries, legacy fallback is skipped entirely for that teacher (prevents double-counting).
- No Firestore migration script needed — gradual migration via save handler.

### Resolution Functions (in rateService.ts)
- `resolveSchoolGuarantee(school, instrument)` → returns `{ minHours, appliesTo } | null`
- `resolveTeacherGuarantee(teacher, schoolId, instrument)` → returns `{ minHours, appliesTo } | null`
- `matchesDeliveryMode(appliesTo, deliveryMode)` → boolean
- `normalizeInstrument(s)` → lowercase + trimmed string

### Configuration UI
- School: structured form with rows [Instrument, Enabled checkbox, minHours input, appliesTo dropdown]. Add/remove rows.
- Teacher: grouped by school, each school section has rows [Instrument, Enabled checkbox, minHours input, appliesTo dropdown]. Add/remove schools and instruments.
- Old text-input format (`Violin=4, Piano=2!`) replaced entirely.

### Bugs Fixed
1. Old code used `school.minimumDailyHoursByInstrument` for teacher payroll — should use teacher's own guarantee. Fixed: teacher payroll now uses `resolveTeacherGuarantee()`.
2. Old code used `teacher.baseRate` for payroll shortfall — should respect school-specific and online rates. Fixed: now uses `resolveTeacherRate(...)`.
3. Old code used `school.defaultRate` / manual `instrumentRates` lookup for invoice shortfall — should use full rate chain. Fixed: now uses `resolveSchoolRate(...)`.
4. Old code ignored delivery mode entirely for guarantee applicability. Fixed: `appliesTo` + `matchesDeliveryMode()`.

### Files Modified
| File | Change |
|------|--------|
| `types.ts` | Added `GuaranteeAppliesTo`, `GuaranteeConfig`, new fields on School + Teacher |
| `services/rateService.ts` | Added `resolveSchoolGuarantee()`, `resolveTeacherGuarantee()`, `matchesDeliveryMode()`, `normalizeInstrument()` |
| `services/financialCalculations.ts` | Full refactor: dual-guarantee with centralized rate engine |
| `pages/Dashboard.tsx` | Refactored guarantee calculations to use new functions |
| `pages/Financials.tsx` | Refactored both payroll + invoicing guarantee calculations |
| `pages/TeacherFinance.tsx` | Refactored guarantee calculation to use teacher guarantees |
| `pages/Configuration.tsx` | Replaced text-input editor with structured form, updated save/load logic |

### Files NOT Modified
- `context/AppContext.tsx` — no guarantee logic lives here
- `pages/admin/InvoiceManagement.tsx` — invoice line items are separate concern
- `pages/admin/PaymentManagement.tsx`, `pages/admin/EnrollmentManagement.tsx` — unrelated
- `pages/parent/*`, `pages/school/*`, `pages/student/*` — portal pages don't compute guarantees
- `pages/LessonLog.tsx`, `pages/Attendance.tsx` — unrelated

---

## Phase 17.G.1: Invoice Guarantee Integration (2026-03-26)

### Purpose
Close the gap between Financials guarantee calculations (Phase 17.G) and B2B invoice generation. Before this phase, invoices only contained lesson line items — no guarantee adjustments.

### What Changed
- `generateB2BLineItems()` in `InvoiceManagement.tsx` now adds **guarantee adjustment line items** after lesson lines.
- For each **school + date + instrument** group, calls `resolveSchoolGuarantee()`.
- If `actualHours < minHours`, adds a line: `"Guarantee adjustment – {Instrument} – {date}"`.
- Amount = `shortfall × resolveSchoolRate(school, '', instrument, 'Individual', deliveryMode)`.
- `actualHours` only counts lessons whose deliveryMode matches the guarantee's `appliesTo`.
- All items sorted chronologically (lessons + guarantee adjustments interleaved by date).
- Guarantee lines have no `lessonId` and no teacher name — they are school-level adjustments.

### What Did NOT Change
- B2C invoice flow, lesson snapshots, Financials/Dashboard/TeacherFinance pages, teacher guarantee (payroll-only).

### Files Modified
- `pages/admin/InvoiceManagement.tsx` — added imports, `teachers` to useApp, refactored `generateB2BLineItems()`.

---

## Phase 17.6 — Payroll Entity + Settlement Tracking

### Purpose
Create first-class payroll records as Firestore entities rather than computed-on-the-fly values. Enables payroll generation, approval workflow, settlement tracking, and teacher-visible payroll history.

### Key Decisions
1. **PayrollRun entity** — stored in `payrollRuns` Firestore collection. Contains: teacher info, period, line items (snapshot at generation time), totals, settlement tracking (paidAmount, status), and locking.
2. **Payroll number format** — `PAY-YYYYMM-XXXX` using same counter pattern as invoices (`reserveCounterRange` on `payroll_YYYYMM`).
3. **Duplicate protection** — same teacher + same period + same school filter + non-cancelled status → rejected.
4. **Status workflow** — DRAFT → APPROVED → PARTIALLY_PAID/PAID. CANCELLED is terminal. Settlement uses `resolvePayrollStatusAfterSettlement()` (same pattern as invoice reconciliation).
5. **Locking** — APPROVED and above: lineItems + totalPayable are immutable. Only paidAmount/status can change via settlement.
6. **Guarantee grouping** — follows Phase 17.G rules: teacher + school + date + instrument. Delivery mode filtering via `matchesDeliveryMode()`.
7. **Line items use snapshot model** — generated via `generatePayrollLineItems()` in `payrollService.ts`, frozen at creation time.
8. **Teacher visibility** — teachers see own payroll runs via Firestore `where('teacherId', '==', user.id)` query. Admin notes stripped client-side.
9. **Existing pages untouched** — Financials.tsx and TeacherFinance.tsx remain as-is (legacy computed payroll views). New pages: `PayrollManagement.tsx` (admin), `TeacherPayroll.tsx` (teacher).

### Files Created
- `services/payrollService.ts` — `generatePayrollLineItems()`, `resolvePayrollStatusAfterSettlement()`
- `pages/admin/PayrollManagement.tsx` — admin payroll management (generate, preview, approve, settle, delete, cancel)
- `pages/teacher/TeacherPayroll.tsx` — teacher read-only payroll view

### Files Modified
- `types.ts` — `PayrollStatus` enum, `PayrollLineItem`, `PayrollRun`, `getPayrollBalanceDue()`, `payrollRuns` on AppState
- `context/AppContext.tsx` — Firestore listener, CRUD (addPayrollRun, updatePayrollRun, deletePayrollRun), counter
- `App.tsx` — routes: `/admin/payroll`, `/teacher/payroll`
- `components/Sidebar.tsx` — nav items: admin "Payroll", teacher "My Payroll"

### What Did NOT Change
- Financials.tsx, TeacherFinance.tsx, Dashboard.tsx — all untouched
- Invoice flow, payment flow, enrollment flow — all untouched
- Financial snapshot model (teacherRate/schoolRate on lessons) — untouched

---

## Phase 17.6A — Payroll & Invoice Workflow Refinement

### Purpose
Refine Invoice and Payroll workflows for better usability and real-world financial handling. UI + workflow + minor logic refinement only — no architecture changes.

### Key Decisions

**Invoice Refinements:**
1. **`fromDate` field** — optional ISO date on Invoice for display clarity. Stored in Firestore, shown in invoice list if present. Does NOT affect calculations.
2. **Month dropdown auto-fill** — when month is selected, auto-fills `periodStart` (1st of month), `periodEnd` (last day of month), AND `fromDate` (1st of month). Manual override still works for all fields.

**Payroll Refinements:**
3. **Month dropdown** — auto-fills `periodStart` and `periodEnd` from selected month. Manual override still works.
4. **Manual line items** — admin can add `manual_adjustment` type lines (description, amount, optional date). Examples: travel allowance, bonus, deduction. Included in totalPayable.
5. **Explicit totals breakdown**:
   - `lessonTotal` = sum(type === 'lesson')
   - `guaranteeTotal` = sum(type === 'guarantee')
   - `manualAdjustmentTotal` = sum(type === 'manual_adjustment')
   - `totalPayable` = lessonTotal + guaranteeTotal + manualAdjustmentTotal
6. **Line item deletion** — red × button on each line, ONLY during draft preview (before save). Recalculates totals immediately. Not available on approved/paid/partially_paid payrolls.
7. **Delete rules** — payroll delete allowed for `draft` AND `cancelled` status. Blocked for approved/partially_paid/paid (must cancel first).
8. **Summary cards** — ONLY include approved + partially_paid + paid. Exclude draft and cancelled. Applied to both admin and teacher pages.
9. **Cancelled payrolls** — visible in list but excluded from summary totals.
10. **Type badge styling** — lesson=blue, guarantee=amber, manual_adjustment=purple. Consistent across admin and teacher views.

### Files Modified
- `types.ts` — PayrollLineItem type union: added `'manual_adjustment'`; PayrollRun: added `manualAdjustmentTotal?`; Invoice: added `fromDate?`
- `pages/admin/InvoiceManagement.tsx` — added `fromDate` field + state, month dropdown auto-fills fromDate, fromDate in payload and display
- `pages/admin/PayrollManagement.tsx` — month dropdown, manual line items, line item deletion, delete rules (draft+cancelled), summary cards filter, type badge styling
- `pages/teacher/TeacherPayroll.tsx` — summary cards filter (exclude draft/cancelled), manual_adjustment badge + row styling, manualAdjustmentTotal display

### What Did NOT Change
- Financial calculations, guarantee logic, rateService — untouched
- Lesson snapshots, invoice/payment architecture — untouched
- Financials.tsx, TeacherFinance.tsx, Dashboard.tsx — untouched
- payrollService.ts — untouched
- AppContext.tsx — untouched
- No Firestore migration needed (all additions are optional fields)

---

## Phase 17.7 — Invoice & Payroll Export (Excel + PDF with ARTickle branding)
**Date:** 2026-03-26
**Status:** COMPLETED

### Decisions
- Admin-only scope: export buttons only visible on admin Invoice Management and Payroll Management pages. Teacher payroll export deferred to future phase.
- Created new standalone service files (`invoiceExportService.ts`, `payrollExportService.ts`) instead of modifying existing export services (`excelExport.ts`, `exportUtils.ts`) — backward compatibility with old Financials tab preserved.
- PDF uses same ARTickle branding as LessonLog PDF: dark header, LIME accent, logo from `/logo.png`.
- Excel uses SheetJS (XLSX) via CDN `(window as any).XLSX`; PDF uses jsPDF via CDN `(window as any).jspdf`.
- Payroll PDF has type-specific row highlighting: lessons=blue, guarantee=amber, manual_adjustment=purple.
- `payrollExportService` accepts `options.stripNotes` for future teacher export use (notes hidden from teachers).
- Invoice export buttons placed in card action row alongside Edit/Delete.
- Payroll export buttons placed in View Detail modal footer alongside Close button.

### Files Created
- `services/invoiceExportService.ts` — `exportInvoiceExcel()`, `exportInvoicePDF()`
- `services/payrollExportService.ts` — `exportPayrollExcel()`, `exportPayrollPDF()`

### Files Modified
- `pages/admin/InvoiceManagement.tsx` — added import for invoice export functions, added Excel + PDF buttons per invoice card
- `pages/admin/PayrollManagement.tsx` — added import for payroll export functions, added Excel + PDF buttons in view detail modal

### What Did NOT Change
- `services/excelExport.ts` — untouched (old Financials tab export)
- `services/exportUtils.ts` — untouched (old downloadExcel helper)
- `Financials.tsx`, `TeacherFinance.tsx` — untouched
- `pages/teacher/TeacherPayroll.tsx` — untouched (no teacher export yet)
- Financial calculations, types, AppContext — untouched
- No Firestore changes needed

### Build Verification
- `tsc --noEmit`: 8 pre-existing errors only, zero new errors
- `vite build`: passes clean (568 kB bundle)

---

## Phase 17.7A — Finance Export Redesign (Grouped Exports + Payroll Register)
**Date:** 2026-03-27
**Status:** COMPLETED

### Decisions
- **Grouped line items**: Invoice and payroll exports now show summarized rows instead of per-lesson micro lines.
- **Invoice grouping key**: `date + instrument + rate` — derived from LESSON data (source of truth), NOT from InvoiceLineItem. B2C invoices keep original format.
- **Payroll grouping key**: `date + school + instrument + rate` — derived from PayrollLineItem data (already has all needed fields).
- **Rate splitting**: If lessons in the same date+instrument group have different rates, they become separate rows (avoids confusion).
- **Guarantee visibility (CRITICAL)**: "Guarantee Adj." column shown explicitly in both PDF and Excel. PDF also shows "Guarantee Applied" badge (amber background + bordered label) on guarantee rows.
- **Totals from stored entity**: Export NEVER recalculates totals. `invoice.totalAmount`, `payroll.totalPayable`, etc. are the single source of truth. Grouping is for display only.
- **Payroll Register**: Batch export for all teachers — landscape PDF + Excel. Summary table with one row per payroll run. Supports month filter, optional school filter, optional status filter.
- **Shared grouping utilities**: `exportGrouping.ts` provides `groupInvoiceLinesFromLessons()` and `groupPayrollLines()` — pure functions reused by both PDF and Excel.
- **UI consistency**: Export buttons maintain same order (Excel → PDF), same colors (emerald for Excel, blue for PDF) across invoice cards and payroll modal.
- **Old Financials tab untouched**: `excelExport.ts`, `exportUtils.ts`, `Financials.tsx`, `TeacherFinance.tsx` — all completely untouched.

### Files Created
- `services/exportGrouping.ts` — shared grouping utilities (GroupedInvoiceLine, GroupedPayrollLine interfaces)

### Files Rewritten
- `services/invoiceExportService.ts` — grouped B2B invoice export, B2C kept as-is
- `services/payrollExportService.ts` — grouped payroll export + payroll register (Excel + PDF)

### Files Modified
- `pages/admin/InvoiceManagement.tsx` — export calls now pass lessons, teachers, schools
- `pages/admin/PayrollManagement.tsx` — added register export import, register state, "Export Payroll Register" button, register filter modal (month/school/status)

### What Did NOT Change
- `types.ts` — untouched
- `services/payrollService.ts`, `services/rateService.ts` — untouched
- `services/excelExport.ts`, `services/exportUtils.ts` — untouched (old Financials)
- `Financials.tsx`, `TeacherFinance.tsx` — untouched
- `pages/teacher/TeacherPayroll.tsx` — untouched
- `context/AppContext.tsx` — untouched
- No Firestore changes

### Build Verification
- `tsc --noEmit`: 8 pre-existing errors only, zero new errors
- `vite build`: passes clean (586 kB bundle)

---

## Phase 17.8 — Invoice & Payroll UI Minimal Alignment
**Date:** 2026-03-27
**Status:** COMPLETED

### Decisions
- **Summary cards**: Added 4 summary cards to Invoice page matching Payroll's existing layout (Active Invoices, Total Amount, Total Paid, Outstanding). Both pages now use identical card classes: `bg-slate-800/60 border border-slate-700/50 rounded-xl p-4`.
- **Cancelled exclusion**: Invoice summary stats explicitly exclude cancelled invoices (matching payroll's exclusion of draft+cancelled for summary stats).
- **Header alignment**: Invoice wrapper changed from `max-w-7xl mx-auto` to `space-y-6`, title from `h2` to `h1`, added subtitle — matching payroll's header pattern.
- **Filter alignment**: Invoice filter inputs changed from `bg-slate-900 p-2` to `bg-slate-800 px-3 py-2 placeholder-slate-500` — matching payroll's input styles.
- **Old text summary removed**: Bottom-of-page text summary replaced by summary cards at top.
- **No forced layout unification**: Invoice uses card layout, Payroll uses table layout — both valid UX patterns for their data shapes. Forced unification would be a redesign (out of scope).
- **Export buttons already consistent**: Both pages already use Excel=emerald, PDF=blue, same order. No change needed.
- **Terminology already consistent**: "Balance Due" used everywhere. No change needed.

### Files Modified
- `pages/admin/InvoiceManagement.tsx` — added `summaryStats` memo, summary cards, header/filter alignment, removed old text summary

### What Did NOT Change
- `pages/admin/PayrollManagement.tsx` — already correct, no changes needed
- Financial calculations, guarantee logic, data structures — untouched
- Export services — untouched
- Firestore schema — untouched
- Financials.tsx, TeacherFinance.tsx — untouched
- AppContext.tsx, types.ts — untouched

### Build Verification
- `tsc --noEmit`: 8 pre-existing errors only, zero new errors
- `vite build`: passes clean (587 kB bundle)

## Notes
Add every important decision here after each phase.