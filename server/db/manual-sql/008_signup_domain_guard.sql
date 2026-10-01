-- Run this ONCE in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run. Not part of the Drizzle migrations because it touches
-- Supabase's own `auth` schema.
--
-- What it does: only email addresses on the allowed list can create an account.
-- An entry is either a whole domain ('company.com') or one exact address
-- ('jane@other.com'). Existing accounts are NOT affected. Same rule as
-- shared/utils/signupRules.ts (that one only gives a friendly early message).
--
-- NOTE: this applies to every new account, including ones you add by hand in
-- Authentication -> Users -> Add user. To add an outside person, first run:
--   insert into public.allowed_signup_emails (entry) values ('person@other.com');
--
-- To allow another company domain later:
--   insert into public.allowed_signup_emails (entry) values ('newdomain.com.au');
-- To stop allowing one:
--   delete from public.allowed_signup_emails where entry = 'newdomain.com.au';

create table if not exists public.allowed_signup_emails (
  entry text primary key,
  created_at timestamptz not null default now(),
  constraint allowed_signup_entry_clean check (entry = lower(btrim(entry)) and entry <> '')
);

-- Keep the list private: with security on and no policies, the public API
-- can't read or change it. Only you (SQL editor) and the guard below can.
alter table public.allowed_signup_emails enable row level security;

insert into public.allowed_signup_emails (entry) values
  ('rapidhardwaregroup.com.au'),
  ('ttfs.com.au')
on conflict (entry) do nothing;

create or replace function public.check_signup_email_allowed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  addr text := lower(btrim(coalesce(new.email, '')));
  dom text := split_part(addr, '@', 2);
begin
  if addr = '' or dom = '' or exists (
    select 1 from public.allowed_signup_emails a
    where a.entry = addr or a.entry = dom
  ) is not true then
    raise exception 'Sign-up is limited to RHG email addresses.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists check_signup_email_allowed on auth.users;

create trigger check_signup_email_allowed
  before insert on auth.users
  for each row execute procedure public.check_signup_email_allowed();
