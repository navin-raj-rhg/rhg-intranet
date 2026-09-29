-- Run this ONCE in the Supabase SQL Editor, AFTER the Step 10 migration has
-- been applied (it needs the leave_types table). Safe to re-run.
--
-- Registers the Leave Applications tool, its two roles, and the leave types.
-- It does NOT insert entitlement days: those are company policy and go in
-- leave_type_entitlements (see the template at the bottom).

insert into public.tool_registry (id, name, description, icon, route, enabled)
values (
  'leave-applications',
  'Leave Applications',
  'Apply for leave, check balances, see who is away, and (for managers) approve team leave.',
  'i-lucide-calendar-days',
  '/tools/leave-applications',
  true
)
on conflict (id) do nothing;

insert into public.tool_roles (tool_id, role_key, role_label)
values
  ('leave-applications', 'employee', 'Employee'),
  ('leave-applications', 'manager', 'Manager')
on conflict (tool_id, role_key) do nothing;

-- Leave types. cycle_start_month: 1 = Jan-Dec, 7 = Jul-Jun.
-- Only Annual (Jan) and Wellness Day (Jul) cycles have been confirmed; the
-- rest default to January and must be checked against policy.
insert into public.leave_types (key, name, sort_order, cycle_start_month, has_balance, date_restriction)
values
  ('annual',          'Annual Leave',         10, 1, true,  'none'),
  ('medical_personal','Medical / Personal',   20, 1, true,  'none'),
  ('unpaid',          'Unpaid Leave',         30, 1, false, 'none'),
  ('anniversary',     'Anniversary Leave',    40, 1, true,  'join_month'),
  ('birthday',        'Birthday Leave',       50, 1, true,  'birth_month'),
  ('wellness_day',    'Wellness Day',         60, 7, true,  'none'),
  ('marriage',        'Marriage Leave',       70, 1, true,  'none'),
  ('hospitalization', 'Hospitalization Leave',80, 1, true,  'none'),
  ('compassionate',   'Compassionate Leave',  90, 1, true,  'none'),
  ('maternity',       'Maternity Leave',     100, 1, true,  'none'),
  ('paternity',       'Paternity Leave',     110, 1, true,  'none')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- TEMPLATE (do not run as-is): entitlements, one row per tier.
-- min_years_service = completed years of service at which the tier starts.
--
-- insert into public.leave_type_entitlements (leave_type_id, min_years_service, days)
-- select id, 0, 1 from public.leave_types where key = 'wellness_day';
-- ---------------------------------------------------------------------------
