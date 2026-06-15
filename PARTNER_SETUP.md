# Partner Setup — ARTickle Academy (Mobile)

Welcome. This is the **isolated** workspace for building the mobile version of ARTickle
Academy. It is completely separate from the live app:

- **Database:** this app talks to the `articklebeta` Firebase project — a copy seeded with a
  snapshot of real data. **It is NOT the live database.** Nothing you do here can affect the
  production app or real users.
- **Test URL:** your work deploys to **https://articklebeta.web.app** — never the live site.

## 1. One-time setup

You need [Node.js](https://nodejs.org) (v20+) and Git installed.

```bash
git clone <this-repo-url>
cd artickle-academy-mobile
npm install
```

The Firebase config for the dev project is already committed in `.env.development` (the
values are public web keys, safe to share), so there's nothing else to configure to run it.

## 2. Run it locally

```bash
npm run dev
```

Then open http://localhost:3000. Log in with the test admin account (the owner will add your
email to `VITE_MASTER_ADMIN_EMAILS` in `.env.development` so your first login becomes admin).

## 3. Deploy your work to the test URL (so the owner can review it live)

```bash
npm run deploy:dev
```

This builds and deploys to **https://articklebeta.web.app**. You'll need to be logged into
the Firebase CLI once: `npm i -g firebase-tools && firebase login`.

> You can only deploy to the dev project. The production project is not configured here.

## 4. How changes get accepted

**Never commit straight to `main`.** Every change goes through review:

1. Create a branch: `git checkout -b my-idea`
2. Make your change, commit, push: `git push -u origin my-idea`
3. Open a **Pull Request** and:
   - write a **plain-English description** of what it does and why, and
   - run `npm run deploy:dev` so the owner can click through it on the test URL.
4. The owner reviews and either approves (it merges) or closes it.

See [REVIEW_WORKFLOW.md](REVIEW_WORKFLOW.md) for the full process.

## What's here / what's not

- The mobile app reuses the existing web codebase. Mobile packaging (Capacitor, Sign in with
  Apple, etc.) is tracked separately — ask the owner for the publishing plan.
- Secrets (`.env.local`, service-account JSON) are **gitignored** and never committed.
- `scripts/restore-from-backup.ts` re-seeds the dev database from a nightly backup ZIP
  (owner-run; needs a dev service-account key).
