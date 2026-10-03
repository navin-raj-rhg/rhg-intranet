# RHG Intranet — Project Status (updated through Step 17)

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
numbered **Step** (Step 1 ... Step 17 done, Step 18 next), with sub-steps like 10.4. The
**Phases** group the steps. Refer to work by step number, e.g. "let's do
Step 15" or "back to 11.8b". Steps 1-17 are done; Step 18 and later are the agreed
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
fake Supabase auth server (answers `/auth/v1/user`, treating the access token (sent in the Supabase cookie since Step 14) as
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
  - *Claude Code* (used from Step 12): Claude edits the repo on Navin's
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
  an API route check must go through a signed-in browser (the login is in a
  cookie since Step 14; see Testing setup).

## Tech Stack

- **Frontend:** Nuxt 4 (TypeScript), Nuxt UI 4, Pinia. RHG colours and the blue
  header live in `app/assets/css/main.css` (orange in light mode, blue in dark mode). **Rendering mode is
  `ssr: false`** (client-side rendered only; `/api/*` Nitro routes are
  unaffected). A raw API URL typed into the browser shows Nuxt's own "404"
  page even when the server actually returned 401 - the terminal/console shows
  the real status.
- **Database:** Supabase (managed Postgres) + Drizzle ORM for all queries/migrations
- **Auth:** Supabase Auth — email/password for now; Microsoft 365 SSO planned before company-wide launch
- **File storage:** Cloudflare R2 (S3-compatible), accessed via presigned URLs
- **PDF generation:** `pdfkit` (expense-claims payroll report; inspection reports)
- **Tests:** `pnpm test` runs Node's built-in test runner over `tests/*.test.ts`
  (pure logic only, no database) - **181 tests as of Step 17**.
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
route is protected by `server/middleware/auth.ts`, which validates the
Supabase login **cookie** (Step 14, `@supabase/ssr`; before that a Bearer
header). `useApiFetch` just sends the cookie along. Signed-out page requests
are redirected to /login by `server/middleware/pageGuard.ts`.

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
now uses it too, since Step 13).

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
| 12. Inspection Reporting | ✅ Done (12.1-12.12) | Product QC inspections at suppliers/DCs: admin-built templates, phone-first checklist with photos and Minor/Major non-conformances, calculated result, review and close, saved products, PDF (see below) |
| 13. Styling and clean-ups | ✅ Done (13.2-13.13) | RHG look, loading bar and faster requests, manager approvals banner, deactivate user, leave public holidays, cost model PDF and Setup tab, storage clean-up, many small fixes (see below) |
| 14. Cookie-based sessions | ✅ Done (14.1-14.7) | `@supabase/ssr` cookies instead of the Bearer header, server-side redirect of signed-out page requests (see below) |
| 15. Sign-up restriction | ✅ Done (15.1-15.5) | Only allowed company email domains (or listed single addresses) can create an account; enforced in the database (see below) |
| 16. Projects | ✅ Done (16.1-16.11) | Project management for product launches: project types, master task list with sections, dependencies with automatic due dates, list and board, comments and files, dashboard banner (see below) |
| 17. Product Information (PIM) | ✅ Done (17.1-17.11) | Product catalogue replacing Plytix: products with several suppliers, packaging, attributes per category, images and documents, completeness score, change history, CSV import and export (see below) |

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

### Step 12: Inspection Reporting (complete)

Sub-steps (renumbered once, when two admin screens turned out to be missing from
the first plan): 12.1 decisions, 12.2 rules + tests, 12.3 database (migration
0006, seed 007), 12.4 API, 12.5 photos, 12.6 report list + access page, 12.7
admin screens (Suppliers & DCs, template form builder), 12.8 new-inspection form
and checklist (12.8b: products + camera buttons, migration 0007), 12.9 reviewer
actions / history / delete, 12.10 PDF, 12.11 access + launcher check, 12.12 docs.
The repo `README.md` has the full technical write-up. First step done with
Claude Code, committing and pushing sub-step by sub-step when Navin asked.

**What it is:** product QC inspections at **suppliers** and **DCs**. An
inspector records a report from a template, answers every point, attaches photos
and submits it; a reviewer closes it or sends it back; anyone can download a PDF.

**Roles** (tool id `inspection-reporting`): `inspector` (start reports; edit,
submit and discard their own drafts), `reviewer` (close or send back reports in
review), `admin` (build templates, manage the Supplier/DC list, edit any draft,
delete any report). Owner bypasses all three. **Everyone with a role sees every
report.** No manager links (the tool has no employee/manager roles). Ticking
Admin alone does not let someone close reports - that needs Reviewer.

