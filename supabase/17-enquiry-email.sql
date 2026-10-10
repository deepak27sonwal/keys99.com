-- =========================================================
-- KEYS99 - EMAIL THE AGENT / RELATIONSHIP MANAGER ON EVERY ENQUIRY
--
-- A new row in residential_enquiries / commercial_enquiries calls the
-- Edge Function notify-enquiry (supabase/functions/notify-enquiry),
-- which emails the project's agent and relationship manager through
-- Brevo and fills assigned_agent_id. See ENQUIRY-EMAILS.md for setup.
--
--  * notified_at      set by the function once the mail is sent, so an
--                     enquiry is mailed once. Staff column: visitors
--                     cannot set it.
--  * trigger          fires after insert; it only queues the request
--                     (pg_net), so a visitor's enquiry never fails or
--                     waits because of email.
--  * cron, every 5 min  re-sends for enquiries from the last day that
--                     are still not notified (Brevo down, secret not yet
--                     set, ...).
--
-- Needs the Vault secret "enquiry_notify_secret" (same value as the
-- function's ENQUIRY_NOTIFY_SECRET). Until it exists nothing is sent
-- and nothing breaks:
--
--   select vault.create_secret('<long random string>', 'enquiry_notify_secret',
--     'Shared secret for the notify-enquiry Edge Function');
--
-- Run once in Supabase > SQL Editor. Safe to run again.
-- =========================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

alter table public.residential_enquiries add column if not exists notified_at timestamptz;
alter table public.commercial_enquiries  add column if not exists notified_at timestamptz;

-- Existing enquiries were handled by hand: do not mail them now.
update public.residential_enquiries set notified_at = now() where notified_at is null;
update public.commercial_enquiries  set notified_at = now() where notified_at is null;

create or replace function private.notify_enquiry_request(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'enquiry_notify_secret'
  limit 1;
  if secret is null then
    return;
  end if;

  perform net.http_post(
    url     := 'https://ljyywdgwjiedeiuqchdt.supabase.co/functions/v1/notify-enquiry',
    headers := jsonb_build_object('content-type', 'application/json', 'x-notify-secret', secret),
    body    := jsonb_build_object('kind', p_kind, 'id', p_id),
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function private.notify_enquiry_request(text, uuid) from public, anon, authenticated;

create or replace function private.notify_enquiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_enquiry_request(
    case tg_table_name when 'commercial_enquiries' then 'commercial' else 'residential' end,
    new.id);
  return null;
exception when others then
  raise warning 'notify_enquiry: %', sqlerrm;
  return null;
end;
$$;
revoke all on function private.notify_enquiry() from public, anon, authenticated;

drop trigger if exists notify_enquiry on public.residential_enquiries;
create trigger notify_enquiry
  after insert on public.residential_enquiries
  for each row execute function private.notify_enquiry();

drop trigger if exists notify_enquiry on public.commercial_enquiries;
create trigger notify_enquiry
  after insert on public.commercial_enquiries
  for each row execute function private.notify_enquiry();

-- Retry the ones that were not mailed (waits 2 minutes so the first
-- attempt can finish; gives up after a day).
create or replace function private.retry_enquiry_emails()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select 'residential' as kind, id from public.residential_enquiries
     where notified_at is null and created_at between now() - interval '1 day' and now() - interval '2 minutes'
    union all
    select 'commercial', id from public.commercial_enquiries
     where notified_at is null and created_at between now() - interval '1 day' and now() - interval '2 minutes'
    limit 20
  loop
    perform private.notify_enquiry_request(r.kind, r.id);
  end loop;
exception when others then
  raise warning 'retry_enquiry_emails: %', sqlerrm;
end;
$$;
revoke all on function private.retry_enquiry_emails() from public, anon, authenticated;

select cron.unschedule('retry-enquiry-emails')
 where exists (select 1 from cron.job where jobname = 'retry-enquiry-emails');
select cron.schedule('retry-enquiry-emails', '*/5 * * * *', 'select private.retry_enquiry_emails()');

-- Check (run separately):
--   select * from net._http_response order by created desc limit 5;   -- what the function answered
--   select id, created_at, notified_at, assigned_agent_id from public.residential_enquiries order by created_at desc limit 5;
