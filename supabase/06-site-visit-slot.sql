-- =========================================================
-- KEYS99 - SITE VISIT TIME SLOTS
--
-- Replaces the morning / afternoon / evening choice from
-- 05-site-visit-time.sql with an exact slot. The "Schedule a Site
-- Visit" form offers hourly slots from 10:00 to 18:00, and
-- preferred_visit_time now stores the slot as a real time (e.g.
-- 14:00:00), so visits sort by date and time.
--
-- Safe to run when no enquiry has a time yet; any old
-- morning/afternoon/evening value would become null.
-- =========================================================

alter table public.residential_enquiries
  drop constraint if exists residential_enquiries_preferred_visit_time_check;

alter table public.residential_enquiries
  alter column preferred_visit_time type time
  using (case when preferred_visit_time ~ '^\d{1,2}:\d{2}' then preferred_visit_time::time end);

alter table public.residential_enquiries
  add constraint residential_enquiries_preferred_visit_time_check
  check (preferred_visit_time is null or preferred_visit_time between time '09:00' and time '20:00');

grant insert (preferred_visit_time) on public.residential_enquiries to anon, authenticated;


-- ---------------------------------------------------------
-- Upcoming site visits - run any time in the SQL Editor:
--
--   select e.preferred_visit_date, e.preferred_visit_time,
--          e.contact_person, e.phone, p.project_name, e.status
--   from public.residential_enquiries e
--   join public.residential_projects p on p.id = e.project_id
--   where e.enquiry_type = 'schedule_site_visit'
--     and e.preferred_visit_date >= current_date
--   order by e.preferred_visit_date, e.preferred_visit_time;
-- ---------------------------------------------------------
