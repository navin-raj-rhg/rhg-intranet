-- Run this ONCE in the Supabase SQL Editor, AFTER the Step 16 migration
-- (0012_secret_namor) has been applied with `pnpm db:migrate`. Safe to re-run.
--
-- Registers the Projects tool and its two roles:
--   user  - starts projects, works on tasks in projects they are a member of
--   admin - builds project types and the master task list, sees and manages
--           every project
-- Projects are private to their members (plus admins and the owner).
-- The owner can do everything.
--
-- It also adds the three starting project types. It does NOT add any tasks:
-- admins build the master task list in the app.

insert into public.tool_registry (id, name, description, icon, route, enabled)
values (
  'projects',
  'Projects',
  'Run product launches and other projects as task lists with dependencies: a task unlocks, and gets its due date, when the tasks it waits for are done.',
  'i-lucide-list-checks',
  '/tools/projects',
  true
)
on conflict (id) do nothing;

insert into public.tool_roles (tool_id, role_key, role_label)
values
  ('projects', 'user', 'User'),
  ('projects', 'admin', 'Admin')
on conflict (tool_id, role_key) do nothing;

insert into public.project_types (name, sort_order)
values
  ('Live launch', 1),
  ('Promo launch', 2),
  ('CSO launch', 3)
on conflict do nothing;
