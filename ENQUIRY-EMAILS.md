# Enquiry emails to the agent / relationship manager

Every new enquiry (residential or commercial) is emailed to the project's
**agent** and **relationship manager** (set on each project in the admin;
only active ones with an email). If a project has neither, it goes to
`app_settings.enquiry_email`. The enquiry's `assigned_agent_id` is filled
from the project's agent. Visitors who gave an email are set as Reply-To,
so the agent can just hit reply.

How it works: new enquiry row -> trigger (`supabase/17-enquiry-email.sql`)
-> Edge Function `supabase/functions/notify-enquiry` -> Brevo -> inbox.
The trigger only queues the call, so an enquiry never fails because of
email, and a 5-minute job retries any enquiry not yet mailed.

## One-time setup

1. **Brevo** (brevo.com, free: 300 mails/day)
   - Senders & IP > Domains: add `keys99.com` and add the DNS records Brevo
     shows (DKIM and the verification code; add them where keys99.com's DNS
     is, i.e. Cloudflare). Without this, mail may land in spam.
   - Senders: add `support@keys99.com` (or another address on the domain).
   - SMTP & API > API keys: create a key.
2. **Supabase > Edge Functions > Secrets**, add:
   - `BREVO_API_KEY` = the key from Brevo
   - `MAIL_FROM` = `support@keys99.com`
   - `ENQUIRY_NOTIFY_SECRET` = any long random string (keep a copy for step 4)
3. **Deploy the function** (Edge Functions > Deploy a new function > name
   `notify-enquiry`, paste `supabase/functions/notify-enquiry/index.ts`), and
   switch **Verify JWT** off for it (it checks its own secret instead).
4. **SQL Editor**: run
   `select vault.create_secret('<the same random string>', 'enquiry_notify_secret', 'notify-enquiry shared secret');`
   then run `supabase/17-enquiry-email.sql`.
5. Make sure each project has its agent / relationship manager set, and the
   agents and RMs have an email and status `active`.

## Check it

Place a test enquiry on a project, then:

```sql
select id, created_at, notified_at, assigned_agent_id
from public.residential_enquiries order by created_at desc limit 3;
select status_code, content from net._http_response order by created desc limit 3;
```

`notified_at` filled = mailed. Function logs: Supabase > Edge Functions >
notify-enquiry > Logs.
