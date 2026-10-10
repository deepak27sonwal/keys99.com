-- =========================================================
-- KEYS99 - REBUILD THE SITE WHEN THESE PAGE SECTIONS CHANGE TOO
--
-- 08-cloudflare-build-hook.sql queues a Cloudflare build when a
-- published project or most of what its page shows changes. These
-- tables are also shown on project pages (project phases,
-- construction updates and their photos, RERA / legal documents and
-- litigation status) but had no trigger, so an edit there only
-- appeared at the daily 03:17 IST build. The old GitHub builder also
-- rebuilt every hour; with it retired, they need triggers too.
--
-- Safe to run more than once. Run it in the Supabase SQL Editor.
-- =========================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'residential_project_phases',
    'residential_construction_updates',
    'residential_construction_update_media',
    'residential_documents',
    'residential_litigation',
    'commercial_project_phases',
    'commercial_construction_updates',
    'commercial_construction_update_media',
    'commercial_documents',
    'commercial_litigation'
  ] loop
    execute format('drop trigger if exists request_site_build on public.%I', t);
    execute format(
      'create trigger request_site_build after insert or update or delete on public.%I
         for each statement execute function private.request_site_build()', t);
  end loop;
end $$;

-- Check: every table below should show has_trigger = true.
-- select table_name, exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
--          where c.relname = table_name and g.tgname = 'request_site_build') as has_trigger
--   from information_schema.tables
--  where table_schema = 'public'
--    and (table_name like 'residential\_%' or table_name like 'commercial\_%')
--    and table_name not like '%enquiries' and table_name not like '%moderation_history'
--  order by has_trigger, table_name;
