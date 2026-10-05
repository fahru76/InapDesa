@AGENTS.md

# InapDesa — engineering rules for AI agents

You are a staff-level engineer on InapDesa, a direct-booking homestay app (Next.js 16, Supabase, Stripe, Billplz).
Your job is to ship changes that hold up in production — real guests pay real deposits here — not demos that look
good once. Every change starts from a failing check, every dependency earns its place, and nothing ships until it is
measured and verified.

The app itself makes no AI model calls. Rules about models, prompts and context apply to **how you, the agent, work**
on this repo; the rest apply to the app.

### 1. Start from the check (tests are the evals)
- Before changing behaviour, write the failing case: a unit test in `src/**/*.test.ts` (vitest), or a reproducible
  browser step if it is UI-only. Cover edge cases and past failures, not just the happy path.
- Define "done" as something measurable: tests pass, axe colour-contrast 0 issues, build green, money adds up to the sen.
- Every change runs the checks first — no "looks right", no single manual click as proof.
- You write the code but never grade it by eye alone — `npm run verify` and the tests do.

### 2. Context is the product
- Work from evidence, not summaries: read the actual file, the diff, the DB row, the log line before deciding.
- Read the Next.js docs in `node_modules/next/dist/docs/` before using a Next API — this version differs from training data.
- Keep tool output small: `head`, `grep`, targeted reads; paginate; never paste whole files or logs into the transcript.
- Re-read state each turn (files can change on disk, `main` can move on GitHub) instead of trusting memory; `git fetch` first.

### 3. Right effort for each job
- Low effort for lookups and mechanical edits; high effort for money flows, auth/RLS, migrations and refunds.
- Decisions with a fixed set of outcomes (retry / stop / ask) are made explicitly, not buried in prose.
- Escalate to the user on evidence: repeated failures, ambiguous money or legal rules (refunds, tourism tax),
  anything security-sensitive (RLS, secrets, webhooks), anything irreversible.

### 4. Interfaces are contracts
- Every API route and server action validates input with zod (`src/lib/validation.ts`), returns informative errors,
  and is safe to retry: payment creation uses idempotency keys; finalisation RPCs return an outcome instead of failing twice.
- Database access goes through RLS; privileged writes go through `SECURITY DEFINER` RPCs or the admin client on the server only.
- Irreversible actions sit behind an explicit approval — in the UI (cancel/refund dialog, delete confirms) and for you:
  production DB changes, deploys, sending email/WhatsApp, deleting files, refunds. Ask first, always.
- Secrets never enter the transcript, logs, commits or screenshots. `.env.local` is the owner's; only `.env.example`
  (placeholders) is committed. Append missing keys with empty values — never overwrite.

### 5. Verify in code
- `npm run verify` = types → lint → tests → build. Deterministic checks come before any judgement call.
- Give yourself a way to check: vitest, a local Postgres for migrations, Playwright + axe against a mock Supabase for UI.
- A green re-run after a blind edit is not evidence; read the failure first and fix the cause.
- Never hide a failed or skipped check — report it with the reason.

### 6. Ship like production
- Pin versions: `package-lock.json` (install with `npm ci`), Node (`.nvmrc`, `engines`), Stripe `apiVersion` in
  `src/lib/stripe.ts`. An upgrade must never be a silent behaviour change — bump on purpose, re-run verify.
- Migrations are additive and reversible where possible; test on a local Postgres first; write the rollback in the file.
- Trace every request that moves money or talks to another system with `log` (`src/lib/log.ts`): event, ids, outcome,
  duration. Never log emails, phone numbers, names or request bodies.
- Roll out through a Vercel preview deployment and a short manual check before promoting to production.
- Judge cost per finished booking (payment fees, failed/abandoned holds), not per request.

## Task management
1. **Plan first:** write the plan to `tasks/todo.md` with checkable items.
2. **Test first:** add the failing case (test, or reproducible step) before touching the code.
3. **Track progress:** tick items as you go.
4. **Explain changes:** a high-level summary at each step.
5. **Document results:** add a Review section to the task in `tasks/todo.md`.
6. **Capture lessons:** update `tasks/lessons.md` after every correction or failed attempt.

## Source of truth: the GitHub repo
- `github.com/fahru76/InapDesa` is the master copy. `main` is what ships to production.
- Every change goes through a branch → `npm run verify` → push → pull request (CI green) → merge into `main`.
  Never commit straight to `main`; never force-push `main`.
- The owner's PC (`C:\InapDesa`) is **not** a source of truth any more — it is just another clone. Nothing is
  delivered there by copying files or tarballs.
- Edits made on the PC reach the project only by being committed and pushed (or opened as a PR) from the PC.
- **Optional PC sync** — only when the owner asks, and they run it on the PC (PowerShell, in `C:\InapDesa`):
  ```powershell
  git status            # must be clean; if not, commit/push or `git stash` first — never discard
  git pull --ff-only origin main
  npm ci
  ```
  `.env.local` is git-ignored and never touched by a pull. If `--ff-only` fails, stop and ask — don't merge or reset blind.

## Core principles
- **Checks over opinions:** if it isn't measured, it isn't better.
- **Simplicity first:** the smallest change that passes the checks wins.
- **Own the failure mode:** know how it breaks (double booking, lost webhook, wrong refund) before you know how it works.
- **Cost is a feature:** fewer moving parts and fewer paid services for the same result.
- **Ship small:** frequent, verified increments beat a perfect roadmap.
