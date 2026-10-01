# CLAUDE.md - RHG Intranet

Read this first in every session. The full project picture - what's built, every
decision so far, known limitations and the roadmap - is in
**`docs/project-status.md`**. Read that too at the start of each session, and
check `git log --oneline -15` to see what has landed since it was last updated.

## What this is

Internal company portal for RHG: a dashboard plus a launcher for internal tools
(Expense Claims, Leave Applications, Cost Modelling and Inspection Reporting
built). A working demo for a business case to the directors, live at
https://rhg-intranet-production.up.railway.app (auto-deploys from `main`).

Stack: Nuxt 4 (TypeScript, `ssr: false`), Nuxt UI 4, Pinia, Drizzle ORM on
Supabase Postgres, Supabase Auth (email/password; Microsoft SSO later),
Cloudflare R2, pdfkit, pnpm, Railway.

## How Navin works (follow this exactly)

- **One new session per Step.** Every Step (Step 12, Step 13...) is done in its
  own new session. Don't carry on into the next Step in the same session: when a
  Step is finished and documented, say so and tell Navin to start a new session
  for the next one.
- **Numbered steps.** Work is referred to by Step and sub-step (e.g. "Step 12",
  "12.3"). Use those numbers.
- **Decisions first.** At the start of a Step, say what will be built, split it
  into sub-steps, and put anything ambiguous to Navin as a short numbered
  decision list, each with a recommendation. Wait for his answers.
- **Stop at the end of every sub-step.** Finish the sub-step, run the checks
  below, then STOP with: what was done, what Navin should test (exact steps),
  and what the next sub-step is. **Only continue when Navin says "OK".** He uses
  the stops to ask questions.
- **Don't commit or push** unless Navin asks you to for that sub-step. By
  default he tests, commits and pushes himself.
- **Plain English.** Navin is not a developer. Explain what changed and what to
  click, not internals, unless he asks.
- **Don't assume one change fixes something** - check it (run it, test it).

## At the end of every Step (required)

Before telling Navin the Step is complete, update both documents in the repo:

1. **`docs/project-status.md`** - mark the Step done in the Progress table, add a
   short section with Navin's decisions and known limitations, update test
   counts, migrations and manual SQL lists, add any new clean-up items to
   the Backlog in the Roadmap, and set the next Step. Keep the numbering consistent.
2. **`README.md`** - add a "Step N: <name>" section in the same style as Steps
   10 and 11 (roles, rules, how it fits together, one-time setup, known
   limitations, how it was verified).

Then remind Navin to copy the updated `docs/project-status.md` into the Claude
project (if he still keeps a copy there) and to start a new session for the
next Step.

## Safety - this runs against real systems

- `.env` points at the **real Supabase database**. Always ask before running
  `pnpm db:migrate`, any SQL, or anything that writes data. Never run
  destructive SQL (DELETE/DROP/TRUNCATE) without Navin's explicit OK for that
  exact statement.
- Never print or commit secrets from `.env`.
- Railway does not run migrations: after any schema change Navin (or you, with
  his OK) runs `pnpm db:migrate` locally. Manual SQL in `server/db/manual-sql/`
  is run by Navin in the Supabase SQL editor.
- After new files or auto-imported helpers, restart `pnpm dev` (stale Nuxt
  auto-imports cause "X is not defined" errors).

## Commands and checks

- `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
  (Node's test runner over `tests/*.test.ts`; pure logic, no database).
- `pnpm db:generate` (new migration from the schema), `pnpm db:migrate`.
- **Every sub-step:** `pnpm lint`, `pnpm typecheck` and `pnpm test` must pass
  before stopping. Test any new logic; drive new screens in a browser where you
  can (including phone width).
- The login is a **Supabase cookie** (Step 14, `@supabase/ssr`), sent automatically;
  there is no Bearer header. To call an API route from a signed-in browser console:
  ```js
  fetch('/api/...').then(r => r.json()).then(console.log)
  ```

## Conventions (details and reasons in docs/project-status.md)

- **Tools are data:** a row in `tool_registry` plus `tool_roles`, seeded by
  `server/db/manual-sql/00X_seed_<tool>.sql`. Each tool has its schema in
  `server/db/schema/<tool>.ts`, API under `server/api/tools/<tool-id>/`, pages
  under `app/pages/tools/<tool-id>/`, components in `app/components/<tool-id>/`.
- **Every tool needs** `app/pages/tools/<tool-id>/access.vue` rendering
  `<ToolAccessAdmin tool-id="..." />` and an owner-only "Manage access" button
  on the tool page (the dashboard's new-sign-up banner links to `<route>/access`).
- **Every API route** is gated with `requireToolRole(event, toolId, roles)` and
  branches on the returned `roles` array (never the legacy `role`). The owner
  bypass returns `['owner']`. Team-scoped work uses `server/utils/toolTeams.ts`.
- **All data goes through Nitro API routes with Drizzle** - never supabase-js
  queries from the browser. Client calls use `useApiFetch`.
- **Pure logic in `shared/utils/`** (no DB, no Vue, `.ts` import extensions),
  unit tested in `tests/`. The server and forms use the same code. Give exported
  helpers specific names (Nuxt auto-imports them). Don't `structuredClone` Vue
  reactive objects.
- **When saved records depend on changeable settings**, the server recalculates
  and stores a snapshot plus the results (see Cost Modelling).
- **Dates:** stored as ISO `YYYY-MM-DD`, shown/typed as **dd/mm/yyyy** via
  `shared/utils/dates.ts`; "today" is the Asia/Kuala_Lumpur date (`todayMY`).
- **Errors on screen:** use `errorText(err)` (`app/utils/errorText.ts`) and
  plain, specific server messages.
- **Files:** R2 via presigned URLs, key `<tool-id>/<yyyy>/<mm>/<uuid>-<name>`;
  each tool checks ownership itself before giving a download link.
- Tests use fake data only; test accounts need valid v4 UUIDs.