**Decisions (Navin's):**
- **Subject:** product QC at suppliers or DCs. One admin-managed list of
  supplier names and DC locations (type Supplier / DC), picked when starting a report.
- **Templates:** built by admins in a form builder - named **sections**, each
  with **inspection points**. Every point has a comment box, photos and
  **Compliant / Non-Conformance** (plus **N/A**, added so a point that doesn't
  apply can still be answered). Non-Conformance opens a dialog; for now it only
  asks **Minor or Major** - **its other contents are to be decided later**.
- **Result** is calculated, never typed: any Major, or 3 or more Minor = **Fail**;
  1-2 Minor = **Pass with conditions**; otherwise **Pass** (rule in
  `shared/utils/inspectionRules.ts`, one rule for all templates). It updates live
  while filling in and is **frozen when a reviewer closes** the report.
- **Workflow:** draft -> in review -> closed, plus "send back" (in review -> draft,
  comment required). Submitting needs every point answered and every
  Non-Conformance given Minor/Major, and shows a **warning if any
  Non-Conformance is present**. Closed reports can't change.
- **Photos:** no caption, no limit on how many, **10 MB each**, JPEG / PNG / HEIC.
  Phone: separate **Take photo** (camera) and **Choose photos** (library) buttons.
- **Products:** a report lists **several products**, each with a **product number
  and a description** (up to 20). Saved products are recalled when a product number
  is typed (descriptions only; **from inspections only**, not Cost Modelling). Saving
  a report with a description updates the saved one (latest wins); a blank
  description never erases it. **One checklist per report**, not one per product.
- **A template is copied into each report** when it is started (and the
  supplier/DC name, products and answers are frozen with it), so editing a template
  or the list later never changes old reports.
- **PDF** per report (any status; a draft/in-review PDF says it is not final).
- **Phone first:** the checklist screen and form are designed for phone width.
- **Left for later (Navin):** defects and follow-up / corrective actions, and what
  the Non-Conformance dialog should ask.

**Tables:** `inspection_locations`, `inspection_templates` (sections as JSON),
`inspection_reports`, `inspection_report_points` (frozen section/point text +
answer), `inspection_photos`, `inspection_events` (history + reviewer comments),
`inspection_products` (saved products), `inspection_report_products`. Migrations
`0006_harsh_proemial_gods.sql` and `0007_short_mojo.sql`; manual SQL
`007_seed_inspection_reporting.sql` (tool + 3 roles, safe to re-run).

**Patterns worth reusing:**
- **Leaving a page with unsaved changes** uses our own dialog (Stay / Save and
  leave / Leave without saving), not `window.confirm` - embedded browsers (the
  Claude app pane) silently block the browser box and the user gets stuck.
- **Photos** are added in three steps: server approves type/size/permission and
  returns a presigned upload link locked to that exact size; the browser uploads
  to R2; the server confirms the file really exists, then records it.
- **Downloads** are fetched as a blob and saved (needed when the login was a Bearer
  header; a plain link would now work since Step 14, but nothing was changed) (`downloadPdf` in `ReportEditor.vue`).
- **Reports delete their R2 photo files** (best effort) when a draft is discarded
  or a report deleted.
- **Migrations that replace a column** keep the old column for one release
  (zero-downtime); `inspection_reports.product_no` was dropped in Step 13.

**Known limitations (acceptable for the demo):**
- **PDF text:** the built-in PDF fonts only cover Western characters - **Chinese
  and other non-Western text prints as "?"**. A bundled font would fix it (large file).
- **PDF photos:** full-size (no resizing library), JPEG/PNG only - **HEIC photos are
  listed as "not shown"**; capped at 80 MB of photos per PDF.
- **One checklist per report** - no separate result per product.
- **Result rule is fixed** (3 Minor = Fail) - not per template.
- **Non-Conformance dialog is only Minor/Major**; no defect log, no corrective-action
  tracking, no notifications.
- Suppliers/DCs and templates can only be **switched off**, never deleted or
  merged. (Templates can now be duplicated, and a reviewer can no longer close a report
  they started - both done in Step 13; the owner is exempt from that rule.)
- **Photo links expire after 15 minutes** (the page refreshes them when the tab is
  revisited); an upload that is started but never recorded leaves an unused file in R2.
- **Role refusals** (inspector can't close, reviewer can't edit, ...) are covered by
  unit tests and server checks but were only exercised with the owner account by
  Claude; Navin's multi-account test (navince Inspector, dh@test.com Reviewer,
  pt@test.com Admin, navin@test.com none) is the end-to-end check.
- `.claude/launch.json` (how the Claude app starts `pnpm dev` in its browser pane) is
  now tracked in git (committed in Step 13).

### Step 13: Styling and clean-ups (complete)

