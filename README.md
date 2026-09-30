# RHG Intranet

Internal company portal: Nuxt 4 + TypeScript + Nuxt UI 4 + Pinia + Drizzle ORM
(Supabase Postgres) + Cloudflare R2, deployed on Railway. A dashboard plus a
launcher for internal tools. Built so far: Expense Claims (Step 7), Leave
Applications (Step 10) and Cost Modelling (Step 11). The sections below are written step by step; the
"What's here so far" list and the Step 2 to 5 wording describe the state at
that step, so later step sections win where they differ. The project status
document, `docs/project-status.md`, has the current overview, decisions and
roadmap; `CLAUDE.md` has the working rules for Claude Code sessions.

Useful commands: `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
(unit tests, no database needed), `pnpm db:generate`, `pnpm db:migrate`.

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the env template and fill in real values:

   ```bash
   cp .env.example .env
   ```

   You'll need, at minimum, your Supabase Project URL, anon key, and the two
   database connection strings (direct + pooled) from Project Settings → API
   and Project Settings → Database. R2 and Microsoft SSO values aren't needed
   yet — those come in later steps.

3. Run the dev server:

   ```bash
   pnpm dev
   ```

   Visit http://localhost:3000 — you should see a placeholder dashboard page
   that also calls a Nitro API route (`/api/dashboard/summary`) to confirm
   the server layer is wired up.

## What's here so far

- `app/` — Nuxt 4 app directory (pages, app.vue, app.config.ts)
- `app/stores/` — Pinia stores go here (empty for now, added per-tool later)
- `app/composables/` — shared composables (empty for now)
- `server/api/` — Nitro server routes, organised by feature
  (`dashboard/`, `tools/`, `storage/`)
- `server/db/client.ts` — Drizzle client using Supabase's pooled connection
- `server/db/schema/` — Drizzle table definitions (empty placeholder for now
  — Step 3 adds `core.ts`, then one file per tool)
- `server/middleware/` — Nitro middleware (auth check added in Step 4)
- `server/utils/` — shared server utilities (R2 client added in Step 5)
- `drizzle.config.ts` — points `drizzle-kit` at the schema and the **direct**
  (non-pooled) Supabase connection, used only for running migrations

## Step 3: running the database migration

The schema (`server/db/schema/core.ts`) defines four foundation tables:

- `profiles` - one row per user, mirrors Supabase Auth's `auth.users`, plus
  an `is_owner` flag for whoever should see and manage everything
- `tool_registry` - the catalogue of tools (expense-claims, inspections, etc.)
- `tool_roles` - role definitions scoped per tool (e.g. inspections has
  inspector/approver/viewer; a simple tool can just use a generic `user` role)
- `user_tool_roles` - who has which role in which tool

To apply this to your actual Supabase database:

```bash
pnpm db:migrate
```

This reads `NUXT_SUPABASE_DB_URL` from your `.env` (the **direct** connection)
and applies the SQL file(s) in `server/db/migrations/`. Run it once now, and
again any time a new migration is generated.

If you ever change `server/db/schema/*.ts` yourself, generate the new
migration file first, then apply it:

```bash
pnpm db:generate   # diffs your schema changes into a new SQL file
pnpm db:migrate    # applies it to the database
```

You can also browse your data visually:

```bash
pnpm db:studio
```

This opens Drizzle Studio in the browser, pointed at whichever DB URL is in
your `.env`.

**Verified:** this migration was test-run against a real local Postgres
instance during development (not just typechecked) - all four tables,
foreign keys, and the composite `(tool_id, role_key)` constraint on
`user_tool_roles` were confirmed to apply and query correctly, and
`/api/tools` was confirmed to return real data through the full stack.

## Step 4: authentication

Auth uses Supabase Auth (email/password for now — Microsoft 365 SSO gets
added before company-wide rollout, once this has been approved as a proper
project). How it fits together:

- **Client side**: `app/plugins/supabase.client.ts` creates a Supabase
  browser client, used only for sign in / sign up / sign out. All actual
  *data* still goes through our own Nitro API + Drizzle, never through
  `supabase-js` directly.
- **`app/stores/auth.ts`** (Pinia) holds the current session, user, and
  profile, and exposes `signIn`, `signUp`, `signOut`.
- **`app/composables/useApiFetch.ts`** — use this (not plain `$fetch`) for
  any call to our own `/api/...` routes that needs to know who's calling.
  It attaches the Supabase access token as a Bearer header automatically.
- **`server/middleware/auth.ts`** validates that Bearer token on every
  `/api/*` request and attaches the verified user to `event.context.user`.
- **`server/utils/requireUser.ts`** — `requireUser()`, `requireProfile()`,
  and `requireOwner()` are the building blocks every protected API route
  uses to enforce auth (and, once we build tools, per-tool roles).

### One-time setup after applying this step

1. Apply the SQL trigger that auto-creates a `profiles` row whenever
   someone signs up. This is a manual step (not a Drizzle migration)
   because it touches Supabase's own `auth` schema: open
   **Supabase Dashboard → SQL Editor → New query**, paste in the contents
   of `server/db/manual-sql/001_handle_new_user.sql`, and run it once.

2. Run `pnpm dev`, go to `/login`, and sign up with your own email. Check
   your email for the confirmation link (Supabase's default email
   templates handle this) and confirm the account.

3. Sign in. The dashboard will show a **"Claim owner access"** button as
   long as no owner has been set yet — click it. This calls
   `/api/auth/claim-owner`, which only succeeds once, for the first person
   to click it. That's you; you now have `is_owner = true` and, once we
   build permission checks into each tool, this bypasses all of them.

### Known limitation (fine for a demo, revisit before company-wide rollout)

Route protection (`app/middleware/auth.global.ts`) only runs client-side —
the session lives in the browser, not in a cookie Nuxt's server render can
see. In practice this means: **actual data is safe** (every `/api/*` route
is protected server-side, verified above), but the empty page shell for a
protected page briefly renders on the very first server response before the
client redirects an unauthenticated visitor to `/login`. For an internal
demo this is a non-issue. Before a real company-wide launch, switch to
`@supabase/ssr` for proper cookie-based sessions so protected pages never
render server-side for a logged-out visitor either.

**Verified:** typecheck and lint pass clean; the dev server was booted
against a real local Postgres and confirmed: `/api/auth/owner-status`
correctly reports no owner yet, `/api/auth/me` correctly rejects
unauthenticated requests with 401, and both `/login` and `/` render the
expected content server-side. Signing up/in against a *real* Supabase
project couldn't be tested from this sandbox (no network access to
supabase.co here) — that part needs to be confirmed on your end.

## Step 5: Cloudflare R2 storage

Files (receipts, inspection photos, generated reports, etc.) are stored in a
single R2 bucket, organised by a `toolId` prefix rather than separate
buckets per tool (R2/S3 has no real "sub-buckets" - see the discussion that
led to this in the project history). A key looks like:

```
expense-claims/2026/09/3f9c2b1a-...-receipt.jpg
inspections/2026/09/9e7d4c22-...-photo.jpg
```

How it fits together:

- **`server/utils/r2.ts`** - the S3 client (pointed at R2's endpoint) plus
  three reusable functions: `buildObjectKey()`, `getUploadUrl()`,
  `getDownloadUrl()`. Every future tool's file handling builds on these.
- **`server/api/storage/upload-url.post.ts`** - any signed-in user can
  request a presigned PUT URL for a *new* file under a given tool's prefix.
  The browser then uploads directly to R2 - the file never passes through
  our own server.
- **`server/api/storage/download-url.get.ts`** - presigned GET URL for a
  given key. **Important caveat:** this only checks that the caller is
  signed in, not whether they should see that *specific* file - it's a
  generic convenience for this stage, relying on keys being unguessable
  UUIDs rather than real authorization. Once a tool has its own table
  referencing a key (e.g. `expense_claims.receipt_key`), that tool's own API
  route should check DB-level ownership/role first and call
  `getDownloadUrl()` directly - not proxy through this generic route.
- **`app/composables/useR2Storage.ts`** - client-side `uploadFile(toolId, file)`
  and `getDownloadUrl(key)`, so building a tool's upload UI later is just a
  few lines, not re-implementing this flow each time. (Named `useR2Storage`
  rather than `useFileUpload` because Nuxt UI 4 already ships its own
  `useFileUpload` composable for its dropzone component - this avoids
  silently shadowing it.)

**Verified:** typecheck and lint pass clean. Presigned URL generation is
pure local signing (no network call needed to produce the URL itself), so
this was tested directly against the AWS SDK with fake credentials and
confirmed to produce correctly-formed, correctly-signed R2 URLs
(`AWS4-HMAC-SHA256`, virtual-hosted-style `bucket.accountid.r2.cloudflarestorage.com`).
Both endpoints were also confirmed to correctly reject unauthenticated
requests. An actual authenticated upload/download round-trip against your
*real* R2 bucket couldn't be tested from this sandbox (no network access to
`cloudflarestorage.com` here). To confirm it on your end, a temporary
`app/pages/test-r2.vue` page is included - visit `/test-r2` once signed in,
pick a file, click "Upload to R2", then "Get download link" to confirm the
full round trip. **Delete this file once you've confirmed it works** - it
has no place in the real app.

## Notes

- `.env` is gitignored — never commit real credentials. `.env.example`
  documents every variable the project will eventually need.
- Migrations always run against the direct connection (port 5432);
  the running app always uses the pooled connection (port 6543).

## Step 6: Tool registry + dashboard shell

Before any real tool existed, this step built the mechanism every tool
plugs into, and the dashboard page that lists them.

- **`tool_registry`** (added in Step 3) is the single source of truth for
  which tools exist. Nothing about tools is hardcoded in the frontend -
  adding a tool later means adding a row here (plus its own schema, API
  routes, and pages), not editing a shared list somewhere.
- **`app/composables/useTools.ts`** - fetches the tools the current user can
  see (owner sees everything; everyone else sees only tools where they have
  a `user_tool_roles` row) and exposes them to any page that needs the list.
- **`server/api/tools/index.get.ts`** - the API route behind that composable.
  Auth-protected like every other `/api/*` route, via the same middleware
  from Step 4.
- **Dashboard (`app/pages/index.vue`)** - now renders the tools this user
  can see as launcher cards, instead of the Step 2 placeholder. A user with
  no tool roles yet (and no `is_owner`) sees an empty dashboard rather than
  an error - this is expected until roles are assigned.

**Verified:** typecheck and lint pass clean; manually confirmed that the
owner account sees every registered tool and a second test account with no
`user_tool_roles` rows sees an empty dashboard, before any tool actually
existed to click into.

## Step 7: Expense Claims (first full tool)

The first real tool, and the template every future tool copies. It covers
the full lifecycle: an employee submits a claim with a receipt, a manager
approves it, and periodically a manager runs a payroll report that bundles
every approved claim into a PDF and marks them paid.

### Roles and workflow

- **Roles** (tool: `expense-claims`): `employee` and `manager`. As with every
  tool, `profiles.is_owner` bypasses these checks entirely.
- **Status flow:** `submitted` → `approved` → `paid`. There is no "rejected"
  status by design - a manager who has an issue with a claim raises it with
  the employee directly, who then edits or deletes the claim themselves
  (only possible while it's still `submitted`).
- **Categories** are a fixed Postgres enum, not free text: Travel – National,
  Travel – International, Parking, Staff Wellness Day, Office Refreshments
  and Amenities, Medical Claim, Entertainment.

### How it fits together

- **`server/db/schema/expenseClaims.ts`** - the `expense_claims` table plus
  `expense_payout_batches`, which logs every payroll report run (who ran it,
  when, how many claims, total amount, and the generated PDF's R2 key) so
  batches can be re-downloaded later.
- **`server/utils/requireToolRole.ts`** - the reusable per-tool permission
  gate every route below uses, and the pattern every future tool's routes
  should follow: owner bypasses, everyone else needs a matching
  `user_tool_roles` row.
- **`server/api/tools/expense-claims/claims/*`** - submit, list (scoped by
  role - *superseded in Step 9: managers now see only their own team*),
  get-one (with a permission-checked receipt download URL), edit and delete
  (employee, own claim, only while `submitted`), and approve (manager only).
- **`server/api/tools/expense-claims/reports/*`** - `POST` pulls every
  `approved` claim, builds the PDF, uploads it to R2, logs a batch row, and
  marks those claims `paid`. `GET` lists past batches; `GET /:id` re-issues a
  fresh download URL for an older batch's PDF (the original one expires
  after 5 minutes, same as every other R2 presigned URL in this app).
- **`server/utils/generateExpenseReportPdf.ts`** - builds the report with
  `pdfkit`: one section per employee (Date / Category / Description /
  Amount table, then a subtotal), titled by the month the report is *run*
  in, with a grand total at the end.
- **`app/pages/tools/expense-claims/index.vue`** - fetches the caller's role
  via `my-role.get.ts` and renders either `EmployeeView.vue` (submit form +
  own claims, inline edit/delete) or `ManagerView.vue` (approval queue,
  approved-and-ready-for-payout list, "Run payroll report" button, report
  history) from `app/components/expense-claims/`.

### One-time setup after applying this step

1. Add the new dependency: `pnpm add pdfkit` and `pnpm add -D @types/pdfkit`.
2. Run the schema migration: `pnpm db:generate && pnpm db:migrate`.
3. Register the tool: open **Supabase Dashboard → SQL Editor**, paste in the
   contents of `server/db/manual-sql/002_seed_expense_claims_tool.sql`, and
   run it once. This creates the `tool_registry` row and the `employee` /
   `manager` role definitions in `tool_roles` - it does **not** assign any
   actual person a role yet.
4. Assign roles manually until an admin screen exists (see known limitation
   below), e.g.:
   ```sql
   insert into public.user_tool_roles (user_id, tool_id, role_key)
   select id, 'expense-claims', 'employee'
   from public.profiles
   where email = 'someone@example.com';
   ```

### Known limitations (fine for the demo, worth revisiting)

- ~~**No admin screen for assigning tool roles yet.**~~ *Resolved in Step 9 -
  roles are now assigned from each tool's Manage access screen.*
- **Deleting a claim doesn't delete its R2 receipt object** - it becomes an
  orphaned file. Harmless (private bucket, unguessable key), but a cleanup
  job could be added later if storage cost or hygiene ever matters.
- **The PDF table doesn't measure per-cell wrapped-text height** - a very
  long description can visually crowd the row below it. Fine for normal
  short descriptions.
- **Report title uses the month the report is *run* in**, not the months
  the underlying expenses were incurred in. A claim submitted late in one
  month and approved/paid the next will appear under the later month.
- A couple of Nuxt UI 4 component usages (`USelect` items shape, `UTextarea`
  existing) were written from the patterns already in this codebase rather
  than verified against the exact installed version's docs - confirmed
  working by manual testing, but worth a second look if either component
  ever needs to change.

**Verified:** this step's schema, API routes, and pages were built and
reviewed in a separate assistant session (no shared sandbox with your real
Supabase/R2 credentials, unlike Steps 1-5's local-Postgres testing), then
manually tested end-to-end by you against the real app: submitting,
editing, and deleting a claim as an employee; approving a claim and running
a full payroll report (including the generated PDF) as a manager;
`pnpm typecheck` and `pnpm lint` both pass clean on the final code.

## Step 8: Deployment (Railway)

The app is deployed as a live demo at:

**https://rhg-intranet-production.up.railway.app**

### Platform

Hosted on **Railway**, connected directly to this GitHub repo. Railway runs
Nuxt's default Node server (`nuxt build` then its built-in start command) -
no custom server code or Dockerfile was needed. Auto-deploy is on: every
push to `main` triggers a new build and release, and a failed build leaves
the previous working deployment running rather than taking the site down.

**Database migrations are not part of the deploy.** A push only ships app
code. Any new Drizzle migration still has to be run manually from a local
machine with `pnpm db:migrate` (direct connection), same as every earlier
step - easy to forget, worth double-checking after schema changes.

### Environment variables

8 of the 9 variables in `.env.example` are set on Railway (Variables tab,
pasted via the Raw Editor):

- `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_ANON_KEY`
- `NUXT_SUPABASE_SERVICE_ROLE_KEY`
- `NUXT_SUPABASE_DB_POOL_URL` (pooled, port 6543 - what the running app uses)
- `NUXT_R2_ACCOUNT_ID`, `NUXT_R2_ACCESS_KEY_ID`, `NUXT_R2_SECRET_ACCESS_KEY`,
  `NUXT_R2_BUCKET`

**`NUXT_SUPABASE_DB_URL`** (the direct, non-pooled connection) is deliberately
**not** set on Railway - it's only used by `drizzle-kit` for migrations,
which are run locally, so leaving it off the server reduces what's exposed
there. The commented-out Microsoft SSO variables in `.env.example` are also
not yet needed.

### Supporting service configuration

Two other services needed to be told about the new domain:

- **Supabase → Authentication → URL Configuration**: Site URL and Redirect
  URLs updated to include the Railway domain (alongside the existing
  `localhost:3000` entries, which still work for local dev).
- **Cloudflare R2 → bucket → CORS policy**: the Railway origin was added
  alongside `localhost:3000`, since receipt/report uploads go straight from
  the browser to R2 and are blocked by CORS otherwise. Downloads use
  presigned GET URLs and don't need CORS.

### Fix required: SSR and client-only sessions

The first deploy showed protected pages (starting from `/`) throwing a
`401 Not authenticated` error on a fresh, logged-out visit, instead of
cleanly showing `/login`. Cause: the session lives only in the browser
(see the Step 4 known limitation above), but Nuxt was still
server-rendering pages on first load, including pages that fetch data
needing that session - so the server tried to call `/api/tools` with no
token, got a 401, and baked that into the rendered page before the client
redirect to `/login` could run.

**Fix:** set `ssr: false` in `nuxt.config.ts`. The app renders entirely
client-side; `/api/*` routes are unaffected since Nitro still serves them
regardless of SSR mode. This also improves on the Step 4 known limitation
in passing - a logged-out visitor now gets a near-empty shell instead of
even a brief flash of protected content structure.

### Known limitations carried into this deployment (unchanged, still fine for a demo)

- Client-side-only session/route protection (data itself is always
  protected server-side - see Step 4)
- ~~No role-assignment admin UI~~ - resolved in Step 9 (see below)
- Deleting an expense claim doesn't clean up its R2 receipt (see Step 7)
- No Microsoft SSO yet - planned before company-wide rollout

**Verified:** build succeeds on Railway; both an owner account and a second
non-owner test account were manually tested end-to-end against the live
Railway URL - login, dashboard tool listing, Expense Claims (employee
submit-with-receipt and manager approve/report/payout flows), and receipt/
report file upload and download via R2. `pnpm typecheck` and `pnpm lint`
both pass clean on the final code including the `ssr: false` change.

## Step 9: Role-assignment admin, multi-role users and manager teams

Replaces the manual-SQL role assignment from Step 7 with an owner-only
"Manage access" screen inside each tool, and adds the rule that work is
approved only by the manager(s) an employee is linked to.

### What changed

- **A user can hold several roles in one tool** (e.g. `employee` + `manager`).
  `user_tool_roles` is now unique on `(user_id, tool_id, role_key)`.
- **Employee -> manager links.** New table `tool_manager_links`
  (`tool_id, employee_id, manager_id`). An employee can have **one or more**
  managers; **any one** of them can approve. A manager sees only claims from
  employees linked to them; the owner still sees everyone.
- **New sign-ups have no roles**, so they see no tools. The owner's dashboard
  shows an in-app banner listing them, with an "Assign access in <tool>"
  button per tool. (No email notification yet.)

### How it fits together

- **`server/utils/requireToolRole.ts`** - now loads *all* of a user's roles for
  the tool. Returns `roles: string[]` (use this, e.g. `roles.includes('manager')`)
  plus a legacy single `role` that is **not reliable for multi-role users**.
  The owner bypass returns `roles: ['owner']`.
- **`server/utils/toolTeams.ts`** - generic link helpers reusable by any tool:
  `getManagedEmployeeIds`, `getManagerIdsOf`, `isManagerOf`, `getPeerManagerIds`
  (a manager plus co-managers who share an employee).
- **`server/utils/toolAccess.ts`** - `saveToolUserAccess()`, the single place
  that saves a user's roles **and** managers in one transaction and enforces the
  rules below. `toolUsesManagerLinks()` decides whether a tool uses links: it
  does if it defines **both** an `employee` and a `manager` role.
- **`server/api/admin/tools/[toolId]/`** (owner-only, generic for every tool):
  `roles.get.ts`, `users.get.ts`, `users/[userId].put.ts`.
  **`server/api/admin/pending-users.get.ts`** feeds the dashboard banner.
- **`app/components/ToolAccessAdmin.vue`** - reusable UI: one row per user, a
  checkbox per role, a manager multi-select for employees, a Save button per
  row. Used by **`app/pages/tools/expense-claims/access.vue`**, reached from a
  "Manage access" button on the tool page (owner only).
- **Expense Claims scoping:** `GET /claims` takes `?scope=mine` (default) or
  `?scope=team`; approve requires the claim's employee to be linked to the
  caller (and is guarded against two managers approving at once); submitting
  requires at least one linked manager (owner exempt); a payroll report
  covers approved claims from the runner's team only (owner: everyone); report
  history/download is limited to reports run by the caller or a co-manager.
  The tool page shows tabs ("Approvals & payroll" / "My claims") for users who
  hold both roles.

### Rules the server enforces on every save

- Every role must be defined for that tool; an employee needs >= 1 manager;
  nobody is their own manager; every chosen manager must already be *saved*
  as a Manager in that tool.
- A Manager role (or link) can't be removed while an employee would be left
  with no manager - the error names the employees to reassign first.
- Removing all roles removes the user's links too.

### One-time setup after applying this step

1. Schema: `pnpm db:generate && pnpm db:migrate` (creates `tool_manager_links`,
   changes the `user_tool_roles` unique constraint). Run locally - Railway does
   not apply migrations.
2. Supabase SQL Editor: run `server/db/manual-sql/003_cleanup_deleted_users.sql`
   once. It adds a trigger that deletes a profile when its auth user is deleted,
   and cleans up any already-orphaned profiles.
3. Existing employees need a manager link before they can submit claims: use
   Manage access (or insert into `tool_manager_links`).
4. Optional cleanup: delete the unused `user` role row for expense-claims from
   `tool_roles` (only `employee` and `manager` are used).

### Adding a future tool that uses employee/manager teams

Define `employee` and `manager` roles for it in `tool_roles`, add
`app/pages/tools/<tool-id>/access.vue` that renders
`<ToolAccessAdmin tool-id="<tool-id>" />` (the dashboard banner links to
`<tool route>/access`), and in the tool's routes use `requireToolRole`'s
`roles` plus the `toolTeams` helpers rather than the legacy `role`.

### Known limitations (fine for the demo)

- **Anyone can still sign up**; they see nothing until the owner assigns a
  role. Restricting sign-up to company email addresses is planned.
- **The new-sign-up alert is in-app only** (no email/push).
- **Deleting an auth user who has claim or payroll history** removes their
  login but keeps their profile row (so payroll history is never lost). They
  still appear in Manage access. A proper "deactivate user" feature would fix this.
- **The manager link is live, not a snapshot:** re-linking an employee moves
  their pending claims to the new manager.
- **Co-managers see each other's payroll reports**, including reports covering
  employees they don't share.
- **Older components show raw API errors** (e.g. `[POST] "/api/...": 409 ...`);
  the new admin screen shows the clean server message. A shared helper could
  unify this.

**Verified:** `pnpm typecheck` and `pnpm lint` clean. The save rules
(`saveToolUserAccess`) and the deleted-user trigger were tested against a local
Postgres built from the real migrations (21 rule checks plus trigger tests).
You then tested end-to-end with two separate teams: each manager sees only
their own team's claims, cross-team reads and approvals return 403, employees
and managers get 403 on owner-only APIs, per-team payroll PDFs contain only
that team's claims, other teams' reports return 404, an employee with two
managers can be approved by either, a stale second approval is refused, and
removing a manager who others depend on is blocked.


## Step 10: Leave Applications

The second full tool, and the first to reuse the Step 9 pieces (`ToolAccessAdmin`,
`toolTeams`, employee/manager links). An employee applies for leave, a linked
manager approves or rejects it, and everyone can see who is away on a team
calendar. Built in sub-steps 10.1 to 10.13 (10.13 = the dashboard "Away today" tile).

### Roles and workflow

- **Roles** (tool: `leave-applications`): `employee` and `manager`; the owner
  bypasses as everywhere. The owner can apply too, but needs a linked manager
  like anyone else, and **nobody can approve their own leave** (the owner
  included).
- **Status flow:** `pending` -> `approved` or `rejected` (by a linked manager,
  or the owner). The applicant can cancel a pending application, or an approved
  one that hasn't started. **Decisions are final** - there is no undo. A
  rejection needs a note.
- Approving/rejecting is race-guarded (`UPDATE ... WHERE status = 'pending'`),
  so two managers can't both decide the same application.
- An employee needs at least one linked manager before they can apply
  (the page tells them if they don't have one).

### Leave rules (all in `shared/utils/leaveRules.ts`, unit tested)

- Only **Monday to Friday** count; weekends inside a range are free.
  No public-holiday calendar yet (see limitations).
- **Half days:** `startHalfDay` = the afternoon of the first day only,
  `endHalfDay` = the morning of the last day only. A single-day half day uses
  the start flag. Each half day counts as 0.5.
- **Cycles:** each leave type has a `cycle_start_month` (1 = Jan-Dec, 7 = Jul-Jun).
  A cycle is identified by the year it starts in. Balances are per cycle.
- **Entitlements by service:** `leave_type_entitlements` holds tiers of
  (`min_years_service`, `days`). An employee gets the highest tier they have
  reached, by completed years since `profiles.join_date`.
- **Balances are computed live** (entitlement + adjustments - approved - pending),
  never stored. Going over balance shows a **warning but never blocks** the
  application.
- **Date restrictions** per leave type: `none`, `birth_month` or `join_month`
  (the whole range must fall inside that month - used for Birthday and
  Anniversary leave).
- **Clashes:** you can't apply for dates that overlap your own pending or
  approved leave.
- A single application can't span more than a year (`validateLeaveDates`), and
  must contain at least one working day. There is no rule against back-dated or
  far-future applications (see limitations).
- **Dates:** stored and sent as ISO `YYYY-MM-DD`; shown and typed as
  **dd/mm/yyyy** (Malaysian, day first) via `shared/utils/dates.ts`
  (`formatDateMY`, `formatDateRangeMY`, `parseDateMY`, `todayMY`). "Today" is
  always the Asia/Kuala_Lumpur date, whatever the server's timezone.

### How it fits together

- **Schema** `server/db/schema/leave.ts`: `leave_types`, `leave_type_entitlements`,
  `leave_applications`, `leave_balance_adjustments`. `profiles` gained
  `date_of_birth` and `join_date` (`core.ts`). Migration `0003_daily_rage.sql`.
- **Pure logic** (no DB, shared by server, forms and tests): `shared/utils/leaveRules.ts`,
  `leaveForm.ts` (form parsing/validation), `leaveCalendar.ts` (month grid and
  who-is-away), `dates.ts`.
- **Server helpers** `server/utils/`: `leaveBalance.ts` (balance maths from DB rows),
  `leaveRequest.ts` (apply, list, decide, calendar query), `leaveAdmin.ts`
  (profile dates, adjustments).
- **API** under `server/api/tools/leave-applications/`: `my-role`, `balances`,
  `applications` (list `?scope=mine|team`, create), `applications/preview`
  (live day count, warnings and conflicts for the form), `applications/[id]`
  (detail incl. attachment URL and balance impact), `[id]/cancel|approve|reject`,
  and `calendar?from=&to=` (approved leave only: names and dates, **never the
  leave type or reason**; open to every role on the tool, max 100 days).
- **Owner-only admin API:** `server/api/admin/profiles/[userId]/dates.put.ts`
  (set date of birth / join date), `server/api/admin/leave/adjustments`
  (add/list balance adjustments, e.g. carry-overs), and
  `server/api/admin/leave/employees/[userId]/balances.get.ts`.
- **Pages:** `app/pages/tools/leave-applications/index.vue` (tabs: Team approvals /
  My leave / Team calendar, depending on role; `?tab=calendar` opens a tab
  directly) and `access.vue` (Manage access, plus each person's date of birth
  and join date via `ProfileDates.vue`).
- **Components** `app/components/leave-applications/`: `EmployeeView` (balances,
  own applications, cancel), `ApplyDialog` (the application form with live day
  count and warnings, optional attachment), `ManagerView` (inbox with attachments
  and balance impact), `DecisionDialog` (approve/reject with a note),
  `TeamCalendar` (month grid, half days, "+N more", phone layout),
  `ProfileDates`.
- **Dashboard tile** `app/components/dashboard/AwayToday.vue`: "Away today" on
  the dashboard, shown only to people who can open Leave Applications.
- **Attachments** (e.g. medical certificates) go to R2 under
  `leave-applications/<yyyy>/<mm>/<uuid>-<name>`; the apply route only accepts
  keys with that prefix, and only the applicant, their managers and the owner
  can get a download link (checked by the tool, not the generic storage route).
- **Tests** in `tests/` (`pnpm test`, 43 tests, run with Node's built-in test
  runner - no database needed): leave rules, dates, form parsing, calendar logic.
  Imports in shared code use `.ts` extensions so they run under Node directly.
- Shared helper `app/utils/errorText.ts` shows the server's clean error message
  (used by the leave screens; older Expense Claims screens still show raw errors).

### One-time setup after applying this step

1. `pnpm db:migrate` (creates the leave tables and the new profile columns).
   Run locally - Railway does not migrate.
2. Supabase SQL Editor: run `server/db/manual-sql/004_seed_leave_tool.sql`
   (registers the tool, its two roles and the 11 leave types), then
   `005_seed_leave_entitlements.sql` (the days per service tier). To change a
   policy number later, edit it in 005 and run it again.
3. Set each person's **join date** and **date of birth** in Manage access - the
   entitlement tier, Anniversary and Birthday rules depend on them.
4. Assign roles and managers in Manage access.

Leave types: Annual, Medical/Personal, Unpaid (no balance), Anniversary, Birthday,
Wellness Day, Marriage, Hospitalization, Compassionate, Maternity, Paternity.
Adding a new type is a row in `leave_types` plus its rows in
`leave_type_entitlements`; the screens pick it up automatically.

### Known limitations (fine for the demo)

- **No public-holiday calendar**: a public holiday inside a range counts as a
  working day.
- **Decisions are final** - no un-approve or un-reject.
- **Orphaned uploads:** if an application fails after its file was uploaded (or
  is cancelled), the R2 file stays. Harmless, same as Expense Claims receipts.
- **No limit on how far back or ahead** an application's dates can be.
- **The calendar is company-wide by design:** every role on the tool sees the
  names and dates of all approved leave (never the type or reason).
- Test leave applications, adjustments, uploads and fake accounts should be
  cleared before the director demo.

**Verified:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and the production build
pass. The rules and queries were tested against a local Postgres built from the
real migrations, and the pages were driven in a real headless browser against a
mocked API (including the phone layout). You tested each sub-step against the
real Supabase, including the apply/approve/reject/cancel flows, balances, date
restrictions and the calendar.

## Step 11: Cost Modelling

The third full tool. It costs imported products from the supplier's FOB price
to a landed cost in AUD at each Australian port: container fill, freight, port
local costs, duty, shipping per unit and margins. Built in sub-steps 11.1 to
11.10 (11.8 was split into 11.8a list/view, 11.8b new-model form, 11.8c
duplicate/delete, 11.8d product look-up).

### Roles

- **Roles** (tool: `cost-modelling`): `user` and `admin`; the owner bypasses as
  everywhere. No employee/manager links (the tool has no approval chain), so
  Manage access shows just two tickboxes per person.
- **User:** open the tool, view Factors, create / view / duplicate cost models,
  add categories and sub-categories.
- **Admin:** everything a User can do, plus **edit Factors** and **delete** cost
  models. (Ticking Admin alone also works - Admin includes User's rights.)

### Two tabs

- **Factors** - the live numbers every new model uses: USD->AUD and CNY->AUD,
  usable container CBM (20' 28, 40HC 68 by default), ocean **freight in USD**
  per 20' and 40HC for each ship-from port -> AU port, and **local costs in AUD**
  per 20' and 40HC for each AU port and charge line. All shown side by side, with
  totals and a "cost per container" check that highlights the most expensive AU
  port. Read-only for users; admins get inputs and a Save bar. Two admins can't
  overwrite each other (the save carries the version it started from; a stale
  one is refused with a "reload" message).
- **Cost Model** - the saved models (search + paging), a read-only view of one
  model, the new-model form, Duplicate and Delete. The URL decides what shows:
  `?model=12` (one model), `?new=1` (form), `?new=1&from=12` (duplicate of 12).

### The maths (`shared/utils/costModel.ts`, unit tested)

- **Packing:** carton, outer carton and pallet, each L x W x H in cm and a
  "qty inside" = what's **directly** inside (carton: units; outer: cartons, or
  units if there's no carton; pallet: outers, or cartons, or units). CBM =
  L x W x H / 1,000,000.
- **Shipping unit:** the pallet if filled in, else the outer, else the carton.
  **Units per container** = whole shipping units that fit by volume x units in
  each (volume only - no weight or stacking limits).
- **Net COGS (AUD)** = FOB x exchange rate + duty % (per row, blank = 0%, on the
  FOB value). **Tooling** is converted and shown separately - never in unit cost.
- **Shipping per unit** = (freight USD x rate + the port's local costs) / units
  per container, per container size.
- **Landed cost** = Net COGS + shipping, shown for **every AU port** for the
  model's chosen container size (20' or 40HC). **Margins use the most expensive
  port** (a deliberate buffer).
- **Rapid GM** = (buyer buy price - landed) / buyer buy price.
  **RRP ex GST** = RRP / 1.1. **Buyer GM** = (RRP ex GST - buy price) / RRP ex GST.
- Missing inputs give "—" and a warning, never a wrong number.

### Saving, duplicating, looking up products

- **Saved models are final** - no edit. The server recalculates every figure
  itself from the live Factors, then **freezes** both the Factors used
  (`factors_snapshot`) and every figure (`results` per row), so a model never
  changes when Factors do. If Factors changed while someone was filling in the
  form, the save is refused and the screen refreshes to the new rates.
- **Name** is built automatically: *Category - Sub-category - Supplier - dd/mm/yyyy*;
  same-day repeats get *(2)*, *(3)*... (numbers of deleted models aren't reused;
  simultaneous saves are serialised with an advisory lock).
- **Duplicate** prefills the form from a saved model but costs it with **today's**
  Factors (the form says which exchange rates changed), and records
  "copied from" on the new model.
- **Delete** is admin/owner only; a model's product rows go with it, copies are kept.
- **Product look-up:** typing in a row's product no. offers previously costed
  products (the **most recent saved version** of each; product nos. are unique
  across RHG). Picking one fills **only the empty cells** of the row - sizes,
  quantities, currency, prices, duty - and marks the row "filled from".
- **Categories / sub-categories** are one shared list; anyone with the tool can
  add from the dropdown ("Create ..."). Names are tidied and unique ignoring case.

### How it fits together

- **Schema** `server/db/schema/costModelling.ts`: `cost_ports` (origin /
  destination), `cost_local_fee_types`, `cost_factor_settings` (one row),
  `cost_freight_rates`, `cost_local_costs`, `cost_categories`,
  `cost_sub_categories`, `cost_models`, `cost_model_rows`. Migrations
  `0004_flawless_silver_sable.sql` (tables) and `0005_keen_mauler.sql`
  (product no. look-up index).
- **Pure logic** (no DB; shared by server, forms and tests): `shared/utils/costModel.ts`
  (maths, naming, formatting), `costFactors.ts` (Factors -> per-port figures for
  one origin), `costModelForm.ts` (form text -> numbers, blocking problems, fill
  from a saved product), `costCategories.ts` (name tidying). Types in
  `shared/types/costModelling.ts`.
- **Server helpers** `server/utils/`: `costFactors.ts` (load/save Factors, role
  constants), `costCategories.ts` (find-or-create), `costModels.ts` (save, list/search,
  open, product look-up).
- **API** under `server/api/tools/cost-modelling/`: `my-role`, `factors` (GET
  everyone / PUT admin), `categories` (GET, POST) and
  `categories/[id]/sub-categories` (POST), `models` (GET `?q=&page=`, POST),
  `models/[id]` (GET; DELETE admin), `products?q=`.
- **Pages:** `app/pages/tools/cost-modelling/index.vue` (tabs; `?tab=factors`
  opens Factors) and `access.vue` (Manage access).
- **Components** `app/components/cost-modelling/`: `FactorsView`, `ModelsTab`,
  `ModelList`, `ModelView`, `ProductResultsTable`, `FactorsSnapshot`,
  `ModelForm`, `ProductNoInput`.
- **Tests:** `pnpm test` now runs **82** tests (39 new for Cost Modelling).

### One-time setup after applying this step

1. `pnpm db:migrate` (migrations 0004 and 0005). Run locally - Railway does not migrate.
2. Supabase SQL Editor: run `server/db/manual-sql/006_seed_cost_modelling.sql`
   (registers the tool and its two roles, the 4 ship-from and 5 AU ports, the 12
   local-cost lines, the Factors settings row, and a zero rate for every route
   and port/charge pair). Safe to re-run; it never overwrites entered rates.
3. As an admin, fill in **Factors** - models can't be saved until both exchange
   rates are set.
4. Give people **User** (and a few **Admin**) in Manage access.

Adding a port or a local-cost line later: insert a `cost_ports` or
`cost_local_fee_types` row, then re-run the last two inserts of seed 006 to
create its zero rates; the screens pick it up automatically.

### Known limitations (fine for the demo)

- **No editing** saved models (by design) - Duplicate instead.
- **Container fill is by volume only** - no weight limits, pallet stacking or
  carton orientation.
- **All local costs are treated as per-container**, although some (e.g. Doc Fee,
  Customs Clearance) are really per shipment.
- **Duty** is a % on the FOB value per row; no other import charges are modelled.
- Categories / sub-categories **can't be renamed, merged or deleted** in the app
  (SQL only, and only when no model uses them).
- Ports and charge lines are added by SQL (see above), not from a screen.
- The product look-up uses the most recent saved row per product no. - there is
  no separate product catalogue.
- Test models, categories and the fake test accounts should be cleared before
  the director demo.

**Verified:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and the production build
pass. Every API route was tested against a local Postgres built from the real
migrations and seed (including simultaneous saves, stale-Factors refusals and
access rules), and every screen was driven in a real headless browser against
the real API with only the Supabase login faked - checked against hand-worked
figures (e.g. 8,000 units per 20', landed 3.55 at SYD, margins 29.0% / 50.0%)
and at phone width. You tested each sub-step against the real Supabase.
