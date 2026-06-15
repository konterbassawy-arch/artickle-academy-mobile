# Review Workflow — taking the good ideas, dropping the rest

This repo is set up so **nothing reaches `main` without the owner's approval**. You don't
need to read code to stay in control — you judge changes by *seeing them run* on the test URL
plus a plain-English description.

## The rule

`main` is **protected**: it cannot be changed directly. Every change must arrive as a
**Pull Request (PR)** that the owner approves. Crazy ideas simply never get approved, and
`main` stays clean.

> One-time setup by the owner (GitHub → repo → Settings → Branches → Add branch ruleset):
> protect `main`, require a Pull Request, and require **1 approval** before merging.

## For each change (partner)

1. Work on a branch, not `main`.
2. Open a PR with:
   - **What & why**, in plain English (no jargon).
   - A link to the change running on **https://articklebeta.web.app** (`npm run deploy:dev`).
3. Wait for the owner's decision.

## For each change (owner) — the 3-minute review

You don't read code. You do this:

1. Open the PR. Read the partner's plain-English description.
2. Click the test URL and **try the change yourself**.
3. Decide:
   - 👍 **Good idea** → click **"Approve"** then **"Merge"**. It's now part of the app.
   - 👎 **Crazy idea** → click **"Close pull request"**. It vanishes; `main` is untouched.
   - 🤔 **Not sure** → leave a comment asking for a change, or ask me (Claude) to explain the
     PR in plain English and flag any risk.

## Why this is safe

- The partner can experiment freely on branches and the test URL.
- The live app and real data are in a different project entirely — out of reach.
- Only changes you personally approved ever land in `main`.
- At launch, only the reviewed `main` becomes the real mobile app.

## When you want a second opinion

Ask me to "review PR #N" — I'll summarize what it actually changes, in plain English, and
call out anything risky before you approve.
