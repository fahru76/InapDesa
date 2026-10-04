# Lessons

Add one entry after every correction or failed attempt: what happened → the rule that prevents it. Newest first.

## Build, tooling, environment
- **Lint never ran because there was no config.** The first ESLint run found 7 real errors (a `children` prop that
  clashed with React's, `setState` inside an effect, a clock read during render). Rule: lint is part of `npm run verify`;
  a check that has never run is not a passing check.
- **Fix the cause, then re-run everything.** Moving `Date.now()` for the lint rule put the variable in the wrong
  component scope; only `tsc` caught it. Rule: after any batch of edits run the full `verify`, not just the check that
  complained.
- **Prefer fresh temp dirs over recursive deletes.** Use `mktemp -d` inside the scratchpad for throwaway copies
  (e.g. CI dry runs) instead of deleting and recreating a folder.
- **Killing processes by name can kill your own shell.** `ps | grep "[m]ock-supabase" | xargs kill` matched the agent's
  own command line (the pattern text was in it) → exit 144. Rule: keep kill commands in a script file and call the
  script; never inline the process name in the same command.
- **Generated agent files come back.** `next dev` rewrites `AGENTS.md`; deleting it only recreates an uncommitted change.
  Rule: commit `AGENTS.md`; put our rules in `CLAUDE.md` below the `@AGENTS.md` line.
- **Local Postgres ≠ Supabase.** A bare local DB lacks Supabase's default grants, so RLS tests gave false
  "permission denied". Rule: create the test DB with `alter default privileges` grants for anon/authenticated/service_role
  before applying migrations; then also verify on the real project (read-only queries).
- **Inline constraints get generated names.** `check (...)` declared on a column is named by Postgres; drop it by
  looking it up in `pg_constraint`, not by guessing the name (see `20261007000000_more_themes.sql`).

## Code
- **JS bit operators are 32-bit.** `Date.now() >> 16` overflowed and produced negative idempotency-key buckets.
  Rule: use `Math.floor(Date.now() / 600_000)` for time buckets; never bit-shift timestamps.
- **Controlled checkboxes that wait for the server feel broken.** The foreign-guest toggle only updated after a
  navigation. Rule: keep optimistic local state, then sync the URL.

## Design & accessibility
- **Contrast is measured, not eyeballed.** "Due at check-in" in zinc-500 on `#f2ece2` was 4.37:1 (fails AA).
  Rule: run axe colour-contrast on every changed page in light and dark; theme colours are unit-tested in
  `src/lib/themes.test.ts`.
- **Swapping a font changes layout.** Libre Bodoni and Cinzel are wider than Cormorant, so the hero title wrapped to
  three lines. Rule: screenshot every theme after a type change; `--display-adjust` (font-size-adjust) normalises size.
- **Past deadlines must look past.** The refund schedule showed an expired cancel-by date as if it were still open.
  Rule: anything time-based renders relative to "now" in the property's time zone.

## Delivery
- **The owner's copy can drift.** Rule: checksum device files against the last delivered commit before overwriting;
  back up first; plain `tar -x` fails on existing files in the connected folder — use `tar --overwrite`.
- **Never overwrite `.env.local`.** Append missing keys with empty values only.