Sub-steps: 13.1 decisions, 13.2 Expense Claims clean-up, 13.3 Leave clean-up, 13.4
loading indicator and speed-up, 13.5 manager approvals banner, 13.6a cost model PDF,
13.6b Cost Modelling Setup tab, 13.7 deactivate user, 13.8 leave public holidays,
13.9 inspection fixes, 13.10 storage clean-up and dropping `product_no`, 13.11 RHG
look, 13.12 test-data clean-up, 13.13 docs. Committed and pushed sub-step by
sub-step when Navin asked. The repo `README.md` has the technical write-up.

**What it is:** no new tool - the accumulated small items plus the company look.

**Decisions (Navin's):**
- **Look:** light mode uses black / navy `14213D` / orange `FCA311` / grey `E5E5E5` /
  white; dark mode uses `00072D` / `001C55` / `0A2472` / `0E6BA8` / `A6E1FA`. The blue
  header carries the RHG logo (`public/rhg-logo.png`, blue background `006B96`).
  Names in the header stay white. Status colours are darker in light mode and
  brighter in dark mode so text stays readable.
- **Expense Claims:** statuses in sentence case, a new category **Others**, dates as
  dd/mm/yyyy, clean error text. **If the owner is also ticked as Employee, they get "My
  claims"** like anyone else.
- **Leave:** statuses in sentence case; dates use the browser date field (day, month,
  year jump) including the owner's join date / date of birth screen.
- **Manager banner:** managers and the owner see "Waiting for your approval" with
  counts of expense claims and leave and buttons into each tool. A deactivated
  employee's pending items still count. Own leave is never counted.
- **Speed:** loading bar on every page change, spinner on the clicked tool tile, and
  the server remembers a checked login for 60 seconds (accepting that a cancelled login
  can work for up to a minute). An expired login signs out and goes to the login page.
- **Cost Modelling:** **Save as PDF** on a saved model. A **Setup** tab for admins and
  the owner: rename / merge / delete categories and sub-categories (delete only if unused),
  add ports and local-cost charge lines (start at zero, filled in on Factors), switch
  ports and charge lines off and on (never deleted). Saved models are never rewritten.
- **Deactivate user:** owner-only, in Manage access, applies to every tool. The person is
  refused everywhere and hidden from lists and manager pickers; history and pending
  items stay; reactivation is one click. Refused for owners, for yourself, and while the
  person still manages active employees. Navin may add one or two more owners later.
- **Leave public holidays:** one company-wide national list the owner enters (starts
  empty). A holiday on a working day is skipped when counting; leave already applied for
  keeps its own copy of the holidays it skipped, so nothing old changes. Shown in blue on
  the team calendar.
- **Inspection:** a reviewer can't close or send back a report they started (the owner is
  exempt); **Duplicate** on a template makes "Copy of ..." switched off.
- **Storage:** deleting a claim or replacing a receipt deletes the old file when nothing
  else uses it. The owner's **Storage clean-up** page (`/admin/storage`) lists unused R2 files
  (over a day old, tool folders only) and deletes them after confirmation. The unused
  `inspection_reports.product_no` column was dropped.
- **PDF font:** skipped - Chinese text still prints as "?".
- **Test data:** cleared by Navin in the Supabase SQL editor (Claude listed it and wrote
  the statements, but the permission system blocked Claude from running mass deletes).
  `navin@test.com` and `pt@test.com` were removed; `dh@test.com` stays as the demo
  manager for the owner and `navince`. All inspection data, including the Temp Fence
  template and the Honde / VIC DC suppliers, was deleted and must be rebuilt for real use.

**New tables / columns:** `profiles.deactivated_at`, `leave_public_holidays`,
`leave_applications.holiday_dates`; `inspection_reports.product_no` dropped; enum value
`expense_category = 'others'`. Migrations `0008_green_wolverine.sql`,
`0009_dashing_hawkeye.sql`, `0010_oval_mandarin.sql`, `0011_odd_agent_zero.sql`. No new
manual SQL.

**Patterns worth reusing:**
- **Freeze what an old record used:** leave stores the holidays it skipped, cost models store
  their Factors - changing a shared list never rewrites history.
- **Never trust a stored file key when deleting:** `deleteIfUnreferenced` only deletes a
  file in a tool's own folder that no record points to.
- **Migration order for a dropped column:** push the code that stops using it, wait for the
  deploy, then run the migration (the reverse of adding a column).
- **Dev server on port 3000:** R2's CORS allows only that address and Railway, so
  uploads from another port fail with "failed to fetch".
- **Destructive SQL is run by Navin** in the Supabase SQL editor, from statements Claude
  writes and he approves one by one.

**Known limitations (acceptable for the demo):**
- Extra owners can only be set in the database; there is no screen for it.
- Deactivating blocks the person inside the app only (their Supabase login is untouched);
  the Leave calendar still shows a deactivated person's approved leave.
