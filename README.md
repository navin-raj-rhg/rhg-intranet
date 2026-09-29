# RHG Intranet

Internal portal scaffold: Nuxt 4 + TypeScript + Nuxt UI 4 + Pinia + Drizzle ORM
(Supabase Postgres) + Cloudflare R2. This is the Step 2 scaffold — auth, real
schema, and tools come in later steps.

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
  role: employees see only their own, managers/owner see everyone's),
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

- **No admin screen for assigning tool roles yet.** Every assignment above
  is a manual SQL/Studio insert. Planned as a shared, owner-only screen
  (not specific to expense-claims) once this tool is validated end-to-end.
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
- No role-assignment admin UI - manual SQL only (see Step 7)
- Deleting an expense claim doesn't clean up its R2 receipt (see Step 7)
- No Microsoft SSO yet - planned before company-wide rollout

**Verified:** build succeeds on Railway; both an owner account and a second
non-owner test account were manually tested end-to-end against the live
Railway URL - login, dashboard tool listing, Expense Claims (employee
submit-with-receipt and manager approve/report/payout flows), and receipt/
report file upload and download via R2. `pnpm typecheck` and `pnpm lint`
both pass clean on the final code including the `ssr: false` change.