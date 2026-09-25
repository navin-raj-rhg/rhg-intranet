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

## Notes

- `.env` is gitignored — never commit real credentials. `.env.example`
  documents every variable the project will eventually need.
- Migrations always run against the direct connection (port 5432);
  the running app always uses the pooled connection (port 6543).
