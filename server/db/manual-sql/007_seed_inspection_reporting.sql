-- Run this ONCE in the Supabase SQL Editor, AFTER the Step 12 migration
-- (0006) has been applied with `pnpm db:migrate`. Safe to re-run.
--
-- Registers the Inspection Reporting tool and its three roles:
--   inspector - creates reports, edits and submits their own drafts
--   reviewer  - closes reports in review, or sends them back to draft
--   admin     - builds report templates, manages the supplier / DC list,
--               deletes reports
-- Everyone with any role can see every report. The owner can do everything.
--
-- It does NOT add suppliers, DCs or templates: admins add those in the app.

insert into public.tool_registry (id, name, description, icon, route, enabled)
values (
  'inspection-reporting',
  'Inspection Reporting',
  'Record product QC inspections at suppliers and DCs with checklists and photos, then review and close them.',
  'i-lucide-clipboard-check',
  '/tools/inspection-reporting',
  true
)
on conflict (id) do nothing;

insert into public.tool_roles (tool_id, role_key, role_label)
values
  ('inspection-reporting', 'inspector', 'Inspector'),
  ('inspection-reporting', 'reviewer', 'Reviewer'),
  ('inspection-reporting', 'admin', 'Admin')
on conflict (tool_id, role_key) do nothing;
