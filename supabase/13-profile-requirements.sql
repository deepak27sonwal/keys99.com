-- =========================================================
-- KEYS99 - WHAT EACH VISITOR IS LOOKING FOR (Profile > My Requirements)
--
-- Two sections on the visitor's own profile row, so the team can
-- recommend properties in both categories, and the Profile page can
-- show "Recommended for you". Filled from js/profile.js; owners can
-- already update their own row and admins read every row, so no new
-- policies are needed.
--
-- req_residential  { deal: "buy"|"rent", types: [...], cities: [...],
--                    localities, bhk: ["2 BHK",...], budget_min,
--                    budget_max (rupees; monthly rent when renting),
--                    possession: "ready"|"under_construction"|"any",
--                    purpose: "self_use"|"investment",
--                    timeline: "immediately"|"3_months"|"6_months"|
--                              "1_year"|"exploring",
--                    home_loan: true|false, notes }
-- req_commercial   { deal: "buy"|"lease", types: [...], cities: [...],
--                    localities, area_min, area_max (sq ft),
--                    budget_min, budget_max (price; monthly rent for
--                    lease), possession, purpose: "own_use"|
--                    "investment", timeline, notes }
-- req_updated_at   when either section was last saved.
--
-- Run once in Supabase > SQL Editor.
-- =========================================================

alter table public.profiles
  add column if not exists req_residential jsonb,
  add column if not exists req_commercial  jsonb,
  add column if not exists req_updated_at  timestamptz;

alter table public.profiles drop constraint if exists profiles_req_residential_check;
alter table public.profiles add constraint profiles_req_residential_check
  check (req_residential is null or (jsonb_typeof(req_residential) = 'object' and pg_column_size(req_residential) < 4096));

alter table public.profiles drop constraint if exists profiles_req_commercial_check;
alter table public.profiles add constraint profiles_req_commercial_check
  check (req_commercial is null or (jsonb_typeof(req_commercial) = 'object' and pg_column_size(req_commercial) < 4096));

comment on column public.profiles.req_residential is
  'Home requirement: deal (buy/rent), types, cities, localities, bhk, budget_min/budget_max (rupees, monthly rent if renting), possession, purpose, timeline, home_loan, notes';
comment on column public.profiles.req_commercial is
  'Commercial requirement: deal (buy/lease), types, cities, localities, area_min/area_max (sq ft), budget_min/budget_max (price, monthly rent if lease), possession, purpose, timeline, notes';
comment on column public.profiles.req_updated_at is
  'When the visitor last saved their requirements';
