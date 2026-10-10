-- =========================================================
-- KEYS99 - CHANGE A SITE VISIT FROM "MY ENQUIRIES"
--
-- A logged-in visitor can move their own site visit to another
-- date / hourly slot from the Enquiries page. Visitors cannot update
-- the enquiries tables (staff only), so this adds one narrow function:
--
--  * reschedule_site_visit(kind, id, date, time) changes ONLY the visit
--    date and time of the caller's own site-visit request (matched by
--    the user_id from supabase/15-my-enquiries.sql), and only while
--    the team has not yet closed it (status new, follow_up or
--    site_visit_scheduled). The date must be tomorrow to 60 days ahead,
--    the time an hour from 10:00 to 18:00. A line is added to the
--    message so the team can see it was rescheduled.
--  * my_enquiries() now also returns the row id and status.
--
-- Run after 15-my-enquiries.sql, once, in Supabase > SQL Editor.
-- =========================================================

drop function if exists public.my_enquiries();

create function public.my_enquiries()
returns table (
  id                   uuid,
  project_id           uuid,
  kind                 text,
  enquiry_type         text,
  preferred_visit_date date,
  preferred_visit_time time,
  status               text,
  created_at           timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select e.id, e.project_id, 'residential'::text as kind, e.enquiry_type,
           e.preferred_visit_date, e.preferred_visit_time, e.status, e.created_at
      from public.residential_enquiries e
     where e.user_id = (select auth.uid())
    union all
    select e.id, e.project_id, 'commercial'::text, e.enquiry_type,
           e.preferred_visit_date, e.preferred_visit_time, e.status, e.created_at
      from public.commercial_enquiries e
     where e.user_id = (select auth.uid())
  ) mine
  order by mine.created_at desc
  limit 200;
$$;

revoke all on function public.my_enquiries() from public, anon;
grant execute on function public.my_enquiries() to authenticated;

create or replace function public.reschedule_site_visit(
  p_kind text, p_id uuid, p_date date, p_time time
)
returns table (preferred_visit_date date, preferred_visit_time time)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := (select auth.uid());
  note text;
  n    int;
begin
  if uid is null then
    raise exception 'Please log in to change a site visit.' using errcode = '28000';
  end if;
  if p_kind not in ('residential', 'commercial') then
    raise exception 'Unknown project type.' using errcode = '22023';
  end if;
  if p_date is null or p_date < current_date + 1 or p_date > current_date + 60 then
    raise exception 'Please pick a date from tomorrow up to 60 days ahead.' using errcode = '22023';
  end if;
  if p_time is null or p_time < time '10:00' or p_time > time '18:00' or date_part('minute', p_time) <> 0 then
    raise exception 'Please pick a time slot between 10:00 AM and 6:00 PM.' using errcode = '22023';
  end if;

  note := format('Rescheduled by visitor to %s at %s.', to_char(p_date, 'DD Mon YYYY'), to_char(p_time, 'HH12:MI AM'));

  if p_kind = 'residential' then
    update public.residential_enquiries e
       set preferred_visit_date = p_date,
           preferred_visit_time = p_time,
           message = concat_ws(E'\n', e.message, note)
     where e.id = p_id and e.user_id = uid
       and e.enquiry_type = 'schedule_site_visit'
       and e.status in ('new', 'follow_up', 'site_visit_scheduled');
  else
    update public.commercial_enquiries e
       set preferred_visit_date = p_date,
           preferred_visit_time = p_time,
           message = concat_ws(E'\n', e.message, note)
     where e.id = p_id and e.user_id = uid
       and e.enquiry_type = 'schedule_site_visit'
       and e.status in ('new', 'follow_up', 'site_visit_scheduled');
  end if;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'This site visit can no longer be changed here. Please contact us.' using errcode = '42501';
  end if;
  return query select p_date, p_time;
end;
$$;

revoke all on function public.reschedule_site_visit(text, uuid, date, time) from public, anon;
grant execute on function public.reschedule_site_visit(text, uuid, date, time) to authenticated;

-- Check (run separately):
-- select proname, proacl from pg_proc where proname in ('my_enquiries','reschedule_site_visit');
