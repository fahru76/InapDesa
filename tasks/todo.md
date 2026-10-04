# Todo

Working rules: see `CLAUDE.md`. One section per task, newest first. Every task ends with a **Review**.

---

## 2026-10-04 — Adopt the engineering rules (CLAUDE.md) for InapDesa

Goal: AI agents working on this repo follow the adapted "Staff AI Engineer" rules, and the repo actually supports them (one verify command, lint, pinned versions, traceable logs, task/lesson files).

Audit against the rules (done before changing anything):

| Rule | Current state | Action |
|---|---|---|
| Eval/tests first | 70 unit tests (vitest); browser checks only in a throwaway sandbox | Keep; make "failing test first" a rule; e2e smoke suite → backlog |
| Deterministic checks: tests, types, **lint** | `typecheck` + `test` scripts; **no ESLint config**, lint never ran | Add ESLint (eslint-config-next 16.3.8) and fix what it finds |
| One way to verify | Separate commands, nothing ties them together; no CI | Add `npm run verify`; add CI workflow that runs it |
| Pin versions | Lockfile pins packages; **Stripe API version implicit** (SDK default `2026-09-30.endive`); **no Node version** | Pin Stripe `apiVersion` explicitly (same value, no behaviour change); add `engines` + `.nvmrc` |
| Trace every request | 26 ad-hoc `console.*` lines, unstructured, no success/outcome logs | Structured JSON logger (no PII); outcome + duration logs on webhook, payment callbacks, booking create, cron |
| Irreversible actions behind approval | Cancel = dialog with refund choice; photo delete / feed disconnect / new export link = confirm | OK — no change |
| Secrets never in repo/logs | Only `.env.example` (placeholders) tracked; `.env*.local` ignored | OK; logger must not print request bodies or emails |
| Task management | No `tasks/` | Add `tasks/todo.md` (this file) + `tasks/lessons.md` seeded with real lessons |

Plan:

- [x] Write `CLAUDE.md` (adapted rules; keep the `@AGENTS.md` import that `next dev` maintains)
- [x] Create `tasks/lessons.md` with lessons already learned on this project
- [x] Add ESLint flat config + devDeps; run it; fix errors (warnings reported, not mass-fixed)
- [x] Add `verify` script (typecheck → lint → test → build) and `.github/workflows/verify.yml`
- [x] Pin Stripe `apiVersion`; add `engines.node` + `.nvmrc`
- [x] Add `src/lib/log.ts` (JSON lines, PII-safe) + tests; replace `console.*`; add outcome logs on money/integration paths
- [x] Run `npm run verify`; confirm the CI recipe builds with placeholder env only
- [x] Update README (verify command, logging, Node version); commit; deliver to C:\InapDesa with backup + checksum check

Backlog (not in this task):

- [ ] E2E smoke suite in the repo (Playwright against a mock Supabase): listing, checkout, booking pass, host content — currently only run from a sandbox script
- [ ] Error alerting (e.g. Vercel log drain → alert on `level:"error"` for `stripe-webhook`, `billplz-*`, `cron`)
- [ ] Canary: use Vercel preview deployments + a short manual checklist before promoting to production

### Review

- **Rules:** `CLAUDE.md` holds the adapted rules (AI-specific items govern how agents work; the rest govern the app).
  `@AGENTS.md` (maintained by `next dev`) stays as its first line; both files are now committed.
- **Lint:** ESLint 9 + `eslint-config-next@16.3.8`. First run: 7 errors, 1 warning, all fixed in code
  (renamed `children` → `childGuests` on `CheckoutFlow`; prop-change reset pattern instead of `setState` in an effect;
  locale cookie write moved to a module helper; `&rsquo;`; `const`; explicit `if` instead of a ternary statement;
  request time passed into `CancellationSchedule` instead of read during render, with one justified, commented
  `eslint-disable-next-line react-hooks/purity` on the force-dynamic booking page). Now 0 errors, 0 warnings.
- **Verify:** `npm run verify` (typecheck → lint → test → build) passes locally: 78 tests (was 70: +7 logger, +1 Stripe pin).
  CI recipe reproduced in a clean copy (`npm ci`, no `.env.local`, placeholder env): exit 0.
- **Pins:** `STRIPE_API_VERSION = "2026-09-30.endive"` (same as the SDK default, so no behaviour change) with a test that
  fails if an SDK upgrade moves it; `engines.node >=20.9.0`; `.nvmrc` = 22.
- **Tracing:** all 26 `console.*` calls → `log.*` (JSON, PII-redacted). New outcome logs with `ms`: `stripe-webhook.handled`,
  `billplz-callback.handled`, `booking.held` / `booking.rejected`, `cron.done` / `cron.failed` / `cron.unauthorised`.
  Live check: `/api/cron/daily` without auth → 401 and a `cron.unauthorised` JSON line.
- **Left unchanged on purpose:** approval UX (already confirm/dialog-gated); env loading; Billplz return-route logic.
- **Known issue:** `npm audit` shows 5 high advisories in dev-only lint tooling (`braces` ≤3.0.3, no patched release);
  production deps are clean. Not downgrading `eslint-config-next` to v14 (audit's suggested "fix").
