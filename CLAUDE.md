# ARTickle Academy — Mobile (isolated dev workspace)

This repo is the **mobile build** of ARTickle Academy and a **safe sandbox** for a partner to
work in. It is a separate copy of the web app — the live production app is in a different
folder/repo and is **never** touched from here.

## ⚠️ Isolation rules (read first)
- This app connects ONLY to the **`articklebeta`** Firebase project — a *copy* of real data,
  seeded from a nightly backup. It is **NOT** the live database.
- The production project is **`artickle-academy`** — do **NOT** point this app at it. Firebase
  config comes from env vars (`.env.development` → `VITE_FIREBASE_*`) and there is a guard in
  `context/AppContext.tsx` that throws if no project id is set, so it can't silently fall back
  to production.
- The `restore-from-backup.ts` script refuses to target `artickle-academy` unless `--force-prod`.
- There is **no auto-commit/auto-push hook** here (unlike the live repo) — work goes through
  review (see below), nothing reaches `main` automatically.

## What is what
| | This (mobile/dev) | Live (do not touch) |
|---|---|---|
| Firebase project | `articklebeta` | `artickle-academy` |
| URL | https://articklebeta.web.app | https://artickle-academy.web.app |
| App name shown | "ARTickle Academy (Dev)" | "ARTickle Academy" |
| Folder | `artickle-academy-mobile` | `ARTickle-academy-app` |

## Common commands
- `npm install` — first-time setup.
- `npm run dev` — run locally at http://localhost:3000 (uses the dev project).
- `npm run deploy:dev` — build + deploy to the **test URL** (`articklebeta.web.app`) only.
- `npm run restore -- --zip <backup.zip> --project articklebeta --key <sa.json>` — seed/refresh
  the dev database from a nightly backup ZIP (see `scripts/restore-from-backup.ts`).

## Tech stack
React 19 + Vite + TypeScript SPA; Firebase (Firestore + Auth + Hosting) + Cloud Functions.
Same codebase as the web app; the mobile store packaging (Capacitor, Sign in with Apple, etc.)
is the next phase — see the publishing checklist PDF.

## Review workflow (how changes get accepted)
**Never commit directly to `main`.** Each change = a branch → a Pull Request → owner approves
(by clicking the test URL), then it merges. Crazy ideas get closed; `main` stays clean.
Full details: `REVIEW_WORKFLOW.md`. Partner onboarding: `PARTNER_SETUP.md`.

## Secrets
`.env.local`, `.env.production`, and `*service-account*.json` are gitignored and must never be
committed. The committed `.env.development` holds only public web-SDK values (safe to share).
