-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Registers the Expense Claims tool and its two roles. Uses ON CONFLICT so
-- it's safe to re-run if needed.

insert into public.tool_registry (id, name, description, icon, route, enabled)
values (
  'expense-claims',
  'Expense Claims',
  'Submit expense claims and, for managers, approve them and run payroll reports.',
  'i-lucide-receipt',
  '/tools/expense-claims',
  true
)
on conflict (id) do nothing;

insert into public.tool_roles (tool_id, role_key, role_label)
values
  ('expense-claims', 'employee', 'Employee'),
  ('expense-claims', 'manager', 'Manager')
on conflict (tool_id, role_key) do nothing;
