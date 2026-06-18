# START HERE — ARTickle Academy Mobile App Playbook

This is the single master reference for turning ARTickle Academy into a mobile app on the
**Apple App Store** and **Google Play**, built safely with a partner, without touching the live
app. Read top to bottom once; then work the "Your next actions" list at the bottom.

> Legend: **[Claude]** = I do it (coding/config) · **[You]** = needs your accounts/clicks ·
> ⚠ = blocker/important · ✅ = already done.

---

## 0. What you have right now (already done ✅)
- ✅ **Isolated workspace** = this folder `artickle-academy-mobile` — a separate copy of the app.
- ✅ **Separate GitHub repo:** https://github.com/konterbassawy-arch/artickle-academy-mobile
- ✅ **Separate database:** points at the **`articklebeta`** Firebase project (a copy), never the
  live `artickle-academy` project. A safety guard stops it from ever starting on the wrong one.
- ✅ **DEV · TEST APP banner** shows on every screen so you can't confuse it with the live app.
- ✅ **Restore script** (`scripts/restore-from-backup.ts`) to load real data into the dev copy.
- ✅ **Docs:** `PARTNER_SETUP.md`, `REVIEW_WORKFLOW.md`, and `CLAUDE.md`.

## 1. The goal & the approach
The live app is a **website** (React + Vite on Firebase). Stores only accept "apps," so the
website must be **wrapped in a native shell**. The right tool is **Capacitor** — it puts the
existing website inside an iPhone/Android app container, one codebase for both stores. No rebuild.

---

## 2. The build roadmap (in order)

### Phase A — Make the code store-ready  **[Claude] ~½–1 day**
- ⚠ **Bundle the CDN code locally.** The app currently downloads React, Tailwind, jsPDF,
  SheetJS, JSZip and Firebase from the internet at startup (`index.html` + `context/AppContext.tsx`).
  Apple rejects apps that fetch code at runtime (guideline 2.5.2), and it breaks offline. Fix =
  install these with npm and bundle them in. **This is the #1 blocker.**
- Add a service worker for offline reliability (minor).

### Phase B — Wrap with Capacitor  **[Claude] ~1 day**
- Add Capacitor, generate the iOS and Android projects, point them at the built web app.
- Generate app icons + splash screens from your logo. **[Claude] ~1–2 hrs**

### Phase C — Required store features  **[Claude] ~1–1.5 days**
- ⚠ **In-app account deletion.** Both stores require a logged-in user to delete their own
  account from inside the app. (Apple 5.1.1(v) / Google.)
- ⚠ **Sign in with Apple.** Mandatory on iPhone because the app already offers **Google login**
  (Apple guideline 4.8). iPhone-only; Android/website unaffected. Needs the Apple account active
  to create a "Services ID" key. **[You] ~30 min in Apple portal (I guide).**

### Phase D — Store accounts, assets & legal  **[You] + [Claude]**
- **[You]** Apple Developer Program — **$99/year** (needs a Mac with Xcode).
- **[You]** Google Play Developer — **$25 one-time**.
- **[You + Claude]** Screenshots (per device size), app description, keywords, category.
- **[You, Claude drafts]** Privacy policy URL (can host on Firebase).
- **[You]** Apple Privacy "Nutrition Label" + Google Play Data Safety form; age/content rating.

### Phase E — Build, sign & submit  **[You, fully guided]**
- Set bundle id `com.artickle.academy`, version, build number.
- **iOS:** Archive in Xcode → upload to App Store Connect → test via TestFlight → submit.
- **Android:** build an **AAB** → upload to Play Console → internal test track → submit.
- Review times: Apple ~1–2 days; Google hours–1 day.

**Coding effort total: ~3.5–5 working days. Calendar time to live: ~2–4 weeks** (mostly Apple
account approval + store review).

---

## 3. Costs (what you actually pay)
| Item | Cost | When |
|---|---|---|
| Claude **Max 5×** plan (to do the build) | **$100** | per month (project fits in ~1 month) |
| Apple Developer Program | **$99** | per year |
| Google Play Developer | **$25** | one-time |

**≈ $224 to launch.** On a subscription you're **not billed per token** — flat fee + usage limits.
Use **Opus 4.8** for the build (most reliable, since you're not coding).

---

## 4. Data — dev copy now, real data at launch
- The live app already emails a **full nightly backup ZIP** of all data. **[You]** grab the latest
  one (and create an `articklebeta` service-account key in the Firebase console), hand them to me,
  and **[Claude]** seeds the dev copy so you build against realistic data.
  - Command: `npm run restore -- --zip <backup.zip> --project articklebeta --key <key.json>`
- ⚠ Backups hold **data only, not login accounts.** In the dev app you log in fresh (your email is
  in `VITE_MASTER_ADMIN_EMAILS` → auto-admin).
- **At launch:** the finished mobile app simply points at the **real** `artickle-academy` project
  and shares the live database — no risky data migration needed.

## 5. Working with your partner (the "good ideas only" gate)
- Partner is a **collaborator on this repo only** — zero access to the live app. **[You invite]**
- ⚠ **Turn on branch protection** (repo → Settings → Branches → require Pull Request + 1 approval).
  Then **nothing reaches the app until you approve it.**
- For each change: partner opens a Pull Request, describes it in plain English, and deploys it to
  the test URL so you can click through it. You **Approve** (it merges) or **Close** (it vanishes).
- Ask me to "review PR #N" any time and I'll explain it in plain English.
- The two repos don't auto-sync (on purpose). When something's good, I port it across on request.

## 6. Updating after launch
- **Small fixes / content** → can be pushed **instantly** (with a live-update setup), no review wait.
- **New features** → a fresh submission + store review (Apple ~1 day, Google hours–1 day).
- So it's **not** "wait for approval every time" — only meaningful new features get reviewed.

---

## 7. YOUR NEXT ACTIONS (do these, then tell me)
1. **Open this folder as its own Claude project** (top of window → Open project → `artickle-academy-mobile`).
2. **Confirm `articklebeta` is free to use** as the partner sandbox (it'll be filled with a data copy).
3. In the **Firebase console → `articklebeta` → Authentication**, enable **Email/Password** + **Google**.
4. **Invite your partner** on the GitHub repo + **turn on branch protection** (Section 5).
5. **Send me** the latest **nightly backup ZIP** + an **`articklebeta` service-account key** to seed data.
6. Open the **Apple ($99/yr)** and **Google ($25)** developer accounts (Apple approval takes 1–2 days — start early).

Then say **"start Phase A"** and I'll begin the coding (bundle the CDN code → Capacitor → required features).

---

## Quick reference
- **This (dev) project:** `articklebeta` · https://articklebeta.web.app · banner says "(Dev)"
- **Live (don't touch):** `artickle-academy` · https://artickle-academy.web.app
- **Repo:** https://github.com/konterbassawy-arch/artickle-academy-mobile
- **Run locally:** `npm install` then `npm run dev` (http://localhost:3000)
- **Deploy to test URL:** `npm run deploy:dev`
- **Seed data:** `npm run restore -- --zip <zip> --project articklebeta --key <key.json>`
- **Key files:** `context/AppContext.tsx` (Firebase config), `index.html` (CDN scripts to bundle),
  `.env.development` (dev config), `scripts/restore-from-backup.ts`.
- Full publishing detail: `ARTickle-Academy_App-Store-Publishing-Checklist.pdf` in this folder.
