-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It is NOT part of the Drizzle migration pipeline because it touches
-- Supabase's own `auth` schema, which Drizzle doesn't (and shouldn't) manage.
--
-- What it does: whenever a new user signs up via Supabase Auth (email/
-- password, or Microsoft SSO once that's added), automatically create a
-- matching row in public.profiles, with is_owner defaulting to false.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
