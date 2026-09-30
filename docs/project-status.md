# RHG Intranet — Project Status (updated through Step 11)

> **Where this lives:** `docs/project-status.md` in the repo is the source of
> truth (Claude Code reads it via `CLAUDE.md`). Navin may also keep a copy in
> the Claude project; after each Step, copy the updated file there too.

**Purpose:** Internal company portal for RHG — a dashboard (company info,
sales, upcoming events, who is away today) plus a launcher for internal tools
(expense claims, leave applications, inspection reporting, cost modelling,
container planning via Cargo Planner API, PowerBI-style data charts, and
eventually project management). Currently a working demo supporting a business
case proposal to directors before company-wide rollout approval, deployed as a
live URL.

**Numbering convention (use this when talking to Claude):** everything is a
numbered **Step** (Step 1 ... Step 17 below), with sub-steps like 10.4. The
**Phases** group the steps. Refer to work by step number, e.g. "let's do
Step 12" or "back to 11.8b". Steps 1-11 are done; Steps 12+ are the agreed
roadmap and have not been started.

## Live demo

**https://rhg-intranet-production.up.railway.app**

Deployed on Railway, auto-deploying from `main` on every push. Treat this as
still a demo, not a public release - no company-wide announcement. Access is
controlled from the in-app **Manage access** screen (Step 9) rather than
manual SQL.

## Repo

**github.com/navin-raj-rhg/rhg-intranet** (public-readable to Claude's
sandbox network - `github.com`, `api.github.com`, `raw.githubusercontent.com`
and `codeload.github.com` are all reachable). **If this repo is made
private**, Claude's sandbox will no longer be able to clone it anonymously -
relevant files will need to be pasted into the conversation instead in any
future session.

**For Claude, in any new session working on this project:** you can check
the actual current state of the code directly, rather than relying only on
what's pasted into the conversation or on this summary possibly being
slightly stale:

```bash
git clone --depth 1 https://github.com/navin-raj-rhg/rhg-intranet.git
```

