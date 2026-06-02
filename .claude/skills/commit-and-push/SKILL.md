---
name: commit-and-push
description: |
  Use this skill whenever the user wants to commit changes and/or push to GitHub. Trigger on phrases like:
  "make a commit", "commit my changes", "push to GitHub", "save to git", "commit and push",
  "upload to GitHub", or any variation implying a git commit or push to a remote repository.

  This skill guides the user through a safe, interactive commit-and-push flow:
  1. Inspect what changed
  2. Suggest a commit message and get approval
  3. Commit only after approval
  4. Ask again before pushing

  Always use this skill — never silently run `git commit` or `git push` without approval.
---

# Commit & Push — Interactive Git Flow

Walk the user through committing and pushing changes **safely, with explicit approval at each step**. Never commit or push without confirmation.

---

## Step 1 — Inspect the current state

Run these in parallel to get an overview:
```bash
git status
git diff --stat HEAD
git diff --name-status HEAD
git branch --show-current
git remote -v
git log --oneline -5
```

**Do not run `git diff HEAD` (full diff) automatically** — it can be enormous. If you need to understand specific changes to write a good commit message, run targeted diffs on individual files:
```bash
git diff HEAD -- <specific-file>
```
Only do this for a few key files, not everything.

Summarize what you find clearly. Example format:

> **Changes detected** (branch: `feature/canvas` → remote: `origin`):
> - `src/App.tsx` — modified
> - `src/api/drawingApi.ts` — new file
> - `README.md` — modified

If there are **no changes** (clean working tree), tell the user and stop — nothing to commit.

If there are **untracked files** that look relevant (not build artifacts, `node_modules`, `.next/`, `dist/`, etc.), mention them and ask whether to include them.

---

## Step 2 — Suggest a commit message and ask for approval

Based on what you've seen, suggest a commit message that:
- Is concise (under 72 characters)
- Describes what changed and why — not just "updated files"
- Uses present tense: "add", "fix", "update"

Present it clearly and wait for approval before doing anything:

> **Suggested commit message:**
> ```
> add drawing save/load API client
> ```
> Does this look good? You can approve it, suggest a different message, or ask me to skip.

Do not proceed until the user responds.

---

## Step 3 — Secrets check before staging

Before touching `git add`, scan the files to be staged for secrets. Flag and refuse to stage any of these:

**Sensitive file patterns:**
- `.env`, `.env.*`
- `appsettings.json`, `appsettings.Development.json`, `appsettings.Production.json`
- `*.pem`, `*.key`, `*.p12`, `*.pfx`
- `id_rsa`, `id_ed25519`, `*.ppk`
- Any file in a `secrets/` or `credentials/` directory

**Sensitive content patterns** (grep the files before staging):
- `password`, `passwd`, `secret`, `apiKey`, `api_key`, `token`, `bearer`, `private_key`

If any are found, show the user exactly which file/line triggered the warning and ask how to proceed. Do not stage that file.

---

## Step 4 — Stage and commit (only after approval)

Once the user has approved the message and secrets check is clear:

1. **Stage files** — prefer specific file names over `git add -A` to keep control over what goes in.

2. **Create the commit:**
```bash
git commit -m "<approved message>"
```
Optionally append a `Co-Authored-By` trailer if Claude contributed meaningfully to the code (not just the commit flow). Skip it if the user prefers clean history.

3. Confirm to the user that the commit was created (show the short hash).

**Safety rules — never break these:**
- Never use `--no-verify`
- Never use `--amend` unless the user explicitly asked
- Never commit files flagged in the secrets check

---

## Step 5 — Ask before pushing

After the commit, **stop and ask** — do not push automatically. You already have the branch and remote from Step 1, so just confirm:

> **Commit created (`abc1234`).**
> Push branch `feature/canvas` to `origin` on GitHub?

If the branch is `main` or `master`, add a note:
> ⚠️ You are on `main` — this push goes directly to the main branch.

Wait for explicit confirmation.

---

## Step 6 — Push (only after approval)

Once the user confirms:
```bash
git push origin <branch-name>
```

Never use `--force` or `--force-with-lease` unless the user explicitly asked and understands the consequences. If they ask to force-push `main`/`master`, warn strongly and ask to confirm a second time.

Report success after the push completes.

---

## Error handling

- **Pre-commit hook fails**: Do not bypass (`--no-verify`). Show the hook output and help fix the underlying issue before retrying.
- **Push rejected** (diverged branch): Explain the remote has commits the local branch doesn't have. Suggest `git pull --rebase` and ask before running it.
- **No remote configured**: Tell the user and ask if they want to add one.

---

## If the user says "commit only, don't push"

Skip Steps 5 and 6 entirely. After committing, just confirm it's done — do not ask about pushing.
