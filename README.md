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

- **Client side** (cookie-based since Step 14): `app/plugins/01.supabase.client.ts` creates a Supabase
  browser client, used only for sign in / sign up / sign out. All actual
  *data* still goes through our own Nitro API + Drizzle, never through
  `supabase-js` directly.
- **`app/stores/auth.ts`** (Pinia) holds the current session, user, and
  profile, and exposes `signIn`, `signUp`, `signOut`.
- **`app/composables/useApiFetch.ts`** — use this (not plain `$fetch`) for
  any call to our own `/api/...` routes that needs to know who's calling.
  The login travels in the Supabase cookie (before Step 14 it was a Bearer header).
- **`server/middleware/auth.ts`** validates that cookie login on every
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


## Step 12: Inspection Reporting

The fourth full tool, and the first built with Claude Code directly in the
repo. It records **product QC inspections at suppliers and DCs**: an inspector
works through a checklist on a phone, attaches photos and marks each point
Compliant, Non-Conformance (Minor or Major) or N/A; a reviewer closes the report
or sends it back; anyone can download a PDF. Built in sub-steps 12.1 to 12.12
(12.8b added products and the camera button).

### Roles and workflow

- **Roles** (tool: `inspection-reporting`): `inspector`, `reviewer` and `admin`;
  the owner bypasses as everywhere. No employee/manager links, so Manage access
  shows three tickboxes per person. **Everyone with a role can see every report.**
- **Inspector:** start a report from a template; edit, save, submit and discard
  **their own** drafts; add photos; download PDFs.
- **Reviewer:** on a report in review, **Close report** (result frozen, optional
  comment) or **Send back** (comment required; the report returns to draft and the
  inspector sees why).
- **Admin:** build templates, manage the Supplier / DC list, edit any draft,
  **delete any report**. (Admin alone cannot close reports - that needs Reviewer.)
- **Status:** `draft` -> `in review` -> `closed`, and `in review` -> `draft` when
  sent back. Submitting needs every point answered and every Non-Conformance given
  Minor or Major, and shows a **warning if any Non-Conformance is present**. Closed
  reports can't be changed. Every step is recorded in a **History** (who, when in
  Malaysian time, comment).

### The result (all in `shared/utils/inspectionRules.ts`, unit tested)

- Each point is **Compliant**, **Non-Conformance** (with **Minor** or **Major**) or
  **N/A**. The overall result is **calculated**, never typed: any Major, or **3 or
  more Minor** = **Fail**; **1 or 2 Minor** = **Pass with conditions**; otherwise
  **Pass**. N/A points are ignored.
- It updates live while the inspector fills in the report ("Fail so far") and is
  **stored (frozen) when a reviewer closes** the report. The rule is the same for
  every template.
- The same file holds who may create / edit / delete / change status, the template
  checks, the photo type/size check (10 MB, JPEG / PNG / HEIC) and the product-list
  checks, so the server and the screens agree.

### Templates, suppliers/DCs and products

- **Templates** are built by admins in a **form builder** (a Templates tab, then
  `/templates/new` and `/templates/[id]`): a name, an on/off switch, any number of
  named **sections**, each with **inspection points**, reorderable. Every point
  automatically gets the answer buttons, a comment box and photos.
- **Suppliers & DCs** is one admin-managed list (type Supplier or DC); entries can
  be renamed or **switched off** (hidden from new reports), never deleted.
- **A template and the supplier/DC are copied into each report** when it is
  started. Editing a template or the list later never changes an existing report.
- **Products:** a report lists up to 20 products, each a **product number and a
  description**. Typing a number offers products saved by earlier inspections
  (arrow keys / Enter, or tap); a saved product's description is filled in. Saving a
  report remembers each product (a description updates the saved one - latest wins;
  a blank one never erases it). Rows with nothing in them are dropped; a description
  with no number or the same number twice is refused. There is **one checklist per
  report** (not per product). Lookups use inspection data only, never Cost Modelling.

### The checklist screen (phone first)

- Header fields, products, then sections of points; each point has **Compliant**,
  **Non-Conformance** (opens a dialog asking **Minor or Major** - its other contents
  are still to be decided), **N/A**, a comment box and photos.
- A bottom bar always shows "n of N answered", the live result and the counts, with
  **Save draft** and **Submit for review**. Unanswered points are outlined in red.
- **Photos:** **Take photo** opens the camera; **Choose photos** picks from the
  library (several at once). Thumbnails open full size; the red x removes one.
- Leaving with unsaved changes asks in our own dialog (**Stay / Save and leave /
  Leave without saving**). **Discard draft** deletes the draft and its photos.

### Photos (R2)

Three steps, so nothing unchecked reaches the database: (1) the server checks the
file name, type, size and that the report is a draft this user may edit, and returns
a presigned upload link that only accepts a file of **exactly that size**; (2) the
browser uploads straight to R2; (3) the server confirms the object exists at that
size, then records it. Files live under `inspection-reporting/<yyyy>/<mm>/`. View
links last 15 minutes and are fetched together per report. Removing a photo, or
discarding / deleting a report, deletes the stored files too (best effort).

### PDF