Useful for confirming a step was actually pushed, checking exact current
file contents before editing, or reviewing recent commit messages
(`git log --oneline`) to see what's landed since this summary was last
updated. (A clone made before Navin's latest push can be stale - re-pull if
something doesn't match.)

**Claude can verify its own work in the sandbox** (proven in Steps 9-11):
after cloning, `pnpm install --frozen-lockfile`, then `pnpm lint`,
`pnpm typecheck`, `pnpm test` and `pnpm build` all run there. For database
logic, Claude installs a local Postgres (`apt-get update && apt-get install -y
postgresql`), applies the repo's real migration SQL files and seeds, and tests
rules and queries against it (a fake `auth.users` table is enough for the
Supabase trigger scripts).

**Full-stack testing (added in Step 11):** Claude builds the app
(`pnpm build`), runs `.output/server/index.mjs` against that local Postgres
(`NUXT_SUPABASE_DB_POOL_URL`), and points `NUXT_PUBLIC_SUPABASE_URL` at a tiny
fake Supabase auth server (answers `/auth/v1/user`, treating the Bearer token as
the user id, with CORS on). That exercises the **real** API routes, roles and
queries end to end - only the login itself is faked. Pages are then driven in
headless Chromium with Playwright (fake session in localStorage under
`sb-127-auth-token`), checking figures, dialogs, navigation and phone width.
Two gotchas: fake user ids must be **valid v4 UUIDs** (the admin routes validate
them with Zod 4, which rejects `00000000-...-00000000000a`); and a tab kept
alive with `v-show` still has its tables in the page, so tests should target
elements by `data-testid`. Claude cannot reach the real Supabase/Railway/R2, so
real login, R2 uploads and the final end-to-end checks are always Navin's.

## Working method (important - read this)

The short version of these rules is in `CLAUDE.md` at the repo root.

- **One new chat/session per Step.** Every Step is done in its own new
  session (claude.ai chat or Claude Code). When a Step is finished and
  documented, Claude says so and Navin starts a new session for the next one.
- **Required at the end of every Step:** update this document
  (`docs/project-status.md`) and the repo `README.md` (a "Step N" section in the
  style of Steps 10 and 11), so the next session starts from an accurate
  baseline. Then Navin copies this file into the Claude project if he keeps one there.
- **Navin wants step-by-step instructions that STOP at the end of every
  sub-step**, so he can ask questions; Claude only moves on when he says
  "OK". Each stop lists exactly what to test and report back.
- Each step is announced with what will be built; anything ambiguous is put to
  Navin as a short decision list first, with a recommendation for each
  (e.g. Step 10's leave policy, Step 11's decisions 1-22 and F1-F5).
- **How changes reach the repo:**
  - *Claude Code* (from Step 12, planned): Claude edits the repo on Navin's
    machine directly, runs lint/typecheck/tests, and **does not commit or push
    unless Navin asks** for that sub-step. It asks before `pnpm db:migrate`, any
    SQL, or anything that writes to the real database.
  - *claude.ai chat* (Steps 9-11): Claude has no push access; it hands over a
    zip of the changed files (repo-relative paths) that Navin unzips over the
    repo root, tests, commits and pushes. Claude never commits or pushes (a
    stop-hook in the sandbox may ask it to - decline). Before each sub-step
    Claude re-clones the repo to confirm the previous one was pushed; if not,
    the next zip includes the earlier files too.
- Don't assume earlier conversation history; use this document, the repo and
  whatever Navin pastes in as the source of truth.
- After new files, Navin (or Claude Code) **restarts `pnpm dev`** (stale Nuxt
  auto-imports otherwise cause errors like "parseDateMY is not defined").
  When a step includes a migration, `pnpm db:migrate` is run locally.
- Claude should not assume one action fixes something without checking: e.g.
  a suggested address-bar check of an API route is invalid because the app
  authenticates with a Bearer header, not cookies (see Testing setup).

## Tech Stack

- **Frontend:** Nuxt 4 (TypeScript), Nuxt UI 4, Pinia. **Rendering mode is
  `ssr: false`** (client-side rendered only; `/api/*` Nitro routes are
  unaffected). A raw API URL typed into the browser shows Nuxt's own "404"
  page even when the server actually returned 401 - the terminal/console shows
  the real status.
- **Database:** Supabase (managed Postgres) + Drizzle ORM for all queries/migrations
- **Auth:** Supabase Auth — email/password for now; Microsoft 365 SSO planned before company-wide launch
- **File storage:** Cloudflare R2 (S3-compatible), accessed via presigned URLs
- **PDF generation:** `pdfkit` (expense-claims payroll report)
- **Tests:** `pnpm test` runs Node's built-in test runner over `tests/*.test.ts`
  (pure logic only, no database) - **82 tests as of Step 11**.
- **Package manager:** pnpm
- **Hosting:** Railway (Node server), auto-deploying from `main`

## Key Architecture Decisions

**Tool registry pattern:** Tools aren't hardcoded — they're rows in a
`tool_registry` table. Each tool gets its own DB schema file(s), API routes
under `server/api/tools/<tool-id>/`, and pages under
`app/pages/tools/<tool-id>/`, but is centrally registered so the launcher
page lists them dynamically.

**Per-tool roles, multiple per user (Step 9):**
- `profiles.is_owner` — global bypass flag that sees/manages everything,
  separate from the per-tool system.
- `tool_roles` — role definitions scoped per tool. For expense-claims and
  leave-applications these are `employee` and `manager`; for cost-modelling
  they are `user` and `admin`.
- `user_tool_roles` — who has which role in which tool. **A user can hold
  several roles in one tool** (unique on `(user_id, tool_id, role_key)`).
  Presence of any row = the tool is visible to them on the launcher. **New
  sign-ups have no rows, so they see nothing.**
- **`server/utils/requireToolRole.ts`** — standard gate for every tool's API
  routes. Returns `roles: string[]` (use this: `roles.includes('manager')`;
  the owner bypass returns `['owner']`) plus a legacy single `role` that is
  **not reliable for multi-role users** - don't use it in new code.

**Employee -> manager teams (Step 9):** table `tool_manager_links`
(`tool_id, employee_id, manager_id`; unique per triple; DB check that nobody
manages themselves). An employee has **one or more** managers and **any one**
can approve. A manager sees only employees linked to them; owner sees all.
- A tool "uses links" if it defines **both** an `employee` and a `manager`
  role (`toolUsesManagerLinks()` in `server/utils/toolAccess.ts`). Cost
  Modelling doesn't, so its Manage access shows just User/Admin tickboxes.
- **`server/utils/toolTeams.ts`** — reusable helpers: `getManagedEmployeeIds`,
  `getManagerIdsOf`, `isManagerOf`, `getPeerManagerIds`.
- **`server/utils/toolAccess.ts`** — `saveToolUserAccess()`: the one place that
  saves roles + managers, in a single transaction, enforcing: roles exist for
  the tool; an employee needs >= 1 manager; no self-management; chosen
  managers must already be *saved* as Manager; a Manager role/link can't be
  removed while an employee would be orphaned (error names them); removing all
  roles removes links. Throws `ToolAccessError`, which the route maps to HTTP.

**Owner-only admin API (Step 9), generic for every tool:**
`server/api/admin/tools/[toolId]/roles.get.ts`, `users.get.ts`,
`users/[userId].put.ts`, plus `server/api/admin/pending-users.get.ts` (users
with no role in any tool). All use the existing `requireOwner`.

**Admin UI (Step 9):** reusable `app/components/ToolAccessAdmin.vue`
(`<ToolAccessAdmin tool-id="..." />`); each tool has its own page
`app/pages/tools/<tool-id>/access.vue` (owner-only "Manage access" button on
the tool page). **Convention:** the dashboard's new-sign-up banner links to
`<tool route>/access`, so **every new tool needs that access page.**

**Data access:** All data goes through Nitro server API routes using
Drizzle — never direct `supabase-js` queries from the client. Every `/api/*`
route is protected by `server/middleware/auth.ts`, which validates a
**`Authorization: Bearer <token>`** header (the client's `useApiFetch`
attaches it from the Pinia auth store). Cookies are not used, so a browser
address-bar request is always unauthenticated.

**File storage:** One R2 bucket, organised by key prefix
(`<tool-id>/<yyyy>/<mm>/<uuid>-<filename>`). Browser uploads go straight to
R2 via presigned URLs. A tool with its own table referencing an R2 key
(like `expense_claims.receipt_key` or `leave_applications.attachment_key`)
should do its own ownership/role check and call `getDownloadUrl()` directly,
rather than proxying through the generic `/api/storage/download-url` route.

**Pure shared logic (Step 10 pattern, used heavily in Step 11):** rules that
both the server and the forms need live in `shared/utils/` as dependency-free
TypeScript (no DB, no Vue), with `.ts` import extensions so Node's test runner
can run them directly, and are unit tested in `tests/`. Examples:
`leaveRules.ts`, `leaveForm.ts`, `leaveCalendar.ts`, `dates.ts`,
`costModel.ts`, `costFactors.ts`, `costModelForm.ts`, `costCategories.ts`.
Nuxt auto-imports `shared/utils` and `shared/types` - so give exported
helpers specific names (e.g. `portLocalCostTotal`, not `localTotal`) to avoid
auto-import clashes. Don't `structuredClone` a Vue reactive object (it throws;
copy by hand or `toRaw` first) - found in 11.8d.

