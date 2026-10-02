-- =========================================================
-- KEYS99 - REBUILD PROJECT PAGES AS SOON AS DATA CHANGES
--
-- When a published project (or anything shown on its page)
-- changes, ask GitHub to run .github/workflows/build-pages.yml
-- via a repository_dispatch event ("project-changed").
--
-- - Requests go through pg_net, which sends them only after the
--   transaction commits, so the build reads the saved data.
-- - A failed request is logged as a warning and never blocks
--   the save.
-- - Several changes in one save each send a request; GitHub's
--   workflow concurrency keeps only the newest pending build.
-- - The GitHub token lives in Supabase Vault (secret name
--   "github_dispatch_token"). Until it is added, the trigger
--   does nothing. Add it from the SQL editor:
--
--     select vault.create_secret(
--       '<fine-grained token>',
--       'github_dispatch_token',
--       'GitHub token: keys99.com repository_dispatch');
--
--   Token: GitHub -> Settings -> Developer settings ->
--   Fine-grained tokens. Repository access: only
--   deepak27sonwal/keys99.com. Permission: Contents = Read and
--   write. Nothing else.
-- =========================================================

create extension if not exists pg_net with schema extensions;

create or replace function private.request_site_build()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
  ignored text[] := array['view_count','updated_at','last_price_update_at','last_availability_update_at'];
begin
  /* residential_projects fires per row: only projects that are, or
     just stopped being, published matter, and a change that only
     touches counters or timestamps does not change the page. */
  if tg_table_name = 'residential_projects' then
    if coalesce(new.moderation_status, '') <> 'published'
       and coalesce(old.moderation_status, '') <> 'published' then
      return null;
    end if;
    if tg_op = 'UPDATE' and (to_jsonb(new) - ignored) = (to_jsonb(old) - ignored) then
      return null;
    end if;
  end if;

  select decrypted_secret into token
  from vault.decrypted_secrets
  where name = 'github_dispatch_token'
  limit 1;

  if coalesce(token, '') = '' then
    return null;
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/deepak27sonwal/keys99.com/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'keys99-supabase',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'event_type', 'project-changed',
      'client_payload', jsonb_build_object('table', tg_table_name, 'op', tg_op)
    )
  );

  return null;
exception when others then
  raise warning 'request_site_build: %', sqlerrm;
  return null;
end;
$$;

revoke all on function private.request_site_build() from public, anon, authenticated;


-- Projects: per row, filtered inside the function.
drop trigger if exists request_site_build on public.residential_projects;
create trigger request_site_build
  after insert or update or delete on public.residential_projects
  for each row execute function private.request_site_build();

-- Everything else shown on a project page: once per statement.
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
