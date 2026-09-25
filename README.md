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
