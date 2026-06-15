# ARTickle Academy — Technical Overview

> Technologies, patterns, and methodologies only. No feature descriptions or business logic.

---

## Tech Stack

### Core

| Layer | Technology | Version | Delivery |
|---|---|---|---|
| UI Framework | React | 19.2.3 | ESM import map (esm.sh) |
| Routing | React Router DOM | 6.30.3 | ESM import map (esm.sh) |
| Language | TypeScript | ~5.8.2 | Build-time only (tsc --noEmit) |
| Styling | Tailwind CSS | latest | CDN (cdn.tailwindcss.com) |
| Database | Firebase Firestore | 10.8.0 | CDN (gstatic.com) |
| Auth | Firebase Authentication | 10.8.0 | CDN (gstatic.com) |
| Build | Vite | 6.2.0 | npm |
| Hosting | Firebase Hosting | — | `dist/` SPA rewrite |

### Export Libraries (CDN)

| Library | Version | Purpose |
|---|---|---|
| SheetJS (XLSX) | 0.20.1 | Excel import/export |
| jsPDF | 2.5.1 | PDF generation |

### Dev Dependencies

| Package | Purpose |
|---|---|
| @vitejs/plugin-react | React Fast Refresh |
| @types/node | Node type definitions |

---

## Architecture

### Pattern: Context + Hooks (no Redux)

```
Firebase Auth
    ↓
AppContext.tsx (single provider)
  ├── Auth state (currentUser, role)
  ├── Firestore onSnapshot listeners (real-time)
  ├── All CRUD methods (44 public methods)
  └── Formatting utilities
    ↓
Pages / Components
  ├── Read: useApp() hook → state
  └── Write: useApp() hook → methods
    ↓
Services (stateless, pure logic)
  ├── Rate resolution
  ├── Payment reconciliation
  ├── Payroll generation
  ├── Permission filtering
  └── Export formatting
```

### Pattern: Role-Based Portal Routing

```
/login
/admin/*       → RoleGuard(ADMIN)       → ProtectedRoute → PortalLayout
/teacher/*     → RoleGuard(TEACHER)     → ProtectedRoute → PortalLayout
/parent/*      → RoleGuard(PARENT)      → ProtectedRoute → PortalLayout
/student/*     → RoleGuard(STUDENT)     → ProtectedRoute → PortalLayout
/school/*      → RoleGuard(SCHOOL_ADMIN)→ ProtectedRoute → PortalLayout
```

Unauthorized access → `RoleRedirect` → correct portal for current role.

### Pattern: Two-Layer Security

| Layer | Where | What |
|---|---|---|
| Firestore Rules | `firestore.rules` | Document-level read/write by role + identity |
| Permission Service | `services/permissionService.ts` | Field-level stripping before UI render |

Both layers enforce independently. Removing one doesn't expose data through the other.

### Pattern: CDN-First Module Loading

Firebase, React, and export libraries are loaded via `<script>` tags and ES module import maps in `index.html` — not npm. This means:
- No Firebase SDK in `node_modules`
- TypeScript cannot resolve CDN imports (3 known TS errors, non-blocking)
- Vite resolves them at build time via the import map

### Pattern: Snapshot-Based Financials

Financial values (rates, totals) are **snapshotted at write time** and never recalculated retroactively. Changing a rate affects future records only.

### Pattern: Real-Time Listeners with Role Scoping

Each role gets different Firestore queries on login:
- **Admin**: full collection scans (all data)
- **Teacher**: `where('teacherId', '==', uid)` on lessons, students, bookings, timetable, payroll
- **Parent**: `where('payerId', '==', uid)` on invoices; nested payment listener inside invoice callback
- **Student**: filtered to own records
- **School Admin**: `where('schoolId', '==', schoolId)` on lessons, students, invoices; nested payment listener

---

## File Structure