`GET .../reports/[id]/pdf` builds an A4 PDF on demand with `pdfkit`
(`server/utils/generateInspectionReportPdf.ts`): result, supplier/DC, template,
date, reference, inspector, products and notes, a counts summary, every section and
point with its coloured answer, comment and photos, the history, and a page footer.
A draft or in-review PDF says the result is not final. The button fetches the file
as a blob and saves it. Fonts are the built-in PDF
ones, so **Chinese / other non-Western text prints as "?"**; photos are embedded
full size (JPEG / PNG only, 80 MB cap per PDF - **HEIC is listed as "not shown"**).

### How it fits together

- **Schema** `server/db/schema/inspections.ts`: `inspection_locations`,
  `inspection_templates` (sections as JSON), `inspection_reports`,
  `inspection_report_points`, `inspection_photos`, `inspection_events`,
  `inspection_products`, `inspection_report_products`. Migrations
  `0006_harsh_proemial_gods.sql` (tables) and `0007_short_mojo.sql` (saved products;
  copies each report's old single product number across). The old
  `inspection_reports.product_no` column is left unused for one release.
- **Pure logic** `shared/utils/inspectionRules.ts`; date-and-time display
  `formatDateTimeMY` in `shared/utils/dates.ts`; API types in
  `shared/types/inspection.ts`.
- **Server helpers** `server/utils/`: `inspections.ts` (list/search, create, open,
  save, status changes, photos, products, delete, PDF photos),
  `inspectionTemplateBody.ts` and `inspectionProductsBody.ts` (request checks),
  `generateInspectionReportPdf.ts`; `r2.ts` gained size lookup, delete and read.
- **API** under `server/api/tools/inspection-reporting/`: `my-role`; `locations`
  (GET, POST, `[id]` PUT); `templates` (GET, POST, `[id]` GET / PUT); `products?q=`;
  `reports` (GET `?q=&status=&page=`, POST); `reports/[id]` (GET, PUT, DELETE);
  `reports/[id]/status` (POST `submit` / `return` / `close`); `reports/[id]/pdf`;
  `reports/[id]/photo-urls`; `reports/[id]/points/[pointId]/photos` (POST record) and
  `.../photos/upload-url` (POST); `reports/[id]/photos/[photoId]` (DELETE). Every
  route uses `requireToolRole` and the `roles` array.
- **Pages** `app/pages/tools/inspection-reporting/`: `index.vue` (tabs: Reports, and
  for admins Templates and Suppliers & DCs; `?tab=` opens one), `new.vue`, `[id].vue`,
  `templates/new.vue`, `templates/[id].vue`, `access.vue` (Manage access).
- **Components** `app/components/inspection-reporting/`: `ReportList`, `NewReportForm`,
  `ReportEditor`, `PointCard`, `ProductsInput`, `LocationsAdmin`, `TemplatesAdmin`,
  `TemplateBuilder`; `app/composables/useInspectionPhotos.ts` and
  `app/utils/inspectionProducts.ts`.
- **Tests:** `pnpm test` now runs **98** tests (16 new: `inspectionRules.test.ts`
  and a date-time check in `dates.test.ts`).

### One-time setup after applying this step

1. `pnpm db:migrate` (migrations 0006 and 0007). Run locally - Railway does not
   migrate. **Run it before pushing code that needs it.**
2. Supabase SQL Editor: run `server/db/manual-sql/007_seed_inspection_reporting.sql`
   (registers the tool and its three roles). Safe to re-run.
3. Give people **Inspector**, a few **Reviewer** and **Admin** in Manage access.
4. As an admin, add the **suppliers and DCs** and build at least one **template**
   (inspectors can't start a report until both exist).

### Known limitations (fine for the demo)

- **PDF:** Chinese / non-Western characters print as "?"; HEIC photos aren't drawn;
  photos aren't resized.
- **One checklist per report** (no per-product result); the pass/fail rule is fixed.
- **Non-Conformance dialog is only Minor/Major**; defects, follow-up actions and
  notifications are not built yet (to be discussed).
- Suppliers/DCs and templates can only be switched off (no delete, merge or duplicate).
- A reviewer can close a report they started themselves.
- View links expire after 15 minutes; an upload that is never recorded leaves an
  unused file in R2.
- The unused `inspection_reports.product_no` column should be dropped in a later
  clean-up.
- Test reports, templates, suppliers/DCs and products (all named "ZZ ...") should be
  cleared before the director demo.

**Verified:** `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at every
sub-step. Every API route was exercised against the real Supabase and R2 with the
owner account (all status changes and refusals, photo upload / removal / size
limits, product look-up, delete and the PDF route), and the screens were driven in
the Claude app's browser pane at desktop width, with phone width checked for the
list, builder, checklist and product rows. The PDF layout was rendered and checked
page by page. **Not verified by Claude:** role refusals for non-owner accounts (the
owner bypasses every check, and Claude can't sign in as other users - covered by
unit tests and server checks, with Navin's multi-account test as the end-to-end
check), the phone camera buttons on a real phone (the inputs are set to open the
camera; Navin to confirm on the hosted site), and the reviewer buttons at phone
width.

## Step 13: Styling and clean-ups

A housekeeping step: no new tool, but the small fixes, the leftovers from Steps
7 to 12 and the RHG look. Built in sub-steps 13.2 to 13.13 with Claude Code,
committing and pushing sub-step by sub-step when Navin asked.

### What changed, by sub-step

- **13.2 Expense Claims:** status shown as "Submitted / Approved / Paid"; a new
  category **Others**; dates as dd/mm/yyyy (lists and the payroll PDF); clean server
  messages on screen; "This claim has already been approved" wording.
- **13.3 Leave:** statuses in sentence case; Start / End date and the owner's
  join date / date of birth use the browser's date field (it moves day, then month,
  then year by itself), like Expense Claims.
- **13.4 Speed:** a thin loading bar across the top while a page opens, and a
  spinning icon on the tool tile that was clicked. The server also remembers a
  checked login for 60 seconds (`shared/utils/tokenCache.ts`,
  `server/middleware/auth.ts`) so most requests skip the round trip to Supabase.
- **13.5 Approvals banner:** managers (and the owner) see "Waiting for your
  approval" on the dashboard with the number of expense claims and leave
  applications and a button into each tool (`GET /api/dashboard/pending-approvals`).
  Nobody is asked to approve their own leave, so that is never counted.
- **13.6a Cost model PDF:** a **Save as PDF** button on a saved model
  (`server/utils/generateCostModelPdf.ts`, `GET .../models/[id]/pdf`): header,
  Factors used, one row per product, landed cost per AU port, tooling, warnings. It
  uses the figures saved with the model.
- **13.6b Cost Modelling Setup tab (admins and owner):** rename, merge and delete
  categories and sub-categories (delete only when no model uses them); add ports
  (a new port starts with zero freight and local costs); add local-cost charge
  lines; switch ports and charge lines off and on (never deleted). Saved models are
  never rewritten. Code in `server/utils/costSetup.ts`, `shared/utils/costSetup.ts`.
- **13.7 Deactivate user:** the owner's **Deactivate / Reactivate** button in
  Manage access (`PUT /api/admin/profiles/[userId]/active`). A deactivated person is
  refused by every route (`requireProfile`) and sees a "deactivated" page. They are
  hidden from people lists and manager pickers; their history and pending items stay.
  Refused for owners and while the person still manages active employees
  (`shared/utils/deactivation.ts`). Migration `0009`: `profiles.deactivated_at`.
- **13.8 Leave public holidays:** an owner-managed list on the Leave Manage access
  page. A holiday on a working day is skipped when days are counted; the apply form
  names the holidays skipped; the team calendar shows them in blue and "Away today"
  mentions one. Each application keeps its own copy of the holidays it skipped
  (`leave_applications.holiday_dates`), so changing the list never changes old leave.
  Migration `0010`. Starts empty: the owner enters the dates.
- **13.9 Inspection:** a reviewer can't close or send back a report they started
  (the owner can); **Duplicate** on the template list makes "Copy of ..." (switched off).
- **13.10 Storage:** deleting a claim or replacing its receipt now deletes the old
  file when nothing else uses it. The owner's **Storage clean-up** page (`/admin/storage`,
  linked from the dashboard) lists files in R2 that no record points to (over a day
  old, in a tool's own folder) and deletes them after confirmation. Migration `0011`
  drops the unused `inspection_reports.product_no`.
- **13.11 Look:** RHG colours (orange in light mode, blue in dark mode, set once in
  `app/assets/css/main.css`), the blue header with the logo (`public/rhg-logo.png`)
  and a branded login page. A login that has expired now signs out and goes to the
  login page instead of an error (`app/composables/useApiFetch.ts`).
- **13.12 Test data:** the test claims, leave, adjustments, holiday, cost model,
  Hobart port, inspection data and two of the three `@test.com` accounts were
  deleted by Navin in the Supabase SQL editor. Claude listed the data first and
  wrote the statements; the permission system blocked Claude from running the
  deletes itself, so Navin ran them.
- **Owner + Employee in Expense Claims:** if the owner is also ticked as Employee,
  the page now offers "My claims" like it does for anyone else.

### One-time setup after applying this step

1. `pnpm db:migrate` for `0008` to `0011` (already run). `0011` drops a column, so it
   was run **after** the code that stopped using it was deployed.
2. No new manual SQL.
3. The local dev server must run on **port 3000**: R2's CORS only allows that address
   (and Railway), so receipt uploads from another port fail with "failed to fetch".

### Known limitations (fine for the demo)

- **Extra owners** can only be set in the database (`profiles.is_owner`); there is no
  screen for it yet. Nothing assumes a single owner.
- **Deactivating** blocks the person inside the app only; their Supabase login is
  untouched. The Leave calendar still shows a deactivated person's approved leave.
- **Public holidays** are one national list; there are no state holidays.
- **Remembered logins:** a login cancelled in Supabase can keep working for up to a minute.
- **Storage clean-up** shows and deletes the oldest 200 files per scan (scan again for more).
- **Chinese / non-Western text** still prints as "?" in PDFs (Navin chose to skip a font).
- **Not done (left for later):** the Non-Conformance dialog contents and defects /
  corrective actions; the extra Cost Modelling columns and Factors Navin flagged;
  per-shipment local costs and container weight limits; making Admin also tick User;
  per-template pass/fail thresholds; per-product inspection results; tightening
  co-manager payroll-report visibility; Drizzle `relations()`; a simpler way to
  register a new tool.

**Verified:** `pnpm lint`, `pnpm typecheck` and `pnpm test` (124 tests) pass at every
sub-step. Claude checked the PDF output, the login page and header in both themes, the
expired-login redirect, and the new routes' owner-only refusals in the Claude app's
browser pane. Everything that needs another account or writes real data (the manager
banner, deactivation, merges, holidays, storage clean-up, the reviewer rule) was
tested by Navin; Claude cannot sign in as other users.

## Step 14: cookie-based sessions (`@supabase/ssr`)

Moves the login out of browser storage and into a secure cookie, so the server
knows who is asking before it sends anything. Nothing changes on screen. Built in
sub-steps 14.2 to 14.7 with Claude Code; Navin tested each stop.

### How it fits together

- **Browser:** `app/plugins/01.supabase.client.ts` uses `createBrowserClient`
  from `@supabase/ssr`, which keeps the session in `sb-...-auth-token` cookies.
- **API calls:** `useApiFetch` no longer adds a Bearer header; the browser sends
  the cookie by itself. It still signs out and goes to /login on a 401.
- **Server:** `server/utils/supabaseServer.ts` (`serverSupabase(event)`) reads the
  login from the request cookies and writes refreshed cookies back.
  `server/middleware/auth.ts` takes the access token from the cookie (Supabase
  refreshes an expiring one there), checks it with Supabase or the 60-second cache,
  and attaches the user to `event.context.user`. **The Bearer header is no longer
  accepted.**
- **Page protection:** `server/middleware/pageGuard.ts` (rule in
  `shared/utils/pageGuard.ts`, tested) answers a signed-out visitor's page request
  with a 302 to `/login`, so the app is never sent to them. API calls, scripts and
  images are not redirected (API calls answer 401). `ssr` is still `false`.
- **Calling an API route from the browser console** now needs no token:
  `fetch('/api/auth/me').then(r => r.json()).then(console.log)`.

### One-time setup

None: no migration and no SQL. The new package is `@supabase/ssr`. **Everyone
signs in once more after the release** (old logins were stored the old way).

### Also in this step (small fixes)

- The loading bar is light blue in dark mode (it was invisible on the blue header).
- Every tool's home page has a "Back to the dashboard" link, like Storage clean-up.

### Known limitations

- Still a client-rendered app (`ssr: false`); turning SSR back on is a separate,
  larger job (this step is its prerequisite).
- Deactivated people are still handled on the client (the `/deactivated` page needs
  their profile); the API refuses them either way.
- A login cancelled in Supabase can keep working for up to a minute (the cache).
- File downloads still fetch a blob and save it, though a plain link would now work.

**Verified:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (128 tests) and `pnpm build`
pass. Claude checked with `curl` that a signed-out request for a page returns 302 to
/login, /login returns 200, and an API call returns 401. Everything needing a real
login (all tools, several accounts, refresh, sign-out, closing and reopening the
browser) was tested by Navin.

## Step 15: sign-up restricted to company email addresses

Strangers who find the URL can no longer create an account. Only email addresses on an
allowed list can sign up. Built in sub-steps 15.2 to 15.5 with Claude Code; Navin tested
each stop.

### How it fits together

- **The real protection is in the database.** `server/db/manual-sql/008_signup_domain_guard.sql`
  creates the table `allowed_signup_emails` and a trigger on `auth.users` that rejects any
  new account whose email is not on the list. The browser cannot get around it.
- **The list:** each entry is either a whole domain (`ttfs.com.au`) or one exact address
  (`contractor@other.com`). It starts with `rapidhardwaregroup.com.au` and `ttfs.com.au`.
  Case and spaces never matter; sub-domains and look-alikes (`mail.ttfs.com.au`,
  `ttfs.com.au.evil.com`) do not match. The table is private (row level security on, no
  policies), so only the SQL editor and the trigger can read or change it.
- **Same rule in code:** `shared/utils/signupRules.ts` (`isSignupEmailAllowed`,
  `signupNotAllowedMessage`, tested in `tests/signupRules.test.ts`). The login page does
  not block anything itself, because it cannot see single-address exceptions; it only
  turns Supabase's generic "Database error saving new user" into "Sign-up is limited to RHG
  email addresses (@rapidhardwaregroup.com.au or @ttfs.com.au)...".
- **Login page:** the sign-up heading says to use your RHG email address, and the
  boxes now carry `name` / `autocomplete` settings (username, current-password,
  new-password) so password managers recognise the form.
- **Existing accounts are untouched**; only new accounts are checked.

### Managing the list (SQL editor)

```sql
insert into public.allowed_signup_emails (entry) values ('person@other.com'); -- one address
insert into public.allowed_signup_emails (entry) values ('newdomain.com.au'); -- a whole domain
delete from public.allowed_signup_emails where entry = 'newdomain.com.au';    -- stop allowing it
```

### One-time setup

1. Run `008_signup_domain_guard.sql` once in the Supabase SQL editor (safe to re-run).
2. In Supabase, Authentication -> Sign In / Providers -> Email, switch **Confirm email**
   ON. Without it, anyone could sign up as someone else's company address without owning
   the mailbox, which would defeat the domain check.
3. No migration, no new package.

### Known limitations

- **The guard also blocks accounts added by hand** in Authentication -> Users -> Add user,
  because the database cannot tell those from sign-ups. To add an outsider, add their
  address to the list first.
- The list is edited by SQL only; there is no screen for it.
- Confirmation emails are sent by Supabase's built-in mail service, which is meant for
  testing: a very low hourly limit, a generic sender and template, and it may only deliver
  to your Supabase team's addresses. A real mail provider (custom SMTP) is needed before
  company-wide use (after approval). Tested: a confirmation email to a company address took several
  minutes to arrive, from "Supabase Auth <noreply@mail.app.supabase.io>".
- Email/password sign-up is still open to the allowed domains; whether it stays once
  Microsoft SSO exists is a decision for when SSO is added (after approval).
- Edge did not offer to save the password after signing in on the live site (even with
  Bitwarden off). Forcing a full page load after sign-in was tried and reverted because it
  made the dashboard slow. Saving the login by hand in the browser works.

**Verified:** `pnpm lint`, `pnpm typecheck` and `pnpm test` (134 tests) pass. Claude checked
the login page's input settings and the new sign-up heading in the browser pane. The
database guard, the refusal message on the live site and the confirmation email need the
real Supabase and were tested by Navin.

## Step 16: Projects

The fifth full tool, replacing Asana. It is a **generic project tool** built first for **product
launches** (Live, Promo and CSO): the same tasks recur on every launch and a launch type just leaves
some out. What Asana couldn't do is here: **tasks wait for other tasks, and a task only gets a due date
when the tasks it waits for are finished.** Built in sub-steps 16.1 to 16.11 with Claude Code; Navin
tested each stop.

### Roles, privacy and views

- **Roles** (tool: `projects`): `user` and `admin`; the owner bypasses as everywhere. No employee/manager
  links, so Manage access shows two tickboxes.
- **Users** start projects and work on tasks in projects they belong to. **Admins** also build the
  project types, sections and master task list, and can see and manage every project.
- **Projects are private to their members** (plus admins and the owner). The person who starts a project
  is its owner and can change its settings and members, close or reopen it, and delete tasks. Only an
  admin can delete a whole project.
- **Screens:** the **Projects** tab (list with progress, overdue and **At risk**; open / closed filter;
  admins can show every project), **My tasks**, and for admins **Task list** and **Types & sections**. A
  project opens as a **List** (grouped by section) or a **Board** (To do / In progress / Done).

### How due dates work (all in `shared/utils/projectRules.ts`, unit tested)

- **Project types** are an admin-managed list (Live, Promo and CSO seeded). **One master task list** is
  shared by every type; each task is **ticked for the types it applies to**, sits in a **section**, has a
  default person, a **Lead Time** (working days) and the tasks it waits for.
- **Starting a project** copies the ticked tasks. Links are **bridged** over the left-out tasks (A -> B -> C
  without B becomes A -> C). Tasks with nothing to wait for get a due date of **start date + Lead Time**;
  the rest are **Blocked** with no date. A project with no type is a **blank project** (add tasks by hand).
- **Finishing a task** unlocks any task that was waiting only for it: due date = **that day + its Lead
  Time**. A task with two predecessors unlocks when the later one is finished.
- **Working days** are Monday to Friday, skipping the Leave **public holidays**. A Lead Time of 0 means the
  same day (or the next working day if that is a weekend or holiday).
- **Reopening** a Done task puts unstarted dependents back to Blocked (date cleared); ones already in
  progress or done are left alone and the screen says so.
- **At risk:** any open task is overdue, or already due after the project's optional **target date**. The
  target date is a flag only and never moves a due date.
- Also tested there: loop detection (tasks waiting for each other), unknown / self links, who may change
  a task's status (its assignee, the project owner or an admin), and a blocked task can't be started.

### Tasks, comments and files

- Anyone in a project can **add a one-off task** (any section, assignee, Lead Time, "waits for"), **edit** a
  task, comment, and attach files. The owner or an admin can delete a task (tasks that waited for it
  inherit its links and are dated if they become free).
- **Assignees must be project members**; people given a task by the master list are added automatically.
  A member can't be removed while they still have unfinished tasks.
- **Files** use the same three-step upload as Inspection Reporting photos (server approves, browser
  uploads to R2, server confirms): up to **20 MB**, images / PDF / Word / Excel / PowerPoint / CSV / text /
  ZIP (`shared/utils/projectFiles.ts`; allowed by extension, never by what the browser claims). Key
  `projects/<yyyy>/<mm>/<uuid>-<name>`; only project members get a download link. Deleting a file, task or
  project removes the stored file; the **Storage clean-up** page knows about the `projects/` folder.
- **Closed projects** can be read but not changed until reopened.
- **Dashboard:** a banner "Tasks waiting for you" counts tasks assigned to you that are ready to start
  (not blocked, not done, in open projects) and links to **My tasks**.

### How it fits together

- **Schema** `server/db/schema/projects.ts`: `project_types`, `project_sections`, `project_template_tasks`,
  `project_template_task_types`, `project_template_task_deps`, `projects`, `project_members`,
  `project_tasks` (frozen section name / position, Lead Time, due date), `project_task_deps`,
  `project_comments`, `project_files`. Migrations `0012_secret_namor.sql` (tables) and
  `0013_cheerful_talos.sql` (sections).
- **Pure logic** `shared/utils/projectRules.ts`, `shared/utils/projectFiles.ts`; API types in
  `shared/types/projects.ts`.
- **Server** `server/utils/projects.ts` (all the work: types, sections, master list, access, list / view,
  create, edit, status changes, files, comments) and `projectBodies.ts` (request checks). Status changes
  lock the project row inside a transaction.
- **API** under `server/api/tools/projects/`: `my-role`, `people`, `my-tasks`; `types` and `sections`
  (GET, POST, `[id]` PUT; `sections/order` PUT); `template` (GET, PUT: the whole master list in one go);
  `index` (GET, POST), `[id]` (GET, PUT, DELETE), `[id]/status`, `[id]/members`, `[id]/tasks` (POST),
  `[id]/tasks/[taskId]` (PUT, DELETE), `.../status`, `.../comments`, `.../files` (GET, POST,
  `upload-url`, `[fileId]` DELETE, `[fileId]/download-url`). Every route uses `requireToolRole` and the
  `roles` array; non-members get "does not exist".
- **Pages** `app/pages/tools/projects/`: `index.vue` (tabs), `new.vue`, `[id].vue`, `access.vue`.
- **Components** `app/components/projects/`: `ProjectList`, `NewProjectForm`, `ProjectView`, `TaskDialog`,
  `TaskActions`, `TaskDiscussion`, `SettingsDialog`, `MyTasks`, `TemplateAdmin`, `TypesAdmin`,
  `SectionsAdmin`; `app/composables/useProjectFiles.ts`; the dashboard banner is in `app/pages/index.vue`.
- **Tests:** `pnpm test` now runs **166** tests (32 new: `projectRules.test.ts`, `projectFiles.test.ts` and
  a storage-folder check).

### One-time setup after applying this step

1. `pnpm db:migrate` (migrations 0012 and 0013). Run locally - Railway does not migrate. **Run it before
   pushing code that needs it.**
2. Supabase SQL Editor: run `server/db/manual-sql/009_seed_projects.sql` (registers the tool, its two
   roles and the three launch types). Safe to re-run.
3. Give people **User** (and a few **Admin**) in Projects -> Manage access.
4. As an admin, add the **sections** (Types & sections), then build the **master task list** (Task list)
   and tick the project types each task applies to. Nothing can start from a type until it has tasks.

### Known limitations (fine for the demo)

- **No status reporting yet** (one project, and all open projects for admins): wanted, deferred.
- Due dates can't be edited by hand; a task's Lead Time only applies when it unlocks.
- No subtasks, recurring tasks, Gantt / timeline, calendar view, drag-and-drop board or time tracking.
- Project types and sections can only be switched off in the app (deleted by SQL).
- Notifications are in-app only (no email until a mail provider exists).
- Comments can't be edited or deleted; files can't be renamed.
- The people list (for members and assignees) is visible to everyone with a Projects role.

**Verified:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (166 tests) and `pnpm build` pass. Claude exercised the
API against the real Supabase and R2 with temporary data (master list, sections and ordering, starting
projects, blocking, unlocking and reopening with the working-day dates, one-off tasks, comments, file
upload / download / removal and cleanup with the project, refusals for blocked tasks, loops, bad files)
and drove every screen in the browser pane at desktop width, plus a phone-width check of every Projects
page for sideways scrolling. **Not verified by Claude:** role refusals for non-owner accounts (the owner
bypasses every check and Claude can't sign in as other users - covered by unit tests and code review, with
Navin's multi-account test as the end-to-end check). All test data was removed afterwards; Navin cleared the
rest of the Projects data in the Supabase SQL editor.

## Step 17: Product Information (PIM)

The sixth full tool: one searchable catalogue of RHG products, replacing Plytix (Tech File style).
Each product has its details, suppliers, packaging, images and documents, a completeness score and a
change history, with CSV import and export. **Selling data to retailers (channels / feeds) is not part of
this tool** - Navin said it isn't needed. Built in sub-steps 17.1 to 17.11 with Claude Code; Navin tested
each stop.

### Roles and what people see

- **Roles** (tool: `pim`): `viewer`, `editor`, `admin`; the owner bypasses as everywhere. No employee/manager
  links, so Manage access shows three tickboxes. **Everyone with any role sees every product.**
- **Viewers** search, open products, open files and export CSV. **Editors** also create and edit products,
  add and remove files, choose the main image and import CSV. **Admins** also set up categories and
  attributes and delete products.
- **Screens:** the **Products** tab (search, status / category / sub-category filters, 50 per page, main
  image, primary supplier, RRP, completeness badge, status), **New product**, the **product page**, and for
  admins **Categories & attributes**.

### What a product holds

- **Details:** product number (**unique across RHG, ignoring capitals and extra spaces**), name, status
  (Draft / Active / Discontinued), brand, category and optional sub-category, barcode (GTIN-8/12/13/14 with
  its check digit verified), RRP (AUD), short and long description.
- **Several suppliers**, up to 10, each with an optional supplier code; exactly one is **primary**.
- **Packaging** at three levels (carton, outer, pallet): L x W x H cm, weight kg and quantity inside
  ("directly inside", the same meaning as Cost Modelling). Stored only; nothing is calculated from it yet.
- **Attributes:** extra fields an admin defines per category - Text, Number, Yes/No or Pick-list. The type
  can't change once created. A product shows the attributes of its own category.
- **Images and documents** in R2 under `pim/` (same three-step upload as Projects; 20 MB each; images
  JPEG / PNG / HEIC / WebP / GIF; documents PDF / Word / Excel / PowerPoint / CSV / text / ZIP). The first
  image is the **main** one (shown in the list); another can be made main; removing the main image promotes
  the oldest remaining one.
- **Completeness:** "x of y required fields filled". An admin ticks, per category, which built-in fields
  count (short / long description, brand, supplier, barcode, RRP, main image, packaging) and can mark
  attributes as required. A category with nothing required shows 100%.
- **Change history:** one line per save listing what changed (old -> new), plus file additions / removals
  and imports. Saving with no changes records nothing.

### Categories and attributes (admins)

One level of sub-category. A category or attribute that products use can only be **switched off**
(hidden from new and edited products; existing products keep their values); an unused one can be
**deleted**. Renaming never changes products. The category list is separate from Cost Modelling's.

### CSV import and export

- **Export** downloads the products matching the current filters. Cells starting with `=`, `+`, `-` or `@`
  are protected so Excel doesn't run them as formulas.
- **Import** (editors and admins) is two steps: choose the file and it is **checked first**, listing every
  problem by spreadsheet row; only a clean file can be imported, and then **all rows are saved or none**.
  A **template** can be downloaded.
- Columns: Product number, Name, Status, Brand, Category, Sub-category, Suppliers, Short description,
  Long description, Barcode, RRP. Only the first two are required. Several suppliers go in one cell,
  separated by `;`, with the code after a colon (`Acme: A-1; Beta`); the first is primary.
- An existing product number **updates** that product; **a blank cell never erases saved data**.
  Categories must already exist (an admin adds them). Images, documents, packaging and attributes are
  not imported. Up to 2,000 products at a time.

### How it fits together

- **Schema** `server/db/schema/pim.ts`: `pim_categories` (parent id for sub-categories, required fields),
  `pim_attributes`, `pim_products`, `pim_product_suppliers`, `pim_packaging`, `pim_attribute_values`,
  `pim_files`, `pim_history`. Migration `0014_faulty_chameleon.sql`. The database also enforces unique
  product numbers (ignoring case), one primary supplier and one main image per product.
- **Pure logic** `shared/utils/pimRules.ts` (checks, suppliers, attributes, completeness, file rules, CSV
  reading / building / template, history diffs); API types in `shared/types/pim.ts`.
- **Server** `server/utils/pim.ts` (all the work) and `pimBodies.ts` (request checks).
- **API** under `server/api/tools/pim/`: `my-role`; `categories` (GET, POST, `[id]` PUT / DELETE);
  `attributes` (POST, `[id]` PUT / DELETE); `products` (GET, POST, `export`, `import`, `[id]` GET / PUT /
  DELETE, `[id]/history`, `[id]/files` POST, `upload-url`, `[fileId]` DELETE, `[fileId]/main`). Every route
  uses `requireToolRole` and the `roles` array.
- **Pages** `app/pages/tools/pim/`: `index.vue` (tabs), `new.vue`, `products/[id].vue`, `access.vue`.
- **Components** `app/components/pim/`: `ProductList`, `ProductForm` (used for new and edit), `ProductPage`,
  `FilesSection`, `ImportDialog`, `CategoriesAdmin`, `CategoryCard`, `AttributeList`;
  `app/composables/usePimFiles.ts`. The **Storage clean-up** page knows about the `pim/` folder.
- **Tests:** `pnpm test` now runs **181** tests (15 new, `pimRules.test.ts`).

### One-time setup after applying this step

1. `pnpm db:migrate` (migration 0014). Run locally - Railway does not migrate. **Run it before pushing
   code that needs it.**
2. Supabase SQL Editor: run `server/db/manual-sql/010_seed_pim.sql` (registers the tool and its three
   roles). Safe to re-run.
3. Give people **Viewer / Editor / Admin** in Product Information -> Manage access.
4. As an admin, add the **categories**, their sub-categories, required fields and attributes before
   adding or importing products.

### Known limitations (fine for the demo)

- **Two people editing one product:** the last save wins (no "someone else changed this" warning).
- **Import** can't set images, documents, packaging or attributes, and a typed "draft" on an existing
  product doesn't change its status (only a non-draft status does).
- No bulk edit, no channel / retailer feeds, no link from Cost Modelling, Inspection or Projects to PIM
  products (their product text stays separate), no completeness report across all products.
- Links to images and documents expire after 15 minutes (reload the page). HEIC photos upload but browsers
  show an icon instead of a thumbnail.
- Currency is shown as AUD with no GST note; packaging is stored only.

**Verified:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (181 tests) and `pnpm build` pass. Claude exercised
the API against the real Supabase and R2 with temporary data (categories and attributes with every
refusal, products with validation, duplicates, history and search, real image and document uploads, main
image changes and removal, CSV export / round trip / import / refusals) and looked at the screens in the
browser pane, with a phone-width check for sideways scrolling. That check found and fixed two bugs (an
import wiped a sub-category when its cell was blank; the list buttons overflowed a phone). **Not verified by
Claude:** role refusals for non-owner accounts (the owner bypasses every check - Navin's multi-account test
is the end-to-end check) and uploads from a phone camera / HEIC photos (Navin will try after release). All
temporary data was removed afterwards through the app.


## Step 18: Dashboard (Posts and Upcoming events)

The dashboard's placeholders for **Announcements** and **Upcoming events** became real, and the page got its
final layout. Not a tool: there is no tool row and no role - **anyone who can sign in uses Posts**, and
only the owner manages events. Built in sub-steps 18.1 to 18.9 with Claude Code; Navin tested each stop.

### What people see

- **Posts** (2/3 width, top left): anyone can post text and up to 4 images (JPEG / PNG, 10 MB each), comment
  on posts (one level, no replies) and react with one of six emojis (thumbs up, heart, laugh, party, wow,
  thanks - one of each per person, click again to take it back). Authors **edit and delete their own** posts
  and comments (edited ones say "edited"); the **owner deletes anyone's** and can **pin one post** to the top.
  Posts load 10 at a time with "Load more".
- **Upcoming events** (1/3 column, top): the next 5 company events **and public holidays** (from Leave
  Applications, with a "Public holiday" label), soonest first; a multi-day event stays until its last day.
- **Away today** (1/3 column, below Upcoming events) is unchanged and still only shown to people with Leave
  access (otherwise Upcoming events fills the column).
- On a desktop the right column is exactly as tall as Posts; lists scroll inside their boxes. On a phone
  everything stacks: Posts, Upcoming events, Away today, then the placeholders.
- **Second row:** three 1/3-width placeholders - Sales overview, Project overview, Goals overview (Step 19).
- **Manage events** (`/admin/events`, owner only; linked from the Upcoming events footer and the dashboard's
  Owner section): add, edit and remove events - title, date, optional end date, time, place and note.
  Past events stay listed there.

### How it fits together

- **Schema** `server/db/schema/dashboard.ts`: `posts` (a unique index allows only one pinned post),
  `post_images`, `post_comments`, `post_reactions`, `post_comment_reactions`, `dashboard_events`. Migration
  `0015_numerous_union_jack.sql`. No manual SQL (no tool to register).
- **Pure logic** `shared/utils/postRules.ts` (limits, image rules, the six emojis, who may edit / delete,
  reaction counting, the API shapes) and `shared/utils/eventRules.ts` (event checks, picking the upcoming list).
- **Server** `server/utils/posts.ts` and `server/utils/dashboardEvents.ts`.
- **API** under `server/api/dashboard/`: `posts` (GET, POST, `image-upload-url`, `[id]` PUT / DELETE,
  `[id]/pin`, `[id]/reactions`, `[id]/comments` GET / POST), `post-comments/[commentId]` (PUT / DELETE,
  `reactions`), `events` (GET upcoming, `all`, POST, `[id]` PUT / DELETE). Routes use `requireProfile` or
  `requireOwner`.
- **Images** use the same three steps as Projects (approved upload link locked to the size, upload to R2,
  server confirms the file exists when the post is created). They live under `posts/` in R2; deleting a post
  deletes its files, and the Storage clean-up page knows the `posts/` folder.
- **Screens:** `app/components/dashboard/` `PostsWidget`, `PostCard`, `ReactionBar`, `UpcomingEvents`,
  `AwayToday` (now fills its box); `app/composables/usePostImages.ts`; `app/pages/admin/events.vue`; layout
  in `app/pages/index.vue`.
- **Tests:** `pnpm test` now runs **190** tests (9 new: `postRules.test.ts`, `eventRules.test.ts`).

### One-time setup after applying this step

1. `pnpm db:migrate` (migration 0015, only adds tables). Run locally - Railway does not migrate. **Run it
   before pushing the code.** (Already applied to the real database during the Step.)
2. Nothing else: no seed SQL and no role to hand out.

### Known limitations (fine for the demo)

- A post's images can't be changed after posting (edit the text, or delete and repost).
- No @mentions, no notifications (not even in-app), no email, no replies to comments, no search of old posts.
- Only one post can be pinned; reactions are limited to the six emojis.
- Only the owner manages events (there is no "events editor" role); no recurring events.
- Image links expire after 15 minutes (reload to refresh). HEIC photos are not accepted (JPEG / PNG only).
- A deactivated person's old posts and comments stay.

**Verified:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (190 tests) and `pnpm build` pass. Claude ran about
60 checks against the real Supabase and R2 using two temporary accounts plus the owner (limits, image rules,
edit / delete / pin permissions, reactions, comments, pagination, parallel reactions and pins, R2 file removal
on delete, event permissions, signed-out refusal) and drove the screens in the browser pane as the owner,
including the desktop column-height match and phone stacking with no sideways scrolling. All temporary data
was removed. **Not verified by Claude:** the dashboard as a non-owner in a real browser, the dashboard for
someone without Leave access, and a phone camera photo (Navin's multi-account test is the end-to-end check).
