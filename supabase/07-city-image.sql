-- =========================================================
-- KEYS99 - CITY PHOTO
--
-- city_image: the full web address (https://...) of a photo for
-- the city's card on the homepage, e.g. one uploaded to Supabase
-- Storage (open the file there and use "Get URL" / copy the public
-- URL). Leave empty to show the built-in monument illustration.
--
-- The build makes a small 640px copy of the photo for the card, so
-- uploading a large photo does not slow the homepage down.
--
-- Same access as the rest of the table: visitors can read active
-- cities; only admins can add or change them.
-- =========================================================

alter table public.cities
  add column if not exists city_image text;

alter table public.cities
  drop constraint if exists cities_city_image_url_check;
alter table public.cities
  add constraint cities_city_image_url_check
  check (city_image is null or city_image ~* '^https?://');