- Public holidays are one national list - no state holidays.
- Storage clean-up works on the oldest 200 files per scan.
- Chinese / non-Western PDF text prints as "?"; HEIC photos still aren't drawn in PDFs.
- Claude could only check the login page and header in the browser pane (the screens need
  a real login); Navin tested the rest, including every multi-account behaviour.

### Step 14: Cookie-based sessions (complete)

Sub-steps: 14.1 decisions, 14.2 plumbing (package, cookie browser client, server
helper), 14.3 server middleware reads the cookie, 14.4 `useApiFetch` stops sending
the header, 14.5 server-side page redirect, 14.6 full check, 14.7 remove the Bearer
fallback and docs. Not committed by Claude; Navin commits and pushes.

**Decisions (Navin's, all as recommended):** keep Bearer as a temporary fallback until
the end (then removed); server-side redirect of signed-out page requests only (never
`/api/*`), with the client guard kept as a backup; **everyone signs in once more after
release**; `ssr: false` unchanged; Supabase's default cookie lifetime, no "remember me";
no migration or SQL; Railway's HTTPS covers cookies.

**How it works:** `app/plugins/01.supabase.client.ts` (`createBrowserClient`),
`server/utils/supabaseServer.ts` (`serverSupabase(event)`), `server/middleware/auth.ts`
(cookie -> access token -> Supabase check / 60 s cache; an expiring login is refreshed
and the new cookie sent back), `server/middleware/pageGuard.ts` +
`shared/utils/pageGuard.ts` (302 to /login for signed-out page requests; 4 new tests).
`useApiFetch` no longer adds a header but still signs out and redirects on a 401.

**Also done (small fixes asked for during the step):** loading bar light blue in dark
mode (it was invisible on the blue header); "Back to the dashboard" link on the home
page of every tool.

**Release note:** no migration. After pushing, everyone is signed out once and signs in
again.

**Known limitations (acceptable for the demo):**
- Still `ssr: false`; this step is the prerequisite for turning SSR on, not that change.
- Deactivated people are redirected on the client (the API refuses them regardless).
- A login cancelled in Supabase can work for up to a minute (the cache).
- Downloads still use the blob approach although a plain link would now work.
- Claude could not sign in to the real Supabase; it checked build, tests and the signed-out
  redirect with `curl`, and Navin tested the signed-in behaviour with several accounts.

### Step 15: Sign-up restricted to company email addresses (complete)

Sub-steps: 15.1 decisions, 15.2 rule + tests, 15.3 database guard (manual SQL 008), 15.4 login
page (15.4b/c: a full-page reload after sign-in was tried for the password-save prompt and
reverted), 15.5 Confirm email and docs. Committed and pushed when Navin asked. The repo
`README.md` has the write-up.

**Decisions (Navin's, all as recommended):** allowed domains `rapidhardwaregroup.com.au` and
`ttfs.com.au`; the list lives in a database table edited by SQL; single outside addresses can
be allowed too; **Confirm email** switched ON in Supabase (this step, not left to the later email-provider work);
still built even though Microsoft SSO (now planned for after approval) may make it largely automatic.

**How it works:** table `allowed_signup_emails` (entry = a domain or one exact address) plus a
trigger `check_signup_email_allowed` on `auth.users` that rejects other addresses
(`server/db/manual-sql/008_signup_domain_guard.sql`, safe to re-run). The same rule is in
`shared/utils/signupRules.ts` (6 tests). The login page does not pre-block (it cannot see
single-address exceptions); it shows "Sign-up is limited to RHG email addresses..." when the
database refuses. Its inputs also now have `name` / `autocomplete` settings. No migration.

**Changed from the plan:** the guard also blocks accounts added by hand in Supabase's dashboard
(the database cannot tell them apart). To add an outsider, insert their address into the list
first.

**Known limitations (acceptable for the demo):**
- The list is edited by SQL only; no screen.
- Confirmation emails come from Supabase's built-in sender (testing-grade: low hourly limit,
  generic sender, may only reach Supabase team addresses). Custom SMTP needed before company-wide
  use (Phase 5, after approval). Tested by Navin: the confirmation email took several minutes to arrive, from
  "Supabase Auth <noreply@mail.app.supabase.io>".
- `isSignupEmailAllowed` is tested but not yet used by a screen (kept for when SSO is added).
- Edge did not offer to save the password after signing in on the live site, even with Bitwarden
  off; Navin saved it by hand. Not a site fault as far as we could tell.
- Claude could not sign in or sign up against the real Supabase; Navin tested the refusal and
  the confirmation email.

### Step 16: Projects (complete)

Sub-steps: 16.1 decisions, 16.2 rules + tests, 16.3 database (migration 0012, seed 009), 16.4 API,
16.5 admin screens (Task list, Project types), 16.5b sections (migration 0013), 16.6 project list and
"New project", 16.7 project view (list and board), 16.8 comments and files, 16.9 dashboard banner and
My tasks, 16.10 full check, 16.11 docs. Committed and pushed sub-step by sub-step when Navin asked.
The repo `README.md` has the technical write-up.

**What it is:** a generic **Projects** tool (replacing Asana, about 2k AUD/yr) built first for **product
launches**: Live, Promo and CSO. Tasks are the same across launches; a launch type just leaves some out.
Its point is the automation Asana couldn't do: **dependencies, and due dates handed out only when a task
unlocks.**

**Roles** (tool id `projects`): `user` (start projects; work on tasks in projects they belong to) and
`admin` (build the project types, sections and master task list; see and manage every project). Owner
bypasses both. No manager links, so Manage access shows two tickboxes. **Projects are private to their
members** (plus admins and the owner); each has an owner.

**Decisions (Navin's, all as recommended unless noted):**
- **Generic, not launch-only:** project types are admin-managed (Live, Promo and CSO seeded; Navin added
  others). A project with no type is a **blank project** whose tasks are added by hand.
- **One master task list** shared by every type; each task is **ticked for the types it applies to**.
  Starting a project copies the ticked tasks, so later edits never change running projects.
- **Sections** (Navin's request: Marketing, Quality, Purchasing...): an admin-managed, ordered list. Each
  master task sits in one; tasks are grouped by section everywhere. Running projects keep a frozen copy
  of the section name and position.
- **Dependencies:** a task is **Blocked** until everything it waits for is Done and has no due date.
  **Lead Time** (Navin's wording; working days, Mon-Fri, skipping the Leave public holidays): when the last
  task it waits for is finished, due date = **that day + Lead Time**. Tasks with nothing to wait for get
  start date + Lead Time. A task left out by a project type is **bridged over** (A -> B -> C without B
  becomes A -> C).
- **Assignees are named people** (default per task, changeable per project). People given a task are
  added to the project automatically.
- **Reopening a Done task:** unstarted tasks that depended on it go back to Blocked and lose their date;
  ones already in progress or done are left alone with a warning.
- **Target date** is optional and only drives an **At risk** flag (an open task is overdue or already due
  after it); it never moves a due date.
- **Views:** List (grouped by section) and Board (To do / In progress / Done; blocked tasks show a lock).
  Statuses are fixed: To do, In progress, Done.
- **Comments and files** on tasks; files go to R2 under `projects/`, 20 MB each, images / PDF / Word /
  Excel / PowerPoint / CSV / text / ZIP only (by extension; programs and scripts are refused).
- **Notifications:** in-app only - a dashboard banner "Tasks waiting for you" and a **My tasks** tab.
- **Project status reporting** (one project; all open projects for admins) is wanted but **deferred**.
- Hardening other tools is not part of this Step.

**Tables:** `project_types`, `project_sections`, `project_template_tasks`, `project_template_task_types`,
`project_template_task_deps`, `projects`, `project_members`, `project_tasks`, `project_task_deps`,
`project_comments`, `project_files`. Migrations `0012_secret_namor.sql` and `0013_cheerful_talos.sql`;
manual SQL `009_seed_projects.sql` (tool, roles, the three launch types; safe to re-run).

**Patterns worth reusing:**
- **A master list copied into each record** (as Inspection Reporting copies templates): editing it
  never changes what is running.
- **Dependency and due-date logic is pure** (`shared/utils/projectRules.ts`): bridging, loop detection,
  unlocking, reopening, at-risk. Server and screens share it.
- **Status changes lock the project row** (`for update`) inside a transaction so two people finishing
  tasks at once can't corrupt the dates.
- **Files** use the three-step upload from Inspection Reporting; the storage clean-up page knows about
  the `projects/` folder so it never flags these files.
- **Bulk data delete** is run by Navin in the Supabase SQL editor from statements Claude writes.

**Test data:** Navin cleared all Projects data (projects, master tasks, sections) after testing. The
four project types (Live, Promo, CSO, NPD switched off) remain. **The master task list is empty:** build
the real tasks and sections in Projects -> Task list / Types & sections before first use.

**Known limitations (acceptable for the demo):**
- **No status reporting yet** (see Backlog).
- Due dates can't be edited by hand; a task's Lead Time only applies when it unlocks.
- No subtasks, recurring tasks, Gantt / timeline, calendar view, drag-and-drop board, or time tracking.
- Project types and sections can only be switched off, never deleted, from the app (sections and types
  are removed by SQL).
- A member can't be removed while they have unfinished tasks (by design); a project's people list is
  visible to everyone with a Projects role.
- Notifications are in-app only (no email until a mail provider exists - Phase 5).
- Comments can't be edited or deleted.
- Role refusals for non-owner accounts were checked by unit tests and code review, not with a second
  account by Claude (the owner bypasses every check); Navin's multi-account test is the end-to-end check.
- Claude checked every screen in the browser pane at desktop and phone width (no sideways scrolling) and
  exercised the API, files and clean-up against the real database and R2 with temporary data.

### Step 17: Product Information (PIM) (complete)

Sub-steps: 17.1 decisions, 17.2 rules + tests, 17.3 database (migration 0014, seed 010), 17.4 API,
17.5 admin screens (Categories & attributes, Manage access), 17.6 product list and "New product", 17.7
product page (edit, delete, history), 17.8 images and documents, 17.9 CSV import, 17.10 full check,
17.11 docs. Not committed by Claude; Navin commits and pushes when he asks. The repo `README.md` has the
technical write-up.

**What it is:** one searchable catalogue of RHG products replacing Plytix (Tech File style): details,
several suppliers, packaging, attributes per category, images and documents, a completeness score and a
change history, with CSV import and export. **Retailer feeds / channels are not wanted** (Navin).

**Roles** (tool id `pim`): `viewer` (read, open files, export), `editor` (also create / edit products,
files, import) and `admin` (also categories, attributes, delete products). Owner bypasses all three. No
manager links, so Manage access shows three tickboxes. Everyone with a role sees every product.

**Decisions (Navin's, all as recommended):**
- **Core fields:** product number (unique across RHG, ignoring case), name, status (Draft / Active /
  Discontinued), brand, category and sub-category, barcode (GTIN with check digit), RRP (AUD), short and
  long description. **A product can have more than one supplier** (Navin's note): up to 10, each with an
  optional supplier code, one marked primary.
- **Categories:** admin-managed, one level of sub-category, separate from Cost Modelling's list.
- **Attributes:** admin-defined per category (Text, Number, Yes/No, Pick-list; type fixed once created).
- **Packaging and logistics:** carton / outer / pallet with L x W x H cm, weight kg, qty inside. Stored
  only, not linked to Cost Modelling yet.
- **Files:** multiple images with one main image; documents (spec sheets, certificates, manuals). R2 under
  `pim/`, 20 MB each, same type rules as Projects.
- **CSV:** import (check first, then all-or-nothing; updates by product number; blank cells never erase)
  and export. **Change history** per product. **Completeness score** per category (admin ticks the built-in
  fields and attributes that count).
- **No links** to Cost Modelling / Inspection / Projects this step.

**Tables:** `pim_categories`, `pim_attributes`, `pim_products`, `pim_product_suppliers`, `pim_packaging`,
`pim_attribute_values`, `pim_files`, `pim_history`. Migration `0014_faulty_chameleon.sql`; manual SQL
`010_seed_pim.sql` (tool + 3 roles; safe to re-run). The Storage clean-up page knows about `pim/`.

**Patterns worth reusing:**
- **Check first, then apply** for bulk imports: the same code path reports problems by spreadsheet row and
  later does the work, in one transaction.
- **One "data" shape** (`PimProductData`) used for loading, validating, comparing (history) and saving.
- **Blank never erases** on updates from a file.
- **Completeness computed in batches** for a list page (a handful of queries per page, not per product).

**Known limitations (acceptable for the demo):**
- Two people editing one product: last save wins (no conflict warning).
- Import can't set images, documents, packaging or attributes; a typed "draft" on an existing product
  doesn't change its status.
- No bulk edit, no channel feeds, no links to other tools, no all-products completeness report.
- Image / document links expire after 15 minutes; HEIC photos upload but browsers show an icon.
- RRP shown as AUD with no GST note; packaging is stored only.
- Claude exercised every route against the real Supabase and R2 with temporary data (later removed) and
  looked at the screens at desktop and phone width; that check found two bugs, both fixed (import wiped a
  blank sub-category; list buttons overflowed a phone). **Not verified by Claude:** role refusals for
  non-owner accounts (Navin's multi-account test is the end-to-end check) and uploads from a phone camera
  / HEIC (Navin will try after release).
- One unexplained, never-repeated database error appeared once on the product list when the dev server
  restarted (enum parameter on the image count query); a 40-round concurrency test could not reproduce it.
  Watch for it.

**Test data:** Navin's own test product "111" and the "hand tools" category (with a sub-category) exist
from his testing; clear or keep as he likes. Build the real categories, attributes and products before use.

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

- **Sign-up is limited to the allowed company domains (Step 15)**; others are refused by the
  database. Confirm email is ON in Supabase; the link redirects to the configured Site URL
  (the Railway address). Supabase's built-in mail sender is testing-grade - see Phase 5 in the Roadmap.
- **The new-sign-up alert is in-app only** - no email/push.
- **Deleting an auth user who has claim/payroll/leave/cost-model history**
  removes their login but keeps their profile row (deliberate, so history isn't
  lost). Use **Deactivate** in Manage access (Step 13) for people who leave: it blocks
  them in the app and hides them from lists, but leaves their Supabase login alone.
- **Extra owners** can only be set in the database (`profiles.is_owner`); no screen yet.
- **The manager link is live, not a snapshot:** re-linking an employee moves
  their pending claims/leave to the new manager (old manager loses sight of them).
- **Co-managers see each other's payroll reports**, including reports
  covering employees they don't share. Could be tightened.
- **The server remembers a checked login for 60 seconds** (Step 13.4) so most requests
  skip Supabase; a login cancelled in Supabase can therefore work for up to a minute.
  An expired login now signs out and goes to the login page.
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
- R2 files: deleting a claim or replacing a receipt now deletes the old file, and the
  owner's **Storage clean-up** page (`/admin/storage`) finds and deletes unused files.
- No Microsoft SSO yet - planned before company-wide launch.
- `NUXT_SUPABASE_DB_URL` (direct connection) is intentionally not set on
  Railway - migrations must be run manually from a local machine after any
  schema change; a push alone does not apply them (latest: `0014`; Steps 14 and 15 added none, Step 16 added `0012` and `0013`, Step 17 added `0014`). **Order for a
  release with a migration that ADDS something: run `pnpm db:migrate` first, then push**
  (the code needs the new tables or columns). **When a migration DROPS something, push
  first, wait for the deploy, then migrate** (as with `0011`). Manual SQL in `server/db/manual-sql/` (001 new-user trigger, 002
  expense-claims seed, 003 deleted-user trigger, 004 leave seed, 005 leave
  entitlements, 006 cost modelling seed, 007 inspection reporting seed, 008 sign-up domain guard, 009 projects seed, 010 PIM seed) is run by
  hand in the Supabase SQL editor.

## Testing setup

- Navin's owner account (`is_owner`, bypasses per-tool checks; also set up as an
  employee with `dh@test.com` as his manager in Expense Claims and Leave) and a second
  personal account (`navince`, employee; Cost Modelling User and Inspector/Reviewer).
- **`dh@test.com` is kept as the demo manager** (manager of the owner and `navince` in
  Expense Claims and Leave, Reviewer in Inspection Reporting). It was created via
  Supabase Authentication -> Users -> Add user (Auto Confirm ticked, fake address).
- **Test data was cleared in Step 13.12** (claims, payroll reports, leave and
  adjustments, the test holiday, the Hose Hangers cost model and Hobart port, all
  inspection data, `navin@test.com` and `pt@test.com`). Nothing is left to clear before a
  demo except any new test data. **Inspection Reporting is empty**: build the real
  template(s) and the supplier / DC list before using it. Destructive SQL is run by Navin
  in the Supabase SQL editor from statements Claude writes.
- Use a private window for the non-owner accounts.
- **To call an API route from the browser console** (Step 14: the login is in a
  cookie, so no token is needed):
  ```js
  fetch('/api/...').then(r => r.json()).then(console.log)
  ```

## Roadmap (agreed order)

The order is deliberate: build the tools first, then polish, then harden for
company-wide launch. **Each item below is a numbered Step** (with its own
sub-steps and stop-and-check-in rhythm, as in Steps 7, 9, 10 and 11). If a step
is ever inserted or reordered, renumber here so the numbers stay the shared
vocabulary.

### Phase 1 - Build at least 3 tools (Steps 7, 10, 11, 12)

Expense Claims (Step 7), Leave Applications (Step 10), Cost Modelling (Step 11)
and Inspection Reporting (Step 12) are done.

- **Step 12 - Inspection Reporting** ✅ done (see above)

- **Product Information Management (PIM)** (Navin's own note; renamed from "Product Data") - a
  product information tool similar to Tech File and Plytix. Done in Step 17 (see above).

Other tools from the original vision - container planning via Cargo Planner
API, PowerBI-style data charts, project management - are scheduled as Steps 16-20 (Phase 4; 16 and 17 done).

**Do at the start of each tool:** decide its roles. Leave uses `employee` +
`manager` (so links apply automatically); Cost Modelling uses `user` + `admin`
(no links); Inspection Reporting uses `inspector` + `reviewer` + `admin` (no
links); a tool that doesn't define both `employee` and `manager` simply
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

- **Step 13 - Styling and cleanups** ✅ done (see above).

**Backlog carried forward from Step 13 (not scheduled; each gets a Step number when
chosen):**
- Cost Modelling: the extra product-row columns and Factors Navin flagged; per-shipment
  vs per-container local costs and container weight limits; optionally make ticking
  Admin also tick User.
- Inspection Reporting: the **Non-Conformance dialog** contents and defects /
  follow-up (corrective) actions; HEIC / resized photos in the PDF; optional
  per-template pass/fail thresholds, per-product results, supplier/DC merge. (A
  Chinese-capable PDF font was skipped by choice.)
- Decide whether to tighten co-manager payroll-report visibility.
- A screen to make or remove extra owners (Navin may want one or two more).
- Add Drizzle `relations()` config if the manual `.leftJoin()` pattern keeps spreading.
- Streamline how a new tool is registered (currently a hand-run SQL seed).
- Leave: state public holidays (today one national list), if ever needed.
- A screen to manage the allowed sign-up list (today SQL only); decide whether the guard should
  exempt accounts added by hand in Supabase.
- Password-save prompt in Edge on the live site (not understood; hand-saving works).
- Projects (from Step 16): **status reporting** (per project and all open projects for admins);
  optional manual due-date override; delete-unused for sections and types from the app; email
  notifications (needs the Phase 5 mail provider); subtasks / recurring tasks / calendar view if the team
  asks; link a project to products now that the PIM (Step 17) exists.
- PIM (from Step 17): link Cost Modelling, Inspection Reporting and Projects to PIM products (they keep
  their own product text today); a "someone else changed this" warning for two editors; import of packaging,
  attributes and images; bulk edit; a completeness report across all products; confirm RRP currency / GST
  wording; the retailer-feed idea was dropped by Navin.

### Phase 3 - Launch hardening (Steps 14 and 15 done)

- **Step 14 - `@supabase/ssr` cookie-based sessions.** ✅ done (see above). Original plan, placed first on purpose:
  it changes how the session is stored (cookies instead of browser storage +
  Bearer header), so it is simplest to do before or together with Microsoft
  SSO, whose redirect/callback flow benefits from it. It also enables
  server-side route protection (no more app shell briefly sent to logged-out
  visitors) and is the prerequisite for ever turning `ssr: false` back off.
  Note the blast radius: `useApiFetch` (which now also redirects an expired login to
  /login), `server/middleware/auth.ts` (which now also remembers checked logins for 60
  seconds), the auth store and the login flow all change - keep it a step of its own, and re-test
  every tool afterwards. Optional if server-side page protection turns out not
  to matter, but recommended.
- **Step 15 - Sign-up restriction to company email addresses.** ✅ done (see above).

### Phase 4 - Build the business case (next)

**Why the order changed (Navin, after Step 15):** the demo exists to win approval from the
directors. Microsoft 365 SSO needs RHG's tenant details from the wider team, who would then ask
to see the intranet before it is ready - so SSO waits until after approval. Sign-up is already
limited to the company domains (Step 15), so the demo is safe to show meanwhile.

**Direction:** build more tools that **replace separate paid SaaS apps**, so the case can show
"cost of the SaaS apps vs running the intranet". Known example: **Inspection Reporting
(Step 12) replaces AuditComply, which RHG pays about 5k AUD per year.** Candidate:
**project management, replacing Asana (about 2k AUD per year for 20 seats).** Other figures are
not yet collected.

**Order agreed with Navin (start of Step 16):**

- **Step 16 - Project management** ✅ done (see above). Built as a generic "Projects" tool. **Project
  status reporting** (one project; and all open projects for admins) was wanted and is deferred: see
  the Backlog below - schedule it as its own small Step or sub-step when Navin chooses.
- **Step 17 - Product Information Management (PIM)** ✅ done (see above), replacing Plytix (Tech File style). RHG used
  to pay for Plytix, roughly **500 AUD/month (about 6k/yr) - Navin is not sure; confirm the real
  figure before it goes in the business case.**
- **Step 18 (next) - Container planning.** Replaces manual Excel calculations (no SaaS being cancelled).
  The tool produces data that **feeds Cargo Planner**, which RHG will pay for - so it is a new
  cost, not a saving; do not count it in the "SaaS replaced" total.
- **Step 19 - Dashboard widgets.**
- **Step 20 - PowerBI-style data charts.**

Hardening existing tools (backlog above, e.g. Inspection Reporting's Non-Conformance dialog and
follow-up actions) is **not** part of Step 16; it gets its own step later (Navin agreed).
Each Step starts with its own decisions list and sub-steps, as usual.
- **Later - a "cost comparison" view** for the pitch (apps replaced, yearly SaaS cost, running
  cost of the intranet). Needs real numbers from Navin; do not invent any.

### Phase 5 - After approval (rollout)

- **Microsoft 365 SSO** (needs RHG's Microsoft tenant details). If the app registration is
  limited to RHG's tenant this may make the email-domain restriction largely automatic - decide
  whether email/password sign-up stays at all.
- **Email provider and notifications.** Confirm Email is already ON (Step 15). Connect a real
  mail provider (custom SMTP) so confirmation emails come from an RHG address and aren't
  throttled or slow (Supabase's built-in sender took several minutes in the Step 15 test), and
  decide whether new-sign-up and leave-approval alerts need an email notification.
- A screen to manage the allowed sign-up list; decide whether the guard should exempt accounts
  added by hand in Supabase (both also in the Backlog above).
