-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0004 (Step 11)
-- has been applied (it needs the cost_* tables). Safe to re-run: nothing
-- that already exists is overwritten, so admin-entered rates are kept.
--
-- Registers the Cost Modelling tool and its two roles, the ports, the AU
-- local-cost lines, the single Factors settings row, and a zero rate for
-- every route and every port/fee pair so the Factors screen is complete.
-- Exchange rates start at 0: an admin must fill them in before a model can
-- be saved.

insert into public.tool_registry (id, name, description, icon, route, enabled)
values (
  'cost-modelling',
  'Cost Modelling',
  'Cost products from FOB to landed cost in AUD, with container fill, shipping per unit and margins.',
  'i-lucide-calculator',
  '/tools/cost-modelling',
  true
)
on conflict (id) do nothing;

insert into public.tool_roles (tool_id, role_key, role_label)
values
  ('cost-modelling', 'user', 'User'),
  ('cost-modelling', 'admin', 'Admin')
on conflict (tool_id, role_key) do nothing;

-- Ports. code = the short label shown in tables.
insert into public.cost_ports (kind, code, name, sort_order)
values
  ('origin',      'SHA', 'Shanghai',  10),
  ('origin',      'NGB', 'Ningbo',    20),
  ('origin',      'TAO', 'Qingdao',   30),
  ('origin',      'XGG', 'Xingang',   40),
  ('destination', 'MEL', 'Melbourne', 10),
  ('destination', 'BRI', 'Brisbane',  20),
  ('destination', 'SYD', 'Sydney',    30),
  ('destination', 'ADL', 'Adelaide',  40),
  ('destination', 'FRE', 'Fremantle', 50)
on conflict (code) do nothing;

-- AU port local-cost lines (AUD per container).
insert into public.cost_local_fee_types (key, name, sort_order)
values
  ('thc_psc_lolo',         'THC / PSC / LOLO',     10),
  ('doc_fee',              'Doc Fee',              20),
  ('aqis_fee',             'AQIS Fee',             30),
  ('customs_clearance',    'Customs Clearance',    40),
  ('environmental_fee',    'Environmental Fee',    50),
  ('slot_fee',             'Slot Fee',             60),
  ('cmr_do',               'CMR / D.O.',           70),
  ('cor_fee',              'COR Fee',              80),
  ('heavy_weight_fee',     'Heavy Weight Fee',     90),
  ('wharf_infrastructure', 'Wharf Infrastructure', 100),
  ('toll_fees',            'Toll Fees',            110),
  ('cartage_sideloader',   'Cartage Sideloader',   120)
on conflict (key) do nothing;

-- The single Factors row (container CBM defaults 28 / 68).
insert into public.cost_factor_settings (id) values (1)
on conflict (id) do nothing;

-- A zero freight rate for every origin -> destination route.
insert into public.cost_freight_rates (origin_port_id, destination_port_id)
select o.id, d.id
from public.cost_ports o
cross join public.cost_ports d
where o.kind = 'origin' and d.kind = 'destination'
on conflict (origin_port_id, destination_port_id) do nothing;

-- A zero local cost for every AU port x fee line.
insert into public.cost_local_costs (destination_port_id, fee_type_id)
select d.id, f.id
from public.cost_ports d
cross join public.cost_local_fee_types f
where d.kind = 'destination'
on conflict (destination_port_id, fee_type_id) do nothing;

-- Check: expect 9 ports, 12 fee lines, 20 routes, 60 local-cost rows, 1 settings row.
select
  (select count(*) from public.cost_ports)           as ports,
  (select count(*) from public.cost_local_fee_types) as fee_lines,
  (select count(*) from public.cost_freight_rates)   as routes,
  (select count(*) from public.cost_local_costs)     as local_cost_rows,
  (select count(*) from public.cost_factor_settings) as settings_rows;