```
├── index.html              CDN imports, import map, Tailwind config
├── App.tsx                 Route definitions, portal guards
├── index.tsx               React DOM render entry
├── types.ts                All interfaces, enums, type definitions
├── vite.config.ts          Vite config (port 3000, path aliases)
├── tsconfig.json           TS config (ES2022, react-jsx, bundler resolution)
├── firebase.json           Hosting config (SPA rewrite, dist/)
├── firestore.rules         Document-level security rules
├── .firebaserc             Project binding (artickle-academy)
│
├── context/
│   └── AppContext.tsx       Global state, auth, all Firestore listeners + CRUD
│
├── components/             Shared UI components
│   ├── Login.tsx
│   ├── PortalLayout.tsx
│   ├── ProtectedRoute.tsx
│   ├── RoleGuard.tsx
│   ├── RoleRedirect.tsx
│   └── EditLessonModal.tsx
│
├── pages/                  Page components by role
│   ├── admin/              13 admin pages
│   ├── teacher/            9 teacher pages
│   ├── parent/             5 parent pages
│   ├── student/            2 student pages
│   └── school/             4 school admin pages
│
├── services/               Stateless business logic
│   ├── rateService.ts              Rate resolution (teacher + school)
│   ├── paymentService.ts           Invoice reconciliation
│   ├── payrollService.ts           Payroll line generation
│   ├── permissionService.ts        Field-level access control
│   ├── financialCalculations.ts    Legacy reporting metrics
│   ├── excelExport.ts              Legacy Excel export (SheetJS)
│   ├── invoiceExportService.ts     Invoice Excel + PDF
│   ├── payrollExportService.ts     Payroll Excel + PDF + register
│   ├── exportGrouping.ts           Line item grouping helpers
│   ├── exportUtils.ts              CSV/download utilities
│   └── importUtils.ts              Excel file parsing
│
└── docs/                   Project documentation
```

---

## Conventions

### Naming

| Element | Convention | Example |
|---|---|---|
| Components | PascalCase | `InvoiceManagement.tsx` |
| Functions | camelCase | `resolveTeacherRate()` |
| Enums | PascalCase + UPPER values | `Role.SCHOOL_ADMIN` |
| Types/Interfaces | PascalCase | `AppContextType` |
| Files (components) | PascalCase.tsx | `ParentDashboard.tsx` |
| Files (services) | camelCase.ts | `rateService.ts` |
| Firestore collections | camelCase | `payrollRuns` |
| CSS | Tailwind utility classes | No custom CSS files |

### Development Methodology

- **Phase-based development**: Features tracked as Phase 7 → 17.8 in `PHASE_STATUS.md`
- **Decision logging**: All architectural decisions recorded in `DECISIONS.md`
- **Error tracking**: All TS errors and tech debt tracked in `KNOWN_ERRORS.md`
- **Test planning**: Master test checklist in `TESTING_MASTER.md`
- **No test framework**: Manual testing only (no Jest, Vitest, or Playwright)
- **No CI/CD pipeline**: Manual deployment via `firebase deploy`

### Data Conventions

- `cleanData()` wraps all Firestore writes: converts `undefined` → `null`
- Auto-generated IDs: `ST_[CODE]_NNN`, `PV-NNN`, `PAR-NNN`, `TE_NNN`, `INV-YYYYMM-XXXX`, `PAY-YYYYMM-XXXX`
- Sequential counters via `reserveCounterRange()` (Firestore transaction)
- Currency: SAR (ر.س) — hardcoded, not configurable

### Styling Conventions

- Dark theme (slate-950 base)
- Tailwind utility classes only — no custom CSS
- Extended palette: primary-500/600 (blue/indigo), slate-850/900/950
- Custom scrollbar styling via Tailwind plugin in `index.html`

---

## Deployment

```
Build:    vite build → dist/
Deploy:   firebase deploy --only hosting
          firebase deploy --only firestore:rules
Project:  artickle-academy
Site:     artickle-academy.web.app
```

SPA mode: all routes rewrite to `/index.html` via `firebase.json`.
