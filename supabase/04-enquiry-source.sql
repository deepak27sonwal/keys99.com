-- =========================================================
-- KEYS99 - WHERE EACH ENQUIRY CAME FROM
--
-- The website's enquiry form sends these along with the
-- enquiry (js/attribution.js + js/property-details.js):
--
--   page_url      the page the form was sent from
--   landing_page  the first page of the visit that brought them
--   referrer      the site that sent them (google.com, instagram.com...)
--   utm_source    } from tagged links, e.g. an ad or WhatsApp
--   utm_medium    } campaign link ending in
--   utm_campaign  } ?utm_source=whatsapp&utm_campaign=diwali
--
-- All optional, plain text, length-limited. Visitors can still
-- only INSERT enquiries (no read access), as before.
--
-- Until this runs, the form keeps working: it retries without
-- these fields if the database does not know them yet.
-- =========================================================

alter table public.residential_enquiries
  add column if not exists page_url     text,
  add column if not exists landing_page text,
  add column if not exists referrer     text,
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text;

alter table public.residential_enquiries
  drop constraint if exists residential_enquiries_tracking_length;
alter table public.residential_enquiries
  add constraint residential_enquiries_tracking_length check (
        coalesce(char_length(page_url), 0)     <= 500
    and coalesce(char_length(landing_page), 0) <= 500
    and coalesce(char_length(referrer), 0)     <= 500
    and coalesce(char_length(utm_source), 0)   <= 100
    and coalesce(char_length(utm_medium), 0)   <= 100
    and coalesce(char_length(utm_campaign), 0) <= 100
  );

grant insert (page_url, landing_page, referrer, utm_source, utm_medium, utm_campaign)
  on public.residential_enquiries to anon, authenticated;


-- ---------------------------------------------------------
-- Leads by source - run any time in the SQL Editor:
--
--   select coalesce(utm_source, referrer, 'direct') as source,
--          landing_page,
--          count(*) as enquiries
--   from public.residential_enquiries
--   where created_at > now() - interval '30 days'
--   group by 1, 2
--   order by enquiries desc;
-- ---------------------------------------------------------
