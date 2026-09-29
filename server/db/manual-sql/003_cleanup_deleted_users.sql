-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Like 001, it is NOT part of the Drizzle migration pipeline because it
-- touches Supabase's own `auth` schema.
--
-- Problem: 001 creates a profile when an auth user is created, but nothing
-- happened when an auth user was DELETED (e.g. from Authentication → Users),
-- so the profile lingered in Manage access and the "new sign-up" alert.
--
-- Part A: whenever an auth user is deleted, delete their profile too. That
-- also removes their user_tool_roles and tool_manager_links (both cascade).
-- If they have expense-claim or payroll history the delete is refused by the
-- database (those rows have no cascade, deliberately, so payroll history is
-- never lost). In that case the auth user is still deleted, but the profile
-- is kept so history stays intact.

create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  begin
    delete from public.profiles where id = old.id;
  exception when foreign_key_violation then
    null; -- has claim/payroll history: keep the profile row
  end;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute procedure public.handle_deleted_user();

-- Part B: one-time cleanup of profiles whose auth user is ALREADY gone.
-- Step 1 - preview what would be removed (should be just the stale fake):
--
--   select p.id, p.email from public.profiles p
--   where not exists (select 1 from auth.users u where u.id = p.id);
--
-- Step 2 - remove them (skips anyone with claim/payroll history):

delete from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id)
  and not exists (select 1 from public.expense_claims c where c.employee_id = p.id or c.approved_by = p.id)
  and not exists (select 1 from public.expense_payout_batches b where b.run_by = p.id);
