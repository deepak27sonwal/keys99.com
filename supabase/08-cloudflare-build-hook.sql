-- =========================================================
-- KEYS99 - REBUILD THE SITE ON CLOUDFLARE WHEN DATA CHANGES
--
-- Replaces 02-instant-page-build.sql (GitHub), which was never
-- applied. Cloudflare Pages builds the site itself
-- (npm run build:cloudflare); this tells it when to.
--
-- How it works:
-- - Saving anything shown on the site (a published project, its
--   configurations, photos, amenities, FAQs, towers, developer,
--   agent, city or locality) only marks the site as "needs a
--   build". No web request is made inside the save, so a save can
--   never fail or slow down because of this.
-- - A pg_cron job checks every minute. Once edits have been quiet
--   for 2 minutes (or 10 minutes after the first unsent edit, if
--   someone keeps editing), it calls the Cloudflare deploy hook
--   once. A burst of edits becomes one build, which keeps well
--   inside Cloudflare's free build allowance.
-- - Once a day the site is rebuilt anyway, for anything that
--   depends on the date rather than on a save.
--
-- The deploy hook URL lives in Supabase Vault (secret name
-- "cloudflare_deploy_hook"). Until it is added nothing is sent;
-- the pending build is kept and goes out once the hook exists.
-- Add it from the SQL editor (see CLOUDFLARE.md for where to get it):
--
--   select vault.create_secret(
--     '<deploy hook URL from Cloudflare>',
--     'cloudflare_deploy_hook',
--     'Cloudflare Pages deploy hook: rebuild keys99.com');
--
-- Check what it is doing:   select * from private.site_build_queue;
-- Build now, by hand:       select private.send_site_build(true);
-- =========================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;


-- One row: is a build waiting, and when was the last one sent.
create table if not exists private.site_build_queue (
  id             boolean primary key default true check (id),
  requested_at   timestamptz,   -- first edit not yet sent
  last_change_at timestamptz,   -- most recent edit
  last_reason    text,          -- table and operation of that edit
  last_sent_at   timestamptz    -- last call to the deploy hook
);
insert into private.site_build_queue (id) values (true) on conflict do nothing;
revoke all on private.site_build_queue from public, anon, authenticated;


-- Trigger: mark the site as needing a build.
create or replace function private.request_site_build()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ignored text[] := array['view_count','updated_at','last_price_update_at','last_availability_update_at'];
begin
  /* residential_projects fires per row: only projects that are, or
     just stopped being, published matter, and a change that only
     touches counters or timestamps does not change any page. */
  if tg_table_name = 'residential_projects' then
    if coalesce(new.moderation_status, '') <> 'published'
       and coalesce(old.moderation_status, '') <> 'published' then
      return null;
    end if;
    if tg_op = 'UPDATE' and (to_jsonb(new) - ignored) = (to_jsonb(old) - ignored) then
      return null;
    end if;
  end if;

  update private.site_build_queue
     set requested_at   = coalesce(requested_at, now()),
         last_change_at = now(),
         last_reason    = tg_table_name || ' ' || lower(tg_op)
   where id;

  return null;
exception when others then
  raise warning 'request_site_build: %', sqlerrm;
  return null;
end;
$$;

revoke all on function private.request_site_build() from public, anon, authenticated;


-- Send the build request when it is due (or now, with force).
create or replace function private.send_site_build(force boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  q    private.site_build_queue;
  hook text;
begin
  /* The row lock makes an edit saved meanwhile wait, then queue a
     fresh build, rather than be lost between the check and the reset. */
  select * into q from private.site_build_queue where id for update;

  if not force then
    if q.requested_at is null then
      return 'nothing to build';
    end if;
    if q.last_change_at > now() - interval '2 minutes'
       and q.requested_at > now() - interval '10 minutes' then
      return 'waiting for edits to settle';
    end if;
  end if;

  select decrypted_secret into hook
  from vault.decrypted_secrets
  where name = 'cloudflare_deploy_hook'
  limit 1;

  if coalesce(hook, '') = '' then
    return 'no deploy hook saved yet';
  end if;

  /* pg_net sends it after this transaction commits. */
  perform net.http_post(
    url     := hook,
    body    := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  update private.site_build_queue
     set requested_at = null,
         last_sent_at = now()
   where id;

  return 'build requested';
end;
$$;

revoke all on function private.send_site_build(boolean) from public, anon, authenticated;


-- Projects: per row, filtered inside the function.
drop trigger if exists request_site_build on public.residential_projects;
create trigger request_site_build
  after insert or update or delete on public.residential_projects
  for each row execute function private.request_site_build();

-- Everything else shown on the site: once per statement.
do $$
declare
  t text;
begin
  foreach t in array array[
    'residential_configurations',
    'residential_media',
    'residential_amenities',
    'residential_nearby_locations',
    'residential_faqs',
    'residential_project_pros_cons',
    'residential_floor_plans',
    'residential_towers',
    'developers',
    'agents',
    'cities',
    'localities'
  ] loop
    execute format('drop trigger if exists request_site_build on public.%I', t);
    execute format(
      'create trigger request_site_build after insert or update or delete on public.%I
         for each statement execute function private.request_site_build()', t);
  end loop;
end $$;


-- Schedules (times in UTC). Re-running this file replaces them.
select cron.unschedule(jobid) from cron.job
 where jobname in ('keys99-site-build', 'keys99-daily-build');

-- Every minute: send a waiting build once edits have settled.
select cron.schedule('keys99-site-build', '* * * * *',
  $job$ select private.send_site_build(); $job$);

-- Daily at 21:47 UTC (03:17 IST): rebuild regardless.
select cron.schedule('keys99-daily-build', '47 21 * * *',
  $job$ select private.send_site_build(true); $job$);