**Server recalculates, then freezes (Step 11 pattern):** when a saved record
depends on changeable settings (Cost Modelling's Factors), the browser sends
only inputs; the server recalculates with the shared maths and stores both a
**snapshot of the settings** and the **calculated figures**, so history never
shifts. A save carries the settings version the screen used; if it changed,
the save is refused and the screen refreshes. Concurrent edits of one shared
record (Factors) use the same "expected version" check.

**Dates (Step 10):** stored and sent as ISO `YYYY-MM-DD`; shown and typed as
Malaysian **dd/mm/yyyy** (`formatDateMY`, `formatDateRangeMY`, `parseDateMY`
in `shared/utils/dates.ts`; day-first, never month-first). "Today" is the
Asia/Kuala_Lumpur date (`todayMY`, server-side `todayISO`), never the server's
own timezone. **Reuse for every future date on screen** (Expense Claims
still shows raw dates - a Step 13 cleanup item).

**No Drizzle `relations()` config yet** - list/join queries needing more than
one table use manual `.leftJoin()`. Worth adding `relations()` config if the
pattern spreads.

## Progress So Far

| Step | Status | What it covers |
|---|---|---|
| 1. Planning | ✅ Done | Stack decisions, roles model, tools roadmap |
| 2. Scaffold | ✅ Done | Nuxt 4 + Nuxt UI 4 + Pinia project, folder structure, env vars |
| 3. Database schema | ✅ Done | Core tables (`profiles`, `tool_registry`, `tool_roles`, `user_tool_roles`) |
| 4. Auth | ✅ Done | Supabase Auth, login/signup, owner-claim flow, route protection, auto-profile trigger |
| 5. R2 storage | ✅ Done | Upload/download presigned URL endpoints, `useR2Storage` composable |
| 6. Tool registry + dashboard shell | ✅ Done | `useTools` composable, dashboard lists tools the user can see |
| 7. First full tool: Expense Claims | ✅ Done | Submit, approve, payroll report/payout |
| 8. Deployment | ✅ Done | Live on Railway; `ssr: false` fix; R2 CORS |
| 9. Role admin + manager teams | ✅ Done | Manage access UI, multi-role, employee->manager teams, team-scoped Expense Claims, new-sign-up alert |
| 10. Leave Applications | ✅ Done (10.1-10.13, all pushed) | Apply/approve/reject/cancel, live balances by policy, team calendar, "Away today" tile |
| 11. Cost Modelling | ✅ Done (11.1-11.10, all pushed) | Factors (FX, CBM, freight, port local costs), saved cost models with frozen figures, landed cost per AU port, margins, duplicate, product look-up (see below) |

### Step 11: Cost Modelling (complete)

Sub-steps: 11.1 decisions, 11.2 maths + tests, 11.3 database (migration 0004,
seed 006), 11.4 Factors API, 11.5 Factors tab (11.5b: 20'/40HC side by side),
11.6 categories API, 11.7 cost models API, 11.8a list/search/view, 11.8b
new-model form, 11.8c duplicate/delete, 11.8d product look-up + numbered
same-day names (migration 0005), 11.9 Manage access + list title change,
11.10 docs. The repo `README.md` has the full technical write-up.

**Roles:** `user` (open the tool, view Factors, create/view/duplicate models,
add categories) and `admin` (also edit Factors and delete models). Owner
assigns both in Manage access; new people see nothing until given User.

**Decisions (Navin's):**
- Two tabs: **Cost Model** and **Factors**.
- **Factors:** USD->AUD, CNY->AUD; usable container CBM (28 / 68, admin-editable);
  **freight in USD** per 20' and 40HC for ship-from ports Shanghai, Ningbo,
  Qingdao, Xingang (Nanchang removed) to MEL, BRI, SYD, ADL, FRE; **local costs
  in AUD** per 20' and 40HC for each AU port and 12 charge lines (THC / PSC /
  LOLO, Doc Fee, AQIS Fee, Customs Clearance, Environmental Fee, Slot Fee,
  CMR / D.O., COR Fee, Heavy Weight Fee, Wharf Infrastructure, Toll Fees,
  Cartage Sideloader). 20' and 40HC shown side by side (Navin's preference).
- **Model header:** supplier, **ship-from port**, category, optional
  sub-category (shared lists; anyone can add; unique ignoring case), landed-cost
  basis 20'/40HC (default 40HC), notes.
- **Packing:** carton / outer / pallet, L x W x H cm + "qty inside" = what's
  DIRECTLY inside (Navin's four examples: clamps 20 x 30 x 10 = 6,000 per pallet;
  furniture leg 1 x 10 with pallet = 1 outer; pallet only; brackets 30 x 100 =
  3,000). The container uses the pallet if present, else outer, else carton.
- **Costs:** FOB in USD or CNY per row; tooling in the same currency, **shown
  separately, never in unit cost**; **duty % per row** (material-dependent,
  blank = 0), on the FOB value.
- **Shipping per unit and margins use the most expensive AU port** for the
  chosen origin (a deliberate buffer); landed cost is also shown for every AU
  port. Rapid GM on buyer buy price; Buyer GM on **RRP ex GST** (RRP / 1.1);
  both RRP and RRP ex GST shown.
- **Saved models are never edited** - Duplicate instead (uses today's Factors).
  They **never recalculate**: Factors and figures are frozen at save. Everyone
  sees all models; **only admins delete**. Name = *Category - Sub-category -
  Supplier - dd/mm/yyyy*, same-day repeats *(2)*, *(3)*. List shows
  **Category › Sub-category** as the title and supplier as the subtitle.
- **Product look-up:** product nos. are unique across RHG; typing offers the
  most recent saved version of each matching product; picking fills **only
  empty cells**, including prices (Navin chose "everything").

**Tables:** `cost_ports`, `cost_local_fee_types`, `cost_factor_settings` (one
row), `cost_freight_rates`, `cost_local_costs`, `cost_categories`,
`cost_sub_categories`, `cost_models` (`factors_snapshot` jsonb),
`cost_model_rows` (`results` jsonb). Migrations `0004_flawless_silver_sable.sql`,
`0005_keen_mauler.sql` (product no. index); manual SQL
`006_seed_cost_modelling.sql` (tool, roles, ports, charge lines, zero rates;
safe to re-run).

**Known limitations (acceptable for the demo):**
- Container fill is by volume only (no weight, stacking or orientation).
- All local costs are treated as per-container (some are really per shipment).
- Categories can't be renamed/merged/deleted in the app; ports and charge lines
  are added by SQL (insert the row, re-run the last two inserts of seed 006).
- Product look-up is based on saved models; there's no separate product catalogue.
- Ticking Admin without User works (Admin includes User's rights).
- **Navin flagged more product-row columns and more Factors to add later**
  ("clean up/add towards the end") - not yet specified.

## Step 9 reference (still true)

- Expense-claims specifics: categories are a fixed 7-value enum shared via
  `shared/utils/expenseCategories.ts`; status flow `submitted` -> `approved` ->
  `paid`, no reject path; an employee needs >= 1 linked manager to submit
  (owner exempt); a manager sees/approves only their team's claims; a payroll
  report covers approved claims from the runner's whole team (owner: everyone);
  report list/download limited to the runner and co-managers (cross-team ids
  return 404); approving is atomic (`UPDATE ... WHERE status='submitted'`);
  users holding both roles get tabs "Approvals & payroll" / "My claims".
- Sub-steps 9.1-9.8 (scope, migration `0002`, team-scoped claims, owner admin
  API + `saveToolUserAccess` tested with 21 checks, `ToolAccessAdmin` +
  access page, new-sign-up banner, deleted-user cleanup trigger, two-team
  isolation testing, documentation).

## Step 10 reference (still true)

Leave Applications: roles `employee` + `manager`; nobody approves their own
leave; decisions final; 11 table-driven leave types with Navin's entitlement
numbers in `005_seed_leave_entitlements.sql`; Mon-Fri only, half days 0.5,
per-type cycles, balances live with over-balance only a warning; Team calendar
and dashboard "Away today" show names and dates only. Full details in the
README's Step 10 section.

## Known Limitations (acceptable for demo, flagged to revisit before company-wide launch)

- **Anyone with the URL can still sign up.** They see nothing until the owner
  assigns a role (and appear in the dashboard banner), but sign-up should be
  restricted to company email addresses before rollout. Email confirmation in
  Supabase (Authentication → Configuration → Sign In / Providers → Email →
  Confirm email) should be ON for launch; the confirmation link redirects to
  the configured Site URL (the Railway address).
- **The new-sign-up alert is in-app only** - no email/push.
- **Deleting an auth user who has claim/payroll/leave/cost-model history**
  removes their login but keeps their profile row (deliberate, so history isn't
  lost); they still appear in Manage access. A proper "deactivate user" feature
  would fix this.
- **The manager link is live, not a snapshot:** re-linking an employee moves
  their pending claims/leave to the new manager (old manager loses sight of them).
- **Co-managers see each other's payroll reports**, including reports
  covering employees they don't share. Could be tightened.
- **Older components (Expense Claims) show raw API errors**
  (`[POST] "/api/...": 409 ...`); the Leave, Cost Modelling and admin screens
  use the clean server message via `app/utils/errorText.ts`. Also, an
  already-approved claim clicked again shows the generic "Only submitted claims
  can be approved"; the friendlier wording only appears in a true simultaneous race.
- **Rendering is `ssr: false`** (Step 8) - deliberate fix. Re-enabling SSR
  would reintroduce the logged-out-server-render issue unless paired with
  `@supabase/ssr` cookie-based sessions first.
- Session/route protection is otherwise client-side only (Step 4) - data is
  safe (every `/api/*` route is protected server-side), but a logged-out
  visitor's browser briefly receives the app shell. Fix later with `@supabase/ssr`.
- The generic `/api/storage/download-url` endpoint only checks "is signed in";
  each real tool adds its own ownership check (expense-claims and leave do).
- Registering a NEW tool (`tool_registry` + `tool_roles` rows) is still a
  manual SQL insert (see `server/db/manual-sql/002_...`, `004_...`, `006_...`),
  and each new tool needs its own `access.vue` page.
- Deleting an expense claim doesn't delete its R2 receipt object.
- No Microsoft SSO yet - planned before company-wide launch.
- `NUXT_SUPABASE_DB_URL` (direct connection) is intentionally not set on
  Railway - migrations must be run manually from a local machine after any
  schema change; a push alone does not apply them (latest: `0005`). Manual SQL
  in `server/db/manual-sql/` (001 new-user trigger, 002 expense-claims seed, 003
  deleted-user trigger, 004 leave seed, 005 leave entitlements, 006 cost
  modelling seed) is run by hand in the Supabase SQL editor.

## Testing setup

- Navin's owner account (`is_owner`, bypasses per-tool checks; in Leave he has
  also been set up as an employee with a linked manager to test the flow) and a
  second personal account (`navince`, employee; given Cost Modelling User in 11.9).
- **Team-isolation test accounts (created via Supabase Authentication → Users →
  Add user, Auto Confirm ticked, fake addresses):** `dh@test.com` (manager of
  navince), `pt@test.com` (manager of `navin@test.com`), `navin@test.com`
  (employee). These have claims/payroll reports (and possibly leave
  applications) attached; **clear or ignore before the director demo**, noting
  that deleting a user with history leaves their profile row (see limitations).
- **Also clear before the demo:** test leave applications (several cancelled,
  some pending/approved), any test leave adjustments, uploaded test
  attachments, and **test cost models and categories** (e.g. "Test Supplier" /
  category "TEST" from 11.8a, and anything else created while testing Step 11 -
  see the clean-up SQL in the Step 11.10 hand-over).
- Use a private window for the non-owner accounts.
- **To call an API route authenticated from the browser console** (the address
  bar can't - no cookies): read the Supabase token from localStorage and send
  it as a Bearer header:
  ```js
  const k = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
  const token = JSON.parse(localStorage[k]).access_token
  fetch('/api/...', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json()).then(console.log)
  ```

## Roadmap (agreed order)

The order is deliberate: build the tools first, then polish, then harden for
company-wide launch. **Each item below is a numbered Step** (with its own
sub-steps and stop-and-check-in rhythm, as in Steps 7, 9, 10 and 11). If a step
is ever inserted or reordered, renumber here so the numbers stay the shared
vocabulary.

### Phase 1 - Build at least 3 tools (Steps 7, 10, 11, 12)

Expense Claims (Step 7), Leave Applications (Step 10) and Cost Modelling
(Step 11) are done.

- **Step 12 - Inspection Reporting** (not started - next)

Other tools from the original vision - container planning via Cargo Planner
API, PowerBI-style data charts, project management - remain on the list for
after Phase 3 or later; they get a step number when they are scheduled.

**Do at the start of each tool:** decide its roles. Leave uses `employee` +
`manager` (so links apply automatically); Cost Modelling uses `user` + `admin`
(no links). Inspection Reporting may need an inspector/reviewer split or one
plain role; a tool that doesn't define both `employee` and `manager` simply
has no manager links, and `ToolAccessAdmin` adapts on its own. Put any rules or
maths in `shared/utils` with unit tests (Step 10/11 pattern).

**Per-tool checklist (from Steps 7, 9, 10 and 11):**
- Drizzle schema file + migration (run locally; Railway doesn't migrate).
- `manual-sql/00X_seed_<tool>.sql`: `tool_registry` row + `tool_roles` rows.
- API routes under `server/api/tools/<tool-id>/`, all gated with
  `requireToolRole` using the `roles` array (never the legacy `role`), and
  `toolTeams` helpers wherever work is scoped to a manager's team.
- Its own `app/pages/tools/<tool-id>/access.vue` rendering `<ToolAccessAdmin>`
  plus the owner-only "Manage access" button on the tool page (the dashboard
  banner links to `<tool route>/access`).
- Any file (photos, PDFs) via R2 with the tool's own ownership check.
- Dates shown as dd/mm/yyyy via `shared/utils/dates.ts`; clean error text via
  `errorText`.
- `pnpm lint` + `pnpm typecheck` + `pnpm test`, the full-stack browser test
  (see "Claude can verify its own work"), then Navin's end-to-end test using
  more than one account.
- After the tool: update this document and the repo `README.md`.

### Phase 2 - Styling and cleanups

- **Step 13 - Styling and cleanups.** Visual polish across the app, plus the
  accumulated small items:
  - Shared error-message helper used by all screens (Expense Claims still shows
    `[POST] "/api/...": 409 ...`; `app/utils/errorText.ts` already exists).
  - Show Expense Claims dates as dd/mm/yyyy with the shared date helpers.
  - Friendlier "already approved" wording on the approve route.
  - "Deactivate user" instead of relying on deleting users (fixes the ghost
    profile left when a user with history is deleted).
  - Decide whether to tighten co-manager report visibility.
  - Delete orphaned R2 files (receipts, leave attachments) or add a cleanup job.
  - Public-holiday calendar for leave (so holidays don't count as leave days).
  - Add Drizzle `relations()` config if the manual `.leftJoin()` pattern keeps
    spreading.
  - **Cost Modelling:** the extra product-row columns and Factors Navin
    flagged; admin screen to rename/merge/delete categories and add ports /
    charge lines; optionally make ticking Admin also tick User; consider
    per-shipment vs per-container local costs and container weight limits.
  - Remove the fake test accounts and test claims/leave/reports/uploads/cost
    models before any demo.
  - Streamline how a new tool is registered (currently a hand-run SQL seed).

### Phase 3 - Launch hardening (before company-wide rollout)

- **Step 14 - `@supabase/ssr` cookie-based sessions.** Placed first on purpose:
  it changes how the session is stored (cookies instead of browser storage +
  Bearer header), so it is simplest to do before or together with Microsoft
  SSO, whose redirect/callback flow benefits from it. It also enables
  server-side route protection (no more app shell briefly sent to logged-out
  visitors) and is the prerequisite for ever turning `ssr: false` back off.
  Note the blast radius: `useApiFetch`, `server/middleware/auth.ts`, the auth
  store and the login flow all change - keep it a step of its own, and re-test
  every tool afterwards. Optional if server-side page protection turns out not
  to matter, but recommended.
- **Step 15 - Sign-up restriction to company email addresses** (so strangers
  can't create accounts). Options to weigh at the time: a Supabase auth hook or
  database check that rejects other domains, and/or removing email/password
  sign-up entirely once SSO is in.
- **Step 16 - Microsoft 365 SSO.** If the app registration is limited to RHG's
  tenant, this may make the email-domain restriction largely automatic - decide
  whether email/password sign-up stays at all.
- **Step 17 - Email confirmation and notifications.** Confirm Email turned ON in
  Supabase (Authentication → Configuration → Sign In / Providers → Email), and
  decide whether new-sign-up (and leave approval) alerts need an email
  notification (needs an email provider).
