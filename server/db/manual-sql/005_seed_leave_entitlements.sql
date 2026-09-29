-- Run in the Supabase SQL Editor AFTER 004_seed_leave_tool.sql.
-- Entitlement days per leave type, in tiers by completed years of service
-- (the employee gets the row with the highest min_years_service they've
-- reached). Re-running this UPDATES the days, so it is also how you change
-- a policy number: edit the value below and run it again.
--
-- Unpaid Leave has no balance (has_balance = false), so it has no rows.

insert into public.leave_type_entitlements (leave_type_id, min_years_service, days)
select t.id, v.min_years, v.days
from (values
  -- Annual: <2 yrs 14, 2 to <5 yrs 20, 5+ yrs 22
  ('annual',           0, 14.0),
  ('annual',           2, 20.0),
  ('annual',           5, 22.0),
  -- Medical / Personal (sick): <2 yrs 14, 2 to <5 yrs 18, 5+ yrs 22
  ('medical_personal', 0, 14.0),
  ('medical_personal', 2, 18.0),
  ('medical_personal', 5, 22.0),
  -- Flat policies
  ('compassionate',    0,  3.0),
  ('hospitalization',  0, 60.0),
  ('anniversary',      0,  1.0),
  ('birthday',         0,  0.5),
  ('marriage',         0,  2.0),
  ('wellness_day',     0,  1.0),
  ('maternity',        0, 60.0),
  ('paternity',        0,  7.0)
) as v(type_key, min_years, days)
join public.leave_types t on t.key = v.type_key
on conflict (leave_type_id, min_years_service)
do update set days = excluded.days;
