-- Run this ONCE in the Supabase SQL Editor, AFTER the Step 17 migration has been
-- applied with `pnpm db:migrate`. Safe to re-run.
--
-- Registers the Product Information (PIM) tool and its three roles:
--   viewer - sees every product and downloads files / the CSV export
--   editor - also creates and edits products, uploads files, imports CSV
--   admin  - also manages categories and attributes, and deletes products
-- The owner can do everything.
--
-- It adds no products or categories: admins build those in the app.

insert into public.tool_registry (id, name, description, icon, route, enabled)
values (
  'pim',
  'Product Information',
  'One searchable catalogue of RHG products: details, suppliers, packaging, images and documents, with CSV import and export.',
  'i-lucide-package-search',
  '/tools/pim',
  true
)
on conflict (id) do nothing;

insert into public.tool_roles (tool_id, role_key, role_label)
values
  ('pim', 'viewer', 'Viewer'),
  ('pim', 'editor', 'Editor'),
  ('pim', 'admin', 'Admin')
on conflict (tool_id, role_key) do nothing;
