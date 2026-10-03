-- =========================================================
-- KEYS99 - TIME OF DAY FOR SITE VISITS
--
-- The "Schedule a Site Visit" form on project pages already
-- saves the date in preferred_visit_date. This adds the time of
-- day the visitor picked, so visits can be filtered and sorted:
--
--   morning    10 am - 1 pm
--   afternoon   1 pm - 4 pm
--   evening     4 pm - 7 pm
--
-- Optional (null for other enquiry types). Visitors can still
-- only INSERT enquiries, as before. Until this runs, the form
-- keeps working: it retries without the time (which is also
-- written in the message).
-- =========================================================

alter table public.residential_enquiries
  add column if not exists preferred_visit_time text;

alter table public.residential_enquiries
  drop constraint if exists residential_enquiries_preferred_visit_time_check;
alter table public.residential_enquiries
  add constraint residential_enquiries_preferred_visit_time_check
  check (preferred_visit_time is null or preferred_visit_time in ('morning', 'afternoon', 'evening'));

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
--   order by e.preferred_visit_date,
--            array_position(array['morning','afternoon','evening'], e.preferred_visit_time);
-- ---------------------------------------------------------
