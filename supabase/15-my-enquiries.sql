-- =========================================================
-- KEYS99 - "ENQUIRED" AND "SITE VISITS" ON THE PROFILE PAGE
--
-- The profile shows how many projects a logged-in visitor enquired
-- about and how many site visits they asked for. Enquiries had no
-- link to the visitor, and visitors cannot read the enquiries table
-- (only admins and assigned agents can), so this:
--
--  1. adds user_id to both enquiry tables;
--  2. fills it on every insert from the login itself (auth.uid(), null
--     for a logged-out visitor), so it cannot be set from the browser;
--  3. adds my_enquiries(), which returns the caller's own enquiries and
--     nothing else of them: no notes, no agent, no staff columns.
--
-- Enquiries sent before this, or while logged out, have no user_id and
-- are not returned (the profile also counts the ones sent from the
-- same browser). Safe to run more than once.
--
-- Run once in Supabase > SQL Editor.
-- =========================================================

alter table public.residential_enquiries
  add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.commercial_enquiries
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists residential_enquiries_user_idx
  on public.residential_enquiries (user_id) where user_id is not null;
create index if not exists commercial_enquiries_user_idx
  on public.commercial_enquiries (user_id) where user_id is not null;

-- The visitor behind the request, taken from the login (never from the form).
create or replace function private.set_enquiry_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists set_enquiry_user on public.residential_enquiries;
create trigger set_enquiry_user
  before insert on public.residential_enquiries
  for each row execute function private.set_enquiry_user();

drop trigger if exists set_enquiry_user on public.commercial_enquiries;
create trigger set_enquiry_user
  before insert on public.commercial_enquiries
  for each row execute function private.set_enquiry_user();

-- The caller's own enquiries, newest first.
create or replace function public.my_enquiries()
returns table (
  project_id           uuid,
  kind                 text,
  enquiry_type         text,
  preferred_visit_date date,
  preferred_visit_time time,
  created_at           timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select e.project_id, 'residential'::text as kind, e.enquiry_type,
           e.preferred_visit_date, e.preferred_visit_time, e.created_at
      from public.residential_enquiries e
     where e.user_id = (select auth.uid())
    union all
    select e.project_id, 'commercial'::text, e.enquiry_type,
           e.preferred_visit_date, e.preferred_visit_time, e.created_at
      from public.commercial_enquiries e
     where e.user_id = (select auth.uid())
  ) mine
  order by mine.created_at desc
  limit 200;
$$;

revoke all on function public.my_enquiries() from public, anon;
grant execute on function public.my_enquiries() to authenticated;

-- Check (run separately):
-- select column_name from information_schema.columns
--  where table_name in ('residential_enquiries','commercial_enquiries') and column_name = 'user_id';
-- select proname from pg_proc where proname = 'my_enquiries';
