#!/usr/bin/env bash
#
# Auto-commit + push after each Claude Code turn (mobile dev repo).
#
# Wired up as a Stop hook in .claude/settings.json. After Claude finishes a turn,
# this stages everything, commits it, and pushes to the current branch on origin
# (GitHub). Mirrors the live repo's auto-save behaviour so work is never lost.
#
# Secrets stay safe: .env.local, .env.production and *service-account*.json are
# gitignored, so they are never staged or pushed.
#
# Runs quietly. If there is nothing to commit, it exits without output. When it
# does push, it prints a one-line systemMessage so the user sees the confirmation.

set -euo pipefail

# Move to the repo root regardless of where the hook is invoked from.
root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root" || exit 0

# Nothing changed → exit quietly.
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

branch="$(git branch --show-current)"
[ -z "$branch" ] && exit 0  # detached HEAD — don't auto-commit

git add -A
git commit -q \
  -m "Auto-save: $(date '+%Y-%m-%d %H:%M:%S')" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" >/dev/null 2>&1 || exit 0

if git push -q origin "$branch" >/dev/null 2>&1; then
  printf '{"systemMessage": "Auto-saved & pushed to GitHub (%s)"}\n' "$branch"
else
  printf '{"systemMessage": "Auto-saved locally; push to GitHub failed (offline?) — will retry next turn."}\n'
fi
